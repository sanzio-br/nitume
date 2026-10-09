# v-price-auth — Price-change authorization (modal)

- Mockup: `docs/design/nitume_customer_app.html` lines 423–441 (`#v-price-auth`, drawn as an overlay screen)
- Shared conventions: `_shared.md` (OA-n §0, rows §0.1, price changes §8.2, refunds §11)
- Implementation: `apps/customer_app/lib/src/screens/checkout/price_change_dialog.dart` (opened from `home_shell.dart` on resume and `track_tab.dart`) on branch `feat/customer-integrations`
- Status: matches-design

## Purpose
The runner found the item priced differently from the agreed item amount. The customer approves the new amount or rejects it, which cancels the task (OA-8).
- **Increase**: the customer pays the difference through the same route as the original item payment (row 44).
- **Decrease** (row 48 clarification): the item amount goes down; anything already paid above the new amount goes to an admin refund review (`_shared.md` §11).

## Presentation (OA-8)
A **blocking modal** (C-35 `NitumeDialog`, `barrierDismissible: false`, scrim blue at 50%, row 38) over whatever screen is open, not a pushed screen. System back does nothing while it is open. The mockup's pushed header is replaced by the dialog title.

## Entry / exit
- Entry:
  - Live: `price_change:requested` socket event (row 23) for any of the customer's errands while the app is in the foreground (app-level listener).
  - "Price change" on `v-track`; notification row "Price change requested"; push deep link (opens Track for that errand, then the modal).
  - On app resume, if a request is pending for an IN_PROGRESS errand.
- Approve success:
  - Increase → close the modal; snackbar `Price change approved.`; then, when the decision returns a difference to pay, push `x-merchant-payment` (variant A for `merchant_direct`, variant B STK for `send_to_runner`).
  - Decrease → close the modal; snackbar `Price change approved.`, or, when the decision opened a refund review, `Price change approved. We'll review a refund of the difference.` (proposed). No navigation.
- Reject → second confirm (C-35) → on success close both; the errand moves to CANCELLED (backend, IN_PROGRESS → CANCELLED, customer, guarded) and Track shows the cancelled card.
- `Not now` is **not** offered: the runner is waiting.

## Task states
**IN_PROGRESS only** (row 49 clarification: runners can request price changes only in IN_PROGRESS). Approve does not change the errand state. Reject → CANCELLED through the guarded IN_PROGRESS → CANCELLED transition (rows 37, 56), which opens an admin refund review. If the errand is no longer IN_PROGRESS when the modal loads, show the already-answered state.

## Layout (modal card, top to bottom)
Dialog: white, r-l 20, padding 20, max width 335, centred.
1. Title 17/600 blue, margin-bottom 8.
2. Explanation 13.5 slate-600, margin-bottom 4. If the request has a `reason`, show it below in 13 blue, wrapped in quotes, margin-top 6.
3. Compare row: top and bottom slate-line hairlines, padding 16 0, margin 14 0. Two centred columns, an arrow `→` slate-400 between them:
   - `Original`: label 11 slate-600; value Fira Code 19 **blue**.
   - `New price`: label 11 slate-600; value Fira Code 19 **amber** (OA-13).
4. Difference line centred, Fira Code 13/600 **amber** (OA-13), margin-bottom 16.
5. Only when needed (route rules below): label 11.5/700 uppercase slate-600 `How should this be paid?` and the checkout route rows (C-16 radio-row variant, app `MerchantRouteRows`, same copy and enabled/disabled rules as `x-awaiting-quote`), nothing preselected, margin-bottom 14.
6. Button stack, gap 10, full width: primary approve (C-01); outline reject (C-03, red text: destructive per OA-13).

## Route rules (rows 44, 61)
- The difference of an increase uses the route of the original item payment. The modal shows no route rows in that case.
- When the original route is unavailable, the customer **explicitly** chooses (row 61): approve answers `merchant_route_required` (no item payment so far) or `merchant_details_missing` (merchant-direct but no details) → show the route rows, keep `Approve` disabled until a row is selected, then re-send approve with that route. `merchant_direct` is disabled while details are pending. The app never chooses a route itself.
- A decrease never needs a route.

## Components
| Element | Component | Status |
|---|---|---|
| Modal | C-35 | built |
| Price compare | screen-local composition of two `NumText` columns | built (C-32) |
| Route rows | C-16 radio-row variant (`MerchantRouteRows`) | built |
| Approve / reject | C-01 / C-03 | built |

## Copy (exact from the mockup unless marked)
Increase (mockup):
- Title: `Price change`
- Explanation: `Brian K. found the item priced higher than quoted. Approve the difference to continue?` (runner short name from the API, row 40)
- Labels: `Original`, `New price`
- Values: `40,000` → `45,000` (no currency prefix, as drawn)
- Difference: `+ KSh 5,000 additional`
- Approve: `Approve KSh 5,000 increase`
- Reject: `Reject & cancel task`

Decrease (proposed, same layout):
- Title: `Price change`
- Explanation: `Brian K. found the item priced lower than quoted. Approve the new price to continue?`
- Values: `40,000` → `35,000`
- Difference: `− KSh 5,000 less`
- Approve: `Approve new price`
- Reject: `Reject & cancel task`

Reject confirm dialog (proposed; refund line per rows 37 and 54):
- Title: `Reject and cancel this task?`
- Body: `The runner will stop work on this task. We'll review a refund of what you've paid, and you can follow it on the task.`
- Buttons: `Reject & cancel` (outline, red text), `Go back` (C-01).

States (proposed):
- Loading the request: skeleton inside the dialog.
- Load failure: `Couldn't load this price change.` with `Try again` (reload) and `Close`.
- Already answered, withdrawn, rejected by an admin (the task continues, row 55), or errand no longer IN_PROGRESS (API 409 `price_change_already_decided` / not `requested`): dialog body `This price change was already answered.` + single button `OK`.
- Approve/Reject in flight: both buttons disabled, spinner in the pressed button.
- Error: inline red 12.5 under the buttons `Couldn't send your answer. Try again.`

## Numeric fields (Fira Code)
- Original and new price, the difference, the amount inside the approve button.

## Data
- Read: `GET /api/v1/errands/:errandId/price-change?status=requested` (exists) → `fromPrice`, `toPrice`, `reason`, `createdAt`.
- Approve: `POST /api/v1/errands/:errandId/price-change/:requestId/approve` `{ merchantRoute? }` (exists) → `PriceChangeDecision` with `differencePayment` (`{ payment, merchantPayment }` or null).
- Reject: `POST /api/v1/errands/:errandId/price-change/:requestId/reject` (exists; moves the errand to CANCELLED in the same transaction and opens the refund review).
- needs: api-contract —
  - accept new requests only in IN_PROGRESS (row 49; the API still allows QUOTED … IN_PROGRESS in `PRICE_CHANGEABLE`);
  - a decrease opens an admin refund review for any already-paid difference (row 48) and the decision says so (e.g. `refundReview: { status } | null`); today `refund_reviews` allows one review per errand and has no decrease trigger (schema row 62 open);
  - an increase on `send_to_runner` produces an STK-payable difference (row 42), see `x-merchant-payment` Data.
- Live: `price_change:requested` on `errand:{id}` (row 23); push (§4.4).

## Accessibility and mobile
- Focus moves to the dialog title on open; the dialog is announced as a modal; back is consumed.
- Buttons full width, ≥ 48dp.
- Amber text (`#B8860B` on white ≈ 3.4:1) is below AA for normal text: the 19px value is large-text-adjacent; the 13/600 difference line fails AA. Row 33's high-contrast decision covers chips only; amber price text stays as OA-13 allows it.

## Resolved by owner answers
- Modal vs pushed: modal (OA-8).
- Reject semantics: reject → CANCELLED (OA-8); refund review, admin sets the amount up to a full refund (row 37).
- Amber price text: allowed (OA-13).
- Which amount changes: the item/merchant amount (OA-8).
- How the difference is paid (was Q1): same route as the original item payment; explicit choice when unavailable (rows 44, 61).
- Route choice on `merchant_route_required` (was Q2): inside the modal (row 61).
- Decrease: admin refund review of the difference (row 48 clarification).
- When requests can arrive: IN_PROGRESS only (row 49 clarification).

## Open questions for the owner
- SQ-8 (`_shared.md` §9): merchant-direct increase paid without an STK push. Default: pay the same Till/Paybill from the customer's own M-Pesa.

## Current vs design
Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. IN_PROGRESS only, increase and decrease variants, route rows on `merchant_route_required` / `merchant_details_missing`, refund-review reject copy and decrease snackbar, already-answered codes.

Round 2 (2026-10-07) and round 3 (2026-10-08, `08f9b26`): PASS against the earlier spec. Spec update 2026-10-08 (rows 37, 44, 48, 49, 55, 61): the build words every request as an increase (`priced higher`, `Approve KSh … increase`), uses the old reject body (`We'll update you about anything you've already paid.`), and shows the route rows only on `merchant_route_required`. It already opens `x-merchant-payment` from the decision's `differencePayment`. Now required: decrease copy and snackbar, the refund-review reject body, and the route rows also on `merchant_details_missing`. Status set to `partial` until re-audited.
