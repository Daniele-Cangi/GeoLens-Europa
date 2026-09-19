import importlib.util
from pathlib import Path
import unittest

import numpy as np


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "materialize_cumbria_failure_inventory.py"
)
SPEC = importlib.util.spec_from_file_location(
    "materialize_cumbria_failure_inventory",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CumbriaFailureInventoryTests(unittest.TestCase):
    def test_depth_bands_use_only_predeclared_thresholds(self):
        categories = np.array([[1, 2, 2], [1, 2, 0]], dtype=np.uint8)
        wet05 = np.array([[1, 1, 1], [1, 1, 0]], dtype=np.uint8)
        wet10 = np.array([[0, 0, 1], [1, 1, 0]], dtype=np.uint8)
        wet30 = np.array([[0, 0, 0], [0, 1, 0]], dtype=np.uint8)
        self.assertEqual(
            MODULE.depth_band_counts(categories, wet05, wet10, wet30),
            [
                {
                    "id": "0.05_to_below_0.10_m",
                    "lowerInclusiveMetres": 0.05,
                    "upperExclusiveMetres": 0.10,
                    "truePositiveCellCount": 1,
                    "falsePositiveCellCount": 1,
                },
                {
                    "id": "0.10_to_below_0.30_m",
                    "lowerInclusiveMetres": 0.10,
                    "upperExclusiveMetres": 0.30,
                    "truePositiveCellCount": 1,
                    "falsePositiveCellCount": 1,
                },
                {
                    "id": "at_least_0.30_m",
                    "lowerInclusiveMetres": 0.30,
                    "upperExclusiveMetres": None,
                    "truePositiveCellCount": 0,
                    "falsePositiveCellCount": 1,
                },
            ],
        )

    def test_threshold_masks_must_be_binary_nested_and_domain_aligned(self):
        valid = np.ones((2, 2), dtype=np.uint8)
        wet05 = np.array([[1, 1], [0, 0]], dtype=np.uint8)
        wet10 = np.array([[1, 0], [0, 0]], dtype=np.uint8)
        wet30 = np.zeros((2, 2), dtype=np.uint8)
        MODULE.validate_threshold_masks(wet05, wet10, wet30, valid)

        invalid = wet10.copy()
        invalid[1, 1] = 2
        with self.assertRaisesRegex(ValueError, "0.10 m wet mask"):
            MODULE.validate_threshold_masks(wet05, invalid, wet30, valid)

        not_nested = wet30.copy()
        not_nested[0, 1] = 1
        with self.assertRaisesRegex(ValueError, "nested"):
            MODULE.validate_threshold_masks(wet05, wet10, not_nested, valid)

    def test_land_cover_contingency_accounts_for_every_evaluated_cell(self):
        categories = np.array([[0, 1, 2], [3, 255, 2]], dtype=np.uint8)
        land_cover = np.array([[112, 112, 231], [231, -1, 231]], dtype=np.int16)
        self.assertEqual(
            MODULE.land_cover_contingency(categories, land_cover),
            [
                {
                    "classCode": 112,
                    "label": "discontinuous urban fabric",
                    "evaluatedCellCount": 2,
                    "knownDryAgreementCellCount": 1,
                    "truePositiveCellCount": 1,
                    "falsePositiveCellCount": 0,
                    "falseNegativeCellCount": 0,
                },
                {
                    "classCode": 231,
                    "label": "pastures",
                    "evaluatedCellCount": 3,
                    "knownDryAgreementCellCount": 0,
                    "truePositiveCellCount": 0,
                    "falsePositiveCellCount": 2,
                    "falseNegativeCellCount": 1,
                },
            ],
        )

    def test_unknown_land_cover_and_dry_run_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Unknown dominant CLC"):
            MODULE.land_cover_contingency(
                np.array([[2]], dtype=np.uint8),
                np.array([[999]], dtype=np.int16),
            )
        self.assertEqual(MODULE.plan()["evaluationRuns"], 0)
        self.assertEqual(MODULE.plan()["filesWritten"], 0)


if __name__ == "__main__":
    unittest.main()
