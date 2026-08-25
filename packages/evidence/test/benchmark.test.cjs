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

/** Loads an isolated mutable copy of the frozen benchmark manifest. */
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
  assert.equal(manifest.manifestVersion, '1.14.0');
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

test('conditioned replay freezes a non-blind, fail-closed physical input gate', () => {
  const manifest = manifestFixture();
  const protocol = manifest.benchmark.conditionedReplayProtocols[0];

  assert.equal(protocol.state, 'input_protocol_frozen');
  assert.equal(protocol.claimLevelAtFreeze, 'hydrologic_routing');
  assert.equal(protocol.validationMode, 'diagnostic_not_blind');
  assert.equal(
    protocol.evaluationReferenceAccessAtFreeze,
    'already_loaded_for_prior_hydrologic_routing_evaluation',
  );
  assert.equal(protocol.calibration, false);
  assert.deepEqual(
    protocol.requiredBoundaryEvidence.map((requirement) => requirement.id),
    [
      'rainfall_and_surface_runoff_forcing',
      'antecedent_moisture_or_model_warmup',
      'montone_and_rabbi_inflow_hydrographs',
      'downstream_stage_or_discharge_boundary',
      'breach_location_timing_and_geometry',
      'embankment_crest_geometry',
      'bare_earth_terrain',
      'channel_geometry_and_roughness',
    ],
  );
  assert.equal(protocol.runGate.state, 'blocked_missing_required_evidence');
  assert.equal(protocol.runGate.missingPolicy, 'block_run_not_zero_or_inferred');
  assert.equal(protocol.runGate.noStageToDischargeWithoutRatingCurve, true);
  assert.equal(protocol.runGate.noBreachInferenceFromFloodExtent, true);
  assert.equal(protocol.runGate.noTuningToEventExtent, true);
  assert.match(protocol.methodologyNote, /not a blind hindcast/);
});

test('conditioned replay rejects leakage, invented boundaries and gate drift', () => {
  const calibrated = manifestFixture();
  calibrated.benchmark.conditionedReplayProtocols[0].calibration = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(calibrated),
    /must not calibrate on the observed event extent/,
  );

  const inventedDischarge = manifestFixture();
  inventedDischarge.benchmark.conditionedReplayProtocols[0].runGate
    .noStageToDischargeWithoutRatingCurve = false;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(inventedDischarge),
    /must not infer discharge from local-datum stage/,
  );

  const inferredBreach = manifestFixture();
  inferredBreach.benchmark.conditionedReplayProtocols[0].runGate
    .noBreachInferenceFromFloodExtent = false;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(inferredBreach),
    /must not infer breaches from the observed extent/,
  );

  const prematureRun = manifestFixture();
  prematureRun.benchmark.conditionedReplayProtocols[0].runGate.state = 'eligible';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(prematureRun),
    /runGate.state disagrees with required evidence/,
  );

  const contradictoryAudit = manifestFixture();
  contradictoryAudit.benchmark.conditionedReplayProtocols[0]
    .requiredBoundaryEvidence.forEach((requirement) => {
      requirement.status = 'available';
      delete requirement.blocker;
    });
  contradictoryAudit.benchmark.conditionedReplayProtocols[0].runGate.state = 'eligible';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(contradictoryAudit),
    /contradicts the conditioned replay protocol run gate/,
  );

  const unknownSource = manifestFixture();
  unknownSource.benchmark.conditionedReplayProtocols[0]
    .requiredBoundaryEvidence[4].candidateDatasetIds = ['unknown-breach-source'];
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unknownSource),
    /references unknown candidate dataset/,
  );
});

test('post-freeze ARPAE audit retains datums but finds no required discharge station', () => {
  const manifest = manifestFixture();
  const audit = manifest.benchmark.conditionedReplaySourceAudits[0];

  assert.equal(audit.sourceAccess, 'loaded_after_protocol_freeze');
  assert.equal(audit.quality, 'incomplete_window');
  assert.equal(audit.dischargeNetwork.listedStationCount, 45);
  assert.deepEqual(audit.dischargeNetwork.requiredStationNames, [
    'Montone',
    'Rabbi',
  ]);
  assert.equal(audit.dischargeNetwork.containsRequiredStations, false);
  assert.equal(audit.dischargeNetwork.eventValidRatingCurvesAvailable, false);
  assert.equal(audit.dischargeNetwork.dischargeHydrographsAvailable, false);
  assert.deepEqual(
    audit.stationDatums.map(({ name, datumMslM, status }) => ({
      name,
      datumMslM,
      status,
    })),
    [
      { name: 'Castrocaro', datumMslM: 53.48, status: 'available' },
      { name: 'Predappio', datumMslM: 120.13, status: 'available' },
      { name: 'Ponte Braldo', datumMslM: null, status: 'missing' },
      { name: 'Ponte Vico', datumMslM: 8.51, status: 'available' },
    ],
  );
  assert.equal(audit.conclusions.hydraulicUseEligible, false);
  assert.equal(
    audit.conclusions.protocolRunGate,
    'blocked_missing_required_evidence',
  );
  assert.match(audit.methodologyNote, /No stage was converted to discharge/);
});

test('ARPAE source audit rejects inconsistent missing datum or hydraulic eligibility', () => {
  const inconsistentDatum = manifestFixture();
  inconsistentDatum.benchmark.conditionedReplaySourceAudits[0]
    .stationDatums[2].datumMslM = 0;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(inconsistentDatum),
    /missing datum must remain null/,
  );

  const fabricatedDischarge = manifestFixture();
  fabricatedDischarge.benchmark.conditionedReplaySourceAudits[0]
    .dischargeNetwork.containsRequiredStations = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(fabricatedDischarge),
    /cannot promote absent discharge evidence/,
  );

  const prematureHydraulics = manifestFixture();
  prematureHydraulics.benchmark.conditionedReplaySourceAudits[0]
    .conclusions.hydraulicUseEligible = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(prematureHydraulics),
    /keep the hydraulic replay fail-closed/,
  );
});

test('regional Commission audit retains plotted Montone discharge without promoting it', () => {
  const manifest = manifestFixture();
  const audit = manifest.benchmark.conditionedReplayHydrographAudits[0];
  const dataset = manifest.datasets.find(
    (candidate) =>
      candidate.id === 'rer-commissione-tecnico-scientifica-maggio-2023',
  );

  assert.equal(
    audit.sourceAccess,
    'loaded_after_protocol_freeze_from_archived_official_pdf',
  );
  assert.equal(audit.quality, 'incomplete_window');
  assert.equal(audit.ratingCurveEvidence.vintageYear, 2022);
  assert.equal(audit.ratingCurveEvidence.formulaOrTableAvailable, false);
  assert.equal(audit.hydrographEvidence.figureNumber, 63);
  assert.equal(audit.hydrographEvidence.temporalResolutionMinutes, 60);
  assert.equal(audit.hydrographEvidence.machineReadableSeriesAvailable, false);
  assert.deepEqual(audit.publishedVolumeBalance, {
    basinAreaKm2: 237,
    rainfallDepthMm: 201.25,
    rainfallVolumeMillionM3: 47.6,
    dischargeVolumeMillionM3: 36.86,
    runoffCoefficient: 0.77,
  });
  assert.equal(audit.conclusions.montoneInflowStatus, 'incomplete_window');
  assert.equal(audit.conclusions.rabbiInflowStatus, 'missing');
  assert.equal(audit.conclusions.hydraulicUseEligible, false);
  assert.match(dataset.retrievalUrl, /web\.archive\.org\/web\/20231230121007id_/);
  assert.equal(dataset.archivedAt, '2023-12-30T12:10:07Z');
  assert.match(audit.methodologyNote, /No chart digitization/);
});

test('regional Commission audit rejects digitization, numeric drift and gate promotion', () => {
  const inventedCurve = manifestFixture();
  inventedCurve.benchmark.conditionedReplayHydrographAudits[0]
    .ratingCurveEvidence.formulaOrTableAvailable = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(inventedCurve),
    /must not promote the unpublished 2022 rating curve/,
  );

  const digitizedChart = manifestFixture();
  digitizedChart.benchmark.conditionedReplayHydrographAudits[0]
    .hydrographEvidence.machineReadableSeriesAvailable = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(digitizedChart),
    /must retain the plotted-only hourly hydrograph limits/,
  );

  const driftedBalance = manifestFixture();
  driftedBalance.benchmark.conditionedReplayHydrographAudits[0]
    .publishedVolumeBalance.dischargeVolumeMillionM3 = 0;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(driftedBalance),
    /published volume balance drifted from Table 9/,
  );

  const driftedGate = manifestFixture();
  driftedGate.benchmark.conditionedReplayProtocols[0]
    .requiredBoundaryEvidence[2].status = 'missing';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(driftedGate),
    /inflow status drifted from the conditioned replay gate/,
  );

  const unpinnedArtifact = manifestFixture();
  unpinnedArtifact.benchmark.conditionedReplayHydrographAudits[0]
    .sourceArtifactPath = 'source/unpinned-commission-report.pdf';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unpinnedArtifact),
    /is not pinned by its source dataset/,
  );

  const incompleteArchiveReceipt = manifestFixture();
  const dataset = incompleteArchiveReceipt.datasets.find(
    (candidate) =>
      candidate.id === 'rer-commissione-tecnico-scientifica-maggio-2023',
  );
  delete dataset.archivedAt;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(incompleteArchiveReceipt),
    /archived retrieval URL and timestamp must be paired/,
  );
});

test('official physical-source audit retains narrative breaches and drawing-only archives', () => {
  const manifest = manifestFixture();
  const audit = manifest.benchmark.conditionedReplayPhysicalAudits[0];

  assert.equal(audit.sourceAccess, 'loaded_after_protocol_freeze');
  assert.equal(audit.quality, 'metadata_only');
  assert.equal(
    audit.eventMonograph.stageDatum,
    'metres_above_local_gauge_zero',
  );
  assert.deepEqual(
    audit.eventMonograph.reportedStagePeaks.map(
      ({ watercourse, station, stageM }) => ({ watercourse, station, stageM }),
    ),
    [
      { watercourse: 'Montone', station: 'Castrocaro', stageM: 5.72 },
      { watercourse: 'Rabbi', station: 'Ponte Calanca', stageM: 3.67 },
    ],
  );
  assert.equal(
    audit.eventMonograph.breachAndOvertopping
      .machineReadableCoordinatesAvailable,
    false,
  );
  assert.equal(audit.publicHydraulicArchive.declaredModel, 'HEC-RAS');
  assert.deepEqual(
    audit.publicHydraulicArchive.inspectedArtifacts.map(
      ({ entryCount, entryExtensions }) => ({ entryCount, entryExtensions }),
    ),
    [
      { entryCount: 2, entryExtensions: ['.DWG'] },
      { entryCount: 14, entryExtensions: ['.DWG'] },
      { entryCount: 3, entryExtensions: ['.DWG'] },
    ],
  );
  assert.equal(
    audit.publicHydraulicArchive.containsHecrasProjectFiles,
    false,
  );
  assert.equal(audit.conclusions.hydraulicUseEligible, false);
  assert.equal(
    audit.conclusions.protocolRunGate,
    'blocked_missing_required_evidence',
  );
  assert.match(audit.methodologyNote, /No stage was converted to discharge/);
});

test('physical-source audit rejects promoted narrative or drawing evidence', () => {
  const inventedCoordinates = manifestFixture();
  inventedCoordinates.benchmark.conditionedReplayPhysicalAudits[0]
    .eventMonograph.breachAndOvertopping
    .machineReadableCoordinatesAvailable = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(inventedCoordinates),
    /cannot promote narrative breach evidence into model geometry/,
  );

  const inventedModel = manifestFixture();
  inventedModel.benchmark.conditionedReplayPhysicalAudits[0]
    .publicHydraulicArchive.containsHecrasProjectFiles = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(inventedModel),
    /cannot promote drawing archives into hydraulic model inputs/,
  );

  const driftedGate = manifestFixture();
  driftedGate.benchmark.conditionedReplayProtocols[0]
    .requiredBoundaryEvidence[4].status = 'incomplete_window';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(driftedGate),
    /physical statuses drifted from the conditioned replay gate/,
  );

  const misleadingArchive = manifestFixture();
  misleadingArchive.benchmark.conditionedReplayPhysicalAudits[0]
    .publicHydraulicArchive.inspectedArtifacts[0]
    .entryExtensions = ['.PRJ'];
  assert.throws(
    () => assertHistoricalBenchmarkManifest(misleadingArchive),
    /must retain the drawing-only archive finding/,
  );

  const unpinnedArchive = manifestFixture();
  unpinnedArchive.benchmark.conditionedReplayPhysicalAudits[0]
    .publicHydraulicArchive.inspectedArtifacts[0]
    .relativePath = 'source/unpinned-hydraulic-archive.zip';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unpinnedArchive),
    /is not pinned by its source dataset/,
  );
});

test('bounded PST terrain audit preserves source nodata and critical gaps', () => {
  const manifest = manifestFixture();
  const audit = manifest.benchmark.conditionedReplayTerrainAudits[0];
  const dataset = manifest.datasets.find(
    (candidate) => candidate.id === 'rer-dtm-1m-pst',
  );

  assert.equal(audit.sourceAccess, 'loaded_after_protocol_freeze');
  assert.equal(audit.quality, 'incomplete_window');
  assert.equal(audit.coverageRequest.sourceCrs, 'EPSG:23032');
  assert.equal(audit.coverageRequest.sourceResolutionM, 1);
  assert.equal(audit.coverageRequest.representationResolutionM, 5);
  assert.equal(audit.coverageRequest.declaredNoData, -3);
  assert.equal(audit.coverageRequest.geoTiffNoDataTag, 'missing');
  assert.deepEqual(
    audit.coverageRequest.aoiRelation.sourceBounds,
    audit.coverageRequest.bounds,
  );
  assert.equal(audit.coverageRequest.aoiRelation.targetCrs, 'EPSG:32632');
  assert.equal(
    audit.coverageRequest.aoiRelation.reference,
    'benchmark_spatial_grid_bounds',
  );
  assert.equal(audit.coverageRequest.aoiRelation.toleranceM, 1);
  assert.deepEqual(audit.counts, {
    totalPixels: 5069731,
    availablePixels: 4508766,
    missingPixels: 560965,
    missingFraction: 0.1106498549923063,
  });
  assert.deepEqual(
    audit.physicalFeatureCoverage.map(
      ({ layer, knownCenterCells, terrainMissingAtCenter }) => ({
        layer,
        knownCenterCells,
        terrainMissingAtCenter,
      }),
    ),
    [
      { layer: 'riverbed', knownCenterCells: 12762, terrainMissingAtCenter: 1544 },
      { layer: 'embankment', knownCenterCells: 10525, terrainMissingAtCenter: 1542 },
      { layer: 'permanent_water', knownCenterCells: 10859, terrainMissingAtCenter: 1550 },
    ],
  );
  assert.equal(audit.conclusions.hydraulicUseEligible, false);
  assert.equal(audit.conclusions.noDataPolicy, 'missing_not_zero_or_interpolated');
  assert.equal(dataset.acquisitionStatus, 'downloaded_verified');
  assert.equal(dataset.localArtifacts.length, 3);
});

test('terrain audit rejects invalid resolution, count drift and premature eligibility', () => {
  const invalidResolution = manifestFixture();
  invalidResolution.benchmark.conditionedReplayTerrainAudits[0]
    .coverageRequest.representationResolutionM = 0;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(invalidResolution),
    /resolutions must be positive/,
  );

  const falsePrecision = manifestFixture();
  falsePrecision.benchmark.conditionedReplayTerrainAudits[0]
    .coverageRequest.representationResolutionM = 0.5;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(falsePrecision),
    /representation cannot claim finer resolution than the source/,
  );

  const unrelatedRequest = manifestFixture();
  unrelatedRequest.benchmark.conditionedReplayTerrainAudits[0]
    .coverageRequest.bounds = [0, 0, 10, 10];
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unrelatedRequest),
    /AOI source bounds must equal the request/,
  );

  const unrelatedTransformedBounds = manifestFixture();
  unrelatedTransformedBounds.benchmark.conditionedReplayTerrainAudits[0]
    .coverageRequest.aoiRelation.transformedBounds = [0, 0, 10, 10];
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unrelatedTransformedBounds),
    /transformed bounds do not contain the benchmark grid/,
  );

  const unboundedTolerance = manifestFixture();
  unboundedTolerance.benchmark.conditionedReplayTerrainAudits[0]
    .coverageRequest.aoiRelation.toleranceM = 2;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(unboundedTolerance),
    /AOI tolerance must be between zero and one source cell/,
  );

  const countDrift = manifestFixture();
  countDrift.benchmark.conditionedReplayTerrainAudits[0].counts.missingPixels -= 1;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(countDrift),
    /counts are inconsistent with the bounded raster/,
  );

  const prematureHydraulics = manifestFixture();
  prematureHydraulics.benchmark.conditionedReplayTerrainAudits[0]
    .conclusions.hydraulicUseEligible = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(prematureHydraulics),
    /keep incomplete terrain fail-closed/,
  );
});

test('terrain audit accepts truthful zero component counts', () => {
  const noAvailableTerrain = manifestFixture();
  const coverage = noAvailableTerrain.benchmark.conditionedReplayTerrainAudits[0]
    .physicalFeatureCoverage[0];
  coverage.terrainAvailableAtCenter = 0;
  coverage.terrainMissingAtCenter = coverage.knownCenterCells;

  assert.doesNotThrow(() => assertHistoricalBenchmarkManifest(noAvailableTerrain));

  const completeFeatureCoverage = manifestFixture();
  const completeCoverage = completeFeatureCoverage.benchmark
    .conditionedReplayTerrainAudits[0].physicalFeatureCoverage[0];
  completeCoverage.terrainAvailableAtCenter = completeCoverage.knownCenterCells;
  completeCoverage.terrainMissingAtCenter = 0;

  assert.doesNotThrow(() => assertHistoricalBenchmarkManifest(completeFeatureCoverage));
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

  const emptyStageWithSummary = manifestFixture();
  const stage = emptyStageWithSummary.benchmark.observationComparisonRuns[0]
    .hydrometry[0];
  stage.quality = 'incomplete_window';
  stage.recordCount = 0;
  stage.missingRecordCount = 192;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(emptyStageWithSummary),
    /empty stage must retain null summaries/,
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
