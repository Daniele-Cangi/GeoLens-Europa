import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cellArea, polygonToCells } from 'h3-js';

import { assertCumbriaAccessManifest } from '../packages/evidence/dist/index.js';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  readFileSync(
    path.join(
      repositoryRoot,
      'tests',
      'ground-truth',
      'cumbria-2015',
      'manifest.json',
    ),
    'utf8',
  ),
);

assertCumbriaAccessManifest(manifest);

const protocol = manifest.spatialGridProtocol;
const [west, south, east, north] = protocol.evidenceIndex.envelopeBounds;
const polygon = [
  [south, west],
  [south, east],
  [north, east],
  [north, west],
  [south, west],
];
const cells = polygonToCells(polygon, protocol.evidenceIndex.resolution).sort();
const selectionSha256 = createHash('sha256')
  .update(JSON.stringify(cells))
  .digest('hex');

if (cells.length !== protocol.evidenceIndex.cellCount) {
  throw new Error('Cumbria H3 evidence-index cell count drifted');
}
if (selectionSha256 !== protocol.evidenceIndex.selectionSha256) {
  throw new Error('Cumbria H3 evidence-index identity drifted');
}

let minimumCellAreaM2 = Number.POSITIVE_INFINITY;
let maximumCellAreaM2 = Number.NEGATIVE_INFINITY;
let totalCellAreaM2 = 0;
for (const cell of cells) {
  const areaM2 = cellArea(cell, 'm2');
  minimumCellAreaM2 = Math.min(minimumCellAreaM2, areaM2);
  maximumCellAreaM2 = Math.max(maximumCellAreaM2, areaM2);
  totalCellAreaM2 += areaM2;
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: 'dry_run',
      networkRequests: 0,
      filesWritten: 0,
      protocolId: protocol.id,
      state: protocol.state,
      sourceGrids: protocol.sourceGrids,
      evidenceIndex: {
        ...protocol.evidenceIndex,
        selectionSha256,
        minimumCellAreaM2,
        maximumCellAreaM2,
        meanCellAreaM2: totalCellAreaM2 / cells.length,
      },
      exchangeFrame: protocol.exchangeFrame,
      solverMesh: protocol.solverMesh,
    },
    null,
    2,
  ),
);
