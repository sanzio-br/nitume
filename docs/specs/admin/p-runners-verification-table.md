# p-runners-verification-table — Runner verification: table of applicants with filters

- Owner instruction (BOARD row 278, 2026-10-21): "for the verification page, all the documents should be viewed in a different file, the verification page should have a table list of users to verify and then view documents that render the cards with the images or documents uploaded, the table should also have filters".
- Mockup: `docs/design/nitume_admin_dashboard.html` `#p-runners` (lines 331–355) for the title, count line and search box; the table styling is the mockup's `#p-queue` table (lines 113–125 CSS, 315–326 markup: `.table-card`, `th`, `td`, `tr.clickable`, `.task-cat`, `.task-id`, `.row-assign`). The mockup draws a card grid on `#p-runners`; **row 278 replaces it with a table. EXTENDS MOCKUP**. Copy, columns and filters not in the mockup are marked **(proposed)**.
- Detail view: `docs/specs/admin/drawer-runner-verification.md` (the documents view the `View documents` action opens).
- Rules that still apply unchanged: `docs/specs/admin/p-runners-verification-documents.md` (queue contract A-5, filters and order row 264, newest record per (type, side) A-9 / row 271, level rule rows 261 / 263 / 268, retention and logging rows 125, 144, 154, 161). Shared conventions: `docs/specs/admin/_shared.md` (§3.1 times, §5 A-ids).
- Implementation today: `apps/admin/src/app/features/admin/panels/verifications.panel.ts` (card grid, one card per runner; on `feat/admin-verification-cards`, merged into `docs/verification-owner-answers-269`). Status against this spec: **partial** (data, status filter, paging, count are built; table, area / level / search filters and the separate documents view are not). See `Current vs design`.

## Purpose
Give ops one scannable list of runner applicants (one row per runner) that they can filter, and open one runner's documents in a separate view to decide the checks. The list itself never shows or loads an ID or selfie image.

## Entry and exit
- Entry: sidebar `Network` → `Verifications` (A-15, as built; `admin-dashboard.component.ts`, `@defer` lazy chunk kept).
- Exit: `View documents` on a row, or a click anywhere on the row → the documents drawer (`drawer-runner-verification.md`). Changing panel closes any open drawer (shell rule, as built).
- The runner profile drawer is reached from the documents drawer (`Open runner profile`), not from the table (proposed: one row action, no second click target in the row).

## Layout (top to bottom)
Panel padding from `.ops-main` (26 / 34 / 50). No new layout primitives.

### 1. Topbar: A-03 `app-panel-topbar` (exists; replaces the inline `.ops-topbar` copy in `verifications.panel.ts:246-276`)
- Title `Runner verification` (mockup).
- Sub (12.5, slate-600): `{n} applications awaiting review` / `1 application awaiting review` / `No applications awaiting review` (as built, `awaitingCopy`; `n` = API `awaitingReviewCount`, whole queue, independent of every filter; Fira Code value per the existing A-03 sub). `Loading…` before the first answer.
- Search box (A-03 `searchPlaceholder`, 220 px, mockup `🔍 Search runners…`): placeholder `Search name, phone or ID` (proposed). **Needs API AV-2** (below); hidden until the API supports it (no client-side search over a paged list: it would miss runners on later pages).
- `[topbar-actions]` (each a `select.btn-city`, the pattern of `runner-payouts.panel.ts:132-160`), left to right:
  1. Status (as built): `Pending` (default), `Rejected`, `Approved`, `All statuses`. `aria-label="Filter by status"`. No API change.
  2. Service area (proposed): `All areas` + one option per area from `GET /runners/service-areas` (exists, admin allowed; `{ items: [{ id, name }] }` by name). `aria-label="Filter by service area"`. **Needs API AV-2.** If the area list fails to load: the select shows only `All areas` and is disabled (no notice; the table still works).
  3. Level (proposed): `All levels`, `Level 1 · Basic`, `Level 2 · ID verified`, `Level 3 · Trusted`, `Level 4 · Professional` (the A-02 `kind="level"` labels, `status-chip.component.ts` `LEVEL_LABELS`). `aria-label="Filter by level"`. **Needs API AV-2.**
  4. `↻ Refresh` (as built).
- Filters not proposed for this round (question AQ-43): applied-date range (no date-range control in the admin, and the API has no such filter), column sorting.

### 2. Panel note (`.kpi-note`, as built position)
Two sentences (proposed change to the first one; the second is owner-approved, row 267, unchanged):
`Opening a runner's documents shows their ID and selfie images; each image shown is logged. Images are deleted at the end of the retention period.` **+** `A runner reaches Level 2 when both ID sides and the selfie are approved, and drops back to Level 1 while any of them is rejected or replaced.`
(The built first sentence `Opening an image is logged.` no longer describes the flow once images render inline; final wording depends on AQ-40.)

### 3. Panel notice (A-11, `.panel-notice`, as built)
Load errors and the `This check was already decided. The list is updated.` info stay at panel level. Decision notices (`Check approved.` …) now show inside the drawer.

### 4. Table: A-04 `.table-card` (exists; `refunds.panel.ts:105-145` is the model)
One `tr.clickable` per runner (a queue item). `th` 10.5/700 uppercase slate-600 on slate fill, `td` 13 px, padding 14 × 18, hairline rows (A-04 as built). Columns (all **proposed**):

| # | Header | Cell | Source (queue item) | Font |
|---|---|---|---|---|
| 1 | `Runner` | line 1 `.task-cat` (600): short name (`user.shortName`, e.g. `Mercy W.`); no name → the short id in its place. Line 2 `.task-id` (11, slate-400): short id `#NT-XXXXX` (`shortId(runnerProfile.id)`). When line 1 already shows the short id, line 2 is omitted. | `user.shortName`, `runnerProfile.id` | name Fira Sans; short id Fira Code (`.task-id` is Fira Code) |
| 2 | `Phone` | `formatPhone(user.phone)` (`+254 712 345 678`); none → `—` | `user.phone` | Fira Code (`td.num`) |
| 3 | `Service area` | first area by name; more than one → `{name} +{n}` (`+{n}` Fira Code); none → `—` | `runnerProfile.serviceAreas` | Fira Sans, `+{n}` Fira Code |
| 4 | `Level` | A-02 `app-status-chip kind="level"` (`Level 1 · Basic` …); no level → `—` | `runnerProfile.verificationLevel` | chip (level digit is part of the chip label, as in the runners directory) |
| 5 | `Checks` | summary over the **newest record per (type, side)** (the shared `newestPerCheck`, A-9 / row 271) plus the required checks never submitted: `{p} pending · {r} rejected · {m} not submitted`, each part only when > 0, in that order; none of the three → `All verified`. `{m}` = entries of `verification.checks` with `status: 'missing'`. Never a colour-only signal; no chips here (the status chip is column 7). | `checks`, `verification.checks` | words Fira Sans, counts Fira Code (`app-num-text`) |
| 6 | `Waiting since` | `formatDateTime(oldestPendingAt)` (12-hour EAT, `Today, 4:30 PM`); null → `—` | `oldestPendingAt` | Fira Code |
| 7 | `Applied` | `formatDateTime(runnerProfile.appliedAt)` | `appliedAt` | Fira Code |
| 8 | `Status` | A-02 `app-status-chip kind="verification"`: runner status = `pending` if any newest record is pending, else `rejected` if any is rejected, else `approved` → `Pending` (amber chip), `Rejected` (red chip), `Approved` (green chip: a complete state). Same precedence as the API filters (row 264). Prefer the API's value when AV-5 ships. | derived (or AV-5 `applicationStatus`) | chip |
| 9 | (sr-only `Action`) | `.row-assign` `View documents`; `aria-label="View documents for {runner}"`; `$event.stopPropagation()` then open (refunds pattern) | — | Fira Sans |

- Tables use absolute times (§3.1, as `Opened` on refunds); the card's relative `Applied 2 days ago` is not used in the table.
- Responsive (same pattern as `.refunds-table`): below 1100 px hide `Applied`; below 900 px hide `Service area`. The table never scrolls sideways at 1024 px.
- Row order: the API order per status filter, unchanged (row 264): `Pending` oldest pending first; `Rejected` / `Approved` most recently decided first; `All statuses` most recent submission first. No client sorting, no sortable headers (AQ-43).
- Caption under the table (`.panel-caption`, 12 slate-600, proposed): `Showing {shown} of {total}` (`total` from the API = runners matching the filters; numbers Fira Code). Hidden while loading or empty.

### 5. Paging: A-12 `app-load-more` (exists)
As built: pages of 20 runners (`limit` and `nextCursor` count runners), `Load more` appends, a runner returning on a later page is merged into its row (never a second row). A failed `Load more` keeps the rows and shows A-11 danger `Couldn't load verifications. Try again.` with `Load more` still available (as built).

## States
- **First load / filter change / refresh**: A-10 `.ops-loading` `Loading…` (as built) while no rows are shown. Any filter or search change resets the cursor, clears the rows and reloads (M4 rules kept: the previous filter's rows never stay under a new filter).
- **Empty** (load succeeded, no runner), A-10 `.ops-empty` (proposed):
  - default view (`Pending`, all areas, all levels, no search): `No applications awaiting review` + `New runner submissions land here.`
  - any other filter or a search: `No applications match` + `Clear the filters, or wait for runner submissions.` (built text says `filter`; plural now that there are several).
- **Load error**: A-11 danger `Couldn't load verifications. Try again.` (as built), rows cleared, no empty state under it; the next load clears it (M4). 403 → `FORBIDDEN_COPY`. 400 `cursor_invalid` on `Load more` (filters changed under a stale cursor) → reload from the first page silently.
- **After a decision in the drawer**: the row updates in place at once (store `verificationQueue`, as built in `admin-data.service.ts` `reviewVerification`: status chip, checks summary, level, waiting since) and the topbar count updates (as built). When the drawer closes after one or more decisions, the panel reloads the current filters from the first page (the refunds panel pattern, `refunds.panel.ts` `savedSinceOpen`; proposed), so a runner who no longer matches leaves the list then, never under the admin's cursor while the drawer is open.

## Security rule for the table (row 278 brief, rows 125 / 154)
The table never calls `GET /runners/verifications/:id/document`, never renders a thumbnail, and never prefetches anything for the drawer (no hover or idle prefetch). Images are fetched only by the documents drawer when it opens (`drawer-runner-verification.md`).

## Components
| Piece | Pattern | Status |
|---|---|---|
| Topbar with search and selects | A-03 `app-panel-topbar` + `select.btn-city` | exists |
| Table | A-04 `.table-card`, `tr.clickable`, `.task-cat`, `.task-id`, `.row-assign`, `td.num`, `.cell-muted` | exists |
| Level and status chips | A-02 `app-status-chip` `kind="level"` / `kind="verification"` | exists |
| Mixed-font cells and counts | `app-num-text` | exists |
| Paging | A-12 `app-load-more` | exists |
| Notices, loading, empty | A-11, A-10 | exist |
| Shared verification helpers (`newestPerCheck`, `pendingCheckCount`, `checkRows`, `levelLine`, `awaitingCopy`, labels) | move from `verifications.panel.ts` / `admin-data.service.ts` into one file (proposed `features/admin/verification-labels.ts`, like `refund-labels.ts`) used by the panel **and** the drawer | refactor (web-parity), no copy-paste |
| Responsive column hiding | `.verif-table .col-applied`, `.col-area` media rules in `_ops.scss`, same as `.refunds-table` | NEW style rule (web-parity, tokens only) |

No new colour, no new font declaration, no hex outside `_tokens.scss`.

## Copy
- Mockup: `Runner verification`, `{n} applications awaiting review`, `Search runners…` (placeholder replaced by `Search name, phone or ID`, proposed).
- As built (kept): `1 application awaiting review`, `No applications awaiting review`, `All statuses`, `Pending`, `Approved`, `Rejected`, `↻ Refresh`, `Loading…`, `Load more`, `Couldn't load verifications. Try again.`, `No applications match`, panel note sentence 2 (owner-approved, row 267).
- Proposed: column headers `Runner`, `Phone`, `Service area`, `Level`, `Checks`, `Waiting since`, `Applied`, `Status`; `View documents` (owner's words), `View documents for {runner}`; `{p} pending · {r} rejected · {m} not submitted`, `All verified`; `All areas`, `All levels`, `Level 1 · Basic` … `Level 4 · Professional`; `Search name, phone or ID`; `Showing {shown} of {total}`; `New runner submissions land here.`; `Clear the filters, or wait for runner submissions.`; panel note sentence 1 `Opening a runner's documents shows their ID and selfie images; each image shown is logged. Images are deleted at the end of the retention period.`
- Never: wallet / escrow wording, `Approve → runner level upgrades`, a retention date or countdown, raw enum values (`government_id`, `1_basic`).

## Numeric fields (Fira Code)
Topbar `{n}`; short id `#NT-XXXXX`; phone; `+{n}` area count; the counts in `Checks` (`3`, `1`); `Waiting since` and `Applied` times; `Showing {shown} of {total}` numbers. Not numeric: names, area names, chip words, column headers, the words in `Checks`.

## Data
- Built (on `feat/api-verification-answers`, stacked in `feat/api-level-drop-followups`; not on `main` until the owner merges): `GET /runners/verifications/queue?status=&cursor=&limit=` → `{ items, nextCursor, total, awaitingReviewCount }`; item shape in `p-runners-verification-documents.md` Data (A-5). `GET /runners/service-areas` (admin allowed) for the area options. Task state: none (runner records, not tasks). Sockets: none (no verification event in System Design §4; the list refreshes on `↻ Refresh`, a filter change, or a drawer close after a decision).
- **API must add (api-contract)**:
  - **AV-2 queue filters**: on `GET /runners/verifications/queue` add optional `serviceAreaId` (UUID of a configured area; unknown → 400 `service_area_invalid`), `level` (`1_basic | 2_id_verified | 3_trusted | 4_professional`; other → 400) and `q` (trimmed, 2–64 characters; else 400). `q` matches, case-insensitively: the user's display name (contains); the phone by digits (contains, with `07…` / `7…` / `+2547…` normalised to the stored form); the short id (`#NT-` / `NT-` prefix optional, matched against the last 5 alphanumerics of the runner profile id, the client's `shortId` rule). Filters combine with AND and with `status`. The cursor is bound to the whole filter set (status + area + level + q): a cursor from another set → 400 `cursor_invalid` (as for `status` today). `total` = runners matching all filters; `awaitingReviewCount` stays the whole queue, independent of every filter. Same order rules (row 264). Phone-only runners stay excluded.
  - **AV-5 (optional, recommended)** `applicationStatus: 'pending' | 'rejected' | 'approved'` on each queue item, computed by the same SQL as the status filter, so the status chip and the filter cannot disagree (precedent: `level2Missing`, one definition server-side). Until then the client derives it with `newestPerCheck` (precedence pending > rejected > approved).
  - AV-1, AV-3, AV-4: see `drawer-runner-verification.md` Data.
- Delivery can be staged: the table with the status filter, the paging and the drawer needs no API change; the area, level and search controls ship (unhidden) when AV-2 is on the branch the admin builds against.

## Accessibility
- Table: `th scope="col"`; the action column header is `sr-only` `Action` (refunds pattern). The row is clickable for the mouse, but the keyboard path is the `View documents` button (a real `button`, 32 px min height as `.row-assign`; proposed 40 px is not required for a table action: the existing A-04 size is kept for parity with the other tables).
- Selects carry `aria-label`s (above); the search input `aria-label="Search runners"`.
- Status and checks are text (chip words, `{p} pending …`), never colour alone.
- Focus returns to the row's `View documents` button when the drawer closes (proposed; the shell drawer today does not restore focus: note for web-parity, not a blocker).

## Questions for the owner (see `_shared.md` AQ table)
- AQ-42: detail view as the existing right-hand drawer (recommended) or a full page.
- AQ-43: applied-date range filter and sortable columns now, or later (recommended later).
- (AQ-40, AQ-41, AQ-44 concern the drawer's image loading: `drawer-runner-verification.md`.)

## Current vs design (spec 2026-10-21 against `docs/verification-owner-answers-269` @ `cfbfa69`)
`verifications.panel.ts` renders the card grid (`:287-456`) with the documents inline and `View image` opening a new tab (`:345-360`, `viewImage :719-748`); topbar re-implemented inline (`:246-276`) instead of A-03; status filter only. Built and reusable as is: the queue store and paging (`admin-data.service.ts` `verificationQueue`, `mergeQueuePage`, `awaitingReviewCount`), the status filter values, the load-error rules, the newest-per-check helpers, `awaitingCopy`, `levelLine`. Findings T-1 … T-9 in `docs/audits/admin-gap-report.md` "Spec 2026-10-21: verification table and documents drawer (row 278)".
