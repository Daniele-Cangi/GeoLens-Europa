import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SUPPORTED_KINDS = new Set(['arpae', 'amsterdam', 'cumbria-model']);

export async function materializeExternalEvidencePackage({
  draft,
  dataRoot,
}) {
  assertPlainObject(draft, 'draft');
  if (!Array.isArray(draft.artifacts) || draft.artifacts.length === 0) {
    throw new Error('draft.artifacts must contain at least one item');
  }

  const canonicalRoot = await realpath(path.resolve(dataRoot));
  const artifacts = [];

  for (const [index, candidate] of draft.artifacts.entries()) {
    assertPlainObject(candidate, `draft.artifacts[${index}]`);
    const id = nonEmptyString(candidate.id, `draft.artifacts[${index}].id`);
    const role = nonEmptyString(
      candidate.role,
      `draft.artifacts[${index}].role`,
    );
    const relativePath = portableRelativePath(
      candidate.relativePath,
      `draft.artifacts[${index}].relativePath`,
    );
    const mediaType = nonEmptyString(
      candidate.mediaType,
      `draft.artifacts[${index}].mediaType`,
    );
    const requestedPath = path.resolve(
      canonicalRoot,
      ...relativePath.split('/'),
    );
    const canonicalArtifactPath = await realpath(requestedPath);
    assertInsideRoot(canonicalRoot, canonicalArtifactPath, relativePath);
    const metadata = await stat(canonicalArtifactPath);
    if (!metadata.isFile()) {
      throw new Error(`Artifact "${relativePath}" is not a regular file`);
    }

    artifacts.push({
      id,
      role,
      relativePath,
      mediaType,
      bytes: metadata.size,
      sha256: await sha256File(canonicalArtifactPath),
    });
  }

  return {
    ...draft,
    artifacts,
  };
}

export async function writeValidatedExternalEvidencePackage({
  evidencePackage,
  outputPath,
  validate,
}) {
  const validation = await validate(evidencePackage);
  if (
    validation === null ||
    typeof validation !== 'object' ||
    validation.ok !== true
  ) {
    const errors = Array.isArray(validation?.errors)
      ? validation.errors.join('; ')
      : 'unknown contract validation error';
    throw new Error(`Evidence package is invalid: ${errors}`);
  }

  const canonicalOutput = path.resolve(outputPath);
  await mkdir(path.dirname(canonicalOutput), { recursive: true });
  await writeFile(
    canonicalOutput,
    `${JSON.stringify(evidencePackage, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return canonicalOutput;
}

export async function loadContractValidator(kind) {
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error(
      `Unsupported intake kind "${String(kind)}"; expected arpae, amsterdam or cumbria-model`,
    );
  }

  if (kind === 'arpae') {
    const loaded = await import('../packages/evidence/dist/index.js');
    const module = loaded.default ?? loaded;
    const validator =
      loaded.validateArpaeHydraulicEvidencePackage ??
      module.validateArpaeHydraulicEvidencePackage;
    if (typeof validator !== 'function') {
      throw new Error('Built ARPAE contract validator is unavailable');
    }
    return validator;
  }

  if (kind === 'cumbria-model') {
    const loaded = await import('../packages/evidence/dist/index.js');
    const module = loaded.default ?? loaded;
    const validator =
      loaded.validateCumbriaModelEvidencePackage ??
      module.validateCumbriaModelEvidencePackage;
    if (typeof validator !== 'function') {
      throw new Error('Built Cumbria model contract validator is unavailable');
    }
    return validator;
  }

  const loaded = await import('../packages/stormwater/dist/index.js');
  const module = loaded.default ?? loaded;
  const validator =
    loaded.validateAmsterdamAttachmentDeliveryPackage ??
    module.validateAmsterdamAttachmentDeliveryPackage;
  if (typeof validator !== 'function') {
    throw new Error('Built Amsterdam contract validator is unavailable');
  }
  return validator;
}

export function parseIntakeArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: --kind <arpae|amsterdam|cumbria-model> --draft <json> --data-root <directory> --output <json>',
      );
    }
    if (values.has(key)) {
      throw new Error(`Duplicate argument ${key}`);
    }
    values.set(key, value);
  }

  const allowed = new Set(['--kind', '--draft', '--data-root', '--output']);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error(`Unknown argument ${key}`);
  }
  for (const key of allowed) {
    if (!values.has(key)) throw new Error(`Missing required argument ${key}`);
  }

  const kind = values.get('--kind');
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error('--kind must equal arpae, amsterdam or cumbria-model');
  }
  return {
    kind,
    draftPath: path.resolve(values.get('--draft')),
    dataRoot: path.resolve(values.get('--data-root')),
    outputPath: path.resolve(values.get('--output')),
  };
}

async function runCli() {
  const options = parseIntakeArguments(process.argv.slice(2));
  const draft = JSON.parse(await readFile(options.draftPath, 'utf8'));
  const evidencePackage = await materializeExternalEvidencePackage({
    draft,
    dataRoot: options.dataRoot,
  });
  const validate = await loadContractValidator(options.kind);
  const writtenPath = await writeValidatedExternalEvidencePackage({
    evidencePackage,
    outputPath: options.outputPath,
    validate,
  });

  process.stdout.write(
    `${JSON.stringify({
      status: 'structurally_valid',
      kind: options.kind,
      packageId: evidencePackage.packageId ?? null,
      artifactCount: evidencePackage.artifacts.length,
      artifactBytes: evidencePackage.artifacts.reduce(
        (sum, artifact) => sum + artifact.bytes,
        0,
      ),
      output: writtenPath,
      originalsCopied: false,
      scientificReviewCompleted: false,
    })}\n`,
  );
}

function portableRelativePath(value, label) {
  const normalized = nonEmptyString(value, label);
  if (
    normalized.includes('\\') ||
    normalized.startsWith('/') ||
    normalized.includes('://') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..' || part === '')
  ) {
    throw new Error(`${label} must be a portable relative path`);
  }
  return normalized;
}

function assertInsideRoot(root, candidate, relativePath) {
  const relation = path.relative(root, candidate);
  if (
    relation === '' ||
    (!relation.startsWith(`..${path.sep}`) && relation !== '..' && !path.isAbsolute(relation))
  ) {
    return;
  }
  throw new Error(`Artifact "${relativePath}" resolves outside data root`);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
