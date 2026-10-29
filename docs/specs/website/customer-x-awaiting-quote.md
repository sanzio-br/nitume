# customer `x-awaiting-quote` (web): waiting for the quote, then accept and choose how to pay

- Issue: GitHub #8, "[Website] Customer: quote, checkout and M-Pesa payment". Builder: `web-parity`. Branch: `feat/website-customer-checkout`. It is stacked on #7 (`feat/website-customer-create-task`, re-audit 2 PASS at `6338a75`, merged into this branch at `528ed46`), which is stacked on #6.
- Route: `/app/customer/tasks/:errandId/quote` inside the customer shell (`authGuard`, `roleGuard('customer')`, `hasNameGuard`). Route data `{ role: 'customer', navKey: 'home', pushed: true }`. Route `title: 'Your quote · Nitume'`, read by Angular's default `TitleStrategy` (no custom strategy, WQ-33).
- Shared rules: `auth-foundation.md` (F§n), kit `ui-kit.md` (K§n), `customer-shell.md` (S), and the #7 wizard foundation in `customer-v-new-category.md` (NC§Wn: `customerLinks`, `CustomerErrandsApi`, `apiErrorOf`, kit additions §W9a, shared components §W9b, the WQ-33/WQ-34 rules §W10). §A below holds what all four #8 views share (routes, data shapes, error codes, live data, components, the money rule, bundle rules, foundation tests, open questions). The other three #8 specs cite it as `A§n`.
- Sources, in order:
  - Owner answers: OA-3, OA-4, OA-5, OA-10, OA-13, OA-21; BOARD rows 34, 42, 43, 46, 47, 68, 72, 76, 80, 83, 88, 91, 236, 237, 239–244, 249; WQ-2, WQ-3, WQ-8, WQ-15, WQ-16, WQ-27, WQ-28, WQ-33, WQ-34, WQ-35, WQ-53.
  - `docs/design/nitume_design_system.html`.
  - The mobile spec `docs/specs/customer/x-awaiting-quote.md` (matches-design) and customer `_shared.md` §6–§8.
  - The built Flutter screen `apps/customer_app/lib/src/screens/checkout/awaiting_quote_screen.dart` (+ `deadline_sheet.dart`, `widgets/deadline_widgets.dart`, `widgets/task_widgets.dart`).
  - The API on `origin/main` @ `380be22` (includes PR #29 / issue #28, merchant numbers hidden from customers until the fees are paid).
  - The mockup does not draw this view (mobile spec).
- **(web adaptation)** marks a layout or browser choice the mobile sources do not make. It never changes content, copy, tokens or the component set. **(proposed)** marks copy the mobile spec marked proposed (built as written in the app).
- Implementation: none. `tasks/:errandId/quote` is a #7 `ViewStubComponent` route (`customer.routes.ts`). Status: **missing**.
- **Updated 2026-10-29** (commit `docs(specs): #8 specs updated for owner answers and the #7 build`):
  - Owner decisions WQ-27 (money rule, was Q8-1), WQ-28 (no automatic prompt; key in memory, was Q8-2), WQ-2 / WQ-53 (deadlines 23:59 EAT, labelled EAT), WQ-34 (360 kB raw, WQ-33 rules), WQ-35 (merchant name visible before payment).
  - Aligned with what #7 built: code under `app-area/customer/`; `nm-fixed-cta`, `nm-choice-chip` (+ group), the receipt parts, `customerLinks`, `apiErrorOf`, `CustomerErrandsApi.defaults()`, `RealtimeService.onStateChange` and `CUSTOMER_NOW` are reused and no longer listed as new.
  - PR #29 (issue #28) on `main`: the server now withholds the Till/Paybill/account numbers from customers until the fees are paid (A§5, A§9).
- **Re-audit 1 update (2026-10-29):**
  - Owner **Q8-3** answered: the checkout deadline line is 24-hour, `Today, 23:59 EAT` (kit `formatDeadlineEat(…, { hour24: true })`).
  - **Same-route navigation** (spec defect found at re-audit 1, finding 1): the errand id is read from `ActivatedRoute.paramMap`, not once from the snapshot, and every page resets on a change (A§1 "Same route, another errand").
  - Builder seams recorded: `CHECKOUT_TIMERS` (A§7); `formatDeadlineEat` `hour24` and `followInAppLink` `beforeFollow` (A§8 kit table).
  - The price-change dialog has no `aria-describedby` (`customer-v-price-auth.md` Accessibility).

---

## A. Shared by the four #8 views

### A§1 Routes and navigation (web adaptation of the app's pushed screens)

| View | Route | `customerLinks` | Kind | `navKey` | Route `title` | Back fallback (`nm-back-button` `fallback`, no in-app history) |
|---|---|---|---|---|---|---|
| `x-awaiting-quote` | `/app/customer/tasks/:errandId/quote` | `awaitingQuote(id)` (#7) | pushed | `home` | `Your quote · Nitume` | `customerLinks.home()` |
| `v-payment` | `/app/customer/tasks/:errandId/payment` | `payment(id)` (#7) | pushed | `home` | `Payment · Nitume` | `customerLinks.awaitingQuote(id)` |
| `x-merchant-payment` | `/app/customer/tasks/:errandId/item-payment` | `itemPayment(id)` (**NEW #8**) | pushed | `track` | `Pay the item amount · Nitume` | `customerLinks.track(id)` |
| `v-price-auth` | none: a blocking dialog (K§4.8) opened by the customer price-change watcher (`customer-v-price-auth.md`) | — | dialog | — | — | — |

- **Routes.** In `app-area/customer.routes.ts`, under the customer shell route (`children`). #8 replaces the two #7 stub routes `tasks/:errandId/quote` and `tasks/:errandId/payment` (NC§W1) with `loadComponent` of its pages. It adds `tasks/:errandId/item-payment`. Each route keeps `data { role, navKey, pushed: true }` and gets the `title` above. The `tasks/:errandId` (#9), `tasks/:errandId/evidence` (#10) and `notifications` (#11) stubs stay.
- **Links.** Every #8 target goes through `customerLinks` (`app-area/customer/customer-links.ts`, NC§W1). #8 adds one function, `itemPayment(id)` → `/app/customer/tasks/${enc(id)}/item-payment`. #9's spec adds it only if #8 has not. No #8 file hard-codes `/app/customer/…`.
- `pushed: true`: below 768px the bottom bar is hidden; from 768px the white side nav stays visible with the `navKey` item active (WQ-15, WQ-16). `navKey: 'home'` for quote and payment because a REQUESTED / QUOTED / ACCEPTED task is listed on Home and `Back to Home` is this flow's way out. `track` for the item payment because it is opened from Track.
- `:errandId` is passed to the API as is. A 404/403 shows the view's load-error state.
- In-app navigation between #8 views uses the Angular router. "Replace" in the mobile spec (`Nav.replaceWith…`, `resetToTrack`) = `router.navigateByUrl(…, { replaceUrl: true })`. Navigation state (`{ quoteExpired }`, `{ deadlinePassed }`, `{ approvedIncrease, priceChangeRequestId }`) is passed with the `state` option. It is read from `router.getCurrentNavigation()?.extras.state` each time the page (re)starts for an errand (below), never from router-bound inputs (WQ-33).
- **Same route, another errand (re-audit 1, finding 1).** Angular's default `RouteReuseStrategy` keeps the page component when only `:errandId` changes, for example:
  - `/tasks/e-1/item-payment` → `/tasks/e-2/item-payment` after the price-change dialog for e-2 is approved on e-1's page (the watcher opens the dialog over any page);
  - a #11 notification or push link to the same #8 route of another errand;
  - browser Back/Forward between such entries.

  So each #8 page:
  - reads the id from `ActivatedRoute.paramMap` (`pipe(takeUntilDestroyed())`; an observable read, allowed by WQ-33), not once from `snapshot`;
  - on every new id: stops its timers and polls, `leaveErrand(old)`, clears its state (loading again, no content of the old errand on screen), re-reads the navigation state, `joinErrand(new)`, and runs the A§2 read for the new errand;
  - filters socket events by the **current** id;
  - closes any open deadline panel when the id changes;
  - reads `CheckoutIntentStore.take` for the new id.

  No custom `RouteReuseStrategy` (it is root-level and would change #6/#7 routes).
- Destinations named in this flow: Home `customerLinks.home()`; Track `customerLinks.track(id)` (S, OA-21); Task detail `customerLinks.taskDetail(id)` (#9); payment methods in select mode (#12, A§9).

### A§2 Entry routing (every #8 route checks the errand first)

On load each route reads `GET /errands/:errandId` and routes by status before it renders anything else (Flutter `_routeAway` / `PaymentScreen._start`). One pure function, `checkoutRedirect(view: 'quote' | 'payment' | 'item-payment', status: ErrandStatus, id): string | null` in `app-area/customer/checkout/checkout-routing.ts`, holds this table. All three pages use it (no copied switch).

| Errand status | `…/quote` | `…/payment` | `…/item-payment` |
|---|---|---|---|
| REQUESTED, QUOTED | render | replace → `…/quote` | replace → `…/quote` |
| ACCEPTED | render (checkout re-entry, chip `Awaiting payment`) | render per `v-payment` Entry rules | replace → `…/quote` |
| PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER | replace → Track | render (shows the stored payment; SUCCESS → Track) | render |
| COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED, DISPUTED, DRAFT | replace → Task detail | replace → Task detail | replace → Task detail |

States are the §3.3 wire values, parsed with `parseErrandStatus` (K§4.2.3). Labels come only from `customerStatus()`. An unknown status string → the view's load-error state (never a guessed label).

### A§3 In-memory checkout stores (no browser storage; owner WQ-28, WQ-8)

Nothing in #8 is written to `localStorage`, `sessionStorage`, IndexedDB, a cookie or `history.state` (F§4.1 rule extended to #8; `history.state` survives a reload, so it must not carry the intent). Two `providedIn: 'root'` signal stores in `app-area/customer/checkout/`:

- **`CheckoutIntentStore`** (`checkout-intent.store.ts`): `set(errandId, { route?: 'merchant_direct' | 'send_to_runner'; paymentMethodId?: string; payerDetail?: string })` and `take(errandId)` (returns the intent and clears it, once). Writers:
  - the checkout CTA (this view);
  - Home's active-card `Pay now →` for ACCEPTED (#7 code, wired by #8, A§8 "Changes to #7 code");
  - Task detail's `Pay now` (#9).
  These match the Flutter `fromCheckout: true`. `v-payment` reads the intent once to decide whether it may send an STK push (`v-payment` Entry rules). A reload, a link, a modified click (new tab) or a second tab has no intent.
- **`PaymentAttemptStore`** (`payment-attempt.store.ts`; port of the app's `paymentAttempts`, memory instead of secure storage, **WQ-28**):
  - `keyFor(errandId)` returns the current attempt's `Idempotency-Key` and keeps it for the tab's life.
  - `newAttempt(errandId)` replaces it.
  - The key comes from an injectable factory `PAYMENT_KEY_FACTORY` (default `crypto.randomUUID()`, 36 chars; when `randomUUID` is missing, as on a non-secure origin, 32 hex chars from `crypto.getRandomValues`). Both match the API's `^[A-Za-z0-9_-]{8,128}$`.
  - Cleared by the full-reload sign-out (F§4.5).
- **Owner decision WQ-28 (2026-10-28):** a reload, link or second tab never re-sends the M-Pesa prompt automatically. The page shows the stored payment's state, or returns to the checkout when there is none. The duplicate-charge key is kept in memory only.
- Why memory is enough (verified on `origin/main` `apps/api/src/payments/payments.service.ts` `initiate`): while the errand has a main payment that has not FAILED, every initiate (any key or none) returns that payment and pushes nothing (`existing && existing.status !== FAILED → resultFor(existing)`), and a unique index allows one active main payment per errand. A key lost by a reload therefore cannot cause a second charge.

### A§4 Money on these screens (three flows; owner WQ-27; OA-4, rows 34, 42, 76, 91)

**Owner decision WQ-27 (2026-10-28), the money rule the tests enforce:** the item/merchant amount is never folded silently into a fee figure and always has its own line. The decided combined figures stay: row 34 `Total (service + runner fee)` and the row 76/91 send-to-runner charge with its `Includes KSh … for your runner's purchase.` line. Service fee, runner fee and merchant payment stay separate records in code and data.

| Figure | Where | Source | Rule |
|---|---|---|---|
| `Total (service + runner fee)` | checkout `Final quote` card | `errand.feeTotal`, else `quote.total`, else `errand.quotedPrice` | One row (row 34). `Service fee` / `Runner fee` lines are not shown, and the client never computes a split. Quote components (`baseFee`, `distanceFee`, `timeFee`, `urgencyFee`, `complexityFee`, `premiumFee`) are never read into the UI (OA-4). **Combined figure 1 of 2 (WQ-27)** |
| `Item amount` | checkout route card; merchant payment | `errand.budget` (checkout); `merchantPayment.amount` / difference `payment.merchantAmount` (after payment) | Always its own row or screen, never added into the fee total. Only Buy For Me and Get It For Me (`buy_for_me`, `pickup_delivery`), and only when > 0 (row 80) |
| STK charge | checkout CTA `Confirm & pay KSh … →`; `v-payment` amount | checkout: the fee total, plus the item amount **only** when `send_to_runner` is selected; payment: `serviceFee + runnerFee` (+ `merchantAmount` when `paymentFlow = customer_to_runner`) from the payment record | One combined charge for `send_to_runner` (row 76). On `v-payment` it is shown with `Includes KSh … for your runner's purchase.` (row 91). On the checkout the item amount is on its own line in the route card just above. The shown amount equals the amount M-Pesa charges (row 91). **Combined figure 2 of 2 (WQ-27)**. `merchant_direct` never adds the item amount |
| Price-change difference | `v-price-auth`, `x-merchant-payment` | request `fromPrice` / `toPrice`; difference `payment.merchantAmount` | Item amount only, never fees (OA-8) |

- **Code and data:** the client models keep `serviceFee`, `runnerFee` and `merchantAmount` as separate fields exactly as the API sends them. No client type, signal or request body carries a field that merges them. The two combined figures above exist only as display values computed in the view (`computed`). The initiate request sends **no amount**; the server computes the charge.
- **Arithmetic:** decimal strings in cents, never floating point (K§5.2 rule). Port of the app's `addDecimals` / `subtractDecimals` / `isPositiveAmount` (`util/display.dart`). They are added to `shared/format/formatters.ts` as `addKes(a, b)`, `subtractKes(a, b)`, `compareKes(a, b)` (−1/0/1) and `isPositiveKes(a)`, each returning or comparing 2-decimal strings and throwing on a non-numeric string (as `parseAmount`). Formatting goes only through `formatKes` / `formatAmount` / `kesSpoken` and `nmNum`.
- Copy never says wallet, balance, hold, release, escrow or "funds held" (OA-6). `KSh` everywhere, never `KES` (row 82).
- The tests that enforce WQ-27 are listed once in A§12 (A.T7) and in each view's tests.

### A§5 Data shapes (API on `origin/main` @ `380be22`; base `API_V1` = `${apiBaseUrl}/api/v1`; Bearer through the #6 lazy interceptor, F§5)

Types and calls live in **`app-area/customer/data/checkout.api.ts`** (NEW #8), next to #7's `errands.api.ts`. They are not in `core/api-types.ts`. `CheckoutErrand` extends #7's `ErrandView` (`data/errands.api.ts`) with the fields below. #7's interface is not changed, and no second `ErrandView` is declared.

`CheckoutErrand` fields used by #8 (`GET /errands/:id`, `apps/api/src/errands/errands.service.ts` `ErrandView`):
```ts
interface CheckoutErrand extends ErrandView {     // ErrandView (#7): id, category, title, reference, status, createdAt, updatedAt, assignment
  readonly deadlineAt: string | null;
  readonly budget: string;               // item amount, decimal string
  readonly quotedPrice: string | null;
  readonly feeTotal: string | null;      // "Total (service + runner fee)", 2-decimal string, null until quoted
  readonly quoteExpiresAt: string | null;
  readonly quoteRequestedAt: string | null;   // row 68 open request
  readonly quoteAcceptanceRequired: boolean;  // ACCEPTED with an unaccepted re-quote (row 72)
  readonly merchantDetailsAvailable: boolean; // row 43
  readonly outsideServiceArea?: boolean;      // rows 236, 249 (b)
}
```
- **Merchant fields on the errand.** The errand view also carries `merchantName`, `merchantTillNumber`, `merchantPaybillNumber` and `merchantAccountReference`. Since PR #29 (issue #28, owner 2026-10-29) the server sends the three numbers as `null` to a customer until the errand's primary payment is `completed`. `merchantName` stays visible before payment (WQ-35), but #8 does not render it before payment either. **The web never reads any of the four from the errand view** (OA-5: Till/Paybill are shown only on `x-merchant-payment`, read from `GET /payments/:errandId`). `CheckoutErrand` does not declare them.

`Quote` (`GET /errands/:id/quote`): `{ id, errandId, total, currency, expiresAt: string | null, acceptedAt: string | null, createdAt, …components }`. #8 declares and reads `total`, `expiresAt` and `createdAt` only (OA-4: the components are not declared).

`PaymentSummary` (`GET /payments/:errandId`, `payments.service.ts` `listForErrand`; on a TIMEOUT payment the API first asks the provider, STK Query, row 52):
```ts
{
  payment: Payment | null;            // the main (service + runner fee) payment, newest
  transactions: PaymentTransaction[]; // not rendered; not declared beyond `unknown[]`
  stkStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | null;
  failureReason: string | null;       // provider reason, e.g. "Request cancelled by user"
  merchantDetailsAvailable: boolean;
  merchantPayment: MerchantPaymentView | null;
  differencePayments: DifferencePaymentView[]; // price-change differences, newest first
}
Payment = { id, errandId, serviceFee, runnerFee, merchantAmount: string;
  paymentFlow: 'merchant_direct' | 'customer_to_runner' | 'runner_advance' | 'platform_only';
  status: 'pending' | 'authorized' | 'completed' | 'failed' | 'refunded';
  priceChangeRequestId: string | null; createdAt: string }
MerchantPaymentView =
  | { route: 'merchant_direct'; amount: string; paidTo: 'merchant'; merchantName: string | null;
      tillNumber: string | null; paybillNumber: string | null; accountReference: string | null;   // null for a customer until the fees are paid (#28)
      merchantDetailsUpdatedAt: string | null; merchantDetailsChangedAfterPayment: boolean }
  | { route: 'send_to_runner'; amount: string; paidTo: 'nitume' }
DifferencePaymentView = { payment: Payment; transactions; stkStatus: StkStatus | null; failureReason: string | null;
  checkoutRequestId: string | null; merchantPayment: MerchantPaymentView | null }   // numbers null as above (#28)
```

`InitiateResult` (`POST /payments/:errandId/initiate`): `{ payment, failureReason, merchantDetailsAvailable, reference, checkoutRequestId, transactions, stkStatus, merchantPayment }`. On a stored payment `checkoutRequestId` is `'PAID' | 'FAILED' | 'PENDING'`. Since #28, `merchantPayment` numbers are null on the customer's initiate and replay until the fees are paid.

`PriceChangeRequest` (`GET /errands/:id/price-change?status=requested`, array, newest first): `{ id, errandId, fromPrice, toPrice, reason: string | null, status: 'requested' | …, createdAt }`. `PriceChangeDecision` (approve / reject) = the request + `{ differencePayment: DifferencePaymentView | null; refundReview: { status, … } | null }`.

`PaymentMethod` (`GET /customers/me/payment-methods`): `{ id, type: 'mpesa', label, detail, phoneNumber: string | null, isDefault }` (OA-10: M-Pesa only). `SessionStore.user().phone` is the payer fallback (OA-21). `GET /errands/defaults` → `{ defaultDeadlineHours, defaultDeadlineStartsAt }` through #7's `CustomerErrandsApi.defaults()` (not a second call site).

Dates arrive as ISO strings. Views parse them where they compare or format them. Amounts stay strings.

### A§6 Endpoints and error codes used by #8 (all exist on `origin/main`)

One service, **`CheckoutApi`** (`app-area/customer/data/checkout.api.ts`, `providedIn: 'root'`, `HttpClient` only, no `withCredentials`, no extra interceptor), wraps every call below except `GET /errands/defaults` (#7's `CustomerErrandsApi.defaults()`) and `GET /errands?status=…` (#7's `CustomerErrandsApi.list()`). Errors are read with #7's **`apiErrorOf`** (`data/errands.api.ts`): classify by `code`, never by `message`, and never render `message` (F§3).

| Call | Used by | Success | Error codes the views handle (409 unless noted) |
|---|---|---|---|
| `GET /errands/:id` | all | `CheckoutErrand` | 403/404 → load error |
| `GET /errands/:id/quote` | quote | `Quote` | 404 → load error |
| `POST /errands/:id/quote/accept` (no body) | quote | 200 `{ errand, quote }`; idempotent; on ACCEPTED it accepts a re-quote (row 72) | `quote_expired`, `quote_not_acceptable`, any other 409 → reload + A§2 |
| `POST /errands/:id/quote/request` | quote | 200 errand view with `quoteRequestedAt` | `quote_request_pending` → treat as success (re-read the errand, core parity); `quote_still_valid` → reload to checkout; `quote_request_not_allowed` → reload + A§2 |
| `PATCH /errands/:id { deadlineAt: ISO \| null }` | quote (deadline panel) | 200 errand view | `deadline_not_editable` → close the panel, reload + A§2; 400 `deadline_in_past`, 403 `deadline_customer_only`, network → stay, panel error |
| `PATCH /errands/:id/status { to: 'CANCELLED' }` | quote | 200 `{ errand, … }` | `illegal_transition` → reload + A§2; other → toast |
| `GET /customers/me/payment-methods` | quote, payment | `PaymentMethod[]` | failure → treated as `[]` (Flutter parity) |
| `POST /payments/:errandId/initiate { merchantRoute?, paymentMethodId? }` + header `Idempotency-Key` | payment | 201 `InitiateResult` | `quote_expired`, `quote_not_accepted`, `deadline_passed_before_payment`, `errand_not_payable`, `idempotency_key_reused`; 400 `merchant_route_required`, `merchant_details_missing` (409), `errand_not_quoted`, `payment_method_invalid`, `idempotency_key_invalid` |
| `GET /payments/:errandId` | payment, item payment | `PaymentSummary` | 403 → load error |
| `POST /payments/:errandId/price-changes/:requestId/initiate` (no body) | item payment | `DifferencePaymentView` (pending or paid returned as is) | 404, `difference_not_stk` → toast `friendlyError` |
| `GET /errands/:id/price-change?status=requested` | price auth | `PriceChangeRequest[]` (first = pending) | failure → dialog load error |
| `POST /errands/:id/price-change/:requestId/approve { merchantRoute? }` | price auth | `PriceChangeDecision` | 400 `merchant_route_required`, 409 `merchant_details_missing` → route rows; `price_change_already_decided`, `price_change_not_in_progress`, `price_change_not_allowed`, any other 409 except `price_change_reject_not_cancellable` → already answered |
| `POST /errands/:id/price-change/:requestId/reject` | price auth | `PriceChangeDecision` (errand CANCELLED, refund review) | `price_change_reject_not_cancellable` → inline error; `price_change_already_decided` → already answered |
| `GET /errands/defaults` (#7 `CustomerErrandsApi.defaults()`) | quote (deadline panel) | defaults | failure → caption hidden |
| `GET /errands?status=IN_PROGRESS` (#7 `CustomerErrandsApi.list()`) | price-change watcher | `{ items, nextCursor }` | failure → silent |

`Idempotency-Key` is set only on the main initiate.

### A§7 Live data (K§6; rows 23, 29, 43, 68, 72, 80, 248)

- `RealtimeService.joinErrand(errandId)` on load, `leaveErrand` on destroy. The router destroys the previous #8 page before it creates the next, so the same room is never held twice by #8. The realtime service keeps rooms in a set, not a count. Track (#9) changes that (#9 spec T§7); #8 does not.
- Events used:
  - `errand:status_changed` (all views);
  - `quote:reissued` and `quote:requested` (quote);
  - `merchant_details:updated` (quote, item payment) and `merchant_details:changed` (item payment). These are used only as a signal to re-read. Since #28 their numbers are null for a customer before the fees are paid, and #8 never reads them either way;
  - `price_change:requested` (watcher, `v-price-auth`);
  - `price_change:difference_paid` (row 248; item payment variant B → re-read at once; web adaptation, faster than the next poll);
  - `errand:access_revoked` (→ reload; the A§2 read then shows the load error).
- **Reconnect.** On every transition to `connected`, refetch the snapshot once (K§6.5). Views use #7's `RealtimeService.onStateChange(listener, destroyRef)` (NC§W9a). No `effect()` and no `toObservable` (WQ-33).
- STK results for the main payment have no socket event (a FAILED or TIMEOUT changes no errand state). So `v-payment` and `x-merchant-payment` variant B poll `GET /payments/:errandId` whether or not the socket is connected (mobile spec, accepted 2026-10-09). `errand:status_changed` to PAYMENT_CONFIRMED still ends `v-payment` at once.
- **Background tabs (web adaptation)**: every timer-driven poll in #8 runs only while `document.visibilityState === 'visible'` (the app's `isRouteVisible`). On `visibilitychange` → `visible` (a `document:visibilitychange` host listener, WQ-33), the view checks once at once and resumes its schedule. Socket events are handled while hidden. Timers live in the component and stop on destroy.
- Polling cadence:
  - quote: every 15 s, only while the socket is not `connected` (K§6.5);
  - payment and variant B: every 5 s for the first 2 min after the payment's `createdAt`, then every 30 s, stopping 10 min after `createdAt`. Manual checks and socket events still work after that.
- **Clock.** Every "now" in #8 (quote expiry, the deadline rules, the poll schedule, `formatDayTime` relative days) comes from #7's `CUSTOMER_NOW` token (`app-area/customer/clock.ts`), so tests inject a fixed time.
- **Timers (builder seam, accepted at re-audit 1).** Every #8 timer (polls, the 30 s expiry tick, the 1.5 s SUCCESS delay) goes through `CHECKOUT_TIMERS` (`app-area/customer/checkout/checkout-timers.ts`, `providedIn: 'root'`). Its default runs `setTimeout` outside the zone and re-enters it to update the view, as Home's poll does. Tests replace it with a step-able fake that shares one clock with `CUSTOMER_NOW`. It is the same kind of seam as `CUSTOMER_NOW` and `HOME_POLL_MS`, and adds no framework feature.

### A§8 Components

**Reused unchanged** (do not build a second one):
- Kit (#5): `nm-button`, `nm-card`, `nm-form-card`, `nm-status-chip` (`customerStatus`), `nm-notice`, `nm-error-state`, `nm-skeleton-card`, `NmDialogService` (+ `confirm()`), `NmPanelService`, `NmToastService` (`show(msg, { offset })`), `nmNum`, the format pipes and functions (`formatKes`, `formatAmount`, `kesSpoken`, `formatClock`, `formatDayTime`, `formatDeadlineEat`, `formatPhoneIntl`), `friendlyError`, `RealtimeService`.
- #6: `nm-pushed-header`, `nm-back-button`, `nm-icon`, `focusPageHeading`, `SessionStore`.
- **#7 (NC§W9a, §W9b, §W1, §W5):**
  - `nm-fixed-cta` + `NmFixedCtaOffset` (`shared/ui/fixed-cta/`). Toasts shown by a page with a fixed CTA pass `{ offset: offsets.toastOffset() }`;
  - `nm-choice-chip` + `nm-choice-chip-group` (`shared/ui/choice-chip/`). The group's **`disabled` input** is used for the saving state of the deadline panel;
  - `nm-receipt-row`, `nm-receipt-caption`, `nm-receipt-group` (`shared/ui/receipt/receipt.component.ts`);
  - `customerLinks`; `apiErrorOf`, `API_V1`, `CustomerErrandsApi` (`defaults`, `list`); `RealtimeService.onStateChange`; `CUSTOMER_NOW`;
  - `formatHours` (Flexible caption, as ND); `nmTemplateOutlet`; `mediaQuery(NM_BP_MD_QUERY)`;
  - the deadline helper `deadlineAt(choice, now)` (#7 `task-draft.store.ts`, WQ-2). #8 **moves** it, with its `DeadlineChoice` type, to `app-area/customer/deadline.ts` and adds `deadlineChoiceOf(deadlineAt, now)` there. `task-draft.store.ts` imports it from there and re-exports it, so the #7 tests pass unchanged. This is a move, not a second copy.

**Kit additions made by #8** (additive; #5, #6 and #7 defaults and tests unchanged; no new colour, no new type style):

| Addition | Where | Value | Used by |
|---|---|---|---|
| `nm-icon` entries `phone`, `check` | `shared/ui/icon/icons.ts` | Material Symbols paths under the existing Apache-2.0 header (`phone` = `phone_iphone` outline; `check`) | `nm-stk-status` |
| WQ-33 conversion of `nm-panel` | `shared/ui/overlay/panel.component.ts` | `NgTemplateOutlet` → `nmTemplateOutlet`; the two `viewChild` queries → an `ElementRef` lookup (`host.querySelector('.nm-panel')`, `'.nm-panel__title'`), exactly as #7 did for `nm-dialog` (NC§W9a last row). Rendered markup, focus and the #5 panel tests unchanged | deadline panel |
| `addKes`, `subtractKes`, `compareKes`, `isPositiveKes` | `shared/format/formatters.ts` | A§4 | all #8 views, #9 |
| `nm-active-task-card` output `followed` | `shared/ui/active-task-card/active-task-card.component.ts` | Emitted only when the card follows its link in-app (the `followInAppLink` test: plain left click, no modifier), **before** the router navigates. No emission for a modified or middle click | Home `Pay now →` intent (below) |
| `followInAppLink(event, url, router, beforeFollow?)` (re-audit 1) | `shared/ui/links.ts` | Optional fourth argument, called only when the link is followed in-app, after `preventDefault()` and before `navigateByUrl`. Without it the function behaves exactly as before | `nm-active-task-card` `followed` |
| `formatDeadlineEat(date, now, { hour24 })` (owner Q8-3) | `shared/format/formatters.ts` | Optional third argument; `hour24: true` → `Today, 23:59`. Default unchanged (12-hour) | `nm-deadline-line` |

In-between Flutter text styles use the `nm-type` overrides the mixin offers (NC§W9a precedent): the 17/700 headings = `nm-type(dialog-title, $weight: 700)`; receipt rows as #7 built them; the 12.5 slate-600 lines = `nm-type(resend)`; the Copy-row label = `nm-type(field-label, $weight: 400)`; the Copy-row text value = `nm-type(body-lg, $weight: 600)`.

**New shared components, kit level** (`shared/ui/<folder>/`, standalone, OnPush, signal inputs, styles in a `styleUrl` `.scss` file, colours only through `--nitume-*`, focus ring `nm-focus-ring`; ports of named Flutter widgets, so no new pattern):

| Web component | Folder | Flutter counterpart | Spec |
|---|---|---|---|
| `nm-radio-row` | `radio-row/` | C-16 radio-row variant `NitumeRadioRow` (`nitume_choice_chip.dart`) | Full-width pill (r-pill), min-height 48, padding 10px 16px, 1px border. Unselected: slate fill, slate-line border, label `chip` (12/600) blue, subtitle `muted-sm` (11.5) slate-600. Selected: blue fill and border, label and subtitle **white**. Disabled: slate fill, label and subtitle slate-400, not clickable, `aria-disabled`. A native `<input type="radio">`, visually hidden, inside a `<label>`, so arrow keys move within the group; focus ring on the row. Accessible name `label. subtitle`. (Not the #7 `nm-choice-chip`: a full-width two-line row, as the app's separate widget) |
| `nm-payment-method-card` | `payment-method-card/` | C-30 `PaymentMethodCard` (`task_rows.dart`) | White row, padding 14px 15px, r-m, 1px slate-line. A 38×26 badge (green fill, radius 5px, `M-PESA` in `tag` 10/700 **white**; the M-Pesa brand badge as built and audited in the app); 12px gap; label `row-title` + detail in `nmNum` `meta` (Code 11 slate-600); optional trailing slot. **Also needed by #12** |
| `nm-copy-row` | `copy-row/` | C-39 `CopyableValueRow` | `customer-x-merchant-payment.md` §Components |
| `nm-pulsing-dots` | `pulsing-dots/` | `PulsingDots` (`brand.dart`) | Three 7px slate-400 dots, gap 6px, opacity pulse 1.2 s, staggered 0.2 s (CSS keyframes, no JS timer); `role="status"` with the given `label` (visually hidden); static under `prefers-reduced-motion` |

**New components, customer level** (`app-area/customer/shared/`, NEW #8; the Flutter `apps/customer_app/lib/src/widgets/…` level; reused by #9; same rules):

| Web component | Flutter counterpart | Spec |
|---|---|---|
| `nm-task-summary-card` | app `TaskSummaryCard` (`task_widgets.dart`) | `nm-card` (padding 16): optional status chip (`showChip`), 10px; title `card-title` (`title`, else the category display name, row 41); 4px; meta line in `nmNum` `meta-lg` (the whole line in Code 12 slate-600) `#NT-10482 · Today, 10:03 AM` (`#` + `reference` · `formatDayTime(createdAt, now)`, local time, WQ-2); optional footer slot. #9 adds inputs to it (#9 spec T§7) |
| `nm-deadline-line` | app `DeadlineLine` (`deadline_widgets.dart`) | Footer of the summary card: 12px, hairline, 10px; row `Deadline` (`row-title`) + optional trailing `nm-button` link small `Change`; 4px; the deadline (**WQ-2, EAT, labelled; owner Q8-3: 24-hour**): `<span nmNum>` `formatDeadlineEat(deadlineAt, now, { hour24: true })` `</span>` + ` EAT` in `meta-lg` Sans slate-600 (e.g. `Today, 23:59 EAT`). No deadline: `No deadline yet. It starts when your payment is confirmed.` in `muted` Sans |
| `DeadlinePanelComponent` (content of the deadline panel) | app `showDeadlineSheet` (`deadline_sheet.dart`) | Hosted by `NmPanelService` (WQ-3), §States "Deadline panel". Uses `nm-choice-chip-group` (#7) |
| `nm-merchant-route-rows` | app `MerchantRouteRows` | Two `nm-radio-row`s in a `role="radiogroup"`, gap 8, exact copy in §Copy. Inputs `selected`, `merchantDetailsAvailable`, `disabled`; output `selectedChange`. Used here and in `v-price-auth` |
| `nm-stk-status` | app `StkStatusView` (`widgets/stk_view.dart`) | `customer-v-payment.md` §Layout. One component for `v-payment` and `x-merchant-payment` variant B (never two copies) |

**View code** (`app-area/customer/checkout/`, NEW #8): `awaiting-quote.page`, `payment.page`, `merchant-payment.page`, `price-change-dialog.component`, `price-change.watcher.ts`, `checkout-intent.store.ts`, `payment-attempt.store.ts`, `checkout-routing.ts`. Data: `app-area/customer/data/checkout.api.ts`. Deadline helpers: `app-area/customer/deadline.ts`.

**Changes to #7 code made by #8** (the builder is `web-parity` for both; the #7 tests stay green, and one is added):
- `customer.routes.ts`: the two #8 stubs replaced, `item-payment` added (A§1); the price-change watcher provided on the customer shell route (`customer-v-price-auth.md` Entry).
- `customer-links.ts`: `itemPayment(id)` added.
- `home/home.page`: on the active card's `followed` output for an ACCEPTED errand, `CheckoutIntentStore.set(id, {})` (removes the `// #8 adds the checkout intent to this link.` comment in `home-tasks.ts`). Ctrl/Cmd-click, middle click and "open in new tab" set nothing (WQ-28).
- `task-draft.store.ts`: imports `deadlineAt` from `app-area/customer/deadline.ts` (move above).

### A§9 Needs from other agents

- **api-contract (privacy, OA-5): closed by PR #29 (issue #28, merged `5f0ab08`).** For the customer role the server now sends `merchantTillNumber` / `merchantPaybillNumber` / `merchantAccountReference` as null on every errand response, on `GET /payments/:errandId` `merchantPayment` (+ each difference), on initiate (incl. replay) and price-change approve/retry, and in both `merchant_details` socket events, until the primary payment is `completed`. #8 relies on the server for this. The client render rule in `customer-x-merchant-payment.md` stays as defence in depth; it is not the only guard. Open follow-up on the API side, not blocking #8: PR #29 minor note 1 (`merchantNumbersVisible` in `payments.service.ts` uses "any role except customer" while errands and sockets use a runner/admin allow-list).
- **api-contract (open since the mobile spec)**: `merchantPayment.amount` for `merchant_direct` is the main payment's original `merchantAmount`. It should be the **outstanding** item amount after approved price changes (`customer-x-merchant-payment.md` Data). Until then the web shows the API value (parity with the app).
- **api-contract (open since the mobile spec)**: a "merchant details added" notification type (`v-notifications`). The live refresh works today through `merchant_details:updated`.
- **#12 ordering**: `nm-payment-method-card` is built here once (#12 reuses it). `Change` on `Pay with` opens #12's `v-payment-methods` in select mode. While #12 is not merged, `Change` is not rendered (the server already falls back to the default method, then the sign-in phone, OA-21), and #12 adds it.
- **#7: closed.** `nm-fixed-cta`, `nm-choice-chip` and the receipt parts are built by #7 and reused here. `v-new-review` `Submit task →` already navigates to `awaitingQuote(id)` with `replaceUrl` (`new-review.page.ts`). Home's `View request` / `Review quote →` already target `awaitingQuote(id)`. Home's `Pay now →` targets `payment(id)`, and #8 adds the intent (A§8).
- **#9**: Task detail `Pay now` sets the A§3 intent; Track's `Pay the item amount` notice and `Price change` button open the #8 views; #9 reuses `nm-task-summary-card`, `isPositiveKes` / `addKes`, the price-change dialog (#9 spec T§7).
- **#11**: notification deep links: `errand.QUOTED` and `quote.reissued` → `…/quote`; payment failed → `…/payment` (no intent, so no automatic push, WQ-28); merchant details added / `merchant_details.changed` → `…/item-payment`; price change requested → Track for the errand, then the watcher opens the dialog.

### A§10 Owner decisions applied, and questions

| Board id | Spec id | Decision (owner) | Where |
|---|---|---|---|
| WQ-27 | Q8-1 | The item amount is never folded silently into a fee figure and always has its own line. The row-34 fee total and the row-76/91 charge with its `Includes` line stay. Service fee, runner fee and merchant payment stay separate records in code and data (2026-10-28) | A§4; tests A.T7, XQ T5–T7, VP T9, MP T3, PA T14 |
| WQ-28 | Q8-2 | No automatic STK prompt after a reload, link or second tab; the duplicate-charge key in memory only (2026-10-28) | A§3; `customer-v-payment.md` Entry decision; tests VP T11, T12, T15, A.T3, A.T4, A.T8 |
| WQ-2, WQ-53 | — | Activity times use the browser's local time. Deadlines use EAT and are labelled as EAT; the caption is exactly `Due today, 23:59 EAT.` / `Due tomorrow, 23:59 EAT.` (2026-10-29) | `nm-deadline-line`; deadline panel; `Valid until`, `Requested …`, the details-changed time and the summary meta stay local |
| WQ-34, WQ-33 | — | Marketing initial bundle ≤ 360 kB raw; signed-in code stays lazy with the #6 static checks; the WQ-33 framework rules (2026-10-29) | A§11 |
| WQ-35 | — | The merchant name stays visible before payment (API) | A§5 (the web still shows it only on `x-merchant-payment`) |

| Q8-3 (board number to be assigned by the orchestrator) | Q8-3 | The checkout deadline line is 24-hour: `Today, 23:59 EAT`, matching the WQ-53 caption (2026-10-29) | `nm-deadline-line`; XQ T19 |

Inherited, unchanged: mobile `x-awaiting-quote` Q2 (route fixed once the fees are paid; build default: no change after payment) and mobile `x-merchant-payment` Q1 (no "I've paid the merchant" confirmation; build default: `Done` only closes).

### A§11 Bundle and framework rules for #8 code (owner WQ-34 and WQ-33)

NC§W10 applies to #8 code word for word. "#8 code" = every file #8 adds or changes, **plus every kit file a #8 route component, the price-change dialog or the watcher reaches through static imports** (at least `shared/ui/overlay/{panel,dialog}.component.ts`, `shared/ui/{card,notice,states,status-chip,button,receipt,choice-chip,fixed-cta,pushed-header,back-button,icon}/*`, `shared/format/*`).
1. **Size (WQ-34, hard cap).** `cd apps/website && npx ng build` "Initial total" ≤ **360.00 kB raw**. The PR body reports raw and transfer next to the #7 figure (354.17 kB raw / 96.92 kB transfer at `6338a75`); the headroom is 5.83 kB. Crossing the cap is not fixed by raising it: it goes to the owner.
2. **Eager graph.** Nothing from `core/auth/**`, `core/realtime/**`, `app-area/**`, `shared/ui/**` or `shared/places/**` is statically reachable from `src/main.ts`. The #8 routes are reached only through `loadComponent`. The watcher is provided on the customer shell route, never in `app.config.ts`.
3. **Framework features.** #8 code uses none of `effect()`, `afterNextRender` / `afterRender`, `viewChild` / `viewChildren` / `contentChild(ren)`, `NgTemplateOutlet` / `[ngTemplateOutlet]`, `ReactiveFormsModule` / `FormControl` / `FormGroup`, `FormsModule` / `ngModel`, `toObservable`, `withComponentInputBinding`. Allowed: signals, `computed`, `linkedSignal`, `toSignal`, `nmTemplateOutlet`, `NgComponentOutlet` (already in `nm-dialog`), `ElementRef` + `querySelector` (focus moves after a state change use `setTimeout(() => host.querySelector(…)?.focus())`, the #7 `new-review.page.ts` precedent), `RealtimeService.onStateChange`, `document:visibilitychange` host listeners, route snapshot and navigation-state reads.
4. **Imports.** Kit pieces from their own files, never from the `shared/ui` or `shared/map` barrels. `@angular/google-maps` is not imported.
5. **Style files.** No `@use`, `@include`, `@mixin` or `$` variable in inline `styles` (F9.60).
6. **Static spec.** #7's `src/styles/customer-static.spec.ts` is extended, not copied: its directory list gains `shared/ui/{radio-row,payment-method-card,copy-row,pulsing-dots}` (`app-area/customer` is already listed), its changed-files list gains `shared/ui/overlay/panel.component.ts`, `shared/ui/active-task-card/active-task-card.component.ts` and `shared/ui/icon/icons.ts` (already listed), and its entry list gains the three #8 pages, `price-change-dialog.component.ts` and `price-change.watcher.ts`. Checks (a)–(f) then run over #8 code unchanged.

### A§12 Foundation tests (Vitest; cited as A.Tn)

1. **Routes**: the three #8 routes resolve to their components lazily with the A§1 `title`, `navKey` and `pushed`; `tasks/:errandId/quote` and `/payment` no longer load `ViewStubComponent`; the #9/#10/#11 stubs are unchanged. `customerLinks.itemPayment('a/b')` → `/app/customer/tasks/a%2Fb/item-payment`, and every `customerLinks` #8 path is recognised by the router (extends #7's NC§W9.11 case).
2. **`checkoutRedirect`** table-driven over all 17 `ERRAND_STATUSES` × the three views, exactly A§2; an unknown string → load error.
3. **`CheckoutIntentStore`**: `take` returns the intent once and then `null`; intents are per errand; nothing written to `localStorage`, `sessionStorage` or `history.state`.
4. **`PaymentAttemptStore`**: `keyFor` stable within the tab; `newAttempt` gives a different key; keys match `^[A-Za-z0-9_-]{8,128}$`; with `crypto.randomUUID` absent the fallback still matches; no storage writes.
5. **`CheckoutApi`**: each method's method, URL (ids encoded) and body; `Idempotency-Key` header only on the main initiate; no `withCredentials`; `paymentMethods()` failure → `[]`; errors surface as `apiErrorOf` codes.
6. **Money helpers**: `addKes('2200.00', '40000.00')` → `'42200.00'`; `addKes('0.10', '0.20')` → `'0.30'` (no float drift); `subtractKes('45000', '40000.00')` → `'5000.00'`; negative results; `compareKes`; `isPositiveKes('0.00')` false; `addKes('99999999999.99', '0.01')` exact; a non-numeric string throws.
7. **WQ-27 money rule, across the four views** (fixtures with `serviceFee: '440.00'`, `runnerFee: '660.00'`, fee total `'1100.00'`, item `'40000.00'`):
   - (a) every rendered item amount > 0 has its own row or line (checkout `Item amount` row, `Includes KSh 40,000 …`, the merchant page `Amount`, the difference line);
   - (b) the only amounts on any screen that combine flows are the row-34 `Total (service + runner fee)` row and the row-76/91 send-to-runner charge, and the latter appears on `v-payment` only together with its `Includes` line and on the checkout only with the `Item amount` row on screen;
   - (c) with `merchant_direct` no rendered amount equals fees + item (`KSh 41,100` absent);
   - (d) `Service fee` / `Runner fee` text and the six quote component values never render, even when present in the response;
   - (e) the initiate request body has no amount field (only `merchantRoute?`, `paymentMethodId?`);
   - (f) the price-change dialog and the merchant page render no fee figure.
8. **Home `Pay now →` intent (#7 code)**: a plain left click on an ACCEPTED active card sets `CheckoutIntentStore` for that errand before navigating; a Ctrl/Meta click sets nothing; `nm-active-task-card` emits `followed` only when it follows in-app (the #7 card tests pass unchanged).
9. **Kit additions**: `phone` and `check` icons render; the converted `nm-panel` keeps its #5 tests passing unchanged and contains no `NgTemplateOutlet` / `viewChild`.
10. **`nm-pulsing-dots`**: three dots, `role="status"` with the label; static under reduced motion.
11. **`nm-radio-row`**: unselected, selected (blue fill and border tokens, **white** label and subtitle), disabled (slate-400, `aria-disabled`, no change on click); arrow keys move within a group; accessible name `label. subtitle`; 48px min height.
12. **`nm-payment-method-card`**: badge `M-PESA` white on the green token; label and the detail in `nmNum`; trailing slot projected.
13. **`deadline.ts`**: `deadlineAt` cases moved with it pass unchanged; `deadlineChoiceOf` maps 23:59 EAT today → `today`, tomorrow → `tomorrow`, `null` → `flexible`, any other time → `null`, identical under `TZ=Europe/London` and `TZ=Africa/Nairobi` (or with the zone-independent clock).
14. **Static (A§11, extended `customer-static.spec.ts`)**: checks (a)–(f) over the #8 file set; the scope test lists the #8 pages, dialog, watcher, stores, API, the four kit folders and the two changed kit files.
15. **Build (A§11 item 1)**: not a Vitest case. The PR body pastes `npx ng build` "Initial total" ≤ 360.00 kB raw.

---

## Purpose
One page per errand with two main states plus three variants (mobile spec):
- **Waiting** (REQUESTED): the final quote is being prepared.
- **Checkout** (QUOTED, or ACCEPTED re-entry): show the final quote, let the customer choose how the item amount is paid (if any) and which M-Pesa number to charge, then accept and go to payment (the accept-quote step).
- **Quote expired** (QUOTED/ACCEPTED, expired): `Request a new quote` (row 68).
- **New quote requested** (QUOTED/ACCEPTED with an open request): waiting layout (row 68).
- **Outside every service area** (REQUESTED, or QUOTED/ACCEPTED with an expired quote, flag set; rows 236, 249 (b)).

## Entry / exit
- Entry:
  - `v-new-review` `Submit task →` (#7, `replaceUrl`);
  - Home active card `View request →` (REQUESTED) / `Review quote →` (QUOTED) (#7);
  - Task detail for REQUESTED/QUOTED (#9);
  - notification `errand.QUOTED` / re-quote (#11);
  - `v-payment` sending the customer back (expired quote, passed deadline, route required, re-quote to accept, or no payment after a reload, WQ-28).
- Exits:
  - Back (`nm-back-button`, or browser Back) → previous page; fallback `customerLinks.home()`.
  - `Back to Home` → `customerLinks.home()`.
  - Checkout CTA → accept if needed → `CheckoutIntentStore.set(…)` → navigate to `customerLinks.payment(id)` (push, not replace, so Back returns here as in the app).
  - `Change` on `Pay with` → #12 select mode (A§9); not rendered until #12.
  - `Cancel task` / `Decline and cancel task` → confirm dialog → CANCELLED → `customerLinks.home()` (`replaceUrl`) + toast `Task cancelled.`
- Status routing on load and on every refresh: A§2.

## Task states
- Shown in: REQUESTED (waiting, or outside-area); QUOTED (checkout, expired, new quote requested, outside-area once expired); ACCEPTED (checkout re-entry, expired, new quote requested, outside-area once expired).
- Transitions fired here: QUOTED → ACCEPTED (customer, through `POST …/quote/accept`); REQUESTED / QUOTED / ACCEPTED → CANCELLED (customer, §3.3).
- An expired quote, a request for a new quote, an admin re-quote and a deadline change change no state (rows 46, 68, 72, 242).
- Chips only through `customerStatus()`: REQUESTED `Awaiting quote`, QUOTED `Quote ready`, ACCEPTED `Awaiting payment` (pending tone).

## Layout (web)

Frame (all states): `nm-pushed-header` title `Your quote` (`h1`, `pushed-title`), back button. Content column:
- Below 768px: full width, 20px side padding. Cards span the column; the app's `0 20` card margins become the column padding.
- From 768px (web adaptation): a single column, `max-width: 560px`, centred in the shell content area. The checkout state from 1024px is the exception (below).
- Vertical gaps between cards: 14px (app margin-bottom 14).

### Waiting state (REQUESTED)
1. 32px top space; `nm-pulsing-dots` label `Waiting for your quote`, centred; 20px.
2. Heading `Preparing your quote`, 17/700 blue (`nm-type(dialog-title, $weight: 700)`), centred; 8px.
3. Body `muted` (13 slate-600), centred, `max-width: 260px` centred; 22px.
4. `nm-task-summary-card` with chip `Awaiting quote`.
5. Button stack, gap 10. Full column width below 768px; `max-width: 320px` centred from 768px (web adaptation). Outline `Back to Home`; text button `Cancel task`, destructive (red label, OA-13).

### New quote requested (QUOTED/ACCEPTED, `quoteRequestedAt` set and later than the newest quote's `createdAt`)
Same as Waiting, with these differences:
- dots label `Waiting for your new quote`;
- heading `Preparing a new quote`;
- body `You asked for a new quote. We'll notify you when it's ready.`;
- 6px under the body, a meta line `Requested ` + `formatDayTime(quoteRequestedAt, now)` (local time, WQ-2), the whole line in `nmNum` `meta-lg` (Code 12 slate-600), centred;
- the summary card has **no** chip;
- same buttons, and no `Request a new quote` here.

### Outside every service area (rows 236, 241, 249 (b))
Shown when `outsideServiceArea === true` **and** either the status is REQUESTED, or it is QUOTED/ACCEPTED with an expired quote by the §States test.
- A valid or expiry-less quote with the flag set shows checkout (row 249 (b)). The client checks too, so a stale flag never hides a payable quote.
- This state replaces the expired checkout and the new-quote-requested state.
- Layout: no dots. Heading `We can't take this task` (in a `role="status"` live region); body `Its location is outside the areas we serve. You can cancel it; you haven't paid anything.`; summary card with a chip only when REQUESTED; buttons **primary** `Cancel task` first, then outline `Back to Home`.

### Checkout state (QUOTED, ACCEPTED re-entry)
Top to bottom (single column below 1024px):
1. `nm-task-summary-card` with the status chip (`Quote ready` / `Awaiting payment`) and the `nm-deadline-line` footer. `Change` is shown unless the deadline has passed, a call is in flight, or the panel is open.
2. `nm-form-card` `Final quote`: one `nm-receipt-row` (#7) `Total (service + runner fee)` with `isTotal` and the fee total (A§4), `amountLabel` = `kesSpoken(total)`. Under it, `nm-receipt-caption` (#7) `Valid until ` + `<span nmNum>` `formatClock(expiresAt)` (local time, WQ-2). The caption is hidden when the quote has no `expiresAt` (row 83).
3. Only when the item amount > 0 and the category is Buy For Me or Get It For Me (row 80): `nm-form-card` `How should this be paid?` holding `nm-receipt-row` `Item amount` (plain) with `errand.budget`, then `nm-receipt-group` (#7: the hairline and 10px) holding `nm-merchant-route-rows`.
4. `nm-form-card` `Pay with`: `nm-payment-method-card` of the selected method (label, masked `detail`). Without a saved method: label `M-Pesa`, detail = the sign-in phone masked `+254 712 ••• 678`, and 6px under the card `Your sign-in number` (`muted-sm`). Trailing `nm-button` link `Change` only when the customer has saved M-Pesa methods and #12 is merged (A§9).
5. CTA in **`nm-fixed-cta`** (#7): primary `Confirm & pay ` + `<span nmNum>` `formatKes(charge)` + ` →` (A§4 charge rule); `Confirm & pay →` when no fee total is known. Below 768px the bar is fixed (#7 behaviour); from 768px it is inline 16px below the last card, as #7 built it.
6. Text button `Decline and cancel task`, destructive, centred, margin `4px 0 20px`.

From 1024px (web adaptation, "uses the width sensibly"): a two-column grid, `grid-template-columns: minmax(0, 1fr) 360px`, gap 24px, `max-width: 960px`, centred.
- Left: items 1–3.
- Right (`position: sticky; top: 24px`): item 4, the state notice (expired / deadline passed, below), item 5 (inline, full width) and item 6.
- DOM order equals the reading order above (left column first), so keyboard and screen-reader order match the single-column layout.
- The breakpoint is a CSS media query (`nm-up($nm-bp-lg)`, in the page `.scss`); no JS breakpoint read is needed.

## Copy (exact; mockup wording marked, the rest as built from the mobile spec)
- Header: `Your quote`.
- Waiting: `Preparing your quote`; `We're pricing your task. This usually takes a few minutes, and we'll notify you when it's ready.`; buttons `Back to Home`, `Cancel task`.
- New quote requested: `Preparing a new quote`; `You asked for a new quote. We'll notify you when it's ready.`; `Requested 4:45 PM` style (`formatDayTime`, local).
- Outside area (owner copy, row 241): `We can't take this task`; `Its location is outside the areas we serve. You can cancel it; you haven't paid anything.`
- Cards: `Final quote`; `How should this be paid?` (mockup); `Pay with`. Rows: `Total (service + runner fee)` (mockup), `Item amount`. Captions `Valid until 4:30 PM` / `Expired at 4:30 PM`.
- Routes:
  - `Pay merchant directly (recommended)` (mockup), with subtitle `You'll see the merchant's Till or Paybill number after paying the fees.` (details available), or `Available once the merchant's details are added.` (details pending, disabled).
  - `Send purchase amount to runner` (mockup), with subtitle `You'll pay this amount to Nitume by M-Pesa together with the fees, for your runner's purchase.` (row 76).
  - The mockup's third option `Let runner advance the purchase` is not shown (OA-5).
- Payer: `M-Pesa`, `Your sign-in number`, link `Change`.
- CTA (mockup): `Confirm & pay KSh 2,200 →`. Decline: `Decline and cancel task`.
- Cancel dialog (`NmDialogService.confirm`, destructive): title `Cancel this task?`; body `Nothing has been charged yet.`; confirm `Cancel task` (outline, red); cancel `Keep task` (primary).
- Expired: notice `This quote has expired. Ask for a new quote to continue.`; CTA `Request a new quote`; toasts `We've asked for a new quote.` / `Couldn't request a new quote. Try again.`
- Deadline (WQ-2, WQ-53):
  - notice `Your deadline has passed. Choose a new one to continue.`; CTA `Choose a new deadline`;
  - panel title `Deadline`; chips `Today`, `Tomorrow`, `Flexible`;
  - panel captions (#7's exact copy and markup): `Due today, ` + `23:59` (Code) + ` EAT.` while `Today` is the current choice; `Due tomorrow, ` + `23:59` (Code) + ` EAT.` for `Tomorrow`; for `Flexible`, `No fixed time. Your task's deadline is ` + `24 hours` (Code, `formatHours`) + ` after your payment is confirmed.`;
  - panel error `Couldn't change the deadline. Try again.`;
  - summary line `Today, 23:59 EAT` style (owner Q8-3), or `No deadline yet. It starts when your payment is confirmed.`
- Toasts: `Task cancelled.`; `Couldn't cancel the task. Try again.`; `Couldn't accept the quote. Try again.`
- Announcements (visually hidden `aria-live="polite"`): `Your quote is ready.` (REQUESTED → QUOTED while open); `Your new quote is ready.` (request answered).
- Load error: `Couldn't load this task.` + `Try again`.

## States
| State | Trigger | Behaviour |
|---|---|---|
| Loading | first load / `Try again` | Two `nm-skeleton-card`s under the header (app `SkeletonList`) |
| Load error | errand or quote read fails | `nm-error-state` `Couldn't load this task.`, `Try again` reloads |
| Waiting | REQUESTED | §Layout |
| Live quote | `errand:status_changed` or a poll shows QUOTED | Re-read errand + quote + methods, switch to checkout in place (150 ms fade; none under reduced motion), announce `Your quote is ready.` |
| Checkout | QUOTED / ACCEPTED, quote valid, no open request | §Layout. Default route: merchant-direct when `merchantDetailsAvailable`, else send-to-runner. Default payer: the `isDefault` method, else the first, else the sign-in phone |
| Merchant details arrive | `merchant_details:updated` or a refresh shows `merchantDetailsAvailable` true | The merchant-direct row enables in place; the customer's current selection does not change. The event's payload is not read (A§7) |
| Accepting | CTA | CTA `loading`; other actions disabled. QUOTED, or ACCEPTED with `quoteAcceptanceRequired` → `POST …/quote/accept`; ACCEPTED without it → no call. Then set the intent (route only when the item amount > 0) → `…/payment` |
| Accept: `quote_expired` | API | Expired state, no toast |
| Accept: other 409 | API | Reload, A§2 |
| Accept: other error | API / network | Toast `Couldn't accept the quote. Try again.` |
| Quote expired | See the trigger list below this table | Summary card without chip; `Final quote` stays, with caption `Expired at …`; route and `Pay with` cards hidden; `nm-notice` `This quote has expired. Ask for a new quote to continue.`; CTA `Request a new quote`; `Decline and cancel task` stays. A quote without `expiresAt` counts as valid (row 83) |
| Requesting a new quote | expired CTA | CTA `loading` → `POST …/quote/request`. Success or `quote_request_pending` → toast `We've asked for a new quote.`, reload → New quote requested. `quote_still_valid` → clear the expired flag, reload → checkout. `quote_request_not_allowed` → reload, A§2. Other → toast `Couldn't request a new quote. Try again.`, stay |
| New quote requested | `quoteRequestedAt` later than the quote's `createdAt` | §Layout. Ends on `quote:reissued`, `errand:status_changed` or a refresh showing a newer quote → checkout with the new figures and `Valid until`, announce `Your new quote is ready.` On ACCEPTED the chip reads `Awaiting payment` and the CTA accepts the re-quote before paying (row 72) |
| Outside area | flag + rule above | §Layout. `Cancel task` is the primary |
| Chosen deadline already passed (row 237) | Before payment, with `deadlineAt` non-null and before `now` (rows 239 (a), 240, 243), or arrival from `v-payment` with `{ deadlinePassed: true }` | Only when the quote is not expired (an expired quote is answered first). The CTA is replaced by `nm-notice` `Your deadline has passed. Choose a new one to continue.` + primary `Choose a new deadline`, which opens the deadline panel |
| Deadline panel | `Choose a new deadline` or `Change` (row 244) | See "Deadline panel" below this table |
| Cancelling | confirm dialog accepted | `PATCH …/status { to: 'CANCELLED' }`, the cancel button `loading`. Success → toast `Task cancelled.` + Home (`replaceUrl`). Failure → toast `Couldn't cancel the task. Try again.` |
| Reconnecting / socket down | K§6 | No line on this page; poll every 15 s while visible |
| Errand moved on | status PAYMENT_CONFIRMED or later, CANCELLED, EXPIRED … | A§2 routing, `replaceUrl` |

**Quote expired, triggers** (any one):
- `expiresAt` (errand `quoteExpiresAt`, else `quote.expiresAt`) has passed `now`, checked on load and while the page is open (every 30 s and on visibility);
- `quote_expired` from accept;
- arrival from `v-payment` with navigation state `{ quoteExpired: true }`.

**Deadline panel** (`NmPanelService.open(DeadlinePanelComponent, { title: 'Deadline', data })`: a bottom sheet below 768px, centred, max 560px, above it, WQ-3):
- **Chips.** `nm-choice-chip-group` (#7) with `Today`, `Tomorrow` and `Flexible`, wrapping with gap 8. `Today` is hidden once `now` ≥ 23:59 **EAT** of today's **EAT** date (`deadlineAt('today', now)`).
- **Current chip.** It is `deadlineChoiceOf(errand.deadlineAt, now)` (A§8, `app-area/customer/deadline.ts`): 23:59 EAT today/tomorrow → that chip; `null` → `Flexible`; any other time → none selected.
- **Captions.** The caption of the current choice shows under the chips (Copy; #7's `Due today, 23:59 EAT.` markup). `Flexible` shows the Flexible caption when `CustomerErrandsApi.defaults()` says `payment_confirmed`.
- **Saving.** Choosing a chip saves at once: `PATCH /errands/:id { deadlineAt }` with `deadlineAt(choice, now)`, which is 23:59 EAT of that EAT date sent as UTC ISO (e.g. `2026-11-01T20:59:00.000Z`), or `null` for `Flexible`. The browser's zone never changes the value (WQ-2). Choosing the already-current chip just closes the panel.
- **While saving.** The group's `disabled` input is set (#7), and `nm-pulsing-dots` with label `Saving` shows.
- **Results.**
  - Success → close, re-read the errand, clear the passed-deadline flag. The quote is kept (row 242).
  - `deadline_not_editable` → close, reload, A§2.
  - Any other failure → `nm-notice` danger `Couldn't change the deadline. Try again.` inside the panel.

## Numeric fields (Fira Code, `nmNum`)
- The reference `#NT-10482` and the created time (the whole summary meta line).
- The `Requested …` line.
- The `Valid until` / `Expired at` time.
- The deadline value in the deadline line (`Today, 23:59`; not the ` EAT` label).
- `23:59` in the panel captions.
- Every amount: the fee total, the item amount, and the amount inside the CTA.
- The masked phone in the payer card.
- The Flexible caption's `24 hours`.

## Data
- A§5 shapes, A§6 calls, A§7 live data. On load: `GET /errands/:id`; then, unless REQUESTED, `GET /errands/:id/quote` and `GET /customers/me/payment-methods` in parallel. The sign-in phone comes from `SessionStore.user().phone` (F§4.2).
- The route is sent to payment only when the item amount > 0; never `runner_advance` (OA-5).
- No merchant name or number is read or shown on this page (A§5, #28).
- Push/notifications: #11 (A§9).

## Accessibility and responsive
- `h1` = the header title; focus moves to it on arrival (`focusPageHeading`, F§7.3).
- The dots and state changes are announced (the live regions above); the outside-area heading is a live region.
- Route options: `role="radiogroup"` labelled by the card heading. The disabled merchant-direct row is `aria-disabled`, and its subtitle explains why.
- Every control is at least 48×48px. Destructive actions are red text only (no red fill, OA-13).
- No horizontal scroll at 360px: cards wrap, and the CTA label wraps onto two lines if needed. From 1024px, the two-column grid; the aside is sticky only when the viewport is at least 640px tall (otherwise static).
- Toasts sit above the fixed CTA below 768px (`NmFixedCtaOffset.toastOffset()`, #7).

## Required tests (Vitest; cited as XQ Tn)
1. Status routing (A§2): REQUESTED → waiting; QUOTED → checkout; ACCEPTED → checkout with chip `Awaiting payment`; PAYMENT_CONFIRMED → `/app/customer/track/:id` with `replaceUrl`; CANCELLED and EXPIRED → task detail; unknown status → load error.
2. Waiting copy, dots label, chip `Awaiting quote`; `Back to Home` → Home; `Cancel task` is a red text button.
3. Live switch: a fake `errand:status_changed` to QUOTED re-reads errand + quote and shows checkout; the live region says `Your quote is ready.`
4. Socket not connected → polls every 15 s only while visible (fake timers, stubbed `visibilityState`); connected → no polling; reconnect (through `onStateChange`) → one refetch.
5. **Fee total only (WQ-27)**: the `Final quote` card has exactly one amount row, labelled `Total (service + runner fee)`, showing `feeTotal` (fallback `quote.total`, then `quotedPrice`). No `Service fee` / `Runner fee` text anywhere. Quote components are never rendered, even when present in the response.
6. **Item amount kept apart (WQ-27)**: Buy For Me with budget 40000 shows `Item amount KSh 40,000` in its own card, and the fee row still shows only the fee total. Check It For Me (or budget 0) shows no route card.
7. **CTA charge (WQ-27)**: merchant-direct selected → `Confirm & pay KSh <fee> →`; send-to-runner selected → `Confirm & pay KSh <fee + item> →` via `addKes` (`"2200.00"` + `"40000.00"` → `KSh 42,200`) while the `Item amount` row stays on screen. The amount sits in an `nmNum` element.
8. Route rows:
   - default merchant-direct when details are available, else send-to-runner;
   - merchant-direct disabled with `Available once the merchant's details are added.`;
   - a `merchant_details:updated` event enables it without changing the selection;
   - the selected row uses the blue fill and white text tokens;
   - no `runner_advance` option.
9. Payer: the default method is shown. No methods → the masked sign-in phone + `Your sign-in number`, and no `Change`.
10. **Quote accept**:
    - QUOTED → `POST …/quote/accept`, then navigation to `…/payment` with the intent `{ route, paymentMethodId }` stored in `CheckoutIntentStore`;
    - ACCEPTED with `quoteAcceptanceRequired` → accept called; ACCEPTED without it → no accept call;
    - budget 0 → no route in the intent.
11. Accept `quote_expired` → expired state (no toast); other 409 → reload; 500 → toast `Couldn't accept the quote. Try again.`
12. **Quote decline**: `Decline and cancel task` → confirm dialog with the exact copy, confirm outline red, `Keep task` primary. Confirm → `PATCH …/status { to: 'CANCELLED' }`, toast `Task cancelled.`, Home with `replaceUrl`. `Keep task` → no call. Failure → toast.
13. Expired by date (the injected clock passes `expiresAt` while open) and by navigation state: chip hidden, `Expired at` caption, route and payer cards hidden, the notice and `Request a new quote`.
14. Request a new quote: success and `quote_request_pending` → toast + the New quote requested state with `Requested …` in Fira Code; `quote_still_valid` → checkout; `quote_request_not_allowed` → reload; 500 → error toast.
15. New quote requested restored on load from `quoteRequestedAt`; `quote:reissued` switches back to checkout with the new total and announces `Your new quote is ready.`
16. Outside area: REQUESTED + flag → owner copy, primary `Cancel task` first; QUOTED with a valid quote + flag → normal checkout; QUOTED expired + flag → outside-area state (not the expired state).
17. Deadline passed on load (QUOTED, `deadlineAt` before the injected `now`) → notice + `Choose a new deadline`; an expired quote takes precedence over it.
18. **Deadline panel (WQ-2, EAT)**, under `TZ=Europe/London` and `TZ=Africa/Nairobi` (or the zone-independent clock):
    - `Today` is hidden once `now` is after 23:59 EAT (e.g. `now` = 2026-11-01 21:30 London = 2 Nov 00:30 EAT shows `Today` for 2 Nov);
    - `Tomorrow` sends `deadlineAt` = 23:59 EAT of the next EAT date as UTC ISO (`2026-11-02T20:59:00.000Z` for `now` = 2026-11-01 10:00 EAT);
    - `Flexible` sends `deadlineAt: null` and shows the caption from defaults;
    - the current choice's caption reads exactly `Due today, 23:59 EAT.` / `Due tomorrow, 23:59 EAT.` with `23:59` in `nmNum`;
    - while saving, the chip group is `disabled` (no second PATCH) and `Saving` dots show;
    - success closes the panel and restores the pay CTA with the quote unchanged;
    - `deadline_not_editable` → reload; 400 → the danger notice in the panel.
19. Deadline line (owner Q8-3): the chosen deadline as `formatDeadlineEat(…, { hour24: true })` in `nmNum` + ` EAT` outside it (`Today, 23:59 EAT`); the same value under both zones; `Flexible` → `No deadline yet. It starts when your payment is confirmed.`; `Change` opens the panel.
20. Layout structure: the checkout renders the main column (items 1–3) before the aside (items 4–6) in DOM order, and the CTA sits inside `nm-fixed-cta`. The grid itself is CSS only (`nm-up($nm-bp-lg)`); the auditor checks it at 360, 1024 and 1280px.
21. Token and font use: no raw colours (A.T14 static check covers the folder); every numeric field listed above is inside `nmNum`.
22. No storage writes during the whole flow (`localStorage` / `sessionStorage` / `history.state` untouched).
23. **Merchant data (#28)**: the page renders no `merchantName`, Till, Paybill or account value even when a fixture errand carries them.
24. **Same route, another errand (A§1)**: from `/tasks/e-1/quote` an in-app navigation to `/tasks/e-2/quote` shows e-2's errand and quote (reference, total), leaves e-1's room and joins e-2's, stops e-1's timers, and ignores later e-1 socket events; Back to e-1 re-reads e-1; an open deadline panel closes.

## Current vs design
- Not built. `tasks/:errandId/quote` is a #7 `ViewStubComponent` route (`customer.routes.ts`, `data { role, navKey: 'home', pushed: true }`, no `title`).
- The #7 pieces this view needs exist and are reused (A§8).
- The Flutter screen (`awaiting_quote_screen.dart`) is the behavioural reference and is `matches-design` (re-audit 2026-10-20).
- Web differences, all from browser constraints: the deadline label ` EAT` (WQ-2), the two-column grid from 1024px, and polling paused in hidden tabs.
