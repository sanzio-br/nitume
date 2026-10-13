# v-payout — Request payout

- Mockup: `docs/design/nitume_runner_app.html` lines 418–428 (`#v-payout`, overlay)
- Shared conventions: `_shared.md` (§7, §8)
- Implementation: none
- Status: missing

## Purpose
Let the runner ask Nitume to send all or part of their available amount to their M-Pesa number. Whether runners can request payouts at all (vs a fixed batch schedule) is an owner decision (RQ-5); this spec follows the mockup and the system design's "on-demand above a threshold" option (§6), pending that answer.

## Entry / exit
- Entry: `v-earnings` `Request payout`.
- Back (C-10) → `v-earnings`.
- `Confirm payout` → C-35 confirm → request → back to `v-earnings` with snackbar `Payout requested. We'll send it to your M-Pesa and let you know.` (proposed; mockup `pop()`).

## Task states
None (ledger).

## Layout (top to bottom)
1. C-10 header `Request payout`.
2. R-08 balance card without actions (margin-top 0): `Available balance`, amount.
3. C-08 `Amount` (padding-top 0); C-17 money field (padding 0 20), prefilled with the available amount, Fira Code value. Under it C-04 link `Use full amount` when edited (proposed) and the hint `Minimum KSh {min}.` (only if RQ-5 sets a minimum).
4. C-08 `Send to`; **read-only** R-05-style field (white, r-s 8, slate-line, padding 11 14): `M-Pesa · +254 733 111 222` (Fira Code for the number) = the runner's sign-in phone (RQ-6). Hint 11.5 slate-600 `Payouts go to the number you sign in with.` (proposed). Mockup draws an editable input; editing the destination is not supported (security, RQ-6).
5. Fixed bottom C-01 `Confirm payout`.

## Validation (proposed)
| Rule | Message |
|---|---|
| number > 0, max 2 decimals | `Enter an amount in KSh.` |
| ≤ available amount | `You can request up to KSh {available}.` |
| ≥ minimum (RQ-5) | `The minimum payout is KSh {min}.` |
| no open request (RQ-5) | screen shows C-40 `You already have a payout on the way.` and the CTA is disabled |

## Confirm dialog (C-35, proposed)
Title `Send KSh 8,450 to your M-Pesa?`; body `To +254 733 111 222. Payouts are usually sent within one working day.` (the time promise only if the owner sets one; default body without it); buttons `Send` / `Back`.

## Copy
Exact, from the mockup: `Request payout`, `Available balance`, `Amount`, `Send to`, `M-Pesa · +254 733 111 222`, `Confirm payout`. Everything else proposed.

## Numeric fields (Fira Code)
- Balance; amount input; phone number; minimum and maximum in messages and the dialog.

## Data
- `GET /runners/me/earnings` (RA-14) for `availableAmount`.
- `POST /runners/me/payouts` `{ amount }` with an `Idempotency-Key` header (as payments) → `{ id, amount, status: 'requested', createdAt }`; errors `payout_exceeds_available`, `payout_below_minimum`, `payout_already_open` (RA-15, missing; depends on RQ-5 and a payout-request record, which is a schema decision not covered by row 107).
- Destination phone: `GET /users/me` `phone` (exists).
- Payout itself: ops send M-Pesa manually and record the receipt (as refunds, row 54), then a `payout` ledger line; the runner is notified `Payout sent` (RA-6). Corrections/reversals/re-sent payouts appear as their own lines (row 107).
- Socket: none needed.

## Accessibility and mobile
Money keyboard; errors announced; the read-only destination is announced as `Send to M-Pesa, plus 254 733 111 222, not editable`.

## Questions
- RQ-5 (payments, blocking for this screen): may runners request payouts (default yes, any amount up to the available amount, configurable minimum, one open request at a time, ops pay manually), or are payouts only batched on a schedule (then this screen becomes a read-only "Next payout" view)?
- RQ-6 (security): payout destination fixed to the sign-in phone. Default yes.
