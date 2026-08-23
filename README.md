# GeoLens

> A spatial evidence engine for composing real environmental observations,
> terrain and infrastructure into traceable derived physical state.

GeoLens is being refounded around one bounded, inspectable chain: environmental
evidence flowing through a stormwater network. The current release is an
experimental Proof 0 baseline, not a finished flood-risk product.

```text
NASA GPM IMERG + Copernicus DEM + CORINE Land Cover
                         |
                         v
                spatial evidence bundle
                         |
                         v
                  runoff model v0
                         |
                         v
                catchment aggregation
                         |
                         v
                 stormwater topology
                         |
                         v
              downstream propagation
                         |
                         v
          inspectable state + full provenance
```

The completed Trento Proof 0 remains the asserted end-to-end product path. The
Amsterdam gate is visible separately: bounded public Waternet topology,
PDOK/GWSW area context, raw AHN terrain and a BGT/AHN-conditioned surface
contributing-area proxy. Its outlet is an explicit model boundary condition,
not an observed sewer-catchment attachment, so it is not propagated through the
Waternet network.

Latest published refoundation baseline: **v0.1.0-alpha.4**.

## What GeoLens is

GeoLens composes physical quantities while retaining their origin, resolution,
time window, transformation and missing-data state. H3 is used to connect
evidence and infrastructure; it does not replace or exaggerate source
resolution.

Proof 0 currently exposes quantities such as:

- `rainfall_mm`;
- `elevation_m` and `slope_deg`;
- `land_cover_class`;
- `imperviousness_parameter` and `runoff_parameter`;
- `runoff_mm` and catchment volume;
- node inflow, edge transfer and downstream accumulation.

It is not a flood-probability model, hydraulic sewer simulation, drainage
capacity model, groundwater model or damage model. It does not claim that
runoff depth is flood depth.

## Verified baseline

The following state has been verified locally through 2026-08-23.

| Layer or subsystem | Verified state |
| --- | --- |
| Evidence semantics | Observed zero is distinct from missing, incomplete, failed, stale and out-of-coverage evidence. |
| IMERG boundary | The Python `earthaccess` + `xarray` service is the sole production acquisition path. A fixed 24 h live window ending `2026-08-20T00:00:00Z` was verified as complete Early Run V07 evidence with 48/48 granules. Live execution remains opt-in and credential/network dependent. |
| Copernicus DEM | Real public GLO-30 sampling is verified for the cross-European Proof 0 evidence path, including traceable elevation and finite-difference slope evidence. |
| AHN terrain | The bounded Amsterdam surface experiment uses the public [PDOK AHN4 DTM WCS](https://service.pdok.nl/rws/ahn/wcs/v1_0?SERVICE=WCS&REQUEST=GetCapabilities) at 0.5 m source resolution and NAP datum. Each H3 r13 value is the mean of valid 0.5 m source-pixel centres inside the cell; using the published [AHN 5 m product threshold](https://www.ahn.nl/5-producten) as an explicit H3 aggregation rule, more than 60% source no-data keeps the raw H3 value missing. The latest live bbox returned 521 available and 295 missing cells across 816 samples. |
| BGT physical surface | Eight bounded [PDOK BGT OGC API](https://www.pdok.nl/ogc-apis/-/article/basisregistratie-grootschalige-topografie-bgt-) collections provide current level-zero terrain, buildings, roads, water and structural barriers under CC0. Live centroid classification covered all 696 target H3 r13 cells from 258 source features; BGT describes physical surface objects, not drainage destinations. |
| Conditioned surface proxy | Experimental model `bounded-bgt-ahn-priority-flood-v0.1.0` retains raw AHN missing evidence, interpolates a separate terrain value only for land cells with at least three observed neighbours within four H3 rings, excludes 103 water and 3 wall/quay-barrier cells, and applies a multi-terminal priority-flood. The verified result assigns 100 cells / `3,676.73 m2` to the conditioned outfall, with 435 observed and 155 interpolated terrain values and zero unresolved cells. The attachment is explicitly not observed and remains ineligible for sewer propagation. |
| CORINE Land Cover | The official CLC 2018 V2020_20u1 European 100 m GeoTIFF is verified locally. A real Trento sample returned available class `111`. |
| CLC encoding | Official raster palette indices `1..44` are explicitly decoded to CLC level-3 codes `111..523` by transformation `clc-centroid-v0.2.0`. |
| H3 composition | Catchment cells and network entities are joined through explicit H3 representations while source resolution remains visible. |
| Runoff and catchments | Runoff v0 is deterministic and exposes inputs/intermediates; catchment aggregation uses represented H3 area. |
| Proof 0 network | Topology is validated separately from environmental evidence. Direction is `known`, `unknown` or `ambiguous`. |
| Observed infrastructure | The official Waternet/Amsterdam `Leidingeninfrastructuur` WFS was verified live. The outfall-anchored bounded import produced 47 observed nodes and 47 active stormwater pipes, including 4 explicit `Regenwateruitlaat` outfalls, retained NAP ground/invert attributes, and classified 25 directions as known and 22 as ambiguous at the configured 0.05 m threshold. All 4 outfalls stop at an ambiguous direction boundary, so the known-direction outfall analysis reports 0 supported upstream paths. |
| Observed area context | The public [PDOK / Stichting RIONED GWSW dataset](https://www.pdok.nl/introductie/-/article/stedelijk-water-riolering-) was verified live. The selected rainwater outfall lies inside `Rioleringsgebied.932` President Kennedylaan, but the public Waternet and GWSW responses publish no relation between that outfall and the polygon. Point containment is therefore exposed as context only: attachment remains ineligible and no catchment is created. |
| Propagation | Supported directed acyclic topology conserves volume and exposes mass balance. |
| API and inspector | One root command health-gates IMERG -> API -> web. The Next.js inspector automatically runs the verified window and independently acquires bounded Waternet topology, PDOK/GWSW area context, AHN terrain and BGT physical-surface evidence. Raw and conditioned values remain separately inspectable without AI or mineral services. |

The bounded Trento fixture produces a non-zero downstream result in both
deterministic verification and the fixed live run. That live run observed `9.24 mm` of
rainfall, derived `2.957 m3` of catchment contribution and delivered the same
volume to the outfall with zero mass-balance difference. The network geometry is a
deterministic fixture, not surveyed municipal infrastructure. The Amsterdam panel is observed municipal infrastructure with explicit
rainwater outfalls. GWSW containment remains context only. Its separate BGT/AHN
proxy now has complete conditioned H3 coverage and a non-zero area, but is still
not asserted as a sewer catchment because no outfall relation or BGT Inlooptabel
was published. At the configured 0.05 m threshold, each observed outfall is also
separated from the network by one ambiguous pipe, so no observed-network
propagation is produced. Missing rainfall, land cover or raw elevation never
becomes a valid-looking zero.

## Active architecture

```text
apps/
  api/                 Fastify Proof 0 API
  web/                 bounded Next.js evidence inspector

packages/
  evidence/            canonical evidence model and invariants
  providers/           IMERG, Copernicus DEM, CLC, AHN and BGT providers
  stormwater/          runoff, catchments, topology, Waternet/GWSW acquisition and propagation
  proof-zero/          end-to-end composition

nasa-precip-engine/    canonical Python IMERG acquisition service
copernicus-engine/     local acquisition tooling, outside active npm runtime
```

Only these npm workspaces are active:

```text
apps/api
apps/web
packages/evidence
packages/providers
packages/stormwater
packages/proof-zero
```

Legacy AI, Gemini, mineral, generic-risk, SDK, data-cube and elaborate 3D
sources may remain recoverable in the tree or Git history, but they are not
registered by the active API entry point or npm workspace graph.

## Evidence contract

Every important evidence value carries:

- provider, dataset and version;
- observation/reference time, requested window and acquisition time;
- physical coordinate or H3 representation;
- source spatial resolution;
- sampling and transformation method/version;
- quality status and missing reason;
- source-specific metadata required for traceability.

Canonical statuses are:

```text
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
```

`0` is valid only when it is observed or legitimately derived. Synthetic data
is restricted to explicit deterministic fixtures and is always labelled
`synthetic_fixture`.

## Requirements

- Node.js 20 or newer;
- npm 10 or newer;
- Python 3.11 or newer for IMERG;
- NASA Earthdata credentials for live precipitation;
- a local official CLC 2018 GeoTIFF for live land-cover evidence.

Copernicus DEM GLO-30, PDOK AHN4 DTM, PDOK BGT and the public PDOK/GWSW area API need no credential.
The active CLC provider reads a local GeoTIFF; a Copernicus service key is only
needed by download tooling, not by the runtime provider.

## Install

```bash
npm install

cd nasa-precip-engine
python -m pip install -r requirements.txt
cd ..
```

Create local environment files:

```bash
cp nasa-precip-engine/.env.example nasa-precip-engine/.env
cp apps/api/.env.example apps/api/.env
```

PowerShell equivalents:

```powershell
Copy-Item nasa-precip-engine/.env.example nasa-precip-engine/.env
Copy-Item apps/api/.env.example apps/api/.env
```

Never commit `.env`, service-key JSON or PEM files. The repository ignores
`.env` and `*.pem`.

## Configure real evidence

### NASA IMERG

Set `nasa-precip-engine/.env`:

```text
EARTHDATA_USERNAME=...
EARTHDATA_PASSWORD=...
API_HOST=0.0.0.0
API_PORT=8001
LOG_LEVEL=INFO

# Optional completed-window cache and one-command runtime overrides
IMERG_CACHE_DIR=D:/GeoLens/cache/imerg
IMERG_DISK_CACHE_TTL_SECONDS=2592000
GEOLENS_PYTHON=D:/GeoLens/venvs/nasa-precip/Scripts/python.exe
GEOLENS_TEMP_DIR=D:/GeoLens/tmp
```

Set the API boundary in `apps/api/.env`:

```text
PORT=3003
NASA_PRECIP_SERVICE_URL=http://127.0.0.1:8001
```

IMERG source resolution is approximately `0.1 degree`. H3 is only the sampling
and indexing representation. Remote granules use the provider's transient block
cache and are not intentionally retained. When `IMERG_CACHE_DIR` is configured,
GeoLens persists only completed `available` accumulation windows plus their original
provenance. Missing, failed and incomplete windows are never cached as observations.
A restored window is marked `cached: true` while retaining its original acquisition
time; it is real evidence replay, not a synthetic fixture. `GEOLENS_TEMP_DIR` keeps
operating-system temporaries off `C:` when the root development command starts the
service.

### CORINE Land Cover

Download the official **CORINE Land Cover 2018 V2020_20u1, raster 100 m,
Europe** package from the Copernicus Land Monitoring Service and extract the
main European GeoTIFF.

Keeping environmental rasters outside the repository is recommended. Example
Windows layout:

```text
D:/GeoLens/data/clc/
  u2018_clc2018_v2020_20u1_raster100m/
    DATA/
      U2018_CLC2018_V2020_20u1.tif
```

Configure `apps/api/.env` with forward slashes:

```text
CLC_RASTER_PATH=D:/GeoLens/data/clc/u2018_clc2018_v2020_20u1_raster100m/DATA/U2018_CLC2018_V2020_20u1.tif
```

The provider accepts EPSG:3035 or EPSG:4326. If the file is absent, unreadable
or outside coverage, the result remains explicit unavailable evidence.

## Run locally

Start the canonical IMERG service, Proof 0 API and inspector together:

```bash
npm run dev
```

The inspector uses port `3000` by default. If that port is already occupied,
the launcher rejects a successful response from the wrong application instead of
reporting GeoLens as ready. Select a free port explicitly in PowerShell:

```powershell
$env:GEOLENS_WEB_PORT = '3004'
npm run dev
```

The command reads `nasa-precip-engine/.env`, starts services in dependency
order, waits for each health gate, and shuts down the complete process tree with
`Ctrl+C`. The inspector then runs the fixed verified window ending
`2026-08-20T00:00:00Z` automatically. The first uncached IMERG acquisition may
take several minutes; subsequent exact-window runs restore the completed real
accumulation from the configured persistent cache.

Use `npm run dev:api-web` only when the IMERG service is already managed
separately.

Local endpoints:

- inspector: <http://localhost:3000> (or the configured `GEOLENS_WEB_PORT`);
- GeoLens API: <http://localhost:3003>;
- API health: <http://localhost:3003/health>;
- IMERG service: <http://localhost:8001>;
- IMERG health: <http://localhost:8001/health>;
- observed Waternet topology: <http://localhost:3003/api/infrastructure/amsterdam-waternet>.

Example API health response:

```json
{
  "status": "ok",
  "service": "geolens-proof-zero-api",
  "coreRequiresAi": false,
  "coreRequiresMineralModel": false,
  "runtime": {
    "imergServiceConfigured": true,
    "clcRasterConfigured": true
  }
}
```

Configuration flags confirm that endpoints/paths were supplied; evidence
status in a Proof 0 response is the authority on actual provider availability.

## Observed infrastructure API

`GET /api/infrastructure/amsterdam-waternet` requests a bounded response from
the official [Amsterdam Data API Waternet dataset](https://api.data.amsterdam.nl/v1/docs/datasets/leidingeninfrastructuur.html).
The default WFS 2.0 bbox is:

```text
52.3375,4.8978,52.3395,4.8995,EPSG:4326
```

WFS 2.0 uses latitude/longitude axis order for this EPSG:4326 bbox. A custom
request must provide `latMin`, `lonMin`, `latMax` and `lonMax` together,
and each span is limited to `0.01 degree`.

An available response exposes:

- acquisition and import receipts;
- provider, dataset, Creative Commons Attribution license and delivery date;
- source EPSG:7415 and WFS output EPSG:4326;
- observed point/line geometry and stable source record ids;
- four explicit `Regenwateruitlaat` nodes retained as typed outfalls;
- node ground levels and pipe invert levels in metres with NAP datum metadata;
- strict active-stormwater filtering and 0.25 m endpoint snap distances;
- skipped boundary pipes and defective endpoint-UUID state;
- known-direction outfall connectivity with its own model version and explicit
  supported-path / unresolved-boundary counts;
- invert-derived edge direction with evidence basis, model version, configured
  ambiguity threshold and `known` / `ambiguous` / `unknown` counts;
- `bemalingsgebied` values retained only as source identifiers; the response
  explicitly states that no contributing-area geometry was supplied;
- a bounded public PDOK/GWSW `beheergebied` receipt and the management areas
  containing the selected outfall;
- `Rioleringsgebied.932` President Kennedylaan exposed as spatial context only;
  neither point containment nor Waternet identifier `826` creates an attachment
  because no public crosswalk or source relation was found;
- the four unresolved outfall-boundary pipes highlighted separately from other
  ambiguous directions;
- an empty catchment attachment set because the source does not provide the
  required contributing areas.
- a separate experimental AHN4 DTM surface proxy at H3 r13, including its
  exact WCS receipt, 0.5 m source resolution, EPSG:28992 + NAP datum and
  per-cell evidence;
- an arithmetic mean over valid source-pixel centres inside every H3 cell,
  source-pixel counts and quality fraction, with the official greater-than-60%
  no-data rule kept explicit;
- the unconditioned AHN experiment with both a resolved partial area and an
  explicitly unavailable complete area when raw no-data leaves possible cells
  unresolved;
- a separate bounded BGT receipt across eight physical-surface collections and
  per-H3 centroid classification for terrain, buildings, roads, water and
  structural barriers;
- a conditioned terrain value beside every raw AHN value: land no-data may be
  estimated only by the stated IDW rule, while raw missing evidence remains
  unchanged and traceable;
- a multi-terminal priority-flood result that distinguishes the conditioned
  outfall, bbox exits and observed surface water. The verified complete proxy is
  `3,676.73 m2` across 100 H3 cells, but never creates a Waternet catchment
  attachment or sewer propagation input.

Authentication, rate limiting, upstream errors, invalid/truncated responses and
empty coverage are returned explicitly without an empty valid-looking topology.

## Proof 0 API

`POST /api/proof-zero/run` accepts:

```json
{
  "network": {
    "type": "FeatureCollection",
    "features": []
  },
  "networkId": "bounded-network-id",
  "referenceTime": "2026-08-20T00:00:00Z",
  "nodeH3Resolution": 11,
  "catchmentH3Resolution": 13,
  "snapToleranceM": 5,
  "minimumResolvableDropM": 0.1
}
```

The shown empty feature collection documents the request shape but is not
executable. A complete typed fixture is available in
[`apps/web/app/lib/fixture.ts`](apps/web/app/lib/fixture.ts).

Supported GeoJSON entities use explicit properties:

- node: `Point` with `type` equal to `inlet`, `manhole` or `outfall`;
- pipe: `LineString` with `type: pipe`;
- catchment: `Polygon` with `type: catchment` and `outlet_node_id`.

The response exposes provider summaries, H3 environmental cells, point-sampled
node elevation, issues, topology, edge direction, runoff intermediates,
catchment contributions, node source terms, propagation and mass balance.

### Bounded execution limits

| Limit | Value |
| --- | ---: |
| Geographic span | `0.25 degree x 0.25 degree` |
| GeoJSON features | 500 |
| Coordinates | 10,000 |
| Nodes | 100 |
| Pipes | 200 |
| Catchments | 50 |
| Catchment H3 cells | 500 |
| Request body | 1 MiB |

These are Proof 0 guardrails, not continent-scale performance claims.

## Verification

Deterministic verification:

```bash
npm run typecheck
npm test
npm run build
```

The normal suite keeps live-provider checks separate from deterministic
fixtures.

Opt-in live verification on Bash:

```bash
GEOLENS_RUN_LIVE_PROVIDER_TESTS=1 \
CLC_RASTER_PATH=/absolute/path/to/U2018_CLC2018_V2020_20u1.tif \
GEOLENS_IMERG_REFERENCE_TIME=2026-08-20T00:00:00Z \
npm run test:live
```

PowerShell:

```powershell
$env:GEOLENS_RUN_LIVE_PROVIDER_TESTS = '1'
$env:CLC_RASTER_PATH = 'D:/GeoLens/data/clc/u2018_clc2018_v2020_20u1_raster100m/DATA/U2018_CLC2018_V2020_20u1.tif'
$env:GEOLENS_IMERG_REFERENCE_TIME = '2026-08-20T00:00:00Z'
npm run test:live
```

The public Waternet WFS, PDOK/GWSW area API and PDOK BGT surface API have their own opt-in live verification:

```powershell
$env:GEOLENS_LIVE_WATERNET = '1'
$env:GEO_LENS_LIVE_BGT = '1'
npm run build --workspace=@geo-lens/providers
npm run build --workspace=@geo-lens/stormwater
node --test packages/providers/test/live-bgt.test.cjs
node --test packages/stormwater/test/live-amsterdam-wfs.test.cjs packages/stormwater/test/live-amsterdam-gwsw.test.cjs
```

With the IMERG service and GeoLens API already running, verify the complete live
chain separately:

```powershell
$env:GEOLENS_RUN_LIVE_PROOF_ZERO_TESTS = '1'
$env:GEOLENS_IMERG_REFERENCE_TIME = '2026-08-20T00:00:00Z'
npm run test:live:proof-zero
```

The end-to-end test requires the API process to have loaded both
`NASA_PRECIP_SERVICE_URL` and `CLC_RASTER_PATH` from `apps/api/.env`.

Use a reference time old enough for the selected IMERG run to be published.
Live checks may fail because of credentials, provider availability, rate limits
or incomplete source windows; those failures must never produce zero rainfall.

## Scientific limits

- Runoff v0 is an inspectable deterministic derivation, not calibration or
  flood validation.
- Land-cover-derived imperviousness and runoff parameters are model inputs or
  proxies, not observed drainage capacity.
- Slope is derived from sampled DEM elevations and retains its transformation
  metadata.
- Proof 0 edge direction is never invented when node-elevation evidence is insufficient; observed Waternet direction is derived separately from pipe endpoint invert evidence.
- The observed Waternet topology exposes only invert-derived direction state; it does not claim catchment contribution or propagated flow until those evidence boundaries are supplied.
- A GWSW polygon containing an outfall coordinate is area context, not proof that the polygon drains to that outfall; attachment requires a published relation or authoritative crosswalk.
- The BGT/AHN proxy uses a separately documented conditioning method, but its outfall terminal is a model boundary condition rather than an observed sewer attachment. IDW terrain values and priority-flood elevations are derived estimates, not rewritten AHN observations.
- Propagation operates on supported known directed acyclic topology and does
  not simulate pipe hydraulics, storage, surcharge or overflow.
- No percentage confidence, flood probability or production-readiness claim is
  generated without a separate validation procedure.

## Release policy

`v0.1.0-alpha.4` is the latest published refoundation baseline. It packages code,
contracts and deterministic/remote verification only. NASA granules, CLC rasters,
credentials, caches and generated provider data are deliberately excluded.

Future releases must keep fixture verification separate from live-data
verification and describe unavailable providers explicitly.

## Project authority

When repository materials disagree, use this order:

1. [`AGENTS.md`](AGENTS.md);
2. [`REFOUNDATION_PLAN.md`](REFOUNDATION_PLAN.md);
3. verified runtime behavior;
4. tests expressing current intended behavior;
5. implementation;
6. old documentation.

Historical completion reports and legacy production-readiness claims are not
authoritative.
