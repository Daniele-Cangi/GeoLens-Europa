"""Opt-in real NASA IMERG verification.

Run only with GEOLENS_RUN_LIVE_PROVIDER_TESTS=1 and valid Earthdata
credentials. The normal deterministic suite reports this test as skipped.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import numpy as np

from src.cache import clear_cache, get_cached_window, set_cached_window
from src.imerg_client import (
    ImergSpatialBounds,
    discover_imerg_granules,
    get_precip_at_point,
    load_imerg_window,
    normalize_reference_time,
)


@unittest.skipUnless(
    os.getenv("GEOLENS_RUN_LIVE_PROVIDER_TESTS") == "1",
    "live provider verification is opt-in",
)
class LiveImergTests(unittest.TestCase):
    def test_complete_real_window_retains_source_metadata(self) -> None:
        configured = os.getenv("GEOLENS_IMERG_REFERENCE_TIME")
        reference_time = (
            datetime.fromisoformat(configured.replace("Z", "+00:00"))
            if configured
            else datetime.now(timezone.utc) - timedelta(hours=8)
        )
        window = load_imerg_window(
            normalize_reference_time(reference_time),
            24,
            dataset_version="07",
            spatial_bounds=ImergSpatialBounds(
                12.50,
                55.62,
                12.64,
                55.73,
            ),
        )
        metadata = window.metadata

        self.assertEqual(metadata.status, "available")
        self.assertEqual(metadata.dataset_version, "07")
        self.assertEqual(metadata.archive_version, "07")
        self.assertEqual(metadata.expected_granule_count, 48)
        self.assertEqual(metadata.granule_count, 48)
        self.assertEqual(len(metadata.granule_timestamps), 48)
        self.assertEqual(metadata.source_resolution, "0.1 degree")
        self.assertIn(metadata.run_type, ("final", "late", "early"))
        self.assertLess(
            metadata.requested_window_start,
            metadata.requested_window_end,
        )

        sample = get_precip_at_point(
            window.data,
            lat=55.6761,
            lon=12.5683,
        )
        self.assertEqual(sample.status, "available")
        self.assertIsNotNone(sample.value_mm)
        self.assertGreaterEqual(sample.value_mm, 0)

@unittest.skipUnless(
    os.getenv("GEOLENS_RUN_HISTORICAL_IMERG_ACQUISITION") == "1",
    "historical IMERG acquisition verification is opt-in",
)
class HistoricalImergAcquisitionTests(unittest.TestCase):
    def test_may_2023_forli_window_is_bounded_real_evidence(self) -> None:
        reference_time = datetime(
            2023,
            5,
            18,
            0,
            0,
            tzinfo=timezone.utc,
        )
        bounds = ImergSpatialBounds(11.98, 44.17, 12.10, 44.28)
        window = load_imerg_window(
            reference_time,
            48,
            dataset_version="07",
            spatial_bounds=bounds,
        )
        metadata = window.metadata

        self.assertEqual(metadata.status, "available")
        self.assertEqual(metadata.product, "GPM_3IMERGHH")
        self.assertEqual(metadata.run_type, "final")
        self.assertEqual(metadata.dataset_version, "07")
        self.assertEqual(metadata.expected_granule_count, 96)
        self.assertEqual(metadata.granule_count, 96)
        self.assertEqual(metadata.requested_spatial_bounds, bounds)
        self.assertLessEqual(metadata.grid_shape[0], 5)
        self.assertLessEqual(metadata.grid_shape[1], 5)
        self.assertTrue(np.isfinite(window.data.values).any())
        self.assertGreater(float(np.nanmax(window.data.values)), 0.0)

        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ):
            set_cached_window(reference_time, 48, window)
            clear_cache()
            restored = get_cached_window(
                reference_time,
                48,
                "07",
                bounds,
            )
            self.assertIsNotNone(restored)
            self.assertEqual(
                restored.metadata.granule_timestamps,
                metadata.granule_timestamps,
            )
            self.assertTrue(np.array_equal(
                restored.data.values,
                window.data.values,
                equal_nan=True,
            ))


@unittest.skipUnless(
    os.getenv("GEOLENS_RUN_HISTORICAL_IMERG_TESTS") == "1",
    "historical IMERG discovery verification is opt-in",
)
class HistoricalImergDiscoveryTests(unittest.TestCase):
    def test_may_2023_v07_window_has_complete_granule_discovery(
        self,
    ) -> None:
        reference_time = datetime(
            2023,
            5,
            18,
            0,
            0,
            tzinfo=timezone.utc,
        )
        discovery = discover_imerg_granules(
            reference_time,
            48,
            dataset_version="07",
        )

        self.assertEqual(discovery.dataset_version, "07")
        self.assertEqual(discovery.archive_version, "07")
        self.assertEqual(discovery.expected_granule_count, 96)
        self.assertEqual(len(discovery.granule_timestamps), 96)
        self.assertEqual(
            discovery.granule_timestamps[0],
            datetime(2023, 5, 16, 0, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(
            discovery.granule_timestamps[-1],
            datetime(2023, 5, 17, 23, 30, tzinfo=timezone.utc),
        )
        self.assertLessEqual(
            discovery.searched_granule_count,
            96,
        )
        self.assertEqual(discovery.product, "GPM_3IMERGHH")
        self.assertEqual(discovery.run_type, "final")

if __name__ == "__main__":
    unittest.main()
