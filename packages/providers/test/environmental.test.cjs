const test = require('node:test');
const assert = require('node:assert/strict');
const { cellToLatLng, latLngToCell } = require('h3-js');
const {
  AhnDtmClient,
  AhnWcsDtmRasterSource,
  aggregateAhnDtmArea,
  ahnRdCoordinate,
  buildAhnWcsCoverageUrl,
  CopernicusDemClient,
  CorineLandCoverClient,
  classifyRasterError,
  copernicusDemTileUrl,
  corineRasterValueToClassCode,
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

test('DEM elevation-only acquisition avoids unnecessary slope samples', async () => {
  let calls = 0;
  const source = fixtureSource('elevation-only-dem', async () => {
    calls += 1;
    return {
      status: 'available',
      value: 0,
      sourceId: 'fixture-grid',
    };
  });
  const result = await new CopernicusDemClient({
    rasterSource: source,
    now: fixedNow,
  }).getElevationEvidence({ h3Indices: [h3] });
  const evidence = result.cells[h3];

  assert.equal(calls, 1);
  assert.equal(evidence.value, 0);
  assert.equal(evidence.quality.status, 'synthetic_fixture');
  assert.equal(
    evidence.provenance.transformationVersion,
    'dem-centroid-v0.1.0',
  );
  assert.equal(evidence.spatial.h3, h3);
});

test('DEM point sampling distinguishes nodes that share one H3 cell', async () => {
  const source = fixtureSource('node-point-dem', async (lat) => ({
    status: 'available',
    value: 100 + (lat - centerLat) * 10_000,
    sourceId: 'fixture-grid',
  }));
  const result = await new CopernicusDemClient({
    rasterSource: source,
    now: fixedNow,
  }).getPointEvidence({
    locations: [
      {
        id: 'node-a',
        h3,
        lat: centerLat,
        lon: centerLon,
      },
      {
        id: 'node-b',
        h3,
        lat: centerLat + 0.001,
        lon: centerLon,
      },
    ],
  });

  assert.equal(
    result.locations['node-a'].elevationM.spatial.h3,
    h3,
  );
  assert.equal(
    result.locations['node-b'].elevationM.spatial.h3,
    h3,
  );
  assert.notEqual(
    result.locations['node-a'].elevationM.value,
    result.locations['node-b'].elevationM.value,
  );
  assert.notEqual(
    result.locations['node-a'].elevationM.spatial.lat,
    result.locations['node-b'].elevationM.spatial.lat,
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

test('CLC decodes the official raster palette index into level-3 codes', () => {
  assert.equal(corineRasterValueToClassCode(1), 111);
  assert.equal(corineRasterValueToClassCode(2), 112);
  assert.equal(corineRasterValueToClassCode(23), 311);
  assert.equal(corineRasterValueToClassCode(44), 523);
  assert.equal(corineRasterValueToClassCode(111), 111);
  assert.equal(corineRasterValueToClassCode(0), null);
  assert.equal(corineRasterValueToClassCode(45), null);
  assert.equal(corineRasterValueToClassCode(1.5), null);
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

test('AHN DTM fixture preserves zero as synthetic evidence with a batch receipt', async () => {
  const source = {
    identity: {
      kind: 'synthetic_fixture',
      fixtureId: 'ahn-zero',
    },
    async sample(locations) {
      return {
        samples: Object.fromEntries(
          locations.map((location) => [
            location.id,
            {
              status: 'available',
              value: 0,
              sourceId: 'fixture-ahn-coverage',
            },
          ]),
        ),
        receipt: {
          service: 'OGC WCS',
          serviceVersion: '2.0.1',
          coverageId: 'dtm_05m',
          requestUrl: 'https://fixture.invalid/ahn',
          requestedBoundsRd: {
            minX: 121000,
            minY: 483000,
            maxX: 121010,
            maxY: 483010,
          },
          sourceCrs: 'EPSG:28992',
          verticalDatum: 'NAP (EPSG:5709)',
          responseWidth: 20,
          responseHeight: 20,
          responseBytes: 400,
        },
      };
    },
  };
  const result = await new AhnDtmClient({
    rasterSource: source,
    now: fixedNow,
  }).getElevationEvidence({ h3Indices: [h3] });
  const evidence = result.cells[h3];

  assert.equal(evidence.value, 0);
  assert.equal(evidence.quality.status, 'synthetic_fixture');
  assert.equal(
    evidence.provenance.sourceMetadata.intendedDataset,
    'Actueel Hoogtebestand Nederland DTM',
  );
  assert.equal(evidence.spatial.sourceResolution, '0.5 m');
  assert.equal(result.coverage.coverageId, 'dtm_05m');
});

test('AHN WCS failure remains unavailable evidence instead of zero', async () => {
  const source = {
    identity: { kind: 'production' },
    async sample() {
      throw new Error('upstream connection failed');
    },
  };
  const result = await new AhnDtmClient({
    rasterSource: source,
    now: fixedNow,
  }).getElevationEvidence({ h3Indices: [h3] });
  const evidence = result.cells[h3];

  assert.equal(result.coverage, null);
  assert.equal(evidence.value, null);
  assert.equal(evidence.quality.status, 'upstream_error');
  assert.match(evidence.quality.missingReason, /AHN WCS acquisition failed/);
});

test('AHN request uses bounded RD subsets and traceable coverage identity', () => {
  const [x, y] = ahnRdCoordinate(52.33807928535426, 4.898945130628371);
  assert.ok(x > 121000 && x < 122000);
  assert.ok(y > 483000 && y < 484000);

  const url = new URL(
    buildAhnWcsCoverageUrl({
      minX: 121645,
      minY: 483398,
      maxX: 121763,
      maxY: 483621,
    }),
  );
  assert.equal(url.searchParams.get('COVERAGEID'), 'dtm_05m');
  assert.equal(url.searchParams.get('VERSION'), '2.0.1');
  assert.deepEqual(url.searchParams.getAll('SUBSET'), [
    'X(121645,121763)',
    'Y(483398,483621)',
  ]);
});
test('AHN production source refuses an unbounded coverage before fetch', async () => {
  let fetchCalls = 0;
  const source = new AhnWcsDtmRasterSource({
    async fetchImpl() {
      fetchCalls += 1;
      throw new Error('fetch must not be reached');
    },
  });
  const result = await new AhnDtmClient({
    rasterSource: source,
    now: fixedNow,
  }).getElevationEvidence({
    h3Indices: [
      latLngToCell(52.338, 4.899, 13),
      latLngToCell(52.37, 4.94, 13),
    ],
  });

  assert.equal(fetchCalls, 0);
  assert.ok(
    Object.values(result.cells).every(
      (evidence) =>
        evidence.value === null &&
        evidence.quality.status === 'out_of_coverage',
    ),
  );
});

test('AHN H3 area mean preserves observed zero and per-cell pixel trace', () => {
  const sample = aggregateAhnDtmArea({
    polygonRd: [[0, 0], [4, 0], [4, 4], [0, 4]],
    bbox: [0, 0, 4, 4],
    width: 4,
    height: 4,
    band: [
      0, 0, 0, 0,
      0, 0, 0, 0,
      -9999, -9999, -9999, -9999,
      -9999, -9999, -9999, -9999,
    ],
    noData: -9999,
    sourceId: 'fixture-ahn-area',
  });

  assert.equal(sample.status, 'available');
  assert.equal(sample.value, 0);
  assert.equal(sample.sourceQuality, 0.5);
  assert.equal(sample.sourceMetadata.totalSourcePixels, 16);
  assert.equal(sample.sourceMetadata.availableSourcePixels, 8);
  assert.equal(sample.sourceMetadata.noDataFraction, 0.5);
});

test('AHN H3 area applies the published greater-than-60-percent no-data rule', () => {
  const atThreshold = aggregateAhnDtmArea({
    polygonRd: [[0, 0], [5, 0], [5, 2], [0, 2]],
    bbox: [0, 0, 5, 2],
    width: 5,
    height: 2,
    band: [10, 10, 10, 10, -9999, -9999, -9999, -9999, -9999, -9999],
    noData: -9999,
    sourceId: 'fixture-ahn-threshold',
  });
  const aboveThreshold = aggregateAhnDtmArea({
    polygonRd: [[0, 0], [5, 0], [5, 2], [0, 2]],
    bbox: [0, 0, 5, 2],
    width: 5,
    height: 2,
    band: [10, 10, 10, -9999, -9999, -9999, -9999, -9999, -9999, -9999],
    noData: -9999,
    sourceId: 'fixture-ahn-threshold',
  });

  assert.equal(atThreshold.status, 'available');
  assert.equal(atThreshold.value, 10);
  assert.equal(atThreshold.sourceQuality, 0.4);
  assert.equal(aboveThreshold.status, 'missing');
  assert.equal(aboveThreshold.value, null);
  assert.equal(aboveThreshold.sourceMetadata.noDataFraction, 0.7);
  assert.match(aboveThreshold.missingReason, /60% source no-data threshold/);
});

test('AHN H3 area rejects non-nodata elevations outside physical range', () => {
  const sample = aggregateAhnDtmArea({
    polygonRd: [[0, 0], [2, 0], [2, 2], [0, 2]],
    bbox: [0, 0, 2, 2],
    width: 2,
    height: 2,
    band: [1, 1, 1, 10000],
    noData: -9999,
    sourceId: 'fixture-ahn-invalid',
  });

  assert.equal(sample.status, 'invalid_response');
  assert.equal(sample.value, null);
  assert.equal(sample.sourceMetadata.invalidSourcePixels, 1);
});