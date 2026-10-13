# v-profile — Profile

- Mockup: `docs/design/nitume_runner_app.html` lines 266–283 (`#v-profile`, root view)
- Shared conventions: `_shared.md` (§7 levels and names)
- Implementation: none
- Status: missing

## Purpose
The runner's identity, verification level, performance stats, skills and service areas, and account menu.

## Entry / exit
- Entry: tab bar `Profile`; push `rating.received`.
- `Edit skills & service areas` → `v-edit-skills`.
- `Notifications` → `v-notifications`.
- `Verification documents` → `v-onboard-pending` (mockup row has no target; proposed).
- `Support` → `x-support` (customer spec pattern: one configurable external target, `AppConfig.supportUri`; row hidden when not configured).
- `Log out` → C-35 confirm → log out → `v-auth-phone` (mockup `jump('v-auth-phone')`).
- Proposed rows (not drawn): `Terms & Privacy` → `x-legal` (RQ-19).

## Task states
None.

## Layout (top to bottom)
1. C-09 top bar `Profile`.
2. Profile head (padding 10 20 18, centred): C-12 avatar 70 (blue fill, white initials 24/700); name 18/600 (`.profile-head h3`; API short name `Brian K.`, row 40); verified line 12/700 green-700 `● Verified Runner · Level 3 — Trusted` (green = verified/complete state; level digit Fira Code). Not verified: line 12/700 slate-600 `Verification in review` / `Not verified yet` (proposed, no green).
3. R-10 stat row (margin 0 20 16, 3 columns gap 10): `ERRANDS` → `137`; `RATING` → `4.9`; `COMPLETION` → `98.7%`. New runner (0 errands): `0`, `—`, `—` (proposed).
4. C-08 `Skills & areas`.
5. R-14 tags (padding 0 20, wrap, gap 8, margin-bottom 16): skills first (RQ-3: category display names), then service areas. Empty: 13 slate-600 `Add your skills and areas so we can offer you the right jobs.` (proposed).
6. C-24 menu rows (margin 0 20 8): `Edit skills & service areas`, `Notifications`, `Verification documents`, `Support`, `Log out` (destructive red, OA-13). Chevron slate-400.
7. Footer (proposed, 11 slate-600 centred, Fira Code version): `Nitume Runner 1.0.0 (1)`.
8. Tab bar (Profile selected).

Log out dialog (C-35, proposed): title `Log out?`; body `You'll stop getting job offers until you sign in again.`; buttons `Log out` (destructive) / `Stay signed in`. Blocked while a job is active: snackbar `Finish your active job before logging out.` (proposed). On log out: go offline (`PATCH /runners/me/availability` offline), stop pings, unregister the FCM device, clear tokens.

## Components
C-09, C-12, R-10, C-08, R-14, C-24, C-35, C-33. NEW: R-10, R-14.

## Copy
Exact, from the mockup: `Profile`, `Brian K.`, `● Verified Runner · Level 3 — Trusted`, `ERRANDS`, `RATING`, `COMPLETION`, `Skills & areas`, `Edit skills & service areas`, `Notifications`, `Verification documents`, `Support`, `Log out`. Mockup skill tags `Shopping`, `Inspections`, `Documents`, `Property visits` are replaced by the RQ-3 vocabulary (default: category display names, e.g. `Buy For Me`, `Check It For Me`).

## Numeric fields (Fira Code)
- `137`, `4.9`, `98.7%` (stat values); level number; app version.

## Data
- `GET /users/me` (exists): `displayName`, `phone`. Short name: the API computes it (row 40); `GET /runners/me` returns the raw entity without `shortName` (RA-18: add `shortName`, and the computed fields below).
- `GET /runners/me` (exists): `verificationLevel`, `errandsCompleted`, `avgRating` (string), `completionRate` (0–100 numeric string, rendered with one decimal and `%`). Skills and service areas are **not** returned (RA-10).
- Verification overall state: `GET /runners/me/verifications` (exists).
- Log out: `POST /auth/logout` (exists), `DELETE /users/me/devices/:id` (exists), `PATCH /runners/me/availability` (exists).
- No socket events.

## Accessibility and mobile
Stats read as `137 errands, rating 4.9, completion 98.7 percent`; tags are plain text (not buttons); menu rows 48 dp.

## Questions
- RQ-3 (schema/product): skills vocabulary.
- RQ-19: Terms & Privacy row for runners.
