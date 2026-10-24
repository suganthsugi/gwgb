# REint Weather Forecast Constitution

Non-negotiable principles for building this app. Every spec, plan, task and code change (human
or AI) MUST comply. When a change conflicts with this document, the change is wrong, not the
constitution.

## Core Principles

### I. The Spec Is the Source of Truth

- `SPEC.md` defines behaviour. Code implements the spec; it MUST NOT silently extend or
  contradict it.
- A new question found while building MUST be answered in the spec first (with a decision note),
  then in code.
- Every rule (R1–R9) and acceptance criterion (AC1–AC12) MUST be traceable to code and to at
  least one test.

### II. No Hindsight

- The app MUST show only what was knowable at the decision time. A forecast run published after
  the cutoff MUST NEVER influence the outlook for that decision.
- History used for ranges and signals MUST exclude the day being viewed (leave-one-out).
- Any change touching forecast selection MUST keep the R1 tests passing and MUST add a test if it
  adds a case.

### III. Correct Numbers Over More Features

- Domain logic (selection, alignment, metrics, signal, watch list) MUST live in pure functions
  with no I/O or UI code.
- Units MUST be explicit everywhere: MW for power, MWh for energy, GW only for display. Times
  MUST be UTC and labelled.
- Error is always `forecast − actual`. Positive means the forecast was too high.
- When the data cannot support a number (missing hours, no run before cutoff), the app MUST show
  an explicit empty state instead of a guess.

### IV. Test First for Logic

- Domain rules MUST get unit tests written before or with the code, using small hand-computed
  fixtures.
- Every API endpoint MUST have a test for its success shape and its error case.
- Front-end tests MUST cover user-visible behaviour (what renders, what refetches), not
  implementation details.
- Nothing is merged with failing tests or type errors.

### V. Simplicity

- The app has two screens: Day-ahead outlook and Forecast accuracy. New screens or controls
  MUST have a spec change first.
- No database server, auth or background jobs. Data is fetched once and cached as a committed
  snapshot.
- Prefer the platform and the chosen libraries (MUI, ApexCharts, pandas) over custom code or
  extra dependencies.

### VI. Consistent, Honest UI

- Colour meaning is fixed: forecast = amber (dashed), actual = teal (solid), risk = red.
- Wording MUST be for a power buyer: plain sentences, no internal jargon, no claims the data
  does not support.
- Every data area MUST have loading, error and empty states. The page never goes blank.
- Controls MUST be keyboard-accessible and labelled.

### VII. Reproducible

- The app MUST run from a clean checkout with documented commands, and in Docker.
- Dependency versions MUST be pinned. The data snapshot is versioned with the code.

### VIII. AI-Assisted, Human-Owned

- AI tools may generate code, tests and docs, working from this constitution and `SPEC.md`.
- A human reviews every change, and owns the domain rules and numbers.
- AI usage MUST be declared in the README.

## Technology & Data Constraints

- UI: MUI and ApexCharts. Data processing: pandas. Additions beyond these need a justification
  under Article V.
- Data source: a committed, versioned snapshot; no runtime database, auth or scheduled jobs.
- Units and time: MW / MWh internally, GW for display only; all timestamps UTC and labelled.
- Packaging: runnable locally from documented commands and via Docker, with pinned versions.

## Development Workflow & Quality Gates

- Order of work: spec (`SPEC.md`) → plan → tasks → tests → code.
- A change is mergeable only when all tests pass, there are no type errors, and a human has
  reviewed it.
- Changes to forecast selection, alignment, metrics, signal or watch list MUST include or update
  hand-computed unit tests.

## Governance

- This constitution supersedes other practices. Plans and reviews MUST check compliance.
- Amend this document only deliberately, with a one-line reason and date in the Amendments log.
- Versioning: MAJOR for removing or redefining an article; MINOR for adding an article or
  materially expanding guidance; PATCH for wording and clarifications.
- Reviews check compliance with Articles II, III and IV first.

### Amendments

- 2026-10-25: initial version.

**Version**: 1.0.0 | **Ratified**: 2026-10-25 | **Last Amended**: 2026-10-25
