"""Materialize bounded Cumbria IMERG evidence through the canonical NASA path.

The script delegates all discovery, authentication, opening and accumulation to
``nasa-precip-engine``. It exports only a small native-grid accumulation and a
content-addressed receipt; source granules are never copied into the benchmark.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import numpy as np


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
NASA_ROOT = REPOSITORY_ROOT / "nasa-precip-engine"
sys.path.insert(0, str(NASA_ROOT))

from src.cache import get_cached_window, set_cached_window  # noqa: E402
from src.imerg_client import (  # noqa: E402
    ImergAcquisitionError,
    ImergSpatialBounds,
    load_imerg_window,
)


REFERENCE_TIME = datetime(2015, 12, 7, tzinfo=timezone.utc)
WINDOW_HOURS = 72
EXPECTED_START = datetime(2015, 12, 4, tzinfo=timezone.utc)
EXPECTED_END = REFERENCE_TIME
EXPECTED_GRANULES = 144
DATASET_VERSION = "07"
PRODUCT = "GPM_3IMERGHH"
RUN_TYPE = "final"
RECEIPT_FILE_NAME = "cumbria-public-baseline-imerg-v07.receipt.json"


def parse_args(arguments=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--execute", action="store_true")
    return parser.parse_args(arguments)


def ensure_external_data_root(data_root: Path) -> None:
    root = data_root.resolve()
    repository = REPOSITORY_ROOT.resolve()
    try:
        root.relative_to(repository)
    except ValueError:
        pass
    else:
        raise ValueError("Cumbria IMERG data root must stay outside the Git repository")
    if any(part.casefold() == "onedrive" for part in root.parts):
        raise ValueError("Cumbria IMERG data root must stay outside OneDrive")


def requested_bounds(manifest: dict) -> ImergSpatialBounds:
    boundary = manifest["publicBaselineProtocol"]["domain"]["wgs84Boundary"]
    if not isinstance(boundary, list) or len(boundary) < 4:
        raise ValueError("Cumbria WGS84 domain boundary is missing")
    longitude = [float(coordinate[0]) for coordinate in boundary]
    latitude = [float(coordinate[1]) for coordinate in boundary]
    return ImergSpatialBounds(
        west=min(longitude),
        south=min(latitude),
        east=max(longitude),
        north=max(latitude),
    )


def validate_window(window, bounds: ImergSpatialBounds):
    metadata = window.metadata
    checks = {
        "product": PRODUCT,
        "run_type": RUN_TYPE,
        "dataset_version": DATASET_VERSION,
        "archive_version": DATASET_VERSION,
        "requested_window_start": EXPECTED_START,
        "requested_window_end": EXPECTED_END,
        "actual_window_start": EXPECTED_START,
        "actual_window_end": EXPECTED_END,
        "expected_granule_count": EXPECTED_GRANULES,
        "granule_count": EXPECTED_GRANULES,
        "source_resolution": "0.1 degree",
        "sampling_method": "nearest IMERG grid cell at H3 centroid",
        "requested_spatial_bounds": bounds,
        "status": "available",
        "missing_reason": None,
    }
    for attribute, expected in checks.items():
        actual = getattr(metadata, attribute)
        if actual != expected:
            raise ValueError(
                f"IMERG {attribute} must be {expected!r}, got {actual!r}"
            )
    timestamps = tuple(
        EXPECTED_START + timedelta(minutes=30 * index)
        for index in range(EXPECTED_GRANULES)
    )
    if metadata.granule_timestamps != timestamps:
        raise ValueError("IMERG timestamps do not cover every exact half-hour")
    if metadata.searched_granule_count < EXPECTED_GRANULES:
        raise ValueError("IMERG searched granule count is incomplete")
    if tuple(window.data.dims) != ("lon", "lat"):
        raise ValueError("IMERG source grid must use longitude-major dimensions")
    metadata_shape = (window.data.sizes["lat"], window.data.sizes["lon"])
    if metadata_shape != tuple(metadata.grid_shape):
        raise ValueError("IMERG grid shape disagrees with metadata")
    longitude = [float(value) for value in window.data["lon"].values.tolist()]
    latitude = [float(value) for value in window.data["lat"].values.tolist()]
    values = np.asarray(window.data.values, dtype=np.float64)
    if (
        not np.isfinite(values).all()
        or np.any(values < 0)
        or longitude != sorted(longitude)
        or latitude != sorted(latitude)
    ):
        raise ValueError("IMERG source grid contains missing, negative or unordered data")
    for coordinates, label in ((longitude, "longitude"), (latitude, "latitude")):
        if len(coordinates) != len(set(coordinates)) or any(
            not math.isclose(right - left, 0.1, abs_tol=0.00001)
            for left, right in zip(coordinates, coordinates[1:])
        ):
            raise ValueError(f"IMERG {label} coordinates are not unique 0.1 degree cells")
    return longitude, latitude, values


def portable_grid(window, bounds: ImergSpatialBounds) -> dict:
    longitude, latitude, values = validate_window(window, bounds)
    metadata = window.metadata
    flattened = values.ravel()
    return {
        "schemaVersion": "canonical-imerg-source-grid-v0.2.0",
        "datasetId": "nasa-imerg-v07-final",
        "status": "available",
        "unit": "mm",
        "valueSemantics": "72-hour accumulated precipitation",
        "coordinateReferenceSystem": "EPSG:4326",
        "sourceResolution": metadata.source_resolution,
        "sourceTemporalResolution": "30 minute",
        "sourceGrid": {
            "longitude": longitude,
            "latitude": latitude,
            "valueOrder": "longitude_major_latitude_minor",
            "precipitationMm": values.tolist(),
        },
        "spatial": {
            "requestedBounds": spatial_bounds_payload(bounds),
            "loadedBounds": spatial_bounds_payload(metadata.loaded_spatial_bounds),
            "samplingMethod": metadata.sampling_method,
        },
        "temporal": {
            "requestedWindowStart": iso(metadata.requested_window_start),
            "requestedWindowEnd": iso(metadata.requested_window_end),
            "actualWindowStart": iso(metadata.actual_window_start),
            "actualWindowEnd": iso(metadata.actual_window_end),
            "acquiredAt": iso(metadata.acquired_at),
        },
        "provenance": {
            "provider": "NASA GES DISC via earthaccess",
            "dataset": metadata.product,
            "datasetVersion": metadata.dataset_version,
            "archiveVersion": metadata.archive_version,
            "runType": metadata.run_type,
            "expectedGranuleCount": metadata.expected_granule_count,
            "searchedGranuleCount": metadata.searched_granule_count,
            "granuleCount": metadata.granule_count,
            "granuleTimestamps": [
                iso(timestamp) for timestamp in metadata.granule_timestamps
            ],
            "variableNames": list(metadata.variable_names),
            "canonicalAcquisitionPath": "nasa-precip-engine earthaccess + xarray",
            "transformation": "bounded native-grid accumulation export",
            "transformationVersion": "cumbria-imerg-v07-export-v0.1.0",
        },
        "statistics": {
            "finiteCells": int(flattened.size),
            "minimumMm": float(np.min(flattened)),
            "maximumMm": float(np.max(flattened)),
            "meanMm": float(np.mean(flattened)),
        },
    }


def materialize(data_root: Path, window, bounds: ImergSpatialBounds) -> dict:
    payload = portable_grid(window, bounds)
    native_directory = data_root / "precipitation" / "native" / "sha256"
    staging_directory = data_root / "staging"
    native_directory.mkdir(parents=True, exist_ok=True)
    staging_directory.mkdir(parents=True, exist_ok=True)
    artifact_bytes = normalized_json(payload)
    artifact_sha256 = sha256_bytes(artifact_bytes)
    artifact_path = native_directory / f"{artifact_sha256}.json"
    persist_content_addressed(artifact_path, artifact_bytes, artifact_sha256)
    artifact = {
        "relativePath": artifact_path.relative_to(data_root).as_posix(),
        "bytes": len(artifact_bytes),
        "sha256": artifact_sha256,
    }

    receipt_path = data_root / RECEIPT_FILE_NAME
    previous = read_optional_json(receipt_path)
    materialized_at = (
        previous["materializedAt"]
        if previous
        and previous.get("artifact", {}).get("sha256") == artifact_sha256
        else iso(datetime.now(timezone.utc))
    )
    receipt_without_hash = {
        "schemaVersion": "cumbria-imerg-v07-source-receipt-v0.1.0",
        "materializationId": "cumbria-public-baseline-imerg-v07-v0",
        "materializedAt": materialized_at,
        "status": "available",
        "provider": payload["provenance"]["provider"],
        "dataset": payload["provenance"]["dataset"],
        "datasetVersion": DATASET_VERSION,
        "runType": RUN_TYPE,
        "sourceResolution": payload["sourceResolution"],
        "sourceTemporalResolution": payload["sourceTemporalResolution"],
        "requestedWindow": payload["temporal"],
        "requestedBounds": payload["spatial"]["requestedBounds"],
        "loadedBounds": payload["spatial"]["loadedBounds"],
        "gridShape": list(window.metadata.grid_shape),
        "statistics": payload["statistics"],
        "granuleCount": window.metadata.granule_count,
        "granuleTimestamps": payload["provenance"]["granuleTimestamps"],
        "artifact": artifact,
        "isolation": {
            "sourceGranulesCopied": False,
            "observedFloodGeometryLoaded": False,
            "observedFloodGeometryUsed": False,
            "h3UsedAsSourceOrSolverGrid": False,
            "solverExecutionAuthorized": False,
        },
    }
    receipt = {
        **receipt_without_hash,
        "receiptSha256": sha256_json(receipt_without_hash),
    }
    if previous and previous != receipt:
        raise ValueError("Existing Cumbria IMERG receipt differs from verified output")
    if not previous:
        atomic_json(receipt_path, receipt, staging_directory)
    return {"receiptPath": str(receipt_path), "receipt": receipt}


def run(arguments=None):
    options = parse_args(arguments)
    data_root = Path(options.data_root).resolve()
    ensure_external_data_root(data_root)
    manifest = json.loads(
        (REPOSITORY_ROOT / "tests/ground-truth/cumbria-2015/manifest.json").read_text(
            encoding="utf-8"
        )
    )
    bounds = requested_bounds(manifest)
    plan = {
        "materializationId": "cumbria-public-baseline-imerg-v07-v0",
        "mode": "execute" if options.execute else "dry_run",
        "dataRoot": str(data_root),
        "dataset": PRODUCT,
        "datasetVersion": DATASET_VERSION,
        "runType": RUN_TYPE,
        "referenceTime": iso(REFERENCE_TIME),
        "windowHours": WINDOW_HOURS,
        "expectedGranules": EXPECTED_GRANULES,
        "requestedBounds": spatial_bounds_payload(bounds),
        "canonicalAcquisitionPath": "nasa-precip-engine earthaccess + xarray",
        "evaluationGeometryLoaded": False,
    }
    if not options.execute:
        return plan
    window = get_cached_window(
        REFERENCE_TIME,
        WINDOW_HOURS,
        DATASET_VERSION,
        bounds,
    )
    cache_hit = window is not None
    if window is None:
        window = load_imerg_window(
            REFERENCE_TIME,
            WINDOW_HOURS,
            dataset_version=DATASET_VERSION,
            allow_early=False,
            spatial_bounds=bounds,
        )
        set_cached_window(REFERENCE_TIME, WINDOW_HOURS, window)
        validate_window(window, bounds)
    result = materialize(data_root, window, bounds)
    return {
        **plan,
        "state": "imerg_v07_native_window_materialized",
        "cacheHit": cache_hit,
        "receiptPath": result["receiptPath"],
        "receiptSha256": result["receipt"]["receiptSha256"],
        "gridShape": result["receipt"]["gridShape"],
        "statistics": result["receipt"]["statistics"],
        "artifact": result["receipt"]["artifact"],
    }


def spatial_bounds_payload(bounds) -> dict:
    return {
        "west": float(bounds.west),
        "south": float(bounds.south),
        "east": float(bounds.east),
        "north": float(bounds.north),
    }


def iso(value: datetime | None) -> str | None:
    return value.astimezone(timezone.utc).isoformat() if value else None


def normalized_json(value: dict) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: dict) -> str:
    return sha256_bytes(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )


def persist_content_addressed(path: Path, value: bytes, expected_sha256: str) -> None:
    if path.exists():
        if not path.is_file() or sha256_bytes(path.read_bytes()) != expected_sha256:
            raise ValueError(f"Content-addressed IMERG artifact drifted: {path}")
        return
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(value)
    os.replace(temporary, path)


def read_optional_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def atomic_json(path: Path, value: dict, staging_directory: Path) -> None:
    temporary = staging_directory / f"{path.name}.{os.getpid()}.part"
    temporary.write_bytes(normalized_json(value))
    os.replace(temporary, path)


def main() -> None:
    try:
        print(json.dumps(run(), indent=2, sort_keys=True))
    except ImergAcquisitionError as error:
        print(
            json.dumps(
                {
                    "status": error.status,
                    "missingReason": str(error),
                    "product": error.product,
                    "runType": error.run_type,
                },
                indent=2,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
