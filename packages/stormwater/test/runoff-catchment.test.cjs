const test = require('node:test');
const assert = require('node:assert/strict');
const { cellArea, gridDisk } = require('h3-js');

const {
  aggregateCatchmentRunoff,
  deriveRunoff,
  RUNOFF_MODEL_VERSION,
} = require('../dist');
const {
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../../evidence/dist');

const centerCell = '891f1d48907ffff';
const neighboringCells = gridDisk(centerCell, 1).slice(0, 2);
const observedWindow = {
  windowStart: '2026-08-20T00:00:00.000Z',
  windowEnd: '2026-08-21T00:00:00.000Z',
  acquiredAt: '2026-08-21T01:00:00.000Z',
};
const derivedAt = '2026-08-21T01:05:00.000Z';

function fixtureEvidence(value, {
  fixtureId,
  h3 = centerCell,
  unit,
  sourceResolution,
  temporal = observedWindow,
}) {
  return syntheticFixtureEvidence(value, {
    fixtureId,
    unit,
    spatial: {
      h3,
      sourceResolution,
    },
    temporal,
  });
}

function runoffInputs({
  h3 = centerCell,
  rainfallMm = 20,
  slopeDeg = 15,
  landCoverClass = 111,
  temporal = observedWindow,
} = {}) {
  return {
    rainfallMm: fixtureEvidence(rainfallMm, {
      fixtureId: `rain:${h3}`,
      h3,
      unit: 'mm',
      sourceResolution: '0.1 degree',
      temporal,
    }),
    slopeDeg: fixtureEvidence(slopeDeg, {
      fixtureId: `slope:${h3}`,
      h3,
      unit: 'degree',
      sourceResolution: '30 m DEM',
      temporal,
    }),
    landCoverClass: fixtureEvidence(landCoverClass, {
      fixtureId: `clc:${h3}`,
      h3,
      sourceResolution: '100 m',
      temporal,
    }),
  };
}

function missingSlope(h3) {
  return unavailableEvidence(
    'missing',
    'DEM did not cover the cell',
    {
      unit: 'degree',
      spatial: {
        h3,
        sourceResolution: '30 m DEM',
      },
      temporal: observedWindow,
      provenance: {
        provider: 'test-missing-provider',
        dataset: 'test-dem',
      },
    },
  );
}

test('runoff v0 exposes every parameter and physical intermediate', () => {
  const result = deriveRunoff(runoffInputs(), { derivedAt });

  assert.equal(result.output.quality.status, 'synthetic_fixture');
  assert.equal(result.output.value.modelVersion, RUNOFF_MODEL_VERSION);
  assert.equal(result.output.value.rainfallMm, 20);
  assert.equal(result.output.value.slopeDeg, 15);
  assert.equal(result.output.value.landCoverClass, 111);
  assert.equal(result.output.value.imperviousnessProxy, 0.9);
  assert.equal(result.output.value.baseRunoffCoefficient, 0.8);
  assert.equal(result.output.value.slopeAdjustment, 0.05);
  assert.ok(
    Math.abs(result.output.value.runoffCoefficient - 0.85) < 1e-12,
  );
  assert.ok(
    Math.abs(result.output.value.derivedRunoffMm - 17) < 1e-12,
  );
});

test('observed zero rain derives a real zero-depth fixture result', () => {
  const result = deriveRunoff(
    runoffInputs({ rainfallMm: 0 }),
    { derivedAt },
  );

  assert.equal(result.output.value.derivedRunoffMm, 0);
  assert.equal(result.output.quality.missingReason, undefined);
});

test('missing slope remains missing instead of becoming zero degrees', () => {
  const inputs = runoffInputs();
  const result = deriveRunoff(
    {
      ...inputs,
      slopeDeg: missingSlope(centerCell),
    },
    { derivedAt },
  );

  assert.equal(result.output.value, null);
  assert.equal(result.output.quality.status, 'missing');
  assert.match(result.output.quality.missingReason, /slope_deg=missing/);
});

test('invalid CLC values are not replaced by a default class', () => {
  const result = deriveRunoff(
    runoffInputs({ landCoverClass: 0 }),
    { derivedAt },
  );

  assert.equal(result.output.value, null);
  assert.equal(result.output.quality.status, 'invalid_response');
  assert.match(result.output.quality.missingReason, /outside the supported/);
});

test('catchment aggregation uses H3 area and coverage fraction', () => {
  const cells = [
    {
      h3: neighboringCells[0],
      coverageFraction: 1,
      ...runoffInputs({
        h3: neighboringCells[0],
        rainfallMm: 10,
        slopeDeg: 0,
      }),
    },
    {
      h3: neighboringCells[1],
      coverageFraction: 0.5,
      ...runoffInputs({
        h3: neighboringCells[1],
        rainfallMm: 20,
        slopeDeg: 0,
      }),
    },
  ];
  const result = aggregateCatchmentRunoff(
    {
      id: 'catchment-a',
      outletNodeId: 'inlet-a',
      cells,
    },
    { derivedAt },
  );
  const expected =
    (8 / 1000) * cellArea(neighboringCells[0], 'm2') +
    (16 / 1000) * cellArea(neighboringCells[1], 'm2') * 0.5;

  assert.equal(result.status, 'complete');
  assert.equal(result.totalVolumeM3.quality.status, 'synthetic_fixture');
  assert.ok(Math.abs(result.totalVolumeM3.value - expected) < 1e-9);
  assert.equal(
    result.totalVolumeM3.provenance.transformationVersion,
    'h3-area-runoff-aggregation-v0.1.0',
  );
  assert.deepEqual(
    result.totalVolumeM3.provenance.sourceMetadata.h3Resolutions,
    [9],
  );
});

test('one missing cell makes the catchment total incomplete', () => {
  const first = neighboringCells[0];
  const second = neighboringCells[1];
  const secondInputs = runoffInputs({
    h3: second,
    rainfallMm: 20,
    slopeDeg: 0,
  });
  const result = aggregateCatchmentRunoff(
    {
      id: 'catchment-incomplete',
      outletNodeId: 'inlet-a',
      cells: [
        {
          h3: first,
          coverageFraction: 1,
          ...runoffInputs({
            h3: first,
            rainfallMm: 10,
            slopeDeg: 0,
          }),
        },
        {
          h3: second,
          coverageFraction: 1,
          ...secondInputs,
          slopeDeg: missingSlope(second),
        },
      ],
    },
    { derivedAt },
  );
  const knownPartial =
    (8 / 1000) * cellArea(first, 'm2');

  assert.equal(result.status, 'incomplete');
  assert.equal(result.totalVolumeM3.value, null);
  assert.equal(result.totalVolumeM3.quality.status, 'missing');
  assert.ok(
    Math.abs(result.partialAvailableVolumeM3 - knownPartial) < 1e-9,
  );
  assert.ok(result.availableAreaM2 < result.representedAreaM2);
});

test('duplicate H3 cells are rejected as a structural error', () => {
  const cell = {
    h3: centerCell,
    coverageFraction: 1,
    ...runoffInputs(),
  };

  assert.throws(
    () => aggregateCatchmentRunoff(
      {
        id: 'duplicate-catchment',
        outletNodeId: 'inlet-a',
        cells: [cell, cell],
      },
      { derivedAt },
    ),
    /duplicate H3/,
  );
});
