# v-payment — Payment (M-Pesa STK push)

- Mockup: `docs/design/nitume_customer_app.html` lines 410–421 (`#v-payment`, overlay)
- Shared conventions: `_shared.md` (OA-n §0, fees §8)
- Implementation: `apps/customer_app/lib/src/screens/checkout/payment_screen.dart` on branch `feat/customer-integrations`
- Status: matches-design

## Purpose
Send the M-Pesa STK push for the **fee total (service + runner fee) only** and follow it to a result: PENDING, SUCCESS, FAILED or TIMEOUT (OA-21).

## Entry / exit
- Entry: checkout CTA on `x-awaiting-quote` (errand ACCEPTED) with `{ merchantRoute?, paymentMethodId? }`; Home active card "Pay now →" for ACCEPTED; `v-task-detail` "Pay now" for ACCEPTED; notification "Payment failed".
- Back → previous screen. A pending payment keeps running server-side; reopening this screen shows the current state and **never sends a second prompt by itself**.
- SUCCESS → reset the stack to the shell with the **Track** tab on this errand (OA-21). If the route is `merchant_direct` (with merchant details) or `send_to_runner`, Track shows the "Pay the item amount" notice that leads to `x-merchant-payment`. For `merchant_direct` the item amount is never part of this STK. For `send_to_runner` it **is** part of this STK: one combined charge (row 76, owner 2026-10-08; spec updated in the 2026-10-09 re-audit); Track then shows a notice only for an unpaid price-change difference.

## Task states
ACCEPTED (paying) → PAYMENT_CONFIRMED (SUCCESS). FAILED and TIMEOUT leave the errand ACCEPTED.

## Layout (top to bottom)
1. Pushed header (C-10) title `Payment`.
2. Centred block (`.stk-wrap`: centred both axes, padding 0 30, text centred):
   1. Icon circle 64px green-050 with a phone glyph 28px stroke green (margin-bottom 20). FAILED: red-050 circle is **not** allowed (red only as accents, OA-13) → slate circle (`#F4F6F9` with slate-line border) with a blue glyph. SUCCESS: green-050 circle with a green check (complete state).
   2. Heading 17/700 (margin-bottom 8).
   3. Body 13 slate-600, max width 260 (margin-bottom 22).
   4. Amount Fira Code 30/600 (margin-bottom 26).
   5. PENDING only: `PulsingDots` (three 7px slate-400 dots) (margin-bottom 30).
   6. Button stack, width 220, gap 10: primary (C-01) and, where listed, outline (C-03).

## Components
| Element | Component | Status |
|---|---|---|
| Header | C-10 | built |
| Icon circle | screen-local composition of tokens | — |
| Waiting dots | `PulsingDots` | built |
| Amount | C-32 `NumText` | built |
| Buttons | C-01, C-03 | built |

## Copy
Mockup (PENDING):
- Header: `Payment`
- Heading: `Check your phone`
- Body: `Enter your M-Pesa PIN on the prompt sent to +254 712 345 678 to confirm this payment.`
- Amount: `KSh 2,200`
- Button: `I've paid — continue`

Other states (proposed):

| State | Heading | Body | Buttons |
|---|---|---|---|
| INITIATING | `Check your phone` | mockup body | primary disabled `Sending prompt…` |
| PENDING | mockup | mockup | primary `I've paid — continue` → checks status now. Still pending: inline under the buttons 12.5 slate-600 `We haven't heard from M-Pesa yet. Keep this screen open.` |
| SUCCESS | `Payment received` | `Thanks. We're finding a runner for your task.` | none; auto-navigate to Track after 1.5 s |
| FAILED | `Payment didn't go through` | `M-Pesa didn't confirm this payment. You haven't been charged. You can try again.` (if the provider gave a reason such as "cancelled by user", show it as a second line) | primary `Try again`, outline `Back` |
| TIMEOUT | `Still checking your payment` | `M-Pesa hasn't confirmed yet. If you entered your PIN, don't pay again. We'll update this screen as soon as we hear back.` | primary `Check again`, outline `Send a new prompt` |
| Initiate error (network / 5xx) | `Couldn't send the prompt` | `Check your connection and try again.` | primary `Try again`, outline `Back` |

Load failure (errand or payment could not be read): C-33 `Couldn't load this payment.` + `Try again` (builder copy, accepted in the 2026-10-07 re-audit).

TIMEOUT is **not** a failure (OA-21): the screen keeps listening; a late SUCCESS still moves to Track, and a late FAILED shows the FAILED state.

## Rules
- **Payer number** (OA-21): the method chosen on checkout, else the default M-Pesa payment method, else the sign-in phone. The body shows that number (formatted `+254 712 345 678`).
- **Amount**: what the STK charges, from the API payment record: the fee total, plus the item amount for `send_to_runner` (row 76). Shown as one amount (Fira Code 30/600). For `send_to_runner` a 12.5 slate-600 line under it: `Includes KSh 40,000 for your runner's purchase.` (amount in Fira Code; builder copy, accepted as proposed while BOARD row 91 is open).
- **TIMEOUT** (rows 52, 63): the API's `stkStatus` decides (provider status via Daraja STK Query; 120 s initial, configurable). The client does not run a shorter timer of its own; a client-side fallback window, used only when `stkStatus` is missing, must not be shorter than the server's (use 120 s).
- **Safe retry** (OA-21; row 24: `Idempotency-Key` header backed by `payments.idempotency_key`):
  - Every initiation carries an idempotency key generated by the client (UUID v4) and stored with the errand id for the life of that attempt. Re-sending the same request (app restart, network retry) reuses the key, so the server returns the existing attempt and pushes nothing new.
  - `Try again` after FAILED starts a new attempt with a new key.
  - `Send a new prompt` after TIMEOUT starts a new attempt with a new key and passes the previous `checkoutRequestId`; the server must confirm the previous push is final (not succeeded, not still open) before sending another, and must answer SUCCESS without a new push if the previous one succeeded.
  - The client never sends two initiations in parallel; buttons are disabled while a call is in flight.

## Numeric fields (Fira Code)
- Amount `KSh 2,200`.
- Phone number in the body copy.

## Data
- Initiate: `POST /api/v1/payments/:errandId/initiate` `{ merchantRoute?: 'merchant_direct' | 'send_to_runner', paymentMethodId? }` + `Idempotency-Key` header (exists; core `initiateWith`). Customers never send `runner_advance` (OA-5). Code `quote_expired` (row 46) → push back to `x-awaiting-quote` in its expired state.
- Status: `GET /api/v1/payments/:errandId` (exists) → `stkStatus` (`PENDING | SUCCESS | FAILED | TIMEOUT`). needs: api-contract — the provider failure reason on the payment summary (open minor) and Daraja STK Query behind TIMEOUT (row 52).
- Live (rows 23, 29): STK status has no socket event (a FAILED or TIMEOUT push changes no errand state), so this screen polls `GET /payments/:errandId` every 5 s while PENDING/TIMEOUT and visible, then every 30 s up to 10 minutes, **whether or not the socket is connected** (accepted in the 2026-10-09 re-audit). `errand:status_changed` to PAYMENT_CONFIRMED still moves on at once.
- Push: "Payment confirmed / failed" (§4.4); needs: api-contract — add `payment.confirmed` / `payment.failed` to `NotificationEventType` if not yet there.
- Dev note: v1 STK is mocked. The app must never call `/payments/mpesa/callback` in any build.

## Accessibility and mobile
- State heading changes are announced (live region); dots announced as "Waiting for M-Pesa confirmation".
- Keep the screen awake while PENDING (optional).

## Resolved by owner answers
- After payment go to Track: OA-21 (was Q-NAV-1).
- STK states and timeout handling: OA-21 (was Q2); TIMEOUT from the provider status, 120 s initial (rows 52, 63).
- Payer number: OA-21 (was Q3).

## Current vs design
Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Combined STK amount for send_to_runner with `Includes KSh … for your runner's purchase.` (row 76; row 91 open, accepted as proposed), 120 s client window, `quote_expired` / `quote_not_accepted` back to checkout, polling while the socket is connected (accepted).

Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: provider failure reason not shown as a second line; payer shown as the saved masked number. Builder copy `Couldn't load this payment.` accepted (see Copy).

Spec update 2026-10-08 (rows 24, 34, 46, 52, 63): minor only, status unchanged. The build's client confirmation window is 90 s (`payment_screen.dart:22`), shorter than the server's 120 s; raise it to at least 120 s or drop it when `stkStatus` is present. Handle `quote_expired` on initiate.
