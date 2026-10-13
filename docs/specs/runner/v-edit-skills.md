# v-edit-skills — Skills & areas

- Mockup: `docs/design/nitume_runner_app.html` lines 430–447 (`#v-edit-skills`, overlay)
- Shared conventions: `_shared.md` (§7 categories)
- Implementation: none
- Status: missing

## Purpose
The runner chooses which kinds of tasks they do (skills) and where they work (service areas). Matching uses both (system design §3.4 `skill_match`; service areas for the radius).

## Entry / exit
- Entry: Profile `Edit skills & service areas`.
- Back (C-10): unsaved changes → C-35 `Discard changes?` / `Your selections won't be saved.` / `Discard` · `Keep editing` (proposed).
- `Save changes` → save both → back to `v-profile` with snackbar `Saved.` (proposed; mockup `pop()`).

## Task states
None.

## Layout (top to bottom)
1. C-10 header `Skills & areas`.
2. C-08 `Skills` (padding-top 0).
3. C-16 choice chips (padding 0 20, wrap, gap 8, margin-bottom 16): one per skill (RQ-3). Selected = blue fill, white text, leading check (C-16; mockup: green-050 with `✓`); unselected = white with slate-line border and leading `+` (mockup: slate fill, slate-600 text).
   - Default vocabulary (RQ-3): the five MVP categories by display name, in order: `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me`. `Business Tasks` is not offered in MVP (OA-18). The mockup's `Shopping`, `Inspections`, `Documents`, `Property visits`, `Representation`, `Business tasks` are not used.
4. C-08 `Service areas`.
5. C-16 choice chips for areas from the area list (RQ-4): selected first, then the rest alphabetically. With more than ~20 areas, a C-34-style search row above the chips (proposed).
6. Fixed bottom C-01 `Save changes` (disabled until something changed; at least one skill required).

Validation (proposed): no skill → inline red 12.5 under the skills `Choose at least one skill.`; no area → `Choose at least one area.` (the API allows zero areas; proposed client rule so matching has something to use).

## Components
C-10, C-08, C-16, C-34 (optional), C-01, C-35. All exist.

## Copy
Exact, from the mockup: `Skills & areas`, `Skills`, `Service areas`, `Save changes`; sample areas `CBD`, `Westlands`, `Kilimani`, `Lavington`, `Karen` (real list from RQ-4). Skill labels per RQ-3 default. Errors: `Couldn't save your changes. Try again.` (proposed).

## Numeric fields (Fira Code)
None.

## Data
- Current values: **missing** (RA-10). `GET /runners/me` returns no skills or areas; `GET /runners/:id/profile` (public) returns `skills` and `serviceAreas` and can serve as a stopgap with the runner's own profile id.
- Save: `PUT /runners/me/skills` `{ skills: RunnerSkill[] }` (exists, 1–20 values of the API enum `shopping | pickup_delivery | inspection | documents | property_visits | queuing | business_errands`) and `PUT /runners/me/service-areas` `{ areas: string[] }` (exists, free text ≤ 64 chars, ≤ 50). **Shape mismatch** with the RQ-3 default: the skill enum does not map one-to-one to the six categories (no `representation`; `documents` / `property_visits` are not categories), so the default needs a schema change (owner).
- Area options: **missing** (RA-10/RQ-4): no list endpoint; proposed `GET /runners/service-areas` returning a configured list.
- No socket events.

## Accessibility and mobile
Chips are toggle buttons with `selected` semantics; 48 dp hit areas; CTA above the safe area.

## Questions
- RQ-3 (schema, blocking for the skill list): skills = categories?
- RQ-4 (product/config): the service-area list and who maintains it.
