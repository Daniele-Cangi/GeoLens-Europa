import { createRequire } from 'node:module';
import proj4 from 'proj4';

const require = createRequire(import.meta.url);
const { availableEvidence } = require('../packages/evidence/dist');
const {
  RUNOFF_MODEL_VERSION,
  TERRAIN_FLOW_TERMINAL_CODES,
  TERRAIN_FLOW_TERMINAL_MISSING,
  accumulateTerrainFlowVolume,
  deriveRunoff,
} = require('../packages/stormwater/dist');

export const EVENT_RUNOFF_MODEL_VERSION =
  `${RUNOFF_MODEL_VERSION}+d8-no-loss-volume-accumulation-v0.1.0`;

const EPSG_32632 =
  '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs +type=crs';

export function deriveEmiliaEventRunoff(input) {
  const { grid, imerg, derivedAt } = input;
  const cellCount = grid.width * grid.height;
  assertLength(input.slopeDeg, cellCount, 'slopeDeg');
  assertLength(input.landCoverClass, cellCount, 'landCoverClass');
  assertLength(input.directionCode, cellCount, 'directionCode');
  assertLength(input.terminalTypeCode, cellCount, 'terminalTypeCode');
  validateImerg(imerg);

  const rainfallMm = float32Missing(cellCount);
  const runoffCoefficient = float32Missing(cellCount);
  const runoffDepthMm = float32Missing(cellCount);
  const localRunoffVolumeM3 = float64Missing(cellCount);
  const landCoverGroups = new Map();
  let sampledLandCells = 0;
  let minimumRainfallMm = Infinity;
  let maximumRainfallMm = -Infinity;
  let minimumRunoffDepthMm = Infinity;
  let maximumRunoffDepthMm = -Infinity;
  let localRunoffVolumeTotalM3 = 0;

  for (let index = 0; index < cellCount; index += 1) {
    const terminalType = input.terminalTypeCode[index];
    if (
      terminalType === TERRAIN_FLOW_TERMINAL_MISSING ||
      terminalType === TERRAIN_FLOW_TERMINAL_CODES.known_permanent_water
    ) {
      continue;
    }
    const slope = input.slopeDeg[index];
    const clcClass = input.landCoverClass[index];
    if (!Number.isFinite(slope) || !Number.isInteger(clcClass) || clcClass < 0) {
      throw new Error(`Eligible land cell ${index} lacks slope or CLC evidence`);
    }
    const row = Math.floor(index / grid.width);
    const column = index % grid.width;
    const easting = grid.bounds[0] + (column + 0.5) * grid.cellSizeM;
    const northing = grid.bounds[3] - (row + 0.5) * grid.cellSizeM;
    const [longitude, latitude] = proj4(EPSG_32632, 'EPSG:4326', [
      easting,
      northing,
    ]);
    const sample = nearestImergSample(imerg.sourceGrid, longitude, latitude);
    const spatial = {
      lat: latitude,
      lon: longitude,
    };
    const temporal = {
      windowStart: imerg.temporal.actualWindowStart,
      windowEnd: imerg.temporal.actualWindowEnd,
      acquiredAt: imerg.temporal.acquiredAt,
    };
    const derivation = deriveRunoff(
      {
        rainfallMm: availableEvidence(sample.value, {
          unit: 'mm',
          spatial: { ...spatial, sourceResolution: imerg.sourceResolution },
          temporal,
          provenance: {
            provider: imerg.provenance.provider,
            dataset: imerg.provenance.dataset,
            datasetVersion: imerg.provenance.datasetVersion,
            transformation: 'nearest native IMERG source-cell sampling at 30 m grid-cell centre',
            transformationVersion: 'imerg-to-forli-grid-v0.1.0',
            samplingMethod: `nearest source cell lon=${sample.sourceLongitude}, lat=${sample.sourceLatitude}`,
          },
        }),
        slopeDeg: availableEvidence(slope, {
          unit: 'deg',
          spatial: { ...spatial, sourceResolution: input.slopeProvenance.sourceResolution },
          temporal: {
            observedAt: input.slopeProvenance.observedAt,
            acquiredAt: input.slopeProvenance.acquiredAt,
          },
          provenance: {
            provider: input.slopeProvenance.provider,
            dataset: input.slopeProvenance.dataset,
            datasetVersion: input.slopeProvenance.datasetVersion,
            transformationVersion: input.slopeProvenance.transformationVersion,
            samplingMethod: input.slopeProvenance.samplingMethod,
          },
        }),
        landCoverClass: availableEvidence(clcClass, {
          spatial: { ...spatial, sourceResolution: input.landCoverProvenance.sourceResolution },
          temporal: {
            observedAt: input.landCoverProvenance.observedAt,
            acquiredAt: input.landCoverProvenance.acquiredAt,
          },
          provenance: {
            provider: input.landCoverProvenance.provider,
            dataset: input.landCoverProvenance.dataset,
            datasetVersion: input.landCoverProvenance.datasetVersion,
            transformationVersion: input.landCoverProvenance.transformationVersion,
            samplingMethod: input.landCoverProvenance.samplingMethod,
          },
        }),
      },
      { derivedAt },
    );
    if (derivation.output.quality.status !== 'available') {
      throw new Error(
        `Runoff derivation failed at cell ${index}: ${derivation.output.quality.missingReason}`,
      );
    }
    const value = derivation.output.value;
    rainfallMm[index] = value.rainfallMm;
    runoffCoefficient[index] = value.runoffCoefficient;
    runoffDepthMm[index] = value.derivedRunoffMm;
    const volumeM3 = (value.derivedRunoffMm / 1000) * grid.cellSizeM ** 2;
    localRunoffVolumeM3[index] = volumeM3;
    sampledLandCells += 1;
    localRunoffVolumeTotalM3 += volumeM3;
    minimumRainfallMm = Math.min(minimumRainfallMm, value.rainfallMm);
    maximumRainfallMm = Math.max(maximumRainfallMm, value.rainfallMm);
    minimumRunoffDepthMm = Math.min(minimumRunoffDepthMm, value.derivedRunoffMm);
    maximumRunoffDepthMm = Math.max(maximumRunoffDepthMm, value.derivedRunoffMm);
    landCoverGroups.set(
      value.landCoverGroup,
      (landCoverGroups.get(value.landCoverGroup) ?? 0) + 1,
    );
  }

  const propagation = accumulateTerrainFlowVolume({
    width: grid.width,
    height: grid.height,
    directionCode: input.directionCode,
    terminalTypeCode: input.terminalTypeCode,
    localSourceVolumeM3: localRunoffVolumeM3,
  });
  return {
    modelVersion: EVENT_RUNOFF_MODEL_VERSION,
    runoffModelVersion: RUNOFF_MODEL_VERSION,
    rainfallMm,
    runoffCoefficient,
    runoffDepthMm,
    localRunoffVolumeM3,
    accumulatedRunoffVolumeM3: propagation.accumulatedVolumeM3,
    counts: {
      sampledLandCells,
      landCoverGroups: Object.fromEntries([...landCoverGroups].sort()),
      ...propagation.counts,
    },
    statistics: {
      minimumRainfallMm,
      maximumRainfallMm,
      minimumRunoffDepthMm,
      maximumRunoffDepthMm,
      localRunoffVolumeTotalM3,
    },
    massBalance: propagation.massBalance,
    maximumTerminalAccumulation: propagation.maximumTerminalAccumulation,
  };
}

export function nearestImergSample(sourceGrid, longitude, latitude) {
  const longitudeIndex = nearestIndex(sourceGrid.longitude, longitude);
  const latitudeIndex = nearestIndex(sourceGrid.latitude, latitude);
  const value = sourceGrid.precipitationMm[longitudeIndex][latitudeIndex];
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Nearest IMERG source cell is not available evidence');
  }
  return {
    value,
    sourceLongitude: sourceGrid.longitude[longitudeIndex],
    sourceLatitude: sourceGrid.latitude[latitudeIndex],
  };
}

function nearestIndex(values, target) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const distance = Math.abs(values[index] - target);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function validateImerg(imerg) {
  if (
    imerg.schemaVersion !== 'canonical-imerg-source-grid-v0.1.0' ||
    imerg.datasetId !== 'nasa-imerg-v07' ||
    imerg.status !== 'available' ||
    imerg.unit !== 'mm' ||
    imerg.provenance.datasetVersion !== '07' ||
    imerg.provenance.runType !== 'final' ||
    imerg.provenance.granuleCount !== 96 ||
    imerg.provenance.expectedGranuleCount !== 96
  ) {
    throw new Error('IMERG source grid loses its complete V07 Final Run contract');
  }
  if (
    imerg.sourceGrid.valueOrder !== 'longitude_major_latitude_minor' ||
    imerg.sourceGrid.longitude.length !== imerg.sourceGrid.precipitationMm.length
  ) {
    throw new Error('IMERG source-grid ordering is invalid');
  }
}

function float32Missing(length) {
  const values = new Float32Array(length);
  values.fill(Number.NaN);
  return values;
}

function float64Missing(length) {
  const values = new Float64Array(length);
  values.fill(Number.NaN);
  return values;
}

function assertLength(value, expected, label) {
  if (value.length !== expected) {
    throw new Error(`${label} length ${value.length} does not match ${expected}`);
  }
}
