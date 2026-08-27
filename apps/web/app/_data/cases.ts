export interface CaseMetric {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

export interface CaseEvidenceSource {
  readonly source: string;
  readonly role: string;
  readonly state: string;
}

export interface ResearchCase {
  readonly slug: string;
  readonly code: string;
  readonly place: string;
  readonly programme: string;
  readonly title: string;
  readonly status: string;
  readonly statusTone: 'complete' | 'bounded' | 'research';
  readonly period: string;
  readonly question: string;
  readonly summary: string;
  readonly metrics: readonly CaseMetric[];
  readonly evidence: readonly CaseEvidenceSource[];
  readonly resultTitle: string;
  readonly result: string;
  readonly boundaries: readonly string[];
  readonly nextSteps: readonly string[];
}

export const researchCases = {
  trento: {
    slug: 'trento',
    code: 'Case 00',
    place: 'Trento, Italy',
    programme: 'Proof 0',
    title: 'A complete environmental evidence chain',
    status: 'Complete bounded proof',
    statusTone: 'complete',
    period: 'Verified reference window · 20 August 2026',
    question:
      'Can real environmental evidence remain traceable through runoff, catchment aggregation and downstream propagation?',
    summary:
      'The foundational proof composes real NASA precipitation, Copernicus terrain and official land-cover evidence over a small deterministic stormwater fixture.',
    metrics: [
      { label: 'Observed rainfall', value: '9.24 mm', note: '24-hour IMERG window' },
      { label: 'Derived contribution', value: '2.957 m³', note: 'Inspectable runoff model v0' },
      { label: 'Outfall accumulation', value: '2.957 m³', note: 'No-loss propagation v0' },
      { label: 'Mass-balance difference', value: '0 m³', note: 'Within represented result' },
    ],
    evidence: [
      { source: 'NASA GPM IMERG', role: 'Observed 24-hour precipitation', state: 'Real evidence' },
      { source: 'Copernicus DEM GLO-30', role: 'Elevation and derived slope', state: 'Real evidence' },
      { source: 'CORINE Land Cover 2018', role: 'Land-cover classification', state: 'Real evidence' },
      { source: 'Bounded network fixture', role: 'Catchment and stormwater topology', state: 'Synthetic fixture' },
    ],
    resultTitle: 'The full transformation chain closes and remains inspectable.',
    result:
      'Proof 0 demonstrates the evidence contract, deterministic runoff derivation, typed catchment attachment, topology validation, explicit direction and downstream mass conservation. It also demonstrates that missing provider evidence blocks the chain instead of producing a valid-looking zero.',
    boundaries: [
      'The environmental inputs are real; the stormwater geometry is a deterministic test fixture.',
      'Propagation does not model capacity, storage, travel time, surcharge or overflow.',
      'The result is runoff contribution and downstream accumulation, not flood probability or flood depth.',
    ],
    nextSteps: [
      'Retain Proof 0 as the deterministic regression baseline.',
      'Use observed infrastructure cases to test where the fixture assumptions no longer hold.',
      'Expand only when evidence and topology remain equally inspectable.',
    ],
  },
  amsterdam: {
    slug: 'amsterdam',
    code: 'Case 01',
    place: 'Amsterdam, Netherlands',
    programme: 'Urban drainage proof',
    title: 'Observed infrastructure with an explicit attachment boundary',
    status: 'Observed proof · propagation blocked',
    statusTone: 'bounded',
    period: 'Bounded public-data acquisition',
    question:
      'Can GeoLens follow observed urban drainage evidence without inventing a surface-to-pipe connection that the public record does not prove?',
    summary:
      'The Amsterdam proof combines observed Waternet assets with AHN4 terrain, BGT surfaces and environmental evidence over one bounded urban area.',
    metrics: [
      { label: 'Observed nodes', value: '47', note: 'Waternet public infrastructure' },
      { label: 'Active stormwater pipes', value: '47', note: 'Bounded imported topology' },
      { label: 'Known / ambiguous direction', value: '26 / 21', note: 'From retained invert levels' },
      { label: 'Derived runoff source', value: '11.4145 m³', note: 'Not asserted as sewer inflow' },
    ],
    evidence: [
      { source: 'Amsterdam Waternet', role: 'Nodes, pipes, invert evidence and outfalls', state: 'Observed evidence' },
      { source: 'PDOK AHN4', role: 'High-resolution terrain evidence', state: 'Observed evidence' },
      { source: 'PDOK BGT', role: 'Physical surface classification', state: 'Observed evidence' },
      { source: 'IMERG + CLC + GLO-30', role: 'Rainfall, land cover and regional slope', state: 'Real evidence' },
    ],
    resultTitle: 'GeoLens derives a source term and then stops where evidence ends.',
    result:
      'The system identifies a known upstream path to a rainwater outfall and derives non-zero conditioned runoff over 100 contributing H3 cells representing 3,676.73 m². No owner-published STOWA BGT Inlooptabel or equivalent exact Waternet asset crosswalk was found, so the source term is not represented as observed sewer inflow and network propagation is not attempted.',
    boundaries: [
      'The conditioned BGT/AHN outlet is a model boundary, not an observed sewer attachment.',
      'Point containment in a public management polygon does not prove drainage to an outfall.',
      'Numeric orientation tolerance handles serialization noise; it is not provider survey accuracy.',
    ],
    nextSteps: [
      'Acquire an owner-published surface-to-network relation or equivalent exact asset crosswalk.',
      'Keep the current blocked result as the expected behavior while that evidence is absent.',
      'Only then test observed-source propagation through the known network path.',
    ],
  },
  emilia: {
    slug: 'emilia-romagna-2023',
    code: 'Case 02',
    place: 'Forlì, Emilia-Romagna, Italy',
    programme: 'Historical replay',
    title: 'A blind benchmark against an observed flood extent',
    status: 'Benchmark in progress · negative baseline retained',
    statusTone: 'research',
    period: 'Event window · 16–18 May 2023',
    question:
      'Can an input-only hydrologic reconstruction recover spatial concentration patterns that agree with an independently observed post-event flood extent?',
    summary:
      'The historical replay freezes model inputs and predictions before opening the official regional event extent used for evaluation.',
    metrics: [
      { label: 'IMERG granules', value: '96 / 96', note: 'Final Run V07 retrospective window' },
      { label: 'Evaluation grid', value: '30 m', note: '335 × 420 cells in EPSG:32632' },
      { label: 'ROC AUC', value: '0.491624', note: 'Frozen upstream-excess baseline' },
      { label: 'Average precision', value: '0.277679', note: 'Independently reproduced' },
    ],
    evidence: [
      { source: 'NASA GPM IMERG Final V07', role: '48-hour retrospective precipitation', state: 'Real retrospective evidence' },
      { source: 'Copernicus GLO-30 + CLC', role: 'Terrain, slope and land cover', state: 'Real evidence' },
      { source: 'Emilia-Romagna DBTR', role: 'Water, riverbed, embankment and building geometry', state: 'Official incomplete-window evidence' },
      { source: 'Regional flood extent V7', role: 'Independent evaluation label', state: 'Evaluation only' },
    ],
    resultTitle: 'The first physical hypothesis did not reconstruct the observed footprint.',
    result:
      'Raw GLO-30 D8 concentration without depression conditioning, river stage, discharge, breach, embankment or downstream boundary conditions ranks the observed flood extent no better than chance. GeoLens retains this as versioned negative evidence rather than relabelling it as a validated inundation model.',
    boundaries: [
      'The official observed extent remained outside model input and calibration until the prediction protocol was frozen.',
      'The result is hydrologic routing concentration, not inundation extent, water depth or an operational forecast.',
      'Public numerical high-flow boundary conditions and accepted event-calibration deliverables remain incomplete.',
    ],
    nextSteps: [
      'Resume external-artifact verification when the dedicated data volume is available.',
      'Require a high-flow-calibrated and independently validated hydraulic boundary before hydraulic interpretation.',
      'Assess depression conditioning, river stage, breaches and embankments as explicit model additions—not hidden calibration.',
    ],
  },
} as const satisfies Record<string, ResearchCase>;

export const researchCaseList = [
  researchCases.trento,
  researchCases.amsterdam,
  researchCases.emilia,
] as const;
