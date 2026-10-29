# customer `v-payment` (web): M-Pesa STK payment

- Issue #8. Route: `/app/customer/tasks/:errandId/payment` = `customerLinks.payment(id)` (#7). Customer shell, `data { role, navKey: 'home', pushed: true }`, route `title: 'Payment · Nitume'`. Shared #8 rules: `customer-x-awaiting-quote.md` §A (A§n). Kit `ui-kit.md` (K§n), `auth-foundation.md` (F§n), #7 foundation `customer-v-new-category.md` (NC§Wn).
- Sources:
  - mobile spec `docs/specs/customer/v-payment.md` (matches-design);
  - Flutter `apps/customer_app/lib/src/screens/checkout/payment_screen.dart`, `widgets/stk_view.dart`, core `stk_payment_state.dart`;
  - mockup `docs/design/nitume_customer_app.html` lines 410–421 (`#v-payment`, `.stk-wrap` CSS lines 147–151);
  - OA-21; rows 24, 52, 63, 72, 76, 91, 237; owner WQ-27, WQ-28;
  - API `apps/api/src/payments/payments.{controller,service}.ts` on `origin/main` @ `380be22`.
- Implementation: none. The route is a #7 `ViewStubComponent` stub. Status: **missing**.
- **Updated 2026-10-29**:
  - WQ-28 decided (no automatic prompt after a reload, link or second tab; key in memory only);
  - WQ-27 decided (the amount and its `Includes` line);
  - aligned with #7 (`customerLinks`, `apiErrorOf`, `onStateChange`, `CUSTOMER_NOW`; page under `app-area/customer/checkout/`).

## Purpose
Send the M-Pesa STK push for the fee total (plus the item amount for `send_to_runner`, one combined charge, row 76) and follow it to a result while the customer approves on their phone: PENDING, SUCCESS, FAILED or TIMEOUT (OA-21). TIMEOUT is not a failure.

## Entry / exit
- Entry: checkout CTA on `x-awaiting-quote` (sets the A§3 intent); Home active card `Pay now →` for ACCEPTED (#7) and Task detail `Pay now` (#9), both setting the intent; notification "Payment failed" (#11, no intent); a reload, bookmark or second tab (no intent).
- Back (`nm-back-button` / browser Back) → previous page, fallback `customerLinks.awaitingQuote(id)`. Leaving never cancels anything: a pending payment keeps running server-side, and this page shows no "leave page?" prompt (no `beforeunload`; web adaptation).
- SUCCESS → after 1.5 s `router.navigateByUrl(customerLinks.track(errandId), { replaceUrl: true })` (OA-21). Track then shows the `Pay the item amount` notice for `merchant_direct` with details (#9 → `x-merchant-payment`).
- Sent back to `…/quote` (`replaceUrl`): see Rules → "Answers from initiate".

## Task states
ACCEPTED (paying) → PAYMENT_CONFIRMED (system, on SUCCESS). FAILED and TIMEOUT leave the errand ACCEPTED. A§2 routing for every other state (PAYMENT_CONFIRMED or later renders the stored payment so a late visitor sees SUCCESS, then Track).

## Layout (top to bottom)
`nm-pushed-header` title `Payment`. Below it the `nm-stk-status` block (A§8), centred on both axes in the remaining viewport height (`min-height: calc(100dvh - header)`; below 768px also minus nothing else, since pushed routes hide the bottom bar), horizontal padding 30px, text centred. From 768px the block keeps the same widths and sits centred in the content column (web adaptation: no card around it, as the app).

`nm-stk-status` (port of `StkStatusView`):
1. Icon circle 64px: waiting = green-050 fill + 28px phone glyph in green; SUCCESS = green-050 + green check; FAILED and initiate error = slate fill, 1px slate-line border, blue phone glyph (red is never a surface, OA-13). Glyphs are the #8 `nm-icon` additions `phone` and `check` (A§8, `aria-hidden`). 20px below.
2. Heading 17/700 blue (`nm-type(dialog-title, $weight: 700)`), `h2`, in an `aria-live="polite"` region. 8px.
3. Body `muted` (13 slate-600), `max-width: 260px`. The payer number inside it is `nmNum` Code 13 slate-600. 22px.
4. Amount `nmNum` `amount-lg` (Code 30/600 blue) with `nmNumLabel` = `kesSpoken`. The amount is `addKes(serviceFee, runnerFee)`, plus `merchantAmount` (again through `addKes`) only when `paymentFlow = customer_to_runner` (A§4). When `paymentFlow = customer_to_runner` and `isPositiveKes(merchantAmount)`: 8px, then `Includes ` + `formatKes(merchantAmount)` (`nmNum`) + ` for your runner's purchase.` at 12.5 slate-600 (`nm-type(resend)`, row 91). This line is the item amount's own line on this screen (WQ-27). 26px below. Hidden until the payment record is known.
5. PENDING only: `nm-pulsing-dots` label `Waiting for M-Pesa confirmation`; 30px.
6. Button stack, width 220px, gap 10 (primary first, outline second).
7. PENDING after a manual check that is still pending: 12px, `We haven't heard from M-Pesa yet. Keep this screen open.` 12.5 slate-600.

## Copy and states (exact; mockup PENDING, the rest from the mobile spec as built)

| State | Icon | Heading | Body | Buttons |
|---|---|---|---|---|
| Loading | — | — | — | — (`nm-pulsing-dots` centred, label `Loading`) |
| Load error | — | — | `nm-error-state` `Couldn't load this payment.` | `Try again` |
| INITIATING | phone | `Check your phone` | `Enter your M-Pesa PIN on the prompt sent to +254 712 345 678 to confirm this payment.` | primary disabled `Sending prompt…` |
| PENDING (mockup) | phone | `Check your phone` | same | primary `I've paid — continue` (checks now) |
| SUCCESS | check | `Payment received` | `Thanks. We're finding a runner for your task.` | none (auto to Track after 1.5 s) |
| FAILED | slate phone | `Payment didn't go through` | `M-Pesa didn't confirm this payment. You haven't been charged. You can try again.` + a second line with `failureReason` when the API gives one (e.g. `Request cancelled by user`) | primary `Try again`, outline `Back` |
| TIMEOUT | phone | `Still checking your payment` | `M-Pesa hasn't confirmed yet. If you entered your PIN, don't pay again. We'll update this screen as soon as we hear back.` | primary `Check again`, outline `Send a new prompt` |
| Initiate error (network / 5xx / unhandled code) | slate phone | `Couldn't send the prompt` | `Check your connection and try again.` | primary `Try again` (same key), outline `Back` |

- Payer number in the body: `formatPhoneIntl` of the method chosen at checkout (intent `payerDetail`), else the default M-Pesa method's `phoneNumber`, else the sign-in phone (OA-21). Unknown → `…prompt sent to your phone to confirm this payment.`
- Manual-check network failure: toast `friendlyError(e)` (`Check your connection and try again.`), state unchanged.
- `Back` → browser Back (fallback `…/quote`).

## Rules

### Entry decision (web; A§3; owner WQ-28: a reload, link or second tab never re-sends the prompt)
On load: `GET /errands/:id` and `GET /payments/:errandId` in parallel, payer lookup, then:
1. Errand not ACCEPTED and no main payment → A§2 routing.
2. Main payment exists (any errand state from ACCEPTED on):
   - `stkStatus` SUCCESS → SUCCESS state → Track after 1.5 s.
   - PENDING or TIMEOUT → that state; polling resumes with its clock from the payment's `createdAt` (never restarted by a reload).
   - FAILED → if an intent is present (`CheckoutIntentStore.take` returns one: the customer just tapped `Confirm & pay` / `Pay now`), start a new attempt (new key) and initiate; otherwise show FAILED with `Try again` (no automatic push).
3. No main payment, errand ACCEPTED:
   - intent present → initiate with the intent's `route` and `paymentMethodId`;
   - no intent and item amount > 0 → `…/quote` (`replaceUrl`; the route is chosen at checkout, OA-5);
   - no intent and no item amount → `…/quote` (`replaceUrl`) as well (WQ-28: a reload or link never sends a prompt; the checkout shows `Awaiting payment` and `Confirm & pay`).
- The page never sends two initiations at once; every button is disabled while a call is in flight.

### Initiate
`POST /payments/:errandId/initiate` with header `Idempotency-Key: PaymentAttemptStore.keyFor(errandId)` and body `{ merchantRoute?, paymentMethodId? }` (route only when the item amount > 0; never `runner_advance`). Result: `stkStatus` (SUCCESS also when the API returns an already-paid payment) → state; the amount from the returned `payment` (A§4: `serviceFee + runnerFee`, plus `merchantAmount` for `customer_to_runner`).

### Answers from initiate
| Code | Action |
|---|---|
| `quote_expired` | `…/quote` with navigation state `{ quoteExpired: true }`, `replaceUrl` |
| `quote_not_accepted` | `…/quote`, `replaceUrl` (re-quote to accept, row 72) |
| `deadline_passed_before_payment` | No STK was sent. `…/quote` with navigation state `{ deadlinePassed: true }`, `replaceUrl`. No toast (row 237) |
| `merchant_route_required`, `merchant_details_missing` | `…/quote`, `replaceUrl` |
| `errand_not_payable` | Re-read the errand, A§2 |
| `idempotency_key_reused` | Once per attempt: `newAttempt`, initiate again; a second time → initiate-error state |
| anything else, network, 5xx | Initiate-error state; `Try again` reuses the same key (so a request that did reach the server returns its payment, no second push) |

### Following the result (A§7)
- Poll `GET /payments/:errandId` while PENDING or TIMEOUT and the tab is visible: every 5 s until 2 min after `createdAt`, then every 30 s, stopping at 10 min. On `visibilitychange` → visible: check once at once. The API runs the provider query (Daraja STK Query) before answering a TIMEOUT (row 52).
- `errand:status_changed` to PAYMENT_CONFIRMED (room joined on load) → SUCCESS at once, even in a background tab.
- The API's `stkStatus` decides TIMEOUT (120 s, configurable, rows 52, 63). The client runs no shorter timer of its own; only when `stkStatus` is missing does it derive TIMEOUT from `createdAt` + 120 s, measured with `CUSTOMER_NOW`.
- Reconnect: `RealtimeService.onStateChange` (#7) → one immediate `GET /payments/:errandId`.
- A late SUCCESS after TIMEOUT moves to SUCCESS; a late FAILED shows FAILED.

### Buttons
- `I've paid — continue` / `Check again` → `GET /payments/:errandId` now (button `loading`); still PENDING → show the still-pending line.
- `Try again` (FAILED) → `newAttempt` + initiate (new key).
- `Send a new prompt` (TIMEOUT) → `newAttempt` + initiate. Server behaviour (verified on `main`): while the earlier payment is not FAILED, initiate returns it and pushes nothing, so the page simply shows that payment's state; a new prompt goes out only once the earlier one is final as failed.
- `Try again` (initiate error) → initiate with the same key.

### Closing or reloading the tab mid-payment (web)
- Closing the tab, reloading, losing the network or putting the laptop to sleep never stops or repeats a charge: the STK prompt lives on the phone and the payment on the server. The customer's PIN entry completes the payment whether or not a tab is open.
- Reopening (`…/payment`, Home's card, Track, a notification) follows the Entry decision: the stored payment's state is shown and polling resumes from its `createdAt`; SUCCESS ends on Track. No prompt is ever sent without a click in that tab (WQ-28). Home's `Pay now →` sets the intent only for a plain left click it follows in-app (A§8); a Ctrl/Cmd-click opens a tab without one.
- Two tabs on the same payment show the same state; a click in either that reaches the API while a payment is open gets that payment back (A§3).
- Sign-out mid-payment: the full-reload sign-out (F§4.5) drops the in-memory key and intent; the payment continues server-side.

## Numeric fields (Fira Code)
The amount (`KSh 2,200`); the item amount inside `Includes KSh 40,000 for your runner's purchase.`; the payer phone number in the body.

## Data
A§5 `PaymentSummary`, `InitiateResult`; A§6 initiate and status calls through `CheckoutApi`; `GET /customers/me/payment-methods` and `SessionStore.user().phone` for the payer line; A§7 socket and polling. The page never reads `merchantPayment` (its numbers are null for a customer before the fees are paid anyway, #28). Dev note: v1 STK may be the console mock; the website never calls `/payments/mpesa/callback`.

## Accessibility and responsive
- Heading changes announced (live region); dots announce `Waiting for M-Pesa confirmation`; the amount's accessible name is spoken shillings.
- Focus: on arrival the `h1`; after a state change focus stays where it was unless the focused button disappeared, then it moves to the new heading (`tabindex="-1"`).
- Buttons ≥ 48px high, 220px wide; at 360px the block fits (220px + 60px padding).
- Reduced motion: dots static, no fades.

## Required tests (Vitest; cited as VP Tn)
1. Copy of every state in the table, including the mockup PENDING body with the formatted payer number inside `nmNum`.
2. **Pending**: initiate answers `stkStatus: 'PENDING'` → PENDING with dots; `I've paid — continue` calls `GET /payments/:id`; still pending → the still-pending line.
3. **Success**: a poll answers SUCCESS → `Payment received`; after 1.5 s (fake timers) navigation to `/app/customer/track/:id` with `replaceUrl`; also on a fake `errand:status_changed` to PAYMENT_CONFIRMED.
4. **Failed**: FAILED with `failureReason: 'Request cancelled by user'` → copy + second line; `Try again` sends a new initiate with a **different** `Idempotency-Key`.
5. **Timeout**: `stkStatus: 'TIMEOUT'` → timeout copy; `Check again` re-reads; a later SUCCESS goes to Track; a later FAILED shows FAILED; `Send a new prompt` sends initiate with a new key.
6. **Retry safety**: initiate network error → initiate-error state; `Try again` re-sends with the **same** key; buttons disabled while in flight (no parallel initiations).
7. `idempotency_key_reused` → one retry with a new key; a second → initiate-error.
8. Polling cadence: 5 s before 2 min, 30 s after, stops at 10 min from `createdAt`; paused while `visibilityState` is hidden; immediate check on becoming visible.
9. **Amount separation (WQ-27)**: platform-only payment `{ serviceFee: '440.00', runnerFee: '660.00', merchantAmount: '0.00' }` → `KSh 1,100`, no `Includes` line; `customer_to_runner` with `merchantAmount: '40000.00'` → `KSh 41,100` and `Includes KSh 40,000 for your runner's purchase.`; `merchant_direct` with `merchantAmount: '40000.00'` → `KSh 1,100` (the item amount is never in this charge) and no `Includes` line.
10. Answers: `quote_expired` → `…/quote` with `quoteExpired`; `quote_not_accepted`, `merchant_route_required`, `merchant_details_missing` → `…/quote`; `deadline_passed_before_payment` → checkout with `deadlinePassed`, no toast; `errand_not_payable` → A§2.
11. **Reload / resume**: no intent + stored PENDING payment created 90 s ago → PENDING, no initiate request, first poll at 5 s; stored FAILED + no intent → FAILED, no initiate; stored SUCCESS → Track; no payment + ACCEPTED + no intent → `…/quote` and **no initiate request**; intent present + no payment → exactly one initiate with the intent's route and method.
12. Intent is consumed once (a second load of the page in the same tab does not initiate again).
13. Entry routing per A§2 for REQUESTED, QUOTED, CANCELLED.
14. Load error → `Couldn't load this payment.`; `Try again` reloads.
15. No `beforeunload` handler is registered; no storage writes (`localStorage`, `sessionStorage`, `history.state`).
16. **WQ-28, resume without a click**: a stored PENDING payment and a stored TIMEOUT payment, each opened without an intent, show their state; `Send a new prompt` / `Try again` are the only ways a new initiate is sent, and each is a click.
17. **WQ-27, initiate body**: every initiate request body holds only `merchantRoute?` and `paymentMethodId?` (no amount, no fee field).
18. Reconnect through `onStateChange` → one immediate status read.

## Current vs design
Not built (`tasks/:errandId/payment` is a #7 stub; Home's `Pay now →` already links to it without an intent). The Flutter screen is the reference (`matches-design`). Web differences, all from browser constraints: no automatic prompt after a reload or a link (WQ-28), idempotency key in memory (WQ-28, WQ-8), polling paused in hidden tabs.
