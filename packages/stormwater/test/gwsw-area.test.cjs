const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessGwswOutfallAreaContext,
  GWSW_OUTFALL_AREA_LINK_VERSION,
  PdokGwswAreaClient,
  pointInMultiPolygon,
} = require('../dist');

const bbox = {
  latMin: 52.3375,
  lonMin: 4.8978,
  latMax: 52.3395,
  lonMax: 4.8995,
};
const outfallPosition = {
  lat: 52.33807928535426,
  lon: 4.898945130628371,
};
const acquiredAt = '2026-08-23T10:00:00.000Z';

function areaFeature(overrides = {}) {
  return {
    type: 'Feature',
    id: 'gwsw-area-932',
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[[
        [4.897, 52.337],
        [4.900, 52.337],
        [4.900, 52.340],
        [4.897, 52.340],
        [4.897, 52.337],
      ]]],
    },
    properties: {
      dataset:
        'https://apps.gwsw.nl/item_config?dataset=WS_WaterschappenAfvalwaterKeten',
      naam:
        '(NL.WBHCODE.11.Rioleringsgebied.932) President Kennedylaan',
      type:
        'http://data.gwsw.nl/1.6/totaal/Rioleringsgebied',
      type_naam: 'Rioleringsgebied',
      uri:
        'Rioleringsgebied_7480CE99-A675-4573-971C-5E164F460342',
    },
    ...overrides,
  };
}

function transport(status, body) {
  return {
    calls: [],
    async getJson(url, timeoutMs) {
      this.calls.push({ url, timeoutMs });
      return { status, body };
    },
  };
}

test('bounded GWSW acquisition retains observed multipolygon and receipt', async () => {
  const source = transport(200, {
    type: 'FeatureCollection',
    timeStamp: '2026-08-20T00:00:00Z',
    features: [areaFeature()],
    links: [],
  });
  const result = await new PdokGwswAreaClient({
    transport: source,
    now: () => new Date(acquiredAt),
  }).acquire({ bbox });

  assert.equal(result.status, 'available');
  assert.equal(result.areas.length, 1);
  assert.equal(result.areas[0].areaType, 'rioleringsgebied');
  assert.equal(result.receipt.featureCount, 1);
  assert.equal(result.receipt.rioleringsgebiedCount, 1);
  assert.equal(result.receipt.sourceCrs, 'OGC:CRS84');
  assert.equal(result.receipt.license, 'CC0 1.0');
  assert.equal(source.calls.length, 1);

  const url = new URL(source.calls[0].url);
  assert.equal(
    url.searchParams.get('bbox'),
    '4.8978,52.3375,4.8995,52.3395',
  );
  assert.equal(url.searchParams.get('limit'), '100');
});

test('GWSW transport failure remains unavailable evidence', async () => {
  const result = await new PdokGwswAreaClient({
    transport: transport(429, null),
    now: () => new Date(acquiredAt),
  }).acquire({ bbox });

  assert.equal(result.status, 'rate_limited');
  assert.equal(result.areas.length, 0);
  assert.match(result.missingReason, /HTTP 429/);
});

test('GWSW rejects a paginated bounded response instead of accepting truncation', async () => {
  const result = await new PdokGwswAreaClient({
    transport: transport(200, {
      type: 'FeatureCollection',
      features: [areaFeature()],
      links: [
        {
          rel: 'next',
          href: 'https://example.invalid/next',
        },
      ],
    }),
    now: () => new Date(acquiredAt),
  }).acquire({ bbox });

  assert.equal(result.status, 'invalid_response');
  assert.equal(result.areas.length, 0);
  assert.match(result.missingReason, /truncated/);
});

test('GWSW rejects inconsistent response counts instead of accepting a partial collection', async () => {
  const result = await new PdokGwswAreaClient({
    transport: transport(200, {
      type: 'FeatureCollection',
      numberMatched: 2,
      numberReturned: 1,
      features: [areaFeature()],
      links: [],
    }),
    now: () => new Date(acquiredAt),
  }).acquire({ bbox });

  assert.equal(result.status, 'invalid_response');
  assert.equal(result.areas.length, 0);
  assert.match(result.missingReason, /truncated/);
});

test('point containment respects multipolygon holes', () => {
  const geometry = [[
    [
      [4.89, 52.33],
      [4.91, 52.33],
      [4.91, 52.35],
      [4.89, 52.35],
      [4.89, 52.33],
    ],
    [
      [4.898, 52.337],
      [4.900, 52.337],
      [4.900, 52.340],
      [4.898, 52.340],
      [4.898, 52.337],
    ],
  ]];

  assert.equal(
    pointInMultiPolygon(outfallPosition, geometry),
    false,
  );
  assert.equal(
    pointInMultiPolygon(
      { lat: 52.345, lon: 4.905 },
      geometry,
    ),
    true,
  );
});

test('containing GWSW area is context only without a published outfall crosswalk', async () => {
  const acquisition =
    await new PdokGwswAreaClient({
      transport: transport(200, {
        type: 'FeatureCollection',
        timeStamp: '2026-08-20T00:00:00Z',
        features: [areaFeature()],
        links: [],
      }),
      now: () => new Date(acquiredAt),
    }).acquire({ bbox });
  const context = assessGwswOutfallAreaContext({
    acquisition,
    outfallNodeId:
      'waternet:8522CE11-8DC1-41CC-9375-EDECAB742620',
    outfallPosition,
    waternetPumpingAreaReference: '826',
  });

  assert.equal(
    context.modelVersion,
    GWSW_OUTFALL_AREA_LINK_VERSION,
  );
  assert.equal(
    context.status,
    'unresolved_no_published_crosswalk',
  );
  assert.equal(context.containingRioleringsgebieden.length, 1);
  assert.equal(
    context.containingRioleringsgebieden[0].name,
    '(NL.WBHCODE.11.Rioleringsgebied.932) President Kennedylaan',
  );
  assert.equal(
    context.waternetPumpingAreaReference.value,
    '826',
  );
  assert.equal(
    context.waternetPumpingAreaReference.gwswCrosswalk,
    'not_published',
  );
  assert.equal(context.attachment.eligible, false);
  assert.equal(
    context.attachment.catchmentAttachmentCreated,
    false,
  );
  assert.match(
    context.attachment.reason,
    /Point containment establishes spatial context only/,
  );
});

test('GWSW provider unavailability cannot create an area attachment', async () => {
  const acquisition =
    await new PdokGwswAreaClient({
      transport: transport(503, null),
      now: () => new Date(acquiredAt),
    }).acquire({ bbox });
  const context = assessGwswOutfallAreaContext({
    acquisition,
    outfallNodeId:
      'waternet:8522CE11-8DC1-41CC-9375-EDECAB742620',
    outfallPosition,
    waternetPumpingAreaReference: '826',
  });

  assert.equal(context.status, 'upstream_error');
  assert.deepEqual(context.containingAreas, []);
  assert.equal(context.attachment.eligible, false);
});
