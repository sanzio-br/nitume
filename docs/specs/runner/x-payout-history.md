# x-payout-history — Payout history

- Mockup: **not drawn**. The `Payout history` button on `v-earnings` (line 251) has no target. Built from the `v-earnings` ledger rows and design-system list patterns; all copy **(proposed)**.
- Shared conventions: `_shared.md` (§8, row 107)
- Implementation: none
- Status: missing (API ready: RA-14)

## Purpose
The full payout ledger: every runner fee, item reimbursement, payout, correction, reversal and re-sent payout line, newest first, so the runner can reconcile what they were paid.

## Entry / exit
- Entry: `v-earnings` `Payout history` and `See all`.
- Back (C-10) → `v-earnings`.
- Job line tap → `v-job-summary`; payout line tap → expands inline to show the M-Pesa receipt and sent time (proposed).

## Task states
Any (ledger).

## Layout (top to bottom)
1. C-10 header `Payout history`.
2. Filter chips C-16 (padding 0 20 12, gap 8): `All` (default, no `kind`), `Earnings` (`kind=runner_fee`), `Reimbursements` (`kind=item_reimbursement`), `Payouts` (`kind=payout,resent_payout,reversal,correction`).
3. Month groups: C-08 label per EAT month of `createdAt` (`October 2026`, proposed: whole label Sans with a Fira Code year span), then R-12 rows (same kinds, captions, chips and signs as the `v-earnings` table).
4. Payout row expanded: R-05 rows `M-Pesa receipt` → `reference` (Fira Code), `Sent` → `paidAt` (`Mon, 10:03 AM`, EAT), `Tasks` → count of `lineIds` (Fira Code) when the payout covered more than one task. When the payout settled a payout request (row 146): rows `Requested` → `requestedAmount` and `Paid` → the paid amount (both Fira Code) with chip `Paid`; when paid < requested, a caption 11.5 slate-600 `KSh {requestedAmount − paidAmount} wasn't included in this payout. It's still available to request.` (the amount is a Fira Code span, Fira Sans for the rest; proposed). Adjustments are linked to the **job line**, not to the payout entry: a `reversal`, `correction` or `resent_payout` has `relatedLineId` = a job line id; it belongs under a payout entry whose `lineIds` contains that id. Under the expanded payout list those adjustments oldest first (`Reversed` → time; `Re-sent` → `reference`; `Corrected` → `reference`).
5. Infinite scroll (cursor), C-33 `SkeletonCard` while loading more.

States: empty `No payouts yet` / `Your payouts and earnings will show here.`; error `Couldn't load your payout history.` + `Try again`.

## Components
C-10, C-16, C-08, R-12, R-05, C-33. NEW: R-12, R-05 (shared with other screens).

## Copy (proposed)
`Payout history`, `All`, `Earnings`, `Reimbursements`, `Payouts`, `M-Pesa receipt`, `Sent`, `Reversed`, `Re-sent`, plus the R-12 captions in `v-earnings`. No wallet/escrow words.

## Numeric fields (Fira Code)
- Amounts, receipts, times, the year in month labels.

## Data
- `GET /runners/me/payout-lines?kind=&cursor=&limit=30` (RA-14, built on `feat/api-owner-answers-6` @ `10b6019`); item shape and statuses in `v-earnings` Data. `reference` = M-Pesa receipt (payout, resent_payout), corrected receipt (correction) or reversal code (reversal); `relatedLineId` = the job line an adjustment changes; `lineIds` = the job lines a `payout` entry covered. Ids are opaque. Cursor = `nextCursor` (null at the end).
- No socket events.

## Accessibility and mobile
Rows read as one sentence (`Payout to M-Pesa, minus 6,000 shillings, sent Monday 10:03 AM`); filter chips are a radio group.

## Questions
- None new. Payout requests (row 117) appear in the `Payouts` filter as `Payout requested` rows while open and `Request not approved` (C-05 neutral, with the ops note) when rejected, from `GET /runners/me/payout-requests` (RA-15), merged by time; a paid request is shown by its derived `payout` entry only (no duplicate), with the requested and paid amounts as in Layout 4 (row 146, decided 2026-10-16; needs `payoutRequestId` and `requestedAmount` on the derived entry, RA-15). No row, chip or caption promises when a payout arrives (row 143). The old `GET /runners/me/payouts` is not built (removed on `feat/api-owner-answers-6`); the derived `payout` entries in the feed replace it for history.
