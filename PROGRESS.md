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


## Owner answers rounds 6–8: rows 103–164 (merged into main 2026-10-16, not pushed)

Merged in reviewed order (merge commits): docs/owner-answers-6-runner-specs (25209e7),
fix/angular-admin-owner-answers-6 (99feb23), feat/runner-scaffold (493e260), feat/api-owner-answers-6
(e4257d5), feat/api-owner-answers-7 (4512f1e), feat/api-owner-answers-8 (feb1dcc),
docs/owner-answers-7-specs (cb57ace), docs/owner-answers-8-specs (4b57454), docs/customer-expired-audit
(ab8c40c), feat/customer-expired-next-action (2985291), feat/admin-runner-payouts (19fdc32; conflict in
refund-drawer.ts / refund-labels.ts resolved by web-parity in fc35709).

**What is on main now**

- API: runner payout ledger and reimbursement rules (round 6); combined exposure cap with audited
  override; admin offers expire after 10 min with 409 `offer_expired`; status transitions serialised by
  a row lock; purchase limit stored per line; above-limit approval only with a recorded reason;
  runner payout requests (paid below request closes PAID); private Cloudinary ID/selfie storage with
  signed admin links (≤ 300 s), access log and daily purge; customer `errand.EXPIRED` notification;
  OTP email/SMS say 5 minutes.
- Admin: runner payouts page and drawer, refund drawer task-cap card and override form, round-5 fields
  required.
- Runner app: scaffold (auth, shell, name capture). Customer app: EXPIRED copy + "Start a new task".
- Specs and audits for rows 103–156; 11 System Design edits listed (runner-gap-report §11), not applied.

**Verified on main:** API tsc clean, 475 unit tests; migrations 43/43 applied on local `nitume`;
nitume_core 319, nitume_runner_device 6, customer_app 122, runner_app 26 tests, analyze clean; admin tsc
clean, 220 tests, production build OK. API e2e not re-run on main (65/65 on the branch, one file at a time).

**Owner answers 157–164 not yet built (rework needed on main)**

- 157: an admin offer that lapses keeps the task RUNNER_ASSIGNED for reassignment (main still expires it).
- 158: owner copy for OTP SMS, ID/selfie privacy line, customer EXPIRED notification (main has the
  earlier proposed copy).
- 159: payout minimum KES 500 via config (main defaults to 0).
- 161: retention clock events (main counts assignments/offers/disputes).
- 162: verify Cloudinary backups/versioning; separate restricted API key.
- 163: reject oversized ID files before permanent storage; client-side check.

**Open / deferred**

- Owner rows 85 (PayHero, incl. reconciliation), 147 (System Design edits), 148 (row-136 cap scope),
  149 (path_provider), 165 (row 164 re-ask). 147 and 148 were open when their branches merged.
- API review minors (idempotency replay race, reversed payouts in available amount, refuse console
  storage in production, magic-byte check, purge SQL placement, upload-limit source, Postman).
- Auto-offer fall-through (row 150) needs the RA-1 offer model.
- Admin: N-21 exception UI, stored-limit display (findings 14, 15), payout requests page, verifications
  panel. Runner: payout and onboarding screens. Customer: explicit errand.EXPIRED route.
- e2e suite flaky in parallel (pre-existing); run with --no-file-parallelism.

## Round 9–10 and runner groundwork (2026-10-16, local main, not pushed)

**Merged**

- `docs/owner-answers-9-specs` (5b46583): owner answers 145, 147–149, 157–166 in specs and System Design
  (row 147 approval); new admin specs drawer-task-offer and p-runners-verification-documents.
- `feat/core-runner-models` (da6ed47): nitume_core models/repos for runner payout requests (incl.
  cancelled, no reason shown to the runner — row 168), payout feed, earnings summary, reimbursement
  claims, ID/selfie upload with the 10 MB check, offer deadline / `offer_expired`, tolerant
  `errand.EXPIRED`. Amount checks in whole cents from strings. core 379, customer 122, runner 26 tests.

**In progress**

- `feat/api-owner-answers-9` (api-contract): rows 157 (lapse keeps task open, latest assignment on admin
  views), 158 copy, 159 KES 500, 161/170/171/175 retention + re-review, 162 restricted Cloudinary key,
  163 413 code, 165, 166 ops cancel, round-8 review minors.
- `docs/owner-answers-10-specs` (design-auditor): owner answers 167–176 ("Finding a runner", EXPIRED when
  matching exhausted, re-review action).

**Runner app plan** (owner request: build remaining screens one by one from the mockup): runner API gaps
(RA-1/26 offers, RA-2, RA-4, RA-5, RA-6, RA-8, RA-10, RA-11, RA-12, RA-17, RA-18, RA-20, purchase-limit
check on assign, row-167 matching-exhausted trigger) after round 9; then flutter-runner screen by screen:
onboarding → profile → jobs → active job → job summary → earnings → notifications.

**Merged (later on 2026-10-16)**

- `docs/owner-answers-10-specs` (d3ee18f): owner answers 167–184 in specs and System Design; row 185
  (deadline_at as an EXPIRED trigger) and 186 left open.
- `feat/core-finding-a-runner` (a8fbdba) + `feat/customer-finding-a-runner` (611beac) + audit
  `docs/customer-finding-a-runner-audit` (54d0fa6): customers see "Finding a runner" during
  RUNNER_ASSIGNED, "En route" chip with a "Runner assigned" timeline step at acceptance, and no offered
  runner (name, card, marker, ETA) before acceptance. core 383, customer 131, runner 26 tests.
  Server-side enforcement of row 183 is in `feat/api-owner-answers-9`, merged below.
- `feat/api-owner-answers-9` (0e12564): admin-offer lapse keeps the task open; offer history for admins;
  no re-offer to a runner who declined/lapsed; customers never see an unaccepted runner (incl. after
  cancel/expire); owner notification and OTP copy with exact titles; KES 500 minimum; payout request
  creator/updatedAt guarded, ops-only cancel (reason 10–500, hidden from runners); ID images: narrowed
  retention clock, audited re-review with optional note, notes deleted at purge, dispute/pending holds,
  restricted Cloudinary credential with backup off, byte check, required front/back side; e2e on its own
  queue prefix. 520 unit, 81 e2e. Note: commit ea87af9 was committed with 2 failing e2e (fixed in the
  next commit; history not rewritten).

**Open**

- Owner rows 85 (PayHero), 185 (deadline as EXPIRED trigger), 186 (purchase limit in the pool).
- Owner action: create a dedicated test database (row 198); Cloudinary checklist and support question
  (rows 192, 193) before production.
- Next: runner API round (offers RA-1, pool and matching-exhausted rules, admin "Expire task — no runner
  available", runner notifications incl. payout cancel, location producer, skills/areas, evidence upload,
  idempotent transitions), then runner screens one by one.
- `feat/core-id-side` (a24db2a): nitume_core sends the ID side (front | back) on government ID uploads and
  groups the latest Front, Back, unknown-side and selfie records (RunnerVerificationDocuments). core 393.
- `docs/owner-answers-11-specs` (023653d): owner answers 185–200 in specs and System Design; admin
  "Expire task — no runner available" specced; §3.3 RUNNER_ASSIGNED → EXPIRED actor S → S, A (row 208,
  owner to confirm).

## 2026-10-19 — Owner answers 201–232, runner API batch 1, round 12/13

**Merged to main (local, on owner instruction):** `feat/api-runner-1` (9f2b64e), `feat/core-runner-batch-1`
(7dcdb30), `docs/owner-answers-12-specs` (e193382), `docs/board-owner-answers-12` (0824053).

- Test safety (rows 198, 199, 219): e2e forced onto the dedicated `nitume_test` database with layered
  guards; test DB reset around each run; append-only guards lifted only on the test DB; 89/89 e2e.
- Runner API batch 1: skills as categories, service areas from config, runner self view and verification
  summary, verification gate, server-set busy, offers/accept/decline, deadline expiry sweep.
- Round 12 specs: §3.3 adds PAYMENT_CONFIRMED → EXPIRED (Admin, row 201).

**Reviewed, awaiting owner merge:**
- `feat/api-owner-answers-12`: admin "Expire task — no runner available", assign refused past deadline,
  offers capped at deadline, decline reasons too_far/not_available/other (migration 1790103200000),
  admin candidates read with offline runners flagged. 594 unit.
- `feat/core-owner-answers-12`: decline reasons, R-23 DeclineReasonDialog, combined National ID status
  (row 209). core 477.
- `docs/owner-answers-13-specs` (with -r23): owner rows 220–232 folded.
- `fix/angular-admin-round-12` + `docs/admin-round-12-audit`: admin findings 26, 30, 31 (merge after the
  API branch). 250 unit.

**In review / building:** `feat/api-owner-answers-13` (paid-task expire, deadline-passed feed item,
default deadline 24 h + NOT NULL migration 1790103300000 — not applied to dev DB), `fix/api-payment-type-seed`
(row 223), `feat/runner-batch-1` (runner onboarding + jobs screens).

**Open:** owner rows 233 (tasks outside all service areas), 234 (no admin feed item on paid-task expire),
235 (default deadline clock).

## 2026-10-19 (later) — rows 233–239, runner batch 1

**Merged to main (local, owner instruction):** feat/api-owner-answers-12/-13, feat/core-owner-answers-12,
docs/owner-answers-13-specs, docs/admin-round-12-audit, fix/angular-admin-round-12, fix/api-payment-type-seed
(merged main: API 614, admin 250, core 477, customer 131, runner 26 unit tests green).

**Reviewed, awaiting owner merge:**
- feat/core-runner-batch-2: B-1 ID-copy fix (no gallery resize, CapturedImage.discard, lost captures), capture
  widget states, NitumeFixedCta, front camera, payment-identity record, decline reason required, errand defaults.
- feat/runner-batch-1 + docs/runner-batch-1-audit: runner onboarding (ID, selfie, status), location disclosure,
  sign-in routing, jobs list and job detail. runner 67 tests.
- docs/owner-answers-14-specs: owner rows 233–239.
- feat/api-deadline-from-payment: out-of-area refusal (233), customer notice (236), payment refused after a
  customer-chosen deadline + new-deadline update (237), Flexible deadline set at payment (235/239; migration
  1790103400000). 634 unit, 107 e2e. Merge gated on row 241 copy.

**Dev DB:** still at 1790103100000; apply round 12–14 migrations deliberately (past deadlines on old open tasks).

**Open:** owner rows 240–244; PR push blocked by permissions (owner to push release/owner-merge-2026-10-19).

## 2026-10-19 (close-out)

- Merged `feat/api-deadline-from-payment` (rows 233, 235–244 incl. row 241 owner copy) and
  `docs/owner-answers-16-specs`. Owner decision rows 201–244 resolved (218 deferred, tracked in 222).
- Dev DB `nitume` migrated through 1790103500000 with the normal migration command. Result: 16 paid tasks
  have deadline = createdAt + 24 h (already past, so unassignable; "Deadline passed" ops items will be written
  by the first deadline sweep once the API runs); the QUOTED task stays Flexible (no deadline); no open offers,
  no status changes, no refund reviews, no new notifications.
- Tests on merged main: API 637 unit + 108 e2e (nitume_test), admin 250, core 509, runner_device 13,
  customer 131, runner 67.

