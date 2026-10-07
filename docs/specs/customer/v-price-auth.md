# v-price-auth — Price-change authorization (modal)

- Mockup: `docs/design/nitume_customer_app.html` lines 423–441 (`#v-price-auth`, drawn as an overlay screen)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/checkout/price_change_dialog.dart` (opened from `home_shell.dart` on resume and `track_tab.dart`) on branch `feat/customer-screens`
- Status: matches-design

## Purpose
The runner found the item priced higher than the agreed item amount. The customer approves the new amount (and pays the difference) or rejects it, which cancels the task (OA-8).

## Presentation (OA-8)
A **blocking modal** (C-35 `NitumeDialog`, `barrierDismissible: false`) over whatever screen is open, not a pushed screen. System back does nothing while it is open. The mockup's pushed header is replaced by the dialog title.

## Entry / exit
- Entry:
  - Live: price-change-requested socket event for any of the customer's errands while the app is in the foreground (app-level listener; event name pending row 23).
  - "Price change" on `v-track`; notification row "Price change requested"; push deep link (opens Track for that errand, then the modal).
  - On app resume, if a request is pending for an active errand.
- Approve success → close the modal; snackbar `Price change approved.`; then, if the route is `merchant_direct` or `customer_to_runner`, push `x-merchant-payment` showing the new amount due.
- Reject → second confirm (C-35) → on success close both; the errand moves to CANCELLED (backend) and Track shows the cancelled card.
- `Not now` is **not** offered: the runner is waiting.

## Task states
Requests can arrive in the API's price-changeable states (`apps/api/src/matching/price-change.service.ts`: QUOTED, ACCEPTED, PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS); the mockup case is IN_PROGRESS. Approve does not change the errand state. Reject → CANCELLED (OA-8; the transition from the active state must be added by api-contract; refunds and the exact set of states pending row 37).

## Layout (modal card, top to bottom)
Dialog: white, r-l 20, padding 20, max width 335, centred, scrim per SQ-1.
1. Title 17/600 blue, margin-bottom 8.
2. Explanation 13.5 slate-600, margin-bottom 4. If the request has a `reason`, show it below in 13 blue, wrapped in quotes, margin-top 6.
3. Compare row: top and bottom slate-line hairlines, padding 16 0, margin 14 0. Two centred columns, an arrow `→` slate-400 between them:
   - `Original`: label 11 slate-600; value Fira Code 19 **blue**.
   - `New price`: label 11 slate-600; value Fira Code 19 **amber** (OA-13).
4. Difference line centred, Fira Code 13/600 **amber** (OA-13), margin-bottom 16.
5. Button stack, gap 10, full width: primary approve (C-01); outline reject (C-03, red text: destructive per OA-13).

## Components
| Element | Component | Status |
|---|---|---|
| Modal | C-35 | **NEW** |
| Price compare | screen-local composition of two `NumText` columns | built (C-32) |
| Approve / reject | C-01 / C-03 | built |

## Copy (exact from the mockup unless marked)
- Title: `Price change`
- Explanation: `Brian K. found the item priced higher than quoted. Approve the difference to continue?` (runner short name, OA-2)
- Labels: `Original`, `New price`
- Values: `40,000` → `45,000` (no currency prefix, as drawn)
- Difference: `+ KSh 5,000 additional`
- Approve: `Approve KSh 5,000 increase`
- Reject: `Reject & cancel task`

Reject confirm dialog (proposed):
- Title: `Reject and cancel this task?`
- Body: `The runner will stop work on this task.` + second line **pending row 37** (refund rules): until answered show `We'll update you about anything you've already paid.`
- Buttons: `Reject & cancel` (outline, red text), `Go back` (C-01).

States (proposed):
- Loading the request: skeleton inside the dialog.
- Already answered or withdrawn (API 409 / not `requested`): dialog body `This price change was already answered.` + single button `OK`.
- Approve/Reject in flight: both buttons disabled, spinner in the pressed button.
- Error: inline red 12.5 under the buttons `Couldn't send your answer. Try again.`

## Numeric fields (Fira Code)
- Original and new price, the difference, the amount inside the approve button.

## Data
- Read: `GET /api/v1/errands/:errandId/price-change?status=requested` (exists on `feat/api-customer-gaps`) → `fromPrice`, `toPrice`, `reason`, `createdAt`.
- needs: api-contract — price change applies to the **item/merchant amount** (OA-8). Today the API updates `quoted_price` / `final_price` (the service price); it must instead update the item amount and the amount due shown on `x-merchant-payment`.
- Approve: `POST /api/v1/errands/:errandId/price-change/:requestId/approve` (exists; §3.2 calls it `POST /payments/:id/authorize-change`).
- Reject: `POST /api/v1/errands/:errandId/price-change/:requestId/reject` (exists). needs: api-contract — reject must move the errand to CANCELLED in the same transaction (OA-8), from any state where a request can exist (exact set pending row 37).
- Live: price-change-requested on `errand:{id}` (name pending row 23); push (§4.4).

## Accessibility and mobile
- Focus moves to the dialog title on open; the dialog is announced as a modal; back is consumed.
- Buttons full width, ≥ 48dp.
- Amber text (`#B8860B` on white ≈ 3.4:1) is below AA for normal text: the 19px value is large-text-adjacent; the 13/600 difference line fails AA. Same contrast family as pending row 33; follow its outcome.

## Resolved by owner answers
- Modal vs pushed: modal (OA-8, was Q1).
- Reject semantics: reject → CANCELLED (OA-8, was Q2); refunds pending row 37.
- Amber price text: allowed (OA-13, was Q3).
- Which amount changes and how it is paid: the item/merchant amount; the customer pays the difference (OA-8, was Q4).

## Open questions for the owner
- Q2 (payments, raised in the 2026-10-07 re-audit): when the errand has no item amount, no route was chosen at checkout, and the API answers `MERCHANT_ROUTE_REQUIRED` on approve. Should the customer choose the route inside this modal, or should such a request be refused? Build default until answered: the app never picks a route for the customer. The modal shows the checkout route rows (C-16 radio-row variant, same copy as `x-awaiting-quote`; merchant-direct disabled per SQ-6) after that error, and `Approve` stays disabled until the customer selects one.
- Q1 (payments): "pays the difference" — through the same route chosen at checkout (merchant-direct: pays the merchant more; send-to-runner: SQ-5), or by a new STK push to Nitume? Default: same route, shown on `x-merchant-payment`.

## Current vs design
Round 2 (2026-10-07, `feat/customer-screens` @ `ba45633`): PASS. On `MERCHANT_ROUTE_REQUIRED` the modal shows the route rows and keeps Approve disabled until one is chosen (Q2 build default); load failure shows `Couldn't load this price change.` with `Try again` / `Close`. Approve amount still Fira Sans (core CC-2). Round 1 FAIL details: `docs/audits/customer-reaudit-2026-10-07.md`.
