# x-awaiting-quote — Waiting for quote, then accept quote (checkout)

- Mockup: **not drawn.** Required by OA-3 (authoritative REQUESTED → QUOTED → ACCEPTED flow after the wizard preview) and OA-5 (merchant payment route chosen at checkout). Built from design-system patterns and existing mockup components (`.stk-wrap`, `.form-card`, `.receipt-row`, `.chip` column, `.pm-card`, `.cta-fixed`). Copy is **(proposed)** unless marked "mockup".
- Shared conventions: `_shared.md` (OA-n §0, fees and routes §8)
- Implementation: `apps/customer_app/lib/src/screens/checkout/awaiting_quote_screen.dart` on branch `feat/customer-owner-answers`
- Status: matches-design (re-audit 2026-10-20 of row 249 (b), `feat/customer-outside-area-b` @ `7e88f0b` on top of `feat/customer-round-14`; customer gap report; implementation on that branch)

## Purpose
One screen per errand with two main states, plus the expired-quote state of checkout and the "new quote requested" waiting state:
- **Waiting** (REQUESTED): tell the customer the final quote is being prepared.
- **Checkout** (QUOTED): show the final quote, let the customer choose how the item amount is paid (if any) and which M-Pesa number to charge, then accept and pay. This is the "accept-quote step".
- **Quote expired** (QUOTED or ACCEPTED with an expired quote): offer `Request a new quote` (row 68).
- **New quote requested** (QUOTED or ACCEPTED, the customer asked for a new quote and none has arrived yet): waiting layout (row 68).

## Entry / exit
- Entry: `v-new-review` "Submit task →" (replaces the wizard stack); Home active card for REQUESTED ("View request") or QUOTED ("Review quote →"); `v-task-detail` for REQUESTED/QUOTED; push / notification `errand.QUOTED` deep link.
- Exits:
  - Back → previous screen (Home when coming from the wizard).
  - Checkout CTA → errand ACCEPTED → push `v-payment`.
  - "Pay with … Change" → push `v-payment-methods` in select mode; selecting a card pops back with that method.
  - "Cancel task" / "Decline and cancel task" → C-35 confirm → CANCELLED → pop to Home with snackbar `Task cancelled.`
- If the errand is already ACCEPTED when opened: show the checkout state again with chip `Awaiting payment` (the route and payer must be chosen before the STK push; amended in the 2026-10-07 re-audit to match the build). The CTA skips the accept call and pushes `v-payment`. `v-payment` sends an ACCEPTED errand with an item amount and no route back here. If PAYMENT_CONFIRMED or later: replace with `v-track`. CANCELLED / EXPIRED: replace with `v-task-detail`.

## Task states
REQUESTED (waiting), QUOTED (checkout, expired quote, or new quote requested), ACCEPTED (checkout re-entry, expired quote, or new quote requested). Transitions fired here: QUOTED → ACCEPTED (customer); REQUESTED → CANCELLED, QUOTED → CANCELLED and ACCEPTED → CANCELLED (customer, §3.3). An expired quote, a request for a new quote and an admin re-quote change no state (rows 46, 68, 72).

## Layout — waiting state (REQUESTED)
1. Pushed header (C-10) title `Your quote`.
2. Centred block (like `.stk-wrap`: centred both axes, padding 0 30, text centred):
   1. `PulsingDots` (three 7px slate-400 dots, 1.2 s, staggered 0.2 s), margin-bottom 20.
   2. Heading 17/700, margin-bottom 8.
   3. Body 13 slate-600, max width 260, margin-bottom 22.
3. Task summary card (C-07, margin `0 20 14`): status chip (C-05) `Awaiting quote`; title 15.5/600 (margin `10 0 4`); meta Fira Code 12 slate-600 `#NT-10482 · Today, 10:03 AM`.
4. Button stack (padding 0 20, gap 10): outline `Back to Home` (C-03); text button `Cancel task` in red (destructive, OA-13).
5. **Outside every service area (row 236, decided 2026-10-19: notify the customer and let them cancel; narrowed by row 249 (b), decided 2026-10-20)**: shown only when the API flags the task as refused at quote (`outsideServiceArea: true` on the errand view) **and** the task is REQUESTED, or QUOTED/ACCEPTED **once its quote has expired** (row 249 (b)). A QUOTED or ACCEPTED task whose quote is still valid shows the normal checkout even if the flag is true: the customer can still pay, so the screen never tells them to cancel it. The waiting block is replaced by heading `We can't take this task` and body `Its location is outside the areas we serve. You can cancel it; you haven't paid anything.` (the owner's notification copy, row 241, decided 2026-10-19; the screen uses the same words), and `Cancel task` becomes the C-01 primary action (the existing customer cancel, REQUESTED/QUOTED/ACCEPTED → CANCELLED). No new state. The same text comes as a notification (`v-notifications.md`).
   - "Expired" here is the same test as the **Quote expired** state below: the quote's `expiresAt` has passed, or the API answered `quote_expired` on accept or payment initiation. A quote with no `expiresAt` (legacy, row 83) counts as still valid, as in the API's `quote_still_valid` rule.
   - In QUOTED/ACCEPTED with an expired quote this state takes the place of both the expired checkout (`Request a new quote`) and the **New quote requested** waiting state: a re-quote is refused outside every area, so neither would lead anywhere.
   - The API applies the same rule to the flag (row 249 (b), `feat/api-outside-area-b`); the client also checks it, so a stale flag from an older API never hides a payable quote.

## Layout — checkout state (QUOTED)
1. Pushed header (C-10) title `Your quote`.
2. Scrollable body:
   1. Task summary card (same as above) with chip `Quote ready`.
   2. Form card "Final quote" (C-17 form card + C-18): **one** total row `Total (service + runner fee)` (mockup wording) with the quote total. No `Service fee` / `Runner fee` lines (row 34 clarification, `_shared.md` §8.1). Caption 12 slate-600 under the total: `Valid until 4:30 PM` (Fira Code time). Every quote has an expiry (row 83, 24 h default); if a legacy quote has none, hide the caption and rely on the API's `quote_expired`.
   3. Only when the item amount > 0 (Buy For Me and Get It For Me only, row 80): form card **"How should this be paid?"** (mockup heading):
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
   - Expired quote: the CTA becomes `Request a new quote` (row 68; layout under States). An admin re-quote (rows 72, 88, `quote:reissued`) switches the screen back to checkout.

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
- Expired: caption `Expired at 4:30 PM`; notice `This quote has expired. Ask for a new quote to continue.`; CTA `Request a new quote`; snackbar `We've asked for a new quote.`; error `Couldn't request a new quote. Try again.`
- New quote requested: heading `Preparing a new quote`; body `You asked for a new quote. We'll notify you when it's ready.`; meta `Requested 4:45 PM`; announcement `Your new quote is ready.`
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
- **Quote expired** (rows 46, 68): entered when `expiresAt` has passed on load or while the screen is open, or when accept returns code `quote_expired` (also on the ACCEPTED re-entry path when the API refuses initiation with that code, row 72). Layout: summary card **without** the status chip (the errand is still QUOTED or ACCEPTED; the chip would read `Quote ready` / `Awaiting payment`, which is no longer true, and the UI never invents a label); the Final quote card stays visible with the caption replaced by `Expired at 4:30 PM` (Fira Code time); the route and Pay-with cards are hidden; C-40 notice `This quote has expired. Ask for a new quote to continue.`; fixed CTA `Request a new quote` (C-01); `Decline and cancel task` stays available.
  - Tap `Request a new quote` → CTA spinner → `POST /errands/:id/quote-request` (Data) → success: snackbar `We've asked for a new quote.` (proposed) and the **New quote requested** state below. Already requested (the API answers with the existing request): same as success. Code `quote_still_valid` (the clock was wrong or an admin re-quoted meanwhile): reload and show checkout. Error: snackbar `Couldn't request a new quote. Try again.` and stay on the expired state.
- **New quote requested** (row 68): shown after a successful request, and on any later open while the API reports an open request (`quoteRequestedAt` set and later than the newest quote's `createdAt`). It is the waiting layout:
  1. Pushed header `Your quote`.
  2. Centred block: `PulsingDots`; heading 17/700 `Preparing a new quote`; body 13 slate-600 `You asked for a new quote. We'll notify you when it's ready.` (proposed); under the body a meta line Fira Code 12 slate-600 `Requested 4:45 PM` (`Today, 4:45 PM` style per `_shared.md` §7; whole line Fira Code, meta rule §3).
  3. Task summary card **without** a status chip (as in the expired state).
  4. Buttons: outline `Back to Home`; red text button `Cancel task` (same confirm dialog as the waiting state; nothing has been charged).
  - No `Request a new quote` button here (one open request at a time). The request does not expire on the client; ops re-quote it (rows 68, 88).
  - A new quote (`quote:reissued` socket event, `errand:status_changed`, or the `errand.QUOTED` / new-quote push) switches to checkout with the new figures, `Valid until` from the new quote, and the route/payer cards shown again. On an ACCEPTED task the chip reads `Awaiting payment` and the CTA pays the new quote (row 72: the customer must accept/pay the new quote before anything proceeds).
  - Live region announces `Your new quote is ready.` on the switch.
- **Chosen deadline already passed (row 237, decided 2026-10-19: refuse to start payment and ask for a new deadline)**: when a deadline the customer chose (`Today` / `Tomorrow`) has passed, either on load (`deadlineAt` non-null and in the past: before payment a non-null `deadlineAt` is always the customer's choice, rows 239 (a) and 240, since backfilled values on unpaid tasks are cleared and only the customer can set one, row 243) or from the payment refusal (`v-payment.md`), the checkout CTA is replaced by a C-40 notice `Your deadline has passed. Choose a new one to continue.` and a C-01 `Choose a new deadline` that opens a bottom sheet with the `v-new-details` chips `Today`, `Tomorrow`, `Flexible` (C-16; `Today` hidden once 23:59 local has passed). Saving sends `PATCH /errands/:id` `{ deadlineAt }` and returns to checkout. `Flexible` is allowed and sends `deadlineAt: null`, so the 24 h default counts from payment (rows 235, 239; switching back to Flexible before payment decided, row 244). Only the customer can do this (row 243; no admin edit). The quote is kept as it is (decided, row 242). All copy proposed.
- **Change the deadline before paying (row 244, proposed entry point)**: the checkout summary's `Deadline` line has a C-04 text button `Change` that opens the same sheet (all three chips), so the customer can also switch a chosen deadline back to `Flexible` before the deadline passes. The quote is kept (row 242).
- **Deadline line in the checkout summary (row 239 (a); proposed)**: the task summary card gets a line `Deadline` → the chosen time (12-hour EAT, Fira Code), or, when `deadlineAt` is null (`Flexible`), `No deadline yet. It starts when your payment is confirmed.` (Fira Sans).
- Accepting: CTA spinner; on success push `v-payment`. Code `quote_expired`: switch to the expired state above (no snackbar). Error 409 (state already changed): reload the errand and route per Entry rules. Other errors: snackbar `Couldn't accept the quote. Try again.`
- Load error: C-33 `Couldn't load this task.` + `Try again`.
- Cancel error: snackbar `Couldn't cancel the task. Try again.`

## Numeric fields (Fira Code)
- Reference `#NT-10482`, timestamps, validity and expiry time, the `Requested …` meta line, every amount, the amount inside the CTA, the masked phone number.

## Data
- Errand: `GET /api/v1/errands/:id` (exists; `reference`, `title`). needs: api-contract — a customer-safe "merchant details available" flag on the errand (true/false only; the Till/Paybill numbers themselves are shown only after the fees are paid, OA-5), filled by the merchant/admin source (row 43).
- Final quote: `GET /api/v1/errands/:id/quote` (exists) → `total`, `expiresAt`. The Final quote card shows only `Total (service + runner fee)` with `quote.total` (fallback `errand.quotedPrice`), and the CTA reads `Confirm & pay KSh <total> →` (row 34 clarification). The internal quote components are never listed (OA-4).
- Accept: `PATCH /api/v1/errands/:id/status { to: 'ACCEPTED' }` (exists). needs: api-contract — refuse an expired quote with code `quote_expired` (row 46), on accept and on `POST /payments/:errandId/initiate`.
- Fresh quote (row 68): needs: api-contract — `POST /api/v1/errands/:id/quote-request` (customer, own errand; allowed in QUOTED or ACCEPTED when the newest quote has expired; idempotent: a second call returns the open request; `quote_still_valid` (409) otherwise; no state change). It records the request time and makes the task visible to ops for re-quote (admin `drawer-task-requote` shows `Customer asked for a new quote …`). The errand detail returns `quoteRequestedAt` (null when no request is open; cleared, or older than the newest quote, once an admin re-quotes). How the request is stored is api-contract's call; if it needs a new column, that is a schema change for the owner.
- Quote expiry (row 83): needs: api-contract — every quote gets `expiresAt` (24 h default when the admin sends none); the response never has `expiresAt: null` for new quotes.
- Cancel: `PATCH /api/v1/errands/:id/status { to: 'CANCELLED' }` (customer; REQUESTED, QUOTED or ACCEPTED, §3.3).
- Route + payer: carried to `v-payment`, which calls `POST /payments/:errandId/initiate` with `{ merchantRoute?, paymentMethodId? }` and the `Idempotency-Key` header (row 24). `merchantRoute` is `merchant_direct` or `send_to_runner`, sent only when the item amount is > 0.
- Payment methods: `GET /api/v1/customers/me/payment-methods` (M-Pesa only, OA-10); default = `isDefault`; fallback = `GET /users/me` phone (OA-21).
- Live (rows 23, 29): `errand:join` room `errand:{id}`, `errand:status_changed`. Fallback only while the socket is disconnected: poll `GET /errands/:id` every 15 s while REQUESTED (or waiting for a new quote) and the screen is visible. Push `errand.QUOTED` (exists) and the re-quote notification (`quote.reissued`, row 72; KSh wording, row 82); needs: api-contract — a push or notification when merchant details are added (event type, see `v-notifications`).

## Resolved by owner answers
- Quote expiry (was Q1): `quote_expired`, fresh quote required, no new transition (row 46).
- Send-to-runner mechanics (was SQ-5): platform-mediated STK to Nitume (row 42).
- Merchant details source (was SQ-6): merchant or admin; customer only picks the route (row 43).
- Fee lines: total only until pricing rates exist (row 34 clarification).
- Fresh quote after expiry (was SQ-9): `Request a new quote`, then an admin re-quotes (row 68); only after expiry (row 88); ACCEPTED stays ACCEPTED and the new quote must be accepted/paid (row 72).
- Every quote has an expiry, 24 h default (row 83).
- Item amount only for Buy For Me / Get It For Me (row 80).
- Outside-area state (row 236) shown only for REQUESTED, or QUOTED/ACCEPTED once the quote has expired (row 249 (b), owner 2026-10-20).

## Accessibility and mobile
- Waiting dots: live region "Waiting for your quote".
- Route options are a radio group; the disabled option announces why.
- CTA amount must equal service + runner fee exactly.

## Open questions for the owner
- Q2: Should the checkout allow changing the route after payment (e.g. merchant details arrive later)? Default: no; route is fixed once the fees are paid.

## Current vs design
Re-audit 2026-10-20, row 249 (b), `feat/customer-outside-area-b` @ `7e88f0b` (commits `7bba11c`, `7e88f0b`; customer gap report, "Re-audit 2026-10-20: customer round 18"): PASS. `_outsideArea` now requires REQUESTED or `_expired` (date, or API `quote_expired`); a valid or expiry-less quote with a stale flag shows checkout. No findings.

Re-audit 2026-10-09, customer round 4, `feat/customer-owner-answers` @ `c420265` (docs/audits/customer-gap-report.md, "Re-audit 2026-10-09: customer round 4"): PASS. Expired state with `Request a new quote` on QUOTED and ACCEPTED, snackbar and error copy, `quote_still_valid` reload, **New quote requested** waiting state restored from `quoteRequestedAt`, switch back to checkout on re-quote with `Your new quote is ready.` Minor: stale comment at `awaiting_quote_screen.dart:579` ("No quote-request endpoint yet"). Builder handling accepted: `quote_request_not_allowed` reloads and routes per Entry.

Spec update 2026-10-09 (owner rows 68, 72, 80, 83, 88), against `main` @ `c7675dc` (`awaiting_quote_screen.dart`): the build shows the expired state with the fallback notice `This quote has expired. We'll send you a new one.` (`:486`) and **no CTA**, because no quote-request endpoint existed. Now required:
1. Expired state: notice `This quote has expired. Ask for a new quote to continue.` and the CTA `Request a new quote` calling the new endpoint, with the success snackbar and error copy above, on QUOTED and ACCEPTED.
2. The **New quote requested** waiting state, restored from `quoteRequestedAt` on every open, and the switch back to checkout on a re-quote.
3. `Valid until` stays as built (shown when `expiresAt` is present); no change needed for row 83 on the client.
Status set to `partial` until re-audited. Depends on api-contract (quote-request endpoint, `quoteRequestedAt`) and core-ui (repository call and model field).

Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Total-only fee row, route rows with merchant-details states, CTA with the combined amount for send_to_runner (row 76), quote expiry without a CTA (row 68 fallback), admin re-quote and merchant-details live refresh.

Round 2 (2026-10-07, `feat/customer-screens` @ `ba45633`): PASS. Final quote shows only `Total (service + runner fee)` from `quote.total`; CTA `Confirm & pay KSh … →` (amount still Fira Sans, core CC-2); ACCEPTED shows checkout again. Round 1 FAIL details: `docs/audits/customer-reaudit-2026-10-07.md`.

Spec update 2026-10-08 (rows 34, 42, 43, 46): the build shows `This quote has expired.` with the CTA disabled and nothing else. Now required: the expired-quote state above (`quote_expired` handling, chip hidden, `Request a new quote` once the endpoint exists), the send-to-runner subtitle for the platform-mediated flow, the merchant-direct row enabling in place when details arrive. Status set to `partial` until re-audited.
