# v-notifications — Notifications

- Mockup: `docs/design/nitume_customer_app.html` lines 529–539 (`#v-notifications`, overlay)
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/notifications_screen.dart` (placeholder text only, not reachable from any navigation)
- Status: missing

## Purpose
In-app feed of task events (runner en route, price change, completion, payment, rating reminders).

## Entry / exit
- Entry: bell on `v-home` and `v-track`; "Notifications" row on `v-profile`.
- Back → previous screen.
- Row tap (implied; no onclick in mockup) → deep link by event type:
  - runner en route / arrived → `v-track`
  - price change requested → `v-price-auth`
  - task completed / evidence uploaded → `v-evidence-confirm` (if AWAITING_CUSTOMER) else `v-task-detail`
  - payment confirmed / failed → `v-task-detail` (or `v-payment` retry)
  - rate your last task → `v-rate`

## Task states
Any (feed).

## Layout (top to bottom)
1. Pushed header (C-10) `Notifications`.
2. Full-bleed list (body padding 0) of notification rows (C-28): white bg, padding 14 20, bottom hairline, gap 12, aligned top.
   - Icon box 34px green-050 r 9 with an event icon.
   - Body: title 13/600 (margin-bottom 2), subtitle 11.5 slate-600.
   - Time right-aligned Fira Code 10.5 slate-400, no wrap.

## Components
C-10, C-28, C-33. All NEW.

## Copy (exact, mockup sample)
| Icon | Title | Subtitle | Time |
|---|---|---|---|
| 📍 | `Brian K. is en route` | `Apartment check — Nyali · ETA 12 min` | `2m` |
| ⚠️ | `Price change requested` | `Approve an extra KSh 5,000 for the item` | `1h` |
| ✅ | `Task completed` | `Buy shoes — Sarit Centre` | `Yesterday` |
| 💳 | `Payment confirmed` | `KSh 1,000 for Sarit Centre task` | `Yesterday` |
| ⭐ | `Rate your last task` | `How was Peter O.?` | `Mon` |

Implied states (recommended):
- Empty: `You're all caught up.`
- Loading: skeleton rows.
- Error: `Couldn't load notifications.` + `Try again`.
- Unread vs read: not drawn. Recommended: unread rows keep white bg with a 7px dot before the time; read rows unchanged (Q2).
- Opening the screen or tapping a row marks as read.

## Numeric fields (Fira Code)
- Relative time (`2m`, `1h`, `Yesterday`, `Mon`).
- Numbers inside subtitles (`ETA 12 min`, `KSh 5,000`) — render the numeric spans in Fira Code (rich text), or the whole subtitle per the `.li-meta` rule (Q3).

## Data
- `GET /api/v1/notifications?limit=` → `{ items, unread }` (exists; not in §3.2 table but present in API). Core model `AppNotification` exists (`eventType`, `title`, `body`, `errandId`, `readAt`, `createdAt`).
- `PATCH /api/v1/notifications/:id/read`, `PATCH /api/v1/notifications/read-all`, `GET /api/v1/notifications/unread-count` (exist).
- Icon + deep link chosen from `eventType` — the list of event types must be shared with the API (needs: api-contract to publish the enum).
- Push: FCM, deep-link into the relevant errand screen (§7.2). Device registration endpoint for FCM tokens (`DEVICES` table) — no endpoint found in `apps/api` (needs: api-contract).

## Accessibility and mobile
- Each row is a button; label = title + subtitle + time.
- Emoji icons → recommended icon set (consistency).

## Questions for owner
- Q1: Should rows be tappable (mockup has no onclick)? Recommended: yes, with the deep links above.
- Q2: Unread styling is not designed.
- Q3: Fira Code for numbers inside sentence subtitles.

## Current vs design
`notifications_screen.dart` shows `Notification feed pending — backend events wire up in next phase.` and is not wired to the bell (`home_tab.dart:72`, `track_tab.dart:61` are TODOs) or the Profile row.
