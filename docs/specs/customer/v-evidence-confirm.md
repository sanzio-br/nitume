# v-evidence-confirm — Review evidence and confirm completion

- Mockup: `docs/design/nitume_customer_app.html` lines 443–461 (`#v-evidence-confirm`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

## Purpose
The runner has finished and uploaded evidence. The customer reviews photos/video, notes and the payment summary, then confirms completion.

## Entry / exit
- Entry: "📋 Review evidence" on `v-track`; push "Task completed" / evidence uploaded; notification row.
- Back → previous screen.
- "Confirm completion…" → push `v-rate`.
- Problem with the evidence → "Report a problem" (not drawn here; exists on `v-task-detail`, Q3).

## Task states
AWAITING_CUSTOMER (runner moved IN_PROGRESS → AWAITING_CUSTOMER). Customer actions per §3.3: AWAITING_CUSTOMER → COMPLETED, then COMPLETED → CONFIRMED (both customer-actor in the API). Which transition(s) this button fires is ambiguous (Q1).

## Layout (top to bottom)
1. Pushed header (C-10) `Review evidence`.
2. Scrollable body:
   1. Section label `Photos & video (4)` (top padding 0).
   2. Evidence grid (C-25): 3 columns, gap 8, square thumbs r 10, padding `0 20 14`. Tap opens full-screen viewer (implied, Q4).
   3. Section label `Caretaker notes`.
   4. Card (C-07) with the quoted note text, 13.5 body.
   5. Section label `Payment summary`.
   6. Receipt card (C-18): white, **dashed** slate-line border, r 14, padding 16; rows + total.
3. Fixed primary CTA (C-01).

## Components
| Element | Component | Status |
|---|---|---|
| Evidence grid + viewer | C-25 + NEW `EvidenceViewer` (photo zoom, video player) | NEW |
| Notes card | C-07 | app-only |
| Receipt | C-18 (dashed variant) | NEW |
| CTA | C-01 | core |

## Copy (exact)
- Header: `Review evidence`
- Section: `Photos & video (4)` (count is dynamic)
- Section: `Caretaker notes` (task-specific label; see Q2)
- Note sample: `"Water leak in the kitchen has been reported to the landlord; repair scheduled for next week."`
- Section: `Payment summary`
- Rows: `Service fee` `KSh 700`; `Runner fee` `KSh 1,500`; total `Total paid` `KSh 2,200`
- CTA: `Confirm completion & release payment` — contains escrow-style wording (Q-RELEASE). Recommended copy pending owner: `Confirm completion`.

Implied states (recommended):
- Loading evidence: grey thumbs (C-33 skeleton).
- No evidence yet: `The runner hasn't uploaded evidence yet.` and CTA disabled.
- Thumbnail load failure: slate tile with a broken-image icon and `Retry`.
- Confirm in flight / error: spinner; `Couldn't confirm. Try again.`

## Numeric fields (Fira Code)
- Evidence count `(4)` (counter), all receipt amounts.

## Data
- Evidence: `GET /api/v1/errands/:errandId/evidence` (exists; returns `type`, `url` nullable, `s3Key`, `capturedAt`, location). §3.2 names `POST /evidence/:errandId/upload-url` + `confirm` (signed URL flow, runner side); the API instead accepts base64 uploads at `POST /errands/:errandId/evidence`. Customer viewing needs a resolvable URL (signed GET) for each item — confirm `url` is populated and time-limited (needs: api-contract).
- Notes: no notes/report field on evidence or errand in the ERD (evidence types: photo, video, receipt, document, signature). Q2.
- Payment summary: `GET /api/v1/payments/:errandId` (exists; `serviceFee`, `runnerFee`, `merchantAmount`, status).
- Confirm: `PATCH /api/v1/errands/:id/status` `{ to: 'COMPLETED' }` and/or `{ to: 'CONFIRMED' }` (exists).
- Socket: evidence-uploaded event on `errand:{id}` (§4.4 "live timeline update", name undefined).

## Accessibility and mobile
- Thumbnails need alt text from evidence type + time (`Photo, 10:41 AM`).
- Video thumbnails show a play glyph.

## Questions for owner
- Q-RELEASE (payments / no escrow): "release payment" implies Nitume holds funds until confirmation, which conflicts with the no-escrow rule. The API also refers to "escrow legs" in comments (`errands.controller.ts`, state machine). What does confirming actually trigger for the runner payout (B2C batch eligibility)? Recommended copy: `Confirm completion`, with a muted line `Brian K. is paid after you confirm.` if accurate.
- Q1 (state machine): One button, two customer transitions (AWAITING_CUSTOMER → COMPLETED → CONFIRMED). Recommended: this button moves to COMPLETED; CONFIRMED happens on rating submit or automatically after a dispute window. Needs owner decision.
- Q2 (schema): Runner notes ("Caretaker notes") have no field in the ERD. Add a runner report/notes field, or reuse `evidence` type `document`?
- Q3: Should "Report a problem" (dispute) also be offered here, before confirming? (AWAITING_CUSTOMER → DISPUTED is allowed in the API but **not** in §3.3, which only allows IN_PROGRESS → DISPUTED and COMPLETED → DISPUTED.)
- Q4: Full-screen evidence viewer is not drawn — confirm it is expected.
- Q5 (payments): Payment summary shows Service fee 700 + Runner fee 1,500, which differs from the quote breakdown on `v-new-review` (see Q2 there). Should the merchant amount appear here as a separate, clearly-labelled line (three flows separate)?

## Current vs design
Not built. `track_tab.dart:283` has a "📋 Review evidence" button with a TODO.
