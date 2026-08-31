import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertCumbriaAccessManifest } = require('../packages/evidence/dist');

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(
  repositoryRoot,
  'tests',
  'ground-truth',
  'cumbria-2015',
  'manifest.json',
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assertCumbriaAccessManifest(manifest);

const datasetById = new Map(
  manifest.datasets.map((dataset) => [dataset.id, dataset]),
);
const checks = [];
for (const boundary of manifest.hydraulicProtocol.upstreamBoundaries) {
  checks.push(await checkUpstreamBoundary(boundary));
}
checks.push(
  await checkRejectedDownstreamCandidate(
    manifest.hydraulicProtocol.downstreamBoundary.screenedCandidate,
  ),
);
checks.push(
  await checkObservationStationMetadata(
    datasetById.get('ea-hydrology-willow-holme-rainfall'),
    '026196fb-dc64-4e06-bc2b-ce360bd65a0a',
  ),
);

const failures = checks.filter((check) => check.state !== 'passed');
console.log(
  JSON.stringify(
    {
      auditId: 'cumbria-2015-boundary-protocol-v0',
      checkedAt: new Date().toISOString(),
      manifestVersion: manifest.manifestVersion,
      protocolId: manifest.hydraulicProtocol.id,
      protocolState: manifest.hydraulicProtocol.state,
      finalMeshFrozen:
        manifest.hydraulicProtocol.domainEnvelope.finalMeshFrozen,
      downstreamBoundaryState:
        manifest.hydraulicProtocol.downstreamBoundary.state,
      initialState: manifest.hydraulicProtocol.initialState.state,
      evaluationGeometryLoaded:
        manifest.hydraulicProtocol.evaluationIsolation.geometryLoaded,
      checks,
      result: failures.length === 0 ? 'passed' : 'failed',
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}

async function checkUpstreamBoundary(boundary) {
  try {
    const station = await fetchStation(boundary.stationId);
    const dataset = datasetById.get(boundary.datasetId);
    if (!dataset?.seriesAudit) {
      throw new Error(`missing series audit ${boundary.datasetId}`);
    }
    equal(station.label, dataset.seriesAudit.station, 'station label');
    equal(
      station.stationReference,
      boundary.stationReference,
      'station reference',
    );
    equal(station.riverName, boundary.watercourse, 'watercourse');
    near(Number(station.long), boundary.coordinate.lon, 'longitude');
    near(Number(station.lat), boundary.coordinate.lat, 'latitude');
    const measureIds = measureIdentifiers(station.measures);
    if (
      !measureIds.some((id) =>
        id.endsWith(`/${dataset.seriesAudit.measureNotation}`),
      )
    ) {
      throw new Error(`measure ${dataset.seriesAudit.measureNotation} not advertised`);
    }
    return {
      id: boundary.id,
      state: 'passed',
      stationId: boundary.stationId,
      stationReference: boundary.stationReference,
      measureNotation: dataset.seriesAudit.measureNotation,
      nativeIntervalSeconds: boundary.nativeIntervalSeconds,
      readings: dataset.seriesAudit.readings,
      missingReadings: dataset.seriesAudit.missingReadings,
      placement: boundary.placement.state,
      downloadedReadings: false,
    };
  } catch (error) {
    return {
      id: boundary.id,
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRejectedDownstreamCandidate(candidate) {
  try {
    const station = await fetchStation(candidate.stationId);
    equal(station.label, candidate.station, 'Rockcliffe label');
    equal(station.stationReference ?? null, null, 'Rockcliffe station reference');
    near(Number(station.long), candidate.coordinate.lon, 'Rockcliffe longitude');
    near(Number(station.lat), candidate.coordinate.lat, 'Rockcliffe latitude');
    const measureIds = measureIdentifiers(station.measures);
    if (!measureIds.some((id) => id.endsWith(`/${candidate.measureNotation}`))) {
      throw new Error(`measure ${candidate.measureNotation} not advertised`);
    }
    if (measureIds.some((id) => /-(flow|level)-/.test(id))) {
      throw new Error('Rockcliffe unexpectedly advertises a surface-water measure');
    }
    return {
      id: 'rockcliffe-downstream-screen',
      state: 'passed',
      stationId: candidate.stationId,
      measureNotation: candidate.measureNotation,
      classification: candidate.classification,
      promotedToBoundary: false,
      downloadedReadings: false,
    };
  } catch (error) {
    return {
      id: 'rockcliffe-downstream-screen',
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkObservationStationMetadata(dataset, stationId) {
  try {
    if (!dataset?.seriesAudit) {
      throw new Error('Willow Holme series audit is missing');
    }
    const station = await fetchStation(stationId);
    equal(station.label, dataset.seriesAudit.station, 'Willow Holme label');
    equal(
      station.stationReference,
      dataset.seriesAudit.stationReference,
      'Willow Holme station reference',
    );
    const measureIds = measureIdentifiers(station.measures);
    if (
      !measureIds.some((id) =>
        id.endsWith(`/${dataset.seriesAudit.measureNotation}`),
      )
    ) {
      throw new Error(`measure ${dataset.seriesAudit.measureNotation} not advertised`);
    }
    return {
      id: 'willow-holme-metadata',
      state: 'passed',
      stationId,
      stationReference: dataset.seriesAudit.stationReference,
      measureNotation: dataset.seriesAudit.measureNotation,
      role: dataset.role,
      promotedToBoundary: false,
      downloadedReadings: false,
    };
  } catch (error) {
    return {
      id: 'willow-holme-metadata',
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchStation(stationId) {
  const url = `https://environment.data.gov.uk/hydrology/id/stations/${stationId}.json`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) {
      const payload = await response.json();
      const station = payload.items?.[0] ?? payload;
      if (!station || typeof station !== 'object') {
        throw new Error('station response is empty');
      }
      return station;
    }
    if (response.status !== 429 || attempt === 3) {
      throw new Error(`HTTP ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  throw new Error('station request exhausted retries');
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

function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} ${String(actual)} differs from ${String(expected)}`);
  }
}

function near(actual, expected, label) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${label} ${actual} differs from ${expected}`);
  }
}
