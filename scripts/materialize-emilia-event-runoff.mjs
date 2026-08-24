import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  EVENT_RUNOFF_MODEL_VERSION,
  deriveEmiliaEventRunoff,
} from './emilia-event-runoff-lib.mjs';

const require = createRequire(import.meta.url);
const { assertHistoricalBenchmarkManifest } = require('../packages/evidence/dist');

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  await readFile(
    path.join(repositoryRoot, 'tests', 'ground-truth', 'emilia-romagna-2023', 'manifest.json'),
    'utf8',
  ),
);
assertHistoricalBenchmarkManifest(manifest);
const options = parseArguments(process.argv.slice(2));
const requestedRoot = options.dataRoot ?? process.env.GEOLENS_BENCHMARK_DATA_ROOT;
if (!requestedRoot) {
  throw new Error('Set GEOLENS_BENCHMARK_DATA_ROOT or pass the benchmark data root');
}
const dataRoot = path.resolve(requestedRoot);
const derivedAt = options.derivedAt ?? new Date().toISOString();
if (Number.isNaN(Date.parse(derivedAt))) {
  throw new Error('--derived-at must be an ISO 8601 timestamp');
}

const inputReceipt = JSON.parse(
  await readFile(path.join(dataRoot, 'inputs', 'bounded-inputs-receipt.json'), 'utf8'),
);
if (
  inputReceipt.schemaVersion !== 'bounded-environmental-inputs-v0.2.0' ||
  inputReceipt.benchmarkId !== manifest.benchmark.id ||
  inputReceipt.xdbtr.status !== 'incomplete_window'
) {
  throw new Error('Bounded inputs lose their benchmark or incomplete-window contract');
}
assertJsonEqual(inputReceipt.grid, manifest.benchmark.spatialProtocol.grid, 'grid');

const terrainBaseline = manifest.benchmark.routingBaselines.find(
  (candidate) => candidate.id === 'forli-terrain-d8-v0',
);
if (terrainBaseline === undefined) {
  throw new Error('Frozen terrain D8 baseline is required');
}
const imergPath = path.join(dataRoot, 'inputs', 'imerg-v07-final-48h-source-grid.json');
const imerg = JSON.parse(await readFile(imergPath, 'utf8'));
const artifacts = {
  rainfall: await describeExisting(dataRoot, imergPath),
  slope: findArtifact(inputReceipt.dem.artifacts, 'copernicus-dem-glo30-slope-f32le.bin'),
  landCover: findArtifact(inputReceipt.landCover.artifacts, 'corine-clc2018-class-i16le.bin'),
  direction: findArtifact(terrainBaseline.localArtifacts, 'terrain-d8-direction-i8.bin'),
  terminalType: findArtifact(terrainBaseline.localArtifacts, 'terrain-d8-terminal-type-u8.bin'),
};
const manifestArtifacts = allManifestArtifacts(manifest);
for (const artifact of Object.values(artifacts)) {
  const pinned = manifestArtifacts.get(artifact.relativePath);
  if (pinned === undefined) {
    throw new Error(`Input artifact is not frozen by manifest: ${artifact.relativePath}`);
  } else if (
    pinned.bytes !== artifact.bytes ||
    pinned.sha256.toLowerCase() !== artifact.sha256.toLowerCase()
  ) {
    throw new Error(`Input artifact differs from manifest: ${artifact.relativePath}`);
  }
}

const [slopeBytes, landCoverBytes, directionBytes, terminalTypeBytes] =
  await Promise.all([
    readPinnedArtifact(dataRoot, artifacts.slope),
    readPinnedArtifact(dataRoot, artifacts.landCover),
    readPinnedArtifact(dataRoot, artifacts.direction),
    readPinnedArtifact(dataRoot, artifacts.terminalType),
  ]);
const grid = inputReceipt.grid;
const cellCount = grid.width * grid.height;
if (
  slopeBytes.length !== cellCount * 4 ||
  landCoverBytes.length !== cellCount * 2 ||
  directionBytes.length !== cellCount ||
  terminalTypeBytes.length !== cellCount
) {
  throw new Error('Event-runoff input length disagrees with frozen grid');
}

const result = deriveEmiliaEventRunoff({
  grid,
  imerg,
  derivedAt,
  slopeDeg: decodeFloat32Le(slopeBytes),
  landCoverClass: decodeInt16Le(landCoverBytes),
  directionCode: decodeInt8(directionBytes),
  terminalTypeCode: terminalTypeBytes,
  slopeProvenance: {
    provider: inputReceipt.dem.provider,
    dataset: inputReceipt.dem.dataset,
    datasetVersion: inputReceipt.dem.datasetVersion,
    sourceResolution: inputReceipt.dem.sourceResolution,
    observedAt: inputReceipt.dem.observedAt,
    acquiredAt: inputReceipt.dem.acquiredAt,
    samplingMethod: inputReceipt.dem.samplingMethod,
    transformationVersion: inputReceipt.dem.transformationVersion,
  },
  landCoverProvenance: {
    provider: inputReceipt.landCover.provider,
    dataset: inputReceipt.landCover.dataset,
    datasetVersion: inputReceipt.landCover.datasetVersion,
    sourceResolution: inputReceipt.landCover.sourceResolution,
    observedAt: inputReceipt.landCover.observedAt,
    acquiredAt: inputReceipt.landCover.acquiredAt,
    samplingMethod: inputReceipt.landCover.samplingMethod,
    transformationVersion: inputReceipt.landCover.transformationVersion,
  },
});

const outputDefinitions = [
  float32Output('event-rainfall-48h-f32le.bin', result.rainfallMm, 'mm',
    'nearest native IMERG 0.1 degree source-cell sample represented on each eligible 30 m land cell'),
  float32Output('event-runoff-coefficient-f32le.bin', result.runoffCoefficient, 'fraction',
    'canonical inspectable runoff coefficient proxy on eligible land; NaN=excluded/no-data'),
  float32Output('event-runoff-depth-f32le.bin', result.runoffDepthMm, 'mm',
    'canonical derived runoff depth on eligible land; NaN=excluded/no-data'),
  float64Output('event-local-runoff-volume-f64le.bin', result.localRunoffVolumeM3, 'm3',
    'local runoff depth converted over 900 m2 land-cell area; NaN=excluded/no-data'),
  float64Output('event-accumulated-runoff-volume-f64le.bin', result.accumulatedRunoffVolumeM3, 'm3',
    'no-loss volume accumulated over frozen D8; known water may receive upstream volume but is never a local source'),
];
const outputArtifacts = outputDefinitions.map((output) => ({
  relativePath: path.posix.join('derived', 'event-runoff', output.fileName),
  bytes: output.bytes.length,
  sha256: sha256(output.bytes),
  encoding: output.encoding,
  missingSentinel: 'NaN',
  unit: output.unit,
}));

const eventBaseline = manifest.benchmark.routingBaselines.find(
  (candidate) => candidate.id === 'forli-imerg-runoff-d8-v0',
);
if (eventBaseline === undefined) {
  throw new Error('Manifest does not freeze the event-runoff baseline');
} else {
  if (eventBaseline.modelVersion !== EVENT_RUNOFF_MODEL_VERSION) {
    throw new Error('Manifest event-runoff model version differs');
  }
  assertFrozenOutputs(eventBaseline.localArtifacts, outputArtifacts);
}

const outputDirectory = path.join(dataRoot, 'derived', 'event-runoff');
await mkdir(outputDirectory, { recursive: true });
for (const output of outputDefinitions) {
  await writeFile(path.join(outputDirectory, output.fileName), output.bytes);
}
const receipt = {
  schemaVersion: 'event-runoff-routing-receipt-v0.1.0',
  benchmarkId: manifest.benchmark.id,
  replayMode: manifest.benchmark.replayMode,
  claimLevel: 'hydrologic_routing',
  derivedAt,
  quality: {
    status: 'incomplete_window',
    missingReason:
      'DBTR known permanent-water presence is not a complete historical snapshot; zeros in that mask do not prove historical land.',
  },
  evaluationReference: {
    policy: manifest.benchmark.spatialProtocol.masks.evaluationReference,
    accessDuringMaterialization: 'not_loaded',
    calibration: false,
  },
  grid,
  model: {
    version: result.modelVersion,
    runoffModelVersion: result.runoffModelVersion,
    rainfallSamplingVersion: 'imerg-to-forli-grid-v0.1.0',
    routingGraphVersion: terrainBaseline.modelVersion,
    accumulation: 'no loss or attenuation over the frozen D8 graph',
  },
  inputs: Object.entries(artifacts).map(([role, artifact]) => ({
    role,
    relativePath: artifact.relativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256.toLowerCase(),
  })),
  provenance: {
    rainfall: {
      ...imerg.provenance,
      sourceResolution: imerg.sourceResolution,
      sourceTemporalResolution: imerg.sourceTemporalResolution,
      temporal: imerg.temporal,
      spatial: imerg.spatial,
      gridRepresentation: 'nearest native source-cell sample at each EPSG:32632 30 m cell centre',
    },
    slope: inputReceipt.dem,
    landCover: inputReceipt.landCover,
    routing: {
      baselineId: terrainBaseline.id,
      modelVersion: terrainBaseline.modelVersion,
      evaluationReferenceAccess: terrainBaseline.evaluationReferenceAccess,
    },
  },
  counts: result.counts,
  statistics: result.statistics,
  massBalance: result.massBalance,
  maximumTerminalAccumulation: result.maximumTerminalAccumulation,
  artifacts: outputArtifacts,
  limitations: [
    'Runoff is an experimental coefficient proxy, not a calibrated rainfall-runoff model.',
    'D8 routing is unconditioned and does not fill depressions or model river levels, discharge, breaches, drainage capacity or hydraulics.',
    'Accumulated volume is terrain-flow concentration, not inundation extent, water depth, flood probability or an operational forecast.',
  ],
};
const receiptPath = path.join(outputDirectory, 'event-runoff-routing-receipt.json');
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  receipt: path.relative(dataRoot, receiptPath).replaceAll('\\', '/'),
  quality: receipt.quality,
  counts: receipt.counts,
  statistics: receipt.statistics,
  massBalance: receipt.massBalance,
  maximumTerminalAccumulation: receipt.maximumTerminalAccumulation,
  artifacts: outputArtifacts,
}, null, 2));

function parseArguments(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--derived-at') {
      result.derivedAt = args[++index];
      if (!result.derivedAt) throw new Error('--derived-at requires a value');
    } else if (value.startsWith('--')) {
      throw new Error(`Unsupported argument ${value}`);
    } else if (result.dataRoot === undefined) {
      result.dataRoot = value;
    } else {
      throw new Error(`Unexpected argument ${value}`);
    }
  }
  return result;
}

function findArtifact(values, fileName) {
  const value = values.find((candidate) => candidate.relativePath.endsWith('/' + fileName));
  if (value === undefined) throw new Error(`Missing artifact ${fileName}`);
  return value;
}

function allManifestArtifacts(value) {
  const result = new Map();
  const groups = [
    value.benchmark.localArtifacts ?? [],
    ...value.benchmark.routingBaselines.map((baseline) => baseline.localArtifacts ?? []),
    ...value.datasets.map((dataset) => dataset.localArtifacts ?? []),
  ];
  for (const group of groups) for (const artifact of group) result.set(artifact.relativePath, artifact);
  return result;
}

async function describeExisting(root, absolutePath) {
  const bytes = await readFile(absolutePath);
  return {
    relativePath: path.relative(root, absolutePath).replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

async function readPinnedArtifact(root, artifact) {
  const absolutePath = path.resolve(root, artifact.relativePath);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Artifact escapes root');
  const bytes = await readFile(absolutePath);
  if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256.toLowerCase()) {
    throw new Error(`Artifact identity mismatch: ${artifact.relativePath}`);
  }
  return bytes;
}

function decodeFloat32Le(bytes) {
  const values = new Float32Array(bytes.length / 4);
  for (let i = 0; i < values.length; i += 1) values[i] = bytes.readFloatLE(i * 4);
  return values;
}

function decodeInt16Le(bytes) {
  const values = new Int16Array(bytes.length / 2);
  for (let i = 0; i < values.length; i += 1) values[i] = bytes.readInt16LE(i * 2);
  return values;
}

function decodeInt8(bytes) {
  const values = new Int8Array(bytes.length);
  for (let i = 0; i < values.length; i += 1) values[i] = bytes.readInt8(i);
  return values;
}

function float32Output(fileName, values, unit, encoding) {
  const bytes = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i += 1) bytes.writeFloatLE(values[i], i * 4);
  return { fileName, bytes, unit, encoding };
}

function float64Output(fileName, values, unit, encoding) {
  const bytes = Buffer.alloc(values.length * 8);
  for (let i = 0; i < values.length; i += 1) bytes.writeDoubleLE(values[i], i * 8);
  return { fileName, bytes, unit, encoding };
}

function assertFrozenOutputs(expected, actual) {
  if (expected.length !== actual.length) throw new Error('Frozen output count differs');
  const byPath = new Map(expected.map((artifact) => [artifact.relativePath, artifact]));
  for (const artifact of actual) {
    const pinned = byPath.get(artifact.relativePath);
    if (pinned === undefined || pinned.bytes !== artifact.bytes || pinned.sha256.toLowerCase() !== artifact.sha256) {
      throw new Error(`Derived output differs from manifest: ${artifact.relativePath}`);
    }
  }
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} differs`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
