import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

const wfsEndpoint =
  'https://environment.data.gov.uk/spatialdata/wfd-river-waterbodies/wfs';
const typeName = 'WFD_River_Water_Bodies_Cycle_1';
const bbox = manifest.aoi.bounds.join(',');
const common = {
  service: 'WFS',
  version: '2.0.0',
  request: 'GetFeature',
  typeNames: typeName,
  bbox: `${bbox},urn:ogc:def:crs:OGC:1.3:CRS84`,
};

const hitsUrl = buildUrl({ ...common, resultType: 'hits' });
const hitsResponse = await fetchBounded(hitsUrl, 64 * 1024);
const hitsText = new TextDecoder().decode(hitsResponse.body);
const numberMatched = Number(
  /numberMatched="(\d+)"/.exec(hitsText)?.[1],
);
if (!Number.isInteger(numberMatched) || numberMatched < 1) {
  throw new Error('WFD Cycle 1 hits response lacks a positive match count');
}

const featuresUrl = buildUrl({
  ...common,
  count: String(numberMatched),
  outputFormat: 'application/json',
  srsName: 'urn:ogc:def:crs:OGC:1.3:CRS84',
});
const flowCookie = hitsResponse.response.headers
  .get('set-cookie')
  ?.split(';', 1)[0];
const featureResponse = await fetchBounded(
  featuresUrl,
  1024 * 1024,
  flowCookie ? { Cookie: flowCookie } : {},
);
const collection = JSON.parse(new TextDecoder().decode(featureResponse.body));
if (
  collection.numberMatched !== numberMatched ||
  collection.numberReturned !== numberMatched ||
  collection.features?.length !== numberMatched
) {
  throw new Error('WFD Cycle 1 bounded response is incomplete');
}

const canonicalFeatures = collection.features
  .map((feature) => ({
    id: feature.id,
    geometry: feature.geometry,
    properties: {
      eaWbId: feature.properties.ea_wb_id,
      name: feature.properties.name,
      riverBasinDistrictId: feature.properties.rbd,
      riverBasinDistrictName: feature.properties.rbd_name,
      waterCategory: feature.properties.water_cat,
      shapeLengthMetres: feature.properties.shape_leng,
    },
  }))
  .sort((left, right) => left.id.localeCompare(right.id));
const selectionSha256 = createHash('sha256')
  .update(JSON.stringify(canonicalFeatures))
  .digest('hex');
const stableIdentities = canonicalFeatures.map((feature) => ({
  id: feature.id,
  eaWbId: feature.properties.eaWbId,
  name: feature.properties.name,
}));
const hydrographyManifest = manifest.datasets.find(
  (dataset) => dataset.id === 'ea-wfd-river-water-bodies-cycle-1',
)?.hydrographyAudit;
const pinnedAudit = {
  hitsUrl: hitsUrl.toString(),
  featuresUrl: featuresUrl.toString(),
  sourceBbox: manifest.aoi.bounds,
  sourceCrs: 'OGC:CRS84',
  geometryClippedToAoi: false,
  numberMatched,
  numberReturned: collection.numberReturned,
  returnedGeometryBounds: collection.bbox,
  stableIdentities,
  selectionSha256,
  responseByteLimit: 1048576,
  classification: 'event_valid_context_only',
  blocker:
    'The dataset includes only WFD-designated 1:50,000 river stretches and is not a complete channel or hydraulic network.',
};
if (JSON.stringify(pinnedAudit) !== JSON.stringify(hydrographyManifest)) {
  throw new Error('Live WFD Cycle 1 selection drifted from manifest v0.3.0');
}

console.log(
  JSON.stringify(
    {
      auditId: 'cumbria-2015-pre-event-hydrography-v0',
      checkedAt: new Date().toISOString(),
      dataset: typeName,
      sourceBasis: {
        created: '2008-01-01',
        revised: '2012-04-03',
        lineage:
          'WFD-designated subset of the CEH 1:50,000 river network with Environment Agency additions',
      },
      query: {
        hitsUrl: hitsUrl.toString(),
        featuresUrl: featuresUrl.toString(),
        sourceBbox: manifest.aoi.bounds,
        sourceCrs: 'OGC:CRS84',
        geometryClippedToAoi: false,
      },
      numberMatched,
      numberReturned: collection.numberReturned,
      returnedGeometryBounds: collection.bbox,
      stableIdentities,
      selectionSha256,
      bodyBytes: featureResponse.body.byteLength,
      classification: pinnedAudit.classification,
      blocker: pinnedAudit.blocker,
      manifestMatch: true,
    },
    null,
    2,
  ),
);

function buildUrl(parameters) {
  const url = new URL(wfsEndpoint);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function fetchBounded(url, maximumBytes, headers = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`WFD Cycle 1 service returned HTTP ${response.status}`);
      }
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > maximumBytes) {
        throw new Error(
          `WFD Cycle 1 response exceeded ${maximumBytes} bytes`,
        );
      }
      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
}
