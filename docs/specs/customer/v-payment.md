# v-payment — Payment (M-Pesa STK push)

- Mockup: `docs/design/nitume_customer_app.html` lines 410–421 (`#v-payment`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

## Purpose
Trigger the M-Pesa STK push for the service fee + runner fee and wait for the customer to enter their PIN on the prompt.

## Entry / exit
- Entry: "Confirm & pay …" on `v-new-review` (errand in ACCEPTED). Also retry from task detail if a payment failed (implied).
- Back → `v-new-review` (payment stays pending server-side; returning should resume, not re-push — idempotency).
- Success (PAYMENT_CONFIRMED) → reset the stack and open the `v-track` tab for this errand. Mockup button "I've paid — continue" calls `jump('v-track', true)`, which in the mockup JS lands on Home (Q-NAV-1).

## Task states
ACCEPTED (waiting) → PAYMENT_CONFIRMED (success). Failure keeps ACCEPTED with `payments.status = failed`.

## Layout (top to bottom)
1. Pushed header (C-10) title `Payment`.
2. Centred block (`.stk-wrap`: flex column, centred both axes, padding 0 30, text centred):
   1. Icon circle 64px green-050 with a phone glyph 28px stroke green (margin-bottom 20).
   2. Heading 17/700 (margin-bottom 8).
   3. Body 13 slate-600, max width 260 (margin-bottom 22).
   4. Amount Fira Code 30/600 (margin-bottom 26).
   5. Three 7px slate-400 dots blinking (1.2s, staggered 0.2s) — waiting indicator (margin-bottom 30).
   6. Primary button width 220.

## Components
| Element | Component | Status |
|---|---|---|
| Icon circle | screen-local composition of tokens (OK) | — |
| Waiting dots | NEW `PulsingDots` (reusable loading indicator) | NEW |
| Amount | C-32 | NEW |
| Button | C-01 | core |

## Copy (exact)
- Header: `Payment`
- Heading: `Check your phone`
- Body: `Enter your M-Pesa PIN on the prompt sent to +254 712 345 678 to confirm this payment.`
- Amount: `KSh 2,200`
- Button: `I've paid — continue`

Implied states (recommended copy):
- Initiating: dots + button disabled `Sending prompt…`.
- Confirmed: brief success (green-050 circle with green check) `Payment received` then auto-navigate to Track.
- Failed / cancelled on phone: heading `Payment didn't go through`, body `You can try again. You haven't been charged.`, primary `Try again`, outline `Back`.
- Timeout (no callback after N seconds, Q2): `Still waiting for M-Pesa…` + `Check again` / `Try again`.

## Numeric fields (Fira Code)
- Amount `KSh 2,200`.
- Phone number in the body copy.

## Data
- `POST /api/v1/payments/:errandId/initiate` (exists) → `{ payment, reference, checkoutRequestId, transactions }`. Amount pushed = service_fee + runner_fee only (§6). §3.2 requires an **idempotency key** on this endpoint; the API has none → needs: api-contract.
- Confirmation: `GET /api/v1/payments/:errandId` (exists) polling as fallback; preferred: status event on socket room `errand:{id}` (PAYMENT_CONFIRMED) — event name undefined (needs: api-contract); push "Payment confirmed/failed" (§4.4).
- "I've paid — continue" should re-check status, not assume success.
- Dev note: v1 STK is mocked; the API comment says the client "pays" by POSTing the reference to the public `/payments/mpesa/callback`. The app must never call the callback endpoint in production builds.

## Accessibility and mobile
- Announce "Waiting for M-Pesa confirmation" as a live region.
- Keep the screen awake while waiting is optional.
- Phone number = the signed-in user's phone (STK target).

## Questions for owner
- Q-NAV-1: After payment, go to Track (mockup intent) or Home (mockup JS behaviour)? Recommended: Track.
- Q2 (payments): Timeout and retry policy for STK push (Daraja prompts expire ~60s). Recommended: 90s wait, then offer retry.
- Q3 (payments): Can the customer pay from a different M-Pesa number than their login phone (`v-payment-methods` lists a default M-Pesa number)? Recommended: use the default payment method's number.

## Current vs design
Not built.
