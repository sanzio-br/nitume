# v-auth-phone — Phone entry (sign in / sign up)

- Mockup: `docs/design/nitume_customer_app.html` lines 317–327 (`#v-auth-phone`, overlay)
- Shared conventions: `_shared.md` (OA-n = owner answers, §0)
- Implementation: `apps/customer_app/lib/src/screens/auth/phone_screen.dart` (+ `auth_frame.dart`) on branch `feat/customer-screens`
- Status: matches-design

## Purpose
First screen for a signed-out user. Collects a Kenyan phone number and requests an OTP. Same screen for new and returning users.

## Entry / exit
- Entry: app launch with no valid session; "Log out" on `v-profile`; session expiry (refresh token rejected).
- Exit: "Send code" success → push `v-auth-otp` with the normalized number and the cooldown end time. No back button (root of the signed-out stack).
- "Terms" / "Privacy Policy" → `x-legal`.

## Task states
None (pre-auth).

## Layout (top to bottom)
Full-screen on slate, no tab bar. Content block vertically centred (`.auth-wrap`: flex column, justify centre, horizontal padding 28).
1. Wordmark row (`NitumeWordmark`): 9px green dot + "Nitume" Fira Sans 22/700 blue, gap 9, margin-bottom 30.
2. Heading 22/700 blue, margin-bottom 8.
3. Sub copy 13 slate-600, margin-bottom 26.
4. Phone field (C-17 phone variant, OA-12: white, r-s 8, slate-line border, 2px green focus), full width, margin-bottom 16. Inline error below the field in red 12.5 (OA-13).
5. Primary button (C-01, pill per OA-11), full width, margin-bottom 14.
6. Legal line 12.5 slate-600, left aligned; "Terms" and "Privacy Policy" are green-700 link spans (C-04) that open `x-legal`.

## Components
| Element | Component | Status |
|---|---|---|
| Wordmark | `NitumeWordmark` | built |
| Phone field + inline error | C-17 `NitumeField` (phone) | built |
| Send code | C-01 | built |
| Legal links | C-04 link spans | built |

## Copy (exact, from mockup)
- Heading: `Someone there, when you can't be.`
- Sub: `Enter your phone number to sign in or create an account.`
- Placeholder: `+254 7XX XXX XXX`
- Button: `Send code`
- Legal: `By continuing you agree to Nitume's Terms & Privacy Policy.`

States (proposed copy; OTP policy from OA-17):
- Loading: button shows a white spinner and is disabled; field read-only.
- Invalid number (client check with `KenyanPhone.normalize`): `Enter a valid Kenyan number, e.g. +254 712 345 678`.
- Cooldown active (a code was sent to this number less than 60 s ago, API code `OTP_COOLDOWN`): do not show an error. Push `v-auth-otp` for that number with the remaining cooldown from `retryAfterSeconds`.
- Hourly limit reached (5 requests per hour per phone/account, or IP/device throttle, API code `OTP_RATE_LIMITED`): `Too many code requests. Try again in N min.` (N from `retryAfterSeconds`, rounded up, Fira Code). Without `retryAfterSeconds`: `Too many code requests. Try again later.` Button stays enabled.
- SMS delivery failure (API 400): `We couldn't send the code. Try again.`
- Network error / unknown: `_shared.md` §7 generic errors.

## Numeric fields (Fira Code)
- Phone number input text and placeholder.
- `N` minutes in the rate-limit message.

## Data
- `POST /api/v1/auth/otp/request` `{ phone }` via core `AuthRepository.requestOtp(KenyanPhone.normalize(input))`. Send `+2547XXXXXXXX` / `+2541XXXXXXXX`.
- needs: api-contract — align OTP config with OA-17 (current `apps/api/src/config/configuration.ts`: `ttlSeconds` 600 → 300; `rateLimitWindowSeconds` 900 → 3600 with 5 per window) and return machine-readable error codes with `retryAfterSeconds` (`OTP_COOLDOWN`, `OTP_RATE_LIMITED`). Today both are plain 429 messages, so the client cannot tell them apart. Until then: treat any 429 as the hourly-limit message.
- No socket events.

## Accessibility and mobile
- Field label for screen readers: "Phone number". Error text announced (live region).
- Keyboard `TextInputType.phone`; action "send" submits.
- Keep the button visible above the keyboard (scrollable body with `viewInsets` padding). Safe areas top and bottom.
- Legal link spans have 48dp hit areas (pad the line).

## Resolved by owner answers
- Rate limits and cooldown: OA-17 (was Q3).
- Pill button, white 8px field, red inline errors: OA-11, OA-12, OA-13.

## Open questions (non-blocking; build default given)
- Q1: The green dot in the wordmark is a use of green outside actions/states. Default: keep it as the brand mark (as built in `NitumeWordmark`).
- Q2: Terms and Privacy URL values per environment: see `x-legal.md` (the mechanism is decided, row 39).

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Split from the OTP step; copy, states (invalid, cooldown, hourly limit, delivery failure) and Fira Code phone input match. Minor: legal link spans cannot get 48dp hit areas as `TextSpan`s (links are inactive until SQ-2).

Spec update 2026-10-08 (row 39): `url_launcher` is approved, so the legal links become live whenever `AppConfig.termsUri` / `privacyUri` are configured. The 48dp hit-area minor is now active: build the legal line as two padded link widgets (C-04 link) inside a wrap rather than `TextSpan` recognisers. Status stays `matches-design` (minor), re-check with x-legal.
