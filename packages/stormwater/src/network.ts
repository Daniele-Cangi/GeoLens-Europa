import {
  assertEvidenceInvariant,
  availableEvidence,
  Evidence,
  EvidenceDescriptor,
  EvidenceMetadataValue,
  syntheticFixtureEvidence,
  unavailableEvidence,
} from '@geo-lens/evidence';
import { isValidCell } from 'h3-js';

import {
  CatchmentContribution,
} from './catchment';
import {
  assertInfrastructureAssetSource,
  InfrastructureAssetSource,
} from './infrastructure';
import { selectUnavailableEvidenceStatus } from './runoff';

export const NODE_ELEVATION_ORIENTATION_VERSION =
  'node-ground-elevation-direction-v0.3.0';
export const PIPE_INVERT_ORIENTATION_VERSION =
  'pipe-invert-direction-v0.2.0';
export const MAX_VERTICAL_DROP_NUMERIC_TOLERANCE_M =
  1e-6;
const MAX_NUMERIC_TOLERANCE_FRACTION_OF_BOUNDARY = 0.01;
export const NETWORK_ORIENTATION_VERSION =
  NODE_ELEVATION_ORIENTATION_VERSION;
export const NETWORK_PROPAGATION_VERSION =
  'no-loss-downstream-accumulation-v0.1.0';
export const OUTFALL_CONNECTIVITY_VERSION =
  'known-direction-outfall-connectivity-v0.1.0';

export type StormwaterNodeType =
  | 'inlet'
  | 'manhole'
  | 'outfall'
  | 'junction';

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface StormwaterNode {
  readonly id: string;
  readonly type: StormwaterNodeType;
  readonly position: GeoPoint;
  readonly h3: string;
  readonly elevationM: Evidence<number>;
  readonly source: InfrastructureAssetSource;
}

export interface StormwaterPipe {
  readonly id: string;
  readonly nodeAId: string;
  readonly nodeBId: string;
  readonly lengthM: number;
  readonly diameterMm?: number;
  readonly path: readonly GeoPoint[];
  readonly invertLevelAM: Evidence<number>;
  readonly invertLevelBM: Evidence<number>;
  readonly source: InfrastructureAssetSource;
}

export interface CatchmentAttachment {
  readonly catchmentId: string;
  readonly outletNodeId: string;
}

export interface StormwaterTopologyInput {
  readonly id: string;
  readonly nodes: readonly StormwaterNode[];
  readonly pipes: readonly StormwaterPipe[];
  readonly catchmentAttachments: readonly CatchmentAttachment[];
}

export interface StormwaterTopology {
  readonly id: string;
  readonly nodes: Readonly<Record<string, StormwaterNode>>;
  readonly pipes: Readonly<Record<string, StormwaterPipe>>;
  readonly catchmentAttachments:
    Readonly<Record<string, CatchmentAttachment>>;
}

export type TopologyIssueCode =
  | 'empty_network_id'
  | 'empty_network'
  | 'duplicate_node_id'
  | 'invalid_node_type'
  | 'invalid_position'
  | 'invalid_h3'
  | 'invalid_elevation_evidence'
  | 'elevation_h3_mismatch'
  | 'invalid_node_source'
  | 'duplicate_pipe_id'
  | 'missing_pipe_endpoint'
  | 'self_loop'
  | 'invalid_pipe_length'
  | 'invalid_pipe_diameter'
  | 'invalid_pipe_path'
  | 'invalid_pipe_invert_evidence'
  | 'invalid_pipe_source'
  | 'duplicate_pipe_endpoints'
  | 'duplicate_catchment_attachment'
  | 'missing_catchment_outlet';

export interface TopologyValidationIssue {
  readonly code: TopologyIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface TopologyValidation {
  readonly valid: boolean;
  readonly issues: readonly TopologyValidationIssue[];
}

export class NetworkTopologyError extends Error {
  readonly validation: TopologyValidation;

  constructor(validation: TopologyValidation) {
    super(
      `Stormwater topology is invalid: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
    this.name = 'NetworkTopologyError';
    this.validation = validation;
  }
}

export type DirectionEvidenceBasis =
  | 'node_ground_elevation'
  | 'pipe_invert_level';

export type DirectionOrientationVersion =
  | typeof NODE_ELEVATION_ORIENTATION_VERSION
  | typeof PIPE_INVERT_ORIENTATION_VERSION;

export interface KnownPipeDirection {
  readonly status: 'known';
  readonly evidenceBasis: DirectionEvidenceBasis;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly verticalDropM: number;
  readonly grade: number;
}

export interface UnknownPipeDirection {
  readonly status: 'unknown';
  readonly evidenceBasis: DirectionEvidenceBasis;
  readonly reason:
    | 'missing_vertical_evidence'
    | 'invalid_vertical_evidence';
  readonly endpointAStatus: string;
  readonly endpointBStatus: string;
}

export interface AmbiguousPipeDirection {
  readonly status: 'ambiguous';
  readonly evidenceBasis: DirectionEvidenceBasis;
  readonly reason: 'within_vertical_resolution';
  readonly verticalDifferenceM: number;
  readonly minimumResolvableDropM: number;
}

export type PipeDirection =
  | KnownPipeDirection
  | UnknownPipeDirection
  | AmbiguousPipeDirection;

export interface OrientedStormwaterNetwork {
  readonly topology: StormwaterTopology;
  readonly orientationVersion: DirectionOrientationVersion;
  readonly evidenceBasis: DirectionEvidenceBasis;
  readonly minimumResolvableDropM: number;
  readonly numericComparisonToleranceM: number;
  readonly directions: Readonly<Record<string, PipeDirection>>;
}

export interface OrientationOptions {
  readonly minimumResolvableDropM: number;
}

export type OutfallConnectivityStatus =
  | 'known_upstream_path'
  | 'blocked_by_unresolved_direction'
  | 'isolated'
  | 'direction_conflict';

export interface OutfallConnectivityState {
  readonly outfallNodeId: string;
  readonly status: OutfallConnectivityStatus;
  readonly knownUpstreamNodeIds: readonly string[];
  readonly knownUpstreamPipeIds: readonly string[];
  readonly unresolvedBoundaryPipeIds: readonly string[];
  readonly outwardKnownPipeIds: readonly string[];
}

export interface OutfallConnectivityAnalysis {
  readonly modelVersion: typeof OUTFALL_CONNECTIVITY_VERSION;
  readonly orientationVersion: DirectionOrientationVersion;
  readonly evidenceBasis: DirectionEvidenceBasis;
  readonly minimumResolvableDropM: number;
  readonly numericComparisonToleranceM: number;
  readonly outfalls: Readonly<
    Record<string, OutfallConnectivityState>
  >;
  readonly knownPathNodeIds: readonly string[];
  readonly knownPathPipeIds: readonly string[];
  readonly unresolvedBoundaryPipeIds: readonly string[];
  readonly counts: {
    readonly outfalls: number;
    readonly knownUpstreamPaths: number;
    readonly blockedByUnresolvedDirection: number;
    readonly isolated: number;
    readonly directionConflicts: number;
    readonly knownPathNodes: number;
    readonly knownPathPipes: number;
    readonly unresolvedBoundaryPipes: number;
  };
}

export interface NodeSourceTerms {
  readonly terms: Readonly<Record<string, Evidence<number>>>;
  readonly partialAvailableVolumeM3:
    Readonly<Record<string, number>>;
}

export interface SourceTermOptions {
  readonly derivedAt: string;
}

export interface NodePropagationState {
  readonly localContributionM3: Evidence<number>;
  readonly downstreamAccumulationM3: Evidence<number>;
}

export interface PipePropagationState {
  readonly direction: KnownPipeDirection;
  readonly transferredVolumeM3: Evidence<number>;
}

export interface PropagationMassBalance {
  readonly localInputVolumeM3: number;
  readonly terminalVolumeM3: number;
  readonly outfallVolumeM3: number;
  readonly nonOutfallTerminalVolumeM3: number;
  readonly differenceM3: number;
}

export interface CompletePropagationResult {
  readonly status: 'complete';
  readonly modelVersion: typeof NETWORK_PROPAGATION_VERSION;
  readonly nodes: Readonly<Record<string, NodePropagationState>>;
  readonly pipes: Readonly<Record<string, PipePropagationState>>;
  readonly terminalNodeIds: readonly string[];
  readonly massBalance: PropagationMassBalance;
}

export interface IncompletePropagationResult {
  readonly status:
    | 'incomplete_direction'
    | 'incomplete_evidence'
    | 'unsupported_divergence'
    | 'cyclic';
  readonly modelVersion: typeof NETWORK_PROPAGATION_VERSION;
  readonly reason: string;
  readonly pipeIds: readonly string[];
  readonly nodeIds: readonly string[];
}

export type PropagationResult =
  | CompletePropagationResult
  | IncompletePropagationResult;

export interface PropagationOptions {
  readonly derivedAt: string;
}

const NODE_TYPES: ReadonlySet<string> = new Set([
  'inlet',
  'manhole',
  'outfall',
  'junction',
]);

export function validateStormwaterTopology(
  input: StormwaterTopologyInput,
): TopologyValidation {
  const issues: TopologyValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const pipeIds = new Set<string>();
  const endpointPairs = new Set<string>();
  const catchmentIds = new Set<string>();

  if (input.id.trim().length === 0) {
    issues.push({
      code: 'empty_network_id',
      path: 'id',
      message: 'Network id must be non-empty',
    });
  }

  if (input.nodes.length === 0) {
    issues.push({
      code: 'empty_network',
      path: 'nodes',
      message: 'A stormwater network must contain at least one node',
    });
  }

  for (const [index, node] of input.nodes.entries()) {
    const path = `nodes[${index}]`;

    if (nodeIds.has(node.id)) {
      issues.push({
        code: 'duplicate_node_id',
        path: `${path}.id`,
        message: `Duplicate node id ${node.id}`,
      });
    }
    nodeIds.add(node.id);

    if (!NODE_TYPES.has(node.type)) {
      issues.push({
        code: 'invalid_node_type',
        path: `${path}.type`,
        message: `Unsupported node type ${String(node.type)}`,
      });
    }

    if (
      !Number.isFinite(node.position.lat) ||
      node.position.lat < -90 ||
      node.position.lat > 90 ||
      !Number.isFinite(node.position.lon) ||
      node.position.lon < -180 ||
      node.position.lon > 180
    ) {
      issues.push({
        code: 'invalid_position',
        path: `${path}.position`,
        message: 'Node position must contain finite latitude/longitude',
      });
    }

    if (!isValidCell(node.h3)) {
      issues.push({
        code: 'invalid_h3',
        path: `${path}.h3`,
        message: `Invalid H3 cell ${node.h3}`,
      });
    }

    try {
      assertEvidenceInvariant(node.elevationM);
    } catch (error) {
      issues.push({
        code: 'invalid_elevation_evidence',
        path: `${path}.elevationM`,
        message:
          error instanceof Error ? error.message : 'Invalid evidence',
      });
    }

    try {
      assertInfrastructureAssetSource(node.source);
    } catch (error) {
      issues.push({
        code: 'invalid_node_source',
        path: `${path}.source`,
        message:
          error instanceof Error ? error.message : 'Invalid source',
      });
    }

    if (
      node.elevationM.spatial.h3 !== undefined &&
      node.elevationM.spatial.h3 !== node.h3
    ) {
      issues.push({
        code: 'elevation_h3_mismatch',
        path: `${path}.elevationM.spatial.h3`,
        message:
          `Elevation H3 ${node.elevationM.spatial.h3} does not match node H3 ${node.h3}`,
      });
    }
  }

  for (const [index, pipe] of input.pipes.entries()) {
    const path = `pipes[${index}]`;

    if (pipeIds.has(pipe.id)) {
      issues.push({
        code: 'duplicate_pipe_id',
        path: `${path}.id`,
        message: `Duplicate pipe id ${pipe.id}`,
      });
    }
    pipeIds.add(pipe.id);

    if (!nodeIds.has(pipe.nodeAId) || !nodeIds.has(pipe.nodeBId)) {
      issues.push({
        code: 'missing_pipe_endpoint',
        path,
        message:
          `Pipe endpoints must reference existing nodes: ${pipe.nodeAId}, ${pipe.nodeBId}`,
      });
    }

    if (pipe.nodeAId === pipe.nodeBId) {
      issues.push({
        code: 'self_loop',
        path,
        message: 'A pipe cannot connect a node to itself',
      });
    }

    if (!Number.isFinite(pipe.lengthM) || pipe.lengthM <= 0) {
      issues.push({
        code: 'invalid_pipe_length',
        path: `${path}.lengthM`,
        message: 'Pipe length must be a finite positive number',
      });
    }

    if (
      pipe.diameterMm !== undefined &&
      (!Number.isFinite(pipe.diameterMm) || pipe.diameterMm <= 0)
    ) {
      issues.push({
        code: 'invalid_pipe_diameter',
        path: `${path}.diameterMm`,
        message: 'Pipe diameter must be a finite positive number',
      });
    }

    if (
      !Array.isArray(pipe.path) ||
      pipe.path.length < 2 ||
      pipe.path.some(
        (point) =>
          !Number.isFinite(point.lat) ||
          point.lat < -90 ||
          point.lat > 90 ||
          !Number.isFinite(point.lon) ||
          point.lon < -180 ||
          point.lon > 180,
      )
    ) {
      issues.push({
        code: 'invalid_pipe_path',
        path: `${path}.path`,
        message:
          'Pipe path requires at least two finite latitude/longitude positions',
      });
    }

    for (const [name, evidence] of [
      ['invertLevelAM', pipe.invertLevelAM],
      ['invertLevelBM', pipe.invertLevelBM],
    ] as const) {
      try {
        assertEvidenceInvariant(evidence);

        if (evidence.unit !== 'm') {
          throw new Error('Pipe invert evidence must use unit m');
        }
      } catch (error) {
        issues.push({
          code: 'invalid_pipe_invert_evidence',
          path: `${path}.${name}`,
          message:
            error instanceof Error ? error.message : 'Invalid evidence',
        });
      }
    }

    try {
      assertInfrastructureAssetSource(pipe.source);
    } catch (error) {
      issues.push({
        code: 'invalid_pipe_source',
        path: `${path}.source`,
        message:
          error instanceof Error ? error.message : 'Invalid source',
      });
    }

    const endpointPair = [pipe.nodeAId, pipe.nodeBId].sort().join('|');

    if (endpointPairs.has(endpointPair)) {
      issues.push({
        code: 'duplicate_pipe_endpoints',
        path,
        message:
          `Multiple pipes connect the same endpoint pair ${endpointPair}`,
      });
    }
    endpointPairs.add(endpointPair);
  }

  for (const [index, attachment] of
    input.catchmentAttachments.entries()) {
    const path = `catchmentAttachments[${index}]`;

    if (catchmentIds.has(attachment.catchmentId)) {
      issues.push({
        code: 'duplicate_catchment_attachment',
        path,
        message:
          `Catchment ${attachment.catchmentId} has multiple outlets`,
      });
    }
    catchmentIds.add(attachment.catchmentId);

    if (!nodeIds.has(attachment.outletNodeId)) {
      issues.push({
        code: 'missing_catchment_outlet',
        path: `${path}.outletNodeId`,
        message:
          `Catchment outlet ${attachment.outletNodeId} is not a network node`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function createStormwaterTopology(
  input: StormwaterTopologyInput,
): StormwaterTopology {
  const validation = validateStormwaterTopology(input);

  if (!validation.valid) {
    throw new NetworkTopologyError(validation);
  }

  return {
    id: input.id,
    nodes: Object.fromEntries(
      input.nodes.map((node) => [node.id, node]),
    ),
    pipes: Object.fromEntries(
      input.pipes.map((pipe) => [pipe.id, pipe]),
    ),
    catchmentAttachments: Object.fromEntries(
      input.catchmentAttachments.map((attachment) => [
        attachment.catchmentId,
        attachment,
      ]),
    ),
  };
}

export function orientStormwaterNetwork(
  topology: StormwaterTopology,
  options: OrientationOptions,
): OrientedStormwaterNetwork {
  return orientStormwaterNetworkFromEvidence(
    topology,
    options,
    NODE_ELEVATION_ORIENTATION_VERSION,
    'node_ground_elevation',
    (pipe) => ({
      endpointA: topology.nodes[pipe.nodeAId].elevationM,
      endpointB: topology.nodes[pipe.nodeBId].elevationM,
    }),
  );
}

export function orientStormwaterNetworkByPipeInverts(
  topology: StormwaterTopology,
  options: OrientationOptions,
): OrientedStormwaterNetwork {
  return orientStormwaterNetworkFromEvidence(
    topology,
    options,
    PIPE_INVERT_ORIENTATION_VERSION,
    'pipe_invert_level',
    (pipe) => ({
      endpointA: pipe.invertLevelAM,
      endpointB: pipe.invertLevelBM,
    }),
  );
}

interface VerticalEvidencePair {
  readonly endpointA: Evidence<number>;
  readonly endpointB: Evidence<number>;
}

function orientStormwaterNetworkFromEvidence(
  topology: StormwaterTopology,
  options: OrientationOptions,
  orientationVersion: DirectionOrientationVersion,
  evidenceBasis: DirectionEvidenceBasis,
  evidenceForPipe: (
    pipe: StormwaterPipe,
  ) => VerticalEvidencePair,
): OrientedStormwaterNetwork {
  if (
    !Number.isFinite(options.minimumResolvableDropM) ||
    options.minimumResolvableDropM < 0
  ) {
    throw new Error(
      'minimumResolvableDropM must be a finite non-negative number',
    );
  }

  const numericComparisonToleranceM = Math.min(
    MAX_VERTICAL_DROP_NUMERIC_TOLERANCE_M,
    options.minimumResolvableDropM *
      MAX_NUMERIC_TOLERANCE_FRACTION_OF_BOUNDARY,
  );

  const directions: Record<string, PipeDirection> = {};

  for (const pipe of Object.values(topology.pipes)) {
    const vertical = evidenceForPipe(pipe);
    const levelA = vertical.endpointA.value;
    const levelB = vertical.endpointB.value;

    if (levelA === null || levelB === null) {
      directions[pipe.id] = {
        status: 'unknown',
        evidenceBasis,
        reason: 'missing_vertical_evidence',
        endpointAStatus:
          vertical.endpointA.quality.status,
        endpointBStatus:
          vertical.endpointB.quality.status,
      };
      continue;
    }

    if (!Number.isFinite(levelA) || !Number.isFinite(levelB)) {
      directions[pipe.id] = {
        status: 'unknown',
        evidenceBasis,
        reason: 'invalid_vertical_evidence',
        endpointAStatus:
          vertical.endpointA.quality.status,
        endpointBStatus:
          vertical.endpointB.quality.status,
      };
      continue;
    }

    const differenceM = levelA - levelB;

    const absoluteDifferenceM = Math.abs(differenceM);
    const comparisonDropM =
      absoluteDifferenceM + numericComparisonToleranceM;
    const belowResolvableBoundary =
      absoluteDifferenceM === 0 ||
      comparisonDropM < options.minimumResolvableDropM;

    if (belowResolvableBoundary) {
      directions[pipe.id] = {
        status: 'ambiguous',
        evidenceBasis,
        reason: 'within_vertical_resolution',
        verticalDifferenceM: differenceM,
        minimumResolvableDropM:
          options.minimumResolvableDropM,
      };
      continue;
    }

    const endpointAIsHigher = differenceM > 0;
    directions[pipe.id] = {
      status: 'known',
      evidenceBasis,
      fromNodeId: endpointAIsHigher
        ? pipe.nodeAId
        : pipe.nodeBId,
      toNodeId: endpointAIsHigher
        ? pipe.nodeBId
        : pipe.nodeAId,
      verticalDropM: absoluteDifferenceM,
      grade: absoluteDifferenceM / pipe.lengthM,
    };
  }

  return {
    topology,
    orientationVersion,
    evidenceBasis,
    minimumResolvableDropM: options.minimumResolvableDropM,
    numericComparisonToleranceM,
    directions,
  };
}

export function analyzeOutfallConnectivity(
  network: OrientedStormwaterNetwork,
): OutfallConnectivityAnalysis {
  const knownIncoming = new Map<
    string,
    Array<{ readonly pipeId: string; readonly fromNodeId: string }>
  >();
  const knownOutgoing = new Map<string, string[]>();
  const unresolvedIncident = new Map<string, string[]>();

  for (const pipe of Object.values(network.topology.pipes)) {
    const direction = network.directions[pipe.id];

    if (direction === undefined) {
      throw new Error(
        'Oriented network has no direction state for pipe ' + pipe.id,
      );
    }

    if (direction.status === 'known') {
      const incoming =
        knownIncoming.get(direction.toNodeId) ?? [];
      incoming.push({
        pipeId: pipe.id,
        fromNodeId: direction.fromNodeId,
      });
      knownIncoming.set(direction.toNodeId, incoming);

      const outgoing =
        knownOutgoing.get(direction.fromNodeId) ?? [];
      outgoing.push(pipe.id);
      knownOutgoing.set(direction.fromNodeId, outgoing);
      continue;
    }

    for (const nodeId of [pipe.nodeAId, pipe.nodeBId]) {
      const incident = unresolvedIncident.get(nodeId) ?? [];
      incident.push(pipe.id);
      unresolvedIncident.set(nodeId, incident);
    }
  }

  const outfallNodes = Object.values(network.topology.nodes)
    .filter((node) => node.type === 'outfall')
    .sort((left, right) => left.id.localeCompare(right.id));
  const outfalls: Record<string, OutfallConnectivityState> = {};
  const knownPathNodeIds = new Set<string>();
  const knownPathPipeIds = new Set<string>();
  const unresolvedBoundaryPipeIds = new Set<string>();

  for (const outfall of outfallNodes) {
    const visitedNodeIds = new Set<string>([outfall.id]);
    const upstreamPipeIds = new Set<string>();
    const pendingNodeIds = [outfall.id];

    while (pendingNodeIds.length > 0) {
      const nodeId = pendingNodeIds.pop() as string;

      for (const incoming of knownIncoming.get(nodeId) ?? []) {
        upstreamPipeIds.add(incoming.pipeId);

        if (!visitedNodeIds.has(incoming.fromNodeId)) {
          visitedNodeIds.add(incoming.fromNodeId);
          pendingNodeIds.push(incoming.fromNodeId);
        }
      }
    }

    const boundaryPipeIds = new Set<string>();

    for (const nodeId of visitedNodeIds) {
      for (const pipeId of unresolvedIncident.get(nodeId) ?? []) {
        boundaryPipeIds.add(pipeId);
      }
    }

    const outwardKnownPipeIds = [
      ...(knownOutgoing.get(outfall.id) ?? []),
    ].sort();
    const status: OutfallConnectivityStatus =
      outwardKnownPipeIds.length > 0
        ? 'direction_conflict'
        : upstreamPipeIds.size > 0
          ? 'known_upstream_path'
          : boundaryPipeIds.size > 0
            ? 'blocked_by_unresolved_direction'
            : 'isolated';
    const knownUpstreamNodeIds = [...visitedNodeIds]
      .filter((nodeId) => nodeId !== outfall.id)
      .sort();
    const sortedUpstreamPipeIds = [...upstreamPipeIds].sort();
    const sortedBoundaryPipeIds = [...boundaryPipeIds].sort();

    outfalls[outfall.id] = {
      outfallNodeId: outfall.id,
      status,
      knownUpstreamNodeIds,
      knownUpstreamPipeIds: sortedUpstreamPipeIds,
      unresolvedBoundaryPipeIds: sortedBoundaryPipeIds,
      outwardKnownPipeIds,
    };

    if (upstreamPipeIds.size > 0) {
      for (const nodeId of visitedNodeIds) {
        knownPathNodeIds.add(nodeId);
      }
      for (const pipeId of upstreamPipeIds) {
        knownPathPipeIds.add(pipeId);
      }
    }
    for (const pipeId of boundaryPipeIds) {
      unresolvedBoundaryPipeIds.add(pipeId);
    }
  }

  const states = Object.values(outfalls);

  return {
    modelVersion: OUTFALL_CONNECTIVITY_VERSION,
    orientationVersion: network.orientationVersion,
    evidenceBasis: network.evidenceBasis,
    minimumResolvableDropM: network.minimumResolvableDropM,
    numericComparisonToleranceM:
      network.numericComparisonToleranceM,
    outfalls,
    knownPathNodeIds: [...knownPathNodeIds].sort(),
    knownPathPipeIds: [...knownPathPipeIds].sort(),
    unresolvedBoundaryPipeIds: [
      ...unresolvedBoundaryPipeIds,
    ].sort(),
    counts: {
      outfalls: states.length,
      knownUpstreamPaths: states.filter(
        (state) => state.status === 'known_upstream_path',
      ).length,
      blockedByUnresolvedDirection: states.filter(
        (state) =>
          state.status === 'blocked_by_unresolved_direction',
      ).length,
      isolated: states.filter(
        (state) => state.status === 'isolated',
      ).length,
      directionConflicts: states.filter(
        (state) => state.status === 'direction_conflict',
      ).length,
      knownPathNodes: knownPathNodeIds.size,
      knownPathPipes: knownPathPipeIds.size,
      unresolvedBoundaryPipes: unresolvedBoundaryPipeIds.size,
    },
  };
}

export function composeNodeSourceTerms(
  topology: StormwaterTopology,
  contributions: readonly CatchmentContribution[],
  options: SourceTermOptions,
): NodeSourceTerms {
  validateContributionAttachments(topology, contributions);
  const contributionMap = new Map(
    contributions.map((contribution) => [
      contribution.catchmentId,
      contribution,
    ]),
  );
  const referenceContribution = contributions[0]?.totalVolumeM3;
  const attachmentsByNode = new Map<string, CatchmentAttachment[]>();

  for (const attachment of Object.values(
    topology.catchmentAttachments,
  )) {
    const current = attachmentsByNode.get(attachment.outletNodeId) ?? [];
    current.push(attachment);
    attachmentsByNode.set(attachment.outletNodeId, current);
  }

  const terms: Record<string, Evidence<number>> = {};
  const partialAvailableVolumeM3: Record<string, number> = {};

  for (const node of Object.values(topology.nodes)) {
    const attachments = attachmentsByNode.get(node.id) ?? [];
    const attachedContributions = attachments.map((attachment) =>
      contributionMap.get(attachment.catchmentId),
    );
    const missingContributionIds = attachments
      .filter(
        (_, index) => attachedContributions[index] === undefined,
      )
      .map((attachment) => attachment.catchmentId);
    const presentContributions = attachedContributions.filter(
      (
        contribution,
      ): contribution is CatchmentContribution =>
        contribution !== undefined,
    );
    const availableContributions = presentContributions.filter(
      (contribution) => contribution.totalVolumeM3.value !== null,
    );
    const partial = availableContributions.reduce(
      (sum, contribution) =>
        sum + (contribution.totalVolumeM3.value as number),
      0,
    );
    partialAvailableVolumeM3[node.id] = partial;
    const descriptor = nodeSourceDescriptor(
      node,
      options.derivedAt,
      attachments,
      presentContributions,
      referenceContribution,
    );

    if (missingContributionIds.length > 0) {
      terms[node.id] = unavailableEvidence(
        'missing',
        `No catchment contribution supplied for: ${missingContributionIds.join(', ')}`,
        descriptor,
      );
      continue;
    }

    if (contributionTimeKeys(presentContributions).size > 1) {
      terms[node.id] = unavailableEvidence(
        'invalid_response',
        'Attached catchments do not share one observation/window definition',
        descriptor,
      );
      continue;
    }

    const incompleteContributions = presentContributions.filter(
      (contribution) => contribution.totalVolumeM3.value === null,
    );

    if (incompleteContributions.length > 0) {
      const status = selectUnavailableEvidenceStatus(
        incompleteContributions.map(
          (contribution) =>
            contribution.totalVolumeM3.quality.status,
        ),
      );
      terms[node.id] = unavailableEvidence(
        status,
        `Attached catchment totals are incomplete: ${incompleteContributions
          .map((contribution) => contribution.catchmentId)
          .join(', ')}`,
        descriptor,
      );
      continue;
    }

    const containsSynthetic = presentContributions.some(
      (contribution) =>
        contribution.totalVolumeM3.quality.status ===
        'synthetic_fixture',
    );

    if (containsSynthetic) {
      terms[node.id] = syntheticFixtureEvidence(partial, {
        fixtureId: `node-source:${node.id}`,
        unit: 'm3',
        spatial: descriptor.spatial,
        temporal: descriptor.temporal,
        transformation: descriptor.provenance.transformation,
        transformationVersion:
          descriptor.provenance.transformationVersion,
        samplingMethod: descriptor.provenance.samplingMethod,
        sourceMetadata: descriptor.provenance.sourceMetadata,
      });
    } else {
      terms[node.id] = availableEvidence(partial, descriptor);
    }
  }

  return {
    terms,
    partialAvailableVolumeM3,
  };
}

export function propagateStormwaterContributions(
  network: OrientedStormwaterNetwork,
  sources: Readonly<Record<string, Evidence<number>>>,
  options: PropagationOptions,
): PropagationResult {
  const unresolvedPipeIds = Object.entries(network.directions)
    .filter(([, direction]) => direction.status !== 'known')
    .map(([pipeId]) => pipeId);

  if (unresolvedPipeIds.length > 0) {
    return {
      status: 'incomplete_direction',
      modelVersion: NETWORK_PROPAGATION_VERSION,
      reason:
        'Downstream accumulation requires every pipe direction to be known',
      pipeIds: unresolvedPipeIds,
      nodeIds: [],
    };
  }

  const sourceValidation = validateSourceTerms(
    network.topology,
    sources,
  );

  if (sourceValidation !== null) {
    return {
      status: 'incomplete_evidence',
      modelVersion: NETWORK_PROPAGATION_VERSION,
      reason: sourceValidation.reason,
      pipeIds: [],
      nodeIds: sourceValidation.nodeIds,
    };
  }

  const knownDirections = network.directions as Readonly<
    Record<string, KnownPipeDirection>
  >;
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const nodeId of Object.keys(network.topology.nodes)) {
    outgoing.set(nodeId, []);
    incoming.set(nodeId, []);
    indegree.set(nodeId, 0);
  }

  for (const [pipeId, direction] of Object.entries(
    knownDirections,
  )) {
    outgoing.get(direction.fromNodeId)?.push(pipeId);
    incoming.get(direction.toNodeId)?.push(pipeId);
    indegree.set(
      direction.toNodeId,
      (indegree.get(direction.toNodeId) ?? 0) + 1,
    );
  }

  const divergentNodeIds = [...outgoing.entries()]
    .filter(([, pipeIds]) => pipeIds.length > 1)
    .map(([nodeId]) => nodeId);

  if (divergentNodeIds.length > 0) {
    return {
      status: 'unsupported_divergence',
      modelVersion: NETWORK_PROPAGATION_VERSION,
      reason:
        'Proof 0 has no capacity or split model for nodes with multiple downstream pipes',
      pipeIds: divergentNodeIds.flatMap(
        (nodeId) => outgoing.get(nodeId) ?? [],
      ),
      nodeIds: divergentNodeIds,
    };
  }

  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId)
    .sort();
  const order: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift() as string;
    order.push(nodeId);

    for (const pipeId of outgoing.get(nodeId) ?? []) {
      const toNodeId = knownDirections[pipeId].toNodeId;
      const nextDegree = (indegree.get(toNodeId) ?? 0) - 1;
      indegree.set(toNodeId, nextDegree);

      if (nextDegree === 0) {
        queue.push(toNodeId);
        queue.sort();
      }
    }
  }

  if (order.length !== Object.keys(network.topology.nodes).length) {
    const cyclicNodeIds = [...indegree.entries()]
      .filter(([, degree]) => degree > 0)
      .map(([nodeId]) => nodeId);

    return {
      status: 'cyclic',
      modelVersion: NETWORK_PROPAGATION_VERSION,
      reason:
        'No-loss downstream accumulation requires an acyclic directed network',
      pipeIds: Object.keys(knownDirections),
      nodeIds: cyclicNodeIds,
    };
  }

  const accumulated = new Map<string, number>();
  const containsSynthetic = new Map<string, boolean>();
  const pipeVolumes = new Map<string, number>();
  const pipeSynthetic = new Map<string, boolean>();

  for (const nodeId of order) {
    accumulated.set(nodeId, sources[nodeId].value as number);
    containsSynthetic.set(
      nodeId,
      sources[nodeId].quality.status === 'synthetic_fixture',
    );
  }

  for (const nodeId of order) {
    const currentVolume = accumulated.get(nodeId) as number;
    const outgoingPipeId = (outgoing.get(nodeId) ?? [])[0];

    if (outgoingPipeId === undefined) {
      continue;
    }

    const direction = knownDirections[outgoingPipeId];
    const downstreamCurrent =
      accumulated.get(direction.toNodeId) as number;
    const currentIsSynthetic =
      containsSynthetic.get(nodeId) as boolean;
    pipeVolumes.set(outgoingPipeId, currentVolume);
    pipeSynthetic.set(outgoingPipeId, currentIsSynthetic);
    accumulated.set(
      direction.toNodeId,
      downstreamCurrent + currentVolume,
    );
    containsSynthetic.set(
      direction.toNodeId,
      (containsSynthetic.get(direction.toNodeId) as boolean) ||
        currentIsSynthetic,
    );
  }

  const firstSource = sources[order[0]];
  const nodeStates: Record<string, NodePropagationState> = {};

  for (const nodeId of order) {
    const descriptor = propagationDescriptor(
      network.topology.nodes[nodeId],
      options.derivedAt,
      firstSource,
      incoming.get(nodeId) ?? [],
    );
    const value = accumulated.get(nodeId) as number;
    const downstreamAccumulationM3 =
      containsSynthetic.get(nodeId)
        ? syntheticFixtureEvidence(value, {
            fixtureId: `node-accumulation:${nodeId}`,
            unit: 'm3',
            spatial: descriptor.spatial,
            temporal: descriptor.temporal,
            transformation: descriptor.provenance.transformation,
            transformationVersion:
              descriptor.provenance.transformationVersion,
            samplingMethod: descriptor.provenance.samplingMethod,
            sourceMetadata: descriptor.provenance.sourceMetadata,
          })
        : availableEvidence(value, descriptor);

    nodeStates[nodeId] = {
      localContributionM3: sources[nodeId],
      downstreamAccumulationM3,
    };
  }

  const pipeStates: Record<string, PipePropagationState> = {};

  for (const [pipeId, direction] of Object.entries(
    knownDirections,
  )) {
    const descriptor = pipePropagationDescriptor(
      network.topology.pipes[pipeId],
      direction,
      options.derivedAt,
      firstSource,
    );
    const value = pipeVolumes.get(pipeId) as number;
    const transferredVolumeM3 = pipeSynthetic.get(pipeId)
      ? syntheticFixtureEvidence(value, {
          fixtureId: `pipe-transfer:${pipeId}`,
          unit: 'm3',
          spatial: descriptor.spatial,
          temporal: descriptor.temporal,
          transformation: descriptor.provenance.transformation,
          transformationVersion:
            descriptor.provenance.transformationVersion,
          samplingMethod: descriptor.provenance.samplingMethod,
          sourceMetadata: descriptor.provenance.sourceMetadata,
        })
      : availableEvidence(value, descriptor);

    pipeStates[pipeId] = {
      direction,
      transferredVolumeM3,
    };
  }

  const terminalNodeIds = order.filter(
    (nodeId) => (outgoing.get(nodeId) ?? []).length === 0,
  );
  const localInputVolumeM3 = order.reduce(
    (sum, nodeId) => sum + (sources[nodeId].value as number),
    0,
  );
  const terminalVolumeM3 = terminalNodeIds.reduce(
    (sum, nodeId) => sum + (accumulated.get(nodeId) as number),
    0,
  );
  const outfallVolumeM3 = terminalNodeIds
    .filter(
      (nodeId) => network.topology.nodes[nodeId].type === 'outfall',
    )
    .reduce(
      (sum, nodeId) => sum + (accumulated.get(nodeId) as number),
      0,
    );

  return {
    status: 'complete',
    modelVersion: NETWORK_PROPAGATION_VERSION,
    nodes: nodeStates,
    pipes: pipeStates,
    terminalNodeIds,
    massBalance: {
      localInputVolumeM3,
      terminalVolumeM3,
      outfallVolumeM3,
      nonOutfallTerminalVolumeM3:
        terminalVolumeM3 - outfallVolumeM3,
      differenceM3: localInputVolumeM3 - terminalVolumeM3,
    },
  };
}

function validateContributionAttachments(
  topology: StormwaterTopology,
  contributions: readonly CatchmentContribution[],
): void {
  const seenContributionIds = new Set<string>();

  for (const contribution of contributions) {
    if (seenContributionIds.has(contribution.catchmentId)) {
      throw new Error(
        `Duplicate catchment contribution ${contribution.catchmentId}`,
      );
    }
    seenContributionIds.add(contribution.catchmentId);

    const attachment =
      topology.catchmentAttachments[contribution.catchmentId];

    if (attachment === undefined) {
      throw new Error(
        `Catchment contribution ${contribution.catchmentId} has no topology attachment`,
      );
    }

    if (attachment.outletNodeId !== contribution.outletNodeId) {
      throw new Error(
        `Catchment contribution ${contribution.catchmentId} targets ${contribution.outletNodeId}, expected ${attachment.outletNodeId}`,
      );
    }
  }
}

function contributionTimeKeys(
  contributions: readonly CatchmentContribution[],
): ReadonlySet<string> {
  return new Set(
    contributions.map((contribution) =>
      JSON.stringify({
        observedAt:
          contribution.totalVolumeM3.temporal.observedAt ?? null,
        windowStart:
          contribution.totalVolumeM3.temporal.windowStart ?? null,
        windowEnd:
          contribution.totalVolumeM3.temporal.windowEnd ?? null,
      }),
    ),
  );
}

function nodeSourceDescriptor(
  node: StormwaterNode,
  derivedAt: string,
  attachments: readonly CatchmentAttachment[],
  contributions: readonly CatchmentContribution[],
  referenceContribution: Evidence<number> | undefined,
): EvidenceDescriptor {
  const firstContribution =
    contributions[0]?.totalVolumeM3 ??
    referenceContribution;
  const sourceMetadata: Record<string, EvidenceMetadataValue> = {
    nodeId: node.id,
    catchmentIds: attachments.map(
      (attachment) => attachment.catchmentId,
    ),
    catchmentStatuses: contributions.map(
      (contribution) => contribution.totalVolumeM3.quality.status,
    ),
  };

  return {
    unit: 'm3',
    spatial: {
      h3: node.h3,
      lat: node.position.lat,
      lon: node.position.lon,
    },
    temporal: {
      observedAt: firstContribution?.temporal.observedAt,
      windowStart: firstContribution?.temporal.windowStart,
      windowEnd: firstContribution?.temporal.windowEnd,
      acquiredAt: derivedAt,
    },
    provenance: {
      provider: 'geolens-core',
      dataset: 'node-local-runoff-contribution',
      transformation: 'sum of explicitly attached catchment contributions',
      transformationVersion: NETWORK_PROPAGATION_VERSION,
      samplingMethod: 'sum of catchment runoff volume_m3',
      sourceMetadata,
    },
  };
}

function validateSourceTerms(
  topology: StormwaterTopology,
  sources: Readonly<Record<string, Evidence<number>>>,
): { readonly reason: string; readonly nodeIds: readonly string[] } | null {
  const nodeIds = Object.keys(topology.nodes);
  const sourceIds = Object.keys(sources);
  const missingNodeIds = nodeIds.filter(
    (nodeId) => sources[nodeId] === undefined,
  );
  const extraNodeIds = sourceIds.filter(
    (nodeId) => topology.nodes[nodeId] === undefined,
  );

  if (missingNodeIds.length > 0 || extraNodeIds.length > 0) {
    return {
      reason:
        `Source terms must match network nodes; missing=[${missingNodeIds.join(', ')}], extra=[${extraNodeIds.join(', ')}]`,
      nodeIds: [...missingNodeIds, ...extraNodeIds],
    };
  }

  const invalidNodeIds: string[] = [];
  const unavailableNodeIds: string[] = [];
  const timeKeys = new Set<string>();

  for (const nodeId of nodeIds) {
    const source = sources[nodeId];

    try {
      assertEvidenceInvariant(source);
    } catch {
      invalidNodeIds.push(nodeId);
      continue;
    }

    if (source.unit !== 'm3') {
      invalidNodeIds.push(nodeId);
      continue;
    }

    if (source.value === null) {
      unavailableNodeIds.push(nodeId);
      continue;
    }

    if (!Number.isFinite(source.value) || source.value < 0) {
      invalidNodeIds.push(nodeId);
      continue;
    }

    timeKeys.add(
      JSON.stringify({
        observedAt: source.temporal.observedAt ?? null,
        windowStart: source.temporal.windowStart ?? null,
        windowEnd: source.temporal.windowEnd ?? null,
      }),
    );
  }

  if (invalidNodeIds.length > 0) {
    return {
      reason:
        'Every node source must be valid non-negative m3 evidence',
      nodeIds: invalidNodeIds,
    };
  }

  if (unavailableNodeIds.length > 0) {
    return {
      reason:
        'Downstream accumulation is unavailable while node source evidence is incomplete',
      nodeIds: unavailableNodeIds,
    };
  }

  if (timeKeys.size > 1) {
    return {
      reason:
        'Node source terms do not share one observation/window definition',
      nodeIds,
    };
  }

  return null;
}

function propagationDescriptor(
  node: StormwaterNode,
  derivedAt: string,
  firstSource: Evidence<number>,
  incomingPipeIds: readonly string[],
): EvidenceDescriptor {
  return {
    unit: 'm3',
    spatial: {
      h3: node.h3,
      lat: node.position.lat,
      lon: node.position.lon,
    },
    temporal: {
      observedAt: firstSource.temporal.observedAt,
      windowStart: firstSource.temporal.windowStart,
      windowEnd: firstSource.temporal.windowEnd,
      acquiredAt: derivedAt,
    },
    provenance: {
      provider: 'geolens-core',
      dataset: 'node-downstream-accumulation',
      transformation:
        'topological no-loss accumulation of local runoff volumes',
      transformationVersion: NETWORK_PROPAGATION_VERSION,
      samplingMethod:
        'local contribution plus all known directed upstream transfers',
      sourceMetadata: {
        nodeId: node.id,
        incomingPipeIds,
      },
    },
  };
}

function pipePropagationDescriptor(
  pipe: StormwaterPipe,
  direction: KnownPipeDirection,
  derivedAt: string,
  firstSource: Evidence<number>,
): EvidenceDescriptor {
  return {
    unit: 'm3',
    spatial: {},
    temporal: {
      observedAt: firstSource.temporal.observedAt,
      windowStart: firstSource.temporal.windowStart,
      windowEnd: firstSource.temporal.windowEnd,
      acquiredAt: derivedAt,
    },
    provenance: {
      provider: 'geolens-core',
      dataset: 'pipe-transferred-runoff-volume',
      transformation:
        'transfer complete upstream accumulation through sole downstream pipe',
      transformationVersion: NETWORK_PROPAGATION_VERSION,
      samplingMethod:
        'no loss, decay, capacity, travel-time, or hydraulic routing',
      sourceMetadata: {
        pipeId: pipe.id,
        fromNodeId: direction.fromNodeId,
        toNodeId: direction.toNodeId,
        evidenceBasis: direction.evidenceBasis,
        verticalDropM: direction.verticalDropM,
        grade: direction.grade,
      },
    },
  };
}
