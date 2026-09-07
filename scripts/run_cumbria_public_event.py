#!/usr/bin/env python3
"""Preflight, authorize and execute the frozen public Cumbria event replay.

The default mode is read-only preflight. ``--freeze`` writes only an execution
authorization tied to a clean Git revision and verified input receipts.
``--execute`` requires that authorization before running every frozen scenario.
Observed flood geometry is never referenced by this module.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterator, Sequence
from dataclasses import asdict
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
from pathlib import Path
import platform
import subprocess
import sys
from typing import Any

import numpy as np


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ENGINE_ROOT = REPOSITORY_ROOT / "surface-flow-engine"
sys.path.insert(0, str(ENGINE_ROOT))

from surface_flow.local_inertial import (  # noqa: E402
    ForcingInterval,
    LocalInertialParameters,
    run_local_inertial,
)


MANIFEST_PATH = (
    REPOSITORY_ROOT / "tests" / "ground-truth" / "cumbria-2015" / "manifest.json"
)
AUTHORIZATION_FILE = "cumbria-public-storm-desmond-v0.authorization.json"
PREDICTION_RECEIPT_FILE = "cumbria-public-storm-desmond-v0.prediction.receipt.json"
FLOAT64_NODATA = -np.finfo(np.float64).max
UINT16_NODATA = np.iinfo(np.uint16).max
UINT8_NODATA = np.iinfo(np.uint8).max
TIME_TOLERANCE_S = 1e-9


class EventRunnerError(RuntimeError):
    """Raised when the event run would violate its frozen contract."""


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def parse_arguments(arguments: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--freeze", action="store_true")
    mode.add_argument("--execute", action="store_true")
    return parser.parse_args(arguments)


def ensure_external_data_root(requested: Path) -> Path:
    root = requested.expanduser().resolve()
    repository = REPOSITORY_ROOT.resolve()
    if root == repository or repository in root.parents:
        raise EventRunnerError("Cumbria data root must be outside the Git repository")
    if any(part.casefold() == "onedrive" for part in root.parts):
        raise EventRunnerError("Cumbria data root must be outside OneDrive")
    if not root.is_dir():
        raise EventRunnerError("Cumbria data root does not exist")
    return root


def compact_json_source(source: str) -> str:
    result: list[str] = []
    in_string = False
    escaped = False
    for character in source:
        if in_string:
            result.append(character)
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
        elif character == '"':
            in_string = True
            result.append(character)
        elif not character.isspace():
            result.append(character)
    if in_string:
        raise EventRunnerError("Receipt contains an unterminated JSON string")
    return "".join(result)


def receipt_payload_source(source: str, field: str, identity: str) -> str:
    compact = compact_json_source(source)
    property_text = f'"{field}":"{identity}"'
    start = compact.find(property_text)
    if start < 0 or compact.find(property_text, start + 1) >= 0:
        raise EventRunnerError(f"Receipt must contain exactly one {field} property")
    end = start + len(property_text)
    if start > 0 and compact[start - 1] == ",":
        return compact[: start - 1] + compact[end:]
    if end < len(compact) and compact[end] == ",":
        return compact[:start] + compact[end + 1 :]
    raise EventRunnerError(f"Receipt {field} property cannot be removed safely")


def read_and_verify_receipt(path: Path, expected_sha256: str) -> dict[str, Any]:
    if not path.is_file():
        raise EventRunnerError(f"Required receipt is missing: {path.name}")
    source = path.read_text(encoding="utf-8")
    receipt = json.loads(source)
    identity = receipt.get("receiptSha256")
    if identity != expected_sha256:
        raise EventRunnerError(f"{path.name} receipt identity drifted")
    payload_source = receipt_payload_source(source, "receiptSha256", identity)
    if sha256_bytes(payload_source.encode("utf-8")) != identity:
        raise EventRunnerError(f"{path.name} receipt content hash is invalid")
    return receipt


def artifact_descriptors(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, dict):
        if {
            "relativePath",
            "bytes",
            "decodedBytes",
            "sha256",
            "contentSha256",
        }.issubset(value):
            yield value
            return
        for child in value.values():
            yield from artifact_descriptors(child)
    elif isinstance(value, list):
        for child in value:
            yield from artifact_descriptors(child)


def resolve_artifact_path(data_root: Path, relative_path: str) -> Path:
    if not isinstance(relative_path, str) or "\\" in relative_path:
        raise EventRunnerError("Artifact path is not portable")
    target = (data_root / relative_path).resolve()
    if target == data_root or data_root not in target.parents:
        raise EventRunnerError("Artifact path escapes the Cumbria data root")
    return target


def verify_artifact(
    data_root: Path,
    descriptor: dict[str, Any],
    decoded_cache: dict[str, bytes],
) -> bytes:
    identity = descriptor["sha256"]
    cached = decoded_cache.get(identity)
    if cached is not None:
        return cached
    target = resolve_artifact_path(data_root, descriptor["relativePath"])
    if not target.is_file() or target.stat().st_size != descriptor["bytes"]:
        raise EventRunnerError(f"Artifact byte count drifted: {descriptor['relativePath']}")
    compressed = target.read_bytes()
    if sha256_bytes(compressed) != identity:
        raise EventRunnerError(f"Artifact SHA-256 drifted: {descriptor['relativePath']}")
    try:
        decoded = gzip.decompress(compressed)
    except gzip.BadGzipFile as error:
        raise EventRunnerError(
            f"Artifact is not valid deterministic gzip: {descriptor['relativePath']}"
        ) from error
    if len(decoded) != descriptor["decodedBytes"]:
        raise EventRunnerError(f"Decoded byte count drifted: {descriptor['relativePath']}")
    if sha256_bytes(decoded) != descriptor["contentSha256"]:
        raise EventRunnerError(f"Artifact content SHA-256 drifted: {descriptor['relativePath']}")
    decoded_cache[identity] = decoded
    return decoded


def contract_sha256(contract: dict[str, Any]) -> str:
    payload = dict(contract)
    identity = payload.pop("contractSha256", None)
    if not isinstance(identity, str):
        raise EventRunnerError("Event-runner contract identity is missing")
    actual = sha256_json(payload)
    if actual != identity:
        raise EventRunnerError("Event-runner contract SHA-256 drifted")
    return actual


def preflight(data_root: Path) -> dict[str, Any]:
    root = ensure_external_data_root(data_root)
    manifest_source = MANIFEST_PATH.read_bytes()
    manifest = json.loads(manifest_source)
    if manifest.get("manifestVersion") != "0.24.0":
        raise EventRunnerError("Cumbria event runner requires manifest v0.24.0")
    contract = manifest["publicBaselineEventRunnerContract"]
    identity = contract_sha256(contract)

    runner = contract["runner"]
    source_paths = {
        "entrypointSha256": REPOSITORY_ROOT / runner["entrypoint"],
        "kernelModuleSha256": REPOSITORY_ROOT / runner["kernelModule"],
        "fixtureModuleSha256": REPOSITORY_ROOT / runner["fixtureModule"],
    }
    for field, source_path in source_paths.items():
        if sha256_file(source_path) != runner[field]:
            raise EventRunnerError(f"Event-runner source identity drifted: {field}")

    receipts = contract["inputReceipts"]
    solver = read_and_verify_receipt(
        root / receipts["solverGrids"]["fileName"], receipts["solverGrids"]["sha256"]
    )
    forcing = read_and_verify_receipt(
        root / receipts["forcing"]["fileName"], receipts["forcing"]["sha256"]
    )
    binding = read_and_verify_receipt(
        root / receipts["eventInputBinding"]["fileName"],
        receipts["eventInputBinding"]["sha256"],
    )
    if (
        binding["sourceReceipts"]["solverGrids"]["sha256"]
        != solver["receiptSha256"]
        or binding["sourceReceipts"]["forcing"]["sha256"]
        != forcing["receiptSha256"]
    ):
        raise EventRunnerError("Event-input receipt source identities drifted")
    if binding["kernel"]["moduleSha256"] != runner["kernelModuleSha256"]:
        raise EventRunnerError("Event-input binding uses another numerical kernel")

    scenario_ids = [item["scenarioId"] for item in binding["scenarioBindings"]]
    if scenario_ids != contract["scenarioPolicy"]["orderedScenarioIds"]:
        raise EventRunnerError("Frozen scenario order drifted")

    decoded: dict[str, bytes] = {}
    artifact_count = 0
    for receipt in (solver, forcing, binding):
        for descriptor in artifact_descriptors(receipt):
            verify_artifact(root, descriptor, decoded)
            artifact_count += 1

    temporal = binding["temporalBinding"]
    schedule = contract["schedule"]
    expected_schedule = {
        "eventStart": temporal["eventStart"],
        "eventEndExclusive": temporal["eventEndExclusive"],
        "durationSeconds": temporal["durationSeconds"],
        "forcingIntervalSeconds": temporal["combinedIntervalSeconds"],
        "forcingIntervalCount": temporal["combinedIntervalCount"],
        "outputIntervalSeconds": temporal["outputIntervalSeconds"],
        "outputCount": temporal["combinedIntervalCount"],
    }
    if schedule != expected_schedule:
        raise EventRunnerError("Event-runner schedule drifted from input binding")

    return {
        "root": root,
        "manifest": manifest,
        "manifestSha256": sha256_bytes(manifest_source),
        "contract": contract,
        "contractSha256": identity,
        "solverReceipt": solver,
        "forcingReceipt": forcing,
        "bindingReceipt": binding,
        "decodedArtifacts": decoded,
        "artifactDescriptorCount": artifact_count,
        "uniqueArtifactCount": len(decoded),
    }


def git_value(*arguments: str) -> str:
    process = subprocess.run(
        ["git", *arguments],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return process.stdout.strip()


def clean_git_identity(contract: dict[str, Any]) -> dict[str, str]:
    status = git_value("status", "--porcelain", "--untracked-files=all")
    if status:
        raise EventRunnerError("Execution authorization requires a clean Git tree")
    branch = git_value("branch", "--show-current")
    if branch not in contract["authorization"]["allowedBranches"]:
        raise EventRunnerError("Current Git branch is not allowed by the runner contract")
    return {
        "commit": git_value("rev-parse", "HEAD"),
        "tree": git_value("rev-parse", "HEAD^{tree}"),
        "branch": branch,
    }


def authorization_payload(context: dict[str, Any]) -> dict[str, Any]:
    contract = context["contract"]
    git_identity = clean_git_identity(contract)
    return {
        "schemaVersion": "cumbria-event-run-authorization-v0.1.0",
        "authorizationId": contract["authorization"]["id"],
        "authorizedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "state": "authorized_not_executed",
        "baseline": contract["baseline"],
        "protocol": contract["protocol"],
        "contractSha256": context["contractSha256"],
        "manifestSha256": context["manifestSha256"],
        "git": git_identity,
        "sourceIdentities": {
            "entrypointSha256": contract["runner"]["entrypointSha256"],
            "kernelModuleSha256": contract["runner"]["kernelModuleSha256"],
            "fixtureModuleSha256": contract["runner"]["fixtureModuleSha256"],
        },
        "inputReceiptSha256": {
            name: item["sha256"] for name, item in contract["inputReceipts"].items()
        },
        "orderedScenarioIds": contract["scenarioPolicy"]["orderedScenarioIds"],
        "outputContract": contract["outputs"],
        "isolation": {
            "observedFloodGeometryLoaded": False,
            "evaluationReferenceAccessAllowed": False,
            "networkRequests": 0,
            "solverRuns": 0,
            "predictionArtifactsCreated": 0,
        },
    }


def write_exclusive_json(path: Path, payload: dict[str, Any]) -> None:
    serialized = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if path.exists():
        if path.read_text(encoding="utf-8") != serialized:
            raise EventRunnerError(f"Existing {path.name} differs from frozen output")
        return
    path.write_text(serialized, encoding="utf-8", newline="\n")


def freeze_authorization(context: dict[str, Any]) -> dict[str, Any]:
    payload = authorization_payload(context)
    authorization = dict(payload)
    authorization["authorizationSha256"] = sha256_json(payload)
    target = context["root"] / AUTHORIZATION_FILE
    write_exclusive_json(target, authorization)
    return authorization


def read_authorization(context: dict[str, Any]) -> dict[str, Any]:
    target = context["root"] / AUTHORIZATION_FILE
    if not target.is_file():
        raise EventRunnerError("Frozen event-run authorization is missing")
    authorization = json.loads(target.read_text(encoding="utf-8"))
    identity = authorization.pop("authorizationSha256", None)
    if not isinstance(identity, str) or sha256_json(authorization) != identity:
        raise EventRunnerError("Event-run authorization content identity is invalid")
    authorization["authorizationSha256"] = identity
    if authorization["contractSha256"] != context["contractSha256"]:
        raise EventRunnerError("Event-run authorization targets another contract")
    if authorization["manifestSha256"] != context["manifestSha256"]:
        raise EventRunnerError("Manifest changed after event-run authorization")
    if authorization["git"] != clean_git_identity(context["contract"]):
        raise EventRunnerError("Git revision changed after event-run authorization")
    return authorization


def array_from_descriptor(
    context: dict[str, Any], descriptor: dict[str, Any], dtype: str, shape: tuple[int, ...]
) -> np.ndarray:
    decoded = verify_artifact(
        context["root"], descriptor, context["decodedArtifacts"]
    )
    array = np.frombuffer(decoded, dtype=np.dtype(dtype))
    if array.size != math.prod(shape):
        raise EventRunnerError("Decoded artifact shape is inconsistent")
    return array.reshape(shape).copy()


class BoundEventForcing(Sequence[ForcingInterval]):
    """Generate one spatial forcing frame at a time from frozen bindings."""

    def __init__(
        self,
        interval_count: int,
        interval_seconds: float,
        rainfall_amount_mm: np.ndarray,
        rainfall_offsets: np.ndarray,
        rainfall_source_indices: np.ndarray,
        rainfall_area_fractions: np.ndarray,
        runoff_coefficient: np.ndarray,
        river_excess_m3_s: np.ndarray,
        river_cell_indices: np.ndarray,
        river_weights: np.ndarray,
        valid_mask: np.ndarray,
    ) -> None:
        self.interval_count = interval_count
        self.interval_seconds = interval_seconds
        self.rainfall_amount_mm = rainfall_amount_mm
        self.rainfall_offsets = rainfall_offsets
        self.rainfall_source_indices = rainfall_source_indices
        self.rainfall_area_fractions = rainfall_area_fractions
        self.runoff_coefficient = runoff_coefficient
        self.river_excess_m3_s = river_excess_m3_s
        self.river_cell_indices = river_cell_indices
        self.river_weights = river_weights
        self.valid_mask = valid_mask
        self.shape = valid_mask.shape
        counts = np.diff(rainfall_offsets)
        self.mapping_cell_indices = np.repeat(
            np.arange(valid_mask.size, dtype=np.int64), counts
        )
        if self.mapping_cell_indices.size != rainfall_source_indices.size:
            raise EventRunnerError("Rainfall CSR arrays are inconsistent")

    def __len__(self) -> int:
        return self.interval_count

    def __getitem__(self, index: int) -> ForcingInterval:
        if index < 0:
            index += len(self)
        if index < 0 or index >= len(self):
            raise IndexError(index)
        source_amounts = self.rainfall_amount_mm[index // 2].reshape(-1)
        contributions = (
            source_amounts[self.rainfall_source_indices]
            * self.rainfall_area_fractions
        )
        amount_by_cell = np.bincount(
            self.mapping_cell_indices,
            weights=contributions,
            minlength=self.valid_mask.size,
        ).reshape(self.shape)
        rainfall_rate = np.zeros(self.shape, dtype=np.float64)
        rainfall_rate[self.valid_mask] = (
            amount_by_cell[self.valid_mask]
            / 1000.0
            / 1800.0
            * self.runoff_coefficient[self.valid_mask]
        )
        river_rate = np.zeros(self.shape, dtype=np.float64)
        np.add.at(
            river_rate.reshape(-1),
            self.river_cell_indices,
            self.river_excess_m3_s[index] * self.river_weights,
        )
        return ForcingInterval(
            start_s=index * self.interval_seconds,
            end_s=(index + 1) * self.interval_seconds,
            rainfall_rate_m_s=rainfall_rate,
            river_inflow_m3_s=river_rate,
        )


def find_mesh(receipt: dict[str, Any], mesh_id: str) -> dict[str, Any]:
    match = next((item for item in receipt["meshes"] if item["id"] == mesh_id), None)
    if match is None:
        raise EventRunnerError(f"Receipt does not contain mesh {mesh_id}")
    return match


def find_river_mapping(mesh: dict[str, Any], side_metres: int) -> dict[str, Any]:
    match = next(
        (item for item in mesh["riverMappings"] if item["sideMetres"] == side_metres),
        None,
    )
    if match is None:
        raise EventRunnerError("Scenario river-footprint binding is missing")
    return match


def parameter_artifact_name(prefix: str, parameter_set: str) -> str:
    return prefix + parameter_set[:1].upper() + parameter_set[1:]


def prepare_scenario(context: dict[str, Any], scenario: dict[str, Any]) -> dict[str, Any]:
    solver_mesh = find_mesh(context["solverReceipt"], scenario["meshId"])
    binding_mesh = find_mesh(context["bindingReceipt"], scenario["meshId"])
    height = solver_mesh["height"]
    width = solver_mesh["width"]
    shape = (height, width)
    artifacts = solver_mesh["artifacts"]
    elevation = array_from_descriptor(context, artifacts["elevationM"], "<f4", shape).astype(
        np.float64
    )
    valid = array_from_descriptor(context, artifacts["solverValidMask"], "u1", shape) == 1
    eligible = (
        array_from_descriptor(context, artifacts["predictionEligibleMask"], "u1", shape)
        == 1
    )
    elevation[~valid] = np.nan
    runoff_name = parameter_artifact_name(
        "runoffCoefficient", scenario["runoffParameterSet"]
    )
    manning_name = parameter_artifact_name("manningN", scenario["roughnessParameterSet"])
    runoff = array_from_descriptor(context, artifacts[runoff_name], "<f4", shape).astype(
        np.float64
    )
    manning = array_from_descriptor(context, artifacts[manning_name], "<f4", shape).astype(
        np.float64
    )
    if np.any(~np.isfinite(runoff[valid])) or np.any((runoff[valid] < 0) | (runoff[valid] > 1)):
        raise EventRunnerError("Runoff coefficients are invalid on solver-valid cells")
    if np.any(~np.isfinite(manning[valid])) or np.any(manning[valid] <= 0):
        raise EventRunnerError("Manning coefficients are invalid on solver-valid cells")

    rain = context["forcingReceipt"]["imerg"]
    rainfall = array_from_descriptor(
        context, rain["artifact"], "<f4", tuple(rain["shape"])
    ).astype(np.float64)
    sheepmount = context["forcingReceipt"]["sheepmount"]
    river = array_from_descriptor(
        context, sheepmount["excessArtifact"], "<f8", (sheepmount["sampleCount"],)
    )
    rain_mapping = binding_mesh["rainfallMapping"]
    offsets = array_from_descriptor(
        context,
        rain_mapping["artifacts"]["offsets"],
        "<u4",
        (solver_mesh["cellCount"] + 1,),
    ).astype(np.int64)
    source_indices = array_from_descriptor(
        context,
        rain_mapping["artifacts"]["sourceIndices"],
        "u1",
        (rain_mapping["mappingEntryCount"],),
    ).astype(np.int64)
    fractions = array_from_descriptor(
        context,
        rain_mapping["artifacts"]["areaFractions"],
        "<f8",
        (rain_mapping["mappingEntryCount"],),
    )
    river_mapping = find_river_mapping(
        binding_mesh, scenario["inflowFootprintSideMetres"]
    )
    river_indices = array_from_descriptor(
        context,
        river_mapping["artifacts"]["cellIndices"],
        "<u4",
        (river_mapping["cellCount"],),
    ).astype(np.int64)
    river_weights = array_from_descriptor(
        context,
        river_mapping["artifacts"]["weights"],
        "<f8",
        (river_mapping["cellCount"],),
    )
    if not np.all(eligible <= valid):
        raise EventRunnerError("Prediction-eligible mask escapes solver-valid terrain")

    schedule = context["contract"]["schedule"]
    forcing = BoundEventForcing(
        schedule["forcingIntervalCount"],
        float(schedule["forcingIntervalSeconds"]),
        rainfall,
        offsets,
        source_indices,
        fractions,
        runoff,
        river,
        river_indices,
        river_weights,
        valid,
    )
    return {
        "solverMesh": solver_mesh,
        "elevation": elevation,
        "valid": valid,
        "eligible": eligible,
        "manning": manning,
        "forcing": forcing,
    }


def encoded_artifact(
    relative_name: str, decoded: bytes, encoding: str, no_data: int | float | None = None
) -> tuple[dict[str, Any], bytes]:
    compressed = gzip.compress(decoded, compresslevel=9, mtime=0)
    identity = sha256_bytes(compressed)
    descriptor: dict[str, Any] = {
        "relativePath": f"predictions/sha256/{identity}.{relative_name}.gz",
        "bytes": len(compressed),
        "decodedBytes": len(decoded),
        "sha256": identity,
        "contentSha256": sha256_bytes(decoded),
        "encoding": encoding,
    }
    if no_data is not None:
        descriptor["noData"] = no_data
    return descriptor, compressed


def persist_artifact(data_root: Path, descriptor: dict[str, Any], compressed: bytes) -> None:
    target = resolve_artifact_path(data_root, descriptor["relativePath"])
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.read_bytes() != compressed:
            raise EventRunnerError(f"Existing prediction artifact drifted: {target.name}")
        return
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_bytes(compressed)
    temporary.replace(target)


def run_scenario(context: dict[str, Any], scenario: dict[str, Any]) -> dict[str, Any]:
    prepared = prepare_scenario(context, scenario)
    shape = prepared["valid"].shape
    maximum_depth = np.zeros(shape, dtype=np.float64)
    time_of_maximum = np.zeros(shape, dtype=np.uint16)
    output_index = 0
    output_interval = context["contract"]["schedule"]["outputIntervalSeconds"]

    def observe(time_s: float, depth: np.ndarray) -> None:
        nonlocal output_index
        output_index += 1
        expected = output_index * output_interval
        if abs(time_s - expected) > TIME_TOLERANCE_S:
            raise EventRunnerError("Kernel emitted an off-schedule output")
        increased = prepared["valid"] & (depth > maximum_depth)
        maximum_depth[increased] = depth[increased]
        time_of_maximum[increased] = output_index

    numerics = context["contract"]["numerics"]
    parameters = LocalInertialParameters(
        cell_size_m=float(prepared["solverMesh"]["cellSizeMetres"]),
        manning_n=prepared["manning"],
        gravity_m_s2=numerics["gravityMps2"],
        cfl=numerics["cfl"],
        min_timestep_s=numerics["minimumTimeStepSeconds"],
        max_timestep_s=numerics["maximumTimeStepSeconds"],
        minimum_wet_depth_m=numerics["minimumWetDepthM"],
        absolute_mass_tolerance_m3=context["contract"]["massBalance"][
            "absoluteToleranceM3"
        ],
        relative_mass_tolerance=context["contract"]["massBalance"][
            "relativeTolerance"
        ],
    )
    result = run_local_inertial(
        prepared["elevation"],
        prepared["forcing"],
        context["contract"]["schedule"]["durationSeconds"],
        output_interval,
        parameters,
        retain_depth_snapshots=False,
        output_observer=observe,
    )
    if output_index != context["contract"]["schedule"]["outputCount"]:
        raise EventRunnerError("Kernel output count drifted")
    timestep = np.asarray(result.timestep_history_s, dtype=np.float64)
    if timestep.size == 0 or np.any(~np.isfinite(timestep)):
        raise EventRunnerError("Kernel timestep history is invalid")
    if (
        float(np.min(timestep)) < numerics["minimumTimeStepSeconds"] - TIME_TOLERANCE_S
        or float(np.max(timestep)) > numerics["maximumTimeStepSeconds"] + TIME_TOLERANCE_S
        or abs(float(np.sum(timestep)) - context["contract"]["schedule"]["durationSeconds"])
        > 1e-6
    ):
        raise EventRunnerError("Kernel stability or exact-time contract failed")

    mass = result.mass_balance
    if abs(mass.residual_m3) > mass.tolerance_m3:
        raise EventRunnerError("Scenario mass-balance tolerance failed")
    if np.any(~np.isfinite(result.final_depth_m[prepared["valid"]])) or np.any(
        result.final_depth_m[prepared["valid"]] < 0
    ):
        raise EventRunnerError("Scenario produced invalid final depths")

    eligible = prepared["eligible"]
    output_maximum = np.full(shape, FLOAT64_NODATA, dtype="<f8")
    output_final = np.full(shape, FLOAT64_NODATA, dtype="<f8")
    output_time = np.full(shape, UINT16_NODATA, dtype="<u2")
    output_maximum[eligible] = maximum_depth[eligible]
    output_final[eligible] = result.final_depth_m[eligible]
    output_time[eligible] = time_of_maximum[eligible]
    prediction_mask = eligible.astype("u1")

    artifacts: dict[str, dict[str, Any]] = {}
    encoded: list[tuple[dict[str, Any], bytes]] = []
    for name, array, suffix, encoding, no_data in (
        ("maximumDepthM", output_maximum, "maximum-depth-m-f64le", "gzip-compressed f64le, row-major north-to-south", FLOAT64_NODATA),
        ("timeOfMaximumIndex", output_time, "time-of-maximum-index-u16le", "gzip-compressed u16le, row-major north-to-south", int(UINT16_NODATA)),
        ("finalDepthM", output_final, "final-depth-m-f64le", "gzip-compressed f64le, row-major north-to-south", FLOAT64_NODATA),
        ("validPredictionMask", prediction_mask, "valid-prediction-mask-u8", "gzip-compressed u8, row-major north-to-south", None),
    ):
        descriptor, compressed = encoded_artifact(suffix, array.tobytes(order="C"), encoding, no_data)
        artifacts[name] = descriptor
        encoded.append((descriptor, compressed))

    for threshold in context["contract"]["outputs"]["wetnessThresholdsM"]:
        wet = np.full(shape, UINT8_NODATA, dtype="u1")
        wet[eligible] = (maximum_depth[eligible] >= threshold).astype("u1")
        key = "wetMask" + str(threshold).replace("0.", "") + "m"
        descriptor, compressed = encoded_artifact(
            f"wet-at-{threshold:g}m-mask-u8",
            wet.tobytes(order="C"),
            "gzip-compressed u8 (0 dry, 1 wet, 255 missing), row-major north-to-south",
            int(UINT8_NODATA),
        )
        artifacts[key] = descriptor
        encoded.append((descriptor, compressed))

    for descriptor, compressed in encoded:
        persist_artifact(context["root"], descriptor, compressed)

    return {
        "scenarioId": scenario["scenarioId"],
        "meshId": scenario["meshId"],
        "runoffParameterSet": scenario["runoffParameterSet"],
        "roughnessParameterSet": scenario["roughnessParameterSet"],
        "inflowFootprintSideMetres": scenario["inflowFootprintSideMetres"],
        "outputCount": output_index,
        "timestep": {
            "count": int(timestep.size),
            "minimumSeconds": float(np.min(timestep)),
            "maximumSeconds": float(np.max(timestep)),
            "sumSeconds": float(np.sum(timestep)),
        },
        "massBalance": {
            "initialVolumeM3": mass.initial_storage_m3,
            "rainfallExcessInputM3": mass.rainfall_input_m3,
            "riverExcessInputM3": mass.river_input_m3,
            "boundaryOutflowM3": mass.boundary_output_m3,
            "finalStorageM3": mass.final_storage_m3,
            "residualM3": mass.residual_m3,
            "toleranceM3": mass.tolerance_m3,
            "passed": True,
        },
        "predictionEligibleCellCount": int(np.count_nonzero(eligible)),
        "maximumPredictedDepthM": float(np.max(maximum_depth[eligible], initial=0.0)),
        "artifacts": artifacts,
    }


def execute(context: dict[str, Any]) -> dict[str, Any]:
    authorization = read_authorization(context)
    scenarios = context["bindingReceipt"]["scenarioBindings"]
    results = [run_scenario(context, scenario) for scenario in scenarios]
    if [item["scenarioId"] for item in results] != context["contract"]["scenarioPolicy"][
        "orderedScenarioIds"
    ]:
        raise EventRunnerError("Not every frozen scenario completed in order")
    receipt_payload = {
        "schemaVersion": "cumbria-event-prediction-receipt-v0.1.0",
        "predictionId": context["contract"]["outputs"]["predictionId"],
        "state": "prediction_frozen_evaluation_still_sealed",
        "authorizationSha256": authorization["authorizationSha256"],
        "contractSha256": context["contractSha256"],
        "manifestSha256": context["manifestSha256"],
        "git": authorization["git"],
        "runtime": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "platform": platform.platform(),
            "internalDtype": "float64",
        },
        "inputReceiptSha256": authorization["inputReceiptSha256"],
        "scenarios": results,
        "isolation": {
            "observedFloodGeometryLoaded": False,
            "evaluationReferenceAccessAllowed": False,
            "networkRequests": 0,
            "solverRuns": len(results),
            "allScenariosCompleted": True,
            "bestScenarioSelected": False,
            "evaluationDrivenRetuning": False,
        },
    }
    receipt = dict(receipt_payload)
    receipt["receiptSha256"] = sha256_json(receipt_payload)
    write_exclusive_json(context["root"] / PREDICTION_RECEIPT_FILE, receipt)
    return receipt


def public_summary(context: dict[str, Any], mode: str, result: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "schemaVersion": "cumbria-event-runner-status-v0.1.0",
        "mode": mode,
        "state": (
            "preflight_verified_execution_not_authorized"
            if mode == "preflight"
            else result["state"]
        ),
        "dataRoot": str(context["root"]),
        "manifestVersion": context["manifest"]["manifestVersion"],
        "contractSha256": context["contractSha256"],
        "artifactDescriptorCount": context["artifactDescriptorCount"],
        "uniqueArtifactCount": context["uniqueArtifactCount"],
        "scenarioCount": len(context["contract"]["scenarioPolicy"]["orderedScenarioIds"]),
        "observedFloodGeometryLoaded": False,
        "evaluationReferenceAccessAllowed": False,
        "solverRuns": 0 if mode != "execute" else len(result["scenarios"]),
        "identity": None if result is None else result.get("authorizationSha256", result.get("receiptSha256")),
    }


def main(arguments: Sequence[str] | None = None) -> int:
    options = parse_arguments(arguments)
    context = preflight(options.data_root)
    if options.freeze:
        mode = "freeze"
        result = freeze_authorization(context)
    elif options.execute:
        mode = "execute"
        result = execute(context)
    else:
        mode = "preflight"
        result = None
    print(json.dumps(public_summary(context, mode, result), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
