import {
  Evidence,
  EvidenceDescriptor,
  EvidenceStatus,
  availableEvidence,
  syntheticFixtureEvidence,
  unavailableEvidence,
} from '@geo-lens/evidence';
import {
  cellArea,
  cellToBoundary,
  cellToLatLng,
  getResolution,
  gridDisk,
  gridDistance,
  isValidCell,
} from 'h3-js';

import { selectUnavailableEvidenceStatus } from './runoff';
import { SurfaceCatchmentGrid } from './surface-catchment';

export const CONDITIONED_SURFACE_CATCHMENT_VERSION =
  'bounded-bgt-ahn-priority-flood-v0.1.0';

const DEFAULT_INTERPOLATION_MAX_GRID_DISTANCE = 4;
const DEFAULT_INTERPOLATION_MIN_SAMPLES = 3;
const MAX_INTERPOLATION_SAMPLES = 18;

export type ConditionedSurfaceClass =
  | 'vegetated_terrain'
  | 'unvegetated_terrain'
  | 'building'
  | 'surface_water'
  | 'road'
  | 'supporting_water'
  | 'supporting_road'
  | 'structural_barrier';

export interface ConditionedSurfaceObservation {
  readonly surfaceClass: ConditionedSurfaceClass;
  readonly collection: string;
  readonly featureId: string;
  readonly localId: string;
}

export interface ConditionedSurfaceCatchmentInput {
  readonly id: string;
  readonly outfallNodeId: string;
  readonly outfallPosition: {
    readonly lat: number;
    readonly lon: number;
  };
  readonly grid: SurfaceCatchmentGrid;
  readonly rawElevationByH3: Readonly<Record<string, Evidence<number>>>;
  readonly surfaceByH3: Readonly<
    Record<string, Evidence<ConditionedSurfaceObservation>>
  >;
  readonly derivedAt: string;
  readonly interpolationMaxGridDistance?: number;
  readonly interpolationMinSamples?: number;
}

export type TerrainConditioningMethod =
  | 'retain_observed_ahn_area_mean'
  | 'idw_from_observed_ahn_neighbors'
  | 'excluded_observed_surface_water'
  | 'excluded_observed_structural_barrier'
  | 'unresolved_missing_surface_class'
  | 'unresolved_insufficient_ahn_neighbors';

export type ConditionedFlowTermination =
  | 'conditioned_outfall_terminal'
  | 'analysis_bbox_exit'
  | 'observed_surface_water_exit'
  | 'excluded_observed_surface_water'
  | 'excluded_observed_structural_barrier'
  | 'incomplete_conditioning';

export interface ConditionedSurfaceCatchmentCell {
  readonly h3: string;
  readonly representedAreaM2: number;
  readonly boundary: readonly (readonly [number, number])[];
  readonly surface: Evidence<ConditionedSurfaceObservation>;
  readonly rawElevationM: Evidence<number>;
  readonly terrainElevationM: Evidence<number>;
  readonly hydrologicElevationM: Evidence<number>;
  readonly terrainConditioning: {
    readonly method: TerrainConditioningMethod;
    readonly interpolationSourceH3Indices: readonly string[];
    readonly interpolationMaximumGridDistance: number | null;
  };
  readonly depressionFillM: number | null;
  readonly downstreamH3: string | null;
  readonly termination: ConditionedFlowTermination;
  readonly contributesToConditionedOutfall: boolean | null;
  readonly pathH3Indices: readonly string[];
}

export interface ConditionedSurfaceCatchmentProxy {
  readonly id: string;
  readonly semantics:
    'experimental_bgt_ahn_conditioned_surface_contributing_area_proxy';
  readonly modelVersion: typeof CONDITIONED_SURFACE_CATCHMENT_VERSION;
  readonly status: EvidenceStatus;
  readonly outfallAttachment: {
    readonly nodeId: string;
    readonly position: {
      readonly lat: number;
      readonly lon: number;
    };
    readonly h3: string;
    readonly observed: false;
    readonly method:
      'priority_flood_conditioned_outfall_terminal';
    readonly eligibleForSewerPropagation: false;
    readonly reason: string;
  };
  readonly coverage: SurfaceCatchmentGrid & {
    readonly targetCellCount: number;
    readonly areaRepresentation: 'full_h3_cell_area';
  };
  readonly conditioning: {
    readonly interpolationMethod:
      'inverse_distance_weighted_mean_of_observed_ahn_h3_area_means';
    readonly interpolationMaxGridDistance: number;
    readonly interpolationMinSamples: number;
    readonly depressionMethod:
      'multi_terminal_priority_flood_minimum_spill_elevation';
    readonly terminalPriorityOnExactTie: readonly [
      'conditioned_outfall_terminal',
      'observed_surface_water_exit',
      'analysis_bbox_exit',
    ];
  };
  readonly contributingAreaM2: Evidence<number>;
  readonly partialContributingAreaM2: number;
  readonly contributingH3Indices: readonly string[];
  readonly cells: Readonly<
    Record<string, ConditionedSurfaceCatchmentCell>
  >;
  readonly counts: {
    readonly targetCells: number;
    readonly observedElevationCells: number;
    readonly interpolatedElevationCells: number;
    readonly excludedSurfaceWaterCells: number;
    readonly excludedStructuralBarrierCells: number;
    readonly unresolvedConditioningCells: number;
    readonly depressionRaisedCells: number;
    readonly contributingCells: number;
    readonly analysisBboxExitCells: number;
    readonly observedSurfaceWaterExitCells: number;
  };
  readonly sewerCatchmentSemantics: 'not_observed';
  readonly limitations: readonly string[];
}

interface PreparedCell {
  readonly h3: string;
  readonly surface: Evidence<ConditionedSurfaceObservation>;
  readonly rawElevationM: Evidence<number>;
  readonly terrainElevationM: Evidence<number>;
  readonly method: TerrainConditioningMethod;
  readonly interpolationSourceH3Indices: readonly string[];
  readonly interpolationMaximumGridDistance: number | null;
  readonly kind: 'active' | 'water' | 'barrier' | 'unresolved';
}

type Terminal =
  | 'conditioned_outfall_terminal'
  | 'observed_surface_water_exit'
  | 'analysis_bbox_exit';

interface FloodState {
  readonly h3: string;
  readonly spillElevationM: number;
  readonly maximumFillDepthM: number;
  readonly terminal: Terminal;
  readonly terminalH3: string;
  readonly downstreamH3: string | null;
  readonly steps: number;
}

export function deriveConditionedSurfaceCatchmentProxy(
  input: ConditionedSurfaceCatchmentInput,
): ConditionedSurfaceCatchmentProxy {
  validateInput(input);
  const interpolationMaxGridDistance =
    input.interpolationMaxGridDistance ??
    DEFAULT_INTERPOLATION_MAX_GRID_DISTANCE;
  const interpolationMinSamples =
    input.interpolationMinSamples ??
    DEFAULT_INTERPOLATION_MIN_SAMPLES;
  validateInterpolationOptions(
    interpolationMaxGridDistance,
    interpolationMinSamples,
  );

  const target = new Set(input.grid.targetH3Indices);
  const availableDonors = input.grid.sampledH3Indices
    .map((h3) => ({ h3, evidence: input.rawElevationByH3[h3] }))
    .filter(
      (candidate): candidate is {
        readonly h3: string;
        readonly evidence: Evidence<number> & { readonly value: number };
      } => typeof candidate.evidence?.value === 'number',
    );
  const prepared = new Map<string, PreparedCell>();

  for (const h3 of input.grid.targetH3Indices) {
    const surface = input.surfaceByH3[h3];
    const rawElevationM = input.rawElevationByH3[h3];
    if (surface === undefined) {
      throw new Error(`Conditioned surface input omits BGT evidence for ${h3}`);
    }
    if (rawElevationM === undefined) {
      throw new Error(`Conditioned surface input omits AHN evidence for ${h3}`);
    }

    const isOutfall = h3 === input.grid.outletH3;
    const isWater = surface.value !== null &&
      (surface.value.surfaceClass === 'surface_water' ||
        surface.value.surfaceClass === 'supporting_water');
    const isBarrier = surface.value?.surfaceClass ===
      'structural_barrier';

    if (surface.value === null) {
      prepared.set(h3, unresolvedCell(
        h3,
        surface,
        rawElevationM,
        'unresolved_missing_surface_class',
        input.derivedAt,
      ));
      continue;
    }
    if (isWater && !isOutfall) {
      prepared.set(h3, waterCell(
        h3,
        surface,
        rawElevationM,
        input.derivedAt,
      ));
      continue;
    }
    if (isBarrier && !isOutfall) {
      prepared.set(h3, barrierCell(
        h3,
        surface,
        rawElevationM,
        input.derivedAt,
      ));
      continue;
    }
    if (typeof rawElevationM.value === 'number') {
      prepared.set(h3, {
        h3,
        surface,
        rawElevationM,
        terrainElevationM: derivedElevationEvidence({
          h3,
          value: rawElevationM.value,
          derivedAt: input.derivedAt,
          sourceEvidence: [rawElevationM, surface],
          transformation: 'retain observed AHN H3 area mean for terrain conditioning',
          sourceH3Indices: [h3],
        }),
        method: 'retain_observed_ahn_area_mean',
        interpolationSourceH3Indices: [],
        interpolationMaximumGridDistance: null,
        kind: 'active',
      });
      continue;
    }

    const interpolation = interpolateElevation({
      h3,
      donors: availableDonors,
      maxGridDistance: interpolationMaxGridDistance,
      minSamples: interpolationMinSamples,
    });
    if (interpolation === null) {
      prepared.set(h3, unresolvedCell(
        h3,
        surface,
        rawElevationM,
        'unresolved_insufficient_ahn_neighbors',
        input.derivedAt,
      ));
      continue;
    }

    prepared.set(h3, {
      h3,
      surface,
      rawElevationM,
      terrainElevationM: derivedElevationEvidence({
        h3,
        value: interpolation.value,
        derivedAt: input.derivedAt,
        sourceEvidence: [
          surface,
          ...interpolation.donors.map((donor) => donor.evidence),
        ],
        transformation: 'inverse-distance interpolate missing AHN H3 terrain value',
        sourceH3Indices: interpolation.donors.map((donor) => donor.h3),
      }),
      method: 'idw_from_observed_ahn_neighbors',
      interpolationSourceH3Indices: interpolation.donors.map((donor) => donor.h3),
      interpolationMaximumGridDistance: interpolation.maximumDistance,
      kind: 'active',
    });
  }

  const flood = priorityFlood(prepared, target, input.grid.outletH3);
  const cells = new Map<string, ConditionedSurfaceCatchmentCell>();
  const contributingH3Indices: string[] = [];
  let observedElevationCells = 0;
  let interpolatedElevationCells = 0;
  let excludedSurfaceWaterCells = 0;
  let excludedStructuralBarrierCells = 0;
  let unresolvedConditioningCells = 0;
  let depressionRaisedCells = 0;
  let analysisBboxExitCells = 0;
  let observedSurfaceWaterExitCells = 0;

  for (const h3 of input.grid.targetH3Indices) {
    const item = prepared.get(h3)!;
    const representedAreaM2 = cellArea(h3, 'm2');
    const base = {
      h3,
      representedAreaM2,
      boundary: closeBoundary(cellToBoundary(h3, true)),
      surface: item.surface,
      rawElevationM: item.rawElevationM,
      terrainElevationM: item.terrainElevationM,
      terrainConditioning: {
        method: item.method,
        interpolationSourceH3Indices: item.interpolationSourceH3Indices,
        interpolationMaximumGridDistance: item.interpolationMaximumGridDistance,
      },
    };

    if (item.kind === 'water') {
      excludedSurfaceWaterCells += 1;
      cells.set(h3, {
        ...base,
        hydrologicElevationM: unavailableDerivedElevation(
          h3,
          'out_of_coverage',
          'Observed BGT surface water is excluded from the land terrain graph',
          input.derivedAt,
        ),
        depressionFillM: null,
        downstreamH3: null,
        termination: 'excluded_observed_surface_water',
        contributesToConditionedOutfall: false,
        pathH3Indices: [h3],
      });
      continue;
    }
    if (item.kind === 'barrier') {
      excludedStructuralBarrierCells += 1;
      cells.set(h3, {
        ...base,
        hydrologicElevationM: unavailableDerivedElevation(
          h3,
          'out_of_coverage',
          'Observed BGT structural barrier is excluded from the land terrain graph',
          input.derivedAt,
        ),
        depressionFillM: null,
        downstreamH3: null,
        termination: 'excluded_observed_structural_barrier',
        contributesToConditionedOutfall: false,
        pathH3Indices: [h3],
      });
      continue;
    }

    const state = flood.get(h3);
    if (item.kind === 'unresolved' || state === undefined) {
      unresolvedConditioningCells += 1;
      cells.set(h3, {
        ...base,
        hydrologicElevationM: unavailableDerivedElevation(
          h3,
          selectUnavailableEvidenceStatus([
            item.surface.quality.status,
            item.rawElevationM.quality.status,
          ]),
          'Terrain conditioning is incomplete for this cell',
          input.derivedAt,
        ),
        depressionFillM: null,
        downstreamH3: null,
        termination: 'incomplete_conditioning',
        contributesToConditionedOutfall: null,
        pathH3Indices: [h3],
      });
      continue;
    }

    if (item.method === 'retain_observed_ahn_area_mean') {
      observedElevationCells += 1;
    } else {
      interpolatedElevationCells += 1;
    }
    const terrainValue = item.terrainElevationM.value!;
    const depressionFillM = Math.max(0, state.spillElevationM - terrainValue);
    if (depressionFillM > 1e-9) {
      depressionRaisedCells += 1;
    }
    const contributes = state.terminal === 'conditioned_outfall_terminal';
    if (contributes) {
      contributingH3Indices.push(h3);
    } else if (state.terminal === 'analysis_bbox_exit') {
      analysisBboxExitCells += 1;
    } else {
      observedSurfaceWaterExitCells += 1;
    }
    cells.set(h3, {
      ...base,
      hydrologicElevationM: derivedElevationEvidence({
        h3,
        value: state.spillElevationM,
        derivedAt: input.derivedAt,
        sourceEvidence: [item.terrainElevationM, item.surface],
        transformation: 'multi-terminal priority-flood minimum spill elevation',
        sourceH3Indices: [h3, state.terminalH3],
      }),
      depressionFillM,
      downstreamH3: state.downstreamH3,
      termination: state.terminal,
      contributesToConditionedOutfall: contributes,
      pathH3Indices: tracePath(h3, flood, input.grid.targetH3Indices.length),
    });
  }

  contributingH3Indices.sort();
  const partialContributingAreaM2 = contributingH3Indices.reduce(
    (sum, h3) => sum + cellArea(h3, 'm2'),
    0,
  );
  const evidenceStatuses = input.grid.targetH3Indices.flatMap((h3) => [
    input.surfaceByH3[h3].quality.status,
    input.rawElevationByH3[h3].quality.status,
  ]);
  const areaDescriptor = areaEvidenceDescriptor(input, {
    interpolationMaxGridDistance,
    interpolationMinSamples,
    contributingCellCount: contributingH3Indices.length,
  });
  const contributingAreaM2 = unresolvedConditioningCells > 0
    ? unavailableEvidence<number>(
        selectUnavailableEvidenceStatus(evidenceStatuses),
        `${unresolvedConditioningCells} target cells have incomplete BGT/AHN terrain conditioning; partial conditioned area is ${partialContributingAreaM2.toFixed(2)} m2`,
        areaDescriptor,
      )
    : derivedAreaEvidence(
        partialContributingAreaM2,
        areaDescriptor,
        evidenceStatuses.includes('synthetic_fixture'),
        input.id,
      );

  return {
    id: input.id,
    semantics: 'experimental_bgt_ahn_conditioned_surface_contributing_area_proxy',
    modelVersion: CONDITIONED_SURFACE_CATCHMENT_VERSION,
    status: contributingAreaM2.quality.status,
    outfallAttachment: {
      nodeId: input.outfallNodeId,
      position: input.outfallPosition,
      h3: input.grid.outletH3,
      observed: false,
      method: 'priority_flood_conditioned_outfall_terminal',
      eligibleForSewerPropagation: false,
      reason: 'The outlet attachment is an explicit terrain-model boundary condition, not an observed BGT Inlooptabel or Waternet sewer-catchment relation.',
    },
    coverage: {
      ...input.grid,
      targetCellCount: input.grid.targetH3Indices.length,
      areaRepresentation: 'full_h3_cell_area',
    },
    conditioning: {
      interpolationMethod: 'inverse_distance_weighted_mean_of_observed_ahn_h3_area_means',
      interpolationMaxGridDistance,
      interpolationMinSamples,
      depressionMethod: 'multi_terminal_priority_flood_minimum_spill_elevation',
      terminalPriorityOnExactTie: [
        'conditioned_outfall_terminal',
        'observed_surface_water_exit',
        'analysis_bbox_exit',
      ],
    },
    contributingAreaM2,
    partialContributingAreaM2,
    contributingH3Indices,
    cells: Object.fromEntries(cells),
    counts: {
      targetCells: input.grid.targetH3Indices.length,
      observedElevationCells,
      interpolatedElevationCells,
      excludedSurfaceWaterCells,
      excludedStructuralBarrierCells,
      unresolvedConditioningCells,
      depressionRaisedCells,
      contributingCells: contributingH3Indices.length,
      analysisBboxExitCells,
      observedSurfaceWaterExitCells,
    },
    sewerCatchmentSemantics: 'not_observed',
    limitations: [
      'BGT identifies physical surface objects but does not provide an Amsterdam BGT Inlooptabel destination or an observed relation to this Waternet outfall.',
      'Missing AHN land elevations are retained as missing raw evidence; the separate terrain value is an IDW model estimate from traceable observed AHN H3 area means.',
      'Priority-flood removes closed depressions and uses the observed outfall, bounded analysis edge and observed surface water as explicit competing terminals.',
      'BGT wall and quay-wall polygons are coarse H3 barriers; their sub-cell crest height and hydraulic passability are not modeled.',
      'Buildings, kerbs, gutters, inlet capacity, pipe hydraulics and sewer storage are not modeled.',
      'The conditioned area is experimental and is not eligible for sewer propagation without an authoritative attachment and resolved network direction.',
    ],
  };
}

function interpolateElevation(input: {
  readonly h3: string;
  readonly donors: readonly {
    readonly h3: string;
    readonly evidence: Evidence<number> & { readonly value: number };
  }[];
  readonly maxGridDistance: number;
  readonly minSamples: number;
}): {
  readonly value: number;
  readonly maximumDistance: number;
  readonly donors: readonly {
    readonly h3: string;
    readonly distance: number;
    readonly evidence: Evidence<number> & { readonly value: number };
  }[];
} | null {
  const candidates = input.donors
    .map((donor) => ({
      ...donor,
      distance: safeGridDistance(input.h3, donor.h3),
    }))
    .filter((donor) =>
      donor.distance !== null && donor.distance > 0 &&
      donor.distance <= input.maxGridDistance,
    )
    .sort((left, right) =>
      left.distance! - right.distance! || left.h3.localeCompare(right.h3),
    )
    .slice(0, MAX_INTERPOLATION_SAMPLES)
    .map((donor) => ({ ...donor, distance: donor.distance! }));
  if (candidates.length < input.minSamples) {
    return null;
  }
  const weighted = candidates.reduce(
    (state, donor) => {
      const weight = 1 / donor.distance;
      return {
        numerator: state.numerator + donor.evidence.value * weight,
        denominator: state.denominator + weight,
      };
    },
    { numerator: 0, denominator: 0 },
  );
  return {
    value: weighted.numerator / weighted.denominator,
    maximumDistance: Math.max(...candidates.map((donor) => donor.distance)),
    donors: candidates,
  };
}

function priorityFlood(
  prepared: ReadonlyMap<string, PreparedCell>,
  target: ReadonlySet<string>,
  outletH3: string,
): ReadonlyMap<string, FloodState> {
  const states = new Map<string, FloodState>();
  const heap = new MinHeap(compareFloodStates);
  const water = new Set(
    [...prepared.values()]
      .filter((cell) => cell.kind === 'water')
      .map((cell) => cell.h3),
  );

  for (const cell of prepared.values()) {
    if (cell.kind !== 'active' || cell.terrainElevationM.value === null) {
      continue;
    }
    const neighbors = neighborsOf(cell.h3);
    let terminal: Terminal | null = null;
    if (cell.h3 === outletH3) {
      terminal = 'conditioned_outfall_terminal';
    } else if (neighbors.some((neighbor) => water.has(neighbor))) {
      terminal = 'observed_surface_water_exit';
    } else if (neighbors.some((neighbor) => !target.has(neighbor))) {
      terminal = 'analysis_bbox_exit';
    }
    if (terminal === null) {
      continue;
    }
    const seed: FloodState = {
      h3: cell.h3,
      spillElevationM: cell.terrainElevationM.value,
      maximumFillDepthM: 0,
      terminal,
      terminalH3: cell.h3,
      downstreamH3: null,
      steps: 0,
    };
    const existing = states.get(cell.h3);
    if (existing === undefined || compareFloodStates(seed, existing) < 0) {
      states.set(cell.h3, seed);
      heap.push(seed);
    }
  }

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (states.get(current.h3) !== current) {
      continue;
    }
    for (const neighborH3 of neighborsOf(current.h3)) {
      if (!target.has(neighborH3)) {
        continue;
      }
      const neighbor = prepared.get(neighborH3);
      if (neighbor?.kind !== 'active' || neighbor.terrainElevationM.value === null) {
        continue;
      }
      const spillElevationM = Math.max(
        neighbor.terrainElevationM.value,
        current.spillElevationM,
      );
      const candidate: FloodState = {
        h3: neighborH3,
        spillElevationM,
        maximumFillDepthM: Math.max(
          current.maximumFillDepthM,
          spillElevationM - neighbor.terrainElevationM.value,
        ),
        terminal: current.terminal,
        terminalH3: current.terminalH3,
        downstreamH3: current.h3,
        steps: current.steps + 1,
      };
      const existing = states.get(neighborH3);
      if (existing === undefined || compareFloodStates(candidate, existing) < 0) {
        states.set(neighborH3, candidate);
        heap.push(candidate);
      }
    }
  }

  return states;
}

function compareFloodStates(left: FloodState, right: FloodState): number {
  return left.spillElevationM - right.spillElevationM ||
    left.maximumFillDepthM - right.maximumFillDepthM ||
    terminalPriority(left.terminal) - terminalPriority(right.terminal) ||
    left.steps - right.steps ||
    left.terminalH3.localeCompare(right.terminalH3) ||
    left.h3.localeCompare(right.h3);
}

function terminalPriority(terminal: Terminal): number {
  if (terminal === 'conditioned_outfall_terminal') return 0;
  if (terminal === 'observed_surface_water_exit') return 1;
  return 2;
}

function tracePath(
  startH3: string,
  flood: ReadonlyMap<string, FloodState>,
  maximumLength: number,
): readonly string[] {
  const path = [startH3];
  const seen = new Set(path);
  let current = flood.get(startH3);
  while (current?.downstreamH3 !== null && current?.downstreamH3 !== undefined) {
    if (seen.has(current.downstreamH3) || path.length > maximumLength) {
      throw new Error(`Conditioned surface routing contains a cycle from ${startH3}`);
    }
    path.push(current.downstreamH3);
    seen.add(current.downstreamH3);
    current = flood.get(current.downstreamH3);
  }
  return path;
}

function unresolvedCell(
  h3: string,
  surface: Evidence<ConditionedSurfaceObservation>,
  rawElevationM: Evidence<number>,
  method: 'unresolved_missing_surface_class' | 'unresolved_insufficient_ahn_neighbors',
  derivedAt: string,
): PreparedCell {
  return {
    h3,
    surface,
    rawElevationM,
    terrainElevationM: unavailableDerivedElevation(
      h3,
      selectUnavailableEvidenceStatus([
        surface.quality.status,
        rawElevationM.quality.status,
      ]),
      method === 'unresolved_missing_surface_class'
        ? 'BGT surface class is unavailable'
        : 'Too few nearby observed AHN H3 area means are available for interpolation',
      derivedAt,
    ),
    method,
    interpolationSourceH3Indices: [],
    interpolationMaximumGridDistance: null,
    kind: 'unresolved',
  };
}

function waterCell(
  h3: string,
  surface: Evidence<ConditionedSurfaceObservation>,
  rawElevationM: Evidence<number>,
  derivedAt: string,
): PreparedCell {
  return {
    h3,
    surface,
    rawElevationM,
    terrainElevationM: unavailableDerivedElevation(
      h3,
      'out_of_coverage',
      'Observed BGT surface water is excluded from land elevation conditioning',
      derivedAt,
    ),
    method: 'excluded_observed_surface_water',
    interpolationSourceH3Indices: [],
    interpolationMaximumGridDistance: null,
    kind: 'water',
  };
}

function barrierCell(
  h3: string,
  surface: Evidence<ConditionedSurfaceObservation>,
  rawElevationM: Evidence<number>,
  derivedAt: string,
): PreparedCell {
  return {
    h3,
    surface,
    rawElevationM,
    terrainElevationM: unavailableDerivedElevation(
      h3,
      'out_of_coverage',
      'Observed BGT structural barrier is excluded from land elevation conditioning',
      derivedAt,
    ),
    method: 'excluded_observed_structural_barrier',
    interpolationSourceH3Indices: [],
    interpolationMaximumGridDistance: null,
    kind: 'barrier',
  };
}
function derivedElevationEvidence(input: {
  readonly h3: string;
  readonly value: number;
  readonly derivedAt: string;
  readonly sourceEvidence: readonly Evidence<unknown>[];
  readonly transformation: string;
  readonly sourceH3Indices: readonly string[];
}): Evidence<number> {
  const descriptor = elevationDescriptor(
    input.h3,
    input.derivedAt,
    input.transformation,
    input.sourceH3Indices,
  );
  if (input.sourceEvidence.some((evidence) => evidence.quality.status === 'synthetic_fixture')) {
    return syntheticFixtureEvidence(input.value, {
      fixtureId: `conditioned-terrain:${input.h3}`,
      unit: 'm',
      spatial: descriptor.spatial,
      temporal: descriptor.temporal,
      transformation: descriptor.provenance.transformation,
      transformationVersion: descriptor.provenance.transformationVersion,
      samplingMethod: descriptor.provenance.samplingMethod,
      sourceMetadata: {
        ...descriptor.provenance.sourceMetadata,
        intendedProvider: 'GeoLens',
        intendedDataset: 'conditioned AHN4 DTM',
      },
    });
  }
  return availableEvidence(input.value, descriptor);
}

function unavailableDerivedElevation(
  h3: string,
  status: Exclude<EvidenceStatus, 'available' | 'synthetic_fixture'>,
  reason: string,
  derivedAt: string,
): Evidence<number> {
  return unavailableEvidence(
    status,
    reason,
    elevationDescriptor(h3, derivedAt, 'terrain conditioning unavailable', []),
  );
}

function elevationDescriptor(
  h3: string,
  derivedAt: string,
  transformation: string,
  sourceH3Indices: readonly string[],
): EvidenceDescriptor {
  const [lat, lon] = cellToLatLng(h3);
  return {
    unit: 'm',
    spatial: {
      h3,
      lat,
      lon,
      sourceResolution: `AHN 0.5 m source pixels represented on H3 r${getResolution(h3)}`,
    },
    temporal: { acquiredAt: derivedAt },
    provenance: {
      provider: 'GeoLens',
      dataset: 'conditioned AHN4 DTM',
      transformation,
      transformationVersion: CONDITIONED_SURFACE_CATCHMENT_VERSION,
      samplingMethod: 'explicit terrain interpolation and multi-terminal priority-flood conditioning',
      sourceMetadata: { sourceH3Indices },
    },
  };
}

function areaEvidenceDescriptor(
  input: ConditionedSurfaceCatchmentInput,
  model: {
    readonly interpolationMaxGridDistance: number;
    readonly interpolationMinSamples: number;
    readonly contributingCellCount: number;
  },
): EvidenceDescriptor {
  return {
    unit: 'm2',
    spatial: {
      h3: input.grid.outletH3,
      lat: input.outfallPosition.lat,
      lon: input.outfallPosition.lon,
      sourceResolution: `AHN 0.5 m and BGT object geometry represented on H3 r${input.grid.h3Resolution}`,
    },
    temporal: { acquiredAt: input.derivedAt },
    provenance: {
      provider: 'GeoLens',
      dataset: 'conditioned BGT/AHN surface contributing-area proxy',
      transformation: 'sum full H3 cell areas assigned to conditioned outfall terminal',
      transformationVersion: CONDITIONED_SURFACE_CATCHMENT_VERSION,
      samplingMethod: 'BGT centroid class, AHN area mean or IDW, multi-terminal priority-flood',
      sourceMetadata: {
        targetCellCount: input.grid.targetH3Indices.length,
        contributingCellCount: model.contributingCellCount,
        interpolationMaxGridDistance: model.interpolationMaxGridDistance,
        interpolationMinSamples: model.interpolationMinSamples,
        outfallAttachmentObserved: false,
      },
    },
  };
}

function derivedAreaEvidence(
  value: number,
  descriptor: EvidenceDescriptor,
  synthetic: boolean,
  id: string,
): Evidence<number> {
  if (!synthetic) {
    return availableEvidence(value, descriptor);
  }
  return syntheticFixtureEvidence(value, {
    fixtureId: `conditioned-area:${id}`,
    unit: descriptor.unit,
    spatial: descriptor.spatial,
    temporal: descriptor.temporal,
    transformation: descriptor.provenance.transformation,
    transformationVersion: descriptor.provenance.transformationVersion,
    samplingMethod: descriptor.provenance.samplingMethod,
    sourceMetadata: descriptor.provenance.sourceMetadata,
  });
}

function closeBoundary(
  boundary: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  if (boundary.length === 0) return boundary;
  return [...boundary, boundary[0]];
}

function neighborsOf(h3: string): readonly string[] {
  return gridDisk(h3, 1).filter((candidate) => candidate !== h3);
}

function safeGridDistance(left: string, right: string): number | null {
  try {
    return gridDistance(left, right);
  } catch {
    return null;
  }
}

function validateInput(input: ConditionedSurfaceCatchmentInput): void {
  if (input.id.trim().length === 0 || input.outfallNodeId.trim().length === 0) {
    throw new Error('Conditioned surface ids must be non-empty');
  }
  if (Number.isNaN(Date.parse(input.derivedAt))) {
    throw new Error('Conditioned surface derivedAt must be a valid timestamp');
  }
  if (!isValidCell(input.grid.outletH3)) {
    throw new Error('Conditioned surface outlet H3 is invalid');
  }
  if (!input.grid.targetH3Indices.includes(input.grid.outletH3)) {
    throw new Error('Conditioned surface target cells omit outlet H3');
  }
  if (new Set(input.grid.targetH3Indices).size !== input.grid.targetH3Indices.length) {
    throw new Error('Conditioned surface target cells contain duplicates');
  }
  for (const h3 of input.grid.targetH3Indices) {
    if (!isValidCell(h3) || getResolution(h3) !== input.grid.h3Resolution) {
      throw new Error(`Conditioned surface target H3 ${h3} is invalid`);
    }
  }
  for (const h3 of input.grid.sampledH3Indices) {
    if (input.rawElevationByH3[h3] === undefined) {
      throw new Error(`Conditioned surface raw elevation omits sampled H3 ${h3}`);
    }
  }
}

function validateInterpolationOptions(
  maxGridDistance: number,
  minSamples: number,
): void {
  if (!Number.isInteger(maxGridDistance) || maxGridDistance < 1 || maxGridDistance > 10) {
    throw new Error('Conditioned surface interpolation max distance must be 1..10 H3 cells');
  }
  if (!Number.isInteger(minSamples) || minSamples < 1 || minSamples > MAX_INTERPOLATION_SAMPLES) {
    throw new Error('Conditioned surface interpolation min samples is invalid');
  }
}

class MinHeap<T> {
  private readonly values: T[] = [];
  constructor(private readonly compare: (left: T, right: T) => number) {}
  get size(): number {
    return this.values.length;
  }
  push(value: T): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent], this.values[index]) <= 0) break;
      [this.values[parent], this.values[index]] = [this.values[index], this.values[parent]];
      index = parent;
    }
  }
  pop(): T | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (this.values.length > 0 && last !== undefined) {
      this.values[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.values.length && this.compare(this.values[left], this.values[smallest]) < 0) {
          smallest = left;
        }
        if (right < this.values.length && this.compare(this.values[right], this.values[smallest]) < 0) {
          smallest = right;
        }
        if (smallest === index) break;
        [this.values[index], this.values[smallest]] = [this.values[smallest], this.values[index]];
        index = smallest;
      }
    }
    return first;
  }
}