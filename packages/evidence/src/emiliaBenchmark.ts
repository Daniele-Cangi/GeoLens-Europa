export type HistoricalBenchmarkEvidenceState =
  | 'available'
  | 'incomplete_window'
  | 'missing'
  | 'metadata_only';

export interface HistoricalBenchmarkEvidenceSummary {
  readonly id: string;
  readonly status: HistoricalBenchmarkEvidenceState;
  readonly role:
    | 'model_input'
    | 'evaluation_reference'
    | 'comparison_reference'
    | 'context_only';
  readonly use:
    | 'model_input'
    | 'evaluation_only'
    | 'context_only';
  readonly provider: string;
  readonly dataset: string;
  readonly datasetVersion: string;
  readonly sourceResolution: string;
  readonly temporalRelation:
    | 'pre_event'
    | 'during_event'
    | 'post_event';
  readonly note: string;
}

export interface HistoricalBenchmarkGateEvidence {
  readonly id: string;
  readonly status: HistoricalBenchmarkEvidenceState;
  readonly blocker: string | null;
}

export interface EmiliaRomagnaBenchmarkSnapshot {
  readonly schemaVersion: 'emilia-benchmark-snapshot-v0.1.0';
  readonly benchmarkId:
    'emilia-romagna-2023-forli-retrospective-reconstruction';
  readonly manifest: {
    readonly version: '1.15.0';
    readonly artifactCount: 55;
    readonly artifactBytes: 746_444_721;
    readonly integrityMethod: 'byte_count_and_sha256';
  };
  readonly state: 'evaluated_negative_baseline';
  readonly replayMode: 'retrospective_reconstruction';
  readonly claimLevel:
    'hydrologic_routing_spatial_ranking_diagnostics';
  readonly event: {
    readonly windowStart: '2023-05-16T00:00:00Z';
    readonly windowEnd: '2023-05-18T00:00:00Z';
    readonly knowledgeCutoff: '2023-05-18T00:00:00Z';
  };
  readonly spatial: {
    readonly aoiName: 'Forli bounded pilot';
    readonly aoiCrs: 'EPSG:4326';
    readonly aoiBounds: readonly [11.98, 44.17, 12.1, 44.28];
    readonly gridCrs: 'EPSG:32632';
    readonly cellSizeM: 30;
    readonly width: 335;
    readonly height: 420;
    readonly eligibleCells: 130_307;
    readonly h3RepresentationResolution: 11;
  };
  readonly evidence: readonly HistoricalBenchmarkEvidenceSummary[];
  readonly routing: {
    readonly status: 'incomplete_window';
    readonly missingReason: string;
    readonly modelVersion:
      'runoff-coefficient-proxy-v0.1.0+d8-no-loss-volume-accumulation-v0.1.0';
    readonly rainfall: {
      readonly product: 'GPM_3IMERGHH';
      readonly runType: 'final';
      readonly datasetVersion: '07';
      readonly sourceResolution: '0.1 degree';
      readonly temporalResolution: '30 minute';
      readonly granules: 96;
      readonly expectedGranules: 96;
      readonly minimumMm: number;
      readonly maximumMm: number;
      readonly nativeGridMeanMm: number;
      readonly samplingMethod:
        'nearest native source-cell sample at each EPSG:32632 30 m cell centre';
    };
    readonly counts: {
      readonly sourceLandCells: 129_841;
      readonly flowingCells: 120_498;
      readonly terminalCells: 9_809;
      readonly knownWaterTerminalCells: 466;
    };
    readonly runoff: {
      readonly minimumDepthMm: number;
      readonly maximumDepthMm: number;
      readonly localVolumeM3: number;
      readonly terminalVolumeM3: number;
      readonly massBalanceDifferenceM3: number;
      readonly maximumTerminalAccumulationM3: number;
    };
    readonly limitations: readonly string[];
  };
  readonly evaluation: {
    readonly status: 'available';
    readonly resultVersion: 'blind-concentration-evaluation-v0.1.0';
    readonly referenceDatasetId: 'rer-flood-extent-v7-event-2';
    readonly calibration: false;
    readonly referenceLoadedAfterProtocolFreeze: true;
    readonly evaluatedCells: 130_307;
    readonly observedPositiveCells: 37_374;
    readonly observedPrevalence: number;
    readonly rocAuc: number;
    readonly averagePrecision: number;
    readonly interpretation: 'near_random_negative_baseline';
    readonly statement: string;
  };
  readonly stationComparison: {
    readonly status: 'incomplete_window';
    readonly calibration: false;
    readonly rainfall: readonly {
      readonly station: string;
      readonly gaugeTotalMm: number;
      readonly imergTotalMm: number;
      readonly imergMinusGaugeMm: number;
    }[];
    readonly incompleteHydrometryStations: readonly string[];
    readonly note: string;
  };
  readonly conditionedReplay: {
    readonly status: 'blocked_missing_required_evidence';
    readonly validationMode: 'diagnostic_not_blind';
    readonly missingPolicy: 'block_run_not_zero_or_inferred';
    readonly requiredEvidence: readonly HistoricalBenchmarkGateEvidence[];
  };
  readonly claims: {
    readonly permitted: readonly [
      'experimental_hydrologic_routing',
      'spatial_ranking_diagnostics',
      'negative_baseline',
    ];
    readonly forbidden: readonly [
      'flood_probability',
      'validated_inundation_extent',
      'validated_water_depth',
      'operational_forecast',
    ];
  };
}

/**
 * Small, API-safe projection of the byte-pinned external benchmark.
 * Binary evidence remains outside Git; tests keep this record aligned with
 * the canonical manifest and independently verified receipts.
 */
export const EMILIA_ROMAGNA_2023_BENCHMARK = {
  schemaVersion: 'emilia-benchmark-snapshot-v0.1.0',
  benchmarkId: 'emilia-romagna-2023-forli-retrospective-reconstruction',
  manifest: {
    version: '1.15.0',
    artifactCount: 55,
    artifactBytes: 746_444_721,
    integrityMethod: 'byte_count_and_sha256',
  },
  state: 'evaluated_negative_baseline',
  replayMode: 'retrospective_reconstruction',
  claimLevel: 'hydrologic_routing_spatial_ranking_diagnostics',
  event: {
    windowStart: '2023-05-16T00:00:00Z',
    windowEnd: '2023-05-18T00:00:00Z',
    knowledgeCutoff: '2023-05-18T00:00:00Z',
  },
  spatial: {
    aoiName: 'Forli bounded pilot',
    aoiCrs: 'EPSG:4326',
    aoiBounds: [11.98, 44.17, 12.1, 44.28],
    gridCrs: 'EPSG:32632',
    cellSizeM: 30,
    width: 335,
    height: 420,
    eligibleCells: 130_307,
    h3RepresentationResolution: 11,
  },
  evidence: [
    {
      id: 'nasa-imerg-v07',
      status: 'available',
      role: 'model_input',
      use: 'model_input',
      provider: 'NASA GES DISC via earthaccess',
      dataset: 'GPM IMERG Final Run half-hourly precipitation',
      datasetVersion: '07',
      sourceResolution: '0.1 degree, 30 minute',
      temporalRelation: 'during_event',
      note: 'Retrospective V07 reprocessing; not available at the event knowledge cutoff.',
    },
    {
      id: 'copernicus-dem-glo-30-2022',
      status: 'available',
      role: 'model_input',
      use: 'model_input',
      provider: 'European Union / ESA',
      dataset: 'Copernicus DEM GLO-30',
      datasetVersion: '2022_1',
      sourceResolution: '30 m DSM',
      temporalRelation: 'pre_event',
      note: 'Surface model used for the bounded D8 baseline; not hydraulic-grade bare earth.',
    },
    {
      id: 'copernicus-clc-2018',
      status: 'available',
      role: 'model_input',
      use: 'model_input',
      provider: 'Copernicus Land Monitoring Service',
      dataset: 'CORINE Land Cover 2018',
      datasetVersion: 'V2020_20u1',
      sourceResolution: '100 m',
      temporalRelation: 'pre_event',
      note: 'Official classes represented on the 30 m benchmark grid without treating class 0 as missing.',
    },
    {
      id: 'rer-dbtr-forli-cutoff-2023',
      status: 'incomplete_window',
      role: 'model_input',
      use: 'model_input',
      provider: 'Regione Emilia-Romagna',
      dataset: 'DBTR physical geometry for Forli',
      datasetVersion: '2026 municipal extract with feature-level pre-event cutoff',
      sourceResolution: 'nominal 1:5000 vector source',
      temporalRelation: 'pre_event',
      note: 'Known presence only: zero in a derived mask does not prove historical absence.',
    },
    {
      id: 'rer-flood-extent-v7-event-2',
      status: 'available',
      role: 'evaluation_reference',
      use: 'evaluation_only',
      provider: 'Regione Emilia-Romagna',
      dataset: 'Perimetrazione aree allagate 16-17 May 2023',
      datasetVersion: 'V7, DSG 88/2025',
      sourceResolution: '2022 multipolygon features in EPSG:32632',
      temporalRelation: 'post_event',
      note: 'Loaded only after the prediction protocol was frozen; never a model input or calibration source.',
    },
    {
      id: 'arpae-dext3r-2023-hourly-observations',
      status: 'incomplete_window',
      role: 'comparison_reference',
      use: 'evaluation_only',
      provider: 'ARPAE Emilia-Romagna',
      dataset: 'Dext3r station observations',
      datasetVersion: 'request be86675d-a290-4208-8b38-0bb420396ca0',
      sourceResolution: 'hourly rain and 15-minute local-datum stage',
      temporalRelation: 'during_event',
      note: 'Rain windows are complete; two hydrometric station windows are incomplete and no stage is converted to discharge.',
    },
  ],
  routing: {
    status: 'incomplete_window',
    missingReason:
      'DBTR known permanent-water presence is not a complete historical snapshot; zeros in that mask do not prove historical land.',
    modelVersion:
      'runoff-coefficient-proxy-v0.1.0+d8-no-loss-volume-accumulation-v0.1.0',
    rainfall: {
      product: 'GPM_3IMERGHH',
      runType: 'final',
      datasetVersion: '07',
      sourceResolution: '0.1 degree',
      temporalResolution: '30 minute',
      granules: 96,
      expectedGranules: 96,
      minimumMm: 86.2300033569336,
      maximumMm: 105.44499206542969,
      nativeGridMeanMm: 93.982,
      samplingMethod:
        'nearest native source-cell sample at each EPSG:32632 30 m cell centre',
    },
    counts: {
      sourceLandCells: 129_841,
      flowingCells: 120_498,
      terminalCells: 9_809,
      knownWaterTerminalCells: 466,
    },
    runoff: {
      minimumDepthMm: 17.25223194234198,
      maximumDepthMm: 91.24889406613599,
      localVolumeM3: 6_176_691.498415089,
      terminalVolumeM3: 6_176_691.498415042,
      massBalanceDifferenceM3: -4.7497451305389404e-8,
      maximumTerminalAccumulationM3: 24_490.605559146057,
    },
    limitations: [
      'Runoff is an experimental coefficient proxy, not a calibrated rainfall-runoff model.',
      'D8 routing does not model depression conditioning, river stage, discharge, breaches, capacity or hydraulics.',
      'Accumulated volume is terrain-flow concentration, not inundation extent or water depth.',
    ],
  },
  evaluation: {
    status: 'available',
    resultVersion: 'blind-concentration-evaluation-v0.1.0',
    referenceDatasetId: 'rer-flood-extent-v7-event-2',
    calibration: false,
    referenceLoadedAfterProtocolFreeze: true,
    evaluatedCells: 130_307,
    observedPositiveCells: 37_374,
    observedPrevalence: 0.2868149830784225,
    rocAuc: 0.49162439445221917,
    averagePrecision: 0.2776793857866033,
    interpretation: 'near_random_negative_baseline',
    statement:
      'Unconditioned D8 runoff concentration did not reconstruct the observed flood footprint better than chance and is retained as negative evidence.',
  },
  stationComparison: {
    status: 'incomplete_window',
    calibration: false,
    rainfall: [
      {
        station: "Forli' urbana",
        gaugeTotalMm: 113.8,
        imergTotalMm: 104.22000122070312,
        imergMinusGaugeMm: -9.5799987793,
      },
      {
        station: 'Ponte Braldo',
        gaugeTotalMm: 131,
        imergTotalMm: 88.08999633789062,
        imergMinusGaugeMm: -42.9100036621,
      },
    ],
    incompleteHydrometryStations: ["Forli'", 'Predappio'],
    note:
      'Station values remain a post-freeze comparison. Local-datum stage is not converted to discharge and does not calibrate routing.',
  },
  conditionedReplay: {
    status: 'blocked_missing_required_evidence',
    validationMode: 'diagnostic_not_blind',
    missingPolicy: 'block_run_not_zero_or_inferred',
    requiredEvidence: [
      {
        id: 'rainfall_and_surface_runoff_forcing',
        status: 'available',
        blocker: null,
      },
      {
        id: 'antecedent_moisture_or_model_warmup',
        status: 'missing',
        blocker: 'The forcing begins on 16 May and does not represent the wet initial state left by the earlier May event.',
      },
      {
        id: 'montone_and_rabbi_inflow_hydrographs',
        status: 'incomplete_window',
        blocker: 'No full-window, machine-readable event-valid discharge hydrographs or high-flow rating relations are public for both rivers.',
      },
      {
        id: 'downstream_stage_or_discharge_boundary',
        status: 'incomplete_window',
        blocker: 'Complete local-datum stages cannot become a hydraulic boundary without datum and rating information.',
      },
      {
        id: 'breach_location_timing_and_geometry',
        status: 'metadata_only',
        blocker: 'Official records name locations but do not publish coordinates, activation times, elevations or breach evolution.',
      },
      {
        id: 'embankment_crest_geometry',
        status: 'incomplete_window',
        blocker: 'Pre-event crest elevations do not cover the domain and post-event repairs cannot be imported as historical geometry.',
      },
      {
        id: 'bare_earth_terrain',
        status: 'metadata_only',
        blocker: 'The bounded PST representation retains critical no-data; GLO-30 is a DSM, not hydraulic-grade bare earth.',
      },
      {
        id: 'channel_geometry_and_roughness',
        status: 'metadata_only',
        blocker: 'Public archives contain drawings but no numeric cross-sections, event-valid roughness or hydraulic project files.',
      },
    ],
  },
  claims: {
    permitted: [
      'experimental_hydrologic_routing',
      'spatial_ranking_diagnostics',
      'negative_baseline',
    ],
    forbidden: [
      'flood_probability',
      'validated_inundation_extent',
      'validated_water_depth',
      'operational_forecast',
    ],
  },
} as const satisfies EmiliaRomagnaBenchmarkSnapshot;
