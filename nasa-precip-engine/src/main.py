"""FastAPI boundary for the canonical GeoLens IMERG provider."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from .cache import (
    get_cache_stats,
    get_cached_window,
    set_cached_window,
)
from .config import (
    API_HOST,
    API_PORT,
    CORS_ORIGINS,
    EARTHDATA_PASSWORD,
    EARTHDATA_USERNAME,
    IMERG_CACHE_DIR,
    LOG_LEVEL,
    MAX_H3_CELLS_PER_REQUEST,
)
from .contracts import (
    TRANSFORMATION_VERSION,
    build_error_window_payload,
    build_window_payload,
)
from .h3_mapping import validate_h3_indices
from .imerg_client import (
    ImergAcquisitionError,
    load_imerg_window,
    normalize_reference_time,
)

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="GeoLens NASA IMERG Evidence Service",
    description=(
        "Canonical real-data IMERG acquisition with explicit missing, "
        "coverage, authentication, and incomplete-window semantics"
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PrecipRequest(BaseModel):
    h3_indices: list[str] = Field(
        min_length=1,
        max_length=MAX_H3_CELLS_PER_REQUEST,
    )
    reference_time: str | None = None
    window_hours: list[Literal[24, 72]] = Field(
        default_factory=lambda: [24, 72],
        min_length=1,
        max_length=2,
    )

    @field_validator("reference_time")
    @classmethod
    def validate_reference_time(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(
                "reference_time must be ISO 8601"
            ) from exc

        return value

    @field_validator("window_hours")
    @classmethod
    def validate_window_hours(
        cls,
        value: list[Literal[24, 72]],
    ) -> list[Literal[24, 72]]:
        if len(value) != len(set(value)):
            raise ValueError("window_hours cannot contain duplicates")

        return value


@app.get("/health")
async def health_check() -> dict[str, object]:
    return {
        "status": "healthy",
        "service": "nasa-precip-engine",
        "version": "2.0.0",
        "contractVersion": TRANSFORMATION_VERSION,
        "earthdataCredentialsConfigured": bool(
            EARTHDATA_USERNAME and EARTHDATA_PASSWORD
        ),
        "persistentCacheConfigured": bool(IMERG_CACHE_DIR),
    }


@app.get("/cache/stats")
async def cache_statistics() -> dict[str, int]:
    return get_cache_stats()


@app.post("/precip/h3")
async def get_precipitation_for_h3(
    request: PrecipRequest,
) -> dict[str, object]:
    try:
        h3_indices = validate_h3_indices(request.h3_indices)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    reference_time = _reference_time(request.reference_time)
    acquired_at = datetime.now(timezone.utc)
    windows: list[dict[str, object]] = []

    for hours in request.window_hours:
        requested_start = reference_time - timedelta(hours=hours)
        cached_window = get_cached_window(reference_time, hours)

        if cached_window is not None:
            windows.append(
                build_window_payload(
                    cached_window,
                    h3_indices,
                    cached=True,
                )
            )
            continue

        try:
            window = await run_in_threadpool(
                load_imerg_window,
                reference_time,
                hours,
            )
            set_cached_window(reference_time, hours, window)
            windows.append(
                build_window_payload(
                    window,
                    h3_indices,
                    cached=False,
                )
            )
        except ImergAcquisitionError as exc:
            windows.append(
                build_error_window_payload(
                    exc,
                    h3_indices,
                    hours=hours,
                    requested_start=requested_start,
                    requested_end=reference_time,
                    acquired_at=acquired_at,
                )
            )
        except Exception as exc:
            logger.exception(
                "Unexpected IMERG provider failure for %sh window",
                hours,
            )
            wrapped = ImergAcquisitionError(
                "upstream_error",
                f"Unexpected IMERG provider failure: {exc}",
            )
            windows.append(
                build_error_window_payload(
                    wrapped,
                    h3_indices,
                    hours=hours,
                    requested_start=requested_start,
                    requested_end=reference_time,
                    acquired_at=acquired_at,
                )
            )

    return {
        "provider": "NASA GES DISC",
        "datasetFamily": "GPM IMERG",
        "contractVersion": TRANSFORMATION_VERSION,
        "referenceTime": _iso(reference_time),
        "acquiredAt": _iso(acquired_at),
        "windows": windows,
    }


def _reference_time(value: str | None) -> datetime:
    if value is None:
        candidate = datetime.now(timezone.utc) - timedelta(hours=6)
    else:
        candidate = datetime.fromisoformat(value.replace("Z", "+00:00"))

    return normalize_reference_time(candidate)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=API_HOST,
        port=API_PORT,
        log_level=LOG_LEVEL.lower(),
    )
