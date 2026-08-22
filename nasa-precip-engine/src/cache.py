"""Small exact-window cache for canonical IMERG acquisitions."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime
from threading import RLock

from .config import CACHE_MAX_SIZE, CACHE_TTL_SECONDS
from .imerg_client import ImergWindow, normalize_reference_time


@dataclass(frozen=True)
class CacheEntry:
    window: ImergWindow
    cached_at: float

    def is_expired(self, now: float) -> bool:
        return now - self.cached_at > CACHE_TTL_SECONDS


_CACHE: dict[tuple[str, int], CacheEntry] = {}
_LOCK = RLock()


def _key(t_ref: datetime, hours: int) -> tuple[str, int]:
    return normalize_reference_time(t_ref).isoformat(), hours


def get_cached_window(
    t_ref: datetime,
    hours: int,
) -> ImergWindow | None:
    now = time.time()
    key = _key(t_ref, hours)

    with _LOCK:
        entry = _CACHE.get(key)

        if entry is None:
            return None

        if entry.is_expired(now):
            del _CACHE[key]
            return None

        return entry.window


def set_cached_window(
    t_ref: datetime,
    hours: int,
    window: ImergWindow,
) -> None:
    now = time.time()
    key = _key(t_ref, hours)

    with _LOCK:
        if len(_CACHE) >= CACHE_MAX_SIZE and key not in _CACHE:
            oldest_key = min(
                _CACHE,
                key=lambda candidate: _CACHE[candidate].cached_at,
            )
            del _CACHE[oldest_key]

        _CACHE[key] = CacheEntry(window=window, cached_at=now)


def clear_cache() -> None:
    with _LOCK:
        _CACHE.clear()


def get_cache_stats() -> dict[str, int]:
    now = time.time()

    with _LOCK:
        expired = sum(
            entry.is_expired(now)
            for entry in _CACHE.values()
        )
        return {
            "total_entries": len(_CACHE),
            "expired_entries": expired,
            "valid_entries": len(_CACHE) - expired,
            "max_size": CACHE_MAX_SIZE,
            "ttl_seconds": CACHE_TTL_SECONDS,
        }
