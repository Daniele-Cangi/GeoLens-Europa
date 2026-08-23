const test = require('node:test');
const assert = require('node:assert/strict');
const { gridDistance } = require('h3-js');

const {
  buildBoundedSurfaceCatchmentGrid,
  deriveSurfaceCatchmentProxy,
} = require('../dist');
const {
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../../evidence/dist');

const bbox = {
  latMin: 52.3375,
  lonMin: 4.8978,
  latMax: 52.3395,
  lonMax: 4.8995,
};
const outfallPosition = {
  lat: 52.33807928535426,
  lon: 4.898945130628371,
};
const outfallNodeId =
  'waternet:8522CE11-8DC1-41CC-9375-EDECAB742620';
const acquiredAt = '2026-08-23T10:00:00.000Z';
const derivedAt = '2026-08-23T10:01:00.000Z';

function elevationEvidence(h3, value) {
  return syntheticFixtureEvidence(value, {
    fixtureId: `surface-dem:${h3}`,
    unit: 'm',
    spatial: {
      h3,
      sourceResolution: '1 arc-second (~30 m at equator)',
    },
    temporal: {
      observedAt: '2021-01-01T00:00:00.000Z',
      acquiredAt,
    },
    transformation: 'sample DEM at H3 centroid',
    transformationVersion: 'dem-centroid-v0.1.0',
    samplingMethod: 'nearest source raster pixel',
  });
}

function fixtureInput() {
  const grid = buildBoundedSurfaceCatchmentGrid({
    bbox,
    h3Resolution: 11,
    outfallPosition,
  });
  const target = new Set(grid.targetH3Indices);
  const elevationByH3 = Object.fromEntries(
    grid.sampledH3Indices.map((h3) => [
      h3,
      elevationEvidence(
        h3,
        target.has(h3)
          ? gridDistance(h3, grid.outletH3)
          : 100,
      ),
    ]),
  );

  return {
    id: 'amsterdam-outfall-surface-proxy',
    outfallNodeId,
    outfallPosition,
    grid,
    elevationByH3,
    derivedAt,
  };
}

test('bounded grid selects H3 centroids and a one-ring sampling halo', () => {
  const input = fixtureInput();

  assert.equal(input.grid.h3Resolution, 11);
  assert.equal(input.grid.targetH3Indices.length, 14);
  assert.ok(
    input.grid.sampledH3Indices.length >
      input.grid.targetH3Indices.length,
  );
  assert.ok(
    input.grid.targetH3Indices.includes(input.grid.outletH3),
  );
  assert.equal(input.grid.boundaryHaloRings, 1);
});

test('surface proxy deterministically routes a bounded synthetic surface to the forced outfall cell', () => {
  const result = deriveSurfaceCatchmentProxy(fixtureInput());

  assert.equal(result.status, 'synthetic_fixture');
  assert.equal(
    result.modelVersion,
    'bounded-h3-single-flow-surface-proxy-v0.1.0',
  );
  assert.equal(result.coverage.targetCellCount, 14);
  assert.equal(result.counts.contributingCells, 14);
  assert.equal(result.counts.coverageExitCells, 0);
  assert.equal(result.counts.localDepressionCells, 0);
  assert.equal(result.counts.incompleteElevationCells, 0);
  assert.equal(
    result.contributingAreaM2.value,
    result.partialContributingAreaM2,
  );
  assert.ok(result.contributingAreaM2.value > 0);
  assert.equal(result.sewerCatchmentSemantics, 'not_asserted');
  assert.equal(
    result.outfallAnchor.conditioning,
    'force_outfall_h3_as_terminal_pour_point',
  );
  assert.equal(
    result.cells[result.outfallAnchor.h3].flowMethod,
    'forced_outlet_terminal',
  );
  assert.ok(
    Object.values(result.cells).every(
      (cell) =>
        cell.boundary.length === 7 &&
        cell.termination === 'outlet_proxy' &&
        cell.contributesToOutletProxy === true,
    ),
  );
});

test('one missing halo elevation makes area explicitly unavailable instead of zero', () => {
  const input = fixtureInput();
  const target = new Set(input.grid.targetH3Indices);
  const missingH3 = input.grid.sampledH3Indices.find(
    (h3) => !target.has(h3),
  );

  assert.ok(missingH3);
  input.elevationByH3[missingH3] = unavailableEvidence(
    'missing',
    'fixture DEM pixel is missing',
    {
      unit: 'm',
      spatial: {
        h3: missingH3,
        sourceResolution: '1 arc-second (~30 m at equator)',
      },
      temporal: {
        observedAt: '2021-01-01T00:00:00.000Z',
        acquiredAt,
      },
      provenance: {
        provider: 'synthetic-fixture',
        dataset: 'fixture:surface-dem-missing',
        transformation: 'sample DEM at H3 centroid',
        transformationVersion: 'dem-centroid-v0.1.0',
        samplingMethod: 'nearest source raster pixel',
      },
    },
  );

  const result = deriveSurfaceCatchmentProxy(input);

  assert.equal(result.status, 'missing');
  assert.equal(result.contributingAreaM2.value, null);
  assert.match(
    result.contributingAreaM2.quality.missingReason,
    /required DEM evidence is unavailable/,
  );
  assert.ok(result.counts.incompleteElevationCells > 0);
  assert.ok(result.partialContributingAreaM2 >= 0);
});

test('surface proxy rejects a bbox that cannot represent its outfall cell', () => {
  assert.throws(
    () =>
      buildBoundedSurfaceCatchmentGrid({
        bbox: {
          latMin: 52.339,
          lonMin: 4.8978,
          latMax: 52.3395,
          lonMax: 4.8995,
        },
        h3Resolution: 11,
        outfallPosition,
      }),
    /outfall must lie inside the analysis bbox/,
  );
});