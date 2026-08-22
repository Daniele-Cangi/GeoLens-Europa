"""
NASA GPM IMERG data client using earthaccess + xarray

WORKFLOW:
1. Authenticate with NASA Earthdata
2. Search for IMERG granules in time window
3. Open granules via OPeNDAP (streaming access)
4. Subset to Europe bbox
5. Accumulate precipitation over time window
6. Return DataArray [lat, lon] in mm

IMERG PRODUCT:
- GPM_3IMERGHH (Late Run): 4-18h latency, calibrated
- GPM_3IMERGHHE (Early Run): 4-6h latency, uncalibrated
- Resolution: 0.1° (~10km)
- Temporal: 30-minute intervals
- Variable: "precipitationCal" (mm/hr)

ACCUMULATION:
- 24h = 48 granules (30min each)
- 72h = 144 granules
- Total precipitation = sum(precip_rate * 0.5h)
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple

import earthaccess
import xarray as xr
import numpy as np

from .config import (
    EARTHDATA_USERNAME,
    EARTHDATA_PASSWORD,
    IMERG_PRODUCT_LATE,
    IMERG_PRODUCT_EARLY,
    LAT_MIN,
    LAT_MAX,
    LON_MIN,
    LON_MAX,
)

logger = logging.getLogger(__name__)

# Global authentication state
_auth_initialized = False


def authenticate() -> None:
    """
    Authenticate with NASA Earthdata

    Uses credentials from environment variables.
    Only authenticates once per process lifetime.
    """
    global _auth_initialized

    if _auth_initialized:
        return

    try:
        earthaccess.login(
            strategy="environment",
            persist=False
        )
        _auth_initialized = True
        logger.info("[IMERG] ✅ NASA Earthdata authentication successful")

    except Exception as e:
        logger.error(f"[IMERG] ❌ Authentication failed: {e}")
        raise


def load_imerg_cube(
    t_ref: datetime,
    hours: int,
    use_early: bool = False
) -> Tuple[xr.DataArray, str]:
    """
    Load and accumulate IMERG precipitation for time window

    Args:
        t_ref: Reference timestamp (end of accumulation window)
        hours: Accumulation window (24 or 72)
        use_early: Use Early Run if Late Run unavailable

    Returns:
        Tuple (DataArray, source_name)
        - DataArray: Precipitation in mm, dims [lat, lon]
        - source_name: "IMERG-Late" or "IMERG-Early"

    Raises:
        ValueError: If no data available for time window
        RuntimeError: If data loading fails
    """
    authenticate()

    # Calculate time window
    t_start = t_ref - timedelta(hours=hours)

    logger.info(f"[IMERG] Loading precipitation data:")
    logger.info(f"  Time window: {t_start} → {t_ref} ({hours}h)")
    logger.info(f"  Bbox: lat[{LAT_MIN}, {LAT_MAX}], lon[{LON_MIN}, {LON_MAX}]")

    # Try Late Run first, fallback to Early Run
    product = IMERG_PRODUCT_LATE
    source_name = "IMERG-Late"

    try:
        # Search for granules
        results = earthaccess.search_data(
            short_name=product,
            temporal=(t_start.isoformat(), t_ref.isoformat()),
            bounding_box=(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX)
        )

        if len(results) == 0:
            if use_early:
                logger.warning(f"[IMERG] No Late Run data, trying Early Run...")
                product = IMERG_PRODUCT_EARLY
                source_name = "IMERG-Early"

                results = earthaccess.search_data(
                    short_name=product,
                    temporal=(t_start.isoformat(), t_ref.isoformat()),
                    bounding_box=(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX)
                )

            if len(results) == 0:
                raise ValueError(
                    f"No IMERG data available for time window {t_start} → {t_ref}"
                )

        logger.info(f"[IMERG] Found {len(results)} granules ({source_name})")

        # Open granules via OPeNDAP
        # earthaccess.open() returns file-like objects
        files = earthaccess.open(results)

        if not files:
            raise RuntimeError("Failed to open IMERG granules")

        logger.info(f"[IMERG] Opened {len(files)} file objects")

        # Convert file objects to xarray Datasets
        datasets = []
        for f in files:
            try:
                # GPM IMERG V07 data is in the 'Grid' group
                ds = xr.open_dataset(f, group='Grid', engine='h5netcdf')
                datasets.append(ds)
            except Exception as e:
                logger.warning(f"[IMERG] Failed to open file as xarray: {e}")

        if not datasets:
            raise RuntimeError("Failed to open any granules as xarray Datasets")

        # Accumulate precipitation
        precip_accumulated = accumulate_precip(datasets, hours)

        logger.info(f"[IMERG] ✅ Accumulated {hours}h precipitation successfully")
        logger.info(f"  Shape: {precip_accumulated.shape}")
        logger.info(f"  Range: [{float(precip_accumulated.min()):.2f}, {float(precip_accumulated.max()):.2f}] mm")

        return precip_accumulated, source_name

    except Exception as e:
        logger.error(f"[IMERG] ❌ Data loading failed: {e}")
        raise RuntimeError(f"Failed to load IMERG data: {e}")


def accumulate_precip(datasets: list, hours: int) -> xr.DataArray:
    """
    Accumulate precipitation from multiple IMERG granules

    IMERG provides precipitation rate (mm/hr) in 30-minute intervals.
    Total precipitation = sum(rate * 0.5h) over all granules.

    Args:
        datasets: List of xr.Dataset from IMERG granules
        hours: Expected accumulation window (for validation)

    Returns:
        DataArray with accumulated precipitation [mm], dims [lat, lon]

    Raises:
        ValueError: If datasets invalid or missing required variable
    """
    if not datasets:
        raise ValueError("No datasets provided for accumulation")

    precip_arrays = []

    for i, ds in enumerate(datasets):
        try:
            # IMERG variable name: "precipitationCal" (calibrated precipitation rate, mm/hr)
            if "precipitationCal" not in ds:
                # Fallback to uncalibrated if calibrated not available
                if "precipitation" in ds:
                    precip_rate = ds["precipitation"]
                    logger.warning(f"[IMERG] Granule {i}: Using uncalibrated precipitation")
                else:
                    logger.error(f"[IMERG] Granule {i}: No precipitation variable found")
                    continue
            else:
                precip_rate = ds["precipitationCal"]

            # Subset to Europe bbox (if not already subset by earthaccess)
            precip_rate_subset = precip_rate.sel(
                lat=slice(LAT_MIN, LAT_MAX),
                lon=slice(LON_MIN, LON_MAX)
            )

            # Convert rate (mm/hr) to amount (mm) for 30-minute interval
            # Amount = rate * 0.5h
            precip_amount = precip_rate_subset * 0.5

            precip_arrays.append(precip_amount)

        except Exception as e:
            logger.warning(f"[IMERG] Skipping granule {i} due to error: {e}")
            continue

    if not precip_arrays:
        raise ValueError("No valid precipitation data extracted from granules")

    # Stack along time dimension and sum
    try:
        # Concatenate along time (if time dim exists), otherwise just sum
        precip_stack = xr.concat(precip_arrays, dim='time')
        precip_total = precip_stack.sum(dim='time')

    except Exception as e:
        # Fallback: simple sum if concat fails
        logger.warning(f"[IMERG] Concat failed, using simple sum: {e}")
        precip_total = sum(precip_arrays)

    # Replace NaNs with 0 (missing data over land/sea)
    precip_total = precip_total.fillna(0.0)

    # Ensure 2D array [lat, lon]
    if precip_total.ndim != 2:
        logger.warning(f"[IMERG] Unexpected dims: {precip_total.dims}, squeezing extra dims")
        precip_total = precip_total.squeeze()

    return precip_total


def get_precip_at_point(
    precip_data: xr.DataArray,
    lat: float,
    lon: float
) -> float:
    """
    Sample precipitation at a single point using nearest-neighbor

    Args:
        precip_data: Precipitation DataArray [lat, lon]
        lat: Latitude
        lon: Longitude

    Returns:
        Precipitation in mm, or 0.0 if out of bounds
    """
    try:
        # Use xarray's nearest-neighbor selection
        value = precip_data.sel(lat=lat, lon=lon, method='nearest').values

        # Handle scalar vs array return
        if isinstance(value, np.ndarray):
            value = float(value.item())
        else:
            value = float(value)

        # Ensure non-negative
        return max(0.0, value)

    except (KeyError, IndexError, ValueError) as e:
        logger.warning(f"[IMERG] Point sampling failed at ({lat}, {lon}): {e}")
        return 0.0
