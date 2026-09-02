import { createHash } from 'node:crypto';
import {
  constants,
  mkdir,
  open,
  readFile,
  rename,
  stat,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

import { fromFile } from 'geotiff';

const require = createRequire(import.meta.url);
const { assertCumbriaPublicBaselineProtocol } = require(
  '../packages/evidence/dist',
);

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const receiptFileName = 'cumbria-public-baseline-dtm-1km.receipt.json';
const minimumFreeBytes = 512 * 1024 ** 2;
const sourceRasterWidth = 2000;
const sourceRasterHeight = 2000;
const maskWidth = 1000;
const maskHeight = 1000;
const expectedNoData = -3.4028234663852886e38;

export async function runCumbriaDtmMaskMaterializer(rawArguments) {
  const options = parseArguments(rawArguments);
  const dataRoot = path.resolve(options.dataRoot);
  ensureExternalDataRoot(dataRoot, repositoryRoot);

  const manifest = JSON.parse(
    await readFile(
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
  assertCumbriaPublicBaselineProtocol(
    manifest.publicBaselineProtocol,
    manifest.datasets,
  );
  const protocol = manifest.publicBaselineProtocol;
  const sourceReceiptPath = path.join(
    dataRoot,
    'cumbria-public-baseline-dtm.receipt.json',
  );
  const sourceReceipt = JSON.parse(await readFile(sourceReceiptPath, 'utf8'));
  assertSourceReceipt(sourceReceipt, protocol);

  const inventories = [];
  for (const archive of protocol.terrainAcquisition.archiveSelections) {
    const download = sourceReceipt.downloads.find(
      (candidate) => candidate.identity === archiveIdentity(archive),
    );
    assertDownload(download, archive);
    const sourceRasters = [];
    for (const raster of download.rasters) {
      const rasterPath = resolveInside(dataRoot, raster.rasterPath);
      await assertFile(rasterPath, raster.byteLength, raster.sha256);
      const tiff = await fromFile(rasterPath);
      const image = await tiff.getImage();
      sourceRasters.push({
        ...assertSourceRaster(image, raster, archive),
        archive,
        download,
      });
    }
    inventories.push({ archive, download, sourceRasters });
  }

  const mappings = [];
  const archiveMissingGridRefs = [];
  const allSourceRasters = inventories.flatMap(
    (inventory) => inventory.sourceRasters,
  );
  for (const inventory of inventories) {
    const { archive, download, sourceRasters } = inventory;
    for (const gridRef of archive.gridRefs) {
      const bounds = boundsForGridRef(gridRef);
      const directCandidates = sourceRasters.filter((source) =>
        containsBounds(source.bbox, bounds),
      );
      const fallbackCandidates = allSourceRasters.filter(
        (source) =>
          source.archive.tile === archive.tile &&
          Number(source.archive.year) < Number(archive.year) &&
          containsBounds(source.bbox, bounds),
      );
      const candidates = [
        ...rankRasterCandidates(directCandidates, archive, gridRef),
        ...rankRasterCandidates(fallbackCandidates, archive, gridRef),
      ].filter(
        (candidate, index, values) =>
          values.findIndex(
            (other) => other.receipt.sha256 === candidate.receipt.sha256,
          ) === index,
      );
      if (candidates.length === 0) {
        archiveMissingGridRefs.push({
          gridRef,
          archiveIdentity: archiveIdentity(archive),
          status: 'out_of_coverage',
          reason:
            'neither the frozen selected archive nor an older pre-event archive already materialized for the same 5 km tile contains a source GeoTIFF covering this complete 1 km cell',
        });
        continue;
      }
      const source = candidates[0];
      mappings.push({
        gridRef,
        bounds,
        selectedArchive: archive,
        sourceArchive: source.archive,
        download: source.download,
        source,
        candidateSources: candidates,
        usedOlderArchiveFallback: directCandidates.length === 0,
        window: pixelWindow(source.bbox, bounds),
      });
    }
  }
  mappings.sort((left, right) => left.gridRef.localeCompare(right.gridRef));
  assertCompleteMapping(mappings, archiveMissingGridRefs, protocol);
  const georeferencedMissingGridRefs = [
    ...new Set([
      ...protocol.terrainAcquisition.missingGridRefs,
      ...archiveMissingGridRefs.map((missing) => missing.gridRef),
    ]),
  ].sort();

  const plan = {
    schemaVersion: 'cumbria-dtm-1km-materialization-plan-v0.1.0',
    mode: options.execute ? 'execute' : 'dry_run',
    manifestVersion: manifest.manifestVersion,
    protocolSha256: protocol.protocolSha256,
    sourceReceiptSha256: sourceReceipt.receiptSha256,
    gridMappingCount: mappings.length,
    provisionalOlderArchiveFallbackCount: mappings.filter(
      (mapping) => mapping.usedOlderArchiveFallback,
    ).length,
    archiveMissingGridRefs,
    georeferencedMissingGridRefs,
    networkRequests: 0,
    evaluationReferencesLoaded: 0,
  };
  if (!options.execute) {
    return { ...plan, filesWritten: 0, rasterBytesWritten: 0 };
  }

  const freeBytes = await freeSpaceBytes(dataRoot);
  if (freeBytes < minimumFreeBytes) {
    throw new Error(
      `Cumbria DTM masks require ${minimumFreeBytes} free bytes; only ${freeBytes} remain`,
    );
  }
  const outputDirectory = path.join(dataRoot, 'terrain', '1km', 'sha256');
  const stagingDirectory = path.join(dataRoot, 'staging');
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(stagingDirectory, { recursive: true });

  const priorReceipt = await readOptionalJson(path.join(dataRoot, receiptFileName));
  const materializedAt =
    priorReceipt?.protocolSha256 === protocol.protocolSha256 &&
    priorReceipt?.sourceReceiptSha256 === sourceReceipt.receiptSha256 &&
    typeof priorReceipt?.materializedAt === 'string'
      ? priorReceipt.materializedAt
      : new Date().toISOString();
  const masks = [];
  let filesWritten = 0;
  for (const mapping of mappings) {
    const mask = await materializeMask(
      mapping,
      dataRoot,
      outputDirectory,
      stagingDirectory,
    );
    filesWritten += Number(mask.written);
    masks.push(mask.receipt);
  }

  const emptySourceWindows = masks
    .filter((mask) => mask.output.validCellCount === 0)
    .map((mask) => ({
      gridRef: mask.gridRef,
      status: 'out_of_coverage',
      reason:
        'every eligible pre-event source window already materialized for this grid cell contains only the provider-declared NoData value',
    }));
  const effectiveMissingGridRefs = [
    ...new Set([
      ...georeferencedMissingGridRefs,
      ...emptySourceWindows.map((missing) => missing.gridRef),
    ]),
  ].sort();
  for (const mask of masks) {
    mask.quality =
      mask.output.validCellCount === 0
        ? {
            status: 'out_of_coverage',
            missingReason:
              'eligible source windows contain only the provider-declared NoData value',
          }
        : {
            status: 'available',
            missingPixelCount: mask.output.noDataCellCount,
          };
  }
  const receiptWithoutHash = {
    schemaVersion: 'cumbria-dtm-1km-receipt-v0.3.0',
    materializationId: 'cumbria-public-baseline-dtm-1km-v0',
    protocolSha256: protocol.protocolSha256,
    archiveSelectionSha256:
      protocol.terrainAcquisition.archiveSelectionSha256,
    sourceReceiptSha256: sourceReceipt.receiptSha256,
    materializedAt,
    horizontalCrs: 'EPSG:27700',
    verticalDatum: 'Ordnance Datum Newlyn',
    cellSizeMetres: 1,
    gridWidthPixels: maskWidth,
    gridHeightPixels: maskHeight,
    gridMappingRule:
      'use the frozen selected archive when it contains the complete 1 km OS grid cell; otherwise use the latest uniquely dated pre-event raster from an older archive already materialized for the same 5 km tile; then read its exact 1000 x 1000 pixel window',
    missingPolicy: protocol.terrainAcquisition.missingPolicy,
    coveredGridRefs: masks
      .filter((mask) => mask.quality.status === 'available')
      .map((mask) => mask.gridRef),
    catalogueMissingGridRefs: protocol.terrainAcquisition.missingGridRefs,
    archiveMissingGridRefs,
    emptySourceWindows,
    effectiveMissingGridRefs,
    masks,
    totals: summarizeMasks(masks, sourceReceipt),
    isolation: {
      networkRequests: 0,
      observedFloodGeometryLoaded: false,
      observedFloodGeometryUsed: false,
      postEventModelUsed: false,
      h3UsedAsSourceOrSolverGrid: false,
    },
  };
  const receipt = {
    ...receiptWithoutHash,
    receiptSha256: sha256Json(receiptWithoutHash),
  };
  if (
    priorReceipt?.schemaVersion === receipt.schemaVersion &&
    JSON.stringify(priorReceipt) !== JSON.stringify(receipt)
  ) {
    throw new Error('Existing Cumbria DTM 1 km receipt differs from verified outputs');
  }
  if (
    priorReceipt === undefined ||
    priorReceipt.schemaVersion !== receipt.schemaVersion
  ) {
    await atomicWriteJson(
      path.join(dataRoot, receiptFileName),
      receipt,
      stagingDirectory,
    );
    filesWritten += 1;
  }
  return {
    ...plan,
    effectiveMissingGridRefs,
    state: 'terrain_1km_masks_materialized',
    filesWritten,
    rasterBytesWritten: receipt.totals.physicalRasterBytes,
    receiptPath: path.join(dataRoot, receiptFileName),
    receiptSha256: receipt.receiptSha256,
    totals: receipt.totals,
  };
}

export function parseArguments(arguments_) {
  const result = { dataRoot: undefined, execute: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--data-root') {
      result.dataRoot = arguments_[index + 1];
      index += 1;
    } else if (argument === '--execute') {
      result.execute = true;
    } else {
      throw new Error(`Unknown argument ${argument}`);
    }
  }
  if (typeof result.dataRoot !== 'string' || result.dataRoot.length === 0) {
    throw new Error('--data-root is required');
  }
  return result;
}

export function ensureExternalDataRoot(dataRoot, repoRoot) {
  const relative = path.relative(repoRoot, dataRoot);
  if (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  ) {
    throw new Error('Cumbria DTM data root must stay outside the Git repository');
  }
  if (
    dataRoot
      .split(path.sep)
      .some((part) => part.toLocaleLowerCase('en-US') === 'onedrive')
  ) {
    throw new Error('Cumbria DTM data root must stay outside OneDrive');
  }
}

export function boundsForGridRef(gridRef) {
  const match = /^NY(\d{2})(\d{2})$/.exec(gridRef);
  if (!match) {
    throw new Error(`Unsupported Cumbria OS grid reference ${gridRef}`);
  }
  const west = 300000 + Number(match[1]) * 1000;
  const south = 500000 + Number(match[2]) * 1000;
  return [west, south, west + 1000, south + 1000];
}

export function containsBounds(container, candidate) {
  return (
    candidate[0] >= container[0] &&
    candidate[1] >= container[1] &&
    candidate[2] <= container[2] &&
    candidate[3] <= container[3]
  );
}

export function pixelWindow(sourceBounds, gridBounds) {
  const window = [
    gridBounds[0] - sourceBounds[0],
    sourceBounds[3] - gridBounds[3],
    gridBounds[2] - sourceBounds[0],
    sourceBounds[3] - gridBounds[1],
  ];
  if (
    window.some((value) => !Number.isInteger(value)) ||
    window[2] - window[0] !== maskWidth ||
    window[3] - window[1] !== maskHeight ||
    window[0] < 0 ||
    window[1] < 0 ||
    window[2] > sourceRasterWidth ||
    window[3] > sourceRasterHeight
  ) {
    throw new Error(`Invalid 1 km pixel window ${JSON.stringify(window)}`);
  }
  return window;
}

function assertSourceReceipt(receipt, protocol) {
  if (
    receipt.materializationId !== 'cumbria-public-baseline-dtm-v0' ||
    receipt.protocolSha256 !== protocol.protocolSha256 ||
    receipt.archiveSelectionSha256 !==
      protocol.terrainAcquisition.archiveSelectionSha256 ||
    receipt.downloads?.length !== protocol.terrainAcquisition.archiveCount
  ) {
    throw new Error('Cumbria source DTM receipt does not match the frozen protocol');
  }
  const { receiptSha256, ...withoutHash } = receipt;
  if (receiptSha256 !== sha256Json(withoutHash)) {
    throw new Error('Cumbria source DTM receipt SHA-256 does not match content');
  }
}

function assertDownload(download, archive) {
  if (
    download === undefined ||
    download.sourceUri !== archive.uri ||
    JSON.stringify(download.gridRefs) !== JSON.stringify(archive.gridRefs) ||
    !/^[a-f0-9]{64}$/.test(download.archiveSha256) ||
    !Number.isSafeInteger(download.archiveBytes) ||
    download.archiveBytes <= 0 ||
    !Array.isArray(download.rasters) ||
    download.rasters.length === 0
  ) {
    throw new Error(`Invalid source download for ${archiveIdentity(archive)}`);
  }
}

function assertSourceRaster(image, raster, archive) {
  const fileDirectory = image.getFileDirectory();
  const bbox = image.getBoundingBox();
  const resolution = image.getResolution();
  const geoKeys = image.getGeoKeys();
  const noData = image.getGDALNoData();
  if (
    image.getWidth() !== sourceRasterWidth ||
    image.getHeight() !== sourceRasterHeight ||
    image.getSamplesPerPixel() !== 1 ||
    fileDirectory.BitsPerSample?.[0] !== 32 ||
    fileDirectory.SampleFormat?.[0] !== 3 ||
    resolution[0] !== 1 ||
    resolution[1] !== -1 ||
    bbox.some((value) => !Number.isInteger(value)) ||
    noData !== expectedNoData ||
    geoKeys.GTModelTypeGeoKey !== 1 ||
    geoKeys.ProjLinearUnitsGeoKey !== 9001 ||
    !String(geoKeys.GTCitationGeoKey ?? geoKeys.PCSCitationGeoKey).includes(
      'OSGB_1936_British_National_Grid',
    )
  ) {
    throw new Error(`Unsupported DTM raster metadata in ${raster.sourceEntry}`);
  }
  const dateMatch = /_(\d{8})_(\d{8})\.tiff?$/i.exec(raster.sourceEntry);
  if (!dateMatch || dateMatch[2] >= '20151204') {
    throw new Error(`DTM raster is not demonstrably pre-event: ${raster.sourceEntry}`);
  }
  if (dateMatch[2].slice(0, 4) !== archive.year) {
    throw new Error(`DTM raster year disagrees with archive: ${raster.sourceEntry}`);
  }
  return {
    receipt: raster,
    path: raster.rasterPath,
    bbox,
    noData,
    surveyStart: compactDate(dateMatch[1]),
    surveyEnd: compactDate(dateMatch[2]),
  };
}

export function selectRasterCandidate(candidates, archive, gridRef) {
  return rankRasterCandidates(candidates, archive, gridRef)[0];
}

function rankRasterCandidates(candidates, archive, gridRef) {
  const unique = [...new Map(
    candidates.map((candidate) => [candidate.receipt.sha256, candidate]),
  ).values()];
  const ranked = unique.sort(
    (left, right) =>
      right.surveyEnd.localeCompare(left.surveyEnd) ||
      right.surveyStart.localeCompare(left.surveyStart) ||
      left.receipt.sha256.localeCompare(right.receipt.sha256),
  );
  for (let index = 1; index < ranked.length; index += 1) {
    if (
      ranked[index].surveyEnd === ranked[index - 1].surveyEnd &&
      ranked[index].surveyStart === ranked[index - 1].surveyStart
    ) {
      throw new Error(
        `${archiveIdentity(archive)} has equally dated source rasters for ${gridRef}`,
      );
    }
  }
  return ranked;
}

function assertCompleteMapping(mappings, archiveMissingGridRefs, protocol) {
  const refs = mappings.map((mapping) => mapping.gridRef);
  const accounted = [
    ...refs,
    ...archiveMissingGridRefs.map((missing) => missing.gridRef),
  ].sort();
  if (
    new Set(refs).size !== refs.length ||
    new Set(accounted).size !== accounted.length ||
    JSON.stringify(accounted) !==
      JSON.stringify([...protocol.terrainAcquisition.coveredGridRefs].sort())
  ) {
    throw new Error(
      'Georeferenced 1 km mapping and explicit archive gaps do not account for the frozen catalogue selection',
    );
  }
}

async function materializeMask(
  mapping,
  dataRoot,
  outputDirectory,
  stagingDirectory,
) {
  let selection;
  for (const source of mapping.candidateSources) {
    const sourcePath = resolveInside(dataRoot, source.path);
    const tiff = await fromFile(sourcePath);
    const image = await tiff.getImage();
    const window = pixelWindow(source.bbox, mapping.bounds);
    const values = await image.readRasters({ window, interleave: true });
    if (
      !(values instanceof Float32Array) ||
      values.length !== maskWidth * maskHeight
    ) {
      throw new Error(`Unexpected pixel representation for ${mapping.gridRef}`);
    }
    const statistics = pixelStatistics(values, source.noData);
    selection = { source, values, window, statistics };
    if (statistics.validCellCount > 0) {
      break;
    }
  }
  if (selection === undefined) {
    throw new Error(`No source window was available for ${mapping.gridRef}`);
  }
  const { source, values, window, statistics } = selection;
  const usedOlderArchiveFallback =
    archiveIdentity(source.archive) !== archiveIdentity(mapping.selectedArchive);
  const pixelSha256 = sha256Buffer(
    Buffer.from(values.buffer, values.byteOffset, values.byteLength),
  );
  const rawBytes = Buffer.from(
    values.buffer,
    values.byteOffset,
    values.byteLength,
  );
  assertLittleEndian();
  const bytes = gzipSync(rawBytes, { level: 9 });
  assertCompressedPixels(bytes, rawBytes, pixelSha256, mapping.gridRef);
  const sha256 = sha256Buffer(bytes);
  const finalPath = path.join(outputDirectory, `${sha256}.f32le.gz`);
  let written = false;
  try {
    await assertFile(finalPath, bytes.length, sha256);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    const stagingPath = path.join(stagingDirectory, `${sha256}.f32le.gz.part`);
    const handle = await open(stagingPath, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(stagingPath, finalPath);
    written = true;
  }
  return {
    written,
    receipt: {
      gridRef: mapping.gridRef,
      bounds: mapping.bounds,
      output: {
        relativePath: portablePath(finalPath, dataRoot),
        byteLength: bytes.length,
        decodedByteLength: rawBytes.length,
        sha256,
        pixelSha256,
        encoding:
          'gzip-compressed Float32 little-endian, row-major north-to-south, 1 m; georeferencing is frozen by bounds and EPSG:27700 in this receipt',
        noData: source.noData,
        ...statistics,
      },
      source: {
        selectedArchiveIdentity: archiveIdentity(mapping.selectedArchive),
        archiveIdentity: source.download.identity,
        archiveSha256: source.download.archiveSha256,
        archiveSourceUri: source.download.sourceUri,
        usedOlderArchiveFallback,
        rasterEntry: source.receipt.sourceEntry,
        rasterSha256: source.receipt.sha256,
        rasterRelativePath: source.receipt.rasterPath,
        rasterBounds: source.bbox,
        pixelWindow: window,
        surveyStart: source.surveyStart,
        surveyEnd: source.surveyEnd,
      },
    },
  };
}

function assertCompressedPixels(compressed, raw, pixelSha256, gridRef) {
  const decoded = gunzipSync(compressed);
  if (
    decoded.length !== raw.length ||
    sha256Buffer(decoded) !== pixelSha256 ||
    !decoded.equals(raw)
  ) {
    throw new Error(`Compressed DTM pixel verification failed for ${gridRef}`);
  }
}

function assertLittleEndian() {
  const value = new Uint16Array([0x0102]);
  if (new Uint8Array(value.buffer)[0] !== 0x02) {
    throw new Error('Cumbria Float32 output requires a little-endian runtime');
  }
}

export function pixelStatistics(values, noData) {
  let validCellCount = 0;
  let noDataCellCount = 0;
  let minimumElevationM = Infinity;
  let maximumElevationM = -Infinity;
  for (const value of values) {
    if (value === noData) {
      noDataCellCount += 1;
      continue;
    }
    if (!Number.isFinite(value) || value < -100 || value > 3000) {
      throw new Error(`Invalid DTM elevation value ${value}`);
    }
    validCellCount += 1;
    minimumElevationM = Math.min(minimumElevationM, value);
    maximumElevationM = Math.max(maximumElevationM, value);
  }
  return {
    validCellCount,
    noDataCellCount,
    minimumElevationM:
      validCellCount === 0 ? null : Number(minimumElevationM.toFixed(3)),
    maximumElevationM:
      validCellCount === 0 ? null : Number(maximumElevationM.toFixed(3)),
  };
}

function summarizeMasks(masks, sourceReceipt) {
  const uniqueOutputs = new Map(
    masks.map((mask) => [mask.output.sha256, mask.output]),
  );
  return {
    archiveCount: sourceReceipt.downloads.length,
    archiveBytes: sourceReceipt.downloads.reduce(
      (sum, download) => sum + download.archiveBytes,
      0,
    ),
    sourceRasterCount: new Set(
      sourceReceipt.downloads.flatMap((download) =>
        download.rasters.map((raster) => raster.sha256),
      ),
    ).size,
    maskCount: masks.length,
    availableMaskCount: masks.filter(
      (mask) => mask.quality.status === 'available',
    ).length,
    emptyMaskCount: masks.filter(
      (mask) => mask.quality.status !== 'available',
    ).length,
    uniqueArtifactCount: uniqueOutputs.size,
    physicalRasterBytes: [...uniqueOutputs.values()].reduce(
      (sum, output) => sum + output.byteLength,
      0,
    ),
    rasterBytes: masks.reduce(
      (sum, mask) => sum + mask.output.byteLength,
      0,
    ),
    decodedRasterBytes: masks.reduce(
      (sum, mask) => sum + mask.output.decodedByteLength,
      0,
    ),
    validCellCount: masks.reduce(
      (sum, mask) => sum + mask.output.validCellCount,
      0,
    ),
    noDataCellCount: masks.reduce(
      (sum, mask) => sum + mask.output.noDataCellCount,
      0,
    ),
  };
}

function archiveIdentity(archive) {
  return `${archive.product}/${archive.year}/${archive.resolutionMetres}/${archive.tile}`;
}

function compactDate(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function resolveInside(root, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.includes('\\') ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.split('/').includes('..')
  ) {
    throw new Error(`Unsafe relative path ${relativePath}`);
  }
  const resolved = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the data root: ${relativePath}`);
  }
  return resolved;
}

async function assertFile(filePath, expectedBytes, expectedSha256) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size !== expectedBytes) {
    throw new Error(`File byte length drifted: ${filePath}`);
  }
  const bytes = await readFile(filePath);
  if (sha256Buffer(bytes) !== expectedSha256) {
    throw new Error(`File SHA-256 drifted: ${filePath}`);
  }
}

async function freeSpaceBytes(targetPath) {
  const { statfs } = await import('node:fs/promises');
  const result = await statfs(targetPath, { bigint: true });
  return Number(result.bavail * result.bsize);
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function atomicWriteJson(filePath, value, stagingDirectory) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const partialPath = path.join(
    stagingDirectory,
    `${path.basename(filePath)}.${process.pid}.part`,
  );
  const handle = await open(
    partialPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
  );
  try {
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(partialPath, filePath);
}

function portablePath(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function sha256Json(value) {
  return sha256Buffer(Buffer.from(JSON.stringify(value)));
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCumbriaDtmMaskMaterializer(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Cumbria DTM mask materialization failed: ${error.message}`);
      process.exitCode = 1;
    });
}
