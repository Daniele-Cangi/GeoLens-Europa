import {
  Evidence,
  EvidenceDescriptor,
  UnavailableEvidenceStatus,
  availableEvidence,
  unavailableEvidence,
} from '@geo-lens/evidence';
import { cellToLatLng, getResolution, isValidCell } from 'h3-js';

export const PDOK_BGT_API_ROOT = 'https://api.pdok.nl/lv/bgt/ogc/v1';
export const BGT_H3_SURFACE_VERSION = 'bgt-h3-centroid-surface-v0.1.0';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_SPAN_DEGREES = 0.01;
const MAX_FEATURES_PER_COLLECTION = 1_000;
const MAX_TOTAL_FEATURES = 3_000;
const MAX_COORDINATE_POSITIONS = 500_000;
const MAX_H3_CELLS = 1_000;

export interface BgtBbox {
  readonly latMin: number;
  readonly lonMin: number;
  readonly latMax: number;
  readonly lonMax: number;
}

export type BgtCollectionId =
  | 'begroeidterreindeel'
  | 'onbegroeidterreindeel'
  | 'pand'
  | 'waterdeel'
  | 'wegdeel'
  | 'ondersteunendwaterdeel'
  | 'ondersteunendwegdeel'
  | 'scheiding_vlak';

export type BgtSurfaceClass =
  | 'vegetated_terrain'
  | 'unvegetated_terrain'
  | 'building'
  | 'surface_water'
  | 'road'
  | 'supporting_water'
  | 'supporting_road'
  | 'structural_barrier';

export type BgtPosition = readonly [number, number];
export type BgtLinearRing = readonly BgtPosition[];
export type BgtPolygon = readonly BgtLinearRing[];
export type BgtMultiPolygon = readonly BgtPolygon[];

export interface BgtSurfaceFeature {
  readonly featureId: string;
  readonly localId: string;
  readonly collection: BgtCollectionId;
  readonly surfaceClass: BgtSurfaceClass;
  readonly sourceHolder: string;
  readonly status: string;
  readonly relativeHeight: number;
  readonly creationDate: string | null;
  readonly registrationTime: string | null;
  readonly publicationTime: string | null;
  readonly terminationDate: string | null;
  readonly version: string;
  readonly physicalAppearance: string | null;
  readonly function: string | null;
  readonly waterType: string | null;
  readonly geometry: {
    readonly type: 'MultiPolygon';
    readonly coordinates: BgtMultiPolygon;
  };
}

export interface BgtCollectionReceipt {
  readonly collection: BgtCollectionId;
  readonly requestUrl: string;
  readonly responseTimestamp: string | null;
  readonly featureCount: number;
}

export interface PdokBgtReceipt {
  readonly provider: 'PDOK';
  readonly dataset: 'Basisregistratie Grootschalige Topografie (BGT)';
  readonly license: 'CC0 1.0';
  readonly acquiredAt: string;
  readonly requestedAt: string;
  readonly requestedBboxCrs84: string;
  readonly sourceCrs: 'OGC:CRS84';
  readonly storageCrs: 'EPSG:28992';
  readonly featureCount: number;
  readonly collections: readonly BgtCollectionReceipt[];
  readonly documentationUrl: 'https://www.pdok.nl/ogc-apis/-/article/basisregistratie-grootschalige-topografie-bgt-';
}

export interface AvailablePdokBgtAcquisition {
  readonly status: 'available';
  readonly receipt: PdokBgtReceipt;
  readonly features: readonly BgtSurfaceFeature[];
}

export interface UnavailablePdokBgtAcquisition {
  readonly status: UnavailableEvidenceStatus;
  readonly missingReason: string;
  readonly receipt: PdokBgtReceipt;
  readonly features: readonly [];
}

export type PdokBgtAcquisition =
  | AvailablePdokBgtAcquisition
  | UnavailablePdokBgtAcquisition;

export interface PdokBgtTransportResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface PdokBgtTransport {
  getJson(url: string, timeoutMs: number): Promise<PdokBgtTransportResponse>;
}

export interface BgtSurfaceObservation {
  readonly surfaceClass: BgtSurfaceClass;
  readonly collection: BgtCollectionId;
  readonly featureId: string;
  readonly localId: string;
  readonly relativeHeight: 0;
  readonly physicalAppearance: string | null;
  readonly function: string | null;
  readonly waterType: string | null;
  readonly containingFeatureCount: number;
  readonly containingFeatureIds: readonly string[];
  readonly selectionMethod: 'priority_among_level_zero_features_containing_h3_centroid';
}

export interface BgtH3SurfaceResult {
  readonly modelVersion: typeof BGT_H3_SURFACE_VERSION;
  readonly receipt: PdokBgtReceipt;
  readonly cells: Readonly<Record<string, Evidence<BgtSurfaceObservation>>>;
  readonly counts: Readonly<Record<BgtSurfaceClass | 'unclassified', number>>;
}

interface CollectionDefinition {
  readonly id: BgtCollectionId;
  readonly surfaceClass: BgtSurfaceClass;
}

const COLLECTIONS: readonly CollectionDefinition[] = [
  { id: 'begroeidterreindeel', surfaceClass: 'vegetated_terrain' },
  { id: 'onbegroeidterreindeel', surfaceClass: 'unvegetated_terrain' },
  { id: 'pand', surfaceClass: 'building' },
  { id: 'waterdeel', surfaceClass: 'surface_water' },
  { id: 'wegdeel', surfaceClass: 'road' },
  { id: 'ondersteunendwaterdeel', surfaceClass: 'supporting_water' },
  { id: 'ondersteunendwegdeel', surfaceClass: 'supporting_road' },
  { id: 'scheiding_vlak', surfaceClass: 'structural_barrier' },
] as const;

const SURFACE_PRIORITY: Readonly<Record<BgtSurfaceClass, number>> = {
  surface_water: 0,
  supporting_water: 1,
  structural_barrier: 2,
  building: 3,
  road: 4,
  supporting_road: 5,
  vegetated_terrain: 6,
  unvegetated_terrain: 7,
};

export class FetchPdokBgtTransport implements PdokBgtTransport {
  async getJson(url: string, timeoutMs: number): Promise<PdokBgtTransportResponse> {
    const response = await fetch(url, {
      headers: { accept: 'application/geo+json, application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  }
}

export class PdokBgtSurfaceClient {
  private readonly transport: PdokBgtTransport;
  private readonly timeoutMs: number;
  private readonly maxSpanDegrees: number;
  private readonly now: () => Date;

  constructor(options: {
    readonly transport?: PdokBgtTransport;
    readonly timeoutMs?: number;
    readonly maxSpanDegrees?: number;
    readonly now?: () => Date;
  } = {}) {
    this.transport = options.transport ?? new FetchPdokBgtTransport();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxSpanDegrees = options.maxSpanDegrees ?? DEFAULT_MAX_SPAN_DEGREES;
    this.now = options.now ?? (() => new Date());
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('PDOK BGT timeoutMs must be a finite positive number');
    }
    if (!Number.isFinite(this.maxSpanDegrees) || this.maxSpanDegrees <= 0) {
      throw new Error('PDOK BGT maxSpanDegrees must be a finite positive number');
    }
  }

  async acquire(request: {
    readonly bbox: BgtBbox;
    readonly requestedAt?: string;
  }): Promise<PdokBgtAcquisition> {
    validateBbox(request.bbox, this.maxSpanDegrees);
    const acquiredAt = this.now().toISOString();
    const requestedAt = request.requestedAt ?? acquiredAt;
    assertTimestamp(requestedAt, 'PDOK BGT requestedAt');
    const requestedBboxCrs84 = bboxString(request.bbox);
    const baseCollections = COLLECTIONS.map((definition) => ({
      collection: definition.id,
      requestUrl: collectionUrl(definition.id, requestedBboxCrs84, requestedAt),
      responseTimestamp: null,
      featureCount: 0,
    } satisfies BgtCollectionReceipt));
    const emptyReceipt = receipt({
      acquiredAt,
      requestedAt,
      requestedBboxCrs84,
      features: [],
      collections: baseCollections,
    });

    let responses: readonly {
      readonly definition: CollectionDefinition;
      readonly requestUrl: string;
      readonly response: PdokBgtTransportResponse;
    }[];
    try {
      responses = await Promise.all(COLLECTIONS.map(async (definition) => {
        const requestUrl = collectionUrl(
          definition.id,
          requestedBboxCrs84,
          requestedAt,
        );
        return {
          definition,
          requestUrl,
          response: await this.transport.getJson(requestUrl, this.timeoutMs),
        };
      }));
    } catch (error) {
      return unavailableAcquisition(
        'upstream_error',
        'PDOK BGT request failed: ' + errorMessage(error),
        emptyReceipt,
      );
    }

    const failed = responses.find(({ response }) => response.status !== 200);
    if (failed !== undefined) {
      return unavailableAcquisition(
        statusForHttp(failed.response.status),
        `PDOK BGT ${failed.definition.id} returned HTTP ${failed.response.status}`,
        emptyReceipt,
      );
    }

    try {
      const parsed = responses.map((item) => {
        const collection = parseFeatureCollection(
          item.response.body,
          item.definition,
        );
        return {
          receipt: {
            collection: item.definition.id,
            requestUrl: item.requestUrl,
            responseTimestamp: collection.responseTimestamp,
            featureCount: collection.features.length,
          } satisfies BgtCollectionReceipt,
          features: collection.features,
        };
      });
      const features = parsed.flatMap((item) => item.features);
      const completeReceipt = receipt({
        acquiredAt,
        requestedAt,
        requestedBboxCrs84,
        features,
        collections: parsed.map((item) => item.receipt),
      });
      if (features.length > MAX_TOTAL_FEATURES) {
        throw new Error('bounded response exceeds 3000 features');
      }
      if (features.length === 0) {
        return unavailableAcquisition(
          'out_of_coverage',
          'PDOK BGT returned no physical surface features for the bounded request',
          completeReceipt,
        );
      }
      return { status: 'available', receipt: completeReceipt, features };
    } catch (error) {
      return unavailableAcquisition(
        'invalid_response',
        'PDOK BGT response is invalid: ' + errorMessage(error),
        emptyReceipt,
      );
    }
  }
}

export function classifyBgtSurfaceH3Cells(input: {
  readonly acquisition: PdokBgtAcquisition;
  readonly h3Indices: readonly string[];
}): BgtH3SurfaceResult {
  validateH3Indices(input.h3Indices);
  const counts = emptyCounts();
  const cells = Object.fromEntries(input.h3Indices.map((h3) => {
    const descriptor = surfaceDescriptor(h3, input.acquisition.receipt);
    if (input.acquisition.status !== 'available') {
      counts.unclassified += 1;
      return [h3, unavailableEvidence<BgtSurfaceObservation>(
        input.acquisition.status,
        input.acquisition.missingReason,
        descriptor,
      )];
    }

    const [lat, lon] = cellToLatLng(h3);
    const matches = input.acquisition.features
      .filter((feature) =>
        feature.relativeHeight === 0 &&
        feature.status === 'bestaand' &&
        pointInMultiPolygon({ lat, lon }, feature.geometry.coordinates),
      )
      .sort(compareSurfaceFeatures);
    const selected = matches[0];
    if (selected === undefined) {
      counts.unclassified += 1;
      return [h3, unavailableEvidence<BgtSurfaceObservation>(
        'missing',
        'No current level-zero BGT physical surface contains the H3 centroid',
        descriptor,
      )];
    }

    counts[selected.surfaceClass] += 1;
    return [h3, availableEvidence<BgtSurfaceObservation>(
      {
        surfaceClass: selected.surfaceClass,
        collection: selected.collection,
        featureId: selected.featureId,
        localId: selected.localId,
        relativeHeight: 0,
        physicalAppearance: selected.physicalAppearance,
        function: selected.function,
        waterType: selected.waterType,
        containingFeatureCount: matches.length,
        containingFeatureIds: matches.map((feature) => feature.featureId),
        selectionMethod: 'priority_among_level_zero_features_containing_h3_centroid',
      },
      {
        ...descriptor,
        provenance: {
          ...descriptor.provenance,
          sourceMetadata: {
            selectedFeatureId: selected.featureId,
            selectedLocalId: selected.localId,
            selectedCollection: selected.collection,
            selectedFeatureVersion: selected.version,
            sourceHolder: selected.sourceHolder,
            relativeHeight: selected.relativeHeight,
            featureStatus: selected.status,
            containingFeatureIds: matches.map((feature) => feature.featureId),
          },
        },
      },
    )];
  }));

  return {
    modelVersion: BGT_H3_SURFACE_VERSION,
    receipt: input.acquisition.receipt,
    cells,
    counts,
  };
}

export function pointInBgtMultiPolygon(
  point: { readonly lat: number; readonly lon: number },
  coordinates: BgtMultiPolygon,
): boolean {
  return pointInMultiPolygon(point, coordinates);
}

function parseFeatureCollection(
  body: unknown,
  definition: CollectionDefinition,
): {
  readonly responseTimestamp: string | null;
  readonly features: readonly BgtSurfaceFeature[];
} {
  const collection = requireRecord(body, `BGT ${definition.id} FeatureCollection`);
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('expected a GeoJSON FeatureCollection');
  }
  const numberReturned = optionalCount(
    collection.numberReturned,
    `BGT ${definition.id} numberReturned`,
  );
  if (
    collection.features.length > MAX_FEATURES_PER_COLLECTION ||
    hasNextLink(collection.links) ||
    (numberReturned !== null && numberReturned !== collection.features.length)
  ) {
    throw new Error(`${definition.id} response is truncated or exceeds 1000 features`);
  }

  const features = collection.features.map((feature, index) =>
    parseFeature(feature, index, definition),
  );
  const coordinateCount = features.reduce(
    (sum, feature) => sum + feature.geometry.coordinates.reduce(
      (polygonSum, polygon) => polygonSum + polygon.reduce(
        (ringSum, ring) => ringSum + ring.length,
        0,
      ),
      0,
    ),
    0,
  );
  if (coordinateCount > MAX_COORDINATE_POSITIONS) {
    throw new Error(`${definition.id} response exceeds 500000 coordinate positions`);
  }
  return {
    responseTimestamp: optionalTimestamp(collection.timeStamp),
    features,
  };
}

function parseFeature(
  value: unknown,
  index: number,
  definition: CollectionDefinition,
): BgtSurfaceFeature {
  const label = `BGT ${definition.id} feature ${index}`;
  const feature = requireRecord(value, label);
  const properties = requireRecord(feature.properties, `${label} properties`);
  const relativeHeight = requiredNumber(
    properties.relatieve_hoogteligging,
    `${label} relatieve_hoogteligging`,
  );
  if (!Number.isInteger(relativeHeight)) {
    throw new Error(`${label} relative height must be an integer`);
  }

  return {
    featureId: requiredString(feature.id, `${label} id`),
    localId: requiredString(properties.lokaal_id, `${label} lokaal_id`),
    collection: definition.id,
    surfaceClass: definition.surfaceClass,
    sourceHolder: requiredString(properties.bronhouder, `${label} bronhouder`),
    status: requiredString(properties.status, `${label} status`),
    relativeHeight,
    creationDate: nullableTimestamp(properties.creation_date),
    registrationTime: nullableTimestamp(properties.tijdstip_registratie),
    publicationTime: nullableTimestamp(properties.lv_publicatiedatum),
    terminationDate: nullableTimestamp(properties.termination_date),
    version: requiredString(properties.version, `${label} version`),
    physicalAppearance: nullableString(properties.fysiek_voorkomen),
    function: nullableString(properties.functie),
    waterType: nullableString(properties.type),
    geometry: parseGeometry(feature.geometry, label),
  };
}

function parseGeometry(
  value: unknown,
  label: string,
): BgtSurfaceFeature['geometry'] {
  const geometry = requireRecord(value, `${label} geometry`);
  if (geometry.type === 'Polygon') {
    return { type: 'MultiPolygon', coordinates: [parsePolygon(geometry.coordinates, label)] };
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon) => parsePolygon(polygon, label)),
    };
  }
  throw new Error(`${label} must use Polygon or MultiPolygon geometry`);
}

function parsePolygon(value: unknown, label: string): BgtPolygon {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} polygon has no rings`);
  }
  return value.map((ring, ringIndex) => {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new Error(`${label} ring ${ringIndex} is invalid`);
    }
    const positions = ring.map((position, positionIndex) =>
      parsePosition(position, `${label} ring ${ringIndex} position ${positionIndex}`),
    );
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw new Error(`${label} ring ${ringIndex} must be closed`);
    }
    return positions;
  });
}

function parsePosition(value: unknown, label: string): BgtPosition {
  if (
    !Array.isArray(value) || value.length < 2 ||
    typeof value[0] !== 'number' || typeof value[1] !== 'number' ||
    !Number.isFinite(value[0]) || !Number.isFinite(value[1]) ||
    value[0] < -180 || value[0] > 180 || value[1] < -90 || value[1] > 90
  ) {
    throw new Error(`${label} must be a valid CRS84 position`);
  }
  return [value[0], value[1]];
}

function pointInMultiPolygon(
  point: { readonly lat: number; readonly lon: number },
  coordinates: BgtMultiPolygon,
): boolean {
  return coordinates.some((polygon) => {
    const outer = polygon[0];
    return outer !== undefined && pointInRing(point, outer) &&
      !polygon.slice(1).some((hole) => pointInRing(point, hole));
  });
}

function pointInRing(
  point: { readonly lat: number; readonly lon: number },
  ring: BgtLinearRing,
): boolean {
  let inside = false;
  let previous = ring.length - 1;
  for (let index = 0; index < ring.length; index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const intersects =
      currentPoint[1] > point.lat !== previousPoint[1] > point.lat &&
      point.lon < ((previousPoint[0] - currentPoint[0]) *
        (point.lat - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (intersects) {
      inside = !inside;
    }
    previous = index;
  }
  return inside;
}

function surfaceDescriptor(h3: string, source: PdokBgtReceipt): EvidenceDescriptor {
  const [lat, lon] = cellToLatLng(h3);
  return {
    spatial: {
      h3,
      lat,
      lon,
      sourceResolution: `BGT object geometry; H3 r${getResolution(h3)} centroid classification`,
    },
    temporal: { acquiredAt: source.acquiredAt },
    provenance: {
      provider: 'PDOK',
      dataset: 'Basisregistratie Grootschalige Topografie (BGT)',
      transformation: 'classify BGT polygon containing H3 centroid',
      transformationVersion: BGT_H3_SURFACE_VERSION,
      samplingMethod: 'point-in-polygon at H3 centroid with explicit level-zero surface priority',
      sourceMetadata: {
        requestedAt: source.requestedAt,
        requestedBboxCrs84: source.requestedBboxCrs84,
        sourceCrs: source.sourceCrs,
        storageCrs: source.storageCrs,
        license: source.license,
      },
    },
  };
}

function compareSurfaceFeatures(left: BgtSurfaceFeature, right: BgtSurfaceFeature): number {
  return SURFACE_PRIORITY[left.surfaceClass] - SURFACE_PRIORITY[right.surfaceClass] ||
    left.featureId.localeCompare(right.featureId);
}

function emptyCounts(): Record<BgtSurfaceClass | 'unclassified', number> {
  return {
    vegetated_terrain: 0,
    unvegetated_terrain: 0,
    building: 0,
    surface_water: 0,
    road: 0,
    supporting_water: 0,
    supporting_road: 0,
    structural_barrier: 0,
    unclassified: 0,
  };
}

function receipt(input: {
  readonly acquiredAt: string;
  readonly requestedAt: string;
  readonly requestedBboxCrs84: string;
  readonly features: readonly BgtSurfaceFeature[];
  readonly collections: readonly BgtCollectionReceipt[];
}): PdokBgtReceipt {
  return {
    provider: 'PDOK',
    dataset: 'Basisregistratie Grootschalige Topografie (BGT)',
    license: 'CC0 1.0',
    acquiredAt: input.acquiredAt,
    requestedAt: input.requestedAt,
    requestedBboxCrs84: input.requestedBboxCrs84,
    sourceCrs: 'OGC:CRS84',
    storageCrs: 'EPSG:28992',
    featureCount: input.features.length,
    collections: input.collections,
    documentationUrl: 'https://www.pdok.nl/ogc-apis/-/article/basisregistratie-grootschalige-topografie-bgt-',
  };
}

function unavailableAcquisition(
  status: UnavailableEvidenceStatus,
  missingReason: string,
  source: PdokBgtReceipt,
): UnavailablePdokBgtAcquisition {
  return { status, missingReason, receipt: source, features: [] };
}

function collectionUrl(
  collection: BgtCollectionId,
  bbox: string,
  requestedAt: string,
): string {
  const query = new URLSearchParams({
    bbox,
    datetime: requestedAt,
    limit: String(MAX_FEATURES_PER_COLLECTION),
    f: 'json',
  });
  return `${PDOK_BGT_API_ROOT}/collections/${collection}/items?${query.toString()}`;
}

function bboxString(bbox: BgtBbox): string {
  return [bbox.lonMin, bbox.latMin, bbox.lonMax, bbox.latMax].join(',');
}

function validateBbox(bbox: BgtBbox, maxSpanDegrees: number): void {
  validatePosition({ lat: bbox.latMin, lon: bbox.lonMin }, 'PDOK BGT bbox minimum');
  validatePosition({ lat: bbox.latMax, lon: bbox.lonMax }, 'PDOK BGT bbox maximum');
  if (bbox.latMin >= bbox.latMax || bbox.lonMin >= bbox.lonMax) {
    throw new Error('PDOK BGT bbox minimums must be below maximums');
  }
  if (
    bbox.latMax - bbox.latMin > maxSpanDegrees ||
    bbox.lonMax - bbox.lonMin > maxSpanDegrees
  ) {
    throw new Error(`PDOK BGT bbox exceeds the ${maxSpanDegrees} degree bounded-area limit`);
  }
}

function validatePosition(
  position: { readonly lat: number; readonly lon: number },
  label: string,
): void {
  if (
    !Number.isFinite(position.lat) || !Number.isFinite(position.lon) ||
    position.lat < -90 || position.lat > 90 ||
    position.lon < -180 || position.lon > 180
  ) {
    throw new Error(`${label} must be valid WGS84`);
  }
}

function validateH3Indices(h3Indices: readonly string[]): void {
  if (h3Indices.length === 0) {
    throw new Error('BGT H3 classification requires cells');
  }
  if (h3Indices.length > MAX_H3_CELLS) {
    throw new Error('BGT H3 classification exceeds 1000 cells');
  }
  if (new Set(h3Indices).size !== h3Indices.length) {
    throw new Error('BGT H3 classification contains duplicate cells');
  }
  const invalid = h3Indices.filter((h3) => !isValidCell(h3));
  if (invalid.length > 0) {
    throw new Error(`BGT H3 classification contains invalid cells: ${invalid.join(', ')}`);
  }
}

function optionalCount(value: unknown, label: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function optionalTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('BGT temporal property must be null or a timestamp');
  }
  return value;
}

function assertTimestamp(value: string, label: string): void {
  if (value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp`);
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function hasNextLink(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item) &&
    (item as Record<string, unknown>).rel === 'next',
  );
}

function statusForHttp(status: number): UnavailableEvidenceStatus {
  if (status === 401 || status === 403) return 'auth_required';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  return 'invalid_response';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}