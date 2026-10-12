# Admin gap report (ops features + existing bugs)

- Surface: `apps/admin` (Angular 22). Audited on branch `feat/admin-ops` at `2a8fbd9` (the admin code is identical to `docs/customer-spec-audit`).
- Mode: B (audit), against `docs/specs/admin/_shared.md`, `p-refunds.md`, `drawer-refund.md`, `drawer-task-merchant-details.md`, `drawer-task-requote.md`, `drawer-dispute-outcome.md`, the mockup `docs/design/nitume_admin_dashboard.html` and `docs/design/nitume_design_system.html`.
- Authority to build: BOARD row 84 (owner, 2026-10-08): web-parity may build the five spec'd admin features plus the existing-bug fixes recorded here. Every entry below tagged **approved extension, row 84** is in that scope. Bug entries are fixes to existing code.
- Owner questions still open (BOARD rows 77–83, AQ-1..AQ-6, AQ-R2): build the spec defaults. Do not decide them in code beyond the default.
- Paths below are relative to `apps/admin/src/` unless they start with `docs/` or `apps/api/`.

## Overall verdict: FAIL

The admin surface does not meet the specs: the five ops features are missing, four shared components are missing, and the quote, assign and dispute flows have bugs (one of them leaks auth tokens to the console, see G-25). Builder: `web-parity`, working on `feat/admin-ops`.

## Dependency legend (API items, `_shared.md` §7)

N-1..N-8 are being built on `feat/api-owner-answers-3` (not merged). From that branch's diff:

| Item | What the client needs | On `feat/api-owner-answers-3` |
|---|---|---|
| N-1 | Refund list/detail with errand summary, customer contact, paid breakdown | `fe6e08b` (`AdminRefundItem`, `AdminRefundDetail`, `PaidBreakdown`, `mpesaPhone`) |
| N-2 | Admin display names for decided/paid by | `fe6e08b` (`AdminRef { id, displayName }`) |
| N-3 | Price-decrease refund reviews, more than one per errand | `fe6e08b` (trigger `price_change_decrease`, `GET /errands/:id/refunds`; owner row 71) |
| N-4 | Customer notified of a re-quote | `3f8a204` |
| N-5 | `quoteExpiresAt` on errand list/detail | present in `errands.service.ts` view |
| N-6 | Verdict also resolves the `disputes` row | `a50892f` |
| N-7 | Refund count endpoint | `GET /refunds/count` |
| N-8 | Codes on every 409 | `4dc6220` |

Entries marked **[dep N-x]** must ship with a fallback that works on `feat/api-owner-answers-2` (the fallback is in the spec), or wait for that API branch to merge. Do not type fields that the merged API does not return. If the code needs a round-3 shape, add it as optional fields and use them only when they are present.

### Owner answers after the specs were written (the specs must follow these)
- **Row 72 replaces AQ-R1** (`drawer-task-requote.md` table, ACCEPTED + expired): the owner chose "admin re-quote while the task stays ACCEPTED; the customer must accept and pay the new quote". Show `Issue new quote` for **ACCEPTED with an expired quote** too (same dialog and copy; sub-line `The task stays Accepted and the customer is asked to accept the new price.`), instead of the hint plus AQ-R1. **[dep `69a3eb0` on feat/api-owner-answers-3]**. Until that merges, keep the spec's ACCEPTED hint.
- **Row 71 answers N-3 / row 62 for decreases**: the trigger value is `price_change_decrease` → label `Price decrease` (`_shared.md` §6). A task can have more than one review, so the task-drawer refund link (G-3) lists `GET /errands/:id/refunds` items when that endpoint exists.

---

## A. Spec'd features: approved extension, row 84

### G-1 p-refunds: Refunds panel, sidebar item and badge (blocker, missing)
- Spec: `docs/specs/admin/p-refunds.md` (whole file); `_shared.md` §3, §6.
- Code: none. Shell `features/admin/admin-dashboard.component.ts:15` (`Panel` union has no `'refunds'`), `:93-106` (Network group ends at Disputes), `:143-165` (`@switch` has no refunds case). No `RefundReview` type in `core/api-types.ts`, no methods in `core/services/api.service.ts`, no store in `features/admin/admin-data.service.ts`.
- Fix:
  1. Add `features/admin/panels/refunds.panel.ts` using A-03 `app-panel-topbar`, A-04 table, the A-02 chip with `kind="refund"`, A-10, A-11, A-12 and A-13, with the columns, filter (default `Needs review`), sub-line, empty/loading/error copy and responsive column hiding from the spec.
  2. Add the `Refunds` nav item under `Network`, directly after `Disputes`, with a `.badge-count` showing the pending-review count (hidden at 0, `99+` when there is a next cursor).
  3. Add `ApiService.listRefunds(status?, cursor?, limit=25)`, plus `RefundReview`, `RefundStatus` and `RefundTrigger` types (decimal strings for amounts).
  4. The row button gets `min-height: 32px` and an accessible name such as `Review refund for #NT-XXXXX`.
- Depends: **[dep N-1]** task title (fallback: look up `AdminDataService.errands()`, no per-row calls); **[dep N-7]** badge count (fallback: count a `limit=100` page of `pending_review`).

### G-2 drawer-refund: refund decision and payout drawer (blocker, missing)
- Spec: `docs/specs/admin/drawer-refund.md` (all sections: states table, layout 1–5, validation, confirm dialogs, request states, error codes).
- Code: none. `admin-dashboard.component.ts:16` `DrawerKind` has no `'refund'`; `:224-235` `drawerTitle()` has no `Refund review`.
- Fix:
  1. Add `features/admin/drawers/refund-drawer.ts` and the `'refund'` drawer kind (title `Refund review`).
  2. Decision form: money input with `formatKshExact`, the `Full refund` / `No refund` quick-fill buttons, a note with a `0/1000` counter, and a primary button whose label follows the amount.
  3. Payout form: receipt validated with `^[A-Za-z0-9-]{4,64}$` and upper-cased before sending.
  4. Read-only views for `approved`, `refunded` and `no_refund`, plus the Activity timeline.
  5. A-08 confirm before every write, and an A-08 discard prompt when closing with unsaved input.
  6. Map every API error code in the spec's table with A-14.
  7. After a save, update the p-refunds row and the badge.
  8. Add `getRefund(id)`, `decideRefund(id, { refundAmount: number, note? })` and `markRefundPaid(id, { payoutReference })` to the API service.
- Depends: **[dep N-1]** paid breakdown and `Refund to` phone (fallback: total only plus the caption `Breakdown by payment isn't available yet.`, and `Customer's M-Pesa number not available`); **[dep N-2]** admin names (fallback: masked id, or `You`).

### G-3 Task drawer: refund link (minor, missing)
- Spec: `drawer-refund.md` "Task drawer link".
- Code: `features/admin/drawers/task-drawer.ts:107` (between the actions and `Status history`) has no Refund section.
- Fix: for a CANCELLED task, call `GET /errands/:id/refund`. On 200, show a `Refund` section: A-02 chip `kind="refund"`, the amount, and an `Open refund review` `.btn .btn-text` that switches the shell drawer to `refund` with the returned `id`. On 404 `refund_not_found`, hide the section. The drawer needs an output, or a shell service, to change drawer kind; it must not import the shell.
- Depends: row 71 / **[dep N-3]**: once `GET /errands/:id/refunds` exists, list every review (one row each). Until then, show the single review.

### G-4 drawer-task-merchant-details: Merchant payment details section (blocker, missing)
- Spec: `docs/specs/admin/drawer-task-merchant-details.md` (when it shows, layouts A/B/C, validation, request states, errors).
- Code: `task-drawer.ts:22-80` has no merchant section. `core/api-types.ts:116-133` `Errand` lacks `merchantName`, `merchantTillNumber`, `merchantPaybillNumber`, `merchantAccountReference` and `merchantDetailsAvailable`.
- Fix:
  1. Add a child component `features/admin/drawers/merchant-details.section.ts`, placed after Items/Locations and before Admin actions.
  2. Show it for `buy_for_me` / `pickup_delivery`, or when any merchant field is set (AQ-4 default).
  3. Make it read-only in `SETTLED`, `CANCELLED`, `FAILED` and `EXPIRED`. Use that exact list, not the store's `TERMINAL` constant at `admin-data.service.ts:64`, which also contains COMPLETED and CONFIRMED.
  4. Use the A-09 toggle for `Till (Buy Goods)` / `Paybill`.
  5. Number inputs use `inputmode="numeric"` and `pattern="\d*"`, not `type="number"`.
  6. Send `{ merchantName, tillNumber }` or `{ merchantName, paybillNumber, accountReference? }`, leaving out empty fields.
  7. Show the A-08 warning when changing existing details at PAYMENT_CONFIRMED or later (AQ-4 default: warn).
  8. After a save, patch the errand in the store. Add `ApiService.setMerchantDetails(id, body)` returning `Errand`, and the five fields on `Errand`.
- Depends: none for the panel itself (`PUT /errands/:id/merchant-details` is on api-2). The customer notification is `3f8a204` (server only).

### G-5 drawer-task-requote: Quote section and "Issue new quote" (blocker, missing)
- Spec: `docs/specs/admin/drawer-task-requote.md` (task-states table, layout, dialog, validation, request states, errors). Row 72 extends it to ACCEPTED (see "Owner answers" above).
- Code: `task-drawer.ts` never calls `GET /errands/:id/quote` and has no Quote section. `:83` shows `Issue quote` for QUOTED with no expiry check.
- Fix:
  1. Add a Quote section (`Quoted total`, `Issued`, `Valid until` / `Expired` with the A-02 `Quote expired` pending-tone flag, and a `Show fee breakdown` disclosure), re-evaluating expiry every 30 s.
  2. Keep `Issue quote` for REQUESTED only. Show `Issue new quote` only for QUOTED (and ACCEPTED per row 72) when the quote has expired.
  3. Build the dialog on A-08 form mode: total prefilled; components optional and left out when empty; `Valid until` required with a default of now + 24 h (AQ-R2 default) and the hint `East Africa Time`; note with a `0/500` counter; no Currency field.
  4. Map `quote_still_valid`, other 409s, 400 and network errors with A-14.
  5. Add `ApiService.getQuote(id)` and the `Quote` type.
- Depends: **[dep N-5]** queue-level `Quote expired` flag (`quoteExpiresAt`; drawer-only until merged); **[dep N-4]** customer notification (server only); row 72 ACCEPTED re-quote on `69a3eb0`. Shares the fixes in G-15.

### G-6 drawer-dispute-outcome: Resolution section, confirm and outcome (blocker, missing)
- Spec: `docs/specs/admin/drawer-dispute-outcome.md` (Resolution layout, validation, result layout, request states, errors).
- Code: `features/admin/drawers/dispute-drawer.ts:62-103`, `admin-dashboard.component.ts:230-231`.
- Fix:
  1. Change the drawer title to `Dispute #NT-XXXXX`.
  2. Label the section `Resolution` and add the outcome explainer card.
  3. Use an `.field-input` textarea with placeholder `Add a resolution note...`, the hint (AQ-3 default: both parties see the note) and a `0/2000` counter.
  4. Buttons: `.btn .btn-outline` `Side with runner` and `.btn .btn-primary` `Side with customer` (AQ-2 default), both disabled until the trimmed note has at least 20 characters.
  5. A-08 confirm per verdict.
  6. Build the Outcome card from the response (errand chip, `Decided` time, the note), with the A-11 notices.
  7. After a customer verdict, call `GET /errands/:id/refund` and show `Open refund review` (G-3 wiring).
  8. When the drawer opens on a non-DISPUTED task, show the read-only outcome built from the latest history row with `fromStatus === 'DISPUTED'`.
  9. G-19..G-23 are the bug-level parts of this entry. Fix them together.
- Depends: **[dep N-6]** customer-side outcome (server only); **[dep N-8]** precise 409 wording (fallback: switch on status 409 as the spec says).

## B. Shared components (admin shared layer, owner `web-parity`)

Build these first, in `shared/` (components) and `core/` (helpers). A per-screen copy of any of them is a FAIL.

### G-7 A-02 StatusChip `kind` input (blocker)
- Spec: `_shared.md` §5 A-02, §6.
- Code: `shared/status-chip.component.ts:79-105`. `statusLabel()` / `statusVariant()` look status strings up in all vocabularies in turn, so `approved` resolves to the verification label `Approved` (success) at `:86` / `:102`. Refund statuses `pending_review`, `refunded` and `no_refund` fall through to title case.
- Fix: add `kind = input<'errand' | 'refund' | 'verification' | 'availability'>('errand')` and choose the label/variant map by kind. Refund map: `pending_review` → `Needs review` / pending; `approved` → `Payout due` / pending; `refunded` → `Refunded` / success; `no_refund` → `No refund` / neutral. Add a way to render a flag chip with fixed text and tone (`Quote expired`, pending) without going through status lookup (for example a `label` + `tone` override). Update the existing verification and availability call sites to pass `kind`. Errand labels stay the same.

### G-8 A-06 field hint/error and `app-form-field` (blocker)
- Spec: `_shared.md` §5 A-06.
- Code: `styles.scss:169-200` has `.field`, `.field-label`, `.field-input` and `.is-invalid`, but no `.field-hint` or `.field-error` and no component.
- Fix: add `.field-hint` (12px, slate-600, Fira Sans) and `.field-error` (12px/600, red text only) to `styles.scss`. Add `shared/form-field.component.ts` (`app-form-field`: label, hint, error and an optional counter; projects the control and wires `aria-describedby`; sets `aria-invalid`). Add a money-input variant with the static `KSh` prefix (Fira Sans 13 slate-600) and a Fira Code value.

### G-9 A-08 ConfirmDialog (blocker)
- Spec: `_shared.md` §5 A-08; form mode at max-width 440 (`drawer-task-requote.md`).
- Code: none. `task-drawer.ts:131-193` uses `.drawer-modal` / `.drawer-modal-card` / `.modal-*`, which have no styles anywhere (see G-18).
- Fix: add `shared/confirm-dialog.component.ts` (`app-confirm-dialog`): a scrim over the drawer and a white card (radius 14, padding 20, max-width 360, or 440 in form mode). Title is `h3` 16/700; body 13 slate-600 with projected content. Actions are right-aligned: `.btn .btn-outline` `Back` and a `.btn .btn-primary` confirm. Focus is trapped, initial focus goes to `Back` (or a supplied element in form mode), and ESC acts as Back. A `busy` input disables both buttons, blocks dismissal and changes the confirm label (`Saving…` / `Issuing…`). No red buttons.

### G-10 A-09 SegmentedToggle (blocker for G-4)
- Spec: `_shared.md` §5 A-09; `drawer-task-merchant-details.md` Accessibility.
- Code: none.
- Fix: add `shared/segmented-toggle.component.ts`: `role="radiogroup"`, arrow-key navigation, height 36, a 1px slate-line pill. The active segment is a green fill with white 13/600 text; inactive segments are white with blue text. Focus ring is a 2px green outline with offset 1.

### G-11 A-11 InlineNotice (blocker)
- Spec: `_shared.md` §5 A-11.
- Code: none. The current feedback styles break the design system rule that amber/red appear only at chip size: `.dispute-result.bad` (`styles/_ops.scss:1345-1348`, red-050 fill), `.dispute-result.ok` (`:1341-1344`), and `.ops-banner` (`:952-960`, red-050 fill, used at `admin-dashboard.component.ts:166-168`).
- Fix: add `shared/inline-notice.component.ts` with tones `success`, `danger` and `info`. It renders a `.drawer-card` with an A-02-styled chip of that tone, then 13px blue text. `role="status"` for success/info, `role="alert"` for danger. Optional dismiss and auto-dismiss after 6 s. Optional projected action (for `Try again` / `Open refund review`). Delete `.dispute-result*` once G-6 lands. Replace `.ops-banner` with A-11 danger, in this branch or as a recorded follow-up, because it is the same rule violation.

### G-12 A-13 `formatKshExact` and `formatDateTime` (blocker)
- Spec: `_shared.md` §3, §5 A-13.
- Code: `features/admin/shared-format.ts:12` `formatKsh` rounds to whole shillings, which is wrong for refunds. There is no absolute date/time helper; `timeAgo` is at `admin-data.service.ts:49-58`. `dispute-drawer.ts:136-139` has its own copy of the rounding formatter (`ksh()`).
- Fix: add to `shared-format.ts`:
  - `formatKshExact(value)`: `KSh 1,250`, `KSh 1,250.50`, `—` for null; never rounds; en-KE grouping.
  - `parseKsh(input)`: strips `,` and spaces, at most 2 decimals, returns a number or null.
  - `formatDateTime(iso)`: `Today, 4:30 PM` / `Yesterday, 4:30 PM` / `Mon 12 Oct, 4:30 PM` in `Africa/Nairobi`.

  Remove `DisputeDrawerComponent.ksh()` and use the shared helper.

### G-13 A-14 `apiError()` helper (blocker)
- Spec: `_shared.md` §5 A-14, §2 (403 copy).
- Code: none. Raw `HttpErrorResponse.message` ("Http failure response for …") reaches the UI at `admin-data.service.ts:248`, `:281` and `:299` (shown at `task-drawer.ts:20` and `dispute-drawer.ts:93`, `:101`). `task-drawer.ts:254` and `:282` and `verifications.panel.ts:121` and `:147` only log to the console.
- Fix: add `core/api-error.ts` `apiError(err): { status, code?, message, extra }`, read from `HttpErrorResponse.error` (`{ statusCode, code, message, ...extra }`, where `message` may be `string[]`). Store methods should throw or return this shape, and components map it to spec copy. Use the shared 403 copy `You don't have access to this. Sign in with an ops admin account.` Never render `HttpErrorResponse.message`.

### G-14 A-10 empty/loading and A-12 "Load more" (minor)
- Spec: `_shared.md` §5 A-10, A-12.
- Code: A-10 exists (`styles/_ops.scss:926-949`). A-12 exists only as inline markup in `verifications.panel.ts` and has no style.
- Fix: use A-10 as is. Turn A-12 into one reusable piece: a `.pagination` style plus a `shared/load-more.component.ts` (centred `.btn .btn-outline`, `Load more` / `Loading…`). Use it in p-refunds and switch `verifications.panel.ts` to it.

## C. Existing bugs (fixes to current code)

### G-15 Quote modal: string body (400), console-only errors, wrong response type (blocker)
- Spec: `drawer-task-requote.md` "Validation", "Data", Current vs design 1–2; `_shared.md` §3 (money sent as JSON numbers).
- Code:
  - `core/api-types.ts:15-26` `QuoteErrandDto` types every field as `string`. `task-drawer.ts:208-211` sets every component to `''`, and `:279` sends them unchanged. The API DTO (`apps/api/src/matching/dto/matching.dto.ts` `@IsOptional() @IsNumber()`) rejects `""`, so any quote with a blank component fails with 400.
  - `task-drawer.ts:178-179`: a free-text `Currency` input (spec: removed; send nothing, the API defaults to `KES`).
  - `task-drawer.ts:266-267`: the default expiry is `toISOString().slice(0, 16)`, which is UTC shown in a local `datetime-local` (in EAT the default reads 21 h ahead, not 24 h). The value is sent without a timezone offset.
  - `task-drawer.ts:281-283`: failures go only to `console.error('Quote failed:', e)`, with no user feedback (including `quote_still_valid`).
  - `core/services/api.service.ts:94-96` and `admin-data.service.ts:312-318`: the response is typed `Errand`, but the API returns `{ errand, history, quote }` (first quote) or `{ errand, history: null, quote }` (re-quote). So `res.status` and `res.quotedPrice` are `undefined`, and the store writes `undefined` into the queue row's status and price.
- Fix:
  1. Retype `QuoteErrandDto` as `{ total: number; baseFee?: number; distanceFee?: number; timeFee?: number; urgencyFee?: number; complexityFee?: number; premiumFee?: number; expiresAt: string; note?: string }`. Build the body with `parseKsh`, leaving out empty fields.
  2. Build the default expiry and the sent `expiresAt` from local time with an explicit offset (ISO 8601 with `+03:00`, or a UTC `Z` converted correctly).
  3. Add `QuoteErrandResult { errand: Errand; history: ErrandStatusHistoryEntry | null; quote: Quote }`, and read `res.errand.status` / `res.errand.quotedPrice` in the store.
  4. Show errors through A-14 and A-11 as in the spec's table.
  5. Move the modal to A-08 (G-9).

### G-16 "Assign runner" offered before PAYMENT_CONFIRMED (blocker, state machine)
- Spec: `drawer-task-requote.md` Current vs design 3; `docs/design/Nitume_System_Design.md` §3.3 (PAYMENT_CONFIRMED → RUNNER_ASSIGNED is the only assignment transition; `MatchingController.assign` comment on the API).
- Code: `task-drawer.ts:82-105` shows `Assign runner` for `REQUESTED` and `QUOTED`, where the API always refuses. `features/admin/panels/task-queue.panel.ts:73-75` labels the row button `Assign` for REQUESTED/QUOTED, and `admin-data.service.ts:124-126` counts those as the queue's "pending" badge.
- Fix: show `Assign runner` only when `status === 'PAYMENT_CONFIRMED'`. Show `Issue quote` only for REQUESTED, and `Issue new quote` per G-5. The queue row button reads `Assign` only for PAYMENT_CONFIRMED (otherwise `View`); the mockup's `Assign` row action exists for exactly this. Keep the pending badge as is: it counts tasks needing ops action, so it is not a state-machine problem. Leave it unless the owner asks.

### G-17 Assign modal: handler throws, response type wrong (minor)
- Code:
  - `task-drawer.ts:137` binds `(ngModelChange)="onRunnerSelect($event)"`, which passes the selected value string, but `:260-262` reads `(event.target as HTMLSelectElement).value`. That throws a TypeError on every selection; `[(ngModel)]` has already set the value, so it only "works" by accident.
  - `api.service.ts:89-91` and `admin-data.service.ts:303-310` type the response as `Errand`. The API returns `{ errand, history, assignment }`, so the store writes `status: undefined`.
  - `task-drawer.ts:253-255`: errors are console-only.
  - `task-drawer.ts:234`: the list offers `busy` runners too. Keep this (the API decides), but label them `On task` (the A-02 availability label) instead of the raw `busy`, which is rendered at `:141`.
- Fix: remove `onRunnerSelect` and the `ngModelChange` binding. Type an `AssignErrandResult` and read `res.errand`. Show errors via A-14 and A-11. Move the modal to A-08 (form mode) with A-06 fields.

### G-18 `.drawer-modal` / `.modal-*` / `.action-row` unstyled; `btn-primary` / `btn-outline` used without `.btn` (blocker)
- Spec: `_shared.md` §5 A-07, A-08.
- Code: `task-drawer.ts:87`, `:89`, `:96`, `:132-153`, `:159-191` use `.action-row`, `.drawer-modal`, `.drawer-modal-card`, `.modal-sub`, `.modal-label`, `.modal-select`, `.modal-textarea`, `.modal-input`, `.modal-grid` and `.modal-actions`. None of these classes is defined in `styles.scss` or `styles/_ops.scss`, so the "modal" renders inline at the bottom of the drawer body with browser-default inputs. Buttons at `task-drawer.ts:89`, `:96`, `:148`, `:149`, `:186`, `:187` and `features/admin/panels/disputes.panel.ts:41` use `btn-primary` / `btn-outline` without the `.btn` base, so they get colour but no padding, radius, font or border (`styles.scss:107-127` puts those on `.btn`). In `disputes.panel.ts` a scoped `.dc-foot .btn-outline` rule (`styles/_ops.scss:1078-1091`) covers for it.
- Fix: replace both modals with A-08 and the fields with A-06. Every button gets the `.btn` base class. Use `.drawer-actions` (exists) instead of `.action-row`. Change `disputes.panel.ts:41` to `.btn .btn-outline`, and drop the scoped override or reduce it to size-only.

### G-19 Dispute drawer: amber filled verdict button (blocker, design rule)
- Spec: `drawer-dispute-outcome.md` Layout 4, Current vs design 2; design rules (amber/red only as chip accents; green only for primary actions).
- Code: `dispute-drawer.ts:76-82` `.btn-verdict.customer`, styled `background: var(--nitume-amber)` at `styles/_ops.scss:1323-1329`. Also `.btn-verdict.runner` is a green fill (`:1317-1322`), where the mockup draws the runner action as the outline button.
- Fix: `Side with runner` → `.btn .btn-outline`; `Side with customer` → `.btn .btn-primary`; both flex 1. Delete `.btn-verdict*` from `_ops.scss`.

### G-20 Dispute drawer: no 20-character minimum, no counter (blocker)
- Spec: `drawer-dispute-outcome.md` Layout 3–4, Validation (mirrors `ResolveDisputeDto` `@MinLength(20) @MaxLength(2000)`).
- Code: `dispute-drawer.ts:65-71` (`.drawer-textarea`, placeholder `Resolution note (shown to both parties)…`, no maxlength); `:73` and `:79` disable only on `saving()`; `:124-130` sends any note, including an empty one.
- Fix: use A-06 `.field-input` with `maxlength=2000`, the spec placeholder, hint and `0/2000` Fira Code counter. Disable both verdict buttons until `rationale().trim().length >= 20`, with `aria-describedby` pointing at the hint. Show the field error `Write at least 20 characters so both sides understand the decision.` after the field is touched. Delete `.drawer-textarea` (`styles/_ops.scss:1289-1305`) once nothing uses it.

### G-21 Dispute drawer: false "resolved" (blocker)
- Spec: `drawer-dispute-outcome.md` Request states, Current vs design 5–6.
- Code:
  - `dispute-drawer.ts:120-122`: `errand()` searches only `s.errands()` (the last-100 list window) for a DISPUTED row. It ignores the `GET /errands/:id` detail that `:117` loads into `s.detail()`. A disputed task outside the window, or a list that hasn't loaded yet, falls into `:89-97` and reads **"Dispute resolved — … the verdict has been recorded."** without any verdict having been made.
  - `:132-134`: `resumingLabel()` returns `'Dispute resolved'` on both branches.
  - `:62` hides the form after **any** result, so a failed request leaves no way to retry. The failure text is the raw `HttpErrorResponse.message` (`admin-data.service.ts:299`).
  - `admin-data.service.ts:297`: the success copy `Verdict recorded — errand completed.` uses the lowercased enum, not the A-02 label.
- Fix: drive the drawer from `s.detail()` (and `s.detailLoading()` / `s.detailError()`). Show the form only when `detail.status === 'DISPUTED'`. Otherwise show the read-only Outcome from history (G-6). On failure, keep the form and the note and show A-11 danger with the spec copy. Show the result only from a successful response. Delete `resumingLabel()`.

### G-22 Dispute drawer: errand description shown as the claim (blocker)
- Spec: `drawer-dispute-outcome.md` "Layout: sections above Resolution", Data.
- Code: `dispute-drawer.ts:36-39`: the `Customer claim` section renders `d.description` (the task brief). The mockup label is `Customer's claim`.
- Fix: load `GET /errands/:errandId/dispute` (add `ApiService.getDispute(errandId)` and a `Dispute` type) and render `reason` under the label `Customer's claim`. Use the dispute `createdAt` for `Opened` (`dispute-drawer.ts:28` currently shows the errand's `createdAt`).

### G-23 Stale DISPUTED → CONFIRMED comments (minor)
- Spec: §3.3 as updated by row 56 (DISPUTED → COMPLETED / CANCELLED); `drawer-dispute-outcome.md` Current vs design 9.
- Code: `dispute-drawer.ts:8` and `core/api-types.ts:169`.
- Fix: change both to `DISPUTED → COMPLETED (runner) / CANCELLED (customer)`.

## D. Other design-rule and non-negotiable findings

### G-24 Missing admin unit tests (blocker, Definition of Done)
- Code: the only test file is `app/app.spec.ts` (2 tests: the app creates and has a router outlet). There are no tests for any panel, drawer, shared component, helper or the store. `npx ng test --watch=false` passes (1 file, 2 tests). `tsc --noEmit -p tsconfig.app.json` is clean.
- Fix: add vitest specs (`*.spec.ts` next to each file) for at least:
  1. A-02 kind mapping, including refund `approved` → `Payout due`.
  2. `formatKshExact`, `parseKsh` and `formatDateTime` (Today/Yesterday/date; EAT).
  3. `apiError` (object body, `message[]`, network error).
  4. A-08 focus, ESC and busy behaviour.
  5. A-09 keyboard behaviour.
  6. refunds.panel: filter, empty states, load more, badge.
  7. refund-drawer: validation boundaries (0, `amountPaid`, 3 decimals), the label switch, confirm, and the 409/400 mappings.
  8. merchant-details: request body shape (never both numbers) and read-only in terminal states.
  9. requote: expiry detection, a body with numbers only and empty fields left out, and `quote_still_valid`.
  10. dispute drawer: the 20-character gate, no false "resolved", and the outcome from the response.
  11. task drawer: Assign shown only at PAYMENT_CONFIRMED.

  Use `HttpTestingController` for the HTTP shapes.

### G-25 Auth tokens and OTP responses logged to the console (blocker, security, AGENT_BUILD_INSTRUCTIONS §3/§7)
- Code: `core/auth/auth.service.ts:47` `console.log('[AuthService] verifyEmailOtp response:', res)` prints the access and refresh tokens. `:50` prints the store state (tokens again). `:39` (`console.info('[nitume:admin] OTP requested', r)`) logs the OTP request response.
- Fix: remove all three. No token, OTP or user payload may be logged.
- Note: this is outside the row 84 feature list, but it is a security non-negotiable. It is listed so web-parity removes it on this branch. Report it to the owner.

### G-26 Debug logging left in the login flow (minor)
- Code: `auth/login/login.component.ts:51-53`, `:56`, `:60` (`console.log('wowww')`, `'imepista'`, `'submitting'`, and boolean dumps). Also `task-drawer.ts:254`, `:282` and `verifications.panel.ts:121`, `:147` log errors instead of showing them (these are covered by G-13 / G-15 / G-17).
- Fix: delete the login debug logs. Error logs are replaced by A-14 / A-11 user feedback.

### G-27 Category display name `Business` instead of `Business Tasks` (blocker, domain rule)
- Spec: WORKFLOW "Domain reminders": the six display names are exact. `business` → **Business Tasks**.
- Code: `features/admin/admin-data.service.ts:31` `business: 'Business'`. It feeds the queue filter (`task-queue.panel.ts:43`), the category column, the drawers, the feed and the reports.
- Fix: change it to `'Business Tasks'`.

### G-28 Fira Code applied to text values in drawer rows (minor, typography)
- Spec: Fira Code for numeric data only (`_shared.md` §3; design system).
- Code: `.drawer-row b` is Fira Code (`styles/_ops.scss:860-863`), and the drawers put non-numeric text inside `<b>`. Examples: category at `task-drawer.ts:29` and `dispute-drawer.ts:21`; urgency `standard` at `task-drawer.ts:41`; item names/units at `:59-61`; addresses at `:75`; `not assigned` at `dispute-drawer.ts:25`.
- Fix: add a text-value modifier (for example `.drawer-row b.txt { font-family: var(--nitume-font-ui) }`, or a `.drawer-row .val-text` class) in `_ops.scss`, and use it for every non-numeric value. New sections (G-2, G-4, G-5, G-6) follow the specs' "Numeric fields" lists exactly (merchant name is Fira Sans 600).

### G-29 Deadline rendered with `timeAgo` (minor)
- Code: `task-drawer.ts:44` formats `deadlineAt` with `timeAgo`. That function clamps to at least 1 minute ago (`admin-data.service.ts:52`), so every future deadline reads `1m ago`.
- Fix: use `formatDateTime(d.deadlineAt)` (A-13).

### G-30 Hex colours outside the token layer (minor, tokens)
- Code: `styles/_ops.scss:28` `#dce3ee`, `:58`, `:145`, `:150` `#7e8ca8`, `:70` `#c3cadc`, `:301` `#eef1f5`. They come from the mockup's sidebar and map styles, but they are not defined in `styles/_tokens.scss`.
- Fix: add them to `_tokens.scss` as named derived tones (for example `--nitume-sidebar-text`, `--nitume-sidebar-muted`, `--nitume-sidebar-label`, `--nitume-map-bg`) and reference them through `var(...)`. No new colours. There are no hex values in any `.ts` file.

### G-31 Disputes panel shows fixed evidence chips and the errand's open time (minor, out of the five specs)
- Code: `features/admin/panels/disputes.panel.ts:35-39` always shows the chips `Timeline`, `Parties`, `Photos`, whether or not evidence exists. `:30` `opened {{ timeAgo(d.createdAt) }}` uses the errand's creation time, not the dispute's.
- Fix: record only; do not build in this branch unless cheap. Show evidence chips only for evidence that exists (from `GET /errands/:id/dispute` `events[]`), and use the dispute's `createdAt` once the panel has dispute data. Pending a full parity audit of `p-disputes`.

## Build order for web-parity

1. Shared layer: G-7, G-8, G-9, G-10, G-11, G-12, G-13, G-14, with their tests (G-24).
2. Bug fixes in existing code: G-15, G-16, G-17, G-18, G-25, G-26, G-27, G-28, G-29, G-30, G-23.
3. Dispute drawer: G-6 with G-19, G-20, G-21, G-22.
4. Task drawer sections: G-5 (re-quote), G-4 (merchant details), G-3 (refund link).
5. Refunds: G-1 then G-2.
6. Tests for every new screen and section (G-24). `ng build` and `ng test` must be clean before handoff.

## Screen-level verdicts

| View | Verdict | Entries |
|---|---|---|
| p-refunds | FAIL (missing) | G-1, G-7, G-11, G-12, G-13, G-14, G-24 |
| drawer-refund | FAIL (missing) | G-2, G-3, G-7, G-8, G-9, G-11, G-12, G-13, G-24 |
| drawer-task-merchant-details | FAIL (missing) | G-4, G-8, G-9, G-10, G-11, G-13, G-24 |
| drawer-task-requote | FAIL (missing) | G-5, G-15, G-16, G-18, G-9, G-12, G-13, G-24 |
| drawer-dispute-outcome | FAIL (missing) | G-6, G-19, G-20, G-21, G-22, G-23, G-11, G-24 |
| drawer-task (existing) | FAIL (partial) | G-15, G-16, G-17, G-18, G-28, G-29 |
| drawer-dispute (existing) | FAIL (partial) | G-19..G-23, G-28 |
| app-wide | FAIL | G-24, G-25, G-26, G-27, G-30, G-31 |

## Addendum 2026-10-09: owner answers round 3 (BOARD rows 66–94)

Applied on `docs/owner-answers-3` (from `main` @ `c7675dc`, which includes `feat/admin-ops` and its PASS re-audit, `docs/audits/admin-reaudit-2026-10-09.md`). AQ-1 … AQ-6, AQ-R1 and AQ-R2 are answered; `docs/specs/admin/_shared.md` §1 quotes the rows and §8 records the answers. Only AQ-7 (12-hour EAT times, default yes) remains, as a minor.

### Screen status after the spec changes

| View | Rows | Status |
|---|---|---|
| p-refunds | 77, 86, 87, SA-1 | matches-design → **partial** |
| drawer-refund (+ task drawer refund link) | 69, 77, 81, 82, 86, 87, SA-1, SA-2 | matches-design → **partial** |
| drawer-task-requote | 68, 72, 83, 88 | matches-design → **partial** |
| drawer-task-merchant-details | 67, 80 | matches-design → **partial** |
| drawer-dispute-outcome | 78, 79 | matches-design (built defaults confirmed, no change) |
| app-wide tokens | 93 | G-30 closed: the four admin tones are approved admin palette tokens (`_shared.md` §4.1) |

### Builder lists

#### web-parity (`apps/admin`)

1. **p-refunds, nav (row 77)**: move `Refunds` out of the `Network` group (`admin-dashboard.component.ts:74-128`) into a new `.ops-nav-group` labelled `Payments`, between `Network` and `Insights`; keep the badge. Update the shell test.
2. **p-refunds, column (SA-1)**: header `Paid to Nitume` → `Refundable` (same `amountPaid` value). Needs-review empty-state text per the spec.
3. **drawer-refund, paid card (SA-1, row 87)**: under `Total paid to Nitume`, add `Already refunded on this task` (sum of `otherReviews` approved/refunded `refundAmount`, only when > 0) and `Refundable in this review` (`amountPaid`, when it differs from `paid.totalPaidToNitume`). Validation message → `The refund can't be more than the KSh {amountPaid} refundable in this review.` Map `refund_exceeds_amount_paid` with the returned ceiling as before.
4. **Task drawer refund link (SA-2)**: `refund-link.section.ts:76` gates on CANCELLED and falls back to `/refund`. Call `GET /errands/:id/refunds` for every task from PAYMENT_CONFIRMED on; one row per review (reason, chip, amount, `Open refund review`); hide when empty; load-error line with `Try again`. Remove the `/refund` fallback. Tests for an active task with a decrease review and for the empty case.
5. **drawer-refund, receipts (row 82)**: no edit control after `refunded` (already true; add a test asserting none renders). Corrections are spec only: build nothing.
6. **drawer-task-requote (row 68)**: once api-contract ships `quoteRequestedAt` (N-13), show the `New quote requested` flag chip and `Customer asked for a new quote {date, time}.`; in the queue, show the flag and sort those rows first; count them in the `Task queue` badge. Until then nothing renders.
7. **drawer-task-requote (row 83)**: keep `Valid until` required in both dialog modes; add a test for the first-quote (`Issue quote`) mode.
8. **drawer-task-merchant-details (row 80)**: `merchant-details.section.ts:54-60`: editable only for `buy_for_me` / `pickup_delivery`; other categories hidden, or read-only with `Merchant details only apply to Buy For Me and Get It For Me.` when legacy fields exist. Warning dialog body `The customer may already be paying the current {Till|Paybill} {number}. We'll tell them the details changed so they check before paying.`; success notice for that case per the spec; map `merchant_details_not_applicable` (N-14). Tests for both category groups.
9. Re-audit minors m-1 … m-5 still apply on the next touch of those files.

#### api-contract (`apps/api`)

`_shared.md` §7 N-9 … N-14 (the customer gap report addendum lists the same items with file references):

1. N-9 (row 87) refund ceiling net of earlier approved/refunded reviews, enforced cumulatively at decision time.
2. N-10 (row 86) decrease refund reviews only on `send_to_runner`.
3. N-11 (row 83) quote `expiresAt` defaults to now + 24 h and is never null for new quotes; backfill legacy nulls.
4. N-12 (row 82) `KSh` and the app money format in notification bodies.
5. N-13 (row 68) customer quote request endpoint, `quoteRequestedAt` on errand detail and list items, ops notification/live-feed item.
6. N-14 (row 80) merchant details only for the two categories; `merchantDetailsUpdatedAt` and a `merchant_details.changed` customer notification on a change after a merchant-direct payment started.
7. Row 77: no change; every `admin` user is authorized. If a refund/payout permission is ever added, the 403 path is already specced.
8. N-15 (row 82): correction/reversal record. Spec only; it needs an owner-approved schema before anyone builds it.

### Questions for the owner (new)

- AQ-7 (minor): 12-hour `4:30 PM` times in East Africa Time, as drawn in the mockup? Built default: yes.
- SQ-11 (payments; see the customer gap report addendum): when Nitume pays the runner the `send_to_runner` item amount through the payout ledger.


## Addendum 2026-10-09: re-audit round 4 (owner answers round 3 build)

Audited: `fix/angular-admin-owner-answers` @ `f1323de` (11 commits on `main` @ `c7675dc`: `9d1b2c8` … `f1323de`), against the specs on `docs/owner-answers-3` and the round-3 addendum above. API for the new fields: `feat/api-owner-answers-4` @ `124d81e` (read with `git show`; not on `main`). The admin types those fields as optional with `TODO(owner-answers-4)` markers, which is accepted for this round.

Build health, from a `git archive` of the branch (worktree untouched): `ng test` 18 files, **137 tests pass**; `ng build` clean; Prettier clean on every changed file. Token scan: no hex value outside `_tokens.scss` in `apps/admin/src`; no `wallet`/`escrow`/`balance`/`held`/`release`/`credit`/`KES` in added lines (the only `KES` hits are the test asserting its absence).

### Verdicts

| View | Verdict | Findings |
|---|---|---|
| shell (`Payments` nav group) | PASS | none |
| p-refunds | **FAIL** | 1 (blocker) |
| drawer-refund (+ task drawer refund link) | PASS | none new (m-1, m-2 carried) |
| drawer-task-requote (`New quote requested`, re-quote) | PASS | m-6, m-7, m-8 (minor) |
| drawer-task-merchant-details | PASS | m-9 (minor, spec correction) |
| drawer-dispute-outcome | PASS | none (m-4 carried) |

### shell: PASS
`admin-dashboard.component.ts:115-135`: new `.ops-nav-group` labelled `Payments` between `Network` and `Insights`, `Refunds` its only item, badge kept (`99+` past 99, from `GET /refunds/count`; keeps its last value on error, no list fallback). Tested (`admin-dashboard.component.spec.ts`). No permission tiers invented (row 77).

### p-refunds: FAIL
1. **Blocker** `apps/admin/src/app/features/admin/panels/refunds.panel.ts:127`. Spec (`p-refunds.md` Layout, corrected this round): the `Refundable` column shows the review's ceiling, net of earlier refunds on the task (row 87). On `feat/api-owner-answers-4` that is `refundCeiling` while `pending_review`; `amountPaid` stays the review's gross basis. Code: `formatKshExact(r.amountPaid)`, so a pending cancellation review on a task that already had a decrease refunded shows more than an admin can approve, under a header that says `Refundable`. Fix: show `reviewCeiling(r)` (move the helper from `refund-drawer.ts` to a shared module such as `refund-labels.ts` and import it in both places; no copy), keeping the `amountPaid` fallback with `TODO(owner-answers-4)`; add a test with `amountPaid` 1,500 / `refundCeiling` 1,200 → `KSh 1,200`. This follows the spec's own earlier wording ("`amountPaid` = the ceiling"), which assumed N-9 would net `amountPaid`; the API added a separate field instead.

Everything else in the round-3 list is built: header `Refundable`, Needs-review empty text, the title from the embedded `errand` (no last-100 lookup).

### drawer-refund (+ refund link): PASS
- Rows 81/87, SA-1: `Already refunded on this task` (API `alreadyRefunded`, else summed from `otherReviews`, only when > 0) and `Refundable in this review` (600 weight, when the ceiling differs from `totalPaidToNitume` by a cent or more). Hint, `Full refund`, validation and the `refund_exceeds_amount_paid` field error use the ceiling with the spec copy `The refund can't be more than the KSh {x} refundable in this review.` Tested.
- Row 82: refunded Payout card read-only, no input or edit control (tested); amounts `KSh` (tested); runner drawer's private formatter replaced by `formatKsh`.
- SA-2: link from PAYMENT_CONFIRMED on, `GET /errands/:id/refunds` only, one row per review, hidden when empty, `Couldn't load refunds.` + `Try again` on error (tested, incl. no call before payment).

Judgements requested by the orchestrator:
- **`remainingRefundable` not displayed: accepted.** It is task-level and counts this review's own approved amount, so on a decided review it repeats `Already refunded` plus the decision; the admin acts on `refundCeiling`. It is the customer view's figure. Recorded in `drawer-refund.md` Layout 2.
- **409 `refund_payout_locked` copy `This refund was already marked as sent. Its receipt can't be changed. Showing the latest.`: accepted** as written (matches the `refund_not_approved` / `refund_already_decided` pattern and row 82). Added to `drawer-refund.md` Error codes.
- **EXPIRED tasks get the refund link: accepted; the spec was wrong.** §3.3 reaches EXPIRED only from RUNNER_ASSIGNED, so every EXPIRED task was paid; the spec's "EXPIRED tasks that never reached payment" described a transition that does not exist. `drawer-refund.md` now lists EXPIRED. This surfaced **AQ-8** (below): the API opens a refund review only on CANCELLED, so a paid EXPIRED or FAILED task gets none.

### drawer-task-requote: PASS (minors)
- Row 68: flag chip `New quote requested` + `Customer asked for a new quote {date, time}.` (time Fira Code) when `quoteRequestedAt` is later than the newest quote, QUOTED/ACCEPTED only; queue shows the flag instead of `Quote expired`, sorts requested rows first, the `Task queue` badge counts them. Store patch clears it after a quote. Tested.
- Row 83: `Valid until` required in both modes, default now + 24 h EAT, always sent. Tested.
- **Row-72 check removed in `1f24c63`: accepted.** The removed code feature-detected the round-3 API through `quoteAcceptanceRequired`; that API (`REQUOTABLE` = QUOTED, ACCEPTED, with the `payment_in_progress` guard) is on `main`, so `canRequote` offering `Issue new quote` on any expired ACCEPTED quote is correct. Tested.
- **Quote-requested flag/sort/badge only from the loaded 100 tasks: accepted for this round.** It is the same source as every shell badge, the spec asked for no filter or count, `main` would reject the new `quoteRequested` query param (`forbidNonWhitelisted`), and the admin app has no socket client. Risk: a request on a task older than the newest 100 is not flagged. Deferred as m-8.

6. m-6 (minor) `quote-dialog.ts:336-339`. **Builder copy for 400 `quote_expiry_in_past` replaced.** Spec now: A-11 danger `The expiry time has passed. Choose a later time.` with field error `Choose a time in the future.` on `Valid until`. Code shows `Check the amounts and the expiry time.`, which points at amounts that are fine. Fix: the new notice text; keep the field error. Update the test.
7. m-7 (minor) `quote.section.ts:257-270`. Spec now lists 409 `payment_in_progress` (re-quote of an ACCEPTED task whose customer started paying; reachable on `main` since the gate was removed). Code shows `This task changed while you were editing. Showing the latest.` Fix: A-11 info `The customer has started paying this quote, so it can't be replaced now. Showing the latest.` after reloading; add a test.
8. m-8 (minor, deferred to the `TODO(owner-answers-4)` cleanup after the API merges) `admin-data.service.ts` / `task-queue.panel.ts`: merge `GET /errands?quoteRequested=true&limit=100` into the queue (dedupe by id) and take the requested part of the badge from `GET /errands/count?quoteRequested=true` (`drawer-task-requote.md` Data).

### drawer-task-merchant-details: PASS (minor)
- Row 80 built: editable only for `buy_for_me` / `pickup_delivery` in non-terminal states; other categories with legacy data read-only with `Merchant details only apply to Buy For Me and Get It For Me.`; 400 `merchant_details_not_applicable` switches to read-only. Tested both category groups.

9. m-9 (minor, spec correction) `merchant-details.section.ts:296-299` (dialog body) and `:110-117` (`savedCopy`). The API sends `merchant_details.changed` only when a `merchant_direct` payment has started (`merchant-details.watcher.ts`), and the admin can't see that. The spec copy the builder used ("We'll tell them…", "The customer has been told…") over-claims for a paid task whose customer hasn't paid the merchant. Spec now: body `… If they've started paying the merchant, we'll tell them the details changed so they check before paying.`; notice `Merchant details updated. If the customer had started paying the merchant, they've been told to check them.` Fix: those two strings and their tests.

### drawer-dispute-outcome: PASS
`dispute-drawer.ts`: Outcome falls back to the dispute's `verdict` / `resolvedAt` / `resolution` when no history row left DISPUTED; 409 `errand_not_disputed` (or a task no longer DISPUTED) reloads and shows the outcome with `This dispute was already resolved. Showing the outcome.`; a 409 without a code on a still-disputed task shows the note error. Tested. Spec updated to describe both.

**Customer side of row 79**: the owner's answer is about the resolution **note**, which `x-report-problem` already shows under `Outcome`. It does not ask for the verdict to be named to the customer, so no customer copy is added; the outcome is carried by the errand chip (`Completed` / `Cancelled`), the dispute chip `Resolved`, the note, and the refund group on `v-task-detail`. Recorded in `docs/specs/customer/x-report-problem.md`.

### Builder list (web-parity, same branch)
1. p-refunds blocker 1 (required for PASS).
2. m-6, m-7, m-9 now (small, same files are open).
3. m-8 and every `TODO(owner-answers-4)` once `feat/api-owner-answers-4` is on `main`.

### Questions for the owner (new)
- **AQ-8 (payments, schema)**: a paid task can end EXPIRED (no runner accepts) or FAILED (RUNNER_EN_ROUTE → FAILED), but the API opens a refund review only on CANCELLED. Should EXPIRED and FAILED after payment open a refund review too (new trigger values: an enum change)? Nothing is built for it.

### Round 2 (2026-10-09): p-refunds re-audit and minor spot-checks

Audited `fix/angular-admin-owner-answers` @ `c1630ec` (`0592e9f`, `d84b2aa`, `1c87c75`, `c1630ec` on top of `f1323de`). From a `git archive`: `ng test` **139 tests pass** (18 files), `ng build` clean, Prettier clean on the changed files, no hex outside `_tokens.scss`.

| View | Verdict | Notes |
|---|---|---|
| p-refunds | **PASS** | Blocker 1 closed: `refunds.panel.ts:127` shows `reviewCeiling(r)`; the helper moved to `features/admin/refund-labels.ts` and the refund drawer imports it (no copy). Test covers a pending row (`refundCeiling` 1,200 under `amountPaid` 1,500 → `KSh 1,200`) and a decided row (`amountPaid`). |
| drawer-task-requote | PASS | m-6 closed (`quote-dialog.ts:338`, `The expiry time has passed. Choose a later time.`; test also asserts the old text is gone). m-7 closed (`quote.section.ts:267-273`, `payment_in_progress` copy after the reload; new test). m-8 stays deferred to the `TODO(owner-answers-4)` cleanup. |
| drawer-task-merchant-details | PASS | m-9 closed (`merchant-details.section.ts` dialog body and `savedCopy` match the corrected spec copy; both tests updated). |

Every view from this round is now PASS. Still open: m-1, m-2, m-4 (carried from the first re-audit), m-8 (after the API merge) and **AQ-8** (owner).


## Addendum 2026-10-12: owner answers round 5 (BOARD rows 95–102)

Applied on `docs/owner-answers-5` (from `main` @ `4963a1c`). Rows 97 and 99 were answered 2026-10-11 and are already built; no doc change. AQ-7 (row 96) and AQ-8 (row 102) are closed; `docs/specs/admin/_shared.md` §1 quotes the rows and §8 records the answers.

### What changed in the docs

| Row | Decision | Docs changed | Admin screen status |
|---|---|---|---|
| 95 | `send_to_runner` item amount reimbursed to the runner after the receipt is accepted, never advanced | system design §2.2, §6; `_shared.md` §3; drawer-refund (Resolved) | no admin UI change |
| 96 | Admin times in 12-hour EAT; backend timestamps stay canonical UTC ISO-8601 | `_shared.md` §3.1 (new), A-13 | app-wide: one fix (`live-map.panel.ts`), panels unchanged |
| 98 | API single-instance, no Redis adapter | system design §4.1; `_shared.md` §7 (note) | — |
| 100 | Auditable payout correction/reversal records, original immutable | system design §2.2, §6; `_shared.md` §6, §7 N-15; drawer-refund ("Corrections"); p-refunds | drawer-refund, p-refunds → **partial** |
| 101 | Round-4 breaking changes accepted | system design §3.2 (note) | — |
| 102 | Paid EXPIRED/FAILED tasks open a review too: `Task expired`, `Task failed` | system design §3.3, §6; `_shared.md` §6, §7 N-16; p-refunds; drawer-refund | drawer-refund, p-refunds → **partial** |

### Builder lists

The same lists appear in the customer and admin gap reports. Order: api-contract and core-ui first, then the screen builders.

#### api-contract (`apps/api`)

1. **N-16, row 102 (schema approved)**: add `RefundTrigger` values `expired_after_payment` and `failed_after_payment` (enum migration on `refund_trigger_enum`, reversible). In `refunds.service.ts` (`onCancelled` / `onStatusChanged`, `:196-233`) open the cancellation-type review (`priceChangeRequestId` null, same unique index, same upsert) when a **paid** errand moves RUNNER_ASSIGNED → EXPIRED or RUNNER_EN_ROUTE → FAILED; same ceiling (rows 81, 87), same late-payment refresh while `pending_review`, same `refund.updated` customer notification as a cancellation review. Unpaid EXPIRED/FAILED tasks open nothing. Customer view and admin responses carry the new trigger values. Tests: paid EXPIRED, paid FAILED, unpaid EXPIRED (no review), late STK after EXPIRED.
2. **N-15, row 100 (schema approved)**: table `refund_payout_corrections` and `POST /refunds/:id/corrections` exactly as `docs/specs/admin/drawer-refund.md` → "Corrections" and Data: kinds `corrected | reversed | resent`, required reason (5–500), snapshot of the previous effective payout, `createdByUserId`, append-only (no update/delete path; DB guard recommended), optimistic check `expectedLatestCorrectionId`, reference uniqueness across payouts and corrections, `newAmount` ≤ `correctionCeiling`. Responses: `corrections[]` (detail), `effectivePayout` (list and detail), `correctionCeiling` (detail). `GET /refunds?status=approved` also returns refunded reviews whose effective payout is reversed. The `refund_reviews` payout columns stay locked (`refund_payout_locked` unchanged). Error codes `refund_not_refunded`, `payout_correction_conflict`, `payout_correction_kind_invalid`, `payout_reference_reused`, `correction_no_change`, `refund_exceeds_amount_paid` (with `correctionCeiling`).
3. **Row 100, customer view**: `toCustomerView` returns the **effective** payout: reversed and not re-sent → `status: approved`, `paidAt: null`; otherwise `refunded`, `refundAmount` = effective amount, `paidAt` = latest sent time. Never corrections, reasons, receipts or admin ids. Cumulative cap (row 87, `alreadyRefunded`) uses effective amounts. Notification only on `resent` (AQ-9 default). Tests for each case.
4. **Row 95, runner reimbursement**: today no item amount is paid or recorded for the runner before CONFIRMED (`settleErrand`, `payments.service.ts:1024-1072`, only transitions to SETTLED), which matches "never advanced". There is **no runner payout ledger table** yet, so the reimbursement line (system design §6 "Runner reimbursement") needs an owner-approved schema first (SQ-15). Build nothing that writes money records for it until then. When approved: at CONFIRMED → SETTLED write a separate `item reimbursement` line for `send_to_runner` errands (item amount paid to Nitume, plus completed increases, minus approved/sent decrease refunds), only when a `receipt` evidence exists (else flag for ops, SQ-13), and extend reconciliation. Keep the internal word `released` (`settleErrand` return value) out of any user-facing text.
5. **Row 98**: keep one API instance; do not add `@socket.io/redis-adapter`. If any deployment config or doc allows more than one replica, set it to one and note why.
6. **Row 101**: no work (accepted as built).
7. N-2 (admin names for `createdByUserId` on corrections) when convenient.

#### core-ui (`packages/nitume_core`)

1. **Row 102**: `RefundTrigger` (`lib/src/models/enums.dart:436-443`): add `expiredAfterPayment('expired_after_payment')` and `failedAfterPayment('failed_after_payment')`; `CustomerRefund` parsing tests for both.
2. **Row 100**: nothing (the customer view keeps its shape; `CustomerRefund` already has `status`, `refundAmount`, `paidAt`). Do not add correction fields.
3. Rows 95, 96, 98, 101: nothing.

#### flutter-customer (`apps/customer_app`)

1. **Row 102, v-task-detail**: `RefundGroup` (`lib/src/widgets/task_widgets.dart:138-160`): the `pending_review` line follows the trigger (`docs/specs/customer/_shared.md` §11): `expired_after_payment` → `We couldn't find a runner for this task in time. We're reviewing a refund and will let you know the outcome.`; `failed_after_payment` → `This task couldn't be completed. We're reviewing a refund and will let you know the outcome.`; others unchanged. No copy may call it automatic. Needs core-ui item 1.
2. Tests: paid EXPIRED task with a pending review (receipt as paid, expired line); paid FAILED task (failed line); EXPIRED task with no review (no refund group); a refund that comes back `approved` after having been `refunded` (reversal, row 100) renders `Refund approved` without error.
3. Rows 95, 100 (beyond test 2), 101: no change.

#### web-parity (`apps/admin`)

1. **Row 102, labels**: `features/admin/refund-labels.ts:4-9`: add `expired_after_payment: 'Task expired'`, `failed_after_payment: 'Task failed'`; extend the `RefundTrigger` type in `core/api-types.ts`. Test both labels in the panel and the drawer.
2. **Row 102, copy**: `p-refunds` empty states for `Needs review`, `Payout due`, `All statuses` (`docs/specs/admin/p-refunds.md` Copy).
3. **Row 100, panel** (after api-contract item 2): Status chip `Payout reversed` (amber) and row button `Record payout` when `effectivePayout.state === 'reversed'`; one helper in `refund-labels.ts`, used by panel and drawer.
4. **Row 100, drawer** (after api-contract item 2): the "Corrections" section of `docs/specs/admin/drawer-refund.md`: Current payout card, `Original payout` label, correction cards (one reusable component), inline form with the A-09 kind toggle (`corrected`/`reversed`) or the `resent` form, validation table, A-08 dialogs, A-11 notices, error mapping, Activity items, `expectedLatestCorrectionId` on submit. Tests: each kind, the conflict reload keeping the reason, the reused-receipt field error, no edit/delete control on cards, the original card unchanged after a correction.
5. **Row 96**: `features/admin/panels/live-map.panel.ts:148-151` formats the sync time with `toLocaleTimeString('en-KE', …)` and no `timeZone`, so it shows the browser's zone. Use the A-13 EAT helper (12-hour, `Africa/Nairobi`). Check that no other absolute time bypasses `shared-format.ts` (`_shared.md` §3.1); add a test that pins a non-EAT zone.

### Questions for the owner (new)

- **SQ-12 (payments, row 95)**: what makes the runner's receipt "accepted"? Proposed default: the task reaches CONFIRMED (customer confirmed and the dispute window closed with no dispute, or a runner-favourable dispute's new window closed); the reimbursement is paid in the next batched payout with the runner fee. Alternative: on customer confirmation (COMPLETED), or after an admin checks the receipt.
- **SQ-13 (payments, row 95)**: no receipt uploaded, or a receipt for a different amount: default, the item line is not payable until ops review it, and the reimbursement never exceeds the item amount the customer paid to Nitume (net of decreases).
- **SQ-14 (payments, row 95)**: the runner bought the item but the task then ends CANCELLED (price-change reject, customer-favourable dispute) or FAILED, and the customer may get the item amount refunded (row 81). Is the runner still reimbursed for the purchase, and by whom? No default; nothing is built for it.
- **SQ-15 (schema, row 95)**: there is no runner payout ledger table in the API. Approve a schema (e.g. `runner_payout_lines`: errand, runner, kind `runner_fee | item_reimbursement`, amount, payable-at, paid-out reference/time) so the reimbursement can be recorded?
- **SQ-16 (payments, row 95)**: since the runner pays out of pocket first, is a `send_to_runner` purchase limited by `runner_profiles.max_purchase_advance`, and may a runner decline a task whose item amount is above their limit?
- **AQ-9 (payments, row 100)**: customer notification on a correction or reversal. Default: only a new payout after a reversal notifies (`Refund sent`).
- **AQ-10 (payments, row 100)**: a correction amount above the review's ceiling (an over-payment): default refused, handled outside the app.


## Re-audit round 5 (2026-10-12): `fix/angular-admin-owner-answers-5`

Audited `fix/angular-admin-owner-answers-5` @ `053fbc6` (9 commits on `main` @ `2c7251a`: `1d3da2b`, `c333cd8`, `16ad907`, `6f7f39d`, `6eef84e`, `053fbc6`, `c42aff3`, `311c989`, `5f4d4ba`) against the round-5 specs on `docs/owner-answers-5` and the round-4 cleanup / m-8. From a `git archive` of `apps/admin`: `ng test` **176 tests pass** (21 files), `ng build` clean, Prettier clean on the 27 changed files, no hex outside `_tokens.scss`, no `font-family` outside the token variables, no forbidden words, no `TODO(owner-answers-4)` left. The builder's commits touch no docs. The API round-5 fields (`effectivePayout`, `corrections[]`, `correctionCeiling`) are typed optional with `TODO(owner-answers-5)` while `feat/api-owner-answers-5` is unmerged: accepted. Field names, error codes and the corrections endpoint (201 with the updated detail) were checked against that branch with `git show`.

| View | Verdict | Findings |
|---|---|---|
| p-refunds | **PASS** | none |
| drawer-refund (Corrections, row 102 labels) | **PASS** | m-10, m-11 (minor) |
| drawer-task-requote (m-8, `Valid until` UTC) | **PASS** | m-8 closed |
| `_shared.md` §3.1 EAT (app-wide) | **PASS** | none |
| drawer-dispute-outcome (affected by the A-06 hint change) | **PASS** | m-12 (minor) |

### Decisions on the points raised by the builder

1. **`status=QUOTED,ACCEPTED` on the m-8 calls: accepted, and required.** `main`'s `ErrandStatusFilterDto` accepts `status=A,B`. The API clears `quoteRequestedAt` only when a new quote is issued (`errands.service.ts:1135-1138`), so a task cancelled or expired after the request keeps the timestamp; without the filter the count would include those tasks and the badge would over-count. The filter makes the server match the client rule `quoteRequested()` (`admin-data.service.ts:57-59`). Written into `drawer-task-requote.md` Data.
2. **Correction discard copy `Discard this correction?` / `What you entered will be lost.` (buttons `Back` / `Discard`): accepted.** The decision wording (`The amount and note…`) does not fit a receipt + amount + reason form. Written into `drawer-refund.md` Entry / exit and Corrections → Form. The `resent` form having no `Cancel` (it is the standing action while reversed, like the `approved` payout form) is also accepted and written in.
3. **Focus not moving into the new-payout form on a reversed review: spec gap, minor (m-10).** The builder followed the spec's wording ("the close button otherwise"), so this does not fail the view. The reversed state is the `approved` state's equivalent (it sits under `Payout due` with `Record payout`), so the spec is amended: focus goes to the new payout's `M-Pesa receipt` input on open, reload and right after `Record reversal`; and closing the correction form returns focus to `Record a correction`.
4. **`app-form-field` hints rendering numbers in Fira Code app-wide: accepted** (`_shared.md` A-06 updated). It is what the refund hints need (`Between KSh 0 and KSh 1,200…`, `Current: SLK4H7XQ2P`, `Up to KSh …`). I checked every hint in the app: `East Africa Time`, `Only if the merchant gave you one.`, `Not shown to the customer.`, `The code M-Pesa gave for the reversal.` and `Kept in the audit history…` have no digits. The one false positive is m-12.
5. **`Valid until` sent as UTC `…Z`: accepted.** `_shared.md` §3.1 says the client converts to a UTC ISO string; `eatLocalInputToIso` (`shared-format.ts:150`) now returns `Date#toISOString()` (12:00 EAT → `09:00:00.000Z`), the API's ISO validation accepts it, and the tests pin a non-EAT process zone. §3.1 now names the format.

### p-refunds: PASS
- Row 102: `Task expired` / `Task failed` in the one shared map (`refund-labels.ts:5-12`); `Needs review`, `Payout due` and `All statuses` empty states match Copy (tested).
- Row 100: `refundChipStatus` / `refundRowAction` (`refund-labels.ts:79-92`) give `Payout reversed` (A-02 `payout_reversed`, pending tone, `status-chip.component.ts:83-92`) and `Record payout` for a reversed payout; a sent payout with corrections still reads `Refunded`; a drawer save patches `effectivePayout` in place (`refunds.panel.ts:186-198`). Tested.

### drawer-refund: PASS (minor)
- Corrections (row 100) built as specced: `Current payout` card (chip, `Amount sent` `KSh 0` and receipt `—` after a reversal, `Last changed`), `Original payout` card unchanged (tested), oldest-first `app-refund-correction-card` (one component, no edit/delete/undo, `→` in Fira Sans, reason wraps; tested per kind), inline form with the A-09 toggle (reason kept, other fields cleared; tested), `resent` form prefilled with `refundAmount`, validation table (`refund-correction.ts`, unit-tested), the three dialogs, the three notices, every error code including the conflict reload that keeps the reason (tested), Activity items, `expectedLatestCorrectionId` on every save.
- Row 102 labels and row 96 times: from the shared helpers.

10. m-10 (minor, accessibility) `drawers/refund-drawer.ts:996-1002` (`focusForm`), `:1083` (`cancelCorrection`), `:1121` (discard). Spec (amended): on a reversed payout focus goes to the new payout's `M-Pesa receipt` input on open, reload and after `Record reversal`; closing the correction form returns focus to `Record a correction`. Code: focus goes to the close button on a reversed review; after `Cancel`/`Discard` the focused button disappears and focus drops to the document. Fix: include `correctionReferenceInput` in `focusForm()` when `reversed()`; focus the `Record a correction` button after `resetCorrection()` from Cancel/Discard; add tests.
11. m-11 (minor, typography) `refund-drawer.ts` correction dialog body (`app-num-text` on `correctionDialogBody()`) and the `Correct M-Pesa receipt` hint. Spec: every receipt and reversal code in Fira Code. Code: the receipt reaches Fira Code only through the `app-num-text` regex, which needs six or more characters with both a digit and a letter; the API accepts 4–64 character codes, so `AB12` or an all-letter code renders in Fira Sans. Real 10-character M-Pesa codes match, so this is an edge case. Fix: render the receipt as its own `.num` part, as the `mark_paid` dialog already does.

### drawer-task-requote: PASS
- m-8 closed (`5f4d4ba`): `refreshQuoteRequests()` (`admin-data.service.ts:316`) on load and refresh; `queueTasks` merges and dedupes; `pendingCount` adds the count endpoint's requested part to REQUESTED/QUOTED rows that are not requested (no double count); on an error each part keeps its last value; an answered request leaves the badge at once. Tested, with the query params asserted.
- Row 96: `Valid until` UTC (decision 5); the dialog's expired-quote time carries `EAT` (`formatDateTimeEat`).

### `_shared.md` §3.1 EAT (app-wide): PASS
- `live-map.panel.ts` sync time now `formatTime` (EAT); `Today` KPI, daily bars and Monday-start weeks on the EAT calendar (`admin-data.service.ts` `lastNDates` / `lastNWeeks`, `eatDayKey`, `eatWeekday`); `formatDateTime` adds the year outside the current EAT year. No `toLocale*Time`, `toDateString` or local `getHours/getDate` calls remain in app code. Tests switch the process zone to `America/Los_Angeles` (`testing/admin-test-utils.ts` `timeZoneSwitch`).

### drawer-dispute-outcome: PASS (minor)
12. m-12 (minor, typography) `drawers/dispute-drawer.ts:200`. Spec: Fira Code for numeric data only (the counter `0/2000`). Code: since `6f7f39d` the hint `At least 20 characters. The customer and runner can see this note.` renders `20` in Fira Code; it is a rule, not data. Fix: a plain-text opt-out on `app-form-field` (e.g. a `plainHint` input) used by this field.

### Carried minors
m-1, m-2, m-3, m-4, m-5 (first re-audit) are closed at `053fbc6`: tests for m-1 and m-2 exist, `detailErrorTone` carries the 404 info tone, the dispute notice sits under the Outcome card, `.row-assign` is declared once. m-6 … m-9 were closed earlier.

### Notes for the orchestrator and reviewer
- The worktree `/Users/san/Projects/nitume-admin-answers5` has **uncommitted** copies of the round-5 docs (`docs/specs/**`, `docs/audits/**`, `SCREEN_MAP.md`, `Nitume_System_Design.md`, customer specs). They are not in any commit on the branch; they must not be committed there (the `docs/owner-answers-5` branch owns them). Discard them before the branch is handed to the reviewer.
- The `TODO(owner-answers-5)` markers (`core/api-types.ts:324`, `:412`; `refund-labels.ts:56`; `refund-drawer.ts:817`, `:830`) go once `feat/api-owner-answers-5` is on `main`; until then `correctionCeiling` falls back to `amountPaid` (not net of other reviews). The API enforces the real ceiling and the drawer maps the 400.
- The API also defines `payout_amount_not_allowed` (an amount sent with `reversed`). The client never sends one, so the generic 400 path is enough.

### Builder list (web-parity, next touch; none blocks the merge)
1. m-10 focus on the reversed payout form and after closing the correction form.
2. m-11 receipts as explicit Fira Code parts in the correction dialog and hint.
3. m-12 plain-text hint opt-out for the dispute note.
4. Remove `TODO(owner-answers-5)` and make the N-15 fields required once `feat/api-owner-answers-5` is on `main`.
