export * from './benchmark';
export * from './arpaeHydraulicIntake';
export * from './cumbriaAccessAudit';
export * from './emiliaBenchmark';
export * from './emiliaMap';

export const EVIDENCE_STATUSES = [
  'available',
  'missing',
  'stale',
  'out_of_coverage',
  'auth_required',
  'rate_limited',
  'upstream_error',
  'invalid_response',
  'incomplete_window',
  'synthetic_fixture',
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export type UnavailableEvidenceStatus = Exclude<
  EvidenceStatus,
  'available' | 'synthetic_fixture'
>;

export type EvidenceMetadataScalar = string | number | boolean | null;

export type EvidenceMetadataValue =
  | EvidenceMetadataScalar
  | readonly EvidenceMetadataScalar[];

export interface EvidenceSpatial {
  readonly h3?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly sourceResolution?: string;
}

export interface EvidenceTemporal {
  readonly observedAt?: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
  readonly acquiredAt: string;
}

export interface EvidenceProvenance {
  readonly provider: string;
  readonly dataset: string;
  readonly datasetVersion?: string;
  readonly transformation?: string;
  readonly transformationVersion?: string;
  readonly samplingMethod?: string;
  readonly sourceMetadata?: Readonly<Record<string, EvidenceMetadataValue>>;
}

export interface EvidenceQuality {
  readonly status: EvidenceStatus;
  readonly missingReason?: string;
  readonly sourceQuality?: number;
}

export interface Evidence<T> {
  readonly value: T | null;
  readonly unit?: string;
  readonly spatial: EvidenceSpatial;
  readonly temporal: EvidenceTemporal;
  readonly provenance: EvidenceProvenance;
  readonly quality: EvidenceQuality;
}

export interface EvidenceDescriptor {
  readonly unit?: string;
  readonly spatial: EvidenceSpatial;
  readonly temporal: EvidenceTemporal;
  readonly provenance: EvidenceProvenance;
}

export interface AvailableEvidenceQuality {
  readonly sourceQuality?: number;
}

export interface SyntheticFixtureDescriptor {
  readonly fixtureId: string;
  readonly unit?: string;
  readonly spatial: EvidenceSpatial;
  readonly temporal: EvidenceTemporal;
  readonly transformation?: string;
  readonly transformationVersion?: string;
  readonly samplingMethod?: string;
  readonly sourceQuality?: number;
  readonly sourceMetadata?: Readonly<Record<string, EvidenceMetadataValue>>;
}

const evidenceStatusSet: ReadonlySet<string> = new Set(EVIDENCE_STATUSES);

export function availableEvidence<T>(
  value: T,
  descriptor: EvidenceDescriptor,
  quality: AvailableEvidenceQuality = {},
): Evidence<T> {
  const evidence: Evidence<T> = {
    value,
    unit: descriptor.unit,
    spatial: descriptor.spatial,
    temporal: descriptor.temporal,
    provenance: descriptor.provenance,
    quality: {
      status: 'available',
      sourceQuality: quality.sourceQuality,
    },
  };

  assertEvidenceInvariant(evidence);
  return evidence;
}

export function unavailableEvidence<T = never>(
  status: UnavailableEvidenceStatus,
  missingReason: string,
  descriptor: EvidenceDescriptor,
  quality: AvailableEvidenceQuality = {},
): Evidence<T> {
  if (!isUnavailableEvidenceStatus(status)) {
    throw new Error(`Status "${String(status)}" cannot describe unavailable evidence`);
  }

  const evidence: Evidence<T> = {
    value: null,
    unit: descriptor.unit,
    spatial: descriptor.spatial,
    temporal: descriptor.temporal,
    provenance: descriptor.provenance,
    quality: {
      status,
      missingReason,
      sourceQuality: quality.sourceQuality,
    },
  };

  assertEvidenceInvariant(evidence);
  return evidence;
}

export function syntheticFixtureEvidence<T>(
  value: T,
  descriptor: SyntheticFixtureDescriptor,
): Evidence<T> {
  assertNonEmpty('fixtureId', descriptor.fixtureId);

  const evidence: Evidence<T> = {
    value,
    unit: descriptor.unit,
    spatial: descriptor.spatial,
    temporal: descriptor.temporal,
    provenance: {
      provider: 'synthetic-fixture',
      dataset: `fixture:${descriptor.fixtureId}`,
      transformation: descriptor.transformation,
      transformationVersion: descriptor.transformationVersion,
      samplingMethod: descriptor.samplingMethod,
      sourceMetadata: {
        ...descriptor.sourceMetadata,
        fixtureId: descriptor.fixtureId,
      },
    },
    quality: {
      status: 'synthetic_fixture',
      sourceQuality: descriptor.sourceQuality,
    },
  };

  assertEvidenceInvariant(evidence);
  return evidence;
}

export function isUnavailableEvidenceStatus(
  status: EvidenceStatus,
): status is UnavailableEvidenceStatus {
  return status !== 'available' && status !== 'synthetic_fixture';
}

export function assertEvidenceInvariant(
  evidence: Evidence<unknown>,
): void {
  const status = evidence.quality.status;

  if (!evidenceStatusSet.has(status)) {
    throw new Error(`Unknown evidence status "${String(status)}"`);
  }

  const carriesValue = status === 'available' || status === 'synthetic_fixture';

  if (
    carriesValue &&
    (evidence.value === null || evidence.value === undefined)
  ) {
    throw new Error(`Evidence with status "${status}" must carry a value`);
  }

  if (!carriesValue && evidence.value !== null) {
    throw new Error(`Evidence with status "${status}" must not carry a value`);
  }

  if (carriesValue && evidence.quality.missingReason !== undefined) {
    throw new Error(`Evidence with status "${status}" cannot have a missing reason`);
  }

  if (!carriesValue) {
    assertNonEmpty('quality.missingReason', evidence.quality.missingReason);
  }

  assertNonEmpty('provenance.provider', evidence.provenance.provider);
  assertNonEmpty('provenance.dataset', evidence.provenance.dataset);
  assertIsoTimestamp('temporal.acquiredAt', evidence.temporal.acquiredAt);

  if (evidence.temporal.observedAt !== undefined) {
    assertIsoTimestamp('temporal.observedAt', evidence.temporal.observedAt);
  }

  const hasWindowStart = evidence.temporal.windowStart !== undefined;
  const hasWindowEnd = evidence.temporal.windowEnd !== undefined;

  if (hasWindowStart !== hasWindowEnd) {
    throw new Error('Evidence windows require both windowStart and windowEnd');
  }

  if (
    evidence.temporal.windowStart !== undefined &&
    evidence.temporal.windowEnd !== undefined
  ) {
    assertIsoTimestamp('temporal.windowStart', evidence.temporal.windowStart);
    assertIsoTimestamp('temporal.windowEnd', evidence.temporal.windowEnd);

    if (
      Date.parse(evidence.temporal.windowStart) >
      Date.parse(evidence.temporal.windowEnd)
    ) {
      throw new Error('Evidence windowStart must not be after windowEnd');
    }
  }

  if (
    evidence.spatial.lat !== undefined &&
    (!Number.isFinite(evidence.spatial.lat) ||
      evidence.spatial.lat < -90 ||
      evidence.spatial.lat > 90)
  ) {
    throw new Error('spatial.lat must be a finite latitude');
  }

  if (
    evidence.spatial.lon !== undefined &&
    (!Number.isFinite(evidence.spatial.lon) ||
      evidence.spatial.lon < -180 ||
      evidence.spatial.lon > 180)
  ) {
    throw new Error('spatial.lon must be a finite longitude');
  }

  if (evidence.spatial.h3 !== undefined) {
    assertNonEmpty('spatial.h3', evidence.spatial.h3);
  }

  if (evidence.spatial.sourceResolution !== undefined) {
    assertNonEmpty('spatial.sourceResolution', evidence.spatial.sourceResolution);
  }

  if (
    evidence.quality.sourceQuality !== undefined &&
    (!Number.isFinite(evidence.quality.sourceQuality) ||
      evidence.quality.sourceQuality < 0 ||
      evidence.quality.sourceQuality > 1)
  ) {
    throw new Error('quality.sourceQuality must be between 0 and 1');
  }

  if (
    status === 'synthetic_fixture' &&
    (evidence.provenance.provider !== 'synthetic-fixture' ||
      !evidence.provenance.dataset.startsWith('fixture:'))
  ) {
    throw new Error('Synthetic fixture evidence must use fixture provenance');
  }
}

function assertNonEmpty(label: string, value: string | undefined): void {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertIsoTimestamp(label: string, value: string): void {
  assertNonEmpty(label, value);

  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp`);
  }
}
