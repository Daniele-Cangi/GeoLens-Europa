import {
  CanonicalEnvironmentalEvidenceComposer,
  EnvironmentalEvidenceComposer,
} from '@geo-lens/proof-zero';
import {
  CopernicusDemClient,
  CorineLandCoverClient,
  NasaImergClient,
} from '@geo-lens/providers';

export interface ProductionEnvironment {
  readonly NASA_PRECIP_SERVICE_URL?: string;
  readonly CLC_RASTER_PATH?: string;
}

export interface ProductionComposer {
  readonly evidenceComposer: EnvironmentalEvidenceComposer;
  readonly runtime: {
    readonly imergServiceConfigured: boolean;
    readonly clcRasterConfigured: boolean;
  };
}

export function createProductionComposer(
  environment: ProductionEnvironment,
): ProductionComposer {
  const configuredImergUrl =
    environment.NASA_PRECIP_SERVICE_URL?.trim();
  const imergServiceUrl =
    configuredImergUrl &&
    configuredImergUrl.length > 0
      ? configuredImergUrl
      : 'http://127.0.0.1:8001';
  const configuredClcPath =
    environment.CLC_RASTER_PATH?.trim();

  return {
    evidenceComposer:
      new CanonicalEnvironmentalEvidenceComposer({
        clients: {
          imerg: new NasaImergClient({
            baseUrl: imergServiceUrl,
          }),
          dem: new CopernicusDemClient(),
          landCover: new CorineLandCoverClient({
            rasterLocation:
              configuredClcPath &&
              configuredClcPath.length > 0
                ? configuredClcPath
                : undefined,
          }),
        },
      }),
    runtime: {
      imergServiceConfigured:
        configuredImergUrl !== undefined &&
        configuredImergUrl.length > 0,
      clcRasterConfigured:
        configuredClcPath !== undefined &&
        configuredClcPath.length > 0,
    },
  };
}
