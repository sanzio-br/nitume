# v-notifications — Notifications

- Mockup: `docs/design/nitume_customer_app.html` lines 529–539 (`#v-notifications`, overlay)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/account/notifications_screen.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
In-app feed of task events (quote ready, runner en route, price change, completion, payment, rating reminders).

## Entry / exit
- Entry: bell on `v-home` and `v-track`; "Notifications" row on `v-profile`.
- Back → previous screen.
- Row tap (Q1 default: tappable) → marks read, then deep link by `eventType`:

| eventType | Target |
|---|---|
| `errand.QUOTED` | `x-awaiting-quote` |
| `errand.RUNNER_ASSIGNED`, `errand.RUNNER_EN_ROUTE`, `errand.ARRIVED`, `errand.IN_PROGRESS` | `v-track` for the errand |
| `errand.AWAITING_CUSTOMER` | `v-evidence-confirm` if still AWAITING_CUSTOMER, else `v-task-detail` |
| `errand.COMPLETED`, `errand.CONFIRMED`, `errand.SETTLED`, `errand.CANCELLED`, `errand.FAILED`, `errand.DISPUTED` | `v-task-detail` |
| price change requested (type missing) | Track + `v-price-auth` modal if still pending |
| payment confirmed / failed (types missing) | `v-task-detail` / `v-payment` |
| rate your last task (type missing) | `v-rate` if not yet rated |
| unknown type | `v-task-detail` when `errandId` is set; otherwise no navigation |

## Task states
Any (feed).

## Layout (top to bottom)
1. Pushed header (C-10) `Notifications`. Trailing text button (C-04) `Mark all read` when there are unread rows (proposed).
2. Full-bleed list of notification rows (C-28): white bg, padding 14 20, bottom hairline, gap 12, top aligned.
   - Icon box 34px green-050 r-s 8 (mockup 9) with an event icon (blue glyph).
   - Body: title 13/600 (unread: 700), margin-bottom 2; subtitle 11.5 slate-600.
   - Right column: time Fira Code 10.5 slate-400, no wrap; unread rows add a 7px **red** dot (OA-13) under the time, right-aligned, margin-top 6.

## Components
C-10, C-28 (unread change), C-04, C-33. Built except the unread styling change.

## Copy (exact, mockup sample; emoji replaced by icons)
| Icon | Title | Subtitle | Time |
|---|---|---|---|
| pin | `Brian K. is en route` | `Apartment check — Nyali · ETA 12 min` | `2m` |
| alert | `Price change requested` | `Approve an extra KSh 5,000 for the item` | `1h` |
| check | `Task completed` | `Buy shoes — Sarit Centre` | `Yesterday` |
| card | `Payment confirmed` | `KSh 1,000 for Sarit Centre task` | `Yesterday` |
| star | `Rate your last task` | `How was Peter O.?` | `Mon` |

Title and body come from the API (`title`, `body`); the app does not compose them.

States (proposed):
- Empty: `You're all caught up.`
- Loading: skeleton rows. Error: `Couldn't load notifications.` + `Try again`.
- Opening the screen does **not** mark everything read; tapping a row or `Mark all read` does.

## Numeric fields (Fira Code)
- Relative time (`2m`, `1h`, `Yesterday`, `Mon`).
- Subtitles stay Fira Sans as one string (Q3 default); numbers inside sentences are not split into spans.

## Data
- `GET /api/v1/notifications?limit=` → `{ items, unread }`; `PATCH /notifications/:id/read`; `PATCH /notifications/read-all`; `GET /notifications/unread-count` (exist). Core `AppNotification`.
- `NotificationEventType` (published on `feat/api-customer-gaps`) has only `errand.*` status types. needs: api-contract — add price change requested, payment confirmed / failed, rating reminder, merchant details added, dispute resolved.
- Push: FCM deep links (§7.2); registration `POST /users/me/devices` exists on `feat/api-customer-gaps`; client package pending row 31. Delivery queue pending row 26 (no UI change).

## Accessibility and mobile
- Each row is a button: "Unread. Brian K. is en route. Apartment check, Nyali, ETA 12 minutes. 2 minutes ago."
- Icons, not emoji (consistent rendering).

## Resolved by owner answers
- Unread styling: red dot allowed (OA-13, was Q2).

## Open questions (non-blocking; build default given)
- Q1: Rows tappable? Default: yes, table above.
- Q3: Fira Code inside sentence subtitles. Default: no (whole subtitle Fira Sans).

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: `Mark all read` sits under the header, not in it (core header trailing slot, need open).
