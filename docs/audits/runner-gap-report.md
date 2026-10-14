# Runner app — gap report (pre-build baseline)

- Date: 2026-10-13 · Auditor: design-auditor · Branch: `docs/owner-answers-6-runner-specs` (from `main` @ `95e9d6c`)
- Mockup: `docs/design/nitume_runner_app.html` · Specs: `docs/specs/runner/` (`_shared.md` + 20 screen specs)
- Checked: `packages/nitume_core/lib/src/**`, `apps/api/src/**` on `main` (read-only). `feat/api-owner-answers-6` had no commits yet when checked; the payout-ledger endpoints below are named from what the screens need.
- **Updated 2026-10-13 (round-6 API alignment)**: RA-1, RA-3, RA-12, RA-14, RA-15, RA-16 re-checked against the final `feat/api-owner-answers-6` @ `10b6019` (read-only); see §4 and the new §8. **Scaffold audit**: `feat/runner-scaffold` @ `4294245`, see §7.

## 1. Verdict

**Partly built (updated 2026-10-13).** `apps/runner_app` is scaffolded on `feat/runner-scaffold`: shell, v-auth-phone, v-auth-otp and x-name-capture audited PASS (§7). Every other view is `missing`. All RQ-1 … RQ-21 are decided (rows 113–133, §9); blockers below are API (RA-n), shared widgets (R-n) and the still-open rows 140–146.

| View | Spec | Status | Blocked by |
|---|---|---|---|
| v-auth-phone | `docs/specs/runner/v-auth-phone.md` | built, audited PASS (§7) | R-17 (stand-in) |
| v-auth-otp | `docs/specs/runner/v-auth-otp.md` | built, audited PASS (§7) | RA-9 (recommended), RQ-15; onboarding routing waits on R-19 + onboarding screens |
| x-name-capture (not drawn) | `docs/specs/runner/x-name-capture.md` | built, audited PASS (§7) | none |
| v-onboard-id | `docs/specs/runner/v-onboard-id.md` | missing | RA-7; R-13, R-15; retention row 144 pending |
| v-onboard-selfie | `docs/specs/runner/v-onboard-selfie.md` | missing | RA-7, RA-8 |
| v-onboard-pending | `docs/specs/runner/v-onboard-pending.md` | missing | RA-8 (phone and payment-identity records); R-05 |
| v-jobs | `docs/specs/runner/v-jobs.md` | missing | RA-1 (offer model), RA-2, RA-3 (accept refusal), RA-5, RA-8; R-02, R-04, R-14; row 141 pending |
| v-job-detail | `docs/specs/runner/v-job-detail.md` | missing | RA-1, RA-2, RA-3; R-05, R-16 |
| v-active | `docs/specs/runner/v-active.md` | missing | RA-2, RA-4, RA-5, RA-11, RA-12, RA-17; R-01, R-06, R-07, R-09, R-16, R-20, R-21 |
| v-evidence-capture | `docs/specs/runner/v-evidence-capture.md` | missing | **RA-11** (upload size), RA-12 (24 h window); R-13, R-15, R-22 |
| v-price-request | `docs/specs/runner/v-price-request.md` | missing | RA-2 (item amount), RA-5 (decision event) |
| v-job-summary | `docs/specs/runner/v-job-summary.md` | missing | RA-2, RA-12 (RA-14/RA-16 satisfied; claim and combined cap built) |
| v-earnings | `docs/specs/runner/v-earnings.md` | missing | R-08, R-11, R-12, R-19 (RA-14 satisfied; `Request payout` waits on RA-15) |
| v-payout | `docs/specs/runner/v-payout.md` | missing | **RA-15** (payout requests, rows 117/118 decided); row 143 pending (copy only) |
| x-payout-history (not drawn) | `docs/specs/runner/x-payout-history.md` | missing | R-12, R-05, R-19 (RA-14 satisfied) |
| v-notifications | `docs/specs/runner/v-notifications.md` | missing | RA-6 (runner kinds) |
| v-profile | `docs/specs/runner/v-profile.md` | missing | RA-10, RA-18; R-10, R-14 |
| v-edit-skills | `docs/specs/runner/v-edit-skills.md` | missing | **RA-10** (skills migration, area list, rows 115/116 decided) |
| x-location-disclosure (not drawn) | `docs/specs/runner/x-location-disclosure.md` | missing | R-20 (rows 123/124 decided) |
| shell (4-tab bar) | `docs/specs/runner/_shared.md` §1 (C-13) | built, audited PASS (§7) | tab bodies are placeholders until each root view is built |

Screens that can be built first with no owner answer and no API change: v-auth-phone, v-auth-otp (client-side role check), x-name-capture, v-notifications (generic feed; runner kinds arrive later), v-profile (stats, menu; skills tags from the public profile), the shell. Then v-earnings / x-payout-history once RA-14 lands.

## 2. App scaffold (flutter-runner)

`apps/runner_app` must be created, mirroring `apps/customer_app` (`_shared.md` §12): Flutter app depending on `packages/nitume_core` by path, `--dart-define-from-file=.env` with a committed `.env.example` (row 59), `.env` gitignored, AppScope + ChangeNotifier (row 58), separate Android/iOS application ids, FCM config not committed, `README.md`, `test/`. `flutter analyze` clean and a smoke test before any screen work.

## 3. Shared widget gaps (core-ui)

From `_shared.md` §4. **NEW**: R-01 runner status presentation, R-02 AvailabilityCard, R-04 JobOfferCard, R-05 InfoRow, R-06 NavigationChip, R-07 ChecklistStepCard, R-08 BalanceCard, R-09 ActionRowCard (or C-24 with subtitle + icon), R-10 StatTile/StatRow3, R-11 WeeklyBarChart, R-12 LedgerLineRow, R-13 CaptureDropZone, R-14 NitumeTag, R-15 CaptureThumbnail, R-16 JobRouteMap, R-18 EAT/distance/duration formatters, R-19 runner data layer (repositories, models, realtime event names), R-20 LocationPinger, R-21 OfflineActionQueue, R-22 EvidenceUploader. **Change**: R-17 `NitumeWordmark(suffix:)`, C-24 `MenuRow` subtitle (if R-09 reuses it), C-31 self-position marker. Everything else is reused from C-01 … C-40 as built.

Design replacements the builders must apply (mockup → design system, `_shared.md` §2): category tag and skill/area badges are not green; chart bars not green; `Mark task complete` is a primary pill button, not a green card; translucent white buttons on the balance card become outline buttons; `#AEB9CC` → blue-050; `#EAEEF4` → blue-050; no shadows; all buttons pill; verification statuses as chips; emoji → icons.

## 4. Endpoint and socket gaps (api-contract): RA-1 … RA-20

> Superseded in part by §9 (owner answers rows 112–139, 2026-10-13): §9 gives the current requirement for RA-1, RA-3 … RA-12, RA-15 and new RA-21 … RA-25.

Status: **exists** (on `main`, usable as is) · **mismatch** (exists, wrong shape or rule) · **missing** · **in progress** (`feat/api-owner-answers-6`).

| Id | Need | Today | Status | Screens |
|---|---|---|---|---|
| RA-1 | Job offers: `GET /runners/me/offers`; `POST /errands/:id/accept` (named in §3.2); `POST /errands/:id/decline` `{ reason }` (`too_far`, `not_available`, `over_purchase_limit`, `other`); offer expiry; refuse a second active job (`runner_busy`) if one-at-a-time is kept | Still no offer flow: admin `POST /errands/:id/assign` creates an `assigned` assignment and moves PAYMENT_CONFIRMED → RUNNER_ASSIGNED; a runner cannot see an errand until assigned. **Part built** (`feat/api-owner-answers-6` @ `10b6019`, row 137): `POST /errands/:id/assignment/decline` `{ reason: 'over_purchase_limit' }` for the current runner, only while RUNNER_ASSIGNED (409 `assignment_not_declinable`), only when over the limit (409 `purchase_within_limit`); assignment → `declined` with `declineReason` (migration `1790101500000`, schema row 134); the task stays RUNNER_ASSIGNED, the runner loses access, admins get an `assignment_declined` feed item, and `POST /errands/:id/assign` reassigns a RUNNER_ASSIGNED task | **partly built**; offers/accept/general decline missing (RQ-1, rows 113, 137) | v-jobs, v-job-detail, v-active §6a |
| RA-2 | Runner job projection: `runnerFee`, `itemAmount` (current, after approved changes), `merchantRoute`, `maxPurchaseAdvance`/`overPurchaseLimit`, `offerExpiresAt`; **without** `feeTotal`, service fee or customer contact | `GET /errands/:id` returns the customer `ErrandView` to the current runner, including `feeTotal` (the customer's fee total, which runners must not see) and no runner fee, item amount or route; `GET /payments/:errandId` refuses runners (`payments.service.ts:1101-1107`) | mismatch | v-job-detail, v-active, v-price-request, v-job-summary |
| RA-3 | Purchase limit (row 108): runner sees and acts on a purchase above `maxPurchaseAdvance`; declines with `over_purchase_limit` never count against the runner | **Satisfied for the built model** (`feat/api-owner-answers-6` @ `10b6019`): `GET /errands/:id/purchase-check` → `{ errandId, runnerProfileId, requiredPurchase, maxPurchaseAdvance, overLimit }` (runner: current assignment; admin: any runner via `runnerProfileId`, so ops can check before assigning); decline as RA-1; at CONFIRMED an item line above the limit goes `on_hold` (`over_purchase_limit`, row 135 open); claims capped at min(item paid to Nitume, limit). Not built (no accept step): refusing accept above the limit (`purchase_limit_exceeded`) and excluding such runners from matching; revisit with RQ-1. No admin endpoint sets the limit (row 138) | satisfied (accept-side rules wait on RQ-1) | v-jobs, v-job-detail, v-active §6a |
| RA-4 | `location:ping` intake (§4.2): Redis GEO, `currentLocation`/`lastPingAt` sampling, fan-out `location:update` to `errand:{id}`, geofenced ARRIVED (system) (§4.3) | Gateway has only the push side; "Producer (runner `location:ping`) not built yet" (`realtime.gateway.ts:128`). BOARD Needs row 54 | missing (known) | v-active (customer v-track too) |
| RA-5 | Runner socket room `runner:{runnerId}` joined on connect; events `job:offered`, `job:offer_withdrawn`, `price_change:decided` (`approved`/`rejected`, with `toPrice`), `payout:updated` | Only `errand:{id}` rooms and the `admins` room; no runner room; price-change decisions emit nothing to the runner (approval changes no state) | missing | v-jobs, v-job-detail, v-active, v-price-request, v-earnings |
| RA-6 | Runner notification kinds + push copy (list in `v-notifications.md`): offer, assigned, customer confirmed, payable, cancelled, failed, disputed/resolved, price change decided, payout sent/reversed/re-sent/corrected, reimbursement on hold/approved, rating received, verification approved/rejected. `KSh` in text (row 82) | Notification worker writes customer copy only (`notifications.service.ts:462-483` `statusCopy`), status changes notify the customer only; feed endpoints work for any role | missing | v-notifications, push deep links |
| RA-7 | Verification document upload to restricted storage (system design §10): ID front + back, selfie; returns document keys; `POST /runners/me/verifications` accepting several keys; optional runner-safe rejection reason | `AddVerificationDto { verificationType, documentS3Key? }` (one key); no upload endpoint; evidence storage (Cloudinary/console) is not the restricted store | missing / mismatch (RQ-13) | v-onboard-id, v-onboard-selfie, v-onboard-pending |
| RA-8 | Verification gate (non-negotiable "no ID-verification bypass"): refuse `availability: online`, offers and accept unless verified (RQ-14 definition); auto-create `phone` (approved at OTP sign-in) and `payment_identity` (pending) records; `POST /runners/me/verifications/submit` notifying ops | `setAvailability` has no verification check (`runners.service.ts:150`); no phone or payment-identity records are created | missing | v-jobs, v-onboard-selfie, v-onboard-pending |
| RA-9 | `POST /auth/otp/verify` with `role: runner` on an existing customer phone: refuse with `role_mismatch` (no tokens issued) | Existing users sign in with their stored role; the `role` field only applies to new users (`auth.service.ts:108-131`) | mismatch (RQ-15) | v-auth-otp |
| RA-10 | Skills and areas readable on `GET /runners/me`; area options `GET /runners/service-areas`; skill vocabulary per RQ-3 | `GET /runners/me` returns the entity only; `PUT /runners/me/skills` uses `RunnerSkill` (`shopping, pickup_delivery, inspection, documents, property_visits, queuing, business_errands`), not the six categories; areas are free text, no option list | mismatch / missing (RQ-3, RQ-4) | v-edit-skills, v-profile, v-jobs |
| RA-11 | Evidence: accept real photo sizes (raise the JSON limit for this route, or multipart / signed upload URL as §3.2 `POST /evidence/:errandId/upload-url` + `/confirm`); state guard for runner uploads (ARRIVED, IN_PROGRESS; receipts also AWAITING_CUSTOMER); §3.3 guard "IN_PROGRESS → AWAITING_CUSTOMER requires evidence" (+ a receipt on `send_to_runner`, rows 95, 105) | `POST /errands/:id/evidence` takes base64 JSON with no body-size configuration (Nest default 100 kB) and no state check (`evidence.service.ts:63-80`); the transition does not check evidence | mismatch | v-evidence-capture, v-active |
| RA-12 | Receipt upload by the assigned runner after CANCELLED/FAILED for row 106 claims, creating an `on_hold` reimbursement line (time window per RQ-17) | **Claim built**: `POST /runners/me/reimbursement-claims` `{ errandId, amount, receiptEvidenceId, note? }` (CANCELLED/FAILED only, the task's runner, a `receipt` evidence the runner uploaded on the task; always `on_hold` `out_of_pocket_claim`; cap min(item paid, `max_purchase_advance`); errors in `v-job-summary.md`). Still open: no time window (RQ-17 / row 129) and the receipt upload after the end only works because `POST /errands/:id/evidence` has no state guard (RA-11) | open (window, upload guard) | v-job-summary, v-active |
| RA-13 | Runner notes | `PATCH /errands/:id/runner-notes` (ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER; ≤ 2000) | exists | v-active |
| RA-14 | Payout ledger reads (row 107) | **Satisfied** (`feat/api-owner-answers-6` @ `10b6019`): table `runner_payout_lines` (migration `1790101400000`; append-only, DELETE/TRUNCATE refused, `paid`/`rejected` final), column `kind` (`runner_fee | item_reimbursement | correction | reversal | resent_payout`), status `on_hold | payable | paid | rejected` (adjustments `recorded`). `GET /runners/me/earnings?from&to&groupBy` → `{ currency, availableAmount, pendingAmount, onHoldAmount, paidAmount, byKind, week[7], weekTotal, period }`; `GET /runners/me/payout-lines?kind&errandId&cursor&limit` → `{ items: PayoutFeedItem[], nextCursor }` with a derived `payout` entry per M-Pesa payout (id `payout:<uuid>`, opaque, not stored). Shapes in `v-earnings.md` Data. Admin side: `GET/POST /runner-payouts…` (list, count, summary, detail, review, hold, mark-paid, corrections; row 112 open for screens) | satisfied | v-earnings, x-payout-history, v-job-summary |
| RA-15 | Runner payout request: `POST /runners/me/payouts` `{ amount }` + `Idempotency-Key`; list of requests; errors `payout_exceeds_available`, `payout_below_minimum`, `payout_already_open`; ops record the M-Pesa receipt | Nothing. The draft `GET /runners/me/payouts` was **removed** on `feat/api-owner-answers-6`; sent payouts are read from the feed's derived `payout` entries; ops record payouts with `POST /runner-payouts/mark-paid` (1–50 payable lines of one runner) | missing (RQ-5 / row 117; needs a payout-request record, schema not covered by row 107) | v-payout, v-earnings |
| RA-16 | Per-errand ledger state on the runner job view | **Satisfied**: `GET /runners/me/payout-lines?errandId=<id>` | satisfied | v-job-summary |
| RA-17 | Idempotent runner transitions for offline replay: `Idempotency-Key` on `PATCH /errands/:id/status`, or "already in the target state by the same actor" answered as success | Replaying a transition answers 409 | missing | v-active (offline queue) |
| RA-18 | `GET /runners/me` as a runner view: `shortName` (row 40), skills, areas, verification summary (`verified: boolean`, per-type status) | Raw entity | mismatch | v-profile, v-jobs |
| RA-19 | Dispute read with the resolution note (row 79) | `GET /errands/:id/dispute` allows the runner; `resolvedBy: null` (row 101) | exists | v-active |
| RA-20 | Availability semantics: `busy` set by the server while the runner holds an active job; refuse `offline` with an active job (or define what happens) | Runner may set any value including `busy` | mismatch | v-jobs, v-profile |

Also exists and used as is: `POST /auth/otp/request`, `POST /auth/refresh`, `POST /auth/logout`, `GET/PATCH /users/me`, `POST/DELETE /users/me/devices` (runner allowed), `GET /notifications*` (any role), `PATCH /runners/me/availability`, `GET/POST /runners/me/verifications`, `PUT /runners/me/skills|service-areas`, `GET /runners/:id/profile`, `GET /errands` (runner-scoped to the current assignment), `GET /errands/:id/history`, `PATCH /errands/:id/status` (actor-checked), `GET /errands/:id/evidence`, `GET/POST /errands/:id/price-change` (runner: IN_PROGRESS, Buy For Me / Get It For Me), `GET /errands/:id/tracking`, `GET /errands/:id/rating`, socket `errand:join/leave`, `errand:status_changed`, `evidence:uploaded`, `errand:access_revoked`.

Admin follow-up (no spec yet): ops need a place to review `on_hold` reimbursement lines (rows 105, 106), runner payout requests (RQ-5) and payouts, and the M-Pesa identity match (RQ-14). design-auditor can spec these as admin views once RA-14/RA-15 exist.

## 5. Questions for the owner: RQ-1 … RQ-21

> **All decided 2026-10-13** (BOARD rows 113–133; see §9 for the decisions). The text below is kept as the record of what was asked.

Each falls under AGENT_BUILD_INSTRUCTIONS §3 unless marked minor. Defaults are recommendations only; nothing is decided here.

- **RQ-1 (state machine / matching; blocking v-jobs, v-job-detail)**: How does a runner get a job in MVP? Today the admin assigns and the runner has no accept step, but the mockup shows offers with Accept/Decline and §3.3 has "RUNNER_ASSIGNED → EXPIRED: no runner accepts in time". **Recommended default**, no new states: the admin's assign creates an `offered` assignment and moves PAYMENT_CONFIRMED → RUNNER_ASSIGNED (as today); the runner's Accept sets the assignment `accepted` (no state change) and only then may the runner move RUNNER_ASSIGNED → RUNNER_EN_ROUTE; Decline sets `declined` and the admin offers it to another runner while the errand stays RUNNER_ASSIGNED; if nobody accepts in time the system moves RUNNER_ASSIGNED → EXPIRED (opens the refund review, row 102). Alternative: keep direct assignment (no Accept/Decline) and drop the offer cards.
  - **RQ-1 b (policy)**: may a runner accept a job above their purchase limit (row 108 only says they may decline), and do declines count against them? Default: accept refused above the limit; declines never affect metrics in MVP.
- **RQ-2 (matching config)**: how long an offer stays open before it expires. §3.4 says 90 s for auto-offers; for admin-made offers default 10 minutes, configurable.
- **RQ-3 (schema; blocking v-edit-skills)**: skills vocabulary. The API enum (`shopping, pickup_delivery, inspection, documents, property_visits, queuing, business_errands`) and the mockup chips (`Shopping, Inspections, Documents, Property visits, Representation, Business tasks`) do not match the six categories, and there is no skill for Go There For Me. Default: skills = the category enum values (`buy_for_me … business`), shown by display name, Business Tasks hidden in MVP; migrate existing skills (`shopping`→`buy_for_me`, `pickup_delivery`/`documents`→`pickup_delivery`, `inspection`/`property_visits`→`inspection`, `queuing`→`queue_admin`, `business_errands`→`business`).
- **RQ-4 (product config)**: service-area list (mockup: CBD, Westlands, Kilimani, Lavington, Karen). Default: an ops-maintained configured list of Nairobi areas served by `GET /runners/service-areas`; free text no longer accepted from the app.
- **RQ-5 (payments; blocking v-payout)**: may runners request payouts on demand, or only batched payouts (§6 allows "daily or on-demand above a threshold")? Default: on-demand requests of any amount up to the available amount, configurable minimum (no number invented; ops sets it), one open request at a time, paid manually by ops to the sign-in M-Pesa number with the receipt recorded; needs a payout-request record (schema).
- **RQ-6 (security)**: payout destination fixed to the runner's sign-in phone. Default yes; changing it goes through Support.
- **RQ-7 (pricing)**: the mockup's `Base + report fee` / `Distance bonus` lines. Default: one `Runner fee` line until pricing rates exist (as row 47 for customers).
- **RQ-8 (product / schema)**: evidence checklist and estimated task time. The mockup shows task-specific items (`Compound photos`, `Bedroom & bathroom video`, `Caretaker notes`) and `45 min task`; neither exists in the data model. Default: a generic checklist (arrived, ≥ 1 photo, receipt on purchase tasks, notes required for Check It For Me) and no estimated time until the owner adds per-task requirements and duration.
- **RQ-9 (scope)**: video evidence for runners. Row 32 deferred video for customers. Default: photos only for runners too; no "video" wording.
- **RQ-10 (display rule, minor)**: runner times in 12-hour East Africa Time regardless of device zone, as row 96 for admin. Default yes (the mockup shows `10:28 AM`).
- **RQ-11 (privacy / security)**: when is location collected? Default: every 30 s while online (for the admin live map and matching radius, §4.2 GEO cache), every 4–8 s / 15 m during an accepted job up to AWAITING_CUSTOMER, never while offline; background collection only during a job; nothing persisted beyond the §4.2 sampling.
- **RQ-12 (third-party packages)**: approve `geolocator` (named in §7.2) with its Android foreground-service support, `image_picker` (camera capture, §7.2 "native camera plugin"), `permission_handler`, and a small local store for the offline queue (`shared_preferences` or `sqflite`). Default: these four.
- **RQ-13 (security / third-party)**: storage for ID photos and selfies: §10 requires a restricted store separate from evidence. Default: a separate private Cloudinary folder (or S3 bucket) with signed, short-lived admin-only URLs, access logged, retention while the account exists + a fixed period after closure (owner sets).
- **RQ-14 (security)**: verification process. Default: manual review by ops of the ID (front/back), the selfie against the ID, and an M-Pesa name match (the name M-Pesa shows for the runner's number); "verified" = all four checks approved; no automated liveness vendor in MVP.
- **RQ-15 (identity)**: one phone = one role in the API. May a customer also be a runner on the same number? Default: no for MVP; the runner app refuses customer accounts (copy in `v-auth-otp`), and RA-9 makes the API refuse too.
- **RQ-16 (privacy)**: how does a runner reach the customer during a job (gate access, item questions)? In-task chat is out of MVP (OA-18) and the mockup shows no contact. Default: no direct contact and no phone number in the app; the runner uses Support and ops relay.
- **RQ-17 (payments, row 106)**: a runner who bought the item but had not uploaded the receipt before the task ended CANCELLED/FAILED. Default: the assigned runner may upload a receipt for 24 h after the end (creates an `on_hold` reimbursement line for ops); after that, only through Support.
- **RQ-18 (payments, row 105)**: should the runner enter the receipt total so a "mismatch" can be detected automatically? Default: no field (no schema change); ops compare the receipt image with the item amount.
- **RQ-19 (compliance, minor)**: Terms & Privacy line on the runner sign-in and a Profile row, with runner terms URLs. Default yes.
- **RQ-20 (state machine)**: a runner who cannot finish after arriving (ARRIVED or IN_PROGRESS: shop closed, site locked) has no transition; FAILED is allowed only from RUNNER_EN_ROUTE and IN_PROGRESS → CANCELLED only through the customer's price-change reject. Default: no new transition; the runner contacts Support and ops resolve it (e.g. through a dispute). Alternative: allow ARRIVED/IN_PROGRESS → FAILED (runner/admin).
- **RQ-21 (copy, minor)**: the Earnings list is labelled `Recent payouts` but lists earnings and payouts. Default: keep the mockup label until the owner prefers `Recent activity`.

## 6. Domain checks applied in the specs

- Six categories by display name; mockup tags `Inspection`/`Shopping`/`Documents` replaced; Business Tasks not offered (OA-18).
- State machine §3.3 exactly: the runner fires only RUNNER_ASSIGNED → RUNNER_EN_ROUTE, RUNNER_EN_ROUTE → ARRIVED / FAILED, ARRIVED → IN_PROGRESS, IN_PROGRESS → AWAITING_CUSTOMER; CONFIRMED/SETTLED shown as `Completed`/`Paid`; no invented states (RQ-1 and RQ-20 ask instead).
- No wallet/escrow: `Available balance` is a payout-ledger view with an explanation; `On hold` only as a ledger line status.
- Three flows separate: the runner sees the runner fee and the item amount (and route) only; never `feeTotal` or the service fee; item reimbursement is never counted as earnings.
- Rows 95, 104–108 applied: reimbursement after CONFIRMED, receipt step, on-hold copy, no runner fee on CANCELLED/FAILED, ledger line kinds, purchase-limit notice and decline on `v-jobs` / `v-job-detail`.

## 7. Audit 2026-10-13: scaffold, shell and auth (`feat/runner-scaffold`)

Audited `feat/runner-scaffold` @ `4294245` (3 commits on `main`: `063f036` scaffold, `8ea961c` session/services/shell, `4294245` auth screens), read-only, against `_shared.md` §1, §12, `v-auth-phone.md`, `v-auth-otp.md`, `x-name-capture.md`. From a `git archive` of `apps/runner_app` + `packages/nitume_core`: `flutter analyze` **no issues**, `flutter test` **26 tests pass** (smoke, session, shell, auth). Token search (`Color(0x`, `Colors.`, `fontFamily`, `GoogleFonts`, hex) finds nothing in `lib/` or `test/`; every colour is a `NitumeColors` token, every number span uses `NitumeTypography.numeric`. No wallet/escrow words. Tracked files are clean: `.idea/`, `*.iml`, `.flutter-plugins-dependencies`, `.env`, Firebase and Maps config are gitignored and not committed.

| View | Verdict | Findings |
|---|---|---|
| shell | **PASS** | m-1 (minor) |
| v-auth-phone | **PASS** | m-2, m-3 (minor) |
| v-auth-otp | **PASS** | m-2 (minor); D-1 deferred |
| x-name-capture | **PASS** | m-2, m-3 (minor); D-1 deferred |

### Decisions on the deliberate deviations

1. **Local `TODO(core-ui)` copies of the customer auth helpers** (`screens/auth/auth_frame.dart`: `AuthFrame`, `AuthHeading`, `InlineError`, `rateLimitError`; `util/display.dart`: `formatPhoneIntl`, `friendlyError`): accepted for this round as m-2, not a FAIL. They are copies of `apps/customer_app` code that is not in `nitume_core` yet; the runner app cannot import from another app, and only core-ui may edit the package. Each copy is marked and the diff against the customer file is comments only (plus `rateLimitError`, moved from the customer's `phone_screen.dart`). They become a FAIL if a third copy appears or the copies drift.
2. **Role hard-coded** (`UserRole.runner` in `otp_screen.dart`; `SessionController._isRunner`) instead of `NITUME_APP_ROLE`: accepted, and `_shared.md` §12 is amended. A one-role app gains nothing from a configurable role, and a misbuilt runner app with `customer` would sign customers in. The README says so.
3. **App ids** `com.nitume.runner_app` (Android) and `com.nitume.runnerApp` (iOS): accepted. They follow the customer app's pattern, so both apps install side by side. `_shared.md` §12 is amended. The final store ids are the owner's call before release (not a §3 item, so this is not a new question).
4. **Onboarding routing deferred** (`session.dart` `_signIn`, `TODO(flutter-runner)`; v-auth-otp routing step 3 and the x-name-capture exit): recorded as **D-1**, not a FAIL here. The onboarding screens and R-19 (`GET /runners/me`, verifications) do not exist yet, and the API has no verification gate (RA-8), so a route to the onboarding screens is not possible yet. D-1 must be closed in the onboarding build, and that build's audit fails without it. Until then an unverified runner lands on the shell, whose tabs show nothing (no offers, no data), so nothing leaks.
5. **Placeholder tab bodies** (`RootTabPlaceholder`: C-09 top bar + empty body): accepted for the shell. Each body belongs to its own view spec (`v-jobs` title `Nearby jobs`, `v-active` `Active job`, `v-earnings` `Earnings`, `v-profile`) and is audited with that view.

### shell: PASS
- `RunnerShell` (`screens/shell/runner_shell.dart`): `IndexedStack` of four roots above core `NitumeTabBar` (C-13), labels `Jobs`, `Active`, `Earnings`, `Profile`, Material outline icons for briefcase / eye / circle-plus / person, active colours from the core tab bar; slate background. `ShellController` keeps the tab; sign-in resets to Jobs (`app.dart` `_onSession`); every session change pops pushed screens. The home switches on `SessionStatus` (splash → phone → name → shell), with `Please sign in again.`, suspended and wrong-account snackbars. Tested (`shell_test.dart`, `auth_test.dart`).
1. m-1 (minor) `widgets/root_tab_placeholder.dart:15`: placeholder titles are the tab labels (`Jobs`), not the view titles (`Nearby jobs`, `Active job`). They are replaced when each view is built, so no change is needed now. Listed so the builder does not keep them.

### v-auth-phone: PASS
- Layout and copy as specced: R-17 stand-in wordmark (`widgets/runner_wordmark.dart`), heading `Earn on your own schedule.`, sub `Enter your phone number to sign in or apply as a Runner.`, `NitumeField.phone` with hint `+254 7XX XXX XXX` (semantics `Phone number`), `Send code` primary pill with a spinner, legal line `By continuing you agree to Nitume's Runner Terms & Privacy Policy.` with C-04 links that render as plain text when the URL is unset (RQ-19 default). The OA-17 states match the customer behaviour: invalid number copy, silent cooldown → OTP with the remaining time, rate limit `Too many code requests. Try again in N min.` (N in Fira Code) or `… Try again later.`, `We couldn't send the code. Try again.`, network/generic. Tested.
2. m-2 (minor, reuse) `screens/auth/auth_frame.dart:5-7`, `util/display.dart:5-6`: local copies, decision 1. Fix (core-ui): promote `AuthFrame`, `AuthHeading`, `InlineError`, `rateLimitError`, `formatPhoneIntl`, `friendlyError` to `nitume_core`, then delete both app copies (customer and runner) in one follow-up each.
3. m-3 (minor, reuse) `widgets/runner_wordmark.dart:6`: R-17 stand-in (core `NitumeWordmark` + a `Runner` text), marked `TODO(core-ui)`. Fix (core-ui): `NitumeWordmark(suffix:)` (R-17), then delete the stand-in.

### v-auth-otp: PASS
- Pushed header with back only; `Enter the code`; sub with the phone as `+254 733 111 222` in a Fira Code span; core `OtpCodeField` (one-time-code autofill, semantics `Verification code, 6 digits`, auto-submit on the 6th digit); `Verify & continue`; core `OtpResendLine` with the cooldown. Errors: incorrect, attempts exhausted and expired/not requested (boxes disabled, new code required), resend too soon, rate limits, delivery failure, generic; `account_suspended` (and an uncoded 401 from older builds) → `This account can't sign in. Contact support.` with `Contact support` when `supportUri` is set. `Enter the 6-digit code.` for a short code is the customer builder copy accepted on 2026-10-07 (`docs/specs/customer/v-auth-otp.md` Copy).
- RQ-15 default: sends `role: runner`; a non-runner user from verify (or from a restored session) is signed out at once (`AuthRepository.logout` revokes, tokens cleared) and the wrong-account copy is shown, with `Contact support`. `role_mismatch` (RA-9) is already handled when the API sends it (`session.dart` `roleMismatchCode`, `TODO(api-contract)`). Push registration runs after sign-in and unregisters before log out/expiry. Tested (`auth_test.dart`, `session_test.dart`).
- D-1 (deferred) `services/session.dart` `_signIn`: routing step 3 (onboarding by verification state). See decision 4.

### x-name-capture: PASS
- `What's your name?`, sub `Use the name on your National ID. Customers see your first name and initial.`, field `Your full name` / `e.g. Brian Kamau` with `TextCapitalization.words`, `AutofillHints.name`, submit on done, `Continue` with a spinner; validation `Enter your name.` (< 2) and `Keep it under 60 characters.`; save error `Couldn't save your name. Try again.`; `PopScope(canPop: false)`, so there is no back and no skip. `PATCH /users/me` through `AuthRepository.updateDisplayName`. Tested.
- m-2, m-3 apply (shared frame and wordmark). D-1 applies to the exit (onboarding vs shell).

### Builder lists
- **core-ui**: m-2 promote the auth helpers; m-3 R-17 `NitumeWordmark(suffix:)`; R-19 runner data layer (needed for D-1).
- **flutter-runner** (after core-ui): switch to the core helpers and delete the copies; D-1 in the onboarding build; m-1 with each view.
- **api-contract**: RA-9 `role_mismatch` (optional; the client check covers it).

## 8. Round-6 API alignment (`feat/api-owner-answers-6` @ `10b6019`)

Read-only check of `src/payments/runner-payout-line.entity.ts`, `runner-payouts.service.ts`, `runner-payouts.controller.ts`, `runner-earnings.controller.ts`, `dto/runner-payout.dto.ts`, `src/matching/purchase-limit.service.ts`, `matching.controller.ts`, `src/errands/errands.service.ts` (`declineAssignment`), migrations `1790101300000` (refund corrections TRUNCATE guard), `1790101400000` (`runner_payout_lines`), `1790101500000` (`errand_assignments.declineReason`) and `postman/build-nitume-collection.js` (folder `10_Runner_Payout_Ledger_2026_10_13`).

Specs updated to the final names: `v-earnings.md` (feed table, chips, reasons, earnings fields), `x-payout-history.md` (filters by `kind`, payout grouping by `lineIds`, adjustments by `relatedLineId`), `v-job-summary.md` (per-errand lines, claim flow), `v-active.md` §6a (purchase check + decline on RUNNER_ASSIGNED), `v-jobs.md` / `v-job-detail.md` (what is built without offers), `v-payout.md` (no `GET /runners/me/payouts`), `_shared.md` §4 R-12/R-19, §8, §12.

Differences from what the specs assumed, now applied:
1. No `pending` line status. Tasks before CONFIRMED are not lines; they only count in `pendingAmount`.
2. A `rejected` status exists (ops rejected an item line); shown as `Not approved`, not counted.
3. `payout` is not a stored line: a derived feed entry per M-Pesa payout (id `payout:<uuid>`, opaque), possibly covering several tasks (`errandId` null, `lineIds`).
4. Adjustments (`correction`, `reversal`, `resent_payout`) point at the **job line** (`relatedLineId`), not at the payout entry. `correction` and `reversal` have status `recorded`; `resent_payout` is `paid`.
5. Signs: reversal positive (owed again), re-sent payout negative, correction = previous − new sent amount (0 for a receipt-only fix).
6. `reviewReason` on `on_hold` lines: `receipt_missing`, `receipt_mismatch`, `out_of_pocket_claim`, `over_purchase_limit`, and (from `cf525cf`) `price_decrease_pending`.
7. The chart is runner fee per day of line creation (= CONFIRMED day), current EAT week.
8. The decline exists only on the assigned job (no offers), only for `over_purchase_limit`, only at RUNNER_ASSIGNED.
9. The claim cap is min(item paid to Nitume, `max_purchase_advance`); no time window.

### System Design §2.2 / §6: changes (applied 2026-10-13)

Applied to `docs/design/Nitume_System_Design.md` on this branch at the orchestrator's assignment (owner-answer edits, as rounds 4 and 5, rows 66/70); `dcb982f` kept. Text as applied:


- §2.2 `runner_payout_lines`: replace "Proposed columns (api-contract confirms the final shape): … `createdAt`." with: "Built (migration `1790101400000`): `id`, `runnerProfileId` FK, `errandId` FK (not null), `kind` (`runner_fee | item_reimbursement | correction | reversal | resent_payout`), `status` (`on_hold | payable | paid | rejected` for obligations, `recorded` for adjustments), `requestedAmount`, `amount` (unsigned; null while on hold or rejected), `capAmount`, `reviewReason` (`receipt_missing | receipt_mismatch | out_of_pocket_claim | over_purchase_limit`), `receiptEvidenceId`, `relatedLineId` (adjustments → the obligation), `previousReference`, `previousAmount`, `payoutReference`, `paidAt`, `paidByUserId`, `note`, `decisionNote`, `decidedByUserId`, `decidedAt`, `createdByUserId`, `createdAt`, `updatedAt`. One obligation per errand and kind. Append-only (DELETE/TRUNCATE refused); an obligation only moves `on_hold → payable | rejected`, `payable → paid`, or (unpaid item line) `payable → on_hold`; `paid` and `rejected` are final; adjustments are never updated. Payouts are not rows: a manual M-Pesa payout marks 1–50 payable lines of one runner `paid` with one receipt, and the runner feed shows it as one derived `payout` entry with signed amounts."
- §2.2 `errand_assignments`: add "`declineReason` (nullable enum `over_purchase_limit`, migration `1790101500000`, row 134)."
- §6 "Runner reimbursement" item 4: add "A `send_to_runner` purchase above the runner's `max_purchase_advance` at CONFIRMED is also created `on_hold` (`over_purchase_limit`, row 135)."
- §6 item 5: replace "capped at the verified receipt amount and at the item amount paid to Nitume (row 105) and the runner's `max_purchase_advance` (row 108)" with "claimed by the runner (`POST /runners/me/reimbursement-claims`, always `on_hold`), capped at the lower of the item amount paid to Nitume and the runner's `max_purchase_advance` (rows 105, 108, 135); ops approve up to that cap".
- §6 item 7: add "Built: `GET /errands/:id/purchase-check` and, before RUNNER_EN_ROUTE, `POST /errands/:id/assignment/decline` `{ reason: over_purchase_limit }`; the task stays RUNNER_ASSIGNED and an admin reassigns it (row 137)."
- §6 "Payouts to Runners": add "Runner reads: `GET /runners/me/earnings` (available, pending, on hold, paid, EAT week) and `GET /runners/me/payout-lines`; all figures derived from the lines."

## 9. Owner answers rows 112–139 (2026-10-13)

Read from `BOARD.md` on `main` @ `a99175d`. Specs updated in `f0ea925` (runner) and the admin ledger specs (row 112) in `docs/specs/admin/`.

### Decisions applied

| RQ | Row | Decision | Specs |
|---|---|---|---|
| RQ-1, RQ-1 b | 113 | Offers inside RUNNER_ASSIGNED; accept → RUNNER_EN_ROUTE; decline → stays RUNNER_ASSIGNED, reassigned; offer lapses → EXPIRED; accept above `max_purchase_advance` refused; over-limit decline allowed, not penalised | `_shared.md` §0, §6, §8; v-jobs, v-job-detail, v-active |
| RQ-2 | 114 | Admin offers 10 min; auto-offers keep the configurable 90 s | v-jobs, v-job-detail |
| RQ-3 | 115 | Skills = the six category values, migration from `RunnerSkill` | v-edit-skills, v-profile |
| RQ-4 | 116 | Service areas = ops-configured list | v-edit-skills, v-profile |
| RQ-5 | 117 | Payout requests up to the available amount, configurable minimum, one open request, ops pay manually, own auditable record | v-payout, v-earnings, x-payout-history |
| RQ-6 | 118 | Destination fixed to the sign-in phone | v-payout |
| RQ-7 | 119 | One `Runner fee` line | v-job-summary |
| RQ-8, RQ-9 | 120, 121 | Generic checklist, no duration; photos only | v-active, v-evidence-capture, v-jobs, v-job-detail |
| RQ-10 | 122 | 12-hour EAT in the app, canonical timestamps in the API | `_shared.md` §7 |
| RQ-11 | 123 | 30 s online, 4–8 s on a job, nothing offline | `_shared.md` §10, x-location-disclosure |
| RQ-12 | 124 | `geolocator`, `image_picker`, `permission_handler`, local queue store | R-20 … R-22 |
| RQ-13, RQ-14 | 125, 126 | Restricted private storage, signed admin-only URLs, logged access; manual review, verified when all required checks pass | onboarding, `_shared.md` §9 |
| RQ-15 | 127 | One phone, one role | v-auth-otp (built) |
| RQ-16 | 128 | No direct contact; Support relays | v-active |
| RQ-17, RQ-18 | 129, 130 | Receipt upload 24 h after CANCELLED/FAILED; no receipt-total field | v-active, v-evidence-capture, v-job-summary |
| RQ-19 | 131 | Terms & Privacy on sign-in and Profile | v-auth-phone (built), v-profile |
| RQ-20 | 132 | No FAILED from ARRIVED/IN_PROGRESS; Support (`Get help with this task`) | v-active |
| RQ-21 | 133 | Keep `Recent payouts` | v-earnings |
| — | 134 | `errand_assignments.declineReason` approved | v-jobs |
| — | 135 | Over-limit purchase at CONFIRMED → ops review; max claimable = min(item paid to Nitume, `max_purchase_advance`) | `_shared.md` §8, v-job-summary, admin specs |
| — | 136 | Task-level combined exposure cap (customer refund + runner item reimbursement) on CANCELLED/FAILED; above it, ops review and explicit handling | `_shared.md` §8, v-job-summary, admin specs |
| — | 137 | Replace the decline-only build with the row-113 offer model | v-jobs, v-active §6a removed |
| — | 138 | KES 3,000 default, per-runner, admin-edited with audit (actor, time, previous, new); runners cannot change it | v-profile (read-only row), admin specs |
| — | 139 | Runner notification copy defined (`v-notifications.md`); runner socket room scoped server-side | v-notifications, `_shared.md` §10 |

### API requirements after the answers (api-contract)

| Id | Requirement | Status |
|---|---|---|
| RA-1 | Offer model (row 137): admin assign creates an `offered` assignment, task → RUNNER_ASSIGNED; `GET /runners/me/offers`; `POST /errands/:id/accept` = RUNNER_ASSIGNED → RUNNER_EN_ROUTE + assignment `accepted` (409 `offer_expired`, `runner_busy`, `purchase_limit_exceeded`); `POST /errands/:id/decline` `{ reason?: 'over_purchase_limit' }` (task stays RUNNER_ASSIGNED, admin reassigns; reason accepted only when over the limit); offers expire after 10 min (admin) / 90 s (auto); expiry → EXPIRED (RQ-22). Offered runners can read the runner projection (RA-2) and `purchase-check`. The current `assignment/decline` route folds into this | missing (decline-only build exists) |
| RA-3 | Accept refused above the limit; declines with `over_purchase_limit` never feed any runner metric | missing (accept side) |
| RA-4 | `location:ping` with the row-123 cadence; the server ignores pings from an offline runner | missing |
| RA-5 | Room `runner:{runnerId}` joined by the server from the JWT on connect (row 139: never a client-supplied id); `job:offered`, `job:offer_withdrawn`, `price_change:decided`, `payout:updated` | missing |
| RA-6 | Runner notification kinds with the copy in `v-notifications.md` (row 139: at least payout sent, payout reversed, reimbursement approved, rejected, paid) | missing; copy now final |
| RA-7 | Verification documents to restricted private storage (row 125) | missing |
| RA-8 | Verification gate: verified only when all required checks are approved (row 126) | missing |
| RA-10 | Skills migration to category values (row 115); `GET /runners/service-areas` from an ops-configured list, `PUT /runners/me/service-areas` accepts listed areas only (row 116) | missing |
| RA-12 | 24 h receipt upload and claim window after CANCELLED/FAILED (row 129), then refused with a code (e.g. `reimbursement_window_closed`) | missing (claim built without a window) |
| RA-15 | Payout-request record and endpoints (row 117): runner create/list/summary, ops list/mark-paid/reject, configurable minimum, one open request, destination = sign-in phone (row 118), every step audited; names in `v-payout.md` and the admin specs | missing |
| RA-21 | **Built on `feat/api-owner-answers-6` @ `dbc3a76`** (409 `task_exposure_cap_exceeded`, `exposureOverrideNote`, `taskExposure`, `exposureOverrides[]`; storage row 145 pending). Task-level combined exposure cap (row 136) on CANCELLED/FAILED: customer refund decisions and runner item reimbursements (claims and approvals) checked together; above the cap only through an explicit ops override with a reason; the refund drawer and the ledger review both show the remaining exposure | missing |
| RA-22 | Admin edit of `max_purchase_advance` per runner (row 138): `PATCH /admin/runners/:id/purchase-limit` `{ maxPurchaseAdvance, reason }` + an audit table (actor, time, previous, new, reason); `GET` history; runners cannot change it | missing (schema: audit table) |
| RA-23 | Approval cap on an `on_hold` item line = min(item paid to Nitume, `max_purchase_advance`) (row 135) | satisfied: `approvalCeilingOf` (`runner-payouts.service.ts`) already takes min(requested, item paid, `capAmount`, `max_purchase_advance`) and `review` refuses above it (`reimbursement_exceeds_cap`). See RQ-23 for the over-limit consequence |
| RA-24 | Admin maintenance of the service-area list (row 116) | missing (no admin spec yet) |

### New questions for the owner

- **RQ-22 → BOARD row 141 (state machine, rows 113/114)**: when one offer lapses unaccepted, does the task go straight to EXPIRED (literal reading of row 113, specced), or may ops re-offer it and EXPIRED only follows an overall deadline? Default: literal (EXPIRED on the first lapse).
- **RQ-23 → row 142 (payments, row 135)**: with the approval cap at min(item paid, `max_purchase_advance`), a runner who bought a KES 5,000 item with a KES 3,000 limit can be reimbursed at most KES 3,000. Is that intended, or may ops approve up to the item paid after an explicit, audited decision (for example by raising the runner's limit first, row 138)? Default: the cap applies; ops raise the limit (audited) when they accept the purchase.
- **RQ-24 → row 143 (minor, copy)**: is there a payout time promise to show on `v-payout`? Default: none.
- **RQ-25 → row 144 (security/compliance, row 125)**: retention period for ID and selfie images after an account closes. No default.
- **RQ-26 → row 145 (schema, row 136; override built as `task_exposure_overrides` on `dbc3a76`)**: the combined exposure cap needs a stored ops override (who, when, amount, reason). Approve an override record (or columns on the refund review and the ledger line)? Default: a small append-only override table keyed by errand.

### System Design: changes (applied 2026-10-13; text depending on rows 140–146 marked pending)

In addition to §8:
- §3.3 notes: "Offers (row 113): the admin's assign puts the task in RUNNER_ASSIGNED with an offer to one runner. The runner's accept is the RUNNER_ASSIGNED → RUNNER_EN_ROUTE transition; a decline keeps RUNNER_ASSIGNED for reassignment (no new state); an offer not accepted in its window (10 min admin, 90 s auto, row 114) moves the task to EXPIRED (RQ-22 pending on re-offers). No FAILED from ARRIVED or IN_PROGRESS (row 132)."
- §3.4: "Admin offers: 10 minutes (row 114)."
- §2.2 `runner_profiles`: "`skills` = category values (row 115); `service_areas` from an ops-configured list (row 116); `max_purchase_advance` default 3000, admin-set with an audit table (row 138)." New tables: payout requests (row 117), purchase-limit audit (row 138), combined-cap override (RQ-26).
- §4.2: "Location: 30 s while online without a job, 4–8 s during a job, nothing offline (row 123). Runner room scoped server-side (row 139)."
- §6: "Runner payout requests (row 117) … destination = sign-in phone (row 118). Combined exposure cap on CANCELLED/FAILED (row 136). Approval cap min(item paid, limit) (row 135). Receipt window 24 h (row 129)."
- §10: "ID/selfie storage per row 125; verification per row 126."
