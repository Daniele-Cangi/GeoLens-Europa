import compress from '@fastify/compress';
import { EvidenceStatus } from '@geo-lens/evidence';
import cors from '@fastify/cors';
import Fastify, {
  FastifyInstance,
  FastifyServerOptions,
} from 'fastify';
import {
  EnvironmentalEvidenceComposer,
  composeConditionedSurfaceRunoff,
  runStormwaterProofZero,
} from '@geo-lens/proof-zero';
import {
  AhnDtmClient,
  classifyBgtSurfaceH3Cells,
  PdokBgtSurfaceClient,
} from '@geo-lens/providers';
import {
  AmsterdamWaternetAcquisition,
  AmsterdamWaternetBbox,
  analyzeOutfallConnectivity,
  AmsterdamWaternetWfsClient,
  assessGwswOutfallAreaContext,
  buildBoundedSurfaceCatchmentGrid,
  deriveConditionedSurfaceCatchmentProxy,
  deriveSurfaceCatchmentProxy,
  importAmsterdamWaternetStormwater,
  importStormwaterGeoJson,
  missingBgtInflowTableAttachmentAssessment,
  ImportedStormwaterNetwork,
  orientStormwaterNetworkByPipeInverts,
  OutfallConnectivityAnalysis,
  OutfallConnectivityState,
  PdokGwswAreaClient,
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
const SURFACE_PROXY_H3_RESOLUTION = 13;
const SURFACE_PROXY_OUTFALL_SOURCE_RECORD_ID =
  '8522CE11-8DC1-41CC-9375-EDECAB742620';
const MAX_SURFACE_PROXY_TARGET_H3_CELLS = 800;
const MAX_SURFACE_PROXY_SAMPLED_H3_CELLS = 950;
const DEFAULT_OBSERVED_ENVIRONMENT_REFERENCE_TIME =
  '2026-08-20T00:00:00.000Z';
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
  readonly surfaceElevationClient?: Pick<
    AhnDtmClient,
    'getElevationEvidence'
  >;
  readonly gwswAreaClient?: Pick<
    PdokGwswAreaClient,
    'acquire'
  >;
  readonly bgtSurfaceClient?: Pick<
    PdokBgtSurfaceClient,
    'acquire'
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
  const surfaceElevationClient =
    options.surfaceElevationClient ?? new AhnDtmClient({ now });
  const gwswAreaClient =
    options.gwswAreaClient ?? new PdokGwswAreaClient({ now });
  const bgtSurfaceClient =
    options.bgtSurfaceClient ?? new PdokBgtSurfaceClient({ now });

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
      let environmentalReferenceTime: Date;

      try {
        bbox = parseWaternetBbox(request.query);
        environmentalReferenceTime =
          parseObservedEnvironmentReferenceTime(request.query);
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
        const [
          outfallAreaContext,
          surfaceCatchmentEvidence,
        ] = await Promise.all([
          composeObservedGwswOutfallAreaContext({
            topology: imported.topology,
            bbox,
            gwswAreaClient,
          }),
          composeObservedSurfaceCatchmentEvidence({
            topology: imported.topology,
            bbox,
            outfallConnectivity,
            surfaceElevationClient,
            bgtSurfaceClient,
            evidenceComposer: options.evidenceComposer,
            environmentalReferenceTime,
            derivedAt: now().toISOString(),
          }),
        ]);

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
            numericComparisonToleranceM:
              oriented.numericComparisonToleranceM,
            thresholdSemantics:
              'direction is resolvable at or above the configured drop; ' +
              'numeric tolerance is capped at one micrometre and one percent of the boundary; it is not provider survey accuracy',
            counts: directionCounts,
            directions: oriented.directions,
          },
          outfallConnectivity,
          outfallAreaContext,
          authoritativeSurfaceNetworkAttachment:
            missingBgtInflowTableAttachmentAssessment({
              acquiredAt: now().toISOString(),
              missingReason:
                'No Amsterdam owner-published BGT Inlooptabel, hydraulic surface relation, or equivalent exact Waternet asset crosswalk is configured; none was located in the current public catalogs for this bounded proof',
            }),
          surfaceCatchmentProxy:
            surfaceCatchmentEvidence.raw,
          conditionedSurfaceCatchmentProxy:
            surfaceCatchmentEvidence.conditioned,
          conditionedSurfaceRunoff:
            surfaceCatchmentEvidence.runoff,
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

async function composeObservedGwswOutfallAreaContext(input: {
  readonly topology: StormwaterTopology;
  readonly bbox: AmsterdamWaternetBbox;
  readonly gwswAreaClient: Pick<PdokGwswAreaClient, 'acquire'>;
}) {
  const outfall = selectedSurfaceProxyOutfall(input.topology);

  if (outfall === undefined) {
    return {
      status: 'out_of_coverage' as const,
      missingReason:
        'Observed outfall ' +
        SURFACE_PROXY_OUTFALL_SOURCE_RECORD_ID +
        ' is absent from the bounded Waternet topology',
      result: null,
    };
  }

  try {
    const acquisition = await input.gwswAreaClient.acquire({
      bbox: input.bbox,
    });
    const sourceReference =
      outfall.source.sourceAttributes?.pumpingAreaId;
    const waternetPumpingAreaReference =
      typeof sourceReference === 'string'
        ? sourceReference
        : typeof sourceReference === 'number'
          ? String(sourceReference)
          : null;
    const result = assessGwswOutfallAreaContext({
      acquisition,
      outfallNodeId: outfall.id,
      outfallPosition: outfall.position,
      waternetPumpingAreaReference,
    });

    return {
      status: result.status,
      missingReason:
        acquisition.status === 'available'
          ? result.status === 'out_of_coverage'
            ? result.attachment.reason
            : null
          : acquisition.missingReason,
      result,
    };
  } catch (error) {
    return {
      status: 'upstream_error' as const,
      missingReason:
        'PDOK GWSW area acquisition failed: ' +
        errorMessage(error),
      result: null,
    };
  }
}

function selectedSurfaceProxyOutfall(
  topology: StormwaterTopology,
) {
  return Object.values(topology.nodes).find(
    (node) =>
      node.type === 'outfall' &&
      node.source.sourceRecordId ===
        SURFACE_PROXY_OUTFALL_SOURCE_RECORD_ID,
  );
}

async function composeObservedSurfaceCatchmentEvidence(input: {
  readonly topology: StormwaterTopology;
  readonly bbox: AmsterdamWaternetBbox;
  readonly outfallConnectivity: OutfallConnectivityAnalysis;
  readonly surfaceElevationClient: Pick<
    AhnDtmClient,
    'getElevationEvidence'
  >;
  readonly bgtSurfaceClient: Pick<
    PdokBgtSurfaceClient,
    'acquire'
  >;
  readonly evidenceComposer: EnvironmentalEvidenceComposer;
  readonly environmentalReferenceTime: Date;
  readonly derivedAt: string;
}) {
  const outfall = selectedSurfaceProxyOutfall(input.topology);

  if (outfall === undefined) {
    const missingReason =
      'Observed outfall ' +
      SURFACE_PROXY_OUTFALL_SOURCE_RECORD_ID +
      ' is absent from the bounded Waternet topology';
    return {
      raw: {
        status: 'out_of_coverage' as const,
        missingReason,
        result: null,
        networkUse: null,
      },
      conditioned: {
        status: 'out_of_coverage' as const,
        missingReason,
        result: null,
        surfaceAcquisition: null,
        networkUse: null,
      },
      runoff: unavailableConditionedSurfaceRunoff(
        'out_of_coverage',
        missingReason,
      ),
    };
  }

  const connectivity = input.outfallConnectivity.outfalls[outfall.id];
  if (connectivity === undefined) {
    const missingReason =
      'Outfall connectivity omitted observed node ' + outfall.id;
    return {
      raw: {
        status: 'invalid_response' as const,
        missingReason,
        result: null,
        networkUse: null,
      },
      conditioned: {
        status: 'invalid_response' as const,
        missingReason,
        result: null,
        surfaceAcquisition: null,
        networkUse: null,
      },
      runoff: unavailableConditionedSurfaceRunoff(
        'invalid_response',
        missingReason,
      ),
    };
  }

  const rawNetworkUse = {
    eligibleForSewerPropagation: false as const,
    reasons: [
      'not_observed_sewer_catchment',
      'environmental_runoff_not_composed',
      ...connectivityBoundaryReasons(connectivity),
    ],
    outfallConnectivityStatus: connectivity.status,
    unresolvedBoundaryPipeIds: connectivity.unresolvedBoundaryPipeIds,
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
    const missingReason =
      'Surface proxy grid could not be built: ' + errorMessage(error);
    const runoff = unavailableConditionedSurfaceRunoff(
      'invalid_response',
      missingReason,
      connectivity,
      input.outfallConnectivity.minimumResolvableDropM,
    );
    return {
      raw: {
        status: 'invalid_response' as const,
        missingReason,
        result: null,
        networkUse: rawNetworkUse,
      },
      conditioned: {
        status: 'invalid_response' as const,
        missingReason,
        result: null,
        surfaceAcquisition: null,
        networkUse: buildConditionedNetworkUse(
          connectivity,
          input.outfallConnectivity.minimumResolvableDropM,
          runoff.status,
        ),
      },
      runoff,
    };
  }

  if (
    grid.targetH3Indices.length > MAX_SURFACE_PROXY_TARGET_H3_CELLS ||
    grid.sampledH3Indices.length > MAX_SURFACE_PROXY_SAMPLED_H3_CELLS
  ) {
    const missingReason =
      'Surface proxy grid exceeds the bounded limit (' +
      grid.targetH3Indices.length +
      ' target / ' +
      grid.sampledH3Indices.length +
      ' sampled H3 cells)';
    const runoff = unavailableConditionedSurfaceRunoff(
      'out_of_coverage',
      missingReason,
      connectivity,
      input.outfallConnectivity.minimumResolvableDropM,
    );
    return {
      raw: {
        status: 'out_of_coverage' as const,
        missingReason,
        result: null,
        networkUse: rawNetworkUse,
      },
      conditioned: {
        status: 'out_of_coverage' as const,
        missingReason,
        result: null,
        surfaceAcquisition: null,
        networkUse: buildConditionedNetworkUse(
          connectivity,
          input.outfallConnectivity.minimumResolvableDropM,
          runoff.status,
        ),
      },
      runoff,
    };
  }

  const [elevationOutcome, bgtOutcome] = await Promise.allSettled([
    input.surfaceElevationClient.getElevationEvidence({
      h3Indices: grid.sampledH3Indices,
    }),
    input.bgtSurfaceClient.acquire({
      bbox: input.bbox,
      requestedAt: input.derivedAt,
    }),
  ]);

  let raw;
  if (elevationOutcome.status === 'rejected') {
    raw = {
      status: 'upstream_error' as const,
      missingReason:
        'AHN DTM acquisition failed: ' +
        errorMessage(elevationOutcome.reason),
      result: null,
      networkUse: rawNetworkUse,
    };
  } else {
    try {
      const result = deriveSurfaceCatchmentProxy({
        id: 'amsterdam-waternet-outfall-8522-surface-proxy',
        elevationModel: {
          semantics: 'digital_terrain_model',
          description:
            'AHN4 DTM represents classified ground at 0.5 m source resolution; buildings, vegetation and water are not silently filled, so source no-data remains incomplete evidence.',
          samplingDescription:
            'Arithmetic mean of physically valid AHN4 DTM 0.5 m source-pixel centers inside each H3 cell; more than 60% source no-data keeps the H3 value missing',
        },
        outfallNodeId: outfall.id,
        outfallPosition: outfall.position,
        grid,
        elevationByH3: elevationOutcome.value.cells,
        derivedAt: input.derivedAt,
      });
      raw = {
        status: result.status,
        missingReason:
          result.contributingAreaM2.quality.missingReason ?? null,
        result,
        elevationAcquisition: elevationOutcome.value.coverage,
        networkUse: rawNetworkUse,
      };
    } catch (error) {
      raw = {
        status: 'invalid_response' as const,
        missingReason:
          'Surface proxy derivation failed: ' + errorMessage(error),
        result: null,
        networkUse: rawNetworkUse,
      };
    }
  }

  if (elevationOutcome.status === 'rejected') {
    const missingReason =
      'AHN DTM acquisition failed: ' +
      errorMessage(elevationOutcome.reason);
    const runoff = unavailableConditionedSurfaceRunoff(
      'upstream_error',
      missingReason,
      connectivity,
      input.outfallConnectivity.minimumResolvableDropM,
    );
    return {
      raw,
      conditioned: {
        status: 'upstream_error' as const,
        missingReason,
        result: null,
        surfaceAcquisition:
          bgtOutcome.status === 'fulfilled'
            ? bgtOutcome.value.receipt
            : null,
        networkUse: buildConditionedNetworkUse(
          connectivity,
          input.outfallConnectivity.minimumResolvableDropM,
          runoff.status,
        ),
      },
      runoff,
    };
  }

  if (bgtOutcome.status === 'rejected') {
    const missingReason =
      'PDOK BGT acquisition failed: ' +
      errorMessage(bgtOutcome.reason);
    const runoff = unavailableConditionedSurfaceRunoff(
      'upstream_error',
      missingReason,
      connectivity,
      input.outfallConnectivity.minimumResolvableDropM,
    );
    return {
      raw,
      conditioned: {
        status: 'upstream_error' as const,
        missingReason,
        result: null,
        surfaceAcquisition: null,
        networkUse: buildConditionedNetworkUse(
          connectivity,
          input.outfallConnectivity.minimumResolvableDropM,
          runoff.status,
        ),
      },
      runoff,
    };
  }

  try {
    const surfaces = classifyBgtSurfaceH3Cells({
      acquisition: bgtOutcome.value,
      h3Indices: grid.targetH3Indices,
    });
    const result = deriveConditionedSurfaceCatchmentProxy({
      id: 'amsterdam-waternet-outfall-8522-conditioned-surface-proxy',
      outfallNodeId: outfall.id,
      outfallPosition: outfall.position,
      grid,
      rawElevationByH3: elevationOutcome.value.cells,
      surfaceByH3: surfaces.cells,
      derivedAt: input.derivedAt,
    });
    let runoff;

    if (result.contributingAreaM2.value === null) {
      runoff = unavailableConditionedSurfaceRunoff(
        result.contributingAreaM2.quality.status,
        result.contributingAreaM2.quality.missingReason ??
          'Conditioned contributing area is incomplete',
        connectivity,
        input.outfallConnectivity.minimumResolvableDropM,
      );
    } else {
      try {
        const runoffResult = await composeConditionedSurfaceRunoff(
          result,
          input.evidenceComposer,
          {
            referenceTime: input.environmentalReferenceTime,
            derivedAt: input.derivedAt,
          },
        );
        const total =
          runoffResult.catchmentContribution.totalVolumeM3;
        runoff = {
          status: total.quality.status,
          missingReason: total.quality.missingReason ?? null,
          result: runoffResult,
          networkPropagation: buildNetworkPropagationStop(
            connectivity,
            input.outfallConnectivity.minimumResolvableDropM,
            total.quality.status,
          ),
        };
      } catch (error) {
        runoff = unavailableConditionedSurfaceRunoff(
          'invalid_response',
          'Conditioned environmental composition failed: ' +
            errorMessage(error),
          connectivity,
          input.outfallConnectivity.minimumResolvableDropM,
        );
      }
    }

    return {
      raw,
      conditioned: {
        status: result.status,
        missingReason:
          bgtOutcome.value.status === 'available'
            ? result.contributingAreaM2.quality.missingReason ?? null
            : bgtOutcome.value.missingReason,
        result,
        surfaceAcquisition: bgtOutcome.value.receipt,
        surfaceCounts: surfaces.counts,
        networkUse: buildConditionedNetworkUse(
          connectivity,
          input.outfallConnectivity.minimumResolvableDropM,
          runoff.status,
        ),
      },
      runoff,
    };
  } catch (error) {
    const missingReason =
      'Conditioned surface proxy derivation failed: ' +
      errorMessage(error);
    const runoff = unavailableConditionedSurfaceRunoff(
      'invalid_response',
      missingReason,
      connectivity,
      input.outfallConnectivity.minimumResolvableDropM,
    );
    return {
      raw,
      conditioned: {
        status: 'invalid_response' as const,
        missingReason,
        result: null,
        surfaceAcquisition: bgtOutcome.value.receipt,
        networkUse: buildConditionedNetworkUse(
          connectivity,
          input.outfallConnectivity.minimumResolvableDropM,
          runoff.status,
        ),
      },
      runoff,
    };
  }
}

function connectivityBoundaryReasons(
  connectivity: OutfallConnectivityState,
): string[] {
  if (connectivity.status === 'known_upstream_path') {
    return [];
  }
  if (
    connectivity.status === 'blocked_by_unresolved_direction'
  ) {
    return ['outfall_network_direction_unresolved'];
  }

  return ['outfall_network_' + connectivity.status];
}

function buildConditionedNetworkUse(
  connectivity: OutfallConnectivityState,
  orientationThresholdM: number,
  runoffStatus: EvidenceStatus,
) {
  const environmentalRunoffComposed =
    runoffStatus === 'available' ||
    runoffStatus === 'synthetic_fixture';
  const reasons = [
    'not_observed_sewer_catchment',
    ...(!environmentalRunoffComposed
      ? ['environmental_runoff_incomplete']
      : []),
    ...connectivityBoundaryReasons(connectivity),
  ];

  return {
    eligibleForSewerPropagation: false as const,
    reasons,
    outfallConnectivityStatus: connectivity.status,
    unresolvedBoundaryPipeIds:
      connectivity.unresolvedBoundaryPipeIds,
    orientationThresholdM,
    environmentalRunoffStatus: runoffStatus,
    environmentalRunoffComposed,
    propagationAttempted: false as const,
    propagationStatus: 'blocked_before_propagation' as const,
  };
}

function buildNetworkPropagationStop(
  connectivity: OutfallConnectivityState,
  orientationThresholdM: number,
  runoffStatus: EvidenceStatus,
) {
  const networkUse = buildConditionedNetworkUse(
    connectivity,
    orientationThresholdM,
    runoffStatus,
  );

  return {
    attempted: false as const,
    status: 'blocked_before_propagation' as const,
    blockingReasons: networkUse.reasons,
    outfallConnectivityStatus: connectivity.status,
    unresolvedBoundaryPipeIds:
      connectivity.unresolvedBoundaryPipeIds,
    orientationThresholdM,
  };
}

function unavailableConditionedSurfaceRunoff(
  status: EvidenceStatus,
  missingReason: string,
  connectivity?: OutfallConnectivityState,
  orientationThresholdM?: number,
) {
  return {
    status,
    missingReason,
    result: null,
    networkPropagation:
      connectivity !== undefined &&
      orientationThresholdM !== undefined
        ? buildNetworkPropagationStop(
            connectivity,
            orientationThresholdM,
            status,
          )
        : {
            attempted: false as const,
            status: 'not_attempted' as const,
            blockingReasons: [
              'conditioned_surface_unavailable',
            ],
            outfallConnectivityStatus: null,
            unresolvedBoundaryPipeIds: [],
            orientationThresholdM: null,
          },
  };
}
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'unknown error';
}

function parseObservedEnvironmentReferenceTime(
  query: unknown,
): Date {
  if (!isRecord(query) || query.referenceTime === undefined) {
    return new Date(DEFAULT_OBSERVED_ENVIRONMENT_REFERENCE_TIME);
  }

  if (
    typeof query.referenceTime !== 'string' ||
    Number.isNaN(Date.parse(query.referenceTime))
  ) {
    throw new RequestValidationError(
      'referenceTime must be an ISO timestamp',
    );
  }

  return new Date(query.referenceTime);
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
