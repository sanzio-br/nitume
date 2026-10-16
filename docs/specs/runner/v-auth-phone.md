# v-auth-phone — Phone entry (sign in / apply as a Runner)

- Mockup: `docs/design/nitume_runner_app.html` lines 294–302 (`#v-auth-phone`, overlay)
- Shared conventions: `_shared.md` (runner); customer equivalent `docs/specs/customer/v-auth-phone.md` (same behaviour, different copy)
- Implementation: `apps/runner_app/lib/src/screens/auth/phone_screen.dart` (branch `feat/runner-scaffold`)
- Status: matches-design (audit 2026-10-13 PASS, `docs/audits/runner-gap-report.md` §7)

## Purpose
First screen for a signed-out runner. Collects a Kenyan phone number and requests an OTP. Same screen for new applicants and returning runners.

## Entry / exit
- Entry: app launch with no valid session; `Log out` on `v-profile`; session expiry; suspended account refused on refresh.
- Exit: `Send code` success → push `v-auth-otp` with the normalised number and cooldown end. No back button (root of the signed-out stack).
- Legal links (row 131) → `x-legal` (external, runner terms URL).

## Task states
None (pre-auth).

## Layout (top to bottom)
Full screen on slate, no tab bar. `.auth-wrap`: flex column, vertically centred, horizontal padding 28.
1. Wordmark row R-17 (`NitumeWordmark(suffix: 'Runner')`): 9px green dot + `Nitume` 22/700 blue, gap 9, then `Runner` 12/600 slate-600; margin-bottom 30.
2. Heading 22/700 blue, margin-bottom 8.
3. Sub 13 slate-600, margin-bottom 26.
4. Phone field C-17 phone variant (white, r-s 8, 2px green focus; mockup: 10px radius), full width, margin-bottom 16; inline red 12.5 error below.
5. Primary button C-01 full width, pill (mockup: radius 14), margin-bottom 14.
6. (row 131) legal line 12.5 slate-600 with `Terms` and `Privacy Policy` C-04 link widgets (48 dp hit areas), as the customer app.

## Components
| Element | Component | Status |
|---|---|---|
| Wordmark with suffix | R-17 | change (core-ui) |
| Phone field | C-17 `NitumeField.phone` | exists |
| Send code | C-01 | exists |
| Legal links | C-04 link | exists |

## Copy
Exact, from the mockup:
- Heading: `Earn on your own schedule.`
- Sub: `Enter your phone number to sign in or apply as a Runner.`
- Placeholder: `+254 7XX XXX XXX`
- Button: `Send code`

Proposed:
- Legal (row 131): `By continuing you agree to Nitume's Runner Terms & Privacy Policy.`
- States: identical to the customer spec (OA-17): loading spinner in the button, field read-only; invalid number `Enter a valid Kenyan number, e.g. +254 712 345 678`; cooldown → go to `v-auth-otp` silently; `Too many code requests. Try again in N min.` / `… Try again later.`; send failure `We couldn't send the code. Try again.`; network/unknown generic errors.

## Numeric fields (Fira Code)
- Phone input text and placeholder.
- `N` in the rate-limit message.

## Data
- `POST /api/v1/auth/otp/request` `{ phone }` (exists) through core `AuthRepository.requestOtp(KenyanPhone.normalize(...))`; error codes `OTP_COOLDOWN`, `OTP_RATE_LIMITED` with `retryAfterSeconds` (exist).
- No socket events.

## Accessibility and mobile
- Field label `Phone number`; error is a live region.
- `TextInputType.phone`; keyboard action submits; button stays above the keyboard; safe areas.

## Decisions (owner, 2026-10-13)
- Row 131 (RQ-19): Terms and Privacy on runner sign-in. Row 127 (RQ-15): one phone, one role.

## Questions
- None new.
