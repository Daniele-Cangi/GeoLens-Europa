import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  assertHistoricalBenchmarkManifest,
} = require('../packages/evidence/dist');
const {
  TERRAIN_FLOW_CONCENTRATION_VERSION,
  TERRAIN_FLOW_TERMINAL_CODES,
  deriveTerrainFlowConcentration,
} = require('../packages/stormwater/dist');

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  await readFile(
    path.join(
      repositoryRoot,
      'tests',
      'ground-truth',
      'emilia-romagna-2023',
      'manifest.json',
    ),
    'utf8',
  ),
);
assertHistoricalBenchmarkManifest(manifest);
const baseline = manifest.benchmark.routingBaselines.find(
  (candidate) => candidate.id === 'forli-terrain-d8-v0',
);
if (baseline === undefined) {
  throw new Error('Manifest does not declare the Forli terrain baseline');
}
if (
  baseline.modelVersion !== TERRAIN_FLOW_CONCENTRATION_VERSION ||
  baseline.evaluationReferenceAccess !== 'withheld'
) {
  throw new Error('Terrain baseline loses its model or withholding contract');
}

const requestedRoot =
  process.env.GEOLENS_BENCHMARK_DATA_ROOT ?? process.argv[2];
if (!requestedRoot) {
  throw new Error(
    'Set GEOLENS_BENCHMARK_DATA_ROOT or pass the benchmark data root',
  );
}
const dataRoot = path.resolve(requestedRoot);
const inputReceipt = JSON.parse(
  await readFile(
    path.join(dataRoot, 'inputs', 'bounded-inputs-receipt.json'),
    'utf8',
  ),
);
const routingReceipt = JSON.parse(
  await readFile(
    path.join(
      dataRoot,
      'derived',
      'terrain-routing',
      'terrain-flow-concentration-receipt.json',
    ),
    'utf8',
  ),
);

if (
  routingReceipt.schemaVersion !==
    'terrain-flow-concentration-receipt-v0.1.0' ||
  routingReceipt.benchmarkId !== manifest.benchmark.id ||
  routingReceipt.model.version !== TERRAIN_FLOW_CONCENTRATION_VERSION
) {
  throw new Error('Unsupported or mismatched terrain-routing receipt');
}
if (Number.isNaN(Date.parse(routingReceipt.derivedAt))) {
  throw new Error('Terrain-routing receipt lacks a valid derivation time');
}
if (
  routingReceipt.quality.status !== 'incomplete_window' ||
  !routingReceipt.quality.missingReason.includes('not proof of historical absence')
) {
  throw new Error('Terrain routing hides the incomplete historical water mask');
}
if (
  routingReceipt.evaluationReference.policy !==
    'withheld_until_prediction_is_frozen' ||
  routingReceipt.evaluationReference.accessDuringMaterialization !==
    'not_loaded' ||
  routingReceipt.evaluationReference.calibration !== false
) {
  throw new Error('Evaluation evidence was not kept outside materialization');
}
assertJsonEqual(
  routingReceipt.grid,
  manifest.benchmark.spatialProtocol.grid,
  'routing grid',
);

const expectedInputRoles = new Map([
  ['analysis_aoi', inputReceipt.masks.aoi],
  [
    'terrain_elevation',
    findArtifact(
      inputReceipt.dem.artifacts,
      'copernicus-dem-glo30-elevation-f32le.bin',
    ),
  ],
  [
    'known_permanent_water_cell_centre',
    findArtifact(
      inputReceipt.masks.permanentWater.artifacts,
      'xdbtr-permanent-water-known-center-mask-u8.bin',
    ),
  ],
]);
if (routingReceipt.inputs.length !== expectedInputRoles.size) {
  throw new Error('Terrain-routing receipt has unexpected input evidence');
}
for (const input of routingReceipt.inputs) {
  const expected = expectedInputRoles.get(input.role);
  if (
    expected === undefined ||
    input.relativePath !== expected.relativePath ||
    input.bytes !== expected.bytes ||
    input.sha256.toLowerCase() !== expected.sha256.toLowerCase()
  ) {
    throw new Error(`Unexpected terrain-routing input role ${input.role}`);
  }
}

const aoiBytes = await readPinnedArtifact(
  dataRoot,
  expectedInputRoles.get('analysis_aoi'),
);
const elevationBytes = await readPinnedArtifact(
  dataRoot,
  expectedInputRoles.get('terrain_elevation'),
);
const waterBytes = await readPinnedArtifact(
  dataRoot,
  expectedInputRoles.get('known_permanent_water_cell_centre'),
);
const grid = routingReceipt.grid;
const cellCount = grid.width * grid.height;
const expected = deriveTerrainFlowConcentration({
  width: grid.width,
  height: grid.height,
  cellSizeM: grid.cellSizeM,
  insideAoi: aoiBytes,
  elevationM: decodeFloat32Le(elevationBytes),
  knownPermanentWater: waterBytes,
  elevationToleranceM: routingReceipt.model.elevationToleranceM,
});

assertJsonEqual(routingReceipt.counts, expected.counts, 'routing counts');
assertJsonEqual(
  routingReceipt.massBalance,
  expected.massBalance,
  'routing mass balance',
);
assertJsonEqual(
  routingReceipt.maximumTerminalAccumulation,
  expected.maximumTerminalAccumulation,
  'maximum terminal accumulation',
);
if (expected.massBalance.differenceM2 !== 0) {
  throw new Error('Terrain-routing land area is not conserved');
}

const receiptArtifacts = new Map(
  routingReceipt.artifacts.map((artifact) => [artifact.relativePath, artifact]),
);
if (receiptArtifacts.size !== 4 || baseline.localArtifacts.length !== 4) {
  throw new Error('Terrain baseline must expose exactly four artifacts');
}
const loadedOutputs = new Map();
for (const manifestArtifact of baseline.localArtifacts) {
  const receiptArtifact = receiptArtifacts.get(manifestArtifact.relativePath);
  if (
    receiptArtifact === undefined ||
    receiptArtifact.bytes !== manifestArtifact.bytes ||
    receiptArtifact.sha256.toLowerCase() !==
      manifestArtifact.sha256.toLowerCase()
  ) {
    throw new Error(
      `Terrain artifact loses its manifest identity: ${manifestArtifact.relativePath}`,
    );
  }
  loadedOutputs.set(
    manifestArtifact.relativePath,
    await readPinnedArtifact(dataRoot, manifestArtifact),
  );
}

const actualDirection = outputByName(
  loadedOutputs,
  'terrain-d8-direction-i8.bin',
);
const actualTerminalType = outputByName(
  loadedOutputs,
  'terrain-d8-terminal-type-u8.bin',
);
const actualTerminalIndex = outputByName(
  loadedOutputs,
  'terrain-d8-terminal-index-i32le.bin',
);
const actualArea = outputByName(
  loadedOutputs,
  'terrain-d8-contributing-land-area-f64le.bin',
);
assertBufferEqual(
  actualDirection,
  Buffer.from(
    expected.directionCode.buffer,
    expected.directionCode.byteOffset,
    expected.directionCode.byteLength,
  ),
  'direction',
);
assertBufferEqual(
  actualTerminalType,
  Buffer.from(
    expected.terminalTypeCode.buffer,
    expected.terminalTypeCode.byteOffset,
    expected.terminalTypeCode.byteLength,
  ),
  'terminal type',
);
assertBufferEqual(
  actualTerminalIndex,
  encodeInt32Le(expected.terminalIndex),
  'terminal index',
);
assertBufferEqual(
  actualArea,
  encodeFloat64Le(expected.contributingLandAreaM2),
  'contributing area',
);

let verifiedTerminalAreaM2 = 0;
let verifiedFlowingCells = 0;
for (let index = 0; index < cellCount; index += 1) {
  const direction = actualDirection.readInt8(index);
  const terminalType = actualTerminalType[index];
  const terminal = actualTerminalIndex.readInt32LE(index * 4);
  const areaM2 = actualArea.readDoubleLE(index * 8);
  if (aoiBytes[index] === 0) {
    if (
      direction !== -128 ||
      terminalType !== 255 ||
      terminal !== -1 ||
      !Number.isNaN(areaM2)
    ) {
      throw new Error(`Terrain routing fabricates state outside AOI at ${index}`);
    }
    continue;
  }
  if (waterBytes[index] === 1) {
    if (
      direction !== -1 ||
      terminalType !== TERRAIN_FLOW_TERMINAL_CODES.known_permanent_water ||
      terminal !== index
    ) {
      throw new Error(`Known permanent water is not an explicit terminal at ${index}`);
    }
  } else if (Number.isFinite(elevationBytes.readFloatLE(index * 4))) {
    if (!Number.isFinite(areaM2) || areaM2 < grid.cellSizeM ** 2) {
      throw new Error(`Eligible land loses physical area at ${index}`);
    }
    if (terminalType === TERRAIN_FLOW_TERMINAL_CODES.flowing) {
      verifiedFlowingCells += 1;
      if (direction < 0 || direction > 7 || terminal < 0) {
        throw new Error(`Flowing cell has invalid routing state at ${index}`);
      }
    } else if (direction !== -1 || terminal !== index) {
      throw new Error(`Terminal cell is not self-referential at ${index}`);
    }
  }
  if (
    terminalType !== TERRAIN_FLOW_TERMINAL_CODES.flowing &&
    terminalType !== 255 &&
    Number.isFinite(areaM2)
  ) {
    verifiedTerminalAreaM2 += areaM2;
  }
}
if (
  verifiedFlowingCells !== expected.counts.flowingCells ||
  verifiedTerminalAreaM2 !== expected.massBalance.sourceLandAreaM2
) {
  throw new Error('Terrain-routing output statistics do not close');
}

console.log(
  JSON.stringify(
    {
      modelVersion: expected.modelVersion,
      quality: routingReceipt.quality,
      evaluationReferenceAccess:
        routingReceipt.evaluationReference.accessDuringMaterialization,
      counts: expected.counts,
      massBalance: expected.massBalance,
      maximumTerminalAccumulation:
        expected.maximumTerminalAccumulation,
      verifiedArtifacts: baseline.localArtifacts.length,
      verifiedBytes: baseline.localArtifacts.reduce(
        (sum, artifact) => sum + artifact.bytes,
        0,
      ),
    },
    null,
    2,
  ),
);

function findArtifact(artifacts, fileName) {
  const artifact = artifacts.find((candidate) =>
    candidate.relativePath.endsWith('/' + fileName),
  );
  if (artifact === undefined) {
    throw new Error(`Missing artifact ${fileName}`);
  }
  return artifact;
}

function outputByName(outputs, fileName) {
  for (const [relativePath, bytes] of outputs) {
    if (relativePath.endsWith('/' + fileName)) {
      return bytes;
    }
  }
  throw new Error(`Missing terrain output ${fileName}`);
}

async function readPinnedArtifact(root, artifact) {
  if (artifact === undefined) {
    throw new Error('Required artifact is undefined');
  }
  const absolutePath = path.resolve(root, artifact.relativePath);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Artifact escapes data root: ${artifact.relativePath}`);
  }
  const bytes = await readFile(absolutePath);
  if (
    bytes.length !== artifact.bytes ||
    sha256(bytes) !== artifact.sha256.toLowerCase()
  ) {
    throw new Error(`Artifact identity mismatch: ${artifact.relativePath}`);
  }
  return bytes;
}

function decodeFloat32Le(bytes) {
  const values = new Float32Array(bytes.length / 4);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = bytes.readFloatLE(index * 4);
  }
  return values;
}

function encodeInt32Le(values) {
  const bytes = Buffer.alloc(values.length * 4);
  for (let index = 0; index < values.length; index += 1) {
    bytes.writeInt32LE(values[index], index * 4);
  }
  return bytes;
}

function encodeFloat64Le(values) {
  const bytes = Buffer.alloc(values.length * 8);
  for (let index = 0; index < values.length; index += 1) {
    bytes.writeDoubleLE(values[index], index * 8);
  }
  return bytes;
}

function assertBufferEqual(actual, expected, label) {
  if (!actual.equals(expected)) {
    throw new Error(`${label} output differs from deterministic recomputation`);
  }
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} disagrees with deterministic recomputation`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
