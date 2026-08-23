# GeoLens

**GeoLens turns real environmental observations and stormwater infrastructure into physical results that can be inspected and traced back to their sources.**

Give GeoLens a bounded place and a reference time, and it answers a concrete chain of questions:

1. How much rain was actually observed?
2. What terrain and land cover describe the area?
3. How much runoff does the stated model derive?
4. Which surface or catchment contributes that runoff?
5. Where can the water move through the known stormwater network?
6. Which source, resolution, timestamp and transformation produced every value?

If evidence is missing, GeoLens stops or returns an explicit missing state. It does not replace missing rainfall, elevation or land cover with zero.

> GeoLens is currently an experimental spatial-evidence and runoff system. It is not a flood forecast, a hydraulic sewer simulator or a generic risk-score dashboard.

## The idea in one diagram

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
          validated stormwater topology
                       |
                       v
          known downstream network state
                       |
                       v
        result + provenance + missing state
~~~

H3 connects evidence and infrastructure spatially. H3 is an indexing and representation choice; the original resolution of IMERG, DEM, CLC, AHN and BGT remains visible.

## What works today

GeoLens has two complementary proofs.

| Proof | What is real | What is demonstrated | Current boundary |
| --- | --- | --- | --- |
| Trento Proof 0 | NASA IMERG rainfall, Copernicus GLO-30 terrain and the official local CLC 2018 raster | Complete evidence → runoff → catchment → network → downstream accumulation chain over a deterministic bounded network fixture | The environmental evidence is real; the small network geometry is a test fixture, not surveyed municipal infrastructure |
| Amsterdam observed proof | Waternet nodes and pipes, AHN4 terrain, BGT physical surfaces, IMERG rainfall, CLC land cover, GLO-30 slope and PDOK/GWSW context | Real municipal topology and a traceable non-zero conditioned runoff source over a bounded urban area | No owner-published surface-to-pipe relation was found in the current public catalogs, so network propagation is intentionally not attempted |

### Trento result

The fixed verified live window observed 9.24 mm of rainfall, derived 2.957 m³ of runoff contribution and delivered the same volume to the fixture outfall with zero mass-balance difference.

This proves the complete transformation chain and its failure semantics. It does not claim that the fixture network represents the real Trento drainage system.

### Amsterdam result

The bounded Amsterdam proof currently exposes:

- 47 observed Waternet nodes and 47 active stormwater pipes;
- 4 explicitly typed rainwater outfalls;
- 26 known and 21 ambiguous pipe directions from retained endpoint invert levels;
- an inclusive 0.05 m resolvable-drop boundary with a separately visible 0.000001 m numeric comparison tolerance;
- a known 5-node, 4-pipe upstream path to the selected rainwater outfall;
- 696 H3 r13 surface cells classified from BGT and conditioned with AHN4 terrain;
- 100 contributing cells representing 3,676.73 m²;
- 3.835 mm of real IMERG rainfall across the selected window;
- a derived runoff source of 11.4145 m³;
- an explicit missing STOWA 2025 BGT Inlooptabel or equivalent owner-published Waternet asset crosswalk.

The 11.4145 m³ result is therefore available as an inspectable environmental source term, but it is not represented as observed sewer inflow. The API shows the authoritative attachment as missing and keeps propagation blocked. The experimental BGT/AHN outlet remains clearly marked as conditioned and not observed.

## What GeoLens is

GeoLens is:

- a spatial evidence engine;
- a common evidence and missing-data contract;
- a set of real environmental-data providers;
- an inspectable deterministic runoff derivation;
- typed catchment and stormwater-network models;
- a bounded API and visual evidence inspector;
- a foundation for later environmental and infrastructure applications.

GeoLens prefers physical quantities such as rainfall in millimetres, elevation in metres, slope in degrees, runoff depth, runoff volume and downstream accumulation.

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

AI, Gemini, RAG, mineral prospectivity and the old generic multi-hazard product framing are outside the active runtime.

## Evidence is the product boundary

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

Observed zero is valid evidence. Missing is not zero. Synthetic fixtures are structurally labelled and cannot masquerade as production evidence.

## Active architecture

~~~text
apps/
  api/                 Fastify spatial-evidence API
  web/                 Next.js evidence inspector

packages/
  evidence/            canonical Evidence<T> model and invariants
  providers/           IMERG, GLO-30, CLC, AHN and BGT providers
  stormwater/          runoff, catchments, topology and Waternet/GWSW models
  proof-zero/          end-to-end environmental composition

nasa-precip-engine/    canonical Python earthaccess + xarray IMERG service
copernicus-engine/     local acquisition tooling outside the active npm runtime
~~~

Only these npm workspaces are active:

~~~text
apps/api
apps/web
packages/evidence
packages/providers
packages/stormwater
packages/proof-zero
~~~

The canonical production precipitation path is the Python IMERG service. GeoLens does not maintain a second TypeScript precipitation implementation with synthetic zero fallback.

## Quick start

### Requirements

- Node.js 20 or newer;
- npm 10 or newer;
- Python 3.11 or newer;
- NASA Earthdata credentials for live IMERG;
- an official local CLC 2018 V2020_20u1 100 m GeoTIFF for live land-cover evidence.

Copernicus GLO-30, PDOK AHN4, PDOK BGT, Waternet public infrastructure and the public PDOK/GWSW context do not require credentials.

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

IMERG source resolution is approximately 0.1 degree. H3 does not change that precision. Only complete `available` windows may be persisted in the optional disk cache. The short-lived in-memory cache can replay an explicit unavailable or incomplete result, but its evidence status remains unchanged: it never becomes an observation or a zero.

The default host exposes the unauthenticated development service only on the local machine. Set `API_HOST=0.0.0.0` only when network access is intentional and protected by an appropriate boundary.

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

Start IMERG, the API and the inspector together:

~~~bash
npm run dev
~~~

Default local endpoints:

- inspector: http://localhost:3000
- GeoLens API: http://localhost:3003
- API health: http://localhost:3003/health
- IMERG service: http://localhost:8001
- observed Amsterdam proof: http://localhost:3003/api/infrastructure/amsterdam-waternet

If port 3000 is occupied, choose another port in PowerShell:

~~~powershell
$env:GEOLENS_WEB_PORT = '3004'
npm run dev
~~~

The root launcher starts services in dependency order and waits for their health gates. On Windows, Ctrl+C stops each complete descendant process tree; on POSIX systems it sends `SIGTERM` to each launched service. The first uncached IMERG acquisition can take several minutes.

## APIs

### Observed Amsterdam infrastructure

GET /api/infrastructure/amsterdam-waternet acquires a small bounded response from the official [Amsterdam Waternet infrastructure API](https://api.data.amsterdam.nl/v1/docs/datasets/leidingeninfrastructuur.html).

Default bbox:

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
- real IMERG, CLC and GLO-30 evidence over the selected cells;
- derived runoff and catchment contribution;
- the authoritative STOWA BGT Inlooptabel attachment boundary;
- the reason network propagation was or was not attempted.

The public GWSW polygon containing the selected outfall is context only. Point containment does not prove that a surface drains to an outfall.

### Generic Proof 0

POST /api/proof-zero/run accepts a bounded typed GeoJSON network and an explicit reference time. A complete example is available in [apps/web/app/lib/fixture.ts](apps/web/app/lib/fixture.ts).

Supported entities are:

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

## Verification

Run deterministic verification:

~~~bash
npm run typecheck
npm test
npm run build
~~~

Live providers remain opt-in and separate from deterministic fixtures.

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

- Runoff v0 is deterministic and inspectable, but not calibrated flood validation.
- Land-cover-derived imperviousness and runoff parameters are model inputs or proxies.
- GLO-30 slope and AHN/BGT terrain conditioning have different roles and remain separate.
- H3 resolution never replaces provider resolution.
- Waternet direction uses endpoint invert evidence; missing or insufficient evidence remains unknown or ambiguous.
- Numeric comparison tolerance handles serialization noise and is not provider survey accuracy.
- The conditioned Amsterdam outlet is a model boundary, not an observed sewer attachment.
- Sewer propagation requires an owner-published BGT Inlooptabel, hydraulic surface relation or equivalent exact asset crosswalk.
- Propagation does not model pipe capacity, storage, travel time, surcharge or overflow.
- No percentage confidence or production-readiness claim is generated without a separate validation procedure.

## Refoundation and project history

GeoLens originally contained a broad multi-hazard product, AI analysis, mineral exploration and several contradictory data paths. The refoundation deliberately reduced the active system to one physically meaningful, provenance-complete chain.

The pre-overhaul repository is preserved on branch codex/pre-overhaul-snapshot-20260822. Do not rewrite that branch.

The latest repository tag is v0.1.0-alpha.4. Current main may contain later verified refoundation work.

When repository materials disagree, use this order:

1. [AGENTS.md](AGENTS.md)
2. [REFOUNDATION_PLAN.md](REFOUNDATION_PLAN.md)
3. verified runtime behavior
4. tests expressing intended behavior
5. implementation
6. historical documentation

The durable execution state belongs in the plan, code, tests and commits—not in generated completion reports.
