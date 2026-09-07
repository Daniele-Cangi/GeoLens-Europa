from __future__ import annotations

from pathlib import Path
import sys
import unittest
from collections.abc import Sequence

import numpy as np


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ENGINE_ROOT = REPOSITORY_ROOT / "surface-flow-engine"
sys.path.insert(0, str(ENGINE_ROOT))

from surface_flow.fixtures import run_fixture_suite  # noqa: E402
from surface_flow.local_inertial import (  # noqa: E402
    ForcingInterval,
    LocalInertialError,
    LocalInertialParameters,
    TimeStepBelowMinimumError,
    run_local_inertial,
)


class LocalInertialKernelTest(unittest.TestCase):
    def setUp(self) -> None:
        self.parameters = LocalInertialParameters(cell_size_m=10.0, manning_n=0.035)

    def test_deterministic_fixture_suite(self) -> None:
        first = run_fixture_suite()
        second = run_fixture_suite()
        self.assertTrue(first["allPassed"])
        self.assertEqual(first, second)
        self.assertEqual(first["isolation"]["realEventInputsRead"], 0)
        self.assertEqual(first["isolation"]["observedEvaluationGeometriesRead"], 0)

    def test_missing_rainfall_is_rejected_not_converted_to_zero(self) -> None:
        with self.assertRaisesRegex(LocalInertialError, "missing or non-finite evidence"):
            run_local_inertial(
                np.zeros((1, 1)),
                [ForcingInterval(0.0, 10.0, rainfall_rate_m_s=np.array([[np.nan]]))],
                10.0,
                10.0,
                self.parameters,
            )

    def test_forcing_gaps_are_rejected(self) -> None:
        with self.assertRaisesRegex(LocalInertialError, "preceding end time"):
            run_local_inertial(
                np.zeros((1, 1)),
                [
                    ForcingInterval(0.0, 4.0),
                    ForcingInterval(5.0, 10.0),
                ],
                10.0,
                10.0,
                self.parameters,
            )

    def test_non_finite_forcing_boundary_is_rejected(self) -> None:
        with self.assertRaisesRegex(LocalInertialError, "preceding end time"):
            run_local_inertial(
                np.zeros((1, 1)),
                [ForcingInterval(float("nan"), 10.0)],
                10.0,
                10.0,
                self.parameters,
            )

    def test_cfl_below_frozen_minimum_fails_closed(self) -> None:
        with self.assertRaises(TimeStepBelowMinimumError):
            run_local_inertial(
                np.zeros((1, 1)),
                [ForcingInterval(0.0, 1.0)],
                1.0,
                1.0,
                LocalInertialParameters(cell_size_m=0.01, manning_n=0.035),
                initial_depth_m=np.array([[1000.0]]),
            )

    def test_lazy_forcing_and_streamed_outputs_do_not_retain_snapshots(self) -> None:
        class LazyForcing(Sequence[ForcingInterval]):
            def __init__(self) -> None:
                self.reads: list[int] = []

            def __len__(self) -> int:
                return 2

            def __getitem__(self, index: int) -> ForcingInterval:
                if index < 0 or index >= len(self):
                    raise IndexError(index)
                self.reads.append(index)
                return ForcingInterval(
                    start_s=float(index * 10),
                    end_s=float((index + 1) * 10),
                    rainfall_rate_m_s=np.full((2, 2), 1.0e-5 * (index + 1)),
                )

        forcing = LazyForcing()
        observed: list[tuple[float, float]] = []

        result = run_local_inertial(
            np.zeros((2, 2)),
            forcing,
            20.0,
            10.0,
            self.parameters,
            retain_depth_snapshots=False,
            output_observer=lambda time_s, depth: observed.append(
                (time_s, float(np.max(depth)))
            ),
        )

        self.assertEqual(result.depth_snapshots_m, ())
        self.assertEqual([item[0] for item in observed], [10.0, 20.0])
        self.assertAlmostEqual(observed[0][1], 0.0001)
        self.assertAlmostEqual(observed[1][1], 0.0003)
        self.assertEqual(forcing.reads, [0, 1, 0, 1])


if __name__ == "__main__":
    unittest.main()
