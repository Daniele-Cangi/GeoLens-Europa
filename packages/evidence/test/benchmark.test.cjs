const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { assertHistoricalBenchmarkManifest } = require('../dist');

const manifestPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tests',
  'ground-truth',
  'emilia-romagna-2023',
  'manifest.json',
);

function manifestFixture() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

test('Emilia-Romagna manifest passes the historical benchmark contract', () => {
  const manifest = manifestFixture();

  assert.doesNotThrow(() => assertHistoricalBenchmarkManifest(manifest));
  assert.equal(manifest.benchmark.state, 'data_audit');
  assert.equal(
    manifest.benchmark.replayMode,
    'retrospective_reconstruction',
  );
  assert.equal(manifest.benchmark.claimLevel, 'hydrologic_routing');
  assert.equal(manifest.manifestVersion, '1.9.0');
  assert.ok(manifest.benchmark.forbiddenClaims.includes('validated_water_depth'));
});

test('terrain-routing baseline is materialized without evaluation leakage', () => {
  const manifest = manifestFixture();
  const baseline = manifest.benchmark.routingBaselines.find(
    (candidate) => candidate.id === 'forli-terrain-d8-v0',
  );

  assert.equal(baseline.state, 'materialized');
  assert.equal(baseline.semantics, 'terrain_flow_concentration');
  assert.equal(baseline.evaluationReferenceAccess, 'withheld');
  assert.equal(baseline.quality, 'incomplete_window');
  assert.equal(baseline.localArtifacts.length, 4);
  assert.match(baseline.methodologyNote, /not inundation/);
});

test('event-runoff baseline freezes real evidence and physical outputs', () => {
  const manifest = manifestFixture();
  const baseline = manifest.benchmark.routingBaselines.find(
    (candidate) => candidate.id === 'forli-imerg-runoff-d8-v0',
  );
  const imerg = manifest.datasets.find(
    (candidate) => candidate.id === 'nasa-imerg-v07',
  );

  assert.equal(baseline.semantics, 'event_runoff_flow_concentration');
  assert.equal(baseline.evaluationReferenceAccess, 'withheld');
  assert.equal(baseline.quality, 'incomplete_window');
  assert.equal(baseline.localArtifacts.length, 5);
  assert.deepEqual(baseline.inputDatasetIds, [
    'nasa-imerg-v07',
    'copernicus-clc-2018',
    'copernicus-dem-glo-30-2022',
    'rer-dbtr-forli-cutoff-2023',
  ]);
  assert.equal(imerg.acquisitionStatus, 'downloaded_verified');
  assert.equal(imerg.localArtifacts.length, 3);
  assert.match(baseline.methodologyNote, /not inundation/);
});

test('blind concentration evaluation protocol is frozen before V7 access', () => {
  const manifest = manifestFixture();
  const protocol = manifest.benchmark.evaluationProtocols.find(
    (candidate) => candidate.id === 'forli-event-runoff-concentration-v0',
  );

  assert.equal(protocol.state, 'protocol_frozen');
  assert.equal(protocol.predictionBaselineId, 'forli-imerg-runoff-d8-v0');
  assert.equal(protocol.evaluationDatasetId, 'rer-flood-extent-v7-event-2');
  assert.equal(protocol.evaluationReferenceAccessAtFreeze, 'not_loaded');
  assert.equal(protocol.calibration, false);
  assert.equal(protocol.calibrationPolicy, 'none');
  assert.equal(protocol.domain.primaryBufferM, 0);
  assert.deepEqual(protocol.metrics, [
    'roc_auc',
    'average_precision',
    'tie_weighted_overlap_at_frozen_area_fractions',
  ]);
  assert.deepEqual(protocol.areaFractions, [0.01, 0.05, 0.1, 0.2]);
  assert.match(protocol.methodologyNote, /do not convert concentration/);
});

test('ARPAE observation comparison is frozen before event-value access', () => {
  const manifest = manifestFixture();
  const protocol = manifest.benchmark.observationComparisonProtocols.find(
    (candidate) => candidate.id === 'forli-arpae-observation-comparison-v0',
  );

  assert.equal(protocol.state, 'protocol_frozen');
  assert.equal(protocol.dext3rEventSeriesAccessAtFreeze, 'catalog_only');
  assert.equal(protocol.calibration, false);
  assert.deepEqual(protocol.window, {
    start: '2023-05-16T00:00:00Z',
    endExclusive: '2023-05-18T00:00:00Z',
    timezone: 'UTC',
  });
  assert.deepEqual(
    protocol.rainfall.stations.map((station) => station.stationId),
    [
      '-/1204182,4422039/urbane',
      '-/1199295,4426279/spdsra',
    ],
  );
  assert.deepEqual(
    protocol.hydrometry.stations.map((station) => station.stationId),
    [
      '-/1194940,4417012/spdsra',
      '-/1202757,4422698/spdsra',
      '-/1199295,4426279/spdsra',
      '-/1203134,4433002/spdsra',
      '-/1198305,4410502/spdsra',
    ],
  );
  assert.equal(
    protocol.rainfall.missingPolicy,
    'missing_or_incomplete_not_zero',
  );
  assert.equal(protocol.hydrometry.noCrossStationDatumArithmetic, true);
  assert.match(protocol.methodologyNote, /not claimed as blind/);
});

test('ARPAE comparison rejects calibration, silent zero and datum mixing', () => {
  const calibrated = manifestFixture();
  calibrated.benchmark.observationComparisonProtocols[0].calibration = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(calibrated),
    /must not calibrate from observations/,
  );

  const silentZero = manifestFixture();
  silentZero.benchmark.observationComparisonProtocols[0].rainfall
    .missingPolicy = 'missing_as_zero';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(silentZero),
    /missing data must not become zero/,
  );

  const mixedDatums = manifestFixture();
  mixedDatums.benchmark.observationComparisonProtocols[0].hydrometry
    .noCrossStationDatumArithmetic = false;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(mixedDatums),
    /forbid arithmetic across station datums/,
  );

  const unknownSource = manifestFixture();
  unknownSource.benchmark.observationComparisonProtocols[0]
    .observationDatasetId = 'unknown-observation-source';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unknownSource),
    /references unknown observation dataset/,
  );
});

test('ARPAE comparison run materializes rain and explicit stage gaps', () => {
  const manifest = manifestFixture();
  const run = manifest.benchmark.observationComparisonRuns[0];

  assert.equal(run.observationAccess, 'loaded_after_protocol_freeze');
  assert.equal(run.calibration, false);
  assert.equal(run.quality, 'available_with_incomplete_hydrometry');
  assert.equal(run.rainfall[0].gaugeTotalMm, 113.8);
  assert.equal(run.rainfall[0].imergMinusGaugeMm, -9.5799987793);
  assert.equal(run.rainfall[1].gaugeTotalMm, 131);
  assert.equal(run.rainfall[1].imergMinusGaugeMm, -42.9100036621);
  assert.equal(run.hydrometry.find((item) => item.name === "Forli'").missingRecordCount, 124);
  assert.equal(run.hydrometry.find((item) => item.name === 'Predappio').missingRecordCount, 117);
  assert.equal(run.localArtifacts.length, 1);
});

test('ARPAE comparison run rejects calibration, zero coercion and metric drift', () => {
  const calibrated = manifestFixture();
  calibrated.benchmark.observationComparisonRuns[0].calibration = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(calibrated),
    /must not calibrate from observations/,
  );

  const coerced = manifestFixture();
  coerced.benchmark.observationComparisonRuns[0].missingValuePolicy =
    'blank_source_value_is_zero';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(coerced),
    /preserve blank\/missing and numeric-zero semantics/,
  );

  const drifted = manifestFixture();
  drifted.benchmark.observationComparisonRuns[0].rainfall[0]
    .imergMinusGaugeMm = 0;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(drifted),
    /IMERG minus gauge is inconsistent/,
  );
});

test('evaluation protocol rejects leakage, calibration and unpinned predictions', () => {
  const loaded = manifestFixture();
  loaded.benchmark.evaluationProtocols[0].evaluationReferenceAccessAtFreeze =
    'loaded';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(loaded),
    /freeze before loading evaluation data/,
  );

  const calibrated = manifestFixture();
  calibrated.benchmark.evaluationProtocols[0].calibration = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(calibrated),
    /must not calibrate on evaluation data/,
  );

  const unpinned = manifestFixture();
  unpinned.benchmark.evaluationProtocols[0].predictionArtifacts
    .accumulatedRunoffVolume = 'derived/event-runoff/unpinned.bin';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unpinned),
    /is not pinned by its routing baseline/,
  );

  const inputReference = manifestFixture();
  const v7 = inputReference.datasets.find(
    (dataset) => dataset.id === 'rer-flood-extent-v7-event-2',
  );
  v7.role = 'model_input';
  v7.allowedUses.modelInput = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(inputReference),
    /cannot be used for model input or calibration/,
  );
});

test('blind evaluation run retains a negative result without changing claims', () => {
  const manifest = manifestFixture();
  const run = manifest.benchmark.evaluationRuns.find(
    (candidate) =>
      candidate.id === 'forli-event-runoff-concentration-v0-v7-event2',
  );

  assert.equal(run.evaluationReferenceAccess, 'loaded_after_protocol_freeze');
  assert.equal(run.calibration, false);
  assert.equal(
    run.claimLevel,
    'hydrologic_routing_spatial_ranking_diagnostics',
  );
  assert.equal(run.counts.sourceFeatureCount, 2022);
  assert.equal(run.counts.evaluatedCells, 130307);
  assert.equal(run.results.rocAuc, 0.49162439445221917);
  assert.equal(run.results.averagePrecision, 0.2776793857866033);
  assert.equal(run.localArtifacts.length, 2);
  assert.match(run.methodologyNote, /near-random result/);
});

test('evaluation run rejects post-freeze drift and inconsistent metrics', () => {
  const calibrated = manifestFixture();
  calibrated.benchmark.evaluationRuns[0].calibration = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(calibrated),
    /must not calibrate on evaluation data/,
  );

  const unknownProtocol = manifestFixture();
  unknownProtocol.benchmark.evaluationRuns[0].protocolId = 'unknown';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unknownProtocol),
    /references unknown evaluation protocol/,
  );

  const driftedFraction = manifestFixture();
  driftedFraction.benchmark.evaluationRuns[0].results
    .overlapAtFrozenAreaFractions[0].areaFraction = 0.02;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(driftedFraction),
    /internally inconsistent|area fractions drifted/,
  );

  const falsePrevalence = manifestFixture();
  falsePrevalence.benchmark.evaluationRuns[0].results.observedPrevalence = 0.5;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(falsePrevalence),
    /prevalence disagrees with counts/,
  );

  const impossibleThresholdGroup = manifestFixture();
  const overlap = impossibleThresholdGroup.benchmark.evaluationRuns[0]
    .results.overlapAtFrozenAreaFractions[0];
  overlap.fullCellsAboveThreshold = 1303;
  overlap.cellsEqualThreshold = 130000;
  overlap.fractionalTieWeight = 0.07 / 130000;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(impossibleThresholdGroup),
    /threshold-group counts exceed evaluated cells/,
  );
});

test('routing baselines reject evaluation inputs and unwithheld references', () => {
  const leakedInput = manifestFixture();
  const baseline = leakedInput.benchmark.routingBaselines[0];
  baseline.inputDatasetIds.push('rer-flood-extent-v7-event-2');
  assert.throws(
    () => assertHistoricalBenchmarkManifest(leakedInput),
    /not an eligible model input/,
  );

  const unwithheld = manifestFixture();
  unwithheld.benchmark.routingBaselines[0].evaluationReferenceAccess =
    'loaded';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unwithheld),
    /must keep evaluation reference withheld/,
  );
});

test('benchmark freezes the common metric grid and mask policy', () => {
  const manifest = manifestFixture();
  const protocol = manifest.benchmark.spatialProtocol;

  assert.deepEqual(protocol.coverage.commonBounds, [
    11.98,
    44.17,
    12.1,
    44.28,
  ]);
  assert.deepEqual(protocol.grid, {
    crs: 'EPSG:32632',
    cellSizeM: 30,
    bounds: [737790, 4895070, 747840, 4907670],
    width: 335,
    height: 420,
    rowOrder: 'north_to_south',
    inclusion: 'cell_center_inside_common_bounds',
    h3RepresentationResolution: 11,
  });
  assert.equal(protocol.boundaryTolerance.primaryOverlapBufferM, 0);
  assert.equal(protocol.boundaryTolerance.secondaryToleranceM, 30);
  assert.equal(
    protocol.masks.evaluationReference,
    'withheld_until_prediction_is_frozen',
  );
});

test('benchmark rejects grid drift and evaluation leakage', () => {
  const wrongDimensions = manifestFixture();
  wrongDimensions.benchmark.spatialProtocol.grid.width = 334;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(wrongDimensions),
    /grid dimensions do not match/,
  );

  const bufferedPrimary = manifestFixture();
  bufferedPrimary.benchmark.spatialProtocol.boundaryTolerance
    .primaryOverlapBufferM = 30;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(bufferedPrimary),
    /primary overlap metrics must remain unbuffered/,
  );

  const leakedReference = manifestFixture();
  leakedReference.benchmark.spatialProtocol.masks.evaluationReference =
    'load_before_prediction';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(leakedReference),
    /evaluation reference must remain withheld/,
  );
});

test('spatial coverage references declared datasets only', () => {
  const manifest = manifestFixture();
  manifest.benchmark.spatialProtocol.coverage.verifiedDatasetIds.push(
    'undeclared-dataset',
  );

  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /spatial coverage references unknown dataset/,
  );
});
test('physical DBTR masks retain source and temporal limitations', () => {
  const manifest = manifestFixture();
  const xdbtr = manifest.datasets.find(
    (dataset) => dataset.id === 'rer-dbtr-forli-cutoff-2023',
  );

  assert.equal(xdbtr.role, 'model_input');
  assert.equal(xdbtr.acquisitionStatus, 'downloaded_verified');
  assert.match(xdbtr.accessMethod, /GeoPackage extraction/);
  assert.match(xdbtr.methodologyNote, /zero does not assert historical absence/);
  assert.match(xdbtr.methodologyNote, /incomplete_window/);
  assert.equal(
    xdbtr.localArtifacts.some((artifact) =>
      artifact.relativePath.endsWith('.gpkg'),
    ),
    true,
  );
  assert.equal(
    xdbtr.localArtifacts.some((artifact) =>
      artifact.relativePath.includes('known-center-mask'),
    ),
    true,
  );
  assert.equal(
    xdbtr.localArtifacts.some((artifact) =>
      artifact.relativePath.includes('styled-map'),
    ),
    false,
  );
  assert.deepEqual(
    manifest.benchmark.spatialProtocol.masks.permanentWater,
    {
      datasetId: 'rer-dbtr-forli-cutoff-2023',
      layer: 'V_SDA_GPG',
      treatment: 'exclude_from_land_routing_metrics_and_report',
    },
  );
});

test('post-event evidence is structurally excluded from model and calibration', () => {
  const manifest = manifestFixture();
  const reference = manifest.datasets.find(
    (dataset) => dataset.id === 'rer-flood-extent-v7-event-2',
  );

  assert.equal(reference.role, 'evaluation_reference');
  assert.equal(reference.temporalRelation, 'post_event');
  assert.deepEqual(reference.allowedUses, {
    modelInput: false,
    calibration: false,
    evaluation: true,
  });

  reference.allowedUses.modelInput = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /cannot be used for model input or calibration/,
  );
});

test('Copernicus P06 is comparison evidence rather than independent ground truth', () => {
  const manifest = manifestFixture();
  const copernicus = manifest.datasets.find(
    (dataset) => dataset.id === 'copernicus-emsn154-p04-p06',
  );

  assert.equal(copernicus.role, 'comparison_reference');
  assert.equal(copernicus.allowedUses.modelInput, false);
  assert.match(copernicus.methodologyNote, /not independent ground truth/);
});

test('local artifact paths must remain portable and content-addressed', () => {
  const manifest = manifestFixture();
  const dataset = manifest.datasets.find(
    (candidate) => candidate.localArtifacts?.length > 0,
  );

  dataset.localArtifacts[0].relativePath = 'D:/private/source.zip';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /portable relative path/,
  );

  const invalidDigest = manifestFixture();
  invalidDigest.datasets
    .find((candidate) => candidate.localArtifacts?.length > 0)
    .localArtifacts[0].sha256 = 'not-a-digest';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(invalidDigest),
    /SHA-256 digest/,
  );
});

test('benchmark and dataset artifacts share one portable namespace', () => {
  const manifest = manifestFixture();
  const benchmarkArtifact = manifest.benchmark.localArtifacts[0];
  const dataset = manifest.datasets.find(
    (candidate) => candidate.localArtifacts?.length > 0,
  );
  dataset.localArtifacts.push({ ...benchmarkArtifact });

  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /Duplicate local artifact path/,
  );
});
test('artifact path aliases cannot represent multiple files', () => {
  const aliases = [
    (path) => path.replace('/', '\\'),
    (path) => './' + path,
    (path) => path.replace('/', '//'),
    () => 'C:artifact.zip',
  ];

  for (const alias of aliases) {
    const manifest = manifestFixture();
    const dataset = manifest.datasets.find(
      (candidate) => candidate.localArtifacts?.length > 0,
    );
    const artifact = dataset.localArtifacts[0];
    dataset.localArtifacts.push({
      ...artifact,
      relativePath: alias(artifact.relativePath),
    });

    assert.throws(
      () => assertHistoricalBenchmarkManifest(manifest),
      /canonical portable relative path/,
    );
  }
});

test('model inputs must have been available by the knowledge cutoff', () => {
  const manifest = manifestFixture();
  manifest.benchmark.replayMode = 'cutoff_constrained';
  const annualRainfall = manifest.datasets.find(
    (dataset) => dataset.id === 'arpae-2023-pluviometry',
  );

  assert.equal(annualRainfall.availableAt, '2024-12-23T00:00:00Z');
  annualRainfall.role = 'model_input';
  annualRainfall.allowedUses.modelInput = true;
  annualRainfall.allowedUses.evaluation = false;

  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /not available by benchmark knowledgeCutoff/,
  );
});

test('retrospective IMERG input discloses its post-cutoff release', () => {
  const manifest = manifestFixture();
  const v07 = manifest.datasets.find(
    (dataset) => dataset.id === 'nasa-imerg-v07',
  );

  assert.equal(manifest.benchmark.replayMode, 'retrospective_reconstruction');
  assert.equal(v07.role, 'model_input');
  assert.equal(v07.temporalRelation, 'during_event');
  assert.equal(v07.allowedUses.modelInput, true);
  assert.ok(
    Date.parse(v07.availableAt) >
      Date.parse(manifest.benchmark.event.knowledgeCutoff),
  );
  assert.match(v07.methodologyNote, /post-event reprocessing/);

  delete v07.methodologyNote;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /retrospective post-cutoff input requires methodologyNote/,
  );
});
test('knowledge cutoff cannot move beyond the replay event', () => {
  const manifest = manifestFixture();
  manifest.benchmark.event.knowledgeCutoff = '2023-05-19T00:00:00Z';

  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /knowledgeCutoff must not follow windowEnd/,
  );
});
