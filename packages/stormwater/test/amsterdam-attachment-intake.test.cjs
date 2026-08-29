const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const {
  AMSTERDAM_SURFACE_NETWORK_ATTACHMENT_INTAKE,
  inspectAmsterdamAttachmentIntake,
  validateAmsterdamAttachmentDeliveryPackage,
  validateAmsterdamAttachmentReviewReceipt,
} = require('../dist');

const receivedAt = '2026-08-29T12:00:00Z';

function artifact(id = 'inlooptabel') {
  return {
    id,
    role: 'source_table',
    relativePath: `deliveries/${id}.json`,
    mediaType: 'application/json',
    bytes: 256,
    sha256: createHash('sha256').update(id).digest('hex'),
  };
}

function source(sourceKind, recordId) {
  const synthetic = sourceKind === 'synthetic_fixture';
  return {
    origin: synthetic ? 'synthetic_fixture' : 'observed_public_record',
    provider: synthetic ? 'synthetic-fixture' : 'Amsterdam Waternet',
    dataset: synthetic
      ? 'fixture:amsterdam-attachment-intake'
      : 'BGT Inlooptabel Amsterdam',
    datasetVersion: 'STOWA-2025-02',
    sourceRecordId: recordId,
    acquiredAt: receivedAt,
    sourceCrs: 'EPSG:28992',
    outputCrs: 'EPSG:4326',
    transformation: 'bounded delivery normalization',
    transformationVersion: 'amsterdam-delivery-normalizer-v0.1.0',
  };
}

function record(sourceKind = 'external_delivery') {
  return {
    id: 'inflow-row-1',
    bgtIdentification: 'NL.IMGeo.Pand.001',
    lastModified: '2026-08-28T10:00:00Z',
    manuallyModified: true,
    publisherRole: 'network_owner_or_authorized_delegate',
    percentages: {
      combinedSewer: 0,
      stormwaterSewer: 70,
      improvedStormwaterSewer: 0,
      wastewaterSewer: 0,
      infiltrationFacility: 0,
      openWater: 30,
      surface: 0,
    },
    networkAssetCodes: {
      stormwaterSewer: '8522CE11-8DC1-41CC-9375-EDECAB742620',
    },
    source: source(sourceKind, 'inflow-row-1'),
  };
}

function delivery(sourceKind = 'external_delivery') {
  return {
    schemaVersion:
      'amsterdam-surface-network-attachment-package-v0.1.0',
    packageId: `package:${sourceKind}`,
    proofId: 'amsterdam-waternet-observed-proof',
    sourceKind,
    receivedAt,
    deliveryReference: `fixture:${sourceKind}`,
    authority: {
      name:
        sourceKind === 'synthetic_fixture'
          ? 'synthetic-fixture'
          : 'Amsterdam Waternet',
      role: 'network_owner_or_authorized_delegate',
    },
    relation: {
      kind: 'bgt_inflow_table',
      standard: 'STOWA-2025-02',
      recordArtifactIds: ['inlooptabel'],
      records: [record(sourceKind)],
    },
    boundedSelection: {
      crs: 'EPSG:4326',
      latMin: 52.3375,
      lonMin: 4.8978,
      latMax: 52.3395,
      lonMax: 4.8995,
      selectionMethod: 'intersects bounded observed-proof bbox',
    },
    license: {
      access: 'unknown',
      redistribution: 'unknown',
    },
    policy: {
      identifierMatch: 'exact_only',
      proximityInference: 'forbidden',
      conditionedProxyPromotion: 'forbidden',
      missingValuePolicy: 'block_not_infer',
    },
    artifacts: [artifact()],
  };
}

function review(packageId, decision = 'accepted') {
  return {
    schemaVersion:
      'amsterdam-surface-network-attachment-review-v0.1.0',
    packageId,
    reviewedAt: '2026-08-29T13:00:00Z',
    reviewer: 'GeoLens contract test',
    artifactIntegrity: 'verified',
    publisherAuthorityCheck: 'passed',
    licenseUseReviewed: true,
    relationSemanticsCheck: 'passed',
    decision,
    reason:
      decision === 'accepted'
        ? 'Package is ready for a separate exact topology match.'
        : 'Package is not authoritative for the bounded proof.',
  };
}

test('missing Amsterdam delivery remains explicit and blocks propagation', () => {
  const intake = AMSTERDAM_SURFACE_NETWORK_ATTACHMENT_INTAKE;

  assert.equal(intake.status, 'missing');
  assert.equal(intake.packageId, null);
  assert.equal(intake.recordCount, 0);
  assert.equal(intake.attachmentAssessmentEligibility, 'blocked');
  assert.equal(intake.propagationEligibility, 'blocked');
  assert.equal(intake.policy.identifierMatch, 'exact_only');
  assert.equal(intake.policy.conditionedProxyCanBecomeObserved, false);
  assert.equal(intake.policy.syntheticFixturesCanBecomeObserved, false);
  assert.equal(intake.policy.originalFilesStayOutsideGit, true);
});

test('valid external delivery is received but not silently promoted', () => {
  const input = delivery();
  const validation = validateAmsterdamAttachmentDeliveryPackage(input);
  const intake = inspectAmsterdamAttachmentIntake(input);

  assert.equal(validation.ok, true);
  assert.equal(intake.status, 'received');
  assert.equal(intake.recordCount, 1);
  assert.equal(intake.artifactCount, 1);
  assert.equal(intake.attachmentAssessmentEligibility, 'blocked');
  assert.equal(intake.propagationEligibility, 'blocked');
});

test('reviewed external delivery becomes ready only for exact topology assessment', () => {
  const input = delivery();
  const intake = inspectAmsterdamAttachmentIntake(
    input,
    review(input.packageId),
  );

  assert.equal(intake.status, 'verified');
  assert.equal(
    intake.attachmentAssessmentEligibility,
    'ready_for_exact_observed_topology_match',
  );
  assert.equal(intake.propagationEligibility, 'blocked');
  assert.ok(
    intake.blockingReasons.some((reason) =>
      reason.includes('exact unique identifier match'),
    ),
  );
});

test('synthetic fixture verifies package shape but cannot become observed evidence', () => {
  const input = delivery('synthetic_fixture');
  const validation = validateAmsterdamAttachmentDeliveryPackage(input);
  const intake = inspectAmsterdamAttachmentIntake(input);
  const acceptedReview = validateAmsterdamAttachmentReviewReceipt(
    review(input.packageId),
    input,
  );

  assert.equal(validation.ok, true);
  assert.equal(intake.status, 'received');
  assert.equal(intake.attachmentAssessmentEligibility, 'blocked');
  assert.equal(acceptedReview.ok, false);
  assert.match(acceptedReview.errors[0], /Synthetic fixtures cannot be accepted/);
});

test('source kind and record provenance cannot disagree', () => {
  const input = delivery();
  input.relation.records[0].source = source(
    'synthetic_fixture',
    'inflow-row-1',
  );

  const validation = validateAmsterdamAttachmentDeliveryPackage(input);

  assert.equal(validation.ok, false);
  assert.match(validation.errors[0], /observed_public_record/);
});

test('unsafe artifact paths and unknown record artifacts are rejected', () => {
  const unsafe = delivery();
  unsafe.artifacts[0].relativePath = '../outside.json';
  const unknown = delivery();
  unknown.relation.recordArtifactIds = ['not-delivered'];

  assert.match(
    validateAmsterdamAttachmentDeliveryPackage(unsafe).errors[0],
    /portable relative path/,
  );
  assert.match(
    validateAmsterdamAttachmentDeliveryPackage(unknown).errors[0],
    /unknown artifact/,
  );
});

test('proximity inference and conditioned-proxy promotion remain forbidden', () => {
  const proximity = delivery();
  proximity.policy.proximityInference = 'allowed';
  const proxy = delivery();
  proxy.policy.conditionedProxyPromotion = 'allowed';

  assert.match(
    validateAmsterdamAttachmentDeliveryPackage(proximity).errors[0],
    /proximityInference must equal forbidden/,
  );
  assert.match(
    validateAmsterdamAttachmentDeliveryPackage(proxy).errors[0],
    /conditionedProxyPromotion must equal forbidden/,
  );
});

test('invalid review remains under review and cannot promote the package', () => {
  const input = delivery();
  const invalidReview = review(input.packageId);
  invalidReview.artifactIntegrity = 'unchecked';

  const intake = inspectAmsterdamAttachmentIntake(input, invalidReview);

  assert.equal(intake.status, 'under_review');
  assert.equal(intake.attachmentAssessmentEligibility, 'blocked');
  assert.match(intake.validationErrors[0], /artifactIntegrity/);
});
