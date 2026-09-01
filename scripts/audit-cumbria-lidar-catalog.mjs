import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

const serviceUrl = new URL(
  'https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/LIDAR_Tiles_Catalogues/FeatureServer/0/query',
);
serviceUrl.searchParams.set('where', '1=1');
serviceUrl.searchParams.set('geometry', manifest.aoi.bounds.join(','));
serviceUrl.searchParams.set('geometryType', 'esriGeometryEnvelope');
serviceUrl.searchParams.set('inSR', '4326');
serviceUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
serviceUrl.searchParams.set(
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
serviceUrl.searchParams.set('returnGeometry', 'false');
serviceUrl.searchParams.set('resultRecordCount', '2000');
serviceUrl.searchParams.set('f', 'json');

const response = await fetch(serviceUrl, {
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  throw new Error(`EA LiDAR catalogue returned HTTP ${response.status}`);
}
const payload = await response.json();
if (payload.error) {
  throw new Error(`EA LiDAR catalogue error ${payload.error.code}`);
}
if (payload.exceededTransferLimit === true) {
  throw new Error('EA LiDAR catalogue response exceeded its transfer limit');
}

const sourceRows = (payload.features ?? []).map((feature) => feature.attributes);
if (sourceRows.length === 0) {
  throw new Error('EA LiDAR catalogue returned no rows for the bounded AOI');
}
const cutoff = Date.parse(manifest.event.windowStart);
const preEventRows = sourceRows.filter(
  (row) =>
    Number.isFinite(row.ed_flown) &&
    row.ed_flown < cutoff &&
    typeof row.os_ref === 'string' &&
    row.os_ref.length > 0,
);

const allGridRefs = [...new Set(sourceRows.map((row) => row.os_ref))]
  .filter((value) => typeof value === 'string' && value.length > 0)
  .sort();
const grouped = Map.groupBy(preEventRows, (row) => row.os_ref);
const selected = [...grouped.entries()]
  .map(([gridRef, rows]) => {
    const row = [...rows].sort(
      (left, right) =>
        right.ed_flown - left.ed_flown ||
        left.pt_spacing - right.pt_spacing ||
        left.objectid - right.objectid,
    )[0];
    return {
      gridRef,
      objectId: row.objectid,
      surveyId: row.polygon_id,
      filename: row.filename,
      filepath: row.filepath,
      surveyStart: isoDate(row.sd_flown),
      surveyEnd: isoDate(row.ed_flown),
      pointSpacingMetres: row.pt_spacing,
      transform: row.transform,
      geoid: row.geoid,
    };
  })
  .sort((left, right) => left.gridRef.localeCompare(right.gridRef));

const selectedGridRefs = new Set(selected.map((row) => row.gridRef));
const gridRefsWithoutPreEvent = allGridRefs.filter(
  (gridRef) => !selectedGridRefs.has(gridRef),
);
const surveyGroups = Map.groupBy(selected, (row) => row.surveyId);
const selectedBySurvey = [...surveyGroups.entries()]
  .map(([surveyId, rows]) => ({
    surveyId,
    gridRefs: rows.length,
    surveyStart: rows.map((row) => row.surveyStart).sort()[0],
    surveyEnd: rows.map((row) => row.surveyEnd).sort().at(-1),
    minimumPointSpacingMetres: Math.min(
      ...rows.map((row) => row.pointSpacingMetres),
    ),
    maximumPointSpacingMetres: Math.max(
      ...rows.map((row) => row.pointSpacingMetres),
    ),
  }))
  .sort(
    (left, right) =>
      right.gridRefs - left.gridRefs ||
      left.surveyId.localeCompare(right.surveyId),
  );

const canonicalSelection = JSON.stringify(selected);
const selectionSha256 = createHash('sha256')
  .update(canonicalSelection)
  .digest('hex');
const archiveNames = selected.map((row) => row.filename.toLowerCase());
const selectedFilenameKinds = {
  laz: archiveNames.filter((name) => name.endsWith('.laz')).length,
  tif: archiveNames.filter(
    (name) => name.endsWith('.tif') || name.endsWith('.tiff'),
  ).length,
  zip: archiveNames.filter((name) => name.endsWith('.zip')).length,
};

const searchEndpoint =
  'https://environment.data.gov.uk/backend/catalog/api/tiles/collections/survey/search';
const searchGeometry = boundsPolygon(manifest.aoi.bounds);
const searchResponse = await fetchJsonBounded(
  searchEndpoint,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/geo+json' },
    body: JSON.stringify(searchGeometry),
    signal: AbortSignal.timeout(30_000),
  },
  1_048_576,
);
const searchResults = Array.isArray(searchResponse.results)
  ? searchResponse.results
  : [];
if (searchResponse.count !== searchResults.length) {
  throw new Error('EA survey search count does not match returned results');
}
const timeStampedDtmResults = searchResults.filter(
  (result) => result.product?.id === 'lidar_tiles_dtm',
);
if (timeStampedDtmResults.length === 0) {
  throw new Error('EA survey search returned no time-stamped DTM identities');
}

const mappingRule =
  'map each selected 1 km OS grid reference to its containing 5 km tile; require the selected survey-end year; choose the smallest advertised DTM raster resolution; then URI';
const materializationRule =
  'accept raster pixels only inside the selected 1 km grid references mapped to each archive; the containing 5 km archive does not make every pixel event-valid';
const mapped = selected.map((row) => {
  const tile = fiveKilometreTile(row.gridRef);
  const year = row.surveyEnd.slice(0, 4);
  const candidates = timeStampedDtmResults
    .filter(
      (result) => result.tile?.id === tile && result.year?.id === year,
    )
    .sort(
      (left, right) =>
        Number(left.resolution?.id) - Number(right.resolution?.id) ||
        String(left.uri).localeCompare(String(right.uri)),
    );
  if (candidates.length === 0) {
    return {
      gridRef: row.gridRef,
      objectId: row.objectId,
      surveyId: row.surveyId,
      surveyEnd: row.surveyEnd,
      pointSpacingMetres: row.pointSpacingMetres,
      archive: null,
    };
  }
  const candidate = candidates[0];
  return {
    gridRef: row.gridRef,
    objectId: row.objectId,
    surveyId: row.surveyId,
    surveyEnd: row.surveyEnd,
    pointSpacingMetres: row.pointSpacingMetres,
    archive: {
      product: candidate.product.id,
      year: candidate.year.id,
      resolution: candidate.resolution.id,
      tile: candidate.tile.id,
      uri: candidate.uri,
    },
  };
});
const unmappedSelectedGridRefs = mapped
  .filter((row) => row.archive === null)
  .map((row) => row.gridRef);
const mappedRows = mapped.filter((row) => row.archive !== null);
const archiveGroups = Map.groupBy(mappedRows, (row) => row.archive.uri);
const archiveIdentities = [...archiveGroups.values()]
  .map((rows) => ({
    ...rows[0].archive,
    mappedGridRefs: rows.length,
  }))
  .sort(
    (left, right) =>
      left.tile.localeCompare(right.tile) ||
      left.year.localeCompare(right.year) ||
      Number(left.resolution) - Number(right.resolution) ||
      left.uri.localeCompare(right.uri),
  );
const mappingSha256 = sha256Json(mapped);
const archiveIdentitySha256 = sha256Json(archiveIdentities);
const sampleArchive = archiveIdentities.find(
  (archive) =>
    archive.product === 'lidar_tiles_dtm' &&
    archive.year === '2009' &&
    archive.resolution === '1' &&
    archive.tile === 'NY3555',
);
if (!sampleArchive) {
  throw new Error('EA survey search lost the frozen NY3555 sample archive');
}
const sampleArchiveProbe = await probeArchiveHeaders(
  `${sampleArchive.uri}?subscription-key=dspui`,
);
const downloadMapping = {
  searchEndpoint,
  searchContentType: 'application/geo+json',
  requestBounds: manifest.aoi.bounds,
  searchResultCount: searchResults.length,
  productId: 'lidar_tiles_dtm',
  productResultCount: timeStampedDtmResults.length,
  mappingRule,
  materializationRule,
  mappedPreEventGridRefs: mappedRows.length,
  unmappedSelectedGridRefs,
  archiveIdentityCount: archiveIdentities.length,
  archiveIdentities,
  mappingSha256,
  archiveIdentitySha256,
  sampleArchiveProbe,
};
const acquisitionState =
  mappedRows.length === selected.length &&
  archiveIdentities.length > 0 &&
  gridRefsWithoutPreEvent.length > 0
    ? 'ready_with_explicit_gaps'
    : 'blocked';
const lidarManifest = manifest.datasets.find(
  (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
).lidarCatalogAudit;
const pinnedValues = {
  queryUrl: serviceUrl.toString(),
  selectionRule:
    'per OS grid reference: latest surveyEnd before event window; then smallest point spacing; then smallest objectId',
  sourceRows: sourceRows.length,
  intersectingGridRefs: allGridRefs.length,
  preEventRows: preEventRows.length,
  selectedPreEventGridRefs: selected.length,
  gridRefsWithoutPreEvent,
  selectionSha256,
  selectedFilenameKinds,
  downloadMapping,
  acquisitionState,
  reason:
    'All 231 selected pre-event source rows map to 30 official 5 km DTM archive identities. Ten grid references still have no pre-event source record and must remain missing; no raster archive has been downloaded by this audit.',
};
if (process.argv.includes('--print-computed')) {
  console.log(JSON.stringify(pinnedValues, null, 2));
  process.exit(0);
}
if (JSON.stringify(pinnedValues) !== JSON.stringify(lidarManifest)) {
  throw new Error('Live EA LiDAR catalogue or download mapping drifted from manifest v0.8.0');
}

console.log(
  JSON.stringify(
    {
      auditId: 'cumbria-2015-pre-event-lidar-download-mapping-v0',
      checkedAt: new Date().toISOString(),
      service: serviceUrl.toString(),
      selectionRule: pinnedValues.selectionRule,
      sourceRows: sourceRows.length,
      intersectingGridRefs: allGridRefs.length,
      preEventRows: preEventRows.length,
      selectedPreEventGridRefs: selected.length,
      gridRefsWithoutPreEvent,
      selectedBySurvey,
      selectionSha256,
      selectedFilenameKinds,
      downloadMapping,
      acquisitionState,
      reason: pinnedValues.reason,
      manifestMatch: true,
    },
    null,
    2,
  ),
);

function isoDate(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    throw new Error('EA LiDAR catalogue contains an invalid survey date');
  }
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function boundsPolygon([west, south, east, north]) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

function fiveKilometreTile(gridRef) {
  const match = /^([A-Z]{2})(\d{2})(\d{2})$/.exec(gridRef);
  if (!match) {
    throw new Error(`Unsupported OS grid reference ${gridRef}`);
  }
  const easting = Math.floor(Number(match[2]) / 5) * 5;
  const northing = Math.floor(Number(match[3]) / 5) * 5;
  return `${match[1]}${String(easting).padStart(2, '0')}${String(northing).padStart(2, '0')}`;
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function fetchJsonBounded(url, init, byteLimit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`EA survey search returned HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > byteLimit) {
    await response.body?.cancel();
    throw new Error(`EA survey search declared more than ${byteLimit} bytes`);
  }
  if (!response.body) {
    throw new Error('EA survey search returned no response body');
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
      throw new Error(`EA survey search exceeded ${byteLimit} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text);
}

async function probeArchiveHeaders(url) {
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-0' },
    redirect: 'manual',
    signal: AbortSignal.timeout(90_000),
  });
  const result = {
    uri: url.replace('?subscription-key=dspui', ''),
    httpStatus: response.status,
    contentType: response.headers.get('content-type'),
    contentDisposition: response.headers.get('content-disposition'),
    rangeHonored: response.status === 206,
    archiveBytesRead: 0,
  };
  await response.body?.cancel();
  if (
    result.httpStatus !== 200 ||
    result.contentType !== 'application/zip' ||
    !result.contentDisposition?.includes('.zip')
  ) {
    throw new Error('EA survey sample archive did not expose a ZIP response');
  }
  return result;
}
