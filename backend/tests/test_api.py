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
