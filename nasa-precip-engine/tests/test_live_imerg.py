"""Opt-in real NASA IMERG verification.

Run only with GEOLENS_RUN_LIVE_PROVIDER_TESTS=1 and valid Earthdata
credentials. The normal deterministic suite reports this test as skipped.
"""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone

from src.imerg_client import (
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
        )
        metadata = window.metadata

        self.assertEqual(metadata.status, "available")
        self.assertEqual(metadata.dataset_version, "07")
        self.assertEqual(metadata.expected_granule_count, 48)
        self.assertEqual(metadata.granule_count, 48)
        self.assertEqual(len(metadata.granule_timestamps), 48)
        self.assertEqual(metadata.source_resolution, "0.1 degree")
        self.assertIn(metadata.run_type, ("late", "early"))
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


if __name__ == "__main__":
    unittest.main()
