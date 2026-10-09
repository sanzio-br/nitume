# v-history — History

- Mockup: `docs/design/nitume_customer_app.html` lines 286–294 (`#v-history`, root tab view)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/shell/history_tab.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
List of the customer's finished tasks with status, date, runner and amount paid.

## Entry / exit
- Entry: tab bar "History".
- Card tap → push `v-task-detail`. **All** cards are tappable, including Cancelled (the mockup's missing onclick is treated as an omission; Q2 default).

## Task states
The finished set (`_shared.md` §6): COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED, DISPUTED. Active tasks live on Home and Track (Q1 default).

## Layout (top to bottom)
1. Top bar (C-09) `History` (no actions).
2. List (padding 0 20) of task history cards (C-23): white, r-m 14 (mockup 12), padding 14 15, margin-bottom 10.
   - Row 1: title 13.5/600 left (§7 title rule), status chip right (§6: Completed = success, Cancelled = **red danger**, OA-13).
   - Row 2: meta Fira Code 11 slate-600 (`date · runner short name`).
   - Row 3: amount Fira Code 14/600, margin-top 6.
3. Pagination: load more on scroll (cursor). Pull to refresh.

## Components
C-09, C-23, C-05, C-33. All built (C-05 tone change for Cancelled).

## Copy (exact, mockup sample)
- Title: `History`
- `Apartment check — Nyali` · `Completed` · `Today, 10:03 AM · Brian K.` · `KSh 2,200`
- `Buy shoes — Sarit Centre` · `Completed` · `Yesterday, 4:12 PM · Faith M.` · `KSh 1,000`
- `Collect documents — CBD` · `Completed` · `Mon, 10:03 AM · Peter O.` · `KSh 500`
- `NTSA queue` · `Cancelled` (red chip) · `Last week · —` · `—`
- Missing runner / amount → em dash `—`.

States (proposed):
- Empty: `No tasks yet.` + primary `Start a new task` → `v-new-category`.
- Loading: 3 skeleton cards. Error: `Couldn't load your history.` + `Try again`. Loading more: small spinner at the list end.

## Numeric fields (Fira Code)
- Meta line (date + runner), amount.

## Data
- `GET /api/v1/errands?status=<finished set>&limit=20&cursor=…` (multi-status filter on `feat/api-customer-gaps`; newest first).
- Amount: the fee total paid through Nitume (service + runner fee) from the errand/payment (Q3 default, row 34: one total, never split). Never adds the item/merchant amount (§8, three flows separate). Refunds are not shown here (only on `v-task-detail`, `_shared.md` §11).
- Runner short name: the API-computed short name on the list item's runner summary (row 40; needs: api-contract). Without one, the meta shows the date only.
- No socket events.

## Accessibility and mobile
- Each card is one button: title, status, date, amount.

## Resolved by owner answers
- Red Cancelled chip: OA-13 (was Q-RED).
- Names: OA-2.

## Open questions (non-blocking; build default given)
- Q1: Include active tasks? Default: no.
- Q2: Cancelled card tappable? Default: yes.
- Q3: Amount = service + runner fee only. Default as stated.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: one `GET /payments/:errandId` per card for the amount (fee total missing on the list item, api-contract need open).
