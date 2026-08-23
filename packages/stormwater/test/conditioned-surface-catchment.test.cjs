const test = require('node:test');
const assert = require('node:assert/strict');
const { gridDisk, gridDistance } = require('h3-js');

const {
  buildBoundedSurfaceCatchmentGrid,
  deriveConditionedSurfaceCatchmentProxy,
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
const outfallNodeId = 'waternet:fixture-outfall';
const acquiredAt = '2026-08-23T10:00:00.000Z';
const derivedAt = '2026-08-23T10:01:00.000Z';

function elevation(h3, value) {
  return syntheticFixtureEvidence(value, {
    fixtureId: `conditioned-ahn:${h3}`,
    unit: 'm',
    spatial: { h3, sourceResolution: '0.5 m' },
    temporal: { acquiredAt },
    transformation: 'fixture AHN H3 area mean',
    transformationVersion: 'fixture-v1',
    samplingMethod: 'fixture',
  });
}

function missingElevation(h3) {
  return unavailableEvidence('missing', 'fixture AHN no-data', {
    unit: 'm',
    spatial: { h3, sourceResolution: '0.5 m' },
    temporal: { acquiredAt },
    provenance: {
      provider: 'synthetic-fixture',
      dataset: 'fixture:conditioned-ahn-missing',
      transformation: 'fixture AHN H3 area mean',
      transformationVersion: 'fixture-v1',
      samplingMethod: 'fixture',
    },
  });
}

function surface(h3, surfaceClass = 'vegetated_terrain') {
  return syntheticFixtureEvidence({
    surfaceClass,
    collection: surfaceClass === 'surface_water' ? 'waterdeel' : 'begroeidterreindeel',
    featureId: `feature:${h3}`,
    localId: `local:${h3}`,
  }, {
    fixtureId: `conditioned-bgt:${h3}`,
    spatial: { h3, sourceResolution: 'BGT object geometry; H3 r11 centroid classification' },
    temporal: { acquiredAt },
    transformation: 'fixture BGT centroid class',
    transformationVersion: 'fixture-v1',
    samplingMethod: 'fixture',
  });
}

function fixtureInput() {
  const grid = buildBoundedSurfaceCatchmentGrid({
    bbox,
    h3Resolution: 11,
    outfallPosition,
  });
  const target = new Set(grid.targetH3Indices);
  const rawElevationByH3 = Object.fromEntries(grid.sampledH3Indices.map((h3) => [
    h3,
    elevation(h3, target.has(h3) ? gridDistance(h3, grid.outletH3) : 100),
  ]));
  const surfaceByH3 = Object.fromEntries(grid.targetH3Indices.map((h3) => [
    h3,
    surface(h3),
  ]));
  return {
    id: 'conditioned-amsterdam-fixture',
    outfallNodeId,
    outfallPosition,
    grid,
    rawElevationByH3,
    surfaceByH3,
    derivedAt,
  };
}

test('priority-flood fixture assigns a descending bounded land surface to the conditioned outfall', () => {
  const result = deriveConditionedSurfaceCatchmentProxy(fixtureInput());

  assert.equal(result.modelVersion, 'bounded-bgt-ahn-priority-flood-v0.1.0');
  assert.equal(result.status, 'synthetic_fixture');
  assert.equal(result.counts.targetCells, 14);
  assert.equal(result.counts.contributingCells, 14);
  assert.equal(result.counts.unresolvedConditioningCells, 0);
  assert.equal(result.counts.interpolatedElevationCells, 0);
  assert.equal(result.contributingAreaM2.value, result.partialContributingAreaM2);
  assert.ok(result.contributingAreaM2.value > 0);
  assert.equal(result.outfallAttachment.observed, false);
  assert.equal(result.outfallAttachment.eligibleForSewerPropagation, false);
  assert.equal(result.sewerCatchmentSemantics, 'not_observed');
  assert.ok(Object.values(result.cells).every((cell) =>
    cell.contributesToConditionedOutfall === true &&
    cell.termination === 'conditioned_outfall_terminal',
  ));
});

test('missing AHN remains raw missing while a separate IDW terrain estimate is traceable', () => {
  const input = fixtureInput();
  const missingH3 = input.grid.targetH3Indices.find((h3) => h3 !== input.grid.outletH3);
  assert.ok(missingH3);
  input.rawElevationByH3[missingH3] = missingElevation(missingH3);

  const result = deriveConditionedSurfaceCatchmentProxy(input);
  const cell = result.cells[missingH3];

  assert.equal(cell.rawElevationM.value, null);
  assert.equal(cell.rawElevationM.quality.status, 'missing');
  assert.equal(cell.terrainConditioning.method, 'idw_from_observed_ahn_neighbors');
  assert.ok(cell.terrainElevationM.value !== null);
  assert.ok(cell.terrainConditioning.interpolationSourceH3Indices.length >= 3);
  assert.equal(result.counts.interpolatedElevationCells, 1);
  assert.equal(result.counts.unresolvedConditioningCells, 0);
  assert.notEqual(result.contributingAreaM2.value, null);
});

test('observed BGT water is excluded and becomes an explicit competing terminal', () => {
  const input = fixtureInput();
  const target = new Set(input.grid.targetH3Indices);
  const waterH3 = input.grid.targetH3Indices.find((h3) =>
    h3 !== input.grid.outletH3 && gridDisk(h3, 1).every((neighbor) => target.has(neighbor)),
  );
  assert.ok(waterH3);
  input.surfaceByH3[waterH3] = surface(waterH3, 'surface_water');
  input.rawElevationByH3[waterH3] = missingElevation(waterH3);
  const waterNeighbor = gridDisk(waterH3, 1).find((h3) =>
    h3 !== waterH3 && h3 !== input.grid.outletH3 && target.has(h3),
  );
  assert.ok(waterNeighbor);
  input.rawElevationByH3[waterNeighbor] = elevation(waterNeighbor, -20);

  const result = deriveConditionedSurfaceCatchmentProxy(input);
  const cell = result.cells[waterH3];

  assert.equal(cell.terrainConditioning.method, 'excluded_observed_surface_water');
  assert.equal(cell.rawElevationM.quality.status, 'missing');
  assert.equal(cell.terrainElevationM.value, null);
  assert.equal(cell.termination, 'excluded_observed_surface_water');
  assert.equal(cell.contributesToConditionedOutfall, false);
  assert.equal(result.counts.excludedSurfaceWaterCells, 1);
  assert.ok(result.counts.observedSurfaceWaterExitCells > 0);
  assert.equal(result.counts.unresolvedConditioningCells, 0);
  assert.notEqual(result.contributingAreaM2.value, null);
});

test('observed BGT structural barrier is excluded without becoming a water exit', () => {
  const input = fixtureInput();
  const target = new Set(input.grid.targetH3Indices);
  const barrierH3 = input.grid.targetH3Indices.find((h3) =>
    h3 !== input.grid.outletH3 && gridDisk(h3, 1).every((neighbor) => target.has(neighbor)),
  );
  assert.ok(barrierH3);
  input.surfaceByH3[barrierH3] = surface(barrierH3, 'structural_barrier');
  input.rawElevationByH3[barrierH3] = missingElevation(barrierH3);

  const result = deriveConditionedSurfaceCatchmentProxy(input);
  const cell = result.cells[barrierH3];

  assert.equal(cell.terrainConditioning.method, 'excluded_observed_structural_barrier');
  assert.equal(cell.termination, 'excluded_observed_structural_barrier');
  assert.equal(cell.contributesToConditionedOutfall, false);
  assert.equal(result.counts.excludedStructuralBarrierCells, 1);
  assert.equal(result.counts.unresolvedConditioningCells, 0);
  assert.notEqual(result.contributingAreaM2.value, null);
});
test('priority-flood raises an interior closed depression and records the fill depth', () => {
  const input = fixtureInput();
  const target = new Set(input.grid.targetH3Indices);
  const depressionH3 = input.grid.targetH3Indices.find((h3) =>
    h3 !== input.grid.outletH3 && gridDisk(h3, 1).every((neighbor) => target.has(neighbor)),
  );
  assert.ok(depressionH3);
  input.rawElevationByH3[depressionH3] = elevation(depressionH3, -10);

  const result = deriveConditionedSurfaceCatchmentProxy(input);
  const cell = result.cells[depressionH3];

  assert.equal(cell.rawElevationM.value, -10);
  assert.ok(cell.hydrologicElevationM.value > cell.terrainElevationM.value);
  assert.ok(cell.depressionFillM > 0);
  assert.ok(result.counts.depressionRaisedCells > 0);
});

test('insufficient AHN neighbors keeps the complete area unavailable instead of inventing zero', () => {
  const input = fixtureInput();
  for (const h3 of input.grid.sampledH3Indices) {
    input.rawElevationByH3[h3] = missingElevation(h3);
  }
  const donors = input.grid.sampledH3Indices.slice(0, 2);
  for (const [index, h3] of donors.entries()) {
    input.rawElevationByH3[h3] = elevation(h3, index + 1);
  }

  const result = deriveConditionedSurfaceCatchmentProxy(input);

  assert.equal(result.status, 'missing');
  assert.equal(result.contributingAreaM2.value, null);
  assert.ok(result.counts.unresolvedConditioningCells > 0);
  assert.match(result.contributingAreaM2.quality.missingReason, /incomplete BGT\/AHN terrain conditioning/);
  assert.ok(Object.values(result.cells).every((cell) =>
    cell.rawElevationM.value !== 0 && cell.terrainElevationM.value !== 0,
  ));
});