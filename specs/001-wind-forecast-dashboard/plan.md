# Implementation Plan: REint Weather Forecast — Day-Ahead Wind Outlook & Forecast Accuracy

**Branch**: `001-wind-forecast-dashboard` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-wind-forecast-dashboard/spec.md` (technical
inputs from [source-spec.md](./source-spec.md) §3, §6, §9, §10)

## Summary

A two-screen web app for a GB power buyer. **Day-ahead outlook** shows the hourly wind forecast
exactly as it stood at a chosen decision time on D-1 (R1), with a history-based likely range,
signal, watch list and drift (R3–R8). **Forecast accuracy** scores the 09:00 forecast against
outturn across the January 2026 pilot (R9). A FastAPI and pandas back end serves pure domain
functions over a committed Elexon snapshot. A React, MUI and ApexCharts front end renders them.
Both ship in a single Docker image.

## Technical Context

**Language/Version**: Python 3.12 (back end); TypeScript 5.6 on Node 20.18 (front end)

**Primary Dependencies**: FastAPI, pandas, numpy, httpx, uvicorn; React 18, MUI v5,
`@mui/x-date-pickers` with dayjs, ApexCharts with `react-apexcharts`, Vite. Exact pins are in
[research.md D13](./research.md#d13-packaging-and-pinned-versions).

**Storage**: committed JSON snapshot in `backend/data/` (no database)

**Testing**: pytest with FastAPI `TestClient` (back end); Vitest, Testing Library and jsdom with
mocked `fetch` and a stubbed `react-apexcharts` (front end); gates are `tsc --noEmit` and
`ruff check` (Python is linted, not type-checked)

**Target Platform**: Linux container (python:3.12-slim) serving desktop browsers

**Project Type**: web application (back end + front end)

**Performance Goals**: outlook refresh < 2 s after a control change (SC-004); per-cutoff history
memoised (research D5)

**Constraints**: offline-capable at runtime (snapshot only); all times UTC; MW/MWh internal and
GW for display only; no auth, database or background jobs

**Scale/Scope**: 31 delivery days × 24 h plus 30 history days each; about 3k actual rows
(Dec 2025 – Feb 2026); several hundred forecast runs;
2 screens; 4 endpoints; a handful of internal users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I. Spec is source of truth | Design adds no behaviour beyond the spec. The one new case (hours no run covers) is written into `spec.md` Edge Cases with a decision note before code. FR/R/AC IDs are carried into contracts and tests. | ✅ |
| II. No hindsight | R1 filters `publishTime ≤ cutoffAt` in one pure function used by outlook, history, drift and metrics. History is days D-31 … D-2 only, whose delivery ended before the cutoff (constitution v1.1.0). The actuals switch only shows data; it changes no outlook number. R1 tests cover latest, exact cutoff, later ignored and none, plus a sweep of every day × cutoff in the snapshot (T062). | ✅ |
| III. Correct numbers | All R1–R9 maths is in `backend/app/logic.py` and R6/R7 wording in `frontend/src/insights.ts`, both pure. MW internally, GW only in formatters. Error = forecast − actual. Null and empty states for missing hours and no run (D3). | ✅ |
| IV. Test first for logic | Hand-computed fixtures for R1, R2/R9, R4 and R6/R7 are written before the logic. Every endpoint has a success test and an error test. Front-end tests check visible behaviour. `tsc --noEmit` and `ruff check` are gates. | ✅ |
| V. Simplicity | Two tabs, no router, no database, no jobs. Data is fetched once by a CLI. Only the chosen libraries plus dayjs (the date-picker adapter the spec's DatePicker requires) and uvicorn/numpy (needed by FastAPI and pandas). ruff is a dev-only lint tool (Art. IV). | ✅ |
| VI. Consistent, honest UI | One colour-token map (amber dashed, teal solid, red risk). Skeleton, Alert and empty state in every data area. Labelled, keyboard-reachable controls. Plain buyer wording. | ✅ |
| VII. Reproducible | Exact version pins and a lockfile. Snapshot committed. Quickstart commands. Docker image and compose file. | ✅ |
| VIII. AI-assisted, human-owned | The README declares AI use. A human reviews every change. | ✅ |

**Post-design re-check (after Phase 1)**: ✅ all gates still pass. The contracts expose no data
published after the cutoff in outlook fields. `actual` and `error` are present but only shown in
review mode.

## Project Structure

### Documentation (this feature)

```text
specs/001-wind-forecast-dashboard/
├── spec.md              # business spec (/speckit-specify)
├── source-spec.md       # original product & technical input (verbatim)
├── plan.md              # this file
├── research.md          # Phase 0 decisions D1–D13
├── data-model.md        # Phase 1 entities and derived values
├── quickstart.md        # Phase 1 run and validation guide
├── contracts/api.md     # Phase 1 HTTP contract
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── __init__.py
│   ├── data.py          # Elexon fetch CLI (--refresh), cleaning, snapshot load (D1, D2)
│   ├── logic.py         # pure R1–R9: select_forecast, errors, history, band, compare_runs,
│   │                    #   drift, metrics, by_hour, daily, histogram, by_horizon
│   └── main.py          # FastAPI routes, 422 handling, result caches keyed by
│                        #   (id(snapshot), D, cutoff) (D5), static mount of DIST_DIR (D14)
├── data/                # fuelhh_wind.json, windfor.json, manifest.json (committed;
│                        #   Dec 2025 history + Jan 2026 pilot)
├── tests/
│   ├── fixtures.py      # small hand-computed frames
│   ├── test_data.py     # cleaning + 429 retry
│   ├── test_logic.py    # R1–R9 unit tests + snapshot-wide R1 sweep
│   └── test_api.py      # endpoints: success + error; AC1–AC5, AC7–AC10
├── requirements.txt     # exact pins (incl. ruff)
└── pyproject.toml       # pytest + ruff config

frontend/
├── src/
│   ├── main.tsx, App.tsx      # theme, tabs, shared view state (D11)
│   ├── theme.ts               # colour tokens (forecast amber, actual teal, risk red)
│   ├── api.ts                 # response types (mirror contracts/api.md) + fetch helper/ApiError
│   ├── format.ts              # MW→GW, MWh, UTC time labels
│   ├── insights.ts            # pure R6 signal + R7 watch list
│   ├── pages/OutlookPage.tsx, AccuracyPage.tsx
│   ├── components/            # KpiCard, DataState (skeleton/error/empty), ControlsCard,
│   │                          #   RunInUseAlert, SignalCard, WatchListCard, OutlookChart,
│   │                          #   DriftPanel, HourlyTable, AccuracyCharts, WorstDaysTable
│   └── test/                  # insights.test.ts, OutlookPage.test.tsx, AccuracyPage.test.tsx,
│                              #   App.test.tsx, setup.ts (fetch + apexcharts mocks)
├── index.html, vite.config.ts, tsconfig.json
└── package.json, package-lock.json

Dockerfile               # node build stage → python runtime stage
docker-compose.yml
README.md                # run commands, data source, AI-usage declaration
```

**Structure Decision**: a web application with `backend/` and `frontend/` as in source spec §10,
plus a few small helper modules (`theme.ts`, `format.ts`, `DataState`, `tests/fixtures.py`). These
keep the colour rules, unit conversions and loading/error/empty states in one place each, so they
are not repeated across components.

## Requirement Traceability

| Rule / AC | Back end | Front end | Tests |
|---|---|---|---|
| R1 (FR-005), AC1, AC2 | `logic.select_forecast` | run-in-use Alert | `test_logic` R1 cases; `test_api` AC1/AC2; `OutlookPage.test` refetch on cutoff |
| R2, R9 (FR-006, FR-013), AC9, AC10 | `logic.metrics`, `by_hour`, `daily`, `histogram`, `by_horizon` | AccuracyPage | `test_logic` [−100, 0, 300]; `test_api` AC9/AC10 |
| R3–R5 (FR-007–009), AC7 | `logic.history`, `band` | OutlookChart, KPI tile | `test_logic`; `test_api` AC7 |
| R6 (FR-010), AC3 | `history.bias` | `insights.signal` | `insights.test` thresholds ±500 |
| R7 (FR-011), AC4 | `logic.compare_runs` | `insights.watchList` | `insights.test`; `test_logic` compare |
| R8 (FR-012), AC5 | `logic.drift` | DriftPanel | `test_logic`; `test_api` AC5 |
| AC6 | – | switch reveals fields | `OutlookPage.test` |
| AC8 (FR-030) | 422 handler | – | `test_api` |
| AC11 | – | App drill-down | `App.test` |
| AC12 (FR-028) | – | DataState | `OutlookPage.test`, `AccuracyPage.test` |

## Complexity Tracking

No constitution violations to justify.
