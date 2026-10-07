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

## API DB migrations — CLI commands wired

Added migration tooling to `apps/api` (previously TypeORM migrations existed but no
commands drove them). Verified end-to-end against a scratch Postgres DB.

**Completed**

- `apps/api/package.json` scripts:
  - `npm run typeorm -- <args>` — bare CLI passthrough (ts-node transpile).
  - `migration:run` / `migration:revert` / `migration:show` / `migration:generate` /
    `migration:create` — all target `src/databases/data-source.ts`.
  - `schema:sync` / `schema:drop` (TypeORM `SCHEMA_DROP` used only where a
    `DROP DATABASE` is acceptable; see refresh note).
  - `migration:refresh` — `refresh-schema.ts` resets the `public` schema (drops
    app tables/sequences/types but **preserves the postgis extension**, since the
    `nitume` role is not a superuser and cannot re-create it), then reapplies all
    migrations, then `seed:admin`.
- Verified on a throwaway `nitume_migtest` DB: full refresh → 26 public tables,
  migration recorded, admin `+254722000101` seeded, postgis intact; `migration:show`
  reports it applied.

**Notes / caveats**

- The **single existing migration cannot create postgis** as the `nitume` role
  (`CREATE EXTENSION postgis` requires superuser). Migrations must run against a DB
  where postgis is already installed (e.g. `nitume_dev`, which hosts the current
  real dev data) or postgis must be installed ahead of time.
- `.env` currently points `DATABASE_NAME=nitume` (empty DB, no postgis) while the
  live API/dev data resides in `nitume_dev`; whichever DB is canonical, ensure the
  migration target has postgis present before running `migration:run`.
## Customer app (Core loop, customer surface) — branch stack from `docs/customer-spec-audit`

Built by the agent team (orchestrator + design-auditor, api-contract, core-ui,
flutter-customer, reviewer), 2026-10-07. Not merged; the owner merges. Branch stack
and merge order: see the reviewer summary on `BOARD.md` (session log, 2026-10-07).

**Completed**

- **Specs + audits** (`docs/customer-spec-audit`, `docs/customer-spec-answers`,
  `docs/customer-reaudit`): specs for all 17 mockup views + shell and 9 undrawn
  screens (`docs/specs/customer/`), gap report, owner answers 1–21 folded in, and a
  post-build re-audit. All 27 screens PASS (`matches-design`) after two rounds.
- **API** (`feat/api-customer-gaps`, `feat/api-owner-decisions`):
  - Customer endpoints: assignment and runner summary on errands, multi-status filter,
    errand count, quote read, price-change list, disputes and dispute lookup,
    tracking snapshot, FCM device registration, notification event-type enum.
  - Socket.IO gateway with errand rooms (§4.1–4.2).
  - Owner decisions: display names; errand reference (`NT-10001`…), title, runner
    notes and derived urgency; OTP policy (5 min, 5 attempts, 60 s cooldown, 5/hour)
    with error codes; state-machine changes (rows 8, 10, 35–37); payment idempotency
    key, merchant route and STK status; M-Pesa-only payment methods; refund reviews
    (admin sets the amount up to a full refund; payout manual); price change on the
    item amount; escrow wording removed. 4 migrations.
- **Shared Flutter core** (`feat/core-customer-widgets`, `feat/core-owner-decisions`,
  `feat/core-spec-widgets`): bundled Fira Sans/Fira Code, theme aligned to the design
  system, widgets C-01–C-40, data models and repositories for every customer endpoint,
  and realtime/places/map interfaces (no SDKs).
- **Customer app** (`feat/customer-screens`): all 27 screens. Session restore, split
  OTP auth, name capture, 5-category wizard, quote checkout, M-Pesa STK payment
  (retry-safe, TIMEOUT = still checking), tracking by polling, blocking price-change
  modal with route choice, evidence confirm ("Confirm completion"), report a problem,
  rating, history, notifications, addresses, M-Pesa payment methods, profile.
- Verified: analyze/typecheck clean and unit/widget tests pass on every branch (API
  110 + 58 unit; core 106; app 51). Read-only reviewer pass done; review fixes are in
  progress (see BOARD).

**Deferred (pending owner decisions on BOARD)**

- Places/Maps SDK (rows 30, 60). **Blocks saving new addresses and so creating tasks.**
- Socket.IO client in the app (row 29); the app polls instead. Event names (row 23).
- FCM push sending and the app token (rows 26, 31); BullMQ queue (row 26).
- Quote preview: no pricing engine (row 47). Customer fee grouping (row 34).
- Price-change difference is recorded, not charged (rows 44, 48). Send-to-runner
  mechanics and merchant Till/Paybill source (rows 42, 43); merchant-direct is
  disabled.
- Refund payout via M-Pesa B2C/reversal (row 55); refunds are recorded and paid manually.
- Dispute-window scheduler that moves COMPLETED → CONFIRMED → SETTLED (rows 26, 50).
- Daraja STK Query for TIMEOUT payments (row 52); per-IP OTP throttling (row 53).
- url_launcher for Terms/Privacy/Support links (row 39); video evidence playback (row 32).
- Evidence links are permanent public Cloudinary URLs (row 25).
- Runner app work (runner notes, location pings) and admin refund screens (web-parity).
- API e2e suite was not re-run after the review; it must use a throwaway database
  (row 57). Note: per the migrations section above, `.env` targets `nitume`, the
  near-empty DB, while dev data lives in `nitume_dev`.
