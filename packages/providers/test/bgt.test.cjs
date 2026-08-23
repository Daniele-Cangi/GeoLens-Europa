const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cellToBoundary,
  latLngToCell,
} = require('h3-js');

const {
  PdokBgtSurfaceClient,
  classifyBgtSurfaceH3Cells,
  pointInBgtMultiPolygon,
} = require('../dist');

const bbox = {
  latMin: 52.3375,
  lonMin: 4.8978,
  latMax: 52.3395,
  lonMax: 4.8995,
};
const requestedAt = '2026-08-23T10:00:00.000Z';
const h3 = latLngToCell(52.33807928535426, 4.898945130628371, 13);
const boundary = cellToBoundary(h3).map(([lat, lon]) => [lon, lat]);
boundary.push(boundary[0]);

function feature(collection, id = `feature-${collection}`) {
  return {
    type: 'Feature',
    id,
    properties: {
      bronhouder: 'G0363',
      creation_date: '2020-01-01T00:00:00Z',
      eind_registratie: null,
      fysiek_voorkomen: collection === 'wegdeel' ? 'open verharding' : null,
      functie: collection === 'wegdeel' ? 'voetpad' : null,
      lokaal_id: `G0363.${id}`,
      lv_publicatiedatum: '2026-08-22T12:00:00Z',
      relatieve_hoogteligging: 0,
      status: 'bestaand',
      termination_date: null,
      tijdstip_registratie: '2026-08-22T11:00:00Z',
      type: collection === 'waterdeel' ? 'waterloop' : null,
      version: `version-${id}`,
    },
    geometry: {
      type: collection === 'pand' ? 'MultiPolygon' : 'Polygon',
      coordinates: collection === 'pand' ? [[[...boundary]]] : [[...boundary]],
    },
  };
}

function collectionId(url) {
  return new URL(url).pathname.split('/').at(-2);
}

function fixtureTransport(featuresByCollection = {}, statusByCollection = {}) {
  const calls = [];
  return {
    calls,
    async getJson(url) {
      calls.push(url);
      const collection = collectionId(url);
      const status = statusByCollection[collection] ?? 200;
      const features = featuresByCollection[collection] ?? [];
      return {
        status,
        body: status === 200 ? {
          type: 'FeatureCollection',
          timeStamp: '2026-08-23T10:00:01.000Z',
          numberReturned: features.length,
          features,
          links: [],
        } : null,
      };
    },
  };
}

function client(transport) {
  return new PdokBgtSurfaceClient({
    transport,
    now: () => new Date(requestedAt),
  });
}

test('bounded BGT acquisition retains eight source receipts and classifies level-zero H3 surface', async () => {
  const transport = fixtureTransport({
    begroeidterreindeel: [feature('begroeidterreindeel', 'terrain')],
    waterdeel: [feature('waterdeel', 'water')],
  });
  const acquisition = await client(transport).acquire({ bbox, requestedAt });

  assert.equal(acquisition.status, 'available');
  assert.equal(acquisition.features.length, 2);
  assert.equal(acquisition.receipt.featureCount, 2);
  assert.equal(acquisition.receipt.collections.length, 8);
  assert.equal(acquisition.receipt.license, 'CC0 1.0');
  assert.equal(transport.calls.length, 8);
  for (const requestUrl of transport.calls) {
    const url = new URL(requestUrl);
    assert.equal(url.searchParams.get('bbox'), '4.8978,52.3375,4.8995,52.3395');
    assert.equal(url.searchParams.get('datetime'), requestedAt);
    assert.equal(url.searchParams.get('limit'), '1000');
  }

  const result = classifyBgtSurfaceH3Cells({
    acquisition,
    h3Indices: [h3],
  });
  const evidence = result.cells[h3];
  assert.equal(evidence.quality.status, 'available');
  assert.equal(evidence.value.surfaceClass, 'surface_water');
  assert.equal(evidence.value.collection, 'waterdeel');
  assert.equal(evidence.value.containingFeatureCount, 2);
  assert.deepEqual(evidence.value.containingFeatureIds, ['water', 'terrain']);
  assert.equal(result.counts.surface_water, 1);
  assert.match(evidence.spatial.sourceResolution, /BGT object geometry; H3 r13/);
  assert.equal(evidence.provenance.sourceMetadata.selectedFeatureVersion, 'version-water');
});

test('BGT provider preserves upstream failure and cannot classify it as a valid surface', async () => {
  const transport = fixtureTransport({}, { pand: 503 });
  const acquisition = await client(transport).acquire({ bbox, requestedAt });
  assert.equal(acquisition.status, 'upstream_error');
  assert.equal(acquisition.features.length, 0);

  const result = classifyBgtSurfaceH3Cells({
    acquisition,
    h3Indices: [h3],
  });
  assert.equal(result.cells[h3].quality.status, 'upstream_error');
  assert.equal(result.cells[h3].value, null);
  assert.equal(result.counts.unclassified, 1);
});

test('BGT provider rejects pagination instead of accepting a truncated mosaic', async () => {
  const transport = fixtureTransport();
  transport.getJson = async (url) => {
    const collection = collectionId(url);
    const features = collection === 'pand' ? [feature('pand')] : [];
    return {
      status: 200,
      body: {
        type: 'FeatureCollection',
        numberReturned: features.length,
        features,
        links: collection === 'pand' ? [{ rel: 'next', href: 'https://example.invalid/page-2' }] : [],
      },
    };
  };

  const acquisition = await client(transport).acquire({ bbox, requestedAt });
  assert.equal(acquisition.status, 'invalid_response');
  assert.match(acquisition.missingReason, /truncated/);
  assert.equal(acquisition.features.length, 0);
});

test('BGT point containment respects polygon holes', () => {
  const polygon = [[
    [[4, 52], [5, 52], [5, 53], [4, 53], [4, 52]],
    [[4.4, 52.4], [4.6, 52.4], [4.6, 52.6], [4.4, 52.6], [4.4, 52.4]],
  ]];
  assert.equal(pointInBgtMultiPolygon({ lon: 4.2, lat: 52.2 }, polygon), true);
  assert.equal(pointInBgtMultiPolygon({ lon: 4.5, lat: 52.5 }, polygon), false);
});

test('BGT provider refuses an unbounded request before transport', async () => {
  const transport = fixtureTransport();
  await assert.rejects(
    () => client(transport).acquire({
      bbox: { ...bbox, lonMax: bbox.lonMin + 0.02 },
      requestedAt,
    }),
    /bounded-area limit/,
  );
  assert.equal(transport.calls.length, 0);
});