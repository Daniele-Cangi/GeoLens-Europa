import type {
  EmiliaRomagnaBenchmarkSnapshot,
  EmiliaRomagnaMapManifest,
} from '@geo-lens/evidence';

import { PROOF_ZERO_NETWORK } from './fixture';

export type { EmiliaRomagnaBenchmarkSnapshot } from '@geo-lens/evidence';
export type { EmiliaRomagnaMapManifest } from '@geo-lens/evidence';

export type EvidenceStatus =
  | 'available'
  | 'missing'
  | 'stale'
  | 'out_of_coverage'
  | 'auth_required'
  | 'rate_limited'
  | 'upstream_error'
  | 'invalid_response'
  | 'incomplete_window'
  | 'synthetic_fixture';

export interface Evidence<T> {
  readonly value: T | null;
  readonly unit?: string;
  readonly spatial: {
    readonly h3?: string;
    readonly lat?: number;
    readonly lon?: number;
    readonly sourceResolution?: string;
  };
  readonly temporal: {
    readonly observedAt?: string;
    readonly windowStart?: string;
    readonly windowEnd?: string;
    readonly acquiredAt: string;
  };
  readonly provenance: {
    readonly provider: string;
    readonly dataset: string;
    readonly datasetVersion?: string;
    readonly transformation?: string;
    readonly transformationVersion?: string;
    readonly samplingMethod?: string;
    readonly sourceMetadata?: Readonly<
      Record<string, unknown>
    >;
  };
  readonly quality: {
    readonly status: EvidenceStatus;
    readonly missingReason?: string;
  };
}

export interface RunoffOutput {
  readonly modelVersion: string;
  readonly rainfallMm: number;
  readonly slopeDeg: number;
  readonly landCoverClass: number;
  readonly landCoverGroup: string;
  readonly imperviousnessProxy: number;
  readonly baseRunoffCoefficient: number;
  readonly slopeAdjustment: number;
  readonly runoffCoefficient: number;
  readonly derivedRunoffMm: number;
}

export interface EnvironmentalCell {
  readonly h3: string;
  readonly rainfall24hMm: Evidence<number>;
  readonly elevationM: Evidence<number>;
  readonly slopeDeg: Evidence<number>;
  readonly landCoverClass: Evidence<number>;
}

export interface EnvironmentalNode {
  readonly id: string;
  readonly h3: string;
  readonly lat: number;
  readonly lon: number;
  readonly elevationM: Evidence<number>;
}

export interface EnvironmentalIssue {
  readonly h3: string;
  readonly entityId?: string;
  readonly layer: string;
  readonly status: EvidenceStatus;
  readonly reason: string;
}

export interface CatchmentCellContribution {
  readonly h3: string;
  readonly coverageFraction: number;
  readonly representedAreaM2: number;
  readonly runoff: {
    readonly output: Evidence<RunoffOutput>;
  };
  readonly volumeM3: Evidence<number>;
}

export interface CatchmentContribution {
  readonly catchmentId: string;
  readonly outletNodeId: string;
  readonly status: 'complete' | 'incomplete';
  readonly representedAreaM2: number;
  readonly availableAreaM2: number;
  readonly partialAvailableVolumeM3: number;
  readonly totalVolumeM3: Evidence<number>;
  readonly cells: readonly CatchmentCellContribution[];
}

export interface NodeTopology {
  readonly id: string;
  readonly type: 'inlet' | 'manhole' | 'outfall' | 'junction';
  readonly position: {
    readonly lat: number;
    readonly lon: number;
  };
  readonly h3: string;
  readonly elevationM: Evidence<number>;
}

export interface PipeTopology {
  readonly id: string;
  readonly nodeAId: string;
  readonly nodeBId: string;
  readonly lengthM: number;
  readonly diameterMm?: number;
}

export type DirectionEvidenceBasis =
  | 'node_ground_elevation'
  | 'pipe_invert_level';

export type PipeDirection =
  | {
      readonly status: 'known';
      readonly evidenceBasis: DirectionEvidenceBasis;
      readonly fromNodeId: string;
      readonly toNodeId: string;
      readonly verticalDropM: number;
      readonly grade: number;
    }
  | {
      readonly status: 'unknown';
      readonly evidenceBasis: DirectionEvidenceBasis;
      readonly reason: string;
      readonly endpointAStatus: string;
      readonly endpointBStatus: string;
    }
  | {
      readonly status: 'ambiguous';
      readonly evidenceBasis: DirectionEvidenceBasis;
      readonly reason: string;
      readonly verticalDifferenceM: number;
      readonly minimumResolvableDropM: number;
    };

export interface CompletePropagation {
  readonly status: 'complete';
  readonly modelVersion: string;
  readonly nodes: Readonly<
    Record<
      string,
      {
        readonly localContributionM3: Evidence<number>;
        readonly downstreamAccumulationM3: Evidence<number>;
      }
    >
  >;
  readonly pipes: Readonly<
    Record<
      string,
      {
        readonly direction: Extract<
          PipeDirection,
          { readonly status: 'known' }
        >;
        readonly transferredVolumeM3: Evidence<number>;
      }
    >
  >;
  readonly massBalance: {
    readonly localInputVolumeM3: number;
    readonly terminalVolumeM3: number;
    readonly outfallVolumeM3: number;
    readonly nonOutfallTerminalVolumeM3: number;
    readonly differenceM3: number;
  };
}

export interface IncompletePropagation {
  readonly status:
    | 'incomplete_direction'
    | 'incomplete_evidence'
    | 'unsupported_divergence'
    | 'cyclic';
  readonly modelVersion: string;
  readonly reason: string;
  readonly pipeIds: readonly string[];
  readonly nodeIds: readonly string[];
}

export type Propagation =
  | CompletePropagation
  | IncompletePropagation;

export interface ProofZeroResult {
  readonly status: 'complete' | 'incomplete';
  readonly proofVersion: string;
  readonly environmental: {
    readonly status: 'complete' | 'incomplete';
    readonly referenceTime: string;
    readonly acquiredAt: string;
    readonly sources: {
      readonly rainfall: ProviderSummary;
      readonly terrain: ProviderSummary;
      readonly landCover: ProviderSummary;
    };
    readonly cells: Readonly<
      Record<string, EnvironmentalCell>
    >;
    readonly nodes: Readonly<
      Record<string, EnvironmentalNode>
    >;
    readonly issues: readonly EnvironmentalIssue[];
  };
  readonly topology: {
    readonly id: string;
    readonly nodes: Readonly<Record<string, NodeTopology>>;
    readonly pipes: Readonly<Record<string, PipeTopology>>;
  };
  readonly orientedNetwork: {
    readonly orientationVersion: string;
    readonly evidenceBasis: DirectionEvidenceBasis;
    readonly minimumResolvableDropM: number;
    readonly directions: Readonly<
      Record<string, PipeDirection>
    >;
  };
  readonly catchmentContributions:
    readonly CatchmentContribution[];
  readonly nodeSourceTerms: {
    readonly terms: Readonly<
      Record<string, Evidence<number>>
    >;
  };
  readonly propagation: Propagation;
}

export interface ProviderSummary {
  readonly provider: string;
  readonly dataset: string;
  readonly acquiredAt: string;
  readonly status: 'responded' | 'upstream_error';
  readonly missingReason?: string;
}

export interface InfrastructureAssetSource {
  readonly origin:
    | 'observed_public_record'
    | 'user_supplied'
    | 'derived'
    | 'synthetic_fixture';
  readonly provider: string;
  readonly dataset: string;
  readonly datasetVersion?: string;
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly acquiredAt: string;
  readonly sourceCrs: string;
  readonly outputCrs: string;
  readonly transformation: string;
  readonly transformationVersion: string;
  readonly sourceRecordId: string;
  readonly sourceAttributes?: Readonly<
    Record<string, unknown>
  >;
}

export interface ObservedInfrastructureNode {
  readonly id: string;
  readonly type:
    | 'inlet'
    | 'manhole'
    | 'outfall'
    | 'junction';
  readonly position: {
    readonly lat: number;
    readonly lon: number;
  };
  readonly h3: string;
  readonly elevationM: Evidence<number>;
  readonly source: InfrastructureAssetSource;
}

export interface ObservedInfrastructurePipe {
  readonly id: string;
  readonly nodeAId: string;
  readonly nodeBId: string;
  readonly lengthM: number;
  readonly diameterMm?: number;
  readonly path: readonly {
    readonly lat: number;
    readonly lon: number;
  }[];
  readonly invertLevelAM: Evidence<number>;
  readonly invertLevelBM: Evidence<number>;
  readonly source: InfrastructureAssetSource;
}

export interface ObservedOutfallConnectivityState {
  readonly outfallNodeId: string;
  readonly status:
    | 'known_upstream_path'
    | 'blocked_by_unresolved_direction'
    | 'isolated'
    | 'direction_conflict';
  readonly knownUpstreamNodeIds: readonly string[];
  readonly knownUpstreamPipeIds: readonly string[];
  readonly unresolvedBoundaryPipeIds: readonly string[];
  readonly outwardKnownPipeIds: readonly string[];
}

export interface ObservedOutfallConnectivity {
  readonly modelVersion: string;
  readonly orientationVersion: string;
  readonly evidenceBasis: 'pipe_invert_level';
  readonly minimumResolvableDropM: number;
  readonly numericComparisonToleranceM: number;
  readonly outfalls: Readonly<
    Record<string, ObservedOutfallConnectivityState>
  >;
  readonly knownPathNodeIds: readonly string[];
  readonly knownPathPipeIds: readonly string[];
  readonly unresolvedBoundaryPipeIds: readonly string[];
  readonly counts: {
    readonly outfalls: number;
    readonly knownUpstreamPaths: number;
    readonly blockedByUnresolvedDirection: number;
    readonly isolated: number;
    readonly directionConflicts: number;
    readonly knownPathNodes: number;
    readonly knownPathPipes: number;
    readonly unresolvedBoundaryPipes: number;
  };
}

export interface ObservedSurfaceCatchmentProxyCell {
  readonly h3: string;
  readonly elevationM: Evidence<number>;
  readonly representedAreaM2: number;
  readonly boundary: readonly (readonly [number, number])[];
  readonly downstreamH3: string | null;
  readonly elevationDropM: number | null;
  readonly centerDistanceM: number | null;
  readonly grade: number | null;
  readonly flowMethod: string;
  readonly termination:
    | 'outlet_proxy'
    | 'coverage_exit'
    | 'local_depression'
    | 'incomplete_elevation';
  readonly contributesToOutletProxy: boolean | null;
  readonly pathH3Indices: readonly string[];
}

export interface ObservedSurfaceCatchmentProxy {
  readonly id: string;
  readonly semantics:
    'experimental_dem_derived_surface_contributing_area_proxy';
  readonly modelVersion: string;
  readonly status: EvidenceStatus;
  readonly elevationModel: {
    readonly semantics:
      | 'digital_terrain_model'
      | 'digital_surface_model'
      | 'synthetic_fixture_surface';
    readonly description: string;
    readonly samplingDescription: string;
  };
  readonly outfallAnchor: {
    readonly nodeId: string;
    readonly position: {
      readonly lat: number;
      readonly lon: number;
    };
    readonly h3: string;
    readonly method: string;
    readonly conditioning: string;
  };
  readonly coverage: {
    readonly bbox: {
      readonly latMin: number;
      readonly lonMin: number;
      readonly latMax: number;
      readonly lonMax: number;
    };
    readonly h3Resolution: number;
    readonly outletH3: string;
    readonly targetH3Indices: readonly string[];
    readonly sampledH3Indices: readonly string[];
    readonly selectionMethod: string;
    readonly boundaryHaloRings: number;
    readonly targetCellCount: number;
    readonly sampledCellCount: number;
    readonly areaRepresentation: string;
  };
  readonly contributingAreaM2: Evidence<number>;
  readonly partialContributingAreaM2: number;
  readonly contributingH3Indices: readonly string[];
  readonly cells: Readonly<
    Record<string, ObservedSurfaceCatchmentProxyCell>
  >;
  readonly counts: {
    readonly contributingCells: number;
    readonly coverageExitCells: number;
    readonly localDepressionCells: number;
    readonly incompleteElevationCells: number;
  };
  readonly elevationSources: {
    readonly providers: readonly string[];
    readonly datasets: readonly string[];
    readonly datasetVersions: readonly string[];
    readonly sourceResolutions: readonly string[];
    readonly acquiredAt: readonly string[];
    readonly statuses: Readonly<Record<EvidenceStatus, number>>;
  };
  readonly sewerCatchmentSemantics: 'not_asserted';
  readonly limitations: readonly string[];
}

export interface ObservedSurfaceCatchmentProxyEnvelope {
  readonly status: EvidenceStatus;
  readonly missingReason: string | null;
  readonly result: ObservedSurfaceCatchmentProxy | null;
  readonly elevationAcquisition?: {
    readonly service: 'OGC WCS';
    readonly serviceVersion: '2.0.1';
    readonly coverageId: 'dtm_05m';
    readonly requestUrl: string;
    readonly requestedBoundsRd: {
      readonly minX: number;
      readonly minY: number;
      readonly maxX: number;
      readonly maxY: number;
    };
    readonly sourceCrs: 'EPSG:28992';
    readonly verticalDatum: 'NAP (EPSG:5709)';
    readonly responseWidth: number;
    readonly responseHeight: number;
    readonly responseBytes: number;
  } | null;
  readonly networkUse: {
    readonly eligibleForSewerPropagation: false;
    readonly reasons: readonly string[];
    readonly outfallConnectivityStatus: string;
    readonly unresolvedBoundaryPipeIds: readonly string[];
    readonly orientationThresholdM: number;
  } | null;
}
export type ObservedConditionedSurfaceClass =
  | 'vegetated_terrain'
  | 'unvegetated_terrain'
  | 'building'
  | 'surface_water'
  | 'road'
  | 'supporting_water'
  | 'supporting_road'
  | 'structural_barrier';

export interface ObservedConditionedSurfaceObservation {
  readonly surfaceClass: ObservedConditionedSurfaceClass;
  readonly collection: string;
  readonly featureId: string;
  readonly localId: string;
  readonly relativeHeight?: number;
  readonly physicalAppearance?: string | null;
  readonly function?: string | null;
  readonly waterType?: string | null;
  readonly containingFeatureCount?: number;
  readonly containingFeatureIds?: readonly string[];
  readonly selectionMethod?: string;
}

export interface ObservedConditionedSurfaceCatchmentCell {
  readonly h3: string;
  readonly representedAreaM2: number;
  readonly boundary: readonly (readonly [number, number])[];
  readonly surface: Evidence<ObservedConditionedSurfaceObservation>;
  readonly rawElevationM: Evidence<number>;
  readonly terrainElevationM: Evidence<number>;
  readonly hydrologicElevationM: Evidence<number>;
  readonly terrainConditioning: {
    readonly method: string;
    readonly interpolationSourceH3Indices: readonly string[];
    readonly interpolationMaximumGridDistance: number | null;
  };
  readonly depressionFillM: number | null;
  readonly downstreamH3: string | null;
  readonly termination:
    | 'conditioned_outfall_terminal'
    | 'analysis_bbox_exit'
    | 'observed_surface_water_exit'
    | 'excluded_observed_surface_water'
    | 'excluded_observed_structural_barrier'
    | 'incomplete_conditioning';
  readonly contributesToConditionedOutfall: boolean | null;
  readonly pathH3Indices: readonly string[];
}

export interface ObservedConditionedSurfaceCatchmentProxy {
  readonly id: string;
  readonly semantics:
    'experimental_bgt_ahn_conditioned_surface_contributing_area_proxy';
  readonly modelVersion: string;
  readonly status: EvidenceStatus;
  readonly outfallAttachment: {
    readonly nodeId: string;
    readonly position: {
      readonly lat: number;
      readonly lon: number;
    };
    readonly h3: string;
    readonly observed: false;
    readonly method: string;
    readonly eligibleForSewerPropagation: false;
    readonly reason: string;
  };
  readonly coverage: {
    readonly bbox: {
      readonly latMin: number;
      readonly lonMin: number;
      readonly latMax: number;
      readonly lonMax: number;
    };
    readonly h3Resolution: number;
    readonly outletH3: string;
    readonly targetH3Indices: readonly string[];
    readonly sampledH3Indices: readonly string[];
    readonly targetCellCount: number;
    readonly areaRepresentation: 'full_h3_cell_area';
  };
  readonly conditioning: {
    readonly interpolationMethod: string;
    readonly interpolationMaxGridDistance: number;
    readonly interpolationMinSamples: number;
    readonly depressionMethod: string;
    readonly terminalPriorityOnExactTie: readonly string[];
  };
  readonly contributingAreaM2: Evidence<number>;
  readonly partialContributingAreaM2: number;
  readonly contributingH3Indices: readonly string[];
  readonly cells: Readonly<
    Record<string, ObservedConditionedSurfaceCatchmentCell>
  >;
  readonly counts: {
    readonly targetCells: number;
    readonly observedElevationCells: number;
    readonly interpolatedElevationCells: number;
    readonly excludedSurfaceWaterCells: number;
    readonly excludedStructuralBarrierCells: number;
    readonly unresolvedConditioningCells: number;
    readonly depressionRaisedCells: number;
    readonly contributingCells: number;
    readonly analysisBboxExitCells: number;
    readonly observedSurfaceWaterExitCells: number;
  };
  readonly sewerCatchmentSemantics: 'not_observed';
  readonly limitations: readonly string[];
}

export interface ObservedConditionedSurfaceCatchmentProxyEnvelope {
  readonly status: EvidenceStatus;
  readonly missingReason: string | null;
  readonly result: ObservedConditionedSurfaceCatchmentProxy | null;
  readonly surfaceAcquisition: {
    readonly provider: 'PDOK';
    readonly dataset: 'Basisregistratie Grootschalige Topografie (BGT)';
    readonly license: 'CC0 1.0';
    readonly acquiredAt: string;
    readonly requestedAt: string;
    readonly requestedBboxCrs84: string;
    readonly sourceCrs: 'OGC:CRS84';
    readonly storageCrs: 'EPSG:28992';
    readonly featureCount: number;
    readonly collections: readonly {
      readonly collection: string;
      readonly requestUrl: string;
      readonly responseTimestamp: string | null;
      readonly featureCount: number;
    }[];
    readonly documentationUrl: string;
  } | null;
  readonly surfaceCounts?: Readonly<
    Record<ObservedConditionedSurfaceClass | 'unclassified', number>
  >;
  readonly networkUse: {
    readonly eligibleForSewerPropagation: false;
    readonly reasons: readonly string[];
    readonly outfallConnectivityStatus: string;
    readonly unresolvedBoundaryPipeIds: readonly string[];
    readonly orientationThresholdM: number;
    readonly environmentalRunoffStatus: EvidenceStatus;
    readonly environmentalRunoffComposed: boolean;
    readonly propagationAttempted: false;
    readonly propagationStatus: 'blocked_before_propagation';
  } | null;
}
export interface ObservedConditionedSurfaceRunoffResult {
  readonly status: 'complete' | 'incomplete';
  readonly semantics:
    'experimental_runoff_over_conditioned_surface_proxy';
  readonly modelVersion: string;
  readonly surfaceDefinition: {
    readonly proxyId: string;
    readonly proxyModelVersion: string;
    readonly observedSewerCatchment: false;
    readonly outfallNodeId: string;
    readonly outfallH3: string;
  };
  readonly selection: {
    readonly candidateCellCount: number;
    readonly maximumCellCount: number;
    readonly selectedCellCount: number;
    readonly selectedH3Indices: readonly string[];
    readonly representedAreaM2: number;
    readonly coversAllConditionedContributingCells: boolean;
    readonly method:
      'shortest_conditioned_flow_path_then_h3';
  };
  readonly environmental: ProofZeroResult['environmental'];
  readonly catchmentContribution: CatchmentContribution;
  readonly limitations: readonly string[];
}

export interface ObservedConditionedSurfaceRunoffEnvelope {
  readonly status: EvidenceStatus;
  readonly missingReason: string | null;
  readonly result: ObservedConditionedSurfaceRunoffResult | null;
  readonly networkPropagation: {
    readonly attempted: false;
    readonly status:
      | 'blocked_before_propagation'
      | 'not_attempted';
    readonly blockingReasons: readonly string[];
    readonly outfallConnectivityStatus: string | null;
    readonly unresolvedBoundaryPipeIds: readonly string[];
    readonly orientationThresholdM: number | null;
  };
}
export interface ObservedGwswArea {
  readonly featureId: string;
  readonly name: string;
  readonly areaType:
    | 'rioleringsgebied'
    | 'zuiveringseenheid'
    | 'other';
  readonly sourceTypeName: string;
  readonly sourceTypeUri: string;
  readonly sourceDatasetUrl: string;
  readonly sourceUri: string;
  readonly geometry: {
    readonly type: 'MultiPolygon';
    readonly coordinates: readonly (readonly (readonly (
      readonly [number, number]
    )[])[])[];
  };
}

export interface ObservedOutfallAreaContext {
  readonly modelVersion: string;
  readonly status:
    | 'unresolved_no_published_crosswalk'
    | Exclude<EvidenceStatus, 'available' | 'synthetic_fixture'>;
  readonly outfallNodeId: string;
  readonly outfallPosition: {
    readonly lat: number;
    readonly lon: number;
  };
  readonly waternetPumpingAreaReference: {
    readonly sourceField: 'bemalingsgebied';
    readonly value: string | null;
    readonly semantics: 'source_identifier_only';
    readonly gwswCrosswalk: 'not_published';
  };
  readonly containingAreas: readonly ObservedGwswArea[];
  readonly containingRioleringsgebieden:
    readonly ObservedGwswArea[];
  readonly attachment: {
    readonly eligible: false;
    readonly catchmentAttachmentCreated: false;
    readonly method:
      'point_in_observed_multipolygon_context_only';
    readonly reason: string;
  };
  readonly acquisition: {
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
    readonly documentationUrl: string;
  };
}

export interface ObservedOutfallAreaContextEnvelope {
  readonly status:
    | 'unresolved_no_published_crosswalk'
    | Exclude<EvidenceStatus, 'available' | 'synthetic_fixture'>;
  readonly missingReason: string | null;
  readonly result: ObservedOutfallAreaContext | null;
}

export interface ObservedAuthoritativeSurfaceNetworkAttachment {
  readonly modelVersion: string;
  readonly standard: 'STOWA-2025-02';
  readonly documentationUrl: string;
  readonly destinationObservations: Evidence<
    readonly {
      readonly recordId: string;
      readonly bgtIdentification: string;
      readonly destination: string;
      readonly percentage: number;
      readonly networkAssetCode: string | null;
      readonly firstPublicSystemDestination: true;
      readonly lastModified: string;
      readonly manuallyModified: boolean | null;
    }[]
  >;
  readonly networkAttachments: Evidence<
    readonly {
      readonly recordId: string;
      readonly bgtIdentification: string;
      readonly destination: string;
      readonly percentage: number;
      readonly firstPublicSystemDestination: true;
      readonly target: {
        readonly entityType: 'pipe';
        readonly pipeId: string;
        readonly sourceRecordId: string;
        readonly matchedCode: string;
        readonly matchMethod: string;
      };
    }[]
  >;
  readonly unresolvedNetworkDestinations: readonly {
    readonly recordId: string;
    readonly bgtIdentification: string;
    readonly destination: string;
    readonly percentage: number;
    readonly networkAssetCode: string | null;
    readonly reason: string;
  }[];
  readonly propagationEligible: boolean;
}
export interface AvailableObservedInfrastructure {
  readonly status: 'available';
  readonly acquisition: {
    readonly provider: string;
    readonly dataset: string;
    readonly acquiredAt: string;
    readonly bboxWfsAxisOrder: string;
    readonly nodeUrl: string;
    readonly pipeUrl: string;
  };
  readonly import: {
    readonly source: Omit<
      InfrastructureAssetSource,
      'sourceRecordId' | 'sourceAttributes'
    >;
    readonly retrievalMode:
      | 'live'
      | 'recorded_response';
    readonly counts: {
      readonly nodeFeatures: number;
      readonly pipeFeatures: number;
      readonly activeNodeFeatures: number;
      readonly matchingStormwaterPipes: number;
      readonly importedNodes: number;
      readonly importedPipes: number;
      readonly skippedBoundaryPipes: number;
      readonly skippedAmbiguousPipes: number;
      readonly skippedSelfLoops: number;
    };
    readonly deliveryDates: readonly string[];
    readonly endpointLinkPolicy: {
      readonly method:
        'geometry_endpoint_nearest_node';
      readonly snapToleranceM: number;
      readonly sourceEndpointAttributes:
        | 'ignored_invalid_self_referential'
        | 'ignored_unverified';
    };
    readonly diagnostics: readonly {
      readonly code: string;
      readonly pipeSourceRecordId: string;
      readonly message: string;
    }[];
    readonly pumpingAreaReferences: {
      readonly sourceField: 'bemalingsgebied';
      readonly identifiers: readonly string[];
      readonly geometryStatus: 'not_provided_by_source';
      readonly attachmentEligible: false;
    };
    readonly catchmentState: {
      readonly status: 'not_provided_by_source';
      readonly attachmentsCreated: 0;
    };
  };
  readonly topology: {
    readonly id: string;
    readonly nodes: Readonly<
      Record<string, ObservedInfrastructureNode>
    >;
    readonly pipes: Readonly<
      Record<string, ObservedInfrastructurePipe>
    >;
    readonly catchmentAttachments: Readonly<
      Record<string, never>
    >;
  };
  readonly orientation: {
    readonly modelVersion: string;
    readonly evidenceBasis: 'pipe_invert_level';
    readonly minimumResolvableDropM: number;
    readonly numericComparisonToleranceM: number;
    readonly thresholdSemantics: string;
    readonly counts: {
      readonly known: number;
      readonly ambiguous: number;
      readonly unknown: number;
    };
    readonly directions: Readonly<
      Record<string, PipeDirection>
    >;
  };
  readonly outfallConnectivity: ObservedOutfallConnectivity;
  readonly outfallAreaContext: ObservedOutfallAreaContextEnvelope;
  readonly authoritativeSurfaceNetworkAttachment:
    ObservedAuthoritativeSurfaceNetworkAttachment;
  readonly surfaceCatchmentProxy: ObservedSurfaceCatchmentProxyEnvelope;
  readonly conditionedSurfaceCatchmentProxy:
    ObservedConditionedSurfaceCatchmentProxyEnvelope;
  readonly conditionedSurfaceRunoff:
    ObservedConditionedSurfaceRunoffEnvelope;
}

export interface UnavailableObservedInfrastructure {
  readonly status: Exclude<
    EvidenceStatus,
    'available' | 'synthetic_fixture'
  >;
  readonly missingReason: string;
  readonly failedLayer: 'nodes' | 'pipes' | 'both';
  readonly receipt: {
    readonly provider: string;
    readonly dataset: string;
    readonly acquiredAt: string;
    readonly bboxWfsAxisOrder: string;
    readonly nodeUrl: string;
    readonly pipeUrl: string;
  };
}

export type ObservedInfrastructureResult =
  | AvailableObservedInfrastructure
  | UnavailableObservedInfrastructure;

interface ApiError {
  readonly status?: string;
  readonly error?: string;
}

const API_URL =
  process.env.NEXT_PUBLIC_GEOLENS_API_URL ??
  'http://localhost:3003';

export async function runProofZero(
  referenceTime: string,
  signal?: AbortSignal,
): Promise<ProofZeroResult> {
  const response = await fetch(
    `${API_URL}/api/proof-zero/run`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        network: PROOF_ZERO_NETWORK,
        networkId: 'trento-proof-zero-inspector',
        referenceTime,
      }),
      cache: 'no-store',
      signal,
    },
  );
  const body = (await response.json()) as
    | ProofZeroResult
    | ApiError;

  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(
      error.error ??
        `GeoLens API returned HTTP ${response.status}`,
    );
  }

  return body as ProofZeroResult;
}

export async function getObservedInfrastructure(
  signal?: AbortSignal,
): Promise<ObservedInfrastructureResult> {
  const response = await fetch(
    `${API_URL}/api/infrastructure/amsterdam-waternet`,
    {
      method: 'GET',
      cache: 'no-store',
      signal,
    },
  );
  const body = (await response.json()) as
    | ObservedInfrastructureResult
    | ApiError;

  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(
      error.error ??
        `GeoLens API returned HTTP ${response.status}`,
    );
  }

  return body as ObservedInfrastructureResult;
}

export async function getEmiliaRomagnaBenchmark(
  signal?: AbortSignal,
): Promise<EmiliaRomagnaBenchmarkSnapshot> {
  const response = await fetch(
    `${API_URL}/api/benchmarks/emilia-romagna-2023`,
    {
      method: 'GET',
      cache: 'no-store',
      signal,
    },
  );
  const body = (await response.json()) as
    | EmiliaRomagnaBenchmarkSnapshot
    | ApiError;

  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(
      error.error ??
        `GeoLens API returned HTTP ${response.status}`,
    );
  }

  return body as EmiliaRomagnaBenchmarkSnapshot;
}

export async function getEmiliaRomagnaMapManifest(
  signal?: AbortSignal,
): Promise<EmiliaRomagnaMapManifest> {
  const response = await fetch(
    `${API_URL}/api/benchmarks/emilia-romagna-2023/map-manifest`,
    {
      method: 'GET',
      cache: 'no-store',
      signal,
    },
  );
  const body = (await response.json()) as
    | EmiliaRomagnaMapManifest
    | ApiError;

  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(
      error.error ??
        `GeoLens API returned HTTP ${response.status}`,
    );
  }

  return body as EmiliaRomagnaMapManifest;
}
