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

The service opens remote granules through the `earthaccess`/`fsspec` in-memory block cache and keeps completed windows in process memory. It does not intentionally persist HDF5 granules. Set the operating system `TEMP` and `TMP` variables before startup when temporary storage must use a specific drive.

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
