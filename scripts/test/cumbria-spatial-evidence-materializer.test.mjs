import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  assertManifestRealProbe,
  coordinateEdges,
  ensureExternalDataRoot,
  intersectConvexPolygons,
  parseArguments,
  polygonAreaM2,
} from '../materialize-cumbria-spatial-evidence-cell.mjs';

test('manifest probe comparison ignores nested object key order', () => {
  const receipt = {
    compositionId: 'probe-1',
    selection: {
      h3: '8a1955d9535ffff',
      h3Resolution: 10,
      targetCellAreaM2: 13_257.434_906_005_86,
    },
    composedAt: '2015-12-07T18:00:00.000Z',
    inputReceipts: { terrain: 'terrain-sha', landCover: 'clc-sha' },
    intersectionCounts: { terrain: 13_528, landCover: 4 },
    resultSha256: 'result-sha',
    receiptSha256: 'receipt-sha',
    artifact: {
      sha256: 'artifact-sha',
      contentSha256: 'content-sha',
      bytes: 96_438,
      decodedBytes: 5_645_297,
    },
  };
  const manifest = {
    spatialGridProtocol: {
      evidenceIndex: {
        composition: {
          realEvidenceProbe: {
            artifact: {
              decodedBytes: 5_645_297,
              compressedBytes: 96_438,
              contentSha256: 'content-sha',
              sha256: 'artifact-sha',
            },
            receipt: { sha256: 'receipt-sha' },
            resultSha256: 'result-sha',
            intersectionCounts: { landCover: 4, terrain: 13_528 },
            inputReceiptSha256: {
              landCover: 'clc-sha',
              terrain: 'terrain-sha',
            },
            targetCellAreaM2: 13_257.434_906_005_86,
            composedAt: '2015-12-07T18:00:00.000Z',
            h3Resolution: 10,
            h3: '8a1955d9535ffff',
            id: 'probe-1',
          },
        },
      },
    },
  };

  assert.doesNotThrow(() => assertManifestRealProbe(manifest, receipt));
});

test('native coordinate edges preserve shared cell boundaries', () => {
  assert.deepEqual(coordinateEdges([-3.05, -2.95, -2.85]), [
    -3.0999999999999996,
    -3,
    -2.9000000000000004,
    -2.8,
  ]);
  assert.throws(
    () => coordinateEdges([1, 1]),
    /strictly increasing/,
  );
});

test('convex clipping partitions a target without overlap or uncovered area', () => {
  const target = [
    [0, 0],
    [4, 0],
    [4, 2],
    [0, 2],
  ];
  const left = intersectConvexPolygons(target, [
    [-1, -1],
    [2, -1],
    [2, 3],
    [-1, 3],
  ]);
  const right = intersectConvexPolygons(target, [
    [2, -1],
    [5, -1],
    [5, 3],
    [2, 3],
  ]);
  assert.equal(polygonAreaM2(target), 8);
  assert.equal(polygonAreaM2(left), 4);
  assert.equal(polygonAreaM2(right), 4);
  assert.equal(polygonAreaM2(left) + polygonAreaM2(right), 8);
});

test('convex clipping accepts either clip-polygon winding', () => {
  const target = [
    [0, 0],
    [3, 0],
    [3, 3],
    [0, 3],
  ];
  const clip = [
    [1, 1],
    [2, 1],
    [2, 2],
    [1, 2],
  ];
  assert.equal(polygonAreaM2(intersectConvexPolygons(target, clip)), 1);
  assert.equal(
    polygonAreaM2(intersectConvexPolygons(target, [...clip].reverse())),
    1,
  );
});

test('materializer is dry-run by default and requires an external root', () => {
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
  assert.throws(
    () =>
      ensureExternalDataRoot(
        path.resolve('portable-fixture', 'OneDrive', 'data'),
        repoRoot,
      ),
    /outside OneDrive/,
  );
});
