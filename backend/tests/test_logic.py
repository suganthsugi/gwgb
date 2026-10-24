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


@pytest.mark.parametrize("cutoff", ["00:00", "09:00", "23:00"])
def test_history_never_draws_on_a_day_after_d_minus_2(real, cutoff):
    day = logic.WINDOW_START
    while day <= logic.WINDOW_END:
        h = logic.history_for(real, day, cutoff)
        assert max(h["source_days"]) == day - timedelta(days=2)
        assert min(h["source_days"]) == day - timedelta(days=logic.HISTORY_DAYS + 1)
        day += timedelta(1)


# --- R3: history (FR-007) ---------------------------------------------------------------------

D6 = date(2026, 1, 6)  # k = 4


def test_r3_history_uses_only_days_d_minus_n_plus_1_to_d_minus_2(snap):
    h = logic.history_for(snap, D6, "09:00", history_days=2)
    assert h["source_days"] == [date(2026, 1, 3), date(2026, 1, 4)]
    assert h["days"] == 2
    # Jan 3: 23 hours of +600 (23:00 has no actual); Jan 4: 24 hours of +700
    assert h["n"] == 47
    assert h["bias"] == pytest.approx((23 * 600 + 24 * 700) / 47)
    assert h["mae"] == pytest.approx((23 * 600 + 24 * 700) / 47)


def test_r3_history_never_includes_d_minus_1_d_or_later(snap):
    for n in (1, 2, 3, 30):
        h = logic.history_for(snap, D6, "09:00", history_days=n)
        assert all(day <= D6 - timedelta(days=2) for day in h["source_days"])
    errors = logic.history_for(snap, D6, "09:00", history_days=30)["errors"]
    assert 800.0 not in errors and 900.0 not in errors  # Jan 5 (D-1) and Jan 6 (D)


def test_r3_days_counts_only_days_with_a_scored_hour(snap):
    # D = Jan 4, N = 2 → Jan 1 (no data) and Jan 2
    h = logic.history_for(snap, date(2026, 1, 4), "09:00", history_days=2)
    assert h["source_days"] == [date(2026, 1, 1), date(2026, 1, 2)]
    assert h["days"] == 1
    assert h["bias"] == pytest.approx(500.0)


def test_r3_history_uses_the_same_cutoff(snap):
    h = logic.history_for(snap, D6, "00:00", history_days=2)
    # run A errors: Jan 3 −1400, Jan 4 −1300, hours 00:00 – 21:00 only
    assert h["n"] == 44
    assert sorted(set(h["errors"])) == [-1400.0, -1300.0]


def test_r3_empty_history():
    snap = make_snapshot()
    h = logic.history_for(snap, date(2026, 1, 2), "09:00", history_days=1)
    assert h["days"] == 0
    assert h["bias"] is None and h["mae"] is None
    assert logic.overall_band(h) is None


# --- R4, R5: likely range and typical error (FR-008, FR-009) ----------------------------------


def test_r4_band_per_hour_from_linear_quantiles(snap):
    sel = logic.select_forecast(snap, D6, "09:00")
    h = logic.history_for(snap, D6, "09:00", history_days=2)
    pts = logic.apply_band(sel["points"], h)
    # hour 0: history [600, 700] → q10 610, q90 690; forecast 3000
    assert pts[0]["low"] == pytest.approx(3000 - 690)
    assert pts[0]["high"] == pytest.approx(3000 - 610)
    # hour 23: history [700] only (Jan 3 23:00 has no actual)
    assert pts[23]["low"] == pytest.approx(3230 - 700)
    assert pts[23]["high"] == pytest.approx(3230 - 700)
    assert all(p["low"] <= p["high"] for p in pts)


def test_r4_band_is_null_without_forecast_or_history(snap):
    sel = logic.select_forecast(snap, D6, "00:00")
    h = logic.history_for(snap, D6, "00:00", history_days=2)
    pts = logic.apply_band(sel["points"], h)
    assert pts[21]["low"] is not None
    assert pts[22]["low"] is None and pts[22]["high"] is None
    empty = logic.history_for(snap, date(2026, 1, 2), "09:00", history_days=1)
    pts = logic.apply_band(logic.select_forecast(snap, date(2026, 1, 2), "09:00")["points"], empty)
    assert all(p["low"] is None and p["high"] is None for p in pts)


def test_r5_overall_band_over_all_history_hours(snap):
    h = logic.history_for(snap, D6, "09:00", history_days=2)
    band = logic.overall_band(h)
    # 23 × 600 then 24 × 700: q10 at rank 4.6 → 600, q90 at rank 41.4 → 700
    assert band == {"q10Error": pytest.approx(600.0), "q90Error": pytest.approx(700.0)}


# --- R7.4: comparing runs (research D6) -------------------------------------------------------


def _tiny(runs: dict[str, dict[int, float]]):
    """Snapshot of delivery day 2026-01-10 with the given runs {publishTime: {hour: MW}}."""
    from app.data import Snapshot

    day = date(2026, 1, 10)
    rows = [
        (pd.Timestamp(p), ts(day, h), v) for p, hours in runs.items() for h, v in hours.items()
    ]
    fc = pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"])
    fc = fc.sort_values(["publishTime", "startTime"]).reset_index(drop=True)
    act = pd.Series([1.0], index=pd.DatetimeIndex([ts(day, 0)]))
    return day, Snapshot(act, fc, pd.DatetimeIndex(fc["publishTime"].unique()).sort_values())


def test_compare_identical_runs():
    day, snap = _tiny({
        "2026-01-09T04:30Z": {h: 100.0 * h for h in range(24)},
        "2026-01-09T07:30Z": {h: 100.0 * h for h in range(24)},
    })
    c = logic.compare_runs(snap, day, pd.Timestamp("2026-01-09T07:30Z"), "previous")
    assert c["identical"] is True
    assert c["meanChange"] == 0
    assert c["otherRun"] == pd.Timestamp("2026-01-09T04:30Z")
    assert c["hours"] == 24


def test_compare_known_shift_over_overlapping_hours_only():
    day, snap = _tiny({
        "2026-01-09T04:30Z": {0: 1000.0, 1: 1000.0, 2: 1000.0},
        "2026-01-09T07:30Z": {1: 1300.0, 2: 400.0, 3: 5000.0},
    })
    c = logic.compare_runs(snap, day, pd.Timestamp("2026-01-09T07:30Z"), "previous")
    assert c["hours"] == 2
    assert c["meanChange"] == pytest.approx((300 - 600) / 2)
    assert c["biggestMove"] == {"time": ts(day, 2), "delta": -600.0}
    assert c["identical"] is False


def test_compare_24h_reference_is_latest_run_at_least_24h_older():
    snap = make_snapshot(with_24h_run=True)
    day = date(2026, 1, 5)
    c = logic.compare_runs(snap, day, run_time(day, "C"), "24h")
    assert c["basis"] == "24h"
    assert c["otherRun"] == run_time(day, "R24")
    assert c["meanChange"] == pytest.approx(500.0)


def test_compare_24h_falls_back_to_previous_run(snap):
    c = logic.compare_runs(snap, D, run_time(D, "C"), "24h")
    assert c["basis"] == "previous"
    assert c["otherRun"] == run_time(D, "B")
    assert c["meanChange"] == pytest.approx(1000.0)
    assert c["biggestMove"]["delta"] == pytest.approx(1000.0)


def test_compare_without_earlier_run_is_none(snap):
    assert logic.compare_runs(snap, D, run_time(D, "A"), "previous") is None
    assert logic.compare_runs(snap, D, run_time(D, "A"), "24h") is None


# --- R8: drift (FR-012, research D7) ----------------------------------------------------------


def test_r8_drift_uses_runs_that_exist_when_fewer_than_8(snap):
    entries, hours = logic.drift(snap, D, "09:00")
    assert [e["publishTime"] for e in entries] == [run_time(D, r) for r in ("A", "B", "C")]
    # common hours 00:00 – 21:00 → mean of 10h over h = 0..21 is 105
    assert [e["meanForecast"] for e in entries] == pytest.approx([1105.0, 2105.0, 3105.0])
    assert hours == {"from": "00:00", "to": "21:00", "count": 22}


def test_r8_drift_takes_the_last_8_runs_before_cutoff():
    runs = {f"2026-01-0{8 + i // 6}T{(i % 6) * 4:02d}:00Z": {h: 100.0 * i for h in range(24)}
            for i in range(10)}
    day, snap = _tiny(runs)
    entries, hours = logic.drift(snap, day, "09:00")
    assert len(entries) == 8
    assert entries[-1]["publishTime"] == pd.Timestamp("2026-01-09T08:00Z")
    assert [e["meanForecast"] for e in entries] == pytest.approx([100.0 * i for i in range(1, 9)])
    assert hours["count"] == 24


def test_r8_no_run_before_cutoff_gives_empty_drift():
    snap = make_snapshot(no_early_runs=True)
    assert logic.drift(snap, DAYS[0], "00:00") == ([], None)


# --- R9 breakdowns (FR-013, research D8) ------------------------------------------------------


def _pt(day: date, hour: int, forecast: float, actual: float | None) -> dict:
    return {
        "time": ts(day, hour), "forecast": forecast, "actual": actual,
        "error": None if actual is None else forecast - actual,
    }


SCORED = [
    _pt(date(2026, 1, 2), 0, 1100.0, 1000.0),  # +100
    _pt(date(2026, 1, 2), 1, 900.0, 1000.0),  # −100
    _pt(date(2026, 1, 3), 0, 1300.0, 1000.0),  # +300
    _pt(date(2026, 1, 3), 1, 1000.0, None),  # not scored
]


def test_by_hour_has_24_entries():
    rows = logic.by_hour(SCORED)
    assert [r["hour"] for r in rows] == list(range(24))
    assert rows[0] == {"hour": 0, "bias": pytest.approx(200.0), "mae": pytest.approx(200.0), "n": 2}
    assert rows[1] == {"hour": 1, "bias": -100.0, "mae": 100.0, "n": 1}
    assert rows[5] == {"hour": 5, "bias": None, "mae": None, "n": 0}


def test_daily_one_entry_per_day():
    rows = logic.daily(SCORED)
    assert rows == [
        {"date": "2026-01-02", "mae": 100.0, "bias": 0.0, "meanActual": 1000.0, "n": 2},
        {"date": "2026-01-03", "mae": 300.0, "bias": 300.0, "meanActual": 1000.0, "n": 1},
    ]


def test_worst_days_top_10_by_mae_descending():
    days = [{"date": f"2026-01-{d:02d}", "mae": float(d % 7), "bias": 0.0, "meanActual": 1.0,
             "n": 24} for d in range(2, 20)]
    worst = logic.worst_days(days)
    assert len(worst) == 10
    assert [w["mae"] for w in worst] == sorted((w["mae"] for w in worst), reverse=True)
    assert worst[0]["mae"] == 6.0


def test_histogram_bins_and_edges():
    bins = logic.histogram([-7000.0, -7001.0, 7000.0, 6999.0, 0.0, -0.5, 12000.0])
    assert len(bins) == 16
    assert bins[0] == {"fromMw": None, "toMw": -7000, "label": "< −7 GW", "count": 1}
    assert bins[1]["fromMw"] == -7000 and bins[1]["toMw"] == -6000 and bins[1]["count"] == 1
    assert bins[14]["fromMw"] == 6000 and bins[14]["count"] == 1
    assert bins[15] == {"fromMw": 7000, "toMw": None, "label": "≥ +7 GW", "count": 2}
    assert bins[8]["fromMw"] == 0 and bins[8]["count"] == 1  # 0 is in [0, 1)
    assert bins[7]["toMw"] == 0 and bins[7]["count"] == 1  # −0.5 is in [−1, 0)
    assert sum(b["count"] for b in bins) == 7


def test_by_horizon_buckets_pilot_target_hours_only():
    from app.data import Snapshot

    rows = [
        # (publishTime, startTime, forecast); actuals are 1000 everywhere
        ("2026-01-09T22:00Z", "2026-01-10T01:00Z", 1100.0),  # 3 h → [0, 6), +100
        ("2026-01-09T22:00Z", "2026-01-10T05:00Z", 700.0),  # 7 h → [6, 12), −300
        ("2026-01-08T00:00Z", "2026-01-10T23:00Z", 1500.0),  # 71 h → [66, 72), +500
        ("2026-01-07T00:00Z", "2026-01-10T00:00Z", 9000.0),  # 72 h → excluded
        ("2025-12-30T00:00Z", "2025-12-30T05:00Z", 9000.0),  # December target → ignored
        ("2026-01-09T22:00Z", "2026-01-10T02:00Z", 1200.0),  # 4 h → [0, 6), +200
    ]
    fc = pd.DataFrame(
        [(pd.Timestamp(p), pd.Timestamp(s), v) for p, s, v in rows],
        columns=["publishTime", "startTime", "generation"],
    ).sort_values(["publishTime", "startTime"]).reset_index(drop=True)
    times = pd.DatetimeIndex([pd.Timestamp(s) for _, s, _ in rows])
    snap = Snapshot(pd.Series(1000.0, index=times.unique()), fc,
                    pd.DatetimeIndex(fc["publishTime"].unique()))
    buckets = logic.by_horizon(snap)
    assert [b["fromH"] for b in buckets] == list(range(0, 72, 6))
    assert buckets[0]["bucket"] == "0–6 h"
    assert buckets[0] == {"bucket": "0–6 h", "fromH": 0, "mae": 150.0, "bias": 150.0, "n": 2}
    assert buckets[1]["n"] == 1 and buckets[1]["bias"] == -300.0
    assert buckets[11]["n"] == 1 and buckets[11]["mae"] == 500.0
    assert buckets[5] == {"bucket": "30–36 h", "fromH": 30, "mae": None, "bias": None, "n": 0}
    assert sum(b["n"] for b in buckets) == 4


def test_accuracy_report_on_fixture(snap):
    report = logic.accuracy_report(snap)
    # fixture covers Jan 2 – 6 at 09:00 (run C): errors 500 … 900, Jan 3 23:00 has no actual
    assert report["metrics"]["n"] == 5 * 24 - 1
    assert len(report["daily"]) == 5
    assert report["worstDays"][0]["date"] == "2026-01-06"
    assert sum(b["count"] for b in report["histogram"]) == report["metrics"]["n"]
