const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  assertCumbriaAccessManifest,
  CUMBRIA_EVENT_WINDOW,
  createCumbriaDtmMaterializationPlan,
  cumbriaReplacementSolverProtocolSha256,
} = require('../dist');

const manifestPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tests',
  'ground-truth',
  'cumbria-2015',
  'manifest.json',
);

function manifestFixture() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

test('Cumbria manifest freezes the replacement-solver contract without opening solver access', () => {
  const manifest = manifestFixture();

  assert.doesNotThrow(() => assertCumbriaAccessManifest(manifest));
  assert.deepEqual(
    {
      start: manifest.event.windowStart,
      endExclusive: manifest.event.windowEndExclusive,
    },
    CUMBRIA_EVENT_WINDOW,
  );
  assert.equal(
    manifest.acquisition.state,
    'replacement_solver_contract_frozen',
  );
  assert.equal(manifest.acquisition.largeDownloadsAllowed, false);
  assert.equal(manifest.acquisition.boundedTerrainDownloadsAllowed, true);
  assert.equal(
    manifest.datasets.some((dataset) => 'localArtifacts' in dataset),
    false,
  );
});

test('canonical IMERG acquisition covers all 144 expected half-hour granules', () => {
  const manifest = manifestFixture();
  const imerg = manifest.datasets.find(
    (dataset) => dataset.id === 'nasa-imerg-v07-final',
  );

  assert.equal(imerg.access.state, 'materialized');
  assert.equal(imerg.facts.product, 'GPM_3IMERGHH');
  assert.equal(imerg.facts.expectedGranules, 144);
  assert.equal(imerg.facts.discoveredGranules, 144);
  assert.equal(imerg.facts.acquiredGranules, 144);
  assert.equal(imerg.facts.firstGranuleAt, manifest.event.windowStart);
  assert.equal(imerg.facts.lastGranuleAt, '2015-12-06T23:30:00Z');

  imerg.facts.discoveredGranules = 143;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /IMERG discovered granules must equal 144/,
  );
});

test('direct Carlisle observations close the 72-hour reading account', () => {
  const manifest = manifestFixture();
  const series = manifest.datasets.filter(
    (dataset) => dataset.role === 'observation_comparison' && dataset.seriesAudit,
  );

  assert.deepEqual(
    series.map((dataset) => dataset.id),
    [
      'ea-hydrology-sheepmount-level',
      'ea-hydrology-willow-holme-rainfall',
    ],
  );
  for (const dataset of series) {
    assert.equal(dataset.role, 'observation_comparison');
    assert.equal(dataset.permittedUses.modelInput, false);
    assert.equal(dataset.permittedUses.calibration, false);
    assert.equal(dataset.seriesAudit.expectedReadings, 288);
    assert.equal(dataset.seriesAudit.readings, 288);
    assert.equal(dataset.seriesAudit.missingReadings, 0);
  }

  const rainfall = series.find(
    (dataset) => dataset.id === 'ea-hydrology-willow-holme-rainfall',
  );
  assert.equal(rainfall.seriesAudit.aggregate.value, 49);
  assert.match(rainfall.access.note, /must not be represented as catchment-wide/);

  const sheepmountFlow = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-hydrology-sheepmount-flow',
  );
  assert.equal(sheepmountFlow.role, 'model_input_candidate');
  assert.deepEqual(sheepmountFlow.permittedUses, {
    modelInput: true,
    calibration: false,
    observationComparison: false,
    evaluation: false,
  });
  assert.match(sheepmountFlow.access.note, /public baseline/);

  rainfall.seriesAudit.readings = 287;
  rainfall.seriesAudit.missingReadings = 1;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /verified readings must equal 288/,
  );
});

test('public baseline freezes a small input-selected domain without evaluation leakage', () => {
  const manifest = manifestFixture();
  const protocol = manifest.publicBaselineProtocol;

  assert.equal(
    protocol.id,
    'cumbria-sheepmount-old-sandsfield-public-baseline-v0',
  );
  assert.equal(protocol.state, 'domain_frozen_terrain_acquisition_ready');
  assert.deepEqual(protocol.domain.bounds, [332000, 556000, 340000, 563000]);
  assert.equal(protocol.domain.areaSquareMetres, 56000000);
  assert.equal(protocol.domain.observedGeometryMayDefineDomain, false);
  assert.equal(protocol.domain.h3MayDefineComputationGrid, false);
  assert.equal(protocol.domain.solverGridFrozen, false);
  assert.equal(protocol.selectionIsolation.observedFloodGeometryLoaded, false);
  assert.equal(protocol.selectionIsolation.observedFloodGeometryUsed, false);
  assert.equal(protocol.selectionIsolation.postEventModelUsed, false);
  assert.equal(
    protocol.selectionIsolation.selectionInputs.includes(
      'ea-recorded-flood-outlines',
    ),
    false,
  );
  assert.equal(
    protocol.selectionIsolation.selectionInputs.includes(
      'copernicus-emsr147-carlisle',
    ),
    false,
  );
  assert.equal(protocol.execution.terrainDownloadAllowed, true);
  assert.equal(protocol.execution.solverExecutionAllowed, false);

  const leaked = manifestFixture();
  leaked.publicBaselineProtocol.selectionIsolation.selectionInputs.push(
    'ea-recorded-flood-outlines',
  );
  assert.throws(
    () => assertCumbriaAccessManifest(leaked),
    /selection inputs drifted|Observed flood geometry cannot select/,
  );
});

test('public baseline DTM catalogue selection keeps four initial gaps missing', () => {
  const manifest = manifestFixture();
  const terrain = manifest.publicBaselineProtocol.terrainAcquisition;

  assert.equal(terrain.requiredGridRefs.length, 56);
  assert.equal(terrain.coveredGridRefs.length, 52);
  assert.deepEqual(terrain.missingGridRefs, [
    'NY3256',
    'NY3257',
    'NY3357',
    'NY3959',
  ]);
  assert.equal(terrain.archiveCount, 6);
  assert.equal(terrain.archiveSelections.length, 6);
  assert.equal(terrain.budget.estimatedRetainedDecodedBytes, 208000000);
  assert.equal(terrain.budget.estimatedFullArchiveDecodedBytes, 600000000);
  assert.equal(terrain.archiveBytesDownloaded, 0);
  assert.equal(terrain.rasterBytesWritten, 0);

  const substituted = manifestFixture();
  substituted.publicBaselineProtocol.terrainAcquisition.missingGridRefs = [];
  assert.throws(
    () => assertCumbriaAccessManifest(substituted),
    /missing grid references drifted/,
  );

  const solverEnabled = manifestFixture();
  solverEnabled.publicBaselineProtocol.execution.solverExecutionAllowed = true;
  assert.throws(
    () => assertCumbriaAccessManifest(solverEnabled),
    /solver gate/,
  );
});

test('public baseline terrain materialization records real coverage without zero substitution', () => {
  const manifest = manifestFixture();
  const result = manifest.publicBaselineTerrainMaterialization;

  assert.equal(manifest.manifestVersion, '0.19.0');
  assert.equal(result.state, 'terrain_materialized_with_explicit_gaps');
  assert.equal(
    result.protocolSha256,
    manifest.publicBaselineProtocol.protocolSha256,
  );
  assert.deepEqual(result.coverage.catalogueMissingGridRefs, [
    'NY3256',
    'NY3257',
    'NY3357',
    'NY3959',
  ]);
  assert.deepEqual(result.coverage.archiveMissingGridRefs, [
    'NY3258',
    'NY3259',
    'NY3358',
    'NY3359',
  ]);
  assert.deepEqual(result.coverage.noDataOnlyGridRefs, [
    'NY3859',
    'NY3960',
  ]);
  assert.equal(result.coverage.availableGridCount, 46);
  assert.equal(result.coverage.completeCoverage, false);
  assert.equal(result.storage.archiveBytes, 280161858);
  assert.equal(result.storage.physicalCompressedBytes, 36148351);
  assert.equal(result.isolation.missingPixelsSubstitutedWithZero, false);
  assert.equal(result.isolation.observedFloodGeometryLoaded, false);

  const inventedCoverage = manifestFixture();
  inventedCoverage.publicBaselineTerrainMaterialization.coverage.completeCoverage =
    true;
  assert.throws(
    () => assertCumbriaAccessManifest(inventedCoverage),
    /terrain complete coverage claim/,
  );

  const driftedReceipt = manifestFixture();
  driftedReceipt.publicBaselineTerrainMaterialization.maskReceipt.sha256 =
    'a'.repeat(64);
  assert.throws(
    () => assertCumbriaAccessManifest(driftedReceipt),
    /terrain mask receipt identity/,
  );
});

test('public baseline environmental receipts pin real CLC and IMERG without authorizing the solver', () => {
  const manifest = manifestFixture();
  const result = manifest.publicBaselineEnvironmentalMaterialization;

  assert.equal(result.state, 'land_cover_and_precipitation_materialized');
  assert.equal(
    result.protocolSha256,
    manifest.publicBaselineProtocol.protocolSha256,
  );
  assert.equal(result.landCover.status, 'available');
  assert.equal(result.landCover.availableCellCount, 7553);
  assert.equal(result.landCover.missingCellCount, 0);
  assert.equal(result.precipitation.status, 'available');
  assert.equal(result.precipitation.acquiredGranules, 144);
  assert.deepEqual(result.precipitation.sourceGrid.shapeLatLon, [3, 4]);
  assert.equal(result.precipitation.sourceGrid.finiteCellCount, 12);
  assert.equal(result.precipitation.sourceGranulesCopied, false);
  assert.equal(result.isolation.missingValuesSubstitutedWithZero, false);
  assert.equal(result.isolation.observedFloodGeometryLoaded, false);
  assert.equal(result.isolation.solverExecutionAuthorized, false);

  const driftedLandCover = manifestFixture();
  driftedLandCover.publicBaselineEnvironmentalMaterialization.landCover.receipt.sha256 =
    'a'.repeat(64);
  assert.throws(
    () => assertCumbriaAccessManifest(driftedLandCover),
    /land-cover receipt identity/,
  );

  const missingAsZero = manifestFixture();
  missingAsZero.publicBaselineEnvironmentalMaterialization.isolation.missingValuesSubstitutedWithZero =
    true;
  assert.throws(
    () => assertCumbriaAccessManifest(missingAsZero),
    /environmental missing-value policy/,
  );
});

test('post-event flood geometry cannot leak into input or calibration', () => {
  const manifest = manifestFixture();
  const evaluation = manifest.datasets.filter(
    (dataset) => dataset.role === 'evaluation_reference',
  );

  assert.deepEqual(
    evaluation.map((dataset) => dataset.id),
    ['ea-recorded-flood-outlines', 'copernicus-emsr147-carlisle'],
  );
  for (const dataset of evaluation) {
    assert.equal(dataset.temporalRelation, 'post_event');
    assert.deepEqual(dataset.permittedUses, {
      modelInput: false,
      calibration: false,
      observationComparison: false,
      evaluation: true,
    });
  }

  evaluation[0].permittedUses.modelInput = true;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /evaluation evidence must be evaluation-only/,
  );
});

test('blind evaluation protocol remains sealed until the prediction is frozen', () => {
  const manifest = manifestFixture();
  const protocol = manifest.evaluationProtocol;
  const { protocolSha256, ...hashPayload } = protocol;

  assert.equal(protocol.validationMode, 'blind_hindcast');
  assert.equal(
    protocol.claimBoundary,
    'retrospective_historical_replay_not_operational_forecast',
  );
  assert.equal(protocol.predictionFreeze.state, 'missing');
  assert.equal(protocol.predictionFreeze.predictionArtifactSha256, null);
  assert.equal(protocol.predictionFreeze.evaluationDomain.state, 'missing');
  assert.equal(
    protocol.predictionFreeze.evaluationDomain.observedGeometryMayDefineDomain,
    false,
  );
  assert.equal(
    protocol.predictionFreeze.evaluationDomain.h3MayDefineHydraulicMesh,
    false,
  );
  assert.equal(protocol.referenceSeal.state, 'sealed_not_loaded');
  assert.equal(protocol.referenceSeal.geometryLoaded, false);
  assert.equal(protocol.referenceSeal.archivesDownloaded, false);
  assert.equal(protocol.referenceSeal.separateComparisons, true);
  assert.equal(protocol.referenceSeal.combineReferences, false);
  assert.deepEqual(
    protocol.metrics.map((metric) => metric.id),
    [
      'intersection_over_union',
      'area_precision',
      'area_recall',
      'false_positive_area',
      'false_negative_area',
      'boundary_distance_p95',
    ],
  );
  assert.equal(protocol.comparisonPolicy.horizontalCrs, 'EPSG:27700');
  assert.equal(
    protocol.comparisonPolicy.missingObservedCoverage,
    'exclude_and_report_not_dry',
  );
  assert.equal(
    protocol.comparisonPolicy.missingPredictionCoverage,
    'block_evaluation',
  );
  assert.equal(protocol.execution.state, 'blocked');
  assert.equal(protocol.execution.networkRequests, 0);
  assert.equal(protocol.execution.filesWritten, 0);
  assert.equal(protocol.execution.evaluationRuns, 0);
  assert.equal(
    createHash('sha256').update(JSON.stringify(hashPayload)).digest('hex'),
    protocolSha256,
  );
});

test('blind evaluation protocol rejects reference access and post-hoc changes', () => {
  const loadedReference = manifestFixture();
  loadedReference.evaluationProtocol.referenceSeal.geometryLoaded = true;
  assert.throws(
    () => assertCumbriaAccessManifest(loadedReference),
    /evaluationProtocol.referenceSeal.geometryLoaded/,
  );

  const combinedReferences = manifestFixture();
  combinedReferences.evaluationProtocol.referenceSeal.combineReferences = true;
  assert.throws(
    () => assertCumbriaAccessManifest(combinedReferences),
    /evaluationProtocol.referenceSeal.combineReferences/,
  );

  const postHocMetric = manifestFixture();
  postHocMetric.evaluationProtocol.metrics.pop();
  assert.throws(
    () => assertCumbriaAccessManifest(postHocMetric),
    /Blind evaluation metric definitions drifted/,
  );

  const inventedPrediction = manifestFixture();
  inventedPrediction.evaluationProtocol.predictionFreeze.predictionArtifactSha256 =
    'a'.repeat(64);
  assert.throws(
    () => assertCumbriaAccessManifest(inventedPrediction),
    /evaluationProtocol.predictionFreeze.predictionArtifactSha256/,
  );
});

test('pre-event terrain selection maps to downloadable archives with explicit gaps', () => {
  const manifest = manifestFixture();
  const lidar = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  );

  assert.equal(manifest.manifestVersion, '0.19.0');
  assert.equal(lidar.access.state, 'remote_verified');
  assert.deepEqual(
    {
      sourceRows: lidar.lidarCatalogAudit.sourceRows,
      intersectingGridRefs: lidar.lidarCatalogAudit.intersectingGridRefs,
      preEventRows: lidar.lidarCatalogAudit.preEventRows,
      selectedPreEventGridRefs:
        lidar.lidarCatalogAudit.selectedPreEventGridRefs,
    },
    {
      sourceRows: 550,
      intersectingGridRefs: 241,
      preEventRows: 432,
      selectedPreEventGridRefs: 231,
    },
  );
  assert.deepEqual(lidar.lidarCatalogAudit.gridRefsWithoutPreEvent, [
    'NY3256',
    'NY3446',
    'NY3448',
    'NY3646',
    'NY3652',
    'NY3846',
    'NY3848',
    'NY3959',
    'NY4062',
    'NY4162',
  ]);
  assert.equal(
    lidar.lidarCatalogAudit.selectionSha256,
    'b69a687cd42719c200de1e6e51e3a08b96045fc3ffdccf6b7ed2473494e22788',
  );
  assert.deepEqual(lidar.lidarCatalogAudit.selectedFilenameKinds, {
    laz: 231,
    tif: 0,
    zip: 0,
  });
  assert.equal(lidar.facts.downloadableRasterIdentitiesVerified, true);
  assert.equal(lidar.facts.downloadArchiveIdentities, 30);
  assert.equal(lidar.facts.materializationProtocolFrozen, true);
  assert.equal(lidar.facts.archiveBytesDownloaded, 0);
  assert.deepEqual(
    {
      searchResultCount:
        lidar.lidarCatalogAudit.downloadMapping.searchResultCount,
      productId: lidar.lidarCatalogAudit.downloadMapping.productId,
      productResultCount:
        lidar.lidarCatalogAudit.downloadMapping.productResultCount,
      mappedPreEventGridRefs:
        lidar.lidarCatalogAudit.downloadMapping.mappedPreEventGridRefs,
      unmappedSelectedGridRefs:
        lidar.lidarCatalogAudit.downloadMapping.unmappedSelectedGridRefs,
      archiveIdentityCount:
        lidar.lidarCatalogAudit.downloadMapping.archiveIdentityCount,
    },
    {
      searchResultCount: 590,
      productId: 'lidar_tiles_dtm',
      productResultCount: 123,
      mappedPreEventGridRefs: 231,
      unmappedSelectedGridRefs: [],
      archiveIdentityCount: 30,
    },
  );
  assert.equal(
    lidar.lidarCatalogAudit.downloadMapping.mappingSha256,
    '7a75da7dc1ff0c30d2ba20d59714658f7e3b8e853ca2b8c16ce9e01b27d1854c',
  );
  assert.equal(
    lidar.lidarCatalogAudit.downloadMapping.archiveIdentitySha256,
    'a842c8ad0b1ce132eb3b61865c5739e9ca6e62eba17090bc52cbcb5fbd159bba',
  );
  assert.deepEqual(lidar.lidarCatalogAudit.downloadMapping.sampleArchiveProbe, {
    uri: 'https://environment.data.gov.uk/tiles/collections/survey/lidar_tiles_dtm/2009/1/NY3555',
    httpStatus: 200,
    contentType: 'application/zip',
    contentDisposition:
      'attachment; filename="lidar_tiles_dtm-2009-1-NY35ne.zip"',
    rangeHonored: false,
    archiveBytesRead: 0,
  });
  const materialization =
    lidar.lidarCatalogAudit.downloadMapping.materializationProtocol;
  assert.equal(materialization.id, 'cumbria-dtm-materialization-v0');
  assert.equal(
    materialization.state,
    'frozen_download_blocked_by_physical_gates',
  );
  assert.deepEqual(materialization.budget.resolutionArchiveCounts, {
    '0.5': 3,
    '1': 23,
    '2': 4,
  });
  assert.deepEqual(materialization.budget.resolutionMappedGridRefCounts, {
    '0.5': 14,
    '1': 205,
    '2': 12,
  });
  assert.equal(materialization.budget.fullArchiveRasterCells, 900000000);
  assert.equal(materialization.budget.retainedMaskRasterCells, 264000000);
  assert.equal(
    materialization.budget.estimatedRetainedMaskDecodedBytes,
    1056000000,
  );
  assert.equal(materialization.execution.largeDownloadsAllowed, false);
  assert.equal(materialization.execution.archiveConcurrency, 1);
  assert.equal(materialization.execution.archiveBytesDownloaded, 0);
  assert.equal(materialization.rasterMask.resamplingAllowed, false);
  assert.equal(
    materialization.rasterMask.uncoveredGridRefsRemain,
    'missing',
  );
  assert.equal(
    lidar.lidarCatalogAudit.downloadMapping.archiveIdentities.reduce(
      (sum, archive) => sum + archive.mappedGridRefs,
      0,
    ),
    231,
  );
  assert.equal(
    lidar.lidarCatalogAudit.acquisitionState,
    'ready_with_explicit_gaps',
  );

  lidar.lidarCatalogAudit.selectedPreEventGridRefs = 241;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /LiDAR selected pre-event grid references must equal 231/,
  );

  const wholeArchive = manifestFixture();
  wholeArchive.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  ).lidarCatalogAudit.downloadMapping.materializationRule =
    'accept every pixel in each 5 km archive';
  assert.throws(
    () => assertCumbriaAccessManifest(wholeArchive),
    /LiDAR raster materialization rule/,
  );

  const wrongArchive = manifestFixture();
  wrongArchive.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  ).lidarCatalogAudit.downloadMapping.archiveIdentities[0].uri =
    'https://environment.data.gov.uk/tiles/collections/survey/lidar_tiles_dtm/2013/1/NY3051';
  assert.throws(
    () => assertCumbriaAccessManifest(wrongArchive),
    /LiDAR archive URI identity/,
  );
});

test('Cumbria DTM planner is a bounded dry-run and cannot start downloads', () => {
  const manifest = manifestFixture();
  const plan = createCumbriaDtmMaterializationPlan(manifest);

  assert.equal(plan.protocolId, 'cumbria-dtm-materialization-v0');
  assert.equal(plan.state, 'blocked_by_physical_gates');
  assert.equal(plan.archiveCount, 30);
  assert.equal(plan.archives.length, 30);
  assert.equal(plan.mappedGridRefCount, 231);
  assert.equal(plan.missingGridRefs.length, 10);
  assert.equal(plan.estimatedRetainedMaskDecodedBytes, 1056000000);
  assert.equal(plan.minimumFreeSpaceBytes, 17179869184);
  assert.equal(plan.downloadAttempted, false);
  assert.equal(
    plan.archives.reduce(
      (sum, archive) => sum + archive.estimatedFullArchiveDecodedBytes,
      0,
    ),
    3600000000,
  );
  assert.equal(
    plan.archives.reduce(
      (sum, archive) => sum + archive.estimatedRetainedMaskDecodedBytes,
      0,
    ),
    1056000000,
  );
  assert.throws(
    () => createCumbriaDtmMaterializationPlan(manifest, { execute: true }),
    /downloads are blocked/,
  );
});

test('Cumbria DTM protocol rejects unsafe archive handling and invented coverage', () => {
  const unsafeZip = manifestFixture();
  unsafeZip.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  ).lidarCatalogAudit.downloadMapping.materializationProtocol.zipInspection
    .rejectParentTraversal = false;
  assert.throws(
    () => assertCumbriaAccessManifest(unsafeZip),
    /path-traversal policy/,
  );

  const inventedCoverage = manifestFixture();
  inventedCoverage.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  ).lidarCatalogAudit.downloadMapping.materializationProtocol.rasterMask
    .uncoveredGridRefs = [];
  assert.throws(
    () => assertCumbriaAccessManifest(inventedCoverage),
    /uncovered grid references drifted/,
  );

  const enabledDownloads = manifestFixture();
  enabledDownloads.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  ).lidarCatalogAudit.downloadMapping.materializationProtocol.execution
    .largeDownloadsAllowed = true;
  assert.throws(
    () => assertCumbriaAccessManifest(enabledDownloads),
    /large-download gate/,
  );
});

test('spatial protocol preserves native grids and links only the declared replacement mesh', () => {
  const manifest = manifestFixture();
  const protocol = manifest.spatialGridProtocol;

  assert.equal(
    protocol.state,
    'evidence_index_and_replacement_mesh_frozen_execution_blocked',
  );
  assert.deepEqual(protocol.sourceGrids.terrain.nativeResolutionMetres, [0.5, 1, 2]);
  assert.equal(protocol.sourceGrids.terrain.resampling, 'none');
  assert.equal(protocol.sourceGrids.landCover.nativeResolutionMetres, 100);
  assert.equal(
    protocol.sourceGrids.landCover.categoricalInterpolation,
    'forbidden',
  );
  assert.equal(
    protocol.sourceGrids.precipitation.nativeResolution,
    'approximately_0.1_degree',
  );
  assert.equal(protocol.evidenceIndex.system, 'H3');
  assert.equal(protocol.evidenceIndex.resolution, 10);
  assert.equal(protocol.evidenceIndex.cellCount, 24230);
  assert.equal(
    protocol.evidenceIndex.selectionSha256,
    'cee0f57bf78d1886f9e787402aa05eeed431bc36cfd0239f9370d725e2c947f9',
  );
  assert.equal(
    protocol.evidenceIndex.role,
    'catalog_inspection_and_evidence_join_only',
  );
  assert.equal(protocol.evidenceIndex.physicalRoutingAllowed, false);
  assert.equal(protocol.evidenceIndex.hydraulicStateAllowed, false);
  assert.deepEqual(protocol.evidenceIndex.composition, {
    implementationVersion: 'spatial-evidence-index-v0.1.0',
    state: 'real_single_cell_materialized_solver_mesh_blocked',
    geometryMethod: 'exact_native_footprint_overlap',
    areaReferenceCrs: 'EPSG:27700',
    areaMeasurementMethod: 'projected_h3_boundary_shoelace',
    coverageToleranceFraction: 0.000001,
    incompletePolicy: 'null_evidence_with_partial_coverage_diagnostics',
    syntheticFixtureCannotEnterRealMode: true,
    observedZeroPreserved: true,
    overlappingFootprintsRejected: true,
    identicalPrecipitationWindowRequired: true,
    verificationFixture: {
      id: 'cumbria-spatial-composition-single-cell-v0',
      h3: '8a1955d817b7fff',
      composedAt: '2026-09-02T06:00:00.000Z',
      terrainElevationM: 105,
      terrainResolutionM: 1,
      landCoverClass: 211,
      rainfallMm: 0,
      windowStart: '2015-12-04T00:00:00.000Z',
      windowEnd: '2015-12-07T00:00:00.000Z',
      expectedResultSha256:
        protocol.evidenceIndex.composition.verificationFixture.expectedResultSha256,
    },
    realEvidenceProbe: {
      id: 'cumbria-public-baseline-centroid-h3-cell-v0',
      state: 'materialized_and_reproduced',
      scope: 'single_inspection_cell_not_domain_wide',
      selectionRule:
        'H3 resolution 10 cell containing the exact centre of the frozen public-baseline EPSG:27700 domain; selection is independent of source values and evaluation geometry',
      fixedPointBng: [336000, 559500],
      h3: '8a1955d9535ffff',
      h3Resolution: 10,
      composedAt: '2026-09-02T22:04:05.843Z',
      targetCellAreaM2: 13257.43490600586,
      inputReceiptSha256: {
        terrain:
          'c9acfe46f41e08e40e6473ce399e912b8d4e27c880e928e0f1a77aef15749988',
        landCover:
          'dce61b2234329619ce1212ccc3a49650c1fec68eea7bc5d465f722e170ebc96d',
        precipitation:
          'fb768f0de5dd2e39df8c32e80655b28e9dfef02d1ed82605eb94012bb244ebf7',
      },
      intersectionCounts: {
        terrain: 13528,
        landCover: 4,
        precipitation: 2,
      },
      resultSha256:
        '08a8a07b06f8d35543bd8ba7b3fda350e71b3d685358e7e4ff93ae2db9194200',
      receipt: {
        fileName:
          'cumbria-public-baseline-spatial-evidence-cell.receipt.json',
        schemaVersion: 'cumbria-spatial-evidence-cell-receipt-v0.1.0',
        sha256:
          'a51852c30b0d6cc79048c699c29aeb84e9b65f8a4960b05fc1df304eea18ff50',
      },
      artifact: {
        sha256:
          'fa728fe2935d5ab657f893513ea900b4c9088e68f020548409b1c6e08bb384e1',
        contentSha256:
          '7fa1ce9ea2c2683f0648b6514092509c14bbb8dc3a0eb8c4c105e42c823e73d4',
        compressedBytes: 96438,
        decodedBytes: 5645297,
      },
      summary: {
        minimumElevationM: 6.300000190734863,
        maximumElevationM: 9.09000015258789,
        meanElevationM: 8.097015341227973,
        dominantClcClass: 231,
        dominantClcClassFraction: 1,
        rainfall72hMm: 98.78403955006738,
        terrainCoverageFraction: 1,
        landCoverCoverageFraction: 1,
        precipitationCoverageFraction: 0.9999999988490391,
      },
      isolation: {
        selectionIndependentOfSourceValues: true,
        observedFloodGeometryLoaded: false,
        h3UsedAsSourceOrSolverGrid: false,
        physicalRoutingAllowed: false,
        hydraulicStateAllowed: false,
        solverExecutionAuthorized: false,
        missingValuesSubstitutedWithZero: false,
      },
    },
  });
  assert.equal(
    protocol.exchangeFrame.topology,
    'replacement_solver_grid_declared_sources_remain_native',
  );
  assert.deepEqual(protocol.solverMesh, {
    state: 'replacement_solver_contract_frozen_execution_blocked',
    contractId: 'cumbria-public-surface-flow-replacement-v0',
    horizontalCrs: 'EPSG:27700',
    verticalDatum: 'Ordnance Datum Newlyn',
    extent: [332000, 556000, 340000, 563000],
    originUpperLeft: [332000, 563000],
    primary: {
      cellSizeMetres: 20,
      width: 400,
      height: 350,
      cellCount: 140000,
    },
    sensitivityCellSizesMetres: [10, 40],
    timeIntegration: 'adaptive_cfl',
    h3Role: 'not_source_or_solver_grid',
    executionAuthorized: false,
    blockers: [
      'domain_solver_grids_not_materialized',
      'numerical_kernel_not_fixture_verified',
      'prediction_identity_not_frozen',
    ],
  });
});

test('replacement solver freezes assumptions and sensitivities before evaluation access', () => {
  const manifest = manifestFixture();
  const protocol = manifest.replacementSolverProtocol;

  assert.equal(protocol.state, 'contract_frozen_preprocessing_and_kernel_blocked');
  assert.equal(
    protocol.protocolSha256,
    cumbriaReplacementSolverProtocolSha256(protocol),
  );
  assert.deepEqual(protocol.domain.bounds, [332000, 556000, 340000, 563000]);
  assert.deepEqual(protocol.meshes.primary, {
    id: 'mesh-20m',
    role: 'primary',
    cellSizeMetres: 20,
    width: 400,
    height: 350,
    cellCount: 140000,
  });
  assert.deepEqual(
    protocol.meshes.sensitivities.map((mesh) => mesh.cellSizeMetres),
    [10, 40],
  );
  assert.equal(protocol.forcing.landCoverParameters.classes.length, 12);
  assert.equal(
    protocol.forcing.riverInflow.dischargeTransformation,
    'positive_excess_above_first_window_sample',
  );
  assert.equal(
    protocol.initialState.semantic,
    'explicit_dry_surface_assumption_not_observation',
  );
  assert.equal(protocol.outputs.wetness.primaryThresholdM, 0.05);
  assert.equal(protocol.scenarios.length, 9);
  assert.equal(protocol.scenarioPolicy.bestScenarioSelectionForbidden, true);
  assert.equal(protocol.isolation.observedFloodGeometryLoaded, false);
  assert.equal(protocol.execution.solverExecutionAllowed, false);
  assert.equal(protocol.execution.evaluationReferenceAccessAllowed, false);

  const h3Routing = manifestFixture();
  h3Routing.replacementSolverProtocol.domain.h3Role = 'solver_grid';
  assert.throws(
    () => assertCumbriaAccessManifest(h3Routing),
    /replacement solver H3 role/,
  );

  const unboundedRunoff = manifestFixture();
  unboundedRunoff.replacementSolverProtocol.forcing.landCoverParameters.classes[0]
    .runoffCoefficient.high = 1.1;
  assert.throws(
    () => assertCumbriaAccessManifest(unboundedRunoff),
    /physically bounded/,
  );

  const evaluationLeak = manifestFixture();
  evaluationLeak.replacementSolverProtocol.execution.evaluationReferenceAccessAllowed =
    true;
  assert.throws(
    () => assertCumbriaAccessManifest(evaluationLeak),
    /evaluation access gate/,
  );
});

test('spatial protocol rejects false precision and invented solver geometry', () => {
  const wrongResolution = manifestFixture();
  wrongResolution.spatialGridProtocol.evidenceIndex.resolution = 12;
  assert.throws(
    () => assertCumbriaAccessManifest(wrongResolution),
    /evidence index resolution/,
  );

  const routingOnH3 = manifestFixture();
  routingOnH3.spatialGridProtocol.evidenceIndex.physicalRoutingAllowed = true;
  assert.throws(
    () => assertCumbriaAccessManifest(routingOnH3),
    /evidence index routing policy/,
  );

  const interpolatedClasses = manifestFixture();
  interpolatedClasses.spatialGridProtocol.sourceGrids.landCover.categoricalInterpolation =
    'bilinear';
  assert.throws(
    () => assertCumbriaAccessManifest(interpolatedClasses),
    /land-cover interpolation policy/,
  );

  const inventedMesh = manifestFixture();
  inventedMesh.spatialGridProtocol.solverMesh.primary.cellSizeMetres = 2;
  assert.throws(
    () => assertCumbriaAccessManifest(inventedMesh),
    /solver primary cellSizeMetres/,
  );

  const driftedEnvelope = manifestFixture();
  driftedEnvelope.spatialGridProtocol.evidenceIndex.envelopeBounds[0] = -3.04;
  assert.throws(
    () => assertCumbriaAccessManifest(driftedEnvelope),
    /must use the frozen hydraulic protocol envelope/,
  );

  const fixtureLeakage = manifestFixture();
  fixtureLeakage.spatialGridProtocol.evidenceIndex.composition.syntheticFixtureCannotEnterRealMode =
    false;
  assert.throws(
    () => assertCumbriaAccessManifest(fixtureLeakage),
    /evidence composition fixture isolation/,
  );

  const solverPromotion = manifestFixture();
  solverPromotion.spatialGridProtocol.evidenceIndex.composition.realEvidenceProbe.isolation.solverExecutionAuthorized =
    true;
  assert.throws(
    () => assertCumbriaAccessManifest(solverPromotion),
    /real probe solver gate/,
  );
});

test('event-valid river context remains distinct from a hydraulic network', () => {
  const manifest = manifestFixture();
  const hydrography = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-wfd-river-water-bodies-cycle-1',
  );

  assert.equal(hydrography.temporalRelation, 'pre_event');
  assert.equal(hydrography.access.state, 'remote_verified');
  assert.equal(hydrography.facts.eventValid, true);
  assert.equal(hydrography.facts.completeRiverNetwork, false);
  assert.equal(hydrography.hydrographyAudit.numberMatched, 16);
  assert.equal(hydrography.hydrographyAudit.numberReturned, 16);
  assert.equal(hydrography.hydrographyAudit.geometryClippedToAoi, false);
  assert.equal(
    hydrography.hydrographyAudit.selectionSha256,
    '29cb9324f4ecb25324e893e3bbe07324c6df877f475de922476c9eba19a21a13',
  );
  assert.equal(
    hydrography.hydrographyAudit.classification,
    'event_valid_context_only',
  );

  hydrography.facts.completeRiverNetwork = true;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /completeRiverNetwork/,
  );
});

test('four complete upstream hydrographs remain candidate boundaries', () => {
  const manifest = manifestFixture();
  const boundarySeries = manifest.datasets.filter((dataset) =>
    [
      'ea-hydrology-great-corby-flow',
      'ea-hydrology-greenholme-flow',
      'ea-hydrology-cummersdale-flow',
      'ea-hydrology-newbiggin-bridge-flow',
    ].includes(dataset.id),
  );

  assert.deepEqual(
    boundarySeries.map((dataset) => dataset.seriesAudit.station),
    ['Great Corby', 'Greenholme', 'Cummersdale', 'Newbiggin Bridge'],
  );
  assert.deepEqual(
    boundarySeries.map((dataset) => dataset.seriesAudit.maximum),
    [1486.39, 228.795, 279.159, 97.426],
  );
  for (const dataset of boundarySeries) {
    assert.equal(dataset.role, 'model_input_candidate');
    assert.equal(dataset.temporalRelation, 'event_window');
    assert.equal(dataset.permittedUses.modelInput, true);
    assert.equal(dataset.permittedUses.calibration, false);
    assert.equal(dataset.seriesAudit.readings, 288);
    assert.equal(dataset.seriesAudit.missingReadings, 0);
  }

  const missingIrthing = manifestFixture();
  missingIrthing.datasets = missingIrthing.datasets.filter(
    (dataset) => dataset.id !== 'ea-hydrology-greenholme-flow',
  );
  assert.throws(
    () => assertCumbriaAccessManifest(missingIrthing),
    /Missing required Cumbria dataset "ea-hydrology-greenholme-flow"/,
  );
});

test('local hydraulic protocol freezes upstream inputs without inventing missing physics', () => {
  const manifest = manifestFixture();
  const protocol = manifest.hydraulicProtocol;

  assert.equal(protocol.state, 'frozen_inputs_blocked_execution');
  assert.deepEqual(protocol.domainEnvelope.bounds, [-3.05, 54.82, -2.8, 55]);
  assert.equal(
    protocol.domainEnvelope.role,
    'boundary_protocol_envelope_not_final_mesh',
  );
  assert.equal(protocol.domainEnvelope.finalMeshFrozen, false);
  assert.deepEqual(
    protocol.upstreamBoundaries.map((boundary) => ({
      id: boundary.id,
      stationReference: boundary.stationReference,
      quantity: boundary.quantity,
      unit: boundary.unit,
      resampling: boundary.samplePolicy.resampling,
      placement: boundary.placement.state,
    })),
    [
      {
        id: 'eden-great-corby',
        stationReference: '762505',
        quantity: 'discharge',
        unit: 'm3/s',
        resampling: 'native_samples_only',
        placement: 'blocked_missing_channel_geometry',
      },
      {
        id: 'irthing-greenholme',
        stationReference: '763308',
        quantity: 'discharge',
        unit: 'm3/s',
        resampling: 'native_samples_only',
        placement: 'blocked_missing_channel_geometry',
      },
      {
        id: 'caldew-cummersdale',
        stationReference: '765013',
        quantity: 'discharge',
        unit: 'm3/s',
        resampling: 'native_samples_only',
        placement: 'blocked_missing_channel_geometry',
      },
      {
        id: 'petteril-newbiggin-bridge',
        stationReference: '764050',
        quantity: 'discharge',
        unit: 'm3/s',
        resampling: 'native_samples_only',
        placement: 'blocked_missing_channel_geometry',
      },
    ],
  );
  assert.equal(protocol.downstreamBoundary.state, 'missing');
  assert.equal(
    protocol.downstreamBoundary.sheepmountUse,
    'observation_comparison_only_not_boundary',
  );
  assert.equal(
    protocol.downstreamBoundary.screenedCandidate.classification,
    'rejected_groundwater_measure_not_surface_water_boundary',
  );
  assert.deepEqual(protocol.downstreamBoundary.historicalModelLimit, {
    sourceDatasetId: 'cumberland-carlisle-sfra-2011-main-and-appendix-c',
    location: 'Old Sandsfield',
    sourceGridReference: 'NY332617',
    coordinate: {
      crs: 'EPSG:27700',
      easting: 333200,
      northing: 561700,
    },
    derivedWgs84: {
      crs: 'EPSG:4326',
      lon: -3.044369,
      lat: 54.945463,
      transformation: 'proj4-bng-to-wgs84-v0',
    },
    sourceTidalRelation: 'upstream_of_tidal_limits',
    relation: 'historical_model_limit_without_boundary_values',
  });
  assert.equal(
    protocol.downstreamBoundary.stationSearch.stationAtHistoricalLimit,
    false,
  );
  assert.equal(protocol.initialState.state, 'missing');
  assert.equal(
    protocol.initialState.firstUpstreamSamplesDefineDistributedState,
    false,
  );
  assert.equal(protocol.localForcing.doubleCountingForbidden, true);
  assert.equal(
    protocol.localForcing.upstreamCatchmentsRepresentedByHydrographsExcluded,
    true,
  );
  assert.equal(protocol.evaluationIsolation.geometryLoaded, false);
  assert.equal(protocol.execution.state, 'blocked');
  assert.deepEqual(protocol.execution.blockers, [
    'event_valid_channel_and_defence_geometry_missing',
    'upstream_boundary_placement_missing',
    'downstream_boundary_missing',
    'distributed_initial_state_missing',
    'final_mesh_and_timestep_missing',
    'pre_event_terrain_incomplete',
  ]);
});

test('hydraulic protocol rejects interpolation, double counting and invented boundaries', () => {
  const resampled = manifestFixture();
  resampled.hydraulicProtocol.upstreamBoundaries[0].samplePolicy.resampling =
    'linear_interpolation';
  assert.throws(
    () => assertCumbriaAccessManifest(resampled),
    /samplePolicy.resampling/,
  );

  const doubleCounted = manifestFixture();
  doubleCounted.hydraulicProtocol.localForcing
    .upstreamCatchmentsRepresentedByHydrographsExcluded = false;
  assert.throws(
    () => assertCumbriaAccessManifest(doubleCounted),
    /upstreamCatchmentsRepresentedByHydrographsExcluded/,
  );

  const inventedDownstream = manifestFixture();
  inventedDownstream.hydraulicProtocol.downstreamBoundary.state = 'available';
  assert.throws(
    () => assertCumbriaAccessManifest(inventedDownstream),
    /downstreamBoundary.state/,
  );

  const inventedInitialState = manifestFixture();
  inventedInitialState.hydraulicProtocol.initialState
    .firstUpstreamSamplesDefineDistributedState = true;
  assert.throws(
    () => assertCumbriaAccessManifest(inventedInitialState),
    /firstUpstreamSamplesDefineDistributedState/,
  );
});

test('Willow Holme keeps its official station reference distinct from its UUID', () => {
  const manifest = manifestFixture();
  const rainfall = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-hydrology-willow-holme-rainfall',
  );

  assert.equal(rainfall.seriesAudit.stationReference, '606299');
  assert.match(
    rainfall.seriesAudit.measureNotation,
    /^026196fb-dc64-4e06-bc2b-ce360bd65a0a-/,
  );

  rainfall.seriesAudit.stationReference =
    '026196fb-dc64-4e06-bc2b-ce360bd65a0a';
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /Willow Holme station reference/,
  );
});

test('current AIMS defences cannot masquerade as the 2015 defence state', () => {
  const manifest = manifestFixture();
  const defences = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-aims-current-spatial-flood-defences',
  );

  assert.equal(defences.role, 'context_only');
  assert.equal(defences.temporalRelation, 'current_context');
  assert.deepEqual(defences.permittedUses, {
    modelInput: false,
    calibration: false,
    observationComparison: false,
    evaluation: false,
  });
  assert.deepEqual(
    {
      returned: defences.defenceContextAudit.numberReturned,
      dated: defences.defenceContextAudit.withAssetStartDate,
      nominallyPreEvent:
        defences.defenceContextAudit.operationalBeforeEventByStartDateOnly,
      missingStartDate: defences.defenceContextAudit.missingAssetStartDate,
      postEventStarts:
        defences.defenceContextAudit.assetStartDateOnOrAfterEvent,
      postEventRefurbishments:
        defences.defenceContextAudit.lastRefurbishedAfter2015,
    },
    {
      returned: 291,
      dated: 177,
      nominallyPreEvent: 121,
      missingStartDate: 114,
      postEventStarts: 56,
      postEventRefurbishments: 4,
    },
  );
  assert.equal(
    defences.defenceContextAudit.classification,
    'current_context_only',
  );

  defences.permittedUses.modelInput = true;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /context-only evidence cannot enter computation/,
  );
});

test('current AIMS channels remain context rather than solver geometry', () => {
  const manifest = manifestFixture();
  const channels = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-aims-channel-current',
  );

  assert.equal(channels.role, 'context_only');
  assert.equal(channels.temporalRelation, 'current_context');
  assert.deepEqual(channels.channelContextAudit.assetSubtypeCounts, {
    'Complex Culvert': 29,
    'Open Channel': 91,
    'Simple Culvert': 229,
  });
  assert.equal(channels.channelContextAudit.numberReturned, 349);
  assert.equal(channels.channelContextAudit.missingAssetStartDate, 272);
  assert.equal(channels.channelContextAudit.crossSectionsIncluded, false);
  assert.equal(channels.channelContextAudit.bedElevationIncluded, false);
  assert.equal(channels.channelContextAudit.roughnessIncluded, false);

  channels.permittedUses.modelInput = true;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /context-only evidence cannot enter computation/,
  );
});

test('historical Carlisle domain lineage is explicit without asserting boundary placement', () => {
  const manifest = manifestFixture();
  const domain = manifest.datasets.find(
    (dataset) =>
      dataset.id === 'cumberland-carlisle-sfra-2011-main-and-appendix-c',
  );

  assert.deepEqual(
    domain.hydraulicDomainLineageAudit.upstreamLimits.map((limit) => [
      limit.watercourse,
      limit.location,
      limit.placementVerified,
    ]),
    [
      ['River Eden', 'Wetheral Railway Bridge', false],
      ['River Irthing', 'Greenholme Weir', false],
      ['River Petteril', 'Scalesceugh', false],
      ['River Caldew', 'Cummersdale Railway Bridge', false],
    ],
  );
  assert.equal(
    domain.hydraulicDomainLineageAudit.downstreamLimit.location,
    'Old Sandsfield',
  );
  assert.equal(
    domain.hydraulicDomainLineageAudit.downstreamLimit.boundaryValuesAttached,
    false,
  );

  domain.hydraulicDomainLineageAudit.upstreamLimits[1].placementVerified = true;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /SFRA upstream placement state/,
  );
});

test('flood-model catalogue freezes request identities but excludes post-event models', () => {
  const manifest = manifestFixture();
  const catalogue = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-flood-model-locations',
  );

  assert.equal(catalogue.access.state, 'remote_verified');
  assert.equal(catalogue.floodModelCatalogAudit.numberReturned, 19);
  assert.deepEqual(
    catalogue.floodModelCatalogAudit.coreModels.map((model) => [
      model.id,
      model.temporalUse,
    ]),
    [
      [1313, 'pre_event_lineage_only'],
      [1314, 'pre_event_lineage_only'],
      [1797, 'pre_event_lineage_only'],
      [2039, 'post_event_excluded'],
      [8323, 'pre_event_lineage_only'],
      [9458, 'post_event_excluded'],
    ],
  );
  assert.equal(catalogue.floodModelCatalogAudit.modelFilesIncluded, false);
  assert.equal(catalogue.floodModelCatalogAudit.modelOutputsIncluded, false);

  catalogue.floodModelCatalogAudit.coreModels[3].temporalUse =
    'pre_event_lineage_only';
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /Flood-model core identities drifted/,
  );
});

test('pre-event hydraulic model lineage does not become a runnable model', () => {
  const manifest = manifestFixture();
  const lineage = manifest.datasets.find(
    (dataset) => dataset.id === 'cumberland-carlisle-sfra-2011-appendix-d',
  );

  assert.equal(lineage.temporalRelation, 'pre_event');
  assert.deepEqual(lineage.hydraulicModelLineageAudit.modelComponents, [
    'ISIS 1D',
    'TUFLOW 2D',
  ]);
  assert.equal(lineage.hydraulicModelLineageAudit.reportedFloodgates, 23);
  assert.equal(
    lineage.hydraulicModelLineageAudit.machineReadableModelFilesAttached,
    false,
  );
  assert.equal(
    lineage.hydraulicModelLineageAudit.classification,
    'pre_event_model_lineage_only',
  );
});

test('model access request asks for Products 5, 6 and 7 without evaluation leakage', () => {
  const manifest = manifestFixture();
  const request = manifest.modelAccessRequest;

  assert.equal(request.state, 'sent_awaiting_response');
  assert.equal(request.sentAt, '2026-09-02T11:36:32Z');
  assert.equal(request.transport, 'email');
  assert.equal(request.responseState, 'awaiting_response');
  assert.equal(request.recipient, 'enquiries@environment-agency.gov.uk');
  assert.deepEqual(
    request.products.map((product) => [product.number, product.scope]),
    [
      [5, 'model_and_hydrology_reports'],
      [6, 'model_outputs_and_product_5_reports'],
      [7, 'model_input_data_and_product_5_reports'],
    ],
  );
  assert.deepEqual(request.modelGroupIds, [1313, 1314, 1797, 8323]);
  assert.deepEqual(request.explicitlyExcludedModelGroupIds, [2039, 9458]);
  assert.equal(request.product4Requested, false);
  assert.equal(request.observedEventGeometryRequested, false);
  assert.equal(request.acceptPostEventModelAsReplayInput, false);
  assert.equal(request.requestNativeArchivedVersions, true);
  assert.equal(request.intakePolicy.incompleteDeliveryRemainsMissing, true);

  request.modelGroupIds[0] = 2039;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /pre-event group identities drifted/,
  );
});

test('model access request rejects Product 4 and post-event replay input', () => {
  const product4 = manifestFixture();
  product4.modelAccessRequest.product4Requested = true;
  assert.throws(
    () => assertCumbriaAccessManifest(product4),
    /modelAccessRequest.product4Requested/,
  );

  const postEventInput = manifestFixture();
  postEventInput.modelAccessRequest.acceptPostEventModelAsReplayInput = true;
  assert.throws(
    () => assertCumbriaAccessManifest(postEventInput),
    /acceptPostEventModelAsReplayInput/,
  );
});

test('model delivery intake is ready without claiming a received package', () => {
  const manifest = manifestFixture();
  const protocol = manifest.modelDeliveryIntakeProtocol;

  assert.equal(protocol.state, 'ready_no_delivery_received');
  assert.equal(protocol.intakeKind, 'cumbria-model');
  assert.deepEqual(protocol.acceptedProductNumbers, [5, 6, 7]);
  assert.deepEqual(protocol.acceptedModelGroupIds, [1313, 1314, 1797, 8323]);
  assert.deepEqual(protocol.excludedModelGroupIds, [2039, 9458]);
  assert.equal(protocol.originalFilesStayOutsideGit, true);
  assert.equal(protocol.originalsCopiedByIntake, false);
  assert.equal(protocol.archivesExtractedByIntake, false);
  assert.equal(protocol.packageReceived, false);
  assert.equal(protocol.scientificReviewCompleted, false);
  assert.equal(protocol.automaticReplayPromotion, false);
  assert.equal(protocol.evaluationReferenceSeal, 'must_remain_closed');

  protocol.packageReceived = true;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /modelDeliveryIntakeProtocol.packageReceived/,
  );

  const componentDrift = manifestFixture();
  componentDrift.modelDeliveryIntakeProtocol.declaredComponentIds =
    componentDrift.modelDeliveryIntakeProtocol.declaredComponentIds.slice(1);
  assert.throws(
    () => assertCumbriaAccessManifest(componentDrift),
    /component identities drifted/,
  );

  const gateRequirementDrift = manifestFixture();
  gateRequirementDrift.modelDeliveryIntakeProtocol.requiredForGateAssessment =
    gateRequirementDrift.modelDeliveryIntakeProtocol.requiredForGateAssessment.slice(1);
  assert.throws(
    () => assertCumbriaAccessManifest(gateRequirementDrift),
    /gate requirements drifted/,
  );
});

test('terrain identity passes while bulk acquisition remains physically gated', () => {
  const manifest = manifestFixture();
  const gates = new Map(
    manifest.gates.map((gate) => [gate.id, gate.state]),
  );

  assert.equal(gates.get('pre_event_lidar_tiles'), 'passed');
  assert.equal(gates.get('dtm_materialization_protocol'), 'passed');
  assert.equal(gates.get('spatial_grid_roles'), 'passed');
  assert.equal(gates.get('spatial_evidence_composition'), 'passed');
  assert.equal(gates.get('blind_evaluation_protocol'), 'passed');
  assert.equal(gates.get('upstream_boundary_series'), 'passed');
  assert.equal(gates.get('hydraulic_model_access_request'), 'passed');
  assert.equal(gates.get('model_delivery_intake'), 'passed');
  assert.equal(gates.get('replacement_solver_contract'), 'passed');
  assert.equal(gates.get('as_of_event_defence_state'), 'blocked');
  assert.equal(gates.get('hydraulic_context'), 'blocked');
  assert.equal(gates.get('evaluation_geometry_identity'), 'blocked');
  assert.equal(gates.get('large_artifact_downloads'), 'blocked');
  assert.equal(gates.get('evaluation_withholding'), 'passed');
});
