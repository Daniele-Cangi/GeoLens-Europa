from __future__ import annotations

import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import numpy as np


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPOSITORY_ROOT / "scripts" / "run_cumbria_public_event.py"
SPEC = importlib.util.spec_from_file_location("run_cumbria_public_event", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CumbriaEventRunnerTests(unittest.TestCase):
    def artifact_descriptor(
        self, root: Path, relative: str, decoded: bytes
    ) -> dict[str, object]:
        compressed = gzip.compress(decoded, compresslevel=9, mtime=0)
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(compressed)
        return {
            "relativePath": relative,
            "bytes": len(compressed),
            "decodedBytes": len(decoded),
            "sha256": MODULE.sha256_bytes(compressed),
            "contentSha256": MODULE.sha256_bytes(decoded),
            "encoding": "fixture",
        }

    def checkpoint_fixture(
        self, root: Path
    ) -> tuple[dict[str, object], dict[str, object], dict[str, object], dict[str, object]]:
        scenario = {
            "scenarioId": "primary-20m",
            "meshId": "mesh-fixture",
            "runoffParameterSet": "primary",
            "roughnessParameterSet": "primary",
            "inflowFootprintSideMetres": 100,
        }
        eligible = np.array([[1, 0]], dtype="u1")
        maximum = np.array([[0.2, MODULE.FLOAT64_NODATA]], dtype="<f8")
        final = np.array([[0.1, MODULE.FLOAT64_NODATA]], dtype="<f8")
        time_of_maximum = np.array([[1, MODULE.UINT16_NODATA]], dtype="<u2")
        artifacts = {
            "maximumDepthM": self.artifact_descriptor(
                root, "predictions/maximum.gz", maximum.tobytes()
            ),
            "timeOfMaximumIndex": self.artifact_descriptor(
                root, "predictions/time.gz", time_of_maximum.tobytes()
            ),
            "finalDepthM": self.artifact_descriptor(
                root, "predictions/final.gz", final.tobytes()
            ),
            "validPredictionMask": self.artifact_descriptor(
                root, "predictions/valid.gz", eligible.tobytes()
            ),
        }
        for threshold in (0.01, 0.05, 0.1, 0.3):
            wet = np.array(
                [[int(maximum[0, 0] >= threshold), MODULE.UINT8_NODATA]],
                dtype="u1",
            )
            key = "wetMask" + str(threshold).replace("0.", "") + "m"
            artifacts[key] = self.artifact_descriptor(
                root, f"predictions/{key}.gz", wet.tobytes()
            )
        eligible_descriptor = self.artifact_descriptor(
            root, "solver-inputs/eligible.gz", eligible.tobytes()
        )
        context = {
            "root": root,
            "contractSha256": "a" * 64,
            "manifestSha256": "b" * 64,
            "decodedArtifacts": {},
            "solverReceipt": {
                "meshes": [
                    {
                        "id": "mesh-fixture",
                        "height": 1,
                        "width": 2,
                        "artifacts": {
                            "predictionEligibleMask": eligible_descriptor,
                        },
                    }
                ]
            },
            "contract": {
                "checkpoints": {
                    "schemaVersion": "cumbria-event-scenario-checkpoint-v0.1.0",
                    "directory": "prediction-checkpoints/prediction-v0",
                    "fileNameTemplate": "{checkpointDirectory}/{scenarioIndex:02d}-{scenarioId}.checkpoint.json",
                },
                "outputs": {
                    "predictionId": "prediction-v0",
                    "wetnessThresholdsM": [0.01, 0.05, 0.1, 0.3],
                },
                "scenarioPolicy": {"orderedScenarioIds": ["primary-20m"]},
                "schedule": {"outputCount": 2, "durationSeconds": 10.0},
                "numerics": {
                    "minimumTimeStepSeconds": 0.05,
                    "maximumTimeStepSeconds": 5.0,
                },
                "stability": {"timestepSumToleranceSeconds": 1e-6},
            },
        }
        authorization = {
            "authorizationSha256": "c" * 64,
            "git": {"commit": "d" * 40, "tree": "e" * 40, "branch": "main"},
            "inputReceiptSha256": {"eventInputBinding": "f" * 64},
        }
        result = {
            **scenario,
            "outputCount": 2,
            "timestep": {
                "count": 2,
                "minimumSeconds": 5.0,
                "maximumSeconds": 5.0,
                "sumSeconds": 10.0,
            },
            "massBalance": {
                "initialVolumeM3": 0.0,
                "rainfallExcessInputM3": 10.0,
                "riverExcessInputM3": 0.0,
                "boundaryOutflowM3": 4.0,
                "finalStorageM3": 6.0,
                "residualM3": 0.0,
                "toleranceM3": 0.001,
                "passed": True,
            },
            "predictionEligibleCellCount": 1,
            "maximumPredictedDepthM": 0.2,
            "artifacts": artifacts,
        }
        return context, authorization, scenario, result

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

    def test_checkpoint_round_trip_is_authorization_bound_and_verified(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            context, authorization, scenario, result = self.checkpoint_fixture(
                Path(directory)
            )
            checkpoint = MODULE.write_scenario_checkpoint(
                context, authorization, 0, scenario, result
            )
            restored = MODULE.read_scenario_checkpoint(
                context, authorization, 0, scenario
            )

        self.assertEqual(restored, result)
        self.assertEqual(
            checkpoint["checkpointSha256"],
            MODULE.sha256_json(
                {key: value for key, value in checkpoint.items() if key != "checkpointSha256"}
            ),
        )

    def test_checkpoint_rejects_artifact_byte_drift(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            context, authorization, scenario, result = self.checkpoint_fixture(root)
            MODULE.write_scenario_checkpoint(context, authorization, 0, scenario, result)
            target = root / result["artifacts"]["maximumDepthM"]["relativePath"]
            target.write_bytes(b"drift")

            with self.assertRaisesRegex(MODULE.EventRunnerError, "byte count drifted"):
                MODULE.read_scenario_checkpoint(context, authorization, 0, scenario)

    def test_execute_rejects_non_contiguous_checkpoint_sequence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scenarios = [
                {"scenarioId": "first"},
                {"scenarioId": "second"},
            ]
            context = {
                "root": root,
                "bindingReceipt": {"scenarioBindings": scenarios},
                "contract": {
                    "authorization": {"fileName": "authorization.json"},
                    "checkpoints": {
                        "directory": "checkpoints",
                        "fileNameTemplate": "{checkpointDirectory}/{scenarioIndex:02d}-{scenarioId}.checkpoint.json",
                    },
                },
            }
            second = MODULE.scenario_checkpoint_path(context, 1, scenarios[1])
            second.parent.mkdir(parents=True)
            second.write_text("{}", encoding="utf-8")

            with mock.patch.object(MODULE, "read_authorization", return_value={}):
                with self.assertRaisesRegex(MODULE.EventRunnerError, "contiguous prefix"):
                    MODULE.execute(context)

    def test_execute_reuses_verified_prefix_and_runs_only_missing_suffix(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scenarios = [
                {"scenarioId": "first"},
                {"scenarioId": "second"},
            ]
            context = {
                "root": root,
                "contractSha256": "a" * 64,
                "manifestSha256": "b" * 64,
                "bindingReceipt": {"scenarioBindings": scenarios},
                "contract": {
                    "checkpoints": {
                        "directory": "checkpoints",
                        "fileNameTemplate": "{checkpointDirectory}/{scenarioIndex:02d}-{scenarioId}.checkpoint.json",
                    },
                    "scenarioPolicy": {"orderedScenarioIds": ["first", "second"]},
                    "outputs": {
                        "predictionId": "prediction-v0",
                        "receiptFileName": "prediction.json",
                        "receiptSchemaVersion": "prediction-receipt-v0",
                    },
                },
            }
            first_path = MODULE.scenario_checkpoint_path(context, 0, scenarios[0])
            first_path.parent.mkdir(parents=True)
            first_path.write_text("{}", encoding="utf-8")
            authorization = {
                "authorizationSha256": "c" * 64,
                "git": {"commit": "d" * 40},
                "inputReceiptSha256": {"binding": "e" * 64},
            }
            first_result = {"scenarioId": "first"}
            second_result = {"scenarioId": "second"}

            with (
                mock.patch.object(
                    MODULE, "read_authorization", return_value=authorization
                ),
                mock.patch.object(
                    MODULE, "read_scenario_checkpoint", return_value=first_result
                ) as read_checkpoint,
                mock.patch.object(
                    MODULE, "run_scenario", return_value=second_result
                ) as run_scenario,
                mock.patch.object(MODULE, "write_scenario_checkpoint") as write_checkpoint,
                mock.patch.object(MODULE, "write_exclusive_json") as write_receipt,
            ):
                receipt = MODULE.execute(context)

        read_checkpoint.assert_called_once_with(
            context, authorization, 0, scenarios[0]
        )
        run_scenario.assert_called_once_with(context, scenarios[1])
        write_checkpoint.assert_called_once_with(
            context, authorization, 1, scenarios[1], second_result
        )
        write_receipt.assert_called_once()
        self.assertEqual(receipt["scenarios"], [first_result, second_result])


if __name__ == "__main__":
    unittest.main()
