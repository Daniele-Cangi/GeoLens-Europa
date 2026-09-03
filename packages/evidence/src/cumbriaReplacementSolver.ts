import { createHash } from 'node:crypto';

export const CUMBRIA_REPLACEMENT_SOLVER_ID =
  'cumbria-public-surface-flow-replacement-v0' as const;

export interface CumbriaReplacementSolverProtocol {
  readonly id: typeof CUMBRIA_REPLACEMENT_SOLVER_ID;
  readonly version: '0.1.0';
  readonly frozenOn: '2026-09-04';
  readonly state: 'contract_frozen_preprocessing_and_kernel_blocked';
  readonly claimBoundary: string;
  readonly eventWindow: {
    readonly start: '2015-12-04T00:00:00Z';
    readonly endExclusive: '2015-12-07T00:00:00Z';
  };
  readonly domain: {
    readonly sourceProtocolId: 'cumbria-sheepmount-old-sandsfield-public-baseline-v0';
    readonly horizontalCrs: 'EPSG:27700';
    readonly verticalDatum: 'Ordnance Datum Newlyn';
    readonly bounds: readonly [332000, 556000, 340000, 563000];
    readonly originUpperLeft: readonly [332000, 563000];
    readonly rowOrder: 'north_to_south';
    readonly observedFloodGeometryUsed: false;
    readonly h3Role: 'inspection_and_evidence_join_only';
  };
  readonly formulation: {
    readonly family: 'two_dimensional_local_inertial_shallow_water';
    readonly implementationVersion: 'cumbria-local-inertial-surface-flow-v0.1.0';
    readonly implementationState: 'not_implemented';
    readonly conservedState: readonly [
      'water_depth_m',
      'unit_discharge_x_m2_s',
      'unit_discharge_y_m2_s',
    ];
    readonly gravityMps2: 9.80665;
    readonly minimumWetDepthM: 0.001;
    readonly negativeDepthPolicy: 'reject_beyond_numeric_tolerance';
    readonly massBalanceRequired: true;
    readonly calibrationAllowed: false;
  };
  readonly meshes: {
    readonly primary: CumbriaReplacementMesh;
    readonly sensitivities: readonly CumbriaReplacementMesh[];
    readonly terrainAggregation: 'area_weighted_mean_of_complete_native_dtm_coverage';
    readonly completeNativeCoverageRequiredPerCell: true;
    readonly missingTerrainPolicy: 'cell_missing_not_zero_no_flux_faces_and_prediction_excluded';
    readonly missingBoundaryExclusionCells: 1;
  };
  readonly forcing: {
    readonly rainfall: {
      readonly datasetId: 'nasa-imerg-v07-final';
      readonly sourceIntervalSeconds: 1800;
      readonly transformation: 'native_footprint_overlap_then_piecewise_constant_intensity';
      readonly sourceResolutionRetained: true;
      readonly observedZeroPreserved: true;
      readonly missingPolicy: 'cell_interval_missing_and_solver_execution_blocked';
    };
    readonly landCoverParameters: {
      readonly datasetId: 'copernicus-clc2012';
      readonly parameterStatus: 'explicit_experimental_assumption_not_calibrated';
      readonly transformation: 'native_class_footprint_area_weighted_parameter';
      readonly unknownClassPolicy: 'missing_and_solver_execution_blocked';
      readonly classes: readonly CumbriaLandCoverParameter[];
    };
    readonly riverInflow: {
      readonly datasetId: 'ea-hydrology-sheepmount-flow';
      readonly stationReference: '765512';
      readonly sourceIntervalSeconds: 900;
      readonly expectedSamples: 288;
      readonly temporalTransformation: 'left_constant_over_native_900_second_interval';
      readonly dischargeTransformation: 'positive_excess_above_first_window_sample';
      readonly transformationVersion: 'sheepmount-incremental-discharge-v0.1.0';
      readonly sourceMeaning: 'incremental_event_discharge_proxy_not_total_channel_flow';
      readonly footprintCentreBng: readonly [339063, 557118];
      readonly primaryFootprintSideMetres: 100;
      readonly sensitivityFootprintSideMetres: readonly [60, 140];
      readonly distribution: 'uniform_by_intersected_valid_cell_area';
      readonly historicalCrossSectionClaim: false;
      readonly missingSamplePolicy: 'execution_blocked_no_gap_fill';
    };
  };
  readonly initialState: {
    readonly surfaceWaterDepthM: 0;
    readonly unitDischargeXM2S: 0;
    readonly unitDischargeYM2S: 0;
    readonly semantic: 'explicit_dry_surface_assumption_not_observation';
    readonly warmup: 'none_available';
  };
  readonly boundaries: {
    readonly outerDomain: 'zero_gradient_free_outflow_no_external_inflow';
    readonly imposedDownstreamStage: false;
    readonly oldSandsfieldUse: 'historical_extent_anchor_not_boundary_value';
    readonly missingTerrainFaces: 'no_flux_with_adjacent_prediction_exclusion';
    readonly defenceAndFloodgateGeometry: 'omitted_missing_event_valid_state';
    readonly channelGeometry: 'omitted_missing_event_valid_cross_sections';
  };
  readonly numerics: {
    readonly integration: 'adaptive_cfl';
    readonly cfl: 0.7;
    readonly minimumTimeStepSeconds: 0.05;
    readonly maximumTimeStepSeconds: 5;
    readonly belowMinimumTimeStepPolicy: 'fail_scenario';
    readonly sourceChangeAlignment: true;
    readonly outputIntervalSeconds: 900;
    readonly frictionUpdate: 'semi_implicit_manning';
  };
  readonly scenarios: readonly CumbriaReplacementScenario[];
  readonly outputs: {
    readonly requiredState: readonly [
      'maximum_surface_water_depth_m',
      'time_of_maximum_depth',
      'final_surface_water_depth_m',
      'valid_prediction_mask',
      'mass_balance',
    ];
    readonly wetness: {
      readonly statistic: 'maximum_surface_water_depth_over_event';
      readonly primaryThresholdM: 0.05;
      readonly sensitivityThresholdsM: readonly [0.01, 0.1, 0.3];
      readonly missingPredictionTreatedAsDry: false;
      readonly thresholdSelectionMayUseEvaluation: false;
    };
    readonly massBalance: {
      readonly absoluteToleranceM3: 0.001;
      readonly relativeTolerance: 0.000001;
      readonly termsRequired: readonly [
        'initial_volume_m3',
        'rainfall_excess_input_m3',
        'river_excess_input_m3',
        'boundary_outflow_m3',
        'final_storage_m3',
        'residual_m3',
      ];
    };
  };
  readonly scenarioPolicy: {
    readonly primaryScenarioId: 'primary-20m';
    readonly everyScenarioMustRun: true;
    readonly bestScenarioSelectionForbidden: true;
    readonly evaluationDrivenRetuningForbidden: true;
    readonly failuresRemainReported: true;
  };
  readonly isolation: {
    readonly observedFloodGeometryLoaded: false;
    readonly observedFloodGeometryUsed: false;
    readonly postEventModelUsed: false;
    readonly currentAssetGeometryUsed: false;
    readonly h3UsedAsSolverGrid: false;
    readonly missingValuesSubstitutedWithZero: false;
  };
  readonly execution: {
    readonly state: 'blocked';
    readonly solverExecutionAllowed: false;
    readonly evaluationReferenceAccessAllowed: false;
    readonly networkRequests: 0;
    readonly filesWritten: 0;
    readonly blockers: readonly [
      'domain_solver_grids_not_materialized',
      'sheepmount_series_not_content_addressed',
      'half_hourly_imerg_forcing_not_materialized',
      'numerical_kernel_not_fixture_verified',
      'mass_balance_and_stability_not_verified',
      'prediction_identity_not_frozen',
    ];
  };
  readonly protocolSha256: string;
}

export interface CumbriaReplacementMesh {
  readonly id: 'mesh-10m' | 'mesh-20m' | 'mesh-40m';
  readonly role: 'primary' | 'predeclared_sensitivity';
  readonly cellSizeMetres: 10 | 20 | 40;
  readonly width: 800 | 400 | 200;
  readonly height: 700 | 350 | 175;
  readonly cellCount: 560000 | 140000 | 35000;
}

export interface CumbriaLandCoverParameter {
  readonly classCode: 111 | 112 | 121 | 122 | 131 | 142 | 211 | 231 | 311 | 313 | 421 | 522;
  readonly runoffCoefficient: CumbriaParameterRange;
  readonly manningN: CumbriaParameterRange;
}

export interface CumbriaParameterRange {
  readonly low: number;
  readonly primary: number;
  readonly high: number;
}

export interface CumbriaReplacementScenario {
  readonly id:
    | 'primary-20m'
    | 'mesh-10m'
    | 'mesh-40m'
    | 'runoff-low'
    | 'runoff-high'
    | 'roughness-low'
    | 'roughness-high'
    | 'inflow-60m'
    | 'inflow-140m';
  readonly meshId: 'mesh-10m' | 'mesh-20m' | 'mesh-40m';
  readonly runoffParameterSet: 'low' | 'primary' | 'high';
  readonly roughnessParameterSet: 'low' | 'primary' | 'high';
  readonly inflowFootprintSideMetres: 60 | 100 | 140;
}

export interface CumbriaReplacementSolverContext {
  readonly event: unknown;
  readonly publicBaselineProtocol: unknown;
  readonly datasets: readonly unknown[];
}

const expectedMeshes = [
  {
    id: 'mesh-20m',
    role: 'primary',
    cellSizeMetres: 20,
    width: 400,
    height: 350,
    cellCount: 140000,
  },
  {
    id: 'mesh-10m',
    role: 'predeclared_sensitivity',
    cellSizeMetres: 10,
    width: 800,
    height: 700,
    cellCount: 560000,
  },
  {
    id: 'mesh-40m',
    role: 'predeclared_sensitivity',
    cellSizeMetres: 40,
    width: 200,
    height: 175,
    cellCount: 35000,
  },
] as const;

const expectedClassCodes = [111, 112, 121, 122, 131, 142, 211, 231, 311, 313, 421, 522];

const expectedScenarios = [
  ['primary-20m', 'mesh-20m', 'primary', 'primary', 100],
  ['mesh-10m', 'mesh-10m', 'primary', 'primary', 100],
  ['mesh-40m', 'mesh-40m', 'primary', 'primary', 100],
  ['runoff-low', 'mesh-20m', 'low', 'primary', 100],
  ['runoff-high', 'mesh-20m', 'high', 'primary', 100],
  ['roughness-low', 'mesh-20m', 'primary', 'low', 100],
  ['roughness-high', 'mesh-20m', 'primary', 'high', 100],
  ['inflow-60m', 'mesh-20m', 'primary', 'primary', 60],
  ['inflow-140m', 'mesh-20m', 'primary', 'primary', 140],
] as const;

export function assertCumbriaReplacementSolverProtocol(
  candidate: unknown,
  context: CumbriaReplacementSolverContext,
): asserts candidate is CumbriaReplacementSolverProtocol {
  const protocol = record(candidate, 'replacementSolverProtocol');
  equal(protocol.id, CUMBRIA_REPLACEMENT_SOLVER_ID, 'replacement solver id');
  equal(protocol.version, '0.1.0', 'replacement solver version');
  equal(protocol.frozenOn, '2026-09-04', 'replacement solver frozen date');
  equal(
    protocol.state,
    'contract_frozen_preprocessing_and_kernel_blocked',
    'replacement solver state',
  );
  nonEmpty(protocol.claimBoundary, 'replacement solver claim boundary');

  const event = record(context.event, 'event context');
  const window = record(protocol.eventWindow, 'replacement solver event window');
  equal(window.start, event.windowStart, 'replacement solver window start');
  equal(window.endExclusive, event.windowEndExclusive, 'replacement solver window end');

  const baseline = record(context.publicBaselineProtocol, 'public baseline context');
  const baselineDomain = record(baseline.domain, 'public baseline domain context');
  const domain = record(protocol.domain, 'replacement solver domain');
  equal(domain.sourceProtocolId, baseline.id, 'replacement solver source protocol');
  equal(domain.horizontalCrs, baselineDomain.horizontalCrs, 'replacement solver CRS');
  equal(domain.verticalDatum, baselineDomain.verticalDatum, 'replacement solver datum');
  deepEqual(domain.bounds, baselineDomain.bounds, 'replacement solver bounds');
  deepEqual(domain.originUpperLeft, [332000, 563000], 'replacement solver origin');
  equal(domain.rowOrder, 'north_to_south', 'replacement solver row order');
  equal(domain.observedFloodGeometryUsed, false, 'replacement solver observed geometry');
  equal(domain.h3Role, 'inspection_and_evidence_join_only', 'replacement solver H3 role');

  const formulation = record(protocol.formulation, 'replacement solver formulation');
  equal(formulation.family, 'two_dimensional_local_inertial_shallow_water', 'solver family');
  equal(
    formulation.implementationVersion,
    'cumbria-local-inertial-surface-flow-v0.1.0',
    'solver implementation version',
  );
  equal(formulation.implementationState, 'not_implemented', 'solver implementation state');
  deepEqual(
    formulation.conservedState,
    ['water_depth_m', 'unit_discharge_x_m2_s', 'unit_discharge_y_m2_s'],
    'solver conserved state',
  );
  equal(formulation.gravityMps2, 9.80665, 'solver gravity');
  equal(formulation.minimumWetDepthM, 0.001, 'solver wet depth');
  equal(formulation.negativeDepthPolicy, 'reject_beyond_numeric_tolerance', 'negative depth policy');
  equal(formulation.massBalanceRequired, true, 'solver mass balance gate');
  equal(formulation.calibrationAllowed, false, 'solver calibration gate');

  const meshes = record(protocol.meshes, 'replacement solver meshes');
  deepEqual(meshes.primary, expectedMeshes[0], 'primary solver mesh');
  deepEqual(meshes.sensitivities, expectedMeshes.slice(1), 'sensitivity solver meshes');
  equal(
    meshes.terrainAggregation,
    'area_weighted_mean_of_complete_native_dtm_coverage',
    'terrain aggregation',
  );
  equal(meshes.completeNativeCoverageRequiredPerCell, true, 'terrain coverage policy');
  equal(
    meshes.missingTerrainPolicy,
    'cell_missing_not_zero_no_flux_faces_and_prediction_excluded',
    'missing terrain policy',
  );
  equal(meshes.missingBoundaryExclusionCells, 1, 'missing terrain exclusion halo');

  const forcing = record(protocol.forcing, 'replacement solver forcing');
  const rainfall = record(forcing.rainfall, 'replacement solver rainfall');
  equal(rainfall.datasetId, 'nasa-imerg-v07-final', 'rainfall dataset');
  equal(rainfall.sourceIntervalSeconds, 1800, 'rainfall source interval');
  equal(
    rainfall.transformation,
    'native_footprint_overlap_then_piecewise_constant_intensity',
    'rainfall transformation',
  );
  equal(rainfall.sourceResolutionRetained, true, 'rainfall source resolution');
  equal(rainfall.observedZeroPreserved, true, 'rainfall observed zero');
  equal(
    rainfall.missingPolicy,
    'cell_interval_missing_and_solver_execution_blocked',
    'rainfall missing policy',
  );

  const landCover = record(
    forcing.landCoverParameters,
    'replacement solver land-cover parameters',
  );
  equal(landCover.datasetId, 'copernicus-clc2012', 'land-cover parameter dataset');
  equal(
    landCover.parameterStatus,
    'explicit_experimental_assumption_not_calibrated',
    'land-cover parameter status',
  );
  equal(
    landCover.transformation,
    'native_class_footprint_area_weighted_parameter',
    'land-cover parameter transformation',
  );
  equal(landCover.unknownClassPolicy, 'missing_and_solver_execution_blocked', 'unknown CLC policy');
  const classes = array(landCover.classes, 'land-cover parameter classes');
  deepEqual(
    classes.map((value, index) => integer(record(value, `CLC parameter ${index}`).classCode, `CLC parameter ${index} class`)),
    expectedClassCodes,
    'land-cover class identities',
  );
  for (const [index, value] of classes.entries()) {
    const entry = record(value, `CLC parameter ${index}`);
    parameterRange(entry.runoffCoefficient, `CLC ${entry.classCode} runoff coefficient`, true);
    parameterRange(entry.manningN, `CLC ${entry.classCode} Manning n`, false);
  }

  const inflow = record(forcing.riverInflow, 'replacement solver river inflow');
  equal(inflow.datasetId, 'ea-hydrology-sheepmount-flow', 'river inflow dataset');
  equal(inflow.stationReference, '765512', 'river inflow station');
  equal(inflow.sourceIntervalSeconds, 900, 'river inflow interval');
  equal(inflow.expectedSamples, 288, 'river inflow sample count');
  equal(
    inflow.temporalTransformation,
    'left_constant_over_native_900_second_interval',
    'river inflow temporal transformation',
  );
  equal(
    inflow.dischargeTransformation,
    'positive_excess_above_first_window_sample',
    'river inflow discharge transformation',
  );
  equal(
    inflow.transformationVersion,
    'sheepmount-incremental-discharge-v0.1.0',
    'river inflow transformation version',
  );
  equal(
    inflow.sourceMeaning,
    'incremental_event_discharge_proxy_not_total_channel_flow',
    'river inflow source meaning',
  );
  deepEqual(inflow.footprintCentreBng, [339063, 557118], 'river inflow footprint centre');
  equal(inflow.primaryFootprintSideMetres, 100, 'river inflow footprint');
  deepEqual(inflow.sensitivityFootprintSideMetres, [60, 140], 'river inflow sensitivities');
  equal(inflow.distribution, 'uniform_by_intersected_valid_cell_area', 'river inflow distribution');
  equal(inflow.historicalCrossSectionClaim, false, 'historical cross-section claim');
  equal(inflow.missingSamplePolicy, 'execution_blocked_no_gap_fill', 'river inflow missing policy');
  assertSheepmountContext(context.datasets, inflow);

  const initial = record(protocol.initialState, 'replacement solver initial state');
  equal(initial.surfaceWaterDepthM, 0, 'initial depth assumption');
  equal(initial.unitDischargeXM2S, 0, 'initial x discharge assumption');
  equal(initial.unitDischargeYM2S, 0, 'initial y discharge assumption');
  equal(initial.semantic, 'explicit_dry_surface_assumption_not_observation', 'initial-state semantic');
  equal(initial.warmup, 'none_available', 'initial-state warmup');

  const boundaries = record(protocol.boundaries, 'replacement solver boundaries');
  equal(boundaries.outerDomain, 'zero_gradient_free_outflow_no_external_inflow', 'outer boundary');
  equal(boundaries.imposedDownstreamStage, false, 'downstream stage gate');
  equal(boundaries.oldSandsfieldUse, 'historical_extent_anchor_not_boundary_value', 'Old Sandsfield use');
  equal(boundaries.missingTerrainFaces, 'no_flux_with_adjacent_prediction_exclusion', 'missing terrain boundary');
  equal(boundaries.defenceAndFloodgateGeometry, 'omitted_missing_event_valid_state', 'defence state');
  equal(boundaries.channelGeometry, 'omitted_missing_event_valid_cross_sections', 'channel geometry');

  const numerics = record(protocol.numerics, 'replacement solver numerics');
  equal(numerics.integration, 'adaptive_cfl', 'time integration');
  equal(numerics.cfl, 0.7, 'CFL value');
  equal(numerics.minimumTimeStepSeconds, 0.05, 'minimum time step');
  equal(numerics.maximumTimeStepSeconds, 5, 'maximum time step');
  equal(numerics.belowMinimumTimeStepPolicy, 'fail_scenario', 'minimum time-step policy');
  equal(numerics.sourceChangeAlignment, true, 'source time alignment');
  equal(numerics.outputIntervalSeconds, 900, 'output interval');
  equal(numerics.frictionUpdate, 'semi_implicit_manning', 'friction update');

  const scenarios = array(protocol.scenarios, 'replacement solver scenarios');
  deepEqual(
    scenarios.map((value, index) => {
      const scenario = record(value, `replacement solver scenario ${index}`);
      return [
        scenario.id,
        scenario.meshId,
        scenario.runoffParameterSet,
        scenario.roughnessParameterSet,
        scenario.inflowFootprintSideMetres,
      ];
    }),
    expectedScenarios,
    'replacement solver scenario matrix',
  );

  const outputs = record(protocol.outputs, 'replacement solver outputs');
  deepEqual(
    outputs.requiredState,
    [
      'maximum_surface_water_depth_m',
      'time_of_maximum_depth',
      'final_surface_water_depth_m',
      'valid_prediction_mask',
      'mass_balance',
    ],
    'replacement solver output state',
  );
  const wetness = record(outputs.wetness, 'replacement solver wetness');
  equal(wetness.statistic, 'maximum_surface_water_depth_over_event', 'wetness statistic');
  equal(wetness.primaryThresholdM, 0.05, 'primary wetness threshold');
  deepEqual(wetness.sensitivityThresholdsM, [0.01, 0.1, 0.3], 'wetness sensitivities');
  equal(wetness.missingPredictionTreatedAsDry, false, 'missing prediction policy');
  equal(wetness.thresholdSelectionMayUseEvaluation, false, 'threshold evaluation isolation');
  const balance = record(outputs.massBalance, 'replacement solver mass balance');
  equal(balance.absoluteToleranceM3, 0.001, 'mass-balance absolute tolerance');
  equal(balance.relativeTolerance, 0.000001, 'mass-balance relative tolerance');
  deepEqual(
    balance.termsRequired,
    [
      'initial_volume_m3',
      'rainfall_excess_input_m3',
      'river_excess_input_m3',
      'boundary_outflow_m3',
      'final_storage_m3',
      'residual_m3',
    ],
    'mass-balance terms',
  );

  const scenarioPolicy = record(protocol.scenarioPolicy, 'replacement solver scenario policy');
  equal(scenarioPolicy.primaryScenarioId, 'primary-20m', 'primary scenario');
  equal(scenarioPolicy.everyScenarioMustRun, true, 'scenario completeness');
  equal(scenarioPolicy.bestScenarioSelectionForbidden, true, 'best-scenario selection');
  equal(scenarioPolicy.evaluationDrivenRetuningForbidden, true, 'evaluation retuning');
  equal(scenarioPolicy.failuresRemainReported, true, 'scenario failure reporting');

  const isolation = record(protocol.isolation, 'replacement solver isolation');
  for (const field of [
    'observedFloodGeometryLoaded',
    'observedFloodGeometryUsed',
    'postEventModelUsed',
    'currentAssetGeometryUsed',
    'h3UsedAsSolverGrid',
    'missingValuesSubstitutedWithZero',
  ]) {
    equal(isolation[field], false, `replacement solver isolation ${field}`);
  }

  const execution = record(protocol.execution, 'replacement solver execution');
  equal(execution.state, 'blocked', 'replacement solver execution state');
  equal(execution.solverExecutionAllowed, false, 'replacement solver execution gate');
  equal(execution.evaluationReferenceAccessAllowed, false, 'evaluation access gate');
  equal(execution.networkRequests, 0, 'replacement solver network requests');
  equal(execution.filesWritten, 0, 'replacement solver files written');
  deepEqual(
    execution.blockers,
    [
      'domain_solver_grids_not_materialized',
      'sheepmount_series_not_content_addressed',
      'half_hourly_imerg_forcing_not_materialized',
      'numerical_kernel_not_fixture_verified',
      'mass_balance_and_stability_not_verified',
      'prediction_identity_not_frozen',
    ],
    'replacement solver blockers',
  );

  equal(
    protocol.protocolSha256,
    cumbriaReplacementSolverProtocolSha256(protocol),
    'replacement solver content hash',
  );
}

export function cumbriaReplacementSolverProtocolSha256(candidate: unknown): string {
  const protocol = record(candidate, 'replacementSolverProtocol');
  const { protocolSha256: ignored, ...payload } = protocol;
  void ignored;
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function assertSheepmountContext(
  datasets: readonly unknown[],
  inflow: Record<string, unknown>,
): void {
  const dataset = datasets
    .map((value, index) => record(value, `dataset ${index}`))
    .find((value) => value.id === inflow.datasetId);
  if (dataset === undefined) {
    throw new Error('Replacement solver Sheepmount dataset is missing');
  }
  equal(dataset.role, 'model_input_candidate', 'Sheepmount solver role');
  const uses = record(dataset.permittedUses, 'Sheepmount permitted uses');
  equal(uses.modelInput, true, 'Sheepmount model-input permission');
  equal(uses.calibration, false, 'Sheepmount calibration permission');
  equal(uses.evaluation, false, 'Sheepmount evaluation permission');
  const series = record(dataset.seriesAudit, 'Sheepmount series audit');
  equal(series.stationReference, inflow.stationReference, 'Sheepmount station identity');
  equal(series.intervalSeconds, inflow.sourceIntervalSeconds, 'Sheepmount interval');
  equal(series.expectedReadings, inflow.expectedSamples, 'Sheepmount expected samples');
  equal(series.readings, inflow.expectedSamples, 'Sheepmount available samples');
  equal(series.missingReadings, 0, 'Sheepmount missing samples');
}

function parameterRange(value: unknown, label: string, boundedByOne: boolean): void {
  const range = record(value, label);
  const low = finite(range.low, `${label}.low`);
  const primary = finite(range.primary, `${label}.primary`);
  const high = finite(range.high, `${label}.high`);
  if (!(low <= primary && primary <= high) || low < 0 || (boundedByOne && high > 1)) {
    throw new Error(`${label} must be ordered and physically bounded`);
  }
  if (!boundedByOne && low <= 0) {
    throw new Error(`${label} must remain positive`);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return value as number;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
  return value;
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must equal ${JSON.stringify(expected)}`);
  }
}

function deepEqual(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} drifted`);
  }
}
