# drawer-refund — Refund review drawer

- Mockup: **not drawn. EXTENDS MOCKUP**: a fourth drawer next to `#drawer-task`, `#drawer-runner`, `#drawer-dispute`, built from the same drawer anatomy (`.drawer-head`, `.drawer-section`, `.drawer-label`, `.drawer-card`, `.drawer-row`, `.drawer-timeline`, `.drawer-actions`) and the design-system form field. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md`
- Implementation: `apps/admin/src/app/features/admin/drawers/refund-drawer.ts` (hosted by the shell's `app-ops-drawer`, `DrawerKind` `'refund'`) and `refund-link.section.ts` (task drawer link)
- Status: matches-design (re-audit 2026-10-09 round 4: PASS; see Current vs design)

## Purpose
Show one refund review and let any authorized admin (row 77: no second approver, no amount threshold) (1) decide the refund amount, KSh 0 up to the review's ceiling, and (2) for an approved refund, record the manual M-Pesa payout with its receipt (rows 37, 54). The ceiling is what the customer paid **to Nitume** (including an item amount paid to Nitume even if the runner already bought the item, row 81) **minus refunds already approved or sent on the same task** (row 87); for a `Price decrease` review it is the decrease (`send_to_runner` tasks only, row 86). The refund is a record attached to the task (CANCELLED for a cancellation review), not a task state.

## Entry / exit
- Entry: a row in `p-refunds`; `Open refund review` in the dispute drawer after a customer-favourable verdict (`drawer-dispute-outcome.md`); a row in the task drawer's `Refund` section of any task from PAYMENT_CONFIRMED on that has reviews (see "Task drawer link" below, SA-2).
- Drawer head title: `Refund review`.
- Exit: ✕, overlay, ESC (A-01). With unsaved input in the decision or payout form, closing asks via A-08: title `Discard this decision?`, body `The amount and note you entered will be lost.`, buttons `Back` / `Discard` (outline/primary, no red).
- `Open task` (link-style `.btn .btn-text`) replaces the drawer content with the task drawer for the errand (same shell drawer, kind `task`).

## States of the review
| API status | What the drawer shows |
|---|---|
| `pending_review` | Summary, What was paid, **Decision form**, Activity |
| `approved` | Summary, What was paid, Decision (read-only), **Payout form**, Activity |
| `refunded` | Summary, What was paid, Decision (read-only), Payout (read-only), Activity |
| `no_refund` | Summary, What was paid, Decision (read-only), Activity |

## Layout (top to bottom, drawer body padding 18 22 30)
1. **Summary** (`.drawer-section`, no label), mirroring the mockup task drawer's first section:
   - Chip A-02 `kind="refund"` (e.g. `Needs review`).
   - `h3` 16/700, margin 10 0 4: task title (fallback rules as in `p-refunds`).
   - Muted line 12.5 slate-600: `{customer short name} · {category display name} · Opened {date, time}` (date/time Fira Code). Missing parts are dropped with their separator.
   - `.drawer-card` rows: `Task` → `#NT-XXXXX` (Fira Code) + `Open task`; `Task status` → A-02 errand chip (expected `Cancelled`); `Reason` → trigger label.
2. **What was paid** (`.drawer-label` `What the customer paid`), `.drawer-card` rows, three flows kept apart (`_shared.md` §3):
   - `Service + runner fee` → amount
   - `Item amount (paid to Nitume)` → amount, only when the item amount went through Nitume (send_to_runner, rows 42, 66). It stays in the total and the ceiling even when the runner already bought the item (row 81)
   - `Price change difference` → amount, one row per completed difference payment
   - `Total paid to Nitume` → `paid.totalPaidToNitume` (what was paid, accepted in the 2026-10-09 re-audit), 600 weight, the row above it has the hairline. Without `paid`, this row shows `amountPaid` (fallback unchanged)
   - `Already refunded on this task` → the API's `alreadyRefunded` (the errand's **other** `approved`/`refunded` reviews), else the sum of `refundAmount` over those reviews in `otherReviews`; shown only when > 0 (row 87). Fira Code
   - `Refundable in this review` → the review's ceiling, 600 weight (amendment SA-1): `refundCeiling` while `pending_review` (net of earlier refunds, row 87), else `amountPaid` (once decided the API sends `refundCeiling: null`). Shown when it differs from `paid.totalPaidToNitume` by at least a cent (a decrease review, or a pending cancellation after earlier refunds). This is the number the decision form is capped at
   - Not shown: `remainingRefundable` (decided in the 2026-10-09 round-4 re-audit). It is the task-level figure after **every** approved/refunded review, this one included, so on a decided review it repeats `Already refunded` plus this review's own amount; the admin acts on the ceiling. It is the customer's figure (customer refund view)
   - Under the card, 12 slate-600 caption when the merchant was paid directly: `The item amount (KSh 4,000) was paid straight to the merchant. Nitume didn't collect it, so it isn't part of this refund.`
   - Until the breakdown exists (needs N-1), show only `Total paid to Nitume` and the caption `Breakdown by payment isn't available yet.`
   - Customer M-Pesa row: `Refund to` → customer phone (Fira Code) `+254 7XX XXX 123` (needs N-1). Without it: `Refund to` → `Customer's M-Pesa number not available` (12.5 slate-600) and the payout form shows a hint to look it up (see 4).
3. **Decision**
   - `pending_review` (form, `.drawer-label` `Decision`; content on a `.drawer-card`):
     1. Field A-06 `Refund amount`: money input (§3), `KSh` prefix, Fira Code value, `inputmode="decimal"`, autofocus when the drawer opens on this state. Hint: `Between KSh 0 and KSh {ceiling}. KSh 0 closes the review with no refund.` (`ceiling` = `refundCeiling`, net of earlier refunds, row 87; `amountPaid` until the field is on `main`)
     2. Quick fill, row of two `.btn .btn-outline` small buttons (12.5/600, padding 7 14) under the field: `Full refund` (sets the ceiling) and `No refund` (sets `0`). They only fill the field; they never submit.
     3. Field A-06 `Note for the ops record (optional)`: textarea 3 rows, `.field-input`, max 1000; Fira Code counter `0/1000` right-aligned under it. Hint: `Not shown to the customer.` (row 69, decided: the decision note is internal; the customer sees the outcome/status only)
     4. `.drawer-actions`: one full-width `.btn .btn-primary` whose label follows the amount: amount > 0 → `Approve refund · KSh 1,200` (amount Fira Code); amount = 0 → `Close with no refund`; empty/invalid → `Approve refund` disabled.
     5. Submit → A-08 confirm (copy below) → request → success notice.
   - `approved` / `refunded` / `no_refund` (read-only `.drawer-card`): `Refund amount` → amount (`KSh 0` for no_refund); `Decided` → date/time; `Decided by` → admin name (N-2; fallback masked id `…a1b2`; `You` when it is the signed-in admin); `Note` → the decision note in Fira Sans 13 (row omitted when empty).
4. **Payout**
   - `approved` (form, `.drawer-label` `Record the payout`): 
     1. Instruction 13 blue: `Send KSh {refundAmount} to the customer by M-Pesa, then enter the M-Pesa receipt here.` When the phone is unavailable, add 12 slate-600: `Find the customer's number from the task before you send.`
     2. Field A-06 `M-Pesa receipt`: text input, Fira Code, uppercase as typed (`text-transform` plus value normalised to upper case before sending), `autocomplete="off"`, `spellcheck="false"`, placeholder `e.g. SLK4H7XQ2P`, maxlength 64.
     3. `.drawer-actions`: full-width `.btn .btn-primary` `Mark as refunded`, disabled until the receipt passes validation.
   - `refunded` (read-only `.drawer-card`): `Refund sent` → amount; `M-Pesa receipt` → reference (Fira Code); `Sent` → `paidAt` date/time; `Recorded by` → admin (N-2 fallback as above). **No edit control** of any kind on the receipt or amount once `refunded` (row 82).
5. **Corrections (row 82; spec only, not for this build)**: a sent refund is final in this drawer. When the owner approves the correction/reversal schema (`_shared.md` N-15), a later spec adds, under Payout, a `Corrections` list and a `Record a correction` action that **appends** a record (`Receipt corrected` with the new receipt and a required reason, or `Payout reversed` with the reversal receipt and reason); the original receipt stays visible and is never overwritten, and each record shows in Activity with admin and time. Until then, a wrong receipt is reported to the owner outside the app. Builders add nothing for this now.
6. **Activity** (`.drawer-label` `Activity`, `.drawer-card` with `.drawer-timeline`, mockup timeline pattern): `Review opened` (createdAt); `Refund of KSh X approved` / `Closed with no refund` (decidedAt); `Refund sent · {receipt}` (paidAt). Times `.dt-time` Fira Code 11.

## Validation (client, mirrors `DecideRefundDto` / `MarkRefundPaidDto` / `RefundsService`)
| Field | Rule | Message (`.field-error`) |
|---|---|---|
| Refund amount | required | `Enter a refund amount, or KSh 0 for no refund.` |
| Refund amount | number, ≥ 0, at most 2 decimals (after stripping `,` and spaces) | `Enter an amount in KSh, up to 2 decimal places.` |
| Refund amount | ≤ the ceiling (`refundCeiling`, net of earlier refunds, row 87) | `The refund can't be more than the KSh {ceiling} refundable in this review.` |
| Note | ≤ 1000 chars (counter stops input at 1000) | none needed |
| M-Pesa receipt | trimmed, matches `^[A-Za-z0-9-]{4,64}$` | `Enter the M-Pesa receipt code, letters and numbers only.` |

Validate on blur and on submit; once a field has shown an error, re-validate on input. The submit button stays disabled while any field is invalid.

## Confirm dialogs (A-08)
- Approve (amount > 0): title `Approve a refund of KSh 1,200?` · body `The customer will be told a refund is on its way. You'll record the M-Pesa payout next. You can't change the amount after this.` · buttons `Back` / `Approve refund`.
- No refund (amount = 0): title `Close with no refund?` · body `The customer will be told no refund is due for this task. You can't change this later.` · buttons `Back` / `Close review`.
- Mark paid: title `Mark KSh 1,200 as refunded?` · body `M-Pesa receipt {RECEIPT}. The customer will be told the refund has been sent. This can't be undone.` · buttons `Back` / `Mark as refunded`.
Amounts and the receipt inside dialogs are Fira Code.

## Request states
- Loading the drawer: `.ops-loading` `Loading refund review…`.
- Load error: A-11 danger `Couldn't load this refund review.` + `Try again` (`.btn .btn-outline`). 404: A-11 info `This refund review no longer exists.`
- Saving: the confirm button in A-08 shows `Saving…` and is disabled; Back is disabled; the dialog cannot be dismissed until the request settles.
- Success: dialog closes; the drawer re-renders from the response (the endpoint returns the updated `RefundReview`); an A-11 success notice at the top of the body (auto-dismiss after 6 s, also dismissible):
  - approved: `Refund of KSh 1,200 approved. Record the payout once you've sent it.`
  - no_refund: `Review closed with no refund.`
  - refunded: `Refund marked as sent.`
  The `p-refunds` row and the sidebar badge update.

## Error codes (A-14)
| Request | Response | UI |
|---|---|---|
| `PATCH /refunds/:id/decision` | 409 `refund_already_decided` | Reload the review; A-11 info `Another admin already decided this refund. Showing the latest.` |
| same | 400 `refund_exceeds_amount_paid` (extra `amountPaid` = the effective ceiling) | Field error with the returned `amountPaid`; reload the review (the paid total may have changed after a late payment, or another review on the task was approved meanwhile, row 87) |
| same | 400 validation (`message[]`) | Field error `Enter an amount in KSh, up to 2 decimal places.` |
| `POST /refunds/:id/mark-paid` | 409 `refund_not_approved` | Reload; A-11 info `This refund isn't approved, so it can't be marked as sent. Showing the latest.` |
| same | 409 `refund_payout_locked` (row 82: the review is already `refunded`; extra `payoutReference`, `paidAt`) | Reload (read-only Payout card); A-11 info `This refund was already marked as sent. Its receipt can't be changed. Showing the latest.` (builder copy, accepted 2026-10-09 round 4) |
| same | 400 validation (`payoutReference must be an M-Pesa receipt`) | Field error from the table above |
| any | 404 | A-11 info `This refund review no longer exists.` |
| any | 403 | `_shared.md` §2 |
| any | network / 5xx | A-11 danger `Couldn't save. Check your connection and try again.`; inputs kept |

Note: a pending review's `amountPaid` can rise if an STK payment completes after cancellation (`openWithin` refreshes it while `pending_review`). Always validate against the value from the latest fetch.

## Task drawer link (small addition to `drawer-task`, EXTENDS MOCKUP; amended SA-2)
For any task **from PAYMENT_CONFIRMED on** (PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER, COMPLETED, CONFIRMED, SETTLED, DISPUTED, CANCELLED, FAILED, EXPIRED), the task drawer calls `GET /errands/:id/refunds` (admin allowed, on `main`; returns `[]`, never 404). Not called for DRAFT, REQUESTED, QUOTED, ACCEPTED (nothing paid yet). EXPIRED is included: §3.3 reaches it only from RUNNER_ASSIGNED, so every EXPIRED task was paid (corrected 2026-10-09 round 4; the earlier "EXPIRED tasks that never reached payment" carve-out described a transition that does not exist). Whether the API opens a review for a paid EXPIRED or FAILED task is AQ-8. Non-empty → a `.drawer-section` `Refund` with one `.drawer-row` per review, newest first: reason label (Fira Sans), chip A-02 `kind="refund"`, `refundAmount` or `amountPaid` (Fira Code), and an `Open refund review` `.btn .btn-text` that switches the drawer to this one with that `id`. Empty → section hidden. Load error → the section shows 12 slate-600 `Couldn't load refunds.` + `.btn .btn-text` `Try again`; the rest of the drawer still renders. The old single `GET /errands/:id/refund` fallback can go.

## Components
| Pattern | Id | Status |
|---|---|---|
| Drawer shell | A-01 | exists |
| Chips (`kind="refund"` and errand) | A-02 | exists; **NEW** `kind` input |
| Drawer section/card/row/timeline/actions | A-05 | exists |
| Form field + hint + error | A-06 | exists (`.field*`); **NEW** `.field-hint`, `.field-error`, `app-form-field` |
| Buttons | A-07 | exists |
| Confirm dialog | A-08 | **NEW** |
| Notices | A-11 | **NEW** |
| Formatting | A-13 | **NEW** |
| Error mapping | A-14 | **NEW** |

## Copy (proposed; collected)
`Refund review`, `What the customer paid`, `Service + runner fee`, `Item amount (paid to Nitume)`, `Price change difference`, `Total paid to Nitume`, `Already refunded on this task`, `Refundable in this review`, `Refund to`, `Decision`, `Refund amount`, `Full refund`, `No refund`, `Note for the ops record (optional)`, `Not shown to the customer.`, `Approve refund`, `Approve refund · KSh {x}`, `Close with no refund`, `Record the payout`, `M-Pesa receipt`, `Mark as refunded`, `Refund sent`, `Sent`, `Recorded by`, `Decided`, `Decided by`, `Note`, `Activity`, `Review opened`, `Open task`, plus the dialog, notice and error strings above. No wallet/balance/escrow/held/release/credit wording (`_shared.md` §3).

## Numeric fields (Fira Code)
Task id, every amount (paid rows, total, already refunded, refundable in this review, refund amount input value and read-only value, amounts inside button labels, dialogs and notices), the customer phone, the M-Pesa receipt (input and read-only), all dates/times (`Opened`, `Decided`, `Sent`, activity times), the note counter `0/1000`.

## Data
- Ceiling (row 87): N-9 built on `feat/api-owner-answers-4` (not on `main` yet). The API keeps `amountPaid` as the review's own basis and adds, on every admin refund response (list, detail, decision, mark-paid): `refundCeiling` (`min(amountPaid, totalPaidToNitume − alreadyRefunded)`, never below 0; null once decided), `alreadyRefunded` (other approved/refunded reviews), `remainingRefundable` (task-level, after every approved/refunded review), `totalPaidToNitume`. The decision is re-checked against `refundCeiling`; `refund_exceeds_amount_paid` carries it in `amountPaid` (and `refundCeiling`). The admin types these fields optional with `TODO(owner-answers-4)` until the API merges. Decrease reviews only on `send_to_runner` (N-10, same branch).
- `GET /refunds/:id` (admin, exists) → `RefundReview` `{ id, errandId, trigger, amountPaid, refundAmount, status, decisionNote, decidedByUserId, decidedAt, payoutReference, paidByUserId, paidAt, createdAt, updatedAt }`.
- `PATCH /refunds/:id/decision` body `{ refundAmount: number, note?: string }` (admin, exists) → updated `RefundReview`. `refundAmount` 0 → `no_refund`, > 0 → `approved`. Only from `pending_review`.
- `POST /refunds/:id/mark-paid` body `{ payoutReference: string }` (admin, exists) → updated `RefundReview` (`refunded`). Only from `approved`.
- Task summary: `GET /errands/:errandId` (exists) for title, category, status, customer id.
- Paid breakdown and customer phone: **needs: api-contract (N-1)**. `GET /payments/:errandId` (admin allowed) returns `transactions[]` with `paymentTypeId` (uuid) only, plus `merchantPayment` `{ route, amount, paidTo }` and `differencePayments`. The client may use `merchantPayment` today for the merchant-direct caption; the per-flow split needs the API.
- Admin names: **needs: api-contract (N-2)**.
- Side effects (server): every decision and payout emits `refund.updated` → customer notification (`Refund approved`, `Refund review closed`, `Refund sent`), with amounts in `KSh` (row 82; needs N-12). The decision note never goes to the customer (row 69). Nothing extra for the client to call.
- Task drawer link: `GET /errands/:id/refunds` (admin/customer, on `main`) (SA-2).
- Task states: the linked task is CANCELLED; no transition is triggered here.

## Accessibility
- Drawer is `role="dialog"` with the title as its label (A-01). Focus moves to the first focusable element (the refund amount input in `pending_review`, the receipt input in `approved`, the close button otherwise).
- Inputs have visible labels; hints and errors are tied with `aria-describedby`; invalid fields get `aria-invalid="true"`.
- Success notices are `role="status"`; errors `role="alert"`.
- Buttons are at least 36px tall; the primary action is a single full-width button so it is not confused with the quick-fill buttons.

## Resolved by owner answers
- Who may decide and record payouts (AQ-1, row 77): any authorized admin, single approval.
- Ceiling includes the item amount paid to Nitume (AQ-5, row 81) and is net of earlier refunds (row 87).
- Decision note internal (row 69): hint `Not shown to the customer.` is final.
- No receipt edits after `refunded`; corrections by an auditable correction/reversal, spec only (AQ-6, row 82).
- Decrease reviews only on `send_to_runner` (row 86).

## Open questions for the owner
- AQ-8 (payments, new 2026-10-09 round 4): §3.3 puts EXPIRED (RUNNER_ASSIGNED → EXPIRED, no runner accepts) and FAILED (RUNNER_EN_ROUTE → FAILED) after payment, but the API opens a refund review only on CANCELLED (`refunds.service.ts` `onCancelled` / `onStatusChanged`). Should a paid task that ends EXPIRED or FAILED open a refund review (trigger e.g. `expired_after_payment` / `failed_after_payment`)? That is a schema (enum) and payments change. The admin link already shows any review that exists.

## Current vs design
Re-audit 2026-10-09 round 4 against `fix/angular-admin-owner-answers` @ `f1323de`: **PASS**.
1. SA-1 / rows 81, 87: `Already refunded on this task` (API figure, else summed from `otherReviews`) and `Refundable in this review` (ceiling, 600 weight, shown when it differs from the total) built; hint, `Full refund`, validation and the `refund_exceeds_amount_paid` field error all use the ceiling (`refund-drawer.ts` `reviewCeiling`, `ceilingError`). Tested.
2. Row 82: the refunded Payout card has no input or edit control (tested); 409 `refund_payout_locked` reloads with the copy now in Error codes; amounts read `KSh` (tested).
3. SA-2: the task drawer link loads `GET /errands/:id/refunds` from PAYMENT_CONFIRMED on (EXPIRED included, accepted above), one row per review, hidden when empty, load error with `Try again`; the `/refund` fallback is gone (`refund-link.section.ts`). Tested.
4. `remainingRefundable` not displayed: accepted (Layout 2).
5. Re-audit minors m-1, m-2 still apply on the next touch.

Earlier update (spec, 2026-10-09):
Spec update 2026-10-09 against `main` @ `c7675dc` (built and PASS in `docs/audits/admin-reaudit-2026-10-09.md`; now changed):
1. SA-1 / row 87: add `Already refunded on this task` and `Refundable in this review` under `Total paid to Nitume`; the validation message now says `refundable in this review`.
2. SA-2: `refund-link.section.ts:76` shows the Refund section only for CANCELLED and falls back to `/refund`. Show it from PAYMENT_CONFIRMED on with `GET /errands/:id/refunds`, one row per review, with the load-error state.
3. Hint `Not shown to the customer.` is final (row 69); no change.
4. No receipt edit exists; keep it that way (row 82). Corrections are spec only.
5. Minor findings m-1 and m-2 from the re-audit still apply on the next touch.
Status set to `partial` until re-audited.

Earlier record (2026-10-08, before the build):
No implementation (no refund types, API methods, drawer or `DrawerKind` in `apps/admin`). The task drawer (`features/admin/drawers/task-drawer.ts`) has no Refund section.
