from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
from typing import Any

import numpy as np


DIAGNOSTIC_PATH = Path(__file__).with_name(
    "materialize_cumbria_evaluation_diagnostics.py"
)
DIAGNOSTIC_SPEC = importlib.util.spec_from_file_location(
    "materialize_cumbria_evaluation_diagnostics",
    DIAGNOSTIC_PATH,
)
diagnostic = importlib.util.module_from_spec(DIAGNOSTIC_SPEC)
assert DIAGNOSTIC_SPEC.loader is not None
DIAGNOSTIC_SPEC.loader.exec_module(diagnostic)
evaluation = diagnostic.evaluation


SCHEMA = "cumbria-blind-evaluation-failure-inventory-v0.1.0"
RECEIPT_NAME = "cumbria-blind-evaluation-failure-inventory-v0.receipt.json"
DIAGNOSTIC_RECEIPT_SHA256 = (
    "edccd01df0467fb6e3a9d0302ae4869f1d46269aa48901a866f854ca7d0dc721"
)
SOLVER_GRID_RECEIPT_NAME = (
    "cumbria-public-baseline-solver-grids-v0.2.0.receipt.json"
)
SOLVER_GRID_RECEIPT_SHA256 = (
    "63fa37941c13cc6a18bb3fed9f9ab1690ae7da34da9963cead2299adc879800c"
)
DOMINANT_CLC_ARTIFACT = {
    "relativePath": "solver-inputs/grids/sha256/f81ec4d42cdde44b2ff066a7ce21050ab1af7c898e882c548e64be9513725a6c.i16le.gz",
    "bytes": 4958,
    "decodedBytes": 280000,
    "sha256": "f81ec4d42cdde44b2ff066a7ce21050ab1af7c898e882c548e64be9513725a6c",
    "contentSha256": "868da56d209373a771deef8778dacd28d3a9f1dabd89729c6807962786da32ba",
    "encoding": "gzip-compressed i16le, row-major north-to-south",
}
CLC_LABELS = {
    111: "continuous urban fabric",
    112: "discontinuous urban fabric",
    121: "industrial or commercial units",
    122: "road and rail networks and associated land",
    131: "mineral extraction sites",
    142: "sport and leisure facilities",
    211: "non-irrigated arable land",
    231: "pastures",
    311: "broad-leaved forest",
    313: "mixed forest",
    421: "salt marshes",
    522: "estuaries",
}


def validate_threshold_masks(
    wet05: np.ndarray,
    wet10: np.ndarray,
    wet30: np.ndarray,
    valid: np.ndarray,
) -> None:
    for mask, label in (
        (wet05, "0.05 m wet mask"),
        (wet10, "0.10 m wet mask"),
        (wet30, "0.30 m wet mask"),
    ):
        evaluation.validate_binary_mask(mask, label, allow_missing=True)
        if np.any(mask[valid == 1] == evaluation.NO_DATA):
            raise ValueError(f"{label} is missing inside the frozen domain")
        if np.any(mask[valid == 0] != evaluation.NO_DATA):
            raise ValueError(f"{label} does not match the frozen domain")
    if np.any((wet10 == 1) & (wet05 != 1)):
        raise ValueError("0.10 m wet cells must be nested inside the 0.05 m mask")
    if np.any((wet30 == 1) & (wet10 != 1)):
        raise ValueError("0.30 m wet cells must be nested inside the 0.10 m mask")


def depth_band_counts(
    categories: np.ndarray,
    wet05: np.ndarray,
    wet10: np.ndarray,
    wet30: np.ndarray,
) -> list[dict[str, Any]]:
    bands = (
        ("0.05_to_below_0.10_m", (wet05 == 1) & (wet10 == 0), 0.05, 0.10),
        ("0.10_to_below_0.30_m", (wet10 == 1) & (wet30 == 0), 0.10, 0.30),
        ("at_least_0.30_m", wet30 == 1, 0.30, None),
    )
    return [
        {
            "id": identifier,
            "lowerInclusiveMetres": lower,
            "upperExclusiveMetres": upper,
            "truePositiveCellCount": int(np.count_nonzero(mask & (categories == 1))),
            "falsePositiveCellCount": int(np.count_nonzero(mask & (categories == 2))),
        }
        for identifier, mask, lower, upper in bands
    ]


def land_cover_contingency(
    categories: np.ndarray,
    land_cover: np.ndarray,
) -> list[dict[str, Any]]:
    evaluated = categories != evaluation.NO_DATA
    unknown = sorted(
        int(value) for value in np.unique(land_cover[evaluated]) if int(value) not in CLC_LABELS
    )
    if unknown:
        raise ValueError(f"Unknown dominant CLC classes in diagnostic domain: {unknown}")
    rows = []
    for code, label in CLC_LABELS.items():
        class_mask = evaluated & (land_cover == code)
        count = int(np.count_nonzero(class_mask))
        if count == 0:
            continue
        rows.append(
            {
                "classCode": code,
                "label": label,
                "evaluatedCellCount": count,
                "knownDryAgreementCellCount": int(
                    np.count_nonzero(class_mask & (categories == 0))
                ),
                "truePositiveCellCount": int(
                    np.count_nonzero(class_mask & (categories == 1))
                ),
                "falsePositiveCellCount": int(
                    np.count_nonzero(class_mask & (categories == 2))
                ),
                "falseNegativeCellCount": int(
                    np.count_nonzero(class_mask & (categories == 3))
                ),
            }
        )
    if sum(row["evaluatedCellCount"] for row in rows) != int(np.count_nonzero(evaluated)):
        raise ValueError("CLC contingency does not account for every evaluated cell")
    return rows


def load_inventory_inputs(data_root: Path) -> dict[str, Any]:
    evaluation.check_recorded_receipt(
        data_root,
        json.loads(evaluation.MANIFEST_PATH.read_text(encoding="utf-8")),
    )
    prediction = evaluation.read_json_with_identity(
        data_root / evaluation.PREDICTION_RECEIPT_NAME,
        evaluation.PREDICTION_RECEIPT_SHA256,
    )
    references = evaluation.read_json_with_identity(
        data_root / "evaluation-references" / evaluation.REFERENCE_RECEIPT_NAME,
        evaluation.REFERENCE_RECEIPT_SHA256,
    )
    solver_grid_receipt = json.loads(
        (data_root / SOLVER_GRID_RECEIPT_NAME).read_text(encoding="utf-8")
    )
    if solver_grid_receipt.get("receiptSha256") != SOLVER_GRID_RECEIPT_SHA256:
        raise ValueError("Cumbria solver-grid receipt identity drifted")
    diagnostic_receipt = evaluation.read_json_with_identity(
        data_root / "evaluation-references" / "diagnostics" / diagnostic.RECEIPT_NAME,
        DIAGNOSTIC_RECEIPT_SHA256,
    )
    primary = next(
        scenario for scenario in prediction["scenarios"] if scenario["scenarioId"] == "primary-20m"
    )
    shape = (evaluation.GRID["height"], evaluation.GRID["width"])

    def array(descriptor: dict[str, Any], dtype: Any) -> np.ndarray:
        return np.frombuffer(
            evaluation.read_artifact(data_root, descriptor),
            dtype=dtype,
        ).reshape(shape)

    valid = array(primary["artifacts"]["validPredictionMask"], np.uint8)
    evaluation.validate_binary_mask(valid, "Valid-prediction mask", allow_missing=False)
    wet05 = array(primary["artifacts"]["wetMask05m"], np.uint8)
    wet10 = array(primary["artifacts"]["wetMask1m"], np.uint8)
    wet30 = array(primary["artifacts"]["wetMask3m"], np.uint8)
    validate_threshold_masks(wet05, wet10, wet30, valid)
    land_cover = array(DOMINANT_CLC_ARTIFACT, np.dtype("<i2"))
    if np.any((valid == 1) & ~np.isin(land_cover, tuple(CLC_LABELS))):
        raise ValueError("Valid diagnostic cells require a recognized dominant CLC class")
    return {
        "references": references,
        "diagnosticReceipt": diagnostic_receipt,
        "valid": valid,
        "wet05": wet05,
        "wet10": wet10,
        "wet30": wet30,
        "landCover": land_cover,
    }


def build_receipt(data_root: Path) -> dict[str, Any]:
    inputs = load_inventory_inputs(data_root)
    comparisons = []
    for reference in inputs["references"]["references"]:
        observed = np.frombuffer(
            evaluation.read_artifact(data_root, reference["referenceMask"]),
            dtype=np.uint8,
        ).reshape(evaluation.GRID["height"], evaluation.GRID["width"])
        coverage = np.frombuffer(
            evaluation.read_artifact(data_root, reference["coverageMask"]),
            dtype=np.uint8,
        ).reshape(evaluation.GRID["height"], evaluation.GRID["width"])
        categories = diagnostic.classify(
            inputs["wet05"], inputs["valid"], observed, coverage
        )
        comparisons.append(
            {
                "referenceId": reference["id"],
                "depthBands": depth_band_counts(
                    categories,
                    inputs["wet05"],
                    inputs["wet10"],
                    inputs["wet30"],
                ),
                "landCoverContingency": land_cover_contingency(
                    categories, inputs["landCover"]
                ),
            }
        )
    receipt: dict[str, Any] = {
        "schemaVersion": SCHEMA,
        "receiptSha256": None,
        "evaluationReceiptSha256": evaluation.OUTPUT_RECEIPT_SHA256,
        "diagnosticReceiptSha256": inputs["diagnosticReceipt"]["receiptSha256"],
        "solverGridReceiptSha256": SOLVER_GRID_RECEIPT_SHA256,
        "cellAreaSquareMetres": 400,
        "stratification": {
            "depthThresholdsMetres": [0.05, 0.10, 0.30],
            "depthThresholdOrigin": "predeclared_frozen_prediction_artifacts",
            "landCoverOrigin": "pre_event_clc2012_dominant_class_on_frozen_20m_grid",
        },
        "comparisons": comparisons,
        "isolation": {
            "newEvaluationMetrics": False,
            "modelRetuned": False,
            "scenarioRankedOrSelected": False,
            "thresholdChanged": False,
            "networkRequests": 0,
            "evaluationRuns": 0,
        },
        "interpretationLimits": {
            "descriptiveOnly": True,
            "establishesCausality": False,
            "authorizesModelChange": False,
        },
        "role": "post_evaluation_failure_inventory_not_model_input_or_model_selection",
    }
    receipt["receiptSha256"] = evaluation.canonical_identity(receipt, "receiptSha256")
    return receipt


def write_exact(path: Path, payload: bytes) -> None:
    if path.exists() and path.read_bytes() != payload:
        raise ValueError(f"Existing failure-inventory receipt drifted: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temporary = path.with_suffix(path.suffix + ".tmp")
        with temporary.open("wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)


def execute(data_root: Path) -> dict[str, Any]:
    receipt = build_receipt(data_root)
    encoded = (json.dumps(receipt, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    write_exact(
        data_root / "evaluation-references" / "diagnostics" / RECEIPT_NAME,
        encoded,
    )
    return receipt


def check(data_root: Path) -> dict[str, Any]:
    path = data_root / "evaluation-references" / "diagnostics" / RECEIPT_NAME
    recorded = json.loads(path.read_text(encoding="utf-8"))
    if evaluation.canonical_identity(recorded, "receiptSha256") != recorded.get(
        "receiptSha256"
    ):
        raise ValueError("Cumbria failure-inventory receipt identity drifted")
    if build_receipt(data_root) != recorded:
        raise ValueError("Cumbria failure inventory does not reproduce")
    return recorded


def plan() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA,
        "mode": "dry_run",
        "predictionArtifactsLoaded": 0,
        "referenceArtifactsLoaded": 0,
        "solverArtifactsLoaded": 0,
        "filesWritten": 0,
        "networkRequests": 0,
        "evaluationRuns": 0,
    }


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--execute", action="store_true")
    mode.add_argument("--check", action="store_true")
    options = parser.parse_args(arguments)
    data_root = evaluation.ensure_external_data_root(
        Path(options.data_root), evaluation.REPOSITORY_ROOT
    )
    if options.execute:
        result = execute(data_root)
        mode_name = "execute"
    elif options.check:
        result = check(data_root)
        mode_name = "check"
    else:
        result = plan()
        mode_name = "dry_run"
    print(json.dumps({"mode": mode_name, "dataRoot": str(data_root), "result": result}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
