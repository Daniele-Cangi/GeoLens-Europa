export const BENCHMARK_DATASET_ROLES = [
  'model_input',
  'evaluation_reference',
  'comparison_reference',
  'context_only',
] as const;

export type BenchmarkDatasetRole =
  (typeof BENCHMARK_DATASET_ROLES)[number];

export interface BenchmarkLocalArtifact {
  readonly relativePath: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface BenchmarkDataset {
  readonly id: string;
  readonly role: BenchmarkDatasetRole;
  readonly temporalRelation: 'pre_event' | 'during_event' | 'post_event';
  /** Earliest verified time this exact source/version was available. */
  readonly availableAt?: string;
  readonly publisher: string;
  readonly dataset: string;
  readonly datasetVersion?: string;
  readonly requestId?: string;
  readonly acquiredAt?: string;
  readonly sourceUrl: string;
  /** Exact URL used when the publisher URL is retained through a web archive. */
  readonly retrievalUrl?: string;
  readonly archivedAt?: string;
  readonly accessMethod: string;
  readonly sourceResolution?: string;
  readonly acquisitionStatus:
    | 'remote_verified'
    | 'downloaded_verified'
    | 'downloaded_license_review'
    | 'blocked';
  readonly license: {
    readonly name: string;
    readonly access: 'public' | 'auth_required' | 'restricted' | 'unknown';
    readonly redistribution: 'allowed' | 'restricted' | 'unknown';
    readonly note?: string;
  };
  readonly allowedUses: {
    readonly modelInput: boolean;
    readonly calibration: boolean;
    readonly evaluation: boolean;
  };
  readonly methodologyNote?: string;
  readonly localArtifacts?: readonly BenchmarkLocalArtifact[];
}

export interface HistoricalBenchmarkManifest {
  readonly manifestVersion: '1.15.0';
  readonly benchmark: {
    readonly id: string;
    readonly title: string;
    readonly replayMode:
      | 'cutoff_constrained'
      | 'retrospective_reconstruction';
    readonly state: 'data_audit' | 'model_ready' | 'evaluation_ready';
    readonly claimLevel:
      | 'hydrologic_routing'
      | 'conditioned_inundation_replay'
      | 'blind_hindcast';
    readonly event: {
      readonly windowStart: string;
      readonly windowEnd: string;
      readonly knowledgeCutoff: string;
    };
    readonly aoi: {
      readonly name: string;
      readonly crs: string;
      readonly bounds: readonly [number, number, number, number];
      readonly selectionBasis: string;
    };
    readonly spatialProtocol: BenchmarkSpatialProtocol;
    readonly localArtifacts?: readonly BenchmarkLocalArtifact[];
    readonly routingBaselines: readonly BenchmarkRoutingBaseline[];
    readonly evaluationProtocols: readonly BenchmarkEvaluationProtocol[];
    readonly evaluationRuns: readonly BenchmarkEvaluationRun[];
    readonly observationComparisonProtocols: readonly BenchmarkObservationComparisonProtocol[];
    readonly observationComparisonRuns: readonly BenchmarkObservationComparisonRun[];
    readonly conditionedReplayProtocols: readonly BenchmarkConditionedReplayProtocol[];
    readonly conditionedReplaySourceAudits: readonly BenchmarkConditionedReplaySourceAudit[];
    readonly conditionedReplayHydrographAudits: readonly BenchmarkConditionedReplayHydrographAudit[];
    readonly conditionedReplayPhysicalAudits: readonly BenchmarkConditionedReplayPhysicalAudit[];
    readonly conditionedReplayTerrainAudits: readonly BenchmarkConditionedReplayTerrainAudit[];
    readonly evaluationMetrics: readonly string[];
    readonly forbiddenClaims: readonly string[];
  };
  readonly datasets: readonly BenchmarkDataset[];
}

export type BenchmarkConditionedBoundaryEvidenceId =
  | 'rainfall_and_surface_runoff_forcing'
  | 'antecedent_moisture_or_model_warmup'
  | 'montone_and_rabbi_inflow_hydrographs'
  | 'downstream_stage_or_discharge_boundary'
  | 'breach_location_timing_and_geometry'
  | 'embankment_crest_geometry'
  | 'bare_earth_terrain'
  | 'channel_geometry_and_roughness';

export type BenchmarkConditionedBoundaryEvidenceStatus =
  | 'available'
  | 'missing'
  | 'incomplete_window'
  | 'metadata_only';

export interface BenchmarkConditionedBoundaryEvidence {
  readonly id: BenchmarkConditionedBoundaryEvidenceId;
  readonly required: true;
  readonly status: BenchmarkConditionedBoundaryEvidenceStatus;
  readonly candidateDatasetIds: readonly string[];
  readonly acceptanceCriteria: string;
  readonly blocker?: string;
}

export interface BenchmarkConditionedReplayProtocol {
  readonly id: string;
  readonly state: 'input_protocol_frozen';
  readonly claimLevelAtFreeze: 'hydrologic_routing';
  readonly validationMode: 'diagnostic_not_blind';
  readonly evaluationReferenceAccessAtFreeze:
    'already_loaded_for_prior_hydrologic_routing_evaluation';
  readonly boundaryConditionAccessAtFreeze:
    'metadata_and_prior_comparison_values_only';
  readonly calibration: false;
  readonly window: {
    readonly start: string;
    readonly endExclusive: string;
    readonly timezone: 'UTC';
  };
  readonly requiredBoundaryEvidence: readonly BenchmarkConditionedBoundaryEvidence[];
  readonly runGate: {
    readonly state: 'blocked_missing_required_evidence' | 'eligible';
    readonly requiredStatus: 'available';
    readonly missingPolicy: 'block_run_not_zero_or_inferred';
    readonly noStageToDischargeWithoutRatingCurve: true;
    readonly noBreachInferenceFromFloodExtent: true;
    readonly noTuningToEventExtent: true;
  };
  readonly methodologyNote: string;
}

export interface BenchmarkConditionedReplaySourceAudit {
  readonly id: string;
  readonly protocolId: string;
  readonly state: 'materialized';
  readonly sourceAccess: 'loaded_after_protocol_freeze';
  readonly sourceDatasetIds: readonly string[];
  readonly sourcePages: readonly number[];
  readonly quality: 'incomplete_window';
  readonly dischargeNetwork: {
    readonly listedStationCount: number;
    readonly requiredStationNames: readonly string[];
    readonly containsRequiredStations: false;
    readonly eventValidRatingCurvesAvailable: false;
    readonly dischargeHydrographsAvailable: false;
  };
  readonly stationDatums: readonly {
    readonly stationId: string;
    readonly name: string;
    readonly datumMslM: number | null;
    readonly status: 'available' | 'missing';
  }[];
  readonly conclusions: {
    readonly inflowStatus: 'incomplete_window';
    readonly downstreamStatus: 'incomplete_window';
    readonly hydraulicUseEligible: false;
    readonly protocolRunGate: 'blocked_missing_required_evidence';
    readonly missingPolicy: 'missing_not_zero_or_inferred';
  };
  readonly methodologyNote: string;
}

export interface BenchmarkConditionedReplayHydrographAudit {
  readonly id: string;
  readonly protocolId: string;
  readonly state: 'materialized';
  readonly sourceAccess: 'loaded_after_protocol_freeze_from_archived_official_pdf';
  readonly sourceDatasetId: string;
  readonly sourceArtifactPath: string;
  readonly sourcePages: readonly number[];
  readonly quality: 'incomplete_window';
  readonly ratingCurveEvidence: {
    readonly publisher: 'ARPAE Emilia-Romagna';
    readonly station: 'Montone at Castrocaro';
    readonly vintageYear: 2022;
    readonly eventApplication: 'used_by_regional_commission_for_may_2023_reconstruction';
    readonly formulaOrTableAvailable: false;
  };
  readonly effortsRecalibrationContext: {
    readonly sourceDatasetId: string;
    readonly determinationId: 'DET-2024-723';
    readonly topkapiCalibrationBasin: 'Montone-Rabbi';
    readonly hecRasCalibrationRiver: 'Montone';
    readonly measuredVsModelledHydrographsRequired: true;
    readonly highFlowRatingCurveStation: 'Montone at Castrocaro';
    readonly priorCurveCalibrationBasis: 'direct_discharge_measurements_low_flow_only';
    readonly minimumHistoricalFloodEvents: 2;
    readonly separateValidationEventRequired: true;
    readonly uncertaintyAssessmentRequired: true;
    readonly nonBijectiveOrFloodLoopBehaviourMustBeAssessed: true;
    readonly requiredDeliveryDate: '2025-12-31';
    readonly publicMachineReadableDeliverablesAvailable: false;
  };
  readonly hydrographEvidence: {
    readonly figureNumber: 63;
    readonly temporalResolutionMinutes: 60;
    readonly publishedAnalysisStartDate: '2023-05-15';
    readonly publishedAnalysisEndDateInclusive: '2023-05-19';
    readonly coversProtocolWindow: true;
    readonly tabulatedValuesAvailable: false;
    readonly machineReadableSeriesAvailable: false;
    readonly peakDischargePublished: false;
  };
  readonly publishedVolumeBalance: {
    readonly basinAreaKm2: 237;
    readonly rainfallDepthMm: 201.25;
    readonly rainfallVolumeMillionM3: 47.6;
    readonly dischargeVolumeMillionM3: 36.86;
    readonly runoffCoefficient: 0.77;
  };
  readonly conclusions: {
    readonly montoneInflowStatus: 'incomplete_window';
    readonly rabbiInflowStatus: 'missing';
    readonly combinedInflowStatus: 'incomplete_window';
    readonly hydraulicUseEligible: false;
    readonly protocolRunGate: 'blocked_missing_required_evidence';
    readonly missingPolicy: 'missing_not_digitized_or_inferred';
  };
  readonly methodologyNote: string;
}

export interface BenchmarkConditionedReplayPhysicalAudit {
  readonly id: string;
  readonly protocolId: string;
  readonly state: 'materialized';
  readonly sourceAccess: 'loaded_after_protocol_freeze';
  readonly sourceDatasetIds: readonly string[];
  readonly quality: 'metadata_only';
  readonly eventMonograph: {
    readonly sourceDatasetId: string;
    readonly printedPages: readonly number[];
    readonly stageDatum: 'metres_above_local_gauge_zero';
    readonly reportedStagePeaks: readonly {
      readonly watercourse: 'Montone' | 'Rabbi';
      readonly station: string;
      readonly stageM: number;
      readonly observedAt: string;
    }[];
    readonly breachAndOvertopping: {
      readonly namedLocations: readonly string[];
      readonly locationSpecificBankSideState: 'partial';
      readonly machineReadableCoordinatesAvailable: false;
      readonly activationTimesAvailable: false;
      readonly crestOrInvertElevationsAvailable: false;
      readonly widthEvolutionAvailable: false;
      readonly breachHydrographsAvailable: false;
    };
  };
  readonly publicHydraulicArchive: {
    readonly sourceDatasetId: string;
    readonly relationPrintedPages: readonly number[];
    readonly declaredModel: 'HEC-RAS';
    readonly declaredFlowMode: 'steady_flow';
    readonly inspectedArtifacts: readonly {
      readonly relativePath: string;
      readonly entryCount: number;
      readonly entryExtensions: readonly string[];
    }[];
    readonly containsHecrasProjectFiles: false;
    readonly containsMachineReadableCrossSections: false;
    readonly containsEventValidRoughness: false;
    readonly containsEventSpecificBoundaryConditions: false;
  };
  readonly conclusions: {
    readonly breachStatus: 'metadata_only';
    readonly embankmentStatus: 'incomplete_window';
    readonly channelStatus: 'metadata_only';
    readonly hydraulicUseEligible: false;
    readonly protocolRunGate: 'blocked_missing_required_evidence';
    readonly missingPolicy: 'missing_not_zero_or_inferred';
  };
  readonly methodologyNote: string;
}

export interface BenchmarkConditionedReplayTerrainAudit {
  readonly id: string;
  readonly protocolId: string;
  readonly state: 'materialized';
  readonly sourceAccess: 'loaded_after_protocol_freeze';
  readonly sourceDatasetId: string;
  readonly quality: 'incomplete_window';
  readonly coverageRequest: {
    readonly sourceCrs: string;
    readonly sourceResolutionM: number;
    readonly representationResolutionM: number;
    readonly interpolation: 'nearest_neighbor' | 'bilinear' | 'bicubic';
    readonly bounds: readonly [number, number, number, number];
    readonly width: number;
    readonly height: number;
    readonly declaredNoData: number;
    readonly geoTiffNoDataTag: 'missing' | 'present';
    readonly aoiRelation: {
      readonly sourceBounds: readonly [number, number, number, number];
      readonly targetCrs: string;
      readonly transformedBounds: readonly [number, number, number, number];
      readonly transformation: string;
      readonly reference: 'benchmark_spatial_grid_bounds';
      readonly relation: 'contains_with_tolerance';
      readonly toleranceM: number;
    };
  };
  readonly counts: {
    readonly totalPixels: number;
    readonly availablePixels: number;
    readonly missingPixels: number;
    readonly missingFraction: number;
  };
  readonly physicalFeatureCoverage: readonly {
    readonly layer: 'riverbed' | 'embankment' | 'permanent_water';
    readonly knownCenterCells: number;
    readonly terrainAvailableAtCenter: number;
    readonly terrainMissingAtCenter: number;
  }[];
  readonly conclusions: {
    readonly terrainStatus: 'incomplete_window';
    readonly hydraulicUseEligible: false;
    readonly noDataPolicy: 'missing_not_zero_or_interpolated';
    readonly fullResolutionDownloadDecision:
      'not_downloaded_coverage_gap_already_disqualifies_sole_source';
  };
  readonly methodologyNote: string;
}

export interface BenchmarkObservationStation {
  readonly stationId: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly selectionRole: string;
}

export interface BenchmarkObservationComparisonProtocol {
  readonly id: string;
  readonly state: 'protocol_frozen';
  readonly observationDatasetId: string;
  readonly validationDatasetIds: readonly string[];
  readonly dext3rEventSeriesAccessAtFreeze: 'catalog_only';
  readonly calibration: false;
  readonly window: {
    readonly start: string;
    readonly endExclusive: string;
    readonly timezone: 'UTC';
  };
  readonly rainfall: {
    readonly variableId: '1,0,3600/1,-,-,-/B13011';
    readonly sourceUnit: 'KG/M**2';
    readonly canonicalUnit: 'mm';
    readonly aggregation: 'sum_records_in_half_open_window';
    readonly comparison: 'nearest_imerg_native_grid_cell';
    readonly missingPolicy: 'missing_or_incomplete_not_zero';
    readonly stations: readonly BenchmarkObservationStation[];
  };
  readonly hydrometry: {
    readonly variableId: '254,0,0/1,-,-,-/B13215';
    readonly unit: 'M';
    readonly semantics: 'stage_relative_to_station_datum';
    readonly comparison: 'within_station_timing_and_change_only';
    readonly noCrossStationDatumArithmetic: true;
    readonly missingPolicy: 'missing_or_incomplete_not_zero';
    readonly stations: readonly BenchmarkObservationStation[];
  };
  readonly rainfallMetrics: readonly [
    'record_count',
    'covered_hours',
    'gauge_total_mm',
    'imerg_total_mm',
    'imerg_minus_gauge_mm',
  ];
  readonly hydrometryMetrics: readonly [
    'record_count',
    'coverage_start',
    'coverage_end',
    'maximum_stage_m',
    'maximum_stage_at',
    'maximum_one_hour_rise_m',
  ];
  readonly methodologyNote: string;
}

export interface BenchmarkObservationComparisonRun {
  readonly id: string;
  readonly protocolId: string;
  readonly state: 'materialized';
  readonly resultVersion: string;
  readonly claimLevel: 'station_observation_comparison';
  readonly observationAccess: 'loaded_after_protocol_freeze';
  readonly calibration: false;
  readonly quality:
    | 'available'
    | 'available_with_incomplete_hydrometry'
    | 'incomplete_rainfall'
    | 'incomplete_rainfall_and_hydrometry';
  readonly missingValuePolicy: 'blank_source_value_is_missing_numeric_zero_preserved';
  readonly sourceRequest: {
    readonly requestId: string;
    readonly acquiredAt: string;
  };
  readonly rainfall: readonly BenchmarkRainfallComparisonResult[];
  readonly hydrometry: readonly BenchmarkHydrometryComparisonResult[];
  readonly methodologyNote: string;
  readonly localArtifacts: readonly BenchmarkLocalArtifact[];
}

export interface BenchmarkRainfallComparisonResult {
  readonly stationId: string;
  readonly name: string;
  readonly quality: 'available' | 'incomplete_window';
  readonly rawRecordCount: number;
  readonly recordCount: number;
  readonly missingRecordCount: number;
  readonly coveredHours: number;
  readonly gaugeTotalMm: number | null;
  readonly imergTotalMm: number;
  readonly imergMinusGaugeMm: number | null;
  readonly sampledImergCell: {
    readonly longitude: number;
    readonly latitude: number;
    readonly sourceResolution: '0.1 degree';
    readonly samplingMethod: 'nearest_imerg_native_grid_cell';
  };
}

export interface BenchmarkHydrometryComparisonResult {
  readonly stationId: string;
  readonly name: string;
  readonly quality: 'available' | 'incomplete_window';
  readonly rawRecordCount: number;
  readonly recordCount: number;
  readonly missingRecordCount: number;
  readonly coverageStart: string | null;
  readonly coverageEnd: string | null;
  readonly maximumStageM: number | null;
  readonly maximumStageAt: string | null;
  readonly maximumOneHourRiseM: number | null;
}

export interface BenchmarkRoutingBaseline {
  readonly id: string;
  readonly semantics:
    | 'terrain_flow_concentration'
    | 'event_runoff_flow_concentration';
  readonly state: 'materialized';
  readonly claimLevel: 'hydrologic_routing';
  readonly modelVersion: string;
  readonly inputDatasetIds: readonly string[];
  readonly evaluationReferenceAccess: 'withheld';
  readonly quality: 'available' | 'incomplete_window';
  readonly methodologyNote: string;
  readonly localArtifacts: readonly BenchmarkLocalArtifact[];
}

export interface BenchmarkEvaluationProtocol {
  readonly id: string;
  readonly state: 'protocol_frozen';
  readonly predictionBaselineId: string;
  readonly evaluationDatasetId: string;
  readonly evaluationReferenceAccessAtFreeze: 'not_loaded';
  readonly calibration: false;
  readonly predictionArtifacts: {
    readonly localRunoffVolume: string;
    readonly accumulatedRunoffVolume: string;
  };
  readonly score: {
    readonly semantics: 'routed_upstream_excess_volume';
    readonly transformationVersion: string;
    readonly unit: 'm3';
    readonly formula: 'accumulated_runoff_volume_m3_minus_local_runoff_volume_m3';
    readonly negativeToleranceM3: number;
    readonly knownWaterLocalSource: 'structural_zero_only_for_score_subtraction';
  };
  readonly domain: {
    readonly inclusion: 'finite_prediction_inside_aoi';
    readonly observedLabel: 'cell_center_inside_official_event_2_polygon';
    readonly primaryBufferM: 0;
  };
  readonly metrics: readonly string[];
  readonly areaFractions: readonly number[];
  readonly tiePolicy: 'fractional_uniform_weight_at_threshold_score';
  readonly calibrationPolicy: 'none';
  readonly methodologyNote: string;
}

export interface BenchmarkEvaluationRun {
  readonly id: string;
  readonly protocolId: string;
  readonly state: 'materialized';
  readonly resultVersion: string;
  readonly claimLevel: 'hydrologic_routing_spatial_ranking_diagnostics';
  readonly evaluationReferenceAccess: 'loaded_after_protocol_freeze';
  readonly calibration: false;
  readonly counts: {
    readonly sourceFeatureCount: number;
    readonly decodedPolygonCount: number;
    readonly observedCenterCellsInsideAoi: number;
    readonly observedPositiveCells: number;
    readonly evaluatedCells: number;
    readonly excludedAccumulatedNoData: number;
    readonly excludedLocalNoData: number;
    readonly knownWaterStructuralZeroSubtractions: number;
    readonly clampedRoundoffNegatives: number;
  };
  readonly results: {
    readonly observedPrevalence: number;
    readonly rocAuc: number;
    readonly averagePrecision: number;
    readonly overlapAtFrozenAreaFractions: readonly BenchmarkOverlapResult[];
  };
  readonly methodologyNote: string;
  readonly localArtifacts: readonly BenchmarkLocalArtifact[];
}

export interface BenchmarkOverlapResult {
  readonly areaFraction: number;
  readonly thresholdM3: number;
  readonly fullCellsAboveThreshold: number;
  readonly cellsEqualThreshold: number;
  readonly fractionalTieWeight: number;
  readonly selectedEquivalentCells: number;
  readonly selectedEquivalentAreaM2: number;
  readonly weightedIntersectionCells: number;
  readonly precision: number;
  readonly recall: number;
  readonly intersectionOverUnion: number;
}

export interface BenchmarkSpatialProtocol {
  readonly coverage: {
    readonly crs: 'EPSG:4326';
    readonly commonBounds: readonly [number, number, number, number];
    readonly verifiedDatasetIds: readonly string[];
    readonly rule: 'intersection_of_declared_coverage';
  };
  readonly grid: {
    readonly crs: 'EPSG:32632';
    readonly cellSizeM: number;
    readonly bounds: readonly [number, number, number, number];
    readonly width: number;
    readonly height: number;
    readonly rowOrder: 'north_to_south';
    readonly inclusion: 'cell_center_inside_common_bounds';
    readonly h3RepresentationResolution: number;
  };
  readonly masks: {
    readonly outsideAoi: 'exclude';
    readonly requiredInputNoData: 'exclude_and_report_by_dataset';
    readonly permanentWater: {
      readonly datasetId: string;
      readonly layer: string;
      readonly treatment: 'exclude_from_land_routing_metrics_and_report';
    };
    readonly evaluationReference: 'withheld_until_prediction_is_frozen';
  };
  readonly boundaryTolerance: {
    readonly primaryOverlapBufferM: 0;
    readonly secondaryToleranceM: number;
    readonly distanceMetrics: 'cell_edges_in_grid_crs';
  };
}

const roles = new Set<string>(BENCHMARK_DATASET_ROLES);
const states = new Set(['data_audit', 'model_ready', 'evaluation_ready']);
const replayModes = new Set([
  'cutoff_constrained',
  'retrospective_reconstruction',
]);
const claims = new Set([
  'hydrologic_routing',
  'conditioned_inundation_replay',
  'blind_hindcast',
]);
const temporalRelations = new Set([
  'pre_event',
  'during_event',
  'post_event',
]);
const acquisitionStatuses = new Set([
  'remote_verified',
  'downloaded_verified',
  'downloaded_license_review',
  'blocked',
]);

/** Validates structural evidence, isolation and fail-closed replay invariants. */
export function assertHistoricalBenchmarkManifest(
  value: unknown,
): asserts value is HistoricalBenchmarkManifest {
  const root = objectValue(value, 'manifest');
  if (stringValue(root.manifestVersion, 'manifestVersion') !== '1.15.0') {
    throw new Error('manifestVersion must be "1.15.0"');
  }

  const benchmark = objectValue(root.benchmark, 'benchmark');
  stringValue(benchmark.id, 'benchmark.id');
  stringValue(benchmark.title, 'benchmark.title');
  const replayMode = allowedString(
    benchmark.replayMode,
    replayModes,
    'benchmark.replayMode',
  );
  allowedString(benchmark.state, states, 'benchmark.state');
  allowedString(benchmark.claimLevel, claims, 'benchmark.claimLevel');

  const event = objectValue(benchmark.event, 'benchmark.event');
  const start = isoTime(event.windowStart, 'benchmark.event.windowStart');
  const end = isoTime(event.windowEnd, 'benchmark.event.windowEnd');
  const cutoff = isoTime(
    event.knowledgeCutoff,
    'benchmark.event.knowledgeCutoff',
  );
  if (Date.parse(start) >= Date.parse(end)) {
    throw new Error('benchmark event windowStart must precede windowEnd');
  }
  if (Date.parse(cutoff) > Date.parse(end)) {
    throw new Error('benchmark knowledgeCutoff must not follow windowEnd');
  }

  const aoi = objectValue(benchmark.aoi, 'benchmark.aoi');
  stringValue(aoi.name, 'benchmark.aoi.name');
  const crs = stringValue(aoi.crs, 'benchmark.aoi.crs');
  stringValue(aoi.selectionBasis, 'benchmark.aoi.selectionBasis');
  const bounds = numberArray(aoi.bounds, 'benchmark.aoi.bounds', 4);
  if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
    throw new Error('benchmark AOI bounds must be [west, south, east, north]');
  }
  if (
    crs === 'EPSG:4326' &&
    (bounds[0] < -180 ||
      bounds[2] > 180 ||
      bounds[1] < -90 ||
      bounds[3] > 90)
  ) {
    throw new Error('EPSG:4326 AOI bounds exceed longitude/latitude limits');
  }
  const spatialProtocol = objectValue(
    benchmark.spatialProtocol,
    'benchmark.spatialProtocol',
  );
  const spatialReferences = assertBenchmarkSpatialProtocol(
    spatialProtocol,
    bounds,
  );
  stringArray(benchmark.evaluationMetrics, 'benchmark.evaluationMetrics');
  stringArray(benchmark.forbiddenClaims, 'benchmark.forbiddenClaims');

  if (!Array.isArray(root.datasets) || root.datasets.length === 0) {
    throw new Error('datasets must be a non-empty array');
  }

  const ids = new Set<string>();
  const artifactPaths = new Set<string>();
  if (benchmark.localArtifacts !== undefined) {
    assertLocalArtifacts(
      benchmark.localArtifacts,
      'benchmark.localArtifacts',
      artifactPaths,
    );
  }
  if (
    !Array.isArray(benchmark.routingBaselines) ||
    benchmark.routingBaselines.length === 0
  ) {
    throw new Error('benchmark.routingBaselines must be a non-empty array');
  }
  const routingBaselineIds = new Set<string>();
  const routingBaselineArtifactPaths = new Map<string, Set<string>>();
  const routingBaselineInputReferences: Array<{
    readonly label: string;
    readonly ids: readonly string[];
  }> = [];
  benchmark.routingBaselines.forEach((rawBaseline, index) => {
    const label = `benchmark.routingBaselines[${index}]`;
    const baseline = objectValue(rawBaseline, label);
    const id = stringValue(baseline.id, `${label}.id`);
    if (routingBaselineIds.has(id)) {
      throw new Error(`Duplicate routing baseline id "${id}"`);
    }
    routingBaselineIds.add(id);
    if (
      baseline.semantics !== 'terrain_flow_concentration' &&
      baseline.semantics !== 'event_runoff_flow_concentration'
    ) {
      throw new Error(`${label}.semantics is unsupported`);
    }
    if (baseline.state !== 'materialized') {
      throw new Error(`${label}.state must be materialized`);
    }
    if (baseline.claimLevel !== 'hydrologic_routing') {
      throw new Error(`${label}.claimLevel must be hydrologic_routing`);
    }
    stringValue(baseline.modelVersion, `${label}.modelVersion`);
    const inputDatasetIds = uniqueStringArray(
      baseline.inputDatasetIds,
      `${label}.inputDatasetIds`,
    );
    if (inputDatasetIds.length < 2) {
      throw new Error(`${label} requires at least two input datasets`);
    }
    if (baseline.evaluationReferenceAccess !== 'withheld') {
      throw new Error(`${label} must keep evaluation reference withheld`);
    }
    allowedString(
      baseline.quality,
      new Set(['available', 'incomplete_window']),
      `${label}.quality`,
    );
    stringValue(baseline.methodologyNote, `${label}.methodologyNote`);
    assertLocalArtifacts(
      baseline.localArtifacts,
      `${label}.localArtifacts`,
      artifactPaths,
    );
    routingBaselineArtifactPaths.set(
      id,
      new Set(
        (baseline.localArtifacts as readonly unknown[]).map(
          (artifact, artifactIndex) =>
          portablePath(
            stringValue(
              objectValue(
                artifact,
                `${label}.localArtifacts[${artifactIndex}]`,
              ).relativePath,
              `${label}.localArtifacts[${artifactIndex}].relativePath`,
            ),
            `${label}.localArtifacts[${artifactIndex}].relativePath`,
          ),
        ),
      ),
    );
    routingBaselineInputReferences.push({
      label,
      ids: inputDatasetIds,
    });
  });
  if (
    !Array.isArray(benchmark.observationComparisonProtocols) ||
    benchmark.observationComparisonProtocols.length === 0
  ) {
    throw new Error(
      'benchmark.observationComparisonProtocols must be a non-empty array',
    );
  }
  const observationProtocolIds = new Set<string>();
  const observationProtocolStations = new Map<
    string,
    { readonly rainfall: readonly string[]; readonly hydrometry: readonly string[] }
  >();
  const observationProtocolReferences: Array<{
    readonly label: string;
    readonly observationDatasetId: string;
    readonly validationDatasetIds: readonly string[];
  }> = [];
  benchmark.observationComparisonProtocols.forEach((rawProtocol, index) => {
    const label = `benchmark.observationComparisonProtocols[${index}]`;
    const protocol = objectValue(rawProtocol, label);
    const id = stringValue(protocol.id, `${label}.id`);
    if (observationProtocolIds.has(id)) {
      throw new Error(`Duplicate observation comparison protocol id "${id}"`);
    }
    observationProtocolIds.add(id);
    if (protocol.state !== 'protocol_frozen') {
      throw new Error(`${label}.state must be protocol_frozen`);
    }
    const observationDatasetId = stringValue(
      protocol.observationDatasetId,
      `${label}.observationDatasetId`,
    );
    const validationDatasetIds = uniqueStringArray(
      protocol.validationDatasetIds,
      `${label}.validationDatasetIds`,
    );
    if (validationDatasetIds.length === 0) {
      throw new Error(`${label}.validationDatasetIds must not be empty`);
    }
    if (protocol.dext3rEventSeriesAccessAtFreeze !== 'catalog_only') {
      throw new Error(`${label} must freeze before requesting Dext3r event series`);
    }
    if (booleanValue(protocol.calibration, `${label}.calibration`)) {
      throw new Error(`${label} must not calibrate from observations`);
    }

    const window = objectValue(protocol.window, `${label}.window`);
    const protocolStart = isoTime(window.start, `${label}.window.start`);
    const protocolEnd = isoTime(
      window.endExclusive,
      `${label}.window.endExclusive`,
    );
    if (protocolStart !== start || protocolEnd !== end) {
      throw new Error(`${label} window must equal the frozen event window`);
    }
    if (window.timezone !== 'UTC') {
      throw new Error(`${label}.window.timezone must be UTC`);
    }

    const rainfall = objectValue(protocol.rainfall, `${label}.rainfall`);
    if (rainfall.variableId !== '1,0,3600/1,-,-,-/B13011') {
      throw new Error(`${label}.rainfall.variableId must select hourly rain`);
    }
    if (rainfall.sourceUnit !== 'KG/M**2' || rainfall.canonicalUnit !== 'mm') {
      throw new Error(`${label}.rainfall units must preserve kg/m2 = mm`);
    }
    if (rainfall.aggregation !== 'sum_records_in_half_open_window') {
      throw new Error(`${label}.rainfall aggregation must use the frozen window`);
    }
    if (rainfall.comparison !== 'nearest_imerg_native_grid_cell') {
      throw new Error(`${label}.rainfall comparison must retain IMERG resolution`);
    }
    if (rainfall.missingPolicy !== 'missing_or_incomplete_not_zero') {
      throw new Error(`${label}.rainfall missing data must not become zero`);
    }
    assertObservationStations(
      rainfall.stations,
      `${label}.rainfall.stations`,
      1,
    );

    const hydrometry = objectValue(
      protocol.hydrometry,
      `${label}.hydrometry`,
    );
    if (hydrometry.variableId !== '254,0,0/1,-,-,-/B13215') {
      throw new Error(`${label}.hydrometry.variableId is unsupported`);
    }
    if (
      hydrometry.unit !== 'M' ||
      hydrometry.semantics !== 'stage_relative_to_station_datum'
    ) {
      throw new Error(`${label}.hydrometry must retain local-datum stage semantics`);
    }
    if (hydrometry.comparison !== 'within_station_timing_and_change_only') {
      throw new Error(`${label}.hydrometry comparison is unsupported`);
    }
    if (hydrometry.noCrossStationDatumArithmetic !== true) {
      throw new Error(`${label} must forbid arithmetic across station datums`);
    }
    if (hydrometry.missingPolicy !== 'missing_or_incomplete_not_zero') {
      throw new Error(`${label}.hydrometry missing data must not become zero`);
    }
    assertObservationStations(
      hydrometry.stations,
      `${label}.hydrometry.stations`,
      2,
    );
    const rainfallStationIds = (rainfall.stations as readonly unknown[]).map(
      (rawStation, stationIndex) =>
        stringValue(
          objectValue(
            rawStation,
            `${label}.rainfall.stations[${stationIndex}]`,
          ).stationId,
          `${label}.rainfall.stations[${stationIndex}].stationId`,
        ),
    );
    const hydrometryStationIds = (hydrometry.stations as readonly unknown[]).map(
      (rawStation, stationIndex) =>
        stringValue(
          objectValue(
            rawStation,
            `${label}.hydrometry.stations[${stationIndex}]`,
          ).stationId,
          `${label}.hydrometry.stations[${stationIndex}].stationId`,
        ),
    );

    const rainfallMetrics = uniqueStringArray(
      protocol.rainfallMetrics,
      `${label}.rainfallMetrics`,
    );
    const expectedRainfallMetrics = [
      'record_count',
      'covered_hours',
      'gauge_total_mm',
      'imerg_total_mm',
      'imerg_minus_gauge_mm',
    ];
    if (
      rainfallMetrics.length !== expectedRainfallMetrics.length ||
      rainfallMetrics.some(
        (metric, metricIndex) => metric !== expectedRainfallMetrics[metricIndex],
      )
    ) {
      throw new Error(`${label}.rainfallMetrics must match the frozen metric set`);
    }
    const hydrometryMetrics = uniqueStringArray(
      protocol.hydrometryMetrics,
      `${label}.hydrometryMetrics`,
    );
    const expectedHydrometryMetrics = [
      'record_count',
      'coverage_start',
      'coverage_end',
      'maximum_stage_m',
      'maximum_stage_at',
      'maximum_one_hour_rise_m',
    ];
    if (
      hydrometryMetrics.length !== expectedHydrometryMetrics.length ||
      hydrometryMetrics.some(
        (metric, metricIndex) =>
          metric !== expectedHydrometryMetrics[metricIndex],
      )
    ) {
      throw new Error(`${label}.hydrometryMetrics must match the frozen metric set`);
    }
    stringValue(protocol.methodologyNote, `${label}.methodologyNote`);
    observationProtocolReferences.push({
      label,
      observationDatasetId,
      validationDatasetIds,
    });
    observationProtocolStations.set(id, {
      rainfall: rainfallStationIds,
      hydrometry: hydrometryStationIds,
    });
  });
  assertObservationComparisonRuns(
    benchmark.observationComparisonRuns,
    observationProtocolIds,
    observationProtocolStations,
    artifactPaths,
  );
  if (
    !Array.isArray(benchmark.conditionedReplayProtocols) ||
    benchmark.conditionedReplayProtocols.length !== 1
  ) {
    throw new Error(
      'benchmark.conditionedReplayProtocols must contain the single frozen v0 protocol',
    );
  }
  const conditionedReplayDatasetReferences: Array<{
    readonly label: string;
    readonly ids: readonly string[];
  }> = [];
  const conditionedProtocolIds = new Set<string>();
  const conditionedProtocolRunStates = new Map<string, string>();
  const conditionedProtocolEvidenceStatuses = new Map<
    string,
    ReadonlyMap<
      BenchmarkConditionedBoundaryEvidenceId,
      BenchmarkConditionedBoundaryEvidenceStatus
    >
  >();
  const expectedConditionedEvidenceIds: readonly BenchmarkConditionedBoundaryEvidenceId[] = [
    'rainfall_and_surface_runoff_forcing',
    'antecedent_moisture_or_model_warmup',
    'montone_and_rabbi_inflow_hydrographs',
    'downstream_stage_or_discharge_boundary',
    'breach_location_timing_and_geometry',
    'embankment_crest_geometry',
    'bare_earth_terrain',
    'channel_geometry_and_roughness',
  ];
  benchmark.conditionedReplayProtocols.forEach((rawProtocol, index) => {
    const label = `benchmark.conditionedReplayProtocols[${index}]`;
    const protocol = objectValue(rawProtocol, label);
    const id = stringValue(protocol.id, `${label}.id`);
    if (conditionedProtocolIds.has(id)) {
      throw new Error(`Duplicate conditioned replay protocol id "${id}"`);
    }
    conditionedProtocolIds.add(id);
    if (protocol.state !== 'input_protocol_frozen') {
      throw new Error(`${label}.state must be input_protocol_frozen`);
    }
    if (protocol.claimLevelAtFreeze !== 'hydrologic_routing') {
      throw new Error(`${label} cannot claim inundation before the run gate passes`);
    }
    if (protocol.validationMode !== 'diagnostic_not_blind') {
      throw new Error(`${label} must disclose that the event extent was already accessed`);
    }
    if (
      protocol.evaluationReferenceAccessAtFreeze !==
      'already_loaded_for_prior_hydrologic_routing_evaluation'
    ) {
      throw new Error(`${label} must disclose prior evaluation-reference access`);
    }
    if (
      protocol.boundaryConditionAccessAtFreeze !==
      'metadata_and_prior_comparison_values_only'
    ) {
      throw new Error(`${label} must freeze before loading new conditioning values`);
    }
    if (booleanValue(protocol.calibration, `${label}.calibration`)) {
      throw new Error(`${label} must not calibrate on the observed event extent`);
    }

    const window = objectValue(protocol.window, `${label}.window`);
    const protocolStart = isoTime(window.start, `${label}.window.start`);
    const protocolEnd = isoTime(
      window.endExclusive,
      `${label}.window.endExclusive`,
    );
    if (protocolStart !== start || protocolEnd !== end) {
      throw new Error(`${label} window must equal the frozen event window`);
    }
    if (window.timezone !== 'UTC') {
      throw new Error(`${label}.window.timezone must be UTC`);
    }

    const evidence = assertObjectArray(
      protocol.requiredBoundaryEvidence,
      `${label}.requiredBoundaryEvidence`,
    );
    if (evidence.length !== expectedConditionedEvidenceIds.length) {
      throw new Error(`${label} must retain the complete conditioned-input gate`);
    }
    let blockedRequirements = 0;
    const evidenceStatuses = new Map<
      BenchmarkConditionedBoundaryEvidenceId,
      BenchmarkConditionedBoundaryEvidenceStatus
    >();
    evidence.forEach((rawEvidence, evidenceIndex) => {
      const evidenceLabel = `${label}.requiredBoundaryEvidence[${evidenceIndex}]`;
      const requirement = objectValue(rawEvidence, evidenceLabel);
      if (requirement.id !== expectedConditionedEvidenceIds[evidenceIndex]) {
        throw new Error(`${evidenceLabel}.id drifted from the frozen gate`);
      }
      if (requirement.required !== true) {
        throw new Error(`${evidenceLabel} must remain required`);
      }
      const status = allowedString(
        requirement.status,
        new Set(['available', 'missing', 'incomplete_window', 'metadata_only']),
        `${evidenceLabel}.status`,
      ) as BenchmarkConditionedBoundaryEvidenceStatus;
      evidenceStatuses.set(
        requirement.id as BenchmarkConditionedBoundaryEvidenceId,
        status,
      );
      const candidateDatasetIds = uniqueStringArray(
        requirement.candidateDatasetIds,
        `${evidenceLabel}.candidateDatasetIds`,
      );
      if (candidateDatasetIds.length === 0) {
        throw new Error(`${evidenceLabel} requires at least one candidate dataset`);
      }
      stringValue(requirement.acceptanceCriteria, `${evidenceLabel}.acceptanceCriteria`);
      if (status === 'available') {
        if (requirement.blocker !== undefined) {
          throw new Error(`${evidenceLabel} available evidence cannot retain a blocker`);
        }
      } else {
        blockedRequirements += 1;
        stringValue(requirement.blocker, `${evidenceLabel}.blocker`);
      }
      conditionedReplayDatasetReferences.push({
        label: evidenceLabel,
        ids: candidateDatasetIds,
      });
    });
    conditionedProtocolEvidenceStatuses.set(id, evidenceStatuses);

    const runGate = objectValue(protocol.runGate, `${label}.runGate`);
    const expectedRunState =
      blockedRequirements === 0
        ? 'eligible'
        : 'blocked_missing_required_evidence';
    if (runGate.state !== expectedRunState) {
      throw new Error(`${label}.runGate.state disagrees with required evidence`);
    }
    conditionedProtocolRunStates.set(id, runGate.state as string);
    if (
      runGate.requiredStatus !== 'available' ||
      runGate.missingPolicy !== 'block_run_not_zero_or_inferred'
    ) {
      throw new Error(`${label} must block missing conditioned inputs`);
    }
    if (runGate.noStageToDischargeWithoutRatingCurve !== true) {
      throw new Error(`${label} must not infer discharge from local-datum stage`);
    }
    if (runGate.noBreachInferenceFromFloodExtent !== true) {
      throw new Error(`${label} must not infer breaches from the observed extent`);
    }
    if (runGate.noTuningToEventExtent !== true) {
      throw new Error(`${label} must not tune parameters to the event extent`);
    }
    stringValue(protocol.methodologyNote, `${label}.methodologyNote`);
  });
  if (
    !Array.isArray(benchmark.conditionedReplaySourceAudits) ||
    benchmark.conditionedReplaySourceAudits.length === 0
  ) {
    throw new Error(
      'benchmark.conditionedReplaySourceAudits must retain post-freeze source findings',
    );
  }
  const conditionedReplayAuditDatasetReferences: Array<{
    readonly label: string;
    readonly ids: readonly string[];
  }> = [];
  const conditionedAuditIds = new Set<string>();
  benchmark.conditionedReplaySourceAudits.forEach((rawAudit, index) => {
    const label = `benchmark.conditionedReplaySourceAudits[${index}]`;
    const audit = objectValue(rawAudit, label);
    const id = stringValue(audit.id, `${label}.id`);
    if (conditionedAuditIds.has(id)) {
      throw new Error(`Duplicate conditioned replay source audit id "${id}"`);
    }
    conditionedAuditIds.add(id);
    const protocolId = stringValue(audit.protocolId, `${label}.protocolId`);
    if (!conditionedProtocolIds.has(protocolId)) {
      throw new Error(`${label} references unknown conditioned replay protocol`);
    }
    if (
      audit.state !== 'materialized' ||
      audit.sourceAccess !== 'loaded_after_protocol_freeze'
    ) {
      throw new Error(`${label} must remain a materialized post-freeze audit`);
    }
    const sourceDatasetIds = uniqueStringArray(
      audit.sourceDatasetIds,
      `${label}.sourceDatasetIds`,
    );
    if (sourceDatasetIds.length === 0) {
      throw new Error(`${label}.sourceDatasetIds must not be empty`);
    }
    conditionedReplayAuditDatasetReferences.push({
      label,
      ids: sourceDatasetIds,
    });
    assertAscendingPositiveIntegers(audit.sourcePages, `${label}.sourcePages`);
    if (audit.quality !== 'incomplete_window') {
      throw new Error(`${label}.quality must retain incomplete_window`);
    }

    const dischargeNetwork = objectValue(
      audit.dischargeNetwork,
      `${label}.dischargeNetwork`,
    );
    positiveInteger(
      dischargeNetwork.listedStationCount,
      `${label}.dischargeNetwork.listedStationCount`,
    );
    const requiredStationNames = uniqueStringArray(
      dischargeNetwork.requiredStationNames,
      `${label}.dischargeNetwork.requiredStationNames`,
    );
    if (requiredStationNames.length === 0) {
      throw new Error(`${label} must declare the required discharge stations`);
    }
    if (
      dischargeNetwork.containsRequiredStations !== false ||
      dischargeNetwork.eventValidRatingCurvesAvailable !== false ||
      dischargeNetwork.dischargeHydrographsAvailable !== false
    ) {
      throw new Error(`${label} cannot promote absent discharge evidence`);
    }

    const stationDatums = assertObjectArray(
      audit.stationDatums,
      `${label}.stationDatums`,
    );
    const datumStationIds = new Set<string>();
    stationDatums.forEach((rawDatum, datumIndex) => {
      const datumLabel = `${label}.stationDatums[${datumIndex}]`;
      const datum = objectValue(rawDatum, datumLabel);
      const stationId = stringValue(datum.stationId, `${datumLabel}.stationId`);
      if (datumStationIds.has(stationId)) {
        throw new Error(`${label}.stationDatums repeats station "${stationId}"`);
      }
      datumStationIds.add(stationId);
      stringValue(datum.name, `${datumLabel}.name`);
      if (datum.status === 'available') {
        finiteNumber(datum.datumMslM, `${datumLabel}.datumMslM`);
      } else if (datum.status === 'missing') {
        if (datum.datumMslM !== null) {
          throw new Error(`${datumLabel} missing datum must remain null`);
        }
      } else {
        throw new Error(`${datumLabel}.status is unsupported`);
      }
    });

    const conclusions = objectValue(audit.conclusions, `${label}.conclusions`);
    if (
      conclusions.inflowStatus !== 'incomplete_window' ||
      conclusions.downstreamStatus !== 'incomplete_window' ||
      conclusions.hydraulicUseEligible !== false ||
      conclusions.protocolRunGate !== 'blocked_missing_required_evidence' ||
      conclusions.missingPolicy !== 'missing_not_zero_or_inferred'
    ) {
      throw new Error(`${label} must keep the hydraulic replay fail-closed`);
    }
    if (conclusions.protocolRunGate !== conditionedProtocolRunStates.get(protocolId)) {
      throw new Error(`${label} contradicts the conditioned replay protocol run gate`);
    }
    stringValue(audit.methodologyNote, `${label}.methodologyNote`);
  });
  if (
    !Array.isArray(benchmark.conditionedReplayHydrographAudits) ||
    benchmark.conditionedReplayHydrographAudits.length !== 1
  ) {
    throw new Error(
      'benchmark.conditionedReplayHydrographAudits must retain the official discharge reconstruction audit',
    );
  }
  const conditionedHydrographAuditArtifactReferences: Array<{
    readonly label: string;
    readonly datasetId: string;
    readonly path: string;
  }> = [];
  benchmark.conditionedReplayHydrographAudits.forEach((rawAudit, index) => {
    const label = `benchmark.conditionedReplayHydrographAudits[${index}]`;
    const audit = objectValue(rawAudit, label);
    stringValue(audit.id, `${label}.id`);
    const protocolId = stringValue(audit.protocolId, `${label}.protocolId`);
    if (!conditionedProtocolIds.has(protocolId)) {
      throw new Error(`${label} references unknown conditioned replay protocol`);
    }
    if (
      audit.state !== 'materialized' ||
      audit.sourceAccess !==
        'loaded_after_protocol_freeze_from_archived_official_pdf' ||
      audit.quality !== 'incomplete_window'
    ) {
      throw new Error(`${label} must retain the incomplete post-freeze hydrograph audit`);
    }
    const sourceDatasetId = stringValue(
      audit.sourceDatasetId,
      `${label}.sourceDatasetId`,
    );
    const sourceArtifactPath = portablePath(
      stringValue(audit.sourceArtifactPath, `${label}.sourceArtifactPath`),
      `${label}.sourceArtifactPath`,
    );
    conditionedHydrographAuditArtifactReferences.push({
      label,
      datasetId: sourceDatasetId,
      path: sourceArtifactPath,
    });
    assertAscendingPositiveIntegers(audit.sourcePages, `${label}.sourcePages`);

    const ratingCurve = objectValue(
      audit.ratingCurveEvidence,
      `${label}.ratingCurveEvidence`,
    );
    if (
      ratingCurve.publisher !== 'ARPAE Emilia-Romagna' ||
      ratingCurve.station !== 'Montone at Castrocaro' ||
      ratingCurve.vintageYear !== 2022 ||
      ratingCurve.eventApplication !==
        'used_by_regional_commission_for_may_2023_reconstruction' ||
      ratingCurve.formulaOrTableAvailable !== false
    ) {
      throw new Error(`${label} must not promote the unpublished 2022 rating curve`);
    }

    const recalibration = objectValue(
      audit.effortsRecalibrationContext,
      `${label}.effortsRecalibrationContext`,
    );
    const recalibrationDatasetId = stringValue(
      recalibration.sourceDatasetId,
      `${label}.effortsRecalibrationContext.sourceDatasetId`,
    );
    if (recalibrationDatasetId !== 'arpae-efforts-romagna-recalibration-2024') {
      throw new Error(
        `${label} must reference the official EFFORTS recalibration dataset`,
      );
    }
    conditionedReplayAuditDatasetReferences.push({
      label,
      ids: [sourceDatasetId, recalibrationDatasetId],
    });
    if (
      recalibration.determinationId !== 'DET-2024-723' ||
      recalibration.topkapiCalibrationBasin !== 'Montone-Rabbi' ||
      recalibration.hecRasCalibrationRiver !== 'Montone' ||
      recalibration.measuredVsModelledHydrographsRequired !== true ||
      recalibration.highFlowRatingCurveStation !== 'Montone at Castrocaro' ||
      recalibration.priorCurveCalibrationBasis !==
        'direct_discharge_measurements_low_flow_only' ||
      recalibration.minimumHistoricalFloodEvents !== 2 ||
      recalibration.separateValidationEventRequired !== true ||
      recalibration.uncertaintyAssessmentRequired !== true ||
      recalibration.nonBijectiveOrFloodLoopBehaviourMustBeAssessed !== true ||
      recalibration.requiredDeliveryDate !== '2025-12-31' ||
      recalibration.publicMachineReadableDeliverablesAvailable !== false
    ) {
      throw new Error(
        `${label} must retain the official high-flow recalibration constraints`,
      );
    }

    const hydrograph = objectValue(
      audit.hydrographEvidence,
      `${label}.hydrographEvidence`,
    );
    if (
      hydrograph.figureNumber !== 63 ||
      hydrograph.temporalResolutionMinutes !== 60 ||
      hydrograph.publishedAnalysisStartDate !== '2023-05-15' ||
      hydrograph.publishedAnalysisEndDateInclusive !== '2023-05-19' ||
      hydrograph.coversProtocolWindow !== true ||
      hydrograph.tabulatedValuesAvailable !== false ||
      hydrograph.machineReadableSeriesAvailable !== false ||
      hydrograph.peakDischargePublished !== false
    ) {
      throw new Error(`${label} must retain the plotted-only hourly hydrograph limits`);
    }

    const balance = objectValue(
      audit.publishedVolumeBalance,
      `${label}.publishedVolumeBalance`,
    );
    const basinAreaKm2 = finiteNumber(
      balance.basinAreaKm2,
      `${label}.publishedVolumeBalance.basinAreaKm2`,
    );
    const rainfallDepthMm = finiteNumber(
      balance.rainfallDepthMm,
      `${label}.publishedVolumeBalance.rainfallDepthMm`,
    );
    const rainfallVolumeMillionM3 = finiteNumber(
      balance.rainfallVolumeMillionM3,
      `${label}.publishedVolumeBalance.rainfallVolumeMillionM3`,
    );
    const dischargeVolumeMillionM3 = finiteNumber(
      balance.dischargeVolumeMillionM3,
      `${label}.publishedVolumeBalance.dischargeVolumeMillionM3`,
    );
    const runoffCoefficient = finiteNumber(
      balance.runoffCoefficient,
      `${label}.publishedVolumeBalance.runoffCoefficient`,
    );
    if (
      basinAreaKm2 !== 237 ||
      rainfallDepthMm !== 201.25 ||
      rainfallVolumeMillionM3 !== 47.6 ||
      dischargeVolumeMillionM3 !== 36.86 ||
      runoffCoefficient !== 0.77
    ) {
      throw new Error(`${label} published volume balance drifted from Table 9`);
    }
    const depthAreaVolumeMillionM3 =
      (rainfallDepthMm * basinAreaKm2) / 1000;
    if (Math.abs(depthAreaVolumeMillionM3 - rainfallVolumeMillionM3) > 0.15) {
      throw new Error(`${label} rainfall depth and volume are dimensionally inconsistent`);
    }
    if (
      Math.abs(
        dischargeVolumeMillionM3 / rainfallVolumeMillionM3 - runoffCoefficient,
      ) > 0.01
    ) {
      throw new Error(`${label} runoff coefficient is inconsistent with published volumes`);
    }

    const conclusions = objectValue(audit.conclusions, `${label}.conclusions`);
    if (
      conclusions.montoneInflowStatus !== 'incomplete_window' ||
      conclusions.rabbiInflowStatus !== 'missing' ||
      conclusions.combinedInflowStatus !== 'incomplete_window' ||
      conclusions.hydraulicUseEligible !== false ||
      conclusions.protocolRunGate !== 'blocked_missing_required_evidence' ||
      conclusions.missingPolicy !== 'missing_not_digitized_or_inferred'
    ) {
      throw new Error(`${label} must keep plotted discharge evidence fail-closed`);
    }
    if (conclusions.protocolRunGate !== conditionedProtocolRunStates.get(protocolId)) {
      throw new Error(`${label} contradicts the conditioned replay protocol run gate`);
    }
    if (
      conclusions.combinedInflowStatus !==
      conditionedProtocolEvidenceStatuses
        .get(protocolId)
        ?.get('montone_and_rabbi_inflow_hydrographs')
    ) {
      throw new Error(`${label} inflow status drifted from the conditioned replay gate`);
    }
    stringValue(audit.methodologyNote, `${label}.methodologyNote`);
  });
  if (
    !Array.isArray(benchmark.conditionedReplayPhysicalAudits) ||
    benchmark.conditionedReplayPhysicalAudits.length !== 1
  ) {
    throw new Error(
      'benchmark.conditionedReplayPhysicalAudits must retain the official physical-source audit',
    );
  }
  const conditionedPhysicalAuditDatasetReferences: Array<{
    readonly label: string;
    readonly ids: readonly string[];
  }> = [];
  const conditionedPhysicalAuditArtifactReferences: Array<{
    readonly label: string;
    readonly datasetId: string;
    readonly paths: readonly string[];
  }> = [];
  benchmark.conditionedReplayPhysicalAudits.forEach((rawAudit, index) => {
    const label = `benchmark.conditionedReplayPhysicalAudits[${index}]`;
    const audit = objectValue(rawAudit, label);
    stringValue(audit.id, `${label}.id`);
    const protocolId = stringValue(audit.protocolId, `${label}.protocolId`);
    if (!conditionedProtocolIds.has(protocolId)) {
      throw new Error(`${label} references unknown conditioned replay protocol`);
    }
    if (
      audit.state !== 'materialized' ||
      audit.sourceAccess !== 'loaded_after_protocol_freeze' ||
      audit.quality !== 'metadata_only'
    ) {
      throw new Error(`${label} must retain the metadata-only post-freeze audit`);
    }
    const sourceDatasetIds = uniqueStringArray(
      audit.sourceDatasetIds,
      `${label}.sourceDatasetIds`,
    );
    if (sourceDatasetIds.length < 2) {
      throw new Error(`${label} must retain both event and hydraulic archive sources`);
    }
    conditionedPhysicalAuditDatasetReferences.push({
      label,
      ids: sourceDatasetIds,
    });

    const monograph = objectValue(audit.eventMonograph, `${label}.eventMonograph`);
    const monographDatasetId = stringValue(
      monograph.sourceDatasetId,
      `${label}.eventMonograph.sourceDatasetId`,
    );
    if (!sourceDatasetIds.includes(monographDatasetId)) {
      throw new Error(`${label}.eventMonograph source must be declared by the audit`);
    }
    assertAscendingPositiveIntegers(
      monograph.printedPages,
      `${label}.eventMonograph.printedPages`,
    );
    if (monograph.stageDatum !== 'metres_above_local_gauge_zero') {
      throw new Error(`${label} must not promote local gauge-zero stage to an absolute datum`);
    }
    const stagePeaks = assertObjectArray(
      monograph.reportedStagePeaks,
      `${label}.eventMonograph.reportedStagePeaks`,
    );
    if (stagePeaks.length === 0) {
      throw new Error(`${label}.eventMonograph must retain the reported stage context`);
    }
    const reportedStations = new Set<string>();
    stagePeaks.forEach((rawPeak, peakIndex) => {
      const peakLabel = `${label}.eventMonograph.reportedStagePeaks[${peakIndex}]`;
      const peak = objectValue(rawPeak, peakLabel);
      allowedString(
        peak.watercourse,
        new Set(['Montone', 'Rabbi']),
        `${peakLabel}.watercourse`,
      );
      const station = stringValue(peak.station, `${peakLabel}.station`);
      if (reportedStations.has(station)) {
        throw new Error(`${label}.eventMonograph repeats station "${station}"`);
      }
      reportedStations.add(station);
      if (finiteNumber(peak.stageM, `${peakLabel}.stageM`) <= 0) {
        throw new Error(`${peakLabel}.stageM must be positive`);
      }
      const observedAt = isoTime(peak.observedAt, `${peakLabel}.observedAt`);
      if (Date.parse(observedAt) < Date.parse(start) || Date.parse(observedAt) >= Date.parse(end)) {
        throw new Error(`${peakLabel}.observedAt must fall inside the replay window`);
      }
    });
    const breach = objectValue(
      monograph.breachAndOvertopping,
      `${label}.eventMonograph.breachAndOvertopping`,
    );
    if (
      uniqueStringArray(
        breach.namedLocations,
        `${label}.eventMonograph.breachAndOvertopping.namedLocations`,
      ).length < 2
    ) {
      throw new Error(`${label} must retain the named breach and overtopping context`);
    }
    if (
      breach.locationSpecificBankSideState !== 'partial' ||
      breach.machineReadableCoordinatesAvailable !== false ||
      breach.activationTimesAvailable !== false ||
      breach.crestOrInvertElevationsAvailable !== false ||
      breach.widthEvolutionAvailable !== false ||
      breach.breachHydrographsAvailable !== false
    ) {
      throw new Error(`${label} cannot promote narrative breach evidence into model geometry`);
    }

    const archive = objectValue(
      audit.publicHydraulicArchive,
      `${label}.publicHydraulicArchive`,
    );
    const archiveDatasetId = stringValue(
      archive.sourceDatasetId,
      `${label}.publicHydraulicArchive.sourceDatasetId`,
    );
    if (!sourceDatasetIds.includes(archiveDatasetId)) {
      throw new Error(`${label}.publicHydraulicArchive source must be declared by the audit`);
    }
    assertAscendingPositiveIntegers(
      archive.relationPrintedPages,
      `${label}.publicHydraulicArchive.relationPrintedPages`,
    );
    if (archive.declaredModel !== 'HEC-RAS' || archive.declaredFlowMode !== 'steady_flow') {
      throw new Error(`${label} must preserve the source-described hydraulic method`);
    }
    const inspectedArtifacts = assertObjectArray(
      archive.inspectedArtifacts,
      `${label}.publicHydraulicArchive.inspectedArtifacts`,
    );
    if (inspectedArtifacts.length !== 3) {
      throw new Error(`${label} must retain the three inspected public archives`);
    }
    const inspectedPaths = new Set<string>();
    inspectedArtifacts.forEach((rawArtifact, artifactIndex) => {
      const artifactLabel = `${label}.publicHydraulicArchive.inspectedArtifacts[${artifactIndex}]`;
      const artifact = objectValue(rawArtifact, artifactLabel);
      const relativePath = portablePath(
        stringValue(artifact.relativePath, `${artifactLabel}.relativePath`),
        `${artifactLabel}.relativePath`,
      );
      if (inspectedPaths.has(relativePath)) {
        throw new Error(`${label} repeats inspected archive "${relativePath}"`);
      }
      inspectedPaths.add(relativePath);
      positiveInteger(artifact.entryCount, `${artifactLabel}.entryCount`);
      const extensions = uniqueStringArray(
        artifact.entryExtensions,
        `${artifactLabel}.entryExtensions`,
      );
      if (extensions.length !== 1 || extensions[0] !== '.DWG') {
        throw new Error(`${artifactLabel} must retain the drawing-only archive finding`);
      }
    });
    conditionedPhysicalAuditArtifactReferences.push({
      label,
      datasetId: archiveDatasetId,
      paths: [...inspectedPaths],
    });
    if (
      archive.containsHecrasProjectFiles !== false ||
      archive.containsMachineReadableCrossSections !== false ||
      archive.containsEventValidRoughness !== false ||
      archive.containsEventSpecificBoundaryConditions !== false
    ) {
      throw new Error(`${label} cannot promote drawing archives into hydraulic model inputs`);
    }

    const conclusions = objectValue(audit.conclusions, `${label}.conclusions`);
    if (
      conclusions.breachStatus !== 'metadata_only' ||
      conclusions.embankmentStatus !== 'incomplete_window' ||
      conclusions.channelStatus !== 'metadata_only' ||
      conclusions.hydraulicUseEligible !== false ||
      conclusions.protocolRunGate !== 'blocked_missing_required_evidence' ||
      conclusions.missingPolicy !== 'missing_not_zero_or_inferred'
    ) {
      throw new Error(`${label} must keep physical conditioning evidence fail-closed`);
    }
    if (conclusions.protocolRunGate !== conditionedProtocolRunStates.get(protocolId)) {
      throw new Error(`${label} contradicts the conditioned replay protocol run gate`);
    }
    const protocolEvidenceStatuses = conditionedProtocolEvidenceStatuses.get(protocolId);
    if (
      conclusions.breachStatus !==
        protocolEvidenceStatuses?.get('breach_location_timing_and_geometry') ||
      conclusions.embankmentStatus !==
        protocolEvidenceStatuses?.get('embankment_crest_geometry') ||
      conclusions.channelStatus !==
        protocolEvidenceStatuses?.get('channel_geometry_and_roughness')
    ) {
      throw new Error(`${label} physical statuses drifted from the conditioned replay gate`);
    }
    stringValue(audit.methodologyNote, `${label}.methodologyNote`);
  });
  if (
    !Array.isArray(benchmark.conditionedReplayTerrainAudits) ||
    benchmark.conditionedReplayTerrainAudits.length !== 1
  ) {
    throw new Error(
      'benchmark.conditionedReplayTerrainAudits must retain the bounded PST audit',
    );
  }
  const conditionedTerrainAuditDatasetReferences: Array<{
    readonly label: string;
    readonly id: string;
  }> = [];
  benchmark.conditionedReplayTerrainAudits.forEach((rawAudit, index) => {
    const label = `benchmark.conditionedReplayTerrainAudits[${index}]`;
    const audit = objectValue(rawAudit, label);
    stringValue(audit.id, `${label}.id`);
    const protocolId = stringValue(audit.protocolId, `${label}.protocolId`);
    if (!conditionedProtocolIds.has(protocolId)) {
      throw new Error(`${label} references unknown conditioned replay protocol`);
    }
    if (
      audit.state !== 'materialized' ||
      audit.sourceAccess !== 'loaded_after_protocol_freeze' ||
      audit.quality !== 'incomplete_window'
    ) {
      throw new Error(`${label} must retain the incomplete post-freeze terrain audit`);
    }
    const sourceDatasetId = stringValue(
      audit.sourceDatasetId,
      `${label}.sourceDatasetId`,
    );
    conditionedTerrainAuditDatasetReferences.push({
      label,
      id: sourceDatasetId,
    });

    const request = objectValue(audit.coverageRequest, `${label}.coverageRequest`);
    stringValue(request.sourceCrs, `${label}.coverageRequest.sourceCrs`);
    const sourceResolutionM = finiteNumber(
      request.sourceResolutionM,
      `${label}.coverageRequest.sourceResolutionM`,
    );
    const representationResolutionM = finiteNumber(
      request.representationResolutionM,
      `${label}.coverageRequest.representationResolutionM`,
    );
    if (sourceResolutionM <= 0 || representationResolutionM <= 0) {
      throw new Error(`${label}.coverageRequest resolutions must be positive`);
    }
    if (representationResolutionM < sourceResolutionM) {
      throw new Error(
        `${label}.coverageRequest representation cannot claim finer resolution than the source`,
      );
    }
    allowedString(
      request.interpolation,
      new Set(['nearest_neighbor', 'bilinear', 'bicubic']),
      `${label}.coverageRequest.interpolation`,
    );
    finiteNumber(request.declaredNoData, `${label}.coverageRequest.declaredNoData`);
    allowedString(
      request.geoTiffNoDataTag,
      new Set(['missing', 'present']),
      `${label}.coverageRequest.geoTiffNoDataTag`,
    );
    const requestBounds = numberArray(
      request.bounds,
      `${label}.coverageRequest.bounds`,
      4,
    );
    if (requestBounds[0] >= requestBounds[2] || requestBounds[1] >= requestBounds[3]) {
      throw new Error(`${label}.coverageRequest.bounds must be ordered`);
    }
    const aoiRelation = objectValue(
      request.aoiRelation,
      `${label}.coverageRequest.aoiRelation`,
    );
    const relationSourceBounds = numberArray(
      aoiRelation.sourceBounds,
      `${label}.coverageRequest.aoiRelation.sourceBounds`,
      4,
    );
    if (relationSourceBounds.some((bound, boundIndex) => bound !== requestBounds[boundIndex])) {
      throw new Error(`${label}.coverageRequest AOI source bounds must equal the request`);
    }
    if (aoiRelation.targetCrs !== spatialReferences.gridCrs) {
      throw new Error(`${label}.coverageRequest AOI target CRS must equal the benchmark grid`);
    }
    const transformedBounds = numberArray(
      aoiRelation.transformedBounds,
      `${label}.coverageRequest.aoiRelation.transformedBounds`,
      4,
    );
    assertOrderedBounds(
      transformedBounds,
      `${label}.coverageRequest.aoiRelation.transformedBounds`,
    );
    stringValue(
      aoiRelation.transformation,
      `${label}.coverageRequest.aoiRelation.transformation`,
    );
    if (
      aoiRelation.reference !== 'benchmark_spatial_grid_bounds' ||
      aoiRelation.relation !== 'contains_with_tolerance'
    ) {
      throw new Error(`${label}.coverageRequest must relate terrain to the benchmark grid`);
    }
    const relationToleranceM = finiteNumber(
      aoiRelation.toleranceM,
      `${label}.coverageRequest.aoiRelation.toleranceM`,
    );
    if (relationToleranceM < 0 || relationToleranceM > sourceResolutionM) {
      throw new Error(
        `${label}.coverageRequest AOI tolerance must be between zero and one source cell`,
      );
    }
    const gridBounds = spatialReferences.gridBounds;
    if (
      transformedBounds[0] > gridBounds[0] + relationToleranceM ||
      transformedBounds[1] > gridBounds[1] + relationToleranceM ||
      transformedBounds[2] < gridBounds[2] - relationToleranceM ||
      transformedBounds[3] < gridBounds[3] - relationToleranceM
    ) {
      throw new Error(`${label}.coverageRequest transformed bounds do not contain the benchmark grid`);
    }
    const width = positiveInteger(request.width, `${label}.coverageRequest.width`);
    const height = positiveInteger(request.height, `${label}.coverageRequest.height`);

    const counts = objectValue(audit.counts, `${label}.counts`);
    const totalPixels = positiveInteger(counts.totalPixels, `${label}.counts.totalPixels`);
    const availablePixels = nonNegativeInteger(
      counts.availablePixels,
      `${label}.counts.availablePixels`,
    );
    const missingPixels = nonNegativeInteger(
      counts.missingPixels,
      `${label}.counts.missingPixels`,
    );
    const missingFraction = finiteNumber(
      counts.missingFraction,
      `${label}.counts.missingFraction`,
    );
    if (
      totalPixels !== width * height ||
      availablePixels + missingPixels !== totalPixels ||
      !approximatelyEqual(missingFraction, missingPixels / totalPixels)
    ) {
      throw new Error(`${label}.counts are inconsistent with the bounded raster`);
    }

    const physicalCoverage = assertObjectArray(
      audit.physicalFeatureCoverage,
      `${label}.physicalFeatureCoverage`,
    );
    const physicalLayers = new Set<string>();
    physicalCoverage.forEach((rawCoverage, coverageIndex) => {
      const coverageLabel = `${label}.physicalFeatureCoverage[${coverageIndex}]`;
      const coverage = objectValue(rawCoverage, coverageLabel);
      const layer = allowedString(
        coverage.layer,
        new Set(['riverbed', 'embankment', 'permanent_water']),
        `${coverageLabel}.layer`,
      );
      if (physicalLayers.has(layer)) {
        throw new Error(`${label}.physicalFeatureCoverage repeats layer "${layer}"`);
      }
      physicalLayers.add(layer);
      const knownCenterCells = positiveInteger(
        coverage.knownCenterCells,
        `${coverageLabel}.knownCenterCells`,
      );
      const terrainAvailableAtCenter = nonNegativeInteger(
        coverage.terrainAvailableAtCenter,
        `${coverageLabel}.terrainAvailableAtCenter`,
      );
      const terrainMissingAtCenter = nonNegativeInteger(
        coverage.terrainMissingAtCenter,
        `${coverageLabel}.terrainMissingAtCenter`,
      );
      if (
        knownCenterCells !== terrainAvailableAtCenter + terrainMissingAtCenter
      ) {
        throw new Error(`${coverageLabel} center-cell counts are inconsistent`);
      }
    });

    const conclusions = objectValue(audit.conclusions, `${label}.conclusions`);
    if (
      conclusions.terrainStatus !== 'incomplete_window' ||
      conclusions.hydraulicUseEligible !== false ||
      conclusions.noDataPolicy !== 'missing_not_zero_or_interpolated' ||
      conclusions.fullResolutionDownloadDecision !==
        'not_downloaded_coverage_gap_already_disqualifies_sole_source'
    ) {
      throw new Error(`${label} must keep incomplete terrain fail-closed`);
    }
    stringValue(audit.methodologyNote, `${label}.methodologyNote`);
  });
  if (
    !Array.isArray(benchmark.evaluationProtocols) ||
    benchmark.evaluationProtocols.length === 0
  ) {
    throw new Error('benchmark.evaluationProtocols must be a non-empty array');
  }
  const evaluationProtocolReferences: Array<{
    readonly label: string;
    readonly predictionBaselineId: string;
    readonly evaluationDatasetId: string;
    readonly predictionArtifactPaths: readonly string[];
  }> = [];
  const evaluationProtocolIds = new Set<string>();
  const evaluationProtocolFractions = new Map<string, readonly number[]>();
  const expectedMetrics = [
    'roc_auc',
    'average_precision',
    'tie_weighted_overlap_at_frozen_area_fractions',
  ];
  benchmark.evaluationProtocols.forEach((rawProtocol, index) => {
    const label = `benchmark.evaluationProtocols[${index}]`;
    const protocol = objectValue(rawProtocol, label);
    const id = stringValue(protocol.id, `${label}.id`);
    if (evaluationProtocolIds.has(id)) {
      throw new Error(`Duplicate evaluation protocol id "${id}"`);
    }
    evaluationProtocolIds.add(id);
    if (protocol.state !== 'protocol_frozen') {
      throw new Error(`${label}.state must be protocol_frozen`);
    }
    const predictionBaselineId = stringValue(
      protocol.predictionBaselineId,
      `${label}.predictionBaselineId`,
    );
    const evaluationDatasetId = stringValue(
      protocol.evaluationDatasetId,
      `${label}.evaluationDatasetId`,
    );
    if (protocol.evaluationReferenceAccessAtFreeze !== 'not_loaded') {
      throw new Error(`${label} must freeze before loading evaluation data`);
    }
    if (booleanValue(protocol.calibration, `${label}.calibration`)) {
      throw new Error(`${label} must not calibrate on evaluation data`);
    }
    const predictionArtifacts = objectValue(
      protocol.predictionArtifacts,
      `${label}.predictionArtifacts`,
    );
    const predictionArtifactPaths = [
      portablePath(
        stringValue(
          predictionArtifacts.localRunoffVolume,
          `${label}.predictionArtifacts.localRunoffVolume`,
        ),
        `${label}.predictionArtifacts.localRunoffVolume`,
      ),
      portablePath(
        stringValue(
          predictionArtifacts.accumulatedRunoffVolume,
          `${label}.predictionArtifacts.accumulatedRunoffVolume`,
        ),
        `${label}.predictionArtifacts.accumulatedRunoffVolume`,
      ),
    ];
    if (predictionArtifactPaths[0] === predictionArtifactPaths[1]) {
      throw new Error(`${label} prediction artifacts must be distinct`);
    }
    const score = objectValue(protocol.score, `${label}.score`);
    if (score.semantics !== 'routed_upstream_excess_volume') {
      throw new Error(`${label}.score.semantics is unsupported`);
    }
    stringValue(
      score.transformationVersion,
      `${label}.score.transformationVersion`,
    );
    if (score.unit !== 'm3') {
      throw new Error(`${label}.score.unit must be m3`);
    }
    if (
      score.formula !==
      'accumulated_runoff_volume_m3_minus_local_runoff_volume_m3'
    ) {
      throw new Error(`${label}.score.formula is unsupported`);
    }
    const negativeToleranceM3 = finiteNumber(
      score.negativeToleranceM3,
      `${label}.score.negativeToleranceM3`,
    );
    if (negativeToleranceM3 < 0 || negativeToleranceM3 > 1e-6) {
      throw new Error(`${label}.score.negativeToleranceM3 is unreasonable`);
    }
    if (
      score.knownWaterLocalSource !==
      'structural_zero_only_for_score_subtraction'
    ) {
      throw new Error(`${label}.score.knownWaterLocalSource is unsupported`);
    }
    const domain = objectValue(protocol.domain, `${label}.domain`);
    if (domain.inclusion !== 'finite_prediction_inside_aoi') {
      throw new Error(`${label}.domain.inclusion is unsupported`);
    }
    if (
      domain.observedLabel !==
      'cell_center_inside_official_event_2_polygon'
    ) {
      throw new Error(`${label}.domain.observedLabel is unsupported`);
    }
    if (domain.primaryBufferM !== 0) {
      throw new Error(`${label} primary labels must remain unbuffered`);
    }
    const metrics = uniqueStringArray(protocol.metrics, `${label}.metrics`);
    if (
      metrics.length !== expectedMetrics.length ||
      metrics.some(
        (metric, metricIndex) => metric !== expectedMetrics[metricIndex],
      )
    ) {
      throw new Error(`${label}.metrics must match the frozen metric set`);
    }
    const areaFractions = numberArray(
      protocol.areaFractions,
      `${label}.areaFractions`,
      4,
    );
    const expectedFractions = [0.01, 0.05, 0.1, 0.2];
    if (
      areaFractions.some(
        (fraction, fractionIndex) =>
          fraction !== expectedFractions[fractionIndex],
      )
    ) {
      throw new Error(`${label}.areaFractions must match the frozen set`);
    }
    if (
      protocol.tiePolicy !==
      'fractional_uniform_weight_at_threshold_score'
    ) {
      throw new Error(`${label}.tiePolicy is unsupported`);
    }
    if (protocol.calibrationPolicy !== 'none') {
      throw new Error(`${label}.calibrationPolicy must be none`);
    }
    stringValue(protocol.methodologyNote, `${label}.methodologyNote`);
    evaluationProtocolReferences.push({
      label,
      predictionBaselineId,
      evaluationDatasetId,
      predictionArtifactPaths,
    });
    evaluationProtocolFractions.set(id, areaFractions);
  });
  const declaredEvaluationMetrics = uniqueStringArray(
    benchmark.evaluationMetrics,
    'benchmark.evaluationMetrics',
  );
  if (
    declaredEvaluationMetrics.length !== expectedMetrics.length ||
    declaredEvaluationMetrics.some(
      (metric, index) => metric !== expectedMetrics[index],
    )
  ) {
    throw new Error(
      'benchmark.evaluationMetrics must match the frozen metric set',
    );
  }
  if (
    !Array.isArray(benchmark.evaluationRuns) ||
    benchmark.evaluationRuns.length === 0
  ) {
    throw new Error('benchmark.evaluationRuns must be a non-empty array');
  }
  const evaluationRunIds = new Set<string>();
  const evaluationRunReferences: Array<{
    readonly label: string;
    readonly protocolId: string;
    readonly areaFractions: readonly number[];
  }> = [];
  benchmark.evaluationRuns.forEach((rawRun, index) => {
    const label = `benchmark.evaluationRuns[${index}]`;
    const run = objectValue(rawRun, label);
    const id = stringValue(run.id, `${label}.id`);
    if (evaluationRunIds.has(id)) {
      throw new Error(`Duplicate evaluation run id "${id}"`);
    }
    evaluationRunIds.add(id);
    const protocolId = stringValue(run.protocolId, `${label}.protocolId`);
    if (run.state !== 'materialized') {
      throw new Error(`${label}.state must be materialized`);
    }
    stringValue(run.resultVersion, `${label}.resultVersion`);
    if (
      run.claimLevel !==
      'hydrologic_routing_spatial_ranking_diagnostics'
    ) {
      throw new Error(`${label}.claimLevel is unsupported`);
    }
    if (run.evaluationReferenceAccess !== 'loaded_after_protocol_freeze') {
      throw new Error(`${label} must record post-freeze reference access`);
    }
    if (booleanValue(run.calibration, `${label}.calibration`)) {
      throw new Error(`${label} must not calibrate on evaluation data`);
    }

    const counts = objectValue(run.counts, `${label}.counts`);
    const sourceFeatureCount = positiveInteger(
      counts.sourceFeatureCount,
      `${label}.counts.sourceFeatureCount`,
    );
    const decodedPolygonCount = positiveInteger(
      counts.decodedPolygonCount,
      `${label}.counts.decodedPolygonCount`,
    );
    if (decodedPolygonCount < sourceFeatureCount) {
      throw new Error(`${label} decoded fewer polygons than source features`);
    }
    const observedCenterCellsInsideAoi = positiveInteger(
      counts.observedCenterCellsInsideAoi,
      `${label}.counts.observedCenterCellsInsideAoi`,
    );
    const observedPositiveCells = positiveInteger(
      counts.observedPositiveCells,
      `${label}.counts.observedPositiveCells`,
    );
    const evaluatedCells = positiveInteger(
      counts.evaluatedCells,
      `${label}.counts.evaluatedCells`,
    );
    if (
      observedPositiveCells > observedCenterCellsInsideAoi ||
      observedPositiveCells >= evaluatedCells
    ) {
      throw new Error(`${label} observed-positive cell counts are invalid`);
    }
    for (const countName of [
      'excludedAccumulatedNoData',
      'excludedLocalNoData',
      'knownWaterStructuralZeroSubtractions',
      'clampedRoundoffNegatives',
    ]) {
      nonNegativeInteger(counts[countName], `${label}.counts.${countName}`);
    }

    const results = objectValue(run.results, `${label}.results`);
    const observedPrevalence = probability(
      results.observedPrevalence,
      `${label}.results.observedPrevalence`,
    );
    if (
      !approximatelyEqual(
        observedPrevalence,
        observedPositiveCells / evaluatedCells,
      )
    ) {
      throw new Error(`${label} observed prevalence disagrees with counts`);
    }
    probability(results.rocAuc, `${label}.results.rocAuc`);
    probability(
      results.averagePrecision,
      `${label}.results.averagePrecision`,
    );
    if (!Array.isArray(results.overlapAtFrozenAreaFractions)) {
      throw new Error(
        `${label}.results.overlapAtFrozenAreaFractions must be an array`,
      );
    }
    const areaFractions = results.overlapAtFrozenAreaFractions.map(
      (rawOverlap, overlapIndex) => {
        const overlapLabel =
          `${label}.results.overlapAtFrozenAreaFractions[${overlapIndex}]`;
        const overlap = objectValue(rawOverlap, overlapLabel);
        const areaFraction = probability(
          overlap.areaFraction,
          `${overlapLabel}.areaFraction`,
        );
        if (areaFraction === 0) {
          throw new Error(`${overlapLabel}.areaFraction must be positive`);
        }
        const thresholdM3 = finiteNumber(
          overlap.thresholdM3,
          `${overlapLabel}.thresholdM3`,
        );
        if (thresholdM3 < 0) {
          throw new Error(`${overlapLabel}.thresholdM3 must be non-negative`);
        }
        const fullCellsAboveThreshold = nonNegativeInteger(
          overlap.fullCellsAboveThreshold,
          `${overlapLabel}.fullCellsAboveThreshold`,
        );
        const cellsEqualThreshold = positiveInteger(
          overlap.cellsEqualThreshold,
          `${overlapLabel}.cellsEqualThreshold`,
        );
        if (
          fullCellsAboveThreshold + cellsEqualThreshold >
          evaluatedCells
        ) {
          throw new Error(
            `${overlapLabel} threshold-group counts exceed evaluated cells`,
          );
        }
        const fractionalTieWeight = probability(
          overlap.fractionalTieWeight,
          `${overlapLabel}.fractionalTieWeight`,
        );
        const selectedEquivalentCells = finiteNumber(
          overlap.selectedEquivalentCells,
          `${overlapLabel}.selectedEquivalentCells`,
        );
        const selectedEquivalentAreaM2 = finiteNumber(
          overlap.selectedEquivalentAreaM2,
          `${overlapLabel}.selectedEquivalentAreaM2`,
        );
        const weightedIntersectionCells = finiteNumber(
          overlap.weightedIntersectionCells,
          `${overlapLabel}.weightedIntersectionCells`,
        );
        const precision = probability(
          overlap.precision,
          `${overlapLabel}.precision`,
        );
        const recall = probability(
          overlap.recall,
          `${overlapLabel}.recall`,
        );
        const intersectionOverUnion = probability(
          overlap.intersectionOverUnion,
          `${overlapLabel}.intersectionOverUnion`,
        );
        if (
          !approximatelyEqual(
            selectedEquivalentCells,
            areaFraction * evaluatedCells,
          ) ||
          !approximatelyEqual(
            selectedEquivalentAreaM2,
            selectedEquivalentCells * spatialReferences.cellAreaM2,
          ) ||
          !approximatelyEqual(
            selectedEquivalentCells,
            fullCellsAboveThreshold +
              fractionalTieWeight * cellsEqualThreshold,
          ) ||
          !approximatelyEqual(
            precision,
            weightedIntersectionCells / selectedEquivalentCells,
          ) ||
          !approximatelyEqual(
            recall,
            weightedIntersectionCells / observedPositiveCells,
          ) ||
          !approximatelyEqual(
            intersectionOverUnion,
            weightedIntersectionCells /
              (selectedEquivalentCells +
                observedPositiveCells -
                weightedIntersectionCells),
          )
        ) {
          throw new Error(`${overlapLabel} metrics are internally inconsistent`);
        }
        return areaFraction;
      },
    );
    stringValue(run.methodologyNote, `${label}.methodologyNote`);
    assertLocalArtifacts(
      run.localArtifacts,
      `${label}.localArtifacts`,
      artifactPaths,
    );
    evaluationRunReferences.push({label, protocolId, areaFractions});
  });
  let modelInputs = 0;
  let evaluationReferences = 0;

  root.datasets.forEach((rawDataset, index) => {
    const label = 'datasets[' + index + ']';
    const dataset = objectValue(rawDataset, label);
    const id = stringValue(dataset.id, label + '.id');
    if (ids.has(id)) {
      throw new Error('Duplicate benchmark dataset id "' + id + '"');
    }
    ids.add(id);

    const role = allowedString(dataset.role, roles, label + '.role');
    const temporalRelation = allowedString(
      dataset.temporalRelation,
      temporalRelations,
      label + '.temporalRelation',
    );
    const status = allowedString(
      dataset.acquisitionStatus,
      acquisitionStatuses,
      label + '.acquisitionStatus',
    );
    const availableAt =
      dataset.availableAt === undefined
        ? undefined
        : isoTime(dataset.availableAt, label + '.availableAt');
    if (dataset.requestId !== undefined) {
      stringValue(dataset.requestId, label + '.requestId');
    }
    if (dataset.acquiredAt !== undefined) {
      isoTime(dataset.acquiredAt, label + '.acquiredAt');
    }
    if ((dataset.retrievalUrl === undefined) !== (dataset.archivedAt === undefined)) {
      throw new Error(label + ' archived retrieval URL and timestamp must be paired');
    }
    if (dataset.retrievalUrl !== undefined) {
      httpsUrl(dataset.retrievalUrl, label + '.retrievalUrl');
      isoTime(dataset.archivedAt, label + '.archivedAt');
    }
    stringValue(dataset.publisher, label + '.publisher');
    stringValue(dataset.dataset, label + '.dataset');
    stringValue(dataset.accessMethod, label + '.accessMethod');
    httpsUrl(dataset.sourceUrl, label + '.sourceUrl');

    const license = objectValue(dataset.license, label + '.license');
    stringValue(license.name, label + '.license.name');
    allowedString(
      license.access,
      new Set(['public', 'auth_required', 'restricted', 'unknown']),
      label + '.license.access',
    );
    allowedString(
      license.redistribution,
      new Set(['allowed', 'restricted', 'unknown']),
      label + '.license.redistribution',
    );

    const uses = objectValue(dataset.allowedUses, label + '.allowedUses');
    const modelInput = booleanValue(
      uses.modelInput,
      label + '.allowedUses.modelInput',
    );
    const calibration = booleanValue(
      uses.calibration,
      label + '.allowedUses.calibration',
    );
    const evaluation = booleanValue(
      uses.evaluation,
      label + '.allowedUses.evaluation',
    );

    if (role === 'model_input') {
      modelInputs += 1;
      if (!modelInput) {
        throw new Error(label + ' is a model_input but modelInput is false');
      }
    }
    if (role === 'evaluation_reference') {
      evaluationReferences += 1;
      if (!evaluation) {
        throw new Error(label + ' evaluation must be true');
      }
    }
    if (
      role === 'evaluation_reference' ||
      role === 'comparison_reference' ||
      temporalRelation === 'post_event'
    ) {
      if (modelInput || calibration) {
        throw new Error(
          label + ' cannot be used for model input or calibration',
        );
      }
    }

    if (modelInput || calibration) {
      if (availableAt === undefined) {
        throw new Error(
          label + '.availableAt is required for model input or calibration',
        );
      }
      if (Date.parse(availableAt) > Date.parse(cutoff)) {
        if (replayMode === 'cutoff_constrained') {
          throw new Error(
            label + ' was not available by benchmark knowledgeCutoff',
          );
        }
        if (dataset.methodologyNote === undefined) {
          throw new Error(
            label + ' retrospective post-cutoff input requires methodologyNote',
          );
        }
        stringValue(
          dataset.methodologyNote,
          label + '.methodologyNote',
        );
      }
    }

    if (dataset.localArtifacts !== undefined) {
      assertLocalArtifacts(
        dataset.localArtifacts,
        label + '.localArtifacts',
        artifactPaths,
      );
    }
    if (status.startsWith('downloaded_') && dataset.localArtifacts === undefined) {
      throw new Error(label + ' is downloaded but has no localArtifacts');
    }
  });

  for (const datasetId of spatialReferences.verifiedDatasetIds) {
    if (!ids.has(datasetId)) {
      throw new Error(
        `benchmark spatial coverage references unknown dataset "${datasetId}"`,
      );
    }
  }
  if (!ids.has(spatialReferences.permanentWaterDatasetId)) {
    throw new Error(
      'benchmark permanent-water mask references an unknown dataset',
    );
  }

  if (modelInputs === 0 || evaluationReferences === 0) {
    throw new Error(
      'benchmark requires at least one model input and one evaluation reference',
    );
  }
  for (const baseline of routingBaselineInputReferences) {
    for (const datasetId of baseline.ids) {
      const dataset = root.datasets.find(
        (candidate) =>
          objectValue(candidate, 'routing baseline dataset').id === datasetId,
      );
      if (dataset === undefined) {
        throw new Error(
          `${baseline.label} references unknown dataset "${datasetId}"`,
        );
      }
      const typedDataset = objectValue(dataset, 'routing baseline dataset');
      const uses = objectValue(
        typedDataset.allowedUses,
        'routing baseline dataset.allowedUses',
      );
      if (
        typedDataset.role !== 'model_input' ||
        uses.modelInput !== true
      ) {
        throw new Error(
          `${baseline.label} dataset "${datasetId}" is not an eligible model input`,
        );
      }
    }
  }
  for (const protocol of observationProtocolReferences) {
    const datasetIds = [
      protocol.observationDatasetId,
      ...protocol.validationDatasetIds,
    ];
    for (const datasetId of datasetIds) {
      const dataset = root.datasets.find(
        (candidate) =>
          objectValue(candidate, 'observation protocol dataset').id === datasetId,
      );
      if (dataset === undefined) {
        throw new Error(
          `${protocol.label} references unknown observation dataset "${datasetId}"`,
        );
      }
      const typedDataset = objectValue(dataset, 'observation protocol dataset');
      const uses = objectValue(
        typedDataset.allowedUses,
        'observation protocol dataset.allowedUses',
      );
      if (
        uses.evaluation !== true ||
        uses.modelInput !== false ||
        uses.calibration !== false
      ) {
        throw new Error(
          `${protocol.label} dataset "${datasetId}" is not an isolated comparison reference`,
        );
      }
    }
    const observationDataset = root.datasets.find(
      (candidate) =>
        objectValue(candidate, 'observation source dataset').id ===
        protocol.observationDatasetId,
    );
    if (
      objectValue(observationDataset, 'observation source dataset').role !==
      'comparison_reference'
    ) {
      throw new Error(`${protocol.label} source must be a comparison_reference`);
    }
  }
  for (const requirement of conditionedReplayDatasetReferences) {
    for (const datasetId of requirement.ids) {
      if (!ids.has(datasetId)) {
        throw new Error(
          `${requirement.label} references unknown candidate dataset "${datasetId}"`,
        );
      }
    }
  }
  for (const audit of conditionedReplayAuditDatasetReferences) {
    for (const datasetId of audit.ids) {
      if (!ids.has(datasetId)) {
        throw new Error(
          `${audit.label} references unknown source dataset "${datasetId}"`,
        );
      }
    }
  }
  for (const audit of conditionedPhysicalAuditDatasetReferences) {
    for (const datasetId of audit.ids) {
      if (!ids.has(datasetId)) {
        throw new Error(
          `${audit.label} references unknown physical source dataset "${datasetId}"`,
        );
      }
    }
  }
  for (const audit of conditionedHydrographAuditArtifactReferences) {
    const dataset = root.datasets.find(
      (candidate) =>
        objectValue(candidate, 'hydrograph audit dataset').id === audit.datasetId,
    );
    if (dataset === undefined) {
      throw new Error(
        `${audit.label} references unknown hydrograph source dataset "${audit.datasetId}"`,
      );
    }
    const artifacts = assertObjectArray(
      objectValue(dataset, 'hydrograph audit dataset').localArtifacts,
      'hydrograph audit dataset.localArtifacts',
    );
    const pinnedPaths = new Set(
      artifacts.map((rawArtifact, artifactIndex) => {
        const artifact = objectValue(
          rawArtifact,
          `hydrograph audit dataset.localArtifacts[${artifactIndex}]`,
        );
        return portablePath(
          stringValue(
            artifact.relativePath,
            `hydrograph audit dataset.localArtifacts[${artifactIndex}].relativePath`,
          ),
          `hydrograph audit dataset.localArtifacts[${artifactIndex}].relativePath`,
        );
      }),
    );
    if (!pinnedPaths.has(audit.path)) {
      throw new Error(
        `${audit.label} source artifact "${audit.path}" is not pinned by its source dataset`,
      );
    }
  }
  for (const audit of conditionedPhysicalAuditArtifactReferences) {
    const dataset = root.datasets.find(
      (candidate) =>
        objectValue(candidate, 'physical audit dataset').id === audit.datasetId,
    );
    if (dataset === undefined) {
      throw new Error(
        `${audit.label} references unknown hydraulic archive dataset "${audit.datasetId}"`,
      );
    }
    const typedDataset = objectValue(dataset, 'physical audit dataset');
    const artifacts = assertObjectArray(
      typedDataset.localArtifacts,
      'physical audit dataset.localArtifacts',
    );
    const pinnedPaths = new Set(
      artifacts.map((rawArtifact, artifactIndex) => {
        const artifact = objectValue(
          rawArtifact,
          `physical audit dataset.localArtifacts[${artifactIndex}]`,
        );
        return portablePath(
          stringValue(
            artifact.relativePath,
            `physical audit dataset.localArtifacts[${artifactIndex}].relativePath`,
          ),
          `physical audit dataset.localArtifacts[${artifactIndex}].relativePath`,
        );
      }),
    );
    for (const artifactPath of audit.paths) {
      if (!pinnedPaths.has(artifactPath)) {
        throw new Error(
          `${audit.label} inspected artifact "${artifactPath}" is not pinned by its source dataset`,
        );
      }
    }
  }
  for (const audit of conditionedTerrainAuditDatasetReferences) {
    if (!ids.has(audit.id)) {
      throw new Error(
        `${audit.label} references unknown terrain dataset "${audit.id}"`,
      );
    }
  }
  for (const protocol of evaluationProtocolReferences) {
    if (!routingBaselineIds.has(protocol.predictionBaselineId)) {
      throw new Error(
        `${protocol.label} references unknown routing baseline "${protocol.predictionBaselineId}"`,
      );
    }
    const baselineArtifacts = routingBaselineArtifactPaths.get(
      protocol.predictionBaselineId,
    );
    for (const artifactPath of protocol.predictionArtifactPaths) {
      if (!baselineArtifacts?.has(artifactPath)) {
        throw new Error(
          `${protocol.label} prediction artifact "${artifactPath}" is not pinned by its routing baseline`,
        );
      }
    }
    const dataset = root.datasets.find(
      (candidate) =>
        objectValue(candidate, 'evaluation protocol dataset').id ===
        protocol.evaluationDatasetId,
    );
    if (dataset === undefined) {
      throw new Error(
        `${protocol.label} references unknown evaluation dataset "${protocol.evaluationDatasetId}"`,
      );
    }
    const typedDataset = objectValue(dataset, 'evaluation protocol dataset');
    const uses = objectValue(
      typedDataset.allowedUses,
      'evaluation protocol dataset.allowedUses',
    );
    if (
      typedDataset.role !== 'evaluation_reference' ||
      uses.evaluation !== true ||
      uses.modelInput !== false ||
      uses.calibration !== false
    ) {
      throw new Error(
        `${protocol.label} dataset "${protocol.evaluationDatasetId}" is not an isolated evaluation reference`,
      );
    }
  }
  for (const run of evaluationRunReferences) {
    const frozenFractions = evaluationProtocolFractions.get(run.protocolId);
    if (frozenFractions === undefined) {
      throw new Error(
        `${run.label} references unknown evaluation protocol "${run.protocolId}"`,
      );
    }
    if (
      run.areaFractions.length !== frozenFractions.length ||
      run.areaFractions.some(
        (fraction, index) => fraction !== frozenFractions[index],
      )
    ) {
      throw new Error(`${run.label} area fractions drifted after protocol freeze`);
    }
  }
}

function assertObservationStations(
  value: unknown,
  label: string,
  minimumCount: number,
): void {
  if (!Array.isArray(value) || value.length < minimumCount) {
    throw new Error(`${label} requires at least ${minimumCount} stations`);
  }
  const stationIds = new Set<string>();
  value.forEach((rawStation, index) => {
    const stationLabel = `${label}[${index}]`;
    const station = objectValue(rawStation, stationLabel);
    const stationId = stringValue(station.stationId, `${stationLabel}.stationId`);
    if (stationIds.has(stationId)) {
      throw new Error(`${label} contains duplicate station "${stationId}"`);
    }
    stationIds.add(stationId);
    stringValue(station.name, `${stationLabel}.name`);
    stringValue(station.selectionRole, `${stationLabel}.selectionRole`);
    const latitude = finiteNumber(station.latitude, `${stationLabel}.latitude`);
    const longitude = finiteNumber(
      station.longitude,
      `${stationLabel}.longitude`,
    );
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error(`${stationLabel} coordinates exceed WGS84 limits`);
    }
  });
}

function assertObservationComparisonRuns(
  value: unknown,
  protocolIds: ReadonlySet<string>,
  protocolStations: ReadonlyMap<
    string,
    { readonly rainfall: readonly string[]; readonly hydrometry: readonly string[] }
  >,
  artifactPaths: Set<string>,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('benchmark.observationComparisonRuns must be a non-empty array');
  }
  const runIds = new Set<string>();
  value.forEach((rawRun, runIndex) => {
    const label = `benchmark.observationComparisonRuns[${runIndex}]`;
    const run = objectValue(rawRun, label);
    const id = stringValue(run.id, `${label}.id`);
    if (runIds.has(id)) {
      throw new Error(`Duplicate observation comparison run id "${id}"`);
    }
    runIds.add(id);
    const protocolId = stringValue(run.protocolId, `${label}.protocolId`);
    if (!protocolIds.has(protocolId)) {
      throw new Error(`${label} references unknown observation protocol "${protocolId}"`);
    }
    if (run.state !== 'materialized') {
      throw new Error(`${label}.state must be materialized`);
    }
    stringValue(run.resultVersion, `${label}.resultVersion`);
    if (run.claimLevel !== 'station_observation_comparison') {
      throw new Error(`${label}.claimLevel is unsupported`);
    }
    if (run.observationAccess !== 'loaded_after_protocol_freeze') {
      throw new Error(`${label} must record post-freeze observation access`);
    }
    if (booleanValue(run.calibration, `${label}.calibration`)) {
      throw new Error(`${label} must not calibrate from observations`);
    }
    if (
      run.quality !== 'available' &&
      run.quality !== 'available_with_incomplete_hydrometry' &&
      run.quality !== 'incomplete_rainfall' &&
      run.quality !== 'incomplete_rainfall_and_hydrometry'
    ) {
      throw new Error(`${label}.quality is unsupported`);
    }
    if (
      run.missingValuePolicy !==
      'blank_source_value_is_missing_numeric_zero_preserved'
    ) {
      throw new Error(`${label} must preserve blank/missing and numeric-zero semantics`);
    }
    const sourceRequest = objectValue(run.sourceRequest, `${label}.sourceRequest`);
    stringValue(sourceRequest.requestId, `${label}.sourceRequest.requestId`);
    isoTime(sourceRequest.acquiredAt, `${label}.sourceRequest.acquiredAt`);
    const expected = protocolStations.get(protocolId);
    if (expected === undefined) {
      throw new Error(`${label} has no frozen station set`);
    }

    const rainfall = assertObjectArray(run.rainfall, `${label}.rainfall`);
    const rainfallIds = new Set<string>();
    let incompleteRainfall = false;
    rainfall.forEach((rawResult, resultIndex) => {
      const resultLabel = `${label}.rainfall[${resultIndex}]`;
      const result = objectValue(rawResult, resultLabel);
      const stationId = stringValue(result.stationId, `${resultLabel}.stationId`);
      if (rainfallIds.has(stationId)) {
        throw new Error(`${label}.rainfall repeats station "${stationId}"`);
      }
      rainfallIds.add(stationId);
      stringValue(result.name, `${resultLabel}.name`);
      const quality = allowedString(
        result.quality,
        new Set(['available', 'incomplete_window']),
        `${resultLabel}.quality`,
      );
      const rawRecordCount = positiveInteger(
        result.rawRecordCount,
        `${resultLabel}.rawRecordCount`,
      );
      const recordCount = nonNegativeInteger(
        result.recordCount,
        `${resultLabel}.recordCount`,
      );
      const missingRecordCount = nonNegativeInteger(
        result.missingRecordCount,
        `${resultLabel}.missingRecordCount`,
      );
      if (rawRecordCount !== recordCount + missingRecordCount) {
        throw new Error(`${resultLabel} record counts are inconsistent`);
      }
      const coveredHours = finiteNumber(
        result.coveredHours,
        `${resultLabel}.coveredHours`,
      );
      if (coveredHours < 0 || coveredHours > 48) {
        throw new Error(`${resultLabel}.coveredHours exceeds the frozen window`);
      }
      const imergTotalMm = finiteNumber(
        result.imergTotalMm,
        `${resultLabel}.imergTotalMm`,
      );
      if (imergTotalMm < 0) {
        throw new Error(`${resultLabel}.imergTotalMm must be non-negative`);
      }
      if (quality === 'available') {
        if (recordCount !== 48 || missingRecordCount !== 0 || coveredHours !== 48) {
          throw new Error(`${resultLabel} available rainfall must cover all 48 hours`);
        }
        const gaugeTotalMm = finiteNumber(
          result.gaugeTotalMm,
          `${resultLabel}.gaugeTotalMm`,
        );
        const difference = finiteNumber(
          result.imergMinusGaugeMm,
          `${resultLabel}.imergMinusGaugeMm`,
        );
        if (!approximatelyEqual(difference, imergTotalMm - gaugeTotalMm)) {
          throw new Error(`${resultLabel} IMERG minus gauge is inconsistent`);
        }
      } else if (
        result.gaugeTotalMm !== null ||
        result.imergMinusGaugeMm !== null
      ) {
        throw new Error(`${resultLabel} incomplete rainfall cannot expose a partial total`);
      } else {
        incompleteRainfall = true;
      }
      const sampled = objectValue(
        result.sampledImergCell,
        `${resultLabel}.sampledImergCell`,
      );
      finiteNumber(sampled.longitude, `${resultLabel}.sampledImergCell.longitude`);
      finiteNumber(sampled.latitude, `${resultLabel}.sampledImergCell.latitude`);
      if (
        sampled.sourceResolution !== '0.1 degree' ||
        sampled.samplingMethod !== 'nearest_imerg_native_grid_cell'
      ) {
        throw new Error(`${resultLabel} must retain native IMERG sampling provenance`);
      }
    });
    assertExactStationSet(rainfallIds, expected.rainfall, `${label}.rainfall`);

    const hydrometry = assertObjectArray(run.hydrometry, `${label}.hydrometry`);
    const hydrometryIds = new Set<string>();
    let incompleteHydrometry = false;
    hydrometry.forEach((rawResult, resultIndex) => {
      const resultLabel = `${label}.hydrometry[${resultIndex}]`;
      const result = objectValue(rawResult, resultLabel);
      const stationId = stringValue(result.stationId, `${resultLabel}.stationId`);
      if (hydrometryIds.has(stationId)) {
        throw new Error(`${label}.hydrometry repeats station "${stationId}"`);
      }
      hydrometryIds.add(stationId);
      stringValue(result.name, `${resultLabel}.name`);
      const quality = allowedString(
        result.quality,
        new Set(['available', 'incomplete_window']),
        `${resultLabel}.quality`,
      );
      const rawRecordCount = positiveInteger(
        result.rawRecordCount,
        `${resultLabel}.rawRecordCount`,
      );
      const recordCount = nonNegativeInteger(
        result.recordCount,
        `${resultLabel}.recordCount`,
      );
      const missingRecordCount = nonNegativeInteger(
        result.missingRecordCount,
        `${resultLabel}.missingRecordCount`,
      );
      if (
        rawRecordCount !== recordCount + missingRecordCount ||
        rawRecordCount !== 192
      ) {
        throw new Error(`${resultLabel} record counts are inconsistent`);
      }
      if (quality === 'available' && missingRecordCount !== 0) {
        throw new Error(`${resultLabel} available stage cannot contain missing values`);
      }
      if (quality === 'incomplete_window') {
        incompleteHydrometry = true;
        if (missingRecordCount === 0) {
          throw new Error(`${resultLabel} incomplete stage must report missing values`);
        }
      }
      if (recordCount > 0) {
        const coverageStart = isoTime(
          result.coverageStart,
          `${resultLabel}.coverageStart`,
        );
        const coverageEnd = isoTime(
          result.coverageEnd,
          `${resultLabel}.coverageEnd`,
        );
        if (Date.parse(coverageStart) > Date.parse(coverageEnd)) {
          throw new Error(`${resultLabel} coverage is reversed`);
        }
        finiteNumber(result.maximumStageM, `${resultLabel}.maximumStageM`);
        isoTime(result.maximumStageAt, `${resultLabel}.maximumStageAt`);
        finiteNumber(
          result.maximumOneHourRiseM,
          `${resultLabel}.maximumOneHourRiseM`,
        );
      } else if (
        result.coverageStart !== null ||
        result.coverageEnd !== null ||
        result.maximumStageM !== null ||
        result.maximumStageAt !== null ||
        result.maximumOneHourRiseM !== null
      ) {
        throw new Error(`${resultLabel} empty stage must retain null summaries`);
      }
    });
    assertExactStationSet(hydrometryIds, expected.hydrometry, `${label}.hydrometry`);
    const expectedQuality = incompleteRainfall
      ? incompleteHydrometry
        ? 'incomplete_rainfall_and_hydrometry'
        : 'incomplete_rainfall'
      : incompleteHydrometry
        ? 'available_with_incomplete_hydrometry'
        : 'available';
    if (run.quality !== expectedQuality) {
      throw new Error(`${label}.quality disagrees with hydrometric completeness`);
    }
    stringValue(run.methodologyNote, `${label}.methodologyNote`);
    assertLocalArtifacts(run.localArtifacts, `${label}.localArtifacts`, artifactPaths);
  });
}

function assertObjectArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function assertExactStationSet(
  actual: ReadonlySet<string>,
  expected: readonly string[],
  label: string,
): void {
  if (
    actual.size !== expected.length ||
    expected.some((stationId) => !actual.has(stationId))
  ) {
    throw new Error(`${label} station set drifted from the frozen protocol`);
  }
}

function assertLocalArtifacts(
  value: unknown,
  label: string,
  artifactPaths: Set<string>,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(label + ' must be a non-empty array');
  }
  value.forEach((rawArtifact, artifactIndex) => {
    const artifactLabel = label + '[' + artifactIndex + ']';
    const artifact = objectValue(rawArtifact, artifactLabel);
    const artifactPath = stringValue(
      artifact.relativePath,
      artifactLabel + '.relativePath',
    );
    const canonicalPath = portablePath(
      artifactPath,
      artifactLabel + '.relativePath',
    );
    if (artifactPaths.has(canonicalPath)) {
      throw new Error(
        'Duplicate local artifact path "' + artifactPath + '"',
      );
    }
    artifactPaths.add(canonicalPath);
    positiveInteger(
      artifact.bytes,
      artifactLabel + '.bytes',
    );
    const sha256 = stringValue(
      artifact.sha256,
      artifactLabel + '.sha256',
    );
    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      throw new Error(
        artifactLabel + '.sha256 must be a SHA-256 digest',
      );
    }
  });
}

/** Validates benchmark-wide coverage, grid, mask and tolerance semantics. */
function assertBenchmarkSpatialProtocol(
  raw: Record<string, unknown>,
  aoiBounds: readonly number[],
): {
  readonly verifiedDatasetIds: readonly string[];
  readonly permanentWaterDatasetId: string;
  readonly cellAreaM2: number;
  readonly gridCrs: string;
  readonly gridBounds: readonly number[];
} {
  const coverage = objectValue(
    raw.coverage,
    'benchmark.spatialProtocol.coverage',
  );
  if (
    stringValue(
      coverage.crs,
      'benchmark.spatialProtocol.coverage.crs',
    ) !== 'EPSG:4326'
  ) {
    throw new Error(
      'benchmark.spatialProtocol.coverage.crs must be EPSG:4326',
    );
  }
  const commonBounds = numberArray(
    coverage.commonBounds,
    'benchmark.spatialProtocol.coverage.commonBounds',
    4,
  );
  assertOrderedBounds(
    commonBounds,
    'benchmark.spatialProtocol.coverage.commonBounds',
  );
  if (
    commonBounds.some(
      (value, index) => value !== aoiBounds[index],
    )
  ) {
    throw new Error(
      'benchmark common coverage must equal the verified bounded AOI',
    );
  }
  if (coverage.rule !== 'intersection_of_declared_coverage') {
    throw new Error(
      'benchmark spatial coverage requires declared-coverage intersection',
    );
  }
  const verifiedDatasetIds = uniqueStringArray(
    coverage.verifiedDatasetIds,
    'benchmark.spatialProtocol.coverage.verifiedDatasetIds',
  );
  if (verifiedDatasetIds.length < 3) {
    throw new Error(
      'benchmark common coverage requires at least three verified datasets',
    );
  }

  const grid = objectValue(
    raw.grid,
    'benchmark.spatialProtocol.grid',
  );
  if (
    stringValue(grid.crs, 'benchmark.spatialProtocol.grid.crs') !==
    'EPSG:32632'
  ) {
    throw new Error(
      'benchmark evaluation grid must use EPSG:32632',
    );
  }
  const cellSizeM = positiveInteger(
    grid.cellSizeM,
    'benchmark.spatialProtocol.grid.cellSizeM',
  );
  const gridBounds = numberArray(
    grid.bounds,
    'benchmark.spatialProtocol.grid.bounds',
    4,
  );
  assertOrderedBounds(
    gridBounds,
    'benchmark.spatialProtocol.grid.bounds',
  );
  const width = positiveInteger(
    grid.width,
    'benchmark.spatialProtocol.grid.width',
  );
  const height = positiveInteger(
    grid.height,
    'benchmark.spatialProtocol.grid.height',
  );
  if (
    gridBounds[2] - gridBounds[0] !== width * cellSizeM ||
    gridBounds[3] - gridBounds[1] !== height * cellSizeM
  ) {
    throw new Error(
      'benchmark grid dimensions do not match bounds and cell size',
    );
  }
  if (grid.rowOrder !== 'north_to_south') {
    throw new Error(
      'benchmark grid rowOrder must be north_to_south',
    );
  }
  if (grid.inclusion !== 'cell_center_inside_common_bounds') {
    throw new Error(
      'benchmark grid requires cell-centre AOI inclusion',
    );
  }
  const h3Resolution = positiveInteger(
    grid.h3RepresentationResolution,
    'benchmark.spatialProtocol.grid.h3RepresentationResolution',
  );
  if (h3Resolution > 15) {
    throw new Error(
      'benchmark H3 representation resolution must be between 1 and 15',
    );
  }

  const masks = objectValue(
    raw.masks,
    'benchmark.spatialProtocol.masks',
  );
  if (masks.outsideAoi !== 'exclude') {
    throw new Error(
      'benchmark cells outside the AOI must be excluded',
    );
  }
  if (
    masks.requiredInputNoData !==
    'exclude_and_report_by_dataset'
  ) {
    throw new Error(
      'benchmark input no-data must be excluded and reported by dataset',
    );
  }
  if (
    masks.evaluationReference !==
    'withheld_until_prediction_is_frozen'
  ) {
    throw new Error(
      'benchmark evaluation reference must remain withheld',
    );
  }
  const permanentWater = objectValue(
    masks.permanentWater,
    'benchmark.spatialProtocol.masks.permanentWater',
  );
  const permanentWaterDatasetId = stringValue(
    permanentWater.datasetId,
    'benchmark.spatialProtocol.masks.permanentWater.datasetId',
  );
  stringValue(
    permanentWater.layer,
    'benchmark.spatialProtocol.masks.permanentWater.layer',
  );
  if (
    permanentWater.treatment !==
    'exclude_from_land_routing_metrics_and_report'
  ) {
    throw new Error(
      'benchmark permanent-water treatment is unsupported',
    );
  }

  const tolerance = objectValue(
    raw.boundaryTolerance,
    'benchmark.spatialProtocol.boundaryTolerance',
  );
  if (tolerance.primaryOverlapBufferM !== 0) {
    throw new Error(
      'benchmark primary overlap metrics must remain unbuffered',
    );
  }
  const secondaryToleranceM = finiteNumber(
    tolerance.secondaryToleranceM,
    'benchmark.spatialProtocol.boundaryTolerance.secondaryToleranceM',
  );
  if (secondaryToleranceM !== cellSizeM) {
    throw new Error(
      'benchmark secondary boundary tolerance must equal one grid cell',
    );
  }
  if (tolerance.distanceMetrics !== 'cell_edges_in_grid_crs') {
    throw new Error(
      'benchmark distance metrics must use grid cell edges',
    );
  }

  return {
    verifiedDatasetIds,
    permanentWaterDatasetId,
    cellAreaM2: cellSizeM * cellSizeM,
    gridCrs: 'EPSG:32632',
    gridBounds,
  };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(label + ' must be a non-empty string');
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(label + ' must be boolean');
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(label + ' must be a finite number');
  }
  return value;
}

function allowedString(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): string {
  const result = stringValue(value, label);
  if (!allowed.has(result)) {
    throw new Error(label + ' has unsupported value "' + result + '"');
  }
  return result;
}

function isoTime(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (Number.isNaN(Date.parse(result))) {
    throw new Error(label + ' must be an ISO timestamp');
  }
  return result;
}

function httpsUrl(value: unknown, label: string): void {
  const result = stringValue(value, label);
  try {
    if (new URL(result).protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new Error(label + ' must be a valid HTTPS URL');
  }
}

function numberArray(
  value: unknown,
  label: string,
  length: number,
): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(label + ' must contain exactly ' + length + ' numbers');
  }
  return value.map((entry, index) =>
    finiteNumber(entry, label + '[' + index + ']'),
  );
}

function stringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(label + ' must be a non-empty array');
  }
  value.forEach((entry, index) =>
    stringValue(entry, label + '[' + index + ']'),
  );
}

function positiveInteger(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (!Number.isInteger(result) || result <= 0) {
    throw new Error(label + ' must be a positive integer');
  }
  return result;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (!Number.isInteger(result) || result < 0) {
    throw new Error(label + ' must be a non-negative integer');
  }
  return result;
}

function probability(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (result < 0 || result > 1) {
    throw new Error(label + ' must be between 0 and 1');
  }
  return result;
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-12 * Math.max(1, Math.abs(right));
}

function uniqueStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(label + ' must be a non-empty array');
  }
  const result = value.map((entry, index) =>
    stringValue(entry, label + '[' + index + ']'),
  );
  if (new Set(result).size !== result.length) {
    throw new Error(label + ' must not contain duplicates');
  }
  return result;
}

function assertAscendingPositiveIntegers(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(label + ' must be a non-empty array');
  }
  const result = value.map((entry, index) =>
    positiveInteger(entry, label + '[' + index + ']'),
  );
  if (
    new Set(result).size !== result.length ||
    result.some((entry, index) => index > 0 && entry <= result[index - 1])
  ) {
    throw new Error(label + ' must be unique and ascending');
  }
  return result;
}

function assertOrderedBounds(
  bounds: readonly number[],
  label: string,
): void {
  if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
    throw new Error(label + ' must be [minX, minY, maxX, maxY]');
  }
}

function portablePath(value: string, label: string): string {
  const normalized = value.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (
    value !== normalized ||
    normalized.startsWith('/') ||
    /^[a-z]:/i.test(normalized) ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error(label + ' must be a canonical portable relative path');
  }
  return normalized;
}
