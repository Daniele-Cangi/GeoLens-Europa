#!/usr/bin/env python3
"""Materialize only the DTM archives frozen for the public Cumbria baseline."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import urllib.parse
import urllib.request
import zipfile


MAX_ARCHIVE_BYTES = 1_073_741_824
MAX_TOTAL_DOWNLOAD_BYTES = 2_147_483_648
MAX_ARCHIVE_ENTRIES = 512
MAX_ARCHIVE_EXPANDED_BYTES = 4_294_967_296
MINIMUM_FREE_BYTES = 2_147_483_648
BUFFER_BYTES = 1024 * 1024
RASTER_EXTENSIONS = {".tif", ".tiff", ".asc"}


def main() -> int:
    args = parse_args()
    repository_root = Path(__file__).resolve().parent.parent
    manifest_path = (
        repository_root
        / "tests"
        / "ground-truth"
        / "cumbria-2015"
        / "manifest.json"
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    protocol = validate_protocol(manifest)
    data_root = args.data_root.resolve()
    ensure_external_data_root(data_root, repository_root)

    plan = {
        "materializationId": "cumbria-public-baseline-dtm-v0",
        "mode": "execute" if args.execute else "dry_run",
        "manifestVersion": manifest["manifestVersion"],
        "protocolSha256": protocol["protocolSha256"],
        "dataRoot": str(data_root),
        "archiveCount": len(protocol["terrainAcquisition"]["archiveSelections"]),
        "coveredGridRefs": len(protocol["terrainAcquisition"]["coveredGridRefs"]),
        "missingGridRefs": protocol["terrainAcquisition"]["missingGridRefs"],
        "limits": {
            "maxArchiveBytes": MAX_ARCHIVE_BYTES,
            "maxTotalDownloadBytes": MAX_TOTAL_DOWNLOAD_BYTES,
            "maxArchiveEntries": MAX_ARCHIVE_ENTRIES,
            "maxArchiveExpandedBytes": MAX_ARCHIVE_EXPANDED_BYTES,
            "minimumFreeBytes": MINIMUM_FREE_BYTES,
        },
    }
    if not args.execute:
        print(json.dumps({**plan, "networkRequests": 0, "filesWritten": 0}, indent=2))
        return 0

    data_root.mkdir(parents=True, exist_ok=True)
    ensure_free_space(data_root, MINIMUM_FREE_BYTES)
    result = materialize(protocol, data_root)
    print(json.dumps({**plan, **result}, indent=2))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Download, content-address and safely extract only the six pre-event "
            "DTM archives frozen by the Cumbria public-baseline protocol."
        )
    )
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    return parser.parse_args()


def validate_protocol(manifest: dict) -> dict:
    if manifest.get("manifestVersion") != "0.20.0":
        raise ValueError("Cumbria materializer requires manifest v0.20.0")
    protocol = manifest.get("publicBaselineProtocol")
    if not isinstance(protocol, dict):
        raise ValueError("Cumbria public-baseline protocol is missing")
    if protocol.get("state") != "domain_frozen_terrain_acquisition_ready":
        raise ValueError("Cumbria public-baseline domain is not frozen")
    if protocol.get("selectionIsolation") != {
        "observedFloodGeometryLoaded": False,
        "observedFloodGeometryUsed": False,
        "postEventModelUsed": False,
        "selectionInputs": [
            "ea-hydrology-sheepmount-flow",
            "cumberland-carlisle-sfra-2011-main-and-appendix-c",
            "ea-lidar-dtm-time-stamped",
        ],
    }:
        raise ValueError("Cumbria public-baseline selection isolation drifted")
    execution = protocol.get("execution", {})
    if execution.get("terrainDownloadAllowed") is not True:
        raise ValueError("Cumbria public-baseline terrain download is not authorized")
    if execution.get("solverExecutionAllowed") is not False:
        raise ValueError("Cumbria materializer cannot run after solver authorization drift")
    terrain = protocol.get("terrainAcquisition", {})
    if terrain.get("archiveCount") != 6 or len(terrain.get("archiveSelections", [])) != 6:
        raise ValueError("Cumbria public-baseline archive selection drifted")
    if terrain.get("archiveBytesDownloaded") != 0 or terrain.get("rasterBytesWritten") != 0:
        raise ValueError("Manifest must remain a pre-execution protocol, not a mutable receipt")
    stored_hash = protocol.get("protocolSha256")
    hash_payload = {key: value for key, value in protocol.items() if key != "protocolSha256"}
    computed_hash = sha256_bytes(
        json.dumps(hash_payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    if stored_hash != computed_hash:
        raise ValueError("Cumbria public-baseline protocol SHA-256 does not match content")
    return protocol


def ensure_external_data_root(data_root: Path, repository_root: Path) -> None:
    if data_root == repository_root or repository_root in data_root.parents:
        raise ValueError("Cumbria DTM data root must stay outside the Git repository")
    if "onedrive" in {part.casefold() for part in data_root.parts}:
        raise ValueError("Cumbria DTM data root must stay outside OneDrive")


def ensure_free_space(path: Path, required_bytes: int) -> None:
    free_bytes = shutil.disk_usage(path).free
    if free_bytes < required_bytes:
        raise OSError(
            f"Cumbria DTM materialization requires {required_bytes} free bytes; "
            f"only {free_bytes} are available"
        )


def materialize(protocol: dict, data_root: Path) -> dict:
    archives_directory = data_root / "archives" / "sha256"
    receipts_directory = data_root / "receipts" / "sha256"
    rasters_directory = data_root / "rasters" / "sha256"
    staging_directory = data_root / "staging"
    for directory in (
        archives_directory,
        receipts_directory,
        rasters_directory,
        staging_directory,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    downloads = []
    total_downloaded_bytes = 0
    extracted_source_rasters = set()
    files_written = 0
    network_requests = 0
    for archive in protocol["terrainAcquisition"]["archiveSelections"]:
        ensure_free_space(data_root, MINIMUM_FREE_BYTES)
        existing = find_existing_archive_receipt(
            receipts_directory,
            archive,
            protocol["protocolSha256"],
            protocol["terrainAcquisition"]["archiveSelectionSha256"],
        )
        if existing is None:
            network_requests += 1
            receipt = download_archive(
                archive,
                protocol["protocolSha256"],
                protocol["terrainAcquisition"]["archiveSelectionSha256"],
                archives_directory,
                receipts_directory,
                staging_directory,
                MAX_ARCHIVE_BYTES,
            )
            total_downloaded_bytes += receipt["byteLength"]
            files_written += 2
            if total_downloaded_bytes > MAX_TOTAL_DOWNLOAD_BYTES:
                raise OSError("Cumbria DTM total download limit was exceeded")
        else:
            receipt = existing
            verify_existing_archive(data_root, receipt)

        archive_path = data_root / receipt["archivePath"]
        extracted = extract_archive_rasters(
            archive_path,
            receipt["sha256"],
            rasters_directory,
            receipts_directory,
            staging_directory,
        )
        files_written += extracted["filesWritten"]
        extracted_source_rasters.update(item["sha256"] for item in extracted["rasters"])
        downloads.append(
            {
                "identity": archive_identity(archive),
                "sourceUri": archive["uri"],
                "archiveSha256": receipt["sha256"],
                "archiveBytes": receipt["byteLength"],
                "archivePath": receipt["archivePath"],
                "gridRefs": archive["gridRefs"],
                "rasters": extracted["rasters"],
                "reused": existing is not None,
            }
        )

    execution_without_hash = {
        "materializationId": "cumbria-public-baseline-dtm-v0",
        "protocolSha256": protocol["protocolSha256"],
        "archiveSelectionSha256": protocol["terrainAcquisition"]["archiveSelectionSha256"],
        "coveredGridRefsPendingMask": protocol["terrainAcquisition"]["coveredGridRefs"],
        "missingGridRefs": protocol["terrainAcquisition"]["missingGridRefs"],
        "missingPolicy": protocol["terrainAcquisition"]["missingPolicy"],
        "downloads": downloads,
    }
    execution_receipt = {
        **execution_without_hash,
        "receiptSha256": sha256_bytes(canonical_json(execution_without_hash)),
    }
    execution_path = data_root / "cumbria-public-baseline-dtm.receipt.json"
    wrote_execution = atomic_write_json(execution_path, execution_receipt, replace=True)
    files_written += int(wrote_execution)
    return {
        "state": "source_rasters_materialized_grid_mask_pending",
        "networkRequests": network_requests,
        "filesWritten": files_written,
        "downloadedBytesThisRun": total_downloaded_bytes,
        "archiveBytes": sum(item["archiveBytes"] for item in downloads),
        "sourceRasterCount": len(extracted_source_rasters),
        "receiptPath": str(execution_path),
        "receiptSha256": execution_receipt["receiptSha256"],
        "downloads": downloads,
    }


def find_existing_archive_receipt(
    receipts_directory: Path,
    archive: dict,
    protocol_sha256: str,
    archive_selection_sha256: str,
) -> dict | None:
    identity = archive_identity(archive)
    matches = []
    for path in receipts_directory.glob("*.archive.receipt.json"):
        receipt = json.loads(path.read_text(encoding="utf-8"))
        if receipt.get("archiveIdentity") == identity:
            if receipt.get("sourceUri") != archive["uri"]:
                raise ValueError(f"Existing receipt URI drifted for {identity}")
            if receipt.get("mappedGridRefs") != archive["gridRefs"]:
                raise ValueError(f"Existing receipt grid mapping drifted for {identity}")
            if receipt.get("protocolSha256") != protocol_sha256:
                raise ValueError(f"Existing receipt protocol identity drifted for {identity}")
            if receipt.get("archiveSelectionSha256") != archive_selection_sha256:
                raise ValueError(f"Existing receipt archive selection drifted for {identity}")
            matches.append(receipt)
    if len(matches) > 1:
        raise ValueError(f"Multiple archive receipts claim identity {identity}")
    return matches[0] if matches else None


def download_archive(
    archive: dict,
    protocol_sha256: str,
    archive_selection_sha256: str,
    archives_directory: Path,
    receipts_directory: Path,
    staging_directory: Path,
    maximum_bytes: int,
) -> dict:
    identity = archive_identity(archive)
    safe_identity = re.sub(r"[^A-Za-z0-9._-]+", "_", identity)
    partial_path = staging_directory / f"{safe_identity}.zip.part"
    if partial_path.exists():
        partial_path.unlink()
    source_uri = add_subscription_key(archive["uri"])
    request = urllib.request.Request(
        source_uri,
        headers={"User-Agent": "GeoLens-Cumbria-Evidence/0.1"},
    )
    digest = hashlib.sha256()
    byte_length = 0
    try:
        with urllib.request.urlopen(request, timeout=60) as response, partial_path.open("wb") as output:
            content_type = response.headers.get_content_type()
            disposition = response.headers.get("Content-Disposition")
            if content_type not in {"application/zip", "application/octet-stream"}:
                raise ValueError(f"Unexpected content type {content_type!r} for {identity}")
            while True:
                chunk = response.read(BUFFER_BYTES)
                if not chunk:
                    break
                byte_length += len(chunk)
                if byte_length > maximum_bytes:
                    raise OSError(f"Archive {identity} exceeded {maximum_bytes} bytes")
                digest.update(chunk)
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        if byte_length == 0:
            raise ValueError(f"Archive {identity} was empty")
        with partial_path.open("rb") as source:
            if source.read(4)[:2] != b"PK":
                raise ValueError(f"Archive {identity} lacks a ZIP signature")
        sha256 = digest.hexdigest()
        final_path = archives_directory / f"{sha256}.zip"
        if final_path.exists():
            if sha256_file(final_path) != sha256:
                raise ValueError(f"Existing content-addressed archive {sha256} is corrupt")
            partial_path.unlink()
        else:
            os.replace(partial_path, final_path)
        receipt = {
            "sourceUri": archive["uri"],
            "archiveIdentity": identity,
            "downloadedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "byteLength": byte_length,
            "sha256": sha256,
            "contentType": content_type,
            "contentDisposition": disposition,
            "protocolSha256": protocol_sha256,
            "archiveSelectionSha256": archive_selection_sha256,
            "archivePath": portable_path(final_path, archives_directory.parent.parent),
            "mappedGridRefs": archive["gridRefs"],
        }
        receipt_path = receipts_directory / f"{sha256}.archive.receipt.json"
        atomic_write_json(receipt_path, receipt, replace=False)
        return receipt
    except Exception:
        if partial_path.exists():
            partial_path.unlink()
        raise


def verify_existing_archive(data_root: Path, receipt: dict) -> None:
    archive_path = (data_root / receipt["archivePath"]).resolve()
    if data_root.resolve() not in archive_path.parents:
        raise ValueError("Existing archive receipt escapes the data root")
    if not archive_path.is_file():
        raise FileNotFoundError(f"Existing archive is missing: {archive_path}")
    if archive_path.stat().st_size != receipt["byteLength"]:
        raise ValueError(f"Existing archive byte length drifted: {archive_path}")
    if sha256_file(archive_path) != receipt["sha256"]:
        raise ValueError(f"Existing archive SHA-256 drifted: {archive_path}")


def extract_archive_rasters(
    archive_path: Path,
    archive_sha256: str,
    rasters_directory: Path,
    receipts_directory: Path,
    staging_directory: Path,
) -> dict:
    with zipfile.ZipFile(archive_path) as archive:
        entries = validate_zip_entries(archive)
        selected_entries = [
            entry
            for entry in entries
            if PurePosixPath(entry.filename).suffix.lower() in RASTER_EXTENSIONS
        ]
        if not selected_entries:
            raise ValueError("DTM ZIP contains no supported raster entries")
        rasters = []
        files_written = 0
        for entry in selected_entries:
            extension = PurePosixPath(entry.filename).suffix.lower()
            entry_token = sha256_bytes(entry.filename.encode("utf-8"))[:16]
            partial_path = staging_directory / f"{archive_sha256}-{entry_token}{extension}.part"
            digest = hashlib.sha256()
            byte_length = 0
            with archive.open(entry, "r") as source, partial_path.open("wb") as output:
                while True:
                    chunk = source.read(BUFFER_BYTES)
                    if not chunk:
                        break
                    byte_length += len(chunk)
                    if byte_length > entry.file_size:
                        raise ValueError(f"ZIP entry {entry.filename} exceeded declared size")
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if byte_length != entry.file_size:
                partial_path.unlink(missing_ok=True)
                raise ValueError(f"ZIP entry {entry.filename} byte accounting failed")
            raster_sha256 = digest.hexdigest()
            final_path = rasters_directory / f"{raster_sha256}{extension}"
            if final_path.exists():
                if sha256_file(final_path) != raster_sha256:
                    partial_path.unlink(missing_ok=True)
                    raise ValueError(f"Existing raster {raster_sha256} is corrupt")
                partial_path.unlink()
            else:
                os.replace(partial_path, final_path)
                files_written += 1
            receipt = {
                "archiveSha256": archive_sha256,
                "sourceEntry": entry.filename,
                "byteLength": byte_length,
                "sha256": raster_sha256,
                "rasterPath": portable_path(final_path, rasters_directory.parent.parent),
                "spatialEligibility": "pending_georeferenced_grid_mask",
            }
            receipt_path = receipts_directory / (
                f"{archive_sha256}-{raster_sha256}.raster.receipt.json"
            )
            files_written += int(atomic_write_json(receipt_path, receipt, replace=False))
            rasters.append(receipt)
        return {"rasters": rasters, "filesWritten": files_written}


def validate_zip_entries(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    entries = archive.infolist()
    if len(entries) > MAX_ARCHIVE_ENTRIES:
        raise ValueError("DTM ZIP contains too many entries")
    expanded_bytes = 0
    normalized_paths = set()
    safe_entries = []
    for entry in entries:
        raw_name = entry.filename
        if "\\" in raw_name or re.match(r"^[A-Za-z]:", raw_name):
            raise ValueError(f"Unsafe ZIP entry path {raw_name!r}")
        normalized = PurePosixPath(raw_name)
        if normalized.is_absolute() or ".." in normalized.parts:
            raise ValueError(f"Unsafe ZIP entry path {raw_name!r}")
        key = normalized.as_posix().casefold()
        if key in normalized_paths:
            raise ValueError(f"Duplicate normalized ZIP entry {raw_name!r}")
        normalized_paths.add(key)
        unix_mode = (entry.external_attr >> 16) & 0xFFFF
        if stat.S_IFMT(unix_mode) == stat.S_IFLNK:
            raise ValueError(f"ZIP symlink entry is forbidden: {raw_name!r}")
        if entry.flag_bits & 0x1:
            raise ValueError(f"Encrypted ZIP entry is forbidden: {raw_name!r}")
        if entry.is_dir():
            continue
        expanded_bytes += entry.file_size
        if expanded_bytes > MAX_ARCHIVE_EXPANDED_BYTES:
            raise ValueError("DTM ZIP exceeds the expanded-byte limit")
        safe_entries.append(entry)
    return safe_entries


def archive_identity(archive: dict) -> str:
    return (
        f"{archive['product']}/{archive['year']}/"
        f"{archive['resolutionMetres']}/{archive['tile']}"
    )


def add_subscription_key(uri: str) -> str:
    parts = urllib.parse.urlsplit(uri)
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    query.append(("subscription-key", "dspui"))
    return urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(query), parts.fragment)
    )


def portable_path(path: Path, data_root: Path) -> str:
    return path.resolve().relative_to(data_root.resolve()).as_posix()


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")


def atomic_write_json(path: Path, value: object, *, replace: bool) -> bool:
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and not replace:
        existing = json.loads(path.read_text(encoding="utf-8"))
        if existing != value:
            raise ValueError(f"Existing receipt differs: {path}")
        return False
    partial_path = path.with_suffix(path.suffix + ".part")
    with partial_path.open("w", encoding="utf-8", newline="\n") as output:
        output.write(payload)
        output.flush()
        os.fsync(output.fileno())
    os.replace(partial_path, path)
    return True


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(BUFFER_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # pragma: no cover - CLI failure path
        print(f"Cumbria DTM materialization failed: {error}", file=sys.stderr)
        sys.exit(1)
