"""Exact-window memory and optional persistent cache for real IMERG data."""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Any

import xarray as xr

from .config import (
    CACHE_MAX_SIZE,
    CACHE_TTL_SECONDS,
    IMERG_CACHE_DIR,
    IMERG_DEFAULT_DATASET_VERSION,
    IMERG_DISK_CACHE_TTL_SECONDS,
)
from .imerg_client import (
    ImergWindow,
    ImergWindowMetadata,
    normalize_reference_time,
)

logger = logging.getLogger(__name__)

_CACHE_SCHEMA_VERSION = 2


@dataclass(frozen=True)
class CacheEntry:
    window: ImergWindow
    cached_at: float

    def is_expired(self, now: float) -> bool:
        return now - self.cached_at > CACHE_TTL_SECONDS


_CACHE: dict[tuple[str, str, int], CacheEntry] = {}
_LOCK = RLock()


def _key(
    t_ref: datetime,
    hours: int,
    dataset_version: str,
) -> tuple[str, str, int]:
    return (
        dataset_version,
        normalize_reference_time(t_ref).isoformat(),
        hours,
    )


def get_cached_window(
    t_ref: datetime,
    hours: int,
    dataset_version: str = IMERG_DEFAULT_DATASET_VERSION,
) -> ImergWindow | None:
    now = time.time()
    key = _key(t_ref, hours, dataset_version)

    with _LOCK:
        entry = _CACHE.get(key)

        if entry is not None:
            if entry.is_expired(now):
                del _CACHE[key]
            else:
                return entry.window

    disk_window = _read_disk_window(
        t_ref,
        hours,
        dataset_version,
        now,
    )

    if disk_window is None:
        return None

    with _LOCK:
        _set_memory_entry(key, disk_window, now)

    return disk_window


def set_cached_window(
    t_ref: datetime,
    hours: int,
    window: ImergWindow,
) -> None:
    now = time.time()
    key = _key(t_ref, hours, window.metadata.dataset_version)

    with _LOCK:
        _set_memory_entry(key, window, now)

    if window.metadata.status == "available":
        _write_disk_window(t_ref, hours, window, now)


def clear_cache() -> None:
    """Clear only process memory; persistent evidence remains managed by TTL."""

    with _LOCK:
        _CACHE.clear()


def get_cache_stats() -> dict[str, int]:
    now = time.time()

    with _LOCK:
        expired = sum(
            entry.is_expired(now)
            for entry in _CACHE.values()
        )
        memory = {
            "total_entries": len(_CACHE),
            "expired_entries": expired,
            "valid_entries": len(_CACHE) - expired,
            "max_size": CACHE_MAX_SIZE,
            "ttl_seconds": CACHE_TTL_SECONDS,
        }

    return {
        **memory,
        **_disk_cache_stats(now),
    }


def _set_memory_entry(
    key: tuple[str, str, int],
    window: ImergWindow,
    cached_at: float,
) -> None:
    if len(_CACHE) >= CACHE_MAX_SIZE and key not in _CACHE:
        oldest_key = min(
            _CACHE,
            key=lambda candidate: _CACHE[candidate].cached_at,
        )
        del _CACHE[oldest_key]

    _CACHE[key] = CacheEntry(
        window=window,
        cached_at=cached_at,
    )


def _cache_paths(
    t_ref: datetime,
    hours: int,
    dataset_version: str,
) -> tuple[Path, Path] | None:
    if not IMERG_CACHE_DIR:
        return None

    normalized = normalize_reference_time(t_ref)
    stem = (
        f"v{dataset_version}_"
        + normalized.strftime("%Y%m%dT%H%M%SZ")
        + f"_{hours}h"
    )
    directory = Path(IMERG_CACHE_DIR).expanduser()
    return (
        directory / f"{stem}.nc",
        directory / f"{stem}.json",
    )


def _read_disk_window(
    t_ref: datetime,
    hours: int,
    dataset_version: str,
    now: float,
) -> ImergWindow | None:
    paths = _cache_paths(t_ref, hours, dataset_version)

    if paths is None:
        return None

    data_path, metadata_path = paths

    if not data_path.is_file() or not metadata_path.is_file():
        return None

    try:
        payload = json.loads(
            metadata_path.read_text(encoding="utf-8")
        )
        _validate_cache_envelope(
            payload,
            t_ref,
            hours,
            dataset_version,
            now,
        )
        metadata = _metadata_from_payload(payload["windowMetadata"])
        if metadata.dataset_version != dataset_version:
            raise ValueError(
                "Persistent cache metadata version mismatch"
            )
        opened = xr.open_dataarray(
            data_path,
            engine="h5netcdf",
        )
        try:
            data = opened.load()
        finally:
            opened.close()

        if (
            data.ndim != 2
            or "lat" not in data.dims
            or "lon" not in data.dims
        ):
            raise ValueError(
                "Cached IMERG accumulation must be a 2D lat/lon array"
            )

        logger.info(
            "[IMERG] Restored persistent evidence cache %s",
            metadata_path.name,
        )
        return ImergWindow(data=data, metadata=metadata)
    except Exception as exc:
        logger.warning(
            "[IMERG] Persistent cache %s is unusable: %s",
            metadata_path,
            exc,
        )
        return None


def _write_disk_window(
    t_ref: datetime,
    hours: int,
    window: ImergWindow,
    cached_at: float,
) -> None:
    paths = _cache_paths(
        t_ref,
        hours,
        window.metadata.dataset_version,
    )

    if paths is None:
        return

    data_path, metadata_path = paths
    data_temp = data_path.with_suffix(".nc.tmp")
    metadata_temp = metadata_path.with_suffix(".json.tmp")
    payload = {
        "schemaVersion": _CACHE_SCHEMA_VERSION,
        "referenceTime": normalize_reference_time(t_ref).isoformat(),
        "windowHours": hours,
        "datasetVersion": window.metadata.dataset_version,
        "cachedAtEpoch": cached_at,
        "windowMetadata": _metadata_to_payload(window.metadata),
    }

    try:
        data_path.parent.mkdir(parents=True, exist_ok=True)
        window.data.to_netcdf(
            data_temp,
            engine="h5netcdf",
        )
        metadata_temp.write_text(
            json.dumps(payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        os.replace(data_temp, data_path)
        os.replace(metadata_temp, metadata_path)
        logger.info(
            "[IMERG] Persisted real evidence cache %s",
            metadata_path.name,
        )
    except Exception as exc:
        logger.warning(
            "[IMERG] Persistent cache write failed without changing "
            "provider evidence: %s",
            exc,
        )
    finally:
        data_temp.unlink(missing_ok=True)
        metadata_temp.unlink(missing_ok=True)


def _validate_cache_envelope(
    payload: Any,
    t_ref: datetime,
    hours: int,
    dataset_version: str,
    now: float,
) -> None:
    if not isinstance(payload, dict):
        raise ValueError("Cache metadata must be an object")

    if payload.get("schemaVersion") != _CACHE_SCHEMA_VERSION:
        raise ValueError("Unsupported persistent cache schema")

    expected_reference = normalize_reference_time(t_ref).isoformat()

    if payload.get("referenceTime") != expected_reference:
        raise ValueError("Persistent cache reference time mismatch")

    if payload.get("windowHours") != hours:
        raise ValueError("Persistent cache window length mismatch")

    if payload.get("datasetVersion") != dataset_version:
        raise ValueError("Persistent cache dataset version mismatch")

    cached_at = payload.get("cachedAtEpoch")

    if not isinstance(cached_at, (int, float)):
        raise ValueError("Persistent cache lacks cachedAtEpoch")

    age_seconds = now - float(cached_at)

    if age_seconds < 0 or age_seconds > IMERG_DISK_CACHE_TTL_SECONDS:
        raise ValueError("Persistent cache entry is expired")


def _metadata_to_payload(
    metadata: ImergWindowMetadata,
) -> dict[str, Any]:
    return {
        "product": metadata.product,
        "runType": metadata.run_type,
        "datasetVersion": metadata.dataset_version,
        "archiveVersion": metadata.archive_version,
        "requestedWindowStart": metadata.requested_window_start.isoformat(),
        "requestedWindowEnd": metadata.requested_window_end.isoformat(),
        "actualWindowStart": _optional_iso(
            metadata.actual_window_start
        ),
        "actualWindowEnd": _optional_iso(metadata.actual_window_end),
        "expectedGranuleCount": metadata.expected_granule_count,
        "searchedGranuleCount": metadata.searched_granule_count,
        "granuleCount": metadata.granule_count,
        "granuleTimestamps": [
            value.isoformat()
            for value in metadata.granule_timestamps
        ],
        "variableNames": list(metadata.variable_names),
        "acquiredAt": metadata.acquired_at.isoformat(),
        "sourceResolution": metadata.source_resolution,
        "samplingMethod": metadata.sampling_method,
        "status": metadata.status,
        "missingReason": metadata.missing_reason,
    }


def _metadata_from_payload(
    payload: Any,
) -> ImergWindowMetadata:
    if not isinstance(payload, dict):
        raise ValueError("Cache windowMetadata must be an object")

    run_type = payload.get("runType")
    status = payload.get("status")

    if run_type not in ("final", "late", "early"):
        raise ValueError("Cached IMERG run type is invalid")

    if status != "available":
        raise ValueError(
            "Persistent cache may contain only available evidence"
        )

    timestamps = tuple(
        _parse_datetime(value)
        for value in _string_list(
            payload.get("granuleTimestamps"),
            "granuleTimestamps",
        )
    )
    variables = tuple(
        _string_list(
            payload.get("variableNames"),
            "variableNames",
        )
    )
    expected_count = _integer(
        payload,
        "expectedGranuleCount",
    )
    granule_count = _integer(payload, "granuleCount")

    if granule_count != len(timestamps):
        raise ValueError("Cached granule count does not match timestamps")

    if granule_count != expected_count:
        raise ValueError("Cached available window is not complete")

    return ImergWindowMetadata(
        product=_string(payload, "product"),
        run_type=run_type,
        dataset_version=_string(payload, "datasetVersion"),
        archive_version=_string(payload, "archiveVersion"),
        requested_window_start=_parse_datetime(
            _string(payload, "requestedWindowStart")
        ),
        requested_window_end=_parse_datetime(
            _string(payload, "requestedWindowEnd")
        ),
        actual_window_start=_parse_optional_datetime(
            payload.get("actualWindowStart")
        ),
        actual_window_end=_parse_optional_datetime(
            payload.get("actualWindowEnd")
        ),
        expected_granule_count=expected_count,
        searched_granule_count=_integer(
            payload,
            "searchedGranuleCount",
        ),
        granule_count=granule_count,
        granule_timestamps=timestamps,
        variable_names=variables,
        acquired_at=_parse_datetime(_string(payload, "acquiredAt")),
        source_resolution=_string(payload, "sourceResolution"),
        sampling_method=_string(payload, "samplingMethod"),
        status="available",
        missing_reason=None,
    )


def _disk_cache_stats(now: float) -> dict[str, int]:
    if not IMERG_CACHE_DIR:
        return {
            "disk_enabled": 0,
            "disk_total_entries": 0,
            "disk_valid_entries": 0,
            "disk_expired_entries": 0,
            "disk_bytes": 0,
            "disk_ttl_seconds": IMERG_DISK_CACHE_TTL_SECONDS,
        }

    directory = Path(IMERG_CACHE_DIR).expanduser()

    if not directory.is_dir():
        return {
            "disk_enabled": 1,
            "disk_total_entries": 0,
            "disk_valid_entries": 0,
            "disk_expired_entries": 0,
            "disk_bytes": 0,
            "disk_ttl_seconds": IMERG_DISK_CACHE_TTL_SECONDS,
        }

    total = 0
    valid = 0
    expired = 0

    for metadata_path in directory.glob("*.json"):
        total += 1
        try:
            payload = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            cached_at = float(payload["cachedAtEpoch"])
            age_seconds = now - cached_at
            if (
                age_seconds < 0
                or age_seconds > IMERG_DISK_CACHE_TTL_SECONDS
            ):
                expired += 1
            else:
                valid += 1
        except Exception:
            expired += 1

    disk_bytes = sum(
        candidate.stat().st_size
        for candidate in directory.iterdir()
        if candidate.is_file()
        and candidate.suffix in (".json", ".nc")
    )
    return {
        "disk_enabled": 1,
        "disk_total_entries": total,
        "disk_valid_entries": valid,
        "disk_expired_entries": expired,
        "disk_bytes": disk_bytes,
        "disk_ttl_seconds": IMERG_DISK_CACHE_TTL_SECONDS,
    }


def _optional_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _parse_optional_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Cached optional timestamp must be a string")
    return _parse_datetime(value)


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _string(
    payload: dict[str, Any],
    key: str,
) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"Cached {key} must be a non-empty string")
    return value


def _string_list(value: Any, key: str) -> list[str]:
    if (
        not isinstance(value, list)
        or any(not isinstance(item, str) for item in value)
    ):
        raise ValueError(f"Cached {key} must be a string list")
    return value


def _integer(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"Cached {key} must be a non-negative integer")
    return value
