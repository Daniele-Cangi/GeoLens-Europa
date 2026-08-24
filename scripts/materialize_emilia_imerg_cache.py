"""Freeze a verified canonical IMERG cache entry for the Forli benchmark.

This script does not acquire NASA data. It validates and copies the output of
the sole production earthaccess/xarray path into portable, content-addressable
benchmark artifacts.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import shutil

import xarray as xr


EXPECTED_START = "2023-05-16T00:00:00+00:00"
EXPECTED_END = "2023-05-18T00:00:00+00:00"
EXPECTED_BOUNDS = {"west": 11.98, "south": 44.17, "east": 12.1, "north": 44.28}
EXPECTED_GRANULES = 96
EXPECTED_TIMESTAMPS = [
    (
        datetime(2023, 5, 16, tzinfo=timezone.utc)
        + timedelta(minutes=30 * index)
    ).isoformat()
    for index in range(EXPECTED_GRANULES)
]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-root", default=os.environ.get("GEOLENS_BENCHMARK_DATA_ROOT")
    )
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--netcdf", required=True)
    return parser.parse_args()


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact(root, path):
    return {
        "relativePath": path.resolve().relative_to(root.resolve()).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def atomic_copy(source, target):
    temporary = target.with_suffix(target.suffix + ".tmp")
    shutil.copyfile(source, temporary)
    os.replace(temporary, target)


def atomic_json(path, value):
    encoded = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf8")
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(encoded)
    os.replace(temporary, path)


def require_equal(actual, expected, label):
    if actual != expected:
        raise ValueError(f"{label} must be {expected!r}, got {actual!r}")


def require_aware_timestamp(value, label):
    if not isinstance(value, str):
        raise ValueError(f"{label} must be an ISO 8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} must be an ISO 8601 timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone")


def validate_loaded_bounds(value):
    if not isinstance(value, dict) or set(value) != set(EXPECTED_BOUNDS):
        raise ValueError(
            "windowMetadata.loadedSpatialBounds must contain west/south/east/north"
        )
    if not all(
        isinstance(item, (int, float)) and math.isfinite(item)
        for item in value.values()
    ):
        raise ValueError("windowMetadata.loadedSpatialBounds must be finite")
    if value["west"] >= value["east"] or value["south"] >= value["north"]:
        raise ValueError("windowMetadata.loadedSpatialBounds are invalid")
    if (
        value["west"] > EXPECTED_BOUNDS["west"]
        or value["south"] > EXPECTED_BOUNDS["south"]
        or value["east"] < EXPECTED_BOUNDS["east"]
        or value["north"] < EXPECTED_BOUNDS["north"]
    ):
        raise ValueError(
            "windowMetadata.loadedSpatialBounds do not contain the requested AOI"
        )


def validate_metadata(metadata):
    require_equal(metadata.get("schemaVersion"), 3, "schemaVersion")
    require_equal(metadata.get("datasetVersion"), "07", "datasetVersion")
    require_equal(metadata.get("windowHours"), 48, "windowHours")
    require_equal(metadata.get("referenceTime"), EXPECTED_END, "referenceTime")
    require_equal(metadata.get("spatialBounds"), EXPECTED_BOUNDS, "spatialBounds")

    window = metadata.get("windowMetadata")
    if not isinstance(window, dict):
        raise ValueError("windowMetadata must be an object")
    checks = {
        "status": "available",
        "missingReason": None,
        "datasetVersion": "07",
        "archiveVersion": "07",
        "product": "GPM_3IMERGHH",
        "runType": "final",
        "sourceResolution": "0.1 degree",
        "requestedWindowStart": EXPECTED_START,
        "requestedWindowEnd": EXPECTED_END,
        "actualWindowStart": EXPECTED_START,
        "actualWindowEnd": EXPECTED_END,
        "expectedGranuleCount": EXPECTED_GRANULES,
        "searchedGranuleCount": EXPECTED_GRANULES,
        "granuleCount": EXPECTED_GRANULES,
        "gridShape": [3, 3],
        "requestedSpatialBounds": EXPECTED_BOUNDS,
    }
    for key, expected in checks.items():
        require_equal(window.get(key), expected, f"windowMetadata.{key}")
    require_equal(
        window.get("samplingMethod"),
        "nearest IMERG grid cell at H3 centroid",
        "windowMetadata.samplingMethod",
    )
    require_aware_timestamp(window.get("acquiredAt"), "windowMetadata.acquiredAt")
    validate_loaded_bounds(window.get("loadedSpatialBounds"))

    timestamps = window.get("granuleTimestamps")
    if not isinstance(timestamps, list) or len(timestamps) != EXPECTED_GRANULES:
        raise ValueError("granuleTimestamps must contain exactly 96 entries")
    if timestamps != EXPECTED_TIMESTAMPS:
        raise ValueError("granuleTimestamps must cover every exact half-hour in order")
    return window


def finite_values(values, label):
    flattened = []
    for outer in values:
        row = []
        for raw in outer:
            value = float(raw)
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"{label} contains missing, invalid or negative evidence")
            row.append(value)
            flattened.append(value)
    return values, flattened


def validate_netcdf(path, window):
    with xr.open_dataset(path) as dataset:
        if "precipitation" not in dataset:
            raise ValueError("NetCDF lacks precipitation")
        precipitation = dataset["precipitation"]
        if tuple(precipitation.dims) != ("lon", "lat"):
            raise ValueError("precipitation dimensions must be ('lon', 'lat')")
        if list(precipitation.shape) != window["gridShape"]:
            raise ValueError("NetCDF precipitation shape disagrees with cache metadata")
        longitude = [float(value) for value in dataset["lon"].values.tolist()]
        latitude = [float(value) for value in dataset["lat"].values.tolist()]
        if not all(math.isfinite(value) for value in longitude + latitude):
            raise ValueError("NetCDF coordinates must be finite")
        if longitude != sorted(longitude) or latitude != sorted(latitude):
            raise ValueError("NetCDF coordinates must be strictly ordered")
        if len(set(longitude)) != len(longitude) or len(set(latitude)) != len(latitude):
            raise ValueError("NetCDF coordinates must be unique")
        for coordinates, axis in ((longitude, "longitude"), (latitude, "latitude")):
            if any(
                abs((right - left) - 0.1) > 0.00001
                for left, right in zip(coordinates, coordinates[1:])
            ):
                raise ValueError(
                    f"NetCDF {axis} coordinates do not match 0.1 degree spacing"
                )
        loaded = window["loadedSpatialBounds"]
        coordinate_bounds = {
            "west": longitude[0] - 0.05,
            "south": latitude[0] - 0.05,
            "east": longitude[-1] + 0.05,
            "north": latitude[-1] + 0.05,
        }
        if any(
            abs(coordinate_bounds[key] - loaded[key]) > 0.00001
            for key in coordinate_bounds
        ):
            raise ValueError("NetCDF coordinates disagree with loadedSpatialBounds")
        raw_values = precipitation.values.tolist()
        values, flattened = finite_values(raw_values, "precipitation")
    return longitude, latitude, values, flattened


def materialize(data_root, metadata_path, netcdf_path):
    metadata = json.loads(metadata_path.read_text(encoding="utf8"))
    window = validate_metadata(metadata)
    longitude, latitude, values, flattened = validate_netcdf(netcdf_path, window)

    source_directory = data_root / "source" / "imerg" / "v07-forli-20230516-18"
    inputs_directory = data_root / "inputs"
    source_directory.mkdir(parents=True, exist_ok=True)
    inputs_directory.mkdir(parents=True, exist_ok=True)
    frozen_metadata = source_directory / "cache-metadata.json"
    frozen_netcdf = source_directory / "precipitation.nc"
    portable_grid = inputs_directory / "imerg-v07-final-48h-source-grid.json"
    atomic_copy(metadata_path, frozen_metadata)
    atomic_copy(netcdf_path, frozen_netcdf)

    source_artifacts = [
        artifact(data_root, frozen_metadata),
        artifact(data_root, frozen_netcdf),
    ]
    grid = {
        "schemaVersion": "canonical-imerg-source-grid-v0.1.0",
        "datasetId": "nasa-imerg-v07",
        "status": "available",
        "unit": "mm",
        "valueSemantics": "48-hour accumulated precipitation",
        "coordinateReferenceSystem": "EPSG:4326",
        "sourceResolution": window["sourceResolution"],
        "sourceTemporalResolution": "30 minute",
        "sourceGrid": {
            "longitude": longitude,
            "latitude": latitude,
            "valueOrder": "longitude_major_latitude_minor",
            "precipitationMm": values,
        },
        "spatial": {
            "requestedBounds": window["requestedSpatialBounds"],
            "loadedBounds": window["loadedSpatialBounds"],
            "samplingMethod": window["samplingMethod"],
        },
        "temporal": {
            "requestedWindowStart": window["requestedWindowStart"],
            "requestedWindowEnd": window["requestedWindowEnd"],
            "actualWindowStart": window["actualWindowStart"],
            "actualWindowEnd": window["actualWindowEnd"],
            "acquiredAt": window["acquiredAt"],
        },
        "provenance": {
            "provider": "NASA GES DISC via earthaccess",
            "dataset": window["product"],
            "datasetVersion": window["datasetVersion"],
            "archiveVersion": window["archiveVersion"],
            "runType": window["runType"],
            "granuleCount": window["granuleCount"],
            "expectedGranuleCount": window["expectedGranuleCount"],
            "granuleTimestamps": window["granuleTimestamps"],
            "canonicalAcquisitionPath": "nasa-precip-engine earthaccess + xarray",
            "transformation": "validated portable export of canonical persistent cache",
            "transformationVersion": "canonical-imerg-cache-export-v0.1.0",
            "sourceArtifacts": source_artifacts,
        },
        "statistics": {
            "finiteCells": len(flattened),
            "minimumMm": min(flattened),
            "maximumMm": max(flattened),
            "meanMm": sum(flattened) / len(flattened),
        },
    }
    atomic_json(portable_grid, grid)
    artifacts = source_artifacts + [artifact(data_root, portable_grid)]
    return {"grid": grid, "artifacts": artifacts}


def main():
    args = parse_args()
    if not args.data_root:
        raise ValueError("Set GEOLENS_BENCHMARK_DATA_ROOT or pass --data-root")
    result = materialize(
        Path(args.data_root).resolve(),
        Path(args.metadata).resolve(),
        Path(args.netcdf).resolve(),
    )
    print(
        json.dumps(
            {
                "status": result["grid"]["status"],
                "statistics": result["grid"]["statistics"],
                "artifacts": result["artifacts"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
