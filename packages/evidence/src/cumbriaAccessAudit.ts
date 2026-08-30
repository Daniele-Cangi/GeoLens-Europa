export const CUMBRIA_ACCESS_MANIFEST_VERSION = '0.4.0' as const;

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
  readonly datasets: readonly CumbriaDatasetAudit[];
  readonly gates: readonly CumbriaAccessGate[];
  readonly acquisition: {
    readonly state: 'metadata_only';
    readonly largeDownloadsAllowed: false;
    readonly nextAction: string;
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
    'ea-hydrology-cummersdale-flow',
    'ea-hydrology-newbiggin-bridge-flow',
    'ea-aims-current-spatial-flood-defences',
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
    modelLocationsFacts.boundedCarlisleSelectionVerified,
    false,
    'model-location bounded selection',
  );

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
