import {
  CatchmentContribution,
  composeNodeSourceTerms,
  createStormwaterTopology,
  ImportedStormwaterFixture,
  NodeSourceTerms,
  orientStormwaterNetwork,
  OrientedStormwaterNetwork,
  propagateStormwaterContributions,
  PropagationResult,
  StormwaterTopology,
  aggregateCatchmentRunoff,
} from '@geo-lens/stormwater';

import {
  EnvironmentalEvidenceBundle,
  EnvironmentalEvidenceComposer,
} from './environment';

export const PROOF_ZERO_VERSION =
  'stormwater-spatial-evidence-proof-v0.1.0';

export interface StormwaterProofZeroOptions {
  readonly referenceTime: Date;
  readonly derivedAt: string;
  readonly minimumResolvableDropM: number;
}

export interface StormwaterProofZeroResult {
  readonly status: 'complete' | 'incomplete';
  readonly proofVersion: typeof PROOF_ZERO_VERSION;
  readonly environmental: EnvironmentalEvidenceBundle;
  readonly topology: StormwaterTopology;
  readonly orientedNetwork: OrientedStormwaterNetwork;
  readonly catchmentContributions:
    readonly CatchmentContribution[];
  readonly nodeSourceTerms: NodeSourceTerms;
  readonly propagation: PropagationResult;
}

export async function runStormwaterProofZero(
  imported: ImportedStormwaterFixture,
  evidenceComposer: EnvironmentalEvidenceComposer,
  options: StormwaterProofZeroOptions,
): Promise<StormwaterProofZeroResult> {
  validateOptions(imported, options);
  const catchmentH3Indices = unique(
    imported.catchments.flatMap((catchment) =>
      catchment.cells.map((cell) => cell.h3),
    ),
  );
  const nodes = Object.values(imported.topology.nodes);
  const environmental = await evidenceComposer.compose({
    catchmentH3Indices,
    nodes: nodes.map((node) => ({
      id: node.id,
      h3: node.h3,
      lat: node.position.lat,
      lon: node.position.lon,
    })),
    referenceTime: options.referenceTime,
  });
  const topology = createStormwaterTopology({
    id: imported.topology.id,
    nodes: nodes.map((node) => {
      const nodeEvidence = environmental.nodes[node.id];

      if (nodeEvidence === undefined) {
        throw new Error(
          `Environmental bundle omitted network node ${node.id}`,
        );
      }

      return {
        ...node,
        elevationM: nodeEvidence.elevationM,
      };
    }),
    pipes: Object.values(imported.topology.pipes),
    catchmentAttachments: Object.values(
      imported.topology.catchmentAttachments,
    ),
  });
  const catchmentContributions = imported.catchments.map(
    (catchment) =>
      aggregateCatchmentRunoff(
        {
          id: catchment.id,
          outletNodeId: catchment.outletNodeId,
          cells: catchment.cells.map((coverage) => {
            const cell = environmental.cells[coverage.h3];

            if (cell === undefined) {
              throw new Error(
                `Environmental bundle omitted catchment H3 ${coverage.h3}`,
              );
            }

            if (
              cell.rainfall24hMm === undefined ||
              cell.slopeDeg === undefined ||
              cell.landCoverClass === undefined
            ) {
              throw new Error(
                `Environmental bundle lacks runoff layers for catchment H3 ${coverage.h3}`,
              );
            }

            return {
              h3: coverage.h3,
              coverageFraction: coverage.coverageFraction,
              rainfallMm: cell.rainfall24hMm,
              slopeDeg: cell.slopeDeg,
              landCoverClass: cell.landCoverClass,
            };
          }),
        },
        { derivedAt: options.derivedAt },
      ),
  );
  const orientedNetwork = orientStormwaterNetwork(topology, {
    minimumResolvableDropM:
      options.minimumResolvableDropM,
  });
  const nodeSourceTerms = composeNodeSourceTerms(
    topology,
    catchmentContributions,
    { derivedAt: options.derivedAt },
  );
  const propagation = propagateStormwaterContributions(
    orientedNetwork,
    nodeSourceTerms.terms,
    { derivedAt: options.derivedAt },
  );
  const complete =
    environmental.status === 'complete' &&
    catchmentContributions.every(
      (contribution) => contribution.status === 'complete',
    ) &&
    propagation.status === 'complete';

  return {
    status: complete ? 'complete' : 'incomplete',
    proofVersion: PROOF_ZERO_VERSION,
    environmental,
    topology,
    orientedNetwork,
    catchmentContributions,
    nodeSourceTerms,
    propagation,
  };
}

function validateOptions(
  imported: ImportedStormwaterFixture,
  options: StormwaterProofZeroOptions,
): void {
  if (imported.catchments.length === 0) {
    throw new Error('Proof 0 requires at least one catchment');
  }

  if (Number.isNaN(options.referenceTime.getTime())) {
    throw new Error('Proof 0 referenceTime must be valid');
  }

  if (Number.isNaN(Date.parse(options.derivedAt))) {
    throw new Error('Proof 0 derivedAt must be valid');
  }

  if (
    !Number.isFinite(options.minimumResolvableDropM) ||
    options.minimumResolvableDropM < 0
  ) {
    throw new Error(
      'Proof 0 minimumResolvableDropM must be finite and non-negative',
    );
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
