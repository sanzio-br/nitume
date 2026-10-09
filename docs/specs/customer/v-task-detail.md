# v-task-detail — Task detail

- Mockup: `docs/design/nitume_customer_app.html` lines 482–506 (`#v-task-detail`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

## Purpose
Read-only record of one task: status, reference and time, runner, evidence, payment breakdown, and a way to report a problem.

## Entry / exit
- Entry: Home "Recent" row; History card; (implied) notification deep links for finished tasks.
- Back → previous screen.
- "Report a problem with this task" → dispute flow (not drawn; implied view `x-report-problem`).
- Evidence thumb → full-screen viewer (implied).

## Task states
Any. The mockup draws a COMPLETED task. For active states, recommended: show a `Track live` primary button that opens `v-track` (Q2).

## Layout (top to bottom)
1. Pushed header (C-10) `Task detail`.
2. Scrollable body:
   1. Summary card (C-07): status chip (C-05), title 16/700 (margin `10 0 4`), meta Fira Code 12 slate-600.
   2. Section label `Runner`; card with C-21 (avatar 36, name 13.5/600, meta Fira Code 11 `Verified · 4.9 · 137 tasks`).
   3. Section label `Evidence`; evidence grid (C-25).
   4. Section label `Payment`; receipt card (C-18, dashed).
   5. Destructive menu row (C-24 danger), margin-top 4.

## Components
C-10, C-07, C-05, C-08, C-21, C-25, C-18, C-24. NEW except C-05/C-07 (app-only).

## Copy (exact)
- Header: `Task detail`
- Chip: `Completed`
- Title: `Apartment check — Nyali`
- Meta: `#NT-10482 · Today, 10:03 AM` (reference format differs from Home `#10482`; `v-home.md` Q7)
- Sections: `Runner`, `Evidence`, `Payment`
- Runner: `Brian K.`, `Verified · 4.9 · 137 tasks`
- Payment: `Service fee` `KSh 700`; `Runner fee` `KSh 1,500`; `Total paid` `KSh 2,200`
- Row: `Report a problem with this task`

Implied states:
- Loading: skeleton cards.
- Error: `Couldn't load this task.` + `Try again`.
- No runner (CANCELLED before assignment, EXPIRED): hide the Runner section.
- No evidence: hide the Evidence section or show `No evidence for this task.`
- Not paid: Payment section shows `Not paid` (info chip) or is hidden.
- DISPUTED: chip danger `Disputed`; the report row becomes `View dispute` (Q3).

## Numeric fields (Fira Code)
- Reference `#NT-10482`, timestamp, rating `4.9`, task count `137`, all amounts.

## Data
- `GET /api/v1/errands/:id` (exists) — needs runner summary/assignment (needs: api-contract).
- `GET /api/v1/runners/:id/profile` (exists; `avgRating`, `errandsCompleted`, `verificationLevel`).
- `GET /api/v1/errands/:errandId/evidence` (exists).
- `GET /api/v1/payments/:errandId` (exists).
- Report a problem: `POST /disputes` (§3.2) — **no disputes controller in `apps/api`** (needs: api-contract). Fallback `PATCH /errands/:id/status {to:'DISPUTED'}` exists but carries no reason/evidence.
- "Verified" label derived from `verificationLevel` ≥ `2_id_verified` (Q4).

## Accessibility and mobile
- Report row: red text is outside the chip rule (Q-RED); keep 48dp height.

## Questions for owner
- Q1: Q-NAME, Q-RED, `v-home.md` Q6/Q7 (title and reference number).
- Q2: Should active tasks open this screen or Track? Recommended: History/Recent rows open this screen for any state; active tasks show a `Track live` button.
- Q3: Dispute flow screens (reason, description, attach photos, status) are not in the mockup. Need design/copy.
- Q4: Which verification level counts as "Verified" for customers?
- Q5 (state machine): Disputes are allowed from IN_PROGRESS and COMPLETED only (§3.3). The row should be hidden or disabled in other states — confirm (e.g. after CONFIRMED/SETTLED, is reporting still possible?).

## Current vs design
Not built. Home recent rows and History cards have `// TODO: Navigate to task detail`.
