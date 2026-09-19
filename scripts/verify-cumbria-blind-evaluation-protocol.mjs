import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertCumbriaAccessManifest } from '../packages/evidence/dist/index.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const manifestRelativePath = 'tests/ground-truth/cumbria-2015/manifest.json';
const manifestPath = path.join(repositoryRoot, ...manifestRelativePath.split('/'));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fail(message) {
  throw new Error(message);
}

function equalJson(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) fail(`${label} drifted`);
}

function pythonCanonicalIdentity(filePath, identityField) {
  const program = [
    'import hashlib, json, sys',
    'from pathlib import Path',
    'value = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))',
    'identity = value.pop(sys.argv[2], None)',
    'source = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)',
    'actual = hashlib.sha256(source.encode("utf-8")).hexdigest()',
    'print(json.dumps({"identity": identity, "actual": actual}))',
  ].join('; ');
  return JSON.parse(
    execFileSync('python', ['-c', program, filePath, identityField], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }),
  );
}

function parseDataRoot(arguments_) {
  const index = arguments_.indexOf('--data-root');
  if (index === -1) return null;
  if (index !== arguments_.length - 2 || !arguments_[index + 1]) {
    fail('Usage: node scripts/verify-cumbria-blind-evaluation-protocol.mjs [--data-root <external-directory>]');
  }
  const resolved = path.resolve(arguments_[index + 1]);
  if (resolved.toLowerCase().includes(`${path.sep}onedrive${path.sep}`)) {
    fail('Cumbria data root must stay outside OneDrive');
  }
  if (resolved === repositoryRoot || resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
    fail('Cumbria data root must stay outside the Git repository');
  }
  return resolved;
}

async function verifyArtifact(dataRoot, descriptor) {
  const artifactPath = path.resolve(dataRoot, descriptor.relativePath);
  if (!artifactPath.startsWith(`${dataRoot}${path.sep}`)) {
    fail(`Prediction artifact escapes the data root: ${descriptor.relativePath}`);
  }
  const compressed = await readFile(artifactPath);
  if (compressed.length !== descriptor.bytes || sha256(compressed) !== descriptor.sha256) {
    fail(`Prediction artifact byte identity drifted: ${descriptor.relativePath}`);
  }
  const decoded = gunzipSync(compressed);
  if (
    decoded.length !== descriptor.decodedBytes ||
    sha256(decoded) !== descriptor.contentSha256
  ) {
    fail(`Prediction artifact content identity drifted: ${descriptor.relativePath}`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assertCumbriaAccessManifest(manifest);

const protocol = manifest.evaluationProtocol;
const { protocolSha256: expectedSha256, ...hashPayload } = protocol;
const protocolSha256 = sha256(JSON.stringify(hashPayload));
if (protocolSha256 !== expectedSha256) {
  fail(`Cumbria blind evaluation protocol hash mismatch: expected ${expectedSha256}, got ${protocolSha256}`);
}

if (
  protocol.predictionFreeze.state !== 'frozen' ||
  protocol.referenceSeal.geometryLoaded !== false ||
  protocol.referenceSeal.archivesDownloaded !== false ||
  protocol.referenceSeal.artifactReceipts !== null ||
  protocol.referenceSeal.referenceAccessAuthorizedAfterMerge !== true ||
  protocol.execution.state !== 'blocked_reference_geometry_sealed' ||
  canonicalJson(protocol.execution.blockers) !== canonicalJson(['reference_geometry_sealed']) ||
  protocol.execution.networkRequests !== 0 ||
  protocol.execution.filesWritten !== 0 ||
  protocol.execution.evaluationRuns !== 0
) {
  fail('Cumbria blind evaluation protocol does not retain the frozen prediction and sealed references');
}

const dataRoot = parseDataRoot(process.argv.slice(2));
let realPredictionVerification = null;

if (dataRoot !== null) {
  const freeze = protocol.predictionFreeze;
  const receiptPath = path.join(dataRoot, freeze.predictionReceipt.fileName);
  const receiptSource = await readFile(receiptPath);
  if (receiptSource.length !== freeze.predictionReceipt.bytes) fail('Prediction receipt byte count drifted');
  const receipt = JSON.parse(receiptSource);
  const { identity: receiptSha256, actual: actualReceiptSha256 } =
    pythonCanonicalIdentity(receiptPath, 'receiptSha256');
  if (
    receiptSha256 !== freeze.predictionReceipt.sha256 ||
    actualReceiptSha256 !== receiptSha256
  ) {
    fail('Prediction receipt identity drifted');
  }

  const revision = freeze.codeRevision;
  const sourceManifest = execFileSync(
    'git',
    ['show', `${revision.commit}:${manifestRelativePath}`],
    { cwd: repositoryRoot, encoding: null },
  );
  if (sha256(sourceManifest) !== freeze.predictionReceipt.sourceManifestSha256) {
    fail('Historical source manifest identity drifted');
  }
  const source = JSON.parse(sourceManifest);
  if (
    source.manifestVersion !== freeze.predictionReceipt.sourceManifestVersion ||
    source.publicBaselineEventRunnerContract.contractSha256 !== freeze.predictionReceipt.contractSha256
  ) {
    fail('Historical source manifest contract drifted');
  }
  const historicalTree = execFileSync('git', ['rev-parse', `${revision.commit}^{tree}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  if (historicalTree !== revision.tree) fail('Prediction source Git tree drifted');

  if (
    receipt.schemaVersion !== freeze.predictionReceipt.schemaVersion ||
    receipt.state !== 'prediction_frozen_evaluation_still_sealed' ||
    receipt.authorizationSha256 !== freeze.predictionReceipt.authorizationSha256 ||
    receipt.contractSha256 !== freeze.predictionReceipt.contractSha256 ||
    receipt.manifestSha256 !== freeze.predictionReceipt.sourceManifestSha256 ||
    canonicalJson(receipt.git) !== canonicalJson(revision) ||
    receipt.isolation.observedFloodGeometryLoaded !== false ||
    receipt.isolation.evaluationReferenceAccessAllowed !== false ||
    receipt.isolation.evaluationDrivenRetuning !== false ||
    receipt.isolation.bestScenarioSelected !== false ||
    receipt.isolation.allScenariosCompleted !== true
  ) {
    fail('Prediction receipt loses its frozen identity or evaluation isolation');
  }

  const contract = source.publicBaselineEventRunnerContract;
  const orderedIds = contract.scenarioPolicy.orderedScenarioIds;
  if (
    canonicalJson(receipt.scenarios.map((scenario) => scenario.scenarioId)) !== canonicalJson(orderedIds)
  ) {
    fail('Prediction scenario order drifted');
  }
  for (const [index, scenario] of receipt.scenarios.entries()) {
    if (scenario.outputCount !== contract.schedule.outputCount || scenario.massBalance.passed !== true) {
      fail(`Prediction scenario is incomplete: ${scenario.scenarioId}`);
    }
    for (const descriptor of Object.values(scenario.artifacts)) {
      await verifyArtifact(dataRoot, descriptor);
    }

    const checkpointPolicy = contract.checkpoints;
    const relativeCheckpoint = checkpointPolicy.fileNameTemplate
      .replace('{checkpointDirectory}', checkpointPolicy.directory)
      .replace('{scenarioIndex:02d}', String(index + 1).padStart(2, '0'))
      .replace('{scenarioId}', scenario.scenarioId);
    const checkpointPath = path.join(dataRoot, relativeCheckpoint);
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
    const { identity: checkpointSha256, actual: actualCheckpointSha256 } =
      pythonCanonicalIdentity(checkpointPath, 'checkpointSha256');
    if (actualCheckpointSha256 !== checkpointSha256) {
      fail(`Scenario checkpoint identity drifted: ${scenario.scenarioId}`);
    }
    equalJson(checkpoint.result, scenario, `Scenario checkpoint result ${scenario.scenarioId}`);
  }

  const primary = receipt.scenarios.find(
    (scenario) => scenario.scenarioId === freeze.wetnessCriterion.scenarioId,
  );
  if (primary === undefined) fail('Frozen primary prediction scenario is missing');
  equalJson(primary.artifacts.wetMask05m, freeze.wetnessCriterion.artifact, 'Frozen wet mask');
  equalJson(
    primary.artifacts.validPredictionMask,
    freeze.evaluationDomain.artifact,
    'Frozen evaluation-domain mask',
  );
  if (
    freeze.predictionArtifactSha256 !== freeze.wetnessCriterion.artifact.sha256 ||
    freeze.predictionArtifactContentSha256 !== freeze.wetnessCriterion.artifact.contentSha256 ||
    primary.predictionEligibleCellCount !== freeze.evaluationDomain.validPredictionCellCount
  ) {
    fail('Frozen prediction or evaluation-domain identity drifted');
  }

  realPredictionVerification = {
    dataRoot,
    receiptSha256,
    verifiedScenarioCount: receipt.scenarios.length,
    verifiedArtifactDescriptorCount: receipt.scenarios.reduce(
      (count, scenario) => count + Object.keys(scenario.artifacts).length,
      0,
    ),
    checkpointCount: receipt.scenarios.length,
  };
}

console.log(
  JSON.stringify(
    {
      verificationId: protocol.id,
      version: protocol.version,
      mode: dataRoot === null ? 'contract_only' : 'real_prediction_verification',
      state: protocol.state,
      validationMode: protocol.validationMode,
      protocolSha256,
      predictionState: protocol.predictionFreeze.state,
      predictionReceiptSha256: protocol.predictionFreeze.predictionReceipt.sha256,
      primaryScenarioId: protocol.predictionFreeze.wetnessCriterion.scenarioId,
      primaryWetnessThresholdM: protocol.predictionFreeze.wetnessCriterion.threshold,
      evaluationDomainMaskSha256: protocol.predictionFreeze.evaluationDomain.artifact.sha256,
      referenceStateAtPredictionFreeze: protocol.referenceSeal.state,
      currentReferenceAcquisitionState:
        manifest.evaluationReferenceAcquisition.state,
      referenceDatasetIds: protocol.referenceSeal.datasetIds,
      metricIds: protocol.metrics.map((metric) => metric.id),
      networkRequests: 0,
      filesWritten: 0,
      evaluationRuns: 0,
      blockers: protocol.execution.blockers,
      realPredictionVerification,
    },
    null,
    2,
  ),
);
