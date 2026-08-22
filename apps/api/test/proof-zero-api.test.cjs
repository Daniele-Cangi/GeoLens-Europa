const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildGeoLensApi,
} = require('../dist/refoundation/server');
const {
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../../../packages/evidence/dist');

const fixturePath = path.resolve(
  __dirname,
  '../../../stormwater_network_example.geojson',
);
const network = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const waternetFixturePath = path.resolve(
  __dirname,
  '../../../packages/stormwater/test/fixtures/amsterdam-waternet-bounded.json',
);
const waternetSnapshot = JSON.parse(
  fs.readFileSync(waternetFixturePath, 'utf8'),
);
const referenceTime = '2026-08-21T00:00:00.000Z';
const acquiredAt = '2026-08-21T01:00:00.000Z';
const rainfallTemporal = {
  observedAt: referenceTime,
  windowStart: '2026-08-20T00:00:00.000Z',
  windowEnd: referenceTime,
  acquiredAt,
};

function fixtureEvidence(value, {
  fixtureId,
  h3,
  lat,
  lon,
  unit,
  sourceResolution,
  temporal = { acquiredAt },
}) {
  return syntheticFixtureEvidence(value, {
    fixtureId,
    unit,
    spatial: {
      h3,
      lat,
      lon,
      sourceResolution,
    },
    temporal,
  });
}

function fixtureComposer(options = {}) {
  return {
    async compose(request) {
      const cells = {};
      const nodes = {};
      const issues = [];

      for (const h3 of request.catchmentH3Indices) {
        let rainfall24hMm;

        if (options.missingRainfall) {
          rainfall24hMm = unavailableEvidence(
            'missing',
            'fixture rainfall missing',
            {
              unit: 'mm',
              spatial: {
                h3,
                sourceResolution: '0.1 degree',
              },
              temporal: rainfallTemporal,
              provenance: {
                provider: 'synthetic-fixture',
                dataset: 'fixture:api-rainfall',
              },
            },
          );
          issues.push({
            h3,
            layer: 'rainfall24h_mm',
            status: 'missing',
            reason:
              rainfall24hMm.quality.missingReason,
          });
        } else {
          rainfall24hMm = fixtureEvidence(10, {
            fixtureId: `api-rain:${h3}`,
            h3,
            unit: 'mm',
            sourceResolution: '0.1 degree',
            temporal: rainfallTemporal,
          });
        }

        cells[h3] = {
          h3,
          roles: ['catchment'],
          rainfall24hMm,
          elevationM: fixtureEvidence(100, {
            fixtureId: `api-dem-cell:${h3}`,
            h3,
            unit: 'm',
            sourceResolution:
              '1 arc-second (~30 m at equator)',
          }),
          slopeDeg: fixtureEvidence(1, {
            fixtureId: `api-slope:${h3}`,
            h3,
            unit: 'deg',
            sourceResolution:
              '1 arc-second (~30 m at equator)',
          }),
          landCoverClass: fixtureEvidence(112, {
            fixtureId: `api-clc:${h3}`,
            h3,
            unit: 'CLC class code',
            sourceResolution: '100 m',
          }),
        };
      }

      const elevations = {
        node_A_inlet: 103,
        node_B_manhole: 102,
        node_C_outfall: 101,
      };

      for (const node of request.nodes) {
        nodes[node.id] = {
          ...node,
          elevationM: fixtureEvidence(
            elevations[node.id],
            {
              fixtureId: `api-dem-node:${node.id}`,
              h3: node.h3,
              lat: node.lat,
              lon: node.lon,
              unit: 'm',
              sourceResolution:
                '1 arc-second (~30 m at equator)',
            },
          ),
        };
      }

      const source = (provider, dataset) => ({
        provider,
        dataset,
        acquiredAt,
        status: 'responded',
      });

      return {
        status:
          issues.length === 0
            ? 'complete'
            : 'incomplete',
        referenceTime:
          request.referenceTime.toISOString(),
        acquiredAt,
        sources: {
          rainfall: {
            ...source(
              'synthetic-fixture',
              'fixture:api-rainfall',
            ),
            referenceTime:
              request.referenceTime.toISOString(),
            window24h: null,
          },
          terrain: source(
            'synthetic-fixture',
            'fixture:api-dem',
          ),
          landCover: source(
            'synthetic-fixture',
            'fixture:api-clc',
          ),
        },
        cells,
        nodes,
        issues,
      };
    },
  };
}

function availableWaternetClient() {
  return {
    async acquire({ bbox }) {
      const bboxWfsAxisOrder = [
        bbox.latMin,
        bbox.lonMin,
        bbox.latMax,
        bbox.lonMax,
        'EPSG:4326',
      ].join(',');
      const receipt = {
        provider: 'Gemeente Amsterdam Data API',
        dataset: 'Leidingeninfrastructuur',
        acquiredAt,
        bboxWfsAxisOrder,
        nodeUrl: 'https://fixture.invalid/nodes',
        pipeUrl: 'https://fixture.invalid/pipes',
      };

      return {
        status: 'available',
        receipt,
        snapshot: {
          ...waternetSnapshot,
          metadata: {
            ...waternetSnapshot.metadata,
            acquiredAt,
            bboxWfsAxisOrder,
            retrievalMode: 'live',
          },
        },
      };
    },
  };
}

function buildTestServer(
  composer = fixtureComposer(),
  overrides = {},
) {
  return buildGeoLensApi({
    evidenceComposer: composer,
    now: () => new Date(acquiredAt),
    runtime: {
      imergServiceConfigured: false,
      clcRasterConfigured: false,
    },
    ...overrides,
  });
}

test('API identity exposes health, Proof 0 and observed infrastructure', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const rootResponse = await server.inject({
    method: 'GET',
    url: '/',
  });
  const healthResponse = await server.inject({
    method: 'GET',
    url: '/health',
  });
  const root = rootResponse.json();
  const health = healthResponse.json();

  assert.equal(rootResponse.statusCode, 200);
  assert.equal(
    root.endpoints.proofZero,
    'POST /api/proof-zero/run',
  );
  assert.equal(
    root.endpoints.observedInfrastructure,
    'GET /api/infrastructure/amsterdam-waternet',
  );
  assert.equal(JSON.stringify(root).includes('ai'), false);
  assert.equal(JSON.stringify(root).includes('mineral'), false);
  assert.equal(health.coreRequiresAi, false);
  assert.equal(health.coreRequiresMineralModel, false);
});

test('API returns inspectable non-zero downstream fixture state', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'POST',
    url: '/api/proof-zero/run',
    payload: {
      network,
      networkId: 'api-proof-zero',
      referenceTime,
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'complete');
  assert.equal(body.environmental.status, 'complete');
  assert.equal(body.propagation.status, 'complete');
  assert.ok(
    body.propagation.massBalance.outfallVolumeM3 > 0,
  );
  assert.ok(
    Math.abs(
      body.propagation.massBalance.differenceM3,
    ) < 1e-9,
  );
  assert.equal(
    body.environmental.cells[
      Object.keys(body.environmental.cells)[0]
    ].rainfall24hMm.quality.status,
    'synthetic_fixture',
  );
  assert.equal(JSON.stringify(body).includes('mineral'), false);
  assert.equal(JSON.stringify(body).includes('waterScore'), false);
});

test('API returns incomplete evidence instead of zero rainfall', async (context) => {
  const server = buildTestServer(
    fixtureComposer({ missingRainfall: true }),
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'POST',
    url: '/api/proof-zero/run',
    payload: {
      network,
      referenceTime,
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'incomplete');
  assert.equal(
    body.catchmentContributions[0].totalVolumeM3.value,
    null,
  );
  assert.equal(
    body.nodeSourceTerms.terms.node_A_inlet.value,
    null,
  );
  assert.equal(
    body.propagation.status,
    'incomplete_evidence',
  );
});

test('API exposes observed Waternet topology with its import receipt', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient:
        availableWaternetClient(),
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'available');
  assert.equal(
    Object.keys(body.topology.nodes).length,
    18,
  );
  assert.equal(
    Object.keys(body.topology.pipes).length,
    16,
  );
  assert.equal(
    body.import.source.origin,
    'observed_public_record',
  );
  assert.equal(
    body.import.endpointLinkPolicy
      .sourceEndpointAttributes,
    'ignored_invalid_self_referential',
  );
  assert.equal(
    body.import.counts.skippedBoundaryPipes,
    8,
  );
  assert.deepEqual(
    body.topology.catchmentAttachments,
    {},
  );
});

test('API preserves Waternet provider failure without topology', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient: {
        async acquire() {
          return {
            status: 'rate_limited',
            missingReason:
              'Waternet pipes WFS returned HTTP 429',
            failedLayer: 'pipes',
            receipt: {
              provider:
                'Gemeente Amsterdam Data API',
              dataset:
                'Leidingeninfrastructuur',
              acquiredAt,
              bboxWfsAxisOrder:
                '52.3393,4.8987,52.3404,4.8998,EPSG:4326',
              nodeUrl:
                'https://fixture.invalid/nodes',
              pipeUrl:
                'https://fixture.invalid/pipes',
            },
          };
        },
      },
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'rate_limited');
  assert.equal(body.failedLayer, 'pipes');
  assert.equal('topology' in body, false);
});

test('API requires a complete Waternet bbox', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient:
        availableWaternetClient(),
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url:
      '/api/infrastructure/amsterdam-waternet?latMin=52.3393',
  });
  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.status, 'invalid_request');
  assert.match(body.error, /requires latMin/);
});

test('API rejects a Waternet bbox outside the bounded-area limit', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url:
      '/api/infrastructure/amsterdam-waternet?latMin=52.3&lonMin=4.8&latMax=52.4&lonMax=4.9',
  });
  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.status, 'invalid_request');
  assert.match(body.error, /bounded-area limit/);
});
test('API rejects requests without an explicit reference time', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'POST',
    url: '/api/proof-zero/run',
    payload: { network },
  });
  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.status, 'invalid_request');
  assert.match(body.error, /referenceTime/);
});
