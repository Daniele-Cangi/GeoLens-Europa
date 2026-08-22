"""Serialize IMERG acquisition into the canonical GeoLens evidence shape."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Sequence

from .config import (
    IMERG_DATASET_VERSION,
    IMERG_INTERVAL_MINUTES,
)
from .h3_mapping import sample_precip_for_h3
from .imerg_client import (
    EvidenceStatus,
    ImergAcquisitionError,
    ImergWindow,
)

TRANSFORMATION_VERSION = "imerg-h3-evidence-v0.1.0"


def build_window_payload(
    window: ImergWindow,
    h3_indices: Sequence[str],
    *,
    cached: bool,
) -> dict[str, Any]:
    metadata = window.metadata
    hours = int(
        (
            metadata.requested_window_end
            - metadata.requested_window_start
        ).total_seconds()
        // 3600
    )
    samples = (
        sample_precip_for_h3(window.data, h3_indices)
        if metadata.status == "available"
        else {}
    )
    cells: list[dict[str, Any]] = []

    for h3_index in h3_indices:
        h3_sample = samples.get(h3_index)

        if metadata.status != "available":
            status = metadata.status
            value = None
            reason = metadata.missing_reason
            lat = None
            lon = None
            sampled_lat = None
            sampled_lon = None
        elif h3_sample is None:
            status = "invalid_response"
            value = None
            reason = "Validated H3 cell was absent from sampling output"
            lat = None
            lon = None
            sampled_lat = None
            sampled_lon = None
        else:
            status = h3_sample.sample.status
            value = h3_sample.sample.value_mm
            reason = h3_sample.sample.missing_reason
            lat = h3_sample.centroid_lat
            lon = h3_sample.centroid_lon
            sampled_lat = h3_sample.sample.sampled_lat
            sampled_lon = h3_sample.sample.sampled_lon

        evidence = _evidence_payload(
            h3_index=h3_index,
            value=value,
            status=status,
            missing_reason=reason,
            lat=lat,
            lon=lon,
            sampled_lat=sampled_lat,
            sampled_lon=sampled_lon,
            product=metadata.product,
            run_type=metadata.run_type,
            requested_start=metadata.requested_window_start,
            requested_end=metadata.requested_window_end,
            acquired_at=metadata.acquired_at,
            actual_start=metadata.actual_window_start,
            actual_end=metadata.actual_window_end,
            expected_granules=metadata.expected_granule_count,
            searched_granules=metadata.searched_granule_count,
            granule_timestamps=metadata.granule_timestamps,
            variable_names=metadata.variable_names,
            cached=cached,
            sampling_method=metadata.sampling_method,
        )
        cells.append(
            {
                "h3": h3_index,
                "rainfallMm": evidence,
            }
        )

    return {
        "windowHours": hours,
        "status": metadata.status,
        "missingReason": metadata.missing_reason,
        "product": metadata.product,
        "runType": metadata.run_type,
        "datasetVersion": metadata.dataset_version,
        "requestedWindow": {
            "start": _iso(metadata.requested_window_start),
            "end": _iso(metadata.requested_window_end),
        },
        "actualWindow": (
            {
                "start": _iso(metadata.actual_window_start),
                "end": _iso(metadata.actual_window_end),
            }
            if metadata.actual_window_start is not None
            and metadata.actual_window_end is not None
            else None
        ),
        "expectedGranuleCount": metadata.expected_granule_count,
        "searchedGranuleCount": metadata.searched_granule_count,
        "granuleCount": metadata.granule_count,
        "granuleTimestamps": [
            _iso(value) for value in metadata.granule_timestamps
        ],
        "sourceResolution": metadata.source_resolution,
        "samplingMethod": metadata.sampling_method,
        "cached": cached,
        "cells": cells,
    }


def build_error_window_payload(
    error: ImergAcquisitionError,
    h3_indices: Sequence[str],
    *,
    hours: int,
    requested_start: datetime,
    requested_end: datetime,
    acquired_at: datetime,
) -> dict[str, Any]:
    expected_count = hours * 60 // IMERG_INTERVAL_MINUTES
    product = error.product or "GPM IMERG"
    run_type = error.run_type
    cells = [
        {
            "h3": h3_index,
            "rainfallMm": _evidence_payload(
                h3_index=h3_index,
                value=None,
                status=error.status,
                missing_reason=str(error),
                lat=None,
                lon=None,
                sampled_lat=None,
                sampled_lon=None,
                product=product,
                run_type=run_type,
                requested_start=requested_start,
                requested_end=requested_end,
                acquired_at=acquired_at,
                actual_start=None,
                actual_end=None,
                expected_granules=expected_count,
                searched_granules=0,
                granule_timestamps=(),
                variable_names=(),
                cached=False,
                sampling_method=(
                    "nearest IMERG grid cell at H3 centroid"
                ),
            ),
        }
        for h3_index in h3_indices
    ]

    return {
        "windowHours": hours,
        "status": error.status,
        "missingReason": str(error),
        "product": product,
        "runType": run_type,
        "datasetVersion": IMERG_DATASET_VERSION,
        "requestedWindow": {
            "start": _iso(requested_start),
            "end": _iso(requested_end),
        },
        "actualWindow": None,
        "expectedGranuleCount": expected_count,
        "searchedGranuleCount": 0,
        "granuleCount": 0,
        "granuleTimestamps": [],
        "sourceResolution": "0.1 degree",
        "samplingMethod": (
            "nearest IMERG grid cell at H3 centroid"
        ),
        "cached": False,
        "cells": cells,
    }


def _evidence_payload(
    *,
    h3_index: str,
    value: float | None,
    status: EvidenceStatus,
    missing_reason: str | None,
    lat: float | None,
    lon: float | None,
    sampled_lat: float | None,
    sampled_lon: float | None,
    product: str,
    run_type: str | None,
    requested_start: datetime,
    requested_end: datetime,
    acquired_at: datetime,
    actual_start: datetime | None,
    actual_end: datetime | None,
    expected_granules: int,
    searched_granules: int,
    granule_timestamps: Sequence[datetime],
    variable_names: Sequence[str],
    cached: bool,
    sampling_method: str,
) -> dict[str, Any]:
    if status == "available" and value is None:
        raise ValueError("Available IMERG evidence requires a value")

    if status != "available" and value is not None:
        raise ValueError(
            f"IMERG evidence with status {status} cannot carry a value"
        )

    spatial: dict[str, Any] = {
        "h3": h3_index,
        "sourceResolution": "0.1 degree",
    }
    if lat is not None and lon is not None:
        spatial["lat"] = lat
        spatial["lon"] = lon

    quality: dict[str, Any] = {"status": status}

    if missing_reason is not None:
        quality["missingReason"] = missing_reason

    return {
        "value": value,
        "unit": "mm",
        "spatial": spatial,
        "temporal": {
            "observedAt": _iso(requested_end),
            "windowStart": _iso(requested_start),
            "windowEnd": _iso(requested_end),
            "acquiredAt": _iso(acquired_at),
        },
        "provenance": {
            "provider": "NASA GES DISC",
            "dataset": product,
            "datasetVersion": IMERG_DATASET_VERSION,
            "transformation": (
                "sum half-hour precipitation rates then sample "
                "at H3 centroid"
            ),
            "transformationVersion": TRANSFORMATION_VERSION,
            "samplingMethod": sampling_method,
            "sourceMetadata": {
                "runType": run_type,
                "actualWindowStart": (
                    _iso(actual_start)
                    if actual_start is not None
                    else None
                ),
                "actualWindowEnd": (
                    _iso(actual_end)
                    if actual_end is not None
                    else None
                ),
                "expectedGranuleCount": expected_granules,
                "searchedGranuleCount": searched_granules,
                "granuleCount": len(granule_timestamps),
                "granuleTimestamps": [
                    _iso(value) for value in granule_timestamps
                ],
                "variableNames": list(variable_names),
                "cached": cached,
                "sampledGridLat": sampled_lat,
                "sampledGridLon": sampled_lon,
            },
        },
        "quality": quality,
    }


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")
