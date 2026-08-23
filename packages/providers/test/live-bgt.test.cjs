const test = require('node:test');
const assert = require('node:assert/strict');
const { latLngToCell } = require('h3-js');
const {
  PdokBgtSurfaceClient,
  classifyBgtSurfaceH3Cells,
} = require('../dist');

const enabled = process.env.GEO_LENS_LIVE_BGT === '1';

test('live PDOK BGT returns bounded current physical surfaces', { skip: !enabled }, async () => {
  const acquisition = await new PdokBgtSurfaceClient().acquire({
    bbox: {
      latMin: 52.3375,
      lonMin: 4.8978,
      latMax: 52.3395,
      lonMax: 4.8995,
    },
  });

  assert.equal(acquisition.status, 'available');
  assert.ok(acquisition.features.length > 0);
  assert.equal(acquisition.receipt.collections.length, 8);
  assert.equal(acquisition.receipt.license, 'CC0 1.0');
  assert.ok(acquisition.features.every((feature) =>
    feature.relativeHeight === 0 && feature.status === 'bestaand',
  ));

  const outfallH3 = latLngToCell(52.33807928535426, 4.898945130628371, 13);
  const surfaces = classifyBgtSurfaceH3Cells({
    acquisition,
    h3Indices: [outfallH3],
  });
  assert.equal(surfaces.cells[outfallH3].quality.status, 'available');
  assert.notEqual(surfaces.cells[outfallH3].value, null);
});