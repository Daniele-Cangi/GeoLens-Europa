export const BENCHMARK_DATASET_ROLES = [
  'model_input',
  'evaluation_reference',
  'comparison_reference',
  'context_only',
] as const;

export type BenchmarkDatasetRole =
  (typeof BENCHMARK_DATASET_ROLES)[number];

export interface BenchmarkLocalArtifact {
  readonly relativePath: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface BenchmarkDataset {
  readonly id: string;
  readonly role: BenchmarkDatasetRole;
  readonly temporalRelation: 'pre_event' | 'during_event' | 'post_event';
  /** Earliest verified time this exact source/version was available. */
  readonly availableAt?: string;
  readonly publisher: string;
  readonly dataset: string;
  readonly datasetVersion?: string;
  readonly sourceUrl: string;
  readonly accessMethod: string;
  readonly sourceResolution?: string;
  readonly acquisitionStatus:
    | 'remote_verified'
    | 'downloaded_verified'
    | 'downloaded_license_review'
    | 'blocked';
  readonly license: {
    readonly name: string;
    readonly access: 'public' | 'auth_required' | 'restricted' | 'unknown';
    readonly redistribution: 'allowed' | 'restricted' | 'unknown';
    readonly note?: string;
  };
  readonly allowedUses: {
    readonly modelInput: boolean;
    readonly calibration: boolean;
    readonly evaluation: boolean;
  };
  readonly methodologyNote?: string;
  readonly localArtifacts?: readonly BenchmarkLocalArtifact[];
}

export interface HistoricalBenchmarkManifest {
  readonly manifestVersion: '1.0.0';
  readonly benchmark: {
    readonly id: string;
    readonly title: string;
    readonly state: 'data_audit' | 'model_ready' | 'evaluation_ready';
    readonly claimLevel:
      | 'hydrologic_routing'
      | 'conditioned_inundation_replay'
      | 'blind_hindcast';
    readonly event: {
      readonly windowStart: string;
      readonly windowEnd: string;
      readonly knowledgeCutoff: string;
    };
    readonly aoi: {
      readonly name: string;
      readonly crs: string;
      readonly bounds: readonly [number, number, number, number];
      readonly selectionBasis: string;
    };
    readonly evaluationMetrics: readonly string[];
    readonly forbiddenClaims: readonly string[];
  };
  readonly datasets: readonly BenchmarkDataset[];
}

const roles = new Set<string>(BENCHMARK_DATASET_ROLES);
const states = new Set(['data_audit', 'model_ready', 'evaluation_ready']);
const claims = new Set([
  'hydrologic_routing',
  'conditioned_inundation_replay',
  'blind_hindcast',
]);
const temporalRelations = new Set([
  'pre_event',
  'during_event',
  'post_event',
]);
const acquisitionStatuses = new Set([
  'remote_verified',
  'downloaded_verified',
  'downloaded_license_review',
  'blocked',
]);

export function assertHistoricalBenchmarkManifest(
  value: unknown,
): asserts value is HistoricalBenchmarkManifest {
  const root = objectValue(value, 'manifest');
  if (stringValue(root.manifestVersion, 'manifestVersion') !== '1.0.0') {
    throw new Error('manifestVersion must be "1.0.0"');
  }

  const benchmark = objectValue(root.benchmark, 'benchmark');
  stringValue(benchmark.id, 'benchmark.id');
  stringValue(benchmark.title, 'benchmark.title');
  allowedString(benchmark.state, states, 'benchmark.state');
  allowedString(benchmark.claimLevel, claims, 'benchmark.claimLevel');

  const event = objectValue(benchmark.event, 'benchmark.event');
  const start = isoTime(event.windowStart, 'benchmark.event.windowStart');
  const end = isoTime(event.windowEnd, 'benchmark.event.windowEnd');
  const cutoff = isoTime(
    event.knowledgeCutoff,
    'benchmark.event.knowledgeCutoff',
  );
  if (Date.parse(start) >= Date.parse(end)) {
    throw new Error('benchmark event windowStart must precede windowEnd');
  }
  if (Date.parse(cutoff) > Date.parse(end)) {
    throw new Error('benchmark knowledgeCutoff must not follow windowEnd');
  }

  const aoi = objectValue(benchmark.aoi, 'benchmark.aoi');
  stringValue(aoi.name, 'benchmark.aoi.name');
  const crs = stringValue(aoi.crs, 'benchmark.aoi.crs');
  stringValue(aoi.selectionBasis, 'benchmark.aoi.selectionBasis');
  const bounds = numberArray(aoi.bounds, 'benchmark.aoi.bounds', 4);
  if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
    throw new Error('benchmark AOI bounds must be [west, south, east, north]');
  }
  if (
    crs === 'EPSG:4326' &&
    (bounds[0] < -180 ||
      bounds[2] > 180 ||
      bounds[1] < -90 ||
      bounds[3] > 90)
  ) {
    throw new Error('EPSG:4326 AOI bounds exceed longitude/latitude limits');
  }
  stringArray(benchmark.evaluationMetrics, 'benchmark.evaluationMetrics');
  stringArray(benchmark.forbiddenClaims, 'benchmark.forbiddenClaims');

  if (!Array.isArray(root.datasets) || root.datasets.length === 0) {
    throw new Error('datasets must be a non-empty array');
  }

  const ids = new Set<string>();
  const artifactPaths = new Set<string>();
  let modelInputs = 0;
  let evaluationReferences = 0;

  root.datasets.forEach((rawDataset, index) => {
    const label = 'datasets[' + index + ']';
    const dataset = objectValue(rawDataset, label);
    const id = stringValue(dataset.id, label + '.id');
    if (ids.has(id)) {
      throw new Error('Duplicate benchmark dataset id "' + id + '"');
    }
    ids.add(id);

    const role = allowedString(dataset.role, roles, label + '.role');
    const temporalRelation = allowedString(
      dataset.temporalRelation,
      temporalRelations,
      label + '.temporalRelation',
    );
    const status = allowedString(
      dataset.acquisitionStatus,
      acquisitionStatuses,
      label + '.acquisitionStatus',
    );
    const availableAt =
      dataset.availableAt === undefined
        ? undefined
        : isoTime(dataset.availableAt, label + '.availableAt');
    stringValue(dataset.publisher, label + '.publisher');
    stringValue(dataset.dataset, label + '.dataset');
    stringValue(dataset.accessMethod, label + '.accessMethod');
    httpsUrl(dataset.sourceUrl, label + '.sourceUrl');

    const license = objectValue(dataset.license, label + '.license');
    stringValue(license.name, label + '.license.name');
    allowedString(
      license.access,
      new Set(['public', 'auth_required', 'restricted', 'unknown']),
      label + '.license.access',
    );
    allowedString(
      license.redistribution,
      new Set(['allowed', 'restricted', 'unknown']),
      label + '.license.redistribution',
    );

    const uses = objectValue(dataset.allowedUses, label + '.allowedUses');
    const modelInput = booleanValue(
      uses.modelInput,
      label + '.allowedUses.modelInput',
    );
    const calibration = booleanValue(
      uses.calibration,
      label + '.allowedUses.calibration',
    );
    const evaluation = booleanValue(
      uses.evaluation,
      label + '.allowedUses.evaluation',
    );

    if (role === 'model_input') {
      modelInputs += 1;
      if (!modelInput) {
        throw new Error(label + ' is a model_input but modelInput is false');
      }
    }
    if (role === 'evaluation_reference') {
      evaluationReferences += 1;
      if (!evaluation) {
        throw new Error(label + ' evaluation must be true');
      }
    }
    if (
      role === 'evaluation_reference' ||
      role === 'comparison_reference' ||
      temporalRelation === 'post_event'
    ) {
      if (modelInput || calibration) {
        throw new Error(
          label + ' cannot be used for model input or calibration',
        );
      }
    }

    if (modelInput || calibration) {
      if (availableAt === undefined) {
        throw new Error(
          label + '.availableAt is required for model input or calibration',
        );
      }
      if (Date.parse(availableAt) > Date.parse(cutoff)) {
        throw new Error(
          label + ' was not available by benchmark knowledgeCutoff',
        );
      }
    }

    if (dataset.localArtifacts !== undefined) {
      if (
        !Array.isArray(dataset.localArtifacts) ||
        dataset.localArtifacts.length === 0
      ) {
        throw new Error(label + '.localArtifacts must be a non-empty array');
      }
      dataset.localArtifacts.forEach((rawArtifact, artifactIndex) => {
        const artifactLabel =
          label + '.localArtifacts[' + artifactIndex + ']';
        const artifact = objectValue(rawArtifact, artifactLabel);
        const path = stringValue(
          artifact.relativePath,
          artifactLabel + '.relativePath',
        );
        portablePath(path, artifactLabel + '.relativePath');
        if (artifactPaths.has(path)) {
          throw new Error('Duplicate local artifact path "' + path + '"');
        }
        artifactPaths.add(path);
        const bytes = finiteNumber(artifact.bytes, artifactLabel + '.bytes');
        if (!Number.isInteger(bytes) || bytes <= 0) {
          throw new Error(artifactLabel + '.bytes must be a positive integer');
        }
        const sha256 = stringValue(
          artifact.sha256,
          artifactLabel + '.sha256',
        );
        if (!/^[a-f0-9]{64}$/i.test(sha256)) {
          throw new Error(
            artifactLabel + '.sha256 must be a SHA-256 digest',
          );
        }
      });
    }
    if (status.startsWith('downloaded_') && dataset.localArtifacts === undefined) {
      throw new Error(label + ' is downloaded but has no localArtifacts');
    }
  });

  if (modelInputs === 0 || evaluationReferences === 0) {
    throw new Error(
      'benchmark requires at least one model input and one evaluation reference',
    );
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(label + ' must be a non-empty string');
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(label + ' must be boolean');
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(label + ' must be a finite number');
  }
  return value;
}

function allowedString(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): string {
  const result = stringValue(value, label);
  if (!allowed.has(result)) {
    throw new Error(label + ' has unsupported value "' + result + '"');
  }
  return result;
}

function isoTime(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (Number.isNaN(Date.parse(result))) {
    throw new Error(label + ' must be an ISO timestamp');
  }
  return result;
}

function httpsUrl(value: unknown, label: string): void {
  const result = stringValue(value, label);
  try {
    if (new URL(result).protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new Error(label + ' must be a valid HTTPS URL');
  }
}

function numberArray(
  value: unknown,
  label: string,
  length: number,
): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(label + ' must contain exactly ' + length + ' numbers');
  }
  return value.map((entry, index) =>
    finiteNumber(entry, label + '[' + index + ']'),
  );
}

function stringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(label + ' must be a non-empty array');
  }
  value.forEach((entry, index) =>
    stringValue(entry, label + '[' + index + ']'),
  );
}

function portablePath(value: string, label: string): void {
  const normalized = value.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(label + ' must be a portable relative path');
  }
}