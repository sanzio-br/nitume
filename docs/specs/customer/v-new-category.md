# v-new-category — New task, step 1: category

- Mockup: `docs/design/nitume_customer_app.html` lines 343–359 (`#v-new-category`, overlay)
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/new_task_tab.dart` (rendered as a root tab, not a pushed screen)
- Status: partial

## Purpose
Step 1 of the 3-step task wizard: pick exactly one of the six categories.

## Entry / exit
- Entry: tab bar "New task" (pushes this screen over the shell; the tab bar is hidden); any Home category tile.
- Back → previous screen (Home or wherever the user was); discard the draft (confirm if anything was entered later in the wizard).
- "Continue →" → push `v-new-details` with the selected category.

## Task states
None yet. The errand is created as DRAFT only when the wizard posts (see `v-new-review.md`).

## Layout (top to bottom)
1. Pushed header (C-10): back, title, step counter right-aligned Fira Code 11 slate-600.
2. Stepper (C-14): segment 1 done, 2 and 3 empty; padding `0 20 16`.
3. Scrollable body:
   1. Section label (C-08) with top padding 0.
   2. Category grid (C-15), 3 columns × 2 rows, gap 10, padding `0 20 20`. Selected tile: green border + 2px inset green-050 ring.
4. Fixed primary CTA (C-01) at the bottom, margin `auto 20 6`.

## Components
C-10, C-14, C-08, C-15, C-01. All NEW except the themed button.

## Copy (exact)
- Header: `New task`, counter `Step 1 of 3`
- Section label: `What do you need done?`
- Tiles (display names, Q-CAT): `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me`, `Business Tasks`. Mockup order is Inspect, Buy, Collect, Visit, Submit, Business with Inspect preselected; use the canonical enum order unless the owner prefers the mockup order (Q2).
- CTA: `Continue →`

Implied states:
- Nothing selected (if no preselection): CTA disabled (slate-line fill, slate-400 text per theme).
- No loading/error state (static list from the core enum).

## Numeric fields (Fira Code)
- Step counter `Step 1 of 3` (counter pattern).

## Data
- Categories come from `ErrandCategory` in `nitume_core` (exists; wire values `buy_for_me | pickup_delivery | inspection | representation | queue_admin | business`).
- No endpoint, no socket event.

## Accessibility and mobile
- Tiles are a radio group; selected state announced.
- Emoji icons in the mockup (🛍️ 📦 👀 📍 📝 💼) — recommended: replace with icon glyphs in blue on green-050 for consistent rendering across Android/iOS (Q3).

## Questions for owner
- Q1: Q-CAT.
- Q2: Tile order — mockup order (Inspect first, preselected) or canonical order?
- Q3: Emoji vs icon set for category icons.
- Q4: Business Tasks — the business plan treats business customers as a later phase (B2B). Should the Business Tasks tile be visible to regular customers at MVP? (scope, §3)

## Current vs design
See gap report. Summary: built as a root tab with a `SliverAppBar` "New task", an extra 22px heading + "Choose a category to get started" subtitle, no step counter, no stepper, no back button; tile selection is hard-coded (`selected: true` on Inspect) and taps do nothing; short labels; CTA is inline (not fixed) and does nothing; CTA style is overridden inline with an unregistered `'FiraSans'` family.
