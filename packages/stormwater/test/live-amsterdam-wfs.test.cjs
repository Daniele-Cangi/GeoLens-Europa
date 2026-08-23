const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AmsterdamWaternetWfsClient,
  analyzeOutfallConnectivity,
  importAmsterdamWaternetStormwater,
  orientStormwaterNetworkByPipeInverts,
} = require('../dist');

const liveEnabled =
  process.env.GEOLENS_LIVE_WATERNET === '1';

test(
  'live Waternet WFS returns a bounded traceable stormwater topology',
  { skip: !liveEnabled },
  async () => {
    const acquisition =
      await new AmsterdamWaternetWfsClient()
        .acquire({
          bbox: {
            latMin: 52.3375,
            lonMin: 4.8978,
            latMax: 52.3395,
            lonMax: 4.8995,
          },
        });

    assert.equal(
      acquisition.status,
      'available',
      acquisition.status === 'available'
        ? undefined
        : acquisition.missingReason,
    );

    const imported =
      importAmsterdamWaternetStormwater(
        acquisition.snapshot,
        {
          networkId:
            'amsterdam-waternet-live-verification',
          acquiredAt:
            acquisition.receipt.acquiredAt,
          nodeH3Resolution: 11,
          snapToleranceM: 0.25,
          bboxWfsAxisOrder:
            acquisition.receipt
              .bboxWfsAxisOrder,
          retrievalMode: 'live',
        },
      );

    const oriented = orientStormwaterNetworkByPipeInverts(
      imported.topology,
      { minimumResolvableDropM: 0.05 },
    );
    const connectivity = analyzeOutfallConnectivity(oriented);

    assert.deepEqual(connectivity.counts, {
      outfalls: 4,
      knownUpstreamPaths: 1,
      blockedByUnresolvedDirection: 3,
      isolated: 0,
      directionConflicts: 0,
      knownPathNodes: 5,
      knownPathPipes: 4,
      unresolvedBoundaryPipes: 4,
    });
    assert.ok(
      Object.keys(imported.topology.nodes)
        .length > 0,
    );
    assert.ok(
      Object.keys(imported.topology.pipes)
        .length > 0,
    );
    assert.equal(
      imported.receipt.source.origin,
      'observed_public_record',
    );
    assert.equal(
      imported.receipt.source.license,
      'Creative Commons Attribution',
    );
    assert.equal(
      imported.receipt.catchmentState
        .attachmentsCreated,
      0,
    );
  },
);
