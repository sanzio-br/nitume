# customer `x-merchant-payment` (web): pay the item amount (merchant Till/Paybill, or to Nitume for your runner)

- Issue #8. Route: `/app/customer/tasks/:errandId/item-payment` = `customerLinks.itemPayment(id)` (**NEW #8**, A§1). Customer shell, `data { role, navKey: 'track', pushed: true }`, route `title: 'Pay the item amount · Nitume'`. Variant A sets the document title to `Pay the merchant · Nitume` through Angular's `Title` service once loaded (no custom `TitleStrategy`). Shared #8 rules: `customer-x-awaiting-quote.md` §A (A§n). Kit `ui-kit.md` (K§n), `auth-foundation.md` (F§n).
- Sources:
  - mobile spec `docs/specs/customer/x-merchant-payment.md` (matches-design);
  - Flutter `apps/customer_app/lib/src/screens/checkout/merchant_payment_screen.dart`, `widgets/stk_view.dart`, core `copyable_value_row.dart`;
  - System Design §6; OA-5, OA-6, OA-13; rows 42, 43, 44, 48, 66, 67, 76, 80, 82, 86, 95, 248, Needs row 41; owner WQ-27, WQ-28, WQ-35;
  - API `apps/api/src/payments/payments.{controller,service}.ts`, `payment-views.ts` on `origin/main` @ `380be22`, including PR #29 (issue #28).
  - The mockup does not draw this view.
- Implementation: none (no route yet). Status: **missing**.
- **Updated 2026-10-29**:
  - PR #29 (issue #28) is on `main`: the server now withholds the numbers until the fees are paid, and the client rule below is defence in depth, not the only guard;
  - `price_change:difference_paid` (row 248) added as a re-read trigger;
  - aligned with #7 (`customerLinks`, `nm-fixed-cta`, `apiErrorOf`, `onStateChange`, `CUSTOMER_NOW`; page under `app-area/customer/checkout/`).

## Purpose
Show exactly what to pay for the item/merchant amount and how, kept apart from the service and runner fees (three flows, A§4).
- **Variant A, `merchant_direct`**: the customer pays the merchant's Till/Paybill from their own M-Pesa. Nitume does not collect it and never STK-pushes to a merchant; an approved increase is paid the same way, manually, to the same Till/Paybill (row 67).
- **Variant B, `send_to_runner`**: the original item amount was part of the combined fee STK (row 76), so this page only follows an **approved price-change increase** charged to Nitume by STK (rows 42, 44), with the `v-payment` state handling. Nitume reimburses the runner through the payout ledger (row 95); this page says nothing about it, shows no runner number and offers no transfer to the runner.
- Only Buy For Me and Get It For Me carry an item amount (row 80).

## Entry / exit
- Entry: Track notice `Pay the item amount` (#9); Task detail `View payment details` (#9); `v-price-auth` after an approved increase (navigation state `{ approvedIncrease, priceChangeRequestId }`); notification "merchant details added" / `merchant_details.changed` (#11); reload or bookmark.
- Exit: `Done` or Back → previous page (fallback `customerLinks.track(errandId)`). A pending variant-B STK keeps running server-side; reopening shows its state and never sends a second prompt by itself.
- **Nothing due** (no item payment on the errand, or amount 0, on any route): toast `Nothing to pay right now.` (approved, Needs row 41) and leave: `location.back()` when the previous history entry is inside `/app`, else `customerLinks.track(errandId)` (`replaceUrl`).
- A§2 status routing first: before PAYMENT_CONFIRMED → `…/quote`; terminal → Task detail.
- **Merchant numbers (OA-5; issue #28).**
  - **Server (primary guard, on `main` since PR #29):** for the customer role the API sends `tillNumber`, `paybillNumber` and `accountReference` as `null` in `merchantPayment` and in every `differencePayments[].merchantPayment` until the errand's primary payment (`priceChangeRequestId` null) is `completed`. They are also null again if that payment becomes `refunded`. `merchantName`, `route`, `amount` and the `merchantDetails*` fields are unchanged (WQ-35).
  - **Client (defence in depth, kept):** the Till/Paybill rows are rendered only when the errand is PAYMENT_CONFIRMED or later **and** the main `payment.status` is `completed` **and** the number is non-null. Otherwise variant A shows the details-pending layout. The client never reads the numbers from the errand view or a socket payload (A§5, A§7).
  - With the server rule in place, a null number before payment is the normal case, not an error. The details-pending layout covers it.

## Task states
PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER (§6 sequence: never before the fees are paid). Price-change differences arise only in IN_PROGRESS (row 49). Hidden for `platform_only`. No transition is fired here.

## Which variant (port of the Flutter decision)
From `GET /payments/:errandId` (A§5):
1. `outstanding` = the newest `differencePayments` entry paid to Nitume (`merchantPayment.paidTo === 'nitume'`, else `payment.paymentFlow === 'customer_to_runner'`) whose `payment.status` is not `completed`.
2. If `outstanding` exists, or (a difference paid to Nitume exists and the main route is not `merchant_direct`) → **variant B** on `outstanding`, else on the newest such difference (so a just-paid difference shows its SUCCESS).
3. Else if `merchantPayment.route === 'merchant_direct'` and `isPositiveKes(merchantPayment.amount)` → **variant A** (details shown when Till or Paybill is non-null and the client rule above holds; else details pending).
4. Else → nothing due.

## Layout (web)
Frame: `nm-pushed-header` with the variant title. Content: single column, full width with 20px padding below 768px; `max-width: 560px` centred from 768px (web adaptation). Gaps 14px.

### Variant A — `merchant_direct` (header `Pay the merchant`)
1. Intro: heading `Pay the merchant directly` 17/700 blue; 6px; body `muted`.
2. **Details changed** (row 80; only when `merchantDetailsChangedAfterPayment` and `merchantDetailsUpdatedAt` are set): `nm-notice` info (leading info icon, no coloured fill) **above the card**: `The merchant's payment details changed on ` + `formatDayTime(merchantDetailsUpdatedAt)` in `nmNum` + `. Check the number below before you pay.`; when `links.customer.supportUrl` is configured (F§8) a second line `Already paid the old number?` with the notice's trailing `nm-button` link small `Contact support` (`href`, new tab). `Contact support` appears once. The old number is never shown.
3. `nm-card` (padding `4px 16px`) of `nm-copy-row`s separated by 1px slate-line hairlines:
   - `Merchant` — `merchantName` (Sans 15/600, no Copy) when present and the numbers are shown (in the details-pending layout the name is not shown, as the app).
   - Till: `Till number (Buy Goods)` — `tillNumber` + `Copy`.
   - Paybill: `Paybill number` — `paybillNumber` + `Copy`; `Account number` — `accountReference` + `Copy` when present.
   - `Amount` — `formatKes(amount)` (Code 20/600) + `Copy` (copies digits only, e.g. `40000`).
4. When an increase was approved: 12.5 blue Sans line `Includes the ` + `formatKes(increase)` in `nmNum` Code 12.5/600 **amber** + ` increase you approved.` `increase` = navigation state `approvedIncrease` when present, else (web adaptation, survives a reload) the newest `merchant_direct` entry of `differencePayments` with `isPositiveKes(payment.merchantAmount)`. This is an item amount inside the item amount, never a fee (WQ-27).
5. How-to, 12.5 slate-600: Till `On M-Pesa, choose Lipa na M-PESA → Buy Goods and Services, enter the Till number and amount.`; Paybill `On M-Pesa, choose Lipa na M-PESA → Pay Bill, enter the Paybill number, account number and amount.`
6. CTA primary `Done` in `nm-fixed-cta` (#7; fixed below 768px, inline 16px below the how-to from 768px, the button `max-width: 320px`). `Done` = Back (fallback Track). Toasts on this page pass `NmFixedCtaOffset.toastOffset()`.

**Details pending** (no Till/Paybill on the errand, or the OA-5 rule not met): header and intro as above; the card shows only `Amount` (no Copy); `nm-notice` `The merchant's details aren't available yet. We'll notify you when they are.`; CTA `Done`. Details come from the merchant or an admin (row 43); the customer never enters them.

### Variant B — `send_to_runner` difference (header `Pay the item amount`)
The API starts the difference STK when the customer approves, so the page opens on the STK block (no READY step). `nm-stk-status` (A§8, the same component as `v-payment`) with:
- Body: `Enter your M-Pesa PIN on the prompt sent to your phone to pay for the items.` (the API returns no target number for a difference; with one: `…sent to +254 712 345 678 to pay for the items.`).
- Amount: the difference `amount` (`payment.merchantAmount`), Code 30/600. No `Includes` line.
- No fixed CTA (buttons are in the block).

| State | Heading | Body | Buttons |
|---|---|---|---|
| PENDING | `Check your phone` | as above | primary `I've paid — continue` → re-read now; still pending → `We haven't heard from M-Pesa yet. Keep this screen open.` |
| SUCCESS | `Item amount paid` | `Thanks. Your runner can go ahead with the purchase.` | primary `Done` |
| FAILED | `Payment didn't go through` | `M-Pesa didn't confirm this payment. You haven't been charged. You can try again.` + `failureReason` line when present | primary `Try again` (retry the difference), outline `Back` |
| TIMEOUT | `Still checking your payment` | `M-Pesa hasn't confirmed yet. If you entered your PIN, don't pay again. We'll update this screen as soon as we hear back.` | primary `Check again`, outline `Send a new prompt` |

- `Try again` (FAILED) and `Send a new prompt` (TIMEOUT) → `POST /payments/:errandId/price-changes/:requestId/initiate` (request id = navigation state `priceChangeRequestId`, else `payment.priceChangeRequestId` of the shown difference). The API pushes again only after FAILED; a pending or paid difference comes back as is (no second push). Without a request id, `Send a new prompt` only re-reads. Error → toast `friendlyError`.
- Polling and visibility as A§7 (5 s, then 30 s after 2 min, stop after 10 min counted from the page opening with `CUSTOMER_NOW`, paused while hidden). `errand:status_changed`, `price_change:difference_paid` for this errand (row 248, web adaptation) and reconnect (`onStateChange`) re-read at once.

## Copy (exact, from the mobile spec as built)
- Variant A heading `Pay the merchant directly`; body `Pay this amount from your M-Pesa straight to the merchant. It's separate from the fees you've already paid.`
- Row labels `Merchant`, `Till number (Buy Goods)`, `Paybill number`, `Account number`, `Amount`; button `Copy`; toast `Copied`.
- Increase line `Includes the KSh 5,000 increase you approved.`
- How-to lines above; CTA `Done`.
- Details pending `The merchant's details aren't available yet. We'll notify you when they are.`
- Details changed `The merchant's payment details changed on Today, 4:45 PM. Check the number below before you pay.` + `Already paid the old number?` + link `Contact support`.
- Variant B table above.
- Load error `Couldn't load the payment details.` + `Try again`. Nothing due toast `Nothing to pay right now.`
- Web addition (proposed): copy failure toast `Couldn't copy. Select the number and copy it.` (browser clipboard permission refused or API missing).
- Banned: "release", "hold", "escrow", "wallet", "balance" (OA-6); never "send money to your runner" or a runner phone number (row 42).

## States
| State | Behaviour |
|---|---|
| Loading | One `nm-skeleton-card` height 220 |
| Load error (first load) | `nm-error-state` `Couldn't load the payment details.` + `Try again` |
| Refresh error (after a first load) | Keep the content; retry on the next schedule tick |
| Variant A / details pending / details changed | §Layout |
| Merchant details arrive or change | `merchant_details:updated` / `merchant_details:changed` → re-read; the card updates in place |
| Variant B states | Table above |
| Errand cancelled while open | `errand:status_changed` → re-read → A§2 → Task detail |
| Nothing due | Toast + leave (Entry / exit) |

## Components
Reused: `nm-pushed-header`, `nm-card`, `nm-notice`, `nm-button`, `nmNum`, `NmToastService` (kit); `nm-fixed-cta` (#7); `nm-stk-status` (#8, A§8, `app-area/customer/shared/`).

**`nm-copy-row`** (NEW #8, kit, `shared/ui/copy-row/`, port of C-39 `CopyableValueRow`):
- Layout: a column, padding 12px 0. Label at 12.5 slate-600 (`nm-type(field-label, $weight: 400)`); 2px; then the value as selectable text.
- Value styles: `number` (Code 16/600 blue, `nm-type(num, 16px, 600)`), `amount` (`num-amount`, Code 20/600), `text` (Sans 15/600, `nm-type(body-lg, $weight: 600)`).
- Trailing small `nm-button` variant `text` `Copy` (48px hit area), with accessible name `Copy <label>` (e.g. `Copy Till number (Buy Goods)`).
- Inputs: `copyValue` (default `value`), `copyable` (default true).
- Copy uses `navigator.clipboard.writeText` through an injectable `NM_CLIPBOARD` token (default `navigator.clipboard`; replaced in tests). Success shows the toast `Copied`; a rejection or a missing clipboard API shows the copy-failure toast.

## Numeric fields (Fira Code)
Till number, Paybill number, account number (as returned; Code even when alphanumeric, as the app), every amount (card, increase line, STK block), the date/time in the details-changed notice, the payer number when shown.

## Data
- `GET /payments/:errandId` → `merchantPayment`, `differencePayments`, main `payment.status` (A§5). `GET /errands/:id` for A§2.
- `POST /payments/:errandId/price-changes/:requestId/initiate` (variant B retry).
- Socket: `errand:status_changed`, `merchant_details:updated`, `merchant_details:changed` (`{ errandId, merchantName, tillNumber, paybillNumber, accountReference, merchantDetailsUpdatedAt }`; since #28 the numbers are null for a customer before the fees are paid), `price_change:difference_paid` (row 248). The page never renders anything from a socket payload; each event only triggers a re-read of `GET /payments/:errandId`.
- Gaps (A§9): `merchantPayment.amount` is the original item amount, not the outstanding one after approved changes (needs api-contract; until then the web shows the API value, as the app); the "merchant details added" notification type (needs api-contract). **Closed:** merchant numbers exposed before payment (PR #29, issue #28).
- Whether the customer confirms "I've paid the merchant" stays open (mobile Q1; default: no confirmation, `Done` only closes).

## Accessibility and responsive
- Each `Copy` button labelled `Copy <label>`; the toast is announced (`role="status"`).
- Numbers selectable as text (`user-select: text`).
- Variant B state changes announced (as `v-payment`).
- No horizontal scroll at 360px: long account references wrap (`overflow-wrap: anywhere`).

## Required tests (Vitest; cited as MP Tn)
1. **Merchant-direct path (variant A)**: Till details → `Pay the merchant directly`, rows `Merchant`, `Till number (Buy Goods)`, `Amount`, Till how-to; Paybill details → `Paybill number`, `Account number`, Paybill how-to.
2. Values in `nmNum` with the right styles; `Copy` on the amount writes `40000` (digits only) to the injected clipboard and shows `Copied`; clipboard rejection → copy-failure toast; `Copy` accessible names.
3. **Item amount kept apart (WQ-27)**: the page shows only the item amount (no fee figure anywhere, even with a fixture `payment.serviceFee` / `runnerFee` present), and the intro says it is separate from the fees.
4. Increase line from navigation state (`approvedIncrease: '5000.00'` → `Includes the KSh 5,000 increase you approved.`, amount amber token, Fira Code); after a simulated reload (no state) derived from the newest `merchant_direct` difference.
5. Details pending: only `Amount` (no Copy) + pending notice; a `merchant_details:updated` event re-reads and shows the Till.
6. **OA-5 / #28**:
   - (a) the server's own pre-payment shape: `merchantPayment` with `tillNumber: null, paybillNumber: null, accountReference: null`, a non-null `merchantName` (WQ-35) and a `pending` main payment → the details-pending layout, with no merchant name, no number and no `Copy`;
   - (b) defence in depth: a fixture that wrongly carries a Till while the main payment is `pending` (or the errand ACCEPTED) → no Till rendered (details-pending layout or A§2 redirect);
   - (c) after the fees are paid (`completed`) and the numbers are present → the Till is rendered;
   - (d) a `merchant_details:updated` payload carrying numbers is never rendered; only the re-read result is.
7. Details changed: notice above the card with the time in Fira Code; with `supportUrl` set → `Already paid the old number?` + one `Contact support` link; without → no second line; `Contact support` text occurs once.
8. **Send-to-runner path (variant B)**: an unpaid `customer_to_runner` difference with `stkStatus: 'PENDING'` → `Check your phone`, body `…to pay for the items.`, amount = the difference only (never fees, never the original item amount).
9. Variant B SUCCESS → `Item amount paid` + `Done`; FAILED with reason → copy + reason; `Try again` calls `POST …/price-changes/:requestId/initiate` with the request id from state, else from the payment; TIMEOUT → `Check again` re-reads, `Send a new prompt` calls the same endpoint.
10. Variant B polling cadence and pause while hidden (fake timers).
11. **Nothing due**: `merchantPayment: null` and no differences (and, separately, a `merchant_direct` amount of `0.00`) → toast `Nothing to pay right now.` and back navigation (in-app history) or Track (`replaceUrl`) without it.
12. A§2: ACCEPTED → `…/quote`; CANCELLED → Task detail; `errand:status_changed` to CANCELLED while open → Task detail.
13. Load error copy and retry; refresh error keeps the content.
14. No banned words (`wallet`, `escrow`, `balance`, `hold`, `release`) in the rendered DOM of every state.
15. `price_change:difference_paid` for this errand → one immediate re-read (variant B moves to SUCCESS); an event for another errand → nothing.
16. Toasts on this page carry the `nm-fixed-cta` offset below 768px.

## Current vs design
Not built (no route). The Flutter screen is the reference (`matches-design`; open minor there: `Contact support` shown twice, not ported). Web differences:
- the increase line survives a reload (derived from the payment list);
- the OA-5 client render rule, kept as defence in depth now that the API withholds the numbers (#28);
- the clipboard failure toast;
- the `price_change:difference_paid` re-read.
