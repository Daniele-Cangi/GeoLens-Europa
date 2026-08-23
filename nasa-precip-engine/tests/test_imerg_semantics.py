import math
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import numpy as np
import xarray as xr

from src.imerg_client import (
    ImergGranuleDiscovery,
    ImergSpatialBounds,
    accumulate_precip,
    archive_version_for,
    discover_imerg_granules,
    get_precip_at_point,
    load_imerg_window,
    normalize_reference_time,
    precipitation_amount,
    spatial_bounds_from_data,
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

    def test_spatial_subset_loads_only_requested_source_cells_and_margin(self):
        coordinates = [44.85, 44.95, 45.05, 45.15]
        source = xr.Dataset(
            {
                "precipitationCal": (
                    ("lat", "lon"),
                    np.ones((4, 4), dtype=float),
                )
            },
            coords={"lat": coordinates, "lon": coordinates},
        )
        bounds = ImergSpatialBounds(44.96, 44.96, 45.04, 45.04)

        amount, _ = precipitation_amount(
            source,
            spatial_bounds=bounds,
        )

        self.assertEqual(amount.sizes, {"lat": 2, "lon": 2})
        self.assertEqual(list(amount.coords["lat"].values), [44.95, 45.05])
        self.assertEqual(list(amount.coords["lon"].values), [44.95, 45.05])

    def test_loaded_bounds_report_complete_source_cell_footprints(self):
        source = xr.DataArray(
            np.ones((2, 2), dtype=float),
            dims=("lat", "lon"),
            coords={"lat": [45.95, 46.05], "lon": [11.05, 11.15]},
        )

        bounds = spatial_bounds_from_data(source)

        self.assertAlmostEqual(bounds.west, 11.0)
        self.assertAlmostEqual(bounds.south, 45.9)
        self.assertAlmostEqual(bounds.east, 11.2)
        self.assertAlmostEqual(bounds.north, 46.1)

    def test_invalid_spatial_bounds_are_rejected(self):
        with self.assertRaises(ValueError):
            ImergSpatialBounds(12.0, 44.0, 11.0, 45.0)

    def test_loader_closes_every_remote_granule_handle(self):
        end = datetime(2023, 5, 18, tzinfo=timezone.utc)
        start = end - timedelta(hours=1)
        timestamps = (start, start + timedelta(minutes=30))
        results = (object(), object())
        discovery = ImergGranuleDiscovery(
            product="GPM_3IMERGHH",
            run_type="final",
            dataset_version="07",
            archive_version="07",
            requested_window_start=start,
            requested_window_end=end,
            expected_granule_count=2,
            searched_granule_count=2,
            granule_timestamps=timestamps,
            timestamped_results=tuple(zip(timestamps, results)),
        )
        handles = (Mock(), Mock())
        bounds = ImergSpatialBounds(10.0, 45.0, 11.0, 46.0)

        with patch(
            "src.imerg_client.discover_imerg_granules",
            return_value=discovery,
        ), patch(
            "src.imerg_client.earthaccess.open",
            return_value=list(handles),
        ), patch(
            "src.imerg_client.xr.open_dataset",
            side_effect=[
                dataset([[1.0, 2.0], [3.0, 4.0]]),
                dataset([[1.0, 2.0], [3.0, 4.0]]),
            ],
        ):
            window = load_imerg_window(
                end,
                1,
                spatial_bounds=bounds,
            )

        self.assertEqual(window.metadata.status, "available")
        for handle in handles:
            handle.close.assert_called_once_with()

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
