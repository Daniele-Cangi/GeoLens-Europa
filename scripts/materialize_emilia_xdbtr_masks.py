"""Rasterize an official DBTR GeoPackage on the frozen Forli benchmark grid."""

from __future__ import annotations

import argparse
from array import array
from datetime import datetime
import hashlib
import json
import math
import os
import shutil
from pathlib import Path
import sqlite3
import struct
import sys

LAYER_SPECS = (
    ("permanentWater", "V_SDA_GPG", "permanent-water"),
    ("wetArea", "V_ABA_GPG", "wet-area"),
    ("riverbed", "V_AAI_GPG", "riverbed"),
    ("embankment", "V_ARG_GPG", "embankment"),
    ("building", "V_EDI_GPG", "building"),
)
METADATA_FILES = tuple(f"{table}.xml" for _, table, _ in LAYER_SPECS)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-root", default=os.environ.get("GEOLENS_BENCHMARK_DATA_ROOT")
    )
    parser.add_argument("--source")
    return parser.parse_args()


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def portable_relative(root, target):
    try:
        return target.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as error:
        raise ValueError(f"Artifact escapes benchmark root: {target}") from error


def artifact(root, path, **metadata):
    return {
        "relativePath": portable_relative(root, path),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        **metadata,
    }


def atomic_write(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(value)
    os.replace(temporary, path)


def write_artifact(root, path, value, **metadata):
    atomic_write(path, value)
    return {
        "relativePath": portable_relative(root, path),
        "bytes": len(value),
        "sha256": hashlib.sha256(value).hexdigest(),
        **metadata,
    }


def read_uint(data, offset, endian):
    return struct.unpack_from(endian + "I", data, offset)[0], offset + 4


def wkb_type(raw_type):
    has_z = bool(raw_type & 0x80000000)
    has_m = bool(raw_type & 0x40000000)
    has_srid = bool(raw_type & 0x20000000)
    base = raw_type & 0x1FFFFFFF
    dimensions = 2 + int(has_z) + int(has_m)
    if 3000 <= base < 4000:
        return base - 3000, 4, has_srid
    if 2000 <= base < 3000:
        return base - 2000, 3, has_srid
    if 1000 <= base < 2000:
        return base - 1000, 3, has_srid
    return base, dimensions, has_srid


def decode_wkb(data, offset):
    byte_order = data[offset]
    if byte_order not in (0, 1):
        raise ValueError(f"Invalid WKB byte order {byte_order}")
    endian = "<" if byte_order == 1 else ">"
    raw_type, offset = read_uint(data, offset + 1, endian)
    geometry_type, dimensions, has_srid = wkb_type(raw_type)
    if has_srid:
        _, offset = read_uint(data, offset, endian)
    if geometry_type == 3:
        ring_count, offset = read_uint(data, offset, endian)
        rings = []
        for _ in range(ring_count):
            point_count, offset = read_uint(data, offset, endian)
            ring = []
            for _ in range(point_count):
                values = struct.unpack_from(endian + "d" * dimensions, data, offset)
                offset += dimensions * 8
                ring.append((values[0], values[1]))
            rings.append(ring)
        return [rings], offset
    if geometry_type in (6, 7):
        count, offset = read_uint(data, offset, endian)
        polygons = []
        for _ in range(count):
            child, offset = decode_wkb(data, offset)
            polygons.extend(child)
        return polygons, offset
    raise ValueError(f"Expected polygonal WKB, got type {geometry_type}")


def decode_geopackage_geometry(value):
    if len(value) < 8 or value[:2] != b"GP":
        raise ValueError("Geometry is not a GeoPackage binary value")
    flags = value[3]
    if flags & 0x10:
        return []
    envelope_type = (flags >> 1) & 0x07
    envelope_doubles = {0: 0, 1: 4, 2: 6, 3: 6, 4: 8}.get(envelope_type)
    if envelope_doubles is None:
        raise ValueError(f"Unsupported GeoPackage envelope type {envelope_type}")
    offset = 8 + envelope_doubles * 8
    polygons, final_offset = decode_wkb(memoryview(value), offset)
    if final_offset != len(value):
        raise ValueError("GeoPackage geometry has trailing bytes")
    return polygons


def point_on_segment(point, start, end):
    x, y = point
    x1, y1 = start
    x2, y2 = end
    cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
    tolerance = 1e-8 * max(1.0, abs(x2 - x1), abs(y2 - y1))
    return abs(cross) <= tolerance and (
        min(x1, x2) - tolerance <= x <= max(x1, x2) + tolerance
        and min(y1, y2) - tolerance <= y <= max(y1, y2) + tolerance
    )


def point_in_ring(point, ring):
    inside = False
    x, y = point
    for index in range(len(ring)):
        start = ring[index - 1]
        end = ring[index]
        if point_on_segment(point, start, end):
            return True
        x1, y1 = start
        x2, y2 = end
        if (y1 > y) != (y2 > y):
            crossing_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < crossing_x:
                inside = not inside
    return inside


def point_in_polygon(point, polygon):
    return bool(polygon) and point_in_ring(point, polygon[0]) and not any(
        point_in_ring(point, hole) for hole in polygon[1:]
    )


def clip_ring(ring, bounds):
    min_x, min_y, max_x, max_y = bounds
    points = list(ring)
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    boundaries = (
        (lambda p: p[0] >= min_x, lambda a, b: (min_x, a[1] + (b[1] - a[1]) * (min_x - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= max_x, lambda a, b: (max_x, a[1] + (b[1] - a[1]) * (max_x - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= min_y, lambda a, b: (a[0] + (b[0] - a[0]) * (min_y - a[1]) / (b[1] - a[1]), min_y)),
        (lambda p: p[1] <= max_y, lambda a, b: (a[0] + (b[0] - a[0]) * (max_y - a[1]) / (b[1] - a[1]), max_y)),
    )
    for inside, intersection in boundaries:
        if not points:
            break
        output = []
        start = points[-1]
        start_inside = inside(start)
        for end in points:
            end_inside = inside(end)
            if end_inside:
                if not start_inside:
                    output.append(intersection(start, end))
                output.append(end)
            elif start_inside:
                output.append(intersection(start, end))
            start, start_inside = end, end_inside
        points = output
    return points


def ring_area(ring):
    return abs(sum(
        ring[index - 1][0] * ring[index][1]
        - ring[index][0] * ring[index - 1][1]
        for index in range(len(ring))
    )) / 2.0


def clipped_polygon_area(polygon, bounds):
    if not polygon:
        return 0.0
    exterior = clip_ring(polygon[0], bounds)
    area = ring_area(exterior) if len(exterior) >= 3 else 0.0
    for hole in polygon[1:]:
        clipped = clip_ring(hole, bounds)
        if len(clipped) >= 3:
            area -= ring_area(clipped)
    return max(0.0, area)


def polygon_bounds(polygon):
    points = [point for ring in polygon for point in ring]
    return (
        min(point[0] for point in points),
        min(point[1] for point in points),
        max(point[0] for point in points),
        max(point[1] for point in points),
    )

def scanline_intervals(polygon, y):
    crossings = []
    for ring in polygon:
        for index in range(len(ring)):
            x1, y1 = ring[index - 1]
            x2, y2 = ring[index]
            if (y1 > y) != (y2 > y):
                crossings.append(x1 + (x2 - x1) * (y - y1) / (y2 - y1))
    crossings.sort()
    return zip(crossings[0::2], crossings[1::2])


def mark_scanline(intervals, y_sample, samples_per_cell, values, aoi_mask, grid):
    grid_min_x, _, grid_max_x, grid_max_y = grid["bounds"]
    cell_size = grid["cellSizeM"]
    width = grid["width"]
    height = grid["height"]
    row = math.floor((grid_max_y - y_sample) / cell_size)
    if row < 0 or row >= height:
        return
    sample_size = cell_size / samples_per_cell
    sample_width = width * samples_per_cell
    for start_x, end_x in intervals:
        if end_x < grid_min_x or start_x > grid_max_x:
            continue
        first = max(0, math.ceil((start_x - grid_min_x) / sample_size - 0.5))
        last = min(
            sample_width - 1,
            math.floor((end_x - grid_min_x) / sample_size - 0.5),
        )
        for sample_column in range(first, last + 1):
            column = sample_column // samples_per_cell
            index = row * width + column
            if aoi_mask[index] == 0:
                continue
            if samples_per_cell == 1:
                values[index] = 1
            elif values[index] < samples_per_cell * samples_per_cell:
                values[index] += 1


def rasterize_polygon(polygon, center_mask, coverage_samples, aoi_mask, grid):
    _, min_y, _, max_y = polygon_bounds(polygon)
    _, grid_min_y, _, grid_max_y = grid["bounds"]
    cell_size = grid["cellSizeM"]
    height = grid["height"]
    if max_y < grid_min_y or min_y > grid_max_y:
        return
    first_row = max(0, math.floor((grid_max_y - max_y) / cell_size))
    last_row = min(height - 1, math.floor((grid_max_y - min_y) / cell_size))
    for row in range(first_row, last_row + 1):
        cell_max_y = grid_max_y - row * cell_size
        cell_min_y = cell_max_y - cell_size
        center_y = cell_min_y + cell_size / 2
        mark_scanline(
            scanline_intervals(polygon, center_y),
            center_y,
            1,
            center_mask,
            aoi_mask,
            grid,
        )
        for sample_index in range(4):
            sample_y = cell_min_y + (sample_index + 0.5) * cell_size / 4
            mark_scanline(
                scanline_intervals(polygon, sample_y),
                sample_y,
                4,
                coverage_samples,
                aoi_mask,
                grid,
            )
def float32_bytes(values):
    packed = array("f", values)
    if sys.byteorder != "little":
        packed.byteswap()
    return packed.tobytes()


def integer_date(value):
    if value is None:
        return None
    try:
        text = str(int(value))
    except (TypeError, ValueError):
        return None
    return int(text[:8]) if len(text) >= 8 else None


def materialize_layer(
    connection,
    role,
    table,
    slug,
    cutoff_exclusive,
    data_root,
    inputs_root,
    aoi_mask,
    grid,
):
    columns = {
        row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')
    }
    required = {"geom", "DATA_AGG"}
    if not required.issubset(columns):
        raise ValueError(f"{table} lacks columns {sorted(required - columns)}")
    cell_count = grid["width"] * grid["height"]
    center_mask = bytearray(255 if value == 0 else 0 for value in aoi_mask)
    coverage_samples = bytearray(cell_count)
    counts = {
        "totalFeatures": 0,
        "eligibleFeatures": 0,
        "excludedPostCutoff": 0,
        "excludedMissingUpdateDate": 0,
        "excludedMissingGeometry": 0,
        "decodedPolygons": 0,
    }
    for geometry, updated_at in connection.execute(
        f'SELECT geom, DATA_AGG FROM "{table}"'
    ):
        counts["totalFeatures"] += 1
        date = integer_date(updated_at)
        if date is None:
            counts["excludedMissingUpdateDate"] += 1
            continue
        if date >= cutoff_exclusive:
            counts["excludedPostCutoff"] += 1
            continue
        if geometry is None:
            counts["excludedMissingGeometry"] += 1
            continue
        counts["eligibleFeatures"] += 1
        polygons = decode_geopackage_geometry(geometry)
        counts["decodedPolygons"] += len(polygons)
        for polygon in polygons:
            rasterize_polygon(
                polygon, center_mask, coverage_samples, aoi_mask, grid
            )
    if len(center_mask) != cell_count or len(coverage_samples) != cell_count:
        raise AssertionError("Raster dimensions drifted from the frozen grid")
    coverage = [
        math.nan if aoi_mask[index] == 0 else coverage_samples[index] / 16
        for index in range(cell_count)
    ]
    center_cells = sum(value == 1 for value in center_mask)
    positive = [value for value in coverage if math.isfinite(value) and value > 0]
    mask_artifact = write_artifact(
        data_root,
        inputs_root / f"xdbtr-{slug}-known-center-mask-u8.bin",
        bytes(center_mask),
        encoding=(
            "uint8 row-major north-to-south; 1=eligible geometry contains cell "
            "centre; 0=no eligible geometry identified; 255=outside AOI"
        ),
        missingSentinel=255,
    )
    coverage_artifact = write_artifact(
        data_root,
        inputs_root / f"xdbtr-{slug}-known-coverage-f32le.bin",
        float32_bytes(coverage),
        encoding="float32 little-endian row-major north-to-south; deterministic 4x4 subcell presence sampling, overlapping hits clamped to [0,1]",
        missingSentinel="NaN",
        unit="fraction",
    )
    return {
        "role": role,
        "sourceTable": table,
        **counts,
        "centerCells": center_cells,
        "coveragePositiveCells": len(positive),
        "coverageFractionSum": sum(positive),
        "maximumCoverageFraction": max(positive, default=0.0),
        "artifacts": [mask_artifact, coverage_artifact],
    }

def main():
    arguments = parse_args()
    if not arguments.data_root:
        raise SystemExit("Set GEOLENS_BENCHMARK_DATA_ROOT or pass --data-root")
    repository_root = Path(__file__).resolve().parents[1]
    data_root = Path(arguments.data_root).resolve()
    source = (
        data_root
        / "source"
        / "xdbtr"
        / "forli-epsg32632"
        / "rer-dbtr-forli-epsg32632.gpkg"
    )
    if arguments.source:
        supplied_source = Path(arguments.source).resolve()
        source.parent.mkdir(parents=True, exist_ok=True)
        imports = [(supplied_source, source)] + [
            (supplied_source.parent / filename, source.parent / filename)
            for filename in METADATA_FILES
        ]
        for supplied, stable in imports:
            if not supplied.is_file():
                raise FileNotFoundError(f"DBTR import file is missing: {supplied}")
            if stable.is_file():
                if sha256_file(supplied) != sha256_file(stable):
                    raise ValueError(f"Stable DBTR source differs: {stable}")
            else:
                shutil.copyfile(supplied, stable)
    inputs_root = data_root / "inputs"
    receipt_path = inputs_root / "bounded-inputs-receipt.json"
    manifest_path = (
        repository_root
        / "tests"
        / "ground-truth"
        / "emilia-romagna-2023"
        / "manifest.json"
    )
    if not source.is_file() or not receipt_path.is_file():
        raise FileNotFoundError("DBTR source or bounded-input receipt is missing")
    portable_relative(data_root, source)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    benchmark = manifest["benchmark"]
    grid = benchmark["spatialProtocol"]["grid"]
    if grid["crs"] != "EPSG:32632":
        raise ValueError("DBTR materializer requires the frozen EPSG:32632 grid")
    if receipt["grid"] != grid:
        raise ValueError("Local receipt grid disagrees with the manifest")
    event_start = datetime.fromisoformat(
        benchmark["event"]["windowStart"].replace("Z", "+00:00")
    )
    cutoff_exclusive = int(event_start.strftime("%Y%m%d"))
    aoi_artifact = receipt["masks"]["aoi"]
    aoi_mask = (data_root / aoi_artifact["relativePath"]).read_bytes()
    cell_count = grid["width"] * grid["height"]
    if len(aoi_mask) != cell_count or any(value not in (0, 1) for value in aoi_mask):
        raise ValueError("AOI mask is incompatible with the frozen grid")

    source_artifacts = [artifact(data_root, source, format="GeoPackage")]
    for filename in METADATA_FILES:
        metadata_path = source.parent / filename
        if not metadata_path.is_file():
            raise FileNotFoundError(f"Required DBTR metadata is missing: {metadata_path}")
        source_artifacts.append(
            artifact(data_root, metadata_path, format="ISO 19139 XML")
        )
    declared = {
        item["relativePath"]: item
        for dataset in manifest["datasets"]
        for item in dataset.get("localArtifacts", [])
    }
    declared_source = declared.get(source_artifacts[0]["relativePath"])
    if declared_source and (
        declared_source["bytes"] != source_artifacts[0]["bytes"]
        or declared_source["sha256"].lower() != source_artifacts[0]["sha256"]
    ):
        raise ValueError("DBTR source differs from the manifest-pinned artifact")

    with sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True) as connection:
        connection.execute("PRAGMA query_only=ON")
        contents = {
            row[0]: {
                "lastChange": row[1],
                "bounds": list(row[2:6]),
                "srsId": row[6],
            }
            for row in connection.execute(
                "SELECT table_name,last_change,min_x,min_y,max_x,max_y,srs_id "
                "FROM gpkg_contents WHERE data_type='features'"
            )
        }
        missing = [table for _, table, _ in LAYER_SPECS if table not in contents]
        if missing:
            raise ValueError(f"DBTR GeoPackage is missing layers {missing}")
        if any(contents[table]["srsId"] != 32632 for _, table, _ in LAYER_SPECS):
            raise ValueError("DBTR layers are not consistently EPSG:32632")
        layers = [
            {
                **materialize_layer(
                    connection,
                    role,
                    table,
                    slug,
                    cutoff_exclusive,
                    data_root,
                    inputs_root,
                    aoi_mask,
                    grid,
                ),
                **contents[table],
            }
            for role, table, slug in LAYER_SPECS
        ]

    old_xdbtr = receipt.get("xdbtr", {})
    context_receipts = old_xdbtr.get(
        "contextReceipts", old_xdbtr.get("receipts", [])
    )
    acquired_at = max(layer["lastChange"] for layer in layers)
    temporal_filter = {
        "field": "DATA_AGG",
        "cutoffExclusive": event_start.date().isoformat(),
        "comparison": "integer YYYYMMDD strictly less than event window start",
        "unknownPolicy": "exclude and count",
        "postCutoffPolicy": (
            "exclude and count; never reinterpret as historical absence"
        ),
    }
    receipt["schemaVersion"] = "bounded-environmental-inputs-v0.2.0"
    receipt["commonCoverage"] = benchmark["spatialProtocol"]["coverage"]
    receipt["masks"]["policy"] = benchmark["spatialProtocol"]["masks"]
    receipt["masks"].update({
        layer["role"]: {
            "status": "incomplete_window",
            "sourceLayer": layer["sourceTable"],
            "temporalFilter": temporal_filter,
            "knownPresenceSemantics": (
                "zero means no eligible geometry was identified, not observed "
                "historical absence"
            ),
            "artifacts": layer["artifacts"],
        }
        for layer in layers
    })
    receipt["xdbtr"] = {
        "status": "incomplete_window",
        "provider": "Regione Emilia-Romagna",
        "dataset": "DBTR official bounded Forli extract",
        "datasetVersion": (
            "municipal extract generated 2026-08-24 with feature-level "
            "pre-event cutoff"
        ),
        "acquiredAt": acquired_at,
        "sourceCrs": "EPSG:32632",
        "physicalGeometryEligible": True,
        "historicalSnapshotComplete": False,
        "missingReason": (
            "A current extract identifies retained features last updated before "
            "the event but cannot reconstruct features deleted or overwritten "
            "after the event."
        ),
        "temporalFilter": temporal_filter,
        "rasterization": {
            "grid": grid,
            "centerMask": "cell_center_in_polygon",
            "coverage": "deterministic 4x4 subcell sampling, overlapping hits clamped to one",
            "outsideAoi": "explicit missing sentinel",
        },
        "sourceArtifacts": source_artifacts,
        "layers": layers,
        "contextReceipts": context_receipts,
    }
    atomic_write(
        receipt_path,
        (json.dumps(receipt, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
    )
    print(json.dumps({
        "receipt": str(receipt_path),
        "source": source_artifacts[0],
        "temporalFilter": temporal_filter,
        "layers": [{
            key: layer[key]
            for key in (
                "role",
                "sourceTable",
                "totalFeatures",
                "eligibleFeatures",
                "excludedPostCutoff",
                "centerCells",
                "coveragePositiveCells",
                "coverageFractionSum",
            )
        } for layer in layers],
    }, indent=2))


if __name__ == "__main__":
    main()