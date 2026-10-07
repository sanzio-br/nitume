# v-price-auth — Price-change authorization

- Mockup: `docs/design/nitume_customer_app.html` lines 423–441 (`#v-price-auth`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

## Purpose
The runner found the item priced higher than quoted. The customer approves the difference or rejects it.

## Entry / exit
- Entry: "⚠️ Price change" on `v-track`; notification row "Price change requested"; push notification deep link; socket event while the app is open — §4.4 says "Push + Socket (blocking modal)".
- Approve → pop back to the previous screen (Track) with a confirmation.
- Reject → pop (mockup). See Q2 for what reject actually does.
- Back → pop without deciding (request stays pending). If presented as a blocking modal, back must not dismiss it (Q1).

## Task states
Runner-side states where a price change can be requested: the API allows it in its `PRICE_CHANGEABLE` set (`apps/api/src/matching/price-change.service.ts:21`: QUOTED, ACCEPTED, PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS). For the mockup scenario (item found in store) the errand is IN_PROGRESS. The errand state does not change on approve.

## Layout (top to bottom)
1. Pushed header (C-10) title `Price change`.
2. Price card (C-07, margin 20, r 16, padding 20):
   1. Explanation 13.5 slate-600, margin `0 0 4`.
   2. Compare row: top and bottom hairlines, padding 16 0, margin 14 0. Two centred columns ("Original", "New price") with label 11 slate-600 and value Fira Code 19; an arrow `→` slate-400 between them.
   3. Difference line centred, Fira Code 13/600.
3. Button stack (padding 0 20, gap 10): primary approve, outline reject.

Mockup colours the new price and the difference in amber text. Design system: amber only as a chip accent. Recommended: new price in blue, difference rendered as a chip-pending (C-05) `+ KSh 5,000 additional` (Q3).

## Components
| Element | Component | Status |
|---|---|---|
| Card | C-07 | app-only |
| Price compare | screen-local composition (two `NumText` columns) | NEW (C-32) |
| Difference chip | C-05 pending | app-only |
| Approve / reject | C-01 / C-03 | core |
| Blocking-modal presentation | NEW route type (full-screen dialog, non-dismissible) | NEW |

## Copy (exact)
- Header: `Price change`
- Explanation: `Brian K. found the item priced higher than quoted. Approve the difference to continue?` (runner name, Q-NAME; reason text from the request's `reason` should be shown when present, Q4)
- Labels: `Original`, `New price`
- Values: `40,000` → `45,000` (no currency prefix in the mockup)
- Difference: `+ KSh 5,000 additional`
- Approve: `Approve KSh 5,000 increase`
- Reject: `Reject & cancel task`

Implied states:
- Loading the request: skeleton card.
- Already decided / expired: `This price change was already answered.` + back.
- Approve/Reject in flight: buttons disabled, spinner in the pressed button.
- Error: snackbar `Couldn't send your answer. Try again.`

## Numeric fields (Fira Code)
- Original and new price, difference, amount in the approve button.

## Data
- Read: the customer needs the pending request (`fromPrice`, `toPrice`, `reason`, `requestedByUserId`, `createdAt`). No GET endpoint exists for price-change requests → needs: api-contract (`GET /errands/:errandId/price-change?status=requested`).
- Approve: `POST /api/v1/errands/:errandId/price-change/:requestId/approve` (exists). §3.2 names this `POST /payments/:id/authorize-change` — the API uses a different path (record, not a blocker).
- Reject: `POST /api/v1/errands/:errandId/price-change/:requestId/reject` (exists).
- Socket: price-change-requested event on `errand:{id}` (name undefined, needs: api-contract); push (§4.4).

## Accessibility and mobile
- If shown as a blocking modal, focus moves to the card heading and system back is consumed.
- Buttons full width, 48dp+.

## Questions for owner
- Q1: Pushed screen (mockup) or blocking modal (§4.4)? Recommended: full-screen non-dismissible route when it arrives live; same layout.
- Q2 (state machine): "Reject & cancel task" — §3.3 only allows CANCELLED from REQUESTED, QUOTED, ACCEPTED, RUNNER_ASSIGNED. A runner who is IN_PROGRESS cannot be cancelled. What happens on reject: task continues at the original price, task goes to DISPUTED, or a new transition is needed? The API's reject only marks the request rejected.
- Q3: Amber text for the new price and difference is outside the chip-only rule. Recommended: blue value + chip-pending difference.
- Q4 (payments): Which amount changes? The mockup (40,000 → 45,000 item price) is the merchant amount. The API price-change updates `quoted_price` / `final_price` (the service price). How is the extra KSh 5,000 paid — new STK push, merchant directly, or runner advance — keeping the three flows separate?

## Current vs design
Not built. `track_tab.dart:263` has a "⚠️ Price change" button with a TODO.
