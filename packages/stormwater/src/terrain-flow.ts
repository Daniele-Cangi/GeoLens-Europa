/**
 * Deterministic terrain-only flow concentration over a bounded metric grid.
 *
 * This is a transparent D8 baseline. It does not fill depressions, infer flow
 * across the analysis boundary, or claim inundation, water depth or hydraulics.
 */
export const TERRAIN_FLOW_CONCENTRATION_VERSION =
  'bounded-d8-steepest-descent-v0.1.0';
export const TERRAIN_FLOW_VOLUME_PROPAGATION_VERSION =
  'd8-no-loss-volume-accumulation-v0.1.0';

export const TERRAIN_FLOW_DIRECTION_MISSING = -128;
export const TERRAIN_FLOW_DIRECTION_TERMINAL = -1;
export const TERRAIN_FLOW_TERMINAL_MISSING = 255;

export const TERRAIN_FLOW_DIRECTIONS = [
  { code: 0, name: 'north', rowOffset: -1, columnOffset: 0 },
  { code: 1, name: 'north_east', rowOffset: -1, columnOffset: 1 },
  { code: 2, name: 'east', rowOffset: 0, columnOffset: 1 },
  { code: 3, name: 'south_east', rowOffset: 1, columnOffset: 1 },
  { code: 4, name: 'south', rowOffset: 1, columnOffset: 0 },
  { code: 5, name: 'south_west', rowOffset: 1, columnOffset: -1 },
  { code: 6, name: 'west', rowOffset: 0, columnOffset: -1 },
  { code: 7, name: 'north_west', rowOffset: -1, columnOffset: -1 },
] as const;

export const TERRAIN_FLOW_TERMINAL_CODES = {
  flowing: 0,
  analysis_boundary: 1,
  known_permanent_water: 2,
  local_depression: 3,
  incomplete_input_boundary: 4,
} as const;

const TERRAIN_FLOW_TERMINAL_CODE_SET = new Set<number>(
  Object.values(TERRAIN_FLOW_TERMINAL_CODES),
);

export type TerrainFlowTerminal = keyof typeof TERRAIN_FLOW_TERMINAL_CODES;

export interface TerrainFlowConcentrationInput {
  readonly width: number;
  readonly height: number;
  readonly cellSizeM: number;
  readonly insideAoi: ArrayLike<number>;
  readonly elevationM: ArrayLike<number>;
  /** 1=known presence, 0=no known presence, 255=outside AOI. */
  readonly knownPermanentWater: ArrayLike<number>;
  /** Numeric comparison tolerance, not provider survey accuracy. */
  readonly elevationToleranceM?: number;
}

export interface TerrainFlowConcentrationResult {
  readonly modelVersion: typeof TERRAIN_FLOW_CONCENTRATION_VERSION;
  readonly directionCode: Int8Array;
  readonly downstreamIndex: Int32Array;
  readonly terminalTypeCode: Uint8Array;
  readonly terminalIndex: Int32Array;
  readonly upstreamLandCellCount: Uint32Array;
  readonly contributingLandAreaM2: Float64Array;
  readonly counts: {
    readonly gridCells: number;
    readonly insideAoiCells: number;
    readonly outsideAoiCells: number;
    readonly eligibleLandCells: number;
    readonly knownPermanentWaterCells: number;
    readonly missingElevationCells: number;
    readonly flowingCells: number;
    readonly analysisBoundaryTerminalCells: number;
    readonly knownPermanentWaterTerminalCells: number;
    readonly localDepressionTerminalCells: number;
    readonly incompleteInputBoundaryTerminalCells: number;
    readonly terminalCatchmentsWithLandContribution: number;
  };
  readonly massBalance: {
    readonly sourceLandAreaM2: number;
    readonly terminalAccumulatedLandAreaM2: number;
    readonly differenceM2: number;
  };
  readonly maximumTerminalAccumulation: {
    readonly terminalIndex: number | null;
    readonly landCellCount: number;
    readonly landAreaM2: number;
  };
  readonly semantics: {
    readonly routing: 'D8 steepest positive downslope gradient';
    readonly boundary: 'AOI-edge cells terminate without inferred off-grid elevation';
    readonly depressions: 'retained_without_filling';
    readonly permanentWater: 'known cell-centre presence excluded from land source area';
    readonly accumulation: 'upstream eligible land area without loss or attenuation';
  };
  readonly limitations: readonly string[];
}

export interface TerrainFlowVolumeInput {
  readonly width: number;
  readonly height: number;
  readonly directionCode: ArrayLike<number>;
  readonly terminalTypeCode: ArrayLike<number>;
  /** Finite non-negative volume on land; NaN on excluded/missing cells and water. */
  readonly localSourceVolumeM3: ArrayLike<number>;
}

export interface TerrainFlowVolumeResult {
  readonly modelVersion: typeof TERRAIN_FLOW_VOLUME_PROPAGATION_VERSION;
  readonly accumulatedVolumeM3: Float64Array;
  readonly counts: {
    readonly graphCells: number;
    readonly sourceLandCells: number;
    readonly flowingCells: number;
    readonly terminalCells: number;
    readonly waterTerminalCells: number;
  };
  readonly massBalance: {
    readonly localSourceVolumeM3: number;
    readonly terminalAccumulatedVolumeM3: number;
    readonly differenceM3: number;
  };
  readonly maximumTerminalAccumulation: {
    readonly terminalIndex: number | null;
    readonly volumeM3: number;
  };
}

const DEFAULT_ELEVATION_TOLERANCE_M = 0.000001;
const GRADIENT_TIE_TOLERANCE = 1e-15;

export function deriveTerrainFlowConcentration(
  input: TerrainFlowConcentrationInput,
): TerrainFlowConcentrationResult {
  assertPositiveInteger(input.width, 'width');
  assertPositiveInteger(input.height, 'height');
  assertPositiveFinite(input.cellSizeM, 'cellSizeM');
  const elevationToleranceM =
    input.elevationToleranceM ?? DEFAULT_ELEVATION_TOLERANCE_M;
  if (!Number.isFinite(elevationToleranceM) || elevationToleranceM < 0) {
    throw new Error('elevationToleranceM must be finite and non-negative');
  }

  const cellCount = input.width * input.height;
  assertLength(input.insideAoi, cellCount, 'insideAoi');
  assertLength(input.elevationM, cellCount, 'elevationM');
  assertLength(
    input.knownPermanentWater,
    cellCount,
    'knownPermanentWater',
  );

  const directionCode = new Int8Array(cellCount);
  directionCode.fill(TERRAIN_FLOW_DIRECTION_MISSING);
  const downstreamIndex = new Int32Array(cellCount);
  downstreamIndex.fill(-1);
  const terminalTypeCode = new Uint8Array(cellCount);
  terminalTypeCode.fill(TERRAIN_FLOW_TERMINAL_MISSING);
  const terminalIndex = new Int32Array(cellCount);
  terminalIndex.fill(-1);
  const upstreamLandCellCount = new Uint32Array(cellCount);
  const contributingLandAreaM2 = new Float64Array(cellCount);
  contributingLandAreaM2.fill(Number.NaN);

  const eligibleLand = new Uint8Array(cellCount);
  const knownWater = new Uint8Array(cellCount);
  const finiteElevation = new Uint8Array(cellCount);
  const sortableIndices: number[] = [];

  let insideAoiCells = 0;
  let eligibleLandCells = 0;
  let knownPermanentWaterCells = 0;
  let missingElevationCells = 0;

  for (let index = 0; index < cellCount; index += 1) {
    const inside = input.insideAoi[index];
    const water = input.knownPermanentWater[index];
    if (inside !== 0 && inside !== 1) {
      throw new Error(`insideAoi[${index}] must be 0 or 1`);
    }
    if (inside === 0) {
      if (water !== 255) {
        throw new Error(
          `knownPermanentWater[${index}] must be 255 outside the AOI`,
        );
      }
      continue;
    }
    insideAoiCells += 1;
    if (water !== 0 && water !== 1) {
      throw new Error(
        `knownPermanentWater[${index}] must be 0 or 1 inside the AOI`,
      );
    }
    const elevation = input.elevationM[index];
    if (Number.isFinite(elevation)) {
      finiteElevation[index] = 1;
      sortableIndices.push(index);
    }
    if (water === 1) {
      knownWater[index] = 1;
      knownPermanentWaterCells += 1;
      terminalTypeCode[index] =
        TERRAIN_FLOW_TERMINAL_CODES.known_permanent_water;
      directionCode[index] = TERRAIN_FLOW_DIRECTION_TERMINAL;
      terminalIndex[index] = index;
      contributingLandAreaM2[index] = 0;
      continue;
    }
    if (!Number.isFinite(elevation)) {
      missingElevationCells += 1;
      continue;
    }
    eligibleLand[index] = 1;
    eligibleLandCells += 1;
    upstreamLandCellCount[index] = 1;
    contributingLandAreaM2[index] = input.cellSizeM * input.cellSizeM;
  }

  let flowingCells = 0;
  let analysisBoundaryTerminalCells = 0;
  let localDepressionTerminalCells = 0;
  let incompleteInputBoundaryTerminalCells = 0;

  for (let index = 0; index < cellCount; index += 1) {
    if (eligibleLand[index] !== 1) {
      continue;
    }
    const row = Math.floor(index / input.width);
    const column = index % input.width;
    if (touchesAnalysisBoundary(row, column, input)) {
      setTerminal(
        index,
        TERRAIN_FLOW_TERMINAL_CODES.analysis_boundary,
        directionCode,
        terminalTypeCode,
        terminalIndex,
      );
      analysisBoundaryTerminalCells += 1;
      continue;
    }

    let bestDirection = -1;
    let bestDownstream = -1;
    let bestGradient = -Infinity;
    let touchesMissingInput = false;
    const sourceElevation = input.elevationM[index];

    for (const direction of TERRAIN_FLOW_DIRECTIONS) {
      const neighborRow = row + direction.rowOffset;
      const neighborColumn = column + direction.columnOffset;
      const neighborIndex = neighborRow * input.width + neighborColumn;
      if (finiteElevation[neighborIndex] !== 1) {
        touchesMissingInput = true;
        continue;
      }
      const dropM = sourceElevation - input.elevationM[neighborIndex];
      if (dropM <= elevationToleranceM) {
        continue;
      }
      const diagonal =
        direction.rowOffset !== 0 && direction.columnOffset !== 0;
      const distanceM = input.cellSizeM * (diagonal ? Math.SQRT2 : 1);
      const gradient = dropM / distanceM;
      if (gradient > bestGradient + GRADIENT_TIE_TOLERANCE) {
        bestGradient = gradient;
        bestDirection = direction.code;
        bestDownstream = neighborIndex;
      }
    }

    if (bestDownstream >= 0) {
      directionCode[index] = bestDirection;
      downstreamIndex[index] = bestDownstream;
      terminalTypeCode[index] = TERRAIN_FLOW_TERMINAL_CODES.flowing;
      flowingCells += 1;
    } else if (touchesMissingInput) {
      setTerminal(
        index,
        TERRAIN_FLOW_TERMINAL_CODES.incomplete_input_boundary,
        directionCode,
        terminalTypeCode,
        terminalIndex,
      );
      incompleteInputBoundaryTerminalCells += 1;
    } else {
      setTerminal(
        index,
        TERRAIN_FLOW_TERMINAL_CODES.local_depression,
        directionCode,
        terminalTypeCode,
        terminalIndex,
      );
      localDepressionTerminalCells += 1;
    }
  }

  sortableIndices.sort((left, right) => {
    const elevationDifference = input.elevationM[left] - input.elevationM[right];
    return elevationDifference === 0 ? left - right : elevationDifference;
  });
  for (const index of sortableIndices) {
    if (terminalTypeCode[index] !== TERRAIN_FLOW_TERMINAL_CODES.flowing) {
      continue;
    }
    const downstream = downstreamIndex[index];
    const resolvedTerminal = terminalIndex[downstream];
    if (resolvedTerminal < 0) {
      throw new Error(`Flow terminal is unresolved for cell ${index}`);
    }
    terminalIndex[index] = resolvedTerminal;
  }

  for (let position = sortableIndices.length - 1; position >= 0; position -= 1) {
    const index = sortableIndices[position];
    if (terminalTypeCode[index] !== TERRAIN_FLOW_TERMINAL_CODES.flowing) {
      continue;
    }
    const downstream = downstreamIndex[index];
    upstreamLandCellCount[downstream] += upstreamLandCellCount[index];
    contributingLandAreaM2[downstream] += contributingLandAreaM2[index];
  }

  let terminalAccumulatedLandAreaM2 = 0;
  let terminalCatchmentsWithLandContribution = 0;
  let maximumTerminalIndex: number | null = null;
  let maximumTerminalLandCellCount = 0;
  let maximumTerminalLandAreaM2 = 0;
  for (let index = 0; index < cellCount; index += 1) {
    if (
      terminalTypeCode[index] === TERRAIN_FLOW_TERMINAL_CODES.flowing ||
      terminalTypeCode[index] === TERRAIN_FLOW_TERMINAL_MISSING
    ) {
      continue;
    }
    const terminalArea = contributingLandAreaM2[index];
    if (!Number.isFinite(terminalArea) || terminalArea <= 0) {
      continue;
    }
    terminalCatchmentsWithLandContribution += 1;
    terminalAccumulatedLandAreaM2 += terminalArea;
    if (
      terminalArea > maximumTerminalLandAreaM2 ||
      (terminalArea === maximumTerminalLandAreaM2 &&
        (maximumTerminalIndex === null || index < maximumTerminalIndex))
    ) {
      maximumTerminalIndex = index;
      maximumTerminalLandCellCount = upstreamLandCellCount[index];
      maximumTerminalLandAreaM2 = terminalArea;
    }
  }

  const sourceLandAreaM2 =
    eligibleLandCells * input.cellSizeM * input.cellSizeM;
  const differenceM2 =
    terminalAccumulatedLandAreaM2 - sourceLandAreaM2;
  if (Math.abs(differenceM2) > 1e-9) {
    throw new Error(
      `Terrain flow area is not conserved: difference ${differenceM2} m2`,
    );
  }

  return {
    modelVersion: TERRAIN_FLOW_CONCENTRATION_VERSION,
    directionCode,
    downstreamIndex,
    terminalTypeCode,
    terminalIndex,
    upstreamLandCellCount,
    contributingLandAreaM2,
    counts: {
      gridCells: cellCount,
      insideAoiCells,
      outsideAoiCells: cellCount - insideAoiCells,
      eligibleLandCells,
      knownPermanentWaterCells,
      missingElevationCells,
      flowingCells,
      analysisBoundaryTerminalCells,
      knownPermanentWaterTerminalCells: knownPermanentWaterCells,
      localDepressionTerminalCells,
      incompleteInputBoundaryTerminalCells,
      terminalCatchmentsWithLandContribution,
    },
    massBalance: {
      sourceLandAreaM2,
      terminalAccumulatedLandAreaM2,
      differenceM2,
    },
    maximumTerminalAccumulation: {
      terminalIndex: maximumTerminalIndex,
      landCellCount: maximumTerminalLandCellCount,
      landAreaM2: maximumTerminalLandAreaM2,
    },
    semantics: {
      routing: 'D8 steepest positive downslope gradient',
      boundary: 'AOI-edge cells terminate without inferred off-grid elevation',
      depressions: 'retained_without_filling',
      permanentWater: 'known cell-centre presence excluded from land source area',
      accumulation: 'upstream eligible land area without loss or attenuation',
    },
    limitations: [
      'Copernicus GLO-30 is a surface model, not a bare-earth terrain model.',
      'No depression filling, breaching, river level, discharge, drainage capacity or hydraulic boundary condition is applied.',
      'Known permanent-water presence is historically incomplete; zero in that mask is not proof of historical absence.',
      'The result is terrain flow concentration, not inundation extent, water depth, flood probability or an operational forecast.',
    ],
  };
}

export function accumulateTerrainFlowVolume(
  input: TerrainFlowVolumeInput,
): TerrainFlowVolumeResult {
  assertPositiveInteger(input.width, 'width');
  assertPositiveInteger(input.height, 'height');
  const cellCount = input.width * input.height;
  assertLength(input.directionCode, cellCount, 'directionCode');
  assertLength(input.terminalTypeCode, cellCount, 'terminalTypeCode');
  assertLength(input.localSourceVolumeM3, cellCount, 'localSourceVolumeM3');

  const accumulatedVolumeM3 = new Float64Array(cellCount);
  accumulatedVolumeM3.fill(Number.NaN);
  const indegree = new Uint32Array(cellCount);
  const downstream = new Int32Array(cellCount);
  downstream.fill(-1);
  const graphCell = new Uint8Array(cellCount);
  let graphCells = 0;
  let sourceLandCells = 0;
  let flowingCells = 0;
  let terminalCells = 0;
  let waterTerminalCells = 0;
  let localSourceVolumeM3 = 0;

  for (let index = 0; index < cellCount; index += 1) {
    const type = input.terminalTypeCode[index];
    const direction = input.directionCode[index];
    const localVolume = input.localSourceVolumeM3[index];
    if (type === TERRAIN_FLOW_TERMINAL_MISSING) {
      if (direction !== TERRAIN_FLOW_DIRECTION_MISSING || !Number.isNaN(localVolume)) {
        throw new Error(`Missing flow cell ${index} must retain missing sentinels`);
      }
      continue;
    }
    if (!TERRAIN_FLOW_TERMINAL_CODE_SET.has(type)) {
      throw new Error(`Flow cell ${index} has unsupported terminal type ${type}`);
    }
    graphCell[index] = 1;
    graphCells += 1;
    accumulatedVolumeM3[index] = 0;
    if (type === TERRAIN_FLOW_TERMINAL_CODES.known_permanent_water) {
      waterTerminalCells += 1;
      terminalCells += 1;
      if (direction !== TERRAIN_FLOW_DIRECTION_TERMINAL || !Number.isNaN(localVolume)) {
        throw new Error(`Known-water terminal ${index} cannot be a land source`);
      }
      continue;
    }
    if (!Number.isFinite(localVolume) || localVolume < 0) {
      throw new Error(`Land flow cell ${index} requires finite non-negative source volume`);
    }
    sourceLandCells += 1;
    localSourceVolumeM3 += localVolume;
    accumulatedVolumeM3[index] = localVolume;
    if (type === TERRAIN_FLOW_TERMINAL_CODES.flowing) {
      if (!Number.isInteger(direction) || direction < 0 || direction >= TERRAIN_FLOW_DIRECTIONS.length) {
        throw new Error(`Flowing cell ${index} has invalid D8 direction`);
      }
      const definition = TERRAIN_FLOW_DIRECTIONS[direction];
      const row = Math.floor(index / input.width);
      const column = index % input.width;
      const targetRow = row + definition.rowOffset;
      const targetColumn = column + definition.columnOffset;
      if (
        targetRow < 0 ||
        targetRow >= input.height ||
        targetColumn < 0 ||
        targetColumn >= input.width
      ) {
        throw new Error(`Flowing cell ${index} exits the frozen grid`);
      }
      const target = targetRow * input.width + targetColumn;
      downstream[index] = target;
      indegree[target] += 1;
      flowingCells += 1;
    } else {
      if (direction !== TERRAIN_FLOW_DIRECTION_TERMINAL) {
        throw new Error(`Terminal cell ${index} must use direction -1`);
      }
      terminalCells += 1;
    }
  }

  const queue: number[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    if (graphCell[index] === 1 && indegree[index] === 0) {
      queue.push(index);
    }
  }
  let queuePosition = 0;
  let processedCells = 0;
  while (queuePosition < queue.length) {
    const index = queue[queuePosition];
    queuePosition += 1;
    processedCells += 1;
    const target = downstream[index];
    if (target < 0) {
      continue;
    }
    if (graphCell[target] !== 1) {
      throw new Error(`Flowing cell ${index} targets missing cell ${target}`);
    }
    accumulatedVolumeM3[target] += accumulatedVolumeM3[index];
    indegree[target] -= 1;
    if (indegree[target] === 0) {
      queue.push(target);
    }
  }
  if (processedCells !== graphCells) {
    throw new Error('Frozen terrain-flow graph contains a cycle');
  }

  let terminalAccumulatedVolumeM3 = 0;
  let maximumTerminalIndex: number | null = null;
  let maximumTerminalVolumeM3 = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const type = input.terminalTypeCode[index];
    if (type === TERRAIN_FLOW_TERMINAL_MISSING || type === TERRAIN_FLOW_TERMINAL_CODES.flowing) {
      continue;
    }
    const volume = accumulatedVolumeM3[index];
    terminalAccumulatedVolumeM3 += volume;
    if (
      volume > maximumTerminalVolumeM3 ||
      (volume === maximumTerminalVolumeM3 && volume > 0 &&
        (maximumTerminalIndex === null || index < maximumTerminalIndex))
    ) {
      maximumTerminalIndex = index;
      maximumTerminalVolumeM3 = volume;
    }
  }
  const differenceM3 = terminalAccumulatedVolumeM3 - localSourceVolumeM3;
  const balanceToleranceM3 = Math.max(
    1e-9,
    Math.abs(localSourceVolumeM3) * 1e-12,
  );
  if (Math.abs(differenceM3) > balanceToleranceM3) {
    throw new Error(`Terrain flow volume is not conserved: ${differenceM3} m3`);
  }

  return {
    modelVersion: TERRAIN_FLOW_VOLUME_PROPAGATION_VERSION,
    accumulatedVolumeM3,
    counts: {
      graphCells,
      sourceLandCells,
      flowingCells,
      terminalCells,
      waterTerminalCells,
    },
    massBalance: {
      localSourceVolumeM3,
      terminalAccumulatedVolumeM3,
      differenceM3,
    },
    maximumTerminalAccumulation: {
      terminalIndex: maximumTerminalIndex,
      volumeM3: maximumTerminalVolumeM3,
    },
  };
}

function touchesAnalysisBoundary(
  row: number,
  column: number,
  input: TerrainFlowConcentrationInput,
): boolean {
  for (const direction of TERRAIN_FLOW_DIRECTIONS) {
    const neighborRow = row + direction.rowOffset;
    const neighborColumn = column + direction.columnOffset;
    if (
      neighborRow < 0 ||
      neighborRow >= input.height ||
      neighborColumn < 0 ||
      neighborColumn >= input.width
    ) {
      return true;
    }
    const neighborIndex = neighborRow * input.width + neighborColumn;
    if (input.insideAoi[neighborIndex] === 0) {
      return true;
    }
  }
  return false;
}

function setTerminal(
  index: number,
  typeCode: number,
  directionCode: Int8Array,
  terminalTypeCode: Uint8Array,
  terminalIndex: Int32Array,
): void {
  directionCode[index] = TERRAIN_FLOW_DIRECTION_TERMINAL;
  terminalTypeCode[index] = typeCode;
  terminalIndex[index] = index;
}

function assertLength(
  value: ArrayLike<number>,
  expected: number,
  label: string,
): void {
  if (value.length !== expected) {
    throw new Error(`${label} must contain ${expected} cells`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive and finite`);
  }
}
