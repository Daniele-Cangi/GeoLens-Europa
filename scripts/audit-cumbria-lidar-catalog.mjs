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
const acquisitionState =
  gridRefsWithoutPreEvent.length === 0 &&
  (selectedFilenameKinds.tif > 0 || selectedFilenameKinds.zip > 0)
    ? 'eligible'
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
  acquisitionState,
  reason:
    'Pre-event coverage is incomplete and the DTM catalogue currently exposes LAZ-named source records rather than downloadable raster artifact identities.',
};
if (JSON.stringify(pinnedValues) !== JSON.stringify(lidarManifest)) {
  throw new Error('Live EA LiDAR catalogue selection drifted from manifest v0.2.0');
}

console.log(
  JSON.stringify(
    {
      auditId: 'cumbria-2015-pre-event-lidar-catalog-v0',
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
