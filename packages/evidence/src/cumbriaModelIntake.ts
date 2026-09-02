export const CUMBRIA_MODEL_COMPONENT_IDS = [
  'native_archived_hydraulic_model',
  'model_and_hydrology_reports',
  'pre_event_model_outputs',
  'channel_cross_sections_and_topographic_survey',
  'boundary_condition_definitions_and_source_records',
  'roughness_and_parameter_definitions',
  'defence_and_floodgate_representation',
  'development_and_change_logs',
  'software_version_units_crs_and_datum',
  'licence_and_reuse_conditions',
] as const;

export type CumbriaModelComponentId =
  (typeof CUMBRIA_MODEL_COMPONENT_IDS)[number];

export const CUMBRIA_MODEL_GROUP_IDS = [1313, 1314, 1797, 8323] as const;
export const CUMBRIA_EXCLUDED_MODEL_GROUP_IDS = [2039, 9458] as const;
export const CUMBRIA_REQUESTED_PRODUCT_NUMBERS = [5, 6, 7] as const;

export interface CumbriaModelDeliveryIntakeProtocol {
  readonly id: 'cumbria-ea-model-delivery-intake-v0';
  readonly state: 'ready_no_delivery_received';
  readonly packageSchemaVersion: 'cumbria-ea-model-evidence-package-v0.1.0';
  readonly reviewSchemaVersion: 'cumbria-ea-model-evidence-review-v0.1.0';
  readonly validatorVersion: 'cumbria-ea-model-evidence-validator-v0.1.0';
  readonly intakeKind: 'cumbria-model';
  readonly requestId: 'cumbria-carlisle-pre-event-model-products-5-6-7-v0';
  readonly acceptedProductNumbers: readonly [5, 6, 7];
  readonly acceptedModelGroupIds: readonly [1313, 1314, 1797, 8323];
  readonly excludedModelGroupIds: readonly [2039, 9458];
  readonly declaredComponentIds: readonly CumbriaModelComponentId[];
  readonly requiredForGateAssessment: readonly CumbriaModelComponentId[];
  readonly originalFilesStayOutsideGit: true;
  readonly contentAddressAlgorithm: 'sha256';
  readonly receiptWriteMode: 'create_new_only';
  readonly originalsCopiedByIntake: false;
  readonly archivesExtractedByIntake: false;
  readonly packageReceived: false;
  readonly scientificReviewCompleted: false;
  readonly automaticReplayPromotion: false;
  readonly evaluationReferenceSeal: 'must_remain_closed';
}

export type CumbriaModelComponentStatus =
  | 'available'
  | 'incomplete'
  | 'missing'
  | 'metadata_only'
  | 'context_only'
  | 'synthetic_fixture';

export type CumbriaModelTemporalClassification =
  | 'pre_event'
  | 'undated_requires_review'
  | 'mixed_requires_review'
  | 'post_event_context_only'
  | 'synthetic_fixture';

export interface CumbriaModelArtifact {
  readonly id: string;
  readonly role:
    | 'delivery_archive'
    | 'native_model'
    | 'model_output'
    | 'cross_section'
    | 'boundary_condition'
    | 'terrain_or_survey'
    | 'roughness_or_parameter'
    | 'defence_or_floodgate'
    | 'method_report'
    | 'software_metadata'
    | 'licence_metadata'
    | 'other_metadata';
  readonly relativePath: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CumbriaModelComponent {
  readonly id: CumbriaModelComponentId;
  readonly requirement: 'required_for_gate_assessment' | 'supporting';
  readonly status: CumbriaModelComponentStatus;
  readonly artifactIds: readonly string[];
  readonly productNumbers: readonly (5 | 6 | 7)[];
  readonly modelGroupIds: readonly (1313 | 1314 | 1797 | 8323)[];
  readonly source: {
    readonly provider: string;
    readonly dataset: string;
    readonly datasetVersion?: string;
  } | null;
  readonly temporalClassification: CumbriaModelTemporalClassification;
  readonly sourceDates: readonly string[];
  readonly temporalLineageMethod?: string;
  readonly crs?: string;
  readonly verticalDatum?: string;
  readonly units?: readonly string[];
  readonly missingReason?: string;
  readonly observedEventGeometryIncluded: false;
  readonly derivedFromEvaluationReference: false;
  readonly calibrationUse: 'forbidden';
  readonly automaticPromotion: false;
}

export interface CumbriaModelEvidencePackage {
  readonly schemaVersion: 'cumbria-ea-model-evidence-package-v0.1.0';
  readonly packageId: string;
  readonly caseId: 'cumbria-2015-carlisle-replay';
  readonly requestId: 'cumbria-carlisle-pre-event-model-products-5-6-7-v0';
  readonly sourceKind: 'external_delivery' | 'synthetic_fixture';
  readonly receivedAt: string;
  readonly authority: string;
  readonly deliveryReference: string;
  readonly requestedProductNumbers: readonly [5, 6, 7];
  readonly requestedModelGroupIds: readonly [1313, 1314, 1797, 8323];
  readonly excludedModelGroupIds: readonly [2039, 9458];
  readonly license: {
    readonly access: 'open' | 'restricted' | 'permission_required' | 'unknown';
    readonly redistribution: 'allowed' | 'prohibited' | 'unknown';
    readonly termsUrl?: string;
    readonly attribution?: string;
  };
  readonly policy: {
    readonly product4Use: 'forbidden';
    readonly observedEventGeometryUse: 'forbidden';
    readonly postEventModelInput: 'forbidden';
    readonly missingValuePolicy: 'block_not_zero_or_infer';
    readonly automaticReplayPromotion: false;
    readonly evaluationReferenceSeal: 'must_remain_closed';
  };
  readonly artifacts: readonly CumbriaModelArtifact[];
  readonly components: readonly CumbriaModelComponent[];
}

export interface CumbriaModelReviewReceipt {
  readonly schemaVersion: 'cumbria-ea-model-evidence-review-v0.1.0';
  readonly packageId: string;
  readonly reviewedAt: string;
  readonly reviewer: string;
  readonly artifactIntegrity: 'verified';
  readonly licenseUseReviewed: true;
  readonly temporalLineageCheck: 'passed';
  readonly productAndModelGroupCheck: 'passed';
  readonly crsUnitsDatumCheck: 'passed';
  readonly evaluationLeakageCheck: 'passed';
  readonly referenceSealCheck: 'passed';
  readonly componentDecisions: readonly {
    readonly id: CumbriaModelComponentId;
    readonly decision:
      | 'accepted_candidate'
      | 'incomplete'
      | 'rejected'
      | 'context_only';
    readonly reason: string;
  }[];
}

export interface CumbriaModelValidationResult<T> {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly value: T | null;
}

export interface CumbriaModelIntakeSummary {
  readonly schemaVersion: 'cumbria-ea-model-intake-status-v0.1.0';
  readonly validatorVersion: 'cumbria-ea-model-evidence-validator-v0.1.0';
  readonly caseId: 'cumbria-2015-carlisle-replay';
  readonly status: 'missing' | 'received' | 'under_review' | 'verified' | 'rejected';
  readonly packageId: string | null;
  readonly sourceKind: CumbriaModelEvidencePackage['sourceKind'] | null;
  readonly receivedAt: string | null;
  readonly hydraulicContextAssessment: 'blocked' | 'ready_for_assessment';
  readonly replayEligibility: 'blocked';
  readonly blockingReasons: readonly string[];
  readonly validationErrors: readonly string[];
  readonly requiredComponents: readonly {
    readonly id: CumbriaModelComponentId;
    readonly requirement: CumbriaModelComponent['requirement'];
    readonly status: CumbriaModelComponentStatus;
    readonly artifactCount: number;
    readonly reviewDecision:
      | 'not_reviewed'
      | 'accepted_candidate'
      | 'incomplete'
      | 'rejected'
      | 'context_only';
    readonly reason: string | null;
  }[];
  readonly policy: {
    readonly originalFilesStayOutsideGit: true;
    readonly artifactIntegrityRequired: 'byte_count_and_sha256';
    readonly componentReviewRequired: true;
    readonly evaluationReferenceSeal: 'must_remain_closed';
    readonly automaticReplayPromotion: false;
    readonly syntheticFixturesCanBecomeReplayEvidence: false;
    readonly missingValuePolicy: 'block_not_zero_or_infer';
  };
}

const CASE_ID = 'cumbria-2015-carlisle-replay' as const;
const REQUEST_ID =
  'cumbria-carlisle-pre-event-model-products-5-6-7-v0' as const;

const requirementByComponent: Readonly<
  Record<CumbriaModelComponentId, CumbriaModelComponent['requirement']>
> = {
  native_archived_hydraulic_model: 'required_for_gate_assessment',
  model_and_hydrology_reports: 'supporting',
  pre_event_model_outputs: 'supporting',
  channel_cross_sections_and_topographic_survey: 'required_for_gate_assessment',
  boundary_condition_definitions_and_source_records:
    'required_for_gate_assessment',
  roughness_and_parameter_definitions: 'required_for_gate_assessment',
  defence_and_floodgate_representation: 'required_for_gate_assessment',
  development_and_change_logs: 'supporting',
  software_version_units_crs_and_datum: 'required_for_gate_assessment',
  licence_and_reuse_conditions: 'required_for_gate_assessment',
};

const missingReasonByComponent: Readonly<Record<CumbriaModelComponentId, string>> = {
  native_archived_hydraulic_model:
    'No native archived pre-event Carlisle hydraulic model has been received.',
  model_and_hydrology_reports:
    'No Product 5 model and hydrology report delivery has been received.',
  pre_event_model_outputs:
    'No pre-event scenario model outputs have been received.',
  channel_cross_sections_and_topographic_survey:
    'No event-valid channel sections or source topographic survey have been received.',
  boundary_condition_definitions_and_source_records:
    'No complete upstream/downstream boundary definitions and source records have been received.',
  roughness_and_parameter_definitions:
    'No source-backed roughness and hydraulic parameter definitions have been received.',
  defence_and_floodgate_representation:
    'No qualified December 2015 defence and floodgate representation has been received.',
  development_and_change_logs:
    'No model development or change log has been received.',
  software_version_units_crs_and_datum:
    'No complete software, version, unit, CRS and vertical-datum declaration has been received.',
  licence_and_reuse_conditions:
    'No explicit licence and reuse conditions have been received.',
};

const requestedGroupSet: ReadonlySet<number> = new Set(CUMBRIA_MODEL_GROUP_IDS);
const excludedGroupSet: ReadonlySet<number> = new Set(
  CUMBRIA_EXCLUDED_MODEL_GROUP_IDS,
);
const requestedProductSet: ReadonlySet<number> = new Set(
  CUMBRIA_REQUESTED_PRODUCT_NUMBERS,
);

export function assertCumbriaModelDeliveryIntakeProtocol(
  input: unknown,
): asserts input is CumbriaModelDeliveryIntakeProtocol {
  const raw = objectValue(input, 'Cumbria model delivery intake protocol');
  const exactFields: Readonly<Record<string, unknown>> = {
    id: 'cumbria-ea-model-delivery-intake-v0',
    state: 'ready_no_delivery_received',
    packageSchemaVersion: 'cumbria-ea-model-evidence-package-v0.1.0',
    reviewSchemaVersion: 'cumbria-ea-model-evidence-review-v0.1.0',
    validatorVersion: 'cumbria-ea-model-evidence-validator-v0.1.0',
    intakeKind: 'cumbria-model',
    requestId: REQUEST_ID,
    originalFilesStayOutsideGit: true,
    contentAddressAlgorithm: 'sha256',
    receiptWriteMode: 'create_new_only',
    originalsCopiedByIntake: false,
    archivesExtractedByIntake: false,
    packageReceived: false,
    scientificReviewCompleted: false,
    automaticReplayPromotion: false,
    evaluationReferenceSeal: 'must_remain_closed',
  };
  for (const [field, expected] of Object.entries(exactFields)) {
    assertExact(raw[field], expected, `modelDeliveryIntakeProtocol.${field}`);
  }
  exactNumberArray(
    raw.acceptedProductNumbers,
    CUMBRIA_REQUESTED_PRODUCT_NUMBERS,
    'modelDeliveryIntakeProtocol.acceptedProductNumbers',
  );
  exactNumberArray(
    raw.acceptedModelGroupIds,
    CUMBRIA_MODEL_GROUP_IDS,
    'modelDeliveryIntakeProtocol.acceptedModelGroupIds',
  );
  exactNumberArray(
    raw.excludedModelGroupIds,
    CUMBRIA_EXCLUDED_MODEL_GROUP_IDS,
    'modelDeliveryIntakeProtocol.excludedModelGroupIds',
  );
  const declared = uniqueStringArray(
    raw.declaredComponentIds,
    'modelDeliveryIntakeProtocol.declaredComponentIds',
  );
  if (JSON.stringify(declared) !== JSON.stringify(CUMBRIA_MODEL_COMPONENT_IDS)) {
    throw new Error('modelDeliveryIntakeProtocol component identities drifted');
  }
  const required = uniqueStringArray(
    raw.requiredForGateAssessment,
    'modelDeliveryIntakeProtocol.requiredForGateAssessment',
  );
  const expectedRequired = CUMBRIA_MODEL_COMPONENT_IDS.filter(
    (id) => requirementByComponent[id] === 'required_for_gate_assessment',
  );
  if (JSON.stringify(required) !== JSON.stringify(expectedRequired)) {
    throw new Error('modelDeliveryIntakeProtocol gate requirements drifted');
  }
}

export function validateCumbriaModelEvidencePackage(
  input: unknown,
): CumbriaModelValidationResult<CumbriaModelEvidencePackage> {
  try {
    assertCumbriaModelEvidencePackage(input);
    return { ok: true, errors: [], value: input };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      value: null,
    };
  }
}

export function assertCumbriaModelEvidencePackage(
  input: unknown,
): asserts input is CumbriaModelEvidencePackage {
  const raw = objectValue(input, 'Cumbria model evidence package');
  assertExact(
    raw.schemaVersion,
    'cumbria-ea-model-evidence-package-v0.1.0',
    'schemaVersion',
  );
  assertExact(raw.caseId, CASE_ID, 'caseId');
  assertExact(raw.requestId, REQUEST_ID, 'requestId');
  const packageId = nonEmptyString(raw.packageId, 'packageId');
  const sourceKind = enumValue(
    raw.sourceKind,
    ['external_delivery', 'synthetic_fixture'] as const,
    'sourceKind',
  );
  isoTimestamp(raw.receivedAt, 'receivedAt');
  const authority = nonEmptyString(raw.authority, 'authority');
  nonEmptyString(raw.deliveryReference, 'deliveryReference');

  if (sourceKind === 'synthetic_fixture') {
    if (!packageId.startsWith('fixture:') || authority !== 'synthetic-fixture') {
      throw new Error('Synthetic Cumbria packages require fixture identity and authority');
    }
  } else if (
    packageId.startsWith('fixture:') ||
    authority !== 'Environment Agency'
  ) {
    throw new Error(
      'External Cumbria model packages must identify Environment Agency as authority',
    );
  }

  exactNumberArray(
    raw.requestedProductNumbers,
    CUMBRIA_REQUESTED_PRODUCT_NUMBERS,
    'requestedProductNumbers',
  );
  exactNumberArray(
    raw.requestedModelGroupIds,
    CUMBRIA_MODEL_GROUP_IDS,
    'requestedModelGroupIds',
  );
  exactNumberArray(
    raw.excludedModelGroupIds,
    CUMBRIA_EXCLUDED_MODEL_GROUP_IDS,
    'excludedModelGroupIds',
  );
  assertLicense(raw.license);
  assertPolicy(raw.policy);

  const artifacts = arrayValue(raw.artifacts, 'artifacts', false);
  const artifactIds = new Set<string>();
  const artifactPaths = new Set<string>();
  artifacts.forEach((candidate, index) => {
    const artifact = objectValue(candidate, `artifacts[${index}]`);
    const id = nonEmptyString(artifact.id, `artifacts[${index}].id`);
    if (artifactIds.has(id)) {
      throw new Error(`Duplicate Cumbria model artifact id "${id}"`);
    }
    artifactIds.add(id);
    enumValue(
      artifact.role,
      [
        'delivery_archive',
        'native_model',
        'model_output',
        'cross_section',
        'boundary_condition',
        'terrain_or_survey',
        'roughness_or_parameter',
        'defence_or_floodgate',
        'method_report',
        'software_metadata',
        'licence_metadata',
        'other_metadata',
      ] as const,
      `artifacts[${index}].role`,
    );
    const relativePath = portableRelativePath(
      artifact.relativePath,
      `artifacts[${index}].relativePath`,
    );
    if (artifactPaths.has(relativePath)) {
      throw new Error(`Duplicate Cumbria model artifact path "${relativePath}"`);
    }
    artifactPaths.add(relativePath);
    nonEmptyString(artifact.mediaType, `artifacts[${index}].mediaType`);
    positiveInteger(artifact.bytes, `artifacts[${index}].bytes`);
    sha256(artifact.sha256, `artifacts[${index}].sha256`);
  });

  const components = arrayValue(raw.components, 'components');
  if (components.length !== CUMBRIA_MODEL_COMPONENT_IDS.length) {
    throw new Error('Cumbria model package must declare every required component');
  }
  const seen = new Set<string>();
  components.forEach((candidate, index) => {
    const component = objectValue(candidate, `components[${index}]`);
    const id = enumValue(
      component.id,
      CUMBRIA_MODEL_COMPONENT_IDS,
      `components[${index}].id`,
    );
    if (seen.has(id)) {
      throw new Error(`Duplicate Cumbria model component "${id}"`);
    }
    seen.add(id);
    assertComponent(component, id, sourceKind, artifactIds, index);
  });

  for (const artifactId of artifactIds) {
    const classified = components.some((candidate) => {
      const component = objectValue(candidate, 'component');
      return Array.isArray(component.artifactIds) &&
        component.artifactIds.includes(artifactId);
    });
    if (!classified) {
      throw new Error(`Cumbria model artifact "${artifactId}" is not classified`);
    }
  }

  if (artifacts.length === 0 && components.some((component) => {
    const value = objectValue(component, 'component');
    return value.status !== 'missing';
  })) {
    throw new Error('Non-missing Cumbria model components require artifacts');
  }
}

export function validateCumbriaModelReviewReceipt(
  input: unknown,
  evidencePackage: CumbriaModelEvidencePackage,
): CumbriaModelValidationResult<CumbriaModelReviewReceipt> {
  try {
    assertCumbriaModelReviewReceipt(input, evidencePackage);
    return { ok: true, errors: [], value: input };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      value: null,
    };
  }
}

export function assertCumbriaModelReviewReceipt(
  input: unknown,
  evidencePackage: CumbriaModelEvidencePackage,
): asserts input is CumbriaModelReviewReceipt {
  const raw = objectValue(input, 'Cumbria model review receipt');
  assertExact(
    raw.schemaVersion,
    'cumbria-ea-model-evidence-review-v0.1.0',
    'review.schemaVersion',
  );
  assertExact(raw.packageId, evidencePackage.packageId, 'review.packageId');
  isoTimestamp(raw.reviewedAt, 'review.reviewedAt');
  nonEmptyString(raw.reviewer, 'review.reviewer');
  assertExact(raw.artifactIntegrity, 'verified', 'review.artifactIntegrity');
  assertExact(raw.licenseUseReviewed, true, 'review.licenseUseReviewed');
  for (const field of [
    'temporalLineageCheck',
    'productAndModelGroupCheck',
    'crsUnitsDatumCheck',
    'evaluationLeakageCheck',
    'referenceSealCheck',
  ]) {
    assertExact(raw[field], 'passed', `review.${field}`);
  }

  const decisions = arrayValue(raw.componentDecisions, 'review.componentDecisions');
  if (decisions.length !== CUMBRIA_MODEL_COMPONENT_IDS.length) {
    throw new Error('Cumbria model review must decide every component');
  }
  const components = new Map(
    evidencePackage.components.map((component) => [component.id, component]),
  );
  const seen = new Set<string>();
  decisions.forEach((candidate, index) => {
    const decision = objectValue(
      candidate,
      `review.componentDecisions[${index}]`,
    );
    const id = enumValue(
      decision.id,
      CUMBRIA_MODEL_COMPONENT_IDS,
      `review.componentDecisions[${index}].id`,
    );
    if (seen.has(id)) {
      throw new Error(`Duplicate Cumbria model review decision for "${id}"`);
    }
    seen.add(id);
    const disposition = enumValue(
      decision.decision,
      ['accepted_candidate', 'incomplete', 'rejected', 'context_only'] as const,
      `review.componentDecisions[${index}].decision`,
    );
    nonEmptyString(decision.reason, `review.componentDecisions[${index}].reason`);
    const component = components.get(id);
    if (
      disposition === 'accepted_candidate' &&
      (evidencePackage.sourceKind !== 'external_delivery' ||
        component?.status !== 'available' ||
        component.temporalClassification !== 'pre_event')
    ) {
      throw new Error(
        `Review cannot accept "${id}" without available pre-event external evidence`,
      );
    }
    if (
      disposition === 'context_only' &&
      !['context_only', 'metadata_only'].includes(component?.status ?? '')
    ) {
      throw new Error(`Review cannot classify value-bearing "${id}" as context-only`);
    }
  });
}

export function inspectCumbriaModelEvidenceIntake(
  input: unknown | null,
  reviewInput: unknown | null = null,
): CumbriaModelIntakeSummary {
  if (input === null) return missingSummary();
  const packageValidation = validateCumbriaModelEvidencePackage(input);
  if (!packageValidation.ok || packageValidation.value === null) {
    return {
      ...missingSummary(),
      status: 'rejected',
      blockingReasons: [
        'The received Environment Agency package failed the fail-closed structural contract.',
      ],
      validationErrors: packageValidation.errors,
    };
  }

  const evidencePackage = packageValidation.value;
  const reviewValidation =
    reviewInput === null
      ? null
      : validateCumbriaModelReviewReceipt(reviewInput, evidencePackage);
  const review = reviewValidation?.value ?? null;
  const decisionById = new Map(
    review?.componentDecisions.map((decision) => [decision.id, decision]),
  );
  const requiredComponents = evidencePackage.components.filter(
    (component) => component.requirement === 'required_for_gate_assessment',
  );
  const assessmentReady =
    evidencePackage.sourceKind === 'external_delivery' &&
    review !== null &&
    requiredComponents.every(
      (component) =>
        decisionById.get(component.id)?.decision === 'accepted_candidate',
    );
  const hasRejected =
    review?.componentDecisions.some((decision) => decision.decision === 'rejected') ??
    false;

  const blockingReasons: string[] = [];
  if (review === null) {
    blockingReasons.push(
      reviewValidation === null
        ? 'The received package has not completed component-level GeoLens review.'
        : 'The review receipt is invalid and cannot promote any component.',
    );
  }
  if (evidencePackage.sourceKind === 'synthetic_fixture') {
    blockingReasons.push(
      'Synthetic fixtures can verify the intake contract but can never become replay evidence.',
    );
  }
  for (const component of requiredComponents) {
    const decision = decisionById.get(component.id);
    if (decision?.decision !== 'accepted_candidate') {
      blockingReasons.push(
        decision?.reason ??
          component.missingReason ??
          `${component.id} has not been accepted for physical gate assessment.`,
      );
    }
  }
  blockingReasons.push(
    'Even a complete accepted delivery requires a separate physical-gate update; replay eligibility is never granted by intake alone.',
  );

  return {
    schemaVersion: 'cumbria-ea-model-intake-status-v0.1.0',
    validatorVersion: 'cumbria-ea-model-evidence-validator-v0.1.0',
    caseId: CASE_ID,
    status: hasRejected
      ? 'rejected'
      : review !== null
        ? 'verified'
        : reviewValidation === null
          ? 'received'
          : 'under_review',
    packageId: evidencePackage.packageId,
    sourceKind: evidencePackage.sourceKind,
    receivedAt: evidencePackage.receivedAt,
    hydraulicContextAssessment: assessmentReady
      ? 'ready_for_assessment'
      : 'blocked',
    replayEligibility: 'blocked',
    blockingReasons,
    validationErrors: reviewValidation?.errors ?? [],
    requiredComponents: evidencePackage.components.map((component) => {
      const decision = decisionById.get(component.id);
      return {
        id: component.id,
        requirement: component.requirement,
        status: component.status,
        artifactCount: component.artifactIds.length,
        reviewDecision: decision?.decision ?? 'not_reviewed',
        reason: decision?.reason ?? component.missingReason ?? null,
      };
    }),
    policy: intakePolicy(),
  };
}

export const CUMBRIA_MODEL_EVIDENCE_INTAKE =
  inspectCumbriaModelEvidenceIntake(null);

function missingSummary(): CumbriaModelIntakeSummary {
  return {
    schemaVersion: 'cumbria-ea-model-intake-status-v0.1.0',
    validatorVersion: 'cumbria-ea-model-evidence-validator-v0.1.0',
    caseId: CASE_ID,
    status: 'missing',
    packageId: null,
    sourceKind: null,
    receivedAt: null,
    hydraulicContextAssessment: 'blocked',
    replayEligibility: 'blocked',
    blockingReasons: [
      'No Environment Agency Products 5, 6 or 7 delivery has been received.',
    ],
    validationErrors: [],
    requiredComponents: CUMBRIA_MODEL_COMPONENT_IDS.map((id) => ({
      id,
      requirement: requirementByComponent[id],
      status: 'missing',
      artifactCount: 0,
      reviewDecision: 'not_reviewed',
      reason: missingReasonByComponent[id],
    })),
    policy: intakePolicy(),
  };
}

function intakePolicy(): CumbriaModelIntakeSummary['policy'] {
  return {
    originalFilesStayOutsideGit: true,
    artifactIntegrityRequired: 'byte_count_and_sha256',
    componentReviewRequired: true,
    evaluationReferenceSeal: 'must_remain_closed',
    automaticReplayPromotion: false,
    syntheticFixturesCanBecomeReplayEvidence: false,
    missingValuePolicy: 'block_not_zero_or_infer',
  };
}

function assertComponent(
  component: Record<string, unknown>,
  id: CumbriaModelComponentId,
  sourceKind: CumbriaModelEvidencePackage['sourceKind'],
  artifactIds: ReadonlySet<string>,
  index: number,
): void {
  const label = `components[${index}]`;
  assertExact(
    component.requirement,
    requirementByComponent[id],
    `${label}.requirement`,
  );
  const status = enumValue(
    component.status,
    [
      'available',
      'incomplete',
      'missing',
      'metadata_only',
      'context_only',
      'synthetic_fixture',
    ] as const,
    `${label}.status`,
  );
  const temporalClassification = enumValue(
    component.temporalClassification,
    [
      'pre_event',
      'undated_requires_review',
      'mixed_requires_review',
      'post_event_context_only',
      'synthetic_fixture',
    ] as const,
    `${label}.temporalClassification`,
  );
  const sourceDates = uniqueStringArray(component.sourceDates, `${label}.sourceDates`);
  for (const [dateIndex, sourceDate] of sourceDates.entries()) {
    const timestamp = Date.parse(sourceDate);
    if (Number.isNaN(timestamp)) {
      throw new Error(`${label}.sourceDates[${dateIndex}] must be a date`);
    }
    if (
      temporalClassification === 'pre_event' &&
      timestamp >= Date.parse('2015-12-04T00:00:00Z')
    ) {
      throw new Error(`${label} pre-event evidence contains a non-pre-event date`);
    }
    if (
      temporalClassification === 'post_event_context_only' &&
      timestamp < Date.parse('2015-12-07T00:00:00Z')
    ) {
      throw new Error(`${label} post-event context contains a pre-event date`);
    }
  }
  assertExact(
    component.observedEventGeometryIncluded,
    false,
    `${label}.observedEventGeometryIncluded`,
  );
  assertExact(
    component.derivedFromEvaluationReference,
    false,
    `${label}.derivedFromEvaluationReference`,
  );
  assertExact(component.calibrationUse, 'forbidden', `${label}.calibrationUse`);
  assertExact(component.automaticPromotion, false, `${label}.automaticPromotion`);

  const references = uniqueStringArray(component.artifactIds, `${label}.artifactIds`);
  for (const reference of references) {
    if (!artifactIds.has(reference)) {
      throw new Error(`${label} references unknown artifact "${reference}"`);
    }
  }
  const products = uniqueIntegerArray(
    component.productNumbers,
    `${label}.productNumbers`,
  );
  if (products.some((value) => !requestedProductSet.has(value))) {
    throw new Error(`${label}.productNumbers contains an unrequested product`);
  }
  const groups = uniqueIntegerArray(component.modelGroupIds, `${label}.modelGroupIds`);
  if (groups.some((value) => excludedGroupSet.has(value))) {
    throw new Error(`${label}.modelGroupIds contains a post-event excluded group`);
  }
  if (groups.some((value) => !requestedGroupSet.has(value))) {
    throw new Error(`${label}.modelGroupIds contains an unrequested group`);
  }
  optionalNonEmptyString(component.crs, `${label}.crs`);
  optionalNonEmptyString(component.verticalDatum, `${label}.verticalDatum`);
  optionalStringArray(component.units, `${label}.units`);

  if (status === 'missing') {
    if (
      component.source !== null ||
      references.length !== 0 ||
      products.length !== 0 ||
      groups.length !== 0 ||
      sourceDates.length !== 0
    ) {
      throw new Error(`${label} missing evidence cannot carry source artifacts`);
    }
    nonEmptyString(component.missingReason, `${label}.missingReason`);
    if (temporalClassification === 'synthetic_fixture') {
      throw new Error(`${label} missing evidence cannot claim synthetic value`);
    }
    return;
  }

  if (references.length === 0 || products.length === 0) {
    throw new Error(`${label} non-missing evidence requires artifacts and products`);
  }
  const source = objectValue(component.source, `${label}.source`);
  const provider = nonEmptyString(source.provider, `${label}.source.provider`);
  const dataset = nonEmptyString(source.dataset, `${label}.source.dataset`);
  optionalNonEmptyString(source.datasetVersion, `${label}.source.datasetVersion`);
  nonEmptyString(component.temporalLineageMethod, `${label}.temporalLineageMethod`);

  if (sourceKind === 'synthetic_fixture') {
    if (
      status !== 'synthetic_fixture' ||
      temporalClassification !== 'synthetic_fixture' ||
      provider !== 'synthetic-fixture' ||
      !dataset.startsWith('fixture:')
    ) {
      throw new Error(`${label} synthetic evidence must retain fixture identity`);
    }
  } else if (
    status === 'synthetic_fixture' ||
    temporalClassification === 'synthetic_fixture'
  ) {
    throw new Error(`${label} external delivery cannot contain synthetic evidence`);
  }

  if (status === 'available' && temporalClassification !== 'pre_event') {
    throw new Error(`${label} available evidence must have verified pre-event lineage`);
  }
  if (status === 'available' && sourceDates.length === 0) {
    throw new Error(`${label} available evidence requires a dated pre-event lineage`);
  }
  if (
    temporalClassification === 'post_event_context_only' &&
    status !== 'context_only'
  ) {
    throw new Error(`${label} post-event material must remain context-only`);
  }
  if (['available', 'synthetic_fixture'].includes(status)) {
    if (component.missingReason !== undefined) {
      throw new Error(`${label} value-bearing evidence cannot carry missingReason`);
    }
  } else {
    nonEmptyString(component.missingReason, `${label}.missingReason`);
  }
}

function assertLicense(input: unknown): void {
  const license = objectValue(input, 'license');
  enumValue(
    license.access,
    ['open', 'restricted', 'permission_required', 'unknown'] as const,
    'license.access',
  );
  enumValue(
    license.redistribution,
    ['allowed', 'prohibited', 'unknown'] as const,
    'license.redistribution',
  );
  if (license.termsUrl !== undefined) {
    const url = nonEmptyString(license.termsUrl, 'license.termsUrl');
    if (!url.startsWith('https://')) throw new Error('license.termsUrl must use HTTPS');
  }
  optionalNonEmptyString(license.attribution, 'license.attribution');
}

function assertPolicy(input: unknown): void {
  const policy = objectValue(input, 'policy');
  assertExact(policy.product4Use, 'forbidden', 'policy.product4Use');
  assertExact(
    policy.observedEventGeometryUse,
    'forbidden',
    'policy.observedEventGeometryUse',
  );
  assertExact(
    policy.postEventModelInput,
    'forbidden',
    'policy.postEventModelInput',
  );
  assertExact(
    policy.missingValuePolicy,
    'block_not_zero_or_infer',
    'policy.missingValuePolicy',
  );
  assertExact(
    policy.automaticReplayPromotion,
    false,
    'policy.automaticReplayPromotion',
  );
  assertExact(
    policy.evaluationReferenceSeal,
    'must_remain_closed',
    'policy.evaluationReferenceSeal',
  );
}

function exactNumberArray(
  input: unknown,
  expected: readonly number[],
  label: string,
): void {
  const actual = uniqueIntegerArray(input, label);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} identities drifted`);
  }
}

function uniqueIntegerArray(input: unknown, label: string): number[] {
  const values = arrayValue(input, label, false).map((value, index) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new Error(`${label}[${index}] must be a safe integer`);
    }
    return value;
  });
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return values;
}

function uniqueStringArray(input: unknown, label: string): string[] {
  const values = arrayValue(input, label, false).map((value, index) =>
    nonEmptyString(value, `${label}[${index}]`),
  );
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return values;
}

function optionalStringArray(input: unknown, label: string): readonly string[] {
  return input === undefined ? [] : uniqueStringArray(input, label);
}

function portableRelativePath(input: unknown, label: string): string {
  const value = nonEmptyString(input, label);
  if (
    value.includes('\\') ||
    value.startsWith('/') ||
    value.includes('://') ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').some((part) => part === '' || part === '..')
  ) {
    throw new Error(`${label} must be a portable relative path`);
  }
  return value;
}

function arrayValue(
  input: unknown,
  label: string,
  requireNonEmpty = true,
): unknown[] {
  if (!Array.isArray(input) || (requireNonEmpty && input.length === 0)) {
    throw new Error(`${label} must be ${requireNonEmpty ? 'a non-empty' : 'an'} array`);
  }
  return input;
}

function objectValue(input: unknown, label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label} must be an object`);
  }
  return input as Record<string, unknown>;
}

function nonEmptyString(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return input;
}

function optionalNonEmptyString(
  input: unknown,
  label: string,
): string | undefined {
  return input === undefined ? undefined : nonEmptyString(input, label);
}

function isoTimestamp(input: unknown, label: string): string {
  const value = nonEmptyString(input, label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a timestamp`);
  return value;
}

function positiveInteger(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return input;
}

function sha256(input: unknown, label: string): string {
  if (typeof input !== 'string' || !/^[a-f0-9]{64}$/.test(input)) {
    throw new Error(`${label} must be lowercase SHA-256`);
  }
  return input;
}

function assertExact(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must equal ${JSON.stringify(expected)}`);
  }
}

function enumValue<const T extends readonly string[]>(
  input: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof input !== 'string' || !allowed.includes(input)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`);
  }
  return input as T[number];
}
