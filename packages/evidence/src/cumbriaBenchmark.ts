export interface CumbriaBenchmarkSnapshot {
  readonly schemaVersion: 'cumbria-benchmark-snapshot-v0.1.0';
  readonly benchmarkId: 'cumbria-2015-carlisle-public-replay';
  readonly manifestVersion: '0.33.0';
  readonly state: 'completed_negative_baseline_retained';
  readonly claimLevel: 'experimental_surface_flow_hindcast';
  readonly event: {
    readonly windowStart: '2015-12-04T00:00:00Z';
    readonly windowEndExclusive: '2015-12-07T00:00:00Z';
  };
  readonly spatial: {
    readonly name: 'Sheepmount to Old Sandsfield bounded reach';
    readonly crs: 'EPSG:27700';
    readonly bounds: readonly [332000, 556000, 340000, 563000];
    readonly primaryCellSizeM: 20;
    readonly primaryWidth: 400;
    readonly primaryHeight: 350;
    readonly frozenEvaluationCells: 73_502;
  };
  readonly forcing: {
    readonly imerg: {
      readonly product: 'GPM_3IMERGHH';
      readonly datasetVersion: '07';
      readonly runType: 'final';
      readonly sourceResolution: '0.1 degree';
      readonly intervalMinutes: 30;
      readonly samples: 144;
    };
    readonly sheepmount: {
      readonly sourceIntervalMinutes: 15;
      readonly samples: 288;
      readonly maximumObservedM3s: number;
      readonly derivedExcessVolumeM3: number;
      readonly meaning: 'incremental_event_discharge_proxy_not_total_channel_flow';
    };
  };
  readonly prediction: {
    readonly scenarioCount: 9;
    readonly selectedScenario: 'primary-20m';
    readonly selectionOccurredAfterReferenceAccess: false;
    readonly wetnessThresholdM: 0.05;
    readonly predictedWetCells: 14_357;
    readonly predictedWetAreaM2: 5_742_800;
    readonly receiptSha256: string;
  };
  readonly comparisons: readonly {
    readonly referenceId: string;
    readonly observedWetCells: number;
    readonly intersectionOverUnion: number;
    readonly precision: number;
    readonly recall: number;
    readonly falsePositiveAreaM2: number;
    readonly falseNegativeAreaM2: number;
    readonly boundaryDistanceP95M: number;
  }[];
  readonly diagnosis: {
    readonly falsePositiveAtOrAbove10cmRange: readonly [number, number];
    readonly falsePositiveAtOrAbove30cmRange: readonly [number, number];
    readonly interpretation: string;
  };
  readonly revisionGate: {
    readonly state: 'frozen_no_revision_authorized';
    readonly solverRevisionAllowed: false;
    readonly carlisleRevisionRunAllowed: false;
    readonly validationClaimAllowed: false;
    readonly hypotheses: readonly {
      readonly id: string;
      readonly status: 'unconfirmed_evidence_blocked';
      readonly statement: string;
    }[];
    readonly newHoldoutRequiredForValidationClaim: true;
  };
  readonly claims: {
    readonly permitted: readonly [
      'retained_negative_baseline',
      'failure_diagnosis',
      'transparent_non_blind_comparison',
    ];
    readonly forbidden: readonly [
      'validated_flood_model',
      'calibration_from_opened_carlisle_references',
      'blind_validation_claim_from_reused_references',
    ];
  };
}

/**
 * Publication-safe projection of the frozen Cumbria manifest. It contains no
 * external paths, source arrays or evaluation geometry.
 */
export const CUMBRIA_2015_BENCHMARK = {
  schemaVersion: 'cumbria-benchmark-snapshot-v0.1.0',
  benchmarkId: 'cumbria-2015-carlisle-public-replay',
  manifestVersion: '0.33.0',
  state: 'completed_negative_baseline_retained',
  claimLevel: 'experimental_surface_flow_hindcast',
  event: {
    windowStart: '2015-12-04T00:00:00Z',
    windowEndExclusive: '2015-12-07T00:00:00Z',
  },
  spatial: {
    name: 'Sheepmount to Old Sandsfield bounded reach',
    crs: 'EPSG:27700',
    bounds: [332000, 556000, 340000, 563000],
    primaryCellSizeM: 20,
    primaryWidth: 400,
    primaryHeight: 350,
    frozenEvaluationCells: 73_502,
  },
  forcing: {
    imerg: {
      product: 'GPM_3IMERGHH',
      datasetVersion: '07',
      runType: 'final',
      sourceResolution: '0.1 degree',
      intervalMinutes: 30,
      samples: 144,
    },
    sheepmount: {
      sourceIntervalMinutes: 15,
      samples: 288,
      maximumObservedM3s: 1_676.632,
      derivedExcessVolumeM3: 118_482_930.9,
      meaning: 'incremental_event_discharge_proxy_not_total_channel_flow',
    },
  },
  prediction: {
    scenarioCount: 9,
    selectedScenario: 'primary-20m',
    selectionOccurredAfterReferenceAccess: false,
    wetnessThresholdM: 0.05,
    predictedWetCells: 14_357,
    predictedWetAreaM2: 5_742_800,
    receiptSha256:
      'f2a3a7489699a70a6d5c770633bdc9f789184ca26cb8190c85a1d28d40495dc6',
  },
  comparisons: [
    {
      referenceId: 'ea-recorded-flood-outlines-carlisle-2015',
      observedWetCells: 1_852,
      intersectionOverUnion: 0.05465547530743705,
      precision: 0.05850804485616772,
      recall: 0.4535637149028078,
      falsePositiveAreaM2: 5_406_800,
      falseNegativeAreaM2: 404_800,
      boundaryDistanceP95M: 7_446.356155841063,
    },
    {
      referenceId: 'copernicus-emsr147-carlisle-initial',
      observedWetCells: 348,
      intersectionOverUnion: 0.013998069231830092,
      precision: 0.014139444173573866,
      recall: 0.5833333333333334,
      falsePositiveAreaM2: 5_661_600,
      falseNegativeAreaM2: 58_000,
      boundaryDistanceP95M: 2_370.8184215220977,
    },
    {
      referenceId: 'copernicus-emsr147-carlisle-monitoring-01',
      observedWetCells: 1_573,
      intersectionOverUnion: 0.030334389754867085,
      precision: 0.03266699171136031,
      recall: 0.29815638906548,
      falsePositiveAreaM2: 5_555_200,
      falseNegativeAreaM2: 441_600,
      boundaryDistanceP95M: 2_271.8229307355004,
    },
  ],
  diagnosis: {
    falsePositiveAtOrAbove10cmRange: [0.7836798106088629, 0.7934187788018433],
    falsePositiveAtOrAbove30cmRange: [0.3404601612783902, 0.3665034562211982],
    interpretation:
      'The false-positive excess persists well above the five-centimetre evaluation threshold, so a threshold-only correction is rejected.',
  },
  revisionGate: {
    state: 'frozen_no_revision_authorized',
    solverRevisionAllowed: false,
    carlisleRevisionRunAllowed: false,
    validationClaimAllowed: false,
    hypotheses: [
      {
        id: 'channel_conveyance_representation',
        status: 'unconfirmed_evidence_blocked',
        statement: 'Event-valid channel geometry, sections, roughness and coupling are missing.',
      },
      {
        id: 'boundary_and_initial_state',
        status: 'unconfirmed_evidence_blocked',
        statement: 'The historical downstream control and initial hydraulic state are unresolved.',
      },
      {
        id: 'defence_and_control_state',
        status: 'unconfirmed_evidence_blocked',
        statement: 'December 2015 defence crests, condition and floodgate state are missing.',
      },
      {
        id: 'source_term_placement',
        status: 'unconfirmed_evidence_blocked',
        statement: 'The upstream boundary mapping and non-overlap of source terms are unresolved.',
      },
    ],
    newHoldoutRequiredForValidationClaim: true,
  },
  claims: {
    permitted: [
      'retained_negative_baseline',
      'failure_diagnosis',
      'transparent_non_blind_comparison',
    ],
    forbidden: [
      'validated_flood_model',
      'calibration_from_opened_carlisle_references',
      'blind_validation_claim_from_reused_references',
    ],
  },
} as const satisfies CumbriaBenchmarkSnapshot;
