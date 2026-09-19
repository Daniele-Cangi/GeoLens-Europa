from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
from typing import Any
import zlib

import numpy as np


EVALUATION_PATH = Path(__file__).with_name("evaluate_cumbria_blind_prediction.py")
EVALUATION_SPEC = importlib.util.spec_from_file_location(
    "evaluate_cumbria_blind_prediction",
    EVALUATION_PATH,
)
evaluation = importlib.util.module_from_spec(EVALUATION_SPEC)
assert EVALUATION_SPEC.loader is not None
EVALUATION_SPEC.loader.exec_module(evaluation)


SCHEMA = "cumbria-blind-evaluation-diagnostics-v0.1.0"
RECEIPT_NAME = "cumbria-blind-evaluation-diagnostics-v0.receipt.json"
SVG_NAME = "cumbria-blind-evaluation-diagnostics-v0.svg"
CATEGORY_LABELS = {
    "0": "known dry agreement",
    "1": "true positive",
    "2": "false positive",
    "3": "false negative",
    "255": "outside evaluation",
}
CATEGORY_COLOURS = {
    0: (235, 239, 241, 255),
    1: (15, 118, 110, 255),
    2: (205, 91, 37, 255),
    3: (43, 91, 152, 255),
    255: (74, 85, 92, 255),
}


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def classify(
    predicted: np.ndarray,
    valid_prediction: np.ndarray,
    observed: np.ndarray,
    coverage: np.ndarray,
) -> np.ndarray:
    if not (
        predicted.shape
        == valid_prediction.shape
        == observed.shape
        == coverage.shape
        == (evaluation.GRID["height"], evaluation.GRID["width"])
    ):
        raise ValueError("Cumbria diagnostic arrays must match the frozen grid")
    known = (valid_prediction == 1) & (coverage == 1)
    if np.any(known & (predicted == evaluation.NO_DATA)):
        raise ValueError("Prediction is missing inside the diagnostic domain")
    if np.any((coverage == 0) != (observed == evaluation.NO_DATA)):
        raise ValueError("Reference coverage and missing state disagree")
    result = np.full(predicted.shape, evaluation.NO_DATA, dtype=np.uint8)
    predicted_wet = predicted == 1
    observed_wet = observed == 1
    result[known & ~predicted_wet & ~observed_wet] = 0
    result[known & predicted_wet & observed_wet] = 1
    result[known & predicted_wet & ~observed_wet] = 2
    result[known & ~predicted_wet & observed_wet] = 3
    return result


def category_counts(categories: np.ndarray) -> dict[str, int]:
    return {
        "knownDryAgreementCellCount": int(np.count_nonzero(categories == 0)),
        "truePositiveCellCount": int(np.count_nonzero(categories == 1)),
        "falsePositiveCellCount": int(np.count_nonzero(categories == 2)),
        "falseNegativeCellCount": int(np.count_nonzero(categories == 3)),
        "outsideEvaluationCellCount": int(np.count_nonzero(categories == evaluation.NO_DATA)),
    }


def png_bytes(categories: np.ndarray) -> bytes:
    height, width = categories.shape
    rgba = np.empty((height, width, 4), dtype=np.uint8)
    for category, colour in CATEGORY_COLOURS.items():
        rgba[categories == category] = colour
    raw = b"".join(b"\x00" + rgba[row].tobytes() for row in range(height))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, level=9))
        + chunk(b"IEND", b"")
    )


def svg_bytes(panels: list[dict[str, Any]]) -> bytes:
    panel_width = evaluation.GRID["width"]
    panel_height = evaluation.GRID["height"]
    margin_x = 56
    gap = 32
    top = 112
    width = margin_x * 2 + panel_width * len(panels) + gap * (len(panels) - 1)
    height = 540
    titles = {
        "ea-recorded-flood-outlines-carlisle-2015": "Environment Agency outline",
        "copernicus-emsr147-carlisle-initial": "Copernicus EMSR147 initial",
        "copernicus-emsr147-carlisle-monitoring-01": "Copernicus EMSR147 monitoring",
    }
    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
        '<title id="title">Cumbria 2015 blind evaluation error map</title>',
        '<desc id="desc">Three frozen-grid comparisons showing true positives, false positives, false negatives, dry agreement and excluded cells.</desc>',
        '<rect width="100%" height="100%" fill="#f5f7f8"/>',
        '<text x="56" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="#172126">Cumbria 2015 · frozen blind-evaluation diagnosis</text>',
        '<text x="56" y="68" font-family="Arial, sans-serif" font-size="14" fill="#4c5a61">Primary 20 m prediction at ≥ 0.05 m · EPSG:27700 · north is up · no retuning</text>',
    ]
    for index, panel in enumerate(panels):
        x = margin_x + index * (panel_width + gap)
        encoded = base64.b64encode(panel["png"]).decode("ascii")
        counts = panel["counts"]
        elements.extend(
            [
                f'<text x="{x}" y="96" font-family="Arial, sans-serif" font-size="15" font-weight="600" fill="#172126">{titles[panel["referenceId"]]}</text>',
                f'<image x="{x}" y="{top}" width="{panel_width}" height="{panel_height}" preserveAspectRatio="none" style="image-rendering:pixelated" href="data:image/png;base64,{encoded}"/>',
                f'<rect x="{x}" y="{top}" width="{panel_width}" height="{panel_height}" fill="none" stroke="#172126" stroke-width="1"/>',
                f'<text x="{x}" y="{top + panel_height + 24}" font-family="Arial, sans-serif" font-size="12" fill="#4c5a61">TP {counts["truePositiveCellCount"]:,} · FP {counts["falsePositiveCellCount"]:,} · FN {counts["falseNegativeCellCount"]:,}</text>',
                f'<text x="{x}" y="{top + panel_height + 43}" font-family="Arial, sans-serif" font-size="11" fill="#68767d">E 332,000–340,000 m · N 556,000–563,000 m</text>',
            ]
        )
    legend_y = 518
    legend = [
        (1, "True positive"),
        (2, "False positive"),
        (3, "False negative"),
        (0, "Known dry agreement"),
        (255, "Outside evaluation"),
    ]
    x = margin_x
    for category, label in legend:
        colour = CATEGORY_COLOURS[category]
        fill = f"#{colour[0]:02x}{colour[1]:02x}{colour[2]:02x}"
        elements.append(f'<rect x="{x}" y="{legend_y - 12}" width="14" height="14" fill="{fill}"/>')
        elements.append(f'<text x="{x + 21}" y="{legend_y}" font-family="Arial, sans-serif" font-size="12" fill="#172126">{label}</text>')
        x += 170 if category != 0 else 190
    elements.append("</svg>")
    return ("\n".join(elements) + "\n").encode("utf-8")


def load_panels(data_root: Path) -> list[dict[str, Any]]:
    prediction_receipt = evaluation.read_json_with_identity(
        data_root / evaluation.PREDICTION_RECEIPT_NAME,
        evaluation.PREDICTION_RECEIPT_SHA256,
    )
    reference_receipt = evaluation.read_json_with_identity(
        data_root / "evaluation-references" / evaluation.REFERENCE_RECEIPT_NAME,
        evaluation.REFERENCE_RECEIPT_SHA256,
    )
    primary = next(
        scenario
        for scenario in prediction_receipt["scenarios"]
        if scenario["scenarioId"] == "primary-20m"
    )
    predicted = np.frombuffer(
        evaluation.read_artifact(data_root, primary["artifacts"]["wetMask05m"]),
        dtype=np.uint8,
    ).reshape(evaluation.GRID["height"], evaluation.GRID["width"])
    valid_prediction = np.frombuffer(
        evaluation.read_artifact(data_root, primary["artifacts"]["validPredictionMask"]),
        dtype=np.uint8,
    ).reshape(evaluation.GRID["height"], evaluation.GRID["width"])
    panels = []
    for reference in reference_receipt["references"]:
        observed = np.frombuffer(
            evaluation.read_artifact(data_root, reference["referenceMask"]),
            dtype=np.uint8,
        ).reshape(evaluation.GRID["height"], evaluation.GRID["width"])
        coverage = np.frombuffer(
            evaluation.read_artifact(data_root, reference["coverageMask"]),
            dtype=np.uint8,
        ).reshape(evaluation.GRID["height"], evaluation.GRID["width"])
        categories = classify(predicted, valid_prediction, observed, coverage)
        panels.append(
            {
                "referenceId": reference["id"],
                "counts": category_counts(categories),
                "png": png_bytes(categories),
            }
        )
    return panels


def build_receipt(svg: bytes, panels: list[dict[str, Any]]) -> dict[str, Any]:
    receipt: dict[str, Any] = {
        "schemaVersion": SCHEMA,
        "receiptSha256": None,
        "evaluationReceiptSha256": evaluation.OUTPUT_RECEIPT_SHA256,
        "grid": evaluation.GRID,
        "render": {
            "relativePath": f"evaluation-references/diagnostics/{SVG_NAME}",
            "mediaType": "image/svg+xml",
            "bytes": len(svg),
            "sha256": sha256_bytes(svg),
            "categoryEncoding": CATEGORY_LABELS,
        },
        "comparisons": [
            {"referenceId": panel["referenceId"], **panel["counts"]} for panel in panels
        ],
        "isolation": {
            "metricsRecomputed": False,
            "modelRetuned": False,
            "thresholdChanged": False,
            "networkRequests": 0,
            "evaluationRuns": 0,
        },
    }
    receipt["receiptSha256"] = evaluation.canonical_identity(receipt, "receiptSha256")
    return receipt


def write_exact(path: Path, payload: bytes) -> None:
    if path.exists() and path.read_bytes() != payload:
        raise ValueError(f"Existing diagnostic artifact drifted: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(payload)
        temporary.replace(path)


def execute(data_root: Path, publication_output: Path | None) -> dict[str, Any]:
    evaluation.check_recorded_receipt(data_root, json.loads(evaluation.MANIFEST_PATH.read_text(encoding="utf-8")))
    panels = load_panels(data_root)
    svg = svg_bytes(panels)
    receipt = build_receipt(svg, panels)
    diagnostic_root = data_root / "evaluation-references" / "diagnostics"
    write_exact(diagnostic_root / SVG_NAME, svg)
    encoded = (json.dumps(receipt, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    write_exact(diagnostic_root / RECEIPT_NAME, encoded)
    if publication_output is not None:
        write_exact(publication_output.resolve(), svg)
    return receipt


def check(data_root: Path, publication_output: Path | None) -> dict[str, Any]:
    diagnostic_root = data_root / "evaluation-references" / "diagnostics"
    receipt_path = diagnostic_root / RECEIPT_NAME
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if evaluation.canonical_identity(receipt, "receiptSha256") != receipt.get("receiptSha256"):
        raise ValueError("Cumbria diagnostic receipt identity drifted")
    svg = (diagnostic_root / SVG_NAME).read_bytes()
    render = receipt.get("render", {})
    if len(svg) != render.get("bytes") or sha256_bytes(svg) != render.get("sha256"):
        raise ValueError("Cumbria diagnostic SVG drifted")
    if publication_output is not None and publication_output.resolve().read_bytes() != svg:
        raise ValueError("Published Cumbria diagnostic SVG drifted")
    evaluation.check_recorded_receipt(data_root, json.loads(evaluation.MANIFEST_PATH.read_text(encoding="utf-8")))
    panels = load_panels(data_root)
    rebuilt_svg = svg_bytes(panels)
    rebuilt_receipt = build_receipt(rebuilt_svg, panels)
    if rebuilt_svg != svg or rebuilt_receipt != receipt:
        raise ValueError("Cumbria diagnostics do not reproduce from the frozen masks")
    return receipt


def plan() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA,
        "mode": "dry_run",
        "evaluationReceiptSha256": evaluation.OUTPUT_RECEIPT_SHA256,
        "predictionArtifactsLoaded": 0,
        "referenceArtifactsLoaded": 0,
        "filesWritten": 0,
        "networkRequests": 0,
        "evaluationRuns": 0,
    }


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--publication-output")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--execute", action="store_true")
    mode.add_argument("--check", action="store_true")
    options = parser.parse_args(arguments)
    data_root = evaluation.ensure_external_data_root(Path(options.data_root), evaluation.REPOSITORY_ROOT)
    publication_output = Path(options.publication_output) if options.publication_output else None
    if options.execute:
        result = execute(data_root, publication_output)
        mode_name = "execute"
    elif options.check:
        result = check(data_root, publication_output)
        mode_name = "check"
    else:
        result = plan()
        mode_name = "dry_run"
    print(json.dumps({"mode": mode_name, "dataRoot": str(data_root), "result": result}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
