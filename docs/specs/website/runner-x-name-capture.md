# runner `x-name-capture` (web): your name, first sign-in

- Route: `/app/runner/name` (`authGuard`, `roleGuard('runner')`, `needsNameGuard`). Shared rules: `auth-foundation.md` (F§n).
- **Same view as `customer-x-name-capture.md`** (layout, states, validation, data). One `NameCapturePage` component configured by route `data.role`. Only the items below differ.
- Sources: mobile spec `docs/specs/runner/x-name-capture.md` (matches-design; not drawn; copy **proposed** there and built); Flutter `apps/runner_app/lib/src/screens/auth/name_capture_screen.dart`; OA-2, rows 40, 126.
- Implementation: none. Status: **missing**.

## Purpose
Collect the runner's display name once, before onboarding, so customers see a name on their task (the API derives the short name, row 40) and ops can match it to the ID (row 126).

## Differences from the customer view
| Item | Runner |
|---|---|
| Wordmark | `nm-wordmark` with `suffix="Runner"` |
| Heading | `What's your name?` |
| Sub | `Use the name on your National ID. Customers see your first name and initial.` |
| Field label | `Your full name` |
| Placeholder | `e.g. Brian Kamau` |
| Exit | `resolveDestination` (F§6.2) continues from step 4: after a fresh OTP sign-in → onboarding step (F§6.3) → `/app/runner/onboarding/{id,selfie,pending}` or `/app/runner/jobs`; after a restored session (not fresh) → `returnUrl` or `/app/runner/jobs` |
| Document title | `Your name · Nitume Runner` (**proposed**) |

Unchanged (exact): button `Continue`; `Enter your name.` (under 2 characters); `Keep it under 60 characters.`; `Couldn't save your name. Try again.`; saving spinner, read-only field; no back, no skip.

## Task states
None.

## Numeric fields (Fira Code)
None.

## Data
`PATCH /api/v1/users/me { displayName }` (exists, 2–60); then, for a fresh sign-in, `GET /api/v1/runners/me` (+ fallback) for the onboarding step. No socket events. No storage writes.

## Required tests (Vitest)
All of `customer-x-name-capture.md` "Required tests" run as one parameterised suite over both roles. Runner-only:
1. Copy above (wordmark suffix, heading, sub, label, placeholder).
2. Fresh sign-in: save → onboarding step routing (`id` case and `shell` case).
3. Restored session: save → `/app/runner/jobs` without calling `GET /runners/me`.

## Current vs design
Nothing equivalent on the website.

## Questions
- None new.
