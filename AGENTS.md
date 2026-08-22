# GeoLens Agent Operating Contract

## Mission

GeoLens is being refounded. This is not a cleanup pass, compatibility refactor, or an attempt to finish every existing feature.

GeoLens is a spatial evidence engine that composes real environmental observations, terrain, and infrastructure into traceable derived physical state.

The first proof is environmental evidence flowing through a bounded stormwater network.

## Repository baseline

Canonical baseline:

- main: 46b41e70557f18c8ec6852f6af3e796a6d1e2a8d
- historical snapshot branch: codex/pre-overhaul-snapshot-20260822
- historical snapshot commit: 9920ee29ed945a55af8e7ff89005724fab19a998

The snapshot was merged through PR #1. Never modify or rewrite it. Do not recreate excluded artifacts. Refoundation work starts from current main and belongs on codex/geolens-refoundation. Reuse an existing equivalent branch.

## Source of truth

When materials disagree:

1. AGENTS.md
2. REFOUNDATION_PLAN.md
3. verified runtime behavior
4. tests expressing intended behavior
5. implementation
6. old documentation

Legacy completion, phase, implementation, optimization, performance, and report documents are historical only. Claims such as production-ready, validated, complete, zero mock data, and real-time are not authoritative without verification.

## Existing value

Preserve knowledge from H3 and geometry utilities; Copernicus DEM and CLC; ELSUS and ESHM20; the Python earthaccess + xarray IMERG path; provenance and required-layer concepts; stormwater import, snapping, graph, catchment, elevation, orientation, runoff, and propagation experiments; and small deterministic fixtures.

Treat current implementations as migration material, not compatibility constraints.

## Non-negotiable principles

### Evidence precedes interpretation

Every important value must retain provider, dataset, version, observation/reference time, acquisition time, source resolution, sampling/transformation, transformation version, and missing-data state.

### Missing is not zero

Never translate unavailable NASA data to 0 mm, unavailable CLC to class 0, unavailable DEM to elevation 0, unavailable slope to 0 degrees, or provider failure to a valid-looking result. Zero is valid only when observed or legitimately derived.

### No silent production mocks

Synthetic providers are limited to unit tests, deterministic fixtures, and explicit demo modes. They are structurally separate from live runtime and carry synthetic_fixture status. GracefulAdapter-style fallback must not survive in production.

### One precipitation truth path

The canonical production IMERG path is the Python earthaccess + xarray service unless verified evidence requires another boundary. The TypeScript zero-grid parser must not remain active. Do not maintain two production implementations.

### No AI or mineral model in the core

Park Gemini, chat, RAG, AI assessment/recommendation/validation, LLM confidence, and mineral prospectivity. Do not repair their active contracts during Proof 0. Core must run without an LLM key.

### H3 is normalization, not source precision

H3 is connective tissue. Preserve source resolution and sampling method. Never imply a source is H3-native.

### Prefer physical quantities

Prefer rain24h_mm, rain72h_mm, elevation_m, slope_deg, land_cover_class, imperviousness_parameter, runoff_parameter, runoff_mm, catchment_contribution, node_inflow, edge_flow, and downstream_accumulation. Normalized scores require explicit semantics.

### Use domain language accurately

ELSUS is susceptibility evidence. ESHM20 PGA is hazard evidence. Hazard, susceptibility, and risk are not synonyms. Static evidence is not real-time risk.

## Legacy classification

Use:

- KEEP: preserve capability or knowledge; rewrite when needed.
- REWORK: useful intent with inconsistent or unsafe implementation.
- PARK: keep recoverable outside active runtime.
- DELETE/ARCHIVE: remove dead, duplicate, generated, misleading, or unsafe material after confirming the historical snapshot.

KEEP candidates: H3, real-provider knowledge, Python IMERG, provenance concepts, stormwater fixtures, snapping, topology, deterministic tests.

REWORK candidates: provider contracts, evidence, orchestration, caches, retries, errors, hydrology, catchments, graph orientation, propagation, API, frontend.

PARK: AI, Gemini, RAG, mineral, generic multi-hazard UI, elaborate Cesium, unused SDKs.

DELETE/ARCHIVE: dead orchestrators, duplicate adapters/routes, logs, caches, dumps, patches, silent mocks, TypeScript zero-grid IMERG, misleading reports.

Never delete unique source work before verifying it exists in the historical snapshot.

## Target architecture

Prefer a small coherent structure around apps/api, apps/web, packages/core-geo, packages/evidence, packages/providers, packages/hydrology, packages/network, packages/domain, services/nasa-precip, and tests. Do not create packages only to satisfy a diagram.

## Canonical evidence semantics

The returned evidence model must express:

- available
- missing
- stale
- out_of_coverage
- auth_required
- rate_limited
- upstream_error
- invalid_response
- incomplete_window
- synthetic_fixture

Evidence contains nullable value/unit; spatial identity and source resolution; observation/window/acquisition time; provider/dataset/version/transformation provenance; and explicit quality status with a missing reason.

Providers may differ operationally. Returned evidence semantics are common.

## Proof 0

real IMERG + real DEM + real land cover
→ H3 evidence bundle
→ inspectable runoff
→ catchment aggregation
→ validated stormwater topology
→ explicit edge direction
→ downstream propagation
→ inspectable state and provenance

Work on a small bounded area. Do not optimize Europe-wide execution first.

## Provider rules

Distinguish available, missing, stale, auth_required, rate_limited, upstream_error, invalid_response, out_of_coverage, and incomplete_window. Never collapse these into isMock or convert them to zeros.

IMERG retains product, run type, version, requested/actual windows, granule count/timestamps, acquisition time, and sampling method. Distinguish observed 0 mm, no observation, and incomplete windows. Keep Python if it remains the best boundary.

## Hydrology rules

Proof 0 is an inspectable runoff model, not a flood or hydraulic model. Expose rainfall, slope, land cover, imperviousness/runoff parameters, derived runoff, and model version. Do not claim flood probability, recharge, drainage capacity, hydraulics, or sewer overflow unless explicitly modeled.

Replace legacy field mismatches and zero substitutions with typed boundaries.

## Catchment rules

Aggregate contributing spatial evidence by a defined, testable method. Representative-point and first-coordinate sampling are not final. Use typed entities, never identifier prefixes.

## Network rules

Validate topology independently from environmental propagation. Model node/inlet/manhole/outfall/pipe, catchment attachment, direction state, and elevation evidence.

Direction is known, unknown, or ambiguous. Never invent downhill direction without elevation evidence. Fixed-iteration decay/damping is experimental and survives only with explainable semantics.

## Execution authority and blockers

Proceed autonomously through REFOUNDATION_PLAN.md. Reorganize, replace interfaces, remove dead APIs, park AI/mineral, consolidate providers, delete duplicates, rewrite tests, introduce types, simplify, remove compatibility, update dependencies, and fix errors.

Do not stop for ordinary naming, folder, package, compatibility, testing, compile-fix, AI/mineral removal, artifact, or duplicate-provider decisions.

Ask only when credentials/external actions are unavailable, destructive work risks unique unpreserved work, product directions are mutually exclusive, replacing an unavailable dataset changes scientific meaning, or required local evidence is inaccessible.

## Noise and git discipline

Use only AGENTS.md, REFOUNDATION_PLAN.md, code, tests, and commits as durable records. Do not create phase-complete, success, final-report, or similar status files. Update the plan only when state materially changes.

Commit at architectural boundaries on codex/geolens-refoundation. Never modify codex/pre-overhaul-snapshot-20260822.

## Verification and claims

Compilation alone is insufficient. Use the strongest applicable typecheck, unit, integration, provider, fixture, runtime API, real-data, and numeric checks. Separate fixture verification from live verification.

Avoid unjustified confidence percentages and production/validated claims. Prefer experimental, heuristic, derived, and proxy where accurate.

## Scope until Proof 0

Do not add authentication, accounts, billing, collaboration, AI, agents, LLM analysis, mineral exploration, elaborate 3D, mobile, continent-scale optimization, generic dashboards, or unrelated hazards.

## Definition of success

A bounded stormwater network must produce an inspectable result where IMERG, DEM, and land cover are real or explicitly unavailable; source resolution and H3 normalization are visible; runoff is deterministic; catchment contribution is inspectable; topology is validated; direction uncertainty is explicit; downstream propagation is non-trivial; values are traceable; failure cannot create valid-looking zeroes; no AI/mineral service is required; a clean API exposes the result; and tests reproduce important transformations.

Extract the smallest physically meaningful, provenance-complete system, prove it end to end, and build outward.
