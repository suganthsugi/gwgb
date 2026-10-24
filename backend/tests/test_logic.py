"""Domain rules R1 – R9 on hand-computed fixtures (constitution Art. II – IV)."""

from datetime import date, timedelta

import pandas as pd
import pytest

from app import logic
from tests.fixtures import DAYS, make_snapshot, run_time, ts

D = date(2026, 1, 4)  # k = 2


@pytest.fixture(scope="module")
def snap():
    return make_snapshot()


# --- R1: forecast in use (FR-005) -------------------------------------------------------------


def test_r1_uses_newest_run_at_or_before_cutoff(snap):
    out = logic.select_forecast(snap, D, "08:00")
    assert out["used_run"] == run_time(D, "B")
    assert [p["forecast"] for p in out["points"]] == [2000.0 + 10 * h for h in range(24)]


def test_r1_run_published_exactly_at_cutoff_counts(snap):
    out = logic.select_forecast(snap, D, "09:00")
    assert out["used_run"] == run_time(D, "C")
    assert out["minutes_before_cutoff"] == 0
    assert out["points"][0]["forecast"] == 3000.0


def test_r1_runs_after_cutoff_are_never_used(snap):
    for cutoff in ("09:00", "08:00", "00:00"):
        out = logic.select_forecast(snap, D, cutoff)
        assert all(p["forecast"] is None or p["forecast"] < 9000 for p in out["points"])
        assert all(
            p["publishTime"] is None or p["publishTime"] <= logic.cutoff_at(D, cutoff)
            for p in out["points"]
        )


def test_r1_no_run_before_cutoff_gives_empty_result():
    snap = make_snapshot(no_early_runs=True)
    out = logic.select_forecast(snap, DAYS[0], "00:00")
    assert out["used_run"] is None
    assert out["minutes_before_cutoff"] is None
    assert out["points"] == []


def test_r1_selection_is_per_hour_and_uncovered_hours_are_null(snap):
    out = logic.select_forecast(snap, D, "00:00")
    assert out["used_run"] == run_time(D, "A")
    assert out["minutes_before_cutoff"] == 90
    assert len(out["points"]) == 24
    assert out["points"][21]["forecast"] == 1210.0
    for p in out["points"][22:]:
        assert p["forecast"] is None
        assert p["publishTime"] is None
        assert p["horizonH"] is None
        assert p["error"] is None
    # the actual is still known for those hours
    assert out["points"][22]["actual"] == 2500.0 + 220 - 200


def test_r1_horizon_is_hours_from_publish_to_target(snap):
    out = logic.select_forecast(snap, D, "08:00")
    # run B at D-1 07:30 → D 00:00 is 16.5 h ahead, D 23:00 is 39.5 h ahead
    assert out["points"][0]["horizonH"] == 16.5
    assert out["points"][23]["horizonH"] == 39.5


def test_r1_minutes_before_cutoff(snap):
    assert logic.select_forecast(snap, D, "08:00")["minutes_before_cutoff"] == 30
    assert logic.select_forecast(snap, D, "12:00")["minutes_before_cutoff"] == 150


def test_r1_only_on_the_hour_actuals_join(snap):
    out = logic.select_forecast(snap, D, "09:00")
    assert [p["time"] for p in out["points"]] == [ts(D, h) for h in range(24)]
    assert all(p["actual"] != 99999.0 for p in out["points"])
    assert out["points"][5]["actual"] == 2500.0 + 50 - 200
    assert out["points"][5]["error"] == 700.0


def test_r1_missing_actual_gives_null_error(snap):
    out = logic.select_forecast(snap, date(2026, 1, 3), "09:00")
    assert out["points"][23]["actual"] is None
    assert out["points"][23]["error"] is None
    assert out["points"][22]["error"] == 600.0


def test_cutoff_at_is_cutoff_on_previous_day():
    assert logic.cutoff_at(date(2026, 1, 15), "09:00") == pd.Timestamp("2026-01-14T09:00Z")
    assert logic.cutoff_at(date(2026, 1, 15), "00:00") == pd.Timestamp("2026-01-14T00:00Z")


@pytest.mark.parametrize("bad", ["09:30", "24:00", "9", "nine", "", "-1:00", "09:00:00"])
def test_parse_cutoff_rejects_values_not_on_the_hour(bad):
    with pytest.raises(ValueError, match="on the hour"):
        logic.parse_cutoff(bad)


def test_parse_cutoff_accepts_whole_hours():
    assert logic.parse_cutoff("00:00").hour == 0
    assert logic.parse_cutoff("23:00").hour == 23


# --- R2 / R9: error and core metrics (FR-006, FR-013) -----------------------------------------


def test_r2_error_is_forecast_minus_actual(snap):
    out = logic.select_forecast(snap, D, "08:00")
    p = out["points"][3]
    assert p["error"] == p["forecast"] - p["actual"] == -300.0


def test_metrics_hand_computed():
    m = logic.summarize_metrics(
        errors=[-100.0, 0.0, 300.0], actuals=[1000.0, 2000.0, 3000.0],
        forecasts=[900.0, 2000.0, 3300.0],
    )
    assert m["n"] == 3
    assert m["mae"] == pytest.approx(133.333, abs=0.01)
    assert m["bias"] == pytest.approx(66.667, abs=0.01)
    assert m["rmse"] == pytest.approx(182.574, abs=0.01)
    assert m["p90AbsError"] == pytest.approx(260.0)
    assert m["meanActual"] == pytest.approx(2000.0)
    assert m["meanForecast"] == pytest.approx(2066.667, abs=0.01)
    assert m["nmaePct"] == pytest.approx(133.333 / 2000 * 100, abs=0.001)
    assert m["rmse"] >= m["mae"] >= abs(m["bias"])


def test_metrics_skip_hours_missing_actual_or_forecast():
    m = logic.summarize_metrics(
        errors=[-100.0, None, None, 300.0], actuals=[1000.0, None, 5.0, 3000.0],
        forecasts=[900.0, 7.0, None, 3300.0],
    )
    assert m["n"] == 2
    assert m["mae"] == pytest.approx(200.0)
    assert m["meanActual"] == pytest.approx(2000.0)


def test_metrics_none_when_nothing_scored():
    assert logic.summarize_metrics([None], [None], [1.0]) is None
    assert logic.summarize_metrics([], [], []) is None


# --- SC-001: snapshot-wide no-hindsight sweep (constitution Art. II) --------------------------


@pytest.fixture(scope="module")
def real():
    from app.data import load_snapshot

    return load_snapshot()


def test_r1_sweep_never_uses_a_run_after_the_cutoff(real):
    fc = real.forecasts
    day = logic.WINDOW_START
    while day <= logic.WINDOW_END:
        rows = fc[(fc["startTime"] >= ts(day, 0)) & (fc["startTime"] < ts(day + timedelta(1), 0))]
        for hour in range(24):
            cutoff = f"{hour:02d}:00"
            at = logic.cutoff_at(day, cutoff)
            out = logic.select_forecast(real, day, cutoff)
            avail = rows[rows["publishTime"] <= at]
            newest = avail.groupby("startTime")["publishTime"].max()
            for p in out["points"]:
                if p["forecast"] is None:
                    assert p["time"] not in newest.index
                    continue
                assert p["publishTime"] <= at
                assert p["publishTime"] == newest[p["time"]]
        day += timedelta(1)


@pytest.mark.skip(reason="history_for is added in T032")
def test_history_never_draws_on_a_day_after_d_minus_2(real):
    pass
