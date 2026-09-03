import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
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

import proj4 from 'proj4';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { assertCumbriaPublicBaselineProtocol } = require(
  '../packages/evidence/dist',
);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const manifestPath = path.join(
  repositoryRoot,
  'tests',
  'ground-truth',
  'cumbria-2015',
  'manifest.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assertCumbriaPublicBaselineProtocol(
  manifest.publicBaselineProtocol,
  manifest.datasets,
);

const serviceRoot =
  'https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2012/MapServer';
const vectorMetadataUrl = `${serviceRoot}/0?f=pjson`;
const rasterMetadataUrl = `${serviceRoot}/1?f=pjson`;
const sourceOrigin = [900000, 900000];
const sourceCellSizeMetres = 100;
const expectedDatasetVersion = 'V2020_20u1';
const receiptFileName = 'cumbria-public-baseline-clc2012.receipt.json';

proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
    '+x_0=400000 +y_0=-100000 +ellps=airy ' +
    '+towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 ' +
    '+units=m +no_defs +type=crs',
);
proj4.defs(
  'EPSG:3035',
  '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 ' +
    '+y_0=3210000 +ellps=GRS80 +units=m +no_defs +type=crs',
);

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
    throw new Error('Cumbria CLC data root must stay outside the Git repository');
  }
  if (
    dataRoot
      .split(path.sep)
      .some((part) => part.toLocaleLowerCase('en-US') === 'onedrive')
  ) {
    throw new Error('Cumbria CLC data root must stay outside OneDrive');
  }
}

export function alignedSourceWindow(
  bounds,
  transform = (coordinate) =>
    proj4('EPSG:27700', 'EPSG:3035', coordinate),
) {
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    bounds.some((value) => !Number.isFinite(value)) ||
    bounds[0] >= bounds[2] ||
    bounds[1] >= bounds[3]
  ) {
    throw new Error('Cumbria BNG domain bounds are invalid');
  }
  const corners = [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[1]],
    [bounds[2], bounds[3]],
    [bounds[0], bounds[3]],
  ].map(transform);
  const x = corners.map((coordinate) => coordinate[0]);
  const y = corners.map((coordinate) => coordinate[1]);
  const aligned = [
    alignDown(Math.min(...x), sourceOrigin[0]),
    alignDown(Math.min(...y), sourceOrigin[1]),
    alignUp(Math.max(...x), sourceOrigin[0]),
    alignUp(Math.max(...y), sourceOrigin[1]),
  ];
  return {
    sourceBounds: aligned,
    sourceWidth: (aligned[2] - aligned[0]) / sourceCellSizeMetres,
    sourceHeight: (aligned[3] - aligned[1]) / sourceCellSizeMetres,
    projectedDomainCorners: corners,
  };
}

export function rendererCodeMap(metadata) {
  const renderer = metadata?.drawingInfo?.renderer;
  if (renderer?.type !== 'uniqueValue' || renderer.field1 !== 'Code_12') {
    throw new Error('CLC 2012 vector renderer is not keyed by Code_12');
  }
  const entries = Array.isArray(renderer.uniqueValueInfos)
    ? renderer.uniqueValueInfos
    : (renderer.uniqueValueGroups ?? []).flatMap((group) =>
        (group.classes ?? []).map((candidate) => ({
          ...candidate,
          value: candidate.values?.[0]?.[0],
        })),
      );
  const result = new Map();
  for (const entry of entries) {
    const code = Number(entry.value);
    const color = entry.symbol?.color;
    if (
      !Number.isInteger(code) ||
      code < 100 ||
      code > 599 ||
      !Array.isArray(color) ||
      color.length < 3 ||
      color.slice(0, 3).some((value) => !Number.isInteger(value))
    ) {
      throw new Error('CLC 2012 renderer contains an invalid class definition');
    }
    const key = color.slice(0, 3).join(',');
    if (result.has(key) && result.get(key) !== code) {
      throw new Error(`CLC renderer colour ${key} maps to multiple classes`);
    }
    result.set(key, code);
  }
  if (result.size !== 44) {
    throw new Error(`Expected 44 CLC classes, received ${result.size}`);
  }
  return result;
}

export function classifyRgbaPixels(bytes, colorMap) {
  if (!(bytes instanceof Uint8Array) || bytes.length % 4 !== 0) {
    throw new Error('CLC pixels must be RGBA bytes');
  }
  const values = new Int16Array(bytes.length / 4);
  values.fill(-1);
  const classCounts = new Map();
  let missingCellCount = 0;
  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    const alpha = bytes[offset + 3];
    if (alpha === 0) {
      missingCellCount += 1;
      continue;
    }
    if (alpha !== 255) {
      throw new Error(
        `Rendered CLC cell ${index} has partial alpha ${alpha}`,
      );
    }
    const key = `${bytes[offset]},${bytes[offset + 1]},${bytes[offset + 2]}`;
    const code = colorMap.get(key);
    if (code === undefined) {
      throw new Error(`Rendered CLC colour ${key} has no Code_12 mapping`);
    }
    values[index] = code;
    classCounts.set(code, (classCounts.get(code) ?? 0) + 1);
  }
  return {
    values,
    missingCellCount,
    classCounts: Object.fromEntries(
      [...classCounts].sort(([left], [right]) => left - right),
    ),
  };
}

export function buildExportUrl(window) {
  const url = new URL(`${serviceRoot}/export`);
  url.search = new URLSearchParams({
    bbox: window.sourceBounds.join(','),
    bboxSR: '3035',
    imageSR: '3035',
    size: `${window.sourceWidth},${window.sourceHeight}`,
    dpi: '96',
    format: 'png32',
    layers: 'show:1',
    transparent: 'true',
    f: 'image',
  }).toString();
  return url.toString();
}

export async function runCumbriaClcMaterializer(arguments_) {
  const options = parseArguments(arguments_);
  const dataRoot = path.resolve(options.dataRoot);
  ensureExternalDataRoot(dataRoot, repositoryRoot);
  const domainBounds = manifest.publicBaselineProtocol?.domain?.bounds;
  const window = alignedSourceWindow(domainBounds);
  const plan = {
    materializationId: 'cumbria-public-baseline-clc2012-v0',
    mode: options.execute ? 'execute' : 'dry_run',
    dataRoot,
    sourceDataset: 'CORINE Land Cover 2012 raster',
    datasetVersion: expectedDatasetVersion,
    domain: { crs: 'EPSG:27700', bounds: domainBounds },
    sourceGrid: {
      crs: 'EPSG:3035',
      bounds: window.sourceBounds,
      width: window.sourceWidth,
      height: window.sourceHeight,
      cellSizeMetres: sourceCellSizeMetres,
    },
    sourceUrl: buildExportUrl(window),
    evaluationGeometryLoaded: false,
  };
  if (!options.execute) {
    return plan;
  }

  const sourceDirectory = path.join(dataRoot, 'land-cover', 'source', 'sha256');
  const nativeDirectory = path.join(dataRoot, 'land-cover', 'native', 'sha256');
  const stagingDirectory = path.join(dataRoot, 'staging');
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(nativeDirectory, { recursive: true });
  await mkdir(stagingDirectory, { recursive: true });

  const [vectorMetadata, rasterMetadata, sourceImage] = await Promise.all([
    fetchJson(vectorMetadataUrl),
    fetchJson(rasterMetadataUrl),
    fetchBytes(plan.sourceUrl),
  ]);
  assertRasterMetadata(rasterMetadata);
  const colorMap = rendererCodeMap(vectorMetadata);
  assertPng(sourceImage);
  const decoded = await sharp(sourceImage)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== window.sourceWidth ||
    decoded.info.height !== window.sourceHeight ||
    decoded.info.channels !== 4
  ) {
    throw new Error('CLC export dimensions disagree with the frozen source grid');
  }
  const classified = classifyRgbaPixels(decoded.data, colorMap);
  const verification = await verifyObservedClasses(
    classified,
    window,
  );

  const vectorMetadataBytes = normalizedJsonBytes(vectorMetadata);
  const rasterMetadataBytes = normalizedJsonBytes(rasterMetadata);
  const classBytes = Buffer.from(
    classified.values.buffer,
    classified.values.byteOffset,
    classified.values.byteLength,
  );
  const compressedClassBytes = gzipSync(classBytes, { level: 9 });
  if (!gunzipSync(compressedClassBytes).equals(classBytes)) {
    throw new Error('Compressed CLC class artifact failed round-trip verification');
  }
  const artifacts = {
    vectorMetadata: await persistContentAddressed(
      vectorMetadataBytes,
      '.json',
      sourceDirectory,
      dataRoot,
      stagingDirectory,
    ),
    rasterMetadata: await persistContentAddressed(
      rasterMetadataBytes,
      '.json',
      sourceDirectory,
      dataRoot,
      stagingDirectory,
    ),
    renderedSourceWindow: await persistContentAddressed(
      sourceImage,
      '.png',
      sourceDirectory,
      dataRoot,
      stagingDirectory,
    ),
    classGrid: await persistContentAddressed(
      compressedClassBytes,
      '.i16le.gz',
      nativeDirectory,
      dataRoot,
      stagingDirectory,
    ),
  };

  const receiptPath = path.join(dataRoot, receiptFileName);
  const priorReceipt = await readOptionalJson(receiptPath);
  const acquiredAt =
    priorReceipt?.artifacts?.renderedSourceWindow?.sha256 ===
      artifacts.renderedSourceWindow.sha256 &&
    priorReceipt?.artifacts?.classGrid?.sha256 === artifacts.classGrid.sha256
      ? priorReceipt.acquiredAt
      : new Date().toISOString();
  const receiptWithoutHash = {
    schemaVersion: 'cumbria-clc2012-source-receipt-v0.1.0',
    materializationId: plan.materializationId,
    acquiredAt,
    status:
      classified.missingCellCount === 0 ? 'available' : 'incomplete_coverage',
    provider: 'European Environment Agency / Copernicus Land Monitoring Service',
    dataset: plan.sourceDataset,
    datasetVersion: expectedDatasetVersion,
    referenceYears: '2011-2012',
    sourceResolution: '100 m raster; 25 ha minimum mapping unit',
    sourceRepresentation:
      'official CLC2012 raster rendered without interpolation at its aligned 100 m EPSG:3035 cell grid',
    domain: plan.domain,
    sourceGrid: {
      ...plan.sourceGrid,
      rowOrder: 'north_to_south',
      cellValue: 'CLC level-3 Code_12; -1 means missing',
      projectedDomainCorners: window.projectedDomainCorners,
    },
    source: {
      serviceRoot,
      vectorMetadataUrl,
      rasterMetadataUrl,
      exportUrl: plan.sourceUrl,
      rasterLayerId: 1,
      rendererLayerId: 0,
    },
    transformation: {
      name: 'lossless renderer-colour decoding to CLC Code_12',
      version: 'cumbria-clc2012-native-grid-v0.1.0',
      categoricalInterpolation: 'forbidden',
      missingPolicy: 'transparent source pixels remain -1; unknown colours fail',
      rasterValueVerification:
        'one underlying Raster.Code_12 identify request per observed class',
    },
    quality: {
      sourceCellCount: window.sourceWidth * window.sourceHeight,
      availableCellCount:
        window.sourceWidth * window.sourceHeight -
        classified.missingCellCount,
      missingCellCount: classified.missingCellCount,
      classCounts: classified.classCounts,
      verifiedClasses: verification,
    },
    artifacts,
    isolation: {
      observedFloodGeometryLoaded: false,
      observedFloodGeometryUsed: false,
      h3UsedAsSourceOrSolverGrid: false,
      solverExecutionAuthorized: false,
    },
  };
  const receipt = {
    ...receiptWithoutHash,
    receiptSha256: sha256Json(receiptWithoutHash),
  };
  if (priorReceipt && JSON.stringify(priorReceipt) !== JSON.stringify(receipt)) {
    throw new Error('Existing Cumbria CLC receipt differs from verified outputs');
  }
  if (!priorReceipt) {
    await atomicWriteJson(receiptPath, receipt, stagingDirectory);
  }
  return {
    ...plan,
    state: 'clc2012_native_window_materialized',
    receiptPath,
    receiptSha256: receipt.receiptSha256,
    status: receipt.status,
    quality: receipt.quality,
    artifacts: receipt.artifacts,
  };
}

async function verifyObservedClasses(classified, window) {
  const firstIndexByClass = new Map();
  classified.values.forEach((code, index) => {
    if (code >= 0 && !firstIndexByClass.has(code)) {
      firstIndexByClass.set(code, index);
    }
  });
  const checks = await Promise.all(
    [...firstIndexByClass].map(async ([code, index]) => {
      const row = Math.floor(index / window.sourceWidth);
      const column = index % window.sourceWidth;
      const x = window.sourceBounds[0] + (column + 0.5) * sourceCellSizeMetres;
      const y = window.sourceBounds[3] - (row + 0.5) * sourceCellSizeMetres;
      const url = buildIdentifyUrl(x, y, window);
      const response = await fetchJson(url);
      const observed = Number(
        response.results?.[0]?.attributes?.['Raster.Code_12'] ??
          response.results?.[0]?.attributes?.['Raster.Value'],
      );
      if (observed !== code) {
        throw new Error(
          `CLC rendered class ${code} disagrees with raster identify ${observed}`,
        );
      }
      return { code, x, y };
    }),
  );
  return checks.sort((left, right) => left.code - right.code);
}

function buildIdentifyUrl(x, y, window) {
  const url = new URL(`${serviceRoot}/identify`);
  url.search = new URLSearchParams({
    geometry: `${x},${y}`,
    geometryType: 'esriGeometryPoint',
    sr: '3035',
    layers: 'all:1',
    tolerance: '1',
    mapExtent: window.sourceBounds.join(','),
    imageDisplay: `${window.sourceWidth},${window.sourceHeight},96`,
    returnGeometry: 'false',
    f: 'json',
  }).toString();
  return url.toString();
}

function assertRasterMetadata(metadata) {
  const extent = metadata?.extent;
  if (
    metadata?.name !== 'Corine Land Cover 2012 raster' ||
    metadata?.type !== 'Raster Layer' ||
    metadata?.id !== 1 ||
    extent?.spatialReference?.latestWkid !== 3035 ||
    JSON.stringify([extent?.xmin, extent?.ymin, extent?.xmax, extent?.ymax]) !==
      JSON.stringify([900000, 900000, 7400000, 5500000])
  ) {
    throw new Error('CLC 2012 raster metadata drifted from the frozen contract');
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`CLC request failed with HTTP ${response.status}: ${url}`);
  }
  const value = await response.json();
  if (value?.error) {
    throw new Error(`CLC service error: ${JSON.stringify(value.error)}`);
  }
  return value;
}

async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`CLC request failed with HTTP ${response.status}: ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function alignDown(value, origin) {
  return (
    Math.floor((value - origin) / sourceCellSizeMetres) *
      sourceCellSizeMetres +
    origin
  );
}

function alignUp(value, origin) {
  return (
    Math.ceil((value - origin) / sourceCellSizeMetres) *
      sourceCellSizeMetres +
    origin
  );
}

function normalizedJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertPng(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < signature.length || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error('CLC export did not return PNG bytes');
  }
}

async function persistContentAddressed(
  bytes,
  extension,
  directory,
  dataRoot,
  stagingDirectory,
) {
  const sha256 = sha256Buffer(bytes);
  const target = path.join(directory, `${sha256}${extension}`);
  try {
    const info = await stat(target);
    if (!info.isFile() || info.size !== bytes.length) {
      throw new Error(`Content-addressed CLC artifact drifted: ${target}`);
    }
    const existing = await readFile(target);
    if (sha256Buffer(existing) !== sha256) {
      throw new Error(`Content-addressed CLC hash drifted: ${target}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    const partial = path.join(stagingDirectory, `${sha256}.${process.pid}.part`);
    const handle = await open(
      partial,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(partial, target);
  }
  return {
    relativePath: path.relative(dataRoot, target).split(path.sep).join('/'),
    bytes: bytes.length,
    sha256,
  };
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
  const bytes = normalizedJsonBytes(value);
  const partial = path.join(
    stagingDirectory,
    `${path.basename(filePath)}.${process.pid}.part`,
  );
  const handle = await open(
    partial,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(partial, filePath);
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
  runCumbriaClcMaterializer(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Cumbria CLC 2012 materialization failed: ${error.message}`);
      process.exitCode = 1;
    });
}
