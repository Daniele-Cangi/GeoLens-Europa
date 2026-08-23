import {
  availableEvidence,
  Evidence,
  EvidenceDescriptor,
  EvidenceMetadataValue,
  syntheticFixtureEvidence,
  unavailableEvidence,
  UnavailableEvidenceStatus,
} from '@geo-lens/evidence';

interface RasterSampleTrace {
  readonly sourceId?: string;
  readonly sourceQuality?: number;
  readonly sourceMetadata?: Readonly<
    Record<string, EvidenceMetadataValue>
  >;
}

export type RasterSample =
  & (
    | {
        readonly status: 'available';
        readonly value: number;
        readonly sourceId: string;
      }
    | {
        readonly status: UnavailableEvidenceStatus;
        readonly value: null;
        readonly missingReason: string;
      }
  )
  & RasterSampleTrace;

export type RasterSourceIdentity =
  | {
      readonly kind: 'production';
    }
  | {
      readonly kind: 'synthetic_fixture';
      readonly fixtureId: string;
    };

export interface PointRasterSource {
  readonly identity: RasterSourceIdentity;
  sample(lat: number, lon: number): Promise<RasterSample>;
}

export function rasterSampleEvidence(
  sample: RasterSample,
  descriptor: EvidenceDescriptor,
  identity: RasterSourceIdentity,
): Evidence<number> {
  if (sample.status !== 'available') {
    const unavailableDescriptor =
      identity.kind === 'synthetic_fixture'
        ? fixtureDescriptor(descriptor, identity.fixtureId)
        : descriptor;

    return unavailableEvidence(
      sample.status,
      sample.missingReason,
      withSampleTrace(unavailableDescriptor, sample),
      { sourceQuality: sample.sourceQuality },
    );
  }

  if (!Number.isFinite(sample.value)) {
    return unavailableEvidence(
      'invalid_response',
      'Raster source returned a non-finite value',
      withSampleTrace(descriptor, sample),
      { sourceQuality: sample.sourceQuality },
    );
  }

  if (identity.kind === 'synthetic_fixture') {
    return syntheticFixtureEvidence(sample.value, {
      fixtureId: identity.fixtureId,
      unit: descriptor.unit,
      spatial: descriptor.spatial,
      temporal: descriptor.temporal,
      transformation: descriptor.provenance.transformation,
      transformationVersion:
        descriptor.provenance.transformationVersion,
      samplingMethod: descriptor.provenance.samplingMethod,
      sourceQuality: sample.sourceQuality,
      sourceMetadata: {
        ...descriptor.provenance.sourceMetadata,
        ...sample.sourceMetadata,
        sourceId: sample.sourceId,
        intendedProvider: descriptor.provenance.provider,
        intendedDataset: descriptor.provenance.dataset,
      },
    });
  }

  return availableEvidence(
    sample.value,
    withSampleTrace(descriptor, sample),
    { sourceQuality: sample.sourceQuality },
  );
}

export function classifyRasterError(
  error: unknown,
): UnavailableEvidenceStatus {
  const message = errorMessage(error).toLowerCase();

  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  ) {
    return 'auth_required';
  }

  if (message.includes('429') || message.includes('rate limit')) {
    return 'rate_limited';
  }

  if (
    message.includes('404') ||
    message.includes('enoent') ||
    message.includes('not found')
  ) {
    return 'missing';
  }

  return 'upstream_error';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withSampleTrace(
  descriptor: EvidenceDescriptor,
  sample: RasterSample,
): EvidenceDescriptor {
  if (
    sample.sourceId === undefined &&
    sample.sourceMetadata === undefined
  ) {
    return descriptor;
  }

  return {
    ...descriptor,
    provenance: {
      ...descriptor.provenance,
      sourceMetadata: {
        ...descriptor.provenance.sourceMetadata,
        ...sample.sourceMetadata,
        ...(sample.sourceId === undefined
          ? {}
          : { sourceId: sample.sourceId }),
      },
    },
  };
}

function fixtureDescriptor(
  descriptor: EvidenceDescriptor,
  fixtureId: string,
): EvidenceDescriptor {
  return {
    ...descriptor,
    provenance: {
      ...descriptor.provenance,
      provider: 'synthetic-fixture',
      dataset: `fixture:${fixtureId}`,
      sourceMetadata: {
        ...descriptor.provenance.sourceMetadata,
        fixtureId,
        intendedProvider: descriptor.provenance.provider,
        intendedDataset: descriptor.provenance.dataset,
      },
    },
  };
}
