"""Materialize the frozen ARPAE station comparison for the Forli replay.

The Dext3r response is preserved byte-for-byte as source evidence. This script
only emits a derived receipt: rainfall is compared with the nearest native
IMERG cell, while hydrometric stages remain local-datum, within-station
observations. Empty source values remain explicitly missing; numeric zero is
never used as a substitute and remains valid when it is actually present.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
from zipfile import ZipFile


PROTOCOL_ID = "forli-arpae-observation-comparison-v0"
OBSERVATION_DATASET_ID = "arpae-dext3r-2023-hourly-observations"
IMERG_DATASET_ID = "nasa-imerg-v07"
RESULT_VERSION = "arpae-imerg-station-comparison-v0.1.0"
RECEIPT_RELATIVE_PATH = (
    "derived/arpae-comparison/forli-arpae-observation-comparison-v0.json"
)
RAINFALL_HEADER = "Precipitazione cumulata su 1 ora (KG/M**2)"
HYDROMETRY_HEADER = "Livello idrometrico (M)"
EXPECTED_RAINFALL_VARIABLE = "1,0,3600/1,-,-,-/B13011"
EXPECTED_HYDROMETRY_VARIABLE = "254,0,0/1,-,-,-/B13215"
EXPECTED_IMERG_VALUE_ORDER = "longitude_major_latitude_minor"

ANNUAL_RAINFALL_CROSS_CHECKS = {
    "-/1204182,4422039/urbane": {
        "dailyValuesMm": [29.4, 84.0],
        "validatedTotalMm": 113.4,
    },
    "-/1199295,4426279/spdsra": {
        "dailyValuesMm": [33.6, 96.8],
        "validatedTotalMm": 130.4,
    },
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-root", default=os.environ.get("GEOLENS_BENCHMARK_DATA_ROOT")
    )
    parser.add_argument(
        "--manifest",
        default=(
            Path(__file__).resolve().parents[1]
            / "tests"
            / "ground-truth"
            / "emilia-romagna-2023"
            / "manifest.json"
        ),
    )
    return parser.parse_args()


def parse_timestamp(value, label):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError) as error:
        raise ValueError(f"{label} must be an ISO 8601 timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def iso_z(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def portable_relative(root, path):
    relative = path.resolve().relative_to(root.resolve()).as_posix()
    if any(segment in ("", ".", "..") for segment in relative.split("/")):
        raise ValueError(f"Non-portable artifact path: {relative}")
    return relative


def artifact(root, path):
    return {
        "relativePath": portable_relative(root, path),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def atomic_json(path, value):
    encoded = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf8")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(encoded)
    os.replace(temporary, path)


def require_named_item(items, item_id, label):
    if not isinstance(items, list):
        raise ValueError(f"{label} must be an array")
    matches = [item for item in items if item.get("id") == item_id]
    if len(matches) != 1:
        raise ValueError(f"{label} must contain exactly one item with id {item_id}")
    return matches[0]


def declared_artifact(data_root, dataset, suffix):
    matches = [
        item
        for item in dataset.get("localArtifacts", [])
        if item.get("relativePath", "").endswith(suffix)
    ]
    if len(matches) != 1:
        raise ValueError(f"{dataset['id']} must pin exactly one {suffix} artifact")
    declared = matches[0]
    path = data_root / declared["relativePath"]
    if not path.is_file():
        raise FileNotFoundError(f"Pinned artifact is missing: {path}")
    if path.stat().st_size != declared["bytes"]:
        raise ValueError(f"Pinned artifact byte length changed: {path}")
    if sha256_file(path).lower() != declared["sha256"].lower():
        raise ValueError(f"Pinned artifact digest changed: {path}")
    return path, artifact(data_root, path)


def verify_archive(zip_path, csv_path):
    with ZipFile(zip_path) as archive:
        files = [item for item in archive.infolist() if not item.is_dir()]
        if len(files) != 1 or Path(files[0].filename).name != csv_path.name:
            raise ValueError("Dext3r ZIP must contain exactly the pinned CSV")
        digest = hashlib.sha256()
        byte_count = 0
        with archive.open(files[0]) as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
                byte_count += len(chunk)
    if byte_count != csv_path.stat().st_size:
        raise ValueError("Dext3r ZIP member length differs from the pinned CSV")
    if digest.hexdigest().lower() != sha256_file(csv_path).lower():
        raise ValueError("Dext3r ZIP member differs from the pinned CSV")


def parse_sections(path):
    sections = {}
    station = None
    current = None
    metadata_mode = None
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row_number, row in enumerate(csv.reader(handle), start=1):
            if not row or all(not value.strip() for value in row):
                current = None
                continue
            row = [value.strip() for value in row]
            if row == ["Arpae-SIMC"]:
                continue
            if row[0] == "Nome della stazione":
                if len(row) != 10 or row[-1] != "Bacino":
                    raise ValueError(f"Invalid Dext3r station metadata header at line {row_number}")
                current = None
                station = None
                metadata_mode = "stations"
                continue
            if row[0] == "Nome della variabile":
                if row != ["Nome della variabile", "Unita' di misura"]:
                    raise ValueError(f"Invalid Dext3r variable metadata header at line {row_number}")
                current = None
                station = None
                metadata_mode = "variables"
                continue
            if metadata_mode is not None:
                expected_length = 10 if metadata_mode == "stations" else 2
                if len(row) != expected_length:
                    raise ValueError(f"Invalid Dext3r {metadata_mode} metadata at line {row_number}")
                continue
            if len(row) == 1:
                station = row[0]
                current = None
                continue
            if len(row) != 3:
                raise ValueError(f"Unexpected Dext3r row shape at line {row_number}")
            if row[0] == "Inizio validità (UTC)":
                if station is None or row[1] != "Fine validità (UTC)":
                    raise ValueError(f"Invalid Dext3r section header at line {row_number}")
                if row[2] == RAINFALL_HEADER:
                    kind = "rainfall"
                elif row[2] == HYDROMETRY_HEADER:
                    kind = "hydrometry"
                else:
                    raise ValueError(f"Unsupported Dext3r variable at line {row_number}")
                key = (station, kind)
                if key in sections:
                    raise ValueError(f"Duplicate Dext3r section for {station} {kind}")
                current = {"station": station, "kind": kind, "records": []}
                sections[key] = current
                continue
            if current is None:
                raise ValueError(f"Observation outside a Dext3r section at line {row_number}")
            start = parse_timestamp(row[0], f"line {row_number} start")
            end = parse_timestamp(row[1], f"line {row_number} end")
            if row[2] == "":
                value = None
            else:
                try:
                    value = float(row[2])
                except ValueError as error:
                    raise ValueError(f"Invalid numeric value at line {row_number}") from error
            if value is not None and not math.isfinite(value):
                raise ValueError(f"Non-finite numeric value at line {row_number}")
            if current["kind"] == "rainfall" and value is not None and value < 0:
                raise ValueError(f"Negative rainfall at line {row_number}")
            current["records"].append(
                {"start": start, "end": end, "value": value, "line": row_number}
            )
    return sections


def nearest_index(values, target):
    if not isinstance(values, list) or not values:
        raise ValueError("IMERG coordinate axis must be a non-empty array")
    numeric = [float(value) for value in values]
    if any(not math.isfinite(value) for value in numeric):
        raise ValueError("IMERG coordinate axis contains non-finite values")
    return min(range(len(numeric)), key=lambda index: (abs(numeric[index] - target), index))


def load_imerg_grid(path, window_start, window_end):
    value = json.loads(path.read_text(encoding="utf8"))
    if value.get("status") != "available" or value.get("unit") != "mm":
        raise ValueError("IMERG grid must contain available rainfall in mm")
    if value.get("sourceGrid", {}).get("valueOrder") != EXPECTED_IMERG_VALUE_ORDER:
        raise ValueError("IMERG grid value order is unsupported")
    temporal = value.get("temporal", {})
    actual_start = parse_timestamp(temporal.get("actualWindowStart"), "IMERG start")
    actual_end = parse_timestamp(temporal.get("actualWindowEnd"), "IMERG end")
    if actual_start != window_start or actual_end != window_end:
        raise ValueError("IMERG grid does not cover the frozen comparison window")
    if value.get("sourceResolution") != "0.1 degree":
        raise ValueError("IMERG grid must retain its 0.1 degree source resolution")
    return value


def sample_imerg(grid, station):
    source = grid["sourceGrid"]
    longitude_index = nearest_index(source["longitude"], station["longitude"])
    latitude_index = nearest_index(source["latitude"], station["latitude"])
    try:
        value = float(source["precipitationMm"][longitude_index][latitude_index])
    except (IndexError, TypeError, ValueError) as error:
        raise ValueError("IMERG precipitation grid is incompatible with its axes") from error
    if not math.isfinite(value) or value < 0:
        raise ValueError("Sampled IMERG rainfall is missing, invalid or negative")
    return {
        "longitude": float(source["longitude"][longitude_index]),
        "latitude": float(source["latitude"][latitude_index]),
        "sourceResolution": grid["sourceResolution"],
        "samplingMethod": "nearest_imerg_native_grid_cell",
        "rainfallMm": value,
    }


def records_in_window(records, start, end):
    return [record for record in records if start <= record["start"] < end]


def rainfall_result(station, section, grid, window_start, window_end):
    records = records_in_window(section["records"], window_start, window_end)
    records.sort(key=lambda item: item["start"])
    available = [record for record in records if record["value"] is not None]
    expected_count = int((window_end - window_start).total_seconds() / 3600)
    expected_starts = [
        window_start + timedelta(hours=index) for index in range(expected_count)
    ]
    complete = len(records) == expected_count and len(available) == expected_count
    if complete:
        for record, expected_start in zip(available, expected_starts, strict=True):
            if (
                record["start"] != expected_start
                or record["end"] != expected_start + timedelta(hours=1)
            ):
                complete = False
                break
    covered_hours = sum(
        max(0.0, (record["end"] - record["start"]).total_seconds() / 3600)
        for record in available
        if record["end"] > record["start"]
    )
    sampled = sample_imerg(grid, station)
    gauge_total = round(sum(record["value"] for record in available), 10) if complete else None
    difference = (
        round(sampled["rainfallMm"] - gauge_total, 10)
        if gauge_total is not None
        else None
    )
    return {
        "stationId": station["stationId"],
        "name": station["name"],
        "quality": "available" if complete else "incomplete_window",
        "rawRecordCount": len(records),
        "recordCount": len(available),
        "missingRecordCount": len(records) - len(available),
        "coveredHours": round(covered_hours, 10),
        "gaugeTotalMm": gauge_total,
        "imergTotalMm": sampled["rainfallMm"],
        "imergMinusGaugeMm": difference,
        "sampledImergCell": sampled,
    }


def maximum_one_hour_rise(records):
    by_time = {record["start"]: record for record in records}
    candidates = []
    for current in records:
        prior = current["start"] - timedelta(hours=1)
        required = [prior + timedelta(minutes=15 * index) for index in range(5)]
        if all(timestamp in by_time for timestamp in required):
            candidates.append(round(current["value"] - by_time[prior]["value"], 10))
    return max(candidates) if candidates else None


def hydrometry_result(station, section, window_start, window_end):
    raw = records_in_window(section["records"], window_start, window_end)
    raw.sort(key=lambda item: item["start"])
    accepted = [record for record in raw if record["value"] is not None]
    missing_count = len(raw) - len(accepted)
    expected_count = int((window_end - window_start).total_seconds() / (15 * 60))
    complete = (
        len(accepted) == expected_count
        and all(
            record["start"] == window_start + timedelta(minutes=15 * index)
            for index, record in enumerate(accepted)
        )
    )
    if accepted:
        maximum = max(accepted, key=lambda item: (item["value"], -item["line"]))
        coverage_start = iso_z(accepted[0]["start"])
        coverage_end = iso_z(accepted[-1]["start"])
        maximum_stage = maximum["value"]
        maximum_at = iso_z(maximum["start"])
    else:
        coverage_start = None
        coverage_end = None
        maximum_stage = None
        maximum_at = None
    return {
        "stationId": station["stationId"],
        "name": station["name"],
        "quality": "available" if complete else "incomplete_window",
        "rawRecordCount": len(raw),
        "recordCount": len(accepted),
        "missingRecordCount": missing_count,
        "coverageStart": coverage_start,
        "coverageEnd": coverage_end,
        "maximumStageM": maximum_stage,
        "maximumStageAt": maximum_at,
        "maximumOneHourRiseM": maximum_one_hour_rise(accepted),
    }


def require_section(sections, station_name, kind):
    key = (station_name, kind)
    if key not in sections:
        raise ValueError(f"Dext3r response lacks {kind} section for {station_name}")
    return sections[key]


def materialize(data_root, manifest_path):
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    benchmark = manifest["benchmark"]
    protocol = require_named_item(
        benchmark["observationComparisonProtocols"],
        PROTOCOL_ID,
        "benchmark.observationComparisonProtocols",
    )
    if protocol.get("state") != "protocol_frozen" or protocol.get("calibration") is not False:
        raise ValueError("ARPAE comparison protocol must remain frozen and uncalibrated")
    if protocol["rainfall"].get("variableId") != EXPECTED_RAINFALL_VARIABLE:
        raise ValueError("Frozen rainfall variable changed")
    if protocol["hydrometry"].get("variableId") != EXPECTED_HYDROMETRY_VARIABLE:
        raise ValueError("Frozen hydrometry variable changed")
    window_start = parse_timestamp(protocol["window"]["start"], "window start")
    window_end = parse_timestamp(protocol["window"]["endExclusive"], "window end")

    observation_dataset = require_named_item(
        manifest["datasets"], OBSERVATION_DATASET_ID, "datasets"
    )
    imerg_dataset = require_named_item(manifest["datasets"], IMERG_DATASET_ID, "datasets")
    zip_path, zip_artifact = declared_artifact(data_root, observation_dataset, ".zip")
    csv_path, csv_artifact = declared_artifact(data_root, observation_dataset, ".csv")
    grid_path, grid_artifact = declared_artifact(
        data_root, imerg_dataset, "imerg-v07-final-48h-source-grid.json"
    )
    verify_archive(zip_path, csv_path)
    sections = parse_sections(csv_path)
    grid = load_imerg_grid(grid_path, window_start, window_end)

    rainfall = [
        rainfall_result(
            station,
            require_section(sections, station["name"], "rainfall"),
            grid,
            window_start,
            window_end,
        )
        for station in protocol["rainfall"]["stations"]
    ]
    hydrometry = [
        hydrometry_result(
            station,
            require_section(sections, station["name"], "hydrometry"),
            window_start,
            window_end,
        )
        for station in protocol["hydrometry"]["stations"]
    ]
    transformations = []
    for result in hydrometry:
        if result["missingRecordCount"] > 0:
            transformations.append(
                {
                    "stationId": result["stationId"],
                    "decisionTiming": "source_parse",
                    "rule": "blank_source_value_is_missing",
                    "missingRecordCount": result["missingRecordCount"],
                    "reason": (
                        "The Dext3r CSV retains the timestamp but leaves the value "
                        "field empty; no numeric value, including zero, is inferred."
                    ),
                }
            )
    cross_checks = []
    for result in rainfall:
        annual = ANNUAL_RAINFALL_CROSS_CHECKS.get(result["stationId"])
        if annual is None or result["gaugeTotalMm"] is None:
            continue
        cross_checks.append(
            {
                "stationId": result["stationId"],
                "sourceDatasetId": "arpae-2023-pluviometry",
                "sourceResolution": "daily validated annual table",
                **annual,
                "dext3rMinusValidatedAnnualMm": round(
                    result["gaugeTotalMm"] - annual["validatedTotalMm"], 10
                ),
                "interpretation": (
                    "Contextual cross-check only; archive revisions and interval/day "
                    "boundaries may differ, so equality is not forced."
                ),
            }
        )

    acquired_at = observation_dataset.get("acquiredAt")
    parse_timestamp(acquired_at, "observation dataset acquiredAt")
    request_id = observation_dataset.get("requestId")
    if not isinstance(request_id, str) or not request_id:
        raise ValueError("Observation dataset must retain its Dext3r requestId")
    receipt = {
        "schemaVersion": "arpae-observation-comparison-receipt-v0.1.0",
        "protocolId": PROTOCOL_ID,
        "resultVersion": RESULT_VERSION,
        "state": "materialized",
        "claimLevel": "station_observation_comparison",
        "observationAccess": "loaded_after_protocol_freeze",
        "calibration": False,
        "window": {
            "start": iso_z(window_start),
            "endExclusive": iso_z(window_end),
            "timezone": "UTC",
        },
        "source": {
            "provider": "ARPAE Emilia-Romagna Dext3r",
            "datasetId": OBSERVATION_DATASET_ID,
            "requestId": request_id,
            "acquiredAt": acquired_at,
            "artifacts": [zip_artifact, csv_artifact],
        },
        "imergSource": {
            "datasetId": IMERG_DATASET_ID,
            "datasetVersion": grid["provenance"]["datasetVersion"],
            "product": grid["provenance"]["dataset"],
            "runType": grid["provenance"]["runType"],
            "sourceResolution": grid["sourceResolution"],
            "artifact": grid_artifact,
        },
        "rainfall": rainfall,
        "hydrometry": hydrometry,
        "observationValidityTransformations": transformations,
        "contextualAnnualRainfallCrossChecks": cross_checks,
        "quality": comparison_quality(rainfall, hydrometry),
        "methodologyNote": (
            "Rainfall uses the frozen half-open 48-hour window and the nearest "
            "native 0.1 degree IMERG cell. Hydrometric stages are compared only "
            "within each station datum. Raw Dext3r evidence is unchanged; blank "
            "source fields remain missing and observed numeric zeros remain valid. "
            "No observation is used to calibrate the routing model."
        ),
    }
    receipt_path = data_root / RECEIPT_RELATIVE_PATH
    atomic_json(receipt_path, receipt)
    return {"receipt": receipt, "artifact": artifact(data_root, receipt_path)}


def comparison_quality(rainfall, hydrometry):
    rainfall_incomplete = any(
        result["quality"] == "incomplete_window" for result in rainfall
    )
    hydrometry_incomplete = any(
        result["quality"] == "incomplete_window" for result in hydrometry
    )
    if rainfall_incomplete and hydrometry_incomplete:
        return "incomplete_rainfall_and_hydrometry"
    if rainfall_incomplete:
        return "incomplete_rainfall"
    if hydrometry_incomplete:
        return "available_with_incomplete_hydrometry"
    return "available"


def main():
    args = parse_args()
    if not args.data_root:
        raise ValueError("Set GEOLENS_BENCHMARK_DATA_ROOT or pass --data-root")
    result = materialize(Path(args.data_root).resolve(), Path(args.manifest).resolve())
    print(
        json.dumps(
            {
                "quality": result["receipt"]["quality"],
                "rainfall": result["receipt"]["rainfall"],
                "hydrometry": result["receipt"]["hydrometry"],
                "artifact": result["artifact"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
