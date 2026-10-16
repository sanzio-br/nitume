# v-payout — Request payout

- Mockup: `docs/design/nitume_runner_app.html` lines 418–428 (`#v-payout`, overlay)
- Shared conventions: `_shared.md` (§7, §8)
- Implementation: none
- Status: missing

## Purpose
Let the runner ask Nitume to send all or part of their available amount to their M-Pesa number. Decided (row 117): runners request payouts up to their available amount, above a configurable minimum (KES 500, server-side, row 159), one open request at a time; ops pay manually; each request is an auditable record. Destination fixed to the sign-in phone (row 118). The runner cannot cancel a request (row 166).

## Entry / exit
- Entry: `v-earnings` `Request payout`.
- Back (C-10) → `v-earnings`.
- `Confirm payout` → C-35 confirm → request → back to `v-earnings` with snackbar `Payout requested. We'll let you know when it's sent.` (no time promise, row 143) (mockup `pop()`).
- With a request already open the screen opens read-only: C-40 `You already have a payout request open: KSh 6,000, requested Mon, 10:03 AM.` (amount and time Fira Code), CTA disabled. Status only, no expected time (row 143). No cancel or edit control: only ops can cancel a request (row 166).
- Available amount below the minimum (row 159): the screen opens (from a deep link or a stale `v-earnings`) with C-40 info `You can request a payout once your available balance reaches KSh 500.` (`KSh 500` = `minimumAmount`, Fira Code span), amount field and CTA disabled.

## Task states
None (ledger).

## Layout (top to bottom)
1. C-10 header `Request payout`.
2. R-08 balance card without actions (margin-top 0): `Available balance`, amount.
3. C-08 `Amount` (padding-top 0); C-17 money field (padding 0 20), prefilled with the available amount, Fira Code value. Under it C-04 link `Use full amount` when edited (proposed) and the hint 11.5 slate-600 `Minimum KSh 500.` (row 159; the figure is `minimumAmount` from the API, Fira Code span, never a constant in the app).
4. C-08 `Send to`; **read-only** R-05-style field (white, r-s 8, slate-line, padding 11 14): `M-Pesa · +254 733 111 222` (Fira Code for the number) = the runner's sign-in phone (row 118). Hint 11.5 slate-600 `Payouts go to the number you sign in with.` (proposed). Mockup draws an editable input; editing the destination is not supported (row 118).
5. Fixed bottom C-01 `Confirm payout`.

## Validation (proposed)
| Rule | Message |
|---|---|
| number > 0, max 2 decimals | `Enter an amount in KSh.` |
| ≤ available amount | `You can request up to KSh {available}.` |
| ≥ minimum (rows 117, 159; today KSh 500) | `The minimum payout is KSh 500.` (`minimumAmount`, Fira Code span). Same copy for API 400 `payout_below_minimum` (use its `minimumAmount` extra) |
| no open request (row 117) | screen shows C-40 `You already have a payout request open.` and the CTA is disabled |

## Confirm dialog (C-35, proposed)
Title `Send KSh 8,450 to your M-Pesa?`; body `To +254 733 111 222.`; buttons `Send` / `Back`. No payout time promise (row 143, decided): the dialog and the success snackbar never say when the money arrives.

## Copy
Exact, from the mockup: `Request payout`, `Available balance`, `Amount`, `Send to`, `M-Pesa · +254 733 111 222`, `Confirm payout`. Everything else proposed.

## Numeric fields (Fira Code)
- Balance; amount input; phone number; minimum (`KSh 500`) and maximum in the hint, the notices, the `payout_below_minimum` error and the dialog.

## Data
Decided (rows 117, 118): runner payout requests with their own auditable record; ops pay manually to the sign-in phone. **Built on `main`** (RA-15, `feb1dcc`, table `runner_payout_requests`); cancel (row 166) not built yet:
- `GET /runners/me/earnings` (built) for `availableAmount`.
- `GET /runners/me/payout-requests/summary` (built) → `{ minimumAmount, availableAmount, openRequest: { id, requestedAmount, status, createdAt } | null }`. `minimumAmount` is the server setting (row 159: KES 500, recommended name `MIN_RUNNER_PAYOUT_REQUEST`; built as `RUNNER_PAYOUT_REQUEST_MINIMUM_KES` with default 0, so the deployment must set 500; api-contract).
- `POST /runners/me/payout-requests` `{ amount }` + `Idempotency-Key` header (reused on retry) → `{ id, requestedAmount, paidAmount: null, status: 'requested', destinationPhone, createdAt }`. The destination is the user's sign-in phone, set by the server; the body has no phone field (row 118). Errors: 400 `payout_below_minimum` (`minimumAmount`), 400 `payout_exceeds_available` (`availableAmount`), 409 `payout_request_open` (`requestId`), 403 not verified.
- `GET /runners/me/payout-requests?cursor=` → `{ items: [{ id, requestedAmount, paidAmount, status, destinationPhone, createdAt, decidedAt, paidAt, reference, decisionNote }], nextCursor }` for `v-earnings` / `x-payout-history` (row 146: `paidAmount` null until `paid`, may be lower than `requestedAmount`). Row 166 adds `status: 'cancelled'` and `cancelledAt` (to build); `decisionNote` stays null on a cancelled request (the ops cancellation reason is not in the runner view, proposal below).
- Lifecycle (every step stored with actor and time; rows 165, 166): `requested` (owner name **PENDING**) → `paid` (ops record the M-Pesa receipt; the payable lines covered become `paid` through the same mark-paid step, so the feed shows the derived `payout` entry) or `rejected` (ops, with a runner-visible note) or `cancelled` (ops only, mandatory reason, row 166). `paid`, `rejected` and `cancelled` are final; no reopening. **Paid below the request (row 146, decided)**: ops pay whole lines, so `paidAmount` can be lower than `requestedAmount`; the request still closes `paid`, both amounts are stored separately, and the remainder is not carried on that request. It stays in `availableAmount`, and the runner may make a new request for it once the paid one is closed. The list item therefore carries `requestedAmount` and `paidAmount` (null until paid) instead of a single `amount` (needs api-contract, RA-15). Row 153 (2026-10-16): table `runner_payout_requests` approved as proposed (`requested_amount`, `paid_amount` separate); no longer pending. The runner cannot edit or cancel a request (row 166, decided). `createdByUserId` (the runner, set by the server) and `updatedAt` are on the record (row 165) and not shown in the app. The amount does not lower `availableAmount` until it is paid; while a request is open, a second one is refused.
- Destination phone: `GET /users/me` `phone` (exists).
- Notifications: `Payout sent`, `Payout request not approved`, `Payout request cancelled` (`v-notifications.md`).
- **Cancelled request (row 166)**: when ops cancel the open request, this screen opens editable again (no open request); the runner may make a new request at once. If the screen is open when it happens (refresh on resume / push), it reloads and shows C-40 info `Our team cancelled your request for KSh 6,000. You can make a new request.` (amount Fira Code; proposed), once.
- Socket: none needed.

## Accessibility and mobile
Money keyboard; errors announced; the read-only destination is announced as `Send to M-Pesa, plus 254 733 111 222, not editable`.

## Decisions (owner, 2026-10-13)
- Row 117 (RQ-5): payout requests up to the available amount, configurable minimum, one open request, manual ops payment, own auditable record.
- Row 118 (RQ-6): destination fixed to the sign-in phone.

- Row 143 (RQ-24, 2026-10-16): no payout-time promise or SLA; status only.
- Row 146 (2026-10-16): a request paid below the requested amount closes as PAID; requested and paid amounts shown separately; the remainder stays available for a new request.

- Row 159 (2026-10-16): minimum KES 500, server-side config, no admin UI; shown in Fira Code in the hint and errors.
- Row 165 (2026-10-16): `createdByUserId` (server-side, immutable) and `updatedAt` on the request.
- Row 166 (2026-10-16): ops-only cancel with a mandatory reason; PENDING (= `requested`) → PAID | REJECTED | CANCELLED, all final; the runner cannot cancel and makes a new request if still owed.

## Questions
- Owner (row 166 follow-up, proposal): the ops cancellation reason is **not** shown to the runner. The runner sees a fixed line (`Our team cancelled your request…`) and can contact Support. Reason: a cancel reason is a mandatory audit field written for ops (for example a wrong destination or a fraud check), unlike the reject note, which ops write for the runner. Alternative: show it like the reject note.
