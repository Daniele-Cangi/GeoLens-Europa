const test = require('node:test');
const assert = require('node:assert/strict');

const { cellToBoundary, latLngToCell } = require('h3-js');
const proj4 = require('proj4');

const {
  availableEvidence,
  composeSpatialEvidenceIndexCell,
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../dist');

const h3 = latLngToCell(54.9, -2.94, 10);
proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs',
);
const targetAreaM2 = projectedH3AreaM2(h3);
const composedAt = '2026-09-02T06:00:00.000Z';
const window = {
  windowStart: '2015-12-04T00:00:00.000Z',
  windowEnd: '2015-12-07T00:00:00.000Z',
  acquiredAt: '2026-09-02T05:00:00.000Z',
};
const staticTemporal = {
  acquiredAt: '2026-09-02T05:00:00.000Z',
};

function fixtureEvidence(value, unit, sourceResolution, id, temporal = window) {
  return syntheticFixtureEvidence(value, {
    fixtureId: `cumbria-spatial-${id}`,
    unit,
    spatial: { sourceResolution },
    temporal,
    transformation: 'deterministic native-grid intersection fixture',
    transformationVersion: '1',
    sourceMetadata: { nativeSourceId: id },
  });
}

function fixtureMissing(status, unit, sourceResolution, id, temporal = window) {
  return unavailableEvidence(
    status,
    `Fixture ${id} is deliberately unavailable`,
    {
      unit,
      spatial: { sourceResolution },
      temporal,
      provenance: {
        provider: 'synthetic-fixture',
        dataset: `fixture:cumbria-spatial-${id}`,
        sourceMetadata: { fixtureId: `cumbria-spatial-${id}` },
      },
    },
  );
}

function completeFixture() {
  return {
    h3,
    composedAt,
    mode: 'synthetic_fixture',
    fixtureId: 'cumbria-native-grid-composition-v0',
    areaReference: {
      horizontalCrs: 'EPSG:27700',
      unit: 'm2',
      measurementMethod: 'projected_h3_boundary_shoelace',
      targetCellAreaM2: targetAreaM2,
    },
    precipitationWindow: {
      start: window.windowStart,
      end: window.windowEnd,
    },
    terrain: [
      {
        id: 'dtm-1m-a',
        intersectionAreaM2: targetAreaM2 * 0.4,
        sourceResolutionMetres: 1,
        evidence: fixtureEvidence(
          100,
          'm',
          '1 m native DTM',
          'dtm-1m-a',
          staticTemporal,
        ),
      },
      {
        id: 'dtm-2m-b',
        intersectionAreaM2: targetAreaM2 * 0.6,
        sourceResolutionMetres: 2,
        evidence: fixtureEvidence(
          110,
          'm',
          '2 m native DTM',
          'dtm-2m-b',
          staticTemporal,
        ),
      },
    ],
    landCover: [
      {
        id: 'clc-211',
        intersectionAreaM2: targetAreaM2 * 0.6,
        evidence: fixtureEvidence(
          211,
          'CLC class code',
          '100 m raster; 25 ha minimum mapping unit',
          'clc-211',
          staticTemporal,
        ),
      },
      {
        id: 'clc-311',
        intersectionAreaM2: targetAreaM2 * 0.4,
        evidence: fixtureEvidence(
          311,
          'CLC class code',
          '100 m raster; 25 ha minimum mapping unit',
          'clc-311',
          staticTemporal,
        ),
      },
    ],
    precipitation: [
      {
        id: 'imerg-west',
        intersectionAreaM2: targetAreaM2 * 0.25,
        evidence: fixtureEvidence(
          40,
          'mm',
          'approximately 0.1 degree; 30 minutes',
          'imerg-west',
        ),
      },
      {
        id: 'imerg-east-observed-zero',
        intersectionAreaM2: targetAreaM2 * 0.75,
        evidence: fixtureEvidence(
          0,
          'mm',
          'approximately 0.1 degree; 30 minutes',
          'imerg-east-observed-zero',
        ),
      },
    ],
  };
}

test('native source footprints compose into a non-physical H3 evidence index', () => {
  const result = composeSpatialEvidenceIndexCell(completeFixture());

  assert.equal(result.version, 'spatial-evidence-index-v0.1.0');
  assert.equal(result.h3, h3);
  assert.equal(result.h3Resolution, 10);
  assert.deepEqual(result.areaReference, completeFixture().areaReference);
  assert.equal(result.targetCellAreaM2, targetAreaM2);
  assert.equal(result.physicalRoutingAllowed, false);
  assert.equal(result.hydraulicStateAllowed, false);

  assert.equal(result.terrain.evidence.quality.status, 'synthetic_fixture');
  assert.deepEqual(result.terrain.evidence.value, {
    coverageFraction: 1,
    nodataFraction: 0,
    minimumElevationM: 100,
    maximumElevationM: 110,
    meanElevationM: 106,
    sourceResolutionCounts: { '1': 1, '2': 1 },
  });
  assert.deepEqual(result.landCover.evidence.value.areaFractionByClcClass, {
    211: 0.6,
    311: 0.4,
  });
  assert.equal(result.landCover.evidence.value.dominantClass, 211);
  assert.equal(result.landCover.evidence.value.dominantClassFraction, 0.6);
  assert.equal(result.precipitation.evidence.value.windowAccumulationMm, 10);
  assert.deepEqual(
    result.precipitation.evidence.value.nativeCellOverlapFraction,
    {
      'imerg-east-observed-zero': 0.75,
      'imerg-west': 0.25,
    },
  );
  assert.equal(
    result.precipitation.evidence.temporal.windowStart,
    window.windowStart,
  );
  assert.equal(result.precipitation.sources.length, 2);
  assert.equal(result.precipitation.sources[1].status, 'synthetic_fixture');
});

test('partial coverage retains diagnostics but cannot expose a partial value', () => {
  const fixture = completeFixture();
  fixture.terrain = [
    {
      ...fixture.terrain[0],
      intersectionAreaM2: targetAreaM2 * 0.8,
    },
  ];
  fixture.precipitation[0].intersectionAreaM2 = targetAreaM2 * 0.5;
  fixture.precipitation[1] = {
    ...fixture.precipitation[1],
    intersectionAreaM2: targetAreaM2 * 0.5,
    evidence: fixtureMissing(
      'incomplete_window',
      'mm',
      'approximately 0.1 degree; 30 minutes',
      'imerg-east-incomplete',
    ),
  };

  const result = composeSpatialEvidenceIndexCell(fixture);

  assert.equal(result.terrain.evidence.value, null);
  assert.equal(result.terrain.evidence.quality.status, 'missing');
  assert.ok(Math.abs(result.terrain.diagnostics.coverageFraction - 0.8) < 1e-12);
  assert.ok(Math.abs(result.terrain.diagnostics.missingFraction - 0.2) < 1e-12);
  assert.equal(result.precipitation.evidence.value, null);
  assert.equal(
    result.precipitation.evidence.quality.status,
    'incomplete_window',
  );
  assert.equal(result.precipitation.diagnostics.coverageFraction, 1);
  assert.equal(result.precipitation.diagnostics.missingFraction, 0.5);
});

test('an empty precipitation layer remains missing with its requested window', () => {
  const fixture = completeFixture();
  fixture.precipitation = [];

  const result = composeSpatialEvidenceIndexCell(fixture);

  assert.equal(result.precipitation.evidence.value, null);
  assert.equal(result.precipitation.evidence.quality.status, 'missing');
  assert.equal(
    result.precipitation.evidence.temporal.windowStart,
    window.windowStart,
  );
  assert.equal(result.precipitation.evidence.temporal.windowEnd, window.windowEnd);
  assert.equal(result.precipitation.diagnostics.coverageFraction, 0);
  assert.equal(result.precipitation.diagnostics.missingFraction, 1);
});

test('real composition rejects synthetic evidence and fixture ids', () => {
  const syntheticInput = completeFixture();
  syntheticInput.mode = 'real_evidence';
  delete syntheticInput.fixtureId;
  assert.throws(
    () => composeSpatialEvidenceIndexCell(syntheticInput),
    /synthetic and cannot enter real evidence composition/,
  );

  const fixtureIdOnReal = completeFixture();
  fixtureIdOnReal.mode = 'real_evidence';
  assert.throws(
    () => composeSpatialEvidenceIndexCell(fixtureIdOnReal),
    /cannot carry a fixture id/,
  );
});

test('complete real evidence retains source lineage and observed zero', () => {
  const input = completeFixture();
  input.mode = 'real_evidence';
  delete input.fixtureId;
  for (const intersection of [
    ...input.terrain,
    ...input.landCover,
    ...input.precipitation,
  ]) {
    const fixture = intersection.evidence;
    intersection.evidence = availableEvidence(fixture.value, {
      unit: fixture.unit,
      spatial: fixture.spatial,
      temporal: fixture.temporal,
      provenance: {
        provider: 'verified-source',
        dataset: intersection.id,
        datasetVersion: 'test-version',
      },
    });
  }

  const result = composeSpatialEvidenceIndexCell(input);

  assert.equal(result.precipitation.evidence.quality.status, 'available');
  assert.equal(result.precipitation.evidence.value.windowAccumulationMm, 10);
  assert.equal(result.precipitation.evidence.provenance.provider, 'GeoLens');
  assert.deepEqual(
    result.precipitation.evidence.provenance.sourceMetadata.sourceProviders,
    ['verified-source'],
  );
  assert.equal(result.precipitation.sources[0].datasetVersion, 'test-version');
});

test('composition rejects overlapping footprints and false H3-native sources', () => {
  const overlap = completeFixture();
  overlap.landCover[0].intersectionAreaM2 = targetAreaM2 * 0.7;
  overlap.landCover[1].intersectionAreaM2 = targetAreaM2 * 0.4;
  assert.throws(
    () => composeSpatialEvidenceIndexCell(overlap),
    /overlapping source footprints must be resolved/,
  );

  const falseH3Native = completeFixture();
  falseH3Native.terrain[0].evidence = {
    ...falseH3Native.terrain[0].evidence,
    spatial: {
      ...falseH3Native.terrain[0].evidence.spatial,
      h3,
    },
  };
  assert.throws(
    () => composeSpatialEvidenceIndexCell(falseH3Native),
    /must retain native geometry rather than claim H3-native evidence/,
  );
});

test('composition rejects mismatched precipitation windows and invalid CLC classes', () => {
  const windows = completeFixture();
  windows.precipitation[1].evidence = fixtureEvidence(
    0,
    'mm',
    'approximately 0.1 degree; 30 minutes',
    'imerg-other-window',
    {
      ...window,
      windowStart: '2015-12-04T00:30:00.000Z',
    },
  );
  assert.throws(
    () => composeSpatialEvidenceIndexCell(windows),
    /must use the requested identical window/,
  );

  const invalidClass = completeFixture();
  invalidClass.landCover[0].evidence = fixtureEvidence(
    0,
    'CLC class code',
    '100 m raster; 25 ha minimum mapping unit',
    'clc-invalid',
  );
  assert.throws(
    () => composeSpatialEvidenceIndexCell(invalidClass),
    /positive integer CLC class/,
  );

  const negativeRainfall = completeFixture();
  negativeRainfall.precipitation[0].evidence = fixtureEvidence(
    -1,
    'mm',
    'approximately 0.1 degree; 30 minutes',
    'imerg-negative',
  );
  assert.throws(
    () => composeSpatialEvidenceIndexCell(negativeRainfall),
    /cannot contain negative rainfall/,
  );

  const futureAcquisition = completeFixture();
  futureAcquisition.terrain[0].evidence = fixtureEvidence(
    100,
    'm',
    '1 m native DTM',
    'future-terrain',
    { acquiredAt: '2026-09-02T07:00:00.000Z' },
  );
  assert.throws(
    () => composeSpatialEvidenceIndexCell(futureAcquisition),
    /was acquired after composition/,
  );
});

function projectedH3AreaM2(cell) {
  const points = cellToBoundary(cell).map(([lat, lon]) =>
    proj4('EPSG:4326', 'EPSG:27700', [lon, lat]),
  );
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [leftX, leftY] = points[index];
    const [rightX, rightY] = points[(index + 1) % points.length];
    twiceArea += leftX * rightY - rightX * leftY;
  }
  return Math.abs(twiceArea) / 2;
}
