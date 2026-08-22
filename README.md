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

Latest refoundation baseline: **v0.1.0-alpha.1**.

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

The following state has been verified locally on 2026-08-22.

| Layer or subsystem | Verified state |
| --- | --- |
| Evidence semantics | Observed zero is distinct from missing, incomplete, failed, stale and out-of-coverage evidence. |
| IMERG boundary | The Python `earthaccess` + `xarray` service is the sole production acquisition path. A fixed 24 h live window ending `2026-08-20T00:00:00Z` was verified as complete Early Run V07 evidence with 48/48 granules. Live execution remains opt-in and credential/network dependent. |
| Copernicus DEM | Real public GLO-30 sampling is verified, including traceable elevation and finite-difference slope evidence. |
| CORINE Land Cover | The official CLC 2018 V2020_20u1 European 100 m GeoTIFF is verified locally. A real Trento sample returned available class `111`. |
| CLC encoding | Official raster palette indices `1..44` are explicitly decoded to CLC level-3 codes `111..523` by transformation `clc-centroid-v0.2.0`. |
| H3 composition | Catchment cells and network entities are joined through explicit H3 representations while source resolution remains visible. |
| Runoff and catchments | Runoff v0 is deterministic and exposes inputs/intermediates; catchment aggregation uses represented H3 area. |
| Network | Topology is validated separately from environmental evidence. Direction is `known`, `unknown` or `ambiguous`. |
| Propagation | Supported directed acyclic topology conserves volume and exposes mass balance. |
| API and inspector | Fastify API and Next.js inspector build and run without AI or mineral services. |

The bounded Trento fixture produces a non-zero downstream result in both
deterministic verification and the fixed live run. That live run observed `9.24 mm` of
rainfall, derived `2.957 m3` of catchment contribution and delivered the same
volume to the outfall with zero mass-balance difference. The network geometry is a
deterministic fixture, not surveyed municipal infrastructure. Missing rainfall, land
cover or elevation never becomes a valid-looking zero.

## Active architecture

```text
apps/
  api/                 Fastify Proof 0 API
  web/                 bounded Next.js evidence inspector

packages/
  evidence/            canonical evidence model and invariants
  providers/           IMERG client, Copernicus DEM and CLC providers
  stormwater/          runoff, catchments, topology and propagation
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

Copernicus DEM GLO-30 uses its public raster endpoint and needs no credential.
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
```

Set the API boundary in `apps/api/.env`:

```text
PORT=3003
NASA_PRECIP_SERVICE_URL=http://127.0.0.1:8001
```

IMERG source resolution is approximately `0.1 degree`. H3 is only the sampling
and indexing representation. The canonical acquisition opens remote granules with an
in-memory block cache; it does not intentionally persist HDF5 granules. On Windows,
set `TEMP` and `TMP` to a directory such as `D:/GeoLens/tmp` before startup if
operating-system temporaries must also stay off C:.

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

Terminal 1 — canonical IMERG service:

```bash
cd nasa-precip-engine
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

Terminal 2 — API and web inspector:

```bash
npm run dev
```

Local endpoints:

- inspector: <http://localhost:3000>;
- GeoLens API: <http://localhost:3003>;
- API health: <http://localhost:3003/health>;
- IMERG service: <http://localhost:8001>;
- IMERG health: <http://localhost:8001/health>.

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
- Edge direction is never invented when elevation evidence is insufficient.
- Propagation operates on supported known directed acyclic topology and does
  not simulate pipe hydraulics, storage, surcharge or overflow.
- No percentage confidence, flood probability or production-readiness claim is
  generated without a separate validation procedure.

## Release policy

`v0.1.0-alpha.1` is the first tagged refoundation baseline. It packages code,
contracts and deterministic verification only. NASA granules, CLC rasters,
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
