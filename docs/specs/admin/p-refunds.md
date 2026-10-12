# p-refunds — Refund reviews panel

- Mockup: **not drawn. EXTENDS MOCKUP**: a new sidebar item and panel. Built from the mockup's `#p-queue` panel (topbar + `.table-card`) and sidebar nav pattern. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (A-n components, §3 money, §6 refund vocabulary, §7 API gaps, §8 questions)
- Implementation: `apps/admin/src/app/features/admin/panels/refunds.panel.ts`; nav item in `features/admin/admin-dashboard.component.ts`
- Status: partial (spec update 2026-10-12 for rows 100, 102; was matches-design after the 2026-10-09 round-4 PASS; see Current vs design)

## Purpose
One place where ops sees every refund review (opened when a **paid** task ends CANCELLED, EXPIRED or FAILED, rows 37, 54, 102, or for an approved price decrease on a `send_to_runner` task, rows 48, 86; row 102: "a review trigger, not an automatic refund"), works the ones that need a decision, and records the manual M-Pesa payout of approved refunds. Refund reviews are records, not task states (§3.3 note). Any authorized admin works them; there is no second approver (row 77).

## Entry / exit
- Entry: sidebar nav item `Refunds` (A-15). **EXTENDS MOCKUP**: in a **new nav group `Payments`** (row 77), placed between the mockup's `Network` and `Insights` groups, with `Refunds` as its only item for now. Group label uses the existing `.ops-nav-label` (10.5 uppercase, `--nitume-sidebar-muted`), copy `Payments`; spacing as the other groups (`.ops-nav-group`, margin-bottom 22). Badge `.badge-count` = number of `Needs review` rows (see Data); hidden at 0; `99+` when the count page has a next cursor.
- Entry from the dispute drawer after a customer-favourable verdict (`drawer-dispute-outcome.md`): opens `drawer-refund` directly; the panel itself is not switched.
- Exit: row click or row button → `drawer-refund` (A-01) for that review. Changing panel closes any open drawer (existing shell behaviour).

## Task states
A cancellation-type review's task is `CANCELLED` (price-change reject IN_PROGRESS → CANCELLED, customer-favourable DISPUTED → CANCELLED, or any cancel after payment, including a payment that completes after cancellation), `EXPIRED` (RUNNER_ASSIGNED → EXPIRED, reason `Task expired`, row 102) or `FAILED` (RUNNER_EN_ROUTE → FAILED, reason `Task failed`, row 102). A `Price decrease` review's task is usually still active (IN_PROGRESS or later). The panel shows the task's chip from the API and never assumes it. No state transition is fired from this panel.

## Layout (top to bottom)
1. Topbar (A-03 `app-panel-topbar`), margin-bottom 26:
   - `h1` `Refunds` (23/700).
   - `.sub` (Fira Code 12.5 slate-600): see Copy.
   - Actions (gap 10): status filter `select.btn-city` (options below, default `Needs review`); `↻ Refresh` (`.btn-city`, as the queue/disputes panels).
   - No search box (the API has no search; do not filter client-side across pages).
2. Table card (A-04), full width. Columns:

   | Column | Content | Type |
   |---|---|---|
   | Task | `.task-cat` task title (errand title, else description first line, else category display name) + `.task-id` `#NT-XXXXX` (`shortId(errandId)`) | Fira Sans + Fira Code id |
   | Reason | trigger label (`_shared.md` §6) | Fira Sans 13 |
   | Refundable | The review's refund ceiling. While `pending_review`: `refundCeiling` (API, `feat/api-owner-answers-4`: `min(amountPaid, totalPaidToNitume − alreadyRefunded)`, net of earlier approved/refunded reviews on the task, row 87). Once decided (`refundCeiling` is null): `amountPaid`, the review's own basis (the decrease, or what was paid to Nitume). Until the API field is on `main`, fall back to `amountPaid` (`TODO(owner-answers-4)`). Use the same helper as the drawer (`reviewCeiling`), not a copy. Header renamed from `Paid to Nitume` (amendment SA-1) because it is not always what was paid | Fira Code (`td.num`) |
   | Refund | `refundAmount`, `—` while null | Fira Code |
   | Status | A-02 chip, `kind="refund"`; `Payout reversed` (amber) when `effectivePayout.state` is `reversed` (row 100, `_shared.md` §6) | chip |
   | Opened | `formatDateTime(createdAt)` (A-13) | Fira Code 12 slate-600 |
   | (action) | `.row-assign`: `Review` for `pending_review`, `Record payout` for `approved` and for a `refunded` review whose effective payout is reversed (row 100), `View` otherwise | button |

   - Whole row is `tr.clickable` (opens the drawer); the button stops propagation (same as the queue).
   - Order: newest first (API order: `createdAt DESC, id DESC`). Do not re-sort client-side.
3. `Load more` (A-12) under the table while `nextCursor` is non-null; appends rows.

Widths: the panel uses the main column (`.ops-main` padding 26 34 50). Below 1100px hide the `Opened` column; below 900px hide `Reason` (the sidebar is already hidden there by the existing shell, see Accessibility).

## Components
| Pattern | Id | Status |
|---|---|---|
| Sidebar item + badge | A-15 | exists |
| Panel topbar | A-03 | exists |
| Table card + row action | A-04 | exists |
| Status chip with `kind="refund"` | A-02 | exists; **NEW** `kind` input + refund labels |
| Load more | A-12 | exists (pattern) |
| Empty / loading | A-10 | exists |
| Error notice | A-11 | **NEW** |
| Money/date formatting | A-13 | **NEW** `formatKshExact`, `formatDateTime` |
| API error mapping | A-14 | **NEW** |

## Copy (proposed)
- Nav item: `Refunds`
- Title: `Refunds`
- Sub-line (Fira Code, counts from the loaded rows): `Needs review` filter → `{n} to review` (`No refunds to review` at 0); `Payout due` → `{n} payouts to record`; `Refunded` → `{n} refunded`; `No refund` → `{n} closed with no refund`; `All statuses` → `{n} refund reviews`. When `nextCursor` is non-null append `+` to `{n}` (`25+ to review`).
- Filter options (in this order): `Needs review` (`pending_review`), `Payout due` (`approved`; the API also returns reversed payouts here, N-15), `Refunded` (`refunded`), `No refund` (`no_refund`), `All statuses` (no `status` param).
- Nav group label: `Payments`.
- Column headers: `Task`, `Reason`, `Refundable`, `Refund`, `Status`, `Opened`, (blank).
- Row buttons: `Review`, `Record payout`, `View`.
- Empty states (A-10, title then text):
  - Needs review: `No refunds to review` / `Paid tasks that were cancelled, expired or failed, and price decreases on tasks paid to Nitume, land here for a refund decision.` (row 102)
  - Payout due: `No payouts to record` / `Approved refunds, and payouts that were reversed, wait here until you record the M-Pesa payout.` (row 100)
  - Refunded: `No refunds sent yet` / `Refunds you mark as paid appear here.`
  - No refund: `No reviews closed without a refund` / `Reviews you close at KSh 0 appear here.`
  - All statuses: `No refund reviews yet` / `A review opens when a paid task is cancelled, expires or fails.` (row 102)
- Loading (first load or filter change): `.ops-loading` `Loading refund reviews…`. `Load more` button reads `Loading…` while fetching.
- Error (first load): A-11 danger `Couldn't load refund reviews.` + `.btn .btn-outline` `Try again`. Error on Load more: A-11 danger under the table `Couldn't load more. Try again.`; the button stays.
- 403: `_shared.md` §2 copy.

## Numeric fields (Fira Code)
`#NT-XXXXX` task ids, `Refundable` amounts, `Refund` amounts, `Opened` date/time, the sub-line counts, the nav badge count.

## Data
- List: `GET /refunds?status=<status>&cursor=<cursor>&limit=25` (admin; on `main`). Response `{ items: RefundListItem[], nextCursor: string | null }`. Fields used: `id`, `errandId`, `trigger`, `amountPaid` (decimal string; the review's own basis, **not** net of other refunds), `refundCeiling` (decimal string while `pending_review`, null once decided; `feat/api-owner-answers-4`, N-9), `refundAmount` (decimal string or null), `status`, `createdAt`, `errand` (N-1), `effectivePayout` (N-15, row 100: `{ state, amount, reference, at }` or null; only `state` is used here). `alreadyRefunded`, `remainingRefundable` and `totalPaidToNitume` also arrive per item; the panel does not show them. `limit` 1–100 (default 25); `status` must be a `RefundStatus` value or omitted (400 otherwise).
- Task title: **needs: api-contract (N-1)** embed `errand { id, title, description, category, status }` in each item. Until then, look the errand up in `AdminDataService.errands()` (the last-100 window); when absent, show the category-less fallback `Task` + `#NT-XXXXX` and fetch nothing per row (no N+1 calls).
- Badge: on dashboard load and on every refresh, `GET /refunds?status=pending_review&limit=100` and count `items` (`99+` if `nextCursor`). **needs: api-contract (N-7)** a count endpoint to replace this.
- Refresh: the `↻ Refresh` button and returning from `drawer-refund` after a save reload the current filter from the first page and the badge. A save in the drawer also updates the row in place (status, refund amount) without waiting for the reload.
- Live updates: none. The API emits `refund.updated` in-process for notifications only; there is no admin socket event. Polling is not required (manual refresh, as in the other panels).
- Errors (A-14): 400 (bad filter) is a programming error, show the generic load error; 401 → interceptor; 403 → §2.

## Accessibility and desktop/mobile notes
- Admin is a desktop surface. The existing shell hides the sidebar below 900px with no alternative nav; this panel inherits that (gap noted in Current vs design, not fixed here).
- Rows are keyboard-reachable through the row button; `tr.clickable` is a mouse convenience only. The button's accessible name includes the task id: `Review refund for #NT-10482`.
- Filter `select` has `aria-label="Filter refunds by status"`.
- Row action buttons are at least 32px tall (`.row-assign` padding 6 12 at 12px gives ~30px: add 1px vertical padding or `min-height: 32px`).
- Chips carry text; colour is never the only signal.

## Resolved by owner answers
- Who approves and records payouts (AQ-1, row 77): any authorized admin, no second approver.
- Placement (row 77): new `Payments` nav group.
- Schema (rows 62, 71, 94): approved.
- Decrease reviews only on `send_to_runner` (row 86); ceiling net of earlier refunds (row 87); `KSh` (row 82).
- Row 102 (2026-10-12): paid EXPIRED and FAILED tasks open reviews; reasons `Task expired`, `Task failed` (`_shared.md` §6; needs N-16).
- Row 100 (2026-10-12): reversed payouts show `Payout reversed` and sit under `Payout due` (needs N-15).
- Row 96 (2026-10-12): `Opened` in 12-hour EAT (`_shared.md` §3.1; already built with `formatDateTime`).

## Open questions for the owner
None.

## Current vs design
Spec update 2026-10-12 (owner rows 100, 102) against `main` @ `4963a1c`: status set to **partial**.
1. Row 102: `refund-labels.ts:4-9` has no `expired_after_payment` / `failed_after_payment` labels; add `Task expired` / `Task failed` (one map, shared with the drawer). Empty-state texts for `Needs review`, `Payout due` and `All statuses` changed (Copy).
2. Row 100: the Status chip and row button must follow `effectivePayout.state` (`Payout reversed`, `Record payout`). Needs N-15.

Re-audit round 4, round 2 (2026-10-09) against `fix/angular-admin-owner-answers` @ `c1630ec`: **PASS**. `0592e9f`: the `Refundable` column shows `reviewCeiling(r)` from the shared `features/admin/refund-labels.ts` (`refundCeiling` while `pending_review`, else `amountPaid`; the drawer imports the same helper); test with `amountPaid` 1,500 / `refundCeiling` 1,200 → `KSh 1,200` and a decided row → `amountPaid`. Blocker 1 below is closed.

Re-audit 2026-10-09 round 4 against `fix/angular-admin-owner-answers` @ `f1323de` (`docs/audits/admin-gap-report.md`, addendum "Re-audit round 4"): **FAIL**.
1. Built: `Payments` nav group between `Network` and `Insights`, badge kept (`admin-dashboard.component.ts:115-135`, tested); header `Refundable`; Needs-review empty text; the round-3 fallbacks are gone (title from `errand`, badge from `GET /refunds/count`).
2. **Blocker**: `refunds.panel.ts:127` shows `r.amountPaid` under `Refundable`. The API keeps `amountPaid` as the review's gross basis and sends the net ceiling separately as `refundCeiling` (N-9). A pending cancellation review on a task that already had a decrease refund therefore shows more than can be refunded. Show `reviewCeiling(r)` (the drawer's helper, moved to a shared module such as `refund-labels.ts`), with a test for that case. The spec's earlier wording ("`amountPaid` = the ceiling") assumed N-9 would net `amountPaid` itself; the API chose a separate field, so this is a spec correction, not a builder error.

Earlier update (spec, 2026-10-09):
Spec update 2026-10-09 against `main` @ `c7675dc` (built and PASS in `docs/audits/admin-reaudit-2026-10-09.md`; now changed):
1. The nav item sits in the `Network` group after `Disputes` (`admin-dashboard.component.ts:74-128`). Move it to a new `Payments` group between `Network` and `Insights`, keeping the badge.
2. Column header `Paid to Nitume` → `Refundable` (SA-1).
3. Needs-review empty-state text updated (Copy).
Status set to `partial` until re-audited.

Earlier record (2026-10-08, before the build):
No implementation. `apps/admin` has no refunds route, nav item, API method or types (`core/api-types.ts` has no `RefundReview`). Shell file to extend: `features/admin/admin-dashboard.component.ts` (`Panel` union, nav group, `@switch`), data: `features/admin/admin-data.service.ts`, HTTP: `core/services/api.service.ts`.
