# GeoLens Refoundation Plan

This plan is the durable execution record for the refoundation described in `AGENTS.md`. It tracks architectural gates, not daily progress.

## Current state

- Working branch: `codex/geolens-refoundation`
- Canonical base: `main@46b41e70557f18c8ec6852f6af3e796a6d1e2a8d`
- Protected historical snapshot: `codex/pre-overhaul-snapshot-20260822@9920ee29ed945a55af8e7ff89005724fab19a998`
- Deterministic core Proof 0: established through environmental bundle, runoff, catchment aggregation, point-sampled node elevation, direction, propagation, and mass balance
- Live provider verification: Copernicus DEM, the official local CLC2018 V2020_20u1 raster, a complete 48-granule IMERG Early Run V07 window and the bounded 96-granule Emilia-Romagna Final Run V07 event window are established; live execution remains opt-in
- Refoundation core, Proof 0 API, and minimal inspection UI build/typecheck/test baseline: established; historical legacy sources are excluded from the active TypeScript boundary
- First refoundation success gate: established through deterministic fixture proof and a fully real environmental-evidence chain over the bounded Trento test network, from IMERG, DEM and CLC through runoff, direction, propagation and zero-difference mass balance
- Observed-infrastructure gate: established through a live bounded Waternet/Amsterdam WFS path, a valid 47-node/47-pipe topology containing four explicit rainwater outfalls, explicit provider failures, API receipts and a browser-verified inspection panel
- Observed-direction gate: established separately from propagation; Waternet endpoint invert NAP evidence yields 26 known and 21 ambiguous directions at an inclusive 0.05 m analysis boundary with an explicit 0.000001 m numeric tolerance and no ground-elevation fallback; the selected outfall exposes a known 5-node/4-pipe upstream subgraph while four unresolved boundary pipes remain explicit
- Historical tracked Copernicus private key: removed from the active tree; revocation/rotation remains an external security action because the secret is present in Git history
- Retrospective reconstruction benchmark gate: the bounded Forli pilot now has a frozen 30 m metric grid, content-addressed IMERG/DEM/CLC evidence, physical DBTR known-presence masks, a reproducible terrain-flow baseline and a blind evaluation against V7 event 2; the near-random result rejects unconditioned D8 concentration as an inundation proxy, while the post-event DBTR extraction remains an incomplete historical window rather than a complete May 2023 snapshot

Verified starting baseline (historical):

- shared TypeScript packages compiled individually;
- the API had TypeScript failures around legacy adapters, construction assumptions, and inconsistent types;
- the web build had a Deck.gl typing failure;
- root test orchestration referred to missing workspace test scripts;
- the canonical Python IMERG path is established and silent precipitation fallback is removed; generic risk, AI, and mineral sources remain parked in the tree but are absent from the active API entrypoint, dependencies, routes, and TypeScript build;
- no verified real-evidence-to-network result exists.

## Migration classification

### Keep as knowledge

- H3 and geometry utilities
- Python `earthaccess` + `xarray` IMERG work
- Copernicus DEM and Corine Land Cover provider knowledge
- ELSUS and ESHM20 provider knowledge
- stormwater fixtures, import, snapping, and topology ideas
- deterministic tests that describe useful transformations

### Rework

- evidence and provider return semantics
- acquisition errors, time windows, provenance, caching, retries, and timeouts
- H3 evidence composition
- runoff derivation and catchment aggregation
- network entities, topology validation, direction, and propagation
- API, inspection UI, and executable verification

### Park outside active runtime

- Gemini, chat, RAG, AI assessment, recommendations, and validation
- mineral prospectivity
- generic multi-hazard product framing
- elaborate Cesium/3D capabilities not required by Proof 0
- unused legacy SDK and data-cube surfaces

### Delete or archive after preservation checks

- silent real-to-mock adapters
- TypeScript IMERG zero-grid parser and duplicate precipitation paths
- dead orchestrators, duplicate routes, generated logs/dumps/patches
- misleading legacy reports and obsolete active documentation
- tracked credentials and credential-like artifacts

## Phase 0 — Establish a safe refoundation baseline

State: completed

Work:

- establish this contract and plan on the refoundation branch;
- remove tracked credentials from the active tree and block equivalent files;
- inventory active runtime, tests, dependencies, providers, and unique legacy source;
- define a small, reliable workspace typecheck/test entry point;
- record the failing legacy baseline without treating legacy failures as Proof 0 architecture.

Gate:

- refoundation branch is pushed;
- no credential file is present in the active tree;
- repository commands can typecheck and test new refoundation modules independently of parked legacy code.

Checkpoint: `chore: establish refoundation baseline`

## Phase 1 — Introduce canonical evidence semantics

State: completed

Work:

- create the common `Evidence<T>` model and explicit status vocabulary;
- encode spatial, temporal, provenance, quality, and source-resolution metadata;
- provide invariant-preserving constructors for available, unavailable, incomplete, and synthetic fixture evidence;
- prevent available evidence with a null value and unavailable evidence with a fabricated value;
- add deterministic unit tests for zero-versus-missing and fixture separation.

Gate:

- evidence invariants are typechecked and tested;
- a true observed zero is structurally distinct from missing or incomplete evidence;
- synthetic evidence is visibly synthetic and cannot masquerade as live evidence.

Checkpoint: `refactor: introduce canonical evidence model`

## Phase 2 — Build the deterministic physical core

State: completed

Work:

- define typed stormwater nodes, pipes, catchments, attachments, and direction states;
- import the bounded fixture without identifier-prefix type inference;
- validate graph references and topology independently of environmental data;
- implement elevation-based direction only when sufficient evidence exists;
- implement an inspectable runoff model v0 using explicit rainfall, slope, and land-cover parameters;
- aggregate H3-indexed runoff contributions over catchment coverage;
- propagate contributions deterministically through known directed acyclic topology, retaining unresolved state for unknown/ambiguous edges.

Gate:

- fixture tests cover topology, missing elevation, ambiguous direction, runoff intermediates, catchment totals, and mass-conserving downstream accumulation;
- no fixed arbitrary iteration/decay loop is used as physical truth;
- no missing environmental value becomes zero.

Checkpoints:

- `feat: implement runoff model v0`
- `refactor: rebuild stormwater network model`
- `feat: aggregate runoff by catchment`

## Phase 3 — Consolidate real environmental providers

State: completed

Progress:

- Python earthaccess/xarray is the sole production IMERG acquisition path;
- canonical TypeScript clients now return Evidence for IMERG, Copernicus DEM elevation/slope, and CLC class codes;
- deterministic provider contracts pass and synthetic raster sources are structurally marked as fixtures;
- live Copernicus DEM sampling is verified against the public raster;
- the official European CLC2018 V2020_20u1 100 m GeoTIFF is configured and a real Trento sample is verified as available class `111`;
- official CLC palette indices `1..44` are explicitly decoded to level-3 codes `111..523` with transformation provenance;
- a fixed 24-hour IMERG window ending `2026-08-20T00:00:00Z` is verified as complete Early Run V07 evidence with 48/48 granules and `9.24 mm` at the Trento H3 sample; execution remains opt-in and dependent on Earthdata credentials/network availability.
- obsolete direct-download diagnostics referencing the removed `load_imerg_cube` path are removed from the active tree after verification against the protected historical snapshot.

Work:

- make the Python IMERG service the sole production acquisition implementation;
- return requested and actual windows, product/run/version, granules, timestamps, acquisition time, sampling, source resolution, and precise failure state;
- remove NaN, absent-granule, and sampling-error conversion to zero;
- replace the TypeScript precipitation implementation with a typed client for the canonical service;
- adapt Copernicus DEM and CLC retrieval to canonical evidence outputs;
- keep live providers structurally separate from deterministic fixtures;
- retire `GracefulAdapter` and the TypeScript zero-grid parser from active runtime.

Gate:

- provider contract tests cover success, observed zero, missing, auth, coverage, upstream failure, invalid response, and incomplete windows;
- opt-in live tests identify real evidence and retain source metadata;
- there is one active production IMERG path.

Checkpoints:

- `refactor: consolidate real data providers`
- `feat: verify IMERG observation path`

## Phase 4 — Compose and expose Proof 0

State: completed

Progress:

- canonical IMERG, DEM, and CLC evidence is composed into role-aware H3 catchment bundles;
- network-node elevation is sampled at physical node coordinates so multiple nodes in one H3 cell remain distinguishable;
- the deterministic bounded fixture now produces non-zero outfall accumulation with a checked no-loss mass balance;
- missing rainfall and missing node elevation terminate as explicit incomplete evidence or direction;
- a bounded `POST /api/proof-zero/run` exposes inputs, evidence, transformations, unresolved state, propagation, and mass balance;
- the active API compiles and runs without AI, mineral, generic-risk, database, or legacy route dependencies;
- API runtime tests reproduce non-zero downstream state and prove missing rainfall cannot become a valid-looking zero;
- an earlier production-path browser run retained unconfigured IMERG as `upstream_error` and CLC as `missing`, proving unavailable layers do not fabricate rainfall, land cover, runoff, or propagation values;
- the bounded Trento fixture now completes with real IMERG, Copernicus DEM and official CLC evidence: `9.24 mm` rainfall, `7.53 mm` derived runoff, `2.957 m3` catchment/outfall volume, two known DEM-supported directions and zero mass-balance difference;

Work:

- build an H3 environmental evidence bundle without claiming H3-native source precision;
- compose rainfall, elevation/slope, and land cover for a bounded fixture area;
- derive runoff, aggregate catchments, orient supported edges, and propagate downstream state;
- expose a clean API for inputs, evidence, intermediates, unresolved states, results, and provenance;
- remove AI, mineral, generic-risk, and silent-mock dependencies from the active API path.

Gate:

- an integration test reproduces a non-trivial downstream result from deterministic evidence;
- an opt-in live run uses real IMERG/DEM/CLC or reports each unavailable source explicitly;
- API runtime test proves that provider failure cannot return valid-looking zeros;
- core and API require no LLM or mineral service.

Checkpoints:

- `feat: compose H3 environmental evidence`
- `feat: complete propagation proof zero`
- `feat: expose evidence API`

## Phase 5 — Add the minimal inspection map

State: completed

Progress:

- the old Cesium/Deck.gl multi-product interface and generated Cesium distribution are removed from the active web runtime;
- the bounded inspector exposes source resolution, evidence status, H3 representation, runoff intermediates, catchment contribution, node elevation, pipe direction uncertainty, and downstream state;
- initial state contains no synthetic measurements and unavailable production evidence remains visibly distinct from observed zero;
- browser verification confirmed a non-blank page, no framework overlay or console errors, successful CORS/API execution, interactive pipe inspection, and no active AI, mineral, risk, or unrelated hazard framing.

Work:

- replace the old product framing with a bounded Proof 0 inspector;
- show source coverage/resolution, evidence status, H3 representation, catchments, nodes, pipes, direction uncertainty, contributions, and downstream accumulation;
- expose provenance and model intermediates without AI-generated interpretation;
- keep the interface small and diagnostic.

Gate:

- a browser verification loads the bounded proof;
- missing and incomplete evidence are visibly different from observed zero;
- no AI, mineral, unsupported risk, or unrelated hazard claim appears in the active flow.

Checkpoint: `feat: add minimal inspection map`

## Phase 6 — Verify live behavior and rewrite project identity

State: completed

Progress:

- the root README and canonical IMERG service README now describe only verified behavior, explicit unavailable states, setup, scope, and model limits;
- npm workspaces contain only API, web, evidence, providers, stormwater, and Proof 0; parked AI, generic-risk, data-cube, SDK, and 3D packages are absent from the active lockfile and root build;
- obsolete claims, phase reports, build logs, response dumps, and ad-hoc verification scripts were removed after confirming their presence in the protected historical snapshot;
- typecheck, deterministic TypeScript/Python tests, the canonical root build, a live public DEM request, and browser/API verification pass;
- GitHub Actions enforces TypeScript typecheck/tests/build and Python compile/tests on pull requests and `main`; credentialed live-provider verification remains explicitly opt-in;
- the sixteen first-cycle success conditions are evidenced by code/tests/runtime or an explicit unavailable provider state;
- one root command now health-gates IMERG, API and web in dependency order, verifies the GeoLens HTML identity instead of accepting any HTTP 200, and supports an explicit alternate web port; the inspector automatically composes the verified fixed window and displays an IMERG evidence receipt;
- completed real IMERG windows can be replayed from a provenance-preserving persistent cache, while missing, failed, incomplete, corrupt and expired entries remain explicit cache misses.

Work:

- run the strongest available unit, integration, API, provider, real-data, and numeric checks;
- document fixture verification separately from live-provider verification;
- rewrite the primary project documentation strictly from verified runtime behavior;
- remove remaining obsolete active surfaces after confirming unique source exists in the snapshot.

Gate:

- all sixteen success conditions in `AGENTS.md` are evidenced by code, tests, API behavior, or an explicit unavailable provider state;
- setup and claims match verified behavior;
- Proof 0 is the only asserted completed product path.

Checkpoints:

- `docs: rewrite GeoLens identity from verified behavior`
- `fix: verify local inspector identity`

## Phase 7 — Replace fixture-only topology with observed infrastructure

State: completed

Progress:

- the official Waternet/Amsterdam `Leidingeninfrastructuur` WFS is selected as the first public stormwater asset source under Creative Commons Attribution;
- an outfall-anchored bounded recorded response retains 82 node records and 112 pipe records for deterministic source-schema verification;
- strict active stormwater filtering and 0.25 m geometry endpoint snapping produce a valid topology of 47 observed nodes and 47 observed pipes, including four explicit `Regenwateruitlaat` outfalls;
- ten pipes crossing the response boundary remain explicit diagnostics rather than receiving invented endpoints;
- self-referential source endpoint UUID fields are retained as defective source attributes and are never used as topology truth;
- node ground levels, pipe invert levels, NAP vertical datum, delivery date, source/output CRS, license, source record ids and transformations remain inspectable;
- synthetic, user-supplied, derived and observed-public-record infrastructure are structurally distinct;
- a bounded WFS client maps authentication, rate limit, upstream, malformed, truncated and empty responses to explicit unavailable states;
- `GET /api/infrastructure/amsterdam-waternet` exposes either the observed topology plus acquisition/import receipts or the exact provider failure without a topology;
- the Next.js inspector renders the observed lines/nodes and source record details separately from Proof 0 derived flow;
- a live WFS verification, deterministic importer/client/API tests, production build and browser verification pass without an error overlay or fabricated catchments.

Gate:

- a live or explicitly unavailable public infrastructure acquisition is reproducible through the API;
- replayed source records and live acquisition use the same deterministic importer;
- boundary gaps, invalid identifiers and missing attributes cannot create synthetic topology or zero-valued evidence;
- no catchment or downstream flow is claimed before its required evidence exists; direction is established independently from retained pipe invert evidence.

Checkpoints:

- `refactor: introduce traceable infrastructure import`
- `feat: expose observed stormwater topology`

## Phase 8 — Connect observed topology to contributing-area evidence

State: completed

Progress:

- the official Waternet schema exposes `bemalingsgebied` as a node string attribute, not a contributing-area polygon in `Leidingeninfrastructuur`;
- the bounded observed subgraph contains four explicit `Regenwateruitlaat` nodes and retains identifier `826` as a source reference with `geometryStatus: not_provided_by_source`; it forbids catchment attachment from that identifier alone;
- direction model `pipe-invert-direction-v0.2.0` compares the retained `bob_beginpunt` / `bob_eindpunt` NAP evidence at the snapped pipe endpoints;
- the configured 0.05 m analysis boundary is inclusive and produces 26 known, 21 ambiguous and 0 unknown directions for the 47-pipe recorded response; a separately exposed 0.000001 m comparison tolerance absorbs numeric serialization noise and is not represented as provider survey accuracy;
- model `known-direction-outfall-connectivity-v0.1.0` finds one known upstream path: the selected rainwater outfall is reached by a 5-node / 4-pipe observed subgraph, while three other outfalls remain direction-blocked and four upstream boundary pipes remain explicit;
- missing invert evidence remains an unknown direction and the observed route never falls back to node ground elevation;
- the API and inspector expose evidence basis, model versions, threshold, per-pipe state, outfall-path counts and highlighted unresolved outfall boundaries without claiming catchment contribution or propagated flow;
- the first `bounded-h3-single-flow-surface-proxy-v0.1.0` GLO-30/r11 experiment produced only its conditioned outlet cell (`1,801.61 m2`); that result is retained as negative evidence and is no longer the active Amsterdam surface source;
- the active bounded surface experiment now acquires one public PDOK AHN4 DTM WCS coverage, retains its exact request bounds and raster receipt, aggregates physically valid 0.5 m NAP source-pixel centres inside each H3 r13 cell, uses a one-ring halo, and keeps H3 representation distinct from source resolution;
- the aggregation retains observed zero, counts source pixels and source quality per H3 cell, and uses the published AHN 5 m threshold as an explicit H3 model rule: more than 60% no-data keeps the derived evidence missing rather than interpolating or substituting zero;
- live AHN verification over the fixed bbox returned 521 available and 295 missing samples across 696 target / 816 sampled H3 cells; three cells resolve to the conditioned outfall for `110.30 m2` of partial area, while the complete area remains `missing` because unresolved source cells could still contribute;
- the API and inspector expose the partial area, unavailable complete area, provider/dataset/version, source-pixel aggregation semantics, WCS 2.0.1 receipt, EPSG:28992 + NAP datum, 16 coverage exits, 81 local depressions and 596 incomplete paths;
- the official Amsterdam API catalogue exposes `bemalingsgebied` only as a node identifier and no public contributing-area polygon was found in the documented `Leidingeninfrastructuur` dataset;
- the public PDOK / Stichting RIONED GWSW `beheergebied` collection is now acquired through a bounded, receipt-bearing provider with explicit authentication, rate-limit, upstream, malformed, truncated and empty-coverage states;
- live point-in-multipolygon evaluation places the selected `Regenwateruitlaat` inside `NL.WBHCODE.11.Rioleringsgebied.932` President Kennedylaan and the broader Amsterdam West treatment unit;
- Waternet source reference `826` is not treated as a GWSW key: the national GWSW identifier `Rioleringsgebied.826` denotes Eva Besnyöstraat H6 at a different location, so identifier equality would create a false attachment;
- no public GWSW `beheerlozing`, `beheerleiding`, `beheerput`, `aansluitingpunt` or `aansluitingleiding` feature is published in the bounded area; no Waternet relation or crosswalk was found for the outfall, so model `gwsw-outfall-area-link-v0.1.0` exposes point containment as spatial context only with `attachment.eligible=false`;
- the 2025 STOWA/RIONED BGT Inlooptabel method is identified as the authoritative Dutch path for linking BGT surfaces to soil, open water or sewer destinations, but no public Amsterdam inlooptabel was found;
- the bounded PDOK BGT provider acquires eight current level-zero physical-surface collections at an explicit time, retains CC0/source CRS/storage CRS/feature-version receipts, rejects truncated mosaics, and classifies H3 centroids without implying BGT-native H3 precision;
- live BGT verification returned 258 source features and classified all 696 target H3 r13 cells: 156 vegetated terrain, 149 unvegetated terrain, 136 buildings, 147 road, 103 water, 2 supporting-road and 3 wall/quay structural-barrier cells;
- model `bounded-bgt-ahn-priority-flood-v0.1.0` keeps raw AHN evidence unchanged, derives a separate IDW land elevation only from at least three observed AHN H3 area means within four grid rings, excludes observed water and structural barriers, and applies a deterministic multi-terminal priority-flood;
- the live conditioned result has zero unresolved cells and assigns 100 cells / `3,676.73 m2` to the conditioned outfall, from 435 observed and 155 interpolated terrain values; 232 cells terminate at the analysis boundary, 258 at observed surface water, 103 water cells and 3 barrier cells are excluded, and 78 cells require depression raising;
- the conditioned outfall attachment is explicitly `observed: false`; the API and inspector expose the raw DTM, BGT class, interpolation donors, fill depth, competing terminal and model version per cell;
- model `conditioned-surface-environmental-runoff-v0.1.0` deterministically orders conditioned cells by shortest flow path then H3, caps composition at 100 cells, and reuses the canonical IMERG/DEM/CLC composer plus the existing inspectable runoff and H3-area aggregation models;
- live composition covered all 100 conditioned cells / `3,676.73 m2` with zero environmental issues: IMERG was `3.8349998 mm` on its retained 0.1 degree grid, CLC 100 m returned class `112` for 97 cells and `141` for 3, and GLO-30 slopes ranged from `0.6497` to `6.0057 deg`;
- the resulting runoff depth ranged from `3.0763` to `3.1448 mm` and aggregated to `11.4145268 m3` with status `available`;
- missing IMERG fixture verification retains `null` total volume and zero partial volume, and never attempts network propagation;
- the API and browser expose the conditioned environmental receipt separately from AHN/BGT conditioning and observed topology; browser verification rendered 696 cells and the `11.415 m3` receipt with no framework overlay or console errors;
- propagation is explicitly `attempted: false` at the selected outfall only because the surface attachment remains unobserved; incident pipe `waternet:2E5F673B-3226-4E2D-9235-565CE30AF5CB` now resolves toward that outfall from its retained raw `0.04999995 m` drop at the inclusive 0.05 m boundary, while numeric tolerance and upstream uncertainty remain visible;
- the Phase 8 gate is complete with traceable non-zero environmental source state and an explicit observed-network stopping boundary.

Work:

- continue searching for an authoritative Amsterdam BGT Inlooptabel/outfall relation without weakening the conditioned proxy's `observed: false` semantics;
- reject representative-point, first-coordinate and name-prefix shortcuts;
- keep the observed GWSW area polygon, Waternet identifier, raw AHN evidence and conditioned BGT/AHN proxy as separate evidence;
- compose real IMERG and CLC evidence over the 100-cell conditioned Amsterdam area, retain each source resolution, and derive inspectable runoff without converting unavailable evidence to zero;
- retain the selected outfall's known observed subgraph and its unresolved upstream boundary independently from any future surface attachment;
- propagate only through the validated, supported observed subgraph.

Gate:

- at least one contributing area has a traceable polygon, an explicit source-backed or transparently conditioned outlet attachment, and testable H3 coverage;
- invert-based direction agrees with retained pipe endpoint evidence and never falls back to ground elevation silently;
- a bounded observed-infrastructure result either produces traceable non-zero downstream state or stops at an explicit missing-data boundary;
- the API and inspector distinguish observed assets, derived topology links and environmental evidence.

Checkpoints:

- `refactor: orient observed pipes from invert evidence`
- `feat: anchor observed topology at rainwater outfalls`
- `refactor: expose known-direction outfall connectivity`
- `feat: derive bounded DEM surface catchment proxy`
- `feat: expose bounded DEM surface catchment proxy`
- `feat: refine Amsterdam surface evidence with AHN DTM`
- `feat: acquire bounded GWSW area context`
- `refactor: aggregate AHN terrain over H3 cells`
- `feat: acquire bounded BGT physical surfaces`
- `feat: condition Amsterdam surface catchment proxy`
- `feat: compose Amsterdam environmental runoff`
- `feat: expose conditioned runoff boundary`

## Phase 9 — Establish an authoritative surface-to-network attachment

State: in progress

Progress:

- the official Amsterdam Waternet record confirms BOB start/end semantics in metres NAP and currently publishes the selected incident pipe as `-2.54999995 m` to `-2.5999999 m`;
- the inclusive orientation boundary resolves that nominal five-centimetre drop without rounding or changing the retained source values;
- official PDOK GWSW asset collections expose no bounded sewer assets around the selected outfall, and the national `beheergebied` polygon remains context-only;
- official STOWA/RIONED guidance identifies a BGT Inlooptabel as the appropriate first-public-system destination relation; its 2025 schema retains the BGT identifier, 99–101% allocation total and optional exact sewer asset codes;
- `bgt-inflow-table-network-attachment-v0.1.0` now validates that boundary, keeps destination evidence separate from exact observed-pipe attachment, and prevents synthetic fixtures from becoming propagation-eligible;
- the API and inspector expose the authoritative attachment as explicitly `missing`, with the standard, intended authority, exact-match rule and blocker separate from the conditioned BGT/AHN proxy;
- no public Amsterdam BGT Inlooptabel or equivalent owner-published exact Waternet asset crosswalk has been located.

Work:

- acquire an Amsterdam owner-published BGT Inlooptabel, hydraulic-model surface relation, or equivalent source-backed inlet/outfall attachment;
- keep the conditioned BGT/AHN outlet proxy `observed: false` until such a relation is available;
- attach runoff to a typed observed inlet or outfall only through that authoritative relation;
- propagate the resulting source term only through the validated known-direction subgraph and retain unresolved upstream boundaries.

Gate:

- at least one bounded surface contribution has a source-backed attachment to an observed Waternet network entity;
- attachment provenance identifies publisher, dataset/version, acquisition time, relationship semantics and missing state;
- the selected non-zero runoff contribution reaches the observed rainwater outfall through known pipe directions without silently consuming unresolved boundaries;
- API, inspector and tests distinguish the authoritative attachment from the conditioned surface proxy.

Checkpoint: `feat: attach observed surface contribution to Waternet`

## Phase 10 - Establish the Emilia-Romagna 2023 retrospective reconstruction benchmark

State: in progress

Progress:

- the versioned historical-benchmark contract now distinguishes cutoff-constrained replay from retrospective reconstruction while fixing dataset role, observation-time relation, verified publication time, permitted use, access/license state, acquisition state and portable content-addressed local artifacts;
- the manifest declares a bounded Forli pilot, the 16-18 May event window, a retained end-of-window knowledge cutoff, retrospective_reconstruction mode and a hydrologic-routing claim level that explicitly forbids validated inundation, water-depth, probability and operational-forecast claims;
- post-event evaluation and comparison evidence is structurally forbidden from model input and calibration paths;
- the official regional V7 archive is verified as two EPSG:32632 multipolygon layers: 150 event-1 features and 2,022 event-2 features; event 2 is the primary evaluation reference but remains under explicit license review and must not be redistributed;
- IMERG V06 is unavailable through the canonical GES DISC/CMR path and is rejected by GeoLens policy; the canonical provider accepts only explicitly version-pinned V07, and live catalog verification found all 96 expected Final Run half-hour granules for 16-18 May 2023; V07 is disclosed as post-event reprocessing and may enter only this retrospective reconstruction, never a cutoff-constrained replay;
- the canonical acquisition now derives a bounded source request from the H3 scope, loads only the source-cell subset plus one 0.1 degree sampling margin, retains requested and loaded bounds plus grid shape, and keys memory/disk caches by dataset version, time window and AOI so evidence from different places cannot collide;
- the real Forli event accumulation is materialized outside Git at `D:/GeoLens/cache/imerg/v07_20230518T000000Z_48h_669b94d37ff0.{nc,json}`: 96/96 Final Run V07 half-hour granules, requested AOI `[11.98, 44.17, 12.10, 44.28]`, a 3x3 native 0.1 degree grid, nine finite cells, and 48-hour totals from `82.295` to `105.445 mm` with a `93.982 mm` mean; the NetCDF and provenance envelope total 22,143 bytes and pass an exact persistent-cache round trip;
- Copernicus DEM GLO-30 2022_1 is the verified pre-event terrain input; the regional DTM 1x1 WCS remains context-only until availability of that exact source by the cutoff is proven, and its redistribution remains restricted because the regional service is not OpenData;
- the Copernicus EMSN154 geospatial package and technical report are locally verified; P04 uses post-event Sentinel-1 delineation, while P06 is a two-dimensional hydraulic model calibrated with P04/EMSR664 footprints and ARPAE boundary conditions, so both remain secondary comparison evidence rather than independent ground truth;
- declared IMERG, CLC, GLO-30, XDBTR and event-2 coverage all contain the bounded pilot; manifest v1.2.0 originally froze the common EPSG:4326 bounds, which current manifest v1.9.0 retains together with a globally aligned EPSG:32632 30 m grid of 335 by 420 cells, while H3 r11 remains a separate representation choice;
- the cell-centre AOI mask retains 130,307 cells and excludes 10,393 grid-envelope cells; required-input no-data is excluded and reported per dataset, primary overlap metrics remain unbuffered, and the explicit secondary boundary tolerance is one 30 m cell;
- bounded GLO-30 elevation and four-neighbour slope are materialized for all 130,307 eligible cells with `NaN` missing sentinels: elevation spans 9.009-181.722 m and slope 0-34.376 degrees;
- bounded CLC2018 level-3 classes are materialized for all eligible cells with `-1` as the explicit missing sentinel; class `0` is never used as missing evidence;
- the official on-demand DBTR service produced a 37,765,120-byte EPSG:32632 GeoPackage for Forli with physical water, wet-area, riverbed, embankment and building polygons plus five ISO 19139 metadata records; the source and metadata are retained outside Git under content-addressed manifest entries;
- the materializer applies `DATA_AGG < 2023-05-16` before rasterization: 119 post-cutoff features are excluded and counted, while zero in the derived arrays means only "no eligible geometry identified" and never proves historical absence;
- ten deterministic 30 m artifacts retain both cell-centre known-presence and 4x4 subcell coverage: permanent water covers 466 centres, riverbed 2,369, embankment 132 and buildings 7,046; the current extraction cannot reconstruct geometry deleted or overwritten after the event, so every DBTR mask remains `incomplete_window`;
- before physical DBTR acquisition, the first deterministic AOI/DEM/CLC set contributed four bounded artifacts and the initial 13 pinned official and derived artifacts totaled 602,401,543 bytes. A repeated acquisition reproduced those hashes, while identical XDBTR WMS requests returned different styled-image bytes; the WMS images and timestamped acquisition receipt are therefore verified per run but intentionally excluded from the reproducible artifact set under `D:/GeoLens/data/emilia-romagna-2023` and pass streamed byte-count, SHA-256, binary-sentinel and numeric-range verification;
- deterministic tests cover both benchmark modes, frozen grid/mask/tolerance semantics, evaluation withholding, retrospective post-cutoff disclosure, IMERG versioning, cache provenance, portable artifact identity, temporal-cutoff checks, GeoPackage/WKB rasterization, tie-aware ROC/AP and fractional overlap, explicit NoData exclusion and structural-zero handling;
- the bounded-input verifier checks the DBTR SQLite signature, source/derived hashes, feature accounting, CRS, mask sentinels and 4x4 coverage fractions;
- the baseline land-source mask is now explicit: inside AOI + finite GLO-30 elevation - DBTR cell-centre known permanent water; because the water history is incomplete, the result remains `incomplete_window` rather than treating every zero as historical land;
- model `bounded-d8-steepest-descent-v0.1.0` establishes the first unconditioned terrain-only routing baseline: AOI-edge, known-water, local-depression and incomplete-input terminals remain distinct; no depression is filled and no off-grid elevation is invented;
- all `129,841` eligible land cells / `116,856,900 m2` close at terminals with zero area difference, while `466` known permanent-water centres contribute no land source area;
- the raw GLO-30 surface produces `120,498` flowing cells, `1,503` AOI-boundary terminals and `7,840` local depressions; the largest terminal catchment contains `546` land cells / `491,400 m2`, so fragmentation is retained as negative diagnostic evidence rather than hidden by conditioning;
- the terrain materializer never loads the withheld regional flood extent, retains `incomplete_window` quality from the historical water mask and emits four content-addressed arrays;
- the canonical cache exporter freezes the exact IMERG metadata envelope and NetCDF plus a portable 3x3 source-grid representation without creating a second NASA acquisition path; validation requires V07 Final Run, 96 unique ordered half-hour granules, exact actual/requested windows and finite non-negative precipitation while preserving a real observed zero;
- model `runoff-coefficient-proxy-v0.1.0+d8-no-loss-volume-accumulation-v0.1.0` nearest-samples the native 0.1 degree rainfall grid at each eligible 30 m cell centre, composes real GLO-30 slope and CLC through the canonical inspectable runoff model, converts depth over 900 m2 cells and propagates volume without loss or attenuation over the frozen D8 graph;
- all `129,841` eligible source cells derive `6,176,691.498415089 m3`; terminals retain `6,176,691.498415042 m3` with a `-4.7497451305389404e-8 m3` floating-point difference, and the largest terminal accumulation is `24,490.605559146057 m3` at the same largest terrain catchment terminal;
- byte-for-byte recomputation verifies the five event outputs, keeps outside-AOI and excluded local sources as `NaN`, permits known water to receive upstream volume without becoming a local source and confirms the evaluation extent was `not_loaded`;
- commit `110a217` froze the concentration score, evaluation domain, no-calibration rule, ROC AUC, average precision and tie-weighted overlap at 1%, 5%, 10% and 20% selected-area fractions before the V7 geometry was read;
- after that freeze, the official event-2 layer yielded 2,022 source features / 2,032 decoded polygons and 37,374 observed-positive cell centres over the 130,307-cell AOI; the evaluation has no prediction NoData exclusions and records all 466 known-water structural source-zero subtractions explicitly;
- routed upstream excess volume scores ROC AUC `0.49162439445221917` and average precision `0.2776793857866033` against an observed prevalence of `0.2868149830784225`; independent scikit-learn metrics agree, so the unconditioned D8 result is retained as near-random negative evidence rather than described as an inundation model;
- frozen 1%, 5%, 10% and 20% selected-area diagnostics produce tie-weighted IoU `0.0053808`, `0.0369029`, `0.0737266` and `0.1251721`; no observed threshold is fitted and boundary/water-depth metrics remain unavailable;
- the observed mask and deterministic evaluation receipt remain redistribution-restricted outside Git; manifest v1.7.0 pins their hashes together with the earlier evidence for 43 artifacts totaling 649,931,826 bytes.
- the separately frozen ARPAE observation protocol is now materialized from Dext3r request `be86675d-a290-4208-8b38-0bb420396ca0`: both selected gauges provide all 48 hourly records, with `113.8 mm` at Forli' urbana versus `104.22000122070312 mm` in the nearest native IMERG cell and `131.0 mm` at Ponte Braldo versus `88.08999633789062 mm`; no rainfall value is used for calibration;
- Dext3r hydrometric values retain station-local datum semantics: Castrocaro, Ponte Braldo and Ponte Vico provide all 192 quarter-hour observations, while Forli' has 68 values plus 124 explicit blanks and Predappio 75 values plus 117 explicit blanks; blank fields remain missing and numeric zero remains valid;
- manifest v1.9.0 pins the original Dext3r ZIP/CSV and a deterministic comparison receipt, and the materializer verifies that the archive contains exactly the declared CSV before calculating frozen rainfall and within-station hydrometric metrics.

Work:

- determine whether an authoritative as-of-May-2023 DBTR vector snapshot exists; until then, retain the current-extract masks as incomplete known presence rather than complete historical absence;
- introduce a conditioned inundation replay only after river levels, discharge, embankments, breaches and downstream boundary conditions have explicit evidence semantics;
- keep calibration and holdout partitions explicit and retain every model/transformation version.

Gate:

- the same manifest and artifact hashes reproduce the audit on another machine with separately acquired source files;
- no post-event regional or Copernicus extent can enter model input or calibration;
- the bounded hydrologic-routing result is traceable and evaluated against a withheld observed extent with declared grid, masks and tolerances;
- inundation and water-depth metrics remain unavailable until a conditioned hydraulic model exposes its physical boundary conditions;
- API and inspector identify the result as an experimental retrospective reconstruction, not an as-known-at-the-time replay or operational forecast.

Checkpoints:

- `feat: verify retrospective IMERG event window`
- `feat: materialize bounded retrospective IMERG`
- `feat: freeze retrospective evaluation grid`
- `feat: establish terrain-flow concentration baseline`
- `feat: propagate retrospective event runoff`
- `test: freeze blind concentration evaluation protocol`
- `test: evaluate frozen concentration against V7 event 2`
