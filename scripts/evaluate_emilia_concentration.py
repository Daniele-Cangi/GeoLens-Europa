"""Evaluate the frozen Forli runoff-concentration baseline against V7 event 2.

The observed geometry is a post-event evaluation-only holdout. This script
never uses it as a model input or calibration target, and writes the derived
mask only below the external benchmark data root.
"""

from __future__ import annotations

import argparse
from array import array
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


def require_artifact(root, declared):
    path = root / declared["relativePath"]
    if not path.is_file():
        raise FileNotFoundError(f"Pinned artifact is missing: {path}")
    actual = artifact(root, path)
    if actual["bytes"] != declared["bytes"]:
        raise ValueError(f"Pinned artifact byte length changed: {path}")
    if actual["sha256"].lower() != declared["sha256"].lower():
        raise ValueError(f"Pinned artifact digest changed: {path}")
    return path, actual


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
    benchmark = manifest["benchmark"]
    protocol = next(
        item for item in benchmark["evaluationProtocols"] if item["id"] == PROTOCOL_ID
    )
    if (
        protocol["state"] != "protocol_frozen"
        or protocol["evaluationReferenceAccessAtFreeze"] != "not_loaded"
        or protocol["calibration"] is not False
        or protocol["calibrationPolicy"] != "none"
    ):
        raise ValueError("Evaluation protocol was not frozen before reference access")
    evaluation_dataset = next(
        item
        for item in manifest["datasets"]
        if item["id"] == protocol["evaluationDatasetId"]
    )
    if evaluation_dataset["role"] != "evaluation_reference" or evaluation_dataset[
        "allowedUses"
    ] != {"modelInput": False, "calibration": False, "evaluation": True}:
        raise ValueError("V7 is not isolated as an evaluation-only reference")

    declared_artifacts = {
        item["relativePath"]: item
        for item in benchmark.get("localArtifacts", [])
    }
    for baseline in benchmark["routingBaselines"]:
        for item in baseline["localArtifacts"]:
            declared_artifacts[item["relativePath"]] = item
    for dataset in manifest["datasets"]:
        for item in dataset.get("localArtifacts", []):
            declared_artifacts[item["relativePath"]] = item

    grid = benchmark["spatialProtocol"]["grid"]
    cell_count = grid["width"] * grid["height"]
    aoi_path, aoi_artifact = require_artifact(
        data_root, declared_artifacts["inputs/common-aoi-mask-u8.bin"]
    )
    aoi_mask = aoi_path.read_bytes()
    if len(aoi_mask) != cell_count or any(value not in (0, 1) for value in aoi_mask):
        raise ValueError("AOI mask is incompatible with the frozen grid")

    known_water_declared = next(
        value
        for key, value in declared_artifacts.items()
        if key.endswith("xdbtr-permanent-water-known-center-mask-u8.bin")
    )
    known_water_path, known_water_artifact = require_artifact(
        data_root, known_water_declared
    )
    known_water_mask = known_water_path.read_bytes()
    if len(known_water_mask) != cell_count:
        raise ValueError("Known-water mask is incompatible with the frozen grid")

    local_path, local_artifact = require_artifact(
        data_root,
        declared_artifacts[protocol["predictionArtifacts"]["localRunoffVolume"]],
    )
    accumulated_path, accumulated_artifact = require_artifact(
        data_root,
        declared_artifacts[
            protocol["predictionArtifacts"]["accumulatedRunoffVolume"]
        ],
    )
    local_runoff = read_f64le(local_path, cell_count)
    accumulated_runoff = read_f64le(accumulated_path, cell_count)

    archive_declared = next(
        item
        for item in evaluation_dataset["localArtifacts"]
        if item["relativePath"].endswith("rer-flood-extent-v7.zip")
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

    with sqlite3.connect(
        f"file:{gpkg_path.as_posix()}?mode=ro", uri=True
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
        protocol["score"]["negativeToleranceM3"],
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
            for fraction in protocol["areaFractions"]
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
        "protocolId": protocol["id"],
        "protocolStateAtEvaluation": protocol["state"],
        "evaluationReferenceAccessAtFreeze": protocol[
            "evaluationReferenceAccessAtFreeze"
        ],
        "calibration": False,
        "claimLevel": "hydrologic_routing_spatial_ranking_diagnostics",
        "grid": grid,
        "source": {
            "datasetId": evaluation_dataset["id"],
            "datasetVersion": evaluation_dataset["datasetVersion"],
            "layer": EVENT_LAYER,
            "crs": "EPSG:32632",
            "archive": archive_artifact,
            "extractedGeoPackage": artifact(data_root, gpkg_path),
            "redistribution": "restricted",
        },
        "prediction": {
            "baselineId": protocol["predictionBaselineId"],
            "score": protocol["score"],
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
