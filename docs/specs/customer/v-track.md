# v-track — Live tracking

- Mockup: `docs/design/nitume_customer_app.html` lines 257–284 (`#v-track`, root tab view)
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/track_tab.dart`
- Status: partial

## Purpose
Watch the assigned runner move on a map, see ETA and runner identity, follow the status timeline, and act on runner requests (price change, evidence review).

## Entry / exit
- Entry: tab bar "Track"; "Track live →" on Home; after successful payment (`v-payment`); push notifications (runner assigned / en route / arrived).
- Exits:
  - Bell → push `v-notifications`.
  - "⚠️ Price change" → push `v-price-auth`.
  - "📋 Review evidence" → push `v-evidence-confirm`.
- Which errand: the one passed in, else the most recent active errand. If several are active, a selector is needed (Q2).

## Task states
PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER. Map is meaningful from RUNNER_ASSIGNED onwards. Side states (FAILED, DISPUTED, EXPIRED, CANCELLED) replace the map with a status card (implied).

## Layout (top to bottom)
1. Top bar (C-09): title 21/700, bell on the right.
2. Map (C-31), margin `0 20 14`, height 220, r 16:
   - ETA chip top-left (14,14): white pill, Fira Code 11.5/700, soft shadow.
   - Start pin (blue) = runner start / pickup; end pin (green) = task site; runner dot 16px green with 3px white border, animated between pings; dashed blue route.
   - Mockup placeholder bg `#EAEEF4` and grid are off-palette and mock-only. Real build uses the Google Maps SDK (§5); loading placeholder uses slate.
3. Runner info card (C-21 inside C-07, padding 15, margin `0 20 14`): avatar 36 "BK", name 13.5/600, meta Fira Code 11 slate-600 `Verified · 4.9`, trailing status chip.
4. Action row (margin `0 20 14`, gap 8): two equal outline small buttons (C-03 small: padding 11, r 10, 12/700).
5. Section label (C-08) `Timeline`.
6. Timeline (C-19), margin `0 20`, padding-left 22, item gap 18, text 12.5, time Fira Code 11 slate-600.

## Components
| Element | Component | Status |
|---|---|---|
| Top bar + bell | C-09 + C-11 | NEW |
| Map + ETA chip + markers | C-31 `LiveTrackingMap`, `EtaChip` | NEW |
| Runner card | C-21 + C-05 | NEW / app-only |
| Action buttons | C-03 small | NEW variant |
| Timeline | C-19 | NEW |
| No-active-task empty state | C-33 | NEW |

## Copy (exact)
- Title: `Track task`
- ETA chip: `ETA 12 min`
- Runner: `Brian K.`, `Verified · 4.9`
- Status chip: `En route` (mockup amber; Q-ENROUTE)
- Actions: `⚠️ Price change`, `📋 Review evidence` (emoji in mockup; recommended icons, Q3)
- Section: `Timeline`
- Timeline items (mockup): `Task accepted` 10:03 AM (done); `Runner en route` 10:12 AM (done); `Arrival at location` `Expected 10:28 AM` (pending); `Evidence upload` `Pending` (pending)

Implied states (recommended):
- No active task: muted `No task in progress.` + primary `Start a new task` → `v-new-category`.
- Waiting for runner (PAYMENT_CONFIRMED): map hidden or centred on task site; chip `Finding a runner`; timeline shows `Payment confirmed`.
- Arrived: ETA chip `Arrived`.
- Socket disconnected: small muted line under the map `Reconnecting…` (map keeps last position).
- Price-change button visible only while a request is pending; Review-evidence button only when AWAITING_CUSTOMER (or evidence exists) — the mockup shows both always (Q4).
- FAILED / EXPIRED / CANCELLED / DISPUTED: chip danger/pending + explanation card instead of the map.

## Numeric fields (Fira Code)
- ETA (`ETA 12 min`), rating (`4.9`) in runner meta, all timeline times (`10:03 AM`, `Expected 10:28 AM`).

## Data
- Errand: `GET /api/v1/errands/:id` (exists, but returns no assignment/runner) → needs runner summary on the errand or `GET /errands/:id/assignment` (needs: api-contract).
- Runner identity: `GET /runners/:id/profile` (exists; returns `verificationLevel`, `avgRating`, `errandsCompleted` — no name, Q-NAME).
- Timeline: `GET /api/v1/errands/:id/history` (exists; append-only `errand_status_history`).
- Initial tracking snapshot: `GET /api/v1/errands/:id/tracking` (§3.2) — **missing in API** (needs: api-contract).
- Live: Socket.IO room `errand:{errandId}`; event `location:update` `{lat, lng, eta}` (§4.2) — **no Socket.IO gateway exists in `apps/api`** (needs: api-contract). Status-change and evidence-uploaded events (§4.4) — names undefined.
- Pending price change: see `v-price-auth.md` (GET missing).
- Maps: Google Maps SDK (`google_maps_flutter`), animate the marker only (§5).

## Accessibility and mobile
- Map is decorative for screen readers; ETA and status must also be available as text (they are, in chip and card).
- Pause socket/map updates when the tab is not visible to save battery.

## Questions for owner
- Q1: Timeline items mix states and events: "Task accepted" (ACCEPTED by customer? or runner accepting the job?), "Evidence upload" is not a state. Recommended: list `errand_status_history` rows using the §6 labels, plus evidence events interleaved, and show the next expected state as pending.
- Q2: Multiple active errands — selector at the top of Track, or one Track view per errand pushed from Home/History?
- Q3: Emoji in buttons vs icons.
- Q4: Show the two action buttons only when relevant (recommended) or always (mockup)?
- Q5: Is chat (`chat/` module, `CHAT_MESSAGES` in ERD, "in-task messaging" in §3.1) or a Call runner action expected on this screen? Not in the mockup.

## Current vs design
See gap report. Summary: static mock (no errand, no socket, no map SDK); map uses off-palette `Color(0xFFEAEEF4)`, `Color(0xFF0B2545)` literal and black shadows, plus a missing asset `assets/map_placeholder.png`; numeric text uses an unregistered `'FiraCode'` family; chip styles inline; timeline and bell are private copy-pasted widgets; action buttons do nothing.
