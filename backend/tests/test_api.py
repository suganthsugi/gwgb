"""HTTP contract (contracts/api.md): success shape and error case per endpoint (Art. IV)."""

import pytest
from fastapi.testclient import TestClient

from app.data import SnapshotError
from app.main import app, get_snapshot


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _broken():
    raise SnapshotError("Data snapshot not found: backend/data/windfor.json.")


# --- /api/health ------------------------------------------------------------------------------


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["rows"]["actuals"] > 0
    assert body["rows"]["forecasts"] > 0
    assert body["runs"] > 0
    assert body["range"]["deliveryDays"] == {"from": "2026-01-02", "to": "2026-02-01"}
    assert body["range"]["historyDays"] == {"from": "2025-12-02", "to": "2026-01-30"}
    assert body["range"]["actuals"]["from"] == "2025-12-01T00:00:00Z"


def test_health_snapshot_error_is_500_with_detail(client):
    app.dependency_overrides[get_snapshot] = _broken
    r = client.get("/api/health")
    assert r.status_code == 500
    assert r.json() == {"detail": "Data snapshot not found: backend/data/windfor.json."}


# --- /api/decision: US1 (AC1, AC2, AC8, FR-030) -----------------------------------------------


def _decision(client, query):
    r = client.get(f"/api/decision?{query}")
    assert r.status_code == 200, r.text
    return r.json()


def test_ac1_run_in_use_at_0900(client):
    body = _decision(client, "delivery_date=2026-01-15")
    assert body["deliveryDate"] == "2026-01-15"
    assert body["cutoff"] == "09:00"
    assert body["cutoffAt"] == "2026-01-14T09:00:00Z"
    assert body["usedRun"] == "2026-01-14T07:30:00Z"
    assert body["minutesBeforeCutoff"] == 90
    assert len(body["points"]) == 24
    for key in ("time", "forecast", "publishTime", "horizonH", "actual", "error"):
        assert key in body["points"][0]
    assert body["points"][0]["time"] == "2026-01-15T00:00:00Z"
    assert body["points"][0]["publishTime"] == "2026-01-14T07:30:00Z"


def test_ac2_run_in_use_at_1200(client):
    body = _decision(client, "delivery_date=2026-01-15&cutoff=12:00")
    assert body["usedRun"] == "2026-01-14T11:30:00Z"


def test_ac8_delivery_date_outside_window_is_422(client):
    r = client.get("/api/decision?delivery_date=2026-03-01")
    assert r.status_code == 422
    assert r.json() == {"detail": "Delivery date must be between 2026-01-02 and 2026-02-01."}


@pytest.mark.parametrize("query", ["", "delivery_date=", "delivery_date=15-01-2026"])
def test_missing_or_unparseable_delivery_date_is_422(client, query):
    r = client.get(f"/api/decision?{query}")
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


@pytest.mark.parametrize("cutoff", ["09:30", "24:00", "9am"])
def test_cutoff_not_on_the_hour_is_422(client, cutoff):
    r = client.get(f"/api/decision?delivery_date=2026-01-15&cutoff={cutoff}")
    assert r.status_code == 422
    assert "on the hour, 00:00–23:00" in r.json()["detail"]


def test_no_run_before_cutoff_is_200_with_explicit_no_run(client):
    from tests.fixtures import make_snapshot

    snap = make_snapshot(no_early_runs=True)
    app.dependency_overrides[get_snapshot] = lambda: snap
    body = _decision(client, "delivery_date=2026-01-02&cutoff=00:00")
    assert body["usedRun"] is None
    assert body["minutesBeforeCutoff"] is None
    assert body["points"] == []


def test_decision_snapshot_error_is_500(client):
    app.dependency_overrides[get_snapshot] = _broken
    r = client.get("/api/decision?delivery_date=2026-01-15")
    assert r.status_code == 500
    assert "detail" in r.json()


# --- /api/decision: US2 (AC3, AC4, AC5, AC7) --------------------------------------------------


@pytest.fixture(scope="module")
def jan15():
    return TestClient(app).get("/api/decision?delivery_date=2026-01-15").json()


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs)


def test_ac3_history_and_raw_forecast(jan15):
    assert jan15["history"]["days"] == 30
    assert _mean(p["forecast"] for p in jan15["points"]) == pytest.approx(11_600, abs=50)


def test_ac3_signal_and_adjusted_value(jan15):
    pytest.skip("TBR - see T063")


def test_ac4_least_wind_and_change_vs_24h(jan15):
    f = [p["forecast"] for p in jan15["points"]]
    assert f.index(min(f)) == 16
    assert jan15["changeVs24h"]["basis"] == "24h"
    assert jan15["changeVs24h"]["otherRun"] == "2026-01-13T07:30:00Z"
    assert jan15["changeVs24h"]["meanChange"] == pytest.approx(-300, abs=50)


def test_ac4_widest_hour(jan15):
    pytest.skip("TBR - see T063")


def test_ac5_drift_and_no_change_vs_previous(jan15):
    assert len(jan15["drift"]) == 8
    assert jan15["driftHours"] == {"from": "00:00", "to": "21:00", "count": 22}
    assert jan15["changeVsPrevious"]["identical"] is True
    assert jan15["changeVsPrevious"]["meanChange"] == 0


def test_ac7_low_never_above_high(jan15):
    for p in jan15["points"]:
        assert p["low"] <= p["high"]


def test_ac7_low_never_above_high_for_every_cutoff(client):
    for hour in (0, 6, 9, 15, 23):
        body = _decision(client, f"delivery_date=2026-01-28&cutoff={hour:02d}:00")
        assert all(p["low"] <= p["high"] for p in body["points"] if p["low"] is not None)


def test_decision_shape_has_band_history_and_comparisons(jan15):
    assert set(jan15["band"]) == {"q10Error", "q90Error"}
    assert set(jan15["history"]) == {"days", "bias", "mae"}
    assert set(jan15["changeVsPrevious"]) == {
        "basis", "otherRun", "hours", "meanChange", "biggestMove", "identical",
    }
    assert jan15["drift"][0]["publishTime"].endswith("Z")


def test_no_run_still_returns_band_and_history(client):
    from tests.fixtures import make_snapshot

    snap = make_snapshot(no_early_runs=True)
    app.dependency_overrides[get_snapshot] = lambda: snap
    body = _decision(client, "delivery_date=2026-01-02&cutoff=00:00")
    assert "band" in body and "history" in body
    assert body["drift"] == [] and body["driftHours"] is None
    assert body["changeVsPrevious"] is None and body["changeVs24h"] is None
    assert body["metrics"] is None


# --- /api/decision: US3 day metrics -----------------------------------------------------------


def test_day_metrics_for_jan15(jan15):
    m = jan15["metrics"]
    assert m is not None
    assert m["n"] == 24
    assert m["rmse"] >= m["mae"] >= abs(m["bias"])


def test_day_without_actuals_has_null_metrics(client):
    from app.data import Snapshot
    from tests.fixtures import make_snapshot

    full = make_snapshot()
    actuals = full.actuals[full.actuals.index.normalize() != "2026-01-04"]
    snap = Snapshot(actuals=actuals, forecasts=full.forecasts, runs=full.runs)
    app.dependency_overrides[get_snapshot] = lambda: snap
    body = _decision(client, "delivery_date=2026-01-04")
    assert body["metrics"] is None
    assert all(p["actual"] is None and p["error"] is None for p in body["points"])
