# GeoLens Refoundation Plan

This plan is the durable execution record for the refoundation described in `AGENTS.md`. It tracks architectural gates, not daily progress.

## Current state

- Working branch: `codex/geolens-refoundation`
- Canonical base: `main@46b41e70557f18c8ec6852f6af3e796a6d1e2a8d`
- Protected historical snapshot: `codex/pre-overhaul-snapshot-20260822@9920ee29ed945a55af8e7ff89005724fab19a998`
- Deterministic fixture chain: established; live-provider/API Proof 0 is not established
- Live IMERG/DEM/CLC verification: not established
- Refoundation typecheck/test baseline: established; the parked legacy build remains intentionally recorded as failing
- Historical tracked Copernicus private key: removed from the active tree; revocation/rotation remains an external security action because the secret is present in Git history

Verified legacy baseline:

- shared TypeScript packages compile individually;
- the API currently has TypeScript failures around legacy adapters, construction assumptions, and inconsistent types;
- the web build currently has a Deck.gl typing failure;
- root test orchestration refers to missing workspace test scripts;
- duplicate IMERG paths, silent fallback, generic risk, AI, and mineral code remain active;
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

State: in progress

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

State: pending

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

State: pending

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

State: pending

Work:

- run the strongest available unit, integration, API, provider, real-data, and numeric checks;
- document fixture verification separately from live-provider verification;
- rewrite the primary project documentation strictly from verified runtime behavior;
- remove remaining obsolete active surfaces after confirming unique source exists in the snapshot.

Gate:

- all sixteen success conditions in `AGENTS.md` are evidenced by code, tests, API behavior, or an explicit unavailable provider state;
- setup and claims match verified behavior;
- Proof 0 is the only asserted completed product path.

Checkpoint: `docs: rewrite GeoLens identity from verified behavior`
