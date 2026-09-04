"""Canonical NASA GPM IMERG acquisition for GeoLens.

The module never converts absence, sampling failure, incomplete coverage, NaN,
or upstream errors to zero. A numeric zero is returned only when the selected
IMERG grid cell contains a finite observed zero.
"""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Sequence

import earthaccess
import numpy as np
import xarray as xr

from .config import (
    EARTHDATA_PASSWORD,
    EARTHDATA_USERNAME,
    IMERG_DEFAULT_DATASET_VERSION,
    IMERG_EARTHACCESS_VERSION_BY_DATASET,
    IMERG_INTERVAL_MINUTES,
    IMERG_PRODUCT_EARLY,
    IMERG_PRODUCT_FINAL,
    IMERG_PRODUCT_LATE,
    IMERG_RESOLUTION,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
)

logger = logging.getLogger(__name__)

EvidenceStatus = Literal[
    "available",
    "missing",
    "stale",
    "out_of_coverage",
    "auth_required",
    "rate_limited",
    "upstream_error",
    "invalid_response",
    "incomplete_window",
]

ImergDatasetVersion = Literal["07"]

_auth_initialized = False


@dataclass(frozen=True)
class ImergSpatialBounds:
    """Requested geographic scope in EPSG:4326 longitude/latitude order."""

    west: float
    south: float
    east: float
    north: float

    def __post_init__(self) -> None:
        values = (self.west, self.south, self.east, self.north)
        if not all(np.isfinite(value) for value in values):
            raise ValueError("IMERG spatial bounds must be finite")
        if not -180 <= self.west < self.east <= 180:
            raise ValueError("IMERG west/east bounds are invalid")
        if not -90 <= self.south < self.north <= 90:
            raise ValueError("IMERG south/north bounds are invalid")

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (self.west, self.south, self.east, self.north)

    def expanded(self, margin: float) -> "ImergSpatialBounds":
        if margin < 0 or not np.isfinite(margin):
            raise ValueError("IMERG spatial margin must be non-negative")
        return ImergSpatialBounds(
            west=max(-180.0, self.west - margin),
            south=max(-90.0, self.south - margin),
            east=min(180.0, self.east + margin),
            north=min(90.0, self.north + margin),
        )


IMERG_EUROPE_BOUNDS = ImergSpatialBounds(
    west=LON_MIN,
    south=LAT_MIN,
    east=LON_MAX,
    north=LAT_MAX,
)


class ImergAcquisitionError(RuntimeError):
    """Base class for typed acquisition failures."""

    status: EvidenceStatus

    def __init__(
        self,
        message: str,
        *,
        product: str | None = None,
        run_type: str | None = None,
    ) -> None:
        super().__init__(message)
        self.product = product
        self.run_type = run_type


class ImergMissingError(ImergAcquisitionError):
    status: EvidenceStatus = "missing"


class ImergStaleError(ImergAcquisitionError):
    status: EvidenceStatus = "stale"


class ImergOutOfCoverageError(ImergAcquisitionError):
    status: EvidenceStatus = "out_of_coverage"


class ImergAuthRequiredError(ImergAcquisitionError):
    status: EvidenceStatus = "auth_required"


class ImergRateLimitedError(ImergAcquisitionError):
    status: EvidenceStatus = "rate_limited"


class ImergUpstreamError(ImergAcquisitionError):
    status: EvidenceStatus = "upstream_error"


class ImergInvalidResponseError(ImergAcquisitionError):
    status: EvidenceStatus = "invalid_response"


class ImergIncompleteWindowError(ImergAcquisitionError):
    status: EvidenceStatus = "incomplete_window"


_ACQUISITION_ERROR_TYPES: dict[
    EvidenceStatus,
    type[ImergAcquisitionError],
] = {
    "available": ImergInvalidResponseError,
    "missing": ImergMissingError,
    "stale": ImergStaleError,
    "out_of_coverage": ImergOutOfCoverageError,
    "auth_required": ImergAuthRequiredError,
    "rate_limited": ImergRateLimitedError,
    "upstream_error": ImergUpstreamError,
    "invalid_response": ImergInvalidResponseError,
    "incomplete_window": ImergIncompleteWindowError,
}


def _acquisition_error(
    status: EvidenceStatus,
    message: str,
    *,
    product: str | None = None,
    run_type: str | None = None,
) -> ImergAcquisitionError:
    return _ACQUISITION_ERROR_TYPES[status](
        message,
        product=product,
        run_type=run_type,
    )


@dataclass(frozen=True)
class ImergGranuleDiscovery:
    product: str
    run_type: Literal["final", "late", "early"]
    dataset_version: ImergDatasetVersion
    archive_version: str
    requested_window_start: datetime
    requested_window_end: datetime
    expected_granule_count: int
    searched_granule_count: int
    granule_timestamps: tuple[datetime, ...]
    timestamped_results: tuple[tuple[datetime, object], ...]


@dataclass(frozen=True)
class ImergWindowMetadata:
    product: str
    run_type: Literal["final", "late", "early"]
    dataset_version: str
    archive_version: str
    requested_window_start: datetime
    requested_window_end: datetime
    actual_window_start: datetime | None
    actual_window_end: datetime | None
    expected_granule_count: int
    searched_granule_count: int
    granule_count: int
    granule_timestamps: tuple[datetime, ...]
    variable_names: tuple[str, ...]
    acquired_at: datetime
    source_resolution: str
    sampling_method: str
    requested_spatial_bounds: ImergSpatialBounds
    loaded_spatial_bounds: ImergSpatialBounds
    grid_shape: tuple[int, int]
    status: EvidenceStatus
    missing_reason: str | None


@dataclass(frozen=True)
class ImergWindow:
    data: xr.DataArray
    metadata: ImergWindowMetadata


@dataclass(frozen=True)
class ImergSeries:
    """One complete native half-hour amount grid per source timestamp."""

    data: xr.DataArray
    metadata: ImergWindowMetadata


@dataclass(frozen=True)
class PointSample:
    value_mm: float | None
    status: EvidenceStatus
    missing_reason: str | None
    requested_lat: float
    requested_lon: float
    sampled_lat: float | None
    sampled_lon: float | None


def normalize_reference_time(value: datetime) -> datetime:
    """Normalize a reference timestamp to an IMERG half-hour boundary."""

    if value.tzinfo is None:
        normalized = value.replace(tzinfo=timezone.utc)
    else:
        normalized = value.astimezone(timezone.utc)

    minute = (
        normalized.minute // IMERG_INTERVAL_MINUTES
    ) * IMERG_INTERVAL_MINUTES
    return normalized.replace(minute=minute, second=0, microsecond=0)


def authenticate() -> None:
    """Authenticate once, reporting missing credentials as auth_required."""

    global _auth_initialized

    if _auth_initialized:
        return

    if not EARTHDATA_USERNAME or not EARTHDATA_PASSWORD:
        raise ImergAuthRequiredError(
            "NASA Earthdata credentials are not configured",
        )

    try:
        earthaccess.login(strategy="environment", persist=False)
    except Exception as exc:
        raise _acquisition_error(
            _status_for_exception(exc, authentication=True),
            f"NASA Earthdata authentication failed: {exc}",
        ) from exc

    _auth_initialized = True
    logger.info("[IMERG] NASA Earthdata authentication succeeded")


def archive_version_for(dataset_version: str) -> str:
    """Resolve one evidence version to its explicit Earthaccess collection."""

    try:
        return IMERG_EARTHACCESS_VERSION_BY_DATASET[dataset_version]
    except KeyError:
        supported = ", ".join(IMERG_EARTHACCESS_VERSION_BY_DATASET)
        raise ValueError(
            f"Unsupported IMERG dataset version {dataset_version!r}; "
            f"expected one of {supported}"
        ) from None


def discover_imerg_granules(
    t_ref: datetime,
    hours: int,
    *,
    dataset_version: ImergDatasetVersion = IMERG_DEFAULT_DATASET_VERSION,
    allow_early: bool = True,
    spatial_bounds: ImergSpatialBounds = IMERG_EUROPE_BOUNDS,
) -> ImergGranuleDiscovery:
    """Discover one version-pinned, single-product IMERG window."""

    if hours <= 0:
        raise ValueError("hours must be positive")

    archive_version = archive_version_for(dataset_version)
    end = normalize_reference_time(t_ref)
    start = end - timedelta(hours=hours)
    expected_count = hours * 60 // IMERG_INTERVAL_MINUTES

    authenticate()

    candidate_sets: list[
        tuple[
            str,
            Literal["final", "late", "early"],
            list[tuple[datetime, object]],
        ]
    ] = []

    final_results = _search_product(
        IMERG_PRODUCT_FINAL,
        start,
        end,
        archive_version=archive_version,
        spatial_bounds=spatial_bounds,
    )
    candidate_sets.append(
        (
            IMERG_PRODUCT_FINAL,
            "final",
            _deduplicate_results(
                _results_in_window(final_results, start, end)
            ),
        )
    )

    if len(candidate_sets[0][2]) < expected_count:
        late_results = _search_product(
            IMERG_PRODUCT_LATE,
            start,
            end,
            archive_version=archive_version,
            spatial_bounds=spatial_bounds,
        )
        candidate_sets.append(
            (
                IMERG_PRODUCT_LATE,
                "late",
                _deduplicate_results(
                    _results_in_window(late_results, start, end)
                ),
            )
        )

    if (
        allow_early
        and max(len(candidate[2]) for candidate in candidate_sets)
        < expected_count
    ):
        early_results = _search_product(
            IMERG_PRODUCT_EARLY,
            start,
            end,
            archive_version=archive_version,
            spatial_bounds=spatial_bounds,
        )
        candidate_sets.append(
            (
                IMERG_PRODUCT_EARLY,
                "early",
                _deduplicate_results(
                    _results_in_window(early_results, start, end)
                ),
            )
        )

    product, run_type, timestamped_results = max(
        candidate_sets,
        key=lambda candidate: len(candidate[2]),
    )

    if not timestamped_results:
        raise ImergMissingError(
            (
                f"No IMERG {dataset_version} granules overlap requested "
                f"window {start.isoformat()} to {end.isoformat()}"
            ),
            product=product,
            run_type=run_type,
        )

    searched_count = len(timestamped_results)
    deduplicated = tuple(_deduplicate_results(timestamped_results))

    return ImergGranuleDiscovery(
        product=product,
        run_type=run_type,
        dataset_version=dataset_version,
        archive_version=archive_version,
        requested_window_start=start,
        requested_window_end=end,
        expected_granule_count=expected_count,
        searched_granule_count=searched_count,
        granule_timestamps=tuple(
            timestamp for timestamp, _ in deduplicated
        ),
        timestamped_results=deduplicated,
    )


def load_imerg_window(
    t_ref: datetime,
    hours: int,
    *,
    dataset_version: ImergDatasetVersion = IMERG_DEFAULT_DATASET_VERSION,
    allow_early: bool = True,
    spatial_bounds: ImergSpatialBounds = IMERG_EUROPE_BOUNDS,
) -> ImergWindow:
    """Acquire one complete, version-pinned IMERG accumulation window."""

    series = load_imerg_series(
        t_ref,
        hours,
        dataset_version=dataset_version,
        allow_early=allow_early,
        spatial_bounds=spatial_bounds,
    )
    amounts = [
        series.data.isel(time=index, drop=True)
        for index in range(series.data.sizes["time"])
    ]
    return ImergWindow(
        data=accumulate_amounts(amounts),
        metadata=series.metadata,
    )


def load_imerg_series(
    t_ref: datetime,
    hours: int,
    *,
    dataset_version: ImergDatasetVersion = IMERG_DEFAULT_DATASET_VERSION,
    allow_early: bool = True,
    spatial_bounds: ImergSpatialBounds = IMERG_EUROPE_BOUNDS,
    granule_cache_directory: Path | None = None,
) -> ImergSeries:
    """Acquire native half-hour amounts without collapsing the time axis."""

    discovery = discover_imerg_granules(
        t_ref,
        hours,
        dataset_version=dataset_version,
        allow_early=allow_early,
        spatial_bounds=spatial_bounds,
    )
    start = discovery.requested_window_start
    end = discovery.requested_window_end
    interval = timedelta(minutes=IMERG_INTERVAL_MINUTES)
    expected_timestamps = tuple(
        start + index * interval
        for index in range(discovery.expected_granule_count)
    )
    expected_count = discovery.expected_granule_count
    product = discovery.product
    run_type = discovery.run_type
    searched_count = discovery.searched_granule_count
    timestamped_results = list(discovery.timestamped_results)
    amounts_by_timestamp: dict[datetime, xr.DataArray] = {}
    variables_by_timestamp: dict[datetime, str] = {}
    pending: list[tuple[datetime, object, Path | None]] = []

    for timestamp, result in timestamped_results:
        cache_path = _granule_amount_cache_path(
            granule_cache_directory,
            discovery,
            timestamp,
            spatial_bounds,
        )
        cached = _read_granule_amount_cache(cache_path)
        if cached is None:
            pending.append((timestamp, result, cache_path))
        else:
            amount, variable_name = cached
            amounts_by_timestamp[timestamp] = amount
            variables_by_timestamp[timestamp] = variable_name

    files: list[object] = []
    if pending:
        try:
            files = list(earthaccess.open([result for _, result, _ in pending]))
        except Exception as exc:
            raise _acquisition_error(
                _status_for_exception(exc),
                f"Failed to open IMERG granules: {exc}",
                product=product,
                run_type=run_type,
            ) from exc

    if pending and not files and not amounts_by_timestamp:
        raise ImergUpstreamError(
            "NASA returned granules but none could be opened",
            product=product,
            run_type=run_type,
        )

    for (timestamp, _, cache_path), file_object in zip(pending, files):
        dataset: xr.Dataset | None = None

        try:
            dataset = xr.open_dataset(
                file_object,
                group="Grid",
                engine="h5netcdf",
            )
            amount, variable_name = precipitation_amount(
                dataset,
                spatial_bounds=spatial_bounds,
            )
            loaded_amount = amount.load().transpose("lon", "lat")
            amounts_by_timestamp[timestamp] = loaded_amount
            variables_by_timestamp[timestamp] = variable_name
            _write_granule_amount_cache(
                cache_path,
                loaded_amount,
                variable_name,
            )
        except Exception as exc:
            logger.warning(
                "[IMERG] Granule %s was unusable: %s",
                timestamp.isoformat(),
                exc,
            )
        finally:
            if dataset is not None:
                dataset.close()
            close_file = getattr(file_object, "close", None)
            if callable(close_file):
                try:
                    close_file()
                except Exception as exc:
                    logger.warning(
                        "[IMERG] Granule handle %s did not close cleanly: %s",
                        timestamp.isoformat(),
                        exc,
                    )

    if not amounts_by_timestamp:
        raise ImergInvalidResponseError(
            "No opened IMERG granule contained usable precipitation data",
            product=product,
            run_type=run_type,
        )

    actual_timestamps = tuple(sorted(amounts_by_timestamp))
    amounts = [amounts_by_timestamp[timestamp] for timestamp in actual_timestamps]
    variable_names = [variables_by_timestamp[timestamp] for timestamp in actual_timestamps]
    aligned = xr.align(*amounts, join="exact")
    time_coordinates = np.asarray(
        [
            np.datetime64(
                timestamp.astimezone(timezone.utc).replace(tzinfo=None),
                "ns",
            )
            for timestamp in actual_timestamps
        ]
    )
    series = xr.concat(
        [amount.transpose("lon", "lat") for amount in aligned],
        dim=xr.IndexVariable("time", time_coordinates),
    ).transpose("time", "lon", "lat")
    series.attrs = {
        "units": "mm",
        "temporal_resolution": f"{IMERG_INTERVAL_MINUTES} minute",
        "transformation": (
            "one non-negative half-hour precipitation amount per source granule"
        ),
    }
    expected_set = set(expected_timestamps)
    actual_set = set(actual_timestamps)
    is_complete = actual_set == expected_set
    actual_start = min(actual_timestamps)
    actual_end = max(actual_timestamps) + interval
    status: EvidenceStatus = (
        "available" if is_complete else "incomplete_window"
    )
    missing_reason = None

    if not is_complete:
        missing = sorted(expected_set - actual_set)
        missing_reason = (
            f"IMERG window has {len(actual_set)} of {expected_count} expected "
            f"granules; missing timestamps: "
            f"{', '.join(value.isoformat() for value in missing[:8])}"
        )
        if len(missing) > 8:
            missing_reason += f" (+{len(missing) - 8} more)"

    metadata = ImergWindowMetadata(
        product=product,
        run_type=run_type,
        dataset_version=discovery.dataset_version,
        archive_version=discovery.archive_version,
        requested_window_start=start,
        requested_window_end=end,
        actual_window_start=actual_start,
        actual_window_end=actual_end,
        expected_granule_count=expected_count,
        searched_granule_count=searched_count,
        granule_count=len(actual_timestamps),
        granule_timestamps=actual_timestamps,
        variable_names=tuple(sorted(set(variable_names))),
        acquired_at=datetime.now(timezone.utc),
        source_resolution="0.1 degree",
        sampling_method="nearest IMERG grid cell at H3 centroid",
        requested_spatial_bounds=spatial_bounds,
        loaded_spatial_bounds=spatial_bounds_from_data(
            series.isel(time=0, drop=True)
        ),
        grid_shape=(
            series.sizes["lat"],
            series.sizes["lon"],
        ),
        status=status,
        missing_reason=missing_reason,
    )

    return ImergSeries(data=series, metadata=metadata)


def _granule_amount_cache_path(
    directory: Path | None,
    discovery: ImergGranuleDiscovery,
    timestamp: datetime,
    spatial_bounds: ImergSpatialBounds,
) -> Path | None:
    if directory is None:
        return None
    scope = hashlib.sha256(
        repr(tuple(round(value, 8) for value in spatial_bounds.as_tuple())).encode(
            "ascii"
        )
    ).hexdigest()[:12]
    stamp = timestamp.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return Path(directory) / (
        f"{discovery.product}_v{discovery.dataset_version}_{stamp}_{scope}.nc"
    )


def _read_granule_amount_cache(
    path: Path | None,
) -> tuple[xr.DataArray, str] | None:
    if path is None or not path.is_file():
        return None
    opened: xr.DataArray | None = None
    try:
        opened = xr.open_dataarray(path, engine="h5netcdf")
        amount = opened.load().transpose("lon", "lat")
        variable_name = str(amount.attrs.get("source_variable", ""))
        values = np.asarray(amount.values)
        if (
            tuple(amount.dims) != ("lon", "lat")
            or not variable_name
            or np.any(np.isfinite(values) & (values < 0))
        ):
            raise ValueError("cached IMERG granule amount is invalid")
        return amount, variable_name
    except Exception as exc:
        raise ImergInvalidResponseError(
            f"Cached IMERG granule amount is unusable: {path.name}: {exc}"
        ) from exc
    finally:
        if opened is not None:
            opened.close()


def _write_granule_amount_cache(
    path: Path | None,
    amount: xr.DataArray,
    variable_name: str,
) -> None:
    if path is None or path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
    prepared = amount.transpose("lon", "lat").copy()
    prepared.attrs = {
        **prepared.attrs,
        "source_variable": variable_name,
        "cache_semantic": "native_half_hour_amount_staging_not_final_evidence",
    }
    try:
        prepared.to_netcdf(temporary, engine="h5netcdf")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def precipitation_amount(
    dataset: xr.Dataset,
    *,
    spatial_bounds: ImergSpatialBounds = IMERG_EUROPE_BOUNDS,
) -> tuple[xr.DataArray, str]:
    """Extract one non-negative half-hour precipitation amount."""

    variable_name = _precipitation_variable(dataset)
    rate = dataset[variable_name].squeeze(drop=True)

    if "lat" not in rate.dims or "lon" not in rate.dims:
        raise ValueError(
            f"IMERG variable {variable_name} lacks lat/lon dimensions"
        )

    subset = _subset_spatial(rate, spatial_bounds)

    if subset.sizes.get("lat", 0) == 0 or subset.sizes.get("lon", 0) == 0:
        raise ValueError("IMERG granule has no data inside configured bounds")

    if subset.ndim != 2:
        raise ValueError(
            f"IMERG precipitation must be 2D after squeeze, got {subset.dims}"
        )

    valid_rate = subset.where(subset >= 0)
    amount = valid_rate * (IMERG_INTERVAL_MINUTES / 60)
    amount.attrs = {
        "units": "mm",
        "source_variable": variable_name,
        "transformation": (
            f"non-negative mm/hr multiplied by "
            f"{IMERG_INTERVAL_MINUTES / 60:g} hour"
        ),
    }
    return amount, variable_name


def accumulate_precip(
    datasets: Sequence[xr.Dataset],
    *,
    spatial_bounds: ImergSpatialBounds = IMERG_EUROPE_BOUNDS,
) -> tuple[xr.DataArray, tuple[str, ...]]:
    """Deterministic helper used by acquisition and fixture tests."""

    if not datasets:
        raise ValueError("No datasets provided for accumulation")

    amounts: list[xr.DataArray] = []
    variables: list[str] = []

    for dataset in datasets:
        amount, variable_name = precipitation_amount(
            dataset,
            spatial_bounds=spatial_bounds,
        )
        amounts.append(amount)
        variables.append(variable_name)

    return accumulate_amounts(amounts), tuple(variables)


def accumulate_amounts(
    amounts: Sequence[xr.DataArray],
) -> xr.DataArray:
    """Sum amounts while preserving any missing source pixel as NaN."""

    if not amounts:
        raise ValueError("No precipitation amounts provided")

    aligned = xr.align(*amounts, join="exact")
    stack = xr.concat(aligned, dim="granule")
    total = stack.sum(dim="granule", skipna=False)

    if total.ndim != 2 or "lat" not in total.dims or "lon" not in total.dims:
        raise ValueError(
            f"Accumulated IMERG data must be [lat, lon], got {total.dims}"
        )

    total.attrs = {
        "units": "mm",
        "transformation": (
            "sum of half-hour precipitation amounts with skipna=False"
        ),
    }
    return total


def get_precip_at_point(
    precip_data: xr.DataArray,
    lat: float,
    lon: float,
) -> PointSample:
    """Sample a point without converting missing or invalid data to zero."""

    if not np.isfinite(lat) or not np.isfinite(lon):
        return PointSample(
            value_mm=None,
            status="invalid_response",
            missing_reason="Requested latitude/longitude is not finite",
            requested_lat=lat,
            requested_lon=lon,
            sampled_lat=None,
            sampled_lon=None,
        )

    if "lat" not in precip_data.coords or "lon" not in precip_data.coords:
        return PointSample(
            value_mm=None,
            status="invalid_response",
            missing_reason="IMERG array lacks lat/lon coordinates",
            requested_lat=lat,
            requested_lon=lon,
            sampled_lat=None,
            sampled_lon=None,
        )

    lat_values = np.asarray(precip_data.coords["lat"].values)
    lon_values = np.asarray(precip_data.coords["lon"].values)

    if (
        lat < float(np.nanmin(lat_values))
        or lat > float(np.nanmax(lat_values))
        or lon < float(np.nanmin(lon_values))
        or lon > float(np.nanmax(lon_values))
    ):
        return PointSample(
            value_mm=None,
            status="out_of_coverage",
            missing_reason="H3 centroid lies outside the acquired IMERG cube",
            requested_lat=lat,
            requested_lon=lon,
            sampled_lat=None,
            sampled_lon=None,
        )

    try:
        selected = precip_data.sel(lat=lat, lon=lon, method="nearest")
        raw_value = np.asarray(selected.values).squeeze()

        if raw_value.size != 1:
            raise ValueError(
                f"Point selection returned {raw_value.size} values"
            )

        value = float(raw_value)
        sampled_lat = float(selected.coords["lat"].values)
        sampled_lon = float(selected.coords["lon"].values)
    except Exception as exc:
        return PointSample(
            value_mm=None,
            status="invalid_response",
            missing_reason=f"IMERG point sampling failed: {exc}",
            requested_lat=lat,
            requested_lon=lon,
            sampled_lat=None,
            sampled_lon=None,
        )

    if np.isnan(value):
        return PointSample(
            value_mm=None,
            status="missing",
            missing_reason="Selected IMERG grid cell is missing",
            requested_lat=lat,
            requested_lon=lon,
            sampled_lat=sampled_lat,
            sampled_lon=sampled_lon,
        )

    if not np.isfinite(value) or value < 0:
        return PointSample(
            value_mm=None,
            status="invalid_response",
            missing_reason=(
                "Selected IMERG grid cell contains a non-finite or "
                "negative value"
            ),
            requested_lat=lat,
            requested_lon=lon,
            sampled_lat=sampled_lat,
            sampled_lon=sampled_lon,
        )

    return PointSample(
        value_mm=value,
        status="available",
        missing_reason=None,
        requested_lat=lat,
        requested_lon=lon,
        sampled_lat=sampled_lat,
        sampled_lon=sampled_lon,
    )


def _search_product(
    product: str,
    start: datetime,
    end: datetime,
    *,
    archive_version: str,
    spatial_bounds: ImergSpatialBounds,
) -> list[object]:
    try:
        return list(
            earthaccess.search_data(
                short_name=product,
                version=archive_version,
                temporal=(start.isoformat(), end.isoformat()),
                bounding_box=spatial_bounds.as_tuple(),
            )
        )
    except Exception as exc:
        raise _acquisition_error(
            _status_for_exception(exc),
            (
                f"IMERG search failed for {product} "
                f"archive version {archive_version}: {exc}"
            ),
            product=product,
        ) from exc


def _results_in_window(
    results: Sequence[object],
    start: datetime,
    end: datetime,
) -> list[tuple[datetime, object]]:
    timestamped: list[tuple[datetime, object]] = []
    unknown_count = 0

    for result in results:
        timestamp = _granule_timestamp(result)

        if timestamp is None:
            unknown_count += 1
            continue

        if start <= timestamp < end:
            timestamped.append((timestamp, result))

    if results and not timestamped and unknown_count:
        raise ImergInvalidResponseError(
            (
                "IMERG search results did not expose parseable granule "
                "timestamps"
            ),
        )

    return sorted(timestamped, key=lambda item: item[0])


def _deduplicate_results(
    results: Sequence[tuple[datetime, object]],
) -> list[tuple[datetime, object]]:
    by_timestamp: dict[datetime, object] = {}

    for timestamp, result in results:
        by_timestamp.setdefault(timestamp, result)

    return sorted(by_timestamp.items(), key=lambda item: item[0])


def _granule_timestamp(result: object) -> datetime | None:
    metadata = getattr(result, "umm", None)

    if metadata is None and isinstance(result, dict):
        metadata = result.get("umm", result)

    try:
        value = metadata["TemporalExtent"]["RangeDateTime"][
            "BeginningDateTime"
        ]
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc)
    except (KeyError, TypeError, ValueError, AttributeError):
        pass

    match = re.search(
        r"(?P<date>\d{8})-S(?P<time>\d{6})",
        str(result),
    )

    if match is None:
        return None

    parsed = datetime.strptime(
        match.group("date") + match.group("time"),
        "%Y%m%d%H%M%S",
    )
    return parsed.replace(tzinfo=timezone.utc)


def _precipitation_variable(dataset: xr.Dataset) -> str:
    if "precipitationCal" in dataset:
        return "precipitationCal"

    if "precipitation" in dataset:
        return "precipitation"

    raise ValueError(
        "IMERG granule lacks precipitationCal and precipitation variables"
    )


def _subset_spatial(
    rate: xr.DataArray,
    spatial_bounds: ImergSpatialBounds,
) -> xr.DataArray:
    # Include one source-cell margin so nearest-neighbour sampling remains
    # valid for H3 centroids along the requested AOI boundary.
    loaded_bounds = spatial_bounds.expanded(IMERG_RESOLUTION)
    lat_values = np.asarray(rate.coords["lat"].values)
    lon_values = np.asarray(rate.coords["lon"].values)
    lat_slice = (
        slice(loaded_bounds.south, loaded_bounds.north)
        if lat_values[0] <= lat_values[-1]
        else slice(loaded_bounds.north, loaded_bounds.south)
    )
    lon_slice = (
        slice(loaded_bounds.west, loaded_bounds.east)
        if lon_values[0] <= lon_values[-1]
        else slice(loaded_bounds.east, loaded_bounds.west)
    )
    return rate.sel(lat=lat_slice, lon=lon_slice)


def spatial_bounds_from_data(data: xr.DataArray) -> ImergSpatialBounds:
    lat_values = np.asarray(data.coords["lat"].values, dtype=float)
    lon_values = np.asarray(data.coords["lon"].values, dtype=float)
    if lat_values.size == 0 or lon_values.size == 0:
        raise ValueError("IMERG accumulation has an empty spatial grid")

    west = float(np.min(lon_values))
    east = float(np.max(lon_values))
    south = float(np.min(lat_values))
    north = float(np.max(lat_values))
    # Coordinates identify source-cell centers. Provenance reports the full
    # loaded pixel footprint for both singleton and multi-cell grids.
    half_cell = IMERG_RESOLUTION / 2
    return ImergSpatialBounds(
        west=max(-180.0, west - half_cell),
        south=max(-90.0, south - half_cell),
        east=min(180.0, east + half_cell),
        north=min(90.0, north + half_cell),
    )


def _status_for_exception(
    exc: Exception,
    *,
    authentication: bool = False,
) -> EvidenceStatus:
    message = str(exc).lower()

    if authentication or any(
        token in message
        for token in ("unauthorized", "forbidden", "credential", "401", "403")
    ):
        return "auth_required"

    if any(token in message for token in ("rate limit", "too many", "429")):
        return "rate_limited"

    return "upstream_error"


def reset_authentication_for_tests() -> None:
    """Reset module state for deterministic tests only."""

    global _auth_initialized
    _auth_initialized = False
