const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  aggregateCatchmentRunoff,
  composeNodeSourceTerms,
  createStormwaterTopology,
  importStormwaterGeoJson,
  orientStormwaterNetwork,
  propagateStormwaterContributions,
  validateStormwaterTopology,
} = require('../dist');
const {
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../../evidence/dist');

const fixturePath = path.resolve(
  __dirname,
  '../../../stormwater_network_example.geojson',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const importedAt = '2026-08-21T01:00:00.000Z';
const derivedAt = '2026-08-21T01:05:00.000Z';
const observationWindow = {
  windowStart: '2026-08-20T00:00:00.000Z',
  windowEnd: '2026-08-21T00:00:00.000Z',
  acquiredAt: importedAt,
};

function importFixture(elevations) {
  return importStormwaterGeoJson(fixture, {
    networkId: 'trento-proof-zero',
    importedAt,
    nodeH3Resolution: 11,
    catchmentH3Resolution: 13,
    snapToleranceM: 5,
    elevationByNodeId: elevations,
  });
}

function elevationEvidence(node, value) {
  return syntheticFixtureEvidence(value, {
    fixtureId: `elevation:${node.id}`,
    unit: 'm',
    spatial: {
      h3: node.h3,
      lat: node.position.lat,
      lon: node.position.lon,
      sourceResolution: 'deterministic fixture',
    },
    temporal: {
      acquiredAt: importedAt,
    },
  });
}

function importWithElevations(values) {
  const withoutElevation = importFixture();
  const elevations = Object.fromEntries(
    Object.values(withoutElevation.topology.nodes).map((node) => [
      node.id,
      elevationEvidence(node, values[node.id]),
    ]),
  );

  return importFixture(elevations);
}

function environmentalFixture(value, {
  fixtureId,
  h3,
  unit,
  sourceResolution,
}) {
  return syntheticFixtureEvidence(value, {
    fixtureId,
    unit,
    spatial: {
      h3,
      sourceResolution,
    },
    temporal: observationWindow,
  });
}

function buildCatchmentContribution(imported, rainfallMm = 10) {
  const coverage = imported.catchments[0];

  return aggregateCatchmentRunoff(
    {
      id: coverage.id,
      outletNodeId: coverage.outletNodeId,
      cells: coverage.cells.map((cell) => ({
        ...cell,
        rainfallMm: environmentalFixture(rainfallMm, {
          fixtureId: `rain:${cell.h3}`,
          h3: cell.h3,
          unit: 'mm',
          sourceResolution: '0.1 degree',
        }),
        slopeDeg: environmentalFixture(0, {
          fixtureId: `slope:${cell.h3}`,
          h3: cell.h3,
          unit: 'degree',
          sourceResolution: '30 m DEM',
        }),
        landCoverClass: environmentalFixture(111, {
          fixtureId: `clc:${cell.h3}`,
          h3: cell.h3,
          sourceResolution: '100 m',
        }),
      })),
    },
    { derivedAt },
  );
}

test('GeoJSON fixture imports typed topology and H3 catchment coverage', () => {
  const imported = importFixture();

  assert.deepEqual(
    Object.keys(imported.topology.nodes).sort(),
    ['node_A_inlet', 'node_B_manhole', 'node_C_outfall'],
  );
  assert.deepEqual(
    Object.keys(imported.topology.pipes).sort(),
    ['pipe_1_A_to_B', 'pipe_2_B_to_C'],
  );
  assert.equal(imported.catchments.length, 1);
  assert.equal(imported.catchments[0].outletNodeId, 'node_A_inlet');
  assert.equal(imported.catchments[0].coverageMethod, 'h3_cell_center');
  assert.ok(imported.catchments[0].cells.length > 0);
  assert.ok(
    Object.values(imported.topology.nodes).every(
      (node) =>
        node.elevationM.value === null &&
        node.elevationM.quality.status === 'missing',
    ),
  );
  assert.ok(
    Object.values(imported.topology.pipes).every(
      (pipe) => pipe.lengthM > 0,
    ),
  );
});

test('catchments require an explicit typed outlet', () => {
  const noOutlet = JSON.parse(JSON.stringify(fixture));
  const catchment = noOutlet.features.find(
    (feature) => feature.properties.type === 'catchment',
  );
  delete catchment.properties.outlet_node_id;

  assert.throws(
    () => importStormwaterGeoJson(noOutlet, {
      networkId: 'no-outlet',
      importedAt,
      nodeH3Resolution: 11,
      catchmentH3Resolution: 13,
      snapToleranceM: 5,
    }),
    /requires explicit outlet_node_id/,
  );
});

test('topology validation reports broken references independently', () => {
  const imported = importFixture();
  const validation = validateStormwaterTopology({
    id: imported.topology.id,
    nodes: Object.values(imported.topology.nodes),
    pipes: [
      ...Object.values(imported.topology.pipes),
      {
        id: 'broken-pipe',
        nodeAId: 'node_A_inlet',
        nodeBId: 'missing-node',
        lengthM: 10,
      },
    ],
    catchmentAttachments: Object.values(
      imported.topology.catchmentAttachments,
    ),
  });

  assert.equal(validation.valid, false);
  assert.ok(
    validation.issues.some(
      (issue) => issue.code === 'missing_pipe_endpoint',
    ),
  );
});

test('missing and vertically unresolved elevations preserve direction uncertainty', () => {
  const missing = orientStormwaterNetwork(importFixture().topology, {
    minimumResolvableDropM: 0.1,
  });

  assert.ok(
    Object.values(missing.directions).every(
      (direction) =>
        direction.status === 'unknown' &&
        direction.reason === 'missing_elevation',
    ),
  );

  const nearlyFlat = importWithElevations({
    node_A_inlet: 103,
    node_B_manhole: 102.95,
    node_C_outfall: 101,
  });
  const ambiguous = orientStormwaterNetwork(nearlyFlat.topology, {
    minimumResolvableDropM: 0.1,
  });

  assert.equal(
    ambiguous.directions.pipe_1_A_to_B.status,
    'ambiguous',
  );
  assert.equal(
    ambiguous.directions.pipe_2_B_to_C.status,
    'known',
  );
});

test('node source composition rejects a contribution aimed at another outlet', () => {
  const imported = importFixture();
  const contribution = buildCatchmentContribution(imported, 10);

  assert.throws(
    () => composeNodeSourceTerms(
      imported.topology,
      [
        {
          ...contribution,
          outletNodeId: 'node_C_outfall',
        },
      ],
      { derivedAt },
    ),
    /targets node_C_outfall, expected node_A_inlet/,
  );
});

test('node source totals remain unavailable across mismatched windows', () => {
  const imported = importFixture();
  const first = buildCatchmentContribution(imported, 10);
  const topology = createStormwaterTopology({
    id: imported.topology.id,
    nodes: Object.values(imported.topology.nodes),
    pipes: Object.values(imported.topology.pipes),
    catchmentAttachments: [
      ...Object.values(imported.topology.catchmentAttachments),
      {
        catchmentId: 'catchment_B',
        outletNodeId: 'node_A_inlet',
      },
    ],
  });
  const shiftedTotal = syntheticFixtureEvidence(
    first.totalVolumeM3.value,
    {
      fixtureId: 'catchment-contribution:catchment_B',
      unit: 'm3',
      spatial: {},
      temporal: {
        windowStart: '2026-08-19T00:00:00.000Z',
        windowEnd: '2026-08-20T00:00:00.000Z',
        acquiredAt: importedAt,
      },
    },
  );
  const second = {
    ...first,
    catchmentId: 'catchment_B',
    totalVolumeM3: shiftedTotal,
  };
  const sourceTerms = composeNodeSourceTerms(
    topology,
    [first, second],
    { derivedAt },
  );

  assert.equal(sourceTerms.terms.node_A_inlet.value, null);
  assert.equal(
    sourceTerms.terms.node_A_inlet.quality.status,
    'invalid_response',
  );
  assert.match(
    sourceTerms.terms.node_A_inlet.quality.missingReason,
    /do not share one observation\/window/,
  );
});

test('deterministic fixture flows from H3 runoff to the outfall without loss', () => {
  const imported = importWithElevations({
    node_A_inlet: 103,
    node_B_manhole: 102,
    node_C_outfall: 101,
  });
  const contribution = buildCatchmentContribution(imported, 10);
  const sourceTerms = composeNodeSourceTerms(
    imported.topology,
    [contribution],
    { derivedAt },
  );
  const oriented = orientStormwaterNetwork(imported.topology, {
    minimumResolvableDropM: 0.1,
  });
  const result = propagateStormwaterContributions(
    oriented,
    sourceTerms.terms,
    { derivedAt },
  );

  assert.equal(contribution.status, 'complete');
  assert.ok(contribution.totalVolumeM3.value > 0);
  assert.equal(sourceTerms.terms.node_B_manhole.value, 0);
  assert.equal(sourceTerms.terms.node_C_outfall.value, 0);
  assert.equal(result.status, 'complete');

  const expected = contribution.totalVolumeM3.value;
  assert.ok(
    Math.abs(
      result.nodes.node_C_outfall.downstreamAccumulationM3.value -
        expected,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      result.pipes.pipe_1_A_to_B.transferredVolumeM3.value -
        expected,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      result.pipes.pipe_2_B_to_C.transferredVolumeM3.value -
        expected,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(result.massBalance.differenceM3) < 1e-9,
  );
  assert.ok(
    Math.abs(result.massBalance.outfallVolumeM3 - expected) < 1e-9,
  );
  assert.equal(result.massBalance.nonOutfallTerminalVolumeM3, 0);
});

test('propagation refuses unresolved directions before producing values', () => {
  const imported = importFixture();
  const contribution = buildCatchmentContribution(imported, 10);
  const sourceTerms = composeNodeSourceTerms(
    imported.topology,
    [contribution],
    { derivedAt },
  );
  const oriented = orientStormwaterNetwork(imported.topology, {
    minimumResolvableDropM: 0.1,
  });
  const result = propagateStormwaterContributions(
    oriented,
    sourceTerms.terms,
    { derivedAt },
  );

  assert.equal(result.status, 'incomplete_direction');
  assert.deepEqual(
    [...result.pipeIds].sort(),
    ['pipe_1_A_to_B', 'pipe_2_B_to_C'],
  );
  assert.equal('nodes' in result, false);
});

test('propagation refuses unavailable node source evidence', () => {
  const imported = importWithElevations({
    node_A_inlet: 103,
    node_B_manhole: 102,
    node_C_outfall: 101,
  });
  const contribution = buildCatchmentContribution(imported, 10);
  const sourceTerms = composeNodeSourceTerms(
    imported.topology,
    [contribution],
    { derivedAt },
  );
  const brokenSources = {
    ...sourceTerms.terms,
    node_B_manhole: unavailableEvidence(
      'missing',
      'Deliberately unavailable source term',
      {
        unit: 'm3',
        spatial: {
          h3: imported.topology.nodes.node_B_manhole.h3,
        },
        temporal: observationWindow,
        provenance: {
          provider: 'test-missing-provider',
          dataset: 'node-source',
        },
      },
    ),
  };
  const oriented = orientStormwaterNetwork(imported.topology, {
    minimumResolvableDropM: 0.1,
  });
  const result = propagateStormwaterContributions(
    oriented,
    brokenSources,
    { derivedAt },
  );

  assert.equal(result.status, 'incomplete_evidence');
  assert.deepEqual(result.nodeIds, ['node_B_manhole']);
  assert.equal('nodes' in result, false);
});
