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
3. C-16 choice chips (padding 0 20, wrap, gap 8, margin-bottom 16): one per skill (row 115). Selected = blue fill, white text, leading check (C-16; mockup: green-050 with `✓`); unselected = white with slate-line border and leading `+` (mockup: slate fill, slate-600 text).
   - Vocabulary (row 115: skills = the category values): the five MVP categories by display name (wire values `buy_for_me`, `pickup_delivery`, `inspection`, `representation`, `queue_admin`), in order: `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me`. `Business Tasks` is not offered in MVP (OA-18). The mockup's `Shopping`, `Inspections`, `Documents`, `Property visits`, `Representation`, `Business tasks` are not used.
4. C-08 `Service areas`.
5. C-16 choice chips for areas from the ops-configured list (row 116); free text is not accepted: selected first, then the rest alphabetically. With more than ~20 areas, a C-34-style search row above the chips (proposed).
6. Fixed bottom C-01 `Save changes` (disabled until something changed; at least one skill required).

Validation (proposed): no skill → inline red 12.5 under the skills `Choose at least one skill.`; no area → `Choose at least one area.` (the API allows zero areas; proposed client rule so matching has something to use).

## Components
C-10, C-08, C-16, C-34 (optional), C-01, C-35. All exist.

## Copy
Exact, from the mockup: `Skills & areas`, `Skills`, `Service areas`, `Save changes`; sample areas `CBD`, `Westlands`, `Kilimani`, `Lavington`, `Karen` (real list from the ops-configured list, row 116). Skill labels: category display names (row 115). Errors: `Couldn't save your changes. Try again.` (proposed).

## Numeric fields (Fira Code)
None.

## Data
- Current values: **missing** (RA-10). `GET /runners/me` returns no skills or areas; `GET /runners/:id/profile` (public) returns `skills` and `serviceAreas` and can serve as a stopgap with the runner's own profile id.
- Save: `PUT /runners/me/skills` `{ skills: RunnerSkill[] }` (exists, 1–20 values of the API enum `shopping | pickup_delivery | inspection | documents | property_visits | queuing | business_errands`) and `PUT /runners/me/service-areas` `{ areas: string[] }` (exists, free text ≤ 64 chars, ≤ 50). **Shape mismatch**, now decided (row 115): the API must move skills to the six category values with a data migration (`shopping`→`buy_for_me`, `pickup_delivery`/`documents`→`pickup_delivery`, `inspection`/`property_visits`→`inspection`, `queuing`→`queue_admin`, `business_errands`→`business`; `representation` new) and `PUT /runners/me/skills` must accept `buy_for_me | pickup_delivery | inspection | representation | queue_admin | business` (`business` refused from the app while Business Tasks are out of MVP). RA-10.
- Area options: **missing** (RA-10, row 116): `GET /runners/service-areas` → `[{ id, name }]` from an ops-configured list; `PUT /runners/me/service-areas` must accept only listed areas (by id or exact name; api-contract decides) and answer 400 `service_area_unknown` otherwise. The admin needs a place to maintain the list (no admin spec yet; see `docs/audits/runner-gap-report.md`).
- No socket events.

## Accessibility and mobile
Chips are toggle buttons with `selected` semantics; 48 dp hit areas; CTA above the safe area.

## Decisions (owner, 2026-10-13)
- Row 115 (RQ-3): skills = the six category values, migration from `RunnerSkill`.
- Row 116 (RQ-4): service areas from an ops-configured list. Rows 212, 213 (owner 2026-10-19): the list stays server config `RUNNER_SERVICE_AREAS` (no table, no admin screen for now); each area is a circle (centre + radius km) and a task falls in an area when its first point (task site, else pickup, else drop-off) is inside. No screen change: the runner picks area names; the geometry stays on the server.

## Questions
- None new.
