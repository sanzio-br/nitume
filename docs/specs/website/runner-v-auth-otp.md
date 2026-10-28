# runner `v-auth-otp` (web): verify the code

- Route: `/app/runner/sign-in/code` (`guestGuard`, `otpStepGuard`). Shared rules: `auth-foundation.md` (F§n).
- **Same view as `customer-v-auth-otp.md`** (layout, `nm-otp-field`, `nm-otp-resend-line`, OA-17 states and copy, numeric fields, accessibility). One `AuthOtpPage` component configured by route `data.role`. Only the items below differ.
- Sources: mobile spec `docs/specs/runner/v-auth-otp.md` (matches-design; RN-L1 addendum 2026-10-21 for routing step 3); Flutter `apps/runner_app/lib/src/screens/auth/otp_screen.dart`, `services/session.dart`, `services/onboarding_routing.dart`; mockup `nitume_runner_app.html` lines 304–313; rows 127, 131, 217, 263, 268; RA-9.
- Implementation: none. Status: **missing**.

## Purpose
Verify the code, create the runner account on first sign-in (`role: runner`), refuse non-runner numbers, and route the runner to name capture, onboarding or the shell.

## Differences from the customer view
| Item | Runner |
|---|---|
| Route / Back | `/app/runner/sign-in/code`; Back → `/app/runner/sign-in` with the number prefilled |
| Verify body | `{ phone, code, role: 'runner' }` (a new number creates a runner user + `runner_profiles` row; the API records the phone check as approved, row 217) |
| Success routing | F§6.2 with `flowRole: 'runner'`, `fresh: true`, `replaceUrl: true`, in this order: (1) admin / business / unknown role → not-allowed line, `dropSession()`; (2) customer role or API `role_mismatch` → wrong-account line, `dropSession()`; (3) no `displayName` → `/app/runner/name`; (4) onboarding step (F§6.3): `id` → `/app/runner/onboarding/id`, `selfie` → `/app/runner/onboarding/selfie`, `pending` → `/app/runner/onboarding/pending` (inside the shell; Back → Jobs), `shell` → (5); (5) `returnUrl` (validated) or `/app/runner/jobs` |
| Wrong account (row 127) | Other-error line, centred: `This number is registered as a customer account. Use another number, or contact support.` + `Contact support` link when `links.runner.supportUrl` is set. Boxes cleared, field stays enabled (built app). The session the API issued is revoked at once (`dropSession()` calls `POST /auth/logout` with credentials, clearing the cookie) |
| Suspended | `This account can't sign in. Contact support.` + `Contact support` from `links.runner.supportUrl` |
| Not allowed (admin, business, unknown) | `This number can't be used to sign in here. Use another number, or contact support.` (**proposed**, WQ-11; the runner app shows the customer-account sentence for admins too, which is not accurate on a website that has both areas) |
| Document title | `Enter the code · Nitume Runner` (**proposed**) |

Unchanged (exact): `Enter the code`; `We sent a 6-digit code to ` + formatted number (Fira Code) + `.` (mockup sample `+254 733 111 222`); `Verify & continue`; `Didn't get it?` · `Resend code`; `Didn't get it? Resend code in 0:59`; `Enter the 6-digit code.`; `That code is incorrect. Try again.`; `Too many incorrect attempts. Request a new code.`; `This code has expired. Request a new code.`; `New code sent.`; `Too many code requests. Try again in N min.` / `… Try again later.`; `We couldn't send the code. Try again.`; generic errors. No wordmark on this screen (back header only), as the customer view.

Mobile spec note: "attempts-left count" is listed there as a numeric field, but the built screen never shows a count; the web follows the built screen (no count).

## Task states
None.

## Numeric fields (Fira Code)
OTP digits and placeholders; phone number in the sub; countdown; `N` minutes.

## Data
- `POST /api/v1/auth/otp/verify { phone, code, role: 'runner' }` with credentials (cookie mode TBD-api).
- `GET /api/v1/users/me` (displayName, role); `GET /api/v1/runners/me` (`verification.verified`, `checks`, `level2Missing`) and, only when `level2Missing` is absent, `GET /api/v1/runners/me/verifications` (all exist).
- `POST /api/v1/auth/otp/request` for resend; `POST /api/v1/auth/logout` on refusal.
- needs: api-contract RA-9 (`role_mismatch` on verify so no customer session or cookie is issued to the runner flow). Until then the client refusal above.
- No socket events (the shell connects after routing).

## Required tests (Vitest)
All of `customer-v-auth-otp.md` "Required tests" run as one parameterised suite over both roles. Runner-only:
1. Verify sends `role: 'runner'`.
2. Customer-role result → wrong-account line, boxes cleared, `POST /auth/logout` with credentials, access token cleared, no navigation; `Contact support` only when configured.
3. API `role_mismatch` (simulated) → the same.
4. Admin result → not-allowed line and `logout`.
5. **Runner applicant routing**: fresh runner without name → `/app/runner/name`; with name and `level2Missing: [government_id_front, government_id_back, selfie]` all `missing` → `/app/runner/onboarding/id`; ID sides pending + selfie missing → `/app/runner/onboarding/selfie`; `level2Missing: []` not verified → `/app/runner/onboarding/pending`; verified → `/app/runner/jobs`; `GET /runners/me` 500 → `/app/runner/jobs`.
6. Older API (no `level2Missing`) uses `GET /runners/me/verifications` and the row-268 rule.
7. `returnUrl=/app/runner/earnings` is honoured for a verified runner, ignored when onboarding step is `id`/`selfie`.

## Current vs design
Nothing equivalent on the website (the old `/auth` page sends no role and has no role check).

## Questions
- WQ-11 (F§11).
