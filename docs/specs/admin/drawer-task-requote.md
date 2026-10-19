# drawer-task-requote — Quote section and "Issue new quote" action in the task drawer

- Mockup: `#drawer-task` has no quote content; the queue's `Assign` / `View` row buttons are the only admin actions drawn. The current build already adds an `Admin actions` card with `Issue quote` (REQUESTED). **EXTENDS MOCKUP**: a `Quote` section showing the current quote and its expiry, and an `Issue new quote` action for a QUOTED task whose quote has expired (row 46). Built from `.drawer-section` / `.drawer-card` / `.drawer-row`, A-08 for the form dialog and the design-system form field. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md`
- Implementation: `apps/admin/src/app/features/admin/drawers/quote.section.ts`, `quote-dialog.ts` (in `task-drawer.ts`)
- Status: partial (round 14, row 233: new quote refusal row in Errors; the rest matches-design: re-audit round 5, 2026-10-12, `fix/angular-admin-owner-answers-5` @ `053fbc6`: PASS; m-8 closed; see Current vs design)

## Purpose
A customer cannot accept or pay an expired quote (`quote_expired`, row 46). Ops must see that a quote has expired and issue a fresh one. On a QUOTED or ACCEPTED errand with an expired newest quote, `POST /errands/:id/quote` writes a new quote and updates the quoted price **without a status change** (QUOTED stays QUOTED; ACCEPTED stays ACCEPTED and the customer must accept/pay the new quote, row 72). A quote that has not expired cannot be replaced (`quote_still_valid`, row 88). Every quote has an expiry, 24 h by default (row 83). After expiry the customer can ask for a new quote (row 68); the section shows that request.

## Entry / exit
- Inside the task drawer; no navigation. The section appears for `QUOTED` and `ACCEPTED` tasks (and read-only for later states, see below).
- After a successful re-quote the drawer stays open and re-renders.

## Task states
| Errand status | Quote section | Action |
|---|---|---|
| REQUESTED | hidden (no quote yet; `GET /errands/:id/quote` → 404) | existing `Issue quote` (first quote, REQUESTED → QUOTED) |
| QUOTED, quote valid | shown | none; hint line (Copy) |
| QUOTED or ACCEPTED, legacy quote without expiry | shown, `No expiry` | none until the API backfills an expiry (N-11) |
| QUOTED, quote expired | shown, flagged | `Issue new quote` (primary) |
| ACCEPTED, quote expired | shown, flagged | `Issue new quote` (primary) plus the hint line (row 72; the round-3 API is on `main`, so no feature detection: the `quoteAcceptanceRequired` gate was removed in `1f24c63`, accepted). The task stays ACCEPTED. The API refuses with 409 `payment_in_progress` when the customer has started paying (see Errors) |
| PAYMENT_CONFIRMED and later | shown read-only (the quote that was paid) | none |
| CANCELLED / EXPIRED / FAILED | shown read-only if a quote exists | none |

"Expired" = latest quote has `expiresAt` and `expiresAt <= now` (same rule as the API's `assertQuoteCurrent`). A legacy quote with `expiresAt = null` is shown as `No expiry` and is not replaceable until the API backfills it (row 83 makes null invalid; N-11). Re-evaluate every 30 s while the drawer is open so the flag appears without a reload.

## Layout
`.drawer-section`, `.drawer-label` `Quote`, `.drawer-card` rows:
- `Quoted total` → `KSh 1,450` (Fira Code). Per row 34 this is the customer-facing "Total (service + runner fee)"; admin may expand components (below).
- `Issued` → `formatDateTime(quote.createdAt)` (Fira Code).
- `Valid until` → `formatDateTime(expiresAt)` (Fira Code), or `No expiry` (Fira Sans slate-600). When expired the label reads `Expired` and the value is followed by a chip A-02 tone `pending`, text `Quote expired`. This chip is a flag, not a task state: the errand chip in the summary still reads `Quoted` (the UI never invents a state).
- Optional disclosure `.btn .btn-text` `Show fee breakdown` → rows `Base fee`, `Distance fee`, `Time fee`, `Urgency fee`, `Complexity fee`, `Premium fee` (Fira Code; zero rows omitted). Internal to ops only (row 34).
- Under the card:
  - QUOTED, not expired, with expiry: 12 slate-600 `You can issue a new quote after this one expires at {time}.`
  - QUOTED, expired: `.drawer-actions` with one full-width `.btn .btn-primary` `Issue new quote`.
  - ACCEPTED, expired: `.drawer-actions` with `Issue new quote` (row 72), plus 12 slate-600 `This quote expired after the customer accepted it. They can't pay until it is re-quoted.`
  - **Customer asked for a new quote** (row 68): when `quoteRequestedAt` is set and later than the newest quote's `createdAt`, a row above the actions: chip A-02 tone `pending`, text `New quote requested` (a flag, not a task state), and 12 slate-600 `Customer asked for a new quote {date, time}.` (time Fira Code). It clears once a new quote is issued.

### Issue new quote dialog
A-08 in form mode (wider: max-width 440), same field set as the existing `Issue quote` modal, re-titled:
- Title `Issue new quote` · sub 13 slate-600 `The last quote for #NT-10482 expired {date, time}. The task stays Quoted and the customer is asked to accept the new price.`
- Fields (A-06, two-column grid on ≥ 400px, labels above inputs):
  - `Total (KSh)`: money input (§3), required, **prefilled** with the previous total.
  - `Base fee`, `Distance fee`, `Time fee`, `Urgency fee`, `Complexity fee`, `Premium fee`: money inputs, optional, prefilled from the previous quote. Hint under the group: `Fee breakdown is internal. The customer sees only the total.` When at least one component is filled and the components don't add up to the total, a 12 slate-600 line `Components add up to KSh {sum}.` (information only, the API does not require a match).
  - `Valid until`: `datetime-local`, Fira Code value, default now + 24 h, **required in both the first `Issue quote` and the `Issue new quote` dialog** (row 83: every quote requires an expiry).
  - `Note (optional)`: textarea, max 500, counter `0/500` (Fira Code). Recorded with the quote request; not a history row on re-quote (N-4).
  - `Currency` is not shown; send `KES` implicitly (the API default). The existing modal's free-text `Currency` input is removed.
- Actions: `Back` (outline) / `Issue new quote` (primary; label `Issuing…` while saving).

## Validation (mirrors `QuoteErrandDto`)
| Field | Rule | Message |
|---|---|---|
| Total | required, number, 1 – 10,000,000, ≤ 2 decimals | `Enter a total between KSh 1 and KSh 10,000,000.` |
| Each component | empty, or number ≥ 0, ≤ 2 decimals | `Enter an amount in KSh, up to 2 decimal places.` |
| Valid until | required, must be later than now + 5 min | `Choose a time in the future.` |
| Note | ≤ 500 chars | counter stops input |

Body sent: `{ total: number, baseFee?: number, distanceFee?: number, timeFee?: number, urgencyFee?: number, complexityFee?: number, premiumFee?: number, expiresAt: ISO-8601 string with offset, note?: string }`. Empty components are **omitted**, not sent as `""` (the DTO uses `@IsNumber`, so strings fail with 400).

## Request states
- Loading the quote: inline `.ops-loading` inside the section `Loading quote…`; on failure the section shows 12 slate-600 `Couldn't load the quote.` + `.btn .btn-text` `Try again` (the rest of the drawer still renders).
- Saving: dialog buttons disabled, primary `Issuing…`.
- Success: dialog closes; the section re-renders from the response `quote` (`{ errand, history: null, quote }`); A-11 success notice `New quote issued: KSh 1,450, valid until {date, time}.`; the queue row value updates to the new `quotedPrice`.
- Errors (A-14):

| Response | UI |
|---|---|
| 409 `quote_still_valid` (extra `expiresAt`) | Close the dialog, reload the quote, A-11 info `The current quote is still valid until {expiresAt}. You can replace it after it expires.` |
| 409 `payment_in_progress` (ACCEPTED: the customer started paying this quote; row 72 re-quote guard, on `main`) | Close the dialog, reload the errand and quote; A-11 info `The customer has started paying this quote, so it can't be replaced now. Showing the latest.` (added 2026-10-09 round 4, m-7) |
| 4xx `location_outside_service_area` (row 233, decided 2026-10-19: refuse at quote a task inside no configured service area; code proposed, api-contract names it) | Keep the dialog open; A-11 danger `This task's location is outside every service area, so it can't be quoted. The customer is told and can cancel it.` (proposed copy; row 236, decided 2026-10-19: the customer is notified and may cancel (REQUESTED, QUOTED or ACCEPTED), there is no admin cancel). The quote refusal triggers the customer notification (API). The customer may cancel a REQUESTED/QUOTED task; ops have no cancel there (§3.3) |
| 409 without code (status changed, e.g. customer accepted or cancelled meanwhile) | Reload the errand and quote; A-11 info `This task changed while you were editing. Showing the latest.` |
| 403 (`ForbiddenException`: actor cannot re-quote) | `_shared.md` §2 |
| 400 `quote_expiry_in_past` (row 83: the chosen `Valid until` passed while the dialog was open; `feat/api-owner-answers-4`) | Dialog stays open, inputs kept; A-11 danger `The expiry time has passed. Choose a later time.` and field error `Choose a time in the future.` on `Valid until` (2026-10-09 round 4, m-6: replaces the builder's generic `Check the amounts and the expiry time.`, because the amounts are fine) |
| 400 validation (`message[]`) | A-11 danger in the dialog `Check the amounts and the expiry time.` plus field errors where the property name matches |
| network / 5xx | A-11 danger in the dialog `Couldn't issue the quote. Try again.`; inputs kept |

## Components
| Pattern | Id | Status |
|---|---|---|
| Drawer section/card/row/actions | A-05 | exists |
| Chip (errand state; `Quote expired` flag in pending tone) | A-02 | exists |
| Dialog (form mode) | A-08 | **NEW** (replaces the unstyled `.drawer-modal`) |
| Form fields, money inputs | A-06 | exists; **NEW** hint/error + `app-form-field` |
| Buttons | A-07 | exists (must use `.btn` base) |
| Notices | A-11 | **NEW** |
| Formatting | A-13 | **NEW** |
| Error mapping | A-14 | **NEW** |

## Copy (proposed; collected)
`Quote`, `Quoted total`, `Issued`, `Valid until`, `Expired`, `No expiry`, `Quote expired`, `New quote requested`, `Customer asked for a new quote {date, time}.`, `Show fee breakdown` / `Hide fee breakdown`, `Base fee`, `Distance fee`, `Time fee`, `Urgency fee`, `Complexity fee`, `Premium fee`, `You can issue a new quote after this one expires at {time}.`, `Issue new quote`, `Issuing…`, `Total (KSh)`, `Fee breakdown is internal. The customer sees only the total.`, `Components add up to KSh {sum}.`, `Note (optional)`, `Back`, plus the notices and errors above.

## Numeric fields (Fira Code)
Quoted total, every fee component (display and input values), `Issued` and `Valid until` / `Expired` times, the `Customer asked for a new quote` time, the component sum line, amounts and times inside notices, the task id, the note counter.

## Data
- Current quote: `GET /errands/:id/quote` (customer/runner/admin, exists) → `Quote { id, errandId, baseFee, distanceFee, timeFee, urgencyFee, complexityFee, premiumFee, total, currency, expiresAt, createdAt }`; 404 when not quoted yet (section hidden).
- Re-quote: `POST /errands/:id/quote` (admin, exists, `MatchingController`) → `{ errand, history: null, quote }` on re-quote; `{ errand, history, quote }` on the first quote. The admin client currently types the response as `Errand` (`api.service.ts` `quoteErrand`), which is wrong for both cases.
- Queue flag: **needs: api-contract (N-5)** `quoteExpiresAt` on `GET /errands` items so the queue can show `Quote expired` under the `Quoted` / `Awaiting payment` chip and sort those first. With N-13, tasks with an open customer request show `New quote requested` instead and sort first. Until then the flags exist only in the drawer.
- Expiry required: **needs: api-contract (N-11)** server default now + 24 h when `expiresAt` is omitted; backfill legacy nulls.
- Customer notification: **needs: api-contract (N-4)**: a re-quote emits nothing (no status change, no history row), so the customer never learns of the new price. Needs a push + socket event (e.g. `quote.reissued`) and an audit row.
- Customer request for a new quote (row 68): N-13 built on `feat/api-owner-answers-4` (not on `main` yet): `quoteRequestedAt` on the errand detail and list items (cleared by the next quote), `GET /errands?quoteRequested=true` and `GET /errands/count?quoteRequested=true`, an admin feed notification `quote_requested`, and a PROPOSED `quote:requested` socket to an `admins` room. The admin types `quoteRequestedAt` optional with `TODO(owner-answers-4)`.
  - **Now (accepted 2026-10-09 round 4)**: the queue flag, the requested-first sort and the `Task queue` badge come from the dashboard's loaded window (the newest 100 tasks), the same source as every other shell badge. No filter, count or socket call: the filter/count params would be rejected by `main` (unknown query property), and the admin app has no socket client (manual refresh, as the other panels).
  - **Now that `feat/api-owner-answers-4` is on `main`** (m-8, built in round 5): load `GET /errands?status=QUOTED,ACCEPTED&quoteRequested=true&limit=100` on dashboard load and refresh, merge it into the queue (dedupe by id; KPIs keep the newest-100 window) so a request on a task older than the newest 100 is never missed, and take the requested part of the badge from `GET /errands/count?status=QUOTED,ACCEPTED&quoteRequested=true`. The `status=QUOTED,ACCEPTED` filter is required (accepted 2026-10-12): the API clears `quoteRequestedAt` only when a new quote is issued, so a task cancelled or expired after the request keeps the timestamp, and the filter makes the server count match the client rule (`quoteRequested()`: QUOTED or ACCEPTED only). On an error each part keeps its last value (the badge falls back to the loaded rows). A live `quote:requested` push stays out of scope until the admin app gets a socket client.

## Accessibility
- The `Quote expired` chip also changes the row label to `Expired`, so the state is not colour-only.
- Dialog: focus trap, initial focus on `Total (KSh)`, ESC = Back (asks nothing; inputs are discarded).
- `datetime-local` has a visible label and a hint with the timezone: `East Africa Time`. The value is sent as UTC ISO-8601 with `Z` (`_shared.md` §3.1).

## Resolved by owner answers
- AQ-R1 (row 72): admin re-quote while ACCEPTED, no state change; the customer accepts/pays the new quote.
- AQ-R2 (row 83): every quote requires an expiry, default 24 h.
- SQ-9 (row 68): the customer taps `Request a new quote`; the task is then available for an admin to re-quote.
- Row 88: re-quote only after expiry; a valid quote is never silently replaced.

## Open questions for the owner
None.

## Current vs design
Re-audit round 5 (2026-10-12) against `fix/angular-admin-owner-answers-5` @ `053fbc6`: **PASS**.
1. m-8 closed (`5f4d4ba`): requested tasks merged into the queue and the badge's requested part from the count endpoint, both with `status=QUOTED,ACCEPTED` (accepted, Data); deduped by id; count error falls back to the rows; an answered request leaves the badge at once. Tested (params asserted).
2. Row 96 (`c42aff3`): `Valid until` is typed and shown in EAT and sent as UTC `…Z` (`eatLocalInputToIso`, `shared-format.ts:150`): accepted. The expired-quote line in the re-quote dialog body uses `formatDateTimeEat` (`… EAT`), as §3.1 asks for A-08 dialogs. Tested with a non-EAT process zone.
3. Round-4 cleanup (`16ad907`): `quoteRequestedAt` required; `TODO(owner-answers-4)` removed.

Round 2 spot-check (2026-10-09, `c1630ec`): m-6 closed (`d84b2aa`, notice `The expiry time has passed. Choose a later time.`, tested); m-7 closed (`1c87c75`, 409 `payment_in_progress` copy per Errors, tested). m-8 stays deferred until `feat/api-owner-answers-4` is on `main`.

Re-audit 2026-10-09 round 4 against `fix/angular-admin-owner-answers` @ `f1323de`: **PASS**, minors to fix on the next touch (the same branch is reopened for p-refunds):
1. Row 68 built: `New quote requested` flag chip and `Customer asked for a new quote {date, time}.` when `quoteRequestedAt` is later than the newest quote, on QUOTED/ACCEPTED only (`quote.section.ts` `pendingQuoteRequest`); queue flag replaces `Quote expired`, requested rows sort first, the badge counts them (`task-queue.panel.ts` `queueRank`, `admin-data.service.ts` `pendingCount`). Tested. Source limited to the loaded window: accepted (Data).
2. Row 83: `Valid until` required in both modes, default now + 24 h EAT; tested for the first-quote mode.
3. Row 72: `1f24c63` removed the `quoteAcceptanceRequired` feature detection; `canRequote` now offers `Issue new quote` on an expired ACCEPTED quote. Accepted: the round-3 API (`REQUOTABLE` = QUOTED, ACCEPTED) is on `main`.
4. m-6 (minor) `quote-dialog.ts:336-339`: 400 `quote_expiry_in_past` shows `Check the amounts and the expiry time.`; use `The expiry time has passed. Choose a later time.` (field error unchanged).
5. m-7 (minor) `quote.section.ts:257-270`: 409 `payment_in_progress` falls through to `This task changed while you were editing.`; use the copy in Errors. Reachable on `main` now that the ACCEPTED gate is gone.
6. m-8 (minor, deferred): adopt the `quoteRequested` filter and count once `feat/api-owner-answers-4` is on `main` (Data).

Earlier update (spec, 2026-10-09):
Spec update 2026-10-09 against `main` @ `c7675dc` (built and PASS in `docs/audits/admin-reaudit-2026-10-09.md`; now changed):
1. Row 68: show the `New quote requested` flag and line from `quoteRequestedAt` (once N-13 lands); queue flag and badge as in Data.
2. Row 83: confirm `Valid until` is required in the first `Issue quote` dialog too (`quote-dialog.ts` validates `expiresAt` in both modes; keep it, with a test for the first-quote mode).
3. Row 72 / 88: built as specced (`quoteAcceptanceRequired` gate; `quote_still_valid`). No change.
Status set to `partial` until re-audited.

Earlier record (2026-10-08, before the build):
`task-drawer.ts` today:
1. Shows `Issue quote` for both REQUESTED and QUOTED with no expiry check; on a QUOTED errand with a valid quote it gets `quote_still_valid` and only logs to the console (`console.error('Quote failed:', e)`), with no user feedback.
2. Sends every field as a string, including empty strings for blank components (`QuoteErrandDto` in `core/api-types.ts` is all `string`); the API DTO requires numbers, so the request fails with 400.
3. Shows `Assign runner` for REQUESTED and QUOTED, but assignment is only valid from PAYMENT_CONFIRMED (`MatchingController.assign` comment and §3.3). Out of this spec's scope, recorded for the parity audit.
4. Uses `.drawer-modal`, `.modal-*` and `.action-row` classes that have no styles anywhere in `apps/admin/src`, and `btn-primary` / `btn-outline` without the `.btn` base.
5. Has no quote section and never calls `GET /errands/:id/quote`.
