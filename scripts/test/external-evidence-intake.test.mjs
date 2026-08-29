import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    /arpae or amsterdam/,
  );
});

test('both compiled scientific contracts are wired into the intake command', async () => {
  assert.equal(typeof (await loadContractValidator('arpae')), 'function');
  assert.equal(typeof (await loadContractValidator('amsterdam')), 'function');
  await assert.rejects(loadContractValidator('unknown'), /Unsupported intake kind/);
});
