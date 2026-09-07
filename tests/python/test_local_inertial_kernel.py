from __future__ import annotations

from pathlib import Path
import sys
import unittest

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


if __name__ == "__main__":
    unittest.main()
