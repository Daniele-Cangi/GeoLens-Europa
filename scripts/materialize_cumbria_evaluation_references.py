from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tempfile
from typing import Any
from urllib.request import Request, urlopen
import zipfile


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = (
    REPOSITORY_ROOT
    / "tests"
    / "ground-truth"
    / "cumbria-2015"
    / "manifest.json"
)
RECEIPT_NAME = "cumbria-evaluation-references-v0.receipt.json"
RECEIPT_SCHEMA = "cumbria-evaluation-reference-receipt-v0.1.0"
PROTOCOL_SHA256 = "1a135785bef1121e542952fd8ee90d6eed86908d19864d381985fbfd2f8a1dd0"
PREDICTION_RECEIPT_SHA256 = (
    "f2a3a7489699a70a6d5c770633bdc9f789184ca26cb8190c85a1d28d40495dc6"
)
PREDICTION_FREEZE_MERGE = "df33838ba7774a736ebe17aec7e6c9aee01e1827"
DOMAIN_BNG = [332000, 556000, 340000, 563000]
DOMAIN_WGS84_BBOX = [
    -3.0634070957129724,
    54.89408798666897,
    -2.9370369857492205,
    54.958009472698436,
]
EA_EVENT_GROUP_ID = 4175
EA_FEATURE_ID = "Recorded_Flood_Outlines.26355"
EA_RECORD_ID = 4078182
EA_URL = (
    "https://environment.data.gov.uk/geoservices/datasets/"
    "8c75e700-d465-11e4-8b5b-f0def148f590/ogc/features/v1/"
    "collections/Recorded_Flood_Outlines/items?"
    "bbox=-3.0634070957129724%2C54.89408798666897%2C"
    "-2.9370369857492205%2C54.958009472698436&"
    "filter=rec_grp_id%20%3D%204175&filter-lang=cql2-text&limit=100&f=json"
)
CEMS_SOURCES = [
    {
        "id": "copernicus-emsr147-carlisle-initial",
        "url": (
            "https://cems-mapping-website.s3.eu-west-1.amazonaws.com/static/"
            "activations/EMSR147/"
            "EMSR147_01CARLISLE_DELINEATION_OVERVIEW_v1_vector.zip"
        ),
        "expectedBytes": 2040503,
        "delivery": "2015-12-08T01:54:48Z",
    },
    {
        "id": "copernicus-emsr147-carlisle-monitoring-01",
        "url": (
            "https://cems-mapping-website.s3.eu-west-1.amazonaws.com/static/"
            "activations/EMSR147/"
            "EMSR147_01CARLISLE_DELINEATION_OVERVIEW-MONIT01_v1_vector.zip"
        ),
        "expectedBytes": 3621649,
        "delivery": "2015-12-10T13:44:26Z",
    },
]
MAX_SOURCE_BYTES = 10_000_000
MAX_ZIP_MEMBER_BYTES = 100_000_000
MAX_ZIP_TOTAL_BYTES = 500_000_000


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_identity(value: dict[str, Any], identity_field: str) -> str:
    payload = dict(value)
    payload.pop(identity_field, None)
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return sha256_bytes(encoded)


def ensure_external_data_root(data_root: Path, repository_root: Path) -> Path:
    resolved = data_root.resolve()
    repository = repository_root.resolve()
    try:
        resolved.relative_to(repository)
    except ValueError:
        pass
    else:
        raise ValueError("Cumbria reference data root must stay outside the Git repository")
    if any(part.casefold().startswith("onedrive") for part in resolved.parts):
        raise ValueError("Cumbria reference data root must stay outside OneDrive")
    return resolved


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("manifestVersion") not in {"0.26.0", "0.27.0", "0.28.0", "0.29.0"}:
        raise ValueError(
            "Cumbria reference acquisition requires manifest v0.26.0 through v0.29.0"
        )
    protocol = manifest.get("evaluationProtocol", {})
    if protocol.get("protocolSha256") != PROTOCOL_SHA256:
        raise ValueError("Blind evaluation protocol identity drifted")
    freeze = protocol.get("predictionFreeze", {})
    if freeze.get("state") != "frozen":
        raise ValueError("Prediction must be frozen before reference acquisition")
    if freeze.get("predictionReceipt", {}).get("sha256") != PREDICTION_RECEIPT_SHA256:
        raise ValueError("Frozen prediction receipt identity drifted")
    seal = protocol.get("referenceSeal", {})
    if seal.get("referenceAccessAuthorizedAfterMerge") is not True:
        raise ValueError("Reference access has not been authorized")
    if seal.get("datasetIds") != [
        "ea-recorded-flood-outlines",
        "copernicus-emsr147-carlisle",
    ]:
        raise ValueError("Evaluation reference identities drifted")
    if manifest.get("manifestVersion") in {"0.27.0", "0.28.0", "0.29.0"}:
        recorded = manifest.get("evaluationReferenceAcquisition", {})
        if recorded.get("receipt", {}).get("sha256") != (
            "b9bf772af4a356de533edb26c005dd318e36d889ad44fdaeb51586c989adffbf"
        ):
            raise ValueError("Recorded evaluation-reference receipt identity drifted")


def git_output(*arguments: str) -> str:
    return subprocess.check_output(
        ["git", *arguments],
        cwd=REPOSITORY_ROOT,
        text=True,
    ).strip()


def assert_freeze_merge_is_ancestor() -> None:
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", PREDICTION_FREEZE_MERGE, "HEAD"],
        cwd=REPOSITORY_ROOT,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError("Prediction-freeze merge is not an ancestor of HEAD")


def assert_clean_worktree() -> None:
    if git_output("status", "--porcelain"):
        raise ValueError("Reference acquisition requires a clean Git worktree")


def fetch_source(url: str) -> tuple[bytes, dict[str, str | None]]:
    request = Request(
        url,
        headers={
            "Accept": "application/geo+json, application/json, application/zip, */*",
            "User-Agent": "GeoLens-Cumbria-reference-acquisition/0.1",
        },
    )
    with urlopen(request, timeout=90) as response:
        length = response.headers.get("Content-Length")
        if length is not None and int(length) > MAX_SOURCE_BYTES:
            raise ValueError(f"Source declares {length} bytes, above the bounded limit")
        payload = response.read(MAX_SOURCE_BYTES + 1)
        if len(payload) > MAX_SOURCE_BYTES:
            raise ValueError("Source exceeds the bounded download limit")
        return payload, {
            "contentType": response.headers.get("Content-Type"),
            "contentLength": length,
            "etag": response.headers.get("ETag"),
            "lastModified": response.headers.get("Last-Modified"),
        }


def iter_coordinates(value: Any):
    if isinstance(value, list):
        if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
            yield float(value[0]), float(value[1])
        else:
            for item in value:
                yield from iter_coordinates(item)


def validate_ea_geojson(payload: bytes) -> dict[str, Any]:
    value = json.loads(payload.decode("utf-8"))
    features = value.get("features")
    if value.get("type") != "FeatureCollection" or not isinstance(features, list):
        raise ValueError("EA response is not a GeoJSON FeatureCollection")
    if value.get("numberMatched") != 1 or value.get("numberReturned") != 1:
        raise ValueError("EA query must resolve exactly one frozen event feature")
    if len(features) != 1:
        raise ValueError("EA response feature count drifted")
    feature = features[0]
    properties = feature.get("properties", {})
    geometry = feature.get("geometry", {})
    expected = {
        "id": EA_FEATURE_ID,
        "rec_out_id": EA_RECORD_ID,
        "rec_grp_id": EA_EVENT_GROUP_ID,
        "name": "Carlisle (including Crosby-on-Eden) 05_12_2015",
        "start_date": "2015-12-05T00:00:00Z",
        "end_date": "2015-12-07T00:00:00Z",
        "flood_src": "main river",
        "data_qual": "Good",
    }
    actual = {"id": feature.get("id"), **{key: properties.get(key) for key in expected if key != "id"}}
    if actual != expected:
        raise ValueError(f"EA event identity drifted: {actual!r}")
    if geometry.get("type") != "MultiPolygon":
        raise ValueError("EA event geometry is not a MultiPolygon")
    coordinates = list(iter_coordinates(geometry.get("coordinates")))
    if not coordinates or any(not math.isfinite(item) for pair in coordinates for item in pair):
        raise ValueError("EA event geometry contains no finite coordinates")
    bounds = [
        min(pair[0] for pair in coordinates),
        min(pair[1] for pair in coordinates),
        max(pair[0] for pair in coordinates),
        max(pair[1] for pair in coordinates),
    ]
    if (
        bounds[2] < DOMAIN_WGS84_BBOX[0]
        or bounds[0] > DOMAIN_WGS84_BBOX[2]
        or bounds[3] < DOMAIN_WGS84_BBOX[1]
        or bounds[1] > DOMAIN_WGS84_BBOX[3]
    ):
        raise ValueError("EA event geometry does not intersect the frozen domain")
    return {
        "featureIds": [EA_FEATURE_ID],
        "recordIds": [EA_RECORD_ID],
        "eventGroupIds": [EA_EVENT_GROUP_ID],
        "featureCount": 1,
        "geometryType": "MultiPolygon",
        "coordinateCount": len(coordinates),
        "sourceBoundsWgs84": bounds,
        "quality": "Good",
        "floodSource": "main river",
    }


def safe_zip_inventory(payload: bytes) -> dict[str, Any]:
    with tempfile.TemporaryFile() as temporary:
        temporary.write(payload)
        temporary.seek(0)
        with zipfile.ZipFile(temporary) as archive:
            entries = []
            normalized = set()
            total_uncompressed = 0
            for info in archive.infolist():
                name = info.filename.replace("\\", "/")
                path = PurePosixPath(name)
                if path.is_absolute() or ".." in path.parts or not path.parts:
                    raise ValueError(f"Unsafe ZIP entry {name!r}")
                key = name.casefold()
                if key in normalized:
                    raise ValueError(f"Duplicate normalized ZIP entry {name!r}")
                normalized.add(key)
                if info.file_size > MAX_ZIP_MEMBER_BYTES:
                    raise ValueError(f"ZIP member {name!r} exceeds the bounded size")
                total_uncompressed += info.file_size
                if total_uncompressed > MAX_ZIP_TOTAL_BYTES:
                    raise ValueError("ZIP uncompressed total exceeds the bounded size")
                entries.append(
                    {
                        "path": name,
                        "compressedBytes": info.compress_size,
                        "uncompressedBytes": info.file_size,
                        "crc32": f"{info.CRC:08x}",
                        "directory": info.is_dir(),
                    }
                )
            if not entries:
                raise ValueError("CEMS archive is empty")
            extensions = sorted(
                {
                    PurePosixPath(entry["path"]).suffix.casefold()
                    for entry in entries
                    if not entry["directory"] and PurePosixPath(entry["path"]).suffix
                }
            )
            if ".shp" not in extensions or ".dbf" not in extensions or ".prj" not in extensions:
                raise ValueError("CEMS vector archive lacks required shapefile components")
            return {
                "entryCount": len(entries),
                "totalUncompressedBytes": total_uncompressed,
                "extensions": extensions,
                "entries": entries,
            }


def artifact_path(data_root: Path, digest: str, extension: str) -> Path:
    return data_root / "evaluation-references" / "sources" / "sha256" / f"{digest}{extension}"


def write_once(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != payload:
            raise ValueError(f"Existing content-addressed artifact drifted: {path}")
        return
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)


def source_receipt(
    *,
    source_id: str,
    url: str,
    payload: bytes,
    extension: str,
    headers: dict[str, str | None],
    inspection: dict[str, Any],
    data_root: Path,
) -> dict[str, Any]:
    digest = sha256_bytes(payload)
    path = artifact_path(data_root, digest, extension)
    write_once(path, payload)
    return {
        "id": source_id,
        "url": url,
        "bytes": len(payload),
        "sha256": digest,
        "relativePath": path.relative_to(data_root).as_posix(),
        "responseHeaders": headers,
        "inspection": inspection,
    }


def execute(data_root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    assert_freeze_merge_is_ancestor()
    assert_clean_worktree()
    ea_payload, ea_headers = fetch_source(EA_URL)
    sources = [
        source_receipt(
            source_id="ea-recorded-flood-outlines-carlisle-2015",
            url=EA_URL,
            payload=ea_payload,
            extension=".geojson",
            headers=ea_headers,
            inspection=validate_ea_geojson(ea_payload),
            data_root=data_root,
        )
    ]
    for expected in CEMS_SOURCES:
        payload, headers = fetch_source(expected["url"])
        if len(payload) != expected["expectedBytes"]:
            raise ValueError(
                f"{expected['id']} byte length {len(payload)} differs from "
                f"{expected['expectedBytes']}"
            )
        inspection = safe_zip_inventory(payload)
        inspection["delivery"] = expected["delivery"]
        sources.append(
            source_receipt(
                source_id=expected["id"],
                url=expected["url"],
                payload=payload,
                extension=".zip",
                headers=headers,
                inspection=inspection,
                data_root=data_root,
            )
        )

    receipt = {
        "schemaVersion": RECEIPT_SCHEMA,
        "receiptSha256": None,
        "referenceAccessState": "opened_after_prediction_freeze",
        "predictionFreeze": {
            "mergeCommit": PREDICTION_FREEZE_MERGE,
            "protocolSha256": PROTOCOL_SHA256,
            "predictionReceiptSha256": PREDICTION_RECEIPT_SHA256,
        },
        "acquisitionRevision": {
            "commit": git_output("rev-parse", "HEAD"),
            "tree": git_output("rev-parse", "HEAD^{tree}"),
        },
        "selection": {
            "rule": "provider event group 4175 intersecting the frozen prediction domain; no prediction value or geometry participates in selection",
            "frozenDomainBng": DOMAIN_BNG,
            "providerQueryBboxWgs84": DOMAIN_WGS84_BBOX,
            "eaFeatureIds": [EA_FEATURE_ID],
            "copernicusProductIds": [
                "EMSR147_01CARLISLE_DELINEATION_OVERVIEW_v1",
                "EMSR147_01CARLISLE_DELINEATION_OVERVIEW-MONIT01_v1",
            ],
        },
        "isolation": {
            "modelInput": False,
            "calibration": False,
            "predictionSelection": False,
            "automaticExtraction": False,
            "evaluationExecuted": False,
            "referencesCombined": False,
        },
        "sources": sources,
    }
    receipt["receiptSha256"] = canonical_identity(receipt, "receiptSha256")
    receipt_path = data_root / "evaluation-references" / RECEIPT_NAME
    encoded = (json.dumps(receipt, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    write_once(receipt_path, encoded)
    return receipt


def check(data_root: Path) -> dict[str, Any]:
    receipt_path = data_root / "evaluation-references" / RECEIPT_NAME
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("schemaVersion") != RECEIPT_SCHEMA:
        raise ValueError("Reference receipt schema drifted")
    if receipt.get("receiptSha256") != canonical_identity(receipt, "receiptSha256"):
        raise ValueError("Reference receipt identity drifted")
    for source in receipt.get("sources", []):
        source_path = (data_root / source["relativePath"]).resolve()
        try:
            source_path.relative_to(data_root.resolve())
        except ValueError as error:
            raise ValueError("Reference artifact escapes the data root") from error
        payload = source_path.read_bytes()
        if len(payload) != source["bytes"] or sha256_bytes(payload) != source["sha256"]:
            raise ValueError(f"Reference artifact identity drifted: {source['id']}")
        if source["id"].startswith("ea-"):
            inspection = validate_ea_geojson(payload)
        else:
            inspection = safe_zip_inventory(payload)
            inspection["delivery"] = source["inspection"]["delivery"]
        if inspection != source["inspection"]:
            raise ValueError(f"Reference artifact inspection drifted: {source['id']}")
    if len(receipt.get("sources", [])) != 3:
        raise ValueError("Reference receipt must contain exactly three source artifacts")
    return receipt


def plan() -> dict[str, Any]:
    return {
        "schemaVersion": RECEIPT_SCHEMA,
        "mode": "dry_run",
        "predictionFreezeMerge": PREDICTION_FREEZE_MERGE,
        "protocolSha256": PROTOCOL_SHA256,
        "eaSelection": {
            "eventGroupId": EA_EVENT_GROUP_ID,
            "featureId": EA_FEATURE_ID,
            "domainBng": DOMAIN_BNG,
            "queryBboxWgs84": DOMAIN_WGS84_BBOX,
        },
        "copernicusArchiveCount": len(CEMS_SOURCES),
        "networkRequests": 0,
        "filesWritten": 0,
        "evaluationRuns": 0,
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
        result = execute(data_root, manifest)
        mode_name = "execute"
    elif options.check:
        result = check(data_root)
        mode_name = "check"
    else:
        result = plan()
        mode_name = "dry_run"
    print(
        json.dumps(
            {
                "mode": mode_name,
                "dataRoot": str(data_root),
                "receiptSha256": result.get("receiptSha256"),
                "sourceCount": len(result.get("sources", [])),
                "result": result,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
