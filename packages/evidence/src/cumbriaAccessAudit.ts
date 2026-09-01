export const CUMBRIA_ACCESS_MANIFEST_VERSION = '0.7.0' as const;

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
  readonly downloadProbe: CumbriaLidarDownloadProbe;
  readonly acquisitionState: 'blocked';
  readonly reason: string;
}

export interface CumbriaLidarDownloadProbe {
  readonly endpoint: string;
  readonly requiredQueryParameters: readonly string[];
  readonly missingParameterResponse: {
    readonly httpStatus: 400;
    readonly message: string;
  };
  readonly candidateRequest: {
    readonly product: 'DTM';
    readonly year: '2009';
    readonly resolution: '1M';
    readonly tile: 'NY3957';
    readonly relation: 'unverified_candidate_only';
    readonly httpStatus: 403;
    readonly message: 'Forbidden';
    readonly archiveBytesDownloaded: 0;
  };
  readonly selectorState: 'upstream_error';
  readonly selectorMessage: string;
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
  readonly hydraulicProtocol: CumbriaHydraulicBoundaryProtocol;
  readonly modelAccessRequest: CumbriaModelAccessRequest;
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

  const lidar = record(
    datasetRecords.get('ea-lidar-dtm-time-stamped')?.lidarCatalogAudit,
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
  const downloadProbe = record(lidar.downloadProbe, 'LiDAR download probe');
  equal(
    downloadProbe.endpoint,
    'https://environment.data.gov.uk/api/survey/download',
    'LiDAR download endpoint',
  );
  const requiredQueryParameters = stringArray(
    downloadProbe.requiredQueryParameters,
    'LiDAR download query parameters',
  );
  if (
    JSON.stringify(requiredQueryParameters) !==
    JSON.stringify(['product', 'year', 'resolution', 'tile'])
  ) {
    throw new Error('LiDAR download query parameters drifted');
  }
  const missingParameterResponse = record(
    downloadProbe.missingParameterResponse,
    'LiDAR missing-parameter response',
  );
  equal(
    missingParameterResponse.httpStatus,
    400,
    'LiDAR missing-parameter HTTP status',
  );
  nonEmpty(
    missingParameterResponse.message,
    'LiDAR missing-parameter message',
  );
  const candidateRequest = record(
    downloadProbe.candidateRequest,
    'LiDAR bounded candidate request',
  );
  equal(candidateRequest.product, 'DTM', 'LiDAR candidate product');
  equal(candidateRequest.year, '2009', 'LiDAR candidate year');
  equal(candidateRequest.resolution, '1M', 'LiDAR candidate resolution');
  equal(candidateRequest.tile, 'NY3957', 'LiDAR candidate grid reference');
  equal(
    candidateRequest.relation,
    'unverified_candidate_only',
    'LiDAR candidate relation',
  );
  equal(candidateRequest.httpStatus, 403, 'LiDAR candidate HTTP status');
  equal(candidateRequest.message, 'Forbidden', 'LiDAR candidate response');
  equal(
    candidateRequest.archiveBytesDownloaded,
    0,
    'LiDAR candidate archive bytes downloaded',
  );
  equal(downloadProbe.selectorState, 'upstream_error', 'LiDAR selector state');
  nonEmpty(downloadProbe.selectorMessage, 'LiDAR selector message');
  equal(lidar.acquisitionState, 'blocked', 'LiDAR acquisition state');
  nonEmpty(lidar.reason, 'LiDAR acquisition blocker');

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
  equal(gateStates.get('pre_event_lidar_tiles'), 'blocked', 'pre_event_lidar_tiles');
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
