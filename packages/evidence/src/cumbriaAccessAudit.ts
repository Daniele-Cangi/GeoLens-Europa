import {
  assertCumbriaModelDeliveryIntakeProtocol,
  type CumbriaModelDeliveryIntakeProtocol,
} from './cumbriaModelIntake';

export const CUMBRIA_ACCESS_MANIFEST_VERSION = '0.13.0' as const;

export const CUMBRIA_EVENT_WINDOW = {
  start: '2015-12-04T00:00:00Z',
  endExclusive: '2015-12-07T00:00:00Z',
} as const;

export const CUMBRIA_DATASET_ROLES = [
  'model_input_candidate',
  'observation_comparison',
  'evaluation_reference',
  'context_only',
] as const;

export type CumbriaDatasetRole = (typeof CUMBRIA_DATASET_ROLES)[number];

export const CUMBRIA_TEMPORAL_RELATIONS = [
  'pre_event',
  'pre_event_required',
  'event_window',
  'retrospective_reprocessing',
  'post_event',
  'current_context',
] as const;

export type CumbriaTemporalRelation =
  (typeof CUMBRIA_TEMPORAL_RELATIONS)[number];

export const CUMBRIA_ACCESS_STATES = [
  'catalog_verified',
  'metadata_verified',
  'remote_verified',
  'remote_verified_intermittent',
] as const;

export type CumbriaAccessState = (typeof CUMBRIA_ACCESS_STATES)[number];

export interface CumbriaPermittedUses {
  readonly modelInput: boolean;
  readonly calibration: boolean;
  readonly observationComparison: boolean;
  readonly evaluation: boolean;
}

export interface CumbriaAccessRecord {
  readonly state: CumbriaAccessState;
  readonly checkedOn: string;
  readonly url: string;
  readonly additionalUrls?: readonly string[];
  readonly note: string;
}

export interface CumbriaSeriesAudit {
  readonly station: string;
  readonly stationReference: string;
  readonly measureNotation: string;
  readonly intervalSeconds: number;
  readonly windowStart: string;
  readonly windowEndExclusive: string;
  readonly expectedReadings: number;
  readonly readings: number;
  readonly missingReadings: number;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly unit: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly aggregate?: {
    readonly name: string;
    readonly value: number;
    readonly unit: string;
  };
}

export interface CumbriaDatasetAudit {
  readonly id: string;
  readonly publisher: string;
  readonly dataset: string;
  readonly datasetVersion?: string;
  readonly role: CumbriaDatasetRole;
  readonly temporalRelation: CumbriaTemporalRelation;
  readonly sourceResolution: string;
  readonly license: string;
  readonly permittedUses: CumbriaPermittedUses;
  readonly access: CumbriaAccessRecord;
  readonly facts?: Readonly<Record<string, string | number | boolean | null>>;
  readonly seriesAudit?: CumbriaSeriesAudit;
  readonly lidarCatalogAudit?: CumbriaLidarCatalogAudit;
  readonly hydrographyAudit?: CumbriaHydrographyAudit;
  readonly defenceContextAudit?: CumbriaDefenceContextAudit;
  readonly hydraulicModelLineageAudit?: CumbriaHydraulicModelLineageAudit;
  readonly hydraulicDomainLineageAudit?: CumbriaHydraulicDomainLineageAudit;
  readonly floodModelCatalogAudit?: CumbriaFloodModelCatalogAudit;
  readonly channelContextAudit?: CumbriaChannelContextAudit;
}

export interface CumbriaDefenceContextAudit {
  readonly queryUrl: string;
  readonly sourceBbox: readonly [number, number, number, number];
  readonly sourceCrs: 'OGC:CRS84';
  readonly numberMatched: number;
  readonly numberReturned: number;
  readonly returnedGeometryBounds: readonly [number, number, number, number];
  readonly sourceUpdateSemantics: 'daily_current_inventory';
  readonly withAssetStartDate: number;
  readonly operationalBeforeEventByStartDateOnly: number;
  readonly assetStartDateOnOrAfterEvent: number;
  readonly missingAssetStartDate: number;
  readonly withYearLastRefurbished: number;
  readonly lastRefurbishedAfter2015: number;
  readonly withCurrentActualCrest: number;
  readonly withDesignCrest: number;
  readonly withDesignStandardOfProtection: number;
  readonly assetSubtypeCounts: Readonly<Record<string, number>>;
  readonly selectionSha256: string;
  readonly responseByteLimit: 4194304;
  readonly classification: 'current_context_only';
  readonly blocker: string;
}

export interface CumbriaHydraulicModelLineageAudit {
  readonly documentDate: '2011-11-22';
  readonly modelComponents: readonly ['ISIS 1D', 'TUFLOW 2D'];
  readonly defenceSchemesRepresented: true;
  readonly reportedFloodgates: 23;
  readonly machineReadableModelFilesAttached: false;
  readonly machineReadableBoundaryConditionsAttached: false;
  readonly machineReadableChannelGeometryAttached: false;
  readonly classification: 'pre_event_model_lineage_only';
  readonly blocker: string;
}

export interface CumbriaHydraulicDomainLineageAudit {
  readonly documentDate: '2011-11-22';
  readonly originalModelCompletedYear: 1999;
  readonly crossSectionSurveyCompleted: '2003-10';
  readonly calibrationEvent: 'January 2005 flood';
  readonly modelComponents: readonly ['ISIS 1D', 'TUFLOW 2D'];
  readonly upstreamLimits: readonly {
    readonly watercourse: string;
    readonly location: string;
    readonly candidateSeriesDatasetId: string;
    readonly placementVerified: false;
  }[];
  readonly downstreamLimit: {
    readonly location: 'Old Sandsfield';
    readonly sourceGridReference: 'NY332617';
    readonly coordinate: {
      readonly crs: 'EPSG:27700';
      readonly easting: 333200;
      readonly northing: 561700;
    };
    readonly derivedWgs84: CumbriaProtocolCoordinate & {
      readonly transformation: 'proj4-bng-to-wgs84-v0';
    };
    readonly sourceTidalRelation: 'upstream_of_tidal_limits';
    readonly boundaryValuesAttached: false;
  };
  readonly machineReadableCrossSectionsAttached: false;
  readonly machineReadableBoundaryConditionsAttached: false;
  readonly machineReadableModelFilesAttached: false;
  readonly classification: 'pre_event_domain_lineage_only';
  readonly blocker: string;
}

export interface CumbriaFloodModelCatalogAudit {
  readonly queryUrl: string;
  readonly sourceBbox: readonly [number, number, number, number];
  readonly sourceCrs: 'OGC:CRS84';
  readonly numberMatched: 19;
  readonly numberReturned: 19;
  readonly returnedGeometryBounds: readonly [number, number, number, number];
  readonly preEventRecords: 13;
  readonly eventOrPostEventRecords: 6;
  readonly coreModels: readonly {
    readonly id: number;
    readonly name: string;
    readonly completionDate: string;
    readonly softwareAndVersion: string | null;
    readonly temporalUse: 'pre_event_lineage_only' | 'post_event_excluded';
  }[];
  readonly selectionSha256: string;
  readonly modelFilesIncluded: false;
  readonly modelOutputsIncluded: false;
  readonly classification: 'catalog_identity_only';
  readonly blocker: string;
}

export interface CumbriaChannelContextAudit {
  readonly queryUrl: string;
  readonly sourceBbox: readonly [number, number, number, number];
  readonly sourceCrs: 'OGC:CRS84';
  readonly numberMatched: 349;
  readonly numberReturned: 349;
  readonly returnedGeometryBounds: readonly [number, number, number, number];
  readonly sourceUpdateSemantics: 'daily_current_inventory';
  readonly withAssetStartDate: 77;
  readonly operationalBeforeEventByStartDateOnly: 60;
  readonly assetStartDateOnOrAfterEvent: 17;
  readonly missingAssetStartDate: 272;
  readonly lastRefurbishedAfter2015: 0;
  readonly withWatercourseName: 237;
  readonly assetSubtypeCounts: Readonly<Record<string, number>>;
  readonly selectionSha256: string;
  readonly crossSectionsIncluded: false;
  readonly bedElevationIncluded: false;
  readonly roughnessIncluded: false;
  readonly classification: 'current_context_only';
  readonly blocker: string;
}

export interface CumbriaHydrographyAudit {
  readonly hitsUrl: string;
  readonly featuresUrl: string;
  readonly sourceBbox: readonly [number, number, number, number];
  readonly sourceCrs: 'OGC:CRS84';
  readonly geometryClippedToAoi: false;
  readonly numberMatched: 16;
  readonly numberReturned: 16;
  readonly returnedGeometryBounds: readonly [number, number, number, number];
  readonly stableIdentities: readonly {
    readonly id: string;
    readonly eaWbId: string;
    readonly name: string;
  }[];
  readonly selectionSha256: string;
  readonly responseByteLimit: 1048576;
  readonly classification: 'event_valid_context_only';
  readonly blocker: string;
}

export interface CumbriaLidarCatalogAudit {
  readonly queryUrl: string;
  readonly selectionRule: string;
  readonly sourceRows: number;
  readonly intersectingGridRefs: number;
  readonly preEventRows: number;
  readonly selectedPreEventGridRefs: number;
  readonly gridRefsWithoutPreEvent: readonly string[];
  readonly selectionSha256: string;
  readonly selectedFilenameKinds: {
    readonly laz: number;
    readonly tif: number;
    readonly zip: number;
  };
  readonly downloadMapping: CumbriaLidarDownloadMapping;
  readonly acquisitionState: 'ready_with_explicit_gaps';
  readonly reason: string;
}

export interface CumbriaLidarArchiveIdentity {
  readonly product: 'lidar_tiles_dtm';
  readonly year: string;
  readonly resolution: '0.5' | '1' | '2';
  readonly tile: string;
  readonly uri: string;
  readonly mappedGridRefs: number;
}

export interface CumbriaLidarDownloadMapping {
  readonly searchEndpoint: string;
  readonly searchContentType: 'application/geo+json';
  readonly requestBounds: readonly [number, number, number, number];
  readonly searchResultCount: 590;
  readonly productId: 'lidar_tiles_dtm';
  readonly productResultCount: 123;
  readonly mappingRule: string;
  readonly materializationRule: string;
  readonly mappedPreEventGridRefs: 231;
  readonly unmappedSelectedGridRefs: readonly [];
  readonly archiveIdentityCount: 30;
  readonly archiveIdentities: readonly CumbriaLidarArchiveIdentity[];
  readonly mappingSha256: string;
  readonly archiveIdentitySha256: string;
  readonly sampleArchiveProbe: {
    readonly uri: string;
    readonly httpStatus: 200;
    readonly contentType: 'application/zip';
    readonly contentDisposition: string;
    readonly rangeHonored: false;
    readonly archiveBytesRead: 0;
  };
  readonly materializationProtocol: CumbriaDtmMaterializationProtocol;
}

export interface CumbriaDtmMaterializationProtocol {
  readonly id: 'cumbria-dtm-materialization-v0';
  readonly state: 'frozen_download_blocked_by_physical_gates';
  readonly sourceMapping: {
    readonly archiveIdentitySha256: string;
    readonly sourceToArchiveMappingSha256: string;
    readonly archiveCount: 30;
    readonly mappedGridRefCount: 231;
    readonly mappingRecomputedBeforeDownload: true;
    readonly mappingHashMustMatch: true;
  };
  readonly budget: {
    readonly estimateMethod: 'native-grid-cell-count-times-float32';
    readonly estimateExcludesArchiveAndFormatOverhead: true;
    readonly decodedBytesPerCell: 4;
    readonly resolutionArchiveCounts: Readonly<Record<'0.5' | '1' | '2', number>>;
    readonly resolutionMappedGridRefCounts: Readonly<
      Record<'0.5' | '1' | '2', number>
    >;
    readonly fullArchiveRasterCells: 900000000;
    readonly retainedMaskRasterCells: 264000000;
    readonly estimatedFullArchiveDecodedBytes: 3600000000;
    readonly estimatedRetainedMaskDecodedBytes: 1056000000;
    readonly maxArchiveDownloadBytes: 1073741824;
    readonly maxTotalDownloadBytes: 8589934592;
    readonly minimumFreeSpaceBytes: 17179869184;
  };
  readonly receipts: {
    readonly contentAddressAlgorithm: 'sha256';
    readonly archivePathTemplate: 'archives/sha256/{sha256}.zip';
    readonly receiptPathTemplate: 'receipts/sha256/{sha256}.receipt.json';
    readonly partialFileSuffix: '.part';
    readonly atomicRenameAfterVerification: true;
    readonly requiredFields: readonly [
      'sourceUri',
      'archiveIdentity',
      'downloadedAt',
      'byteLength',
      'sha256',
      'contentType',
      'contentDisposition',
      'sourceToArchiveMappingSha256',
      'mappedGridRefs',
    ];
  };
  readonly zipInspection: {
    readonly rejectEncryptedEntries: true;
    readonly rejectSymlinksAndReparsePoints: true;
    readonly rejectAbsolutePaths: true;
    readonly rejectParentTraversal: true;
    readonly rejectDuplicateNormalizedPaths: true;
    readonly maxEntriesPerArchive: 512;
    readonly maxExpandedBytesPerArchive: 4294967296;
    readonly maxTotalExpandedBytes: 34359738368;
    readonly rasterCandidateExtensions: readonly ['.tif', '.tiff', '.asc'];
  };
  readonly rasterMask: {
    readonly horizontalCrs: 'EPSG:27700';
    readonly verticalDatum: 'Ordnance Datum Newlyn';
    readonly maskUnit: 'selected_1km_os_grid_reference';
    readonly nativeResolutionPreserved: true;
    readonly resamplingAllowed: false;
    readonly pixelsOutsideMappedGridRefs: 'nodata';
    readonly sourceNodataPreserved: true;
    readonly uncoveredGridRefs: readonly string[];
    readonly uncoveredGridRefsRemain: 'missing';
    readonly h3Role: 'evidence_index_after_materialization_not_source_grid';
  };
  readonly execution: {
    readonly mode: 'dry_run_only';
    readonly archiveConcurrency: 1;
    readonly temporaryExpandedArchiveRetention: 'delete_after_mask_receipt';
    readonly largeDownloadsAllowed: false;
    readonly requiresHydraulicContextGatePassed: true;
    readonly archiveDownloadsAttempted: 0;
    readonly archiveBytesDownloaded: 0;
  };
}

export interface CumbriaDtmMaterializationPlan {
  readonly protocolId: 'cumbria-dtm-materialization-v0';
  readonly state: 'blocked_by_physical_gates';
  readonly archiveCount: 30;
  readonly mappedGridRefCount: 231;
  readonly missingGridRefs: readonly string[];
  readonly estimatedRetainedMaskDecodedBytes: 1056000000;
  readonly minimumFreeSpaceBytes: 17179869184;
  readonly downloadAttempted: false;
  readonly archives: readonly {
    readonly identity: string;
    readonly uri: string;
    readonly resolutionMetres: number;
    readonly mappedGridRefs: number;
    readonly fullArchiveRasterCells: number;
    readonly retainedMaskRasterCells: number;
    readonly estimatedFullArchiveDecodedBytes: number;
    readonly estimatedRetainedMaskDecodedBytes: number;
  }[];
}

export interface CumbriaSpatialGridProtocol {
  readonly id: 'cumbria-spatial-grid-boundary-v0';
  readonly state: 'evidence_index_frozen_solver_mesh_blocked';
  readonly sourceGrids: {
    readonly terrain: {
      readonly datasetId: 'ea-lidar-dtm-time-stamped';
      readonly horizontalCrs: 'EPSG:27700';
      readonly verticalDatum: 'Ordnance Datum Newlyn';
      readonly nativeResolutionMetres: readonly [0.5, 1, 2];
      readonly stagingUnit: 'masked_native_1km_grid_clips';
      readonly resampling: 'none';
      readonly sourceNodata: 'preserve';
      readonly commonResolutionClaim: false;
    };
    readonly landCover: {
      readonly datasetId: 'copernicus-clc2012';
      readonly horizontalCrs: 'EPSG:3035';
      readonly nativeResolutionMetres: 100;
      readonly minimumMappingUnitHectares: 25;
      readonly stagingUnit: 'native_categorical_cells';
      readonly categoricalInterpolation: 'forbidden';
      readonly commonResolutionClaim: false;
    };
    readonly precipitation: {
      readonly datasetId: 'nasa-imerg-v07-final';
      readonly horizontalCrs: 'EPSG:4326';
      readonly nativeResolution: 'approximately_0.1_degree';
      readonly nativeIntervalSeconds: 1800;
      readonly stagingUnit: 'native_cell_footprints';
      readonly h3DoesNotSharpenSource: true;
    };
  };
  readonly evidenceIndex: {
    readonly system: 'H3';
    readonly libraryVersion: '4.3.0';
    readonly resolution: 10;
    readonly envelopeSource: 'hydraulicProtocol.domainEnvelope';
    readonly envelopeBounds: readonly [-3.05, 54.82, -2.8, 55];
    readonly inclusion: 'cell_centroid_inside_envelope';
    readonly cellCount: 24230;
    readonly selectionSha256: string;
    readonly approximateMeanCellAreaM2: 13199;
    readonly role: 'catalog_inspection_and_evidence_join_only';
    readonly terrainSummaries: readonly [
      'coverage_fraction',
      'nodata_fraction',
      'minimum_elevation_m',
      'maximum_elevation_m',
      'mean_elevation_m',
      'source_resolution_counts',
    ];
    readonly landCoverSummaries: readonly [
      'area_fraction_by_clc_class',
      'dominant_class_with_fraction',
    ];
    readonly precipitationSummaries: readonly [
      'native_cell_overlap_fraction',
      'window_accumulation_mm',
    ];
    readonly sourceResolutionsRemainVisible: true;
    readonly exactCellAreaUsed: true;
    readonly physicalRoutingAllowed: false;
    readonly hydraulicStateAllowed: false;
    readonly composition: {
      readonly implementationVersion: 'spatial-evidence-index-v0.1.0';
      readonly state: 'deterministic_fixture_verified_real_sources_not_materialized';
      readonly geometryMethod: 'exact_native_footprint_overlap';
      readonly areaReferenceCrs: 'EPSG:27700';
      readonly areaMeasurementMethod: 'projected_h3_boundary_shoelace';
      readonly coverageToleranceFraction: 0.000001;
      readonly incompletePolicy: 'null_evidence_with_partial_coverage_diagnostics';
      readonly syntheticFixtureCannotEnterRealMode: true;
      readonly observedZeroPreserved: true;
      readonly overlappingFootprintsRejected: true;
      readonly identicalPrecipitationWindowRequired: true;
      readonly verificationFixture: {
        readonly id: 'cumbria-spatial-composition-single-cell-v0';
        readonly h3: '8a1955d817b7fff';
        readonly composedAt: '2026-09-02T06:00:00.000Z';
        readonly terrainElevationM: 105;
        readonly terrainResolutionM: 1;
        readonly landCoverClass: 211;
        readonly rainfallMm: 0;
        readonly windowStart: '2015-12-04T00:00:00.000Z';
        readonly windowEnd: '2015-12-07T00:00:00.000Z';
        readonly expectedResultSha256: string;
      };
    };
  };
  readonly exchangeFrame: {
    readonly horizontalCrs: 'EPSG:27700';
    readonly topology: 'no_common_raster_grid_before_solver_contract';
    readonly terrain: 'native_grid_clips';
    readonly landCover: 'native_class_footprints_reprojected_for_overlap_only';
    readonly precipitation: 'native_cell_footprints_reprojected_for_overlap_only';
    readonly categoricalInterpolationForbidden: true;
    readonly missingInputPolicy: 'missing_or_partial_remains_explicit';
  };
  readonly solverMesh: {
    readonly state: 'blocked_missing_runnable_model_and_geometry';
    readonly horizontalCrsRequired: 'EPSG:27700';
    readonly verticalDatumRequired: 'Ordnance Datum Newlyn';
    readonly extent: null;
    readonly cellSizeMetres: null;
    readonly origin: null;
    readonly width: null;
    readonly height: null;
    readonly timeStepSeconds: null;
    readonly cannotBeDerivedFrom: readonly [
      'metadata_aoi',
      'boundary_protocol_envelope',
      'h3_evidence_index',
      'dtm_native_grid',
      'clc_native_grid',
    ];
    readonly requiredEvidence: readonly [
      'runnable_pre_event_model_or_versioned_replacement_solver',
      'event_valid_channel_cross_sections_and_roughness',
      'boundary_placement_and_values',
      'distributed_initial_state_or_warmup',
      'as_of_event_defence_and_floodgate_state',
      'declared_mesh_extent_origin_cell_size_and_timestep',
    ];
  };
}

export interface CumbriaHydraulicBoundaryProtocol {
  readonly id: 'carlisle-local-hydraulic-protocol-v0';
  readonly state: 'frozen_inputs_blocked_execution';
  readonly domainEnvelope: {
    readonly id: 'carlisle-boundary-protocol-envelope-v0';
    readonly role: 'boundary_protocol_envelope_not_final_mesh';
    readonly crs: 'EPSG:4326';
    readonly bounds: readonly [number, number, number, number];
    readonly projectedCrsRequired: 'EPSG:27700';
    readonly verticalDatumRequired: 'Ordnance Datum Newlyn';
    readonly finalMeshFrozen: false;
    readonly note: string;
  };
  readonly upstreamBoundaries: readonly CumbriaUpstreamBoundary[];
  readonly downstreamBoundary: {
    readonly state: 'missing';
    readonly requiredEvidence: string;
    readonly verticalDatumRequired: 'Ordnance Datum Newlyn';
    readonly sheepmountDatasetId: 'ea-hydrology-sheepmount-level';
    readonly sheepmountUse: 'observation_comparison_only_not_boundary';
    readonly screenedCandidate: {
      readonly station: 'Rockcliffe';
      readonly stationId: '215f4242-cd9c-477e-96a6-0e2de7a3aef5';
      readonly coordinate: CumbriaProtocolCoordinate;
      readonly measureNotation: '215f4242-cd9c-477e-96a6-0e2de7a3aef5-gw-dipped-i-mAOD-qualified';
      readonly classification: 'rejected_groundwater_measure_not_surface_water_boundary';
    };
    readonly historicalModelLimit: {
      readonly sourceDatasetId: 'cumberland-carlisle-sfra-2011-main-and-appendix-c';
      readonly location: 'Old Sandsfield';
      readonly sourceGridReference: 'NY332617';
      readonly coordinate: {
        readonly crs: 'EPSG:27700';
        readonly easting: 333200;
        readonly northing: 561700;
      };
      readonly derivedWgs84: CumbriaProtocolCoordinate & {
        readonly transformation: 'proj4-bng-to-wgs84-v0';
      };
      readonly sourceTidalRelation: 'upstream_of_tidal_limits';
      readonly relation: 'historical_model_limit_without_boundary_values';
    };
    readonly stationSearch: {
      readonly queryUrl: string;
      readonly radiusParameter: 8;
      readonly surfaceWaterStationCount: 15;
      readonly riverEdenStationIds: readonly string[];
      readonly stationAtHistoricalLimit: false;
      readonly selectionSha256: string;
      readonly classification: 'no_downstream_boundary_observation';
    };
  };
  readonly initialState: {
    readonly state: 'missing';
    readonly warmupRequired: true;
    readonly firstUpstreamSamplesDefineDistributedState: false;
    readonly note: string;
  };
  readonly localForcing: {
    readonly precipitationDatasetId: 'nasa-imerg-v07-final';
    readonly spatialScope: 'inside_final_local_domain_downstream_of_upstream_boundaries_only';
    readonly upstreamCatchmentsRepresentedByHydrographsExcluded: true;
    readonly doubleCountingForbidden: true;
    readonly h3Role: 'evidence_index_only_not_hydraulic_mesh';
  };
  readonly evaluationIsolation: {
    readonly datasetIds: readonly [
      'ea-recorded-flood-outlines',
      'copernicus-emsr147-carlisle',
    ];
    readonly geometryLoaded: false;
    readonly inputUse: false;
    readonly calibrationUse: false;
  };
  readonly execution: {
    readonly state: 'blocked';
    readonly blockers: readonly string[];
  };
}

export interface CumbriaBlindEvaluationProtocol {
  readonly id: 'carlisle-blind-inundation-evaluation-v0';
  readonly version: '0.1.0';
  readonly state: 'frozen_reference_sealed_execution_blocked';
  readonly frozenOn: string;
  readonly validationMode: 'blind_hindcast';
  readonly claimBoundary: 'retrospective_historical_replay_not_operational_forecast';
  readonly eventWindow: {
    readonly start: string;
    readonly endExclusive: string;
  };
  readonly predictionFreeze: {
    readonly state: 'missing';
    readonly contentAddressAlgorithm: 'sha256';
    readonly predictionArtifactSha256: null;
    readonly codeRevision: null;
    readonly modelVersion: null;
    readonly transformationVersions: null;
    readonly wetnessCriterion: {
      readonly state: 'missing';
      readonly requirement: string;
    };
    readonly evaluationDomain: {
      readonly state: 'missing';
      readonly horizontalCrsRequired: 'EPSG:27700';
      readonly artifactSha256: null;
      readonly observedGeometryMayDefineDomain: false;
      readonly h3MayDefineHydraulicMesh: false;
    };
    readonly requiredBeforeReferenceAccess: readonly string[];
  };
  readonly referenceSeal: {
    readonly state: 'sealed_not_loaded';
    readonly datasetIds: readonly [
      'ea-recorded-flood-outlines',
      'copernicus-emsr147-carlisle',
    ];
    readonly featureIdentifiersFrozen: false;
    readonly geometryLoaded: false;
    readonly archivesDownloaded: false;
    readonly artifactReceipts: null;
    readonly separateComparisons: true;
    readonly combineReferences: false;
  };
  readonly metrics: readonly {
    readonly id: string;
    readonly unit: 'fraction' | 'm2' | 'm';
    readonly definition: string;
  }[];
  readonly comparisonPolicy: {
    readonly horizontalCrs: 'EPSG:27700';
    readonly areaUnit: 'm2';
    readonly distanceUnit: 'm';
    readonly evaluateEachReferenceSeparately: true;
    readonly missingObservedCoverage: 'exclude_and_report_not_dry';
    readonly missingPredictionCoverage: 'block_evaluation';
    readonly emptyPredictedOrObservedDenominator: 'undefined_metric_with_reason';
    readonly referenceDisagreement: 'report_separately_no_union_or_intersection';
  };
  readonly antiLeakage: {
    readonly referenceGeometryMayEnterModelInput: false;
    readonly referenceGeometryMayEnterCalibration: false;
    readonly referenceGeometryMaySelectDomain: false;
    readonly referenceGeometryMaySelectMesh: false;
    readonly referenceGeometryMaySelectWetnessThreshold: false;
    readonly visualInspectionBeforePredictionFreeze: false;
    readonly postHocThresholdSelection: false;
    readonly metricRemovalAfterReferenceAccess: false;
  };
  readonly execution: {
    readonly state: 'blocked';
    readonly networkRequests: 0;
    readonly filesWritten: 0;
    readonly evaluationRuns: 0;
    readonly blockers: readonly string[];
  };
  readonly protocolSha256: string;
}

export interface CumbriaProtocolCoordinate {
  readonly crs: 'EPSG:4326';
  readonly lon: number;
  readonly lat: number;
}

export interface CumbriaUpstreamBoundary {
  readonly id:
    | 'eden-great-corby'
    | 'irthing-greenholme'
    | 'caldew-cummersdale'
    | 'petteril-newbiggin-bridge';
  readonly watercourse: string;
  readonly datasetId: string;
  readonly stationId: string;
  readonly stationReference: string;
  readonly coordinate: CumbriaProtocolCoordinate;
  readonly quantity: 'discharge';
  readonly unit: 'm3/s';
  readonly nativeIntervalSeconds: 900;
  readonly windowStart: string;
  readonly windowEndExclusive: string;
  readonly samplePolicy: {
    readonly interpretation: 'qualified_instantaneous_observations';
    readonly resampling: 'native_samples_only';
    readonly gapFill: false;
    readonly extrapolation: false;
    readonly missingValueSubstitution: false;
  };
  readonly placement: {
    readonly state: 'blocked_missing_channel_geometry';
    readonly coordinateUse: 'station_location_only';
  };
}

export interface CumbriaAccessGate {
  readonly id: string;
  readonly state: 'passed' | 'blocked';
  readonly reason: string;
}

export interface CumbriaAccessManifest {
  readonly manifestVersion: typeof CUMBRIA_ACCESS_MANIFEST_VERSION;
  readonly audit: {
    readonly id: 'cumbria-2015-carlisle-data-access-audit';
    readonly state: 'metadata_verified';
    readonly verifiedOn: string;
  };
  readonly event: {
    readonly name: 'Storm Desmond';
    readonly windowStart: string;
    readonly windowEndExclusive: string;
    readonly timezone: 'UTC';
    readonly basisUrls: readonly string[];
  };
  readonly aoi: {
    readonly id: 'carlisle-bounded-pilot-v0';
    readonly state: 'frozen_for_metadata_audit';
    readonly crs: 'EPSG:4326';
    readonly bounds: readonly [number, number, number, number];
    readonly note: string;
  };
  readonly policy: {
    readonly missingIsNotZero: true;
    readonly evaluationReferencesExcludedFromInputs: true;
    readonly postEventEvidenceExcludedFromCalibration: true;
    readonly currentAssetStateExcludedFromEventInputs: true;
    readonly largeArtifactsStayOutsideGit: true;
  };
  readonly spatialGridProtocol: CumbriaSpatialGridProtocol;
  readonly hydraulicProtocol: CumbriaHydraulicBoundaryProtocol;
  readonly evaluationProtocol: CumbriaBlindEvaluationProtocol;
  readonly modelAccessRequest: CumbriaModelAccessRequest;
  readonly modelDeliveryIntakeProtocol: CumbriaModelDeliveryIntakeProtocol;
  readonly datasets: readonly CumbriaDatasetAudit[];
  readonly gates: readonly CumbriaAccessGate[];
  readonly acquisition: {
    readonly state: 'metadata_only';
    readonly largeDownloadsAllowed: false;
    readonly nextAction: string;
  };
}

export interface CumbriaModelAccessRequest {
  readonly id: 'cumbria-carlisle-pre-event-model-products-5-6-7-v0';
  readonly state: 'prepared_not_sent';
  readonly recipient: 'enquiries@environment-agency.gov.uk';
  readonly routing: 'local_environment_agency_team';
  readonly subject: string;
  readonly area: 'Carlisle, Cumbria';
  readonly purpose: 'non_commercial_experimental_historical_replay';
  readonly officialBasisUrls: readonly [string, string];
  readonly products: readonly [
    {
      readonly number: 5;
      readonly scope: 'model_and_hydrology_reports';
    },
    {
      readonly number: 6;
      readonly scope: 'model_outputs_and_product_5_reports';
    },
    {
      readonly number: 7;
      readonly scope: 'model_input_data_and_product_5_reports';
    },
  ];
  readonly modelGroupIds: readonly [1313, 1314, 1797, 8323];
  readonly explicitlyExcludedModelGroupIds: readonly [2039, 9458];
  readonly requestedContents: readonly string[];
  readonly product4Requested: false;
  readonly observedEventGeometryRequested: false;
  readonly acceptPostEventModelAsReplayInput: false;
  readonly requestNativeArchivedVersions: true;
  readonly intakePolicy: {
    readonly contentAddressBeforeUse: true;
    readonly verifyTemporalLineageBeforeUse: true;
    readonly verifyCrsDatumUnitsBeforeUse: true;
    readonly postEventMaterialContextOnly: true;
    readonly incompleteDeliveryRemainsMissing: true;
  };
}

const roleSet: ReadonlySet<string> = new Set(CUMBRIA_DATASET_ROLES);
const temporalSet: ReadonlySet<string> = new Set(CUMBRIA_TEMPORAL_RELATIONS);
const accessSet: ReadonlySet<string> = new Set(CUMBRIA_ACCESS_STATES);

export function assertCumbriaAccessManifest(
  candidate: unknown,
): asserts candidate is CumbriaAccessManifest {
  const manifest = record(candidate, 'manifest');
  equal(
    manifest.manifestVersion,
    CUMBRIA_ACCESS_MANIFEST_VERSION,
    'manifestVersion',
  );

  const audit = record(manifest.audit, 'audit');
  equal(audit.id, 'cumbria-2015-carlisle-data-access-audit', 'audit.id');
  equal(audit.state, 'metadata_verified', 'audit.state');
  dateOnly(audit.verifiedOn, 'audit.verifiedOn');

  const event = record(manifest.event, 'event');
  equal(event.name, 'Storm Desmond', 'event.name');
  equal(event.timezone, 'UTC', 'event.timezone');
  timestamp(event.windowStart, 'event.windowStart');
  timestamp(event.windowEndExclusive, 'event.windowEndExclusive');
  equal(event.windowStart, CUMBRIA_EVENT_WINDOW.start, 'event.windowStart');
  equal(
    event.windowEndExclusive,
    CUMBRIA_EVENT_WINDOW.endExclusive,
    'event.windowEndExclusive',
  );
  if (
    Date.parse(event.windowEndExclusive as string) -
      Date.parse(event.windowStart as string) !==
    72 * 60 * 60 * 1000
  ) {
    throw new Error('Cumbria event window must be exactly 72 hours');
  }
  httpsArray(event.basisUrls, 'event.basisUrls');

  const aoi = record(manifest.aoi, 'aoi');
  equal(aoi.id, 'carlisle-bounded-pilot-v0', 'aoi.id');
  equal(aoi.state, 'frozen_for_metadata_audit', 'aoi.state');
  equal(aoi.crs, 'EPSG:4326', 'aoi.crs');
  const bounds = numericArray(aoi.bounds, 4, 'aoi.bounds');
  const [west, south, east, north] = bounds;
  if (west >= east || south >= north) {
    throw new Error('aoi.bounds must be ordered west, south, east, north');
  }
  if (!(west <= -2.951874 && east >= -2.951874 && south <= 54.905047 && north >= 54.905047)) {
    throw new Error('aoi.bounds must contain the Sheepmount reference station');
  }
  nonEmpty(aoi.note, 'aoi.note');

  const policy = record(manifest.policy, 'policy');
  equal(policy.missingIsNotZero, true, 'policy.missingIsNotZero');
  equal(
    policy.evaluationReferencesExcludedFromInputs,
    true,
    'policy.evaluationReferencesExcludedFromInputs',
  );
  equal(
    policy.postEventEvidenceExcludedFromCalibration,
    true,
    'policy.postEventEvidenceExcludedFromCalibration',
  );
  equal(
    policy.currentAssetStateExcludedFromEventInputs,
    true,
    'policy.currentAssetStateExcludedFromEventInputs',
  );
  equal(
    policy.largeArtifactsStayOutsideGit,
    true,
    'policy.largeArtifactsStayOutsideGit',
  );

  modelAccessRequest(manifest.modelAccessRequest);
  assertCumbriaModelDeliveryIntakeProtocol(
    manifest.modelDeliveryIntakeProtocol,
  );

  const datasets = array(manifest.datasets, 'datasets');
  const datasetIds = new Set<string>();
  const datasetRecords = new Map<string, Record<string, unknown>>();
  for (const value of datasets) {
    const dataset = record(value, 'dataset');
    const id = nonEmpty(dataset.id, 'dataset.id');
    if (datasetIds.has(id)) {
      throw new Error(`Duplicate Cumbria dataset id "${id}"`);
    }
    datasetIds.add(id);
    datasetRecords.set(id, dataset);
    nonEmpty(dataset.publisher, `${id}.publisher`);
    nonEmpty(dataset.dataset, `${id}.dataset`);
    nonEmpty(dataset.sourceResolution, `${id}.sourceResolution`);
    nonEmpty(dataset.license, `${id}.license`);
    member(dataset.role, roleSet, `${id}.role`);
    member(dataset.temporalRelation, temporalSet, `${id}.temporalRelation`);
    if ('localArtifacts' in dataset) {
      throw new Error(`${id} must not embed local artifacts in a metadata-only audit`);
    }

    const uses = permittedUses(dataset.permittedUses, id);
    const role = dataset.role as CumbriaDatasetRole;
    const temporalRelation = dataset.temporalRelation as CumbriaTemporalRelation;
    if (role === 'evaluation_reference') {
      if (
        uses.modelInput ||
        uses.calibration ||
        uses.observationComparison ||
        !uses.evaluation
      ) {
        throw new Error(`${id} evaluation evidence must be evaluation-only`);
      }
      if (temporalRelation !== 'post_event') {
        throw new Error(`${id} evaluation evidence must remain post-event`);
      }
    }
    if (role === 'model_input_candidate' && (!uses.modelInput || uses.evaluation)) {
      throw new Error(`${id} model input candidate has inconsistent permitted uses`);
    }
    if (
      temporalRelation === 'post_event' &&
      (uses.modelInput || uses.calibration)
    ) {
      throw new Error(`${id} post-event evidence cannot enter input or calibration`);
    }
    if (
      role === 'context_only' &&
      (uses.modelInput ||
        uses.calibration ||
        uses.observationComparison ||
        uses.evaluation)
    ) {
      throw new Error(`${id} context-only evidence cannot enter computation`);
    }

    const access = record(dataset.access, `${id}.access`);
    member(access.state, accessSet, `${id}.access.state`);
    dateOnly(access.checkedOn, `${id}.access.checkedOn`);
    httpsUrl(access.url, `${id}.access.url`);
    nonEmpty(access.note, `${id}.access.note`);
    if (access.additionalUrls !== undefined) {
      httpsArray(access.additionalUrls, `${id}.access.additionalUrls`);
    }

    if (dataset.seriesAudit !== undefined) {
      seriesAudit(dataset.seriesAudit, id);
    }
  }

  for (const requiredId of [
    'nasa-imerg-v07-final',
    'ea-lidar-dtm-time-stamped',
    'copernicus-clc2012',
    'ea-wfd-river-water-bodies-cycle-1',
    'ea-hydrology-sheepmount-flow',
    'ea-hydrology-sheepmount-level',
    'ea-hydrology-willow-holme-rainfall',
    'ea-hydrology-great-corby-flow',
    'ea-hydrology-greenholme-flow',
    'ea-hydrology-cummersdale-flow',
    'ea-hydrology-newbiggin-bridge-flow',
    'ea-aims-current-spatial-flood-defences',
    'ea-aims-channel-current',
    'cumberland-carlisle-sfra-2011-main-and-appendix-c',
    'cumberland-carlisle-sfra-2011-appendix-d',
    'cumberland-carlisle-section-19-report',
    'ea-flood-model-locations',
    'ea-recorded-flood-outlines',
    'copernicus-emsr147-carlisle',
  ]) {
    if (!datasetIds.has(requiredId)) {
      throw new Error(`Missing required Cumbria dataset "${requiredId}"`);
    }
  }

  blindEvaluationProtocol(manifest.evaluationProtocol, datasetRecords);

  const imergFacts = record(
    datasetRecords.get('nasa-imerg-v07-final')?.facts,
    'nasa-imerg-v07-final.facts',
  );
  equal(imergFacts.product, 'GPM_3IMERGHH', 'IMERG product');
  equal(imergFacts.runType, 'final', 'IMERG run type');
  equal(imergFacts.expectedGranules, 144, 'IMERG expected granules');
  equal(imergFacts.discoveredGranules, 144, 'IMERG discovered granules');
  equal(
    imergFacts.firstGranuleAt,
    CUMBRIA_EVENT_WINDOW.start,
    'IMERG first granule',
  );
  equal(imergFacts.lastGranuleAt, '2015-12-06T23:30:00Z', 'IMERG last granule');

  for (const seriesId of [
    'ea-hydrology-sheepmount-flow',
    'ea-hydrology-sheepmount-level',
    'ea-hydrology-willow-holme-rainfall',
    'ea-hydrology-great-corby-flow',
    'ea-hydrology-greenholme-flow',
    'ea-hydrology-cummersdale-flow',
    'ea-hydrology-newbiggin-bridge-flow',
  ]) {
    const series = record(
      datasetRecords.get(seriesId)?.seriesAudit,
      `${seriesId}.seriesAudit`,
    );
    equal(series.readings, 288, `${seriesId} verified readings`);
    equal(series.missingReadings, 0, `${seriesId} missing readings`);
  }

  const willowSeries = record(
    datasetRecords.get('ea-hydrology-willow-holme-rainfall')?.seriesAudit,
    'ea-hydrology-willow-holme-rainfall.seriesAudit',
  );
  equal(willowSeries.stationReference, '606299', 'Willow Holme station reference');

  hydraulicBoundaryProtocol(manifest.hydraulicProtocol, datasetRecords);
  spatialGridProtocol(
    manifest.spatialGridProtocol,
    manifest.hydraulicProtocol,
    datasetRecords,
  );

  const lidarDataset = datasetRecords.get('ea-lidar-dtm-time-stamped');
  const lidarFacts = record(
    lidarDataset?.facts,
    'ea-lidar-dtm-time-stamped.facts',
  );
  equal(
    lidarFacts.downloadableRasterIdentitiesVerified,
    true,
    'LiDAR downloadable raster identity state',
  );
  equal(lidarFacts.downloadArchiveIdentities, 30, 'LiDAR download archive count');
  equal(
    lidarFacts.materializationProtocolFrozen,
    true,
    'LiDAR materialization protocol state',
  );
  equal(lidarFacts.archiveBytesDownloaded, 0, 'LiDAR downloaded archive bytes');
  const lidar = record(
    lidarDataset?.lidarCatalogAudit,
    'ea-lidar-dtm-time-stamped.lidarCatalogAudit',
  );
  httpsUrl(lidar.queryUrl, 'LiDAR catalogue query URL');
  nonEmpty(lidar.selectionRule, 'LiDAR catalogue selection rule');
  equal(lidar.sourceRows, 550, 'LiDAR catalogue source rows');
  equal(lidar.intersectingGridRefs, 241, 'LiDAR intersecting grid references');
  equal(lidar.preEventRows, 432, 'LiDAR pre-event rows');
  equal(
    lidar.selectedPreEventGridRefs,
    231,
    'LiDAR selected pre-event grid references',
  );
  const missingGridRefs = stringArray(
    lidar.gridRefsWithoutPreEvent,
    'LiDAR grid references without pre-event coverage',
  );
  const expectedMissingGridRefs = [
    'NY3256',
    'NY3446',
    'NY3448',
    'NY3646',
    'NY3652',
    'NY3846',
    'NY3848',
    'NY3959',
    'NY4062',
    'NY4162',
  ];
  if (JSON.stringify(missingGridRefs) !== JSON.stringify(expectedMissingGridRefs)) {
    throw new Error('LiDAR pre-event coverage gaps drifted from the frozen audit');
  }
  if (
    typeof lidar.selectionSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(lidar.selectionSha256)
  ) {
    throw new Error('LiDAR catalogue selection requires a SHA-256 identity');
  }
  const filenameKinds = record(
    lidar.selectedFilenameKinds,
    'LiDAR selected filename kinds',
  );
  equal(filenameKinds.laz, 231, 'LiDAR LAZ-named selections');
  equal(filenameKinds.tif, 0, 'LiDAR TIFF-named selections');
  equal(filenameKinds.zip, 0, 'LiDAR ZIP-named selections');
  const downloadMapping = record(
    lidar.downloadMapping,
    'LiDAR download mapping',
  );
  equal(
    downloadMapping.searchEndpoint,
    'https://environment.data.gov.uk/backend/catalog/api/tiles/collections/survey/search',
    'LiDAR survey search endpoint',
  );
  equal(
    downloadMapping.searchContentType,
    'application/geo+json',
    'LiDAR survey search content type',
  );
  const downloadBounds = numericArray(
    downloadMapping.requestBounds,
    4,
    'LiDAR survey search bounds',
  );
  if (
    JSON.stringify(downloadBounds) !== JSON.stringify(bounds)
  ) {
    throw new Error('LiDAR survey search bounds must equal the audit AOI');
  }
  equal(downloadMapping.searchResultCount, 590, 'LiDAR survey search results');
  equal(
    downloadMapping.productId,
    'lidar_tiles_dtm',
    'LiDAR download product',
  );
  equal(
    downloadMapping.productResultCount,
    123,
    'LiDAR time-stamped DTM search results',
  );
  equal(
    downloadMapping.mappingRule,
    'map each selected 1 km OS grid reference to its containing 5 km tile; require the selected survey-end year; choose the smallest advertised DTM raster resolution; then URI',
    'LiDAR archive mapping rule',
  );
  equal(
    downloadMapping.materializationRule,
    'accept raster pixels only inside the selected 1 km grid references mapped to each archive; the containing 5 km archive does not make every pixel event-valid',
    'LiDAR raster materialization rule',
  );
  equal(
    downloadMapping.mappedPreEventGridRefs,
    231,
    'LiDAR mapped pre-event grid references',
  );
  const unmappedGridRefs = stringArray(
    downloadMapping.unmappedSelectedGridRefs,
    'LiDAR unmapped selected grid references',
  );
  if (unmappedGridRefs.length !== 0) {
    throw new Error('LiDAR selected pre-event records must all map to archives');
  }
  equal(
    downloadMapping.archiveIdentityCount,
    30,
    'LiDAR archive identity count',
  );
  if (!Array.isArray(downloadMapping.archiveIdentities)) {
    throw new Error('LiDAR archive identities must be an array');
  }
  if (
    downloadMapping.archiveIdentities.length !==
    downloadMapping.archiveIdentityCount
  ) {
    throw new Error('LiDAR archive identity count drifted');
  }
  const archiveUris = new Set<string>();
  let mappedArchiveGridRefs = 0;
  for (const [index, value] of downloadMapping.archiveIdentities.entries()) {
    const archive = record(value, `LiDAR archive identity ${index}`);
    equal(archive.product, 'lidar_tiles_dtm', 'LiDAR archive product');
    const archiveYear = nonEmpty(archive.year, 'LiDAR archive year');
    if (!/^\d{4}$/.test(archiveYear)) {
      throw new Error('LiDAR archive year must be a four-digit string');
    }
    const archiveResolution = nonEmpty(
      archive.resolution,
      'LiDAR archive resolution',
    );
    if (!['0.5', '1', '2'].includes(archiveResolution)) {
      throw new Error('LiDAR archive resolution is unsupported');
    }
    const archiveTile = nonEmpty(archive.tile, 'LiDAR archive tile');
    if (!/^NY\d{4}$/.test(archiveTile)) {
      throw new Error('LiDAR archive tile must be a 5 km NY identity');
    }
    const archiveUri = nonEmpty(archive.uri, 'LiDAR archive URI');
    httpsUrl(archiveUri, 'LiDAR archive URI');
    const expectedUri =
      `https://environment.data.gov.uk/tiles/collections/survey/` +
      `lidar_tiles_dtm/${archiveYear}/${archiveResolution}/${archiveTile}`;
    equal(archiveUri, expectedUri, 'LiDAR archive URI identity');
    const mappedGridRefs = integer(
      archive.mappedGridRefs,
      'LiDAR archive mapped grid references',
    );
    if (mappedGridRefs <= 0) {
      throw new Error('LiDAR archive mapped grid references must be positive');
    }
    mappedArchiveGridRefs += mappedGridRefs;
    if (archiveUris.has(archiveUri)) {
      throw new Error('LiDAR archive identities must be unique');
    }
    archiveUris.add(archiveUri);
  }
  equal(
    mappedArchiveGridRefs,
    231,
    'LiDAR archive mapped grid-reference sum',
  );
  for (const [name, value] of [
    ['mapping', downloadMapping.mappingSha256],
    ['archive identity', downloadMapping.archiveIdentitySha256],
  ] as const) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(`LiDAR ${name} requires a SHA-256 identity`);
    }
  }
  equal(
    downloadMapping.mappingSha256,
    '7a75da7dc1ff0c30d2ba20d59714658f7e3b8e853ca2b8c16ce9e01b27d1854c',
    'LiDAR source-to-archive mapping identity',
  );
  equal(
    downloadMapping.archiveIdentitySha256,
    'a842c8ad0b1ce132eb3b61865c5739e9ca6e62eba17090bc52cbcb5fbd159bba',
    'LiDAR archive inventory identity',
  );
  const archiveProbe = record(
    downloadMapping.sampleArchiveProbe,
    'LiDAR sample archive probe',
  );
  equal(
    archiveProbe.uri,
    'https://environment.data.gov.uk/tiles/collections/survey/lidar_tiles_dtm/2009/1/NY3555',
    'LiDAR sample archive URI',
  );
  equal(archiveProbe.httpStatus, 200, 'LiDAR sample archive HTTP status');
  equal(
    archiveProbe.contentType,
    'application/zip',
    'LiDAR sample archive content type',
  );
  equal(
    archiveProbe.contentDisposition,
    'attachment; filename="lidar_tiles_dtm-2009-1-NY35ne.zip"',
    'LiDAR sample archive content disposition',
  );
  equal(archiveProbe.rangeHonored, false, 'LiDAR sample Range response');
  equal(
    archiveProbe.archiveBytesRead,
    0,
    'LiDAR sample archive bytes read',
  );
  dtmMaterializationProtocol(
    downloadMapping.materializationProtocol,
    downloadMapping,
    missingGridRefs,
  );
  equal(
    lidar.acquisitionState,
    'ready_with_explicit_gaps',
    'LiDAR acquisition state',
  );
  nonEmpty(lidar.reason, 'LiDAR acquisition qualification');

  const hydrography = record(
    datasetRecords.get('ea-wfd-river-water-bodies-cycle-1')
      ?.hydrographyAudit,
    'ea-wfd-river-water-bodies-cycle-1.hydrographyAudit',
  );
  const hydrographyFacts = record(
    datasetRecords.get('ea-wfd-river-water-bodies-cycle-1')?.facts,
    'ea-wfd-river-water-bodies-cycle-1.facts',
  );
  equal(hydrographyFacts.createdOn, '2008-01-01', 'WFD Cycle 1 creation date');
  equal(hydrographyFacts.revisedOn, '2012-04-03', 'WFD Cycle 1 revision date');
  equal(hydrographyFacts.eventValid, true, 'WFD Cycle 1 event-valid state');
  equal(
    hydrographyFacts.completeRiverNetwork,
    false,
    'WFD Cycle 1 completeRiverNetwork',
  );
  httpsUrl(hydrography.hitsUrl, 'WFD Cycle 1 hits URL');
  httpsUrl(hydrography.featuresUrl, 'WFD Cycle 1 features URL');
  const hydrographySourceBbox = numericArray(
    hydrography.sourceBbox,
    4,
    'WFD Cycle 1 source bbox',
  );
  if (JSON.stringify(hydrographySourceBbox) !== JSON.stringify(bounds)) {
    throw new Error('WFD Cycle 1 source bbox must equal the audit AOI');
  }
  equal(hydrography.sourceCrs, 'OGC:CRS84', 'WFD Cycle 1 source CRS');
  equal(
    hydrography.geometryClippedToAoi,
    false,
    'WFD Cycle 1 geometry clipping state',
  );
  equal(hydrography.numberMatched, 16, 'WFD Cycle 1 matched features');
  equal(hydrography.numberReturned, 16, 'WFD Cycle 1 returned features');
  const returnedGeometryBounds = numericArray(
    hydrography.returnedGeometryBounds,
    4,
    'WFD Cycle 1 returned geometry bounds',
  );
  if (
    JSON.stringify(returnedGeometryBounds) !==
    JSON.stringify([-3.076089, 54.673167, -2.641659, 55.049455])
  ) {
    throw new Error('WFD Cycle 1 returned geometry bounds drifted');
  }
  const hydrographyIdentities = array(
    hydrography.stableIdentities,
    'WFD Cycle 1 stable identities',
  );
  const expectedHydrographyIds = [
    'GB102076073780',
    'GB102077074150',
    'GB102077074170',
    'GB102076073970',
    'GB102077074140',
    'GB102076073940',
    'GB102076074120',
    'GB102077074160',
    'GB102075073380',
    'GB102076074030',
    'GB102077074190',
    'GB102076073960',
    'GB102076073950',
    'GB102076073910',
    'GB102075073450',
    'GB102076073880',
  ];
  const actualHydrographyIds = hydrographyIdentities.map((value) => {
    const identity = record(value, 'WFD Cycle 1 identity');
    nonEmpty(identity.id, 'WFD Cycle 1 feature id');
    nonEmpty(identity.name, 'WFD Cycle 1 feature name');
    return nonEmpty(identity.eaWbId, 'WFD Cycle 1 water body id');
  });
  if (
    JSON.stringify(actualHydrographyIds) !==
    JSON.stringify(expectedHydrographyIds)
  ) {
    throw new Error('WFD Cycle 1 water body identities drifted');
  }
  if (
    typeof hydrography.selectionSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(hydrography.selectionSha256)
  ) {
    throw new Error('WFD Cycle 1 selection requires a SHA-256 identity');
  }
  equal(
    hydrography.responseByteLimit,
    1048576,
    'WFD Cycle 1 response byte limit',
  );
  equal(
    hydrography.classification,
    'event_valid_context_only',
    'WFD Cycle 1 classification',
  );
  nonEmpty(hydrography.blocker, 'WFD Cycle 1 blocker');

  const defenceDataset = datasetRecords.get(
    'ea-aims-current-spatial-flood-defences',
  );
  equal(defenceDataset?.role, 'context_only', 'AIMS defence role');
  equal(
    defenceDataset?.temporalRelation,
    'current_context',
    'AIMS defence temporal relation',
  );
  const defenceAudit = record(
    defenceDataset?.defenceContextAudit,
    'ea-aims-current-spatial-flood-defences.defenceContextAudit',
  );
  httpsUrl(defenceAudit.queryUrl, 'AIMS defence query URL');
  const defenceSourceBbox = numericArray(
    defenceAudit.sourceBbox,
    4,
    'AIMS defence source bbox',
  );
  if (JSON.stringify(defenceSourceBbox) !== JSON.stringify(bounds)) {
    throw new Error('AIMS defence source bbox must equal the audit AOI');
  }
  equal(defenceAudit.sourceCrs, 'OGC:CRS84', 'AIMS defence source CRS');
  equal(defenceAudit.numberMatched, 291, 'AIMS matched defences');
  equal(defenceAudit.numberReturned, 291, 'AIMS returned defences');
  const defenceReturnedBounds = numericArray(
    defenceAudit.returnedGeometryBounds,
    4,
    'AIMS returned geometry bounds',
  );
  if (
    JSON.stringify(defenceReturnedBounds) !==
    JSON.stringify([-3.019671, 54.816815, -2.836077, 55.007329])
  ) {
    throw new Error('AIMS returned geometry bounds drifted');
  }
  equal(
    defenceAudit.sourceUpdateSemantics,
    'daily_current_inventory',
    'AIMS update semantics',
  );
  equal(defenceAudit.withAssetStartDate, 177, 'AIMS dated assets');
  equal(
    defenceAudit.operationalBeforeEventByStartDateOnly,
    121,
    'AIMS nominally pre-event assets',
  );
  equal(
    defenceAudit.assetStartDateOnOrAfterEvent,
    56,
    'AIMS post-event asset starts',
  );
  equal(defenceAudit.missingAssetStartDate, 114, 'AIMS missing start dates');
  equal(
    defenceAudit.withYearLastRefurbished,
    54,
    'AIMS assets with refurbishment year',
  );
  equal(
    defenceAudit.lastRefurbishedAfter2015,
    4,
    'AIMS post-event refurbishments',
  );
  equal(
    defenceAudit.withCurrentActualCrest,
    214,
    'AIMS current actual crest coverage',
  );
  equal(defenceAudit.withDesignCrest, 83, 'AIMS design crest coverage');
  equal(
    defenceAudit.withDesignStandardOfProtection,
    261,
    'AIMS design standard coverage',
  );
  const defenceSubtypeCounts = record(
    defenceAudit.assetSubtypeCounts,
    'AIMS asset subtype counts',
  );
  const expectedSubtypeCounts = {
    Embankment: 82,
    'Engineered High Ground': 4,
    'Flood Gate': 31,
    'Natural High Ground': 68,
    Spillway: 1,
    Wall: 105,
  };
  if (JSON.stringify(defenceSubtypeCounts) !== JSON.stringify(expectedSubtypeCounts)) {
    throw new Error('AIMS asset subtype counts drifted');
  }
  if (
    typeof defenceAudit.selectionSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(defenceAudit.selectionSha256)
  ) {
    throw new Error('AIMS defence selection requires a SHA-256 identity');
  }
  equal(
    defenceAudit.selectionSha256,
    '79d2cc31c6212c7300bc23cc9171bfde3b500a4c59e60880cc362fca072eb564',
    'AIMS defence selection SHA-256',
  );
  equal(defenceAudit.responseByteLimit, 4194304, 'AIMS response byte limit');
  equal(
    defenceAudit.classification,
    'current_context_only',
    'AIMS defence classification',
  );
  nonEmpty(defenceAudit.blocker, 'AIMS defence blocker');

  const channelDataset = datasetRecords.get('ea-aims-channel-current');
  equal(channelDataset?.role, 'context_only', 'AIMS channel role');
  equal(
    channelDataset?.temporalRelation,
    'current_context',
    'AIMS channel temporal relation',
  );
  const channelAudit = record(
    channelDataset?.channelContextAudit,
    'ea-aims-channel-current.channelContextAudit',
  );
  httpsUrl(channelAudit.queryUrl, 'AIMS channel query URL');
  const channelSourceBbox = numericArray(
    channelAudit.sourceBbox,
    4,
    'AIMS channel source bbox',
  );
  const protocolForChannel = record(manifest.hydraulicProtocol, 'hydraulicProtocol');
  const protocolDomainForChannel = record(
    protocolForChannel.domainEnvelope,
    'hydraulicProtocol.domainEnvelope',
  );
  const protocolBounds = numericArray(
    protocolDomainForChannel.bounds,
    4,
    'hydraulic protocol bounds for channel audit',
  );
  if (JSON.stringify(channelSourceBbox) !== JSON.stringify(protocolBounds)) {
    throw new Error('AIMS channel source bbox must equal the protocol envelope');
  }
  equal(channelAudit.sourceCrs, 'OGC:CRS84', 'AIMS channel source CRS');
  equal(channelAudit.numberMatched, 349, 'AIMS matched channels');
  equal(channelAudit.numberReturned, 349, 'AIMS returned channels');
  const channelReturnedBounds = numericArray(
    channelAudit.returnedGeometryBounds,
    4,
    'AIMS channel returned geometry bounds',
  );
  if (
    JSON.stringify(channelReturnedBounds) !==
    JSON.stringify([-3.053261, 54.830081, -2.795745, 55.007977])
  ) {
    throw new Error('AIMS channel returned geometry bounds drifted');
  }
  equal(
    channelAudit.sourceUpdateSemantics,
    'daily_current_inventory',
    'AIMS channel update semantics',
  );
  equal(channelAudit.withAssetStartDate, 77, 'AIMS dated channels');
  equal(
    channelAudit.operationalBeforeEventByStartDateOnly,
    60,
    'AIMS nominally pre-event channels',
  );
  equal(channelAudit.assetStartDateOnOrAfterEvent, 17, 'AIMS post-event channel starts');
  equal(channelAudit.missingAssetStartDate, 272, 'AIMS missing channel start dates');
  equal(channelAudit.lastRefurbishedAfter2015, 0, 'AIMS channel refurbishments');
  equal(channelAudit.withWatercourseName, 237, 'AIMS named watercourses');
  const channelSubtypeCounts = record(
    channelAudit.assetSubtypeCounts,
    'AIMS channel subtype counts',
  );
  const expectedChannelSubtypeCounts = {
    'Complex Culvert': 29,
    'Open Channel': 91,
    'Simple Culvert': 229,
  };
  if (JSON.stringify(channelSubtypeCounts) !== JSON.stringify(expectedChannelSubtypeCounts)) {
    throw new Error('AIMS channel subtype counts drifted');
  }
  equal(
    channelAudit.selectionSha256,
    '2521ff81a5e2c5b308d3ac69005ab8b7ebeb8338fe51afc93ec92ac57ba75c0c',
    'AIMS channel selection SHA-256',
  );
  equal(channelAudit.crossSectionsIncluded, false, 'AIMS channel cross sections');
  equal(channelAudit.bedElevationIncluded, false, 'AIMS channel bed elevation');
  equal(channelAudit.roughnessIncluded, false, 'AIMS channel roughness');
  equal(
    channelAudit.classification,
    'current_context_only',
    'AIMS channel classification',
  );
  nonEmpty(channelAudit.blocker, 'AIMS channel blocker');

  const lineageDataset = datasetRecords.get(
    'cumberland-carlisle-sfra-2011-appendix-d',
  );
  equal(lineageDataset?.role, 'context_only', 'SFRA lineage role');
  equal(lineageDataset?.temporalRelation, 'pre_event', 'SFRA lineage timing');
  const lineage = record(
    lineageDataset?.hydraulicModelLineageAudit,
    'cumberland-carlisle-sfra-2011-appendix-d.hydraulicModelLineageAudit',
  );
  equal(lineage.documentDate, '2011-11-22', 'SFRA document date');
  const modelComponents = stringArray(lineage.modelComponents, 'SFRA model components');
  if (JSON.stringify(modelComponents) !== JSON.stringify(['ISIS 1D', 'TUFLOW 2D'])) {
    throw new Error('SFRA hydraulic model components drifted');
  }
  equal(lineage.defenceSchemesRepresented, true, 'SFRA defence representation');
  equal(lineage.reportedFloodgates, 23, 'SFRA reported floodgates');
  equal(
    lineage.machineReadableModelFilesAttached,
    false,
    'SFRA model-file attachment state',
  );
  equal(
    lineage.machineReadableBoundaryConditionsAttached,
    false,
    'SFRA boundary attachment state',
  );
  equal(
    lineage.machineReadableChannelGeometryAttached,
    false,
    'SFRA channel attachment state',
  );
  equal(
    lineage.classification,
    'pre_event_model_lineage_only',
    'SFRA lineage classification',
  );
  nonEmpty(lineage.blocker, 'SFRA lineage blocker');

  const domainDataset = datasetRecords.get(
    'cumberland-carlisle-sfra-2011-main-and-appendix-c',
  );
  equal(domainDataset?.role, 'context_only', 'SFRA domain-lineage role');
  equal(domainDataset?.temporalRelation, 'pre_event', 'SFRA domain-lineage timing');
  const domainLineage = record(
    domainDataset?.hydraulicDomainLineageAudit,
    'cumberland-carlisle-sfra-2011-main-and-appendix-c.hydraulicDomainLineageAudit',
  );
  equal(domainLineage.documentDate, '2011-11-22', 'SFRA domain document date');
  equal(domainLineage.originalModelCompletedYear, 1999, 'SFRA original model year');
  equal(
    domainLineage.crossSectionSurveyCompleted,
    '2003-10',
    'SFRA cross-section survey date',
  );
  equal(
    domainLineage.calibrationEvent,
    'January 2005 flood',
    'SFRA calibration event',
  );
  const domainComponents = stringArray(
    domainLineage.modelComponents,
    'SFRA domain model components',
  );
  if (JSON.stringify(domainComponents) !== JSON.stringify(['ISIS 1D', 'TUFLOW 2D'])) {
    throw new Error('SFRA domain model components drifted');
  }
  const domainUpstreamLimits = array(
    domainLineage.upstreamLimits,
    'SFRA upstream model limits',
  );
  const expectedDomainLimits = [
    ['River Eden', 'Wetheral Railway Bridge', 'ea-hydrology-great-corby-flow'],
    ['River Irthing', 'Greenholme Weir', 'ea-hydrology-greenholme-flow'],
    ['River Petteril', 'Scalesceugh', 'ea-hydrology-newbiggin-bridge-flow'],
    ['River Caldew', 'Cummersdale Railway Bridge', 'ea-hydrology-cummersdale-flow'],
  ];
  const actualDomainLimits = domainUpstreamLimits.map((value) => {
    const limit = record(value, 'SFRA upstream model limit');
    equal(limit.placementVerified, false, 'SFRA upstream placement state');
    return [
      nonEmpty(limit.watercourse, 'SFRA upstream watercourse'),
      nonEmpty(limit.location, 'SFRA upstream location'),
      nonEmpty(limit.candidateSeriesDatasetId, 'SFRA upstream candidate series'),
    ];
  });
  if (JSON.stringify(actualDomainLimits) !== JSON.stringify(expectedDomainLimits)) {
    throw new Error('SFRA upstream model limits drifted');
  }
  const domainDownstream = record(
    domainLineage.downstreamLimit,
    'SFRA downstream model limit',
  );
  equal(domainDownstream.location, 'Old Sandsfield', 'SFRA downstream location');
  equal(domainDownstream.sourceGridReference, 'NY332617', 'SFRA downstream grid reference');
  const domainDownstreamCoordinate = record(
    domainDownstream.coordinate,
    'SFRA downstream coordinate',
  );
  equal(domainDownstreamCoordinate.crs, 'EPSG:27700', 'SFRA downstream coordinate CRS');
  equal(domainDownstreamCoordinate.easting, 333200, 'SFRA downstream easting');
  equal(domainDownstreamCoordinate.northing, 561700, 'SFRA downstream northing');
  const domainDownstreamWgs84 = record(
    domainDownstream.derivedWgs84,
    'SFRA downstream WGS84 coordinate',
  );
  equal(domainDownstreamWgs84.crs, 'EPSG:4326', 'SFRA downstream WGS84 CRS');
  equal(domainDownstreamWgs84.lon, -3.044369, 'SFRA downstream longitude');
  equal(domainDownstreamWgs84.lat, 54.945463, 'SFRA downstream latitude');
  equal(
    domainDownstreamWgs84.transformation,
    'proj4-bng-to-wgs84-v0',
    'SFRA downstream transformation',
  );
  equal(
    domainDownstream.sourceTidalRelation,
    'upstream_of_tidal_limits',
    'SFRA downstream tidal relation',
  );
  equal(domainDownstream.boundaryValuesAttached, false, 'SFRA downstream boundary values');
  equal(
    domainLineage.machineReadableCrossSectionsAttached,
    false,
    'SFRA cross-section attachments',
  );
  equal(
    domainLineage.machineReadableBoundaryConditionsAttached,
    false,
    'SFRA domain boundary attachments',
  );
  equal(
    domainLineage.machineReadableModelFilesAttached,
    false,
    'SFRA domain model attachments',
  );
  equal(
    domainLineage.classification,
    'pre_event_domain_lineage_only',
    'SFRA domain classification',
  );
  nonEmpty(domainLineage.blocker, 'SFRA domain blocker');

  const modelLocationsDataset = datasetRecords.get('ea-flood-model-locations');
  equal(modelLocationsDataset?.role, 'context_only', 'model-location role');
  equal(
    modelLocationsDataset?.temporalRelation,
    'current_context',
    'model-location temporal relation',
  );
  const modelLocationsFacts = record(
    modelLocationsDataset?.facts,
    'ea-flood-model-locations.facts',
  );
  equal(modelLocationsFacts.modelFilesIncluded, false, 'model-location files');
  equal(modelLocationsFacts.modelOutputsIncluded, false, 'model-location outputs');
  equal(
    modelLocationsFacts.boundedQueryState,
    'verified',
    'model-location bounded query state',
  );
  equal(
    modelLocationsFacts.boundedCarlisleSelectionVerified,
    true,
    'model-location bounded selection',
  );
  const modelCatalog = record(
    modelLocationsDataset?.floodModelCatalogAudit,
    'ea-flood-model-locations.floodModelCatalogAudit',
  );
  httpsUrl(modelCatalog.queryUrl, 'flood-model catalogue query URL');
  const modelCatalogBbox = numericArray(
    modelCatalog.sourceBbox,
    4,
    'flood-model catalogue source bbox',
  );
  if (JSON.stringify(modelCatalogBbox) !== JSON.stringify(protocolBounds)) {
    throw new Error('Flood-model catalogue bbox must equal the protocol envelope');
  }
  equal(modelCatalog.sourceCrs, 'OGC:CRS84', 'flood-model catalogue CRS');
  equal(modelCatalog.numberMatched, 19, 'flood-model catalogue matched records');
  equal(modelCatalog.numberReturned, 19, 'flood-model catalogue returned records');
  const modelCatalogBounds = numericArray(
    modelCatalog.returnedGeometryBounds,
    4,
    'flood-model catalogue returned bounds',
  );
  if (
    JSON.stringify(modelCatalogBounds) !==
    JSON.stringify([-3.057794, 54.77456, -2.794327, 54.996921])
  ) {
    throw new Error('Flood-model catalogue returned bounds drifted');
  }
  equal(modelCatalog.preEventRecords, 13, 'pre-event flood-model records');
  equal(modelCatalog.eventOrPostEventRecords, 6, 'event/post-event flood-model records');
  const coreModels = array(modelCatalog.coreModels, 'flood-model core records');
  const expectedCoreModels = [
    [1313, 'EA01103 SFRM Eden ABDs (Carlisle)', '2007-06-30', null, 'pre_event_lineage_only'],
    [1314, 'EA01103 SFRM Eden ABDs (Carlisle) - defended', '2007-06-30', null, 'pre_event_lineage_only'],
    [1797, 'EA01103 Carlisle FAS - defended (gates closed)', '2010-01-01', null, 'pre_event_lineage_only'],
    [2039, 'Carlisle 2015', '2016-01-19', 'FMP-TUFLOW (v4.1, 2013-12-AD-iDP-w64)', 'post_event_excluded'],
    [8323, 'Carlisle_Tidal 2012', '2013-07-01', 'TUFLOW (2012-05-AC-w64)', 'pre_event_lineage_only'],
    [9458, 'Carlisle 2016', '2016-11-24', 'FMP-TUFLOW', 'post_event_excluded'],
  ];
  const actualCoreModels = coreModels.map((value) => {
    const model = record(value, 'flood-model core record');
    return [
      integer(model.id, 'flood-model id'),
      nonEmpty(model.name, 'flood-model name'),
      nonEmpty(model.completionDate, 'flood-model completion date'),
      model.softwareAndVersion === null
        ? null
        : nonEmpty(model.softwareAndVersion, 'flood-model software'),
      nonEmpty(model.temporalUse, 'flood-model temporal use'),
    ];
  });
  if (JSON.stringify(actualCoreModels) !== JSON.stringify(expectedCoreModels)) {
    throw new Error('Flood-model core identities drifted');
  }
  equal(
    modelCatalog.selectionSha256,
    '0b721138c212753c7b54739846fa451fbaf964a8ce72ac5e45adc8a7fda45cd1',
    'flood-model catalogue selection SHA-256',
  );
  equal(modelCatalog.modelFilesIncluded, false, 'flood-model catalogue files');
  equal(modelCatalog.modelOutputsIncluded, false, 'flood-model catalogue outputs');
  equal(
    modelCatalog.classification,
    'catalog_identity_only',
    'flood-model catalogue classification',
  );
  nonEmpty(modelCatalog.blocker, 'flood-model catalogue blocker');

  const section19Facts = record(
    datasetRecords.get('cumberland-carlisle-section-19-report')?.facts,
    'cumberland-carlisle-section-19-report.facts',
  );
  equal(
    section19Facts.reportedMechanism,
    'defence overtopping and bypass',
    'Section 19 reported mechanism',
  );
  equal(
    section19Facts.reportedDefenceBreaches,
    false,
    'Section 19 reported defence breaches',
  );
  equal(
    section19Facts.machineReadableHydraulicModelAttached,
    false,
    'Section 19 model attachment state',
  );

  const gates = array(manifest.gates, 'gates');
  const gateStates = new Map<string, string>();
  for (const value of gates) {
    const gate = record(value, 'gate');
    const id = nonEmpty(gate.id, 'gate.id');
    if (gateStates.has(id)) {
      throw new Error(`Duplicate Cumbria gate id "${id}"`);
    }
    if (gate.state !== 'passed' && gate.state !== 'blocked') {
      throw new Error(`${id}.state must be passed or blocked`);
    }
    nonEmpty(gate.reason, `${id}.reason`);
    gateStates.set(id, gate.state);
  }
  equal(gateStates.get('evaluation_withholding'), 'passed', 'evaluation_withholding');
  equal(
    gateStates.get('blind_evaluation_protocol'),
    'passed',
    'blind_evaluation_protocol',
  );
  equal(gateStates.get('upstream_boundary_series'), 'passed', 'upstream_boundary_series');
  equal(
    gateStates.get('hydraulic_boundary_protocol'),
    'passed',
    'hydraulic_boundary_protocol',
  );
  equal(
    gateStates.get('hydraulic_model_access_request'),
    'passed',
    'hydraulic_model_access_request',
  );
  equal(
    gateStates.get('model_delivery_intake'),
    'passed',
    'model_delivery_intake',
  );
  equal(gateStates.get('pre_event_lidar_tiles'), 'passed', 'pre_event_lidar_tiles');
  equal(
    gateStates.get('dtm_materialization_protocol'),
    'passed',
    'dtm_materialization_protocol',
  );
  equal(gateStates.get('spatial_grid_roles'), 'passed', 'spatial_grid_roles');
  equal(
    gateStates.get('spatial_evidence_composition'),
    'passed',
    'spatial_evidence_composition',
  );
  equal(gateStates.get('as_of_event_defence_state'), 'blocked', 'as_of_event_defence_state');
  equal(gateStates.get('hydraulic_context'), 'blocked', 'hydraulic_context');
  equal(gateStates.get('large_artifact_downloads'), 'blocked', 'large_artifact_downloads');

  const acquisition = record(manifest.acquisition, 'acquisition');
  equal(acquisition.state, 'metadata_only', 'acquisition.state');
  equal(
    acquisition.largeDownloadsAllowed,
    false,
    'acquisition.largeDownloadsAllowed',
  );
  nonEmpty(acquisition.nextAction, 'acquisition.nextAction');
}

export function createCumbriaDtmMaterializationPlan(
  candidate: unknown,
  options: { readonly execute?: boolean } = {},
): CumbriaDtmMaterializationPlan {
  assertCumbriaAccessManifest(candidate);

  if (options.execute === true) {
    throw new Error(
      'Cumbria DTM downloads are blocked until the hydraulic-context and large-artifact gates pass',
    );
  }

  const lidar = candidate.datasets.find(
    (dataset) => dataset.id === 'ea-lidar-dtm-time-stamped',
  )?.lidarCatalogAudit;
  if (lidar === undefined) {
    throw new Error('Cumbria DTM materialization requires the frozen LiDAR audit');
  }

  const protocol = lidar.downloadMapping.materializationProtocol;
  const archives = lidar.downloadMapping.archiveIdentities.map((archive) => {
    const resolutionMetres = Number(archive.resolution);
    const fullArchiveRasterCells = Math.round((5000 / resolutionMetres) ** 2);
    const retainedMaskRasterCells = Math.round(
      archive.mappedGridRefs * (1000 / resolutionMetres) ** 2,
    );
    return {
      identity: `${archive.product}/${archive.year}/${archive.resolution}/${archive.tile}`,
      uri: archive.uri,
      resolutionMetres,
      mappedGridRefs: archive.mappedGridRefs,
      fullArchiveRasterCells,
      retainedMaskRasterCells,
      estimatedFullArchiveDecodedBytes:
        fullArchiveRasterCells * protocol.budget.decodedBytesPerCell,
      estimatedRetainedMaskDecodedBytes:
        retainedMaskRasterCells * protocol.budget.decodedBytesPerCell,
    };
  });

  return {
    protocolId: protocol.id,
    state: 'blocked_by_physical_gates',
    archiveCount: 30,
    mappedGridRefCount: 231,
    missingGridRefs: [...protocol.rasterMask.uncoveredGridRefs],
    estimatedRetainedMaskDecodedBytes:
      protocol.budget.estimatedRetainedMaskDecodedBytes,
    minimumFreeSpaceBytes: protocol.budget.minimumFreeSpaceBytes,
    downloadAttempted: false,
    archives,
  };
}

function dtmMaterializationProtocol(
  value: unknown,
  downloadMapping: Record<string, unknown>,
  missingGridRefs: readonly string[],
): void {
  const protocol = record(value, 'LiDAR DTM materialization protocol');
  equal(
    protocol.id,
    'cumbria-dtm-materialization-v0',
    'LiDAR DTM materialization protocol id',
  );
  equal(
    protocol.state,
    'frozen_download_blocked_by_physical_gates',
    'LiDAR DTM materialization protocol state',
  );

  const sourceMapping = record(
    protocol.sourceMapping,
    'LiDAR DTM materialization source mapping',
  );
  equal(
    sourceMapping.archiveIdentitySha256,
    downloadMapping.archiveIdentitySha256,
    'LiDAR DTM archive identity receipt',
  );
  equal(
    sourceMapping.sourceToArchiveMappingSha256,
    downloadMapping.mappingSha256,
    'LiDAR DTM source-to-archive receipt',
  );
  equal(sourceMapping.archiveCount, 30, 'LiDAR DTM protocol archive count');
  equal(
    sourceMapping.mappedGridRefCount,
    231,
    'LiDAR DTM protocol mapped grid-reference count',
  );
  equal(
    sourceMapping.mappingRecomputedBeforeDownload,
    true,
    'LiDAR DTM mapping recomputation policy',
  );
  equal(
    sourceMapping.mappingHashMustMatch,
    true,
    'LiDAR DTM mapping hash policy',
  );

  const archiveIdentities = array(
    downloadMapping.archiveIdentities,
    'LiDAR DTM archive identities for budget',
  );
  const computedArchiveCounts: Record<string, number> = {
    '0.5': 0,
    '1': 0,
    '2': 0,
  };
  const computedMappedCounts: Record<string, number> = {
    '0.5': 0,
    '1': 0,
    '2': 0,
  };
  let computedFullCells = 0;
  let computedMaskCells = 0;
  for (const [index, archiveValue] of archiveIdentities.entries()) {
    const archive = record(archiveValue, `LiDAR DTM budget archive ${index}`);
    const resolution = nonEmpty(
      archive.resolution,
      `LiDAR DTM budget archive ${index} resolution`,
    );
    const mappedCount = integer(
      archive.mappedGridRefs,
      `LiDAR DTM budget archive ${index} mapped grid references`,
    );
    const resolutionMetres = Number(resolution);
    computedArchiveCounts[resolution] += 1;
    computedMappedCounts[resolution] += mappedCount;
    computedFullCells += Math.round((5000 / resolutionMetres) ** 2);
    computedMaskCells += Math.round(
      mappedCount * (1000 / resolutionMetres) ** 2,
    );
  }

  const budget = record(protocol.budget, 'LiDAR DTM materialization budget');
  equal(
    budget.estimateMethod,
    'native-grid-cell-count-times-float32',
    'LiDAR DTM budget estimate method',
  );
  equal(
    budget.estimateExcludesArchiveAndFormatOverhead,
    true,
    'LiDAR DTM budget scope',
  );
  equal(budget.decodedBytesPerCell, 4, 'LiDAR DTM decoded bytes per cell');
  const archiveCounts = record(
    budget.resolutionArchiveCounts,
    'LiDAR DTM resolution archive counts',
  );
  const mappedCounts = record(
    budget.resolutionMappedGridRefCounts,
    'LiDAR DTM resolution mapped grid-reference counts',
  );
  for (const resolution of ['0.5', '1', '2']) {
    equal(
      archiveCounts[resolution],
      computedArchiveCounts[resolution],
      `LiDAR DTM ${resolution} m archive count`,
    );
    equal(
      mappedCounts[resolution],
      computedMappedCounts[resolution],
      `LiDAR DTM ${resolution} m mapped grid-reference count`,
    );
  }
  equal(
    budget.fullArchiveRasterCells,
    computedFullCells,
    'LiDAR DTM full-archive raster cells',
  );
  equal(
    budget.retainedMaskRasterCells,
    computedMaskCells,
    'LiDAR DTM retained-mask raster cells',
  );
  equal(
    budget.estimatedFullArchiveDecodedBytes,
    computedFullCells * 4,
    'LiDAR DTM full-archive decoded-byte estimate',
  );
  equal(
    budget.estimatedRetainedMaskDecodedBytes,
    computedMaskCells * 4,
    'LiDAR DTM retained-mask decoded-byte estimate',
  );
  equal(
    budget.maxArchiveDownloadBytes,
    1073741824,
    'LiDAR DTM per-archive download limit',
  );
  equal(
    budget.maxTotalDownloadBytes,
    8589934592,
    'LiDAR DTM total download limit',
  );
  equal(
    budget.minimumFreeSpaceBytes,
    17179869184,
    'LiDAR DTM minimum free-space gate',
  );

  const receipts = record(protocol.receipts, 'LiDAR DTM receipts');
  equal(receipts.contentAddressAlgorithm, 'sha256', 'LiDAR DTM content address');
  equal(
    receipts.archivePathTemplate,
    'archives/sha256/{sha256}.zip',
    'LiDAR DTM archive path template',
  );
  equal(
    receipts.receiptPathTemplate,
    'receipts/sha256/{sha256}.receipt.json',
    'LiDAR DTM receipt path template',
  );
  equal(receipts.partialFileSuffix, '.part', 'LiDAR DTM partial-file suffix');
  equal(
    receipts.atomicRenameAfterVerification,
    true,
    'LiDAR DTM atomic receipt policy',
  );
  const requiredReceiptFields = stringArray(
    receipts.requiredFields,
    'LiDAR DTM required receipt fields',
  );
  const expectedReceiptFields = [
    'sourceUri',
    'archiveIdentity',
    'downloadedAt',
    'byteLength',
    'sha256',
    'contentType',
    'contentDisposition',
    'sourceToArchiveMappingSha256',
    'mappedGridRefs',
  ];
  if (
    JSON.stringify(requiredReceiptFields) !==
    JSON.stringify(expectedReceiptFields)
  ) {
    throw new Error('LiDAR DTM receipt fields drifted');
  }

  const zip = record(protocol.zipInspection, 'LiDAR DTM ZIP inspection');
  equal(zip.rejectEncryptedEntries, true, 'LiDAR DTM encrypted-entry policy');
  equal(
    zip.rejectSymlinksAndReparsePoints,
    true,
    'LiDAR DTM symlink policy',
  );
  equal(zip.rejectAbsolutePaths, true, 'LiDAR DTM absolute-path policy');
  equal(zip.rejectParentTraversal, true, 'LiDAR DTM path-traversal policy');
  equal(
    zip.rejectDuplicateNormalizedPaths,
    true,
    'LiDAR DTM duplicate-path policy',
  );
  equal(zip.maxEntriesPerArchive, 512, 'LiDAR DTM ZIP entry limit');
  equal(
    zip.maxExpandedBytesPerArchive,
    4294967296,
    'LiDAR DTM per-archive expanded-byte limit',
  );
  equal(
    zip.maxTotalExpandedBytes,
    34359738368,
    'LiDAR DTM total expanded-byte limit',
  );
  if (
    Number(budget.minimumFreeSpaceBytes) <
    Number(budget.maxTotalDownloadBytes) +
      Number(zip.maxExpandedBytesPerArchive) +
      Number(budget.estimatedRetainedMaskDecodedBytes)
  ) {
    throw new Error(
      'LiDAR DTM free-space gate must cover retained downloads, one expanded archive and masked output',
    );
  }
  const rasterExtensions = stringArray(
    zip.rasterCandidateExtensions,
    'LiDAR DTM raster extensions',
  );
  if (
    JSON.stringify(rasterExtensions) !==
    JSON.stringify(['.tif', '.tiff', '.asc'])
  ) {
    throw new Error('LiDAR DTM raster candidate extensions drifted');
  }

  const mask = record(protocol.rasterMask, 'LiDAR DTM raster mask');
  equal(mask.horizontalCrs, 'EPSG:27700', 'LiDAR DTM horizontal CRS');
  equal(mask.verticalDatum, 'Ordnance Datum Newlyn', 'LiDAR DTM vertical datum');
  equal(
    mask.maskUnit,
    'selected_1km_os_grid_reference',
    'LiDAR DTM mask unit',
  );
  equal(mask.nativeResolutionPreserved, true, 'LiDAR DTM resolution policy');
  equal(mask.resamplingAllowed, false, 'LiDAR DTM resampling policy');
  equal(
    mask.pixelsOutsideMappedGridRefs,
    'nodata',
    'LiDAR DTM outside-mask policy',
  );
  equal(mask.sourceNodataPreserved, true, 'LiDAR DTM source NoData policy');
  const uncoveredGridRefs = stringArray(
    mask.uncoveredGridRefs,
    'LiDAR DTM uncovered grid references',
  );
  if (JSON.stringify(uncoveredGridRefs) !== JSON.stringify(missingGridRefs)) {
    throw new Error('LiDAR DTM uncovered grid references drifted');
  }
  equal(
    mask.uncoveredGridRefsRemain,
    'missing',
    'LiDAR DTM uncovered-grid-reference state',
  );
  equal(
    mask.h3Role,
    'evidence_index_after_materialization_not_source_grid',
    'LiDAR DTM H3 role',
  );

  const execution = record(protocol.execution, 'LiDAR DTM execution policy');
  equal(execution.mode, 'dry_run_only', 'LiDAR DTM execution mode');
  equal(execution.archiveConcurrency, 1, 'LiDAR DTM archive concurrency');
  equal(
    execution.temporaryExpandedArchiveRetention,
    'delete_after_mask_receipt',
    'LiDAR DTM temporary expanded-archive retention',
  );
  equal(
    execution.largeDownloadsAllowed,
    false,
    'LiDAR DTM large-download gate',
  );
  equal(
    execution.requiresHydraulicContextGatePassed,
    true,
    'LiDAR DTM hydraulic-context gate',
  );
  equal(
    execution.archiveDownloadsAttempted,
    0,
    'LiDAR DTM attempted archive downloads',
  );
  equal(
    execution.archiveBytesDownloaded,
    0,
    'LiDAR DTM downloaded archive bytes',
  );
}

function spatialGridProtocol(
  value: unknown,
  hydraulicProtocolValue: unknown,
  datasetRecords: ReadonlyMap<string, Record<string, unknown>>,
): void {
  const protocol = record(value, 'spatialGridProtocol');
  equal(
    protocol.id,
    'cumbria-spatial-grid-boundary-v0',
    'spatialGridProtocol.id',
  );
  equal(
    protocol.state,
    'evidence_index_frozen_solver_mesh_blocked',
    'spatialGridProtocol.state',
  );

  const sourceGrids = record(protocol.sourceGrids, 'spatialGridProtocol.sourceGrids');
  const terrain = record(sourceGrids.terrain, 'spatialGridProtocol.sourceGrids.terrain');
  equal(terrain.datasetId, 'ea-lidar-dtm-time-stamped', 'terrain grid dataset');
  equal(terrain.horizontalCrs, 'EPSG:27700', 'terrain grid CRS');
  equal(terrain.verticalDatum, 'Ordnance Datum Newlyn', 'terrain grid datum');
  const terrainResolutions = numericArray(
    terrain.nativeResolutionMetres,
    3,
    'terrain native resolutions',
  );
  if (JSON.stringify(terrainResolutions) !== JSON.stringify([0.5, 1, 2])) {
    throw new Error('terrain native resolutions drifted');
  }
  equal(
    terrain.stagingUnit,
    'masked_native_1km_grid_clips',
    'terrain staging unit',
  );
  equal(terrain.resampling, 'none', 'terrain staging resampling');
  equal(terrain.sourceNodata, 'preserve', 'terrain source NoData policy');
  equal(terrain.commonResolutionClaim, false, 'terrain common-resolution claim');

  const terrainFacts = record(
    datasetRecords.get('ea-lidar-dtm-time-stamped')?.facts,
    'terrain dataset facts',
  );
  equal(terrainFacts.horizontalCrs, 'British National Grid', 'terrain source CRS fact');
  equal(
    terrainFacts.verticalDatum,
    'Ordnance Datum Newlyn',
    'terrain source datum fact',
  );

  const landCover = record(
    sourceGrids.landCover,
    'spatialGridProtocol.sourceGrids.landCover',
  );
  equal(landCover.datasetId, 'copernicus-clc2012', 'land-cover grid dataset');
  equal(landCover.horizontalCrs, 'EPSG:3035', 'land-cover grid CRS');
  equal(landCover.nativeResolutionMetres, 100, 'land-cover native resolution');
  equal(landCover.minimumMappingUnitHectares, 25, 'land-cover mapping unit');
  equal(
    landCover.stagingUnit,
    'native_categorical_cells',
    'land-cover staging unit',
  );
  equal(
    landCover.categoricalInterpolation,
    'forbidden',
    'land-cover interpolation policy',
  );
  equal(
    landCover.commonResolutionClaim,
    false,
    'land-cover common-resolution claim',
  );
  const landCoverFacts = record(
    datasetRecords.get('copernicus-clc2012')?.facts,
    'land-cover dataset facts',
  );
  equal(landCoverFacts.crs, 'EPSG:3035', 'land-cover source CRS fact');
  equal(
    landCoverFacts.rasterResolutionMetres,
    100,
    'land-cover source resolution fact',
  );

  const precipitation = record(
    sourceGrids.precipitation,
    'spatialGridProtocol.sourceGrids.precipitation',
  );
  equal(
    precipitation.datasetId,
    'nasa-imerg-v07-final',
    'precipitation grid dataset',
  );
  equal(precipitation.horizontalCrs, 'EPSG:4326', 'precipitation grid CRS');
  equal(
    precipitation.nativeResolution,
    'approximately_0.1_degree',
    'precipitation native resolution',
  );
  equal(
    precipitation.nativeIntervalSeconds,
    1800,
    'precipitation native interval',
  );
  equal(
    precipitation.stagingUnit,
    'native_cell_footprints',
    'precipitation staging unit',
  );
  equal(
    precipitation.h3DoesNotSharpenSource,
    true,
    'precipitation H3 precision policy',
  );
  const imerg = datasetRecords.get('nasa-imerg-v07-final');
  equal(imerg?.datasetVersion, '07', 'precipitation source version');
  equal(
    imerg?.sourceResolution,
    'approximately 0.1 degree; 30 minutes',
    'precipitation source-resolution fact',
  );

  const evidenceIndex = record(
    protocol.evidenceIndex,
    'spatialGridProtocol.evidenceIndex',
  );
  equal(evidenceIndex.system, 'H3', 'evidence index system');
  equal(evidenceIndex.libraryVersion, '4.3.0', 'evidence index library version');
  equal(evidenceIndex.resolution, 10, 'evidence index resolution');
  equal(
    evidenceIndex.envelopeSource,
    'hydraulicProtocol.domainEnvelope',
    'evidence index envelope source',
  );
  const indexBounds = numericArray(
    evidenceIndex.envelopeBounds,
    4,
    'evidence index envelope bounds',
  );
  const hydraulic = record(hydraulicProtocolValue, 'hydraulicProtocol');
  const hydraulicEnvelope = record(
    hydraulic.domainEnvelope,
    'hydraulicProtocol.domainEnvelope',
  );
  const hydraulicBounds = numericArray(
    hydraulicEnvelope.bounds,
    4,
    'hydraulic protocol envelope bounds',
  );
  if (JSON.stringify(indexBounds) !== JSON.stringify(hydraulicBounds)) {
    throw new Error('H3 evidence index must use the frozen hydraulic protocol envelope');
  }
  equal(
    evidenceIndex.inclusion,
    'cell_centroid_inside_envelope',
    'evidence index inclusion',
  );
  equal(evidenceIndex.cellCount, 24230, 'evidence index cell count');
  equal(
    evidenceIndex.selectionSha256,
    'cee0f57bf78d1886f9e787402aa05eeed431bc36cfd0239f9370d725e2c947f9',
    'evidence index selection identity',
  );
  equal(
    evidenceIndex.approximateMeanCellAreaM2,
    13199,
    'evidence index approximate mean cell area',
  );
  equal(
    evidenceIndex.role,
    'catalog_inspection_and_evidence_join_only',
    'evidence index role',
  );
  const terrainSummaries = stringArray(
    evidenceIndex.terrainSummaries,
    'evidence index terrain summaries',
  );
  if (
    JSON.stringify(terrainSummaries) !==
    JSON.stringify([
      'coverage_fraction',
      'nodata_fraction',
      'minimum_elevation_m',
      'maximum_elevation_m',
      'mean_elevation_m',
      'source_resolution_counts',
    ])
  ) {
    throw new Error('evidence index terrain summaries drifted');
  }
  const landCoverSummaries = stringArray(
    evidenceIndex.landCoverSummaries,
    'evidence index land-cover summaries',
  );
  if (
    JSON.stringify(landCoverSummaries) !==
    JSON.stringify(['area_fraction_by_clc_class', 'dominant_class_with_fraction'])
  ) {
    throw new Error('evidence index land-cover summaries drifted');
  }
  const precipitationSummaries = stringArray(
    evidenceIndex.precipitationSummaries,
    'evidence index precipitation summaries',
  );
  if (
    JSON.stringify(precipitationSummaries) !==
    JSON.stringify(['native_cell_overlap_fraction', 'window_accumulation_mm'])
  ) {
    throw new Error('evidence index precipitation summaries drifted');
  }
  equal(
    evidenceIndex.sourceResolutionsRemainVisible,
    true,
    'evidence index source-resolution policy',
  );
  equal(evidenceIndex.exactCellAreaUsed, true, 'evidence index cell-area policy');
  equal(
    evidenceIndex.physicalRoutingAllowed,
    false,
    'evidence index routing policy',
  );
  equal(
    evidenceIndex.hydraulicStateAllowed,
    false,
    'evidence index hydraulic-state policy',
  );
  const composition = record(
    evidenceIndex.composition,
    'spatialGridProtocol.evidenceIndex.composition',
  );
  equal(
    composition.implementationVersion,
    'spatial-evidence-index-v0.1.0',
    'evidence composition implementation version',
  );
  equal(
    composition.state,
    'deterministic_fixture_verified_real_sources_not_materialized',
    'evidence composition state',
  );
  equal(
    composition.geometryMethod,
    'exact_native_footprint_overlap',
    'evidence composition geometry method',
  );
  equal(
    composition.areaReferenceCrs,
    'EPSG:27700',
    'evidence composition area-reference CRS',
  );
  equal(
    composition.areaMeasurementMethod,
    'projected_h3_boundary_shoelace',
    'evidence composition area-measurement method',
  );
  equal(
    composition.coverageToleranceFraction,
    0.000001,
    'evidence composition coverage tolerance',
  );
  equal(
    composition.incompletePolicy,
    'null_evidence_with_partial_coverage_diagnostics',
    'evidence composition incomplete policy',
  );
  equal(
    composition.syntheticFixtureCannotEnterRealMode,
    true,
    'evidence composition fixture isolation',
  );
  equal(
    composition.observedZeroPreserved,
    true,
    'evidence composition zero policy',
  );
  equal(
    composition.overlappingFootprintsRejected,
    true,
    'evidence composition overlap policy',
  );
  equal(
    composition.identicalPrecipitationWindowRequired,
    true,
    'evidence composition precipitation-window policy',
  );
  const compositionFixture = record(
    composition.verificationFixture,
    'evidence composition verification fixture',
  );
  equal(
    compositionFixture.id,
    'cumbria-spatial-composition-single-cell-v0',
    'evidence composition fixture id',
  );
  equal(compositionFixture.h3, '8a1955d817b7fff', 'evidence composition fixture H3');
  equal(
    compositionFixture.composedAt,
    '2026-09-02T06:00:00.000Z',
    'evidence composition fixture time',
  );
  equal(
    compositionFixture.terrainElevationM,
    105,
    'evidence composition fixture elevation',
  );
  equal(
    compositionFixture.terrainResolutionM,
    1,
    'evidence composition fixture terrain resolution',
  );
  equal(
    compositionFixture.landCoverClass,
    211,
    'evidence composition fixture land-cover class',
  );
  equal(
    compositionFixture.rainfallMm,
    0,
    'evidence composition fixture rainfall',
  );
  equal(
    compositionFixture.windowStart,
    '2015-12-04T00:00:00.000Z',
    'evidence composition fixture window start',
  );
  equal(
    compositionFixture.windowEnd,
    '2015-12-07T00:00:00.000Z',
    'evidence composition fixture window end',
  );
  equal(
    compositionFixture.expectedResultSha256,
    '54dd22a25c9900fd6c989ae21ec4675171b6e0382e92f5571294c5d00bfd9441',
    'evidence composition fixture result identity',
  );

  const exchange = record(protocol.exchangeFrame, 'spatialGridProtocol.exchangeFrame');
  equal(exchange.horizontalCrs, 'EPSG:27700', 'exchange frame CRS');
  equal(
    exchange.topology,
    'no_common_raster_grid_before_solver_contract',
    'exchange frame topology',
  );
  equal(exchange.terrain, 'native_grid_clips', 'exchange terrain representation');
  equal(
    exchange.landCover,
    'native_class_footprints_reprojected_for_overlap_only',
    'exchange land-cover representation',
  );
  equal(
    exchange.precipitation,
    'native_cell_footprints_reprojected_for_overlap_only',
    'exchange precipitation representation',
  );
  equal(
    exchange.categoricalInterpolationForbidden,
    true,
    'exchange categorical interpolation policy',
  );
  equal(
    exchange.missingInputPolicy,
    'missing_or_partial_remains_explicit',
    'exchange missing-input policy',
  );

  const solver = record(protocol.solverMesh, 'spatialGridProtocol.solverMesh');
  equal(
    solver.state,
    'blocked_missing_runnable_model_and_geometry',
    'solver mesh state',
  );
  equal(solver.horizontalCrsRequired, 'EPSG:27700', 'solver mesh CRS');
  equal(
    solver.verticalDatumRequired,
    'Ordnance Datum Newlyn',
    'solver mesh vertical datum',
  );
  for (const field of [
    'extent',
    'cellSizeMetres',
    'origin',
    'width',
    'height',
    'timeStepSeconds',
  ]) {
    equal(solver[field], null, `solver mesh ${field}`);
  }
  const cannotBeDerivedFrom = stringArray(
    solver.cannotBeDerivedFrom,
    'solver mesh prohibited derivations',
  );
  if (
    JSON.stringify(cannotBeDerivedFrom) !==
    JSON.stringify([
      'metadata_aoi',
      'boundary_protocol_envelope',
      'h3_evidence_index',
      'dtm_native_grid',
      'clc_native_grid',
    ])
  ) {
    throw new Error('solver mesh prohibited derivations drifted');
  }
  const requiredEvidence = stringArray(
    solver.requiredEvidence,
    'solver mesh required evidence',
  );
  if (
    JSON.stringify(requiredEvidence) !==
    JSON.stringify([
      'runnable_pre_event_model_or_versioned_replacement_solver',
      'event_valid_channel_cross_sections_and_roughness',
      'boundary_placement_and_values',
      'distributed_initial_state_or_warmup',
      'as_of_event_defence_and_floodgate_state',
      'declared_mesh_extent_origin_cell_size_and_timestep',
    ])
  ) {
    throw new Error('solver mesh required evidence drifted');
  }
}

function blindEvaluationProtocol(
  value: unknown,
  datasetRecords: ReadonlyMap<string, Record<string, unknown>>,
): void {
  const protocol = record(value, 'evaluationProtocol');
  equal(
    protocol.id,
    'carlisle-blind-inundation-evaluation-v0',
    'evaluationProtocol.id',
  );
  equal(protocol.version, '0.1.0', 'evaluationProtocol.version');
  equal(
    protocol.state,
    'frozen_reference_sealed_execution_blocked',
    'evaluationProtocol.state',
  );
  equal(protocol.frozenOn, '2026-09-02', 'evaluationProtocol.frozenOn');
  dateOnly(protocol.frozenOn, 'evaluationProtocol.frozenOn');
  equal(
    protocol.validationMode,
    'blind_hindcast',
    'evaluationProtocol.validationMode',
  );
  equal(
    protocol.claimBoundary,
    'retrospective_historical_replay_not_operational_forecast',
    'evaluationProtocol.claimBoundary',
  );

  const eventWindow = record(protocol.eventWindow, 'evaluationProtocol.eventWindow');
  equal(eventWindow.start, CUMBRIA_EVENT_WINDOW.start, 'evaluationProtocol.eventWindow.start');
  equal(
    eventWindow.endExclusive,
    CUMBRIA_EVENT_WINDOW.endExclusive,
    'evaluationProtocol.eventWindow.endExclusive',
  );

  const prediction = record(
    protocol.predictionFreeze,
    'evaluationProtocol.predictionFreeze',
  );
  equal(prediction.state, 'missing', 'evaluationProtocol.predictionFreeze.state');
  equal(
    prediction.contentAddressAlgorithm,
    'sha256',
    'evaluationProtocol.predictionFreeze.contentAddressAlgorithm',
  );
  for (const field of [
    'predictionArtifactSha256',
    'codeRevision',
    'modelVersion',
    'transformationVersions',
  ]) {
    equal(
      prediction[field],
      null,
      `evaluationProtocol.predictionFreeze.${field}`,
    );
  }

  const wetness = record(
    prediction.wetnessCriterion,
    'evaluationProtocol.predictionFreeze.wetnessCriterion',
  );
  equal(
    wetness.state,
    'missing',
    'evaluationProtocol.predictionFreeze.wetnessCriterion.state',
  );
  nonEmpty(
    wetness.requirement,
    'evaluationProtocol.predictionFreeze.wetnessCriterion.requirement',
  );

  const domain = record(
    prediction.evaluationDomain,
    'evaluationProtocol.predictionFreeze.evaluationDomain',
  );
  equal(
    domain.state,
    'missing',
    'evaluationProtocol.predictionFreeze.evaluationDomain.state',
  );
  equal(
    domain.horizontalCrsRequired,
    'EPSG:27700',
    'evaluationProtocol.predictionFreeze.evaluationDomain.horizontalCrsRequired',
  );
  equal(
    domain.artifactSha256,
    null,
    'evaluationProtocol.predictionFreeze.evaluationDomain.artifactSha256',
  );
  equal(
    domain.observedGeometryMayDefineDomain,
    false,
    'evaluationProtocol.predictionFreeze.evaluationDomain.observedGeometryMayDefineDomain',
  );
  equal(
    domain.h3MayDefineHydraulicMesh,
    false,
    'evaluationProtocol.predictionFreeze.evaluationDomain.h3MayDefineHydraulicMesh',
  );

  const requiredBeforeReferenceAccess = stringArray(
    prediction.requiredBeforeReferenceAccess,
    'evaluationProtocol.predictionFreeze.requiredBeforeReferenceAccess',
  );
  const expectedFreezeRequirements = [
    'physical_input_gates_passed',
    'input_artifact_receipts_frozen',
    'model_and_transformation_versions_frozen',
    'prediction_artifact_content_addressed',
    'predicted_wetness_semantic_frozen',
    'evaluation_domain_and_mask_frozen',
    'code_revision_frozen',
  ];
  if (
    JSON.stringify(requiredBeforeReferenceAccess) !==
    JSON.stringify(expectedFreezeRequirements)
  ) {
    throw new Error('Blind evaluation prediction-freeze requirements drifted');
  }

  const referenceSeal = record(
    protocol.referenceSeal,
    'evaluationProtocol.referenceSeal',
  );
  equal(
    referenceSeal.state,
    'sealed_not_loaded',
    'evaluationProtocol.referenceSeal.state',
  );
  const referenceIds = stringArray(
    referenceSeal.datasetIds,
    'evaluationProtocol.referenceSeal.datasetIds',
  );
  const expectedReferenceIds = [
    'ea-recorded-flood-outlines',
    'copernicus-emsr147-carlisle',
  ];
  if (JSON.stringify(referenceIds) !== JSON.stringify(expectedReferenceIds)) {
    throw new Error('Blind evaluation reference identities drifted');
  }
  for (const id of referenceIds) {
    const dataset = datasetRecords.get(id);
    if (dataset === undefined) {
      throw new Error(`Blind evaluation references unknown dataset "${id}"`);
    }
    const uses = record(dataset.permittedUses, `${id}.permittedUses`);
    if (
      dataset.role !== 'evaluation_reference' ||
      dataset.temporalRelation !== 'post_event' ||
      uses.modelInput !== false ||
      uses.calibration !== false ||
      uses.observationComparison !== false ||
      uses.evaluation !== true
    ) {
      throw new Error(`Blind evaluation dataset "${id}" is not isolated`);
    }
  }
  for (const field of [
    'featureIdentifiersFrozen',
    'geometryLoaded',
    'archivesDownloaded',
  ]) {
    equal(referenceSeal[field], false, `evaluationProtocol.referenceSeal.${field}`);
  }
  equal(
    referenceSeal.artifactReceipts,
    null,
    'evaluationProtocol.referenceSeal.artifactReceipts',
  );
  equal(
    referenceSeal.separateComparisons,
    true,
    'evaluationProtocol.referenceSeal.separateComparisons',
  );
  equal(
    referenceSeal.combineReferences,
    false,
    'evaluationProtocol.referenceSeal.combineReferences',
  );

  const metrics = array(protocol.metrics, 'evaluationProtocol.metrics').map(
    (metricValue, index) => {
      const metric = record(metricValue, `evaluationProtocol.metrics[${index}]`);
      return [
        nonEmpty(metric.id, `evaluationProtocol.metrics[${index}].id`),
        nonEmpty(metric.unit, `evaluationProtocol.metrics[${index}].unit`),
        nonEmpty(
          metric.definition,
          `evaluationProtocol.metrics[${index}].definition`,
        ),
      ];
    },
  );
  const expectedMetrics = [
    ['intersection_over_union', 'fraction', 'intersection_area_divided_by_union_area'],
    ['area_precision', 'fraction', 'intersection_area_divided_by_predicted_wet_area'],
    ['area_recall', 'fraction', 'intersection_area_divided_by_observed_wet_area'],
    ['false_positive_area', 'm2', 'predicted_wet_area_outside_observed_wet_area'],
    ['false_negative_area', 'm2', 'observed_wet_area_outside_predicted_wet_area'],
    [
      'boundary_distance_p95',
      'm',
      'symmetric_95th_percentile_nearest_boundary_distance',
    ],
  ];
  if (JSON.stringify(metrics) !== JSON.stringify(expectedMetrics)) {
    throw new Error('Blind evaluation metric definitions drifted');
  }

  const comparison = record(
    protocol.comparisonPolicy,
    'evaluationProtocol.comparisonPolicy',
  );
  const expectedComparison: Readonly<Record<string, unknown>> = {
    horizontalCrs: 'EPSG:27700',
    areaUnit: 'm2',
    distanceUnit: 'm',
    evaluateEachReferenceSeparately: true,
    missingObservedCoverage: 'exclude_and_report_not_dry',
    missingPredictionCoverage: 'block_evaluation',
    emptyPredictedOrObservedDenominator: 'undefined_metric_with_reason',
    referenceDisagreement: 'report_separately_no_union_or_intersection',
  };
  for (const [field, expected] of Object.entries(expectedComparison)) {
    equal(comparison[field], expected, `evaluationProtocol.comparisonPolicy.${field}`);
  }

  const antiLeakage = record(protocol.antiLeakage, 'evaluationProtocol.antiLeakage');
  for (const field of [
    'referenceGeometryMayEnterModelInput',
    'referenceGeometryMayEnterCalibration',
    'referenceGeometryMaySelectDomain',
    'referenceGeometryMaySelectMesh',
    'referenceGeometryMaySelectWetnessThreshold',
    'visualInspectionBeforePredictionFreeze',
    'postHocThresholdSelection',
    'metricRemovalAfterReferenceAccess',
  ]) {
    equal(antiLeakage[field], false, `evaluationProtocol.antiLeakage.${field}`);
  }

  const execution = record(protocol.execution, 'evaluationProtocol.execution');
  equal(execution.state, 'blocked', 'evaluationProtocol.execution.state');
  equal(execution.networkRequests, 0, 'evaluationProtocol.execution.networkRequests');
  equal(execution.filesWritten, 0, 'evaluationProtocol.execution.filesWritten');
  equal(execution.evaluationRuns, 0, 'evaluationProtocol.execution.evaluationRuns');
  const blockers = stringArray(
    execution.blockers,
    'evaluationProtocol.execution.blockers',
  );
  const expectedBlockers = [
    'hydraulic_execution_blocked',
    'prediction_artifact_missing',
    'prediction_semantics_missing',
    'evaluation_domain_missing',
    'reference_geometry_sealed',
  ];
  if (JSON.stringify(blockers) !== JSON.stringify(expectedBlockers)) {
    throw new Error('Blind evaluation execution blockers drifted');
  }

  const protocolSha256 = nonEmpty(
    protocol.protocolSha256,
    'evaluationProtocol.protocolSha256',
  );
  if (!/^[a-f0-9]{64}$/.test(protocolSha256)) {
    throw new Error('evaluationProtocol.protocolSha256 must be lowercase SHA-256');
  }
}

function modelAccessRequest(value: unknown): void {
  const request = record(value, 'modelAccessRequest');
  equal(
    request.id,
    'cumbria-carlisle-pre-event-model-products-5-6-7-v0',
    'modelAccessRequest.id',
  );
  equal(request.state, 'prepared_not_sent', 'modelAccessRequest.state');
  equal(
    request.recipient,
    'enquiries@environment-agency.gov.uk',
    'modelAccessRequest.recipient',
  );
  equal(
    request.routing,
    'local_environment_agency_team',
    'modelAccessRequest.routing',
  );
  nonEmpty(request.subject, 'modelAccessRequest.subject');
  equal(request.area, 'Carlisle, Cumbria', 'modelAccessRequest.area');
  equal(
    request.purpose,
    'non_commercial_experimental_historical_replay',
    'modelAccessRequest.purpose',
  );
  const basisUrls = stringArray(
    request.officialBasisUrls,
    'modelAccessRequest.officialBasisUrls',
  );
  const expectedBasisUrls = [
    'https://www.gov.uk/guidance/flood-risk-assessments-applying-for-planning-permission',
    'https://www.gov.uk/guidance/using-modelling-for-flood-risk-assessments',
  ];
  if (JSON.stringify(basisUrls) !== JSON.stringify(expectedBasisUrls)) {
    throw new Error('Model access request official basis URLs drifted');
  }
  for (const [index, url] of basisUrls.entries()) {
    httpsUrl(url, `modelAccessRequest.officialBasisUrls[${index}]`);
  }

  const products = array(request.products, 'modelAccessRequest.products');
  const expectedProducts = [
    [5, 'model_and_hydrology_reports'],
    [6, 'model_outputs_and_product_5_reports'],
    [7, 'model_input_data_and_product_5_reports'],
  ];
  const actualProducts = products.map((value, index) => {
    const product = record(value, `modelAccessRequest.products[${index}]`);
    return [
      integer(product.number, `modelAccessRequest.products[${index}].number`),
      nonEmpty(product.scope, `modelAccessRequest.products[${index}].scope`),
    ];
  });
  if (JSON.stringify(actualProducts) !== JSON.stringify(expectedProducts)) {
    throw new Error('Model access request must contain Products 5, 6 and 7');
  }

  const modelGroupIds = numericArray(
    request.modelGroupIds,
    4,
    'modelAccessRequest.modelGroupIds',
  );
  if (JSON.stringify(modelGroupIds) !== JSON.stringify([1313, 1314, 1797, 8323])) {
    throw new Error('Model access request pre-event group identities drifted');
  }
  const excludedIds = numericArray(
    request.explicitlyExcludedModelGroupIds,
    2,
    'modelAccessRequest.explicitlyExcludedModelGroupIds',
  );
  if (JSON.stringify(excludedIds) !== JSON.stringify([2039, 9458])) {
    throw new Error('Model access request post-event exclusions drifted');
  }
  if (modelGroupIds.some((id) => excludedIds.includes(id))) {
    throw new Error('Model access request cannot request an excluded model group');
  }

  const requestedContents = stringArray(
    request.requestedContents,
    'modelAccessRequest.requestedContents',
  );
  const expectedContents = [
    'native_archived_hydraulic_model_files',
    'hydrology_and_hydraulic_reports',
    'model_outputs_for_supplied_pre_event_scenarios',
    'cross_section_and_topographic_survey_files',
    'boundary_condition_definitions_and_source_records',
    'roughness_parameters',
    'defence_and_floodgate_representation',
    'model_development_and_calibration_logs',
    'software_and_version_requirements',
    'horizontal_crs_vertical_datum_and_units',
    'licence_and_reuse_conditions',
  ];
  if (JSON.stringify(requestedContents) !== JSON.stringify(expectedContents)) {
    throw new Error('Model access request contents drifted');
  }
  equal(request.product4Requested, false, 'modelAccessRequest.product4Requested');
  equal(
    request.observedEventGeometryRequested,
    false,
    'modelAccessRequest.observedEventGeometryRequested',
  );
  equal(
    request.acceptPostEventModelAsReplayInput,
    false,
    'modelAccessRequest.acceptPostEventModelAsReplayInput',
  );
  equal(
    request.requestNativeArchivedVersions,
    true,
    'modelAccessRequest.requestNativeArchivedVersions',
  );
  const intake = record(request.intakePolicy, 'modelAccessRequest.intakePolicy');
  equal(intake.contentAddressBeforeUse, true, 'model access content identity');
  equal(intake.verifyTemporalLineageBeforeUse, true, 'model access temporal lineage');
  equal(intake.verifyCrsDatumUnitsBeforeUse, true, 'model access CRS/datum/units');
  equal(intake.postEventMaterialContextOnly, true, 'model access post-event policy');
  equal(intake.incompleteDeliveryRemainsMissing, true, 'model access missing policy');
}

function hydraulicBoundaryProtocol(
  value: unknown,
  datasetRecords: ReadonlyMap<string, Record<string, unknown>>,
): void {
  const protocol = record(value, 'hydraulicProtocol');
  equal(protocol.id, 'carlisle-local-hydraulic-protocol-v0', 'hydraulicProtocol.id');
  equal(
    protocol.state,
    'frozen_inputs_blocked_execution',
    'hydraulicProtocol.state',
  );

  const envelope = record(
    protocol.domainEnvelope,
    'hydraulicProtocol.domainEnvelope',
  );
  equal(
    envelope.id,
    'carlisle-boundary-protocol-envelope-v0',
    'hydraulicProtocol.domainEnvelope.id',
  );
  equal(
    envelope.role,
    'boundary_protocol_envelope_not_final_mesh',
    'hydraulicProtocol.domainEnvelope.role',
  );
  equal(envelope.crs, 'EPSG:4326', 'hydraulicProtocol.domainEnvelope.crs');
  const envelopeBounds = numericArray(
    envelope.bounds,
    4,
    'hydraulicProtocol.domainEnvelope.bounds',
  );
  if (JSON.stringify(envelopeBounds) !== JSON.stringify([-3.05, 54.82, -2.8, 55])) {
    throw new Error('Hydraulic protocol envelope drifted');
  }
  equal(
    envelope.projectedCrsRequired,
    'EPSG:27700',
    'hydraulicProtocol.domainEnvelope.projectedCrsRequired',
  );
  equal(
    envelope.verticalDatumRequired,
    'Ordnance Datum Newlyn',
    'hydraulicProtocol.domainEnvelope.verticalDatumRequired',
  );
  equal(
    envelope.finalMeshFrozen,
    false,
    'hydraulicProtocol.domainEnvelope.finalMeshFrozen',
  );
  nonEmpty(envelope.note, 'hydraulicProtocol.domainEnvelope.note');

  const expectedBoundaries = [
    {
      id: 'eden-great-corby',
      watercourse: 'River Eden',
      datasetId: 'ea-hydrology-great-corby-flow',
      stationId: '244c170e-922f-4e33-8b7d-d02dd50888d3',
      stationReference: '762505',
      lon: -2.830506,
      lat: 54.889932,
    },
    {
      id: 'irthing-greenholme',
      watercourse: 'River Irthing',
      datasetId: 'ea-hydrology-greenholme-flow',
      stationId: '4d9c9969-529b-4990-850c-3a3cb03eb110',
      stationReference: '763308',
      lon: -2.803045,
      lat: 54.914677,
    },
    {
      id: 'caldew-cummersdale',
      watercourse: 'River Caldew',
      datasetId: 'ea-hydrology-cummersdale-flow',
      stationId: '8d4e3c14-3eb9-473b-a98c-51a7e88f0a7f',
      stationReference: '765013',
      lon: -2.944309,
      lat: 54.865699,
    },
    {
      id: 'petteril-newbiggin-bridge',
      watercourse: 'River Petteril',
      datasetId: 'ea-hydrology-newbiggin-bridge-flow',
      stationId: '3982df4e-f922-4bd7-9fc1-cb01d240d0a8',
      stationReference: '764050',
      lon: -2.880585,
      lat: 54.852914,
    },
  ] as const;
  const upstreamBoundaries = array(
    protocol.upstreamBoundaries,
    'hydraulicProtocol.upstreamBoundaries',
  );
  if (upstreamBoundaries.length !== expectedBoundaries.length) {
    throw new Error('Hydraulic protocol must contain exactly four upstream boundaries');
  }
  for (const [index, expected] of expectedBoundaries.entries()) {
    const boundary = record(
      upstreamBoundaries[index],
      `hydraulicProtocol.upstreamBoundaries[${index}]`,
    );
    equal(boundary.id, expected.id, `${expected.id}.id`);
    equal(boundary.watercourse, expected.watercourse, `${expected.id}.watercourse`);
    equal(boundary.datasetId, expected.datasetId, `${expected.id}.datasetId`);
    equal(boundary.stationId, expected.stationId, `${expected.id}.stationId`);
    equal(
      boundary.stationReference,
      expected.stationReference,
      `${expected.id}.stationReference`,
    );
    equal(boundary.quantity, 'discharge', `${expected.id}.quantity`);
    equal(boundary.unit, 'm3/s', `${expected.id}.unit`);
    equal(boundary.nativeIntervalSeconds, 900, `${expected.id}.nativeIntervalSeconds`);
    equal(boundary.windowStart, CUMBRIA_EVENT_WINDOW.start, `${expected.id}.windowStart`);
    equal(
      boundary.windowEndExclusive,
      CUMBRIA_EVENT_WINDOW.endExclusive,
      `${expected.id}.windowEndExclusive`,
    );

    const coordinate = record(boundary.coordinate, `${expected.id}.coordinate`);
    equal(coordinate.crs, 'EPSG:4326', `${expected.id}.coordinate.crs`);
    equal(coordinate.lon, expected.lon, `${expected.id}.coordinate.lon`);
    equal(coordinate.lat, expected.lat, `${expected.id}.coordinate.lat`);
    if (
      expected.lon < envelopeBounds[0] ||
      expected.lon > envelopeBounds[2] ||
      expected.lat < envelopeBounds[1] ||
      expected.lat > envelopeBounds[3]
    ) {
      throw new Error(`${expected.id} station coordinate must remain inside the protocol envelope`);
    }

    const samplePolicy = record(boundary.samplePolicy, `${expected.id}.samplePolicy`);
    equal(
      samplePolicy.interpretation,
      'qualified_instantaneous_observations',
      `${expected.id}.samplePolicy.interpretation`,
    );
    equal(
      samplePolicy.resampling,
      'native_samples_only',
      `${expected.id}.samplePolicy.resampling`,
    );
    equal(samplePolicy.gapFill, false, `${expected.id}.samplePolicy.gapFill`);
    equal(
      samplePolicy.extrapolation,
      false,
      `${expected.id}.samplePolicy.extrapolation`,
    );
    equal(
      samplePolicy.missingValueSubstitution,
      false,
      `${expected.id}.samplePolicy.missingValueSubstitution`,
    );
    const placement = record(boundary.placement, `${expected.id}.placement`);
    equal(
      placement.state,
      'blocked_missing_channel_geometry',
      `${expected.id}.placement.state`,
    );
    equal(
      placement.coordinateUse,
      'station_location_only',
      `${expected.id}.placement.coordinateUse`,
    );

    const dataset = datasetRecords.get(expected.datasetId);
    equal(dataset?.role, 'model_input_candidate', `${expected.id} dataset role`);
    const series = record(dataset?.seriesAudit, `${expected.datasetId}.seriesAudit`);
    equal(series.stationReference, expected.stationReference, `${expected.id} series reference`);
    equal(
      series.measureNotation,
      `${expected.stationId}-flow-i-900-m3s-qualified`,
      `${expected.id} series measure`,
    );
    equal(series.intervalSeconds, 900, `${expected.id} series interval`);
    equal(series.readings, 288, `${expected.id} series readings`);
    equal(series.missingReadings, 0, `${expected.id} series missing readings`);
    equal(series.unit, 'm3/s', `${expected.id} series unit`);
  }

  const downstream = record(
    protocol.downstreamBoundary,
    'hydraulicProtocol.downstreamBoundary',
  );
  equal(downstream.state, 'missing', 'hydraulicProtocol.downstreamBoundary.state');
  nonEmpty(
    downstream.requiredEvidence,
    'hydraulicProtocol.downstreamBoundary.requiredEvidence',
  );
  equal(
    downstream.verticalDatumRequired,
    'Ordnance Datum Newlyn',
    'hydraulicProtocol.downstreamBoundary.verticalDatumRequired',
  );
  equal(
    downstream.sheepmountDatasetId,
    'ea-hydrology-sheepmount-level',
    'hydraulicProtocol.downstreamBoundary.sheepmountDatasetId',
  );
  equal(
    downstream.sheepmountUse,
    'observation_comparison_only_not_boundary',
    'hydraulicProtocol.downstreamBoundary.sheepmountUse',
  );
  equal(
    datasetRecords.get('ea-hydrology-sheepmount-level')?.role,
    'observation_comparison',
    'Sheepmount protocol role',
  );
  const screened = record(
    downstream.screenedCandidate,
    'hydraulicProtocol.downstreamBoundary.screenedCandidate',
  );
  equal(screened.station, 'Rockcliffe', 'Rockcliffe station');
  equal(
    screened.stationId,
    '215f4242-cd9c-477e-96a6-0e2de7a3aef5',
    'Rockcliffe station id',
  );
  equal(
    screened.measureNotation,
    '215f4242-cd9c-477e-96a6-0e2de7a3aef5-gw-dipped-i-mAOD-qualified',
    'Rockcliffe measure notation',
  );
  equal(
    screened.classification,
    'rejected_groundwater_measure_not_surface_water_boundary',
    'Rockcliffe classification',
  );
  const rockcliffeCoordinate = record(screened.coordinate, 'Rockcliffe coordinate');
  equal(rockcliffeCoordinate.crs, 'EPSG:4326', 'Rockcliffe coordinate CRS');
  equal(rockcliffeCoordinate.lon, -2.985661, 'Rockcliffe longitude');
  equal(rockcliffeCoordinate.lat, 54.955058, 'Rockcliffe latitude');

  const historicalLimit = record(
    downstream.historicalModelLimit,
    'hydraulicProtocol.downstreamBoundary.historicalModelLimit',
  );
  equal(
    historicalLimit.sourceDatasetId,
    'cumberland-carlisle-sfra-2011-main-and-appendix-c',
    'Old Sandsfield source dataset',
  );
  equal(historicalLimit.location, 'Old Sandsfield', 'historical downstream location');
  equal(
    historicalLimit.sourceGridReference,
    'NY332617',
    'historical downstream grid reference',
  );
  const historicalCoordinate = record(
    historicalLimit.coordinate,
    'historical downstream BNG coordinate',
  );
  equal(historicalCoordinate.crs, 'EPSG:27700', 'historical downstream CRS');
  equal(historicalCoordinate.easting, 333200, 'historical downstream easting');
  equal(historicalCoordinate.northing, 561700, 'historical downstream northing');
  const historicalWgs84 = record(
    historicalLimit.derivedWgs84,
    'historical downstream WGS84 coordinate',
  );
  equal(historicalWgs84.crs, 'EPSG:4326', 'historical downstream WGS84 CRS');
  equal(historicalWgs84.lon, -3.044369, 'historical downstream longitude');
  equal(historicalWgs84.lat, 54.945463, 'historical downstream latitude');
  equal(
    historicalWgs84.transformation,
    'proj4-bng-to-wgs84-v0',
    'historical downstream coordinate transformation',
  );
  equal(
    historicalLimit.sourceTidalRelation,
    'upstream_of_tidal_limits',
    'historical downstream tidal relation',
  );
  equal(
    historicalLimit.relation,
    'historical_model_limit_without_boundary_values',
    'historical downstream evidence relation',
  );

  const stationSearch = record(
    downstream.stationSearch,
    'hydraulicProtocol.downstreamBoundary.stationSearch',
  );
  httpsUrl(stationSearch.queryUrl, 'downstream station search URL');
  equal(stationSearch.radiusParameter, 8, 'downstream station search radius');
  equal(
    stationSearch.surfaceWaterStationCount,
    15,
    'downstream surface-water station count',
  );
  const riverEdenStationIds = stringArray(
    stationSearch.riverEdenStationIds,
    'downstream River Eden station identities',
  );
  const expectedRiverEdenStationIds = [
    '078cbfd9-31ae-46f4-bbcc-0dbdaa191cd3',
    '3b25dafd-e152-4dab-880a-d5aa4bae26a5',
    'a8358fc5-337b-4a5b-b13f-bb9874c5188f',
  ];
  if (JSON.stringify(riverEdenStationIds) !== JSON.stringify(expectedRiverEdenStationIds)) {
    throw new Error('Downstream River Eden station identities drifted');
  }
  equal(
    stationSearch.stationAtHistoricalLimit,
    false,
    'station at historical downstream limit',
  );
  equal(
    stationSearch.selectionSha256,
    '81df21c39b7f896d1d718fdb1262a8c4d42b9be9fb8e1b466054ba9029a15107',
    'downstream station selection SHA-256',
  );
  equal(
    stationSearch.classification,
    'no_downstream_boundary_observation',
    'downstream station search classification',
  );

  const initialState = record(protocol.initialState, 'hydraulicProtocol.initialState');
  equal(initialState.state, 'missing', 'hydraulicProtocol.initialState.state');
  equal(
    initialState.warmupRequired,
    true,
    'hydraulicProtocol.initialState.warmupRequired',
  );
  equal(
    initialState.firstUpstreamSamplesDefineDistributedState,
    false,
    'hydraulicProtocol.initialState.firstUpstreamSamplesDefineDistributedState',
  );
  nonEmpty(initialState.note, 'hydraulicProtocol.initialState.note');

  const forcing = record(protocol.localForcing, 'hydraulicProtocol.localForcing');
  equal(
    forcing.precipitationDatasetId,
    'nasa-imerg-v07-final',
    'hydraulicProtocol.localForcing.precipitationDatasetId',
  );
  equal(
    forcing.spatialScope,
    'inside_final_local_domain_downstream_of_upstream_boundaries_only',
    'hydraulicProtocol.localForcing.spatialScope',
  );
  equal(
    forcing.upstreamCatchmentsRepresentedByHydrographsExcluded,
    true,
    'hydraulicProtocol.localForcing.upstreamCatchmentsRepresentedByHydrographsExcluded',
  );
  equal(
    forcing.doubleCountingForbidden,
    true,
    'hydraulicProtocol.localForcing.doubleCountingForbidden',
  );
  equal(
    forcing.h3Role,
    'evidence_index_only_not_hydraulic_mesh',
    'hydraulicProtocol.localForcing.h3Role',
  );

  const isolation = record(
    protocol.evaluationIsolation,
    'hydraulicProtocol.evaluationIsolation',
  );
  const evaluationDatasetIds = stringArray(
    isolation.datasetIds,
    'hydraulicProtocol.evaluationIsolation.datasetIds',
  );
  if (
    JSON.stringify(evaluationDatasetIds) !==
    JSON.stringify(['ea-recorded-flood-outlines', 'copernicus-emsr147-carlisle'])
  ) {
    throw new Error('Hydraulic protocol evaluation references drifted');
  }
  equal(isolation.geometryLoaded, false, 'hydraulicProtocol.evaluationIsolation.geometryLoaded');
  equal(isolation.inputUse, false, 'hydraulicProtocol.evaluationIsolation.inputUse');
  equal(
    isolation.calibrationUse,
    false,
    'hydraulicProtocol.evaluationIsolation.calibrationUse',
  );

  const execution = record(protocol.execution, 'hydraulicProtocol.execution');
  equal(execution.state, 'blocked', 'hydraulicProtocol.execution.state');
  const blockers = stringArray(execution.blockers, 'hydraulicProtocol.execution.blockers');
  const expectedBlockers = [
    'event_valid_channel_and_defence_geometry_missing',
    'upstream_boundary_placement_missing',
    'downstream_boundary_missing',
    'distributed_initial_state_missing',
    'final_mesh_and_timestep_missing',
    'pre_event_terrain_incomplete',
  ];
  if (JSON.stringify(blockers) !== JSON.stringify(expectedBlockers)) {
    throw new Error('Hydraulic protocol execution blockers drifted');
  }
}

function seriesAudit(value: unknown, datasetId: string): void {
  const series = record(value, `${datasetId}.seriesAudit`);
  nonEmpty(series.station, `${datasetId}.seriesAudit.station`);
  nonEmpty(series.stationReference, `${datasetId}.seriesAudit.stationReference`);
  nonEmpty(series.measureNotation, `${datasetId}.seriesAudit.measureNotation`);
  equal(series.intervalSeconds, 900, `${datasetId}.seriesAudit.intervalSeconds`);
  equal(
    series.windowStart,
    CUMBRIA_EVENT_WINDOW.start,
    `${datasetId}.seriesAudit.windowStart`,
  );
  equal(
    series.windowEndExclusive,
    CUMBRIA_EVENT_WINDOW.endExclusive,
    `${datasetId}.seriesAudit.windowEndExclusive`,
  );
  equal(series.expectedReadings, 288, `${datasetId}.seriesAudit.expectedReadings`);
  const readings = integer(series.readings, `${datasetId}.seriesAudit.readings`);
  const missing = integer(
    series.missingReadings,
    `${datasetId}.seriesAudit.missingReadings`,
  );
  if (readings + missing !== 288) {
    throw new Error(`${datasetId} reading accounting must close at 288`);
  }
  timestamp(series.firstObservedAt, `${datasetId}.seriesAudit.firstObservedAt`);
  timestamp(series.lastObservedAt, `${datasetId}.seriesAudit.lastObservedAt`);
  nonEmpty(series.unit, `${datasetId}.seriesAudit.unit`);
  finite(series.minimum, `${datasetId}.seriesAudit.minimum`);
  finite(series.maximum, `${datasetId}.seriesAudit.maximum`);
  if ((series.minimum as number) > (series.maximum as number)) {
    throw new Error(`${datasetId} minimum must not exceed maximum`);
  }
  if (series.aggregate !== undefined) {
    const aggregate = record(
      series.aggregate,
      `${datasetId}.seriesAudit.aggregate`,
    );
    nonEmpty(aggregate.name, `${datasetId}.seriesAudit.aggregate.name`);
    finite(aggregate.value, `${datasetId}.seriesAudit.aggregate.value`);
    nonEmpty(aggregate.unit, `${datasetId}.seriesAudit.aggregate.unit`);
  }
}

function permittedUses(value: unknown, datasetId: string): CumbriaPermittedUses {
  const uses = record(value, `${datasetId}.permittedUses`);
  for (const key of [
    'modelInput',
    'calibration',
    'observationComparison',
    'evaluation',
  ]) {
    if (typeof uses[key] !== 'boolean') {
      throw new Error(`${datasetId}.permittedUses.${key} must be boolean`);
    }
  }
  return uses as unknown as CumbriaPermittedUses;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function numericArray(value: unknown, length: number, label: string): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  ) {
    throw new Error(`${label} must contain ${length} finite numbers`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string' && entry.length > 0)
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function timestamp(value: unknown, label: string): void {
  const text = nonEmpty(value, label);
  if (!text.endsWith('Z') || Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO UTC timestamp`);
  }
}

function dateOnly(value: unknown, label: string): void {
  const text = nonEmpty(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO date`);
  }
}

function httpsUrl(value: unknown, label: string): void {
  const text = nonEmpty(value, label);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS`);
  }
}

function httpsArray(value: unknown, label: string): void {
  const values = array(value, label);
  for (const [index, entry] of values.entries()) {
    httpsUrl(entry, `${label}[${index}]`);
  }
}

function member(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`${label} has an unsupported value`);
  }
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must equal ${String(expected)}`);
  }
}
