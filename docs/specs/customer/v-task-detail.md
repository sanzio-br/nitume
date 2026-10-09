# v-task-detail — Task detail

- Mockup: `docs/design/nitume_customer_app.html` lines 482–506 (`#v-task-detail`, overlay)
- Shared conventions: `_shared.md` (OA-n §0, fees §8)
- Implementation: `apps/customer_app/lib/src/screens/task/task_detail_screen.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Record of one task in any state: status, reference and time, runner, evidence, payment breakdown, the next action, and a way to report a problem.

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
| others | none | — |

Report row visible in IN_PROGRESS, AWAITING_CUSTOMER and COMPLETED (§3.3 + OA-9). Hidden in all other states (including CONFIRMED/SETTLED: row 35 answered, they are system-only states after the dispute window and the customer sees them as `Completed`). DISPUTED shows `View your report`.

## Layout (top to bottom)
1. Pushed header (C-10) `Task detail`.
2. Scrollable body:
   1. Summary card (C-07): status chip (C-05), title 16/700 (margin `10 0 4`), meta Fira Code 12 slate-600 (`#NT-10482 · Today, 10:03 AM`).
   2. Primary action (table above).
   3. Section label `Runner`; card with C-21 (avatar 36, name 13.5/600, meta Fira Code 11 `Verified · 4.9 · 137 tasks`). Hidden when no runner was assigned.
   4. Section label `Evidence`; evidence grid (C-25). Hidden when there is no evidence.
   5. Section label `Payment`; receipt card (C-18, dashed): `Service fee`, `Runner fee`, total `Total paid`; separate group for `Item amount` + route line (§8) and, while due, link `View payment details` (C-04).
   6. Destructive menu row (C-24: red text, slate-400 chevron, OA-13), margin-top 4.

## Components
C-10, C-07, C-05, C-01, C-08, C-21, C-25, C-18, C-04, C-24. All built (C-18 separate group, C-24 red text: changes listed in `_shared.md`).

## Copy (exact from the mockup unless marked)
- Header: `Task detail`
- Chip: `Completed` (labels per `_shared.md` §6)
- Title: `Apartment check — Nyali`
- Meta: `#NT-10482 · Today, 10:03 AM` (reference from the API, OA-15)
- Sections: `Runner`, `Evidence`, `Payment`
- Runner: `Brian K.`, `Verified · 4.9 · 137 tasks`
- Payment: `Service fee` `KSh 700`; `Runner fee` `KSh 1,500`; `Total paid` `KSh 2,200`; `Item amount` (proposed)
- Row: `Report a problem with this task`; DISPUTED: `View your report` (proposed)
- Action buttons: see the table (proposed)

States (proposed):
- Loading: skeleton cards. Error: C-33 `Couldn't load this task.` + `Try again`.
- Not paid (before PAYMENT_CONFIRMED): Payment section shows the 13 slate-600 line `Not paid yet.` instead of the receipt.
- Cancelled after payment: receipt as paid; refund lines **pending row 37** (show nothing about refunds until decided).

## Numeric fields (Fira Code)
- Reference, timestamp, rating `4.9`, task count `137`, all amounts.

## Data
- `GET /api/v1/errands/:id` (exists; assignment + runner summary on `feat/api-customer-gaps`). needs: api-contract — `reference`, `title` (OA-15), runner `displayName` (OA-2), dispute id when DISPUTED.
- `GET /api/v1/runners/:id/profile` (exists; `avgRating`, `errandsCompleted`, `verificationLevel`).
- `GET /api/v1/errands/:errandId/evidence` (exists; URLs pending row 25).
- `GET /api/v1/payments/:errandId` (exists). Fee mapping TODO pending row 34.
- `GET /api/v1/errands/:errandId/rating` to decide whether to show `Rate this task`.
- "Verified" = `verificationLevel` ≥ `2_id_verified` (Q4 default).

## Accessibility and mobile
- Report row 48dp; red text on white (`#C1433C` ≈ 4.4:1) is just under AA for 13.5px; same family as pending row 33.

## Resolved by owner answers
- Names, red destructive row, title and reference: OA-2, OA-13, OA-15 (was Q1).
- Report states: AWAITING_CUSTOMER added by OA-9 (was Q5); dispute screens specced in `x-report-problem` (was Q3).

## Open questions (non-blocking; build default given)
- Q2: Active tasks open this screen with a `Track live` button (default, as the table above).
- Q4: Which verification level counts as "Verified"? Default `2_id_verified` or higher.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: `View your report` only in DISPUTED (spec: also after a dispute existed); `Rate this task` only in COMPLETED (spec updated for row 35 to include CONFIRMED/SETTLED; latent until the payout scheduler runs).
