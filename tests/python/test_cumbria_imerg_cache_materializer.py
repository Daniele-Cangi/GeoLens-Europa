from __future__ import annotations

from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace

import numpy as np
import xarray as xr


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/materialize_cumbria_imerg_cache.py"
SPEC = importlib.util.spec_from_file_location("cumbria_imerg_materializer", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CumbriaImergMaterializerTests(unittest.TestCase):
    def test_manifest_boundary_becomes_exact_requested_bounds(self):
        bounds = MODULE.requested_bounds(
            {
                "publicBaselineProtocol": {
                    "domain": {
                        "wgs84Boundary": [
                            [-3.06, 54.89],
                            [-2.93, 54.90],
                            [-2.94, 54.96],
                            [-3.07, 54.95],
                            [-3.06, 54.89],
                        ]
                    }
                }
            }
        )
        self.assertEqual(bounds.as_tuple(), (-3.07, 54.89, -2.93, 54.96))

    def test_available_window_exports_complete_native_grid(self):
        bounds = MODULE.ImergSpatialBounds(-3.07, 54.89, -2.93, 54.96)
        timestamps = tuple(
            MODULE.EXPECTED_START + timedelta(minutes=30 * index)
            for index in range(MODULE.EXPECTED_GRANULES)
        )
        metadata = SimpleNamespace(
            product=MODULE.PRODUCT,
            run_type=MODULE.RUN_TYPE,
            dataset_version=MODULE.DATASET_VERSION,
            archive_version=MODULE.DATASET_VERSION,
            requested_window_start=MODULE.EXPECTED_START,
            requested_window_end=MODULE.EXPECTED_END,
            actual_window_start=MODULE.EXPECTED_START,
            actual_window_end=MODULE.EXPECTED_END,
            expected_granule_count=MODULE.EXPECTED_GRANULES,
            searched_granule_count=MODULE.EXPECTED_GRANULES,
            granule_count=MODULE.EXPECTED_GRANULES,
            granule_timestamps=timestamps,
            variable_names=("precipitationCal",),
            acquired_at=datetime(2026, 9, 2, tzinfo=timezone.utc),
            source_resolution="0.1 degree",
            sampling_method="nearest IMERG grid cell at H3 centroid",
            requested_spatial_bounds=bounds,
            loaded_spatial_bounds=MODULE.ImergSpatialBounds(-3.15, 54.85, -2.85, 55.05),
            grid_shape=(3, 2),
            status="available",
            missing_reason=None,
        )
        data = xr.DataArray(
            np.array([[0.0, 1.0, 2.0], [3.0, 4.0, 5.0]]),
            coords={
                "lon": np.array([-3.05, -2.95]),
                "lat": np.array([54.85, 54.95, 55.05]),
            },
            dims=("lon", "lat"),
            name="precipitation",
        )
        payload = MODULE.portable_grid(SimpleNamespace(data=data, metadata=metadata), bounds)
        self.assertEqual(payload["status"], "available")
        self.assertEqual(payload["statistics"]["minimumMm"], 0.0)
        self.assertEqual(payload["statistics"]["maximumMm"], 5.0)
        self.assertEqual(len(payload["provenance"]["granuleTimestamps"]), 144)

    def test_missing_or_negative_values_fail_instead_of_becoming_zero(self):
        bounds = MODULE.ImergSpatialBounds(-3.07, 54.89, -2.93, 54.96)
        data = xr.DataArray(
            np.array([[np.nan, -1.0], [0.0, 1.0]]),
            coords={"lon": [-3.05, -2.95], "lat": [54.85, 54.95]},
            dims=("lon", "lat"),
        )
        window = SimpleNamespace(
            data=data,
            metadata=SimpleNamespace(
                product=MODULE.PRODUCT,
                run_type=MODULE.RUN_TYPE,
                dataset_version=MODULE.DATASET_VERSION,
                archive_version=MODULE.DATASET_VERSION,
                requested_window_start=MODULE.EXPECTED_START,
                requested_window_end=MODULE.EXPECTED_END,
                actual_window_start=MODULE.EXPECTED_START,
                actual_window_end=MODULE.EXPECTED_END,
                expected_granule_count=MODULE.EXPECTED_GRANULES,
                searched_granule_count=MODULE.EXPECTED_GRANULES,
                granule_count=MODULE.EXPECTED_GRANULES,
                granule_timestamps=tuple(
                    MODULE.EXPECTED_START + timedelta(minutes=30 * index)
                    for index in range(MODULE.EXPECTED_GRANULES)
                ),
                source_resolution="0.1 degree",
                sampling_method="nearest IMERG grid cell at H3 centroid",
                requested_spatial_bounds=bounds,
                status="available",
                missing_reason=None,
                grid_shape=(2, 2),
            ),
        )
        with self.assertRaisesRegex(ValueError, "missing, negative"):
            MODULE.validate_window(window, bounds)


if __name__ == "__main__":
    unittest.main()
