# v-new-details — New task, step 2: details

- Mockup: `docs/design/nitume_customer_app.html` lines 361–384 (`#v-new-details`, overlay)
- Shared conventions: `_shared.md` (OA-n = owner answers, §0)
- Implementation: `apps/customer_app/lib/src/screens/wizard/details_screen.dart` (+ `task_draft.dart`) on branch `feat/customer-owner-answers`
- Status: partial (rows 206, 221: the `Flexible` deadline caption is not built; everything else matches-design)

## Purpose
Collect what the runner must do, where, by when, the item budget (Buy For Me and Get It For Me only), and (for Buy For Me) a structured shopping list.

## Entry / exit
- Entry: "Continue →" on `v-new-category`.
- Back → `v-new-category` (keep entered values).
- "Continue →" (valid form) → push `v-new-review`.

## Task states
Pre-DRAFT (client-side form). Nothing is posted until step 3.

## Layout (top to bottom)
1. Pushed header (C-10): title + `Step 2 of 3`.
2. Stepper (C-14): segments 1–2 done.
3. Scrollable body of form cards (C-17 `NitumeFormCard`: white, slate-line, r-m 14, padding 16, margin `0 20 14`). Each card has the mockup's uppercase card heading (11/700, slate-600, letter-spacing .04em, margin-bottom 8) and white 8px fields with green focus (OA-12). Inline errors in red 12.5 under the field (OA-13).

   Cards in this order (✱ = shown for that category only):

   | # | Card heading | Control | Categories |
   |---|---|---|---|
   | 1 | `Task title (optional)` | single-line field, max 60 chars | all (OA-15) |
   | 2 | `Describe the task` | multiline field, 3 rows | all |
   | 3a | `Location` | Places field (C-17 + `PlaceAutocompleteField`), leading pin icon | Check It For Me, Go There For Me, Wait For Me |
   | 3b | `Pick up from` + `Deliver to` | two Places fields in one card, label 12.5/600 above each, gap 12 | Get It For Me ✱ (OA-19) |
   | 3c | `Buy from` + `Deliver to` | two Places fields in one card | Buy For Me ✱ (OA-19) |
   | 4 | `Shopping list` | C-37 item rows + `+ Add item` | Buy For Me ✱ (OA-19) |
   | 5 | `Deadline` | choice chips (C-16) row, gap 8, wrap | all |
   | 6 | `Budget (if a purchase is involved)` | money field, Fira Code, `KSh` prefix | Buy For Me ✱, Get It For Me ✱ (row 45) |

   - Places fields: focusing with an empty query lists saved addresses (`v-addresses`) as rows with their label (`Home`, `Office`) and address; typing switches to Google Places results (row 30). A location counts as chosen only when the customer picks a suggestion or a saved address that has coordinates (row 60). Typing without picking leaves the field unchosen; editing the text of a chosen place clears the choice.
   - Shopping list (C-37): each row = item name field (required, max 80), quantity stepper (− / n / +, Fira Code 13/600, min 1, max 99, 32px buttons with 48dp hit areas), remove icon button (slate-400 ×, hidden when only one row). Rows separated by slate-line hairlines. Below the rows a green-700 link `+ Add item` (C-04). Max 30 items. Optional per-item note: not in MVP UI (the API accepts `notes`; leave empty).
4. Fixed primary CTA (C-01).

## Components
| Element | Component | Status |
|---|---|---|
| Form cards + fields + errors | C-17 `NitumeFormCard`, `NitumeField` (text, multiline, money) | built |
| Place fields | `PlaceAutocompleteField` + `PlaceSearchService` | built (interface); **NEW**: Google Places client (core-ui, row 30) |
| Saved-address suggestions | `PlaceAutocompleteField.savedAddresses` (shown while the query is empty) | built |
| Shopping list | C-37 | **NEW** |
| Deadline chips | C-16 | built |
| Header / stepper / CTA | C-10 / C-14 / C-01 | built |

## Copy (exact where from the mockup; others proposed)
- Header: `Task details`, `Step 2 of 3`
- Card headings (mockup): `Describe the task`, `Location`, `Deadline`, `Budget (if a purchase is involved)`
- Card headings (proposed, OA-15 / OA-19): `Task title (optional)`, `Pick up from`, `Buy from`, `Deliver to`, `Shopping list`
- Title placeholder (proposed): `e.g. Apartment check — Nyali`
- Description placeholder (mockup): `e.g. Check the apartment in Nyali — video the compound, both bedrooms and bathroom.`
- Location placeholder (proposed): `Search for a place`; mockup sample value `Links Road Apartments, Nyali` (pin is an icon, not text)
- Shopping list item placeholder (proposed): `Item, e.g. 2kg sugar`; link `+ Add item`
- Deadline chips (mockup): `Today`, `Tomorrow`, `Flexible` (Today selected by default)
- Budget placeholder: `KSh 0`
- CTA: `Continue →`

Validation (proposed copy; shown on Continue, then live):
- Description under 5 characters (API `MinLength(5)`): `Tell the runner a bit more (at least 5 characters).`
- Missing location: `Choose a location.` (each of the two fields in 3b/3c: `Choose where to pick up.` / `Choose where to buy.` / `Choose where to deliver.`)
- Text typed but no place picked (row 60, proposed): `Choose a place from the list.`
- Buy For Me with no shopping-list item name: `Add at least one item.`
- Budget over 1,000,000: `Enter an amount up to KSh 1,000,000.`
- Buy For Me with budget 0: `Enter a budget for the items.`
- Title over 60 characters: `Keep the title under 60 characters.`
- Title of 1–2 characters (the API accepts 3–120): `Use at least 3 characters, or leave it empty.` (builder copy, accepted in the 2026-10-07 re-audit)
- No Places client (a build without a Places key; Places itself is approved, row 30): C-40 notice under the location card `Place search isn't available yet. Choose one of your saved addresses that has a map location.` (builder copy, accepted in the 2026-10-07 re-audit). Production builds always have the key, so this state is for dev builds only.
- Places error/offline: inside the suggestions `Couldn't search places. Check your connection.`
- Editing the text of a chosen place clears the choice at once (the draft location becomes empty, so Continue shows `Choose a place from the list.`); re-picking restores it. Clarified in the 2026-10-09 re-audit: the wizard never submits a place that differs from the field text.
- CTA is always enabled; tapping with errors scrolls to the first error.

## Rules
- **Deadline** (OA-19: `deadline_at` authoritative, urgency derived): Today → `deadlineAt` = today 23:59 local, sent as ISO 8601 UTC; Tomorrow → tomorrow 23:59 local; Flexible → no `deadlineAt`. The client **never sends `urgency`**; the backend derives it from `deadlineAt`.
- **Every task has a deadline (row 206, owner 2026-10-19)**: "every task has deadlineAt — required at creation; the contract defines a default when the customer gives none; no indefinite tasks." `Flexible` keeps sending no `deadlineAt`; the API sets the contract default. **Default (decided, owner 2026-10-19, rows 221, 235)**: 24 h, counted from **payment confirmation**, not from creation (row 235: "when the customer gives no deadline, the default 24 h starts at payment confirmation"). **Storage (row 239 (a), decided 2026-10-19)**: a `Flexible` task has no `deadlineAt` until payment; the API sets it at payment confirmation. Why it matters to the customer: a task nobody accepts by its deadline expires (row 185), so `Flexible` must not read as "no time limit".
  - Caption under the chips while `Flexible` is selected (row 221: the caption reads the default from the API; wording proposed): 12 slate-600 `No fixed time. Your task's deadline is {duration} after your payment is confirmed.` (proposed; it names the task deadline, which runners also see, rather than only a matching window; replaces the round-12 `… from when you submit.`, which row 235 made wrong) with `{duration}` in Fira Code (e.g. `24 hours`), formatted from a server value (`defaultDeadlineHours`, needs api-contract; it must come from the API, never be hard-coded). If the value is unavailable the caption is hidden. `Today` and `Tomorrow` get no caption (the chip says it).
  - No time picker (Q2 unchanged).
- **Budget** (row 45): shown **only for Buy For Me and Get It For Me**. Required (> 0) for Buy For Me; optional (default 0) for Get It For Me. Hidden for Check It For Me, Go There For Me and Wait For Me, which always send `budget: 0` (no item amount, so no merchant route later). Switching category back in the wizard keeps an entered budget only if the new category shows the field. The budget is the item/merchant amount (`_shared.md` §8), not a fee.
- **Locations** (row 60): 3a → one `task_site` point. 3b → `pickup` + `dropoff`. 3c → `pickup` (store) + `dropoff`. Each point has `lat`, `lng`, `addressText`, `placeId` from Place Details (or from the saved address). A point without coordinates is never sent; text-only addresses are not accepted.

## Numeric fields (Fira Code)
- Budget input and placeholder (`KSh 0`), when shown.
- Shopping-list quantities.

## Data
- Builds the `CreateErrandDto` body (`apps/api/src/errands/dto/errand.dto.ts`): `category`, `title?`, `description`, `budget`, `deadlineAt?`, `locations[]` (`pointType`, `lat`, `lng`, `addressText`, `placeId?`), `items?[]` (`name`, `quantity`). `urgency` omitted (derived server-side, rows 20 and 51).
- needs: api-contract — reject `budget > 0` for categories other than `buy_for_me` / `pickup_delivery` (row 45), and reject any location without coordinates (row 60).
- Places: Google Places Autocomplete + Place Details (§5, row 30): debounce 300 ms, session token, cache per session, key from environment config (`_shared.md` §10).
- Saved addresses: `GET /customers/me/addresses`.
- No socket events.

## Accessibility and mobile
- Card heading = the field's accessibility label; errors announced.
- Keep the CTA above the keyboard; body scrolls.
- Deadline chips are a radio group with 48dp hit areas; quantity buttons announce "Increase quantity of 2kg sugar".

## Resolved by owner answers
- Budget visibility per category: Buy For Me and Get It For Me only (row 45, was Q1).
- Places and coordinates: Places approved (row 30); a picked place with coordinates is required (row 60).
- Pickup + drop-off for Get It For Me and Buy For Me: OA-19 (was Q2).
- `deadline_at` authoritative, urgency derived: OA-19 (was Q1).
- Shopping list structured: OA-19 (was Q5).
- Saved addresses in the location field: kept as recommended (was Q3, no objection in OA-19).

## Open questions (non-blocking; build default given)
- Q2: Is "end of day" right for Today/Tomorrow, or should those chips open a time picker? Default: 23:59 local.
- Rows 221, 235 decided 2026-10-19 (24 h from payment confirmation). The caption waits only for the API value (`runner-gap-report.md` §18).

## Current vs design
Re-audit 2026-10-09, customer round 4, `feat/customer-owner-answers` @ `c420265` (docs/audits/customer-gap-report.md, "Re-audit 2026-10-09: customer round 4"): PASS. Text typed without any pick now shows `Choose a place from the list.` (core `onTextChanged`; earlier minor closed); `title` sent in `POST /errands`.

Re-audit round 2, 2026-10-09, `feat/customer-integrations` @ `7192a77`: PASS. An edit after a pick drops the place (core `onSelectionCleared`) and Continue shows `Choose a place from the list.`; search failures show `Couldn't search places. Check your connection.` Minor: text typed without any earlier pick gets the generic `Choose a location.` / `Choose where to …` message instead of `Choose a place from the list.`; nothing unpicked is ever sent.

Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): FAIL. Blocker: editing the text of a chosen place does not clear the choice, so the wizard submits the previously picked place while the field shows other text; `Choose a place from the list.` never shows. Budget per category (row 45) and Google Places are in place.

Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS (Places pending row 30, saved-address fallback). Minor: a chosen place shows as the field hint (slate-400) instead of a value (core `PlaceAutocompleteField` initial value, need open); budget placeholder `0` instead of `KSh 0`. Builder copy accepted: title minimum, no-Places notice (see Copy).

Spec update 2026-10-08 (rows 30, 45, 60): the build shows the budget card for all five categories and has no Google Places client yet. Now required: budget only for Buy For Me / Get It For Me (others send 0); Places search through the core Google client; typed-but-unpicked text is never accepted. Status set to `partial` until re-audited.
