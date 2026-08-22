import {
  UnavailableEvidenceStatus,
} from '@geo-lens/evidence';

export const AMSTERDAM_WATERNET_WFS_URL =
  'https://api.data.amsterdam.nl/v1/wfs/leidingeninfrastructuur/';

export const AMSTERDAM_WATERNET_NODE_TYPE_NAME =
  'app:waternet_rioolknopen';
export const AMSTERDAM_WATERNET_PIPE_TYPE_NAME =
  'app:waternet_rioolleidingen';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_SPAN_DEGREES = 0.01;
const MAX_FEATURES_PER_LAYER = 500;

export interface AmsterdamWaternetBbox {
  readonly latMin: number;
  readonly lonMin: number;
  readonly latMax: number;
  readonly lonMax: number;
}

export interface AmsterdamWaternetWfsRequest {
  readonly bbox: AmsterdamWaternetBbox;
}

export interface AmsterdamWaternetTransportResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface AmsterdamWaternetTransport {
  getJson(
    url: string,
    timeoutMs: number,
  ): Promise<AmsterdamWaternetTransportResponse>;
}

export interface AmsterdamWaternetWfsClientOptions {
  readonly transport?: AmsterdamWaternetTransport;
  readonly timeoutMs?: number;
  readonly maxSpanDegrees?: number;
  readonly now?: () => Date;
}

export interface AmsterdamWaternetAcquisitionReceipt {
  readonly provider: 'Gemeente Amsterdam Data API';
  readonly dataset: 'Leidingeninfrastructuur';
  readonly acquiredAt: string;
  readonly bboxWfsAxisOrder: string;
  readonly nodeUrl: string;
  readonly pipeUrl: string;
}

export interface AvailableAmsterdamWaternetAcquisition {
  readonly status: 'available';
  readonly receipt: AmsterdamWaternetAcquisitionReceipt;
  readonly snapshot: {
    readonly metadata: {
      readonly provider: 'Gemeente Amsterdam Data API';
      readonly sourceOrganization: 'Waternet';
      readonly dataset: 'Leidingeninfrastructuur';
      readonly documentationUrl:
        'https://api.data.amsterdam.nl/v1/docs/datasets/leidingeninfrastructuur.html';
      readonly wfsUrl:
        'https://api.data.amsterdam.nl/v1/wfs/leidingeninfrastructuur/';
      readonly nodeTypeName:
        'app:waternet_rioolknopen';
      readonly pipeTypeName:
        'app:waternet_rioolleidingen';
      readonly bboxWfsAxisOrder: string;
      readonly sourceCrs: 'EPSG:7415';
      readonly outputCrs: 'EPSG:4326';
      readonly acquiredAt: string;
      readonly retrievalMode: 'live';
    };
    readonly nodes: unknown;
    readonly pipes: unknown;
  };
}

export interface UnavailableAmsterdamWaternetAcquisition {
  readonly status: UnavailableEvidenceStatus;
  readonly missingReason: string;
  readonly failedLayer: 'nodes' | 'pipes' | 'both';
  readonly receipt: AmsterdamWaternetAcquisitionReceipt;
}

export type AmsterdamWaternetAcquisition =
  | AvailableAmsterdamWaternetAcquisition
  | UnavailableAmsterdamWaternetAcquisition;

export class FetchAmsterdamWaternetTransport
implements AmsterdamWaternetTransport {
  async getJson(
    url: string,
    timeoutMs: number,
  ): Promise<AmsterdamWaternetTransportResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/geo+json, application/json',
        },
        signal: controller.signal,
      });
      let body: unknown;

      try {
        body = await response.json();
      } catch {
        body = null;
      }

      return {
        status: response.status,
        body,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class AmsterdamWaternetWfsClient {
  private readonly transport: AmsterdamWaternetTransport;
  private readonly timeoutMs: number;
  private readonly maxSpanDegrees: number;
  private readonly now: () => Date;

  constructor(
    options: AmsterdamWaternetWfsClientOptions = {},
  ) {
    this.transport =
      options.transport ??
      new FetchAmsterdamWaternetTransport();
    this.timeoutMs =
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxSpanDegrees =
      options.maxSpanDegrees ??
      DEFAULT_MAX_SPAN_DEGREES;
    this.now = options.now ?? (() => new Date());

    if (
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs <= 0
    ) {
      throw new Error(
        'Waternet timeoutMs must be a finite positive number',
      );
    }

    if (
      !Number.isFinite(this.maxSpanDegrees) ||
      this.maxSpanDegrees <= 0
    ) {
      throw new Error(
        'Waternet maxSpanDegrees must be a finite positive number',
      );
    }
  }

  async acquire(
    request: AmsterdamWaternetWfsRequest,
  ): Promise<AmsterdamWaternetAcquisition> {
    validateBbox(
      request.bbox,
      this.maxSpanDegrees,
    );
    const acquiredAt = this.now().toISOString();
    const bboxWfsAxisOrder = bboxString(
      request.bbox,
    );
    const nodeUrl = featureUrl(
      AMSTERDAM_WATERNET_NODE_TYPE_NAME,
      bboxWfsAxisOrder,
    );
    const pipeUrl = featureUrl(
      AMSTERDAM_WATERNET_PIPE_TYPE_NAME,
      bboxWfsAxisOrder,
    );
    const receipt: AmsterdamWaternetAcquisitionReceipt = {
      provider: 'Gemeente Amsterdam Data API',
      dataset: 'Leidingeninfrastructuur',
      acquiredAt,
      bboxWfsAxisOrder,
      nodeUrl,
      pipeUrl,
    };
    let nodeResponse: AmsterdamWaternetTransportResponse;
    let pipeResponse: AmsterdamWaternetTransportResponse;

    try {
      [nodeResponse, pipeResponse] =
        await Promise.all([
          this.transport.getJson(
            nodeUrl,
            this.timeoutMs,
          ),
          this.transport.getJson(
            pipeUrl,
            this.timeoutMs,
          ),
        ]);
    } catch (error) {
      return {
        status: 'upstream_error',
        missingReason:
          `Waternet WFS request failed: ${errorMessage(error)}`,
        failedLayer: 'both',
        receipt,
      };
    }

    const nodeFailure = responseFailure(
      nodeResponse,
      'nodes',
    );
    const pipeFailure = responseFailure(
      pipeResponse,
      'pipes',
    );

    if (nodeFailure !== null || pipeFailure !== null) {
      const failures = [
        nodeFailure,
        pipeFailure,
      ].filter(
        (failure): failure is LayerFailure =>
          failure !== null,
      );
      const status = highestPriorityStatus(
        failures.map((failure) => failure.status),
      );

      return {
        status,
        missingReason: failures
          .map((failure) => failure.reason)
          .join('; '),
        failedLayer:
          failures.length === 2
            ? 'both'
            : failures[0].layer,
        receipt,
      };
    }

    const nodeCount = featureCount(
      nodeResponse.body,
    );
    const pipeCount = featureCount(
      pipeResponse.body,
    );

    if (nodeCount === 0 || pipeCount === 0) {
      return {
        status: 'out_of_coverage',
        missingReason:
          `Waternet WFS returned ${nodeCount} node features and ${pipeCount} pipe features for the bounded request`,
        failedLayer:
          nodeCount === 0 && pipeCount === 0
            ? 'both'
            : nodeCount === 0
              ? 'nodes'
              : 'pipes',
        receipt,
      };
    }

    return {
      status: 'available',
      receipt,
      snapshot: {
        metadata: {
          provider: 'Gemeente Amsterdam Data API',
          sourceOrganization: 'Waternet',
          dataset: 'Leidingeninfrastructuur',
          documentationUrl:
            'https://api.data.amsterdam.nl/v1/docs/datasets/leidingeninfrastructuur.html',
          wfsUrl: AMSTERDAM_WATERNET_WFS_URL,
          nodeTypeName:
            AMSTERDAM_WATERNET_NODE_TYPE_NAME,
          pipeTypeName:
            AMSTERDAM_WATERNET_PIPE_TYPE_NAME,
          bboxWfsAxisOrder,
          sourceCrs: 'EPSG:7415',
          outputCrs: 'EPSG:4326',
          acquiredAt,
          retrievalMode: 'live',
        },
        nodes: nodeResponse.body,
        pipes: pipeResponse.body,
      },
    };
  }
}

interface LayerFailure {
  readonly layer: 'nodes' | 'pipes';
  readonly status: UnavailableEvidenceStatus;
  readonly reason: string;
}

function responseFailure(
  response: AmsterdamWaternetTransportResponse,
  layer: 'nodes' | 'pipes',
): LayerFailure | null {
  if (response.status !== 200) {
    return {
      layer,
      status: statusForHttp(response.status),
      reason:
        `Waternet ${layer} WFS returned HTTP ${response.status}`,
    };
  }

  if (!isFeatureCollection(response.body)) {
    return {
      layer,
      status: 'invalid_response',
      reason:
        `Waternet ${layer} WFS did not return a GeoJSON FeatureCollection`,
    };
  }

  const record = response.body as Record<string, unknown>;
  const matched = optionalNonNegativeInteger(
    record.numberMatched,
  );
  const returned = optionalNonNegativeInteger(
    record.numberReturned,
  );

  if (
    matched !== null &&
    returned !== null &&
    matched > returned
  ) {
    return {
      layer,
      status: 'invalid_response',
      reason:
        `Waternet ${layer} WFS response was truncated: ${returned}/${matched} features returned`,
    };
  }

  return null;
}

function statusForHttp(
  status: number,
): UnavailableEvidenceStatus {
  if (status === 401 || status === 403) {
    return 'auth_required';
  }

  if (status === 429) {
    return 'rate_limited';
  }

  if (status === 404) {
    return 'out_of_coverage';
  }

  if (status >= 400 && status < 500) {
    return 'invalid_response';
  }

  return 'upstream_error';
}

function highestPriorityStatus(
  statuses: readonly UnavailableEvidenceStatus[],
): UnavailableEvidenceStatus {
  const priority: readonly UnavailableEvidenceStatus[] = [
    'auth_required',
    'rate_limited',
    'upstream_error',
    'invalid_response',
    'out_of_coverage',
    'incomplete_window',
    'stale',
    'missing',
  ];

  return (
    priority.find((status) =>
      statuses.includes(status),
    ) ?? 'upstream_error'
  );
}

function featureUrl(
  typeName: string,
  bboxWfsAxisOrder: string,
): string {
  const query = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    bbox: bboxWfsAxisOrder,
    count: String(MAX_FEATURES_PER_LAYER),
  });

  return `${AMSTERDAM_WATERNET_WFS_URL}?${query.toString()}`;
}

function bboxString(
  bbox: AmsterdamWaternetBbox,
): string {
  return [
    bbox.latMin,
    bbox.lonMin,
    bbox.latMax,
    bbox.lonMax,
    'EPSG:4326',
  ].join(',');
}

function validateBbox(
  bbox: AmsterdamWaternetBbox,
  maxSpanDegrees: number,
): void {
  for (const [name, value, minimum, maximum] of [
    ['latMin', bbox.latMin, -90, 90],
    ['latMax', bbox.latMax, -90, 90],
    ['lonMin', bbox.lonMin, -180, 180],
    ['lonMax', bbox.lonMax, -180, 180],
  ] as const) {
    if (
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new Error(
        `Waternet bbox ${name} must be finite and within ${minimum}..${maximum}`,
      );
    }
  }

  if (
    bbox.latMin >= bbox.latMax ||
    bbox.lonMin >= bbox.lonMax
  ) {
    throw new Error(
      'Waternet bbox minimums must be below maximums',
    );
  }

  if (
    bbox.latMax - bbox.latMin >
      maxSpanDegrees ||
    bbox.lonMax - bbox.lonMin >
      maxSpanDegrees
  ) {
    throw new Error(
      `Waternet bbox exceeds the ${maxSpanDegrees} degree bounded-area limit`,
    );
  }
}

function isFeatureCollection(
  value: unknown,
): boolean {
  return (
    isRecord(value) &&
    value.type === 'FeatureCollection' &&
    Array.isArray(value.features)
  );
}

function featureCount(value: unknown): number {
  return isFeatureCollection(value)
    ? (value as { readonly features: readonly unknown[] })
        .features.length
    : 0;
}

function optionalNonNegativeInteger(
  value: unknown,
): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
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
