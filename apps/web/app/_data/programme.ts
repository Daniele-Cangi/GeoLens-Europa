export type ProgrammeStatusTone = 'verified' | 'evidence-gate' | 'screening';

export interface ProgrammeRecord {
  readonly code: string;
  readonly title: string;
  readonly place: string;
  readonly status: string;
  readonly statusTone: ProgrammeStatusTone;
  readonly established: string;
  readonly openGate: string;
  readonly nextDecision: string;
  readonly href?: string;
}

export const programmeRecords: readonly ProgrammeRecord[] = [
  {
    code: 'Case 00',
    title: 'Complete evidence chain',
    place: 'Trento, Italy',
    status: 'Verified bounded baseline',
    statusTone: 'verified',
    established:
      'Real rainfall, terrain and land cover remain traceable through deterministic runoff, catchment aggregation and network propagation.',
    openGate:
      'The environmental evidence is real; the stormwater geometry remains a declared synthetic fixture.',
    nextDecision:
      'Keep this result fixed as the end-to-end regression baseline.',
    href: '/cases/trento',
  },
  {
    code: 'Case 01',
    title: 'Urban drainage proof',
    place: 'Amsterdam, Netherlands',
    status: 'Authoritative evidence gate',
    statusTone: 'evidence-gate',
    established:
      'Observed public infrastructure, terrain and surface evidence produce a non-zero source term and a known path to a rainwater outfall.',
    openGate:
      'Public evidence does not yet prove the exact surface-to-sewer attachment, so propagation correctly remains blocked.',
    nextDecision:
      'Evaluate an owner-published attachment relation when it becomes available.',
    href: '/cases/amsterdam',
  },
  {
    code: 'Case 02',
    title: 'Historical flood replay',
    place: 'Forlì, Emilia-Romagna, Italy',
    status: 'Hydraulic evidence gate',
    statusTone: 'evidence-gate',
    established:
      'A frozen, independently scored baseline shows that terrain concentration alone did not recover the observed 2023 flood footprint.',
    openGate:
      'Hydraulic interpretation requires accepted high-flow boundary and event-calibration evidence that is not yet in the public input package.',
    nextDecision:
      'Retain the negative baseline and test new physics only as explicit, versioned additions.',
    href: '/cases/emilia-romagna-2023',
  },
  {
    code: 'Case 03',
    title: 'Event-specific public-data replay',
    place: 'Carlisle / Cumbria, United Kingdom',
    status: 'Event runner contract frozen',
    statusTone: 'evidence-gate',
    established:
      'A 56 km² Sheepmount–Old Sandsfield reach is fixed without observed flood geometry. Corrected 10 m, 20 m and 40 m grids, 144 IMERG half-hours and 288 Sheepmount intervals feed nine fixed scenarios. The runner now has frozen stability, mass-balance, NoData and prediction-bundle rules, and its real-data preflight passes without executing the event.',
    openGate:
      'Ten terrain grids remain explicitly unavailable. Storm Desmond has not been executed: the runner still requires authorization tied to the clean post-merge Git commit, and both observed flood references remain sealed until a complete prediction exists.',
    nextDecision:
      'Authorize the unchanged contract from the clean merged revision, execute all nine scenarios, and freeze the complete content-addressed prediction only if every physical gate passes.',
  },
] as const;

export const programmeUpdatedAt = '7 September 2026';
