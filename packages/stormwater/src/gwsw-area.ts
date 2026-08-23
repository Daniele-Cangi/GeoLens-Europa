import {
  UnavailableEvidenceStatus,
} from '@geo-lens/evidence';

import { AmsterdamWaternetBbox } from './amsterdam-wfs';
import { GeoPoint } from './network';

export const PDOK_GWSW_AREA_URL =
  'https://api.pdok.nl/rioned/beheer-stedelijk-watersystemen-gwsw/ogc/v1/collections/beheergebied/items';
export const GWSW_OUTFALL_AREA_LINK_VERSION =
  'gwsw-outfall-area-link-v0.1.0';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_SPAN_DEGREES = 0.01;
const MAX_FEATURES = 100;
const MAX_COORDINATE_POSITIONS = 100_000;

export type GwswAreaType =
  | 'rioleringsgebied'
  | 'zuiveringseenheid'
  | 'other';

export type GwswPosition = readonly [number, number];
export type GwswLinearRing = readonly GwswPosition[];
export type GwswPolygon = readonly GwswLinearRing[];
export type GwswMultiPolygon = readonly GwswPolygon[];

export interface GwswArea {
  readonly featureId: string;
  readonly name: string;
  readonly areaType: GwswAreaType;
  readonly sourceTypeName: string;
  readonly sourceTypeUri: string;
  readonly sourceDatasetUrl: string;
  readonly sourceUri: string;
  readonly geometry: {
    readonly type: 'MultiPolygon';
    readonly coordinates: GwswMultiPolygon;
  };
}

export interface PdokGwswAreaReceipt {
  readonly provider: 'PDOK';
  readonly publisher: 'Stichting RIONED';
  readonly dataset: 'Stedelijk Water (Riolering)';
  readonly collection: 'beheergebied';
  readonly license: 'CC0 1.0';
  readonly acquiredAt: string;
  readonly responseTimestamp: string | null;
  readonly requestUrl: string;
  readonly requestedBboxCrs84: string;
  readonly sourceCrs: 'OGC:CRS84';
  readonly outputCrs: 'OGC:CRS84';
  readonly featureCount: number;
  readonly rioleringsgebiedCount: number;
  readonly documentationUrl:
    'https://www.pdok.nl/introductie/-/article/stedelijk-water-riolering-';
}

export interface AvailablePdokGwswAreaAcquisition {
  readonly status: 'available';
  readonly receipt: PdokGwswAreaReceipt;
  readonly areas: readonly GwswArea[];
}

export interface UnavailablePdokGwswAreaAcquisition {
  readonly status: UnavailableEvidenceStatus;
  readonly missingReason: string;
  readonly receipt: PdokGwswAreaReceipt;
  readonly areas: readonly [];
}

export type PdokGwswAreaAcquisition =
  | AvailablePdokGwswAreaAcquisition
  | UnavailablePdokGwswAreaAcquisition;

export interface PdokGwswTransportResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface PdokGwswTransport {
  getJson(
    url: string,
    timeoutMs: number,
  ): Promise<PdokGwswTransportResponse>;
}

export class FetchPdokGwswTransport
implements PdokGwswTransport {
  async getJson(
    url: string,
    timeoutMs: number,
  ): Promise<PdokGwswTransportResponse> {
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

export class PdokGwswAreaClient {
  private readonly transport: PdokGwswTransport;
  private readonly timeoutMs: number;
  private readonly maxSpanDegrees: number;
  private readonly now: () => Date;

  constructor(options: {
    readonly transport?: PdokGwswTransport;
    readonly timeoutMs?: number;
    readonly maxSpanDegrees?: number;
    readonly now?: () => Date;
  } = {}) {
    this.transport =
      options.transport ?? new FetchPdokGwswTransport();
    this.timeoutMs =
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxSpanDegrees =
      options.maxSpanDegrees ?? DEFAULT_MAX_SPAN_DEGREES;
    this.now = options.now ?? (() => new Date());

    if (
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs <= 0
    ) {
      throw new Error(
        'PDOK GWSW timeoutMs must be a finite positive number',
      );
    }

    if (
      !Number.isFinite(this.maxSpanDegrees) ||
      this.maxSpanDegrees <= 0
    ) {
      throw new Error(
        'PDOK GWSW maxSpanDegrees must be a finite positive number',
      );
    }
  }

  async acquire(request: {
    readonly bbox: AmsterdamWaternetBbox;
  }): Promise<PdokGwswAreaAcquisition> {
    validateBbox(request.bbox, this.maxSpanDegrees);
    const acquiredAt = this.now().toISOString();
    const requestedBboxCrs84 = bboxString(request.bbox);
    const requestUrl = areaUrl(requestedBboxCrs84);
    const emptyReceipt = receipt({
      acquiredAt,
      requestUrl,
      requestedBboxCrs84,
      responseTimestamp: null,
      areas: [],
    });
    let response: PdokGwswTransportResponse;

    try {
      response = await this.transport.getJson(
        requestUrl,
        this.timeoutMs,
      );
    } catch (error) {
      return {
        status: 'upstream_error',
        missingReason:
          'PDOK GWSW area request failed: ' +
          errorMessage(error),
        receipt: emptyReceipt,
        areas: [],
      };
    }

    if (response.status !== 200) {
      return {
        status: statusForHttp(response.status),
        missingReason:
          'PDOK GWSW area request returned HTTP ' +
          response.status,
        receipt: emptyReceipt,
        areas: [],
      };
    }

    let parsed: {
      readonly responseTimestamp: string | null;
      readonly areas: readonly GwswArea[];
    };

    try {
      parsed = parseFeatureCollection(response.body);
    } catch (error) {
      return {
        status: 'invalid_response',
        missingReason:
          'PDOK GWSW area response is invalid: ' +
          errorMessage(error),
        receipt: emptyReceipt,
        areas: [],
      };
    }

    const parsedReceipt = receipt({
      acquiredAt,
      requestUrl,
      requestedBboxCrs84,
      responseTimestamp: parsed.responseTimestamp,
      areas: parsed.areas,
    });

    if (parsed.areas.length === 0) {
      return {
        status: 'out_of_coverage',
        missingReason:
          'PDOK GWSW returned no management areas for the bounded request',
        receipt: parsedReceipt,
        areas: [],
      };
    }

    return {
      status: 'available',
      receipt: parsedReceipt,
      areas: parsed.areas,
    };
  }
}

export interface GwswOutfallAreaContext {
  readonly modelVersion: typeof GWSW_OUTFALL_AREA_LINK_VERSION;
  readonly status:
    | 'unresolved_no_published_crosswalk'
    | 'out_of_coverage'
    | UnavailableEvidenceStatus;
  readonly outfallNodeId: string;
  readonly outfallPosition: GeoPoint;
  readonly waternetPumpingAreaReference: {
    readonly sourceField: 'bemalingsgebied';
    readonly value: string | null;
    readonly semantics: 'source_identifier_only';
    readonly gwswCrosswalk: 'not_published';
  };
  readonly containingAreas: readonly GwswArea[];
  readonly containingRioleringsgebieden: readonly GwswArea[];
  readonly attachment: {
    readonly eligible: false;
    readonly catchmentAttachmentCreated: false;
    readonly method:
      'point_in_observed_multipolygon_context_only';
    readonly reason: string;
  };
  readonly acquisition: PdokGwswAreaReceipt;
}

export function assessGwswOutfallAreaContext(input: {
  readonly acquisition: PdokGwswAreaAcquisition;
  readonly outfallNodeId: string;
  readonly outfallPosition: GeoPoint;
  readonly waternetPumpingAreaReference: string | null;
}): GwswOutfallAreaContext {
  if (input.outfallNodeId.trim().length === 0) {
    throw new Error('GWSW outfall node id must be non-empty');
  }
  validatePosition(input.outfallPosition, 'GWSW outfall position');

  const reference =
    input.waternetPumpingAreaReference?.trim() || null;

  if (input.acquisition.status !== 'available') {
    return {
      modelVersion: GWSW_OUTFALL_AREA_LINK_VERSION,
      status: input.acquisition.status,
      outfallNodeId: input.outfallNodeId,
      outfallPosition: input.outfallPosition,
      waternetPumpingAreaReference: {
        sourceField: 'bemalingsgebied',
        value: reference,
        semantics: 'source_identifier_only',
        gwswCrosswalk: 'not_published',
      },
      containingAreas: [],
      containingRioleringsgebieden: [],
      attachment: {
        eligible: false,
        catchmentAttachmentCreated: false,
        method: 'point_in_observed_multipolygon_context_only',
        reason:
          'GWSW area evidence is unavailable; no catchment attachment can be evaluated',
      },
      acquisition: input.acquisition.receipt,
    };
  }

  const containingAreas = input.acquisition.areas.filter(
    (area) =>
      pointInMultiPolygon(
        input.outfallPosition,
        area.geometry.coordinates,
      ),
  );
  const containingRioleringsgebieden =
    containingAreas.filter(
      (area) => area.areaType === 'rioleringsgebied',
    );

  if (containingRioleringsgebieden.length === 0) {
    return {
      modelVersion: GWSW_OUTFALL_AREA_LINK_VERSION,
      status: 'out_of_coverage',
      outfallNodeId: input.outfallNodeId,
      outfallPosition: input.outfallPosition,
      waternetPumpingAreaReference: {
        sourceField: 'bemalingsgebied',
        value: reference,
        semantics: 'source_identifier_only',
        gwswCrosswalk: 'not_published',
      },
      containingAreas,
      containingRioleringsgebieden,
      attachment: {
        eligible: false,
        catchmentAttachmentCreated: false,
        method: 'point_in_observed_multipolygon_context_only',
        reason:
          'No observed GWSW rioleringsgebied contains the Waternet outfall coordinate',
      },
      acquisition: input.acquisition.receipt,
    };
  }

  return {
    modelVersion: GWSW_OUTFALL_AREA_LINK_VERSION,
    status: 'unresolved_no_published_crosswalk',
    outfallNodeId: input.outfallNodeId,
    outfallPosition: input.outfallPosition,
    waternetPumpingAreaReference: {
      sourceField: 'bemalingsgebied',
      value: reference,
      semantics: 'source_identifier_only',
      gwswCrosswalk: 'not_published',
    },
    containingAreas,
    containingRioleringsgebieden,
    attachment: {
      eligible: false,
      catchmentAttachmentCreated: false,
      method: 'point_in_observed_multipolygon_context_only',
      reason:
        'Point containment establishes spatial context only. The public Waternet and GWSW responses publish no crosswalk or relation from this Regenwateruitlaat to a rioleringsgebied, so no sewer catchment attachment is asserted.',
    },
    acquisition: input.acquisition.receipt,
  };
}

export function pointInMultiPolygon(
  point: GeoPoint,
  coordinates: GwswMultiPolygon,
): boolean {
  validatePosition(point, 'Point-in-polygon coordinate');

  return coordinates.some((polygon) => {
    const outer = polygon[0];

    if (
      outer === undefined ||
      !pointInRing(point, outer)
    ) {
      return false;
    }

    return !polygon
      .slice(1)
      .some((hole) => pointInRing(point, hole));
  });
}

function pointInRing(
  point: GeoPoint,
  ring: GwswLinearRing,
): boolean {
  let inside = false;
  let previous = ring.length - 1;

  for (let index = 0; index < ring.length; index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const intersects =
      currentPoint[1] > point.lat !==
        previousPoint[1] > point.lat &&
      point.lon <
        ((previousPoint[0] - currentPoint[0]) *
          (point.lat - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];

    if (intersects) {
      inside = !inside;
    }

    previous = index;
  }

  return inside;
}

function parseFeatureCollection(body: unknown): {
  readonly responseTimestamp: string | null;
  readonly areas: readonly GwswArea[];
} {
  const collection = requireRecord(
    body,
    'GWSW FeatureCollection',
  );

  if (
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features)
  ) {
    throw new Error(
      'expected a GeoJSON FeatureCollection',
    );
  }

  const numberMatched = optionalCount(
    collection.numberMatched,
    'GWSW numberMatched',
  );
  const numberReturned = optionalCount(
    collection.numberReturned,
    'GWSW numberReturned',
  );

  if (
    collection.features.length > MAX_FEATURES ||
    hasNextLink(collection.links) ||
    (numberMatched !== null &&
      numberMatched > collection.features.length) ||
    (numberReturned !== null &&
      numberReturned !== collection.features.length)
  ) {
    throw new Error(
      'bounded response is truncated or exceeds 100 features',
    );
  }

  const responseTimestamp =
    typeof collection.timeStamp === 'string' &&
    !Number.isNaN(Date.parse(collection.timeStamp))
      ? collection.timeStamp
      : null;
  const areas = collection.features.map(
    (feature, index) => parseArea(feature, index),
  );
  const coordinatePositions = areas.reduce(
    (total, area) =>
      total +
      area.geometry.coordinates.reduce(
        (polygonTotal, polygon) =>
          polygonTotal +
          polygon.reduce(
            (ringTotal, ring) => ringTotal + ring.length,
            0,
          ),
        0,
      ),
    0,
  );

  if (coordinatePositions > MAX_COORDINATE_POSITIONS) {
    throw new Error(
      'bounded response exceeds 100000 coordinate positions',
    );
  }

  return { responseTimestamp, areas };
}

function parseArea(
  value: unknown,
  index: number,
): GwswArea {
  const feature = requireRecord(
    value,
    'GWSW feature ' + index,
  );
  const properties = requireRecord(
    feature.properties,
    'GWSW feature ' + index + ' properties',
  );
  const geometry = requireRecord(
    feature.geometry,
    'GWSW feature ' + index + ' geometry',
  );

  if (geometry.type !== 'MultiPolygon') {
    throw new Error(
      'GWSW feature ' + index +
        ' must use MultiPolygon geometry',
    );
  }

  const coordinates = parseMultiPolygon(
    geometry.coordinates,
    'GWSW feature ' + index,
  );
  const sourceTypeName = requiredString(
    properties.type_naam,
    'GWSW feature ' + index + ' type_naam',
  );

  return {
    featureId: requiredString(
      feature.id,
      'GWSW feature ' + index + ' id',
    ),
    name: requiredString(
      properties.naam,
      'GWSW feature ' + index + ' naam',
    ),
    areaType:
      sourceTypeName === 'Rioleringsgebied'
        ? 'rioleringsgebied'
        : sourceTypeName === 'Zuiveringseenheid'
          ? 'zuiveringseenheid'
          : 'other',
    sourceTypeName,
    sourceTypeUri: requiredString(
      properties.type,
      'GWSW feature ' + index + ' type',
    ),
    sourceDatasetUrl: requiredString(
      properties.dataset,
      'GWSW feature ' + index + ' dataset',
    ),
    sourceUri: requiredString(
      properties.uri,
      'GWSW feature ' + index + ' uri',
    ),
    geometry: {
      type: 'MultiPolygon',
      coordinates,
    },
  };
}

function parseMultiPolygon(
  value: unknown,
  label: string,
): GwswMultiPolygon {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(label + ' has no polygon coordinates');
  }

  return value.map((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error(
        label + ' polygon ' + polygonIndex +
          ' has no rings',
      );
    }

    return polygon.map((ring, ringIndex) => {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new Error(
          label + ' ring ' + ringIndex +
            ' must contain at least four positions',
        );
      }

      const positions = ring.map(
        (position, positionIndex) =>
          parsePosition(
            position,
            label + ' position ' + positionIndex,
          ),
      );
      const first = positions[0];
      const last = positions[positions.length - 1];

      if (
        first[0] !== last[0] ||
        first[1] !== last[1]
      ) {
        throw new Error(label + ' ring must be closed');
      }

      return positions;
    });
  });
}

function parsePosition(
  value: unknown,
  label: string,
): GwswPosition {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number'
  ) {
    throw new Error(label + ' must be a lon/lat position');
  }

  const position = {
    lon: value[0],
    lat: value[1],
  };
  validatePosition(position, label);
  return [position.lon, position.lat];
}

function receipt(input: {
  readonly acquiredAt: string;
  readonly responseTimestamp: string | null;
  readonly requestUrl: string;
  readonly requestedBboxCrs84: string;
  readonly areas: readonly GwswArea[];
}): PdokGwswAreaReceipt {
  return {
    provider: 'PDOK',
    publisher: 'Stichting RIONED',
    dataset: 'Stedelijk Water (Riolering)',
    collection: 'beheergebied',
    license: 'CC0 1.0',
    acquiredAt: input.acquiredAt,
    responseTimestamp: input.responseTimestamp,
    requestUrl: input.requestUrl,
    requestedBboxCrs84: input.requestedBboxCrs84,
    sourceCrs: 'OGC:CRS84',
    outputCrs: 'OGC:CRS84',
    featureCount: input.areas.length,
    rioleringsgebiedCount: input.areas.filter(
      (area) => area.areaType === 'rioleringsgebied',
    ).length,
    documentationUrl:
      'https://www.pdok.nl/introductie/-/article/stedelijk-water-riolering-',
  };
}

function areaUrl(bbox: string): string {
  const query = new URLSearchParams({
    bbox,
    limit: String(MAX_FEATURES),
    f: 'json',
  });
  return PDOK_GWSW_AREA_URL + '?' + query.toString();
}

function bboxString(
  bbox: AmsterdamWaternetBbox,
): string {
  return [
    bbox.lonMin,
    bbox.latMin,
    bbox.lonMax,
    bbox.latMax,
  ].join(',');
}

function validateBbox(
  bbox: AmsterdamWaternetBbox,
  maxSpanDegrees: number,
): void {
  validatePosition(
    { lat: bbox.latMin, lon: bbox.lonMin },
    'PDOK GWSW bbox minimum',
  );
  validatePosition(
    { lat: bbox.latMax, lon: bbox.lonMax },
    'PDOK GWSW bbox maximum',
  );

  if (
    bbox.latMin >= bbox.latMax ||
    bbox.lonMin >= bbox.lonMax
  ) {
    throw new Error(
      'PDOK GWSW bbox minimums must be below maximums',
    );
  }

  if (
    bbox.latMax - bbox.latMin > maxSpanDegrees ||
    bbox.lonMax - bbox.lonMin > maxSpanDegrees
  ) {
    throw new Error(
      'PDOK GWSW bbox exceeds the ' +
        maxSpanDegrees +
        ' degree bounded-area limit',
    );
  }
}

function validatePosition(
  position: GeoPoint,
  label: string,
): void {
  if (
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lon) ||
    position.lat < -90 ||
    position.lat > 90 ||
    position.lon < -180 ||
    position.lon > 180
  ) {
    throw new Error(label + ' must be valid WGS84');
  }
}

function hasNextLink(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        isRecord(item) && item.rel === 'next',
    )
  );
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

function optionalCount(
  value: unknown,
  label: string,
): number | null {
  if (value === undefined) {
    return null;
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(label + ' must be a non-negative integer');
  }

  return value;
}

function requiredString(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(label + ' must be a non-empty string');
  }
  return value;
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(label + ' must be an object');
  }
  return value;
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
  return error instanceof Error
    ? error.message
    : String(error);
}
