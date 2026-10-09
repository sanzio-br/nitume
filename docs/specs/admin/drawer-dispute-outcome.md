# drawer-dispute-outcome — Resolution section and outcome of the dispute drawer

- Mockup: `#drawer-dispute` draws: chip `Open`, title, `Customer: … · Runner: … · Opened …`, `Customer's claim`, `Evidence on file`, `Timeline`, `Resolution` (textarea `Add a resolution note...`) and the actions `Side with runner` (`.btn-reject`, outline) / `Refund customer` (`.btn-approve`, green). This spec covers the **Resolution** section, the verdict actions and what the drawer shows afterwards. **EXTENDS MOCKUP**: outcome explanations, confirm step, rationale rules and the post-verdict result (incl. the link to the refund review). One **copy deviation**, approved: `Refund customer` → `Side with customer` (row 78).
- Shared conventions: `docs/specs/admin/_shared.md`
- Implementation: `apps/admin/src/app/features/admin/drawers/dispute-drawer.ts` (exists; see Current vs design)
- Status: matches-design (re-audit 2026-10-09 PASS; round-4 re-audit 2026-10-09 PASS)

## Purpose
Let an admin resolve a dispute with a written rationale and make the consequence of each verdict explicit (row 36, §3.3 as updated by row 56):
- **Side with runner** → task DISPUTED → **COMPLETED**. The normal runner payout follows (system moves COMPLETED → CONFIRMED → SETTLED after the dispute window; row 50: a new dispute window applies where relevant).
- **Side with customer** → task DISPUTED → **CANCELLED**. If the customer had paid, a refund review opens in `Refunds` in the same transaction, where an admin sets the amount (KSh 0 up to everything paid; row 37). The verdict itself moves no money.

## Entry / exit
- Entry: `Review evidence` on a `p-disputes` card; `Review` on a DISPUTED queue row; live-feed `Dispute opened` row. Drawer head title: `Resolve dispute` (current build; mockup title `Dispute #NT-10441` → use `Dispute #NT-XXXXX`, mockup wins on content).
- After a verdict: the drawer stays open on the result (below). `Open refund review` switches it to `drawer-refund`. Closing returns to the panel, where the dispute card is gone (the errand is no longer DISPUTED) and the nav badge drops.

## Task states
Only DISPUTED tasks show the verdict form. Results: COMPLETED (runner) or CANCELLED (customer). Any other status on open → read-only result view (below).

## Layout: sections above Resolution (unchanged from the mockup, noted for data only)
- `Customer's claim` (mockup label): the dispute `reason` from `GET /errands/:errandId/dispute` (not the errand description, see Current vs design).
- `Evidence on file`, `Timeline`: as the mockup; out of scope here.

## Layout: Resolution (DISPUTED)
1. `.drawer-section`, `.drawer-label` `Resolution` (mockup).
2. Outcome explainer `.drawer-card` (EXTENDS MOCKUP), two `.drawer-row`-like blocks separated by a hairline, each: 13/600 blue lead + 12.5 slate-600 line:
   - `Side with runner` — `The task moves to Completed. The runner is paid through the normal payout.`
   - `Side with customer` — `The task moves to Cancelled. If the customer paid, a refund review opens in Refunds, where you set the amount.`
3. Field A-06 (label hidden visually, `aria-label="Resolution note"`): textarea 4 rows, `.field-input`, placeholder `Add a resolution note...` (mockup), max 2000; under it a row: hint left 12 slate-600 `At least 20 characters. The customer and runner can see this note.` (row 79, decided). This is the **resolution note**; it is not an internal note. Internal admin-only notes are a separate thing (none in this drawer today); if one is added later it gets its own field labelled as internal and is never sent with the verdict, counter right Fira Code 11 slate-600 `0/2000` (turns `.field-error` red text below 20 once the field has been touched).
4. `.drawer-actions` (mockup order and variants): left `.btn .btn-outline` `Side with runner`; right `.btn .btn-primary` `Side with customer`. Both flex 1, both disabled until the trimmed note has ≥ 20 characters. No amber or red fills.
5. Click → A-08 confirm:
   - Runner: title `Side with runner?` · body `#NT-10441 moves to Completed and the runner is paid as normal. This can't be undone.` · buttons `Back` / `Side with runner`.
   - Customer: title `Side with customer?` · body `#NT-10441 moves to Cancelled. If the customer paid, a refund review opens for you to decide. This can't be undone.` · buttons `Back` / `Side with customer`.
   The confirm button is `.btn-primary` in both dialogs (the confirm is the primary action of the dialog).

## Layout: result (after a verdict, or when the drawer opens on a resolved dispute)
Replaces the Resolution section; the claim/evidence/timeline sections stay visible.
- `.drawer-label` `Outcome`
- `.drawer-card`:
  - Row `Task status` → A-02 errand chip (`Completed` or `Cancelled`, from the response, never assumed).
  - Row `Decided` → date/time (Fira Code) (from the response history row `createdAt`).
  - The resolution note, 13 blue, in quotes.
- A-11 notice:
  - Runner: success `Dispute resolved for the runner. The task is now Completed.`
  - Customer, refund review opened: success `Dispute resolved for the customer. The task is now Cancelled. A refund review is waiting in Refunds.` + `.btn .btn-outline` `Open refund review`.
  - Customer, no payment: info `Dispute resolved for the customer. The task is now Cancelled. The customer hadn't paid, so there is nothing to refund.`
- Opening the drawer on a task that is no longer DISPUTED (resolved elsewhere): the same Outcome card built from the latest history row whose `fromStatus` is `DISPUTED`; when no such row is loaded, from the dispute itself (`verdict` `runner_favourable` → `Completed`, `customer_favourable` → `Cancelled`; `resolvedAt` → `Decided`; `resolution` → note; `feat/api-owner-answers-4`, typed optional until merged); no notice.

## Validation
| Field | Rule (mirrors `ResolveDisputeDto`: `@MinLength(20) @MaxLength(2000)` and the service's trimmed ≥ 20 check) | Message |
|---|---|---|
| Resolution note | trimmed length 20 – 2000 | `Write at least 20 characters so both sides understand the decision.` |

## Request states
- Saving: dialog confirm `Saving…`, both dialog buttons disabled; drawer actions disabled.
- Success: response `{ errand, history }`. Update the errand in `AdminDataService` (status), close the dialog, render the result. For a customer verdict, call `GET /errands/:id/refund`: 200 → show `Open refund review` with that id; 404 `refund_not_found` → the "hadn't paid" notice; other error → success notice without the button plus 12 slate-600 `Find the refund review in Refunds.`
- Errors (A-14):

| Response | UI |
|---|---|
| 400 validation (`rationale must be longer than or equal to 20 characters`) | Field error (above) |
| 409 `errand_not_disputed` (N-8, on `main`), or any 409 after which the task is no longer DISPUTED | Reload errand, history and dispute; show the result view with A-11 info `This dispute was already resolved. Showing the outcome.` |
| 409 without a code while the task is still DISPUTED (rationale < 20 after trim) | Field error (Validation) |
| 403 | `_shared.md` §2 |
| 404 | A-11 info `This task no longer exists.` |
| network / 5xx | A-11 danger `Couldn't record the decision. Try again.`; note kept |

## Components
| Pattern | Id | Status |
|---|---|---|
| Drawer shell, sections, cards, rows | A-01, A-05 | exists |
| Errand chip | A-02 | exists |
| Textarea field + hint + error + counter | A-06 | exists (`.field-input`; current build uses `.drawer-textarea`); **NEW** hint/error + `app-form-field` |
| Buttons (outline / primary) | A-07 | exists |
| Confirm dialog | A-08 | **NEW** |
| Notices | A-11 | **NEW** (replaces `.dispute-result`) |
| Formatting | A-13 | **NEW** |
| Error mapping | A-14 | **NEW** |

## Copy
- Mockup: `Resolution`, `Add a resolution note...`, `Side with runner`, `Customer's claim`, `Evidence on file`, `Timeline`, `Dispute #NT-XXXXX`.
- Changed from mockup, approved (row 78): `Refund customer` → `Side with customer`.
- Proposed: the explainer lines, hint, dialog, `Outcome`, `Task status`, `Decided`, notices and errors above, `Open refund review`.
- Never: "refund issued", "money returned", "release", "held", "wallet", "escrow" (the verdict moves no money; `_shared.md` §3).

## Numeric fields (Fira Code)
Task id in titles/dialogs, `Decided` date/time, timeline times, the note counter `0/2000`.

## Data
- `GET /errands/:id` and `GET /errands/:id/history` (exist; already loaded by the drawer).
- `GET /errands/:errandId/dispute` (customer/runner/admin, exists) → `{ id, errandId, openedBy, reason, status, resolution, resolvedBy, createdAt, events[] }` for `Customer's claim`.
- `PATCH /errands/:id/resolve-dispute` body `{ verdict: 'runner' | 'customer', rationale: string }` (admin, exists) → `{ errand, history }`. `runner` → COMPLETED, `customer` → CANCELLED.
- `GET /errands/:id/refund` (admin allowed, exists) → `{ id, status, amountPaid, refundAmount, … }` or 404 `refund_not_found`.
- **needs: api-contract (N-6)**: the verdict must also resolve the `disputes` row (`status`, `resolution`, `resolvedBy`, a `resolved` event); today it stays `open`, so the customer's `Your report` screen never shows the outcome.
- **needs: api-contract (N-8)**: a code on the 409s (e.g. `errand_not_disputed`).
- Server side effects: `errand.status_changed` → customer/runner notifications; CANCELLED → refund review (if paid) in the same transaction; COMPLETED → dispute window restarts where applicable (row 50).

## Accessibility
- The verdict buttons are disabled until the note is long enough; the hint explains why (`aria-describedby` on both buttons points at the hint).
- Dialog focus starts on `Back` (destructive-ish, irreversible action).
- Result notice `role="status"`.

## Resolved by owner answers
- `Side with customer` label (AQ-2, row 78): the verdict only opens a refund review, which may end at KSh 0.
- Resolution note visible to customer and runner, separate from internal notes (AQ-3, row 79). N-6 is done on `main`, so the customer's `Your report` shows it.

## Open questions for the owner
None.

## Current vs design
Re-audit 2026-10-09 round 4 against `fix/angular-admin-owner-answers` @ `f1323de`: **PASS**. `dispute-drawer.ts` reads `verdict`/`resolvedAt` as the Outcome fallback (`disputeOutcome`) and keys the 409 on `errand_not_disputed`; both tested. Row 79: the customer already sees the resolution note on `x-report-problem` (Outcome); the verdict itself needs no customer copy (see that spec).

Re-audit 2026-10-09 (`docs/audits/admin-reaudit-2026-10-09.md`): PASS on `main`. The 2026-10-09 owner answers (rows 78, 79) confirm the built label and hint; no change. Minor m-4 (notice order) still applies on the next touch.

Earlier record (2026-10-08, before the build):
`dispute-drawer.ts` (and the shell, data service):
1. Labels: `Admin verdict`, `Rule for runner`, `Rule for customer` instead of the mockup's `Resolution`, `Side with runner` and (AQ-2) `Side with customer`; placeholder `Resolution note (shown to both parties)…` instead of `Add a resolution note...`. No outcome explanation.
2. `.btn-verdict.customer` is an **amber filled button** (`_ops.scss` `background: var(--nitume-amber)`), which the design system forbids (amber only as a chip accent). `.btn-verdict.runner` is green filled; the mockup draws the runner action as the outline button.
3. No 20-character minimum and no counter; an empty note is sent and fails (400/409) with a raw `HttpErrorResponse.message`.
4. No confirm step before an irreversible transition.
5. Result text `Verdict recorded — errand completed.` uses the lowercased enum, not the chip label; failures render in `.dispute-result.bad` (red-050 fill larger than a chip).
6. After the verdict the drawer shows `Dispute resolved` for both success and failure (`resumingLabel()` returns the same string in both branches), so a failed request reads as resolved.
7. `Customer claim` shows `errand.description` (the task brief), not the dispute `reason`.
8. No link to the refund review after a customer verdict.
9. Stale comments: the component and `api-types.ts` say DISPUTED → CONFIRMED/CANCELLED; §3.3 is now DISPUTED → COMPLETED/CANCELLED (row 56).
10. No tests exist anywhere in `apps/admin`.
