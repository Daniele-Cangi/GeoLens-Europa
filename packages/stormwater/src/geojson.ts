import {
  assertEvidenceInvariant,
  Evidence,
  unavailableEvidence,
} from '@geo-lens/evidence';
import {
  latLngToCell,
  polygonToCells,
} from 'h3-js';

import {
  createStormwaterTopology,
  StormwaterNode,
  StormwaterNodeType,
  StormwaterPipe,
  StormwaterTopology,
} from './network';

export interface ImportedCatchmentCell {
  readonly h3: string;
  readonly coverageFraction: 1;
}

export interface ImportedCatchmentCoverage {
  readonly id: string;
  readonly outletNodeId: string;
  readonly h3Resolution: number;
  readonly coverageMethod: 'h3_cell_center';
  readonly cells: readonly ImportedCatchmentCell[];
}

export interface ImportedStormwaterFixture {
  readonly topology: StormwaterTopology;
  readonly catchments: readonly ImportedCatchmentCoverage[];
}

export interface StormwaterGeoJsonImportOptions {
  readonly networkId: string;
  readonly importedAt: string;
  readonly nodeH3Resolution: number;
  readonly catchmentH3Resolution: number;
  readonly snapToleranceM: number;
  readonly elevationByNodeId?: Readonly<
    Record<string, Evidence<number>>
  >;
}

interface GeoJsonFeature {
  readonly id: string | number;
  readonly properties: Record<string, unknown>;
  readonly geometry: {
    readonly type: string;
    readonly coordinates: unknown;
  };
}

const NODE_TYPES: ReadonlySet<string> = new Set([
  'inlet',
  'manhole',
  'outfall',
  'junction',
]);

/**
 * Imports only the explicit Proof 0 stormwater vocabulary.
 * Feature ids never determine their type. Pipe endpoints are snapped to
 * declared nodes, while catchments require an explicit outlet_node_id.
 */
export function importStormwaterGeoJson(
  input: unknown,
  options: StormwaterGeoJsonImportOptions,
): ImportedStormwaterFixture {
  validateImportOptions(options);
  const features = parseFeatureCollection(input);
  assertUniqueFeatureIds(features);
  const nodes = importNodes(features, options);
  const pipes = importPipes(features, nodes, options.snapToleranceM);
  const catchments = importCatchments(
    features,
    nodes,
    options.catchmentH3Resolution,
  );
  const recognizedFeatureCount =
    nodes.length + pipes.length + catchments.length;

  if (recognizedFeatureCount !== features.length) {
    const recognizedTypes = new Set([
      ...NODE_TYPES,
      'pipe',
      'catchment',
    ]);
    const unknown = features.filter(
      (feature) =>
        !recognizedTypes.has(String(feature.properties.type)),
    );

    throw new Error(
      `Unsupported stormwater feature types: ${unknown
        .map(
          (feature) =>
            `${String(feature.id)}=${String(feature.properties.type)}`,
        )
        .join(', ')}`,
    );
  }

  const topology = createStormwaterTopology({
    id: options.networkId,
    nodes,
    pipes,
    catchmentAttachments: catchments.map((catchment) => ({
      catchmentId: catchment.id,
      outletNodeId: catchment.outletNodeId,
    })),
  });

  return {
    topology,
    catchments,
  };
}

function importNodes(
  features: readonly GeoJsonFeature[],
  options: StormwaterGeoJsonImportOptions,
): StormwaterNode[] {
  return features
    .filter((feature) =>
      NODE_TYPES.has(String(feature.properties.type)),
    )
    .map((feature) => {
      if (feature.geometry.type !== 'Point') {
        throw new Error(
          `Node ${String(feature.id)} must use Point geometry`,
        );
      }

      const [lon, lat] = coordinate(
        feature.geometry.coordinates,
        `node ${String(feature.id)}`,
      );
      const id = String(feature.id);
      const h3 = latLngToCell(
        lat,
        lon,
        options.nodeH3Resolution,
      );
      const suppliedElevation =
        options.elevationByNodeId?.[id];
      let elevationM: Evidence<number>;

      if (suppliedElevation === undefined) {
        elevationM = unavailableEvidence(
          'missing',
          `No elevation evidence supplied for node ${id}`,
          {
            unit: 'm',
            spatial: {
              h3,
              lat,
              lon,
            },
            temporal: {
              acquiredAt: options.importedAt,
            },
            provenance: {
              provider: 'geolens-import',
              dataset: 'node-elevation',
              transformation:
                'explicit missing state created during topology import',
              transformationVersion: 'stormwater-geojson-import-v0.1.0',
            },
          },
        );
      } else {
        assertEvidenceInvariant(suppliedElevation);

        if (
          suppliedElevation.spatial.h3 !== undefined &&
          suppliedElevation.spatial.h3 !== h3
        ) {
          throw new Error(
            `Elevation evidence for node ${id} refers to H3 ${suppliedElevation.spatial.h3}, expected ${h3}`,
          );
        }

        elevationM = suppliedElevation;
      }

      return {
        id,
        type: String(
          feature.properties.type,
        ) as StormwaterNodeType,
        position: {
          lat,
          lon,
        },
        h3,
        elevationM,
      };
    });
}

function importPipes(
  features: readonly GeoJsonFeature[],
  nodes: readonly StormwaterNode[],
  snapToleranceM: number,
): StormwaterPipe[] {
  return features
    .filter((feature) => feature.properties.type === 'pipe')
    .map((feature) => {
      if (feature.geometry.type !== 'LineString') {
        throw new Error(
          `Pipe ${String(feature.id)} must use LineString geometry`,
        );
      }

      const coordinates = lineCoordinates(
        feature.geometry.coordinates,
        `pipe ${String(feature.id)}`,
      );
      const start = coordinates[0];
      const end = coordinates[coordinates.length - 1];
      const nodeA = findSnapNode(
        start,
        nodes,
        snapToleranceM,
        `pipe ${String(feature.id)} start`,
      );
      const nodeB = findSnapNode(
        end,
        nodes,
        snapToleranceM,
        `pipe ${String(feature.id)} end`,
      );
      const lengthM = coordinates
        .slice(1)
        .reduce(
          (sum, point, index) =>
            sum + haversineDistance(coordinates[index], point),
          0,
        );
      const diameter = feature.properties.diameter_mm;

      if (
        diameter !== undefined &&
        (typeof diameter !== 'number' ||
          !Number.isFinite(diameter) ||
          diameter <= 0)
      ) {
        throw new Error(
          `Pipe ${String(feature.id)} diameter_mm must be positive`,
        );
      }

      return {
        id: String(feature.id),
        nodeAId: nodeA.id,
        nodeBId: nodeB.id,
        lengthM,
        diameterMm: diameter as number | undefined,
      };
    });
}

function importCatchments(
  features: readonly GeoJsonFeature[],
  nodes: readonly StormwaterNode[],
  h3Resolution: number,
): ImportedCatchmentCoverage[] {
  const nodeIds = new Set(nodes.map((node) => node.id));

  return features
    .filter((feature) => feature.properties.type === 'catchment')
    .map((feature) => {
      if (feature.geometry.type !== 'Polygon') {
        throw new Error(
          `Catchment ${String(feature.id)} must use Polygon geometry`,
        );
      }

      const polygon = polygonCoordinates(
        feature.geometry.coordinates,
        `catchment ${String(feature.id)}`,
      );
      const outletNodeId = feature.properties.outlet_node_id;

      if (
        typeof outletNodeId !== 'string' ||
        outletNodeId.trim().length === 0
      ) {
        throw new Error(
          `Catchment ${String(feature.id)} requires explicit outlet_node_id`,
        );
      }

      if (!nodeIds.has(outletNodeId)) {
        throw new Error(
          `Catchment ${String(feature.id)} outlet ${outletNodeId} is not a declared node`,
        );
      }

      const h3Cells = polygonToCells(
        polygon,
        h3Resolution,
        true,
      );

      if (h3Cells.length === 0) {
        throw new Error(
          `Catchment ${String(feature.id)} contains no H3 cell centers at resolution ${h3Resolution}`,
        );
      }

      return {
        id: String(feature.id),
        outletNodeId,
        h3Resolution,
        coverageMethod: 'h3_cell_center',
        cells: h3Cells.map((h3) => ({
          h3,
          coverageFraction: 1 as const,
        })),
      };
    });
}

function parseFeatureCollection(
  input: unknown,
): readonly GeoJsonFeature[] {
  if (!isRecord(input) || input.type !== 'FeatureCollection') {
    throw new Error('Stormwater input must be a GeoJSON FeatureCollection');
  }

  if (!Array.isArray(input.features)) {
    throw new Error('GeoJSON FeatureCollection.features must be an array');
  }

  return input.features.map((value, index) => {
    if (!isRecord(value) || value.type !== 'Feature') {
      throw new Error(`features[${index}] must be a GeoJSON Feature`);
    }

    if (
      value.id === undefined ||
      (typeof value.id !== 'string' &&
        typeof value.id !== 'number') ||
      String(value.id).trim().length === 0
    ) {
      throw new Error(`features[${index}] requires a stable id`);
    }

    if (!isRecord(value.properties)) {
      throw new Error(
        `Feature ${String(value.id)} requires object properties`,
      );
    }

    if (
      typeof value.properties.type !== 'string' ||
      value.properties.type.trim().length === 0
    ) {
      throw new Error(
        `Feature ${String(value.id)} requires explicit properties.type`,
      );
    }

    if (
      !isRecord(value.geometry) ||
      typeof value.geometry.type !== 'string' ||
      value.geometry.coordinates === undefined
    ) {
      throw new Error(
        `Feature ${String(value.id)} requires valid geometry`,
      );
    }

    return {
      id: value.id,
      properties: value.properties,
      geometry: {
        type: value.geometry.type,
        coordinates: value.geometry.coordinates,
      },
    };
  });
}

function assertUniqueFeatureIds(
  features: readonly GeoJsonFeature[],
): void {
  const seen = new Set<string>();

  for (const feature of features) {
    const id = String(feature.id);

    if (seen.has(id)) {
      throw new Error(`Duplicate GeoJSON feature id ${id}`);
    }
    seen.add(id);
  }
}

function coordinate(
  input: unknown,
  label: string,
): [number, number] {
  if (
    !Array.isArray(input) ||
    input.length < 2 ||
    typeof input[0] !== 'number' ||
    typeof input[1] !== 'number' ||
    !Number.isFinite(input[0]) ||
    !Number.isFinite(input[1])
  ) {
    throw new Error(`${label} requires finite [lon, lat] coordinates`);
  }

  const lon = input[0];
  const lat = input[1];

  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error(`${label} coordinate is outside lon/lat bounds`);
  }

  return [lon, lat];
}

function lineCoordinates(
  input: unknown,
  label: string,
): [number, number][] {
  if (!Array.isArray(input) || input.length < 2) {
    throw new Error(`${label} requires at least two coordinates`);
  }

  return input.map((value) => coordinate(value, label));
}

function polygonCoordinates(
  input: unknown,
  label: string,
): [number, number][][] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error(`${label} requires at least one ring`);
  }

  return input.map((ring, ringIndex) => {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new Error(
        `${label} ring ${ringIndex} requires at least four coordinates`,
      );
    }

    const parsed = ring.map((value) => coordinate(value, label));
    const first = parsed[0];
    const last = parsed[parsed.length - 1];

    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw new Error(`${label} ring ${ringIndex} must be closed`);
    }

    return parsed;
  });
}

function findSnapNode(
  coordinateValue: readonly [number, number],
  nodes: readonly StormwaterNode[],
  toleranceM: number,
  label: string,
): StormwaterNode {
  const candidates = nodes
    .map((node) => ({
      node,
      distanceM: haversineDistance(coordinateValue, [
        node.position.lon,
        node.position.lat,
      ]),
    }))
    .filter((candidate) => candidate.distanceM <= toleranceM)
    .sort((left, right) => left.distanceM - right.distanceM);

  if (candidates.length === 0) {
    throw new Error(
      `${label} does not match a node within ${toleranceM} m`,
    );
  }

  if (
    candidates.length > 1 &&
    Math.abs(
      candidates[0].distanceM - candidates[1].distanceM,
    ) < 1e-6
  ) {
    throw new Error(`${label} is equally close to multiple nodes`);
  }

  return candidates[0].node;
}

function haversineDistance(
  first: readonly [number, number],
  second: readonly [number, number],
): number {
  const earthRadiusM = 6_371_000;
  const firstLat = degreesToRadians(first[1]);
  const secondLat = degreesToRadians(second[1]);
  const deltaLat = degreesToRadians(second[1] - first[1]);
  const deltaLon = degreesToRadians(second[0] - first[0]);
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

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function validateImportOptions(
  options: StormwaterGeoJsonImportOptions,
): void {
  if (options.networkId.trim().length === 0) {
    throw new Error('networkId must be non-empty');
  }

  for (const [name, resolution] of [
    ['nodeH3Resolution', options.nodeH3Resolution],
    ['catchmentH3Resolution', options.catchmentH3Resolution],
  ] as const) {
    if (
      !Number.isInteger(resolution) ||
      resolution < 0 ||
      resolution > 15
    ) {
      throw new Error(`${name} must be an integer from 0 to 15`);
    }
  }

  if (
    !Number.isFinite(options.snapToleranceM) ||
    options.snapToleranceM <= 0
  ) {
    throw new Error('snapToleranceM must be a finite positive number');
  }

  if (Number.isNaN(Date.parse(options.importedAt))) {
    throw new Error('importedAt must be a valid timestamp');
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}
