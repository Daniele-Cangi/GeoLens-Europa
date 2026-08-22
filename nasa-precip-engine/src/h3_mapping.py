"""
H3 hexagon to precipitation mapping

WORKFLOW:
1. Convert H3 indices to lat/lon centroids
2. Sample precipitation DataArray at each centroid (nearest-neighbor)
3. Return dict {h3_index: precip_mm}

H3 LIBRARY:
- h3.h3_to_geo(h3_index) → (lat, lon)
- Centroid represents the cell center
"""

import logging
from typing import Dict, List

import h3
import xarray as xr

from .imerg_client import get_precip_at_point

logger = logging.getLogger(__name__)


def sample_precip_for_h3(
    precip_data: xr.DataArray,
    h3_indices: List[str]
) -> Dict[str, float]:
    """
    Sample precipitation values for list of H3 cells

    Args:
        precip_data: Precipitation DataArray [lat, lon] in mm
        h3_indices: List of H3 cell indices (any resolution)

    Returns:
        Dict mapping {h3_index: precipitation_mm}

    Raises:
        ValueError: If h3_indices invalid
    """
    if not h3_indices:
        return {}

    logger.info(f"[H3] Sampling precipitation for {len(h3_indices)} cells")

    results: Dict[str, float] = {}

    for h3_index in h3_indices:
        try:
            # Convert H3 to lat/lon centroid
            try:
                lat, lon = h3.cell_to_latlng(h3_index)
            except AttributeError:
                # Fallback for H3 v3
                lat, lon = h3.h3_to_geo(h3_index)

            # Sample precipitation at centroid
            precip_mm = get_precip_at_point(precip_data, lat, lon)

            results[h3_index] = precip_mm

        except Exception as e:
            logger.warning(f"[H3] Failed to sample {h3_index}: {e}")
            results[h3_index] = 0.0  # Fallback to 0 if sampling fails

    logger.info(f"[H3] ✅ Sampled {len(results)} cells successfully")

    # Log statistics
    if results:
        values = list(results.values())
        avg_precip = sum(values) / len(values)
        max_precip = max(values)
        logger.info(f"  Precipitation range: [0.0, {max_precip:.1f}] mm")
        logger.info(f"  Average: {avg_precip:.1f} mm")

    return results


def validate_h3_indices(h3_indices: List[str]) -> List[str]:
    """
    Validate and filter H3 indices

    Args:
        h3_indices: List of H3 indices to validate

    Returns:
        List of valid H3 indices

    Raises:
        ValueError: If all indices invalid
    """
    valid_indices = []

    for idx in h3_indices:
        is_valid = False
        try:
            is_valid = h3.is_valid_cell(idx)
        except AttributeError:
            is_valid = h3.h3_is_valid(idx)
            
        if is_valid:
            valid_indices.append(idx)
        else:
            logger.warning(f"[H3] Invalid index: {idx}")

    if not valid_indices:
        raise ValueError("No valid H3 indices provided")

    if len(valid_indices) < len(h3_indices):
        logger.warning(
            f"[H3] Filtered {len(h3_indices) - len(valid_indices)} invalid indices"
        )

    return valid_indices
