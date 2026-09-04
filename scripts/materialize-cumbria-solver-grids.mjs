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

import proj4 from 'proj4';

import { assertCumbriaAccessManifest } from '../packages/evidence/dist/index.js';
import {
  ensureExternalDataRoot,
  intersectConvexPolygons,
  polygonAreaM2,
} from './materialize-cumbria-spatial-evidence-cell.mjs';

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
  'cumbria-public-baseline-solver-grids.receipt.json';
const materializationId = 'cumbria-public-solver-grids-v0';
const transformationVersion = 'cumbria-solver-grid-preprocessing-v0.1.0';
const baselineTag = 'pre-external-evidence-baseline-v1';
const baselineCommit = '938b18fb66925e36236ea04a49eefdb2ca9826cb';
const floatNoData = -3.4028234663852886e38;
const landCoverCoverageToleranceFraction = 0.000001;

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

export function aggregateCompleteBlocks(
  decoded,
  width,
  height,
  blockSize,
  noData = floatNoData,
) {
  if (
    !Buffer.isBuffer(decoded) ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    !Number.isSafeInteger(blockSize) ||
    width <= 0 ||
    height <= 0 ||
    blockSize <= 0 ||
    width % blockSize !== 0 ||
    height % blockSize !== 0 ||
    decoded.length !== width * height * Float32Array.BYTES_PER_ELEMENT
  ) {
    throw new Error('Terrain block dimensions or byte length are invalid');
  }

  const stride = width + 1;
  const prefixSums = new Float64Array((width + 1) * (height + 1));
  const prefixCounts = new Uint32Array((width + 1) * (height + 1));
  for (let row = 0; row < height; row += 1) {
    let rowSum = 0;
    let rowCount = 0;
    for (let column = 0; column < width; column += 1) {
      const value = decoded.readFloatLE((row * width + column) * 4);
      if (Number.isFinite(value) && value !== noData && value > -3e38) {
        rowSum += value;
        rowCount += 1;
      }
      const target = (row + 1) * stride + column + 1;
      prefixSums[target] = prefixSums[row * stride + column + 1] + rowSum;
      prefixCounts[target] =
        prefixCounts[row * stride + column + 1] + rowCount;
    }
  }

  const outputWidth = width / blockSize;
  const outputHeight = height / blockSize;
  const values = new Float64Array(outputWidth * outputHeight);
  values.fill(Number.NaN);
  const valid = new Uint8Array(values.length);
  const expectedCount = blockSize * blockSize;
  for (let row = 0; row < outputHeight; row += 1) {
    const rowStart = row * blockSize;
    const rowEnd = rowStart + blockSize;
    for (let column = 0; column < outputWidth; column += 1) {
      const columnStart = column * blockSize;
      const columnEnd = columnStart + blockSize;
      const count = prefixRectangle(
        prefixCounts,
        stride,
        rowStart,
        columnStart,
        rowEnd,
        columnEnd,
      );
      if (count !== expectedCount) {
        continue;
      }
      const sum = prefixRectangle(
        prefixSums,
        stride,
        rowStart,
        columnStart,
        rowEnd,
        columnEnd,
      );
      const index = row * outputWidth + column;
      values[index] = sum / expectedCount;
      valid[index] = 1;
    }
  }
  return { width: outputWidth, height: outputHeight, values, valid };
}

export function computePredictionEligibilityMask(
  valid,
  width,
  height,
  haloCells = 1,
) {
  if (
    !(valid instanceof Uint8Array) ||
    valid.length !== width * height ||
    !Number.isSafeInteger(haloCells) ||
    haloCells < 0
  ) {
    throw new Error('Prediction eligibility inputs are invalid');
  }
  const eligible = new Uint8Array(valid);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      if (valid[index] !== 1) {
        eligible[index] = 0;
        continue;
      }
      let touchesMissing = false;
      for (
        let neighbourRow = Math.max(0, row - haloCells);
        neighbourRow <= Math.min(height - 1, row + haloCells) && !touchesMissing;
        neighbourRow += 1
      ) {
        for (
          let neighbourColumn = Math.max(0, column - haloCells);
          neighbourColumn <= Math.min(width - 1, column + haloCells);
          neighbourColumn += 1
        ) {
          if (valid[neighbourRow * width + neighbourColumn] !== 1) {
            touchesMissing = true;
            break;
          }
        }
      }
      if (touchesMissing) {
        eligible[index] = 0;
      }
    }
  }
  return eligible;
}

export function weightedParameterSummary(
  contributions,
  targetAreaM2,
  toleranceFraction = landCoverCoverageToleranceFraction,
) {
  if (
    !Array.isArray(contributions) ||
    !Number.isFinite(targetAreaM2) ||
    targetAreaM2 <= 0
  ) {
    throw new Error('Land-cover contribution inputs are invalid');
  }
  const byClass = new Map();
  for (const contribution of contributions) {
    if (
      !Number.isSafeInteger(contribution.classCode) ||
      !Number.isFinite(contribution.areaM2) ||
      contribution.areaM2 < 0
    ) {
      throw new Error('Land-cover contribution is invalid');
    }
    const previous = byClass.get(contribution.classCode) ?? {
      areaM2: 0,
      runoffCoefficient: contribution.runoffCoefficient,
      manningN: contribution.manningN,
    };
    previous.areaM2 += contribution.areaM2;
    byClass.set(contribution.classCode, previous);
  }
  const totalAreaM2 = [...byClass.values()].reduce(
    (total, value) => total + value.areaM2,
    0,
  );
  if (
    Math.abs(totalAreaM2 - targetAreaM2) >
    targetAreaM2 * toleranceFraction
  ) {
    return { available: false, totalAreaM2 };
  }
  const weighted = {
    runoffCoefficient: { low: 0, primary: 0, high: 0 },
    manningN: { low: 0, primary: 0, high: 0 },
  };
  let dominantClass = undefined;
  let dominantAreaM2 = -1;
  for (const [classCode, value] of byClass) {
    for (const parameterSet of ['low', 'primary', 'high']) {
      weighted.runoffCoefficient[parameterSet] +=
        value.runoffCoefficient[parameterSet] * value.areaM2 / totalAreaM2;
      weighted.manningN[parameterSet] +=
        value.manningN[parameterSet] * value.areaM2 / totalAreaM2;
    }
    if (
      value.areaM2 > dominantAreaM2 ||
      (value.areaM2 === dominantAreaM2 && classCode < dominantClass)
    ) {
      dominantClass = classCode;
      dominantAreaM2 = value.areaM2;
    }
  }
  return {
    available: true,
    totalAreaM2,
    classCount: byClass.size,
    dominantClass,
    dominantClassFraction: dominantAreaM2 / totalAreaM2,
    ...weighted,
  };
}

export async function runCumbriaSolverGridMaterializer(arguments_) {
  const options = parseArguments(arguments_);
  const dataRoot = path.resolve(options.dataRoot);
  ensureExternalDataRoot(dataRoot, repositoryRoot);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assertCumbriaAccessManifest(manifest);
  const protocol = manifest.replacementSolverProtocol;
  const meshes = [protocol.meshes.primary, ...protocol.meshes.sensitivities];
  const plan = {
    schemaVersion: 'cumbria-solver-grid-materialization-plan-v0.1.0',
    materializationId,
    mode: options.mode,
    dataRoot,
    baseline: { tag: baselineTag, commit: baselineCommit },
    protocol: {
      id: protocol.id,
      version: protocol.version,
      sha256: protocol.protocolSha256,
    },
    domain: protocol.domain,
    meshes: meshes.map((mesh) => ({
      id: mesh.id,
      cellSizeMetres: mesh.cellSizeMetres,
      width: mesh.width,
      height: mesh.height,
      cellCount: mesh.cellCount,
    })),
    transformations: {
      terrain: protocol.meshes.terrainAggregation,
      landCover: protocol.forcing.landCoverParameters.transformation,
      missingTerrain: protocol.meshes.missingTerrainPolicy,
      predictionHaloCells: protocol.meshes.missingBoundaryExclusionCells,
    },
    estimatedDecodedOutputBytes: meshes.reduce(
      (total, mesh) => total + mesh.cellCount * 35,
      0,
    ),
    networkRequests: 0,
    evaluationReferencesLoaded: 0,
    solverRuns: 0,
  };
  if (options.mode === 'dry_run') {
    return { ...plan, filesWritten: 0 };
  }

  const inputs = await loadAndVerifyInputs(dataRoot, manifest);
  const meshStates = createMeshStates(meshes);
  await materializeTerrain(inputs.terrain, meshStates, protocol.domain);
  materializeLandCover(
    inputs.landCover,
    meshStates,
    protocol.domain,
    protocol.forcing.landCoverParameters.classes,
  );
  finalizeMeshStates(
    meshStates,
    protocol.meshes.missingBoundaryExclusionCells,
  );

  const scriptBytes = await readFile(fileURLToPath(import.meta.url));
  const scriptSha256 = sha256Bytes(scriptBytes);
  const generated = meshStates.map((meshState) =>
    generatedMeshArtifacts(meshState, dataRoot),
  );
  const receiptPath = path.join(dataRoot, receiptFileName);
  const previous = await readOptionalJson(receiptPath);
  const materializedAt = previous?.materializedAt ?? new Date().toISOString();
  const receiptWithoutHash = {
    schemaVersion: 'cumbria-solver-grid-receipt-v0.1.0',
    materializationId,
    materializedAt,
    baseline: { tag: baselineTag, commit: baselineCommit },
    protocol: {
      id: protocol.id,
      version: protocol.version,
      sha256: protocol.protocolSha256,
    },
    transformation: {
      version: transformationVersion,
      scriptSha256,
      terrainAggregation:
        'arithmetic mean of every native 1 m value in the aligned solver cell; equivalent to area-weighted mean because every contributing native pixel has equal area',
      completeNativeTerrainCoverageRequiredPerCell: true,
      landCoverAggregation:
        'exact projected native CLC footprint overlap followed by area-weighted parameter aggregation; categorical interpolation forbidden',
      landCoverCoverageToleranceFraction,
      predictionHaloCells: protocol.meshes.missingBoundaryExclusionCells,
      missingValueEncoding: {
        floatNoData,
        explicitValidityMasks: true,
        missingSubstitutedWithZero: false,
      },
    },
    domain: {
      horizontalCrs: protocol.domain.horizontalCrs,
      verticalDatum: protocol.domain.verticalDatum,
      bounds: protocol.domain.bounds,
      originUpperLeft: protocol.domain.originUpperLeft,
      rowOrder: protocol.domain.rowOrder,
    },
    sourceReceipts: {
      terrain: {
        fileName:
          manifest.publicBaselineTerrainMaterialization.maskReceipt.fileName,
        sha256:
          manifest.publicBaselineTerrainMaterialization.maskReceipt.sha256,
      },
      landCover: {
        fileName:
          manifest.publicBaselineEnvironmentalMaterialization.landCover.receipt
            .fileName,
        sha256:
          manifest.publicBaselineEnvironmentalMaterialization.landCover.receipt
            .sha256,
        classGridSha256: inputs.landCover.receipt.artifacts.classGrid.sha256,
      },
    },
    meshes: generated.map((entry) => entry.receipt),
    isolation: {
      h3UsedAsSourceOrSolverGrid: false,
      observedFloodGeometryLoaded: false,
      observedFloodGeometryUsed: false,
      externalOwnerPackageLoaded: false,
      networkRequests: 0,
      solverRuns: 0,
      evaluationRuns: 0,
      solverExecutionAuthorized: false,
    },
  };
  const receipt = {
    ...receiptWithoutHash,
    receiptSha256: sha256Json(receiptWithoutHash),
  };

  if (previous && canonicalJson(previous) !== canonicalJson(receipt)) {
    throw new Error('Existing Cumbria solver-grid receipt differs from output');
  }
  let filesWritten = 0;
  if (options.mode === 'check') {
    if (!previous) {
      throw new Error('Cumbria solver-grid receipt is missing');
    }
    for (const entry of generated) {
      for (const artifact of entry.generatedArtifacts) {
        await verifyPersistedArtifact(dataRoot, artifact.descriptor);
      }
    }
  } else {
    const stagingDirectory = path.join(dataRoot, 'staging');
    await mkdir(stagingDirectory, { recursive: true });
    for (const entry of generated) {
      for (const artifact of entry.generatedArtifacts) {
        filesWritten += await persistContentAddressed(
          externalPath(dataRoot, artifact.descriptor.relativePath),
          artifact.compressed,
          artifact.descriptor.sha256,
          stagingDirectory,
        );
      }
    }
    if (!previous) {
      await atomicWriteJson(receiptPath, receipt, stagingDirectory);
      filesWritten += 1;
    }
  }

  return {
    ...plan,
    state: 'static_solver_grids_materialized_execution_still_blocked',
    receiptPath,
    receiptSha256: receipt.receiptSha256,
    meshSummaries: receipt.meshes.map((mesh) => mesh.summary),
    filesWritten,
  };
}

function prefixRectangle(
  prefix,
  stride,
  rowStart,
  columnStart,
  rowEnd,
  columnEnd,
) {
  return (
    prefix[rowEnd * stride + columnEnd] -
    prefix[rowStart * stride + columnEnd] -
    prefix[rowEnd * stride + columnStart] +
    prefix[rowStart * stride + columnStart]
  );
}

function createMeshStates(meshes) {
  return meshes.map((mesh) => {
    const state = {
      ...mesh,
      elevationM: new Float64Array(mesh.cellCount),
      terrainValid: new Uint8Array(mesh.cellCount),
      landCoverValid: new Uint8Array(mesh.cellCount),
      solverValid: new Uint8Array(mesh.cellCount),
      predictionEligible: new Uint8Array(mesh.cellCount),
      dominantClcClass: new Int16Array(mesh.cellCount),
      clcClassCount: new Uint8Array(mesh.cellCount),
      clcCoverageAreaM2: new Float64Array(mesh.cellCount),
      classAreas: new Map(),
      runoffCoefficient: createParameterArrays(mesh.cellCount),
      manningN: createParameterArrays(mesh.cellCount),
    };
    state.elevationM.fill(Number.NaN);
    state.dominantClcClass.fill(-1);
    for (const values of Object.values(state.runoffCoefficient)) {
      values.fill(Number.NaN);
    }
    for (const values of Object.values(state.manningN)) {
      values.fill(Number.NaN);
    }
    return state;
  });
}

function createParameterArrays(cellCount) {
  return {
    low: new Float64Array(cellCount),
    primary: new Float64Array(cellCount),
    high: new Float64Array(cellCount),
  };
}

async function materializeTerrain(terrain, meshStates, domain) {
  const [domainWest, , , domainNorth] = [
    domain.bounds[0],
    domain.bounds[1],
    domain.bounds[2],
    domain.bounds[3],
  ];
  for (const mask of terrain.receipt.masks) {
    const compressed = await verifiedArtifactBytes(
      terrain.dataRoot,
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
    const [west, , , north] = mask.bounds;
    for (const meshState of meshStates) {
      const aggregated = aggregateCompleteBlocks(
        decoded,
        terrain.receipt.gridWidthPixels,
        terrain.receipt.gridHeightPixels,
        meshState.cellSizeMetres,
        mask.output.noData,
      );
      const columnOffset = (west - domainWest) / meshState.cellSizeMetres;
      const rowOffset = (domainNorth - north) / meshState.cellSizeMetres;
      if (!Number.isSafeInteger(columnOffset) || !Number.isSafeInteger(rowOffset)) {
        throw new Error(`DTM ${mask.gridRef} is not aligned to ${meshState.id}`);
      }
      for (let row = 0; row < aggregated.height; row += 1) {
        for (let column = 0; column < aggregated.width; column += 1) {
          const sourceIndex = row * aggregated.width + column;
          if (aggregated.valid[sourceIndex] !== 1) {
            continue;
          }
          const targetRow = rowOffset + row;
          const targetColumn = columnOffset + column;
          if (
            targetRow < 0 ||
            targetRow >= meshState.height ||
            targetColumn < 0 ||
            targetColumn >= meshState.width
          ) {
            throw new Error(`DTM ${mask.gridRef} escaped ${meshState.id}`);
          }
          const targetIndex = targetRow * meshState.width + targetColumn;
          if (meshState.terrainValid[targetIndex] === 1) {
            throw new Error(`DTM overlap detected in ${meshState.id}`);
          }
          meshState.elevationM[targetIndex] = aggregated.values[sourceIndex];
          meshState.terrainValid[targetIndex] = 1;
        }
      }
    }
  }
}

function materializeLandCover(
  landCover,
  meshStates,
  domain,
  classParameters,
) {
  const parameterByClass = new Map(
    classParameters.map((entry, index) => [entry.classCode, { ...entry, index }]),
  );
  for (const meshState of meshStates) {
    for (const entry of classParameters) {
      meshState.classAreas.set(
        entry.classCode,
        new Float64Array(meshState.cellCount),
      );
    }
  }
  const grid = landCover.receipt.sourceGrid;
  const [sourceWest, , , sourceNorth] = grid.bounds;
  for (let row = 0; row < grid.height; row += 1) {
    for (let column = 0; column < grid.width; column += 1) {
      const classCode = landCover.classGrid.readInt16LE(
        (row * grid.width + column) * Int16Array.BYTES_PER_ELEMENT,
      );
      if (classCode === -1) {
        continue;
      }
      const parameters = parameterByClass.get(classCode);
      if (!parameters) {
        throw new Error(`CLC class ${classCode} has no frozen parameters`);
      }
      const cellNorth = sourceNorth - row * grid.cellSizeMetres;
      const sourcePolygon = rectanglePolygon([
        sourceWest + column * grid.cellSizeMetres,
        cellNorth - grid.cellSizeMetres,
        sourceWest + (column + 1) * grid.cellSizeMetres,
        cellNorth,
      ]).map((coordinate) =>
        proj4('EPSG:3035', 'EPSG:27700', coordinate),
      );
      const bounds = polygonBounds(sourcePolygon);
      for (const meshState of meshStates) {
        accumulateClassFootprint(
          meshState,
          sourcePolygon,
          bounds,
          parameters,
          domain.bounds,
        );
      }
    }
  }

  for (const meshState of meshStates) {
    const targetAreaM2 = meshState.cellSizeMetres ** 2;
    const tolerance = targetAreaM2 * landCoverCoverageToleranceFraction;
    for (let index = 0; index < meshState.cellCount; index += 1) {
      const totalAreaM2 = meshState.clcCoverageAreaM2[index];
      if (Math.abs(totalAreaM2 - targetAreaM2) > tolerance) {
        continue;
      }
      let classCount = 0;
      let dominantClass = -1;
      let dominantAreaM2 = -1;
      for (const parameters of parameterByClass.values()) {
        const areaM2 = meshState.classAreas.get(parameters.classCode)[index];
        if (areaM2 <= 0) {
          continue;
        }
        classCount += 1;
        if (
          areaM2 > dominantAreaM2 ||
          (areaM2 === dominantAreaM2 && parameters.classCode < dominantClass)
        ) {
          dominantClass = parameters.classCode;
          dominantAreaM2 = areaM2;
        }
      }
      meshState.landCoverValid[index] = 1;
      meshState.clcClassCount[index] = classCount;
      meshState.dominantClcClass[index] = dominantClass;
      for (const parameterSet of ['low', 'primary', 'high']) {
        meshState.runoffCoefficient[parameterSet][index] /= totalAreaM2;
        meshState.manningN[parameterSet][index] /= totalAreaM2;
      }
    }
    meshState.classAreas.clear();
  }
}

function accumulateClassFootprint(
  meshState,
  sourcePolygon,
  sourceBounds,
  parameters,
  domainBounds,
) {
  const [domainWest, , , domainNorth] = domainBounds;
  const size = meshState.cellSizeMetres;
  const columnStart = clamp(
    Math.floor((sourceBounds[0] - domainWest) / size),
    0,
    meshState.width,
  );
  const columnEnd = clamp(
    Math.ceil((sourceBounds[2] - domainWest) / size),
    0,
    meshState.width,
  );
  const rowStart = clamp(
    Math.floor((domainNorth - sourceBounds[3]) / size),
    0,
    meshState.height,
  );
  const rowEnd = clamp(
    Math.ceil((domainNorth - sourceBounds[1]) / size),
    0,
    meshState.height,
  );
  for (let row = rowStart; row < rowEnd; row += 1) {
    for (let column = columnStart; column < columnEnd; column += 1) {
      const north = domainNorth - row * size;
      const targetPolygon = rectanglePolygon([
        domainWest + column * size,
        north - size,
        domainWest + (column + 1) * size,
        north,
      ]);
      const areaM2 = polygonAreaM2(
        intersectConvexPolygons(targetPolygon, sourcePolygon),
      );
      if (areaM2 <= 1e-9) {
        continue;
      }
      const index = row * meshState.width + column;
      meshState.clcCoverageAreaM2[index] += areaM2;
      meshState.classAreas.get(parameters.classCode)[index] += areaM2;
      for (const parameterSet of ['low', 'primary', 'high']) {
        meshState.runoffCoefficient[parameterSet][index] +=
          areaM2 * parameters.runoffCoefficient[parameterSet];
        meshState.manningN[parameterSet][index] +=
          areaM2 * parameters.manningN[parameterSet];
      }
    }
  }
}

function finalizeMeshStates(meshStates, haloCells) {
  for (const meshState of meshStates) {
    for (let index = 0; index < meshState.cellCount; index += 1) {
      meshState.solverValid[index] =
        meshState.terrainValid[index] === 1 &&
        meshState.landCoverValid[index] === 1
          ? 1
          : 0;
    }
    meshState.predictionEligible = computePredictionEligibilityMask(
      meshState.solverValid,
      meshState.width,
      meshState.height,
      haloCells,
    );
  }
}

function generatedMeshArtifacts(meshState, dataRoot) {
  const artifactInputs = {
    elevationM: ['f32le', encodeFloat32(meshState.elevationM)],
    terrainValidMask: ['u8', Buffer.from(meshState.terrainValid)],
    landCoverValidMask: ['u8', Buffer.from(meshState.landCoverValid)],
    solverValidMask: ['u8', Buffer.from(meshState.solverValid)],
    predictionEligibleMask: ['u8', Buffer.from(meshState.predictionEligible)],
    dominantClcClass: ['i16le', encodeInt16(meshState.dominantClcClass)],
    clcClassCount: ['u8', Buffer.from(meshState.clcClassCount)],
    runoffCoefficientLow: [
      'f32le',
      encodeFloat32(meshState.runoffCoefficient.low),
    ],
    runoffCoefficientPrimary: [
      'f32le',
      encodeFloat32(meshState.runoffCoefficient.primary),
    ],
    runoffCoefficientHigh: [
      'f32le',
      encodeFloat32(meshState.runoffCoefficient.high),
    ],
    manningNLow: ['f32le', encodeFloat32(meshState.manningN.low)],
    manningNPrimary: ['f32le', encodeFloat32(meshState.manningN.primary)],
    manningNHigh: ['f32le', encodeFloat32(meshState.manningN.high)],
  };
  const artifacts = {};
  const generatedArtifacts = [];
  for (const [name, [encoding, raw]] of Object.entries(artifactInputs)) {
    const compressed = gzipSync(raw, { level: 9, mtime: 0 });
    if (!gunzipSync(compressed).equals(raw)) {
      throw new Error(`${meshState.id} ${name} failed gzip round-trip`);
    }
    const sha256 = sha256Bytes(compressed);
    const descriptor = {
      relativePath: path
        .join(
          'solver-inputs',
          'grids',
          'sha256',
          `${sha256}.${encoding}.gz`,
        )
        .split(path.sep)
        .join('/'),
      bytes: compressed.length,
      decodedBytes: raw.length,
      sha256,
      contentSha256: sha256Bytes(raw),
      encoding: `gzip-compressed ${encoding}, row-major north-to-south`,
    };
    if (encoding === 'f32le') {
      descriptor.noData = floatNoData;
    }
    artifacts[name] = descriptor;
    generatedArtifacts.push({ descriptor, compressed });
  }

  const terrainValidCellCount = countOnes(meshState.terrainValid);
  const landCoverValidCellCount = countOnes(meshState.landCoverValid);
  const solverValidCellCount = countOnes(meshState.solverValid);
  const predictionEligibleCellCount = countOnes(
    meshState.predictionEligible,
  );
  const elevationRange = finiteRange(meshState.elevationM);
  return {
    receipt: {
      id: meshState.id,
      role: meshState.role,
      cellSizeMetres: meshState.cellSizeMetres,
      width: meshState.width,
      height: meshState.height,
      cellCount: meshState.cellCount,
      summary: {
        id: meshState.id,
        cellCount: meshState.cellCount,
        terrainValidCellCount,
        terrainMissingCellCount: meshState.cellCount - terrainValidCellCount,
        landCoverValidCellCount,
        landCoverMissingCellCount:
          meshState.cellCount - landCoverValidCellCount,
        solverValidCellCount,
        solverInvalidCellCount: meshState.cellCount - solverValidCellCount,
        predictionEligibleCellCount,
        predictionExcludedHaloCellCount:
          solverValidCellCount - predictionEligibleCellCount,
        minimumElevationM: elevationRange.minimum,
        maximumElevationM: elevationRange.maximum,
      },
      artifacts,
    },
    generatedArtifacts,
    dataRoot,
  };
}

function encodeFloat32(values) {
  const result = Buffer.allocUnsafe(values.length * 4);
  for (let index = 0; index < values.length; index += 1) {
    const value = Number.isFinite(values[index]) ? values[index] : floatNoData;
    result.writeFloatLE(value, index * 4);
  }
  return result;
}

function encodeInt16(values) {
  const result = Buffer.allocUnsafe(values.length * 2);
  for (let index = 0; index < values.length; index += 1) {
    result.writeInt16LE(values[index], index * 2);
  }
  return result;
}

function countOnes(values) {
  let count = 0;
  for (const value of values) {
    count += value === 1 ? 1 : 0;
  }
  return count;
}

function finiteRange(values) {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (Number.isFinite(value)) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new Error('A solver mesh contains no valid terrain cells');
  }
  return { minimum, maximum };
}

async function loadAndVerifyInputs(dataRoot, manifest) {
  const terrainFileName =
    manifest.publicBaselineTerrainMaterialization.maskReceipt.fileName;
  const terrainReceipt = await readReceipt(dataRoot, terrainFileName);
  assertJavascriptReceiptHash(
    terrainReceipt,
    manifest.publicBaselineTerrainMaterialization.maskReceipt.sha256,
    'terrain',
  );
  const landCoverFileName =
    manifest.publicBaselineEnvironmentalMaterialization.landCover.receipt
      .fileName;
  const landCoverReceipt = await readReceipt(dataRoot, landCoverFileName);
  assertJavascriptReceiptHash(
    landCoverReceipt,
    manifest.publicBaselineEnvironmentalMaterialization.landCover.receipt
      .sha256,
    'land-cover',
  );
  const classGridCompressed = await verifiedArtifactBytes(
    dataRoot,
    landCoverReceipt.artifacts.classGrid,
    'CLC class grid',
  );
  const classGrid = gunzipSync(classGridCompressed);
  if (
    classGrid.length !==
    landCoverReceipt.sourceGrid.width *
      landCoverReceipt.sourceGrid.height *
      Int16Array.BYTES_PER_ELEMENT
  ) {
    throw new Error('CLC decoded class grid has an invalid byte length');
  }
  return {
    terrain: { receipt: terrainReceipt, dataRoot },
    landCover: { receipt: landCoverReceipt, classGrid },
  };
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
  return [
    Math.min(...points.map((point) => point[0])),
    Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1])),
  ];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

async function readReceipt(dataRoot, fileName) {
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) {
    throw new Error('Input receipt file name is not portable');
  }
  return JSON.parse(await readFile(path.join(dataRoot, fileName), 'utf8'));
}

function assertJavascriptReceiptHash(receipt, expected, label) {
  const { receiptSha256, ...withoutHash } = receipt;
  if (receiptSha256 !== expected || sha256Json(withoutHash) !== receiptSha256) {
    throw new Error(`${label} receipt SHA-256 does not match content`);
  }
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
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
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
      throw new Error(`Solver-grid artifact drifted: ${target}`);
    }
    const existing = await readFile(target);
    if (sha256Bytes(existing) !== expectedSha256) {
      throw new Error(`Solver-grid artifact drifted: ${target}`);
    }
    return 0;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  await mkdir(path.dirname(target), { recursive: true });
  const partial = path.join(
    stagingDirectory,
    `${path.basename(target)}.${process.pid}.part`,
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

async function verifyPersistedArtifact(dataRoot, descriptor) {
  const bytes = await readFile(externalPath(dataRoot, descriptor.relativePath));
  if (bytes.length !== descriptor.bytes || sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error(`Persisted solver-grid artifact drifted: ${descriptor.relativePath}`);
  }
  const decoded = gunzipSync(bytes);
  if (
    decoded.length !== descriptor.decodedBytes ||
    sha256Bytes(decoded) !== descriptor.contentSha256
  ) {
    throw new Error(`Decoded solver-grid artifact drifted: ${descriptor.relativePath}`);
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
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  runCumbriaSolverGridMaterializer(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Cumbria solver-grid materialization failed: ${error.message}`);
      process.exitCode = 1;
    });
}
