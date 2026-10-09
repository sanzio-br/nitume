# x-awaiting-quote — Waiting for quote, then accept quote (checkout)

- Mockup: **not drawn.** Required by OA-3 (authoritative REQUESTED → QUOTED → ACCEPTED flow after the wizard preview) and OA-5 (merchant payment route chosen at checkout). Built from design-system patterns and existing mockup components (`.stk-wrap`, `.form-card`, `.receipt-row`, `.chip` column, `.pm-card`, `.cta-fixed`). Copy is **(proposed)** unless marked "mockup".
- Shared conventions: `_shared.md` (OA-n §0, fees and routes §8)
- Implementation: `apps/customer_app/lib/src/screens/checkout/awaiting_quote_screen.dart` on branch `feat/customer-integrations`
- Status: matches-design

## Purpose
One screen per errand with two main states (plus the expired-quote state of checkout):
- **Waiting** (REQUESTED): tell the customer the final quote is being prepared.
- **Checkout** (QUOTED): show the final quote, let the customer choose how the item amount is paid (if any) and which M-Pesa number to charge, then accept and pay. This is the "accept-quote step".

## Entry / exit
- Entry: `v-new-review` "Submit task →" (replaces the wizard stack); Home active card for REQUESTED ("View request") or QUOTED ("Review quote →"); `v-task-detail` for REQUESTED/QUOTED; push / notification `errand.QUOTED` deep link.
- Exits:
  - Back → previous screen (Home when coming from the wizard).
  - Checkout CTA → errand ACCEPTED → push `v-payment`.
  - "Pay with … Change" → push `v-payment-methods` in select mode; selecting a card pops back with that method.
  - "Cancel task" / "Decline and cancel task" → C-35 confirm → CANCELLED → pop to Home with snackbar `Task cancelled.`
- If the errand is already ACCEPTED when opened: show the checkout state again with chip `Awaiting payment` (the route and payer must be chosen before the STK push; amended in the 2026-10-07 re-audit to match the build). The CTA skips the accept call and pushes `v-payment`. `v-payment` sends an ACCEPTED errand with an item amount and no route back here. If PAYMENT_CONFIRMED or later: replace with `v-track`. CANCELLED / EXPIRED: replace with `v-task-detail`.

## Task states
REQUESTED (waiting), QUOTED (checkout, or expired quote), ACCEPTED (checkout re-entry). Transitions fired here: QUOTED → ACCEPTED (customer); REQUESTED → CANCELLED, QUOTED → CANCELLED and ACCEPTED → CANCELLED (customer, §3.3 as updated 2026-10-08). An expired quote changes no state (row 46).

## Layout — waiting state (REQUESTED)
1. Pushed header (C-10) title `Your quote`.
2. Centred block (like `.stk-wrap`: centred both axes, padding 0 30, text centred):
   1. `PulsingDots` (three 7px slate-400 dots, 1.2 s, staggered 0.2 s), margin-bottom 20.
   2. Heading 17/700, margin-bottom 8.
   3. Body 13 slate-600, max width 260, margin-bottom 22.
3. Task summary card (C-07, margin `0 20 14`): status chip (C-05) `Awaiting quote`; title 15.5/600 (margin `10 0 4`); meta Fira Code 12 slate-600 `#NT-10482 · Today, 10:03 AM`.
4. Button stack (padding 0 20, gap 10): outline `Back to Home` (C-03); text button `Cancel task` in red (destructive, OA-13).

## Layout — checkout state (QUOTED)
1. Pushed header (C-10) title `Your quote`.
2. Scrollable body:
   1. Task summary card (same as above) with chip `Quote ready`.
   2. Form card "Final quote" (C-17 form card + C-18): **one** total row `Total (service + runner fee)` (mockup wording) with the quote total. No `Service fee` / `Runner fee` lines (row 34 clarification, `_shared.md` §8.1). Caption 12 slate-600 under the total: `Valid until 4:30 PM` (Fira Code time) when `expiresAt` is set.
   3. Only when the item amount > 0: form card **"How should this be paid?"** (mockup heading):
      - First line: `Item amount` left, amount right (Fira Code 13/600), padding-bottom 10, hairline.
      - Radio rows (C-16 radio-row variant: pill, slate bg, slate-line border, 12/600 left-aligned; selected = blue fill, white text; optional subtitle 11.5, slate-600 or white when selected), stacked, gap 8:
        - `Pay merchant directly (recommended)` (mockup) → `merchant_direct`. Merchant details come from the merchant or an admin, never from the customer (row 43):
          - **Details available**: enabled. Subtitle: `You'll see the merchant's Till or Paybill number after paying the fees.`
          - **Details pending**: **disabled** (slate-400 text, no tap), subtitle `Available once the merchant's details are added.` When they are added later (notification, or the live status refresh), the row enables in place without changing the customer's current selection.
        - `Send purchase amount to runner` (mockup) → `send_to_runner`. Platform-mediated (row 42). Subtitle (builder copy, accepted (row 76, owner 2026-10-08; spec updated in the 2026-10-09 re-audit)): `You'll pay this amount to Nitume by M-Pesa together with the fees, for your runner's purchase.`
        - The mockup's third option `Let runner advance the purchase` is **removed** (OA-5: runner advance is never a customer choice).
      - Default selection: merchant-direct when available, else send-to-runner.
   4. Form card "Pay with" (used for the fee STK and, for `send_to_runner`, the item-amount STK): C-30 payment method card of the selected method (default M-Pesa method; else the sign-in phone as `M-Pesa` / `+254 712 ••• 678` / tag-less with the 11.5 slate-600 note `Your sign-in number`). Trailing green-700 link `Change` (C-04) when the customer has saved M-Pesa methods.
   5. Text button (C-04) `Decline and cancel task`, red (destructive, OA-13), centred, margin `4 20 20`.
3. Fixed primary CTA (C-01): mockup copy `Confirm & pay KSh 2,200 →` with the amount in Fira Code: the fee total, or, when `send_to_runner` is selected, the fee total plus the item amount (one combined STK (row 76, owner 2026-10-08; spec updated in the 2026-10-09 re-audit)). The Final quote card still shows only the fee total.
   - Expired quote: no CTA while no quote-request endpoint exists (row 68 / SQ-9 open; the fallback below). An admin re-quote (row 72, `quote:reissued`) switches the screen back to checkout.

## Components
| Element | Component | Status |
|---|---|---|
| Header | C-10 | built |
| Waiting dots | `PulsingDots` | built |
| Summary card + chip | C-07 + C-05 | built |
| Final quote | C-17 form card + C-18 | built (caption slot change, see `_shared.md`) |
| Route radio rows | C-16 radio-row variant (app `MerchantRouteRows`) | built |
| Pay-with card | C-30 + C-04 | built |
| Expired / info notices | C-40 | built |
| Confirm dialogs | C-35 | built |
| CTA | C-01 | built |

## Copy (proposed unless marked mockup)
- Header: `Your quote`
- Waiting heading: `Preparing your quote`
- Waiting body: `We're pricing your task. This usually takes a few minutes, and we'll notify you when it's ready.`
- Waiting buttons: `Back to Home`, `Cancel task`
- Checkout card headings: `Final quote`; `How should this be paid?` (mockup); `Pay with`
- Rows: `Total (service + runner fee)` (mockup), `Item amount`
- Validity: `Valid until 4:30 PM`
- CTA (mockup): `Confirm & pay KSh 2,200 →`
- Decline: `Decline and cancel task`
- Cancel / decline dialog: title `Cancel this task?`; body `Nothing has been charged yet.`; buttons `Cancel task` (outline, red text) and `Keep task` (C-01).

States:
- Live update: when the errand moves REQUESTED → QUOTED while open, switch to the checkout state in place (fade), and announce `Your quote is ready.`
- Quote differs from the wizard estimate: no special treatment; the checkout shows the final figures only (OA-3).
- **Quote expired** (row 46): entered when `expiresAt` has passed on load or while the screen is open, or when accept returns code `quote_expired` (also on the ACCEPTED re-entry path if the API refuses initiation with that code). Layout: summary card **without** the status chip (the errand is still QUOTED; the chip would read `Quote ready`, which is no longer true, and the UI never invents a label); the Final quote card stays visible with the caption replaced by `Expired at 4:30 PM` (Fira Code time); the route and Pay-with cards are hidden; C-40 notice `This quote has expired. Ask for a new quote to continue.`; fixed CTA `Request a new quote` (C-01); `Decline and cancel task` stays available.
  - Tap `Request a new quote` → API call (Data) → the screen shows the waiting layout with heading `Preparing a new quote` and body `We'll notify you when your new quote is ready.` (proposed), chip hidden, buttons `Back to Home` / `Cancel task`. A new quote (live status refresh or `errand.QUOTED` push) switches back to checkout with the new figures.
  - Until the request endpoint exists (needs: api-contract; mechanism open as SQ-9): no CTA; the notice reads `This quote has expired. We'll send you a new one.` and decline stays available.
  - Errors: `Couldn't request a new quote. Try again.` (snackbar).
- Accepting: CTA spinner; on success push `v-payment`. Code `quote_expired`: switch to the expired state above (no snackbar). Error 409 (state already changed): reload the errand and route per Entry rules. Other errors: snackbar `Couldn't accept the quote. Try again.`
- Load error: C-33 `Couldn't load this task.` + `Try again`.
- Cancel error: snackbar `Couldn't cancel the task. Try again.`

## Numeric fields (Fira Code)
- Reference `#NT-10482`, timestamps, validity and expiry time, every amount, the amount inside the CTA, the masked phone number.

## Data
- Errand: `GET /api/v1/errands/:id` (exists; `reference`, `title`). needs: api-contract — a customer-safe "merchant details available" flag on the errand (true/false only; the Till/Paybill numbers themselves are shown only after the fees are paid, OA-5), filled by the merchant/admin source (row 43).
- Final quote: `GET /api/v1/errands/:id/quote` (exists) → `total`, `expiresAt`. The Final quote card shows only `Total (service + runner fee)` with `quote.total` (fallback `errand.quotedPrice`), and the CTA reads `Confirm & pay KSh <total> →` (row 34 clarification). The internal quote components are never listed (OA-4).
- Accept: `PATCH /api/v1/errands/:id/status { to: 'ACCEPTED' }` (exists). needs: api-contract — refuse an expired quote with code `quote_expired` (row 46), on accept and on `POST /payments/:errandId/initiate`.
- Fresh quote: needs: api-contract — e.g. `POST /api/v1/errands/:id/quote-request` (customer; QUOTED with an expired quote only; no state change; notifies ops). Mechanism open (SQ-9).
- Cancel: `PATCH /api/v1/errands/:id/status { to: 'CANCELLED' }` (exists for REQUESTED/QUOTED).
- Route + payer: carried to `v-payment`, which calls `POST /payments/:errandId/initiate` with `{ merchantRoute?, paymentMethodId? }` and the `Idempotency-Key` header (row 24). `merchantRoute` is `merchant_direct` or `send_to_runner`, sent only when the item amount is > 0.
- Payment methods: `GET /api/v1/customers/me/payment-methods` (M-Pesa only, OA-10); default = `isDefault`; fallback = `GET /users/me` phone (OA-21).
- Live (rows 23, 29): `errand:join` room `errand:{id}`, `errand:status_changed`. Fallback only while the socket is disconnected: poll `GET /errands/:id` every 15 s while REQUESTED (or waiting for a new quote) and the screen is visible. Push `errand.QUOTED` (exists); needs: api-contract — a push or notification when merchant details are added (event type, see `v-notifications`).

## Resolved by owner answers
- Quote expiry (was Q1): `quote_expired`, fresh quote required, no new transition (row 46).
- Send-to-runner mechanics (was SQ-5): platform-mediated STK to Nitume (row 42).
- Merchant details source (was SQ-6): merchant or admin; customer only picks the route (row 43).
- Fee lines: total only until pricing rates exist (row 34 clarification).

## Accessibility and mobile
- Waiting dots: live region "Waiting for your quote".
- Route options are a radio group; the disabled option announces why.
- CTA amount must equal service + runner fee exactly.

## Open questions for the owner
- SQ-9 (`_shared.md` §9): how the fresh quote is produced after `quote_expired` (customer request vs automatic re-quote). Default: `Request a new quote`.
- Q2: Should the checkout allow changing the route after payment (e.g. merchant details arrive later)? Default: no; route is fixed once the fees are paid.

## Current vs design
Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Total-only fee row, route rows with merchant-details states, CTA with the combined amount for send_to_runner (row 76), quote expiry without a CTA (row 68 fallback), admin re-quote and merchant-details live refresh.

Round 2 (2026-10-07, `feat/customer-screens` @ `ba45633`): PASS. Final quote shows only `Total (service + runner fee)` from `quote.total`; CTA `Confirm & pay KSh … →` (amount still Fira Sans, core CC-2); ACCEPTED shows checkout again. Round 1 FAIL details: `docs/audits/customer-reaudit-2026-10-07.md`.

Spec update 2026-10-08 (rows 34, 42, 43, 46): the build shows `This quote has expired.` with the CTA disabled and nothing else. Now required: the expired-quote state above (`quote_expired` handling, chip hidden, `Request a new quote` once the endpoint exists), the send-to-runner subtitle for the platform-mediated flow, the merchant-direct row enabling in place when details arrive. Status set to `partial` until re-audited.
