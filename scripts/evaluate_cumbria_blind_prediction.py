from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

import numpy as np
import shapely
from shapely import linestrings, points
from shapely.strtree import STRtree


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPOSITORY_ROOT / "tests" / "ground-truth" / "cumbria-2015" / "manifest.json"
PREDICTION_RECEIPT_NAME = "cumbria-public-storm-desmond-v0.prediction.receipt.json"
REFERENCE_RECEIPT_NAME = "cumbria-evaluation-reference-masks-v0.receipt.json"
OUTPUT_RECEIPT_NAME = "cumbria-blind-evaluation-v0.receipt.json"
OUTPUT_SCHEMA = "cumbria-blind-evaluation-receipt-v0.1.0"
AUTHORIZATION_SCHEMA = "cumbria-blind-evaluation-execution-authorization-v0.1.0"
EXECUTOR_RELATIVE_PATH = "scripts/evaluate_cumbria_blind_prediction.py"
PROTOCOL_SHA256 = "1a135785bef1121e542952fd8ee90d6eed86908d19864d381985fbfd2f8a1dd0"
PREDICTION_RECEIPT_SHA256 = "f2a3a7489699a70a6d5c770633bdc9f789184ca26cb8190c85a1d28d40495dc6"
REFERENCE_RECEIPT_SHA256 = "fae2cadba3675bff4191da5829e8bf64d71ffc028a9c6899c9e865f97b6debe0"
SOURCE_RECEIPT_SHA256 = "b9bf772af4a356de533edb26c005dd318e36d889ad44fdaeb51586c989adffbf"
NORMALIZATION_SCHEMA = "cumbria-evaluation-reference-normalization-v0.1.0"
NORMALIZATION_COMMIT = "7161a53bf0a1823858d40705855e4ae7651c1a6c"
NORMALIZATION_TREE = "030bab43e8ad3d0d8c099c8faa52a4e4fa68eac2"
PREDICTION_ARTIFACT_SHA256 = "dffe515490e25f371095547f4b6e90f93b5744252bf4a82948b846099a17575f"
PREDICTION_CONTENT_SHA256 = "f535a3a8fc2bd5b96afc4f2feb59c1a285a4776e2314385f9133c6a3f50da45e"
VALID_MASK_SHA256 = "2273498b8cacfaace9245ae4f4f20a57077ad45758826919843e8837af338230"
GRID = {
    "horizontalCrs": "EPSG:27700",
    "bounds": [332000, 556000, 340000, 563000],
    "originUpperLeft": [332000, 563000],
    "cellSizeMetres": 20,
    "width": 400,
    "height": 350,
    "rowOrder": "north_to_south",
}
CELL_COUNT = GRID["width"] * GRID["height"]
CELL_AREA_M2 = GRID["cellSizeMetres"] ** 2
NO_DATA = 255
REFERENCE_IDS = (
    "ea-recorded-flood-outlines-carlisle-2015",
    "copernicus-emsr147-carlisle-initial",
    "copernicus-emsr147-carlisle-monitoring-01",
)
METRIC_IDS = (
    "intersection_over_union",
    "area_precision",
    "area_recall",
    "false_positive_area",
    "false_negative_area",
    "boundary_distance_p95",
)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_identity(value: dict[str, Any], identity_field: str) -> str:
    payload = dict(value)
    payload.pop(identity_field, None)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return sha256_bytes(encoded)


def ordered_identity(value: dict[str, Any], identity_field: str) -> str:
    payload = dict(value)
    payload.pop(identity_field, None)
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return sha256_bytes(encoded)


def ensure_external_data_root(data_root: Path, repository_root: Path) -> Path:
    resolved = data_root.resolve()
    repository = repository_root.resolve()
    try:
        resolved.relative_to(repository)
    except ValueError:
        pass
    else:
        raise ValueError("Cumbria evaluation data root must stay outside the Git repository")
    if any(part.casefold().startswith("onedrive") for part in resolved.parts):
        raise ValueError("Cumbria evaluation data root must stay outside OneDrive")
    return resolved


def validate_execution_authorization(
    manifest: dict[str, Any],
    executor_sha256: str,
) -> dict[str, Any]:
    authorization = manifest.get("evaluationExecutionAuthorization")
    if not isinstance(authorization, dict):
        raise ValueError("Blind evaluation execution has not been authorized")
    executor = authorization.get("executor", {})
    isolation = authorization.get("isolation", {})
    if (
        authorization.get("schemaVersion") != AUTHORIZATION_SCHEMA
        or authorization.get("state") != "authorized_for_single_blind_evaluation"
        or authorization.get("protocolSha256") != PROTOCOL_SHA256
        or authorization.get("predictionReceiptSha256") != PREDICTION_RECEIPT_SHA256
        or authorization.get("referenceReceiptSha256") != REFERENCE_RECEIPT_SHA256
        or executor.get("relativePath") != EXECUTOR_RELATIVE_PATH
        or executor.get("sha256") != executor_sha256
        or not isinstance(executor.get("frozenCommit"), str)
        or len(executor["frozenCommit"]) != 40
        or isolation
        != {
            "predictionArtifactsLoaded": False,
            "referenceArtifactsLoaded": False,
            "filesWritten": 0,
            "evaluationRuns": 0,
            "networkRequests": 0,
        }
        or authorization.get("nextGate")
        != "execute_once_and_record_all_predeclared_metrics"
    ):
        raise ValueError("Blind evaluation execution authorization drifted")
    return authorization


def first_revision_with_executor_identity(executor_sha256: str) -> str:
    revisions = subprocess.check_output(
        ["git", "log", "--reverse", "--format=%H", "--", EXECUTOR_RELATIVE_PATH],
        cwd=REPOSITORY_ROOT,
        text=True,
    ).splitlines()
    for revision in revisions:
        source = subprocess.check_output(
            ["git", "show", f"{revision}:{EXECUTOR_RELATIVE_PATH}"],
            cwd=REPOSITORY_ROOT,
        )
        if sha256_bytes(source) == executor_sha256:
            return revision
    raise ValueError("Authorized blind-evaluation executor identity is absent from Git history")


def assert_execution_revision(manifest: dict[str, Any]) -> dict[str, str]:
    if subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=REPOSITORY_ROOT, text=True
    ).strip():
        raise ValueError("Blind evaluation requires a clean Git worktree")
    current_executor = subprocess.check_output(
        ["git", "show", f"HEAD:{EXECUTOR_RELATIVE_PATH}"],
        cwd=REPOSITORY_ROOT,
    )
    executor_sha256 = sha256_bytes(current_executor)
    authorization = validate_execution_authorization(manifest, executor_sha256)
    frozen_commit = authorization["executor"]["frozenCommit"]
    if first_revision_with_executor_identity(executor_sha256) != frozen_commit:
        raise ValueError("Blind-evaluation frozen commit does not identify the reviewed executor revision")
    if subprocess.run(
        ["git", "merge-base", "--is-ancestor", frozen_commit, "HEAD"],
        cwd=REPOSITORY_ROOT,
        check=False,
    ).returncode != 0:
        raise ValueError("Authorized blind-evaluation revision is not an ancestor of HEAD")
    historical_executor = subprocess.check_output(
        ["git", "show", f"{frozen_commit}:{EXECUTOR_RELATIVE_PATH}"],
        cwd=REPOSITORY_ROOT,
    )
    if sha256_bytes(historical_executor) != executor_sha256:
        raise ValueError("Authorized historical blind-evaluation executor drifted")
    return {
        "commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=REPOSITORY_ROOT, text=True
        ).strip(),
        "tree": subprocess.check_output(
            ["git", "rev-parse", "HEAD^{tree}"], cwd=REPOSITORY_ROOT, text=True
        ).strip(),
    }


def assert_output_absent(data_root: Path) -> None:
    path = data_root / "evaluation-references" / OUTPUT_RECEIPT_NAME
    if path.exists():
        raise ValueError("Blind evaluation has already been executed for this external package")


def validate_manifest(manifest: dict[str, Any]) -> None:
    protocol = manifest.get("evaluationProtocol", {})
    normalization = manifest.get("evaluationReferenceNormalization", {})
    normalization_receipt = normalization.get("receipt", {})
    normalization_revision = normalization.get("materializationRevision", {})
    metrics = tuple(metric.get("id") for metric in protocol.get("metrics", []))
    if (
        protocol.get("protocolSha256") != PROTOCOL_SHA256
        or ordered_identity(protocol, "protocolSha256") != PROTOCOL_SHA256
        or protocol.get("predictionFreeze", {}).get("predictionReceipt", {}).get("sha256")
        != PREDICTION_RECEIPT_SHA256
        or protocol.get("predictionFreeze", {}).get("predictionArtifactSha256")
        != PREDICTION_ARTIFACT_SHA256
        or protocol.get("predictionFreeze", {}).get("predictionArtifactContentSha256")
        != PREDICTION_CONTENT_SHA256
        or protocol.get("predictionFreeze", {}).get("evaluationDomain", {}).get("artifact", {}).get("sha256")
        != VALID_MASK_SHA256
        or metrics != METRIC_IDS
        or protocol.get("comparisonPolicy", {}).get("evaluateEachReferenceSeparately") is not True
        or protocol.get("comparisonPolicy", {}).get("missingObservedCoverage")
        != "exclude_and_report_not_dry"
        or protocol.get("comparisonPolicy", {}).get("missingPredictionCoverage")
        != "block_evaluation"
        or protocol.get("comparisonPolicy", {}).get("referenceDisagreement")
        != "report_separately_no_union_or_intersection"
        or normalization.get("schemaVersion") != NORMALIZATION_SCHEMA
        or normalization.get("state") != "content_addressed_evaluation_pending"
        or normalization.get("sourceReceiptSha256") != SOURCE_RECEIPT_SHA256
        or normalization.get("predictionReceiptSha256") != PREDICTION_RECEIPT_SHA256
        or normalization.get("protocolSha256") != PROTOCOL_SHA256
        or normalization_revision.get("commit") != NORMALIZATION_COMMIT
        or normalization_revision.get("tree") != NORMALIZATION_TREE
        or normalization_receipt.get("fileName") != REFERENCE_RECEIPT_NAME
        or normalization_receipt.get("schemaVersion")
        != "cumbria-evaluation-reference-mask-receipt-v0.1.0"
        or normalization_receipt.get("sha256") != REFERENCE_RECEIPT_SHA256
        or normalization_receipt.get("referenceCount") != len(REFERENCE_IDS)
        or normalization.get("grid") != GRID
        or normalization.get("nextGate") != "evaluate_each_reference_independently"
    ):
        raise ValueError("Cumbria blind-evaluation contract drifted")


def read_json_with_identity(path: Path, expected_sha256: str) -> dict[str, Any]:
    payload = path.read_bytes()
    value = json.loads(payload)
    if value.get("receiptSha256") != expected_sha256:
        raise ValueError(f"Receipt identity drifted: {path.name}")
    if canonical_identity(value, "receiptSha256") != expected_sha256:
        raise ValueError(f"Receipt canonical identity drifted: {path.name}")
    return value


def read_artifact(data_root: Path, descriptor: dict[str, Any]) -> bytes:
    path = (data_root / descriptor["relativePath"]).resolve()
    try:
        path.relative_to(data_root.resolve())
    except ValueError as error:
        raise ValueError(f"Artifact escapes the external data root: {descriptor['relativePath']}") from error
    stored = path.read_bytes()
    if len(stored) != descriptor["bytes"] or sha256_bytes(stored) != descriptor["sha256"]:
        raise ValueError(f"Artifact bytes drifted: {descriptor['relativePath']}")
    decoded = gzip.decompress(stored)
    decoded_bytes = descriptor.get("contentBytes", descriptor.get("decodedBytes"))
    if (
        len(decoded) != decoded_bytes
        or sha256_bytes(decoded) != descriptor["contentSha256"]
    ):
        raise ValueError(f"Artifact content drifted: {descriptor['relativePath']}")
    return decoded


def validate_binary_mask(mask: np.ndarray, label: str, *, allow_missing: bool) -> None:
    allowed = (mask == 0) | (mask == 1)
    if allow_missing:
        allowed |= mask == NO_DATA
    if not np.all(allowed):
        raise ValueError(f"{label} contains values outside its frozen encoding")


def boundary_segments(mask: np.ndarray, known: np.ndarray) -> np.ndarray:
    north_wet = np.zeros_like(mask, dtype=bool)
    south_wet = np.zeros_like(mask, dtype=bool)
    west_wet = np.zeros_like(mask, dtype=bool)
    east_wet = np.zeros_like(mask, dtype=bool)
    north_known = np.zeros_like(known, dtype=bool)
    south_known = np.zeros_like(known, dtype=bool)
    west_known = np.zeros_like(known, dtype=bool)
    east_known = np.zeros_like(known, dtype=bool)
    north_wet[1:, :] = mask[:-1, :]
    south_wet[:-1, :] = mask[1:, :]
    west_wet[:, 1:] = mask[:, :-1]
    east_wet[:, :-1] = mask[:, 1:]
    north_known[1:, :] = known[:-1, :]
    south_known[:-1, :] = known[1:, :]
    west_known[:, 1:] = known[:, :-1]
    east_known[:, :-1] = known[:, 1:]
    x0, y_top = GRID["originUpperLeft"]
    size = GRID["cellSizeMetres"]
    segments: list[list[list[float]]] = []
    for edge_mask, edge in (
        (mask & north_known & ~north_wet, "north"),
        (mask & south_known & ~south_wet, "south"),
        (mask & west_known & ~west_wet, "west"),
        (mask & east_known & ~east_wet, "east"),
    ):
        for row, column in np.argwhere(edge_mask):
            left = x0 + int(column) * size
            right = left + size
            top = y_top - int(row) * size
            bottom = top - size
            if edge == "north":
                segments.append([[left, top], [right, top]])
            elif edge == "south":
                segments.append([[left, bottom], [right, bottom]])
            elif edge == "west":
                segments.append([[left, bottom], [left, top]])
            else:
                segments.append([[right, bottom], [right, top]])
    return np.asarray(segments, dtype=np.float64)


def directed_boundary_distances(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    source_midpoints = source.mean(axis=1)
    source_points = points(source_midpoints)
    target_lines = linestrings(target)
    tree = STRtree(target_lines)
    _, distances = tree.query_nearest(
        source_points,
        all_matches=False,
        return_distance=True,
    )
    return np.asarray(distances, dtype=np.float64)


def boundary_distance_p95(
    predicted: np.ndarray,
    observed: np.ndarray,
    known: np.ndarray,
) -> dict[str, Any]:
    predicted_segments = boundary_segments(predicted, known)
    observed_segments = boundary_segments(observed, known)
    if len(predicted_segments) == 0 or len(observed_segments) == 0:
        return {
            "value": None,
            "unit": "m",
            "reason": "predicted_or_observed_wet_boundary_empty",
        }
    distances = np.concatenate(
        (
            directed_boundary_distances(predicted_segments, observed_segments),
            directed_boundary_distances(observed_segments, predicted_segments),
        )
    )
    return {
        "value": float(np.percentile(distances, 95, method="linear")),
        "unit": "m",
        "sampleCount": int(len(distances)),
    }


def fraction_metric(numerator: int, denominator: int, reason: str) -> dict[str, Any]:
    if denominator == 0:
        return {"value": None, "unit": "fraction", "reason": reason}
    return {"value": numerator / denominator, "unit": "fraction"}


def evaluate_reference(
    predicted_mask: np.ndarray,
    valid_prediction_mask: np.ndarray,
    reference_mask: np.ndarray,
    reference_coverage_mask: np.ndarray,
) -> dict[str, Any]:
    shape = (GRID["height"], GRID["width"])
    for mask, label in (
        (predicted_mask, "prediction mask"),
        (valid_prediction_mask, "valid-prediction mask"),
        (reference_mask, "reference mask"),
        (reference_coverage_mask, "reference-coverage mask"),
    ):
        if mask.shape != shape:
            raise ValueError(f"{label} has the wrong grid shape")
    validate_binary_mask(predicted_mask, "Prediction mask", allow_missing=True)
    validate_binary_mask(valid_prediction_mask, "Valid-prediction mask", allow_missing=False)
    validate_binary_mask(reference_mask, "Reference mask", allow_missing=True)
    validate_binary_mask(reference_coverage_mask, "Reference-coverage mask", allow_missing=False)
    valid_prediction = valid_prediction_mask == 1
    if np.any(predicted_mask[valid_prediction] == NO_DATA):
        raise ValueError("Prediction coverage is missing inside the frozen evaluation domain")
    if np.any(predicted_mask[~valid_prediction] != NO_DATA):
        raise ValueError("Prediction mask does not match the frozen evaluation domain")
    observed_coverage = reference_coverage_mask == 1
    if np.any((reference_mask == NO_DATA) != ~observed_coverage):
        raise ValueError("Reference mask and reference coverage disagree")
    evaluation_mask = valid_prediction & observed_coverage
    predicted = (predicted_mask == 1) & evaluation_mask
    observed = (reference_mask == 1) & evaluation_mask
    intersection_count = int(np.count_nonzero(predicted & observed))
    union_count = int(np.count_nonzero(predicted | observed))
    predicted_count = int(np.count_nonzero(predicted))
    observed_count = int(np.count_nonzero(observed))
    false_positive_count = int(np.count_nonzero(predicted & ~observed & evaluation_mask))
    false_negative_count = int(np.count_nonzero(observed & ~predicted & evaluation_mask))
    return {
        "coverage": {
            "frozenEvaluationCellCount": int(np.count_nonzero(valid_prediction)),
            "evaluatedCellCount": int(np.count_nonzero(evaluation_mask)),
            "excludedMissingObservedCoverageCellCount": int(
                np.count_nonzero(valid_prediction & ~observed_coverage)
            ),
            "missingPredictionCoverageCellCount": 0,
        },
        "contingency": {
            "intersectionCellCount": intersection_count,
            "unionCellCount": union_count,
            "predictedWetCellCount": predicted_count,
            "observedWetCellCount": observed_count,
            "falsePositiveCellCount": false_positive_count,
            "falseNegativeCellCount": false_negative_count,
        },
        "metrics": {
            "intersection_over_union": fraction_metric(
                intersection_count, union_count, "predicted_and_observed_wet_union_empty"
            ),
            "area_precision": fraction_metric(
                intersection_count, predicted_count, "predicted_wet_area_empty"
            ),
            "area_recall": fraction_metric(
                intersection_count, observed_count, "observed_wet_area_empty"
            ),
            "false_positive_area": {
                "value": false_positive_count * CELL_AREA_M2,
                "unit": "m2",
            },
            "false_negative_area": {
                "value": false_negative_count * CELL_AREA_M2,
                "unit": "m2",
            },
            "boundary_distance_p95": boundary_distance_p95(
                predicted,
                observed,
                evaluation_mask,
            ),
        },
    }


def build_receipt(data_root: Path, revision: dict[str, str]) -> dict[str, Any]:
    prediction_receipt = read_json_with_identity(
        data_root / PREDICTION_RECEIPT_NAME,
        PREDICTION_RECEIPT_SHA256,
    )
    reference_receipt = read_json_with_identity(
        data_root / "evaluation-references" / REFERENCE_RECEIPT_NAME,
        REFERENCE_RECEIPT_SHA256,
    )
    primary = next(
        scenario for scenario in prediction_receipt["scenarios"] if scenario["scenarioId"] == "primary-20m"
    )
    wet_descriptor = primary["artifacts"]["wetMask05m"]
    valid_descriptor = primary["artifacts"]["validPredictionMask"]
    if (
        wet_descriptor["sha256"] != PREDICTION_ARTIFACT_SHA256
        or wet_descriptor["contentSha256"] != PREDICTION_CONTENT_SHA256
        or valid_descriptor["sha256"] != VALID_MASK_SHA256
    ):
        raise ValueError("Frozen prediction artifact linkage drifted")
    predicted = np.frombuffer(read_artifact(data_root, wet_descriptor), dtype=np.uint8).reshape(
        GRID["height"], GRID["width"]
    )
    valid_prediction = np.frombuffer(
        read_artifact(data_root, valid_descriptor), dtype=np.uint8
    ).reshape(GRID["height"], GRID["width"])
    comparisons = []
    references = reference_receipt.get("references", [])
    if tuple(reference.get("id") for reference in references) != REFERENCE_IDS:
        raise ValueError("Evaluation references or their order drifted")
    for reference in references:
        reference_mask = np.frombuffer(
            read_artifact(data_root, reference["referenceMask"]), dtype=np.uint8
        ).reshape(GRID["height"], GRID["width"])
        coverage_mask = np.frombuffer(
            read_artifact(data_root, reference["coverageMask"]), dtype=np.uint8
        ).reshape(GRID["height"], GRID["width"])
        comparisons.append(
            {
                "referenceId": reference["id"],
                "referenceMaskSha256": reference["referenceMask"]["sha256"],
                "referenceCoverageMaskSha256": reference["coverageMask"]["sha256"],
                **evaluate_reference(predicted, valid_prediction, reference_mask, coverage_mask),
            }
        )
    receipt = {
        "schemaVersion": OUTPUT_SCHEMA,
        "receiptSha256": None,
        "protocolSha256": PROTOCOL_SHA256,
        "predictionReceiptSha256": PREDICTION_RECEIPT_SHA256,
        "referenceReceiptSha256": REFERENCE_RECEIPT_SHA256,
        "evaluationRevision": revision,
        "grid": GRID,
        "prediction": {
            "scenarioId": "primary-20m",
            "wetnessThresholdM": 0.05,
            "wetMaskSha256": PREDICTION_ARTIFACT_SHA256,
            "validPredictionMaskSha256": VALID_MASK_SHA256,
        },
        "metricOperationalization": {
            "area": "20 m cell counts multiplied by 400 m2 inside the frozen prediction domain and observed coverage",
            "boundary": "each wet-to-known-dry 20 m cell edge contributes one midpoint; edges adjacent to excluded or unknown cells are suppressed; directed midpoint-to-nearest-opposite-edge distances are pooled symmetrically",
            "percentile": "NumPy percentile 95 with linear interpolation",
            "missingObservedCoverage": "excluded and reported, never interpreted as dry",
            "missingPredictionCoverage": "blocks evaluation",
        },
        "runtime": {
            "numpy": np.__version__,
            "shapely": shapely.__version__,
            "geos": shapely.geos_version_string,
        },
        "comparisons": comparisons,
        "isolation": {
            "referencesCombined": False,
            "thresholdChanged": False,
            "modelRetuned": False,
            "scenarioSelectedAfterReferenceAccess": False,
            "networkRequests": 0,
            "evaluationRuns": 1,
        },
    }
    receipt["receiptSha256"] = canonical_identity(receipt, "receiptSha256")
    return receipt


def write_receipt(data_root: Path, receipt: dict[str, Any]) -> None:
    path = data_root / "evaluation-references" / OUTPUT_RECEIPT_NAME
    encoded = (json.dumps(receipt, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if path.exists() and path.read_bytes() != encoded:
        raise ValueError("Existing blind-evaluation receipt drifted")
    if not path.exists():
        temporary = path.with_suffix(path.suffix + ".tmp")
        with temporary.open("wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)


def plan() -> dict[str, Any]:
    return {
        "schemaVersion": OUTPUT_SCHEMA,
        "mode": "dry_run",
        "protocolSha256": PROTOCOL_SHA256,
        "predictionReceiptSha256": PREDICTION_RECEIPT_SHA256,
        "referenceReceiptSha256": REFERENCE_RECEIPT_SHA256,
        "referenceIds": REFERENCE_IDS,
        "metricIds": METRIC_IDS,
        "predictionArtifactsLoaded": 0,
        "referenceArtifactsLoaded": 0,
        "filesWritten": 0,
        "evaluationRuns": 0,
        "networkRequests": 0,
    }


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--execute", action="store_true")
    options = parser.parse_args(arguments)
    data_root = ensure_external_data_root(Path(options.data_root), REPOSITORY_ROOT)
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    validate_manifest(manifest)
    if options.execute:
        revision = assert_execution_revision(manifest)
        assert_output_absent(data_root)
        result = build_receipt(data_root, revision)
        write_receipt(data_root, result)
        mode = "execute"
    else:
        result = plan()
        mode = "dry_run"
    print(
        json.dumps(
            {
                "mode": mode,
                "dataRoot": str(data_root),
                "receiptSha256": result.get("receiptSha256"),
                "result": result,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
