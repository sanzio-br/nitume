# v-price-request — Request price change

- Mockup: `docs/design/nitume_runner_app.html` lines 388–401 (`#v-price-request`, overlay)
- Shared conventions: `_shared.md` (§0 rows 37, 49, 55, 101; §8 money)
- Implementation: none
- Status: missing

## Purpose
When the item costs more than the customer authorised, the runner asks the customer to approve the new item amount. The request changes the **item/merchant amount only** (OA-8), never the runner fee or service fee.

## Entry / exit
- Entry: `v-active` `Request price authorization` (IN_PROGRESS, Buy For Me or Get It For Me only).
- Back (C-10) → `v-active`; if anything was typed, C-35 `Discard this request?` / `What you entered will be lost.` / `Discard` · `Keep editing` (proposed).
- `Send to customer for approval` → confirm (proposed) → `POST` → back to `v-active` with the pending notice (mockup `pop()`).

## Task states
IN_PROGRESS only (row 49). Opened in any other state (stale) → C-40 `Price changes are only possible while the task is in progress.` and no form.

## Layout (top to bottom)
1. C-10 header `Request price change`.
2. Price card C-07 (margin 20, padding 20, r 16 → design-system r-m 14):
   - C-08 label `Original authorization` (padding 0 0 8); amount Fira Code 22/600 (the current item amount), margin-bottom 16.
   - C-08 label `New price at the shop`; C-17 money field (Fira Code value, `KSh` prefix), margin-bottom 14.
   - C-08 label `Reason`; C-17 multiline 3 rows, counter Fira Code `0/500`.
   - Difference line (proposed, 12.5 slate-600, under the price field once valid): `The customer will be asked to approve KSh 5,000 more.` / `… KSh 5,000 less.` (amount Fira Code). Payment route consequences are the customer's (row 44) and are not explained to the runner.
3. Fixed bottom C-01 `Send to customer for approval`.

Field labels: the mockup uses the uppercase section-label style for the three captions; kept as the form-card headings (as the customer spec rule for `.sec-label` inside forms), with the inputs' accessible labels `New price at the shop` and `Reason`.

## Validation (proposed, mirrors `RequestPriceChangeDto`)
| Field | Rule | Message |
|---|---|---|
| New price | required, number ≥ 1, ≤ 10,000,000, max 2 decimals | `Enter the new price in KSh.` |
| New price | differs from the original | `Enter a price different from the original.` |
| Reason | required (API optional; the customer needs it), 10–500 characters trimmed | `Tell the customer why the price changed.` |

## Confirm dialog (C-35, proposed)
Title `Send this price change?`; body `KSh 40,000 → KSh 45,000. The customer must approve it before you buy.` (amounts Fira Code); buttons `Send` / `Back`.

## Copy
Exact, from the mockup: `Request price change`, `Original authorization`, `New price at the shop`, `Reason`, `Send to customer for approval`; sample reason `Shop said the model I confirmed on the phone is out of stock; only the newer version is available, priced KSh 5,000 higher.` (placeholder text is **not** ported; the field starts empty with placeholder `e.g. The model you chose is out of stock; the newer one costs more.` proposed).

Errors (proposed copy, API codes as built in `matching/price-change.service.ts`): 409 `price_change_already_pending` → `There's already a request waiting for the customer.`; 400 `merchant_amount_not_applicable` → `Price changes aren't available for this task.`; 409 `price_change_not_in_progress` / `price_change_not_allowed` → `Price changes are only possible while the task is in progress.`; 403 → reload the job (no longer assigned); network → generic.

## Numeric fields (Fira Code)
- Original amount; new price input; difference amount; counter; amounts in the dialog.

## Data
- Original amount: the current item amount of the errand (original + approved changes). **Missing for runners** (RA-2: no runner-readable `itemAmount`; `GET /payments/:errandId` refuses runners). The latest approved request's `toPrice` from `GET /errands/:id/price-change` (exists, runner allowed) is a partial fallback.
- `POST /errands/:errandId/price-change` `{ toPrice, reason }` (exists; IN_PROGRESS + Buy For Me / Get It For Me + assigned runner enforced; 400 for other categories, row 101).
- Decision: socket `price_change:decided` (RA-5, missing) and a runner notification (RA-6). Reject by the customer → errand CANCELLED (row 37) → `v-active` ended state (no runner fee; row 106 applies only if the item was already bought, unlikely here).
- States: IN_PROGRESS.

## Accessibility and mobile
- Money field `TextInputType.numberWithOptions(decimal: true)`; errors announced; CTA above the keyboard.

## Questions
- None new. The pending-request behaviour on `v-active` (finish disabled while pending) is proposed copy/flow, not an owner decision.
