# v-evidence-confirm — Review evidence and confirm completion

- Mockup: `docs/design/nitume_customer_app.html` lines 443–461 (`#v-evidence-confirm`, overlay)
- Shared conventions: `_shared.md` (OA-n §0, fees §8)
- Implementation: none
- Status: missing

## Purpose
The runner has finished and uploaded evidence. The customer reviews photos/video, the runner's notes and the payment summary, then confirms completion, or reports a problem.

## Entry / exit
- Entry: "Review evidence" on `v-track`; push "Task completed" / evidence uploaded; notification row; `v-task-detail` while AWAITING_CUSTOMER.
- Back → previous screen.
- "Confirm completion" success → replace this screen with `v-rate`.
- "Report a problem" → push `x-report-problem` (AWAITING_CUSTOMER → DISPUTED, approved by OA-9).
- Thumbnail → push `x-evidence-viewer` at that index.

## Task states
AWAITING_CUSTOMER. Confirm fires **AWAITING_CUSTOMER → COMPLETED only** (OA-7). COMPLETED is terminal for the customer; the screen never fires CONFIRMED or SETTLED (pending row 35 decides whether those remain as system-only states). If opened in any other state: COMPLETED or later → replace with `v-task-detail`; earlier states → CTA hidden, evidence still viewable.

## Layout (top to bottom)
1. Pushed header (C-10) `Review evidence`.
2. Scrollable body:
   1. Section label `Photos & video (4)`, top padding 0.
   2. Evidence grid (C-25): 3 columns, gap 8, square thumbs r-s 8 (mockup 10), padding `0 20 14`. Video thumbs show a play glyph.
   3. Section label `Runner notes` + card (C-07) with the note text 13.5 blue, in quotes. Hidden when `runnerNotes` is empty.
   4. Section label `Payment summary`.
   5. Receipt card (C-18, **dashed** slate-line border, r-m 14, padding 16): `Service fee`, `Runner fee`, total `Total paid`. When there is an item amount: separate group under a hairline (§8), `Item amount` + 12 slate-600 route line (`Paid to the merchant directly` / `Sent to your runner`).
   6. Text link (C-04), red (destructive, OA-13), centred, margin `4 20 16`: `Report a problem`.
3. Fixed primary CTA (C-01).

## Components
| Element | Component | Status |
|---|---|---|
| Evidence grid | C-25 `EvidenceGrid` | built (URLs pending row 25) |
| Notes card | C-07 | built |
| Receipt (dashed + separate group) | C-18 | built (separate group change) |
| Report link | C-04 | built |
| CTA | C-01 | built |

## Copy
- Header (mockup): `Review evidence`
- Section (mockup): `Photos & video (4)` (count is dynamic)
- Section: `Runner notes` (replaces the mockup's task-specific `Caretaker notes`; the field is `runner_notes`, OA-16)
- Note sample (mockup): `"Water leak in the kitchen has been reported to the landlord; repair scheduled for next week."`
- Section (mockup): `Payment summary`
- Rows: `Service fee` `KSh 700`; `Runner fee` `KSh 1,500`; total `Total paid` `KSh 2,200` (mockup sample); `Item amount` (proposed, OA-4)
- CTA: **`Confirm completion`** (OA-6). The mockup's `Confirm completion & release payment` must not ship.
- Link (proposed): `Report a problem`

States (proposed):
- Loading evidence: skeleton thumbs (C-33).
- No evidence yet: 13 slate-600 `The runner hasn't uploaded evidence yet.`; CTA disabled.
- Thumbnail load failure: slate tile with a broken-image icon; tap retries.
- Confirming: CTA spinner. Error: snackbar `Couldn't confirm. Try again.` 409 (state changed): reload and route per Task states.
- Banned: "release", "escrow", "hold", "wallet", "balance" (OA-6).

## Numeric fields (Fira Code)
- Evidence count `(4)`, all receipt amounts.

## Data
- Evidence: `GET /api/v1/errands/:errandId/evidence` (exists). Viewable URLs pending row 25 (signed links); A-12 partial on `feat/api-customer-gaps`.
- Notes: needs: api-contract — `runner_notes` on the errand (OA-16), returned on `GET /errands/:id`.
- Payment summary: `GET /api/v1/payments/:errandId` (exists; `serviceFee`, `runnerFee`, `merchantAmount`, `paymentFlow`). Fee-line mapping TODO pending row 34.
- Confirm: `PATCH /api/v1/errands/:id/status { to: 'COMPLETED' }` (exists).
- Live: evidence-uploaded on `errand:{id}` refreshes the grid (name pending row 23).

## Accessibility and mobile
- Thumbnail alt text from type + time (`Photo, 10:41 AM`).
- Report link ≥ 48dp hit area.

## Resolved by owner answers
- CTA wording and no escrow: OA-6 (was Q-RELEASE).
- Which transition: AWAITING_CUSTOMER → COMPLETED only (OA-7, was Q1).
- Runner notes field: `runner_notes` (OA-16, was Q2).
- Report a problem here: offered, since AWAITING_CUSTOMER → DISPUTED is approved (OA-9, was Q3).
- Full-screen viewer: `x-evidence-viewer` (was Q4).
- Merchant amount in the summary: separate line (OA-4, was Q5).

## Current vs design
Not built. `track_tab.dart:283` has a "📋 Review evidence" button with a TODO.
