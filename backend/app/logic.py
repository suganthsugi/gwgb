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
