import {
  Evidence,
  EvidenceDescriptor,
  EvidenceStatus,
  unavailableEvidence,
} from '@geo-lens/evidence';
import { cellToLatLng, isValidCell } from 'h3-js';
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
    }));
    const bounds = coverageBounds(
      projected.map((item) => item.coordinate),
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
        samplePixel(
          location.coordinate,
          bbox,
          width,
          height,
          band,
          noData,
          WCS_ENDPOINT + '#dtm_05m',
        ),
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
        'transform H3 centroid from WGS84 to RD and sample nearest AHN DTM raster pixel',
      transformationVersion:
        'ahn4-dtm-h3-centroid-v0.1.0',
      samplingMethod:
        'one bounded WCS coverage request; nearest 0.5 m source raster pixel per H3 centroid',
      sourceMetadata: {
        coverageId: COVERAGE_ID,
        sourceCrs: SOURCE_CRS,
        verticalDatum: VERTICAL_DATUM,
        acquisitionPeriod:
          '2020-2022; per-location flight timestamp is not resolved by this WCS request',
        sourceModel: 'digital terrain model (DTM)',
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

function samplePixel(
  coordinate: readonly [number, number],
  bbox: readonly [number, number, number, number],
  width: number,
  height: number,
  band: ArrayLike<number>,
  noData: number | null | undefined,
  sourceId: string,
): RasterSample {
  const [x, y] = coordinate;
  if (
    x < bbox[0] ||
    x >= bbox[2] ||
    y < bbox[1] ||
    y >= bbox[3]
  ) {
    return {
      status: 'out_of_coverage',
      value: null,
      missingReason:
        'AHN coordinate lies outside returned coverage',
      sourceId,
    };
  }
  const pixelX = Math.floor(
    ((x - bbox[0]) / (bbox[2] - bbox[0])) * width,
  );
  const pixelY = Math.floor(
    ((bbox[3] - y) / (bbox[3] - bbox[1])) * height,
  );
  const value = Number(band[pixelY * width + pixelX]);
  if (!Number.isFinite(value)) {
    return {
      status: 'invalid_response',
      value: null,
      missingReason:
        'AHN raster returned a non-finite pixel',
      sourceId,
    };
  }
  if (
    (noData !== null &&
      noData !== undefined &&
      value === noData) ||
    value <= -32767 ||
    value >= 1e20
  ) {
    return {
      status: 'missing',
      value: null,
      missingReason:
        'AHN DTM pixel is marked as no-data',
      sourceId,
    };
  }
  if (value < -1000 || value > 9000) {
    return {
      status: 'invalid_response',
      value: null,
      missingReason:
        'AHN DTM elevation is outside physical range',
      sourceId,
    };
  }
  return { status: 'available', value, sourceId };
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
