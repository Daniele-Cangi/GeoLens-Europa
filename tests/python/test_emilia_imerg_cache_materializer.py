from datetime import datetime, timedelta, timezone
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import xarray as xr


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "materialize_emilia_imerg_cache.py"
SPEC = importlib.util.spec_from_file_location("emilia_imerg_cache", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def timestamps():
    start = datetime(2023, 5, 16, tzinfo=timezone.utc)
    return [(start + timedelta(minutes=30 * index)).isoformat() for index in range(96)]


def metadata():
    bounds = dict(MODULE.EXPECTED_BOUNDS)
    return {
        "schemaVersion": 3,
        "datasetVersion": "07",
        "windowHours": 48,
        "referenceTime": MODULE.EXPECTED_END,
        "spatialBounds": bounds,
        "windowMetadata": {
            "status": "available",
            "missingReason": None,
            "datasetVersion": "07",
            "archiveVersion": "07",
            "product": "GPM_3IMERGHH",
            "runType": "final",
            "sourceResolution": "0.1 degree",
            "requestedWindowStart": MODULE.EXPECTED_START,
            "requestedWindowEnd": MODULE.EXPECTED_END,
            "actualWindowStart": MODULE.EXPECTED_START,
            "actualWindowEnd": MODULE.EXPECTED_END,
            "expectedGranuleCount": 96,
            "searchedGranuleCount": 96,
            "granuleCount": 96,
            "granuleTimestamps": timestamps(),
            "gridShape": [3, 3],
            "requestedSpatialBounds": bounds,
            "loadedSpatialBounds": {
                "west": 11.9,
                "south": 44.1,
                "east": 12.2,
                "north": 44.4,
            },
            "samplingMethod": "nearest IMERG grid cell at H3 centroid",
            "acquiredAt": "2026-08-23T21:30:02+00:00",
        },
    }


class EmiliaImergCacheMaterializerTest(unittest.TestCase):
    def write_fixture(self, root, values=None):
        metadata_path = root / "cache.json"
        netcdf_path = root / "cache.nc"
        metadata_path.write_text(json.dumps(metadata()), encoding="utf8")
        if values is None:
            values = np.arange(9, dtype=np.float32).reshape((3, 3))
        xr.Dataset(
            {"precipitation": (("lon", "lat"), values)},
            coords={"lon": [11.95, 12.05, 12.15], "lat": [44.15, 44.25, 44.35]},
        ).to_netcdf(netcdf_path)
        return metadata_path, netcdf_path

    def test_materializes_portable_grid_and_preserves_observed_zero(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            metadata_path, netcdf_path = self.write_fixture(root)
            result = MODULE.materialize(root / "data", metadata_path, netcdf_path)
            grid = result["grid"]
            self.assertEqual(grid["status"], "available")
            self.assertEqual(grid["sourceGrid"]["precipitationMm"][0][0], 0.0)
            self.assertEqual(grid["statistics"]["finiteCells"], 9)
            self.assertEqual(len(result["artifacts"]), 3)

    def test_rejects_incomplete_granule_window(self):
        value = metadata()
        value["windowMetadata"]["granuleCount"] = 95
        with self.assertRaisesRegex(ValueError, "granuleCount"):
            MODULE.validate_metadata(value)

    def test_rejects_timestamp_gap_inside_complete_count(self):
        value = metadata()
        value["windowMetadata"]["granuleTimestamps"][10] = (
            "2023-05-16T05:01:00+00:00"
        )
        with self.assertRaisesRegex(ValueError, "every exact half-hour"):
            MODULE.validate_metadata(value)

    def test_rejects_missing_precipitation_instead_of_zero_filling(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            values = np.ones((3, 3), dtype=np.float32)
            values[1, 1] = np.nan
            _, netcdf_path = self.write_fixture(root, values)
            with self.assertRaisesRegex(ValueError, "missing, invalid or negative"):
                MODULE.validate_netcdf(netcdf_path, metadata()["windowMetadata"])

    def test_rejects_dataset_version_drift(self):
        value = copy.deepcopy(metadata())
        value["datasetVersion"] = "06"
        with self.assertRaisesRegex(ValueError, "datasetVersion"):
            MODULE.validate_metadata(value)


if __name__ == "__main__":
    unittest.main()
