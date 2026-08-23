import math
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import numpy as np
import xarray as xr

from src.imerg_client import (
    accumulate_precip,
    archive_version_for,
    discover_imerg_granules,
    get_precip_at_point,
    normalize_reference_time,
)


def dataset(values):
    return xr.Dataset(
        {
            "precipitationCal": (
                ("lat", "lon"),
                np.asarray(values, dtype=float),
            )
        },
        coords={
            "lat": [45.0, 46.0],
            "lon": [10.0, 11.0],
        },
    )


class ImergNumericSemanticsTests(unittest.TestCase):
    def test_observed_zero_remains_zero(self):
        total, variables = accumulate_precip(
            [
                dataset([[0.0, 2.0], [4.0, 6.0]]),
                dataset([[0.0, 2.0], [4.0, 6.0]]),
            ]
        )

        self.assertEqual(float(total.sel(lat=45.0, lon=10.0)), 0.0)
        self.assertEqual(float(total.sel(lat=45.0, lon=11.0)), 2.0)
        self.assertEqual(
            variables,
            ("precipitationCal", "precipitationCal"),
        )

    def test_nan_is_not_replaced_by_zero(self):
        total, _ = accumulate_precip(
            [
                dataset([[np.nan, 2.0], [4.0, 6.0]]),
                dataset([[0.0, 2.0], [4.0, 6.0]]),
            ]
        )

        self.assertTrue(
            math.isnan(float(total.sel(lat=45.0, lon=10.0)))
        )

    def test_negative_fill_value_becomes_missing(self):
        total, _ = accumulate_precip(
            [
                dataset([[-9999.0, 2.0], [4.0, 6.0]]),
            ]
        )

        self.assertTrue(
            math.isnan(float(total.sel(lat=45.0, lon=10.0)))
        )

    def test_point_sampling_distinguishes_zero_missing_and_coverage(self):
        zero = xr.DataArray(
            [[0.0, np.nan], [1.0, 2.0]],
            dims=("lat", "lon"),
            coords={"lat": [45.0, 46.0], "lon": [10.0, 11.0]},
        )

        observed_zero = get_precip_at_point(zero, 45.0, 10.0)
        missing = get_precip_at_point(zero, 45.0, 11.0)
        outside = get_precip_at_point(zero, 70.0, 10.0)

        self.assertEqual(observed_zero.status, "available")
        self.assertEqual(observed_zero.value_mm, 0.0)
        self.assertEqual(missing.status, "missing")
        self.assertIsNone(missing.value_mm)
        self.assertEqual(outside.status, "out_of_coverage")
        self.assertIsNone(outside.value_mm)

    def test_dataset_versions_map_to_explicit_archive_collections(self):
        self.assertEqual(archive_version_for("07"), "07")

        with self.assertRaises(ValueError):
            archive_version_for("06C")

    def test_fallback_selection_counts_unique_granule_timestamps(self):
        start = datetime(2023, 5, 16, tzinfo=timezone.utc)
        unique = [
            {
                "umm": {
                    "TemporalExtent": {
                        "RangeDateTime": {
                            "BeginningDateTime": (
                                start + timedelta(minutes=30 * index)
                            ).isoformat()
                        }
                    }
                }
            }
            for index in range(96)
        ]
        final_with_duplicate = unique[:-1] + [unique[0]]

        with patch("src.imerg_client.authenticate"), patch(
            "src.imerg_client._search_product",
            side_effect=[final_with_duplicate, unique],
        ) as search:
            discovery = discover_imerg_granules(
                datetime(2023, 5, 18, tzinfo=timezone.utc),
                48,
                allow_early=False,
            )

        self.assertEqual(search.call_count, 2)
        self.assertEqual(discovery.product, "GPM_3IMERGHHL")
        self.assertEqual(discovery.run_type, "late")
        self.assertEqual(len(discovery.granule_timestamps), 96)

    def test_reference_time_is_utc_half_hour(self):
        normalized = normalize_reference_time(
            datetime(2026, 8, 21, 12, 47, 19)
        )

        self.assertEqual(
            normalized,
            datetime(2026, 8, 21, 12, 30, tzinfo=timezone.utc),
        )


if __name__ == "__main__":
    unittest.main()
