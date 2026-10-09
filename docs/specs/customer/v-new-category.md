# v-new-category — New task, step 1: category

- Mockup: `docs/design/nitume_customer_app.html` lines 343–359 (`#v-new-category`, overlay)
- Shared conventions: `_shared.md` (OA-n = owner answers, §0)
- Implementation: `apps/customer_app/lib/src/screens/new_task_tab.dart` (rendered as a root tab, not a pushed screen)
- Status: partial

## Purpose
Step 1 of the 3-step task wizard: pick exactly one of the **five** MVP categories.

## Entry / exit
- Entry: tab bar "New task" (pushes this screen over the shell; the tab bar is hidden); any Home category tile (with that category preselected); Home search row; Track empty state "Start a new task"; History empty state.
- Back → previous screen. If the wizard holds entered data from step 2 (user came back here), back asks to discard (C-35, see Copy).
- "Continue →" → push `v-new-details` with the selected category. Changing the category after visiting step 2 keeps the description and title, and clears category-specific fields (second location, shopping list, budget).

## Task states
None. Nothing is posted until step 3 (see `v-new-review.md`).

## Layout (top to bottom)
1. Pushed header (C-10): back, title, step counter right-aligned Fira Code 11 slate-600.
2. Stepper (C-14): segment 1 done (green), 2 and 3 empty (slate-line); 4px high, gap 6, padding `0 20 16`.
3. Scrollable body:
   1. Section label (C-08), top padding 0.
   2. Category grid (C-15): **3 columns, 5 tiles** (OA-1, OA-18). Row 1: Buy For Me, Get It For Me, Check It For Me. Row 2: Go There For Me, Wait For Me, and an **empty third cell** (no placeholder tile, no stretching). Gap 10, padding `0 20 20`.
   - Tile: white, slate-line 1px border, r 14, padding `14 10`, centred. Icon box 32×32, r-s 8 (mockup 9), green-050 fill, icon 16 blue. Label 11.5/600 blue, centred, up to 2 lines (full names such as "Check It For Me" wrap to two lines at 3-column width on a 375pt screen). All tiles in a row share the height of the tallest tile.
   - Selected tile: 1px green border + 2px inset green-050 ring (mockup `.cat-tile.sel`).
4. Fixed primary CTA (C-01), margin `auto 20 6`.

## Components
| Element | Component | Status |
|---|---|---|
| Header + counter | C-10 | built |
| Stepper | C-14 | built |
| Section label | C-08 | built |
| Grid + tiles | C-15 | built; **change**: render `ErrandCategory.customerMvp` (five) |
| Continue | C-01 | built |
| Discard confirm | C-35 | **NEW** |

## Copy (exact)
- Header: `New task`, counter `Step 1 of 3`
- Section label: `What do you need done?`
- Tiles (OA-1, canonical order): `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me`. **No `Business Tasks` tile** (OA-18).
- CTA: `Continue →`
- Discard dialog (proposed): title `Discard this task?`, body `What you've entered so far will be lost.`, buttons `Discard` (C-03 outline, red text per OA-13 destructive) and `Keep editing` (C-01).

States:
- Nothing selected (entered from the tab bar): CTA disabled (theme disabled style).
- No loading or error state (static list from the core enum).

## Numeric fields (Fira Code)
- Step counter `Step 1 of 3`.

## Data
- Categories from `ErrandCategory` in `nitume_core`; wire values per `_shared.md` §7 (mapping pending row 1).
- No endpoint, no socket event.

## Accessibility and mobile
- Tiles are a radio group; the selected state is announced ("Check It For Me, selected, 3 of 5").
- Each tile ≥ 48dp tall (it is ~84dp).

## Resolved by owner answers
- Labels: full display names (OA-1, was Q1).
- Business Tasks tile: removed for MVP (OA-18, was Q4). Grid is 3 + 2.

## Open questions (non-blocking; build default given)
- Q2: Tile order. The mockup lists Inspect first and preselected; default: canonical order above, no preselection from the tab bar.
- Q3: Emoji (mockup 🛍️ 📦 👀 📍 📝) vs icon glyphs. Default: icon glyphs (`categoryIcon()` in core), blue on green-050, for consistent rendering.

## Current vs design
See gap report. Summary: built as a root tab with a `SliverAppBar`, an extra heading and subtitle, no step counter, stepper or back button; selection hard-coded on Inspect; short labels including a Business tile; CTA inline and inert; inline style with an unregistered `'FiraSans'` family.
