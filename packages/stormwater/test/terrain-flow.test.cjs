const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TERRAIN_FLOW_DIRECTION_MISSING,
  TERRAIN_FLOW_TERMINAL_CODES,
  deriveTerrainFlowConcentration,
} = require('../dist');

function fixture({ elevations, water, inside } = {}) {
  const width = 5;
  const height = 5;
  const cellCount = width * height;
  return {
    width,
    height,
    cellSizeM: 30,
    insideAoi: inside ?? new Uint8Array(cellCount).fill(1),
    elevationM:
      elevations ??
      Float32Array.from({ length: cellCount }, (_, index) => index % width),
    knownPermanentWater:
      water ?? new Uint8Array(cellCount),
  };
}

test('D8 routes strictly downhill and conserves represented land area', () => {
  const result = deriveTerrainFlowConcentration(fixture());
  const row = 2;
  const westBoundary = row * 5;
  const firstInterior = westBoundary + 1;
  const thirdInterior = westBoundary + 3;

  assert.equal(result.modelVersion, 'bounded-d8-steepest-descent-v0.1.0');
  assert.equal(result.directionCode[firstInterior], 6);
  assert.equal(result.downstreamIndex[firstInterior], westBoundary);
  assert.equal(result.terminalIndex[thirdInterior], westBoundary);
  assert.equal(
    result.terminalTypeCode[westBoundary],
    TERRAIN_FLOW_TERMINAL_CODES.analysis_boundary,
  );
  assert.equal(result.upstreamLandCellCount[westBoundary], 4);
  assert.equal(result.contributingLandAreaM2[westBoundary], 3600);
  assert.deepEqual(result.massBalance, {
    sourceLandAreaM2: 22500,
    terminalAccumulatedLandAreaM2: 22500,
    differenceM2: 0,
  });
  assert.equal(result.semantics.depressions, 'retained_without_filling');
});

test('an interior closed depression remains an explicit terminal', () => {
  const elevations = new Float32Array(25).fill(10);
  elevations[12] = 0;
  const result = deriveTerrainFlowConcentration(fixture({ elevations }));

  assert.equal(result.directionCode[12], -1);
  assert.equal(
    result.terminalTypeCode[12],
    TERRAIN_FLOW_TERMINAL_CODES.local_depression,
  );
  assert.ok(result.upstreamLandCellCount[12] > 1);
  assert.ok(result.counts.localDepressionTerminalCells > 0);
});

test('known permanent water receives land flow but contributes no source area', () => {
  const elevations = Float32Array.from(
    { length: 25 },
    (_, index) => {
      const row = Math.floor(index / 5);
      const column = index % 5;
      return Math.abs(row - 2) + Math.abs(column - 2);
    },
  );
  const water = new Uint8Array(25);
  water[12] = 1;
  const result = deriveTerrainFlowConcentration(
    fixture({ elevations, water }),
  );

  assert.equal(result.counts.eligibleLandCells, 24);
  assert.equal(result.counts.knownPermanentWaterCells, 1);
  assert.equal(
    result.terminalTypeCode[12],
    TERRAIN_FLOW_TERMINAL_CODES.known_permanent_water,
  );
  assert.ok(result.contributingLandAreaM2[12] > 0);
  assert.equal(result.massBalance.sourceLandAreaM2, 24 * 900);
  assert.equal(result.massBalance.differenceM2, 0);
});

test('missing elevation never becomes zero or a completed depression', () => {
  const elevations = new Float32Array(25).fill(10);
  elevations[11] = 0;
  elevations[12] = Number.NaN;
  const result = deriveTerrainFlowConcentration(fixture({ elevations }));

  assert.equal(result.counts.missingElevationCells, 1);
  assert.equal(result.directionCode[12], TERRAIN_FLOW_DIRECTION_MISSING);
  assert.equal(result.terminalTypeCode[12], 255);
  assert.ok(Number.isNaN(result.contributingLandAreaM2[12]));
  assert.equal(
    result.terminalTypeCode[11],
    TERRAIN_FLOW_TERMINAL_CODES.incomplete_input_boundary,
  );
  assert.equal(result.massBalance.differenceM2, 0);
});

test('mask contracts reject outside-AOI water values that could look observed', () => {
  const input = fixture();
  input.insideAoi[0] = 0;

  assert.throws(
    () => deriveTerrainFlowConcentration(input),
    /must be 255 outside the AOI/,
  );
});
