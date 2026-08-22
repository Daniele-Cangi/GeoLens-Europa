import {
  assertEvidenceInvariant,
  EVIDENCE_STATUSES,
  Evidence,
  EvidenceStatus,
  unavailableEvidence,
  UnavailableEvidenceStatus,
} from '@geo-lens/evidence';
import { isValidCell } from 'h3-js';

export type ImergWindowHours = 24 | 72;

export interface ImergRequest {
  readonly h3Indices: readonly string[];
  readonly referenceTime: Date;
  readonly windowHours: readonly ImergWindowHours[];
}

export interface ImergWindowSummary {
  readonly windowHours: ImergWindowHours;
  readonly status: EvidenceStatus;
  readonly missingReason?: string;
  readonly product: string;
  readonly runType: 'late' | 'early' | null;
  readonly datasetVersion: string;
  readonly requestedWindow: {
    readonly start: string;
    readonly end: string;
  };
  readonly actualWindow: {
    readonly start: string;
    readonly end: string;
  } | null;
  readonly expectedGranuleCount: number;
  readonly searchedGranuleCount: number;
  readonly granuleCount: number;
  readonly granuleTimestamps: readonly string[];
  readonly sourceResolution: string;
  readonly samplingMethod: string;
  readonly cached: boolean;
}

export interface ImergWindowEvidence {
  readonly summary: ImergWindowSummary;
  readonly cells: Readonly<Record<string, Evidence<number>>>;
}

export interface ImergProviderResult {
  readonly provider: 'NASA GES DISC';
  readonly datasetFamily: 'GPM IMERG';
  readonly contractVersion: string;
  readonly referenceTime: string;
  readonly acquiredAt: string;
  readonly windows: Readonly<
    Partial<Record<ImergWindowHours, ImergWindowEvidence>>
  >;
}

export interface ImergTransportResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface ImergTransport {
  postJson(
    url: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<ImergTransportResponse>;
}

export interface NasaImergClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly transport?: ImergTransport;
  readonly now?: () => Date;
}

export class FetchImergTransport implements ImergTransport {
  async postJson(
    url: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<ImergTransportResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let responseBody: unknown;

      try {
        responseBody = await response.json();
      } catch {
        responseBody = null;
      }

      return {
        status: response.status,
        body: responseBody,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * The sole TypeScript production IMERG boundary.
 *
 * It never acquires or parses IMERG itself. It validates evidence returned by
 * the Python earthaccess + xarray service and converts transport failures into
 * explicit unavailable evidence.
 */
export class NasaImergClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly transport: ImergTransport;
  private readonly now: () => Date;

  constructor(options: NasaImergClientOptions) {
    if (options.baseUrl.trim().length === 0) {
      throw new Error('IMERG service baseUrl must be non-empty');
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.transport = options.transport ?? new FetchImergTransport();
    this.now = options.now ?? (() => new Date());

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('IMERG timeoutMs must be a finite positive number');
    }
  }

  async getEvidence(
    request: ImergRequest,
  ): Promise<ImergProviderResult> {
    validateRequest(request);
    const normalizedReferenceTime = normalizeReferenceTime(
      request.referenceTime,
    );
    const acquiredAt = this.now().toISOString();
    let response: ImergTransportResponse;

    try {
      response = await this.transport.postJson(
        `${this.baseUrl}/precip/h3`,
        {
          h3_indices: [...request.h3Indices],
          reference_time: normalizedReferenceTime.toISOString(),
          window_hours: [...request.windowHours],
        },
        this.timeoutMs,
      );
    } catch (error) {
      return failureResult(
        request,
        normalizedReferenceTime,
        acquiredAt,
        'upstream_error',
        `IMERG service request failed: ${errorMessage(error)}`,
      );
    }

    if (response.status !== 200) {
      const status = statusForHttp(response.status);

      return failureResult(
        request,
        normalizedReferenceTime,
        acquiredAt,
        status,
        `IMERG service returned HTTP ${response.status}`,
      );
    }

    return parseProviderResponse(
      response.body,
      request,
      normalizedReferenceTime,
      acquiredAt,
    );
  }
}

function parseProviderResponse(
  raw: unknown,
  request: ImergRequest,
  requestedReferenceTime: Date,
  fallbackAcquiredAt: string,
): ImergProviderResult {
  if (!isRecord(raw) || !Array.isArray(raw.windows)) {
    return failureResult(
      request,
      requestedReferenceTime,
      fallbackAcquiredAt,
      'invalid_response',
      'IMERG service response lacks a windows array',
    );
  }

  const referenceTime = validTimestamp(raw.referenceTime)
    ? raw.referenceTime
    : requestedReferenceTime.toISOString();
  const acquiredAt = validTimestamp(raw.acquiredAt)
    ? raw.acquiredAt
    : fallbackAcquiredAt;
  const contractVersion =
    typeof raw.contractVersion === 'string' &&
    raw.contractVersion.trim().length > 0
      ? raw.contractVersion
      : 'invalid-or-missing';
  const windows: Partial<
    Record<ImergWindowHours, ImergWindowEvidence>
  > = {};

  for (const hours of request.windowHours) {
    const candidates = raw.windows.filter(
      (value) =>
        isRecord(value) && value.windowHours === hours,
    );

    if (candidates.length !== 1) {
      windows[hours] = failureWindow(
        request.h3Indices,
        requestedReferenceTime,
        hours,
        acquiredAt,
        'invalid_response',
        `Expected one ${hours}h IMERG window, received ${candidates.length}`,
      );
      continue;
    }

    windows[hours] = parseWindow(
      candidates[0],
      request.h3Indices,
      requestedReferenceTime,
      hours,
      acquiredAt,
    );
  }

  return {
    provider: 'NASA GES DISC',
    datasetFamily: 'GPM IMERG',
    contractVersion,
    referenceTime,
    acquiredAt,
    windows,
  };
}

function parseWindow(
  raw: Record<string, unknown>,
  h3Indices: readonly string[],
  requestedReferenceTime: Date,
  hours: ImergWindowHours,
  acquiredAt: string,
): ImergWindowEvidence {
  const summary = parseWindowSummary(raw, hours);

  if (summary === null || !Array.isArray(raw.cells)) {
    return failureWindow(
      h3Indices,
      requestedReferenceTime,
      hours,
      acquiredAt,
      'invalid_response',
      `IMERG ${hours}h window metadata is invalid`,
    );
  }

  const rawCells = raw.cells;
  const cellMap = new Map<string, Record<string, unknown>>();
  let structuralError: string | null = null;

  for (const rawCell of rawCells) {
    if (
      !isRecord(rawCell) ||
      typeof rawCell.h3 !== 'string' ||
      !isRecord(rawCell.rainfallMm)
    ) {
      structuralError =
        'IMERG window contains a malformed cell payload';
      break;
    }

    if (cellMap.has(rawCell.h3)) {
      structuralError =
        `IMERG window contains duplicate cell ${rawCell.h3}`;
      break;
    }

    cellMap.set(rawCell.h3, rawCell.rainfallMm);
  }

  const expectedCells = new Set(h3Indices);
  const unexpectedCells = [...cellMap.keys()].filter(
    (h3) => !expectedCells.has(h3),
  );

  if (unexpectedCells.length > 0) {
    structuralError =
      `IMERG window contains unexpected cells: ${unexpectedCells.join(', ')}`;
  }

  if (structuralError !== null) {
    return failureWindow(
      h3Indices,
      requestedReferenceTime,
      hours,
      acquiredAt,
      'invalid_response',
      structuralError,
    );
  }

  const cells: Record<string, Evidence<number>> = {};

  for (const h3 of h3Indices) {
    const rawEvidence = cellMap.get(h3);

    if (rawEvidence === undefined) {
      cells[h3] = failureEvidence(
        h3,
        requestedReferenceTime,
        hours,
        acquiredAt,
        'invalid_response',
        `IMERG response omitted requested cell ${h3}`,
      );
      continue;
    }

    const parsed = parseEvidence(rawEvidence, h3);

    cells[h3] =
      parsed.evidence ??
      failureEvidence(
        h3,
        requestedReferenceTime,
        hours,
        acquiredAt,
        'invalid_response',
        parsed.error ?? 'Invalid IMERG evidence',
      );
  }

  return {
    summary,
    cells,
  };
}

function parseEvidence(
  raw: Record<string, unknown>,
  expectedH3: string,
): {
  readonly evidence?: Evidence<number>;
  readonly error?: string;
} {
  if (
    !isRecord(raw.spatial) ||
    !isRecord(raw.temporal) ||
    !isRecord(raw.provenance) ||
    !isRecord(raw.quality)
  ) {
    return {
      error: `IMERG evidence for ${expectedH3} lacks canonical sections`,
    };
  }

  if (raw.spatial.h3 !== expectedH3) {
    return {
      error:
        `IMERG evidence H3 ${String(raw.spatial.h3)} does not match ${expectedH3}`,
    };
  }

  if (raw.unit !== 'mm') {
    return {
      error: `IMERG evidence for ${expectedH3} must use mm`,
    };
  }

  if (
    raw.quality.status === 'synthetic_fixture' ||
    typeof raw.quality.status !== 'string'
  ) {
    return {
      error:
        `Production IMERG response has invalid status ${String(raw.quality.status)}`,
    };
  }

  if (
    raw.value !== null &&
    (typeof raw.value !== 'number' ||
      !Number.isFinite(raw.value) ||
      raw.value < 0)
  ) {
    return {
      error:
        `IMERG evidence for ${expectedH3} has an invalid numeric value`,
    };
  }

  const evidence = raw as unknown as Evidence<number>;

  try {
    assertEvidenceInvariant(evidence);
  } catch (error) {
    return {
      error:
        `IMERG evidence for ${expectedH3} violates invariants: ${errorMessage(error)}`,
    };
  }

  return { evidence };
}

function parseWindowSummary(
  raw: Record<string, unknown>,
  expectedHours: ImergWindowHours,
): ImergWindowSummary | null {
  if (
    raw.windowHours !== expectedHours ||
    typeof raw.status !== 'string' ||
    !EVIDENCE_STATUSES.includes(
      raw.status as EvidenceStatus,
    ) ||
    raw.status === 'synthetic_fixture' ||
    typeof raw.product !== 'string' ||
    !(
      raw.runType === 'late' ||
      raw.runType === 'early' ||
      raw.runType === null
    ) ||
    typeof raw.datasetVersion !== 'string' ||
    !isTimestampRange(raw.requestedWindow) ||
    !(
      raw.actualWindow === null ||
      isTimestampRange(raw.actualWindow)
    ) ||
    !nonNegativeInteger(raw.expectedGranuleCount) ||
    !nonNegativeInteger(raw.searchedGranuleCount) ||
    !nonNegativeInteger(raw.granuleCount) ||
    !Array.isArray(raw.granuleTimestamps) ||
    !raw.granuleTimestamps.every(validTimestamp) ||
    typeof raw.sourceResolution !== 'string' ||
    typeof raw.samplingMethod !== 'string' ||
    typeof raw.cached !== 'boolean'
  ) {
    return null;
  }

  return raw as unknown as ImergWindowSummary;
}

function failureResult(
  request: ImergRequest,
  referenceTime: Date,
  acquiredAt: string,
  status: UnavailableEvidenceStatus,
  reason: string,
): ImergProviderResult {
  const windows: Partial<
    Record<ImergWindowHours, ImergWindowEvidence>
  > = {};

  for (const hours of request.windowHours) {
    windows[hours] = failureWindow(
      request.h3Indices,
      referenceTime,
      hours,
      acquiredAt,
      status,
      reason,
    );
  }

  return {
    provider: 'NASA GES DISC',
    datasetFamily: 'GPM IMERG',
    contractVersion: 'imerg-client-failure-v0.1.0',
    referenceTime: referenceTime.toISOString(),
    acquiredAt,
    windows,
  };
}

function failureWindow(
  h3Indices: readonly string[],
  referenceTime: Date,
  hours: ImergWindowHours,
  acquiredAt: string,
  status: UnavailableEvidenceStatus,
  reason: string,
): ImergWindowEvidence {
  const start = new Date(
    referenceTime.getTime() - hours * 60 * 60 * 1000,
  );
  const cells = Object.fromEntries(
    h3Indices.map((h3) => [
      h3,
      failureEvidence(
        h3,
        referenceTime,
        hours,
        acquiredAt,
        status,
        reason,
      ),
    ]),
  );

  return {
    summary: {
      windowHours: hours,
      status,
      missingReason: reason,
      product: 'GPM IMERG',
      runType: null,
      datasetVersion: '07',
      requestedWindow: {
        start: start.toISOString(),
        end: referenceTime.toISOString(),
      },
      actualWindow: null,
      expectedGranuleCount: hours * 2,
      searchedGranuleCount: 0,
      granuleCount: 0,
      granuleTimestamps: [],
      sourceResolution: '0.1 degree',
      samplingMethod:
        'nearest IMERG grid cell at H3 centroid',
      cached: false,
    },
    cells,
  };
}

function failureEvidence(
  h3: string,
  referenceTime: Date,
  hours: ImergWindowHours,
  acquiredAt: string,
  status: UnavailableEvidenceStatus,
  reason: string,
): Evidence<number> {
  const start = new Date(
    referenceTime.getTime() - hours * 60 * 60 * 1000,
  );

  return unavailableEvidence(
    status,
    reason,
    {
      unit: 'mm',
      spatial: {
        h3,
        sourceResolution: '0.1 degree',
      },
      temporal: {
        observedAt: referenceTime.toISOString(),
        windowStart: start.toISOString(),
        windowEnd: referenceTime.toISOString(),
        acquiredAt,
      },
      provenance: {
        provider: 'NASA GES DISC',
        dataset: 'GPM IMERG',
        datasetVersion: '07',
        transformation:
          'canonical Python IMERG service request',
        transformationVersion: 'imerg-client-v0.1.0',
        samplingMethod:
          'nearest IMERG grid cell at H3 centroid',
      },
    },
  );
}

function validateRequest(request: ImergRequest): void {
  if (request.h3Indices.length === 0) {
    throw new Error('IMERG request requires at least one H3 cell');
  }

  const invalidCells = request.h3Indices.filter(
    (h3) => !isValidCell(h3),
  );

  if (invalidCells.length > 0) {
    throw new Error(
      `IMERG request contains invalid H3 cells: ${invalidCells.join(', ')}`,
    );
  }

  if (new Set(request.h3Indices).size !== request.h3Indices.length) {
    throw new Error('IMERG request contains duplicate H3 cells');
  }

  if (request.windowHours.length === 0) {
    throw new Error('IMERG request requires at least one window');
  }

  if (
    new Set(request.windowHours).size !==
    request.windowHours.length
  ) {
    throw new Error('IMERG request contains duplicate windows');
  }

  if (Number.isNaN(request.referenceTime.getTime())) {
    throw new Error('IMERG referenceTime must be valid');
  }
}

function normalizeReferenceTime(value: Date): Date {
  const normalized = new Date(value.getTime());
  normalized.setUTCMinutes(
    Math.floor(normalized.getUTCMinutes() / 30) * 30,
    0,
    0,
  );
  return normalized;
}

function statusForHttp(
  statusCode: number,
): UnavailableEvidenceStatus {
  if (statusCode === 401 || statusCode === 403) {
    return 'auth_required';
  }

  if (statusCode === 429) {
    return 'rate_limited';
  }

  if (statusCode >= 400 && statusCode < 500) {
    return 'invalid_response';
  }

  return 'upstream_error';
}

function isTimestampRange(
  value: unknown,
): value is { readonly start: string; readonly end: string } {
  return (
    isRecord(value) &&
    validTimestamp(value.start) &&
    validTimestamp(value.end) &&
    Date.parse(value.start) <= Date.parse(value.end)
  );
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
