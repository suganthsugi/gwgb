"""Pure domain rules R1 – R9 (spec FR-005 – FR-013). No I/O, no caching (research D5).

All power values are MW. All times are tz-aware UTC ``pandas.Timestamp``.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd

from app.data import Snapshot

WINDOW_START = date(2026, 1, 2)
WINDOW_END = date(2026, 2, 1)
DEFAULT_CUTOFF = "09:00"
HISTORY_DAYS = 30

_HOUR = pd.Timedelta(hours=1)
_CUTOFF_RE = re.compile(r"^([01]\d|2[0-3]):00$")


def parse_cutoff(s: str) -> time:
    """``"HH:MM"`` on the hour, 00:00 – 23:00 (FR-030)."""
    if not isinstance(s, str) or not _CUTOFF_RE.match(s):
        raise ValueError("Decision time must be on the hour, 00:00–23:00.")
    return time(int(s[:2]), 0)


def _as_time(cutoff: str | time) -> time:
    return cutoff if isinstance(cutoff, time) else parse_cutoff(cutoff)


def day_start(day: date) -> pd.Timestamp:
    return pd.Timestamp(datetime(day.year, day.month, day.day), tz="UTC")


def cutoff_at(day: date, cutoff: str | time) -> pd.Timestamp:
    """The cutoff: decision time T on D-1, in UTC."""
    t = _as_time(cutoff)
    return day_start(day - timedelta(days=1)) + pd.Timedelta(hours=t.hour, minutes=t.minute)


def _day_rows(snapshot: Snapshot, day: date) -> pd.DataFrame:
    start = day_start(day)
    fc = snapshot.forecasts
    return fc[(fc["startTime"] >= start) & (fc["startTime"] < start + 24 * _HOUR)]


def _actual(snapshot: Snapshot, t: pd.Timestamp) -> float | None:
    value = snapshot.actuals.get(t)
    return None if value is None or pd.isna(value) else float(value)


# --- R1, R2 -----------------------------------------------------------------------------------


def select_forecast(snapshot: Snapshot, day: date, cutoff: str | time) -> dict:
    """R1: per hour of ``day``, the newest run published at or before the cutoff (research D3).

    Returns ``used_run``, ``minutes_before_cutoff`` and 24 ``points`` (empty when no run).
    """
    at = cutoff_at(day, cutoff)
    rows = _day_rows(snapshot, day)
    rows = rows[rows["publishTime"] <= at]
    if rows.empty:
        return {"used_run": None, "minutes_before_cutoff": None, "points": []}

    chosen = rows.sort_values("publishTime").groupby("startTime").last()
    used_run = chosen["publishTime"].max()
    points = []
    for h in range(24):
        t = day_start(day) + h * _HOUR
        actual = _actual(snapshot, t)
        if t in chosen.index:
            forecast = float(chosen.at[t, "generation"])
            publish = chosen.at[t, "publishTime"]
            horizon = (t - publish) / _HOUR
            error = forecast - actual if actual is not None else None
        else:
            forecast = publish = horizon = error = None
        points.append({
            "time": t, "forecast": forecast, "publishTime": publish, "horizonH": horizon,
            "actual": actual, "error": error,
        })
    return {
        "used_run": used_run,
        "minutes_before_cutoff": int((at - used_run) / pd.Timedelta(minutes=1)),
        "points": points,
    }


# --- R9 core metrics --------------------------------------------------------------------------


def summarize_metrics(errors, actuals, forecasts) -> dict | None:
    """MAE, bias, RMSE, P90 |error|, nMAE over hours with forecast and actual (FR-013)."""
    keep = [
        (e, a, f) for e, a, f in zip(errors, actuals, forecasts)
        if e is not None and a is not None and f is not None
    ]
    if not keep:
        return None
    e, a, f = (np.array(col, dtype=float) for col in zip(*keep))
    mae = float(np.mean(np.abs(e)))
    mean_actual = float(np.mean(a))
    return {
        "n": len(e),
        "mae": mae,
        "bias": float(np.mean(e)),
        "rmse": float(np.sqrt(np.mean(e**2))),
        "p90AbsError": float(np.quantile(np.abs(e), 0.9, method="linear")),
        "nmaePct": mae / mean_actual * 100 if mean_actual else None,
        "meanActual": mean_actual,
        "meanForecast": float(np.mean(f)),
    }


# --- R3: history (FR-007, research D5) --------------------------------------------------------


def history_for(
    snapshot: Snapshot, day: date, cutoff: str | time, history_days: int = HISTORY_DAYS
) -> dict:
    """R1 errors at the same cutoff for days D-(N+1) … D-2: the N most recent delivery days that
    had ended before the cutoff. D-1, D and later days are never used (constitution Art. II)."""
    source_days = [day - timedelta(days=k) for k in range(history_days + 1, 1, -1)]
    errors: list[float] = []
    by_hour: dict[int, list[float]] = {h: [] for h in range(24)}
    days = 0
    for src in source_days:
        points = select_forecast(snapshot, src, cutoff)["points"]
        scored = [p for p in points if p["error"] is not None]
        if scored:
            days += 1
        for p in scored:
            errors.append(p["error"])
            by_hour[p["time"].hour].append(p["error"])
    arr = np.array(errors, dtype=float)
    return {
        "source_days": source_days,
        "days": days,
        "n": len(errors),
        "bias": float(arr.mean()) if errors else None,
        "mae": float(np.abs(arr).mean()) if errors else None,
        "errors": errors,
        "by_hour": by_hour,
    }


def _q(values, q: float) -> float:
    return float(np.quantile(np.asarray(values, dtype=float), q, method="linear"))


# --- R4, R5: likely range (FR-008, FR-009) ----------------------------------------------------


def apply_band(points: list[dict], history: dict) -> list[dict]:
    """R4: low = forecast − q90(history@h), high = forecast − q10(history@h)."""
    out = []
    for p in points:
        hist = history["by_hour"].get(p["time"].hour, [])
        if p["forecast"] is None or not hist:
            low = high = None
        else:
            low = p["forecast"] - _q(hist, 0.9)
            high = p["forecast"] - _q(hist, 0.1)
        out.append({**p, "low": low, "high": high})
    return out


def overall_band(history: dict) -> dict | None:
    """R5: P10 / P90 of all history errors."""
    if not history["errors"]:
        return None
    return {"q10Error": _q(history["errors"], 0.1), "q90Error": _q(history["errors"], 0.9)}


# --- R7.4: comparing two runs (research D6) ---------------------------------------------------


def _run_series(rows: pd.DataFrame, publish: pd.Timestamp) -> pd.Series:
    run = rows[rows["publishTime"] == publish]
    return run.set_index("startTime")["generation"]


def compare_runs(snapshot: Snapshot, day: date, used_run: pd.Timestamp, basis: str) -> dict | None:
    """Compare the run in use with an earlier run over the hours of D both cover.

    ``basis="24h"``: the latest run published at least 24 h before ``used_run``; if none covers D,
    the previous run (reported as ``basis="previous"``). ``basis="previous"``: the latest earlier
    run that covers D.
    """
    rows = _day_rows(snapshot, day)
    earlier = rows[rows["publishTime"] < used_run]["publishTime"]
    other = None
    if basis == "24h":
        older = earlier[earlier <= used_run - 24 * _HOUR]
        if not older.empty:
            other = older.max()
    if other is None:
        basis = "previous"
        if earlier.empty:
            return None
        other = earlier.max()

    used = _run_series(rows, used_run)
    ref = _run_series(rows, other)
    common = used.index.intersection(ref.index).sort_values()
    if common.empty:
        return None
    delta = used[common] - ref[common]
    biggest = delta.abs().idxmax()
    return {
        "basis": basis,
        "otherRun": other,
        "hours": int(len(common)),
        "meanChange": float(delta.mean()),
        "biggestMove": {"time": biggest, "delta": float(delta[biggest])},
        "identical": bool((delta == 0).all()),
    }


# --- R8: drift (FR-012, research D7) ----------------------------------------------------------

DRIFT_RUNS = 8


def drift(snapshot: Snapshot, day: date, cutoff: str | time) -> tuple[list[dict], dict | None]:
    """The last 8 runs at or before the cutoff that cover D, each as its mean forecast over the
    hours all of them cover."""
    rows = _day_rows(snapshot, day)
    rows = rows[rows["publishTime"] <= cutoff_at(day, cutoff)]
    runs = sorted(rows["publishTime"].unique())[-DRIFT_RUNS:]
    if not runs:
        return [], None
    series = [_run_series(rows, r) for r in runs]
    common = series[0].index
    for s in series[1:]:
        common = common.intersection(s.index)
    common = common.sort_values()
    if common.empty:
        return [], None
    entries = [
        {"publishTime": pd.Timestamp(r), "meanForecast": float(s[common].mean())}
        for r, s in zip(runs, series)
    ]
    hours = {
        "from": common[0].strftime("%H:%M"),
        "to": common[-1].strftime("%H:%M"),
        "count": int(len(common)),
    }
    return entries, hours
