# v-job-detail — Job offer

- Mockup: `docs/design/nitume_runner_app.html` lines 354–373 (`#v-job-detail`, overlay)
- Shared conventions: `_shared.md` (§6, §7, §8 money and purchase limit)
- Implementation: none
- Status: missing

## Purpose
Full details of one offer (map, instructions, distance, time, payout, purchase terms) so the runner can accept or decline it. Row 108: shows when the required purchase is above the runner's limit and that they may decline.

## Entry / exit
- Entry: offer card on `v-jobs`; push / notification `New job offer` (deep link with the errand id).
- Back (C-10) → previous screen.
- `Accept job` → accept (RA-1; the task moves RUNNER_ASSIGNED → RUNNER_EN_ROUTE, row 113) → shell with the **Active** tab on this job (mockup `jump('v-active', true)` lands on Jobs: mockup bug, `_shared.md` §1).
- `Decline` → R-23 decline dialog with the reason picker (row 210; the same component and copy as `v-jobs.md` "Decline reason picker"; `Above my purchase limit` listed and pre-selected only when over the limit) → back to `v-jobs`, offer removed (mockup `pop()`).
- Offer expired/withdrawn while open → C-40 notice `This offer is no longer available.`, buttons hidden, C-03 `Back to jobs`. The same state when the task's customer deadline passes while the offer is open (rows 185, 205: the offer ends at once and `offerExpiresAt` never exceeds `deadlineAt`): the screen switches at the earlier of `offerExpiresAt` and `deadlineAt` (the `Deadline` row it already shows), or on `job:offer_withdrawn`; the deadline is never named as the reason.

## Task states
Offered: RUNNER_ASSIGNED with this runner's assignment `offered` (row 113); offer window 10 min for admin offers, 90 s for auto-offers (row 114). A small Fira Code line under the header shows the time left (`Offer ends in 7:42`, proposed) and the screen switches to the expired notice at 0. With `offerExpiresAt = null` (offers made before the deadline change, row 156) the line is hidden and the client never switches to the expired notice on its own (only `job:offer_withdrawn` or a refused accept does). The runner is never told what happened to the task after its offer lapsed (runner `_shared.md` §6 "Offer outcomes", rows 150, 155, 157, 167). Any other state opened from a stale notification → show the job's R-01 chip and route: held by this runner → `v-active`; otherwise the expired notice.

## Layout (top to bottom)
1. C-10 header `Job offer`.
2. R-16 job map (margin 0 20 14, height 190, r 16): task-site/pickup pin (green), drop-off pin (blue) when the errand has one, device position, dashed route line (mockup). Placeholder body without a maps key. No nav chip here.
3. Detail card C-07 (margin 0 20 12, padding 16):
   - Top row: R-14 category tag left, pay Fira Code 17/600 right.
   - Title 14/600, margin 0 0 4.
   - Description 12.5 slate-600, margin 0 0 10 (customer `description`, full text, no truncation).
   - Shopping list (Buy For Me / Get It For Me with `items`, proposed): C-08 inner label `Items` then one line per item `2 × Milk 500 ml` (quantity Fira Code), notes 11.5 slate-600.
   - R-05 rows (hairlines): `Distance` → `1.2 km` (Fira Code); (no `Estimated time` row: row 120 decided there is no duration field); `Deadline` → `Today, 6:00 PM` (EAT, Fira Code, from `deadlineAt`; every task has one, row 206, so the row always shows; a legacy task without one hides the row); `Payout` → `KSh 1,750` (runner fee, Fira Code).
   - Purchase rows (only when the errand has an item amount, §8): `Item amount` → `KSh 5,000`; `How it's paid` → `Customer pays the merchant` (`merchant_direct`) or `You pay, reimbursed after the customer confirms` (`send_to_runner`).
   - Addresses (proposed): `Pickup` / `Drop-off` / `Task location` rows with `addressText` (Sans 13, wraps).
4. Over-limit notice (row 108; `send_to_runner` item amount > `maxPurchaseAdvance`; a fallback since row 186, which stops such offers being made, for a limit changed after the offer): C-40 under the card, margin 0 20 12: `This job needs a purchase of KSh 5,000, above your limit of KSh 3,000. You can decline it. It won't count against you.` (row 113: over-limit declines are not penalised).
5. Reimbursement note (`send_to_runner`, proposed, 11.5 slate-600, padding 0 20): `Keep the receipt. You'll upload it before you finish, and we reimburse the item amount once the customer confirms and the review window closes.`
6. Bottom action row (padding 0 20, gap 10, above the safe area): C-03 `Decline` + C-01 `Accept job`, equal width, pill (mockup radius 14).
   - Over the limit: `Accept job` disabled with caption `Above your purchase limit` (row 113: accept is refused; the API answers `purchase_limit_exceeded`).
   - Not verified or offline: buttons hidden, C-40 `Go online to accept jobs.` / verification copy.

## Components
| Element | Component | Status |
|---|---|---|
| Header | C-10 | exists |
| Map | R-16 (C-31 body) | NEW (composition) |
| Card, tag, rows | C-07, R-14, R-05 | NEW (R-14, R-05) |
| Notices | C-40 | exists |
| Buttons | C-01, C-03 | exists |
| Decline dialog with reasons | R-23 (C-35 + C-16 `NitumeRadioRow`, row 210) | NEW (core-ui) |

## Copy
Exact, from the mockup: `Job offer`, `Distance`, `Payout` (`Estimated time` dropped, row 120), `Decline`, `Accept job`; sample description `Video the compound, both bedrooms and the bathroom. Speak to the caretaker about the reported water leak.` (customer-written; the app shows the real `description`).

Proposed: `Distance` value `Distance unavailable` (Sans) when the device has no fix (builder, accepted 2026-10-19); the decline dialog copy (`v-jobs.md`), `Deadline`, `Items`, `Item amount`, `How it's paid`, `Pickup`, `Drop-off`, `Task location`, the over-limit notice, the reimbursement note, `This offer is no longer available.`, `Back to jobs`, accept errors (`This job is above your purchase limit.`, `That offer is no longer available.`, `You already have an active job.`).

## Numeric fields (Fira Code)
- Pay; `Distance`; offer time left; `Deadline`; `Payout`; `Item amount`; limit and item amounts inside the notice; item quantities.

## Data
- Offer detail: **missing / shape mismatch** (RA-2). `GET /errands/:id` refuses a runner who is only offered (`canView` = current assignment only) and, for a holder, returns the customer `ErrandView` (`feeTotal` = customer fee total, which the runner must not see) without the runner fee, item amount or merchant route. Needed: a runner projection, e.g. `GET /runners/me/offers/:assignmentId` or `GET /errands/:id` with a runner shape: `{ id, reference, category, title, description, items, locations, deadlineAt, runnerFee, itemAmount, merchantRoute, maxPurchaseAdvance, overPurchaseLimit, offerExpiresAt }`, no customer phone, no service fee, no `feeTotal`.
- `POST /errands/:id/accept`, `POST /errands/:id/decline` `{ reason: 'over_purchase_limit' | 'too_far' | 'not_available' | 'other' }` (RA-1; row 210 adds the last three, to build); accept refuses over the limit (`purchase_limit_exceeded`, RA-3), when the offer expired (409 `offer_expired`), after the task's deadline (409 `offer_expired` with `reason: 'task_deadline_passed'`, built on `feat/api-runner-1`; → `That offer is no longer available.`), or when busy (`runner_busy`; busy = a job in RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS, row 211).
- Socket `job:offer_withdrawn` (RA-5).
- **Built vs needed** (row 137): the offer model replaces the decline-only build. RA-1/RA-2 (offer detail runner projection, accept, decline, expiry) are api-contract work; `GET /errands/:id/purchase-check` stays usable for the current offer once offered runners can read it.
- States: as above.

## Accessibility and mobile
- Map is decorative for screen readers (`Map of the task location`); the address rows carry the information.
- Buttons stay above the bottom safe area; body scrolls.
- Disabled accept explains why (caption read with the button).

## Decisions (owner, 2026-10-13)
- Row 113 (RQ-1, RQ-1 b): offer model as above; accept above the limit refused; over-limit decline not penalised.
- Row 114 (RQ-2): 10-minute admin offers.
- Row 120 (RQ-8): no estimated time.
- Rows 150, 155, 156 (2026-10-16): auto-offer lapse → next eligible runner; decline → stays RUNNER_ASSIGNED, no deadline change; pre-change offers without a deadline unchanged. Row 157 (2026-10-16): an admin-offer lapse expires the offer and leaves the task RUNNER_ASSIGNED for the admin to offer it to another runner; EXPIRED only when matching is exhausted (row 167, 2026-10-16), or at the customer deadline with no runner accepted, which takes precedence (row 185, 2026-10-16). Rows 186, 187 (c): runners below the task's purchase or on another active task are not offered it. Row 178: after declining or letting this offer lapse, the runner is never offered this task again.
- Rows 205, 206, 207, 210, 211 (owner 2026-10-19): the offer ends at the deadline (capped `offerExpiresAt`); every task has a deadline; no pre-offer purchase-limit exception; decline reason picker with four reasons; busy = RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS.

## Questions
- RQ-32 decided (row 229): a decline reason is required in the app; `Other reason` has no text box (`v-jobs.md`).
- Rows 157, 167, 185 and 205 (decided) change only when the offer ends (the earlier of `offerExpiresAt` and `deadlineAt`); no new copy. RQ-22 (row 141) decided 2026-10-16: at the deadline the offer expires; no acceptance after expiry. When the countdown reaches zero the screen switches to the `This offer is no longer available.` state and hides `Accept` without waiting for the server.
