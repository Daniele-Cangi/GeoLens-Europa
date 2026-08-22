import { EvidenceMetadataValue } from '@geo-lens/evidence';

export const INFRASTRUCTURE_ORIGINS = [
  'observed_public_record',
  'user_supplied',
  'derived',
  'synthetic_fixture',
] as const;

export type InfrastructureOrigin =
  (typeof INFRASTRUCTURE_ORIGINS)[number];

export interface InfrastructureDatasetSource {
  readonly origin: InfrastructureOrigin;
  readonly provider: string;
  readonly dataset: string;
  readonly datasetVersion?: string;
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly acquiredAt: string;
  readonly sourceCrs: string;
  readonly outputCrs: string;
  readonly transformation: string;
  readonly transformationVersion: string;
}

export interface InfrastructureAssetSource
  extends InfrastructureDatasetSource {
  readonly sourceRecordId: string;
  readonly sourceAttributes?: Readonly<
    Record<string, EvidenceMetadataValue>
  >;
}

const originSet: ReadonlySet<string> = new Set(
  INFRASTRUCTURE_ORIGINS,
);

export function infrastructureAssetSource(
  source: InfrastructureDatasetSource,
  sourceRecordId: string,
  sourceAttributes?: Readonly<
    Record<string, EvidenceMetadataValue>
  >,
): InfrastructureAssetSource {
  const assetSource = {
    ...source,
    sourceRecordId,
    sourceAttributes,
  };

  assertInfrastructureAssetSource(assetSource);
  return assetSource;
}

export function assertInfrastructureDatasetSource(
  source: InfrastructureDatasetSource,
): void {
  if (!originSet.has(source.origin)) {
    throw new Error(
      `Unknown infrastructure origin ${String(source.origin)}`,
    );
  }

  for (const [name, value] of [
    ['provider', source.provider],
    ['dataset', source.dataset],
    ['sourceCrs', source.sourceCrs],
    ['outputCrs', source.outputCrs],
    ['transformation', source.transformation],
    ['transformationVersion', source.transformationVersion],
  ] as const) {
    if (value.trim().length === 0) {
      throw new Error(
        `Infrastructure source ${name} must be non-empty`,
      );
    }
  }

  if (Number.isNaN(Date.parse(source.acquiredAt))) {
    throw new Error(
      'Infrastructure source acquiredAt must be a valid timestamp',
    );
  }

  const fixtureProvider =
    source.provider === 'synthetic-fixture';
  const fixtureDataset =
    source.dataset.startsWith('fixture:');

  if (
    source.origin === 'synthetic_fixture' &&
    (!fixtureProvider || !fixtureDataset)
  ) {
    throw new Error(
      'Synthetic infrastructure must use synthetic-fixture provider and fixture: dataset',
    );
  }

  if (
    source.origin !== 'synthetic_fixture' &&
    (fixtureProvider || fixtureDataset)
  ) {
    throw new Error(
      'Synthetic fixture provenance cannot be represented as non-synthetic infrastructure',
    );
  }
}

export function assertInfrastructureAssetSource(
  source: InfrastructureAssetSource,
): void {
  assertInfrastructureDatasetSource(source);

  if (source.sourceRecordId.trim().length === 0) {
    throw new Error(
      'Infrastructure sourceRecordId must be non-empty',
    );
  }
}
