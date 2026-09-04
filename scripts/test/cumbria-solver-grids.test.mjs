import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  aggregateCompleteBlocks,
  computePredictionEligibilityMask,
  parseArguments,
  weightedParameterSummary,
} from '../materialize-cumbria-solver-grids.mjs';
import { ensureExternalDataRoot } from '../materialize-cumbria-spatial-evidence-cell.mjs';

function floatGrid(values) {
  const result = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => result.writeFloatLE(value, index * 4));
  return result;
}

test('terrain aggregation requires every native pixel in a solver cell', () => {
  const missing = -3.4028234663852886e38;
  const result = aggregateCompleteBlocks(
    floatGrid([
      1, 2, 10, 10,
      3, 4, 10, 10,
      5, 6, missing, 8,
      7, 8, 9, 10,
    ]),
    4,
    4,
    2,
    missing,
  );
  assert.deepEqual([...result.valid], [1, 1, 1, 0]);
  assert.equal(result.values[0], 2.5);
  assert.equal(result.values[1], 10);
  assert.equal(result.values[2], 6.5);
  assert.equal(Number.isNaN(result.values[3]), true);
});

test('prediction eligibility excludes only valid cells touching missing state', () => {
  const valid = Uint8Array.from([
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
    1, 1, 0, 1, 1,
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
  ]);
  assert.deepEqual(
    [...computePredictionEligibilityMask(valid, 5, 5, 1)],
    [
      1, 1, 1, 1, 1,
      1, 0, 0, 0, 1,
      1, 0, 0, 0, 1,
      1, 0, 0, 0, 1,
      1, 1, 1, 1, 1,
    ],
  );
});

test('land-cover parameters are weighted by area without categorical interpolation', () => {
  const summary = weightedParameterSummary(
    [
      {
        classCode: 211,
        areaM2: 75,
        runoffCoefficient: { low: 0.25, primary: 0.5, high: 0.75 },
        manningN: { low: 0.035, primary: 0.06, high: 0.1 },
      },
      {
        classCode: 112,
        areaM2: 25,
        runoffCoefficient: { low: 0.5, primary: 0.7, high: 0.85 },
        manningN: { low: 0.05, primary: 0.08, high: 0.12 },
      },
    ],
    100,
  );
  assert.equal(summary.available, true);
  assert.equal(summary.classCount, 2);
  assert.equal(summary.dominantClass, 211);
  assert.equal(summary.dominantClassFraction, 0.75);
  assert.equal(summary.runoffCoefficient.primary, 0.55);
  assert.equal(summary.manningN.primary, 0.065);
  assert.equal(
    weightedParameterSummary(
      [
        {
          classCode: 211,
          areaM2: 99,
          runoffCoefficient: { low: 0.25, primary: 0.5, high: 0.75 },
          manningN: { low: 0.035, primary: 0.06, high: 0.1 },
        },
      ],
      100,
    ).available,
    false,
  );
});

test('solver-grid materializer is dry-run by default and external-root only', () => {
  assert.deepEqual(parseArguments(['--data-root', 'C:\\GeoLens']), {
    dataRoot: 'C:\\GeoLens',
    mode: 'dry_run',
  });
  assert.equal(
    parseArguments(['--data-root', 'C:\\GeoLens', '--execute']).mode,
    'execute',
  );
  assert.equal(
    parseArguments(['--data-root', 'C:\\GeoLens', '--check']).mode,
    'check',
  );
  assert.throws(() => parseArguments([]), /--data-root is required/);
  assert.throws(
    () =>
      parseArguments([
        '--data-root',
        'C:\\GeoLens',
        '--execute',
        '--check',
      ]),
    /Choose only one/,
  );
  const repoRoot = path.resolve('portable-fixture', 'repository');
  assert.throws(
    () => ensureExternalDataRoot(repoRoot, repoRoot),
    /outside the Git repository/,
  );
});
