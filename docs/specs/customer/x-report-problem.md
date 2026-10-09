# x-report-problem — Report a problem (dispute)

- Mockup: **not drawn.** Referenced by the `v-task-detail` row "Report a problem with this task" and §3.2 `POST /disputes`. Built from design-system form patterns (card, field, primary button, chips) and mockup components (`.ov-header`, `.form-card`, `.cta-fixed`); copy is **(proposed)**.
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/task/report_problem_screen.dart` (write + read) on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Let the customer tell Nitume what went wrong with a task (opens a dispute, errand → DISPUTED), and later see the report and its status.

## Entry / exit
- Write mode entry: `v-task-detail` row (IN_PROGRESS, AWAITING_CUSTOMER, COMPLETED); `v-evidence-confirm` link `Report a problem` (AWAITING_CUSTOMER, OA-9).
- Read mode entry: `v-task-detail` `View your report` (DISPUTED or any state after a dispute existed); notification "Dispute resolved".
- Write success → pop to the previous screen, which reloads (chip `Disputed`); snackbar `Report sent. We'll be in touch.`
- Back (write mode, text entered) → C-35 discard confirm.

## Task states
Write: IN_PROGRESS → DISPUTED, AWAITING_CUSTOMER → DISPUTED (OA-9), COMPLETED → DISPUTED (§3.3). Read: DISPUTED and whatever state follows resolution (target state pending row 36; the screen does not assume one).

## Layout — write mode
1. Pushed header (C-10) `Report a problem`.
2. Scrollable body:
   1. Task line card (C-07, padding 14 15, margin `0 20 14`): title 13.5/600 + meta Fira Code 11 slate-600 (`#NT-10482 · Today, 10:03 AM`).
   2. Form card (C-17 `NitumeFormCard`): heading `What went wrong?`; multiline field (5 rows, max 500 chars); under the field, right-aligned Fira Code 11 slate-600 counter `0/500`; red inline error when invalid.
   3. Notice (C-40), margin `0 20 14`.
3. Fixed primary CTA (C-01).

## Layout — read mode
1. Pushed header (C-10) `Your report`.
2. Summary card (C-07): chip (C-05) for the dispute status (below), task title 15.5/600, meta Fira Code 12 slate-600 `Reported Today, 10:41 AM`.
3. Section label `What you told us`; card (C-07) with the reason text 13.5 blue.
4. When resolved: section label `Outcome`; card with the resolution text 13.5 blue and meta Fira Code 11 `Resolved Mon, 2:15 PM`.

Dispute status → chip:

| API `DisputeStatus` | Label | Tone |
|---|---|---|
| `open` | Report received | pending |
| `under_review` | Under review | pending |
| `resolved` | Resolved | success |
| `rejected` | Closed | info |

## Components
C-10, C-07, C-17 (multiline + counter), C-40, C-05, C-08, C-35, C-01. NEW: C-35, C-40.

## Copy (proposed)
- Headers: `Report a problem`, `Your report`
- Form heading: `What went wrong?`
- Placeholder: `Tell us what happened, e.g. the wrong item was delivered.`
- Notice: `Our team will review your report and contact you. Your runner is told the task is under review.`
- CTA: `Send report`
- Validation: under 5 characters `Tell us a bit more (at least 5 characters).`
- Errors: 409 already reported `You've already reported this task.` + button `View your report`; 409/400 state not allowed `This task can't be reported right now.`; other `Couldn't send your report. Try again.`
- Discard dialog: title `Discard your report?`, buttons `Discard` (outline, red text) / `Keep writing` (C-01).
- Read-mode labels: `What you told us`, `Outcome`, `Reported …`, `Resolved …`
- Read-mode load error: C-33 `Couldn't load your report.` + `Try again`; no dispute found for the errand: C-33 empty `No report for this task.` (builder copy, accepted in the 2026-10-07 re-audit)

## Numeric fields (Fira Code)
- Reference, timestamps, character counter.

## Data
- Write: `POST /api/v1/disputes` `{ errandId, reason }` (exists on `feat/api-customer-gaps`; `reason` 5–500 chars; one dispute per errand, 409 on duplicate). The errand moves to DISPUTED server-side.
- Read: `GET /api/v1/disputes/:id` (exists on `feat/api-customer-gaps`). needs: api-contract — a way to find the dispute from the errand (dispute id on `GET /errands/:id`, or `GET /disputes?errandId=`).
- Photo attachments: not supported by `OpenDisputeDto` (Q1).
- Push "Dispute opened/resolved" (§4.4): needs: api-contract — event types not in `NotificationEventType` (only `errand.DISPUTED`).

## Accessibility and mobile
- Counter announced only near the limit. CTA above the keyboard.

## Open questions for the owner
- Q1: Should customers attach photos to a report? Not supported by the API today. Default: text only.
- Pending row 36: which state a resolved dispute returns to; the screen just shows the dispute status and the errand chip the API returns.
- Pending row 37: refund wording for customer-favourable outcomes; none shown until decided.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Builder copy accepted: read-mode `Couldn't load your report.` and `No report for this task.` (see Copy).
