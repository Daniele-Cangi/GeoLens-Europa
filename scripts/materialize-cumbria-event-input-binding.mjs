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
  coordinateEdges,
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
  'cumbria-public-baseline-event-input-binding-v0.2.0.receipt.json';
const predecessorReceiptFileName =
  'cumbria-public-baseline-event-input-binding.receipt.json';
const bindingId = 'cumbria-public-event-input-binding-v1';
const transformationVersion = 'cumbria-event-input-binding-v0.2.0';
const geometryVersion = 'native-footprint-overlap-v0.1.0';
const baselineTag = 'pre-external-evidence-baseline-v1';
const baselineCommit = '938b18fb66925e36236ea04a49eefdb2ca9826cb';
const coverageToleranceFraction = 0.000001;
const weightTolerance = 1e-12;

proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
    '+x_0=400000 +y_0=-100000 +ellps=airy ' +
    '+towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 ' +
    '+units=m +no_defs +type=crs',
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

export function buildRainfallMapping({
  mesh,
  domain,
  validMask,
  sourceFootprints,
  toleranceFraction = coverageToleranceFraction,
}) {
  assertMeshInputs(mesh, domain, validMask);
  if (!Array.isArray(sourceFootprints) || sourceFootprints.length === 0) {
    throw new Error('At least one rainfall source footprint is required');
  }
  if (sourceFootprints.length > 256) {
    throw new Error('Rainfall source footprint count exceeds u8 capacity');
  }

  const offsets = new Uint32Array(mesh.cellCount + 1);
  const sourceIndices = [];
  const areaFractions = [];
  let maximumCoverageDeviationFraction = 0;
  let mappedValidCellCount = 0;
  const targetAreaM2 = mesh.cellSizeMetres ** 2;

  for (let index = 0; index < mesh.cellCount; index += 1) {
    offsets[index] = sourceIndices.length;
    if (validMask[index] !== 1) {
      continue;
    }
    const targetPolygon = meshCellPolygon(mesh, domain, index);
    const targetBounds = polygonBounds(targetPolygon);
    let coveredAreaM2 = 0;
    for (const source of sourceFootprints) {
      if (!boundsOverlap(targetBounds, source.bounds)) {
        continue;
      }
      const areaM2 = polygonAreaM2(
        intersectConvexPolygons(targetPolygon, source.polygon),
      );
      if (areaM2 <= 1e-9) {
        continue;
      }
      sourceIndices.push(source.index);
      areaFractions.push(areaM2 / targetAreaM2);
      coveredAreaM2 += areaM2;
    }
    const deviation = Math.abs(coveredAreaM2 / targetAreaM2 - 1);
    maximumCoverageDeviationFraction = Math.max(
      maximumCoverageDeviationFraction,
      deviation,
    );
    if (deviation > toleranceFraction || sourceIndices.length === offsets[index]) {
      throw new Error(
        `${mesh.id} valid cell ${index} has incomplete or overlapping ` +
          `IMERG coverage (${coveredAreaM2 / targetAreaM2})`,
      );
    }
    mappedValidCellCount += 1;
  }
  offsets[mesh.cellCount] = sourceIndices.length;

  return {
    offsets,
    sourceIndices: Uint8Array.from(sourceIndices),
    areaFractions: Float64Array.from(areaFractions),
    summary: {
      mappedValidCellCount,
      mappingEntryCount: sourceIndices.length,
      minimumEntriesPerValidCell: minimumEntries(offsets, validMask),
      maximumEntriesPerValidCell: maximumEntries(offsets, validMask),
      maximumCoverageDeviationFraction,
    },
  };
}

export function buildRiverFootprintMapping({
  mesh,
  domain,
  validMask,
  centreBng,
  sideMetres,
}) {
  assertMeshInputs(mesh, domain, validMask);
  if (
    !Array.isArray(centreBng) ||
    centreBng.length !== 2 ||
    centreBng.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(sideMetres) ||
    sideMetres <= 0
  ) {
    throw new Error('River footprint geometry is invalid');
  }

  const half = sideMetres / 2;
  const footprintBounds = [
    centreBng[0] - half,
    centreBng[1] - half,
    centreBng[0] + half,
    centreBng[1] + half,
  ];
  const [west, , , north] = domain.bounds;
  const columnStart = clamp(
    Math.floor((footprintBounds[0] - west) / mesh.cellSizeMetres),
    0,
    mesh.width,
  );
  const columnEnd = clamp(
    Math.ceil((footprintBounds[2] - west) / mesh.cellSizeMetres),
    0,
    mesh.width,
  );
  const rowStart = clamp(
    Math.floor((north - footprintBounds[3]) / mesh.cellSizeMetres),
    0,
    mesh.height,
  );
  const rowEnd = clamp(
    Math.ceil((north - footprintBounds[1]) / mesh.cellSizeMetres),
    0,
    mesh.height,
  );

  const cellIndices = [];
  const areas = [];
  let intersectedValidAreaM2 = 0;
  for (let row = rowStart; row < rowEnd; row += 1) {
    for (let column = columnStart; column < columnEnd; column += 1) {
      const index = row * mesh.width + column;
      if (validMask[index] !== 1) {
        continue;
      }
      const cellBounds = meshCellBounds(mesh, domain, index);
      const areaM2 = rectangleIntersectionArea(footprintBounds, cellBounds);
      if (areaM2 <= 0) {
        continue;
      }
      cellIndices.push(index);
      areas.push(areaM2);
      intersectedValidAreaM2 += areaM2;
    }
  }
  if (cellIndices.length === 0 || intersectedValidAreaM2 <= 0) {
    throw new Error(`${mesh.id} river footprint intersects no valid solver cell`);
  }
  const weights = Float64Array.from(
    areas.map((areaM2) => areaM2 / intersectedValidAreaM2),
  );
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  if (Math.abs(weightSum - 1) > weightTolerance) {
    throw new Error(`${mesh.id} river footprint weights do not sum to one`);
  }
  return {
    cellIndices: Uint32Array.from(cellIndices),
    weights,
    summary: {
      sideMetres,
      cellCount: cellIndices.length,
      footprintAreaM2: sideMetres ** 2,
      intersectedValidAreaM2,
      validAreaFraction: intersectedValidAreaM2 / sideMetres ** 2,
      weightSum,
    },
  };
}

export async function runCumbriaEventInputBindingMaterializer(arguments_) {
  const options = parseArguments(arguments_);
  const dataRoot = path.resolve(options.dataRoot);
  ensureExternalDataRoot(dataRoot, repositoryRoot);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assertCumbriaAccessManifest(manifest);
  const protocol = manifest.replacementSolverProtocol;
  const meshes = [protocol.meshes.primary, ...protocol.meshes.sensitivities];
  const scenariosByMesh = groupScenarios(protocol.scenarios);
  const plan = {
    schemaVersion: 'cumbria-event-input-binding-plan-v0.1.0',
    bindingId,
    mode: options.mode,
    dataRoot,
    baseline: { tag: baselineTag, commit: baselineCommit },
    protocol: {
      id: protocol.id,
      version: protocol.version,
      sha256: protocol.protocolSha256,
    },
    meshCount: meshes.length,
    scenarioCount: protocol.scenarios.length,
    combinedIntervalSeconds: 900,
    combinedIntervalCount: 288,
    networkRequests: 0,
    observedFloodGeometryLoaded: false,
    solverRuns: 0,
    evaluationRuns: 0,
    eventExecutionAuthorized: false,
  };
  if (options.mode === 'dry_run') {
    return { ...plan, filesWritten: 0 };
  }

  const inputs = await loadAndVerifyInputs(dataRoot, manifest, meshes);
  const sourceFootprints = buildImergFootprints(inputs.forcing.imerg);
  const generatedMeshes = [];
  for (const mesh of meshes) {
    const solverGrid = inputs.meshes.get(mesh.id);
    const rainfall = buildRainfallMapping({
      mesh,
      domain: inputs.solverReceipt.domain,
      validMask: solverGrid.solverValidMask,
      sourceFootprints,
    });
    const rainfallArtifacts = {
      offsets: createArtifact(
        encodeUint32(rainfall.offsets),
        'u32le',
        'rainfall-csr-offsets',
      ),
      sourceIndices: createArtifact(
        Buffer.from(rainfall.sourceIndices),
        'u8',
        'rainfall-source-indices',
      ),
      areaFractions: createArtifact(
        encodeFloat64(rainfall.areaFractions),
        'f64le',
        'rainfall-area-fractions',
      ),
    };
    const footprintSides = scenariosByMesh.get(mesh.id);
    if (!footprintSides || footprintSides.size === 0) {
      throw new Error(`${mesh.id} is not used by a frozen scenario`);
    }
    const riverMappings = [];
    for (const sideMetres of [...footprintSides].sort((a, b) => a - b)) {
      const river = buildRiverFootprintMapping({
        mesh,
        domain: inputs.solverReceipt.domain,
        validMask: solverGrid.solverValidMask,
        centreBng: protocol.forcing.riverInflow.footprintCentreBng,
        sideMetres,
      });
      riverMappings.push({
        sideMetres,
        summary: river.summary,
        artifacts: {
          cellIndices: createArtifact(
            encodeUint32(river.cellIndices),
            'u32le',
            `river-${sideMetres}m-cell-indices`,
          ),
          weights: createArtifact(
            encodeFloat64(river.weights),
            'f64le',
            `river-${sideMetres}m-weights`,
          ),
        },
      });
    }
    generatedMeshes.push({
      mesh,
      rainfallSummary: rainfall.summary,
      rainfallArtifacts,
      riverMappings,
      staticArtifacts: solverGrid.staticArtifacts,
    });
  }

  const scriptSha256 = sha256Bytes(
    await readFile(fileURLToPath(import.meta.url)),
  );
  const receiptPath = path.join(dataRoot, receiptFileName);
  const previous = await readOptionalJson(receiptPath);
  const predecessor = await readOptionalJson(
    path.join(dataRoot, predecessorReceiptFileName),
  );
  const boundAt =
    previous?.boundAt ?? predecessor?.boundAt ?? new Date().toISOString();
  const receiptWithoutHash = {
    schemaVersion: 'cumbria-event-input-binding-receipt-v0.1.0',
    bindingId,
    boundAt,
    baseline: { tag: baselineTag, commit: baselineCommit },
    protocol: {
      id: protocol.id,
      version: protocol.version,
      sha256: protocol.protocolSha256,
    },
    kernel: {
      implementationVersion:
        manifest.publicBaselineNumericalKernelVerification.implementation.version,
      module:
        manifest.publicBaselineNumericalKernelVerification.implementation.module,
      moduleSha256:
        manifest.publicBaselineNumericalKernelVerification.implementation
          .moduleSha256,
      fixtureResultSha256:
        manifest.publicBaselineNumericalKernelVerification.fixtureSuite
          .resultSha256,
    },
    transformation: {
      version: transformationVersion,
      scriptSha256,
      geometryVersion,
      horizontalCrs: 'EPSG:27700',
      rainfallMapping:
        'exact intersection of each projected IMERG native-cell quadrilateral with each valid solver-cell rectangle; CSR area fractions retain native source indices',
      rainfallCoverageToleranceFraction: coverageToleranceFraction,
      riverMapping:
        'frozen square footprint distributed uniformly by exact intersected valid solver-cell area',
      riverWeightTolerance: weightTolerance,
      missingPolicy:
        'any missing, non-finite, negative, uncovered or identity-mismatched required input blocks execution; no missing value is replaced with zero',
    },
    sourceReceipts: {
      solverGrids: {
        fileName:
          manifest.publicBaselineSolverGridMaterialization.receipt.fileName,
        sha256:
          manifest.publicBaselineSolverGridMaterialization.receipt.sha256,
      },
      forcing: {
        fileName:
          manifest.publicBaselineForcingMaterialization.receipt.fileName,
        sha256: manifest.publicBaselineForcingMaterialization.receipt.sha256,
      },
    },
    temporalBinding: {
      eventStart: inputs.forcing.eventWindow.start,
      eventEndExclusive: inputs.forcing.eventWindow.endExclusive,
      durationSeconds: inputs.forcing.eventWindow.durationSeconds,
      combinedIntervalSeconds: 900,
      combinedIntervalCount: 288,
      intervalRule:
        'combined interval i uses Sheepmount excess sample i and IMERG amount sample floor(i / 2)',
      outputIntervalSeconds: 900,
      intervalsAreLeftClosedRightOpen: true,
      completeWindowRequired: true,
    },
    sourceSemantics: {
      rainfall: {
        artifactSha256: inputs.forcing.imerg.artifact.sha256,
        sourceShape: inputs.forcing.imerg.shape,
        sourceValueOrder: inputs.forcing.imerg.valueOrder,
        sourceIndexRule:
          'longitude_index * latitude_count + latitude_index',
        sourceUnit: inputs.forcing.imerg.unit,
        kernelRateUnit: 'm/s',
        rateFormula:
          'area-weighted native amount_mm / 1000 / 1800 * selected runoff_coefficient',
        sourceResolution: inputs.forcing.imerg.sourceResolution,
        h3Used: false,
      },
      riverInflow: {
        artifactSha256: inputs.forcing.sheepmount.excessArtifact.sha256,
        sourceUnit: inputs.forcing.sheepmount.unit,
        kernelRateUnit: 'm3/s per solver cell',
        rateFormula:
          'positive-excess sample_m3_s * frozen footprint valid-area weight',
        sourceMeaning: inputs.forcing.sheepmount.sourceMeaning,
      },
      initialCondition: {
        waterDepthM: 0,
        unitDischargeXM2s: 0,
        unitDischargeYM2s: 0,
        meaning: 'explicit frozen dry-start assumption, not missing evidence',
      },
    },
    meshes: generatedMeshes.map((entry) => ({
      id: entry.mesh.id,
      role: entry.mesh.role,
      cellSizeMetres: entry.mesh.cellSizeMetres,
      width: entry.mesh.width,
      height: entry.mesh.height,
      cellCount: entry.mesh.cellCount,
      rowOrder: inputs.solverReceipt.domain.rowOrder,
      staticArtifacts: entry.staticArtifacts,
      rainfallMapping: {
        ...entry.rainfallSummary,
        sourceCellCount: sourceFootprints.length,
        sourceIndexEncoding: 'u8',
        offsetsEncoding: 'u32le',
        areaFractionEncoding: 'f64le',
        artifacts: descriptors(entry.rainfallArtifacts),
      },
      riverMappings: entry.riverMappings.map((mapping) => ({
        ...mapping.summary,
        cellIndexEncoding: 'u32le',
        weightEncoding: 'f64le',
        artifacts: descriptors(mapping.artifacts),
      })),
    })),
    scenarioBindings: protocol.scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      meshId: scenario.meshId,
      runoffParameterSet: scenario.runoffParameterSet,
      runoffArtifactSha256: staticArtifactSha(
        generatedMeshes,
        scenario.meshId,
        `runoffCoefficient${titleCase(scenario.runoffParameterSet)}`,
      ),
      roughnessParameterSet: scenario.roughnessParameterSet,
      manningArtifactSha256: staticArtifactSha(
        generatedMeshes,
        scenario.meshId,
        `manningN${titleCase(scenario.roughnessParameterSet)}`,
      ),
      inflowFootprintSideMetres: scenario.inflowFootprintSideMetres,
    })),
    isolation: {
      observedFloodGeometryLoaded: false,
      observedFloodGeometryUsed: false,
      evaluationReferenceAccessAllowed: false,
      externalOwnerPackageLoaded: false,
      h3UsedAsSourceOrSolverGrid: false,
      networkRequests: 0,
      solverRuns: 0,
      evaluationRuns: 0,
      predictionArtifactsCreated: 0,
      solverExecutionAuthorized: false,
      missingValuesSubstitutedWithZero: false,
    },
  };
  const receipt = {
    ...receiptWithoutHash,
    receiptSha256: sha256Json(receiptWithoutHash),
  };

  if (previous && canonicalJson(previous) !== canonicalJson(receipt)) {
    throw new Error('Existing Cumbria event-input binding receipt differs from output');
  }
  const manifestBinding = manifest.publicBaselineEventInputBinding;
  if (
    manifestBinding &&
    (manifestBinding.receipt.fileName !== receiptFileName ||
      manifestBinding.receipt.sha256 !== receipt.receiptSha256)
  ) {
    throw new Error('Manifest event-input binding identity differs from output');
  }

  let filesWritten = 0;
  if (options.mode === 'check') {
    if (!previous) {
      throw new Error('Cumbria event-input binding receipt is missing');
    }
    for (const artifact of generatedArtifacts(generatedMeshes)) {
      await verifyPersistedArtifact(dataRoot, artifact.descriptor);
    }
  } else {
    const stagingDirectory = path.join(dataRoot, 'staging');
    await mkdir(stagingDirectory, { recursive: true });
    for (const artifact of generatedArtifacts(generatedMeshes)) {
      filesWritten += await persistContentAddressed(
        externalPath(dataRoot, artifact.descriptor.relativePath),
        artifact.compressed,
        artifact.descriptor.sha256,
        stagingDirectory,
      );
    }
    if (!previous) {
      await atomicWriteJson(receiptPath, receipt, stagingDirectory);
      filesWritten += 1;
    }
  }

  return {
    ...plan,
    state: 'event_inputs_content_addressed_prediction_freeze_blocked',
    receiptPath,
    receiptSha256: receipt.receiptSha256,
    meshSummaries: receipt.meshes.map((mesh) => ({
      id: mesh.id,
      mappedValidCellCount: mesh.rainfallMapping.mappedValidCellCount,
      mappingEntryCount: mesh.rainfallMapping.mappingEntryCount,
      riverMappings: mesh.riverMappings.map((mapping) => ({
        sideMetres: mapping.sideMetres,
        cellCount: mapping.cellCount,
        validAreaFraction: mapping.validAreaFraction,
      })),
    })),
    filesWritten,
  };
}

async function loadAndVerifyInputs(dataRoot, manifest, meshes) {
  const solverReference =
    manifest.publicBaselineSolverGridMaterialization.receipt;
  const forcingReference =
    manifest.publicBaselineForcingMaterialization.receipt;
  const solverDocument = await readReceipt(dataRoot, solverReference.fileName);
  const forcingDocument = await readReceipt(dataRoot, forcingReference.fileName);
  const solverReceipt = solverDocument.value;
  const forcingReceipt = forcingDocument.value;
  assertReceiptHash(
    solverReceipt,
    solverReference.sha256,
    'solver-grid',
    solverDocument.text,
  );
  assertReceiptHash(
    forcingReceipt,
    forcingReference.sha256,
    'forcing',
    forcingDocument.text,
  );
  if (
    solverReceipt.protocol.sha256 !==
      manifest.replacementSolverProtocol.protocolSha256 ||
    forcingReceipt.protocol.sha256 !==
      manifest.replacementSolverProtocol.protocolSha256
  ) {
    throw new Error('Input receipt protocol identity drifted');
  }

  const meshInputs = new Map();
  for (const mesh of meshes) {
    const receiptMesh = solverReceipt.meshes.find((entry) => entry.id === mesh.id);
    if (
      !receiptMesh ||
      receiptMesh.width !== mesh.width ||
      receiptMesh.height !== mesh.height ||
      receiptMesh.cellCount !== mesh.cellCount ||
      receiptMesh.cellSizeMetres !== mesh.cellSizeMetres
    ) {
      throw new Error(`${mesh.id} solver-grid receipt geometry drifted`);
    }
    const decoded = {};
    for (const [name, descriptor] of Object.entries(receiptMesh.artifacts)) {
      decoded[name] = await verifiedDecodedArtifact(
        dataRoot,
        descriptor,
        `${mesh.id} ${name}`,
      );
    }
    const terrainValidMask = Uint8Array.from(decoded.terrainValidMask);
    const landCoverValidMask = Uint8Array.from(decoded.landCoverValidMask);
    const solverValidMask = Uint8Array.from(decoded.solverValidMask);
    validateMask(
      terrainValidMask,
      mesh.cellCount,
      `${mesh.id} terrain-valid mask`,
    );
    validateMask(
      landCoverValidMask,
      mesh.cellCount,
      `${mesh.id} land-cover-valid mask`,
    );
    validateMask(solverValidMask, mesh.cellCount, `${mesh.id} solver-valid mask`);
    validateMask(
      Uint8Array.from(decoded.predictionEligibleMask),
      mesh.cellCount,
      `${mesh.id} prediction-eligible mask`,
    );
    validateStaticFloatGrid(
      decoded.elevationM,
      terrainValidMask,
      receiptMesh.artifacts.elevationM.noData,
      `${mesh.id} elevation`,
      () => true,
    );
    for (const name of [
      'runoffCoefficientLow',
      'runoffCoefficientPrimary',
      'runoffCoefficientHigh',
    ]) {
      validateStaticFloatGrid(
        decoded[name],
        landCoverValidMask,
        receiptMesh.artifacts[name].noData,
        `${mesh.id} ${name}`,
        (value) => value >= 0 && value <= 1,
      );
    }
    for (const name of ['manningNLow', 'manningNPrimary', 'manningNHigh']) {
      validateStaticFloatGrid(
        decoded[name],
        landCoverValidMask,
        receiptMesh.artifacts[name].noData,
        `${mesh.id} ${name}`,
        (value) => value > 0,
      );
    }
    meshInputs.set(mesh.id, {
      solverValidMask,
      staticArtifacts: Object.fromEntries(
        Object.entries(receiptMesh.artifacts).map(([name, descriptor]) => [
          name,
          {
            sha256: descriptor.sha256,
            contentSha256: descriptor.contentSha256,
          },
        ]),
      ),
    });
  }

  const forcingArtifacts = [
    ['IMERG amount', forcingReceipt.imerg.artifact],
    ['Sheepmount observed flow', forcingReceipt.sheepmount.observedArtifact],
    ['Sheepmount excess flow', forcingReceipt.sheepmount.excessArtifact],
    ['Sheepmount interval volume', forcingReceipt.sheepmount.intervalVolumeArtifact],
  ];
  const forcingDecoded = new Map();
  for (const [label, descriptor] of forcingArtifacts) {
    forcingDecoded.set(
      label,
      await verifiedDecodedArtifact(dataRoot, descriptor, label),
    );
  }
  validateFloatSeries(
    forcingDecoded.get('IMERG amount'),
    4,
    144 * 4 * 3,
    'IMERG amount',
  );
  validateFloatSeries(
    forcingDecoded.get('Sheepmount excess flow'),
    8,
    288,
    'Sheepmount excess flow',
  );
  if (
    forcingReceipt.eventWindow.durationSeconds !== 259200 ||
    forcingReceipt.imerg.sourceIntervalSeconds !== 1800 ||
    forcingReceipt.imerg.granuleCount !== 144 ||
    forcingReceipt.sheepmount.sourceIntervalSeconds !== 900 ||
    forcingReceipt.sheepmount.sampleCount !== 288 ||
    forcingReceipt.imerg.valueOrder !==
      'time_major_longitude_major_latitude_minor'
  ) {
    throw new Error('Forcing temporal or value-order contract drifted');
  }
  return { solverReceipt, forcing: forcingReceipt, meshes: meshInputs };
}

function buildImergFootprints(imerg) {
  const longitudeEdges = coordinateEdges(imerg.longitude);
  const latitudeEdges = coordinateEdges(imerg.latitude);
  const footprints = [];
  for (let longitudeIndex = 0; longitudeIndex < imerg.longitude.length; longitudeIndex += 1) {
    for (let latitudeIndex = 0; latitudeIndex < imerg.latitude.length; latitudeIndex += 1) {
      const polygon = rectanglePolygon([
        longitudeEdges[longitudeIndex],
        latitudeEdges[latitudeIndex],
        longitudeEdges[longitudeIndex + 1],
        latitudeEdges[latitudeIndex + 1],
      ]).map((coordinate) => proj4('EPSG:4326', 'EPSG:27700', coordinate));
      footprints.push({
        index: longitudeIndex * imerg.latitude.length + latitudeIndex,
        polygon,
        bounds: polygonBounds(polygon),
      });
    }
  }
  return footprints;
}

function validateFloatSeries(bytes, byteWidth, count, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== byteWidth * count) {
    throw new Error(`${label} has an invalid decoded byte length`);
  }
  for (let index = 0; index < count; index += 1) {
    const value = byteWidth === 4
      ? bytes.readFloatLE(index * byteWidth)
      : bytes.readDoubleLE(index * byteWidth);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label} contains missing, non-finite or negative evidence`);
    }
  }
}

function validateStaticFloatGrid(bytes, validMask, noData, label, predicate) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== validMask.length * 4) {
    throw new Error(`${label} has an invalid decoded byte length`);
  }
  for (let index = 0; index < validMask.length; index += 1) {
    const value = bytes.readFloatLE(index * 4);
    if (validMask[index] === 1) {
      if (!Number.isFinite(value) || value === noData || !predicate(value)) {
        throw new Error(`${label} is invalid on solver-valid cell ${index}`);
      }
    } else if (value !== noData) {
      throw new Error(`${label} must carry explicit NoData outside the solver mask`);
    }
  }
}

function validateMask(mask, expectedLength, label) {
  if (mask.length !== expectedLength) {
    throw new Error(`${label} has an invalid byte length`);
  }
  for (const value of mask) {
    if (value !== 0 && value !== 1) {
      throw new Error(`${label} contains a value other than zero or one`);
    }
  }
}

function assertMeshInputs(mesh, domain, validMask) {
  if (
    !Number.isSafeInteger(mesh?.width) ||
    !Number.isSafeInteger(mesh?.height) ||
    !Number.isSafeInteger(mesh?.cellCount) ||
    !Number.isFinite(mesh?.cellSizeMetres) ||
    mesh.width * mesh.height !== mesh.cellCount ||
    !(validMask instanceof Uint8Array) ||
    validMask.length !== mesh.cellCount ||
    !Array.isArray(domain?.bounds) ||
    domain.bounds.length !== 4
  ) {
    throw new Error('Mesh binding inputs are invalid');
  }
  validateMask(validMask, mesh.cellCount, `${mesh.id} valid mask`);
}

function meshCellBounds(mesh, domain, index) {
  const row = Math.floor(index / mesh.width);
  const column = index % mesh.width;
  const west = domain.bounds[0] + column * mesh.cellSizeMetres;
  const north = domain.bounds[3] - row * mesh.cellSizeMetres;
  return [west, north - mesh.cellSizeMetres, west + mesh.cellSizeMetres, north];
}

function meshCellPolygon(mesh, domain, index) {
  return rectanglePolygon(meshCellBounds(mesh, domain, index));
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

function boundsOverlap(left, right) {
  return !(
    left[2] <= right[0] ||
    right[2] <= left[0] ||
    left[3] <= right[1] ||
    right[3] <= left[1]
  );
}

function rectangleIntersectionArea(left, right) {
  return Math.max(0, Math.min(left[2], right[2]) - Math.max(left[0], right[0])) *
    Math.max(0, Math.min(left[3], right[3]) - Math.max(left[1], right[1]));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function minimumEntries(offsets, validMask) {
  let result = Number.POSITIVE_INFINITY;
  for (let index = 0; index < validMask.length; index += 1) {
    if (validMask[index] === 1) {
      result = Math.min(result, offsets[index + 1] - offsets[index]);
    }
  }
  return result;
}

function maximumEntries(offsets, validMask) {
  let result = 0;
  for (let index = 0; index < validMask.length; index += 1) {
    if (validMask[index] === 1) {
      result = Math.max(result, offsets[index + 1] - offsets[index]);
    }
  }
  return result;
}

function groupScenarios(scenarios) {
  const result = new Map();
  for (const scenario of scenarios) {
    const sides = result.get(scenario.meshId) ?? new Set();
    sides.add(scenario.inflowFootprintSideMetres);
    result.set(scenario.meshId, sides);
  }
  return result;
}

function titleCase(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function staticArtifactSha(generatedMeshes, meshId, name) {
  const mesh = generatedMeshes.find((entry) => entry.mesh.id === meshId);
  const artifact = mesh?.staticArtifacts[name];
  if (!artifact) {
    throw new Error(`${meshId} static artifact ${name} is missing`);
  }
  return artifact.sha256;
}

function createArtifact(raw, encoding, role) {
  const compressed = gzipSync(raw, { level: 9, mtime: 0 });
  if (!gunzipSync(compressed).equals(raw)) {
    throw new Error(`${role} failed gzip round-trip`);
  }
  const sha256 = sha256Bytes(compressed);
  return {
    descriptor: {
      relativePath: path.posix.join(
        'solver-inputs',
        'bindings',
        'sha256',
        `${sha256}.${role}.${encoding}.gz`,
      ),
      bytes: compressed.length,
      decodedBytes: raw.length,
      sha256,
      contentSha256: sha256Bytes(raw),
      encoding: `gzip-compressed ${encoding}`,
    },
    compressed,
  };
}

function descriptors(artifacts) {
  return Object.fromEntries(
    Object.entries(artifacts).map(([name, artifact]) => [name, artifact.descriptor]),
  );
}

function generatedArtifacts(generatedMeshes) {
  const result = [];
  for (const mesh of generatedMeshes) {
    result.push(...Object.values(mesh.rainfallArtifacts));
    for (const mapping of mesh.riverMappings) {
      result.push(...Object.values(mapping.artifacts));
    }
  }
  return result;
}

function encodeUint32(values) {
  const result = Buffer.allocUnsafe(values.length * 4);
  for (let index = 0; index < values.length; index += 1) {
    result.writeUInt32LE(values[index], index * 4);
  }
  return result;
}

function encodeFloat64(values) {
  const result = Buffer.allocUnsafe(values.length * 8);
  for (let index = 0; index < values.length; index += 1) {
    result.writeDoubleLE(values[index], index * 8);
  }
  return result;
}

async function readReceipt(dataRoot, fileName) {
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) {
    throw new Error('Input receipt file name is not portable');
  }
  const text = await readFile(path.join(dataRoot, fileName), 'utf8');
  return { value: JSON.parse(text), text };
}

function assertReceiptHash(receipt, expected, label, sourceText) {
  const { receiptSha256, ...withoutHash } = receipt;
  const producerHashes = new Set([
    sha256Json(withoutHash),
    sha256Bytes(Buffer.from(canonicalJson(withoutHash))),
    sha256Bytes(Buffer.from(compactReceiptWithoutHash(sourceText, receiptSha256))),
  ]);
  if (receiptSha256 !== expected || !producerHashes.has(receiptSha256)) {
    throw new Error(`${label} receipt SHA-256 does not match content`);
  }
}

function compactReceiptWithoutHash(sourceText, receiptSha256) {
  let compact = '';
  let inString = false;
  let escaped = false;
  for (const character of sourceText) {
    if (inString) {
      compact += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
    } else if (character === '"') {
      compact += character;
      inString = true;
    } else if (!/\s/.test(character)) {
      compact += character;
    }
  }
  const property = `"receiptSha256":"${receiptSha256}"`;
  const index = compact.indexOf(property);
  if (index < 0 || compact.indexOf(property, index + 1) >= 0) {
    throw new Error('Receipt must contain exactly one receiptSha256 property');
  }
  const end = index + property.length;
  if (compact[index - 1] === ',') {
    return compact.slice(0, index - 1) + compact.slice(end);
  }
  if (compact[end] === ',') {
    return compact.slice(0, index) + compact.slice(end + 1);
  }
  throw new Error('receiptSha256 property cannot be removed safely');
}

async function verifiedDecodedArtifact(dataRoot, descriptor, label) {
  if (
    typeof descriptor?.relativePath !== 'string' ||
    !Number.isSafeInteger(descriptor.bytes) ||
    !Number.isSafeInteger(descriptor.decodedBytes) ||
    !/^[a-f0-9]{64}$/.test(descriptor.sha256) ||
    !/^[a-f0-9]{64}$/.test(descriptor.contentSha256)
  ) {
    throw new Error(`${label} artifact descriptor is invalid`);
  }
  const bytes = await readFile(externalPath(dataRoot, descriptor.relativePath));
  if (bytes.length !== descriptor.bytes || sha256Bytes(bytes) !== descriptor.sha256) {
    throw new Error(`${label} artifact failed byte-count or SHA-256 verification`);
  }
  const decoded = gunzipSync(bytes);
  if (
    decoded.length !== descriptor.decodedBytes ||
    sha256Bytes(decoded) !== descriptor.contentSha256
  ) {
    throw new Error(`${label} decoded artifact failed integrity verification`);
  }
  return decoded;
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
      throw new Error(`Event-input binding artifact drifted: ${target}`);
    }
    const existing = await readFile(target);
    if (sha256Bytes(existing) !== expectedSha256) {
      throw new Error(`Event-input binding artifact drifted: ${target}`);
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
  const decoded = await verifiedDecodedArtifact(
    dataRoot,
    descriptor,
    descriptor.relativePath,
  );
  if (decoded.length !== descriptor.decodedBytes) {
    throw new Error(`Persisted binding artifact drifted: ${descriptor.relativePath}`);
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
  runCumbriaEventInputBindingMaterializer(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Cumbria event-input binding failed: ${error.message}`);
      process.exitCode = 1;
    });
}
