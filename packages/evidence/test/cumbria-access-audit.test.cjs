const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  assertCumbriaAccessManifest,
  CUMBRIA_EVENT_WINDOW,
  createCumbriaDtmMaterializationPlan,
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

test('Cumbria metadata-only manifest passes the evidence-isolation contract', () => {
  const manifest = manifestFixture();

  assert.doesNotThrow(() => assertCumbriaAccessManifest(manifest));
  assert.deepEqual(
    {
      start: manifest.event.windowStart,
      endExclusive: manifest.event.windowEndExclusive,
    },
    CUMBRIA_EVENT_WINDOW,
  );
  assert.equal(manifest.acquisition.state, 'metadata_only');
  assert.equal(manifest.acquisition.largeDownloadsAllowed, false);
  assert.equal(
    manifest.datasets.some((dataset) => 'localArtifacts' in dataset),
    false,
  );
});

test('canonical IMERG discovery covers all 144 expected half-hour granules', () => {
  const manifest = manifestFixture();
  const imerg = manifest.datasets.find(
    (dataset) => dataset.id === 'nasa-imerg-v07-final',
  );

  assert.equal(imerg.access.state, 'catalog_verified');
  assert.equal(imerg.facts.product, 'GPM_3IMERGHH');
  assert.equal(imerg.facts.expectedGranules, 144);
  assert.equal(imerg.facts.discoveredGranules, 144);
  assert.equal(imerg.facts.firstGranuleAt, manifest.event.windowStart);
  assert.equal(imerg.facts.lastGranuleAt, '2015-12-06T23:30:00Z');

  imerg.facts.discoveredGranules = 143;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /IMERG discovered granules must equal 144/,
  );
});

test('direct Carlisle comparison series close the 72-hour reading account', () => {
  const manifest = manifestFixture();
  const series = manifest.datasets.filter(
    (dataset) => dataset.role === 'observation_comparison' && dataset.seriesAudit,
  );

  assert.deepEqual(
    series.map((dataset) => dataset.id),
    [
      'ea-hydrology-sheepmount-flow',
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

  rainfall.seriesAudit.readings = 287;
  rainfall.seriesAudit.missingReadings = 1;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /verified readings must equal 288/,
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

test('pre-event terrain selection maps to downloadable archives with explicit gaps', () => {
  const manifest = manifestFixture();
  const lidar = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  );

  assert.equal(manifest.manifestVersion, '0.9.0');
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

  assert.equal(request.state, 'prepared_not_sent');
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

test('terrain identity passes while bulk acquisition remains physically gated', () => {
  const manifest = manifestFixture();
  const gates = new Map(
    manifest.gates.map((gate) => [gate.id, gate.state]),
  );

  assert.equal(gates.get('pre_event_lidar_tiles'), 'passed');
  assert.equal(gates.get('dtm_materialization_protocol'), 'passed');
  assert.equal(gates.get('upstream_boundary_series'), 'passed');
  assert.equal(gates.get('hydraulic_model_access_request'), 'passed');
  assert.equal(gates.get('as_of_event_defence_state'), 'blocked');
  assert.equal(gates.get('hydraulic_context'), 'blocked');
  assert.equal(gates.get('evaluation_geometry_identity'), 'blocked');
  assert.equal(gates.get('large_artifact_downloads'), 'blocked');
  assert.equal(gates.get('evaluation_withholding'), 'passed');
});
