const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  importAmsterdamWaternetStormwater,
  infrastructureAssetSource,
  orientStormwaterNetworkByPipeInverts,
  validateStormwaterTopology,
} = require('../dist');

const fixturePath = path.resolve(
  __dirname,
  'fixtures/amsterdam-waternet-bounded.json',
);
const snapshot = JSON.parse(
  fs.readFileSync(fixturePath, 'utf8'),
);
const importOptions = {
  networkId: 'amsterdam-waternet-proof-one',
  acquiredAt: snapshot.metadata.acquiredAt,
  nodeH3Resolution: 11,
  snapToleranceM: 0.25,
  bboxWfsAxisOrder:
    snapshot.metadata.bboxWfsAxisOrder,
  retrievalMode: 'recorded_response',
};

function importSnapshot(value = snapshot) {
  return importAmsterdamWaternetStormwater(
    value,
    importOptions,
  );
}

test('recorded Waternet response imports a valid bounded stormwater topology', () => {
  const imported = importSnapshot();
  const nodes = Object.values(imported.topology.nodes);
  const pipes = Object.values(imported.topology.pipes);
  const validation = validateStormwaterTopology({
    id: imported.topology.id,
    nodes,
    pipes,
    catchmentAttachments: [],
  });

  assert.equal(validation.valid, true);
  assert.deepEqual(imported.receipt.counts, {
    nodeFeatures: 82,
    pipeFeatures: 112,
    activeNodeFeatures: 82,
    matchingStormwaterPipes: 57,
    importedNodes: 47,
    importedPipes: 47,
    skippedBoundaryPipes: 10,
    skippedAmbiguousPipes: 0,
    skippedSelfLoops: 0,
  });
  assert.equal(nodes.length, 47);
  assert.equal(pipes.length, 47);
  assert.ok(
    pipes.every(
      (pipe) =>
        pipe.path.length >= 2 &&
        pipe.lengthM > 0 &&
        pipe.nodeAId !== pipe.nodeBId,
    ),
  );
});

test('bounded topology contains explicit observed rainwater outfalls', () => {
  const imported = importSnapshot();
  const outfalls = Object.values(
    imported.topology.nodes,
  ).filter((node) => node.type === 'outfall');

  assert.equal(outfalls.length, 4);
  assert.deepEqual(
    outfalls.map(
      (node) => node.source.sourceRecordId,
    ),
    [
      '04D766F2-543E-4452-B005-7C941A9223AD',
      '41D38A81-65BC-4608-AB50-C82E8BF666DF',
      '8522CE11-8DC1-41CC-9375-EDECAB742620',
      '8DE766F4-0916-4A44-93C8-72BBF84498AA',
    ],
  );
  assert.ok(
    outfalls.every(
      (node) =>
        node.source.sourceAttributes.sourceKind ===
          'Uitlaat' &&
        node.source.sourceAttributes.sourceNodeType ===
          'Regenwateruitlaat' &&
        node.source.sourceAttributes.pumpingAreaId ===
          '826',
    ),
  );
  assert.deepEqual(
    Object.values(
      imported.topology.catchmentAttachments,
    ),
    [],
  );
});

test('invert evidence directs an observed pipe into a rainwater outfall', () => {
  const imported = importSnapshot();
  const oriented = orientStormwaterNetworkByPipeInverts(
    imported.topology,
    { minimumResolvableDropM: 0.01 },
  );
  const direction =
    oriented.directions[
      'waternet:2558D6C2-71D9-42B0-A193-DF5D6BE7FE2D'
    ];

  assert.equal(direction.status, 'known');
  assert.equal(
    direction.toNodeId,
    'waternet:04D766F2-543E-4452-B005-7C941A9223AD',
  );
  assert.equal(
    imported.topology.nodes[direction.toNodeId].type,
    'outfall',
  );
});
test('Waternet assets retain public-record provenance and physical pipe attributes', () => {
  const imported = importSnapshot();
  const pipe =
    imported.topology.pipes[
      'waternet:07C9DD89-1AED-4890-B48E-E49EF1F6FA86'
    ];

  assert.equal(
    imported.receipt.source.origin,
    'observed_public_record',
  );
  assert.equal(
    imported.receipt.source.license,
    'Creative Commons Attribution',
  );
  assert.equal(
    imported.receipt.source.sourceCrs,
    'EPSG:7415',
  );
  assert.equal(
    imported.receipt.source.outputCrs,
    'EPSG:4326',
  );
  assert.deepEqual(
    imported.receipt.deliveryDates,
    ['2026-08-10'],
  );
  assert.equal(pipe.diameterMm, 300);
  assert.equal(pipe.invertLevelAM.value, -0.99000001);
  assert.equal(pipe.invertLevelAM.unit, 'm');
  assert.equal(
    pipe.invertLevelAM.provenance.sourceMetadata.verticalDatum,
    'NAP',
  );
  assert.equal(
    pipe.source.sourceRecordId,
    '07C9DD89-1AED-4890-B48E-E49EF1F6FA86',
  );
  assert.equal(
    pipe.source.sourceAttributes.sourceEndpointAttributesUsed,
    false,
  );
  assert.ok(
    pipe.source.sourceAttributes.snappedStartDistanceM <
      0.001,
  );
});

test('Waternet pipes orient only from endpoint invert evidence', () => {
  const imported = importSnapshot();
  const oriented = orientStormwaterNetworkByPipeInverts(
    imported.topology,
    { minimumResolvableDropM: 0.01 },
  );
  const flat =
    oriented.directions[
      'waternet:0DBB9C57-691F-4FD3-8E38-0302584C1A99'
    ];
  const descending =
    oriented.directions[
      'waternet:07C9DD89-1AED-4890-B48E-E49EF1F6FA86'
    ];
  const reverse =
    oriented.directions[
      'waternet:0D7812F0-6912-483D-80E8-2ACB3EB190A1'
    ];

  assert.equal(oriented.evidenceBasis, 'pipe_invert_level');
  assert.equal(
    oriented.orientationVersion,
    'pipe-invert-direction-v0.1.0',
  );
  assert.equal(flat.status, 'ambiguous');
  assert.ok(Math.abs(flat.verticalDifferenceM) <= 0.01);
  assert.equal(descending.status, 'known');
  assert.equal(
    descending.fromNodeId,
    imported.topology.pipes[
      'waternet:07C9DD89-1AED-4890-B48E-E49EF1F6FA86'
    ].nodeAId,
  );
  assert.ok(descending.verticalDropM > 0.08);
  assert.equal(reverse.status, 'known');
  assert.equal(
    reverse.fromNodeId,
    imported.topology.pipes[
      'waternet:0D7812F0-6912-483D-80E8-2ACB3EB190A1'
    ].nodeBId,
  );
});

test('missing Waternet invert evidence keeps pipe direction unknown', () => {
  const modified = structuredClone(snapshot);
  const feature = modified.pipes.features.find(
    (candidate) =>
      candidate.properties.globalid ===
      '07C9DD89-1AED-4890-B48E-E49EF1F6FA86',
  );

  assert.ok(feature);
  feature.properties.bob_beginpunt = null;

  const imported = importSnapshot(modified);
  const oriented = orientStormwaterNetworkByPipeInverts(
    imported.topology,
    { minimumResolvableDropM: 0.01 },
  );
  const direction =
    oriented.directions[
      'waternet:07C9DD89-1AED-4890-B48E-E49EF1F6FA86'
    ];

  assert.equal(direction.status, 'unknown');
  assert.equal(direction.evidenceBasis, 'pipe_invert_level');
  assert.equal(direction.reason, 'missing_vertical_evidence');
  assert.equal(direction.endpointAStatus, 'missing');
});
test('invalid endpoint UUIDs and bounded-response gaps stay explicit', () => {
  const imported = importSnapshot();

  assert.equal(
    imported.receipt.endpointLinkPolicy
      .sourceEndpointAttributes,
    'ignored_invalid_self_referential',
  );
  assert.equal(
    imported.receipt.endpointLinkPolicy.method,
    'geometry_endpoint_nearest_node',
  );
  assert.equal(
    imported.receipt.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code ===
        'pipe_endpoint_outside_snapshot',
    ).length,
    10,
  );
  assert.deepEqual(
    Object.values(
      imported.topology.catchmentAttachments,
    ),
    [],
  );
  assert.deepEqual(
    imported.receipt.pumpingAreaReferences,
    {
      sourceField: 'bemalingsgebied',
      identifiers: ['826'],
      geometryStatus: 'not_provided_by_source',
      attachmentEligible: false,
    },
  );
  assert.deepEqual(imported.receipt.catchmentState, {
    status: 'not_provided_by_source',
    attachmentsCreated: 0,
  });
});

test('missing Waternet ground level remains missing instead of becoming zero', () => {
  const modified = structuredClone(snapshot);
  const baseline = importSnapshot();
  const node = Object.values(
    baseline.topology.nodes,
  )[0];
  const sourceFeature = modified.nodes.features.find(
    (feature) =>
      feature.properties.globalid ===
      node.source.sourceRecordId,
  );

  assert.ok(sourceFeature);
  sourceFeature.properties.maaiveldniveau = null;

  const imported = importSnapshot(modified);
  const changedNode = imported.topology.nodes[node.id];

  assert.equal(changedNode.elevationM.value, null);
  assert.equal(
    changedNode.elevationM.quality.status,
    'missing',
  );
  assert.match(
    changedNode.elevationM.quality.missingReason,
    /has no maaiveldniveau/,
  );
});

test('synthetic provenance cannot masquerade as observed infrastructure', () => {
  assert.throws(
    () =>
      infrastructureAssetSource(
        {
          origin: 'observed_public_record',
          provider: 'synthetic-fixture',
          dataset: 'fixture:fake-observation',
          acquiredAt:
            '2026-08-22T00:00:00.000Z',
          sourceCrs: 'EPSG:4326',
          outputCrs: 'EPSG:4326',
          transformation: 'none',
          transformationVersion: 'test-v1',
        },
        'fake-record',
      ),
    /cannot be represented as non-synthetic/,
  );
});
