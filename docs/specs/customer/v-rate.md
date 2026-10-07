# v-rate — Rate the runner

- Mockup: `docs/design/nitume_customer_app.html` lines 463–480 (`#v-rate`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

## Purpose
Collect a 1–5 star rating and optional comment for the runner after the customer confirms completion.

## Entry / exit
- Entry: after "Confirm completion" on `v-evidence-confirm`; notification "Rate your last task".
- Back → previous screen (rating can be done later from the notification or task detail, implied).
- "Submit rating" → reset the stack to `v-home` (mockup `jump('v-home', true)`), success snackbar.

## Task states
COMPLETED or CONFIRMED (after the customer confirms). Rating is allowed once per errand.

## Layout (top to bottom)
1. Pushed header (C-10) `Rate this task`.
2. Centred block (padding 10 20):
   1. Avatar 60 (C-12), margin `10 auto 14`.
   2. Heading 16/700 (h3).
   3. Task title 12.5 slate-600, margin-top 4.
   4. Stars (C-27): 5 × 30px, gap 6, margin `16 0 20`; filled green, empty slate-line.
   5. Comment textarea (C-17 multiline): white, slate-line border, r 12, padding 12 14, min height 80, 13.5.
3. Fixed primary CTA.

## Components
C-10, C-12, C-27, C-17 (multiline), C-01. All NEW except the themed button.

## Copy (exact)
- Header: `Rate this task`
- Heading: `How was Brian K.?` (runner name, Q-NAME)
- Subtitle: `Apartment check — Nyali` (task title, see `v-home.md` Q6)
- Textarea placeholder: `Add a comment (optional)`
- Sample comment: `Thorough and quick — sent great photos.`
- CTA: `Submit rating`

Implied states:
- No star chosen: CTA disabled.
- Submitting: spinner.
- Already rated (409): `You've already rated this task.` and go Home.
- Success snackbar: `Thanks for your rating.`

## Numeric fields (Fira Code)
- None visible (stars are graphical). If a numeric label is added (`4/5`), it uses Fira Code.

## Data
- `POST /api/v1/errands/:errandId/rating` `{ score: 1..5, comment? }` (exists, `ratings.controller.ts`).
- `GET /api/v1/errands/:errandId/rating` to detect an existing rating (exists).
- Runner identity for the heading: see `v-track.md` data (assignment + profile).

## Accessibility and mobile
- Stars as a slider/radio group: "Rating, 4 of 5 stars"; each star 48dp hit area.
- Textarea max length per API DTO; show remaining count only if near the limit.

## Questions for owner
- Q1: Should submitting a rating trigger COMPLETED → CONFIRMED (see `v-evidence-confirm.md` Q1)?
- Q2: Is rating mandatory before leaving, or skippable (back arrow suggests skippable)? Recommended: skippable, with a "Rate your last task" notification.

## Current vs design
Not built.
