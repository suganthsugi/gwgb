# Research: REint Weather Forecast

**Feature**: [spec.md](./spec.md) · **Source**: [source-spec.md](./source-spec.md) · **Date**: 2026-10-25

The stack is fixed by the source spec, so there were no open `NEEDS CLARIFICATION` items.
This file records the design decisions the spec leaves open.

## D1. Fetching the snapshot from Elexon

- **Decision**: `backend/app/data.py` has a CLI (`python -m app.data --refresh`) that calls the two
  `/stream` endpoints once with `httpx`. It retries on HTTP 429 up to 5 times, waiting for
  `Retry-After` or else backing off exponentially from 1 s. It writes `backend/data/fuelhh_wind.json`
  and `backend/data/windfor.json` with only the fields we use, sorted, plus
  `backend/data/manifest.json` (fetch time, request URLs, row counts). At runtime the app only
  **reads** the snapshot and never calls Elexon.
- **Fetch range** (amended 2026-10-25, analysis C1): actuals use
  `settlementDateFrom=2025-12-01&settlementDateTo=2026-02-01`, and forecasts use
  `publishDateTimeFrom=2025-11-30T00:00:00Z&publishDateTimeTo=2026-02-02T00:00:00Z`. This way
  every pilot day has 30 days of history (D-31 … D-2 reaches 2 Dec 2025 for D = 2 Jan).
  `fetch_stream` takes injectable `client` and `sleep` arguments so the 429 retry can be tested
  with `httpx.MockTransport`.
- **Rationale**: Article V (no background jobs, committed snapshot) and Article VII (reproducible).
  The app works when Elexon is down.
- **Alternatives**: fetching on startup with a cache (rejected: startup then depends on the
  network); storing in SQLite (rejected: Article V).

## D2. Cleaning and joining

- **Decision**: Parse all times as tz-aware UTC. For forecasts, drop rows where
  `startTime < publishTime`, then deduplicate on (`publishTime`, `startTime`), keeping the last
  row. For actuals, deduplicate on `startTime`. Join forecast to actual on equal `startTime`,
  using the half-hour that **starts on the hour**. The two half-hours are not averaged.
- **Rationale**: This is stated in source spec §4 ("forecast `startTime` = actual `startTime`").
- **Alternatives**: averaging both half-hours into an hourly mean (rejected: contradicts the spec;
  would need a spec change first).

## D3. R1 selection when the newest run does not cover every hour

- **Decision**: Selection is **per hour**. For each hour of D, take the row from the newest run
  with `publishTime ≤ cutoff` that covers that hour. `usedRun` is the newest publish time among
  the selected rows. An hour that no run covers gets `forecast: null` and is shown as
  "no forecast for this hour". It is excluded from every metric and never filled in.
  This happens for early cutoffs, where the newest run is from D-2 and stops at 21:00.
- **Rationale**: This follows R1 literally and Article III (explicit empty state, no guess).
- **Spec follow-up**: an edge-case line has been added to `spec.md` (decision note, Article I).

## D4. Percentiles

- **Decision**: Linear interpolation (`numpy.quantile(..., method="linear")`, which is pandas'
  default) for P10/P90 in R4/R5 and for the P90 of absolute error in R9.
- **Rationale**: It is the standard default. AC9's P90 ≈ 4,154 MW is checked against the
  snapshot, which confirms the method.
- **Alternatives**: nearest-rank (rejected: steps more on small samples, such as 30 values per
  hour).

## D5. History (R3) and caching

- **Decision** (amended 2026-10-25, analysis C1 and M1):
  - History for D at cutoff T is the R1 errors of days D-31 … D-2 at T (`HISTORY_DAYS = 30`). These
    are the days whose delivery ended before the cutoff. `history.days` is the number of those days
    with at least one scored hour (30 for AC3: 15 Dec – 13 Jan).
  - `logic.py` stays pure and uncached.
  - `Snapshot` is `@dataclass(frozen=True, eq=False)`, so it hashes by identity and never tries to
    hash its DataFrames.
  - `main.py` keeps a plain dict cache of decision payloads keyed by
    `(id(snapshot), delivery_date, cutoff)`, plus one accuracy report keyed by `id(snapshot)`.
- **Rationale**: Each day needs at most 30 × 24 R1 selections, which is cheap. Caching at the API
  edge keeps repeat requests instant (SC-004) without background jobs, and keeps domain functions
  free of hidden state (Article III).

## D6. Comparing two runs (R7 item 4, "vs previous run")

- **Decision**: Compare over the hours of D that **both** series cover.
  `meanChange = mean(used − other)`. `biggestMove = {time, delta}` is the hour with the largest
  `|delta|`. `identical = all deltas == 0`. The "24 h earlier" reference is the latest run with
  `publishTime ≤ usedRun − 24h`. If there is none, use the previous run and set `basis: "previous"`.
  "Previous run" is the latest run with `publishTime < usedRun` that covers D.
- **Rationale**: Comparing different sets of hours would mix a change in the forecast with a
  change in coverage.

## D7. Drift (R8)

- **Decision**: Take the last 8 runs with `publishTime ≤ cutoff` that cover any hour of D, or
  fewer if fewer exist. Find the hours covered by **all** of them. Each run's value is its mean
  forecast over those hours. `driftHours = {from, to, count}`. The UI states the range when
  `count < 24`.
- **Rationale**: This is R8 as written. AC5 expects 00:00–21:00 because D-2 runs are among the 8.

## D8. Accuracy buckets and histogram (R9)

- **Decision**:
  - Histogram: 16 bins of 1 GW edges from −8 to +8 GW. The first bin is "< −7 GW" and the last
    is "≥ +7 GW" (open-ended). Each bin is `[from, to)`.
  - Lead time: `startTime − publishTime` in hours, buckets `[0,6), [6,12) … [66,72)`, using
    **all** runs. Only rows whose target hour falls in the pilot delivery days (2 Jan – 1 Feb
    2026) and that have an actual are scored, so December history data is not included. Rows at
    72 h or more are excluded and counted in `excluded`.
  - Worst days: sorted by MAE descending, top 10.
  - nMAE = MAE ÷ mean actual over the same scored hours.
- **Rationale**: This matches R9. The totals checks (histogram sums to n = 744) are testable.

## D9. Where the signal and watch list are computed

- **Decision**: The back end returns the raw ingredients (`history.bias`, `points[]`,
  `changeVs24h`, `changeVsPrevious`). The R6 signal text and R7 watch list are pure functions in
  `frontend/src/insights.ts`, as in source spec §10. Thresholds (±500 MW, ramp ≥ 500 MW) are
  named constants. The back end computes everything numeric that needs history or other runs.
- **Rationale**: This keeps wording and UI rules beside the UI. Both halves are pure and
  unit-tested (Articles III, IV).

## D10. Validation errors

- **Decision**: `delivery_date` outside 2026-01-02…2026-02-01, or `cutoff` not `HH:MM` on the
  hour from 00:00 to 23:00, → HTTP 422 with `{"detail": "<plain sentence>"}`. FastAPI's default
  422 for unparseable values is replaced by the same single-string `detail` shape, so the front
  end shows one readable message.
- **Rationale**: AC8, FR-030, Article VI wording.

## D11. Front-end structure and state

- **Decision**: `App.tsx` holds `{tab, deliveryDate, cutoff, showActuals}`. "Open day →" and the
  bias-by-day bar click set `{tab: outlook, deliveryDate, showActuals: true}` (AC11). The switch is
  client-side only, because the API always returns actuals. Dates use `dayjs` with its `utc`
  plugin through `AdapterDayjs`. The fetch helper throws `ApiError(detail)`, and every data area
  renders Skeleton, `Alert` ("Couldn't load data: {detail}") or content.
- **Rationale**: Two screens and no router (Article V). Showing actuals stays a review mode that
  is off by default; nothing in the outlook's numbers depends on it (Article II).
- **Alternatives**: URL routing or React Router (rejected: extra dependency, not needed).

## D12. Charts

- **Decision**: `react-apexcharts` with a combo chart: a `rangeArea` series for the P10–P90 band
  plus `line` series for the forecast (amber, dashed) and actual (teal, solid). ApexCharts ≥ 3.41
  supports `rangeArea`. Colours come from one `theme.ts` token map (forecast, actual, risk and a
  neutral slate). The error-distribution bins are neutral slate, with a red x-annotation at 0 and
  the labels "forecast too low" / "forecast too high" (spec FR-024). In Vitest,
  `react-apexcharts` is mocked with a stub that renders series names, so tests check what is
  shown, not SVG.
- **Rationale**: Article V (chosen libraries) and Article VI (fixed colour meaning in one place).

## D13. Packaging and pinned versions

- **Decision**: A multi-stage `Dockerfile`: `node:20.18-alpine` builds `frontend/dist`, then
  `python:3.12-slim` runs `uvicorn app.main:app`. FastAPI mounts `frontend/dist` at `/` after the
  `/api` routes. `docker-compose.yml` exposes port 8000. In development, Vite proxies `/api` to
  `:8000`.
  Exact pins (`==` in `backend/requirements.txt`, exact versions plus a committed
  `package-lock.json`):

  | Back end | Version | Front end | Version |
  |---|---|---|---|
  | fastapi | 0.115.6 | react / react-dom | 18.3.1 |
  | uvicorn[standard] | 0.32.1 | @mui/material, @mui/icons-material | 5.16.14 |
  | pandas | 2.2.3 | @emotion/react / @emotion/styled | 11.14.0 |
  | numpy | 2.2.1 | @mui/x-date-pickers | 7.22.2 |
  | httpx | 0.28.1 | dayjs | 1.11.13 |
  | pytest | 8.3.4 | apexcharts / react-apexcharts | 3.54.1 / 1.4.1 |
  | ruff (lint only) | 0.8.4 | vite / @vitejs/plugin-react | 5.4.11 / 4.3.4 |
  | | | typescript | 5.6.3 |
  | | | vitest / jsdom | 2.1.8 / 25.0.1 |
  | | | @testing-library/react / user-event / jest-dom | 16.1.0 / 14.5.2 / 6.6.3 |

  If a listed version cannot be installed, pick the nearest patch release and update this table
  in the same commit.
- **Rationale**: Article VII. ruff is the Python lint gate; Python is not type-checked (Article IV).

## D14. Locating the built front end

- **Decision**: `main.py` resolves
  `DIST_DIR = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))`
  and mounts it only if it exists. The Docker image copies `backend/` to `/app/backend` and the
  build to `/app/frontend/dist`, and sets `FRONTEND_DIST=/app/frontend/dist`.
- **Rationale**: This works the same from a checkout and in the image, whatever the working
  directory (analysis M8).
