# Data Model: REint Weather Forecast

All times are tz-aware **UTC**. Power is in **MW** (floats). Energy is in **MWh**. GW is used only
in the UI. Error = `forecast − actual`.

## Stored snapshot (`backend/data/`)

### ActualRow — `fuelhh_wind.json`

| Field | Type | Notes |
|---|---|---|
| `startTime` | ISO-8601 UTC | half-hour start; unique after dedupe |
| `generation` | float, MW | GB national wind outturn |

Scope: settlement dates 2025-12-01 … 2026-02-01 (December is history only). Only rows whose `startTime` is on the hour join
to forecasts (research D2).

### ForecastRow — `windfor.json`

| Field | Type | Notes |
|---|---|---|
| `publishTime` | ISO-8601 UTC | identifies the **run** |
| `startTime` | ISO-8601 UTC | target hour; `startTime ≥ publishTime` (others dropped) |
| `generation` | float, MW | forecast |

Unique on (`publishTime`, `startTime`). Scope: publish times 2025-11-30 … 2026-02-02.

### Manifest — `manifest.json`

`fetchedAt`, `requests[]` (URLs), `rows.actuals`, `rows.forecasts`, `runs`.

## In-memory (pandas)

- `actuals`: Series indexed by `startTime` → MW.
- `forecasts`: DataFrame (`publishTime`, `startTime`, `generation`), sorted by both.
- `runs`: sorted unique `publishTime` values.
- All three live in `Snapshot`, a `@dataclass(frozen=True, eq=False)` that hashes by identity.
  `logic.py` never caches; `main.py` caches results keyed by `id(snapshot)` (research D5).

## Domain values (pure functions in `backend/app/logic.py`)

### Decision (input)

| Field | Type | Validation |
|---|---|---|
| `deliveryDate` | date | 2026-01-02 ≤ D ≤ 2026-02-01, otherwise 422 |
| `cutoff` | `HH:MM` | on the hour, 00:00–23:00, default `09:00`, otherwise 422 |

Derived: `cutoffAt = (D − 1 day) + cutoff` (UTC).

### HourlyPoint

| Field | Type | Rule |
|---|---|---|
| `time` | UTC | each hour of D (24 rows) |
| `forecast` | MW \| null | R1, per hour; null when no run ≤ cutoff covers it |
| `publishTime` | UTC \| null | run that supplied this hour |
| `horizonH` | float \| null | `time − publishTime`, hours |
| `low` / `high` | MW \| null | R4: `forecast − q90(history@h)` / `forecast − q10(history@h)`; **low ≤ high** (AC7) |
| `actual` | MW \| null | joined on the hour |
| `error` | MW \| null | R2, only when forecast and actual both exist |

### History (R3)

The errors, at the same cutoff, of the 30 delivery days D-31 … D-2, which are the days whose
delivery ended before the cutoff. History may reach back into December 2025.
Summary: `days` (distinct days scored), `bias` (mean), `mae`, and quantiles per hour of day.

### Band (R5)

`q10Error`, `q90Error` over all history errors. The tile shows `forecast − q90 … forecast − q10`.

### RunComparison (R7.4, "vs previous run")

| Field | Type |
|---|---|
| `basis` | `"24h"` \| `"previous"` |
| `otherRun` | UTC \| null (null when no earlier run exists) |
| `hours` | int, overlap count |
| `meanChange` | MW (used − other) |
| `biggestMove` | `{time, delta}` MW |
| `identical` | bool |

### DriftEntry (R8)

`publishTime`, `meanForecast` (MW, over common hours). `driftHours = {from, to, count}`.

### DayMetrics / Metrics (R9)

`n`, `mae`, `bias`, `rmse`, `p90AbsError`, `nmaePct`, `meanActual`, `meanForecast`.
Invariant: `rmse ≥ mae ≥ |bias|`. Hours missing a forecast or actual are skipped.

### Breakdowns (R9)

- `ByHour {hour 0–23, bias, mae, n}`
- `Daily {date, mae, bias, meanActual, n}` and `worstDays` = top 10 `Daily` by `mae`
- `HistogramBin {fromMw | null, toMw | null, label, count}`: 16 bins, outer bins open-ended,
  `Σ count = n`
- `HorizonBucket {bucket "0–6 h", fromH, mae, bias, n}`: 12 buckets from 0 to 72 h, all runs,
  target hours in pilot delivery days only

## Front-end view state (`App.tsx`)

`{ tab: "outlook" | "accuracy", deliveryDate, cutoff, showActuals }`. Defaults: outlook,
2026-01-02, `09:00`, `false`. A drill-down sets `{tab: "outlook", deliveryDate, showActuals: true}`.

## Front-end derived values (`frontend/src/insights.ts`, pure)

- **Signal (R6)**: `{level: "high" | "low" | "close", title, text, verdict?}`, from `history.bias`
  and the mean of non-null forecasts. `adjusted = meanForecast − bias`. `verdict` is only present
  when actuals are shown.
- **WatchItem (R7)**: `{kind: "widest" | "leastWind" | "ramp" | "change", text}`, in fixed order,
  skipping items that do not apply.
