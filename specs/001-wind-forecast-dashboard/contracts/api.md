# API Contract

Base path `/api`. JSON only. Times are ISO-8601 UTC strings (`2026-01-14T07:30:00Z`). Power values
are MW numbers. Field types are in [data-model.md](../data-model.md).

**Error shape** (every non-2xx): `{"detail": "<one plain sentence>"}`.

Every endpoint needs a test for its success shape and its error case (Article IV).

---

## GET /api/health

**200**
```json
{
  "status": "ok",
  "rows": { "actuals": 3024, "forecasts": 0 },
  "runs": 0,
  "range": {
    "actuals": { "from": "2025-12-01T00:00:00Z", "to": "2026-02-01T23:30:00Z" },
    "forecastPublish": { "from": "...", "to": "..." },
    "deliveryDays": { "from": "2026-01-02", "to": "2026-02-01" },
    "historyDays": { "from": "2025-12-02", "to": "2026-01-30" }
  }
}
```
**500**: snapshot missing or unreadable → `{"detail": "Data snapshot not found: backend/data/…"}`.

---

## GET /api/decision

| Query | Required | Format | Default |
|---|---|---|---|
| `delivery_date` | yes | `YYYY-MM-DD`, 2026-01-02 … 2026-02-01 | – |
| `cutoff` | no | `HH:MM` on the hour, 00:00 … 23:00 | `09:00` |

**200**
```json
{
  "deliveryDate": "2026-01-15",
  "cutoff": "09:00",
  "cutoffAt": "2026-01-14T09:00:00Z",
  "usedRun": "2026-01-14T07:30:00Z",
  "minutesBeforeCutoff": 90,
  "band": { "q10Error": -1200.0, "q90Error": 4300.0 },
  "history": { "days": 30, "bias": 1800.0, "mae": 2100.0 },
  "drift": [ { "publishTime": "2026-01-13T02:30:00Z", "meanForecast": 11500.0 } ],
  "driftHours": { "from": "00:00", "to": "21:00", "count": 22 },
  "changeVsPrevious": {
    "basis": "previous", "otherRun": "2026-01-14T04:30:00Z", "hours": 24,
    "meanChange": 0.0, "biggestMove": { "time": "...", "delta": 0.0 }, "identical": true
  },
  "changeVs24h": {
    "basis": "24h", "otherRun": "2026-01-13T07:30:00Z", "hours": 24,
    "meanChange": -300.0, "biggestMove": { "time": "...", "delta": -900.0 }, "identical": false
  },
  "metrics": { "n": 24, "mae": 0.0, "bias": 0.0, "rmse": 0.0, "p90AbsError": 0.0,
               "nmaePct": 0.0, "meanActual": 0.0, "meanForecast": 11600.0 },
  "points": [
    { "time": "2026-01-15T00:00:00Z", "forecast": 12000.0, "publishTime": "2026-01-14T07:30:00Z",
      "horizonH": 16.5, "low": 7700.0, "high": 13200.0, "actual": 10100.0, "error": 1900.0 }
  ]
}
```
The numbers above show the shape only. The real values come from the snapshot (see the AC table
in [spec.md](../spec.md)).

- `points` always has 24 entries when `usedRun` is set. Hours with no covering run have
  `forecast`, `low`, `high` and `error` as `null` (research D3).
- `metrics` is `null` when no hour has both forecast and actual.
- `changeVs24h` and `changeVsPrevious` are `null` when no earlier run exists.

**200, no run before cutoff**: `usedRun: null`, `minutesBeforeCutoff: null`, `points: []`,
`drift: []`, `driftHours: null`, `metrics: null`, `changeVs*: null`. `band` and `history` are
still returned.

**422**:
- `delivery_date=2026-03-01` → `{"detail": "Delivery date must be between 2026-01-02 and 2026-02-01."}` (AC8)
- missing or unparseable `delivery_date`, or `cutoff` not on the hour → the same shape with a
  plain sentence.

---

## GET /api/metrics

Decision time 09:00, every delivery day in the window.

**200**
```json
{
  "metrics": { "n": 744, "mae": 2023.0, "bias": 1746.0, "rmse": 2497.0, "p90AbsError": 4154.0,
               "nmaePct": 0.0, "meanActual": 0.0, "meanForecast": 0.0 },
  "byHour":   [ { "hour": 0, "bias": 0.0, "mae": 0.0, "n": 31 } ],
  "daily":    [ { "date": "2026-01-02", "mae": 0.0, "bias": 0.0, "meanActual": 0.0, "n": 24 } ],
  "worstDays":[ { "date": "2026-01-28", "mae": 0.0, "bias": 0.0, "meanActual": 0.0, "n": 24 } ],
  "histogram":[ { "fromMw": null, "toMw": -7000, "label": "< −7 GW", "count": 0 } ]
}
```
Invariants: `byHour` has 24 entries; `daily` has 31; `worstDays` has ≤ 10, sorted by `mae`
descending; `histogram` has 16 bins and `Σ count == metrics.n` (AC9).
**500**: snapshot missing → error shape.

---

## GET /api/metrics/by-horizon

**200**: a list of 12 entries, ascending. Only target hours in the pilot delivery days are scored.
```json
[ { "bucket": "0–6 h", "fromH": 0, "mae": 0.0, "bias": 0.0, "n": 0 } ]
```
AC10: `mae` of the last bucket is greater than `mae` of the first.
**500**: snapshot missing → error shape.

---

## Static

`GET /` and `/assets/*` serve `frontend/dist` in production (single image). They are not used in
development (Vite proxies `/api`).
