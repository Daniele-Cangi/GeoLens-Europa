import 'dotenv/config';

import { buildGeoLensApi } from './refoundation/server';
import { createProductionComposer } from './refoundation/production';

const port = environmentPort(process.env.PORT, 3003);
const production = createProductionComposer({
  NASA_PRECIP_SERVICE_URL:
    process.env.NASA_PRECIP_SERVICE_URL,
  CLC_RASTER_PATH: process.env.CLC_RASTER_PATH,
});
const server = buildGeoLensApi({
  evidenceComposer: production.evidenceComposer,
  logger: true,
  runtime: production.runtime,
});

async function start(): Promise<void> {
  try {
    await server.listen({
      port,
      host: '0.0.0.0',
    });
  } catch (error) {
    server.log.error(error);
    process.exitCode = 1;
  }
}

void start();

function environmentPort(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0 ||
    parsed > 65_535
  ) {
    throw new Error(
      'PORT must be an integer from 1 to 65535',
    );
  }

  return parsed;
}
