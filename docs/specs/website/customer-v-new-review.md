# customer `v-new-review` (web): new task, step 3 (review the estimate and submit)

- Issue: GitHub #7. Builder: `web-parity`. Branch: `feat/website-customer-create-task`.
- Route: `/app/customer/new/review` (`wizardStepGuard(3)`, `wizardLeaveGuard`; NC§W1). Shared: wizard foundation NC§W1–§W9a (`customer-v-new-category.md`), details ND (`customer-v-new-details.md`), `auth-foundation.md` (F§n), kit `ui-kit.md` (K§n).
- Sources: mobile spec `docs/specs/customer/v-new-review.md` (matches-design, round 14); Flutter `apps/customer_app/lib/src/screens/wizard/review_screen.dart`; core `widgets/receipt_card.dart`; mockup `nitume_customer_app.html` lines 172–173, 386–408; owner answers OA-3, OA-4, OA-5, OA-9, rows 34, 45, 47, 76, 233; `_shared.md` §8; API on `origin/main` (`errands.controller.ts` `create`, `submit`, `transition`; `errands.service.ts` `assertInServiceArea`).
- **Updated 2026-10-29** for the #6 build (NC§W0: back button `backDisabled`, toasts with the CTA offset) and the #8 spec: the receipt parts and `nm-fixed-cta` are the ones `customer-x-awaiting-quote.md` §Components describes, built here once; the success target is the #8 route `/app/customer/tasks/:errandId/quote` (a #7 stub until #8 lands, NC§W1).
- Implementation: none (the #6 `new` stub has no `review` child). Status: **missing**.

## Purpose
Submit the task for its authoritative quote. A price **estimate**, clearly labelled as one (OA-3), appears only once real pricing rates exist (row 47); until then no price is shown. Nothing is paid here: payment happens after the customer accepts the final quote on `x-awaiting-quote` (#8).

## Flow (OA-3, OA-5; same as the app, not the mockup)
Mockup: instant quote → payment route → `Confirm & pay` → STK. Now: (estimate, only when enabled) → `Submit task →` (DRAFT → REQUESTED) → `x-awaiting-quote` (REQUESTED, then QUOTED) → accept + choose the merchant route there (#8) → ACCEPTED → `v-payment`. The mockup's `How should this be paid?` card and `Let runner advance the purchase` option are **not** on this screen (route choice moves to checkout; runner advance is never a customer option, OA-5).

## Entry / exit
- Entry: valid `Continue →` on step 2.
- Back (header or browser) → step 2, values kept. Disabled while submitting.
- `Submit task →` success → `router.navigateByUrl(customerLinks.awaitingQuote(id), { replaceUrl: true })` (`/app/customer/tasks/<id>/quote`, #8 A§1), after setting `submitted = true` (the leave guard then allows it, NC§W3). Browser Back from there hits the step guard and lands on `openerUrl` (normally Home), matching the app's "Back goes to the screen that opened the wizard". After the navigation succeeds the store calls `finish()` (empty draft, `submitted` and `openerUrl` kept, NC§W2).
- `Change location` (service-area refusal) → step 2 with `focusOnReturn` set (ND).

## Task states
None → DRAFT (`POST /errands`) → REQUESTED (`POST /errands/:id/submit`) during submit; DRAFT → CANCELLED only for cleanup (NC§W8 and the service-area case). The screen shows no state chip.

## Layout

Wizard frame NC§W4 (`Review`, step 3). Body, one of two variants:

**A. Preview disabled** (`environment.quotePreviewEnabled === false`, the MVP default, row 47):
1. `nm-notice` (info icon), 14px below: `We'll send your final quote after you submit. You won't pay anything until you accept it.` No price, no skeleton, **no estimate request**.
2. Only when the draft's budget > 0 (Buy For Me / Get It For Me): `nm-form-card` `Item budget` containing one receipt row `Item budget` — amount, then a caption `Paid separately from the fees. You choose how after your quote is ready.`

**B. Preview enabled** (only after the owner confirms pricing rates):
1. `nm-form-card` `Estimated price` containing:
   - Loading: two `nm-skeleton-card`s inside the card (height 40px; CTA enabled).
   - Estimate available: one total row (700) `Estimated total (service + runner fee)` — amount; caption (12 slate-600, 8px above) `This is an estimate. We'll send your final quote after you submit, and you won't pay anything until you accept it.` No `Service fee` / `Runner fee` / `Base fee` / `Transport` lines (row 34).
   - Estimate unavailable (request failed, no price, or no estimate endpoint): `nm-notice` `We couldn't estimate the price right now. You can still submit; we'll send you the final quote.` This copy never appears in variant A.
   - Budget > 0: a separate group under a 1px slate-line hairline (10px above, 4px padding): row `Item budget` — amount, and the caption `Paid separately from the fees. You choose how after your quote is ready.` The item budget is **never** added to the total (`_shared.md` §8).

Then, only while the location is refused (service-area state): `nm-notice` `We don't cover this location yet. Choose a place inside the areas we serve.` and 10px below it an outline `nm-button` `Change location`, placed **above the CTA** (frame slot `[nmWizardAbove]` → the `nm-fixed-cta` `above` slot, 10px above the button).

CTA `Submit task →` (primary, `expand`) in `nm-fixed-cta` (NC§W4).

Receipt parts (port of `ReceiptRow` / `ReceiptCaption`, **NEW (#7)** in `shared/ui/receipt/`, built here once with the values `customer-x-awaiting-quote.md` §Components gives, so #8 reuses them unchanged and #9/#10 build the receipt card on them):
- `nm-receipt-row` inputs `label`, `amount` (`Amount | null`), `isTotal`, `amountLabel` (accessible name, e.g. `kesSpoken`): flex row, baseline-aligned, padding `6px 0`; label `nm-type(body, 13px)` (13/400 blue) left, 12px gap, amount right as `formatKesOrDash(amount)` in `<span nmNum>` (family only: inherits 13px and blue). `isTotal`: weight 700 for label and amount, 1px slate-line top border, margin-top 6px, padding `10px 0 6px`. Long labels wrap before the amount.
- `nm-receipt-caption`: `nm-type(greeting)` (Sans 12/400 slate-600), padding-top 8px; numbers inside it in `<span nmNum>` (the #8 `Valid until` time).
- `nm-receipt-group`: the separate item group, 1px slate-line top hairline, 10px margin-top, 4px padding-top.
- No new type style (NC§W9a).

Responsive (web adaptation): one column, max 640px from 768px (NC§W4). Amounts stay right-aligned in the card at every width; long labels wrap before the amount. No horizontal scroll at 360px.

## Components

| Element | Component | Status |
|---|---|---|
| Frame / header / stepper / CTA bar | `nm-wizard-frame` (NC§W4) | NEW (#7) |
| Notices | `nm-notice` | kit |
| Item budget card / estimate card | `nm-form-card` | kit |
| Receipt row, caption, separate group | `nm-receipt-row`, `nm-receipt-caption`, `nm-receipt-group` (C-18 parts) | **NEW (#7)**, built here once; #8 reuses them; #9/#10 build the receipt card on them |
| CTA bar | `nm-fixed-cta` (inside `nm-wizard-frame`) | **NEW (#7)**, shared with #8 |
| Header back while submitting | `nm-pushed-header` `backDisabled` → `nm-back-button` `disabled` | #6 component + NC§W9a addition |
| Loading rows (variant B) | `nm-skeleton-card` | kit |
| Submit / Change location | `nm-button` primary (`loading`) / outline | kit |
| Toasts | `NmToastService.show(message, { offset })` with the `nm-fixed-cta` bar height below 768px (K§4.10) | exists (#5) |
| Estimate | `QUOTE_ESTIMATE` service (Data) | **NEW (#7)** |

## Copy (exact)
- Header: `Review`, counter `Step 3 of 3` (replaces the mockup's `Review & pay`: nothing is paid here). Document title `Review · Nitume`.
- Variant A notice: `We'll send your final quote after you submit. You won't pay anything until you accept it.`
- Variant A card heading and row label: `Item budget`.
- Variant B card heading: `Estimated price`; total `Estimated total (service + runner fee)`; caption `This is an estimate. We'll send your final quote after you submit, and you won't pay anything until you accept it.`; unavailable `We couldn't estimate the price right now. You can still submit; we'll send you the final quote.`
- Item line (both variants): `Paid separately from the fees. You choose how after your quote is ready.`
- CTA: `Submit task →` (replaces `Confirm & pay KSh 2,200 →`).
- Submit error toast: `Couldn't send your task. Try again.`
- Service-area notice: `We don't cover this location yet. Choose a place inside the areas we serve.`; button `Change location`.
- Amounts: `formatKes` (`KSh 40,000`), never `KES`.

## States

| State | Behaviour |
|---|---|
| Variant A | Notice (+ item budget card when budget > 0). `QUOTE_ESTIMATE` is never called |
| Variant B estimating | Skeletons in the card; CTA enabled |
| Variant B estimate shown | Total row + caption (+ item group) |
| Variant B unavailable | Unavailable notice in the card (+ item group); CTA enabled |
| Submitting | `submitting` true in the store; CTA `loading` (white spinner, `aria-busy`), repeated clicks ignored; header Back `disabled` (`backDisabled`); `wizardLeaveGuard` blocks every navigation; `beforeunload` stays armed |
| Success | NC§W3 / Entry-exit: `submitted = true`, replace-navigate to `x-awaiting-quote` for the new id, then `finish()` |
| Network or server error (any status not listed below) | Toast `Couldn't send your task. Try again.`; CTA enabled again. If the DRAFT was created, the next tap only calls `POST /errands/:id/submit` with the same id (never a second create) |
| 400 on create (no DRAFT yet), e.g. `deadline_in_past`, `budget_required`, `budget_not_applicable`, `locations_pickup_dropoff_required`, DTO validation | Toast with the API `message` (first string when it is an array; `Something went wrong. Please try again.` when there is none), then navigate back to step 2 (as the app's `navigator.pop()`) |
| 400 on submit (DRAFT exists) | Generic toast `Couldn't send your task. Try again.` (app parity), stay |
| 422 `location_outside_service_area` (on create **or** submit; row 233) | **No toast.** If a DRAFT was created, `cancelDraft(id)` best effort and clear `createdErrandId` (it holds the refused location and cannot be edited), so the next submit creates a new one. Record `outsideArea = { first, dropoff, pointType }` (`pointType` from the error body). Show the service-area notice + `Change location`; `Submit task →` **disabled** while `locationRefused` (until either location is re-picked on step 2). No task is created |
| `Change location` | `focusOnReturn = (pointType === 'dropoff' && twoPoints) ? 'dropoff' : 'first'`, then navigate back to step 2 (`history.back()`, fallback `/app/customer/new/details`) |
| 401 / `account_suspended` | Handled by the #6 interceptor (sign-out with the toast, F§5); no screen copy |
| Leaving after a failed submit with a DRAFT | NC§W8 cancels it |

The `Today` chip after 23:59 EAT (WQ-2) makes a deadline in the past: the API answers `deadline_in_past` and the 400 row applies (app parity; no client pre-check).

## Numeric fields (Fira Code)
- Every amount: item budget (both variants), estimated total (variant B).
- Step counter `Step 3 of 3`.

## Data
- Create: `POST /api/v1/errands`, body `CreateErrandBody` (ND§Data) from `toRequest(new Date())` at the moment of the first submit. Response 201 `{ errand: ErrandView (status 'DRAFT'), history }`; keep `errand.id` as `createdErrandId`. Exists.
- Submit: `POST /api/v1/errands/:id/submit` (no body) → 201 `{ errand (status 'REQUESTED'), history }`. Exists. The API re-checks the service area here (422 `location_outside_service_area`, `pointType`).
- Cleanup: `PATCH /api/v1/errands/:id/status { to: 'CANCELLED' }` (DRAFT → CANCELLED, OA-9). Exists.
- Error body: `{ statusCode, code, message, ...extra }` (`apiErrorOf`, NC§W5). 422 extra: `{ pointType: 'task_site' | 'pickup' | 'dropoff' }`.
- Estimate (variant B only): `QUOTE_ESTIMATE: InjectionToken<{ estimate(body: CreateErrandBody): Promise<{ total: string; itemAmount: string | null } | null> }>`. **No preview endpoint exists** and none may be invented (row 47), so the default implementation returns `null` without any HTTP call (= unavailable state), exactly as the built app. When pricing rates exist, api-contract adds the proposed `POST /api/v1/errands/quote-preview` (body = `CreateErrandBody`, response `{ total, itemAmount, isEstimate: true }`, writes nothing, creates no quote) and the default implementation switches to it; variant A never calls it.
- No socket events on this screen.

## Accessibility and responsive
- The variant B caption is inside the card's text flow right after the total, so screen readers hear "estimate" with the total; the total row's amount gets `nmNumLabel` = `kesSpoken(total)`.
- The service-area notice is `role="alert"` when it appears; focus moves to `Change location`.
- The submitting CTA keeps its accessible name `Submit task →` with `aria-busy="true"`.
- CTA above the bottom safe area (`nm-fixed-cta`, NC§W4); below 768px the toast sits above the CTA bar.

## Required tests (Vitest)
1. Header `Review`, `Step 3 of 3` in `nmNum`, all three stepper segments done.
2. Variant A (`quotePreviewEnabled: false`): notice copy exact; `QUOTE_ESTIMATE.estimate` never called; no `Estimated price`, no unavailable copy.
3. Variant A item budget: Buy For Me budget 40000 → card `Item budget`, row `Item budget` / `KSh 40,000` (amount in `nmNum`), item caption exact; budget 0 or Check It For Me → no card.
4. Variant B (`quotePreviewEnabled: true`, fake estimate): called once with the request body; skeletons while pending with the CTA enabled; resolved `{ total: '2200.00' }` → `Estimated total (service + runner fee)` / `KSh 2,200` + estimate caption; resolved `null` or rejected → unavailable notice; budget > 0 adds the separate item group and the total is unchanged (never total + budget).
5. Default `QUOTE_ESTIMATE` implementation returns `null` and makes no HTTP request (`HttpTestingController.verify()`).
6. Submit success: `POST /errands` with the exact body, then `POST /errands/:id/submit`; navigates with `replaceUrl` to `/app/customer/tasks/:id/quote`; store `finish()`ed; browser Back to `/app/customer/new/details` then redirects to `openerUrl`; `wizardLeaveGuard` did not prompt.
7. Submitting: spinner + `aria-busy`, second click sends nothing, header Back has `disabled` + `aria-disabled` and clicking it does not navigate, a router navigation attempt (side-nav link) is blocked without a dialog.
8. Network error on create → toast `Couldn't send your task. Try again.` (shown with the CTA-bar offset below 768px), CTA re-enabled, still on step 3.
9. Create OK, submit fails (500) → generic toast; retry calls only `POST /errands/:id/submit` with the same id (create called once in total).
10. 400 on create with `{ code: 'deadline_in_past', message: 'The deadline must be in the future' }` → that message as the toast, back on `/app/customer/new/details`; array `message` → first entry; no message → `Something went wrong. Please try again.`
11. 400 on submit after a DRAFT → generic toast, stays.
12. 422 `location_outside_service_area` on create → no toast, service-area notice + `Change location` render, CTA disabled; no DRAFT to cancel.
13. 422 on submit after a created DRAFT → `PATCH /errands/:id/status { to: 'CANCELLED' }` sent, `createdErrandId` cleared; after re-picking a place on step 2 the CTA enables and the next submit calls `POST /errands` again.
14. `Change location` with `pointType: 'dropoff'` on Get It For Me sets `focusOnReturn: 'dropoff'` and returns to step 2; `task_site` → `first`.
15. Leaving the wizard after a failed submit with a DRAFT cancels it (NC§W8).
16. Receipt parts: `nm-receipt-row` label in Sans 13 blue, amount in `nmNum`, `isTotal` adds weight 700 and the top border (custom-property names only); `nm-receipt-caption` uses the `greeting` values; `nm-receipt-group` hairline; `amountLabel` becomes the amount's accessible name.
17. No copy on this screen contains `wallet`, `escrow`, `balance`, `hold`, `release` or `KES`; no mockup fee lines (`Base fee`, `Transport`, `Report & evidence`) or route options render.

## Current vs design
No review step on the website; the #6 `new` stub has no `review` child. The web adds an `QUOTE_ESTIMATE` seam that the app does not have (the app's variant B shows the unavailable notice without any service); with the default implementation the behaviour is identical (no call, unavailable state).

## Questions
None new. Settled by owner answers: OA-3 (preview vs authoritative quote), OA-4 / row 34 (only the total line, and only once rates exist), row 47 (preview hidden until pricing rates exist), OA-5 (route choice at checkout), row 233 (refuse at create with a clear message).
