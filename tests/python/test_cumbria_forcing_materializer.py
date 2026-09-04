import gzip
import importlib.util
from datetime import timedelta
from pathlib import Path
import sys
import unittest

import numpy as np


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPOSITORY_ROOT / "scripts/materialize_cumbria_forcing.py"
SPEC = importlib.util.spec_from_file_location("cumbria_forcing_materializer", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CumbriaForcingMaterializerTests(unittest.TestCase):
    def test_positive_excess_uses_first_sample_without_clipping_observed_flow(self):
        values = np.full(MODULE.SHEEPMOUNT_SAMPLES, 10.0, dtype="<f8")
        values[1:5] = [8.0, 10.0, 12.0, 15.0]

        baseline, excess, volume = MODULE.positive_excess_discharge(values)

        self.assertEqual(baseline, 10.0)
        self.assertEqual(excess[:5].tolist(), [0.0, 0.0, 0.0, 2.0, 5.0])
        self.assertEqual(volume[4], 4500.0)

    def test_ea_parser_sorts_complete_intervals_and_excludes_end_boundary(self):
        timestamps = [
            MODULE.EVENT_START
            + timedelta(seconds=MODULE.SHEEPMOUNT_INTERVAL_SECONDS * index)
            for index in range(MODULE.SHEEPMOUNT_SAMPLES)
        ]
        items = [
            {"dateTime": MODULE.iso(timestamp), "value": float(index)}
            for index, timestamp in reversed(list(enumerate(timestamps)))
        ]
        items.append({"dateTime": MODULE.iso(MODULE.EVENT_END), "value": 9999.0})

        parsed_timestamps, values = MODULE.parse_ea_readings({"items": items})

        self.assertEqual(parsed_timestamps[0], "2015-12-04T00:00:00Z")
        self.assertEqual(parsed_timestamps[-1], "2015-12-06T23:45:00Z")
        self.assertEqual(values[0], 0.0)
        self.assertEqual(values[-1], 287.0)

    def test_ea_parser_rejects_a_gap_instead_of_filling_zero(self):
        items = [
            {
                "dateTime": MODULE.iso(
                    MODULE.EVENT_START
                    + timedelta(seconds=MODULE.SHEEPMOUNT_INTERVAL_SECONDS * index)
                ),
                "value": 1.0,
            }
            for index in range(MODULE.SHEEPMOUNT_SAMPLES - 1)
        ]
        with self.assertRaisesRegex(ValueError, "missing intervals"):
            MODULE.parse_ea_readings({"items": items})

    def test_artifact_compression_is_deterministic_and_content_addressed(self):
        raw = np.asarray([0.0, 1.5, 2.0], dtype="<f4").tobytes()
        first, first_bytes = MODULE.artifact_descriptor(
            Path("C:/GeoLens"), "test", raw, "float32_little_endian", [3]
        )
        second, second_bytes = MODULE.artifact_descriptor(
            Path("C:/GeoLens"), "test", raw, "float32_little_endian", [3]
        )
        self.assertEqual(first, second)
        self.assertEqual(first_bytes, second_bytes)
        self.assertEqual(gzip.decompress(first_bytes), raw)

    def test_dry_run_requires_an_explicit_external_root(self):
        options = MODULE.parse_args(["--data-root", "C:/GeoLens"])
        self.assertFalse(options.execute)
        self.assertFalse(options.check)
        with self.assertRaises(SystemExit):
            MODULE.parse_args([])
        with self.assertRaisesRegex(ValueError, "outside Git"):
            MODULE.ensure_external_data_root(REPOSITORY_ROOT)


if __name__ == "__main__":
    unittest.main()
