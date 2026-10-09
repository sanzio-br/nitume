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
- Spec: `drawer-task-requote.md` Current vs design 3; `Nitume_System_Design.md` §3.3 (PAYMENT_CONFIRMED → RUNNER_ASSIGNED is the only assignment transition; `MatchingController.assign` comment on the API).
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
