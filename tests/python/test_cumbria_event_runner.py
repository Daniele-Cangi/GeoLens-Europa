from __future__ import annotations

import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPOSITORY_ROOT / "scripts" / "run_cumbria_public_event.py"
SPEC = importlib.util.spec_from_file_location("run_cumbria_public_event", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CumbriaEventRunnerTests(unittest.TestCase):
    def test_default_cli_mode_is_read_only_preflight(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            options = MODULE.parse_arguments(["--data-root", directory])

        self.assertFalse(options.freeze)
        self.assertFalse(options.execute)

    def test_bound_forcing_preserves_observed_zero_and_exact_source_timing(self) -> None:
        forcing = MODULE.BoundEventForcing(
            interval_count=2,
            interval_seconds=900.0,
            rainfall_amount_mm=np.array([[[0.0, 18.0]]]),
            rainfall_offsets=np.array([0, 1, 2], dtype=np.int64),
            rainfall_source_indices=np.array([0, 1], dtype=np.int64),
            rainfall_area_fractions=np.array([1.0, 1.0]),
            runoff_coefficient=np.array([[0.5, 1.0]]),
            river_excess_m3_s=np.array([4.0, 8.0]),
            river_cell_indices=np.array([1], dtype=np.int64),
            river_weights=np.array([1.0]),
            valid_mask=np.array([[True, True]]),
        )

        first = forcing[0]
        second = forcing[1]

        self.assertEqual((first.start_s, first.end_s), (0.0, 900.0))
        self.assertEqual((second.start_s, second.end_s), (900.0, 1800.0))
        self.assertEqual(first.rainfall_rate_m_s[0, 0], 0.0)
        self.assertAlmostEqual(first.rainfall_rate_m_s[0, 1], 18.0 / 1000 / 1800)
        self.assertTrue(np.array_equal(first.rainfall_rate_m_s, second.rainfall_rate_m_s))
        self.assertTrue(np.array_equal(first.river_inflow_m3_s, [[0.0, 4.0]]))
        self.assertTrue(np.array_equal(second.river_inflow_m3_s, [[0.0, 8.0]]))

    def test_bound_forcing_leaves_invalid_cells_zero(self) -> None:
        forcing = MODULE.BoundEventForcing(
            interval_count=1,
            interval_seconds=900.0,
            rainfall_amount_mm=np.array([[[12.0]]]),
            rainfall_offsets=np.array([0, 0, 1], dtype=np.int64),
            rainfall_source_indices=np.array([0], dtype=np.int64),
            rainfall_area_fractions=np.array([1.0]),
            runoff_coefficient=np.array([[-99.0, 0.5]]),
            river_excess_m3_s=np.array([0.0]),
            river_cell_indices=np.array([1], dtype=np.int64),
            river_weights=np.array([1.0]),
            valid_mask=np.array([[False, True]]),
        )

        frame = forcing[0]

        self.assertEqual(frame.rainfall_rate_m_s[0, 0], 0.0)
        self.assertGreater(frame.rainfall_rate_m_s[0, 1], 0.0)
        self.assertEqual(frame.river_inflow_m3_s[0, 0], 0.0)

    def test_receipt_verification_rejects_content_drift(self) -> None:
        payload = {"schemaVersion": "fixture-v0", "value": 1.0}
        receipt = dict(payload)
        receipt["receiptSha256"] = MODULE.sha256_json(payload)
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "receipt.json"
            target.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
            verified = MODULE.read_and_verify_receipt(
                target, receipt["receiptSha256"]
            )
            self.assertEqual(verified["value"], 1.0)

            drifted = dict(receipt)
            drifted["value"] = 2.0
            target.write_text(json.dumps(drifted, indent=2), encoding="utf-8")
            with self.assertRaisesRegex(MODULE.EventRunnerError, "content hash"):
                MODULE.read_and_verify_receipt(target, receipt["receiptSha256"])

    def test_artifact_verification_checks_compressed_and_decoded_identity(self) -> None:
        decoded = np.array([0.0, 1.5], dtype="<f8").tobytes()
        compressed = gzip.compress(decoded, compresslevel=9, mtime=0)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            relative = "solver-inputs/fixture.f64le.gz"
            target = root / relative
            target.parent.mkdir(parents=True)
            target.write_bytes(compressed)
            descriptor = {
                "relativePath": relative,
                "bytes": len(compressed),
                "decodedBytes": len(decoded),
                "sha256": MODULE.sha256_bytes(compressed),
                "contentSha256": MODULE.sha256_bytes(decoded),
            }

            self.assertEqual(MODULE.verify_artifact(root, descriptor, {}), decoded)
            descriptor["contentSha256"] = "0" * 64
            with self.assertRaisesRegex(MODULE.EventRunnerError, "content SHA-256"):
                MODULE.verify_artifact(root, descriptor, {})

    def test_contract_hash_excludes_only_its_identity(self) -> None:
        payload = {"schemaVersion": "contract-v0", "scenarioCount": 9}
        contract = dict(payload)
        contract["contractSha256"] = MODULE.sha256_json(payload)

        self.assertEqual(MODULE.contract_sha256(contract), contract["contractSha256"])
        contract["scenarioCount"] = 8
        with self.assertRaisesRegex(MODULE.EventRunnerError, "contract SHA-256"):
            MODULE.contract_sha256(contract)


if __name__ == "__main__":
    unittest.main()
