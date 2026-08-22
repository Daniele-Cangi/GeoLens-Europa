const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CanonicalEnvironmentalEvidenceComposer,
  runStormwaterProofZero,
} = require('../dist');
const {
  importStormwaterGeoJson,
} = require('../../stormwater/dist');
const {
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../../evidence/dist');

const fixturePath = path.resolve(
  __dirname,
  '../../../stormwater_network_example.geojson',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const referenceTime = new Date('2026-08-21T00:00:00.000Z');
const acquiredAt = '2026-08-21T01:00:00.000Z';
const derivedAt = '2026-08-21T01:05:00.000Z';
const fixtureInfrastructureSource = {
  origin: 'synthetic_fixture',
  provider: 'synthetic-fixture',
  dataset: 'fixture:stormwater_network_example',
  acquiredAt,
  sourceCrs: 'EPSG:4326',
  outputCrs: 'EPSG:4326',
  transformation:
    'parse deterministic typed stormwater fixture and snap pipe endpoints',
  transformationVersion:
    'stormwater-geojson-import-v0.2.0',
};
const rainfallWindow = {
  windowStart: '2026-08-20T00:00:00.000Z',
  windowEnd: '2026-08-21T00:00:00.000Z',
  observedAt: '2026-08-21T00:00:00.000Z',
  acquiredAt,
};

function importFixture() {
  return importStormwaterGeoJson(fixture, {
    networkId: 'trento-proof-zero',
    source: fixtureInfrastructureSource,
    nodeH3Resolution: 11,
    catchmentH3Resolution: 13,
    snapToleranceM: 5,
  });
}

function fixtureEvidence(value, {
  fixtureId,
  h3,
  lat,
  lon,
  unit,
  sourceResolution,
  temporal = { acquiredAt },
}) {
  return syntheticFixtureEvidence(value, {
    fixtureId,
    unit,
    spatial: {
      h3,
      lat,
      lon,
      sourceResolution,
    },
    temporal,
  });
}

class FixtureEnvironmentalComposer {
  constructor(_imported, options = {}) {
    this.missingRainfallH3 = options.missingRainfallH3;
    this.missingElevationId = options.missingElevationId;
  }

  async compose(request) {
    const cells = {};
    const nodes = {};
    const issues = [];

    for (const h3 of request.catchmentH3Indices) {
      let rainfall24hMm;

      if (h3 === this.missingRainfallH3) {
        rainfall24hMm = unavailableEvidence(
          'missing',
          'fixture rainfall deliberately missing',
          {
            unit: 'mm',
            spatial: {
              h3,
              sourceResolution: '0.1 degree',
            },
            temporal: rainfallWindow,
            provenance: {
              provider: 'synthetic-fixture',
              dataset: 'fixture:proof-zero-environment',
            },
          },
        );
        issues.push({
          h3,
          layer: 'rainfall24h_mm',
          status: 'missing',
          reason: rainfall24hMm.quality.missingReason,
        });
      } else {
        rainfall24hMm = fixtureEvidence(12, {
          fixtureId: `imerg:${h3}`,
          h3,
          unit: 'mm',
          sourceResolution: '0.1 degree',
          temporal: rainfallWindow,
        });
      }

      cells[h3] = {
        h3,
        roles: ['catchment'],
        rainfall24hMm,
        elevationM: fixtureEvidence(100, {
          fixtureId: `dem-cell:${h3}`,
          h3,
          unit: 'm',
          sourceResolution:
            '1 arc-second (~30 m at equator)',
        }),
        slopeDeg: fixtureEvidence(1, {
          fixtureId: `slope:${h3}`,
          h3,
          unit: 'deg',
          sourceResolution:
            '1 arc-second (~30 m at equator)',
        }),
        landCoverClass: fixtureEvidence(112, {
          fixtureId: `clc:${h3}`,
          h3,
          unit: 'CLC class code',
          sourceResolution: '100 m',
        }),
      };
    }

    const nodeElevationById = {
      node_A_inlet: 103,
      node_B_manhole: 102,
      node_C_outfall: 101,
    };

    for (const node of request.nodes) {
      let elevationM;

      if (node.id === this.missingElevationId) {
        elevationM = unavailableEvidence(
          'missing',
          'fixture node elevation deliberately missing',
          {
            unit: 'm',
            spatial: {
              h3: node.h3,
              lat: node.lat,
              lon: node.lon,
              sourceResolution: 'fixture DEM grid',
            },
            temporal: { acquiredAt },
            provenance: {
              provider: 'synthetic-fixture',
              dataset: 'fixture:proof-zero-environment',
            },
          },
        );
        issues.push({
          h3: node.h3,
          entityId: node.id,
          layer: 'elevation_m',
          status: 'missing',
          reason: elevationM.quality.missingReason,
        });
      } else {
        elevationM = syntheticFixtureEvidence(
          nodeElevationById[node.id],
          {
            fixtureId: `dem-node:${node.id}`,
            unit: 'm',
            spatial: {
              h3: node.h3,
              lat: node.lat,
              lon: node.lon,
              sourceResolution:
                '1 arc-second (~30 m at equator)',
            },
            temporal: { acquiredAt },
          },
        );
      }

      nodes[node.id] = {
        ...node,
        elevationM,
      };
    }

    const source = (provider, dataset) => ({
      provider,
      dataset,
      acquiredAt,
      status: 'responded',
    });

    return {
      status: issues.length === 0 ? 'complete' : 'incomplete',
      referenceTime: request.referenceTime.toISOString(),
      acquiredAt,
      sources: {
        rainfall: {
          ...source('synthetic-fixture', 'fixture:imerg'),
          referenceTime: request.referenceTime.toISOString(),
          window24h: null,
        },
        terrain: source('synthetic-fixture', 'fixture:dem'),
        landCover: source('synthetic-fixture', 'fixture:clc'),
      },
      cells,
      nodes,
      issues,
    };
  }
}

test('canonical composer retains H3 roles, source resolutions and observed zero', async () => {
  const imported = importFixture();
  const catchmentH3 =
    imported.catchments[0].cells[0].h3;
  const nodeH3 =
    imported.topology.nodes.node_A_inlet.h3;
  const rain = fixtureEvidence(0, {
    fixtureId: 'canonical-rain-zero',
    h3: catchmentH3,
    unit: 'mm',
    sourceResolution: '0.1 degree',
    temporal: rainfallWindow,
  });
  const demCells = Object.fromEntries(
    [catchmentH3].map((h3) => [
      h3,
      {
        elevationM: fixtureEvidence(100, {
          fixtureId: `canonical-dem:${h3}`,
          h3,
          unit: 'm',
          sourceResolution:
            '1 arc-second (~30 m at equator)',
        }),
        slopeDeg: fixtureEvidence(1, {
          fixtureId: `canonical-slope:${h3}`,
          h3,
          unit: 'deg',
          sourceResolution:
            '1 arc-second (~30 m at equator)',
        }),
      },
    ]),
  );
  const composer = new CanonicalEnvironmentalEvidenceComposer({
    now: () => new Date(acquiredAt),
    clients: {
      imerg: {
        async getEvidence() {
          return {
            provider: 'NASA GES DISC',
            datasetFamily: 'GPM IMERG',
            contractVersion: 'fixture-contract',
            referenceTime: referenceTime.toISOString(),
            acquiredAt,
            windows: {
              24: {
                summary: {
                  windowHours: 24,
                  status: 'synthetic_fixture',
                  product: 'fixture',
                  runType: null,
                  datasetVersion: 'fixture',
                  requestedWindow: {
                    start: rainfallWindow.windowStart,
                    end: rainfallWindow.windowEnd,
                  },
                  actualWindow: {
                    start: rainfallWindow.windowStart,
                    end: rainfallWindow.windowEnd,
                  },
                  expectedGranuleCount: 48,
                  searchedGranuleCount: 48,
                  granuleCount: 48,
                  granuleTimestamps: [],
                  sourceResolution: '0.1 degree',
                  samplingMethod: 'fixture',
                  cached: false,
                },
                cells: {
                  [catchmentH3]: rain,
                },
              },
            },
          };
        },
      },
      dem: {
        async getEvidence() {
          return {
            provider: 'Copernicus Data Space Ecosystem',
            dataset: 'Copernicus DEM GLO-30',
            acquiredAt,
            cells: demCells,
          };
        },
        async getPointEvidence(request) {
          return {
            provider: 'Copernicus Data Space Ecosystem',
            dataset: 'Copernicus DEM GLO-30',
            acquiredAt,
            locations: Object.fromEntries(
              request.locations.map((location) => [
                location.id,
                {
                  elevationM: fixtureEvidence(103, {
                    fixtureId:
                      `canonical-node-dem:${location.id}`,
                    h3: location.h3,
                    lat: location.lat,
                    lon: location.lon,
                    unit: 'm',
                    sourceResolution:
                      '1 arc-second (~30 m at equator)',
                  }),
                  slopeDeg: fixtureEvidence(1, {
                    fixtureId:
                      `canonical-node-slope:${location.id}`,
                    h3: location.h3,
                    lat: location.lat,
                    lon: location.lon,
                    unit: 'deg',
                    sourceResolution:
                      '1 arc-second (~30 m at equator)',
                  }),
                },
              ]),
            ),
          };
        },
      },
      landCover: {
        async getEvidence() {
          return {
            provider: 'Copernicus Land Monitoring Service',
            dataset: 'CORINE Land Cover 2018',
            acquiredAt,
            cells: {
              [catchmentH3]: {
                classCode: fixtureEvidence(112, {
                  fixtureId: 'canonical-clc',
                  h3: catchmentH3,
                  unit: 'CLC class code',
                  sourceResolution: '100 m',
                }),
              },
            },
          };
        },
      },
    },
  });
  const bundle = await composer.compose({
    catchmentH3Indices: [catchmentH3],
    nodes: [
      {
        id: 'node_A_inlet',
        h3: nodeH3,
        lat:
          imported.topology.nodes.node_A_inlet.position.lat,
        lon:
          imported.topology.nodes.node_A_inlet.position.lon,
      },
    ],
    referenceTime,
  });

  assert.equal(bundle.status, 'complete');
  assert.equal(
    bundle.cells[catchmentH3].rainfall24hMm.value,
    0,
  );
  assert.equal(
    bundle.cells[catchmentH3].rainfall24hMm.quality.status,
    'synthetic_fixture',
  );
  assert.deepEqual(
    bundle.cells[catchmentH3].roles,
    ['catchment'],
  );
  assert.equal(
    bundle.nodes.node_A_inlet.h3,
    nodeH3,
  );
  assert.equal(
    bundle.nodes.node_A_inlet.elevationM.spatial.lat,
    imported.topology.nodes.node_A_inlet.position.lat,
  );
  assert.equal(
    bundle.cells[catchmentH3].landCoverClass.spatial
      .sourceResolution,
    '100 m',
  );
});

test('Proof 0 composes evidence through runoff, catchment and downstream state', async () => {
  const imported = importFixture();
  const result = await runStormwaterProofZero(
    imported,
    new FixtureEnvironmentalComposer(imported),
    {
      referenceTime,
      derivedAt,
      minimumResolvableDropM: 0.1,
    },
  );

  assert.equal(result.status, 'complete');
  assert.equal(result.environmental.status, 'complete');
  assert.equal(
    result.catchmentContributions[0].status,
    'complete',
  );
  assert.ok(
    result.catchmentContributions[0].totalVolumeM3.value > 0,
  );
  assert.equal(result.propagation.status, 'complete');
  assert.ok(
    result.propagation.massBalance.outfallVolumeM3 > 0,
  );
  assert.ok(
    Math.abs(result.propagation.massBalance.differenceM3) <
      1e-9,
  );
  assert.equal(
    result.environmental.cells[
      imported.catchments[0].cells[0].h3
    ].rainfall24hMm.spatial.sourceResolution,
    '0.1 degree',
  );
});

test('missing rainfall makes the proof incomplete without a zero source term', async () => {
  const imported = importFixture();
  const missingH3 = imported.catchments[0].cells[0].h3;
  const result = await runStormwaterProofZero(
    imported,
    new FixtureEnvironmentalComposer(imported, {
      missingRainfallH3: missingH3,
    }),
    {
      referenceTime,
      derivedAt,
      minimumResolvableDropM: 0.1,
    },
  );

  assert.equal(result.status, 'incomplete');
  assert.equal(result.environmental.status, 'incomplete');
  assert.equal(
    result.catchmentContributions[0].totalVolumeM3.value,
    null,
  );
  assert.equal(
    result.nodeSourceTerms.terms.node_A_inlet.value,
    null,
  );
  assert.equal(
    result.propagation.status,
    'incomplete_evidence',
  );
  assert.ok(
    result.environmental.issues.some(
      (issue) =>
        issue.h3 === missingH3 &&
        issue.layer === 'rainfall24h_mm' &&
        issue.status === 'missing',
    ),
  );
});

test('missing node elevation preserves unknown edge direction', async () => {
  const imported = importFixture();
  const missingNodeId = 'node_B_manhole';
  const result = await runStormwaterProofZero(
    imported,
    new FixtureEnvironmentalComposer(imported, {
      missingElevationId: missingNodeId,
    }),
    {
      referenceTime,
      derivedAt,
      minimumResolvableDropM: 0.1,
    },
  );

  assert.equal(result.status, 'incomplete');
  assert.equal(
    result.topology.nodes.node_B_manhole.elevationM.value,
    null,
  );
  assert.equal(
    result.propagation.status,
    'incomplete_direction',
  );
  assert.ok(
    Object.values(result.orientedNetwork.directions).some(
      (direction) =>
        direction.status === 'unknown' &&
        direction.reason === 'missing_vertical_evidence',
    ),
  );
});
