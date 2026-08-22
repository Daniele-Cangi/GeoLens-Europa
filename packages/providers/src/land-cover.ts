import {
  Evidence,
  EvidenceDescriptor,
} from '@geo-lens/evidence';
import { cellToLatLng, isValidCell } from 'h3-js';
import { fromFile, fromUrl } from 'geotiff';
import proj4 from 'proj4';
import {
  classifyRasterError,
  errorMessage,
  PointRasterSource,
  rasterSampleEvidence,
  RasterSample,
} from './raster';

const CORINE_REFERENCE_TIME = '2018-01-01T00:00:00.000Z';
const CORINE_SOURCE_RESOLUTION = '100 m';
const EPSG_3035_PROJ4 =
  '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 ' +
  '+y_0=3210000 +ellps=GRS80 +units=m +no_defs +type=crs';

export const CORINE_LAND_COVER_CODES = [
  111, 112, 121, 122, 123, 124, 131, 132, 133, 141, 142,
  211, 212, 213, 221, 222, 223, 231, 241, 242, 243, 244,
  311, 312, 313, 321, 322, 323, 324, 331, 332, 333, 334,
  335, 411, 412, 421, 422, 423, 511, 512, 521, 522, 523,
] as const;

const validCorineCodes: ReadonlySet<number> = new Set(
  CORINE_LAND_COVER_CODES,
);

interface RasterImage {
  getBoundingBox(): readonly [number, number, number, number];
  getWidth(): number;
  getHeight(): number;
  getGDALNoData?(): number | null;
  getGeoKeys?(): Readonly<Record<string, unknown>>;
  readRasters(options: {
    readonly window: readonly [number, number, number, number];
  }): Promise<unknown>;
}

export interface LandCoverRequest {
  readonly h3Indices: readonly string[];
}

export interface LandCoverCellEvidence {
  readonly classCode: Evidence<number>;
}

export interface LandCoverProviderResult {
  readonly provider: 'Copernicus Land Monitoring Service';
  readonly dataset: 'CORINE Land Cover 2018';
  readonly acquiredAt: string;
  readonly cells: Readonly<
    Record<string, LandCoverCellEvidence>
  >;
}

export interface CorineLandCoverClientOptions {
  readonly rasterLocation?: string;
  readonly rasterSource?: PointRasterSource;
  readonly now?: () => Date;
}

export class CorineLandCoverClient {
  private readonly rasterSource: PointRasterSource | null;
  private readonly now: () => Date;

  constructor(options: CorineLandCoverClientOptions = {}) {
    if (
      options.rasterLocation !== undefined &&
      options.rasterSource !== undefined
    ) {
      throw new Error(
        'CLC accepts either rasterLocation or rasterSource, not both',
      );
    }

    this.rasterSource =
      options.rasterSource ??
      (options.rasterLocation === undefined ||
      options.rasterLocation.trim().length === 0
        ? null
        : new CorineRasterSource(options.rasterLocation));
    this.now = options.now ?? (() => new Date());
  }

  async getEvidence(
    request: LandCoverRequest,
  ): Promise<LandCoverProviderResult> {
    validateH3Request(request.h3Indices);
    const acquiredAt = this.now().toISOString();
    const entries = await Promise.all(
      request.h3Indices.map(async (h3) => {
        const [lat, lon] = cellToLatLng(h3);
        const evidence = await this.sampleCell(
          h3,
          lat,
          lon,
          acquiredAt,
        );
        return [h3, { classCode: evidence }] as const;
      }),
    );

    return {
      provider: 'Copernicus Land Monitoring Service',
      dataset: 'CORINE Land Cover 2018',
      acquiredAt,
      cells: Object.fromEntries(entries),
    };
  }

  private async sampleCell(
    h3: string,
    lat: number,
    lon: number,
    acquiredAt: string,
  ): Promise<Evidence<number>> {
    const descriptorValue = descriptor(
      h3,
      lat,
      lon,
      acquiredAt,
    );

    if (!hasApproximateCorineCoverage(lat, lon)) {
      return rasterSampleEvidence(
        {
          status: 'out_of_coverage',
          value: null,
          missingReason:
            'H3 centroid lies outside approximate EEA39 coverage',
        },
        descriptorValue,
        { kind: 'production' },
      );
    }

    if (this.rasterSource === null) {
      return rasterSampleEvidence(
        {
          status: 'missing',
          value: null,
          missingReason:
            'CLC2018 raster is not configured; set an explicit raster location',
        },
        descriptorValue,
        { kind: 'production' },
      );
    }

    const sampled = normalizeCorineSample(
      await this.rasterSource.sample(lat, lon),
    );

    return rasterSampleEvidence(
      sampled,
      descriptorValue,
      this.rasterSource.identity,
    );
  }
}

export class CorineRasterSource implements PointRasterSource {
  readonly identity = { kind: 'production' } as const;
  private imagePromise: Promise<RasterImage> | null = null;

  constructor(private readonly rasterLocation: string) {
    if (rasterLocation.trim().length === 0) {
      throw new Error('CLC raster location must be non-empty');
    }
  }

  async sample(lat: number, lon: number): Promise<RasterSample> {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return {
        status: 'out_of_coverage',
        value: null,
        missingReason: 'Coordinate is outside valid geographic bounds',
      };
    }

    try {
      const image = await this.loadImage();
      const bbox = image.getBoundingBox();
      const width = image.getWidth();
      const height = image.getHeight();
      const coordinate = corineSourceCoordinate(
        lat,
        lon,
        image.getGeoKeys?.() ?? {},
      );

      if (coordinate === null) {
        return {
          status: 'invalid_response',
          value: null,
          missingReason:
            'CLC raster CRS must be EPSG:3035 or EPSG:4326',
          sourceId: this.rasterLocation,
        };
      }

      const x = Math.floor(
        ((coordinate.x - bbox[0]) / (bbox[2] - bbox[0])) *
          width,
      );
      const y = Math.floor(
        ((bbox[3] - coordinate.y) / (bbox[3] - bbox[1])) *
          height,
      );

      if (x < 0 || x >= width || y < 0 || y >= height) {
        return {
          status: 'out_of_coverage',
          value: null,
          missingReason:
            'Coordinate lies outside the configured CLC raster',
          sourceId: this.rasterLocation,
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
            'CLC raster returned a non-numeric class code',
          sourceId: this.rasterLocation,
        };
      }

      if (
        value === 0 ||
        (noData !== null &&
          noData !== undefined &&
          value === noData)
      ) {
        return {
          status: 'missing',
          value: null,
          missingReason: 'CLC raster pixel is marked as no-data',
          sourceId: this.rasterLocation,
        };
      }

      return normalizeCorineSample({
        status: 'available',
        value,
        sourceId: this.rasterLocation,
      });
    } catch (error) {
      this.imagePromise = null;
      return {
        status: classifyRasterError(error),
        value: null,
        missingReason:
          `CLC raster read failed: ${errorMessage(error)}`,
        sourceId: this.rasterLocation,
      };
    }
  }

  private loadImage(): Promise<RasterImage> {
    if (this.imagePromise !== null) {
      return this.imagePromise;
    }

    const location = this.rasterLocation;
    this.imagePromise = (
      /^https?:\/\//i.test(location)
        ? fromUrl(location)
        : fromFile(location)
    )
      .then((tiff) => tiff.getImage())
      .then((image) => image as unknown as RasterImage);

    return this.imagePromise;
  }
}

export function corineSourceCoordinate(
  lat: number,
  lon: number,
  geoKeys: Readonly<Record<string, unknown>>,
): {
  readonly x: number;
  readonly y: number;
  readonly crs: 'EPSG:3035' | 'EPSG:4326';
} | null {
  const projected = numericGeoKey(
    geoKeys.ProjectedCSTypeGeoKey,
  );
  const geographic = numericGeoKey(
    geoKeys.GeographicTypeGeoKey,
  );

  if (projected === 3035) {
    const [x, y] = proj4(
      'EPSG:4326',
      EPSG_3035_PROJ4,
      [lon, lat],
    );

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return {
      x,
      y,
      crs: 'EPSG:3035',
    };
  }

  if (
    projected === undefined &&
    geographic === 4326
  ) {
    return {
      x: lon,
      y: lat,
      crs: 'EPSG:4326',
    };
  }

  return null;
}

function numericGeoKey(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? numberValue
    : undefined;
}

function descriptor(
  h3: string,
  lat: number,
  lon: number,
  acquiredAt: string,
): EvidenceDescriptor {
  return {
    unit: 'CLC class code',
    spatial: {
      h3,
      lat,
      lon,
      sourceResolution: CORINE_SOURCE_RESOLUTION,
    },
    temporal: {
      observedAt: CORINE_REFERENCE_TIME,
      acquiredAt,
    },
    provenance: {
      provider: 'Copernicus Land Monitoring Service',
      dataset: 'CORINE Land Cover',
      datasetVersion: 'CLC2018',
      transformation: 'sample CLC raster at H3 centroid',
      transformationVersion: 'clc-centroid-v0.1.0',
      samplingMethod:
        'nearest source raster pixel after explicit CRS transform',
      sourceMetadata: {
        nomenclature: 'CLC level 3',
        classCount: CORINE_LAND_COVER_CODES.length,
        supportedRasterCrs: ['EPSG:3035', 'EPSG:4326'],
      },
    },
  };
}

function normalizeCorineSample(
  sample: RasterSample,
): RasterSample {
  if (sample.status !== 'available') {
    return sample;
  }

  if (
    !Number.isInteger(sample.value) ||
    !validCorineCodes.has(sample.value)
  ) {
    return {
      status: 'invalid_response',
      value: null,
      missingReason:
        `CLC raster returned unsupported class code ${sample.value}`,
      sourceId: sample.sourceId,
    };
  }

  return sample;
}

function hasApproximateCorineCoverage(
  lat: number,
  lon: number,
): boolean {
  return lat >= 27 && lat <= 72 && lon >= -32 && lon <= 45;
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

function validateH3Request(h3Indices: readonly string[]): void {
  if (h3Indices.length === 0) {
    throw new Error('CLC request requires at least one H3 cell');
  }

  const invalid = h3Indices.filter((h3) => !isValidCell(h3));

  if (invalid.length > 0) {
    throw new Error(
      `CLC request contains invalid H3 cells: ${invalid.join(', ')}`,
    );
  }

  if (new Set(h3Indices).size !== h3Indices.length) {
    throw new Error('CLC request contains duplicate H3 cells');
  }
}
