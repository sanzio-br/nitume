# Nitume — Build Progress

Running log of completed work, per `AGENT_BUILD_INSTRUCTIONS.md` §6. Each entry lists
what was completed and what was explicitly deferred. Source-of-truth hierarchy in §1
of the instructions applies everywhere.

## Admin dashboard (Foundation / Core-loop visibility) — `feat/admin-dashboard-angular`

**Completed**

- **Ops shell** (`admin-dashboard.component.ts`): Deep Trust Blue sidebar with
  Monitor/Network/Insights nav groups, live `pending`/`dispute` badges, account foot
  (log out), panel `@switch`, and a slide-in `OpsDrawerComponent` routed to
  task/runner/dispute detail surfaces. Fetches the live surface on init
  (`AdminDataService.refresh()` → `GET /errands`, `GET /runners`, `GET /users/me`).
- **Panels** (all derived from committed API rows, nothing fabricated):
  - Live ops — KPI row (sample-window labeled), city map with availability-colored
    runner dots (deterministic placeholders; real GPS ignored until §4.2), map legend
    + topstat, live-feed rail; currency column set.
  - Task queue — triage table (excludes `DRAFT`), search + category filter, rows open
    the task drawer; refresh on submit-level.
  - Runners — live directory grid of `GET /runners` profiles (level, trust/load
    metrics, availability).
  - Disputes — every `DISPUTED` errand with evidence chips, opens the resolve drawer.
  - Reports — charts ONLY over derivable aggregates (daily/weekly bars, completion
    donut, category share). Revenue-flow card shows placeholders — no KSh invented.
- **Drawers**: task detail + status-history timeline (`GET /errands/:id` +
  `…/history`), runner profile, and dispute resolution wired to
  `PATCH /errands/:id/resolve-dispute` with a required rationale.
- **Shared**: `KpiCardComponent`, `StatusChipComponent` (all status surfaces in one
  place), `OpsDrawerComponent` (ESC/overlay/✕ close, open/close slide), panel topbar.
- Auth: OTP two-step login restyled to the blue-screen mockup; logout navigates to
  `/login`; interceptor + acting-role contract unchanged.
- Verified: `ng build` clean, `ng test` green, and a headless-browser pass against the
  live API (login → dashboard → panels → drawer timeline) with zero console errors.

**Deferred (explicitly, no admin API exists yet)**

- **Verification-inbox** review/approve/reject of runner documents (no admin aggregate
  endpoint; runners panel shows a live directory + a note instead of a review queue).
- **Live location** on the map (Socket.IO §4.2 not wired); runner dots are
  deterministic pseudo-positions labeled as placeholders in UI copy.
- **Revenue/money totals**: platform commission, booking/urgency fees, subscriptions
  show undisclosed placeholders until a finance/payments aggregate endpoint ships.
  Three-flow separation preserved in copy only (no wallet/escrow built).
- **Repeat-usage** metric left undisclosed (the admin errand list rows carry no
  customer reference per row).
- **Auto-assign / live Socket.IO task feed** (Core loop "manual assign" first).