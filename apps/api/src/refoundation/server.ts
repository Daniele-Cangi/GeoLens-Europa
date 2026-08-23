import compress from '@fastify/compress';
import cors from '@fastify/cors';
import Fastify, {
  FastifyInstance,
  FastifyServerOptions,
} from 'fastify';
import {
  EnvironmentalEvidenceComposer,
  runStormwaterProofZero,
} from '@geo-lens/proof-zero';
import { CopernicusDemClient } from '@geo-lens/providers';
import {
  AmsterdamWaternetAcquisition,
  AmsterdamWaternetBbox,
  analyzeOutfallConnectivity,
  AmsterdamWaternetWfsClient,
  buildBoundedSurfaceCatchmentGrid,
  deriveSurfaceCatchmentProxy,
  importAmsterdamWaternetStormwater,
  importStormwaterGeoJson,
  ImportedStormwaterNetwork,
  orientStormwaterNetworkByPipeInverts,
  OutfallConnectivityAnalysis,
  StormwaterTopology,
} from '@geo-lens/stormwater';

const DEFAULT_NODE_H3_RESOLUTION = 11;
const DEFAULT_WATERNET_BBOX: AmsterdamWaternetBbox = {
  latMin: 52.3375,
  lonMin: 4.8978,
  latMax: 52.3395,
  lonMax: 4.8995,
};
const WATERNET_SNAP_TOLERANCE_M = 0.25;
const WATERNET_MINIMUM_RESOLVABLE_INVERT_DROP_M =
  0.05;
const SURFACE_PROXY_H3_RESOLUTION = 11;
const SURFACE_PROXY_OUTFALL_SOURCE_RECORD_ID =
  '8522CE11-8DC1-41CC-9375-EDECAB742620';
const MAX_SURFACE_PROXY_TARGET_H3_CELLS = 100;
const MAX_SURFACE_PROXY_SAMPLED_H3_CELLS = 180;
const DEFAULT_CATCHMENT_H3_RESOLUTION = 13;
const DEFAULT_SNAP_TOLERANCE_M = 5;
const DEFAULT_MINIMUM_RESOLVABLE_DROP_M = 0.1;
const MAX_FEATURES = 500;
const MAX_COORDINATES = 10_000;
const MAX_LATITUDE_SPAN_DEG = 0.25;
const MAX_LONGITUDE_SPAN_DEG = 0.25;
const MAX_NODES = 100;
const MAX_PIPES = 200;
const MAX_CATCHMENTS = 50;
const MAX_CATCHMENT_H3_CELLS = 500;

export interface GeoLensApiRuntime {
  readonly imergServiceConfigured: boolean;
  readonly clcRasterConfigured: boolean;
}

export interface BuildGeoLensApiOptions {
  readonly evidenceComposer: EnvironmentalEvidenceComposer;
  readonly now?: () => Date;
  readonly logger?: FastifyServerOptions['logger'];
  readonly runtime?: GeoLensApiRuntime;
  readonly waternetClient?: Pick<
    AmsterdamWaternetWfsClient,
    'acquire'
  >;
  readonly demClient?: Pick<
    CopernicusDemClient,
    'getElevationEvidence'
  >;
}

interface ParsedProofZeroRequest {
  readonly network: unknown;
  readonly networkId: string;
  readonly referenceTime: Date;
  readonly nodeH3Resolution: number;
  readonly catchmentH3Resolution: number;
  readonly snapToleranceM: number;
  readonly minimumResolvableDropM: number;
}

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export function buildGeoLensApi(
  options: BuildGeoLensApiOptions,
): FastifyInstance {
  const now = options.now ?? (() => new Date());
  const server = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1_048_576,
  });
  const waternetClient =
    options.waternetClient ??
    new AmsterdamWaternetWfsClient({ now });
  const demClient =
    options.demClient ?? new CopernicusDemClient({ now });

  server.register(cors);
  server.register(compress, { global: true });

  server.get('/health', async () => ({
    status: 'ok',
    service: 'geolens-proof-zero-api',
    coreRequiresAi: false,
    coreRequiresMineralModel: false,
    runtime: options.runtime ?? {
      imergServiceConfigured: false,
      clcRasterConfigured: false,
    },
  }));

  server.get('/', async () => ({
    service: 'GeoLens Spatial Evidence API',
    version: '0.1.0',
    mission:
      'traceable environmental evidence through a stormwater network',
    endpoints: {
      health: '/health',
      observedInfrastructure:
        'GET /api/infrastructure/amsterdam-waternet',
      proofZero: 'POST /api/proof-zero/run',
    },
  }));

  server.get(
    '/api/infrastructure/amsterdam-waternet',
    async (request, reply) => {
      let bbox: AmsterdamWaternetBbox;

      try {
        bbox = parseWaternetBbox(request.query);
      } catch (error) {
        return reply.code(400).send({
          status: 'invalid_request',
          error:
            error instanceof Error
              ? error.message
              : 'Invalid Waternet bbox',
        });
      }

      let acquisition:
        AmsterdamWaternetAcquisition;

      try {
        acquisition =
          await waternetClient.acquire({ bbox });
      } catch (error) {
        return reply.code(400).send({
          status: 'invalid_request',
          error:
            error instanceof Error
              ? error.message
              : 'Invalid Waternet request',
        });
      }

      if (acquisition.status !== 'available') {
        return reply.code(200).send(acquisition);
      }

      try {
        const imported =
          importAmsterdamWaternetStormwater(
            acquisition.snapshot,
            {
              networkId:
                'amsterdam-waternet-observed',
              acquiredAt:
                acquisition.receipt.acquiredAt,
              nodeH3Resolution:
                DEFAULT_NODE_H3_RESOLUTION,
              snapToleranceM:
                WATERNET_SNAP_TOLERANCE_M,
              bboxWfsAxisOrder:
                acquisition.receipt
                  .bboxWfsAxisOrder,
              retrievalMode: 'live',
            },
          );

        const oriented =
          orientStormwaterNetworkByPipeInverts(
            imported.topology,
            {
              minimumResolvableDropM:
                WATERNET_MINIMUM_RESOLVABLE_INVERT_DROP_M,
            },
          );
        const outfallConnectivity =
          analyzeOutfallConnectivity(oriented);
        const directionCounts = Object.values(
          oriented.directions,
        ).reduce(
          (counts, direction) => {
            counts[direction.status] += 1;
            return counts;
          },
          { known: 0, ambiguous: 0, unknown: 0 },
        );
        const surfaceCatchmentProxy =
          await composeObservedSurfaceCatchmentProxy({
            topology: imported.topology,
            bbox,
            outfallConnectivity,
            demClient,
            derivedAt: now().toISOString(),
          });

        return reply.code(200).send({
          status: 'available',
          acquisition: acquisition.receipt,
          import: imported.receipt,
          topology: imported.topology,
          orientation: {
            modelVersion: oriented.orientationVersion,
            evidenceBasis: oriented.evidenceBasis,
            minimumResolvableDropM:
              oriented.minimumResolvableDropM,
            thresholdSemantics:
              'configured analysis threshold; not provider survey accuracy',
            counts: directionCounts,
            directions: oriented.directions,
          },
          outfallConnectivity,
          surfaceCatchmentProxy,
        });
      } catch (error) {
        request.log.error(error);

        return reply.code(200).send({
          status: 'invalid_response',
          missingReason:
            error instanceof Error
              ? error.message
              : 'Waternet response could not be imported',
          failedLayer: 'both',
          receipt: acquisition.receipt,
        });
      }
    },
  );

  server.post('/api/proof-zero/run', async (request, reply) => {
    let parsed: ParsedProofZeroRequest;
    let imported: ImportedStormwaterNetwork;

    try {
      parsed = parseProofZeroRequest(request.body);
      validateBoundedGeoJson(parsed.network);
      const importedAt = now().toISOString();
      imported = importStormwaterGeoJson(parsed.network, {
        networkId: parsed.networkId,
        source: {
          origin: 'user_supplied',
          provider: 'geolens-api',
          dataset: 'submitted-stormwater-geojson',
          acquiredAt: importedAt,
          sourceCrs: 'EPSG:4326',
          outputCrs: 'EPSG:4326',
          transformation:
            'parse typed node, pipe, and catchment features; snap pipe geometry endpoints',
          transformationVersion:
            'stormwater-geojson-import-v0.2.0',
        },
        nodeH3Resolution: parsed.nodeH3Resolution,
        catchmentH3Resolution:
          parsed.catchmentH3Resolution,
        snapToleranceM: parsed.snapToleranceM,
      });
      validateImportedSize(imported);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Invalid Proof 0 request';

      return reply.code(400).send({
        status: 'invalid_request',
        error: message,
      });
    }

    try {
      const result = await runStormwaterProofZero(
        imported,
        options.evidenceComposer,
        {
          referenceTime: parsed.referenceTime,
          derivedAt: now().toISOString(),
          minimumResolvableDropM:
            parsed.minimumResolvableDropM,
        },
      );

      return reply.code(200).send(result);
    } catch (error) {
      request.log.error(error);

      return reply.code(500).send({
        status: 'execution_error',
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected Proof 0 execution error',
      });
    }
  });

  return server;
}

async function composeObservedSurfaceCatchmentProxy(input: {
  readonly topology: StormwaterTopology;
  readonly bbox: AmsterdamWaternetBbox;
  readonly outfallConnectivity: OutfallConnectivityAnalysis;
  readonly demClient: Pick<
    CopernicusDemClient,
    'getElevationEvidence'
  >;
  readonly derivedAt: string;
}) {
  const outfall = Object.values(input.topology.nodes).find(
    (node) =>
      node.type === 'outfall' &&
      node.source.sourceRecordId ===
        SURFACE_PROXY_OUTFALL_SOURCE_RECORD_ID,
  );

  if (outfall === undefined) {
    return {
      status: 'out_of_coverage' as const,
      missingReason:
        `Observed outfall ${SURFACE_PROXY_OUTFALL_SOURCE_RECORD_ID} is absent from the bounded Waternet topology`,
      result: null,
      networkUse: null,
    };
  }

  const connectivity =
    input.outfallConnectivity.outfalls[outfall.id];

  if (connectivity === undefined) {
    return {
      status: 'invalid_response' as const,
      missingReason:
        `Outfall connectivity omitted observed node ${outfall.id}`,
      result: null,
      networkUse: null,
    };
  }

  const networkUse = {
    eligibleForSewerPropagation: false,
    reasons: [
      'not_observed_sewer_catchment',
      'environmental_runoff_not_composed',
      ...(connectivity.status ===
      'blocked_by_unresolved_direction'
        ? ['outfall_network_direction_unresolved']
        : []),
    ],
    outfallConnectivityStatus: connectivity.status,
    unresolvedBoundaryPipeIds:
      connectivity.unresolvedBoundaryPipeIds,
    orientationThresholdM:
      input.outfallConnectivity.minimumResolvableDropM,
  };
  let grid;

  try {
    grid = buildBoundedSurfaceCatchmentGrid({
      bbox: input.bbox,
      h3Resolution: SURFACE_PROXY_H3_RESOLUTION,
      outfallPosition: outfall.position,
    });
  } catch (error) {
    return {
      status: 'invalid_response' as const,
      missingReason:
        `Surface proxy grid could not be built: ${errorMessage(error)}`,
      result: null,
      networkUse,
    };
  }

  if (
    grid.targetH3Indices.length >
      MAX_SURFACE_PROXY_TARGET_H3_CELLS ||
    grid.sampledH3Indices.length >
      MAX_SURFACE_PROXY_SAMPLED_H3_CELLS
  ) {
    return {
      status: 'out_of_coverage' as const,
      missingReason:
        `Surface proxy grid exceeds the bounded limit (${grid.targetH3Indices.length} target / ${grid.sampledH3Indices.length} sampled H3 cells)`,
      result: null,
      networkUse,
    };
  }

  let elevation;

  try {
    elevation = await input.demClient.getElevationEvidence({
      h3Indices: grid.sampledH3Indices,
    });
  } catch (error) {
    return {
      status: 'upstream_error' as const,
      missingReason:
        `Copernicus DEM acquisition failed: ${errorMessage(error)}`,
      result: null,
      networkUse,
    };
  }

  try {
    const result = deriveSurfaceCatchmentProxy({
      id: 'amsterdam-waternet-outfall-8522-surface-proxy',
      outfallNodeId: outfall.id,
      outfallPosition: outfall.position,
      grid,
      elevationByH3: elevation.cells,
      derivedAt: input.derivedAt,
    });

    return {
      status: result.status,
      missingReason:
        result.contributingAreaM2.quality.missingReason ?? null,
      result,
      networkUse,
    };
  } catch (error) {
    return {
      status: 'invalid_response' as const,
      missingReason:
        `Surface proxy derivation failed: ${errorMessage(error)}`,
      result: null,
      networkUse,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'unknown error';
}

function parseWaternetBbox(
  query: unknown,
): AmsterdamWaternetBbox {
  if (!isRecord(query)) {
    return DEFAULT_WATERNET_BBOX;
  }

  const names = [
    'latMin',
    'lonMin',
    'latMax',
    'lonMax',
  ] as const;
  const present = names.filter(
    (name) => query[name] !== undefined,
  );

  if (present.length === 0) {
    return DEFAULT_WATERNET_BBOX;
  }

  if (present.length !== names.length) {
    throw new RequestValidationError(
      'Waternet bbox requires latMin, lonMin, latMax and lonMax together',
    );
  }

  return {
    latMin: queryNumber(query.latMin, 'latMin'),
    lonMin: queryNumber(query.lonMin, 'lonMin'),
    latMax: queryNumber(query.latMax, 'latMax'),
    lonMax: queryNumber(query.lonMax, 'lonMax'),
  };
}

function queryNumber(
  value: unknown,
  name: string,
): number {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new RequestValidationError(
      `${name} must be a finite query number`,
    );
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new RequestValidationError(
      `${name} must be a finite query number`,
    );
  }

  return parsed;
}

function parseProofZeroRequest(
  body: unknown,
): ParsedProofZeroRequest {
  if (!isRecord(body)) {
    throw new RequestValidationError(
      'Request body must be an object',
    );
  }

  if (body.network === undefined) {
    throw new RequestValidationError(
      'Request body requires network GeoJSON',
    );
  }

  if (
    typeof body.referenceTime !== 'string' ||
    Number.isNaN(Date.parse(body.referenceTime))
  ) {
    throw new RequestValidationError(
      'referenceTime must be an explicit ISO timestamp',
    );
  }

  const networkId =
    body.networkId === undefined
      ? 'proof-zero-request'
      : stringOption(body.networkId, 'networkId');

  return {
    network: body.network,
    networkId,
    referenceTime: new Date(body.referenceTime),
    nodeH3Resolution: integerOption(
      body.nodeH3Resolution,
      'nodeH3Resolution',
      DEFAULT_NODE_H3_RESOLUTION,
      0,
      15,
    ),
    catchmentH3Resolution: integerOption(
      body.catchmentH3Resolution,
      'catchmentH3Resolution',
      DEFAULT_CATCHMENT_H3_RESOLUTION,
      0,
      15,
    ),
    snapToleranceM: numberOption(
      body.snapToleranceM,
      'snapToleranceM',
      DEFAULT_SNAP_TOLERANCE_M,
      0,
    ),
    minimumResolvableDropM: numberOption(
      body.minimumResolvableDropM,
      'minimumResolvableDropM',
      DEFAULT_MINIMUM_RESOLVABLE_DROP_M,
      0,
      true,
    ),
  };
}

function validateBoundedGeoJson(network: unknown): void {
  if (
    !isRecord(network) ||
    network.type !== 'FeatureCollection' ||
    !Array.isArray(network.features)
  ) {
    throw new RequestValidationError(
      'network must be a GeoJSON FeatureCollection',
    );
  }

  if (network.features.length > MAX_FEATURES) {
    throw new RequestValidationError(
      `Proof 0 accepts at most ${MAX_FEATURES} features`,
    );
  }

  const coordinates: Array<readonly [number, number]> = [];

  for (const feature of network.features) {
    if (
      !isRecord(feature) ||
      !isRecord(feature.geometry)
    ) {
      continue;
    }

    collectCoordinates(
      feature.geometry.coordinates,
      coordinates,
    );

    if (coordinates.length > MAX_COORDINATES) {
      throw new RequestValidationError(
        `Proof 0 accepts at most ${MAX_COORDINATES} coordinates`,
      );
    }
  }

  if (coordinates.length === 0) {
    throw new RequestValidationError(
      'network contains no coordinates',
    );
  }

  const latitudes = coordinates.map((value) => value[1]);
  const longitudes = coordinates.map((value) => value[0]);
  const latitudeSpan =
    Math.max(...latitudes) - Math.min(...latitudes);
  const longitudeSpan =
    Math.max(...longitudes) - Math.min(...longitudes);

  if (
    latitudeSpan > MAX_LATITUDE_SPAN_DEG ||
    longitudeSpan > MAX_LONGITUDE_SPAN_DEG
  ) {
    throw new RequestValidationError(
      'Proof 0 network exceeds the bounded 0.25° × 0.25° area limit',
    );
  }
}

function collectCoordinates(
  value: unknown,
  output: Array<readonly [number, number]>,
): void {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    output.push([value[0], value[1]]);
    return;
  }

  for (const child of value) {
    collectCoordinates(child, output);
  }
}

function validateImportedSize(
  imported: ImportedStormwaterNetwork,
): void {
  const nodeCount = Object.keys(
    imported.topology.nodes,
  ).length;
  const pipeCount = Object.keys(
    imported.topology.pipes,
  ).length;
  const catchmentCount = imported.catchments.length;
  const catchmentCellCount = imported.catchments.reduce(
    (sum, catchment) => sum + catchment.cells.length,
    0,
  );

  if (nodeCount > MAX_NODES) {
    throw new RequestValidationError(
      `Proof 0 accepts at most ${MAX_NODES} nodes`,
    );
  }

  if (pipeCount > MAX_PIPES) {
    throw new RequestValidationError(
      `Proof 0 accepts at most ${MAX_PIPES} pipes`,
    );
  }

  if (catchmentCount > MAX_CATCHMENTS) {
    throw new RequestValidationError(
      `Proof 0 accepts at most ${MAX_CATCHMENTS} catchments`,
    );
  }

  if (catchmentCellCount > MAX_CATCHMENT_H3_CELLS) {
    throw new RequestValidationError(
      `Proof 0 accepts at most ${MAX_CATCHMENT_H3_CELLS} catchment H3 cells`,
    );
  }
}

function integerOption(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RequestValidationError(
      `${name} must be an integer from ${minimum} to ${maximum}`,
    );
  }

  return value;
}

function numberOption(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  allowMinimum = false,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (allowMinimum ? value < minimum : value <= minimum)
  ) {
    throw new RequestValidationError(
      `${name} must be a finite number ${allowMinimum ? '>=' : '>'} ${minimum}`,
    );
  }

  return value;
}

function stringOption(
  value: unknown,
  name: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new RequestValidationError(
      `${name} must be a non-empty string`,
    );
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
