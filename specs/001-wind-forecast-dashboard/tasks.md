---

description: "Task list for REint Weather Forecast — Day-Ahead Wind Outlook & Forecast Accuracy"
---

# Tasks: REint Weather Forecast — Day-Ahead Wind Outlook & Forecast Accuracy

**Input**: Design documents from `specs/001-wind-forecast-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md),
[quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Source spec §9 and constitution Article IV ask for them. Domain tests use
small hand-computed fixtures and are written **before** the code they cover, and they must fail
first. Front-end tests check what the user sees, with `fetch` mocked.

**Organization**: tasks are grouped by user story (US1–US5 from spec.md) so each story can be
built and checked on its own.

**Remediation note (2026-10-25)**: T062 and T063 were added after `/speckit-analyze`. Run tasks in
the order they appear in this file, not by ID.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story a task belongs to (US1–US5)
- Paths are relative to the repository root: `backend/…`, `frontend/…`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: project skeletons with pinned dependencies (research D13).

- [X] T001 Create the back-end skeleton: `backend/app/__init__.py` (empty), `backend/tests/__init__.py` (empty), `backend/requirements.txt` with exact `==` pins from research D13 (fastapi 0.115.6, uvicorn[standard] 0.32.1, pandas 2.2.3, numpy 2.2.1, httpx 0.28.1, pytest 8.3.4, ruff 0.8.4), and `backend/pyproject.toml` with `[tool.pytest.ini_options]` `testpaths = ["tests"]` and `pythonpath = ["."]`, plus `[tool.ruff]` with `target-version = "py312"` and `line-length = 100`
- [X] T002 [P] Create the front-end skeleton: `frontend/package.json` with exact versions from research D13 and scripts `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest`) and `typecheck` (`tsc --noEmit`); a strict `frontend/tsconfig.json`; `frontend/vite.config.ts` that proxies `/api` to `http://localhost:8000` and sets the Vitest config (`environment: "jsdom"`, `setupFiles: ["src/test/setup.ts"]`); `frontend/index.html`; a minimal `frontend/src/main.tsx` that renders `<App />`; then run `npm install` to create and commit `frontend/package-lock.json`
- [X] T003 [P] Create the root `.gitignore`, covering `node_modules/`, `frontend/dist/`, `.venv/`, `__pycache__/`, `.pytest_cache/` and `*.pyc`. It MUST NOT ignore `backend/data/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: snapshot, R1 selection, R2 error and core metrics, API shell, front-end shell. All
stories depend on these.

**⚠️ CRITICAL**: no user-story work can begin until this phase is complete.

### Data snapshot (research D1, D2)

- [X] T004 Write failing tests in `backend/tests/test_data.py` for the cleaning functions. Forecast rows with `startTime < publishTime` are dropped. Forecasts are deduplicated on (`publishTime`, `startTime`), keeping the last row. Actuals are deduplicated on `startTime`. All times are parsed as tz-aware UTC. Only the fields `publishTime`, `startTime` and `generation` are kept. Also test `fetch_stream` with `httpx.MockTransport` and a fake `sleep`: 429 → 429 → 200 returns the 200 body after two waits; a `Retry-After: 3` header leads to a 3 s wait; six consecutive 429s raise after 5 retries
- [X] T005 Implement `backend/app/data.py` so that T004 passes:
  - `clean_forecasts(rows)` and `clean_actuals(rows)`.
  - `fetch_stream(url, client=None, sleep=time.sleep)` using `httpx`, retrying on HTTP 429 up to 5 times. It waits for `Retry-After` when present and otherwise backs off exponentially from 1 s.
  - A `python -m app.data --refresh` CLI that fetches the two URLs from research D1 (actuals `settlementDateFrom=2025-12-01&settlementDateTo=2026-02-01&fuelType=WIND`; forecasts `publishDateTimeFrom=2025-11-30T00:00:00Z&publishDateTimeTo=2026-02-02T00:00:00Z`) and writes `backend/data/fuelhh_wind.json`, `backend/data/windfor.json` (sorted, only the used fields) and `backend/data/manifest.json` (`fetchedAt`, `requests[]`, `rows.actuals`, `rows.forecasts`, `runs`).
  - `load_snapshot(data_dir) -> Snapshot`, a `@dataclass(frozen=True, eq=False)` (hashes by identity; research D5) with `actuals` (a pandas Series of MW indexed by UTC `startTime`), `forecasts` (a DataFrame `publishTime`, `startTime`, `generation`, sorted) and `runs` (sorted unique `publishTime`). It raises `SnapshotError` with a readable message when a file is missing or unreadable.
- [X] T006 Run `cd backend && python -m app.data --refresh` to create `backend/data/*.json`. Check that `rows.actuals` is about 3,024 (63 days × 48, 1 Dec 2025 – 1 Feb 2026) and that runs exist for each day from 30 Nov 2025. Commit the snapshot on its own. If Elexon cannot be reached, stop and report; do not invent data

### Domain core: R1, R2, metrics (FR-005, FR-006, FR-013)

- [X] T007 Create `backend/tests/fixtures.py` with `make_snapshot()`, which builds a tiny hand-computed `Snapshot`:
  - Delivery days 2026-01-02 … 2026-01-06, so the R3 tests can use a short trailing window (`history_days=2`).
  - For each day D, runs at D-2 22:30 (covering D only until 21:00), D-1 07:30, D-1 09:00 (exactly at the default cutoff) and D-1 09:30 (after the cutoff), with distinct, easy forecast values per run.
  - Hourly actuals on the hour, plus half-hour rows that must be ignored by the join.
  - Comments giving the expected selections and errors.
  - A `make_snapshot(no_early_runs=True)` variant whose first run is published after 2026-01-01 00:00, so delivery day 2026-01-02 with cutoff 00:00 has no run (used by T020).
- [X] T008 Write failing R1 tests in `backend/tests/test_logic.py` using `fixtures.make_snapshot()`:
  - The newest run with `publishTime ≤ cutoff` is used.
  - A run published exactly at the cutoff counts.
  - Runs after the cutoff are never used.
  - No run before the cutoff → empty result with `usedRun` `None`.
  - Selection is per hour: with a cutoff where only the D-2 22:30 run is available, hours 22:00 and 23:00 have `forecast` `None` and every other field null (research D3).
  - `horizonH = (time − publishTime)` in hours.
  - `minutesBeforeCutoff` = cutoff − `usedRun` in minutes.
  - Only on-the-hour actuals join (research D2).
- [X] T009 Write failing R2/R9 core-metric tests in `backend/tests/test_logic.py`:
  - `error = forecast − actual`.
  - Errors `[−100, 0, 300]` → MAE 133.3, bias 66.7, RMSE 182.6, P90 absolute error 260.0 (linear interpolation, research D4), n 3.
  - `rmse ≥ mae ≥ |bias|`.
  - Hours with a missing actual or forecast are skipped.
  - nMAE = MAE ÷ mean actual × 100.
- [X] T010 Implement `backend/app/logic.py` so that T008 and T009 pass. It is pure, with no I/O:
  - Constants `WINDOW_START = date(2026, 1, 2)`, `WINDOW_END = date(2026, 2, 1)`, `DEFAULT_CUTOFF = "09:00"` and `HISTORY_DAYS = 30`.
  - No caching anywhere in `logic.py` (research D5).
  - `parse_cutoff(s)`, which accepts only `HH:MM` "on the hour, 00:00–23:00" and raises `ValueError` with a plain sentence otherwise.
  - `cutoff_at(day, cutoff)`, which returns (D − 1 day) + cutoff in UTC.
  - `select_forecast(snapshot, day, cutoff)`, which returns `used_run`, `minutes_before_cutoff` and 24 hourly rows (`time`, `forecast`, `publishTime`, `horizonH`, `actual`, `error`).
  - `summarize_metrics(errors, actuals, forecasts)`, which returns `n`, `mae`, `bias`, `rmse`, `p90AbsError`, `nmaePct`, `meanActual`, `meanForecast`, or `None` when n = 0.
  - All values in MW.
- [X] T062 Add a snapshot-wide R1 sweep to `backend/tests/test_logic.py` (SC-001, constitution Art. II). For every delivery day 2026-01-02 … 2026-02-01 and every cutoff 00:00 … 23:00, run `select_forecast` on the real snapshot and assert that every non-null row has `publishTime ≤ cutoff_at(day, cutoff)`, and that no run with `publishTime ≤ cutoff` covering that hour is newer than the one chosen. Also assert that `history_for` (once T032 exists) never draws on a day later than D-2. Mark that part `skip` until T032 is done

### API shell (contracts/api.md)

- [X] T011 Write failing tests in `backend/tests/test_api.py` using FastAPI `TestClient`:
  - `GET /api/health` returns 200 with `status: "ok"`, `rows.actuals > 0`, `rows.forecasts > 0`, `runs > 0`, `range.deliveryDays` = 2026-01-02 … 2026-02-01 and `range.historyDays` = 2025-12-02 … 2026-01-30.
  - With the `get_snapshot` dependency overridden to raise `SnapshotError`, `GET /api/health` returns 500 with `{"detail": "<sentence>"}`.
- [X] T012 Implement `backend/app/main.py` so that T011 passes:
  - A FastAPI app with a `get_snapshot()` dependency, cached with `functools.lru_cache`, that loads `backend/data/`.
  - An exception handler mapping `RequestValidationError` → 422 `{"detail": "<one plain sentence>"}` (research D10).
  - A handler mapping `SnapshotError` → 500 `{"detail": …}`.
  - `GET /api/health` per contracts/api.md.
  - Plain dict caches for results, keyed by `id(snapshot)` plus the request parameters (research D5). They live here, not in `logic.py`.

### Front-end foundation

- [ ] T013 [P] Create `frontend/src/theme.ts`, the single source of colour meaning (Article VI). Export `colors = { forecast: <amber>, actual: <teal>, risk: <red>, neutral: <slate> }` and `seriesStyle = { forecast: { dash: true }, actual: { dash: false } }`, plus the MUI theme built from them
- [ ] T014 [P] Create `frontend/src/format.ts`, all display conversion from MW. `gw(mw)` gives "11.6 GW" (1 decimal). `dayMwh(points)` is the sum of hourly MW × 1 h, formatted as MWh with thousands separators. `hhmm(iso)` returns the UTC "HH:MM". `runLabel(iso)` gives "14 Jan 07:30". `duration(minutes)` gives "1 h 30 min". `signedGw(mw)` gives "+1.7 GW" or "−0.3 GW"
- [ ] T015 [P] Create `frontend/src/api.ts`:
  - TypeScript types mirroring contracts/api.md exactly: `Decision`, `HourlyPoint`, `Metrics`, `RunComparison`, `DriftEntry`, `MetricsReport`, `HorizonBucket` and `HistogramBin`. Nullable fields are typed `| null`.
  - `class ApiError extends Error { detail: string }`.
  - `getJson<T>(path)`, which throws `ApiError` with the response `detail` for non-2xx responses and with the error message for network failures.
  - `fetchDecision(date, cutoff)` (calls `/api/decision?delivery_date=…&cutoff=…`), `fetchMetrics()` and `fetchByHorizon()`.
- [ ] T016 [P] Create `frontend/src/components/DataState.tsx` and `frontend/src/components/KpiCard.tsx`.
  - `DataState` takes `{loading, error, empty, emptyText, children}` and renders, in that priority: an MUI `Skeleton`, an `Alert severity="error"` with the text "Couldn't load data: {detail}", the empty message, or the children.
  - `KpiCard` takes `{label, value, hint?, risk?}`. The value is coloured `colors.risk` when `risk` is set.
- [ ] T017 [P] Create the test setup files.
  - `frontend/src/test/setup.ts` imports `@testing-library/jest-dom/vitest`. It mocks `react-apexcharts` with a stub that renders `<div data-testid="chart">` listing each series `name`, and exposes the `options.chart.events` handlers so tests can call `dataPointSelection`. It also provides `mockFetch(routes)`.
  - `frontend/src/test/fixtures.ts` holds sample `Decision` (15 Jan 09:00, with and without actuals, and no-run), `MetricsReport` and `HorizonBucket[]` objects shaped per contracts/api.md.
- [ ] T018 Write failing `frontend/src/test/App.test.tsx`:
  - The AppBar shows "REint Weather Forecast" and the subtitle "Day-ahead wind outlook and forecast reliability · GB national wind · Pilot: January 2026".
  - There are two tabs, "Day-ahead outlook" (selected by default) and "Forecast accuracy".
  - The footer names the data source (Elexon) and "times in UTC (= UK time in January)".
- [ ] T019 Implement `frontend/src/App.tsx` so that T018 passes:
  - `ThemeProvider` with the theme from T013.
  - `LocalizationProvider` with `AdapterDayjs`, using the dayjs `utc` plugin.
  - AppBar, Tabs and footer.
  - View state `{tab: "outlook" | "accuracy", deliveryDate: "2026-01-02", cutoff: "09:00", showActuals: false}` (research D11), passed to placeholder pages.

**Checkpoint**: the snapshot is loaded, R1/R2/metrics are tested, health works, and the app shell
renders. User stories can now begin.

---

## Phase 3: User Story 1 — See the forecast available at decision time (Priority: P1) 🎯 MVP

**Goal**: choose a delivery day and decision time, then see the run in use, its age and the 24
hourly forecast values.

**Independent Test**: outlook for 15 Jan at 09:00 → run 14 Jan 07:30, "1 h 30 min before", 24
hourly values. Change to 12:00 → run 14 Jan 11:30 (AC1, AC2).

### Tests for User Story 1 ⚠️ (write first, must fail)

- [ ] T020 [P] [US1] Add failing `GET /api/decision` tests to `backend/tests/test_api.py`:
  - **AC1**: `delivery_date=2026-01-15` → `usedRun` `2026-01-14T07:30:00Z`, `minutesBeforeCutoff` 90, `cutoffAt` `2026-01-14T09:00:00Z`, 24 `points` each with `time`, `forecast`, `publishTime`, `horizonH`, `actual`, `error`.
  - **AC2**: `&cutoff=12:00` → `usedRun` `2026-01-14T11:30:00Z`.
  - **AC8**: `delivery_date=2026-03-01` → 422 with `detail` "Delivery date must be between 2026-01-02 and 2026-02-01.".
  - Missing `delivery_date` → 422 with a string `detail`.
  - `cutoff=09:30` and `cutoff=24:00` → 422 ("on the hour, 00:00–23:00").
  - With `get_snapshot` overridden by `make_snapshot(no_early_runs=True)` and `delivery_date=2026-01-02&cutoff=00:00` → 200 with `usedRun: null`, `minutesBeforeCutoff: null` and `points: []`.
- [ ] T021 [P] [US1] Write failing `frontend/src/test/OutlookPage.test.tsx` (`fetch` mocked):
  - The header shows "Day-ahead wind outlook" and "Wind forecast for 15 Jan as it stood at 09:00 on 14 Jan, with the error you should expect."
  - The run-in-use alert reads "Forecast run in use: 14 Jan 07:30, published 1 h 30 min before the decision time. Later runs are excluded."
  - Selecting decision time 12:00 refetches with `cutoff=12:00`.
  - The ‹ › buttons move the day and refetch.
  - A no-run response shows the no-run message and no table or chart.
  - A 500 response shows "Couldn't load data: …" (AC12 for this page).
  - Hours with `forecast: null` show "no forecast for this hour".

### Implementation for User Story 1

- [ ] T022 [US1] Implement `GET /api/decision` in `backend/app/main.py`:
  - Validate `delivery_date` "2026-01-02 ≤ D ≤ 2026-02-01, otherwise 422" and `cutoff` "on the hour, 00:00–23:00, default `09:00`, otherwise 422" through `logic.WINDOW_*` and `logic.parse_cutoff`.
  - Return `deliveryDate`, `cutoff`, `cutoffAt`, `usedRun`, `minutesBeforeCutoff` and `points` from `logic.select_forecast`. Leave `low`/`high` `null` for now.
  - Return the no-run shape from contracts/api.md when `usedRun` is `None`.
  - T020 must pass.
- [ ] T023 [P] [US1] Create `frontend/src/components/ControlsCard.tsx`:
  - An MUI `DatePicker` labelled "Delivery day", with `minDate` 2026-01-02 and `maxDate` 2026-02-01, in UTC.
  - ‹ › `IconButton`s with `aria-label` "Previous day" / "Next day", disabled at the ends of the window.
  - A `Select` labelled "Decision time" with options 00:00–23:00, where 09:00 reads "09:00 (before auction close)".
  - A `Switch` labelled "Show actual outturn".
  - Fully controlled through props.
- [ ] T024 [P] [US1] Create `frontend/src/components/RunInUseAlert.tsx`. It shows "Forecast run in use: {runLabel}, published {duration} before the decision time. Later runs are excluded." when there is a run, or a warning alert "No forecast run was published before {T} on {D-1}, so there is no outlook for this decision time." when `usedRun` is null
- [ ] T025 [P] [US1] Create `frontend/src/components/OutlookChart.tsx`, a `react-apexcharts` chart with x-axis categories 00:00–23:00 and y in GW (via `format.ts`). The series "Forecast" uses `colors.forecast` and is dashed. Null forecasts make gaps
- [ ] T026 [P] [US1] Create `frontend/src/components/HourlyTable.tsx`, an MUI `Table` with columns Hour, Lead time (h), Forecast (GW). A row whose `forecast` is null shows "no forecast for this hour"
- [ ] T027 [US1] Implement `frontend/src/pages/OutlookPage.tsx` so that T021 passes:
  - The header from FR-014.
  - `ControlsCard` bound to the App state.
  - `fetchDecision` on every change of date or cutoff.
  - `DataState` around the alert, KPIs, chart and table.
  - A `KpiCard` "Forecast average" showing GW and the day's MWh.
  - Wire it into `frontend/src/App.tsx`.

**Checkpoint**: US1 works on its own. This is the MVP.

---

## Phase 4: User Story 2 — Understand the expected error for the day (Priority: P1)

**Goal**: show the likely range per hour, the typical error tile, the signal, the watch list and
drift (R3–R8).

**Independent Test**: 15 Jan at 09:00 → raw forecast about 11.6 GW, history of 30 days
(15 Dec – 13 Jan), signal and adjusted figure as recorded in spec AC3, watch list 16:00 least wind
and the widest hour recorded in spec AC4, about −0.3 GW vs 24 h earlier,
drift of 8 runs over 00:00–21:00 with "No change" vs the previous run, `low ≤ high` everywhere
(AC3, AC4, AC5, AC7).

### Tests for User Story 2 ⚠️ (write first, must fail)

- [ ] T028 [US2] Add failing tests to `backend/tests/test_logic.py`, extending `fixtures.make_snapshot()` as needed:
  - **R3**: with `history_days=N`, history for D uses only days D-(N+1) … D-2. It never includes D-1, D or any later day. `days` counts days with at least one scored hour, and a day with missing actuals contributes only its scored hours.
  - **R4**: per-hour `low = forecast − q90(history@h)` and `high = forecast − q10(history@h)` match hand-computed linear quantiles; `low ≤ high` for every hour; `low`/`high` are null where there is no forecast or no history.
  - **R5**: `band.q10Error` / `q90Error` are computed over all history hours.
  - **compare_runs** (research D6): identical runs → `identical` True and `meanChange` 0; a known shift gives the expected `meanChange` and `biggestMove {time, delta}`; only overlapping hours are compared; the 24 h reference is the latest run with `publishTime ≤ usedRun − 24h`; with none, it falls back to the previous run with `basis` "previous"; no earlier run → `None`.
  - **R8 drift**: the last 8 runs ≤ cutoff, the mean over the hours common to all of them, `driftHours {from, to, count}`; fewer than 8 runs → the runs that exist.
- [ ] T029 [P] [US2] Add failing snapshot tests to `backend/tests/test_api.py` for `delivery_date=2026-01-15`:
  - **AC3**: `history.days == 30`; mean of `points.forecast` ≈ 11,600 MW (±50). The adjusted value (mean − `history.bias`) and the signal level are TBR: write those assertions with `pytest.skip("TBR - see T063")` until T063 records the values in spec.md.
  - **AC4**: the hour of min `forecast` is 16; `changeVs24h.meanChange` ≈ −300 MW (±50). The hour of max(`high − low`) is TBR (skip until T063).
  - **AC5**: `len(drift) == 8`; `driftHours` is `{from: "00:00", to: "21:00", count: 22}`; `changeVsPrevious.identical` is true.
  - **AC7**: `low ≤ high` for every point.
- [ ] T030 [P] [US2] Write failing `frontend/src/test/insights.test.ts`:
  - **R6 thresholds**: bias 501 → `level` "high", "Forecast likely too high"; 500 → "close", "Forecast has been close to target"; −500 → "close"; −501 → "low", "Forecast likely too low". The text contains the bias, the adjusted figure and the raw forecast mean in GW.
  - **R7 order**: widest, leastWind, ramp, change. Ramp is omitted at 499 MW and shown at 500 MW. "No change" when `identical`. The wording names the fallback when `basis` is "previous". Items are skipped when their inputs are null.
- [ ] T031 [P] [US2] Extend `frontend/src/test/OutlookPage.test.tsx`: the signal card title and text render; the watch-list items render in order; the drift chart shows run series; the "vs previous run" card reads "No change"; the "vs run 24 h earlier" card shows "−0.3 GW"; the covered-hours note "00:00–21:00" appears when `driftHours.count < 24`; the "Typical error range" KPI renders

### Implementation for User Story 2

- [ ] T032 [US2] Add the following to `backend/app/logic.py` so that T028 passes:
  - `history_for(snapshot, day, cutoff, history_days=HISTORY_DAYS)`, which takes the R1 errors of days D-(N+1) … D-2 at the same cutoff (research D5) and returns `days`, `bias`, `mae` and per-hour q10/q90. It is not cached.
  - `apply_band(points, history)` (R4) and `overall_band(history)` (R5).
  - `compare_runs(snapshot, day, used_run, basis)` (R7.4, D6).
  - `drift(snapshot, day, cutoff)` (R8, D7).
- [ ] T033 [US2] Cache the full decision payload in `backend/app/main.py`, keyed by `(id(snapshot), delivery_date, cutoff)` (research D5). Extend `GET /api/decision` to return `band{q10Error,q90Error}`, `history{days,bias,mae}`, `low`/`high` on points, `drift[]`, `driftHours`, `changeVsPrevious` and `changeVs24h` per contracts/api.md (null rules included). T029 must pass
- [ ] T063 [US2] Fill in the TBR values (constitution Art. I and VIII):
  - Call `GET /api/decision?delivery_date=2026-01-15` on the real snapshot and record the signal level, the adjusted average (GW, 1 decimal) and the widest-uncertainty hour.
  - Present them to the human owner for review, then write them into AC3/AC4 in `specs/001-wind-forecast-dashboard/spec.md`, replacing "TBR" and keeping the decision notes. Commit that on its own.
  - Replace the `pytest.skip("TBR …")` placeholders in `backend/tests/test_api.py` (T029) with real assertions (±50 MW, exact hour) and update the matching quickstart rows. T029 must then pass with no skips.
- [ ] T034 [P] [US2] Implement `frontend/src/insights.ts`, pure with no React, so that T030 passes. Define the constants `SIGNAL_THRESHOLD_MW = 500` and `RAMP_THRESHOLD_MW = 500`. `signal(decision)` returns `{level, title, text}` with `adjusted = mean(non-null forecast) − history.bias`. `watchList(decision)` returns `WatchItem[]` in the R7 order
- [ ] T035 [P] [US2] Create `frontend/src/components/SignalCard.tsx`, which has an amber left border (`colors.forecast`) when `level !== "close"`. Create `frontend/src/components/WatchListCard.tsx`, an ordered list. Lay them out side by side (`Grid item xs={12} md={6}`) and stacked on small screens
- [ ] T036 [P] [US2] Create `frontend/src/components/DriftPanel.tsx`: a small ApexCharts line (x = `runLabel(publishTime)`, y = `meanForecast` in GW), a "Covers {from}–{to}" note when `driftHours.count < 24`, and two `KpiCard`s, "vs previous run" and "vs run 24 h earlier". Each shows `signedGw(meanChange)` with the biggest single-hour move as the hint, or "No change" when `identical`
- [ ] T037 [US2] Integrate into `frontend/src/pages/OutlookPage.tsx` so that T031 passes:
  - Add a `rangeArea` series "Likely range (P10–P90)" to `frontend/src/components/OutlookChart.tsx`.
  - Add Low and High (GW) columns to `frontend/src/components/HourlyTable.tsx`.
  - Add a "Typical error range" `KpiCard` showing `forecast mean − q90 … forecast mean − q10` in GW.
  - Render `SignalCard`, `WatchListCard` and `DriftPanel`.

**Checkpoint**: US1 and US2 both work. The outlook is complete for decision-making.

---

## Phase 5: User Story 3 — Check the outlook against what actually happened (Priority: P2)

**Goal**: the "Show actual outturn" switch reveals the actual line, the day's metrics, per-hour
errors and the signal verdict (AC6).

**Independent Test**: toggle the switch on 15 Jan. The actual line, the actual / bias / MAE
cards, the actual / error / in-range columns and the verdict appear, and they disappear when it is
toggled off.

### Tests for User Story 3 ⚠️ (write first, must fail)

- [ ] T038 [P] [US3] Add a failing test to `backend/tests/test_api.py`: for `delivery_date=2026-01-15`, `metrics` is not null, `metrics.n == 24` and `rmse ≥ mae ≥ |bias|`. A fixture day without actuals → `metrics: null`
- [ ] T039 [P] [US3] Add failing tests to `frontend/src/test/insights.test.ts`: `signal(decision, {showActuals: true}).verdict` says the adjusted figure was closer when |adjusted − mean actual| < |forecast mean − mean actual|, and says the raw forecast was closer otherwise. There is no verdict when `showActuals` is false
- [ ] T040 [P] [US3] Extend `frontend/src/test/OutlookPage.test.tsx` for **AC6**:
  - With the switch off (default), there is no "Actual" series, no Actual/Error/In range columns, no actual-average, bias or MAE cards, and no verdict.
  - With it on, all of these appear.
  - The bias card is risk-coloured when |bias| > 1 GW (test +1.2 GW and −1.2 GW coloured, +0.9 GW not) and hints short (positive) or long (negative).
  - Error cells are risk-coloured when |error| > 3 GW.

### Implementation for User Story 3

- [ ] T041 [US3] Add `metrics` (from `logic.summarize_metrics` over the day's scored hours) to `GET /api/decision` in `backend/app/main.py`. T038 must pass
- [ ] T042 [US3] Add the verdict to `signal()` in `frontend/src/insights.ts` (an `options.showActuals` flag). T039 must pass
- [ ] T043 [US3] Implement the actuals view in `frontend/src/pages/OutlookPage.tsx`, `frontend/src/components/OutlookChart.tsx` and `frontend/src/components/HourlyTable.tsx`, so that T040 passes:
  - An "Actual" series in `colors.actual`, solid.
  - `KpiCard`s "Actual average", "Bias" (risk when |bias| > 1 GW; hint "Forecast too high — buyer would be short" for positive and "Forecast too low — buyer would be long" for negative) and "MAE".
  - Table columns Actual, Error (risk when |error| > 3 GW) and In range (`low ≤ actual ≤ high` → "Yes" or "No").
  - The verdict text in `SignalCard`.
  - Everything is shown only when `showActuals` is on.

**Checkpoint**: US1–US3 all work.

---

## Phase 6: User Story 4 — Evaluate forecast accuracy across the pilot (Priority: P2)

**Goal**: the accuracy screen, with R9 headline metrics, four charts and the worst-10-days table.

**Independent Test**: the accuracy tab shows MAE ≈ 2,023 MW, bias ≈ +1,746 MW, RMSE ≈ 2,497 MW,
P90 ≈ 4,154 MW and n = 744; the histogram sums to 744; the lead-time chart rises (AC9, AC10).

### Tests for User Story 4 ⚠️ (write first, must fail)

- [ ] T044 [US4] Add failing R9 breakdown tests to `backend/tests/test_logic.py` (hand-computed fixtures):
  - `by_hour` returns 24 entries `{hour, bias, mae, n}`.
  - `daily` returns one entry per day `{date, mae, bias, meanActual, n}`.
  - `worst_days` returns the top 10 by `mae`, descending.
  - `histogram` returns "16 bins, outer bins open-ended, `Σ count = n`". Edges are `[from, to)` in 1 GW steps from −8 to +8 GW. −7,000 MW falls in `[−7, −6)`, −7,001 in "< −7 GW", +7,000 in "≥ +7 GW", and +6,999 in `[6, 7)`.
  - `by_horizon` returns 12 buckets `[0,6) … [66,72)` labelled "0–6 h" and so on, uses all runs but scores only target hours within the pilot delivery days 2026-01-02 … 2026-02-01 (a December target hour in the fixture is ignored), and excludes horizons ≥ 72 h.
- [ ] T045 [P] [US4] Add failing tests to `backend/tests/test_api.py`:
  - **AC9**: `GET /api/metrics` → `metrics.n == 744`; `mae` ≈ 2,023, `bias` ≈ 1,746, `rmse` ≈ 2,497 and `p90AbsError` ≈ 4,154 (each ±1 MW after rounding); `sum(histogram.count) == 744`; `len(byHour) == 24`; `len(daily) == 31`; `worstDays` has ≤ 10 entries sorted by `mae` descending.
  - **AC10**: `GET /api/metrics/by-horizon` → 12 ascending buckets, with the last bucket's `mae` greater than the first's.
  - Both endpoints return 500 `{"detail": …}` when `get_snapshot` raises `SnapshotError`.
- [ ] T046 [P] [US4] Write failing `frontend/src/test/AccuracyPage.test.tsx`:
  - The header shows "Forecast accuracy" and "How far the forecast available at 09:00 the day before was from outturn, across every hour of the January 2026 pilot."
  - The KPIs are MAE (with nMAE %), Bias (risk-coloured when |bias| > 1 GW, either sign; test +1.2 GW and −1.2 GW), RMSE, P90 and Hours scored (744).
  - The four chart titles render: "Error by lead time", "Bias by hour of day", "Error distribution" (with legend text "forecast too low" and "forecast too high") and "Bias by day".
  - The worst-days table has 10 rows, each with an "Open day →" button.
  - A failed fetch shows "Couldn't load data: …" in each data area.

### Implementation for User Story 4

- [ ] T047 [US4] Add `by_hour`, `daily`, `worst_days`, `histogram`, `by_horizon` and `accuracy_report(snapshot)` (decision time 09:00, not cached) to `backend/app/logic.py`. T044 must pass
- [ ] T048 [US4] Add `GET /api/metrics` and `GET /api/metrics/by-horizon` to `backend/app/main.py` per contracts/api.md, caching the report keyed by `id(snapshot)`. T045 must pass
- [ ] T049 [P] [US4] Create `frontend/src/components/AccuracyCharts.tsx`, four ApexCharts bar charts in a 2×2 MUI `Grid` (stacked on small screens):
  - "Error by lead time" (MAE by bucket).
  - "Bias by hour of day", with a zero-line y-annotation.
  - "Error distribution": every bin in `colors.neutral` (slate), an x-annotation at 0 in `colors.risk`, and the labels "forecast too low" left of zero and "forecast too high" right of zero.
  - "Bias by day", which accepts an `onOpenDay(date)` prop.
  - Values are shown in GW.
- [ ] T050 [P] [US4] Create `frontend/src/components/WorstDaysTable.tsx`, an MUI `Table` with columns Day, MAE, Bias and Average actual (GW), plus an "Open day →" `Button` per row that calls `onOpenDay(date)`
- [ ] T051 [US4] Implement `frontend/src/pages/AccuracyPage.tsx` so that T046 passes. It shows the header, the KPI cards, `AccuracyCharts` and `WorstDaysTable`. It uses `fetchMetrics` and `fetchByHorizon`, each data area wrapped in `DataState`. Wire it into `frontend/src/App.tsx`

**Checkpoint**: both screens work on their own.

---

## Phase 7: User Story 5 — Drill from a bad day into its outlook (Priority: P3)

**Goal**: clicking a day on the accuracy screen opens that day's outlook with actuals on (AC11).

**Independent Test**: click "Open day →" for 28 Jan. The outlook tab opens on 28 Jan with "Show
actual outturn" on.

- [ ] T052 [US5] Extend `frontend/src/test/App.test.tsx` with failing **AC11** tests. Clicking "Open day →" on the 28 Jan row selects the "Day-ahead outlook" tab, the date shows 28 Jan, the "Show actual outturn" switch is checked, and `fetch` is called with `delivery_date=2026-01-28`. Calling the stubbed bias-by-day chart's `dataPointSelection` handler for 28 Jan does the same
- [ ] T053 [US5] Implement `onOpenDay(date)` in `frontend/src/App.tsx`, setting `{tab: "outlook", deliveryDate: date, showActuals: true}`. Pass it through `frontend/src/pages/AccuracyPage.tsx` to `WorstDaysTable` and to the "Bias by day" chart's `chart.events.dataPointSelection` in `frontend/src/components/AccuracyCharts.tsx`. T052 must pass

**Checkpoint**: all user stories work.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T054 Serve the built front end. In `backend/app/main.py`, mount `StaticFiles(directory=DIST_DIR, html=True)` at `/` after all `/api` routes, only when the directory exists. Resolve `DIST_DIR = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))` (research D14). Add a test in `backend/tests/test_api.py` that `/api/health` still works when the mount is present
- [ ] T055 [P] Create a multi-stage `Dockerfile`. A `node:20.18-alpine` stage runs `npm ci && npm run build` in `frontend/`. A `python:3.12-slim` stage installs `backend/requirements.txt`, copies `backend/` to `/app/backend` and the build output to `/app/frontend/dist`, sets `FRONTEND_DIST=/app/frontend/dist` (research D14), exposes 8000 and runs `uvicorn app.main:app --host 0.0.0.0 --port 8000` from `backend/`
- [ ] T056 [P] Create `docker-compose.yml` (one service, port `8000:8000`) and `.dockerignore` (excluding `node_modules`, `.venv`, `frontend/dist`, `.git`, `specs`)
- [ ] T057 [P] Write `README.md`. Include what the app does, the local, Docker and test commands (from quickstart.md), how to refresh the snapshot, the data source (Elexon BMRS FUELHH and WINDFOR, January 2026 snapshot), "times in UTC", and an **AI usage** section stating that AI tools generated code, tests and docs from the constitution and spec, with a human reviewing every change (Article VIII)
- [ ] T058 Add a whole-app **AC12** test to `frontend/src/test/App.test.tsx`. With every `fetch` rejecting, the AppBar, tabs and footer still render, and each data area on both tabs shows "Couldn't load data: …". Nothing is blank
- [ ] T059 Accessibility pass (Article VI, FR-029). Add a test to `frontend/src/test/OutlookPage.test.tsx` that uses `userEvent.tab()` to reach, in order, the tabs, Delivery day, Previous day, Next day, Decision time and Show actual outturn, each found by its accessible name. Fix any missing labels in `frontend/src/components/ControlsCard.tsx`
- [ ] T060 Run `cd backend && ruff check . && pytest`, `cd frontend && npm test -- --run` and `npx tsc --noEmit`. All must pass with no TypeScript type errors and no ruff errors (Python is not type-checked); fix any failures in the files involved
- [ ] T061 Run every scenario in `specs/001-wind-forecast-dashboard/quickstart.md`, both API and UI, locally and with `docker compose up --build`. Record any pinned version that had to change in the table in `specs/001-wind-forecast-dashboard/research.md` (D13). Record any AC value that differs from the snapshot in `specs/001-wind-forecast-dashboard/spec.md` first (Article I) before changing code or tests. Also check SC-004: on a freshly started server, time `GET /api/decision?delivery_date=2026-01-15` for each of the 24 cutoffs. Every first (uncached) response must take under 2 s; record the slowest time in the PR description

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: depends on Setup and BLOCKS all stories. T006 (the real snapshot)
  is needed by every snapshot-based API test (AC1–AC10).
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after Foundational. It extends `/api/decision` (T022) and the outlook page
  (T027), so in practice it follows US1.
- **US3 (Phase 5)**: after US1 (it extends the outlook page). T042 also needs T034 (US2's
  `insights.ts`).
- **US4 (Phase 6)**: after Foundational only, so it can run in parallel with US1–US3.
- **US5 (Phase 7)**: after US1 and US4.
- **Polish (Phase 8)**: after the desired stories. T055 to T057 can start any time after Setup.

### User Story Dependency Graph

```text
Setup → Foundational ─┬─ US1 (MVP) ─┬─ US2 ── US3
                      │             └───────────┐
                      └─ US4 ────────────────── US5 → Polish
```

### Within Each User Story

- Tests are written first and must fail. Then logic (`logic.py` / `insights.ts`), then API route
  (`main.py`), then components, then page integration.
- `backend/app/logic.py`, `backend/app/main.py`, `backend/tests/test_logic.py` and
  `backend/tests/test_api.py` are shared files, so tasks touching the same one run in sequence.

### Parallel Opportunities

- Setup: T002 and T003 alongside T001.
- Foundational: T013–T017 (front end) in parallel with each other and with the back-end chain
  T004 → T012.
- US1: T020 and T021 together; T023–T026 together after T021.
- US2: T029, T030 and T031 together (T028 shares `test_logic.py` with nothing else running);
  T034, T035 and T036 together.
- US3: T038, T039 and T040 together.
- US4: T045 and T046 together; T049 and T050 together. The whole of US4 can run beside US1–US3.

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "T020 [US1] /api/decision tests (AC1, AC2, AC8, no-run) in backend/tests/test_api.py"
Task: "T021 [US1] OutlookPage tests in frontend/src/test/OutlookPage.test.tsx"

# After T022, the components, together:
Task: "T023 [US1] ControlsCard in frontend/src/components/ControlsCard.tsx"
Task: "T024 [US1] RunInUseAlert in frontend/src/components/RunInUseAlert.tsx"
Task: "T025 [US1] OutlookChart in frontend/src/components/OutlookChart.tsx"
Task: "T026 [US1] HourlyTable in frontend/src/components/HourlyTable.tsx"
```

## Parallel Example: User Story 4

```bash
Task: "T045 [US4] /api/metrics + by-horizon tests in backend/tests/test_api.py"
Task: "T046 [US4] AccuracyPage tests in frontend/src/test/AccuracyPage.test.tsx"
# after T048:
Task: "T049 [US4] AccuracyCharts in frontend/src/components/AccuracyCharts.tsx"
Task: "T050 [US4] WorstDaysTable in frontend/src/components/WorstDaysTable.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup, then Phase 2 Foundational (including the committed snapshot).
2. Phase 3 US1, then **stop and check** AC1, AC2 and AC8 using quickstart.md.
3. The MVP is the honest as-of forecast: no hindsight, with an explicit no-run state.

### Incremental Delivery

1. US1 gives the forecast in use.
2. US2 adds the range, signal, watch list and drift. The outlook is now decision-ready (AC3–AC5,
   AC7).
3. US3 adds the review against actuals (AC6).
4. US4 adds the accuracy screen (AC9, AC10). It can be built alongside steps 1–3.
5. US5 adds the drill-down (AC11), then Polish: Docker, README, AC12 and accessibility.

---

## Notes

- Every rule R1–R9 and every AC1–AC12 is covered by at least one task with a test (SC-006):
  - R1: T008, T020, T062
  - R2/R9: T009, T044, T045
  - R3–R5: T028, T029, T062
  - R6: T030, T039
  - R7: T028, T030
  - R8: T028, T029
  - AC1/AC2/AC8: T020
  - AC3/AC4/AC5/AC7: T029, T063
  - AC6: T040
  - AC9/AC10: T045
  - AC11: T052
  - AC12: T021, T046, T058
- If an AC reference value does not match the snapshot, update the spec first (Article I). Never
  loosen a test to pass.
- Units: MW in all back-end values and API fields; GW only through `frontend/src/format.ts`.
- Stop at any checkpoint to check a story on its own.
