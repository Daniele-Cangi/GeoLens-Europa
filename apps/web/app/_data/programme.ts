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

export interface ProgrammeWorkstream {
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly description: string;
  readonly outcome: string;
}

export interface ProgrammeObjective {
  readonly code: string;
  readonly title: string;
  readonly description: string;
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
    status: 'Owner package under review',
    statusTone: 'evidence-gate',
    established:
      'All nine frozen scenarios completed before the independent flood references were opened. The retained comparison is negative, and the Environment Agency historical-model package is now content-addressed outside Git.',
    openGate:
      'The 46.7 GB delivery is received but not yet qualified for model group, temporal lineage, licence coverage, CRS, units, datum or component completeness.',
    nextDecision:
      'Review the owner package component by component, then decide whether a minimal non-inferential adapter can support a separately versioned comparison.',
    href: '/cases/cumbria-2015',
  },
] as const;

export const programmeWorkstreams: readonly ProgrammeWorkstream[] = [
  {
    code: 'W01',
    title: 'Qualify the Environment Agency delivery',
    status: 'In progress',
    description:
      'Inspect the historical Carlisle model package without tuning GeoLens to its contents. Establish model identity, temporal lineage, software, spatial reference, units, datum, licence coverage and component completeness.',
    outcome:
      'A signed review boundary that says exactly which components may become candidates for physical assessment and which remain blocked.',
  },
  {
    code: 'W02',
    title: 'Strengthen the public product surface',
    status: 'In progress',
    description:
      'Keep the institutional website, case records and inspection interfaces aligned with verified repository state for both technical and non-technical readers.',
    outcome:
      'A public profile that distinguishes observed evidence, derived quantities, negative results and unresolved gates at first glance.',
  },
  {
    code: 'W03',
    title: 'Maintain external evidence gates',
    status: 'Monitoring',
    description:
      'Keep Amsterdam attachment evidence and Emilia-Romagna hydraulic evidence explicitly open without fabricating substitutes or pausing maintenance work.',
    outcome:
      'Owner evidence can enter through a controlled intake path without changing the scientific claim retrospectively.',
  },
  {
    code: 'W04',
    title: 'Preserve the pre-evidence baseline',
    status: 'Continuous control',
    description:
      'Retain the architecture and negative Carlisle result that existed before owner-supplied model material was inspected.',
    outcome:
      'Future comparisons remain attributable; an improved result cannot overwrite or relabel the original experiment.',
  },
] as const;

export const programmeObjectives: readonly ProgrammeObjective[] = [
  {
    code: 'O01',
    title: 'Trace every important value',
    description:
      'Keep provider, dataset, time, native resolution, transformation and missing-data state attached from observation to derived physical state.',
  },
  {
    code: 'O02',
    title: 'Test against independent reality',
    description:
      'Freeze predictions before opening evaluation evidence and publish negative results alongside successful transformations.',
  },
  {
    code: 'O03',
    title: 'Qualify owner evidence without hindsight',
    description:
      'Use the Environment Agency package only through reviewed format, CRS, unit, time and identity adapters; do not tune the architecture to win the case.',
  },
  {
    code: 'O04',
    title: 'Earn the next validation claim',
    description:
      'Require an independently declared physical hypothesis, deterministic fixture evidence and a new holdout event or area before claiming improvement.',
  },
] as const;

export const programmeUpdatedAt = '20 September 2026';
