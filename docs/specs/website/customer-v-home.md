# customer `v-home` (web): Home

- Issue: GitHub #7, "[Website] Customer: home and create-task wizard". Builder: `web-parity`. Branch: `feat/website-customer-create-task` (contains #6 at `32ea1a1` through merge `55af009`).
- Route: `/app/customer/home` (root view; the #6 route in `app-area/customer.routes.ts` keeps `title: 'Home · Nitume'` and `navKey: 'home'`, drops `stubLabel` and loads `HomePage` from `app-area/customer/home/home.page.ts`; F§2, NC§W1). Shared rules: `auth-foundation.md` (F§n), `customer-shell.md`, wizard foundation NC§W* in `customer-v-new-category.md` (links, errands API, kit additions). Kit: `ui-kit.md` (K§n).
- Sources: mobile spec `docs/specs/customer/v-home.md` (matches-design, round 10); Flutter `apps/customer_app/lib/src/screens/shell/home_tab.dart`, `util/display.dart` (`activeCardMeta`, `activeCardAction`, `greetingFor`, `firstName`, `errandTitle`, `errandReference`), `navigation/nav.dart` (`openForStatus`); core `widgets/{active_task_card,task_rows,search_entry_row,notification_bell,initials_avatar,category_tile}.dart`, `repositories/errand_repository.dart` (status sets); mockup `nitume_customer_app.html` lines 47–69, 225–253; owner answers OA-1, OA-2, OA-13, OA-14, OA-15, OA-18, rows 23, 27, 40, 41, 176, 182, 183; WQ-2 (open), WQ-15, WQ-16, **WQ-29** (owner 2026-10-29: no ETA on the Home active card), WQ-33 / WQ-34 (NC§W10).
- There is no web mockup. **(web adaptation)** = layout only. **(proposed)** = copy the mobile spec marks as proposed (built in the app).
- **Updated 2026-10-29** for WQ-29 and the #6 build (NC§W0): the top bar is the #6 `nm-top-bar`, the avatar fallback is the #6 `person` icon, the visually hidden heading uses the #6 `nm-visually-hidden` mixin, every link target comes from `customerLinks` (NC§W1).
- Implementation: none. `/app/customer/home` is the #6 `ViewStubComponent` (top bar `h1` `Home` only). Status: **missing**.

## Purpose
Landing screen after sign-in: greet the customer by first name, start a new task by category, jump to the active task, reopen recent tasks.

## Entry / exit
- Entry: F§6.2 destination for a customer with a name; nav `Home`; wordmark in the side nav; `openerUrl` fallback of the wizard; later screens that reset to Home (#10 rating submitted, task cancelled).
- Exits (all links, `customerLinks`, NC§W1):
  - Bell → `notifications()` (#11).
  - Avatar → `profile()` (root view, nav `Profile` becomes active).
  - Search row → `newTask()` (nothing selected, mobile Q2 default).
  - Category tile → `newTask(<wire>)` (preselected, mobile Q3 default).
  - Active card button → by state (table below). `Pay now →` is a plain link in #7; #8 owns `CheckoutIntentStore` and adds the intent write to this link when it lands (`customer-x-awaiting-quote.md` A§3).
  - `+N more in progress` → `track()` (nav `Track`, mobile Q8 default).
  - Recent row → `taskDetail(id)` (#9).

## Task states

"In progress" card = the **first** errand of the active list (API order: newest created first; the mobile spec says "most recently updated", the built app and the API use creation order; the web follows them). Active set (`_shared.md` §6): REQUESTED, QUOTED, ACCEPTED, PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER. Finished set ("Recent"): COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED, DISPUTED. DRAFT is never listed.

| State | Meta line (proposed, built) | Button | Target |
|---|---|---|---|
| REQUESTED | `Waiting for your quote` | `View request →` | `awaitingQuote(id)` (#8) |
| QUOTED | `Your quote is ready` | `Review quote →` | `awaitingQuote(id)` (#8) |
| ACCEPTED | `Pay to confirm your task` | `Pay now →` | `payment(id)` (#8) |
| PAYMENT_CONFIRMED | `Finding a runner` | `Track live →` | `track(id)` (#9) |
| RUNNER_ASSIGNED | `Finding a runner` (rows 176, 183: never the offered runner's name) | `Track live →` | `track(id)` |
| RUNNER_EN_ROUTE | `{runner} is en route` | `Track live →` | `track(id)` |
| ARRIVED | `{runner} has arrived` | `Track live →` | `track(id)` |
| IN_PROGRESS | `{runner} is on it` | `Track live →` | `track(id)` |
| AWAITING_CUSTOMER | `Ready for your review` | `Review evidence →` | `evidence(id)` (#10) |
| any other (defensive) | `customerStatus(status).label` | `Track live →` | `taskDetail(id)` |

`{runner}` = `assignment.runner.shortName` trimmed, exactly as the API returns it (row 40); missing/empty → `Your runner`. Never a phone number, never shortened client-side. **No ETA on Home** (owner WQ-29, 2026-10-29: the card follows the built app; Track shows the ETA). Home does not subscribe to `location:update`.

Recent rows show the status chip from `customerStatus()` (K§4.2.3): e.g. COMPLETED/CONFIRMED/SETTLED `Completed` (success), CANCELLED `Cancelled` (danger), EXPIRED `Expired` (info), FAILED `Failed`, DISPUTED `Disputed`.

## Layout

Gutters come from the shell content column (F§7.3: 20px below 768px, 24px from 768px); no element below adds its own horizontal margin (the mobile `margin 0 20` becomes 0).

**Below 768px** (the app, top to bottom):
1. `nm-top-bar` (#6, `shared/ui/top-bar`): `[greeting]` (`greeting` type, 12 slate-600) above `[title]` = the first name (`top-bar-title`, 21/700, `h1`); projected actions (gap 10px, #6): bell, avatar.
2. Search entry row, 4px above, 18px below.
3. `nm-section-label` `Categories` (padding `6px 0 10px`).
4. `nm-category-grid` link mode (NC§Components): 3 columns, gap 10px, 20px below; five tiles, row 2 third cell empty; no selected state.
5. Tasks region (one of):
   - Loading: one `nm-skeleton-card` height 140px, 14px gap, two `nm-skeleton-card`s (72px, 10px gap), 6px above. No section labels.
   - Error: `nm-error-state` (Copy).
   - Loaded: `In progress` label + active card (14px below) + optional `+N more in progress` link (8px below), then `Recent` label + up to two task rows (10px apart). Each part hidden when its list is empty.
6. Bottom space so the last row clears the bottom bar (the shell pads `<main>`, F§7.3).

**768–1023px** (web adaptation): same single column, `max-width: 640px`, left-aligned in the content column under the top bar (which spans the column).

**1024px and wider** (web adaptation, uses the width at 1280px+): the top bar spans the content column (max 1180px). The three layouts are CSS only (`nm-up($nm-bp-md)`, `nm-up($nm-bp-lg)` in `home.page.scss`; no `matchMedia` signal needed). Below the top bar a two-column grid, `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`, gap 24px, aligned to the top:
- Left: search row, `Categories`, category grid (still 3 columns).
- Right: the tasks region (loading / error / `In progress` + card + link + `Recent` + rows).
DOM order stays top bar → search → categories → tasks at every width (reading and tab order match the app). With no active and no finished tasks the right column is empty (the app shows no empty message either).

## Components

| Element | Component | Status |
|---|---|---|
| Top bar with greeting and actions | `nm-top-bar` | exists (#6) |
| Bell with unread dot (C-11) | `nm-notification-bell` | **NEW (#7)**, built here once (the kit assigns the bell to #11, K§3; Home needs it first; #11 and the runner top bars reuse it) |
| Initials avatar (C-12) | `nm-avatar` | **NEW (#7)**, built here once; sizes small 36 / medium 60 / large 70 so #10, #11 and #12 reuse it |
| Search entry row (C-34) | `nm-search-entry` | **NEW (#7)** |
| Section labels | `nm-section-label` `[inset]="false"` | kit (#5; `NgTemplateOutlet` replaced, NC§W9a) |
| Category grid + tiles (C-15) | `nm-category-grid` (link mode) | NEW (#7), NC§Components; icons from the #6 registry + NC§W9a |
| Active task card (C-20) | `nm-active-task-card` | **NEW (#7)**; reused by #9 if needed |
| `+N more in progress` | `nm-button` variant `link`, size `small`, `href` | kit |
| Recent rows (C-22) | `nm-task-row` | **NEW (#7)** |
| Status chips | `nm-status-chip` (`[customerStatus]`, size `regular`) / size `compact` with `tone` and `numericSuffix` | exists (#5) |
| Loading / error | `nm-skeleton-card` (`[height]`), `nm-error-state` (`message`, `retry`) | exists (#5) |
| Visually hidden `h1` `Home` (no name) | `nm-visually-hidden` mixin | exists (#6) |

`nm-notification-bell` (port of `NotificationBell`, `shared/ui/notification-bell/`): 48×48 link (`<a>` with `href`; followed in-app with the #6 `followInAppLink`, `shared/ui/links.ts`); inside, a 36px white circle with 1px slate-line border and an 18px `notifications` icon (NC§W9a) in blue; when `unread > 0` a 7px `--nitume-red` dot with a 1.5px white ring at top 8px / right 9px (OA-13). Accessible name `Notifications, N unread` (N > 0) or `Notifications`. Input `unread: number`, `href`.

`nm-avatar` (port of `InitialsAvatar`, `shared/ui/avatar/`): blue circle (`--nitume-blue`), white 700 initials (13px at 36, 20px at 60, 24px at 70; Sans, NC§W9a type table), `initialsFor(displayName)` (NC§W9a); no initials → white `person` icon (#6 registry). As a link: 48×48 hit area, accessible name from the input (`Profile`). White text on blue (design rule).

`nm-search-entry` (port of `SearchEntryRow`, `shared/ui/search-entry/`): a **link** styled as a field (it opens the wizard; it is not a text input). White, 1px slate-line border, radius `--nitume-r-m` (14px; mockup 12), padding 13px 16px, min-height 48px; 15px `search` icon (NC§W9a) slate-400, 10px gap, placeholder text `body` (13.5) in slate-400. Hover: border blue; focus ring. Accessible name = the placeholder text.

`nm-active-task-card` (port of `ActiveTaskCard`; OA-14 replacements): `--nitume-blue` fill, radius `--nitume-r-m` (14px; mockup 16), padding 18px, no shadow.
- Tag: `nm-status-chip` size `compact` (11/700, no dot), tone **info** (blue on blue-050; replaces the mockup green tint and `#5FE092`), `label` = category display name, `numericSuffix` = `#` + reference (Fira Code) when the API sent one.
- 10px, title `nm-type(card-title, $color: white)` (15.5/600 **white**).
- 4px, meta `nm-type(num-meta-lg, $color: slate-400)` (Fira Code 12/400, whole line) in **`--nitume-slate-400`** (replaces `#AEB9CC`; ≈ 5:1 on blue); the element also carries `nmNum` (empty, family only) so the numeric-field tests find it.
- 14px, action `nm-button` primary small (green fill, white 12.5/700, pill, OA-11), intrinsic width, left-aligned, rendered as `<a href>`.
- The card itself is not clickable (app parity).

`nm-task-row` (port of `TaskRow`, `shared/ui/task-row/`): white, 1px slate-line, radius `--nitume-r-m`, padding 13px 15px, whole row an `<a>`; left column title `nm-type(row-title, 13px)` (13/600 blue, one line, ellipsis) over meta `num-meta` (Fira Code 11 slate-600); 10px gap; trailing `nm-status-chip` regular. Hover border blue; focus ring.

## Copy (exact)
- Greeting by **browser local** hour (owner WQ-2, 2026-10-29: activity times use browser local time): `Good morning` before 12:00, `Good afternoon` 12:00–17:59, `Good evening` from 18:00.
- Name: first word of `displayName` (OA-2), e.g. `Achieng`. No name (should not happen after `x-name-capture`): greeting line only, no empty title (`nm-top-bar` empty-title rule, Needs row 40).
- Search row: `What do you need done?`
- Section labels: `Categories`, `In progress`, `Recent`.
- Tiles: `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me` (OA-1, OA-18: no Business Tasks).
- Active card sample: tag `Check It For Me · #NT-10482`, title `Apartment check — Nyali`, meta `Brian K. is en route`, button `Track live →`. Title = `title` when set, else the category display name (OA-15, row 41). Meta and buttons: Task states table.
- `+N more in progress` (N = active count − 1, shown when N ≥ 1).
- Recent row: title (same fallback), meta `formatDayTime(updatedAt ?? createdAt)` in browser local time (`Yesterday, 4:12 PM`, `Mon, 10:03 AM`), hidden when both are missing.
- Error: `Couldn't load your tasks.` + `Try again` (proposed, built).
- Document title: `Home · Nitume`.

## States

| State | Behaviour |
|---|---|
| Loading (first load and every reload) | Skeletons in the tasks region; top bar, search row and categories render and work at once |
| Loaded, active and finished | `In progress` + card (+ link) and `Recent` + up to 2 rows |
| No active task | `In progress` label and card hidden |
| No finished task | `Recent` hidden |
| Empty (both lists empty) | Only top bar, search row and categories; no empty-state message, no illustration (app parity) |
| Error (either list request fails) | `nm-error-state` `Couldn't load your tasks.` with `Try again` (outline) → reload both lists; categories stay usable |
| Unread count fails | Bell without dot, no error |
| No display name | Greeting only, avatar shows the person icon |
| Live status change of the active errand | Reload (below) |
| Realtime disconnected | Poll every 30 s while the tab is visible; no `Reconnecting…` line on Home (the app shows none) |
| Active errand en route | Meta `{runner} is en route`, never an ETA (WQ-29) |

## Numeric fields (Fira Code)
- Task reference in the tag (`#NT-10482`, `numericSuffix`).
- Active card meta (whole line, `.li-meta` rule), including the words.
- Recent row timestamps.
- `+N` in `+N more in progress` (`nmNum` on the count only; the words stay Sans, as the built link's `NumSpan`).

## Data
- Name and initials: `SessionStore.user().displayName` (F§4.2; from `GET /api/v1/users/me`, exists). No extra call.
- Active: `GET /api/v1/errands?status=REQUESTED,QUOTED,ACCEPTED,PAYMENT_CONFIRMED,RUNNER_ASSIGNED,RUNNER_EN_ROUTE,ARRIVED,IN_PROGRESS,AWAITING_CUSTOMER&limit=5` (exists; multi-status filter on `main`).
- Recent: `GET /api/v1/errands?status=COMPLETED,CONFIRMED,SETTLED,CANCELLED,FAILED,EXPIRED,DISPUTED&limit=2` (exists).
- Both through `CustomerErrandsApi.list` (NC§W5), in parallel; response `{ items: ErrandView[], nextCursor }`; fields used: `id`, `category`, `title`, `reference`, `status`, `createdAt`, `updatedAt`, `assignment.runner.shortName`.
- Unread: `GET /api/v1/notifications/unread-count` → `{ unread: number }` (exists), fetched on every reload.
- Realtime (rows 23, 29; K§6): when the active errand id is known, `RealtimeService.joinErrand(id)`; `statusChanges$` for that `errandId` → reload; every transition of `state` to `connected` (after a drop) → reload once; when the active id changes, `leaveErrand(old)` then join the new one; on destroy `leaveErrand`. Events for other errands are ignored. No `location:update` subscription (WQ-29). `price_change:requested` is the shell's app-level listener (#8), not Home's.
  - Without `effect()` (NC§W10): join/leave run imperatively when a load completes and the first active id differs from the joined one; the reconnect reload uses `RealtimeService.onStateChange(listener, destroyRef)` (NC§W9a); `statusChanges$` is subscribed with `takeUntilDestroyed`.
- Polling fallback only while `RealtimeService.state() !== 'connected'` and `document.visibilityState === 'visible'`: reload every 30 s (app `Poller`, `_shared.md` §10). One `setInterval` created in the constructor and cleared through `DestroyRef`; each tick checks both conditions; a host listener `'(document:visibilitychange)'` needs no extra timer.
- Web difference (`customer-shell.md`): the view is re-created when its route opens and loads a fresh snapshot each time (the app keeps the tab alive and reloads on return).
- Services: `CustomerErrandsApi.list` and `NotificationsCountApi.unread()` (NC§W5), both through the #6 lazy interceptor.
- No endpoint is missing for Home.

## Accessibility and responsive
- Bell `Notifications, N unread` / `Notifications`; avatar `Profile`; both 48×48.
- Category tiles are links with the display name as their accessible name (no selected state here).
- Active card: white on blue and white on green pass AA; slate-400 meta on blue ≈ 5:1. The tag's accessible text is `Check It For Me #NT-10482`.
- Loading skeletons `role="status"` `aria-label="Loading"`; the error is `role="alert"` (kit).
- `In progress` and `Recent` are `h2` section labels under the page `h1` (the first name, or no `h1` without a name: then a visually hidden `h1` `Home` (#6 `nm-visually-hidden` mixin, in `home.page.scss`) keeps the heading outline and receives the #6 post-navigation focus, web adaptation).
- No horizontal scroll at 360px; the tag chip ellipsises; row titles ellipsise.

## Required tests (Vitest)
1. Greeting by injected clock: 11:59 `Good morning`, 12:00 `Good afternoon`, 17:59 `Good afternoon`, 18:00 `Good evening`; name `Achieng Wanjiru` → title `Achieng`; no name → greeting only, no visible title, visually hidden `h1` `Home`.
2. Avatar: initials `AW`, person icon without a name, link to `/app/customer/profile`, accessible name `Profile`, blue fill token with white text.
3. Bell: unread 3 → red dot (`--nitume-red`) and `Notifications, 3 unread`; 0 → no dot, `Notifications`; unread request failure → no dot, no error; links to `/app/customer/notifications`.
4. Search row: text `What do you need done?`, link to `/app/customer/new` with no query, slate-400 text token.
5. Categories: five tiles in order with exact names, no `Business Tasks`, empty sixth cell, each a link to `/app/customer/new?category=<wire>`.
6. Requests: exactly the two list calls with the status lists and limits above, plus the unread call; no other call.
7. Loading: 140px + 2 × 72px skeletons, no `In progress` / `Recent` labels, category links usable.
8. **Empty**: both lists empty → no `In progress`, no `Recent`, no error, no empty message; categories and search still render.
9. Error: active list 500 (and separately recent list 500) → `Couldn't load your tasks.` + `Try again`; clicking retries both calls; network error shows the same copy.
10. Active card, table-driven over the nine active states: meta text, button label and href per the Task states table (`/app/customer/tasks/<id>/quote`, `/app/customer/tasks/<id>/payment`, `/app/customer/track/<id>`, `/app/customer/tasks/<id>/evidence`); RUNNER_ASSIGNED with a runner present still shows `Finding a runner`; RUNNER_EN_ROUTE without `shortName` shows `Your runner is en route`; no meta contains `ETA` or a minute count (WQ-29).
11. Tag: compact info chip with `Check It For Me` and `#NT-10482` in `nmNum`; `reference: null` → name only; `title: null` → title `Check It For Me`.
12. Card tokens: blue fill, white title, meta in Fira Code with the slate-400 token, primary small button; no `box-shadow`, no raw hex.
13. `+N more`: three active → `+2 more in progress` with `+2` in `nmNum`, link to `/app/customer/track`; one active → absent.
14. Recent: two rows max; title fallback; meta `formatDayTime(updatedAt ?? createdAt)` in Fira Code with injected `now`; chip labels for COMPLETED, CONFIRMED (`Completed`), CANCELLED (`Cancelled`, danger); row links to `/app/customer/tasks/:id`.
15. Unknown `status` string in a list item → item dropped (no chip, no card).
16. Realtime (fake `RealtimeService`): joins the active errand's room; a `statusChanges$` event for that id reloads; an event for another id does not; `state` → `connected` after `reconnecting` reloads once (through `onStateChange`); changing active id leaves the old room; destroy leaves the room and removes the state listener; `locationUpdates$` is never subscribed (WQ-29).
17. Polling (fake timers): none while connected; every 30 s while not connected and visible; paused while `document.visibilityState` is `hidden`.
18. Layout (CSS only; the #6 `declared()` helper reads the compiled rules): base single column; `@media (min-width: 768px)` caps the column at 640px; `@media (min-width: 1024px)` sets the two-column grid with search + categories left and tasks right; DOM order unchanged (top bar, search, categories, tasks).
19. No wallet/escrow words and no `KES` in the rendered Home; categories never show wire values.

## Current vs design
No Home on the website; `/app/customer/home` is the #6 `ViewStubComponent` (`stubLabel: 'Home'`). The marketing `app-category-card` (`src/app/shared/category-card`) is a marketing layout and is not reused (K§1).

## Questions
- Answered: **WQ-2** (owner 2026-10-29): activity times (greeting, Recent row times) use the browser's local time; deadlines use EAT and are labelled as EAT (Home shows no deadline).
- Answered: **WQ-29** (was Q7-4; owner 2026-10-29): the Home active-task card follows the built app, with no ETA.
- Carried mobile defaults, kept: Q2 search row opens the wizard; Q3 tile preselects; Q4 button per state; Q8 one card + `+N more in progress`.
