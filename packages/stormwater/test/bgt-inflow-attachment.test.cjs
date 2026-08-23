const test = require('node:test');
const assert = require('node:assert/strict');
const { latLngToCell } = require('h3-js');

const {
  assessBgtInflowTableAttachments,
  createStormwaterTopology,
  missingBgtInflowTableAttachmentAssessment,
} = require('../dist');
const {
  availableEvidence,
  syntheticFixtureEvidence,
} = require('../../evidence/dist');

const acquiredAt = '2026-08-23T09:00:00.000Z';
const modifiedAt = '2026-08-22T12:00:00.000Z';

function source(origin, recordId, attributes = {}) {
  const synthetic = origin === 'synthetic_fixture';
  return {
    origin,
    provider: synthetic ? 'synthetic-fixture' : 'Amsterdam Waternet',
    dataset: synthetic
      ? 'fixture:bgt-inflow-attachment'
      : 'BGT Inlooptabel Amsterdam',
    datasetVersion: 'STOWA-2025-02',
    sourceRecordId: recordId,
    sourceAttributes: attributes,
    acquiredAt,
    sourceCrs: 'EPSG:28992',
    outputCrs: 'EPSG:4326',
    transformation: 'deterministic attachment test input',
    transformationVersion: 'fixture-v0.1.0',
  };
}

function numericEvidence(value, synthetic, id) {
  const spatial = {};
  const temporal = { acquiredAt };

  return synthetic
    ? syntheticFixtureEvidence(value, {
        fixtureId: id,
        unit: 'm',
        spatial,
        temporal,
      })
    : availableEvidence(value, {
        unit: 'm',
        spatial,
        temporal,
        provenance: {
          provider: 'Amsterdam Waternet',
          dataset: 'Leidingeninfrastructuur',
        },
      });
}

function topology(origin = 'observed_public_record') {
  const synthetic = origin === 'synthetic_fixture';
  const pointA = { lat: 52.338, lon: 4.898 };
  const pointB = { lat: 52.3382, lon: 4.8982 };

  return createStormwaterTopology({
    id: 'attachment-test-network',
    nodes: [
      {
        id: 'node-a',
        type: 'inlet',
        position: pointA,
        h3: latLngToCell(pointA.lat, pointA.lon, 11),
        elevationM: numericEvidence(1, synthetic, 'node-a-elevation'),
        source: source(origin, 'node-source-a'),
      },
      {
        id: 'node-b',
        type: 'outfall',
        position: pointB,
        h3: latLngToCell(pointB.lat, pointB.lon, 11),
        elevationM: numericEvidence(0, synthetic, 'node-b-elevation'),
        source: source(origin, 'node-source-b'),
      },
    ],
    pipes: [
      {
        id: 'waternet:pipe-1',
        nodeAId: 'node-a',
        nodeBId: 'node-b',
        lengthM: 30,
        path: [pointA, pointB],
        invertLevelAM: numericEvidence(
          -1,
          synthetic,
          'pipe-a-invert',
        ),
        invertLevelBM: numericEvidence(
          -1.2,
          synthetic,
          'pipe-b-invert',
        ),
        source: source(origin, 'pipe-source-1', {
          naam: 'HWA-001',
          uri: 'https://example.test/gwsw/pipe-1',
        }),
      },
    ],
    catchmentAttachments: [],
  });
}

function record(overrides = {}) {
  return {
    id: 'inflow-row-1',
    bgtIdentification: 'NL.IMGeo.Pand.001',
    lastModified: modifiedAt,
    manuallyModified: true,
    publisherRole: 'network_owner_or_authorized_delegate',
    percentages: {
      combinedSewer: 0,
      stormwaterSewer: 70,
      improvedStormwaterSewer: 0,
      wastewaterSewer: 0,
      infiltrationFacility: 0,
      openWater: 30,
      surface: 0,
    },
    networkAssetCodes: {
      stormwaterSewer: 'pipe-source-1',
    },
    source: source('observed_public_record', 'inflow-row-1'),
    ...overrides,
  };
}

test('owner-published BGT allocation attaches only by exact observed pipe identifier', () => {
  const assessment = assessBgtInflowTableAttachments(
    [record()],
    topology(),
    { acquiredAt },
  );

  assert.equal(
    assessment.destinationObservations.quality.status,
    'available',
  );
  assert.equal(assessment.destinationObservations.value.length, 2);
  assert.equal(
    assessment.networkAttachments.quality.status,
    'available',
  );
  assert.equal(assessment.networkAttachments.value.length, 1);
  assert.deepEqual(assessment.networkAttachments.value[0], {
    recordId: 'inflow-row-1',
    bgtIdentification: 'NL.IMGeo.Pand.001',
    destination: 'stormwater_sewer',
    percentage: 70,
    firstPublicSystemDestination: true,
    target: {
      entityType: 'pipe',
      pipeId: 'waternet:pipe-1',
      sourceRecordId: 'pipe-source-1',
      matchedCode: 'pipe-source-1',
      matchMethod: 'exact_source_record_id',
    },
  });
  assert.equal(assessment.propagationEligible, true);
  assert.deepEqual(assessment.unresolvedNetworkDestinations, []);
});

test('destination percentage without a pipe code remains observed but unattached', () => {
  const assessment = assessBgtInflowTableAttachments(
    [record({ networkAssetCodes: undefined })],
    topology(),
    { acquiredAt },
  );

  assert.equal(
    assessment.destinationObservations.quality.status,
    'available',
  );
  assert.equal(
    assessment.networkAttachments.quality.status,
    'missing',
  );
  assert.equal(assessment.networkAttachments.value, null);
  assert.equal(assessment.propagationEligible, false);
  assert.deepEqual(assessment.unresolvedNetworkDestinations, [
    {
      recordId: 'inflow-row-1',
      bgtIdentification: 'NL.IMGeo.Pand.001',
      destination: 'stormwater_sewer',
      percentage: 70,
      networkAssetCode: null,
      reason: 'asset_code_not_published',
    },
  ]);
});

test('one exact allocation cannot hide another unresolved sewer destination', () => {
  const splitPercentages = {
    combinedSewer: 0,
    stormwaterSewer: 50,
    improvedStormwaterSewer: 0,
    wastewaterSewer: 0,
    infiltrationFacility: 0,
    openWater: 0,
    surface: 0,
  };
  const assessment = assessBgtInflowTableAttachments(
    [
      record({ percentages: splitPercentages }),
      record({
        id: 'inflow-row-2',
        percentages: splitPercentages,
        networkAssetCodes: undefined,
        source: source(
          'observed_public_record',
          'inflow-row-2',
        ),
      }),
    ],
    topology(),
    { acquiredAt },
  );

  assert.equal(
    assessment.networkAttachments.quality.status,
    'available',
  );
  assert.equal(assessment.networkAttachments.value.length, 1);
  assert.equal(assessment.unresolvedNetworkDestinations.length, 1);
  assert.equal(assessment.propagationEligible, false);
});
test('allocation totals outside the standard rounding interval are invalid', () => {
  const assessment = assessBgtInflowTableAttachments(
    [
      record({
        percentages: {
          combinedSewer: 0,
          stormwaterSewer: 60,
          improvedStormwaterSewer: 0,
          wastewaterSewer: 0,
          infiltrationFacility: 0,
          openWater: 38,
          surface: 0,
        },
      }),
    ],
    topology(),
    { acquiredAt },
  );

  assert.equal(
    assessment.destinationObservations.quality.status,
    'invalid_response',
  );
  assert.match(
    assessment.destinationObservations.quality.missingReason,
    /total 98%; expected 99% to 101%/,
  );
  assert.equal(
    assessment.networkAttachments.quality.status,
    'invalid_response',
  );
  assert.equal(assessment.propagationEligible, false);
});

test('synthetic BGT and topology matches stay synthetic and propagation-ineligible', () => {
  const assessment = assessBgtInflowTableAttachments(
    [
      record({
        source: source('synthetic_fixture', 'inflow-row-1'),
      }),
    ],
    topology('synthetic_fixture'),
    { acquiredAt },
  );

  assert.equal(
    assessment.destinationObservations.quality.status,
    'synthetic_fixture',
  );
  assert.equal(
    assessment.networkAttachments.quality.status,
    'synthetic_fixture',
  );
  assert.equal(assessment.networkAttachments.value.length, 1);
  assert.equal(assessment.propagationEligible, false);
});

test('empty acquisition preserves the authoritative attachment as missing', () => {
  const assessment = missingBgtInflowTableAttachmentAssessment({
    acquiredAt,
    missingReason: 'Amsterdam owner dataset is unavailable',
  });

  assert.equal(
    assessment.destinationObservations.quality.status,
    'missing',
  );
  assert.equal(
    assessment.networkAttachments.quality.status,
    'missing',
  );
  assert.equal(assessment.networkAttachments.value, null);
  assert.equal(assessment.propagationEligible, false);
  assert.match(
    assessment.networkAttachments.quality.missingReason,
    /owner dataset is unavailable/,
  );
});
