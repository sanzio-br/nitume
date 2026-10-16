# v-task-detail — Task detail

- Mockup: `docs/design/nitume_customer_app.html` lines 482–506 (`#v-task-detail`, overlay)
- Shared conventions: `_shared.md` (OA-n §0, fees §8)
- Implementation: `apps/customer_app/lib/src/screens/task/task_detail_screen.dart` on branch `feat/customer-integrations`
- Status: partial (round 8, 2026-10-16: EXPIRED copy and `Start a new task` not built)

## Purpose
Record of one task in any state: status, reference and time, runner, evidence, payment, **refund status** (row 54), the next action, and a way to report a problem.

## Entry / exit
- Entry: Home "Recent" row; History card (all cards, including Cancelled); notification deep links for finished tasks; Track status card "View task".
- Back → previous screen.
- Primary action (by state, below) → its screen.
- "Report a problem with this task" → push `x-report-problem` (write mode). DISPUTED → `View your report` → `x-report-problem` (read mode).
- Evidence thumb → push `x-evidence-viewer`.
- Payment section `View payment details` → push `x-merchant-payment` (while an item amount is due).

## Task states
Any. Primary action button (C-01, full width, margin `0 20 14`, under the summary card) by state:

| State | Button | Target |
|---|---|---|
| REQUESTED | `View request` | `x-awaiting-quote` |
| QUOTED | `Review quote` | `x-awaiting-quote` |
| ACCEPTED | `Pay now` | `v-payment` |
| PAYMENT_CONFIRMED … IN_PROGRESS | `Track live` | `v-track` |
| AWAITING_CUSTOMER | `Review evidence` | `v-evidence-confirm` |
| COMPLETED, CONFIRMED or SETTLED (no rating yet) | `Rate this task` | `v-rate` |
| EXPIRED (owner, 2026-10-16: the EXPIRED notification gives the next action) | `Start a new task` | `v-new-category` |
| others | none | — |

Report row visible in IN_PROGRESS, AWAITING_CUSTOMER and COMPLETED (§3.3 as updated 2026-10-08). In COMPLETED it shows only while the dispute window is open (24 h placeholder, configurable, restarted after a dispute resolves to COMPLETED; row 50); after that the system moves the errand to CONFIRMED. Hidden in all other states (CONFIRMED/SETTLED are system-only and read `Completed`, row 35). A task with a dispute (DISPUTED, or COMPLETED/CANCELLED after resolution, row 36) shows `View your report`.

## Layout (top to bottom)
1. Pushed header (C-10) `Task detail`.
2. Scrollable body:
   1. Summary card (C-07): status chip (C-05), title 16/700 (margin `10 0 4`), meta Fira Code 12 slate-600 (`#NT-10482 · Today, 10:03 AM`).
   2. Primary action (table above).
   3. Section label `Runner`; card with C-21 (avatar 36, name 13.5/600 = API short name, row 40; meta Fira Code 11 `Verified · 4.9 · 137 tasks`). Hidden when no runner was assigned.
   4. Section label `Evidence`; evidence grid (C-25). Hidden when there is no evidence.
   5. Section label `Payment`; receipt card (C-18, dashed): **one** total row `Total (service + runner fee)` (row 34 clarification; no `Service fee` / `Runner fee` lines); separate group for `Item amount` + route line (`Paid to the merchant directly` / `Paid to Nitume for your runner`) and, while an amount is due, link `View payment details` (C-04).
   6. Refund group (`_shared.md` §11), only when the errand has a refund review: inside the same receipt card under a hairline, a row `Refund` with the status chip (C-05) right-aligned; the 13 slate-600 status line under it; for `approved` / `refunded` a receipt row `Refund amount` — amount (Fira Code). Several reviews (e.g. a price decrease, then a cancellation) are listed newest first, one group each.
   7. Destructive menu row (C-24: red text, slate-400 chevron, OA-13), margin-top 4.

## Components
C-10, C-07, C-05, C-01, C-08, C-21, C-25, C-18, C-04, C-24. All built (C-18 separate group, C-24 red text: changes listed in `_shared.md`).

## Copy (exact from the mockup unless marked)
- Header: `Task detail`
- Chip: `Completed` (labels per `_shared.md` §6)
- Title: `Apartment check — Nyali`
- Meta: `#NT-10482 · Today, 10:03 AM` (reference from the API, OA-15)
- Sections: `Runner`, `Evidence`, `Payment`
- Runner: `Brian K.`, `Verified · 4.9 · 137 tasks`
- Payment: `Total (service + runner fee)` `KSh 2,200` (row 34 clarification replaces the mockup's `Service fee` / `Runner fee` / `Total paid` lines); `Item amount` (proposed); route lines (proposed) `Paid to the merchant directly`, `Paid to Nitume for your runner`
- Refund (proposed, `_shared.md` §11): `Refund`; chips `Refund under review`, `Refund approved`, `Refunded`, `No refund`; status lines as in §11; `Refund amount`
- Row: `Report a problem with this task`; DISPUTED: `View your report` (proposed)
- Action buttons: see the table (proposed)

States (proposed):
- Loading: skeleton cards. Error: C-33 `Couldn't load this task.` + `Try again`.
- Not paid (before PAYMENT_CONFIRMED): Payment section shows the 13 slate-600 line `Not paid yet.` instead of the receipt.
- Cancelled after payment (price-change reject, customer-favourable dispute, late payment): receipt as paid, plus the refund group. If the API has not opened the review yet, show nothing about refunds.
- **Expired or failed after payment (row 102)**: an EXPIRED or FAILED task that was paid shows the receipt as paid (not `Not paid yet.`), plus the refund group. While the review is `pending_review` the line under the chip follows the trigger (`_shared.md` §11):
  - EXPIRED (`expired_after_payment`): `We couldn't find a runner for this task in time. We're reviewing a refund and will let you know the outcome.`
  - FAILED (`failed_after_payment`): `This task couldn't be completed. We're reviewing a refund and will let you know the outcome.`
  - EXPIRED with no refund review (never paid, or before the API opens it): 13 slate-600 line under the chip `No runner accepted your task in time.` (proposed, same wording as the `errand.EXPIRED` notification, `v-notifications.md`).
  - Decided reviews use the common lines (`Refund approved`, `Refunded`, `No refund`). Never write that a refund is automatic or guaranteed: it is a review (row 102). Before the API opens the review (and for an EXPIRED/FAILED task that was never paid), show nothing about refunds.
- **Corrected payouts (row 100)**: nothing extra. The refund group shows whatever effective status and amount the API returns (a reversed payout reads `Refund approved` until a new payout is sent).
- Refund status changes live: refresh on `errand:status_changed` and on a refund notification (event type needs api-contract).

## Numeric fields (Fira Code)
- Reference, timestamp, rating `4.9`, task count `137`, all amounts including the refund amount, the refund sent date/time.

## Data
- `GET /api/v1/errands/:id` (exists; assignment + runner summary, `reference`, `title`). needs: api-contract — runner short name (row 40); the dispute lookup exists (`GET /disputes?errandId=`).
- `GET /api/v1/runners/:id/profile` (exists; `avgRating`, `errandsCompleted`, `verificationLevel`).
- `GET /api/v1/errands/:errandId/evidence` (exists; signed short-lived URLs, row 25).
- `GET /api/v1/payments/:errandId` (exists): fee total and item payment. The client shows only the fee total (row 34 clarification).
- Refund status: `GET /api/v1/errands/:errandId/refunds` (customer view, on `main`) → `[{ status, refundAmount, paidAt, trigger, … }]`. It never carries the decision note (row 69). needs: api-contract (minor) — drop `payoutReference` from the customer view too (`refunds.service.ts` `toCustomerView`); the client never shows it either way. Schema approved (rows 62, 94). Hidden while the API returns none.
- `GET /api/v1/errands/:errandId/rating` to decide whether to show `Rate this task`.
- "Verified" = `verificationLevel` ≥ `2_id_verified` (Q4 default).

## Accessibility and mobile
- Report row 48dp; red text on white (`#C1433C` ≈ 4.4:1) is just under AA for 13.5px (row 33 covers chip text only; noted, no change).

## Resolved by owner answers
- Names, red destructive row, title and reference: OA-2, OA-13, OA-15 (was Q1).
- Report states: AWAITING_CUSTOMER added by OA-9 (was Q5); dispute screens specced in `x-report-problem` (was Q3).
- Refund status visible to the customer (row 54); refund amount set by an admin (row 37); decrease refunds (row 48).
- Fee display: total only (row 34 clarification).
- Refund decision note never shown (row 69, was SQ-10); status and amount only.
- Refund ceilings (rows 81, 87) are admin-side; nothing changes here. Several reviews per task are listed newest first, as specced.
- Decrease reviews appear only on `send_to_runner` tasks (row 86). Amounts in `KSh` (row 82).
- Row 102 (2026-10-12): paid EXPIRED/FAILED tasks get a refund review; trigger-specific pending lines above.
- Row 100 (2026-10-12): payout corrections are invisible to the customer; the group reflects the latest effective payout.
- Row 101 (2026-10-12): no `payoutReference` in the customer refund view (already handled).

## Open questions (non-blocking; build default given)
- Q2: Active tasks open this screen with a `Track live` button (default, as the table above).
- Q4: Which verification level counts as "Verified"? Default `2_id_verified` or higher.

## Current vs design
Re-audit round 5, 2026-10-12, `feat/customer-owner-answers-5` (core `ad44dc6`, app `5cbd081`; API `feat/api-owner-answers-5` @ `6ce9ad2`): **PASS**, no findings. Items 1–4 of the row-102 update below are closed: core `RefundTrigger` has `expiredAfterPayment` / `failedAfterPayment`; `RefundGroup` picks the trigger-specific pending line (exact `_shared.md` §11 copy, wildcard fallback to the common line); tests cover paid EXPIRED, paid FAILED, an other-trigger fallback, an unpaid EXPIRED (no refund group) and a reversed payout (`Refund approved`, amount, no `Sent` line). Details in `docs/audits/customer-gap-report.md` → "Re-audit 2026-10-12: customer round 5".

Spec update 2026-10-12 (row 102) against `main` @ `4963a1c`: status set to **partial**.
1. Core `RefundTrigger` (`packages/nitume_core/lib/src/models/enums.dart:436-443`) has no `expired_after_payment` / `failed_after_payment`; `tryFromWire` returns `null` for them, so the app cannot pick the trigger-specific line. Needs core-ui.
2. The refund group shows the generic pending line for every trigger. Add the two trigger-specific lines (via the shared refund-group widget, not inline in the screen) and tests for EXPIRED and FAILED tasks with a pending review, plus an EXPIRED task with no review (no refund group).
3. Confirm the Payment section treats a paid EXPIRED/FAILED task as paid (receipt, not `Not paid yet.`); `task_detail_screen.dart:259` keys on `paid`, which should already hold. Test it.
4. Row 100: no client change (the API maps the effective payout into the existing fields).

Spec update 2026-10-09 (rows 69, 81, 82, 86, 87): no client change; the build already hides the decision note. Status unchanged.

Re-audit round 2, 2026-10-09, `feat/customer-integrations` @ `7192a77`: PASS. `View payment details` now uses Track's `itemAmountDue()` (round-1 minor closed).

Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Total-only fee row, item amount with route line, refund groups (§11), `View your report` after a dispute, live refresh. Minor: `View payment details` also shows for a send_to_runner item already paid in the combined STK (opens and closes with `Nothing to pay right now.`).

Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: `View your report` only in DISPUTED (spec: also after a dispute existed); `Rate this task` only in COMPLETED (spec updated for row 35 to include CONFIRMED/SETTLED; latent until the payout scheduler runs).

Re-audit round 3 (2026-10-08): PASS against the earlier spec; the round-1 `View your report` and rating minors are fixed. Spec update 2026-10-08, rows 34, 36, 40, 50, 54: the build shows `Service fee` / `Runner fee` / `Total paid` from the payment record and no refund information. Now required: the single `Total (service + runner fee)` row, the refund group (once the API exposes it), the `send_to_runner` route line, and the report row hidden in COMPLETED after the dispute window. Status set to `partial` until re-audited.
