export const CUMBRIA_ACCESS_MANIFEST_VERSION = '0.1.0' as const;

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
    'ea-hydrology-sheepmount-flow',
    'ea-hydrology-sheepmount-level',
    'ea-hydrology-willow-holme-rainfall',
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
  ]) {
    const series = record(
      datasetRecords.get(seriesId)?.seriesAudit,
      `${seriesId}.seriesAudit`,
    );
    equal(series.readings, 288, `${seriesId} verified readings`);
    equal(series.missingReadings, 0, `${seriesId} missing readings`);
  }

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
  equal(gateStates.get('pre_event_lidar_tiles'), 'blocked', 'pre_event_lidar_tiles');
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
