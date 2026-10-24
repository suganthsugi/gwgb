"""Tiny hand-computed snapshot for the domain tests.

Delivery days D = 2026-01-02 … 2026-01-06 (index k = 0 … 4). Every run below covers only its own
day D, so the expected numbers can be worked out by hand:

    run          publishTime     hours of D covered   forecast at hour h
    A  (D-2)     D-2 22:30       00:00 – 21:00        1000 + 10h
    B  (D-1)     D-1 07:30       00:00 – 23:00        2000 + 10h
    C  (D-1)     D-1 09:00       00:00 – 23:00        3000 + 10h   (exactly at the 09:00 cutoff)
    E  (D-1)     D-1 09:30       00:00 – 23:00        9000 + 10h   (after the 09:00 cutoff)

Actuals: on the hour, 2500 + 10h − 100k MW. On the half hour, 99999 MW (must never join).
Day 2026-01-03 (k = 1) has no actual at 23:00.

Expected R1 selections:
    cutoff 09:00 → run C everywhere; minutesBeforeCutoff 0; error = 500 + 100k
                    (Jan 2: 500, Jan 3: 600, Jan 4: 700, Jan 5: 800, Jan 6: 900)
    cutoff 08:00 → run B everywhere; minutesBeforeCutoff 30; error = −500 + 100k
    cutoff 00:00 → run A for 00:00 – 21:00; 22:00 and 23:00 have no forecast;
                    minutesBeforeCutoff 90

``with_24h_run=True`` adds run R24 at D-2 07:30 covering only 2026-01-05, hours 00:00 – 23:00, at
2500 + 10h; it is the "24 h earlier" reference for run C (D-1 09:00 − 24 h = D-2 09:00 ≥ 07:30).
On that day it supplies 22:00 and 23:00 for cutoff 00:00 (run A stops at 21:00).

``no_early_runs=True`` drops run A of 2026-01-02 (published 2025-12-31 22:30), so the first run is
published after 2026-01-01 00:00 and delivery day 2026-01-02 at cutoff 00:00 has no run.
"""

from datetime import date, timedelta

import pandas as pd

from app.data import Snapshot

DAYS = [date(2026, 1, 2) + timedelta(days=k) for k in range(5)]
RUN_BASE = {"A": 1000.0, "B": 2000.0, "C": 3000.0, "E": 9000.0}
MISSING_ACTUAL = pd.Timestamp("2026-01-03T23:00:00Z")
DAY_24H = date(2026, 1, 5)


def ts(day: date, hour: int, minute: int = 0) -> pd.Timestamp:
    return pd.Timestamp(day.year, day.month, day.day, hour, minute, tz="UTC")


def run_time(day: date, run: str) -> pd.Timestamp:
    return {
        "A": ts(day - timedelta(days=2), 22, 30),
        "B": ts(day - timedelta(days=1), 7, 30),
        "C": ts(day - timedelta(days=1), 9, 0),
        "E": ts(day - timedelta(days=1), 9, 30),
        "R24": ts(day - timedelta(days=2), 7, 30),
    }[run]


def make_snapshot(no_early_runs: bool = False, with_24h_run: bool = False) -> Snapshot:
    forecasts = []
    actuals = []
    for k, day in enumerate(DAYS):
        for run, base in RUN_BASE.items():
            if no_early_runs and run == "A" and day == DAYS[0]:
                continue
            last_hour = 21 if run == "A" else 23
            for h in range(last_hour + 1):
                forecasts.append((run_time(day, run), ts(day, h), base + 10 * h))
        if with_24h_run and day == DAY_24H:
            for h in range(24):
                forecasts.append((run_time(day, "R24"), ts(day, h), 2500.0 + 10 * h))
        for h in range(24):
            if ts(day, h) != MISSING_ACTUAL:
                actuals.append((ts(day, h), 2500.0 + 10 * h - 100 * k))
            actuals.append((ts(day, h, 30), 99999.0))

    fc = pd.DataFrame(forecasts, columns=["publishTime", "startTime", "generation"])
    fc = fc.sort_values(["publishTime", "startTime"]).reset_index(drop=True)
    act = pd.DataFrame(actuals, columns=["startTime", "generation"]).sort_values("startTime")
    return Snapshot(
        actuals=act.set_index("startTime")["generation"],
        forecasts=fc,
        runs=pd.DatetimeIndex(fc["publishTime"].unique()).sort_values(),
    )
