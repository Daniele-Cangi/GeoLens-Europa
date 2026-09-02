const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CUMBRIA_EXCLUDED_MODEL_GROUP_IDS,
  CUMBRIA_MODEL_COMPONENT_IDS,
  CUMBRIA_MODEL_EVIDENCE_INTAKE,
  CUMBRIA_MODEL_GROUP_IDS,
  inspectCumbriaModelEvidenceIntake,
  validateCumbriaModelEvidencePackage,
  validateCumbriaModelReviewReceipt,
} = require('../dist');

const sha256 = 'a'.repeat(64);

function completePackage(sourceKind = 'external_delivery') {
  const synthetic = sourceKind === 'synthetic_fixture';
  return {
    schemaVersion: 'cumbria-ea-model-evidence-package-v0.1.0',
    packageId: synthetic ? 'fixture:cumbria-model-delivery' : 'ea:carlisle:delivery-001',
    caseId: 'cumbria-2015-carlisle-replay',
    requestId: 'cumbria-carlisle-pre-event-model-products-5-6-7-v0',
    sourceKind,
    receivedAt: '2026-09-02T10:00:00Z',
    authority: synthetic ? 'synthetic-fixture' : 'Environment Agency',
    deliveryReference: synthetic ? 'fixture-only' : 'EA correspondence reference 001',
    requestedProductNumbers: [5, 6, 7],
    requestedModelGroupIds: [...CUMBRIA_MODEL_GROUP_IDS],
    excludedModelGroupIds: [...CUMBRIA_EXCLUDED_MODEL_GROUP_IDS],
    license: {
      access: 'permission_required',
      redistribution: 'unknown',
    },
    policy: {
      product4Use: 'forbidden',
      observedEventGeometryUse: 'forbidden',
      postEventModelInput: 'forbidden',
      missingValuePolicy: 'block_not_zero_or_infer',
      automaticReplayPromotion: false,
      evaluationReferenceSeal: 'must_remain_closed',
    },
    artifacts: [
      {
        id: 'delivery-archive',
        role: 'delivery_archive',
        relativePath: 'delivery/carlisle-products-5-6-7.zip',
        mediaType: 'application/zip',
        bytes: 1024,
        sha256,
      },
    ],
    components: CUMBRIA_MODEL_COMPONENT_IDS.map((id) => ({
      id,
      requirement: [
        'model_and_hydrology_reports',
        'pre_event_model_outputs',
        'development_and_change_logs',
      ].includes(id)
        ? 'supporting'
        : 'required_for_gate_assessment',
      status: synthetic ? 'synthetic_fixture' : 'available',
      artifactIds: ['delivery-archive'],
      productNumbers: [5, 6, 7],
      modelGroupIds: [...CUMBRIA_MODEL_GROUP_IDS],
      source: {
        provider: synthetic ? 'synthetic-fixture' : 'Environment Agency',
        dataset: synthetic ? `fixture:${id}` : `Carlisle archived model: ${id}`,
      },
      temporalClassification: synthetic ? 'synthetic_fixture' : 'pre_event',
      sourceDates: synthetic ? [] : ['2011-11-22'],
      temporalLineageMethod: synthetic
        ? 'synthetic fixture only'
        : 'Environment Agency delivery metadata and source file dates',
      observedEventGeometryIncluded: false,
      derivedFromEvaluationReference: false,
      calibrationUse: 'forbidden',
      automaticPromotion: false,
    })),
  };
}

function acceptedReview(evidencePackage) {
  return {
    schemaVersion: 'cumbria-ea-model-evidence-review-v0.1.0',
    packageId: evidencePackage.packageId,
    reviewedAt: '2026-09-02T11:00:00Z',
    reviewer: 'GeoLens evidence review',
    artifactIntegrity: 'verified',
    licenseUseReviewed: true,
    temporalLineageCheck: 'passed',
    productAndModelGroupCheck: 'passed',
    crsUnitsDatumCheck: 'passed',
    evaluationLeakageCheck: 'passed',
    referenceSealCheck: 'passed',
    componentDecisions: CUMBRIA_MODEL_COMPONENT_IDS.map((id) => ({
      id,
      decision: 'accepted_candidate',
      reason: 'Fixture declares complete pre-event evidence for contract verification.',
    })),
  };
}

test('missing Environment Agency delivery remains explicit and replay-blocking', () => {
  assert.equal(CUMBRIA_MODEL_EVIDENCE_INTAKE.status, 'missing');
  assert.equal(CUMBRIA_MODEL_EVIDENCE_INTAKE.replayEligibility, 'blocked');
  assert.equal(
    CUMBRIA_MODEL_EVIDENCE_INTAKE.hydraulicContextAssessment,
    'blocked',
  );
  assert.equal(
    CUMBRIA_MODEL_EVIDENCE_INTAKE.requiredComponents.length,
    CUMBRIA_MODEL_COMPONENT_IDS.length,
  );
  assert.ok(
    CUMBRIA_MODEL_EVIDENCE_INTAKE.requiredComponents.every(
      (component) => component.status === 'missing',
    ),
  );
});

test('structurally valid delivery is received but cannot promote itself', () => {
  const evidencePackage = completePackage();
  const validation = validateCumbriaModelEvidencePackage(evidencePackage);
  const summary = inspectCumbriaModelEvidenceIntake(evidencePackage);

  assert.equal(validation.ok, true);
  assert.equal(summary.status, 'received');
  assert.equal(summary.hydraulicContextAssessment, 'blocked');
  assert.equal(summary.replayEligibility, 'blocked');
  assert.equal(summary.policy.automaticReplayPromotion, false);
  assert.ok(summary.blockingReasons.some((reason) => /component-level/.test(reason)));
});

test('reviewed required components become candidates, never automatic replay evidence', () => {
  const evidencePackage = completePackage();
  const review = acceptedReview(evidencePackage);
  const reviewValidation = validateCumbriaModelReviewReceipt(review, evidencePackage);
  const summary = inspectCumbriaModelEvidenceIntake(evidencePackage, review);

  assert.equal(reviewValidation.ok, true);
  assert.equal(summary.status, 'verified');
  assert.equal(summary.hydraulicContextAssessment, 'ready_for_assessment');
  assert.equal(summary.replayEligibility, 'blocked');
  assert.ok(summary.blockingReasons.some((reason) => /separate physical-gate/.test(reason)));
});

test('reviewed but incomplete required evidence remains under review', () => {
  const evidencePackage = completePackage();
  const component = evidencePackage.components.find(
    (candidate) => candidate.id === 'roughness_and_parameter_definitions',
  );
  component.status = 'incomplete';
  component.missingReason = 'Some model reaches have no attributable roughness value.';
  const review = acceptedReview(evidencePackage);
  const decision = review.componentDecisions.find(
    (candidate) => candidate.id === component.id,
  );
  decision.decision = 'incomplete';
  decision.reason = component.missingReason;

  assert.equal(validateCumbriaModelReviewReceipt(review, evidencePackage).ok, true);
  const summary = inspectCumbriaModelEvidenceIntake(evidencePackage, review);
  assert.equal(summary.status, 'under_review');
  assert.equal(summary.hydraulicContextAssessment, 'blocked');
  assert.equal(summary.replayEligibility, 'blocked');
});

test('synthetic package can verify shape but cannot pass candidate review', () => {
  const evidencePackage = completePackage('synthetic_fixture');
  assert.equal(validateCumbriaModelEvidencePackage(evidencePackage).ok, true);

  const review = acceptedReview(evidencePackage);
  const validation = validateCumbriaModelReviewReceipt(review, evidencePackage);
  const summary = inspectCumbriaModelEvidenceIntake(evidencePackage, review);

  assert.equal(validation.ok, false);
  assert.match(validation.errors[0], /pre-event external evidence/);
  assert.equal(summary.status, 'under_review');
  assert.equal(summary.hydraulicContextAssessment, 'blocked');
  assert.equal(summary.replayEligibility, 'blocked');
});

test('excluded model groups, Product 4 and evaluation geometry are rejected', () => {
  const postEventGroup = completePackage();
  postEventGroup.components[0].modelGroupIds = [2039];
  assert.match(
    validateCumbriaModelEvidencePackage(postEventGroup).errors[0],
    /post-event excluded group/,
  );

  const product4 = completePackage();
  product4.components[0].productNumbers = [4];
  assert.match(
    validateCumbriaModelEvidencePackage(product4).errors[0],
    /unrequested product/,
  );

  const leakedGeometry = completePackage();
  leakedGeometry.components[0].observedEventGeometryIncluded = true;
  assert.match(
    validateCumbriaModelEvidencePackage(leakedGeometry).errors[0],
    /observedEventGeometryIncluded/,
  );
});

test('available model evidence requires dated and genuinely pre-event lineage', () => {
  const undated = completePackage();
  undated.components[0].sourceDates = [];
  assert.match(
    validateCumbriaModelEvidencePackage(undated).errors[0],
    /requires a dated pre-event lineage/,
  );

  const postEventDated = completePackage();
  postEventDated.components[0].sourceDates = ['2016-01-15'];
  assert.match(
    validateCumbriaModelEvidencePackage(postEventDated).errors[0],
    /contains a non-pre-event date/,
  );

  const hostTimezoneDependent = completePackage();
  hostTimezoneDependent.components[0].sourceDates = ['2011-11-22T10:00:00'];
  assert.match(
    validateCumbriaModelEvidencePackage(hostTimezoneDependent).errors[0],
    /time-zone-qualified timestamp/,
  );

  const explicitOffset = completePackage();
  explicitOffset.components[0].sourceDates = ['2011-11-22T10:00:00+01:00'];
  assert.equal(validateCumbriaModelEvidencePackage(explicitOffset).ok, true);

  for (const impossibleDate of ['2011-02-29', '2011-04-31']) {
    const impossibleCalendarDate = completePackage();
    impossibleCalendarDate.components[0].sourceDates = [impossibleDate];
    assert.match(
      validateCumbriaModelEvidencePackage(impossibleCalendarDate).errors[0],
      /must be a real calendar date/,
    );
  }

  const impossibleTimestamp = completePackage();
  impossibleTimestamp.components[0].sourceDates = ['2011-02-29T10:00:00Z'];
  assert.match(
    validateCumbriaModelEvidencePackage(impossibleTimestamp).errors[0],
    /must be a real calendar date/,
  );
});

test('every delivered artifact must have one unique path and a component classification', () => {
  const unclassified = completePackage();
  unclassified.artifacts.push({
    id: 'unclassified-file',
    role: 'other_metadata',
    relativePath: 'delivery/unclassified.bin',
    mediaType: 'application/octet-stream',
    bytes: 1,
    sha256: 'b'.repeat(64),
  });
  assert.match(
    validateCumbriaModelEvidencePackage(unclassified).errors[0],
    /is not classified/,
  );

  const duplicatePath = completePackage();
  duplicatePath.artifacts.push({
    id: 'alias-file',
    role: 'other_metadata',
    relativePath: duplicatePath.artifacts[0].relativePath,
    mediaType: 'application/octet-stream',
    bytes: 1,
    sha256: 'b'.repeat(64),
  });
  assert.match(
    validateCumbriaModelEvidencePackage(duplicatePath).errors[0],
    /Duplicate Cumbria model artifact path/,
  );
});

test('missing components cannot carry artifacts or be accepted by review', () => {
  const evidencePackage = completePackage();
  const component = evidencePackage.components.find(
    (candidate) => candidate.id === 'boundary_condition_definitions_and_source_records',
  );
  component.status = 'missing';
  component.artifactIds = [];
  component.productNumbers = [];
  component.modelGroupIds = [];
  component.source = null;
  component.temporalClassification = 'undated_requires_review';
  component.sourceDates = [];
  delete component.temporalLineageMethod;
  component.missingReason = 'Downstream boundary values were not delivered.';

  assert.equal(validateCumbriaModelEvidencePackage(evidencePackage).ok, true);
  const review = acceptedReview(evidencePackage);
  assert.match(
    validateCumbriaModelReviewReceipt(review, evidencePackage).errors[0],
    /without available pre-event external evidence/,
  );
});

test('review must preserve the sealed evaluation boundary', () => {
  const evidencePackage = completePackage();
  const review = acceptedReview(evidencePackage);
  review.referenceSealCheck = 'failed';

  const validation = validateCumbriaModelReviewReceipt(review, evidencePackage);
  assert.equal(validation.ok, false);
  assert.match(validation.errors[0], /review.referenceSealCheck/);
});
