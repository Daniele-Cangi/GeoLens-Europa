import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(
  repositoryRoot,
  'tests',
  'ground-truth',
  'emilia-romagna-2023',
  'manifest.json',
);
const outputPath = path.join(
  repositoryRoot,
  'packages',
  'evidence',
  'src',
  'emiliaMapData.generated.ts',
);

const options = parseArguments(process.argv.slice(2));
const configuredDataRoot =
  options.dataRoot ?? process.env.GEOLENS_BENCHMARK_DATA_ROOT;
if (!configuredDataRoot) {
  throw new Error(
    'Set GEOLENS_BENCHMARK_DATA_ROOT or pass --data-root <path>',
  );
}

const dataRoot = path.resolve(configuredDataRoot);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.manifestVersion !== '1.15.0') {
  throw new Error('The map projection is pinned to manifest v1.15.0');
}

const inputReceipt = JSON.parse(
  await readFile(
    path.join(dataRoot, 'inputs', 'bounded-inputs-receipt.json'),
    'utf8',
  ),
);
const terrainReceipt = JSON.parse(
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

const grid = inputReceipt.grid;
assertJsonEqual(grid, manifest.benchmark.spatialProtocol.grid, 'source grid');
if (terrainReceipt.grid.width !== grid.width || terrainReceipt.grid.height !== grid.height) {
  throw new Error('Terrain-routing receipt disagrees with the bounded grid');
}
if (
  terrainReceipt.evaluationReference?.accessDuringMaterialization !==
    'not_loaded' ||
  terrainReceipt.evaluationReference?.calibration !== false
) {
  throw new Error('Map generation requires the evaluation reference to remain withheld');
}

const allArtifacts = new Map();
for (const group of [
  { localArtifacts: manifest.benchmark.localArtifacts ?? [] },
  ...(manifest.benchmark.routingBaselines ?? []),
  ...(manifest.benchmark.evaluationRuns ?? []),
  ...(manifest.benchmark.observationComparisonRuns ?? []),
  ...manifest.datasets,
]) {
  for (const artifact of group.localArtifacts ?? []) {
    allArtifacts.set(artifact.relativePath, artifact);
  }
}

const artifactDefinitions = {
  aoi: findArtifact(
    inputReceipt.masks.aoi,
    'inputs/common-aoi-mask-u8.bin',
  ),
  elevation: findArtifact(
    inputReceipt.dem.artifacts,
    'inputs/copernicus-dem-glo30-elevation-f32le.bin',
  ),
  landCover: findArtifact(
    inputReceipt.landCover.artifacts,
    'inputs/corine-clc2018-class-i16le.bin',
  ),
  knownWater: findArtifact(
    inputReceipt.masks.permanentWater.artifacts,
    'inputs/xdbtr-permanent-water-known-center-mask-u8.bin',
  ),
  terrainConcentration: findArtifact(
    terrainReceipt.artifacts,
    'derived/terrain-routing/terrain-d8-contributing-land-area-f64le.bin',
  ),
};

const loaded = {};
for (const [name, artifact] of Object.entries(artifactDefinitions)) {
  const pinned = allArtifacts.get(artifact.relativePath);
  if (
    !pinned ||
    pinned.bytes !== artifact.bytes ||
    pinned.sha256.toLowerCase() !== artifact.sha256.toLowerCase()
  ) {
    throw new Error(`Map source is not pinned: ${artifact.relativePath}`);
  }
  loaded[name] = await readPinnedArtifact(dataRoot, artifact);
}

const cellCount = grid.width * grid.height;
assertByteLength(loaded.aoi, cellCount, 'AOI mask');
assertByteLength(loaded.elevation, cellCount * 4, 'elevation');
assertByteLength(loaded.landCover, cellCount * 2, 'land cover');
assertByteLength(loaded.knownWater, cellCount, 'known water');
assertByteLength(
  loaded.terrainConcentration,
  cellCount * 8,
  'terrain concentration',
);

const source = {
  aoi: loaded.aoi,
  elevation: decodeFloat32Le(loaded.elevation),
  landCover: decodeInt16Le(loaded.landCover),
  knownWater: loaded.knownWater,
  terrainConcentration: decodeFloat64Le(loaded.terrainConcentration),
};
const blockSize = 10;
const displayWidth = Math.ceil(grid.width / blockSize);
const displayHeight = Math.ceil(grid.height / blockSize);
const displayCellCount = displayWidth * displayHeight;
const aoiCoverage = new Uint8Array(displayCellCount);
const elevationMeans = new Float64Array(displayCellCount).fill(Number.NaN);
const landCoverGroups = new Uint8Array(displayCellCount);
const knownWater = new Uint8Array(displayCellCount).fill(255);
const terrainMaxima = new Float64Array(displayCellCount).fill(Number.NaN);

for (let displayRow = 0; displayRow < displayHeight; displayRow += 1) {
  for (let displayColumn = 0; displayColumn < displayWidth; displayColumn += 1) {
    const displayIndex = displayRow * displayWidth + displayColumn;
    const startRow = displayRow * blockSize;
    const endRow = Math.min(startRow + blockSize, grid.height);
    const startColumn = displayColumn * blockSize;
    const endColumn = Math.min(startColumn + blockSize, grid.width);
    const blockCellCount = (endRow - startRow) * (endColumn - startColumn);
    let insideCount = 0;
    let elevationSum = 0;
    let elevationCount = 0;
    let blockTerrainMaximum = Number.NEGATIVE_INFINITY;
    let containsKnownWater = false;
    const groupCounts = new Uint16Array(6);

    for (let row = startRow; row < endRow; row += 1) {
      for (let column = startColumn; column < endColumn; column += 1) {
        const sourceIndex = row * grid.width + column;
        if (source.aoi[sourceIndex] !== 1) {
          continue;
        }

        insideCount += 1;
        const elevation = source.elevation[sourceIndex];
        if (Number.isFinite(elevation)) {
          elevationSum += elevation;
          elevationCount += 1;
        }
        const group = landCoverGroup(source.landCover[sourceIndex]);
        if (group > 0) {
          groupCounts[group] += 1;
        }
        if (source.knownWater[sourceIndex] === 1) {
          containsKnownWater = true;
        }
        const concentration = source.terrainConcentration[sourceIndex];
        if (Number.isFinite(concentration)) {
          blockTerrainMaximum = Math.max(blockTerrainMaximum, concentration);
        }
      }
    }

    aoiCoverage[displayIndex] = Math.round(
      (insideCount / blockCellCount) * 254,
    );
    if (elevationCount > 0) {
      elevationMeans[displayIndex] = elevationSum / elevationCount;
    }
    landCoverGroups[displayIndex] = dominantGroup(groupCounts);
    if (insideCount > 0) {
      knownWater[displayIndex] = containsKnownWater ? 1 : 0;
    }
    if (Number.isFinite(blockTerrainMaximum)) {
      terrainMaxima[displayIndex] = blockTerrainMaximum;
    }
  }
}

const elevationDomain = finiteDomain(elevationMeans);
const terrainDomain = finiteDomain(terrainMaxima);
const elevationQuantized = quantize(elevationMeans, elevationDomain, false);
const terrainQuantized = quantize(terrainMaxima, terrainDomain, true);
const sourceArtifacts = Object.fromEntries(
  Object.entries(artifactDefinitions).map(([name, artifact]) => [
    name,
    {
      relativePath: artifact.relativePath,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    },
  ]),
);

const generatedData = {
  schemaVersion: 'emilia-map-data-v0.1.0',
  manifestVersion: manifest.manifestVersion,
  benchmarkId: manifest.benchmark.id,
  sourceGrid: grid,
  displayGrid: {
    crs: grid.crs,
    bounds: grid.bounds,
    width: displayWidth,
    height: displayHeight,
    nominalCellSizeM: grid.cellSizeM * blockSize,
    sourceBlockSize: blockSize,
    rowOrder: grid.rowOrder,
    cellCount: displayCellCount,
  },
  encoding: {
    container: 'base64',
    values: 'uint8 row-major north-to-south',
    continuousNoData: 255,
  },
  sourceArtifacts,
  arrays: {
    aoiCoverage: encodeBase64(aoiCoverage),
    elevationMean: encodeBase64(elevationQuantized),
    dominantLandCover: encodeBase64(landCoverGroups),
    knownPermanentWater: encodeBase64(knownWater),
    terrainContributingAreaMaximum: encodeBase64(terrainQuantized),
  },
  domains: {
    elevationMeanM: elevationDomain,
    terrainContributingAreaMaximumM2: terrainDomain,
  },
};

const output = `/* This file is generated by scripts/materialize-emilia-map-manifest.mjs. */\nexport const EMILIA_MAP_DATA = ${JSON.stringify(generatedData, null, 2)} as const;\n`;
if (options.check) {
  const existing = await readFile(outputPath, 'utf8');
  if (normalizeLineEndings(existing) !== normalizeLineEndings(output)) {
    throw new Error('Generated Emilia map data is stale');
  }
  console.log(`Verified ${path.relative(repositoryRoot, outputPath)}`);
} else {
  await writeFile(outputPath, output, 'utf8');
  console.log(`Wrote ${path.relative(repositoryRoot, outputPath)}`);
}

function parseArguments(args) {
  const parsed = { check: false, dataRoot: undefined };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--check') {
      parsed.check = true;
    } else if (args[index] === '--data-root') {
      parsed.dataRoot = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  return parsed;
}

function findArtifact(value, relativePath) {
  const candidates = Array.isArray(value) ? value : [value];
  const artifact = candidates.find(
    (candidate) => candidate.relativePath === relativePath,
  );
  if (!artifact) {
    throw new Error(`Missing artifact definition: ${relativePath}`);
  }
  return artifact;
}

async function readPinnedArtifact(root, artifact) {
  const bytes = await readFile(path.join(root, artifact.relativePath));
  assertByteLength(bytes, artifact.bytes, artifact.relativePath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest.toLowerCase() !== artifact.sha256.toLowerCase()) {
    throw new Error(`SHA-256 mismatch: ${artifact.relativePath}`);
  }
  return bytes;
}

function assertByteLength(bytes, expected, label) {
  if (bytes.length !== expected) {
    throw new Error(`${label} has ${bytes.length} bytes; expected ${expected}`);
  }
}

function decodeFloat32Le(bytes) {
  const values = new Float32Array(bytes.length / 4);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = bytes.readFloatLE(index * 4);
  }
  return values;
}

function decodeFloat64Le(bytes) {
  const values = new Float64Array(bytes.length / 8);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = bytes.readDoubleLE(index * 8);
  }
  return values;
}

function decodeInt16Le(bytes) {
  const values = new Int16Array(bytes.length / 2);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = bytes.readInt16LE(index * 2);
  }
  return values;
}

function landCoverGroup(code) {
  if (code >= 100 && code < 200) return 1;
  if (code >= 200 && code < 300) return 2;
  if (code >= 300 && code < 400) return 3;
  if (code >= 400 && code < 500) return 4;
  if (code >= 500 && code < 600) return 5;
  return 0;
}

function dominantGroup(counts) {
  let selected = 0;
  for (let group = 1; group < counts.length; group += 1) {
    if (counts[group] > counts[selected]) {
      selected = group;
    }
  }
  return selected;
}

function finiteDomain(values) {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (Number.isFinite(value)) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new Error('Cannot derive a finite map domain');
  }
  return { minimum, maximum };
}

function quantize(values, domain, logarithmic) {
  const output = new Uint8Array(values.length).fill(255);
  const transformedMinimum = logarithmic
    ? Math.log1p(domain.minimum)
    : domain.minimum;
  const transformedMaximum = logarithmic
    ? Math.log1p(domain.maximum)
    : domain.maximum;
  const span = Math.max(transformedMaximum - transformedMinimum, 1e-12);
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) continue;
    const transformed = logarithmic ? Math.log1p(values[index]) : values[index];
    output[index] = Math.round(
      ((transformed - transformedMinimum) / span) * 254,
    );
  }
  return output;
}

function encodeBase64(values) {
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength).toString(
    'base64',
  );
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} disagrees with the frozen manifest`);
  }
}

function normalizeLineEndings(value) {
  return value.replaceAll('\r\n', '\n');
}
