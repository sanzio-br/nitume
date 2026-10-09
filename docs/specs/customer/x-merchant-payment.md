# x-merchant-payment — Pay the item amount (merchant Till/Paybill or runner)

- Mockup: **not drawn.** Required by §6 of the system design ("show merchant Till/Paybill for merchant_amount, paid separately") and OA-5 (Till/Paybill shown only when merchant-direct is selected). Built from design-system patterns (card, list rows, buttons) and the `.stk-wrap` / `.form-card` mockup components; copy is **(proposed)**.
- Shared conventions: `_shared.md` (OA-n §0, payment flows §8)
- Implementation: none
- Status: missing

## Purpose
Show the customer exactly what to pay for the item/merchant amount and where, kept separate from the service and runner fees (three flows separate). Nitume does not collect this money in the merchant-direct route.

## Entry / exit
- Entry:
  - Track notice card "Pay the item amount" (shown when the route is `merchant_direct` or `customer_to_runner`, the amount due is > 0, and for merchant-direct the merchant details exist).
  - `v-task-detail` Payment section link `View payment details`.
  - After approving a price change in `v-price-auth` (the new outstanding amount).
  - Push / notification when merchant details are added (event type needs api-contract, see Data).
- Exit: `Done` or back → previous screen (normally Track).

## Task states
PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER. Never before the fees are paid (§6 sequence). Hidden for `platform_only`.

## Variant A — merchant-direct (`merchant_direct`)
Layout (top to bottom):
1. Pushed header (C-10) `Pay the merchant`.
2. Intro block, padding `0 20 14`: heading 17/700 (margin-bottom 6); body 13 slate-600.
3. Card (C-07, margin `0 20 14`) of C-39 copyable rows, separated by slate-line hairlines, padding 12 0:
   - `Merchant` — merchant name (Fira Sans 15/600, no Copy button).
   - Till route: `Till number (Buy Goods)` — value Fira Code 16/600 + `Copy`.
   - Paybill route: `Paybill number` — value + `Copy`; `Account number` — value + `Copy`.
   - `Amount` — `KSh 40,000` Fira Code 20/600 + `Copy` (copies digits only, `40000`).
4. When an approved price change raised the amount: line under the card, 12.5, `amount` in **amber** Fira Code (OA-13 price-change accent): `Includes the KSh 5,000 increase you approved.`
5. Muted how-to, 12.5 slate-600, padding `0 20 14`: M-Pesa menu steps.
6. Fixed primary CTA (C-01) `Done`.

## Variant B — send to runner (`customer_to_runner`)
**Blocked on SQ-5** (`_shared.md` §9): how the customer sends the item amount is not decided. Until answered build only:
1. Pushed header (C-10) `Pay your runner`.
2. Card (C-07): `Amount` row (C-39 without Copy), then C-40 notice `We'll show you how to send this amount to your runner here.`
3. Fixed CTA `Done`.

## Components
| Element | Component | Status |
|---|---|---|
| Header | C-10 | built |
| Card | C-07 | built |
| Copyable rows | C-39 | **NEW** |
| Notice | C-40 | **NEW** |
| Done | C-01 | built |

## Copy (proposed)
- Variant A heading: `Pay the merchant directly`
- Variant A body: `Pay this amount from your M-Pesa straight to the merchant. It's separate from the fees you've already paid.`
- Row labels: `Merchant`, `Till number (Buy Goods)`, `Paybill number`, `Account number`, `Amount`
- Copy button: `Copy`; snackbar `Copied`
- Price-change line: `Includes the KSh 5,000 increase you approved.`
- How-to (Till): `On M-Pesa, choose Lipa na M-PESA → Buy Goods and Services, enter the Till number and amount.` (Paybill): `On M-Pesa, choose Lipa na M-PESA → Pay Bill, enter the Paybill number, account number and amount.`
- CTA: `Done`
- Loading: skeleton card. Error: C-33 `Couldn't load the payment details.` + `Try again`.
- Details not yet available (merchant-direct chosen but no details on the errand): C-40 `The merchant's details aren't available yet. We'll notify you when they are.`
- Banned here: "release", "hold", "escrow", "wallet", "balance" (OA-6).

## Numeric fields (Fira Code)
- Till number, Paybill number, account number (when numeric), amount, the increase amount in the price-change line.

## Data
- needs: api-contract — merchant details on the errand or payment (`merchantName`, `tillNumber` or `paybillNumber` + `accountNumber`) and the outstanding item amount (`merchantAmountDue`, after approved price changes), on `GET /errands/:id` or `GET /payments/:errandId`. Source and timing of merchant details: SQ-6.
- needs: api-contract — notification event type for "merchant details added" (not in `NotificationEventType`).
- Whether the customer confirms they paid the merchant (button, M-Pesa message upload, reconciliation) is open (Q1); the spec records nothing.
- Live: errand status event (pending row 23) only to close the screen if the errand is CANCELLED.

## Accessibility and mobile
- Each Copy button labelled "Copy Till number"; snackbar announced.
- Numbers selectable as text.

## Open questions for the owner
- Q1 (payments): should the customer confirm "I've paid the merchant" (and attach the M-Pesa message), or does the runner confirm at the counter? Default: no confirmation; `Done` only closes the screen.
- SQ-5, SQ-6 in `_shared.md` §9.
- Pending row 37: refunds if the task is cancelled after the merchant was paid; this screen shows no refund copy.

## Current vs design
Not built.
