import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertCumbriaAccessManifest } from '../packages/evidence/dist/index.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const manifestPath = path.join(
  repositoryRoot,
  'tests',
  'ground-truth',
  'cumbria-2015',
  'manifest.json',
);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assertCumbriaAccessManifest(manifest);

const protocol = manifest.evaluationProtocol;
const { protocolSha256: expectedSha256, ...hashPayload } = protocol;
const protocolSha256 = createHash('sha256')
  .update(JSON.stringify(hashPayload))
  .digest('hex');

if (protocolSha256 !== expectedSha256) {
  throw new Error(
    `Cumbria blind evaluation protocol hash mismatch: expected ${expectedSha256}, got ${protocolSha256}`,
  );
}

if (
  protocol.referenceSeal.geometryLoaded !== false ||
  protocol.referenceSeal.archivesDownloaded !== false ||
  protocol.referenceSeal.artifactReceipts !== null ||
  protocol.predictionFreeze.predictionArtifactSha256 !== null ||
  protocol.execution.state !== 'blocked' ||
  protocol.execution.networkRequests !== 0 ||
  protocol.execution.filesWritten !== 0 ||
  protocol.execution.evaluationRuns !== 0
) {
  throw new Error('Cumbria blind evaluation protocol is not sealed and fail-closed');
}

console.log(
  JSON.stringify(
    {
      verificationId: protocol.id,
      version: protocol.version,
      mode: 'dry_run',
      state: protocol.state,
      validationMode: protocol.validationMode,
      protocolSha256,
      predictionState: protocol.predictionFreeze.state,
      referenceState: protocol.referenceSeal.state,
      referenceDatasetIds: protocol.referenceSeal.datasetIds,
      metricIds: protocol.metrics.map((metric) => metric.id),
      networkRequests: 0,
      filesWritten: 0,
      evaluationRuns: 0,
      blockers: protocol.execution.blockers,
    },
    null,
    2,
  ),
);
