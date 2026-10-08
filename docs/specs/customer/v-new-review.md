# v-new-review — New task, step 3: review the estimate and submit

- Mockup: `docs/design/nitume_customer_app.html` lines 386–408 (`#v-new-review`, overlay)
- Shared conventions: `_shared.md` (OA-n = owner answers, §0; fees §8)
- Implementation: `apps/customer_app/lib/src/screens/wizard/review_screen.dart` on branch `feat/customer-screens`
- Status: partial (spec changed 2026-10-08: no price shown until pricing rates exist; see Current vs design)

## Purpose
Submit the task for its authoritative quote. A **preview** of the price, clearly labelled as an estimate (OA-3), appears here only once real pricing rates exist (row 47); until then the screen shows no price at all. Payment does **not** happen here; it happens after the customer accepts the final quote on `x-awaiting-quote` (checkout).

## Flow change from the mockup (OA-3, OA-5)
- Mockup: instant quote → choose merchant payment route → "Confirm & pay" → STK.
- Now: (estimate, only when enabled) → **Submit** (DRAFT → REQUESTED) → `x-awaiting-quote` (REQUESTED, then QUOTED) → customer accepts the final quote and picks the merchant payment route (checkout) → ACCEPTED → `v-payment`.
- The "How should this be paid?" card moves to the checkout state of `x-awaiting-quote`, because route availability depends on merchant details that the merchant or an admin adds to a submitted errand (OA-5, row 43).

## Entry / exit
- Entry: "Continue →" on `v-new-details`.
- Back → `v-new-details` (values kept).
- "Submit task →" success → replace the wizard stack with `x-awaiting-quote` for the new errand (Back from there goes to the screen that opened the wizard, normally Home).

## Task states
None → DRAFT → REQUESTED during submit. The screen itself shows no state chip.

## Layout (top to bottom)
1. Pushed header (C-10): title + `Step 3 of 3`.
2. Stepper (C-14): all three segments done.
3. Scrollable body, one of two variants:

   **A. Preview disabled** (`AppConfig.quotePreviewEnabled == false`, the MVP default until pricing rates exist, row 47; `_shared.md` §8.3):
   1. C-40 notice, margin `0 20 14`: quote explanation (see Copy). No price, no skeleton, no preview call.
   2. Only when the budget is > 0 (Buy For Me / Get It For Me): form card (C-17 `NitumeFormCard`) `Item budget` with one receipt row (C-18) `Item budget` — amount (Fira Code 13), and under it a 12 slate-600 line `Paid separately from the fees. You choose how after your quote is ready.`

   **B. Preview enabled** (only after the owner confirms pricing rates):
   1. Form card (C-17 `NitumeFormCard`, heading style from the mockup) **"Estimated price"** containing one total row (C-18, 700, label left 13 blue, amount right Fira Code 13): `Estimated total (service + runner fee)` — amount. No `Service fee` / `Runner fee` lines (row 34 clarification). Caption under the total, 12 slate-600, margin-top 8: estimate note (see Copy).
   2. Only when the budget is > 0: a second group inside the same card, separated by a slate-line hairline and 10 spacing (C-18 "paid separately" group): `Item budget` — amount (Fira Code), with the same 12 slate-600 line as in A. The item budget is never added to the total (§8).
4. Fixed primary CTA (C-01).

## Components
| Element | Component | Status |
|---|---|---|
| Header / stepper | C-10 / C-14 | built |
| Notice (variant A) | C-40 | built |
| Item budget card / estimate card + caption + separate group | C-17 form card, C-18 | built |
| Loading rows (variant B only) | C-33 `SkeletonCard` (inside the card) | built |
| Submit | C-01 | built |

## Copy
- Header (proposed; the mockup's `Review & pay` no longer fits because nothing is paid here): `Review`, counter `Step 3 of 3`
- Variant A notice (proposed): `We'll send your final quote after you submit. You won't pay anything until you accept it.`
- Variant A card heading and row (proposed): `Item budget`
- Variant B card heading (proposed, replaces mockup `Quote breakdown`): `Estimated price`
- Variant B total: `Estimated total (service + runner fee)` (mockup: `Total (service + runner fee)`). The mockup lines `Base fee` / `Report & evidence` / `Transport`, and the `Service fee` / `Runner fee` lines, are not shown (row 34 clarification)
- Variant B caption (proposed): `This is an estimate. We'll send your final quote after you submit, and you won't pay anything until you accept it.`
- Item line (both variants, proposed): `Paid separately from the fees. You choose how after your quote is ready.`
- CTA (proposed; replaces `Confirm & pay KSh 2,200 →`): `Submit task →`

States (proposed):
- Variant B only — estimating: skeleton rows inside the card; CTA enabled (the authoritative quote comes later anyway).
- Variant B only — estimate unavailable (preview call failed or returned no price): the card shows C-40 notice `We couldn't estimate the price right now. You can still submit; we'll send you the final quote.` CTA enabled. This failure copy is never shown in variant A.
- Submitting: CTA spinner, disabled; back disabled.
- Submit error: snackbar `Couldn't send your task. Try again.`; CTA re-enabled. If the DRAFT was created but the submit call failed, retry only `POST /errands/:id/submit` with the same id (never create a second draft).
- Validation error from the API (400): snackbar with the API message, and Back returns to step 2.

## Numeric fields (Fira Code)
- Every amount (item budget; estimated total in variant B).
- Step counter.

## Data
- Preview (variant B only): not built on purpose (row 47: no invented pricing rules). When pricing rates exist, api-contract adds a synchronous preview (proposed `POST /api/v1/errands/quote-preview`, body = the `CreateErrandDto`, response `{ total, itemAmount, isEstimate: true }`) that writes nothing and creates no `quotes` row (OA-3), and core-ui turns `AppConfig.quotePreviewEnabled` on. Variant A makes no call.
- Submit: `POST /api/v1/errands` (creates DRAFT) → `POST /api/v1/errands/:id/submit` (DRAFT → REQUESTED). Both exist.
- Abandoning after a DRAFT exists (user backs out of the wizard after a failed submit): `PATCH /api/v1/errands/:id/status { to: 'CANCELLED' }` (DRAFT → CANCELLED approved by OA-9).
- No socket events on this screen.

## Accessibility and mobile
- The caption is part of the card's semantics so screen readers hear "estimate" with the total.
- CTA above the bottom safe area.

## Resolved by owner answers
- Instant quote vs wait: OA-3 (was Q1) — preview here, authoritative quote on `x-awaiting-quote`.
- Fee lines shown: OA-4, row 34 clarified — only `Total (service + runner fee)` until pricing rates exist; the preview itself is hidden until then (row 47).
- Merchant route choice: OA-5 (was Q3) — at checkout on `x-awaiting-quote`; no runner advance.
- Till/Paybill display: OA-5 (was Q4) — `x-merchant-payment`.
- Send-to-runner payment mechanics (was Q5): platform-mediated STK to Nitume (row 42), handled on `x-merchant-payment`.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS (preview endpoint pending row 47: always the estimate-unavailable state). Minor: the notice is a standalone card, not inside an `Estimated price` form card.

Spec update 2026-10-08 (rows 34, 47): the build always shows the "estimate unavailable" notice (`We couldn't estimate the price right now…`), which reads as a failure. Now required: variant A (neutral notice, no price, no preview call, item budget card when budget > 0) behind `AppConfig.quotePreviewEnabled == false`; variant B keeps only the estimated total row. Status set to `partial` until re-audited.
