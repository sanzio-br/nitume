# p-payout-requests — Runner payout requests panel

- Mockup: **not drawn. EXTENDS MOCKUP** (rows 112, 117). Same patterns as `p-runner-payouts` and `p-refunds`. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3, §3.1, §6.1, §7 N-17)
- API: list, count, detail, pay and reject **built on `main`** (`feb1dcc`, N-17, RA-15). Cancel (row 166) and the row-165 fields on the admin view are **missing** (N-17).
- Implementation: none
- Status: missing

## Purpose
Ops see the payout requests runners make from the Runner app (row 117: up to the available amount, minimum KES 500 set on the server (row 159), one open request per runner, paid manually by ops, each request an auditable record) and pay, reject or cancel each open one. The destination is always the runner's sign-in phone (row 118).

## Status names (row 166)
The owner names the lifecycle PENDING → PAID | REJECTED | CANCELLED. The built values are `requested` (= PENDING), `paid`, `rejected`, plus `cancelled` (to build). PAID, REJECTED and CANCELLED are terminal; a closed request is never reopened. Chips (A-02 `kind="payout_request"`, `_shared.md` §6.1): `requested` → `Waiting` (pending), `paid` → `Paid` (success), `rejected` → `Not approved` (neutral), `cancelled` → `Cancelled` (neutral).

| Action | Who | Reason | Runner sees | Ends as |
|---|---|---|---|---|
| Pay (whole lines) | any admin | optional note | `Payout sent` | `paid` |
| Reject | any admin | required, written for the runner (5–300) | the reason (`Payout request not approved`) | `rejected` |
| Cancel (row 166) | ops only (any admin; the runner cannot) | required free text, internal, 10–500 characters, whitespace-only invalid (row 169) | a generic `Payout request cancelled`, never the reason (row 168) | `cancelled` |

Reject is a decision on the runner's request ("we won't pay this"). Cancel withdraws a request that should not stay open (for example created by mistake, a destination problem, a duplicate, or a pending check); if money is still owed it stays in the runner's available amount and the runner makes a new request (row 166).

## Entry / exit
- Entry: sidebar `Payments` → `Payout requests` (badge = open requests, `GET /runner-payout-requests/count?status=requested`).
- Row → request drawer section (below, hosted in `app-ops-drawer`, kind `payout_request`).

## Layout
1. Topbar: `h1` `Payout requests`; sub `{n} waiting` / `{n} paid` / `{n} not approved` / `{n} cancelled`; status filter `Waiting` (default, `requested`), `Paid`, `Not approved` (`rejected`), `Cancelled` (`cancelled`), `All`; `↻ Refresh`.
2. Table: `Runner` (short name), `Requested` (`requestedAmount`, Fira Code), `Paid` (`paidAmount`, Fira Code; `—` until paid; shown in the `Paid` and `All` filters), `Available now` (the runner's current `availableAmount`, Fira Code; amber caption `Less than requested` when lower; only on `Waiting`), `Pay to` (phone, Fira Code), `Status` (A-02 §6.1), `Requested at` (EAT), action `Pay` (open) / `View`.
3. `Load more`.

## Request drawer (`Payout request`)
1. Summary: chip; `{runner} asked for KSh {amount}`; rows `Pay to` → phone; `Requested` → time (EAT, Fira Code); `Runner's available amount` → `availableAmount` now (on the detail); `Last change` → `updatedAt` (EAT, Fira Code; row 165, proposed).
2. **Lines to pay** (status `requested`): the runner's payable lines (`GET /runner-payouts?status=payable&runnerProfileId=`, stored `payable` only), oldest first, checkboxes (A-16), preselected oldest first while the running total stays ≤ the requested amount. Footer `Selected KSh {x} of KSh {requested}` (Fira Code). Lines are paid whole (the ledger pays lines, not part-amounts), so the selected total may be below the request (row 146). When it is, a caption 12 slate-600 under the footer: `KSh {requested − x} is not paid on this request. It stays owed to the runner, who can request it again.` (the amount is a Fira Code `.num` span, the sentence Fira Sans)
3. `.drawer-actions` (status `requested`):
   - Primary `Record payout · KSh {x}` → the `p-runner-payouts` dialog (receipt) → `POST /runner-payout-requests/:id/pay` `{ lineIds, payoutReference }` (marks the lines paid exactly like `mark-paid`, links them to the request, closes it `paid`, storing `paidAmount` = the total of the lines paid next to the unchanged `requestedAmount`, row 146). Confirm A-08 when the total is below the request: title `Pay KSh {x} of KSh {requested}?`; body `The request closes as paid with KSh {x}. The other KSh {requested − x} is not carried on this request; it stays owed to the runner for a new request.` (amounts Fira Code); buttons `Back` / `Record payout`.
   - Outline `Reject request` → inline A-06 `Reason the runner will see` (required, 5–300; shown to the runner in the `Payout request not approved` notification) → A-08 `Reject this request?` / `The runner can make a new request.` → `POST /runner-payout-requests/:id/reject` `{ note }`.
   - **Cancel (row 166)**: A-07 `.btn .btn-text` `Cancel request` (exists; below the two buttons, left-aligned; not red, red is a chip accent only; not green, it is not a primary action). Opens an inline section:
     - A-06 textarea, label `Reason for cancelling`, required, counter `{n}/500` (Fira Code), hint 11.5 slate-600 `Kept in the audit trail. The runner is told the request was cancelled, not this reason.` (row 168, decided). Length counted after trimming; whitespace-only counts as 0 (row 169). Under 10 characters: inline error A-06 `Enter at least 10 characters.` on blur or `Continue`; the field stops at 500.
     - Buttons outline `Back` and primary `Continue` (enabled at 10+ characters after trimming, row 169) → A-08 confirm: title `Cancel this payout request?`; body `The request for KSh {requested} closes as cancelled and can't be reopened. Nothing is paid and the runner's available amount doesn't change; they can make a new request.` (amount Fira Code); buttons `Back` / `Cancel request`.
     - → `POST /runner-payout-requests/:id/cancel` `{ reason }` → the updated view; success notice A-11 `Request cancelled.`; the runner gets `Payout request cancelled` (runner `v-notifications.md`).
4. Read-only (closed):
   - `paid`: rows `Requested` → `requestedAmount`; `Paid` → `paidAmount` (600); chip `Paid`; `M-Pesa receipt`, `Paid at`, `Recorded by`; when `paidAmount` < `requestedAmount` a caption 12 slate-600 `KSh {requestedAmount − paidAmount} was not paid on this request.` (amount Fira Code span); `Lines` list (links to `drawer-runner-payout`).
   - `rejected`: chip `Not approved`; `Reason the runner saw` → note; `By`; `At`.
   - `cancelled`: chip `Cancelled`; rows `Requested` → `requestedAmount` (unchanged, row 166); `Cancelled at` → `cancelledAt` (EAT, Fira Code); `Cancelled by` → admin name; `Reason` → `cancellationReason` (admins only). No lines, no actions.
5. Activity (the audit trail, rows 117, 165, 166), oldest first, each with actor and time (Fira Code): `Requested · KSh {requested}` by the runner (`createdByUserId`, shown as the runner's short name); then one of `Paid · KSh {paid} · {receipt}` / `Not approved · {note}` / `Cancelled · {reason}`.

Errors:
- 409 `payout_request_not_open` (on pay, reject or cancel) → reload the drawer, notice A-11 `This request is no longer open.`
- Pay: mark-paid errors as `p-runner-payouts`; 400 `payout_exceeds_request` → `Select lines totalling at most KSh {requested}.`; 400 `payout_request_runner_mismatch` → `These lines belong to another runner. Reload and try again.`
- Reject: 400 `decision_note_required` → field error `Give the runner a reason (5–300 characters).`
- Cancel: 400 on a missing or invalid reason (code to be named by api-contract, e.g. `cancellation_reason_required`) → field error `Give a reason (10–500 characters).`; 403 → `FORBIDDEN_COPY`.

## Settings
None. The minimum request amount is **KES 500**, a server-side setting with no admin UI for now (row 159). The earlier proposal of a `Minimum payout request` setting in this panel is dropped. The panel shows no minimum.

## Numeric fields (Fira Code)
Amounts (requested, paid, selected, remainder, available), totals, phone, every time (`Requested`, `Paid at`, `Cancelled at`, `Last change`, activity), counts, receipt, the reason counter.

## Data
Built on `main` (`feb1dcc`):
- `GET /runner-payout-requests?status=&runnerProfileId=&cursor=&limit=` → `{ items: AdminRunnerPayoutRequestView[], nextCursor }`; item `{ id, runner { id, shortName, displayName, phone }, requestedAmount, paidAmount (null until paid; ≤ requestedAmount), status, destinationPhone, availableAmount, createdAt, decidedAt, decidedBy { id, displayName }, paidAt, payoutReference, lineIds, note }`.
- `GET /runner-payout-requests/count?status=` → `{ count }`; `GET /runner-payout-requests/:id`; `POST …/:id/pay` `{ lineIds, payoutReference }`; `POST …/:id/reject` `{ note }`.
- Reused: `GET /runner-payouts?status=payable&runnerProfileId=`.

Missing (N-17, api-contract):
- Row 166: `POST /runner-payout-requests/:id/cancel` `{ reason }`; status `cancelled` accepted by the `status` filter and `count`; view fields `cancelledAt`, `cancelledBy { id, displayName }` (from `cancelledByUserId`), `cancellationReason`. The runner view carries `status: 'cancelled'` and `cancelledAt`, never the reason (row 168, decided). 400 `cancellation_reason_invalid` (fewer than 10 or more than 500 characters after trimming, or whitespace only, row 169) → inline error `Enter 10 to 500 characters.`
- Row 165: `createdBy` (from `createdByUserId`) and `updatedAt` on the admin view (both stored already).

## Owner decisions applied
Rows 117, 118, 112. Row 146 (AQ-11): "a request paid below the requested amount closes as PAID; store requested and actual paid amounts separately (e.g. requested KES 5,000, paid KES 4,000, PAID). The remainder is not carried in the same request; it stays in available balance for a new payout request." Row 143: no payout time is shown or promised anywhere in this panel or in what it sends to the runner. Row 153: table approved. Row 159: KES 500 minimum, server config, no admin UI. Row 165: `createdByUserId` (server-side, immutable) and `updatedAt`. Row 166: ops-only cancel with a mandatory free-text reason; PENDING → PAID | REJECTED | CANCELLED, all terminal; `requested_amount` unchanged; `cancelledByUserId`, `cancelledAt`, `cancellationReason`; no reopening. Row 168: the runner never sees the reason; authorised ops/admin see it for audit. Row 169: 10–500 characters, mandatory, whitespace-only invalid.

## Open questions for the owner
- None. AQ-13 (row 168) and AQ-14 (row 169) decided 2026-10-16.

## Current vs design
Not built in `apps/admin` (no `payout-request` code). The API side is on `main` except cancel and the row-165 fields.
