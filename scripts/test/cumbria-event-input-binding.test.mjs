import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRainfallMapping,
  buildRiverFootprintMapping,
  parseArguments,
} from '../materialize-cumbria-event-input-binding.mjs';

const mesh = {
  id: 'fixture-10m',
  width: 2,
  height: 1,
  cellCount: 2,
  cellSizeMetres: 10,
};
const domain = { bounds: [0, 0, 20, 10] };

function rectangle([west, south, east, north]) {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
}

function source(index, bounds) {
  return { index, bounds, polygon: rectangle(bounds) };
}

test('rainfall binding preserves native indices and exact valid-cell coverage', () => {
  const mapping = buildRainfallMapping({
    mesh,
    domain,
    validMask: Uint8Array.from([1, 1]),
    sourceFootprints: [source(3, [0, 0, 10, 10]), source(7, [10, 0, 20, 10])],
  });
  assert.deepEqual([...mapping.offsets], [0, 1, 2]);
  assert.deepEqual([...mapping.sourceIndices], [3, 7]);
  assert.deepEqual([...mapping.areaFractions], [1, 1]);
  assert.deepEqual(mapping.summary, {
    mappedValidCellCount: 2,
    mappingEntryCount: 2,
    minimumEntriesPerValidCell: 1,
    maximumEntriesPerValidCell: 1,
    maximumCoverageDeviationFraction: 0,
  });
});

test('rainfall binding fails closed when a valid cell has no source coverage', () => {
  assert.throws(
    () =>
      buildRainfallMapping({
        mesh,
        domain,
        validMask: Uint8Array.from([1, 1]),
        sourceFootprints: [source(0, [0, 0, 10, 10])],
      }),
    /incomplete or overlapping IMERG coverage/,
  );
});

test('rainfall binding leaves invalid solver cells unmapped', () => {
  const mapping = buildRainfallMapping({
    mesh,
    domain,
    validMask: Uint8Array.from([1, 0]),
    sourceFootprints: [source(0, [0, 0, 10, 10])],
  });
  assert.deepEqual([...mapping.offsets], [0, 1, 1]);
  assert.deepEqual([...mapping.sourceIndices], [0]);
  assert.equal(mapping.summary.mappedValidCellCount, 1);
});

test('river binding distributes discharge by intersected valid area', () => {
  const mapping = buildRiverFootprintMapping({
    mesh,
    domain,
    validMask: Uint8Array.from([1, 1]),
    centreBng: [10, 5],
    sideMetres: 10,
  });
  assert.deepEqual([...mapping.cellIndices], [0, 1]);
  assert.deepEqual([...mapping.weights], [0.5, 0.5]);
  assert.equal(mapping.summary.intersectedValidAreaM2, 100);
  assert.equal(mapping.summary.validAreaFraction, 1);
  assert.equal(mapping.summary.weightSum, 1);

  const partial = buildRiverFootprintMapping({
    mesh,
    domain,
    validMask: Uint8Array.from([1, 0]),
    centreBng: [10, 5],
    sideMetres: 10,
  });
  assert.deepEqual([...partial.cellIndices], [0]);
  assert.deepEqual([...partial.weights], [1]);
  assert.equal(partial.summary.validAreaFraction, 0.5);
});

test('event-input materializer is dry-run by default', () => {
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
});
