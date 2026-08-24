import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  assertHistoricalBenchmarkManifest,
} = require('../packages/evidence/dist');
const {
  TERRAIN_FLOW_CONCENTRATION_VERSION,
  TERRAIN_FLOW_DIRECTIONS,
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

const options = parseArguments(process.argv.slice(2));
const dataRoot = path.resolve(
  options.dataRoot ?? process.env.GEOLENS_BENCHMARK_DATA_ROOT ?? '',
);
if (!options.dataRoot && !process.env.GEOLENS_BENCHMARK_DATA_ROOT) {
  throw new Error(
    'Set GEOLENS_BENCHMARK_DATA_ROOT or pass the benchmark data root',
  );
}
const derivedAt = options.derivedAt ?? new Date().toISOString();
if (Number.isNaN(Date.parse(derivedAt))) {
  throw new Error('--derived-at must be an ISO 8601 timestamp');
}

const inputReceiptPath = path.join(
  dataRoot,
  'inputs',
  'bounded-inputs-receipt.json',
);
const inputReceipt = JSON.parse(await readFile(inputReceiptPath, 'utf8'));
if (inputReceipt.schemaVersion !== 'bounded-environmental-inputs-v0.2.0') {
  throw new Error('Unsupported bounded-input receipt schema');
}
if (inputReceipt.benchmarkId !== manifest.benchmark.id) {
  throw new Error('Bounded inputs belong to another benchmark');
}
assertJsonEqual(
  inputReceipt.grid,
  manifest.benchmark.spatialProtocol.grid,
  'grid',
);
if (inputReceipt.xdbtr.status !== 'incomplete_window') {
  throw new Error('DBTR historical incompleteness must remain explicit');
}

const aoiArtifact = inputReceipt.masks.aoi;
const elevationArtifact = findArtifact(
  inputReceipt.dem.artifacts,
  'copernicus-dem-glo30-elevation-f32le.bin',
);
const permanentWaterArtifact = findArtifact(
  inputReceipt.masks.permanentWater.artifacts,
  'xdbtr-permanent-water-known-center-mask-u8.bin',
);
const requiredArtifacts = [
  { role: 'analysis_aoi', artifact: aoiArtifact },
  { role: 'terrain_elevation', artifact: elevationArtifact },
  {
    role: 'known_permanent_water_cell_centre',
    artifact: permanentWaterArtifact,
  },
];
const manifestArtifacts = allManifestArtifacts(manifest);
for (const { artifact } of requiredArtifacts) {
  const declared = manifestArtifacts.get(artifact.relativePath);
  if (
    declared === undefined ||
    declared.bytes !== artifact.bytes ||
    declared.sha256.toLowerCase() !== artifact.sha256.toLowerCase()
  ) {
    throw new Error(
      `Routing input is not pinned by the benchmark manifest: ${artifact.relativePath}`,
    );
  }
}

const loadedInputs = [];
for (const input of requiredArtifacts) {
  const bytes = await readPinnedArtifact(dataRoot, input.artifact);
  loadedInputs.push({ ...input, bytes });
}
const aoiBytes = loadedInputs[0].bytes;
const elevationBytes = loadedInputs[1].bytes;
const permanentWaterBytes = loadedInputs[2].bytes;
const grid = inputReceipt.grid;
const cellCount = grid.width * grid.height;
if (
  aoiBytes.length !== cellCount ||
  permanentWaterBytes.length !== cellCount ||
  elevationBytes.length !== cellCount * 4
) {
  throw new Error('Terrain-routing input length disagrees with the grid');
}

const result = deriveTerrainFlowConcentration({
  width: grid.width,
  height: grid.height,
  cellSizeM: grid.cellSizeM,
  insideAoi: aoiBytes,
  elevationM: decodeFloat32Le(elevationBytes),
  knownPermanentWater: permanentWaterBytes,
  elevationToleranceM: 0.000001,
});

const outputDirectory = path.join(dataRoot, 'derived', 'terrain-routing');
await mkdir(outputDirectory, { recursive: true });
const outputDefinitions = [
  {
    fileName: 'terrain-d8-direction-i8.bin',
    bytes: Buffer.from(
      result.directionCode.buffer,
      result.directionCode.byteOffset,
      result.directionCode.byteLength,
    ),
    encoding:
      'int8 row-major north-to-south; -128=outside/no-data, -1=terminal, 0..7=N,NE,E,SE,S,SW,W,NW',
    missingSentinel: -128,
  },
  {
    fileName: 'terrain-d8-terminal-type-u8.bin',
    bytes: Buffer.from(
      result.terminalTypeCode.buffer,
      result.terminalTypeCode.byteOffset,
      result.terminalTypeCode.byteLength,
    ),
    encoding:
      'uint8 row-major north-to-south; 0=flowing, 1=analysis boundary, 2=known permanent water, 3=local depression, 4=incomplete input boundary, 255=outside/no-data',
    missingSentinel: 255,
  },
  {
    fileName: 'terrain-d8-terminal-index-i32le.bin',
    bytes: encodeInt32Le(result.terminalIndex),
    encoding:
      'int32 little-endian row-major north-to-south; zero-based terminal grid index, -1=outside/no-data',
    missingSentinel: -1,
  },
  {
    fileName: 'terrain-d8-contributing-land-area-f64le.bin',
    bytes: encodeFloat64Le(result.contributingLandAreaM2),
    encoding:
      'float64 little-endian row-major north-to-south; upstream eligible land area without loss or attenuation; NaN=outside/no-data',
    missingSentinel: 'NaN',
    unit: 'm2',
  },
];

const outputArtifacts = [];
const baseline = manifest.benchmark.routingBaselines.find(
  (candidate) => candidate.id === 'forli-terrain-d8-v0',
);
if (
  baseline === undefined ||
  baseline.modelVersion !== TERRAIN_FLOW_CONCENTRATION_VERSION
) {
  throw new Error('Manifest does not freeze the active terrain-routing model');
}
const pinnedOutputs = new Map(
  baseline.localArtifacts.map((artifact) => [artifact.relativePath, artifact]),
);
for (const output of outputDefinitions) {
  const relativePath = path.posix.join(
    'derived',
    'terrain-routing',
    output.fileName,
  );
  const artifact = {
    relativePath,
    bytes: output.bytes.length,
    sha256: sha256(output.bytes),
    encoding: output.encoding,
    missingSentinel: output.missingSentinel,
    ...(output.unit === undefined ? {} : { unit: output.unit }),
  };
  const pinned = pinnedOutputs.get(relativePath);
  if (
    pinned === undefined ||
    pinned.bytes !== artifact.bytes ||
    pinned.sha256.toLowerCase() !== artifact.sha256
  ) {
    throw new Error(
      `Derived terrain output differs from the frozen manifest: ${relativePath}`,
    );
  }
  outputArtifacts.push(artifact);
}
if (outputArtifacts.length !== pinnedOutputs.size) {
  throw new Error('Manifest contains unexpected terrain-routing artifacts');
}
for (const output of outputDefinitions) {
  await writeFile(
    path.join(outputDirectory, output.fileName),
    output.bytes,
  );
}

const terminalNames = Object.fromEntries(
  Object.entries(TERRAIN_FLOW_TERMINAL_CODES).map(([name, code]) => [
    code,
    name,
  ]),
);
const topTerminals = [];
for (let index = 0; index < cellCount; index += 1) {
  const typeCode = result.terminalTypeCode[index];
  const areaM2 = result.contributingLandAreaM2[index];
  if (typeCode === 0 || typeCode === 255 || !Number.isFinite(areaM2) || areaM2 <= 0) {
    continue;
  }
  const row = Math.floor(index / grid.width);
  const column = index % grid.width;
  topTerminals.push({
    index,
    row,
    column,
    centreEastingM: grid.bounds[0] + (column + 0.5) * grid.cellSizeM,
    centreNorthingM: grid.bounds[3] - (row + 0.5) * grid.cellSizeM,
    terminal: terminalNames[typeCode],
    upstreamLandCells: result.upstreamLandCellCount[index],
    contributingLandAreaM2: areaM2,
  });
}
topTerminals.sort(
  (left, right) =>
    right.contributingLandAreaM2 - left.contributingLandAreaM2 ||
    left.index - right.index,
);

const receipt = {
  schemaVersion: 'terrain-flow-concentration-receipt-v0.1.0',
  benchmarkId: manifest.benchmark.id,
  replayMode: manifest.benchmark.replayMode,
  claimLevel: 'hydrologic_routing',
  derivedAt,
  quality: {
    status: 'incomplete_window',
    missingReason:
      'The current DBTR extraction provides incomplete historical known-water presence; zero in its mask is not proof of historical absence.',
  },
  evaluationReference: {
    policy: manifest.benchmark.spatialProtocol.masks.evaluationReference,
    accessDuringMaterialization: 'not_loaded',
    calibration: false,
  },
  grid,
  model: {
    version: TERRAIN_FLOW_CONCENTRATION_VERSION,
    directions: TERRAIN_FLOW_DIRECTIONS,
    terminalCodes: TERRAIN_FLOW_TERMINAL_CODES,
    elevationToleranceM: 0.000001,
    elevationToleranceSemantics:
      'numeric comparison tolerance, not terrain survey accuracy',
    ...result.semantics,
  },
  inputs: requiredArtifacts.map(({ role, artifact }) => ({
    role,
    relativePath: artifact.relativePath,
    bytes: artifact.bytes,
    sha256: artifact.sha256.toLowerCase(),
  })),
  provenance: {
    terrain: {
      provider: inputReceipt.dem.provider,
      dataset: inputReceipt.dem.dataset,
      datasetVersion: inputReceipt.dem.datasetVersion,
      observedAt: inputReceipt.dem.observedAt,
      acquiredAt: inputReceipt.dem.acquiredAt,
      sourceResolution: inputReceipt.dem.sourceResolution,
      samplingMethod: inputReceipt.dem.samplingMethod,
      transformationVersion: inputReceipt.dem.transformationVersion,
    },
    permanentWater: {
      provider: inputReceipt.xdbtr.provider,
      dataset: inputReceipt.xdbtr.dataset,
      datasetVersion: inputReceipt.xdbtr.datasetVersion,
      acquiredAt: inputReceipt.xdbtr.acquiredAt,
      sourceLayer: inputReceipt.masks.permanentWater.sourceLayer,
      status: inputReceipt.masks.permanentWater.status,
      samplingMethod: 'eligible polygon contains 30 m grid-cell centre',
      zeroSemantics:
        inputReceipt.masks.permanentWater.knownPresenceSemantics,
    },
  },
  counts: result.counts,
  massBalance: result.massBalance,
  maximumTerminalAccumulation: result.maximumTerminalAccumulation,
  largestTerminalCatchments: topTerminals.slice(0, 20),
  artifacts: outputArtifacts,
  limitations: result.limitations,
};
const receiptPath = path.join(
  outputDirectory,
  'terrain-flow-concentration-receipt.json',
);
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

console.log(
  JSON.stringify(
    {
      receipt: path.relative(dataRoot, receiptPath).replaceAll('\\', '/'),
      quality: receipt.quality,
      counts: receipt.counts,
      massBalance: receipt.massBalance,
      maximumTerminalAccumulation: receipt.maximumTerminalAccumulation,
      artifacts: receipt.artifacts,
    },
    null,
    2,
  ),
);

function parseArguments(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--derived-at') {
      if (args[index + 1] === undefined || args[index + 1].startsWith('--')) {
        throw new Error('--derived-at requires an ISO 8601 timestamp');
      }
      result.derivedAt = args[index + 1];
      index += 1;
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

function findArtifact(artifacts, fileName) {
  const artifact = artifacts.find((candidate) =>
    candidate.relativePath.endsWith('/' + fileName),
  );
  if (artifact === undefined) {
    throw new Error(`Missing required artifact ${fileName}`);
  }
  return artifact;
}

function allManifestArtifacts(value) {
  const result = new Map();
  const groups = [
    value.benchmark.localArtifacts ?? [],
    ...(value.benchmark.routingBaselines ?? []).map(
      (baseline) => baseline.localArtifacts ?? [],
    ),
    ...value.datasets.map((dataset) => dataset.localArtifacts ?? []),
  ];
  for (const artifacts of groups) {
    for (const artifact of artifacts) {
      result.set(artifact.relativePath, artifact);
    }
  }
  return result;
}

async function readPinnedArtifact(root, artifact) {
  const absolutePath = path.resolve(root, artifact.relativePath);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Artifact escapes the data root: ${artifact.relativePath}`);
  }
  const bytes = await readFile(absolutePath);
  if (bytes.length !== artifact.bytes) {
    throw new Error(`Byte count mismatch for ${artifact.relativePath}`);
  }
  if (sha256(bytes) !== artifact.sha256.toLowerCase()) {
    throw new Error(`SHA-256 mismatch for ${artifact.relativePath}`);
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} disagrees with the benchmark manifest`);
  }
}
