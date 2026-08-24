import importlib.util
import math
from pathlib import Path
import sys
import unittest


SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS))
SCRIPT = SCRIPTS / "evaluate_emilia_concentration.py"
SPEC = importlib.util.spec_from_file_location("emilia_concentration", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class EmiliaConcentrationEvaluationTest(unittest.TestCase):
    def test_artifact_namespace_rejects_cross_section_aliases(self):
        first = {
            "relativePath": "inputs/a.bin",
            "bytes": 1,
            "sha256": "a" * 64,
        }
        second = {**first, "sha256": "b" * 64}
        with self.assertRaisesRegex(ValueError, "declared by both"):
            MODULE.assert_unique_artifact_namespace(
                [("benchmark", [first]), ("dataset", [second])]
            )

        with self.assertRaisesRegex(ValueError, "does not pin artifact"):
            MODULE.require_declared_artifact(
                MODULE.declared_artifact_map([first], "baseline"),
                "inputs/other.bin",
                "baseline",
            )

    def test_known_water_mask_requires_explicit_inside_and_outside_values(self):
        MODULE.validate_known_water_mask(bytes((0, 1, 255)), bytes((1, 1, 0)))

        with self.assertRaisesRegex(ValueError, "invalid in-AOI"):
            MODULE.validate_known_water_mask(bytes((2, 1, 255)), bytes((1, 1, 0)))
        with self.assertRaisesRegex(ValueError, "outside-AOI sentinel"):
            MODULE.validate_known_water_mask(bytes((0, 1, 0)), bytes((1, 1, 0)))

    def test_perfect_ranking_has_unit_auc_and_average_precision(self):
        scores = [0.0, 1.0, 2.0, 3.0]
        labels = [0, 0, 1, 1]

        self.assertEqual(MODULE.roc_auc(scores, labels), 1.0)
        self.assertEqual(MODULE.average_precision(scores, labels), 1.0)

    def test_equal_scores_are_tie_aware(self):
        scores = [1.0, 1.0, 1.0, 1.0]
        labels = [1, 0, 1, 0]

        self.assertEqual(MODULE.roc_auc(scores, labels), 0.5)
        self.assertEqual(MODULE.average_precision(scores, labels), 0.5)

        overlap = MODULE.overlap_at_area_fraction(
            scores, labels, fraction=0.25, cell_area_m2=900
        )
        self.assertEqual(overlap["cellsEqualThreshold"], 4)
        self.assertEqual(overlap["fractionalTieWeight"], 0.25)
        self.assertEqual(overlap["selectedEquivalentCells"], 1.0)
        self.assertEqual(overlap["weightedIntersectionCells"], 0.5)
        self.assertEqual(overlap["precision"], 0.5)
        self.assertEqual(overlap["recall"], 0.25)
        self.assertAlmostEqual(overlap["intersectionOverUnion"], 0.2)

    def test_score_derivation_does_not_substitute_missing_with_zero(self):
        scores, labels, counts = MODULE.derive_evaluation_vectors(
            aoi_mask=bytes((1, 1, 1, 1, 0)),
            known_water_mask=bytes((0, 1, 0, 0, 255)),
            observed_mask=bytes((1, 0, 1, 0, 255)),
            local_runoff=[1.0, math.nan, math.nan, 2.0, math.nan],
            accumulated_runoff=[3.0, 5.0, 2.0, math.nan, math.nan],
            negative_tolerance=1e-9,
        )

        self.assertEqual(scores, [2.0, 5.0])
        self.assertEqual(labels, [1, 0])
        self.assertEqual(counts["knownWaterStructuralZeroSubtractions"], 1)
        self.assertEqual(counts["excludedLocalNoData"], 1)
        self.assertEqual(counts["excludedAccumulatedNoData"], 1)

    def test_only_numeric_roundoff_negatives_are_clamped(self):
        scores, _, counts = MODULE.derive_evaluation_vectors(
            aoi_mask=bytes((1,)),
            known_water_mask=bytes((0,)),
            observed_mask=bytes((1,)),
            local_runoff=[1.0],
            accumulated_runoff=[1.0 - 5e-10],
            negative_tolerance=1e-9,
        )
        self.assertEqual(scores, [0.0])
        self.assertEqual(counts["clampedRoundoffNegatives"], 1)

        with self.assertRaisesRegex(ValueError, "meaningfully negative"):
            MODULE.derive_evaluation_vectors(
                aoi_mask=bytes((1,)),
                known_water_mask=bytes((0,)),
                observed_mask=bytes((1,)),
                local_runoff=[1.0],
                accumulated_runoff=[0.99],
                negative_tolerance=1e-9,
            )

    def test_center_rasterization_uses_frozen_north_to_south_order(self):
        polygon = [[
            (0.0, 0.0),
            (10.0, 0.0),
            (10.0, 10.0),
            (0.0, 10.0),
            (0.0, 0.0),
        ]]
        grid = {
            "bounds": [0, 0, 20, 20],
            "cellSizeM": 10,
            "width": 2,
            "height": 2,
        }
        observed = bytearray(4)
        MODULE.rasterize_center_polygon(
            polygon, observed, bytes((1, 1, 1, 1)), grid
        )
        self.assertEqual(list(observed), [0, 0, 1, 0])


if __name__ == "__main__":
    unittest.main()
