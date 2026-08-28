# GeoLens

**GeoLens is an experimental spatial evidence engine. It combines real environmental observations, terrain and infrastructure to derive physical results that remain traceable to their sources.**

GeoLens is being rebuilt around a simple rule:

> A result is useful only when we can explain where it came from, how it was transformed and what is still unknown.

The first application is water moving from rainfall, across the surface and, where authoritative relationships are available, into a stormwater network.

## GeoLens in one minute

Rainfall, terrain, land cover and drainage infrastructure are usually published by different organisations, at different resolutions and in different formats. A map can make these layers look connected even when the underlying relationships have not been demonstrated.

GeoLens tries to build that connection explicitly:

1. acquire real rainfall, terrain and land-cover evidence for a bounded place and time;
2. retain the provider, dataset version, timestamps and original resolution;
3. derive an inspectable runoff quantity;
4. aggregate it over a defined surface or catchment;
5. connect it to observed infrastructure only when a source-backed attachment exists;
6. propagate it through known network directions without inventing missing links;
7. return the result together with its provenance, assumptions and missing-data state.

If an input is unavailable, GeoLens reports it as unavailable. It does not silently turn missing rainfall, elevation or land cover into zero.

GeoLens is not currently a flood forecast, a hydraulic sewer simulator or a generic risk-score dashboard.

## What we are trying to prove

The refoundation has one central question:

> Can real environmental evidence be transformed into an inspectable physical state without hiding uncertainty or inventing data?

For stormwater, the target chain is:

~~~text
real rainfall + real terrain + real land cover
                       |
                       v
             spatial evidence bundle
                       |
                       v
             inspectable runoff model
                       |
                       v
       contributing surface or catchment
                       |
                       v
          observed stormwater topology
                       |
                       v
          known downstream network state
                       |
                       v
        result + provenance + missing state
~~~

H3 is used to connect evidence spatially. It is an indexing and representation choice, not a claim that the original datasets have H3-native precision. The source resolution of IMERG, GLO-30, CLC, AHN and BGT remains visible.

## Where the project is today

GeoLens has two complementary proofs and one historical benchmark in progress.

| Case | Plain-language outcome | What is proven | What remains unresolved |
| --- | --- | --- | --- |
| Trento Proof 0 | The complete software chain works from real environmental inputs to a downstream result | Evidence composition, deterministic runoff, catchment aggregation, network propagation, provenance and mass balance | The small drainage network is a deterministic fixture, not surveyed municipal infrastructure |
| Amsterdam observed proof | GeoLens can read real Waternet pipes and nodes and derive a real, non-zero surface runoff source | Observed topology, elevation-based direction states, real rainfall/terrain/land cover and an inspectable surface contribution | No owner-published surface-to-pipe attachment has yet been found, so sewer propagation is deliberately blocked |
| Emilia-Romagna 2023 | A simple terrain-only concentration hypothesis was tested against an independent observed flood extent and did not perform better than chance | A reproducible historical benchmark, withheld evaluation data and honest negative evidence | A conditioned replay requires discharge, boundary, breach and terrain/channel evidence that is not currently available |

This distinction matters. GeoLens does not describe a software pipeline as scientifically validated merely because it runs.

## Results so far

### Case 00 — Trento Proof 0

The verified live window observed 9.24 mm of rainfall. The model derived 2.957 m³ of runoff contribution and delivered the same volume to the fixture outfall with zero mass-balance difference.

In simple terms: the complete transformation chain is operational and numerically inspectable.

The environmental evidence is real. The network geometry is a small deterministic test fixture, so this result does not claim to represent the real Trento drainage system.

### Case 01 — Amsterdam urban drainage proof

GeoLens currently exposes:

- 47 observed Waternet nodes;
- 47 active stormwater pipes;
- 4 explicitly typed rainwater outfalls;
- 26 known and 21 ambiguous pipe directions;
- one known upstream path containing 5 nodes and 4 pipes;
- 696 H3 r13 surface cells classified from BGT and conditioned with AHN4 terrain;
- 100 contributing cells representing 3,676.73 m²;
- 3.835 mm of real IMERG rainfall for the selected window;
- 11.4145 m³ of derived surface runoff.

The 11.4145 m³ value is a traceable environmental source term. GeoLens does not present it as observed sewer inflow because the authoritative relationship between the contributing surface and an exact Waternet asset is missing.

The API therefore keeps propagation blocked. The experimental BGT/AHN outlet remains labelled as conditioned and not observed.

### Case 02 — Emilia-Romagna 2023 historical benchmark

The Forlì benchmark reconstructs the 16–18 May 2023 event using inputs that are kept separate from the official post-event flood extent.

The model uses:

- all 96 expected IMERG Final Run V07 half-hour granules;
- a bounded native rainfall grid with a mean 48-hour accumulation of 93.982 mm;
- real GLO-30 elevation and slope;
- real CLC land-cover classes;
- official DBTR geometry for water, wet areas, riverbeds, embankments and buildings;
- a frozen 30 m evaluation grid containing 130,307 eligible cells.

The first runoff-and-routing baseline derived 6,176,691.50 m³ over 129,841 source cells and conserved that volume to floating-point precision.

Only after the prediction protocol was frozen did GeoLens compare the result with the independent regional flood extent. The terrain-only concentration score returned:

- ROC AUC: 0.491624;
- average precision: 0.277679;
- observed flooded-cell prevalence: 0.286815.

That is near-random discrimination. The result is retained as useful negative evidence: raw GLO-30 D8 concentration without depression conditioning, river stage, discharge, breach behaviour, embankment hydraulics or downstream boundary conditions does not reconstruct the observed flood footprint.

GeoLens makes no inundation-depth, probability or operational-forecast claim from this result.

## For Amsterdam data owners and collaborators

GeoLens already uses public Waternet infrastructure, AHN4 terrain, BGT physical surfaces, PDOK/GWSW context, NASA IMERG rainfall, CORINE Land Cover and Copernicus GLO-30.

The specific missing relationship is not another rainfall or terrain layer. It is authoritative attachment evidence connecting a contributing surface to an observed stormwater destination.

Useful material could include:

- an Amsterdam owner-published BGT Inlooptabel;
- a hydraulic-model surface-to-inlet or surface-to-outfall relation;
- an exact crosswalk between BGT surface identifiers and Waternet assets;
- documentation of the relevant relationship semantics and identifiers;
- guidance to the municipal or Waternet team responsible for these data.

GeoLens will not infer an observed sewer attachment from proximity, polygon containment or a conditioned terrain outlet. Those may remain experimental proxies, but they cannot be represented as authoritative infrastructure evidence.

## The non-negotiable rules

### Missing is not zero

Zero is valid only when it is observed or legitimately derived. Provider failure, missing coverage and incomplete time windows remain explicit states.

### Real evidence comes before interpretation

Important values retain their provider, dataset, version, observation time, acquisition time, source resolution, transformation and quality state.

### Synthetic data cannot masquerade as real evidence

Fixtures are allowed for deterministic tests and explicit demos. They are structurally labelled as synthetic and cannot enter the real-data runtime as observations.

### Physical quantities come before generic scores

GeoLens prefers rainfall in millimetres, elevation in metres, slope in degrees, runoff depth, runoff volume and downstream accumulation. A normalised score is used only when its meaning is explicit.

### Uncertainty can stop the chain

Unknown pipe direction, missing attachment evidence or incomplete provider coverage can block propagation. A blocked result is more useful than a plausible-looking result built on invented assumptions.

## What GeoLens is

GeoLens is:

- a spatial evidence engine;
- a common evidence and missing-data contract;
- a set of real environmental-data providers;
- an inspectable deterministic runoff derivation;
- typed catchment and stormwater-network models;
- a bounded API and visual evidence inspector;
- a foundation for later environmental and infrastructure applications.

## What GeoLens is not

GeoLens does not currently claim to provide:

- flood probability or flood depth;
- pipe capacity, surcharge or sewer overflow probability;
- a calibrated hydraulic simulation;
- groundwater recharge;
- damage or financial-loss estimates;
- a generic 0–1 risk score;
- continent-scale real-time operation;
- AI-generated assessment, recommendations or confidence.

AI, Gemini, RAG, mineral prospectivity and the previous generic multi-hazard framing are outside the active runtime.

---

# Technical guide

The remainder of this document is for developers, data providers and reviewers who want to reproduce or inspect the implementation.

## Evidence contract

Every important evidence value retains:

- provider and dataset;
- dataset version when available;
- observation time or requested window;
- acquisition time;
- coordinate or H3 representation;
- original spatial resolution;
- sampling and transformation method;
- transformation version;
- quality status and missing reason;
- provider-specific source metadata.

Canonical evidence states are:

~~~text
available
missing
stale
out_of_coverage
auth_required
rate_limited
upstream_error
invalid_response
incomplete_window
synthetic_fixture
~~~

Observed zero is valid evidence. Missing is not zero.

## Active architecture

~~~text
apps/
  api/                 Fastify spatial-evidence API
  web/                 Next.js institutional site and evidence inspector

packages/
  evidence/            canonical Evidence<T> model and invariants
  providers/           IMERG, GLO-30, CLC, AHN and BGT providers
  stormwater/          runoff, catchments, topology and Waternet/GWSW models
  proof-zero/          end-to-end environmental composition

nasa-precip-engine/    canonical Python earthaccess + xarray IMERG service
copernicus-engine/     local acquisition tooling outside the active npm runtime
~~~

Active npm workspaces:

~~~text
apps/api
apps/web
packages/evidence
packages/providers
packages/stormwater
packages/proof-zero
~~~

The Python IMERG service is the only production precipitation path. GeoLens does not maintain a second TypeScript precipitation implementation with a synthetic zero fallback.

## Quick start

### Requirements

- Node.js 20 or newer;
- npm 10 or newer;
- Python 3.11 or newer;
- NASA Earthdata credentials for live IMERG;
- an official local CLC 2018 V2020_20u1 100 m GeoTIFF for live land-cover evidence.

Copernicus GLO-30, PDOK AHN4, PDOK BGT, Waternet public infrastructure and public PDOK/GWSW context do not require credentials.

### Install

~~~bash
npm install

cd nasa-precip-engine
python -m pip install -r requirements.txt
cd ..
~~~

Create local configuration files:

~~~powershell
Copy-Item nasa-precip-engine/.env.example nasa-precip-engine/.env
Copy-Item apps/api/.env.example apps/api/.env
~~~

Never commit environment files, credentials, service-key JSON or PEM files.

### Configure NASA IMERG

Set nasa-precip-engine/.env:

~~~text
EARTHDATA_USERNAME=...
EARTHDATA_PASSWORD=...
API_HOST=127.0.0.1
API_PORT=8001
LOG_LEVEL=INFO

IMERG_CACHE_DIR=D:/GeoLens/cache/imerg
IMERG_DISK_CACHE_TTL_SECONDS=2592000
GEOLENS_PYTHON=D:/GeoLens/venvs/nasa-precip/Scripts/python.exe
GEOLENS_TEMP_DIR=D:/GeoLens/tmp
~~~

IMERG source resolution is approximately 0.1 degree. H3 does not change that precision. Acquisition is bounded to the requested H3 scope plus one source-cell sampling margin. Cache identities include the area of interest so two places cannot share an accumulation.

Only complete, available windows may be persisted in the optional disk cache. An unavailable or incomplete cached result never becomes an observation or a zero.

The default service binds to the local machine. Use API_HOST=0.0.0.0 only when network access is intentional and protected.

### Configure CORINE Land Cover

Keep the official European raster outside the repository. A suitable Windows layout is:

~~~text
D:/GeoLens/data/clc/
  u2018_clc2018_v2020_20u1_raster100m/
    DATA/
      U2018_CLC2018_V2020_20u1.tif
~~~

Set apps/api/.env:

~~~text
PORT=3003
NASA_PRECIP_SERVICE_URL=http://127.0.0.1:8001
CLC_RASTER_PATH=D:/GeoLens/data/clc/u2018_clc2018_v2020_20u1_raster100m/DATA/U2018_CLC2018_V2020_20u1.tif
~~~

If the raster is absent, unreadable or outside coverage, CLC remains explicitly unavailable.

### Run

Start IMERG, the API and the web application together:

~~~bash
npm run dev
~~~

Default local endpoints:

- institutional site: http://localhost:3000
- Proof 0 inspector: http://localhost:3000/proof-zero
- GeoLens API: http://localhost:3003
- API health: http://localhost:3003/health
- IMERG service: http://localhost:8001
- Amsterdam observed proof: http://localhost:3003/api/infrastructure/amsterdam-waternet
- Emilia-Romagna benchmark: http://localhost:3003/api/benchmarks/emilia-romagna-2023
- Emilia-Romagna map manifest: http://localhost:3003/api/benchmarks/emilia-romagna-2023/map-manifest

The root launcher starts services in dependency order and waits for their health gates. The first uncached IMERG acquisition can take several minutes.

## APIs

### Observed Amsterdam infrastructure

GET /api/infrastructure/amsterdam-waternet acquires a small bounded response from the official [Amsterdam Waternet infrastructure API](https://api.data.amsterdam.nl/v1/docs/datasets/leidingeninfrastructuur.html).

Default bounding box:

~~~text
latitude  52.3375 – 52.3395
longitude 4.8978 – 4.8995
~~~

The response keeps these layers separate:

- observed Waternet topology and source receipts;
- pipe-invert direction and outfall connectivity;
- PDOK/GWSW management-area context;
- raw AHN4 terrain evidence;
- BGT physical-surface classification;
- the experimental conditioned BGT/AHN surface proxy;
- real IMERG, CLC and GLO-30 evidence;
- derived runoff and catchment contribution;
- the authoritative BGT Inlooptabel attachment boundary;
- the reason network propagation was or was not attempted.

The GWSW polygon containing the selected outfall is context only. Point containment does not prove that a surface drains to an outfall.

### Emilia-Romagna historical benchmark

GET /api/benchmarks/emilia-romagna-2023 returns a compact, versioned projection of the verified external checkpoint. It does not load or redistribute the 746 MB source archive.

The response exposes:

- the manifest version, artifact count and integrity method;
- event window, bounded area, metric grid and H3 representation choice;
- provider, dataset version, native resolution, role and state for each major source;
- complete IMERG granule coverage and deterministic runoff quantities;
- mass balance, model version and the incomplete DBTR window;
- the post-freeze blind evaluation and retained near-random negative result;
- the independent ARPAE station comparison;
- every conditioned-replay evidence gate, including missing and metadata-only states;
- permitted and forbidden scientific claims.

The institutional Case 02 page reads this endpoint through its evidence inspector. API unavailability is shown as an error; it cannot silently become a valid-looking benchmark result.

The companion GET /api/benchmarks/emilia-romagna-2023/map-manifest serves a deterministic publication-safe spatial projection. Five inspectable layers are aggregated from the pinned 30 m grid onto a nominal 300 m display grid: terrain-only D8 contributing area, mean GLO-30 elevation, dominant CORINE land-cover group, known DBTR permanent-water presence and event runoff concentration. Every layer retains native resolution, aggregation, evidence state, transformation version and attribution.

The event-runoff projection became renderable only after the official NASA Earthdata and GPM policies confirmed free use with source acknowledgement; it cites GPM_3IMERGHH V07 by DOI and does not redistribute source granules. The endpoint remains fail-closed for the observed V7 flood extent and ARPAE station geometry, which are registered but carry no map data while redistribution is restricted or still under review. The browser therefore cannot turn an unavailable layer into a visual zero, and neither concentration layer can be mistaken for inundation extent.

The checked-in display payload is reproducible from verified external artifacts:

```bash
npm run materialize:emilia-map -- --data-root C:\Users\dacan\GeoLens\data\emilia-romagna-2023
npm run verify:emilia-map -- --data-root C:\Users\dacan\GeoLens\data\emilia-romagna-2023
```

### Generic Proof 0

POST /api/proof-zero/run accepts a bounded typed GeoJSON network and an explicit reference time. A complete example is available in apps/web/app/lib/fixture.ts.

Supported entities:

- Point node with type inlet, manhole or outfall;
- LineString pipe with type pipe;
- Polygon catchment with type catchment and an explicit outlet_node_id.

Proof 0 guardrails:

| Limit | Value |
| --- | ---: |
| Geographic span | 0.25° × 0.25° |
| GeoJSON features | 500 |
| Coordinates | 10,000 |
| Nodes | 100 |
| Pipes | 200 |
| Catchments | 50 |
| Catchment H3 cells | 500 |
| Request body | 1 MiB |

These are bounded research-system limits, not continent-scale performance claims.

## Technical benchmark notes

### Amsterdam direction and attachment semantics

Waternet endpoint invert levels are retained without rounding. The orientation model uses an inclusive 0.05 m resolvable-drop boundary and a separately visible 0.000001 m numeric comparison tolerance.

Direction can be known, unknown or ambiguous. The numeric tolerance handles serialisation noise; it is not a claim about survey accuracy.

The authoritative attachment boundary is modelled as STOWA 2025 BGT Inlooptabel or equivalent owner-published evidence. No such bounded Amsterdam relation has yet been located in the public catalogues.

### Emilia-Romagna reproducibility boundary

Case 02 is a retrospective reconstruction, not an as-known-at-the-time forecast. IMERG V07 was released after the event and is therefore labelled as retrospective model input.

The official regional flood extent is evaluation-only. It remained unread until protocol commit 110a217 froze the prediction, score and metrics. It cannot enter model input or calibration.

The common evaluation grid is EPSG:32632 at 30 m, 335 × 420 cells, over bounds [737790, 4895070, 747840, 4907670]. A cell-centre mask retains 130,307 eligible cells.

Important data-quality boundaries remain explicit:

- missing CLC classes use -1 and never class 0;
- NaN marks values outside the analysis area or unavailable numeric evidence;
- 119 DBTR features added after 16 May 2023 are excluded and counted;
- the current DBTR extract cannot reconstruct deleted or overwritten historical geometry;
- the regional PST terrain audit contains 560,965 missing values out of 5,069,731 pixels;
- no PST gap is silently filled from GLO-30;
- published charts are not digitised into unavailable numerical hydrographs;
- missing discharge, breach and boundary evidence keeps a conditioned replay blocked.

External benchmark inputs remain outside Git. While the D volume is unavailable, the verified working copy is under C:/Users/dacan/GeoLens/data/emilia-romagna-2023; the manifest uses portable relative paths so it can move back to D without changing dataset identity.

Manifest v1.16.0 pins 55 benchmark artifacts totaling 746,444,721 bytes and records the completed NASA/GPM use-policy review. This includes the canonical IMERG cache and portable source grid, DBTR source and metadata, derived masks, terrain routing, runoff arrays, evaluation receipts and audited official reports. Restricted observed geometry and source archives are not redistributed through Git.

For the complete audit trail, phase state and source-by-source limitations, read [REFOUNDATION_PLAN.md](REFOUNDATION_PLAN.md) and the [Emilia-Romagna manifest](tests/ground-truth/emilia-romagna-2023/manifest.json).

The paths below point to the temporary verified copy on C. Change the four variables when the data move to another volume; the manifest identity and verification rules do not change.

~~~powershell
$benchmarkRoot = 'C:\Users\dacan\GeoLens\data\emilia-romagna-2023'
$clcRaster = 'C:\Users\dacan\GeoLens\data\clc\clc2018-forli-feature-service\U2018_CLC2018_V2020_20u1_Forli_feature_service_100m.tif'
$dbtrSource = 'C:\Users\dacan\GeoLens\downloads\dbtr-source\estraz_procons.gpkg'
$imergCacheRoot = 'C:\Users\dacan\GeoLens\cache\imerg'

npm run materialize:emilia-inputs -- $benchmarkRoot $clcRaster
npm run materialize:emilia-xdbtr -- --data-root $benchmarkRoot --source $dbtrSource
npm run materialize:emilia-imerg-cache -- --data-root $benchmarkRoot --metadata "$imergCacheRoot\v07_20230518T000000Z_48h_669b94d37ff0.json" --netcdf "$imergCacheRoot\v07_20230518T000000Z_48h_669b94d37ff0.nc"
npm run verify:emilia-inputs -- $benchmarkRoot
npm run materialize:emilia-terrain-routing -- $benchmarkRoot
npm run verify:emilia-terrain-routing -- $benchmarkRoot
npm run materialize:emilia-event-runoff -- $benchmarkRoot
npm run verify:emilia-event-runoff -- $benchmarkRoot
npm run evaluate:emilia-concentration -- --data-root $benchmarkRoot
npm run verify:ground-truth -- $benchmarkRoot
~~~

## Verification

Run deterministic verification:

~~~bash
npm run typecheck
npm test
npm run build
~~~

Live providers are opt-in and separate from deterministic fixtures:

~~~powershell
$env:GEOLENS_RUN_LIVE_PROVIDER_TESTS = '1'
$env:CLC_RASTER_PATH = 'D:/GeoLens/data/clc/u2018_clc2018_v2020_20u1_raster100m/DATA/U2018_CLC2018_V2020_20u1.tif'
$env:GEOLENS_IMERG_REFERENCE_TIME = '2026-08-20T00:00:00Z'
npm run test:live
~~~

Waternet, BGT and GWSW live checks:

~~~powershell
$env:GEOLENS_LIVE_WATERNET = '1'
$env:GEO_LENS_LIVE_BGT = '1'
npm run build --workspace=@geo-lens/providers
npm run build --workspace=@geo-lens/stormwater
node --test packages/providers/test/live-bgt.test.cjs
node --test packages/stormwater/test/live-amsterdam-wfs.test.cjs packages/stormwater/test/live-amsterdam-gwsw.test.cjs
~~~

A live-provider failure may reflect credentials, network, rate limits or incomplete upstream coverage. It must never produce a valid-looking zero.

## Scientific limits

- Runoff v0 is deterministic and inspectable, but not a calibrated flood model.
- Land-cover-derived imperviousness and runoff parameters are model inputs or proxies.
- GLO-30 slope and AHN/BGT terrain conditioning have different roles and remain separate.
- H3 resolution never replaces provider resolution.
- Waternet direction uses endpoint invert evidence; insufficient evidence remains unknown or ambiguous.
- The conditioned Amsterdam outlet is a model boundary, not an observed sewer attachment.
- Propagation does not model pipe capacity, storage, travel time, surcharge or overflow.
- No percentage confidence or production-readiness claim is generated without a separate validation procedure.

## Refoundation and project history

GeoLens originally contained a broad multi-hazard product, AI analysis, mineral exploration and contradictory data paths. The refoundation deliberately reduced the active system to one physically meaningful, provenance-complete chain.

The pre-overhaul repository is preserved on branch codex/pre-overhaul-snapshot-20260822. Do not rewrite that branch.

The latest repository tag is v0.1.0-alpha.4. Current main may contain later verified refoundation work.

When repository materials disagree, use this order:

1. AGENTS.md
2. REFOUNDATION_PLAN.md
3. verified runtime behaviour
4. tests expressing intended behaviour
5. implementation
6. historical documentation

The durable execution state belongs in the plan, code, tests and commits, not in generated completion reports.
