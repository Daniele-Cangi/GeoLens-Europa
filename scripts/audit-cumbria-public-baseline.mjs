import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import proj4 from 'proj4';

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

const eventStart = Date.parse(manifest.event.windowStart);
const projectedBounds = [332000, 556000, 340000, 563000];
const sheepmount = {
  datasetId: 'ea-hydrology-sheepmount-flow',
  stationReference: '765512',
  wgs84: [-2.951874, 54.905047],
  bng: [339063, 557118],
};
const oldSandsfield = {
  sourceDatasetId: 'cumberland-carlisle-sfra-2011-main-and-appendix-c',
  wgs84: [-3.044369, 54.945463],
  bng: [333200, 561700],
};

proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs',
);

const requiredGridRefs = gridReferencesForBounds(projectedBounds);
const requiredGridRefSet = new Set(requiredGridRefs);
const catalogueUrl = new URL(
  'https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/LIDAR_Tiles_Catalogues/FeatureServer/0/query',
);
catalogueUrl.searchParams.set('where', '1=1');
catalogueUrl.searchParams.set('geometry', projectedBounds.join(','));
catalogueUrl.searchParams.set('geometryType', 'esriGeometryEnvelope');
catalogueUrl.searchParams.set('inSR', '27700');
catalogueUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
catalogueUrl.searchParams.set(
  'outFields',
  [
    'objectid',
    'filename',
    'os_ref',
    'sd_flown',
    'ed_flown',
    'pt_spacing',
    'transform',
    'geoid',
    'filepath',
    'polygon_id',
  ].join(','),
);
catalogueUrl.searchParams.set('returnGeometry', 'false');
catalogueUrl.searchParams.set('resultRecordCount', '2000');
catalogueUrl.searchParams.set('f', 'json');

const cataloguePayload = await fetchJsonBounded(
  catalogueUrl,
  { signal: AbortSignal.timeout(30_000) },
  2 * 1024 * 1024,
);
if (cataloguePayload.error) {
  throw new Error(`EA LiDAR catalogue error ${cataloguePayload.error.code}`);
}
if (cataloguePayload.exceededTransferLimit === true) {
  throw new Error('EA LiDAR catalogue response exceeded its transfer limit');
}

const sourceRows = (cataloguePayload.features ?? [])
  .map((feature) => feature.attributes)
  .filter((row) => requiredGridRefSet.has(row.os_ref));
const grouped = Map.groupBy(
  sourceRows.filter(
    (row) => Number.isFinite(row.ed_flown) && row.ed_flown < eventStart,
  ),
  (row) => row.os_ref,
);
const selectedRows = requiredGridRefs
  .flatMap((gridRef) => {
    const rows = grouped.get(gridRef) ?? [];
    const selected = [...rows].sort(
      (left, right) =>
        right.ed_flown - left.ed_flown ||
        left.pt_spacing - right.pt_spacing ||
        left.objectid - right.objectid,
    )[0];
    return selected
      ? [
          {
            gridRef,
            objectId: selected.objectid,
            surveyId: selected.polygon_id,
            surveyStart: isoDate(selected.sd_flown),
            surveyEnd: isoDate(selected.ed_flown),
            pointSpacingMetres: selected.pt_spacing,
          },
        ]
      : [];
  })
  .sort((left, right) => left.gridRef.localeCompare(right.gridRef));
const selectedGridRefSet = new Set(selectedRows.map((row) => row.gridRef));
const missingGridRefs = requiredGridRefs.filter(
  (gridRef) => !selectedGridRefSet.has(gridRef),
);

const searchEndpoint =
  'https://environment.data.gov.uk/backend/catalog/api/tiles/collections/survey/search';
const wgs84Polygon = projectedBoundsPolygon(projectedBounds);
const searchPayload = await fetchJsonBounded(
  searchEndpoint,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/geo+json' },
    body: JSON.stringify(wgs84Polygon),
    signal: AbortSignal.timeout(30_000),
  },
  1024 * 1024,
);
const searchResults = Array.isArray(searchPayload.results)
  ? searchPayload.results
  : [];
if (searchPayload.count !== searchResults.length) {
  throw new Error('EA survey search count does not match returned results');
}
const dtmResults = searchResults.filter(
  (result) => result.product?.id === 'lidar_tiles_dtm',
);
if (dtmResults.length === 0) {
  throw new Error('EA survey search returned no time-stamped DTM identities');
}

const mappedRows = selectedRows.map((row) => {
  const tile = fiveKilometreTile(row.gridRef);
  const year = row.surveyEnd.slice(0, 4);
  const candidates = dtmResults
    .filter(
      (result) => result.tile?.id === tile && result.year?.id === year,
    )
    .sort(
      (left, right) =>
        Number(left.resolution?.id) - Number(right.resolution?.id) ||
        String(left.uri).localeCompare(String(right.uri)),
    );
  const selected = candidates[0];
  if (!selected) {
    throw new Error(
      `No DTM archive maps ${row.gridRef} for survey year ${year}`,
    );
  }
  return {
    ...row,
    archive: {
      product: selected.product.id,
      year: selected.year.id,
      resolutionMetres: Number(selected.resolution.id),
      tile: selected.tile.id,
      uri: selected.uri,
    },
  };
});

const archiveGroups = Map.groupBy(mappedRows, (row) => row.archive.uri);
const archiveSelections = [...archiveGroups.values()]
  .map((rows) => ({
    ...rows[0].archive,
    gridRefs: rows.map((row) => row.gridRef).sort(),
  }))
  .sort(
    (left, right) =>
      left.tile.localeCompare(right.tile) ||
      left.year.localeCompare(right.year) ||
      left.resolutionMetres - right.resolutionMetres ||
      left.uri.localeCompare(right.uri),
  );
const resolutionGridRefCounts = Object.fromEntries(
  [...Map.groupBy(mappedRows, (row) => String(row.archive.resolutionMetres))]
    .map(([resolution, rows]) => [resolution, rows.length])
    .sort(([left], [right]) => Number(left) - Number(right)),
);
const retainedRasterCells = mappedRows.reduce(
  (sum, row) =>
    sum + 1_000_000 / row.archive.resolutionMetres ** 2,
  0,
);
const fullArchiveRasterCells = archiveSelections.reduce(
  (sum, archive) =>
    sum + 25_000_000 / archive.resolutionMetres ** 2,
  0,
);

const protocolWithoutHash = {
  id: 'cumbria-sheepmount-old-sandsfield-public-baseline-v0',
  version: '0.1.0',
  state: 'domain_frozen_terrain_acquisition_ready',
  frozenOn: '2026-09-02',
  claimBoundary:
    'experimental public-data downstream-reach baseline; not the official Carlisle hydraulic model and not a validated flood forecast',
  selectionIsolation: {
    observedFloodGeometryLoaded: false,
    observedFloodGeometryUsed: false,
    postEventModelUsed: false,
    selectionInputs: [
      sheepmount.datasetId,
      oldSandsfield.sourceDatasetId,
      'ea-lidar-dtm-time-stamped',
    ],
  },
  reach: {
    watercourse: 'River Eden',
    upstreamAnchor: {
      role: 'candidate_inflow_observation_location',
      ...sheepmount,
    },
    downstreamAnchor: {
      role: 'historical_model_limit_without_boundary_values',
      ...oldSandsfield,
    },
  },
  domain: {
    horizontalCrs: 'EPSG:27700',
    verticalDatum: 'Ordnance Datum Newlyn',
    bounds: projectedBounds,
    widthMetres: projectedBounds[2] - projectedBounds[0],
    heightMetres: projectedBounds[3] - projectedBounds[1],
    areaSquareMetres:
      (projectedBounds[2] - projectedBounds[0]) *
      (projectedBounds[3] - projectedBounds[1]),
    wgs84Boundary: wgs84Polygon.coordinates[0],
    selectionRule:
      'axis-aligned BNG envelope containing Sheepmount and Old Sandsfield, rounded outward to 1 km grid lines with at least approximately 1 km lateral and terminal margin',
    observedGeometryMayDefineDomain: false,
    h3MayDefineComputationGrid: false,
    solverGridFrozen: false,
  },
  terrainAcquisition: {
    datasetId: 'ea-lidar-dtm-time-stamped',
    selectionRule:
      'for each intersecting 1 km OS grid reference: latest survey end before 2015-12-04, then smallest point spacing, then smallest object id; map to matching official time-stamped DTM archive',
    requiredGridRefs,
    coveredGridRefs: mappedRows.map((row) => row.gridRef),
    missingGridRefs,
    missingPolicy: 'remain_explicit_nodata_and_excluded_from_valid_prediction',
    catalogueUrl: catalogueUrl.toString(),
    catalogueSelectionSha256: sha256Json(selectedRows),
    searchEndpoint,
    archiveSelections,
    archiveSelectionSha256: sha256Json(archiveSelections),
    archiveCount: archiveSelections.length,
    budget: {
      decodedBytesPerCell: 4,
      resolutionGridRefCounts,
      retainedRasterCells,
      estimatedRetainedDecodedBytes: retainedRasterCells * 4,
      fullArchiveRasterCells,
      estimatedFullArchiveDecodedBytes: fullArchiveRasterCells * 4,
      estimateExcludesArchiveAndFormatOverhead: true,
    },
    archiveBytesDownloaded: 0,
    rasterBytesWritten: 0,
  },
  execution: {
    terrainDownloadAllowed: true,
    archiveConcurrency: 1,
    solverExecutionAllowed: false,
    blockers: [
      'terrain_not_materialized',
      'channel_and_boundary_placement_not_frozen',
      'downstream_boundary_assumption_not_frozen',
      'initial_state_and_warmup_not_frozen',
      'solver_grid_and_timestep_not_frozen',
      'roughness_parameterization_not_frozen',
    ],
  },
};
const computedProtocol = {
  ...protocolWithoutHash,
  protocolSha256: sha256Json(protocolWithoutHash),
};

if (process.argv.includes('--print-computed')) {
  console.log(JSON.stringify(computedProtocol, null, 2));
  process.exit(0);
}

if (
  JSON.stringify(computedProtocol) !==
  JSON.stringify(manifest.publicBaselineProtocol)
) {
  throw new Error(
    `Live public-baseline selection drifted from manifest ${manifest.manifestVersion}`,
  );
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      manifestVersion: manifest.manifestVersion,
      manifestMatch: true,
      networkRequests: 2,
      filesWritten: 0,
      ...computedProtocol,
    },
    null,
    2,
  ),
);

function gridReferencesForBounds([west, south, east, north]) {
  if (
    [west, south, east, north].some((value) => value % 1000 !== 0) ||
    west >= east ||
    south >= north ||
    west < 300000 ||
    east > 400000 ||
    south < 500000 ||
    north > 600000
  ) {
    throw new Error('Public baseline bounds must be 1 km-aligned inside NY');
  }
  const refs = [];
  for (let northing = south; northing < north; northing += 1000) {
    for (let easting = west; easting < east; easting += 1000) {
      refs.push(
        `NY${String((easting - 300000) / 1000).padStart(2, '0')}${String(
          (northing - 500000) / 1000,
        ).padStart(2, '0')}`,
      );
    }
  }
  return refs.sort();
}

function projectedBoundsPolygon([west, south, east, north]) {
  const projectedRing = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  return {
    type: 'Polygon',
    coordinates: [
      projectedRing.map((coordinate) =>
        proj4('EPSG:27700', 'EPSG:4326', coordinate).map(roundCoordinate),
      ),
    ],
  };
}

function roundCoordinate(value) {
  return Number(value.toFixed(9));
}

function fiveKilometreTile(gridRef) {
  const match = /^NY(\d{2})(\d{2})$/.exec(gridRef);
  if (!match) {
    throw new Error(`Unsupported OS grid reference ${gridRef}`);
  }
  const easting = Math.floor(Number(match[1]) / 5) * 5;
  const northing = Math.floor(Number(match[2]) / 5) * 5;
  return `NY${String(easting).padStart(2, '0')}${String(northing).padStart(2, '0')}`;
}

function isoDate(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    throw new Error('EA LiDAR catalogue contains an invalid survey date');
  }
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function fetchJsonBounded(url, init, byteLimit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`EA public-data endpoint returned HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > byteLimit) {
    await response.body?.cancel();
    throw new Error(`EA public-data endpoint declared more than ${byteLimit} bytes`);
  }
  if (!response.body) {
    throw new Error('EA public-data endpoint returned no response body');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > byteLimit) {
      await reader.cancel();
      throw new Error(`EA public-data endpoint exceeded ${byteLimit} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
