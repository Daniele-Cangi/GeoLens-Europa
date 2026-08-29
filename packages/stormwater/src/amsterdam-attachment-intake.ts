import {
  BGT_INFLOW_TABLE_STANDARD,
  BgtInflowTableRecord,
  validateBgtInflowTableRecords,
} from './bgt-inflow-attachment';

const AMSTERDAM_PROOF_ID = 'amsterdam-waternet-observed-proof';

export const AMSTERDAM_ATTACHMENT_ARTIFACT_ROLES = [
  'source_table',
  'metadata',
  'license',
] as const;

export type AmsterdamAttachmentArtifactRole =
  (typeof AMSTERDAM_ATTACHMENT_ARTIFACT_ROLES)[number];

export type AmsterdamAttachmentIntakeStatus =
  | 'missing'
  | 'received'
  | 'under_review'
  | 'verified'
  | 'rejected';

export interface AmsterdamAttachmentArtifact {
  readonly id: string;
  readonly role: AmsterdamAttachmentArtifactRole;
  readonly relativePath: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface AmsterdamAttachmentDeliveryPackage {
  readonly schemaVersion:
    'amsterdam-surface-network-attachment-package-v0.1.0';
  readonly packageId: string;
  readonly proofId: typeof AMSTERDAM_PROOF_ID;
  readonly sourceKind: 'external_delivery' | 'synthetic_fixture';
  readonly receivedAt: string;
  readonly deliveryReference: string;
  readonly authority: {
    readonly name: string;
    readonly role: 'network_owner_or_authorized_delegate';
  };
  readonly relation: {
    readonly kind: 'bgt_inflow_table';
    readonly standard: typeof BGT_INFLOW_TABLE_STANDARD;
    readonly recordArtifactIds: readonly string[];
    readonly records: readonly BgtInflowTableRecord[];
  };
  readonly boundedSelection: {
    readonly crs: 'EPSG:4326';
    readonly latMin: number;
    readonly lonMin: number;
    readonly latMax: number;
    readonly lonMax: number;
    readonly selectionMethod: string;
  };
  readonly license: {
    readonly access: 'public' | 'restricted' | 'unknown';
    readonly redistribution: 'allowed' | 'restricted' | 'unknown';
    readonly reference?: string;
  };
  readonly policy: {
    readonly identifierMatch: 'exact_only';
    readonly proximityInference: 'forbidden';
    readonly conditionedProxyPromotion: 'forbidden';
    readonly missingValuePolicy: 'block_not_infer';
  };
  readonly artifacts: readonly AmsterdamAttachmentArtifact[];
}

export interface AmsterdamAttachmentReviewReceipt {
  readonly schemaVersion:
    'amsterdam-surface-network-attachment-review-v0.1.0';
  readonly packageId: string;
  readonly reviewedAt: string;
  readonly reviewer: string;
  readonly artifactIntegrity: 'verified';
  readonly publisherAuthorityCheck: 'passed';
  readonly licenseUseReviewed: true;
  readonly relationSemanticsCheck: 'passed';
  readonly decision: 'accepted' | 'rejected';
  readonly reason: string;
}

export interface AmsterdamAttachmentValidation<T> {
  readonly ok: boolean;
  readonly value: T | null;
  readonly errors: readonly string[];
}

export interface AmsterdamAttachmentIntakeSummary {
  readonly schemaVersion:
    'amsterdam-surface-network-attachment-intake-status-v0.1.0';
  readonly validatorVersion:
    'amsterdam-surface-network-attachment-validator-v0.1.0';
  readonly proofId: typeof AMSTERDAM_PROOF_ID;
  readonly status: AmsterdamAttachmentIntakeStatus;
  readonly packageId: string | null;
  readonly sourceKind:
    | AmsterdamAttachmentDeliveryPackage['sourceKind']
    | null;
  readonly receivedAt: string | null;
  readonly recordCount: number;
  readonly artifactCount: number;
  readonly attachmentAssessmentEligibility:
    | 'blocked'
    | 'ready_for_exact_observed_topology_match';
  readonly propagationEligibility: 'blocked';
  readonly blockingReasons: readonly string[];
  readonly validationErrors: readonly string[];
  readonly policy: {
    readonly acceptedRelation: 'STOWA 2025 BGT Inlooptabel';
    readonly authorityRequired:
      'network_owner_or_authorized_delegate';
    readonly identifierMatch: 'exact_only';
    readonly proximityInference: 'forbidden';
    readonly conditionedProxyCanBecomeObserved: false;
    readonly syntheticFixturesCanBecomeObserved: false;
    readonly originalFilesStayOutsideGit: true;
    readonly propagationRequiresSeparateTopologyAssessment: true;
  };
}

export function validateAmsterdamAttachmentDeliveryPackage(
  input: unknown,
): AmsterdamAttachmentValidation<AmsterdamAttachmentDeliveryPackage> {
  try {
    const value = input as AmsterdamAttachmentDeliveryPackage;
    assertObject(value, 'package');

    if (
      value.schemaVersion !==
      'amsterdam-surface-network-attachment-package-v0.1.0'
    ) {
      throw new Error('schemaVersion is unsupported');
    }
    assertNonEmpty(value.packageId, 'packageId');
    if (value.proofId !== AMSTERDAM_PROOF_ID) {
      throw new Error(`proofId must equal ${AMSTERDAM_PROOF_ID}`);
    }
    if (
      value.sourceKind !== 'external_delivery' &&
      value.sourceKind !== 'synthetic_fixture'
    ) {
      throw new Error('sourceKind is unsupported');
    }
    assertIsoTimestamp(value.receivedAt, 'receivedAt');
    assertNonEmpty(value.deliveryReference, 'deliveryReference');
    assertObject(value.authority, 'authority');
    assertNonEmpty(value.authority.name, 'authority.name');
    if (
      value.authority.role !==
      'network_owner_or_authorized_delegate'
    ) {
      throw new Error(
        'authority.role must equal network_owner_or_authorized_delegate',
      );
    }

    assertRelation(value.relation, value.sourceKind);
    assertBoundedSelection(value.boundedSelection);
    assertLicense(value.license);
    assertPolicy(value.policy);
    assertArtifacts(value.artifacts);

    const artifactById = new Map(
      value.artifacts.map((artifact) => [artifact.id, artifact]),
    );
    if (value.relation.recordArtifactIds.length === 0) {
      throw new Error(
        'relation.recordArtifactIds must identify at least one source table',
      );
    }
    for (const artifactId of value.relation.recordArtifactIds) {
      const artifact = artifactById.get(artifactId);
      if (artifact === undefined) {
        throw new Error(
          `relation references unknown artifact "${artifactId}"`,
        );
      }
      if (artifact.role !== 'source_table') {
        throw new Error(
          `relation artifact "${artifactId}" must have source_table role`,
        );
      }
    }

    return { ok: true, value, errors: [] };
  } catch (error) {
    return {
      ok: false,
      value: null,
      errors: [
        error instanceof Error
          ? error.message
          : 'Invalid Amsterdam attachment delivery package',
      ],
    };
  }
}

export function validateAmsterdamAttachmentReviewReceipt(
  input: unknown,
  delivery: AmsterdamAttachmentDeliveryPackage,
): AmsterdamAttachmentValidation<AmsterdamAttachmentReviewReceipt> {
  try {
    const value = input as AmsterdamAttachmentReviewReceipt;
    assertObject(value, 'review');
    if (
      value.schemaVersion !==
      'amsterdam-surface-network-attachment-review-v0.1.0'
    ) {
      throw new Error('review.schemaVersion is unsupported');
    }
    if (value.packageId !== delivery.packageId) {
      throw new Error('review.packageId does not match delivery package');
    }
    assertIsoTimestamp(value.reviewedAt, 'review.reviewedAt');
    assertNonEmpty(value.reviewer, 'review.reviewer');
    if (value.artifactIntegrity !== 'verified') {
      throw new Error('review.artifactIntegrity must equal verified');
    }
    if (value.publisherAuthorityCheck !== 'passed') {
      throw new Error(
        'review.publisherAuthorityCheck must equal passed',
      );
    }
    if (value.licenseUseReviewed !== true) {
      throw new Error('review.licenseUseReviewed must equal true');
    }
    if (value.relationSemanticsCheck !== 'passed') {
      throw new Error(
        'review.relationSemanticsCheck must equal passed',
      );
    }
    if (
      value.decision !== 'accepted' &&
      value.decision !== 'rejected'
    ) {
      throw new Error('review.decision is unsupported');
    }
    assertNonEmpty(value.reason, 'review.reason');
    if (
      value.decision === 'accepted' &&
      delivery.sourceKind === 'synthetic_fixture'
    ) {
      throw new Error(
        'Synthetic fixtures cannot be accepted as observed attachment evidence',
      );
    }

    return { ok: true, value, errors: [] };
  } catch (error) {
    return {
      ok: false,
      value: null,
      errors: [
        error instanceof Error
          ? error.message
          : 'Invalid Amsterdam attachment review receipt',
      ],
    };
  }
}

export function inspectAmsterdamAttachmentIntake(
  input: unknown | null,
  reviewInput: unknown | null = null,
): AmsterdamAttachmentIntakeSummary {
  if (input === null) return missingAmsterdamAttachmentIntake();

  const packageValidation =
    validateAmsterdamAttachmentDeliveryPackage(input);
  if (!packageValidation.ok || packageValidation.value === null) {
    return {
      ...missingAmsterdamAttachmentIntake(),
      status: 'rejected',
      blockingReasons: [
        'The received package failed the fail-closed structural contract.',
      ],
      validationErrors: packageValidation.errors,
    };
  }

  const delivery = packageValidation.value;
  const reviewValidation =
    reviewInput === null
      ? null
      : validateAmsterdamAttachmentReviewReceipt(
          reviewInput,
          delivery,
        );
  const review = reviewValidation?.value ?? null;
  const readyForMatch =
    review?.decision === 'accepted' &&
    delivery.sourceKind === 'external_delivery';
  const blockingReasons: string[] = [];

  if (review === null) {
    blockingReasons.push(
      reviewValidation === null
        ? 'The received package has not completed GeoLens review.'
        : 'The review receipt is invalid and cannot promote the package.',
    );
  } else if (review.decision === 'rejected') {
    blockingReasons.push(review.reason);
  }
  if (delivery.sourceKind === 'synthetic_fixture') {
    blockingReasons.push(
      'Synthetic fixtures can verify the contract but can never become observed attachment evidence.',
    );
  }
  blockingReasons.push(
    readyForMatch
      ? 'Propagation remains blocked until an exact unique identifier match against the observed Waternet topology succeeds.'
      : 'The delivery is not eligible for exact observed-topology assessment.',
  );

  return {
    schemaVersion:
      'amsterdam-surface-network-attachment-intake-status-v0.1.0',
    validatorVersion:
      'amsterdam-surface-network-attachment-validator-v0.1.0',
    proofId: AMSTERDAM_PROOF_ID,
    status:
      review?.decision === 'rejected'
        ? 'rejected'
        : review?.decision === 'accepted'
          ? 'verified'
          : reviewValidation === null
            ? 'received'
            : 'under_review',
    packageId: delivery.packageId,
    sourceKind: delivery.sourceKind,
    receivedAt: delivery.receivedAt,
    recordCount: delivery.relation.records.length,
    artifactCount: delivery.artifacts.length,
    attachmentAssessmentEligibility: readyForMatch
      ? 'ready_for_exact_observed_topology_match'
      : 'blocked',
    propagationEligibility: 'blocked',
    blockingReasons,
    validationErrors: reviewValidation?.errors ?? [],
    policy: intakePolicy(),
  };
}

export const AMSTERDAM_SURFACE_NETWORK_ATTACHMENT_INTAKE =
  inspectAmsterdamAttachmentIntake(null);

function missingAmsterdamAttachmentIntake(): AmsterdamAttachmentIntakeSummary {
  return {
    schemaVersion:
      'amsterdam-surface-network-attachment-intake-status-v0.1.0',
    validatorVersion:
      'amsterdam-surface-network-attachment-validator-v0.1.0',
    proofId: AMSTERDAM_PROOF_ID,
    status: 'missing',
    packageId: null,
    sourceKind: null,
    receivedAt: null,
    recordCount: 0,
    artifactCount: 0,
    attachmentAssessmentEligibility: 'blocked',
    propagationEligibility: 'blocked',
    blockingReasons: [
      'No Amsterdam owner-published BGT Inlooptabel delivery has been received.',
      'The conditioned BGT/AHN outlet proxy is not observed attachment evidence.',
    ],
    validationErrors: [],
    policy: intakePolicy(),
  };
}

function intakePolicy(): AmsterdamAttachmentIntakeSummary['policy'] {
  return {
    acceptedRelation: 'STOWA 2025 BGT Inlooptabel',
    authorityRequired: 'network_owner_or_authorized_delegate',
    identifierMatch: 'exact_only',
    proximityInference: 'forbidden',
    conditionedProxyCanBecomeObserved: false,
    syntheticFixturesCanBecomeObserved: false,
    originalFilesStayOutsideGit: true,
    propagationRequiresSeparateTopologyAssessment: true,
  };
}

function assertRelation(
  relation: AmsterdamAttachmentDeliveryPackage['relation'],
  sourceKind: AmsterdamAttachmentDeliveryPackage['sourceKind'],
): void {
  assertObject(relation, 'relation');
  if (relation.kind !== 'bgt_inflow_table') {
    throw new Error('relation.kind must equal bgt_inflow_table');
  }
  if (relation.standard !== BGT_INFLOW_TABLE_STANDARD) {
    throw new Error(
      `relation.standard must equal ${BGT_INFLOW_TABLE_STANDARD}`,
    );
  }
  if (!Array.isArray(relation.recordArtifactIds)) {
    throw new Error('relation.recordArtifactIds must be an array');
  }
  if (!Array.isArray(relation.records) || relation.records.length === 0) {
    throw new Error('relation.records must contain at least one record');
  }

  validateBgtInflowTableRecords(relation.records);
  const expectedOrigin =
    sourceKind === 'external_delivery'
      ? 'observed_public_record'
      : 'synthetic_fixture';
  if (
    relation.records.some(
      (record) => record.source.origin !== expectedOrigin,
    )
  ) {
    throw new Error(
      `relation record origin must equal ${expectedOrigin} for ${sourceKind}`,
    );
  }
}

function assertBoundedSelection(
  selection: AmsterdamAttachmentDeliveryPackage['boundedSelection'],
): void {
  assertObject(selection, 'boundedSelection');
  if (selection.crs !== 'EPSG:4326') {
    throw new Error('boundedSelection.crs must equal EPSG:4326');
  }
  const coordinates = [
    selection.latMin,
    selection.lonMin,
    selection.latMax,
    selection.lonMax,
  ];
  if (!coordinates.every(Number.isFinite)) {
    throw new Error('boundedSelection coordinates must be finite');
  }
  if (
    selection.latMin < -90 ||
    selection.latMax > 90 ||
    selection.lonMin < -180 ||
    selection.lonMax > 180 ||
    selection.latMin >= selection.latMax ||
    selection.lonMin >= selection.lonMax
  ) {
    throw new Error('boundedSelection coordinates are invalid or unordered');
  }
  if (
    selection.latMax - selection.latMin > 0.25 ||
    selection.lonMax - selection.lonMin > 0.25
  ) {
    throw new Error('boundedSelection exceeds the 0.25 degree proof limit');
  }
  assertNonEmpty(
    selection.selectionMethod,
    'boundedSelection.selectionMethod',
  );
}

function assertLicense(
  license: AmsterdamAttachmentDeliveryPackage['license'],
): void {
  assertObject(license, 'license');
  if (!['public', 'restricted', 'unknown'].includes(license.access)) {
    throw new Error('license.access is unsupported');
  }
  if (
    !['allowed', 'restricted', 'unknown'].includes(
      license.redistribution,
    )
  ) {
    throw new Error('license.redistribution is unsupported');
  }
  if (license.reference !== undefined) {
    assertNonEmpty(license.reference, 'license.reference');
  }
}

function assertPolicy(
  policy: AmsterdamAttachmentDeliveryPackage['policy'],
): void {
  assertObject(policy, 'policy');
  if (policy.identifierMatch !== 'exact_only') {
    throw new Error('policy.identifierMatch must equal exact_only');
  }
  if (policy.proximityInference !== 'forbidden') {
    throw new Error('policy.proximityInference must equal forbidden');
  }
  if (policy.conditionedProxyPromotion !== 'forbidden') {
    throw new Error(
      'policy.conditionedProxyPromotion must equal forbidden',
    );
  }
  if (policy.missingValuePolicy !== 'block_not_infer') {
    throw new Error(
      'policy.missingValuePolicy must equal block_not_infer',
    );
  }
}

function assertArtifacts(
  artifacts: readonly AmsterdamAttachmentArtifact[],
): void {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('artifacts must contain at least one item');
  }
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const [index, artifact] of artifacts.entries()) {
    const candidate: unknown = artifact;
    assertObject(candidate, `artifacts[${index}]`);
    const item = candidate as unknown as AmsterdamAttachmentArtifact;
    assertNonEmpty(item.id, `artifacts[${index}].id`);
    if (ids.has(item.id)) {
      throw new Error(`Duplicate artifact id "${item.id}"`);
    }
    ids.add(item.id);
    if (!AMSTERDAM_ATTACHMENT_ARTIFACT_ROLES.includes(item.role)) {
      throw new Error(`artifacts[${index}].role is unsupported`);
    }
    assertPortableRelativePath(
      item.relativePath,
      `artifacts[${index}].relativePath`,
    );
    if (paths.has(item.relativePath)) {
      throw new Error(
        `Duplicate artifact relativePath "${item.relativePath}"`,
      );
    }
    paths.add(item.relativePath);
    assertNonEmpty(item.mediaType, `artifacts[${index}].mediaType`);
    if (!Number.isSafeInteger(item.bytes) || item.bytes <= 0) {
      throw new Error(`artifacts[${index}].bytes must be positive`);
    }
    if (!/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new Error(
        `artifacts[${index}].sha256 must be lowercase SHA-256`,
      );
    }
  }
}

function assertPortableRelativePath(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (
    value.includes('\\') ||
    value.startsWith('/') ||
    value.includes('://') ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').some((part) => part === '..' || part === '')
  ) {
    throw new Error(`${label} must be a portable relative path`);
  }
}

function assertIsoTimestamp(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
}

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}
