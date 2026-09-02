import { createHash } from 'node:crypto';

export interface CumbriaPublicBaselineProtocol {
  readonly id: 'cumbria-sheepmount-old-sandsfield-public-baseline-v0';
  readonly version: '0.1.0';
  readonly state: 'domain_frozen_terrain_acquisition_ready';
  readonly frozenOn: '2026-09-02';
  readonly claimBoundary: string;
  readonly selectionIsolation: {
    readonly observedFloodGeometryLoaded: false;
    readonly observedFloodGeometryUsed: false;
    readonly postEventModelUsed: false;
    readonly selectionInputs: readonly string[];
  };
  readonly reach: {
    readonly watercourse: 'River Eden';
    readonly upstreamAnchor: CumbriaPublicBaselineAnchor & {
      readonly role: 'candidate_inflow_observation_location';
      readonly datasetId: 'ea-hydrology-sheepmount-flow';
      readonly stationReference: '765512';
    };
    readonly downstreamAnchor: CumbriaPublicBaselineAnchor & {
      readonly role: 'historical_model_limit_without_boundary_values';
      readonly sourceDatasetId: 'cumberland-carlisle-sfra-2011-main-and-appendix-c';
    };
  };
  readonly domain: {
    readonly horizontalCrs: 'EPSG:27700';
    readonly verticalDatum: 'Ordnance Datum Newlyn';
    readonly bounds: readonly [number, number, number, number];
    readonly widthMetres: 8000;
    readonly heightMetres: 7000;
    readonly areaSquareMetres: 56000000;
    readonly wgs84Boundary: readonly (readonly [number, number])[];
    readonly selectionRule: string;
    readonly observedGeometryMayDefineDomain: false;
    readonly h3MayDefineComputationGrid: false;
    readonly solverGridFrozen: false;
  };
  readonly terrainAcquisition: {
    readonly datasetId: 'ea-lidar-dtm-time-stamped';
    readonly selectionRule: string;
    readonly requiredGridRefs: readonly string[];
    readonly coveredGridRefs: readonly string[];
    readonly missingGridRefs: readonly string[];
    readonly missingPolicy: 'remain_explicit_nodata_and_excluded_from_valid_prediction';
    readonly catalogueUrl: string;
    readonly catalogueSelectionSha256: string;
    readonly searchEndpoint: string;
    readonly archiveSelections: readonly CumbriaPublicBaselineArchive[];
    readonly archiveSelectionSha256: string;
    readonly archiveCount: 6;
    readonly budget: {
      readonly decodedBytesPerCell: 4;
      readonly resolutionGridRefCounts: Readonly<Record<string, number>>;
      readonly retainedRasterCells: 52000000;
      readonly estimatedRetainedDecodedBytes: 208000000;
      readonly fullArchiveRasterCells: 150000000;
      readonly estimatedFullArchiveDecodedBytes: 600000000;
      readonly estimateExcludesArchiveAndFormatOverhead: true;
    };
    readonly archiveBytesDownloaded: 0;
    readonly rasterBytesWritten: 0;
  };
  readonly execution: {
    readonly terrainDownloadAllowed: true;
    readonly archiveConcurrency: 1;
    readonly solverExecutionAllowed: false;
    readonly blockers: readonly string[];
  };
  readonly protocolSha256: string;
}

interface CumbriaPublicBaselineAnchor {
  readonly wgs84: readonly [number, number];
  readonly bng: readonly [number, number];
}

interface CumbriaPublicBaselineArchive {
  readonly product: 'lidar_tiles_dtm';
  readonly year: string;
  readonly resolutionMetres: 1;
  readonly tile: string;
  readonly uri: string;
  readonly gridRefs: readonly string[];
}

const expectedSelectionInputs = [
  'ea-hydrology-sheepmount-flow',
  'cumberland-carlisle-sfra-2011-main-and-appendix-c',
  'ea-lidar-dtm-time-stamped',
] as const;
const expectedBounds = [332000, 556000, 340000, 563000] as const;
const expectedMissingGridRefs = [
  'NY3256',
  'NY3257',
  'NY3357',
  'NY3959',
] as const;
const expectedBlockers = [
  'terrain_not_materialized',
  'channel_and_boundary_placement_not_frozen',
  'downstream_boundary_assumption_not_frozen',
  'initial_state_and_warmup_not_frozen',
  'solver_grid_and_timestep_not_frozen',
  'roughness_parameterization_not_frozen',
] as const;

export function assertCumbriaPublicBaselineProtocol(
  candidate: unknown,
  datasets: readonly unknown[],
): asserts candidate is CumbriaPublicBaselineProtocol {
  const protocol = record(candidate, 'publicBaselineProtocol');
  equal(
    protocol.id,
    'cumbria-sheepmount-old-sandsfield-public-baseline-v0',
    'publicBaselineProtocol.id',
  );
  equal(protocol.version, '0.1.0', 'publicBaselineProtocol.version');
  equal(
    protocol.state,
    'domain_frozen_terrain_acquisition_ready',
    'publicBaselineProtocol.state',
  );
  equal(protocol.frozenOn, '2026-09-02', 'publicBaselineProtocol.frozenOn');
  nonEmpty(protocol.claimBoundary, 'publicBaselineProtocol.claimBoundary');

  const isolation = record(
    protocol.selectionIsolation,
    'publicBaselineProtocol.selectionIsolation',
  );
  for (const field of [
    'observedFloodGeometryLoaded',
    'observedFloodGeometryUsed',
    'postEventModelUsed',
  ]) {
    equal(isolation[field], false, `publicBaselineProtocol.selectionIsolation.${field}`);
  }
  const selectionInputs = stringArray(
    isolation.selectionInputs,
    'publicBaselineProtocol.selectionIsolation.selectionInputs',
  );
  deepEqual(
    selectionInputs,
    expectedSelectionInputs,
    'public baseline selection inputs',
  );

  const datasetMap = new Map(
    datasets.map((value, index) => {
      const dataset = record(value, `datasets[${index}]`);
      return [nonEmpty(dataset.id, `datasets[${index}].id`), dataset] as const;
    }),
  );
  const sheepmount = datasetMap.get('ea-hydrology-sheepmount-flow');
  const sheepmountUses = record(
    sheepmount?.permittedUses,
    'ea-hydrology-sheepmount-flow.permittedUses',
  );
  if (
    sheepmount?.role !== 'model_input_candidate' ||
    sheepmountUses.modelInput !== true ||
    sheepmountUses.calibration !== false ||
    sheepmountUses.observationComparison !== false ||
    sheepmountUses.evaluation !== false
  ) {
    throw new Error(
      'Sheepmount flow must be input-only for the public baseline, never calibration or evaluation',
    );
  }
  for (const evaluationId of [
    'ea-recorded-flood-outlines',
    'copernicus-emsr147-carlisle',
  ]) {
    if (selectionInputs.includes(evaluationId)) {
      throw new Error('Observed flood geometry cannot select the public baseline domain');
    }
  }

  const reach = record(protocol.reach, 'publicBaselineProtocol.reach');
  equal(reach.watercourse, 'River Eden', 'publicBaselineProtocol.reach.watercourse');
  const upstream = record(
    reach.upstreamAnchor,
    'publicBaselineProtocol.reach.upstreamAnchor',
  );
  equal(
    upstream.role,
    'candidate_inflow_observation_location',
    'publicBaselineProtocol.reach.upstreamAnchor.role',
  );
  equal(
    upstream.datasetId,
    'ea-hydrology-sheepmount-flow',
    'publicBaselineProtocol.reach.upstreamAnchor.datasetId',
  );
  equal(upstream.stationReference, '765512', 'Sheepmount station reference');
  coordinate(upstream.wgs84, [-2.951874, 54.905047], 'Sheepmount WGS84');
  coordinate(upstream.bng, [339063, 557118], 'Sheepmount BNG');

  const downstream = record(
    reach.downstreamAnchor,
    'publicBaselineProtocol.reach.downstreamAnchor',
  );
  equal(
    downstream.role,
    'historical_model_limit_without_boundary_values',
    'publicBaselineProtocol.reach.downstreamAnchor.role',
  );
  equal(
    downstream.sourceDatasetId,
    'cumberland-carlisle-sfra-2011-main-and-appendix-c',
    'publicBaselineProtocol.reach.downstreamAnchor.sourceDatasetId',
  );
  coordinate(downstream.wgs84, [-3.044369, 54.945463], 'Old Sandsfield WGS84');
  coordinate(downstream.bng, [333200, 561700], 'Old Sandsfield BNG');

  const domain = record(protocol.domain, 'publicBaselineProtocol.domain');
  equal(domain.horizontalCrs, 'EPSG:27700', 'public baseline horizontal CRS');
  equal(domain.verticalDatum, 'Ordnance Datum Newlyn', 'public baseline vertical datum');
  deepEqual(
    numericArray(domain.bounds, 4, 'publicBaselineProtocol.domain.bounds'),
    expectedBounds,
    'public baseline domain bounds',
  );
  equal(domain.widthMetres, 8000, 'public baseline domain width');
  equal(domain.heightMetres, 7000, 'public baseline domain height');
  equal(domain.areaSquareMetres, 56000000, 'public baseline domain area');
  nonEmpty(domain.selectionRule, 'publicBaselineProtocol.domain.selectionRule');
  equal(
    domain.observedGeometryMayDefineDomain,
    false,
    'publicBaselineProtocol.domain.observedGeometryMayDefineDomain',
  );
  equal(
    domain.h3MayDefineComputationGrid,
    false,
    'publicBaselineProtocol.domain.h3MayDefineComputationGrid',
  );
  equal(domain.solverGridFrozen, false, 'publicBaselineProtocol.domain.solverGridFrozen');
  const wgs84Boundary = array(
    domain.wgs84Boundary,
    'publicBaselineProtocol.domain.wgs84Boundary',
  );
  if (wgs84Boundary.length !== 5) {
    throw new Error('Public baseline WGS84 boundary must be a closed rectangle');
  }
  coordinate(wgs84Boundary[0], [-3.061749022, 54.894087987], 'domain southwest');
  coordinate(wgs84Boundary[1], [-2.937036986, 54.895114064], 'domain southeast');
  coordinate(wgs84Boundary[2], [-2.938500426, 54.958009473], 'domain northeast');
  coordinate(wgs84Boundary[3], [-3.063407096, 54.956981012], 'domain northwest');
  coordinate(wgs84Boundary[4], [-3.061749022, 54.894087987], 'domain closure');

  const terrain = record(
    protocol.terrainAcquisition,
    'publicBaselineProtocol.terrainAcquisition',
  );
  equal(
    terrain.datasetId,
    'ea-lidar-dtm-time-stamped',
    'public baseline terrain dataset',
  );
  nonEmpty(terrain.selectionRule, 'publicBaselineProtocol.terrainAcquisition.selectionRule');
  equal(
    terrain.missingPolicy,
    'remain_explicit_nodata_and_excluded_from_valid_prediction',
    'public baseline missing terrain policy',
  );
  httpsUrl(terrain.catalogueUrl, 'public baseline terrain catalogue URL');
  httpsUrl(terrain.searchEndpoint, 'public baseline terrain search endpoint');
  sha256(terrain.catalogueSelectionSha256, 'terrain catalogue selection SHA-256');
  sha256(terrain.archiveSelectionSha256, 'terrain archive selection SHA-256');

  const requiredGridRefs = stringArray(
    terrain.requiredGridRefs,
    'publicBaselineProtocol.terrainAcquisition.requiredGridRefs',
  );
  const coveredGridRefs = stringArray(
    terrain.coveredGridRefs,
    'publicBaselineProtocol.terrainAcquisition.coveredGridRefs',
  );
  const missingGridRefs = stringArray(
    terrain.missingGridRefs,
    'publicBaselineProtocol.terrainAcquisition.missingGridRefs',
  );
  deepEqual(requiredGridRefs, gridReferencesForBounds(), 'public baseline grid references');
  deepEqual(missingGridRefs, expectedMissingGridRefs, 'public baseline missing grid references');
  if (new Set(requiredGridRefs).size !== 56 || new Set(coveredGridRefs).size !== 52) {
    throw new Error('Public baseline terrain coverage counts drifted');
  }
  const combined = [...coveredGridRefs, ...missingGridRefs].sort();
  deepEqual(combined, requiredGridRefs, 'public baseline terrain coverage accounting');

  const archives = array(
    terrain.archiveSelections,
    'publicBaselineProtocol.terrainAcquisition.archiveSelections',
  );
  equal(terrain.archiveCount, 6, 'public baseline archive count');
  if (archives.length !== 6) {
    throw new Error('Public baseline must select exactly six source archives');
  }
  const archiveGridRefs: string[] = [];
  for (const [index, value] of archives.entries()) {
    const archive = record(
      value,
      `publicBaselineProtocol.terrainAcquisition.archiveSelections[${index}]`,
    );
    equal(archive.product, 'lidar_tiles_dtm', `archive ${index} product`);
    nonEmpty(archive.year, `archive ${index} year`);
    equal(archive.resolutionMetres, 1, `archive ${index} resolution`);
    if (!/^NY(?:30|35)(?:55|60)$/.test(nonEmpty(archive.tile, `archive ${index} tile`))) {
      throw new Error(`Public baseline archive ${index} has an unexpected tile`);
    }
    httpsUrl(archive.uri, `archive ${index} URI`);
    archiveGridRefs.push(
      ...stringArray(archive.gridRefs, `archive ${index} grid references`),
    );
  }
  deepEqual(
    [...archiveGridRefs].sort(),
    coveredGridRefs,
    'public baseline archive-to-grid accounting',
  );
  equal(
    terrain.catalogueSelectionSha256,
    '1b018876cccd284c9e0bc514d5dbb73aa69712a4c4d18b8c366221fefcf88667',
    'public baseline catalogue selection identity',
  );
  equal(
    terrain.archiveSelectionSha256,
    '209f45bd8e823ab1c49a411920fe513bbe269e547c479570bade878772999130',
    'public baseline archive selection identity',
  );

  const budget = record(terrain.budget, 'publicBaselineProtocol.terrainAcquisition.budget');
  equal(budget.decodedBytesPerCell, 4, 'public baseline decoded bytes per cell');
  deepEqual(budget.resolutionGridRefCounts, { '1': 52 }, 'public baseline resolution counts');
  equal(budget.retainedRasterCells, 52000000, 'public baseline retained raster cells');
  equal(
    budget.estimatedRetainedDecodedBytes,
    208000000,
    'public baseline retained decoded bytes',
  );
  equal(budget.fullArchiveRasterCells, 150000000, 'public baseline full archive cells');
  equal(
    budget.estimatedFullArchiveDecodedBytes,
    600000000,
    'public baseline full archive decoded bytes',
  );
  equal(
    budget.estimateExcludesArchiveAndFormatOverhead,
    true,
    'public baseline budget qualification',
  );
  equal(terrain.archiveBytesDownloaded, 0, 'public baseline downloaded archive bytes');
  equal(terrain.rasterBytesWritten, 0, 'public baseline written raster bytes');

  const execution = record(protocol.execution, 'publicBaselineProtocol.execution');
  equal(execution.terrainDownloadAllowed, true, 'public baseline terrain download gate');
  equal(execution.archiveConcurrency, 1, 'public baseline archive concurrency');
  equal(execution.solverExecutionAllowed, false, 'public baseline solver gate');
  deepEqual(
    stringArray(execution.blockers, 'publicBaselineProtocol.execution.blockers'),
    expectedBlockers,
    'public baseline execution blockers',
  );

  const protocolSha256 = sha256(
    protocol.protocolSha256,
    'publicBaselineProtocol.protocolSha256',
  );
  const { protocolSha256: ignored, ...withoutHash } = protocol;
  void ignored;
  const recomputed = createHash('sha256')
    .update(JSON.stringify(withoutHash))
    .digest('hex');
  equal(protocolSha256, recomputed, 'public baseline protocol content hash');
}

function gridReferencesForBounds(): string[] {
  const refs: string[] = [];
  for (let northing = 56; northing < 63; northing += 1) {
    for (let easting = 32; easting < 40; easting += 1) {
      refs.push(`NY${easting}${northing}`);
    }
  }
  return refs.sort();
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  const values = array(value, label);
  if (!values.every((item) => typeof item === 'string' && item.length > 0)) {
    throw new Error(`${label} must contain non-empty strings`);
  }
  return values as string[];
}

function numericArray(value: unknown, length: number, label: string): number[] {
  const values = array(value, label);
  if (
    values.length !== length ||
    !values.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    throw new Error(`${label} must contain ${length} finite numbers`);
  }
  return values as number[];
}

function coordinate(value: unknown, expected: readonly number[], label: string): void {
  deepEqual(numericArray(value, 2, label), expected, label);
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function httpsUrl(value: unknown, label: string): string {
  const text = nonEmpty(value, label);
  if (new URL(text).protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS`);
  }
  return text;
}

function sha256(value: unknown, label: string): string {
  const text = nonEmpty(value, label);
  if (!/^[a-f0-9]{64}$/.test(text)) {
    throw new Error(`${label} must be lowercase SHA-256`);
  }
  return text;
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must equal ${JSON.stringify(expected)}`);
  }
}

function deepEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} drifted`);
  }
}
