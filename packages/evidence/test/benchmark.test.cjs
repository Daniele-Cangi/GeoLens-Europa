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

test('artifact path aliases cannot represent multiple files', () => {
  const aliases = [
    (path) => path.replace('/', '\\'),
    (path) => './' + path,
    (path) => path.replace('/', '//'),
  ];

  for (const alias of aliases) {
    const manifest = manifestFixture();
    const dataset = manifest.datasets.find(
      (candidate) => candidate.localArtifacts?.length > 0,
    );
    const artifact = dataset.localArtifacts[0];
    dataset.localArtifacts.push({
      ...artifact,
      relativePath: alias(artifact.relativePath),
    });

    assert.throws(
      () => assertHistoricalBenchmarkManifest(manifest),
      /canonical portable relative path/,
    );
  }
});

test('model inputs must have been available by the knowledge cutoff', () => {
  const manifest = manifestFixture();
  const annualRainfall = manifest.datasets.find(
    (dataset) => dataset.id === 'arpae-2023-pluviometry',
  );

  assert.equal(annualRainfall.availableAt, '2024-12-23T00:00:00Z');
  annualRainfall.role = 'model_input';
  annualRainfall.allowedUses.modelInput = true;
  annualRainfall.allowedUses.evaluation = false;

  assert.throws(
    () => assertHistoricalBenchmarkManifest(manifest),
    /not available by benchmark knowledgeCutoff/,
  );
});

test('the post-event IMERG version is excluded from the replay input', () => {
  const manifest = manifestFixture();
  const v07 = manifest.datasets.find(
    (dataset) => dataset.id === 'nasa-imerg-v07',
  );
  const v06 = manifest.datasets.find(
    (dataset) => dataset.id === 'nasa-imerg-v06c-nrt',
  );

  assert.equal(v07.role, 'context_only');
  assert.equal(v07.allowedUses.modelInput, false);
  assert.ok(
    Date.parse(v07.availableAt) >
      Date.parse(manifest.benchmark.event.knowledgeCutoff),
  );
  assert.equal(v06.role, 'model_input');
  assert.ok(
    Date.parse(v06.availableAt) <=
      Date.parse(manifest.benchmark.event.knowledgeCutoff),
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