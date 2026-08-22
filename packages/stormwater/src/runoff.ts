import {
  assertEvidenceInvariant,
  availableEvidence,
  Evidence,
  EvidenceDescriptor,
  EvidenceMetadataValue,
  EvidenceStatus,
  isUnavailableEvidenceStatus,
  syntheticFixtureEvidence,
  unavailableEvidence,
  UnavailableEvidenceStatus,
} from '@geo-lens/evidence';

/**
 * Experimental, inspectable runoff-depth proxy for Proof 0.
 * It is not a calibrated flood, hydraulic, drainage-capacity, or overflow
 * model. Its explicit parameters are versioned so they can be replaced.
 */
export const RUNOFF_MODEL_VERSION = 'runoff-coefficient-proxy-v0.1.0';

export interface RunoffModelInput {
  readonly rainfallMm: Evidence<number>;
  readonly slopeDeg: Evidence<number>;
  readonly landCoverClass: Evidence<number>;
}

export interface LandCoverRunoffParameter {
  readonly codeRange: readonly [number, number];
  readonly group:
    | 'artificial'
    | 'agriculture'
    | 'forest_and_seminatural'
    | 'wetland'
    | 'water';
  readonly imperviousnessProxy: number;
  readonly baseRunoffCoefficient: number;
}

export interface RunoffModelOutput {
  readonly modelVersion: typeof RUNOFF_MODEL_VERSION;
  readonly rainfallMm: number;
  readonly slopeDeg: number;
  readonly landCoverClass: number;
  readonly landCoverGroup: LandCoverRunoffParameter['group'];
  readonly imperviousnessProxy: number;
  readonly baseRunoffCoefficient: number;
  readonly slopeAdjustment: number;
  readonly runoffCoefficient: number;
  readonly derivedRunoffMm: number;
}

export interface RunoffDerivation {
  readonly inputs: RunoffModelInput;
  readonly output: Evidence<RunoffModelOutput>;
}

export interface RunoffDerivationOptions {
  readonly derivedAt: string;
}

export const LAND_COVER_RUNOFF_PARAMETERS:
  readonly LandCoverRunoffParameter[] = [
    {
      codeRange: [100, 199],
      group: 'artificial',
      imperviousnessProxy: 0.9,
      baseRunoffCoefficient: 0.8,
    },
    {
      codeRange: [200, 299],
      group: 'agriculture',
      imperviousnessProxy: 0.4,
      baseRunoffCoefficient: 0.45,
    },
    {
      codeRange: [300, 399],
      group: 'forest_and_seminatural',
      imperviousnessProxy: 0.15,
      baseRunoffCoefficient: 0.2,
    },
    {
      codeRange: [400, 499],
      group: 'wetland',
      imperviousnessProxy: 0.2,
      baseRunoffCoefficient: 0.3,
    },
    {
      codeRange: [500, 599],
      group: 'water',
      imperviousnessProxy: 1,
      baseRunoffCoefficient: 1,
    },
  ];

const UNAVAILABLE_STATUS_PRIORITY:
  readonly UnavailableEvidenceStatus[] = [
    'auth_required',
    'rate_limited',
    'upstream_error',
    'invalid_response',
    'incomplete_window',
    'out_of_coverage',
    'stale',
    'missing',
  ];

export function deriveRunoff(
  input: RunoffModelInput,
  options: RunoffDerivationOptions,
): RunoffDerivation {
  const namedInputs = [
    ['rainfall_mm', input.rainfallMm],
    ['slope_deg', input.slopeDeg],
    ['land_cover_class', input.landCoverClass],
  ] as const;

  for (const [, evidence] of namedInputs) {
    assertEvidenceInvariant(evidence);
  }

  const descriptor = runoffDescriptor(input, options.derivedAt);
  const spatialError = findSpatialMismatch(input);

  if (spatialError !== null) {
    return {
      inputs: input,
      output: unavailableEvidence(
        'invalid_response',
        spatialError,
        descriptor,
      ),
    };
  }

  const unavailableInputs = namedInputs.filter(
    ([, evidence]) => evidence.value === null,
  );

  if (unavailableInputs.length > 0) {
    const status = selectUnavailableEvidenceStatus(
      unavailableInputs.map(([, evidence]) => evidence.quality.status),
    );
    const reasons = unavailableInputs.map(([name, evidence]) => {
      const detail = evidence.quality.missingReason ?? 'no reason supplied';
      return `${name}=${evidence.quality.status} (${detail})`;
    });

    return {
      inputs: input,
      output: unavailableEvidence(
        status,
        `Runoff cannot be derived: ${reasons.join('; ')}`,
        descriptor,
      ),
    };
  }

  const rainfallMm = input.rainfallMm.value as number;
  const slopeDeg = input.slopeDeg.value as number;
  const landCoverClass = input.landCoverClass.value as number;

  const numericError = validateNumericInputs({
    rainfallMm,
    slopeDeg,
    landCoverClass,
  });

  if (numericError !== null) {
    return {
      inputs: input,
      output: unavailableEvidence(
        'invalid_response',
        numericError,
        descriptor,
      ),
    };
  }

  const landCoverParameter = findLandCoverParameter(landCoverClass);

  if (landCoverParameter === null) {
    return {
      inputs: input,
      output: unavailableEvidence(
        'invalid_response',
        `CLC class ${landCoverClass} is outside the supported 100-599 families`,
        descriptor,
      ),
    };
  }

  const slopeAdjustment = (Math.min(slopeDeg, 30) / 30) * 0.1;
  const runoffCoefficient = Math.min(
    1,
    landCoverParameter.baseRunoffCoefficient + slopeAdjustment,
  );
  const outputValue: RunoffModelOutput = {
    modelVersion: RUNOFF_MODEL_VERSION,
    rainfallMm,
    slopeDeg,
    landCoverClass,
    landCoverGroup: landCoverParameter.group,
    imperviousnessProxy: landCoverParameter.imperviousnessProxy,
    baseRunoffCoefficient: landCoverParameter.baseRunoffCoefficient,
    slopeAdjustment,
    runoffCoefficient,
    derivedRunoffMm: rainfallMm * runoffCoefficient,
  };

  const containsSyntheticInput = namedInputs.some(
    ([, evidence]) => evidence.quality.status === 'synthetic_fixture',
  );

  if (containsSyntheticInput) {
    return {
      inputs: input,
      output: syntheticFixtureEvidence(outputValue, {
        fixtureId: `derived-runoff:${descriptor.spatial.h3 ?? 'unlocated'}`,
        unit: 'mm',
        spatial: descriptor.spatial,
        temporal: descriptor.temporal,
        transformation: descriptor.provenance.transformation,
        transformationVersion:
          descriptor.provenance.transformationVersion,
        samplingMethod: descriptor.provenance.samplingMethod,
        sourceMetadata: descriptor.provenance.sourceMetadata,
      }),
    };
  }

  return {
    inputs: input,
    output: availableEvidence(outputValue, descriptor),
  };
}

export function selectUnavailableEvidenceStatus(
  statuses: readonly EvidenceStatus[],
): UnavailableEvidenceStatus {
  for (const candidate of UNAVAILABLE_STATUS_PRIORITY) {
    if (statuses.includes(candidate)) {
      return candidate;
    }
  }

  return 'invalid_response';
}

function runoffDescriptor(
  input: RunoffModelInput,
  derivedAt: string,
): EvidenceDescriptor {
  const rainfall = input.rainfallMm;
  const sourceMetadata: Record<string, EvidenceMetadataValue> = {
    rainfallStatus: rainfall.quality.status,
    rainfallProvider: rainfall.provenance.provider,
    rainfallDataset: rainfall.provenance.dataset,
    rainfallSourceResolution: rainfall.spatial.sourceResolution ?? null,
    slopeStatus: input.slopeDeg.quality.status,
    slopeProvider: input.slopeDeg.provenance.provider,
    slopeDataset: input.slopeDeg.provenance.dataset,
    slopeSourceResolution: input.slopeDeg.spatial.sourceResolution ?? null,
    landCoverStatus: input.landCoverClass.quality.status,
    landCoverProvider: input.landCoverClass.provenance.provider,
    landCoverDataset: input.landCoverClass.provenance.dataset,
    landCoverSourceResolution:
      input.landCoverClass.spatial.sourceResolution ?? null,
  };

  return {
    unit: 'mm',
    spatial: {
      h3: rainfall.spatial.h3,
      lat: rainfall.spatial.lat,
      lon: rainfall.spatial.lon,
    },
    temporal: {
      observedAt: rainfall.temporal.observedAt,
      windowStart: rainfall.temporal.windowStart,
      windowEnd: rainfall.temporal.windowEnd,
      acquiredAt: derivedAt,
    },
    provenance: {
      provider: 'geolens-core',
      dataset: 'derived-runoff-depth',
      transformation: 'land-cover runoff coefficient with bounded slope adjustment',
      transformationVersion: RUNOFF_MODEL_VERSION,
      samplingMethod: 'rainfall_mm multiplied by runoff coefficient proxy',
      sourceMetadata,
    },
  };
}

function findSpatialMismatch(input: RunoffModelInput): string | null {
  const h3Cells = [
    input.rainfallMm.spatial.h3,
    input.slopeDeg.spatial.h3,
    input.landCoverClass.spatial.h3,
  ].filter((h3): h3 is string => h3 !== undefined);
  const distinctCells = new Set(h3Cells);

  if (distinctCells.size > 1) {
    return `Runoff inputs refer to different H3 cells: ${[
      ...distinctCells,
    ].join(', ')}`;
  }

  return null;
}

function validateNumericInputs(values: {
  readonly rainfallMm: number;
  readonly slopeDeg: number;
  readonly landCoverClass: number;
}): string | null {
  if (!Number.isFinite(values.rainfallMm) || values.rainfallMm < 0) {
    return 'rainfall_mm must be a finite non-negative observation';
  }

  if (
    !Number.isFinite(values.slopeDeg) ||
    values.slopeDeg < 0 ||
    values.slopeDeg > 90
  ) {
    return 'slope_deg must be a finite value between 0 and 90';
  }

  if (
    !Number.isInteger(values.landCoverClass) ||
    values.landCoverClass < 0
  ) {
    return 'land_cover_class must be a non-negative integer';
  }

  return null;
}

function findLandCoverParameter(
  landCoverClass: number,
): LandCoverRunoffParameter | null {
  return (
    LAND_COVER_RUNOFF_PARAMETERS.find(
      (candidate) =>
        landCoverClass >= candidate.codeRange[0] &&
        landCoverClass <= candidate.codeRange[1],
    ) ?? null
  );
}
