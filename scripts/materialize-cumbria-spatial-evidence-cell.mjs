import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

import { cellToBoundary, latLngToCell } from 'h3-js';
import proj4 from 'proj4';

import {
  assertCumbriaAccessManifest,
  availableEvidence,
  composeSpatialEvidenceIndexCell,
  SPATIAL_EVIDENCE_INDEX_VERSION,
  unavailableEvidence,
} from '../packages/evidence/dist/index.js';

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
const receiptFileName =
  'cumbria-public-baseline-spatial-evidence-cell.receipt.json';
const compositionId = 'cumbria-public-baseline-centroid-h3-cell-v0';
const geometryVersion = 'native-footprint-overlap-v0.1.0';
const expectedInputReceiptHashes = {
  terrain: 'c9acfe46f41e08e40e6473ce399e912b8d4e27c880e928e0f1a77aef15749988',
  landCover: 'dce61b2234329619ce1212ccc3a49650c1fec68eea7bc5d465f722e170ebc96d',
  precipitation:
    'fb768f0de5dd2e39df8c32e80655b28e9dfef02d1ed82605eb94012bb244ebf7',
};

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
  const result = { dataRoot: undefined, mode: 'dry_run' };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--data-root') {
      result.dataRoot = arguments_[index + 1];
      index += 1;
    } else if (argument === '--execute') {
      if (result.mode !== 'dry_run') {
        throw new Error('Choose only one of --execute or --check');
      }
      result.mode = 'execute';
    } else if (argument === '--check') {
      if (result.mode !== 'dry_run') {
        throw new Error('Choose only one of --execute or --check');
      }
      result.mode = 'check';
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
    throw new Error(
      'Cumbria spatial-evidence data root must stay outside the Git repository',
    );
  }
  if (
    dataRoot
      .split(path.sep)
      .some((part) => part.toLocaleLowerCase('en-US') === 'onedrive')
  ) {
    throw new Error(
      'Cumbria spatial-evidence data root must stay outside OneDrive',
    );
  }
}

export function polygonAreaM2(points) {
  return Math.abs(signedPolygonArea(points));
}

export function intersectConvexPolygons(subject, clip) {
  if (subject.length < 3 || clip.length < 3) {
    return [];
  }
  const orientation = Math.sign(signedPolygonArea(clip));
  if (orientation === 0) {
    throw new Error('Cannot clip against a zero-area polygon');
  }
  let output = subject.map((point) => [...point]);
  for (let index = 0; index < clip.length && output.length > 0; index += 1) {
    const edgeStart = clip[index];
    const edgeEnd = clip[(index + 1) % clip.length];
    const input = output;
    output = [];
    let start = input[input.length - 1];
    for (const end of input) {
      const startInside = isInside(start, edgeStart, edgeEnd, orientation);
      const endInside = isInside(end, edgeStart, edgeEnd, orientation);
      if (endInside) {
        if (!startInside) {
          output.push(lineIntersection(start, end, edgeStart, edgeEnd));
        }
        output.push(end);
      } else if (startInside) {
        output.push(lineIntersection(start, end, edgeStart, edgeEnd));
      }
      start = end;
    }
    output = removeAdjacentDuplicates(output);
  }
  return output.length >= 3 ? output : [];
}

export function coordinateEdges(centres) {
  if (
    !Array.isArray(centres) ||
    centres.length < 2 ||
    centres.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Native coordinate centres must contain finite values');
  }
  const edges = [centres[0] - (centres[1] - centres[0]) / 2];
  for (let index = 1; index < centres.length; index += 1) {
    if (centres[index] <= centres[index - 1]) {
      throw new Error('Native coordinate centres must be strictly increasing');
    }
    edges.push((centres[index - 1] + centres[index]) / 2);
  }
  edges.push(
    centres[centres.length - 1] +
      (centres[centres.length - 1] - centres[centres.length - 2]) / 2,
  );
  return edges;
}

export async function runCumbriaSpatialEvidenceMaterializer(arguments_) {
  const options = parseArguments(arguments_);
  const dataRoot = path.resolve(options.dataRoot);
  ensureExternalDataRoot(dataRoot, repositoryRoot);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assertCumbriaAccessManifest(manifest);

  const selection = frozenCentroidSelection(manifest);
  const plan = {
    schemaVersion: 'cumbria-spatial-evidence-materialization-plan-v0.1.0',
    compositionId,
    mode: options.mode,
    dataRoot,
    implementationVersion: SPATIAL_EVIDENCE_INDEX_VERSION,
    selection,
    networkRequests: 0,
    evaluationReferencesLoaded: 0,
    solverExecutionAuthorized: false,
  };
  if (options.mode === 'dry_run') {
    return { ...plan, filesWritten: 0 };
  }

  const inputs = await loadAndVerifyInputs(dataRoot, manifest);
  const composedAt = latestTimestamp([
    inputs.terrain.receipt.materializedAt,
    inputs.landCover.receipt.acquiredAt,
    inputs.precipitation.receipt.materializedAt,
  ]);
  const precipitationWindow = {
    start: normalizeTimestamp(
      inputs.precipitation.artifact.temporal.actualWindowStart,
    ),
    end: normalizeTimestamp(
      inputs.precipitation.artifact.temporal.actualWindowEnd,
    ),
  };
  const targetPolygon = selection.boundaryBng;
  const targetCellAreaM2 = polygonAreaM2(targetPolygon);
  const terrain = terrainIntersections(
    targetPolygon,
    inputs.terrain,
  );
  const landCover = landCoverIntersections(
    targetPolygon,
    inputs.landCover,
  );
  const precipitation = precipitationIntersections(
    targetPolygon,
    inputs.precipitation,
    precipitationWindow,
  );

  const result = composeSpatialEvidenceIndexCell({
    h3: selection.h3,
    composedAt,
    mode: 'real_evidence',
    areaReference: {
      horizontalCrs: 'EPSG:27700',
      unit: 'm2',
      measurementMethod: 'projected_h3_boundary_shoelace',
      targetCellAreaM2,
    },
    precipitationWindow,
    terrain,
    landCover,
    precipitation,
  });
  assertCompleteRealResult(result);

  const resultSha256 = sha256Bytes(Buffer.from(JSON.stringify(result)));
  const artifactPayload = {
    schemaVersion: 'cumbria-spatial-evidence-cell-artifact-v0.1.0',
    compositionId,
    composedAt,
    selection,
    inputReceipts: {
      terrain: expectedInputReceiptHashes.terrain,
      landCover: expectedInputReceiptHashes.landCover,
      precipitation: expectedInputReceiptHashes.precipitation,
    },
    geometry: {
      version: geometryVersion,
      areaReferenceCrs: 'EPSG:27700',
      targetCellAreaM2,
      nativeFootprintRule:
        'DTM pixel rectangles are clipped directly in EPSG:27700; CLC and IMERG native cells are represented by their four reprojected corners with shared linear edges in EPSG:27700, then polygon-clipped without interpolation',
    },
    intersectionCounts: {
      terrain: terrain.length,
      landCover: landCover.length,
      precipitation: precipitation.length,
    },
    sourceBindings: {
      terrainMasks: inputs.terrain.selectedMasks.map((mask) => ({
        gridRef: mask.gridRef,
        maskSha256: mask.output.sha256,
        sourceRasterSha256: mask.source.rasterSha256,
        sourceArchiveSha256: mask.source.archiveSha256,
        surveyStart: mask.source.surveyStart,
        surveyEnd: mask.source.surveyEnd,
      })),
      landCoverClassGridSha256:
        inputs.landCover.receipt.artifacts.classGrid.sha256,
      precipitationNativeGridSha256:
        inputs.precipitation.receipt.artifact.sha256,
    },
    resultSha256,
    result,
    isolation: {
      networkRequests: 0,
      observedFloodGeometryLoaded: false,
      observedFloodGeometryUsed: false,
      postEventModelUsed: false,
      h3UsedAsSourceOrSolverGrid: false,
      h3Role: 'catalog_inspection_and_evidence_join_only',
      physicalRoutingAllowed: false,
      hydraulicStateAllowed: false,
      solverExecutionAuthorized: false,
      missingValuesSubstitutedWithZero: false,
    },
  };
  const decodedArtifact = normalizedJsonBytes(artifactPayload);
  const compressedArtifact = gzipSync(decodedArtifact, { level: 9, mtime: 0 });
  const artifactContentSha256 = sha256Bytes(decodedArtifact);
  const artifactSha256 = sha256Bytes(compressedArtifact);
  const relativeArtifactPath = path.posix.join(
    'spatial-evidence',
    'h3',
    'sha256',
    `${artifactSha256}.json.gz`,
  );
  const artifactPath = externalPath(dataRoot, relativeArtifactPath);
  const receiptWithoutHash = {
    schemaVersion: 'cumbria-spatial-evidence-cell-receipt-v0.1.0',
    compositionId,
    composedAt,
    status: 'available',
    implementationVersion: SPATIAL_EVIDENCE_INDEX_VERSION,
    geometryVersion,
    selection: {
      rule: selection.rule,
      fixedPointBng: selection.fixedPointBng,
      h3: selection.h3,
      h3Resolution: selection.h3Resolution,
      targetCellAreaM2,
    },
    inputReceipts: artifactPayload.inputReceipts,
    sourceBindings: artifactPayload.sourceBindings,
    intersectionCounts: artifactPayload.intersectionCounts,
    resultSha256,
    resultSummary: {
      terrain: result.terrain.evidence.value,
      landCover: result.landCover.evidence.value,
      precipitation: result.precipitation.evidence.value,
      coverage: {
        terrain: result.terrain.diagnostics,
        landCover: result.landCover.diagnostics,
        precipitation: result.precipitation.diagnostics,
      },
    },
    artifact: {
      relativePath: relativeArtifactPath,
      bytes: compressedArtifact.length,
      decodedBytes: decodedArtifact.length,
      sha256: artifactSha256,
      contentSha256: artifactContentSha256,
      encoding: 'gzip-compressed normalized JSON',
    },
    isolation: artifactPayload.isolation,
  };
  const receipt = {
    ...receiptWithoutHash,
    receiptSha256: sha256Json(receiptWithoutHash),
  };
  assertManifestRealProbe(manifest, receipt);

  if (options.mode === 'check') {
    await assertExistingOutput(dataRoot, receipt, compressedArtifact);
    return {
      ...plan,
      state: 'real_spatial_evidence_cell_verified',
      filesWritten: 0,
      receiptSha256: receipt.receiptSha256,
      resultSha256,
      resultSummary: receipt.resultSummary,
    };
  }

  const stagingDirectory = path.join(dataRoot, 'staging');
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await mkdir(stagingDirectory, { recursive: true });
  let filesWritten = await persistContentAddressed(
    artifactPath,
    compressedArtifact,
    artifactSha256,
    stagingDirectory,
  );
  const receiptPath = path.join(dataRoot, receiptFileName);
  const previous = await readOptionalJson(receiptPath);
  if (previous && JSON.stringify(previous) !== JSON.stringify(receipt)) {
    throw new Error('Existing Cumbria spatial-evidence receipt differs');
  }
  if (!previous) {
    await atomicWriteJson(receiptPath, receipt, stagingDirectory);
    filesWritten += 1;
  }
  return {
    ...plan,
    state: 'real_spatial_evidence_cell_materialized',
    filesWritten,
    receiptPath,
    receiptSha256: receipt.receiptSha256,
    artifact: receipt.artifact,
    resultSha256,
    resultSummary: receipt.resultSummary,
  };
}

function frozenCentroidSelection(manifest) {
  const domain = manifest.publicBaselineProtocol.domain;
  const fixedPointBng = [
    (domain.bounds[0] + domain.bounds[2]) / 2,
    (domain.bounds[1] + domain.bounds[3]) / 2,
  ];
  const [lon, lat] = proj4('EPSG:27700', 'EPSG:4326', fixedPointBng);
  const resolution = manifest.spatialGridProtocol.evidenceIndex.resolution;
  const h3 = latLngToCell(lat, lon, resolution);
  const boundaryWgs84 = cellToBoundary(h3).map(([latitude, longitude]) => [
    longitude,
    latitude,
  ]);
  const boundaryBng = boundaryWgs84.map((coordinate) =>
    proj4('EPSG:4326', 'EPSG:27700', coordinate),
  );
  for (const [x, y] of boundaryBng) {
    if (
      x < domain.bounds[0] ||
      x > domain.bounds[2] ||
      y < domain.bounds[1] ||
      y > domain.bounds[3]
    ) {
      throw new Error('Frozen centroid H3 cell must remain inside the public domain');
    }
  }
  return {
    rule: 'H3 resolution 10 cell containing the exact centre of the frozen public-baseline EPSG:27700 domain; selection is independent of source values and evaluation geometry',
    fixedPointBng,
    fixedPointWgs84: [lon, lat],
    h3,
    h3Resolution: resolution,
    boundaryWgs84,
    boundaryBng,
  };
}

async function loadAndVerifyInputs(dataRoot, manifest) {
  const terrainReceipt = await readReceipt(
    dataRoot,
    manifest.publicBaselineTerrainMaterialization.maskReceipt.fileName,
  );
  assertJavascriptReceiptHash(
    terrainReceipt,
    expectedInputReceiptHashes.terrain,
    'terrain',
  );
  const landCoverReceipt = await readReceipt(
    dataRoot,
    manifest.publicBaselineEnvironmentalMaterialization.landCover.receipt.fileName,
  );
  assertJavascriptReceiptHash(
    landCoverReceipt,
    expectedInputReceiptHashes.landCover,
    'land-cover',
  );
  const precipitationReceipt = await readReceipt(
    dataRoot,
    manifest.publicBaselineEnvironmentalMaterialization.precipitation.receipt.fileName,
  );
  assertPythonReceiptHash(
    precipitationReceipt,
    expectedInputReceiptHashes.precipitation,
    'precipitation',
  );

  const selection = frozenCentroidSelection(manifest);
  const bbox = polygonBounds(selection.boundaryBng);
  const selectedMasks = terrainReceipt.masks.filter((mask) =>
    boundsOverlap(mask.bounds, bbox),
  );
  if (selectedMasks.length === 0) {
    throw new Error('No materialized DTM mask intersects the frozen H3 cell');
  }
  const terrainBuffers = new Map();
  for (const mask of selectedMasks) {
    const compressed = await verifiedArtifactBytes(
      dataRoot,
      mask.output,
      `DTM ${mask.gridRef}`,
    );
    const decoded = gunzipSync(compressed);
    if (
      decoded.length !== mask.output.decodedByteLength ||
      sha256Bytes(decoded) !== mask.output.pixelSha256
    ) {
      throw new Error(`DTM ${mask.gridRef} decoded pixels failed integrity check`);
    }
    terrainBuffers.set(mask.gridRef, decoded);
  }

  const classGridCompressed = await verifiedArtifactBytes(
    dataRoot,
    landCoverReceipt.artifacts.classGrid,
    'CLC class grid',
  );
  const classGrid = gunzipSync(classGridCompressed);
  const expectedClcBytes =
    landCoverReceipt.sourceGrid.width *
    landCoverReceipt.sourceGrid.height *
    Int16Array.BYTES_PER_ELEMENT;
  if (classGrid.length !== expectedClcBytes) {
    throw new Error('CLC decoded class grid has an invalid byte length');
  }

  const precipitationBytes = await verifiedArtifactBytes(
    dataRoot,
    precipitationReceipt.artifact,
    'IMERG native grid',
  );
  const precipitationArtifact = JSON.parse(precipitationBytes.toString('utf8'));
  assertImergArtifact(precipitationArtifact, precipitationReceipt);

  return {
    terrain: {
      receipt: terrainReceipt,
      selectedMasks,
      buffers: terrainBuffers,
    },
    landCover: { receipt: landCoverReceipt, classGrid },
    precipitation: {
      receipt: precipitationReceipt,
      artifact: precipitationArtifact,
    },
  };
}

function terrainIntersections(targetPolygon, terrain) {
  const bbox = polygonBounds(targetPolygon);
  const intersections = [];
  for (const mask of terrain.selectedMasks) {
    const bytes = terrain.buffers.get(mask.gridRef);
    const [west, south, east, north] = mask.bounds;
    const columnStart = clampInteger(Math.floor(Math.max(west, bbox[0]) - west));
    const columnEnd = clampInteger(Math.ceil(Math.min(east, bbox[2]) - west));
    const rowStart = clampInteger(Math.floor(north - Math.min(north, bbox[3])));
    const rowEnd = clampInteger(Math.ceil(north - Math.max(south, bbox[1])));
    for (let row = rowStart; row < rowEnd; row += 1) {
      for (let column = columnStart; column < columnEnd; column += 1) {
        const cellNorth = north - row;
        const cellPolygon = rectanglePolygon([
          west + column,
          cellNorth - 1,
          west + column + 1,
          cellNorth,
        ]);
        const intersectionAreaM2 = polygonAreaM2(
          intersectConvexPolygons(targetPolygon, cellPolygon),
        );
        if (intersectionAreaM2 <= 1e-9) {
          continue;
        }
        const value = bytes.readFloatLE((row * 1000 + column) * 4);
        const id = `dtm:${mask.gridRef}:r${row}:c${column}`;
        const descriptor = {
          unit: 'm',
          spatial: { sourceResolution: '1 m native DTM' },
          temporal: { acquiredAt: terrain.receipt.materializedAt },
          provenance: {
            provider: 'Environment Agency',
            dataset: 'LIDAR DTM Time Stamped Tiles',
            datasetVersion: `${mask.source.surveyStart}/${mask.source.surveyEnd}`,
            transformation: 'native 1 m masked DTM cell extraction',
            transformationVersion: geometryVersion,
            samplingMethod: 'exact native pixel-footprint overlap in EPSG:27700',
            sourceMetadata: {
              gridRef: mask.gridRef,
              row,
              column,
              maskSha256: mask.output.sha256,
              sourceRasterSha256: mask.source.rasterSha256,
              sourceArchiveSha256: mask.source.archiveSha256,
              surveyStart: mask.source.surveyStart,
              surveyEnd: mask.source.surveyEnd,
              verticalDatum: terrain.receipt.verticalDatum,
            },
          },
        };
        const missing = value === mask.output.noData || value <= -3e38;
        intersections.push({
          id,
          intersectionAreaM2,
          sourceResolutionMetres: 1,
          evidence: missing
            ? unavailableEvidence(
                'out_of_coverage',
                'The provider-declared DTM cell is NoData',
                descriptor,
              )
            : availableEvidence(value, descriptor),
        });
      }
    }
  }
  return intersections;
}

function landCoverIntersections(targetPolygon, landCover) {
  const grid = landCover.receipt.sourceGrid;
  const targetInSource = targetPolygon.map((coordinate) =>
    proj4('EPSG:27700', 'EPSG:3035', coordinate),
  );
  const bbox = polygonBounds(targetInSource);
  const [west, south, east, north] = grid.bounds;
  const size = grid.cellSizeMetres;
  const columnStart = clampInteger(
    Math.floor((Math.max(west, bbox[0]) - west) / size),
    grid.width,
  );
  const columnEnd = clampInteger(
    Math.ceil((Math.min(east, bbox[2]) - west) / size),
    grid.width,
  );
  const rowStart = clampInteger(
    Math.floor((north - Math.min(north, bbox[3])) / size),
    grid.height,
  );
  const rowEnd = clampInteger(
    Math.ceil((north - Math.max(south, bbox[1])) / size),
    grid.height,
  );
  const intersections = [];
  for (let row = rowStart; row < rowEnd; row += 1) {
    for (let column = columnStart; column < columnEnd; column += 1) {
      const cellNorth = north - row * size;
      const sourceBounds = [
        west + column * size,
        cellNorth - size,
        west + (column + 1) * size,
        cellNorth,
      ];
      const cellBng = rectanglePolygon(sourceBounds).map((coordinate) =>
        proj4('EPSG:3035', 'EPSG:27700', coordinate),
      );
      const intersectionAreaM2 = polygonAreaM2(
        intersectConvexPolygons(targetPolygon, cellBng),
      );
      if (intersectionAreaM2 <= 1e-9) {
        continue;
      }
      const value = landCover.classGrid.readInt16LE(
        (row * grid.width + column) * Int16Array.BYTES_PER_ELEMENT,
      );
      const descriptor = {
        unit: 'CLC class code',
        spatial: {
          sourceResolution: landCover.receipt.sourceResolution,
        },
        temporal: { acquiredAt: landCover.receipt.acquiredAt },
        provenance: {
          provider: landCover.receipt.provider,
          dataset: landCover.receipt.dataset,
          datasetVersion: landCover.receipt.datasetVersion,
          transformation: landCover.receipt.transformation.name,
          transformationVersion: geometryVersion,
          samplingMethod:
            'native categorical cell footprint reprojected to EPSG:27700; no interpolation',
          sourceMetadata: {
            row,
            column,
            sourceBounds,
            classGridSha256: landCover.receipt.artifacts.classGrid.sha256,
            referenceYears: landCover.receipt.referenceYears,
            minimumMappingUnitHectares: 25,
          },
        },
      };
      intersections.push({
        id: `clc:r${row}:c${column}`,
        intersectionAreaM2,
        evidence:
          value === -1
            ? unavailableEvidence(
                'out_of_coverage',
                'The native CLC cell is unclassified',
                descriptor,
              )
            : availableEvidence(value, descriptor),
      });
    }
  }
  return intersections;
}

function precipitationIntersections(
  targetPolygon,
  precipitation,
  precipitationWindow,
) {
  const sourceGrid = precipitation.artifact.sourceGrid;
  const longitudeEdges = coordinateEdges(sourceGrid.longitude);
  const latitudeEdges = coordinateEdges(sourceGrid.latitude);
  const intersections = [];
  for (let longitudeIndex = 0; longitudeIndex < sourceGrid.longitude.length; longitudeIndex += 1) {
    for (let latitudeIndex = 0; latitudeIndex < sourceGrid.latitude.length; latitudeIndex += 1) {
      const sourceBounds = [
        longitudeEdges[longitudeIndex],
        latitudeEdges[latitudeIndex],
        longitudeEdges[longitudeIndex + 1],
        latitudeEdges[latitudeIndex + 1],
      ];
      const cellBng = rectanglePolygon(sourceBounds).map((coordinate) =>
        proj4('EPSG:4326', 'EPSG:27700', coordinate),
      );
      const intersectionAreaM2 = polygonAreaM2(
        intersectConvexPolygons(targetPolygon, cellBng),
      );
      if (intersectionAreaM2 <= 1e-9) {
        continue;
      }
      const value = sourceGrid.precipitationMm[longitudeIndex][latitudeIndex];
      const descriptor = {
        unit: 'mm',
        spatial: {
          sourceResolution: `${precipitation.artifact.sourceResolution}; ${precipitation.artifact.sourceTemporalResolution}`,
        },
        temporal: {
          windowStart: precipitationWindow.start,
          windowEnd: precipitationWindow.end,
          acquiredAt: precipitation.artifact.temporal.acquiredAt,
        },
        provenance: {
          provider: precipitation.artifact.provenance.provider,
          dataset: precipitation.artifact.provenance.dataset,
          datasetVersion: precipitation.artifact.provenance.datasetVersion,
          transformation: precipitation.artifact.provenance.transformation,
          transformationVersion: geometryVersion,
          samplingMethod:
            'native 0.1-degree cell footprint reprojected to EPSG:27700; 72-hour accumulation retained',
          sourceMetadata: {
            longitudeIndex,
            latitudeIndex,
            sourceBounds,
            nativeGridSha256: precipitation.receipt.artifact.sha256,
            runType: precipitation.artifact.provenance.runType,
            granuleCount: precipitation.artifact.provenance.granuleCount,
            expectedGranuleCount:
              precipitation.artifact.provenance.expectedGranuleCount,
            canonicalAcquisitionPath:
              precipitation.artifact.provenance.canonicalAcquisitionPath,
          },
        },
      };
      intersections.push({
        id: `imerg:lon${longitudeIndex}:lat${latitudeIndex}`,
        intersectionAreaM2,
        evidence: Number.isFinite(value)
          ? availableEvidence(value, descriptor)
          : unavailableEvidence(
              'missing',
              'The native IMERG accumulation is not finite',
              descriptor,
            ),
      });
    }
  }
  return intersections;
}

function assertCompleteRealResult(result) {
  if (
    result.mode !== 'real_evidence' ||
    result.physicalRoutingAllowed !== false ||
    result.hydraulicStateAllowed !== false
  ) {
    throw new Error('Spatial evidence result violated the H3 role boundary');
  }
  for (const [name, layer] of Object.entries({
    terrain: result.terrain,
    landCover: result.landCover,
    precipitation: result.precipitation,
  })) {
    if (
      layer.evidence.quality.status !== 'available' ||
      layer.evidence.value === null ||
      !layer.diagnostics.complete ||
      layer.diagnostics.missingFraction > 1e-6
    ) {
      throw new Error(
        `Frozen H3 probe has incomplete ${name} evidence: ${JSON.stringify(
          layer.diagnostics,
        )}`,
      );
    }
  }
}

function assertManifestRealProbe(manifest, receipt) {
  const probe =
    manifest.spatialGridProtocol?.evidenceIndex?.composition?.realEvidenceProbe;
  const expected = {
    id: receipt.compositionId,
    h3: receipt.selection.h3,
    h3Resolution: receipt.selection.h3Resolution,
    composedAt: receipt.composedAt,
    targetCellAreaM2: receipt.selection.targetCellAreaM2,
    inputReceiptSha256: receipt.inputReceipts,
    intersectionCounts: receipt.intersectionCounts,
    resultSha256: receipt.resultSha256,
    receiptSha256: receipt.receiptSha256,
    artifact: {
      sha256: receipt.artifact.sha256,
      contentSha256: receipt.artifact.contentSha256,
      compressedBytes: receipt.artifact.bytes,
      decodedBytes: receipt.artifact.decodedBytes,
    },
  };
  const actual = {
    id: probe?.id,
    h3: probe?.h3,
    h3Resolution: probe?.h3Resolution,
    composedAt: probe?.composedAt,
    targetCellAreaM2: probe?.targetCellAreaM2,
    inputReceiptSha256: probe?.inputReceiptSha256,
    intersectionCounts: probe?.intersectionCounts,
    resultSha256: probe?.resultSha256,
    receiptSha256: probe?.receipt?.sha256,
    artifact: probe?.artifact,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Cumbria manifest real-evidence probe differs from the reproduced receipt: ${JSON.stringify(
        { expected, actual },
      )}`,
    );
  }
}

function assertImergArtifact(artifact, receipt) {
  if (
    artifact.schemaVersion !== 'canonical-imerg-source-grid-v0.2.0' ||
    artifact.datasetId !== 'nasa-imerg-v07-final' ||
    artifact.status !== 'available' ||
    artifact.unit !== 'mm' ||
    artifact.provenance.datasetVersion !== '07' ||
    artifact.provenance.runType !== 'final' ||
    artifact.provenance.granuleCount !== 144 ||
    artifact.provenance.expectedGranuleCount !== 144 ||
    artifact.sourceGrid.valueOrder !== 'longitude_major_latitude_minor' ||
    artifact.sourceGrid.longitude.length !== receipt.gridShape[1] ||
    artifact.sourceGrid.latitude.length !== receipt.gridShape[0] ||
    artifact.sourceGrid.precipitationMm.length !== receipt.gridShape[1] ||
    artifact.sourceGrid.precipitationMm.some(
      (row) => row.length !== receipt.gridShape[0],
    )
  ) {
    throw new Error('IMERG native-grid artifact does not match its receipt');
  }
}

function rectanglePolygon([west, south, east, north]) {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
}

function polygonBounds(points) {
  const x = points.map((point) => point[0]);
  const y = points.map((point) => point[1]);
  return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
}

function boundsOverlap(left, right) {
  return (
    left[0] < right[2] &&
    left[2] > right[0] &&
    left[1] < right[3] &&
    left[3] > right[1]
  );
}

function signedPolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [leftX, leftY] = points[index];
    const [rightX, rightY] = points[(index + 1) % points.length];
    twiceArea += leftX * rightY - rightX * leftY;
  }
  return twiceArea / 2;
}

function isInside(point, edgeStart, edgeEnd, orientation) {
  const edgeX = edgeEnd[0] - edgeStart[0];
  const edgeY = edgeEnd[1] - edgeStart[1];
  const pointX = point[0] - edgeStart[0];
  const pointY = point[1] - edgeStart[1];
  return orientation * (edgeX * pointY - edgeY * pointX) >= -1e-9;
}

function lineIntersection(start, end, clipStart, clipEnd) {
  const line = [end[0] - start[0], end[1] - start[1]];
  const clip = [clipEnd[0] - clipStart[0], clipEnd[1] - clipStart[1]];
  const denominator = line[0] * clip[1] - line[1] * clip[0];
  if (Math.abs(denominator) < 1e-15) {
    return [...end];
  }
  const offset = [clipStart[0] - start[0], clipStart[1] - start[1]];
  const fraction = (offset[0] * clip[1] - offset[1] * clip[0]) / denominator;
  return [
    start[0] + line[0] * fraction,
    start[1] + line[1] * fraction,
  ];
}

function removeAdjacentDuplicates(points) {
  const result = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (
      previous === undefined ||
      Math.abs(previous[0] - point[0]) > 1e-9 ||
      Math.abs(previous[1] - point[1]) > 1e-9
    ) {
      result.push(point);
    }
  }
  if (
    result.length > 1 &&
    Math.abs(result[0][0] - result[result.length - 1][0]) <= 1e-9 &&
    Math.abs(result[0][1] - result[result.length - 1][1]) <= 1e-9
  ) {
    result.pop();
  }
  return result;
}

function clampInteger(value, maximum = 1000) {
  return Math.max(0, Math.min(maximum, value));
}

function latestTimestamp(values) {
  const latest = Math.max(...values.map((value) => Date.parse(value)));
  if (!Number.isFinite(latest)) {
    throw new Error('Source acquisition timestamps are invalid');
  }
  return new Date(latest).toISOString();
}

function normalizeTimestamp(value) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Invalid source timestamp ${String(value)}`);
  }
  return new Date(milliseconds).toISOString();
}

async function readReceipt(dataRoot, fileName) {
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) {
    throw new Error('Input receipt file name is not portable');
  }
  return JSON.parse(await readFile(path.join(dataRoot, fileName), 'utf8'));
}

function assertJavascriptReceiptHash(receipt, expected, label) {
  const { receiptSha256, ...withoutHash } = receipt;
  if (
    receiptSha256 !== expected ||
    sha256Json(withoutHash) !== receiptSha256
  ) {
    throw new Error(`${label} receipt SHA-256 does not match content`);
  }
}

function assertPythonReceiptHash(receipt, expected, label) {
  const { receiptSha256, ...withoutHash } = receipt;
  if (
    receiptSha256 !== expected ||
    sha256Bytes(Buffer.from(canonicalJson(withoutHash))) !== receiptSha256
  ) {
    throw new Error(`${label} receipt SHA-256 does not match content`);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function verifiedArtifactBytes(dataRoot, descriptor, label) {
  if (
    typeof descriptor?.relativePath !== 'string' ||
    !Number.isSafeInteger(descriptor.bytes ?? descriptor.byteLength) ||
    !/^[a-f0-9]{64}$/.test(descriptor.sha256)
  ) {
    throw new Error(`${label} artifact descriptor is invalid`);
  }
  const target = externalPath(dataRoot, descriptor.relativePath);
  const bytes = await readFile(target);
  const expectedBytes = descriptor.bytes ?? descriptor.byteLength;
  if (bytes.length !== expectedBytes || sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error(`${label} artifact failed byte-count or SHA-256 verification`);
  }
  return bytes;
}

function externalPath(dataRoot, relativePath) {
  const target = path.resolve(dataRoot, relativePath);
  const relative = path.relative(dataRoot, target);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Artifact path escapes the data root: ${relativePath}`);
  }
  return target;
}

async function persistContentAddressed(
  target,
  bytes,
  expectedSha256,
  stagingDirectory,
) {
  try {
    const info = await stat(target);
    if (!info.isFile() || info.size !== bytes.length) {
      throw new Error(`Spatial-evidence artifact drifted: ${target}`);
    }
    const existing = await readFile(target);
    if (sha256Bytes(existing) !== expectedSha256) {
      throw new Error(`Spatial-evidence artifact hash drifted: ${target}`);
    }
    return 0;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  const partial = path.join(
    stagingDirectory,
    `${expectedSha256}.${process.pid}.part`,
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
  await rename(partial, target);
  return 1;
}

async function assertExistingOutput(dataRoot, expectedReceipt, expectedArtifact) {
  const receiptPath = path.join(dataRoot, receiptFileName);
  const receipt = await readOptionalJson(receiptPath);
  if (!receipt || JSON.stringify(receipt) !== JSON.stringify(expectedReceipt)) {
    throw new Error('Cumbria spatial-evidence receipt is missing or drifted');
  }
  const artifactPath = externalPath(
    dataRoot,
    expectedReceipt.artifact.relativePath,
  );
  const artifact = await readFile(artifactPath);
  if (!artifact.equals(expectedArtifact)) {
    throw new Error('Cumbria spatial-evidence artifact is missing or drifted');
  }
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

function normalizedJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value)));
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCumbriaSpatialEvidenceMaterializer(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(
        `Cumbria spatial-evidence materialization failed: ${error.message}`,
      );
      process.exitCode = 1;
    });
}
