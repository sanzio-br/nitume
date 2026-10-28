# customer `x-awaiting-quote` (web): waiting for the quote, then accept and choose how to pay

- Issue: GitHub #8, "[Website] Customer: quote, checkout and M-Pesa payment". Builder: `web-parity`. Branch: `feat/website-customer-checkout` (stacked on #6 `feat/website-auth-shell`).
- Route: `/app/customer/tasks/:errandId/quote` inside the customer shell (`authGuard`, `roleGuard('customer')`, `hasNameGuard`), route data `{ role: 'customer', pushed: true, navKey: 'home', title: 'Your quote' }` (document title `Your quote · Nitume`, F§2 pattern).
- Shared rules: `auth-foundation.md` (F§n), kit `ui-kit.md` (K§n), `customer-shell.md` (S). §A below holds what all four #8 views share (routes, data shapes, error codes, live data, new components, the money rule, open questions); the other three #8 specs cite it as `A§n`.
- Sources, in order: owner answers (OA-3, OA-4, OA-5, OA-10, OA-13, OA-21; BOARD rows 34, 42, 43, 46, 47, 68, 72, 76, 80, 83, 88, 91, 236, 237, 239–244, 249; WQ-3, WQ-8, WQ-15, WQ-16), `docs/design/nitume_design_system.html`, the mobile spec `docs/specs/customer/x-awaiting-quote.md` (matches-design), customer `_shared.md` §6–§8, the built Flutter screen `apps/customer_app/lib/src/screens/checkout/awaiting_quote_screen.dart` (+ `deadline_sheet.dart`, `widgets/deadline_widgets.dart`, `widgets/task_widgets.dart`), the API on `origin/main` @ `28a0c42`. The mockup does not draw this view (mobile spec).
- **(web adaptation)** marks a layout or browser choice the mobile sources do not make; it never changes content, copy, tokens or the component set. **(proposed)** marks copy the mobile spec marked proposed (built as written in the app).
- Implementation: none. Status: **missing**.

---

## A. Shared by the four #8 views

### A§1 Routes and navigation (web adaptation of the app's pushed screens)

| View | Route | Kind | `navKey` | Back fallback (no in-app history, `nm-back-button` `fallback`) |
|---|---|---|---|---|
| `x-awaiting-quote` | `/app/customer/tasks/:errandId/quote` | pushed | `home` | `/app/customer/home` |
| `v-payment` | `/app/customer/tasks/:errandId/payment` | pushed | `home` | `/app/customer/tasks/:errandId/quote` |
| `x-merchant-payment` | `/app/customer/tasks/:errandId/item-payment` | pushed | `track` | `/app/customer/track/:errandId` |
| `v-price-auth` | none: a blocking dialog (K§4.8) opened by the customer shell's listener (S, "App-level behaviour") | dialog | — | — |

- All three routes are lazy children of the customer shell (F§2), `data.pushed: true`: below 768px the bottom bar is hidden, from 768px the white side nav stays visible with the `navKey` item active (WQ-15, WQ-16). `navKey: 'home'` for quote and payment because a REQUESTED / QUOTED / ACCEPTED task is listed on Home and `Back to Home` is this flow's way out; `track` for the item payment because it is opened from Track (proposed; the orchestrator may align it with #7/#9 route keys).
- The `tasks/:errandId` prefix is shared with #9 (`v-task-detail` at `/app/customer/tasks/:errandId`, proposed here so #9 can reuse it). `:errandId` is passed to the API as is; a 404/403 shows the view's load-error state.
- In-app navigation between #8 views uses the Angular router. "Replace" in the mobile spec (`Nav.replaceWith…`, `resetToTrack`) = `router.navigate(…, { replaceUrl: true })`.
- Destinations named in this flow: Home `/app/customer/home`; Track for an errand `/app/customer/track/:errandId` (S, OA-21); Task detail `/app/customer/tasks/:errandId` (#9); payment methods in select mode `/app/customer/profile/payment-methods?select=<errandId>` (#12, see A§9).

### A§2 Entry routing (every #8 route checks the errand first)

On load each route reads `GET /errands/:errandId` and routes by status before it renders anything else (Flutter `_routeAway` / `PaymentScreen._start`):

| Errand status | `…/quote` | `…/payment` | `…/item-payment` |
|---|---|---|---|
| REQUESTED, QUOTED | render | replace → `…/quote` | replace → `…/quote` |
| ACCEPTED | render (checkout re-entry, chip `Awaiting payment`) | render per `v-payment` Entry rules | replace → `…/quote` |
| PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER | replace → Track `/app/customer/track/:errandId` | render (shows the stored payment; SUCCESS → Track) | render |
| COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED, DISPUTED, DRAFT | replace → Task detail | replace → Task detail | replace → Task detail |

States are the §3.3 wire values; labels only through `customerStatus()` (K§4.2.3). An unknown status string → the view's load-error state (never a guessed label).

### A§3 In-memory checkout stores (no browser storage, WQ-8)

Nothing in #8 is written to `localStorage`, `sessionStorage`, IndexedDB or a cookie (F§4.1 rule extended to #8). Two root-provided signal stores in `apps/website/src/app/features/customer/checkout/`:

- `CheckoutIntentStore`: `set(errandId, { route?: 'merchant_direct' | 'send_to_runner'; paymentMethodId?: string; payerDetail?: string })`, `take(errandId)` (returns and clears it once). Written by the checkout CTA (this view) and by `Pay now` on Home (#7) and Task detail (#9) (Flutter `fromCheckout: true`). Read once by `v-payment` to decide whether it may send an STK push (`v-payment` Entry rules). A reload or a new tab has no intent.
- `PaymentAttemptStore` (port of the app's `paymentAttempts`, memory instead of secure storage): `keyFor(errandId)` returns the current attempt's `Idempotency-Key` (a new `crypto.randomUUID()`, 36 chars, matches the API's `^[A-Za-z0-9_-]{8,128}$`) and keeps it for the tab's life; `newAttempt(errandId)` replaces it. Cleared by the full-reload sign-out (F§4.5).
- Why memory is enough (verified on `origin/main` `apps/api/src/payments/payments.service.ts` `initiate`): while the errand has a main payment that has not FAILED, every initiate (any key or none) returns that payment and pushes nothing (`existing && existing.status !== FAILED → resultFor(existing)`), and a unique index allows one active main payment per errand. A lost key after a reload therefore cannot cause a second charge. Owner confirmation of the reload behaviour: A§10 Q8-2.

### A§4 Money on these screens (three flows; OA-4, rows 34, 42, 76, 91)

The three flows stay separate in code and data: service fee, runner fee, merchant/item amount. The UI shows exactly what the decided rows allow and nothing else:

| Figure | Where | Source | Rule |
|---|---|---|---|
| `Total (service + runner fee)` | checkout `Final quote` card | `errand.feeTotal`, else `quote.total`, else `errand.quotedPrice` | One row (row 34 clarification). `Service fee` / `Runner fee` lines are not shown, and the client never computes a split. Quote components (`baseFee`, `distanceFee`, `timeFee`, `urgencyFee`, `complexityFee`, `premiumFee`) are never read into the UI (OA-4) |
| `Item amount` | checkout route card; merchant payment | `errand.budget` (checkout); `merchantPayment.amount` / difference `amount` (after payment) | Always its own row or screen, never added into the fee total. Only Buy For Me and Get It For Me (`buy_for_me`, `pickup_delivery`) and only when > 0 (row 80) |
| STK charge | checkout CTA `Confirm & pay KSh … →`; `v-payment` amount | checkout: fee total, plus the item amount **only** when `send_to_runner` is selected; payment: `serviceFee + runnerFee` (+ `merchantAmount` when `paymentFlow = customer_to_runner`) from the payment record | One combined charge for `send_to_runner` (row 76), shown with `Includes KSh … for your runner's purchase.` on `v-payment` (row 91). The shown amount equals the amount sent to M-Pesa (row 91) |
| Price-change difference | `v-price-auth`, `x-merchant-payment` | request `fromPrice` / `toPrice`; difference payment `amount` | Item amount only, never fees (OA-8) |

- Money arithmetic is done on decimal strings in cents (port of the app's `addDecimals` / `subtractDecimals` / `isPositiveAmount`, `util/display.dart`), added to `shared/format/formatters.ts` as `addKes(a, b)`, `subtractKes(a, b)`, `isPositiveKes(a)` with tests (never floating point; K§5.2 rule). Formatting through `formatKes` / `formatAmount` and `nmNum` only.
- Copy never says wallet, balance, hold, release, escrow or "funds held" (OA-6). `KSh` everywhere, never `KES` (row 82).
- The issue's criterion "never combined into one figure" and the two owner-approved combined figures above: A§10 Q8-1.

### A§5 Data shapes (API on `origin/main` @ `28a0c42`; base `${apiBaseUrl}/api/v1`, Bearer through the #6 interceptor, F§5)

`ErrandView` fields used by #8 (`GET /errands/:id`, `apps/api/src/errands/errands.service.ts` `ErrandView`):
```ts
{
  id: string; reference: string; title: string | null;
  category: 'buy_for_me' | 'pickup_delivery' | 'inspection' | 'representation' | 'queue_admin' | 'business';
  status: ErrandStatus; createdAt: string; deadlineAt: string | null;
  budget: string;               // item amount, decimal string
  quotedPrice: string | null;
  feeTotal: string | null;      // "Total (service + runner fee)", 2-decimal string, null until quoted
  quoteExpiresAt: string | null;
  quoteRequestedAt: string | null;   // row 68 open request
  quoteAcceptanceRequired: boolean;  // ACCEPTED with an unaccepted re-quote (row 72)
  merchantDetailsAvailable: boolean; // row 43
  outsideServiceArea?: boolean;      // rows 236, 249 (b)
  assignment: { runner: { shortName?: string | null } | null } | null; // runner short name for v-price-auth (row 40)
}
```
The errand row also carries `merchantName`, `merchantTillNumber`, `merchantPaybillNumber`, `merchantAccountReference`. **The web never reads them from the errand view** (OA-5: Till/Paybill are shown only on `x-merchant-payment` after the fees are paid); see A§9 needs.

`Quote` (`GET /errands/:id/quote`): `{ id, errandId, total, currency, expiresAt: string | null, acceptedAt: string | null, createdAt, …components }`. #8 reads `total`, `expiresAt`, `createdAt` only.

`PaymentSummary` (`GET /payments/:errandId`, `payments.service.ts` `listForErrand`; on a TIMEOUT payment the API first asks the provider, STK Query, row 52):
```ts
{
  payment: Payment | null;            // the main (service + runner fee) payment, newest
  transactions: PaymentTransaction[]; // not rendered
  stkStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | null;
  failureReason: string | null;       // provider reason, e.g. "Request cancelled by user"
  merchantDetailsAvailable: boolean;
  merchantPayment: MerchantPaymentView | null;
  differencePayments: DifferencePaymentView[]; // price-change differences, newest first
}
Payment = { id, errandId, serviceFee, runnerFee, merchantAmount: string;
  paymentFlow: 'merchant_direct' | 'customer_to_runner' | 'runner_advance' | 'platform_only';
  status: 'pending' | 'authorized' | 'completed' | 'failed' | 'refunded';
  priceChangeRequestId: string | null; createdAt: string; … }
MerchantPaymentView =
  | { route: 'merchant_direct'; amount: string; paidTo: 'merchant'; merchantName: string | null;
      tillNumber: string | null; paybillNumber: string | null; accountReference: string | null;
      merchantDetailsUpdatedAt: string | null; merchantDetailsChangedAfterPayment: boolean }
  | { route: 'send_to_runner'; amount: string; paidTo: 'nitume' }
DifferencePaymentView = { payment: Payment; transactions; stkStatus: StkStatus | null; failureReason: string | null;
  checkoutRequestId: string | null; merchantPayment: MerchantPaymentView | null }
```

`InitiateResult` (`POST /payments/:errandId/initiate`): `{ payment, failureReason, merchantDetailsAvailable, reference, checkoutRequestId, transactions, stkStatus, merchantPayment }`; on a stored payment `checkoutRequestId` is `'PAID' | 'FAILED' | 'PENDING'`.

`PriceChangeRequest` (`GET /errands/:id/price-change?status=requested`, array, newest first): `{ id, errandId, fromPrice, toPrice, reason: string | null, status: 'requested' | …, createdAt }`. `PriceChangeDecision` (approve / reject) = the request + `{ differencePayment: DifferencePaymentView | null; refundReview: { status, … } | null }`.

`PaymentMethod` (`GET /customers/me/payment-methods`): `{ id, type: 'mpesa', label, detail, phoneNumber: string | null, isDefault }` (OA-10: M-Pesa only). `GET /users/me` `phone` is the payer fallback (OA-21). `GET /errands/defaults` → `{ defaultDeadlineHours: number, defaultDeadlineStartsAt: 'payment_confirmed' }`.

Dates arrive as ISO strings and are parsed to `Date`; amounts stay strings. Types go in `apps/website/src/app/core/api-types.ts` (extended, F§4.3), one `CheckoutApi` service (`features/customer/checkout/checkout-api.ts`) wraps every call in A§6.

### A§6 Endpoints and error codes used by #8 (all exist on `origin/main`)

| Call | Used by | Success | Error codes the views handle (409 unless noted) |
|---|---|---|---|
| `GET /errands/:id` | all | `ErrandView` | 403/404 → load error |
| `GET /errands/:id/quote` | quote | `Quote` | 404 → load error |
| `POST /errands/:id/quote/accept` (no body) | quote | 200 `{ errand, quote }`; idempotent; on ACCEPTED accepts a re-quote (row 72) | `quote_expired` (`{ quoteId, expiresAt }`), `quote_not_acceptable`, any other 409 → reload + A§2 |
| `POST /errands/:id/quote/request` (alias `/quote-request`) | quote | 200 `ErrandView` with `quoteRequestedAt` | `quote_request_pending` → treat as success (re-read errand, core parity), `quote_still_valid` → reload to checkout, `quote_request_not_allowed` → reload + A§2 |
| `PATCH /errands/:id { deadlineAt: ISO \| null }` | quote (deadline panel) | 200 `ErrandView` | `deadline_not_editable` (`status`) → close panel, reload + A§2; 400 `deadline_in_past`, 403 `deadline_customer_only`, network → stay, panel error |
| `PATCH /errands/:id/status { to: 'CANCELLED' }` | quote | 200 `{ errand, … }` | `illegal_transition` → reload + A§2; other → toast |
| `GET /customers/me/payment-methods` | quote, payment | `PaymentMethod[]` | failure → treated as `[]` (Flutter parity) |
| `POST /payments/:errandId/initiate { merchantRoute?, paymentMethodId? }` + header `Idempotency-Key` | payment | 201 `InitiateResult` | `quote_expired`, `quote_not_accepted`, `deadline_passed_before_payment` (`{ deadlineAt }`), `errand_not_payable` (`{ status }`), `idempotency_key_reused`; 400 `merchant_route_required`, `merchant_details_missing` (409), `errand_not_quoted`, `payment_method_invalid`, `idempotency_key_invalid` |
| `GET /payments/:errandId` | payment, item payment | `PaymentSummary` | 403 → load error |
| `POST /payments/:errandId/price-changes/:requestId/initiate` (no body) | item payment | `DifferencePaymentView` (pending or paid returned as is) | 404, `difference_not_stk` → toast `friendlyError` |
| `GET /errands/:id/price-change?status=requested` | price auth | `PriceChangeRequest[]` (first = pending) | failure → dialog load error |
| `POST /errands/:id/price-change/:requestId/approve { merchantRoute? }` | price auth | `PriceChangeDecision` | 400 `merchant_route_required`, 409 `merchant_details_missing` → route rows; `price_change_already_decided`, `price_change_not_in_progress`, `price_change_not_allowed`, any other 409 except `price_change_reject_not_cancellable` → already answered |
| `POST /errands/:id/price-change/:requestId/reject` | price auth | `PriceChangeDecision` (errand CANCELLED, refund review) | `price_change_reject_not_cancellable` → inline error; `price_change_already_decided` → already answered |
| `GET /errands/defaults` | quote (deadline panel) | defaults | failure → caption hidden |

API errors have the body `{ statusCode, code, message, ...extra }` (F§3). Classify by `code`, never by `message`. Never render `message`.

### A§7 Live data (K§6; rows 23, 29, 72, 43, 80, 68)

- `RealtimeService.joinErrand(errandId)` on load, `leaveErrand` on destroy. Events used: `errand:status_changed` (all views), `quote:reissued` and `quote:requested` (quote), `merchant_details:updated` (quote, item payment), `merchant_details:changed` (item payment), `price_change:requested` (shell listener, `v-price-auth`), `errand:access_revoked` (→ reload; the A§2 read then shows the load error). On every transition to `connected`, refetch the snapshot once (K§6.5).
- STK results have no socket event (a FAILED or TIMEOUT changes no errand state): `v-payment` and `x-merchant-payment` variant B poll `GET /payments/:errandId` whether or not the socket is connected (mobile spec, accepted 2026-10-09). `errand:status_changed` to PAYMENT_CONFIRMED still ends `v-payment` at once.
- **Background tabs (web adaptation)**: every timer-driven poll in #8 runs only while `document.visibilityState === 'visible'` (the app's `isRouteVisible`); on `visibilitychange` → `visible` the view checks once at once and resumes its schedule. Socket events are handled while hidden. Timers live in the component and stop on destroy.
- Polling cadence: quote 15 s, only while the socket is not `connected` (K§6.5); payment and variant B 5 s for the first 2 min after the payment's `createdAt`, then 30 s, stopping 10 min after `createdAt` (manual checks and socket events still work after that).

### A§8 Components

Kit (#5) and #6, reused unchanged: `nm-button`, `nm-card`, `nm-form-card`, `nm-status-chip` (`customerStatus`), `nm-notice`, `nm-error-state`, `nm-skeleton-card`, `NmDialogService` (+ `confirm()`), `NmPanelService`, `NmToastService`, `nmNum`, format pipes (`formatKes`, `formatAmount`, `formatClock`, `formatDayTime`, `formatDayTimeEat`, `formatPhoneIntl`), `friendlyError`, `RealtimeService`, `nm-pushed-header`, `nm-back-button`, `nm-icon`.

**NEW (#8)**, all standalone, OnPush, signal inputs. Ports of named Flutter widgets, so no new pattern. Kit-level ones go to `apps/website/src/app/shared/ui/`; customer-app-level ones (Flutter `apps/customer_app/lib/src/widgets/…`) go to `apps/website/src/app/features/customer/shared/`:

| Web component | Flutter counterpart | Level | Spec |
|---|---|---|---|
| `nm-receipt-row` (+ `nm-receipt-caption`) | C-18 `ReceiptRow`, `ReceiptCaption` (`receipt_card.dart`) | kit | Row: label `body` at 13px left, amount right in `nmNum` Code 13 (`isTotal`: 700 weight, 1px slate-line top border, margin-top 6, padding `10px 0 6px`; plain: padding 6 0). Caption: 12 slate-600 Sans with the time in `nmNum` Code 12 slate-600, padding-top 8. The receipt card itself (`ReceiptCard`) belongs to #9/#10 and is not built here |
| `nm-radio-row` | C-16 radio-row variant `NitumeRadioRow` (`nitume_choice_chip.dart`) | kit | Full-width pill (r-pill), min-height 48, padding 10px 16px, 1px border. Unselected: slate fill, slate-line border, label `chip` (12/600) blue, subtitle `muted-sm` (11.5) slate-600. Selected: blue fill and border, label and subtitle **white**. Disabled: slate fill, label and subtitle slate-400, not clickable. Native `<input type="radio">` visually hidden inside a `<label>` so arrow keys move within the group; focus ring on the row. Accessible name `label. subtitle` |
| `nm-choice-chip` | C-16 `NitumeChoiceChip` | kit | Pill, padding 8px 13px, slate fill + slate-line border, `chip` blue; selected blue fill + white; 48px hit height. Used by the deadline panel. **Also needed by #7** (`v-new-details` deadline and category chips): build once, whichever issue lands first |
| `nm-payment-method-card` | C-30 `PaymentMethodCard` (`task_rows.dart`) | kit | White row, padding 14px 15px, r-m, 1px slate-line: 38×26 badge (green fill, radius 5px, `M-PESA` in `tag` 10/700 **white**; the M-Pesa brand badge as built and audited in the app), 12px gap, label `row-title` + detail in `nmNum` `meta` (Code 11 slate-600), optional trailing slot. **Also needed by #12** |
| `nm-copy-row` | C-39 `CopyableValueRow` | kit | `x-merchant-payment` §Components |
| `nm-pulsing-dots` | `PulsingDots` (`brand.dart`) | kit | Three 7px slate-400 dots, gap 6px, opacity pulse 1.2 s, staggered 0.2 s; `role="status"` with the given `label` (visually hidden); static under `prefers-reduced-motion` |
| `nm-fixed-cta` | `NitumeFixedCta` / app `FixedCta` | kit | Below 768px: fixed to the bottom of the viewport, slate background, padding `8px 20px 6px` + `env(safe-area-inset-bottom)`, optional `above` slot 10px above the button; `<main>` gets matching bottom padding and the toast offset (K§4.10). From 768px (web adaptation): rendered inline where the view places it (no fixed bar). **Also needed by #7** (wizard CTA) |
| `nm-task-summary-card` | app `TaskSummaryCard` (`task_widgets.dart`) | customer | `nm-card` (padding 16): optional status chip (`showChip`), 10px; title `card-title` (`title` or the category display name, row 41); 4px; meta line `nmNum` `meta-lg` (whole line Code 12 slate-600) `#NT-10482 · Today, 10:03 AM` (`#` + `reference` · `formatDayTime(createdAt)`); optional footer slot |
| `nm-deadline-line` | app `DeadlineLine` (`deadline_widgets.dart`) | customer | Footer of the summary card: 12px, hairline, 10px; row `Deadline` (`row-title`) + optional trailing `nm-button` link small `Change`; 4px; the deadline `formatDayTimeEat(deadlineAt)` in `nmNum` `meta-lg`, or (no deadline) `No deadline yet. It starts when your payment is confirmed.` in `muted` Sans |
| `nm-deadline-panel` content | app `showDeadlineSheet` (`deadline_sheet.dart`) | customer | Hosted by `NmPanelService` (WQ-3), §States "Chosen deadline already passed" |
| `nm-merchant-route-rows` | app `MerchantRouteRows` | customer | Two `nm-radio-row`s in a `role="radiogroup"`, gap 8, exact copy in §Copy; inputs `selected`, `merchantDetailsAvailable`, `disabled`; output `selectedChange`. Used here and in `v-price-auth` |
| `nm-stk-status` | app `StkStatusView` (`widgets/stk_view.dart`) | customer | `customer-v-payment.md` §Layout. One component for `v-payment` and `x-merchant-payment` variant B (never two copies) |

### A§9 Needs from other agents

- **api-contract (privacy, OA-5)**: `GET /errands/:id` returns `merchantName` / `merchantTillNumber` / `merchantPaybillNumber` / `merchantAccountReference` to the customer before the fees are paid, the `merchant_details:updated` / `:changed` socket payloads carry them to the errand room at any state, and `GET /payments/:errandId` `merchantPayment` carries them while the main payment is still `pending`. OA-5 shows Till/Paybill only after the fees are paid. Recommend: strip them from customer errand views and socket payloads, and from `merchantPayment` until the main payment is `completed`; keep `merchantDetailsAvailable`. The web never renders them before PAYMENT_CONFIRMED either way (rule in `customer-x-merchant-payment.md`).
- **api-contract (open since the mobile spec)**: `merchantPayment.amount` for `merchant_direct` is the main payment's original `merchantAmount`; it should be the **outstanding** item amount after approved price changes (`customer-x-merchant-payment.md` Data). Until then the web shows the API value (parity with the app).
- **api-contract (open since the mobile spec)**: a "merchant details added" notification type (`v-notifications`). The live refresh works today through `merchant_details:updated`.
- **web-parity #7 / #12 ordering**: `nm-choice-chip`, `nm-fixed-cta` (with #7) and `nm-payment-method-card` (with #12) are built once. `Change` on `Pay with` opens #12's `v-payment-methods` in select mode; if #8 merges before #12, `Change` is not rendered (the server already falls back to the default method, then the sign-in phone, OA-21) and #12 adds it.
- **#7**: `v-new-review` `Submit task →` navigates to `…/quote` with `replaceUrl: true` (the app replaces the wizard stack); Home's `View request` / `Review quote →` / `Pay now →` targets per A§1 and A§3.
- **#9**: Task detail `Pay now` sets the A§3 intent; Task detail route `/app/customer/tasks/:errandId`; Track's `Pay the item amount` notice and `Price change` button open the #8 views.
- **#11**: notification deep links: `errand.QUOTED` and `quote.reissued` → `…/quote`; payment failed → `…/payment` (no intent, so no automatic push); merchant details added / `merchant_details.changed` → `…/item-payment`; price change requested → Track for the errand, then the shell opens the dialog.

### A§10 Questions for the owner (#8; board numbers to be assigned by the orchestrator)

| Id | Question | Recommendation |
|---|---|---|
| Q8-1 | **"Never combined into one figure" (issue #8 criterion) vs decided rows (payments).** Issue #8 asks for tests "asserting that service fee, runner fee and merchant amount are never combined into one figure". The decided rows put two combined figures on these screens, and the app (matches-design) shows them: row 34 (one `Total (service + runner fee)` row; the two fees are not shown separately until pricing rates exist, row 47) and rows 76/91 (`send_to_runner`: one STK charge for fees + item amount, shown as one amount on the checkout CTA and the payment screen with `Includes KSh … for your runner's purchase.`, which must equal what M-Pesa charges). This spec follows rows 34, 76 and 91 (the issue also asks for identical content). Confirm the criterion means: the item amount is never folded into the fee figure and always has its own line; the only combined amounts are the row-34 fee total and the row-76/91 charge amount with its `Includes` line; the three flows stay separate records in code and data | Confirm this reading; tests assert exactly those rules (A§4) |
| Q8-2 | **Reload or closed tab during payment (web).** The app sends the STK prompt when its payment screen opens from `Confirm & pay` or Home's `Pay now`, and keeps the payment's idempotency key in device storage. On the web: (a) the payment page sends a prompt only right after an in-app `Confirm & pay` / `Pay now` click in that tab; after a reload, a bookmark, a notification link or a second tab it only shows the stored payment's state (pending, timeout, success, failed), and with no payment it returns to the checkout, where the customer taps `Confirm & pay` again; (b) the key is kept in memory only (WQ-8: no browser storage). Both are safe because the API returns the existing payment, without a new push, while one is open (verified on `main`). Approve? | Approve (a) and (b) |

Still open on the board and relevant here: WQ-2 (customer times: local for `Valid until`, `Requested`, details-changed time; EAT for deadlines, as recommended). Inherited, unchanged: mobile `x-awaiting-quote` Q2 (route fixed once the fees are paid; build default: no change after payment) and mobile `x-merchant-payment` Q1 (no "I've paid the merchant" confirmation; build default: `Done` only closes).

---

## Purpose
One page per errand with two main states plus three variants (mobile spec):
- **Waiting** (REQUESTED): the final quote is being prepared.
- **Checkout** (QUOTED, or ACCEPTED re-entry): show the final quote, let the customer choose how the item amount is paid (if any) and which M-Pesa number to charge, then accept and go to payment (the accept-quote step).
- **Quote expired** (QUOTED/ACCEPTED, expired): `Request a new quote` (row 68).
- **New quote requested** (QUOTED/ACCEPTED with an open request): waiting layout (row 68).
- **Outside every service area** (REQUESTED, or QUOTED/ACCEPTED with an expired quote, flag set; rows 236, 249 (b)).

## Entry / exit
- Entry: `v-new-review` `Submit task →` (#7, `replaceUrl`); Home active card `View request` (REQUESTED) / `Review quote →` (QUOTED) (#7); Task detail for REQUESTED/QUOTED (#9); notification `errand.QUOTED` / re-quote (#11); `v-payment` sending the customer back (expired quote, passed deadline, route required, re-quote to accept, or no payment after a reload).
- Exits:
  - Back (`nm-back-button`, or browser Back) → previous page; fallback `/app/customer/home`.
  - `Back to Home` → `/app/customer/home`.
  - Checkout CTA → accept if needed → `CheckoutIntentStore.set(…)` → navigate to `…/payment` (push, not replace, so Back returns here as in the app).
  - `Change` on `Pay with` → #12 select mode (A§9); the chosen method comes back through `CheckoutIntentStore` when the customer returns.
  - `Cancel task` / `Decline and cancel task` → confirm dialog → CANCELLED → `/app/customer/home` (`replaceUrl`) + toast `Task cancelled.`
- Status routing on load and on every refresh: A§2.

## Task states
REQUESTED (waiting, or outside-area), QUOTED (checkout, expired, new quote requested, outside-area once expired), ACCEPTED (checkout re-entry, expired, new quote requested, outside-area once expired). Transitions fired here: QUOTED → ACCEPTED (customer, through `POST …/quote/accept`); REQUESTED / QUOTED / ACCEPTED → CANCELLED (customer, §3.3). An expired quote, a request for a new quote, an admin re-quote and a deadline change change no state (rows 46, 68, 72, 242). Chips only through `customerStatus()`: REQUESTED `Awaiting quote`, QUOTED `Quote ready`, ACCEPTED `Awaiting payment` (pending tone).

## Layout (web)

Frame (all states): `nm-pushed-header` title `Your quote` (`h1`, `pushed-title`), back button. Content column below 768px: full width, 20px side padding (cards span the column; the app's `0 20` card margins become the column padding). From 768px (web adaptation): a single column `max-width: 560px`, centred in the shell content area, except the checkout state from 1024px (below). Vertical gaps between cards 14px (app margin-bottom 14).

### Waiting state (REQUESTED)
1. 32px top space; `nm-pulsing-dots` label `Waiting for your quote`, centred; 20px.
2. Heading `Preparing your quote`, 17/700 blue (`dialog-title` at weight 700), centred; 8px.
3. Body `muted` (13 slate-600), centred, `max-width: 260px` centred; 22px.
4. `nm-task-summary-card` with chip `Awaiting quote`.
5. Button stack, gap 10, full column width below 768px, `max-width: 320px` centred from 768px (web adaptation): outline `Back to Home`; text button `Cancel task`, destructive (red label, OA-13).

### New quote requested (QUOTED/ACCEPTED, `quoteRequestedAt` set and later than the newest quote's `createdAt`)
Same as Waiting with: dots label `Waiting for your new quote`; heading `Preparing a new quote`; body `You asked for a new quote. We'll notify you when it's ready.`; 6px under the body a meta line `Requested ` + `formatDayTime(quoteRequestedAt)`, the whole line `nmNum` `meta-lg` (Code 12 slate-600), centred; summary card **without** chip; same buttons. No `Request a new quote` here.

### Outside every service area (rows 236, 241, 249 (b))
Shown when `outsideServiceArea === true` **and** (status REQUESTED, or QUOTED/ACCEPTED with an expired quote by the §States test). A valid or expiry-less quote with the flag set shows checkout (row 249 (b); the client checks too, so a stale flag never hides a payable quote). It replaces the expired checkout and the new-quote-requested state.
- No dots. Heading `We can't take this task` (in a `role="status"` live region); body `Its location is outside the areas we serve. You can cancel it; you haven't paid anything.`; summary card with chip only when REQUESTED; buttons: **primary** `Cancel task` first, then outline `Back to Home`.

### Checkout state (QUOTED, ACCEPTED re-entry)
Top to bottom (single column below 1024px):
1. `nm-task-summary-card` with the status chip (`Quote ready` / `Awaiting payment`) and the `nm-deadline-line` footer (`Change` shown unless the deadline has passed, a call is in flight, or the panel is open).
2. `nm-form-card` `Final quote`: one `nm-receipt-row` `Total (service + runner fee)` `isTotal` with the fee total (A§4); under it `nm-receipt-caption` `Valid until ` + `formatClock(expiresAt)` (hidden when the quote has no `expiresAt`, row 83).
3. Only when the item amount > 0 and the category is Buy For Me or Get It For Me (row 80): `nm-form-card` `How should this be paid?`: `nm-receipt-row` `Item amount` (plain) with `errand.budget`, a 1px slate-line hairline, 10px, `nm-merchant-route-rows`.
4. `nm-form-card` `Pay with`: `nm-payment-method-card` of the selected method (label, masked `detail`); without a saved method: label `M-Pesa`, detail = the sign-in phone masked `+254 712 ••• 678`, and under the card 6px `Your sign-in number` (`muted-sm`). Trailing `nm-button` link `Change` only when the customer has saved M-Pesa methods (and #12 is merged, A§9).
5. CTA: primary `Confirm & pay ` + `formatKes(charge)` in `nmNum` + ` →` (A§4 charge rule); `Confirm & pay →` when no fee total is known. Below 768px inside `nm-fixed-cta`; from 768px inline after the `Pay with` card, full width of the column.
6. Text button `Decline and cancel task`, destructive, centred, margin `4px 0 20px`.

From 1024px (web adaptation, "uses the width sensibly"): a two-column grid, `grid-template-columns: minmax(0, 1fr) 360px`, gap 24px, `max-width: 960px`, centred. Left: items 1–3. Right (`position: sticky; top: 24px`): item 4, the state notice (expired / deadline passed, below), item 5 inline full width, item 6. DOM order equals the reading order above (left column first), so keyboard and screen-reader order match the single-column layout.

## Copy (exact; mockup wording marked, the rest as built from the mobile spec)
- Header: `Your quote`.
- Waiting: `Preparing your quote`; `We're pricing your task. This usually takes a few minutes, and we'll notify you when it's ready.`; buttons `Back to Home`, `Cancel task`.
- New quote requested: `Preparing a new quote`; `You asked for a new quote. We'll notify you when it's ready.`; `Requested 4:45 PM` style (`formatDayTime`).
- Outside area (owner copy, row 241): `We can't take this task`; `Its location is outside the areas we serve. You can cancel it; you haven't paid anything.`
- Cards: `Final quote`; `How should this be paid?` (mockup); `Pay with`. Rows: `Total (service + runner fee)` (mockup), `Item amount`. Caption `Valid until 4:30 PM` / `Expired at 4:30 PM`.
- Routes: `Pay merchant directly (recommended)` (mockup) with subtitle `You'll see the merchant's Till or Paybill number after paying the fees.` (details available) or `Available once the merchant's details are added.` (details pending, disabled); `Send purchase amount to runner` (mockup) with subtitle `You'll pay this amount to Nitume by M-Pesa together with the fees, for your runner's purchase.` (row 76). The mockup's third option `Let runner advance the purchase` is not shown (OA-5).
- Payer: `M-Pesa`, `Your sign-in number`, link `Change`.
- CTA (mockup): `Confirm & pay KSh 2,200 →`. Decline: `Decline and cancel task`.
- Cancel dialog (`NmDialogService.confirm`, destructive): title `Cancel this task?`; body `Nothing has been charged yet.`; confirm `Cancel task` (outline, red); cancel `Keep task` (primary).
- Expired: notice `This quote has expired. Ask for a new quote to continue.`; CTA `Request a new quote`; toasts `We've asked for a new quote.` / `Couldn't request a new quote. Try again.`
- Deadline: notice `Your deadline has passed. Choose a new one to continue.`; CTA `Choose a new deadline`; panel title `Deadline`; chips `Today`, `Tomorrow`, `Flexible`; Flexible caption `No fixed time. Your task's deadline is ` + `24 hours` (Code) + ` after your payment is confirmed.`; panel error `Couldn't change the deadline. Try again.`; summary line `No deadline yet. It starts when your payment is confirmed.`
- Toasts: `Task cancelled.`; `Couldn't cancel the task. Try again.`; `Couldn't accept the quote. Try again.`
- Announcements (visually hidden `aria-live="polite"`): `Your quote is ready.` (REQUESTED → QUOTED while open); `Your new quote is ready.` (request answered).
- Load error: `Couldn't load this task.` + `Try again`.

## States
| State | Trigger | Behaviour |
|---|---|---|
| Loading | first load / `Try again` | Two `nm-skeleton-card`s under the header (app `SkeletonList`) |
| Load error | errand or quote read fails | `nm-error-state` `Couldn't load this task.`, `Try again` reloads |
| Waiting | REQUESTED | §Layout |
| Live quote | `errand:status_changed` or poll shows QUOTED | Re-read errand + quote + methods, switch to checkout in place (150 ms fade; none under reduced motion), announce `Your quote is ready.` |
| Checkout | QUOTED / ACCEPTED, quote valid, no open request | §Layout. Default route: merchant-direct when `merchantDetailsAvailable`, else send-to-runner; default payer: `isDefault` method, else the first, else the sign-in phone |
| Merchant details arrive | `merchant_details:updated` or refresh shows `merchantDetailsAvailable` true | Merchant-direct row enables in place; the customer's current selection does not change |
| Accepting | CTA | CTA `loading`; other actions disabled. QUOTED, or ACCEPTED with `quoteAcceptanceRequired` → `POST …/quote/accept`; ACCEPTED without it → no call. Then intent (route only when item amount > 0) → `…/payment` |
| Accept: `quote_expired` | API | Expired state, no toast |
| Accept: other 409 | API | Reload, A§2 |
| Accept: other error | API / network | Toast `Couldn't accept the quote. Try again.` |
| Quote expired | `expiresAt` (errand `quoteExpiresAt`, else `quote.expiresAt`) passed on load or while open (re-evaluated every 30 s and on visibility), or `quote_expired` from accept, or arrival from `v-payment` with navigation state `{ quoteExpired: true }` | Summary card without chip; `Final quote` stays with caption `Expired at …`; route and `Pay with` cards hidden; `nm-notice` `This quote has expired. Ask for a new quote to continue.`; CTA `Request a new quote`; `Decline and cancel task` stays. A quote without `expiresAt` counts as valid (row 83) |
| Requesting a new quote | expired CTA | CTA `loading` → `POST …/quote/request`. Success or `quote_request_pending` → toast `We've asked for a new quote.`, reload → New quote requested. `quote_still_valid` → clear the expired flag, reload → checkout. `quote_request_not_allowed` → reload, A§2. Other → toast `Couldn't request a new quote. Try again.`, stay |
| New quote requested | `quoteRequestedAt` later than the quote's `createdAt` | §Layout. Ends on `quote:reissued`, `errand:status_changed` or a refresh showing a newer quote → checkout with the new figures and `Valid until`, announce `Your new quote is ready.` On ACCEPTED the chip reads `Awaiting payment` and the CTA accepts the re-quote before paying (row 72) |
| Outside area | flag + rule above | §Layout. `Cancel task` is the primary |
| Chosen deadline already passed (row 237) | before payment and `deadlineAt` non-null and past (rows 239 (a), 240, 243), or arrival from `v-payment` with `{ deadlinePassed: true }` | Only when the quote is not expired (an expired quote is answered first). CTA replaced by `nm-notice` `Your deadline has passed. Choose a new one to continue.` + primary `Choose a new deadline`, which opens the deadline panel |
| Deadline panel | `Choose a new deadline` or `Change` (row 244) | `NmPanelService.open` (bottom sheet below 768px, centred max 560px above, WQ-3), title `Deadline`; `nm-choice-chip`s `Today` (hidden once 23:59 local has passed), `Tomorrow`, `Flexible`, wrap gap 8, the chip matching the current `deadlineAt` selected (23:59 local today/tomorrow; null → `Flexible`). Choosing a chip saves at once: `PATCH /errands/:id { deadlineAt }` with 23:59 local of that day as ISO, or `null` for Flexible; Flexible shows the caption when `GET /errands/defaults` says `payment_confirmed`. Choosing the already-current chip just closes. Saving: chips disabled, `nm-pulsing-dots` label `Saving`. Success → close, re-read the errand, clear the passed-deadline flag; the quote is kept (row 242). `deadline_not_editable` → close, reload, A§2. Other failure → `nm-notice` danger `Couldn't change the deadline. Try again.` inside the panel |
| Cancelling | confirm dialog accepted | `PATCH …/status { to: 'CANCELLED' }`, the cancel button `loading`; success → toast `Task cancelled.` + Home (`replaceUrl`); failure → toast `Couldn't cancel the task. Try again.` |
| Reconnecting / socket down | K§6 | No line on this page; poll every 15 s while visible |
| Errand moved on | status PAYMENT_CONFIRMED or later, CANCELLED, EXPIRED … | A§2 routing, `replaceUrl` |

## Numeric fields (Fira Code, `nmNum`)
Reference `#NT-10482` and the created time (the whole summary meta line); the `Requested …` line; `Valid until` / `Expired at` time; the deadline time; every amount (fee total, item amount, the amount inside the CTA); the masked phone in the payer card; the Flexible caption's `24 hours`.

## Data
- A§5 shapes, A§6 calls, A§7 live data. On load: `GET /errands/:id`, then (not REQUESTED) `GET /errands/:id/quote` and `GET /customers/me/payment-methods` in parallel; sign-in phone from `SessionStore.user().phone` (F§4.2).
- Route sent to payment only when the item amount > 0; never `runner_advance` (OA-5).
- Push/notifications: #11 (A§9).

## Accessibility and responsive
- `h1` = header title; focus moves to it on arrival (F§7.3).
- Dots and state changes announced (live regions above); the outside-area heading is a live region.
- Route options: `role="radiogroup"` labelled by the card heading; the disabled merchant-direct row is `aria-disabled` and its subtitle explains why.
- Every control ≥ 48×48px; destructive actions are red text only (no red fill, OA-13).
- No horizontal scroll at 360px (cards wrap; the CTA label wraps on two lines if needed). From 1024px the two-column grid; the aside is sticky only when the viewport is at least 640px tall (otherwise static).
- Toasts sit above the fixed CTA below 768px (offset = CTA height).

## Required tests (Vitest)
1. Status routing (A§2): REQUESTED → waiting; QUOTED → checkout; ACCEPTED → checkout with chip `Awaiting payment`; PAYMENT_CONFIRMED → `/app/customer/track/:id` with `replaceUrl`; CANCELLED and EXPIRED → task detail; unknown status → load error.
2. Waiting copy, dots label, chip `Awaiting quote`, `Back to Home` → Home, `Cancel task` red text button.
3. Live switch: a fake `errand:status_changed` to QUOTED re-reads errand + quote and shows checkout; live region says `Your quote is ready.`
4. Socket disconnected → polls every 15 s only while visible (fake timers, stubbed `visibilityState`); connected → no polling; reconnect → one refetch.
5. **Fee total only**: the `Final quote` card has exactly one amount row, labelled `Total (service + runner fee)`, showing `feeTotal` (fallback `quote.total`, then `quotedPrice`); no `Service fee` / `Runner fee` text anywhere; quote components never rendered even when present in the response.
6. **Item amount kept apart**: Buy For Me with budget 40000 shows `Item amount KSh 40,000` in its own card and the fee row still shows only the fee total; Check It For Me (or budget 0) shows no route card.
7. **CTA charge**: merchant-direct selected → `Confirm & pay KSh <fee> →`; send-to-runner selected → `Confirm & pay KSh <fee + item> →` (decimal-string addition, e.g. `"2200.00"` + `"40000.00"` → `KSh 42,200`); the amount sits in an `nmNum` element.
8. Route rows: default merchant-direct when details are available, else send-to-runner; merchant-direct disabled with `Available once the merchant's details are added.`; a `merchant_details:updated` event enables it without changing the selection; selected row uses the blue fill and white text tokens; no `runner_advance` option.
9. Payer: default method shown; no methods → masked sign-in phone + `Your sign-in number`, no `Change`.
10. **Quote accept**: QUOTED → `POST …/quote/accept` then navigation to `…/payment` with the intent `{ route, paymentMethodId }` stored; ACCEPTED with `quoteAcceptanceRequired` → accept called; ACCEPTED without it → no accept call; budget 0 → no route in the intent.
11. Accept `quote_expired` → expired state (no toast); other 409 → reload; 500 → toast `Couldn't accept the quote. Try again.`
12. **Quote decline**: `Decline and cancel task` → confirm dialog with the exact copy, confirm outline red / `Keep task` primary; confirm → `PATCH …/status { to: 'CANCELLED' }`, toast `Task cancelled.`, Home with `replaceUrl`; `Keep task` → no call; failure → toast.
13. Expired by date (fake clock passes `expiresAt` while open) and by navigation state: chip hidden, `Expired at` caption, route and payer cards hidden, notice and `Request a new quote`.
14. Request a new quote: success and `quote_request_pending` → toast + New quote requested state with `Requested …` in Fira Code; `quote_still_valid` → checkout; `quote_request_not_allowed` → reload; 500 → error toast.
15. New quote requested restored on load from `quoteRequestedAt`; `quote:reissued` switches back to checkout with the new total and announces `Your new quote is ready.`
16. Outside area: REQUESTED + flag → owner copy, primary `Cancel task` first; QUOTED with a valid quote + flag → normal checkout; QUOTED expired + flag → outside-area state (not the expired state).
17. Deadline passed on load (QUOTED, `deadlineAt` past) → notice + `Choose a new deadline`; expired quote takes precedence over it.
18. Deadline panel: `Today` hidden after 23:59 local; `Flexible` sends `deadlineAt: null` and shows the caption from defaults; `Tomorrow` sends 23:59 local tomorrow as ISO; success closes and restores the pay CTA with the quote unchanged; `deadline_not_editable` → reload; 400 → danger notice in the panel.
19. Deadline line: chosen deadline in EAT Fira Code; `Flexible` → `No deadline yet. It starts when your payment is confirmed.`; `Change` opens the panel.
20. Two-column layout from 1024px and single column below (stubbed `matchMedia`); fixed CTA below 768px, inline from 768px; DOM order unchanged.
21. Token and font use: no raw colours (K§12.1 static check covers the folder); every numeric field listed above is inside `nmNum`.
22. No storage writes during the whole flow (`localStorage` / `sessionStorage` untouched).

## Current vs design
No signed-in customer area exists on the website yet (#6 is specced, not built on this branch); nothing to compare. The Flutter screen (`awaiting_quote_screen.dart`) is the behavioural reference and is `matches-design` (re-audit 2026-10-20).
