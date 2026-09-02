import { getResolution, isValidCell } from 'h3-js';

import {
  assertEvidenceInvariant,
  availableEvidence,
  Evidence,
  EvidenceDescriptor,
  EvidenceStatus,
  syntheticFixtureEvidence,
  unavailableEvidence,
  UnavailableEvidenceStatus,
} from './index';

export const SPATIAL_EVIDENCE_INDEX_VERSION =
  'spatial-evidence-index-v0.1.0' as const;

export type SpatialEvidenceCompositionMode =
  | 'real_evidence'
  | 'synthetic_fixture';

export interface SpatialEvidenceIntersection<T> {
  readonly id: string;
  readonly intersectionAreaM2: number;
  readonly evidence: Evidence<T>;
}

export interface TerrainEvidenceIntersection
  extends SpatialEvidenceIntersection<number> {
  readonly sourceResolutionMetres: number;
}

export interface SpatialEvidenceIndexCellInput {
  readonly h3: string;
  readonly composedAt: string;
  readonly mode: SpatialEvidenceCompositionMode;
  readonly fixtureId?: string;
  readonly areaReference: {
    readonly horizontalCrs: string;
    readonly unit: 'm2';
    readonly measurementMethod: string;
    readonly targetCellAreaM2: number;
  };
  readonly precipitationWindow: {
    readonly start: string;
    readonly end: string;
  };
  readonly terrain: readonly TerrainEvidenceIntersection[];
  readonly landCover: readonly SpatialEvidenceIntersection<number>[];
  readonly precipitation: readonly SpatialEvidenceIntersection<number>[];
}

export interface SpatialCoverageDiagnostics {
  readonly targetCellAreaM2: number;
  readonly mappedAreaM2: number;
  readonly observedAreaM2: number;
  readonly unavailableMappedAreaM2: number;
  readonly uncoveredAreaM2: number;
  readonly coverageFraction: number;
  readonly missingFraction: number;
  readonly complete: boolean;
}

export interface SpatialEvidenceSourceReference {
  readonly id: string;
  readonly intersectionAreaM2: number;
  readonly status: EvidenceStatus;
  readonly provider: string;
  readonly dataset: string;
  readonly datasetVersion?: string;
  readonly sourceResolution: string;
  readonly observedAt?: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
  readonly acquiredAt: string;
}

export interface TerrainEvidenceIndexSummary {
  readonly coverageFraction: 1;
  readonly nodataFraction: 0;
  readonly minimumElevationM: number;
  readonly maximumElevationM: number;
  readonly meanElevationM: number;
  readonly sourceResolutionCounts: Readonly<Record<string, number>>;
}

export interface LandCoverEvidenceIndexSummary {
  readonly coverageFraction: 1;
  readonly unclassifiedFraction: 0;
  readonly areaFractionByClcClass: Readonly<Record<string, number>>;
  readonly dominantClass: number;
  readonly dominantClassFraction: number;
}

export interface PrecipitationEvidenceIndexSummary {
  readonly coverageFraction: 1;
  readonly nativeCellOverlapFraction: Readonly<Record<string, number>>;
  readonly windowAccumulationMm: number;
}

export interface SpatialEvidenceIndexLayer<T> {
  readonly evidence: Evidence<T>;
  readonly diagnostics: SpatialCoverageDiagnostics;
  readonly sources: readonly SpatialEvidenceSourceReference[];
}

export interface SpatialEvidenceIndexCell {
  readonly version: typeof SPATIAL_EVIDENCE_INDEX_VERSION;
  readonly mode: SpatialEvidenceCompositionMode;
  readonly h3: string;
  readonly h3Resolution: number;
  readonly areaReference: SpatialEvidenceIndexCellInput['areaReference'];
  readonly targetCellAreaM2: number;
  readonly physicalRoutingAllowed: false;
  readonly hydraulicStateAllowed: false;
  readonly terrain: SpatialEvidenceIndexLayer<TerrainEvidenceIndexSummary>;
  readonly landCover: SpatialEvidenceIndexLayer<LandCoverEvidenceIndexSummary>;
  readonly precipitation: SpatialEvidenceIndexLayer<PrecipitationEvidenceIndexSummary>;
}

interface PreparedIntersection<T> extends SpatialEvidenceIntersection<T> {
  readonly sourceResolution: string;
}

interface PreparedLayer<T> {
  readonly intersections: readonly PreparedIntersection<T>[];
  readonly diagnostics: SpatialCoverageDiagnostics;
  readonly sources: readonly SpatialEvidenceSourceReference[];
  readonly unavailableStatus?: UnavailableEvidenceStatus;
}

const COVERAGE_TOLERANCE_FRACTION = 1e-6;

export function composeSpatialEvidenceIndexCell(
  input: SpatialEvidenceIndexCellInput,
): SpatialEvidenceIndexCell {
  validateTimestamp('composedAt', input.composedAt);
  validateMode(input);

  if (!isValidCell(input.h3)) {
    throw new Error(`Spatial evidence index requires a valid H3 cell: ${input.h3}`);
  }

  const targetCellAreaM2 = validateAreaReference(input.areaReference);
  const h3Resolution = getResolution(input.h3);
  const terrain = prepareTerrain(input, targetCellAreaM2);
  const landCover = prepareNumericLayer(
    input,
    'land cover',
    input.landCover,
    'CLC class code',
    targetCellAreaM2,
  );
  const precipitation = prepareNumericLayer(
    input,
    'precipitation',
    input.precipitation,
    'mm',
    targetCellAreaM2,
  );

  validatePrecipitationWindow(input, precipitation.intersections);

  return {
    version: SPATIAL_EVIDENCE_INDEX_VERSION,
    mode: input.mode,
    h3: input.h3,
    h3Resolution,
    areaReference: input.areaReference,
    targetCellAreaM2,
    physicalRoutingAllowed: false,
    hydraulicStateAllowed: false,
    terrain: composeTerrain(input, terrain),
    landCover: composeLandCover(input, landCover),
    precipitation: composePrecipitation(input, precipitation),
  };
}

function prepareTerrain(
  input: SpatialEvidenceIndexCellInput,
  targetCellAreaM2: number,
): PreparedLayer<number> & {
  readonly resolutions: readonly number[];
} {
  const resolutions: number[] = [];
  const intersections = input.terrain.map((intersection) => {
    if (
      !Number.isFinite(intersection.sourceResolutionMetres) ||
      intersection.sourceResolutionMetres <= 0
    ) {
      throw new Error(
        `Terrain intersection ${intersection.id} requires a positive native resolution`,
      );
    }
    resolutions.push(intersection.sourceResolutionMetres);
    return prepareIntersection(input, 'terrain', intersection, 'm');
  }).sort(compareIntersectionIds);

  return {
    intersections,
    resolutions,
    ...layerState('terrain', intersections, targetCellAreaM2),
  };
}

function prepareNumericLayer(
  input: SpatialEvidenceIndexCellInput,
  layer: 'land cover' | 'precipitation',
  source: readonly SpatialEvidenceIntersection<number>[],
  expectedUnit: string,
  targetCellAreaM2: number,
): PreparedLayer<number> {
  const intersections = source
    .map((intersection) =>
      prepareIntersection(input, layer, intersection, expectedUnit),
    )
    .sort(compareIntersectionIds);

  return {
    intersections,
    ...layerState(layer, intersections, targetCellAreaM2),
  };
}

function prepareIntersection<T>(
  input: SpatialEvidenceIndexCellInput,
  layer: string,
  intersection: SpatialEvidenceIntersection<T>,
  expectedUnit: string,
): PreparedIntersection<T> {
  if (intersection.id.trim().length === 0) {
    throw new Error(`${layer} intersections require non-empty ids`);
  }
  if (
    !Number.isFinite(intersection.intersectionAreaM2) ||
    intersection.intersectionAreaM2 <= 0
  ) {
    throw new Error(
      `${layer} intersection ${intersection.id} requires a positive area`,
    );
  }

  assertEvidenceInvariant(intersection.evidence);
  validateEvidenceMode(input, layer, intersection);

  if (intersection.evidence.unit !== expectedUnit) {
    throw new Error(
      `${layer} intersection ${intersection.id} uses unit ${String(
        intersection.evidence.unit,
      )}, expected ${expectedUnit}`,
    );
  }
  if (intersection.evidence.spatial.h3 !== undefined) {
    throw new Error(
      `${layer} intersection ${intersection.id} must retain native geometry rather than claim H3-native evidence`,
    );
  }
  const sourceResolution = intersection.evidence.spatial.sourceResolution;
  if (sourceResolution === undefined || sourceResolution.trim().length === 0) {
    throw new Error(
      `${layer} intersection ${intersection.id} requires source resolution`,
    );
  }
  if (
    intersection.evidence.value !== null &&
    (typeof intersection.evidence.value !== 'number' ||
      !Number.isFinite(intersection.evidence.value))
  ) {
    throw new Error(
      `${layer} intersection ${intersection.id} requires a finite numeric value`,
    );
  }

  return {
    ...intersection,
    sourceResolution,
  };
}

function layerState<T>(
  layer: string,
  intersections: readonly PreparedIntersection<T>[],
  targetCellAreaM2: number,
): Omit<PreparedLayer<T>, 'intersections'> {
  const ids = new Set<string>();
  let mappedAreaM2 = 0;
  let observedAreaM2 = 0;
  let unavailableMappedAreaM2 = 0;
  const unavailableStatuses: UnavailableEvidenceStatus[] = [];

  for (const intersection of intersections) {
    if (ids.has(intersection.id)) {
      throw new Error(`Duplicate ${layer} intersection id ${intersection.id}`);
    }
    ids.add(intersection.id);
    mappedAreaM2 += intersection.intersectionAreaM2;

    if (intersection.evidence.value === null) {
      unavailableMappedAreaM2 += intersection.intersectionAreaM2;
      unavailableStatuses.push(
        intersection.evidence.quality.status as UnavailableEvidenceStatus,
      );
    } else {
      observedAreaM2 += intersection.intersectionAreaM2;
    }
  }

  const toleranceAreaM2 = targetCellAreaM2 * COVERAGE_TOLERANCE_FRACTION;
  if (mappedAreaM2 - targetCellAreaM2 > toleranceAreaM2) {
    throw new Error(
      `${layer} intersections exceed the declared target-cell area; overlapping source footprints must be resolved before composition`,
    );
  }

  const uncoveredAreaM2 = Math.max(0, targetCellAreaM2 - mappedAreaM2);
  const complete =
    uncoveredAreaM2 <= toleranceAreaM2 &&
    unavailableMappedAreaM2 <= toleranceAreaM2;
  const diagnostics: SpatialCoverageDiagnostics = {
    targetCellAreaM2,
    mappedAreaM2,
    observedAreaM2,
    unavailableMappedAreaM2,
    uncoveredAreaM2,
    coverageFraction: clampFraction(mappedAreaM2 / targetCellAreaM2),
    missingFraction: clampFraction(
      (unavailableMappedAreaM2 + uncoveredAreaM2) / targetCellAreaM2,
    ),
    complete,
  };

  return {
    diagnostics,
    sources: intersections.map(sourceReference),
    unavailableStatus: complete
      ? undefined
      : selectUnavailableStatus(unavailableStatuses),
  };
}

function composeTerrain(
  input: SpatialEvidenceIndexCellInput,
  layer: PreparedLayer<number> & { readonly resolutions: readonly number[] },
): SpatialEvidenceIndexLayer<TerrainEvidenceIndexSummary> {
  if (!layer.diagnostics.complete) {
    return unavailableLayer(
      input,
      'terrain',
      layer,
      'm',
      'Terrain coverage is missing or contains unavailable native cells',
    );
  }

  const values = layer.intersections.map((intersection) =>
    requireNumericValue('terrain', intersection),
  );
  const resolutionCounts: Record<string, number> = {};
  for (const resolution of layer.resolutions) {
    const key = String(resolution);
    resolutionCounts[key] = (resolutionCounts[key] ?? 0) + 1;
  }
  const summary: TerrainEvidenceIndexSummary = {
    coverageFraction: 1,
    nodataFraction: 0,
    minimumElevationM: Math.min(...values),
    maximumElevationM: Math.max(...values),
    meanElevationM:
      values.length === 1
        ? values[0]
        : values.reduce(
            (total, value, index) =>
              total + value * layer.intersections[index].intersectionAreaM2,
            0,
          ) / layer.diagnostics.observedAreaM2,
    sourceResolutionCounts: sortRecord(resolutionCounts),
  };

  return availableLayer(input, 'terrain', layer, summary, 'm');
}

function composeLandCover(
  input: SpatialEvidenceIndexCellInput,
  layer: PreparedLayer<number>,
): SpatialEvidenceIndexLayer<LandCoverEvidenceIndexSummary> {
  if (!layer.diagnostics.complete) {
    return unavailableLayer(
      input,
      'land-cover',
      layer,
      'CLC area fractions',
      'Land-cover coverage is missing or contains unavailable native cells',
    );
  }

  const areaByClass = new Map<number, number>();
  for (const intersection of layer.intersections) {
    const classCode = requireNumericValue('land cover', intersection);
    if (!Number.isInteger(classCode) || classCode <= 0) {
      throw new Error(
        `Land-cover intersection ${intersection.id} requires a positive integer CLC class`,
      );
    }
    areaByClass.set(
      classCode,
      (areaByClass.get(classCode) ?? 0) + intersection.intersectionAreaM2,
    );
  }
  const sortedClasses = [...areaByClass.keys()].sort((left, right) => left - right);
  const areaFractionByClcClass: Record<string, number> = {};
  let dominantClass = sortedClasses[0];
  let dominantClassAreaM2 = -1;
  for (const classCode of sortedClasses) {
    const classAreaM2 = areaByClass.get(classCode) ?? 0;
    areaFractionByClcClass[String(classCode)] =
      classAreaM2 / layer.diagnostics.targetCellAreaM2;
    if (classAreaM2 > dominantClassAreaM2) {
      dominantClass = classCode;
      dominantClassAreaM2 = classAreaM2;
    }
  }
  if (dominantClass === undefined) {
    throw new Error('Complete land-cover composition requires at least one native cell');
  }
  const summary: LandCoverEvidenceIndexSummary = {
    coverageFraction: 1,
    unclassifiedFraction: 0,
    areaFractionByClcClass,
    dominantClass,
    dominantClassFraction:
      dominantClassAreaM2 / layer.diagnostics.targetCellAreaM2,
  };

  return availableLayer(
    input,
    'land-cover',
    layer,
    summary,
    'CLC area fractions',
  );
}

function composePrecipitation(
  input: SpatialEvidenceIndexCellInput,
  layer: PreparedLayer<number>,
): SpatialEvidenceIndexLayer<PrecipitationEvidenceIndexSummary> {
  if (!layer.diagnostics.complete) {
    return unavailableLayer(
      input,
      'precipitation',
      layer,
      'mm',
      'Precipitation coverage or the requested observation window is incomplete',
    );
  }

  const nativeCellOverlapFraction: Record<string, number> = {};
  let weightedTotal = 0;
  for (const intersection of layer.intersections) {
    const rainfallMm = requireNumericValue('precipitation', intersection);
    if (rainfallMm < 0) {
      throw new Error(
        `Precipitation intersection ${intersection.id} cannot contain negative rainfall`,
      );
    }
    const fraction =
      intersection.intersectionAreaM2 / layer.diagnostics.targetCellAreaM2;
    nativeCellOverlapFraction[intersection.id] = fraction;
    weightedTotal += rainfallMm * intersection.intersectionAreaM2;
  }
  const summary: PrecipitationEvidenceIndexSummary = {
    coverageFraction: 1,
    nativeCellOverlapFraction: sortRecord(nativeCellOverlapFraction),
    windowAccumulationMm:
      weightedTotal / layer.diagnostics.observedAreaM2,
  };

  return availableLayer(input, 'precipitation', layer, summary, 'mm');
}

function availableLayer<T>(
  input: SpatialEvidenceIndexCellInput,
  layerName: string,
  layer: PreparedLayer<unknown>,
  value: T,
  unit: string,
): SpatialEvidenceIndexLayer<T> {
  const descriptor = derivedDescriptor(input, layerName, layer, unit);
  const evidence =
    input.mode === 'synthetic_fixture'
      ? syntheticFixtureEvidence(value, {
          fixtureId: requireFixtureId(input),
          unit,
          spatial: descriptor.spatial,
          temporal: descriptor.temporal,
          transformation: descriptor.provenance.transformation,
          transformationVersion: descriptor.provenance.transformationVersion,
          samplingMethod: descriptor.provenance.samplingMethod,
          sourceMetadata: descriptor.provenance.sourceMetadata,
        })
      : availableEvidence(value, descriptor);

  return {
    evidence,
    diagnostics: layer.diagnostics,
    sources: layer.sources,
  };
}

function unavailableLayer<T>(
  input: SpatialEvidenceIndexCellInput,
  layerName: string,
  layer: PreparedLayer<unknown>,
  unit: string,
  reason: string,
): SpatialEvidenceIndexLayer<T> {
  const descriptor = derivedDescriptor(input, layerName, layer, unit);

  return {
    evidence: unavailableEvidence(
      layer.unavailableStatus ?? 'missing',
      reason,
      descriptor,
    ),
    diagnostics: layer.diagnostics,
    sources: layer.sources,
  };
}

function derivedDescriptor(
  input: SpatialEvidenceIndexCellInput,
  layerName: string,
  layer: PreparedLayer<unknown>,
  unit: string,
): EvidenceDescriptor & {
  provenance: EvidenceDescriptor['provenance'] & {
    provider: string;
    dataset: string;
  };
} {
  const temporal =
    layerName === 'precipitation'
      ? {
          acquiredAt: input.composedAt,
          windowStart: input.precipitationWindow.start,
          windowEnd: input.precipitationWindow.end,
        }
      : { acquiredAt: input.composedAt };
  const sourceResolutions = [
    ...new Set(layer.intersections.map((intersection) => intersection.sourceResolution)),
  ].sort();

  return {
    unit,
    spatial: {
      h3: input.h3,
      sourceResolution:
        sourceResolutions.length > 0
          ? sourceResolutions.join('; ')
          : 'explicitly uncovered',
    },
    temporal,
    provenance: {
      provider:
        input.mode === 'synthetic_fixture' ? 'synthetic-fixture' : 'GeoLens',
      dataset:
        input.mode === 'synthetic_fixture'
          ? `fixture:${requireFixtureId(input)}`
          : `spatial-evidence-index/${layerName}`,
      transformation: 'native-footprint area composition into an H3 evidence index',
      transformationVersion: SPATIAL_EVIDENCE_INDEX_VERSION,
      samplingMethod: 'exact source-footprint overlap; no common raster resampling',
      sourceMetadata: {
        mode: input.mode,
        sourceIds: layer.sources.map((source) => source.id),
        sourceProviders: uniqueStrings(layer.sources.map((source) => source.provider)),
        sourceDatasets: uniqueStrings(layer.sources.map((source) => source.dataset)),
        areaReferenceCrs: input.areaReference.horizontalCrs,
        areaMeasurementMethod: input.areaReference.measurementMethod,
        targetCellAreaM2: layer.diagnostics.targetCellAreaM2,
        coverageFraction: layer.diagnostics.coverageFraction,
        missingFraction: layer.diagnostics.missingFraction,
        physicalRoutingAllowed: false,
        hydraulicStateAllowed: false,
      },
    },
  };
}

function validatePrecipitationWindow(
  input: SpatialEvidenceIndexCellInput,
  intersections: readonly PreparedIntersection<number>[],
): void {
  validateTimestamp('precipitationWindow.start', input.precipitationWindow.start);
  validateTimestamp('precipitationWindow.end', input.precipitationWindow.end);
  if (
    Date.parse(input.precipitationWindow.start) >=
    Date.parse(input.precipitationWindow.end)
  ) {
    throw new Error('Spatial evidence precipitation window must be positive');
  }
  for (const intersection of intersections) {
    const { windowStart, windowEnd } = intersection.evidence.temporal;
    if (windowStart === undefined || windowEnd === undefined) {
      throw new Error(
        `Precipitation intersection ${intersection.id} requires a complete observation window`,
      );
    }
    if (
      windowStart !== input.precipitationWindow.start ||
      windowEnd !== input.precipitationWindow.end
    ) {
      throw new Error(
        'Precipitation intersections must use the requested identical window',
      );
    }
  }
}

function validateMode(input: SpatialEvidenceIndexCellInput): void {
  if (input.mode !== 'real_evidence' && input.mode !== 'synthetic_fixture') {
    throw new Error(`Unknown spatial evidence composition mode ${String(input.mode)}`);
  }
  if (input.mode === 'synthetic_fixture') {
    requireFixtureId(input);
  } else if (input.fixtureId !== undefined) {
    throw new Error('Real evidence composition cannot carry a fixture id');
  }
}

function validateAreaReference(
  areaReference: SpatialEvidenceIndexCellInput['areaReference'],
): number {
  if (areaReference.horizontalCrs.trim().length === 0) {
    throw new Error('Spatial evidence area reference requires a horizontal CRS');
  }
  if (areaReference.unit !== 'm2') {
    throw new Error('Spatial evidence target-cell area must use m2');
  }
  if (areaReference.measurementMethod.trim().length === 0) {
    throw new Error('Spatial evidence area reference requires a measurement method');
  }
  if (
    !Number.isFinite(areaReference.targetCellAreaM2) ||
    areaReference.targetCellAreaM2 <= 0
  ) {
    throw new Error('Spatial evidence target-cell area must be positive and finite');
  }
  return areaReference.targetCellAreaM2;
}

function validateEvidenceMode<T>(
  input: SpatialEvidenceIndexCellInput,
  layer: string,
  intersection: SpatialEvidenceIntersection<T>,
): void {
  const evidence = intersection.evidence;
  if (Date.parse(evidence.temporal.acquiredAt) > Date.parse(input.composedAt)) {
    throw new Error(
      `${layer} intersection ${intersection.id} was acquired after composition`,
    );
  }
  const fixtureLike =
    evidence.quality.status === 'synthetic_fixture' ||
    evidence.provenance.provider === 'synthetic-fixture' ||
    evidence.provenance.dataset.startsWith('fixture:');
  if (input.mode === 'real_evidence' && fixtureLike) {
    throw new Error(
      `${layer} intersection ${intersection.id} is synthetic and cannot enter real evidence composition`,
    );
  }
  if (input.mode === 'synthetic_fixture' && !fixtureLike) {
    throw new Error(
      `${layer} intersection ${intersection.id} is not marked as synthetic fixture evidence`,
    );
  }
}

function sourceReference<T>(
  intersection: PreparedIntersection<T>,
): SpatialEvidenceSourceReference {
  return {
    id: intersection.id,
    intersectionAreaM2: intersection.intersectionAreaM2,
    status: intersection.evidence.quality.status,
    provider: intersection.evidence.provenance.provider,
    dataset: intersection.evidence.provenance.dataset,
    datasetVersion: intersection.evidence.provenance.datasetVersion,
    sourceResolution: intersection.sourceResolution,
    observedAt: intersection.evidence.temporal.observedAt,
    windowStart: intersection.evidence.temporal.windowStart,
    windowEnd: intersection.evidence.temporal.windowEnd,
    acquiredAt: intersection.evidence.temporal.acquiredAt,
  };
}

function selectUnavailableStatus(
  statuses: readonly UnavailableEvidenceStatus[],
): UnavailableEvidenceStatus {
  const priority: readonly UnavailableEvidenceStatus[] = [
    'invalid_response',
    'auth_required',
    'rate_limited',
    'upstream_error',
    'incomplete_window',
    'out_of_coverage',
    'stale',
    'missing',
  ];
  return priority.find((status) => statuses.includes(status)) ?? 'missing';
}

function requireNumericValue(
  layer: string,
  intersection: PreparedIntersection<number>,
): number {
  const value = intersection.evidence.value;
  if (value === null) {
    throw new Error(
      `Complete ${layer} composition cannot contain unavailable intersection ${intersection.id}`,
    );
  }
  return value;
}

function requireFixtureId(input: SpatialEvidenceIndexCellInput): string {
  if (input.fixtureId === undefined || input.fixtureId.trim().length === 0) {
    throw new Error('Synthetic spatial composition requires a fixture id');
  }
  return input.fixtureId;
}

function validateTimestamp(label: string, value: string): void {
  if (value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp`);
  }
}

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function compareIntersectionIds<T>(
  left: PreparedIntersection<T>,
  right: PreparedIntersection<T>,
): number {
  return left.id.localeCompare(right.id);
}
