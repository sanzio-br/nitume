# customer `v-new-details` (web): new task, step 2 (details)

- Issue: GitHub #7. Builder: `web-parity`. Branch: `feat/website-customer-create-task`.
- Route: `/app/customer/new/details` (`wizardStepGuard(2)`, `wizardLeaveGuard`; NC§W1). Shared: wizard foundation NC§W1–§W9 (in `customer-v-new-category.md`), `auth-foundation.md` (F§n), kit `ui-kit.md` (K§n).
- Sources: mobile spec `docs/specs/customer/v-new-details.md` (matches-design, round 14); Flutter `apps/customer_app/lib/src/screens/wizard/{details_screen,task_draft}.dart`, `widgets/deadline_widgets.dart`, `services/saved_place_search.dart`, `util/display.dart` (`formatHours`); core `widgets/{place_autocomplete_field,shopping_list_editor,nitume_choice_chip}.dart`, `places/{google_place_search,place_search}.dart`; mockup `nitume_customer_app.html` lines 72–79, 361–384; owner answers OA-12, OA-13, OA-15, OA-19, rows 30, 45, 51, 60, 206, 221, 233, 235, 239; API on `origin/main` (`apps/api/src/errands/{errands.controller,dto/errand.dto,errand-rules,errands.service}.ts`).
- **Updated 2026-10-29** for the owner decisions **WQ-25** (Places through the browser Maps JS API, Places API (New), session tokens, 300 ms debounce, per-session cache, Kenya only, saved-address fallback without a key, no API proxy) and **WQ-26** (Google attribution under the suggestion list), and for the #6 build (NC§W0: `location` icon, `nmFieldValue`, focus rule). WQ-2 stays open.
- Implementation: none (the #6 `new` stub has no `details` child). Status: **missing**.

## Purpose
Collect what the runner must do, where, by when, the item budget (Buy For Me and Get It For Me only) and, for Buy For Me, a structured shopping list. Nothing is posted here.

## Entry / exit
- Entry: `Continue →` on step 1 (NC). Also `Change location` on step 3 (NR), which returns here and focuses the refused field.
- Back (header or browser) → step 1, values kept.
- `Continue →` with a valid form → sets `detailsValidated`, pushes `/app/customer/new/review`.
- With errors → stays, shows every error, scrolls to and focuses the first invalid field.

## Task states
Pre-DRAFT (client-side form). No state chip.

## Layout

Wizard frame NC§W4 (`Task details`, step 2). Body: form cards, each `nm-form-card` (white, slate-line, r-m 14, padding 16, `card-label` heading 11/700 uppercase slate-600, 8px under it the control), **14px apart** (mobile `margin 0 20 14`; gutter from the frame). Inline errors: kit field error (12.5 red, `role="alert"`) under the field.

Cards in this order (✱ = only for that category):

| # | Card heading | Control | Shown for |
|---|---|---|---|
| 1 | `Task title (optional)` | `nm-field` text, `hideLabel` with the heading as label | all (OA-15) |
| 2 | `Describe the task` | `nm-field` multiline (3 rows, grows to 6) | all |
| 3a | `Location` | one `nm-place-field`, no visible label (heading is the name, `hideLabel`) | Check It For Me, Go There For Me, Wait For Me |
| 3b | (no heading; plain `nm-card` padding 16) | `nm-place-field` label `Pick up from`, 12px gap, `nm-place-field` label `Deliver to` | Get It For Me ✱ (OA-19) |
| 3c | (no heading; plain `nm-card`) | `nm-place-field` label `Buy from`, 12px gap, `nm-place-field` label `Deliver to` | Buy For Me ✱ (OA-19) |
| — | C-40 notice (only without a Maps key, see Places) | `nm-notice` info, 14px below the location card | all, builds without `mapsApiKey` |
| 4 | `Shopping list` | `nm-shopping-list` (C-37) | Buy For Me ✱ |
| 5 | `Deadline` | `nm-choice-chip` radio row (`Today`, `Tomorrow`, `Flexible`), wrap, gap 8; Flexible caption under it | all |
| 6 | `Budget (if a purchase is involved)` | `nm-field` money (`KSh ` prefix, placeholder `0`) | Buy For Me ✱, Get It For Me ✱ (row 45) |

Field labels in 3b/3c use the kit `field-label` style (12.5/600 slate-600), as built (the mobile spec table lists them as card headings; the built app and the accepted audit use field labels inside one card).

Then the CTA `Continue →` in `nm-fixed-cta` (always enabled).

Responsive (web adaptation): one column, max 640px from 768px (NC§W4); cards full column width at every size. No two-column form (the order is the flow). Suggestion lists open inline under their field and push the cards below down (as the app), so they are never clipped. No horizontal scroll at 360px: the shopping-list row is name field (flexible, min 0) + stepper (112px incl. hit areas) + remove (48px).

## Components

| Element | Component | Status |
|---|---|---|
| Form cards, text/multiline/money fields, errors | `nm-form-card`, `nm-field` (`hideLabel`, F§7.1) bound with `nmFieldValue` (#6; no forms module, NC§W10) | exists (#5 + #6) |
| Two-field location card | `nm-card` | kit (#5; `NgTemplateOutlet` replaced, NC§W9a) |
| Place field + suggestions | `nm-place-field` (port of `PlaceAutocompleteField`) | **NEW (#7)**; reused by #12 `x-address-form` |
| Place search | `PLACE_SEARCH` token: `GooglePlaceSearch` / `SavedPlaceSearch` (`shared/places/`) | **NEW (#7)**; reused by #12 |
| Google attribution (WQ-26) | `nm-places-attribution` inside `nm-place-field` (`shared/ui/place-field/`) | **NEW (#7)** |
| Shopping list | `nm-shopping-list` (C-37, port of `ShoppingListEditor`) | **NEW (#7)** |
| Deadline chips | `nm-choice-chip` (C-16, port of `NitumeChoiceChip`) | **NEW (#7)**, built here once (the kit leaves selection chips to the view issues, K§4.2.2); #8's deadline panel reuses it as `customer-x-awaiting-quote.md` §Components describes |
| Notice | `nm-notice` | kit |
| `formatHours` | `shared/format/formatters.ts` + pipe | **NEW (#7)**, port of `display.dart formatHours` |
| Icons | `nm-icon` `location` (exists, #6), `bookmark`, `close`, `add`, `remove` (**#7 adds**, NC§W9a) | #6 registry |

### `nm-place-field`
Inputs: `label` (optional, visible), `ariaLabel` (when no visible label: the card heading), `placeholder` (`Search for a place`), `value: DraftPlace | null`, `error`, `savedAddresses` (usable ones), `focusRequest` (a number input; each increase focuses the native input from `ngOnChanges`, no `effect()`). Outputs: `placeSelected(DraftPlace)`, `selectionCleared()`, `textChange(string)`.
- Built on `nm-field` (no copied input styles) with the NC§W9a additions: `leadingIcon` (an `nm-icon` name, 18px slate-600, input left padding grows to 40px), `busy` (16px 2px-stroke spinner at the right, `aria-hidden`), and the combobox attributes (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) on the native input. Leading icon `location` (#6 registry). Text is bound with `nmFieldValue` (which, after NC§W9a, also writes the picked `addressText`). Focus, blur and keys are read from bubbling `focusin` / `focusout` / `keydown` host listeners; programmatic focus uses `host.querySelector('input')` (no `viewChild`, NC§W10).
- A pick holds only while the text equals it: the first edit that changes the text calls `selectionCleared` (row 60); the view drops the place.
- Text under 2 characters (trimmed): no search, list cleared. Otherwise debounce **300 ms**, then `autocomplete(text, sessionToken)`; only the latest request's answer is used.
- Focused with empty text and saved addresses available: the list shows the saved addresses (icon `bookmark`, title = label e.g. `Home`, subtitle = address).
- Suggestion row (port of `_ResultTile`): min-height 48px, padding 10px 4px, 1px slate-line bottom hairline, icon 18 slate-400, 10px gap, title `row-title` (13.5/600 blue), subtitle `muted-sm` (11.5 slate-600). Hover/active option: slate fill (web adaptation).
- Picking a suggestion → `details(placeId, sessionToken)`; success → text = `addressText`, a **new** session token, list closed, `placeSelected`; failure → nothing changes, list stays (parity). Picking a saved address → text = address, `placeSelected({ addressText, lat, lng: lon, placeId: null })`, no Places call.
- Search failure → under the field, `Couldn't search places. Check your connection.` through the `nm-field` `error` input (red 12.5, `role="alert"`; Flutter `mutedSmall` in `fieldError`), list empty; cleared on the next input.
- Attribution (WQ-26): whenever the list shows at least one **Google** suggestion, the last element of the list panel (after the options, outside the `listbox`, so it is never an option) is Google's attribution (see Places). A list that shows only saved addresses has no attribution.
- Keyboard (web adaptation of a listbox): ArrowDown/ArrowUp move the active option, Enter picks it, Escape closes the list (keeps the text), Tab leaves; the list closes on blur unless focus moves into it.

### Places (owner WQ-25 and WQ-26, 2026-10-28; rows 30, 60; System Design §5)

**Decided (WQ-25):** the browser calls Google Places through the **Maps JavaScript API** with the WQ-1 browser key (`environment.mapsApiKey`; the key must have **Places API (New)** enabled in addition to the Maps JavaScript API, and stays HTTP-referrer restricted). **Session tokens**, a **300 ms debounce**, a **per-session cache**, results **limited to Kenya**. **Without a key, the field falls back to the customer's saved addresses.** **No API proxy:** no Places endpoint is added to `apps/api`, and the web never sends a Nitume token to Google (the Maps JS library makes its own calls). This is the cached path System Design §5 prescribes ("cache autocomplete results per session, debounce input (300 ms)").

```ts
// shared/places/place-search.ts
interface PlaceSuggestion { placeId: string; primaryText: string; secondaryText: string | null; source: 'google' | 'saved' }
interface PlaceDetails { placeId: string | null; addressText: string; lat: number; lng: number }
interface PlaceSearch {
  readonly available: Signal<boolean>;          // true for Google once the key is configured; SavedPlaceSearch: true
  readonly attributionRequired: boolean;        // GooglePlaceSearch true, SavedPlaceSearch false
  newSessionToken(): unknown;                   // Google: new google.maps.places.AutocompleteSessionToken(); saved: a random string
  autocomplete(query: string, sessionToken: unknown): Promise<PlaceSuggestion[]>;
  details(placeId: string, sessionToken: unknown): Promise<PlaceDetails>;
}
export const PLACE_SEARCH = new InjectionToken<PlaceSearch>('PLACE_SEARCH', { providedIn: 'root', factory: … });
// factory: MAPS_API_KEY non-empty → GooglePlaceSearch, else SavedPlaceSearch.
```

- **`GooglePlaceSearch`** (`shared/places/google-place-search.ts`): gets the library with `MapsLoaderService.importLibrary('places')` (NC§W9a; imported from `shared/map/maps-loader.service`). If that returns `null` (script failed to load, key rejected), `autocomplete` rejects, so the field shows the existing search-failure line `Couldn't search places. Check your connection.` (app parity: the Flutter Google service fails the same way); saved addresses are still offered on focus with empty text. No new copy.
  - Autocomplete: `AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken, includedRegionCodes: ['ke'], language: 'en' })` → `placePrediction.placeId`, `mainText.text`, `secondaryText?.text` (fallback `text.text`), `source: 'google'`.
  - Details (**corrected at re-audit 1**): `placePrediction.toPlace().fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] })`. `toPlace()` is the Maps JS API's documented way to carry the autocomplete request's `sessionToken` into the Details call, which closes the billing session (WQ-25 "session tokens"). `PlaceOptions` (`new Place({ … })`) has no `sessionToken` field (`id`, `requestedLanguage`, `requestedRegion` only), so the first spec text ("`sessionToken` on the `Place` options") was wrong. The cache therefore keeps each suggestion's `placePrediction` object next to the mapped `PlaceSuggestion` (memory only, same cap and lifetime), and `details(placeId, token)` calls `toPlace()` on the prediction of that session; only when no prediction is held (never for a pick from the list) does it fall back to `new Place({ id: placeId })`. No location → reject (`This place has no map location.`, never shown; the pick just does not happen). `addressText` = `composeAddressText(displayName, formattedAddress)`: `"<name>, <address>"` unless the address already starts with the name; empty name → the address.
  - **Debounce**: in `nm-place-field`, 300 ms after the last keystroke, trimmed text ≥ 2 characters; only the latest request's answer is used.
  - **Per-session cache**: answers kept in memory per `sessionToken + normalised query` (trimmed, lower-case); cap 200 entries, then cleared; a session's entries dropped after its Details call. No storage of any kind.
  - **Session token**: one per search session, created by `newSessionToken()` when the field first searches after focus or after a pick; renewed after each successful pick.
  - Region Kenya (`includedRegionCodes: ['ke']`), language English. Same rules as core `GooglePlaceSearchService` (Flutter).
- **`SavedPlaceSearch`** (`shared/places/saved-place-search.ts`): searches the customer's saved addresses that have `lat` and `lon` by label or address (case-insensitive contains), ids prefixed `saved:`, `source: 'saved'`; Details returns the address with `placeId: null` and `lng` = the address's `lon`. No network.
- **No key** (`mapsApiKey: ''`, the git default; WQ-1 still decides the production key): no Maps script is requested; `nm-notice` info under the location card `Place search isn't available yet. Choose one of your saved addresses that has a map location.` (C-40, as the app); typing searches saved addresses only.
- **Attribution (WQ-26).** Under the suggestion list, whenever it shows Google suggestions: Google's own attribution asset, unmodified (the "Google Maps" logo from the Google Maps Platform attribution requirements for Places data shown without a Google map), on the white list background, left-aligned, height 16px (the size Google's guidelines give for the standard logo), with Google's minimum clear space around it: **at least 10px left, right and top and at least 5px below** (Google Maps Platform attribution guidelines: ≥ 10 dp left/right/top, ≥ 5 dp bottom; auditor ruling at re-audit 1: where Google's minimum is stricter than this spec, Google's minimum applies), as `<img src="assets/third-party/google-maps-attribution.svg" alt="Google Maps">` inside `nm-places-attribution`. No Nitume copy, no recolouring, no link. The file is a third-party mark: it is stored as downloaded under `src/assets/third-party/` with a `README` line naming its source URL, and it is the **only** path the colour scan excepts (by exact path). It is not shown for saved-address-only lists, nor when no list is open. The Flutter apps are tracked separately (issue #27).

### `nm-shopping-list` (C-37)
- Rows separated by 1px slate-line hairlines (none above the first); row padding 6px 0; `nm-field` text (placeholder `Item, e.g. 2kg sugar`, `maxlength` 80, accessible name `Item 1`, `Item 2`, …), 4px gap, quantity stepper, remove button.
- Stepper: `−` / value / `+`. Buttons 32px white circles, 1px slate-line, 16px `remove`/`add` icon in blue (slate-400 when disabled), each in a 48×48 hit area; value Fira Code 13/600 blue (`<span nmNum>` inside a `nm-type(row-title, 13px)` box, NC§W9a; no new type style), 24px wide, centred, accessible text `Quantity 2`. Min 1, max 99; `−` disabled at 1, `+` at 99. Accessible names `Decrease quantity of 2kg sugar` / `Increase quantity of 2kg sugar` (mobile spec; the built app says `Decrease quantity`; use the item name when it is not empty, else the plain form).
- Remove: `close` icon 18 slate-400 in a 48×48 button, accessible name `Remove item` (+ ` 2kg sugar` when named), hidden while only one row exists.
- `+ Add item`: `nm-button` link (green-700), left-aligned, below the rows; hidden at **30** rows. Adding focuses the new row's name field (web adaptation).
- Error under the list (`error` style): `Add at least one item.`
- Emits the full list (including unnamed rows); the view trims and validates. Per-item `notes` are not in the MVP UI.

### `nm-choice-chip` (C-16)
`shared/ui/choice-chip/`, built here once; #8's deadline panel reuses it unchanged (`customer-x-awaiting-quote.md` §Components gives the same values). Pill, padding 8px 13px, `chip` type (12/600), unselected `--nitume-slate` fill + slate-line border + blue text, selected `--nitume-blue` fill and border + **white** text; 48px hit area; focus ring; `disabled` input (#8 disables the chips while saving: `aria-disabled`, no selection change, slate-400 text). Group component `nm-choice-chip-group` (same folder): `role="radiogroup"` with `aria-labelledby` (here the card heading), chips `role="radio"` with `aria-checked`, roving `tabindex`, arrow keys move and select, output `selectedChange`. Blue is the design system's selected-choice colour (not green: a deadline is not a primary action).

## Copy (exact)
- Header: `Task details`, counter `Step 2 of 3`. Document title `Task details · Nitume`.
- Card headings: `Task title (optional)`, `Describe the task`, `Location`, `Shopping list`, `Deadline`, `Budget (if a purchase is involved)`.
- Field labels: `Pick up from` (Get It For Me), `Buy from` (Buy For Me), `Deliver to`.
- Placeholders: title `e.g. Apartment check — Nyali`; description `e.g. Check the apartment in Nyali — video the compound, both bedrooms and bathroom.`; places `Search for a place`; item `Item, e.g. 2kg sugar`; budget `0` after the persistent `KSh ` prefix (reads `KSh 0`, mockup).
- Link: `+ Add item`.
- Deadline chips: `Today`, `Tomorrow`, `Flexible` (`Today` selected by default).
- Flexible caption (rows 221, 235; 12 slate-600, 10px above): `No fixed time. Your task's deadline is ` + `{duration}` (Fira Code) + ` after your payment is confirmed.` e.g. `24 hours`.
- Today / Tomorrow caption (WQ-2; exact copy decided, WQ-53): `Due today, 23:59 EAT.` / `Due tomorrow, 23:59 EAT.` (`23:59` in Fira Code).
- CTA: `Continue →`.
- No Places notice and search error: see Places. Attribution: Google's asset only, `alt="Google Maps"`, no Nitume text.

Validation messages (shown on the first `Continue →`, then live on every change):

| Field | Rule | Message |
|---|---|---|
| Title | trimmed length > 60 | `Keep the title under 60 characters.` |
| Title | trimmed length 1–2 (API needs 3–120) | `Use at least 3 characters, or leave it empty.` |
| Description | trimmed length < 5 (API `MinLength(5)`) | `Tell the runner a bit more (at least 5 characters).` |
| First place | none picked and text typed (row 60) | `Choose a place from the list.` |
| First place | none picked, empty | Location card: `Choose a location.`; Get It For Me: `Choose where to pick up.`; Buy For Me: `Choose where to buy.` |
| Drop-off (Get/Buy) | none picked and text typed | `Choose a place from the list.` |
| Drop-off (Get/Buy) | none picked, empty | `Choose where to deliver.` |
| Shopping list (Buy) | no row with a name | `Add at least one item.` |
| Budget (Get/Buy) | > 1,000,000 | `Enter an amount up to KSh 1,000,000.` |
| Budget (Buy) | empty or 0 | `Enter a budget for the items.` |

Order for "first error": title, description, first place, drop-off, shopping list, budget. The title has no `maxlength` attribute (so the over-60 message can show, as in the app).

## Rules
- **Deadline** (OA-19, rows 206, 235, 239; **owner WQ-2, 2026-10-29: deadlines use EAT and are labelled as EAT**): `Today` → 23:59:00.000 **EAT** (Africa/Nairobi, UTC+3, no daylight saving) of today's **EAT** calendar date, sent as ISO 8601 UTC (`toISOString()`, i.e. `…T20:59:00.000Z`); `Tomorrow` → 23:59 EAT of the next EAT calendar date; `Flexible` → no `deadlineAt` (the API sets payment time + `defaultDeadlineHours` at PAYMENT_CONFIRMED). The browser's own time zone never changes the value (a customer in London choosing `Today` at 22:30 London time on 1 Nov, which is 01:30 EAT on 2 Nov, gets 2 Nov 23:59 EAT). The EAT calendar date comes from the kit's EAT helpers (`eatDayKey`, `formatDeadlineEat` family in `shared/format/formatters.ts`); no hand-written `+3` offset in the view. Never send `urgency` (derived server-side, row 51). No time picker (mobile Q2 default).
- **Deadline label** (WQ-2 "labelled as EAT"; copy **decided**: owner approved Q7-5 on 2026-10-29, board WQ-53): while `Today` or `Tomorrow` is selected, a caption under the chips in the same place and style as the Flexible caption (`nm-type(greeting)`, 10px above): `Due ` + `today` / `tomorrow` + `, ` + `23:59` (Fira Code) + ` EAT.` e.g. `Due today, 23:59 EAT.` The time and the zone are fixed text from the rule above, not formatted from the browser clock. `Flexible` keeps its own caption.
- **Flexible caption** (`nm-type(greeting)`, 12/400 slate-600; NC§W9a): from `GET /errands/defaults`, fetched when the step opens. Shown only while `Flexible` is selected **and** the response has `defaultDeadlineStartsAt === 'payment_confirmed'` and a positive `defaultDeadlineHours`. `{duration}` = `formatHours(hours × 3600 s)`: whole hours → `1 hour` / `24 hours`; otherwise `formatDurationMin`. Request failure or other values → caption hidden, no error. Never hard-coded.
- **Budget** (row 45): only Buy For Me and Get It For Me show it. Buy: required > 0. Get: optional (empty sends 0). Other categories send `budget: 0`. Digits only, whole shillings (kit money field). It is the item/merchant amount (`_shared.md` §8), never a fee.
- **Locations** (row 60): 3a → one `task_site`; 3b → `pickup` + `dropoff`; 3c → `pickup` (store) + `dropoff`. Only picked places or saved addresses with coordinates. Editing a picked place's text clears it at once; the wizard never sends a place that differs from the field text.
- **Shopping list**: Buy For Me only; send named rows, trimmed, with their quantity.
- **Service area** (row 233): checked by the API at create/submit (NR); this step does not pre-check.
- `focusOnReturn` (set by NR `Change location`): on entering, scroll to and focus that place field (`dropoff` only for Get/Buy, else `first`), then clear it.

## States

| State | Behaviour |
|---|---|
| Opened | Saved addresses (`GET /customers/me/addresses`) and defaults (`GET /errands/defaults`) load in the background; the form is usable at once. Failures are silent (no saved shortcuts / no caption) |
| Typing in a place field | Spinner in the field while a search runs; results list under it |
| Search failed | `Couldn't search places. Check your connection.` under the field |
| No Places key | Notice under the location card; saved-address search only; no Maps script requested |
| Places library fails to load (bad key, network) | Each search shows `Couldn't search places. Check your connection.`; saved addresses still listed on focus; no notice |
| Google suggestions shown | Attribution under the list (WQ-26) |
| Continue with errors | All errors shown; page scrolls the first invalid field into view and focuses it; CTA stays enabled |
| Continue valid | `detailsValidated = true`, push step 3 |
| Back to step 1 and category change | NC§W2 `changeCategory` rules; place fields are keyed by category + field, so after a switch each field re-initialises from the draft (the kept place's text, or empty) with no stale typed text or error |

## Numeric fields (Fira Code)
- Budget input text, its `KSh ` prefix and placeholder (kit money field).
- Shopping-list quantities.
- `{duration}` in the Flexible caption.
- Step counter `Step 2 of 3`.
(Error messages such as `KSh 1,000,000` and `5 characters` are copy in Fira Sans, as in the app.)

## Data
- `GET /api/v1/customers/me/addresses` → `[{ id, label, addressText, lat: number | null, lon: number | null, isDefault, … }]` (exists, `customer-accounts.controller.ts`). Only entries with both `lat` and `lon` are offered.
- `GET /api/v1/errands/defaults` (exists, NC§W5).
- The step builds `CreateErrandBody` (`apps/api/src/errands/dto/errand.dto.ts` `CreateErrandDto` on `origin/main`); NR posts it:

```ts
interface CreateErrandBody {
  category: 'buy_for_me' | 'pickup_delivery' | 'inspection' | 'representation' | 'queue_admin'; // never 'business'
  title?: string;            // trimmed; omitted when empty (API 3–120)
  description: string;       // trimmed (API 5–4000)
  budget: number;            // whole shillings; 0 for inspection/representation/queue_admin (API 400 budget_not_applicable if > 0); required for buy/get (400 budget_required)
  deadlineAt?: string;       // ISO 8601 UTC; omitted for Flexible (API 400 deadline_in_past if not in the future)
  locations: Array<{ pointType: 'task_site' | 'pickup' | 'dropoff'; lat: number; lon: number; addressText: string; placeId?: string }>;
                             // NOTE the wire key is `lon` (reads come back as `lng`); placeId omitted for saved addresses
  items?: Array<{ name: string; quantity: number }>; // buy_for_me only; omitted (or []) otherwise
}
```
- No `urgency`, no `unit`, no item `notes`.
- No socket events.
- Google Places through `PLACE_SEARCH` (Places section), browser Maps JS API only. No Nitume endpoint involved and none added (WQ-25: no proxy).

## Accessibility and responsive
- Each control's accessible name is its card heading or field label; errors linked by `aria-describedby` and announced (`role="alert"`).
- Place fields are ARIA 1.2 comboboxes with a `listbox` of `option`s; the spinner is `aria-hidden` and the field has `aria-busy` while searching.
- Deadline chips and quantity buttons have 48×48 hit areas; disabled stepper buttons keep `aria-disabled`.
- The fixed CTA bar never hides the focused field (`scroll-margin-bottom` = bar height + 16px, NC§W4).
- No horizontal scroll at 360px; suggestion text wraps.

## Required tests (Vitest)
1. Per-category matrix (5 categories): which cards render, in order, with the exact headings/labels: 3a for inspection/representation/queue_admin; 3b `Pick up from` + `Deliver to` for pickup_delivery; 3c `Buy from` + `Deliver to` + `Shopping list` for buy_for_me; budget card only for buy_for_me and pickup_delivery; title, description and deadline for all.
2. Placeholders and the `KSh ` prefix render exactly; budget and quantities use `nmNum`/Fira Code.
3. Every validation message in the table, each triggered alone, shown only after the first `Continue →`, then live (fixing a field removes its message without another click).
4. First-error focus: with description and budget invalid, focus lands on the description field.
5. Title: `ab` → 3-character message; 61 characters → 60 message; empty → valid and omitted from the body.
6. Place field: typed text without a pick → `Choose a place from the list.`; pick then edit one character → `selectionCleared`, place dropped, same message on Continue; re-pick restores validity.
7. Places debounce and caching (fake timers + fake `PlaceSearch`): no call under 2 characters; no call at 299 ms, one call at 300 ms after the last keystroke; the same query in the same session served from cache (one Google call); a pick calls `details` with the same session token and then uses a new token; only the latest search's results render.
8. Details failure keeps the list and the field unchanged; search failure shows `Couldn't search places. Check your connection.` and clears on the next input.
9. Saved addresses: listed on focus with empty text (only those with `lat` and `lon`), label + address; picking one sends `placeId` absent and `lon` from the address.
10. No key (`mapsApiKey: ''`): the notice copy renders; typing `Off` finds a saved `Office`; no `<script>` is appended and `importLibrary` is never called; no attribution renders. `importLibrary` resolving `null` with a key: typing shows `Couldn't search places. Check your connection.`, no notice, saved addresses still listed on focus with empty text.
11. `GooglePlaceSearch` (stubbed `google.maps.places` through a fake `MapsLoaderService.importLibrary`): request has `includedRegionCodes: ['ke']`, `language: 'en'`, the session token object; maps `mainText`/`secondaryText`; Details calls `toPlace()` on the picked suggestion's `placePrediction` (the stub records it) and then `fetchFields` with exactly `['id', 'displayName', 'formattedAddress', 'location']`; no `sessionToken` key is passed to a `Place` constructor; cache: same query twice in one session → one `fetchAutocompleteSuggestions` call, a new session → a new call, entry 201 clears the cache; `composeAddressText` cases (`Sarit Centre` + `Westlands, Nairobi` → `Sarit Centre, Westlands, Nairobi`; address starting with the name kept as is; empty name → address); a place without `location` rejects; no request ever carries a Nitume `Authorization` header (the fake `HttpTestingController` sees no Google URL).
12. Combobox keyboard: ArrowDown/Enter picks, Escape closes; `aria-expanded`, `aria-activedescendant` update.
13. Shopping list: add up to 30 rows then the link hides; remove hidden with one row; quantity bounds 1 and 99 with disabled buttons; name `maxlength` 80; accessible names include the item name; adding focuses the new field.
14. Deadline chips: radio semantics, `Today` default, selected chip uses the blue fill token and white text; arrow keys move and select; a `disabled` chip ignores clicks and has `aria-disabled` (the #8 case).
15. Flexible caption: defaults `{ 24, 'payment_confirmed' }` → `… deadline is 24 hours after …` with `24 hours` in `nmNum`; `1` → `1 hour`; request failure or another `defaultDeadlineStartsAt` → hidden; hidden for `Today`/`Tomorrow`.
16. `formatHours`: 3600 s → `1 hour`, 86400 s → `24 hours`, 5400 s → `1 h 30 min`.
17. `toRequest(now)` (fixed `now`; run under at least two browser zones, e.g. `TZ=Europe/London` and `TZ=Africa/Nairobi`, or with an injected zone-independent clock): Today → 23:59 EAT of the EAT date as UTC ISO (`2026-11-01T20:59:00.000Z` for `now` = 2026-11-01 10:00 EAT), identical in both zones; `now` = 2026-11-01 22:30 London (= 2 Nov 01:30 EAT) → `2026-11-02T20:59:00.000Z`; Tomorrow → next EAT day; Flexible → no `deadlineAt`; never `urgency`; locations use `lon`; inspection sends one `task_site` and `budget: 0` and no items; pickup_delivery sends pickup + dropoff and `budget` 0 when empty; buy_for_me sends trimmed named items only.
18. Budget: digits only; `1000001` → limit message; Buy with empty budget → `Enter a budget for the items.`; Get with empty budget is valid.
19. Valid `Continue →` sets `detailsValidated` and navigates to `/app/customer/new/review`; Back keeps every value (including picked places and items) when returning.
20. `focusOnReturn: 'dropoff'` on a Get It For Me draft focuses the `Deliver to` field on entry and is then cleared.
21. Saved-address and defaults failures render no error and leave the form usable.
21a. Deadline label (WQ-2): `Today` → caption `Due today, 23:59 EAT.` with `23:59` in `nmNum`; `Tomorrow` → `Due tomorrow, 23:59 EAT.`; `Flexible` → the Flexible caption only; the text does not change with the browser zone.
22. Attribution (WQ-26): a list with Google suggestions ends with `img[alt="Google Maps"]` whose `src` is `assets/third-party/google-maps-attribution.svg`, outside the `role="listbox"`; a saved-only list and a closed list have none. Clear space (re-audit 1): the compiled rules (`declared()`) give the image at least 10px of space on the left, right and top and at least 5px below, counting the list panel's own padding.
23. No forms module: the step's form has `novalidate`, `Continue →` validation runs from the click handler, and fields are bound with `nmFieldValue` (covered by the static check NC§W9 17c).

## Current vs design
No form on the website. Flutter notes (not blocking the web): the budget placeholder in the app is `0` behind the `KSh ` prefix (the mobile spec says `KSh 0`; both read the same on screen); the quantity button names lack the item name; the 12px caption reuses the #6 `greeting` type and the 13/600 quantity uses an `nm-type` override with `nmNum` (no new type style, no new colour; NC§W9a).

## Questions
- Answered and applied: **WQ-2** (owner 2026-10-29): activity times use the browser's local time; **deadlines use EAT and are labelled as EAT** (Rules). `Today`/`Tomorrow` = 23:59 EAT.
- Answered and applied: **WQ-53** (was Q7-5; owner 2026-10-29): the EAT deadline caption is exactly `Due today, 23:59 EAT.` / `Due tomorrow, 23:59 EAT.`, under the deadline chips (Rules, Copy).
- Answered and applied: **WQ-25** (was Q7-2; owner 2026-10-28): browser Maps JS API with the WQ-1 key (Places API (New)), session tokens, 300 ms debounce, per-session cache, Kenya only, saved-address fallback without a key, no API proxy. **WQ-26** (was Q7-3; owner 2026-10-28): Google's attribution under the suggestion list on the web; the apps follow in issue #27.
- Carried, defaults kept: mobile Q2 (no time picker; end of day for Today/Tomorrow).
