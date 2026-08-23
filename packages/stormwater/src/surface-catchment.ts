import {
  assertEvidenceInvariant,
  availableEvidence,
  Evidence,
  EvidenceDescriptor,
  EvidenceMetadataValue,
  EvidenceStatus,
  isUnavailableEvidenceStatus,
  syntheticFixtureEvidence,
  unavailableEvidence,
} from '@geo-lens/evidence';
import {
  cellArea,
  cellToBoundary,
  cellToLatLng,
  getResolution,
  greatCircleDistance,
  gridDisk,
  isValidCell,
  latLngToCell,
  polygonToCells,
} from 'h3-js';

import { selectUnavailableEvidenceStatus } from './runoff';

export const SURFACE_CATCHMENT_PROXY_VERSION =
  'bounded-h3-single-flow-surface-proxy-v0.1.0';

export interface SurfaceCatchmentBbox {
  readonly latMin: number;
  readonly lonMin: number;
  readonly latMax: number;
  readonly lonMax: number;
}

export interface SurfaceCatchmentGrid {
  readonly bbox: SurfaceCatchmentBbox;
  readonly h3Resolution: number;
  readonly outletH3: string;
  readonly targetH3Indices: readonly string[];
  readonly sampledH3Indices: readonly string[];
  readonly selectionMethod:
    'h3_cell_centroid_inside_analysis_bbox';
  readonly boundaryHaloRings: 1;
}

export interface SurfaceElevationModel {
  readonly semantics:
    | 'digital_terrain_model'
    | 'digital_surface_model'
    | 'synthetic_fixture_surface';
  readonly description: string;
  readonly samplingDescription: string;
}

export interface SurfaceCatchmentProxyInput {
  readonly id: string;
  readonly elevationModel: SurfaceElevationModel;
  readonly outfallNodeId: string;
  readonly outfallPosition: {
    readonly lat: number;
    readonly lon: number;
  };
  readonly grid: SurfaceCatchmentGrid;
  readonly elevationByH3: Readonly<
    Record<string, Evidence<number>>
  >;
  readonly derivedAt: string;
}

export type SurfaceFlowTermination =
  | 'outlet_proxy'
  | 'coverage_exit'
  | 'local_depression'
  | 'incomplete_elevation';

export interface SurfaceCatchmentProxyCell {
  readonly h3: string;
  readonly elevationM: Evidence<number>;
  readonly representedAreaM2: number;
  readonly boundary: readonly (readonly [number, number])[];
  readonly downstreamH3: string | null;
  readonly elevationDropM: number | null;
  readonly centerDistanceM: number | null;
  readonly grade: number | null;
  readonly flowMethod:
    | 'forced_outlet_terminal'
    | 'steepest_lower_h3_neighbor'
    | 'no_lower_h3_neighbor'
    | 'unresolved_missing_neighbor_elevation';
  readonly termination: SurfaceFlowTermination;
  readonly contributesToOutletProxy: boolean | null;
  readonly pathH3Indices: readonly string[];
}

export interface SurfaceCatchmentProxy {
  readonly id: string;
  readonly semantics:
    'experimental_dem_derived_surface_contributing_area_proxy';
  readonly modelVersion: typeof SURFACE_CATCHMENT_PROXY_VERSION;
  readonly status: EvidenceStatus;
  readonly elevationModel: SurfaceElevationModel;
  readonly outfallAnchor: {
    readonly nodeId: string;
    readonly position: {
      readonly lat: number;
      readonly lon: number;
    };
    readonly h3: string;
    readonly method:
      'observed_outfall_coordinate_to_containing_h3_cell';
    readonly conditioning:
      'force_outfall_h3_as_terminal_pour_point';
  };
  readonly coverage: SurfaceCatchmentGrid & {
    readonly targetCellCount: number;
    readonly sampledCellCount: number;
    readonly areaRepresentation: 'full_h3_cell_area';
  };
  readonly contributingAreaM2: Evidence<number>;
  readonly partialContributingAreaM2: number;
  readonly contributingH3Indices: readonly string[];
  readonly cells: Readonly<
    Record<string, SurfaceCatchmentProxyCell>
  >;
  readonly counts: {
    readonly contributingCells: number;
    readonly coverageExitCells: number;
    readonly localDepressionCells: number;
    readonly incompleteElevationCells: number;
  };
  readonly elevationSources: {
    readonly providers: readonly string[];
    readonly datasets: readonly string[];
    readonly datasetVersions: readonly string[];
    readonly sourceResolutions: readonly string[];
    readonly acquiredAt: readonly string[];
    readonly statuses: Readonly<Record<EvidenceStatus, number>>;
  };
  readonly sewerCatchmentSemantics: 'not_asserted';
  readonly limitations: readonly string[];
}

interface ImmediateFlow {
  readonly downstreamH3: string | null;
  readonly elevationDropM: number | null;
  readonly centerDistanceM: number | null;
  readonly grade: number | null;
  readonly flowMethod: SurfaceCatchmentProxyCell['flowMethod'];
  readonly immediateTermination:
    | 'outlet_proxy'
    | 'local_depression'
    | 'incomplete_elevation'
    | null;
}

export function buildBoundedSurfaceCatchmentGrid(input: {
  readonly bbox: SurfaceCatchmentBbox;
  readonly h3Resolution: number;
  readonly outfallPosition: {
    readonly lat: number;
    readonly lon: number;
  };
}): SurfaceCatchmentGrid {
  validateBbox(input.bbox);
  validatePosition(input.outfallPosition, 'outfallPosition');

  if (
    !Number.isInteger(input.h3Resolution) ||
    input.h3Resolution < 0 ||
    input.h3Resolution > 15
  ) {
    throw new Error(
      'Surface catchment h3Resolution must be an integer from 0 to 15',
    );
  }

  if (!positionInsideBbox(input.outfallPosition, input.bbox)) {
    throw new Error(
      'Surface catchment outfall must lie inside the analysis bbox',
    );
  }

  const polygon = [[
    [input.bbox.lonMin, input.bbox.latMin],
    [input.bbox.lonMax, input.bbox.latMin],
    [input.bbox.lonMax, input.bbox.latMax],
    [input.bbox.lonMin, input.bbox.latMax],
    [input.bbox.lonMin, input.bbox.latMin],
  ]];
  const targetH3Indices = polygonToCells(
    polygon,
    input.h3Resolution,
    true,
  ).sort();
  const outletH3 = latLngToCell(
    input.outfallPosition.lat,
    input.outfallPosition.lon,
    input.h3Resolution,
  );

  if (!targetH3Indices.includes(outletH3)) {
    throw new Error(
      'Analysis bbox does not select the outfall H3 centroid at the configured resolution',
    );
  }

  const sampledH3Indices = [
    ...new Set(
      targetH3Indices.flatMap((h3) => gridDisk(h3, 1)),
    ),
  ].sort();

  return {
    bbox: input.bbox,
    h3Resolution: input.h3Resolution,
    outletH3,
    targetH3Indices,
    sampledH3Indices,
    selectionMethod: 'h3_cell_centroid_inside_analysis_bbox',
    boundaryHaloRings: 1,
  };
}

export function deriveSurfaceCatchmentProxy(
  input: SurfaceCatchmentProxyInput,
): SurfaceCatchmentProxy {
  validateInput(input);
  const targetSet = new Set(input.grid.targetH3Indices);
  const immediate = new Map<string, ImmediateFlow>();

  for (const h3 of input.grid.targetH3Indices) {
    immediate.set(
      h3,
      deriveImmediateFlow(
        h3,
        input.grid.outletH3,
        input.elevationByH3,
      ),
    );
  }

  const cells: Record<string, SurfaceCatchmentProxyCell> = {};

  for (const h3 of input.grid.targetH3Indices) {
    const flow = immediate.get(h3);

    if (flow === undefined) {
      throw new Error(`Surface flow omitted target H3 ${h3}`);
    }

    const resolved = resolvePath(
      h3,
      input.grid.outletH3,
      targetSet,
      immediate,
    );

    cells[h3] = {
      h3,
      elevationM: input.elevationByH3[h3],
      representedAreaM2: cellArea(h3, 'm2'),
      boundary: closedBoundary(h3),
      downstreamH3: flow.downstreamH3,
      elevationDropM: flow.elevationDropM,
      centerDistanceM: flow.centerDistanceM,
      grade: flow.grade,
      flowMethod: flow.flowMethod,
      termination: resolved.termination,
      contributesToOutletProxy: resolved.contributes,
      pathH3Indices: resolved.path,
    };
  }

  const contributingH3Indices = Object.values(cells)
    .filter((cell) => cell.contributesToOutletProxy === true)
    .map((cell) => cell.h3)
    .sort();
  const partialContributingAreaM2 = contributingH3Indices.reduce(
    (total, h3) => total + cells[h3].representedAreaM2,
    0,
  );
  const counts = {
    contributingCells: contributingH3Indices.length,
    coverageExitCells: countTermination(cells, 'coverage_exit'),
    localDepressionCells: countTermination(
      cells,
      'local_depression',
    ),
    incompleteElevationCells: countTermination(
      cells,
      'incomplete_elevation',
    ),
  };
  const descriptor = areaDescriptor(
    input,
    counts,
    partialContributingAreaM2,
  );
  const requiredEvidence = input.grid.sampledH3Indices.map(
    (h3) => input.elevationByH3[h3],
  );
  const unavailable = requiredEvidence.filter((evidence) =>
    isUnavailableEvidenceStatus(evidence.quality.status),
  );
  let contributingAreaM2: Evidence<number>;

  if (unavailable.length > 0) {
    const status = selectUnavailableEvidenceStatus(
      unavailable.map((evidence) => evidence.quality.status),
    );
    const missing = input.grid.sampledH3Indices
      .filter((h3) => input.elevationByH3[h3].value === null)
      .map(
        (h3) =>
          `${h3}=${input.elevationByH3[h3].quality.status}`,
      );
    const preview = missing.slice(0, 10).join(', ');
    const omitted = missing.length - Math.min(missing.length, 10);

    contributingAreaM2 = unavailableEvidence(
      status,
      `Surface proxy area is incomplete because ${missing.length} required DEM samples are unavailable: ${preview}${omitted > 0 ? `; ${omitted} more` : ''}`,
      descriptor,
    );
  } else if (
    requiredEvidence.some(
      (evidence) =>
        evidence.quality.status === 'synthetic_fixture',
    )
  ) {
    contributingAreaM2 = syntheticFixtureEvidence(
      partialContributingAreaM2,
      {
        fixtureId: `surface-catchment-proxy:${input.id}`,
        unit: descriptor.unit,
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
    contributingAreaM2 = availableEvidence(
      partialContributingAreaM2,
      descriptor,
    );
  }

  return {
    id: input.id,
    semantics:
      'experimental_dem_derived_surface_contributing_area_proxy',
    modelVersion: SURFACE_CATCHMENT_PROXY_VERSION,
    status: contributingAreaM2.quality.status,
    elevationModel: input.elevationModel,
    outfallAnchor: {
      nodeId: input.outfallNodeId,
      position: input.outfallPosition,
      h3: input.grid.outletH3,
      method: 'observed_outfall_coordinate_to_containing_h3_cell',
      conditioning: 'force_outfall_h3_as_terminal_pour_point',
    },
    coverage: {
      ...input.grid,
      targetCellCount: input.grid.targetH3Indices.length,
      sampledCellCount: input.grid.sampledH3Indices.length,
      areaRepresentation: 'full_h3_cell_area',
    },
    contributingAreaM2,
    partialContributingAreaM2,
    contributingH3Indices,
    cells,
    counts,
    elevationSources: elevationSourceSummary(requiredEvidence),
    sewerCatchmentSemantics: 'not_asserted',
    limitations: [
      input.elevationModel.description,
      'H3 is the routing representation, not the native elevation-source resolution.',
      input.elevationModel.samplingDescription +
        '. Routing then uses one derived elevation value per H3 cell and selects one strictly lower neighboring H3 centroid.',
      'The observed outfall H3 cell is forced to be the terminal pour point; this is explicit model conditioning.',
      'No depression filling, flat routing, road/building conditioning or hydraulic sewer behavior is modeled.',
      'Cells are selected by centroid inside the bounded analysis bbox and represented by full H3 cell area.',
      'This proxy is not an observed Waternet sewer catchment and is not eligible for network propagation by itself.',
    ],
  };
}

function deriveImmediateFlow(
  h3: string,
  outletH3: string,
  evidenceByH3: Readonly<Record<string, Evidence<number>>>,
): ImmediateFlow {
  const current = evidenceByH3[h3];

  if (current.value === null) {
    return unresolvedImmediateFlow();
  }
  const currentElevationM = current.value;

  if (h3 === outletH3) {
    return {
      downstreamH3: null,
      elevationDropM: null,
      centerDistanceM: null,
      grade: null,
      flowMethod: 'forced_outlet_terminal',
      immediateTermination: 'outlet_proxy',
    };
  }

  const neighbors = gridDisk(h3, 1)
    .filter((neighbor) => neighbor !== h3)
    .sort();
  const missingNeighbor = neighbors.find(
    (neighbor) => evidenceByH3[neighbor]?.value == null,
  );

  if (missingNeighbor !== undefined) {
    return unresolvedImmediateFlow();
  }

  const center = cellToLatLng(h3);
  const candidates = neighbors
    .map((neighbor) => {
      const elevation = evidenceByH3[neighbor].value;

      if (elevation === null || elevation >= currentElevationM) {
        return null;
      }

      const distanceM = greatCircleDistance(
        center,
        cellToLatLng(neighbor),
        'm',
      );
      const dropM = currentElevationM - elevation;

      return {
        h3: neighbor,
        dropM,
        distanceM,
        grade: dropM / distanceM,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        readonly h3: string;
        readonly dropM: number;
        readonly distanceM: number;
        readonly grade: number;
      } => candidate !== null,
    )
    .sort(
      (left, right) =>
        right.grade - left.grade ||
        left.h3.localeCompare(right.h3),
    );
  const selected = candidates[0];

  if (selected === undefined) {
    return {
      downstreamH3: null,
      elevationDropM: null,
      centerDistanceM: null,
      grade: null,
      flowMethod: 'no_lower_h3_neighbor',
      immediateTermination: 'local_depression',
    };
  }

  return {
    downstreamH3: selected.h3,
    elevationDropM: selected.dropM,
    centerDistanceM: selected.distanceM,
    grade: selected.grade,
    flowMethod: 'steepest_lower_h3_neighbor',
    immediateTermination: null,
  };
}

function unresolvedImmediateFlow(): ImmediateFlow {
  return {
    downstreamH3: null,
    elevationDropM: null,
    centerDistanceM: null,
    grade: null,
    flowMethod: 'unresolved_missing_neighbor_elevation',
    immediateTermination: 'incomplete_elevation',
  };
}

function resolvePath(
  startH3: string,
  outletH3: string,
  targetSet: ReadonlySet<string>,
  immediate: ReadonlyMap<string, ImmediateFlow>,
): {
  readonly termination: SurfaceFlowTermination;
  readonly contributes: boolean | null;
  readonly path: readonly string[];
} {
  const path = [startH3];
  const seen = new Set(path);
  let current = startH3;

  while (true) {
    const flow = immediate.get(current);

    if (flow === undefined) {
      throw new Error(`Surface path omitted target H3 ${current}`);
    }

    if (flow.immediateTermination !== null) {
      return {
        termination: flow.immediateTermination,
        contributes:
          flow.immediateTermination === 'outlet_proxy'
            ? true
            : flow.immediateTermination === 'incomplete_elevation'
              ? null
              : false,
        path,
      };
    }

    const downstream = flow.downstreamH3;

    if (downstream === null) {
      throw new Error(
        `Surface path ${current} has no terminal state or downstream cell`,
      );
    }

    path.push(downstream);

    if (!targetSet.has(downstream)) {
      return {
        termination: 'coverage_exit',
        contributes: false,
        path,
      };
    }

    if (downstream === outletH3) {
      return {
        termination: 'outlet_proxy',
        contributes: true,
        path,
      };
    }

    if (seen.has(downstream)) {
      throw new Error(
        `Strictly descending surface path contains a cycle at ${downstream}`,
      );
    }

    seen.add(downstream);
    current = downstream;
  }
}

function areaDescriptor(
  input: SurfaceCatchmentProxyInput,
  counts: SurfaceCatchmentProxy['counts'],
  partialContributingAreaM2: number,
): EvidenceDescriptor {
  const sourceMetadata: Record<string, EvidenceMetadataValue> = {
    proxyId: input.id,
    elevationModelSemantics: input.elevationModel.semantics,
    elevationModelDescription: input.elevationModel.description,
    elevationSamplingDescription:
      input.elevationModel.samplingDescription,
    outfallNodeId: input.outfallNodeId,
    outletH3: input.grid.outletH3,
    h3Resolution: input.grid.h3Resolution,
    targetCellCount: input.grid.targetH3Indices.length,
    sampledCellCount: input.grid.sampledH3Indices.length,
    contributingCellCount: counts.contributingCells,
    coverageExitCellCount: counts.coverageExitCells,
    localDepressionCellCount: counts.localDepressionCells,
    incompleteElevationCellCount:
      counts.incompleteElevationCells,
    partialContributingAreaM2,
    selectionMethod: input.grid.selectionMethod,
    boundaryHaloRings: input.grid.boundaryHaloRings,
    areaRepresentation: 'full_h3_cell_area',
    outletConditioning: 'force_outfall_h3_as_terminal_pour_point',
    sewerCatchmentSemantics: 'not_asserted',
  };
  const observedAt = uniqueDefined(
    input.grid.sampledH3Indices.map(
      (h3) => input.elevationByH3[h3].temporal.observedAt,
    ),
  );

  return {
    unit: 'm2',
    spatial: {
      h3: input.grid.outletH3,
      lat: input.outfallPosition.lat,
      lon: input.outfallPosition.lon,
    },
    temporal: {
      observedAt:
        observedAt.length === 1 ? observedAt[0] : undefined,
      acquiredAt: input.derivedAt,
    },
    provenance: {
      provider: 'geolens-core',
      dataset: 'DEM-derived surface contributing-area proxy',
      transformation:
        'bounded single-flow direction over one derived elevation value per H3 cell with an explicitly conditioned outfall terminal',
      transformationVersion: SURFACE_CATCHMENT_PROXY_VERSION,
      samplingMethod:
        input.elevationModel.samplingDescription +
        '; H3-neighbor routing; one-ring boundary halo; full H3 cell area sum',
      sourceMetadata,
    },
  };
}

function elevationSourceSummary(
  evidence: readonly Evidence<number>[],
): SurfaceCatchmentProxy['elevationSources'] {
  const statuses: Record<EvidenceStatus, number> = {
    available: 0,
    missing: 0,
    stale: 0,
    out_of_coverage: 0,
    auth_required: 0,
    rate_limited: 0,
    upstream_error: 0,
    invalid_response: 0,
    incomplete_window: 0,
    synthetic_fixture: 0,
  };

  for (const item of evidence) {
    statuses[item.quality.status] += 1;
  }

  return {
    providers: unique(
      evidence.map((item) => item.provenance.provider),
    ),
    datasets: unique(
      evidence.map((item) => item.provenance.dataset),
    ),
    datasetVersions: uniqueDefined(
      evidence.map((item) => item.provenance.datasetVersion),
    ),
    sourceResolutions: uniqueDefined(
      evidence.map((item) => item.spatial.sourceResolution),
    ),
    acquiredAt: unique(
      evidence.map((item) => item.temporal.acquiredAt),
    ),
    statuses,
  };
}

function validateInput(input: SurfaceCatchmentProxyInput): void {
  if (input.id.trim().length === 0) {
    throw new Error('Surface catchment proxy id must be non-empty');
  }

  if (input.elevationModel.description.trim().length === 0) {
    throw new Error(
      'Surface catchment elevation model description must be non-empty',
    );
  }

  if (
    input.elevationModel.samplingDescription.trim().length === 0
  ) {
    throw new Error(
      'Surface catchment elevation sampling description must be non-empty',
    );
  }

  if (input.outfallNodeId.trim().length === 0) {
    throw new Error(
      'Surface catchment outfallNodeId must be non-empty',
    );
  }

  validatePosition(input.outfallPosition, 'outfallPosition');

  if (Number.isNaN(Date.parse(input.derivedAt))) {
    throw new Error(
      'Surface catchment derivedAt must be a valid timestamp',
    );
  }

  if (
    latLngToCell(
      input.outfallPosition.lat,
      input.outfallPosition.lon,
      input.grid.h3Resolution,
    ) !== input.grid.outletH3
  ) {
    throw new Error(
      'Surface catchment outfall position does not match grid outlet H3',
    );
  }

  const targetSet = new Set(input.grid.targetH3Indices);
  const sampledSet = new Set(input.grid.sampledH3Indices);

  if (
    targetSet.size !== input.grid.targetH3Indices.length ||
    sampledSet.size !== input.grid.sampledH3Indices.length
  ) {
    throw new Error('Surface catchment grid contains duplicate H3 cells');
  }

  if (!targetSet.has(input.grid.outletH3)) {
    throw new Error('Surface catchment target cells omit outlet H3');
  }

  for (const h3 of input.grid.targetH3Indices) {
    if (!sampledSet.has(h3)) {
      throw new Error(
        `Surface catchment sampled cells omit target H3 ${h3}`,
      );
    }
  }

  for (const h3 of input.grid.sampledH3Indices) {
    if (!isValidCell(h3)) {
      throw new Error(
        `Surface catchment grid contains invalid H3 ${h3}`,
      );
    }

    if (getResolution(h3) !== input.grid.h3Resolution) {
      throw new Error(
        `Surface catchment H3 ${h3} has a different resolution`,
      );
    }

    const evidence = input.elevationByH3[h3];

    if (evidence === undefined) {
      throw new Error(
        `Surface catchment lacks required DEM evidence for ${h3}`,
      );
    }

    assertEvidenceInvariant(evidence);

    if (
      evidence.spatial.h3 !== undefined &&
      evidence.spatial.h3 !== h3
    ) {
      throw new Error(
        `Surface catchment DEM evidence for ${h3} refers to ${evidence.spatial.h3}`,
      );
    }
  }
}

function validateBbox(bbox: SurfaceCatchmentBbox): void {
  const values = [
    bbox.latMin,
    bbox.lonMin,
    bbox.latMax,
    bbox.lonMax,
  ];

  if (!values.every(Number.isFinite)) {
    throw new Error('Surface catchment bbox must be finite');
  }

  if (
    bbox.latMin < -90 ||
    bbox.latMax > 90 ||
    bbox.lonMin < -180 ||
    bbox.lonMax > 180 ||
    bbox.latMin >= bbox.latMax ||
    bbox.lonMin >= bbox.lonMax
  ) {
    throw new Error('Surface catchment bbox is invalid');
  }
}

function validatePosition(
  position: { readonly lat: number; readonly lon: number },
  label: string,
): void {
  if (
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lon) ||
    position.lat < -90 ||
    position.lat > 90 ||
    position.lon < -180 ||
    position.lon > 180
  ) {
    throw new Error(`${label} must be a valid coordinate`);
  }
}

function positionInsideBbox(
  position: { readonly lat: number; readonly lon: number },
  bbox: SurfaceCatchmentBbox,
): boolean {
  return (
    position.lat >= bbox.latMin &&
    position.lat <= bbox.latMax &&
    position.lon >= bbox.lonMin &&
    position.lon <= bbox.lonMax
  );
}

function closedBoundary(
  h3: string,
): readonly (readonly [number, number])[] {
  const boundary = cellToBoundary(h3, true).map(
    ([lon, lat]) => [lon, lat] as const,
  );
  const first = boundary[0];
  const last = boundary[boundary.length - 1];

  if (
    first !== undefined &&
    last !== undefined &&
    (first[0] !== last[0] || first[1] !== last[1])
  ) {
    return [...boundary, first];
  }

  return boundary;
}

function countTermination(
  cells: Readonly<Record<string, SurfaceCatchmentProxyCell>>,
  termination: SurfaceFlowTermination,
): number {
  return Object.values(cells).filter(
    (cell) => cell.termination === termination,
  ).length;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueDefined(
  values: readonly (string | undefined)[],
): string[] {
  return unique(
    values.filter((value): value is string => value !== undefined),
  );
}
