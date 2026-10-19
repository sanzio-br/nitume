# v-notifications — Notifications

- Mockup: `docs/design/nitume_customer_app.html` lines 529–539 (`#v-notifications`, overlay)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/account/notifications_screen.dart` on branch `feat/customer-owner-answers`
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
| `errand.RUNNER_ASSIGNED` (no longer sent, row 184; old feed items still route here), `errand.RUNNER_EN_ROUTE`, `errand.ARRIVED`, `errand.IN_PROGRESS` | `v-track` for the errand |
| `errand.AWAITING_CUSTOMER` | `v-evidence-confirm` if still AWAITING_CUSTOMER, else `v-task-detail` |
| `errand.COMPLETED`, `errand.CONFIRMED`, `errand.SETTLED`, `errand.CANCELLED`, `errand.FAILED`, `errand.DISPUTED` | `v-task-detail` |
| `errand.EXPIRED` (new, owner 2026-10-16; needs api-contract) | `v-task-detail` (which shows `Start a new task`) |
| `service_area.outside` (row 236; built on the api branch through the notifications queue, once per task). **Owner copy (row 241, decided 2026-10-19)**: title `We can't take this task`, message `Its location is outside the areas we serve. You can cancel it; you haven't paid anything.` | `x-awaiting-quote` |
| price change requested (type missing) | Track + `v-price-auth` modal if still pending |
| payment confirmed / failed (types missing) | `v-task-detail` / `v-payment` |
| item payment confirmed / failed, `send_to_runner` (types missing, row 42) | `x-merchant-payment` |
| merchant details added (type missing, row 43) | `x-awaiting-quote` while QUOTED/ACCEPTED, else `x-merchant-payment` |
| `merchant_details.changed` (row 80) | `x-merchant-payment` |
| new quote issued after a request or expiry (`quote.reissued`, rows 68, 72; already routed in `navigation/nav.dart:155`) | `x-awaiting-quote` |
| quote expired (type missing, row 46; optional) | `x-awaiting-quote` |
| refund status changed (type missing, rows 54, 62) | `v-task-detail` |
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

**EXPIRED notification** (owner decision 2026-10-16; BOARD Needs row "api-contract (round 7) | design-auditor"). Today the API sends nothing when a task expires (`NotificationEventType` has no `errand.EXPIRED`; `statusCopy` returns null for EXPIRED). New feed item + push to the errand's customer on every RUNNER_ASSIGNED → EXPIRED transition, whichever path caused it: the customer deadline passed with no runner accepted (row 185), matching exhausted (row 167), or the audited admin action (row 187). Same title and body for all three; no new copy. A decline or an offer lapse alone sends nothing because the task does not change state:
- `eventType`: `errand.EXPIRED` (enum `NotificationEventType.ERRAND_EXPIRED`).
- Title, exactly `No runner available` (row 188, decided 2026-10-16: "exact titles, no status suffix"; the `{title} · {status}` builder does not apply; built on `main`, `statusCopy` `exactTitle`).
- Body, owner wording word for word (row 158, 2026-10-16), for every expired task, paid or not: `Your task has expired because no runner was available to accept it within the required time. You can submit a new request if you still need this service.`
- No refund sentence. The owner allows one only when the refund flow has already determined that a refund is due; at the moment of expiry the paid task only has a `pending_review` refund review (row 102, `expired_after_payment`), which is not that determination. The round-8 body with `We're reviewing a refund and will let you know the outcome.` is withdrawn. The review's outcome arrives later as `refund.approved` / `refund.no_refund` / `refund.refunded`; Task detail shows the review (`v-task-detail.md`).
- Never `refund` as a promise (`you will be refunded`, `your money is on its way`, `automatic refund`).
- Feed row as every item: `{ id, eventType: 'errand.EXPIRED', title, body, errandId, createdAt, readAt }`; push data `{ eventType: 'errand.EXPIRED', errandId }`. The internal job carries `{ kind: 'errand_status', errandId, status: 'EXPIRED' }`; the body no longer depends on whether a refund review was opened, so `refundReviewOpened` is not needed for the copy.
- Icon: info/clock glyph (no amber/red fill; Expired is an info-tone state, `_shared.md` §6). Deep link above.

**Runner assigned / accepted (rows 176, 182, 184, decided 2026-10-16)**. In the offer model RUNNER_ASSIGNED means a runner was offered the task; the built API sends `Runner assigned` / `A runner has been assigned to your task.` on it (`apps/api/src/notifications/notifications.service.ts` `statusCopy`, `case ErrandStatus.RUNNER_ASSIGNED`; on `main` and on `feat/api-owner-answers-9`), which must change (api-contract):
- When an offer is made (PAYMENT_CONFIRMED → RUNNER_ASSIGNED), and on re-offers, declines and lapses: **no** customer notification (row 184). The customer sees `Finding a runner`.
- On acceptance, RUNNER_ASSIGNED → RUNNER_EN_ROUTE: `eventType` `errand.RUNNER_EN_ROUTE` (unchanged), title exactly `Runner assigned` (no `· {status}` suffix, row 188), body `A runner accepted your task and is on the way.` (rows 182, 184; replaces `Runner en route` / `Your runner is on the way to complete the task.`). Push channel as System Design §4.4 (push + WhatsApp).
- The app renders `title` / `body` as returned; no client change. Old `errand.RUNNER_ASSIGNED` feed items keep routing to `v-track`.

States (proposed):
- Empty: `You're all caught up.`
- Loading: skeleton rows. Error: `Couldn't load notifications.` + `Try again`.
- Opening the screen does **not** mark everything read; tapping a row or `Mark all read` does.

## Numeric fields (Fira Code)
- Relative time (`2m`, `1h`, `Yesterday`, `Mon`).
- Subtitles stay Fira Sans as one string (Q3 default); numbers inside sentences are not split into spans.

## Data
- `GET /api/v1/notifications?limit=` → `{ items, unread }`; `PATCH /notifications/:id/read`; `PATCH /notifications/read-all`; `GET /notifications/unread-count` (exist). Core `AppNotification`.
- **Money in notification text (row 82)**: `KSh`, formatted like the app (`KSh 40,000`, `KSh 1,250.50`; no `.00` on whole amounts). The bodies come from the API: needs: api-contract — `notifications.service.ts` writes `KES ${amount}` with raw decimals (`:331`, `:340-341`, `:360`, `:372`); change to the `KSh` format. The client renders the body as returned and never rewrites it.
- Details-changed warning (row 80): the new `merchant_details.changed` type deep-links to `x-merchant-payment`.
- `NotificationEventType` has only `errand.*` status types (CONFIRMED/SETTLED removed; EXPIRED missing). needs: api-contract — add `errand.EXPIRED` (above), and price change requested, payment confirmed / failed, item payment confirmed / failed, merchant details added, refund status changed, dispute resolved, rating reminder (and optionally quote expired).
- Push (row 31): FCM through `firebase_messaging`; the same deep-link table applies to push taps, cold start included. Registration `POST /users/me/devices` exists. Delivery through BullMQ (row 26, no UI change).

## Accessibility and mobile
- Each row is a button: "Unread. Brian K. is en route. Apartment check, Nyali, ETA 12 minutes. 2 minutes ago."
- Icons, not emoji (consistent rendering).

## Resolved by owner answers
- Unread styling: red dot allowed (OA-13, was Q2).
- `errand.EXPIRED` body (row 158, 2026-10-16): owner wording, no refund sentence. The screen renders the API's `title` / `body`, so this is an API change only; the built screen stays `matches-design`.
- Rows 176, 182, 184 (2026-10-16): `Runner assigned` only on acceptance, nothing when an offer is made; API-only, the built screen stays `matches-design`.
- Row 188 (2026-10-16): exact titles `No runner available` and `Runner assigned`, no status suffix (built on `main`); row 185: the deadline path sends the same `errand.EXPIRED` item. Row 201 (2026-10-19): the admin `Expire task` on a paid task past its deadline (PAYMENT_CONFIRMED → EXPIRED) sends the same item too (decided, owner 2026-10-19, row 226). API-only; the built screen stays `matches-design`.

## Open questions (non-blocking; build default given)
- Q1: Rows tappable? Default: yes, table above.
- Q3: Fira Code inside sentence subtitles. Default: no (whole subtitle Fira Sans).

## Current vs design
Re-audit 2026-10-09, customer round 4, `feat/customer-owner-answers` @ `c420265` (docs/audits/customer-gap-report.md, "Re-audit 2026-10-09: customer round 4"): PASS. `Mark all read` in the header (core trailing slot; earlier minor closed); `merchant_details.changed` → `x-merchant-payment`; `quote.requested` is admin-only and ignored. Minor: no test for the `merchant_details.changed` deep link.

Spec update 2026-10-09 (rows 68, 72, 80, 82): one new deep-link row (`merchant_details.changed`; `quote.reissued` is already routed); `KSh` in bodies is an API change. Unknown types already fall back to Task detail, so the new row is a small routing addition (minor, flutter-customer). Status unchanged.

Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Shared deep-link table for rows and push taps (`Nav.openNotification`), new event types routed; types the API does not send yet fall back to Task detail.

Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: `Mark all read` sits under the header, not in it (core header trailing slot, need open).
