import {
  assertEvidenceInvariant,
  Evidence,
  EvidenceStatus,
  unavailableEvidence,
} from '@geo-lens/evidence';
import {
  CopernicusDemClient,
  CorineLandCoverClient,
  DemPointProviderResult,
  DemProviderResult,
  ImergProviderResult,
  ImergWindowSummary,
  LandCoverProviderResult,
  NasaImergClient,
} from '@geo-lens/providers';
import { cellToLatLng, isValidCell } from 'h3-js';

export interface EnvironmentalNodeLocation {
  readonly id: string;
  readonly h3: string;
  readonly lat: number;
  readonly lon: number;
}

export interface EnvironmentalEvidenceRequest {
  readonly catchmentH3Indices: readonly string[];
  readonly nodes: readonly EnvironmentalNodeLocation[];
  readonly referenceTime: Date;
}

export interface EnvironmentalCellEvidence {
  readonly h3: string;
  readonly roles: readonly ['catchment'];
  readonly rainfall24hMm: Evidence<number>;
  readonly elevationM: Evidence<number>;
  readonly slopeDeg: Evidence<number>;
  readonly landCoverClass: Evidence<number>;
}

export interface EnvironmentalNodeEvidence
  extends EnvironmentalNodeLocation {
  readonly elevationM: Evidence<number>;
}

export type EnvironmentalLayer =
  | 'rainfall24h_mm'
  | 'elevation_m'
  | 'slope_deg'
  | 'land_cover_class';

export interface EnvironmentalEvidenceIssue {
  readonly h3: string;
  readonly entityId?: string;
  readonly layer: EnvironmentalLayer;
  readonly status: EvidenceStatus;
  readonly reason: string;
}

export interface EnvironmentalProviderSummary {
  readonly provider: string;
  readonly dataset: string;
  readonly acquiredAt: string;
  readonly status: 'responded' | 'upstream_error';
  readonly missingReason?: string;
}

export interface EnvironmentalSourceSummary {
  readonly rainfall: EnvironmentalProviderSummary & {
    readonly referenceTime: string;
    readonly window24h: ImergWindowSummary | null;
  };
  readonly terrain: EnvironmentalProviderSummary;
  readonly landCover: EnvironmentalProviderSummary;
}

export interface EnvironmentalEvidenceBundle {
  readonly status: 'complete' | 'incomplete';
  readonly referenceTime: string;
  readonly acquiredAt: string;
  readonly sources: EnvironmentalSourceSummary;
  readonly cells: Readonly<
    Record<string, EnvironmentalCellEvidence>
  >;
  readonly nodes: Readonly<
    Record<string, EnvironmentalNodeEvidence>
  >;
  readonly issues: readonly EnvironmentalEvidenceIssue[];
}

export interface EnvironmentalEvidenceComposer {
  compose(
    request: EnvironmentalEvidenceRequest,
  ): Promise<EnvironmentalEvidenceBundle>;
}

export interface CanonicalEnvironmentalClients {
  readonly imerg: Pick<NasaImergClient, 'getEvidence'>;
  readonly dem: Pick<
    CopernicusDemClient,
    'getEvidence' | 'getPointEvidence'
  >;
  readonly landCover: Pick<
    CorineLandCoverClient,
    'getEvidence'
  >;
}

export interface CanonicalEnvironmentalComposerOptions {
  readonly clients: CanonicalEnvironmentalClients;
  readonly now?: () => Date;
}

interface ProviderCall<T> {
  readonly value: T | null;
  readonly error?: string;
}

export class CanonicalEnvironmentalEvidenceComposer
  implements EnvironmentalEvidenceComposer
{
  private readonly clients: CanonicalEnvironmentalClients;
  private readonly now: () => Date;

  constructor(options: CanonicalEnvironmentalComposerOptions) {
    this.clients = options.clients;
    this.now = options.now ?? (() => new Date());
  }

  async compose(
    request: EnvironmentalEvidenceRequest,
  ): Promise<EnvironmentalEvidenceBundle> {
    validateRequest(request);
    const acquiredAt = this.now().toISOString();
    const catchmentCells = unique(
      request.catchmentH3Indices,
    );
    const nodes = [...request.nodes].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const [
      rainfallCall,
      terrainCellCall,
      terrainPointCall,
      landCoverCall,
    ] = await Promise.all([
      settle(
        this.clients.imerg.getEvidence({
          h3Indices: catchmentCells,
          referenceTime: request.referenceTime,
          windowHours: [24],
        }),
      ),
      settle(
        this.clients.dem.getEvidence({
          h3Indices: catchmentCells,
        }),
      ),
      settle(
        this.clients.dem.getPointEvidence({
          locations: nodes,
        }),
      ),
      settle(
        this.clients.landCover.getEvidence({
          h3Indices: catchmentCells,
        }),
      ),
    ]);
    const rainfallWindow =
      rainfallCall.value?.windows[24] ?? null;
    const cells: Record<string, EnvironmentalCellEvidence> = {};
    const nodeEvidence: Record<
      string,
      EnvironmentalNodeEvidence
    > = {};
    const issues: EnvironmentalEvidenceIssue[] = [];

    for (const h3 of catchmentCells) {
      const rainfall24hMm = canonicalEvidence(
        rainfallWindow?.cells[h3],
        'rainfall24h_mm',
        h3,
        acquiredAt,
        rainfallCall.error,
      );
      const elevationM = canonicalEvidence(
        terrainCellCall.value?.cells[h3]?.elevationM,
        'elevation_m',
        h3,
        acquiredAt,
        terrainCellCall.error,
      );
      const slopeDeg = canonicalEvidence(
        terrainCellCall.value?.cells[h3]?.slopeDeg,
        'slope_deg',
        h3,
        acquiredAt,
        terrainCellCall.error,
      );
      const landCoverClass = canonicalEvidence(
        landCoverCall.value?.cells[h3]?.classCode,
        'land_cover_class',
        h3,
        acquiredAt,
        landCoverCall.error,
      );

      cells[h3] = {
        h3,
        roles: ['catchment'],
        rainfall24hMm,
        elevationM,
        slopeDeg,
        landCoverClass,
      };
      addIssue(
        issues,
        h3,
        'rainfall24h_mm',
        rainfall24hMm,
      );
      addIssue(issues, h3, 'slope_deg', slopeDeg);
      addIssue(
        issues,
        h3,
        'land_cover_class',
        landCoverClass,
      );
    }

    for (const node of nodes) {
      const elevationM = canonicalEvidence(
        terrainPointCall.value?.locations[node.id]
          ?.elevationM,
        'elevation_m',
        node.h3,
        acquiredAt,
        terrainPointCall.error,
        {
          lat: node.lat,
          lon: node.lon,
        },
      );

      nodeEvidence[node.id] = {
        ...node,
        elevationM,
      };
      addIssue(
        issues,
        node.h3,
        'elevation_m',
        elevationM,
        node.id,
      );
    }

    return {
      status: issues.length === 0 ? 'complete' : 'incomplete',
      referenceTime: request.referenceTime.toISOString(),
      acquiredAt,
      sources: sourceSummary(
        rainfallCall,
        terrainCellCall,
        terrainPointCall,
        landCoverCall,
        request.referenceTime,
        rainfallWindow?.summary ?? null,
        acquiredAt,
      ),
      cells,
      nodes: nodeEvidence,
      issues,
    };
  }
}

function canonicalEvidence(
  candidate: Evidence<number> | undefined,
  layer: EnvironmentalLayer,
  h3: string,
  acquiredAt: string,
  providerError: string | undefined,
  expectedPoint?: {
    readonly lat: number;
    readonly lon: number;
  },
): Evidence<number> {
  if (candidate === undefined) {
    return fallbackEvidence(
      providerError === undefined
        ? 'invalid_response'
        : 'upstream_error',
      providerError ??
        `Canonical provider omitted ${layer} for requested H3 ${h3}`,
      layer,
      h3,
      acquiredAt,
      expectedPoint,
    );
  }

  try {
    assertEvidenceInvariant(candidate);
  } catch (error) {
    return fallbackEvidence(
      'invalid_response',
      `Canonical ${layer} evidence violates invariants: ${errorMessage(error)}`,
      layer,
      h3,
      acquiredAt,
      expectedPoint,
    );
  }

  if (candidate.spatial.h3 !== h3) {
    return fallbackEvidence(
      'invalid_response',
      `Canonical ${layer} evidence refers to H3 ${String(
        candidate.spatial.h3,
      )}, expected ${h3}`,
      layer,
      h3,
      acquiredAt,
      expectedPoint,
    );
  }

  if (
    expectedPoint !== undefined &&
    (candidate.spatial.lat === undefined ||
      candidate.spatial.lon === undefined ||
      Math.abs(candidate.spatial.lat - expectedPoint.lat) >
        1e-9 ||
      Math.abs(candidate.spatial.lon - expectedPoint.lon) >
        1e-9)
  ) {
    return fallbackEvidence(
      'invalid_response',
      `Canonical ${layer} point evidence does not match requested coordinates`,
      layer,
      h3,
      acquiredAt,
      expectedPoint,
    );
  }

  const expectedUnit = layerDescriptor(layer).unit;

  if (candidate.unit !== expectedUnit) {
    return fallbackEvidence(
      'invalid_response',
      `Canonical ${layer} evidence uses unit ${String(
        candidate.unit,
      )}, expected ${expectedUnit}`,
      layer,
      h3,
      acquiredAt,
      expectedPoint,
    );
  }

  return candidate;
}

function fallbackEvidence(
  status: 'invalid_response' | 'upstream_error',
  reason: string,
  layer: EnvironmentalLayer,
  h3: string,
  acquiredAt: string,
  point?: {
    readonly lat: number;
    readonly lon: number;
  },
): Evidence<number> {
  const [centroidLat, centroidLon] = cellToLatLng(h3);
  const definition = layerDescriptor(layer);

  return unavailableEvidence(status, reason, {
    unit: definition.unit,
    spatial: {
      h3,
      lat: point?.lat ?? centroidLat,
      lon: point?.lon ?? centroidLon,
      sourceResolution: definition.sourceResolution,
    },
    temporal: {
      acquiredAt,
    },
    provenance: {
      provider: definition.provider,
      dataset: definition.dataset,
      transformation:
        'environmental evidence bundle validation',
      transformationVersion:
        'environmental-bundle-v0.1.0',
    },
  });
}

function layerDescriptor(layer: EnvironmentalLayer): {
  readonly unit: string;
  readonly sourceResolution: string;
  readonly provider: string;
  readonly dataset: string;
} {
  const definitions = {
    rainfall24h_mm: {
      unit: 'mm',
      sourceResolution: '0.1 degree',
      provider: 'NASA GES DISC',
      dataset: 'GPM IMERG',
    },
    elevation_m: {
      unit: 'm',
      sourceResolution:
        '1 arc-second (~30 m at equator)',
      provider: 'Copernicus Data Space Ecosystem',
      dataset: 'Copernicus DEM GLO-30',
    },
    slope_deg: {
      unit: 'deg',
      sourceResolution:
        '1 arc-second (~30 m at equator)',
      provider: 'Copernicus Data Space Ecosystem',
      dataset: 'Copernicus DEM GLO-30',
    },
    land_cover_class: {
      unit: 'CLC class code',
      sourceResolution: '100 m',
      provider: 'Copernicus Land Monitoring Service',
      dataset: 'CORINE Land Cover',
    },
  } as const;

  return definitions[layer];
}

function addIssue(
  issues: EnvironmentalEvidenceIssue[],
  h3: string,
  layer: EnvironmentalLayer,
  evidence: Evidence<number>,
  entityId?: string,
): void {
  if (evidence.value !== null) {
    return;
  }

  issues.push({
    h3,
    entityId,
    layer,
    status: evidence.quality.status,
    reason:
      evidence.quality.missingReason ??
      'Evidence has no value and no missing reason',
  });
}

function sourceSummary(
  rainfall: ProviderCall<ImergProviderResult>,
  terrainCells: ProviderCall<DemProviderResult>,
  terrainPoints: ProviderCall<DemPointProviderResult>,
  landCover: ProviderCall<LandCoverProviderResult>,
  referenceTime: Date,
  rainfallWindow: ImergWindowSummary | null,
  acquiredAt: string,
): EnvironmentalSourceSummary {
  const terrainError = [
    terrainCells.error,
    terrainPoints.error,
  ]
    .filter((value): value is string => value !== undefined)
    .join('; ');

  return {
    rainfall: {
      provider: rainfall.value?.provider ?? 'NASA GES DISC',
      dataset:
        rainfall.value?.datasetFamily ?? 'GPM IMERG',
      acquiredAt: rainfall.value?.acquiredAt ?? acquiredAt,
      status:
        rainfall.value === null
          ? 'upstream_error'
          : 'responded',
      missingReason: rainfall.error,
      referenceTime:
        rainfall.value?.referenceTime ??
        referenceTime.toISOString(),
      window24h: rainfallWindow,
    },
    terrain: {
      provider:
        terrainCells.value?.provider ??
        terrainPoints.value?.provider ??
        'Copernicus Data Space Ecosystem',
      dataset:
        terrainCells.value?.dataset ??
        terrainPoints.value?.dataset ??
        'Copernicus DEM GLO-30',
      acquiredAt:
        terrainCells.value?.acquiredAt ??
        terrainPoints.value?.acquiredAt ??
        acquiredAt,
      status:
        terrainCells.value === null ||
        terrainPoints.value === null
          ? 'upstream_error'
          : 'responded',
      missingReason:
        terrainError.length > 0 ? terrainError : undefined,
    },
    landCover: {
      provider:
        landCover.value?.provider ??
        'Copernicus Land Monitoring Service',
      dataset:
        landCover.value?.dataset ??
        'CORINE Land Cover 2018',
      acquiredAt:
        landCover.value?.acquiredAt ?? acquiredAt,
      status:
        landCover.value === null
          ? 'upstream_error'
          : 'responded',
      missingReason: landCover.error,
    },
  };
}

async function settle<T>(
  promise: Promise<T>,
): Promise<ProviderCall<T>> {
  try {
    return {
      value: await promise,
    };
  } catch (error) {
    return {
      value: null,
      error: errorMessage(error),
    };
  }
}

function validateRequest(
  request: EnvironmentalEvidenceRequest,
): void {
  if (Number.isNaN(request.referenceTime.getTime())) {
    throw new Error(
      'Environmental evidence referenceTime must be valid',
    );
  }

  if (request.catchmentH3Indices.length === 0) {
    throw new Error(
      'Environmental evidence requires catchment H3 cells',
    );
  }

  if (request.nodes.length === 0) {
    throw new Error(
      'Environmental evidence requires network nodes',
    );
  }

  const invalidCatchments =
    request.catchmentH3Indices.filter(
      (h3) => !isValidCell(h3),
    );

  if (invalidCatchments.length > 0) {
    throw new Error(
      `Environmental evidence contains invalid catchment H3 cells: ${invalidCatchments.join(
        ', ',
      )}`,
    );
  }

  if (
    new Set(request.catchmentH3Indices).size !==
    request.catchmentH3Indices.length
  ) {
    throw new Error(
      'Environmental evidence contains duplicate catchment H3 cells',
    );
  }

  const nodeIds = new Set<string>();

  for (const node of request.nodes) {
    if (node.id.trim().length === 0) {
      throw new Error(
        'Environmental evidence nodes require non-empty ids',
      );
    }

    if (nodeIds.has(node.id)) {
      throw new Error(
        `Environmental evidence contains duplicate node ${node.id}`,
      );
    }
    nodeIds.add(node.id);

    if (!isValidCell(node.h3)) {
      throw new Error(
        `Environmental node ${node.id} has invalid H3 ${node.h3}`,
      );
    }

    if (
      !Number.isFinite(node.lat) ||
      node.lat < -90 ||
      node.lat > 90 ||
      !Number.isFinite(node.lon) ||
      node.lon < -180 ||
      node.lon > 180
    ) {
      throw new Error(
        `Environmental node ${node.id} has invalid coordinates`,
      );
    }
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
