# v-new-review — New task, step 3: review the estimate and submit

- Mockup: `docs/design/nitume_customer_app.html` lines 386–408 (`#v-new-review`, overlay)
- Shared conventions: `_shared.md` (OA-n = owner answers, §0; fees §8)
- Implementation: `apps/customer_app/lib/src/screens/wizard/review_screen.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Show a **preview** of the price, clearly labelled as an estimate (OA-3), and submit the task for its authoritative quote. Payment does **not** happen here any more; it happens after the customer accepts the final quote on `x-awaiting-quote` (checkout).

## Flow change from the mockup (OA-3, OA-5)
- Mockup: instant quote → choose merchant payment route → "Confirm & pay" → STK.
- Now: estimate (synchronous preview) → **Submit** (DRAFT → REQUESTED) → `x-awaiting-quote` (REQUESTED, then QUOTED) → customer accepts the final quote and picks the merchant payment route (checkout) → ACCEPTED → `v-payment`.
- The "How should this be paid?" card moves to the checkout state of `x-awaiting-quote`, because route availability depends on merchant details that exist only on a submitted errand (OA-5, SQ-6).

## Entry / exit
- Entry: "Continue →" on `v-new-details`.
- Back → `v-new-details` (values kept).
- "Submit task →" success → replace the wizard stack with `x-awaiting-quote` for the new errand (Back from there goes to the screen that opened the wizard, normally Home).

## Task states
None → DRAFT → REQUESTED during submit. The screen itself shows no state chip.

## Layout (top to bottom)
1. Pushed header (C-10): title + `Step 3 of 3`.
2. Stepper (C-14): all three segments done.
3. Scrollable body:
   1. Form card (C-17 `NitumeFormCard`, heading style from the mockup) **"Estimated price"** containing receipt rows (C-18): label left 13 blue, amount right Fira Code 13, padding 6 0.
      - `Service fee` — amount
      - `Runner fee` — amount
      - Total row (top hairline slate-line, 700): `Estimated total (service + runner fee)` — amount
      - Caption under the total, 12 slate-600, margin-top 8: estimate note (see Copy).
   2. Only when the budget is > 0: a second group inside the same card, separated by a slate-line hairline and 10 spacing (C-18 "paid separately" group): `Item budget` — amount (Fira Code), with a 12 slate-600 line under it: `Paid separately from the fees. You choose how after your quote is ready.` The item budget is never added to the total (§8).
4. Fixed primary CTA (C-01).

## Components
| Element | Component | Status |
|---|---|---|
| Header / stepper | C-10 / C-14 | built |
| Estimate card + rows + caption + separate group | C-17 form card, C-18 | built; **change**: caption slot and separate group |
| Loading rows | C-33 `SkeletonCard` (inside the card) | built |
| Submit | C-01 | built |

## Copy
- Header (proposed; the mockup's `Review & pay` no longer fits because nothing is paid here): `Review`, counter `Step 3 of 3`
- Card heading (proposed, replaces mockup `Quote breakdown`): `Estimated price`
- Rows: `Service fee`, `Runner fee` (wording from the mockup's payment summaries, OA-4). The mockup lines `Base fee` / `Report & evidence` / `Transport` are not used.
- Total: `Estimated total (service + runner fee)` (mockup: `Total (service + runner fee)`)
- Caption (proposed): `This is an estimate. We'll send your final quote after you submit, and you won't pay anything until you accept it.`
- Item group (proposed): `Item budget`; `Paid separately from the fees. You choose how after your quote is ready.`
- CTA (proposed; replaces `Confirm & pay KSh 2,200 →`): `Submit task →`

States (proposed):
- Estimating: skeleton rows inside the card; CTA enabled (the authoritative quote comes later anyway).
- Estimate unavailable (preview call failed or returned no price): the card shows C-40 notice `We couldn't estimate the price right now. You can still submit; we'll send you the final quote.` CTA enabled.
- Submitting: CTA spinner, disabled; back disabled.
- Submit error: snackbar `Couldn't send your task. Try again.`; CTA re-enabled. If the DRAFT was created but the submit call failed, retry only `POST /errands/:id/submit` with the same id (never create a second draft).
- Validation error from the API (400): snackbar with the API message, and Back returns to step 2.

## Numeric fields (Fira Code)
- Every amount (fees, total, item budget).
- Step counter.

## Data
- Preview: needs: api-contract — **new** synchronous preview endpoint (proposed `POST /api/v1/errands/quote-preview`, body = the `CreateErrandDto` built in step 2, response `{ serviceFee, runnerFee, itemAmount, total, isEstimate: true }`). It writes nothing and must not create a `quotes` row (OA-3: preview ≠ final quote). Which pricing components feed `serviceFee` vs `runnerFee` is **TODO, pending row 34**; the client only renders the returned fields.
- Submit: `POST /api/v1/errands` (creates DRAFT) → `POST /api/v1/errands/:id/submit` (DRAFT → REQUESTED). Both exist.
- Abandoning after a DRAFT exists (user backs out of the wizard after a failed submit): `PATCH /api/v1/errands/:id/status { to: 'CANCELLED' }` (DRAFT → CANCELLED approved by OA-9).
- No socket events on this screen.

## Accessibility and mobile
- The caption is part of the card's semantics so screen readers hear "estimate" with the total.
- CTA above the bottom safe area.

## Resolved by owner answers
- Instant quote vs wait: OA-3 (was Q1) — preview here, authoritative quote on `x-awaiting-quote`.
- Fee lines shown: OA-4 (was Q2) — Service fee + Runner fee + item amount; the component mapping is pending row 34.
- Merchant route choice: OA-5 (was Q3) — at checkout on `x-awaiting-quote`; no runner advance.
- Till/Paybill display: OA-5 (was Q4) — `x-merchant-payment`.
- Send-to-runner payment mechanics (was Q5): still open, SQ-5.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS (preview endpoint pending row 47: always the estimate-unavailable state). Minor: the notice is a standalone card, not inside an `Estimated price` form card.
