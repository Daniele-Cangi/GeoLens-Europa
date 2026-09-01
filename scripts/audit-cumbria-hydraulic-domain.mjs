import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import proj4 from 'proj4';

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

const floodModels = requiredDataset('ea-flood-model-locations');
const channels = requiredDataset('ea-aims-channel-current');
const domain = requiredDataset(
  'cumberland-carlisle-sfra-2011-main-and-appendix-c',
);
const downstream = manifest.hydraulicProtocol.downstreamBoundary;

const [floodModelCollection, channelCollection, stationCollection] =
  await Promise.all([
    fetchJson(floodModels.floodModelCatalogAudit.queryUrl, 12 * 1024 * 1024),
    fetchJson(channels.channelContextAudit.queryUrl, 12 * 1024 * 1024),
    fetchJson(downstream.stationSearch.queryUrl, 2 * 1024 * 1024),
  ]);

const liveFloodModels = auditFloodModels(floodModelCollection);
const liveChannels = auditChannels(channelCollection);
const liveStations = auditStations(stationCollection);
const liveCoordinate = auditOldSandsfieldCoordinate();
const documentChecks = await Promise.all(
  [domain.access.url, ...(domain.access.additionalUrls ?? [])].map((url) =>
    checkRemoteDocument(url),
  ),
);

equalJson(
  liveFloodModels,
  select(floodModels.floodModelCatalogAudit, Object.keys(liveFloodModels)),
  'Flood Model Locations',
);
equalJson(
  liveChannels,
  select(channels.channelContextAudit, Object.keys(liveChannels)),
  'AIMS Channel',
);
equalJson(
  liveStations,
  select(downstream.stationSearch, Object.keys(liveStations)),
  'downstream station search',
);
equalJson(
  liveCoordinate,
  downstream.historicalModelLimit.derivedWgs84,
  'Old Sandsfield coordinate',
);
if (documentChecks.some((check) => check.state !== 'passed')) {
  throw new Error('One or more official SFRA domain documents are unavailable');
}

console.log(
  JSON.stringify(
    {
      auditId: 'cumbria-2015-hydraulic-domain-v0',
      checkedAt: new Date().toISOString(),
      manifestVersion: manifest.manifestVersion,
      floodModelCatalogue: liveFloodModels,
      currentChannelContext: liveChannels,
      downstreamStationSearch: liveStations,
      historicalDownstreamCoordinate: liveCoordinate,
      documentChecks,
      upstreamBoundaryCount:
        manifest.hydraulicProtocol.upstreamBoundaries.length,
      downstreamBoundaryState: downstream.state,
      evaluationGeometryLoaded:
        manifest.hydraulicProtocol.evaluationIsolation.geometryLoaded,
      result: 'passed',
    },
    null,
    2,
  ),
);

function auditFloodModels(collection) {
  const features = featureArray(collection, 'Flood Model Locations');
  const normalized = features
    .map((feature) => ({
      id: feature.properties?.model_flood_group_id ?? null,
      name: feature.properties?.name ?? null,
      completionDate: dateOnly(feature.properties?.completion_date),
      softwareAndVersion: feature.properties?.software_and_version ?? null,
      geometry: feature.geometry ?? null,
    }))
    .sort((left, right) => left.id - right.id);
  const eventStart = Date.parse(manifest.event.windowStart);
  const coreIds = new Set([1313, 1314, 1797, 8323, 2039, 9458]);
  const coreModels = normalized
    .filter((model) => coreIds.has(model.id))
    .map(({ geometry: _geometry, ...model }) => ({
      ...model,
      temporalUse:
        Date.parse(`${model.completionDate}T00:00:00Z`) < eventStart
          ? 'pre_event_lineage_only'
          : 'post_event_excluded',
    }));
  return {
    numberMatched: collection.numberMatched,
    numberReturned: collection.numberReturned,
    returnedGeometryBounds: roundBounds(collection.bbox),
    preEventRecords: normalized.filter(
      (model) => Date.parse(`${model.completionDate}T00:00:00Z`) < eventStart,
    ).length,
    eventOrPostEventRecords: normalized.filter(
      (model) => Date.parse(`${model.completionDate}T00:00:00Z`) >= eventStart,
    ).length,
    coreModels,
    selectionSha256: sha256(normalized),
    modelFilesIncluded: false,
    modelOutputsIncluded: false,
    classification: 'catalog_identity_only',
  };
}

function auditChannels(collection) {
  const features = featureArray(collection, 'AIMS Channel');
  const eventStart = Date.parse(manifest.event.windowStart);
  const dated = features.filter((feature) =>
    nonEmptyDate(feature.properties?.asset_start_date),
  );
  const normalized = features
    .map((feature) => ({
      assetId: feature.properties?.asset_id ?? null,
      assetSubType: feature.properties?.asset_sub_type ?? null,
      assetStartDate: feature.properties?.asset_start_date ?? null,
      yearLastRefurbished: feature.properties?.year_last_refurbished ?? null,
      waterCourseName: feature.properties?.water_course_name ?? null,
      geometry: feature.geometry ?? null,
    }))
    .sort((left, right) =>
      String(left.assetId).localeCompare(String(right.assetId)),
    );
  return {
    numberMatched: collection.numberMatched,
    numberReturned: collection.numberReturned,
    returnedGeometryBounds: roundBounds(collection.bbox),
    sourceUpdateSemantics: 'daily_current_inventory',
    withAssetStartDate: dated.length,
    operationalBeforeEventByStartDateOnly: dated.filter(
      (feature) => parseUkDate(feature.properties.asset_start_date) < eventStart,
    ).length,
    assetStartDateOnOrAfterEvent: dated.filter(
      (feature) => parseUkDate(feature.properties.asset_start_date) >= eventStart,
    ).length,
    missingAssetStartDate: features.length - dated.length,
    lastRefurbishedAfter2015: features.filter(
      (feature) =>
        finiteYear(feature.properties?.year_last_refurbished) &&
        Number(feature.properties.year_last_refurbished) > 2015,
    ).length,
    withWatercourseName: features.filter(
      (feature) =>
        typeof feature.properties?.water_course_name === 'string' &&
        feature.properties.water_course_name.length > 0,
    ).length,
    assetSubtypeCounts: Object.fromEntries(
      [...groupCount(features, (feature) => feature.properties?.asset_sub_type)].sort(
        ([left], [right]) => left.localeCompare(right),
      ),
    ),
    selectionSha256: sha256(normalized),
    crossSectionsIncluded: false,
    bedElevationIncluded: false,
    roughnessIncluded: false,
    classification: 'current_context_only',
  };
}

function auditStations(collection) {
  const stations = (Array.isArray(collection.items) ? collection.items : [])
    .filter((station) =>
      measureIdentifiers(station.measures).some((id) =>
        /-(flow|level)-/.test(id),
      ),
    )
    .map((station) => ({
      id: lastPathSegment(station['@id']),
      label: station.label ?? null,
      stationReference: station.stationReference ?? null,
      lat: station.lat ?? null,
      lon: station.long ?? null,
      riverName: station.riverName ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const riverEdenStationIds = stations
    .filter((station) => station.riverName === 'River Eden')
    .map((station) => station.id);
  const target = downstream.historicalModelLimit.derivedWgs84;
  return {
    surfaceWaterStationCount: stations.length,
    riverEdenStationIds,
    stationAtHistoricalLimit: stations.some(
      (station) =>
        Math.abs(Number(station.lon) - target.lon) < 0.0001 &&
        Math.abs(Number(station.lat) - target.lat) < 0.0001,
    ),
    selectionSha256: sha256(stations),
    classification: 'no_downstream_boundary_observation',
  };
}

function auditOldSandsfieldCoordinate() {
  proj4.defs(
    'EPSG:27700',
    '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs',
  );
  const source = downstream.historicalModelLimit.coordinate;
  const [lon, lat] = proj4('EPSG:27700', 'EPSG:4326', [
    source.easting,
    source.northing,
  ]);
  return {
    crs: 'EPSG:4326',
    lon: round(lon, 6),
    lat: round(lat, 6),
    transformation: 'proj4-bng-to-wgs84-v0',
  };
}

function requiredDataset(id) {
  const dataset = manifest.datasets.find((candidate) => candidate.id === id);
  if (!dataset) {
    throw new Error(`Missing dataset ${id}`);
  }
  return dataset;
}

async function fetchJson(url, maximumBytes) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
      }
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > maximumBytes) {
        throw new Error(`Response exceeded ${maximumBytes} bytes`);
      }
      return JSON.parse(Buffer.from(body).toString('utf8'));
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
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

function featureArray(collection, label) {
  const features = Array.isArray(collection.features) ? collection.features : [];
  if (
    !Number.isInteger(collection.numberMatched) ||
    !Number.isInteger(collection.numberReturned) ||
    collection.numberReturned !== features.length
  ) {
    throw new Error(`${label} has inconsistent feature accounting`);
  }
  return features;
}

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    throw new Error(`Invalid catalogue date ${String(value)}`);
  }
  return value.slice(0, 10);
}

function groupCount(values, keyOf) {
  const counts = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('Feature has no asset subtype');
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

function measureIdentifiers(measures) {
  if (!Array.isArray(measures)) {
    return [];
  }
  return measures
    .map((measure) =>
      typeof measure === 'string' ? measure : measure?.['@id'],
    )
    .filter((value) => typeof value === 'string');
}

function lastPathSegment(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Station has no identity');
  }
  return value.slice(value.lastIndexOf('/') + 1);
}

function roundBounds(value) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('Collection has no four-value bbox');
  }
  return value.map((number) => round(Number(number), 6));
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function select(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

function equalJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} drifted from manifest ${manifest.manifestVersion}; live=${JSON.stringify(actual)}`,
    );
  }
}

function nullableFiniteNumber(value) {
  if (value === null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
