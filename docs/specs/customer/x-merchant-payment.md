# x-merchant-payment — Pay the item amount (merchant Till/Paybill, or to Nitume for your runner)

- Mockup: **not drawn.** Required by §6 of the system design ("show merchant Till/Paybill for merchant_amount, paid separately"), OA-5 (Till/Paybill shown only when merchant-direct is selected) and rows 42–44, 48 (send-to-runner is platform-mediated; price-change differences). Built from design-system patterns (card, list rows, buttons) and the `.stk-wrap` / `.form-card` mockup components; copy is **(proposed)** unless marked approved.
- Shared conventions: `_shared.md` (OA-n §0, rows §0.1, payment flows §8)
- Implementation: `apps/customer_app/lib/src/screens/checkout/merchant_payment_screen.dart` on branch `feat/customer-owner-answers`
- Status: matches-design (re-audited 2026-10-09 @ `c420265`)

## Purpose
Show the customer exactly what to pay for the item/merchant amount and how, kept separate from the service and runner fees (three flows separate).
- `merchant_direct`: the customer pays the merchant's Till/Paybill from their own M-Pesa. Nitume does not collect this money and never STK-pushes to a merchant; an approved increase is paid the same way, manually, to the same Till/Paybill (row 67).
- `send_to_runner`: the customer pays the item amount **to Nitume** (rows 42, 66): the original amount inside the combined fee STK (row 76), an approved increase by its own STK (variant B). Nitume then reimburses the runner through the payout ledger after the purchase receipt is accepted, never in advance (row 95); this screen says nothing about it. There is no direct customer-to-runner transfer and no runner number is shown.
- Only Buy For Me and Get It For Me tasks carry an item amount (row 80); this screen never opens for other categories.

## Entry / exit
- Entry:
  - Track notice card "Pay the item amount" (shown when an item amount is due: `send_to_runner`, or `merchant_direct` with merchant details available).
  - `v-task-detail` Payment section link `View payment details`.
  - After approving a price-change **increase** in `v-price-auth` (the difference now due, row 44).
  - Push / notification when merchant details are added (event type needs api-contract, see Data).
- Exit: `Done` or back → previous screen (normally Track). A pending STK (variant B) keeps running server-side; reopening shows its current state and never sends a second prompt by itself.

## Task states
PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER. Never before the fees are paid (§6 sequence). Hidden for `platform_only`. Price-change differences arise only in IN_PROGRESS (row 49).

## Variant A — merchant-direct (`merchant_direct`)
Layout (top to bottom):
1. Pushed header (C-10) `Pay the merchant`.
2. Intro block, padding `0 20 14`: heading 17/700 (margin-bottom 6); body 13 slate-600.
3. Card (C-07, margin `0 20 14`) of C-39 copyable rows, separated by slate-line hairlines, padding 12 0:
   - `Merchant` — merchant name (Fira Sans 15/600, no Copy button).
   - Till route: `Till number (Buy Goods)` — value Fira Code 16/600 + `Copy`.
   - Paybill route: `Paybill number` — value + `Copy`; `Account number` — value + `Copy`.
   - `Amount` — `KSh 40,000` Fira Code 20/600 + `Copy` (copies digits only, `40000`). This is the outstanding item amount, including any approved increase, or the lower amount after an approved decrease (no refund review on this route, row 86).
4. When an approved price change raised the amount: line under the card, 12.5, `amount` in **amber** Fira Code (OA-13 price-change accent): `Includes the KSh 5,000 increase you approved.` Paid to the **same** Till/Paybill (row 44), manually from the customer's own M-Pesa, never by STK (row 67, decided).
5. Muted how-to, 12.5 slate-600, padding `0 20 14`: M-Pesa menu steps.
6. Fixed primary CTA (C-01) `Done`.

**Details changed** (row 80: warn, never block): when the merchant details were changed after this merchant-direct payment started (the API's `merchantPayment.merchantDetailsChangedAfterPayment` flag: `merchantDetailsUpdatedAt` later than the creation of the merchant-direct payment, i.e. when it started; clarified in the 2026-10-09 round-4 re-audit), show a C-40 notice **above the card** (margin `0 20 14`), with a leading info icon: `The merchant's payment details changed on Today, 4:45 PM. Check the number below before you pay.` (proposed; date/time in Fira Code). If the customer already paid the old Till/Paybill: a second line in the same notice, `Already paid the old number? Contact support.` where `Contact support` is the Support link (C-04, `AppConfig.supportUri`; the line is omitted when Support isn't configured). The words `Contact support` appear once. The card always shows the current details; the old number is never shown. The notice stays while the item amount is shown on this screen. No red or amber: it is information, not an error.

**Details pending** (route chosen while details existed, but they are no longer on the errand, or an increase arrived and details are missing): header and intro as above; the card shows only `Amount`; C-40 notice `The merchant's details aren't available yet. We'll notify you when they are.`; CTA `Done`. Details are supplied by the merchant or an admin (row 43); the customer never enters them.

## Variant B — pay Nitume for your runner (`send_to_runner`, row 42)
**Updated for row 76** (row 76, owner 2026-10-08; spec updated in the 2026-10-09 re-audit): the original `send_to_runner` item amount is paid in the combined fee STK on `v-payment`, so variant B now covers only an **approved price-change increase** on that route (row 44). The API starts that difference STK when the customer approves, so the READY step (2 below) is not shown: the screen opens on the STK block (step 3). Until the API returns the target number the body reads `…prompt sent to your phone…`. FAILED → `Try again` re-pushes the difference (`retryDifferencePayment`). Same STK pattern and state handling as `v-payment` (OA-21, row 52), for the difference only.

Layout (top to bottom):
1. Pushed header (C-10) `Pay the item amount`.
2. Before the prompt is sent (READY):
   1. Intro block, padding `0 20 14`: heading 17/700 `Pay for your runner's purchase`; body 13 slate-600 (Copy).
   2. Card (C-07, margin `0 20 14`): `Amount` row (C-39 without Copy), Fira Code 20/600. Under it, when it includes an approved increase, the amber line from variant A step 4.
   3. Form card "Pay with" (C-30 + C-04 `Change`): the method chosen at checkout, else the default M-Pesa method, else the sign-in phone (OA-21).
   4. Fixed CTA (C-01) `Pay KSh 40,000 by M-Pesa` (amount as a Fira Code span, `richLabel`).
3. After sending: the `v-payment` centred `.stk-wrap` block (icon circle, heading, body, amount Fira Code 30/600, pulsing dots while PENDING, button stack width 220), with the copy below.

| State | Heading | Body | Buttons |
|---|---|---|---|
| INITIATING | `Check your phone` | `Enter your M-Pesa PIN on the prompt sent to +254 712 345 678 to pay for the items.` | primary disabled `Sending prompt…` |
| PENDING | `Check your phone` | same as INITIATING | primary `I've paid — continue` → checks status now. Still pending: inline 12.5 slate-600 `We haven't heard from M-Pesa yet. Keep this screen open.` |
| SUCCESS | `Item amount paid` | `Thanks. Your runner can go ahead with the purchase.` | primary `Done` |
| FAILED | `Payment didn't go through` | `M-Pesa didn't confirm this payment. You haven't been charged. You can try again.` | primary `Try again`, outline `Back` |
| TIMEOUT | `Still checking your payment` | `M-Pesa hasn't confirmed yet. If you entered your PIN, don't pay again. We'll update this screen as soon as we hear back.` | primary `Check again`, outline `Send a new prompt` |
| Initiate error | `Couldn't send the prompt` | `Check your connection and try again.` | primary `Try again`, outline `Back` |

Rules (same as `v-payment`): idempotency key per attempt, reused on resend of the same request (row 24); `Send a new prompt` after TIMEOUT only once the API reports the earlier push final; TIMEOUT comes from the API `stkStatus` and is never a failure (row 52).

## Components
| Element | Component | Status |
|---|---|---|
| Header | C-10 | built |
| Card | C-07 | built |
| Copyable rows | C-39 | built |
| Notice | C-40 | built |
| Pay-with card | C-30 + C-04 | built |
| STK block (variant B) | same composition as `v-payment` (`PulsingDots`, `NumText`, C-01/C-03) | built pieces; flutter-customer should share one app widget between `v-payment` and variant B rather than copy it |
| Done / CTA | C-01 | built |

## Copy (proposed unless marked)
- Variant A heading: `Pay the merchant directly`
- Variant A body: `Pay this amount from your M-Pesa straight to the merchant. It's separate from the fees you've already paid.`
- Variant B intro body: `Pay this amount to Nitume by M-Pesa. It goes to your runner's purchase and is separate from the fees you've already paid.`
- Row labels: `Merchant`, `Till number (Buy Goods)`, `Paybill number`, `Account number`, `Amount`
- Copy button: `Copy`; snackbar `Copied`
- Price-change line: `Includes the KSh 5,000 increase you approved.`
- How-to (Till): `On M-Pesa, choose Lipa na M-PESA → Buy Goods and Services, enter the Till number and amount.` (Paybill): `On M-Pesa, choose Lipa na M-PESA → Pay Bill, enter the Paybill number, account number and amount.`
- CTA: `Done` (A); `Pay KSh 40,000 by M-Pesa` (B, before the prompt)
- Loading: skeleton card. Error: C-33 `Couldn't load the payment details.` + `Try again`.
- **Nothing due** (no item payment on the errand, or amount 0, on any route): the screen closes itself, returns to the previous screen and shows the snackbar **`Nothing to pay right now.`** (approved, BOARD Needs row 41).
- Details pending (variant A): C-40 `The merchant's details aren't available yet. We'll notify you when they are.`
- Details changed (variant A, row 80): C-40 `The merchant's payment details changed on Today, 4:45 PM. Check the number below before you pay.` + `Already paid the old number? Contact support.`
- Banned here: "release", "hold", "escrow", "wallet", "balance" (OA-6). Never "send money to your runner" or a runner phone number (row 42).

## Numeric fields (Fira Code)
- Till number, Paybill number, account number (when numeric), every amount (card, CTA span, STK block), the increase amount in the price-change line, the payer phone number, the date/time in the details-changed notice.

## Data
- Merchant payment: `GET /api/v1/payments/:errandId` (exists) → `merchantPayment` view `{ route, amount, merchantName?, tillNumber?, paybillNumber?, accountReference? }` (Till/Paybill only for `merchant_direct`). needs: api-contract — fill merchant details from the merchant/admin source (row 43; today `merchantDetailsFor` always returns null); report the **outstanding** item amount including approved differences; list price-change difference records with their own status.
- Variant B: needs: api-contract — an STK initiation for the item amount to Nitume (row 42), e.g. `POST /api/v1/payments/:errandId/item/initiate` `{ paymentId?, paymentMethodId? }` + `Idempotency-Key`, and `stkStatus` (`PENDING | SUCCESS | FAILED | TIMEOUT`) for that payment on `GET /payments/:errandId`. Today the API records send-to-runner amounts and differences as `PENDING` rows with no STK ("the merchant amount never goes through Nitume's charge"), which contradicts row 42.
- needs: api-contract — notification event type for "merchant details added" (not in `NotificationEventType`).
- Details changed (row 80): needs: api-contract — `merchantDetailsUpdatedAt` on the `merchantPayment` view (and the payment's confirmation time, if not already there), and a customer notification + push when an admin changes details on a task whose merchant-direct payment has started, e.g. `merchant_details.changed`, body `The merchant's payment details for your task changed. Check them before you pay.` (proposed). The admin is warned before saving (`drawer-task-merchant-details`); the API allows the change (warn, not block).
- Whether the customer confirms they paid the merchant in variant A (button, M-Pesa message, reconciliation) is open (Q1); the spec records nothing.
- Live (rows 23, 29): `errand:status_changed` on `errand:{id}` closes the screen if the errand is CANCELLED and refreshes the merchant payment; variant B polls `GET /payments/:errandId` every 5 s (then 30 s, up to 10 minutes) while PENDING/TIMEOUT and visible, whether or not the socket is connected, because STK results have no socket event (accepted in the 2026-10-09 re-audit).

## Accessibility and mobile
- Each Copy button labelled "Copy Till number"; snackbar announced.
- Numbers selectable as text.
- Variant B: state changes announced (live region), as in `v-payment`.

## Resolved by owner answers
- Send-to-runner mechanics (was SQ-5): platform-mediated STK to Nitume (row 42).
- Merchant details source (was SQ-6): merchant or admin (row 43).
- Price-change difference route (rows 44, 48): same route as the original item payment.
- Nothing-due snackbar (BOARD Needs row 41): approved.
- System-design wording (was SQ-7): §2.2/§6 updated, platform-mediated send-to-runner (row 66).
- Merchant-direct increase (was SQ-8): paid manually to the same Till/Paybill, no STK (row 67).
- Details changed after the payment started: warn, never block (row 80).
- Item amounts only for Buy For Me / Get It For Me (row 80).

## Open questions for the owner
- Q1 (payments): should the customer confirm "I've paid the merchant" (and attach the M-Pesa message), or does the runner confirm at the counter? Default: no confirmation; `Done` only closes the screen.

## Current vs design
Re-audit 2026-10-09, customer round 4, `feat/customer-owner-answers` @ `c420265` (docs/audits/customer-gap-report.md, "Re-audit 2026-10-09: customer round 4"): PASS. Details-changed notice above the card with the Fira Code date/time and the optional Support line, reload on `merchant_details:changed` / `merchant_details:updated`; variant B shows the provider failure reason. Minor: `merchant_payment_screen.dart:393, :400` shows `Contact support` twice (in the text and as the trailing link).

Spec update 2026-10-09 (rows 66, 67, 80, 86), against `main` @ `c7675dc` (`merchant_payment_screen.dart`): no details-changed warning exists. Now required: the **Details changed** notice in variant A (with the optional Support line), driven by `merchantDetailsUpdatedAt`, and a refresh when the new notification arrives. Rows 66/67/86 need no client change (wording only). Status set to `partial` until re-audited. Depends on api-contract (`merchantDetailsUpdatedAt`, notification type) and core-ui (model field).

Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Variant A with details-pending state; variant B now follows the price-change difference STK only (row 76; spec updated); nothing-due close with `Nothing to pay right now.`; shared `StkStatusView`.

Re-audit round 3 (2026-10-08, `feat/customer-screens` @ `08f9b26`): PASS against the earlier spec. Spec update 2026-10-08 (rows 42–44, Needs row 41): variant B was a placeholder notice (`We'll show you how to send this amount to your runner here.`); it is now an STK payment to Nitume with the full state table; the nothing-due close must show `Nothing to pay right now.`; increases on both routes and the details-pending state are specced. Status set to `partial` until re-audited.
