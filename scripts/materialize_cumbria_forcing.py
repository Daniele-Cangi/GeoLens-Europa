"""Materialize the frozen Cumbria IMERG and Sheepmount forcing series.

The command keeps native temporal resolution, retains source resolution and
turns no missing value into zero. It never reads flood-extent evaluation data
and never executes the numerical solver.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
NASA_ROOT = REPOSITORY_ROOT / "nasa-precip-engine"
sys.path.insert(0, str(NASA_ROOT))

from src.imerg_client import (  # noqa: E402
    ImergAcquisitionError,
    ImergSpatialBounds,
    load_imerg_series,
)


MANIFEST_PATH = (
    REPOSITORY_ROOT / "tests/ground-truth/cumbria-2015/manifest.json"
)
ACCEPTED_MANIFEST_VERSIONS = {"0.20.0", "0.21.0", "0.22.0"}
BASELINE_TAG = "pre-external-evidence-baseline-v1"
BASELINE_COMMIT = "938b18fb66925e36236ea04a49eefdb2ca9826cb"
PROTOCOL_ID = "cumbria-public-surface-flow-replacement-v0"
PROTOCOL_SHA256 = "b9db1fbc10cc0aeff5d3a4e24bf1afc5d66226902ecad92ce111f1fcfb60c89b"
EVENT_START = datetime(2015, 12, 4, tzinfo=timezone.utc)
EVENT_END = datetime(2015, 12, 7, tzinfo=timezone.utc)
IMERG_INTERVAL_SECONDS = 1800
IMERG_SAMPLES = 144
SHEEPMOUNT_INTERVAL_SECONDS = 900
SHEEPMOUNT_SAMPLES = 288
RECEIPT_FILE_NAME = "cumbria-public-baseline-forcing.receipt.json"
RECEIPT_SCHEMA = "cumbria-forcing-receipt-v0.1.0"
TRANSFORMATION_VERSION = "cumbria-time-varying-forcing-v0.1.0"
MAX_EA_RESPONSE_BYTES = 5 * 1024 * 1024


def parse_args(arguments: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--execute", action="store_true")
    mode.add_argument("--check", action="store_true")
    return parser.parse_args(arguments)


def ensure_external_data_root(data_root: Path) -> None:
    root = data_root.resolve()
    repository = REPOSITORY_ROOT.resolve()
    try:
        root.relative_to(repository)
    except ValueError:
        pass
    else:
        raise ValueError("Cumbria forcing data root must stay outside Git")
    if any(part.casefold() == "onedrive" for part in root.parts):
        raise ValueError("Cumbria forcing data root must stay outside OneDrive")


def read_manifest() -> dict[str, Any]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("manifestVersion") not in ACCEPTED_MANIFEST_VERSIONS:
        raise ValueError("Cumbria manifest version is not supported by forcing v0.1.0")
    replacement = manifest.get("replacementSolverProtocol", {})
    if (
        replacement.get("id") != PROTOCOL_ID
        or replacement.get("protocolSha256") != PROTOCOL_SHA256
    ):
        raise ValueError("Frozen Cumbria replacement-solver identity drifted")
    return manifest


def requested_bounds(manifest: dict[str, Any]) -> ImergSpatialBounds:
    boundary = manifest["publicBaselineProtocol"]["domain"]["wgs84Boundary"]
    longitude = [float(coordinate[0]) for coordinate in boundary]
    latitude = [float(coordinate[1]) for coordinate in boundary]
    return ImergSpatialBounds(
        west=min(longitude),
        south=min(latitude),
        east=max(longitude),
        north=max(latitude),
    )


def sheepmount_dataset(manifest: dict[str, Any]) -> dict[str, Any]:
    matches = [
        dataset
        for dataset in manifest["datasets"]
        if dataset.get("id") == "ea-hydrology-sheepmount-flow"
    ]
    if len(matches) != 1:
        raise ValueError("Sheepmount flow dataset must be declared exactly once")
    dataset = matches[0]
    audit = dataset["seriesAudit"]
    expected = {
        "stationReference": "765512",
        "intervalSeconds": SHEEPMOUNT_INTERVAL_SECONDS,
        "expectedReadings": SHEEPMOUNT_SAMPLES,
        "readings": SHEEPMOUNT_SAMPLES,
        "missingReadings": 0,
        "windowStart": iso(EVENT_START),
        "windowEndExclusive": iso(EVENT_END),
        "unit": "m3/s",
    }
    for field, value in expected.items():
        if audit.get(field) != value:
            raise ValueError(f"Sheepmount {field} drifted")
    if dataset.get("role") != "model_input_candidate":
        raise ValueError("Sheepmount is not a declared model-input candidate")
    uses = dataset.get("permittedUses", {})
    if uses != {
        "modelInput": True,
        "calibration": False,
        "observationComparison": False,
        "evaluation": False,
    }:
        raise ValueError("Sheepmount permitted uses drifted")
    return dataset


def expected_timestamps(start: datetime, count: int, seconds: int) -> list[str]:
    return [iso(start + timedelta(seconds=seconds * index)) for index in range(count)]


def parse_ea_readings(
    payload: dict[str, Any],
    *,
    start: datetime = EVENT_START,
    end: datetime = EVENT_END,
) -> tuple[list[str], np.ndarray]:
    items = payload.get("items")
    if not isinstance(items, list):
        raise ValueError("Environment Agency response has no readings list")
    by_timestamp: dict[str, float] = {}
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Environment Agency reading is not an object")
        observed_at = parse_datetime(item.get("dateTime"))
        if not start <= observed_at < end:
            continue
        timestamp = iso(observed_at)
        if timestamp in by_timestamp:
            raise ValueError(f"Duplicate Sheepmount reading at {timestamp}")
        value = item.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            try:
                value = float(value)
            except (TypeError, ValueError) as error:
                raise ValueError(
                    f"Non-numeric Sheepmount reading at {timestamp}"
                ) from error
        value = float(value)
        if not math.isfinite(value) or value < 0:
            raise ValueError(f"Invalid Sheepmount reading at {timestamp}")
        by_timestamp[timestamp] = value

    timestamps = expected_timestamps(start, SHEEPMOUNT_SAMPLES, SHEEPMOUNT_INTERVAL_SECONDS)
    missing = [timestamp for timestamp in timestamps if timestamp not in by_timestamp]
    if missing:
        raise ValueError(
            f"Sheepmount series has {len(missing)} missing intervals; first {missing[0]}"
        )
    if len(by_timestamp) != SHEEPMOUNT_SAMPLES:
        raise ValueError("Sheepmount series contains unexpected in-window timestamps")
    return timestamps, np.asarray([by_timestamp[value] for value in timestamps], dtype="<f8")


def positive_excess_discharge(values: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    if values.ndim != 1 or values.size != SHEEPMOUNT_SAMPLES:
        raise ValueError("Sheepmount forcing requires exactly 288 source samples")
    if not np.isfinite(values).all() or np.any(values < 0):
        raise ValueError("Sheepmount source samples must be finite and non-negative")
    baseline = float(values[0])
    excess = np.maximum(values.astype("<f8", copy=False) - baseline, 0.0)
    interval_volume = excess * SHEEPMOUNT_INTERVAL_SECONDS
    return baseline, excess.astype("<f8"), interval_volume.astype("<f8")


def fetch_json(url: str) -> dict[str, Any]:
    delays = (0, 2, 5, 10, 20)
    last_error: Exception | None = None
    for delay in delays:
        if delay:
            time.sleep(delay)
        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "GeoLens evidence materializer/0.1",
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                content_length = response.headers.get("Content-Length")
                if content_length and int(content_length) > MAX_EA_RESPONSE_BYTES:
                    raise ValueError("Environment Agency response exceeds byte limit")
                body = response.read(MAX_EA_RESPONSE_BYTES + 1)
                if len(body) > MAX_EA_RESPONSE_BYTES:
                    raise ValueError("Environment Agency response exceeds byte limit")
                payload = json.loads(body.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("Environment Agency response is not an object")
                return payload
        except HTTPError as error:
            last_error = error
            if error.code != 429:
                break
        except URLError as error:
            last_error = error
    raise RuntimeError(f"Environment Agency acquisition failed: {last_error}")


def acquire_imerg(manifest: dict[str, Any]) -> tuple[dict[str, Any], bytes]:
    bounds = requested_bounds(manifest)
    series = load_imerg_series(
        EVENT_END,
        72,
        dataset_version="07",
        allow_early=False,
        spatial_bounds=bounds,
        granule_cache_directory=(
            REPOSITORY_DATA_ROOT / "staging/imerg-half-hour-v07-cumbria"
        ),
    )
    metadata = series.metadata
    expected = expected_timestamps(EVENT_START, IMERG_SAMPLES, IMERG_INTERVAL_SECONDS)
    timestamps = [iso(value) for value in metadata.granule_timestamps]
    if (
        metadata.status != "available"
        or metadata.product != "GPM_3IMERGHH"
        or metadata.run_type != "final"
        or metadata.dataset_version != "07"
        or metadata.granule_count != IMERG_SAMPLES
        or timestamps != expected
        or tuple(series.data.dims) != ("time", "lon", "lat")
    ):
        raise ValueError("IMERG native forcing series is incomplete or drifted")
    values = np.asarray(series.data.values, dtype="<f4")
    if values.shape != (IMERG_SAMPLES, 4, 3):
        raise ValueError(f"Unexpected IMERG forcing shape {values.shape}")
    if not np.isfinite(values).all() or np.any(values < 0):
        raise ValueError("IMERG forcing contains missing or negative values")
    longitude = [float(value) for value in series.data["lon"].values.tolist()]
    latitude = [float(value) for value in series.data["lat"].values.tolist()]
    maximum_difference = validate_imerg_accumulation(
        manifest,
        values,
        longitude,
        latitude,
    )
    details = {
        "datasetId": "nasa-imerg-v07-final",
        "provider": "NASA GES DISC via earthaccess",
        "product": metadata.product,
        "runType": metadata.run_type,
        "datasetVersion": metadata.dataset_version,
        "archiveVersion": metadata.archive_version,
        "sourceResolution": metadata.source_resolution,
        "sourceIntervalSeconds": IMERG_INTERVAL_SECONDS,
        "timestamps": timestamps,
        "longitude": longitude,
        "latitude": latitude,
        "shape": list(values.shape),
        "valueOrder": "time_major_longitude_major_latitude_minor",
        "unit": "mm_per_30_minute_interval",
        "observedZeroPreserved": True,
        "acquiredAt": iso(metadata.acquired_at),
        "granuleCount": metadata.granule_count,
        "variableNames": list(metadata.variable_names),
        "maximumAccumulationDifferenceMm": maximum_difference,
        "minimumIntervalMm": float(np.min(values)),
        "maximumIntervalMm": float(np.max(values)),
        "totalAcrossNativeCellsMm": float(np.sum(values, dtype=np.float64)),
    }
    return details, values.tobytes(order="C")


def validate_imerg_accumulation(
    manifest: dict[str, Any],
    values: np.ndarray,
    longitude: list[float],
    latitude: list[float],
) -> float:
    materialization = manifest["publicBaselineEnvironmentalMaterialization"]["precipitation"]
    receipt_path = REPOSITORY_DATA_ROOT / materialization["receipt"]["fileName"]
    receipt_bytes = receipt_path.read_bytes()
    receipt = json.loads(receipt_bytes)
    receipt_without_hash = dict(receipt)
    receipt_hash = receipt_without_hash.pop("receiptSha256", None)
    if (
        receipt_hash != materialization["receipt"]["sha256"]
        or receipt_hash != sha256_json(receipt_without_hash)
    ):
        raise ValueError("Existing IMERG source receipt identity drifted")
    artifact = receipt["artifact"]
    artifact_path = REPOSITORY_DATA_ROOT / Path(artifact["relativePath"])
    artifact_bytes = artifact_path.read_bytes()
    if hashlib.sha256(artifact_bytes).hexdigest() != artifact["sha256"]:
        raise ValueError("Existing IMERG accumulation artifact drifted")
    accumulated = json.loads(artifact_bytes)
    grid = accumulated["sourceGrid"]
    if grid["longitude"] != longitude or grid["latitude"] != latitude:
        raise ValueError("IMERG forcing coordinates differ from the pinned accumulation")
    expected = np.asarray(grid["precipitationMm"], dtype=np.float64)
    # The frozen accumulation was produced by xarray from Float32 granules.
    # Reproduce that numeric order before comparing; a Float64 re-sum differs
    # by a few 1e-5 mm even when every source interval is byte-identical.
    actual = np.sum(values.astype(np.float32), axis=0, dtype=np.float32).astype(
        np.float64
    )
    difference = np.abs(actual - expected)
    maximum = float(np.max(difference))
    if not np.allclose(actual, expected, rtol=0.0, atol=0.000001):
        raise ValueError(
            f"IMERG temporal series does not reproduce pinned accumulation; max {maximum}"
        )
    return maximum


def artifact_descriptor(
    data_root: Path,
    label: str,
    raw: bytes,
    dtype: str,
    shape: list[int],
) -> tuple[dict[str, Any], bytes]:
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)
    sha256 = hashlib.sha256(compressed).hexdigest()
    content_sha256 = hashlib.sha256(raw).hexdigest()
    relative_path = Path("solver-inputs/forcing/sha256") / f"{sha256}.{label}.gz"
    return (
        {
            "relativePath": relative_path.as_posix(),
            "bytes": len(compressed),
            "decodedBytes": len(raw),
            "sha256": sha256,
            "contentSha256": content_sha256,
            "compression": "gzip_mtime_0_level_9",
            "dtype": dtype,
            "shape": shape,
        },
        compressed,
    )


def build_receipt(
    manifest: dict[str, Any],
    data_root: Path,
    sheepmount_payload: dict[str, Any],
) -> tuple[dict[str, Any], list[tuple[dict[str, Any], bytes]]]:
    dataset = sheepmount_dataset(manifest)
    sheep_timestamps, observed = parse_ea_readings(sheepmount_payload)
    audit = dataset["seriesAudit"]
    if (
        float(np.min(observed)) != float(audit["minimum"])
        or float(np.max(observed)) != float(audit["maximum"])
    ):
        raise ValueError("Sheepmount live values differ from the frozen source audit")
    baseline, excess, interval_volume = positive_excess_discharge(observed)
    imerg, imerg_raw = acquire_imerg(manifest)

    artifacts: list[tuple[dict[str, Any], bytes]] = []
    for label, raw, dtype, shape in (
        ("imerg-amount-mm-f32le", imerg_raw, "float32_little_endian", imerg["shape"]),
        ("sheepmount-observed-m3s-f64le", observed.tobytes(), "float64_little_endian", [SHEEPMOUNT_SAMPLES]),
        ("sheepmount-excess-m3s-f64le", excess.tobytes(), "float64_little_endian", [SHEEPMOUNT_SAMPLES]),
        ("sheepmount-excess-volume-m3-f64le", interval_volume.tobytes(), "float64_little_endian", [SHEEPMOUNT_SAMPLES]),
    ):
        descriptor, compressed = artifact_descriptor(data_root, label, raw, dtype, shape)
        artifacts.append((descriptor, compressed))

    imerg_artifact, observed_artifact, excess_artifact, volume_artifact = [
        value[0] for value in artifacts
    ]
    source_imerg = manifest["publicBaselineEnvironmentalMaterialization"]["precipitation"]
    solver_grids = manifest["publicBaselineSolverGridMaterialization"]
    receipt_without_hash = {
        "schemaVersion": RECEIPT_SCHEMA,
        "materializationId": "cumbria-public-time-varying-forcing-v0",
        "materializedAt": iso(datetime.now(timezone.utc)),
        "baseline": {"tag": BASELINE_TAG, "commit": BASELINE_COMMIT},
        "protocol": {
            "id": PROTOCOL_ID,
            "sha256": PROTOCOL_SHA256,
        },
        "transformationVersion": TRANSFORMATION_VERSION,
        "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "eventWindow": {
            "start": iso(EVENT_START),
            "endExclusive": iso(EVENT_END),
            "durationSeconds": int((EVENT_END - EVENT_START).total_seconds()),
        },
        "inputReceipts": {
            "imergAccumulation": source_imerg["receipt"]["sha256"],
            "solverGrids": solver_grids["receipt"]["sha256"],
        },
        "imerg": {
            **imerg,
            "transformation": "native_footprint_overlap_then_piecewise_constant_intensity",
            "spatialMappingState": "deferred_to_kernel_input_binding_source_resolution_retained",
            "missingPolicy": "cell_interval_missing_and_solver_execution_blocked",
            "artifact": imerg_artifact,
            "sourceGranulesCopied": False,
        },
        "sheepmount": {
            "datasetId": dataset["id"],
            "provider": dataset["publisher"],
            "station": audit["station"],
            "stationReference": audit["stationReference"],
            "measureNotation": audit["measureNotation"],
            "sourceUrl": dataset["access"]["url"],
            "license": dataset["license"],
            "sourceIntervalSeconds": SHEEPMOUNT_INTERVAL_SECONDS,
            "timestamps": sheep_timestamps,
            "sampleCount": SHEEPMOUNT_SAMPLES,
            "unit": "m3/s",
            "minimumObservedM3s": float(np.min(observed)),
            "maximumObservedM3s": float(np.max(observed)),
            "baselineFirstSampleM3s": baseline,
            "maximumExcessM3s": float(np.max(excess)),
            "totalExcessVolumeM3": float(np.sum(interval_volume, dtype=np.float64)),
            "temporalTransformation": "left_constant_over_native_900_second_interval",
            "dischargeTransformation": "positive_excess_above_first_window_sample",
            "transformationVersion": "sheepmount-incremental-discharge-v0.1.0",
            "sourceMeaning": "incremental_event_discharge_proxy_not_total_channel_flow",
            "missingSamplePolicy": "execution_blocked_no_gap_fill",
            "observedArtifact": observed_artifact,
            "excessArtifact": excess_artifact,
            "intervalVolumeArtifact": volume_artifact,
        },
        "isolation": {
            "observedFloodGeometryLoaded": False,
            "observedFloodGeometryUsed": False,
            "externalOwnerPackageLoaded": False,
            "h3UsedAsSourceOrSolverGrid": False,
            "missingValuesSubstitutedWithZero": False,
            "solverRuns": 0,
            "evaluationRuns": 0,
            "solverExecutionAuthorized": False,
        },
    }
    receipt = {
        **receipt_without_hash,
        "receiptSha256": sha256_json(receipt_without_hash),
    }
    return receipt, artifacts


def verify_artifact(data_root: Path, descriptor: dict[str, Any]) -> bytes:
    path = data_root / Path(descriptor["relativePath"])
    compressed = path.read_bytes()
    if len(compressed) != descriptor["bytes"]:
        raise ValueError(f"Forcing artifact byte count drifted: {path.name}")
    if hashlib.sha256(compressed).hexdigest() != descriptor["sha256"]:
        raise ValueError(f"Forcing artifact SHA-256 drifted: {path.name}")
    raw = gzip.decompress(compressed)
    if len(raw) != descriptor["decodedBytes"]:
        raise ValueError(f"Forcing artifact decoded bytes drifted: {path.name}")
    if hashlib.sha256(raw).hexdigest() != descriptor["contentSha256"]:
        raise ValueError(f"Forcing artifact content SHA-256 drifted: {path.name}")
    return raw


def verify_receipt(data_root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    receipt_path = data_root / RECEIPT_FILE_NAME
    receipt_bytes = receipt_path.read_bytes()
    receipt = json.loads(receipt_bytes)
    if receipt.get("schemaVersion") != RECEIPT_SCHEMA:
        raise ValueError("Cumbria forcing receipt schema drifted")
    receipt_without_hash = dict(receipt)
    actual_hash = receipt_without_hash.pop("receiptSha256", None)
    if actual_hash != sha256_json(receipt_without_hash):
        raise ValueError("Cumbria forcing receipt identity drifted")
    if receipt["baseline"] != {"tag": BASELINE_TAG, "commit": BASELINE_COMMIT}:
        raise ValueError("Cumbria forcing baseline drifted")
    if receipt["protocol"]["sha256"] != PROTOCOL_SHA256:
        raise ValueError("Cumbria forcing protocol drifted")
    if receipt["scriptSha256"] != hashlib.sha256(Path(__file__).read_bytes()).hexdigest():
        raise ValueError("Cumbria forcing script identity drifted")

    imerg = receipt["imerg"]
    imerg_raw = verify_artifact(data_root, imerg["artifact"])
    imerg_values = np.frombuffer(imerg_raw, dtype="<f4").reshape(imerg["shape"])
    validate_imerg_accumulation(
        manifest,
        imerg_values,
        imerg["longitude"],
        imerg["latitude"],
    )
    if imerg["timestamps"] != expected_timestamps(EVENT_START, IMERG_SAMPLES, IMERG_INTERVAL_SECONDS):
        raise ValueError("IMERG forcing timestamps drifted")

    sheepmount = receipt["sheepmount"]
    observed_raw = verify_artifact(data_root, sheepmount["observedArtifact"])
    excess_raw = verify_artifact(data_root, sheepmount["excessArtifact"])
    volume_raw = verify_artifact(data_root, sheepmount["intervalVolumeArtifact"])
    observed = np.frombuffer(observed_raw, dtype="<f8")
    recorded_excess = np.frombuffer(excess_raw, dtype="<f8")
    recorded_volume = np.frombuffer(volume_raw, dtype="<f8")
    baseline, excess, volume = positive_excess_discharge(observed)
    if not np.array_equal(recorded_excess, excess) or not np.array_equal(recorded_volume, volume):
        raise ValueError("Sheepmount derived forcing drifted")
    if baseline != sheepmount["baselineFirstSampleM3s"]:
        raise ValueError("Sheepmount baseline drifted")
    if sheepmount["timestamps"] != expected_timestamps(
        EVENT_START, SHEEPMOUNT_SAMPLES, SHEEPMOUNT_INTERVAL_SECONDS
    ):
        raise ValueError("Sheepmount forcing timestamps drifted")
    return receipt


def persist_artifact(data_root: Path, descriptor: dict[str, Any], value: bytes) -> None:
    path = data_root / Path(descriptor["relativePath"])
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != value:
            raise ValueError(f"Content-addressed forcing artifact drifted: {path}")
        return
    temporary = path.with_suffix(path.suffix + f".{os.getpid()}.part")
    temporary.write_bytes(value)
    os.replace(temporary, path)


def write_receipt(data_root: Path, receipt: dict[str, Any]) -> Path:
    path = data_root / RECEIPT_FILE_NAME
    if path.exists():
        raise ValueError("Cumbria forcing receipt already exists; use --check")
    staging = data_root / "staging"
    staging.mkdir(parents=True, exist_ok=True)
    temporary = staging / f"{path.name}.{os.getpid()}.part"
    temporary.write_bytes(normalized_json(receipt))
    os.replace(temporary, path)
    return path


def run(arguments: list[str] | None = None) -> dict[str, Any]:
    global REPOSITORY_DATA_ROOT
    options = parse_args(arguments)
    data_root = Path(options.data_root).resolve()
    REPOSITORY_DATA_ROOT = data_root
    ensure_external_data_root(data_root)
    manifest = read_manifest()
    mode = "execute" if options.execute else "check" if options.check else "dry_run"
    plan = {
        "schemaVersion": "cumbria-forcing-materialization-plan-v0.1.0",
        "materializationId": "cumbria-public-time-varying-forcing-v0",
        "mode": mode,
        "dataRoot": str(data_root),
        "baseline": {"tag": BASELINE_TAG, "commit": BASELINE_COMMIT},
        "protocol": {"id": PROTOCOL_ID, "sha256": PROTOCOL_SHA256},
        "eventWindow": {"start": iso(EVENT_START), "endExclusive": iso(EVENT_END)},
        "sources": {
            "imerg": {"samples": IMERG_SAMPLES, "intervalSeconds": IMERG_INTERVAL_SECONDS},
            "sheepmount": {"samples": SHEEPMOUNT_SAMPLES, "intervalSeconds": SHEEPMOUNT_INTERVAL_SECONDS},
        },
        "evaluationGeometryLoaded": False,
        "solverRuns": 0,
    }
    if mode == "dry_run":
        return {**plan, "networkRequestsStarted": 0, "filesWritten": 0}
    receipt_path = data_root / RECEIPT_FILE_NAME
    if mode == "check" or receipt_path.exists():
        receipt = verify_receipt(data_root, manifest)
        return {
            **plan,
            "state": "time_varying_forcing_verified_execution_blocked",
            "receiptPath": str(receipt_path),
            "receiptSha256": receipt["receiptSha256"],
            "networkRequestsStarted": 0,
            "filesWritten": 0,
            "imerg": forcing_summary(receipt["imerg"]),
            "sheepmount": forcing_summary(receipt["sheepmount"]),
        }

    dataset = sheepmount_dataset(manifest)
    sheepmount_payload = fetch_json(dataset["access"]["url"])
    receipt, artifacts = build_receipt(manifest, data_root, sheepmount_payload)
    for descriptor, value in artifacts:
        persist_artifact(data_root, descriptor, value)
    written_receipt = write_receipt(data_root, receipt)
    verify_receipt(data_root, manifest)
    return {
        **plan,
        "state": "time_varying_forcing_materialized_execution_blocked",
        "receiptPath": str(written_receipt),
        "receiptSha256": receipt["receiptSha256"],
        "networkAcquisitionPerformed": True,
        "filesWritten": len(artifacts) + 1,
        "imerg": forcing_summary(receipt["imerg"]),
        "sheepmount": forcing_summary(receipt["sheepmount"]),
    }


def forcing_summary(value: dict[str, Any]) -> dict[str, Any]:
    if value.get("datasetId") == "nasa-imerg-v07-final":
        return {
            "sampleCount": value["granuleCount"],
            "shape": value["shape"],
            "minimumIntervalMm": value["minimumIntervalMm"],
            "maximumIntervalMm": value["maximumIntervalMm"],
            "maximumAccumulationDifferenceMm": value["maximumAccumulationDifferenceMm"],
        }
    return {
        "sampleCount": value["sampleCount"],
        "minimumObservedM3s": value["minimumObservedM3s"],
        "maximumObservedM3s": value["maximumObservedM3s"],
        "baselineFirstSampleM3s": value["baselineFirstSampleM3s"],
        "maximumExcessM3s": value["maximumExcessM3s"],
        "totalExcessVolumeM3": value["totalExcessVolumeM3"],
    }


def parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError("Reading timestamp must be a non-empty string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def normalized_json(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def sha256_json(value: dict[str, Any]) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


REPOSITORY_DATA_ROOT = Path()


def main() -> None:
    try:
        print(json.dumps(run(), indent=2, sort_keys=True))
    except ImergAcquisitionError as error:
        print(
            json.dumps(
                {"status": error.status, "missingReason": str(error)},
                indent=2,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
