import importlib.util
import copy
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from shapely.geometry import box


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPOSITORY_ROOT / "scripts" / "materialize_cumbria_evaluation_masks.py"
SPEC = importlib.util.spec_from_file_location("materialize_cumbria_evaluation_masks", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CumbriaEvaluationMaskMaterializerTests(unittest.TestCase):
    def test_current_manifest_preserves_the_completed_normalization_gate(self):
        manifest = MODULE.json.loads(MODULE.MANIFEST_PATH.read_text(encoding="utf-8"))
        MODULE.validate_manifest(manifest)

    def test_completed_gate_rejects_stale_or_malformed_manifest_linkage(self):
        manifest = json.loads(MODULE.MANIFEST_PATH.read_text(encoding="utf-8"))
        mutations = [
            ("schema", lambda value: value["evaluationReferenceNormalization"].__setitem__("schemaVersion", "stale")),
            ("source", lambda value: value["evaluationReferenceNormalization"].__setitem__("sourceReceiptSha256", "0" * 64)),
            ("prediction", lambda value: value["evaluationReferenceNormalization"].__setitem__("predictionReceiptSha256", "0" * 64)),
            ("protocol", lambda value: value["evaluationReferenceNormalization"].__setitem__("protocolSha256", "0" * 64)),
            ("revision", lambda value: value["evaluationReferenceNormalization"]["materializationRevision"].__setitem__("commit", "0" * 40)),
        ]
        for label, mutate in mutations:
            with self.subTest(label=label):
                changed = copy.deepcopy(manifest)
                mutate(changed)
                with self.assertRaisesRegex(ValueError, "normalization gate drifted"):
                    MODULE.validate_manifest(changed)

    def test_check_rejects_a_self_rehashed_unpinned_receipt(self):
        manifest = json.loads(MODULE.MANIFEST_PATH.read_text(encoding="utf-8"))
        recorded = {
            "schemaVersion": MODULE.OUTPUT_SCHEMA,
            "receiptSha256": None,
            "materializationRevision": {
                "commit": "0" * 40,
                "tree": "0" * 40,
            },
        }
        recorded["receiptSha256"] = MODULE.canonical_identity(
            recorded,
            "receiptSha256",
        )
        with tempfile.TemporaryDirectory() as directory:
            data_root = Path(directory)
            receipt_directory = data_root / "evaluation-references"
            receipt_directory.mkdir(parents=True)
            (receipt_directory / MODULE.OUTPUT_RECEIPT_NAME).write_text(
                json.dumps(recorded),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "pinned manifest identity"):
                MODULE.check(data_root, manifest)

    def test_dry_run_opens_no_reference_and_runs_no_evaluation(self):
        result = MODULE.plan()
        self.assertEqual(result["referenceCount"], 3)
        self.assertEqual(result["sourceFilesOpened"], 0)
        self.assertEqual(result["predictionArtifactsLoaded"], 0)
        self.assertEqual(result["filesWritten"], 0)
        self.assertEqual(result["evaluationRuns"], 0)
        self.assertEqual(result["networkRequests"], 0)

    def test_rasterization_distinguishes_not_wet_from_missing_coverage(self):
        wet = box(332000, 562980, 332020, 563000)
        coverage = box(332000, 562980, 332040, 563000)
        mask_bytes, coverage_bytes, statistics = MODULE.rasterize_reference(wet, coverage)
        mask = np.frombuffer(mask_bytes, dtype=np.uint8)
        coverage_mask = np.frombuffer(coverage_bytes, dtype=np.uint8)
        self.assertEqual(mask.size, 140000)
        self.assertEqual(mask[:3].tolist(), [1, 0, 255])
        self.assertEqual(coverage_mask[:3].tolist(), [1, 1, 0])
        self.assertEqual(statistics["wetCellCount"], 1)
        self.assertEqual(statistics["referenceNotWetCellCount"], 1)
        self.assertEqual(statistics["missingCoverageCellCount"], 139998)

    def test_wet_geometry_outside_coverage_fails_closed(self):
        wet = box(332000, 562980, 332040, 563000)
        coverage = box(332000, 562980, 332020, 563000)
        with self.assertRaisesRegex(ValueError, "outside publisher coverage"):
            MODULE.rasterize_reference(wet, coverage)

    def test_cems_selection_rejects_non_flood_crisis_records(self):
        with self.assertRaisesRegex(ValueError, "non-flood crisis feature"):
            MODULE.validate_cems_flood_record(
                {
                    "act_id": "EMSR147",
                    "interpret": "Flooded Area",
                    "subtype": "not flood",
                },
                "fixture",
            )

    def test_data_root_rejects_repository_and_organization_onedrive(self):
        with self.assertRaisesRegex(ValueError, "outside the Git repository"):
            MODULE.ensure_external_data_root(REPOSITORY_ROOT / "data", REPOSITORY_ROOT)
        organization_onedrive = (
            Path(REPOSITORY_ROOT.anchor)
            / "Users"
            / "example"
            / "OneDrive - Example Org"
            / "cumbria"
        )
        with self.assertRaisesRegex(ValueError, "outside OneDrive"):
            MODULE.ensure_external_data_root(organization_onedrive, REPOSITORY_ROOT)


if __name__ == "__main__":
    unittest.main()
