import {
  Evidence,
  EvidenceDescriptor,
  EvidenceStatus,
  unavailableEvidence,
} from '@geo-lens/evidence';
import {
  cellToBoundary,
  cellToLatLng,
  isValidCell,
} from 'h3-js';
import { fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import {
  classifyRasterError,
  errorMessage,
  rasterSampleEvidence,
  RasterSample,
  RasterSourceIdentity,
} from './raster';

const WCS_ENDPOINT =
  'https://service.pdok.nl/rws/actueel-hoogtebestand-nederland/wcs/v1_0';
const COVERAGE_ID = 'dtm_05m' as const;
const WCS_VERSION = '2.0.1' as const;
const DATASET_VERSION = 'AHN4' as const;
const SOURCE_CRS = 'EPSG:28992' as const;
const VERTICAL_DATUM = 'NAP (EPSG:5709)' as const;
const SOURCE_RESOLUTION = '0.5 m';
const MAX_NO_DATA_FRACTION = 0.6;
const AGGREGATION_RULE_URL =
  'https://www.ahn.nl/5-producten';
const MAX_H3_LOCATIONS = 1_000;
const MAX_COVERAGE_SPAN_M = 500;
const RD_PROJ4 =
  '+proj=sterea +lat_0=52.15616055555555 ' +
  '+lon_0=5.38763888888889 +k=0.9999079 ' +
  '+x_0=155000 +y_0=463000 +ellps=bessel ' +
  '+towgs84=565.4171,50.3319,465.5524,-0.398957,' +
  '0.343988,-1.8774,4.0725 +units=m +no_defs';

interface RasterImage {
  getBoundingBox(): readonly [number, number, number, number];
  getWidth(): number;
  getHeight(): number;
  getGDALNoData?(): number | null;
  readRasters(): Promise<unknown>;
}

export interface AhnCoverageBoundsRd {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface AhnCoverageReceipt {
  readonly service: 'OGC WCS';
  readonly serviceVersion: '2.0.1';
  readonly coverageId: 'dtm_05m';
  readonly requestUrl: string;
  readonly requestedBoundsRd: AhnCoverageBoundsRd;
  readonly sourceCrs: 'EPSG:28992';
  readonly verticalDatum: 'NAP (EPSG:5709)';
  readonly responseWidth: number;
  readonly responseHeight: number;
  readonly responseBytes: number;
}

export interface AhnBatchRasterSource {
  readonly identity: RasterSourceIdentity;
  sample(locations: readonly {
    readonly id: string;
    readonly lat: number;
    readonly lon: number;
  }[]): Promise<{
    readonly samples: Readonly<Record<string, RasterSample>>;
    readonly receipt: AhnCoverageReceipt;
  }>;
}

export interface AhnElevationProviderResult {
  readonly provider: 'PDOK';
  readonly dataset: 'Actueel Hoogtebestand Nederland DTM';
  readonly datasetVersion: 'AHN4';
  readonly acquiredAt: string;
  readonly coverage: AhnCoverageReceipt | null;
  readonly cells: Readonly<Record<string, Evidence<number>>>;
}

export class AhnDtmClient {
  private readonly source: AhnBatchRasterSource;
  private readonly now: () => Date;

  constructor(options: {
    readonly rasterSource?: AhnBatchRasterSource;
    readonly now?: () => Date;
  } = {}) {
    this.source =
      options.rasterSource ?? new AhnWcsDtmRasterSource();
    this.now = options.now ?? (() => new Date());
  }

  async getElevationEvidence(request: {
    readonly h3Indices: readonly string[];
  }): Promise<AhnElevationProviderResult> {
    validateH3Request(request.h3Indices);
    const acquiredAt = this.now().toISOString();
    const locations = request.h3Indices.map((id) => {
      const [lat, lon] = cellToLatLng(id);
      return { id, lat, lon };
    });

    try {
      const acquisition = await this.source.sample(locations);
      const cells = Object.fromEntries(
        locations.map((location) => {
          const sample = acquisition.samples[location.id] ?? {
            status: 'invalid_response' as const,
            value: null,
            missingReason:
              'AHN WCS response omitted the requested location',
            sourceId: acquisition.receipt.requestUrl,
          };
          return [
            location.id,
            rasterSampleEvidence(
              sample,
              descriptor(location, acquiredAt),
              this.source.identity,
            ),
          ];
        }),
      );
      return result(acquiredAt, acquisition.receipt, cells);
    } catch (error) {
      const status = failureStatus(error);
      const reason =
        'AHN WCS acquisition failed: ' + errorMessage(error);
      const cells = Object.fromEntries(
        locations.map((location) => [
          location.id,
          unavailableEvidence(
            status,
            reason,
            descriptor(location, acquiredAt),
          ),
        ]),
      );
      return result(acquiredAt, null, cells);
    }
  }
}

export class AhnWcsDtmRasterSource
  implements AhnBatchRasterSource
{
  readonly identity = { kind: 'production' } as const;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: {
    readonly fetchImpl?: typeof fetch;
    readonly timeoutMs?: number;
  } = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs <= 0
    ) {
      throw new Error(
        'AHN WCS timeoutMs must be a finite positive number',
      );
    }
  }

  async sample(locations: readonly {
    readonly id: string;
    readonly lat: number;
    readonly lon: number;
  }[]) {
    validateLocations(locations);
    const projected = locations.map((location) => ({
      ...location,
      coordinate: ahnRdCoordinate(location.lat, location.lon),
      boundary: cellToBoundary(location.id, true).map(
        ([lon, lat]) => ahnRdCoordinate(lat, lon),
      ),
    }));
    const bounds = coverageBounds(
      projected.flatMap((item) => item.boundary),
    );
    const requestUrl = buildAhnWcsCoverageUrl(bounds);
    const response = await this.fetchImpl(requestUrl, {
      headers: { accept: 'image/tiff' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new AhnSourceError(
        response.status === 401 || response.status === 403
          ? 'auth_required'
          : response.status === 429
            ? 'rate_limited'
            : response.status >= 500
              ? 'upstream_error'
              : 'invalid_response',
        'AHN WCS returned HTTP ' + response.status,
      );
    }
    const contentType =
      response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('image/tiff')) {
      throw new AhnSourceError(
        'invalid_response',
        'AHN WCS returned unsupported content type ' +
          (contentType || '(missing)'),
      );
    }

    const bytes = await response.arrayBuffer();
    const tiff = await fromArrayBuffer(bytes);
    const image =
      (await tiff.getImage()) as unknown as RasterImage;
    const bbox = image.getBoundingBox();
    const width = image.getWidth();
    const height = image.getHeight();
    if (!validRaster(bbox, width, height)) {
      throw new AhnSourceError(
        'invalid_response',
        'AHN WCS returned invalid raster geometry',
      );
    }

    const band = firstBand(await image.readRasters());
    if (band === null || band.length < width * height) {
      throw new AhnSourceError(
        'invalid_response',
        'AHN WCS returned an incomplete elevation band',
      );
    }
    const noData = image.getGDALNoData?.();
    const samples = Object.fromEntries(
      projected.map((location) => [
        location.id,
        aggregateAhnDtmArea({
          polygonRd: location.boundary,
          bbox,
          width,
          height,
          band,
          noData,
          sourceId: WCS_ENDPOINT + '#dtm_05m',
        }),
      ]),
    );
    return {
      samples,
      receipt: {
        service: 'OGC WCS' as const,
        serviceVersion: WCS_VERSION,
        coverageId: COVERAGE_ID,
        requestUrl,
        requestedBoundsRd: bounds,
        sourceCrs: SOURCE_CRS,
        verticalDatum: VERTICAL_DATUM,
        responseWidth: width,
        responseHeight: height,
        responseBytes: bytes.byteLength,
      },
    };
  }
}

export function ahnRdCoordinate(
  lat: number,
  lon: number,
): readonly [number, number] {
  if (!validCoordinate(lat, lon)) {
    throw new Error('AHN coordinate must be valid WGS84');
  }
  const [x, y] = proj4(
    'EPSG:4326',
    RD_PROJ4,
    [lon, lat],
  );
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(
      'AHN coordinate could not be transformed to RD',
    );
  }
  return [x, y];
}

export function buildAhnWcsCoverageUrl(
  bounds: AhnCoverageBoundsRd,
): string {
  validateBounds(bounds);
  const query = new URLSearchParams({
    SERVICE: 'WCS',
    VERSION: WCS_VERSION,
    REQUEST: 'GetCoverage',
    COVERAGEID: COVERAGE_ID,
    FORMAT: 'image/tiff',
  });
  query.append(
    'SUBSET',
    'X(' + bounds.minX + ',' + bounds.maxX + ')',
  );
  query.append(
    'SUBSET',
    'Y(' + bounds.minY + ',' + bounds.maxY + ')',
  );
  return WCS_ENDPOINT + '?' + query.toString();
}

function coverageBounds(
  coordinates: readonly (readonly [number, number])[],
): AhnCoverageBoundsRd {
  const xs = coordinates.map((item) => item[0]);
  const ys = coordinates.map((item) => item[1]);
  const bounds = {
    minX: Math.floor(Math.min(...xs) - 1),
    minY: Math.floor(Math.min(...ys) - 1),
    maxX: Math.ceil(Math.max(...xs) + 1),
    maxY: Math.ceil(Math.max(...ys) + 1),
  };

  if (
    bounds.maxX - bounds.minX > MAX_COVERAGE_SPAN_M ||
    bounds.maxY - bounds.minY > MAX_COVERAGE_SPAN_M
  ) {
    throw new AhnSourceError(
      'out_of_coverage',
      'AHN WCS request exceeds the 500 m bounded coverage span',
    );
  }

  return bounds;
}

function descriptor(
  location: { id: string; lat: number; lon: number },
  acquiredAt: string,
): EvidenceDescriptor {
  return {
    unit: 'm',
    spatial: {
      h3: location.id,
      lat: location.lat,
      lon: location.lon,
      sourceResolution: SOURCE_RESOLUTION,
    },
    temporal: { acquiredAt },
    provenance: {
      provider: 'PDOK',
      dataset: 'Actueel Hoogtebestand Nederland DTM',
      datasetVersion: DATASET_VERSION,
      transformation:
        'transform the H3 boundary from WGS84 to RD and aggregate AHN DTM pixel centers inside the H3 polygon',
      transformationVersion:
        'ahn4-dtm-h3-area-mean-v0.2.0',
      samplingMethod:
        'one bounded WCS coverage request; arithmetic mean of 0.5 m source pixel centers inside each H3 polygon; unavailable when more than 60% are no-data',
      sourceMetadata: {
        coverageId: COVERAGE_ID,
        sourceCrs: SOURCE_CRS,
        verticalDatum: VERTICAL_DATUM,
        acquisitionPeriod:
          '2020-2022; per-location flight timestamp is not resolved by this WCS request',
        sourceModel: 'digital terrain model (DTM)',
        aggregationNoDataRule:
          'unavailable when more than 60% of source pixels are no-data; threshold mirrors the published AHN 5 m DTM derivation rule',
        aggregationRuleUrl: AGGREGATION_RULE_URL,
      },
    },
  };
}

function result(
  acquiredAt: string,
  coverage: AhnCoverageReceipt | null,
  cells: Readonly<Record<string, Evidence<number>>>,
): AhnElevationProviderResult {
  return {
    provider: 'PDOK',
    dataset: 'Actueel Hoogtebestand Nederland DTM',
    datasetVersion: DATASET_VERSION,
    acquiredAt,
    coverage,
    cells,
  };
}

export function aggregateAhnDtmArea(input: {
  readonly polygonRd: readonly (readonly [number, number])[];
  readonly bbox: readonly [number, number, number, number];
  readonly width: number;
  readonly height: number;
  readonly band: ArrayLike<number>;
  readonly noData: number | null | undefined;
  readonly sourceId: string;
}): RasterSample {
  if (
    input.polygonRd.length < 3 ||
    !validRaster(input.bbox, input.width, input.height)
  ) {
    return {
      status: 'invalid_response',
      value: null,
      missingReason:
        'AHN area aggregation received invalid geometry',
      sourceId: input.sourceId,
    };
  }

  const xs = input.polygonRd.map((point) => point[0]);
  const ys = input.polygonRd.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const pixelWidth =
    (input.bbox[2] - input.bbox[0]) / input.width;
  const pixelHeight =
    (input.bbox[3] - input.bbox[1]) / input.height;
  const minPixelX = clamp(
    Math.floor((minX - input.bbox[0]) / pixelWidth),
    0,
    input.width - 1,
  );
  const maxPixelX = clamp(
    Math.ceil((maxX - input.bbox[0]) / pixelWidth) - 1,
    0,
    input.width - 1,
  );
  const minPixelY = clamp(
    Math.floor((input.bbox[3] - maxY) / pixelHeight),
    0,
    input.height - 1,
  );
  const maxPixelY = clamp(
    Math.ceil((input.bbox[3] - minY) / pixelHeight) - 1,
    0,
    input.height - 1,
  );
  let totalSourcePixels = 0;
  let availableSourcePixels = 0;
  let noDataSourcePixels = 0;
  let invalidSourcePixels = 0;
  let elevationSumM = 0;

  for (
    let pixelY = minPixelY;
    pixelY <= maxPixelY;
    pixelY += 1
  ) {
    const y =
      input.bbox[3] - (pixelY + 0.5) * pixelHeight;

    for (
      let pixelX = minPixelX;
      pixelX <= maxPixelX;
      pixelX += 1
    ) {
      const x =
        input.bbox[0] + (pixelX + 0.5) * pixelWidth;

      if (!pointInPolygon([x, y], input.polygonRd)) {
        continue;
      }

      totalSourcePixels += 1;
      const value = Number(
        input.band[pixelY * input.width + pixelX],
      );

      if (isAhnNoData(value, input.noData)) {
        noDataSourcePixels += 1;
      } else if (value < -1000 || value > 9000) {
        invalidSourcePixels += 1;
      } else {
        availableSourcePixels += 1;
        elevationSumM += value;
      }
    }
  }

  const sourceQuality =
    totalSourcePixels === 0
      ? 0
      : availableSourcePixels / totalSourcePixels;
  const sourceMetadata = {
    aggregationStatistic: 'arithmetic_mean',
    totalSourcePixels,
    availableSourcePixels,
    noDataSourcePixels,
    invalidSourcePixels,
    observedSourceFraction: sourceQuality,
    maximumNoDataFraction: MAX_NO_DATA_FRACTION,
    aggregationRuleUrl: AGGREGATION_RULE_URL,
  } as const;

  if (totalSourcePixels === 0) {
    return {
      status: 'out_of_coverage',
      value: null,
      missingReason:
        'No AHN source pixel center lies inside the H3 polygon',
      sourceId: input.sourceId,
      sourceQuality,
      sourceMetadata,
    };
  }

  if (invalidSourcePixels > 0) {
    return {
      status: 'invalid_response',
      value: null,
      missingReason:
        'AHN DTM contains source pixels outside the physical elevation range',
      sourceId: input.sourceId,
      sourceQuality,
      sourceMetadata,
    };
  }

  const noDataFraction =
    noDataSourcePixels / totalSourcePixels;

  if (
    availableSourcePixels === 0 ||
    noDataFraction > MAX_NO_DATA_FRACTION
  ) {
    return {
      status: 'missing',
      value: null,
      missingReason:
        'AHN DTM H3 area exceeds the 60% source no-data threshold',
      sourceId: input.sourceId,
      sourceQuality,
      sourceMetadata: {
        ...sourceMetadata,
        noDataFraction,
      },
    };
  }

  return {
    status: 'available',
    value: elevationSumM / availableSourcePixels,
    sourceId: input.sourceId,
    sourceQuality,
    sourceMetadata: {
      ...sourceMetadata,
      noDataFraction,
    },
  };
}

function pointInPolygon(
  point: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  let previous = polygon.length - 1;

  for (let index = 0; index < polygon.length; index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint[1] > point[1] !==
        previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) *
          (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];

    if (intersects) {
      inside = !inside;
    }

    previous = index;
  }

  return inside;
}

function isAhnNoData(
  value: number,
  noData: number | null | undefined,
): boolean {
  return (
    !Number.isFinite(value) ||
    (noData !== null &&
      noData !== undefined &&
      value === noData) ||
    value <= -32767 ||
    value >= 1e20
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function firstBand(
  rasters: unknown,
): ArrayLike<number> | null {
  if (
    !Array.isArray(rasters) &&
    !ArrayBuffer.isView(rasters)
  ) {
    return null;
  }
  return (
    rasters as unknown as ArrayLike<ArrayLike<number>>
  )[0] ?? null;
}

function validRaster(
  bbox: readonly [number, number, number, number],
  width: number,
  height: number,
): boolean {
  return (
    bbox.every(Number.isFinite) &&
    bbox[0] < bbox[2] &&
    bbox[1] < bbox[3] &&
    Number.isInteger(width) &&
    width > 0 &&
    Number.isInteger(height) &&
    height > 0
  );
}

function failureStatus(error: unknown): Exclude<
  EvidenceStatus,
  'available' | 'synthetic_fixture'
> {
  return error instanceof AhnSourceError
    ? error.status
    : classifyRasterError(error);
}

class AhnSourceError extends Error {
  constructor(
    readonly status: Exclude<
      EvidenceStatus,
      'available' | 'synthetic_fixture'
    >,
    message: string,
  ) {
    super(message);
  }
}

function validateH3Request(
  h3Indices: readonly string[],
): void {
  if (h3Indices.length === 0) {
    throw new Error(
      'AHN elevation request requires H3 cells',
    );
  }
  if (h3Indices.length > MAX_H3_LOCATIONS) {
    throw new Error(
      'AHN elevation request exceeds 1000 H3 cells',
    );
  }
  if (new Set(h3Indices).size !== h3Indices.length) {
    throw new Error(
      'AHN elevation request contains duplicate H3 cells',
    );
  }
  const invalid = h3Indices.filter(
    (h3) => !isValidCell(h3),
  );
  if (invalid.length > 0) {
    throw new Error(
      'AHN elevation request contains invalid H3 cells: ' +
        invalid.join(', '),
    );
  }
}

function validateLocations(locations: readonly {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
}[]): void {
  if (locations.length === 0) {
    throw new Error('AHN WCS requires locations');
  }
  const ids = new Set<string>();
  for (const location of locations) {
    if (
      location.id.length === 0 ||
      ids.has(location.id) ||
      !validCoordinate(location.lat, location.lon)
    ) {
      throw new Error('AHN WCS received invalid locations');
    }
    ids.add(location.id);
  }
}

function validCoordinate(
  lat: number,
  lon: number,
): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function validateBounds(
  bounds: AhnCoverageBoundsRd,
): void {
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    bounds.minX >= bounds.maxX ||
    bounds.minY >= bounds.maxY
  ) {
    throw new Error(
      'AHN WCS bounds must be finite and ordered',
    );
  }
}
