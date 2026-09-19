from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import sys
from typing import Any
import warnings
import zipfile

import numpy as np
from pyproj import CRS, __version__ as pyproj_version, proj_version_str
from pyproj.transformer import TransformerGroup
import shapefile
import shapely
from shapely import intersects_xy, normalize, to_wkb
from shapely.geometry import box, shape
from shapely.ops import transform, unary_union


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPOSITORY_ROOT / "tests" / "ground-truth" / "cumbria-2015" / "manifest.json"
SOURCE_RECEIPT_NAME = "cumbria-evaluation-references-v0.receipt.json"
OUTPUT_RECEIPT_NAME = "cumbria-evaluation-reference-masks-v0.receipt.json"
OUTPUT_SCHEMA = "cumbria-evaluation-reference-mask-receipt-v0.1.0"
NORMALIZATION_SCHEMA = "cumbria-evaluation-reference-normalization-v0.1.0"
OUTPUT_RECEIPT_SHA256 = "fae2cadba3675bff4191da5829e8bf64d71ffc028a9c6899c9e865f97b6debe0"
SOURCE_RECEIPT_SHA256 = "b9bf772af4a356de533edb26c005dd318e36d889ad44fdaeb51586c989adffbf"
PROTOCOL_SHA256 = "1a135785bef1121e542952fd8ee90d6eed86908d19864d381985fbfd2f8a1dd0"
PREDICTION_RECEIPT_SHA256 = "f2a3a7489699a70a6d5c770633bdc9f789184ca26cb8190c85a1d28d40495dc6"
PREDICTION_FREEZE_MERGE = "df33838ba7774a736ebe17aec7e6c9aee01e1827"
MATERIALIZATION_COMMIT = "7161a53bf0a1823858d40705855e4ae7651c1a6c"
MATERIALIZATION_TREE = "030bab43e8ad3d0d8c099c8faa52a4e4fa68eac2"
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
NO_DATA = 255
SOURCE_SPECS = (
    {
        "id": "ea-recorded-flood-outlines-carlisle-2015",
        "sha256": "e2ad395a39441a077cf3585e3cce09a49454922798dba483a31fe71fabef78c0",
        "kind": "ea_geojson",
        "sourceCrs": "EPSG:4326",
        "expectedFeatures": 1,
        "coverageBasis": "the frozen domain is compared with the complete selected event record; zero means not included in that official recorded outline, not proof that flooding was physically absent",
    },
    {
        "id": "copernicus-emsr147-carlisle-initial",
        "sha256": "5524efba986082b901bf27fc7ecde0cf6af91fea393b36bfa6bcf6a959448049",
        "kind": "cems_zip",
        "sourceCrs": "EPSG:32630",
        "expectedFeatures": 228,
        "layerStem": "EMSR147_01CARLISLE_01DELINEATION_v1_50000_crisis_information_poly",
        "coverageStem": "EMSR147_01CARLISLE_01DELINEATION_v1_50000_area_of_interest",
        "coverageBasis": "publisher area_of_interest polygon",
    },
    {
        "id": "copernicus-emsr147-carlisle-monitoring-01",
        "sha256": "b58b6e047d8e1066fffcf3aa09fafa4b975cd7eedccda22d8df8c4971d509cfb",
        "kind": "cems_zip",
        "sourceCrs": "EPSG:32630",
        "expectedFeatures": 495,
        "layerStem": "EMSR147_01CARLISLE_01DELINEATION_MONIT01_v1_50000_crisis_information_poly",
        "coverageStem": "EMSR147_01CARLISLE_01DELINEATION_MONIT01_v1_50000_area_of_interest",
        "coverageBasis": "publisher area_of_interest polygon",
    },
)
TRANSFORMERS: dict[str, Any] = {}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_identity(value: dict[str, Any], identity_field: str) -> str:
    payload = dict(value)
    payload.pop(identity_field, None)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
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


def git_output(*arguments: str) -> str:
    return subprocess.check_output(["git", *arguments], cwd=REPOSITORY_ROOT, text=True).strip()


def assert_execution_revision() -> None:
    if subprocess.run(
        ["git", "merge-base", "--is-ancestor", PREDICTION_FREEZE_MERGE, "HEAD"],
        cwd=REPOSITORY_ROOT,
        check=False,
    ).returncode != 0:
        raise ValueError("Prediction-freeze merge is not an ancestor of HEAD")
    if git_output("status", "--porcelain"):
        raise ValueError("Evaluation-mask materialization requires a clean Git worktree")


def validate_manifest(manifest: dict[str, Any]) -> None:
    protocol = manifest.get("evaluationProtocol", {})
    acquisition = manifest.get("evaluationReferenceAcquisition", {})
    if protocol.get("protocolSha256") != PROTOCOL_SHA256:
        raise ValueError("Blind evaluation protocol identity drifted")
    if protocol.get("predictionFreeze", {}).get("predictionReceipt", {}).get("sha256") != PREDICTION_RECEIPT_SHA256:
        raise ValueError("Prediction receipt identity drifted")
    if acquisition.get("receipt", {}).get("sha256") != SOURCE_RECEIPT_SHA256:
        raise ValueError("Evaluation-reference source receipt identity drifted")
    next_gate = acquisition.get("nextGate")
    if next_gate == "normalize_and_rasterize_each_reference_independently":
        return
    normalization = manifest.get("evaluationReferenceNormalization", {})
    normalization_receipt = normalization.get("receipt", {})
    normalization_revision = normalization.get("materializationRevision", {})
    if (
        next_gate != "evaluate_each_reference_independently"
        or acquisition.get("state") != "content_addressed_normalization_complete"
        or normalization.get("schemaVersion") != NORMALIZATION_SCHEMA
        or normalization.get("state") != "content_addressed_evaluation_pending"
        or normalization.get("sourceReceiptSha256") != SOURCE_RECEIPT_SHA256
        or normalization.get("predictionReceiptSha256") != PREDICTION_RECEIPT_SHA256
        or normalization.get("protocolSha256") != PROTOCOL_SHA256
        or normalization_revision.get("commit") != MATERIALIZATION_COMMIT
        or normalization_revision.get("tree") != MATERIALIZATION_TREE
        or normalization_receipt.get("fileName") != OUTPUT_RECEIPT_NAME
        or normalization_receipt.get("schemaVersion") != OUTPUT_SCHEMA
        or normalization_receipt.get("sha256") != OUTPUT_RECEIPT_SHA256
        or normalization_receipt.get("referenceCount") != len(SOURCE_SPECS)
        or normalization.get("nextGate") != "evaluate_each_reference_independently"
    ):
        raise ValueError("Evaluation-reference normalization gate drifted")


def read_source_receipt(data_root: Path) -> dict[str, Any]:
    path = data_root / "evaluation-references" / SOURCE_RECEIPT_NAME
    receipt = json.loads(path.read_text(encoding="utf-8"))
    if receipt.get("receiptSha256") != SOURCE_RECEIPT_SHA256:
        raise ValueError("Evaluation-reference source receipt identity drifted")
    if canonical_identity(receipt, "receiptSha256") != SOURCE_RECEIPT_SHA256:
        raise ValueError("Evaluation-reference source receipt content drifted")
    sources = receipt.get("sources")
    if not isinstance(sources, list) or [source.get("id") for source in sources] != [spec["id"] for spec in SOURCE_SPECS]:
        raise ValueError("Evaluation-reference source order or identity drifted")
    for source, spec in zip(sources, SOURCE_SPECS, strict=True):
        path = (data_root / source["relativePath"]).resolve()
        try:
            path.relative_to(data_root)
        except ValueError as error:
            raise ValueError("Evaluation-reference source escapes the data root") from error
        payload = path.read_bytes()
        if sha256_bytes(payload) != spec["sha256"] or len(payload) != source.get("bytes"):
            raise ValueError(f"Evaluation-reference source bytes drifted: {spec['id']}")
    return receipt


def finite_geometry(geometry: Any, label: str) -> Any:
    if geometry.is_empty or not geometry.is_valid:
        raise ValueError(f"{label} is empty or invalid")
    if any(not math.isfinite(value) for value in geometry.bounds):
        raise ValueError(f"{label} has non-finite bounds")
    return geometry


def canonical_wkb(geometry: Any) -> bytes:
    return to_wkb(normalize(geometry), hex=False, output_dimension=2, byte_order=1, include_srid=False)


def coordinate_transformer(source_crs: str) -> Any:
    if source_crs not in TRANSFORMERS:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="Best transformation is not available due to missing Grid",
                category=UserWarning,
            )
            group = TransformerGroup(source_crs, GRID["horizontalCrs"], always_xy=True)
        candidates = [
            candidate
            for candidate in group.transformers
            if "Inverse of OSGB36 to WGS 84 (6)" in candidate.description
        ]
        if len(candidates) != 1 or candidates[0].accuracy != 2.0:
            raise ValueError(f"The frozen 2 m coordinate operation is unavailable for {source_crs}")
        TRANSFORMERS[source_crs] = candidates[0]
    return TRANSFORMERS[source_crs]


def transform_geometry(geometry: Any, source_crs: str) -> Any:
    transformer = coordinate_transformer(source_crs)
    return finite_geometry(transform(transformer.transform, geometry), f"geometry transformed from {source_crs}")


def coordinate_operation_receipt() -> list[dict[str, Any]]:
    operations = []
    for source_crs in sorted({spec["sourceCrs"] for spec in SOURCE_SPECS}):
        transformer = coordinate_transformer(source_crs)
        operations.append(
            {
                "sourceCrs": source_crs,
                "targetCrs": GRID["horizontalCrs"],
                "description": transformer.description,
                "accuracyMetres": transformer.accuracy,
                "definitionSha256": sha256_bytes(transformer.definition.encode("utf-8")),
            }
        )
    return operations


def read_shapefile(archive: zipfile.ZipFile, stem: str) -> tuple[list[Any], list[dict[str, Any]], str]:
    names = set(archive.namelist())
    required = [f"{stem}.{extension}" for extension in ("shp", "shx", "dbf", "prj")]
    missing = [name for name in required if name not in names]
    if missing:
        raise ValueError(f"CEMS layer is incomplete: {missing}")
    projection = archive.read(f"{stem}.prj").decode("utf-8")
    if CRS.from_wkt(projection).to_epsg() != 32630:
        raise ValueError("CEMS layer CRS is not EPSG:32630")
    reader = shapefile.Reader(
        shp=io.BytesIO(archive.read(f"{stem}.shp")),
        shx=io.BytesIO(archive.read(f"{stem}.shx")),
        dbf=io.BytesIO(archive.read(f"{stem}.dbf")),
    )
    geometries = [finite_geometry(shape(item.shape.__geo_interface__), stem) for item in reader.iterShapeRecords()]
    records = [record.as_dict() for record in reader.records()]
    if len(geometries) != len(records):
        raise ValueError("CEMS shape and record counts differ")
    return geometries, records, projection


def load_ea(payload: bytes, spec: dict[str, Any]) -> tuple[Any, Any, dict[str, Any]]:
    collection = json.loads(payload.decode("utf-8"))
    features = collection.get("features", [])
    if len(features) != spec["expectedFeatures"] or features[0].get("id") != "Recorded_Flood_Outlines.26355":
        raise ValueError("EA selected feature identity drifted")
    geometry = transform_geometry(finite_geometry(shape(features[0]["geometry"]), "EA geometry"), spec["sourceCrs"])
    domain = box(*GRID["bounds"])
    return finite_geometry(geometry.intersection(domain), "EA geometry clipped to the frozen domain"), domain, {
        "sourceFeatureCount": 1,
        "selectedFeatureCount": 1,
        "selection": "exact feature Recorded_Flood_Outlines.26355 from event group 4175",
        "sourceProjection": spec["sourceCrs"],
    }


def validate_cems_flood_record(record: dict[str, Any], source_id: str) -> None:
    if (
        record.get("act_id") != "EMSR147"
        or record.get("interpret") != "Flooded Area"
        or record.get("subtype") != "EM009 - Flood"
    ):
        raise ValueError(f"{source_id} contains a non-flood crisis feature")


def load_cems(payload: bytes, spec: dict[str, Any]) -> tuple[Any, Any, dict[str, Any]]:
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        geometries, records, projection = read_shapefile(archive, spec["layerStem"])
        coverage_geometries, coverage_records, _ = read_shapefile(archive, spec["coverageStem"])
    if len(geometries) != spec["expectedFeatures"]:
        raise ValueError(f"{spec['id']} feature count drifted")
    selected = []
    for geometry, record in zip(geometries, records, strict=True):
        validate_cems_flood_record(record, spec["id"])
        selected.append(transform_geometry(geometry, spec["sourceCrs"]))
    if len(coverage_geometries) != 1 or len(coverage_records) != 1:
        raise ValueError(f"{spec['id']} must contain one publisher area of interest")
    domain = box(*GRID["bounds"])
    wet = finite_geometry(unary_union(selected).intersection(domain), f"{spec['id']} wet geometry")
    coverage = finite_geometry(
        transform_geometry(coverage_geometries[0], spec["sourceCrs"]).intersection(domain),
        f"{spec['id']} coverage geometry",
    )
    return wet, coverage, {
        "sourceFeatureCount": len(geometries),
        "selectedFeatureCount": len(selected),
        "selection": "all and only crisis_information_poly records with act_id EMSR147, interpret Flooded Area and subtype EM009 - Flood",
        "sourceProjection": projection,
        "sourceDates": sorted({record["src_date"].isoformat() for record in records}),
    }


def rasterize_reference(wet_geometry: Any, coverage_geometry: Any) -> tuple[bytes, bytes, dict[str, Any]]:
    minimum_x, minimum_y, maximum_x, maximum_y = GRID["bounds"]
    x_values = minimum_x + (np.arange(GRID["width"], dtype=np.float64) + 0.5) * GRID["cellSizeMetres"]
    y_values = maximum_y - (np.arange(GRID["height"], dtype=np.float64) + 0.5) * GRID["cellSizeMetres"]
    x_grid, y_grid = np.meshgrid(x_values, y_values)
    coverage = np.asarray(intersects_xy(coverage_geometry, x_grid.ravel(), y_grid.ravel()), dtype=bool)
    wet = np.asarray(intersects_xy(wet_geometry, x_grid.ravel(), y_grid.ravel()), dtype=bool)
    if np.any(wet & ~coverage):
        raise ValueError("Reference wet cell falls outside publisher coverage")
    mask = np.full(CELL_COUNT, NO_DATA, dtype=np.uint8)
    mask[coverage] = 0
    mask[wet] = 1
    coverage_mask = coverage.astype(np.uint8)
    statistics = {
        "cellCount": CELL_COUNT,
        "coverageCellCount": int(np.count_nonzero(coverage)),
        "missingCoverageCellCount": int(CELL_COUNT - np.count_nonzero(coverage)),
        "wetCellCount": int(np.count_nonzero(wet)),
        "referenceNotWetCellCount": int(np.count_nonzero(coverage & ~wet)),
        "centerSampledWetAreaM2": int(np.count_nonzero(wet)) * GRID["cellSizeMetres"] ** 2,
    }
    return mask.tobytes(), coverage_mask.tobytes(), statistics


def artifact_descriptor(data_root: Path, payload: bytes, suffix: str, *, execute: bool, compress: bool) -> dict[str, Any]:
    content_sha256 = sha256_bytes(payload)
    stored = gzip.compress(payload, compresslevel=9, mtime=0) if compress else payload
    stored_sha256 = sha256_bytes(stored)
    relative = Path("evaluation-references") / "normalized" / "sha256" / f"{stored_sha256}.{suffix}"
    path = data_root / relative
    if execute:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.read_bytes() != stored:
            raise ValueError(f"Content-addressed artifact drifted: {path}")
        if not path.exists():
            temporary = path.with_suffix(path.suffix + ".tmp")
            temporary.write_bytes(stored)
            temporary.replace(path)
    return {
        "relativePath": relative.as_posix(),
        "bytes": len(stored),
        "sha256": stored_sha256,
        "contentBytes": len(payload),
        "contentSha256": content_sha256,
    }


def materialize_sources(data_root: Path, receipt: dict[str, Any], *, execute: bool) -> list[dict[str, Any]]:
    output = []
    for source, spec in zip(receipt["sources"], SOURCE_SPECS, strict=True):
        payload = (data_root / source["relativePath"]).read_bytes()
        wet, coverage, inspection = load_ea(payload, spec) if spec["kind"] == "ea_geojson" else load_cems(payload, spec)
        wet_wkb = canonical_wkb(wet)
        coverage_wkb = canonical_wkb(coverage)
        mask, coverage_mask, statistics = rasterize_reference(wet, coverage)
        output.append(
            {
                "id": spec["id"],
                "sourceSha256": spec["sha256"],
                "sourceCrs": spec["sourceCrs"],
                "targetCrs": GRID["horizontalCrs"],
                "coverageBasis": spec["coverageBasis"],
                "inspection": inspection,
                "geometry": {
                    "geometryType": wet.geom_type,
                    "bounds": list(wet.bounds),
                    "areaM2": wet.area,
                    "artifact": artifact_descriptor(data_root, wet_wkb, "wet-epsg27700.wkb", execute=execute, compress=False),
                },
                "coverage": {
                    "geometryType": coverage.geom_type,
                    "bounds": list(coverage.bounds),
                    "areaM2": coverage.area,
                    "artifact": artifact_descriptor(data_root, coverage_wkb, "coverage-epsg27700.wkb", execute=execute, compress=False),
                },
                "referenceMask": artifact_descriptor(data_root, mask, "reference-mask-u8.gz", execute=execute, compress=True),
                "coverageMask": artifact_descriptor(data_root, coverage_mask, "coverage-mask-u8.gz", execute=execute, compress=True),
                "statistics": statistics,
            }
        )
    return output


def build_receipt(data_root: Path, *, execute: bool) -> dict[str, Any]:
    source_receipt = read_source_receipt(data_root)
    references = materialize_sources(data_root, source_receipt, execute=execute)
    receipt = {
        "schemaVersion": OUTPUT_SCHEMA,
        "receiptSha256": None,
        "sourceReceiptSha256": SOURCE_RECEIPT_SHA256,
        "predictionReceiptSha256": PREDICTION_RECEIPT_SHA256,
        "protocolSha256": PROTOCOL_SHA256,
        "materializationRevision": {
            "commit": git_output("rev-parse", "HEAD"),
            "tree": git_output("rev-parse", "HEAD^{tree}"),
        },
        "transformation": {
            "id": "cumbria-evaluation-reference-normalization-v0.1.0",
            "sourceToTargetCrs": "authority-axis-order disabled; x/y order fixed; pyproj always_xy=True",
            "geometryNormalization": "valid source polygons transformed to EPSG:27700, clipped only to the frozen domain, canonicalized and serialized as little-endian 2D WKB",
            "coordinateOperations": coordinate_operation_receipt(),
            "rasterization": "20 m cell-centre intersects test on the frozen north-to-south grid",
            "maskEncoding": "u8: 1 mapped flooded, 0 within reference coverage but not mapped flooded, 255 missing reference coverage",
            "runtime": {
                "numpy": np.__version__,
                "pyproj": pyproj_version,
                "proj": proj_version_str,
                "pyshp": shapefile.__version__,
                "shapely": shapely.__version__,
                "geos": shapely.geos_version_string,
            },
        },
        "grid": GRID,
        "references": references,
        "isolation": {
            "referencesCombined": False,
            "predictionArtifactsLoaded": False,
            "modelInput": False,
            "calibration": False,
            "evaluationExecuted": False,
            "networkRequests": 0,
        },
    }
    receipt["receiptSha256"] = canonical_identity(receipt, "receiptSha256")
    return receipt


def write_receipt(data_root: Path, receipt: dict[str, Any]) -> None:
    path = data_root / "evaluation-references" / OUTPUT_RECEIPT_NAME
    encoded = (json.dumps(receipt, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if path.exists() and path.read_bytes() != encoded:
        raise ValueError("Existing evaluation-mask receipt drifted")
    if not path.exists():
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(encoded)
        temporary.replace(path)


def check(data_root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    path = data_root / "evaluation-references" / OUTPUT_RECEIPT_NAME
    recorded = json.loads(path.read_text(encoding="utf-8"))
    if recorded.get("schemaVersion") != OUTPUT_SCHEMA:
        raise ValueError("Evaluation-mask receipt schema drifted")
    manifest_receipt_sha256 = (
        manifest.get("evaluationReferenceNormalization", {})
        .get("receipt", {})
        .get("sha256")
    )
    if (
        recorded.get("receiptSha256") != OUTPUT_RECEIPT_SHA256
        or manifest_receipt_sha256 != OUTPUT_RECEIPT_SHA256
    ):
        raise ValueError("Evaluation-mask receipt does not match the pinned manifest identity")
    if canonical_identity(recorded, "receiptSha256") != recorded.get("receiptSha256"):
        raise ValueError("Evaluation-mask receipt identity drifted")
    if (
        recorded.get("sourceReceiptSha256") != SOURCE_RECEIPT_SHA256
        or recorded.get("predictionReceiptSha256") != PREDICTION_RECEIPT_SHA256
        or recorded.get("protocolSha256") != PROTOCOL_SHA256
        or recorded.get("materializationRevision")
        != {"commit": MATERIALIZATION_COMMIT, "tree": MATERIALIZATION_TREE}
    ):
        raise ValueError("Evaluation-mask receipt linkage drifted")
    recomputed = build_receipt(data_root, execute=False)
    recomputed["materializationRevision"] = recorded.get("materializationRevision")
    recomputed["receiptSha256"] = canonical_identity(recomputed, "receiptSha256")
    if recomputed != recorded:
        raise ValueError("Evaluation-mask transformation no longer reproduces the receipt")
    for reference in recorded["references"]:
        for group in ("geometry", "coverage"):
            descriptors = [reference[group]["artifact"]]
            for descriptor in descriptors:
                payload = (data_root / descriptor["relativePath"]).read_bytes()
                if len(payload) != descriptor["bytes"] or sha256_bytes(payload) != descriptor["sha256"]:
                    raise ValueError(f"Evaluation artifact drifted: {descriptor['relativePath']}")
        for name in ("referenceMask", "coverageMask"):
            descriptor = reference[name]
            stored = (data_root / descriptor["relativePath"]).read_bytes()
            decoded = gzip.decompress(stored)
            if (
                len(stored) != descriptor["bytes"]
                or sha256_bytes(stored) != descriptor["sha256"]
                or len(decoded) != descriptor["contentBytes"]
                or sha256_bytes(decoded) != descriptor["contentSha256"]
            ):
                raise ValueError(f"Evaluation mask drifted: {descriptor['relativePath']}")
    return recorded


def plan() -> dict[str, Any]:
    return {
        "schemaVersion": OUTPUT_SCHEMA,
        "mode": "dry_run",
        "sourceReceiptSha256": SOURCE_RECEIPT_SHA256,
        "predictionReceiptSha256": PREDICTION_RECEIPT_SHA256,
        "grid": GRID,
        "referenceCount": len(SOURCE_SPECS),
        "sourceFilesOpened": 0,
        "predictionArtifactsLoaded": 0,
        "filesWritten": 0,
        "evaluationRuns": 0,
        "networkRequests": 0,
    }


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--execute", action="store_true")
    mode.add_argument("--check", action="store_true")
    options = parser.parse_args(arguments)
    data_root = ensure_external_data_root(Path(options.data_root), REPOSITORY_ROOT)
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    validate_manifest(manifest)
    if options.execute:
        assert_execution_revision()
        result = build_receipt(data_root, execute=True)
        write_receipt(data_root, result)
        mode_name = "execute"
    elif options.check:
        result = check(data_root, manifest)
        mode_name = "check"
    else:
        result = plan()
        mode_name = "dry_run"
    print(json.dumps({"mode": mode_name, "dataRoot": str(data_root), "receiptSha256": result.get("receiptSha256"), "result": result}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
