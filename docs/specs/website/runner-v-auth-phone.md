# runner `v-auth-phone` (web): phone entry, sign in or apply as a Runner

- Route: `/app/runner/sign-in` (`guestGuard`). Shared rules: `auth-foundation.md` (F§n).
- **Same view as `customer-v-auth-phone.md`**: layout, components, states, numeric fields, accessibility and data are identical; only the items below differ. Build one `AuthPhonePage` component configured by route `data.role`; never two copies of the markup.
- Sources: mobile spec `docs/specs/runner/v-auth-phone.md` (matches-design, audit 2026-10-13); Flutter `apps/runner_app/lib/src/screens/auth/phone_screen.dart`; mockup `docs/design/nitume_runner_app.html` lines 294–302; rows 127, 131; OA-17.
- Implementation: none. Status: **missing**.

## Purpose
First screen for a signed-out runner or runner applicant on the website. Same screen for new applicants and returning runners.

## Differences from the customer view
| Item | Runner |
|---|---|
| Route | `/app/runner/sign-in`; success → `/app/runner/sign-in/code` |
| Entry | `/app` signed-out redirect only if WQ-9 sends runners here (default: the `/auth` chooser's runner button); `authGuard` redirects from `/app/runner/**`; full-reload sign-out from the runner area |
| Wordmark | `nm-wordmark` with `suffix="Runner"` (R-17): `Nitume` 22/700 blue + `Runner` 12/600 slate-600, accessible name `Nitume Runner` |
| Heading | `Earn on your own schedule.` |
| Sub | `Enter your phone number to sign in or apply as a Runner.` |
| Legal line | `By continuing you agree to Nitume's Runner Terms & Privacy Policy.` (row 131); link parts `Runner Terms` and `Privacy Policy` |
| Links | `environment.links.runner.termsUrl` / `privacyUrl` (F§8) |
| Document title | `Sign in · Nitume Runner` (**proposed**, F§2) |

Unchanged (from the customer spec, exact): placeholder `+254 7XX XXX XXX`; button `Send code`; `Enter a valid Kenyan number, e.g. +254 712 345 678`; cooldown → code screen silently; `Too many code requests. Try again in N min.` / `Too many code requests. Try again later.`; `We couldn't send the code. Try again.`; `Check your connection and try again.`; `Something went wrong. Please try again.`; the `signedOut` toasts. The visible field has no label; its accessible name is `Phone number`.

## Task states
None.

## Numeric fields (Fira Code)
Phone input and placeholder; `N` in the rate-limit line.

## Data
`POST /api/v1/auth/otp/request { phone }` (exists). The request carries no role; the role is sent on verify. No socket events.

## Required tests (Vitest)
All of `customer-v-auth-phone.md` "Required tests" run as one parameterised suite over both roles. Runner-only assertions:
1. Wordmark shows the `Runner` suffix and is named `Nitume Runner`.
2. Heading, sub and the legal line with `Runner Terms` match the copy above.
3. Success navigates to `/app/runner/sign-in/code`.
4. Links come from `links.runner`.

## Current vs design
No runner sign-in exists on the website. The marketing `/runner` page's `Apply to become a Runner` buttons link to the generic `/auth` page, which signs everyone up as a customer (it sends no role), so a runner applicant who used it today would hold a customer account on that number (row 127: one phone, one role). WQ-9 covers the entry point.

## Questions
- WQ-9 (F§11): how runner applicants reach this screen from the marketing pages.
