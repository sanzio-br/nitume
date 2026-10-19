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
- Rows not drawn: `Terms & Privacy` → `x-legal` (row 131), placed after `Support`, hidden when neither URL is configured; `Purchase limit` info row (below).

## Task states
None.

## Layout (top to bottom)
1. C-09 top bar `Profile`.
2. Profile head (padding 10 20 18, centred): C-12 avatar 70 (blue fill, white initials 24/700); name 18/600 (`.profile-head h3`; API short name `Brian K.`, row 40); verified line 12/700 green-700 `● Verified Runner · Level 3 — Trusted` (green = verified/complete state; level digit Fira Code). Not verified: line 12/700 slate-600 `Verification in review` / `Not verified yet` (proposed, no green).
3. R-10 stat row (margin 0 20 16, 3 columns gap 10): `ERRANDS` → `137`; `RATING` → `4.9`; `COMPLETION` → `98.7%`. New runner (0 errands): `0`, `—`, `—` (proposed).
4. C-08 `Skills & areas`.
5. R-14 tags (padding 0 20, wrap, gap 8, margin-bottom 16): skills first (category display names, row 115), then service areas (row 116). Empty: 13 slate-600 `Add your skills and areas so we can offer you the right jobs.` (proposed).
6. R-05 info row (margin 0 20 12, white card r 12): `Purchase limit` → `KSh 3,000` (Fira Code, `maxPurchaseAdvance`), caption 11.5 slate-600 `The most you can spend on an item for a job. Our team sets it.` (row 138: read-only for the runner; no edit control).
7. C-24 menu rows (margin 0 20 8): `Edit skills & service areas`, `Notifications`, `Verification documents`, `Support`, `Terms & Privacy`, `Log out` (destructive red, OA-13). Chevron slate-400.
8. Footer (proposed, 11 slate-600 centred, Fira Code version): `Nitume Runner 1.0.0 (1)`.
9. Tab bar (Profile selected).

Log out dialog (C-35, proposed): title `Log out?`; body `You'll stop getting job offers until you sign in again.`; buttons `Log out` (destructive) / `Stay signed in`. Blocked while a job is active: snackbar `Finish your active job before logging out.` (proposed). On log out: go offline (`PATCH /runners/me/availability` offline), stop pings, unregister the FCM device, clear tokens.

## Components
C-09, C-12, R-10, C-08, R-14, C-24, C-35, C-33. NEW: R-10, R-14.

## Copy
Exact, from the mockup: `Profile`, `Brian K.`, `● Verified Runner · Level 3 — Trusted`, `ERRANDS`, `RATING`, `COMPLETION`, `Skills & areas`, `Edit skills & service areas`, `Notifications`, `Verification documents`, `Support`, `Log out`. Mockup skill tags `Shopping`, `Inspections`, `Documents`, `Property visits` are replaced by category display names (row 115), e.g. `Buy For Me`, `Check It For Me`. Proposed: `Purchase limit`, its caption, `Terms & Privacy`.

## Numeric fields (Fira Code)
- `137`, `4.9`, `98.7%` (stat values); level number; purchase limit; app version.

## Data
- `GET /users/me` (exists): `displayName`, `phone`. Short name: the API computes it (row 40); `GET /runners/me` returns the raw entity without `shortName` (RA-18: add `shortName`, and the computed fields below).
- `GET /runners/me` (exists): `verificationLevel`, `errandsCompleted`, `avgRating` (string), `completionRate` (0–100 numeric string, rendered with one decimal and `%`). Skills and service areas are **not** returned (RA-10).
- Verification overall state: `GET /runners/me/verifications` (exists), with the National ID combined from its two sides as `v-onboard-pending.md` (row 209, owner 2026-10-19: verified only if both sides are approved; rejected if either is rejected; else in review if either is pending). `Verification in review` when any check (ID combined) is in review and none is rejected; `Not verified yet` otherwise until all are approved.
- Log out: `POST /auth/logout` (exists), `DELETE /users/me/devices/:id` (exists), `PATCH /runners/me/availability` (exists).
- No socket events.

## Accessibility and mobile
Stats read as `137 errands, rating 4.9, completion 98.7 percent`; tags are plain text (not buttons); menu rows 48 dp.

## Decisions (owner, 2026-10-13)
- Row 115 (RQ-3): skills are category values. Row 116 (RQ-4): areas from the ops list.
- Row 131 (RQ-19): Terms & Privacy row.
- Row 138: purchase limit set by admins only; shown read-only here.

## Questions
- None new.
