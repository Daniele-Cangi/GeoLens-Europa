const test = require('node:test');
const assert = require('node:assert/strict');
const { cellArea, gridDisk } = require('h3-js');

const {
  composeConditionedSurfaceRunoff,
  MAX_CONDITIONED_RUNOFF_H3_CELLS,
} = require('../dist');
const {
  syntheticFixtureEvidence,
  unavailableEvidence,
} = require('../../evidence/dist');

const outletH3 = '8d19695222b477f';
const referenceTime = new Date('2026-08-20T00:00:00.000Z');
const derivedAt = '2026-08-23T12:00:00.000Z';
const rainfallTemporal = {
  windowStart: '2026-08-19T00:00:00.000Z',
  windowEnd: referenceTime.toISOString(),
  acquiredAt: derivedAt,
};

function fixtureEvidence(value, options) {
  return syntheticFixtureEvidence(value, {
    fixtureId: options.fixtureId,
    unit: options.unit,
    spatial: {
      h3: options.h3,
      lat: options.lat,
      lon: options.lon,
      sourceResolution: options.sourceResolution,
    },
    temporal: options.temporal || { acquiredAt: derivedAt },
  });
}

function conditionedProxy() {
  const h3Indices = gridDisk(outletH3, 7).slice(0, 120);
  const cells = Object.fromEntries(
    [...h3Indices].reverse().map((h3) => [
      h3,
      {
        h3,
        representedAreaM2: cellArea(h3, 'm2'),
        contributesToConditionedOutfall: true,
        pathH3Indices:
          h3 === outletH3 ? [outletH3] : [h3, outletH3],
      },
    ]),
  );
  const areaM2 = h3Indices.reduce(
    (sum, h3) => sum + cellArea(h3, 'm2'),
    0,
  );

  return {
    id: 'fixture-conditioned-surface',
    modelVersion: 'bounded-bgt-ahn-priority-flood-v0.1.0',
    status: 'synthetic_fixture',
    outfallAttachment: {
      nodeId: 'waternet:fixture-outfall',
      h3: outletH3,
      position: {
        lat: 52.3386,
        lon: 4.8986,
      },
      observed: false,
      eligibleForSewerPropagation: false,
    },
    contributingAreaM2: fixtureEvidence(areaM2, {
      fixtureId: 'conditioned-area',
      h3: outletH3,
      unit: 'm2',
    }),
    contributingH3Indices: [...h3Indices].reverse(),
    cells,
  };
}

function environmentalComposer(options = {}) {
  return {
    requests: [],
    async compose(request) {
      this.requests.push(request);
      const cells = {};
      const issues = [];

      for (const h3 of request.catchmentH3Indices) {
        const rainfall24hMm = options.missingRainfall
          ? unavailableEvidence(
              'missing',
              'fixture rainfall observation unavailable',
              {
                unit: 'mm',
                spatial: {
                  h3,
                  sourceResolution: '0.1 degree',
                },
                temporal: rainfallTemporal,
                provenance: {
                  provider: 'synthetic-fixture',
                  dataset: 'fixture:imerg-missing',
                },
              },
            )
          : fixtureEvidence(12, {
              fixtureId: 'imerg:' + h3,
              h3,
              unit: 'mm',
              sourceResolution: '0.1 degree',
              temporal: rainfallTemporal,
            });
        if (rainfall24hMm.value === null) {
          issues.push({
            h3,
            layer: 'rainfall24h_mm',
            status: rainfall24hMm.quality.status,
            reason: rainfall24hMm.quality.missingReason,
          });
        }
        cells[h3] = {
          h3,
          roles: ['catchment'],
          rainfall24hMm,
          elevationM: fixtureEvidence(1, {
            fixtureId: 'glo30-elevation:' + h3,
            h3,
            unit: 'm',
            sourceResolution: '1 arc-second',
          }),
          slopeDeg: fixtureEvidence(3, {
            fixtureId: 'glo30-slope:' + h3,
            h3,
            unit: 'deg',
            sourceResolution: '1 arc-second',
          }),
          landCoverClass: fixtureEvidence(112, {
            fixtureId: 'clc:' + h3,
            h3,
            unit: 'CLC class code',
            sourceResolution: '100 m',
          }),
        };
      }

      const node = request.nodes[0];
      return {
        status: issues.length === 0 ? 'complete' : 'incomplete',
        referenceTime: request.referenceTime.toISOString(),
        acquiredAt: derivedAt,
        sources: {
          rainfall: {
            provider: 'synthetic-fixture',
            dataset: 'fixture:imerg',
            acquiredAt: derivedAt,
            status: 'responded',
            referenceTime: request.referenceTime.toISOString(),
            window24h: null,
          },
          terrain: {
            provider: 'synthetic-fixture',
            dataset: 'fixture:glo30',
            acquiredAt: derivedAt,
            status: 'responded',
          },
          landCover: {
            provider: 'synthetic-fixture',
            dataset: 'fixture:clc',
            acquiredAt: derivedAt,
            status: 'responded',
          },
        },
        cells,
        nodes: {
          [node.id]: {
            ...node,
            elevationM: fixtureEvidence(1, {
              fixtureId: 'glo30-node:' + node.id,
              h3: node.h3,
              lat: node.lat,
              lon: node.lon,
              unit: 'm',
              sourceResolution: '1 arc-second',
            }),
          },
        },
        issues,
      };
    },
  };
}

test('conditioned runoff selects a deterministic bounded 100-cell physical source term', async () => {
  const proxy = conditionedProxy();
  const composer = environmentalComposer();
  const result = await composeConditionedSurfaceRunoff(
    proxy,
    composer,
    { referenceTime, derivedAt },
  );

  assert.equal(result.status, 'complete');
  assert.equal(
    result.selection.maximumCellCount,
    MAX_CONDITIONED_RUNOFF_H3_CELLS,
  );
  assert.equal(result.selection.candidateCellCount, 120);
  assert.equal(result.selection.selectedCellCount, 100);
  assert.equal(
    result.selection.coversAllConditionedContributingCells,
    false,
  );
  assert.equal(
    result.selection.selectedH3Indices[0],
    outletH3,
  );
  assert.deepEqual(
    composer.requests[0].catchmentH3Indices,
    result.selection.selectedH3Indices,
  );
  assert.equal(
    composer.requests[0].nodes[0].id,
    proxy.outfallAttachment.nodeId,
  );
  assert.equal(
    result.environmental.cells[outletH3]
      .rainfall24hMm.spatial.sourceResolution,
    '0.1 degree',
  );
  assert.equal(
    result.environmental.cells[outletH3]
      .landCoverClass.spatial.sourceResolution,
    '100 m',
  );
  assert.equal(
    result.catchmentContribution.cells[0]
      .runoff.output.value.derivedRunoffMm,
    9.72,
  );
  assert.ok(
    result.catchmentContribution.totalVolumeM3.value > 0,
  );
  assert.equal(
    result.catchmentContribution.totalVolumeM3.quality.status,
    'synthetic_fixture',
  );
  assert.equal(
    result.surfaceDefinition.observedSewerCatchment,
    false,
  );
});

test('missing IMERG remains missing through conditioned runoff aggregation', async () => {
  const result = await composeConditionedSurfaceRunoff(
    conditionedProxy(),
    environmentalComposer({ missingRainfall: true }),
    { referenceTime, derivedAt },
  );

  assert.equal(result.status, 'incomplete');
  assert.equal(
    result.catchmentContribution.totalVolumeM3.value,
    null,
  );
  assert.equal(
    result.catchmentContribution.totalVolumeM3.quality.status,
    'missing',
  );
  assert.equal(
    result.catchmentContribution.partialAvailableVolumeM3,
    0,
  );
  assert.ok(
    result.catchmentContribution.cells.every(
      (cell) =>
        cell.runoff.output.value === null &&
        cell.volumeM3.value === null,
    ),
  );
});

test('runoff composition rejects an incomplete conditioned area before provider calls', async () => {
  const proxy = conditionedProxy();
  proxy.contributingAreaM2 = unavailableEvidence(
    'missing',
    'conditioned area incomplete',
    {
      unit: 'm2',
      spatial: { h3: outletH3 },
      temporal: { acquiredAt: derivedAt },
      provenance: {
        provider: 'geolens-core',
        dataset: 'fixture:incomplete-conditioned-area',
      },
    },
  );
  const composer = environmentalComposer();

  await assert.rejects(
    () =>
      composeConditionedSurfaceRunoff(proxy, composer, {
        referenceTime,
        derivedAt,
      }),
    /complete contributing-area value/,
  );
  assert.equal(composer.requests.length, 0);
});