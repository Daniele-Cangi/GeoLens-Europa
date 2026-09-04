"""A small, inspectable two-dimensional local-inertial surface-flow kernel.

The implementation follows the staggered-grid ACC formulation described for
LISFLOOD-FP 8.0 (Shaw et al., 2021, doi:10.5194/gmd-14-3577-2021). It
intentionally implements only the numerical contract
frozen for the Cumbria benchmark: cell-centred depths, face-centred unit
discharges, semi-implicit Manning friction, adaptive CFL timesteps and explicit
mass accounting. It is not a calibrated flood model.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Sequence

import numpy as np
from numpy.typing import NDArray


FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]


class LocalInertialError(RuntimeError):
    """Base error for invalid inputs or an invalid numerical state."""


class TimeStepBelowMinimumError(LocalInertialError):
    """Raised when stability or exact time alignment requires too small a step."""


@dataclass(frozen=True)
class LocalInertialParameters:
    cell_size_m: float
    manning_n: float | FloatArray
    gravity_m_s2: float = 9.80665
    cfl: float = 0.7
    min_timestep_s: float = 0.05
    max_timestep_s: float = 5.0
    minimum_wet_depth_m: float = 0.001
    absolute_mass_tolerance_m3: float = 0.001
    relative_mass_tolerance: float = 1e-6


@dataclass(frozen=True)
class ForcingInterval:
    start_s: float
    end_s: float
    rainfall_rate_m_s: float | FloatArray = 0.0
    river_inflow_m3_s: float | FloatArray = 0.0


@dataclass(frozen=True)
class MassBalance:
    initial_storage_m3: float
    rainfall_input_m3: float
    river_input_m3: float
    boundary_output_m3: float
    final_storage_m3: float
    residual_m3: float
    tolerance_m3: float


@dataclass(frozen=True)
class LocalInertialResult:
    final_depth_m: FloatArray
    final_qx_m2_s: FloatArray
    final_qy_m2_s: FloatArray
    output_times_s: tuple[float, ...]
    depth_snapshots_m: tuple[FloatArray, ...]
    timestep_history_s: tuple[float, ...]
    mass_balance: MassBalance


_NUMERIC_DEPTH_TOLERANCE_M = 1e-12
_TIME_TOLERANCE_S = 1e-9


def _as_grid(value: float | FloatArray, shape: tuple[int, int], name: str) -> FloatArray:
    if np.isscalar(value):
        return np.full(shape, float(value), dtype=np.float64)
    grid = np.asarray(value, dtype=np.float64)
    if grid.shape != shape:
        raise LocalInertialError(f"{name} shape {grid.shape} does not match terrain {shape}")
    return grid.copy()


def _validate_parameters(parameters: LocalInertialParameters) -> None:
    positive = {
        "cell_size_m": parameters.cell_size_m,
        "gravity_m_s2": parameters.gravity_m_s2,
        "cfl": parameters.cfl,
        "min_timestep_s": parameters.min_timestep_s,
        "max_timestep_s": parameters.max_timestep_s,
        "minimum_wet_depth_m": parameters.minimum_wet_depth_m,
        "absolute_mass_tolerance_m3": parameters.absolute_mass_tolerance_m3,
        "relative_mass_tolerance": parameters.relative_mass_tolerance,
    }
    for name, value in positive.items():
        if not math.isfinite(value) or value <= 0.0:
            raise LocalInertialError(f"{name} must be finite and positive")
    if parameters.min_timestep_s > parameters.max_timestep_s:
        raise LocalInertialError("min_timestep_s cannot exceed max_timestep_s")


def _validate_forcing(
    forcing: Sequence[ForcingInterval],
    duration_s: float,
    shape: tuple[int, int],
    valid: BoolArray,
) -> tuple[tuple[ForcingInterval, FloatArray, FloatArray], ...]:
    if not forcing:
        raise LocalInertialError("at least one forcing interval is required")

    prepared: list[tuple[ForcingInterval, FloatArray, FloatArray]] = []
    cursor = 0.0
    for index, frame in enumerate(forcing):
        if not math.isfinite(frame.start_s) or abs(frame.start_s - cursor) > _TIME_TOLERANCE_S:
            raise LocalInertialError(
                f"forcing interval {index} does not begin at the preceding end time"
            )
        if not math.isfinite(frame.end_s) or frame.end_s <= frame.start_s:
            raise LocalInertialError(f"forcing interval {index} has an invalid end time")

        rain = _as_grid(frame.rainfall_rate_m_s, shape, "rainfall_rate_m_s")
        river = _as_grid(frame.river_inflow_m3_s, shape, "river_inflow_m3_s")
        for name, grid in (("rainfall_rate_m_s", rain), ("river_inflow_m3_s", river)):
            if np.any(~np.isfinite(grid[valid])):
                raise LocalInertialError(f"{name} contains missing or non-finite evidence")
            if np.any(grid[valid] < 0.0):
                raise LocalInertialError(f"{name} cannot be negative")
            if np.any(np.nan_to_num(grid[~valid], nan=0.0) != 0.0):
                raise LocalInertialError(f"{name} must be zero outside valid terrain")
            grid[~valid] = 0.0

        prepared.append((frame, rain, river))
        cursor = frame.end_s

    if abs(cursor - duration_s) > _TIME_TOLERANCE_S:
        raise LocalInertialError("forcing intervals must cover the complete simulation duration")
    return tuple(prepared)


def _internal_face_discharge(
    q_old: FloatArray,
    eta_left: FloatArray,
    eta_right: FloatArray,
    z_left: FloatArray,
    z_right: FloatArray,
    n_face: FloatArray,
    valid_face: BoolArray,
    timestep_s: float,
    parameters: LocalInertialParameters,
) -> FloatArray:
    face_depth = np.maximum(eta_left, eta_right) - np.maximum(z_left, z_right)
    wet = valid_face & (face_depth >= parameters.minimum_wet_depth_m)
    result = np.zeros_like(q_old)
    if not np.any(wet):
        return result

    h = face_depth[wet]
    q = q_old[wet]
    surface_gradient = (eta_right[wet] - eta_left[wet]) / parameters.cell_size_m
    numerator = q - parameters.gravity_m_s2 * h * timestep_s * surface_gradient
    denominator = (
        1.0
        + parameters.gravity_m_s2
        * timestep_s
        * np.square(n_face[wet])
        * np.abs(q)
        / np.power(h, 7.0 / 3.0)
    )
    result[wet] = numerator / denominator
    return result


def _update_discharge(
    depth: FloatArray,
    elevation: FloatArray,
    valid: BoolArray,
    qx: FloatArray,
    qy: FloatArray,
    manning: FloatArray,
    timestep_s: float,
    parameters: LocalInertialParameters,
) -> tuple[FloatArray, FloatArray]:
    rows, columns = depth.shape
    eta = elevation + np.nan_to_num(depth, nan=0.0)
    next_qx = np.zeros((rows, columns + 1), dtype=np.float64)
    next_qy = np.zeros((rows + 1, columns), dtype=np.float64)

    if columns > 1:
        valid_x = valid[:, :-1] & valid[:, 1:]
        n_x = 0.5 * (manning[:, :-1] + manning[:, 1:])
        next_qx[:, 1:columns] = _internal_face_discharge(
            qx[:, 1:columns],
            eta[:, :-1],
            eta[:, 1:],
            elevation[:, :-1],
            elevation[:, 1:],
            n_x,
            valid_x,
            timestep_s,
            parameters,
        )

    if rows > 1:
        valid_y = valid[:-1, :] & valid[1:, :]
        n_y = 0.5 * (manning[:-1, :] + manning[1:, :])
        next_qy[1:rows, :] = _internal_face_discharge(
            qy[1:rows, :],
            eta[:-1, :],
            eta[1:, :],
            elevation[:-1, :],
            elevation[1:, :],
            n_y,
            valid_y,
            timestep_s,
            parameters,
        )

    # Free outflow: preserve only the outward component of the adjacent
    # internal face. External inflow is never introduced by the boundary.
    if columns > 1:
        next_qx[:, 0] = np.where(valid[:, 0], np.minimum(next_qx[:, 1], 0.0), 0.0)
        next_qx[:, columns] = np.where(
            valid[:, -1], np.maximum(next_qx[:, columns - 1], 0.0), 0.0
        )
    if rows > 1:
        next_qy[0, :] = np.where(valid[0, :], np.minimum(next_qy[1, :], 0.0), 0.0)
        next_qy[rows, :] = np.where(
            valid[-1, :], np.maximum(next_qy[rows - 1, :], 0.0), 0.0
        )
    return next_qx, next_qy


def _limit_outgoing_fluxes(
    available_depth_m: FloatArray,
    valid: BoolArray,
    qx: FloatArray,
    qy: FloatArray,
    timestep_s: float,
    cell_size_m: float,
) -> None:
    outgoing = (
        np.maximum(-qx[:, :-1], 0.0)
        + np.maximum(qx[:, 1:], 0.0)
        + np.maximum(-qy[:-1, :], 0.0)
        + np.maximum(qy[1:, :], 0.0)
    )
    potential_export_depth = outgoing * timestep_s / cell_size_m
    scale = np.ones_like(available_depth_m)
    draining = valid & (potential_export_depth > available_depth_m) & (potential_export_depth > 0.0)
    scale[draining] = available_depth_m[draining] / potential_export_depth[draining]

    rows, columns = available_depth_m.shape
    if columns > 1:
        faces = qx[:, 1:columns]
        faces[:] = np.where(
            faces >= 0.0,
            faces * scale[:, :-1],
            faces * scale[:, 1:],
        )
    qx[:, 0] *= scale[:, 0]
    qx[:, columns] *= scale[:, -1]

    if rows > 1:
        faces = qy[1:rows, :]
        faces[:] = np.where(
            faces >= 0.0,
            faces * scale[:-1, :],
            faces * scale[1:, :],
        )
    qy[0, :] *= scale[0, :]
    qy[rows, :] *= scale[-1, :]


def _boundary_output_volume(
    qx: FloatArray,
    qy: FloatArray,
    timestep_s: float,
    cell_size_m: float,
) -> float:
    outward_unit_discharge = (
        np.maximum(-qx[:, 0], 0.0).sum()
        + np.maximum(qx[:, -1], 0.0).sum()
        + np.maximum(-qy[0, :], 0.0).sum()
        + np.maximum(qy[-1, :], 0.0).sum()
    )
    return float(outward_unit_discharge * cell_size_m * timestep_s)


def _stable_timestep(depth: FloatArray, valid: BoolArray, parameters: LocalInertialParameters) -> float:
    maximum_depth = float(np.max(depth[valid], initial=0.0))
    if maximum_depth <= parameters.minimum_wet_depth_m:
        return parameters.max_timestep_s
    return min(
        parameters.max_timestep_s,
        parameters.cfl
        * parameters.cell_size_m
        / math.sqrt(parameters.gravity_m_s2 * maximum_depth),
    )


def _mass_tolerance(
    parameters: LocalInertialParameters,
    initial_storage_m3: float,
    rainfall_input_m3: float,
    river_input_m3: float,
) -> float:
    reference_volume = max(initial_storage_m3 + rainfall_input_m3 + river_input_m3, 1.0)
    return max(
        parameters.absolute_mass_tolerance_m3,
        parameters.relative_mass_tolerance * reference_volume,
    )


def run_local_inertial(
    elevation_m: FloatArray,
    forcing: Sequence[ForcingInterval],
    duration_s: float,
    output_interval_s: float,
    parameters: LocalInertialParameters,
    *,
    initial_depth_m: FloatArray | None = None,
) -> LocalInertialResult:
    """Run the frozen local-inertial kernel on a regular square grid.

    ``NaN`` elevation cells are outside the computational domain and every face
    touching one is closed. Rainfall and river forcings are explicit rates over
    each forcing interval; missing values on valid terrain are rejected.
    """

    _validate_parameters(parameters)
    if not math.isfinite(duration_s) or duration_s <= 0.0:
        raise LocalInertialError("duration_s must be finite and positive")
    if not math.isfinite(output_interval_s) or output_interval_s <= 0.0:
        raise LocalInertialError("output_interval_s must be finite and positive")

    elevation = np.asarray(elevation_m, dtype=np.float64).copy()
    if elevation.ndim != 2 or elevation.size == 0:
        raise LocalInertialError("elevation_m must be a non-empty two-dimensional grid")
    valid = np.isfinite(elevation)
    if not np.any(valid):
        raise LocalInertialError("elevation_m contains no valid terrain cells")
    shape = elevation.shape

    manning = _as_grid(parameters.manning_n, shape, "manning_n")
    if np.any(~np.isfinite(manning[valid])) or np.any(manning[valid] <= 0.0):
        raise LocalInertialError("manning_n must be finite and positive on valid terrain")
    manning[~valid] = 0.0

    if initial_depth_m is None:
        depth = np.zeros(shape, dtype=np.float64)
    else:
        depth = np.asarray(initial_depth_m, dtype=np.float64).copy()
        if depth.shape != shape:
            raise LocalInertialError("initial_depth_m shape does not match elevation_m")
        if np.any(~np.isfinite(depth[valid])) or np.any(depth[valid] < 0.0):
            raise LocalInertialError("initial_depth_m must be finite and non-negative")
    depth[~valid] = np.nan

    prepared_forcing = _validate_forcing(forcing, duration_s, shape, valid)
    rows, columns = shape
    qx = np.zeros((rows, columns + 1), dtype=np.float64)
    qy = np.zeros((rows + 1, columns), dtype=np.float64)
    cell_area_m2 = parameters.cell_size_m**2
    initial_storage_m3 = float(np.sum(depth[valid]) * cell_area_m2)
    rainfall_input_m3 = 0.0
    river_input_m3 = 0.0
    boundary_output_m3 = 0.0

    current_time_s = 0.0
    frame_index = 0
    next_output_s = min(output_interval_s, duration_s)
    output_times: list[float] = []
    snapshots: list[FloatArray] = []
    timestep_history: list[float] = []

    while current_time_s < duration_s - _TIME_TOLERANCE_S:
        frame, rain_rate, river_rate = prepared_forcing[frame_index]
        if current_time_s >= frame.end_s - _TIME_TOLERANCE_S:
            frame_index += 1
            continue

        stable_limit_s = _stable_timestep(depth, valid, parameters)
        if stable_limit_s < parameters.min_timestep_s - _TIME_TOLERANCE_S:
            raise TimeStepBelowMinimumError(
                f"CFL timestep {stable_limit_s:.9f}s is below minimum "
                f"{parameters.min_timestep_s:.9f}s"
            )

        segment_end_s = min(frame.end_s, next_output_s, duration_s)
        remaining_s = segment_end_s - current_time_s
        step_count = max(1, math.ceil((remaining_s - _TIME_TOLERANCE_S) / stable_limit_s))
        timestep_s = remaining_s / step_count
        if timestep_s < parameters.min_timestep_s - _TIME_TOLERANCE_S:
            raise TimeStepBelowMinimumError(
                f"exact source/output alignment requires {timestep_s:.9f}s, below minimum "
                f"{parameters.min_timestep_s:.9f}s"
            )

        qx, qy = _update_discharge(
            depth,
            elevation,
            valid,
            qx,
            qy,
            manning,
            timestep_s,
            parameters,
        )

        rain_depth = rain_rate * timestep_s
        river_depth = river_rate * timestep_s / cell_area_m2
        source_depth = np.nan_to_num(depth, nan=0.0) + rain_depth + river_depth
        _limit_outgoing_fluxes(
            source_depth,
            valid,
            qx,
            qy,
            timestep_s,
            parameters.cell_size_m,
        )

        next_depth = source_depth + timestep_s / parameters.cell_size_m * (
            qx[:, :-1] - qx[:, 1:] + qy[:-1, :] - qy[1:, :]
        )
        minimum_depth = float(np.min(next_depth[valid]))
        if minimum_depth < -_NUMERIC_DEPTH_TOLERANCE_M:
            raise LocalInertialError(
                f"negative water depth {minimum_depth:.12g}m exceeds numeric tolerance"
            )
        next_depth[(next_depth < 0.0) & valid] = 0.0
        next_depth[~valid] = np.nan
        depth = next_depth

        rainfall_input_m3 += float(np.sum(rain_rate[valid]) * cell_area_m2 * timestep_s)
        river_input_m3 += float(np.sum(river_rate[valid]) * timestep_s)
        boundary_output_m3 += _boundary_output_volume(
            qx, qy, timestep_s, parameters.cell_size_m
        )
        current_time_s += timestep_s
        timestep_history.append(timestep_s)

        storage_m3 = float(np.sum(depth[valid]) * cell_area_m2)
        residual_m3 = (
            initial_storage_m3
            + rainfall_input_m3
            + river_input_m3
            - boundary_output_m3
            - storage_m3
        )
        tolerance_m3 = _mass_tolerance(
            parameters, initial_storage_m3, rainfall_input_m3, river_input_m3
        )
        if abs(residual_m3) > tolerance_m3:
            raise LocalInertialError(
                f"mass-balance residual {residual_m3:.12g}m3 exceeds {tolerance_m3:.12g}m3"
            )

        if abs(current_time_s - next_output_s) <= _TIME_TOLERANCE_S:
            output_times.append(current_time_s)
            snapshots.append(depth.copy())
            next_output_s = min(next_output_s + output_interval_s, duration_s)

    final_storage_m3 = float(np.sum(depth[valid]) * cell_area_m2)
    residual_m3 = (
        initial_storage_m3
        + rainfall_input_m3
        + river_input_m3
        - boundary_output_m3
        - final_storage_m3
    )
    tolerance_m3 = _mass_tolerance(
        parameters, initial_storage_m3, rainfall_input_m3, river_input_m3
    )
    return LocalInertialResult(
        final_depth_m=depth,
        final_qx_m2_s=qx,
        final_qy_m2_s=qy,
        output_times_s=tuple(output_times),
        depth_snapshots_m=tuple(snapshots),
        timestep_history_s=tuple(timestep_history),
        mass_balance=MassBalance(
            initial_storage_m3=initial_storage_m3,
            rainfall_input_m3=rainfall_input_m3,
            river_input_m3=river_input_m3,
            boundary_output_m3=boundary_output_m3,
            final_storage_m3=final_storage_m3,
            residual_m3=residual_m3,
            tolerance_m3=tolerance_m3,
        ),
    )
