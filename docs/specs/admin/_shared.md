# Admin ops dashboard: shared conventions for the 2026-10-08 ops features

- Surface: `apps/admin` (Angular 22, standalone components, signals). Read-only reference for this spec: branch `docs/customer-answers-2`.
- Mockup: `docs/design/nitume_admin_dashboard.html`. **None of the features in this spec set are drawn in the mockup.** Each spec places them into the panels and drawers the mockup does draw (`#p-queue`, `#p-disputes`, `#drawer-task`, `#drawer-dispute`) and marks every place it goes beyond the mockup with **EXTENDS MOCKUP**. Copy is **(proposed)** unless marked **(mockup)**.
- Design system: `docs/design/nitume_design_system.html` wins on styling; the mockup wins on content and flow where it says anything.
- API source: branch `feat/api-owner-answers-2` (`apps/api/src/payments/refunds.*`, `errands.controller.ts`, `matching.controller.ts`, `errands.service.ts`). Paths below are relative to `/api/v1`.
- Specs in this set: `p-refunds.md`, `drawer-refund.md`, `drawer-task-merchant-details.md`, `drawer-task-requote.md`, `drawer-dispute-outcome.md`.

## 1. Owner decisions these specs implement

| BOARD row | Decision (quoted or summarised from BOARD.md) | Used in |
|---|---|---|
| 34 | Fee components are internal; customer-facing shows "Total (service + runner fee)" until pricing rates exist | drawer-refund, drawer-task-requote |
| 36 | Dispute: runner-favourable → COMPLETED; customer-favourable → CANCELLED | drawer-dispute-outcome |
| 37 | Cancel after payment goes to an admin refund review; admin sets the refund amount, up to a full refund | p-refunds, drawer-refund |
| 42 | send-to-runner is platform-mediated: the customer pays Nitume, never the runner directly | drawer-refund (what was paid to Nitume) |
| 43 | Merchant/admin owns and supplies the Till/Paybill details; the customer only selects the route | drawer-task-merchant-details |
| 46 | Expired quotes cannot be accepted (`quote_expired`); a fresh quote is required | drawer-task-requote |
| 48 | A price **decrease** opens an admin refund review for the difference | p-refunds (trigger list; not yet in the API, see §7) |
| 50 | Dispute window restarts after a dispute resolves to COMPLETED where applicable | drawer-dispute-outcome |
| 54 | Refund payout recorded manually for MVP; customer sees refund status; B2C/reversal later | drawer-refund |
| 56 | §3.3 updated: DISPUTED → COMPLETED / CANCELLED (admin, with written rationale) | drawer-dispute-outcome |
| 62, 71, 94 | Schema approved: several `refund_reviews` per errand, trigger `price_change_decrease`, `payments.priceChangeRequestId` | p-refunds, drawer-refund |
| 66 | System design §2.2/§6: send-to-runner is platform-mediated; the customer pays Nitume and Nitume pays the runner through the payout ledger | drawer-refund (§3 flows) |
| 67 | A `merchant_direct` price increase is paid manually by the customer to the same Till | drawer-task-merchant-details |
| 68 | After `quote_expired` the customer taps "Request a new quote"; the task is then available for an admin to re-quote | drawer-task-requote |
| 69 | "Admin refund decision notes remain internal and are not exposed to the customer." | drawer-refund |
| 72 | Admin re-quote while the task stays ACCEPTED (no ACCEPTED → QUOTED); the customer must accept/pay the new quote | drawer-task-requote |
| 77 | "Any authorized admin with the appropriate refund/payout permission may approve refunds and record payouts. No second-admin approval threshold is required for now. Put Refunds under Payments." | §2, p-refunds, drawer-refund |
| 78 | "Rename 'Refund customer' to 'Side with customer'" | drawer-dispute-outcome |
| 79 | "Both the customer and runner may see the dispute resolution note. Internal admin-only notes remain separate." | drawer-dispute-outcome |
| 80 | "Merchant amounts apply to Buy For Me and Get It For Me. If merchant details change after a merchant-direct payment has started, warn the customer rather than blocking the change." | drawer-task-merchant-details |
| 81 | "Include the item amount already paid to Nitume in the refund ceiling even when the runner has already purchased the item." | drawer-refund |
| 82 | "Use KSh in notifications. A payout receipt cannot be edited after the task reaches refunded; any correction must use an auditable correction/reversal process." | §3, drawer-refund |
| 83 | "Every quote requires an expiry, defaulting to 24 hours. expiresAt = null is not valid for quotes that can be replaced." | drawer-task-requote |
| 86 | Decrease refund reviews only on `send_to_runner` tasks; an admin can still record KSh 0 where applicable | §6, p-refunds, drawer-refund |
| 87 | "The cancellation refund ceiling must be based on the customer's remaining refundable exposure after all previous refunds, including approved decrease refunds, so cumulative refunds cannot exceed the amount actually paid." | drawer-refund, p-refunds |
| 88 | Admin re-quote only after the existing quote has expired; a still-valid quote is never silently replaced | drawer-task-requote |
| 95 | "Runner send_to_runner item amounts are reimbursed after the receipt is uploaded/accepted, not advanced before purchase." | §3 |
| 96 | "Admin times should be displayed in 12-hour East Africa Time (EAT), while backend timestamps remain canonical." | §3.1, A-13 |
| 98 | Socket.IO Redis adapter not approved yet: the API stays single-instance until horizontal scaling is required | §7 (note) |
| 100 | "Build the auditable correction/reversal schema now. Original payout/receipt records remain immutable; corrections/reversals are represented separately." | drawer-refund (Corrections), §6, §7 N-15 |
| 101 | Round-4 breaking API changes accepted as specified (customer/runner `resolvedBy: null` on disputes; no `payoutReference` in customer refund views; price changes outside Buy For Me / Get It For Me answer 400) | (no admin change) |
| 102 | "Paid tasks ending CANCELLED, EXPIRED, or FAILED should create a refund review. This is a review trigger, not an automatic refund." | §6, p-refunds, drawer-refund |
| 104 | "'Accepted' for runner item reimbursement means the task reaches CONFIRMED: receipt uploaded, customer confirmed, dispute window closed, and no dispute." | §3 |
| 105 | "A missing or mismatched receipt is not automatically payable and requires ops review. Any approved reimbursement is capped at the item amount actually paid to Nitume." | §3 |
| 106 | Runner already bought the item and the task ends CANCELLED or FAILED: "reimburse the runner for verified eligible out-of-pocket item expenditure, subject to the applicable caps/evidence requirements. Do not pay the runner service fee." | §3 |
| 107 | "Approve the runner payout ledger table. Build it now. It must support distinct financial lines for runner fee, item reimbursement, corrections, reversals, and re-sent payouts." | §3, p-runner-payouts, drawer-runner-payout |
| 108 | "Runner out-of-pocket purchases are limited by max_purchase_advance, and a runner may decline a task when the required purchase exceeds their configured limit." | §3 |
| 109 | "Customer notification is required for a re-sent payout. Internal payout corrections/reversals do not notify the customer by default." (AQ-9) | drawer-refund |
| 110 | "A correction must not record an amount above the applicable refund ceiling." (AQ-10) | drawer-refund |
| 111 | "A reversed, not-yet-re-sent payout remains committed at the decided refund amount until the obligation is resolved/re-sent, and therefore continues to count against the cumulative refund cap." | §3, drawer-refund |
| 112 | "Approve. Admin runner payout ledger and reimbursement ops-review screens are in scope." | p-runner-payouts, drawer-runner-payout, p-payout-requests, drawer-runner-purchase-limit |
| 113 | Offer model: offers inside RUNNER_ASSIGNED; accept → RUNNER_EN_ROUTE; decline → stays RUNNER_ASSIGNED, reassigned; lapse → the offer expires and the task stays RUNNER_ASSIGNED (rows 150, 155, 157); accept above the purchase limit refused | drawer-task-offer |
| 117 | Runner payout requests up to the available amount, configurable minimum, one open request, ops pay manually, own auditable record | p-payout-requests |
| 118 | Payout destination fixed to the runner's sign-in phone | p-runner-payouts, p-payout-requests |
| 135 | Over-limit purchase at CONFIRMED → ops review; maximum claimable = min(item amount paid to Nitume, `max_purchase_advance`) | drawer-runner-payout |
| 136 | "Add a task-level combined financial exposure cap covering the customer refund and the runner item reimbursement on CANCELLED/FAILED tasks … Cases above the normal cap require ops review and explicit handling." | drawer-runner-payout, drawer-refund (amendment) |
| 148 | (2026-10-16) "Keep the combined cap on every task (as built); override covers exceptions; no cancellation-specific implementation." | drawer-runner-payout, drawer-refund (no UI change: built that way) |
| 145, 160 | (2026-10-16) Override table approved: the existing append-only `task_exposure_overrides` with the extra audit columns (`runnerProfileId`, `assignmentId`, `limitAtTime`, `requestedAmount`); **no `scope` column** (task-level exceptions only). Row 189 (decided 2026-10-16): no `updatedAt` on the append-only table | drawer-runner-payout, drawer-refund |
| 138 | "KES 3,000 default, configurable per runner by admins. Changes audited with actor, timestamp, previous and new value. Runners cannot change their own limit." | drawer-runner-purchase-limit |
| 140 | (2026-10-16) "A runner-favour dispute keeps the runner eligible for the applicable payout/reimbursement; the dispute outcome does not cancel an otherwise valid runner payout." | drawer-dispute-outcome (no change) |
| 141 | (2026-10-16) "At the acceptance deadline with no acceptance the offer expires […]; no runner acceptance after expiry." Its "the task goes EXPIRED at once" is superseded by rows 150 (auto-offers) and 157 (admin offers) | N-20, drawer-task-offer, p-refunds (`Task expired` reviews) |
| 150 | (2026-10-16) An auto-offer expires at its window end, then the system offers the next eligible runner; the task goes EXPIRED only when no eligible runners remain. Admin offers keep the 10-minute window | N-20 |
| 151 | (2026-10-16) Above-limit approvals stored in the existing override/audit table `task_exposure_overrides`; record at least task/assignment, runner, previous limit, requested and approved amount, reason, approving admin, time; no second approver or extra role | N-21, drawer-runner-payout |
| 152 | (2026-10-16) Option (b): a column stores `max_purchase_advance` when the payment/reimbursement obligation is created; an existing review is never recalculated with a later limit (created at KSh 3,000, later 5,000 → stays 3,000) | N-21, drawer-runner-payout, drawer-runner-purchase-limit |
| 153 | (2026-10-16) Payout request table approved: `requested_amount` and `paid_amount` separate; paid below the request closes PAID, the difference stays available for a later request | N-17, p-payout-requests |
| 154 | (2026-10-16) ID/selfie design approved: private storage on the existing object-storage provider (private objects + signed URLs; no new provider unless needed), config-driven retention initially 12 months, daily purge, access only signed/admin-authorised and logged | p-runners-verification-documents |
| 155 | (2026-10-16) A decline starts or changes no expiry deadline; the task stays RUNNER_ASSIGNED while eligible runners remain and the system keeps offering/reassigning; EXPIRED only when no eligible runners remain "or the applicable task deadline is reached". The deadline clause is decided by row 185 (customer `deadlineAt` reached with no runner accepted → EXPIRED; the deadline takes precedence) | N-20 |
| 156 | (2026-10-16) Offers made before the deadline change keep no deadline (dev/test data); no migration; every new offer has one | N-20 |
| 157 | (2026-10-16) Option (b): "an admin offer that reaches its deadline expires, but the task stays RUNNER_ASSIGNED so the admin can offer/reassign another runner; EXPIRED only when the task/matching process finds no further runner can be assigned." The EXPIRED trigger is defined by row 167 (matching exhausted) | N-20, drawer-task-offer |
| 158 | (2026-10-16) Owner copy: OTP SMS `Your Nitume verification code is {{code}}. It expires in 5 minutes. Do not share this code with anyone.`; runner ID/selfie privacy statement; customer `errand.EXPIRED` body (no refund sentence) | N-22 (no admin UI copy) |
| 159 | (2026-10-16) Payout request minimum **KES 500**, server-side config (recommended `MIN_RUNNER_PAYOUT_REQUEST`), not hard-coded; **no admin UI** for now | p-payout-requests (the proposed `Minimum payout request` setting is dropped) |
| 161 | (2026-10-16) ID/selfie retention clock restarts only on a new/replacement ID, a new/replacement selfie, a verification/re-verification started, or an admin verification review that needs the stored evidence; viewing never restarts it. After the purge the images are deleted permanently; only minimum audit metadata is kept (status, outcome, timestamps, reviewer/admin id, purge timestamp, evidence type, audit/event ids) | p-runners-verification-documents, N-23 |
| 162 | (2026-10-16) ID documents isolated from ordinary media; if Cloudinary stays, a separate restricted credential with minimum permissions; backups/version history must not defeat the purge | N-23 (backend) |
| 163 | (2026-10-16) 10 MB per ID/selfie image, enforced server-side and in the client | (runner app; no admin UI) |
| 165 | (2026-10-16) `createdByUserId` (the submitting runner, server-side, immutable) and `updatedAt` on payout requests | p-payout-requests |
| 166 | (2026-10-16) Ops-only cancel of an open payout request with a mandatory free-text reason; PENDING (= built `requested`) → PAID \| REJECTED \| CANCELLED, all terminal; `requested_amount` unchanged; record `cancelledByUserId`, `cancelledAt`, `cancellationReason`; the runner cannot cancel and submits a new request if still owed; no reopening | p-payout-requests, N-17 |
| 167 | (2026-10-16, AQ-12) "RUNNER_ASSIGNED → EXPIRED only when matching is exhausted: every eligible runner in the configured service-area/category pool has declined, let the offer lapse, or become ineligible/unavailable before accepting. A decline or lapse never expires the task by itself; keep offering/reassigning while eligible runners remain. No separate task deadline is required for this rule." (no new deadline for this rule; `deadline_at` is a separate trigger, row 185, decided) | N-20, drawer-task-offer |
| 177 | (2026-10-16, AQ-17) An offline runner is unavailable and never in the pool; pool = online, eligible for the category, inside the service area once areas exist, otherwise available. Offline runners don't block exhaustion | N-20, drawer-task-offer |
| 178 | (2026-10-16, AQ-18) A runner who declined or let an offer lapse for a task is excluded from later offers for that task | N-20, drawer-task-offer (Reassign list) |
| 179 | (2026-10-16, AQ-19) No automatic expiry until service areas and the full eligible pool exist; tasks may stay RUNNER_ASSIGNED meanwhile; then row 167 applies | N-20, drawer-task-offer |
| 180 | (2026-10-16, AQ-20) `POST /runners/verifications/:id/re-review` approved; optional admin note, max 500, no minimum; the action is logged | N-23, p-runners-verification-documents |
| 181 | (2026-10-16, AQ-21) A re-review never changes the decision; status changes go through the verification decision workflow | N-23, p-runners-verification-documents |
| 168 | (2026-10-16, AQ-13) The runner never sees the ops cancellation reason; the runner sees a generic "Payout request cancelled"; the reason is visible to authorised ops/admin for audit | p-payout-requests, N-17 |
| 169 | (2026-10-16, AQ-14) Cancellation reason: 10–500 characters, mandatory, whitespace-only invalid | p-payout-requests, N-17 |
| 170 | (2026-10-16, AQ-15) The verification reviewer note is deleted with the evidence at purge; keep only status/outcome, timestamps, reviewer identity, purge timestamp, evidence type, event ids | p-runners-verification-documents, N-23 |
| 171 | (2026-10-16, AQ-16) The decision on a pending verification is the initial review; a later review of stored evidence needs an explicit, audited "Re-review evidence" action (admin, timestamp, verification/evidence reference, review event). Viewing never restarts the clock | p-runners-verification-documents, N-23 |
| 175 | (2026-10-16, RQ-30) Keep both purge guards: never purge a PENDING verification or evidence tied to an open dispute; they take precedence over the retention purge | N-23 |
| 176 | (2026-10-16, RQ-31) Customer label during RUNNER_ASSIGNED is "Finding a runner"; "Runner assigned" only once a runner has accepted (RUNNER_EN_ROUTE). Customer-facing only: the admin keeps `Assigned` and the offer sub-state chips | none (admin unchanged) |
| 185 | (2026-10-16) "RUNNER_ASSIGNED has two independent paths to EXPIRED: (1) the customer deadlineAt is reached with no runner accepted; (2) matching exhausted. The deadline takes precedence: once deadlineAt has passed the task is no longer offered or reassigned. A single lapse or decline still never expires the task." RUNNER_ASSIGNED only | N-20, drawer-task-offer (`Deadline` row, Deadline passed sub-state and EXPIRED variant, read-only, no Reassign; queue chip; 409 `task_deadline_passed`) |
| 186 | (2026-10-16) A runner whose `max_purchase_advance` is below the task's required purchase is ineligible for the pool unless an approved exception exists; never offered; a purchase-limit decline is never penalised | N-20, drawer-task-offer (Reassign list greys them with the reason; 409 `runner_not_eligible` `over_purchase_limit`) |
| 187 | (2026-10-16) (a) never expire just because no eligible runner is online now; re-check, no time rule; (b) a paid task that cannot be offered never auto-expires, no PAYMENT_CONFIRMED → EXPIRED (the system still never does; row 201 adds an admin-only PAYMENT_CONFIRMED → EXPIRED after the deadline); (c) a runner on another accepted/active task is not eligible. Admin action "Expire task — no runner available" approved: audited (admin, timestamp), only when the task is genuinely eligible for expiry. RUNNER_ASSIGNED → EXPIRED actor now S, A (System Design §3.3) | N-20, drawer-task-offer (expire action, confirm, result, activity) |
| 188 | (2026-10-16) Exact notification titles, no status suffix: `Runner assigned`, `No runner available` | none (customer copy) |
| 189 | (2026-10-16) No `updatedAt` on the append-only `task_exposure_overrides` | drawer-runner-payout, drawer-refund (no UI change) |
| 190 | (2026-10-16) An open dispute is a legal/audit hold on ID images: no purge while open; normal rules resume when closed | p-runners-verification-documents (no UI change) |
| 191 | (2026-10-16) Only verification activity that creates or replaces stored ID/selfie evidence restarts the retention clock (payment identity only when it reuses the retained evidence); only reviews of the stored ID/selfie count; views and unrelated admin actions never do | p-runners-verification-documents, N-23 (built on `main`) |
| 192, 193 | (2026-10-16) Cloudinary's internal disaster-recovery copies are an external dependency; verify Cloudinary's deletion and backup behaviour before production; the app purge still deletes the asset. Console checklist approved (ID-only key, `CLOUDINARY_ID_*`, `RUNNER_ID_STORAGE_DRIVER=cloudinary`, Settings → Backup, ask Cloudinary support); owner action, recorded in System Design §10 | N-23 (no UI) |
| 194 | (2026-10-16) Runner notification when ops cancel a payout request: `Payout request cancelled` / `Your payout request was cancelled by Nitume operations.`; never the reason | p-payout-requests (what the runner is told) |
| 195, 200 | (2026-10-16) ID image `side`, required for ID images; `front` / `back` lowercase on the wire and in the DB; UI `Front` / `Back` | p-runners-verification-documents (type label) |
| 196, 198, 199 | (2026-10-16) Test isolation: dedicated test queue prefix `nitume_test:*`; dedicated test database, append-only protections never disabled in dev; teardown deletes only `nitume_test:*` keys | none (testing, System Design §8) |
| 197 | (2026-10-16) An ops cancel (or expiry) before any accept gives the offered runner no receipt upload and no claim; no reimbursement just because an offer existed | drawer-runner-payout (no UI change) |
| 201, 214 | (2026-10-19) "keep PAYMENT_CONFIRMED for ops after the deadline; never auto-expire it; add an ops feed item 'Deadline passed'. Exit = new Admin 'Expire task' action from PAYMENT_CONFIRMED after the deadline (new §3.3 transition PAYMENT_CONFIRMED → EXPIRED, actor Admin — approved by this answer), not the indirect assign→expire path." Assign refused after the deadline. Feed body approved (row 220): `The customer's deadline for {ref} passed before a runner was assigned. Expire the task or contact the customer.` | N-20, drawer-task-offer (`Deadline passed` chip, no `Assign`, `Expire task` with the same dialog and required 10–500 reason (row 225), Expired by ops after the deadline) |
| 202 | (2026-10-19) "Expire task — no runner available": RUNNER_ASSIGNED, no open offer, deadline not passed, no eligible online runner left; offline/busy runners do not prevent it | drawer-task-offer |
| 203 | (2026-10-19) Expire reason required, 10–500 characters | drawer-task-offer, N-20 |
| 204 | (2026-10-19) Offline/busy runners do not block exhaustion; only eligible online runners count | N-20, drawer-task-offer (Data) |
| 205 | (2026-10-19) An open offer ends at once when `deadlineAt` passes; `offerExpiresAt` never beyond the deadline | N-20, drawer-task-offer (`Offer ends`, Reassign line) |
| 206 | (2026-10-19) Every task has `deadlineAt`, required at creation, contract default when the customer gives none; no indefinite tasks. Read with rows 235, 239 (a), 240: the default is 24 h from payment, NULL before payment (CHECK), backfilled unpaid values cleared | drawer-task-offer (`No deadline yet` before payment) |
| 207 | (2026-10-19) No pre-offer purchase-limit exception; runners below the limit stay ineligible | drawer-task-offer (Reassign list) |
| 208 | (2026-10-19) RUNNER_ASSIGNED → EXPIRED by System or Admin confirmed | none (System Design §3.3) |
| 210 | (2026-10-19) Decline reasons `over_purchase_limit`, `too_far`, `not_available`, `other` (schema approved); runner reason picker | drawer-task-offer (`Reason` labels) |
| 211 | (2026-10-19) Only RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS make a runner busy | drawer-task-offer (Reassign list) |
| 212, 213 | (2026-10-19) Service areas stay server config `RUNNER_SERVICE_AREAS` (no table, no admin screen); an area is a circle (centre + radius km); a task's first point (task site → pickup → drop-off) places it | N-20 (pool) |
| 215 | (2026-10-19) Admin may assign an offline runner; online-only applies to the matching/offer pool | drawer-task-offer (`Show offline runners`) |
| 216 | (2026-10-19) Ops copy approved: `Deadline passed` / `The customer's deadline for {ref} passed before any runner accepted. The task has expired.` (RUNNER_ASSIGNED expiry only); `The runner declined {ref}. Assign another runner.` | drawer-task-offer (Live updates) |
| 217, 218 | (2026-10-19) OTP sign-in records the runner phone check approved; automatic payment-identity check and the submit endpoint deferred (row 222) | p-runners-verification-documents (no UI change) |
| 220 | (2026-10-19) Feed `Deadline passed` / `The customer's deadline for {ref} passed before a runner was assigned. Expire the task or contact the customer.` (PAYMENT_CONFIRMED past its deadline) | drawer-task-offer (Live updates) |
| 225, 226 | (2026-10-19) The PAYMENT_CONFIRMED `Expire task` uses the same confirm dialog and required 10–500 reason; the customer gets the usual `errand.EXPIRED` and an `expired_after_payment` refund review opens | drawer-task-offer, N-20 |
| 227 | (2026-10-19) A task never offered to anyone is not "exhausted"; exhaustion needs at least one offer made | N-20 |
| 228 | (2026-10-19) Offline runners in the Reassign dialog as a collapsed, selectable `Show offline runners ({n})` group | drawer-task-offer |
| 229 | (2026-10-19) The runner must pick a decline reason; `Other reason` without free text | none (runner app) |
| 231 | (2026-10-19) Plain decline body `The runner declined {ref}. Assign another runner.` also for `too_far`, `not_available`, `other` | drawer-task-offer (Live updates) |
| 232 | (2026-10-19) No admin feed item after the admin's own `Expire task — no runner available` (row 234, 2026-10-19: none after the PAYMENT_CONFIRMED `Expire task` either) | drawer-task-offer, N-20 |
| 233 | (2026-10-19) Refuse at quote and create a task whose location (first point, row 213) is inside no configured service area, with a clear customer message; until built, ops assign by hand, cancel or expire | drawer-task-requote (quote refusal), N-20 |
| 234 | (2026-10-19) No admin feed item after the admin's own PAYMENT_CONFIRMED `Expire task` (as built) | drawer-task-offer |
| 235 | (2026-10-19) When the customer gives no deadline, the default 24 h starts at payment confirmation, not at creation | drawer-task-offer (Data) |
| 236 | (2026-10-19) A task refused at quote (outside every service area): notify the customer and let them cancel; no admin cancel transition | drawer-task-requote |
| 237 | (2026-10-19) Refuse to start payment once a customer-chosen deadline has passed; the customer picks a new deadline | none (customer screens) |
| 238 | (2026-10-19) The row-221 backfill stays as built | none |
| 240 | (2026-10-19) Backfilled deadlines on unpaid tasks cleared to NULL; their clock starts at payment | drawer-task-offer (`No deadline yet`) |
| 242 | (2026-10-19) The quote is kept when the deadline changes after quoting | drawer-task-requote (no re-quote prompt) |
| 243 | (2026-10-19) Only the customer may set a new deadline before payment: **no admin deadline edit** in any admin screen | drawer-task-offer |
| 244 | (2026-10-19) The customer may switch back to `Flexible` before payment | none (customer) |
| 260 | (2026-10-21, AQ-35) Runner verification: one card per runner (mockup), `Approve` / `Reject` on each pending check row, no card-level bulk action | p-runners-verification-documents |
| 261 | (2026-10-21, AQ-36) A runner reaches `Level 2 · ID verified` only when both National ID sides (front and back) and the selfie are approved; phone / payment-identity approvals never change the level | p-runners-verification-documents, N-23 (g), runner `_shared.md` §7 |
| 262 | (2026-10-21, AQ-37) The reject reason is an optional internal note, at most 500 characters, never shown to the runner | p-runners-verification-documents, N-23 (g), runner `v-onboard-id`, `v-onboard-pending` |
| 263 | (2026-10-21, AQ-38 (a), (b)) Level 2 is two-way (drops to Level 1 while the newest ID front, ID back or selfie is not approved); approved legacy `side = null` IDs count toward Level 2 | p-runners-verification-documents, runner `_shared.md` §7 |
| 264 | (2026-10-21) Verification queue filters and order as built; pending counted on the newest record per (type, side) (A-9) | p-runners-verification-documents |
| 265 | (2026-10-21) One-time hand-run re-check of existing Level-2 runners at deploy (`npm run runners:recheck-level2`) | p-runners-verification-documents |
| 266 | (2026-10-21) A drop below Level 2 withdraws the runner's open offers through the offer-expiry path; accepted jobs continue | p-runners-verification-documents, drawer-task-offer |
| 267 | (2026-10-21) Panel note on the drop; wording confirmed as built: `A runner reaches Level 2 when both ID sides and the selfie are approved, and drops back to Level 1 while any of them is rejected or replaced.` | p-runners-verification-documents |
| 268 | (2026-10-21) Legacy-ID rule confirmed: an approved unlabelled ID fills a missing side (one side per record, front first) | p-runners-verification-documents |
| 269 | (2026-10-21) Levels 3 / 4 stay untouched when an ID side or the selfie is rejected or replaced | p-runners-verification-documents (no change) |
| 270 | (2026-10-21) Admin feed item kind `runner_level_dropped`: `{runner} dropped to Level 1 — open offer on {task} withdrawn` | drawer-task-offer (Live updates) |
| 271 | (2026-10-21) Superseded `pending` records stay in the history; the admin hides their Approve / Reject (only the newest record per check is decidable; client pending counts use the newest record per check) | p-runners-verification-documents |
| 272 | (2026-10-21) The re-check script not pushing `job:offer_withdrawn` over sockets is acceptable for the one-time run | none |
| 273 | (2026-10-21) A drop below Level 2 sets the runner's availability `offline` | runner `v-jobs` (no admin change) |
| 274 | (2026-10-21) The customer-facing `Verified` badge follows the runner's live level, also mid-task | customer `v-task-detail`, `v-track` (no change) |
| 275 | (2026-10-21) Runner `v-onboard-id`: `Verified` caption and no Retake on a server-approved ID side | runner `v-onboard-id` (no admin change) |
| 278 | (2026-10-21, owner instruction) Verification page = a table of runners to verify, with filters; `View documents` opens a separate view (own component file) that renders the per-runner card content with the uploaded images inline | p-runners-verification-table, drawer-runner-verification (specced 2026-10-21; AQ-40 … AQ-44 answered by rows 279–283; audited PASS 2026-10-21) |
| 142 | (2026-10-16) "Ordinary approval is capped at min(verified item amount paid to Nitume, runner max_purchase_advance) and must not silently override the runner's limit. Paying above max_purchase_advance needs an explicit exceptional override with an auditable reason and actor." Not the earlier "raise the runner's limit first" | drawer-runner-payout (§5 2b), drawer-runner-purchase-limit, N-21 |
| 143 | (2026-10-16) No payout-time promise/SLA anywhere; status only | p-payout-requests (and the runner copy it triggers) |
| 144 | (2026-10-16) Runner ID/selfie images kept only as long as needed for verification, fraud prevention, audit and legal/compliance, then securely deleted; never indefinitely; retention configurable; access restricted and logged throughout | p-runners-verification-documents |
| 146 | (2026-10-16) "A request paid below the requested amount closes as PAID; store requested and actual paid amounts separately … The remainder is not carried in the same request; it stays in available balance for a new payout request." | p-payout-requests |
| 93 | The four admin tones `#DCE3EE`, `#C3CADC`, `#7E8CA8`, `#EEF1F5` are approved admin palette tokens in `_tokens.scss` | §4.1 |

Answered 2026-10-09 and applied above: rows 62, 68, 69, 77–83, 86–88, 93, 94 (AQ-1 … AQ-6, AQ-R1, AQ-R2). Answered 2026-10-12 and applied on `docs/owner-answers-5`: rows 95, 96 (AQ-7), 98, 100, 101, 102 (AQ-8). Answered 2026-10-13 and applied on `docs/owner-answers-6-runner-specs`: rows 104–108 (runner reimbursement and payout ledger, system design §2.2/§6), 109 (AQ-9), 110 (AQ-10), 111. Answered 2026-10-16 and applied on `docs/owner-answers-7-specs`: rows 140–144, 146; on `docs/owner-answers-8-specs`: rows 150–156. Answered 2026-10-16 and applied on `docs/owner-answers-9-specs`: rows 145, 147, 148, 149, 157–166; on `docs/owner-answers-10-specs`: rows 167–171, 175, 176 (rows 172–174 are runner/customer only). Still open and relevant here: row 85 (PayHero contract, no admin UI impact); the questions in §8.

## 2. Access

- Every endpoint in this set is `@Roles(UserRole.ADMIN)` (refunds controller at class level; `PUT /errands/:id/merchant-details`, `POST /errands/:id/quote`, `PATCH /errands/:id/resolve-dispute` per route). `GET /errands/:errandId/refund` allows customer and admin.
- The admin app already gates the whole dashboard with `authGuard` + `adminOnlyGuard` (`apps/admin/src/app/app.routes.ts`) and sends `x-nitume-acting-role: admin` on every call. No new guard is needed and no screen in this set has a non-admin variant.
- A 401 is handled by the existing auth interceptor (refresh, then `/login`). A 403 on any call in this set shows the inline error notice (A-11) `You don't have access to this. Sign in with an ops admin account.` and leaves the form disabled.
- **Refund approval and payout recording (row 77, decided)**: any authorized admin may approve refunds and record payouts; **no second approver** and no amount threshold. Today every user with the `admin` role is authorized (`@Roles(UserRole.ADMIN)`); if the API later adds a refund/payout permission, the drawer hides the decision and payout forms for admins without it and shows the 403 copy above. No client-side role tiers are invented.

## 3. Money and the three payment flows

- Display format: `KSh 1,250` for whole shillings, `KSh 1,250.50` when there are cents. Thousands separator `,` (en-KE). Never round a refund or paid amount: refunds are stored with 2 decimals and an admin must see the exact figure they are approving. The existing `formatKsh` (`features/admin/shared-format.ts`) rounds to whole shillings, so it is **not** usable for refund amounts: needs `formatKshExact` (A-13). `—` for null.
- `KSh` everywhere (mockup `.drawer-row b`, `.rep-stat-row b`), and in the customer notifications the API writes (row 82, decided; the API still writes `KES`, needs N-12). `KES` is only the wire currency code.
- Every amount, count, id, receipt, Till/Paybill/account number, phone number and timestamp is Fira Code (`.num` / `b` inside `.drawer-row`). Labels next to them are Fira Sans.
- Money inputs: `<input type="text" inputmode="decimal">` in a `.field-input` with Fira Code value text, a static `KSh` prefix label in Fira Sans 13 slate-600 inside the field's left padding. Accept digits and one `.`, max 2 decimals; strip `,` and spaces before sending; send a JSON **number** (the DTOs use `@IsNumber`).
- The three flows stay separate in every label:
  - **Service + runner fee**: one STK charge to Nitume (row 34 hides the split from the customer; the admin may see components where the API gives them).
  - **Item amount, paid to Nitume** (`send_to_runner`, rows 42, 66, 76): part of the combined STK charge to Nitume. The runner buys the item with their own money; Nitume **reimburses** the runner through the payout ledger after the receipt is uploaded and accepted (task CONFIRMED, row 104), never in advance (row 95, system design §6 "Runner reimbursement"). A missing or mismatched receipt goes to ops review, capped at the item amount paid to Nitume (row 105); on a CANCELLED or FAILED task verified item spend is reimbursed but no runner fee is paid (row 106); lines live in the runner payout ledger (row 107). It counts toward the refund ceiling even when the runner already bought the item (row 81).
  - **Item amount, paid to the merchant** (`merchant_direct`): the customer pays the merchant's Till/Paybill, including any increase, manually (row 67); Nitume never holds it and can't refund it; a decrease opens no refund review (row 86).
- **Refund ceiling (rows 37, 81, 87)**: what the customer paid **to Nitume** on the task (fees, item amount on `send_to_runner`, completed differences), **minus refunds already approved or sent** on the same task. Cumulative refunds never exceed what was paid; a reversed, not-yet-re-sent payout keeps counting at its decided amount (row 111). The API returns the ceiling as the review's `amountPaid` (needs N-9 for the net rule) and enforces it again at decision time.
- Forbidden words in this surface (copy, tooltips, code identifiers shown to users): wallet, balance, escrow, held, hold, release, credit, top up. Use "paid to Nitume", "paid to the merchant", "refund", "payout".

## 3.1 Times (row 96, decided 2026-10-12)

- **Display**: every time an admin reads is **12-hour East Africa Time (EAT, `Africa/Nairobi`, UTC+3, no daylight saving)** with `AM`/`PM`, as drawn in the mockup: `Today, 4:30 PM`, `Yesterday, 4:30 PM`, `Mon 12 Oct, 4:30 PM` (add the year, `Mon 12 Oct 2025, 4:30 PM`, when it is not the current year). Render with `Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', hour: 'numeric', minute: '2-digit', hour12: true, … })` (A-13 `formatDateTime`); never the browser's local zone, so an admin abroad sees the same times as ops in Kenya. "Today"/"Yesterday" are computed in EAT too. Fira Code, as all timestamps.
- **Backend stays canonical**: the API sends and stores UTC ISO-8601 (`2026-10-12T13:30:00.000Z`, `timestamptz`). The client never sends a formatted or local-zone string.
- **Inputs** (e.g. `Valid until` in `drawer-task-requote`): the admin types EAT; the client converts to a UTC ISO string ending in `Z` (`2026-10-09T09:00:00.000Z` for 12:00 EAT; built as `eatLocalInputToIso`, accepted in the 2026-10-12 round-5 re-audit) before sending and shows the hint `East Africa Time`. Defaults (e.g. now + 24 h) are computed in UTC and displayed in EAT.
- **Relative times** (`timeAgo`, `4 min ago`) may stay where the mockup draws them; any absolute time follows this section.
- Where a time sits next to text that could be read as another zone (exports, tooltips, the A-08 dialogs), suffix `EAT` (`4:30 PM EAT`, helper `formatDateTimeEat`). In tables and drawer rows the suffix is not needed.
- Day buckets (the `Today` KPI, daily and weekly bars) use the EAT calendar too (`eatDayKey`, `eatWeekday`; weeks start Monday 00:00 EAT). Time-only labels use `formatTime` (`4:30 PM`).

## 4. Layout tokens (from the mockup CSS, already ported to `styles/_ops.scss`)

| Element | Value |
|---|---|
| Panel topbar | `h1` 23/700; `.sub` 12.5 Fira Code slate-600; margin-bottom 26; actions gap 10 |
| Table card | white, 1px slate-line, radius 14; `th` 10.5 uppercase 0.04em slate-600 on slate, padding 14 18; `td` 13, padding 14 18, hairline between rows; `tr.clickable:hover` slate |
| Row action | `.row-assign` 12/700 blue, 1px slate-line, padding 6 12, radius 8 |
| Drawer | fixed right, width 420 (max 92vw), slate body; head white 20 22 with `h3` 16/700 and 32×32 round close; body padding 18 22 30 |
| Drawer section | margin-bottom 20; label 11/700 uppercase 0.04em slate-600, margin-bottom 10 |
| Drawer card | white, 1px slate-line, radius 12, padding 14 16; rows 13, padding 7 0, hairline, value `b` Fira Code 600 |
| Drawer timeline | left padding 20; green 8px dot; time 11 Fira Code slate-600 |
| Drawer actions | flex, gap 10, margin-top 6; mockup buttons `.btn-reject` (outline) and `.btn-approve` (green) 12.5/700, padding 9, radius 9, flex 1 |
| Form field (design system) | label 12.5/600 slate-600; input 14.5, padding 11 14, radius 8, 1px slate-line; focus 2px green outline; invalid border red |
| Chip | 11–12/600–700, padding 5 10–11, radius 999 |

### 4.1 Admin palette tokens (row 93, approved)

Besides the design-system palette and derived tones, the admin surface has four approved **admin palette tokens**, promoted from the mockup's sidebar and map values. They live only in `apps/admin/src/styles/_tokens.scss` and are used through `var(...)`; no other surface uses them, and no hex value appears outside `_tokens.scss`.

| Token | Hex | Use |
|---|---|---|
| `--nitume-sidebar-text` | `#DCE3EE` | sidebar body text on blue |
| `--nitume-sidebar-item` | `#C3CADC` | inactive nav item on blue |
| `--nitume-sidebar-muted` | `#7E8CA8` | nav group labels, sidebar footer role |
| `--nitume-map-bg` | `#EEF1F5` | ops map canvas |

An audit treats these four as palette, not as violations. Any other new hex is still a FAIL.

## 5. Shared components (A-ids)

"Exists" = in `apps/admin/src/app/shared/` or global SCSS today. "NEW" = must be added to the admin shared layer (owner: `web-parity`, the Angular counterpart of `core-ui`) before the screens use it. Per-screen copies of any of these are an audit FAIL.

| Id | Component / pattern | Status |
|---|---|---|
| A-01 | `OpsDrawerComponent` (`app-ops-drawer`): overlay, slide-in, ESC/overlay/✕ close, `title` input; focus moves to ✕ when the drawer opens (row 278; drawers with a form then move it to their first field after load) | exists (`shared/ops-drawer.component.ts`) |
| A-02 | `StatusChipComponent` (`app-status-chip`) | exists. **NEW extension**: a `kind` input (`'errand' \| 'refund' \| 'verification' \| 'availability'`). Today `statusLabel('approved')` returns the verification label `Approved` (success), which is wrong for a refund (§6). Errand labels unchanged. |
| A-03 | `PanelTopbarComponent` (`app-panel-topbar`): title, Fira Code sub, search (`searchLabel` default `Search`, optional `searchMaxLength`, row 278), `[topbar-actions]` slot | exists (`features/admin/panels/panel-topbar.component.ts`; the queue and disputes panels re-implement it inline, out of scope here) |
| A-04 | Table card (`.table-card`, `th`, `td`, `tr.clickable`, `.task-cat`, `.task-id`, `.row-assign`) | exists (global SCSS) |
| A-05 | Drawer section/label/card/row/timeline (`.drawer-section`, `.drawer-label`, `.drawer-card`, `.drawer-row`, `.drawer-timeline`, `.dt-item`, `.dt-time`, `.drawer-actions`) | exists (global SCSS) |
| A-06 | Form field (`.field`, `.field-label`, `.field-input`, `.field-input.is-invalid`) | exists (global `styles.scss`). **NEW**: `.field-hint` (12 slate-600, Fira Sans) and `.field-error` (12/600 red, text only) plus a `FormFieldComponent` (`app-form-field`: label, hint, error, projected control, wires `aria-describedby`). The hint renders through `app-num-text`, so amounts, receipts and times in a hint are Fira Code and the words Fira Sans (accepted app-wide, round 5, 2026-10-12). A number that is a rule rather than data (e.g. `At least 20 characters`) must stay Fira Sans: such a hint needs a plain-text opt-out (m-12) |
| A-07 | Buttons `.btn` + `.btn-primary` / `.btn-outline` / `.btn-text` | exists (global). Every button in this set uses the `.btn` base class (the current drawers use `btn-primary` without `.btn`, so they render unstyled) |
| A-08 | `ConfirmDialogComponent` (`app-confirm-dialog`): scrim over the drawer, white card radius 14 padding 20 max-width 360, `h3` 16/700, body 13 slate-600 (amounts Fira Code), actions right-aligned: outline `Back` + primary confirm; focus trapped, initial focus on `Back`, ESC = Back | **NEW** (the task drawer's `.drawer-modal` markup has no styles at all) |
| A-09 | `SegmentedToggleComponent` (`app-segmented-toggle`): 2–3 options in a 1px slate-line pill, radius 999, height 36; active segment green fill, white 13/600 text; inactive white, blue 13/600; `role="radiogroup"` | **NEW** |
| A-10 | Empty and loading (`.ops-empty` with `b` title + text; `.ops-loading`) | exists (global SCSS) |
| A-11 | `InlineNoticeComponent` (`app-inline-notice`, tones `success` / `danger` / `info`): a `.drawer-card` with a status chip of that tone (A-02 styling) followed by 13 blue text; `role="status"` (success/info) or `role="alert"` (danger) | **NEW**. Replaces red/green filled banners for these features: the design system allows amber/red only at chip size, so `.dispute-result.bad` and `.ops-banner` (red-050 fills) are not reused |
| A-12 | "Load more" pagination (centered `.btn .btn-outline`, label `Load more` / `Loading…`) | exists as a pattern in `verifications.panel.ts` (no `.pagination` style yet) |
| A-13 | Format helpers: `formatKshExact(value)` (§3), `formatDateTime(iso)` → `Today, 4:30 PM` / `Yesterday, 4:30 PM` / `Mon 12 Oct, 4:30 PM` (12-hour with AM/PM as in the mockup, East Africa Time; §3.1, row 96 decided) | **NEW** (`timeAgo` and `formatKsh` exist; neither fits exact money or absolute times) |
| A-14 | `apiError(err)` helper → `{ status, code?, message, extra }` read from `HttpErrorResponse.error` (API body `{ statusCode, code, message, ...extra }`; class-validator 400s carry `message: string[]`) | **NEW** (`core/`). Today every drawer shows `HttpErrorResponse.message` ("Http failure response for …"), which is not user copy |
| A-16 | Row checkbox column + sticky batch bar (selected count and Fira Code total, one primary action), for `p-runner-payouts` and `p-payout-requests` | **NEW** |
| A-15 | Sidebar nav item with badge (`.ops-nav-item`, `.badge-count`) | exists (admin-dashboard shell) |
| A-17 | `ImageViewerComponent` (`app-image-viewer`, `shared/image-viewer.component.ts`): full-page scrim (drawer-overlay tone), one image centred at most 92 vw × 88 vh `object-fit: contain`, white header line `{label} · {runner}` 13/600, `.drawer-close` ✕, ESC / scrim close, focus trapped, focus returned; takes a `src` it never stores, `referrerpolicy="no-referrer"`, no download button; host re-parented to `<body>`; scrim `--nitume-viewer-scrim` (row 278, `drawer-runner-verification.md`) | exists (`shared/image-viewer.component.ts`, on `feat/admin-verification-table`) |
| A-18 | Image frame `.doc-preview` (width 100 %, `aspect-ratio: 3 / 2` while loading, `max-height: 280px` shown, slate fill, 1 px slate-line, radius 10, `object-fit: contain`; the frame is a `button` opening A-17) | exists (`_ops.scss`, on `feat/admin-verification-table`; `.receipt-thumb` crops with `cover`, not usable for ID images) |

## 6. Refund status vocabulary (admin)

API `RefundStatus` → admin chip (A-02 with `kind="refund"`). Admin labels differ from the customer's (`docs/specs/customer/_shared.md` §11) because the admin needs the next action, not reassurance.

| API status | Admin chip | Tone | Next action |
|---|---|---|---|
| `pending_review` | `Needs review` | pending (amber) | Decide an amount |
| `approved` | `Payout due` | pending (amber) | Send the M-Pesa refund, record the receipt |
| `refunded` | `Refunded` | success (green: complete state) | none |
| `no_refund` | `No refund` | neutral (slate) | none |

API `RefundTrigger` → `Reason` label:

| API trigger | Label |
|---|---|
| `price_change_rejected` | `Price change rejected` |
| `dispute_customer_favourable` | `Dispute: sided with customer` |
| `cancelled_after_payment` | `Cancelled after payment` |
| `price_change_decrease` (rows 48, 71; `send_to_runner` tasks only, row 86) | `Price decrease` |
| `expired_after_payment` (row 102; RUNNER_ASSIGNED → EXPIRED, no runner accepted in time) | `Task expired` |
| `failed_after_payment` (row 102; RUNNER_EN_ROUTE → FAILED) | `Task failed` |

Unknown values: show the raw value title-cased (never hide a row). Row 102: these are **review triggers**, not automatic refunds; the admin still decides the amount (KSh 0 up to the ceiling).

Effective payout state (row 100, see `drawer-refund` "Corrections"): a `refunded` review whose latest correction is a reversal shows the chip `Payout reversed` (pending, amber; next action: send again and record the new payout) instead of `Refunded`. A `refunded` review with corrections that leave it sent still shows `Refunded`.

## 6.1 Runner payout vocabulary (admin, row 107)

API effective status (`effectiveStatus`, with `effectivePayout`) → A-02 `kind="runner_payout"`:

| Effective status | Chip | Tone | Next action |
|---|---|---|---|
| `on_hold` | `Needs review` | pending (amber) | Approve (capped) or reject |
| `payable`, no reversed payout | `Payout due` | pending (amber) | Send M-Pesa, record the receipt (batch per runner) |
| `payable` with `effectivePayout.state = 'reversed'` | `Payout reversed` | pending (amber) | Re-send (`resent_payout`), never `mark-paid` |
| `paid` | `Paid` | success (complete state) | none |
| `rejected` | `Not approved` | neutral (slate) | none |

Review reasons (`reviewReason`): `receipt_missing` → `No receipt`; `receipt_mismatch` → `Receipt doesn't match`; `out_of_pocket_claim` → `Claim after cancel/fail`; `over_purchase_limit` → `Above purchase limit`; `price_decrease_pending` → `Waiting for the price-decrease refund decision` (built on `cf525cf`: the item line waits at CONFIRMED while a price-decrease refund review is undecided; decide that refund first). Line kinds: `runner_fee` → `Runner fee`; `item_reimbursement` → `Item reimbursement`. Adjustment kinds: `correction` → `Payout corrected`; `reversal` → `Payout reversed`; `resent_payout` → `Payout sent again`. Payout requests (N-17; owner names PENDING / PAID / REJECTED / CANCELLED, row 166): `requested` (= PENDING) → `Waiting` (pending), `paid` → `Paid` (success), `rejected` → `Not approved` (neutral), `cancelled` → `Cancelled` (neutral). Offer outcomes (`drawer-task-offer`): assignment `assigned` with `offerExpiresAt` in the future → `Offered` (pending); `expired` → `Offer ended` (pending, ops must re-offer); `declined` → `Declined` (pending); `accepted` → no chip (the task chip moves on). Unknown values: raw value title-cased.

## 7. Cross-cutting API gaps (needs: api-contract)

Collected here; each spec repeats the ones it depends on.

- N-1 `GET /refunds` and `GET /refunds/:id` return the bare `RefundReview` row. The panel and drawer need, per review: errand `{ id, title/description, category, status }`, customer `{ shortName, phone }` (the phone is where the manual refund is sent), and a paid breakdown by flow `{ serviceAndRunnerFee, itemAmountToNitume, priceChangeDifferences, merchantDirectAmount }`. Today `GET /payments/:errandId` returns transactions with a `paymentTypeId` uuid only, so the client cannot split by flow.
- N-2 `decidedByUserId` / `paidByUserId` are user ids; the drawer wants the admin's display name (or the client keeps showing `…a1b2`).
- N-3 Done on `main`: `price_change_decrease` reviews, several per errand (rows 71, 94). Remaining: open them only on `send_to_runner` tasks (N-10).
- N-4 A re-quote (`POST /errands/:id/quote` on an expired QUOTED errand) writes no history row and emits no event, so the customer is not notified and the drawer timeline does not show it. Needs a notification/socket event (e.g. `quote.reissued`) and ideally an audit row.
- N-5 The errand list has no quote expiry, so the queue can't flag expired quotes without one request per row. Needs `quoteExpiresAt` on `GET /errands` items (and the detail).
- N-6 Done on `main` (`disputes.service.ts` `closeWithin`): the verdict sets `status`, `resolution`, `resolvedBy` and a `resolved` event. The resolution is readable by customer and runner (`GET /errands/:errandId/dispute`), as row 79 allows.
- N-7 Optional: a count endpoint (`GET /refunds/count?status=`) for the sidebar badge; until then the client counts a `limit=100` page (§ p-refunds).
- N-9 (row 87) **Built on `feat/api-owner-answers-4`** (not on `main`), as separate fields rather than a netted `amountPaid`: `refundCeiling` (null once decided), `alreadyRefunded`, `remainingRefundable`, `totalPaidToNitume` on every admin refund response; `amountPaid` stays the review's own basis. Admin screens show the ceiling as `refundCeiling` while pending (p-refunds `Refundable`, drawer-refund). Original requirement: the cancellation review's ceiling must be **net of refunds already approved or refunded** on the errand; at decision time every review is checked against `min(amountPaid, totalPaidToNitume − Σ refundAmount of the errand's other approved/refunded reviews)`, answering `refund_exceeds_amount_paid` with the effective ceiling in `amountPaid`. Today `amountPaid()` sums every completed STK leg (`refunds.service.ts:508`).
- N-10 (row 86) `openForDecrease` only when the item payment route is `send_to_runner` (`price-change.service.ts:186-189` opens it on every route).
- N-11 (row 83) `QuoteErrandDto.expiresAt` required in effect: when omitted the server sets now + 24 h; no new quote has `expiresAt = null`. Legacy null-expiry quotes: backfill to `createdAt + 24 h` (data fix) so they can be replaced; until then the drawer shows `No expiry`.
- N-12 (row 82) Customer notification bodies use `KSh` with the app's money format (`notifications.service.ts:331, 340-341, 360, 372` write `KES ${raw}`).
- N-13 (row 68) **Built on `feat/api-owner-answers-4`** (not on `main`), plus `GET /errands?quoteRequested=` and `GET /errands/count?quoteRequested=` (drawer-task-requote Data). Original requirement: customer `POST /errands/:id/quote-request` (QUOTED or ACCEPTED with an expired quote; idempotent; no state change), `quoteRequestedAt` on `GET /errands/:id` and on `GET /errands` items, and an admin notification/live-feed item `Customer asked for a new quote`. If storing it needs a new column, that is a schema change for the owner.
- N-14 (row 80) `PUT /errands/:id/merchant-details` refuses categories other than `buy_for_me` / `pickup_delivery` (e.g. 400 `merchant_details_not_applicable`); a change on a task whose `merchant_direct` payment has started records `merchantDetailsUpdatedAt` and notifies the customer (`merchant_details.changed`).
- N-15 (rows 82, 100; **schema approved 2026-10-12, build now**) Payout correction/reversal records, append-only table `refund_payout_corrections` (system design §2.2): `POST /refunds/:id/corrections`, `corrections[]` and `effectivePayout` on admin refund responses, customer view on the effective payout. Full contract in `drawer-refund.md` "Corrections" → Data.
- N-16 (row 102, **approved 2026-10-12**) New `RefundTrigger` values `expired_after_payment` and `failed_after_payment` (enum migration); open a review (same upsert as the cancellation review, `priceChangeRequestId` null, so at most one cancellation-type review per errand) when a **paid** errand moves RUNNER_ASSIGNED → EXPIRED or RUNNER_EN_ROUTE → FAILED, with the same ceiling rules (rows 81, 87) and the same customer notification as a cancellation review. "Paid" = at least one completed STK leg to Nitume, as for `cancelled_after_payment`. A late STK completion on an EXPIRED/FAILED errand refreshes `amountPaid` while `pending_review`, as for CANCELLED.
- Row 98 (note, no admin change): the API runs as **one instance** (no Socket.IO Redis adapter). The `admins` room and live events assume that; nothing in these screens needs a change.
- N-17 (row 117) Runner payout requests: **built on `main`** (`feb1dcc`): record + endpoints (`/runner-payout-requests` list/count/detail/pay/reject, runner create/list/summary). Minimum: KES 500 server-side config, no admin UI (row 159; built env `RUNNER_PAYOUT_REQUEST_MINIMUM_KES` default 0 must become 500, recommended name `MIN_RUNNER_PAYOUT_REQUEST`). **To build (row 166)**: `POST /runner-payout-requests/:id/cancel` `{ reason }` (ops only, mandatory free text, 10–500 characters after trimming, whitespace-only rejected with 400 `cancellation_reason_invalid`, row 169; the reason is never in any runner view or runner notification, row 168), status `cancelled`, columns `cancelledByUserId`, `cancelledAt`, `cancellationReason`, `cancelled` in the list filter and count; 409 `payout_request_not_open` on a closed request. **Expose (row 165)**: `createdByUserId` and `updatedAt` on the admin view. One open request per runner, destination = sign-in phone; `pay` marks whole lines paid like `mark-paid` and links them; the request stores `requestedAmount` and `paidAmount` separately and closes `paid` even when `paidAmount` < `requestedAmount`; the remainder is not carried on the request (row 146, decided). Table `runner_payout_requests` approved (row 153). No payout time anywhere (row 143).
- N-18 (row 136) **Built** (on `main`): 409 `task_exposure_cap_exceeded`, `exposureOverrideNote`, `taskExposure`, `exposureOverrides[]`, table `task_exposure_overrides` (approved, rows 145, 160, no `scope` column; applied on every task, row 148). Original requirement: task-level combined exposure cap on CANCELLED/FAILED: one figure across the customer refund reviews and the runner's item reimbursements; refund decisions, refund corrections, item approvals and claims checked against it; above it only with an explicit override (amount, reason ≥ 20 chars, actor, time; schema RQ-26); expose `exposure { itemPaidToNitume, customerRefundsCommitted, runnerReimbursementCommitted, remaining }` on the refund detail and the runner payout detail.
- N-19 (row 138) `PATCH /runners/:id/purchase-limit` + append-only audit history, `GET …/history`; runners refused.
- N-20 (rows 113, 141, 150, 155, 156, 157, 167, 185, 186, 187, 201–232) Admin assign creates an offer (10 min, `offerExpiresAt`) instead of an accepted assignment; no acceptance after `offerExpiresAt` (409 `offer_expired`). **Admin offer lapses** (row 157, decided): the assignment becomes `expired` and the task **stays RUNNER_ASSIGNED**; the expiry job must stop moving it to EXPIRED (built on `main` as RUNNER_ASSIGNED → EXPIRED at once, `errands.service.ts` `expireLapsedOffers`; api-contract). Ops get an admin feed item `Offer ended` (like `assignment_declined`) and re-offer through `POST /errands/:id/assign` (already reassigns a RUNNER_ASSIGNED task with no open assignment). **Needed**: the errand views expose the latest assignment whatever its status (or a `lastAssignment`); today `assignment` comes only from `ACTIVE_ASSIGNMENT_STATUSES` and is null after a decline or a lapse. **Matching exhausted (rows 167, 177–179, decided)**: RUNNER_ASSIGNED → EXPIRED only when the task has no open offer and no runner is left in its eligible pool (row 177: online, eligible for the category, inside a service area once areas exist, otherwise available; purchase limit at or above the task's purchase, row 186, no pre-offer exception, row 207; not on another accepted/active task, row 187 (c)) who is not excluded by row 178 (declined or let an offer for this task lapse). Checked (proposed) after every decline and every lapse (expiry sweep), not on the candidates read (a GET must not change state); never on a single decline or lapse while eligible runners remain. No automatic expiry until service areas and the full pool exist (row 179). **Deadline (row 185, decided)**: at `deadlineAt` with no runner accepted the sweep moves RUNNER_ASSIGNED → EXPIRED (S), closes an open offer as `expired`, same side effects, admin feed item `deadline_passed`; from `deadlineAt` assign answers 409 `task_deadline_passed` (api-contract, `feat/api-runner-1`); the deadline path needs no pool, so row 179 does not hold it back. **Pool additions (rows 186, 187 (c), decided)**: purchase limit below the task's purchase → ineligible (409 `runner_not_eligible` `{ reason: 'over_purchase_limit' }`, replacing the earlier `purchase_limit_exceeded` proposal); a runner on another accepted/active task → ineligible. **Empty online pool (row 187 (a))**: never expires the task; re-check, no time rule. **Admin expire (rows 187, 202, 203, 208)**: audited RUNNER_ASSIGNED → EXPIRED (A) with a required reason (10–500), guard (RUNNER_ASSIGNED, no open offer, deadline not passed, no eligible online runner left) and `canExpire.noRunner` as in `drawer-task-offer.md`. **Paid task never offered past its deadline (rows 201, 214, decided 2026-10-19)**: stays PAYMENT_CONFIRMED (never auto-expired), `deadlinePassed`, one `deadline_passed` feed item (owner copy, row 220); assign refused with 409 `task_deadline_passed`; new admin `Expire task` = PAYMENT_CONFIRMED → EXPIRED (A) with the same dialog and required 10–500 reason (row 225), `canExpire.deadlinePassed`, customer `errand.EXPIRED` and refund review `expired_after_payment` (row 226), no admin feed item (row 234). Default `deadlineAt`: 24 h from payment confirmation when the customer gave none (rows 221, 235), backfill, NOT NULL (row 221); a task inside no configured service area refused at quote and create (row 233); a never-offered task is not exhausted (row 227). **Offer cap (row 205)**: `offerExpiresAt` = min(now + window, `deadlineAt`). **Admin assign of an offline runner allowed (row 215)**. Built on `feat/api-owner-answers-12`: PAYMENT_CONFIRMED assign refusal, offer cap, decline reasons, RUNNER_ASSIGNED admin expire, `canExpire`, `expiry.fromStatus`, candidates with offline runners. Built on `feat/api-runner-1`: `lastAssignment`, `assignments[]`, `offerWindowSeconds`, `deadlinePassed`, `expiry`, history `actor`, the deadline sweep and `task_deadline_passed` on RUNNER_ASSIGNED; the rest is listed in `docs/audits/runner-gap-report.md` §16. To build: the pool computation (needs RA-10 service areas/skills and RA-1 per-task offer history), proposed `GET /errands/:id/candidates` → `{ items[…, tried], eligibleRemaining, triedCount }`, 409 `matching_exhausted` and `runner_not_eligible` on assign, admin feed item `matching_exhausted`; until the pool is computable in full, no automatic expiry (row 179); the row-178 exclusion on assign applies now (409 `runner_excluded` or filtered out of candidates, api-contract's choice). Screen: `drawer-task-offer.md`. **Auto-offer lapses** (row 150): the offer expires and the system offers the next eligible runner; EXPIRED only when matching is exhausted. **Decline** (row 155): the task stays RUNNER_ASSIGNED, no deadline starts or changes; the system keeps offering/reassigning; EXPIRED only when matching is exhausted. Pre-change offers without a deadline stay as they are (row 156). Every RUNNER_ASSIGNED → EXPIRED of a paid task opens the `Task expired` refund review (row 102) and sends the customer `errand.EXPIRED` notification (customer `v-notifications.md`); the task drawer's offer section and the queue: `drawer-task-offer.md`.
- N-21 (row 142, 2026-10-16) Purchase-limit exception on item reimbursement review: `POST /runner-payouts/:id/review` accepts `purchaseLimitOverrideNote` (10–500); without it the approval stays ≤ min(item amount paid to Nitume, `max_purchase_advance`) (today's `approvalCeilingOf`); with it up to `overLimitCeiling` = min(requested, item amount paid to Nitume, the line's cap without the limit); never above the item amount paid to Nitume. Storage (row 151, decided): one append-only row in `task_exposure_overrides` (source/scope `purchase_limit`) in the same transaction, recording errand id, assignment id, runner profile id, line id, `limitAtTime` (the line's stored limit = the previous limit), `requestedAmount`, `approvedAmount`, `amountAbove` (= approved − limit), `note`, `createdBy` (approving admin), `createdAt`; one admin, no second approver. **Stored limit (row 152, decided, option b)**: new column on `runner_payout_lines` (e.g. `maxPurchaseAdvanceAtCreation`) set when the item line (obligation) is created; the ordinary ceiling uses it and never the runner's current limit, so a later N-19 change never recalculates an existing line (existing lines with null: fall back to the current limit once, recommended to backfill at migration). Expose on the detail `purchaseLimitAtCreation`, `currentPurchaseLimit`, `overLimitCeiling` and `purchaseLimitOverride { errandId, assignmentId, runnerProfileId, limitAtTime, requestedAmount, approvedAmount, amountAbove, note, createdBy, createdAt }`; 400 `purchase_limit_override_note_invalid`.
- N-23 (rows 144, 154, 161, 162, 170, 171, 175, 180, 181) Verification documents: (a) retention clock = latest of a new/replacement ID or selfie upload, a verification/re-verification started, an admin verification review that needs the evidence (the decision on a pending verification, or the audited `Re-review evidence` action, row 171); never a view, never task assignments/offers or disputes (built `purgeExpiredDocuments` counts assignments and disputes: must change); (b) purge keeps only status, outcome, timestamps, reviewer id, `purgedAt`, type and the access-log ids, `reviewerNote` is **deleted** with the evidence (row 170, decided; re-review notes too); guards kept (row 175): never purge a PENDING verification or evidence tied to an open dispute; (c) separate restricted storage credential for ID media, backups/version history checked so they cannot keep a purged image; (d) admin list/detail expose `hasDocument`, `purgedAt` and `side` (`front | back`, lowercase, required on ID images, rows 195, 200; all built on `main`); the open-dispute guard is an intended legal/audit hold (row 190); the clock counts only activity that creates or replaces stored ID/selfie evidence (row 191, built on `main`); Cloudinary's internal backups are an external dependency, owner checklist in System Design §10 (rows 192, 193); (e) **Re-review evidence (rows 171, 180, 181)**: `POST /runners/verifications/:id/re-review` (approved, row 180) `{ note? }` (optional, ≤ 500 after trim, no minimum; blank → null) (admin only; decided ID/selfie verification with a stored image) → 201 `{ verificationId, reReview { id, reviewedBy { id, displayName }, createdAt, note } }`, logged as `re_review` (admin, IP, time) and restarts the clock; never changes the decision (row 181); 409 `verification_not_decided`, 410 `verification_document_purged`, 404 `verification_document_missing`; admin list items carry `reReviews[]` (oldest first) and `reviewer { id, displayName }`. **On `main`** with exactly this shape (checked 2026-10-21; first built on `feat/api-owner-answers-9` @ `45b516d`). (f) **Verification decision** `PATCH /runners/:runnerId/verifications/:verificationId` `{ decision, reviewerNote? }` (audit 2026-10-21, A-1, A-2, A-3, A-6; built on `fix/api-verification-review` @ `38a6a58`, not on `main` yet): 200 the full admin list item; 400 malformed id; 404 `Verification not found` (unknown id, or the verification belongs to another runner); **409 `verification_already_decided` `{ status }`** when the check is no longer pending (replaces `main`'s 404 `Verification already resolved`), also on a concurrent decision. The admin client handles both `main`'s bare answer and the full item, and reloads on 404 or 409. Screen: `p-runners-verification-documents.md`. (g) **Owner answers rows 260–262 (2026-10-21; built by api-contract on `feat/api-verification-answers` @ `c21bce5`, `7a7ad1a`, `cf414e5`, not on `main`; contract in `p-runners-verification-documents.md` Data: `GET /runners/verifications/queue` `{ items, nextCursor, total, awaitingReviewCount }`, 400 `reviewer_note_invalid` `{ maxLength }`, runner views without `reviewerNote` / `reviewedBy`; filters pending owner row 264, A-9 open)**: A-4 level rule: `1_basic` → `2_id_verified` only when the newest ID `front`, ID `back` and `selfie` records are all approved (row 261; edge cases AQ-38); A-5 runner `displayName`, `shortName`, `serviceAreas[{ id, name }]`, `verificationLevel`, `appliedAt` per runner, preferably a runner-grouped list paged by runner with `awaitingReviewCount` (runners with a pending check, whole queue); A-7 `reviewerNote` optional, trimmed, blank → null, ≤ 500 (row 262); A-8 runner-facing verification responses (`GET /runners/me/verifications`, the two `POST`s) drop `reviewerNote` and `reviewedBy` (they carry both today, `runners.service.ts:961-968`).
- N-22 (owner, 2026-10-16) OTP email (admin sign-in, `POST /auth/otp/email/request`): body must say `Your verification code expires in 5 minutes.`; TTL stays 300 s. OTP SMS (row 158, owner wording): `Your Nitume verification code is {{code}}. It expires in 5 minutes. Do not share this code with anyone.` Today `mail.service.ts:23` says "It expires in 10 minutes". Full text for api-contract: `Your Nitume verification code is {code}. Your verification code expires in 5 minutes. Do not share it.` No admin UI copy changes (the admin login screen states no duration).
- N-8 Non-`ApiError` conflicts (`ConflictException` in `performDisputeResolution`, state-machine 409s) have no `code`; the client can only switch on status 409. A code such as `errand_not_disputed` would let the UI word it precisely.

## 8. Owner questions (AQ-n)

All answered 2026-10-09:

| AQ | BOARD row | Answer |
|---|---|---|
| AQ-1 | 77 | Any authorized admin approves refunds and records payouts; no second approver; `Refunds` moves to a new `Payments` nav group |
| AQ-2 | 78 | `Side with customer` replaces the mockup's `Refund customer` |
| AQ-3 | 79 | The resolution note is visible to customer and runner; internal admin-only notes stay separate |
| AQ-4 | 80 | Merchant amounts only for Buy For Me and Get It For Me; detail changes after a merchant-direct payment started warn the customer, never block |
| AQ-5 | 81 | The ceiling includes the item amount paid to Nitume, even after the runner bought the item |
| AQ-6 | 82 | `KSh` in notifications; no receipt edits after `refunded`, corrections through an auditable correction/reversal |
| AQ-R1 | 72 | Re-quote while ACCEPTED, no state change |
| AQ-R2 | 83 | Every quote requires an expiry, default 24 h |

Answered 2026-10-12:

| AQ | BOARD row | Answer |
|---|---|---|
| AQ-7 | 96 | 12-hour East Africa Time in the admin; backend timestamps stay canonical (§3.1) |
| AQ-8 | 102 | Paid tasks ending CANCELLED, EXPIRED or FAILED open a refund review (review trigger, not an automatic refund); labels `Task expired`, `Task failed` (§6) |

Answered 2026-10-13:

| AQ | BOARD row | Answer |
|---|---|---|
| AQ-9 | 109 | Only a re-sent payout notifies the customer; payout corrections and reversals do not by default |
| AQ-10 | 110 | A correction must not record an amount above the applicable refund ceiling |
| — | 111 | A reversed, not-yet-re-sent payout stays committed at the decided refund amount and keeps counting against the cumulative refund cap (row 87) |

Answered 2026-10-13 (rows 112–139): applied in §1 and the runner payout specs.

Answered 2026-10-16:

| AQ | BOARD row | Answer |
|---|---|---|
| AQ-11 | 146 | A request paid below the requested amount closes `paid`; requested and paid amounts stored and shown separately; the remainder stays owed for a new request |
| RQ-23 | 142 | Ordinary approval capped at min(item paid to Nitume, purchase limit); above the limit only through an explicit, audited exception (reason + actor); not by raising the limit first |

Answered 2026-10-16 (round 9): rows 145/160 (override table approved, no scope), 148 (cap on every task), 157 (admin-offer lapse keeps RUNNER_ASSIGNED), 159 (KES 500 minimum), 161–163, 165, 166 (§1).

Answered 2026-10-16 (round 10, §1): AQ-12 (row 167, matching exhausted; `deadline_at` trigger then open, decided by row 185 in round 11), AQ-13 (row 168, reason never shown to the runner), AQ-14 (row 169, 10–500, mandatory, whitespace-only invalid), AQ-15 (row 170, reviewer note deleted at purge), AQ-16 (row 171, audited `Re-review evidence`); RQ-30 (row 175, purge guards kept); RQ-31 (row 176, customer label only).

Answered 2026-10-16 (round 10 fix, §1): AQ-17 (row 177, offline = unavailable), AQ-18 (row 178, declined/lapsed runners excluded), AQ-19 (row 179, no automatic expiry until the full pool exists), AQ-20 (row 180, endpoint and optional ≤ 500 note), AQ-21 (row 181, re-review never changes the decision); CQ-176a–c (rows 182–184, customer only).

Answered 2026-10-19 (round 12, §1): row 201 with its follow-up (admin `Expire task`, PAYMENT_CONFIRMED → EXPIRED) and row 214; AQ-22 (row 202, rule approved), AQ-23 (row 203, reason required 10–500), AQ-24 (row 204, offline/busy don't block exhaustion), AQ-25 (row 205, offer ends at the deadline), AQ-26 (row 206, deadline required; default → row 221), AQ-27 (row 207, no pre-offer exception); rows 208, 210–213, 215–218.

Answered 2026-10-19 (round 13, §1): rows 220, 221, 225 (AQ-28), 226 (AQ-29), 227 (AQ-30), 228 (AQ-31), 229, 231, 232.

Answered 2026-10-19 (round 14): AQ-32 (row 233, refuse at quote/create), row 234, row 235.

Open:
| AQ | Question | Default |
|---|---|---|
| — | none open for these specs (AQ-33 = row 236, AQ-34 = row 237 and row 238 answered 2026-10-19) | — |
| AQ-38 | (2026-10-21, security/verification rule, follows row 261) (a) Does a Level-2 runner drop to Level 1 when a Level-2 check is re-uploaded (new pending) or rejected on re-verification? (b) Do legacy ID images with `side = null` count toward Level 2? (c) Re-evaluate runners already at Level 2 under the old one-side rule? | Recommended: (a) keep Level 2 while a replacement is pending, drop only when the newest record of a Level-2 check is rejected; (b) no; (c) re-evaluate, listing affected runners for ops first. The admin screen shows the API's level either way |
| AQ-40 | (2026-10-21, row 278, security: rows 125, 144, 154) The documents view renders ID / selfie images inline, so opening it fetches and logs one `view` per stored image (up to 4: ID front, ID back, legacy ID, selfie) with no per-image click, also when the admin only decides another check. Replaces the built "fetch only on click, never prefetch" rule. Signed links (≤ 5 min), admin-only access and per-call logging are unchanged | Recommended: approve; keep the existing `view` log action (no access-log schema change); fetch only on open, never in the table, never cached beyond the view (`drawer-runner-verification.md`). Alternative: a per-image `Show image` click inside the view **Answered row 279: approved; images load and are logged on drawer open, never in the table, dropped on close, refetched only on expiry / retry.** |
| AQ-41 | (2026-10-21, row 278, security / privacy) Inline images may stay in the browser's own HTTP cache after the view closes; the client cannot clear it. Require the storage link to send `Cache-Control: private, no-store` (api-contract AV-4 checks Cloudinary)? | Recommended: require `no-store` if Cloudinary allows it on authenticated downloads; if not, accept the browser cache for now and record it (streaming images through the API is a larger change) **Closed row 280: browser cache accepted.** |
| AQ-42 | (2026-10-21, row 278, scope) The separate documents view as the existing right-hand drawer (420 px, with a full-size image viewer) or a full routed page | Recommended: drawer: every admin list → detail uses it, the admin has no routed detail pages, the table stays visible behind it **Answered row 281: drawer.** |
| AQ-43 | (2026-10-21, row 278, scope) Add an applied-date range filter and sortable columns to the verification table now? | Recommended: later. This round: status, service area, level and search; order per filter as confirmed in row 264 **Answered row 282: no date filter, no sorting.** |
| AQ-44 | (2026-10-21, row 278, security / third-party) HEIC / HEIF uploads (allowed since row 163) do not render in Chrome, Edge or Firefox. Allow a JPEG rendition at Cloudinary for the signed link (a derived copy at the provider, which the retention purge must delete with the original)? | Recommended: yes, with api-contract confirming the purge removes derived renditions (AV-3) **Answered row 283: API-side (AV-3 on `feat/api-verification-queue-filters`), no client change.** |

Answered 2026-10-21 (rows 260–262, §1): AQ-35 → one card per runner, per-row `Approve` / `Reject`, no bulk action; AQ-36 → Level 2 only when both ID sides and the selfie are approved; AQ-37 → optional internal reject note ≤ 500, never shown to the runner.

Answered 2026-10-16 (round 11, §1): row 185 (deadline path), 186 (purchase limit in the pool), 187 (empty online pool, no PAYMENT_CONFIRMED → EXPIRED, busy runners ineligible, admin expire action), 188–200.

Answered 2026-10-16 (round 8): row 151 (purchase-limit exception stored in `task_exposure_overrides`), row 152 (limit stored at obligation creation, never recalculated), row 150 (auto-offer fall-through), rows 153–156 (§1).
