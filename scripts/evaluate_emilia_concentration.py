"""Evaluate the frozen Forli runoff-concentration baseline against V7 event 2.

The observed geometry is a post-event evaluation-only holdout. This script
never uses it as a model input or calibration target, and writes the derived
mask only below the external benchmark data root.
"""

from __future__ import annotations

import argparse
from array import array
from contextlib import closing
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import sys
from zipfile import ZipFile

from materialize_emilia_xdbtr_masks import (
    atomic_write,
    decode_geopackage_geometry,
    mark_scanline,
    polygon_bounds,
    portable_relative,
    scanline_intervals,
    sha256_file,
)


PROTOCOL_ID = "forli-event-runoff-concentration-v0"
EVENT_LAYER = "perimetrazioni_2023_zone_v7_ev2_pb_pl"
GPKG_NAME = "Perimetrazioni_maggio_v7_DSG_88_2025.gpkg"
EXPECTED_METRICS = [
    "roc_auc",
    "average_precision",
    "tie_weighted_overlap_at_frozen_area_fractions",
]
EXPECTED_AREA_FRACTIONS = [0.01, 0.05, 0.1, 0.2]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-root", default=os.environ.get("GEOLENS_BENCHMARK_DATA_ROOT")
    )
    parser.add_argument("--source")
    return parser.parse_args()


def artifact(root, path, **metadata):
    return {
        "relativePath": portable_relative(root, path),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        **metadata,
    }


def declared_artifact_map(items, label, required=True):
    if items is None and not required:
        return {}
    if not isinstance(items, list) or (required and not items):
        raise ValueError(f"{label} must be a non-empty artifact list")
    result = {}
    for index, item in enumerate(items):
        item_label = f"{label}[{index}]"
        if not isinstance(item, dict):
            raise ValueError(f"{item_label} must be an object")
        relative_path = item.get("relativePath")
        if not isinstance(relative_path, str) or not relative_path:
            raise ValueError(f"{item_label}.relativePath must be a string")
        segments = relative_path.split("/")
        if (
            "\\" in relative_path
            or relative_path.startswith("/")
            or (len(relative_path) >= 2 and relative_path[1] == ":")
            or any(segment in ("", ".", "..") for segment in segments)
        ):
            raise ValueError(f"{item_label}.relativePath is not portable")
        byte_count = item.get("bytes")
        if (
            isinstance(byte_count, bool)
            or not isinstance(byte_count, int)
            or byte_count <= 0
        ):
            raise ValueError(f"{item_label}.bytes must be a positive integer")
        digest = item.get("sha256")
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or any(character not in "0123456789abcdefABCDEF" for character in digest)
        ):
            raise ValueError(f"{item_label}.sha256 must be a SHA-256 digest")
        if relative_path in result:
            raise ValueError(f"{label} repeats artifact path {relative_path}")
        result[relative_path] = item
    return result


def assert_unique_artifact_namespace(groups):
    owners = {}
    for label, items in groups:
        for relative_path in declared_artifact_map(
            items, f"{label}.localArtifacts", required=False
        ):
            if relative_path in owners:
                raise ValueError(
                    f"Artifact path {relative_path} is declared by both "
                    f"{owners[relative_path]} and {label}"
                )
            owners[relative_path] = label


def require_object_array(items, label):
    if not isinstance(items, list) or not items:
        raise ValueError(f"{label} must be a non-empty array")
    if any(not isinstance(item, dict) for item in items):
        raise ValueError(f"{label} must contain only objects")
    return items


def require_named_item(items, item_id, label):
    checked = require_object_array(items, label)
    matches = [item for item in checked if item.get("id") == item_id]
    if len(matches) != 1:
        raise ValueError(f"{label} must contain exactly one item with id {item_id}")
    return matches[0]


def require_declared_artifact(artifacts, relative_path, label):
    declared = artifacts.get(relative_path)
    if declared is None:
        raise ValueError(f"{label} does not pin artifact {relative_path}")
    return declared


def require_artifact_suffix(artifacts, suffix, label):
    matches = [
        item for relative_path, item in artifacts.items() if relative_path.endswith(suffix)
    ]
    if len(matches) != 1:
        raise ValueError(f"{label} must pin exactly one artifact ending in {suffix}")
    return matches[0]


def require_artifact(root, declared):
    checked = declared_artifact_map([declared], "artifact")
    declared = next(iter(checked.values()))
    path = root / declared["relativePath"]
    if not path.is_file():
        raise FileNotFoundError(f"Pinned artifact is missing: {path}")
    actual = artifact(root, path)
    if actual["bytes"] != declared["bytes"]:
        raise ValueError(f"Pinned artifact byte length changed: {path}")
    if actual["sha256"].lower() != declared["sha256"].lower():
        raise ValueError(f"Pinned artifact digest changed: {path}")
    return path, actual


def validate_known_water_mask(known_water_mask, aoi_mask):
    if len(known_water_mask) != len(aoi_mask):
        raise ValueError("Known-water mask is incompatible with the frozen grid")
    for known_water, inside_aoi in zip(known_water_mask, aoi_mask):
        if inside_aoi == 1 and known_water not in (0, 1):
            raise ValueError("Known-water mask contains invalid in-AOI values")
        if inside_aoi == 0 and known_water != 255:
            raise ValueError("Known-water mask lacks its outside-AOI sentinel")


def read_f64le(path, expected_count):
    payload = path.read_bytes()
    if len(payload) != expected_count * 8:
        raise ValueError(f"Unexpected float64 array length: {path}")
    values = array("d")
    values.frombytes(payload)
    if sys.byteorder != "little":
        values.byteswap()
    return values


def verify_extracted_gpkg(archive_path, gpkg_path):
    with ZipFile(archive_path) as archive:
        matches = [
            member
            for member in archive.infolist()
            if Path(member.filename).name == gpkg_path.name
        ]
        if len(matches) != 1:
            raise ValueError("Pinned archive must contain exactly one V7 GeoPackage")
        digest = hashlib.sha256()
        extracted_bytes = 0
        with archive.open(matches[0]) as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
                extracted_bytes += len(chunk)
    if extracted_bytes != gpkg_path.stat().st_size:
        raise ValueError("Extracted V7 GeoPackage length differs from pinned archive")
    if digest.hexdigest().lower() != sha256_file(gpkg_path).lower():
        raise ValueError("Extracted V7 GeoPackage differs from pinned archive")


def rasterize_center_polygon(polygon, observed_mask, aoi_mask, grid):
    _, min_y, _, max_y = polygon_bounds(polygon)
    _, grid_min_y, _, grid_max_y = grid["bounds"]
    cell_size = grid["cellSizeM"]
    height = grid["height"]
    if max_y < grid_min_y or min_y > grid_max_y:
        return
    first_row = max(0, math.floor((grid_max_y - max_y) / cell_size))
    last_row = min(height - 1, math.floor((grid_max_y - min_y) / cell_size))
    for row in range(first_row, last_row + 1):
        center_y = grid_max_y - (row + 0.5) * cell_size
        mark_scanline(
            scanline_intervals(polygon, center_y),
            center_y,
            1,
            None,
            observed_mask,
            aoi_mask,
            grid,
        )


def materialize_observed_mask(connection, aoi_mask, grid):
    content = connection.execute(
        "SELECT min_x,min_y,max_x,max_y,srs_id FROM gpkg_contents "
        "WHERE table_name=? AND data_type='features'",
        (EVENT_LAYER,),
    ).fetchone()
    if content is None:
        raise ValueError(f"V7 GeoPackage lacks layer {EVENT_LAYER}")
    if content[4] != 32632:
        raise ValueError("V7 event-2 layer must use EPSG:32632")
    geometry = connection.execute(
        "SELECT column_name,geometry_type_name,srs_id FROM gpkg_geometry_columns "
        "WHERE table_name=?",
        (EVENT_LAYER,),
    ).fetchone()
    if geometry is None or geometry[0] != "geom" or geometry[2] != 32632:
        raise ValueError("V7 event-2 geometry metadata is incompatible")

    cell_count = grid["width"] * grid["height"]
    observed_mask = bytearray(255 if value == 0 else 0 for value in aoi_mask)
    feature_count = 0
    polygon_count = 0
    for (encoded_geometry,) in connection.execute(
        f'SELECT geom FROM "{EVENT_LAYER}"'
    ):
        feature_count += 1
        if encoded_geometry is None:
            raise ValueError("V7 event-2 feature has missing geometry")
        polygons = decode_geopackage_geometry(encoded_geometry)
        if not polygons:
            raise ValueError("V7 event-2 feature has empty geometry")
        polygon_count += len(polygons)
        for polygon in polygons:
            rasterize_center_polygon(polygon, observed_mask, aoi_mask, grid)
    if len(observed_mask) != cell_count:
        raise AssertionError("Observed mask dimensions drifted from frozen grid")
    return observed_mask, {
        "sourceFeatureCount": feature_count,
        "decodedPolygonCount": polygon_count,
        "observedCenterCellsInsideAoi": sum(value == 1 for value in observed_mask),
    }


def derive_evaluation_vectors(
    aoi_mask,
    known_water_mask,
    observed_mask,
    local_runoff,
    accumulated_runoff,
    negative_tolerance,
):
    scores = []
    labels = []
    counts = {
        "aoiCells": 0,
        "evaluatedCells": 0,
        "excludedAccumulatedNoData": 0,
        "excludedLocalNoData": 0,
        "knownWaterStructuralZeroSubtractions": 0,
        "clampedRoundoffNegatives": 0,
    }
    for index, inside in enumerate(aoi_mask):
        if inside == 0:
            continue
        counts["aoiCells"] += 1
        accumulated = accumulated_runoff[index]
        if not math.isfinite(accumulated):
            counts["excludedAccumulatedNoData"] += 1
            continue
        if accumulated < 0:
            raise ValueError("Accumulated runoff contains a negative physical value")
        local = local_runoff[index]
        if not math.isfinite(local):
            if known_water_mask[index] == 1:
                local = 0.0
                counts["knownWaterStructuralZeroSubtractions"] += 1
            else:
                counts["excludedLocalNoData"] += 1
                continue
        if local < 0:
            raise ValueError("Local runoff contains a negative physical value")
        score = accumulated - local
        if score < -negative_tolerance:
            raise ValueError("Routed upstream excess is meaningfully negative")
        if score < 0:
            score = 0.0
            counts["clampedRoundoffNegatives"] += 1
        label = observed_mask[index]
        if label not in (0, 1):
            raise ValueError("Observed mask is missing inside the evaluation domain")
        scores.append(score)
        labels.append(label)
    counts["evaluatedCells"] = len(scores)
    counts["observedPositiveCells"] = sum(labels)
    return scores, labels, counts


def grouped_score_counts(scores, labels, reverse=False):
    ordered = sorted(zip(scores, labels), key=lambda item: item[0], reverse=reverse)
    groups = []
    for score, label in ordered:
        if not groups or score != groups[-1][0]:
            groups.append([score, 0, 0])
        groups[-1][1] += 1
        groups[-1][2] += label
    return groups


def roc_auc(scores, labels):
    positives = sum(labels)
    negatives = len(labels) - positives
    if positives == 0 or negatives == 0:
        raise ValueError("ROC AUC requires both observed and unobserved cells")
    rank_start = 1
    positive_rank_sum = 0.0
    for _, count, group_positives in grouped_score_counts(scores, labels):
        average_rank = (rank_start + rank_start + count - 1) / 2
        positive_rank_sum += average_rank * group_positives
        rank_start += count
    return (
        positive_rank_sum - positives * (positives + 1) / 2
    ) / (positives * negatives)


def average_precision(scores, labels):
    positives = sum(labels)
    if positives == 0:
        raise ValueError("Average precision requires observed cells")
    cumulative_count = 0
    cumulative_positives = 0
    result = 0.0
    for _, count, group_positives in grouped_score_counts(
        scores, labels, reverse=True
    ):
        cumulative_count += count
        cumulative_positives += group_positives
        result += (group_positives / positives) * (
            cumulative_positives / cumulative_count
        )
    return result


def overlap_at_area_fraction(scores, labels, fraction, cell_area_m2):
    target_count = fraction * len(scores)
    above_count = 0
    above_observed = 0
    threshold = None
    equal_count = 0
    equal_observed = 0
    for score, count, group_observed in grouped_score_counts(
        scores, labels, reverse=True
    ):
        if target_count <= above_count + count:
            threshold = score
            equal_count = count
            equal_observed = group_observed
            break
        above_count += count
        above_observed += group_observed
    if threshold is None or equal_count == 0:
        raise AssertionError("Frozen area fraction did not resolve a threshold")
    tie_weight = (target_count - above_count) / equal_count
    intersection = above_observed + tie_weight * equal_observed
    observed_count = sum(labels)
    union = target_count + observed_count - intersection
    return {
        "areaFraction": fraction,
        "thresholdM3": threshold,
        "fullCellsAboveThreshold": above_count,
        "cellsEqualThreshold": equal_count,
        "fractionalTieWeight": tie_weight,
        "selectedEquivalentCells": target_count,
        "selectedEquivalentAreaM2": target_count * cell_area_m2,
        "weightedIntersectionCells": intersection,
        "precision": intersection / target_count,
        "recall": intersection / observed_count,
        "intersectionOverUnion": intersection / union,
    }


def score_summary(values):
    ordered = sorted(values)
    count = len(ordered)
    midpoint = count // 2
    median = (
        ordered[midpoint]
        if count % 2
        else (ordered[midpoint - 1] + ordered[midpoint]) / 2
    )
    return {
        "count": count,
        "minimumM3": ordered[0],
        "maximumM3": ordered[-1],
        "meanM3": math.fsum(ordered) / count,
        "medianM3": median,
        "zeroCells": sum(value == 0 for value in ordered),
    }


def main():
    arguments = parse_args()
    if not arguments.data_root:
        raise SystemExit("Set GEOLENS_BENCHMARK_DATA_ROOT or pass --data-root")
    repository_root = Path(__file__).resolve().parents[1]
    data_root = Path(arguments.data_root).resolve()
    manifest_path = (
        repository_root
        / "tests"
        / "ground-truth"
        / "emilia-romagna-2023"
        / "manifest.json"
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("manifestVersion") != "1.15.0":
        raise ValueError("Evaluator requires historical benchmark manifest v1.15.0")
    benchmark = manifest.get("benchmark")
    if not isinstance(benchmark, dict):
        raise ValueError("Manifest benchmark must be an object")
    protocol = require_named_item(
        benchmark.get("evaluationProtocols"), PROTOCOL_ID, "evaluationProtocols"
    )
    if (
        protocol.get("state") != "protocol_frozen"
        or protocol.get("evaluationReferenceAccessAtFreeze") != "not_loaded"
        or protocol.get("calibration") is not False
        or protocol.get("calibrationPolicy") != "none"
        or protocol.get("metrics") != EXPECTED_METRICS
        or protocol.get("areaFractions") != EXPECTED_AREA_FRACTIONS
    ):
        raise ValueError("Evaluation protocol was not frozen before reference access")
    prediction_artifacts = protocol.get("predictionArtifacts")
    score_contract = protocol.get("score")
    if (
        not isinstance(prediction_artifacts, dict)
        or not isinstance(score_contract, dict)
        or score_contract.get("semantics") != "routed_upstream_excess_volume"
        or score_contract.get("formula")
        != "accumulated_runoff_volume_m3_minus_local_runoff_volume_m3"
        or score_contract.get("knownWaterLocalSource")
        != "structural_zero_only_for_score_subtraction"
    ):
        raise ValueError("Evaluation score contract is malformed or unsupported")
    negative_tolerance = score_contract.get("negativeToleranceM3")
    if (
        isinstance(negative_tolerance, bool)
        or not isinstance(negative_tolerance, (int, float))
        or not math.isfinite(negative_tolerance)
        or negative_tolerance < 0
        or negative_tolerance > 1e-6
    ):
        raise ValueError("Evaluation score negative tolerance is invalid")

    datasets = require_object_array(manifest.get("datasets"), "datasets")
    evaluation_dataset = require_named_item(
        datasets,
        protocol.get("evaluationDatasetId"),
        "datasets",
    )
    if evaluation_dataset.get("role") != "evaluation_reference" or evaluation_dataset.get(
        "allowedUses"
    ) != {"modelInput": False, "calibration": False, "evaluation": True}:
        raise ValueError("V7 is not isolated as an evaluation-only reference")

    routing_baselines = require_object_array(
        benchmark.get("routingBaselines"), "routingBaselines"
    )
    prediction_baseline = require_named_item(
        routing_baselines,
        protocol.get("predictionBaselineId"),
        "routingBaselines",
    )
    spatial_protocol = benchmark.get("spatialProtocol")
    if not isinstance(spatial_protocol, dict):
        raise ValueError("Benchmark spatialProtocol must be an object")
    masks = spatial_protocol.get("masks")
    if not isinstance(masks, dict) or not isinstance(masks.get("permanentWater"), dict):
        raise ValueError("Benchmark permanent-water mask contract is missing")
    permanent_water_dataset = require_named_item(
        datasets,
        masks["permanentWater"].get("datasetId"),
        "datasets",
    )
    evaluation_runs = require_object_array(
        benchmark.get("evaluationRuns"), "evaluationRuns"
    )
    artifact_groups = [("benchmark", benchmark.get("localArtifacts"))]
    artifact_groups.extend(
        (f"routingBaselines[{index}]", item.get("localArtifacts"))
        for index, item in enumerate(routing_baselines)
    )
    artifact_groups.extend(
        (f"evaluationRuns[{index}]", item.get("localArtifacts"))
        for index, item in enumerate(evaluation_runs)
    )
    artifact_groups.extend(
        (f"datasets[{index}]", item.get("localArtifacts"))
        for index, item in enumerate(datasets)
    )
    assert_unique_artifact_namespace(artifact_groups)
    benchmark_artifacts = declared_artifact_map(
        benchmark.get("localArtifacts"), "benchmark.localArtifacts"
    )
    baseline_artifacts = declared_artifact_map(
        prediction_baseline.get("localArtifacts"),
        "predictionBaseline.localArtifacts",
    )
    permanent_water_artifacts = declared_artifact_map(
        permanent_water_dataset.get("localArtifacts"),
        "permanentWaterDataset.localArtifacts",
    )
    evaluation_artifacts = declared_artifact_map(
        evaluation_dataset.get("localArtifacts"),
        "evaluationDataset.localArtifacts",
    )

    grid = spatial_protocol.get("grid")
    if not isinstance(grid, dict):
        raise ValueError("Benchmark grid must be an object")
    cell_count = grid["width"] * grid["height"]
    aoi_path, aoi_artifact = require_artifact(
        data_root,
        require_declared_artifact(
            benchmark_artifacts,
            "inputs/common-aoi-mask-u8.bin",
            "benchmark.localArtifacts",
        ),
    )
    aoi_mask = aoi_path.read_bytes()
    if len(aoi_mask) != cell_count or any(value not in (0, 1) for value in aoi_mask):
        raise ValueError("AOI mask is incompatible with the frozen grid")

    known_water_declared = require_artifact_suffix(
        permanent_water_artifacts,
        "xdbtr-permanent-water-known-center-mask-u8.bin",
        "permanent-water dataset",
    )
    known_water_path, known_water_artifact = require_artifact(
        data_root, known_water_declared
    )
    known_water_mask = known_water_path.read_bytes()
    if len(known_water_mask) != cell_count:
        raise ValueError("Known-water mask is incompatible with the frozen grid")
    validate_known_water_mask(known_water_mask, aoi_mask)

    local_relative_path = prediction_artifacts.get("localRunoffVolume")
    accumulated_relative_path = prediction_artifacts.get("accumulatedRunoffVolume")
    if not isinstance(local_relative_path, str) or not isinstance(
        accumulated_relative_path, str
    ):
        raise ValueError("Evaluation prediction artifact paths are invalid")
    local_path, local_artifact = require_artifact(
        data_root,
        require_declared_artifact(
            baseline_artifacts,
            local_relative_path,
            "prediction baseline",
        ),
    )
    accumulated_path, accumulated_artifact = require_artifact(
        data_root,
        require_declared_artifact(
            baseline_artifacts,
            accumulated_relative_path,
            "prediction baseline",
        ),
    )
    local_runoff = read_f64le(local_path, cell_count)
    accumulated_runoff = read_f64le(accumulated_path, cell_count)

    archive_declared = require_artifact_suffix(
        evaluation_artifacts,
        "rer-flood-extent-v7.zip",
        "evaluation dataset",
    )
    archive_path, archive_artifact = require_artifact(data_root, archive_declared)
    gpkg_path = (
        Path(arguments.source).resolve()
        if arguments.source
        else data_root / "source" / "rer-flood-extent-v7" / GPKG_NAME
    )
    if not gpkg_path.is_file():
        raise FileNotFoundError(f"Extracted V7 GeoPackage is missing: {gpkg_path}")
    verify_extracted_gpkg(archive_path, gpkg_path)

    with closing(
        sqlite3.connect(f"file:{gpkg_path.as_posix()}?mode=ro", uri=True)
    ) as connection:
        connection.execute("PRAGMA query_only=ON")
        observed_mask, observed_counts = materialize_observed_mask(
            connection, aoi_mask, grid
        )

    scores, labels, domain_counts = derive_evaluation_vectors(
        aoi_mask,
        known_water_mask,
        observed_mask,
        local_runoff,
        accumulated_runoff,
        negative_tolerance,
    )
    if not scores or sum(labels) in (0, len(labels)):
        raise ValueError("Evaluation domain must contain both observed classes")
    cell_area_m2 = grid["cellSizeM"] ** 2
    observed_scores = [score for score, label in zip(scores, labels) if label == 1]
    unobserved_scores = [score for score, label in zip(scores, labels) if label == 0]
    results = {
        "observedPrevalence": sum(labels) / len(labels),
        "rocAuc": roc_auc(scores, labels),
        "averagePrecision": average_precision(scores, labels),
        "overlapAtFrozenAreaFractions": [
            overlap_at_area_fraction(scores, labels, fraction, cell_area_m2)
            for fraction in EXPECTED_AREA_FRACTIONS
        ],
        "scoreSummary": {
            "observed": score_summary(observed_scores),
            "unobserved": score_summary(unobserved_scores),
        },
    }

    output_root = data_root / "restricted-evaluation"
    output_root.mkdir(parents=True, exist_ok=True)
    mask_path = output_root / "rer-v7-event2-observed-center-mask-u8.bin"
    atomic_write(mask_path, bytes(observed_mask))
    mask_artifact = artifact(
        data_root,
        mask_path,
        encoding=(
            "uint8 row-major north-to-south; 1=cell centre inside official V7 "
            "event-2 union; 0=outside observed union; 255=outside AOI"
        ),
        redistribution="restricted",
    )
    receipt_path = output_root / "forli-event-runoff-concentration-v0.json"
    receipt = {
        "schemaVersion": "blind-concentration-evaluation-v0.1.0",
        "protocolId": protocol.get("id"),
        "protocolStateAtEvaluation": protocol.get("state"),
        "evaluationReferenceAccessAtFreeze": protocol.get(
            "evaluationReferenceAccessAtFreeze"
        ),
        "calibration": False,
        "claimLevel": "hydrologic_routing_spatial_ranking_diagnostics",
        "grid": grid,
        "source": {
            "datasetId": evaluation_dataset.get("id"),
            "datasetVersion": evaluation_dataset.get("datasetVersion"),
            "layer": EVENT_LAYER,
            "crs": "EPSG:32632",
            "archive": archive_artifact,
            "extractedGeoPackage": artifact(data_root, gpkg_path),
            "redistribution": "restricted",
        },
        "prediction": {
            "baselineId": protocol.get("predictionBaselineId"),
            "score": score_contract,
            "artifacts": {
                "aoi": aoi_artifact,
                "knownWater": known_water_artifact,
                "localRunoffVolume": local_artifact,
                "accumulatedRunoffVolume": accumulated_artifact,
            },
        },
        "observedMask": mask_artifact,
        "counts": {**observed_counts, **domain_counts},
        "results": results,
        "limitations": [
            "The evaluated output is routed runoff concentration, not predicted inundation extent.",
            "No threshold was fitted to the observed V7 geometry.",
            "No water depth, flood probability or operational forecast is validated.",
            "The observed mask and source geometry remain local and redistribution-restricted.",
        ],
    }
    atomic_write(
        receipt_path,
        (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode("utf-8"),
    )
    print(json.dumps({
        "receipt": str(receipt_path),
        "observedMask": mask_artifact,
        "counts": receipt["counts"],
        "results": results,
    }, indent=2))


if __name__ == "__main__":
    main()
