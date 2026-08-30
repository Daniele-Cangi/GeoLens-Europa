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

const checks = [];
for (const dataset of manifest.datasets.filter(
  (candidate) => candidate.seriesAudit,
)) {
  checks.push(await checkSeries(dataset));
}

const cems = manifest.datasets.find(
  (dataset) => dataset.id === 'copernicus-emsr147-carlisle',
);
checks.push(
  ...(await Promise.all(
    cems.access.additionalUrls.map((url) => checkCemsArchive(url, cems)),
  )),
);

const floodOutlines = manifest.datasets.find(
  (dataset) => dataset.id === 'ea-recorded-flood-outlines',
);
checks.push(await checkIntermittentEvaluationService(floodOutlines));

const requiredFailures = checks.filter(
  (check) => check.required && check.state !== 'passed',
);
console.log(
  JSON.stringify(
    {
      auditId: manifest.audit.id,
      checkedAt: new Date().toISOString(),
      manifestVersion: manifest.manifestVersion,
      checks,
      result: requiredFailures.length === 0 ? 'passed' : 'failed',
    },
    null,
    2,
  ),
);

if (requiredFailures.length > 0) {
  process.exitCode = 1;
}

async function checkSeries(dataset) {
  try {
    const response = await fetch(dataset.access.url, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const start = Date.parse(dataset.seriesAudit.windowStart);
    const end = Date.parse(dataset.seriesAudit.windowEndExclusive);
    const readings = (payload.items ?? []).filter((reading) => {
      const instant = parseEaUtc(reading.dateTime);
      return instant >= start && instant < end;
    });
    const values = readings.map((reading) => Number(reading.value));
    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error('series contains a non-numeric value');
    }

    const summary = {
      readings: readings.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      aggregate: values.reduce((total, value) => total + value, 0),
    };
    if (summary.readings !== dataset.seriesAudit.readings) {
      throw new Error(
        `reading count ${summary.readings} differs from ${dataset.seriesAudit.readings}`,
      );
    }
    near(summary.minimum, dataset.seriesAudit.minimum, 'minimum');
    near(summary.maximum, dataset.seriesAudit.maximum, 'maximum');
    if (dataset.seriesAudit.aggregate) {
      near(
        summary.aggregate,
        dataset.seriesAudit.aggregate.value,
        dataset.seriesAudit.aggregate.name,
      );
    }

    return {
      id: dataset.id,
      required: true,
      state: 'passed',
      ...summary,
    };
  } catch (error) {
    return {
      id: dataset.id,
      required: true,
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkCemsArchive(url, dataset) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const bytes = Number(response.headers.get('content-length'));
    const expectedBytes = url.includes('MONIT01')
      ? dataset.facts.monitoringVectorBytes
      : dataset.facts.initialVectorBytes;
    if (bytes !== expectedBytes) {
      throw new Error(`content length ${bytes} differs from ${expectedBytes}`);
    }
    return {
      id: url.includes('MONIT01') ? 'cems-monitoring-vector' : 'cems-initial-vector',
      required: true,
      state: 'passed',
      bytes,
      downloaded: false,
    };
  } catch (error) {
    return {
      id: url.includes('MONIT01') ? 'cems-monitoring-vector' : 'cems-initial-vector',
      required: true,
      state: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkIntermittentEvaluationService(dataset) {
  const url = new URL(dataset.access.url);
  url.searchParams.set('limit', '1');
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    return {
      id: dataset.id,
      required: false,
      state: 'passed',
      numberReturned: payload.numberReturned ?? payload.features?.length ?? null,
      geometryLoadedIntoModel: false,
    };
  } catch (error) {
    return {
      id: dataset.id,
      required: false,
      state: 'intermittent',
      reason: error instanceof Error ? error.message : String(error),
      geometryLoadedIntoModel: false,
    };
  }
}

function parseEaUtc(value) {
  if (typeof value !== 'string') {
    throw new Error('reading has no dateTime string');
  }
  const timestamp = Date.parse(value.endsWith('Z') ? value : `${value}Z`);
  if (Number.isNaN(timestamp)) {
    throw new Error(`invalid reading timestamp ${value}`);
  }
  return timestamp;
}

function near(actual, expected, label) {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${label} ${actual} differs from ${expected}`);
  }
}
