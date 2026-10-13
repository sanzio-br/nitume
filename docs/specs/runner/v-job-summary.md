# v-job-summary — Job complete

- Mockup: `docs/design/nitume_runner_app.html` lines 403–416 (`#v-job-summary`, overlay)
- Shared conventions: `_shared.md` (§8 money and reimbursement, rows 95, 104–107)
- Implementation: none
- Status: missing

## Purpose
Confirmation after the runner hands the job to the customer (IN_PROGRESS → AWAITING_CUSTOMER): what the runner will earn for it and, on purchase tasks, the reimbursement, with when each becomes payable.

## Entry / exit
- Entry: `v-active` `Mark task complete` success; `View job summary` on `v-active` (AWAITING_CUSTOMER and later); ledger line tap in `v-earnings` / `x-payout-history` (proposed).
- Back (C-10) → `v-active`.
- `Back to jobs` → shell, Jobs tab (mockup `jump('v-jobs', true)`).

## Task states
AWAITING_CUSTOMER (main case), COMPLETED, CONFIRMED, SETTLED, DISPUTED; CANCELLED / FAILED show the ended variant (no runner fee, row 106).

## Layout (top to bottom)
Body centred, padding-top 10.
1. C-10 header `Job complete`.
2. Success mark: 70px circle green-050 with a green check (complete state, allowed); margin 0 auto 12.
3. Heading 17/600 (design-system `.t-h3`; mockup 17 bold) `Nice work, Brian.` (first word of `displayName`; `Nice work.` when empty), margin 0 0 4.
4. Sub 12.5 slate-600: `{title} · {status line}`, margin 0 0 20; status line by state (below).
5. Earnings card C-18 `ReceiptCard` (left aligned, margin 0 20 12):
   - `Runner fee` → `KSh 1,750` (one line; RQ-7: the mockup's `Base + report fee` and `Distance bonus` components are not shown until pricing rates exist, row 47).
   - Total row (hairline, 700) `You'll earn` → `KSh 1,750` (green-700 Fira Code as drawn is **not** ported: green is for actions/complete states; amount stays blue, proposed). At SETTLED the label becomes `You earned` (mockup copy).
   - `ReceiptSeparateGroup` (only `send_to_runner` with an item amount): `Item reimbursement` → `KSh 5,000`, note `Paid with your runner fee once the customer confirms and the review window closes. Not part of your earnings.` (proposed). With no receipt on file: C-05 small `On hold` + `Our team will check your purchase before it's paid.` (row 105).
6. Payable line (proposed, 12 slate-600, padding 0 20, centred) by state:
   | State | Line |
   |---|---|
   | AWAITING_CUSTOMER | `Payable after the customer confirms and the review window closes.` |
   | COMPLETED | `The customer confirmed. Payable when the review window closes.` |
   | CONFIRMED | `Payable now. It's in your available balance.` |
   | SETTLED | `Paid to your M-Pesa.` |
   | DISPUTED | `On hold while our team reviews the customer's report.` |
   | CANCELLED / FAILED | `This task ended before completion, so there's no runner fee.` (+ reimbursement sentence from `_shared.md` §8 when relevant) |
7. Fixed bottom C-01 `Back to jobs`.

## Components
C-10, C-18 (`ReceiptCard`, `ReceiptRow`, `ReceiptSeparateGroup`), C-05 small, C-01. No new widget (the success mark is a 70px `InitialsAvatar`-sized circle; core-ui may expose it as `SuccessMark` if a second screen needs it).

## Copy
Exact, from the mockup: `Job complete`, `Nice work, Brian.`, `Apartment check — Nyali · awaiting customer confirmation`, `You earned`, `Back to jobs`. Mockup rows `Base + report fee` / `Distance bonus` are dropped (RQ-7). Everything else proposed.

## Numeric fields (Fira Code)
- Every amount; any date/time in the status line (`Paid Mon, 10:03 AM` if added).

## Data
- Job: runner projection (RA-2) for `title`, `runnerFee`, `itemAmount`, `merchantRoute`.
- Ledger lines for this errand (state of the runner fee and reimbursement lines: `pending`, `payable`, `on_hold`, `paid`): **missing**, being built on `feat/api-owner-answers-6` (row 107). Proposed: `GET /runners/me/payout-lines?errandId=…` or `payoutLines[]` on the runner job view (RA-14/RA-16).
- Socket: `errand:status_changed` refreshes the status line.
- Never shows the customer's payment or refund.

## Accessibility and mobile
Heading announced on open; amounts read as currency; CTA above the safe area.

## Questions
- RQ-7 (payments/pricing): fee breakdown lines. Default: a single `Runner fee` line until pricing rates exist.
