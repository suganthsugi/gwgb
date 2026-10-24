# REint Weather Forecast — Product & Technical Spec

> **Original input, kept for reference.** Where it differs from [spec.md](./spec.md), spec.md wins.
> It was amended on 2026-10-25: R3 history, the data fetch range, AC3/AC4 values, bias thresholds,
> histogram colours and the lead-time chart title.

Minimal spec for building the app with spec-driven development.

---

## 1. Problem

A GB electricity supplier buys power in the **day-ahead market**: before ~09:20 UK time on day D-1 it bids for every hour of delivery day D. Wind is used first, so the buyer only purchases what wind won't cover. Tomorrow's wind is a forecast, and forecast errors leave the buyer short (expensive imbalance) or long.

The app must let the buying team:

1. **See the latest wind forecast available at decision time** for a delivery day.
2. **Evaluate forecast accuracy quantitatively**, so purchases can account for the expected error.

## 2. Scope

| In scope | Out of scope |
|---|---|
| GB national wind: actuals + forecasts from Elexon only | Demand, price, solar, regional data |
| Purchase decisions made 1–31 Jan 2026 → delivery days **2 Jan – 1 Feb 2026** | Live data, auth, user accounts, database server |
| Two screens: Day-ahead outlook, Forecast accuracy | Producing our own forecast or sizing the purchase |

## 3. Tech stack

| Layer | Choice |
|---|---|
| Front end | React 18 + TypeScript + Vite |
| UI kit | **MUI** (Material UI v5): AppBar, Tabs, Card, Grid, DatePicker (`@mui/x-date-pickers`), Select, Switch, Table, Alert, Skeleton |
| Charts | **ApexCharts** (`react-apexcharts`) |
| Back end | Python 3.12 + FastAPI + pandas + httpx |
| Tests | pytest (back end); Vitest + Testing Library (front end) |
| Packaging | Docker (single image: FastAPI serves API + built front end), docker-compose for local |

## 4. Data

Base URL: `https://data.elexon.co.uk/bmrs/api/v1/datasets` (public, no key).

| Dataset | Request | Fields used |
|---|---|---|
| Actuals `FUELHH` | `/FUELHH/stream?settlementDateFrom=2026-01-01&settlementDateTo=2026-02-01&fuelType=WIND` | `startTime`, `generation` (MW, half-hourly) |
| Forecasts `WINDFOR` | `/WINDFOR/stream?publishDateTimeFrom=2025-12-30T00:00:00Z&publishDateTimeTo=2026-02-02T00:00:00Z` | `publishTime`, `startTime`, `generation` (MW, hourly) |

- Fetch once, cache to `backend/data/*.json`, commit the snapshot (app must work if Elexon is down).
- Retry on HTTP 429.
- Drop forecast rows where `startTime < publishTime`.
- Deduplicate on (`publishTime`, `startTime`) for forecasts, `startTime` for actuals.
- All times UTC (= UK time in January).

Known data facts (design must handle them):
- Forecasts are **hourly**, actuals **half-hourly** → compare on the hour (forecast `startTime` = actual `startTime`).
- ~8 runs/day, published 02:30, 04:30, 07:30, 09:30, 11:30, (12:25), 15:30, 18:30, 22:30 UTC.
- Overnight runs are often **identical**.
- Runs published on D-2 cover D only until **21:00** (22 hours).

## 5. Domain rules

**R1 — Forecast in use.** For delivery day D and decision time T (default 09:00) on D-1: cutoff = D-1 T. For each hour of D, use the row from the newest run with `publishTime ≤ cutoff`. A run published exactly at the cutoff counts. Runs after the cutoff are never used.

**R2 — Error.** `error = forecast − actual` (positive = forecast too high → buyer short).

**R3 — History (leave-one-out).** For day D and decision time T, history = R1 errors for every other delivery day in the window at the same T.

**R4 — Likely range.** Per hour of day h: `low = forecast − P90(history errors at h)`, `high = forecast − P10(history errors at h)`.

**R5 — Typical error range (tile).** Same as R4 using all history hours.

**R6 — Signal.** `bias = mean(history errors)`; `adjusted = mean(forecast) − bias`.
- bias > +500 MW → "Forecast likely too high"
- bias < −500 MW → "Forecast likely too low"
- otherwise → "Forecast has been close to target"

Text states the bias, the adjusted figure and the raw forecast mean. With actuals shown, add a verdict: whether `adjusted` or raw forecast was closer to mean actual.

**R7 — Watch list** (in this order, skip when not applicable):
1. Widest uncertainty hour (max `high − low`) with its range.
2. Least-wind hour (min forecast).
3. Steepest ramp: largest hour-to-hour forecast change, shown only if ≥ 500 MW.
4. Change vs the run 24 h earlier (latest run with `publishTime ≤ usedRun − 24h`); fall back to the previous run if none. Show mean change and biggest single-hour move; say "no change" when identical.

**R8 — Drift.** The last 8 runs with `publishTime ≤ cutoff`, each summarised as mean forecast over the hours **all 8 runs cover**. State the covered hours when fewer than 24.

**R9 — Accuracy metrics** (decision time 09:00, all 31 delivery days × 24 h):
- MAE, bias (mean error), RMSE, P90 of absolute error, nMAE = MAE ÷ mean actual (%), n.
- Bias by hour of day (0–23).
- Error histogram, 1 GW bins from −8 GW to +8 GW (outer bins open-ended).
- Daily MAE and bias; worst 10 days by MAE.
- MAE by lead time (`startTime − publishTime`) in 6 h buckets 0–72 h, using **all** runs.

## 6. API

| Endpoint | Params | Response (key fields) |
|---|---|---|
| `GET /api/health` | – | `status`, row counts, run count, data range |
| `GET /api/decision` | `delivery_date` (2026-01-02…2026-02-01), `cutoff` (HH:MM, default 09:00) | `usedRun`, `minutesBeforeCutoff`, `band{q10Error,q90Error}`, `history{days,bias,mae}`, `drift[{publishTime,meanForecast}]`, `driftHours`, `changeVsPrevious`, `changeVs24h`, `metrics`, `points[{time,forecast,low,high,actual,error,horizonH}]` |
| `GET /api/metrics` | – | `metrics`, `byHour[]`, `daily[]`, `worstDays[]`, `histogram[]` |
| `GET /api/metrics/by-horizon` | – | `[{bucket,fromH,mae,bias,n}]` |

- `delivery_date` outside the window → **422** with a readable message.
- No run before cutoff → 200 with `usedRun: null`, empty `points`.

## 7. Screens

App name in the AppBar: **REint Weather Forecast**. Subtitle: "Day-ahead wind outlook and forecast reliability · GB national wind · Pilot: January 2026". Two MUI Tabs. Footer: data source + "times in UTC (= UK time in January)".

Colour meaning is fixed everywhere: **forecast = amber (dashed)**, **actual = teal (solid)**, risk = red.

### 7.1 Day-ahead outlook (default tab)

1. **Header**: "Day-ahead wind outlook" + "Wind forecast for {D} as it stood at {T} on {D-1}, with the error you should expect."
2. **Controls card**: delivery-day DatePicker (min 2 Jan, max 1 Feb) with ‹ › buttons; decision-time Select (00:00–23:00, 09:00 labelled "before auction close"); Switch "Show actual outturn" (off by default).
3. **Run-in-use Alert**: "Forecast run in use: {usedRun}, published {h} h {m} min before the decision time. Later runs are excluded." / no-run message.
4. **Signal card** (amber left border if warning) and **Watch list card**, side by side (stacked on mobile).
5. **KPI cards**: forecast average (GW + MWh); typical error range. With actuals: actual average, bias (red if |bias| > 1.5 GW, hint short/long), MAE.
6. **Hourly outlook chart** (ApexCharts `rangeArea` + `line` combo): P10–P90 band, forecast line dashed; actual line when switch on. X = 00:00–23:00, Y in GW.
7. **Forecast drift**: small ApexCharts line (x = run publish time, y = mean forecast) + two KPI cards: "vs previous run", "vs run 24 h earlier".
8. **Hourly table** (MUI Table): hour, lead time, forecast, low, high; with actuals: actual, error (red if |error| > 3 GW), in range.

### 7.2 Forecast accuracy

1. **Header**: "Forecast accuracy" + "How far the forecast available at 09:00 the day before was from outturn, across every hour of the January 2026 pilot."
2. **KPI cards**: MAE (+ nMAE %), bias (red if > 1 GW), RMSE, P90, hours scored.
3. **Charts** (2×2 grid, ApexCharts bar):
   - Error grows with lead time (MAE by bucket).
   - Bias by hour of day (zero line).
   - Error distribution (bins < 0 teal, ≥ 0 amber).
   - Bias by day (click a bar → open that day in the outlook with actuals on).
4. **Worst 10 days table**: day, MAE, bias, average actual, "Open day →" action (same behaviour as the bar click).

### 7.3 States

Every data area shows MUI Skeleton while loading, an error Alert on failure ("Couldn't load data: {detail}"), and an empty message where applicable.

## 8. Acceptance criteria

Values below come from the January 2026 snapshot.

| ID | Given / When | Then |
|---|---|---|
| AC1 | Delivery 15 Jan, decision 09:00 | Run in use 14 Jan 07:30, "1 h 30 min before"; 24 hourly points |
| AC2 | Delivery 15 Jan, decision 12:00 | Run in use 14 Jan 11:30 |
| AC3 | Delivery 15 Jan, 09:00 | Signal "Forecast likely too high", adjusted ≈ 9.8 GW vs forecast ≈ 11.6 GW; history covers 30 days |
| AC4 | Delivery 15 Jan, 09:00 | Watch list names 17:00 as widest uncertainty and 16:00 as least wind; change vs run 24 h earlier ≈ −0.3 GW |
| AC5 | Delivery 15 Jan, 09:00 | Drift shows 8 runs over 00:00–21:00; "vs previous run" shows "No change" |
| AC6 | Switch "Show actual outturn" on | Actual line, actual/bias/MAE cards, table columns and signal verdict appear |
| AC7 | Every hour | `low ≤ high` |
| AC8 | Delivery date 2026-03-01 via API | HTTP 422 |
| AC9 | Accuracy tab | MAE ≈ 2,023 MW, bias ≈ +1,746 MW, RMSE ≈ 2,497 MW, P90 ≈ 4,154 MW, n = 744; histogram counts sum to 744 |
| AC10 | Accuracy tab | Lead-time chart rises from first to last bucket |
| AC11 | Click 28 Jan in worst days | Outlook opens on 28 Jan with actuals on |
| AC12 | API down | Error Alert shown, no blank page |

## 9. Tests

- **Back end (pytest)**: R1 (latest ≤ cutoff, exact-cutoff allowed, later ignored, none → empty); R2/R9 metrics on a hand-computed example (errors [−100, 0, 300] → MAE 133.3, bias 66.7; RMSE ≥ MAE ≥ |bias|); missing actuals skipped; API tests for AC1, AC2, AC5, AC7, AC8, AC9, AC10.
- **Front end (Vitest + Testing Library, `fetch` mocked)**: signal thresholds (R6); watch-list items (R7); outlook renders run in use / signal / watch list; changing decision time refetches with the new cutoff; switch reveals actual fields (AC6); no-run message; API error Alert (AC12).
- `tsc --noEmit` clean.

## 10. Project layout

```
backend/
  app/data.py      fetch + cache
  app/logic.py     R1–R9 pure functions
  app/main.py      FastAPI routes; serves frontend/dist in production
  data/            January snapshot
  tests/
frontend/
  src/api.ts       types + fetch helper
  src/insights.ts  signal + watch list (pure)
  src/pages/       OutlookPage.tsx, AccuracyPage.tsx
  src/components/  KpiCard, charts
  src/test/
Dockerfile, docker-compose.yml, README.md, specs/ (this file)
```
