import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cellToBoundary } from 'h3-js';
import proj4 from 'proj4';

import {
  assertCumbriaAccessManifest,
  composeSpatialEvidenceIndexCell,
  SPATIAL_EVIDENCE_INDEX_VERSION,
  syntheticFixtureEvidence,
} from '../packages/evidence/dist/index.js';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  readFileSync(
    path.join(
      repositoryRoot,
      'tests',
      'ground-truth',
      'cumbria-2015',
      'manifest.json',
    ),
    'utf8',
  ),
);

assertCumbriaAccessManifest(manifest);

const composition = manifest.spatialGridProtocol.evidenceIndex.composition;
const fixture = composition.verificationFixture;
if (composition.implementationVersion !== SPATIAL_EVIDENCE_INDEX_VERSION) {
  throw new Error('Cumbria composition manifest and implementation versions drifted');
}

proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs',
);
const targetCellAreaM2 = projectedH3AreaM2(fixture.h3);
const staticTemporal = {
  acquiredAt: fixture.composedAt,
};
const precipitationTemporal = {
  windowStart: fixture.windowStart,
  windowEnd: fixture.windowEnd,
  acquiredAt: fixture.composedAt,
};

function fixtureEvidence(value, unit, sourceResolution, sourceId, temporal) {
  return syntheticFixtureEvidence(value, {
    fixtureId: `${fixture.id}:${sourceId}`,
    unit,
    spatial: { sourceResolution },
    temporal,
    transformation: 'single-cell deterministic composition fixture',
    transformationVersion: '1',
    sourceMetadata: { nativeSourceId: sourceId },
  });
}

const result = composeSpatialEvidenceIndexCell({
  h3: fixture.h3,
  composedAt: fixture.composedAt,
  mode: 'synthetic_fixture',
  fixtureId: fixture.id,
  areaReference: {
    horizontalCrs: composition.areaReferenceCrs,
    unit: 'm2',
    measurementMethod: composition.areaMeasurementMethod,
    targetCellAreaM2,
  },
  precipitationWindow: {
    start: fixture.windowStart,
    end: fixture.windowEnd,
  },
  terrain: [
    {
      id: 'dtm-native-cell',
      intersectionAreaM2: targetCellAreaM2,
      sourceResolutionMetres: fixture.terrainResolutionM,
      evidence: fixtureEvidence(
        fixture.terrainElevationM,
        'm',
        `${fixture.terrainResolutionM} m native DTM`,
        'dtm-native-cell',
        staticTemporal,
      ),
    },
  ],
  landCover: [
    {
      id: 'clc-native-cell',
      intersectionAreaM2: targetCellAreaM2,
      evidence: fixtureEvidence(
        fixture.landCoverClass,
        'CLC class code',
        '100 m raster; 25 ha minimum mapping unit',
        'clc-native-cell',
        staticTemporal,
      ),
    },
  ],
  precipitation: [
    {
      id: 'imerg-native-cell',
      intersectionAreaM2: targetCellAreaM2,
      evidence: fixtureEvidence(
        fixture.rainfallMm,
        'mm',
        'approximately 0.1 degree; 30 minutes',
        'imerg-native-cell',
        precipitationTemporal,
      ),
    },
  ],
});

const resultSha256 = createHash('sha256')
  .update(JSON.stringify(result))
  .digest('hex');

function projectedH3AreaM2(cell) {
  const points = cellToBoundary(cell).map(([lat, lon]) =>
    proj4('EPSG:4326', 'EPSG:27700', [lon, lat]),
  );
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [leftX, leftY] = points[index];
    const [rightX, rightY] = points[(index + 1) % points.length];
    twiceArea += leftX * rightY - rightX * leftY;
  }
  return Math.abs(twiceArea) / 2;
}

if (resultSha256 !== fixture.expectedResultSha256) {
  throw new Error(
    `Cumbria spatial composition fixture identity drifted: ${resultSha256}`,
  );
}

console.log(
  JSON.stringify(
    {
      verificationId: fixture.id,
      mode: 'dry_run',
      dataMode: result.mode,
      networkRequests: 0,
      filesWritten: 0,
      implementationVersion: result.version,
      resultSha256,
      result,
    },
    null,
    2,
  ),
);
