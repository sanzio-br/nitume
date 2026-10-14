# p-runner-payouts — Runner payouts panel (payout ledger)

- Mockup: **not drawn. EXTENDS MOCKUP** (row 112, owner 2026-10-13: "Admin runner payout ledger and reimbursement ops-review screens are in scope"). Built from the same patterns as `p-refunds` (A-03 topbar + A-04 table card + A-12 load more) and the sidebar `Payments` group. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (A-n components, §3 money, §3.1 EAT, §6.1 runner payout vocabulary, §7 API gaps N-17 …)
- API: `feat/api-owner-answers-6` @ `10b6019` (read-only), controller `src/payments/runner-payouts.controller.ts`
- Implementation: `apps/admin/src/app/features/admin/panels/runner-payouts.panel.ts`, `shared/batch-bar.component.ts` (A-16), `payouts/runner-payout-labels.ts`; nav item in `admin-dashboard.component.ts` (branch `feat/admin-runner-payouts` @ `04837b4`)
- Status: matches-design (audit 2026-10-14 PASS, minor m-13; `docs/audits/admin-gap-report.md`)

## Purpose
One place where ops sees every runner payout line (row 107: `runner_fee` and `item_reimbursement` obligations), works the item reimbursements waiting for review (rows 105, 106, 108, 135), and records manual M-Pesa payouts to runners in batches (one runner and one M-Pesa receipt per payout). Lines are records, not task states. What Nitume owes a runner is always derived from the lines (§3).

## Entry / exit
- Entry: sidebar `Payments` group, new item `Runner payouts` under `Refunds`, then `Payout requests` (`p-payout-requests.md`). Badge `.badge-count` = `GET /runner-payouts/count?status=on_hold` (`99+` above 99); hidden at 0.
- Entry from the runner drawer (`drawer-runner`): `View payouts` opens this panel filtered to that runner.
- Row click or row button → `drawer-runner-payout` for that line.
- `Record payout` (batch bar) → A-08 dialog (below); stays on the panel.

## Task states
A `runner_fee` line exists only for a task that reached CONFIRMED (or later). An `item_reimbursement` line comes from CONFIRMED (`send_to_runner` purchase) or from a runner's claim on a CANCELLED/FAILED task (row 106). The panel shows the task chip from the API and fires no task transition.

## Layout (top to bottom)
1. Topbar A-03, margin-bottom 26: `h1` `Runner payouts`; `.sub` Fira Code 12.5 (Copy); actions (gap 10): runner filter (searchable `select.btn-city`, options from `GET /runners`, default `All runners`), type filter (`All types`, `Runner fees` = `kind=runner_fee`, `Item reimbursements` = `kind=item_reimbursement`), status filter (default `Needs review`; options in Copy), `↻ Refresh`.
2. Table card A-04. Columns:

   | Column | Content | Type |
   |---|---|---|
   | (select) | checkbox, only in the `Payable` filter with one runner chosen; disabled on a line whose stored status is `paid` (a reversed payout, see below) | control |
   | Task | `.task-cat` errand title (else category display name) + `.task-id` `#` + `errand.reference` | Sans + Fira Code |
   | Runner | `runner.shortName` (else `displayName`, else masked id) | Sans 13 |
   | Type | `Runner fee` / `Item reimbursement` | Sans 13 |
   | Amount | `amount` when set, else `requestedAmount` with the caption `requested` (12 slate-600) | Fira Code (`td.num`) |
   | Status | A-02 `kind="runner_payout"` from `effectiveStatus` and `effectivePayout` (§6.1); for `on_hold` a second line 12 slate-600 with the review reason label | chip |
   | Created | `formatDateTime(createdAt)` | Fira Code 12 slate-600 |
   | (action) | `.row-assign`: `Review` (on_hold), `View` (payable, paid, rejected), `Re-send` (effective payout reversed) | button |

   Order: API order (`createdAt DESC`). No client-side re-sort. `Load more` (A-12) while `nextCursor`.
3. Batch bar (only with ≥ 1 row selected): sticky at the bottom of the table card, white, top hairline, padding 12 18: left `3 lines · KSh 6,750` (Fira Code), right `.btn .btn-primary` `Record payout`. At most 50 lines (API limit): selecting a 51st shows A-11 info `One payout covers at most 50 lines.`
4. Under the table, 12 slate-600 caption in the `Payable` filter: `Lines marked "Payout reversed" are owed again. Re-send them from the line, not as a new payout.`

Below 1100px hide `Created`; below 900px hide `Type`.

## Record payout dialog (A-08, batch)
- Title `Record M-Pesa payout to {runner shortName}?`
- Body: `Send KSh {total} to {phone} by M-Pesa, then enter the receipt.` (phone Fira Code, from `GET /runner-payouts/:id` `runner.phone` of the first selected line; when null: `Find the runner's number in their profile before you send.`) Then A-06 `M-Pesa receipt` (Fira Code, upper case, maxlength 64, placeholder `e.g. SLK4H7XQ2P`, rule `^[A-Za-z0-9-]{4,64}$`, message `Enter the M-Pesa code, letters and numbers only.`).
- Buttons `Back` / `Mark as paid` (primary, disabled until valid).
- Request `POST /runner-payouts/mark-paid` `{ lineIds, payoutReference }` → `{ items }`; success: rows update in place, selection clears, A-11 success `Payout recorded: KSh {total} · {receipt}.`
- Errors (A-14): 409 `runner_payout_not_payable` / `runner_payout_locked` (`lineId`) → reload the filter, A-11 danger `Some lines changed since you loaded them. Check the list and try again.`; 409 `payout_reference_reused` → field error `This receipt is already recorded on another payout or refund.`; 400 `runner_payout_mixed_runners` → `One payout can cover one runner only.` (should not happen: the UI only allows one runner); 404 → reload.
- A payout request (`p-payout-requests.md`) uses the same dialog with the request's lines preselected.

## Components
| Pattern | Id | Status |
|---|---|---|
| Sidebar item + badge | A-15 | exists |
| Topbar, table, load more, empty/loading, notices | A-03, A-04, A-12, A-10, A-11 | exist |
| Status chip `kind="runner_payout"` | A-02 | **NEW** kind + labels (§6.1) |
| Row checkbox + batch bar | A-16 | **NEW** (shared with `p-payout-requests`) |
| Confirm dialog with one field | A-08 + A-06 | exists |
| Money/date helpers, error mapping | A-13, A-14 | exist |

## Copy (proposed)
- Nav item `Runner payouts`; title `Runner payouts`.
- Sub-line (counts of loaded rows, `+` when more pages): `Needs review` → `{n} to review`; `Payable` → `{n} owed · KSh {sum}` (sum of loaded payable rows); `Paid` → `{n} paid`; `Not approved` → `{n} not approved`; `All statuses` → `{n} lines`.
- Status filter options (order): `Needs review` (`on_hold`), `Payable` (`payable`; includes reversed payouts, the API's effective status), `Paid` (`paid`), `Not approved` (`rejected`), `All statuses`.
- Headers: `Task`, `Runner`, `Type`, `Amount`, `Status`, `Created`.
- Row buttons: `Review`, `View`, `Re-send`.
- Empty states: Needs review `Nothing to review` / `Item reimbursements without a receipt, above the runner's purchase limit, waiting for a price-decrease refund decision, or claimed after a cancelled or failed task land here.`; Payable `Nothing owed` / `Confirmed runner fees and approved reimbursements wait here until you record the M-Pesa payout.`; Paid `No payouts yet` / `Lines you mark as paid appear here.`; Not approved `No rejected reimbursements` / `Reimbursements you reject appear here.`; All `No payout lines yet` / `A runner fee line appears when a task is confirmed.`
- Loading `Loading runner payouts…`; error `Couldn't load runner payouts.` + `Try again`; load more error `Couldn't load more. Try again.`

Accepted builder copy (audit 2026-10-14): unknown 400 on record payout → A-11 danger `Couldn't record this payout. Check the lines and the receipt, then try again.`; network → `Couldn't save. Check your connection and try again.`; the receipt field shows `Enter the M-Pesa code, letters and numbers only.` when the API rejects the format.

## Per-runner summary (decided at the 2026-10-14 audit: not on this panel)
`GET /runner-payouts/summary?runnerProfileId=` is **not** shown here: the panel already shows the loaded `Payable` total for the chosen runner (sub-line) and the batch total, and a second set of totals beside a filtered list would invite confusion between loaded rows and all rows. It belongs to the runner drawer (`drawer-runner-purchase-limit.md`, section `Payouts`).

## Numeric fields (Fira Code)
Task references, amounts, the batch total and count, the sub-line counts and sums, created times, the receipt input, the badge.

## Data
- `GET /runner-payouts?status=&kind=&runnerProfileId=&errandId=&cursor=&limit=25` → `{ items: AdminRunnerPayoutItem[], nextCursor }`. Item = the stored line (`id, runnerProfileId, errandId, kind, status, requestedAmount, amount, capAmount, reviewReason, receiptEvidenceId, payoutReference, paidAt, note, decisionNote, decidedAt, createdAt, …`) + `effectiveStatus`, `effectivePayout { state: 'sent' | 'reversed', amount, reference, at } | null`, `errand { id, reference, title, category, status } | null`, `runner { id, displayName, shortName } | null`, `decidedBy`, `paidBy` (`{ id, displayName }`). `status` filters the **effective** status (a reversed payout is `payable`). Built.
- `GET /runner-payouts/count?status=on_hold` → `{ count }` (badge). Built.
- `POST /runner-payouts/mark-paid` (above). Built. A line whose stored status is `paid` (reversed payout) is refused with `runner_payout_locked`: it is re-sent through `POST /runner-payouts/:id/corrections` `{ kind: 'resent_payout', … }` from the drawer.
- Runner filter options: `GET /runners` (admin, exists).
- Combined exposure (row 136) and payout requests (row 117): not on this panel's data; see the drawer and `p-payout-requests`.
- Refresh: `↻ Refresh`, a drawer save, and a recorded payout reload the current filter and the badge. No live events (as `p-refunds`).

## Accessibility and desktop notes
Checkboxes have names `Select {type} for #{reference}`; the batch bar is announced (`aria-live="polite"`) when its total changes; row buttons ≥ 32px tall with the reference in the accessible name; the filters have `aria-label`s. Desktop surface (sidebar hidden below 900px, as the shell).

## Owner decisions applied
Rows 104–108, 112, 117, 135, 136, 138 (`_shared.md` §1).

## Open questions for the owner
- AQ-11 (see `p-payout-requests.md`): paying a request with whole lines.

## Current vs design
Audit 2026-10-14 against `feat/admin-runner-payouts` @ `04837b4`: **PASS** (`docs/audits/admin-gap-report.md`, "Audit round 6: runner payouts").
- m-13 (minor): the runner filter is a plain `select` whose options show `Runner …abcd` for runners with no loaded line (`GET /runners` has no names); spec asked for a searchable select. Fix when `GET /runners` returns names (api-contract) or with a typeahead.
