# drawer-task-merchant-details — Merchant Till/Paybill section of the task drawer

- Mockup: `#drawer-task` draws a `Payment` section with the rows `Service fee`, `Runner fee`, `Merchant amount`, `Total`, but nothing about where the merchant is paid. **EXTENDS MOCKUP**: a new `Merchant payment details` section in the same drawer, built from `.drawer-section` / `.drawer-card` / `.drawer-row` and the design-system form field. Copy is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md`
- Implementation: `apps/admin/src/app/features/admin/drawers/merchant-details.section.ts` (in `task-drawer.ts`)
- Status: partial (spec updated 2026-10-09 for rows 67, 80; see Current vs design)

## Purpose
Let ops enter or correct the merchant's Till (Buy Goods) or Paybill (+ account number) for a task, so the customer can choose to pay the merchant directly (`merchant_direct`). Row 43: the merchant/admin supplies these details; the customer only picks the route. Until details exist, the API refuses `merchant_direct` with `merchant_details_missing` and the customer app shows the "details not ready" state (`docs/specs/customer/x-merchant-payment.md`).

## Entry / exit
- Lives inside the task drawer (opened from the queue, live map, live feed). No navigation of its own.
- Position in the drawer: after the summary card and Items/Locations sections, before `Admin actions` and `Status history`. If the mockup `Payment` section is built later, this section sits directly under it.

## When it shows
- Shown, editable, only when the errand's category is `buy_for_me` or `pickup_delivery` (Buy For Me, Get It For Me): merchant amounts apply only to these two (row 80, decided).
- Other categories: the section is hidden. If such an errand already carries merchant fields (legacy data), show layout B **read-only** (no `Add`/`Edit`) with 12 slate-600 `Merchant details only apply to Buy For Me and Get It For Me.` so nothing is silently hidden.
- Editable in every non-terminal state. Read-only (no Add/Edit button) in the terminal states `SETTLED`, `CANCELLED`, `FAILED`, `EXPIRED` (the API's `ErrandStateMachine.isTerminal`; it answers `errand_closed` there).
- Most useful while `REQUESTED`, `QUOTED`, `ACCEPTED` (before the customer pays), and during `IN_PROGRESS` when an approved price increase is paid by the customer, manually, to the same Till (rows 44, 67).

## Layout
`.drawer-section`, `.drawer-label` `Merchant payment details`.

### A. No details yet (editable state)
`.drawer-card`:
- 13 slate-600: `No merchant details yet. The customer can't pay the merchant directly until you add them.`
- `.btn .btn-outline` (12.5/600, padding 8 16) `Add merchant details`, margin-top 10.

### B. Details set (read)
`.drawer-card` rows (`.drawer-row`, value right, Fira Code for numbers):
- `Merchant` → merchant name (Fira Sans 600, not Fira Code: it is text)
- Till: `Till number (Buy Goods)` → `5123456`
- Paybill: `Paybill number` → `247247`; `Account number` → reference (Fira Code; row omitted when empty)
- Footer right-aligned `.btn .btn-text` `Edit` (hidden in terminal states).

### C. Edit form (replaces the card content in place; no modal)
`.drawer-card` with fields stacked, gap 12:
1. Field A-06 `Merchant name`: text, `autocomplete="organization"`, maxlength 120, prefilled.
2. `Pay with` A-09 segmented toggle: `Till (Buy Goods)` | `Paybill`. Default: the saved type, else `Till (Buy Goods)`. Switching type keeps the other type's typed value in memory but sends only the selected one.
3. Till selected: Field `Till number`, `inputmode="numeric"`, Fira Code value, maxlength 10, placeholder `e.g. 5123456`.
   Paybill selected: Field `Paybill number` (same rules, placeholder `e.g. 247247`) and Field `Account number (optional)`, Fira Code, maxlength 40, hint `Only if the merchant gave you one.`
4. `.drawer-actions`: `.btn .btn-outline` `Cancel` and `.btn .btn-primary` `Save details` (flex 1 each, as the mockup's paired buttons). Save disabled until valid and changed.
5. Changing details that already existed on a task in `PAYMENT_CONFIRMED` or later (a merchant-direct payment may have started) opens A-08 first. Row 80: **warn, never block**; the customer is warned by the app and a notification. Title `Change the merchant details?` · body `The customer may already be paying the current {Till|Paybill} {number}. We'll tell them the details changed so they check before paying.` · buttons `Back` / `Save changes`. Success notice for this case: `Merchant details updated. The customer has been told to check them.` (once N-14 sends the notification; until then `Merchant details updated.`).

## Validation (client, mirrors `MerchantDetailsDto` and `setMerchantDetails`)
| Field | Rule | Message |
|---|---|---|
| Merchant name | trimmed length 2–120 | `Enter the merchant's name (at least 2 characters).` |
| Till number | digits only, 5–10 | `Enter a Till number of 5 to 10 digits.` |
| Paybill number | digits only, 5–10 | `Enter a Paybill number of 5 to 10 digits.` |
| Account number | trimmed 1–40 when given; only with Paybill | `Account number can be up to 40 characters.` |

Request body: `{ merchantName, tillNumber }` **or** `{ merchantName, paybillNumber, accountReference? }`. Never send both numbers; never send `accountReference` with a Till; omit empty optional fields (the API trims, then rejects an empty string).

## Request states
- Saving: `Save details` → `Saving…`, both buttons disabled.
- Success: back to read layout B with the response values; A-11 success notice inside the section: `Merchant details saved. The customer can now pay the merchant directly.` (first save) or `Merchant details updated.` (edit). The errand in `AdminDataService` is patched with the four fields.
- Errors (A-14):

| Response | UI |
|---|---|
| 400 `merchant_details_invalid` | A-11 danger in the form: `Give either a Till number or a Paybill number. An account number only goes with a Paybill.` (client validation should prevent it) |
| 400 validation (`message[]`, e.g. `tillNumber must be 5-10 digits`) | Map to the field errors above |
| 400 `merchant_details_not_applicable` (N-14: category is not Buy For Me / Get It For Me) | Switch to read-only; A-11 info `Merchant details only apply to Buy For Me and Get It For Me.` |
| 409 `errand_closed` | Switch to read-only; A-11 info `This task is {status label} and can no longer be edited.` (status label from A-02) and reload the errand |
| 404 | A-11 info `This task no longer exists.` |
| 403 | `_shared.md` §2 |
| network / 5xx | A-11 danger `Couldn't save the merchant details. Try again.`; inputs kept |

## Components
| Pattern | Id | Status |
|---|---|---|
| Drawer section/card/row/actions | A-05 | exists |
| Form fields + hint + error | A-06 | exists; **NEW** hint/error + `app-form-field` |
| Segmented toggle (Till / Paybill) | A-09 | **NEW** (green active segment with white text: an active toggle, allowed by the design system) |
| Buttons | A-07 | exists |
| Confirm dialog | A-08 | **NEW** |
| Notices | A-11 | **NEW** |
| Error mapping | A-14 | **NEW** |

## Copy (proposed; collected)
`Merchant payment details`, `No merchant details yet. The customer can't pay the merchant directly until you add them.`, `Add merchant details`, `Merchant`, `Till number (Buy Goods)`, `Paybill number`, `Account number`, `Edit`, `Merchant name`, `Pay with`, `Till (Buy Goods)`, `Paybill`, `Till number`, `Account number (optional)`, `Only if the merchant gave you one.`, `Cancel`, `Save details`, `Saving…`, plus the dialog, notice and error strings above. Row labels match the customer's `x-merchant-payment` labels (`Till number (Buy Goods)`, `Paybill number`, `Account number`) so ops and customer talk about the same fields.

## Numeric fields (Fira Code)
Till number, Paybill number, account number (display and input), task id in any notice.

## Data
- Read: `GET /errands/:id` (exists) returns `merchantName`, `merchantTillNumber`, `merchantPaybillNumber`, `merchantAccountReference` (entity columns) and `merchantDetailsAvailable`. The admin client type `Errand` in `core/api-types.ts` lacks these five fields: add them.
- Write: `PUT /errands/:id/merchant-details` (admin, exists) body as above → the updated `Errand`.
- Customer side effect: **needs: api-contract (N-14)**: a customer notification/socket event when merchant details are added (already listed in `x-merchant-payment.md` / `x-awaiting-quote.md`), and, on a change after a merchant-direct payment started, `merchantDetailsUpdatedAt` plus a `merchant_details.changed` notification (customer warning, row 80). The API refuses other categories (`merchant_details_not_applicable`).
- Task states: shown in all states for the two categories; editable in non-terminal ones; triggers no transition.

## Accessibility
- Segmented toggle is a `radiogroup` with arrow-key navigation and visible focus (2px green outline, offset 1).
- Number inputs use `inputmode="numeric"` and `pattern="\d*"`, not `type="number"` (no spinners, keeps leading zeros).
- Labels visible; errors tied with `aria-describedby`.

## Resolved by owner answers
- AQ-4 (row 80): merchant amounts only for Buy For Me and Get It For Me; a change after a merchant-direct payment started warns the customer, never blocks.
- Row 67: a merchant-direct increase is paid manually by the customer to the same Till.

## Open questions for the owner
None.

## Current vs design
Spec update 2026-10-09 against `main` @ `c7675dc` (built and PASS in `docs/audits/admin-reaudit-2026-10-09.md`; now changed):
1. Visibility: `merchant-details.section.ts:54-60` shows and edits the section for any errand with a merchant field set. Editable only for `buy_for_me` / `pickup_delivery`; other categories read-only with the explanatory line.
2. Warning dialog body (`:274-276`) and the success notice for a change after payment: new copy above.
3. Map `merchant_details_not_applicable` (once N-14 lands).
Status set to `partial` until re-audited.

Earlier record (2026-10-08, before the build):
No implementation. `task-drawer.ts` shows `Budget`, `Quoted`, Items, Locations, `Admin actions` and `Status history`; it has no merchant section and no `Payment` section (the mockup's `Payment` card with `Service fee` / `Runner fee` / `Merchant amount` / `Total` is not built either; out of this spec's scope, recorded for the parity audit).
