import { EMILIA_MAP_DATA } from './emiliaMapData.generated';

export type EmiliaMapLayerId =
  | 'terrain_contributing_area'
  | 'elevation'
  | 'land_cover'
  | 'known_permanent_water'
  | 'event_runoff_concentration'
  | 'observed_flood_extent'
  | 'arpae_station_geometry';

export interface EmiliaMapQuantizedData {
  readonly encoding: 'base64_uint8';
  readonly values: string;
  readonly noData: number | null;
  readonly scale: 'linear' | 'log1p' | 'categorical' | 'boolean';
  readonly aggregation:
    | 'mean_of_available_source_cells'
    | 'maximum_of_available_source_cells'
    | 'dominant_source_class'
    | 'any_known_presence';
  readonly domain?: {
    readonly minimum: number;
    readonly maximum: number;
  };
  readonly categories?: Readonly<Record<string, string>>;
}

export interface EmiliaMapLayer {
  readonly id: EmiliaMapLayerId;
  readonly title: string;
  readonly shortTitle: string;
  readonly evidenceStatus:
    | 'available'
    | 'incomplete_window';
  readonly renderState: 'renderable' | 'withheld';
  readonly publicationState:
    | 'adapted_product_allowed'
    | 'allowed_with_attribution'
    | 'restricted'
    | 'review_pending';
  readonly unit: string | null;
  readonly sourceResolution: string;
  readonly provider: string;
  readonly dataset: string;
  readonly datasetVersion: string;
  readonly transformation: string;
  readonly transformationVersion: string;
  readonly interpretation: string;
  readonly attribution: string;
  readonly missingReason: string | null;
  readonly data: EmiliaMapQuantizedData | null;
}

export interface EmiliaRomagnaMapManifest {
  readonly schemaVersion: 'emilia-map-manifest-v0.1.0';
  readonly benchmarkSchemaVersion: 'emilia-benchmark-snapshot-v0.1.0';
  readonly benchmarkId:
    'emilia-romagna-2023-forli-retrospective-reconstruction';
  readonly manifestVersion: '1.16.0';
  readonly state: 'bounded_publication_safe_projection';
  readonly sourceGrid: typeof EMILIA_MAP_DATA.sourceGrid;
  readonly displayGrid: typeof EMILIA_MAP_DATA.displayGrid;
  readonly aoiCoverage: {
    readonly encoding: 'base64_uint8';
    readonly values: string;
    readonly scale: readonly [0, 254];
    readonly semantics:
      'fraction_of_source_cells_inside_aoi_per_display_cell';
  };
  readonly sourceArtifacts: typeof EMILIA_MAP_DATA.sourceArtifacts;
  readonly layers: readonly EmiliaMapLayer[];
  readonly claims: {
    readonly mapIs: readonly [
      'bounded_evidence_inspector',
      'aggregated_spatial_diagnostic',
    ];
    readonly mapIsNot: readonly [
      'inundation_map',
      'water_depth_map',
      'flood_probability_map',
      'operational_forecast',
    ];
  };
}

const DISPLAY_TRANSFORMATION = '10x10 source-cell display aggregation';
const DISPLAY_TRANSFORMATION_VERSION =
  'emilia-publication-safe-display-grid-v0.1.0';

export const EMILIA_ROMAGNA_2023_MAP_MANIFEST = {
  schemaVersion: 'emilia-map-manifest-v0.1.0',
  benchmarkSchemaVersion: 'emilia-benchmark-snapshot-v0.1.0',
  benchmarkId: EMILIA_MAP_DATA.benchmarkId,
  manifestVersion: EMILIA_MAP_DATA.manifestVersion,
  state: 'bounded_publication_safe_projection',
  sourceGrid: EMILIA_MAP_DATA.sourceGrid,
  displayGrid: EMILIA_MAP_DATA.displayGrid,
  aoiCoverage: {
    encoding: 'base64_uint8',
    values: EMILIA_MAP_DATA.arrays.aoiCoverage,
    scale: [0, 254],
    semantics: 'fraction_of_source_cells_inside_aoi_per_display_cell',
  },
  sourceArtifacts: EMILIA_MAP_DATA.sourceArtifacts,
  layers: [
    {
      id: 'terrain_contributing_area',
      title: 'Terrain-only D8 contributing area',
      shortTitle: 'D8 concentration',
      evidenceStatus: 'incomplete_window',
      renderState: 'renderable',
      publicationState: 'adapted_product_allowed',
      unit: 'm²',
      sourceResolution: '30 m source grid; 300 m nominal display aggregate',
      provider: 'European Union / ESA + Regione Emilia-Romagna',
      dataset: 'Copernicus DEM GLO-30 + DBTR known permanent water',
      datasetVersion: '2022_1 + 2026 extract with pre-event feature cutoff',
      transformation: `${DISPLAY_TRANSFORMATION}; maximum contributing area retained per display cell`,
      transformationVersion: DISPLAY_TRANSFORMATION_VERSION,
      interpretation:
        'Terrain-flow concentration before rainfall, river stage, breach or hydraulic conditioning. It is not inundation extent.',
      attribution:
        'Includes modified Copernicus DEM data (2022) and Regione Emilia-Romagna DBTR data under CC BY 3.0.',
      missingReason:
        'DBTR known-water geometry is an incomplete historical window; absence is never inferred from zero.',
      data: {
        encoding: 'base64_uint8',
        values: EMILIA_MAP_DATA.arrays.terrainContributingAreaMaximum,
        noData: 255,
        scale: 'log1p',
        aggregation: 'maximum_of_available_source_cells',
        domain: EMILIA_MAP_DATA.domains.terrainContributingAreaMaximumM2,
      },
    },
    {
      id: 'elevation',
      title: 'Mean surface elevation',
      shortTitle: 'Elevation',
      evidenceStatus: 'available',
      renderState: 'renderable',
      publicationState: 'adapted_product_allowed',
      unit: 'm',
      sourceResolution: '1 arc-second (~30 m); 300 m nominal display aggregate',
      provider: 'European Union / ESA',
      dataset: 'Copernicus DEM GLO-30',
      datasetVersion: '2022_1',
      transformation: `${DISPLAY_TRANSFORMATION}; arithmetic mean of available source-cell elevations`,
      transformationVersion: DISPLAY_TRANSFORMATION_VERSION,
      interpretation:
        'Digital surface model elevation represented for inspection; not hydraulic-grade bare earth.',
      attribution: 'Includes modified Copernicus DEM data (2022).',
      missingReason: null,
      data: {
        encoding: 'base64_uint8',
        values: EMILIA_MAP_DATA.arrays.elevationMean,
        noData: 255,
        scale: 'linear',
        aggregation: 'mean_of_available_source_cells',
        domain: EMILIA_MAP_DATA.domains.elevationMeanM,
      },
    },
    {
      id: 'land_cover',
      title: 'Dominant CORINE land-cover group',
      shortTitle: 'Land cover',
      evidenceStatus: 'available',
      renderState: 'renderable',
      publicationState: 'allowed_with_attribution',
      unit: null,
      sourceResolution: '100 m; 300 m nominal display aggregate',
      provider: 'Copernicus Land Monitoring Service',
      dataset: 'CORINE Land Cover 2018',
      datasetVersion: 'V2020_20u1',
      transformation: `${DISPLAY_TRANSFORMATION}; dominant level-1 group represented per display cell`,
      transformationVersion: DISPLAY_TRANSFORMATION_VERSION,
      interpretation:
        'Dominant broad land-cover group for context; class zero is not used as missing evidence.',
      attribution: '© European Union, Copernicus Land Monitoring Service.',
      missingReason: null,
      data: {
        encoding: 'base64_uint8',
        values: EMILIA_MAP_DATA.arrays.dominantLandCover,
        noData: 0,
        scale: 'categorical',
        aggregation: 'dominant_source_class',
        categories: {
          '1': 'Artificial surfaces',
          '2': 'Agricultural areas',
          '3': 'Forest and seminatural areas',
          '4': 'Wetlands',
          '5': 'Water bodies',
        },
      },
    },
    {
      id: 'known_permanent_water',
      title: 'Known permanent-water presence',
      shortTitle: 'Known water',
      evidenceStatus: 'incomplete_window',
      renderState: 'renderable',
      publicationState: 'allowed_with_attribution',
      unit: null,
      sourceResolution: 'DBTR vector; 30 m centre mask; 300 m display aggregate',
      provider: 'Regione Emilia-Romagna',
      dataset: 'DBTR Specchio d’acqua (SDA_GPG)',
      datasetVersion: '2026 extract with feature-level pre-event cutoff',
      transformation: `${DISPLAY_TRANSFORMATION}; any known source-cell centre presence`,
      transformationVersion: DISPLAY_TRANSFORMATION_VERSION,
      interpretation:
        'Positive cells show known retained geometry. Zero means no eligible feature was identified, not verified historical absence.',
      attribution: 'Regione Emilia-Romagna DBTR, CC BY 3.0.',
      missingReason:
        'The current extract cannot reconstruct features deleted or overwritten after May 2023.',
      data: {
        encoding: 'base64_uint8',
        values: EMILIA_MAP_DATA.arrays.knownPermanentWater,
        noData: 255,
        scale: 'boolean',
        aggregation: 'any_known_presence',
        categories: {
          '0': 'No eligible geometry identified',
          '1': 'Known permanent-water presence',
        },
      },
    },
    {
      id: 'event_runoff_concentration',
      title: 'Event runoff concentration',
      shortTitle: 'Event runoff',
      evidenceStatus: 'incomplete_window',
      renderState: 'renderable',
      publicationState: 'allowed_with_attribution',
      unit: 'm³',
      sourceResolution:
        'IMERG 0.1° / 30 min; GLO-30 1 arc-second; CLC 100 m; 30 m derived grid; 300 m nominal display aggregate',
      provider: 'GeoLens derived from IMERG, GLO-30, CLC and DBTR',
      dataset: 'Forlì event runoff D8 baseline',
      datasetVersion:
        'runoff-coefficient-proxy-v0.1.0+d8-no-loss-volume-accumulation-v0.1.0',
      transformation: `${DISPLAY_TRANSFORMATION}; maximum accumulated runoff volume retained per display cell`,
      transformationVersion: DISPLAY_TRANSFORMATION_VERSION,
      interpretation:
        'Experimental runoff volume accumulated without loss over the unconditioned D8 graph. It is a concentration diagnostic, not inundation extent or water depth.',
      attribution:
        'Derived from NASA GPM IMERG Final Run V07 (DOI 10.5067/GPM/IMERG/3B-HH/07), modified Copernicus DEM data (2022), © European Union Copernicus Land Monitoring Service, and Regione Emilia-Romagna DBTR under CC BY 3.0.',
      missingReason:
        'The DBTR known-water input remains an incomplete historical window; the displayed concentration does not establish where flooding occurred.',
      data: {
        encoding: 'base64_uint8',
        values: EMILIA_MAP_DATA.arrays.eventAccumulatedRunoffMaximum,
        noData: 255,
        scale: 'log1p',
        aggregation: 'maximum_of_available_source_cells',
        domain: EMILIA_MAP_DATA.domains.eventAccumulatedRunoffMaximumM3,
      },
    },
    {
      id: 'observed_flood_extent',
      title: 'Observed regional flood extent V7',
      shortTitle: 'Observed extent',
      evidenceStatus: 'available',
      renderState: 'withheld',
      publicationState: 'restricted',
      unit: null,
      sourceResolution: '2,022 source features in EPSG:32632',
      provider: 'Regione Emilia-Romagna',
      dataset: 'Perimetrazione aree allagate 16–17 May 2023',
      datasetVersion: 'V7, DSG 88/2025',
      transformation: 'No public spatial projection generated',
      transformationVersion: DISPLAY_TRANSFORMATION_VERSION,
      interpretation:
        'Evaluation-only evidence remains outside model input and outside the public map payload.',
      attribution: 'Source retained outside Git.',
      missingReason:
        'The frozen manifest marks redistribution as restricted; no geometry or derived extract is served.',
      data: null,
    },
    {
      id: 'arpae_station_geometry',
      title: 'ARPAE comparison-station geometry',
      shortTitle: 'ARPAE stations',
      evidenceStatus: 'incomplete_window',
      renderState: 'withheld',
      publicationState: 'review_pending',
      unit: null,
      sourceResolution: 'Station observations',
      provider: 'ARPAE Emilia-Romagna',
      dataset: 'Dext3r station observations',
      datasetVersion: 'request be86675d-a290-4208-8b38-0bb420396ca0',
      transformation: 'No public station geometry generated',
      transformationVersion: DISPLAY_TRANSFORMATION_VERSION,
      interpretation:
        'Numeric comparison remains in the benchmark record; the map does not redistribute station geometry.',
      attribution: 'Dext3r legal-note review pending.',
      missingReason:
        'The frozen manifest records redistribution as unknown.',
      data: null,
    },
  ],
  claims: {
    mapIs: [
      'bounded_evidence_inspector',
      'aggregated_spatial_diagnostic',
    ],
    mapIsNot: [
      'inundation_map',
      'water_depth_map',
      'flood_probability_map',
      'operational_forecast',
    ],
  },
} as const satisfies EmiliaRomagnaMapManifest;
