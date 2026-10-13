# p-payout-requests — Runner payout requests panel

- Mockup: **not drawn. EXTENDS MOCKUP** (rows 112, 117). Same patterns as `p-runner-payouts` and `p-refunds`. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3, §3.1, §6.1, §7 N-17)
- API: **missing** (N-17, RA-15 in `docs/audits/runner-gap-report.md`); names below are what the screen needs.
- Implementation: none
- Status: missing

## Purpose
Ops see the payout requests runners make from the Runner app (row 117: up to the available amount, configurable minimum, one open request per runner, paid manually by ops, each request an auditable record) and pay or reject each one. The destination is always the runner's sign-in phone (row 118).

## Entry / exit
- Entry: sidebar `Payments` → `Payout requests` (badge = open requests, `GET /runner-payout-requests/count?status=requested`).
- Row → request drawer section (below, hosted in `app-ops-drawer`, kind `payout_request`).

## Layout
1. Topbar: `h1` `Payout requests`; sub `{n} waiting` / `{n} paid` / `{n} not approved`; status filter `Waiting` (default, `requested`), `Paid`, `Not approved` (`rejected`), `All`; `↻ Refresh`.
2. Table: `Runner` (short name), `Requested` (amount, Fira Code), `Available now` (the runner's current `availableAmount`, Fira Code; amber caption `Less than requested` when lower), `Pay to` (phone, Fira Code), `Status` (A-02 §6.1), `Requested at` (EAT), action `Pay` / `View`.
3. `Load more`.

## Request drawer (`Payout request`)
1. Summary: chip; `{runner} asked for KSh {amount}`; rows `Pay to` → phone; `Requested` → time; `Runner's available balance` → `availableAmount` now (from `GET /runner-payouts/summary?runnerProfileId=`).
2. **Lines to pay** (status `requested`): the runner's payable lines (`GET /runner-payouts?status=payable&runnerProfileId=`, stored `payable` only), oldest first, checkboxes (A-16), preselected oldest first while the running total stays ≤ the requested amount. Footer `Selected KSh {x} of KSh {requested}` (Fira Code). Lines are paid whole (the ledger pays lines, not part-amounts; AQ-11).
3. `.drawer-actions`: primary `Record payout · KSh {x}` → the `p-runner-payouts` dialog (receipt) → `POST /runner-payout-requests/:id/pay` `{ lineIds, payoutReference }` (N-17: marks the lines paid exactly like `mark-paid`, links them to the request, closes it `paid` with the actual total). Outline `Reject request` → inline A-06 `Reason the runner will see` (required, 5–300; shown to the runner in the `Payout request not approved` notification) → A-08 `Reject this request?` / `The runner can make a new request.` → `POST /runner-payout-requests/:id/reject` `{ note }`.
4. Read-only (paid / rejected): `Paid` → total + receipt + time + admin, `Lines` list (links to `drawer-runner-payout`); or `Not approved` → note + admin + time.
5. Activity: `Requested`, `Paid · {receipt}` / `Not approved`, with actor and time (the audit trail, row 117).

Errors: 409 `payout_request_not_open` → reload; mark-paid errors as `p-runner-payouts`; 400 `payout_exceeds_request` (selected total above the request) → `Select lines totalling at most KSh {requested}.`

## Settings
The minimum request amount (row 117, "configurable") is an ops setting (N-17: where it is stored and edited; proposed: a `Settings`-style field in this panel's topbar menu, `Minimum payout request`, audited). Not drawn; no number in the docs.

## Numeric fields (Fira Code)
Amounts, totals, phone, times, counts, receipt.

## Data (all missing, N-17)
- `GET /runner-payout-requests?status=&runnerProfileId=&cursor=&limit=` → `{ items: [{ id, runner { id, shortName, phone }, amount, status: 'requested' | 'paid' | 'rejected', destinationPhone, createdAt, decidedAt, decidedBy, paidAt, payoutReference, paidAmount, lineIds, note }], nextCursor }`; `GET …/count?status=`; `GET …/:id`; `POST …/:id/pay`; `POST …/:id/reject`; settings read/write for the minimum.
- Built and reused: `GET /runner-payouts/summary?runnerProfileId=` (available balance), `GET /runner-payouts?status=payable&runnerProfileId=`.

## Owner decisions applied
Rows 117, 118, 112.

## Open questions for the owner
- **AQ-11 (payments)**: ledger lines are paid whole. When a runner requests part of their balance (row 117 allows any amount up to the available amount), may ops pay a total **below** the request (whole lines up to it) and close the request as paid with that total? Default: yes; the request shows `Paid KSh {x} of KSh {requested}` and the rest stays available. Alternative: the Runner app only offers amounts that match whole lines.

## Current vs design
Not built; API missing.
