# GeoLens

GeoLens is a spatial evidence engine that composes real environmental observations, terrain, and infrastructure into traceable derived physical state.

The current refoundation proves one bounded flow:

```text
IMERG precipitation + Copernicus DEM + CORINE Land Cover
                         ↓
                 H3 evidence bundle
                         ↓
                 runoff derivation
                         ↓
              catchment aggregation
                         ↓
              stormwater propagation
                         ↓
             inspectable downstream state
```

This is **Proof 0**. It is an experimental, inspectable runoff and network-propagation model. It is not a flood model, hydraulic simulation, sewer-capacity model, groundwater model, or probability-of-damage product.

## What is verified

- A canonical evidence model keeps observed zero distinct from missing, incomplete, failed, stale, or out-of-coverage evidence.
- The Python `earthaccess` + `xarray` service is the only production IMERG acquisition path.
- Copernicus DEM returns traceable elevation and finite-difference slope evidence; public live sampling has been verified.
- CORINE Land Cover returns official class codes from an explicitly configured local raster and returns `missing` when that raster is absent.
- H3 indexes catchment evidence and network entities while source resolution remains explicit.
- Runoff v0 exposes rainfall, slope, land cover, imperviousness proxy, coefficient, runoff depth, and model version.
- Catchment aggregation uses represented H3 area and produces traceable water volume.
- Network topology is validated independently; direction can be `known`, `unknown`, or `ambiguous`.
- Deterministic propagation conserves volume across supported directed acyclic topology.
- The API and web inspector require no AI key or mineral model.

The deterministic fixture suite reproduces a non-zero outfall result. A production-path browser run has also verified real DEM evidence alongside explicit `upstream_error` IMERG and `missing` CLC states when those two live inputs were not configured. No missing source became zero.

Live NASA verification still requires Earthdata credentials. Live CLC verification requires a local CLC2018 GeoTIFF.

## Active architecture

```text
apps/
  api/                 bounded Fastify Proof 0 API
  web/                 Next.js evidence inspector

packages/
  evidence/            canonical evidence semantics
  providers/           IMERG service client, DEM and CLC providers
  stormwater/          runoff, catchment, topology and propagation
  proof-zero/          end-to-end composition

nasa-precip-engine/    canonical Python IMERG service
```

Historical AI, generic-risk, data-cube, SDK, 3D, and multi-hazard sources remain recoverable in Git history or parked outside the active npm workspaces. They are not part of Proof 0.

## Evidence semantics

Every important value carries:

- provider and dataset identity;
- dataset and transformation version where available;
- observation window and acquisition time;
- source spatial resolution and sampling method;
- H3 representation or physical coordinate;
- explicit quality status and missing reason.

`0` is a valid value only when observed or legitimately derived. Provider failures, incomplete windows, missing raster coverage, and unresolved elevation never become numeric zero.

Synthetic evidence is limited to deterministic fixtures and is marked `synthetic_fixture`; it cannot be represented as live evidence.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Python 3.11 or newer for the IMERG service
- NASA Earthdata credentials for live IMERG
- a CLC2018 GeoTIFF for live land-cover evidence

Copernicus DEM GLO-30 uses its public raster endpoint and does not require credentials.

## Install

```bash
npm install

cd nasa-precip-engine
python -m pip install -r requirements.txt
cd ..
```

Copy the service examples and provide only the inputs you intend to use:

```bash
cp nasa-precip-engine/.env.example nasa-precip-engine/.env
cp apps/api/.env.example apps/api/.env
```

Relevant API settings:

```text
PORT=3003
NASA_PRECIP_SERVICE_URL=http://127.0.0.1:8001
CLC_RASTER_PATH=/absolute/path/to/CLC2018_100m.tif
```

The CLC raster may use EPSG:3035 or EPSG:4326. An absent raster is reported as missing evidence.

## Run locally

Start the canonical IMERG service when live precipitation is required:

```bash
cd nasa-precip-engine
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

In another terminal, start the API and inspector:

```bash
npm run dev
```

- Web inspector: <http://localhost:3000>
- Proof 0 API: <http://localhost:3003>
- IMERG service: <http://localhost:8001>

The inspector submits a small bounded stormwater fixture to `POST /api/proof-zero/run`. Its initial state contains no fabricated measurements.

## Verify

Deterministic verification:

```bash
npm run typecheck
npm test
npm run build
```

The normal test run keeps live-provider checks skipped and clearly separated from fixture verification.

Opt-in live provider verification:

```bash
GEOLENS_RUN_LIVE_PROVIDER_TESTS=1 npm run test:live
```

For live IMERG, set `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD`. Optionally set `GEOLENS_IMERG_REFERENCE_TIME` to a sufficiently old ISO timestamp. For live CLC, set `CLC_RASTER_PATH`.

## API boundary

`POST /api/proof-zero/run` requires:

- a bounded GeoJSON `FeatureCollection` containing typed nodes, pipes, and catchments;
- an explicit ISO `referenceTime`;
- optionally, H3 resolutions, snapping tolerance, and minimum resolvable elevation drop.

The response exposes environmental cells, node elevation evidence, provider summaries, issues, topology, direction states, catchment contributions, node source terms, propagation state, and mass balance.

The endpoint deliberately rejects unbounded requests. Proof 0 is optimized for scientific inspectability on a small area, not continent-scale throughput.

## Project authority

- `AGENTS.md` defines the refoundation contract and scientific rules.
- `REFOUNDATION_PLAN.md` records architectural gates and verified state.
- Tests and runtime behavior determine what is actually supported.
