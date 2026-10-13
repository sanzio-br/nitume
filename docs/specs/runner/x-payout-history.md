# x-payout-history — Payout history

- Mockup: **not drawn**. The `Payout history` button on `v-earnings` (line 251) has no target. Built from the `v-earnings` ledger rows and design-system list patterns; all copy **(proposed)**.
- Shared conventions: `_shared.md` (§8, row 107)
- Implementation: none
- Status: missing

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
2. Filter chips C-16 (padding 0 20 12, gap 8): `All` (default), `Earnings`, `Reimbursements`, `Payouts`.
3. Month groups: C-08 label per EAT month (`October 2026`, Fira Code for the year; the month word is Sans, proposed: whole label Sans with a Fira Code year span), then R-12 rows (same table as `v-earnings`).
4. Payout row expanded: R-05 rows `M-Pesa receipt` → `SLK4H7XQ2P` (Fira Code), `Sent` → `Mon, 10:03 AM` (EAT); for a reversed payout `Reversed` → time, and the re-sent line linked under it (`Re-sent · SLK…`).
5. Infinite scroll (cursor), C-33 `SkeletonCard` while loading more.

States: empty `No payouts yet` / `Your payouts and earnings will show here.`; error `Couldn't load your payout history.` + `Try again`.

## Components
C-10, C-16, C-08, R-12, R-05, C-33. NEW: R-12, R-05 (shared with other screens).

## Copy (proposed)
`Payout history`, `All`, `Earnings`, `Reimbursements`, `Payouts`, `M-Pesa receipt`, `Sent`, `Reversed`, `Re-sent`, plus the R-12 captions in `v-earnings`. No wallet/escrow words.

## Numeric fields (Fira Code)
- Amounts, receipts, times, the year in month labels.

## Data
- `GET /runners/me/payout-lines?kind=&cursor=&limit=30` (RA-14, being built on `feat/api-owner-answers-6`); the line shape in `v-earnings`, plus `reference` (M-Pesa receipt) and `relatedLineId` (links a reversal / re-sent payout to its original) on payout lines.
- No socket events.

## Accessibility and mobile
Rows read as one sentence (`Payout to M-Pesa, minus 6,000 shillings, sent Monday 10:03 AM`); filter chips are a radio group.

## Questions
- None new (RQ-5 covers payout requests).
