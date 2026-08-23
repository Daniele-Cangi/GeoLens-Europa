import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  assertHistoricalBenchmarkManifest,
} = require('../packages/evidence/dist');
const {
  CORINE_LAND_COVER_CODES,
} = require('../packages/providers/dist');

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

const requestedRoot =
  process.env.GEOLENS_BENCHMARK_DATA_ROOT ?? process.argv[2];
if (!requestedRoot) {
  throw new Error(
    'Set GEOLENS_BENCHMARK_DATA_ROOT or pass the benchmark data root',
  );
}
const dataRoot = path.resolve(requestedRoot);
const receipt = JSON.parse(
  await readFile(
    path.join(dataRoot, 'inputs', 'bounded-inputs-receipt.json'),
    'utf8',
  ),
);

if (receipt.schemaVersion !== 'bounded-environmental-inputs-v0.1.0') {
  throw new Error('Unsupported bounded-input receipt schema');
}
if (receipt.benchmarkId !== manifest.benchmark.id) {
  throw new Error('Bounded-input receipt belongs to another benchmark');
}
assertDeepEqual(
  receipt.commonCoverage,
  manifest.benchmark.spatialProtocol.coverage,
  'receipt common coverage',
);
assertDeepEqual(
  receipt.grid,
  manifest.benchmark.spatialProtocol.grid,
  'receipt grid',
);
assertDeepEqual(
  receipt.masks.policy,
  manifest.benchmark.spatialProtocol.masks,
  'receipt mask policy',
);
if (receipt.xdbtr.status !== 'blocked') {
  throw new Error('XDBTR must remain blocked until vector geometry exists');
}
if (receipt.xdbtr.physicalGeometryEligible !== false) {
  throw new Error('Styled XDBTR maps cannot be physical geometry');
}
if (receipt.masks.permanentWater.status !== 'blocked') {
  throw new Error('Permanent-water mask cannot be available from styled WMS');
}

const cellCount = receipt.grid.width * receipt.grid.height;
const artifacts = [
  receipt.masks.aoi,
  ...receipt.dem.artifacts,
  ...receipt.landCover.artifacts,
  ...receipt.xdbtr.receipts,
];
for (const artifact of artifacts) {
  await verifyArtifact(dataRoot, artifact);
}

const mask = await readArtifact(dataRoot, receipt.masks.aoi);
if (mask.length !== cellCount) {
  throw new Error('AOI mask byte length does not match the grid');
}
let insideCells = 0;
for (const value of mask) {
  if (value !== 0 && value !== 1) {
    throw new Error(`AOI mask contains unsupported value ${value}`);
  }
  insideCells += value;
}
const outsideCells = cellCount - insideCells;
if (
  insideCells !== receipt.masks.aoi.insideCells ||
  outsideCells !== receipt.masks.aoi.outsideCells
) {
  throw new Error('AOI mask counts disagree with the receipt');
}

const elevationArtifact = artifactByName(
  receipt.dem.artifacts,
  'copernicus-dem-glo30-elevation-f32le.bin',
);
const slopeArtifact = artifactByName(
  receipt.dem.artifacts,
  'copernicus-dem-glo30-slope-f32le.bin',
);

const elevation = await verifyFloat32Evidence({
  dataRoot,
  artifact: elevationArtifact,
  mask,
  minimum: -1000,
  maximum: 9000,
  expectedAvailable: receipt.dem.statusCounts.elevationAvailable,
  label: 'DEM elevation',
});
const slope = await verifyFloat32Evidence({
  dataRoot,
  artifact: slopeArtifact,
  mask,
  minimum: 0,
  maximum: 90,
  expectedAvailable: receipt.dem.statusCounts.slopeAvailable,
  label: 'DEM slope',
});
const landCover = await verifyLandCover({
  dataRoot,
  artifact: receipt.landCover.artifacts[0],
  mask,
  expectedAvailable: receipt.landCover.statusCounts.available,
});

for (const styledMap of receipt.xdbtr.receipts) {
  const bytes = await readArtifact(dataRoot, styledMap);
  if (!isTiff(bytes)) {
    throw new Error(`${styledMap.layer} is not a TIFF receipt`);
  }
}

console.log(
  JSON.stringify(
    {
      cellCount,
      insideCells,
      outsideCells,
      elevation,
      slope,
      landCover,
      xdbtr: {
        status: receipt.xdbtr.status,
        physicalGeometryEligible:
          receipt.xdbtr.physicalGeometryEligible,
        styledMapReceipts: receipt.xdbtr.receipts.length,
      },
      verifiedArtifacts: artifacts.length,
      verifiedBytes: artifacts.reduce(
        (sum, artifact) => sum + artifact.bytes,
        0,
      ),
    },
    null,
    2,
  ),
);

async function verifyFloat32Evidence(input) {
  const bytes = await readArtifact(input.dataRoot, input.artifact);
  if (bytes.length !== cellCount * 4) {
    throw new Error(`${input.label} byte length does not match the grid`);
  }
  let available = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  let sum = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const value = bytes.readFloatLE(index * 4);
    if (input.mask[index] === 0) {
      if (!Number.isNaN(value)) {
        throw new Error(`${input.label} fabricates data outside the AOI`);
      }
      continue;
    }
    if (!Number.isFinite(value)) {
      continue;
    }
    if (value < input.minimum || value > input.maximum) {
      throw new Error(
        `${input.label} value ${value} is outside the supported range`,
      );
    }
    available += 1;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    sum += value;
  }
  if (available !== input.expectedAvailable) {
    throw new Error(`${input.label} count disagrees with the receipt`);
  }
  return {
    available,
    missingInsideAoi: insideCells - available,
    minimum,
    maximum,
    mean: sum / available,
  };
}

async function verifyLandCover(input) {
  const bytes = await readArtifact(input.dataRoot, input.artifact);
  if (bytes.length !== cellCount * 2) {
    throw new Error('CLC byte length does not match the grid');
  }
  const allowed = new Set(CORINE_LAND_COVER_CODES);
  const classes = new Map();
  let available = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const value = bytes.readInt16LE(index * 2);
    if (input.mask[index] === 0) {
      if (value !== -1) {
        throw new Error('CLC fabricates a class outside the AOI');
      }
      continue;
    }
    if (value === -1) {
      continue;
    }
    if (!allowed.has(value)) {
      throw new Error(`CLC contains unsupported class ${value}`);
    }
    available += 1;
    classes.set(value, (classes.get(value) ?? 0) + 1);
  }
  if (available !== input.expectedAvailable) {
    throw new Error('CLC count disagrees with the receipt');
  }
  return {
    available,
    missingInsideAoi: insideCells - available,
    classCounts: Object.fromEntries(
      [...classes.entries()].sort((left, right) => left[0] - right[0]),
    ),
  };
}

async function verifyArtifact(root, artifact) {
  const artifactPath = resolveArtifact(root, artifact.relativePath);
  const metadata = await stat(artifactPath);
  if (!metadata.isFile() || metadata.size !== artifact.bytes) {
    throw new Error(
      `Artifact byte count mismatch: ${artifact.relativePath}`,
    );
  }
  const digest = await sha256File(artifactPath);
  if (digest !== artifact.sha256.toLowerCase()) {
    throw new Error(`Artifact hash mismatch: ${artifact.relativePath}`);
  }
}

async function readArtifact(root, artifact) {
  return readFile(resolveArtifact(root, artifact.relativePath));
}

function artifactByName(artifacts, filename) {
  const suffix = '/inputs/' + filename;
  const matches = artifacts.filter(
    (artifact) =>
      artifact.relativePath === 'inputs/' + filename ||
      artifact.relativePath.endsWith(suffix),
  );
  if (matches.length !== 1) {
    throw new Error(
      'Expected exactly one artifact named ' +
        filename +
        '; found ' +
        matches.length,
    );
  }
  return matches[0];
}

function resolveArtifact(root, relativePath) {
  const segments =
    typeof relativePath === 'string' ? relativePath.split('/') : [];
  if (
    typeof relativePath !== 'string' ||
    relativePath.includes('\\') ||
    relativePath.startsWith('/') ||
    /^[a-z]:/i.test(relativePath) ||
    segments.some(
      (segment) =>
        segment.length === 0 || segment === '.' || segment === '..',
    )
  ) {
    throw new Error(`Artifact path is not portable: ${relativePath}`);
  }
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Artifact escapes benchmark root: ${relativePath}`);
  }
  return resolved;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} disagrees with the benchmark manifest`);
  }
}

function isTiff(bytes) {
  return (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x4d &&
        bytes[1] === 0x4d &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x2a))
  );
}
