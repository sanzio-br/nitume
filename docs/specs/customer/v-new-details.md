# v-new-details — New task, step 2: details

- Mockup: `docs/design/nitume_customer_app.html` lines 361–384 (`#v-new-details`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

## Purpose
Collect what the runner must do, where, by when, and the purchase budget (if any).

## Entry / exit
- Entry: "Continue →" on `v-new-category`.
- Back → `v-new-category` (keep entered values).
- "Continue →" (valid form) → push `v-new-review`.

## Task states
Pre-DRAFT (client-side form). Nothing is posted until step 3.

## Layout (top to bottom)
1. Pushed header (C-10): title + `Step 2 of 3`.
2. Stepper (C-14): segments 1–2 done.
3. Scrollable body of four form cards (C-07 with padding 16, margin `0 20 14`), each with an uppercase card label (11/700, slate-600, letter-spacing .04em, margin-bottom 8) and one control:
   1. Describe the task — multiline field, 3 rows.
   2. Location — single-line field with a location pin, opens Places autocomplete.
   3. Deadline — choice chips (C-16) row, gap 8, wrap.
   4. Budget — numeric field, Fira Code, `KSh` prefix.
4. Fixed primary CTA (C-01).

## Components
| Element | Component | Status |
|---|---|---|
| Form cards | C-07 + card label | app-only / NEW label |
| Description, location, budget fields | C-17 `NitumeField` (multiline, place picker, money variants) | NEW |
| Place autocomplete | NEW `PlaceAutocompleteField` (Google Places, debounce 300ms, session token, §5) | NEW |
| Saved-address shortcut | NEW: list saved addresses (from `v-addresses`) above autocomplete results (Q3) | NEW |
| Deadline chips | C-16 | NEW |
| Stepper / header / CTA | C-14 / C-10 / C-01 | NEW / NEW / core |

## Copy (exact)
- Header: `Task details`, `Step 2 of 3`
- Card labels: `Describe the task`, `Location`, `Deadline`, `Budget (if a purchase is involved)`
- Description placeholder: `e.g. Check the apartment in Nyali — video the compound, both bedrooms and bathroom.`
- Location sample value: `📍 Links Road Apartments, Nyali` (pin is an icon, not part of the text)
- Deadline chips: `Today`, `Tomorrow`, `Flexible` (Today selected in mockup)
- Budget placeholder: `KSh 0`
- CTA: `Continue →`

Implied states (recommended copy):
- Validation: description min 5 chars (API `MinLength(5)`) → `Tell the runner a bit more (at least 5 characters).`; location required → `Choose a location.`; budget 0–1,000,000 → `Enter an amount up to KSh 1,000,000.`
- Places error/offline: `Couldn't search addresses. Check your connection.`
- CTA disabled until description and location are valid.

## Numeric fields (Fira Code)
- Budget input and placeholder (`KSh 0`).

## Data
- Builds the `CreateErrandDto` body (`apps/api/src/errands/dto/errand.dto.ts`): `category`, `description`, `budget` (number, default 0), `deadlineAt?` (ISO), `urgency?`, `locations[]` (`pointType`, `lat`, `lon`, `addressText`, `placeId?`), `items?`.
- Location: Google Places Autocomplete + Place Details for lat/lon (§5, client-side; cache per session, debounce 300ms). Saved addresses: `GET /customers/me/addresses` (exists).
- Deadline mapping (not defined anywhere, Q1): Today → `deadlineAt` = today 23:59 local, `urgency=standard`; Tomorrow → tomorrow 23:59; Flexible → no `deadlineAt`.
- Point type: single location → `task_site`. Categories that imply two points (Get It For Me = pickup + dropoff) need a second location field that the mockup does not draw (Q2).
- No socket events.

## Accessibility and mobile
- Field labels exposed as accessibility labels (card label = field label).
- Keep CTA above keyboard; body scrolls.
- Choice chips as a radio group, 48dp hit areas.

## Questions for owner
- Q1: Deadline chips → `deadline_at` / `urgency` mapping, and is there a time picker or an "Urgent" option (`urgency` enum has `standard | urgent | scheduled`)? Pricing uses urgency (§3.1 pricing).
- Q2: Get It For Me (`pickup_delivery`) needs pickup and drop-off points; Buy For Me may need a store + delivery point. The mockup shows one Location card for every category. Recommended: category-specific location cards (pickup/drop-off) for Get It For Me and Buy For Me.
- Q3: Should saved addresses be offered in the Location field? (Recommended yes.)
- Q4: Budget is labelled "if a purchase is involved" — should it be hidden for categories with no purchase (Check It For Me, Wait For Me, Go There For Me)? And is it the merchant amount (`payments.merchant_amount`) or a cap? The API currently uses `budget` as the merchant amount when > 0.
- Q5: `errand_items` (shopping list) exists in the ERD/API but not in the mockup. Should Buy For Me have an item list?

## Current vs design
Not built. No form, no Places integration, no draft state.
