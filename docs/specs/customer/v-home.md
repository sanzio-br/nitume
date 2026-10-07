# v-home — Home

- Mockup: `docs/design/nitume_customer_app.html` lines 225–253 (`#v-home`, root tab view)
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/home_tab.dart` (inside `home_shell.dart`)
- Status: partial

## Purpose
Landing screen after sign-in: greet the customer, start a new task by category, jump to the active task, and reopen recent tasks.

## Entry / exit
- Entry: after OTP verify; tab bar "Home"; every `jump(…, true)` reset (submit rating, OTP verify).
- Exits:
  - Bell → push `v-notifications`.
  - Avatar → switch to `v-profile` tab (root view, not a push).
  - Search row → not interactive in the mockup (see Q2).
  - Any category tile → push `v-new-category` (recommended: with that category preselected, Q3).
  - "Track live →" → switch to `v-track` tab for that errand.
  - Recent row → push `v-task-detail` for that errand.

## Task states
- "In progress" card: the customer's most recent errand in an active state (PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER). Also show for REQUESTED / QUOTED / ACCEPTED with a different action (Q4).
- "Recent": last 2 errands in COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED, DISPUTED.

## Layout (top to bottom)
1. Top bar (C-09), padding `8 20 14`, slate bg:
   - Left: greeting 12 slate-600 (margin-bottom 2), name 21/700.
   - Right (gap 10): bell (C-11) and 36px initials avatar (C-12).
2. Search entry row (C-34), margin `4 20 18`, padding `13 16`, r 12, icon 15 + placeholder 13.5 slate-400.
3. Section label (C-08) "Categories".
4. Category grid (C-15): 3 columns, gap 10, padding `0 20 20`. Six tiles, in this order: Buy For Me, Get It For Me, Check It For Me, Go There For Me, Wait For Me, Business Tasks.
5. Section label "In progress".
6. Active task card (C-20), margin `0 20 14`, blue fill r 16 padding 18:
   - Tag pill: category + task number. Mockup colours are off-palette (`rgba(4,175,77,.2)` bg, `#5FE092` text) → use blue-050 bg + blue text (C-05 info), 11/700 (Q5).
   - Title 15.5/600 white, margin `0 0 4`.
   - Meta Fira Code 12, margin-bottom 14. Mockup colour `#AEB9CC` is off-palette → slate-400 `#8C97AC` (Q5).
   - Button `.track-btn`: green fill, white 12.5/700, padding `9 16`, r 10 (pill per Q-RADIUS), **intrinsic width, left aligned** (not full width).
7. Section label "Recent".
8. Two compact task rows (C-22), margin `0 20 10`, chip success "Completed".
9. Bottom padding so the last row clears the tab bar.

## Components
| Element | Component | Status |
|---|---|---|
| Top bar with greeting | C-09 | NEW |
| Bell | C-11 | NEW |
| Avatar | C-12 | NEW |
| Search row | C-34 | NEW |
| Section labels | C-08 | NEW |
| Category grid/tile | C-15 | NEW |
| Active task card | C-20 | NEW |
| Recent rows | C-22 + C-05 | NEW / app-only |
| Tab bar | C-13 | NEW |
| Empty/loading/error | C-33 | NEW |

## Copy (exact)
- Greeting: `Good afternoon` (time-based: `Good morning` before 12:00, `Good afternoon` 12:00–17:59, `Good evening` after — implied).
- Name: customer first name (`Achieng`) — no data source, Q-NAME.
- Search placeholder: `What do you need done?`
- Section labels: `Categories`, `In progress`, `Recent`.
- Active card sample: tag `Inspection · #10482` (should read `Check It For Me · #10482`, Q-CAT), title `Apartment check — Nyali`, meta `Brian K. is en route · ETA 12 min`, button `Track live →`.
- Recent sample rows: `Buy shoes — Sarit Centre` / `Yesterday, 4:12 PM` / `Completed`; `Collect documents — CBD` / `Mon, 10:03 AM` / `Completed`.

Implied states (recommended copy):
- No active task: hide the "In progress" label and card.
- No history: hide "Recent", or show muted `Your finished tasks will show here.`
- Loading: skeleton for the card and two rows (C-33).
- Error: inline `Couldn't load your tasks.` + `Try again` outline button; categories stay usable.

## Numeric fields (Fira Code)
- Task number in the tag (`#10482`).
- Active card meta line (`… · ETA 12 min`).
- Recent row timestamps (`Yesterday, 4:12 PM`).

## Data
- Customer name / initials: `GET /users/me`, `GET /customers/me` — no name field exists (Q-NAME).
- Active + recent: `GET /api/v1/errands?status=…&limit=…` (exists; cursor pagination). The API filters by a single `status`; Home needs "any active" and "any finished" → needs a multi-status or `group=active|history` filter (needs: api-contract).
- Title: errands have only `description`; mockup titles (`Apartment check — Nyali`) look like a short title + area. No `title` field in the ERD → Q6.
- Task number `#10482`: errand `id` is a UUID; no human-readable number in the ERD → Q7.
- Runner name + ETA on the active card: needs the assignment + runner summary on the errand (not returned today) and ETA from `location:update` (§4.2).
- Unread dot on bell: `GET /notifications/unread-count` (exists).
- Socket: join `errand:{id}` for the active errand; `location:update` `{lat, lng, eta}` updates ETA; status-change event (name undefined in §4, needs: api-contract) refreshes the card.

## Accessibility and mobile
- Bell: semantic label "Notifications, N unread"; 48dp hit area.
- Avatar: "Profile".
- Category tiles: button semantics with the full category name.
- Active card button contrast: white on green passes; meta slate-400 on blue ≈ 5:1.

## Questions for owner
- Q1: Q-CAT (category labels), Q-NAME (customer and runner names).
- Q2: What does the search row do? It is static in the mockup. Recommended: tapping opens `v-new-category`, or hide it until search exists.
- Q3: Should tapping a Home category tile preselect it in the wizard? The mockup always opens the wizard with "Inspect" selected. Recommended: preselect the tapped category.
- Q4: Which states show in the "In progress" card, and what is its button for REQUESTED/QUOTED/ACCEPTED (no runner yet)? Recommended: `View quote` / `Pay now` actions for those.
- Q5: Off-palette colours in the active card (`#5FE092`, `#AEB9CC`, green 20% tint). Recommended replacements: chip-info tag, slate-400 meta.
- Q6 (schema): Mockup shows a short task title; ERD has only `description`. Recommended: derive the title client-side from category + location area, or add `title` (schema change).
- Q7 (schema): Human-readable task numbers (`#10482`, `#NT-10482`) are not in the ERD. Recommended: add a sequential `reference` column, or show a short id.
- Q8: Should there be more than one active card if the customer has several active errands? Recommended: horizontal list or "+N more" link to History.

## Current vs design
See gap report. Summary: all content is hard-coded; categories are a horizontal scroll of 56px icon squares (not the 3-column tile grid) with short labels; top bar is a `SliverAppBar`; active-card tag uses green 20% tint + green text; track button is full width; recent chip colour is `green` at 10% alpha; meta lines use an unregistered `'FiraCode'` family; no navigation is wired (TODOs).
