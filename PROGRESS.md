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
    item amount; escrow wording removed. Review fixes: refund review opened in the
    cancelling transaction, atomic OTP attempts, locked price-change approve, one active
    main payment per errand. 5 migrations, all reversible.
- **Shared Flutter core** (`feat/core-customer-widgets`, `feat/core-owner-decisions`,
  `feat/core-spec-widgets`): bundled Fira Sans/Fira Code, theme aligned to the design
  system, widgets C-01–C-40, data models and repositories for every customer endpoint,
  and realtime/places/map interfaces (no SDKs).
- **Customer app** (`feat/customer-screens`): all 27 screens. Session restore, split
  OTP auth, name capture, 5-category wizard, quote checkout, M-Pesa STK payment
  (retry-safe, TIMEOUT = still checking), tracking by polling, blocking price-change
  modal with route choice, evidence confirm ("Confirm completion"), report a problem,
  rating, history, notifications, addresses, M-Pesa payment methods, profile.
- Verified: analyze/typecheck clean and unit/widget tests pass on every branch head
  and every new commit (API 126 + 58 unit; core 124; app 60). Design audit PASS on all
  27 screens (3 rounds). Reviewer: all branches READY (stage `reviewed`).

**Deferred (pending owner decisions on BOARD)**

Most items deferred at first were built in the second stack below; see its entry.
Still deferred from this stack:

- Quote preview: no pricing engine (row 47). The customer sees only the fee total (row 34).
- Refund payout via M-Pesa B2C/reversal (row 54); refunds are recorded and paid manually.
- Video evidence playback (row 32, deferred from MVP).
- Runner app work (runner notes UI, location pings).
- After merging, run `migration:run` on local DBs (1790100100000 was edited in place;
  1790100400000 is new). Run the API e2e suite only against a throwaway database
  (row 57). Note: per the migrations section above, `.env` targets `nitume`, the
  near-empty DB, while dev data lives in `nitume_dev`.

## Owner answers rounds 2–3: integrations, PayHero, admin ops — second branch stack

Built by the agent team, 2026-10-08 to 2026-10-09, after the owner answered BOARD
rows 1–76 and 84. Not merged; merge after the first stack, in the order on `BOARD.md`
(session log, 2026-10-09). All branches reviewed READY.

**Completed**

- **Specs and audits** (`docs/customer-answers-2`, `docs/customer-reaudit-2`,
  `docs/admin-ops-spec`): customer specs updated for the owner answers; System Design
  §3.3 rewritten in `docs/design/` (row 56); admin specs for refunds, merchant details,
  re-quote and dispute outcome; customer re-audit, all screens PASS.
- **API** (`feat/api-owner-answers-2`, `feat/api-owner-answers-3`):
  - Access: rating access check; runners see only their current assignment.
  - Quotes and price changes: runner short names; `quote_expired` and admin re-quote,
    including while ACCEPTED with explicit customer acceptance; price-change requests
    only while IN_PROGRESS.
  - Payments: merchant Till/Paybill set by admins; send-to-runner and price increases
    collected by STK to Nitume (one combined STK, row 76); MpesaProvider abstraction
    with PayHero first (callbacks verified by status re-query) and Daraja kept for
    later; STK Query for TIMEOUT payments.
  - Refunds: customer refund status; one refund review per price decrease.
  - Auth: per-IP OTP throttling (30 requests / 60 verifies per hour); `account_suspended`.
  - Infrastructure: BullMQ notifications with FCM push; dispute-window and STK-reconcile
    jobs; 15-minute signed evidence URLs; stable codes on every 409.
  - 4 migrations, all reversible.
- **Shared Flutter core + customer app** (`feat/customer-integrations`): Socket.IO
  live updates (polling only while disconnected), Google Maps tracking within the
  runner window, Google Places search with required picks, FCM push, url_launcher
  links, the 10 rebuilt screens, round-3 quote acceptance and refund lists, Android
  and iOS setup with keys kept out of git.
- **Admin** (`feat/admin-ops`): token and OTP console logging removed (security);
  shared admin components; quote, assign and dispute fixes; re-quote section;
  merchant details; Refunds panel and drawer. Admin tests went from 2 to 101.
- Verified: API 279 unit tests; core 190; app 94; admin 101; every branch head
  analyzes or typechecks clean. Design re-audits PASS. Reviewer: all READY.

**Deferred / before go-live**

- **Row 89 (must answer before any deploy):** with `PAYMENTS_PROVIDER=console` in
  production the public callback is trusted and references are guessable. Recommended:
  refuse to start.
- Row 85: confirm PayHero callback shape, signing, status values, rounding and retries.
- Add to `apps/api/.env.example` (agents can't edit env files here): `PAYMENTS_PROVIDER`,
  `PAYHERO_*`, `FCM_*`, `TRUST_PROXY_HOPS`, `OTP_IP_*`, `EVIDENCE_SIGNED_URL_TTL_SECONDS`
  and the queue settings.
- Android and iOS device builds are unverified (network failure; iOS not built).
- `feat/customer-integrations` has 5 app commits that don't compile on their own
  (b48bd52, bae2b8d, 6cbf6f1, 915e525, bcb91a3); the head is clean. Squash-merge or
  accept (owner decision).
- Customer quote-request endpoint (row 68); quote preview (row 47); refund payout via B2C.
- Remove sockets from errand rooms on runner reassignment before runner location pings ship.
- Legacy evidence uploaded as public keeps its old public URL until migrated.
- After merging, run `migration:run` (3 more migrations). Run the API e2e suite on a
  fresh DB with `--no-file-parallelism` (pre-existing payment_type seeding race).

## Owner answers round 4: rows 59–96 — third branch stack

Built by the agent team, 2026-10-09 to 2026-10-11, after the owner answered BOARD rows
59–96 (plus 97 and 99). Reviewed READY; merged into main on 2026-10-11 (see BOARD session log).

**Completed**

- **Docs** (`docs/owner-answers-3`, `docs/customer-reaudit-3`): one canonical system design
  (`docs/design/Nitume_System_Design.md`, row 70); §2.2/§6 rewritten for platform-mediated
  send-to-runner (rows 66, 67, 76); customer and admin specs for rows 66–69, 72, 77–83,
  86–88, 91, 93; customer and admin re-audits, all PASS.
- **API** (`feat/api-owner-answers-4`): production refuses the console payment provider
  (row 89); decrease refund reviews only for send-to-runner (86); cumulative refund cap at
  the amount paid to Nitume (81, 87); every quote has an expiry, 24h default (83); customer
  "request a new quote" (68); KSh copy and locked payout receipts (82); dispute verdict and
  resolution note to both parties (79); merchant amounts only for Buy For Me / Get It For Me
  with a change warning (80); sockets removed from errand rooms when access is lost.
  3 migrations (one data-only backfill, two nullable columns approved in row 97).
- **Admin** (`fix/angular-admin-owner-answers`): Payments nav group (77), round-3 fallbacks
  removed, refundable amount and net ceiling, refund link from PAYMENT_CONFIRMED, quote
  requests flagged, merchant category gating, dispute verdict. 139 tests.
- **Customer app + core** (`feat/customer-owner-answers`, squash-merged): request a new
  quote, merchant-details-changed notice, access revoked stops live data, `.env.example`
  with `--dart-define-from-file` instead of a bundled `.env` (59), title on create,
  persisted payment idempotency keys, Mark all read in the header, failure reason shown.
- Verified: API 344 unit; admin 139; core 223; app 110 (also from a fresh checkout without
  `.env`). Design re-audits PASS. Reviewer: all READY.

**Deferred / before go-live**

- Row 85: PayHero confirmations. Production needs `NODE_ENV=production` and a real provider;
  a public staging server without `NODE_ENV=production` still trusts the console mock.
- Row 98: Socket.IO Redis adapter not approved, so run the API as a single instance.
- Rows 95, 96, 100, 101 (FYI), 102 open.
- Admin: make the round-4 fields required now that the API is merged (TODO(owner-answers-4));
  m-8 quote-requested filter/count.
- Migration 1790100800000: don't run its `down` after new quotes exist.
- Device builds still unverified; restrict the Places/Maps keys by app.
- Runner app (runner notes, location pings) not started.

## Owner answers round 5: rows 95–102 — fourth branch stack

Built by the agent team, 2026-10-12, after the owner answered BOARD rows 95–102.
Reviewed READY; merged into main 2026-10-12 with merge commits (every commit compiles).

**Completed**

- **Docs** (`docs/owner-answers-5`, `docs/customer-reaudit-5`): System Design updated for
  rows 95, 98 and 100–102 (runner item reimbursement after an accepted receipt; single API
  instance; payout corrections; refund reviews on paid EXPIRED/FAILED); admin and customer
  specs; re-audits PASS.
- **API** (`feat/api-owner-answers-5`): paid tasks ending EXPIRED or FAILED open a refund
  review in the same transaction (row 102); auditable, append-only payout corrections,
  reversals and re-sends with a derived effective payout (row 100); tests proving runner
  amounts are never payable before CONFIRMED (row 95). 2 migrations.
- **Admin** (`fix/angular-admin-owner-answers-5`): Task expired / Task failed labels,
  Payout reversed chip and Record payout action, Corrections section with history cards,
  12-hour EAT everywhere with UTC on the wire (row 96), round-4 fields required, quote
  requests beyond the newest 100 tasks (m-8), minors m-10..m-12. 182 tests.
- **Customer** (`feat/customer-owner-answers-5`): refund triggers in core; trigger-specific
  pending refund lines on task detail; reversed payouts read "Refund approved".
- Verified: API 380 unit; admin 182; core 225; app 115. Re-audits PASS. Reviewer: all READY.

**Deferred**

- Rows 104–111 open (runner reimbursement rules SQ-12..SQ-16, AQ-9, AQ-10, row 111 cap after
  a reversal; built with the stated defaults where applicable). No runner payout ledger
  until row 107 is approved.
- API follow-ups (minor, admin-only): lock sibling reviews in addCorrection (cap race), an
  advisory lock on the payout reference (reuse race; no unique index), BEFORE TRUNCATE
  trigger on refund_payout_corrections.
- Admin: make the TODO(owner-answers-5) fields required now that the API is merged.
- Migration 1790101100000 down is a no-op (Postgres can't drop enum values).


## Owner answers rounds 7–8: rows 140–156 (2026-10-16) — stacked on the round-6 branches

Merge order: feat/api-owner-answers-6 → feat/api-owner-answers-7; docs/owner-answers-6-runner-specs →
docs/owner-answers-7-specs → docs/owner-answers-8-specs → docs/customer-expired-audit → then
feat/customer-expired-next-action (its specs live on the docs stack).

**Reviewed (READY)**

- `feat/api-owner-answers-7` (0549c5c, a83d179, f595637, 7165eb1, eeb9cc5, fb31f1c): admin offers
  expire after 10 min (`offerExpiresAt`, 409 `offer_expired`), 30 s maintenance sweep moves the task
  RUNNER_ASSIGNED → EXPIRED (row 141, held as built pending row 157) and opens the refund review for
  paid tasks; status transitions serialised with a row lock (accept/cancel vs sweep race); accepting
  marks the assignment `accepted`; tests for rows 140–142. 442 unit, 59 e2e (one file at a time).
- `docs/owner-answers-7-specs` (493f133, e2112ae, 2800da5, fb84a36): rows 140–144, 146 in runner/admin
  specs. Partly superseded by round 8 — merge together.
- `docs/owner-answers-8-specs` (96d69c0 … 5748303): rows 150–156, customer EXPIRED notification,
  OTP 5-minute copy; round-7 review findings closed.
- `feat/customer-expired-next-action` (b624803, eb50eaf, 9978345) + audit `docs/customer-expired-audit`
  (eb86f5c): EXPIRED copy and "Start a new task" on v-track and v-task-detail; design-auditor PASS;
  122 tests. Copy waits on row 158 (recommended before merge).

- `feat/api-owner-answers-8` (8b7bdb1 … ee16a60, merge 9957495): row 152 limit stored per line; rows
  142/151 above-limit approval with a recorded reason in task_exposure_overrides; row 153 payout
  requests (paid below request closes PAID); row 154 private Cloudinary ID/selfie storage, signed admin
  links ≤ 300 s, access log, daily purge (365 days default); errand.EXPIRED customer notification; OTP
  email + SMS 5-minute copy. 4 migrations (1790102100000–1790102400000). 475 unit, 65 e2e. Merge after
  feat/api-owner-answers-7. Defaults pending owner rows 158–164.

**Open / deferred**

- Owner rows 85 (PayHero), 145, 147, 148, 157, 158–164.
- API follow-ups from round-8 review (minors 1–6, 9, 10), not dispatched.
- System Design edits (11, runner-gap-report §11 on docs/owner-answers-8-specs) wait on row 147.
- Auto-offer fall-through (row 150) needs the RA-1 offer model; not built.
- Customer: explicit errand.EXPIRED notification route + core-ui enum once the API sends it.
- Admin: drawer-runner-payout findings 14, 15 and p-payout-requests after the round-8 API.
- e2e suite flaky in parallel (pre-existing); run with --no-file-parallelism.
- Shared local DB `nitume` has round-6 and round-8 migrations applied (ahead of main).
