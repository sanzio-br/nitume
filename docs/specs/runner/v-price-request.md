# v-price-request — Request price change

- Mockup: `docs/design/nitume_runner_app.html` lines 388–401 (`#v-price-request`, overlay)
- Shared conventions: `_shared.md` (§0 rows 37, 49, 55, 101; §8 money)
- Implementation: none. On `main`: core `RunnerJobsRepository.requestPriceChange` / `pendingPriceChange` / `priceChanges`, and `RunnerJobView.itemAmount` (RA-2 built); no screen exists.
- Status: missing
- Refreshed 2026-10-19 (design-auditor, `docs/runner-v-active-spec`): the item amount now comes from the runner projection; purchase-limit note (rows 108, 135, 152); several held jobs (row 211); RQ-36. Everything not drawn in the mockup is marked **(proposed)**.

## Purpose
When the item costs more (or less) than the customer authorised, the runner asks the customer to approve the new item amount. The request changes the **item/merchant amount only** (OA-8), never the runner fee or the service fee (three-flow separation).

## Entry / exit
- Entry: `v-active` `Request price authorization` (IN_PROGRESS, Buy For Me or Get It For Me only). The screen belongs to the job shown on `v-active` (row 211).
- Back (C-10) → `v-active`. If anything was typed: C-35 `Discard this request?` / `What you entered will be lost.` / `Discard` · `Keep editing` (proposed).
- `Send to customer for approval` → confirm (proposed) → `POST` → back to `v-active` with the pending notice (mockup `pop()`).

## Task states
- IN_PROGRESS only (row 49). The runner is busy throughout (row 211), and stays busy while the request waits.
- Opened in any other state (stale): C-40 `Price changes are only possible while the task is in progress.` and no form.
- A request already pending (`pendingPriceChange` not null): C-40 `There's already a request waiting for the customer.` and no form (proposed).

## Layout (top to bottom)
1. C-10 header `Request price change`.
2. Price card, C-07 `NitumeCard` (margin 20, padding 20; mockup r 16 → design-system r-m 14):
   - C-08 label `Original authorization` (padding 0 0 8); the amount in Fira Code 22/600 = the current item amount (`RunnerJobView.itemAmount`), margin-bottom 16.
   - C-08 label `New price at the shop`; C-17 `NitumeField.money` (Fira Code value, `KSh` prefix), margin-bottom 14.
   - C-08 label `Reason`; C-17 `NitumeField.multiline`, 3 rows, Fira Code counter `0/500`.
   - Difference line (proposed, 12.5 slate-600, under the price field once valid): `The customer will be asked to approve KSh 5,000 more.` / `… KSh 5,000 less.` (amount Fira Code). How the customer pays the difference is the customer's concern (row 44), so it is not explained to the runner.
   - Purchase-limit note (proposed, `send_to_runner` only, when the new price is above the runner's purchase limit, `RunnerJobView.maxPurchaseAdvance`): C-40 `This is above your purchase limit of KSh 3,000. You'll be reimbursed up to KSh 3,000 unless our team approves more.` (proposed; amounts Fira Code; rows 135, 142: the ordinary cap is the limit, more only through an ops review).
     - It applies the existing rule: an over-limit purchase found at CONFIRMED goes `on_hold` with `over_purchase_limit` (row 135). The cap is the limit stored on the line when the obligation is created (row 152).
     - It does not block sending, since no rule refuses such a request (see "Questions").
3. Fixed bottom `NitumeFixedCta` with C-01 `Send to customer for approval`.

Field labels: the mockup uses the uppercase section-label style for the three captions. They are kept as the form-card headings (as the customer rule for `.sec-label` inside forms), with the inputs' accessible labels `New price at the shop` and `Reason`.

## Validation (proposed, mirrors `RequestPriceChangeDto`)
| Field | Rule | Message |
|---|---|---|
| New price | required, number ≥ 1, ≤ 10,000,000, at most 2 decimals | `Enter the new price in KSh.` |
| New price | differs from the original | `Enter a price different from the original.` |
| Reason | required in the app (the API keeps it optional; the customer needs it), 10–500 characters after trimming | `Tell the customer why the price changed.` |

## Confirm dialog (C-35, proposed)
Title `Send this price change?`; body `KSh 40,000 → KSh 45,000. The customer must approve it before you buy.` (amounts Fira Code); buttons `Send` / `Back`.

## After sending (shown on `v-active`)
- Pending: `Waiting for the customer to approve KSh 45,000.`; `Mark task complete` disabled (proposed).
- Approved:
  - `merchant_direct`: `Price change approved. New item amount KSh 45,000.`
  - `send_to_runner`: depends on **RQ-36**. Recommended: `Approved. Waiting for the customer to pay the difference.` until the difference payment is confirmed, then the approved line.
- Rejected by an admin (row 55): `Price change not approved. Continue at the original amount or contact support.` (proposed).
- Rejected by the customer: the task is CANCELLED (row 37). `v-active` shows the ended state (no runner fee). Row 106 (receipt + claim) applies only if the runner had already bought, which this flow tells them not to do.

## Copy
Exact, from the mockup: `Request price change`, `Original authorization`, `New price at the shop`, `Reason`, `Send to customer for approval`.

The sample reason `Shop said the model I confirmed on the phone is out of stock; only the newer version is available, priced KSh 5,000 higher.` is **not** ported: the field starts empty, with the placeholder `e.g. The model you chose is out of stock; the newer one costs more.` (proposed).

Errors: one C-40 in the danger tone each (the S-1 / m-7 rule). Proposed copy; the API codes are as built in `matching/price-change.service.ts`:
- 409 `price_change_already_pending` → `There's already a request waiting for the customer.`
- 400 `merchant_amount_not_applicable` → `Price changes aren't available for this task.`
- 409 `price_change_not_in_progress` / `price_change_not_allowed` → `Price changes are only possible while the task is in progress.`
- 403 → reload the job (no longer assigned; `v-active` access-revoked state).
- network → `Check your connection and try again.`

## Numeric fields (Fira Code)
- Original amount; new price input; difference amount; purchase limit; counter `0/500`; amounts in the dialog and the notices.

## Components
| Element | Component (core class) | Status |
|---|---|---|
| Header | C-10 `NitumePushedHeader` | exists |
| Card, labels | C-07 `NitumeCard`, C-08 `SectionLabel` | exists |
| Fields | C-17 `NitumeField.money`, `NitumeField.multiline` | exists |
| Notices | C-40 `NitumeNotice` | exists |
| Dialog | C-35 `showNitumeConfirmDialog` | exists |
| CTA | `NitumeFixedCta` + C-01 | exists |
| Data | R-19 `RunnerJobsRepository` (`job`, `pendingPriceChange`, `requestPriceChange`) | exists |
| Decision event | core `RealtimeEvents` `price_change:decided` | **change** C-V6 (after API A8) |

## Data
For api-contract: what the screen needs. Item numbers match `docs/audits/runner-gap-report.md` §21.
- Original amount: `GET /runners/me/jobs/:id` `itemAmount` (built: the current item amount after approved changes). The earlier RA-2 gap is closed.
- Purchase limit and route: the same view's `maxPurchaseAdvance`, `merchantRoute`, `requiredPurchase` (built).
- Pending request: `GET /errands/:id/price-change?status=requested` (exists, runner allowed).
- Send: `POST /errands/:errandId/price-change` `{ toPrice, reason }` (exists; enforces IN_PROGRESS, Buy For Me / Get It For Me and the assigned runner; 400 for other categories, row 101).
- Decision (A8, RA-5): socket `price_change:decided` to the runner `{ errandId, requestId, status, toPrice, decidedAt }`, plus a runner notification (RA-6). For RQ-36 (recommended option), also whether the difference has been paid.
  - Until A8: `v-active` polls the pending request every 15 s while it is shown.
  - A customer reject already arrives as `errand:status_changed` → CANCELLED (row 37).

## Accessibility and mobile
- Money field `TextInputType.numberWithOptions(decimal: true)`; errors announced; CTA above the keyboard and the safe area.

## Decisions (owner)
- Rows 37, 49, 55, 61, 101: runner price changes only in IN_PROGRESS, only for Buy For Me and Get It For Me; a customer reject cancels the task; an admin reject only rejects.
- Row 44: the difference is paid on the route of the original item payment (customer side).
- Rows 135, 152: an over-limit purchase goes to ops review at CONFIRMED, capped by the limit stored on the line.

## Questions (owner; full text in `docs/audits/runner-gap-report.md` §21)
- RQ-36 (BOARD row 248, open; payments): on `send_to_runner`, an approved increase is only a recorded difference until the customer pays it (`price-change.service.ts` `approve`: the budget moves at once, and the difference payment is created for the customer to pay). Should the runner be told to buy at the new price only after the difference is paid? Recommended: yes, `Approved. Waiting for the customer to pay the difference.` until paid. Otherwise the runner may buy above what Nitume holds, and the reimbursement cap (min of the item amount paid to Nitume and the limit, rows 135, 142) would leave them out of pocket.
- Not a question, a proposal: a request above the runner's purchase limit is sent with the warning above, not refused. Refusing it would be a new payment rule; say so if you want it.
