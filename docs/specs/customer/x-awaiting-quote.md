# x-awaiting-quote — Waiting for quote, then accept quote (checkout)

- Mockup: **not drawn.** Required by OA-3 (authoritative REQUESTED → QUOTED → ACCEPTED flow after the wizard preview) and OA-5 (merchant payment route chosen at checkout). Built from design-system patterns and existing mockup components (`.stk-wrap`, `.form-card`, `.receipt-row`, `.chip` column, `.pm-card`, `.cta-fixed`). Copy is **(proposed)** unless marked "mockup".
- Shared conventions: `_shared.md` (OA-n §0, fees and routes §8)
- Implementation: `apps/customer_app/lib/src/screens/checkout/awaiting_quote_screen.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
One screen per errand with two states:
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
REQUESTED (waiting), QUOTED (checkout). Transitions fired here: QUOTED → ACCEPTED (customer); REQUESTED → CANCELLED and QUOTED → CANCELLED (customer, §3.3).

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
   2. Form card "Final quote" (C-17 form card + C-18 rows): `Service fee`, `Runner fee`, total row `Total (service + runner fee)` (mockup wording). Caption 12 slate-600 under the total: `Valid until 4:30 PM` (Fira Code time) when `expiresAt` is set.
   3. Only when the item amount > 0: form card **"How should this be paid?"** (mockup heading):
      - First line: `Item amount` left, amount right (Fira Code 13/600), padding-bottom 10, hairline.
      - Radio rows (C-16 radio-row variant: pill, slate bg, slate-line border, 12/600 left-aligned; selected = blue fill, white text; optional subtitle 11.5, slate-600 or white when selected), stacked, gap 8:
        - `Pay merchant directly (recommended)` (mockup) → `merchant_direct`. Subtitle: `You'll see the merchant's Till or Paybill number after paying the fees.` **Disabled** (slate-400 text, no tap) when the errand has no merchant details, with subtitle `Available once the merchant's details are added.` (SQ-6).
        - `Send purchase amount to runner` (mockup) → `customer_to_runner`. Subtitle: `You'll get instructions after paying the fees.`
        - The mockup's third option `Let runner advance the purchase` is **removed** (OA-5: runner advance is never a customer choice).
      - Default selection: merchant-direct when available, else send-to-runner.
   4. Form card "Pay with": C-30 payment method card of the selected method (default M-Pesa method; else the sign-in phone as `M-Pesa` / `+254 712 ••• 678` / tag-less with the 11.5 slate-600 note `Your sign-in number`). Trailing green-700 link `Change` (C-04) when the customer has saved M-Pesa methods.
   5. Text button (C-04) `Decline and cancel task`, red (destructive, OA-13), centred, margin `4 20 20`.
3. Fixed primary CTA (C-01): mockup copy `Confirm & pay KSh 2,200 →` with the fee total (service + runner) in Fira Code.

## Components
| Element | Component | Status |
|---|---|---|
| Header | C-10 | built |
| Waiting dots | `PulsingDots` | built |
| Summary card + chip | C-07 + C-05 | built |
| Final quote | C-17 form card + C-18 | built (caption slot change, see `_shared.md`) |
| Route radio rows | C-16 radio-row variant | **NEW** |
| Pay-with card | C-30 + C-04 | built |
| Expired / info notices | C-40 | **NEW** |
| Confirm dialogs | C-35 | **NEW** |
| CTA | C-01 | built |

## Copy (proposed unless marked mockup)
- Header: `Your quote`
- Waiting heading: `Preparing your quote`
- Waiting body: `We're pricing your task. This usually takes a few minutes, and we'll notify you when it's ready.`
- Waiting buttons: `Back to Home`, `Cancel task`
- Checkout card headings: `Final quote`; `How should this be paid?` (mockup); `Pay with`
- Rows: `Service fee`, `Runner fee`, `Total (service + runner fee)` (mockup), `Item amount`
- Validity: `Valid until 4:30 PM`
- CTA (mockup): `Confirm & pay KSh 2,200 →`
- Decline: `Decline and cancel task`
- Cancel / decline dialog: title `Cancel this task?`; body `Nothing has been charged yet.`; buttons `Cancel task` (outline, red text) and `Keep task` (C-01).

States:
- Live update: when the errand moves REQUESTED → QUOTED while open, switch to the checkout state in place (fade), and announce `Your quote is ready.`
- Quote differs from the wizard estimate: no special treatment; the checkout shows the final figures only (OA-3).
- Quote expired (`expiresAt` passed): C-40 notice above the CTA `This quote has expired.`; CTA disabled; decline still available. What happens next is open (Q1).
- Accepting: CTA spinner; on success push `v-payment`. Error 409 (state already changed): reload the errand and route per Entry rules. Other errors: snackbar `Couldn't accept the quote. Try again.`
- Load error: C-33 `Couldn't load this task.` + `Try again`.
- Cancel error: snackbar `Couldn't cancel the task. Try again.`

## Numeric fields (Fira Code)
- Reference `#NT-10482`, timestamps, validity time, every amount, the amount inside the CTA, the masked phone number.

## Data
- Errand: `GET /api/v1/errands/:id` (exists; `reference`, `title` need: api-contract per OA-15; merchant details need: api-contract per SQ-6).
- Final quote: `GET /api/v1/errands/:id/quote` (exists on `feat/api-customer-gaps`). needs: api-contract — return customer-facing `serviceFee`, `runnerFee`, `itemAmount`, `total`, `expiresAt`. **TODO pending row 34**: mapping of quote components to the two fee lines; the client renders the fields only. Build default until the API returns `serviceFee` / `runnerFee` (clarified in the 2026-10-07 re-audit): the Final quote card shows only the total row `Total (service + runner fee)` with `quote.total`, and the CTA reads `Confirm & pay KSh <quote.total> →`. The internal quote components (base, distance, time, urgency, complexity, premium) are never listed to the customer (OA-4).
- Accept: `PATCH /api/v1/errands/:id/status { to: 'ACCEPTED' }` (exists).
- Cancel: `PATCH /api/v1/errands/:id/status { to: 'CANCELLED' }` (exists for REQUESTED/QUOTED).
- Route + payer: carried to `v-payment`, which calls `POST /payments/:errandId/initiate` with `{ flow, paymentMethodId?, idempotencyKey }` (A-6 and A-7 blocked; idempotency pending row 24).
- Payment methods: `GET /api/v1/customers/me/payment-methods` (M-Pesa only, OA-10); default = `isDefault`; fallback = `GET /users/me` phone (OA-21).
- Live: room `errand:{id}`, status event (name pending row 23, use `RealtimeEvents`); until a socket client is approved (row 29) poll `GET /errands/:id` every 15 s while REQUESTED and the screen is visible. Push `errand.QUOTED` (exists in `NotificationEventType`).

## Accessibility and mobile
- Waiting dots: live region "Waiting for your quote".
- Route options are a radio group; the disabled option announces why.
- CTA amount must equal service + runner fee exactly.

## Open questions for the owner
- Q1 (state machine): §3.3 has no transition out of QUOTED when a quote expires (no QUOTED → REQUESTED or → EXPIRED). What should the customer see and do? Default: notice, CTA disabled, decline available.
- SQ-5, SQ-6 (`_shared.md` §9): send-to-runner mechanics; source and timing of merchant details.
- Q2: Should the checkout allow changing the route after payment (e.g. merchant details arrive later)? Default: no; route is fixed once the fees are paid.

## Current vs design
Round 2 (2026-10-07, `feat/customer-screens` @ `ba45633`): PASS. Final quote shows only `Total (service + runner fee)` from `quote.total`; CTA `Confirm & pay KSh … →` (amount still Fira Sans, core CC-2); ACCEPTED shows checkout again. Round 1 FAIL details: `docs/audits/customer-reaudit-2026-10-07.md`.
