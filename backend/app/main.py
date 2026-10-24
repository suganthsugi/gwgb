"""FastAPI routes over the committed snapshot (contracts/api.md).

Result caches live here, keyed by ``id(snapshot)`` plus the request parameters (research D5);
``logic.py`` stays pure.
"""

from __future__ import annotations

from datetime import date, timedelta
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


_LABELS = {"delivery_date": "Delivery date", "cutoff": "Decision time"}


def _plain_validation_message(exc: RequestValidationError) -> str:
    err = exc.errors()[0]
    name = str(err.get("loc", ["", "value"])[-1])
    label = _LABELS.get(name, f"The query parameter '{name}'")
    if err.get("type") == "missing":
        return f"{label} is required."
    return f"{label} is not valid."


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


def _num(x: float | None) -> float | None:
    return None if x is None else round(float(x), 3)


def _point(p: dict) -> dict:
    return {
        "time": iso(p["time"]),
        "forecast": _num(p["forecast"]),
        "publishTime": iso(p["publishTime"]),
        "horizonH": _num(p["horizonH"]),
        "low": _num(p.get("low")),
        "high": _num(p.get("high")),
        "actual": _num(p["actual"]),
        "error": _num(p["error"]),
    }


# --- request parsing --------------------------------------------------------------------------


def parse_delivery_date(s: str) -> date:
    try:
        day = date.fromisoformat(s)
    except ValueError:
        raise InvalidRequest("Delivery date must be a date written as YYYY-MM-DD.") from None
    if not logic.WINDOW_START <= day <= logic.WINDOW_END:
        raise InvalidRequest(
            f"Delivery date must be between {logic.WINDOW_START} and {logic.WINDOW_END}."
        )
    return day


def parse_cutoff(s: str) -> str:
    try:
        logic.parse_cutoff(s)
    except ValueError as exc:
        raise InvalidRequest(str(exc)) from None
    return s


def build_decision(snapshot: Snapshot, day: date, cutoff: str) -> dict:
    sel = logic.select_forecast(snapshot, day, cutoff)
    return {
        "deliveryDate": str(day),
        "cutoff": cutoff,
        "cutoffAt": iso(logic.cutoff_at(day, cutoff)),
        "usedRun": iso(sel["used_run"]),
        "minutesBeforeCutoff": sel["minutes_before_cutoff"],
        "band": None,
        "history": None,
        "drift": [],
        "driftHours": None,
        "changeVsPrevious": None,
        "changeVs24h": None,
        "metrics": None,
        "points": [_point(p) for p in sel["points"]],
    }


# --- caches (research D5) ---------------------------------------------------------------------

_decision_cache: dict[tuple, tuple[Snapshot, dict]] = {}
_report_cache: dict[tuple, tuple[Snapshot, object]] = {}


def cached(cache: dict, snapshot: Snapshot, params: tuple, build):
    """Cache keyed by ``id(snapshot)`` + params. The entry holds the snapshot so an id reused
    after garbage collection can never return another snapshot's result."""
    key = (id(snapshot), *params)
    hit = cache.get(key)
    if hit is None or hit[0] is not snapshot:
        hit = cache[key] = (snapshot, build())
    return hit[1]


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


@app.get("/api/decision")
def decision(
    delivery_date: str,
    cutoff: str = logic.DEFAULT_CUTOFF,
    snapshot: Snapshot = Depends(get_snapshot),
) -> dict:
    day = parse_delivery_date(delivery_date)
    cutoff = parse_cutoff(cutoff)
    return cached(
        _decision_cache, snapshot, (day, cutoff), lambda: build_decision(snapshot, day, cutoff)
    )
