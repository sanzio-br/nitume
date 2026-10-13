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
- `Accept job` → accept (RA-1) → shell with the **Active** tab on this job (mockup `jump('v-active', true)` lands on Jobs: mockup bug, `_shared.md` §1).
- `Decline` → C-35 decline dialog (as `v-jobs`, with reason) → back to `v-jobs`, offer removed (mockup `pop()`).
- Offer expired/withdrawn while open → C-40 notice `This offer is no longer available.`, buttons hidden, C-03 `Back to jobs`.

## Task states
Offered: PAYMENT_CONFIRMED or RUNNER_ASSIGNED with this runner's assignment `offered` (RQ-1). Any other state opened from a stale notification → show the job's R-01 chip and route: held by this runner → `v-active`; otherwise the expired notice.

## Layout (top to bottom)
1. C-10 header `Job offer`.
2. R-16 job map (margin 0 20 14, height 190, r 16): task-site/pickup pin (green), drop-off pin (blue) when the errand has one, device position, dashed route line (mockup). Placeholder body without a maps key. No nav chip here.
3. Detail card C-07 (margin 0 20 12, padding 16):
   - Top row: R-14 category tag left, pay Fira Code 17/600 right.
   - Title 14/600, margin 0 0 4.
   - Description 12.5 slate-600, margin 0 0 10 (customer `description`, full text, no truncation).
   - Shopping list (Buy For Me / Get It For Me with `items`, proposed): C-08 inner label `Items` then one line per item `2 × Milk 500 ml` (quantity Fira Code), notes 11.5 slate-600.
   - R-05 rows (hairlines): `Distance` → `1.2 km` (Fira Code); `Estimated time` → `45 min` (Fira Code; hidden until the API has a duration, RQ-8); `Deadline` → `Today, 6:00 PM` (EAT, Fira Code, proposed, from `deadlineAt`); `Payout` → `KSh 1,750` (runner fee, Fira Code).
   - Purchase rows (only when the errand has an item amount, §8): `Item amount` → `KSh 5,000`; `How it's paid` → `Customer pays the merchant` (`merchant_direct`) or `You pay, reimbursed after the customer confirms` (`send_to_runner`).
   - Addresses (proposed): `Pickup` / `Drop-off` / `Task location` rows with `addressText` (Sans 13, wraps).
4. Over-limit notice (row 108; `send_to_runner` item amount > `maxPurchaseAdvance`): C-40 under the card, margin 0 20 12: `This job needs a purchase of KSh 5,000, above your limit of KSh 3,000. You can decline it without any effect on your rating.` (proposed; the "no effect" clause only if RQ-1 b confirms declines over the limit carry no penalty).
5. Reimbursement note (`send_to_runner`, proposed, 11.5 slate-600, padding 0 20): `Keep the receipt. You'll upload it before you finish, and we reimburse the item amount once the customer confirms and the review window closes.`
6. Bottom action row (padding 0 20, gap 10, above the safe area): C-03 `Decline` + C-01 `Accept job`, equal width, pill (mockup radius 14).
   - Over the limit: `Accept job` disabled with caption `Above your purchase limit` (default, RA-3 refuses accept with `purchase_limit_exceeded`); if the owner allows accepting over the limit, keep it enabled and show the notice only.
   - Not verified or offline: buttons hidden, C-40 `Go online to accept jobs.` / verification copy.

## Components
| Element | Component | Status |
|---|---|---|
| Header | C-10 | exists |
| Map | R-16 (C-31 body) | NEW (composition) |
| Card, tag, rows | C-07, R-14, R-05 | NEW (R-14, R-05) |
| Notices | C-40 | exists |
| Buttons | C-01, C-03 | exists |
| Decline dialog | C-35 + radio rows (C-16 radio-row variant `NitumeRadioRow`) | exists |

## Copy
Exact, from the mockup: `Job offer`, `Distance`, `Estimated time`, `Payout`, `Decline`, `Accept job`; sample description `Video the compound, both bedrooms and the bathroom. Speak to the caretaker about the reported water leak.` (customer-written; the app shows the real `description`).

Proposed: `Deadline`, `Items`, `Item amount`, `How it's paid`, `Pickup`, `Drop-off`, `Task location`, the over-limit notice, the reimbursement note, `This offer is no longer available.`, `Back to jobs`, accept errors (`This job is above your purchase limit.`, `That offer is no longer available.`, `You already have an active job.`).

## Numeric fields (Fira Code)
- Pay; `Distance`; `Estimated time`; `Deadline`; `Payout`; `Item amount`; limit and item amounts inside the notice; item quantities.

## Data
- Offer detail: **missing / shape mismatch** (RA-2). `GET /errands/:id` refuses a runner who is only offered (`canView` = current assignment only) and, for a holder, returns the customer `ErrandView` (`feeTotal` = customer fee total, which the runner must not see) without the runner fee, item amount or merchant route. Needed: a runner projection, e.g. `GET /runners/me/offers/:assignmentId` or `GET /errands/:id` with a runner shape: `{ id, reference, category, title, description, items, locations, deadlineAt, runnerFee, itemAmount, merchantRoute, maxPurchaseAdvance, overPurchaseLimit, offerExpiresAt }`, no customer phone, no service fee, no `feeTotal`.
- `POST /errands/:id/accept`, `POST /errands/:id/decline` `{ reason }` (RA-1, missing); accept refuses over the limit (`purchase_limit_exceeded`, RA-3), when the offer expired (`offer_expired`), or when busy (`runner_busy`).
- Socket `job:offer_withdrawn` (RA-5).
- **Built so far (row 137)**: there is no offer to open. The row-108 decline exists only for the assigned job (`POST /errands/:id/assignment/decline` `{ reason: 'over_purchase_limit' }`, RUNNER_ASSIGNED only; errors 409 `purchase_within_limit`, `assignment_not_declinable`), specced on `v-active` §6a. `GET /errands/:id/purchase-check` returns `{ requiredPurchase, maxPurchaseAdvance, overLimit }` for the current assignment only. This screen stays blocked on RQ-1 (row 113) and RA-1/RA-2; the over-limit notice and decline wording above carry over unchanged once offers exist. Accept-over-limit refusal (`purchase_limit_exceeded`) is not built because there is no accept.
- States: as above.

## Accessibility and mobile
- Map is decorative for screen readers (`Map of the task location`); the address rows carry the information.
- Buttons stay above the bottom safe area; body scrolls.
- Disabled accept explains why (caption read with the button).

## Questions
- RQ-1 (state machine): offer/accept model (blocking).
- RQ-1 b (payments/policy): may a runner accept above their limit, and do declines count against them? Default: accept refused above the limit; declines never penalised in MVP.
- RQ-8: estimated time and evidence requirements.
