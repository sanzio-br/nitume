# drawer-refund — Refund review drawer

- Mockup: **not drawn. EXTENDS MOCKUP**: a fourth drawer next to `#drawer-task`, `#drawer-runner`, `#drawer-dispute`, built from the same drawer anatomy (`.drawer-head`, `.drawer-section`, `.drawer-label`, `.drawer-card`, `.drawer-row`, `.drawer-timeline`, `.drawer-actions`) and the design-system form field. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md`
- Implementation: `apps/admin/src/app/features/admin/drawers/refund-drawer.ts` (hosted by the shell's `app-ops-drawer`, `DrawerKind` `'refund'`) and `refund-link.section.ts` (task drawer link)
- Status: partial (spec update 2026-10-12 for rows 100, 102 and 96; was matches-design after the 2026-10-09 round-4 PASS; see Current vs design)

## Purpose
Show one refund review and let any authorized admin (row 77: no second approver, no amount threshold) (1) decide the refund amount, KSh 0 up to the review's ceiling, and (2) for an approved refund, record the manual M-Pesa payout with its receipt (rows 37, 54). The ceiling is what the customer paid **to Nitume** (including an item amount paid to Nitume even if the runner already bought the item, row 81) **minus refunds already approved or sent on the same task** (row 87); for a `Price decrease` review it is the decrease (`send_to_runner` tasks only, row 86). A review opens for every **paid** task that ends CANCELLED, EXPIRED or FAILED (row 102: "a review trigger, not an automatic refund") and for an approved price decrease. (3) After a payout is recorded, record an auditable **correction or reversal** of it without touching the original receipt (row 100). The refund is a record attached to the task, not a task state.

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
| `refunded`, no corrections | Summary, What was paid, Decision (read-only), Payout (read-only), `Record a correction` action, Activity |
| `refunded`, with corrections, effective payout sent | Summary, What was paid, Decision (read-only), **Current payout**, Original payout (read-only), Corrections list, `Record a correction` action, Activity |
| `refunded`, latest correction is a reversal (effective payout reversed) | as above; chip `Payout reversed`; the action is the **new payout form** (primary) instead of `Record a correction` |
| `no_refund` | Summary, What was paid, Decision (read-only), Activity |

## Layout (top to bottom, drawer body padding 18 22 30)
1. **Summary** (`.drawer-section`, no label), mirroring the mockup task drawer's first section:
   - Chip A-02 `kind="refund"` (e.g. `Needs review`).
   - `h3` 16/700, margin 10 0 4: task title (fallback rules as in `p-refunds`).
   - Muted line 12.5 slate-600: `{customer short name} · {category display name} · Opened {date, time}` (date/time Fira Code). Missing parts are dropped with their separator.
   - `.drawer-card` rows: `Task` → `#NT-XXXXX` (Fira Code) + `Open task`; `Task status` → A-02 errand chip (from the API; expected `Cancelled`, `Expired` or `Failed` for a cancellation-type review, an active or finished state for a `Price decrease`); `Reason` → trigger label (`_shared.md` §6, including `Task expired` and `Task failed`, row 102).
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
   - `refunded` (read-only `.drawer-card`): `Refund sent` → amount; `M-Pesa receipt` → reference (Fira Code); `Sent` → `paidAt` date/time; `Recorded by` → admin (N-2 fallback as above). **No edit control** of any kind on the receipt or amount once `refunded` (row 82). This card is the **original payout** and never changes, even after corrections (row 100).
5. **Corrections** (rows 82, 100; schema approved 2026-10-12, build now; `refunded` reviews only). Corrections are separate, append-only records; the original payout card above is never overwritten. See "Corrections" below for the full spec. In order, under the Payout card:
   1. When at least one correction exists, the Payout card's label becomes `Original payout`, and **above** it a `.drawer-label` `Current payout` card shows the effective payout: `Status` → A-02 chip (`Refunded` success, or `Payout reversed` pending/amber); `Amount sent` → effective amount (`KSh 0` after a reversal); `M-Pesa receipt` → effective receipt (`—` after a reversal); `Last changed` → time of the latest correction.
   2. `.drawer-label` `Corrections`: one `.drawer-card` per record, oldest first (it reads as a history).
   3. The action: `Record a correction` (`.btn .btn-outline`, full width) while the effective payout is sent; the `Record the new payout` form (primary) while it is reversed.
6. **Activity** (`.drawer-label` `Activity`, `.drawer-card` with `.drawer-timeline`, mockup timeline pattern): `Review opened` (createdAt); `Refund of KSh X approved` / `Closed with no refund` (decidedAt); `Refund sent · {receipt}` (paidAt); then one item per correction (row 100): `Payout corrected · {new receipt or KSh new amount}`, `Payout reversed · {reversal receipt}`, `New payout sent · {receipt}` (createdAt). Times `.dt-time` Fira Code 11.

## Corrections (row 100)

Owner (2026-10-12): "Build the auditable correction/reversal schema now. Original payout/receipt records remain immutable; corrections/reversals are represented separately." Copy is **(proposed)**. Any authorized admin may record one (row 77, no second approver).

### Kinds
| API `kind` | When | Admin label | Fields | Effect on the effective payout |
|---|---|---|---|---|
| `corrected` | Effective payout is sent; the receipt was typed wrong and/or the amount actually sent differs from the record | `Payout corrected` | `newReference` (optional), `newAmount` (optional), at least one of them, and different from the current effective value; `reason` (required) | receipt and/or amount replaced by the new values |
| `reversed` | Effective payout is sent; the M-Pesa payment was reversed (wrong number, failed delivery) and the money came back | `Payout reversed` | `newReference` = the reversal's M-Pesa code (required); `reason` (required) | amount sent becomes 0; chip `Payout reversed`; the refund is owed again |
| `resent` | Effective payout is reversed; ops sent the refund again | `New payout sent` | `newReference` (required), `newAmount` (required, prefilled with the review's `refundAmount`), `reason` (required) | sent again with the new receipt and amount |

A partial reversal is a `corrected` record with the lower amount. The review's `status` stays `refunded` throughout; `refundAmount` (the decision) never changes. The effective payout is what counts for the customer view, reconciliation and the cumulative cap of other reviews on the task (row 87).

### Correction card (one per record, read-only)
`.drawer-card`, first row: kind label (Fira Sans 13/600, blue) left, date/time (Fira Code 11 slate-600) right. Then `.drawer-row`s, only those that apply:
- `Receipt` → `{previousReference} → {newReference}` for `corrected` with a new receipt (both Fira Code; the arrow is a Fira Sans `→`)
- `Amount sent` → `KSh {previousAmount} → KSh {newAmount}` for `corrected` with a new amount
- `Reversal receipt` → `newReference` for `reversed`
- `M-Pesa receipt` → `newReference` and `Amount sent` → `newAmount` for `resent`
- `Reason` → text, Fira Sans 13, wraps (never truncated)
- `Recorded by` → admin name (N-2; masked id fallback; `You` for the signed-in admin)
No edit, delete or undo control on a card. A mistake in a correction is fixed with another correction.

### Form (inline in the drawer, replaces the action button while open)
`.drawer-label` `Record a correction` (or `Record the new payout` when reversed), content on a `.drawer-card`:
1. Only while the effective payout is sent: A-09 segmented toggle, label `What happened?`, options `Wrong receipt or amount` (`corrected`, default) and `Payout reversed` (`reversed`). Switching keeps the reason text and clears the other fields.
2. `corrected`:
   - A-06 `Correct M-Pesa receipt` (optional): as the payout receipt input (Fira Code, upper case, maxlength 64, placeholder `e.g. SLK4H7XQ2P`). Hint: `Leave empty if the receipt was right. Current: {effective receipt}` (receipt Fira Code).
   - A-06 `Correct amount sent` (optional): money input (`_shared.md` §3). Hint: `Leave empty if the amount was right. Current: KSh {effective amount}. Up to KSh {ceiling}.`
3. `reversed`:
   - Instruction 13 blue: `Use this when the M-Pesa payment of KSh {effective amount} was reversed and the money came back. The refund will show as not sent until you record a new payout.`
   - A-06 `Reversal M-Pesa code` (required), same input rules. Hint: `The code M-Pesa gave for the reversal.`
4. `resent` (effective payout reversed; no toggle):
   - Instruction 13 blue: `Send KSh {refundAmount} to the customer by M-Pesa again, then enter the new receipt here.` (plus the phone hint from Payout when the number is unavailable)
   - A-06 `M-Pesa receipt` (required), same input rules.
   - A-06 `Amount sent` (required), money input prefilled with `refundAmount`. Hint: `Up to KSh {ceiling}.`
5. A-06 `Reason` (required, all kinds): textarea 3 rows, max 500, Fira Code counter `0/500`. Hint: `Kept in the audit history. Not shown to the customer.`
6. `.drawer-actions`: `.btn .btn-outline` `Cancel` (closes the form; asks the A-08 discard dialog if anything was typed) + `.btn .btn-primary` `Save correction` / `Record reversal` / `Record new payout`, disabled while any field is invalid.

The ceiling for `newAmount` is the API's `correctionCeiling` (the review's own basis `amountPaid`, net of the effective payouts of the task's **other** approved/refunded reviews, row 87).

### Validation (corrections)
| Field | Rule | Message (`.field-error`) |
|---|---|---|
| Correct receipt / Reversal code / M-Pesa receipt | trimmed, `^[A-Za-z0-9-]{4,64}$` (required for `reversed`, `resent`) | `Enter the M-Pesa code, letters and numbers only.` |
| Correct receipt | differs from the current effective receipt | `This is already the receipt on record.` |
| Correct amount / Amount sent | number > 0, at most 2 decimals | `Enter an amount in KSh, up to 2 decimal places.` |
| Correct amount / Amount sent | ≤ `correctionCeiling` | `The amount can't be more than KSh {ceiling} for this review.` (AQ-10) |
| Correct amount | differs from the current effective amount | `This is already the amount on record.` |
| `corrected` | at least one of receipt or amount filled | form-level, under the two fields: `Enter the correct receipt, the correct amount, or both.` |
| Reason | required, 5–500 characters after trimming | `Say why you're making this change.` |

Validate on blur and on submit; re-validate on input after an error.

### Confirm dialogs (A-08)
- `corrected`: title `Save this correction?` · body `The original payout record stays as it is. This correction is added to the history and can't be edited or deleted.` (then, when given, `New receipt {R}.` / `Amount sent KSh {x}.`, Fira Code) · buttons `Back` / `Save correction`.
- `reversed`: title `Record that this payout was reversed?` · body `Reversal code {R}. The refund will show as not sent until you record a new payout. This can't be edited or deleted.` · buttons `Back` / `Record reversal`.
- `resent`: title `Record a new payout of KSh {x}?` · body `M-Pesa receipt {R}. The customer will be told the refund has been sent. This can't be edited or deleted.` · buttons `Back` / `Record new payout`.

### Success notices (A-11 success)
- `corrected`: `Correction saved. The original record is unchanged.`
- `reversed`: `Reversal recorded. Send the refund again and record the new payout.`
- `resent`: `New payout recorded.`

### Error codes (A-14)
| Response | UI |
|---|---|
| 409 `refund_not_refunded` | Reload; A-11 info `Corrections can only be added after a payout is recorded. Showing the latest.` |
| 409 `payout_correction_conflict` (another admin added a correction since this drawer loaded; the request carries `expectedLatestCorrectionId`) | Reload; keep the typed reason; A-11 info `Another admin changed this payout. Check the latest before you save.` |
| 409 `payout_correction_kind_invalid` (e.g. `reversed` on a reversed payout) | Reload; A-11 info `This payout changed. Showing the latest.` |
| 409 `payout_reference_reused` (the receipt is already on this or another payout) | Field error `This M-Pesa code is already recorded on a payout.` |
| 400 `refund_exceeds_amount_paid` (extra `correctionCeiling`) | Field error with the returned ceiling; reload the review |
| 400 `correction_no_change` | Form-level error `Nothing to correct: the receipt and amount match the record.` |
| 400 validation (`message[]`) | Map to the field errors above |
| 403, 404, network / 5xx | As in Error codes below |

### Customer view (row 100)
The customer sees **no** correction records, reasons, receipts or admin names (rows 69, 101). Their refund group on `v-task-detail` reflects the **latest effective payout** only: `Refunded` with the effective amount and the time of the latest sent payout; after a reversal not yet re-sent, `Refund approved` (`We'll send you this refund and update this page when it's sent.`) with the approved amount. Notifications: AQ-9 (default: only `resent` notifies, with the usual `Refund sent` text).

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
| `POST /refunds/:id/corrections` | see "Corrections" → Error codes | |
| `POST /refunds/:id/mark-paid` | 409 `refund_not_approved` | Reload; A-11 info `This refund isn't approved, so it can't be marked as sent. Showing the latest.` |
| same | 409 `refund_payout_locked` (row 82: the review is already `refunded`; extra `payoutReference`, `paidAt`) | Reload (read-only Payout card); A-11 info `This refund was already marked as sent. Its receipt can't be changed. Showing the latest.` (builder copy, accepted 2026-10-09 round 4) |
| same | 400 validation (`payoutReference must be an M-Pesa receipt`) | Field error from the table above |
| any | 404 | A-11 info `This refund review no longer exists.` |
| any | 403 | `_shared.md` §2 |
| any | network / 5xx | A-11 danger `Couldn't save. Check your connection and try again.`; inputs kept |

Note: a pending review's `amountPaid` can rise if an STK payment completes after cancellation (`openWithin` refreshes it while `pending_review`). Always validate against the value from the latest fetch.

## Task drawer link (small addition to `drawer-task`, EXTENDS MOCKUP; amended SA-2)
For any task **from PAYMENT_CONFIRMED on** (PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER, COMPLETED, CONFIRMED, SETTLED, DISPUTED, CANCELLED, FAILED, EXPIRED), the task drawer calls `GET /errands/:id/refunds` (admin allowed, on `main`; returns `[]`, never 404). Not called for DRAFT, REQUESTED, QUOTED, ACCEPTED (nothing paid yet). EXPIRED is included: §3.3 reaches it only from RUNNER_ASSIGNED, so every EXPIRED task was paid (corrected 2026-10-09 round 4; the earlier "EXPIRED tasks that never reached payment" carve-out described a transition that does not exist). Row 102 (decided 2026-10-12): the API opens a review for a paid task that ends EXPIRED or FAILED too (`Task expired`, `Task failed`, needs N-16), so those tasks will show a review here. Non-empty → a `.drawer-section` `Refund` with one `.drawer-row` per review, newest first: reason label (Fira Sans), chip A-02 `kind="refund"`, `refundAmount` or `amountPaid` (Fira Code), and an `Open refund review` `.btn .btn-text` that switches the drawer to this one with that `id`. Empty → section hidden. Load error → the section shows 12 slate-600 `Couldn't load refunds.` + `.btn .btn-text` `Try again`; the rest of the drawer still renders. The old single `GET /errands/:id/refund` fallback can go.

## Components
| Pattern | Id | Status |
|---|---|---|
| Drawer shell | A-01 | exists |
| Chips (`kind="refund"` and errand) | A-02 | exists; **NEW** `kind` input |
| Drawer section/card/row/timeline/actions | A-05 | exists |
| Form field + hint + error | A-06 | exists (`.field*`); **NEW** `.field-hint`, `.field-error`, `app-form-field` |
| Buttons | A-07 | exists |
| Confirm dialog | A-08 | exists (`shared/confirm-dialog.component.ts`) |
| Segmented toggle (correction kind) | A-09 | exists (`shared/segmented-toggle.component.ts`) |
| Notices | A-11 | exists (`shared/inline-notice.component.ts`) |
| Formatting (EAT times, §3.1) | A-13 | exists (`features/admin/shared-format.ts`) |
| Error mapping | A-14 | exists |
| Correction card | A-05 drawer card + rows | exists (pattern); build one `refund-correction-card` component in the refund feature folder, not inline markup per kind |

## Copy (proposed; collected)
`Refund review`, `What the customer paid`, `Service + runner fee`, `Item amount (paid to Nitume)`, `Price change difference`, `Total paid to Nitume`, `Already refunded on this task`, `Refundable in this review`, `Refund to`, `Decision`, `Refund amount`, `Full refund`, `No refund`, `Note for the ops record (optional)`, `Not shown to the customer.`, `Approve refund`, `Approve refund · KSh {x}`, `Close with no refund`, `Record the payout`, `M-Pesa receipt`, `Mark as refunded`, `Refund sent`, `Sent`, `Recorded by`, `Decided`, `Decided by`, `Note`, `Activity`, `Review opened`, `Open task`, `Task expired`, `Task failed`; corrections: `Current payout`, `Original payout`, `Corrections`, `Amount sent`, `Last changed`, `Payout reversed`, `Payout corrected`, `New payout sent`, `Record a correction`, `Record the new payout`, `What happened?`, `Wrong receipt or amount`, `Correct M-Pesa receipt`, `Correct amount sent`, `Reversal M-Pesa code`, `Reversal receipt`, `Reason`, `Kept in the audit history. Not shown to the customer.`, `Save correction`, `Record reversal`, `Record new payout`, `Cancel`; plus the dialog, notice and error strings above. No wallet/balance/escrow/held/release/credit wording (`_shared.md` §3). No wallet/balance/escrow/held/release/credit wording (`_shared.md` §3).

## Numeric fields (Fira Code)
Task id, every amount (paid rows, total, already refunded, refundable in this review, refund amount input value and read-only value, amounts inside button labels, dialogs and notices), the customer phone, the M-Pesa receipt (input and read-only), all dates/times (`Opened`, `Decided`, `Sent`, activity times), the note counter `0/1000`; corrections: every receipt and reversal code, every amount (previous, new, effective, ceiling in hints), every date/time (`Last changed`, card times, activity), the reason counter `0/500`. All times are 12-hour EAT (`_shared.md` §3.1, row 96).

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
- Corrections (N-15, rows 82, 100; **needs: api-contract**):
  - Table `refund_payout_corrections` (system design §2.2), append-only: no update or delete path in code; recommended DB guard (trigger or revoked UPDATE/DELETE). `refund_reviews` payout columns stay locked (409 `refund_payout_locked`, unchanged).
  - `POST /refunds/:id/corrections` (admin) body `{ kind: 'corrected' | 'reversed' | 'resent', newReference?: string, newAmount?: number, reason: string, expectedLatestCorrectionId: string | null }` → the updated `RefundReview`. Rules: review must be `refunded`; `corrected`/`reversed` only while the effective payout is sent, `resent` only while reversed; receipt regex as mark-paid, upper-cased; `newAmount` > 0, 2 dp, ≤ `correctionCeiling`; `reason` 5–500 trimmed; `newReference` not already used by any refund payout or correction. Errors as in "Corrections" → Error codes. Writes the record with `previousReference`/`previousAmount` snapshotted, `createdByUserId`, `createdAt` in one transaction with the conflict check.
  - Admin refund responses (detail, list items, decision, mark-paid, corrections): `corrections[]` (detail only, oldest first: `{ id, kind, previousReference, previousAmount, newReference, newAmount, reason, createdByUserId, createdAt }`), `effectivePayout` `{ state: 'sent' | 'reversed', amount, reference, at } | null` (list and detail), `correctionCeiling` (detail, `refunded` only).
  - Status filter: `GET /refunds?status=approved` (`Payout due`) also returns `refunded` reviews whose effective payout is reversed (they need a payout); the list item's `effectivePayout.state` lets the panel show `Payout reversed`.
  - Customer view (`GET /errands/:id/refunds`, `toCustomerView`): `status` `approved` and `paidAt` null while the effective payout is reversed; otherwise `refunded` with `refundAmount` = effective amount and `paidAt` = time of the latest sent payout (original or `resent`). Never the corrections, reasons, receipts or admin ids.
  - Cumulative cap (row 87): other reviews' `alreadyRefunded` uses effective amounts.
  - Events: `refund.updated` on every record (admin refresh); customer notification only on `resent` (AQ-9 default).
- Expired/failed triggers (N-16, row 102): `expired_after_payment`, `failed_after_payment`.
- Task states: a cancellation-type review's task is CANCELLED, EXPIRED or FAILED (row 102); a decrease review's task is usually active. No transition is triggered here.

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
- AQ-8 → row 102 (2026-10-12): paid tasks ending EXPIRED or FAILED open a review too (`Task expired`, `Task failed`); a review, not an automatic refund.
- Row 100 (2026-10-12): correction/reversal records built now; the original receipt is immutable (section "Corrections").
- AQ-7 → row 96: times in 12-hour EAT (`_shared.md` §3.1).
- Row 95: a refund on a `send_to_runner` task never has to claw back an item advance from the runner, because the item amount is reimbursed only after the task is CONFIRMED. The ceiling rule (row 81) is unchanged.

## Open questions for the owner
- AQ-9 (payments, default given): customer notification on corrections and reversals (default: only a new payout after a reversal notifies).
- AQ-10 (payments, default given): a correction amount above the ceiling (an over-payment) is refused (default); the over-payment is handled outside the app.

## Current vs design
Spec update 2026-10-12 (owner rows 96, 100, 102) against `main` @ `4963a1c`: status set to **partial**.
1. Row 100: nothing built for corrections (`refund-drawer.ts` has the read-only Payout card only, correct for row 82). Build the "Corrections" section: Current/Original payout cards, correction cards, the inline form with the A-09 kind toggle, validation, dialogs, notices, error mapping, Activity items. Needs N-15 from api-contract first.
2. Row 102: `refund-labels.ts` has no labels for `expired_after_payment` / `failed_after_payment` (falls back to title-cased raw values). Add `Task expired` / `Task failed`; add the `Payout reversed` chip label (effective payout). Needs N-16 for real data; the labels can ship first.
3. Row 96: the drawer already uses `formatDateTime` (EAT, 12-hour). No change here.

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
