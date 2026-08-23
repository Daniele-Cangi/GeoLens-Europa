const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  AmsterdamWaternetWfsClient,
  importAmsterdamWaternetStormwater,
} = require('../dist');

const fixturePath = path.resolve(
  __dirname,
  'fixtures/amsterdam-waternet-bounded.json',
);
const snapshot = JSON.parse(
  fs.readFileSync(fixturePath, 'utf8'),
);
const now = new Date(
  '2026-08-23T00:00:00.000Z',
);
const bbox = {
  latMin: 52.3375,
  lonMin: 4.8978,
  latMax: 52.3395,
  lonMax: 4.8995,
};

class FixtureTransport {
  constructor({
    nodeStatus = 200,
    pipeStatus = 200,
    nodes = snapshot.nodes,
    pipes = snapshot.pipes,
  } = {}) {
    this.nodeStatus = nodeStatus;
    this.pipeStatus = pipeStatus;
    this.nodes = nodes;
    this.pipes = pipes;
    this.calls = [];
  }

  async getJson(url, timeoutMs) {
    this.calls.push({ url, timeoutMs });

    if (url.includes('rioolknopen')) {
      return {
        status: this.nodeStatus,
        body: this.nodes,
      };
    }

    return {
      status: this.pipeStatus,
      body: this.pipes,
    };
  }
}

function client(transport) {
  return new AmsterdamWaternetWfsClient({
    transport,
    timeoutMs: 1234,
    now: () => now,
  });
}

test('bounded WFS acquisition composes through the deterministic importer', async () => {
  const transport = new FixtureTransport();
  const acquisition = await client(
    transport,
  ).acquire({ bbox });

  assert.equal(acquisition.status, 'available');
  assert.equal(transport.calls.length, 2);
  assert.ok(
    transport.calls.every(
      (call) => call.timeoutMs === 1234,
    ),
  );
  assert.ok(
    transport.calls.every(
      (call) =>
        new URL(call.url).searchParams.get('bbox') ===
        '52.3375,4.8978,52.3395,4.8995,EPSG:4326',
    ),
  );

  const imported =
    importAmsterdamWaternetStormwater(
      acquisition.snapshot,
      {
        networkId: 'waternet-wfs-test',
        acquiredAt:
          acquisition.receipt.acquiredAt,
        nodeH3Resolution: 11,
        snapToleranceM: 0.25,
        bboxWfsAxisOrder:
          acquisition.receipt.bboxWfsAxisOrder,
        retrievalMode: 'live',
      },
    );

  assert.equal(
    imported.receipt.retrievalMode,
    'live',
  );
  assert.equal(
    imported.receipt.counts.importedPipes,
    47,
  );
});

test('WFS rate limiting remains explicit and produces no snapshot', async () => {
  const acquisition = await client(
    new FixtureTransport({
      pipeStatus: 429,
    }),
  ).acquire({ bbox });

  assert.equal(acquisition.status, 'rate_limited');
  assert.equal(acquisition.failedLayer, 'pipes');
  assert.match(
    acquisition.missingReason,
    /HTTP 429/,
  );
  assert.equal('snapshot' in acquisition, false);
});

test('invalid GeoJSON and truncated responses are rejected', async () => {
  const malformed = await client(
    new FixtureTransport({
      nodes: { error: 'not geojson' },
    }),
  ).acquire({ bbox });
  const truncatedNodes = {
    ...snapshot.nodes,
    numberMatched: 31,
    numberReturned: 30,
  };
  const truncated = await client(
    new FixtureTransport({
      nodes: truncatedNodes,
    }),
  ).acquire({ bbox });

  assert.equal(
    malformed.status,
    'invalid_response',
  );
  assert.match(
    malformed.missingReason,
    /FeatureCollection/,
  );
  assert.equal(
    truncated.status,
    'invalid_response',
  );
  assert.match(
    truncated.missingReason,
    /truncated/,
  );
});

test('empty bounded responses are out of coverage, never an empty valid network', async () => {
  const empty = {
    type: 'FeatureCollection',
    features: [],
    numberMatched: 0,
    numberReturned: 0,
  };
  const acquisition = await client(
    new FixtureTransport({
      nodes: empty,
      pipes: empty,
    }),
  ).acquire({ bbox });

  assert.equal(
    acquisition.status,
    'out_of_coverage',
  );
  assert.equal(
    acquisition.failedLayer,
    'both',
  );
  assert.equal('snapshot' in acquisition, false);
});

test('WFS requests cannot exceed the configured bounded area', async () => {
  const transport = new FixtureTransport();

  await assert.rejects(
    () =>
      client(transport).acquire({
        bbox: {
          latMin: 52.3,
          lonMin: 4.8,
          latMax: 52.4,
          lonMax: 4.9,
        },
      }),
    /bounded-area limit/,
  );
  assert.equal(transport.calls.length, 0);
});
