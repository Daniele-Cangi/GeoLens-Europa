import {
  CatchmentContribution,
  ConditionedSurfaceCatchmentProxy,
  aggregateCatchmentRunoff,
} from '@geo-lens/stormwater';

import {
  EnvironmentalEvidenceBundle,
  EnvironmentalEvidenceComposer,
} from './environment';

export const CONDITIONED_SURFACE_RUNOFF_VERSION =
  'conditioned-surface-environmental-runoff-v0.1.0';

export const MAX_CONDITIONED_RUNOFF_H3_CELLS = 100;

export interface ConditionedSurfaceRunoffOptions {
  readonly referenceTime: Date;
  readonly derivedAt: string;
  readonly maximumCells?: number;
}

export interface ConditionedSurfaceRunoffResult {
  readonly status: 'complete' | 'incomplete';
  readonly semantics:
    'experimental_runoff_over_conditioned_surface_proxy';
  readonly modelVersion: typeof CONDITIONED_SURFACE_RUNOFF_VERSION;
  readonly surfaceDefinition: {
    readonly proxyId: string;
    readonly proxyModelVersion: string;
    readonly observedSewerCatchment: false;
    readonly outfallNodeId: string;
    readonly outfallH3: string;
  };
  readonly selection: {
    readonly candidateCellCount: number;
    readonly maximumCellCount: number;
    readonly selectedCellCount: number;
    readonly selectedH3Indices: readonly string[];
    readonly representedAreaM2: number;
    readonly coversAllConditionedContributingCells: boolean;
    readonly method:
      'shortest_conditioned_flow_path_then_h3';
  };
  readonly environmental: EnvironmentalEvidenceBundle;
  readonly catchmentContribution: CatchmentContribution;
  readonly limitations: readonly string[];
}

export async function composeConditionedSurfaceRunoff(
  proxy: ConditionedSurfaceCatchmentProxy,
  composer: EnvironmentalEvidenceComposer,
  options: ConditionedSurfaceRunoffOptions,
): Promise<ConditionedSurfaceRunoffResult> {
  validateOptions(options);
  if (proxy.contributingAreaM2.value === null) {
    throw new Error(
      'Conditioned runoff requires a complete contributing-area value',
    );
  }
  const maximumCells =
    options.maximumCells ?? MAX_CONDITIONED_RUNOFF_H3_CELLS;
  const candidates = proxy.contributingH3Indices.map((h3) => {
    const cell = proxy.cells[h3];

    if (cell === undefined) {
      throw new Error(
        'Conditioned surface proxy omits contributing cell ' + h3,
      );
    }
    if (cell.contributesToConditionedOutfall !== true) {
      throw new Error(
        'Conditioned surface proxy marks ' + h3 +
          ' as contributing without a true cell flag',
      );
    }
    if (
      !Number.isFinite(cell.representedAreaM2) ||
      cell.representedAreaM2 <= 0
    ) {
      throw new Error(
        'Conditioned surface cell ' + h3 +
          ' has invalid represented area',
      );
    }

    return cell;
  });
  const duplicateH3Indices = duplicateValues(
    candidates.map((cell) => cell.h3),
  );

  if (duplicateH3Indices.length > 0) {
    throw new Error(
      'Conditioned contributing cells contain duplicates: ' +
        duplicateH3Indices.join(', '),
    );
  }
  if (candidates.length === 0) {
    throw new Error(
      'Conditioned surface proxy has no cells contributing to its outfall',
    );
  }

  const selected = [...candidates]
    .sort(
      (left, right) =>
        left.pathH3Indices.length - right.pathH3Indices.length ||
        left.h3.localeCompare(right.h3),
    )
    .slice(0, maximumCells);
  const selectedH3Indices = selected.map((cell) => cell.h3);
  const environmental = await composer.compose({
    catchmentH3Indices: selectedH3Indices,
    nodes: [
      {
        id: proxy.outfallAttachment.nodeId,
        h3: proxy.outfallAttachment.h3,
        lat: proxy.outfallAttachment.position.lat,
        lon: proxy.outfallAttachment.position.lon,
      },
    ],
    referenceTime: options.referenceTime,
  });

  const catchmentContribution = aggregateCatchmentRunoff(
    {
      id: proxy.id + ':environmental-runoff',
      outletNodeId: proxy.outfallAttachment.nodeId,
      cells: selected.map((surfaceCell) => {
        const environmentalCell =
          environmental.cells[surfaceCell.h3];

        if (environmentalCell === undefined) {
          throw new Error(
            'Environmental composer omitted selected H3 ' +
              surfaceCell.h3,
          );
        }

        return {
          h3: surfaceCell.h3,
          coverageFraction: 1,
          rainfallMm: environmentalCell.rainfall24hMm,
          slopeDeg: environmentalCell.slopeDeg,
          landCoverClass: environmentalCell.landCoverClass,
        };
      }),
    },
    { derivedAt: options.derivedAt },
  );

  return {
    status: catchmentContribution.status,
    semantics: 'experimental_runoff_over_conditioned_surface_proxy',
    modelVersion: CONDITIONED_SURFACE_RUNOFF_VERSION,
    surfaceDefinition: {
      proxyId: proxy.id,
      proxyModelVersion: proxy.modelVersion,
      observedSewerCatchment: false,
      outfallNodeId: proxy.outfallAttachment.nodeId,
      outfallH3: proxy.outfallAttachment.h3,
    },
    selection: {
      candidateCellCount: candidates.length,
      maximumCellCount: maximumCells,
      selectedCellCount: selected.length,
      selectedH3Indices,
      representedAreaM2: selected.reduce(
        (sum, cell) => sum + cell.representedAreaM2,
        0,
      ),
      coversAllConditionedContributingCells:
        selected.length === candidates.length,
      method: 'shortest_conditioned_flow_path_then_h3',
    },
    environmental,
    catchmentContribution,
    limitations: [
      'The BGT/AHN contributing area is transparently conditioned and is not an observed sewer catchment.',
      'IMERG 0.1 degree rainfall and CLC 100 m land cover are sampled at H3 centroids; H3 resolution does not increase source precision.',
      'GLO-30 slope is a runoff-model input; AHN terrain and BGT surfaces define the conditioned contributing area.',
      'The runoff coefficient model is experimental and does not represent drainage capacity, hydraulics, flooding or sewer overflow.',
      'No network propagation is implied by this surface runoff composition.',
    ],
  };
}

function validateOptions(options: ConditionedSurfaceRunoffOptions): void {
  if (Number.isNaN(options.referenceTime.getTime())) {
    throw new Error('Conditioned runoff referenceTime must be valid');
  }
  if (Number.isNaN(Date.parse(options.derivedAt))) {
    throw new Error('Conditioned runoff derivedAt must be ISO 8601');
  }

  const maximumCells =
    options.maximumCells ?? MAX_CONDITIONED_RUNOFF_H3_CELLS;

  if (
    !Number.isInteger(maximumCells) ||
    maximumCells < 1 ||
    maximumCells > MAX_CONDITIONED_RUNOFF_H3_CELLS
  ) {
    throw new Error(
      'Conditioned runoff maximumCells must be an integer from 1 to ' +
        MAX_CONDITIONED_RUNOFF_H3_CELLS,
    );
  }
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort();
}