# v-auth-phone — Phone entry (sign in / sign up)

- Mockup: `docs/design/nitume_customer_app.html` lines 317–327 (`#v-auth-phone`, overlay)
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/auth/otp_login_screen.dart` (phone step, `AuthFormStep.phone`)
- Status: partial

## Purpose
First screen for a signed-out user. Collects a Kenyan phone number and requests an OTP. Same screen for new and returning users.

## Entry / exit
- Entry: app launch with no valid session; "Log out" on `v-profile`; session expiry (refresh token rejected).
- Exit: "Send code" success → push `v-auth-otp`. No back button (root of the signed-out stack).

## Task states
None (pre-auth).

## Layout (top to bottom)
Full-screen overlay on slate, no tab bar. Content block vertically centered (`.auth-wrap`: flex column, justify center, horizontal padding 28).
1. Wordmark row: 9px green dot + "Nitume" Fira Sans 22/700 blue, gap 9, margin-bottom 30.
2. Heading, 22/700 blue, margin-bottom 8.
3. Sub copy, 13 slate-600, margin-bottom 26.
4. Phone field (C-17), full width, margin-bottom 16.
5. Primary button (C-01) full width, margin-bottom 14.
6. Legal line, 12.5 slate-600, left aligned, "Terms" and "Privacy Policy" tappable.

## Components
| Element | Component | Status |
|---|---|---|
| Wordmark (dot + text) | NEW `NitumeWordmark` (green dot is a brand mark, not decoration — see Q1) | NEW |
| Phone field | C-17 `NitumeField` with phone keyboard, +254 prefix handling | NEW (theme partial) |
| Send code | C-01 primary | core (theme) |
| Inline error | text under field, see Q-RED | NEW (part of C-17 error state) |

## Copy (exact, from mockup)
- Heading: `Someone there, when you can't be.`
- Sub: `Enter your phone number to sign in or create an account.`
- Placeholder: `+254 7XX XXX XXX`
- Button: `Send code`
- Legal: `By continuing you agree to Nitume's Terms & Privacy Policy.`

Implied states (not drawn; recommended copy):
- Loading: button shows a white spinner, disabled, field read-only.
- Validation error: `Enter a valid Kenyan number, e.g. +254 712 345 678`.
- Network/API error: API message, fallback `Something went wrong. Please try again.`
- Rate-limited (HTTP 429): `Too many attempts. Try again in a few minutes.`

## Numeric fields (Fira Code)
- Phone number input text and placeholder (mockup renders phone numbers in Fira Code elsewhere, e.g. `v-payment-methods`).

## Data
- `POST /api/v1/auth/otp/request` `{ phone }` (§3.2; exists in `apps/api/src/auth/auth.controller.ts:31`). Send the normalized `+2547XXXXXXXX` (`KenyanPhone.normalize` in core).
- Use `AuthRepository.requestOtp` from `nitume_core` (exists) rather than a raw client.
- No socket events.

## Accessibility and mobile
- Field label for screen readers: "Phone number".
- Keyboard: `TextInputType.phone`, action "send" submits.
- Keep the button visible above the keyboard (scrollable body with `viewInsets` padding).
- Safe areas: top and bottom.

## Questions for owner
- Q1: The green dot in the wordmark is decorative use of green (design system: green never decorative). Recommended: accept as brand mark, or switch dot to blue.
- Q2: Links for Terms and Privacy Policy — which URLs (website pages are not in the website mockup either)?
- Q3 (security, §3): OTP request rate limits and resend cooldown are not specified. Recommended: server enforces (e.g. 3 requests / 10 min / phone) and the app shows the 429 message above.

## Current vs design
See `docs/audits/customer-gap-report.md#v-auth-phone`. Summary: phone and OTP are one stateful screen; copy differs ("Continue" vs "Send code", extra footer "We'll text you a code…", missing legal line); brand is a blue rounded square with a handyman icon instead of the green-dot wordmark; field is labelled "Phone number" with a phone prefix icon and `0712 345 678` hint; auth calls bypass `AuthRepository`; raw (non-normalized) phone is sent.
