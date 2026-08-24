import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  EVENT_RUNOFF_MODEL_VERSION,
  deriveEmiliaEventRunoff,
} from './emilia-event-runoff-lib.mjs';

const require = createRequire(import.meta.url);
const { assertHistoricalBenchmarkManifest } = require('../packages/evidence/dist');
const { TERRAIN_FLOW_TERMINAL_CODES, TERRAIN_FLOW_TERMINAL_MISSING } =
  require('../packages/stormwater/dist');

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  await readFile(
    path.join(repositoryRoot, 'tests', 'ground-truth', 'emilia-romagna-2023', 'manifest.json'),
    'utf8',
  ),
);
assertHistoricalBenchmarkManifest(manifest);
const requestedRoot = process.argv[2] ?? process.env.GEOLENS_BENCHMARK_DATA_ROOT;
if (!requestedRoot) {
  throw new Error('Set GEOLENS_BENCHMARK_DATA_ROOT or pass the benchmark data root');
}
const dataRoot = path.resolve(requestedRoot);
const baseline = manifest.benchmark.routingBaselines.find(
  (candidate) => candidate.id === 'forli-imerg-runoff-d8-v0',
);
const terrainBaseline = manifest.benchmark.routingBaselines.find(
  (candidate) => candidate.id === 'forli-terrain-d8-v0',
);
if (
  baseline === undefined ||
  terrainBaseline === undefined ||
  baseline.modelVersion !== EVENT_RUNOFF_MODEL_VERSION ||
  baseline.evaluationReferenceAccess !== 'withheld'
) {
  throw new Error('Manifest loses the frozen event-runoff contract');
}

const inputReceipt = JSON.parse(
  await readFile(path.join(dataRoot, 'inputs', 'bounded-inputs-receipt.json'), 'utf8'),
);
const routingReceipt = JSON.parse(
  await readFile(
    path.join(dataRoot, 'derived', 'event-runoff', 'event-runoff-routing-receipt.json'),
    'utf8',
  ),
);
if (
  routingReceipt.schemaVersion !== 'event-runoff-routing-receipt-v0.1.0' ||
  routingReceipt.benchmarkId !== manifest.benchmark.id ||
  routingReceipt.model.version !== EVENT_RUNOFF_MODEL_VERSION ||
  routingReceipt.quality.status !== 'incomplete_window'
) {
  throw new Error('Event-runoff receipt is unsupported or hides input quality');
}
if (
  routingReceipt.evaluationReference.policy !== 'withheld_until_prediction_is_frozen' ||
  routingReceipt.evaluationReference.accessDuringMaterialization !== 'not_loaded' ||
  routingReceipt.evaluationReference.calibration !== false
) {
  throw new Error('Evaluation reference entered the event-runoff path');
}
assertJsonEqual(routingReceipt.grid, manifest.benchmark.spatialProtocol.grid, 'grid');

const imergDataset = manifest.datasets.find((dataset) => dataset.id === 'nasa-imerg-v07');
if (imergDataset?.acquisitionStatus !== 'downloaded_verified') {
  throw new Error('Canonical IMERG evidence is not frozen as downloaded and verified');
}
const artifacts = {
  rainfall: findArtifact(imergDataset.localArtifacts, 'imerg-v07-final-48h-source-grid.json'),
  slope: findArtifact(inputReceipt.dem.artifacts, 'copernicus-dem-glo30-slope-f32le.bin'),
  landCover: findArtifact(inputReceipt.landCover.artifacts, 'corine-clc2018-class-i16le.bin'),
  direction: findArtifact(terrainBaseline.localArtifacts, 'terrain-d8-direction-i8.bin'),
  terminalType: findArtifact(terrainBaseline.localArtifacts, 'terrain-d8-terminal-type-u8.bin'),
};
if (routingReceipt.inputs.length !== Object.keys(artifacts).length) {
  throw new Error('Event-runoff receipt has unexpected inputs');
}
for (const input of routingReceipt.inputs) {
  const expected = artifacts[input.role];
  if (
    expected === undefined ||
    input.relativePath !== expected.relativePath ||
    input.bytes !== expected.bytes ||
    input.sha256.toLowerCase() !== expected.sha256.toLowerCase()
  ) {
    throw new Error(`Unexpected event-runoff input ${input.role}`);
  }
}

const [imergBytes, slopeBytes, landCoverBytes, directionBytes, terminalTypeBytes] =
  await Promise.all([
    readPinnedArtifact(dataRoot, artifacts.rainfall),
    readPinnedArtifact(dataRoot, artifacts.slope),
    readPinnedArtifact(dataRoot, artifacts.landCover),
    readPinnedArtifact(dataRoot, artifacts.direction),
    readPinnedArtifact(dataRoot, artifacts.terminalType),
  ]);
const imerg = JSON.parse(imergBytes.toString('utf8'));
if (
  imerg.status !== 'available' ||
  imerg.provenance.datasetVersion !== '07' ||
  imerg.provenance.runType !== 'final' ||
  imerg.provenance.granuleCount !== 96 ||
  imerg.statistics.finiteCells !== 9 ||
  imerg.sourceResolution !== '0.1 degree'
) {
  throw new Error('IMERG portable evidence loses source completeness or resolution');
}
if (
  routingReceipt.provenance.rainfall.sourceResolution !== '0.1 degree' ||
  !routingReceipt.provenance.rainfall.gridRepresentation.includes('30 m')
) {
  throw new Error('Receipt confuses IMERG source resolution and representation');
}

const grid = inputReceipt.grid;
assertJsonEqual(
  grid,
  manifest.benchmark.spatialProtocol.grid,
  'input receipt grid',
);
const result = deriveEmiliaEventRunoff({
  grid,
  imerg,
  derivedAt: routingReceipt.derivedAt,
  slopeDeg: decodeFloat32Le(slopeBytes),
  landCoverClass: decodeInt16Le(landCoverBytes),
  directionCode: decodeInt8(directionBytes),
  terminalTypeCode: terminalTypeBytes,
  slopeProvenance: evidenceProvenance(inputReceipt.dem),
  landCoverProvenance: evidenceProvenance(inputReceipt.landCover),
});
assertJsonEqual(routingReceipt.counts, result.counts, 'counts');
assertJsonEqual(routingReceipt.statistics, result.statistics, 'statistics');
assertJsonEqual(routingReceipt.massBalance, result.massBalance, 'mass balance');
assertJsonEqual(
  routingReceipt.maximumTerminalAccumulation,
  result.maximumTerminalAccumulation,
  'maximum terminal accumulation',
);
const balanceTolerance = Math.max(
  1e-9,
  Math.abs(result.massBalance.localSourceVolumeM3) * 1e-12,
);
if (Math.abs(result.massBalance.differenceM3) > balanceTolerance) {
  throw new Error('Event runoff does not conserve volume');
}

const expectedOutputs = new Map([
  ['event-rainfall-48h-f32le.bin', encodeFloat32Le(result.rainfallMm)],
  ['event-runoff-coefficient-f32le.bin', encodeFloat32Le(result.runoffCoefficient)],
  ['event-runoff-depth-f32le.bin', encodeFloat32Le(result.runoffDepthMm)],
  ['event-local-runoff-volume-f64le.bin', encodeFloat64Le(result.localRunoffVolumeM3)],
  ['event-accumulated-runoff-volume-f64le.bin', encodeFloat64Le(result.accumulatedRunoffVolumeM3)],
]);
if (baseline.localArtifacts.length !== expectedOutputs.size) {
  throw new Error('Event baseline artifact count differs');
}
const loadedOutputs = new Map();
for (const artifact of baseline.localArtifacts) {
  const name = path.posix.basename(artifact.relativePath);
  const expected = expectedOutputs.get(name);
  const actual = await readPinnedArtifact(dataRoot, artifact);
  if (expected === undefined || !actual.equals(expected)) {
    throw new Error(`Event artifact differs from recomputation: ${artifact.relativePath}`);
  }
  loadedOutputs.set(name, actual);
}

const rainfall = loadedOutputs.get('event-rainfall-48h-f32le.bin');
const localVolume = loadedOutputs.get('event-local-runoff-volume-f64le.bin');
const accumulated = loadedOutputs.get('event-accumulated-runoff-volume-f64le.bin');
let verifiedLandCells = 0;
for (let index = 0; index < grid.width * grid.height; index += 1) {
  const type = terminalTypeBytes[index];
  const rain = rainfall.readFloatLE(index * 4);
  const local = localVolume.readDoubleLE(index * 8);
  const total = accumulated.readDoubleLE(index * 8);
  if (type === TERRAIN_FLOW_TERMINAL_MISSING) {
    if (!Number.isNaN(rain) || !Number.isNaN(local) || !Number.isNaN(total)) {
      throw new Error(`Missing grid cell ${index} carries event state`);
    }
  } else if (type === TERRAIN_FLOW_TERMINAL_CODES.known_permanent_water) {
    if (!Number.isNaN(rain) || !Number.isNaN(local) || !Number.isFinite(total)) {
      throw new Error(`Known-water terminal ${index} has invalid source semantics`);
    }
  } else {
    if (!Number.isFinite(rain) || rain < 0 || !Number.isFinite(local) || local < 0) {
      throw new Error(`Eligible land cell ${index} lacks physical event evidence`);
    }
    verifiedLandCells += 1;
  }
}
if (verifiedLandCells !== result.counts.sampledLandCells) {
  throw new Error('Verified land count differs from derived count');
}

console.log(JSON.stringify({
  modelVersion: result.modelVersion,
  quality: routingReceipt.quality,
  evaluationReferenceAccess: routingReceipt.evaluationReference.accessDuringMaterialization,
  imerg: {
    datasetVersion: imerg.provenance.datasetVersion,
    runType: imerg.provenance.runType,
    granules: imerg.provenance.granuleCount,
    sourceResolution: imerg.sourceResolution,
  },
  counts: result.counts,
  statistics: result.statistics,
  massBalance: result.massBalance,
  maximumTerminalAccumulation: result.maximumTerminalAccumulation,
  verifiedArtifacts: baseline.localArtifacts.length,
  verifiedBytes: baseline.localArtifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
}, null, 2));

function evidenceProvenance(value) {
  return {
    provider: value.provider,
    dataset: value.dataset,
    datasetVersion: value.datasetVersion,
    sourceResolution: value.sourceResolution,
    observedAt: value.observedAt,
    acquiredAt: value.acquiredAt,
    samplingMethod: value.samplingMethod,
    transformationVersion: value.transformationVersion,
  };
}

function findArtifact(values, fileName) {
  const value = values?.find((candidate) => candidate.relativePath.endsWith('/' + fileName));
  if (value === undefined) throw new Error(`Missing artifact ${fileName}`);
  return value;
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

function encodeFloat32Le(values) {
  const bytes = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i += 1) bytes.writeFloatLE(values[i], i * 4);
  return bytes;
}

function encodeFloat64Le(values) {
  const bytes = Buffer.alloc(values.length * 8);
  for (let i = 0; i < values.length; i += 1) bytes.writeDoubleLE(values[i], i * 8);
  return bytes;
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} differs`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
