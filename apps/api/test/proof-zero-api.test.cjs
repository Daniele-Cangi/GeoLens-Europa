const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildGeoLensApi,
} = require('../dist/refoundation/server');
const {
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../../../packages/evidence/dist');

const fixturePath = path.resolve(
  __dirname,
  '../../../stormwater_network_example.geojson',
);
const network = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const waternetFixturePath = path.resolve(
  __dirname,
  '../../../packages/stormwater/test/fixtures/amsterdam-waternet-bounded.json',
);
const waternetSnapshot = JSON.parse(
  fs.readFileSync(waternetFixturePath, 'utf8'),
);
const referenceTime = '2026-08-21T00:00:00.000Z';
const acquiredAt = '2026-08-21T01:00:00.000Z';
const rainfallTemporal = {
  observedAt: referenceTime,
  windowStart: '2026-08-20T00:00:00.000Z',
  windowEnd: referenceTime,
  acquiredAt,
};

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

function fixtureComposer(options = {}) {
  return {
    async compose(request) {
      const cells = {};
      const nodes = {};
      const issues = [];

      for (const h3 of request.catchmentH3Indices) {
        let rainfall24hMm;

        if (options.missingRainfall) {
          rainfall24hMm = unavailableEvidence(
            'missing',
            'fixture rainfall missing',
            {
              unit: 'mm',
              spatial: {
                h3,
                sourceResolution: '0.1 degree',
              },
              temporal: rainfallTemporal,
              provenance: {
                provider: 'synthetic-fixture',
                dataset: 'fixture:api-rainfall',
              },
            },
          );
          issues.push({
            h3,
            layer: 'rainfall24h_mm',
            status: 'missing',
            reason:
              rainfall24hMm.quality.missingReason,
          });
        } else {
          rainfall24hMm = fixtureEvidence(10, {
            fixtureId: `api-rain:${h3}`,
            h3,
            unit: 'mm',
            sourceResolution: '0.1 degree',
            temporal: rainfallTemporal,
          });
        }

        cells[h3] = {
          h3,
          roles: ['catchment'],
          rainfall24hMm,
          elevationM: fixtureEvidence(100, {
            fixtureId: `api-dem-cell:${h3}`,
            h3,
            unit: 'm',
            sourceResolution:
              '1 arc-second (~30 m at equator)',
          }),
          slopeDeg: fixtureEvidence(1, {
            fixtureId: `api-slope:${h3}`,
            h3,
            unit: 'deg',
            sourceResolution:
              '1 arc-second (~30 m at equator)',
          }),
          landCoverClass: fixtureEvidence(112, {
            fixtureId: `api-clc:${h3}`,
            h3,
            unit: 'CLC class code',
            sourceResolution: '100 m',
          }),
        };
      }

      const elevations = {
        node_A_inlet: 103,
        node_B_manhole: 102,
        node_C_outfall: 101,
      };

      for (const node of request.nodes) {
        nodes[node.id] = {
          ...node,
          elevationM: fixtureEvidence(
            elevations[node.id] ?? 1,
            {
              fixtureId: `api-dem-node:${node.id}`,
              h3: node.h3,
              lat: node.lat,
              lon: node.lon,
              unit: 'm',
              sourceResolution:
                '1 arc-second (~30 m at equator)',
            },
          ),
        };
      }

      const source = (provider, dataset) => ({
        provider,
        dataset,
        acquiredAt,
        status: 'responded',
      });

      return {
        status:
          issues.length === 0
            ? 'complete'
            : 'incomplete',
        referenceTime:
          request.referenceTime.toISOString(),
        acquiredAt,
        sources: {
          rainfall: {
            ...source(
              'synthetic-fixture',
              'fixture:api-rainfall',
            ),
            referenceTime:
              request.referenceTime.toISOString(),
            window24h: null,
          },
          terrain: source(
            'synthetic-fixture',
            'fixture:api-dem',
          ),
          landCover: source(
            'synthetic-fixture',
            'fixture:api-clc',
          ),
        },
        cells,
        nodes,
        issues,
      };
    },
  };
}

function availableWaternetClient() {
  return {
    async acquire({ bbox }) {
      const bboxWfsAxisOrder = [
        bbox.latMin,
        bbox.lonMin,
        bbox.latMax,
        bbox.lonMax,
        'EPSG:4326',
      ].join(',');
      const receipt = {
        provider: 'Gemeente Amsterdam Data API',
        dataset: 'Leidingeninfrastructuur',
        acquiredAt,
        bboxWfsAxisOrder,
        nodeUrl: 'https://fixture.invalid/nodes',
        pipeUrl: 'https://fixture.invalid/pipes',
      };

      return {
        status: 'available',
        receipt,
        snapshot: {
          ...waternetSnapshot,
          metadata: {
            ...waternetSnapshot.metadata,
            acquiredAt,
            bboxWfsAxisOrder,
            retrievalMode: 'live',
          },
        },
      };
    },
  };
}

function gwswReceipt() {
  return {
    provider: 'PDOK',
    publisher: 'Stichting RIONED',
    dataset: 'Stedelijk Water (Riolering)',
    collection: 'beheergebied',
    license: 'CC0 1.0',
    acquiredAt,
    responseTimestamp: '2026-08-21T00:59:00.000Z',
    requestUrl: 'https://fixture.invalid/gwsw/beheergebied',
    requestedBboxCrs84: '4.8978,52.3375,4.8995,52.3395',
    sourceCrs: 'OGC:CRS84',
    outputCrs: 'OGC:CRS84',
    featureCount: 1,
    rioleringsgebiedCount: 1,
    documentationUrl:
      'https://www.pdok.nl/introductie/-/article/stedelijk-water-riolering-',
  };
}

function availableGwswAreaClient() {
  return {
    async acquire() {
      return {
        status: 'available',
        receipt: gwswReceipt(),
        areas: [
          {
            featureId:
              'NL.WBHCODE.11.Rioleringsgebied.932',
            name: 'President Kennedylaan',
            areaType: 'rioleringsgebied',
            sourceTypeName: 'Rioleringsgebied',
            sourceTypeUri:
              'https://data.gwsw.nl/1.6/totaal/Rioleringsgebied',
            sourceDatasetUrl:
              'https://apps.gwsw.nl/Beheer/StedelijkWater',
            sourceUri:
              'https://data.gwsw.nl/1.6/Amsterdam/Rioleringsgebied/932',
            geometry: {
              type: 'MultiPolygon',
              coordinates: [
                [
                  [
                    [4.897, 52.337],
                    [4.9005, 52.337],
                    [4.9005, 52.3405],
                    [4.897, 52.3405],
                    [4.897, 52.337],
                  ],
                ],
              ],
            },
          },
        ],
      };
    },
  };
}

function unavailableGwswAreaClient() {
  return {
    async acquire() {
      return {
        status: 'upstream_error',
        missingReason: 'fixture GWSW upstream unavailable',
        receipt: {
          ...gwswReceipt(),
          responseTimestamp: null,
          featureCount: 0,
          rioleringsgebiedCount: 0,
        },
        areas: [],
      };
    },
  };
}

function bgtReceipt() {
  const collectionIds = [
    'begroeidterreindeel',
    'onbegroeidterreindeel',
    'pand',
    'waterdeel',
    'wegdeel',
    'ondersteunendwaterdeel',
    'ondersteunendwegdeel',
    'scheiding_vlak',
  ];
  return {
    provider: 'PDOK',
    dataset: 'Basisregistratie Grootschalige Topografie (BGT)',
    license: 'CC0 1.0',
    acquiredAt,
    requestedAt: acquiredAt,
    requestedBboxCrs84: '4.8978,52.3375,4.8995,52.3395',
    sourceCrs: 'OGC:CRS84',
    storageCrs: 'EPSG:28992',
    featureCount: 1,
    collections: collectionIds.map((collection) => ({
      collection,
      requestUrl: `https://fixture.invalid/bgt/${collection}`,
      responseTimestamp: acquiredAt,
      featureCount: collection === 'begroeidterreindeel' ? 1 : 0,
    })),
    documentationUrl:
      'https://www.pdok.nl/ogc-apis/-/article/basisregistratie-grootschalige-topografie-bgt-',
  };
}

function availableBgtSurfaceClient() {
  return {
    async acquire() {
      return {
        status: 'available',
        receipt: bgtReceipt(),
        features: [
          {
            featureId: 'fixture-bgt-land',
            localId: 'G0363.fixture-bgt-land',
            collection: 'begroeidterreindeel',
            surfaceClass: 'vegetated_terrain',
            sourceHolder: 'G0363',
            status: 'bestaand',
            relativeHeight: 0,
            creationDate: '2020-01-01T00:00:00.000Z',
            registrationTime: acquiredAt,
            publicationTime: acquiredAt,
            terminationDate: null,
            version: 'fixture-bgt-version',
            physicalAppearance: 'groenvoorziening',
            function: null,
            waterType: null,
            geometry: {
              type: 'MultiPolygon',
              coordinates: [
                [
                  [
                    [4.897, 52.337],
                    [4.901, 52.337],
                    [4.901, 52.341],
                    [4.897, 52.341],
                    [4.897, 52.337],
                  ],
                ],
              ],
            },
          },
        ],
      };
    },
  };
}

function unavailableBgtSurfaceClient() {
  return {
    async acquire() {
      return {
        status: 'upstream_error',
        missingReason: 'fixture BGT upstream unavailable',
        receipt: {
          ...bgtReceipt(),
          featureCount: 0,
          collections: bgtReceipt().collections.map((item) => ({
            ...item,
            responseTimestamp: null,
            featureCount: 0,
          })),
        },
        features: [],
      };
    },
  };
}
function fixtureSurfaceElevationClient(options = {}) {
  return {
    async getElevationEvidence({ h3Indices }) {
      const cells = Object.fromEntries(
        h3Indices.map((h3, index) => {
          if (options.missing) {
            return [
              h3,
              unavailableEvidence(
                'missing',
                'fixture DEM pixel is missing',
                {
                  unit: 'm',
                  spatial: {
                    h3,
                    sourceResolution:
                      '0.5 m',
                  },
                  temporal: { acquiredAt },
                  provenance: {
                    provider: 'synthetic-fixture',
                    dataset: 'fixture:api-surface-dem-missing',
                    transformation: 'sample DEM at H3 centroid',
                    transformationVersion:
                      'dem-centroid-v0.1.0',
                    samplingMethod:
                      'nearest source raster pixel',
                  },
                },
              ),
            ];
          }

          return [
            h3,
            fixtureEvidence(
              h3 === '8d19695222b477f' ? 0 : 100 + index,
              {
                fixtureId: `api-surface-dem:${h3}`,
                h3,
                unit: 'm',
                sourceResolution:
                  '0.5 m',
              },
            ),
          ];
        }),
      );

      return {
        provider: 'PDOK',
        dataset: 'Actueel Hoogtebestand Nederland DTM',
        datasetVersion: 'AHN4',
        coverage: null,
        acquiredAt,
        cells,
      };
    },
  };
}
function buildTestServer(
  composer = fixtureComposer(),
  overrides = {},
) {
  return buildGeoLensApi({
    evidenceComposer: composer,
    surfaceElevationClient: fixtureSurfaceElevationClient(),
    gwswAreaClient: availableGwswAreaClient(),
    bgtSurfaceClient: availableBgtSurfaceClient(),
    now: () => new Date(acquiredAt),
    runtime: {
      imergServiceConfigured: false,
      clcRasterConfigured: false,
    },
    ...overrides,
  });
}

test('API identity exposes health, Proof 0 and observed infrastructure', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const rootResponse = await server.inject({
    method: 'GET',
    url: '/',
  });
  const healthResponse = await server.inject({
    method: 'GET',
    url: '/health',
  });
  const root = rootResponse.json();
  const health = healthResponse.json();

  assert.equal(rootResponse.statusCode, 200);
  assert.equal(
    root.endpoints.proofZero,
    'POST /api/proof-zero/run',
  );
  assert.equal(
    root.endpoints.observedInfrastructure,
    'GET /api/infrastructure/amsterdam-waternet',
  );
  assert.equal(
    root.endpoints.emiliaHistoricalBenchmark,
    'GET /api/benchmarks/emilia-romagna-2023',
  );
  assert.equal(
    root.endpoints.emiliaHistoricalBenchmarkMap,
    'GET /api/benchmarks/emilia-romagna-2023/map-manifest',
  );
  assert.equal(JSON.stringify(root).includes('ai'), false);
  assert.equal(JSON.stringify(root).includes('mineral'), false);
  assert.equal(health.coreRequiresAi, false);
  assert.equal(health.coreRequiresMineralModel, false);
});

test('API exposes the verified Emilia negative benchmark without promoting blocked hydraulics', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/benchmarks/emilia-romagna-2023',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers['cache-control'],
    'public, max-age=300, stale-while-revalidate=86400',
  );
  assert.equal(body.manifest.version, '1.15.0');
  assert.equal(body.manifest.artifactCount, 55);
  assert.equal(body.manifest.artifactBytes, 746444721);
  assert.equal(body.state, 'evaluated_negative_baseline');
  assert.equal(body.routing.status, 'incomplete_window');
  assert.equal(body.routing.rainfall.granules, 96);
  assert.equal(body.routing.rainfall.expectedGranules, 96);
  assert.ok(body.routing.runoff.localVolumeM3 > 0);
  assert.ok(Math.abs(body.routing.runoff.massBalanceDifferenceM3) < 1e-6);
  assert.equal(body.evaluation.calibration, false);
  assert.equal(body.evaluation.interpretation, 'near_random_negative_baseline');
  assert.equal(body.conditionedReplay.status, 'blocked_missing_required_evidence');
  assert.ok(
    body.conditionedReplay.requiredEvidence.some(
      (item) => item.status === 'missing',
    ),
  );
  assert.ok(body.claims.forbidden.includes('validated_inundation_extent'));
  assert.equal(JSON.stringify(body).includes('floodProbability'), false);
});

test('API exposes only publication-safe Emilia map layers', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/benchmarks/emilia-romagna-2023/map-manifest',
  });
  const body = response.json();
  const renderable = body.layers.filter(
    (layer) => layer.renderState === 'renderable',
  );
  const withheld = body.layers.filter(
    (layer) => layer.renderState === 'withheld',
  );

  assert.equal(response.statusCode, 200);
  assert.equal(body.schemaVersion, 'emilia-map-manifest-v0.1.0');
  assert.equal(body.manifestVersion, '1.15.0');
  assert.equal(body.displayGrid.width, 34);
  assert.equal(body.displayGrid.height, 42);
  assert.equal(body.displayGrid.nominalCellSizeM, 300);
  assert.equal(renderable.length, 4);
  assert.ok(renderable.every((layer) => layer.data !== null));
  assert.ok(withheld.every((layer) => layer.data === null));
  assert.equal(
    body.layers.find((layer) => layer.id === 'observed_flood_extent')
      .publicationState,
    'restricted',
  );
  assert.equal(
    body.layers.find((layer) => layer.id === 'event_runoff_concentration')
      .publicationState,
    'review_pending',
  );
  assert.ok(body.claims.mapIsNot.includes('inundation_map'));
  assert.equal(JSON.stringify(body).includes('floodProbability'), false);
});

test('API returns inspectable non-zero downstream fixture state', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'POST',
    url: '/api/proof-zero/run',
    payload: {
      network,
      networkId: 'api-proof-zero',
      referenceTime,
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'complete');
  assert.equal(body.environmental.status, 'complete');
  assert.equal(body.propagation.status, 'complete');
  assert.ok(
    body.propagation.massBalance.outfallVolumeM3 > 0,
  );
  assert.ok(
    Math.abs(
      body.propagation.massBalance.differenceM3,
    ) < 1e-9,
  );
  assert.equal(
    body.environmental.cells[
      Object.keys(body.environmental.cells)[0]
    ].rainfall24hMm.quality.status,
    'synthetic_fixture',
  );
  assert.equal(JSON.stringify(body).includes('mineral'), false);
  assert.equal(JSON.stringify(body).includes('waterScore'), false);
});

test('API returns incomplete evidence instead of zero rainfall', async (context) => {
  const server = buildTestServer(
    fixtureComposer({ missingRainfall: true }),
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'POST',
    url: '/api/proof-zero/run',
    payload: {
      network,
      referenceTime,
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'incomplete');
  assert.equal(
    body.catchmentContributions[0].totalVolumeM3.value,
    null,
  );
  assert.equal(
    body.nodeSourceTerms.terms.node_A_inlet.value,
    null,
  );
  assert.equal(
    body.propagation.status,
    'incomplete_evidence',
  );
});

test('API exposes observed Waternet topology with its import receipt', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient:
        availableWaternetClient(),
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'available');
  assert.equal(
    Object.keys(body.topology.nodes).length,
    47,
  );
  assert.equal(
    Object.keys(body.topology.pipes).length,
    47,
  );
  assert.equal(
    Object.values(body.topology.nodes).filter(
      (node) => node.type === 'outfall',
    ).length,
    4,
  );
  assert.equal(
    body.orientation.evidenceBasis,
    'pipe_invert_level',
  );
  assert.equal(
    body.orientation.modelVersion,
    'pipe-invert-direction-v0.2.0',
  );
  assert.equal(
    body.orientation.minimumResolvableDropM,
    0.05,
  );
  assert.equal(
    body.orientation.numericComparisonToleranceM,
    0.000001,
  );
  assert.match(
    body.orientation.thresholdSemantics,
    /at or above the configured drop/,
  );
  assert.deepEqual(body.orientation.counts, {
    known: 26,
    ambiguous: 21,
    unknown: 0,
  });
  assert.ok(
    Object.values(body.orientation.directions).every(
      (direction) =>
        direction.evidenceBasis ===
        'pipe_invert_level',
    ),
  );
  assert.equal(
    body.outfallConnectivity.modelVersion,
    'known-direction-outfall-connectivity-v0.1.0',
  );
  assert.equal(
    body.outfallConnectivity.minimumResolvableDropM,
    0.05,
  );
  assert.deepEqual(
    body.outfallConnectivity.counts,
    {
      outfalls: 4,
      knownUpstreamPaths: 1,
      blockedByUnresolvedDirection: 3,
      isolated: 0,
      directionConflicts: 0,
      knownPathNodes: 5,
      knownPathPipes: 4,
      unresolvedBoundaryPipes: 4,
    },
  );
  assert.deepEqual(
    body.outfallConnectivity.knownPathPipeIds,
    [
      'waternet:268FA439-0CF3-4604-8500-19F6DFDB3DC7',
      'waternet:2E5F673B-3226-4E2D-9235-565CE30AF5CB',
      'waternet:411E1909-C07E-498B-9CE7-E704D88E3160',
      'waternet:BEFDCC16-D2C5-4E8E-B137-5010E94F8E24',
    ],
  );
  assert.equal(
    body.outfallConnectivity.outfalls[
      'waternet:8522CE11-8DC1-41CC-9375-EDECAB742620'
    ].status,
    'known_upstream_path',
  );
  assert.deepEqual(
    body.outfallConnectivity.outfalls[
      'waternet:8522CE11-8DC1-41CC-9375-EDECAB742620'
    ].unresolvedBoundaryPipeIds,
    ['waternet:4A138DAD-0918-4314-827A-28EEDBB468AE'],
  );
  assert.equal(
    body.outfallAreaContext.status,
    'unresolved_no_published_crosswalk',
  );
  assert.equal(
    body.outfallAreaContext.result
      .waternetPumpingAreaReference.value,
    '826',
  );
  assert.equal(
    body.outfallAreaContext.result
      .waternetPumpingAreaReference.gwswCrosswalk,
    'not_published',
  );
  assert.deepEqual(
    body.outfallAreaContext.result
      .containingRioleringsgebieden.map((area) => area.name),
    ['President Kennedylaan'],
  );
  assert.equal(
    body.outfallAreaContext.result.attachment.eligible,
    false,
  );
  assert.equal(
    body.outfallAreaContext.result.attachment
      .catchmentAttachmentCreated,
    false,
  );
  assert.equal(
    body.authoritativeSurfaceNetworkAttachment.standard,
    'STOWA-2025-02',
  );
  assert.equal(
    body.authoritativeSurfaceNetworkAttachment
      .destinationObservations.quality.status,
    'missing',
  );
  assert.equal(
    body.authoritativeSurfaceNetworkAttachment
      .networkAttachments.quality.status,
    'missing',
  );
  assert.equal(
    body.authoritativeSurfaceNetworkAttachment
      .networkAttachments.value,
    null,
  );
  assert.equal(
    body.authoritativeSurfaceNetworkAttachment
      .propagationEligible,
    false,
  );
  assert.match(
    body.authoritativeSurfaceNetworkAttachment
      .networkAttachments.quality.missingReason,
    /No Amsterdam owner-published BGT Inlooptabel/,
  );
  assert.equal(
    body.surfaceCatchmentProxy.status,
    'synthetic_fixture',
  );
  assert.equal(
    body.surfaceCatchmentProxy.result.semantics,
    'experimental_dem_derived_surface_contributing_area_proxy',
  );
  assert.equal(
    body.surfaceCatchmentProxy.result.coverage.targetCellCount,
    696,
  );
  assert.ok(
    body.surfaceCatchmentProxy.result.coverage.sampledCellCount > 696,
  );
  assert.equal(
    body.surfaceCatchmentProxy.result.outfallAnchor.nodeId,
    'waternet:8522CE11-8DC1-41CC-9375-EDECAB742620',
  );
  assert.ok(
    body.surfaceCatchmentProxy.result.contributingAreaM2.value > 0,
  );
  assert.equal(
    body.surfaceCatchmentProxy.result.sewerCatchmentSemantics,
    'not_asserted',
  );
  assert.equal(
    body.surfaceCatchmentProxy.result.elevationModel.semantics,
    'digital_terrain_model',
  );
  assert.match(
    body.surfaceCatchmentProxy.result.elevationModel
      .samplingDescription,
    /source-pixel centers inside each H3 cell/,
  );
  assert.equal(
    body.surfaceCatchmentProxy.networkUse.eligibleForSewerPropagation,
    false,
  );
  assert.deepEqual(
    body.surfaceCatchmentProxy.networkUse.reasons,
    [
      'not_observed_sewer_catchment',
      'environmental_runoff_not_composed',
    ],
  );
  assert.equal(
    body.surfaceCatchmentProxy.networkUse.orientationThresholdM,
    0.05,
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.status,
    'synthetic_fixture',
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.semantics,
    'experimental_bgt_ahn_conditioned_surface_contributing_area_proxy',
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.coverage.targetCellCount,
    696,
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.counts.observedElevationCells,
    696,
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.counts.interpolatedElevationCells,
    0,
  );
  assert.ok(
    body.conditionedSurfaceCatchmentProxy.result.contributingAreaM2.value > 0,
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.outfallAttachment.observed,
    false,
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.outfallAttachment
      .eligibleForSewerPropagation,
    false,
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.surfaceAcquisition.featureCount,
    1,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.status,
    'synthetic_fixture',
  );
  assert.equal(
    body.conditionedSurfaceRunoff.result.semantics,
    'experimental_runoff_over_conditioned_surface_proxy',
  );
  assert.ok(
    body.conditionedSurfaceRunoff.result.selection.candidateCellCount >
      100,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.result.selection.selectedCellCount,
    100,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.result.selection.maximumCellCount,
    100,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.result.selection.coversAllConditionedContributingCells,
    false,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.result.environmental.referenceTime,
    '2026-08-20T00:00:00.000Z',
  );
  assert.ok(
    body.conditionedSurfaceRunoff.result.catchmentContribution.totalVolumeM3.value > 0,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.networkPropagation.attempted,
    false,
  );
  assert.deepEqual(
    body.conditionedSurfaceRunoff.networkPropagation.blockingReasons,
    [
      'not_observed_sewer_catchment',
    ],
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.networkUse.environmentalRunoffComposed,
    true,
  );
  assert.deepEqual(
    body.conditionedSurfaceCatchmentProxy.networkUse.reasons,
    [
      'not_observed_sewer_catchment',
    ],
  );
  assert.equal('propagation' in body, false);
  assert.equal(
    body.import.source.origin,
    'observed_public_record',
  );
  assert.equal(
    body.import.endpointLinkPolicy
      .sourceEndpointAttributes,
    'ignored_invalid_self_referential',
  );
  assert.equal(
    body.import.counts.skippedBoundaryPipes,
    10,
  );
  assert.deepEqual(
    body.import.pumpingAreaReferences,
    {
      sourceField: 'bemalingsgebied',
      identifiers: ['826'],
      geometryStatus: 'not_provided_by_source',
      attachmentEligible: false,
    },
  );
  assert.deepEqual(
    body.topology.catchmentAttachments,
    {},
  );
});

test('API keeps missing IMERG explicit in conditioned runoff without attempting propagation', async (context) => {
  const server = buildTestServer(
    fixtureComposer({ missingRainfall: true }),
    {
      waternetClient: availableWaternetClient(),
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'available');
  assert.equal(body.conditionedSurfaceRunoff.status, 'missing');
  assert.equal(
    body.conditionedSurfaceRunoff.result.status,
    'incomplete',
  );
  assert.equal(
    body.conditionedSurfaceRunoff.result.catchmentContribution
      .totalVolumeM3.value,
    null,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.result.catchmentContribution
      .partialAvailableVolumeM3,
    0,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.networkPropagation.attempted,
    false,
  );
  assert.deepEqual(
    body.conditionedSurfaceRunoff.networkPropagation.blockingReasons,
    [
      'not_observed_sewer_catchment',
      'environmental_runoff_incomplete',
    ],
  );
  assert.equal('propagation' in body, false);
});
test('API keeps observed topology while missing DEM blocks the surface proxy area', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient: availableWaternetClient(),
      surfaceElevationClient: fixtureSurfaceElevationClient({ missing: true }),
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'available');
  assert.equal(Object.keys(body.topology.nodes).length, 47);
  assert.equal(body.surfaceCatchmentProxy.status, 'missing');
  assert.equal(
    body.surfaceCatchmentProxy.result.contributingAreaM2.value,
    null,
  );
  assert.match(
    body.surfaceCatchmentProxy.missingReason,
    /required DEM samples are unavailable/,
  );
  assert.equal(
    body.surfaceCatchmentProxy.networkUse.eligibleForSewerPropagation,
    false,
  );
  assert.equal(body.conditionedSurfaceCatchmentProxy.status, 'missing');
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.contributingAreaM2.value,
    null,
  );
  assert.ok(
    body.conditionedSurfaceCatchmentProxy.result.counts
      .unresolvedConditioningCells > 0,
  );
  assert.equal(body.conditionedSurfaceRunoff.status, 'missing');
  assert.equal(body.conditionedSurfaceRunoff.result, null);
  assert.equal(
    body.conditionedSurfaceRunoff.networkPropagation.attempted,
    false,
  );
  assert.equal('propagation' in body, false);
});
test('API keeps GWSW failure explicit without changing observed topology', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient: availableWaternetClient(),
      gwswAreaClient: unavailableGwswAreaClient(),
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'available');
  assert.equal(body.outfallAreaContext.status, 'upstream_error');
  assert.match(
    body.outfallAreaContext.missingReason,
    /GWSW upstream unavailable/,
  );
  assert.equal(
    body.outfallAreaContext.result.attachment.eligible,
    false,
  );
  assert.equal(
    body.outfallAreaContext.result.attachment
      .catchmentAttachmentCreated,
    false,
  );
  assert.deepEqual(body.topology.catchmentAttachments, {});
  assert.equal('propagation' in body, false);
});

test('API keeps BGT failure explicit without invalidating AHN or observed topology', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient: availableWaternetClient(),
      bgtSurfaceClient: unavailableBgtSurfaceClient(),
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'available');
  assert.equal(body.surfaceCatchmentProxy.status, 'synthetic_fixture');
  assert.equal(body.surfaceCatchmentProxy.result.contributingAreaM2.value > 0, true);
  assert.equal(body.conditionedSurfaceCatchmentProxy.status, 'upstream_error');
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.contributingAreaM2.value,
    null,
  );
  assert.match(
    body.conditionedSurfaceCatchmentProxy.missingReason,
    /fixture BGT upstream unavailable/,
  );
  assert.equal(
    body.conditionedSurfaceCatchmentProxy.result.counts
      .unresolvedConditioningCells,
    696,
  );
  assert.deepEqual(body.topology.catchmentAttachments, {});
  assert.equal(body.conditionedSurfaceRunoff.status, 'upstream_error');
  assert.equal(body.conditionedSurfaceRunoff.result, null);
  assert.equal('propagation' in body, false);
});

test('API bounds DEM proxy cells before provider acquisition', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient: availableWaternetClient(),
      surfaceElevationClient: {
        async getElevationEvidence() {
          throw new Error('DEM client must not be called');
        },
      },
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url:
      '/api/infrastructure/amsterdam-waternet?latMin=52.3335&lonMin=4.893&latMax=52.3435&lonMax=4.903',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'available');
  assert.equal(
    body.surfaceCatchmentProxy.status,
    'out_of_coverage',
  );
  assert.equal(body.surfaceCatchmentProxy.result, null);
  assert.match(
    body.surfaceCatchmentProxy.missingReason,
    /exceeds the bounded limit/,
  );
  assert.equal(
    body.conditionedSurfaceRunoff.status,
    'out_of_coverage',
  );
  assert.equal(body.conditionedSurfaceRunoff.result, null);
});
test('API preserves Waternet provider failure without topology', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient: {
        async acquire() {
          return {
            status: 'rate_limited',
            missingReason:
              'Waternet pipes WFS returned HTTP 429',
            failedLayer: 'pipes',
            receipt: {
              provider:
                'Gemeente Amsterdam Data API',
              dataset:
                'Leidingeninfrastructuur',
              acquiredAt,
              bboxWfsAxisOrder:
                '52.3375,4.8978,52.3395,4.8995,EPSG:4326',
              nodeUrl:
                'https://fixture.invalid/nodes',
              pipeUrl:
                'https://fixture.invalid/pipes',
            },
          };
        },
      },
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet',
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'rate_limited');
  assert.equal(body.failedLayer, 'pipes');
  assert.equal('topology' in body, false);
  assert.equal('orientation' in body, false);
});

test('API requires a complete Waternet bbox', async (context) => {
  const server = buildTestServer(
    fixtureComposer(),
    {
      waternetClient:
        availableWaternetClient(),
    },
  );
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url:
      '/api/infrastructure/amsterdam-waternet?latMin=52.3375',
  });
  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.status, 'invalid_request');
  assert.match(body.error, /requires latMin/);
});

test('API rejects an invalid observed-environment reference time before provider calls', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url: '/api/infrastructure/amsterdam-waternet?referenceTime=not-a-date',
  });
  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.status, 'invalid_request');
  assert.match(body.error, /referenceTime/);
});
test('API rejects a Waternet bbox outside the bounded-area limit', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'GET',
    url:
      '/api/infrastructure/amsterdam-waternet?latMin=52.3&lonMin=4.8&latMax=52.4&lonMax=4.9',
  });
  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.status, 'invalid_request');
  assert.match(body.error, /bounded-area limit/);
});
test('API rejects requests without an explicit reference time', async (context) => {
  const server = buildTestServer();
  context.after(() => server.close());

  const response = await server.inject({
    method: 'POST',
    url: '/api/proof-zero/run',
    payload: { network },
  });
  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.status, 'invalid_request');
  assert.match(body.error, /referenceTime/);
});
