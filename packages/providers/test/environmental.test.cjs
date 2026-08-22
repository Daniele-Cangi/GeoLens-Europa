const test = require('node:test');
const assert = require('node:assert/strict');
const { cellToLatLng, latLngToCell } = require('h3-js');
const {
  CopernicusDemClient,
  CorineLandCoverClient,
  classifyRasterError,
  copernicusDemTileUrl,
  corineSourceCoordinate,
} = require('../dist');

const h3 = '891f1d48907ffff';
const [centerLat, centerLon] = cellToLatLng(h3);
const fixedNow = () => new Date('2026-08-22T12:00:00.000Z');

function fixtureSource(fixtureId, sample) {
  return {
    identity: {
      kind: 'synthetic_fixture',
      fixtureId,
    },
    sample,
  };
}

test('DEM fixture exposes elevation and inspectable finite-difference slope', async () => {
  const source = fixtureSource('planar-dem', async (lat, lon) => ({
    status: 'available',
    value:
      100 +
      (lat - centerLat) * 1000 +
      (lon - centerLon) * 500,
    sourceId: 'fixture-grid',
  }));
  const result = await new CopernicusDemClient({
    rasterSource: source,
    now: fixedNow,
  }).getEvidence({ h3Indices: [h3] });
  const cell = result.cells[h3];

  assert.equal(cell.elevationM.quality.status, 'synthetic_fixture');
  assert.ok(Math.abs(cell.elevationM.value - 100) < 1e-9);
  assert.equal(
    cell.elevationM.spatial.sourceResolution,
    '1 arc-second (~30 m at equator)',
  );
  assert.equal(cell.slopeDeg.quality.status, 'synthetic_fixture');
  assert.ok(cell.slopeDeg.value > 0);
  assert.equal(
    cell.slopeDeg.provenance.transformationVersion,
    'dem-slope-v0.1.0',
  );
  assert.equal(
    cell.slopeDeg.provenance.sourceMetadata.fixtureId,
    'planar-dem',
  );
});

test('missing DEM neighbor keeps slope missing while elevation remains present', async () => {
  const source = fixtureSource('incomplete-dem', async (lat) => {
    if (lat > centerLat + 0.0001) {
      return {
        status: 'missing',
        value: null,
        missingReason: 'north pixel is no-data',
        sourceId: 'fixture-grid',
      };
    }

    return {
      status: 'available',
      value: 0,
      sourceId: 'fixture-grid',
    };
  });
  const result = await new CopernicusDemClient({
    rasterSource: source,
    now: fixedNow,
  }).getEvidence({ h3Indices: [h3] });
  const cell = result.cells[h3];

  assert.equal(cell.elevationM.value, 0);
  assert.equal(cell.elevationM.quality.status, 'synthetic_fixture');
  assert.equal(cell.slopeDeg.value, null);
  assert.equal(cell.slopeDeg.quality.status, 'missing');
  assert.equal(
    cell.slopeDeg.provenance.provider,
    'synthetic-fixture',
  );
});

test('DEM upstream failure cannot create elevation or slope zeros', async () => {
  const source = {
    identity: { kind: 'production' },
    async sample() {
      return {
        status: 'upstream_error',
        value: null,
        missingReason: 'tile service unavailable',
      };
    },
  };
  const result = await new CopernicusDemClient({
    rasterSource: source,
    now: fixedNow,
  }).getEvidence({ h3Indices: [h3] });
  const cell = result.cells[h3];

  assert.equal(cell.elevationM.value, null);
  assert.equal(cell.elevationM.quality.status, 'upstream_error');
  assert.equal(cell.slopeDeg.value, null);
  assert.equal(cell.slopeDeg.quality.status, 'upstream_error');
});

test('CLC without a configured raster is explicit missing evidence', async () => {
  const result = await new CorineLandCoverClient({
    now: fixedNow,
  }).getEvidence({ h3Indices: [h3] });
  const evidence = result.cells[h3].classCode;

  assert.equal(evidence.value, null);
  assert.equal(evidence.quality.status, 'missing');
  assert.match(evidence.quality.missingReason, /not configured/);
  assert.equal(evidence.spatial.sourceResolution, '100 m');
});

test('CLC accepts official three-digit class codes as fixture evidence', async () => {
  const source = fixtureSource('clc-urban', async () => ({
    status: 'available',
    value: 112,
    sourceId: 'fixture-clc',
  }));
  const result = await new CorineLandCoverClient({
    rasterSource: source,
    now: fixedNow,
  }).getEvidence({ h3Indices: [h3] });
  const evidence = result.cells[h3].classCode;

  assert.equal(evidence.value, 112);
  assert.equal(evidence.quality.status, 'synthetic_fixture');
  assert.equal(evidence.provenance.dataset, 'fixture:clc-urban');
  assert.equal(
    evidence.provenance.sourceMetadata.intendedDataset,
    'CORINE Land Cover',
  );
});

test('CLC rejects legacy 1..44 ordinal values as invalid responses', async () => {
  const source = fixtureSource('bad-clc-ordinal', async () => ({
    status: 'available',
    value: 44,
    sourceId: 'fixture-clc',
  }));
  const result = await new CorineLandCoverClient({
    rasterSource: source,
    now: fixedNow,
  }).getEvidence({ h3Indices: [h3] });
  const evidence = result.cells[h3].classCode;

  assert.equal(evidence.value, null);
  assert.equal(evidence.quality.status, 'invalid_response');
  assert.match(evidence.quality.missingReason, /unsupported class code 44/);
  assert.equal(evidence.provenance.provider, 'synthetic-fixture');
});

test('CLC coverage is explicit before raster access', async () => {
  let calls = 0;
  const source = fixtureSource('coverage-check', async () => {
    calls += 1;
    return {
      status: 'available',
      value: 112,
      sourceId: 'fixture-clc',
    };
  });
  const outsideEurope = latLngToCell(40, -100, 9);
  const result = await new CorineLandCoverClient({
    rasterSource: source,
    now: fixedNow,
  }).getEvidence({ h3Indices: [outsideEurope] });
  const evidence = result.cells[outsideEurope].classCode;

  assert.equal(calls, 0);
  assert.equal(evidence.value, null);
  assert.equal(evidence.quality.status, 'out_of_coverage');
});

test('Copernicus DEM tile naming handles southern and western hemispheres', () => {
  assert.equal(
    copernicusDemTileUrl(-0.2, -8.4),
    'https://copernicus-dem-30m.s3.amazonaws.com/' +
      'Copernicus_DSM_COG_10_S01_00_W009_00_DEM/' +
      'Copernicus_DSM_COG_10_S01_00_W009_00_DEM.tif',
  );
});

test('CLC coordinates are transformed only for supported raster CRS', () => {
  assert.deepEqual(
    corineSourceCoordinate(55.6761, 12.5683, {
      GeographicTypeGeoKey: 4326,
    }),
    {
      x: 12.5683,
      y: 55.6761,
      crs: 'EPSG:4326',
    },
  );

  const projected = corineSourceCoordinate(55.6761, 12.5683, {
    ProjectedCSTypeGeoKey: 3035,
  });

  assert.equal(projected.crs, 'EPSG:3035');
  assert.ok(projected.x > 4_000_000 && projected.x < 5_000_000);
  assert.ok(projected.y > 3_000_000 && projected.y < 4_000_000);
  assert.equal(
    corineSourceCoordinate(55.6761, 12.5683, {
      ProjectedCSTypeGeoKey: 3857,
    }),
    null,
  );
});

test('raster transport errors retain actionable status classes', () => {
  assert.equal(classifyRasterError(new Error('HTTP 403')), 'auth_required');
  assert.equal(classifyRasterError(new Error('HTTP 429')), 'rate_limited');
  assert.equal(classifyRasterError(new Error('ENOENT')), 'missing');
  assert.equal(
    classifyRasterError(new Error('socket closed')),
    'upstream_error',
  );
});
