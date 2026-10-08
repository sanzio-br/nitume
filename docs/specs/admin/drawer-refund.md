# drawer-refund — Refund review drawer

- Mockup: **not drawn. EXTENDS MOCKUP**: a fourth drawer next to `#drawer-task`, `#drawer-runner`, `#drawer-dispute`, built from the same drawer anatomy (`.drawer-head`, `.drawer-section`, `.drawer-label`, `.drawer-card`, `.drawer-row`, `.drawer-timeline`, `.drawer-actions`) and the design-system form field. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md`
- Implementation: none. Expected at `apps/admin/src/app/features/admin/drawers/refund-drawer.ts`, hosted by the shell's single `app-ops-drawer` (new `DrawerKind` `'refund'`).
- Status: missing

## Purpose
Show one refund review and let an admin (1) decide the refund amount, KSh 0 up to everything the customer paid Nitume, and (2) for an approved refund, record the manual M-Pesa payout with its receipt (rows 37, 54). The refund is a record attached to a CANCELLED task, not a task state.

## Entry / exit
- Entry: a row in `p-refunds`; `Open refund review` in the dispute drawer after a customer-favourable verdict (`drawer-dispute-outcome.md`); `Refund review` row in the task drawer of a CANCELLED task that has one (see "Task drawer link" below).
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
   - `Item amount (paid to Nitume)` → amount, only when the item amount went through Nitume (send_to_runner, row 42)
   - `Price change difference` → amount, one row per completed difference payment
   - `Total paid to Nitume` → `amountPaid`, 600 weight, the row above it has the hairline
   - Under the card, 12 slate-600 caption when the merchant was paid directly: `The item amount (KSh 4,000) was paid straight to the merchant. Nitume didn't collect it, so it isn't part of this refund.`
   - Until the breakdown exists (needs N-1), show only `Total paid to Nitume` and the caption `Breakdown by payment isn't available yet.`
   - Customer M-Pesa row: `Refund to` → customer phone (Fira Code) `+254 7XX XXX 123` (needs N-1). Without it: `Refund to` → `Customer's M-Pesa number not available` (12.5 slate-600) and the payout form shows a hint to look it up (see 4).
3. **Decision**
   - `pending_review` (form, `.drawer-label` `Decision`; content on a `.drawer-card`):
     1. Field A-06 `Refund amount`: money input (§3), `KSh` prefix, Fira Code value, `inputmode="decimal"`, autofocus when the drawer opens on this state. Hint: `Between KSh 0 and KSh {amountPaid}. KSh 0 closes the review with no refund.`
     2. Quick fill, row of two `.btn .btn-outline` small buttons (12.5/600, padding 7 14) under the field: `Full refund` (sets `amountPaid`) and `No refund` (sets `0`). They only fill the field; they never submit.
     3. Field A-06 `Note for the ops record (optional)`: textarea 3 rows, `.field-input`, max 1000; Fira Code counter `0/1000` right-aligned under it. Hint: `Not shown to the customer.` (SQ-10 default; change with the owner's answer.)
     4. `.drawer-actions`: one full-width `.btn .btn-primary` whose label follows the amount: amount > 0 → `Approve refund · KSh 1,200` (amount Fira Code); amount = 0 → `Close with no refund`; empty/invalid → `Approve refund` disabled.
     5. Submit → A-08 confirm (copy below) → request → success notice.
   - `approved` / `refunded` / `no_refund` (read-only `.drawer-card`): `Refund amount` → amount (`KSh 0` for no_refund); `Decided` → date/time; `Decided by` → admin name (N-2; fallback masked id `…a1b2`; `You` when it is the signed-in admin); `Note` → the decision note in Fira Sans 13 (row omitted when empty).
4. **Payout**
   - `approved` (form, `.drawer-label` `Record the payout`): 
     1. Instruction 13 blue: `Send KSh {refundAmount} to the customer by M-Pesa, then enter the M-Pesa receipt here.` When the phone is unavailable, add 12 slate-600: `Find the customer's number from the task before you send.`
     2. Field A-06 `M-Pesa receipt`: text input, Fira Code, uppercase as typed (`text-transform` plus value normalised to upper case before sending), `autocomplete="off"`, `spellcheck="false"`, placeholder `e.g. SLK4H7XQ2P`, maxlength 64.
     3. `.drawer-actions`: full-width `.btn .btn-primary` `Mark as refunded`, disabled until the receipt passes validation.
   - `refunded` (read-only `.drawer-card`): `Refund sent` → amount; `M-Pesa receipt` → reference (Fira Code); `Sent` → `paidAt` date/time; `Recorded by` → admin (N-2 fallback as above).
5. **Activity** (`.drawer-label` `Activity`, `.drawer-card` with `.drawer-timeline`, mockup timeline pattern): `Review opened` (createdAt); `Refund of KSh X approved` / `Closed with no refund` (decidedAt); `Refund sent · {receipt}` (paidAt). Times `.dt-time` Fira Code 11.

## Validation (client, mirrors `DecideRefundDto` / `MarkRefundPaidDto` / `RefundsService`)
| Field | Rule | Message (`.field-error`) |
|---|---|---|
| Refund amount | required | `Enter a refund amount, or KSh 0 for no refund.` |
| Refund amount | number, ≥ 0, at most 2 decimals (after stripping `,` and spaces) | `Enter an amount in KSh, up to 2 decimal places.` |
| Refund amount | ≤ `amountPaid` | `The refund can't be more than the KSh {amountPaid} the customer paid.` |
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
| same | 400 `refund_exceeds_amount_paid` (extra `amountPaid`) | Field error with the returned `amountPaid`; reload the review (the paid total may have changed after a late payment) |
| same | 400 validation (`message[]`) | Field error `Enter an amount in KSh, up to 2 decimal places.` |
| `POST /refunds/:id/mark-paid` | 409 `refund_not_approved` | Reload; A-11 info `This refund isn't approved, so it can't be marked as sent. Showing the latest.` |
| same | 400 validation (`payoutReference must be an M-Pesa receipt`) | Field error from the table above |
| any | 404 | A-11 info `This refund review no longer exists.` |
| any | 403 | `_shared.md` §2 |
| any | network / 5xx | A-11 danger `Couldn't save. Check your connection and try again.`; inputs kept |

Note: a pending review's `amountPaid` can rise if an STK payment completes after cancellation (`openWithin` refreshes it while `pending_review`). Always validate against the value from the latest fetch.

## Task drawer link (small addition to `drawer-task`, EXTENDS MOCKUP)
For a CANCELLED task, the task drawer calls `GET /errands/:id/refund` (admin allowed). 200 → a `.drawer-section` `Refund` with one `.drawer-row`: chip A-02 `kind="refund"` + `refundAmount` or `amountPaid`, and an `Open refund review` `.btn .btn-text` that switches the drawer to this one with the returned `id`. 404 `refund_not_found` → section hidden.

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
`Refund review`, `What the customer paid`, `Service + runner fee`, `Item amount (paid to Nitume)`, `Price change difference`, `Total paid to Nitume`, `Refund to`, `Decision`, `Refund amount`, `Full refund`, `No refund`, `Note for the ops record (optional)`, `Not shown to the customer.`, `Approve refund`, `Approve refund · KSh {x}`, `Close with no refund`, `Record the payout`, `M-Pesa receipt`, `Mark as refunded`, `Refund sent`, `Sent`, `Recorded by`, `Decided`, `Decided by`, `Note`, `Activity`, `Review opened`, `Open task`, plus the dialog, notice and error strings above. No wallet/balance/escrow/held/release/credit wording (`_shared.md` §3).

## Numeric fields (Fira Code)
Task id, every amount (paid rows, total, refund amount input value and read-only value, amounts inside button labels, dialogs and notices), the customer phone, the M-Pesa receipt (input and read-only), all dates/times (`Opened`, `Decided`, `Sent`, activity times), the note counter `0/1000`.

## Data
- `GET /refunds/:id` (admin, exists) → `RefundReview` `{ id, errandId, trigger, amountPaid, refundAmount, status, decisionNote, decidedByUserId, decidedAt, payoutReference, paidByUserId, paidAt, createdAt, updatedAt }`.
- `PATCH /refunds/:id/decision` body `{ refundAmount: number, note?: string }` (admin, exists) → updated `RefundReview`. `refundAmount` 0 → `no_refund`, > 0 → `approved`. Only from `pending_review`.
- `POST /refunds/:id/mark-paid` body `{ payoutReference: string }` (admin, exists) → updated `RefundReview` (`refunded`). Only from `approved`.
- Task summary: `GET /errands/:errandId` (exists) for title, category, status, customer id.
- Paid breakdown and customer phone: **needs: api-contract (N-1)**. `GET /payments/:errandId` (admin allowed) returns `transactions[]` with `paymentTypeId` (uuid) only, plus `merchantPayment` `{ route, amount, paidTo }` and `differencePayments`. The client may use `merchantPayment` today for the merchant-direct caption; the per-flow split needs the API.
- Admin names: **needs: api-contract (N-2)**.
- Side effects (server): every decision and payout emits `refund.updated` → customer notification (`Refund approved`, `Refund review closed`, `Refund sent`). Nothing extra for the client to call.
- Task states: the linked task is CANCELLED; no transition is triggered here.

## Accessibility
- Drawer is `role="dialog"` with the title as its label (A-01). Focus moves to the first focusable element (the refund amount input in `pending_review`, the receipt input in `approved`, the close button otherwise).
- Inputs have visible labels; hints and errors are tied with `aria-describedby`; invalid fields get `aria-invalid="true"`.
- Success notices are `role="status"`; errors `role="alert"`.
- Buttons are at least 36px tall; the primary action is a single full-width button so it is not confused with the quick-fill buttons.

## Open questions for the owner
- AQ-1 (who may approve; second approval above an amount).
- AQ-5 (refund ceiling includes the item amount paid to Nitume even if the runner already bought the item).
- SQ-10 / row 69 (customer sees the decision note?): the hint copy assumes no.
- Should an admin be able to correct a payout receipt after `refunded`? The API has no edit; build default: no.

## Current vs design
No implementation (no refund types, API methods, drawer or `DrawerKind` in `apps/admin`). The task drawer (`features/admin/drawers/task-drawer.ts`) has no Refund section.
