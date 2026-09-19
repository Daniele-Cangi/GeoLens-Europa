import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np


MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "evaluate_cumbria_blind_prediction.py"
SPEC = importlib.util.spec_from_file_location("evaluate_cumbria_blind_prediction", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CumbriaBlindEvaluationTests(unittest.TestCase):
    def setUp(self):
        shape = (MODULE.GRID["height"], MODULE.GRID["width"])
        self.valid = np.zeros(shape, dtype=np.uint8)
        self.valid[10:20, 10:20] = 1
        self.predicted = np.full(shape, MODULE.NO_DATA, dtype=np.uint8)
        self.predicted[self.valid == 1] = 0
        self.reference = np.zeros(shape, dtype=np.uint8)
        self.coverage = np.ones(shape, dtype=np.uint8)

    def test_dry_run_opens_no_prediction_or_reference(self):
        result = MODULE.plan()
        self.assertEqual(result["referenceIds"], MODULE.REFERENCE_IDS)
        self.assertEqual(result["metricIds"], MODULE.METRIC_IDS)
        self.assertEqual(result["predictionArtifactsLoaded"], 0)
        self.assertEqual(result["referenceArtifactsLoaded"], 0)
        self.assertEqual(result["evaluationRuns"], 0)

    def test_current_manifest_preserves_the_pending_evaluation_contract(self):
        manifest = MODULE.json.loads(MODULE.MANIFEST_PATH.read_text(encoding="utf-8"))
        MODULE.validate_manifest(manifest)

    def test_manifest_protocol_drift_is_rejected_even_if_recorded_hash_is_unchanged(self):
        manifest = MODULE.json.loads(MODULE.MANIFEST_PATH.read_text(encoding="utf-8"))
        changed = copy.deepcopy(manifest)
        changed["evaluationProtocol"]["metrics"][0]["unit"] = "percent"
        with self.assertRaisesRegex(ValueError, "contract drifted"):
            MODULE.validate_manifest(changed)

    def test_normalization_linkage_drift_is_rejected_before_artifacts_open(self):
        manifest = MODULE.json.loads(MODULE.MANIFEST_PATH.read_text(encoding="utf-8"))
        changed = copy.deepcopy(manifest)
        changed["evaluationReferenceNormalization"]["sourceReceiptSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "contract drifted"):
            MODULE.validate_manifest(changed)

    def test_execution_stays_blocked_without_a_pinned_executor_authorization(self):
        manifest = MODULE.json.loads(MODULE.MANIFEST_PATH.read_text(encoding="utf-8"))
        with self.assertRaisesRegex(ValueError, "has not been authorized"):
            MODULE.validate_execution_authorization(manifest, "0" * 64)

    def test_execution_authorization_binds_every_external_identity_and_executor_byte(self):
        executor_sha256 = hashlib.sha256(MODULE_PATH.read_bytes()).hexdigest()
        manifest = {
            "evaluationExecutionAuthorization": {
                "schemaVersion": MODULE.AUTHORIZATION_SCHEMA,
                "state": "authorized_for_single_blind_evaluation",
                "protocolSha256": MODULE.PROTOCOL_SHA256,
                "predictionReceiptSha256": MODULE.PREDICTION_RECEIPT_SHA256,
                "referenceReceiptSha256": MODULE.REFERENCE_RECEIPT_SHA256,
                "executor": {
                    "relativePath": MODULE.EXECUTOR_RELATIVE_PATH,
                    "sha256": executor_sha256,
                    "frozenCommit": "0" * 40,
                },
            }
        }
        MODULE.validate_execution_authorization(manifest, executor_sha256)
        manifest["evaluationExecutionAuthorization"]["referenceReceiptSha256"] = "1" * 64
        with self.assertRaisesRegex(ValueError, "authorization drifted"):
            MODULE.validate_execution_authorization(manifest, executor_sha256)

    def test_exact_match_has_perfect_overlap_and_zero_boundary_distance(self):
        self.predicted[12:16, 12:16] = 1
        self.reference[12:16, 12:16] = 1
        result = MODULE.evaluate_reference(
            self.predicted,
            self.valid,
            self.reference,
            self.coverage,
        )
        self.assertEqual(result["metrics"]["intersection_over_union"]["value"], 1)
        self.assertEqual(result["metrics"]["area_precision"]["value"], 1)
        self.assertEqual(result["metrics"]["area_recall"]["value"], 1)
        self.assertEqual(result["metrics"]["false_positive_area"]["value"], 0)
        self.assertEqual(result["metrics"]["false_negative_area"]["value"], 0)
        self.assertEqual(result["metrics"]["boundary_distance_p95"]["value"], 0)

    def test_overlap_metrics_use_only_frozen_domain_and_observed_coverage(self):
        self.predicted[12:14, 12:14] = 1
        self.reference[12:14, 13:15] = 1
        self.coverage[10, 10] = 0
        self.reference[10, 10] = MODULE.NO_DATA
        result = MODULE.evaluate_reference(
            self.predicted,
            self.valid,
            self.reference,
            self.coverage,
        )
        self.assertEqual(result["coverage"]["evaluatedCellCount"], 99)
        self.assertEqual(
            result["coverage"]["excludedMissingObservedCoverageCellCount"],
            1,
        )
        self.assertEqual(result["contingency"]["intersectionCellCount"], 2)
        self.assertEqual(result["contingency"]["unionCellCount"], 6)
        self.assertAlmostEqual(
            result["metrics"]["intersection_over_union"]["value"],
            1 / 3,
        )
        self.assertEqual(result["metrics"]["false_positive_area"]["value"], 800)
        self.assertEqual(result["metrics"]["false_negative_area"]["value"], 800)

    def test_boundary_distance_uses_symmetric_exposed_cell_edges(self):
        self.predicted[12, 12] = 1
        self.reference[12, 14] = 1
        result = MODULE.evaluate_reference(
            self.predicted,
            self.valid,
            self.reference,
            self.coverage,
        )
        self.assertEqual(result["metrics"]["boundary_distance_p95"]["value"], 40)
        self.assertEqual(result["metrics"]["boundary_distance_p95"]["sampleCount"], 8)

    def test_boundary_distance_does_not_treat_unknown_neighbors_as_dry(self):
        wet = np.zeros_like(self.valid, dtype=bool)
        known = np.zeros_like(self.valid, dtype=bool)
        wet[12, 12] = True
        known[12, 12] = True
        known[12, 13] = True
        segments = MODULE.boundary_segments(wet, known)
        self.assertEqual(len(segments), 1)

    def test_missing_prediction_inside_frozen_domain_blocks_evaluation(self):
        self.predicted[12, 12] = MODULE.NO_DATA
        with self.assertRaisesRegex(ValueError, "missing inside the frozen evaluation domain"):
            MODULE.evaluate_reference(
                self.predicted,
                self.valid,
                self.reference,
                self.coverage,
            )

    def test_reference_missing_state_must_match_coverage(self):
        self.reference[12, 12] = MODULE.NO_DATA
        with self.assertRaisesRegex(ValueError, "coverage disagree"):
            MODULE.evaluate_reference(
                self.predicted,
                self.valid,
                self.reference,
                self.coverage,
            )

    def test_receipt_write_is_idempotent_and_durable(self):
        receipt = {"schemaVersion": MODULE.OUTPUT_SCHEMA, "receiptSha256": "0" * 64}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "evaluation-references").mkdir()
            MODULE.write_receipt(root, receipt)
            path = root / "evaluation-references" / MODULE.OUTPUT_RECEIPT_NAME
            expected = (MODULE.json.dumps(receipt, indent=2, ensure_ascii=False) + "\n").encode(
                "utf-8"
            )
            self.assertEqual(path.read_bytes(), expected)
            MODULE.write_receipt(root, receipt)
            with self.assertRaisesRegex(ValueError, "receipt drifted"):
                MODULE.write_receipt(root, {**receipt, "receiptSha256": "1" * 64})

    def test_empty_wet_denominators_are_explicitly_undefined(self):
        result = MODULE.evaluate_reference(
            self.predicted,
            self.valid,
            self.reference,
            self.coverage,
        )
        self.assertIsNone(result["metrics"]["intersection_over_union"]["value"])
        self.assertIsNone(result["metrics"]["area_precision"]["value"])
        self.assertIsNone(result["metrics"]["area_recall"]["value"])
        self.assertIsNone(result["metrics"]["boundary_distance_p95"]["value"])


if __name__ == "__main__":
    unittest.main()
