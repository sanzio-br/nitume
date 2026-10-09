# v-track — Live tracking

- Mockup: `docs/design/nitume_customer_app.html` lines 257–284 (`#v-track`, root tab view)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/track_tab.dart`
- Status: partial

## Purpose
Watch the assigned runner on a map, see ETA and runner identity, follow the status timeline, and act on what the task needs (price change, item payment, evidence review).

## Entry / exit
- Entry: tab bar "Track"; "Track live →" on Home; after a successful payment (`v-payment`, OA-21); push notifications (runner assigned / en route / arrived); `v-task-detail` "Track live".
- Exits:
  - Bell → push `v-notifications`.
  - "Price change" → open the `v-price-auth` modal.
  - "Review evidence" → push `v-evidence-confirm`.
  - Item-payment notice → push `x-merchant-payment`.
- Which errand: the one passed in, else the most recent errand in the Track set below. With more than one, a chip row selects it (see Layout 2).
- **No chat or call action** (OA-18: in-task chat out of MVP).

## Task states
PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER. FAILED, DISPUTED, EXPIRED and CANCELLED replace the map with a status card while the errand is still the selected one (for example right after it changes).

## Layout (top to bottom)
1. Top bar (C-09): title 21/700, bell (C-11, red unread dot per OA-13) on the right.
2. Only when the customer has 2+ errands in the Track set: horizontal chip row (C-16), padding `0 20 12`, one chip per errand labelled with its title (§7 rule), selected = blue fill.
3. Map (C-31), margin `0 20 14`, height 220, r 16:
   - ETA chip top-left (14,14): white pill, 1px slate-line border, no shadow (OA-14), Fira Code 11.5/700.
   - Start pin (blue) = runner start / pickup; end pin (green) = task site / drop-off; runner dot 16px green with 3px white ring, animated between pings; dashed blue route.
   - Loading / no SDK placeholder: blue-050 `#E9EDF3` fill (replaces mockup `#EAEEF4`, OA-14); no grid, no image asset.
   - Runner position is shown only when the tracking snapshot or `location:update` provides one (privacy window pending row 27). Without a position, show only the task pin and the caption below.
4. Runner info card (C-21 inside C-07, padding 15, margin `0 20 14`): avatar 36 (initials from the runner's `displayName`), name 13.5/600 (`Brian K.`, OA-2), meta Fira Code 11 slate-600 `Verified · 4.9`, trailing status chip (C-05 per `_shared.md` §6: En route = amber).
5. Item-payment notice (C-40 with a trailing C-03 small button), margin `0 20 14`. Only when the route is `merchant_direct` / `customer_to_runner` and an item amount is due.
6. Action row (margin `0 20 14`, gap 8): equal-width small outline buttons (C-03 small, pill). Each button is shown only when relevant; with one button it takes the full width; with none the row is hidden:
   - "Price change": while a price-change request is pending.
   - "Review evidence": in AWAITING_CUSTOMER.
7. Section label (C-08) `Timeline`.
8. Timeline (C-19), margin `0 20`, padding-left 22, item gap 18, title 12.5 blue, time Fira Code 11 slate-600. Done dot green, pending dot slate-400.

## Components
| Element | Component | Status |
|---|---|---|
| Top bar + bell | C-09 + C-11 | built (unread dot → red) |
| Errand selector | C-16 | built |
| Map + ETA chip + markers | C-31 | built (SDK pending row 30) |
| Runner card | C-21 + C-05 | built (En route tone change) |
| Item-payment notice | C-40 + C-03 small | **NEW** (C-40) |
| Action buttons | C-03 small | built |
| Timeline | C-19 | built |
| Empty / status card | C-33 / C-07 | built |

## Copy (exact where from the mockup)
- Title: `Track task`
- ETA chip: `ETA 12 min`
- Runner: `Brian K.`, `Verified · 4.9`
- Status chip: `En route` (amber, OA-13)
- Actions: `Price change`, `Review evidence` (mockup text without the emoji; leading icons instead, Q3)
- Section: `Timeline`
- Timeline sample (mockup): `Task accepted` 10:03 AM (done); `Runner en route` 10:12 AM (done); `Arrival at location` `Expected 10:28 AM` (pending); `Evidence upload` `Pending` (pending)

States (proposed):
- No errand in the Track set: C-33 `No task in progress.` + primary `Start a new task` → `v-new-category`.
- PAYMENT_CONFIRMED: map shows the task pin only; chip `Finding a runner`; ETA chip hidden; runner card replaced by a C-07 card with 13 slate-600 `We're finding a runner for your task.`
- No runner position yet: caption under the map 12 slate-600 `Live location appears when your runner is on the way.`
- ARRIVED: ETA chip `Arrived`.
- Socket disconnected: 12 slate-600 line under the map `Reconnecting…` (map keeps the last position).
- Item-payment notice: `Pay the item amount: KSh 40,000` (amount in Fira Code) + button `View details`.
- FAILED / EXPIRED / CANCELLED / DISPUTED: chip per §6 + C-07 card with 13 slate-600 text (`This task was cancelled.`, `This task couldn't be completed.`, `No runner was available in time.`, `We're reviewing your report.`) and outline `View task` → `v-task-detail`.
- Load error: C-33 `Couldn't load your task.` + `Try again`.

## Numeric fields (Fira Code)
- ETA (`ETA 12 min`), rating (`4.9`) in the runner meta, every timeline time (`10:03 AM`, `Expected 10:28 AM`), amount in the item-payment notice.

## Data
- Errands for the selector: `GET /api/v1/errands?status=PAYMENT_CONFIRMED,RUNNER_ASSIGNED,RUNNER_EN_ROUTE,ARRIVED,IN_PROGRESS,AWAITING_CUSTOMER` (multi-status filter on `feat/api-customer-gaps`).
- Errand + runner: `GET /api/v1/errands/:id` (assignment + runner summary embedded on `feat/api-customer-gaps`); runner `displayName` needs: api-contract (A-15, OA-2).
- Timeline: `GET /api/v1/errands/:id/history` (exists) using §6 labels, interleaved with evidence events from `GET /errands/:errandId/evidence`; the next expected state is shown as pending (Q1 default).
- Snapshot: `GET /api/v1/errands/:id/tracking` (exists on `feat/api-customer-gaps`).
- Live (room `errand:{id}`): `location:update` `{ lat, lng, eta }` (§4.2); status change, evidence uploaded, price-change requested (event names pending row 23, use `RealtimeEvents`). Socket client pending row 29; until then poll `GET /errands/:id/tracking` every 10 s and `GET /errands/:id` every 15 s while the tab is visible.
- Pending price change: `GET /api/v1/errands/:errandId/price-change?status=requested` (exists on `feat/api-customer-gaps`).
- Item amount due: see `x-merchant-payment.md` Data (needs: api-contract).
- Maps: Google Maps SDK, animate the marker only (§5); pending row 30.

## Accessibility and mobile
- The map is decorative for screen readers; ETA and status are also text (chip and card).
- Pause socket and map updates when the tab is not visible.
- Action buttons ≥ 48dp tall.

## Resolved by owner answers
- In-task chat: out of MVP (OA-18, was Q5).
- En route chip amber: OA-13 (was Q-ENROUTE).
- Off-palette map colours and shadows: OA-14.

## Open questions (non-blocking; build default given)
- Q1: Timeline mixes states and events ("Task accepted", "Evidence upload"). Default: status history rows with §6 labels plus evidence events, next expected state as pending.
- Q2: Multiple active errands. Default: chip selector above the map.
- Q3: Emoji in buttons vs icons. Default: icons.
- Q4: Show the action buttons only when relevant (default) or always (mockup).
- Pending row 27 (location privacy window) and row 30 (maps package).

## Current vs design
See gap report. Summary: static mock (no errand, socket or map SDK); off-palette `Color(0xFFEAEEF4)`, a raw `Color(0xFF0B2545)` and black shadows; missing asset `assets/map_placeholder.png`; unregistered `'FiraCode'`; inline chips; private copy-pasted timeline and bell; action buttons inert.
