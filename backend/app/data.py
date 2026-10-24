"""Elexon snapshot: fetch once, clean, store, load (research D1, D2; FR-001 – FR-004).

At runtime the app only reads ``backend/data/``. ``python -m app.data --refresh`` re-fetches it.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pandas as pd

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
ACTUALS_URL = (
    f"{BASE_URL}/FUELHH/stream"
    "?settlementDateFrom=2025-12-01&settlementDateTo=2026-02-01&fuelType=WIND"
)
FORECASTS_URL = (
    f"{BASE_URL}/WINDFOR/stream"
    "?publishDateTimeFrom=2025-11-30T00:00:00Z&publishDateTimeTo=2026-02-02T00:00:00Z"
)
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ACTUALS_FILE = "fuelhh_wind.json"
FORECASTS_FILE = "windfor.json"
MANIFEST_FILE = "manifest.json"
MAX_RETRIES = 5


class SnapshotError(Exception):
    """The committed snapshot is missing or unreadable."""


@dataclass(frozen=True, eq=False)
class Snapshot:
    """Loaded snapshot. ``eq=False`` keeps identity hashing (research D5)."""

    actuals: pd.Series  # MW, indexed by UTC startTime
    forecasts: pd.DataFrame  # publishTime, startTime, generation (MW), sorted
    runs: pd.DatetimeIndex  # sorted unique publishTime


# --- cleaning ---------------------------------------------------------------------------------


def clean_forecasts(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"])
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = df["generation"].astype(float)
    df = df[df["startTime"] >= df["publishTime"]]
    df = df.drop_duplicates(subset=["publishTime", "startTime"], keep="last")
    return df.sort_values(["publishTime", "startTime"]).reset_index(drop=True)


def clean_actuals(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["startTime", "generation"])
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = df["generation"].astype(float)
    df = df.drop_duplicates(subset=["startTime"], keep="last")
    return df.sort_values("startTime").reset_index(drop=True)


# --- fetching ---------------------------------------------------------------------------------


def fetch_stream(url: str, client: httpx.Client | None = None, sleep=time.sleep) -> list[dict]:
    """GET a JSON ``/stream`` endpoint, retrying HTTP 429 up to ``MAX_RETRIES`` times."""
    own_client = client is None
    client = client or httpx.Client(timeout=120)
    try:
        for attempt in range(MAX_RETRIES + 1):
            response = client.get(url)
            if response.status_code != 429 or attempt == MAX_RETRIES:
                response.raise_for_status()
                return response.json()
            retry_after = response.headers.get("Retry-After")
            sleep(int(retry_after) if retry_after else 2**attempt)
        raise AssertionError("unreachable")
    finally:
        if own_client:
            client.close()


def _iso(ts: pd.Timestamp) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def _records(df: pd.DataFrame) -> list[dict]:
    out = df.copy()
    for col in ("publishTime", "startTime"):
        if col in out:
            out[col] = out[col].map(_iso)
    return out.to_dict(orient="records")


def refresh(data_dir: Path = DATA_DIR) -> dict:
    actuals = clean_actuals(fetch_stream(ACTUALS_URL))
    forecasts = clean_forecasts(fetch_stream(FORECASTS_URL))
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / ACTUALS_FILE).write_text(json.dumps(_records(actuals), indent=0))
    (data_dir / FORECASTS_FILE).write_text(json.dumps(_records(forecasts), indent=0))
    manifest = {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "requests": [ACTUALS_URL, FORECASTS_URL],
        "rows": {"actuals": len(actuals), "forecasts": len(forecasts)},
        "runs": int(forecasts["publishTime"].nunique()),
    }
    (data_dir / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


# --- loading ----------------------------------------------------------------------------------


def _read(path: Path) -> list[dict]:
    if not path.exists():
        raise SnapshotError(f"Data snapshot not found: backend/data/{path.name}.")
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as exc:
        raise SnapshotError(f"Data snapshot could not be read: backend/data/{path.name}.") from exc


def load_snapshot(data_dir: Path = DATA_DIR) -> Snapshot:
    data_dir = Path(data_dir)
    actuals = clean_actuals(_read(data_dir / ACTUALS_FILE))
    forecasts = clean_forecasts(_read(data_dir / FORECASTS_FILE))
    series = actuals.set_index("startTime")["generation"]
    runs = pd.DatetimeIndex(forecasts["publishTime"].unique()).sort_values()
    return Snapshot(actuals=series, forecasts=forecasts, runs=runs)


def main() -> None:
    parser = argparse.ArgumentParser(description="Elexon wind snapshot")
    parser.add_argument("--refresh", action="store_true", help="re-fetch backend/data/ from Elexon")
    args = parser.parse_args()
    if not args.refresh:
        parser.print_help()
        return
    print(json.dumps(refresh(), indent=2))


if __name__ == "__main__":
    main()
