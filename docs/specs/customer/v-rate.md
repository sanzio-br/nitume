# v-rate — Rate the runner

- Mockup: `docs/design/nitume_customer_app.html` lines 463–480 (`#v-rate`, overlay)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/task/rate_screen.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Collect a 1–5 star rating and an optional comment for the runner after the customer confirms completion.

## Entry / exit
- Entry: after "Confirm completion" on `v-evidence-confirm` (replaces it); notification "Rate your last task"; `v-task-detail` for a COMPLETED task without a rating (`Rate this task` button).
- Back → previous screen; rating stays possible later (skippable, Q2 default).
- "Submit rating" → reset the stack to the shell on `v-home` (mockup `jump('v-home', true)`), snackbar.

## Task states
COMPLETED, CONFIRMED or SETTLED (row 35 answered: CONFIRMED and SETTLED are system-only states the customer sees as `Completed`). Submitting a rating changes **no** errand state (OA-7: COMPLETED is terminal for the customer). One rating per errand.

## Layout (top to bottom)
1. Pushed header (C-10) `Rate this task`.
2. Centred block (padding 10 20):
   1. Avatar 60 (C-12, runner initials), margin `10 auto 14`.
   2. Heading 16/700.
   3. Task title 12.5 slate-600, margin-top 4.
   4. Stars (C-27): 5 × 30px, gap 6, margin `16 0 20`; filled green, empty slate-line.
   5. Comment (C-17 multiline): white, slate-line border, r-s 8 (OA-12; mockup 12), padding 12 14, min height 80, 13.5; green focus.
3. Fixed primary CTA (C-01).

## Components
C-10, C-12, C-27, C-17 (multiline), C-01. All built.

## Copy (exact)
- Header: `Rate this task`
- Heading: `How was Brian K.?` (runner short name, OA-2; no name → `How was your runner?`)
- Subtitle: `Apartment check — Nyali` (task title per `_shared.md` §7)
- Placeholder: `Add a comment (optional)`
- CTA: `Submit rating`

States (proposed):
- No star chosen: CTA disabled.
- Submitting: spinner.
- Already rated (409 or existing rating on load): `You've already rated this task.` then go Home.
- Success snackbar: `Thanks for your rating.`
- Error: snackbar `Couldn't send your rating. Try again.`

## Numeric fields (Fira Code)
- None visible. If a numeric label is added (`4/5`), it uses Fira Code.

## Data
- `POST /api/v1/errands/:errandId/rating` `{ score: 1..5, comment? }` (exists).
- `GET /api/v1/errands/:errandId/rating` to detect an existing rating (exists; access check fix pending row 28, no client change).
- Runner identity: assignment + runner summary on `GET /errands/:id` (`feat/api-customer-gaps`); `displayName` needs: api-contract (OA-2).

## Accessibility and mobile
- Stars as a radio group: "Rating, 4 of 5 stars"; each star 48dp hit area.
- Comment max length per the API DTO; show a Fira Code counter only within 20 characters of the limit.

## Resolved by owner answers
- Rating does not trigger CONFIRMED: OA-7 (was Q1).

## Open questions (non-blocking; build default given)
- Q2: Rating mandatory or skippable? Default: skippable (back arrow), with a "Rate your last task" notification (needs: api-contract — a `rating.reminder` event type, not in `NotificationEventType`).

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: uses the app-local `NameAvatar` glyph fallback (CC-3).
