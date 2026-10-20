# v-job-summary — Job complete

- Mockup: `docs/design/nitume_runner_app.html` lines 403–416 (`#v-job-summary`, overlay)
- Shared conventions: `_shared.md` (§8 money and reimbursement, rows 95, 104–107)
- Implementation: none. On `main`: core `ReceiptCard` / `ReceiptRow` / `ReceiptSeparateGroup` (C-18), `RunnerPayoutRepository.payoutLines` / `claimReimbursement`, `RunnerJobsRepository.job` (runner projection); no screen exists.
- Status: missing
- Refreshed 2026-10-19 (design-auditor, `docs/runner-v-active-spec`): runner projection and ledger calls now on `main`, rows 197 and 211, success mark promoted to core (R-24), one danger-tone error per failure (S-1 / m-7 rule).

## Purpose
Confirmation after the runner hands the job to the customer (IN_PROGRESS → AWAITING_CUSTOMER): what the runner will earn for it and, on purchase tasks, the reimbursement, with when each becomes payable.

## Entry / exit
- Entry: `v-active` `Mark task complete` success; `View job summary` on `v-active` (AWAITING_CUSTOMER and later); ledger line tap in `v-earnings` / `x-payout-history` (proposed).
- Back (C-10) → `v-active`.
- `Back to jobs` → shell, Jobs tab (mockup `jump('v-jobs', true)`). From AWAITING_CUSTOMER on, the runner is no longer busy (row 211), so new offers can show there. The job stays on `v-active` (in `Other jobs` once another job is shown) until it leaves the active set.

## Task states
AWAITING_CUSTOMER (main case), COMPLETED, CONFIRMED, SETTLED, DISPUTED; CANCELLED / FAILED show the ended variant (no runner fee, row 106).

## Layout (top to bottom)
Body centred, padding-top 10.
1. C-10 header `Job complete`.
2. Success mark: 70px circle green-050 with a green check (complete state, allowed); margin 0 auto 12. Core R-24 `SuccessMark` (NEW, C-V7): the customer app already draws the same circle in `apps/customer_app/lib/src/widgets/stk_view.dart`, so a runner copy would be the second copy. For CANCELLED / FAILED the mark is not shown; the R-01 danger chip takes its place (proposed).
3. Heading 17/600 (design-system `.t-h3`; mockup 17 bold) `Nice work, Brian.` (first word of `displayName`; `Nice work.` when empty), margin 0 0 4.
4. Sub 12.5 slate-600: `{title} · {status line}`, margin 0 0 20; status line by state (below).
5. Earnings card C-18 `ReceiptCard` (left aligned, margin 0 20 12):
   - `Runner fee` → `KSh 1,750` (one line; row 119: the mockup's `Base + report fee` and `Distance bonus` components are not shown until pricing rates exist, row 47).
   - Total row (hairline, 700) `You'll earn` → `KSh 1,750` (green-700 Fira Code as drawn is **not** ported: green is for actions/complete states; amount stays blue, proposed). At SETTLED the label becomes `You earned` (mockup copy).
   - `ReceiptSeparateGroup` (only `send_to_runner` with an item amount): `Item reimbursement` → `KSh 5,000`, note `Paid with your runner fee once the customer confirms and the review window closes. Not part of your earnings.` (proposed). With no receipt on file: C-05 small `On hold` + `Our team will check your purchase before it's paid.` (row 105).
6. Payable line (proposed, 12 slate-600, padding 0 20, centred) by state:
   | State | Line |
   |---|---|
   | AWAITING_CUSTOMER | `Payable after the customer confirms and the review window closes.` |
   | COMPLETED | `The customer confirmed. Payable when the review window closes.` |
   | CONFIRMED | `Payable now. It's in your available balance.` |
   | SETTLED | `Paid to your M-Pesa.` |
   | DISPUTED | `Our team is reviewing the customer's report. If it's decided in your favour, you're paid as normal.` (row 140; replaces the earlier `On hold …` line, since `On hold` is only a line status) |
   | CANCELLED / FAILED | `This task ended before completion, so there's no runner fee.` (+ reimbursement sentence from `_shared.md` §8 when relevant, and the `Claim item spend` action below on `send_to_runner`) |
7. Fixed bottom C-01 `Back to jobs`.

## Components
| Element | Component (core class) | Status |
|---|---|---|
| Header | C-10 `NitumePushedHeader` | exists |
| Success mark | R-24 `SuccessMark` (70px green-050 circle, green check) | **NEW** (C-V7) |
| Earnings card | C-18 `ReceiptCard`, `ReceiptRow`, `ReceiptSeparateGroup` | exists |
| Chips | C-05 `StatusChip` small, R-01 for the ended chip | exists |
| CTA | `NitumeFixedCta` + C-01 | exists |
| Claim form | C-10, C-17 `NitumeField.money` / `.multiline`, C-02, `NitumeFixedCta` | exists |
| Receipt capture for a claim | R-13 / R-15 / R-22 as `v-evidence-capture` (B-1 rules, job-scoped uploader) | exists; **change** C-V1, C-V2 |
| Data | R-19 `RunnerJobsRepository.job`, `RunnerPayoutRepository.payoutLines` / `claimReimbursement` | exists |

## Copy
Exact, from the mockup: `Job complete`, `Nice work, Brian.`, `Apartment check — Nyali · awaiting customer confirmation`, `You earned`, `Back to jobs`. Mockup rows `Base + report fee` / `Distance bonus` are dropped (RQ-7). Everything else proposed.

## Numeric fields (Fira Code)
- Every amount; any date/time in the status line (`Paid Mon, 10:03 AM` if added).

## Data
- Job: `GET /runners/me/jobs/:id` (built, `RunnerJobView`) for `title`, `status`, `runnerFee`, `itemAmount`, `merchantRoute`. It must stay readable after the job ends (DISPUTED, COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED) for the runner who accepted it: api-contract item A2 (`docs/audits/runner-gap-report.md` §21). Today it answers 403 once the runner no longer holds "the current assignment", and whether an ended accepted assignment still counts is unverified.
- Time the job ended (for the 24 h window): the CANCELLED / FAILED entry of `GET /errands/:id/history` (exists).
- Ledger lines for this errand: `GET /runners/me/payout-lines?errandId=<id>` (on `main`, core `RunnerPayoutRepository.payoutLines`). Before CONFIRMED the list is empty: the state line comes from the errand status, not from the ledger (there is no `pending` line status). From CONFIRMED: `runner_fee` (`payable` → `paid`) and, on `send_to_runner`, `item_reimbursement` (`payable`, or `on_hold` with `reviewReason` `receipt_missing` / `over_purchase_limit` / `price_decrease_pending`; later `receipt_mismatch`; `rejected` after ops review). Chips and captions as `v-earnings`. The amount shown on an `on_hold`/`rejected` item line is the requested amount.
- Line state by status (replaces the CONFIRMED / SETTLED rows of the table above when lines exist): runner fee `payable` → `Payable now. It's in your available balance.`; `paid` → `Paid to your M-Pesa.` + `paidAt` (Fira Code, EAT); item line `on_hold` → C-05 `On hold` + reason caption; `rejected` → C-05 `Not approved` + `Our team didn't approve this reimbursement. Contact support if you think this is wrong.` (proposed).
- **Claim after CANCELLED / FAILED** (row 106; `send_to_runner` tasks where the runner bought the item): `POST /runners/me/reimbursement-claims` `{ errandId, amount, receiptEvidenceId, note? (≤ 500) }` → the new feed item (`on_hold`, `out_of_pocket_claim`). Shown on the ended variant when no `item_reimbursement` line exists for the errand: C-02 `Claim item spend` (proposed) → pushed form (C-10 `Claim item spend`): C-17 money field `Amount you spent` (max = the cap, hint `Up to KSh {cap}.`), receipt picker (the runner's own `receipt` evidence on the task from `GET /errands/:id/evidence`; if none, R-13 capture via R-22 with type `receipt` first), optional note `Anything we should know?`, C-01 `Send claim`. Success → back with snackbar `Claim sent. Our team will check your receipt.` Errors: 400 `receipt_required` → `Add the receipt for this task first.`; 400 `reimbursement_exceeds_cap` (`cap`, `itemPaidToNitume`, `maxPurchaseAdvance`) → `You can claim up to KSh {cap}.`; 409 `no_item_amount_paid` → `There's no item amount to reimburse on this task.`; 409 `reimbursement_already_recorded` → reload, show the existing line; 409 `reimbursement_claim_not_allowed` → `Claims are only for tasks that ended before completion.`; 403 → generic error (all copy proposed). The cap is the lower of the item amount paid to Nitume and the runner's `max_purchase_advance` (rows 105, 108, 135). Window (row 129): receipts and the claim within 24 h of the CANCELLED/FAILED time; after that the action is replaced by `The claim window has closed. Contact support with your receipt.` and `Contact support`. The API does not enforce the window yet (RA-12, item A10). Row 197: no claim, and no `Claim item spend`, on a task the runner never accepted (such a task never reaches this screen). Errors are one C-40 in the danger tone each, not a snackbar plus a notice (S-1 / m-7 rule). Combined cap (row 136): a claim always goes to ops review and is checked against the task cap only when ops approve it (built, `dbc3a76`); the app never mentions the customer's refund.
- Socket: `errand:status_changed` refreshes the status line.
- Never shows the customer's payment or refund.

## Accessibility and mobile
Heading announced on open; amounts read as currency; CTA above the safe area.

## Decisions (owner, 2026-10-13)
- Row 119 (RQ-7): one `Runner fee` line until pricing rates exist.
- Row 129 (RQ-17): 24 h receipt/claim window after CANCELLED/FAILED. Row 135: max claimable = min(item paid to Nitume, `max_purchase_advance`). Row 136: task-level combined cap with the customer refund; above it, ops review.

## Decisions (owner, 2026-10-16)
- Row 140: a dispute decided in the runner's favour keeps the runner fee and item reimbursement payable as normal (COMPLETED → CONFIRMED, then the CONFIRMED rows above).
- Row 142: the claim form keeps the ordinary cap min(item amount paid to Nitume, `max_purchase_advance`); only ops can approve above the limit, through an audited override (stored in `task_exposure_overrides`, row 151); no runner copy for it.
- Row 152 (2026-10-16): the `max_purchase_advance` in that cap is the value stored when the reimbursement obligation was created; a later change of the runner's limit never changes an existing claim or line. Any limit figure this screen shows for a line (e.g. a refused claim's cap) is the line's stored limit, never the current `v-profile` value.
- Row 143: the `SETTLED` / `paid` lines state status only, never a payout time.

## Decisions (owner, 2026-10-19)
- Row 211: AWAITING_CUSTOMER and DISPUTED do not make the runner busy (see Exit).

## Questions
- None new. RQ-36 (BOARD row 248, open; `v-price-request.md`) may change what `Item reimbursement` shows after an approved increase that the customer has not paid yet.
