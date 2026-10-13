# v-payout — Request payout

- Mockup: `docs/design/nitume_runner_app.html` lines 418–428 (`#v-payout`, overlay)
- Shared conventions: `_shared.md` (§7, §8)
- Implementation: none
- Status: missing

## Purpose
Let the runner ask Nitume to send all or part of their available amount to their M-Pesa number. Decided (row 117): runners request payouts up to their available amount, above a configurable minimum, one open request at a time; ops pay manually; each request is an auditable record. Destination fixed to the sign-in phone (row 118).

## Entry / exit
- Entry: `v-earnings` `Request payout`.
- Back (C-10) → `v-earnings`.
- `Confirm payout` → C-35 confirm → request → back to `v-earnings` with snackbar `Payout requested. We'll send it to your M-Pesa and let you know.` (mockup `pop()`).
- With a request already open the screen opens read-only: C-40 `You already have a payout on the way: KSh 6,000, requested Mon, 10:03 AM.` (Fira Code), CTA disabled.

## Task states
None (ledger).

## Layout (top to bottom)
1. C-10 header `Request payout`.
2. R-08 balance card without actions (margin-top 0): `Available balance`, amount.
3. C-08 `Amount` (padding-top 0); C-17 money field (padding 0 20), prefilled with the available amount, Fira Code value. Under it C-04 link `Use full amount` when edited (proposed) and the hint `Minimum KSh {min}.` (`minimumAmount`).
4. C-08 `Send to`; **read-only** R-05-style field (white, r-s 8, slate-line, padding 11 14): `M-Pesa · +254 733 111 222` (Fira Code for the number) = the runner's sign-in phone (row 118). Hint 11.5 slate-600 `Payouts go to the number you sign in with.` (proposed). Mockup draws an editable input; editing the destination is not supported (row 118).
5. Fixed bottom C-01 `Confirm payout`.

## Validation (proposed)
| Rule | Message |
|---|---|
| number > 0, max 2 decimals | `Enter an amount in KSh.` |
| ≤ available amount | `You can request up to KSh {available}.` |
| ≥ minimum (row 117) | `The minimum payout is KSh {min}.` |
| no open request (row 117) | screen shows C-40 `You already have a payout on the way.` and the CTA is disabled |

## Confirm dialog (C-35, proposed)
Title `Send KSh 8,450 to your M-Pesa?`; body `To +254 733 111 222. Payouts are usually sent within one working day.` without the second sentence (no time promise has been set; RQ-24); buttons `Send` / `Back`.

## Copy
Exact, from the mockup: `Request payout`, `Available balance`, `Amount`, `Send to`, `M-Pesa · +254 733 111 222`, `Confirm payout`. Everything else proposed.

## Numeric fields (Fira Code)
- Balance; amount input; phone number; minimum and maximum in messages and the dialog.

## Data
Decided (rows 117, 118): runner payout requests with their own auditable record; ops pay manually to the sign-in phone. **Missing** in the API (RA-15); names below are what this screen needs:
- `GET /runners/me/earnings` (built) for `availableAmount`.
- `GET /runners/me/payout-requests/summary` (proposed) → `{ minimumAmount, openRequest: { id, amount, status, createdAt } | null }`; `minimumAmount` is ops-configured (no number in the docs).
- `POST /runners/me/payout-requests` `{ amount }` + `Idempotency-Key` header (reused on retry) → `{ id, amount, status: 'requested', destinationPhone, createdAt }`. The destination is the user's sign-in phone, set by the server; the body has no phone field (row 118). Errors: 400 `payout_below_minimum` (`minimumAmount`), 400 `payout_exceeds_available` (`availableAmount`), 409 `payout_request_open` (`requestId`), 403 not verified.
- `GET /runners/me/payout-requests?cursor=` → `{ items: [{ id, amount, status, destinationPhone, createdAt, decidedAt, paidAt, reference, decisionNote? }], nextCursor }` for `v-earnings` / `x-payout-history`.
- Lifecycle (proposed; every step stored with actor and time): `requested` → `paid` (ops record the M-Pesa receipt; the payable lines covered become `paid` through the same mark-paid step, so the feed shows the derived `payout` entry) or `rejected` (ops, with a runner-visible note). The runner cannot edit or cancel a request in MVP (proposed). The amount does not lower `availableAmount` until it is paid; while a request is open, a second one is refused.
- Destination phone: `GET /users/me` `phone` (exists).
- Notifications: `Payout sent` (`v-notifications.md`).
- Socket: none needed.

## Accessibility and mobile
Money keyboard; errors announced; the read-only destination is announced as `Send to M-Pesa, plus 254 733 111 222, not editable`.

## Decisions (owner, 2026-10-13)
- Row 117 (RQ-5): payout requests up to the available amount, configurable minimum, one open request, manual ops payment, own auditable record.
- Row 118 (RQ-6): destination fixed to the sign-in phone.

## Questions
- RQ-24 (minor, copy/ops): is there a payout time promise to show (e.g. `usually within one working day`)? Default: none.
