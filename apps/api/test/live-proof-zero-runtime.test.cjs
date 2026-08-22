const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const liveEnabled =
  process.env.GEOLENS_RUN_LIVE_PROOF_ZERO_TESTS === '1';

test(
  'live Proof 0 carries real evidence through the bounded Trento network',
  {
    skip: !liveEnabled,
    timeout: 10 * 60 * 1000,
  },
  async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../stormwater_network_example.geojson',
    );
    const network = JSON.parse(
      fs.readFileSync(fixturePath, 'utf8'),
    );
    const baseUrl = (
      process.env.GEOLENS_PROOF_ZERO_API_URL ??
      'http://127.0.0.1:3003'
    ).replace(/\/$/, '');
    const referenceTime =
      process.env.GEOLENS_IMERG_REFERENCE_TIME ??
      '2026-08-20T00:00:00Z';
    const response = await fetch(
      `${baseUrl}/api/proof-zero/run`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          network,
          networkId: 'trento-live-proof-zero',
          referenceTime,
        }),
        signal: AbortSignal.timeout(9 * 60 * 1000),
      },
    );
    const body = await response.json();

    assert.equal(
      response.status,
      200,
      JSON.stringify(body),
    );
    assert.equal(body.status, 'complete');
    assert.equal(body.environmental.status, 'complete');

    const cells = Object.values(body.environmental.cells);
    assert.ok(cells.length > 0);

    for (const cell of cells) {
      const rainfall = cell.rainfall24hMm;
      const elevation = cell.elevationM;
      const slope = cell.slopeDeg;
      const landCover = cell.landCoverClass;

      assert.equal(rainfall.quality.status, 'available');
      assert.equal(rainfall.provenance.provider, 'NASA GES DISC');
      assert.match(rainfall.provenance.dataset, /^GPM_3IMERGHH/);
      assert.equal(rainfall.provenance.datasetVersion, '07');
      assert.equal(rainfall.spatial.sourceResolution, '0.1 degree');
      assert.equal(
        rainfall.provenance.sourceMetadata.granuleCount,
        48,
      );
      assert.equal(
        rainfall.provenance.sourceMetadata.granuleTimestamps.length,
        48,
      );
      assert.ok(rainfall.value > 0);
      assert.equal(
        new Date(rainfall.temporal.windowEnd).getTime(),
        new Date(referenceTime).getTime(),
      );
      assert.equal(
        new Date(rainfall.temporal.windowStart).getTime(),
        new Date(referenceTime).getTime() - 24 * 60 * 60 * 1000,
      );

      assert.equal(elevation.quality.status, 'available');
      assert.equal(
        elevation.provenance.dataset,
        'Copernicus DEM GLO-30',
      );
      assert.match(elevation.spatial.sourceResolution, /30 m/);
      assert.ok(Number.isFinite(elevation.value));

      assert.equal(slope.quality.status, 'available');
      assert.ok(Number.isFinite(slope.value));
      assert.ok(slope.value >= 0);

      assert.equal(landCover.quality.status, 'available');
      assert.equal(
        landCover.provenance.dataset,
        'CORINE Land Cover',
      );
      assert.equal(
        landCover.provenance.datasetVersion,
        'CLC2018',
      );
      assert.equal(
        landCover.provenance.sourceMetadata.paletteMapping,
        'CLC2018 V2020_20u1 legend',
      );
      assert.equal(landCover.spatial.sourceResolution, '100 m');
      assert.ok(Number.isInteger(landCover.value));
      assert.ok(landCover.value >= 100 && landCover.value <= 599);
    }

    const nodeElevations = Object.fromEntries(
      Object.entries(body.environmental.nodes).map(
        ([id, node]) => [id, node.elevationM],
      ),
    );
    for (const evidence of Object.values(nodeElevations)) {
      assert.equal(evidence.quality.status, 'available');
      assert.ok(Number.isFinite(evidence.value));
    }

    const directions = body.orientedNetwork.directions;
    assert.equal(directions.pipe_1_A_to_B.status, 'known');
    assert.equal(
      directions.pipe_1_A_to_B.fromNodeId,
      'node_A_inlet',
    );
    assert.equal(
      directions.pipe_1_A_to_B.toNodeId,
      'node_B_manhole',
    );
    assert.equal(directions.pipe_2_B_to_C.status, 'known');
    assert.equal(
      directions.pipe_2_B_to_C.fromNodeId,
      'node_B_manhole',
    );
    assert.equal(
      directions.pipe_2_B_to_C.toNodeId,
      'node_C_outfall',
    );
    assert.ok(directions.pipe_1_A_to_B.elevationDropM > 0);
    assert.ok(directions.pipe_2_B_to_C.elevationDropM > 0);

    const contribution = body.catchmentContributions[0];
    assert.equal(contribution.status, 'complete');
    assert.ok(contribution.totalVolumeM3.value > 0);
    assert.ok(
      contribution.cells.every(
        (cell) =>
          cell.runoff.output.quality.status === 'available' &&
          cell.runoff.output.value.derivedRunoffMm > 0,
      ),
    );

    assert.equal(body.propagation.status, 'complete');
    assert.ok(body.propagation.massBalance.outfallVolumeM3 > 0);
    assert.equal(
      body.propagation.massBalance.nonOutfallTerminalVolumeM3,
      0,
    );
    assert.ok(
      Math.abs(body.propagation.massBalance.differenceM3) < 1e-9,
    );

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('synthetic-fixture'), false);
    assert.equal(serialized.includes('mineral'), false);
    assert.equal(serialized.includes('waterScore'), false);
  },
);
