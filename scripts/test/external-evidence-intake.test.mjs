import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  materializeExternalEvidencePackage,
  loadContractValidator,
  parseIntakeArguments,
  writeValidatedExternalEvidencePackage,
} from '../intake-external-evidence.mjs';

async function workspace(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'geolens-intake-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('intake computes content identity without retaining local source paths', async (context) => {
  const root = await workspace(context);
  const bytes = Buffer.from('authoritative-delivery\n', 'utf8');
  await writeFile(path.join(root, 'source.csv'), bytes);

  const evidencePackage = await materializeExternalEvidencePackage({
    dataRoot: root,
    draft: {
      packageId: 'package:test',
      artifacts: [
        {
          id: 'source-table',
          role: 'source_table',
          relativePath: 'source.csv',
          mediaType: 'text/csv',
          bytes: 1,
          sha256: 'untrusted-draft-value',
          sourcePath: 'must-not-survive',
        },
      ],
    },
  });

  assert.equal(evidencePackage.artifacts[0].bytes, bytes.length);
  assert.equal(
    evidencePackage.artifacts[0].sha256,
    createHash('sha256').update(bytes).digest('hex'),
  );
  assert.equal('sourcePath' in evidencePackage.artifacts[0], false);
});

test('Cumbria model intake hashes an external artifact before contract validation', async (context) => {
  const root = await workspace(context);
  const relativePath = 'delivery/carlisle-model.zip';
  const artifactPath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(artifactPath), { recursive: true });
  const bytes = Buffer.from('synthetic-contract-fixture-only\n', 'utf8');
  await writeFile(artifactPath, bytes);
  const componentIds = [
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
  ];
  const supporting = new Set([
    'model_and_hydrology_reports',
    'pre_event_model_outputs',
    'development_and_change_logs',
  ]);
  const evidencePackage = await materializeExternalEvidencePackage({
    dataRoot: root,
    draft: {
      schemaVersion: 'cumbria-ea-model-evidence-package-v0.1.0',
      packageId: 'fixture:cumbria-model-intake',
      caseId: 'cumbria-2015-carlisle-replay',
      requestId: 'cumbria-carlisle-pre-event-model-products-5-6-7-v0',
      sourceKind: 'synthetic_fixture',
      receivedAt: '2026-09-02T10:00:00Z',
      authority: 'synthetic-fixture',
      deliveryReference: 'fixture-only',
      requestedProductNumbers: [5, 6, 7],
      requestedModelGroupIds: [1313, 1314, 1797, 8323],
      excludedModelGroupIds: [2039, 9458],
      license: { access: 'unknown', redistribution: 'unknown' },
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
          relativePath,
          mediaType: 'application/zip',
        },
      ],
      components: componentIds.map((id) => ({
        id,
        requirement: supporting.has(id)
          ? 'supporting'
          : 'required_for_gate_assessment',
        status: 'synthetic_fixture',
        artifactIds: ['delivery-archive'],
        productNumbers: [5, 6, 7],
        modelGroupIds: [1313, 1314, 1797, 8323],
        source: {
          provider: 'synthetic-fixture',
          dataset: `fixture:${id}`,
        },
        temporalClassification: 'synthetic_fixture',
        sourceDates: [],
        temporalLineageMethod: 'synthetic fixture only',
        observedEventGeometryIncluded: false,
        derivedFromEvaluationReference: false,
        calibrationUse: 'forbidden',
        automaticPromotion: false,
      })),
    },
  });
  const validate = await loadContractValidator('cumbria-model');

  assert.equal((await validate(evidencePackage)).ok, true);
  assert.equal(evidencePackage.artifacts[0].bytes, bytes.length);
  assert.equal(
    evidencePackage.artifacts[0].sha256,
    createHash('sha256').update(bytes).digest('hex'),
  );
});

test('intake rejects traversal before reading an artifact', async (context) => {
  const root = await workspace(context);

  await assert.rejects(
    materializeExternalEvidencePackage({
      dataRoot: root,
      draft: {
        artifacts: [
          {
            id: 'escape',
            role: 'source_table',
            relativePath: '../outside.csv',
            mediaType: 'text/csv',
          },
        ],
      },
    }),
    /portable relative path/,
  );
});

test('invalid contracts are not written and valid receipts cannot be overwritten', async (context) => {
  const root = await workspace(context);
  const outputPath = path.join(root, 'receipts', 'package.json');
  const evidencePackage = { packageId: 'package:test', artifacts: [] };

  await assert.rejects(
    writeValidatedExternalEvidencePackage({
      evidencePackage,
      outputPath,
      validate: () => ({ ok: false, errors: ['contract mismatch'] }),
    }),
    /contract mismatch/,
  );
  await assert.rejects(access(outputPath));

  await writeValidatedExternalEvidencePackage({
    evidencePackage,
    outputPath,
    validate: () => ({ ok: true, errors: [] }),
  });
  assert.deepEqual(
    JSON.parse(await readFile(outputPath, 'utf8')),
    evidencePackage,
  );
  await assert.rejects(
    writeValidatedExternalEvidencePackage({
      evidencePackage,
      outputPath,
      validate: () => ({ ok: true, errors: [] }),
    }),
    (error) => error?.code === 'EEXIST',
  );
});

test('CLI arguments are explicit, complete and kind-bounded', () => {
  const parsed = parseIntakeArguments([
    '--kind',
    'arpae',
    '--draft',
    'draft.json',
    '--data-root',
    'delivery',
    '--output',
    'receipt.json',
  ]);

  assert.equal(parsed.kind, 'arpae');
  assert.ok(path.isAbsolute(parsed.draftPath));
  assert.throws(
    () =>
      parseIntakeArguments([
        '--kind',
        'unknown',
        '--draft',
        'draft.json',
        '--data-root',
        'delivery',
        '--output',
        'receipt.json',
      ]),
    /arpae, amsterdam or cumbria-model/,
  );
});

test('all compiled scientific contracts are wired into the intake command', async () => {
  assert.equal(typeof (await loadContractValidator('arpae')), 'function');
  assert.equal(typeof (await loadContractValidator('amsterdam')), 'function');
  assert.equal(typeof (await loadContractValidator('cumbria-model')), 'function');
  await assert.rejects(loadContractValidator('unknown'), /Unsupported intake kind/);
});
