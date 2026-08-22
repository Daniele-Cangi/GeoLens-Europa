const test = require('node:test');
const assert = require('node:assert/strict');

const { NasaImergClient } = require('../dist');

const h3 = '891f1d48907ffff';
const referenceTime = new Date('2026-08-21T12:17:00.000Z');
const acquiredAt = '2026-08-21T12:20:00.000Z';

class FakeTransport {
  constructor(handler) {
    this.handler = handler;
    this.requests = [];
  }

  async postJson(url, body, timeoutMs) {
    this.requests.push({ url, body, timeoutMs });
    return this.handler(url, body, timeoutMs);
  }
}

function evidence(value, status, missingReason) {
  return {
    value,
    unit: 'mm',
    spatial: {
      h3,
      sourceResolution: '0.1 degree',
    },
    temporal: {
      observedAt: '2026-08-21T12:00:00.000Z',
      windowStart: '2026-08-20T12:00:00.000Z',
      windowEnd: '2026-08-21T12:00:00.000Z',
      acquiredAt,
    },
    provenance: {
      provider: 'NASA GES DISC',
      dataset: 'GPM_3IMERGHH',
      datasetVersion: '07',
      transformation: 'test contract',
      transformationVersion: 'imerg-h3-evidence-v0.1.0',
      samplingMethod: 'nearest IMERG grid cell at H3 centroid',
      sourceMetadata: {
        runType: 'late',
        granuleCount: 48,
      },
    },
    quality: {
      status,
      ...(missingReason ? { missingReason } : {}),
    },
  };
}

function windowPayload({
  cellEvidence = evidence(0, 'available'),
  status = 'available',
  missingReason,
} = {}) {
  return {
    windowHours: 24,
    status,
    ...(missingReason ? { missingReason } : {}),
    product: 'GPM_3IMERGHH',
    runType: status === 'auth_required' ? null : 'late',
    datasetVersion: '07',
    requestedWindow: {
      start: '2026-08-20T12:00:00.000Z',
      end: '2026-08-21T12:00:00.000Z',
    },
    actualWindow: status === 'available'
      ? {
          start: '2026-08-20T12:00:00.000Z',
          end: '2026-08-21T12:00:00.000Z',
        }
      : null,
    expectedGranuleCount: 48,
    searchedGranuleCount: status === 'available' ? 48 : 0,
    granuleCount: status === 'available' ? 48 : 0,
    granuleTimestamps: status === 'available'
      ? ['2026-08-20T12:00:00.000Z']
      : [],
    sourceResolution: '0.1 degree',
    samplingMethod: 'nearest IMERG grid cell at H3 centroid',
    cached: false,
    cells: [
      {
        h3,
        rainfallMm: cellEvidence,
      },
    ],
  };
}

function serviceResponse(window = windowPayload()) {
  return {
    provider: 'NASA GES DISC',
    datasetFamily: 'GPM IMERG',
    contractVersion: 'imerg-h3-evidence-v0.1.0',
    referenceTime: '2026-08-21T12:00:00.000Z',
    acquiredAt,
    windows: [window],
  };
}

function clientFor(handler) {
  const transport = new FakeTransport(handler);
  const client = new NasaImergClient({
    baseUrl: 'http://nasa.test/',
    timeoutMs: 5000,
    transport,
    now: () => new Date(acquiredAt),
  });

  return { client, transport };
}

const request = {
  h3Indices: [h3],
  referenceTime,
  windowHours: [24],
};

test('default timeout accommodates a cold real-data acquisition', async () => {
  const transport = new FakeTransport(async () => ({
    status: 200,
    body: serviceResponse(),
  }));
  const client = new NasaImergClient({
    baseUrl: 'http://nasa.test/',
    transport,
    now: () => new Date(acquiredAt),
  });

  await client.getEvidence(request);

  assert.equal(transport.requests[0].timeoutMs, 10 * 60 * 1000);
});
test('base URL normalization is bounded and removes trailing slashes', async () => {
  const transport = new FakeTransport(async () => ({
    status: 200,
    body: serviceResponse(),
  }));
  const client = new NasaImergClient({
    baseUrl: '  http://nasa.test' + '/'.repeat(100_000) + '  ',
    transport,
    now: () => new Date(acquiredAt),
  });

  await client.getEvidence(request);

  assert.equal(transport.requests[0].url, 'http://nasa.test/precip/h3');
});

test('slash-only IMERG base URL is rejected', () => {
  assert.throws(
    () => new NasaImergClient({ baseUrl: '///' }),
    /baseUrl must be non-empty/,
  );
});

test('observed zero survives the canonical service client', async () => {
  const { client, transport } = clientFor(async () => ({
    status: 200,
    body: serviceResponse(),
  }));
  const result = await client.getEvidence(request);
  const rainfall = result.windows[24].cells[h3];

  assert.equal(rainfall.value, 0);
  assert.equal(rainfall.quality.status, 'available');
  assert.equal(rainfall.spatial.sourceResolution, '0.1 degree');
  assert.equal(
    result.windows[24].summary.granuleCount,
    48,
  );
  assert.equal(
    transport.requests[0].body.reference_time,
    '2026-08-21T12:00:00.000Z',
  );
});

test('auth_required from Python remains unavailable evidence', async () => {
  const missing = 'NASA credentials are not configured';
  const { client } = clientFor(async () => ({
    status: 200,
    body: serviceResponse(
      windowPayload({
        status: 'auth_required',
        missingReason: missing,
        cellEvidence: evidence(null, 'auth_required', missing),
      }),
    ),
  }));
  const result = await client.getEvidence(request);
  const rainfall = result.windows[24].cells[h3];

  assert.equal(rainfall.value, null);
  assert.equal(rainfall.quality.status, 'auth_required');
  assert.equal(rainfall.quality.missingReason, missing);
});

test('available with null is rejected as invalid_response', async () => {
  const { client } = clientFor(async () => ({
    status: 200,
    body: serviceResponse(
      windowPayload({
        cellEvidence: evidence(null, 'available'),
      }),
    ),
  }));
  const result = await client.getEvidence(request);
  const rainfall = result.windows[24].cells[h3];

  assert.equal(rainfall.value, null);
  assert.equal(rainfall.quality.status, 'invalid_response');
  assert.match(
    rainfall.quality.missingReason,
    /must carry a value/,
  );
});

test('transport failure becomes upstream_error, never zero', async () => {
  const { client } = clientFor(async () => {
    throw new Error('connection refused');
  });
  const result = await client.getEvidence(request);
  const rainfall = result.windows[24].cells[h3];

  assert.equal(rainfall.value, null);
  assert.equal(rainfall.quality.status, 'upstream_error');
  assert.match(
    rainfall.quality.missingReason,
    /connection refused/,
  );
});

test('HTTP 429 becomes rate_limited evidence', async () => {
  const { client } = clientFor(async () => ({
    status: 429,
    body: { detail: 'too many requests' },
  }));
  const result = await client.getEvidence(request);
  const rainfall = result.windows[24].cells[h3];

  assert.equal(rainfall.value, null);
  assert.equal(rainfall.quality.status, 'rate_limited');
});

test('omitted windows become invalid_response evidence', async () => {
  const { client } = clientFor(async () => ({
    status: 200,
    body: {
      ...serviceResponse(),
      windows: [],
    },
  }));
  const result = await client.getEvidence(request);

  assert.equal(
    result.windows[24].cells[h3].quality.status,
    'invalid_response',
  );
});

test('invalid H3 request is a structural error', async () => {
  const { client, transport } = clientFor(async () => ({
    status: 200,
    body: serviceResponse(),
  }));

  await assert.rejects(
    () => client.getEvidence({
      ...request,
      h3Indices: ['not-an-h3-cell'],
    }),
    /invalid H3/,
  );
  assert.equal(transport.requests.length, 0);
});
