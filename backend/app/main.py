"""FastAPI routes over the committed snapshot (contracts/api.md).

Result caches live here, keyed by ``id(snapshot)`` plus the request parameters (research D5);
``logic.py`` stays pure.
"""

from __future__ import annotations

from datetime import timedelta
from functools import lru_cache

import pandas as pd
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import logic
from app.data import Snapshot, SnapshotError, load_snapshot

app = FastAPI(title="REint Weather Forecast")


@lru_cache(maxsize=1)
def get_snapshot() -> Snapshot:
    return load_snapshot()


# --- errors: always {"detail": "<one plain sentence>"} (research D10) --------------------------


class InvalidRequest(Exception):
    def __init__(self, detail: str):
        self.detail = detail


def _plain_validation_message(exc: RequestValidationError) -> str:
    err = exc.errors()[0]
    name = str(err.get("loc", ["", "value"])[-1])
    if err.get("type") == "missing":
        return f"The query parameter '{name}' is required."
    return f"The query parameter '{name}' is not valid."


@app.exception_handler(RequestValidationError)
async def _on_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": _plain_validation_message(exc)})


@app.exception_handler(InvalidRequest)
async def _on_invalid(_: Request, exc: InvalidRequest) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": exc.detail})


@app.exception_handler(SnapshotError)
async def _on_snapshot(_: Request, exc: SnapshotError) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# --- serialisation ----------------------------------------------------------------------------


def iso(ts: pd.Timestamp | None) -> str | None:
    return None if ts is None else ts.strftime("%Y-%m-%dT%H:%M:%SZ")


# --- caches (research D5) ---------------------------------------------------------------------

_decision_cache: dict[tuple, dict] = {}
_report_cache: dict[int, dict] = {}


# --- routes -----------------------------------------------------------------------------------


@app.get("/api/health")
def health(snapshot: Snapshot = Depends(get_snapshot)) -> dict:
    fc = snapshot.forecasts
    first_history = logic.WINDOW_START - timedelta(days=logic.HISTORY_DAYS + 1)
    last_history = logic.WINDOW_END - timedelta(days=2)
    return {
        "status": "ok",
        "rows": {"actuals": int(snapshot.actuals.size), "forecasts": int(len(fc))},
        "runs": int(len(snapshot.runs)),
        "range": {
            "actuals": {
                "from": iso(snapshot.actuals.index.min()),
                "to": iso(snapshot.actuals.index.max()),
            },
            "forecastPublish": {"from": iso(snapshot.runs.min()), "to": iso(snapshot.runs.max())},
            "deliveryDays": {"from": str(logic.WINDOW_START), "to": str(logic.WINDOW_END)},
            "historyDays": {"from": str(first_history), "to": str(last_history)},
        },
    }
