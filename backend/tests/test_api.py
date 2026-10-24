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
