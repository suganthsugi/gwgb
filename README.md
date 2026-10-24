# REint Weather Forecast

Day-ahead wind outlook and forecast reliability for a GB power buyer, piloted on January 2026.

- **Day-ahead outlook**: pick a delivery day (2 Jan – 1 Feb 2026) and a decision time on the day
  before. The app shows the hourly GB wind forecast exactly as it stood at that moment, with no
  later runs used. Alongside it you get a likely range per hour from the last 30 days' errors, a
  signal on whether the forecast has been running high or low, a watch list, and how the forecast
  has moved across recent runs. "Show actual outturn" adds what actually happened.
- **Forecast accuracy**: how far the 09:00 day-before forecast was from outturn across all 744
  pilot hours. It shows MAE, bias, RMSE, P90, error by lead time, bias by hour and by day, the
  error distribution and the 10 worst days. Click any day to open it in the outlook.

The behaviour is defined in [`specs/001-wind-forecast-dashboard/spec.md`](specs/001-wind-forecast-dashboard/spec.md)
and the project rules in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Data

- Source: Elexon BMRS, public API. Actuals are `FUELHH` (wind, half-hourly, MW) and forecasts are
  `WINDFOR` (hourly, MW, many runs per day).
- A snapshot is committed in `backend/data/`: actuals from 1 Dec 2025 to 1 Feb 2026, and forecast
  runs published from 30 Nov 2025 to 2 Feb 2026. December is used only as history for the January
  decisions. The app never calls Elexon at runtime.
- All times are **UTC**, which is UK time in January. Power is MW internally and shown in GW.

## Run locally

Requires Python 3.12 and Node 20.18 or later.

```bash
# back end on http://localhost:8000
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# front end on http://localhost:5173 (proxies /api to :8000)
cd frontend
npm ci
npm run dev
```

## Run in Docker

```bash
docker compose up --build        # http://localhost:8000 serves the UI and /api
```

## Tests and checks

```bash
cd backend  && ruff check . && pytest
cd frontend && npm test -- --run && npx tsc --noEmit
```

## Refresh the snapshot

Only do this when you deliberately want to change the data:

```bash
cd backend && python -m app.data --refresh
```

Commit the new `backend/data/*.json` on its own. If the reference values in the spec change,
update `spec.md` first (constitution Article I).

## AI usage

AI tools (Claude Code) generated the code, tests and documentation in this repository, working
from the constitution and the feature spec. A human reviews every change and owns the domain rules
and the numbers (constitution Article VIII).
