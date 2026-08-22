import { PROOF_ZERO_NETWORK } from './fixture';

export type EvidenceStatus =
  | 'available'
  | 'missing'
  | 'stale'
  | 'out_of_coverage'
  | 'auth_required'
  | 'rate_limited'
  | 'upstream_error'
  | 'invalid_response'
  | 'incomplete_window'
  | 'synthetic_fixture';

export interface Evidence<T> {
  readonly value: T | null;
  readonly unit?: string;
  readonly spatial: {
    readonly h3?: string;
    readonly lat?: number;
    readonly lon?: number;
    readonly sourceResolution?: string;
  };
  readonly temporal: {
    readonly observedAt?: string;
    readonly windowStart?: string;
    readonly windowEnd?: string;
    readonly acquiredAt: string;
  };
  readonly provenance: {
    readonly provider: string;
    readonly dataset: string;
    readonly datasetVersion?: string;
    readonly transformation?: string;
    readonly transformationVersion?: string;
    readonly samplingMethod?: string;
    readonly sourceMetadata?: Readonly<
      Record<string, unknown>
    >;
  };
  readonly quality: {
    readonly status: EvidenceStatus;
    readonly missingReason?: string;
  };
}

export interface RunoffOutput {
  readonly modelVersion: string;
  readonly rainfallMm: number;
  readonly slopeDeg: number;
  readonly landCoverClass: number;
  readonly landCoverGroup: string;
  readonly imperviousnessProxy: number;
  readonly baseRunoffCoefficient: number;
  readonly slopeAdjustment: number;
  readonly runoffCoefficient: number;
  readonly derivedRunoffMm: number;
}

export interface EnvironmentalCell {
  readonly h3: string;
  readonly rainfall24hMm: Evidence<number>;
  readonly elevationM: Evidence<number>;
  readonly slopeDeg: Evidence<number>;
  readonly landCoverClass: Evidence<number>;
}

export interface EnvironmentalNode {
  readonly id: string;
  readonly h3: string;
  readonly lat: number;
  readonly lon: number;
  readonly elevationM: Evidence<number>;
}

export interface EnvironmentalIssue {
  readonly h3: string;
  readonly entityId?: string;
  readonly layer: string;
  readonly status: EvidenceStatus;
  readonly reason: string;
}

export interface CatchmentCellContribution {
  readonly h3: string;
  readonly coverageFraction: number;
  readonly representedAreaM2: number;
  readonly runoff: {
    readonly output: Evidence<RunoffOutput>;
  };
  readonly volumeM3: Evidence<number>;
}

export interface CatchmentContribution {
  readonly catchmentId: string;
  readonly outletNodeId: string;
  readonly status: 'complete' | 'incomplete';
  readonly representedAreaM2: number;
  readonly availableAreaM2: number;
  readonly partialAvailableVolumeM3: number;
  readonly totalVolumeM3: Evidence<number>;
  readonly cells: readonly CatchmentCellContribution[];
}

export interface NodeTopology {
  readonly id: string;
  readonly type: 'inlet' | 'manhole' | 'outfall' | 'junction';
  readonly position: {
    readonly lat: number;
    readonly lon: number;
  };
  readonly h3: string;
  readonly elevationM: Evidence<number>;
}

export interface PipeTopology {
  readonly id: string;
  readonly nodeAId: string;
  readonly nodeBId: string;
  readonly lengthM: number;
  readonly diameterMm?: number;
}

export type PipeDirection =
  | {
      readonly status: 'known';
      readonly fromNodeId: string;
      readonly toNodeId: string;
      readonly elevationDropM: number;
      readonly grade: number;
    }
  | {
      readonly status: 'unknown';
      readonly reason: string;
      readonly nodeAStatus: string;
      readonly nodeBStatus: string;
    }
  | {
      readonly status: 'ambiguous';
      readonly reason: string;
      readonly elevationDifferenceM: number;
      readonly minimumResolvableDropM: number;
    };

export interface CompletePropagation {
  readonly status: 'complete';
  readonly modelVersion: string;
  readonly nodes: Readonly<
    Record<
      string,
      {
        readonly localContributionM3: Evidence<number>;
        readonly downstreamAccumulationM3: Evidence<number>;
      }
    >
  >;
  readonly pipes: Readonly<
    Record<
      string,
      {
        readonly direction: Extract<
          PipeDirection,
          { readonly status: 'known' }
        >;
        readonly transferredVolumeM3: Evidence<number>;
      }
    >
  >;
  readonly massBalance: {
    readonly localInputVolumeM3: number;
    readonly terminalVolumeM3: number;
    readonly outfallVolumeM3: number;
    readonly nonOutfallTerminalVolumeM3: number;
    readonly differenceM3: number;
  };
}

export interface IncompletePropagation {
  readonly status:
    | 'incomplete_direction'
    | 'incomplete_evidence'
    | 'unsupported_divergence'
    | 'cyclic';
  readonly modelVersion: string;
  readonly reason: string;
  readonly pipeIds: readonly string[];
  readonly nodeIds: readonly string[];
}

export type Propagation =
  | CompletePropagation
  | IncompletePropagation;

export interface ProofZeroResult {
  readonly status: 'complete' | 'incomplete';
  readonly proofVersion: string;
  readonly environmental: {
    readonly status: 'complete' | 'incomplete';
    readonly referenceTime: string;
    readonly acquiredAt: string;
    readonly sources: {
      readonly rainfall: ProviderSummary;
      readonly terrain: ProviderSummary;
      readonly landCover: ProviderSummary;
    };
    readonly cells: Readonly<
      Record<string, EnvironmentalCell>
    >;
    readonly nodes: Readonly<
      Record<string, EnvironmentalNode>
    >;
    readonly issues: readonly EnvironmentalIssue[];
  };
  readonly topology: {
    readonly id: string;
    readonly nodes: Readonly<Record<string, NodeTopology>>;
    readonly pipes: Readonly<Record<string, PipeTopology>>;
  };
  readonly orientedNetwork: {
    readonly minimumResolvableDropM: number;
    readonly directions: Readonly<
      Record<string, PipeDirection>
    >;
  };
  readonly catchmentContributions:
    readonly CatchmentContribution[];
  readonly nodeSourceTerms: {
    readonly terms: Readonly<
      Record<string, Evidence<number>>
    >;
  };
  readonly propagation: Propagation;
}

export interface ProviderSummary {
  readonly provider: string;
  readonly dataset: string;
  readonly acquiredAt: string;
  readonly status: 'responded' | 'upstream_error';
  readonly missingReason?: string;
}

interface ApiError {
  readonly status?: string;
  readonly error?: string;
}

const API_URL =
  process.env.NEXT_PUBLIC_GEOLENS_API_URL ??
  'http://localhost:3003';

export async function runProofZero(
  referenceTime: string,
  signal?: AbortSignal,
): Promise<ProofZeroResult> {
  const response = await fetch(
    `${API_URL}/api/proof-zero/run`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        network: PROOF_ZERO_NETWORK,
        networkId: 'trento-proof-zero-inspector',
        referenceTime,
      }),
      cache: 'no-store',
      signal,
    },
  );
  const body = (await response.json()) as
    | ProofZeroResult
    | ApiError;

  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(
      error.error ??
        `GeoLens API returned HTTP ${response.status}`,
    );
  }

  return body as ProofZeroResult;
}
