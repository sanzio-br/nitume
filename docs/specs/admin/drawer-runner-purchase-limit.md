# drawer-runner-purchase-limit — Purchase limit section in the runner drawer

- Mockup: **not drawn. EXTENDS MOCKUP** (row 138). A new section inside the existing runner drawer (`#drawer-runner`, `apps/admin/src/app/features/admin/drawers/runner-drawer.ts`, unaudited). Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3, §3.1, §7 N-19)
- API: **missing** (N-19, RA-22).
- Implementation: none
- Status: missing

## Purpose
Row 138 (owner, 2026-10-13): "KES 3,000 default, configurable per runner by admins. Changes audited with actor, timestamp, previous and new value. Runners cannot change their own limit." The limit (`runner_profiles.max_purchase_advance`) caps what a runner is expected to spend on an item (row 108), what can be reimbursed (row 135) and which offers they may accept (row 113).

## Entry / exit
- In `drawer-runner`, after the verification section: `.drawer-label` `Purchase limit`.
- Not linked from `drawer-runner-payout` (row 142, 2026-10-16): raising the limit is not the way to pay one purchase above it; that drawer has its own recorded exception.

## Layout
1. `.drawer-card` rows: `Current limit` → `KSh 3,000` (Fira Code, 600); `Last changed` → `{time} by {admin}` or `Default` when never changed.
2. `.btn .btn-outline` `Change limit` → inline form (replaces the button):
   - A-06 `New limit` (money input, `KSh` prefix, Fira Code, whole or 2 dp, > 0; hint `Default KSh 3,000.`).
   - A-06 `Reason` (required, 5–500, counter; hint `Kept in the audit history. Not shown to the runner.`). **Proposal for api-contract**: row 138 names only actor, time, previous and new value; a reason field is an addition. If api-contract does not add it, drop this field and the reason from History.
   - Actions `Cancel` / primary `Save limit`, disabled until valid and different from the current limit (`This is already the limit.`).
   - A-08 `Change {runner}'s purchase limit to KSh {x}?` / `It applies to new offers and to reimbursements created from now on.` / `Back` · `Save limit`. (Row 152, decided: each reimbursement keeps the limit stored when it was created, so a change never alters existing claims or reviews; paying one existing purchase above its limit uses the exception on that reimbursement, `drawer-runner-payout.md` §5 2b.)
3. `History` (`.drawer-timeline`, newest first): `KSh {previous} → KSh {new} · {admin} · {reason}` with time (Fira Code). Empty: `No changes yet.`

Success: A-11 success `Purchase limit saved.`; the drawer reloads. Errors (proposed codes): 409 `purchase_limit_conflict` (someone changed it; only if api-contract adopts the proposed `expectedPrevious` check) → reload + A-11; 400 validation → field errors; 403 → `_shared.md` §2.

## Runner drawer section `Payouts` (decided at the 2026-10-14 audit)
Above `Purchase limit`: `.drawer-label` `Payouts`; rows from `GET /runner-payouts/summary?runnerProfileId=` (built): `Owed now` → `availableAmount`; `In review` → `onHoldAmount`; `Waiting for confirmation` → `pendingAmount`; `Paid so far` → `paidAmount` (Fira Code); then the existing `View payouts` button. Labels avoid the forbidden words (`_shared.md` §3). Copy (proposed). Not built yet.

## Numeric fields (Fira Code)
Limits, previous/new values, times.

## Data (missing, N-19)
- `PATCH /runners/:id/purchase-limit` (admin) `{ maxPurchaseAdvance }` → `{ maxPurchaseAdvance, changedAt, changedBy }`; the runner role is refused (row 138). Proposals for api-contract, beyond row 138's actor/time/previous/new: optional `reason` (stored in the audit row) and `expectedPrevious` (optimistic concurrency, 409 `purchase_limit_conflict`).
- `GET /runners/:id/purchase-limit/history` → `[{ id, previous, next, changedBy { id, displayName }, changedAt, reason? (proposal) }]` from an append-only audit table (schema: approved in substance by row 138; api-contract proposes the table).
- `GET /runners` / runner detail already return `maxPurchaseAdvance`.

## Owner decisions applied
Row 138. Row 142 (2026-10-16): paying above the limit is a per-reimbursement exception with a recorded reason and actor (`drawer-runner-payout.md` §5 2b), not a limit change; the earlier "raise the limit first" proposal is withdrawn. Row 152 (2026-10-16, option b): the limit in force is stored on each payment/reimbursement obligation at creation; changing it here never changes existing claims or reviews (created at KSh 3,000, later 5,000 → that line stays 3,000).

## Open questions for the owner
- None. The row-142 follow-up was answered by row 152 (no: existing lines keep their stored limit).

## Current vs design
Not built.
