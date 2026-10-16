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
2. Table: `Runner` (short name), `Requested` (`requestedAmount`, Fira Code), `Paid` (`paidAmount`, Fira Code; `—` until paid; shown in the `Paid` and `All` filters), `Available now` (the runner's current `availableAmount`, Fira Code; amber caption `Less than requested` when lower), `Pay to` (phone, Fira Code), `Status` (A-02 §6.1), `Requested at` (EAT), action `Pay` / `View`.
3. `Load more`.

## Request drawer (`Payout request`)
1. Summary: chip; `{runner} asked for KSh {amount}`; rows `Pay to` → phone; `Requested` → time; `Runner's available amount` → `availableAmount` now (from `GET /runner-payouts/summary?runnerProfileId=`).
2. **Lines to pay** (status `requested`): the runner's payable lines (`GET /runner-payouts?status=payable&runnerProfileId=`, stored `payable` only), oldest first, checkboxes (A-16), preselected oldest first while the running total stays ≤ the requested amount. Footer `Selected KSh {x} of KSh {requested}` (Fira Code). Lines are paid whole (the ledger pays lines, not part-amounts), so the selected total may be below the request (row 146, decided 2026-10-16). When it is, a caption 12 slate-600 under the footer: `KSh {requested − x} is not paid on this request. It stays owed to the runner, who can request it again.`
3. `.drawer-actions`: primary `Record payout · KSh {x}` → the `p-runner-payouts` dialog (receipt) → `POST /runner-payout-requests/:id/pay` `{ lineIds, payoutReference }` (N-17: marks the lines paid exactly like `mark-paid`, links them to the request, closes it `paid`, storing `paidAmount` = the total of the lines paid next to the unchanged `requestedAmount`, row 146). Confirm A-08 when the total is below the request: title `Pay KSh {x} of KSh {requested}?`; body `The request closes as paid with KSh {x}. The other KSh {requested − x} is not carried on this request; it stays owed to the runner for a new request.` (amounts Fira Code); buttons `Back` / `Record payout`. Outline `Reject request` → inline A-06 `Reason the runner will see` (required, 5–300; shown to the runner in the `Payout request not approved` notification) → A-08 `Reject this request?` / `The runner can make a new request.` → `POST /runner-payout-requests/:id/reject` `{ note }`.
4. Read-only (paid / rejected): rows `Requested` → `requestedAmount`; `Paid` → `paidAmount` (600); chip `Paid` (A-02 §6.1); `M-Pesa receipt`, `Paid at`, `Recorded by`; when `paidAmount` < `requestedAmount` a caption 12 slate-600 `KSh {difference} was not paid on this request.` (example: Requested KSh 5,000 · Paid KSh 4,000 · Paid); `Lines` list (links to `drawer-runner-payout`); or `Not approved` → note + admin + time.
5. Activity: `Requested · KSh {requested}`, `Paid · KSh {paid} · {receipt}` / `Not approved`, with actor and time (the audit trail, row 117).

Errors: 409 `payout_request_not_open` → reload; mark-paid errors as `p-runner-payouts`; 400 `payout_exceeds_request` (selected total above the request) → `Select lines totalling at most KSh {requested}.`

## Settings
The minimum request amount (row 117, "configurable") is an ops setting (N-17: where it is stored and edited; proposed: a `Settings`-style field in this panel's topbar menu, `Minimum payout request`, audited). Not drawn; no number in the docs.

## Numeric fields (Fira Code)
Amounts, totals, phone, times, counts, receipt.

## Data (all missing, N-17)
- `GET /runner-payout-requests?status=&runnerProfileId=&cursor=&limit=` → `{ items: [{ id, runner { id, shortName, phone }, requestedAmount, paidAmount (null until paid; ≤ requestedAmount), status: 'requested' | 'paid' | 'rejected', destinationPhone, createdAt, decidedAt, decidedBy, paidAt, payoutReference, lineIds, note }], nextCursor }` (row 146: two stored amounts; the remainder is never carried on the request); `GET …/count?status=`; `GET …/:id`; `POST …/:id/pay`; `POST …/:id/reject`; settings read/write for the minimum.
- Built and reused: `GET /runner-payouts/summary?runnerProfileId=` (the runner's available amount), `GET /runner-payouts?status=payable&runnerProfileId=`.

## Owner decisions applied
Rows 117, 118, 112. Row 146 (AQ-11, owner 2026-10-16): "a request paid below the requested amount closes as PAID; store requested and actual paid amounts separately (e.g. requested KES 5,000, paid KES 4,000, PAID). The remainder is not carried in the same request; it stays in available balance for a new payout request." Row 143: no payout time is shown or promised anywhere in this panel or in what it sends to the runner.

## Open questions for the owner
None.

## Current vs design
Not built; API missing.
