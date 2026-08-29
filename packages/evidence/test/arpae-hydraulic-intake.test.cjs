const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const {
  ARPAE_HYDRAULIC_COMPONENT_IDS,
  EMILIA_ARPAE_HYDRAULIC_EVIDENCE_INTAKE,
  inspectArpaeHydraulicEvidenceIntake,
  validateArpaeHydraulicEvidencePackage,
  validateArpaeHydraulicReviewReceipt,
} = require('../dist');

function artifact(id, role) {
  return {
    id,
    role,
    relativePath: `fixtures/${id}.json`,
    mediaType: 'application/json',
    bytes: 128,
    sha256: createHash('sha256').update(id).digest('hex'),
  };
}

function fixtureComponent(id, overrides = {}) {
  return {
    id,
    status: 'synthetic_fixture',
    artifactIds: [id],
    source: {
      provider: 'synthetic-fixture',
      dataset: `fixture:${id}`,
      datasetVersion: 'v1',
    },
    method: 'deterministic contract fixture',
    derivedFromObservedExtent: false,
    chartDigitized: false,
    calibrationUse: 'forbidden',
    ...overrides,
  };
}

function hydraulicFixturePackage() {
  const artifacts = [
    artifact('antecedent', 'time_series'),
    artifact('inflows', 'time_series'),
    artifact('downstream', 'time_series'),
    artifact('breaches', 'spatial_geometry'),
    artifact('crests', 'spatial_geometry'),
    artifact('terrain', 'terrain'),
    artifact('channel', 'hydraulic_model'),
  ];

  return {
    schemaVersion: 'arpae-hydraulic-evidence-package-v0.1.0',
    packageId: 'fixture:arpae-hydraulic-complete',
    benchmarkId:
      'emilia-romagna-2023-forli-retrospective-reconstruction',
    sourceKind: 'synthetic_fixture',
    receivedAt: '2026-08-29T10:00:00Z',
    authority: 'synthetic-fixture',
    deliveryReference: 'fixture:contract-test',
    event: {
      windowStart: '2023-05-16T00:00:00Z',
      windowEnd: '2023-05-18T00:00:00Z',
    },
    license: {
      access: 'unknown',
      redistribution: 'unknown',
    },
    policy: {
      observedExtentUse: 'forbidden',
      calibration: 'not_performed',
      missingValuePolicy: 'block_not_zero_or_infer',
    },
    artifacts,
    components: [
      fixtureComponent('antecedent_moisture_or_model_warmup', {
        artifactIds: ['antecedent'],
        temporalCoverage: {
          windowStart: '2023-05-01T00:00:00Z',
          windowEnd: '2023-05-16T00:00:00Z',
          resolutionMinutes: 60,
        },
      }),
      fixtureComponent('montone_and_rabbi_inflow_hydrographs', {
        artifactIds: ['inflows'],
        temporalCoverage: {
          windowStart: '2023-05-16T00:00:00Z',
          windowEnd: '2023-05-18T00:00:00Z',
          resolutionMinutes: 15,
        },
        quantity: { unit: 'm3/s' },
        coveredEntities: ['montone', 'rabbi'],
      }),
      fixtureComponent('downstream_stage_or_discharge_boundary', {
        artifactIds: ['downstream'],
        temporalCoverage: {
          windowStart: '2023-05-16T00:00:00Z',
          windowEnd: '2023-05-18T00:00:00Z',
          resolutionMinutes: 15,
        },
        quantity: {
          unit: 'm',
          verticalDatum: 'fixture-local-datum',
        },
      }),
      fixtureComponent('breach_location_timing_and_geometry', {
        artifactIds: ['breaches'],
        temporalCoverage: {
          windowStart: '2023-05-16T00:00:00Z',
          windowEnd: '2023-05-18T00:00:00Z',
        },
        spatialCoverage: {
          crs: 'EPSG:32632',
          sourceResolution: 'fixture vector',
          scope: 'bounded Forli pilot',
        },
      }),
      fixtureComponent('embankment_crest_geometry', {
        artifactIds: ['crests'],
        spatialCoverage: {
          crs: 'EPSG:32632',
          sourceResolution: 'fixture vector',
          scope: 'bounded Forli pilot',
        },
      }),
      fixtureComponent('bare_earth_terrain', {
        artifactIds: ['terrain'],
        spatialCoverage: {
          crs: 'EPSG:32632',
          sourceResolution: 'fixture 1 m grid',
          scope: 'bounded Forli pilot',
        },
      }),
      fixtureComponent('channel_geometry_and_roughness', {
        artifactIds: ['channel'],
        spatialCoverage: {
          crs: 'EPSG:32632',
          sourceResolution: 'fixture cross sections',
          scope: 'Montone and Rabbi model reaches',
        },
        method: 'fixture cross sections with explicit roughness table',
      }),
    ],
  };
}

function reviewFixture(packageId, decision = 'incomplete') {
  return {
    schemaVersion: 'arpae-hydraulic-evidence-review-v0.1.0',
    packageId,
    reviewedAt: '2026-08-29T11:00:00Z',
    reviewer: 'GeoLens fixture reviewer',
    artifactIntegrity: 'verified',
    licenseUseReviewed: true,
    evaluationLeakageCheck: 'passed',
    calibrationIsolationCheck: 'passed',
    componentDecisions: ARPAE_HYDRAULIC_COMPONENT_IDS.map((id) => ({
      id,
      decision,
      reason: 'Contract fixture cannot become real replay evidence.',
    })),
  };
}

test('missing ARPAE delivery remains explicit and blocks the replay', () => {
  const intake = EMILIA_ARPAE_HYDRAULIC_EVIDENCE_INTAKE;

  assert.equal(intake.status, 'missing');
  assert.equal(intake.packageId, null);
  assert.equal(intake.replayEligibility, 'blocked');
  assert.equal(
    intake.requiredComponents.length,
    ARPAE_HYDRAULIC_COMPONENT_IDS.length,
  );
  assert.ok(
    intake.requiredComponents.every(
      (component) =>
        component.status === 'missing' &&
        component.artifactCount === 0 &&
        component.reason,
    ),
  );
  assert.equal(intake.policy.originalFilesStayOutsideGit, true);
  assert.equal(
    intake.policy.syntheticFixturesCanBecomeReplayEvidence,
    false,
  );
});

test('synthetic fixture verifies contract shape but never becomes replay evidence', () => {
  const evidencePackage = hydraulicFixturePackage();
  const validation = validateArpaeHydraulicEvidencePackage(evidencePackage);
  const intake = inspectArpaeHydraulicEvidenceIntake(evidencePackage);

  assert.equal(validation.ok, true);
  assert.equal(intake.status, 'received');
  assert.equal(intake.sourceKind, 'synthetic_fixture');
  assert.equal(intake.replayEligibility, 'blocked');
  assert.ok(
    intake.blockingReasons.some((reason) => reason.includes('Synthetic')),
  );
});

test('a component can remain explicitly missing without receiving a value or artifact', () => {
  const evidencePackage = hydraulicFixturePackage();
  evidencePackage.components[0] = {
    id: 'antecedent_moisture_or_model_warmup',
    status: 'missing',
    artifactIds: [],
    source: null,
    missingReason: 'The delivery contains no antecedent-state record.',
    derivedFromObservedExtent: false,
    chartDigitized: false,
    calibrationUse: 'forbidden',
  };

  const validation = validateArpaeHydraulicEvidencePackage(evidencePackage);
  const intake = inspectArpaeHydraulicEvidenceIntake(evidencePackage);

  assert.equal(validation.ok, true);
  assert.equal(intake.requiredComponents[0].status, 'missing');
  assert.equal(intake.requiredComponents[0].artifactCount, 0);
  assert.equal(intake.replayEligibility, 'blocked');
});

test('package rejects observed-extent leakage, digitized charts and calibration use', () => {
  const leaked = hydraulicFixturePackage();
  leaked.components[1].derivedFromObservedExtent = true;
  assert.match(
    validateArpaeHydraulicEvidencePackage(leaked).errors[0],
    /derivedFromObservedExtent must equal false/,
  );

  const digitized = hydraulicFixturePackage();
  digitized.components[1].chartDigitized = true;
  assert.match(
    validateArpaeHydraulicEvidencePackage(digitized).errors[0],
    /chartDigitized must equal false/,
  );

  const calibrated = hydraulicFixturePackage();
  calibrated.policy.calibration = 'performed';
  assert.match(
    validateArpaeHydraulicEvidencePackage(calibrated).errors[0],
    /policy.calibration must equal "not_performed"/,
  );
});

test('package rejects unsafe artifact identity and unknown references', () => {
  const absolutePath = hydraulicFixturePackage();
  absolutePath.artifacts[0].relativePath = 'C:/private/antecedent.csv';
  assert.match(
    validateArpaeHydraulicEvidencePackage(absolutePath).errors[0],
    /portable relative path/,
  );

  const invalidDigest = hydraulicFixturePackage();
  invalidDigest.artifacts[0].sha256 = 'not-a-digest';
  assert.match(
    validateArpaeHydraulicEvidencePackage(invalidDigest).errors[0],
    /lowercase SHA-256/,
  );

  const unknownReference = hydraulicFixturePackage();
  unknownReference.components[0].artifactIds = ['not-declared'];
  assert.match(
    validateArpaeHydraulicEvidencePackage(unknownReference).errors[0],
    /references unknown artifact/,
  );
});

test('complete inflow evidence requires both rivers, m3/s and the full window', () => {
  const missingRabbi = hydraulicFixturePackage();
  missingRabbi.components[1].coveredEntities = ['montone'];
  assert.match(
    validateArpaeHydraulicEvidencePackage(missingRabbi).errors[0],
    /both Montone and Rabbi/,
  );

  const wrongUnit = hydraulicFixturePackage();
  wrongUnit.components[1].quantity.unit = 'mm';
  assert.match(
    validateArpaeHydraulicEvidencePackage(wrongUnit).errors[0],
    /must use m3\/s/,
  );

  const incompleteWindow = hydraulicFixturePackage();
  incompleteWindow.components[1].temporalCoverage.windowStart =
    '2023-05-16T01:00:00Z';
  assert.match(
    validateArpaeHydraulicEvidencePackage(incompleteWindow).errors[0],
    /complete event window/,
  );
});

test('a reviewed fixture remains blocked and cannot be accepted as real evidence', () => {
  const evidencePackage = hydraulicFixturePackage();
  const incompleteReview = reviewFixture(evidencePackage.packageId);
  const reviewValidation = validateArpaeHydraulicReviewReceipt(
    incompleteReview,
    evidencePackage,
  );
  const intake = inspectArpaeHydraulicEvidenceIntake(
    evidencePackage,
    incompleteReview,
  );

  assert.equal(reviewValidation.ok, true);
  assert.equal(intake.status, 'verified');
  assert.equal(intake.replayEligibility, 'blocked');
  assert.ok(
    intake.requiredComponents.every(
      (component) => component.reviewDecision === 'incomplete',
    ),
  );

  const acceptedReview = reviewFixture(evidencePackage.packageId, 'accepted');
  assert.match(
    validateArpaeHydraulicReviewReceipt(
      acceptedReview,
      evidencePackage,
    ).errors[0],
    /without available external evidence/,
  );
});

test('an invalid delivery is rejected rather than converted to an empty result', () => {
  const invalid = hydraulicFixturePackage();
  invalid.authority = 'ARPAE Emilia-Romagna';

  const intake = inspectArpaeHydraulicEvidenceIntake(invalid);

  assert.equal(intake.status, 'rejected');
  assert.equal(intake.replayEligibility, 'blocked');
  assert.ok(intake.validationErrors.length > 0);
  assert.equal(intake.requiredComponents.length, 7);
  assert.ok(
    intake.requiredComponents.every(
      (component) => component.status === 'missing',
    ),
  );
});
