"""Map H3 centroids to IMERG samples without synthetic fallback."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import h3
import xarray as xr

from .config import IMERG_RESOLUTION
from .imerg_client import (
    ImergSpatialBounds,
    PointSample,
    get_precip_at_point,
)


@dataclass(frozen=True)
class H3PrecipSample:
    h3_index: str
    centroid_lat: float
    centroid_lon: float
    sample: PointSample


def spatial_bounds_for_h3(
    h3_indices: Sequence[str],
) -> ImergSpatialBounds:
    """Bound H3 centroids and retain one half source-cell sampling margin."""

    if not h3_indices:
        raise ValueError("At least one H3 index is required")

    centroids = [_cell_to_latlng(index) for index in h3_indices]
    latitudes = [lat for lat, _ in centroids]
    longitudes = [lon for _, lon in centroids]
    if max(longitudes) - min(longitudes) > 180:
        raise ValueError(
            "H3 requests spanning the antimeridian are not supported"
        )
    margin = IMERG_RESOLUTION / 2
    return ImergSpatialBounds(
        west=max(-180.0, min(longitudes) - margin),
        south=max(-90.0, min(latitudes) - margin),
        east=min(180.0, max(longitudes) + margin),
        north=min(90.0, max(latitudes) + margin),
    )


def sample_precip_for_h3(
    precip_data: xr.DataArray,
    h3_indices: Sequence[str],
) -> dict[str, H3PrecipSample]:
    """Sample every validated H3 centroid and retain per-cell failure state."""

    results: dict[str, H3PrecipSample] = {}

    for h3_index in h3_indices:
        try:
            lat, lon = _cell_to_latlng(h3_index)
        except Exception as exc:
            results[h3_index] = H3PrecipSample(
                h3_index=h3_index,
                centroid_lat=float("nan"),
                centroid_lon=float("nan"),
                sample=PointSample(
                    value_mm=None,
                    status="invalid_response",
                    missing_reason=f"H3 centroid conversion failed: {exc}",
                    requested_lat=float("nan"),
                    requested_lon=float("nan"),
                    sampled_lat=None,
                    sampled_lon=None,
                ),
            )
            continue

        results[h3_index] = H3PrecipSample(
            h3_index=h3_index,
            centroid_lat=lat,
            centroid_lon=lon,
            sample=get_precip_at_point(precip_data, lat, lon),
        )

    return results


def validate_h3_indices(h3_indices: Sequence[str]) -> list[str]:
    """Reject any invalid or duplicate H3 input instead of filtering it."""

    if not h3_indices:
        raise ValueError("At least one H3 index is required")

    invalid = [
        index for index in h3_indices
        if not _is_valid_cell(index)
    ]

    if invalid:
        raise ValueError(
            f"Invalid H3 indices: {', '.join(invalid)}"
        )

    duplicates = sorted(
        {
            index
            for index in h3_indices
            if h3_indices.count(index) > 1
        }
    )

    if duplicates:
        raise ValueError(
            f"Duplicate H3 indices: {', '.join(duplicates)}"
        )

    return list(h3_indices)


def _cell_to_latlng(h3_index: str) -> tuple[float, float]:
    try:
        lat, lon = h3.cell_to_latlng(h3_index)
    except AttributeError:
        lat, lon = h3.h3_to_geo(h3_index)

    return float(lat), float(lon)


def _is_valid_cell(h3_index: str) -> bool:
    try:
        return bool(h3.is_valid_cell(h3_index))
    except AttributeError:
        return bool(h3.h3_is_valid(h3_index))
