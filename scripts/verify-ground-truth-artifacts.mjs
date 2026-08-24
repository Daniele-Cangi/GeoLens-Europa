import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertHistoricalBenchmarkManifest } = require(
  '../packages/evidence/dist',
);

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(
  repositoryRoot,
  'tests',
  'ground-truth',
  'emilia-romagna-2023',
  'manifest.json',
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assertHistoricalBenchmarkManifest(manifest);

const requestedRoot =
  process.env.GEOLENS_BENCHMARK_DATA_ROOT ?? process.argv[2];
if (!requestedRoot) {
  throw new Error(
    'Set GEOLENS_BENCHMARK_DATA_ROOT or pass the data root as the first argument',
  );
}

const dataRoot = path.resolve(requestedRoot);
let artifactCount = 0;
let totalBytes = 0;

const artifactGroups = [
  {
    id: 'benchmark',
    localArtifacts: manifest.benchmark.localArtifacts ?? [],
  },
  ...(manifest.benchmark.routingBaselines ?? []),
  ...(manifest.benchmark.evaluationRuns ?? []),
  ...manifest.datasets,
];

for (const group of artifactGroups) {
  for (const artifact of group.localArtifacts ?? []) {
    const artifactPath = path.resolve(dataRoot, artifact.relativePath);
    const relative = path.relative(dataRoot, artifactPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(
        'Artifact escapes benchmark data root: ' + artifact.relativePath,
      );
    }

    const stats = statSync(artifactPath);
    if (!stats.isFile()) {
      throw new Error('Artifact is not a file: ' + artifact.relativePath);
    }
    if (stats.size !== artifact.bytes) {
      throw new Error(
        'Artifact byte count mismatch for ' + artifact.relativePath,
      );
    }

    const actualHash = await sha256(artifactPath);
    if (actualHash !== artifact.sha256.toLowerCase()) {
      throw new Error(
        'Artifact SHA-256 mismatch for ' + artifact.relativePath,
      );
    }

    artifactCount += 1;
    totalBytes += stats.size;
  }
}

console.log(
  'Verified ' +
    artifactCount +
    ' historical benchmark artifacts (' +
    totalBytes +
    ' bytes)',
);

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
