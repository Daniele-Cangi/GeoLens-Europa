import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  alignedSourceWindow,
  buildExportUrl,
  classifyRgbaPixels,
  ensureExternalDataRoot,
  parseArguments,
  rendererCodeMap,
} from '../materialize-cumbria-clc2012.mjs';

test('Cumbria domain maps to an aligned native 100 m CLC window', () => {
  const projected = [
    [3487931.7, 3607759.8],
    [3495806.4, 3606436.4],
    [3496991.0, 3613353.1],
    [3489116.2, 3614676.7],
  ];
  let index = 0;
  const window = alignedSourceWindow(
    [332000, 556000, 340000, 563000],
    () => projected[index++],
  );
  assert.deepEqual(window.sourceBounds, [3487900, 3606400, 3497000, 3614700]);
  assert.equal(window.sourceWidth, 91);
  assert.equal(window.sourceHeight, 83);
  const url = new URL(buildExportUrl(window));
  assert.equal(url.searchParams.get('bboxSR'), '3035');
  assert.equal(url.searchParams.get('size'), '91,83');
  assert.equal(url.searchParams.get('layers'), 'show:1');
});

test('renderer colours decode to class values while transparent cells stay missing', () => {
  const metadata = {
    drawingInfo: {
      renderer: {
        type: 'uniqueValue',
        field1: 'Code_12',
        uniqueValueInfos: Array.from({ length: 44 }, (_, index) => ({
          value: String(111 + index),
          symbol: { color: [index, index + 1, index + 2, 255] },
        })),
      },
    },
  };
  const colors = rendererCodeMap(metadata);
  const result = classifyRgbaPixels(
    Uint8Array.from([0, 1, 2, 255, 1, 2, 3, 255, 255, 255, 255, 0]),
    colors,
  );
  assert.deepEqual([...result.values], [111, 112, -1]);
  assert.equal(result.missingCellCount, 1);
  assert.deepEqual(result.classCounts, { 111: 1, 112: 1 });
});

test('unknown visible renderer colours fail rather than becoming a class or zero', () => {
  assert.throws(
    () =>
      classifyRgbaPixels(
        Uint8Array.from([1, 2, 3, 255]),
        new Map([['4,5,6', 211]]),
      ),
    /no Code_12 mapping/,
  );
});

test('partially transparent renderer pixels fail rather than becoming evidence', () => {
  assert.throws(
    () =>
      classifyRgbaPixels(
        Uint8Array.from([1, 2, 3, 128]),
        new Map([['1,2,3', 211]]),
      ),
    /partial alpha 128/,
  );
});

test('materializer requires an explicit external non-OneDrive root', () => {
  const repositoryRoot = path.resolve('portable-fixture', 'repository');
  assert.throws(() => parseArguments([]), /--data-root is required/);
  assert.throws(
    () => ensureExternalDataRoot(path.join(repositoryRoot, 'data'), repositoryRoot),
    /outside the Git repository/,
  );
  assert.throws(
    () =>
      ensureExternalDataRoot(
        path.resolve(repositoryRoot, '..', 'OneDrive', 'data'),
        repositoryRoot,
      ),
    /outside OneDrive/,
  );
});
