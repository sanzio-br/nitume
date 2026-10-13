# drawer-runner-payout — Runner payout line drawer (reimbursement review, payout, corrections)

- Mockup: **not drawn. EXTENDS MOCKUP** (row 112). Same drawer anatomy and form patterns as `drawer-refund` (A-01, A-05, A-06, A-08, A-09, A-11). Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3, §3.1, §6.1, §7 N-17 …)
- API: `feat/api-owner-answers-6` @ `10b6019` (read-only): `GET /runner-payouts/:id`, `POST /runner-payouts/:id/review`, `/hold`, `/corrections`, `POST /runner-payouts/mark-paid`
- Implementation: none
- Status: missing

## Purpose
Show one runner payout line and let any authorized admin (row 77 rule applied to runner payouts) (1) review an `on_hold` item reimbursement: approve an amount up to the cap, or reject with a note (rows 105, 106, 108, 135); (2) put an unpaid payable item line back on hold when the receipt does not match (row 105); (3) record the manual M-Pesa payout of this line alone; (4) after it is paid, record an append-only correction, reversal or re-sent payout (row 107, same rules as refund corrections, row 100); (5) on CANCELLED/FAILED tasks, see the task's combined exposure and override it with a reason (row 136).

## Entry / exit
- Entry: `p-runner-payouts` row; the task drawer's new `Runner payouts` section (SA-3, below); `p-payout-requests` drawer links.
- Head title: `Runner payout`. Close: ✕, overlay, ESC. Unsaved form → A-08 `Discard this decision?` / `What you entered will be lost.` / `Back` · `Discard`.
- `Open task` (`.btn .btn-text`) → task drawer; `Open runner` → `drawer-runner`.

## States
| Effective status (stored) | Sections |
|---|---|
| `on_hold` | Summary, Amounts, Receipt, **Review form**, Activity |
| `payable` (`payable`) | Summary, Amounts, Receipt, **Payout form**, `Put back on hold` (item lines only), Activity |
| `paid` | Summary, Amounts, Receipt, Payout (read-only), Corrections, `Record a correction`, Activity |
| `payable` (stored `paid`, latest adjustment a reversal) | as `paid`; chip `Payout reversed`; the standing action is the **re-send form** (no mark-paid) |
| `rejected` | Summary, Amounts, Receipt, Decision (read-only), Activity |

## Layout (drawer body padding 18 22 30)
1. **Summary**: A-02 chip (`kind="runner_payout"`, §6.1); `h3` 16/700 task title; muted line `{runner shortName} · {Runner fee | Item reimbursement} · Created {date, time}`. `.drawer-card` rows: `Task` → `#{reference}` + `Open task`; `Task status` → errand chip; `Runner` → name + `Open runner`; `Pay to` → `runner.phone` (Fira Code; `Not available` when null); for `on_hold` `Why it's on hold` → review reason label (§6.1).
2. **Amounts** (`.drawer-label` `Amounts`, `.drawer-card`):
   - `Requested` → `requestedAmount` (what the system computed at CONFIRMED or the runner claimed).
   - Item lines: `Item paid to Nitume` → `itemPaidToNitume`; `Runner's purchase limit` → `runner.maxPurchaseAdvance` (+ `Change` link → `drawer-runner` purchase-limit section, row 138); `Most you can approve` → `approvalCeiling` (600 weight; = min(requested, item paid to Nitume, cap at creation, purchase limit), rows 105, 135).
   - `Approved amount` → `amount` once decided.
   - Three flows stay apart: never show the customer's service fee or the runner fee on an item line, or the item on a fee line.
3. **Task exposure** (row 136; item lines on a CANCELLED/FAILED task only; **needs N-18**): `.drawer-label` `Task exposure`; rows `Item paid to Nitume` → amount; `Customer refunds committed` → sum of approved/refunded refund reviews on the task (row 111 counting); `Runner reimbursement committed` → other approved/paid item lines on the task; `Left within the cap` → amount (600). Caption 12 slate-600: `The customer refund and the runner's item reimbursement share one cap on a cancelled or failed task.`
4. **Receipt**: `.drawer-card` with the receipt evidence thumbnail (`receiptEvidenceId`, signed URL from the evidence endpoint; opens full size in a new tab) and `Uploaded` time; `No receipt on file` (12.5 slate-600) when null. Runner's note (`note`) under it in Fira Sans 13 when present (label `Runner's note` for claims, `System note` otherwise).
5. **Review form** (`on_hold`, `.drawer-label` `Decision`):
   1. A-09 toggle `Approve` / `Reject` (default Approve).
   2. Approve: A-06 `Amount to reimburse` (money input, `KSh` prefix, Fira Code, autofocus) with hint `Up to KSh {approvalCeiling}.`; quick-fill `.btn .btn-outline` small `Full amount` (sets the ceiling). When the amount is above `Left within the cap` (row 136): the field shows A-11 info `This is above the task's combined cap by KSh {x}.` and an extra required A-06 `Reason for going over the cap` (textarea, 20–500) appears; the request carries the override (needs N-18). A-06 `Note for the ops record (optional)` (≤ 500, counter; hint `Not shown to the runner.`).
   3. Reject: A-06 `Reason` (required, 5–500, counter; hint `Not shown to the runner. The runner is told the reimbursement wasn't approved.` — the runner copy is in `docs/specs/runner/v-notifications.md`).
   4. `.drawer-actions`: full-width primary `Approve · KSh 4,000` / `Reject reimbursement` (label follows the toggle and the amount).
   5. Confirm A-08: approve `Approve KSh {amount} for {runner}?` / `It becomes payable at once and is added to the runner's available balance.`; reject `Reject this reimbursement?` / `The line closes and can't be reopened.` Buttons `Back` / the action.
   6. Request `POST /runner-payouts/:id/review` `{ decision: 'approve', amount, note? }` or `{ decision: 'reject', note }` → detail. Errors: 409 `runner_payout_not_in_review` → reload + A-11 `This line was already decided.`; 400 `reimbursement_exceeds_cap` (`cap`) → field error `You can approve up to KSh {cap}.`; 400 `decision_note_required` → field error on Reason.
6. **Payout form** (`payable`, stored `payable`, `.drawer-label` `Record the payout`): instruction 13 blue `Send KSh {amount} to {phone} by M-Pesa, then enter the receipt.`; A-06 `M-Pesa receipt` (rules as `p-runner-payouts`); primary `Mark as paid`; caption 12 slate-600 `To pay several lines of this runner in one M-Pesa payment, use Runner payouts.` Request `POST /runner-payouts/mark-paid` `{ lineIds: [id], payoutReference }`; errors as the panel.
   - `Put back on hold` (item lines, unpaid, `.btn .btn-outline` full width under the form) → inline A-06 `What's wrong with the receipt?` (required, 5–500) + `Put on hold` → `POST /runner-payouts/:id/hold` `{ note }`; 409 `runner_payout_not_holdable` → reload.
7. **Decision** (read-only, `rejected` and decided lines): `Decision` → `Approved KSh x` / `Rejected`; `Decided` → time; `Decided by` → admin (`You` for the signed-in admin); `Note` → `decisionNote`.
8. **Payout** (read-only, paid): `Paid` → `amount`; `M-Pesa receipt` → `payoutReference`; `Sent` → `paidAt`; `Recorded by` → `paidBy`. Never editable (row 107: paid lines are final). With adjustments: label becomes `Original payout`, and a `Current payout` card above it from `effectivePayout` (`Status` chip, `Amount sent`, `M-Pesa receipt` (`—` after a reversal), `Last changed`), exactly as `drawer-refund` §5.
9. **Corrections** (paid lines): one card per adjustment from `corrections[]`, oldest first, same card as `drawer-refund` "Correction card" with the API kinds `correction` → `Payout corrected`, `reversal` → `Payout reversed`, `resent_payout` → `Payout sent again`. Form identical to `drawer-refund` "Form" (A-09 `Wrong receipt or amount` / `Payout reversed` while sent; the re-send form with no toggle and no Cancel while reversed, prefilled with `amount`), the same validation table, with the ceiling `correctionCeiling` (= the line amount) and message `The amount can't be more than KSh {ceiling} for this line.` Request `POST /runner-payouts/:id/corrections` `{ kind, newReference?, newAmount?, reason, expectedLatestCorrectionId }` → 201 detail. Errors: 409 `payout_correction_conflict` → reload, keep the reason, A-11 `Someone else changed this payout. Check the latest and try again.`; 409 `runner_payout_not_paid`, `payout_correction_kind_invalid` → reload; 409 `payout_reference_reused` → field error; 400 `correction_no_change`, `runner_payout_exceeds_amount` (`correctionCeiling`), `payout_reference_required`, `payout_amount_required`, `payout_amount_not_allowed`, `correction_reason_invalid` → the matching field errors from `drawer-refund`.
   - **A reversed line is never paid through `mark-paid`** (409 `runner_payout_locked`): it is re-sent here with `resent_payout`.
10. **Activity** (timeline): `Line created` (createdAt; `Claimed by the runner` for a claim), `Put on hold · {reason label}`, `Approved · KSh x` / `Rejected`, `Paid · {receipt}`, each adjustment (`Payout corrected · …`, `Payout reversed · {code}`, `Payout sent again · {receipt}`), `Cap override · KSh x` (N-18). Times Fira Code 11.

## SA-3: task drawer section `Runner payouts`
In the task drawer (`drawer-task`), for tasks at CONFIRMED or later and CANCELLED/FAILED tasks with lines: `.drawer-label` `Runner payouts`, one `.drawer-row` per line from `GET /runner-payouts?errandId=` (`Runner fee` / `Item reimbursement` → amount + chip), row click → this drawer. Hidden when there are no lines.

## Components
A-01, A-02 (`kind="runner_payout"`, NEW), A-05, A-06, A-08, A-09, A-11, A-13, A-14; the correction card and form are the **same components** as `drawer-refund` (generalise `app-refund-correction-card` and the correction form helpers to take labels and the endpoint; no copy).

## Numeric fields (Fira Code)
References, every amount, ceilings, receipts and reversal codes (as explicit `.num` parts, not regex-detected: m-11), phone, times, counters.

## Data
- `GET /runner-payouts/:id` → `AdminRunnerPayoutDetail` = list item + `runner { id, userId, displayName, shortName, phone, maxPurchaseAdvance }`, `itemPaidToNitume`, `approvalCeiling` (on_hold item lines), `corrections[] { id, kind, previousReference, previousAmount, newReference, newAmount, reason, createdBy, createdAt }`, `correctionCeiling` (paid lines). Built.
- Review / hold / corrections / mark-paid: built (above). Notifications to the runner on approve, reject, paid, reversed: RA-6 (copy in the runner spec).
- Task exposure and override (row 136): **missing, N-18**.
- Receipt image: the evidence endpoint for the errand (admin may view).

## Accessibility
As `drawer-refund`: focus to the first field on open of a form state; focus returns to the action after Cancel/Discard (m-10 rule); errors announced; the toggle is a radio group.

## Owner decisions applied
Rows 104–108, 112, 135 (cap = min(item paid, purchase limit); `approvalCeiling` already applies it), 136 (combined cap with override), 138 (limit link).

## Open questions for the owner
- RQ-23 (`docs/audits/runner-gap-report.md` §9): approval capped at the purchase limit even when ops accept an over-limit purchase; default: raise the runner's limit first (audited).
- RQ-26: storage for the combined-cap override (who, when, amount, reason).

## Current vs design
Not built.
