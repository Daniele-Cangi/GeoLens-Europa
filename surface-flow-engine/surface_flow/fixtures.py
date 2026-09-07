"""Deterministic, event-isolated verification fixtures for the surface kernel."""

from __future__ import annotations

from dataclasses import asdict
import hashlib
import json
from typing import Any

import numpy as np

from .local_inertial import (
    ForcingInterval,
    LocalInertialParameters,
    TimeStepBelowMinimumError,
    run_local_inertial,
)


IMPLEMENTATION_VERSION = "cumbria-local-inertial-surface-flow-v0.1.0"
FIXTURE_SUITE_VERSION = "local-inertial-fixtures-v0.1.0"


def _parameters(cell_size_m: float = 10.0) -> LocalInertialParameters:
    return LocalInertialParameters(cell_size_m=cell_size_m, manning_n=0.035)


def _rounded(value: float) -> float:
    return round(float(value), 12)


def run_fixture_suite() -> dict[str, Any]:
    """Run deterministic fixtures without reading benchmark or observed files."""

    cases: list[dict[str, Any]] = []

    # Hydrostatic equilibrium over a non-flat bed: equal water-surface elevation
    # must produce neither flux nor a changed depth field.
    lake_elevation = np.array([[0.0, 0.25, 0.5], [0.1, 0.35, 0.6]])
    lake_depth = 1.0 - lake_elevation
    lake = run_local_inertial(
        lake_elevation,
        [ForcingInterval(0.0, 20.0)],
        20.0,
        10.0,
        _parameters(),
        initial_depth_m=lake_depth,
    )
    lake_error = float(np.max(np.abs(lake.final_depth_m - lake_depth)))
    lake_flux = max(
        float(np.max(np.abs(lake.final_qx_m2_s))),
        float(np.max(np.abs(lake.final_qy_m2_s))),
    )
    if lake_error > 1e-12 or lake_flux > 1e-12:
        raise AssertionError("lake-at-rest fixture did not remain hydrostatic")
    cases.append(
        {
            "id": "lake_at_rest_variable_bed",
            "maximumDepthErrorM": _rounded(lake_error),
            "maximumFaceDischargeM2S": _rounded(lake_flux),
            "massResidualM3": _rounded(lake.mass_balance.residual_m3),
        }
    )

    # A single closed cell turns a uniform rainfall rate into an exact storage
    # increment. This distinguishes measured zero rain from absent evidence.
    rainfall_rate = 2.0e-5
    rain = run_local_inertial(
        np.array([[100.0]]),
        [ForcingInterval(0.0, 50.0, rainfall_rate_m_s=rainfall_rate)],
        50.0,
        25.0,
        _parameters(),
    )
    expected_depth = rainfall_rate * 50.0
    rain_error = abs(float(rain.final_depth_m[0, 0]) - expected_depth)
    if rain_error > 1e-12:
        raise AssertionError("closed-cell rainfall did not produce exact storage")
    cases.append(
        {
            "id": "closed_cell_uniform_rainfall",
            "expectedDepthM": _rounded(expected_depth),
            "actualDepthM": _rounded(rain.final_depth_m[0, 0]),
            "massResidualM3": _rounded(rain.mass_balance.residual_m3),
        }
    )

    # A west-to-east surface gradient must generate a non-trivial eastward flow
    # and eventually export water through the free-outflow boundary.
    drainage_elevation = np.tile(np.linspace(1.0, 0.0, 8), (3, 1))
    drainage_depth = np.zeros_like(drainage_elevation)
    drainage_depth[:, :2] = 0.12
    drainage = run_local_inertial(
        drainage_elevation,
        [ForcingInterval(0.0, 240.0)],
        240.0,
        60.0,
        _parameters(),
        initial_depth_m=drainage_depth,
    )
    if drainage.mass_balance.boundary_output_m3 <= 0.0:
        raise AssertionError("sloped drainage fixture produced no boundary outflow")
    if float(np.nanmin(drainage.final_depth_m)) < 0.0:
        raise AssertionError("sloped drainage fixture produced negative depth")
    cases.append(
        {
            "id": "sloped_free_outflow",
            "boundaryOutputM3": _rounded(drainage.mass_balance.boundary_output_m3),
            "finalStorageM3": _rounded(drainage.mass_balance.final_storage_m3),
            "massResidualM3": _rounded(drainage.mass_balance.residual_m3),
        }
    )

    # Forcing transitions (7, 13 s) and output boundaries (5 s) are deliberately
    # incommensurate. The stepper must split steps rather than smear a source.
    aligned = run_local_inertial(
        np.array([[0.0]]),
        [
            ForcingInterval(0.0, 7.0, rainfall_rate_m_s=1.0e-3),
            ForcingInterval(7.0, 13.0, rainfall_rate_m_s=2.0e-3),
            ForcingInterval(13.0, 20.0, rainfall_rate_m_s=0.0),
        ],
        20.0,
        5.0,
        _parameters(),
    )
    expected_aligned_depth = 0.001 * 7.0 + 0.002 * 6.0
    if abs(float(aligned.final_depth_m[0, 0]) - expected_aligned_depth) > 1e-12:
        raise AssertionError("forcing-boundary alignment changed integrated rainfall")
    if aligned.output_times_s != (5.0, 10.0, 15.0, 20.0):
        raise AssertionError("output snapshots were not emitted at exact boundaries")
    cases.append(
        {
            "id": "forcing_and_output_time_alignment",
            "outputTimesS": list(aligned.output_times_s),
            "finalDepthM": _rounded(aligned.final_depth_m[0, 0]),
            "massResidualM3": _rounded(aligned.mass_balance.residual_m3),
        }
    )

    # An intentionally extreme depth and cell size must fail instead of silently
    # stepping below the frozen minimum timestep.
    minimum_timestep_failed = False
    try:
        run_local_inertial(
            np.array([[0.0]]),
            [ForcingInterval(0.0, 1.0)],
            1.0,
            1.0,
            _parameters(cell_size_m=0.01),
            initial_depth_m=np.array([[1000.0]]),
        )
    except TimeStepBelowMinimumError:
        minimum_timestep_failed = True
    if not minimum_timestep_failed:
        raise AssertionError("below-minimum CFL fixture did not fail closed")
    cases.append({"id": "below_minimum_timestep", "expectedFailureObserved": True})

    payload: dict[str, Any] = {
        "implementationVersion": IMPLEMENTATION_VERSION,
        "fixtureSuiteVersion": FIXTURE_SUITE_VERSION,
        "isolation": {
            "realEventInputsRead": 0,
            "observedEvaluationGeometriesRead": 0,
            "networkCalls": 0,
            "externalWrites": 0,
        },
        "parameters": asdict(_parameters()),
        "cases": cases,
        "allPassed": True,
    }
    payload["resultSha256"] = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return payload
