# v-evidence-confirm — Review evidence and confirm completion

- Mockup: `docs/design/nitume_customer_app.html` lines 443–461 (`#v-evidence-confirm`, overlay)
- Shared conventions: `_shared.md` (OA-n §0, fees §8)
- Implementation: `apps/customer_app/lib/src/screens/task/evidence_confirm_screen.dart` on branch `feat/customer-integrations`
- Status: matches-design

## Purpose
The runner has finished and uploaded evidence. The customer reviews photos/video, the runner's notes and the payment summary, then confirms completion, or reports a problem.

## Entry / exit
- Entry: "Review evidence" on `v-track`; push "Task completed" / evidence uploaded; notification row; `v-task-detail` while AWAITING_CUSTOMER.
- Back → previous screen.
- "Confirm completion" success → replace this screen with `v-rate`.
- "Report a problem" → push `x-report-problem` (AWAITING_CUSTOMER → DISPUTED, approved by OA-9).
- Thumbnail → push `x-evidence-viewer` at that index.

## Task states
AWAITING_CUSTOMER. Confirm fires **AWAITING_CUSTOMER → COMPLETED only** (OA-7). COMPLETED is terminal for the customer; the screen never fires CONFIRMED or SETTLED (system-only, after the dispute window, rows 35 and 56). If opened in any other state: COMPLETED or later → replace with `v-task-detail`; earlier states → CTA hidden, evidence still viewable.

## Layout (top to bottom)
1. Pushed header (C-10) `Review evidence`.
2. Scrollable body:
   1. Section label `Photos & video (4)`, top padding 0.
   2. Evidence grid (C-25): 3 columns, gap 8, square thumbs r-s 8 (mockup 10), padding `0 20 14`. Video thumbs show a play glyph.
   3. Section label `Runner notes` + card (C-07) with the note text 13.5 blue, in quotes. Hidden when `runnerNotes` is empty.
   4. Section label `Payment summary`.
   5. Receipt card (C-18, **dashed** slate-line border, r-m 14, padding 16): **one** total row `Total (service + runner fee)` (row 34 clarification; no `Service fee` / `Runner fee` lines). When there is an item amount: separate group under a hairline (§8), `Item amount` + 12 slate-600 route line (`Paid to the merchant directly` / `Paid to Nitume for your runner`, row 42).
   6. Text link (C-04), red (destructive, OA-13), centred, margin `4 20 16`: `Report a problem`.
3. Fixed primary CTA (C-01).

## Components
| Element | Component | Status |
|---|---|---|
| Evidence grid | C-25 `EvidenceGrid` | built (photos only, video deferred row 32; signed URLs row 25) |
| Notes card | C-07 | built |
| Receipt (dashed + separate group) | C-18 | built (separate group change) |
| Report link | C-04 | built |
| CTA | C-01 | built |

## Copy
- Header (mockup): `Review evidence`
- Section (mockup): `Photos & video (4)` (count is dynamic; kept as drawn because a video item can still appear and shows the not-supported tile, row 32)
- Section: `Runner notes` (replaces the mockup's task-specific `Caretaker notes`; the field is `runner_notes`, OA-16)
- Note sample (mockup): `"Water leak in the kitchen has been reported to the landlord; repair scheduled for next week."`
- Section (mockup): `Payment summary`
- Rows: `Total (service + runner fee)` `KSh 2,200` (row 34 clarification replaces the mockup's three lines); `Item amount` (proposed, OA-4)
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
- Evidence: `GET /api/v1/errands/:errandId/evidence` (exists). Short-lived signed URLs (row 25); re-fetch once on an expired link.
- Notes: `runnerNotes` on `GET /errands/:id` (exists, OA-16).
- Payment summary: `GET /api/v1/payments/:errandId` (exists). Show only the fee total; never render `serviceFee` / `runnerFee` as lines (row 34 clarification).
- Confirm: `PATCH /api/v1/errands/:id/status { to: 'COMPLETED' }` (exists).
- Live (row 23): `evidence:uploaded` on `errand:{id}` refreshes the grid; polling only while the socket is disconnected.

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
- Fee lines: total only until pricing rates exist (row 34 clarification).

## Current vs design
Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Total-only fee row, `Paid to Nitume for your runner`, evidence:uploaded live refresh with polling only while disconnected, expired-link re-fetch.

Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. `Confirm completion` fires AWAITING_CUSTOMER → COMPLETED only; no escrow wording. Minor: the `(4)` count in the section label renders in Fira Sans (CC-2).

Spec update 2026-10-08 (rows 34, 42): the build shows `Service fee` / `Runner fee` / `Total paid`. Now required: the single `Total (service + runner fee)` row and the `Paid to Nitume for your runner` route line. Status set to `partial` until re-audited.
