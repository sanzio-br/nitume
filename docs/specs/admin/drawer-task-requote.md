# drawer-task-requote — Quote section and "Issue new quote" action in the task drawer

- Mockup: `#drawer-task` has no quote content; the queue's `Assign` / `View` row buttons are the only admin actions drawn. The current build already adds an `Admin actions` card with `Issue quote` (REQUESTED). **EXTENDS MOCKUP**: a `Quote` section showing the current quote and its expiry, and an `Issue new quote` action for a QUOTED task whose quote has expired (row 46). Built from `.drawer-section` / `.drawer-card` / `.drawer-row`, A-08 for the form dialog and the design-system form field. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md`
- Implementation: none for re-quote. Extends `apps/admin/src/app/features/admin/drawers/task-drawer.ts` (existing `Issue quote` modal).
- Status: missing

## Purpose
A customer cannot accept or pay an expired quote (`quote_expired`, row 46). Ops must see that a quote has expired and issue a fresh one. On a QUOTED errand with an expired newest quote, `POST /errands/:id/quote` writes a new quote and updates the quoted price **without a status change** (QUOTED stays QUOTED). A quote that has not expired cannot be replaced (`quote_still_valid`).

## Entry / exit
- Inside the task drawer; no navigation. The section appears for `QUOTED` and `ACCEPTED` tasks (and read-only for later states, see below).
- After a successful re-quote the drawer stays open and re-renders.

## Task states
| Errand status | Quote section | Action |
|---|---|---|
| REQUESTED | hidden (no quote yet; `GET /errands/:id/quote` → 404) | existing `Issue quote` (first quote, REQUESTED → QUOTED) |
| QUOTED, quote valid or without expiry | shown | none; hint line (Copy) |
| QUOTED, quote expired | shown, flagged | `Issue new quote` (primary) |
| ACCEPTED, quote expired | shown, flagged | none: the API can't re-quote an ACCEPTED task (it would need ACCEPTED → QUOTED). Hint line + AQ-R1 |
| PAYMENT_CONFIRMED and later | shown read-only (the quote that was paid) | none |
| CANCELLED / EXPIRED / FAILED | shown read-only if a quote exists | none |

"Expired" = latest quote has `expiresAt` and `expiresAt <= now` (same rule as the API's `assertQuoteCurrent`). A quote with `expiresAt = null` never expires. Re-evaluate every 30 s while the drawer is open so the flag appears without a reload.

## Layout
`.drawer-section`, `.drawer-label` `Quote`, `.drawer-card` rows:
- `Quoted total` → `KSh 1,450` (Fira Code). Per row 34 this is the customer-facing "Total (service + runner fee)"; admin may expand components (below).
- `Issued` → `formatDateTime(quote.createdAt)` (Fira Code).
- `Valid until` → `formatDateTime(expiresAt)` (Fira Code), or `No expiry` (Fira Sans slate-600). When expired the label reads `Expired` and the value is followed by a chip A-02 tone `pending`, text `Quote expired`. This chip is a flag, not a task state: the errand chip in the summary still reads `Quoted` (the UI never invents a state).
- Optional disclosure `.btn .btn-text` `Show fee breakdown` → rows `Base fee`, `Distance fee`, `Time fee`, `Urgency fee`, `Complexity fee`, `Premium fee` (Fira Code; zero rows omitted). Internal to ops only (row 34).
- Under the card:
  - QUOTED, not expired, with expiry: 12 slate-600 `You can issue a new quote after this one expires at {time}.`
  - QUOTED, expired: `.drawer-actions` with one full-width `.btn .btn-primary` `Issue new quote`.
  - ACCEPTED, expired: 12 slate-600 `This quote expired after the customer accepted it. They can't pay until it is re-quoted.` (see AQ-R1).

### Issue new quote dialog
A-08 in form mode (wider: max-width 440), same field set as the existing `Issue quote` modal, re-titled:
- Title `Issue new quote` · sub 13 slate-600 `The last quote for #NT-10482 expired {date, time}. The task stays Quoted and the customer is asked to accept the new price.`
- Fields (A-06, two-column grid on ≥ 400px, labels above inputs):
  - `Total (KSh)`: money input (§3), required, **prefilled** with the previous total.
  - `Base fee`, `Distance fee`, `Time fee`, `Urgency fee`, `Complexity fee`, `Premium fee`: money inputs, optional, prefilled from the previous quote. Hint under the group: `Fee breakdown is internal. The customer sees only the total.` When at least one component is filled and the components don't add up to the total, a 12 slate-600 line `Components add up to KSh {sum}.` (information only, the API does not require a match).
  - `Valid until`: `datetime-local`, Fira Code value, default now + 24 h, required in this dialog (a quote with no expiry could never be replaced again; AQ-R2).
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
| 409 without code (status changed, e.g. customer accepted or cancelled meanwhile) | Reload the errand and quote; A-11 info `This task changed while you were editing. Showing the latest.` |
| 403 (`ForbiddenException`: actor cannot re-quote) | `_shared.md` §2 |
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
`Quote`, `Quoted total`, `Issued`, `Valid until`, `Expired`, `No expiry`, `Quote expired`, `Show fee breakdown` / `Hide fee breakdown`, `Base fee`, `Distance fee`, `Time fee`, `Urgency fee`, `Complexity fee`, `Premium fee`, `You can issue a new quote after this one expires at {time}.`, `Issue new quote`, `Issuing…`, `Total (KSh)`, `Fee breakdown is internal. The customer sees only the total.`, `Components add up to KSh {sum}.`, `Note (optional)`, `Back`, plus the notices and errors above.

## Numeric fields (Fira Code)
Quoted total, every fee component (display and input values), `Issued` and `Valid until` / `Expired` times, the component sum line, amounts and times inside notices, the task id, the note counter.

## Data
- Current quote: `GET /errands/:id/quote` (customer/runner/admin, exists) → `Quote { id, errandId, baseFee, distanceFee, timeFee, urgencyFee, complexityFee, premiumFee, total, currency, expiresAt, createdAt }`; 404 when not quoted yet (section hidden).
- Re-quote: `POST /errands/:id/quote` (admin, exists, `MatchingController`) → `{ errand, history: null, quote }` on re-quote; `{ errand, history, quote }` on the first quote. The admin client currently types the response as `Errand` (`api.service.ts` `quoteErrand`), which is wrong for both cases.
- Queue flag: **needs: api-contract (N-5)** `quoteExpiresAt` on `GET /errands` items so the queue can show `Quote expired` under the `Quoted` chip and sort those first. Until then the flag exists only in the drawer.
- Customer notification: **needs: api-contract (N-4)**: a re-quote emits nothing (no status change, no history row), so the customer never learns of the new price. Needs a push + socket event (e.g. `quote.reissued`) and an audit row.
- Customer request for a new quote: open (SQ-9, row 68). If the API adds a "new quote requested" marker, show it in this section as 12 slate-600 `Customer asked for a new quote {time}.` and count those tasks in the queue badge.

## Accessibility
- The `Quote expired` chip also changes the row label to `Expired`, so the state is not colour-only.
- Dialog: focus trap, initial focus on `Total (KSh)`, ESC = Back (asks nothing; inputs are discarded).
- `datetime-local` has a visible label and a hint with the timezone: `East Africa Time`.

## Open questions for the owner
- **AQ-R1 (state machine)**: A quote can expire after the customer accepted (ACCEPTED) but before paying; payment is then refused (`quote_expired`) and the API can't re-quote (ACCEPTED → QUOTED is not a transition). Options: allow admin re-quote on ACCEPTED without a status change, or the customer cancels and re-requests. Needs an owner decision (§3.3).
- **AQ-R2**: Should every quote have an expiry? The API allows none (never expires, can never be replaced). Build default: required in the admin dialogs, 24 h default.
- SQ-9 (row 68): how the customer asks for a fresh quote.

## Current vs design
`task-drawer.ts` today:
1. Shows `Issue quote` for both REQUESTED and QUOTED with no expiry check; on a QUOTED errand with a valid quote it gets `quote_still_valid` and only logs to the console (`console.error('Quote failed:', e)`), with no user feedback.
2. Sends every field as a string, including empty strings for blank components (`QuoteErrandDto` in `core/api-types.ts` is all `string`); the API DTO requires numbers, so the request fails with 400.
3. Shows `Assign runner` for REQUESTED and QUOTED, but assignment is only valid from PAYMENT_CONFIRMED (`MatchingController.assign` comment and §3.3). Out of this spec's scope, recorded for the parity audit.
4. Uses `.drawer-modal`, `.modal-*` and `.action-row` classes that have no styles anywhere in `apps/admin/src`, and `btn-primary` / `btn-outline` without the `.btn` base.
5. Has no quote section and never calls `GET /errands/:id/quote`.
