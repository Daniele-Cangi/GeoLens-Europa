import {
  availableEvidence,
  Evidence,
  EvidenceDescriptor,
  syntheticFixtureEvidence,
  unavailableEvidence,
} from '@geo-lens/evidence';

import {
  assertInfrastructureAssetSource,
  InfrastructureAssetSource,
} from './infrastructure';
import { StormwaterTopology } from './network';

export const BGT_INFLOW_TABLE_STANDARD = 'STOWA-2025-02';
export const BGT_INFLOW_ATTACHMENT_VERSION =
  'bgt-inflow-table-network-attachment-v0.1.0';
export const BGT_INFLOW_TABLE_DOCUMENTATION_URL =
  'https://www.stowa.nl/publicaties/handleiding-voor-de-bgt-inlooptabel-uniforme-koppeling-van-inloop-en-riolering-update-2025';

export type BgtInflowDestination =
  | 'combined_sewer'
  | 'stormwater_sewer'
  | 'improved_stormwater_sewer'
  | 'wastewater_sewer'
  | 'infiltration_facility'
  | 'open_water'
  | 'surface';

export interface BgtInflowPercentages {
  readonly combinedSewer: number;
  readonly stormwaterSewer: number;
  readonly improvedStormwaterSewer: number;
  readonly wastewaterSewer: number;
  readonly infiltrationFacility: number;
  readonly openWater: number;
  readonly surface: number;
}

export interface BgtInflowNetworkAssetCodes {
  readonly combinedSewer?: string;
  readonly stormwaterSewer?: string;
  readonly wastewaterSewer?: string;
  readonly infiltrationFacility?: string;
}

export interface BgtInflowTableRecord {
  readonly id: string;
  readonly bgtIdentification: string;
  readonly lastModified: string;
  readonly manuallyModified?: boolean;
  readonly publisherRole: 'network_owner_or_authorized_delegate';
  readonly percentages: BgtInflowPercentages;
  readonly networkAssetCodes?: BgtInflowNetworkAssetCodes;
  readonly source: InfrastructureAssetSource;
}

export interface BgtInflowDestinationObservation {
  readonly recordId: string;
  readonly bgtIdentification: string;
  readonly destination: BgtInflowDestination;
  readonly percentage: number;
  readonly networkAssetCode: string | null;
  readonly firstPublicSystemDestination: true;
  readonly lastModified: string;
  readonly manuallyModified: boolean | null;
}

type SewerDestination =
  | 'combined_sewer'
  | 'stormwater_sewer'
  | 'improved_stormwater_sewer'
  | 'wastewater_sewer';

export interface AuthoritativeSurfaceNetworkAttachment {
  readonly recordId: string;
  readonly bgtIdentification: string;
  readonly destination: SewerDestination;
  readonly percentage: number;
  readonly firstPublicSystemDestination: true;
  readonly target: {
    readonly entityType: 'pipe';
    readonly pipeId: string;
    readonly sourceRecordId: string;
    readonly matchedCode: string;
    readonly matchMethod:
      | 'exact_pipe_id'
      | 'exact_source_record_id'
      | 'exact_source_name'
      | 'exact_source_uri';
  };
}

export interface UnresolvedBgtInflowNetworkDestination {
  readonly recordId: string;
  readonly bgtIdentification: string;
  readonly destination: SewerDestination;
  readonly percentage: number;
  readonly networkAssetCode: string | null;
  readonly reason:
    | 'asset_code_not_published'
    | 'no_exact_observed_topology_match'
    | 'matched_asset_not_observed';
}

export interface BgtInflowAttachmentAssessment {
  readonly modelVersion: typeof BGT_INFLOW_ATTACHMENT_VERSION;
  readonly standard: typeof BGT_INFLOW_TABLE_STANDARD;
  readonly documentationUrl:
    typeof BGT_INFLOW_TABLE_DOCUMENTATION_URL;
  readonly destinationObservations: Evidence<
    readonly BgtInflowDestinationObservation[]
  >;
  readonly networkAttachments: Evidence<
    readonly AuthoritativeSurfaceNetworkAttachment[]
  >;
  readonly unresolvedNetworkDestinations:
    readonly UnresolvedBgtInflowNetworkDestination[];
  readonly propagationEligible: boolean;
}

interface DestinationField {
  readonly destination: BgtInflowDestination;
  readonly percentageKey: keyof BgtInflowPercentages;
  readonly codeKey?: keyof BgtInflowNetworkAssetCodes;
}

const DESTINATION_FIELDS: readonly DestinationField[] = [
  {
    destination: 'combined_sewer',
    percentageKey: 'combinedSewer',
    codeKey: 'combinedSewer',
  },
  {
    destination: 'stormwater_sewer',
    percentageKey: 'stormwaterSewer',
    codeKey: 'stormwaterSewer',
  },
  {
    destination: 'improved_stormwater_sewer',
    percentageKey: 'improvedStormwaterSewer',
    codeKey: 'stormwaterSewer',
  },
  {
    destination: 'wastewater_sewer',
    percentageKey: 'wastewaterSewer',
    codeKey: 'wastewaterSewer',
  },
  {
    destination: 'infiltration_facility',
    percentageKey: 'infiltrationFacility',
    codeKey: 'infiltrationFacility',
  },
  {
    destination: 'open_water',
    percentageKey: 'openWater',
  },
  {
    destination: 'surface',
    percentageKey: 'surface',
  },
];

interface PipeAlias {
  readonly pipeId: string;
  readonly sourceRecordId: string;
  readonly observed: boolean;
  readonly matchMethod:
    AuthoritativeSurfaceNetworkAttachment['target']['matchMethod'];
}

export function assessBgtInflowTableAttachments(
  records: readonly BgtInflowTableRecord[],
  topology: StormwaterTopology,
  options: { readonly acquiredAt: string },
): BgtInflowAttachmentAssessment {
  if (records.length === 0) {
    return missingBgtInflowTableAttachmentAssessment({
      acquiredAt: options.acquiredAt,
      missingReason:
        'No owner-published BGT Inlooptabel records were supplied for the bounded area',
    });
  }

  const descriptor = assessmentDescriptor(records, options.acquiredAt);

  try {
    validateBgtInflowTableRecords(records);
    const observations = destinationObservations(records);
    const aliases = pipeAliases(topology);
    const synthetic = records[0].source.origin === 'synthetic_fixture';
    const attachments: AuthoritativeSurfaceNetworkAttachment[] = [];
    const unresolved: UnresolvedBgtInflowNetworkDestination[] = [];

    for (const observation of observations) {
      if (!isSewerDestination(observation.destination)) continue;

      const identity = {
        recordId: observation.recordId,
        bgtIdentification: observation.bgtIdentification,
        destination: observation.destination,
        percentage: observation.percentage,
        networkAssetCode: observation.networkAssetCode,
      };

      if (observation.networkAssetCode === null) {
        unresolved.push({
          ...identity,
          reason: 'asset_code_not_published',
        });
        continue;
      }

      const matches = aliases.get(observation.networkAssetCode) ?? [];
      if (matches.length === 0) {
        unresolved.push({
          ...identity,
          reason: 'no_exact_observed_topology_match',
        });
        continue;
      }

      const pipeIds = new Set(matches.map((match) => match.pipeId));
      if (pipeIds.size !== 1) {
        throw new Error(
          'Network asset code ' +
            observation.networkAssetCode +
            ' matches more than one pipe',
        );
      }

      const match = matches[0];
      if (!match.observed && !synthetic) {
        unresolved.push({
          ...identity,
          reason: 'matched_asset_not_observed',
        });
        continue;
      }

      attachments.push({
        recordId: observation.recordId,
        bgtIdentification: observation.bgtIdentification,
        destination: observation.destination,
        percentage: observation.percentage,
        firstPublicSystemDestination: true,
        target: {
          entityType: 'pipe',
          pipeId: match.pipeId,
          sourceRecordId: match.sourceRecordId,
          matchedCode: observation.networkAssetCode,
          matchMethod: match.matchMethod,
        },
      });
    }

    const destinationEvidence = synthetic
      ? syntheticFixtureEvidence(observations, {
          fixtureId: 'bgt-inflow-destination-observations',
          spatial: descriptor.spatial,
          temporal: descriptor.temporal,
          transformation: descriptor.provenance.transformation,
          transformationVersion:
            descriptor.provenance.transformationVersion,
          samplingMethod: descriptor.provenance.samplingMethod,
          sourceMetadata: descriptor.provenance.sourceMetadata,
        })
      : availableEvidence(observations, descriptor);
    const networkAttachments = buildAttachmentEvidence(
      attachments,
      synthetic,
      descriptor,
    );

    return {
      modelVersion: BGT_INFLOW_ATTACHMENT_VERSION,
      standard: BGT_INFLOW_TABLE_STANDARD,
      documentationUrl: BGT_INFLOW_TABLE_DOCUMENTATION_URL,
      destinationObservations: destinationEvidence,
      networkAttachments,
      unresolvedNetworkDestinations: unresolved,
      propagationEligible:
        networkAttachments.quality.status === 'available' &&
        networkAttachments.value !== null &&
        networkAttachments.value.length > 0 &&
        unresolved.length === 0,
    };
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : 'Invalid BGT Inlooptabel records';

    return {
      modelVersion: BGT_INFLOW_ATTACHMENT_VERSION,
      standard: BGT_INFLOW_TABLE_STANDARD,
      documentationUrl: BGT_INFLOW_TABLE_DOCUMENTATION_URL,
      destinationObservations: unavailableEvidence(
        'invalid_response',
        reason,
        descriptor,
      ),
      networkAttachments: unavailableEvidence(
        'invalid_response',
        reason,
        descriptor,
      ),
      unresolvedNetworkDestinations: [],
      propagationEligible: false,
    };
  }
}

export function missingBgtInflowTableAttachmentAssessment(input: {
  readonly acquiredAt: string;
  readonly missingReason: string;
}): BgtInflowAttachmentAssessment {
  const descriptor: EvidenceDescriptor = {
    spatial: {},
    temporal: { acquiredAt: input.acquiredAt },
    provenance: {
      provider: 'Amsterdam surface-water authority',
      dataset:
        'BGT Inlooptabel or equivalent owner-published surface-to-network relation',
      datasetVersion: BGT_INFLOW_TABLE_STANDARD,
      transformation:
        'preserve absence of an authoritative first-destination relation',
      transformationVersion: BGT_INFLOW_ATTACHMENT_VERSION,
      samplingMethod: 'no spatial or identifier inference',
      sourceMetadata: {
        documentationUrl: BGT_INFLOW_TABLE_DOCUMENTATION_URL,
      },
    },
  };

  return {
    modelVersion: BGT_INFLOW_ATTACHMENT_VERSION,
    standard: BGT_INFLOW_TABLE_STANDARD,
    documentationUrl: BGT_INFLOW_TABLE_DOCUMENTATION_URL,
    destinationObservations: unavailableEvidence(
      'missing',
      input.missingReason,
      descriptor,
    ),
    networkAttachments: unavailableEvidence(
      'missing',
      input.missingReason,
      descriptor,
    ),
    unresolvedNetworkDestinations: [],
    propagationEligible: false,
  };
}

function buildAttachmentEvidence(
  attachments: readonly AuthoritativeSurfaceNetworkAttachment[],
  synthetic: boolean,
  descriptor: EvidenceDescriptor,
): Evidence<readonly AuthoritativeSurfaceNetworkAttachment[]> {
  if (attachments.length === 0) {
    return unavailableEvidence(
      'missing',
      'No positive sewer destination carries an asset code that exactly matches an observed topology pipe',
      descriptor,
    );
  }

  if (synthetic) {
    return syntheticFixtureEvidence(attachments, {
      fixtureId: 'bgt-inflow-network-attachments',
      spatial: descriptor.spatial,
      temporal: descriptor.temporal,
      transformation:
        'exact synthetic BGT Inlooptabel asset-code match to synthetic topology pipe',
      transformationVersion: BGT_INFLOW_ATTACHMENT_VERSION,
      samplingMethod: 'exact identifier match only',
      sourceMetadata: descriptor.provenance.sourceMetadata,
    });
  }

  return availableEvidence(attachments, {
    ...descriptor,
    provenance: {
      ...descriptor.provenance,
      transformation:
        'exact BGT Inlooptabel asset-code match to observed topology pipe',
      samplingMethod: 'exact identifier match only',
    },
  });
}

export function validateBgtInflowTableRecords(
  records: readonly BgtInflowTableRecord[],
): void {
  const ids = new Set<string>();
  const totals = new Map<string, number>();
  const firstSource = records[0].source;
  const origin = firstSource.origin;

  if (origin !== 'observed_public_record' && origin !== 'synthetic_fixture') {
    throw new Error(
      'Authoritative BGT Inlooptabel input must be an observed public record; only tests may use synthetic fixtures',
    );
  }

  for (const record of records) {
    assertInfrastructureAssetSource(record.source);
    assertNonEmpty('record id', record.id);
    assertNonEmpty('BGT identification', record.bgtIdentification);
    if (
      record.publisherRole !==
      'network_owner_or_authorized_delegate'
    ) {
      throw new Error(
        'BGT Inlooptabel record ' +
          record.id +
          ' is not published by the network owner or an authorized delegate',
      );
    }

    if (ids.has(record.id)) {
      throw new Error('Duplicate BGT Inlooptabel record id ' + record.id);
    }
    ids.add(record.id);

    if (Number.isNaN(Date.parse(record.lastModified))) {
      throw new Error(
        'BGT Inlooptabel record ' +
          record.id +
          ' has an invalid lastModified timestamp',
      );
    }

    if (
      record.source.origin !== origin ||
      record.source.provider !== firstSource.provider ||
      record.source.dataset !== firstSource.dataset
    ) {
      throw new Error(
        'BGT Inlooptabel records must share one provider, dataset, and evidence origin',
      );
    }

    let rowTotal = 0;
    for (const field of DESTINATION_FIELDS) {
      const percentage = record.percentages[field.percentageKey];
      if (
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100
      ) {
        throw new Error(
          'BGT Inlooptabel record ' +
            record.id +
            ' has invalid ' +
            field.percentageKey +
            ' percentage',
        );
      }
      rowTotal += percentage;

      if (field.codeKey !== undefined) {
        const code = record.networkAssetCodes?.[field.codeKey];
        if (code !== undefined && code.trim().length === 0) {
          throw new Error(
            'BGT Inlooptabel record ' +
              record.id +
              ' has an empty ' +
              field.codeKey +
              ' asset code',
          );
        }
      }
    }

    totals.set(
      record.bgtIdentification,
      (totals.get(record.bgtIdentification) ?? 0) + rowTotal,
    );
  }

  for (const [bgtIdentification, total] of totals) {
    if (total < 99 || total > 101) {
      throw new Error(
        'BGT Inlooptabel allocations for ' +
          bgtIdentification +
          ' total ' +
          total +
          '%; expected 99% to 101%',
      );
    }
  }
}

function destinationObservations(
  records: readonly BgtInflowTableRecord[],
): BgtInflowDestinationObservation[] {
  return records.flatMap((record) =>
    DESTINATION_FIELDS.flatMap((field) => {
      const percentage = record.percentages[field.percentageKey];
      if (percentage === 0) return [];

      const code =
        field.codeKey === undefined
          ? undefined
          : record.networkAssetCodes?.[field.codeKey];

      return [{
        recordId: record.id,
        bgtIdentification: record.bgtIdentification,
        destination: field.destination,
        percentage,
        networkAssetCode: code?.trim() ?? null,
        firstPublicSystemDestination: true as const,
        lastModified: record.lastModified,
        manuallyModified: record.manuallyModified ?? null,
      }];
    }),
  );
}

function pipeAliases(
  topology: StormwaterTopology,
): ReadonlyMap<string, readonly PipeAlias[]> {
  const aliases = new Map<string, PipeAlias[]>();

  for (const pipe of Object.values(topology.pipes)) {
    const observed = pipe.source.origin === 'observed_public_record';
    addPipeAlias(aliases, pipe.id, pipe, observed, 'exact_pipe_id');
    addPipeAlias(
      aliases,
      pipe.source.sourceRecordId,
      pipe,
      observed,
      'exact_source_record_id',
    );

    const name = pipe.source.sourceAttributes?.naam;
    if (typeof name === 'string' && name.trim().length > 0) {
      addPipeAlias(
        aliases,
        name,
        pipe,
        observed,
        'exact_source_name',
      );
    }

    const uri = pipe.source.sourceAttributes?.uri;
    if (typeof uri === 'string' && uri.trim().length > 0) {
      addPipeAlias(
        aliases,
        uri,
        pipe,
        observed,
        'exact_source_uri',
      );
    }
  }

  return aliases;
}

function addPipeAlias(
  aliases: Map<string, PipeAlias[]>,
  alias: string,
  pipe: StormwaterTopology['pipes'][string],
  observed: boolean,
  matchMethod: PipeAlias['matchMethod'],
): void {
  const current = aliases.get(alias) ?? [];
  if (
    !current.some(
      (candidate) =>
        candidate.pipeId === pipe.id &&
        candidate.matchMethod === matchMethod,
    )
  ) {
    current.push({
      pipeId: pipe.id,
      sourceRecordId: pipe.source.sourceRecordId,
      observed,
      matchMethod,
    });
    aliases.set(alias, current);
  }
}

function assessmentDescriptor(
  records: readonly BgtInflowTableRecord[],
  acquiredAt: string,
): EvidenceDescriptor {
  const source = records[0].source;
  const validModifiedAt = records
    .map((record) => record.lastModified)
    .filter((timestamp) => !Number.isNaN(Date.parse(timestamp)));

  return {
    spatial: { sourceResolution: 'BGT source polygon' },
    temporal: {
      observedAt:
        validModifiedAt.length === records.length
          ? latestTimestamp(validModifiedAt)
          : undefined,
      acquiredAt,
    },
    provenance: {
      provider:
        source.provider.trim().length > 0
          ? source.provider
          : 'invalid BGT Inlooptabel provider',
      dataset:
        source.dataset.trim().length > 0
          ? source.dataset
          : 'invalid BGT Inlooptabel dataset',
      datasetVersion:
        source.datasetVersion ?? BGT_INFLOW_TABLE_STANDARD,
      transformation:
        'retain positive first-public-system destination allocations from BGT Inlooptabel records',
      transformationVersion: BGT_INFLOW_ATTACHMENT_VERSION,
      samplingMethod:
        'group allocations by BGT identification; require 99% to 101% total',
      sourceMetadata: {
        standard: BGT_INFLOW_TABLE_STANDARD,
        documentationUrl: BGT_INFLOW_TABLE_DOCUMENTATION_URL,
        publisherRole: records[0].publisherRole,
        recordIds: records.map((record) => record.id),
        bgtIdentifications: [
          ...new Set(
            records.map((record) => record.bgtIdentification),
          ),
        ],
      },
    },
  };
}

function latestTimestamp(timestamps: readonly string[]): string {
  return timestamps.reduce((latest, timestamp) =>
    Date.parse(timestamp) > Date.parse(latest) ? timestamp : latest,
  );
}

function isSewerDestination(
  destination: BgtInflowDestination,
): destination is SewerDestination {
  return (
    destination === 'combined_sewer' ||
    destination === 'stormwater_sewer' ||
    destination === 'improved_stormwater_sewer' ||
    destination === 'wastewater_sewer'
  );
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(label + ' must be non-empty');
  }
}
