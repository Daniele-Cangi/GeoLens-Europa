import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertCumbriaAccessManifest } = require('../packages/evidence/dist');

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

const defenceDataset = requiredDataset(
  'ea-aims-current-spatial-flood-defences',
);
const lineageDataset = requiredDataset(
  'cumberland-carlisle-sfra-2011-appendix-d',
);
const floodModelDataset = requiredDataset('ea-flood-model-locations');

const queryUrl = new URL(
  'https://environment.data.gov.uk/geoservices/datasets/8e5be50f-d465-11e4-ba9a-f0def148f590/ogc/features/v1/collections/Spatial_Flood_Defences_Including_Standardised_Attributes/items',
);
queryUrl.searchParams.set('bbox', manifest.aoi.bounds.join(','));
queryUrl.searchParams.set('limit', '1000');
queryUrl.searchParams.set('f', 'json');

const responseBody = await fetchBounded(
  queryUrl,
  defenceDataset.defenceContextAudit.responseByteLimit,
);
const collection = JSON.parse(Buffer.from(responseBody).toString('utf8'));
const features = Array.isArray(collection.features) ? collection.features : [];
if (
  !Number.isInteger(collection.numberMatched) ||
  !Number.isInteger(collection.numberReturned) ||
  collection.numberReturned !== features.length
) {
  throw new Error('AIMS response has inconsistent feature accounting');
}

const eventStart = Date.parse(manifest.event.windowStart);
const datedFeatures = features.filter((feature) =>
  nonEmptyDate(feature.properties?.asset_start_date),
);
const operationalBeforeEvent = datedFeatures.filter(
  (feature) => parseUkDate(feature.properties.asset_start_date) < eventStart,
);
const startsOnOrAfterEvent = datedFeatures.filter(
  (feature) => parseUkDate(feature.properties.asset_start_date) >= eventStart,
);
const refurbishedFeatures = features.filter((feature) =>
  finiteYear(feature.properties?.year_last_refurbished),
);
const subtypeCounts = Object.fromEntries(
  [...groupCount(features, (feature) => feature.properties?.asset_sub_type)].sort(
    ([left], [right]) => left.localeCompare(right),
  ),
);
const normalizedIdentities = features
  .map((feature) => ({
    id: feature.id,
    assetId: feature.properties?.asset_id ?? null,
    assetSubtype: feature.properties?.asset_sub_type ?? null,
    primaryPurpose: feature.properties?.primary_purpose ?? null,
    protectionType: feature.properties?.protection_type ?? null,
    assetStartDate: feature.properties?.asset_start_date ?? null,
    yearLastRefurbished: feature.properties?.year_last_refurbished ?? null,
    designSop: feature.properties?.design_sop ?? null,
    designUcl: feature.properties?.design_ucl ?? null,
    designDcl: feature.properties?.design_dcl ?? null,
    actualUcl: feature.properties?.actual_ucl ?? null,
    actualDcl: feature.properties?.actual_dcl ?? null,
    effectiveCl: feature.properties?.effective_cl ?? null,
    bank: feature.properties?.bank ?? null,
  }))
  .sort((left, right) =>
    `${left.assetId}:${left.id}`.localeCompare(`${right.assetId}:${right.id}`),
  );

const liveAudit = {
  queryUrl: queryUrl.toString(),
  sourceBbox: manifest.aoi.bounds,
  sourceCrs: 'OGC:CRS84',
  numberMatched: collection.numberMatched,
  numberReturned: collection.numberReturned,
  returnedGeometryBounds: collection.bbox,
  sourceUpdateSemantics: 'daily_current_inventory',
  withAssetStartDate: datedFeatures.length,
  operationalBeforeEventByStartDateOnly: operationalBeforeEvent.length,
  assetStartDateOnOrAfterEvent: startsOnOrAfterEvent.length,
  missingAssetStartDate: features.length - datedFeatures.length,
  withYearLastRefurbished: refurbishedFeatures.length,
  lastRefurbishedAfter2015: refurbishedFeatures.filter(
    (feature) => Number(feature.properties.year_last_refurbished) > 2015,
  ).length,
  withCurrentActualCrest: features.filter(
    (feature) =>
      feature.properties?.actual_dcl != null ||
      feature.properties?.actual_ucl != null,
  ).length,
  withDesignCrest: features.filter(
    (feature) =>
      feature.properties?.design_dcl != null ||
      feature.properties?.design_ucl != null,
  ).length,
  withDesignStandardOfProtection: features.filter(
    (feature) => feature.properties?.design_sop != null,
  ).length,
  assetSubtypeCounts: subtypeCounts,
  selectionSha256: createHash('sha256')
    .update(JSON.stringify(normalizedIdentities))
    .digest('hex'),
  responseByteLimit: 4194304,
  classification: 'current_context_only',
  blocker:
    'The source is current, daily-updated and incomplete for event dating; current geometry, crest and condition attributes cannot reconstruct the defence state on 4 December 2015.',
};

const documentChecks = await Promise.all([
  checkRemoteDocument(lineageDataset.access.url),
  checkRemoteDocument(floodModelDataset.access.url),
]);

console.log(
  JSON.stringify(
    {
      auditId: 'cumbria-2015-hydraulic-context-v0',
      checkedAt: new Date().toISOString(),
      currentDefenceContext: liveAudit,
      documentChecks,
      modelInputPromoted: false,
    },
    null,
    2,
  ),
);

if (
  JSON.stringify(liveAudit) !==
  JSON.stringify(defenceDataset.defenceContextAudit)
) {
  throw new Error(
    `Live AIMS context drifted from manifest ${manifest.manifestVersion}; computed selection SHA-256 ${liveAudit.selectionSha256}`,
  );
}
if (documentChecks.some((check) => check.state !== 'passed')) {
  throw new Error('One or more official hydraulic-context documents are unavailable');
}

function requiredDataset(id) {
  const dataset = manifest.datasets.find((candidate) => candidate.id === id);
  if (!dataset) {
    throw new Error(`Missing dataset ${id}`);
  }
  return dataset;
}

async function fetchBounded(url, maximumBytes) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`AIMS service returned HTTP ${response.status}`);
      }
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > maximumBytes) {
        throw new Error(`AIMS response exceeded ${maximumBytes} bytes`);
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
}

async function checkRemoteDocument(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return {
      url,
      state: 'passed',
      contentType: response.headers.get('content-type'),
      contentLength: nullableFiniteNumber(response.headers.get('content-length')),
    };
  } catch (error) {
    return {
      url,
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function groupCount(values, keyOf) {
  const counts = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('AIMS feature has no asset subtype');
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function nonEmptyDate(value) {
  return typeof value === 'string' && value.length > 0;
}

function parseUkDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid AIMS asset date ${value}`);
  }
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function finiteYear(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function nullableFiniteNumber(value) {
  if (value === null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
