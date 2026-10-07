# v-new-details — New task, step 2: details

- Mockup: `docs/design/nitume_customer_app.html` lines 361–384 (`#v-new-details`, overlay)
- Shared conventions: `_shared.md` (OA-n = owner answers, §0)
- Implementation: none
- Status: missing

## Purpose
Collect what the runner must do, where, by when, the item budget, and (for Buy For Me) a structured shopping list.

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
   | 6 | `Budget (if a purchase is involved)` | money field, Fira Code, `KSh` prefix | all (see Budget rules) |

   - Places fields: focusing with an empty query lists saved addresses (`v-addresses`) as rows with their label (`Home`, `Office`) and address; typing switches to Google Places results.
   - Shopping list (C-37): each row = item name field (required, max 80), quantity stepper (− / n / +, Fira Code 13/600, min 1, max 99, 32px buttons with 48dp hit areas), remove icon button (slate-400 ×, hidden when only one row). Rows separated by slate-line hairlines. Below the rows a green-700 link `+ Add item` (C-04). Max 30 items. Optional per-item note: not in MVP UI (the API accepts `notes`; leave empty).
4. Fixed primary CTA (C-01).

## Components
| Element | Component | Status |
|---|---|---|
| Form cards + fields + errors | C-17 `NitumeFormCard`, `NitumeField` (text, multiline, money) | built |
| Place fields | `PlaceAutocompleteField` + `PlaceSearchService` | built (interface); Google Places client pending row 30 |
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
- Buy For Me with no shopping-list item name: `Add at least one item.`
- Budget over 1,000,000: `Enter an amount up to KSh 1,000,000.`
- Buy For Me with budget 0: `Enter a budget for the items.`
- Title over 60 characters: `Keep the title under 60 characters.`
- Places error/offline: inside the suggestions `Couldn't search places. Check your connection.`
- CTA is always enabled; tapping with errors scrolls to the first error.

## Rules
- **Deadline** (OA-19: `deadline_at` authoritative, urgency derived): Today → `deadlineAt` = today 23:59 local, sent as ISO 8601 UTC; Tomorrow → tomorrow 23:59 local; Flexible → no `deadlineAt`. The client **never sends `urgency`**; the backend derives it from `deadlineAt`.
- **Budget** (OA-19: "per category requirements"): shown for all five categories as the mockup draws it; **required (> 0) for Buy For Me**, optional (default 0) for the others. The budget is the item/merchant amount (§8 of `_shared.md`), not a fee. Exact per-category visibility is open Q1 below.
- **Locations**: 3a → one `task_site` point. 3b → `pickup` + `dropoff`. 3c → `pickup` (store) + `dropoff`. Each point has `lat`, `lon`, `addressText`, `placeId` from Place Details (or from the saved address).

## Numeric fields (Fira Code)
- Budget input and placeholder (`KSh 0`).
- Shopping-list quantities.

## Data
- Builds the `CreateErrandDto` body (`apps/api/src/errands/dto/errand.dto.ts`): `category`, `title?` (needs: api-contract, OA-15 approved), `description`, `budget`, `deadlineAt?`, `locations[]` (`pointType`, `lat`, `lon`, `addressText`, `placeId?`), `items?[]` (`name`, `quantity`). `urgency` omitted.
- needs: api-contract — `title` column + DTO field (OA-15); derive `urgency` from `deadlineAt` server-side (OA-19); require ≥ 1 item for `buy_for_me` and two points for `buy_for_me` / `pickup_delivery`.
- Places: Google Places Autocomplete + Place Details (§5): debounce 300 ms, session token, cache per session. Pending row 30 (package + key).
- Saved addresses: `GET /customers/me/addresses`.
- No socket events.

## Accessibility and mobile
- Card heading = the field's accessibility label; errors announced.
- Keep the CTA above the keyboard; body scrolls.
- Deadline chips are a radio group with 48dp hit areas; quantity buttons announce "Increase quantity of 2kg sugar".

## Resolved by owner answers
- Pickup + drop-off for Get It For Me and Buy For Me: OA-19 (was Q2).
- `deadline_at` authoritative, urgency derived: OA-19 (was Q1).
- Shopping list structured: OA-19 (was Q5).
- Saved addresses in the location field: kept as recommended (was Q3, no objection in OA-19).

## Open questions (non-blocking; build default given)
- Q1: OA-19 says "budget visibility follows the category requirements" without listing them. Default: shown for all five, required only for Buy For Me. Should it be hidden for Check It For Me and Go There For Me?
- Q2: Is "end of day" right for Today/Tomorrow, or should those chips open a time picker? Default: 23:59 local.

## Current vs design
Not built.
