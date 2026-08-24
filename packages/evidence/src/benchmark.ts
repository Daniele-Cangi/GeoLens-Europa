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
  readonly sourceUrl: string;
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
  readonly manifestVersion: '1.6.0';
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
    readonly evaluationMetrics: readonly string[];
    readonly forbiddenClaims: readonly string[];
  };
  readonly datasets: readonly BenchmarkDataset[];
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

export function assertHistoricalBenchmarkManifest(
  value: unknown,
): asserts value is HistoricalBenchmarkManifest {
  const root = objectValue(value, 'manifest');
  if (stringValue(root.manifestVersion, 'manifestVersion') !== '1.6.0') {
    throw new Error('manifestVersion must be "1.6.0"');
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
    if (!Array.isArray(baseline.localArtifacts)) {
      throw new Error(`${label}.localArtifacts must be an array`);
    }
    routingBaselineArtifactPaths.set(
      id,
      new Set(
        baseline.localArtifacts.map((artifact, artifactIndex) =>
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

function assertBenchmarkSpatialProtocol(
  raw: Record<string, unknown>,
  aoiBounds: readonly number[],
): {
  readonly verifiedDatasetIds: readonly string[];
  readonly permanentWaterDatasetId: string;
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
