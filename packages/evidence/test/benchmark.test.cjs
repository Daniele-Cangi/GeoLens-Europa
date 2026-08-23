const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { assertHistoricalBenchmarkManifest } = require('../dist');

const manifestPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tests',
  'ground-truth',
  'emilia-romagna-2023',
  'manifest.json',
);

function manifestFixture() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

test('Emilia-Romagna manifest passes the historical benchmark contract', () => {
  const manifest = manifestFixture();

  assert.doesNotThrow(() => assertHistoricalBenchmarkManifest(manifest));
  assert.equal(manifest.benchmark.state, 'data_audit');
  assert.equal(manifest.benchmark.claimLevel, 'hydrologic_routing');
  assert.ok(manifest.benchmark.forbiddenClaims.includes('validated_water_depth'));
});

test('post-event evidence is structurally excluded from model and calibration', () => {
  const manifest = manifestFixture();
  const reference = manifest.datasets.find(
    (dataset) => dataset.id === 'rer-flood-extent-v7-event-2',
  );

  assert.equal(reference.role, 'evaluation_reference');
  assert.equal(reference.temporalRelation, 'post_event');
  assert.deepEqual(reference.allowedUses, {
    modelInput: false,
    calibration: false,
    evaluation: true,
  });

  reference.allowedUses.modelInput = true;
  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /cannot be used for model input or calibration/,
  );
});

test('Copernicus P06 is comparison evidence rather than independent ground truth', () => {
  const manifest = manifestFixture();
  const copernicus = manifest.datasets.find(
    (dataset) => dataset.id === 'copernicus-emsn154-p04-p06',
  );

  assert.equal(copernicus.role, 'comparison_reference');
  assert.equal(copernicus.allowedUses.modelInput, false);
  assert.match(copernicus.methodologyNote, /not independent ground truth/);
});

test('local artifact paths must remain portable and content-addressed', () => {
  const manifest = manifestFixture();
  const dataset = manifest.datasets.find(
    (candidate) => candidate.localArtifacts?.length > 0,
  );

  dataset.localArtifacts[0].relativePath = 'D:/private/source.zip';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /portable relative path/,
  );

  const invalidDigest = manifestFixture();
  invalidDigest.datasets
    .find((candidate) => candidate.localArtifacts?.length > 0)
    .localArtifacts[0].sha256 = 'not-a-digest';
  assert.throws(
    () => assertHistoricalBenchmarkManifest(invalidDigest),
    /SHA-256 digest/,
  );
});

test('knowledge cutoff cannot move beyond the replay event', () => {
  const manifest = manifestFixture();
  manifest.benchmark.event.knowledgeCutoff = '2023-05-19T00:00:00Z';

  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /knowledgeCutoff must not follow windowEnd/,
  );
});