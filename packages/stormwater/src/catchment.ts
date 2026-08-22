import {
  availableEvidence,
  Evidence,
  EvidenceDescriptor,
  EvidenceMetadataValue,
  isUnavailableEvidenceStatus,
  syntheticFixtureEvidence,
  unavailableEvidence,
} from '@geo-lens/evidence';
import { cellArea, getResolution, isValidCell } from 'h3-js';

import {
  deriveRunoff,
  RunoffDerivation,
  RunoffModelInput,
  RUNOFF_MODEL_VERSION,
  selectUnavailableEvidenceStatus,
} from './runoff';

export const CATCHMENT_AGGREGATION_VERSION =
  'h3-area-runoff-aggregation-v0.1.0';

export interface CatchmentEvidenceCell extends RunoffModelInput {
  readonly h3: string;
  readonly coverageFraction: number;
}

export interface StormwaterCatchment {
  readonly id: string;
  readonly outletNodeId: string;
  readonly cells: readonly CatchmentEvidenceCell[];
}

export interface CatchmentCellContribution {
  readonly h3: string;
  readonly coverageFraction: number;
  readonly representedAreaM2: number;
  readonly runoff: RunoffDerivation;
  readonly volumeM3: Evidence<number>;
}

export interface CatchmentContribution {
  readonly catchmentId: string;
  readonly outletNodeId: string;
  readonly aggregationVersion: typeof CATCHMENT_AGGREGATION_VERSION;
  readonly status: 'complete' | 'incomplete';
  readonly representedAreaM2: number;
  readonly availableAreaM2: number;
  readonly partialAvailableVolumeM3: number;
  readonly totalVolumeM3: Evidence<number>;
  readonly cells: readonly CatchmentCellContribution[];
}

export interface CatchmentAggregationOptions {
  readonly derivedAt: string;
}

export function aggregateCatchmentRunoff(
  catchment: StormwaterCatchment,
  options: CatchmentAggregationOptions,
): CatchmentContribution {
  validateCatchment(catchment);

  const cells = catchment.cells.map((cell) =>
    deriveCellContribution(cell, options.derivedAt),
  );
  const representedAreaM2 = cells.reduce(
    (sum, cell) => sum + cell.representedAreaM2,
    0,
  );
  const cellsWithValues = cells.filter(
    (cell) => cell.volumeM3.value !== null,
  );
  const availableAreaM2 = cellsWithValues.reduce(
    (sum, cell) => sum + cell.representedAreaM2,
    0,
  );
  const partialAvailableVolumeM3 = cellsWithValues.reduce(
    (sum, cell) => sum + (cell.volumeM3.value as number),
    0,
  );
  const descriptor = catchmentDescriptor(
    catchment,
    options.derivedAt,
    cells,
  );
  const hasMismatchedWindows = catchmentTimeKeys(catchment).size > 1;

  let totalVolumeM3: Evidence<number>;

  if (hasMismatchedWindows) {
    totalVolumeM3 = unavailableEvidence(
      'invalid_response',
      'Catchment cells do not share one observation/window definition',
      descriptor,
    );
  } else {
    const unavailableCells = cells.filter(
      (cell) => cell.volumeM3.value === null,
    );

    if (unavailableCells.length > 0) {
      const unavailableStatuses = unavailableCells.map(
        (cell) => cell.volumeM3.quality.status,
      );
      const status = selectUnavailableEvidenceStatus(
        unavailableStatuses,
      );
      const missingCells = unavailableCells.map(
        (cell) =>
          `${cell.h3}=${cell.volumeM3.quality.status} (${
            cell.volumeM3.quality.missingReason ?? 'no reason supplied'
          })`,
      );

      totalVolumeM3 = unavailableEvidence(
        status,
        `Catchment total is incomplete: ${missingCells.join('; ')}`,
        descriptor,
      );
    } else {
      const containsSynthetic = cells.some(
        (cell) =>
          cell.volumeM3.quality.status === 'synthetic_fixture',
      );

      if (containsSynthetic) {
        totalVolumeM3 = syntheticFixtureEvidence(
          partialAvailableVolumeM3,
          {
            fixtureId: `catchment-contribution:${catchment.id}`,
            unit: 'm3',
            spatial: descriptor.spatial,
            temporal: descriptor.temporal,
            transformation: descriptor.provenance.transformation,
            transformationVersion:
              descriptor.provenance.transformationVersion,
            samplingMethod: descriptor.provenance.samplingMethod,
            sourceMetadata: descriptor.provenance.sourceMetadata,
          },
        );
      } else {
        totalVolumeM3 = availableEvidence(
          partialAvailableVolumeM3,
          descriptor,
        );
      }
    }
  }

  return {
    catchmentId: catchment.id,
    outletNodeId: catchment.outletNodeId,
    aggregationVersion: CATCHMENT_AGGREGATION_VERSION,
    status: totalVolumeM3.value === null ? 'incomplete' : 'complete',
    representedAreaM2,
    availableAreaM2,
    partialAvailableVolumeM3,
    totalVolumeM3,
    cells,
  };
}

function deriveCellContribution(
  cell: CatchmentEvidenceCell,
  derivedAt: string,
): CatchmentCellContribution {
  assertEvidenceBelongsToCell(
    cell.h3,
    'rainfall_mm',
    cell.rainfallMm,
  );
  assertEvidenceBelongsToCell(cell.h3, 'slope_deg', cell.slopeDeg);
  assertEvidenceBelongsToCell(
    cell.h3,
    'land_cover_class',
    cell.landCoverClass,
  );

  const runoff = deriveRunoff(cell, { derivedAt });
  const representedAreaM2 =
    cellArea(cell.h3, 'm2') * cell.coverageFraction;
  const descriptor = cellVolumeDescriptor(
    cell,
    runoff,
    derivedAt,
  );
  let volumeM3: Evidence<number>;

  if (runoff.output.value === null) {
    const status = runoff.output.quality.status;

    if (!isUnavailableEvidenceStatus(status)) {
      throw new Error(
        `Runoff cell ${cell.h3} has no value with status ${status}`,
      );
    }

    volumeM3 = unavailableEvidence(
      status,
      runoff.output.quality.missingReason ??
        'Runoff evidence has no value',
      descriptor,
    );
  } else {
    const valueM3 =
      (runoff.output.value.derivedRunoffMm / 1000) *
      representedAreaM2;

    if (runoff.output.quality.status === 'synthetic_fixture') {
      volumeM3 = syntheticFixtureEvidence(valueM3, {
        fixtureId: `cell-runoff-volume:${cell.h3}`,
        unit: 'm3',
        spatial: descriptor.spatial,
        temporal: descriptor.temporal,
        transformation: descriptor.provenance.transformation,
        transformationVersion:
          descriptor.provenance.transformationVersion,
        samplingMethod: descriptor.provenance.samplingMethod,
        sourceMetadata: descriptor.provenance.sourceMetadata,
      });
    } else {
      volumeM3 = availableEvidence(valueM3, descriptor);
    }
  }

  return {
    h3: cell.h3,
    coverageFraction: cell.coverageFraction,
    representedAreaM2,
    runoff,
    volumeM3,
  };
}

function cellVolumeDescriptor(
  cell: CatchmentEvidenceCell,
  runoff: RunoffDerivation,
  derivedAt: string,
): EvidenceDescriptor {
  const sourceMetadata: Record<string, EvidenceMetadataValue> = {
    runoffStatus: runoff.output.quality.status,
    runoffModelVersion: RUNOFF_MODEL_VERSION,
    h3Resolution: getResolution(cell.h3),
    coverageFraction: cell.coverageFraction,
  };

  return {
    unit: 'm3',
    spatial: {
      h3: cell.h3,
    },
    temporal: {
      observedAt: cell.rainfallMm.temporal.observedAt,
      windowStart: cell.rainfallMm.temporal.windowStart,
      windowEnd: cell.rainfallMm.temporal.windowEnd,
      acquiredAt: derivedAt,
    },
    provenance: {
      provider: 'geolens-core',
      dataset: 'derived-runoff-volume',
      transformation: 'runoff depth multiplied by represented H3 area',
      transformationVersion: CATCHMENT_AGGREGATION_VERSION,
      samplingMethod:
        'runoff_mm / 1000 multiplied by H3 cell area and coverage fraction',
      sourceMetadata,
    },
  };
}

function catchmentDescriptor(
  catchment: StormwaterCatchment,
  derivedAt: string,
  cells: readonly CatchmentCellContribution[],
): EvidenceDescriptor {
  const firstRainfall = catchment.cells[0].rainfallMm;
  const sourceMetadata: Record<string, EvidenceMetadataValue> = {
    catchmentId: catchment.id,
    outletNodeId: catchment.outletNodeId,
    cellCount: cells.length,
    h3Resolutions: [
      ...new Set(catchment.cells.map((cell) => getResolution(cell.h3))),
    ],
    cellStatuses: cells.map((cell) => cell.volumeM3.quality.status),
  };

  return {
    unit: 'm3',
    spatial: {},
    temporal: {
      observedAt: firstRainfall.temporal.observedAt,
      windowStart: firstRainfall.temporal.windowStart,
      windowEnd: firstRainfall.temporal.windowEnd,
      acquiredAt: derivedAt,
    },
    provenance: {
      provider: 'geolens-core',
      dataset: 'catchment-runoff-contribution',
      transformation: 'sum of represented H3 runoff volumes',
      transformationVersion: CATCHMENT_AGGREGATION_VERSION,
      samplingMethod:
        'sum(runoff_mm / 1000 × H3 area_m2 × coverage_fraction)',
      sourceMetadata,
    },
  };
}

function catchmentTimeKeys(
  catchment: StormwaterCatchment,
): ReadonlySet<string> {
  return new Set(
    catchment.cells.map((cell) =>
      JSON.stringify({
        observedAt: cell.rainfallMm.temporal.observedAt ?? null,
        windowStart: cell.rainfallMm.temporal.windowStart ?? null,
        windowEnd: cell.rainfallMm.temporal.windowEnd ?? null,
      }),
    ),
  );
}

function validateCatchment(catchment: StormwaterCatchment): void {
  if (catchment.id.trim().length === 0) {
    throw new Error('Catchment id must be non-empty');
  }

  if (catchment.outletNodeId.trim().length === 0) {
    throw new Error('Catchment outletNodeId must be non-empty');
  }

  if (catchment.cells.length === 0) {
    throw new Error(`Catchment ${catchment.id} has no H3 cells`);
  }

  const seenCells = new Set<string>();

  for (const cell of catchment.cells) {
    if (!isValidCell(cell.h3)) {
      throw new Error(`Catchment ${catchment.id} contains invalid H3 ${cell.h3}`);
    }

    if (seenCells.has(cell.h3)) {
      throw new Error(
        `Catchment ${catchment.id} contains duplicate H3 ${cell.h3}`,
      );
    }
    seenCells.add(cell.h3);

    if (
      !Number.isFinite(cell.coverageFraction) ||
      cell.coverageFraction <= 0 ||
      cell.coverageFraction > 1
    ) {
      throw new Error(
        `Catchment cell ${cell.h3} coverageFraction must be in (0, 1]`,
      );
    }
  }
}

function assertEvidenceBelongsToCell(
  h3: string,
  name: string,
  evidence: Evidence<unknown>,
): void {
  if (
    evidence.spatial.h3 !== undefined &&
    evidence.spatial.h3 !== h3
  ) {
    throw new Error(
      `${name} evidence for ${h3} refers to H3 ${evidence.spatial.h3}`,
    );
  }
}
