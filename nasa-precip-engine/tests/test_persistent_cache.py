import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import numpy as np
import xarray as xr

from src.cache import (
    clear_cache,
    get_cache_stats,
    get_cached_window,
    set_cached_window,
)
from src.imerg_client import (
    IMERG_EUROPE_BOUNDS,
    ImergSpatialBounds,
    ImergWindow,
    ImergWindowMetadata,
)


REFERENCE = datetime(2026, 8, 20, 0, 0, tzinfo=timezone.utc)
START = REFERENCE - timedelta(hours=1)


def evidence_window(
    status="available",
    dataset_version="07",
    archive_version="07",
    requested_bounds=IMERG_EUROPE_BOUNDS,
):
    timestamps = (
        START,
        START + timedelta(minutes=30),
    )
    granule_count = 2
    reason = None

    if status != "available":
        timestamps = timestamps[:1]
        granule_count = 1
        reason = "one expected granule is missing"

    return ImergWindow(
        data=xr.DataArray(
            np.array([[0.0, 1.25], [2.5, 4.0]], dtype=float),
            dims=("lat", "lon"),
            coords={
                "lat": [45.95, 46.05],
                "lon": [11.05, 11.15],
            },
            attrs={"units": "mm"},
        ),
        metadata=ImergWindowMetadata(
            product="GPM_3IMERGHHE",
            run_type="early",
            dataset_version=dataset_version,
            archive_version=archive_version,
            requested_window_start=START,
            requested_window_end=REFERENCE,
            actual_window_start=START,
            actual_window_end=(
                REFERENCE
                if status == "available"
                else START + timedelta(minutes=30)
            ),
            expected_granule_count=2,
            searched_granule_count=granule_count,
            granule_count=granule_count,
            granule_timestamps=timestamps,
            variable_names=("precipitation",),
            acquired_at=REFERENCE + timedelta(minutes=5),
            source_resolution="0.1 degree",
            sampling_method="nearest IMERG grid cell at H3 centroid",
            requested_spatial_bounds=requested_bounds,
            loaded_spatial_bounds=ImergSpatialBounds(
                11.0,
                45.9,
                11.2,
                46.1,
            ),
            grid_shape=(2, 2),
            status=status,
            missing_reason=reason,
        ),
    )


class PersistentCacheTests(unittest.TestCase):
    def setUp(self):
        clear_cache()

    def tearDown(self):
        clear_cache()

    def test_available_real_window_round_trips_without_losing_zero(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            original = evidence_window()
            set_cached_window(REFERENCE, 1, original)
            clear_cache()

            restored = get_cached_window(REFERENCE, 1)

            self.assertIsNotNone(restored)
            self.assertEqual(float(restored.data.values[0, 0]), 0.0)
            self.assertEqual(float(restored.data.values[1, 1]), 4.0)
            self.assertEqual(restored.metadata.status, "available")
            self.assertEqual(
                restored.metadata.granule_timestamps,
                original.metadata.granule_timestamps,
            )
            self.assertEqual(
                restored.metadata.acquired_at,
                original.metadata.acquired_at,
            )
            self.assertEqual(restored.metadata.run_type, "early")
            stats = get_cache_stats()
            self.assertEqual(stats["disk_valid_entries"], 1)
            self.assertGreater(stats["disk_bytes"], 0)

    def test_dataset_versions_never_share_memory_or_disk_entries(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            set_cached_window(REFERENCE, 1, evidence_window())
            clear_cache()

            self.assertIsNone(
                get_cached_window(REFERENCE, 1, "08")
            )
            restored = get_cached_window(REFERENCE, 1, "07")
            self.assertIsNotNone(restored)
            self.assertEqual(restored.metadata.dataset_version, "07")
            self.assertEqual(restored.metadata.archive_version, "07")

    def test_spatial_scopes_never_share_memory_or_disk_entries(self):
        scope_a = ImergSpatialBounds(11.0, 45.9, 11.2, 46.1)
        scope_b = ImergSpatialBounds(12.0, 44.1, 12.2, 44.3)
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            set_cached_window(
                REFERENCE,
                1,
                evidence_window(requested_bounds=scope_a),
            )
            clear_cache()

            self.assertIsNone(
                get_cached_window(REFERENCE, 1, "07", scope_b)
            )
            restored = get_cached_window(
                REFERENCE,
                1,
                "07",
                scope_a,
            )
            self.assertIsNotNone(restored)
            self.assertEqual(
                restored.metadata.requested_spatial_bounds,
                scope_a,
            )
            self.assertEqual(len(list(Path(directory).glob("*.nc"))), 1)

    def test_archive_version_mismatch_is_a_cache_miss(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            set_cached_window(REFERENCE, 1, evidence_window())
            clear_cache()
            metadata_path = next(Path(directory).glob("*.json"))
            payload = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            payload["windowMetadata"]["archiveVersion"] = "08"
            metadata_path.write_text(
                json.dumps(payload),
                encoding="utf-8",
            )

            self.assertIsNone(get_cached_window(REFERENCE, 1, "07"))

    def test_requested_metadata_bounds_mismatch_is_a_cache_miss(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            set_cached_window(REFERENCE, 1, evidence_window())
            clear_cache()
            metadata_path = next(Path(directory).glob("*.json"))
            payload = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            payload["windowMetadata"]["requestedSpatialBounds"] = {
                "west": 11.0,
                "south": 45.9,
                "east": 11.2,
                "north": 46.1,
            }
            metadata_path.write_text(
                json.dumps(payload),
                encoding="utf-8",
            )

            self.assertIsNone(get_cached_window(REFERENCE, 1))

    def test_grid_shape_mismatch_is_a_cache_miss(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            set_cached_window(REFERENCE, 1, evidence_window())
            clear_cache()
            metadata_path = next(Path(directory).glob("*.json"))
            payload = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            payload["windowMetadata"]["gridShape"] = [3, 2]
            metadata_path.write_text(
                json.dumps(payload),
                encoding="utf-8",
            )

            self.assertIsNone(get_cached_window(REFERENCE, 1))

    def test_loaded_bounds_mismatch_is_a_cache_miss(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            set_cached_window(REFERENCE, 1, evidence_window())
            clear_cache()
            metadata_path = next(Path(directory).glob("*.json"))
            payload = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            payload["windowMetadata"]["loadedSpatialBounds"]["east"] = 11.25
            metadata_path.write_text(
                json.dumps(payload),
                encoding="utf-8",
            )

            self.assertIsNone(get_cached_window(REFERENCE, 1))

    def test_incomplete_window_is_memory_only(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            set_cached_window(
                REFERENCE,
                1,
                evidence_window("incomplete_window"),
            )
            clear_cache()

            self.assertIsNone(get_cached_window(REFERENCE, 1))
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_corrupt_metadata_is_a_cache_miss_not_evidence(self):
        with tempfile.TemporaryDirectory() as directory, patch(
            "src.cache.IMERG_CACHE_DIR",
            directory,
        ), patch(
            "src.cache.IMERG_DISK_CACHE_TTL_SECONDS",
            3600,
        ):
            set_cached_window(REFERENCE, 1, evidence_window())
            clear_cache()
            metadata_path = next(Path(directory).glob("*.json"))
            payload = json.loads(
                metadata_path.read_text(encoding="utf-8")
            )
            payload["windowMetadata"]["status"] = "missing"
            metadata_path.write_text(
                json.dumps(payload),
                encoding="utf-8",
            )

            self.assertIsNone(get_cached_window(REFERENCE, 1))


if __name__ == "__main__":
    unittest.main()
