import {
  Evidence,
  EvidenceDescriptor,
} from '@geo-lens/evidence';
import { cellToLatLng, isValidCell } from 'h3-js';
import { fromUrl } from 'geotiff';
import {
  classifyRasterError,
  errorMessage,
  PointRasterSource,
  rasterSampleEvidence,
  RasterSample,
} from './raster';

const COPERNICUS_DEM_REFERENCE_TIME =
  '2021-01-01T00:00:00.000Z';
const COPERNICUS_DEM_RESOLUTION =
  '1 arc-second (~30 m at equator)';
const DEFAULT_NEIGHBOR_OFFSET_DEGREES = 1 / 3600;

interface RasterImage {
  getBoundingBox(): readonly [number, number, number, number];
  getWidth(): number;
  getHeight(): number;
  getGDALNoData?(): number | null;
  readRasters(options: {
    readonly window: readonly [number, number, number, number];
  }): Promise<unknown>;
}

export interface DemRequest {
  readonly h3Indices: readonly string[];
}

export interface DemPointLocation {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly h3?: string;
}

export interface DemPointRequest {
  readonly locations: readonly DemPointLocation[];
}

export interface DemCellEvidence {
  readonly elevationM: Evidence<number>;
  readonly slopeDeg: Evidence<number>;
}

export interface DemProviderResult {
  readonly provider: 'Copernicus Data Space Ecosystem';
  readonly dataset: 'Copernicus DEM GLO-30';
  readonly acquiredAt: string;
  readonly cells: Readonly<Record<string, DemCellEvidence>>;
}

export interface DemPointProviderResult {
  readonly provider: 'Copernicus Data Space Ecosystem';
  readonly dataset: 'Copernicus DEM GLO-30';
  readonly acquiredAt: string;
  readonly locations: Readonly<
    Record<string, DemCellEvidence>
  >;
}

export interface CopernicusDemClientOptions {
  readonly rasterSource?: PointRasterSource;
  readonly now?: () => Date;
  readonly neighborOffsetDegrees?: number;
}

export class CopernicusDemClient {
  private readonly rasterSource: PointRasterSource;
  private readonly now: () => Date;
  private readonly neighborOffsetDegrees: number;

  constructor(options: CopernicusDemClientOptions = {}) {
    this.rasterSource =
      options.rasterSource ?? new CopernicusDemRasterSource();
    this.now = options.now ?? (() => new Date());
    this.neighborOffsetDegrees =
      options.neighborOffsetDegrees ??
      DEFAULT_NEIGHBOR_OFFSET_DEGREES;

    if (
      !Number.isFinite(this.neighborOffsetDegrees) ||
      this.neighborOffsetDegrees <= 0
    ) {
      throw new Error(
        'DEM neighborOffsetDegrees must be a finite positive number',
      );
    }
  }

  async getEvidence(
    request: DemRequest,
  ): Promise<DemProviderResult> {
    validateH3Request(request.h3Indices, 'DEM');
    const acquiredAt = this.now().toISOString();
    const entries = await Promise.all(
      request.h3Indices.map(async (h3) => {
        const [lat, lon] = cellToLatLng(h3);
        const cell = await this.sampleCell(
          h3,
          lat,
          lon,
          acquiredAt,
        );
        return [h3, cell] as const;
      }),
    );

    return {
      provider: 'Copernicus Data Space Ecosystem',
      dataset: 'Copernicus DEM GLO-30',
      acquiredAt,
      cells: Object.fromEntries(entries),
    };
  }

  async getPointEvidence(
    request: DemPointRequest,
  ): Promise<DemPointProviderResult> {
    validatePointRequest(request.locations);
    const acquiredAt = this.now().toISOString();
    const entries = await Promise.all(
      request.locations.map(async (location) => {
        const evidence = await this.sampleCell(
          location.h3,
          location.lat,
          location.lon,
          acquiredAt,
          location.id,
        );
        return [location.id, evidence] as const;
      }),
    );

    return {
      provider: 'Copernicus Data Space Ecosystem',
      dataset: 'Copernicus DEM GLO-30',
      acquiredAt,
      locations: Object.fromEntries(entries),
    };
  }

  private async sampleCell(
    h3: string | undefined,
    lat: number,
    lon: number,
    acquiredAt: string,
    entityId?: string,
  ): Promise<DemCellEvidence> {
    const delta = this.neighborOffsetDegrees;
    const [center, north, south, east, west] =
      await Promise.all([
        this.rasterSource.sample(lat, lon),
        this.rasterSource.sample(lat + delta, lon),
        this.rasterSource.sample(lat - delta, lon),
        this.rasterSource.sample(lat, lon + delta),
        this.rasterSource.sample(lat, lon - delta),
      ]);

    const elevationM = rasterSampleEvidence(
      center,
      descriptor({
        h3,
        lat,
        lon,
        acquiredAt,
        unit: 'm',
        transformation: 'sample DEM at H3 centroid',
        transformationVersion: 'dem-centroid-v0.1.0',
        samplingMethod: 'nearest source raster pixel',
        entityId,
      }),
      this.rasterSource.identity,
    );
    const slopeSample = deriveSlopeSample({
      lat,
      delta,
      north,
      south,
      east,
      west,
    });
    const slopeDeg = rasterSampleEvidence(
      slopeSample,
      descriptor({
        h3,
        lat,
        lon,
        acquiredAt,
        unit: 'deg',
        transformation:
          'central finite difference over four neighboring DEM samples',
        transformationVersion: 'dem-slope-v0.1.0',
        samplingMethod:
          'four 1 arc-second offsets around requested point',
        entityId,
      }),
      this.rasterSource.identity,
    );

    return {
      elevationM,
      slopeDeg,
    };
  }
}

export class CopernicusDemRasterSource
  implements PointRasterSource
{
  readonly identity = { kind: 'production' } as const;
  private readonly imageCache = new Map<
    string,
    Promise<RasterImage>
  >();

  async sample(lat: number, lon: number): Promise<RasterSample> {
    if (!validCoordinate(lat, lon)) {
      return {
        status: 'out_of_coverage',
        value: null,
        missingReason:
          'Coordinate lies outside Copernicus DEM tile coordinates',
      };
    }

    const sourceId = copernicusDemTileUrl(lat, lon);

    try {
      const image = await this.loadImage(sourceId);
      const bbox = image.getBoundingBox();
      const width = image.getWidth();
      const height = image.getHeight();
      const x = Math.floor(
        ((lon - bbox[0]) / (bbox[2] - bbox[0])) * width,
      );
      const y = Math.floor(
        ((bbox[3] - lat) / (bbox[3] - bbox[1])) * height,
      );

      if (x < 0 || x >= width || y < 0 || y >= height) {
        return {
          status: 'out_of_coverage',
          value: null,
          missingReason:
            'Coordinate lies outside the loaded Copernicus DEM tile',
          sourceId,
        };
      }

      const rasters = await image.readRasters({
        window: [x, y, x + 1, y + 1],
      });
      const value = firstRasterValue(rasters);
      const noData = image.getGDALNoData?.();

      if (value === null) {
        return {
          status: 'invalid_response',
          value: null,
          missingReason:
            'Copernicus DEM raster returned a non-numeric pixel',
          sourceId,
        };
      }

      if (
        (noData !== null &&
          noData !== undefined &&
          value === noData) ||
        value <= -32767
      ) {
        return {
          status: 'missing',
          value: null,
          missingReason:
            'Copernicus DEM pixel is marked as no-data',
          sourceId,
        };
      }

      if (value < -1000 || value > 9000) {
        return {
          status: 'invalid_response',
          value: null,
          missingReason:
            `Copernicus DEM elevation ${value} m is outside the supported physical range`,
          sourceId,
        };
      }

      return {
        status: 'available',
        value,
        sourceId,
      };
    } catch (error) {
      this.imageCache.delete(sourceId);
      return {
        status: classifyRasterError(error),
        value: null,
        missingReason:
          `Copernicus DEM read failed: ${errorMessage(error)}`,
        sourceId,
      };
    }
  }

  private loadImage(sourceId: string): Promise<RasterImage> {
    const cached = this.imageCache.get(sourceId);

    if (cached !== undefined) {
      return cached;
    }

    const pending = fromUrl(sourceId)
      .then((tiff) => tiff.getImage())
      .then((image) => image as unknown as RasterImage);
    this.imageCache.set(sourceId, pending);
    return pending;
  }
}

export function copernicusDemTileUrl(
  lat: number,
  lon: number,
): string {
  if (!validCoordinate(lat, lon)) {
    throw new Error('Cannot build a DEM tile URL outside coverage');
  }

  const tileLat = Math.floor(lat);
  const tileLon = Math.floor(lon);
  const latHemisphere = tileLat >= 0 ? 'N' : 'S';
  const lonHemisphere = tileLon >= 0 ? 'E' : 'W';
  const latText = Math.abs(tileLat)
    .toString()
    .padStart(2, '0');
  const lonText = Math.abs(tileLon)
    .toString()
    .padStart(3, '0');
  const tile =
    `Copernicus_DSM_COG_10_${latHemisphere}${latText}_00_` +
    `${lonHemisphere}${lonText}_00_DEM`;

  return (
    'https://copernicus-dem-30m.s3.amazonaws.com/' +
    `${tile}/${tile}.tif`
  );
}

function descriptor(input: {
  readonly h3?: string;
  readonly lat: number;
  readonly lon: number;
  readonly acquiredAt: string;
  readonly unit: string;
  readonly transformation: string;
  readonly transformationVersion: string;
  readonly samplingMethod: string;
  readonly entityId?: string;
}): EvidenceDescriptor {
  return {
    unit: input.unit,
    spatial: {
      h3: input.h3,
      lat: input.lat,
      lon: input.lon,
      sourceResolution: COPERNICUS_DEM_RESOLUTION,
    },
    temporal: {
      observedAt: COPERNICUS_DEM_REFERENCE_TIME,
      acquiredAt: input.acquiredAt,
    },
    provenance: {
      provider: 'Copernicus Data Space Ecosystem',
      dataset: 'Copernicus DEM GLO-30',
      datasetVersion: 'GLO-30',
      transformation: input.transformation,
      transformationVersion: input.transformationVersion,
      samplingMethod: input.samplingMethod,
      sourceMetadata: {
        product: 'COP-DEM_GLO-30-DGED',
        sourceGrid: 'geographic 1 arc-second',
        entityId: input.entityId ?? null,
      },
    },
  };
}

function deriveSlopeSample(input: {
  readonly lat: number;
  readonly delta: number;
  readonly north: RasterSample;
  readonly south: RasterSample;
  readonly east: RasterSample;
  readonly west: RasterSample;
}): RasterSample {
  const samples = [
    input.north,
    input.south,
    input.east,
    input.west,
  ];
  const unavailable = samples.filter(
    (sample) => sample.status !== 'available',
  );

  if (unavailable.length > 0) {
    const selected = unavailable.sort(
      (left, right) =>
        failurePriority(right.status) -
        failurePriority(left.status),
    )[0];

    return {
      status: selected.status,
      value: null,
      missingReason:
        'Slope requires north, south, east and west DEM samples: ' +
        unavailable
          .map((sample) => sample.missingReason)
          .filter((reason) => reason.length > 0)
          .join('; '),
      sourceId: selected.sourceId,
    };
  }

  const [north, south, east, west] = samples;

  if (
    north.status !== 'available' ||
    south.status !== 'available' ||
    east.status !== 'available' ||
    west.status !== 'available'
  ) {
    throw new Error('Unreachable slope sample state');
  }

  const metersPerDegreeLatitude = 111_320;
  const eastWestDistance =
    2 *
    input.delta *
    metersPerDegreeLatitude *
    Math.cos((input.lat * Math.PI) / 180);
  const northSouthDistance =
    2 * input.delta * metersPerDegreeLatitude;

  if (
    !Number.isFinite(eastWestDistance) ||
    eastWestDistance <= 0
  ) {
    return {
      status: 'invalid_response',
      value: null,
      missingReason:
        'Slope cannot be derived at this latitude',
    };
  }

  const dzDx =
    (east.value - west.value) / eastWestDistance;
  const dzDy =
    (north.value - south.value) / northSouthDistance;
  const slopeDeg =
    Math.atan(Math.hypot(dzDx, dzDy)) * (180 / Math.PI);

  return {
    status: 'available',
    value: slopeDeg,
    sourceId: [
      north.sourceId,
      south.sourceId,
      east.sourceId,
      west.sourceId,
    ].join('|'),
  };
}

function failurePriority(
  status: RasterSample['status'],
): number {
  const priority: Record<RasterSample['status'], number> = {
    available: 0,
    missing: 1,
    out_of_coverage: 2,
    stale: 3,
    incomplete_window: 4,
    invalid_response: 5,
    upstream_error: 6,
    rate_limited: 7,
    auth_required: 8,
  };

  return priority[status];
}

function firstRasterValue(rasters: unknown): number | null {
  if (
    !Array.isArray(rasters) &&
    !ArrayBuffer.isView(rasters)
  ) {
    return null;
  }

  const firstBand = (
    rasters as unknown as ArrayLike<ArrayLike<number>>
  )[0];

  if (firstBand === undefined) {
    return null;
  }

  const value = Number(firstBand[0]);
  return Number.isFinite(value) ? value : null;
}

function validCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat < 90 &&
    lon >= -180 &&
    lon < 180
  );
}

function validatePointRequest(
  locations: readonly DemPointLocation[],
): void {
  if (locations.length === 0) {
    throw new Error(
      'DEM point request requires at least one location',
    );
  }

  const ids = new Set<string>();

  for (const location of locations) {
    if (location.id.trim().length === 0) {
      throw new Error(
        'DEM point locations require non-empty ids',
      );
    }

    if (ids.has(location.id)) {
      throw new Error(
        `DEM point request contains duplicate id ${location.id}`,
      );
    }
    ids.add(location.id);

    if (!validCoordinate(location.lat, location.lon)) {
      throw new Error(
        `DEM point ${location.id} has invalid coordinates`,
      );
    }

    if (
      location.h3 !== undefined &&
      !isValidCell(location.h3)
    ) {
      throw new Error(
        `DEM point ${location.id} has invalid H3 ${location.h3}`,
      );
    }
  }
}

function validateH3Request(
  h3Indices: readonly string[],
  label: string,
): void {
  if (h3Indices.length === 0) {
    throw new Error(`${label} request requires at least one H3 cell`);
  }

  const invalid = h3Indices.filter((h3) => !isValidCell(h3));

  if (invalid.length > 0) {
    throw new Error(
      `${label} request contains invalid H3 cells: ${invalid.join(', ')}`,
    );
  }

  if (new Set(h3Indices).size !== h3Indices.length) {
    throw new Error(
      `${label} request contains duplicate H3 cells`,
    );
  }
}
