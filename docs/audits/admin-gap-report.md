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

## Owner answers round 6 (rows 104–111, applied 2026-10-13 on `docs/owner-answers-6-runner-specs`)

- Rows 104–108 (SQ-12 … SQ-16): runner reimbursement at CONFIRMED; missing/mismatched receipt → ops review, capped at the item amount paid to Nitume; verified item spend reimbursed on CANCELLED/FAILED with no runner fee; runner payout ledger table approved (`runner_payout_lines`, system design §2.2, being built by api-contract on `feat/api-owner-answers-6`); purchases limited by `max_purchase_advance` with the right to decline. System design §2.2/§6 updated. No admin screen is specced for the ledger yet: an ops view of `on_hold` reimbursement lines (rows 105, 106) will need a spec once the API exists (listed as RQ in `docs/audits/runner-gap-report.md`).
- Row 109 (AQ-9) and row 110 (AQ-10): decided as the defaults already built (API `refunds.service.ts:917` notifies only on `resent`; `correctionCeiling` refuses higher amounts). `drawer-refund.md` and `_shared.md` updated; no builder work.
- Row 111: a reversed, not-yet-re-sent payout counts at its decided `refundAmount` in the cumulative cap; already built (`committedAmountOf`, `refunds.service.ts:120`). No builder work.

No admin status changes.

## Re-audit round 6 (2026-10-13): `fix/angular-admin-owner-answers-6`, round-5 item 4

Audited `fix/angular-admin-owner-answers-6` @ `817d5fc` (1 commit on `main` @ `95e9d6c`), read-only, against round-5 builder list item 4 ("Remove `TODO(owner-answers-5)` and make the N-15 fields required once `feat/api-owner-answers-5` is on `main`"). From a `git archive` of `apps/admin`: `ng test` **182 tests pass** (21 files), `ng build` clean, Prettier clean on the 6 changed files, **no `TODO(` markers left** in `apps/admin/src`. The commit touches only `apps/admin` (no docs).

| View | Verdict | Findings |
|---|---|---|
| p-refunds | **PASS** | none |
| drawer-refund | **PASS** | none new (m-10, m-11 still open) |

- `core/api-types.ts:326`, `:413-415`: `RefundReview.effectivePayout: EffectivePayout | null`, `RefundDetail.corrections: RefundPayoutCorrection[]`, `correctionCeiling: string | null` are required. Checked against `main`'s API: `AdminRefundReview` carries `effectivePayout` on list, detail, decision, mark-paid (`refunds.service.ts:220`, `:532`, `:735`, `:773`) and `AdminRefundDetail` carries `corrections` and `correctionCeiling` (`:262-268`, `:497-500`). Types match.
- The pre-N-15 fallbacks are gone: the derived `effectivePayout()` helper (`refund-labels.ts`), the `amountPaid` ceiling fallback in the drawer and in the `refund_exceeds_amount_paid` handler. The drawer now reads `review().effectivePayout` and `review().correctionCeiling ?? '0'`; `'0'` is only reached when the review is not refunded, where the correction form is not shown. The 400 handler still prefers the API's `correctionCeiling` extra. `refunds.panel.ts:194` patches `effectivePayout` unconditionally after a drawer save (every save response carries it).
- `refundChipStatus` / `refundRowAction` / `payoutReversed` take the required field; fixtures give the API shapes (`effectivePayout: null` for unrefunded, a `sent` payout for refunded). Row-100 behaviour (`Payout reversed` chip, `Record payout` action) unchanged and still tested.

Round-5 builder list: item 4 **closed**. Items 1–3 (m-10, m-11, m-12) remain open minors; none blocks a merge.

## Audit round 6: runner payouts (2026-10-14), `feat/admin-runner-payouts`

Audited `feat/admin-runner-payouts` @ `04837b4` (8 commits on `main` @ `cd22e4d`: `73034bf`, `dc44a7b`, `5f1f75d`, `12aef17`, `dd0ee44`, `60d8442`, `acce986`, `04837b4`), read-only. Specs: `docs/owner-answers-6-runner-specs` @ `915f920`. The commits touch only `apps/admin`. From a `git archive` of `apps/admin`: `ng test` **220 tests pass** (25 files), `ng build` clean, Prettier clean on every changed file. Searches: no hex outside `_tokens.scss`, no `font-family` outside the token variables (`inherit` only), and none of the `_shared.md` §3 banned words in user-facing copy (`on_hold` and `/hold` appear only as API values).

| View | Verdict | Findings |
|---|---|---|
| p-runner-payouts | **PASS** | m-13 (minor) |
| drawer-runner-payout (+ SA-3 task drawer section, `View payouts` on the runner drawer) | **PASS** | none |
| drawer-refund, row-136 amendment (task exposure card, override form with scope labels, override history) | **PASS** | none new (m-10, m-11 still open) |

### p-runner-payouts: PASS
- `Payments` nav item `Runner payouts` with the `on_hold` count badge (`99+`); three filters (runner, type, status, default `Needs review`), `↻ Refresh`, columns, chip and reason caption, row actions `Review` / `View` / `Re-send`, `requested` caption, load more, empty / loading / error copy, sub-line counts and `Payable` total all match the spec. `Created` and `Type` hide at 1100 / 900 px.
- A-16 (`shared/batch-bar.component.ts`): checkboxes only in `Payable` with one runner chosen; a reversed (stored `paid`) line can't be selected; 50-line limit notice; polite live total. The record payout dialog fetches the runner's phone, validates the receipt, maps `payout_reference_reused`, `runner_payout_not_payable` / `runner_payout_locked` / 404 (reload + notice), `runner_payout_mixed_runners`, 403; rows patch in place and the badge refreshes.
13. m-13 (minor) `panels/runner-payouts.panel.ts:367-372`. Spec: searchable runner filter. Code: plain `select`; runners with no loaded line show `Runner …abcd` because `GET /runners` returns no names. Fix: a typeahead, or names on `GET /runners` (needs api-contract), then label every option.

### drawer-runner-payout: PASS
- Sections 1–10 as specced: summary with `Why it needs review`; amounts with `Most you can approve` (`approvalCeiling`); task exposure on item lines; receipt thumbnail with the runner's or the system note; review form with the approve/reject toggle, `Full amount`, the `reimbursement_exceeds_cap` caption from `itemPaidToNitume` / `maxPurchaseAdvance`, and the reject reason; the `price_decrease_pending` notice with `Open refund review`; the payout form; `Send back for review` with focus return; read-only decision and payout; current / original payout; corrections through the **shared** form and cards (refund-correction code moved to `features/admin/payouts/`, no copy); activity.
- Row 136: `app-task-exposure-card` (figures + `Cap overrides`) and `app-exposure-override-field` (409 figures labelled by scope, required note 10–500, `exposure_override_note_invalid`, label `Approve over the cap`, confirm line). Task and item scope are both tested.
- SA-3: `payouts/runner-payouts-link.section.ts` in the task drawer for CONFIRMED, SETTLED, CANCELLED and FAILED tasks, hidden without lines; `View payouts` on the runner drawer opens the panel filtered to that runner.

### drawer-refund row-136 amendment: PASS
- Task exposure card (reimbursement row only when > 0) and override history after `What the customer paid`; override field in the decision form and in the correction form (`over the cap` labels, confirm line, hint `… Not shown to the customer.`). The one-note design matches the API (one `exposureOverrideNote` per request applied to every binding scope); the spec's "its own note" wording was wrong and is corrected.

### Decisions on the builder's additions
- (a) Accepted and written into `drawer-runner-payout.md`: `Enter an amount in KSh, up to 2 decimal places.`, `Say why in 5 to 500 characters.`, `Reimbursement approved: KSh x. Record the payout once you have sent it.`, `Reimbursement rejected.`, `Sent back for review.`, and the single-line `Mark as paid` confirm (`Mark KSh x as paid?` / `M-Pesa receipt R. This can't be undone; a later change is recorded as a correction.`), which matches the batch and refund payout flows. The panel's two fallback error strings are accepted in `p-runner-payouts.md`.
- (b) `GET /runner-payouts/summary` does **not** go on p-runner-payouts (it already shows the loaded `Payable` total and the batch total; a second set of all-rows totals next to a filtered list would confuse). It is specced as a `Payouts` section of the runner drawer in `drawer-runner-purchase-limit.md` (`Owed now`, `In review`, `Waiting for confirmation`, `Paid so far`), not built yet.
- (c) Runner Android foreground notification: title `Nitume Runner`, text `Sharing your location for your active job.` confirmed as final in `docs/specs/runner/_shared.md` §10 and `x-location-disclosure.md`. It is valid because background collection runs only during a job; the online-only 30 s pings are foreground and show no notification.

### Builder list (web-parity, next touch; none blocks the merge)
1. m-13 runner filter names / search.
2. Runner drawer `Payouts` summary section (new, `drawer-runner-purchase-limit.md`), together with the purchase-limit section once N-19 exists.
3. Carried: m-10, m-11, m-12.

## Owner answers round 7 (rows 140–144, 146, 2026-10-16), applied on `docs/owner-answers-7-specs`

Spec-only update; no admin code read beyond `feat/admin-runner-payouts` @ `04837b4` (read-only) for the conflict check. Full list and the System Design edits waiting on row 147: `docs/audits/runner-gap-report.md` §10.

### What changed in the admin specs
- `drawer-runner-payout.md`: row 142 purchase-limit exception (§5 2b: `Approve above the purchase limit`, required `Why pay above the purchase limit?` 10–500, `Approve above the limit · KSh {amount}`, confirm line; read-only exception rows in §7; activity entry); `With a purchase-limit exception` amount row; `Change` link next to the purchase limit dropped (raising the limit is not the mechanism). Status `matches-design` → `partial`.
- `drawer-runner-purchase-limit.md`: confirm body `It applies to new offers and new purchases. To pay one purchase above the limit, use the exception on that reimbursement.`; no entry from the payout drawer.
- `p-payout-requests.md`: row 146 decided: `requestedAmount` and `paidAmount` stored and shown separately (table `Paid` column, read-only rows, activity), below-request caption and confirm, request closes `paid`; AQ-11 closed. Row 143: no payout time anywhere.
- `p-runner-payouts.md`, `drawer-dispute-outcome.md`: notes only (rows 146, 140).
- `_shared.md`: decision rows 140–144, 146; N-17 (two amounts), N-20 (offer expiry; auto-offers fall through, row 150; admin-offer lapse decided in round 9, row 157: the task stays RUNNER_ASSIGNED), new N-21 (purchase-limit exception API); §8 AQ table.

### drawer-runner-payout: conflict with the build (`feat/admin-runner-payouts`)
14. **blocker (when N-21 lands)** — `runner-payout-drawer.ts:219-222`, `:300-335`, `:1124-1132`. Design (row 142): an ordinary approval up to `approvalCeiling`, plus an explicit, recorded exception up to `overLimitCeiling` with a required reason (§5 2b, §7, §10). Code: only the ordinary path. Fix: add the exception action, the note field (reuse the `app-exposure-override-field` pattern as a shared component, no copy-paste), the label/confirm changes and the read-only rows once the API exposes `overLimitCeiling`, `purchaseLimitOverride` and `purchaseLimitOverrideNote`.

### Builder lists
- api-contract: N-21 / RA-25 (purchase-limit exception, storage per the owner's answer); N-17 / RA-15 with `requestedAmount` + `paidAmount`; N-20 / RA-26 (offer expiry as amended in round 8 below).
- web-parity: item 14 after N-21; `p-payout-requests` after N-17.

### Questions for the owner (new)
- Row 142 follow-ups → answered 2026-10-16 by rows 151 (storage in `task_exposure_overrides`) and 152 (no: the limit stored at creation applies).
- Row 141 follow-up → answered 2026-10-16 by row 150 (auto-offers keep the fall-through); admin-offer lapse is row 157, answered in round 9 (task stays RUNNER_ASSIGNED).

## Owner answers round 8 (rows 150–156, 2026-10-16), applied on `docs/owner-answers-8-specs`

Spec-only update. Row 157 was open (answered in round 9, below). Full list, API items and the System Design edits (replacing the round-7 list): `docs/audits/runner-gap-report.md` §11.

### What changed in the admin specs
- `_shared.md`: decision rows 150–157; N-20 rewritten (admin-offer lapse held as built at the time, superseded by row 157 in round 9; auto-offer fall-through row 150; decline row 155; null deadline row 156; `errand.EXPIRED` customer notification); N-21 now carries the row-151 storage and record fields (`errandId`, `assignmentId`, `runnerProfileId`, `limitAtTime`, `requestedAmount`, `approvedAmount`, `amountAbove`, `note`, `createdBy`, `createdAt`) and the row-152 stored limit (`purchaseLimitAtCreation`, `currentPurchaseLimit`); N-17 notes row 153; new N-22 (OTP email says 5 minutes); §8 open list reduced to rows 145/157.
- `drawer-runner-payout.md`: Amounts show `Purchase limit for this line` (stored limit) and, when different, `Runner's current limit` with a caption; 2b A-11 and confirm use the stored limit, Fira Code spans stated; §7 read-only exception rows add `Requested`, `Approved`, `Recorded`; Data and open questions updated (rows 151/152 answered).
- `drawer-runner-purchase-limit.md`: A-08 body `It applies to new offers and to reimbursements created from now on.`; open question closed (row 152).
- `p-payout-requests.md`: row 153 noted; Fira Code spans stated in the §2 and §4 captions; §4 caption templated `KSh {requestedAmount − paidAmount}`.

### drawer-runner-payout: conflict with the build (`feat/admin-runner-payouts`)
15. **blocker (when N-21 lands)** — `runner-payout-drawer.ts:213-218`. Design (row 152): the purchase limit shown and used is the line's stored `purchaseLimitAtCreation` (plus `Runner's current limit` when different). Code: `runner.maxPurchaseAdvance` (current limit) labelled `Runner's purchase limit`. Fix: read the line's stored limit once the API exposes it; rename the label; add the second row and caption.
Item 14 stands, with the §7 rows extended by `Requested`, `Approved`, `Recorded`.

### Builder lists
- api-contract: N-20 / RA-26 as amended; N-21 / RA-25 with the row-151 record and the row-152 column; N-17 / RA-15 (table approved); N-22 OTP copy; customer `errand.EXPIRED`.
- web-parity: items 14 and 15 after N-21.

## Owner answers round 9 (rows 145, 147, 148, 157–166, 2026-10-16), applied on `docs/owner-answers-9-specs`

Spec-only update. Full list, API items, conflicts and the System Design edits (row 147): `docs/audits/runner-gap-report.md` §12.

### What changed in the admin specs
- `_shared.md`: decision rows 145/160, 148, 157, 158, 159, 161, 162, 163, 165, 166; §6.1 payout-request chip `cancelled` → `Cancelled` and the offer chips (`Offered`, `Offer ended`, `Declined`); N-17 (built on `main`; cancel, KES 500 server config, row-165 fields), N-18 (storage approved, every task), N-20 (row 157: the task stays RUNNER_ASSIGNED; the sweep must change; EXPIRED trigger open), N-22 (OTP SMS owner wording), new N-23 (verification documents: clock, purge metadata, restricted credential); §8 rows 145 and 157 closed, new AQ-12 … AQ-16.
- `p-payout-requests.md`: rewritten. API on `main` (list, count, detail, pay, reject); status names PENDING = `requested`; new `Cancelled` filter; ops-only **cancel** (A-07 `.btn-text` `Cancel request` → required internal reason → A-08 confirm → `POST /runner-payout-requests/:id/cancel`); read-only cancelled state (`Cancelled at`, `Cancelled by`, `Reason`); Activity actor from `createdByUserId`; `Last change` = `updatedAt` (row 165); the `Minimum payout request` setting is dropped (row 159: server config, no admin UI).
- `drawer-runner-payout.md`, `drawer-refund.md`: row 145 and 148 "pending" removed (approved, no `scope`; every task). The drawer-refund need "store `scope`, then label the card by scope" is withdrawn (row 160). No UI change.
- **New** `drawer-task-offer.md`: `Runner` section of the task drawer (mockup card) with Offered / Offer ended / Declined states, `Reassign runner` (mockup label) for a RUNNER_ASSIGNED task whose offer ended or was declined, queue chips and `Reassign` row action (row 157).
- **New** `p-runners-verification-documents.md`: `View image` through the logged signed link, `Deleted {date}` for purged images with the minimum record kept, `No image on file` (rows 154, 161).

### New findings against built code (`main`)
16. **blocker** — `drawers/task-drawer.ts:22-23`, `panels/task-queue.panel.ts:136-137`. Design (`drawer-task-offer.md`, row 157): a RUNNER_ASSIGNED task whose offer ended or was declined shows that state and `Reassign runner`. Code: assign only at PAYMENT_CONFIRMED; no offer state at all. Fix: the `Runner` section and the re-offer action, after api-contract stops the sweep from expiring the task.
17. **minor** — `drawers/task-drawer.ts:305`. Design: `Offer sent to {runner}.` (the assign makes an offer, row 113). Code: `Runner assigned.`
18. **blocker** — `panels/verifications.panel.ts:63-69, 203-206`. Design (`p-runners-verification-documents.md`): `View image` through `GET /runners/verifications/:id/document` (logged, ≤ 5 min). Code: link only when `documentKey` is present (never, the API hides it) to `/api/v1/files/{key}`. Admins cannot open any image today.
19. **blocker** — `panels/verifications.panel.ts`, `core/api-types.ts:646-660`. Design: Deleted state from `purgedAt`, No image from `hasDocument`. Code: neither field is read; `submittedAt` is read but the API sends `createdAt`.
20. **minor** — `panels/verifications.panel.ts:194-201`. Design: mockup labels `National ID`, `Selfie / liveness check`, `Phone number`, `M-Pesa identity match`. Code: `Government ID`, `Driving License`, raw fallbacks.

### Builder lists
- api-contract: `runner-gap-report.md` §12 items 1–10 (N-17 cancel and fields, N-20 sweep and feed item, N-22 SMS, N-23 purge clock and metadata, `errand.EXPIRED` body).
- web-parity: items 16–20; `p-payout-requests` (whole panel) after the cancel route lands.

### Questions for the owner (new)
AQ-12 … AQ-16 (`_shared.md` §8); RQ-27 … RQ-31 in `runner-gap-report.md` §12.

## Owner answers round 10 (rows 167–171, 175, 176, 2026-10-16), applied on `docs/owner-answers-10-specs`

Spec-only update; no screen re-audited. Full list, API items and System Design edits: `docs/audits/runner-gap-report.md` §13.

### What changed
- `drawer-task-offer.md` (row 167): EXPIRED only when matching is exhausted over the task's eligible service-area/category pool; whether `deadline_at` passing while RUNNER_ASSIGNED is also a trigger was open (BOARD row 185, answered in round 11; the round-10 removal is withdrawn, see the round-10 fix below). New `Eligible runners left {n}` row on Offer ended / Declined, Reassign list = the eligible pool from the API, new read-only **Matching exhausted** state (`No runners left`, `Last offer`, `Expired at`, `Runners tried`, refund-review link), errors `matching_exhausted` / `runner_not_eligible`, feed item `matching_exhausted`.
- `p-payout-requests.md` (rows 168, 169): reason never shown to the runner; 10–500 characters after trimming, whitespace-only invalid, inline errors; open questions closed.
- `p-runners-verification-documents.md` (rows 170, 171, 175): reviewer note deleted at purge (no `Admin note` on purged cards); new **Re-review evidence** action (button, confirm, optional note, `Reviews` activity, errors), proposed `POST /runners/verifications/:id/re-review`; purge guards kept.
- `_shared.md`: §1 rows 167–171, 175, 176; N-17, N-20, N-23 (e); §8 AQ-12 … AQ-16 closed, new AQ-17 … AQ-21.
- Row 176 is customer-facing only: the admin keeps `Assigned` plus the offer chips.

### Findings against `main` (new)
21. **blocker** — `apps/admin/src/app/features/admin/drawers/task-drawer.ts`, `panels/task-queue.panel.ts`. Design (`drawer-task-offer.md`, row 167): `Eligible runners left`, eligible-pool Reassign list, Matching exhausted state. Code: none (no offer section at all, finding 16). Fix: with finding 16, after api-contract N-20 (candidates + exhaustion check).
22. **blocker** — `apps/admin/src/app/features/admin/panels/verifications.panel.ts` (card actions). Design (row 171): `Re-review evidence` on decided verifications with a stored image, confirm, `Reviews` activity. Code: no such action. Fix: after api-contract builds the re-review endpoint.
23. **minor** — `verifications.panel.ts:71-75`. Design (row 170): no `Admin note` on purged cards. Code: renders the note whenever present. Fix: hide when `purgedAt` is set (the API clears it at purge).

### Handoff
- api-contract: `runner-gap-report.md` §13 API items 1–5.
- web-parity: findings 21–23 plus the open 16–20.

### Questions for the owner (new)
AQ-17 … AQ-21 (`_shared.md` §8); CQ-176a–c in `runner-gap-report.md` §13 (customer).

## Round 10 fix (reviewer FAIL 1; owner rows 177–181; correction row 185), applied on `docs/owner-answers-10-specs`

Full list: `docs/audits/runner-gap-report.md` §13.1.
- **B1**: row 155's deadline clause is no longer "removed"; whether `deadline_at` triggers EXPIRED was left open (BOARD row 185, answered in round 11) in `_shared.md` rows 155/167, N-20 and `drawer-task-offer.md`.
- Rows 177–179 (`drawer-task-offer.md`, N-20): pool = online, eligible for the category, in the service area once areas exist, otherwise available; runners who declined or let an offer lapse are excluded from the Reassign list (greyed `Already offered`, not selectable), applied now; no automatic expiry until the full pool exists. Empty Reassign list: `No eligible runners are available right now.`, `Send offer` disabled.
- M2: exhaustion check points marked proposed (after decline and lapse only); the candidates read never moves a task to EXPIRED.
- Rows 180, 181 (`p-runners-verification-documents.md`, N-23 (e)): endpoint approved, optional note ≤ 500 with no minimum; never changes the decision. Shape aligned to `feat/api-owner-answers-9` @ `45b516d` (M6).
- M7: `cancellation_reason_invalid` kept; already on the API branch.
- Findings 21–23 unchanged. Finding 21 now also covers the row-178 exclusion and the empty-list state.
- Open at the time: BOARD row 185 and the purchase limit in the pool; both answered in round 11 (rows 185, 186; section below).

## Owner answers round 11 (rows 185–200, 2026-10-16; row 201 pending), applied on `docs/owner-answers-11-specs`

Spec-only update; no screen re-audited. Full decision list, API items and System Design edits: `docs/audits/runner-gap-report.md` §14.

### What changed
- `drawer-task-offer.md`:
  - Row 185: new `Deadline` row; a **Deadline passed** sub-state for RUNNER_ASSIGNED past `deadlineAt` (read-only, no Reassign, no Expire); EXPIRED variants **Deadline passed**, **Matching exhausted** and **Expired by ops**; queue chip `Deadline passed` with `View`, excluded from `Needs a runner`; 409 `task_deadline_passed`; feed item `deadline_passed`.
  - Row 186: runners below the purchase limit are greyed in the Reassign list with their limit and the task's purchase; 409 `runner_not_eligible` `over_purchase_limit`.
  - Row 187: an empty online pool never expires a task; busy runners are ineligible; new **Expire task — no runner available** action (outline button, A-08 confirm with a required reason (proposed), result, activity row `Assigned → Expired` · `Admin · {name} · {time}`, errors), shown only on `canExpireNoRunner`.
  - Row 201 (pending): PAYMENT_CONFIRMED past its deadline gets the `Deadline passed` (pending) chip and no `Assign`; it stays in `Needs a runner`.
- `_shared.md`:
  - §1: rows 185–200 and 201 (open).
  - N-20: deadline, pool additions, admin expire, row 201.
  - N-23 (d): `side`, rows 190–193.
  - §8: questions AQ-22 … AQ-27; the row-185 and purchase-limit questions are closed.
- `p-runners-verification-documents.md` (rows 190, 191, 192, 193, 195, 200): type labels `National ID · Front` / `· Back`; `side` and the narrowed clock are built on `main`.
- `p-payout-requests.md` (row 194): the runner's cancel notification copy.

### Findings against `main` (new)
24. **blocker**: `apps/admin/src/app/features/admin/drawers/task-drawer.ts`, `panels/task-queue.panel.ts`.
    - Design (row 185): the `Deadline` row, the read-only Deadline passed sub-state, the Expired: deadline passed variant, the queue chip and `View`, and the `task_deadline_passed` notice.
    - Code: none.
    - Fix: after api-contract item 1–2 (`runner-gap-report.md` §14), with findings 16 and 21.
25. **blocker**: same files.
    - Design (row 186): over-limit runners greyed with their reason in the Reassign list; the `runner_not_eligible` `over_purchase_limit` notice.
    - Code: the assign dialog lists every runner and does no purchase check.
    - Fix: after api-contract item 3.
26. **blocker**: same files.
    - Design (row 187): `Expire task — no runner available` (button, confirm, required reason, result, errors), the Expired by ops variant, and the admin name in the `Status history` row.
    - Code: none. `Status history` shows the actor type only (`task-drawer.ts:157-176`).
    - Fix: after api-contract items 5–6.
27. **minor**: same files.
    - Design (row 201, proposed, pending): PAYMENT_CONFIRMED `Deadline passed` chip and flag; no `Assign`.
    - Code: none.
    - Fix: hold until row 201 is answered.
28. **minor**: `apps/admin/src/app/features/admin/panels/verifications.panel.ts` (`typeLabel`, `:194-201`) and `core/api-types.ts`.
    - Design (rows 195, 200): `National ID · Front` / `· Back` from `side`.
    - Code: no `side` on the type and no side in the label.
    - Fix: add `side` and the labels (with finding 4 of the spec's list).

### Handoff
- api-contract (`feat/api-runner-1`): `runner-gap-report.md` §14 items 1–8.
- web-parity: findings 24–28, plus the open 16–23.

### Questions for the owner (new)
- Row 201: open on the BOARD, with its follow-up (which exit ops use).
- AQ-22 … AQ-27: `_shared.md` §8.

## Owner answers round 12 (rows 201–218, 2026-10-19), applied on `docs/owner-answers-12-specs`

Spec-only update; no screen re-audited. Full decision list and API items: `docs/audits/runner-gap-report.md` §15. System Design §3.3 now has **PAYMENT_CONFIRMED → EXPIRED, actor Admin** (row 201, owner-approved).

### What changed
- `drawer-task-offer.md`:
  - Rows 201, 214: PAYMENT_CONFIRMED past its deadline keeps the `Deadline passed` chip, loses `Assign`, and gets **`Expire task`** (A-07 outline; confirm with a required 10–500 reason, proposed AQ-28; result; errors); new EXPIRED variant **Expired by ops after the deadline**; feed body pending row 220 (the old `Deadline passed, not offered · {task}` proposal is withdrawn).
  - Rows 202, 203, 208: the `Expire task — no runner available` rule and required reason are decided; availability flag renamed `canExpire.noRunner`.
  - Row 205: `Offer ends` = `offerExpiresAt`, capped at the deadline. Row 206: `No deadline` only on legacy tasks. Row 207: no pre-offer exception.
  - Row 210: `Reason` labels `Too far away`, `Not available`, `Other reason`.
  - Rows 211, 215: busy runners not listed; offline runners selectable under `Show offline runners ({n})` (proposed, AQ-31).
  - Row 216: approved feed copy. Round 11 minors: `runner_already_offered` notices; history note `Customer deadline passed` as built.
  - Data rebased on `feat/api-runner-1` (`lastAssignment`, `assignments[]`, `offerWindowSeconds`, `deadlinePassed`, `expiry`, history `actor`, the deadline sweep are built there).
- `_shared.md`: §1 rows 201–218; N-20; §8 AQ-22 … AQ-27 closed, AQ-28 … AQ-31 and rows 220, 221 open.
- `p-runners-verification-documents.md`: no change (row 209 concerns the Runner app's single ID row; the admin lists each side; rows 217, 218 need no admin UI).

### Findings against `main` (new)
29. **blocker**: `apps/admin/src/app/features/admin/drawers/task-drawer.ts`, `panels/task-queue.panel.ts`.
    - Design (rows 201, 214): PAYMENT_CONFIRMED past its deadline: `Deadline passed` chip and flag, no `Assign`, `Expire task` with reason, the Expired by ops after the deadline variant, `deadline_passed` feed item.
    - Code: none; `Assign runner` shows on every PAYMENT_CONFIRMED task (`task-drawer.ts:22-23`, `task-queue.panel.ts:136-137`).
    - Fix: after api-contract items 1–7 (§15). Replaces finding 27.
30. **minor**: same files.
    - Design (row 210): decline reason labels in the `Declined` row.
    - Code: no offer section.
    - Fix: with finding 16 (offer section), after api-contract item 9.
31. **minor**: same files.
    - Design (row 215): `Show offline runners ({n})` in the Reassign dialog; offline is never an assign refusal.
    - Code: the assign dialog lists every runner, with no availability grouping.
    - Fix: after api-contract item 11 (candidates read).
32. **minor**: same files.
    - Design (round 11 minor 4): `runner_already_offered` notices by `previousStatus`.
    - Code: none (generic error).
    - Fix: with the Reassign dialog.
- Finding 26 now reads `canExpire.noRunner` and a required reason (decided, rows 202, 203). Finding 27 is closed into 29.

### Handoff
- api-contract: `runner-gap-report.md` §15 items 1–13.
- web-parity: findings 29–32, plus the open 16–26 and 28.

### Questions for the owner (new)
- Rows 220, 221 (open on the BOARD); AQ-28 … AQ-31 (`_shared.md` §8).

## Owner answers round 13 (rows 220, 221, 225–228, 231, 232, 2026-10-19), applied on `docs/owner-answers-13-specs`

Spec-only update; no screen re-audited. API state and items: `runner-gap-report.md` §16.

### What changed in `drawer-task-offer.md` and `_shared.md`
- PAYMENT_CONFIRMED `Expire task`: the dialog and the required 10–500 reason are decided (row 225). The body now always includes `The customer is told no runner was available.` (row 226). Side effects: customer `errand.EXPIRED` and refund review (row 226); admin feed item pending BOARD row 234 (design-auditor reading of row 232; recommended none).
- RUNNER_ASSIGNED `Expire task — no runner available`: no admin feed item (row 232).
- Feed copy decided: the PAYMENT_CONFIRMED `Deadline passed` body (row 220); the plain decline body for `too_far`, `not_available`, `other` (row 231).
- Offline runners group decided (row 228). A never-offered task is not exhausted (row 227). Default deadline and backfill (row 221).
- Data rebased on `feat/api-owner-answers-12` (`POST /errands/:id/expire`, `canExpire`, `expiry.fromStatus`, candidates with `offline`).
- §8: AQ-28 … AQ-31 closed; AQ-32 (row 233) open.

### Findings (updates)
- 29 (**blocker**): unchanged in scope. Its copy is now all decided. Unblocked once api §16 items 1–2 are built.
- 31 (**minor**): the offline group is decided (row 228). It can be built now on `GET /errands/:id/candidates` (`offline`, `offlineCount`) from `feat/api-owner-answers-12`.
- 26 (**blocker**): it can be built now on `POST /errands/:id/expire` and `canExpire.noRunner`. No feed item after success (row 232).
- 30 (**minor**): the `Declined` reason labels can be built now.

### Handoff
- api-contract: `runner-gap-report.md` §16 items 1–4.
- web-parity: findings 16–26 and 28–32. Items 26, 30 and 31 can go now; 29 waits for api §16 items 1–2.

### Questions for the owner (new)
- Row 234 (new, open): no admin feed item after the admin's PAYMENT_CONFIRMED `Expire task` (design-auditor reading of row 232; recommended none).
- Row 233 is still open.

## Re-audit 2026-10-19: admin findings 26, 30, 31 (`fix/angular-admin-round-12` @ `cdf8fc7`)

Commits `7d89a90`, `16254b9`, `84c68fa`, `b530093`, `cdf8fc7`. New files: `drawers/task-offer.ts`, `task-offer.section.ts`, `expire-task-dialog.ts`, `runner-picker.ts`. Specs: `drawer-task-offer.md` (round 13), `_shared.md`, design system.

Build health:
- `ng test`: 27 files, 250 tests pass.
- `tsc -p tsconfig.app.json`: clean.
- No hex values or font families outside the token layer. The new `.dt-actor` uses `var(--nitume-font-ui)`; the new SCSS uses only `--nitume-*` tokens.

### Finding 26: `Expire task — no runner available`: PASS
- Shown only on `canExpire.noRunner` with RUNNER_ASSIGNED, as an outline button (A-07).
- Dialog (A-08):
  - Title `Expire this task?` and the body as specced.
  - Reason required, 10–500 after trimming. Counter `{n}/500`, plain hint, `Enter at least 10 characters.` on blur. `Expire task` enabled only when valid.
- Errors:
  - 409 `expiry_not_allowed` copy by `reason`, with `This task changed. Check the latest offer.` otherwise; 409 others reload.
  - 400 `expiry_reason_invalid` shows the field error.
  - 403 and generic errors show in the dialog.
- Result: `Task expired.`, reload, then **Expired by ops** with `Expired by`, `Expired at`, `Reason`, `Runners tried` (Fira Code values), the caption, and the refund line and link when the review exists.
- History caption: `Admin · {name}` (row 232: no feed item is expected, and none is sent).

### Finding 30: decline reason labels: PASS
- `Declined` card shows the pending chip, `Offered at`, `Declined`, `Reason` (all four row-210 labels plus `No reason given`), and the caption.
- The card is hidden once the deadline has passed (row 185 precedence).

### Finding 31: offline runners group: PASS
- `Show offline runners ({n})` is a collapsed, selectable group (row 228), using an A-07 text button with `aria-expanded`. `{n}` is in Fira Code, taken from `offlineCount`.
- Offline rows carry an info chip `Offline`, are read as `{name}, offline`, and show the selection caption.
- Online rows come first. The empty-list copy is shown. Busy runners are not listed (the API leaves them out).
- Selection uses green only for the checked radio and the checked border (checked state), which the design system allows.

### Rulings on the builder's notes
1. **Cut-down `Runner` section** (only Declined and Expired by ops): accepted as an interim step. Findings 16, 21 and 24 stay **blockers**. A side effect: a RUNNER_ASSIGNED task whose offer **ended** and that `canExpire.noRunner` allows shows the expire button with no state line. **m-14 (minor)**: when finding 16 is built, do the `Offer ended` state first. Until then this is tolerated, because the server guard decides whether the task can be expired.
   - The runner row (avatar, name, caption) is also missing from the Declined card. That is part of finding 16.
2. **`View refund review` opens the refund drawer directly**: accepted. The spec is updated (one `expired_after_payment` review per task; `p-refunds` has no task filter).
3. **The refund sentence always shows in the RUNNER_ASSIGNED expire dialog**: accepted. Every RUNNER_ASSIGNED task has passed PAYMENT_CONFIRMED (§3.3). The spec is updated.
4. **Builder copy**: all accepted and added to the spec as proposed copy.
   - `Couldn't load runners. Try again.`
   - The candidate caption `{rating} · {n} tasks · {d} km`.
   - The existing `This task changed while you were editing. Showing the latest.` on a 409/404 from the candidates read.
   - `Admin` as the `Expired by` fallback.
5. **The assign dialog keeps the PAYMENT_CONFIRMED wording** and **leaves out tried and over-limit runners instead of greying them**: accepted for now.
   - Finding 17 (`Offer sent to {runner}.`) stays open.
   - Findings 21 and 25 (greyed `Already offered` and over-limit rows with their reason) stay open. Leaving those runners out is safe, because the API refuses them anyway.
6. **`limit=100` without paging, `({n})` from `offlineCount`**: accepted for MVP pools; recorded in the spec. Revisit if any pool goes over 100.

### Verdict
**PASS** for findings 26, 30 and 31 (closed). New minor m-14 (with finding 16). Still open for `drawer-task-offer`: 16, 17, 21, 24, 25, 29, 32 (and 27 folded into 29). Status stays `partial`.

## Owner answers round 14 (rows 233–235, 2026-10-19), applied on `docs/owner-answers-14-specs`

Spec-only update. Details and API items: `runner-gap-report.md` §18.
- Row 234 closes the round-13 "pending BOARD row 234" notes: no admin feed item after the PAYMENT_CONFIRMED `Expire task` (as built).
- Row 235 changes no admin screen. The `Deadline` row shows whatever `deadlineAt` the API sets (24 h from payment for defaulted tasks).

### Findings against `main` (new)
33. **minor**: `apps/admin/src/app/features/admin/drawers/quote-dialog.ts` (error mapping).
    - Design (row 233, `drawer-task-requote.md` Errors): `location_outside_service_area` keeps the dialog open with `This task's location is outside every service area, so it can't be quoted. The customer is told and can cancel it.` (proposed; row 236 decided).
    - Code: none (the code is not built).
    - Fix: after api-contract §18 item 2.

### Questions for the owner (new)
- AQ-33 (BOARD row 236, answered 2026-10-19: out-of-area tasks already REQUESTED/QUOTED: how they end) and AQ-34 (BOARD row 237, answered 2026-10-19: refuse payment after a chosen deadline has passed). See `runner-gap-report.md` §18.

### Rows 236–238 (2026-10-19)
- Finding 33's copy is complete: `This task's location is outside every service area, so it can't be quoted. The customer is told and can cancel it.` (proposed; row 236). Rows 237 and 238 change no admin screen.

## Owner answers round 15 (rows 240, 242–244, 2026-10-19)
- No admin screen change. Row 243 forbids an admin deadline edit: `drawer-task-offer.md` now states that the `Deadline` row is read-only. Row 240 means more unpaid tasks show `No deadline yet` (backfilled values cleared). No new findings.


## Re-audit 2026-10-19: admin finding 33 and the `No deadline yet` Deadline row (`fix/angular-admin-round-14` @ `1c4d432`)

Commits `2fad654`, `1c4d432`. Specs: `drawer-task-requote.md` (Errors, rows 233, 236), `drawer-task-offer.md` (Layout 2, rows 239, 243), `_shared.md`, design system.

Build health:
- `ng test`: 27 files, 259 tests pass.
- `tsc -p tsconfig.app.json`: clean.
- No new colours, fonts or SCSS.

### Finding 33: quote refused outside every service area: PASS
- `quote-dialog.ts`: the code `location_outside_service_area` (422 from the API) sets an A-11 danger notice with the spec copy word for word: `This task's location is outside every service area, so it can't be quoted. The customer is told and can cancel it.`
- The dialog stays open, the API message is never shown, and neither `issued` nor `conflict` is emitted (tested).
- The mapping is by code, which covers the spec's "4xx".

### `Deadline` row, drawer summary: PASS
- `task-drawer.ts` `deadlineRow(status, deadlineAt)`:
  - a set deadline shows the 12-hour EAT time in Fira Code (`<b>`), in any state;
  - a null deadline in DRAFT, REQUESTED, QUOTED or ACCEPTED shows `No deadline yet` in Fira Sans (`<b class="txt">`; row 239 (a));
  - a CANCELLED task without one shows no row.
- The row is read-only: no input, button or link (row 243; tested).

### Ruling on the builder's reading
- A null deadline in a paid or later state keeps the built `—`: **accepted**. It should not happen after rows 239 (a) and 240 (the CHECK and the backfill). The dash marks a data gap without inventing copy. It is in Fira Sans (`txt`), which is right for a non-number.

### Verdict
**PASS**, no findings. Finding 33 is closed. The Runner-section `Deadline` row and its sub-states stay with finding 24 (open). `drawer-task-requote` goes back to `matches-design`. `drawer-task-offer` stays `partial` (findings 16, 17, 21, 24, 25, 29, 32 and m-14 are open).

## Audit 2026-10-21: verification inbox (`p-runners` verification part, `p-runners-verification-documents`)

Trigger: the owner ran the admin against the current API and saw `Couldn't save the review. Try again.`, `NaNd ago`, `payment identity`, `AA`, no `Front` / `Back`, no `View image`, and `5 items · 4 pending` over 4 visible cards.
Audited: `main` @ `1f4524f`, `apps/admin/src/app/features/admin/panels/verifications.panel.ts`, `core/services/api.service.ts`, `features/admin/admin-data.service.ts`, `core/api-types.ts`, `styles/_ops.scss`. API read only: `apps/api/src/runners/runners.controller.ts`, `runners.service.ts`, `dto/runner-actions.dto.ts`, `runner-verification.entity.ts`, `verification-summary.ts`, `main.ts`. Local DB read (one `SELECT` on `runner_verifications`) to confirm the owner's data.
Spec: `docs/specs/admin/p-runners-verification-documents.md` (respecced in this round: new `Verification card` section, Data checked against the code, AQ-35 … AQ-37).

### Real API shape (on `main`)
- `GET /runners/verifications?status=&cursor=&limit=` (`runners.controller.ts:76-85`, `runners.service.ts:976-1023`) → `{ items, nextCursor }`, each item `{ id, runnerProfileId, verificationType, side, status, reviewerNote, reviewedBy, reviewedAt, createdAt, purgedAt, hasDocument, runnerProfile { id, userId } | null, user { id, phone } | null, reviewer { id, displayName } | null, reReviews[{ id, reviewedBy { id, displayName }, createdAt, note }] }`. No `submittedAt`, no `documentKey`, no runner name or area. `status` must be `pending | approved | rejected` (`ListVerificationsQueryDto`, global ValidationPipe `forbidNonWhitelisted`, `main.ts:22-25`).
- `PATCH /runners/:runnerId/verifications/:verificationId` (`runners.controller.ts:60-74`) body `{ decision: 'approved' | 'rejected', reviewerNote?: string ≤ 1000 }` (`runner-actions.dto.ts:68-76`) → bare `VerificationView` (`runners.service.ts:1128-1164`). Already decided → 404 `Verification already resolved (…)`. `:runnerId` unused.
- `GET /runners/verifications/:verificationId/document` (`:93-103`, service `:710-735`) → `{ verificationId, url, expiresAt }`, logged; 404 / 404 `verification_document_missing` / 410 `verification_document_purged`.
- `POST /runners/verifications/:verificationId/re-review` (`:113-125`, service `:860-907`) `{ note? }` (≤ 500 after trim, else 400 `re_review_note_invalid`) → 201 `{ verificationId, reReview { id, reviewedBy { id, displayName }, createdAt, note } }`; 409 `verification_not_decided`, 410, 404 `verification_document_missing`. On `main` (the spec said "not on main yet"; corrected).

Owner's data (local DB): runner profile `aad1988f-…-75662a9c0ca7` has 5 rows: `payment_identity` pending (no image), `selfie` pending (image), `government_id` `back` pending (image), `government_id` `front` pending (image), `phone` approved (auto at OTP sign-in, no reviewer).

### Symptoms: root cause and class

| # | Symptom | Root cause | Class |
|---|---|---|---|
| S1 | `Submitted NaNd ago` | `verifications.panel.ts:61` calls `timeAgo(v.submittedAt)`; `core/api-types.ts:741` declares `submittedAt`, the API sends `createdAt`. `timeAgo` (`admin-data.service.ts:68-77`) has no guard: `new Date(undefined)` → `NaN` → `Math.max(1, NaN)` = `NaN` falls through to `${NaN}d ago`. | admin client bug |
| S2 | `Couldn't save the review. Try again.` | `core/services/api.service.ts:287-290` sends `PATCH {base}/runners/verifications/{id}`; the only route is `PATCH /runners/:runnerId/verifications/:verificationId` (`runners.controller.ts:61`), so Nest answers 404 and `verifications.panel.ts:170-171` shows the fallback. Latent second bug: on success `admin-data.service.ts:565` replaces the item with the bare response, dropping `runnerProfile` and `user`. | admin client bug |
| S3 | No `Front` / `Back` | The API sends `side` (`toVerificationView` spreads the entity, `runners.service.ts:129-132`; DB has `front` and `back`). The client type has no `side` (`api-types.ts:735-754`) and `typeLabel` (`verifications.panel.ts:194-201`) ignores it. | admin client bug (finding 28, open) |
| S4 | No `View image` | `verifications.panel.ts:63-69` renders the row only when `v.documentKey` is set; the API never sends a key (row 154) and sends `hasDocument: true` for 3 of the 5 rows. `docUrl` (`:203-206`) builds `/api/v1/files/{key}`, a route that does not exist and would bypass the logged endpoint. | admin client bug (finding 18, open) |
| S5 | `5 items · 4 pending` over 4 cards | `sub()` (`:212-216`) counts every item returned: 5 checks, one of them the auto-approved `phone` check. The grid loops the same array (`visible()`, `:177-179`), so the code renders a 5th card (Type `phone`, `Approved` badge); it sits alone on the third row of the two-column grid and its `.vc-badge` has no style, so it does not read as a review card. (Not seen in the DOM by the auditor; web-parity confirms in the panel test.) The real gap: the header counts checks while the mockup counts applications (`14 applications awaiting review`, one card per runner). | spec gap (AQ-35) + admin client bug (count wording, unstyled card) |
| S6 | `payment identity` lowercase | `typeLabel` fallback `type.replace(/_/g, ' ')` (`:200`); only `government_id`, `driving_license`, `vehicle_registration` are mapped. `selfie` and `phone` show raw too. Mockup: `M-Pesa identity match`, `Selfie / liveness check`, `Phone number`. | admin client bug (finding 20, open) |
| S7 | `Approve → runner level upgrades` | Hard-coded at `verifications.panel.ts:40-42`; not in the mockup. False for 4 of 5 checks: only a `government_id` approval changes the level, and only `1_basic` → `2_id_verified` (`runners.service.ts:1153-1161`). That API rule itself upgrades on one ID side alone, which sits badly with row 126. | admin client bug (copy) + spec gap / owner decision (AQ-36) |
| S8 | Initials `AA` | `verifications.panel.ts:48` passes `v.runnerProfile?.id` to `initials()` (`:185-192`), which takes the first two characters of the UUID `aad1988f-…`. The mockup shows the runner's name initials (`MW`). The list item has no name. | admin client bug + API gap (name on the item) |

### Findings against `main` (new)
34. **blocker**: `apps/admin/src/app/core/services/api.service.ts:287-290`, `features/admin/admin-data.service.ts:559-567`, `verifications.panel.ts:80-92`.
    - Design: `PATCH /runners/{runnerProfileId}/verifications/{verificationId}` `{ decision }`; merge the result into the list item; only the clicked button shows `Approving…` / `Rejecting…`; success `Check approved.` / `Check rejected.`; 404 → reload + `This check was already decided. The list is updated.`
    - Code: wrong path (404 every time); the bare response replaces the item; `Approving…` shows on Approve when Reject is clicked; no success notice.
    - Fix: pass `runnerProfileId` and use the three-segment path (fix the doc comment too); merge `status`, `reviewedBy`, `reviewedAt`, `reviewerNote` (or reload); per-button busy label; notices per the spec.
35. **blocker**: `verifications.panel.ts:61`, `core/api-types.ts:735-754`, `admin-data.service.ts:68-77`.
    - Design: `Submitted {date}` from `createdAt` (12-hour EAT, Fira Code, `formatDateTime` in `features/admin/shared-format.ts:103`); `Applied {relative}` in the card sub.
    - Code: `submittedAt` (never sent) → `NaNd ago`; the type also declares `documentKey`, `user.email` (not sent) and lacks `side`, `reviewedAt`, `createdAt`, `purgedAt`, `hasDocument`, `reviewer`, `reReviews`.
    - Fix: make `RunnerVerification` the real item shape (Data section of the spec); make `timeAgo` return `—` for an invalid date instead of `NaN…`.
36. **blocker**: `verifications.panel.ts:63-69, 203-206` (restates finding 18 with the API now known).
    - Design: Stored / Opening / Deleted / No image states; `GET /runners/verifications/:id/document` only on click, `window.open(url, '_blank', 'noopener,noreferrer')`; errors 410 / 404 / `url: null` / 403 per the spec.
    - Code: gated on `documentKey`; raw `/api/v1/files/{key}` link.
    - Fix: delete `docUrl`; build the states from `hasDocument` and `purgedAt`; add `verificationDocument(id)` to `api.service.ts`.
37. **blocker**: `verifications.panel.ts` (whole card, `:44-108`), `styles/_ops.scss:526-631, 1166-1182`.
    - Design (mockup `#p-runners`, spec `Verification card`): `.verif-top` with `.verif-avatar` (name initials), `.verif-name`, `.verif-sub` (`Applied {time} · {area}`, Fira Code), `.doc-row` per check with `.doc-status` text (`Verified`, `Pending review`, `Rejected`, `Not submitted`), `.verif-actions` with `.btn-reject` / `.btn-approve`; one card per runner if AQ-35 (a) or (b).
    - Code: one card per check; classes `vc-header`, `vc-sub`, `vc-row`, `vc-actions`, `vc-badge`, `doc-link` have no CSS anywhere, so the header is not laid out and the decided badge is plain text; a status chip and a badge show the same status twice; the existing mockup classes are unused; `.btn btn-primary` / `.btn btn-outline` instead of `.btn-approve` / `.btn-reject`.
    - Fix: rebuild the card from the mockup classes; group per runner after AQ-35 (until then, per check, but with the mockup markup).
38. **minor**: `verifications.panel.ts:48, 185-192`.
    - Design: initials from the display name (`MW`), `R` when there is no name; never from an id.
    - Code: first two characters of the profile UUID (`AA`).
    - Fix: after the API item carries the name (API item A-5); `R` until then. Also `.runner-avatar` sets `font-family: var(--nitume-font-num)` (`_ops.scss:1178`): initials are not numeric; `.verif-avatar` (Fira Sans) is the mockup class.
39. **minor**: `verifications.panel.ts:194-201`, `core/api-types.ts` (restates findings 20 and 28).
    - Design: `National ID · Front` / `National ID · Back` from `side`, `National ID` when `side` is null, `Selfie / liveness check`, `Phone number`, `M-Pesa identity match`.
    - Code: `Government ID` for both sides, `Driving License`, `Vehicle Registration` (types the API does not have), raw fallbacks `payment identity`, `selfie`, `phone`.
    - Fix: map the API enum (`phone`, `government_id`, `selfie`, `payment_identity`, plus `reference`, `business` → `Reference check`, `Business check`, proposed) and add `side`.
40. **minor**: `verifications.panel.ts:20-21, 212-216`.
    - Design: title `Runner verification`; sub `{n} applications awaiting review` (runners with a pending check) or, under AQ-35 (c), `{n} checks awaiting review`; `Loading…` before the first answer.
    - Code: `Verification inbox`; `{total} items · {pending} pending` (checks, including the auto-approved phone check, so 5 vs 4 pending cards); `No verifications synced yet` before the first load.
    - Fix: per the spec.
41. **minor**: `verifications.panel.ts:40-42`.
    - Design: panel note `Opening an image is logged. Images are deleted at the end of the retention period.`; no level claim (AQ-36).
    - Code: `Runner-submitted documents awaiting admin review. Approve → runner level upgrades.`
    - Fix: replace the copy.
42. **minor**: `verifications.panel.ts:24-29, 126-131`, `core/api-types.ts:695`, `shared/status-chip.component.ts:45-57`.
    - Design: filter `All statuses`, `Pending`, `Approved`, `Rejected` (API enum).
    - Code: also `In review` (`in_review`), which the API rejects with 400, so the panel shows `Couldn't load verifications. Try again.`
    - Fix: drop `in_review` from the type, the filter and the panel's `@else if` (`:99-101`). The chip vocabulary can keep its entry harmlessly, or drop it (web-parity's call; no other caller sends it).
43. **minor**: `verifications.panel.ts:51`.
    - Design: phone in Fira Code (Numeric fields).
    - Code: `.vc-sub`, unstyled, Fira Sans.
    - Fix: `.verif-sub` or `app-num-text`.
44. **minor**: `verifications.panel.ts:71-75` (restates finding 23): `Admin note` must not render on purged cards.
45. **blocker**: `verifications.panel.ts` (card actions) (restates finding 22, now unblocked).
    - Design (row 171): `Re-review evidence`, A-08 confirm with optional note ≤ 500 and `{n}/500`, `Reviews` list (`Decided · {outcome} · {admin} · {time}` from `reviewer` + `reviewedAt`, `Re-reviewed · …` from `reReviews[]`), errors 409 / 410 / 404 / 403.
    - Code: none. The endpoint, `reviewer` and `reReviews[]` are on `main`.
    - Fix: build per the spec with `shared/confirm-dialog.component.ts` and `shared/form-field.component.ts`.
46. **minor**: phone check display.
    - Design: `Phone number` · `Verified`, caption `Verified at sign-in`; no actions, no image line.
    - Code: a full card `phone` with `Approved` and `NaNd ago`.
    - Fix: per the spec.
47. **minor**: accessibility (spec Accessibility): Approve / Reject accessible names name the check and runner; avatar `aria-hidden`; `View image` name `View {type} image for {runner}, opens in a new tab`. Code: generic `Approve` / `Reject` for every check of the same runner.
48. **blocker** (build health): no `verifications.panel.spec.ts`. `tsc -p tsconfig.app.json` is clean; `ng test` 27 files, 259 tests pass, none cover this panel. Fix: tests for the PATCH path, `createdAt`, labels with `side`, the document states and errors, the re-review flow, the filter values and the count.
49. **minor**: `verifications.panel.ts:133` uses `ngOnInit` without `implements OnInit` and keeps `loadingMore` / cursor state when a load fails; no first-load state (see 40). Fix with the rebuild.

Tokens: no hex colours, inline `font-family` or `GoogleFonts` in the panel (checked). Domain: no wallet / escrow wording; no category or task-state text on this panel.

### API items (api-contract; not admin bugs)
- A-1 **minor**: `runners.controller.ts:61-73` ignores `:runnerId`. Return 404 when the verification does not belong to that runner.
- A-2 **minor**: `runners.service.ts:1139-1143` answers 404 `Verification already resolved` for a decided check. Make it 409 `verification_already_decided` `{ status }` so a second admin's click is not read as a wrong id.
- A-3 **minor**: `runners.service.ts:1163` returns the bare view. Optional: return the admin item shape (`runnerProfile`, `user`, `reviewer`, `reReviews`) so the client does not have to merge.
- A-4 **owner decision first (AQ-36)**: `runners.service.ts:1153-1161` upgrades to `2_id_verified` on the approval of either ID side alone.
- A-5 **needed for the mockup card (after AQ-35)**: runner display name (short form) and service area on each list item, or a runner-grouped queue paginated by runner (one runner's checks are split across `nextCursor` pages today).
- A-6 **minor, not design**: `runners.service.ts:1006-1009` looks up users one by one inside a loop (N+1 per page).
- A-7 **after AQ-37**: `reviewerNote` is not trimmed and allows 1000 characters; align with the answer.

### Spec gaps closed in this round
- `p-runners` verification card (layout, counts, filter values, actions, phone check, loading) specced in `p-runners-verification-documents.md` `Verification card`.
- Data section checked against the code: re-review endpoint, `reviewer`, `reReviews[]`, `side` are on `main`; PATCH path, response and error codes written out.

### Questions for the owner (new)
- **AQ-35** (flow): one card per runner (mockup) vs per check (API); where `Approve` / `Reject` sit. Recommended: per runner, per-check buttons on each pending row, no card-level bulk action.
- **AQ-36** (verification rule, security): approving one ID side moves the runner to Level 2 today. Recommended: Level 2 only when both ID sides (and the selfie?) are approved.
- **AQ-37** (copy, runner-facing): reject reason required? visible to the runner? Recommended: optional internal note, never shown to the runner.

### Verdict
**FAIL** (`p-runners-verification-documents` and the `p-runners` verification part). Blockers: 34, 35, 36, 37, 45, 48. Minors: 38–44, 46, 47, 49. Earlier findings 18, 19, 20, 22, 23, 28 are superseded by 36, 35/36, 39, 45, 44, 39 respectively. Builder order: 34, 35, 36, 39, 41, 42 (no owner input needed) first; 37, 38, 40, 46 after AQ-35 and API item A-5; 45 now.

## Re-audit 2026-10-21: verification inbox (`fix/admin-verification-inbox` @ `7638f3e`)

Audited: web-parity `386c961` (`fix(admin): wire verification inbox to the real API shape`) and `7638f3e` (`test(admin): cover verification inbox review, image and re-review flows`), stacked on `docs/admin-verification-audit`. Files: `apps/admin/src/app/features/admin/panels/verifications.panel.ts`, `verifications.panel.spec.ts`, `core/services/api.service.ts:289-318`, `features/admin/admin-data.service.ts:68-79, 562-628`, `core/api-types.ts:693-788`, `shared/status-chip.component.ts`. API side read against both shapes: `main` @ `1f4524f` (bare PATCH answer, 404 when decided) and api-contract's `fix/api-verification-review` (`dfcc72b`, `38a6a58`, `e117ac6`: A-1 runner scope, A-2 409 `verification_already_decided` `{ status }` with a conditional write, A-3 full list item, A-6 batched phones; 400 on a malformed id).
Spec updated in this round: PATCH contract and error list (409 for already decided, 404 for unknown or another runner's check, 400 malformed, both response shapes) in `p-runners-verification-documents.md` (Actions, Data) and `_shared.md` N-23 (f); N-23 (e) corrected (re-review endpoint is on `main`).
Build health: `tsc -p tsconfig.app.json --noEmit` clean; `ng test --watch=false` 28 files, 272 tests pass (was 27 / 259), 13 new in `verifications.panel.spec.ts`. Token scan of the diff: no hex colours, no inline `font-family` or `style=`, no wallet / escrow wording, `in_review` gone from the type, the filter and the chip vocabulary.

### Findings claimed built
| # | Verdict | Evidence |
|---|---|---|
| 34 | PASS | `api.service.ts:294-299` three-segment path with `runnerProfileId`; `admin-data.service.ts:568-597` merges the answer over the item (status, reviewedBy, reviewedAt, reviewerNote; runnerProfile, user, reReviews, reviewer kept from the item when absent), so both the bare and the full answer work (spec tests "merges the bare answer" and "accepts the full list item"). Panel `:376-396`: per-check `busy` map, only the clicked button relabels (`Approving…` / `Rejecting…`, `:232`, `:241`), both disabled; `Check approved.` / `Check rejected.`; 403 → `FORBIDDEN_COPY`; 404 / 409 → reload + `This check was already decided. The list is updated.`; other → `Couldn't save the review. Try again.` |
| 35 | PASS | `api-types.ts:745-788` matches the API item (`createdAt`, `side`, `reviewedAt`, `purgedAt`, `hasDocument`, `reviewer`, `reReviews`; no `submittedAt`, `documentKey`, `user.email`). `Submitted` = `formatDateTime(createdAt)` in `.num` (`:141`). `timeAgo` returns `—` on a missing or invalid date (`admin-data.service.ts:70-73`). |
| 36 | PASS | `docUrl` deleted; `imageState` (`:57-61`) gives Stored / Deleted / No image / hidden from `hasDocument` + `purgedAt`; `View image` → `Opening…` disabled; `GET …/document` only on click, fresh each time, `window.open(url, '_blank', 'noopener,noreferrer')` (`:399-423`); `url: null`, 410 (with `purgedAt`), 404 `verification_document_missing`, 403 and other copy exact. Deleted row: `Deleted {date}` (date Fira Code) + the retention caption. |
| 39 | PASS | `verificationTypeLabel` (`:28-47`): `National ID · Front` / `· Back` from `side`, `National ID` when null, `Selfie / liveness check`, `Phone number`, `M-Pesa identity match`, `Reference check`, `Business check`; unknown type `Verification check`, never a raw enum. |
| 41 | PASS | `:115-117` exact spec copy; level claim gone. |
| 42 | PASS | `VERIFICATION_STATUS_FILTERS` (`:22-26`) + `All statuses`; `in_review` removed from `api-types.ts:696` and `status-chip.component.ts`. |
| 43 | PASS | Phone in `.verif-sub` (`:131`, Fira Code 11, `_ops.scss:573`). |
| 44 | PASS | `Admin note` only when `reviewerNote && !purgedAt` (`:190`); `markVerificationPurged` also nulls the note and re-review notes after a 410. |
| 45 | PASS | `Re-review evidence` (`.btn .btn-outline .btn-sm`, not green) only via `canReReview` (decided, ID/selfie, stored, not purged; `:64-66`, `:244-257`); A-08 confirm with exact title, body, `Note (optional)`, hint, `{n}/500` counter, `Back` / `Record re-review` / `Recording…` (`:271-310`); trimmed note, blank sent as no note (`:441-449`, `api.service.ts:312-318`); `Re-review recorded.` and the row appended (`admin-data.service.ts:600-605`); 409 / 410 / 404 `verification_document_missing` / 403 / other per the spec (`:455-473`). `Reviews` list `Decided · {outcome} · {admin}` + `Re-reviewed · {admin}` with the note on a second line, times Fira Code (`.drawer-row b`, `_ops.scss:861`). |
| 47 | PASS | Accessible names: `Approve {check} for {runner}` / `Reject …` (`:228`, `:237`), `View {check} image for {runner}, opens in a new tab` (`:151-157`), re-review names the check; avatar `aria-hidden` (`:126`). `{runner}` is the short id until A-5 brings a name (follows finding 38). |
| 48 | PASS | `verifications.panel.spec.ts`: labels with `side`, filter values, `timeAgo`, the owner's five checks rendered, PATCH path and both answer shapes, 404/409 reload, View image on click only, 410 / missing, purged note hidden, re-review with trimmed / blank note and 409. All pass. |
| 49 | PASS | `implements OnInit` (`:314`); `load()` resets `loadingMore` and the cursor on failure (`:339-353`); `Loading…` before the first answer (`:119-120`, sub `:520`). |

### Deferred by design (open; not counted against this verdict)
- 37 (blocker, open): card markup still `vc-header` / `vc-row` / `vc-actions` / `.runner-avatar` with `.btn-primary` / `.btn-outline`; the mockup classes `.verif-top`, `.verif-avatar`, `.verif-name`, `.doc-row`, `.doc-status`, `.btn-approve`, `.btn-reject` unused. Waits on AQ-35 (rows 260–262).
- 38 (minor, open): initials from the profile UUID (`:127`, `:490-497`). Waits on A-5 (runner name on the item).
- 40 (minor, open): title `Verification inbox`, sub `{n} items · {n} pending` / `No verifications synced yet` (`:86`, `:519-524`). Waits on AQ-35.
- 46 (minor, open): the auto-approved phone check is a full card. Waits on AQ-35.
- For the AQ-35 rebuild (spec "Current vs design" note, not findings now): a failed load after a filter change leaves the previous list on screen, and `No verifications match` shows under the load-error notice.

### Rulings on the builder's notes
- (a) Removed the duplicate unstyled `Approved` / `Rejected` badge: **accepted**. Finding 37 named the double status as a defect; the `app-status-chip` (A-02 `kind="verification"`) stays as the one status until the `.doc-status` rebuild.
- (b) `By` falls back to the admin short id after a decision against `main`'s bare answer: **accepted**. Once `fix/api-verification-review` merges, the PATCH carries `reviewer { displayName }` and the merge uses it (tested). Recorded in the spec.
- (c) Success notices do not auto-dismiss: **accepted**. The spec asks for an A-11 notice, not a timer; they are dismissible. Any shared timer belongs to `InlineNoticeComponent` (all panels), not this screen.
- (d) 404 and 409 both reload with `This check was already decided. The list is updated.`: **accepted**. The client always sends the item's own `runnerProfileId`, so after A-1 a 404 can only mean the check is gone; the reload shows the truth. Spec error list updated (409 primary, 404 same handling, 400 / other → save error).
- (e) Labels: **accepted**, match the spec (mockup wording; `Reference check` / `Business check` were the proposed labels in finding 39).
- (f) Panel note copy: **accepted**, exact spec text.

### Verdict
**PASS** for the scoped re-audit (findings 34–36, 39, 41–45, 47–49 closed; earlier 18, 19, 20, 22, 23, 28 closed with them). The screen does **not** match the design yet: 37 (blocker), 38, 40, 46 stay open, deferred to AQ-35 and API A-5, so `SCREEN_MAP.md` moves to `built`, not `matches-design`. API-side A-1, A-2, A-3, A-6 are built on `fix/api-verification-review` (not on `main`); A-4 waits on AQ-36, A-5 on AQ-35, A-7 on AQ-37.

## Owner answers 2026-10-21 (rows 260–262): verification inbox

Applied on `docs/admin-verification-answers` to `docs/specs/admin/p-runners-verification-documents.md` (`Verification card` rewritten: one card per runner, per-row actions, reject dialog, filter, paging, load error; Data A-4, A-5, A-7, A-8; AQ-38), `docs/specs/admin/_shared.md` (§1 rows 260–262, N-23 (g), §8), `docs/specs/runner/_shared.md` (§0 rows 261, 262; §7 level rule), `docs/specs/runner/v-onboard-id.md`, `docs/specs/runner/v-onboard-pending.md`.

- **Row 260 (AQ-35)**: one card per runner (mockup), `Approve` / `Reject` on each pending check row, no card-level or bulk action. Unblocks findings 37 (mockup classes, per-runner card), 40 (`Runner verification`, `{n} applications awaiting review` = runners with a pending check over the whole queue) and 46 (phone check as a compact `Phone number` · `Verified` row with `Verified at sign-in`, never a card or a pending count). Finding 38 (name initials) needs the runner name from API A-5; until then the avatar shows `R` and the name falls back to the short id.
- **Row 261 (AQ-36)**: Level 2 · ID verified only when both National ID sides **and** the selfie are approved. API A-4 (api-contract, `feat/api-verification-answers`) replaces the one-side upgrade at `runners.service.ts:1153-1161`. Admin copy: panel note gains `A runner reaches Level 2 when both ID sides and the selfie are approved.` (proposed wording); an optional level line `Level 1 — Basic · Level 2 needs: …` (proposed; level always from the API). Runner specs: no runner spec claimed one side or the ID alone gives Level 2; the rule is now written in runner `_shared.md` §0 and §7. Runner app: the level comes from `verificationLevel` only (`nitume_core` `enums.dart:202`), no inference found, no change.
- **Row 262 (AQ-37)**: reject reason = optional internal note ≤ 500, trimmed, blank = no note, never shown to the runner. `Reject` now opens an A-08 dialog with `Note (optional)` and `{n}/500`. API A-7 (≤ 500, trimmed) and **A-8 (new)**: `GET /runners/me/verifications` and the runner `POST` verification responses return `reviewerNote` and `reviewedBy` today (`runners.service.ts:961-968`, `toVerificationView` spreads the entity), so the internal note reaches the runner's device even though no runner screen renders it (checked: no `reviewerNote` in `apps/runner_app/lib` or `packages/nitume_core/lib`). Runner specs `v-onboard-id` / `v-onboard-pending` no longer allow a "runner-safe reason".
- **M4 (re-audit notes)** now spec rules: clear the grid and reset the cursor on any failed load; no empty state under a load error; a failed `Load more` keeps the shown cards.
- **New question AQ-38** (follows row 261): downgrade when a Level-2 check is re-uploaded or rejected; legacy `side = null` ID images; re-evaluating runners already at Level 2. Recommendations in `_shared.md` §8. Does not block the admin build.

Status: findings 37, 38, 40, 46 stay open (now buildable by web-parity; 38 completes with A-5). `SCREEN_MAP.md` stays `built`.

## Re-audit 2026-10-21: verification cards (`feat/admin-verification-cards` @ `13cac96`, `5e0dfdf`, `49e054b`)

Audited: web-parity `13cac96` (`feat(angular-admin): one verification card per runner from the queue endpoint`), `5e0dfdf` (`perf(angular-admin): lazy-load the runner verification panel`), `49e054b` (`style(angular-admin): verification card states, Fira Sans initials and 40px actions`), stacked on `docs/admin-verification-answers` (spec `c4f7547`). Files: `apps/admin/src/app/features/admin/panels/verifications.panel.ts`, `verifications.panel.spec.ts`, `features/admin/admin-data.service.ts:569-724`, `core/services/api.service.ts:282-322`, `core/api-types.ts:735-830`, `features/admin/admin-dashboard.component.ts:214-221`, `styles/_ops.scss:526-685`. Mockup `docs/design/nitume_admin_dashboard.html:331-355`.
API contract read with `git show feat/api-verification-answers:…` (`c21bce5`, `7a7ad1a`, `cf414e5`): `runners.controller.ts` (`GET verifications/queue`), `runners.service.ts` (`verificationQueueForAdmin`, `QUEUE_BASE_SQL`, `QUEUE_FILTERS`, `adminRunnerRefs`, `reviewVerification`, `reviewerNoteOf`, `toRunnerVerificationView`), `verification-summary.ts`, `dto/runner-actions.dto.ts`, `users.service.ts` (`contacts`).
Build health (worktree, `node_modules` linked from the main tree and removed afterwards): `tsc -p tsconfig.app.json --noEmit` and `tsconfig.spec.json` clean; `ng test --watch=false` 28 files, **288 tests pass** (was 272); `ng build` OK, initial total **492.07 kB**, no budget warning. Token scan of the diff: no hex, no inline `font-family` / `style=`, new rules use `--nitume-*` tokens only (`--nitume-red` for `.doc-status.rejected`, text only); no wallet / escrow wording.

### Client against the contract
| Contract | Client | Verdict |
|---|---|---|
| `GET /runners/verifications/queue?status=pending\|approved\|rejected\|all&cursor&limit` → `{ items, nextCursor, total, awaitingReviewCount }` | `api.service.ts:287-295` sends `status` and `limit=20`, `cursor` when paging; `api-types.ts:764-823` mirrors `AdminRunnerRef`, `AdminRunnerUser`, `VerificationQueueItem` (incl. `pendingCount`, `oldestPendingAt`, `verification { verified, checks }`), `VerificationQueueResult` | match |
| item `checks` = every record, newest first | `checkRows` (`:105-128`) picks the newest per (type, side) and adds `Not submitted` rows from `verification.checks` (`missing`) | match |
| `awaitingReviewCount` whole queue, filter-independent | topbar `sub()` (`:828-832`) from the signal set on every page (`admin-data.service.ts:590`); decremented locally when a decision leaves the runner with no pending record (`:640-642`) | match |
| PATCH answer = full admin item with `runnerProfile.verificationLevel` | `mergeReviewAnswer` spreads the whole answer, keeps runner / user / re-reviews from the check when absent (bare answer), level line updated (`admin-data.service.ts:612-643, 693-708`) | match (reviewer M3 closed) |
| 400 `reviewer_note_invalid` `{ maxLength: 500 }` | reject dialog keeps the note and shows `Notes can be up to 500 characters.` (`:645-646`); client cap 500 on the trimmed value | match |
| A-8 runner views without `reviewerNote` / `reviewedBy` | admin only reads the admin item; nothing to do client-side | n/a |
| 400 `cursor_invalid` | a failed `Load more` shows the load notice and keeps `Load more`; a filter change drops the cursor before loading (`:584-588`) | match |

### Findings claimed built
| # | Verdict | Evidence |
|---|---|---|
| 37 | PASS | One `section.verif-card` per runner (`:253-419`), `aria-labelledby` the `.verif-name`; header `button.verif-top` (`:258-284`, reset in `_ops.scss:549-558`) opens the runner drawer; `.verif-avatar` / `.verif-name` / `.verif-sub` / `.verif-level`; one `.doc-row` per check with `.doc-status` text only (`Verified`, `Pending review`, `Rejected`, `Not submitted`; `.pending`, `.rejected`, `.missing` tones), no `app-status-chip`, no `vc-*`, no `.runner-avatar`; per-row `.verif-actions` with `.btn-reject` / `.btn-approve` (40 px, disabled state) only on pending rows; no card-level or bulk action. Mockup order with `· Front` / `· Back`, legacy ID after `· Back`. |
| 38 | PASS | `nameInitials(user.displayName)` (`:138-144`): first letters of first and last word, `R` without a name; never an id. `.verif-avatar` now `--nitume-font-ui` (`_ops.scss:577-578`); `aria-hidden`. Name = API `shortName`, else short id in `.num`. |
| 40 | PASS | Title `Runner verification` (`:214`); sub `awaitingCopy` (`:185-188`): `{n} applications awaiting review`, `1 application awaiting review`, `No applications awaiting review`; `Loading…` before the first answer. Counts runners (API), not checks; the phone check never counts. |
| 46 | PASS | Approved phone record → compact `.doc-row` `Phone number` · `Verified` + `Verified at sign-in` (`:297-300`), no Submitted, image, Reviews or actions; phone-only runners are excluded by the API. |
| M4 | PASS with item 1 below | Any failed first page clears the cards (`admin-data.service.ts:583-588`; filter change clears before loading, `:584-588`); empty state hidden while `loadError` (`:422`); a failed `Load more` keeps the cards. Residual: the notice itself outlives the failed load (finding 50). |
| Reviewer M1 | PASS (ruling 2 below) | `viewImage` (`:674-703`) opens the tab on the click, `opener = null`, `location.replace(url)`; closes it on `url: null` or error; fallback `noopener,noreferrer` when blocked. |
| Reviewer M2 | PASS | `markVerificationPurged` (`admin-data.service.ts:656-664`) keeps the API's `purgedAt` or none, with a `purgedLocally` mark; the row reads `Deleted` without a date, never today's date. |
| Reviewer M3 | PASS | See contract table. |
| Row 262 dialog | PASS | Title `Reject {check label}?`, exact body, `Note (optional)`, hint `Internal. Never shown to the runner.`, counter `{trimmed}/500` (Fira Code `.field-counter`), `maxlength` 500, `Back` / `Reject check` / `Rejecting…`; initial focus `Back` (form mode without `data-autofocus`, `confirm-dialog.component.ts:151-155`); cannot close while busy; trimmed, blank → no note; 403 / 404 / 409 close and reload, 400 note → in-dialog copy, other → `Couldn't save the review. Try again.`; polite announcement from 450. |
| Row 261 copy | PASS | Panel note second sentence exact (`:244-247`); level line from the API level only, `Level 2 needs: …` in ID front, ID back, selfie order; level digits in Fira Code via `app-num-text`. No level wording in `Check approved.` |
| Header sub | PASS | `Applied {timeAgo} · {first area} +{n}` (Fira Code `.verif-sub`); `{short id} · {phone}` second line (phone only when the name line already shows the id). |

### Rulings on the builder's notes
1. **`appliedAt` = runner profile `createdAt`**: **accepted, spec aligned.** The API owns the field (`AdminRunnerRef.appliedAt`), the client never computes it, and the profile is created when the runner starts the application, which is what the mockup's `Applied 2 days ago` reads as. Spec card header updated.
2. **M1 blank tab, then `location.replace(url)`**: **accepted, not a security finding.** What must stay private is the signed URL; it is never sent as a `Referer` (the image tab is the last hop and links nowhere). The navigation sends the storage host the admin **origin** only (browser default `strict-origin-when-cross-origin`; the admin sets no referrer override; checked `index.html` and the app for `referrer`). Reverse tabnabbing is prevented by `opener = null` before the navigation. Popup-blocked fallback keeps `noopener,noreferrer`. Flag for reviewer (information, not a blocker): if the owner wants the storage host to see no admin origin at all, add `<meta name="referrer" content="no-referrer">` to the admin `index.html` (app-wide, web-parity). Spec `View image` behaviour updated.
3. **Only the newest record per check listed**: **accepted** (spec rule, now confirmed against the API, which sends the whole history). New API item **A-9** (minor, api-contract): uploads never supersede an older pending record of the same (type, side), and the queue counts every pending record for `Pending` / `pendingCount` / `awaitingReviewCount`, while the card shows the newest only, so a runner who uploaded the same side twice before review stays in `Pending` and in the topbar count with nothing to decide. Recommended: read pending on the newest record per (type, side) as `rejected` / `approved` already do. Goes with owner row 264; not counted against this build.
4. **`Applied yesterday` lowercase**: **accepted** (mid-sentence; shared `timeAgo` unchanged). Spec notes it.
5. **`Load more` error copy `Couldn't load verifications. Try again.`**: **accepted**; spec now says so.
6. **Panel deferred in `admin-dashboard.component.ts`**: **accepted.** Same pattern and copy shape as the runner payouts panel (`Loading runner payouts…`); the placeholder shows only while the chunk loads, then the panel's own `Loading…`. Bundle 492 kB, under budget.

### Findings (new)
50. **minor**: `apps/admin/src/app/features/admin/panels/verifications.panel.ts:551-567` (M4 residual).
    - Design (spec `Paging, loading, empty, error`, clarified this round): the load-error notice belongs to the failed load; no cards and no empty state of a later successful load sit under it.
    - Code: `load()` never clears `notice`. A failed load, then `↻ Refresh` or a filter change that succeeds, shows the cards (or `No applications match`) under `Couldn't load verifications. Try again.` until the admin dismisses it, which is the "empty state under the load-error notice" case M4 asked to remove.
    - Fix: at the start of `load()` (and `loadMore()`) clear the notice when it is a load-error notice (keep a flag, or clear any `danger` notice there). Clearing at the start, not on success, keeps the `This check was already decided. The list is updated.` info that `reviewFailed` sets right after calling `load()`. Add a test: fail, refresh succeeds, no danger notice.
51. **minor**: `verifications.panel.ts:314` (`View image`), `:406` (`Re-review evidence`); `styles/_ops.scss` (`.doc-detail`).
    - Design (spec, as passed in the previous re-audit): `View image` is a text button sized to the 12 px detail row; `Re-review evidence` is the small outline button (`.btn .btn-outline .btn-sm`), 40 px target, not more prominent than `Approve` / `Reject`.
    - Code: both lost `.btn-sm` in the rebuild (`342e5e9` had `btn btn-text btn-sm` and `btn btn-outline btn-sm`): `View image` renders at 14.5 px with 12 px vertical padding inside a 12 px `.drawer-row`; `Re-review evidence` is a full-size 14.5 px pill, larger than the 12.5 px `Approve` / `Reject` beside other rows.
    - Fix: restore `btn-sm` on both; give the re-review button its 40 px target with `.doc-detail .verif-actions .btn { min-height: 40px; }` (tokens only). Spec updated to name `.btn-sm` explicitly.

### Owner rows (not counted)
- Row 263 (AQ-38: downgrade, legacy `side = null`, backfill): open; the card shows the API's level either way.
- Row 264 (filter semantics and order as built): open. Spec now records the built behaviour (`Pending` oldest pending first; `Rejected` / `Approved` most recently decided first; `All statuses` most recent submission first) as pending owner confirmation, plus A-9 above.

### Spec aligned in this round
`p-runners-verification-documents.md`: Implementation / Status lines; topbar source `awaitingReviewCount` (the `{n}+` fallback dropped); filter values incl. `all`, default `Pending`, built semantics pending row 264; `appliedAt` = profile `createdAt`; newest-record rule confirmed + A-9 edge; order per filter; `Load more` error copy; load-error notice lifetime; `View image` tab pattern (M1) and referrer note; `.btn-sm` on `View image` and `Re-review evidence`; reject 400 `reviewer_note_invalid` `{ maxLength: 500 }`; Data section rewritten to the built contract (queue shape, `total`, `awaitingReviewCount`, `verification.checks`, A-4 / A-7 / A-8 as built, A-9 new); new `Current vs design` section; open rows 263 / 264. `_shared.md` N-23 (g) points at the built contract.

### Verdict
**FAIL** (minor only): findings 50 and 51. Findings 37, 38, 40, 46, M4 (apart from 50) and reviewer M1–M3 are closed; build health clean (tsc, 288 tests, build 492 kB). Both fixes are small and local to `verifications.panel.ts` (+ one `_ops.scss` rule and one test). `SCREEN_MAP.md` stays `built`. The screen also needs `feat/api-verification-answers` merged first (the queue is 404 on `main`).

## Re-audit 2026-10-21: verification cards fixes (`feat/admin-verification-cards` @ `7c6bb3a`, `2f579c0`)

Audited: web-parity `7c6bb3a` (`fix(angular-admin): drop the verification load-error notice when the next load starts`) and `2f579c0` (`style(angular-admin): 40px target for small actions in verification detail rows`), merged into `docs/admin-verification-cards-audit`. Files: `apps/admin/src/app/features/admin/panels/verifications.panel.ts`, `verifications.panel.spec.ts`, `apps/admin/src/styles/_ops.scss`. Against the spec `docs/specs/admin/p-runners-verification-documents.md` and the "Re-audit 2026-10-21: verification cards" section above.
Build health (worktree, `node_modules` linked from the main tree and removed afterwards): `tsc -p tsconfig.app.json --noEmit` and `tsconfig.spec.json` clean; `ng test --watch=false` 28 files, **290 tests pass** (was 288). Builder reports `ng build` 492.12 kB, under budget (not re-run; the diff adds one CSS rule and a few lines of TS). Token scan of the diff: no hex, no `font-family`, no inline `style=`; the new rule sets only `min-height`. No wallet / escrow wording.

### Findings re-checked
| # | Verdict | Evidence |
|---|---|---|
| 50 | PASS | `notice` now carries an optional `fromLoad` mark (`verifications.panel.ts:529`); `load()` (`:552`) and `loadMore()` (`:578`) call `clearLoadNotice()` (`:849-851`) before the request, which clears only a load-error notice; both catch blocks set the load notice with `fromLoad: true` (`:566-570`, `:584-588`). Save, forbidden, image and info notices go through `notify()` without the mark and survive a reload: the 409 / 404 path (`reviewFailed`, `:670-672`) calls `load()` first and then sets `This check was already decided. The list is updated.`, so the info shows; the 403 path never reloads. A reload that fails again sets a fresh load notice. Tests: refresh after a failure drops the notice before the answer and shows the card (`spec :836-864`, also via a filter change), the empty state after a failure shows `No applications match` with no `.panel-notice` (`:817-819`), a save error survives a refresh (`:866-876`), retrying `Load more` drops the old notice (`:912-916`). |
| 51 | PASS | `View image` is `btn btn-text btn-sm` (`:314`; 12.5 px, `.btn.btn-text.btn-sm` padding 4 px 2 px, `_ops.scss:1148-1155`), sized to the detail row; `Re-review evidence` is `btn btn-outline btn-sm` (`:406`) and gets its 40 px target from `.doc-detail .verif-actions .btn { min-height: 40px; }` (`_ops.scss:638-640`), same height and font size as `Approve` / `Reject`, so it is not more prominent. Tests assert both class lists (`spec :356`, `:526`). |

### Owner answers recorded in the specs (2026-10-21; API side on `feat/api-verification-answers`, not counted against this build)
- Row 263 (a) downgrade both ways and (b) legacy `side = null` IDs count toward Level 2 (exact legacy rule pending confirmation): spec Level line, Data A-4, Owner decisions, Open questions; runner `_shared.md` §0 (rows 263, 264) and §7. (c) backfill was not in the answer as relayed: left open.
- Row 264 with A-9: filters and orders confirmed; pending counted on the newest record per (type, side). Spec Status filter, Check rows edge, Paging order, Data A-9.
- Admin copy check for a downgrade: the level line needs no change. A runner who drops back reads `Level 1 — Basic · Level 2 needs: {list}` from the API level, and `{list}` names the pending or rejected side / selfie because it is built from the newest records. The panel note `A runner reaches Level 2 when both ID sides and the selfie are approved.` stays true; an optional wording that mentions the drop is offered as AQ-39 (owner, not required).
- Follow-up N-L1 (minor, api-contract then web-parity; not a finding): with (b), `levelLine` (`verifications.panel.ts:152-181`) does not know that an approved legacy ID fills a side, so a Level-1 runner with an approved legacy ID is told `ID front` / `ID back` are needed when the API already counts it. Recommended: the API sends the Level-2 gaps (`verification.level2Missing`) on the queue item and decision answer, and the client reads them. Harmless while no runner has an approved legacy ID image.
- Runner app: no screen change needed for a downgrade (the app shows the API level, the §9 gate already blocks going online while a required check is not approved, and a runner can only re-upload after a rejection). Two items recorded in runner `_shared.md` §7: RN-L1 (the row-209 `National ID` status and the R-19 helper ignore legacy IDs while the API now counts them for Level 2; one rule needed in both places) and RQ-L1 (owner: does a drop to Level 1 affect an accepted job or open offers?).

### Verdict
**PASS.** Findings 50 and 51 closed; together with the previous re-audit, findings 37, 38, 40, 46, M4 and reviewer M1–M3 are closed. `SCREEN_MAP.md` set to `matches-design`. The screen reads `GET /runners/verifications/queue`, which exists only on `feat/api-verification-answers`; that branch must merge before (or with) `feat/admin-verification-cards`.

## Re-audit 2026-10-21: verification level follow-up (`feat/admin-verification-cards` @ `e2530c4`, `f1255f4`)

Audited: web-parity `e2530c4` (`feat(angular-admin): note that a runner drops back to Level 1 while a Level 2 check is rejected or replaced`, owner row 267) and `f1255f4` (`fix(angular-admin): read Level 2 needs from the API level2Missing`, N-L1), merged into `docs/admin-verification-cards-audit` (`24cba9f`). Files: `apps/admin/src/app/core/api-types.ts`, `features/admin/admin-data.service.ts`, `features/admin/panels/verifications.panel.ts`, `verifications.panel.spec.ts`. Contract checked against api-contract's `feat/api-verification-answers` (`b17b7eb` … `df1659a`).

Build health (auditor rerun in a scratch copy of the worktree's `apps/admin` with the main tree's `node_modules` linked): `tsc -p tsconfig.app.json --noEmit` and `tsconfig.spec.json` clean; `ng test --watch=false` 28 files, **293 tests pass** (was 290). Builder reports `ng build` OK (not re-run; no template structure or style change). Token scan of the diff: no hex, no `font-family`, no inline styles.

### Checked
| Area | Verdict | Evidence |
|---|---|---|
| Panel note (row 267) | PASS | `verifications.panel.ts:247-251` reads `Opening an image is logged. Images are deleted at the end of the retention period. A runner reaches Level 2 when both ID sides and the selfie are approved, and drops back to Level 1 while any of them is rejected or replaced.`; the spec test asserts the full text. One sentence, as the owner approved; the wording is proposed (spec Copy flags it). No `Approve → runner level upgrades`. |
| Level line from `level2Missing` (N-L1) | PASS | `levelLine(level, level2Missing)` (`:165-186`) maps `government_id_front`, `government_id_back`, `selfie` to `ID front`, `ID back`, `selfie` (`LEVEL_2_NAMES`, `:154-158`) in the API's order; the row lookup (`LEVEL_2_CHECKS` over `checkRows`) is gone. `levelParts` (`:818-823`) reads `runnerProfile.level2Missing`, then `verification.level2Missing`; empty or absent → level only; level ≥ 2 → label only; level number still Fira Code through `app-num-text`. |
| Decision answer, incl. 2 → 1 | PASS | `levelFromAnswer` (`admin-data.service.ts:701-722`) takes `verificationLevel` and `level2Missing` from the PATCH answer's `runnerProfile` and copies the gaps onto `verification`; a bare answer leaves the card unchanged. The API answer carries both (`fa9adf8`, e2e `6bb5323`). |
| Types | PASS | `Level2Check` and optional `level2Missing` on `AdminRunnerRef` and the queue item's `verification` (`api-types.ts:772-777, 820-821`) match `verification-summary.ts` on the API branch. |
| Tests | PASS | New: legacy ID counted by the API (`Level 2 needs: selfie` with no `· Back` record), in-place update after Approve, line back to `Level 1 — Basic · Level 2 needs: selfie` after a Reject that drops the level; the `levelLine` unit test covers all / one / empty / absent / Level 2 / no level. |
| Domain | PASS | No new state, no wallet wording; the drop is the API's (row 263), the client never infers the level. |

### Contract alignment (spec Data and runner `_shared.md` updated this round)
- A-9 (`b17b7eb`, `5e6e369`): pending, `oldestPendingAt`, the `Pending` filter and `awaitingReviewCount` on the newest record per (type, side). No client change.
- Row 263 (`713cdc1`, `3bf75e7`): `2_id_verified` ↔ `1_basic` in the decision's or upload's transaction under the profile lock; deciding a superseded record changes nothing; levels 3 / 4 untouched.
- Row 268 (`050d2fb`, `fb4e90c`): approved unlabelled IDs fill a missing side (labelled records win; one side per record, front first); pending / rejected unlabelled records fill nothing. Applies to `verification.checks` and `level2Missing`.
- N-L1 / RN-L1 (`fa9adf8`, `6bb5323`): `level2Missing` on queue item `runnerProfile` and `verification`, PATCH answer `runnerProfile`, per-check list items' `runnerProfile`, `GET /runners/me` `verification`.
- Row 266 (`fa2f649`, `3efcfcb`): open offers withdrawn on any drop through the expiry path (`job:offer_withdrawn` reason `expired`, task stays RUNNER_ASSIGNED, no admin feed item); accepted and in-progress jobs continue.
- Row 265 (`d7e79ed`, `df1659a`): `npm run runners:recheck-level2` dry run (READ ONLY) / `-- --apply`, hand-run at deploy.

### Owner rows (open, not counted)
Row 269 (levels 3 / 4), 270 (admin feed item on a drop), 271 (superseded pending records), 272 (script sockets with queue workers off), 273 (availability offline at a drop). None changes this screen as built; spec Open questions records them.

### Runner-app impact (needs, not findings against this build)
- RN-L1 (core-ui, then flutter-runner): core `RunnerVerificationDocuments.nationalIdStatus` (`packages/nitume_core/lib/src/models/runner_account.dart`, R-19) ignores unlabelled ID records while the API summary now counts an approved one as a side; `v-onboard-pending` could show `National ID · Not started` and an upload prompt to a runner the API treats as having that side (and an upload would drop them to Level 1). Parse `level2Missing` in `RunnerVerificationSummary` and take the ID side statuses from the API summary (or mirror the row-268 rule).
- Level can drop (rows 263, 265): no runner copy; screens re-read on open, resume and the verification push.
- Offers withdrawn (row 266): `job:offer_withdrawn` reason `expired` is already handled by v-jobs (card removed, unavailable snackbar); no change unless row 273 says the runner goes offline.

### Verdict
**PASS.** No findings. N-L1 closed; AQ-39 closed by row 267. `SCREEN_MAP.md` stays `matches-design`. `feat/api-verification-answers` must merge before (or with) `feat/admin-verification-cards`: the queue and `level2Missing` do not exist on `main`.

## Owner answers 2026-10-21: rows 267, 269–275 (`docs/verification-owner-answers-269`)

Spec-only round plus a desk check of `feat/admin-verification-cards` @ `f1255f4` (identical in this worktree) against the answers. The owner approved every recommendation on 2026-10-21. Spec updated: `docs/specs/admin/p-runners-verification-documents.md` (`Owner answers 2026-10-21`, Check rows, Answers and errors, Card header, Copy, Numeric fields, Data), `docs/specs/admin/drawer-task-offer.md` (Live updates: `runner_level_dropped`), `docs/specs/admin/_shared.md` §1 (rows 263–275).

| Row | Answer | Admin effect |
|---|---|---|
| 267 | Panel note wording confirmed as built | Copy now owner-approved; no change |
| 269 | Levels 3 / 4 untouched | none |
| 270 | Feed item `runner_level_dropped`, `{runner} dropped to Level 1 — open offer on {task} withdrawn` | API (api-contract, `feat/api-level-drop-followups`). The admin web renders no API notification feed today (`Live feed` is derived from tasks), so no web-parity item |
| 271 | Superseded `pending` records stay; admin hides their Approve / Reject | Card already shows only the newest record per check (no actions on older ones). W-1 below for the client count |
| 272 | Script not pushing sockets accepted | none |
| 273 | Runner set offline at the drop | none (runner `v-jobs`) |
| 274 | Customer badge shows the live level | none |
| 275 | Runner `Verified` caption, no Retake | none |

### p-runners-verification-documents: FAIL (2 minor, from the answers; the build was PASS before them)
1. **W-1 (minor)** `apps/admin/src/app/features/admin/admin-data.service.ts:626-629` (`reviewVerification`) and `:737` (`mergeQueuePage`). Design (row 271 with A-9): a check is pending only when its **newest** record per (type, side) is `pending`; superseded older `pending` records never count. Code: `hadPending`, `pendingCount` and the decision that decrements `awaitingReviewCount` use `item.checks.some/filter(c => c.status === 'pending')` over every record, history included. Effect: a runner whose ID front was re-uploaded while the first upload was still pending (two `pending` front records), with nothing else pending, is approved on the newest front; the client still sees the old `pending` record, so the topbar `{n} applications awaiting review` is not decremented (the API's count is), and the merged `pendingCount` is 1. Fix: count pending over the newest record per (type, side) only (reuse the newest-per-check pick of `checkRows`, `verifications.panel.ts:106-128`, moved to a shared helper), in both places. Test: two `pending` ID front records (older and newer), all other checks decided; Approve the newer → topbar count minus one and `pendingCount` 0.
2. **W-2 (minor)** `apps/admin/src/styles/_ops.scss:585-590` and `verifications.panel.ts:279-282`. Design (design rules, ruled 2026-10-21; resolves the spec contradiction between Card header "whole `.verif-sub` line is Fira Code" and Numeric fields "area name Fira Sans"): Fira Code only for numeric data, so on `Applied {relative time} · {area}` only the relative time value and `+{n}` are Fira Code; `Applied`, `·` and the area name are Fira Sans. Code: `.verif-sub` sets `font-family: var(--nitume-font-num)` on the whole line (as the mockup CSS does), so `Applied` and `Nairobi` render in Fira Code. Fix: drop the font-family from `.verif-sub` (Fira Sans inherits); render `appliedLine` through `app-num-text` with the relative time and `+{n}` as number parts; keep the `{short id} · {phone}` line in Fira Code (wrap in `.num` or a `.verif-sub.num` modifier). Test: on the Applied line, `Applied` and the area name are outside `.num`, the relative time inside; the id/phone line is inside `.num`.

Not a finding (note for the orchestrator): the shared A-03 topbar `.sub` (`_ops.scss:172-177`, `_shared.md` §4, every panel) is all Fira Code in the mockup and the build, so `applications awaiting review` and similar words render in Fira Code. Same rule as W-2, but it touches every panel; left for a separate decision.

Verdict: **FAIL** (minor W-1, W-2). `SCREEN_MAP.md` moved from `matches-design` to `built` until both are fixed and re-audited. Tokens, contrast, domain and copy unchanged from the PASS above.
