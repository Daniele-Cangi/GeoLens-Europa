export const ARPAE_HYDRAULIC_COMPONENT_IDS = [
  'antecedent_moisture_or_model_warmup',
  'montone_and_rabbi_inflow_hydrographs',
  'downstream_stage_or_discharge_boundary',
  'breach_location_timing_and_geometry',
  'embankment_crest_geometry',
  'bare_earth_terrain',
  'channel_geometry_and_roughness',
] as const;

export type ArpaeHydraulicComponentId =
  (typeof ARPAE_HYDRAULIC_COMPONENT_IDS)[number];

export type ArpaeHydraulicIntakeStatus =
  | 'missing'
  | 'received'
  | 'under_review'
  | 'verified'
  | 'rejected';

export type ArpaeHydraulicComponentStatus =
  | 'available'
  | 'incomplete_window'
  | 'missing'
  | 'metadata_only'
  | 'synthetic_fixture';

export interface ArpaeHydraulicArtifact {
  readonly id: string;
  readonly role:
    | 'time_series'
    | 'rating_relation'
    | 'spatial_geometry'
    | 'terrain'
    | 'hydraulic_model'
    | 'method_report'
    | 'metadata';
  readonly relativePath: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ArpaeHydraulicComponent {
  readonly id: ArpaeHydraulicComponentId;
  readonly status: ArpaeHydraulicComponentStatus;
  readonly artifactIds: readonly string[];
  readonly source: {
    readonly provider: string;
    readonly dataset: string;
    readonly datasetVersion?: string;
  } | null;
  readonly temporalCoverage?: {
    readonly windowStart: string;
    readonly windowEnd: string;
    readonly resolutionMinutes?: number;
  };
  readonly spatialCoverage?: {
    readonly crs: string;
    readonly sourceResolution: string;
    readonly scope: string;
  };
  readonly quantity?: {
    readonly unit: string;
    readonly verticalDatum?: string;
  };
  readonly coveredEntities?: readonly string[];
  readonly method?: string;
  readonly missingReason?: string;
  readonly derivedFromObservedExtent: false;
  readonly chartDigitized: false;
  readonly calibrationUse: 'forbidden';
}

export interface ArpaeHydraulicEvidencePackage {
  readonly schemaVersion: 'arpae-hydraulic-evidence-package-v0.1.0';
  readonly packageId: string;
  readonly benchmarkId:
    'emilia-romagna-2023-forli-retrospective-reconstruction';
  readonly sourceKind: 'external_delivery' | 'synthetic_fixture';
  readonly receivedAt: string;
  readonly authority: string;
  readonly deliveryReference: string;
  readonly event: {
    readonly windowStart: '2023-05-16T00:00:00Z';
    readonly windowEnd: '2023-05-18T00:00:00Z';
  };
  readonly license: {
    readonly access: 'open' | 'restricted' | 'permission_required' | 'unknown';
    readonly redistribution: 'allowed' | 'prohibited' | 'unknown';
    readonly termsUrl?: string;
    readonly attribution?: string;
  };
  readonly policy: {
    readonly observedExtentUse: 'forbidden';
    readonly calibration: 'not_performed';
    readonly missingValuePolicy: 'block_not_zero_or_infer';
  };
  readonly artifacts: readonly ArpaeHydraulicArtifact[];
  readonly components: readonly ArpaeHydraulicComponent[];
}

export interface ArpaeHydraulicReviewReceipt {
  readonly schemaVersion: 'arpae-hydraulic-evidence-review-v0.1.0';
  readonly packageId: string;
  readonly reviewedAt: string;
  readonly reviewer: string;
  readonly artifactIntegrity: 'verified';
  readonly licenseUseReviewed: true;
  readonly evaluationLeakageCheck: 'passed';
  readonly calibrationIsolationCheck: 'passed';
  readonly componentDecisions: readonly {
    readonly id: ArpaeHydraulicComponentId;
    readonly decision: 'accepted' | 'incomplete' | 'rejected';
    readonly reason: string;
  }[];
}

export interface ArpaeHydraulicValidationResult<T> {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly value: T | null;
}

export interface ArpaeHydraulicIntakeSummary {
  readonly schemaVersion: 'arpae-hydraulic-intake-status-v0.1.0';
  readonly validatorVersion:
    'arpae-hydraulic-evidence-validator-v0.1.0';
  readonly benchmarkId:
    'emilia-romagna-2023-forli-retrospective-reconstruction';
  readonly status: ArpaeHydraulicIntakeStatus;
  readonly packageId: string | null;
  readonly sourceKind:
    | ArpaeHydraulicEvidencePackage['sourceKind']
    | null;
  readonly receivedAt: string | null;
  readonly replayEligibility: 'blocked' | 'eligible';
  readonly blockingReasons: readonly string[];
  readonly validationErrors: readonly string[];
  readonly requiredComponents: readonly {
    readonly id: ArpaeHydraulicComponentId;
    readonly status: ArpaeHydraulicComponentStatus;
    readonly artifactCount: number;
    readonly reviewDecision:
      | 'not_reviewed'
      | 'accepted'
      | 'incomplete'
      | 'rejected';
    readonly reason: string | null;
  }[];
  readonly policy: {
    readonly originalFilesStayOutsideGit: true;
    readonly artifactIntegrityRequired: 'byte_count_and_sha256';
    readonly observedExtentUse: 'forbidden';
    readonly missingValuePolicy: 'block_not_zero_or_infer';
    readonly syntheticFixturesCanBecomeReplayEvidence: false;
  };
}

const BENCHMARK_ID =
  'emilia-romagna-2023-forli-retrospective-reconstruction' as const;
const EVENT_START = '2023-05-16T00:00:00Z' as const;
const EVENT_END = '2023-05-18T00:00:00Z' as const;
const componentIdSet: ReadonlySet<string> = new Set(
  ARPAE_HYDRAULIC_COMPONENT_IDS,
);

const missingReasons: Readonly<Record<ArpaeHydraulicComponentId, string>> = {
  antecedent_moisture_or_model_warmup:
    'No source-backed antecedent state or model warmup package has been received.',
  montone_and_rabbi_inflow_hydrographs:
    'No complete machine-readable Montone and Rabbi inflow package has been received.',
  downstream_stage_or_discharge_boundary:
    'No datum-resolved downstream stage or discharge boundary has been received.',
  breach_location_timing_and_geometry:
    'No source-backed breach location, timing and geometry package has been received.',
  embankment_crest_geometry:
    'No complete pre-event embankment crest geometry has been received.',
  bare_earth_terrain:
    'No complementary hydraulic-grade bare-earth terrain package has been received.',
  channel_geometry_and_roughness:
    'No numerical channel geometry and event-valid roughness package has been received.',
};

export function validateArpaeHydraulicEvidencePackage(
  input: unknown,
): ArpaeHydraulicValidationResult<ArpaeHydraulicEvidencePackage> {
  try {
    assertArpaeHydraulicEvidencePackage(input);
    return {
      ok: true,
      errors: [],
      value: input,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      value: null,
    };
  }
}

export function assertArpaeHydraulicEvidencePackage(
  input: unknown,
): asserts input is ArpaeHydraulicEvidencePackage {
  const raw = objectValue(input, 'ARPAE hydraulic evidence package');

  assertExact(
    'schemaVersion',
    raw.schemaVersion,
    'arpae-hydraulic-evidence-package-v0.1.0',
  );
  assertExact('benchmarkId', raw.benchmarkId, BENCHMARK_ID);
  const packageId = nonEmptyString(raw.packageId, 'packageId');
  const sourceKind = enumValue(
    raw.sourceKind,
    ['external_delivery', 'synthetic_fixture'] as const,
    'sourceKind',
  );
  assertIsoTimestamp(raw.receivedAt, 'receivedAt');
  const authority = nonEmptyString(raw.authority, 'authority');
  nonEmptyString(raw.deliveryReference, 'deliveryReference');

  if (sourceKind === 'synthetic_fixture') {
    if (!packageId.startsWith('fixture:') || authority !== 'synthetic-fixture') {
      throw new Error(
        'Synthetic hydraulic packages must use fixture identity and authority',
      );
    }
  } else if (
    packageId.startsWith('fixture:') ||
    authority !== 'ARPAE Emilia-Romagna'
  ) {
    throw new Error(
      'External hydraulic packages must identify ARPAE Emilia-Romagna as authority',
    );
  }

  const event = objectValue(raw.event, 'event');
  assertExact('event.windowStart', event.windowStart, EVENT_START);
  assertExact('event.windowEnd', event.windowEnd, EVENT_END);

  assertLicense(raw.license);
  assertPolicy(raw.policy);

  const artifacts = arrayValue(raw.artifacts, 'artifacts');
  const artifactIds = new Set<string>();
  artifacts.forEach((candidate, index) => {
    const artifact = objectValue(candidate, `artifacts[${index}]`);
    const id = nonEmptyString(artifact.id, `artifacts[${index}].id`);
    if (artifactIds.has(id)) {
      throw new Error(`Duplicate hydraulic artifact id "${id}"`);
    }
    artifactIds.add(id);
    enumValue(
      artifact.role,
      [
        'time_series',
        'rating_relation',
        'spatial_geometry',
        'terrain',
        'hydraulic_model',
        'method_report',
        'metadata',
      ] as const,
      `artifacts[${index}].role`,
    );
    assertPortableRelativePath(
      artifact.relativePath,
      `artifacts[${index}].relativePath`,
    );
    nonEmptyString(artifact.mediaType, `artifacts[${index}].mediaType`);
    positiveInteger(artifact.bytes, `artifacts[${index}].bytes`);
    if (
      typeof artifact.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    ) {
      throw new Error(`artifacts[${index}].sha256 must be lowercase SHA-256`);
    }
  });

  const components = arrayValue(raw.components, 'components');
  if (components.length !== ARPAE_HYDRAULIC_COMPONENT_IDS.length) {
    throw new Error('Hydraulic package must declare every required component');
  }
  const seenComponents = new Set<string>();
  components.forEach((candidate, index) => {
    const component = objectValue(candidate, `components[${index}]`);
    const id = enumValue(
      component.id,
      ARPAE_HYDRAULIC_COMPONENT_IDS,
      `components[${index}].id`,
    );
    if (seenComponents.has(id)) {
      throw new Error(`Duplicate hydraulic component id "${id}"`);
    }
    seenComponents.add(id);
    assertComponent(component, id, sourceKind, artifactIds, index);
  });
}

export function validateArpaeHydraulicReviewReceipt(
  input: unknown,
  evidencePackage: ArpaeHydraulicEvidencePackage,
): ArpaeHydraulicValidationResult<ArpaeHydraulicReviewReceipt> {
  try {
    assertArpaeHydraulicReviewReceipt(input, evidencePackage);
    return { ok: true, errors: [], value: input };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      value: null,
    };
  }
}

export function assertArpaeHydraulicReviewReceipt(
  input: unknown,
  evidencePackage: ArpaeHydraulicEvidencePackage,
): asserts input is ArpaeHydraulicReviewReceipt {
  const raw = objectValue(input, 'ARPAE hydraulic review receipt');
  assertExact(
    'review.schemaVersion',
    raw.schemaVersion,
    'arpae-hydraulic-evidence-review-v0.1.0',
  );
  assertExact('review.packageId', raw.packageId, evidencePackage.packageId);
  assertIsoTimestamp(raw.reviewedAt, 'review.reviewedAt');
  nonEmptyString(raw.reviewer, 'review.reviewer');
  assertExact('review.artifactIntegrity', raw.artifactIntegrity, 'verified');
  assertExact('review.licenseUseReviewed', raw.licenseUseReviewed, true);
  assertExact(
    'review.evaluationLeakageCheck',
    raw.evaluationLeakageCheck,
    'passed',
  );
  assertExact(
    'review.calibrationIsolationCheck',
    raw.calibrationIsolationCheck,
    'passed',
  );

  const decisions = arrayValue(
    raw.componentDecisions,
    'review.componentDecisions',
  );
  if (decisions.length !== ARPAE_HYDRAULIC_COMPONENT_IDS.length) {
    throw new Error('Hydraulic review must decide every required component');
  }
  const componentById = new Map(
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
      ARPAE_HYDRAULIC_COMPONENT_IDS,
      `review.componentDecisions[${index}].id`,
    );
    if (seen.has(id)) {
      throw new Error(`Duplicate hydraulic review decision for "${id}"`);
    }
    seen.add(id);
    const disposition = enumValue(
      decision.decision,
      ['accepted', 'incomplete', 'rejected'] as const,
      `review.componentDecisions[${index}].decision`,
    );
    nonEmptyString(
      decision.reason,
      `review.componentDecisions[${index}].reason`,
    );
    const component = componentById.get(id);
    if (
      disposition === 'accepted' &&
      component?.status !== 'available'
    ) {
      throw new Error(
        `Review cannot accept component "${id}" without available external evidence`,
      );
    }
  });
}

export function inspectArpaeHydraulicEvidenceIntake(
  input: unknown | null,
  reviewInput: unknown | null = null,
): ArpaeHydraulicIntakeSummary {
  if (input === null) {
    return missingIntakeSummary();
  }

  const packageValidation = validateArpaeHydraulicEvidencePackage(input);
  if (!packageValidation.ok || packageValidation.value === null) {
    return {
      ...missingIntakeSummary(),
      status: 'rejected',
      blockingReasons: [
        'The received package failed the fail-closed structural contract.',
      ],
      validationErrors: packageValidation.errors,
    };
  }

  const evidencePackage = packageValidation.value;
  const reviewValidation =
    reviewInput === null
      ? null
      : validateArpaeHydraulicReviewReceipt(reviewInput, evidencePackage);
  const review = reviewValidation?.value ?? null;
  const decisionById = new Map(
    review?.componentDecisions.map((decision) => [decision.id, decision]),
  );
  const hasRejectedDecision =
    review?.componentDecisions.some(
      (decision) => decision.decision === 'rejected',
    ) ?? false;
  const everyComponentAccepted =
    review !== null &&
    review.componentDecisions.every(
      (decision) => decision.decision === 'accepted',
    );
  const synthetic = evidencePackage.sourceKind === 'synthetic_fixture';
  const eligible = everyComponentAccepted && !synthetic;

  const blockingReasons: string[] = [];
  if (review === null) {
    blockingReasons.push(
      reviewValidation === null
        ? 'The received package has not completed GeoLens review.'
        : 'The review receipt is invalid and cannot promote the package.',
    );
  }
  if (synthetic) {
    blockingReasons.push(
      'Synthetic fixtures can verify the contract but can never become replay evidence.',
    );
  }
  for (const component of evidencePackage.components) {
    const decision = decisionById.get(component.id);
    if (decision?.decision !== 'accepted') {
      blockingReasons.push(
        decision?.reason ??
          component.missingReason ??
          `${component.id} has not been accepted for model use.`,
      );
    }
  }

  return {
    schemaVersion: 'arpae-hydraulic-intake-status-v0.1.0',
    validatorVersion: 'arpae-hydraulic-evidence-validator-v0.1.0',
    benchmarkId: BENCHMARK_ID,
    status: hasRejectedDecision
      ? 'rejected'
      : review !== null
        ? 'verified'
        : reviewValidation === null
          ? 'received'
          : 'under_review',
    packageId: evidencePackage.packageId,
    sourceKind: evidencePackage.sourceKind,
    receivedAt: evidencePackage.receivedAt,
    replayEligibility: eligible ? 'eligible' : 'blocked',
    blockingReasons,
    validationErrors: reviewValidation?.errors ?? [],
    requiredComponents: evidencePackage.components.map((component) => {
      const decision = decisionById.get(component.id);
      return {
        id: component.id,
        status: component.status,
        artifactCount: component.artifactIds.length,
        reviewDecision: decision?.decision ?? 'not_reviewed',
        reason: decision?.reason ?? component.missingReason ?? null,
      };
    }),
    policy: intakePolicy(),
  };
}

export const EMILIA_ARPAE_HYDRAULIC_EVIDENCE_INTAKE =
  inspectArpaeHydraulicEvidenceIntake(null);

function missingIntakeSummary(): ArpaeHydraulicIntakeSummary {
  return {
    schemaVersion: 'arpae-hydraulic-intake-status-v0.1.0',
    validatorVersion: 'arpae-hydraulic-evidence-validator-v0.1.0',
    benchmarkId: BENCHMARK_ID,
    status: 'missing',
    packageId: null,
    sourceKind: null,
    receivedAt: null,
    replayEligibility: 'blocked',
    blockingReasons: [
      'No ARPAE hydraulic evidence package has been received.',
    ],
    validationErrors: [],
    requiredComponents: ARPAE_HYDRAULIC_COMPONENT_IDS.map((id) => ({
      id,
      status: 'missing',
      artifactCount: 0,
      reviewDecision: 'not_reviewed',
      reason: missingReasons[id],
    })),
    policy: intakePolicy(),
  };
}

function intakePolicy(): ArpaeHydraulicIntakeSummary['policy'] {
  return {
    originalFilesStayOutsideGit: true,
    artifactIntegrityRequired: 'byte_count_and_sha256',
    observedExtentUse: 'forbidden',
    missingValuePolicy: 'block_not_zero_or_infer',
    syntheticFixturesCanBecomeReplayEvidence: false,
  };
}

function assertComponent(
  component: Record<string, unknown>,
  id: ArpaeHydraulicComponentId,
  sourceKind: ArpaeHydraulicEvidencePackage['sourceKind'],
  artifactIds: ReadonlySet<string>,
  index: number,
): void {
  const label = `components[${index}]`;
  const status = enumValue(
    component.status,
    [
      'available',
      'incomplete_window',
      'missing',
      'metadata_only',
      'synthetic_fixture',
    ] as const,
    `${label}.status`,
  );
  if (
    (sourceKind === 'synthetic_fixture' &&
      !['synthetic_fixture', 'missing'].includes(status)) ||
    (sourceKind === 'external_delivery' && status === 'synthetic_fixture')
  ) {
    throw new Error(`${label}.status is incompatible with package sourceKind`);
  }

  assertExact(
    `${label}.derivedFromObservedExtent`,
    component.derivedFromObservedExtent,
    false,
  );
  assertExact(`${label}.chartDigitized`, component.chartDigitized, false);
  assertExact(`${label}.calibrationUse`, component.calibrationUse, 'forbidden');

  const references = arrayValue(component.artifactIds, `${label}.artifactIds`).map(
    (value, referenceIndex) =>
      nonEmptyString(value, `${label}.artifactIds[${referenceIndex}]`),
  );
  if (new Set(references).size !== references.length) {
    throw new Error(`${label}.artifactIds must be unique`);
  }
  for (const reference of references) {
    if (!artifactIds.has(reference)) {
      throw new Error(`${label} references unknown artifact "${reference}"`);
    }
  }

  const source = component.source;
  const missingReason = component.missingReason;
  if (status === 'missing') {
    if (source !== null || references.length !== 0) {
      throw new Error(`${label} missing evidence cannot carry source artifacts`);
    }
    nonEmptyString(missingReason, `${label}.missingReason`);
    return;
  }

  const sourceRecord = objectValue(source, `${label}.source`);
  const provider = nonEmptyString(sourceRecord.provider, `${label}.source.provider`);
  const dataset = nonEmptyString(sourceRecord.dataset, `${label}.source.dataset`);
  if (sourceKind === 'synthetic_fixture') {
    if (provider !== 'synthetic-fixture' || !dataset.startsWith('fixture:')) {
      throw new Error(`${label} synthetic evidence must use fixture provenance`);
    }
  }
  optionalNonEmptyString(
    sourceRecord.datasetVersion,
    `${label}.source.datasetVersion`,
  );
  if (references.length === 0) {
    throw new Error(`${label} non-missing evidence must reference an artifact`);
  }

  if (status === 'available' || status === 'synthetic_fixture') {
    if (missingReason !== undefined) {
      throw new Error(`${label} value-bearing evidence cannot carry missingReason`);
    }
  } else {
    nonEmptyString(missingReason, `${label}.missingReason`);
  }

  const temporal = optionalTemporalCoverage(
    component.temporalCoverage,
    `${label}.temporalCoverage`,
  );
  const spatial = optionalSpatialCoverage(
    component.spatialCoverage,
    `${label}.spatialCoverage`,
  );
  const quantity = optionalQuantity(component.quantity, `${label}.quantity`);
  const entities = optionalStringArray(
    component.coveredEntities,
    `${label}.coveredEntities`,
  );
  optionalNonEmptyString(component.method, `${label}.method`);

  const complete = status === 'available' || status === 'synthetic_fixture';
  if (!complete) {
    return;
  }

  if (id === 'antecedent_moisture_or_model_warmup') {
    if (
      temporal === null ||
      Date.parse(temporal.windowStart) >= Date.parse(EVENT_START) ||
      Date.parse(temporal.windowEnd) < Date.parse(EVENT_START)
    ) {
      throw new Error(`${label} must cover a source-backed antecedent period`);
    }
  }

  if (id === 'montone_and_rabbi_inflow_hydrographs') {
    assertFullEventCoverage(temporal, label);
    if (quantity?.unit !== 'm3/s') {
      throw new Error(`${label} inflow hydrographs must use m3/s`);
    }
    if (!entities.includes('montone') || !entities.includes('rabbi')) {
      throw new Error(`${label} must cover both Montone and Rabbi`);
    }
  }

  if (id === 'downstream_stage_or_discharge_boundary') {
    assertFullEventCoverage(temporal, label);
    if (!quantity || !['m', 'm3/s'].includes(quantity.unit)) {
      throw new Error(`${label} downstream boundary must use m or m3/s`);
    }
    if (quantity.unit === 'm' && !quantity.verticalDatum) {
      throw new Error(`${label} stage boundary requires an explicit vertical datum`);
    }
  }

  if (id === 'breach_location_timing_and_geometry') {
    if (temporal === null || spatial === null) {
      throw new Error(`${label} breach evidence requires time and geometry`);
    }
  }

  if (
    [
      'embankment_crest_geometry',
      'bare_earth_terrain',
      'channel_geometry_and_roughness',
    ].includes(id) &&
    spatial === null
  ) {
    throw new Error(`${label} requires source-backed spatial coverage`);
  }

  if (
    id === 'channel_geometry_and_roughness' &&
    typeof component.method !== 'string'
  ) {
    throw new Error(`${label} requires an explicit geometry and roughness method`);
  }
}

function assertFullEventCoverage(
  temporal: NonNullable<ArpaeHydraulicComponent['temporalCoverage']> | null,
  label: string,
): void {
  if (
    temporal === null ||
    Date.parse(temporal.windowStart) > Date.parse(EVENT_START) ||
    Date.parse(temporal.windowEnd) < Date.parse(EVENT_END)
  ) {
    throw new Error(`${label} must cover the complete event window`);
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
    const termsUrl = nonEmptyString(license.termsUrl, 'license.termsUrl');
    if (!termsUrl.startsWith('https://')) {
      throw new Error('license.termsUrl must use HTTPS');
    }
  }
  optionalNonEmptyString(license.attribution, 'license.attribution');
}

function assertPolicy(input: unknown): void {
  const policy = objectValue(input, 'policy');
  assertExact('policy.observedExtentUse', policy.observedExtentUse, 'forbidden');
  assertExact('policy.calibration', policy.calibration, 'not_performed');
  assertExact(
    'policy.missingValuePolicy',
    policy.missingValuePolicy,
    'block_not_zero_or_infer',
  );
}

function optionalTemporalCoverage(
  input: unknown,
  label: string,
): NonNullable<ArpaeHydraulicComponent['temporalCoverage']> | null {
  if (input === undefined) {
    return null;
  }
  const temporal = objectValue(input, label);
  const windowStart = assertIsoTimestamp(temporal.windowStart, `${label}.windowStart`);
  const windowEnd = assertIsoTimestamp(temporal.windowEnd, `${label}.windowEnd`);
  if (Date.parse(windowStart) > Date.parse(windowEnd)) {
    throw new Error(`${label}.windowStart must not be after windowEnd`);
  }
  const resolutionMinutes =
    temporal.resolutionMinutes === undefined
      ? undefined
      : positiveNumber(temporal.resolutionMinutes, `${label}.resolutionMinutes`);
  return { windowStart, windowEnd, resolutionMinutes };
}

function optionalSpatialCoverage(
  input: unknown,
  label: string,
): NonNullable<ArpaeHydraulicComponent['spatialCoverage']> | null {
  if (input === undefined) {
    return null;
  }
  const spatial = objectValue(input, label);
  return {
    crs: nonEmptyString(spatial.crs, `${label}.crs`),
    sourceResolution: nonEmptyString(
      spatial.sourceResolution,
      `${label}.sourceResolution`,
    ),
    scope: nonEmptyString(spatial.scope, `${label}.scope`),
  };
}

function optionalQuantity(
  input: unknown,
  label: string,
): NonNullable<ArpaeHydraulicComponent['quantity']> | null {
  if (input === undefined) {
    return null;
  }
  const quantity = objectValue(input, label);
  const verticalDatum = optionalNonEmptyString(
    quantity.verticalDatum,
    `${label}.verticalDatum`,
  );
  return {
    unit: nonEmptyString(quantity.unit, `${label}.unit`),
    verticalDatum,
  };
}

function optionalStringArray(input: unknown, label: string): readonly string[] {
  if (input === undefined) {
    return [];
  }
  const values = arrayValue(input, label).map((value, index) =>
    nonEmptyString(value, `${label}[${index}]`),
  );
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return values;
}

function assertPortableRelativePath(input: unknown, label: string): void {
  const value = nonEmptyString(input, label);
  if (
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').includes('..')
  ) {
    throw new Error(`${label} must be a portable relative path`);
  }
}

function objectValue(input: unknown, label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label} must be an object`);
  }
  return input as Record<string, unknown>;
}

function arrayValue(input: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(input)) {
    throw new Error(`${label} must be an array`);
  }
  return input;
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

function assertIsoTimestamp(input: unknown, label: string): string {
  const value = nonEmptyString(input, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return value;
}

function positiveInteger(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return input;
}

function positiveNumber(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return input;
}

function assertExact(label: string, actual: unknown, expected: unknown): void {
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
