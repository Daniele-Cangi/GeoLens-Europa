# NASA IMERG Evidence Service

This FastAPI service is GeoLens's sole production acquisition boundary for NASA GPM IMERG precipitation. It uses `earthaccess` to locate and open real granules and `xarray` to extract and accumulate precipitation.

It never converts absent granules, authentication failures, incomplete windows, NaN samples, coverage failures, or upstream errors to zero.

## Returned evidence

For each requested 24-hour or 72-hour window, the response retains:

- product and run type;
- dataset version;
- requested and actual covered window;
- expected, searched, and usable granule counts;
- granule timestamps;
- acquisition time;
- source resolution;
- sampling method;
- evidence status and missing reason;
- per-H3-cell evidence.

IMERG's source grid is `0.1 degree`. H3 is the requested indexing and sampling representation, not the native source precision.

## Requirements

- Python 3.11 or newer
- NASA Earthdata credentials

```bash
python -m pip install -r requirements.txt
cp .env.example .env
```

Configure:

```text
EARTHDATA_USERNAME=...
EARTHDATA_PASSWORD=...
API_HOST=0.0.0.0
API_PORT=8001
LOG_LEVEL=INFO

# Optional persistent cache for completed real-evidence windows
IMERG_CACHE_DIR=D:/GeoLens/cache/imerg
IMERG_DISK_CACHE_TTL_SECONDS=2592000

# Optional root npm run dev overrides
GEOLENS_PYTHON=D:/GeoLens/venvs/nasa-precip/Scripts/python.exe
GEOLENS_TEMP_DIR=D:/GeoLens/tmp
```

## Run

```bash
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

Endpoints:

- `GET /health`
- `GET /cache/stats`
- `POST /precip/h3`

Example request:

```json
{
  "h3_indices": ["872a1070fffffff"],
  "reference_time": "2026-08-20T00:00:00Z",
  "window_hours": [24]
}
```

The reference timestamp is normalized to an IMERG half-hour boundary. If omitted, the service uses a reference six hours behind current UTC to account for product latency.

The acquisition code searches Late Run first and may use Early Run when Late Run does not cover the requested window. It selects one product for a window and reports the selected product and run type. A partial granule set remains `incomplete_window`; partial accumulation is not exposed as an available observation.

The service opens remote granules through the `earthaccess`/`fsspec` transient
block cache and never intentionally archives those source granules. Completed
`available` accumulation windows can be persisted when `IMERG_CACHE_DIR` is set.
Each entry contains the derived NetCDF accumulation and a JSON provenance envelope
with product, run type, requested/actual coverage, granule timestamps, acquisition
time, source resolution and sampling method.

Only completed real evidence is eligible. `missing`, `incomplete_window`,
authentication failures and provider errors remain memory-only and cannot become a
cache hit. An exact-window restore returns `cached: true` while preserving the
original acquisition time and evidence semantics, including a legitimate observed
`0 mm` value. Corrupt or expired entries are treated as cache misses.

`GET /cache/stats` reports memory and persistent entry counts, byte size and TTL
without exposing Earthdata credentials. `GEOLENS_TEMP_DIR` is used by the root
orchestrator to place `TEMP` and `TMP` on a selected drive.

## Verify

Deterministic contract and numeric-semantics tests:

```bash
python -m unittest discover -s tests -v
```

Live verification is opt-in:

```bash
GEOLENS_RUN_LIVE_PROVIDER_TESTS=1 \
python -m unittest discover -s tests -p test_live_imerg.py -v
```

Set `GEOLENS_IMERG_REFERENCE_TIME` to an explicit ISO timestamp when repeatability is needed. The normal deterministic suite skips the live test.
