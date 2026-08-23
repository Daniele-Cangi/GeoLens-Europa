import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFile, fromUrl } from 'geotiff';
import proj4 from 'proj4';

const require = createRequire(import.meta.url);
const { assertHistoricalBenchmarkManifest } = require(
  '../packages/evidence/dist',
);
const { corineRasterValueToClassCode } = require(
  '../packages/providers/dist',
);

if (os.endianness() !== 'LE') {
  throw new Error('Bounded evidence arrays require little-endian encoding');
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const manifestPath = path.join(
  repositoryRoot,
  'tests',
  'ground-truth',
  'emilia-romagna-2023',
  'manifest.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assertHistoricalBenchmarkManifest(manifest);

const dataRoot = path.resolve(
  process.env.GEOLENS_BENCHMARK_DATA_ROOT ?? process.argv[2] ?? '',
);
const clcRasterPath = path.resolve(
  process.env.CLC2018_RASTER_PATH ?? process.argv[3] ?? '',
);
if (!process.env.GEOLENS_BENCHMARK_DATA_ROOT && !process.argv[2]) {
  throw new Error(
    'Set GEOLENS_BENCHMARK_DATA_ROOT or pass the benchmark data root',
  );
}
if (!process.env.CLC2018_RASTER_PATH && !process.argv[3]) {
  throw new Error(
    'Set CLC2018_RASTER_PATH or pass the official CLC2018 raster path',
  );
}

const outputRoot = path.join(dataRoot, 'inputs');
await mkdir(outputRoot, { recursive: true });
assertInside(dataRoot, outputRoot);

const protocol = manifest.benchmark.spatialProtocol;
const [west, south, east, north] = protocol.coverage.commonBounds;
const [minX, minY, maxX, maxY] = protocol.grid.bounds;
const { width, height, cellSizeM } = protocol.grid;
const cellCount = width * height;
if (cellCount !== 140_700) {
  throw new Error(`Unexpected frozen grid cell count ${cellCount}`);
}

proj4.defs(
  'EPSG:32632',
  '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs +type=crs',
);
proj4.defs(
  'EPSG:3035',
  '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 ' +
    '+y_0=3210000 +ellps=GRS80 +units=m +no_defs +type=crs',
);

const acquiredAt = new Date().toISOString();
const aoiMask = new Uint8Array(cellCount);
const activeCells = [];
for (let row = 0; row < height; row += 1) {
  const y = maxY - (row + 0.5) * cellSizeM;
  for (let column = 0; column < width; column += 1) {
    const x = minX + (column + 0.5) * cellSizeM;
    const index = row * width + column;
    const [lon, lat] = proj4('EPSG:32632', 'EPSG:4326', [x, y]);
    const inside =
      lon >= west && lon <= east && lat >= south && lat <= north;
    aoiMask[index] = inside ? 1 : 0;
    if (inside) {
      activeCells.push({ index, row, column, x, y, lon, lat });
    }
  }
}
if (activeCells.length === 0) {
  throw new Error('Frozen grid contains no AOI cell centres');
}

const maskArtifact = await persistArray(
  'common-aoi-mask-u8.bin',
  aoiMask,
  {
    encoding: 'uint8 row-major north-to-south; 1=inside AOI, 0=outside',
    missingSentinel: null,
  },
);

const dem = await materializeDem(activeCells);
const clc = await materializeClc(activeCells);
const xdbtr = await materializeXdbtrReceipts();

const receipt = {
  schemaVersion: 'bounded-environmental-inputs-v0.1.0',
  benchmarkId: manifest.benchmark.id,
  acquiredAt,
  commonCoverage: protocol.coverage,
  grid: protocol.grid,
  masks: {
    policy: protocol.masks,
    aoi: {
      ...maskArtifact,
      insideCells: activeCells.length,
      outsideCells: cellCount - activeCells.length,
    },
    permanentWater: {
      status: 'blocked',
      missingReason:
        'The public XDBTR WMS is a styled RGB map. Physical permanent-water geometry requires the authenticated official DBTR vector extraction.',
    },
  },
  dem,
  landCover: clc,
  xdbtr,
};
const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;
await writeFile(
  path.join(outputRoot, 'bounded-inputs-receipt.json'),
  receiptText,
  'utf8',
);

console.log(
  JSON.stringify(
    {
      outputRoot,
      cellCount,
      activeCells: activeCells.length,
      dem: dem.statusCounts,
      landCover: clc.statusCounts,
      xdbtr: xdbtr.status,
    },
    null,
    2,
  ),
);

async function materializeDem(cells) {
  const delta = 1 / 3600;
  const sampleCoordinates = [];
  const tileMetadata = new Map();

  for (const cell of cells) {
    sampleCoordinates.push(
      [cell.lat, cell.lon],
      [cell.lat + delta, cell.lon],
      [cell.lat - delta, cell.lon],
      [cell.lat, cell.lon + delta],
      [cell.lat, cell.lon - delta],
    );
  }

  for (const [lat, lon] of sampleCoordinates) {
    const url = demTileUrl(lat, lon);
    if (!tileMetadata.has(url)) {
      const tiff = await fromUrl(url);
      const image = await tiff.getImage();
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) {
        throw new Error(`DEM HEAD failed ${head.status} for ${url}`);
      }
      tileMetadata.set(url, {
        url,
        image,
        bbox: image.getBoundingBox(),
        width: image.getWidth(),
        height: image.getHeight(),
        noData: image.getGDALNoData(),
        etag: head.headers.get('etag'),
        lastModified: head.headers.get('last-modified'),
        contentLength: numberHeader(head.headers.get('content-length')),
        pixelBounds: [Infinity, Infinity, -Infinity, -Infinity],
      });
    }
  }

  for (const [lat, lon] of sampleCoordinates) {
    const metadata = tileMetadata.get(demTileUrl(lat, lon));
    const [pixelX, pixelY] = sourcePixel(metadata, lat, lon);
    metadata.pixelBounds[0] = Math.min(metadata.pixelBounds[0], pixelX);
    metadata.pixelBounds[1] = Math.min(metadata.pixelBounds[1], pixelY);
    metadata.pixelBounds[2] = Math.max(metadata.pixelBounds[2], pixelX);
    metadata.pixelBounds[3] = Math.max(metadata.pixelBounds[3], pixelY);
  }

  for (const metadata of tileMetadata.values()) {
    const x0 = Math.max(0, metadata.pixelBounds[0]);
    const y0 = Math.max(0, metadata.pixelBounds[1]);
    const x1 = Math.min(metadata.width, metadata.pixelBounds[2] + 1);
    const y1 = Math.min(metadata.height, metadata.pixelBounds[3] + 1);
    const rasters = await metadata.image.readRasters({
      window: [x0, y0, x1, y1],
    });
    metadata.window = [x0, y0, x1, y1];
    metadata.windowWidth = x1 - x0;
    metadata.values = rasters[0];
  }

  const elevation = new Float32Array(cellCount);
  const slope = new Float32Array(cellCount);
  elevation.fill(Number.NaN);
  slope.fill(Number.NaN);
  let elevationAvailable = 0;
  let slopeAvailable = 0;

  for (const cell of cells) {
    const center = demSample(tileMetadata, cell.lat, cell.lon);
    const northValue = demSample(
      tileMetadata,
      cell.lat + delta,
      cell.lon,
    );
    const southValue = demSample(
      tileMetadata,
      cell.lat - delta,
      cell.lon,
    );
    const eastValue = demSample(
      tileMetadata,
      cell.lat,
      cell.lon + delta,
    );
    const westValue = demSample(
      tileMetadata,
      cell.lat,
      cell.lon - delta,
    );

    if (center !== null) {
      elevation[cell.index] = center;
      elevationAvailable += 1;
    }
    if (
      northValue !== null &&
      southValue !== null &&
      eastValue !== null &&
      westValue !== null
    ) {
      const metersPerDegreeLatitude = 111_320;
      const eastWestDistance =
        2 *
        delta *
        metersPerDegreeLatitude *
        Math.cos((cell.lat * Math.PI) / 180);
      const northSouthDistance =
        2 * delta * metersPerDegreeLatitude;
      const dzDx = (eastValue - westValue) / eastWestDistance;
      const dzDy = (northValue - southValue) / northSouthDistance;
      slope[cell.index] =
        Math.atan(Math.hypot(dzDx, dzDy)) * (180 / Math.PI);
      slopeAvailable += 1;
    }
  }

  const elevationArtifact = await persistArray(
    'copernicus-dem-glo30-elevation-f32le.bin',
    elevation,
    {
      encoding: 'float32 little-endian row-major north-to-south, metres',
      missingSentinel: 'NaN',
    },
  );
  const slopeArtifact = await persistArray(
    'copernicus-dem-glo30-slope-f32le.bin',
    slope,
    {
      encoding: 'float32 little-endian row-major north-to-south, degrees',
      missingSentinel: 'NaN',
    },
  );

  return {
    provider: 'European Union / ESA',
    dataset: 'Copernicus DEM GLO-30',
    datasetVersion: '2022_1',
    sourceResolution: '1 arc-second (~30 m at equator)',
    observedAt: '2021-01-01T00:00:00.000Z',
    acquiredAt,
    samplingMethod:
      'nearest native source pixel at each 30 m grid-cell centre; slope from four 1 arc-second cardinal samples',
    transformationVersion: 'bounded-dem-grid-v0.1.0',
    statusCounts: {
      elevationAvailable,
      elevationMissing: activeCells.length - elevationAvailable,
      slopeAvailable,
      slopeMissing: activeCells.length - slopeAvailable,
      outsideAoi: cellCount - activeCells.length,
    },
    sourceTiles: [...tileMetadata.values()].map((tile) => ({
      url: tile.url,
      sourceBounds: tile.bbox,
      sourceGrid: [tile.width, tile.height],
      loadedPixelWindow: tile.window,
      etag: tile.etag,
      lastModified: tile.lastModified,
      contentLength: tile.contentLength,
    })),
    artifacts: [elevationArtifact, slopeArtifact],
  };
}

async function materializeClc(cells) {
  const sourceStats = await stat(clcRasterPath);
  if (!sourceStats.isFile()) {
    throw new Error('Configured CLC raster is not a file');
  }
  const tiff = await fromFile(clcRasterPath);
  const image = await tiff.getImage();
  const bbox = image.getBoundingBox();
  const sourceWidth = image.getWidth();
  const sourceHeight = image.getHeight();
  const projectedCells = cells.map((cell) => {
    const [x, y] = proj4(
      'EPSG:4326',
      'EPSG:3035',
      [cell.lon, cell.lat],
    );
    const pixelX = Math.floor(
      ((x - bbox[0]) / (bbox[2] - bbox[0])) * sourceWidth,
    );
    const pixelY = Math.floor(
      ((bbox[3] - y) / (bbox[3] - bbox[1])) * sourceHeight,
    );
    return { ...cell, sourceX: pixelX, sourceY: pixelY };
  });
  let minimumSourceX = Infinity;
  let minimumSourceY = Infinity;
  let maximumSourceX = -Infinity;
  let maximumSourceY = -Infinity;
  for (const cell of projectedCells) {
    minimumSourceX = Math.min(minimumSourceX, cell.sourceX);
    minimumSourceY = Math.min(minimumSourceY, cell.sourceY);
    maximumSourceX = Math.max(maximumSourceX, cell.sourceX);
    maximumSourceY = Math.max(maximumSourceY, cell.sourceY);
  }
  const x0 = Math.max(0, minimumSourceX);
  const y0 = Math.max(0, minimumSourceY);
  const x1 = Math.min(sourceWidth, maximumSourceX + 1);
  const y1 = Math.min(sourceHeight, maximumSourceY + 1);
  const rasters = await image.readRasters({ window: [x0, y0, x1, y1] });
  const values = rasters[0];
  const windowWidth = x1 - x0;
  const classCodes = new Int16Array(cellCount);
  classCodes.fill(-1);
  let available = 0;

  for (const cell of projectedCells) {
    const localX = cell.sourceX - x0;
    const localY = cell.sourceY - y0;
    const value = Number(values[localY * windowWidth + localX]);
    const classCode = corineRasterValueToClassCode(value);
    if (classCode !== null) {
      classCodes[cell.index] = classCode;
      available += 1;
    }
  }

  const artifact = await persistArray(
    'corine-clc2018-class-i16le.bin',
    classCodes,
    {
      encoding:
        'int16 little-endian row-major north-to-south, CLC level-3 class code',
      missingSentinel: -1,
    },
  );

  return {
    provider: 'Copernicus Land Monitoring Service',
    dataset: 'CORINE Land Cover 2018',
    datasetVersion: 'V2020_20u1',
    sourceResolution: '100 m',
    observedAt: '2018-01-01T00:00:00.000Z',
    acquiredAt,
    samplingMethod:
      'nearest official EPSG:3035 raster pixel at each 30 m grid-cell centre',
    transformationVersion: 'bounded-clc-grid-v0.1.0',
    statusCounts: {
      available,
      missing: activeCells.length - available,
      outsideAoi: cellCount - activeCells.length,
    },
    source: {
      fileName: path.basename(clcRasterPath),
      bytes: sourceStats.size,
      sha256: await sha256File(clcRasterPath),
      sourceBounds: bbox,
      sourceGrid: [sourceWidth, sourceHeight],
      loadedPixelWindow: [x0, y0, x1, y1],
    },
    artifacts: [artifact],
  };
}

async function materializeXdbtrReceipts() {
  const layers = [
    ['water', 'SDA_Specchio_di_acqua_ed2021'],
    ['embankment-area', 'Argine_ARG_ed2020'],
    ['riverbed-area', 'Alveo_AAI_ed2020'],
    ['embankment-line', 'Argine_ARG_linee_ed2020'],
    ['built-area', 'Edificato2018'],
  ];
  const receipts = [];

  for (const [name, layer] of layers) {
    const url = new URL(
      'https://servizigis.regione.emilia-romagna.it/wms/xdbtr',
    );
    url.search = new URLSearchParams({
      service: 'WMS',
      version: '1.3.0',
      request: 'GetMap',
      layers: layer,
      styles: '',
      crs: protocol.grid.crs,
      bbox: protocol.grid.bounds.join(','),
      width: String(protocol.grid.width),
      height: String(protocol.grid.height),
      format: 'image/tiff',
      transparent: 'true',
    }).toString();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `XDBTR WMS ${layer} failed with HTTP ${response.status}`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isTiff(bytes)) {
      throw new Error(`XDBTR WMS ${layer} did not return TIFF bytes`);
    }
    const artifact = await persistBuffer(
      `xdbtr-${name}-30m-styled-map.tif`,
      bytes,
    );
    receipts.push({
      layer,
      requestUrl: url.toString(),
      contentType: response.headers.get('content-type'),
      ...artifact,
    });
  }

  return {
    status: 'blocked',
    provider: 'Regione Emilia-Romagna',
    dataset: 'XDBTR',
    datasetVersion: 'Alveo/Argine 2020; Edificato 2018; water 2021',
    acquiredAt,
    wmsSemantics: 'layer-separated styled map context only',
    physicalGeometryEligible: false,
    missingReason:
      'The official vector extraction service redirects to regional IAM authentication; WMS RGB pixels are not physical vector geometry.',
    receipts,
  };
}

function demSample(tiles, lat, lon) {
  const tile = tiles.get(demTileUrl(lat, lon));
  const [sourceX, sourceY] = sourcePixel(tile, lat, lon);
  const localX = sourceX - tile.window[0];
  const localY = sourceY - tile.window[1];
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= tile.windowWidth ||
    localY >= tile.window[3] - tile.window[1]
  ) {
    return null;
  }
  const value = Number(tile.values[localY * tile.windowWidth + localX]);
  if (
    !Number.isFinite(value) ||
    value <= -32767 ||
    (tile.noData !== null &&
      tile.noData !== undefined &&
      value === tile.noData)
  ) {
    return null;
  }
  if (value < -1000 || value > 9000) {
    throw new Error(
      `Copernicus DEM returned physically unsupported elevation ${value}`,
    );
  }
  return value;
}

function sourcePixel(tile, lat, lon) {
  const [minLon, minLat, maxLon, maxLat] = tile.bbox;
  const x = Math.floor(
    ((lon - minLon) / (maxLon - minLon)) * tile.width,
  );
  const y = Math.floor(
    ((maxLat - lat) / (maxLat - minLat)) * tile.height,
  );
  if (x < 0 || x >= tile.width || y < 0 || y >= tile.height) {
    throw new Error(`DEM coordinate ${lat},${lon} is outside ${tile.url}`);
  }
  return [x, y];
}

function demTileUrl(lat, lon) {
  const tileLat = Math.floor(lat);
  const tileLon = Math.floor(lon);
  const latHemisphere = tileLat >= 0 ? 'N' : 'S';
  const lonHemisphere = tileLon >= 0 ? 'E' : 'W';
  const latText = Math.abs(tileLat).toString().padStart(2, '0');
  const lonText = Math.abs(tileLon).toString().padStart(3, '0');
  const tile =
    `Copernicus_DSM_COG_10_${latHemisphere}${latText}_00_` +
    `${lonHemisphere}${lonText}_00_DEM`;
  return (
    'https://copernicus-dem-30m.s3.amazonaws.com/' +
    `${tile}/${tile}.tif`
  );
}

async function persistArray(fileName, values, metadata) {
  const bytes = Buffer.from(
    values.buffer,
    values.byteOffset,
    values.byteLength,
  );
  return {
    ...(await persistBuffer(fileName, bytes)),
    ...metadata,
  };
}

async function persistBuffer(fileName, bytes) {
  const fullPath = path.join(outputRoot, fileName);
  assertInside(dataRoot, fullPath);
  await writeFile(fullPath, bytes);
  return {
    relativePath: portableRelative(dataRoot, fullPath),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function portableRelative(root, target) {
  return path.relative(root, target).replace(/\\/g, '/');
}

function assertInside(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Output escapes benchmark data root: ${target}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function numberHeader(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTiff(bytes) {
  return (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x4d &&
        bytes[1] === 0x4d &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x2a))
  );
}
