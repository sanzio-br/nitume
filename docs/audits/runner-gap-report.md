# Runner app — gap report (pre-build baseline)

- Date: 2026-10-13 · Auditor: design-auditor · Branch: `docs/owner-answers-6-runner-specs` (from `main` @ `95e9d6c`)
- Mockup: `docs/design/nitume_runner_app.html` · Specs: `docs/specs/runner/` (`_shared.md` + 20 screen specs)
- Checked: `packages/nitume_core/lib/src/**`, `apps/api/src/**` on `main` (read-only). `feat/api-owner-answers-6` had no commits yet when checked; the payout-ledger endpoints below are named from what the screens need.

## 1. Verdict

**FAIL — not built.** `apps/runner_app` does not exist. Every runner view is `missing`. Nothing to audit for tokens, typography, contrast or reuse yet; the specs set those rules (`_shared.md` §2–§4) for the build.

| View | Spec | Status | Blocked by |
|---|---|---|---|
| v-auth-phone | `docs/specs/runner/v-auth-phone.md` | missing | scaffold, R-17 |
| v-auth-otp | `docs/specs/runner/v-auth-otp.md` | missing | scaffold; RA-9 (recommended), RQ-15 |
| x-name-capture (not drawn) | `docs/specs/runner/x-name-capture.md` | missing | scaffold |
| v-onboard-id | `docs/specs/runner/v-onboard-id.md` | missing | RA-7, RQ-13, RQ-14, RQ-12; R-13, R-15 |
| v-onboard-selfie | `docs/specs/runner/v-onboard-selfie.md` | missing | RA-7, RA-8, RQ-13, RQ-14 |
| v-onboard-pending | `docs/specs/runner/v-onboard-pending.md` | missing | RA-8 (phone and payment-identity records); R-05 |
| v-jobs | `docs/specs/runner/v-jobs.md` | missing | **RQ-1**, RA-1, RA-2, RA-3, RA-5, RA-8; R-02, R-04, R-14 |
| v-job-detail | `docs/specs/runner/v-job-detail.md` | missing | **RQ-1**, RA-1, RA-2, RA-3; R-05, R-16 |
| v-active | `docs/specs/runner/v-active.md` | missing | RA-2, RA-4, RA-5, RA-11, RA-17; RQ-8, RQ-11, RQ-12, RQ-20; R-01, R-06, R-07, R-09, R-16, R-20, R-21 |
| v-evidence-capture | `docs/specs/runner/v-evidence-capture.md` | missing | **RA-11** (upload size), RQ-9, RQ-12; R-13, R-15, R-22 |
| v-price-request | `docs/specs/runner/v-price-request.md` | missing | RA-2 (item amount), RA-5 (decision event) |
| v-job-summary | `docs/specs/runner/v-job-summary.md` | missing | RA-2, RA-14/RA-16; RQ-7 |
| v-earnings | `docs/specs/runner/v-earnings.md` | missing | RA-14 (in progress on `feat/api-owner-answers-6`); R-08, R-11, R-12 |
| v-payout | `docs/specs/runner/v-payout.md` | missing | **RQ-5**, RA-15; RQ-6 |
| x-payout-history (not drawn) | `docs/specs/runner/x-payout-history.md` | missing | RA-14 |
| v-notifications | `docs/specs/runner/v-notifications.md` | missing | RA-6 (runner kinds) |
| v-profile | `docs/specs/runner/v-profile.md` | missing | RA-10, RA-18; RQ-3; R-10, R-14 |
| v-edit-skills | `docs/specs/runner/v-edit-skills.md` | missing | **RQ-3**, RQ-4, RA-10 |
| x-location-disclosure (not drawn) | `docs/specs/runner/x-location-disclosure.md` | missing | RQ-11, RQ-12 |
| shell (4-tab bar) | `docs/specs/runner/_shared.md` §1 (C-13) | missing | scaffold |

Screens that can be built first with no owner answer and no API change: v-auth-phone, v-auth-otp (client-side role check), x-name-capture, v-notifications (generic feed; runner kinds arrive later), v-profile (stats, menu; skills tags from the public profile), the shell. Then v-earnings / x-payout-history once RA-14 lands.

## 2. App scaffold (flutter-runner)

`apps/runner_app` must be created, mirroring `apps/customer_app` (`_shared.md` §12): Flutter app depending on `packages/nitume_core` by path, `--dart-define-from-file=.env` with a committed `.env.example` (row 59), `.env` gitignored, AppScope + ChangeNotifier (row 58), separate Android/iOS application ids, FCM config not committed, `README.md`, `test/`. `flutter analyze` clean and a smoke test before any screen work.

## 3. Shared widget gaps (core-ui)

From `_shared.md` §4. **NEW**: R-01 runner status presentation, R-02 AvailabilityCard, R-04 JobOfferCard, R-05 InfoRow, R-06 NavigationChip, R-07 ChecklistStepCard, R-08 BalanceCard, R-09 ActionRowCard (or C-24 with subtitle + icon), R-10 StatTile/StatRow3, R-11 WeeklyBarChart, R-12 LedgerLineRow, R-13 CaptureDropZone, R-14 NitumeTag, R-15 CaptureThumbnail, R-16 JobRouteMap, R-18 EAT/distance/duration formatters, R-19 runner data layer (repositories, models, realtime event names), R-20 LocationPinger, R-21 OfflineActionQueue, R-22 EvidenceUploader. **Change**: R-17 `NitumeWordmark(suffix:)`, C-24 `MenuRow` subtitle (if R-09 reuses it), C-31 self-position marker. Everything else is reused from C-01 … C-40 as built.

Design replacements the builders must apply (mockup → design system, `_shared.md` §2): category tag and skill/area badges are not green; chart bars not green; `Mark task complete` is a primary pill button, not a green card; translucent white buttons on the balance card become outline buttons; `#AEB9CC` → blue-050; `#EAEEF4` → blue-050; no shadows; all buttons pill; verification statuses as chips; emoji → icons.

## 4. Endpoint and socket gaps (api-contract): RA-1 … RA-20

Status: **exists** (on `main`, usable as is) · **mismatch** (exists, wrong shape or rule) · **missing** · **in progress** (`feat/api-owner-answers-6`).

| Id | Need | Today | Status | Screens |
|---|---|---|---|---|
| RA-1 | Job offers: `GET /runners/me/offers`; `POST /errands/:id/accept` (named in §3.2); `POST /errands/:id/decline` `{ reason }` (`too_far`, `not_available`, `over_purchase_limit`, `other`); offer expiry; refuse a second active job (`runner_busy`) if one-at-a-time is kept | No offer flow: `POST /errands/:id/assign` (admin) creates an `assigned` assignment and moves PAYMENT_CONFIRMED → RUNNER_ASSIGNED in one step (`errands.service.ts:1406-1442`); `AssignmentStatus.OFFERED/DECLINED/EXPIRED` exist but are never used; a runner cannot see an errand until it is assigned (`canView`) | missing (depends on RQ-1) | v-jobs, v-job-detail |
| RA-2 | Runner job projection: `runnerFee`, `itemAmount` (current, after approved changes), `merchantRoute`, `maxPurchaseAdvance`/`overPurchaseLimit`, `offerExpiresAt`; **without** `feeTotal`, service fee or customer contact | `GET /errands/:id` returns the customer `ErrandView` to the current runner, including `feeTotal` (the customer's fee total, which runners must not see) and no runner fee, item amount or route; `GET /payments/:errandId` refuses runners (`payments.service.ts:1101-1107`) | mismatch | v-job-detail, v-active, v-price-request, v-job-summary |
| RA-3 | Purchase limit (row 108): accept refused above `maxPurchaseAdvance` on `send_to_runner` (`purchase_limit_exceeded`) unless the owner allows it (RQ-1 b); decline with `over_purchase_limit` never counts against the runner; matching excludes or flags such runners | `runner_profiles.maxPurchaseAdvance` exists (default 3000) and is returned raw by `GET /runners/me`; nothing reads it | missing | v-jobs, v-job-detail |
| RA-4 | `location:ping` intake (§4.2): Redis GEO, `currentLocation`/`lastPingAt` sampling, fan-out `location:update` to `errand:{id}`, geofenced ARRIVED (system) (§4.3) | Gateway has only the push side; "Producer (runner `location:ping`) not built yet" (`realtime.gateway.ts:128`). BOARD Needs row 54 | missing (known) | v-active (customer v-track too) |
| RA-5 | Runner socket room `runner:{runnerId}` joined on connect; events `job:offered`, `job:offer_withdrawn`, `price_change:decided` (`approved`/`rejected`, with `toPrice`), `payout:updated` | Only `errand:{id}` rooms and the `admins` room; no runner room; price-change decisions emit nothing to the runner (approval changes no state) | missing | v-jobs, v-job-detail, v-active, v-price-request, v-earnings |
| RA-6 | Runner notification kinds + push copy (list in `v-notifications.md`): offer, assigned, customer confirmed, payable, cancelled, failed, disputed/resolved, price change decided, payout sent/reversed/re-sent/corrected, reimbursement on hold/approved, rating received, verification approved/rejected. `KSh` in text (row 82) | Notification worker writes customer copy only (`notifications.service.ts:462-483` `statusCopy`), status changes notify the customer only; feed endpoints work for any role | missing | v-notifications, push deep links |
| RA-7 | Verification document upload to restricted storage (system design §10): ID front + back, selfie; returns document keys; `POST /runners/me/verifications` accepting several keys; optional runner-safe rejection reason | `AddVerificationDto { verificationType, documentS3Key? }` (one key); no upload endpoint; evidence storage (Cloudinary/console) is not the restricted store | missing / mismatch (RQ-13) | v-onboard-id, v-onboard-selfie, v-onboard-pending |
| RA-8 | Verification gate (non-negotiable "no ID-verification bypass"): refuse `availability: online`, offers and accept unless verified (RQ-14 definition); auto-create `phone` (approved at OTP sign-in) and `payment_identity` (pending) records; `POST /runners/me/verifications/submit` notifying ops | `setAvailability` has no verification check (`runners.service.ts:150`); no phone or payment-identity records are created | missing | v-jobs, v-onboard-selfie, v-onboard-pending |
| RA-9 | `POST /auth/otp/verify` with `role: runner` on an existing customer phone: refuse with `role_mismatch` (no tokens issued) | Existing users sign in with their stored role; the `role` field only applies to new users (`auth.service.ts:108-131`) | mismatch (RQ-15) | v-auth-otp |
| RA-10 | Skills and areas readable on `GET /runners/me`; area options `GET /runners/service-areas`; skill vocabulary per RQ-3 | `GET /runners/me` returns the entity only; `PUT /runners/me/skills` uses `RunnerSkill` (`shopping, pickup_delivery, inspection, documents, property_visits, queuing, business_errands`), not the six categories; areas are free text, no option list | mismatch / missing (RQ-3, RQ-4) | v-edit-skills, v-profile, v-jobs |
| RA-11 | Evidence: accept real photo sizes (raise the JSON limit for this route, or multipart / signed upload URL as §3.2 `POST /evidence/:errandId/upload-url` + `/confirm`); state guard for runner uploads (ARRIVED, IN_PROGRESS; receipts also AWAITING_CUSTOMER); §3.3 guard "IN_PROGRESS → AWAITING_CUSTOMER requires evidence" (+ a receipt on `send_to_runner`, rows 95, 105) | `POST /errands/:id/evidence` takes base64 JSON with no body-size configuration (Nest default 100 kB) and no state check (`evidence.service.ts:63-80`); the transition does not check evidence | mismatch | v-evidence-capture, v-active |
| RA-12 | Receipt upload by the assigned runner after CANCELLED/FAILED for row 106 claims, creating an `on_hold` reimbursement line (only if RQ-17's default is approved) | Not possible (access and state) | missing (RQ-17) | v-active |
| RA-13 | Runner notes | `PATCH /errands/:id/runner-notes` (ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER; ≤ 2000) | exists | v-active |
| RA-14 | Payout ledger reads (row 107): `GET /runners/me/earnings` `{ availableAmount, pendingAmount, onHoldAmount, week[7] (EAT days, runner-fee only), weekTotal }`; `GET /runners/me/payout-lines?kind=&errandId=&cursor=` `{ id, kind, status, amount (signed), errandId, errandTitle, reference, relatedLineId, createdAt, payableAt, paidAt }`; available amount computed from lines, never stored | `runner_payout_lines` approved 2026-10-13 | in progress (`feat/api-owner-answers-6`; match these names or tell design-auditor the final ones) | v-earnings, x-payout-history, v-job-summary |
| RA-15 | Runner payout request: `POST /runners/me/payouts` `{ amount }` + `Idempotency-Key`; `GET /runners/me/payouts`; errors `payout_exceeds_available`, `payout_below_minimum`, `payout_already_open`; ops record the M-Pesa receipt | Nothing | missing (RQ-5; needs a payout-request record, schema not covered by row 107) | v-payout, v-earnings |
| RA-16 | Per-errand ledger state on the runner job view (`payoutLines[]` for that errand) | — | missing (with RA-14) | v-job-summary |
| RA-17 | Idempotent runner transitions for offline replay: `Idempotency-Key` on `PATCH /errands/:id/status`, or "already in the target state by the same actor" answered as success | Replaying a transition answers 409 | missing | v-active (offline queue) |
| RA-18 | `GET /runners/me` as a runner view: `shortName` (row 40), skills, areas, verification summary (`verified: boolean`, per-type status) | Raw entity | mismatch | v-profile, v-jobs |
| RA-19 | Dispute read with the resolution note (row 79) | `GET /errands/:id/dispute` allows the runner; `resolvedBy: null` (row 101) | exists | v-active |
| RA-20 | Availability semantics: `busy` set by the server while the runner holds an active job; refuse `offline` with an active job (or define what happens) | Runner may set any value including `busy` | mismatch | v-jobs, v-profile |

Also exists and used as is: `POST /auth/otp/request`, `POST /auth/refresh`, `POST /auth/logout`, `GET/PATCH /users/me`, `POST/DELETE /users/me/devices` (runner allowed), `GET /notifications*` (any role), `PATCH /runners/me/availability`, `GET/POST /runners/me/verifications`, `PUT /runners/me/skills|service-areas`, `GET /runners/:id/profile`, `GET /errands` (runner-scoped to the current assignment), `GET /errands/:id/history`, `PATCH /errands/:id/status` (actor-checked), `GET /errands/:id/evidence`, `GET/POST /errands/:id/price-change` (runner: IN_PROGRESS, Buy For Me / Get It For Me), `GET /errands/:id/tracking`, `GET /errands/:id/rating`, socket `errand:join/leave`, `errand:status_changed`, `evidence:uploaded`, `errand:access_revoked`.

Admin follow-up (no spec yet): ops need a place to review `on_hold` reimbursement lines (rows 105, 106), runner payout requests (RQ-5) and payouts, and the M-Pesa identity match (RQ-14). design-auditor can spec these as admin views once RA-14/RA-15 exist.

## 5. Questions for the owner: RQ-1 … RQ-21

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
