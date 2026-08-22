import {
  availableEvidence,
  Evidence,
  EvidenceMetadataValue,
  unavailableEvidence,
} from '@geo-lens/evidence';
import { latLngToCell } from 'h3-js';

import {
  infrastructureAssetSource,
  InfrastructureDatasetSource,
} from './infrastructure';
import {
  createStormwaterTopology,
  GeoPoint,
  StormwaterNode,
  StormwaterNodeType,
  StormwaterPipe,
  StormwaterTopology,
} from './network';

export const AMSTERDAM_WATERNET_IMPORT_VERSION =
  'amsterdam-waternet-wfs-import-v0.1.0';

export const AMSTERDAM_WATERNET_DATASET_URL =
  'https://api.data.amsterdam.nl/v1/docs/datasets/leidingeninfrastructuur.html';

const DATASET = 'Leidingeninfrastructuur';
const PROVIDER = 'Gemeente Amsterdam Data API / Waternet';
const LICENSE = 'Creative Commons Attribution';
const SOURCE_CRS = 'EPSG:7415';
const OUTPUT_CRS = 'EPSG:4326';

export interface AmsterdamWaternetImportOptions {
  readonly networkId: string;
  readonly acquiredAt: string;
  readonly nodeH3Resolution: number;
  readonly snapToleranceM: number;
  readonly bboxWfsAxisOrder: string;
  readonly retrievalMode: 'live' | 'recorded_response';
}

export type AmsterdamWaternetDiagnosticCode =
  | 'pipe_endpoint_outside_snapshot'
  | 'pipe_endpoint_ambiguous'
  | 'pipe_self_loop';

export interface AmsterdamWaternetDiagnostic {
  readonly code: AmsterdamWaternetDiagnosticCode;
  readonly pipeSourceRecordId: string;
  readonly message: string;
}

export interface AmsterdamWaternetImportReceipt {
  readonly source: InfrastructureDatasetSource;
  readonly retrievalMode: 'live' | 'recorded_response';
  readonly query: {
    readonly bboxWfsAxisOrder: string;
    readonly nodeTypeName: 'app:waternet_rioolknopen';
    readonly pipeTypeName: 'app:waternet_rioolleidingen';
  };
  readonly counts: {
    readonly nodeFeatures: number;
    readonly pipeFeatures: number;
    readonly activeNodeFeatures: number;
    readonly matchingStormwaterPipes: number;
    readonly importedNodes: number;
    readonly importedPipes: number;
    readonly skippedBoundaryPipes: number;
    readonly skippedAmbiguousPipes: number;
    readonly skippedSelfLoops: number;
  };
  readonly deliveryDates: readonly string[];
  readonly endpointLinkPolicy: {
    readonly method: 'geometry_endpoint_nearest_node';
    readonly snapToleranceM: number;
    readonly sourceEndpointAttributes:
      | 'ignored_invalid_self_referential'
      | 'ignored_unverified';
  };
  readonly diagnostics: readonly AmsterdamWaternetDiagnostic[];
  readonly catchmentState: {
    readonly status: 'not_provided_by_source';
    readonly attachmentsCreated: 0;
  };
}

export interface ImportedAmsterdamWaternetNetwork {
  readonly topology: StormwaterTopology;
  readonly receipt: AmsterdamWaternetImportReceipt;
}

interface WfsFeature {
  readonly id: string;
  readonly properties: Record<string, unknown>;
  readonly geometry: {
    readonly type: string;
    readonly coordinates: unknown;
  };
}

interface ParsedNodeRecord {
  readonly id: string;
  readonly sourceRecordId: string;
  readonly position: GeoPoint;
  readonly properties: Record<string, unknown>;
}

interface SnapMatch {
  readonly node: ParsedNodeRecord;
  readonly distanceM: number;
}

type SnapResult =
  | {
      readonly status: 'matched';
      readonly match: SnapMatch;
    }
  | {
      readonly status: 'missing';
    }
  | {
      readonly status: 'ambiguous';
      readonly candidateIds: readonly string[];
    };

export function importAmsterdamWaternetStormwater(
  input: unknown,
  options: AmsterdamWaternetImportOptions,
): ImportedAmsterdamWaternetNetwork {
  validateOptions(options);
  const snapshot = requireRecord(input, 'Waternet input');
  const nodeFeatures = parseFeatureCollection(
    snapshot.nodes,
    'Waternet nodes',
  );
  const pipeFeatures = parseFeatureCollection(
    snapshot.pipes,
    'Waternet pipes',
  );
  const activeNodeFeatures = nodeFeatures.filter(
    (feature) => feature.properties.status === 'In bedrijf',
  );
  const matchingPipes = pipeFeatures.filter(
    (feature) =>
      feature.properties.status === 'In bedrijf' &&
      feature.properties.type_leiding === 'Hemelwaterriool' &&
      feature.properties.stelsel_type === 'Hemelwaterstelsel',
  );
  const deliveryDates = uniqueStrings([
    ...activeNodeFeatures.map(
      (feature) => feature.properties.leveringsdatum,
    ),
    ...matchingPipes.map(
      (feature) => feature.properties.leveringsdatum,
    ),
  ]);
  const source = sourceDescriptor(options, deliveryDates);
  const nodeRecords = activeNodeFeatures.map(parseNodeRecord);
  const nodeById = new Map(
    nodeRecords.map((node) => [node.id, node]),
  );
  const importedPipes: StormwaterPipe[] = [];
  const diagnostics: AmsterdamWaternetDiagnostic[] = [];
  const usedNodeIds = new Set<string>();
  let skippedBoundaryPipes = 0;
  let skippedAmbiguousPipes = 0;
  let skippedSelfLoops = 0;

  for (const feature of matchingPipes) {
    const sourceRecordId = requiredString(
      feature.properties.globalid,
      `Pipe ${feature.id} globalid`,
    );

    if (feature.geometry.type !== 'LineString') {
      throw new Error(
        `Waternet pipe ${sourceRecordId} must use LineString geometry`,
      );
    }

    const coordinates = lineCoordinates(
      feature.geometry.coordinates,
      `Waternet pipe ${sourceRecordId}`,
    );
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    const startSnap = snapNode(
      start,
      nodeRecords,
      options.snapToleranceM,
    );
    const endSnap = snapNode(
      end,
      nodeRecords,
      options.snapToleranceM,
    );

    if (
      startSnap.status === 'missing' ||
      endSnap.status === 'missing'
    ) {
      skippedBoundaryPipes += 1;
      diagnostics.push({
        code: 'pipe_endpoint_outside_snapshot',
        pipeSourceRecordId: sourceRecordId,
        message:
          'At least one geometry endpoint has no observed node inside the bounded response',
      });
      continue;
    }

    if (
      startSnap.status === 'ambiguous' ||
      endSnap.status === 'ambiguous'
    ) {
      skippedAmbiguousPipes += 1;
      diagnostics.push({
        code: 'pipe_endpoint_ambiguous',
        pipeSourceRecordId: sourceRecordId,
        message:
          'At least one geometry endpoint matches multiple observed nodes within the snap tolerance',
      });
      continue;
    }

    const nodeAId = startSnap.match.node.id;
    const nodeBId = endSnap.match.node.id;

    if (nodeAId === nodeBId) {
      skippedSelfLoops += 1;
      diagnostics.push({
        code: 'pipe_self_loop',
        pipeSourceRecordId: sourceRecordId,
        message:
          'Both geometry endpoints resolve to the same observed node',
      });
      continue;
    }

    usedNodeIds.add(nodeAId);
    usedNodeIds.add(nodeBId);

    const diameter = optionalFiniteNumber(
      feature.properties.diameter,
      `Pipe ${sourceRecordId} diameter`,
    );
    const bobStart = optionalFiniteNumber(
      feature.properties.bob_beginpunt,
      `Pipe ${sourceRecordId} bob_beginpunt`,
    );
    const bobEnd = optionalFiniteNumber(
      feature.properties.bob_eindpunt,
      `Pipe ${sourceRecordId} bob_eindpunt`,
    );
    const path = coordinates.map(([lon, lat]) => ({
      lat,
      lon,
    }));

    importedPipes.push({
      id: `waternet:${sourceRecordId}`,
      nodeAId,
      nodeBId,
      lengthM: pathLengthM(coordinates),
      diameterMm: diameter ?? undefined,
      path,
      invertLevelAM: invertEvidence(
        bobStart,
        'A',
        sourceRecordId,
        start,
        source,
      ),
      invertLevelBM: invertEvidence(
        bobEnd,
        'B',
        sourceRecordId,
        end,
        source,
      ),
      source: infrastructureAssetSource(
        source,
        sourceRecordId,
        compactMetadata({
          status: feature.properties.status,
          installedYear: feature.properties.jaar_gelegd,
          sourceType: feature.properties.type_leiding,
          systemType: feature.properties.stelsel_type,
          material: feature.properties.materiaal,
          shape: feature.properties.vorm,
          diameterMm: diameter,
          invertStartMNap: bobStart,
          invertEndMNap: bobEnd,
          geometryStartZM: start[2],
          geometryEndZM: end[2],
          deliveryDate: feature.properties.leveringsdatum,
          sourceBeginNodeId:
            feature.properties.globalid_beginknoop,
          sourceEndNodeId:
            feature.properties.globalid_eindknoop,
          sourceEndpointAttributesUsed: false,
          snappedStartDistanceM:
            startSnap.match.distanceM,
          snappedEndDistanceM:
            endSnap.match.distanceM,
        }),
      ),
    });
  }

  const nodes = [...usedNodeIds]
    .map((id) => {
      const record = nodeById.get(id);

      if (record === undefined) {
        throw new Error(
          `Internal import error: used Waternet node ${id} is absent`,
        );
      }

      return buildNode(record, source, options.nodeH3Resolution);
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const topology = createStormwaterTopology({
    id: options.networkId,
    nodes,
    pipes: importedPipes,
    catchmentAttachments: [],
  });
  const sourceEndpointAttributes = matchingPipes.every(
    (feature) => {
      const globalId = feature.properties.globalid;

      return (
        typeof globalId === 'string' &&
        feature.properties.globalid_beginknoop === globalId &&
        feature.properties.globalid_eindknoop === globalId
      );
    },
  )
    ? 'ignored_invalid_self_referential'
    : 'ignored_unverified';

  return {
    topology,
    receipt: {
      source,
      retrievalMode: options.retrievalMode,
      query: {
        bboxWfsAxisOrder: options.bboxWfsAxisOrder,
        nodeTypeName: 'app:waternet_rioolknopen',
        pipeTypeName: 'app:waternet_rioolleidingen',
      },
      counts: {
        nodeFeatures: nodeFeatures.length,
        pipeFeatures: pipeFeatures.length,
        activeNodeFeatures: activeNodeFeatures.length,
        matchingStormwaterPipes: matchingPipes.length,
        importedNodes: nodes.length,
        importedPipes: importedPipes.length,
        skippedBoundaryPipes,
        skippedAmbiguousPipes,
        skippedSelfLoops,
      },
      deliveryDates,
      endpointLinkPolicy: {
        method: 'geometry_endpoint_nearest_node',
        snapToleranceM: options.snapToleranceM,
        sourceEndpointAttributes,
      },
      diagnostics,
      catchmentState: {
        status: 'not_provided_by_source',
        attachmentsCreated: 0,
      },
    },
  };
}

function buildNode(
  record: ParsedNodeRecord,
  source: InfrastructureDatasetSource,
  h3Resolution: number,
): StormwaterNode {
  const h3 = latLngToCell(
    record.position.lat,
    record.position.lon,
    h3Resolution,
  );
  const groundLevel = optionalFiniteNumber(
    record.properties.maaiveldniveau,
    `Node ${record.sourceRecordId} maaiveldniveau`,
  );

  return {
    id: record.id,
    type: mapNodeType(record.properties),
    position: record.position,
    h3,
    elevationM:
      groundLevel === null
        ? unavailableEvidence(
            'missing',
            `Waternet node ${record.sourceRecordId} has no maaiveldniveau`,
            elevationDescriptor(record, h3, source),
          )
        : availableEvidence(
            groundLevel,
            elevationDescriptor(record, h3, source),
          ),
    source: infrastructureAssetSource(
      source,
      record.sourceRecordId,
      compactMetadata({
        status: record.properties.status,
        installedYear: record.properties.jaar_gelegd,
        sourceKind: record.properties.soort,
        sourceNodeType: record.properties.type_knoop,
        sourceSubtype: record.properties.subtype,
        groundLevelMNap: groundLevel,
        deliveryDate: record.properties.leveringsdatum,
      }),
    ),
  };
}

function elevationDescriptor(
  record: ParsedNodeRecord,
  h3: string,
  source: InfrastructureDatasetSource,
) {
  return {
    unit: 'm',
    spatial: {
      h3,
      lat: record.position.lat,
      lon: record.position.lon,
      sourceResolution:
        'individual infrastructure point record; survey resolution unspecified',
    },
    temporal: {
      acquiredAt: source.acquiredAt,
    },
    provenance: {
      provider: source.provider,
      dataset: `${source.dataset}:rioolknopen`,
      datasetVersion: source.datasetVersion,
      transformation:
        'map Waternet maaiveldniveau to node ground elevation',
      transformationVersion:
        AMSTERDAM_WATERNET_IMPORT_VERSION,
      samplingMethod: 'source point attribute',
      sourceMetadata: {
        sourceRecordId: record.sourceRecordId,
        verticalDatum: 'NAP',
        deliveryDate:
          scalarMetadata(record.properties.leveringsdatum),
      },
    },
  };
}

function invertEvidence(
  value: number | null,
  endpoint: 'A' | 'B',
  sourceRecordId: string,
  coordinate: readonly [number, number, number | null],
  source: InfrastructureDatasetSource,
): Evidence<number> {
  const descriptor = {
    unit: 'm',
    spatial: {
      lat: coordinate[1],
      lon: coordinate[0],
      sourceResolution:
        'individual pipe endpoint attribute; survey resolution unspecified',
    },
    temporal: {
      acquiredAt: source.acquiredAt,
    },
    provenance: {
      provider: source.provider,
      dataset: `${source.dataset}:rioolleidingen`,
      datasetVersion: source.datasetVersion,
      transformation:
        `map Waternet bob_${endpoint === 'A' ? 'beginpunt' : 'eindpunt'} to snapped pipe endpoint`,
      transformationVersion:
        AMSTERDAM_WATERNET_IMPORT_VERSION,
      samplingMethod: 'source pipe endpoint attribute',
      sourceMetadata: {
        sourceRecordId,
        endpoint,
        verticalDatum: 'NAP',
      },
    },
  };

  return value === null
    ? unavailableEvidence(
        'missing',
        `Waternet pipe ${sourceRecordId} endpoint ${endpoint} has no invert level`,
        descriptor,
      )
    : availableEvidence(value, descriptor);
}

function parseNodeRecord(feature: WfsFeature): ParsedNodeRecord {
  const sourceRecordId = requiredString(
    feature.properties.globalid,
    `Node ${feature.id} globalid`,
  );

  if (feature.geometry.type !== 'Point') {
    throw new Error(
      `Waternet node ${sourceRecordId} must use Point geometry`,
    );
  }

  const coordinate = lonLatCoordinate(
    feature.geometry.coordinates,
    `Waternet node ${sourceRecordId}`,
  );

  return {
    id: `waternet:${sourceRecordId}`,
    sourceRecordId,
    position: {
      lon: coordinate[0],
      lat: coordinate[1],
    },
    properties: feature.properties,
  };
}

function mapNodeType(
  properties: Record<string, unknown>,
): StormwaterNodeType {
  const value = [
    properties.soort,
    properties.type_knoop,
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLocaleLowerCase('nl-NL');

  if (value.includes('uitlaat')) {
    return 'outfall';
  }

  if (
    value.includes('kolk') ||
    value.includes('inlaat') ||
    value.includes('inlet')
  ) {
    return 'inlet';
  }

  if (value.includes('put')) {
    return 'manhole';
  }

  return 'junction';
}

function sourceDescriptor(
  options: AmsterdamWaternetImportOptions,
  deliveryDates: readonly string[],
): InfrastructureDatasetSource {
  return {
    origin: 'observed_public_record',
    provider: PROVIDER,
    dataset: DATASET,
    datasetVersion:
      deliveryDates.length === 0
        ? undefined
        : `delivery-${deliveryDates.join('+')}`,
    sourceUrl: AMSTERDAM_WATERNET_DATASET_URL,
    license: LICENSE,
    acquiredAt: options.acquiredAt,
    sourceCrs: SOURCE_CRS,
    outputCrs: OUTPUT_CRS,
    transformation:
      'WFS reprojection to EPSG:4326, strict active stormwater filter, and nearest observed-node endpoint snapping',
    transformationVersion:
      AMSTERDAM_WATERNET_IMPORT_VERSION,
  };
}

function parseFeatureCollection(
  input: unknown,
  label: string,
): readonly WfsFeature[] {
  const collection = requireRecord(input, label);

  if (
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features)
  ) {
    throw new Error(
      `${label} must be a GeoJSON FeatureCollection`,
    );
  }

  return collection.features.map((value, index) => {
    const feature = requireRecord(
      value,
      `${label}.features[${index}]`,
    );
    const geometry = requireRecord(
      feature.geometry,
      `${label}.features[${index}].geometry`,
    );
    const properties = requireRecord(
      feature.properties,
      `${label}.features[${index}].properties`,
    );

    if (
      feature.type !== 'Feature' ||
      typeof feature.id !== 'string' ||
      feature.id.trim().length === 0 ||
      typeof geometry.type !== 'string' ||
      geometry.coordinates === undefined
    ) {
      throw new Error(
        `${label}.features[${index}] is not a valid identified GeoJSON Feature`,
      );
    }

    return {
      id: feature.id,
      properties,
      geometry: {
        type: geometry.type,
        coordinates: geometry.coordinates,
      },
    };
  });
}

function snapNode(
  coordinate: readonly [number, number, number | null],
  nodes: readonly ParsedNodeRecord[],
  toleranceM: number,
): SnapResult {
  const candidates = nodes
    .map((node) => ({
      node,
      distanceM: haversineDistanceM(coordinate, [
        node.position.lon,
        node.position.lat,
        null,
      ]),
    }))
    .filter((candidate) => candidate.distanceM <= toleranceM)
    .sort((left, right) => left.distanceM - right.distanceM);

  if (candidates.length === 0) {
    return { status: 'missing' };
  }

  if (
    candidates.length > 1 &&
    Math.abs(
      candidates[0].distanceM - candidates[1].distanceM,
    ) <= 0.001
  ) {
    return {
      status: 'ambiguous',
      candidateIds: [
        candidates[0].node.id,
        candidates[1].node.id,
      ],
    };
  }

  return {
    status: 'matched',
    match: candidates[0],
  };
}

function lonLatCoordinate(
  input: unknown,
  label: string,
): [number, number, number | null] {
  if (
    !Array.isArray(input) ||
    input.length < 2 ||
    typeof input[0] !== 'number' ||
    typeof input[1] !== 'number' ||
    !Number.isFinite(input[0]) ||
    !Number.isFinite(input[1])
  ) {
    throw new Error(
      `${label} requires finite [lon, lat] coordinates`,
    );
  }

  const lon = input[0];
  const lat = input[1];
  const z =
    input.length >= 3 &&
    typeof input[2] === 'number' &&
    Number.isFinite(input[2])
      ? input[2]
      : null;

  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(
      `${label} coordinate is outside lon/lat bounds`,
    );
  }

  return [lon, lat, z];
}

function lineCoordinates(
  input: unknown,
  label: string,
): [number, number, number | null][] {
  if (!Array.isArray(input) || input.length < 2) {
    throw new Error(
      `${label} requires at least two coordinates`,
    );
  }

  return input.map((value) =>
    lonLatCoordinate(value, label),
  );
}

function pathLengthM(
  coordinates:
    readonly (readonly [number, number, number | null])[],
): number {
  return coordinates.slice(1).reduce(
    (sum, coordinate, index) =>
      sum +
      haversineDistanceM(
        coordinates[index],
        coordinate,
      ),
    0,
  );
}

function haversineDistanceM(
  first: readonly [number, number, number | null],
  second: readonly [number, number, number | null],
): number {
  const earthRadiusM = 6_371_000;
  const firstLat = degreesToRadians(first[1]);
  const secondLat = degreesToRadians(second[1]);
  const deltaLat = degreesToRadians(
    second[1] - first[1],
  );
  const deltaLon = degreesToRadians(
    second[0] - first[0],
  );
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(firstLat) *
      Math.cos(secondLat) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    earthRadiusM *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function compactMetadata(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, EvidenceMetadataValue>> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      scalarMetadata(value),
    ]),
  );
}

function scalarMetadata(value: unknown): EvidenceMetadataValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  )
    ? value
    : null;
}

function requiredString(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(`${label} must be non-empty`);
  }

  return value;
}

function optionalFiniteNumber(
  value: unknown,
  label: string,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw new Error(`${label} must be finite or null`);
  }

  return value;
}

function uniqueStrings(
  values: readonly unknown[],
): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === 'string' &&
          value.trim().length > 0,
      ),
    ),
  ].sort();
}

function validateOptions(
  options: AmsterdamWaternetImportOptions,
): void {
  if (options.networkId.trim().length === 0) {
    throw new Error('networkId must be non-empty');
  }

  if (Number.isNaN(Date.parse(options.acquiredAt))) {
    throw new Error('acquiredAt must be a valid timestamp');
  }

  if (
    !Number.isInteger(options.nodeH3Resolution) ||
    options.nodeH3Resolution < 0 ||
    options.nodeH3Resolution > 15
  ) {
    throw new Error(
      'nodeH3Resolution must be an integer from 0 to 15',
    );
  }

  if (
    !Number.isFinite(options.snapToleranceM) ||
    options.snapToleranceM <= 0
  ) {
    throw new Error(
      'snapToleranceM must be a finite positive number',
    );
  }

  if (options.bboxWfsAxisOrder.trim().length === 0) {
    throw new Error(
      'bboxWfsAxisOrder must be non-empty',
    );
  }
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}
