import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundsForGridRef,
  containsBounds,
  ensureExternalDataRoot,
  parseArguments,
  pixelStatistics,
  pixelWindow,
  selectRasterCandidate,
} from '../materialize-cumbria-dtm-masks.mjs';

test('Cumbria 1 km OS references map to exact BNG bounds and pixel windows', () => {
  const bounds = boundsForGridRef('NY3557');
  assert.deepEqual(bounds, [335000, 557000, 336000, 558000]);
  assert.equal(
    containsBounds([334000, 556000, 336000, 558000], bounds),
    true,
  );
  assert.deepEqual(
    pixelWindow([334000, 556000, 336000, 558000], bounds),
    [1000, 0, 2000, 1000],
  );
});

test('partial source coverage is never accepted as a complete grid mask', () => {
  assert.equal(
    containsBounds(
      [334000, 556000, 335500, 558000],
      [335000, 557000, 336000, 558000],
    ),
    false,
  );
});

test('overlapping rasters resolve only by the latest pre-event survey window', () => {
  const older = {
    surveyStart: '2009-03-17',
    surveyEnd: '2009-04-12',
    receipt: { sha256: 'a'.repeat(64) },
  };
  const selected = {
    surveyStart: '2009-03-17',
    surveyEnd: '2009-04-20',
    receipt: { sha256: 'b'.repeat(64) },
  };
  assert.equal(
    selectRasterCandidate(
      [older, selected],
      { product: 'lidar_tiles_dtm', year: '2009', resolutionMetres: 1, tile: 'NY3560' },
      'NY3862',
    ),
    selected,
  );
  assert.throws(
    () =>
      selectRasterCandidate(
        [selected, { ...selected, receipt: { sha256: 'c'.repeat(64) } }],
        { product: 'lidar_tiles_dtm', year: '2009', resolutionMetres: 1, tile: 'NY3560' },
        'NY3862',
      ),
    /equally dated/,
  );
});

test('pixel statistics preserve NoData and reject implausible values', () => {
  const noData = -3.4028234663852886e38;
  assert.deepEqual(
    pixelStatistics(new Float32Array([noData, 1.25, 4.5]), noData),
    {
      validCellCount: 2,
      noDataCellCount: 1,
      minimumElevationM: 1.25,
      maximumElevationM: 4.5,
    },
  );
  assert.throws(
    () => pixelStatistics(new Float32Array([Number.NaN]), noData),
    /Invalid DTM elevation/,
  );
});

test('materializer requires an explicit external non-OneDrive root', () => {
  assert.throws(() => parseArguments([]), /--data-root is required/);
  assert.throws(
    () => ensureExternalDataRoot('C:\\repo\\data', 'C:\\repo'),
    /outside the Git repository/,
  );
  assert.throws(
    () => ensureExternalDataRoot('C:\\Users\\test\\OneDrive\\data', 'C:\\repo'),
    /outside OneDrive/,
  );
});
