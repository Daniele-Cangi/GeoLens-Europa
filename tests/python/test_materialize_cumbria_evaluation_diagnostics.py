import importlib.util
from pathlib import Path
import unittest

import numpy as np


MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "materialize_cumbria_evaluation_diagnostics.py"
)
SPEC = importlib.util.spec_from_file_location(
    "materialize_cumbria_evaluation_diagnostics",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CumbriaEvaluationDiagnosticTests(unittest.TestCase):
    def arrays(self):
        shape = (MODULE.evaluation.GRID["height"], MODULE.evaluation.GRID["width"])
        predicted = np.full(shape, MODULE.evaluation.NO_DATA, dtype=np.uint8)
        valid = np.zeros(shape, dtype=np.uint8)
        observed = np.full(shape, MODULE.evaluation.NO_DATA, dtype=np.uint8)
        coverage = np.zeros(shape, dtype=np.uint8)
        valid[0:2, 0:2] = 1
        predicted[0:2, 0:2] = np.array([[0, 1], [1, 0]], dtype=np.uint8)
        coverage[0:2, 0:2] = 1
        observed[0:2, 0:2] = np.array([[0, 1], [0, 1]], dtype=np.uint8)
        return predicted, valid, observed, coverage

    def test_categories_distinguish_agreement_and_both_error_directions(self):
        categories = MODULE.classify(*self.arrays())
        self.assertEqual(categories[0:2, 0:2].tolist(), [[0, 1], [2, 3]])
        self.assertEqual(
            MODULE.category_counts(categories),
            {
                "knownDryAgreementCellCount": 1,
                "truePositiveCellCount": 1,
                "falsePositiveCellCount": 1,
                "falseNegativeCellCount": 1,
                "outsideEvaluationCellCount": categories.size - 4,
            },
        )

    def test_missing_prediction_and_reference_disagreement_fail_closed(self):
        predicted, valid, observed, coverage = self.arrays()
        predicted[0, 0] = MODULE.evaluation.NO_DATA
        with self.assertRaisesRegex(ValueError, "Prediction is missing"):
            MODULE.classify(predicted, valid, observed, coverage)

        predicted, valid, observed, coverage = self.arrays()
        observed[0, 0] = MODULE.evaluation.NO_DATA
        with self.assertRaisesRegex(ValueError, "coverage and missing state disagree"):
            MODULE.classify(predicted, valid, observed, coverage)

    def test_invalid_encodings_and_domain_mismatch_fail_closed(self):
        for index, label in enumerate(
            (
                "Prediction mask",
                "Valid-prediction mask",
                "Reference mask",
                "Reference-coverage mask",
            )
        ):
            arrays = list(self.arrays())
            arrays[index][0, 0] = 2
            with self.assertRaisesRegex(ValueError, label):
                MODULE.classify(*arrays)

        predicted, valid, observed, coverage = self.arrays()
        coverage[0, 0] = 0
        observed[0, 0] = MODULE.evaluation.NO_DATA
        predicted[0, 0] = MODULE.evaluation.NO_DATA
        with self.assertRaisesRegex(ValueError, "Prediction is missing"):
            MODULE.classify(predicted, valid, observed, coverage)

        predicted, valid, observed, coverage = self.arrays()
        predicted[2, 2] = 0
        with self.assertRaisesRegex(ValueError, "frozen diagnostic domain"):
            MODULE.classify(predicted, valid, observed, coverage)

    def test_png_and_svg_are_deterministic_and_self_contained(self):
        categories = MODULE.classify(*self.arrays())
        png = MODULE.png_bytes(categories)
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual(png, MODULE.png_bytes(categories))
        panel = {
            "referenceId": "ea-recorded-flood-outlines-carlisle-2015",
            "counts": MODULE.category_counts(categories),
            "png": png,
        }
        svg = MODULE.svg_bytes([panel])
        self.assertIn(b"data:image/png;base64,", svg)
        self.assertIn(b"False positive", svg)
        self.assertNotIn(b'href="http', svg)

    def test_dry_run_loads_no_artifact_and_runs_no_evaluation(self):
        result = MODULE.plan()
        self.assertEqual(result["predictionArtifactsLoaded"], 0)
        self.assertEqual(result["referenceArtifactsLoaded"], 0)
        self.assertEqual(result["filesWritten"], 0)
        self.assertEqual(result["evaluationRuns"], 0)
        self.assertEqual(result["networkRequests"], 0)


if __name__ == "__main__":
    unittest.main()
