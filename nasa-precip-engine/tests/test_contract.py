import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import h3
from fastapi import HTTPException
import numpy as np
import xarray as xr

from src.cache import clear_cache
from src.h3_mapping import spatial_bounds_for_h3
from src.contracts import (
    build_error_window_payload,
    build_window_payload,
)
from src.imerg_client import (
    ImergAuthRequiredError,
    ImergRateLimitedError,
    ImergSpatialBounds,
    ImergWindow,
    ImergWindowMetadata,
)
from src.main import PrecipRequest, get_precipitation_for_h3


REFERENCE = datetime(2026, 8, 21, 12, 0, tzinfo=timezone.utc)
START = REFERENCE - timedelta(hours=1)
H3_CELL = h3.latlng_to_cell(46.0, 11.0, 9)
REQUESTED_BOUNDS = spatial_bounds_for_h3([H3_CELL])
LOADED_BOUNDS = ImergSpatialBounds(9.95, 44.95, 12.05, 47.05)


def window(
    status="available",
    reason=None,
    dataset_version="07",
    archive_version="07",
):
    data = xr.DataArray(
        np.zeros((2, 2), dtype=float),
        dims=("lat", "lon"),
        coords={"lat": [45.0, 47.0], "lon": [10.0, 12.0]},
    )
    timestamps = (
        START,
        START + timedelta(minutes=30),
    )
    return ImergWindow(
        data=data,
        metadata=ImergWindowMetadata(
            product="GPM_3IMERGHH",
            run_type="final",
            dataset_version=dataset_version,
            archive_version=archive_version,
            requested_window_start=START,
            requested_window_end=REFERENCE,
            actual_window_start=START,
            actual_window_end=REFERENCE,
            expected_granule_count=2,
            searched_granule_count=2,
            granule_count=2,
            granule_timestamps=timestamps,
            variable_names=("precipitation",),
            acquired_at=REFERENCE + timedelta(minutes=1),
            source_resolution="0.1 degree",
            sampling_method="nearest IMERG grid cell at H3 centroid",
            requested_spatial_bounds=REQUESTED_BOUNDS,
            loaded_spatial_bounds=LOADED_BOUNDS,
            grid_shape=(2, 2),
            status=status,
            missing_reason=reason,
        ),
    )


class ContractTests(unittest.TestCase):
    def test_available_zero_is_serialized_with_full_provenance(self):
        payload = build_window_payload(
            window(),
            [H3_CELL],
            cached=False,
        )
        evidence = payload["cells"][0]["rainfallMm"]

        self.assertEqual(evidence["value"], 0.0)
        self.assertEqual(evidence["quality"]["status"], "available")
        self.assertEqual(
            evidence["spatial"]["sourceResolution"],
            "0.1 degree",
        )
        self.assertEqual(payload["requestedSpatialBounds"], {
            "west": REQUESTED_BOUNDS.west,
            "south": REQUESTED_BOUNDS.south,
            "east": REQUESTED_BOUNDS.east,
            "north": REQUESTED_BOUNDS.north,
        })
        self.assertEqual(payload["gridShape"], {"lat": 2, "lon": 2})
        self.assertEqual(
            evidence["provenance"]["sourceMetadata"][
                "granuleTimestamps"
            ],
            [
                "2026-08-21T11:00:00Z",
                "2026-08-21T11:30:00Z",
            ],
        )

    def test_dataset_and_archive_versions_are_serialized(self):
        payload = build_window_payload(
            window(),
            [H3_CELL],
            cached=False,
        )
        evidence = payload["cells"][0]["rainfallMm"]

        self.assertEqual(payload["datasetVersion"], "07")
        self.assertEqual(payload["archiveVersion"], "07")
        self.assertEqual(
            evidence["provenance"]["datasetVersion"],
            "07",
        )
        self.assertEqual(
            evidence["provenance"]["sourceMetadata"][
                "archiveVersion"
            ],
            "07",
        )
    def test_h3_scope_spanning_antimeridian_is_rejected(self):
        cells = [
            h3.latlng_to_cell(0.0, 179.9, 9),
            h3.latlng_to_cell(0.0, -179.9, 9),
        ]

        with self.assertRaisesRegex(ValueError, "antimeridian"):
            spatial_bounds_for_h3(cells)

    def test_incomplete_window_never_exposes_partial_zero(self):
        payload = build_window_payload(
            window(
                status="incomplete_window",
                reason="Only one of two granules is usable",
            ),
            [H3_CELL],
            cached=False,
        )
        evidence = payload["cells"][0]["rainfallMm"]

        self.assertIsNone(evidence["value"])
        self.assertEqual(
            evidence["quality"]["status"],
            "incomplete_window",
        )

    def test_auth_failure_is_evidence_not_zero(self):
        payload = build_error_window_payload(
            "auth_required",
            [H3_CELL],
            missing_reason="NASA Earthdata authentication is required",
            hours=24,
            requested_start=REFERENCE - timedelta(hours=24),
            requested_end=REFERENCE,
            acquired_at=REFERENCE,
        )
        evidence = payload["cells"][0]["rainfallMm"]

        self.assertIsNone(evidence["value"])
        self.assertEqual(
            evidence["quality"]["status"],
            "auth_required",
        )


class EndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        clear_cache()

    async def test_endpoint_returns_auth_required_without_fallback(self):
        request = PrecipRequest(
            h3_indices=[H3_CELL],
            reference_time="2026-08-21T12:00:00Z",
            window_hours=[24],
        )

        with patch(
            "src.main.load_imerg_window",
            side_effect=ImergAuthRequiredError(
                "NASA credentials are missing",
            ),
        ):
            payload = await get_precipitation_for_h3(request)

        evidence = payload["windows"][0]["cells"][0]["rainfallMm"]
        self.assertIsNone(evidence["value"])
        self.assertEqual(
            evidence["quality"]["status"],
            "auth_required",
        )
        self.assertEqual(
            evidence["quality"]["missingReason"],
            "NASA Earthdata authentication is required",
        )

    async def test_endpoint_preserves_rate_limit_status_safely(self):
        request = PrecipRequest(
            h3_indices=[H3_CELL],
            reference_time="2026-08-21T12:00:00Z",
            window_hours=[24],
        )

        with patch(
            "src.main.load_imerg_window",
            side_effect=ImergRateLimitedError("private upstream detail"),
        ):
            payload = await get_precipitation_for_h3(request)

        evidence = payload["windows"][0]["cells"][0]["rainfallMm"]
        self.assertIsNone(evidence["value"])
        self.assertEqual(
            evidence["quality"]["status"],
            "rate_limited",
        )
        self.assertEqual(
            evidence["quality"]["missingReason"],
            "NASA Earthdata rate limiting prevented acquisition",
        )

    async def test_unexpected_failure_does_not_expose_exception_details(self):
        request = PrecipRequest(
            h3_indices=[H3_CELL],
            reference_time="2026-08-21T12:00:00Z",
            window_hours=[24],
        )
        sensitive_detail = "secret token at C:\\private\\credentials.txt"

        with patch(
            "src.main.load_imerg_window",
            side_effect=RuntimeError(sensitive_detail),
        ):
            payload = await get_precipitation_for_h3(request)

        evidence = payload["windows"][0]["cells"][0]["rainfallMm"]
        reason = evidence["quality"]["missingReason"]
        self.assertIsNone(evidence["value"])
        self.assertEqual(
            evidence["quality"]["status"],
            "upstream_error",
        )
        self.assertNotIn(sensitive_detail, reason)
        self.assertEqual(
            reason,
            "Unexpected IMERG provider failure; inspect service logs",
        )

    async def test_invalid_h3_does_not_expose_validation_exception(self):
        request = PrecipRequest(
            h3_indices=["not-an-h3-cell"],
            reference_time="2026-08-21T12:00:00Z",
            window_hours=[24],
        )

        with self.assertRaises(HTTPException) as raised:
            await get_precipitation_for_h3(request)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(
            raised.exception.detail,
            "One or more H3 indices are invalid",
        )
    async def test_historical_v07_reaches_canonical_loader(self):
        request = PrecipRequest(
            h3_indices=[H3_CELL],
            reference_time="2023-05-18T00:00:00Z",
            dataset_version="07",
            window_hours=[48],
        )

        with patch(
            "src.main.load_imerg_window",
            return_value=window(),
        ) as loader, patch("src.main.set_cached_window") as cache:
            payload = await get_precipitation_for_h3(request)

        loader.assert_called_once_with(
            datetime(2023, 5, 18, 0, 0, tzinfo=timezone.utc),
            48,
            dataset_version="07",
            spatial_bounds=REQUESTED_BOUNDS,
        )
        cache.assert_called_once()
        self.assertEqual(payload["datasetVersion"], "07")
        self.assertEqual(payload["archiveVersion"], "07")
        self.assertEqual(
            payload["windows"][0]["datasetVersion"],
            "07",
        )
    def test_duplicate_windows_are_rejected(self):
        with self.assertRaises(ValueError):
            PrecipRequest(
                h3_indices=[H3_CELL],
                window_hours=[24, 24],
            )


if __name__ == "__main__":
    unittest.main()
