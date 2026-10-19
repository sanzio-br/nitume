# Runner app — gap report (pre-build baseline)

- Date: 2026-10-13 · Auditor: design-auditor · Branch: `docs/owner-answers-6-runner-specs` (from `main` @ `95e9d6c`)
- Mockup: `docs/design/nitume_runner_app.html` · Specs: `docs/specs/runner/` (`_shared.md` + 20 screen specs)
- Checked: `packages/nitume_core/lib/src/**`, `apps/api/src/**` on `main` (read-only). `feat/api-owner-answers-6` had no commits yet when checked; the payout-ledger endpoints below are named from what the screens need.
- **Updated 2026-10-13 (round-6 API alignment)**: RA-1, RA-3, RA-12, RA-14, RA-15, RA-16 re-checked against the final `feat/api-owner-answers-6` @ `10b6019` (read-only); see §4 and the new §8. **Scaffold audit**: `feat/runner-scaffold` @ `4294245`, see §7.

## 1. Verdict

**Partly built (updated 2026-10-13).** `apps/runner_app` is scaffolded on `feat/runner-scaffold`: shell, v-auth-phone, v-auth-otp and x-name-capture audited PASS (§7). Every other view is `missing`. All RQ-1 … RQ-21 are decided (rows 113–133, §9); blockers below are API (RA-n) and shared widgets (R-n). Rows 140–144 and 146 were answered 2026-10-16 (§10), rows 150–156 in §11, rows 145, 147–149, 157–166 in §12 (round 9), rows 167–176 in §13 (round 10: matching exhausted) and rows 177–184 in §13.1 (round 10 fix). Rows 185–200 were answered 2026-10-16 (§14: deadline path, purchase limit, admin expire). Open: BOARD row 201 (paid PAYMENT_CONFIRMED task past its deadline) and AQ-22 … AQ-27 (§14).

| View | Spec | Status | Blocked by |
|---|---|---|---|
| v-auth-phone | `docs/specs/runner/v-auth-phone.md` | built, audited PASS (§7) | R-17 (stand-in) |
| v-auth-otp | `docs/specs/runner/v-auth-otp.md` | built, audited PASS (§7) | RA-9 (recommended), RQ-15; onboarding routing waits on R-19 + onboarding screens |
| x-name-capture (not drawn) | `docs/specs/runner/x-name-capture.md` | built, audited PASS (§7) | none |
| v-onboard-id | `docs/specs/runner/v-onboard-id.md` | missing | RA-7 (upload built on `main`; retention clock per row 161 and a 413 code missing); R-13, R-15 |
| v-onboard-selfie | `docs/specs/runner/v-onboard-selfie.md` | missing | RA-7, RA-8 |
| v-onboard-pending | `docs/specs/runner/v-onboard-pending.md` | missing | RA-8 (phone and payment-identity records); R-05 |
| v-jobs | `docs/specs/runner/v-jobs.md` | missing | RA-1 (offer model), RA-2, RA-3 (accept refusal), RA-5, RA-8; R-02, R-04, R-14 (offer lapse: auto-offer → next eligible runner, row 150; decline keeps RUNNER_ASSIGNED, row 155; admin-offer lapse keeps RUNNER_ASSIGNED, row 157; `offerExpiresAt` null → no countdown, row 156) |
| v-job-detail | `docs/specs/runner/v-job-detail.md` | missing | RA-1, RA-2, RA-3; R-05, R-16 |
| v-active | `docs/specs/runner/v-active.md` | missing | RA-2, RA-4, RA-5, RA-11, RA-12, RA-17; R-01, R-06, R-07, R-09, R-16, R-20, R-21 |
| v-evidence-capture | `docs/specs/runner/v-evidence-capture.md` | missing | **RA-11** (upload size), RA-12 (24 h window); R-13, R-15, R-22 |
| v-price-request | `docs/specs/runner/v-price-request.md` | missing | RA-2 (item amount), RA-5 (decision event) |
| v-job-summary | `docs/specs/runner/v-job-summary.md` | missing | RA-2, RA-12 (RA-14/RA-16 satisfied; claim and combined cap built) |
| v-earnings | `docs/specs/runner/v-earnings.md` | missing | R-08, R-11, R-12, R-19 (RA-14 satisfied; RA-15 built on `main`; KES 500 minimum, row 159) |
| v-payout | `docs/specs/runner/v-payout.md` | missing | RA-15 built on `main` (`feb1dcc`); cancel status (row 166) and the KES 500 setting (row 159) missing |
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
| RA-7 | Verification document upload to restricted storage (system design §10): ID front + back, selfie; returns document keys; `POST /runners/me/verifications` accepting several keys; optional runner-safe rejection reason | `AddVerificationDto { verificationType, documentS3Key? }` (one key); no upload endpoint; evidence storage (Cloudinary/console) is not the restricted store | missing / mismatch (RQ-13; design approved row 154, see RA-7 in §9) | v-onboard-id, v-onboard-selfie, v-onboard-pending |
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
- **RQ-13 (security / third-party)**: storage for ID photos and selfies: §10 requires a restricted store separate from evidence. Decided (row 154, 2026-10-16): the existing app object-storage provider/bucket, if it supports private objects and signed URLs (no new provider unless it cannot meet the security needs); signed, short-lived, admin-authorised URLs only, every access logged; retention config-driven, initially 12 months after the runner's last relevant verification/activity event; a daily purge deletes the objects and unnecessary metadata. (The earlier Cloudinary-folder/S3 default is dropped.) Also row 144 (2026-10-16): kept only as long as needed for verification, fraud prevention, audit and legal/compliance, then securely deleted; configurable period.
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
| RA-7 | **Round 9 (§12)**: upload, logged signed view, access log and daily purge are built on `main` (`1790102400000`); still to change: retention clock per row 161, minimum metadata after purge (row 161), restricted credential and backups (row 162), 413 code (row 163). Original requirement: Verification documents to restricted private storage (rows 125, 154): the existing object-storage provider with private objects and signed URLs (no new provider unless it cannot meet this); upload endpoint returning document keys; admin access only through a logged, admin-authorised endpoint issuing short-lived signed URLs (no raw keys to admins); append-only access log (admin, verification, view/purge/upload, time, IP); retention config-driven (`RUNNER_ID_RETENTION_DAYS` or similar), initially 12 months (365 days) after the runner's last relevant verification/activity event (latest of verification decided, account closed, last open dispute or fraud flag); daily purge job deletes the objects and unnecessary metadata (null the keys, keep `purgedAt`) and logs the purge | missing |
| RA-8 | Verification gate: verified only when all required checks are approved (row 126) | missing |
| RA-10 | Skills migration to category values (row 115); `GET /runners/service-areas` from an ops-configured list, `PUT /runners/me/service-areas` accepts listed areas only (row 116) | missing |
| RA-12 | 24 h receipt upload and claim window after CANCELLED/FAILED (row 129), then refused with a code (e.g. `reimbursement_window_closed`) | missing (claim built without a window) |
| RA-15 | **Built on `main`** (`feb1dcc`); round 9 adds cancel (row 166), the KES 500 setting (row 159) and the row-165 fields on the admin view (§12). Original requirement: Payout-request record and endpoints (row 117; table `runner_payout_requests` approved, row 153): runner create/list/summary, ops list/mark-paid/reject (row 146: store `requestedAmount` and `paidAmount` separately, close `paid` when paid below the request, remainder not carried; the derived `payout` feed entry carries `payoutRequestId` and `requestedAmount`), configurable minimum, one open request, destination = sign-in phone (row 118), every step audited; names in `v-payout.md` and the admin specs | missing |
| RA-21 | **Built** (409 `task_exposure_cap_exceeded`, `exposureOverrideNote`, `taskExposure`, `exposureOverrides[]`; storage approved rows 145/160 without a `scope` column; cap on every task, row 148). Task-level combined exposure cap (row 136) on CANCELLED/FAILED: customer refund decisions and runner item reimbursements (claims and approvals) checked together; above the cap only through an explicit ops override with a reason; the refund drawer and the ledger review both show the remaining exposure | missing |
| RA-22 | Admin edit of `max_purchase_advance` per runner (row 138): `PATCH /admin/runners/:id/purchase-limit` `{ maxPurchaseAdvance, reason }` + an audit table (actor, time, previous, new, reason); `GET` history; runners cannot change it | missing (schema: audit table) |
| RA-23 | Approval cap on an `on_hold` item line = min(item paid to Nitume, `max_purchase_advance`) (row 135) | satisfied: `approvalCeilingOf` (`runner-payouts.service.ts`) already takes min(requested, item paid, `capAmount`, `max_purchase_advance`) and `review` refuses above it (`reimbursement_exceeds_cap`). Row 142 (2026-10-16) keeps this as the ordinary cap but adds an explicit, audited exception above the limit: see RA-25 |
| RA-24 | Admin maintenance of the service-area list (row 116) | missing (no admin spec yet) |
| RA-25 | Purchase-limit exception (rows 142, 151, 152): `purchaseLimitOverrideNote` on `POST /runner-payouts/:id/review`; ceiling with it = min(requested, item amount paid to Nitume, line cap without the limit). Stored as one append-only row in `task_exposure_overrides` (row 151; source/scope `purchase_limit`) with errand id, assignment id, runner profile id, line id, `limitAtTime` (= previous limit, the line's stored limit), `requestedAmount`, `approvedAmount`, `amountAbove`, `note`, `createdBy`, `createdAt`; one admin, no second approver. New column on `runner_payout_lines` storing `max_purchase_advance` when the obligation is created (row 152, option b); the ordinary ceiling uses it, never the current limit. Admin detail: `purchaseLimitAtCreation`, `currentPurchaseLimit`, `overLimitCeiling`, `purchaseLimitOverride { errandId, assignmentId, runnerProfileId, limitAtTime, requestedAmount, approvedAmount, amountAbove, note, createdBy, createdAt }` (admin N-21) | missing |
| RA-26 | Offer expiry (rows 141, 150, 155, 156, 157): at `offerExpiresAt` with no acceptance the assignment goes `expired`; accept at or after `offerExpiresAt` refused with 409 `offer_expired` even if the expiry job has not run yet. **Auto-offer** (90 s): the system then offers the next eligible runner; RUNNER_ASSIGNED → EXPIRED only when matching is exhausted (rows 150, 167); the customer deadline is a second, prior trigger (row 185, decided 2026-10-16; to build on `feat/api-runner-1`, §14). **Decline**: no deadline starts or changes; task stays RUNNER_ASSIGNED and the system keeps offering (row 155). **Admin offer** (10 min): row 157 (decided 2026-10-16): the assignment becomes `expired` and the task stays RUNNER_ASSIGNED for the admin to re-offer; the built sweep (RUNNER_ASSIGNED → EXPIRED at once) must change (§12). Offers with `offerExpiresAt = null` (pre-change) never expire (row 156). **Matching exhausted (row 167)**: EXPIRED only when the task has no open offer and no runner is left in its eligible service-area/category pool who has not declined or lapsed and is currently eligible and available (§13). Every RUNNER_ASSIGNED → EXPIRED sends the customer `errand.EXPIRED` | sweep built (on `main`) but wrong since row 157 (sends admin-offer lapses to EXPIRED); auto-offer fall-through and the exhaustion check missing (needs RA-10, RA-1); `errand.EXPIRED` notification built with the round-8 copy, owner copy (row 158) needed (§12) |

### New questions for the owner (answered 2026-10-16 except RQ-26; see §10)

- **RQ-22 → BOARD row 141 (state machine, rows 113/114)**: when one offer lapses unaccepted, does the task go straight to EXPIRED (literal reading of row 113, specced), or may ops re-offer it and EXPIRED only follows an overall deadline? Default: literal (EXPIRED on the first lapse).
- **RQ-23 → row 142 (payments, row 135)**: with the approval cap at min(item paid, `max_purchase_advance`), a runner who bought a KES 5,000 item with a KES 3,000 limit can be reimbursed at most KES 3,000. Is that intended, or may ops approve up to the item paid after an explicit, audited decision (for example by raising the runner's limit first, row 138)? Default: the cap applies; ops raise the limit (audited) when they accept the purchase.
- **RQ-24 → row 143 (minor, copy)**: is there a payout time promise to show on `v-payout`? Default: none.
- **RQ-25 → row 144 (security/compliance, row 125)**: retention period for ID and selfie images after an account closes. No default.
- **RQ-26 → row 145 (schema, row 136; override built as `task_exposure_overrides` on `dbc3a76`)**: the combined exposure cap needs a stored ops override (who, when, amount, reason). Approve an override record (or columns on the refund review and the ledger line)? Default: a small append-only override table keyed by errand.

### System Design: changes (applied 2026-10-13; the text still marks rows 140–146 pending. Rows 140–144 and 146 are answered; the System Design edits wait for row 147, listed in §10)

In addition to §8:
- §3.3 notes: "Offers (row 113): the admin's assign puts the task in RUNNER_ASSIGNED with an offer to one runner. The runner's accept is the RUNNER_ASSIGNED → RUNNER_EN_ROUTE transition; a decline keeps RUNNER_ASSIGNED for reassignment (no new state); an offer not accepted in its window (10 min admin, 90 s auto, row 114) moves the task to EXPIRED (RQ-22 pending on re-offers). No FAILED from ARRIVED or IN_PROGRESS (row 132)."
- §3.4: "Admin offers: 10 minutes (row 114)."
- §2.2 `runner_profiles`: "`skills` = category values (row 115); `service_areas` from an ops-configured list (row 116); `max_purchase_advance` default 3000, admin-set with an audit table (row 138)." New tables: payout requests (row 117), purchase-limit audit (row 138), combined-cap override (RQ-26).
- §4.2: "Location: 30 s while online without a job, 4–8 s during a job, nothing offline (row 123). Runner room scoped server-side (row 139)."
- §6: "Runner payout requests (row 117) … destination = sign-in phone (row 118). Combined exposure cap on CANCELLED/FAILED (row 136). Approval cap min(item paid, limit) (row 135). Receipt window 24 h (row 129)."
- §10: "ID/selfie storage per row 125; verification per row 126."

## 10. Owner answers rows 140–144, 146 (2026-10-16), applied on `docs/owner-answers-7-specs`

Row 85 (PayHero) and rows 145, 147, 148, 149 stay open.

### Decisions applied to the specs
- **Row 140**: a runner-favourable dispute keeps the runner fee and item reimbursement payable. `_shared.md` §8, `v-job-summary.md` (DISPUTED line reworded, no `On hold` outside line status), admin `drawer-dispute-outcome.md` (note only). Built API matches (lines created at CONFIRMED after DISPUTED → COMPLETED).
- **Row 141**: an offer unaccepted at its deadline expires; no acceptance after expiry. (Round 8 kept "the task goes EXPIRED at once" for admin offers pending row 157; round 9 removes it: row 157 keeps the task RUNNER_ASSIGNED, see §12.) `_shared.md` §6/§1, `v-jobs.md`, `v-job-detail.md`, admin `_shared.md` N-20. API: RA-26 (inside RA-1).
- **Row 142**: ordinary approval capped at min(item amount paid to Nitume, `max_purchase_advance`); above the limit only through an explicit exceptional override with reason and actor. The earlier recommendation "ops raise the runner's limit first" is withdrawn everywhere: admin `drawer-runner-payout.md` (new §5 2b exception, `Change` link dropped), `drawer-runner-purchase-limit.md` (confirm copy, no link from the payout drawer), admin `_shared.md` (N-21), runner `_shared.md` §8, `v-job-summary.md`, `v-earnings.md`. API: RA-25.
- **Row 143**: no payout-time promise; status only. `v-payout.md` (snackbar, open-request notice), `v-earnings.md`, `x-payout-history.md`, `v-notifications.md`, runner `_shared.md` §8 (banned phrasing).
- **Row 144**: ID/selfie retention limited, configurable, secure deletion, access restricted and logged. `_shared.md` §9, `v-onboard-id.md`, `v-onboard-selfie.md`. API: RA-7.
- **Row 146**: a request paid below the requested amount closes as PAID with `requestedAmount` and `paidAmount` stored separately; the remainder stays available for a new request. `v-payout.md`, `v-earnings.md`, `x-payout-history.md`, `v-notifications.md`, admin `p-payout-requests.md`, `p-runner-payouts.md`, admin `_shared.md` N-17. API: RA-15.

### Built code that now conflicts with the specs
| Area | Branch / file | Conflict | Owner of the fix |
|---|---|---|---|
| API reimbursement review | `feat/api-owner-answers-6` `apps/api/src/payments/runner-payouts.service.ts` (`approvalCeilingOf`, `review`) | No purchase-limit exception path (row 142; storage `task_exposure_overrides`, row 151); the ceiling reads the runner's **current** `max_purchase_advance` instead of the limit stored on the line at creation (row 152: new column, never recalculated) | api-contract (RA-25 / N-21) |
| Admin reimbursement review | `feat/admin-runner-payouts` `apps/admin/src/app/features/admin/drawers/runner-payout-drawer.ts` | Ordinary path matches; the row-142 exception UI is missing (`drawer-runner-payout.md` §5 2b, §7, activity) | web-parity, after api-contract |
| API offers | `feat/api-owner-answers-6` | RA-1 offer model not built; expiry per RA-26 as amended in §11 and §12 (auto-offer fall-through, decline and admin-offer lapse keep RUNNER_ASSIGNED) | api-contract |
| Payout requests | none built (API, admin, runner) | No conflict; RA-15 / N-17 must use `requestedAmount` + `paidAmount` | api-contract, then web-parity / flutter-runner |
| Runner app | `feat/runner-scaffold` | None: payout, offer and onboarding screens are not built | — |

### New questions for the owner
- **Row 141 follow-up (state machine)** → row 150, answered 2026-10-16: auto-offers fall through to the next eligible runner; EXPIRED only when none remain.
- **Row 142 follow-up (schema)** → row 151, answered 2026-10-16: `task_exposure_overrides`. (Original question: recommended: the row-136 override record (`task_exposure_overrides`) with a source/scope value `purchase_limit`, together with the `scope` column asked under row 145; alternative: its own append-only table.)
- **Row 142 follow-up (payments)** → row 152, answered 2026-10-16: no; the limit stored at obligation creation applies, never recalculated. (Original question: does a later change of the runner's limit (row 138) lift the ordinary ceiling of an item line already waiting for review? Recommended no: the ordinary ceiling uses the limit when the line was created, so paying an existing purchase above the limit always goes through the recorded exception.)

### System Design edits needed (not applied: row 147 is open)
Superseded in round 8 by the list in §11 (rows 150–156 change items 1, 2, 3, 5, 6, 8 and 9). Kept for history:
1. §3.3 notes, "Offers" bullet. Current: "**Pending (row 141)**: whether the first lapsed offer expires the task at once (recommended, as row 113 reads) or only after re-offers to other runners." Proposed: "**Decided (owner, 2026-10-16, row 141)**: "at the acceptance deadline with no acceptance the offer expires and the task goes EXPIRED at once; no runner acceptance after expiry." No re-offer step comes before EXPIRED; an accept after `expiresAt` is refused (`offer_expired`)."
2. §3.4 v1. Current: "(or auto-offered to the top Runner with a 90-second accept window, falling through to the next)". Proposed (if the owner confirms row 141 covers auto-offers): "(or auto-offered to the top Runner with a 90-second accept window; an unaccepted offer expires and the task goes EXPIRED, row 141)". Otherwise unchanged, and §3.3 must say row 141 applies to admin offers only.
3. §6 changelog line "> Updated 2026-10-13 (second pass) … rows 140–146 pending." Proposed: replace "rows 140–146 pending" with "rows 140–144 and 146 answered 2026-10-16 (offer expiry, runner-favourable disputes, purchase-limit exception, no payout-time promise, ID retention, payout requests paid below the amount); row 145 pending".
4. §6 Runner reimbursement item 2 ("Accepted" = CONFIRMED). Append: "Row 140 (owner, 2026-10-16): "a runner-favour dispute keeps the runner eligible for the applicable payout/reimbursement; the dispute outcome does not cancel an otherwise valid runner payout." The row-104 words "and no dispute" therefore mean no dispute still open or decided against the runner."
5. §6 item 4. Current: "Ops may make it payable, at most at min(item amount paid to Nitume, the runner's `max_purchase_advance`) (row 135; for an accepted over-limit purchase, row 142 pending)." Proposed: "Ops may make it payable, at most at min(item amount paid to Nitume, the runner's `max_purchase_advance`) (rows 135, 142). Paying above `max_purchase_advance` needs an explicit exceptional override that records the reason and the actor, auditable (owner, 2026-10-16, row 142: "ordinary approval is capped at min(verified item amount paid to Nitume, runner max_purchase_advance) and must not silently override the runner's limit"); it never goes above the item amount paid to Nitume (row 105). Changing the runner's limit is not the way to do this."
6. §6 item 5a. Current: "**Pending**: approval of that override storage (row 145) and whether ops may pay an accepted over-limit purchase above the cap only by raising the runner's limit first (row 142). Row 140 (pending): whether a runner-favourable dispute still pays the runner at CONFIRMED (built: yes)." Proposed: "**Pending**: approval of that override storage (row 145). Decided 2026-10-16: payment above `max_purchase_advance` only through the explicit, audited exception in item 4 (row 142), not by raising the runner's limit; a runner-favourable dispute keeps the runner's payout (row 140, as built)."
7. §6 "Payouts to Runners". Current: "**Pending (row 146)**: paying a request with whole ledger lines whose total is below the requested amount." Proposed: "**Paid below the request (decided, owner 2026-10-16, row 146)**: a request paid below the requested amount closes as PAID; the requested and actual paid amounts are stored separately (e.g. requested KES 5,000, paid KES 4,000, PAID); the remainder is not carried in that request and stays in the available amount for a new request. **No payout time (row 143)**: no UI promises a payout time or SLA; screens show payout status only."
8. §2.2 `runner_profiles` bullet. Current: "Approved new records, shape for api-contract to propose: **runner payout requests** (row 117: …) and the **purchase-limit audit** (row 138)." Proposed: add "; the payout request stores the requested and the paid amount separately (row 146); the per-reimbursement **purchase-limit exception** (row 142: reason, actor, time, limit at the time, amount) is a required audit record, storage pending owner approval".
9. §10 PII handling. Current: "**Pending (row 144)**: retention period." Proposed: "**Retention (decided, owner 2026-10-16, row 144)**: ID and selfie images are kept only as long as needed for verification, fraud prevention, audit and legal/compliance, then securely deleted; never indefinitely. The retention period is configurable (final legal period not yet set); access stays restricted and logged for the whole period."

## 11. Owner answers rows 150–156 (2026-10-16), applied on `docs/owner-answers-8-specs`

At the time: row 157 (admin-offer lapse) open; rows 85, 145, 147, 148, 149 open. All but row 85 answered since (§12).

### Decisions applied to the specs
- **Row 150**: an auto-offer expires at its 90 s window end, then the system offers the next eligible runner; the task goes EXPIRED only when no eligible runner remains. Admin offers keep 10 minutes. `_shared.md` §0/§6 ("Offer outcomes"), `v-jobs.md`, `v-job-detail.md`; admin `_shared.md` N-20. The round-7 "EXPIRED at once for every offer / no re-offer step" is removed everywhere.
- **Row 155**: a decline starts or changes no deadline; the task stays RUNNER_ASSIGNED while eligible runners remain; EXPIRED only when none remain or the applicable task deadline is reached. Same files.
- **Row 157 (open at the time)**: admin-offer lapse specced as built (EXPIRED at once). Superseded in round 9 (§12): the task stays RUNNER_ASSIGNED.
- **Row 156**: `offerExpiresAt = null` (pre-change offers) → no countdown and no client-side removal. `v-jobs.md`, `v-job-detail.md`, `_shared.md` §6. The API name `offerExpiresAt` now replaces `expiresAt` in every runner spec (`v-jobs`, `v-job-detail`, `v-notifications`, `_shared`).
- **Row 151**: the purchase-limit exception is one append-only row in `task_exposure_overrides` (task/assignment, runner, previous limit, requested and approved amount, reason, approving admin, time); no second approver. `_shared.md` §8, `v-job-summary.md`; admin N-21, `drawer-runner-payout.md`. RA-25.
- **Row 152**: the line stores `max_purchase_advance` at obligation creation; never recalculated. `_shared.md` §8, `v-job-summary.md`, `v-earnings.md`; admin `drawer-runner-payout.md` (Amounts show the line's stored limit, plus the current limit when different), `drawer-runner-purchase-limit.md` (confirm copy `It applies to new offers and to reimbursements created from now on.`). RA-25.
- **Row 153**: payout request table approved; "pending" wording removed (`v-payout.md`, `v-earnings.md`, admin `p-payout-requests.md`, N-17). RA-15.
- **Row 154**: storage design approved; retention config-driven, initially 12 months after the last relevant verification/activity event; daily purge of objects and unnecessary metadata; signed, admin-authorised, logged access. `_shared.md` §9, `v-onboard-id.md`, `v-onboard-selfie.md`, RA-7, RQ-13. **Copy choice**: the new privacy lines state no period (`We keep them only as long as needed, then delete them.`) because the period is configuration.
- **EXPIRED customer notification** and **OTP 5-minute copy**: customer specs (`docs/audits/customer-gap-report.md` round-8 addendum).

### API items for api-contract (round 8)
1. RA-26 as amended (§9 table): auto-offer fall-through to the next eligible runner; decline keeps RUNNER_ASSIGNED with no deadline change; EXPIRED only when no eligible runner remains or the task deadline is reached; admin-offer lapse: superseded by row 157 (§12); `offerExpiresAt` null never expires.
2. RA-25 as amended: `task_exposure_overrides` row for the exception with the row-151 fields; `runner_payout_lines` column for the limit at creation (row 152), used by `approvalCeilingOf` instead of `runnerProfile.maxPurchaseAdvance`; detail fields `purchaseLimitAtCreation`, `currentPurchaseLimit`, `overLimitCeiling`, `purchaseLimitOverride { errandId, assignmentId, runnerProfileId, limitAtTime, requestedAmount, approvedAmount, amountAbove, note, createdBy, createdAt }`; the `reimbursement_exceeds_cap` extra `maxPurchaseAdvance` = the line's stored limit.
3. RA-15: build `runner_payout_requests` as approved (row 153).
4. RA-7 as amended (row 154).
5. `errand.EXPIRED` customer notification (customer `v-notifications.md`).
6. OTP copy: email and SMS state 5 minutes.

### Built code that now conflicts with the specs
| Area | Branch / file | Conflict | Owner of the fix |
|---|---|---|---|
| API offer expiry | `feat/api-owner-answers-7` (expiry job) | Expires every open offer and sends the task to EXPIRED at once. Wrong for admin offers since row 157 and for auto-offers (row 150); see §12 | api-contract (§12) |
| API reimbursement review | `feat/api-owner-answers-6` `runner-payouts.service.ts` (`approvalCeilingOf`) | Reads the runner's current `max_purchase_advance`, not the line's stored limit (row 152); no exception record (row 151) | api-contract |
| Admin reimbursement drawer | `feat/admin-runner-payouts` `runner-payout-drawer.ts:213-218` | `Runner's purchase limit` shows the current limit; spec now shows the line's stored limit (plus current when different) | web-parity, after api-contract |
| API notifications | `main` `notifications.service.ts` (`statusCopy`), `common/enums.ts` | No `errand.EXPIRED` | api-contract |
| API OTP copy | `main` `infra/mail/mail.service.ts:23`, `auth/otp-sender/africas-talking-otp-sender.ts:33` | Say 10 minutes; TTL is 300 s | api-contract |
| Customer app | `apps/customer_app` task detail / track | No `Start a new task` action for EXPIRED; Track card copy `No runner was available in time.` | flutter-customer (minor) |
| Runner app | `feat/runner-scaffold` | None: offer and onboarding screens not built | — |

### System Design edits needed (applied in round 9, §12, updated for rows 157–166). Replaces the §10 list.
1. §3.3 notes, "Offers" bullet. Current: "… No acceptance before the offer expires → EXPIRED. … **Pending (row 141)**: whether the first lapsed offer expires the task at once (recommended, as row 113 reads) or only after re-offers to other runners." Proposed: replace the Pending sentence with: "**Offer lapse (owner 2026-10-16, rows 141, 150, 155, 156)**: no runner acceptance after the offer's deadline (`offer_expired`). An auto-offer that lapses expires and the system offers the next eligible runner; a decline starts or changes no deadline and the task stays RUNNER_ASSIGNED while eligible runners remain; RUNNER_ASSIGNED → EXPIRED (S) fires only when no eligible runner remains or the applicable task deadline is reached. [Round 9: replaced by row 157, the task stays RUNNER_ASSIGNED.] Offers made before this change without a deadline stay as they are (row 156)."
2. §3.4 v1: **no change** to "(or auto-offered to the top Runner with a 90-second accept window, falling through to the next)" — row 150 confirms the fall-through. Optional append: "; the task expires only when no eligible runner remains (row 150)".
3. §6 changelog line. Replace "rows 140–146 pending" with "rows 140–144, 146 and 150–156 answered 2026-10-16 (offer expiry and fall-through, runner-favourable disputes, purchase-limit exception stored in `task_exposure_overrides` with the limit stored per line, no payout-time promise, ID storage and retention, payout requests); rows 145 and 157 pending" [round 9: all answered].
4. As §10 item 4 (row 140), unchanged.
5. §6 item 4. Proposed: "Ops may make it payable, at most at min(item amount paid to Nitume, the `max_purchase_advance` stored on the line when the obligation was created) (rows 135, 142, 152; never recalculated with a later limit). Paying above that limit needs an explicit exceptional override recorded in `task_exposure_overrides` with task/assignment, runner, previous limit, requested and approved amount, reason, approving admin and time; one admin, no second approver (rows 142, 151); never above the item amount paid to Nitume (row 105). Changing the runner's limit is not the way to do this and does not change existing lines."
6. §6 item 5a. Proposed: "**Pending**: approval of the row-136 override storage (row 145). Decided 2026-10-16: payment above the limit only through the audited exception in item 4 (rows 142, 151); a runner-favourable dispute keeps the runner's payout (row 140, as built)."
7. As §10 item 7, plus: "Table `runner_payout_requests` approved (row 153)."
8. §2.2 `runner_profiles` bullet. Add: "; `runner_payout_requests` approved (row 153: `requested_amount`, `paid_amount` separate); `runner_payout_lines` gains the `max_purchase_advance` at creation (row 152); the purchase-limit exception is a row in `task_exposure_overrides` (row 151)".
9. §10 PII handling. Proposed: "**Storage and retention (decided, owner 2026-10-16, rows 144, 154)**: private objects on the existing object-storage provider (no new provider unless it cannot support private objects and signed URLs); access only through short-lived signed URLs from a logged, admin-authorised endpoint; retention config-driven, initially 12 months after the runner's last relevant verification/activity event; a daily purge deletes the objects and unnecessary metadata; uploads, views and purges logged. Never kept indefinitely." (Also "restricted S3 bucket" → "restricted private storage".)
10. New, §4 / notifications: "Customer notification `errand.EXPIRED` on every RUNNER_ASSIGNED → EXPIRED: no runner accepted in time, next action (start a new task); a paid task mentions the refund review, never a guaranteed refund (row 102)."
11. New, §10 Auth: "OTP codes valid 5 minutes (300 s); OTP messages say `Your verification code expires in 5 minutes.`"

## 12. Owner answers rows 145, 147–149, 157–166 (2026-10-16), applied on `docs/owner-answers-9-specs`

Spec-only update from `main` @ `8b723d1`. API state read on `main` (read-only); `feat/api-owner-answers-9` had no commits when checked. Row 85 (PayHero) stays open.

### System Design (row 147 approved: design-auditor may edit it for owner answers)
Applied to `docs/design/Nitume_System_Design.md` in `417ec46`. The 11 edits of §11, updated for rows 157–166:
1. §3.3 "Offers": the row-141 Pending sentence replaced by a new **Offer lapse** bullet (rows 141, 150, 155, 156, 157): a lapse never moves the task; auto-offer → next eligible runner; admin offer → task stays RUNNER_ASSIGNED for re-offer; decline → no deadline change; RUNNER_ASSIGNED → EXPIRED only when no further runner can be assigned or the task deadline is reached. The trigger for "no further runner can be assigned" is marked **open** (api-contract proposal); no state or transition added. The transition-table EXPIRED row says the same.
2. §3.4 v1: fall-through kept, plus "the task expires only when no eligible runner remains (row 150)" and the admin-offer lapse (row 157).
3. §6 changelog: "rows 140–146 pending" replaced; new "Updated 2026-10-16" line listing rows 140–166.
4. §6 item 2: row 140 quote appended.
5. §6 item 4: stored limit (row 152) and the audited exception in `task_exposure_overrides` (rows 142, 151).
6. §6 item 5a: Pending sentence replaced: override storage approved (rows 145, 160, no `scope`), cap on every task (row 148), rows 140/142 decided.
7. §6 "Payouts to Runners": rows 146, 153 (paid below the request), 159 (KES 500, server config, no admin UI), 165/166 (lifecycle, ops-only cancel, audit columns), 143 (no payout time).
8. §2.2: `runner_profiles` bullet updated; new bullets `task_exposure_overrides` (rows 145, 160) and `runner_payout_requests` (rows 153, 165, 166; PENDING = `requested`).
9. §10 PII: "restricted S3 bucket" → "restricted private storage"; storage and isolation (rows 154, 162), upload limit (163), retention clock (161), purge and minimum metadata (154, 161), owner privacy statement (158).
10. §4.4: `errand.EXPIRED` customer notification with the owner body (row 158), admin feed item for an offer lapse, runner payout-request notifications; an offer lapse alone sends the customer nothing.
11. §10 Auth: 5-minute TTL; OTP SMS owner wording (row 158); OTP email wording.
Also §7.2: `path_provider` for offline photos (row 149) and a pointer to the 10 MB ID/selfie limit (row 163, stated in §10). Correction (FAIL 1 fix): the §7.2 edit was missing from `417ec46` and was added in the round-9 fix commit.

### Decisions applied to the specs
| Row | Decision | Specs |
|---|---|---|
| 145, 160 | Override table `task_exposure_overrides` approved with its extra audit columns; no `scope` column | admin `_shared.md`, `drawer-runner-payout.md`, `drawer-refund.md` (the "store scope" need withdrawn); runner `_shared.md` §0 |
| 147 | design-auditor may edit the System Design for owner answers | System Design (above) |
| 148 | Combined cap on every task (as built) | runner `_shared.md` §0/§8; admin `_shared.md`, drawers |
| 149 | `path_provider` approved (offline photos) | runner `_shared.md` §0; System Design §7.2 |
| 157 | Admin-offer lapse: offer expires, task stays RUNNER_ASSIGNED, admin re-offers; EXPIRED only when no further runner can be assigned (trigger open) | runner `_shared.md` §0/§6, `v-jobs.md`, `v-job-detail.md`; admin `_shared.md` N-20, **new** `drawer-task-offer.md`; customer `_shared.md`, `v-notifications.md` |
| 158 | Owner copy word for word: OTP SMS; ID/selfie privacy statement; customer EXPIRED body (no refund sentence) | runner and customer `v-auth-otp.md`; runner `_shared.md` §9, `v-onboard-id.md`, `v-onboard-selfie.md`, `v-onboard-pending.md`; customer `v-notifications.md`, `v-track.md`, `v-task-detail.md` |
| 159 | Payout request minimum KES 500, server config, no admin UI | runner `v-payout.md`, `v-earnings.md`, `_shared.md` §8; admin `p-payout-requests.md` (settings dropped) |
| 161 | Retention clock events; views never count; minimum metadata after purge | runner `_shared.md` §9, onboarding specs; admin **new** `p-runners-verification-documents.md`, N-23 |
| 162 | ID media isolated, restricted credential, backups must not defeat the purge | RA-7, N-23 (backend rule) |
| 163 | 10 MB per ID/selfie image, client check too | `v-onboard-id.md`, `v-onboard-selfie.md` (error copy) |
| 165 | `createdByUserId`, `updatedAt` on payout requests | `v-payout.md`; admin `p-payout-requests.md` (Activity actor, `Last change`) |
| 166 | Ops-only cancel with mandatory reason; PENDING (= `requested`) → PAID \| REJECTED \| CANCELLED, all final | admin `p-payout-requests.md` (cancel action, dialog, read-only, activity); runner `v-payout.md`, `v-earnings.md`, `x-payout-history.md`, `v-notifications.md` (`payout_request.cancelled`) |

**Copy choices (flagged for the owner)**
- Runner capture screens carry a shortened privacy line, derived from the row-158 sentence: `Your ID and selfie are stored privately and only authorised Nitume personnel can see them.` + link `Privacy Policy`. The full owner sentence is on `v-onboard-pending` (also Profile → `Verification documents`) with the same link. The round-8 lines are withdrawn.
- (RQ-29, BOARD row 174, open; build default) Customer Track and Task detail keep the built EXPIRED line `No runner accepted your task in time.` and the action `Start a new task` (same meaning as the owner's notification; `Start a new task` is the app's wizard wording, "submit a new request" is notification prose). No rebuild. Alternative if the owner wants the screens to echo the notification: `No runner was available to accept your task in time.`
- Runner sees a cancelled payout request without the ops reason (fixed line + notification `Payout request cancelled`).

### API items for api-contract (`feat/api-owner-answers-9`), with mismatches against the owner wording
1. **Row 157** (`errands.service.ts` `expireLapsedOffers`, `matching.controller.ts:48-56` comment, `scheduler/maintenance.processor.ts:62`): at `offerExpiresAt` set the assignment `expired` and **leave the task RUNNER_ASSIGNED**; no `errand.EXPIRED`, no refund review, no customer notification on a lapse. The errand views must expose the latest assignment whatever its status (or a `lastAssignment`): today `GET /errands/:id` and `GET /errands` fill `assignment` only from `ACTIVE_ASSIGNMENT_STATUSES` (`errands.service.ts:89`, `:603`), so after a decline or a lapse it is null and the admin cannot see `Offer ended` / `Declined`. Also add an admin feed item (`assignment_expired`, title `Offer ended`), `declineReason` and `decidedAt` on the assignment view, and earlier assignments on the admin detail (`drawer-task-offer.md` Data). The re-offer path exists (`assign` reassigns a RUNNER_ASSIGNED task with no open assignment). **Do not build an EXPIRED trigger**: propose one to the owner ("no further runner can be assigned").
2. **Row 158 OTP SMS** (`auth/otp-sender/africas-talking-otp-sender.ts:23`): built `Nitume verification code: {code}. Your verification code expires in 5 minutes. Do not share it.` → owner `Your Nitume verification code is {{code}}. It expires in 5 minutes. Do not share this code with anyone.` (keep the minutes from the TTL helper). Email unchanged.
3. **Row 158 EXPIRED body** (`notifications/notifications.service.ts:507-514`): built bodies (with and without `We're reviewing a refund…`, `You can start a new task whenever you're ready.`) → one body for every expired task: `Your task has expired because no runner was available to accept it within the required time. You can submit a new request if you still need this service.` No refund sentence (an opened review is not a decided refund). Title `No runner available` not set by the owner; kept.
4. **Row 159** (`config/configuration.ts:264`, `RUNNER_PAYOUT_REQUEST_MINIMUM_KES`, default 0): minimum KES 500 from server config, recommended name `MIN_RUNNER_PAYOUT_REQUEST`; not hard-coded; `.env.example` and docs updated; no admin endpoint.
5. **Row 161** (`runners/runners.service.ts` `purgeExpiredDocuments`): clock = latest of a new/replacement ID or selfie upload, a verification/re-verification started, an admin verification review that needs the evidence; remove task assignments/offers and disputes from the clock; views never count. After purge keep only status, outcome, timestamps, reviewer id, `purgedAt`, type, audit ids. `reviewerNote`: **keep it until BOARD row 170 (AQ-15) is answered** (a purge cannot be undone). Two built rules the owner did not mention, to confirm with the owner rather than drop silently: "never purged while pending" and "never purged while the runner has an open dispute".
6. **Row 162**: ID media under a separate restricted credential/API key with minimum permissions, logically isolated from task evidence; verify the provider's backup/versioning for the ID folder so no purged image survives.
7. **Row 163** (`runners.controller.ts:37`, `configuration.ts:258`): 10 MB limit built; add an error code on 413 (e.g. `verification_document_too_large` with `maxBytes`) so the app can word it; optional `side: front | back` on the upload.
8. **Row 165**: `createdByUserId` immutability looks enforced by the guard trigger in `1790102300000` (lines 43, 112, 219); please confirm. Expose `createdBy` and `updatedAt` on the admin view.
9. **Row 166**: `cancelled` enum value (migration), columns `cancelledByUserId`, `cancelledAt`, `cancellationReason` (owner names; the orchestrator brief said `cancelledBy`, the owner wrote `cancelledByUserId`), `POST /runner-payout-requests/:id/cancel` `{ reason }` (ops only, mandatory), guard trigger treats `cancelled` as final, list `status` filter and `count` accept it, runner view `status: 'cancelled'` + `cancelledAt` without the reason (AQ-13 pending), runner notification `payout_request.cancelled` (copy in runner `v-notifications.md`), 409 `payout_request_not_open` on closed requests. `requestedAmount` unchanged.
10. **Row 160**: the owner's "updated timestamp" on the append-only `task_exposure_overrides` (confirm with the owner whether a column equal to `createdAt` is wanted).

### Built code that now conflicts with the specs
| Area | Branch / file | Conflict | Owner of the fix |
|---|---|---|---|
| API offer expiry | `main` `errands.service.ts` `expireLapsedOffers` | Admin-offer lapse → EXPIRED at once (row 157 keeps RUNNER_ASSIGNED) | api-contract |
| API EXPIRED notification | `main` `notifications.service.ts:507-514` | Round-8 copy with a refund sentence (row 158) | api-contract |
| API OTP SMS | `main` `africas-talking-otp-sender.ts:23` | Not the owner wording (row 158) | api-contract |
| API payout minimum | `main` `configuration.ts:264` | Default 0, not KES 500 (row 159) | api-contract |
| API ID retention | `main` `runners.service.ts` `purgeExpiredDocuments` | Clock counts assignments/offers and disputes (row 161); `reviewerNote` kept until row 170 is answered | api-contract |
| API payout requests | `main` `runner-payout-request.entity.ts` | No `cancelled` status or cancel route (row 166) | api-contract |
| Admin task drawer / queue | `main` `task-drawer.ts:22-23, 305`, `task-queue.panel.ts:136-137` | No offer/lapse state, no re-offer of a RUNNER_ASSIGNED task (`drawer-task-offer.md`) | web-parity, after api-contract |
| Admin verifications | `main` `verifications.panel.ts:61-75, 194-206`, `core/api-types.ts:646-660` | Reads `documentKey`/`submittedAt` the API never sends; no logged view, no purged state (`p-runners-verification-documents.md`) | web-parity |
| Customer app | `apps/customer_app` Track / Task detail | None (copy kept, flagged) | — |
| Runner app | `main` `apps/runner_app` | None: onboarding and payout screens not built | — |

### New questions for the owner
BOARD rows 167–176 now carry AQ-12 … AQ-16 and RQ-27 … RQ-31. **All answered 2026-10-16, applied in §13.**
- AQ-12 (row 157 follow-up): what makes a RUNNER_ASSIGNED task EXPIRED after an admin-offer lapse or a decline? Wait for api-contract's proposal.
- AQ-13 (row 166): is the ops cancellation reason shown to the runner? Proposed no.
- AQ-14 (row 166): length rule for the reason. Proposed 10–500.
- AQ-15 (row 161, BOARD row 170): is the reviewer's note part of the "outcome" kept after the purge? No default applied: kept until answered.
- AQ-16 (row 161 (d)): how a later review that needs the evidence is recorded. Proposed: the decision on a pending verification counts; a later review needs an explicit, logged action with a reason.
- RQ-27 (row 158): approve the shortened privacy line on the capture screens.
- RQ-28 (row 158): the Privacy Policy URL (`NITUME_PRIVACY_URL`; customer `x-legal.md` Q1) does not exist; until set the link is hidden.
- RQ-29 (row 158): keep `No runner accepted your task in time.` + `Start a new task` on Track / Task detail (chosen), or echo the notification wording?
- RQ-30 (row 161, from the build): keep "never purged while pending" and "never purged while an open dispute exists"?
- RQ-31 (row 157, customer label): during RUNNER_ASSIGNED the customer sees `Runner assigned` even while the offer is open, declined or lapsed. Change the label (e.g. `Finding a runner`) until a runner accepts? No recommendation.

## 13. Owner answers rows 167–176 (2026-10-16), applied on `docs/owner-answers-10-specs`

Spec-only update; no screen was re-audited. System Design edited under row 147 (§3.3, §3.4, §4.4, §6, §10 and the changelog).

### Decisions applied
| Row (label) | Decision | Files |
|---|---|---|
| 167 (AQ-12) | RUNNER_ASSIGNED → EXPIRED only when matching is exhausted: every eligible runner in the configured service-area/category pool has declined, let the offer lapse, or become ineligible/unavailable before accepting. A decline or lapse never expires the task. ~~No task deadline: row 155's path removed~~ **Withdrawn in §13.1**: errands carry `deadline_at`; whether it triggers EXPIRED was open (BOARD row 185; answered in round 11, §14: yes, the deadline first) | System Design §3.3 table and "Offer lapse" (new "Matching exhausted" bullet replaces the Open bullet), §3.4; runner `_shared.md` §0/§6, `v-jobs.md`, `v-job-detail.md`; admin `_shared.md` N-20, `drawer-task-offer.md` (Matching exhausted state, `Eligible runners left`); customer `_shared.md` §6, `v-notifications.md` |
| 168 (AQ-13) | Runner never sees the ops cancellation reason; generic `Payout request cancelled` | runner `v-payout.md`, `x-payout-history.md`, `v-notifications.md`; admin `p-payout-requests.md`, N-17; System Design §6 |
| 169 (AQ-14) | Reason 10–500 characters, mandatory, whitespace-only invalid | admin `p-payout-requests.md`, N-17; System Design §6 |
| 170 (AQ-15) | Reviewer note deleted at purge | admin `p-runners-verification-documents.md`, N-23; runner `_shared.md` §9; System Design §10 |
| 171 (AQ-16) | Audited `Re-review evidence` on a decided verification restarts the clock; viewing never does | admin `p-runners-verification-documents.md` (button, confirm, `Reviews` activity, errors), N-23 (e); System Design §10 |
| 172 (RQ-27) | Short privacy line + Privacy Policy link approved on the capture screens | runner `_shared.md` §9, `v-onboard-id.md`, `v-onboard-selfie.md`, `v-onboard-pending.md`; System Design §10 |
| 173 (RQ-28) | Link hidden until `NITUME_PRIVACY_URL` holds the real URL; no placeholder | same, plus customer `x-legal.md` Q1 note |
| 174 (RQ-29) | Customer EXPIRED copy stays as built | customer `v-track.md`, `v-task-detail.md`, `_shared.md` |
| 175 (RQ-30) | Both purge guards stay (pending verification, open dispute) | admin N-23, `p-runners-verification-documents.md`; runner `_shared.md` §9; System Design §10 |
| 176 (RQ-31) | Customer label during RUNNER_ASSIGNED is `Finding a runner`; `Runner assigned` only once accepted (RUNNER_EN_ROUTE) | customer `_shared.md` §6 and new §6.1, `v-track.md`, `v-task-detail.md`, `v-home.md`, `v-notifications.md`; System Design §4.4. Runner (`New offer`) and admin (`Assigned`) labels unchanged |

### Matching exhausted: what the specs now define (row 167)
- Pool: decided by row 177 (§13.1).
- Exhausted = no open offer and no pool runner left who is not excluded (row 178). Check points: proposed only, after every decline and every lapse, not on a read (§13.1).
- Admin sees `Eligible runners left {n}` on Offer ended / Declined, and a read-only **Matching exhausted** state on the EXPIRED task (`No runners left` chip, last offer, `Expired at`, `Runners tried`, refund-review link for a paid task); admin feed item `matching_exhausted`.
- Runner screens: no change (a runner never learns what happened after their offer ended).

### API items for api-contract (`feat/api-owner-answers-9`)
1. **Row 167**: pool computation and exhaustion check (above); proposed `GET /errands/:id/candidates` → `{ items: [{ runnerProfileId, displayName, rating, tasksCompleted, distanceKm, score, tried }], eligibleRemaining, triedCount }`; 409 `matching_exhausted` and `runner_not_eligible` on `POST /errands/:id/assign`; admin feed item `matching_exhausted`; the expiry sweep (`expireLapsedOffers`) runs the check (the sweep already leaves the task RUNNER_ASSIGNED on `feat/api-owner-answers-9`); build **neither** deadline path until row 185 is answered. Depends on RA-10 and RA-1. Until the pool is computable in full: no automatic expiry (row 179). Superseded in detail by §13.1.
2. **Row 168/169**: cancel route validates 10–500 characters after trim, whitespace-only rejected (400 `cancellation_reason_invalid`); reason absent from every runner view and the `payout_request.cancelled` notification.
3. **Row 170**: purge clears `reviewerNote` (and re-review notes).
4. **Row 171**: proposed `POST /runners/verifications/:id/re-review` `{ note? ≤ 500 }` (admin only; decided verification with a stored image) → 201 `{ verificationId, reReview { id, reviewedBy { id, displayName }, createdAt, note } }`; writes the audit/review event and restarts the clock in one transaction; 409 `verification_not_decided`, 410 `verification_document_purged`, 404 `verification_document_missing`; `reReviews[]` on list/detail. The built decision route is `PATCH /runners/:runnerId/verifications/:verificationId`; if api-contract prefers the runner-scoped path for consistency, the admin spec follows (flagged).
5. **Row 175**: keep both guards in `purgeExpiredDocuments`.
6. **Row 176** (proposed, CQ-176c): `notifications.service.ts` `statusCopy`: send nothing on RUNNER_ASSIGNED (today `Runner assigned` / `A runner has been assigned to your task.`); RUNNER_EN_ROUTE becomes `Runner assigned` / `A runner accepted your task and is on the way.` Hold until the owner answers CQ-176c, or ship the RUNNER_ASSIGNED removal alone (it is the misleading one).

### core-ui and flutter-customer items (row 176)
- core-ui CC-176: `packages/nitume_core/lib/src/widgets/status_presentation.dart:25-26` `runnerAssigned` → `(label: 'Finding a runner', tone: StatusTone.info)`; new `customerTimelineTitle(ErrandStatus) → String?` (null for RUNNER_ASSIGNED, `Runner assigned` for RUNNER_EN_ROUTE, else the C-06 label); doc comment: customer-only; tests. No audience parameter (no other app calls it).
- flutter-customer: `track_tab.dart:454` treat RUNNER_ASSIGNED as finding; drop RUNNER_ASSIGNED from `runnerWindow` (`:23-28`); timeline via `customerTimelineTitle()` (`:677`, `:703`, `_happyPath` `:31-39`); `task_detail_screen.dart` hide the `Runner` section in PAYMENT_CONFIRMED and RUNNER_ASSIGNED; `util/display.dart:147` RUNNER_ASSIGNED meta `Finding a runner`.

### Built screens that now conflict
| Area | File | Conflict | Fix owner |
|---|---|---|---|
| Customer Track | `apps/customer_app/lib/src/screens/shell/track_tab.dart:23-28, 454, 677, 703` | Offered runner's card, marker and ETA shown in RUNNER_ASSIGNED; label `Runner assigned` | core-ui CC-176, then flutter-customer |
| Customer Task detail | `apps/customer_app/lib/src/screens/task/task_detail_screen.dart` (Runner section), chip via core | Same | core-ui, flutter-customer |
| Customer Home | `apps/customer_app/lib/src/util/display.dart:147` | `{name} is assigned` before acceptance | flutter-customer |
| Customer History / chips | `StatusChip.forStatus` (core) | `Runner assigned` label | core-ui (automatic in the app) |
| API notifications | `apps/api/src/notifications/notifications.service.ts` `statusCopy` RUNNER_ASSIGNED | Misleading `Runner assigned` on offer | api-contract (after CQ-176c) |
| API offer expiry | `errands.service.ts` `expireLapsedOffers` | Expires at once; no exhaustion check | api-contract |
| API purge | `runners.service.ts` `purgeExpiredDocuments` | Keeps `reviewerNote` (row 170); no re-review event in the clock (row 171) | api-contract |
| Admin verifications | `apps/admin/src/app/features/admin/panels/verifications.panel.ts:71-75` | `Admin note` rendered on purged cards; no re-review action | web-parity |
| Admin task drawer | `task-drawer.ts`, `task-queue.panel.ts` | No offer state, eligible count or Matching exhausted state | web-parity, after api-contract |
| Runner app | `apps/runner_app` | None (screens not built) | — |

### New questions for the owner (round 10 follow-ups)
**All answered 2026-10-16 as BOARD rows 177–184; applied in §13.1.**
- AQ-17 (row 167): confirm the eligible-pool list; does an offline runner count as "unavailable", so a task can expire at night after one decline when everyone else is offline? Proposed yes (owner wording).
- AQ-18 (row 167): may an admin re-offer to a runner who already declined or let an offer for the task lapse? Proposed no.
- AQ-19 (row 167): until RA-10 service areas exist, interim pool without areas, or no automatic expiry? Proposed no automatic expiry.
- AQ-20 (row 171): reason required on `Re-review evidence`? Proposed optional note. Endpoint name `POST /runners/verifications/:id/re-review` OK?
- AQ-21 (row 171): can a re-review change the decision? Proposed no.
- CQ-176a (row 176): customer chip for RUNNER_EN_ROUTE: keep `En route` (amber; proposed) with `Runner assigned` as the acceptance timeline step and notification title, or show `Runner assigned` as the chip?
- CQ-176b (row 176): hide the offered runner's identity, marker and ETA during RUNNER_ASSIGNED (proposed; narrows row 27's window in practice)?
- CQ-176c (row 176): no customer notification on RUNNER_ASSIGNED and `Runner assigned` / `A runner accepted your task and is on the way.` on RUNNER_EN_ROUTE (proposed), or a `Finding a runner` message on RUNNER_ASSIGNED?

## 13.1 Round 10 fix (reviewer FAIL 1, owner rows 177–184, correction row 185), applied on `docs/owner-answers-10-specs`

### Correction: the customer deadline (B1)
Round 10 removed row 155's "the applicable task deadline is reached" path on the premise that tasks have no deadline. That premise was wrong: every errand carries a customer deadline (`deadline_at`, System Design §2.2; API `errand.entity.ts` `deadlineAt`; runner `v-job-detail` `Deadline`). Row 167's "No separate task deadline is required for this rule" most naturally means no new deadline is added for the exhaustion rule. The removal is withdrawn everywhere (System Design §3.3/§3.4/changelog, admin `_shared.md` rows 155/167 and N-20, `drawer-task-offer.md`, runner `_shared.md`, `v-jobs.md`, `v-job-detail.md`, customer `_shared.md`, `v-notifications.md`, the three gap reports, SCREEN_MAP). Every place now reads: whether `deadline_at` passing while RUNNER_ASSIGNED triggers EXPIRED is open (BOARD row 185); nothing builds either path until answered. Not decided either way.

### Decisions applied (rows 177–184)
| Row | Decision | Files |
|---|---|---|
| 177 | Offline runner = unavailable, never in the pool; pool = online, eligible for the category, inside the service area once areas exist, otherwise available; offline runners don't block exhaustion | System Design §3.3 "Pool"; admin `_shared.md` N-20, `drawer-task-offer.md`; runner `_shared.md` §6, `v-jobs.md` |
| 178 | A runner who declined or let an offer lapse for a task is excluded from later offers for that task; the admin Reassign list excludes them (shown greyed `Already offered`, not selectable) | same |
| 179 | No automatic expiry until service areas and the full pool exist; tasks may stay RUNNER_ASSIGNED | same |
| 180 | `POST /runners/verifications/:id/re-review` approved; optional note ≤ 500, no minimum; logged | admin `p-runners-verification-documents.md`, N-23 (e); System Design §10 |
| 181 | Re-review never changes the decision | same |
| 182 | RUNNER_EN_ROUTE chip `En route`; timeline step `Runner assigned`; acceptance notification `Runner assigned` / `A runner accepted your task and is on the way.` | customer `_shared.md` §6.1, `v-track.md`, `v-notifications.md`; System Design §4.4 |
| 183 | Before acceptance the customer never sees the offered runner's name, marker or ETA | customer §6.1, `v-track.md`, `v-task-detail.md`, `v-home.md` |
| 184 | No customer notification when an offer is made; only on acceptance (182 copy); UI keeps `Finding a runner` | customer §6.1, `v-notifications.md`; System Design §4.4 |

### Reviewer findings closed
- **B1**: deadline path restored as open (above).
- **M1, M3, M4, M5**: closed by rows 177–184. Pool, exclusion and no-interim-expiry are now owner decisions (177–179); the customer chip, timeline step, hidden runner and notification are decided (182–184), so the flutter-customer blockers in `customer-gap-report.md` (round 10) stand as valid blockers.
- **M2**: the check points are marked **proposed** (System Design §3.3, admin N-20, `drawer-task-offer.md`): after every decline and every lapse only. `GET /errands/:id/candidates` must not move a task to EXPIRED (a read with a state side effect); it only reports `eligibleRemaining`. Flagged for api-contract: whether the sweep also re-checks RUNNER_ASSIGNED tasks with no open offer (to catch a pool emptied by runners going offline).
- **M6**: re-review shape aligned to what `feat/api-owner-answers-9` @ `45b516d` now returns (201 `{ verificationId, reReview { id, reviewedBy { id, displayName }, createdAt, note } }`, `reReviews[]` and `reviewer` on the admin list). This is the simplest option, because the branch already has it. The earlier `0fb54ad` shape (200, `{ verificationId, eventId, reReviewedAt }`, no note) is superseded; the spec keeps the note and the `Reviews` list.
- **M7**: 400 `cancellation_reason_invalid` stays in the spec; `feat/api-owner-answers-9` already uses it (`runner-payout-requests.service.ts:410`).
- **M8**: conflict table below names the branch for each item.

### API items for api-contract (`feat/api-owner-answers-9`), replacing §13 items 1, 4 and 6
1. **Rows 167, 177–179**: pool = online, category skill, approved verification, active, service area once areas exist, no other active job (purchase limit or exception: design-auditor reading, flagged); exclude runners with a declined or expired assignment on the task (row 178), **now**, on assign and in candidates (409 `runner_excluded` or filtered, your choice). Exhaustion check after decline and lapse only (proposed); `GET /errands/:id/candidates` read-only. No automatic expiry until RA-10 and the full pool exist (row 179). Build neither `deadline_at` path until row 185 is answered.
2. **Rows 180, 181**: as built on `45b516d`; nothing more.
3. **Rows 182, 184**: `statusCopy`: remove the RUNNER_ASSIGNED customer notification; RUNNER_EN_ROUTE → `Runner assigned` / `A runner accepted your task and is on the way.` (no longer waiting on the owner).

### Built code that conflicts (branch named per item)
| Area | Branch @ file | Conflict | Fix owner |
|---|---|---|---|
| API offer expiry | `main` @ `errands.service.ts` `expireLapsedOffers` | Admin-offer lapse → EXPIRED at once | api-contract: **fixed on `feat/api-owner-answers-9`** (lapse leaves RUNNER_ASSIGNED, `expireLapsedOffers` :1320) |
| API exhaustion / pool / row-178 exclusion | `feat/api-owner-answers-9` and `main` | Not built (exhaustion must wait for RA-10, row 179; the exclusion can be built now) | api-contract |
| API RUNNER_ASSIGNED notification | `main` and `feat/api-owner-answers-9` @ `notifications.service.ts` `statusCopy` (`:526-529` on the branch) | `Runner assigned` on offer; EN_ROUTE copy not the row-182 copy | api-contract |
| API EXPIRED body | `main` @ `notifications.service.ts:507-514` | Round-8 copy | **fixed on `feat/api-owner-answers-9`** (owner copy, `:522`) |
| API purge `reviewerNote` and re-review clock | `main` @ `runners.service.ts` `purgeExpiredDocuments` | Keeps the note; clock counts assignments/disputes; no re-review | **fixed on `feat/api-owner-answers-9`** (`0fb54ad`, `e170729`, `45b516d`: note cleared at purge `:413`, re-review in the clock, guards kept) |
| API re-review endpoint | `main` | Missing | **built on `feat/api-owner-answers-9` @ `45b516d`**, matches the spec |
| API payout cancel | `main` @ `runner-payout-request.entity.ts` | No `cancelled` status, no route | **built on `feat/api-owner-answers-9`** with `cancellation_reason_invalid` |
| Customer Track / Task detail / Home | `main` @ `track_tab.dart:23-28, 454, 677, 703`, `task_detail_screen.dart`, `util/display.dart:147` | Offered runner shown; `Runner assigned` label; `{name} is assigned` | core-ui CC-176, then flutter-customer |
| Core status label | `main` @ `status_presentation.dart:25-26` | `Runner assigned` for RUNNER_ASSIGNED | core-ui CC-176 |
| Admin verifications | `main` @ `verifications.panel.ts:71-75` | `Admin note` on purged cards; no re-review action | web-parity |
| Admin task drawer / queue | `main` @ `task-drawer.ts`, `task-queue.panel.ts` | No offer section, eligible count, exclusion or Matching exhausted state | web-parity, after api-contract |
| Runner app | `main` @ `apps/runner_app` | None (screens not built) | — |

### Open question for the owner
- BOARD row 185 (already on BOARD): does `deadline_at` passing while RUNNER_ASSIGNED trigger EXPIRED (row 155), or is exhaustion the only trigger? **Answered 2026-10-16: both, the deadline first (§14).**
- Low priority (from row 177): does a runner whose purchase limit is below the task's purchase (no approved exception) count as ineligible for the pool? Proposed yes (row 113 refuses their accept).

## 14. Owner answers rows 185–200 (2026-10-16), applied on `docs/owner-answers-11-specs`

Spec-only update; no screen re-audited. System Design edited under row 147 (§2.2, §3.3, §3.4, §4.4, §6, §8, §10).

### Decisions applied
| Row | Decision | Files |
|---|---|---|
| 185 | RUNNER_ASSIGNED → EXPIRED by (1) the customer `deadlineAt` reached with no runner accepted, or (2) matching exhausted; the deadline takes precedence; after it no offer or reassign; a single lapse/decline never expires; RUNNER_ASSIGNED only. Replaces every "row 185 open" pointer | System Design §3.3/§3.4/§4.4; admin `_shared.md` §1, N-20, `drawer-task-offer.md`; runner `_shared.md` §0/§6, `v-jobs.md`, `v-job-detail.md`, `v-notifications.md`; customer `_shared.md`, `v-notifications.md`, `v-track.md`, `v-task-detail.md` |
| 186 | Purchase limit below the task's purchase = ineligible unless an approved exception exists; never offered; Reassign list greys them with the reason; assign 409 `runner_not_eligible` `over_purchase_limit` | System Design §3.3 "Pool"; admin N-20, `drawer-task-offer.md`; runner `_shared.md` §8, `v-jobs.md`, `v-job-detail.md` (over-limit UI kept as a fallback) |
| 187 | (a) an empty online pool never expires a task, re-check, no time rule; (b) no PAYMENT_CONFIRMED → EXPIRED; (c) a runner on another accepted/active task is ineligible; audited admin "Expire task — no runner available"; RUNNER_ASSIGNED → EXPIRED actor S → S, A (no new state or transition) | System Design §3.3 (diagram, table, bullets); admin `drawer-task-offer.md` (button, confirm with reason, result, activity row, errors) |
| 188 | Exact titles `Runner assigned`, `No runner available` (built on `main`) | System Design §4.4; customer `v-notifications.md` |
| 189 | No `updatedAt` on `task_exposure_overrides` (built that way) | System Design §2.2; admin `_shared.md` |
| 190 | Open-dispute hold on ID images intended | System Design §10; admin `p-runners-verification-documents.md` |
| 191 | Narrowed retention clock (built on `main`, `RETENTION_CLOCK_SQL`) | System Design §10; admin N-23, `p-runners-verification-documents.md` |
| 192, 193 | Cloudinary internal backups = external dependency; owner console checklist, a production-readiness owner action | System Design §10 (new "External dependency" section) |
| 194 | `Payout request cancelled` / `Your payout request was cancelled by Nitume operations.` | System Design §4.4; runner `v-notifications.md`, `v-payout.md`; admin `p-payout-requests.md` |
| 195, 200 | `side` `front \| back`, required on ID images, lowercase on the wire, `Front` / `Back` in the UI (built on `main`) | System Design §2.2; runner `v-onboard-id.md` (labelled tiles, front then back, side sent per upload), `_shared.md` R-19; admin `p-runners-verification-documents.md` |
| 196, 198, 199 | Test isolation: `nitume_test:*` queue prefix, teardown deletes only those keys, dedicated test database (owner creates it) | System Design §8 |
| 197 | An ops cancel or expiry before any accept: no receipt upload, no claim | System Design §6 item 5; runner `_shared.md` §8 |
| 201 | **Open**. Paid PAYMENT_CONFIRMED task past its deadline stays for ops, `Deadline passed` flag, one ops feed item | Specced as proposed, pending: System Design §3.3, §4.4; admin `drawer-task-offer.md`; customer `_shared.md` |

### API items for api-contract (`feat/api-runner-1`)
1. **Row 185 deadline sweep**:
   - RUNNER_ASSIGNED with `deadlineAt ≤ now` and no accepted offer → EXPIRED (S), with history note `Customer deadline passed` (proposed).
   - Close an open offer as `expired` and emit `job:offer_withdrawn` to that runner.
   - Side effects: `errand.EXPIRED` (exact title), a refund review when paid, and the admin feed item `deadline_passed`.
   - Not held back by row 179.
2. **Row 185 refusals**:
   - `POST /errands/:id/assign` → 409 `task_deadline_passed` from `deadlineAt` on. Your proposal is accepted in the specs.
   - Accept after `deadlineAt` → 409 `task_deadline_passed` or `offer_expired`.
   - Add `deadlinePassed` to the admin errand list and detail.
   - Add `deadlineAt` to `GET /runners/me/offers`, or cap `offerExpiresAt` at `deadlineAt`.
3. **Row 186**:
   - Pool filter on `max_purchase_advance` against the required purchase.
   - Candidates return the excluded runners with `ineligibleReason: 'over_purchase_limit'`, `purchaseLimit` and `requiredPurchase`.
   - Assign → 409 `runner_not_eligible` `{ reason: 'over_purchase_limit' }`. This replaces `purchase_limit_exceeded` on assign; accept keeps `purchase_limit_exceeded`.
4. **Row 187 (a)–(c)**:
   - Busy runners are out of the pool.
   - An empty online pool never expires a task; re-check at the next sweep or when a runner comes online, with no time rule.
   - No PAYMENT_CONFIRMED → EXPIRED.
5. **Row 187 admin expire**:
   - Allow actor A on RUNNER_ASSIGNED → EXPIRED. Use `PATCH /errands/:id/status` `{ to: 'EXPIRED', note }` or a dedicated `POST /errands/:id/expire` `{ reason }`; your choice.
   - Guard: RUNNER_ASSIGNED, no open offer, deadline not passed, `eligibleRemaining = 0`. Otherwise 409 `expiry_not_allowed` with `reason`.
   - Reason required, 10–500 after trimming (400 `expiry_reason_invalid`; pending AQ-23).
   - Add `canExpireNoRunner` to the admin view.
   - Side effects are the same as the system expiry.
6. **Expiry trigger and actor names**:
   - `expiry { trigger, at, by, note }` on the admin view of an EXPIRED task, derived from the history row (no schema change).
   - `actor { id, displayName }` on `GET /errands/:id/history` items.
7. **Row 201 (pending)**:
   - A PAYMENT_CONFIRMED task past its deadline gets no state change (already true).
   - Hold the `deadline_passed` feed item for PAYMENT_CONFIRMED, and any assign refusal at PAYMENT_CONFIRMED, until row 201 is answered.
8. **Row 194**: send `payout_request.cancelled` with the owner copy once runner notifications exist (RA-6).
9. Already on `main` (checked 2026-10-16), nothing to build:
   - 188: `statusCopy` `exactTitle`.
   - 189: no `updatedAt` on `task-exposure-override.entity.ts`.
   - 191: `RETENTION_CLOCK_SQL`.
   - 195, 200: `side`, `documentSideOf`, 400 `verification_document_side_invalid`.
   - 196, 199: `nitume_test` prefix.
   - 197: confirms the built behaviour; an ops cancel closes the open offer as `expired` (`errands.service.ts:1238`).
   - 198 is an owner action (create the test database).

### core-ui, flutter-runner and flutter-customer items
- **core-ui (blocker, built conflict)**: `packages/nitume_core/lib/src/repositories/runner_repositories.dart:79-110`. `uploadVerificationDocument` sends no `side`, and the API on `main` now refuses a `government_id` upload without one (400 `verification_document_side_invalid`). Fixes:
  - Add a required `IdDocumentSide side` for `government_id` (wire `front` / `back`, labels `Front` / `Back`), refused for a selfie.
  - Add `side` to `RunnerVerification` (`models/runner_account.dart:120-145`).
  - Update the tests (`test/runner_verification_documents_test.dart`).
- **flutter-runner** (screens not built yet; build to the updated specs):
  - `v-onboard-id`: labelled `Front` / `Back` tiles, front then back, the side sent per upload, tiles rebuilt by `side`.
  - `v-jobs` / `v-job-detail`: an offer ends at the earlier of `offerExpiresAt` and `deadlineAt`; `task_deadline_passed` → `That offer is no longer available.`; over-limit UI is a fallback only.
  - `v-notifications`: render the API's payout-cancel copy.
- **flutter-customer**: nothing to build; every change is API copy or a state the app already shows.

### Built screens that conflict
| Area | Branch @ file | Conflict | Fix owner |
|---|---|---|---|
| Core ID upload | `main` @ `runner_repositories.dart:79-110`, `runner_account.dart:120-145` | No `side`; the API now requires it | core-ui |
| Admin task drawer / queue | `main` @ `task-drawer.ts`, `task-queue.panel.ts` | No deadline state, no purchase-limit greying, no expire action (with the open findings 16–21) | web-parity, after api-contract |
| Admin verifications | `main` @ `verifications.panel.ts` | No `Front` / `Back` on ID images | web-parity |
| Customer app | `main` | None | — |
| Runner app | `main` @ `apps/runner_app` | None (screens not built) | — |

### New questions for the owner
- Row 201 (open, on BOARD). Follow-up: which exit ops use for a paid PAYMENT_CONFIRMED task past its deadline. §3.3 has none but RUNNER_ASSIGNED, and assign would be refused.
- AQ-22: the exact availability rule of the admin expire action.
- AQ-23: is the expire reason required, at 10–500 characters?
- AQ-24: "genuine" exhaustion vs row 177. An empty online pool never expires a task (187 (a)), so does an untried offline or busy runner block auto-expiry?
- AQ-25: does an offer open at the deadline end at once?
- AQ-26: should every errand carry a `deadlineAt`? It is optional on create today.
- AQ-27: what is an "approved exception" before an offer (row 186)? None exists; would it need a schema change?
- Full wording: admin `_shared.md` §8 and `drawer-task-offer.md`.

> Round 12 (2026-10-19): every question above is answered (rows 201–207); see §15.

## 15. Owner answers rows 201–218 (2026-10-19), applied on `docs/owner-answers-12-specs`

Spec-only update; no screen re-audited. Code checked read-only on `feat/api-runner-1` @ `87d3076` (reviewed, merge gated on row 219) and `feat/core-runner-batch-1` @ `861fb43`.

### Decisions applied
| Row | Decision | Files |
|---|---|---|
| 201, 214 | PAYMENT_CONFIRMED past its deadline is never auto-expired; ops feed item `Deadline passed`; **new §3.3 transition PAYMENT_CONFIRMED → EXPIRED, actor Admin** (owner-approved), through an admin `Expire task` after the deadline; assign refused after the deadline, no indirect assign→expire path. Feed body open (row 220) | System Design §3.3, §4.4, changelog; admin `drawer-task-offer.md`, `_shared.md`; customer `_shared.md`, `v-notifications.md`; runner `_shared.md` §0/§6 |
| 202, 203, 208 | `Expire task — no runner available`: RUNNER_ASSIGNED, no open offer, deadline not passed, no eligible online runner left (offline/busy don't prevent it); reason required 10–500; RUNNER_ASSIGNED → EXPIRED by S or A | System Design §3.3; admin specs |
| 204 | Offline/busy runners do not block exhaustion; only eligible online runners count | System Design §3.3, §3.4; admin `drawer-task-offer.md` Data |
| 205 | An open offer ends at once at `deadlineAt`; `offerExpiresAt` never beyond it | System Design §3.3; runner `_shared.md` §6, `v-jobs.md`, `v-job-detail.md`; admin `drawer-task-offer.md` |
| 206 | `deadlineAt` required on every task; contract default when the customer gives none (value and backfill: row 221, open) | System Design §2.2, §3.3; customer `v-new-details.md`; admin `drawer-task-offer.md`; runner `v-job-detail.md` |
| 207 | No pre-offer purchase-limit exception; below-limit runners stay ineligible | System Design §3.3; admin, runner specs |
| 209 | National ID: `Verified` only if both sides approved; rejected if either rejected; else `In review` if either pending. "Newest record wins" across sides dropped | System Design §10; runner `_shared.md` §9, `v-onboard-pending.md`, `v-onboard-id.md`, `v-profile.md`. Admin `p-runners-verification-documents.md`: no change (it lists each side as its own row) |
| 210 | Decline reasons `over_purchase_limit`, `too_far`, `not_available`, `other` (schema approved); reason picker | System Design §2.2; runner `v-jobs.md` (new "Decline reason picker", R-23), `v-job-detail.md`, `_shared.md`; admin `drawer-task-offer.md` (labels) |
| 211 | Busy = RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS only | System Design §3.3; runner `_shared.md` §6, `v-jobs.md`, `v-active.md` (several active-set jobs, proposed `Other jobs`) |
| 212, 213 | Service areas stay server config `RUNNER_SERVICE_AREAS`; circle areas; first point task site → pickup → drop-off | System Design §2.2, §3.3, §3.4; runner `v-edit-skills.md`, `v-jobs.md`; admin `_shared.md` |
| 215 | Admin may assign an offline runner; online-only is for the pool | System Design §3.3, §3.4; admin `drawer-task-offer.md` (`Show offline runners`); runner `v-jobs.md` (offline offers) |
| 216 | Ops copy approved (RUNNER_ASSIGNED deadline expiry; decline without reason) | System Design §4.4; admin `drawer-task-offer.md` |
| 217 | OTP sign-in records the phone check approved | System Design §10; runner `_shared.md` §9, `v-onboard-pending.md`, `v-onboard-selfie.md` |
| 218 | Automatic payment-identity check and `POST /runners/me/verifications/submit` deferred (row 222); interim `POST /runners/me/verifications` | System Design §10; runner `v-onboard-selfie.md`, `v-onboard-pending.md` |

Already matching on `feat/api-runner-1` (nothing to build): 211 (`RUNNER_ACTIVE_JOB_STATES`), 213 (`service-areas.ts`, `FIRST_POINT_ORDER`), 215 (assign refuses unverified, busy and over-limit runners, never offline ones), 216 (`notifications.service.ts` copy), 217 (`ensurePhoneVerified`), 209 for the gate (`verification-summary.ts` requires front and back each approved).

### Round 11 reviewer minors (closed)
1. Offer close at the deadline labelled proposed → now decided by row 205 everywhere (`v-jobs.md`, `v-job-detail.md`, runner `_shared.md` §6, `drawer-task-offer.md`, System Design §3.3).
2. History note aligned: `Customer deadline passed` is the built `DEADLINE_EXPIRY_NOTE`; `No eligible runners left` stays proposed (`drawer-task-offer.md` activity row and Data).
3. Accept after the deadline pinned to 409 `offer_expired` with `reason: 'task_deadline_passed'` (the built code) in `v-jobs.md`, `v-job-detail.md`, runner `_shared.md` §6, System Design §3.3.
4. `runner_already_offered` mapped in the admin Reassign errors (`drawer-task-offer.md`), by `previousStatus`.
5. `v-onboard-id.md` tile extensions (selected outline, tap-to-select, side label chip, per-tile `Retake`) marked proposed / EXTENDS MOCKUP.

### API items for api-contract (numbered; branch after `feat/api-runner-1` merges, or on it if the orchestrator prefers)
1. **Rows 201, 214**: `POST /errands/:id/assign` on a **PAYMENT_CONFIRMED** task past `deadlineAt` → 409 `task_deadline_passed` (today `errands.service.ts` `assign` refuses only RUNNER_ASSIGNED: "PAYMENT_CONFIRMED is held for row 201").
2. **Row 201**: transition PAYMENT_CONFIRMED → EXPIRED, actor A only (never S); guard: status PAYMENT_CONFIRMED and `deadlineAt ≤ now`; reason required 10–500 after trimming (proposed AQ-28, the row-203 rule); history row with actor, id, time, `note`; 409 `expiry_not_allowed` `{ reason: 'deadline_not_passed' | 'not_payment_confirmed' }`, 400 `expiry_reason_invalid`.
3. **Row 201 + row 102**: N-16 refund review `expired_after_payment` must also open on PAYMENT_CONFIRMED → EXPIRED (today only RUNNER_ASSIGNED → EXPIRED). Customer `errand.EXPIRED` notification on this transition too (proposed, AQ-29; same title and body).
4. **Row 201**: one admin feed item `deadline_passed` per PAYMENT_CONFIRMED task when its deadline passes, no state change (the sweep selects them without transitioning; idempotent per task). Title `Deadline passed`; body pending row 220 (do not reuse row 216's "The task has expired.").
5. **Rows 187, 202, 203, 208**: the RUNNER_ASSIGNED admin expire (not built on `feat/api-runner-1`): guard RUNNER_ASSIGNED, no open offer, deadline not passed, `eligibleRemaining = 0` over **online** eligible runners; reason required 10–500; 409 `expiry_not_allowed` `{ reason }`.
6. **Availability flags**: `canExpire { noRunner, deadlinePassed }` on the admin errand detail (proposed shape, replaces `canExpireNoRunner`). Route: one `POST /errands/:id/expire` `{ reason }` for both, or `PATCH /errands/:id/status`; api-contract's choice.
7. **Expiry view**: add `fromStatus` to `expiry` (tells the two admin expiries apart); later `trigger: 'matching_exhausted'` with note `No eligible runners left` when exhaustion is built (row 179).
8. **Row 205**: every new offer `offerExpiresAt` = min(now + window, `deadlineAt`) (today `now + adminOfferWindowSeconds`, `errands.service.ts` assign); same rule for auto-offers later.
9. **Row 210**: enum migration on `errand_assignment_decline_reason_enum` adding `too_far`, `not_available`, `other`; decline DTO and 400 `decline_reason_invalid` `allowed` list; `purchase_within_limit` stays for `over_purchase_limit` only; the admin views already return `declineReason`. The `assignment_declined` feed body is chosen by `overPurchaseLimit` today (`notifications.service.ts:481-486`); choose it by `declineReason` so an over-limit offer declined as `too_far` does not read "above their limit" (body for the non-null reasons proposed, row 216 covers only no reason).
10. **Rows 206, 221**: `deadlineAt` default at create when absent (value pending row 221), then NOT NULL migration with the row-221 backfill; expose the default (e.g. `defaultDeadlineHours` on a config read) for the customer `Flexible` caption.
11. **Row 215**: the candidates read (N-20, proposed) returns offline-but-otherwise-eligible runners flagged `offline: true`, outside `eligibleRemaining`.
12. **Row 204 / AQ-30**: when exhaustion is built, count only eligible online runners; how a task never offered with an empty online pool is treated waits for AQ-30.
13. **No change needed (checked after review)**: `POST /runners/me/verifications` already refuses any client `documentS3Key` with 400 `verification_document_upload_required` (`main` `runners.service.ts:253-263`; `feat/api-runner-1` `runners.service.ts:470-481`). The DTO field stays only to give that error its code (`dto/runner-actions.dto.ts:30-37`); dropping the dead field is optional. The interim payment-identity record (row 218) sends no key.

### core-ui items (numbered)
1. **Row 210**: `OfferDeclineReason` (`feat/core-runner-batch-1`, `models/runner_job.dart`) gains `tooFar`, `notAvailable`, `other` (wire `too_far`, `not_available`, `other`); decline sends the chosen value; 409 `purchase_within_limit` code constant.
2. **Row 210**: R-23 `DeclineReasonDialog` (C-35 + C-16 `NitumeRadioRow`, spec in `v-jobs.md` "Decline reason picker"), one widget for `v-jobs` and `v-job-detail`.
3. **Row 209**: a combined National ID status on `RunnerVerificationDocuments` (e.g. `nationalIdStatus` → approved | rejected | pending | missing, plus which side is rejected), the row-209 rule; legacy side-less records ignored (proposed).
4. **Row 218**: a repository call to create the pending `payment_identity` record (`POST /runners/me/verifications`), skipped when one is pending or approved.

### flutter-runner items (screens not built; build to the updated specs)
1. `v-jobs` / `v-job-detail`: R-23 decline dialog; offline offers notice (row 215); busy rules (row 211).
2. `v-active`: several active-set jobs (`Other jobs`, proposed, row 211).
3. `v-onboard-pending`, `v-profile`: combined National ID status and the side caption (row 209); phone row `Verified` (row 217).
4. `v-onboard-id`: per-side rejected state (row 209).
5. `v-onboard-selfie`: interim payment-identity call on submit (row 218).

### flutter-customer items
1. `v-new-details`: the `Flexible` caption, **after row 221** and API item 10. Nothing else; PAYMENT_CONFIRMED → EXPIRED reaches the existing EXPIRED screen.

### web-parity items
Admin findings 29–32 in `docs/audits/admin-gap-report.md` (round 12).

### Built screens that conflict
| Area | Branch @ file | Conflict | Fix owner |
|---|---|---|---|
| Core decline reasons | `feat/core-runner-batch-1` @ `models/runner_job.dart:9-20` | Only `over_purchase_limit` | core-ui (item 1) |
| Core ID grouping | `main` @ `models/runner_account.dart:218-280` | Groups sides; no combined status | core-ui (item 3) |
| Admin task drawer / queue | `main` @ `task-drawer.ts`, `task-queue.panel.ts` | No PAYMENT_CONFIRMED expire, no reason labels, no offline runners (with findings 16–28) | web-parity, after api-contract |
| Customer details wizard | `main` @ `wizard/details_screen.dart` | No `Flexible` caption | flutter-customer, after row 221 |
| Runner app | `main` | None (screens not built) | — |

### New questions for the owner
- Row 220 (open): ops feed body for a PAYMENT_CONFIRMED task past its deadline.
- Row 221 (open): default `deadlineAt` and backfill.
- AQ-28 (BOARD row 225): PAYMENT_CONFIRMED `Expire task` uses the same dialog and required 10–500 reason? Recommended yes.
- AQ-29 (BOARD row 226): send the customer the usual `errand.EXPIRED` notification on PAYMENT_CONFIRMED → EXPIRED? Recommended yes.
- AQ-30 (BOARD row 227): is a task never offered, with no eligible runner online, "exhausted"? Proposed no (exhaustion needs at least one offer made).
- AQ-31 (BOARD row 228): offline runners in the Reassign dialog as a collapsed, selectable group? Proposed yes.
- RQ-32 (BOARD row 229): must the runner pick a decline reason (UI), and is `Other reason` without text enough? Proposed yes to both.

## 15.1 Audit 2026-10-19: core R-23 and the combined National ID status (`feat/core-owner-answers-12` @ `b44da01`)

Specs: runner `_shared.md` R-19, R-23, §9; `v-jobs.md` "Decline reason picker" with the `cd31855` rulings; `v-job-detail.md`; `v-onboard-pending.md`; `v-profile.md`. Golden `packages/nitume_core/test/goldens/decline_reason_dialog.png` checked by eye. `flutter test` (decline dialog, verification documents, goldens): 69 pass; `flutter analyze` on `nitume_core`: no issues.

### R-23 `DeclineReasonDialog` (`lib/src/widgets/decline_reason_dialog.dart`): PASS
- Structure: the C-35 `NitumeDialog` shell is unchanged (the large radius, the C-35 body style, the 335 max width). The title, the body with its over-limit variant, the label `Why are you declining?`, and one C-16 `NitumeRadioRow` group with a gap of 8. `Above my purchase limit` is listed first and pre-selected only when over the limit. Actions: outline `Decline`, then primary `Keep offer`.
- States: `Decline` stays disabled until a reason is chosen. This is behind `reasonRequired` (default true), so it can follow row 229 either way. `purchase_within_limit` drops the row, clears the choice and shows the inline error, and the body follows the shown rows. `decline_reason_invalid` and other errors show inline. `offer_expired`, `assignment_not_declinable` and 404 close the dialog as `offerUnavailable` (ruling `cd31855`). The dialog cannot be dismissed while busy.
- Copy: every string matches `v-jobs.md` word for word and is kept in one `DeclineReasonCopy` class (all proposed).
- Tokens and typography: no literal colours; theme tokens only. Fira Sans throughout; there are no numbers.
- Contrast: the selected row is a blue fill with white text. `Keep offer` is green with white text (primary). `Decline` is outline, never red or green.
- Reuse: built from C-35 and C-16. The new `NitumeDialog.autofocusTitle` is opt-in and off by default, so other dialogs are unchanged (tested).
- Accessibility: the title gets initial focus; the disabled `Decline` announces `Choose a reason first`; the rows are a mutually exclusive group with 48 dp targets.
- Minor (no fix needed): the golden's rows are 48 high. That is the C-16 hit area drawn as the pill, so it is the existing `NitumeRadioRow` look, not an R-23 deviation.

### Combined National ID status (`lib/src/models/runner_account.dart`, `RunnerVerificationDocuments.nationalIdStatus`, `idRejectedSides`): PASS
- Row 209 rule exactly: approved only if both sides are approved, rejected if either side is rejected, otherwise pending if either side is pending, otherwise `missing` (the screens' proposed `Not started`). The newest record counts per side. A legacy record with no side does not count (proposed, as specced).
- `government_id` is left out of the per-type "newest record" map, so no screen can show one side as the whole ID.
- `idRejectedSides` (front first) drives the `Front` / `Back` / `Both photos not approved` caption and the side that `Upload again` selects.

Verdict: **PASS**, no findings. core-ui §15 items 1–3 are met on this branch. Item 4 (the payment-identity call) was not part of this audit.

## 15.2 Check 2026-10-19: eligible pool on `feat/api-owner-answers-12` @ `b47d9f2`

Read-only check of `apps/api/src/runners/runners.service.ts` `poolFor` and `apps/api/src/matching/candidates.service.ts` against `drawer-task-offer.md` Data and System Design §3.3 "Pool".

1. **Runners with no matching skill, or no service area while areas are configured, are not listed.** This **matches** the spec: the category must be in `skills` (row 115), and the runner must be inside a service area once areas exist (rows 116, 212, 213). Without configured areas (`RUNNER_SERVICE_AREAS` empty), or with no task point, the area filter is skipped. That also matches "once areas exist".
2. **A task whose first point is inside no configured area gets an empty pool.** This **matches** the rule as written (rows 213, 177): no runner can be in the pool. Effects:
   - The Reassign dialog shows `No eligible runners are available right now.`
   - Offline runners are not offered as a fallback either, because offline candidates also come from the pool.
   - An admin can still assign by hand: assign checks only verification, busy and purchase limit, not skill or area.
   - Unless an admin offered it by hand, the task is never offered, so it is never exhausted (row 227, decided 2026-10-19: exhaustion needs at least one offer); row 179 holds exhaustion back anyway. It expires at its deadline (row 185), or ops cancel or expire it.
   - This does not block anything. It does raise a product question the documents do not answer, so it goes to the owner as **AQ-32**: should a task be accepted at creation when its location is inside no service area? Proposed: refuse at quote or create with a clear customer message. Until the owner answers, ops handle it by hand (assign, cancel, or expire).
3. **Business tasks always get an empty pool** because `business` is not a skill a runner can pick. This **matches**: Business Tasks are out of MVP (OA-18; `v-edit-skills.md`: `business` refused from the app), and the customer app offers 5 categories. No question now. When Business Tasks enter scope, the skill must become selectable or business tasks must be matched another way; record that with the Business scope decision.

Also seen, and matching the spec: busy runners are not listed (`availability = busy` plus the holders of another job, rows 187 (c), 211); offline runners are flagged `offline`, kept out of `eligibleRemaining` and counted in `offlineCount` (row 215); tried runners are marked `declined | expired` (row 178); over-limit runners are marked `ineligibleReason: over_purchase_limit` (rows 186, 207); the first point is taken in the order task site, pickup, drop-off (row 213); the candidates read changes no state.

New owner question: **AQ-32**, tasks located outside every configured service area (above).

## 16. Owner answers rows 220, 221, 225–229, 231, 232 (2026-10-19), applied on `docs/owner-answers-13-specs`

Spec-only update; no screen re-audited. The API state was read on `feat/api-owner-answers-12` @ `b47d9f2`, which built §15 items 1, 5–9, 11 and 13 (nothing to build). Row 233 (a task inside no service area; AQ-32) stays open.

### Decisions applied
| Row | Decision | Files |
|---|---|---|
| 220 | PAYMENT_CONFIRMED deadline feed: `Deadline passed` / `The customer's deadline for {ref} passed before a runner was assigned. Expire the task or contact the customer.` | System Design §3.3, §4.4; admin `drawer-task-offer.md`, `_shared.md` |
| 221 | Default `deadlineAt` = creation + 24 h (api-contract to confirm against the category rules); backfill open tasks `createdAt` + 24 h, closed tasks their closing time; then NOT NULL. The customer caption reads the default from the API | System Design §2.2, §3.3; customer `v-new-details.md`, `_shared.md`; runner `_shared.md`; admin specs |
| 225 | The PAYMENT_CONFIRMED `Expire task` uses the same confirm dialog and a required 10–500 reason | System Design §3.3; admin specs |
| 226 | That expiry sends the usual `errand.EXPIRED` and opens an `expired_after_payment` refund review; the dialog sentence `The customer is told no runner was available.` is now unconditional | System Design §3.3, §4.4; admin `drawer-task-offer.md`; customer `_shared.md`, `v-notifications.md` |
| 227 | A task never offered is not exhausted; exhaustion needs at least one offer made | System Design §3.3; admin `drawer-task-offer.md`, `_shared.md`; runner `_shared.md` |
| 228 | Offline runners as a collapsed, selectable `Show offline runners ({n})` group | admin `drawer-task-offer.md` |
| 229 | The runner must pick a decline reason; `Other reason` has no free-text box | System Design §2.2; runner `v-jobs.md`, `v-job-detail.md`, `_shared.md` |
| 231 | Plain decline feed body also for `too_far`, `not_available`, `other` (already built that way) | System Design §4.4; admin `drawer-task-offer.md` |
| 232 | No admin feed item after the admin's own `Expire task — no runner available` (already built that way). For the PAYMENT_CONFIRMED `Expire task` the feed rule is pending BOARD row 234 (design-auditor reading of row 232; recommended none); previously read here as: the admin acts there as well. This is a design-auditor reading; the owner's words name only the RUNNER_ASSIGNED action | System Design §3.3; admin specs |

### API items for api-contract (numbered; all unblocked)
1. **Rows 201, 225, 226, 232**: PAYMENT_CONFIRMED → EXPIRED, actor A only.
   - Route: extend `POST /errands/:id/expire` (the server picks the transition by status), or use a sibling route; api-contract's choice.
   - Guard: PAYMENT_CONFIRMED and `deadlineAt ≤ now`. Otherwise 409 `expiry_not_allowed` `{ reason: 'deadline_not_passed' | 'not_payment_confirmed' }`.
   - Reason: required, 10–500 after trimming (400 `expiry_reason_invalid`). It becomes the history note.
   - Side effects: the customer `errand.EXPIRED` (existing copy), and N-16 `expired_after_payment` extended to this from-state. Admin feed item: pending BOARD row 234 (design-auditor reading of row 232; recommended none). Build none; that is the safe default and does not block this item.
   - `canExpire.deadlinePassed` becomes true when the action is allowed; `expiry.fromStatus = PAYMENT_CONFIRMED`.
2. **Rows 201, 220**: one `deadline_passed` admin feed item per PAYMENT_CONFIRMED task when its deadline passes. No state change, idempotent per task, owner copy (row 220).
3. **Row 221**:
   - Default `deadlineAt` = creation + 24 h when the customer sends none (confirm against the category rules; if a category needs another default, ask before building).
   - Backfill migration: open tasks get `createdAt` + 24 h; closed tasks get their closing time (the time of the terminal history row). Then `deadline_at` NOT NULL and `CreateErrandDto.deadlineAt` stays optional on the wire.
   - Expose the default (e.g. `defaultDeadlineHours` on a public config read) for the customer caption.
   - `assertDeadlineInFuture` keeps refusing a past `deadlineAt` from the client.
4. **Row 227**: when exhaustion is built (after row 179), only tasks with at least one offer can be exhausted.
5. Row 233 (open): build nothing for out-of-area tasks.

### core-ui items
1. **Row 229**: R-23 `reasonRequired` must stay `true` in both screens. Optional: remove the flag, since the owner settled it. No other change; R-23 and `nationalIdStatus` passed (§15.1).
2. **Row 221**: a core accessor for the default deadline value (API item 3), for the customer caption.

### flutter-runner items
1. Use R-23 with a required reason (row 229) in `v-jobs` and `v-job-detail`. No other change from round 13.

### flutter-customer items
1. `v-new-details`: the `Flexible` caption (row 221), after API item 3 and core-ui item 2. `{duration}` comes from the API, never hard-coded.

### web-parity items
Admin findings 29 (now unblocked: API items 1–2) and 31 (offline group, decided row 228). See `admin-gap-report.md` round 13.

### New questions for the owner
- Row 234 (new, open): no admin feed item after the admin's PAYMENT_CONFIRMED `Expire task` either (design-auditor reading of row 232; recommended none).
- Row 233 (AQ-32) is still open.

## 17. Audit 2026-10-19: runner batch 1 (`feat/runner-batch-1` @ `9572e64`, on core `b44da01`)

Commits `60399ed`, `2cfb3ac`, `c322029`, `89ebdfe`, `e5b269c`, `9572e64`. Specs: round 13 (`docs/owner-answers-13-specs` and the stacked audit branches). The mockup is `nitume_runner_app.html`.

Build health:
- `flutter analyze` (runner_app): no issues. `flutter test`: 65 pass.
- No `Color(0x…)`, `fontFamily`, `GoogleFonts` or raw `TextStyle(` in `lib/`. Every style comes from core `NitumeTextStyles`, and numbers use `NumSpan` / `NumText` / `meta` (Fira Code).

### Rulings on the builder's readings
- **(a) D-1, selfie missing goes to `v-onboard-selfie`**: accepted. The routing order matches `v-auth-otp` step 3 and the spec entries:
  - verified → shell;
  - an ID side missing → `v-onboard-id`;
  - selfie missing → `v-onboard-selfie`;
  - everything submitted → shell with `v-onboard-pending` pushed;
  - a failed check or a restored session → shell, which shows the verification card.
- **(b) `v-onboard-pending`**:
  - The generic load-error copy is accepted.
  - "Not verified, nothing pending" used the 24-hour body. The spec now adds the case where the ID or selfie is `Not started` (none rejected): show the `v-jobs` copy `Upload your ID and a selfie to start accepting jobs.` This is **m-5 (minor)**.
- **(c) `v-jobs`**:
  - The disabled availability card stays for an unverified runner: accepted, and the spec wording is fixed (the card replaces items 3–4).
  - 20 s polling instead of the RA-5 socket: accepted (the spec's own fallback). No `Reconnecting…` notice without a socket: accepted.
  - The bell does nothing until `v-notifications` exists: accepted interim. It must route to `v-notifications` in that build.
  - `Photos required` left out of the meta line: **not accepted**. `Photos required` is proposed copy applying row 120 (RQ-8, generic evidence checklist). Every task's generic checklist requires photos, so it is a constant meta part, not an API field. See F-1.
- **(d) `v-job-detail` items `qty × name unit`**: accepted. It matches the spec example `2 × Milk 500 ml`; the quantity is in Fira Code.
- **(e) Interim stand-ins for missing core pieces**: all acceptable interim. None is a FAIL, because each keeps the spec's information, uses only core tokens, and is marked `TODO(core-ui)` where code exists. core-ui needs:
  - C1 R-15 `CaptureThumbnail` states:
    - `selected` (2 px blue outline);
    - a rejected chip (C-05 small danger `Not approved`);
    - a `Too large` label.
    Until then a rejected side reads as an empty tile; the notice above the tiles names the side.
  - C2 R-13 `CaptureDropZone` title slot (the side line) and a captured state (photo r 16, cover) for the selfie.
  - C3 C-40 `NitumeNotice` danger accent (the 10 MB notice).
  - C4 C-33 empty-state title slot (`v-jobs` empty and offline states now put title and body in one message).
  - C5 promote `FixedCta` to `nitume_core`. **m-4 (minor)**: the runner copy is the second copy (customer app plus runner app). The m-2 rule applies: a third copy, or drift, is a FAIL.
  - C6 `CaptureFrom.frontCamera` (front camera only for the selfie). Today the rear camera opens and the runner can switch.
- **(f) iOS permission strings written from the disclosure copy**: accepted and recorded in `x-location-disclosure.md`. Android: the camera, fine/coarse/background location and foreground-service location permissions are declared. Background location is asked only when a job starts.
- **(g) No location pings**: accepted. RA-4 (the API side of `location:ping`) is not built, so there is nothing to send to. Nothing is collected offline: the device fix is read only while online, for the distance.

### Per screen

#### runner/shell, D-1 routing: PASS
- D-1 (round-7 deferral) is closed: `onboarding_routing.dart` and `app.dart` route as in (a), with tests.

#### v-onboard-id: PASS (interim C1, C2)
- Header `ID verification` with `Step 1 of 2`, the intro, and `Front` / `Back` tiles in order, each upload sending `side`.
- The side line `Front of your ID` / `Back of your ID`, the drop zone `Tap to take a photo or upload`, and a `Take photo` / `Choose from gallery` sheet.
- After the front uploads, the back is selected. A rejected side is selected first, with the notice for one side or both (row 209). `Retake` / `Retry` per tile.
- Too large: checked before upload and on 413, with `10 MB` in Fira Code. Bad type and bad photo copy as specced.
- The `Leave verification?` dialog on the first run.
- Hint and privacy line; the link is hidden without the URL.
- `Continue →` only when both sides are uploaded. Photos are read into memory (file deletion as corrected in §17.3).

#### v-onboard-selfie: PASS (interim C2, C6; open item S-1)
- Copy as in the mockup. The size and type checks are shared with the ID screen. `Retake`. `Submit for review →` replaces the onboarding stack with `v-onboard-pending`.
- Builder hint copy accepted (spec updated).
- **S-1 (open, orchestrator decision)**: the interim `payment_identity` record at submit (row 218; core-ui §15 item 4) is not built, because it was deferred by the orchestrator.
  - Consequence: no runner can become verified end to end, because the gate needs `payment_identity` approved and nothing creates that record.
  - It must be built (core-ui item 4, then this screen) before any real runner onboarding.

#### v-onboard-pending: PASS (m-5)
- The four rows with compact chips (`Verified`, `In review`, `Not approved`, `Not started`).
- The National ID uses the row-209 combination (`nationalIdStatus`), with the side caption and `Upload again` opening the rejected side; `Retake selfie`.
- Bodies by state, with `24` in Fira Code. The owner's full privacy paragraph and the link.
- `Back to app` / `Start accepting jobs`. Reloads on resume; pull to refresh.
- m-5: the `Not started` body (spec updated in this branch).

#### x-location-disclosure: PASS
- Layout and copy as specced: a 56 px blue-050 circle, the heading, three paragraphs, `Continue` / `Not now`.
- The OS prompt is asked only after `Continue`; the result is returned to the caller.
- The gate shows `Turn on location to receive and do jobs.` with `Open Settings` when the permission is permanently denied.

#### v-jobs: FAIL (1 minor)
F-1 **minor**: `screens/jobs/offer_presentation.dart:63-72` (`offerMeta`).
- Design: the meta line includes `Photos required` (proposed copy applying row 120; mockup meta).
- Code: no evidence part ("the offer view carries no evidence requirement").
- Fix: append `Photos required` to every card's meta (after distance, before the purchase terms), as a constant. Update `jobs_test.dart`.

Everything else passes:
- Top bar `Nearby jobs` with the bell and unread count.
- The R-02 availability card, with the areas line or `No service areas yet`.
- Verification card states and targets, offline and empty states, the error state, and skeletons.
- `{n} offers near you` with a Fira Code count. Cards with tag, pay, title, meta and the over-limit notice; `Accept` disabled over the limit.
- The active-job card. Busy rules (row 211): no going offline while busy, `runner_busy` copy.
- Offline offers notice (row 215).
- The location gate before going online or accepting.
- Accept goes to the Active tab, with the error mapping (`offer_expired` with or without the deadline reason, `illegal_transition`, 404/403 → `That offer is no longer available.`).
- R-23 decline with the reason required (row 229).
- Cards are removed at the earlier of `offerExpiresAt` and `deadlineAt` (rows 156, 205). New offers are announced politely. Pull to refresh.

#### v-job-detail: PASS
- Countdown `Offer ends in m:ss` (Fira Code, 1 s tick); the ended state at 0, or when the job is no longer returned.
- R-16 map with the device marker.
- Detail card:
  - tag and pay (17, Fira Code), title, description, items;
  - `Distance` / `Deadline` / `Payout` / `Item amount` / `How it's paid` / addresses (numbers in Fira Code).
- Over-limit notice and caption; the reimbursement note for `send_to_runner`.
- `Decline` uses R-23 and `Accept job` uses the location gate.
- Offline or unverified: buttons hidden behind the notice.
- A stale notification for a held job goes to Active.
- Ended state: `This offer is no longer available.` with `Back to jobs`. `Distance unavailable` without a fix (builder copy, accepted).

### Needs
- flutter-runner: F-1 (v-jobs); m-5 (v-onboard-pending); later S-1 (after core-ui item 4), the C1–C6 switches once core ships them, the bell route with `v-notifications`, and m-4 (switch to the core `FixedCta`).
- core-ui: C1–C6 above; §15 item 4 (payment-identity call, unblocks S-1).
- api-contract: RA-4 (`location:ping`) and RA-5 (runner socket room), already listed; no new item.
- Orchestrator: S-1 is the only path to a verified runner. Schedule it before onboarding is used with real runners.

### 17.1 Re-audit 2026-10-19 (`feat/runner-batch-1` @ `f125ef9`)
Build health: `flutter analyze` clean; `flutter test` 66 pass.

- **v-jobs: PASS (F-1 closed)**, fixed in `b2beedb`.
  - The meta line now reads `{distance} away · Photos required · Item KSh … · {how it's paid}`. `Photos required` is on every offer and the distance is left out without a device fix. That matches the spec (proposed copy applying row 120) and the spec order.
  - The copy is the constant `OfferCopy.photosRequired`, and the tests are updated.
- **v-onboard-pending: PASS (m-5 closed)**, fixed in `f125ef9`.
  - Body order: rejected, then all approved, then ID or selfie `Not started` (`Upload your ID and a selfie to start accepting jobs.`), then the 24-hour mockup body.
  - The National ID counts as not started whenever its combined status is `missing`, including one side uploaded and the other not.
  - Ruling: when only `M-Pesa identity match` is `Not started`, the 24-hour body stays. This matches the spec as amended in `f03be0e`. That record is created by the app at submit once S-1 is built, so the case is temporary. No change.

Open from §17: S-1 (orchestrator), m-4 and C1–C6 (core-ui), the bell route (with `v-notifications`).

### 17.2 Review minors (2026-10-19)
- Labels: the `x-location-disclosure` OS strings and the `v-onboard-pending` additions are marked proposed. "None (OS permission)" is reworded to "No API data".
- `Photos required` is attributed as "proposed copy applying row 120" (§17, §17.1, `v-jobs.md`).
- `v-onboard-pending` now states that the M-Pesa-only 24-hour body is misleading until S-1 is built.
- **New m-6 (minor), v-jobs meta typography**: `v-jobs.md` now asks for Fira Code only on the numeric parts of the meta line (design system wins over the mockup). The build renders the whole meta in Fira Code (core R-04 `JobOfferCard` `meta` is a plain Fira Code string).
  - core-ui: let R-04 take a rich meta (spans), with `NumSpan` for numbers.
  - flutter-runner: build the meta from spans in `offer_presentation.dart` `offerMeta`.
  - This does not reopen the v-jobs PASS for F-1; m-6 is a follow-up minor.
- The captured-file claim is corrected in §17.3 after the B-1 fix (`bcae361`).

### 17.3 Re-audit 2026-10-19 (`feat/runner-batch-1` @ `e2069dd`, with core `feat/core-runner-batch-2` merged in `b6c2fa6`)
Build health: `flutter analyze` clean; `flutter test` 67 pass. Still no literal colours or font families in `lib/`.

Changes checked:
- **B-1** (`bcae361`): the picked or shot image is read into memory, then the capture file and any scratch copy the picker made are deleted (`CapturedImage.discard`), and captures orphaned when Android killed the app mid-pick are deleted at the next start (`discardLostCaptures`); copies outside the app, such as the runner's own gallery photo or a system camera app's copy, are not the app's to delete.
- **Core C1–C3, C6** (`8d08b0b`):
  - R-15 `selected` outline (2 px blue), `issue` (`notApproved`, `tooLarge`) with `Retake`, and the side label on the photo.
  - R-13 `title` slot and captured state.
  - C-40 danger tone on the 10 MB notice.
  - `CaptureFrom.frontCamera` for the selfie.
- **`NitumeFixedCta`, empty-state titles, required reason** (`b7d04f7`): the local `FixedCta` copy is gone (m-4 closed). The `v-jobs` empty and offline states now have a title and a body (C4 closed). R-23 `reasonRequired` stays required.
- **S-1** (`28290b0`): `Submit for review →` calls `ensurePaymentIdentityVerification` (it creates the pending `payment_identity` record unless a pending or approved one exists; a rejected one is created again), then replaces the stack with `v-onboard-pending`. On failure: C-40 `Couldn't submit. Check your connection and try again.` (the proposed copy in `v-onboard-selfie.md`); the selfie stays uploaded. **S-1 closed.**
- **m-6** (`e2069dd`): `richMeta` puts Fira Sans words with `NumSpan` numbers (distance, item amount). **m-6 closed.**

Rulings:
- A selfie already on the server shows the R-15 thumbnail (uploaded state, `Retake`) with no image: accepted (the app never downloads ID or selfie images). `v-onboard-selfie.md` updated.
- Too large leaves the tile empty with the `tooLarge` issue and `Retake`: accepted. `v-onboard-id.md` updated.
- The side label on a captured tile is a solid `#0B2545` (`blue`) chip with white text: accepted. `v-onboard-id.md` R-15 amended.
- Runner `_shared.md` §3: offer meta in Sans with Code only on the numbers.

### Verdicts
| Screen | Verdict |
|---|---|
| v-onboard-id | **PASS** (C1, C2 now real; no stand-ins left) |
| v-onboard-selfie | **PASS** (C2, C6 real; S-1 closed) |
| v-onboard-pending | **PASS** |
| x-location-disclosure | **PASS** (unchanged) |
| runner/shell (D-1) | **PASS** (unchanged) |
| v-jobs | **PASS** (m-6 closed; C4, C5 real) |
| v-job-detail | **PASS** (`NitumeFixedCta`) |

Still open: the bell route (with `v-notifications`); RA-4 and RA-5 (API).

### 17.4 Spec note (2026-10-19)
- `v-onboard-selfie.md` now has one submit-error copy, `Couldn't submit. Check your connection and try again.`, as a C-40 notice in the **danger** tone (the duplicate `We couldn't submit your application. Try again.` is removed). **m-7 (minor)**: the build shows it in the default tone (`onboard_selfie_screen.dart:152`); pass `tone: NitumeNoticeTone.danger`.

## 18. Owner answers rows 233–235 (2026-10-19), applied on `docs/owner-answers-14-specs`

Spec-only update; no screen re-audited.

### Decisions applied
| Row | Decision | Files |
|---|---|---|
| 233 | Refuse at quote and create a task whose location is inside no configured service area, with a clear customer message; until built, ops assign by hand, cancel or expire | System Design §2.2, §3.3; customer `v-new-review.md`, `_shared.md`; admin `drawer-task-requote.md`, `_shared.md`, `drawer-task-offer.md` |
| 234 | No admin feed item after the admin's own PAYMENT_CONFIRMED `Expire task` (as built) | System Design §3.3; admin `drawer-task-offer.md`, `_shared.md` |
| 235 | When the customer gives no deadline, the default 24 h starts at payment confirmation, not at creation | System Design §2.2, §3.3; customer `v-new-details.md`, `_shared.md`; admin `drawer-task-offer.md`; runner `_shared.md` |

The round-13 "pending BOARD row 234" notes (§16 items, admin round 13) are closed by row 234.

### API items for api-contract (numbered)
1. **Row 233, at create**:
   - `POST /errands` refuses a task whose first point (task site, else pickup, else drop-off; row 213) is inside no area of `RUNNER_SERVICE_AREAS`. Proposed: 422 (or 400) `location_outside_service_area` with the point type; api-contract names it.
   - Skip the check while the area list is empty (design-auditor reading of rows 177 and 179, not the owner's words: with no areas configured every task would be refused).
   - Also check on submit (DRAFT → REQUESTED) if the draft could have been created before areas were configured.
2. **Row 233, at quote**:
   - `POST /errands/:id/quote` (first quote and re-quote) refuses the same task with the same code.
   - Tasks created before the check exist and stay REQUESTED/QUOTED/ACCEPTED. They end by the customer's cancel after the notification (row 236, §18.1).
3. **Row 235**:
   - When the customer sends no `deadlineAt`, set `deadlineAt` = the PAYMENT_CONFIRMED time + 24 h, in the same transaction as ACCEPTED → PAYMENT_CONFIRMED.
   - Never move a deadline the customer chose.
   - **Storage (decided, owner 2026-10-19, row 239 (a))**: a task with no customer deadline keeps `deadlineAt` NULL until payment; the NOT NULL of row 221 is relaxed to a CHECK that allows NULL only before payment (DRAFT, REQUESTED, QUOTED, ACCEPTED) and on CANCELLED; at ACCEPTED → PAYMENT_CONFIRMED the API sets `deadlineAt` = payment time + 24 h. So "chosen" = `deadlineAt` non-null before payment; no new column and no `deadlineChosen` field.
   - The urgency derived from `deadlineAt` (row 51) is recomputed at payment.
   - The default value exposed for the customer caption (§16 item 3) stays 24 h.
4. **Backfill**: the row-221 backfill stands as built (migration `1790103300000`: open tasks `createdAt` + 24 h, closed tasks their closing time). Row 235 changes only the default for new tasks. Nothing to build.
5. **Row 234**: nothing to build (no feed item, as built).

### core-ui, flutter-customer, web-parity needs
- core-ui: map the new error code (`location_outside_service_area`) in `nitume_core` `ApiErrorCodes`. The default-deadline accessor (§16 core-ui item 2) is unchanged.
- flutter-customer:
  - `v-new-review`: the out-of-area notice and `Change location` (finding C-14-1, customer gap report).
  - `v-new-details`: the caption now says the window starts at payment (C-12-1, wording changed).
- web-parity: admin finding 33 (quote refusal copy, `drawer-task-requote.md`).

### New questions for the owner
- **AQ-33 (row 233 follow-up; BOARD row 236, answered 2026-10-19, §18.1)**: a task already REQUESTED or QUOTED that is refused at quote (created before the check, or after the areas changed) cannot be cancelled by ops: §3.3 lets only the customer cancel before payment. Options:
  - (a) tell the customer through a notification and let them cancel;
  - (b) add an admin REQUESTED/QUOTED → CANCELLED for this case (a state-machine change).
  Recommended (a) for MVP, since it needs no new transition. The copy would come in a later round.
- **AQ-34 (row 235 reviewer note; BOARD row 237, answered 2026-10-19, §18.1)**:
- **Backfill of paid tasks (BOARD row 238, answered 2026-10-19: keep as built)**: row 221's backfill (built) gives an existing paid, open task with no deadline `createdAt` + 24 h, which may already be in the past, so it lands in `Deadline passed` at once. Should such tasks instead get their PAYMENT_CONFIRMED time + 24 h, consistent with row 235? Recommended: only if live (non-dev) paid tasks exist; otherwise keep row 221 as built.
 payment is not refused after a deadline **the customer chose** has passed (for example `Today`, with the quote accepted the next day). Such a task reaches PAYMENT_CONFIRMED already past its deadline and can then only be expired by ops (row 201). Should the API refuse to start payment once the chosen deadline has passed, and ask the customer to pick a new one? Recommended yes. This is a payment-flow decision.

### 18.1 Owner answers rows 236–238 (2026-10-19)
| Row | Decision | Files |
|---|---|---|
| 236 | A task refused at quote (outside every service area): notify the customer and let them cancel; no admin cancel transition | System Design §3.3; admin `drawer-task-requote.md`; customer `x-awaiting-quote.md`, `v-notifications.md` |
| 237 | Refuse to start payment once a customer-chosen deadline has passed; ask for a new deadline | System Design §2.2; customer `x-awaiting-quote.md`, `v-payment.md` |
| 238 | The row-221 backfill stays as built (`1790103300000`) | System Design §2.2 |

API items (continuing §18):
6. **Row 236**:
   - When a quote is refused for `location_outside_service_area`, send the customer a notification through the notifications queue (BullMQ), once per task. Built so on the api branch, with event `service_area.outside`. Copy (row 241, decided 2026-10-19): title `We can't take this task`, message `Its location is outside the areas we serve. You can cancel it; you haven't paid anything.`. The built API wording is superseded and must change (§20).
   - Expose `outsideServiceArea: true` on the customer errand view (proposed field) so `x-awaiting-quote` shows the cancel state.
   - No state change and no admin cancel.
7. **Row 237**:
   - `POST /payments/:errandId/initiate` answers 409 (proposed `deadline_passed_before_payment`) when `deadlineAt` is non-null (= chosen, row 239) and has passed. No STK.
   - The customer sets a new deadline before payment (QUOTED or ACCEPTED) with `PATCH /errands/:id` `{ deadlineAt }` (built on the api branch). `null` = `Flexible`, so the 24 h starts at payment (rows 235, 239). Refuse a past value.
   - Who may edit the deadline: customer only (row 243, answered 2026-10-19, §19).
   - The quote stands (row 242, answered 2026-10-19).
8. **Row 238**: nothing to build.

Needs:
- core-ui: the new codes and fields (`deadline_passed_before_payment`, `outsideServiceArea`) and `ErrandRepository.setDeadline` (`PATCH /errands/:id` `{ deadlineAt }`); `Errand.deadlineAt` nullable before payment (row 239).
- flutter-customer: C-14-2 (`x-awaiting-quote` outside-area state, row 236), C-14-3 (`x-awaiting-quote` new-deadline step and `v-payment` refusal, row 237), the routing for the notification.
- web-parity: finding 33's copy is now complete (row 236).

Open owner rows (2026-10-19):
- 240: answered 2026-10-19: clear the backfilled deadline on unpaid tasks (§19).
- 241: answered 2026-10-19 with the owner's exact copy (§20).
- 242: answered 2026-10-19: keep the quote (§19).
- 243: answered 2026-10-19: customer only (§19).

### 18.2 Owner answer row 239 (2026-10-19)
- (a) decided: **Storage (decided, owner 2026-10-19, row 239 (a))**: a task with no customer deadline keeps `deadlineAt` NULL until payment; the NOT NULL of row 221 is relaxed to a CHECK that allows NULL only before payment (DRAFT, REQUESTED, QUOTED, ACCEPTED) and on CANCELLED; at ACCEPTED → PAYMENT_CONFIRMED the API sets `deadlineAt` = payment time + 24 h. So "chosen" = `deadlineAt` non-null before payment; no new column and no `deadlineChosen` field.
- Screens: before payment, a task with no customer deadline shows `No deadline yet` (proposed) on the customer checkout (`x-awaiting-quote`) and in the admin task drawer (`drawer-task-offer.md` `Deadline` row).
- Still open: rows 240–243 (§18.1 list).


## 19. Owner answers rows 240, 242–244 (2026-10-19), applied on `docs/owner-answers-15-specs`

Spec-only update; no screen re-audited. Row 241 (out-of-area notification copy) stays open.

### Decisions applied
| Row | Decision | Files |
|---|---|---|
| 240 | Clear the backfilled deadline on unpaid tasks so their clock starts at payment | System Design §2.2; admin `_shared.md`; customer `_shared.md`, `x-awaiting-quote.md` |
| 242 | Keep the quote when the deadline changes after quoting | System Design §2.2; customer `x-awaiting-quote.md`; admin `_shared.md` |
| 243 | Only the customer may set a new deadline before payment (no admin edit) | System Design §2.2; customer `x-awaiting-quote.md`; admin `_shared.md`, `drawer-task-offer.md` |
| 244 | The customer may switch the deadline back to `Flexible` (clear it) before payment | System Design §2.2; customer `x-awaiting-quote.md` |

Because of row 240, "chosen = `deadlineAt` non-null before payment" (row 239 (a)) now has no exception. The row-206 wording ("every task has deadlineAt") is linked to row 239 in System Design §2.2, customer `v-new-details.md` and `_shared.md`, admin `_shared.md`, and runner `_shared.md`. The REQUESTED/QUOTED-only cancel phrases now include ACCEPTED (`x-awaiting-quote.md` Data, `drawer-task-requote.md`).

### API items for api-contract (numbered)
1. **Row 240**: a data migration that sets `deadline_at` to NULL on unpaid tasks (DRAFT, REQUESTED, QUOTED, ACCEPTED) whose value is exactly the backfilled `createdAt` + 24 h. It must be reversible, within the row-239 CHECK. Report the row count in your HANDOFF.
2. **Row 243**: `PATCH /errands/:id` `{ deadlineAt }` is customer only. Admins get 403, or `deadlineAt` is ignored for them; api-contract's choice, stated in the contract. Today it allows admins.
3. **Row 244**: the same `PATCH` accepts `deadlineAt: null` before payment (back to `Flexible`). Today it refuses null. A past value stays refused.
4. **Row 242**: nothing to build (the quote is already kept).

### core-ui, flutter-customer, web-parity needs
- core-ui: `ErrandRepository.setDeadline(null)` allowed (clear).
- flutter-customer: C-15-1 (`x-awaiting-quote`): the new-deadline sheet keeps all three chips (`Flexible` sends null); the `Deadline` line in the checkout summary with a `Change` text button (proposed entry point, row 244); the quote stays as shown.
- web-parity: nothing (there is no admin deadline edit, and none may be added: row 243).

### Open owner rows
- 241: answered 2026-10-19 (§20). No open rows.


## 20. Owner answer row 241 (2026-10-19), applied on `docs/owner-answers-16-specs`
- Decided copy for the out-of-area customer notification (`service_area.outside`): title `We can't take this task`, message `Its location is outside the areas we serve. You can cancel it; you haven't paid anything.`.
- Files: System Design §3.3; customer `v-notifications.md`, `x-awaiting-quote.md` (the screen state uses the same words), `_shared.md`.
- Also fixed: the System Design §3.3 lead-in for row 236 now reads "REQUESTED, QUOTED or ACCEPTED".

API items (numbered):
1. Replace the built title and body of `service_area.outside` with the owner copy above (the built wording is superseded). Keep the queue delivery, once per task.

core-ui, flutter-customer, web-parity: nothing new. The customer app renders the API's title and body, and the `x-awaiting-quote` outside-area state (C-14-2) uses the same words.

Open owner rows: none from rounds 12–16.
