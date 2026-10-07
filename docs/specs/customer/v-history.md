# v-history — History

- Mockup: `docs/design/nitume_customer_app.html` lines 286–294 (`#v-history`, root tab view)
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/history_tab.dart`
- Status: partial

## Purpose
List of the customer's past tasks with status, date, runner and amount.

## Entry / exit
- Entry: tab bar "History".
- Card tap → push `v-task-detail`. Note: in the mockup the Cancelled card ("NTSA queue") has **no** onclick; recommended: all cards open detail (Q2).

## Task states
Finished: COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED, DISPUTED. Whether active tasks also appear is open (Q1).

## Layout (top to bottom)
1. Top bar (C-09) `History` (no actions).
2. List (`.hlist` padding 0 20) of task history cards (C-23): white, r 12, padding 14 15, margin-bottom 10.
   - Row 1: title 13.5/600 left, status chip right.
   - Row 2: meta Fira Code 11 slate-600 (`date · runner`).
   - Row 3: amount Fira Code 14/600, margin-top 6.
3. Pagination: load more on scroll (cursor).

## Components
C-09, C-23, C-05, C-33. NEW except C-05 (app-only).

## Copy (exact)
- Title: `History`
- Cards (mockup sample):
  - `Apartment check — Nyali` · `Completed` · `Today, 10:03 AM · Brian K.` · `KSh 2,200`
  - `Buy shoes — Sarit Centre` · `Completed` · `Yesterday, 4:12 PM · Faith M.` · `KSh 1,000`
  - `Collect documents — CBD` · `Completed` · `Mon, 10:03 AM · Peter O.` · `KSh 500`
  - `NTSA queue` · `Cancelled` (red chip) · `Last week · —` · `—`
- Missing runner / amount render as an em dash `—`.

Implied states (recommended):
- Empty: `No tasks yet.` + primary `Start a new task`.
- Loading: 3 skeleton cards.
- Error: `Couldn't load your history.` + `Try again`.
- Loading more: small spinner at the list end.
- Pull to refresh.

## Numeric fields (Fira Code)
- Meta line (date/time + runner), amount.

## Data
- `GET /api/v1/errands?limit=20&cursor=…` (exists, cursor pagination, newest first). Needs a filter for finished states (multi-status or `group=history`) — needs: api-contract.
- Amount: `final_price ?? quoted_price` on the errand (core `Errand.displayPrice`), or total paid from payments — Q3.
- Runner name per card: needs assignment + name on the list item (Q-NAME, needs: api-contract).
- No socket events.

## Accessibility and mobile
- Each card is one button with a combined label: title, status, date, amount.

## Questions for owner
- Q1: Does History include active tasks (mockup shows only finished)? Recommended: finished only; active ones live on Home/Track.
- Q2: Should the Cancelled card be tappable? Recommended: yes.
- Q3 (payments): Which amount is shown — the service + runner fee paid, or including the merchant amount? Recommended: amount paid through Nitume (service + runner fee) only, keeping merchant payment separate.
- Q-RED: "Cancelled" uses the red chip in the mockup.

## Current vs design
See gap report. Summary: hard-coded sample cards; status chips use `statusColor.withValues(alpha: 0.1)` instead of the chip tokens (green050/green700); `'FiraCode'` family string; private `_HistoryCard` (should be C-23 in core); no loading/empty/error, no pagination, taps do nothing.
