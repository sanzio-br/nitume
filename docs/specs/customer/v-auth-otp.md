# v-auth-otp — OTP verification

- Mockup: `docs/design/nitume_customer_app.html` lines 329–341 (`#v-auth-otp`, overlay)
- Shared conventions: `_shared.md` (OA-n = owner answers, §0)
- Implementation: `apps/customer_app/lib/src/screens/auth/otp_screen.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Verify the 6-digit SMS code and establish the session (JWT pair), then continue to name capture (first sign-in) or Home.

## Entry / exit
- Entry: "Send code" success on `v-auth-phone` (push), or a cooldown hit there (push with remaining cooldown).
- Back arrow → `v-auth-phone` with the number still filled in.
- Verify success:
  - `displayName` empty on `GET /users/me` → replace the stack with `x-name-capture` (OA-2).
  - Otherwise → replace the whole stack with the signed-in shell on `v-home`.
- "Resend code" → request a new OTP, stay here.

## Task states
None (pre-auth).

## Layout (top to bottom)
1. Pushed header (C-10), back button only, no title.
2. `.auth-wrap` (padding 0 28, vertically centred):
   1. Heading 22/700.
   2. Sub copy 13 slate-600, margin-bottom 26, phone number embedded.
   3. OTP row (C-26): 6 boxes 44×52, gap 8. Filled boxes have a green border; empty boxes show a `•` placeholder. Error state: all box borders red and the inline error 12.5 red below the row (margin-top 10). Margin-bottom 22.
   4. Primary button (C-01) full width, margin-bottom 16.
   5. Resend line centred, 12.5 slate-600 (C-38).

## Components
| Element | Component | Status |
|---|---|---|
| Back header | C-10 | built |
| OTP boxes | C-26 `OtpCodeField` (single hidden input, autofill `oneTimeCode`, paste support, error state) | built (error border: confirm with core-ui) |
| Verify button | C-01 | built |
| Resend line with countdown | C-38 | **NEW** |

## Copy (exact)
- Heading: `Enter the code`
- Sub: `We sent a 6-digit code to +254 712 345 678.` (the normalized number, formatted `+254 712 345 678`)
- Button: `Verify & continue`
- Resend (mockup): `Didn't get it?` + green-700 link `Resend code`

OTP policy (OA-17): code valid 5 minutes; 5 verification attempts per code; 60 s resend cooldown; 5 requests per hour per phone/account; a new code invalidates the previous one.

States (proposed copy):
- Cooldown running (first 60 s after any send): resend line reads `Didn't get it? Resend code in 0:59` with the time in Fira Code counting down each second (C-38); the link is not tappable. At 0:00 it becomes the mockup line with the green-700 `Resend code` link.
- Verifying: button spinner, boxes disabled. Auto-submit when the 6th digit is entered.
- `Verify & continue` tapped with fewer than 6 digits: inline red `Enter the 6-digit code.` (builder copy, accepted in the 2026-10-07 re-audit).
- Wrong code (API `OTP_INCORRECT`): `That code is incorrect. Try again.` Boxes cleared and refocused.
- Attempts used up (5th wrong attempt, API `OTP_ATTEMPTS_EXCEEDED`): `Too many incorrect attempts. Request a new code.` Boxes disabled until a new code is sent; resend link enabled immediately if the cooldown is over, otherwise the countdown shows.
- Code expired (older than 5 min, or replaced by a newer code; API `OTP_EXPIRED`): `This code has expired. Request a new code.` Boxes disabled until resend.
- Resend sent: snackbar `New code sent.`; countdown restarts at 1:00; boxes cleared and enabled. The old code no longer works.
- Resend hourly limit (API `OTP_RATE_LIMITED`): inline under the boxes `Too many code requests. Try again in N min.` (N in Fira Code); resend link hidden until then.
- Account suspended or banned (API code `account_suspended`; until the code exists, the 401 suspended/banned message): `This account can't sign in. Contact support.` with the `Contact support` link when `AppConfig.supportLink` is set (`x-support`, row 39). Boxes disabled; no resend. Never show the reason. The same sentence is used if a signed-in session is later refused as suspended (`_shared.md` §7).
- Network / unknown: `_shared.md` §7.

## Numeric fields (Fira Code)
- OTP digits (18/600).
- Phone number in the sub copy.
- Countdown `0:59` and `N` minutes.

## Data
- `POST /api/v1/auth/otp/verify` `{ phone, code, role: 'customer' }` → `{ user, tokens }` via `AuthRepository.verifyOtp` (persists tokens).
- `POST /api/v1/auth/otp/request` for resend.
- After success: `GET /users/me` (`displayName`, `phone`, `createdAt`) and `GET /customers/me`.
- After success register the FCM token with `POST /users/me/devices` (row 31, `_shared.md` §10); ask for push permission once. Failure to register never blocks sign-in.
- App launch calls `AuthRepository.restoreSession()` and skips auth when a valid session exists; a restored user with an empty `displayName` also lands on `x-name-capture`.
- Verify errors arrive as codes with `retryAfterSeconds` (exists on `feat/api-owner-decisions`; core `OtpErrorKind`).
- needs: api-contract — code `account_suspended` for suspended/banned accounts on verify and refresh (open need from core-ui and flutter-customer).

## Accessibility and mobile
- Announce the six boxes as one field "Verification code, 6 digits"; announce errors and the countdown ("You can resend in 59 seconds") without reading every tick (announce at start and at zero).
- `autofillHints: [AutofillHints.oneTimeCode]`; Android SMS retriever optional.
- Back hit area 48dp.

## Resolved by owner answers
- Expiry, attempts, cooldown, request limit: OA-17 (was Q1). The 60 s cooldown replaces the earlier 30 s suggestion.
- Name collection after first sign-in: OA-2 (was Q2) → `x-name-capture`.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Six boxes, C-38 countdown, OA-17 error states, suspended-account line with Support link, role `customer` sent. Builder copy `Enter the 6-digit code.` (Verify tapped with fewer than 6 digits) accepted, see Copy.

Spec update 2026-10-08 (rows 31, 39): FCM registration after sign-in and the `account_suspended` code are new; the visible screen is unchanged. Status stays `matches-design`; the push registration is tracked as a flutter-customer need.
