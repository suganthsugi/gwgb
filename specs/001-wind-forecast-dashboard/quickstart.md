# Quickstart & Validation: REint Weather Forecast

Proves the feature end-to-end from a clean checkout. Contracts are in
[contracts/api.md](./contracts/api.md) and types in [data-model.md](./data-model.md).

## Prerequisites

- Python 3.12, Node 20.18+, npm; or Docker with Compose.
- The data snapshot in `backend/data/` is committed, so no network access is needed to run.

## Run locally

```bash
# back end (http://localhost:8000)
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# front end (http://localhost:5173, proxies /api → :8000)
cd frontend
npm ci
npm run dev
```

## Run in Docker

```bash
docker compose up --build        # http://localhost:8000 serves the UI and /api
```

## Refresh the snapshot (only when deliberately changing data)

```bash
cd backend && python -m app.data --refresh
```
Commit the new `backend/data/*.json` on its own. If AC reference values change,
update `spec.md` first (Article I).

## Automated checks (all must pass before merge)

```bash
cd backend  && ruff check . && pytest
cd frontend && npm test -- --run && npx tsc --noEmit
```

## Validation scenarios

### API (with the back end running)

| AC | Command | Expect |
|---|---|---|
| health | `curl -s localhost:8000/api/health` | `status: "ok"`, row and run counts > 0 |
| AC1 | `curl -s "localhost:8000/api/decision?delivery_date=2026-01-15"` | `usedRun` 2026-01-14T07:30Z, `minutesBeforeCutoff` 90, 24 `points` |
| AC2 | `…&cutoff=12:00` | `usedRun` 2026-01-14T11:30Z |
| AC3 | AC1 response | `history.days` 30 (15 Dec – 13 Jan); `mean(forecast)` ≈ 11,600 MW; adjusted value and signal as recorded in spec AC3 (TBR) |
| AC5 | AC1 response | `drift` has 8 entries; `driftHours` 00:00–21:00; `changeVsPrevious.identical` true |
| AC7 | AC1 response | every point has `low ≤ high` |
| AC8 | `curl -i "…/api/decision?delivery_date=2026-03-01"` | `422`, readable `detail` |
| AC9 | `curl -s localhost:8000/api/metrics` | MAE ≈ 2,023, bias ≈ +1,746, RMSE ≈ 2,497, P90 ≈ 4,154, n = 744, Σ histogram = 744 |
| AC10 | `curl -s localhost:8000/api/metrics/by-horizon` | last bucket `mae` > first bucket `mae` |

### UI (browser)

1. Open the app. The **Day-ahead outlook** tab is selected and the title, subtitle and footer
   ("times in UTC (= UK time in January)") are shown.
2. Pick **15 Jan**, decision time **09:00**. The run-in-use notice says 14 Jan 07:30, "1 h 30 min
   before". The signal and adjusted figure match spec AC3 (raw forecast about 11.6 GW). The
   watch list names **16:00** (least wind) and the widest hour recorded in spec AC4, and change
   vs 24 h earlier is about −0.3 GW (AC1, AC3, AC4).
3. The drift view shows 8 runs and states 00:00–21:00. "vs previous run" shows **No change** (AC5).
4. Change the decision time to **12:00**. The outlook refreshes to the 11:30 run (AC2).
5. Turn on **Show actual outturn**. The teal actual line, the actual / bias / MAE cards, the
   actual / error / in-range columns and the signal verdict appear (AC6).
6. Pick decision time **00:00**. Hours 22:00–23:00 show "no forecast for this hour" (research D3).
7. Open **Forecast accuracy**. The KPI values match AC9 and the "Error by lead time" chart rises (AC10).
8. Click **Open day →** for **28 Jan**. The outlook opens on 28 Jan with actuals on (AC11).
9. Stop the back end and reload. Every data area shows "Couldn't load data: …" and nothing is
   blank (AC12).
10. Keyboard only: Tab reaches the tabs, date picker, ‹ ›, decision-time select and switch, and
    each has a visible label (Article VI).
