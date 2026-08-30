const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  assertCumbriaAccessManifest,
  CUMBRIA_EVENT_WINDOW,
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
  const series = manifest.datasets.filter((dataset) => dataset.seriesAudit);

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

test('pre-event terrain catalogue selection is reproducible and incomplete', () => {
  const manifest = manifestFixture();
  const lidar = manifest.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  );

  assert.equal(manifest.manifestVersion, '0.3.0');
  assert.equal(lidar.access.state, 'catalog_verified');
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
  assert.deepEqual(lidar.lidarCatalogAudit.downloadProbe, {
    endpoint: 'https://environment.data.gov.uk/api/survey/download',
    requiredQueryParameters: ['product', 'year', 'resolution', 'tile'],
    missingParameterResponse: {
      httpStatus: 400,
      message:
        'product, year, resolution and tile must be included as query params',
    },
    candidateRequest: {
      product: 'DTM',
      year: '2009',
      resolution: '1M',
      tile: 'NY3957',
      relation: 'unverified_candidate_only',
      httpStatus: 403,
      message: 'Forbidden',
      archiveBytesDownloaded: 0,
    },
    selectorState: 'upstream_error',
    selectorMessage: 'Sorry, there is a problem with the service',
  });
  assert.equal(lidar.lidarCatalogAudit.acquisitionState, 'blocked');

  lidar.lidarCatalogAudit.selectedPreEventGridRefs = 241;
  assert.throws(
    () => assertCumbriaAccessManifest(manifest),
    /LiDAR selected pre-event grid references must equal 231/,
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

test('bulk acquisition remains blocked until pre-event terrain is identified', () => {
  const manifest = manifestFixture();
  const gates = new Map(
    manifest.gates.map((gate) => [gate.id, gate.state]),
  );

  assert.equal(gates.get('pre_event_lidar_tiles'), 'blocked');
  assert.equal(gates.get('evaluation_geometry_identity'), 'blocked');
  assert.equal(gates.get('large_artifact_downloads'), 'blocked');
  assert.equal(gates.get('evaluation_withholding'), 'passed');
});
