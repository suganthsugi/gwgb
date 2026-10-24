# Feature Specification: REint Weather Forecast — Day-Ahead Wind Outlook & Forecast Accuracy

**Feature Branch**: `001-wind-forecast-dashboard`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "REint Weather Forecast — Product & Technical Spec" (full text kept in
[`source-spec.md`](./source-spec.md); its technical sections — stack, API shape, project layout,
test list — are inputs for `/speckit-plan`).

## Context

A GB electricity supplier buys power in the day-ahead market: before about 09:20 UK time on day
D-1 it bids for every hour of delivery day D. Wind is used first, so the buyer only purchases what
wind will not cover. Tomorrow's wind is a forecast, and forecast errors leave the buyer short
(expensive imbalance) or long. The buying team needs to (1) see the latest wind forecast that was
available at decision time, and (2) know quantitatively how wrong that forecast tends to be.

**Pilot window**: purchase decisions made 1–31 Jan 2026, i.e. delivery days 2 Jan – 1 Feb 2026
(31 days). GB national wind only; actuals and forecasts from Elexon only. December 2025 data is
loaded only as history for the January decisions (R3).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the forecast that was available at decision time (Priority: P1)

A power buyer picks a delivery day and a decision time and sees the hourly wind forecast exactly
as it stood at that moment on the day before — which forecast run was used, how old it was, and
an hour-by-hour view of expected wind. No later information leaks in.

**Why this priority**: This is the decision the buyer makes every day. Without the correct
"as-of" forecast, every other number in the app is misleading.

**Independent Test**: Open the outlook for 15 Jan at 09:00 and confirm the run in use, its age and
the 24 hourly values, without any accuracy screen existing.

**Acceptance Scenarios**:

1. **(AC1)** **Given** delivery day 15 Jan and decision time 09:00, **When** the outlook loads,
   **Then** the run in use is the one published 14 Jan 07:30, shown as "1 h 30 min before" the
   decision time, with 24 hourly values.
2. **(AC2)** **Given** delivery day 15 Jan, **When** the buyer changes the decision time to 12:00,
   **Then** the outlook refreshes and the run in use is the one published 14 Jan 11:30.
3. **Given** a decision time earlier than any available run, **When** the outlook loads, **Then** a
   clear "no forecast run was available before this time" message is shown instead of numbers.

---

### User Story 2 - Understand the expected error for the day (Priority: P1)

Alongside the forecast, the buyer sees a likely range for each hour, a plain-language signal on
whether the forecast has recently run high or low, an adjusted figure, a short watch list of hours
and changes that need attention, and how the forecast has drifted across recent runs.

**Why this priority**: The forecast alone does not tell the buyer how much to hedge. The range,
signal and watch list are what turn a forecast into a purchasing input.

**Independent Test**: For 15 Jan at 09:00, check the signal text, the watch list items, the range
for each hour and the drift summary against the reference values below.

**Acceptance Scenarios**:

1. **(AC3)** **Given** 15 Jan at 09:00, **Then** the raw forecast average is about 11.6 GW and the
   history used covers 30 days (15 Dec – 13 Jan). The signal wording and the adjusted average are
   **to be recomputed from the snapshot (TBR)** after the R3 change. *(The earlier values,
   "Forecast likely too high" and ≈ 9.8 GW, came from leave-one-out history and no longer apply.)*
2. **(AC4)** **Given** 15 Jan at 09:00, **Then** the watch list names 16:00 as the hour of least
   wind and reports a change versus the run 24 h earlier of about −0.3 GW. These are
   forecast-only values and are unchanged. The hour of widest uncertainty is **TBR from the
   snapshot**. *(It was 17:00 under leave-one-out history.)*
3. **(AC5)** **Given** 15 Jan at 09:00, **Then** the drift view shows 8 runs summarised over
   00:00–21:00 and "vs previous run" shows "No change".
4. **(AC7)** **Given** any delivery day and decision time, **Then** for every hour the low end of
   the likely range is less than or equal to the high end.

---

### User Story 3 - Check the outlook against what actually happened (Priority: P2)

The buyer turns on "Show actual outturn" to see, for a past day, the actual wind next to the
forecast, the day's bias and MAE, per-hour errors, whether each hour fell inside the likely range,
and whether the adjusted figure or the raw forecast was closer.

**Why this priority**: Builds trust in the range and signal by letting the buyer review past
decisions. Valuable, but the outlook is usable without it.

**Independent Test**: Toggle the switch on any day and confirm the extra series, cards, columns and
verdict appear, and disappear when toggled off.

**Acceptance Scenarios**:

1. **(AC6)** **Given** the outlook for any day, **When** "Show actual outturn" is switched on,
   **Then** the actual line, the actual-average / bias / MAE cards, the actual / error / in-range
   table columns and the signal verdict appear.
2. **Given** the switch is off (the default), **Then** none of the actual-outturn information is
   shown.

---

### User Story 4 - Evaluate forecast accuracy across the pilot (Priority: P2)

On a separate screen the buyer sees how far the 09:00-on-D-1 forecast was from outturn across
every hour of the pilot: headline metrics, how error grows with lead time, bias by hour of day,
the error distribution, bias by day, and the 10 worst days.

**Why this priority**: Quantifies forecast reliability for the team and for purchase policy. It
depends on the same forecast selection as Story 1.

**Independent Test**: Open the accuracy screen and compare the headline figures to the reference
values; confirm the lead-time chart trend.

**Acceptance Scenarios**:

1. **(AC9)** **Given** the accuracy screen, **Then** it shows MAE ≈ 2,023 MW, bias ≈ +1,746 MW,
   RMSE ≈ 2,497 MW, P90 absolute error ≈ 4,154 MW and 744 hours scored, and the error distribution
   counts sum to 744.
2. **(AC10)** **Given** the accuracy screen, **Then** the error-by-lead-time chart rises from the
   first lead-time bucket to the last.

---

### User Story 5 - Drill from a bad day into its outlook (Priority: P3)

From the accuracy screen the buyer clicks a day (in the bias-by-day chart or the worst-days table)
and lands on that day's outlook with actual outturn already shown.

**Why this priority**: Convenience that links the two screens; both work without it.

**Independent Test**: Click 28 Jan in the worst-days table and confirm the outlook opens for 28 Jan
with actuals on.

**Acceptance Scenarios**:

1. **(AC11)** **Given** the worst-days table, **When** the buyer clicks "Open day →" for 28 Jan,
   **Then** the outlook opens on 28 Jan with "Show actual outturn" on.
2. **Given** the bias-by-day chart, **When** the buyer clicks a day's bar, **Then** the same
   behaviour occurs for that day.

---

### Edge Cases

- **No run before the cutoff** (e.g. very early decision time): the outlook shows an explicit
  no-run message and no numbers; the screen is not blank.
- **Run published exactly at the cutoff**: it counts as available.
- **Hours no available run covers** (early cutoffs, where the newest run is from D-2 and stops at
  21:00): those hours show "no forecast for this hour" and are left out of all figures; they are
  never filled in. *(Decision note 2026-10-25, from planning research D3.)*
- **History day with missing hours**: those hours are skipped; the history day count includes
  only days with at least one scored hour.
- **Runs published after the cutoff**: never used anywhere in the outlook (forecast, range,
  signal, watch list, drift).
- **Runs published on D-2** cover D only until 21:00: drift is summarised over the hours all
  compared runs cover, and those hours are stated when fewer than 24.
- **Identical consecutive runs** (common overnight): change figures read "No change".
- **No run 24 h before the run in use**: the "vs run 24 h earlier" comparison falls back to the
  previous run, and says so.
- **Missing actual hours**: those hours are excluded from error metrics rather than guessed.
- **Delivery date outside 2 Jan – 1 Feb 2026**: rejected with a readable message (AC8).
- **Data service unavailable**: each affected area shows "Couldn't load data: {detail}"; the page
  never goes blank (AC12).
- **Forecast rows whose target hour is before their publish time**: ignored.
- **Steepest ramp below 500 MW**: the ramp item is omitted from the watch list.

## Requirements *(mandatory)*

### Functional Requirements

**Data**

- **FR-001**: The system MUST use GB national wind actuals (half-hourly, MW) and wind forecasts
  (hourly, MW, many runs per day) from Elexon covering the pilot window and the history it needs:
  actuals from 1 Dec 2025 and forecast runs published from 30 Nov 2025.
- **FR-002**: The data MUST be fetched once and stored as a snapshot kept with the code, so the app
  works when Elexon is unavailable. Fetching MUST retry when rate-limited.
- **FR-003**: Forecast rows whose target hour is earlier than their publish time MUST be dropped.
  Duplicates MUST be removed (per run and target hour for forecasts; per time for actuals).
- **FR-004**: Forecasts and actuals MUST be compared on the hour (forecast hour = actual hour
  start). All times are UTC (= UK time in January) and labelled as such.

**Domain rules** (rule IDs are referenced by plan, tasks and tests)

- **FR-005 (R1 — Forecast in use)**: For delivery day D and decision time T (default 09:00), the
  cutoff is T on D-1. For each hour of D the system MUST use the value from the newest run
  published at or before the cutoff. A run published exactly at the cutoff counts; later runs are
  never used.
- **FR-006 (R2 — Error)**: Error MUST be `forecast − actual`; positive means the forecast was too
  high and the buyer is short.
- **FR-007 (R3 — History)**: For day D and time T, history MUST be the R1 errors, at the same T,
  of the 30 delivery days D-31 … D-2. These are the 30 most recent days whose delivery had ended
  before the cutoff (T on D-1). Day D-1 is excluded because its delivery is still under way at
  the cutoff, and D and later days are never used. History may reach back into December 2025.
  *(Decision note 2026-10-25: replaces leave-one-out, which used days not yet known at decision
  time; analysis C1; constitution Art. II v1.1.0.)*
- **FR-008 (R4 — Likely range)**: For each hour of day h: low = forecast − P90 of history errors at
  h; high = forecast − P10 of history errors at h.
- **FR-009 (R5 — Typical error range)**: A single typical range MUST be computed the same way as R4
  using all history hours, shown as a summary tile.
- **FR-010 (R6 — Signal)**: bias = mean of history errors; adjusted = mean forecast − bias.
  Bias > +500 MW → "Forecast likely too high"; bias < −500 MW → "Forecast likely too low";
  otherwise "Forecast has been close to target". The text MUST state the bias, the adjusted figure
  and the raw forecast mean. When actuals are shown, it MUST add whether the adjusted figure or the
  raw forecast was closer to the mean actual.
- **FR-011 (R7 — Watch list)**: In this order, skipping items that do not apply: (1) hour of widest
  range (max high − low) with its range; (2) hour of least wind (min forecast); (3) steepest
  hour-to-hour forecast change, only if ≥ 500 MW; (4) change versus the latest run published at
  least 24 h before the run in use, falling back to the previous run if none — showing mean change
  and largest single-hour move, or "No change" when identical.
- **FR-012 (R8 — Drift)**: The system MUST summarise the last 8 runs published at or before the
  cutoff, each as its mean forecast over the hours that all 8 runs cover, and state those hours
  when fewer than 24.
- **FR-013 (R9 — Accuracy metrics)**: At decision time 09:00 over all 31 delivery days × 24 hours,
  the system MUST report MAE, bias (mean error), RMSE, P90 of absolute error, nMAE (MAE ÷ mean
  actual, %) and n; bias by hour of day (0–23); an error histogram in 1 GW bins from −8 GW to
  +8 GW with open-ended outer bins; daily MAE and bias; the 10 worst days by MAE; and MAE by lead
  time (target hour − publish time) in 6 h buckets from 0 to 72 h using all runs, scoring only
  target hours in the pilot delivery days. *(Decision note 2026-10-25: December history data is
  not scored here.)*

**Day-ahead outlook screen** (default screen)

- **FR-014**: Header "Day-ahead wind outlook" with "Wind forecast for {D} as it stood at {T} on
  {D-1}, with the error you should expect."
- **FR-015**: Controls: delivery-day picker limited to 2 Jan – 1 Feb 2026 with previous/next
  buttons; decision-time selector 00:00–23:00 with 09:00 labelled "before auction close"; a
  "Show actual outturn" switch, off by default. Changing any control MUST refresh the outlook.
- **FR-016**: A run-in-use notice: "Forecast run in use: {run}, published {h} h {m} min before the
  decision time. Later runs are excluded." or the no-run message.
- **FR-017**: A signal card (highlighted when it warns) and a watch-list card, side by side on wide
  screens and stacked on narrow screens.
- **FR-018**: Summary cards: forecast average (GW and MWh for the day) and typical error range.
  With actuals: actual average, bias (highlighted as risk when |bias| > 1 GW, with a short/long
  hint) and MAE. *(Decision note 2026-10-25: same threshold as the accuracy screen; analysis M5.)*
- **FR-019**: An hourly chart (00:00–23:00, GW) showing the likely range as a band and the
  forecast as a line; the actual line when actuals are on.
- **FR-020**: A drift view (mean forecast per run by publish time) with two summary cards:
  "vs previous run" and "vs run 24 h earlier".
- **FR-021**: An hourly table: hour, lead time, forecast, low, high; with actuals also actual,
  error (highlighted as risk when |error| > 3 GW) and whether the actual fell in range.

**Forecast accuracy screen**

- **FR-022**: Header "Forecast accuracy" with "How far the forecast available at 09:00 the day
  before was from outturn, across every hour of the January 2026 pilot."
- **FR-023**: Summary cards: MAE (with nMAE %), bias (highlighted as risk when |bias| > 1 GW,
  either sign), RMSE, P90, hours scored.
- **FR-024**: Four charts in a 2×2 grid:
  - "Error by lead time" (MAE by bucket).
  - "Bias by hour of day" (with a zero line).
  - "Error distribution": every bin in a neutral slate colour, a red line at zero, and a legend
    "forecast too low" (left of zero) / "forecast too high" (right of zero).
  - "Bias by day": clicking a day opens it in the outlook with actuals on.

  *(Decision notes 2026-10-25: the lead-time title no longer makes a claim (L2); neutral bins keep
  teal meaning "actual" only (M6).)*
- **FR-025**: A worst-10-days table: day, MAE, bias, average actual, and an "Open day →" action
  with the same behaviour as the chart click.

**Shared**

- **FR-026**: App title "REint Weather Forecast" with subtitle "Day-ahead wind outlook and forecast
  reliability · GB national wind · Pilot: January 2026"; two tabs; a footer naming the data source
  and "times in UTC (= UK time in January)".
- **FR-027**: Colour meaning is fixed everywhere: forecast = amber (dashed), actual = teal (solid),
  risk = red.
- **FR-028**: Every data area MUST show a loading placeholder, an error message "Couldn't load
  data: {detail}" on failure, and an empty message where applicable. The page never goes blank.
- **FR-029**: All controls MUST be keyboard-accessible and labelled.
- **FR-030**: Requests for a delivery date outside the pilot window MUST be rejected with a
  readable message (AC8). A request where no run precedes the cutoff MUST succeed with an
  explicit "no run" result and no hourly values. A decision time that is not on the hour
  (00:00–23:00) MUST be rejected with a readable message. *(Decision note 2026-10-25: the selector
  offers whole hours only; analysis C2.)*

### Key Entities

- **Forecast run**: one published wind forecast, identified by its publish time; holds hourly
  forecast values (MW) for upcoming hours.
- **Actual outturn**: measured GB wind generation (MW) per half hour; compared on the hour.
- **Decision**: a delivery day D plus a decision time T; defines the cutoff (T on D-1) and the run
  in use.
- **Hourly point**: for one hour of D — forecast, low, high, lead time, and (when known) actual and
  error.
- **History**: the errors of the 30 delivery days D-31 … D-2 at the same decision time; source of
  range, signal and typical error.
- **Accuracy summary**: pilot-wide metrics, breakdowns by hour, day and lead time, and histogram.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every delivery day in the pilot and every decision time, the run in use is
  never published after the cutoff (verified for 100% of day × hour combinations).
- **SC-002**: The reference values in AC1–AC5 and AC9 are reproduced from the snapshot within
  rounding (0.1 GW for GW figures, 1 MW for MW figures). Values marked TBR are computed from the
  snapshot, reviewed by a human and written into this spec before their tests are finalised.
- **SC-003**: A buyer can go from opening the app to reading the run in use, signal and watch list
  for a chosen day and decision time in under 30 seconds.
- **SC-004**: Changing the delivery day or decision time shows the updated outlook in under
  2 seconds.
- **SC-005**: With the data service down, 100% of data areas show an error message and no screen
  is blank (AC12).
- **SC-006**: Every rule R1–R9 and acceptance criterion AC1–AC12 is covered by at least one
  automated test.
- **SC-007**: In a review with a member of the buying team, every message on both screens is
  understood without explanation of internal terms.

## Assumptions

- Users are the buying team on desktop browsers; narrow-screen layout is supported but not the
  primary target. No sign-in is needed (pilot, internal use).
- The pilot window is fixed (2 Jan – 1 Feb 2026); live or newer data is out of scope, as are
  demand, price, solar and regional data, and producing a forecast or sizing the purchase.
- History (R3) only uses days whose delivery had ended by the cutoff. Their actuals are assumed to
  be available at that time, because Elexon publishes outturn in near real time.
- Percentiles (P10, P90) use standard linear interpolation between ranked values.
- Change comparisons between two runs use only the hours both runs cover.
- When fewer than 8 runs exist before the cutoff, drift shows the runs that exist.
- January has no daylight-saving shift, so UTC equals UK time throughout the pilot.
- The reference values in the acceptance criteria come from the January 2026 snapshot; if the
  snapshot is re-fetched and differs, the spec values are updated first (constitution Article I).
