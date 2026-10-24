"""Snapshot cleaning and Elexon fetch retry (research D1, D2; FR-002, FR-003)."""

import httpx
import pandas as pd
import pytest

from app.data import clean_actuals, clean_forecasts, fetch_stream


def test_clean_forecasts_drops_rows_before_publish_and_dedupes_keeping_last():
    rows = [
        # target before publish -> dropped
        {"publishTime": "2026-01-14T07:30:00Z", "startTime": "2026-01-14T07:00:00Z",
         "generation": 1, "dataset": "WINDFOR"},
        {"publishTime": "2026-01-14T07:30:00Z", "startTime": "2026-01-15T00:00:00Z",
         "generation": 100, "dataset": "WINDFOR"},
        # duplicate (publishTime, startTime) -> last kept
        {"publishTime": "2026-01-14T07:30:00Z", "startTime": "2026-01-15T00:00:00Z",
         "generation": 200, "dataset": "WINDFOR"},
        {"publishTime": "2026-01-14T07:30:00Z", "startTime": "2026-01-14T07:30:00Z",
         "generation": 50, "dataset": "WINDFOR"},
    ]
    df = clean_forecasts(rows)
    assert list(df.columns) == ["publishTime", "startTime", "generation"]
    assert len(df) == 2
    assert str(df["publishTime"].dt.tz) == "UTC"
    assert str(df["startTime"].dt.tz) == "UTC"
    row = df[df["startTime"] == pd.Timestamp("2026-01-15T00:00:00Z")]
    assert row["generation"].tolist() == [200]
    # startTime == publishTime is kept
    assert (df["startTime"] == pd.Timestamp("2026-01-14T07:30:00Z")).any()


def test_clean_actuals_dedupes_on_start_time_and_keeps_used_fields():
    rows = [
        {"startTime": "2026-01-15T00:00:00Z", "generation": 10, "fuelType": "WIND",
         "publishTime": "2026-01-15T00:30:00Z"},
        {"startTime": "2026-01-15T00:00:00Z", "generation": 12, "fuelType": "WIND",
         "publishTime": "2026-01-15T00:35:00Z"},
        {"startTime": "2026-01-15T00:30:00Z", "generation": 11, "fuelType": "WIND",
         "publishTime": "2026-01-15T01:00:00Z"},
    ]
    df = clean_actuals(rows)
    assert list(df.columns) == ["startTime", "generation"]
    assert len(df) == 2
    assert str(df["startTime"].dt.tz) == "UTC"
    assert df.iloc[0]["generation"] == 12


def _transport(responses):
    calls = []

    def handler(request):
        calls.append(request)
        return responses[len(calls) - 1]

    return httpx.MockTransport(handler), calls


def test_fetch_stream_retries_on_429_then_returns_body():
    transport, calls = _transport([
        httpx.Response(429), httpx.Response(429), httpx.Response(200, json=[{"a": 1}]),
    ])
    waits = []
    with httpx.Client(transport=transport) as client:
        body = fetch_stream("https://example.test/x", client=client, sleep=waits.append)
    assert body == [{"a": 1}]
    assert len(calls) == 3
    assert len(waits) == 2


def test_fetch_stream_honours_retry_after():
    transport, _ = _transport([
        httpx.Response(429, headers={"Retry-After": "3"}), httpx.Response(200, json=[]),
    ])
    waits = []
    with httpx.Client(transport=transport) as client:
        fetch_stream("https://example.test/x", client=client, sleep=waits.append)
    assert waits == [3]


def test_fetch_stream_backs_off_exponentially_without_retry_after():
    transport, _ = _transport([
        httpx.Response(429), httpx.Response(429), httpx.Response(429), httpx.Response(200, json=[]),
    ])
    waits = []
    with httpx.Client(transport=transport) as client:
        fetch_stream("https://example.test/x", client=client, sleep=waits.append)
    assert waits == [1, 2, 4]


def test_fetch_stream_gives_up_after_five_retries():
    transport, calls = _transport([httpx.Response(429)] * 6)
    with httpx.Client(transport=transport) as client:
        with pytest.raises(httpx.HTTPStatusError):
            fetch_stream("https://example.test/x", client=client, sleep=lambda s: None)
    assert len(calls) == 6
