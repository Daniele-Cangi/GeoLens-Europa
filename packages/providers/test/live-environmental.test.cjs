const test = require('node:test');
const assert = require('node:assert/strict');
const { latLngToCell } = require('h3-js');
const {
  AhnDtmClient,
  CopernicusDemClient,
  CorineLandCoverClient,
} = require('../dist');

const liveEnabled =
  process.env.GEOLENS_RUN_LIVE_PROVIDER_TESTS === '1';
const copenhagen = latLngToCell(55.6761, 12.5683, 9);
const amsterdamOutfall = latLngToCell(
  52.33807928535426,
  4.898945130628371,
  13,
);

test(
  'live Copernicus DEM returns non-synthetic traceable evidence',
  { skip: !liveEnabled },
  async () => {
    const result = await new CopernicusDemClient().getEvidence({
      h3Indices: [copenhagen],
    });
    const cell = result.cells[copenhagen];

    assert.equal(cell.elevationM.quality.status, 'available');
    assert.equal(cell.slopeDeg.quality.status, 'available');
    assert.notEqual(
      cell.elevationM.provenance.provider,
      'synthetic-fixture',
    );
    assert.match(
      cell.elevationM.provenance.sourceMetadata.sourceId,
      /^https:\/\/copernicus-dem-30m\.s3\.amazonaws\.com\//,
    );
  },
);

test(
  'live AHN DTM returns bounded non-synthetic NAP elevation',
  { skip: !liveEnabled },
  async () => {
    const result = await new AhnDtmClient().getElevationEvidence({
      h3Indices: [amsterdamOutfall],
    });
    const evidence = result.cells[amsterdamOutfall];

    assert.equal(evidence.quality.status, 'available');
    assert.equal(evidence.spatial.sourceResolution, '0.5 m');
    assert.equal(evidence.provenance.provider, 'PDOK');
    assert.equal(evidence.provenance.datasetVersion, 'AHN4');
    assert.equal(result.coverage.coverageId, 'dtm_05m');
    assert.ok(result.coverage.responseBytes > 0);
  },
);
test(
  'live local CLC raster returns an official non-synthetic class',
  {
    skip:
      !liveEnabled ||
      !process.env.CLC_RASTER_PATH,
  },
  async () => {
    const result = await new CorineLandCoverClient({
      rasterLocation: process.env.CLC_RASTER_PATH,
    }).getEvidence({ h3Indices: [copenhagen] });
    const evidence = result.cells[copenhagen].classCode;

    assert.equal(evidence.quality.status, 'available');
    assert.equal(Number.isInteger(evidence.value), true);
    assert.notEqual(
      evidence.provenance.provider,
      'synthetic-fixture',
    );
    assert.equal(
      evidence.provenance.sourceMetadata.sourceId,
      process.env.CLC_RASTER_PATH,
    );
  },
);
