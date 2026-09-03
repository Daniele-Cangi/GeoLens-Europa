import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCumbriaAccessManifest,
  cumbriaReplacementSolverProtocolSha256,
} from '../packages/evidence/dist/index.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const manifestPath = path.join(
  repositoryRoot,
  'tests',
  'ground-truth',
  'cumbria-2015',
  'manifest.json',
);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assertCumbriaAccessManifest(manifest);

const protocol = manifest.replacementSolverProtocol;
const protocolSha256 = cumbriaReplacementSolverProtocolSha256(protocol);
if (protocolSha256 !== protocol.protocolSha256) {
  throw new Error('Cumbria replacement-solver protocol identity drifted');
}

if (
  protocol.execution.state !== 'blocked' ||
  protocol.execution.solverExecutionAllowed !== false ||
  protocol.execution.evaluationReferenceAccessAllowed !== false ||
  protocol.execution.networkRequests !== 0 ||
  protocol.execution.filesWritten !== 0 ||
  protocol.isolation.observedFloodGeometryLoaded !== false ||
  protocol.isolation.observedFloodGeometryUsed !== false ||
  protocol.isolation.h3UsedAsSolverGrid !== false
) {
  throw new Error('Cumbria replacement-solver protocol is not sealed and fail-closed');
}

const meshes = [protocol.meshes.primary, ...protocol.meshes.sensitivities];
for (const mesh of meshes) {
  if (mesh.width * mesh.height !== mesh.cellCount) {
    throw new Error(`Cumbria replacement mesh ${mesh.id} cell accounting drifted`);
  }
}

console.log(
  JSON.stringify(
    {
      verificationId: protocol.id,
      version: protocol.version,
      mode: 'dry_run',
      state: protocol.state,
      formulation: protocol.formulation.family,
      protocolSha256,
      domain: protocol.domain,
      meshes,
      scenarioIds: protocol.scenarios.map((scenario) => scenario.id),
      primaryWetnessThresholdM: protocol.outputs.wetness.primaryThresholdM,
      sensitivityWetnessThresholdsM:
        protocol.outputs.wetness.sensitivityThresholdsM,
      networkRequests: 0,
      filesWritten: 0,
      solverRuns: 0,
      evaluationReferencesLoaded: 0,
      blockers: protocol.execution.blockers,
    },
    null,
    2,
  ),
);
