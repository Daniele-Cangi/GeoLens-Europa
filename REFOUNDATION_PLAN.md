# GeoLens Refoundation Plan

This file is a compact status and decision record. Detailed implementation history belongs in Git commits and pull requests; public technical explanations and reproducible commands remain in `README.md`. Update this plan when a gate or project direction materially changes, not after every implementation step.

## Mission

GeoLens is an experimental spatial evidence engine. It composes environmental observations, terrain and infrastructure into traceable derived physical state. Results must expose sources, transformations, assumptions and missing evidence.

The first completed proof is a bounded stormwater chain. Flood-extent estimation is an exploratory research question; no future product, model family or operational forecast is selected by this plan.

## Protected references

- Refoundation branch: `codex/geolens-refoundation`.
- Historical source snapshot: `codex/pre-overhaul-snapshot-20260822` at `9920ee29ed945a55af8e7ff89005724fab19a998`. Never rewrite this branch.
- Pre-external-evidence baseline: annotated tag `pre-external-evidence-baseline-v1` at `938b18fb66925e36236ea04a49eefdb2ca9826cb`. Never move, delete or recreate this tag.
- The baseline remains the reference for the physical proofs. Later experiments retain their own model/data identities and cannot replace a negative result.

## Established results

| Case | Established | Limit |
| --- | --- | --- |
| Trento Proof 0 | Real IMERG, DEM and land-cover evidence flows through deterministic runoff, catchment aggregation and a bounded network to an outfall; mass balance closes. | Network is a fixture, not surveyed municipal infrastructure. |
| Amsterdam / Waternet | Live observed topology: 47 nodes and 47 pipes; 26 known and 21 ambiguous directions; real environmental evidence yields a traceable 11.4145 m³ surface contribution. | No authoritative surface-to-pipe attachment has been received; observed sewer propagation remains blocked. |
| Emilia-Romagna 2023 | Reproducible retrospective Forlì benchmark and independent flood-extent comparison. Terrain-only concentration was near random (ROC AUC 0.4916; average precision 0.2777). | It is retained as a negative baseline. Missing event-valid hydraulic evidence blocks a conditioned replay. |
| Cumbria 2015 | Nine frozen scenarios, restart-safe execution and one blind comparison against three separate references. | Negative result with strong overprediction; IoU 0.0547 against the EA outline. No Carlisle retuning or validation claim from the opened references. |

See `README.md` for detailed methods, inputs, metrics, API routes and local commands.

## Open evidence gates

- **Amsterdam:** owner-published BGT surface-to-network attachment evidence is still missing. The API intake reports missing; proximity and conditioned outlets cannot establish an observed link.
- **Emilia-Romagna:** the ARPAE hydraulic evidence package is missing. Discharge, boundary, breach and channel/terrain components must be reviewed before any conditioned replay.
- **Cumbria:** the Environment Agency archive was received and integrity-checked outside Git. Its ten component records remain incomplete or metadata-only pending temporal, spatial, unit, datum, licence and model-group review. Receipt does not authorize replay or physics changes.
- **Learned-inference exploration:** qualify whether event observations and event-time inputs support a defensible flood-extent estimation experiment. This is exploratory, not a product commitment; target details, dataset, architecture and any probability claim remain undecided.

## Learned-inference exploration status

- GEOID-Flood is a candidate dataset, not yet accepted for training or evaluation. Its catalogue and one DEM/label format sample are stored outside Git at `E:/GeoLens/learned-inference/geoid-flood`.
- Catalogue revision: `6e513dea74ec4c2c970f40ef1a424583ac6c7251`. `tile_catalog.parquet` SHA-256: `c6ec7e3a3c252977069e9fa1613f07a0c01f7a121a0f55e9868f0645aad38022`.
- Audit found 52 activation IDs represented in more than one published split. Any GeoLens evaluation must group by whole activation and independently check time and geography to prevent leakage.
- No training shards, model weights or training runs have been started. Candidate ideas such as LSTM/ConvLSTM, spatial models and pretrained models remain under analysis.
- Colab is the planned disposable compute option only after the data/target gate passes. A later run must fetch selected pinned inputs, save restartable checkpoints, record resource and provenance receipts, and verify returned artifacts on E. No full 584 GB mirror is planned.

## Research gate before model selection

1. Define an observed target that the selected labels actually support; do not infer depth or event timing from extent-only masks.
2. Verify label provenance, event/acquisition times, valid and unmapped areas, licence, and source availability at the intended prediction time.
3. Freeze event-level development and holdout groups before fitting or selecting models. Do not use post-event imagery or evaluation masks as predictors.
4. Compare the retained relevant baseline, source-only inputs, and the same estimator with GeoLens-derived features. Keep the event groups and model-selection budget equal.
5. Evaluate discrimination and probability calibration separately. A model score is not a probability until reliability is demonstrated on held-out events.
6. Only after this gate, decide whether a small pilot, pretrained model adaptation, LSTM/ConvLSTM or another architecture merits Colab compute.

This research gate does not change Amsterdam attachment semantics, the Trento proof, or the frozen Emilia-Romagna and Cumbria results. It does not establish an operational forecast; retrospective IMERG observations cannot stand in for rainfall forecasts available at issue time.

## Milestone summary

- **Phases 0–6 — refoundation and Proof 0:** complete. Canonical evidence semantics, real provider path, deterministic runoff/network chain, API and inspection UI are established.
- **Phases 7–8 — observed topology and environmental surface contribution:** complete for the bounded Amsterdam case; limitations remain visible.
- **Phase 9 — authoritative surface-to-network attachment:** blocked pending owner evidence.
- **Phase 10 — Emilia-Romagna retrospective benchmark:** terrain-only baseline and negative evaluation complete; conditioned replay blocked by missing hydraulic evidence.
- **Phase 11 — Cumbria public-data replay:** execution and blind evaluation complete with retained negative result; received agency model package awaits component review.
- **Learned-inference exploration:** qualification only; no model or training selected.

## Governing rules

`AGENTS.md` is the operating contract. In brief: missing is never zero; every important value remains traceable; source resolution is distinct from H3 representation; experimental estimates must declare their target and uncertainty; observed relations cannot be invented; and failures or negative benchmark outcomes remain visible.
