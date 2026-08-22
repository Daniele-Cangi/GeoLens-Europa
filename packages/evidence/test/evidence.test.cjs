const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertEvidenceInvariant,
  availableEvidence,
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../dist');

const descriptor = {
  unit: 'mm',
  spatial: {
    h3: '891f1d48907ffff',
    lat: 55.6761,
    lon: 12.5683,
    sourceResolution: '0.1 degree',
  },
  temporal: {
    windowStart: '2026-08-20T00:00:00.000Z',
    windowEnd: '2026-08-21T00:00:00.000Z',
    acquiredAt: '2026-08-21T01:00:00.000Z',
  },
  provenance: {
    provider: 'nasa-precip',
    dataset: 'GPM_3IMERGHH',
    datasetVersion: '07',
    samplingMethod: 'area-weighted aggregation',
  },
};

test('observed zero remains available evidence', () => {
  const evidence = availableEvidence(0, descriptor);

  assert.equal(evidence.value, 0);
  assert.equal(evidence.quality.status, 'available');
  assert.equal(evidence.quality.missingReason, undefined);
});

test('missing and incomplete observations carry no value', () => {
  const missing = unavailableEvidence(
    'missing',
    'No IMERG granules overlap the requested window',
    descriptor,
  );
  const incomplete = unavailableEvidence(
    'incomplete_window',
    'Only 18 of the requested 24 hours are covered',
    descriptor,
  );

  assert.equal(missing.value, null);
  assert.equal(missing.quality.status, 'missing');
  assert.equal(incomplete.value, null);
  assert.equal(incomplete.quality.status, 'incomplete_window');
});

test('available evidence cannot carry a null value', () => {
  assert.throws(
    () => availableEvidence(null, descriptor),
    /must carry a value/,
  );
});

test('unavailable constructors reject available and fixture statuses', () => {
  assert.throws(
    () => unavailableEvidence('available', 'invalid', descriptor),
    /cannot describe unavailable evidence/,
  );
  assert.throws(
    () => unavailableEvidence('synthetic_fixture', 'invalid', descriptor),
    /cannot describe unavailable evidence/,
  );
});

test('synthetic fixtures have unmistakable provenance', () => {
  const fixture = syntheticFixtureEvidence(12.5, {
    fixtureId: 'rain-event-a',
    unit: 'mm',
    spatial: descriptor.spatial,
    temporal: descriptor.temporal,
    transformation: 'deterministic test input',
    transformationVersion: '1',
  });

  assert.equal(fixture.quality.status, 'synthetic_fixture');
  assert.equal(fixture.provenance.provider, 'synthetic-fixture');
  assert.equal(fixture.provenance.dataset, 'fixture:rain-event-a');
  assert.equal(fixture.provenance.sourceMetadata.fixtureId, 'rain-event-a');
});

test('evidence windows require complete, ordered timestamps', () => {
  assert.throws(
    () => availableEvidence(1, {
      ...descriptor,
      temporal: {
        windowStart: '2026-08-21T00:00:00.000Z',
        acquiredAt: '2026-08-21T01:00:00.000Z',
      },
    }),
    /both windowStart and windowEnd/,
  );

  assert.throws(
    () => availableEvidence(1, {
      ...descriptor,
      temporal: {
        windowStart: '2026-08-22T00:00:00.000Z',
        windowEnd: '2026-08-21T00:00:00.000Z',
        acquiredAt: '2026-08-21T01:00:00.000Z',
      },
    }),
    /windowStart must not be after windowEnd/,
  );
});

test('external evidence cannot attach fabricated values to failures', () => {
  assert.throws(
    () => assertEvidenceInvariant({
      ...availableEvidence(3, descriptor),
      quality: {
        status: 'upstream_error',
        missingReason: 'provider timeout',
      },
    }),
    /must not carry a value/,
  );
});

test('quality values outside the documented range are rejected', () => {
  assert.throws(
    () => availableEvidence(1, descriptor, { sourceQuality: 1.1 }),
    /between 0 and 1/,
  );
});
