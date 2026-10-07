# v-auth-otp — OTP verification

- Mockup: `docs/design/nitume_customer_app.html` lines 329–341 (`#v-auth-otp`, overlay)
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/auth/otp_login_screen.dart` (code step, `_CodeStep` lines 265–322)
- Status: partial

## Purpose
Verify the 6-digit SMS code and establish the session (JWT pair), then land on Home.

## Entry / exit
- Entry: "Send code" success on `v-auth-phone` (push).
- Back arrow → `v-auth-phone` with the number still filled in.
- "Verify & continue" success → replace the whole stack with the signed-in shell on `v-home` (mockup `jump('v-home', true)`).
- "Resend code" → re-request OTP, stay here.

## Task states
None (pre-auth).

## Layout (top to bottom)
1. Pushed header (C-10) with back button only, no title.
2. `.auth-wrap` (padding 0 28, top padding 0, vertically centred):
   1. Heading 22/700.
   2. Sub copy 13 slate-600, margin-bottom 26, phone number embedded.
   3. OTP row (C-26): 6 boxes 44×52, gap 8, margin-bottom 22. Filled boxes have a green border; empty boxes show `•` placeholder.
   4. Primary button (C-01) full width, margin-bottom 16.
   5. Resend line centred, 12.5 slate-600, link part green-700 700.

## Components
| Element | Component | Status |
|---|---|---|
| Back header | C-10 | NEW |
| OTP boxes | C-26 `OtpCodeField` (single hidden input, autofill `oneTimeCode`, paste support) | NEW |
| Verify button | C-01 | core (theme) |
| Resend link | C-04 green-700 link variant | NEW variant |

## Copy (exact)
- Heading: `Enter the code`
- Sub: `We sent a 6-digit code to +254 712 345 678.` (number = the normalized number, formatted `+254 712 345 678`)
- Button: `Verify & continue`
- Resend: `Didn't get it?` + link `Resend code`

Implied states (recommended):
- Verifying: button spinner, boxes disabled.
- Wrong / expired code: `That code is incorrect or has expired.` shown under the boxes; boxes cleared and refocused.
- Resent: snackbar `New code sent.`
- Auto-submit when the 6th digit is entered (mockup button still present).

## Numeric fields (Fira Code)
- OTP digits (18/600).
- Phone number in the sub copy.

## Data
- `POST /api/v1/auth/otp/verify` `{ phone, code, role: 'customer' }` → `{ user, tokens }` (exists, `auth.controller.ts:37`). Use `AuthRepository.verifyOtp` (core), which persists tokens.
- `POST /api/v1/auth/otp/request` for resend.
- After success: `GET /users/me` (`AuthRepository.currentUser`) and `GET /customers/me` to hydrate Home.
- App launch must call `AuthRepository.restoreSession()` and skip auth when a valid session exists (currently a TODO in `app.dart:22`).

## Accessibility and mobile
- Announce the six boxes as one field "Verification code, 6 digits".
- `autofillHints: [AutofillHints.oneTimeCode]`; Android SMS retriever is optional.
- Back hit area 48dp.

## Questions for owner
- Q1 (security, §3): OTP length is 6 per mockup; expiry time, max attempts and resend cooldown are not specified. Recommended: 5-minute expiry, 5 attempts, 30-second resend cooldown with a Fira Code countdown (`Resend code in 0:30`).
- Q2: Should a brand-new user be asked for a display name here (see Q-NAME in `_shared.md`)? The mockup goes straight to Home.

## Current vs design
See gap report. Summary: code step lives inside the phone screen (no back arrow, phone heading/brand still shown); single text field with letter-spaced digits instead of 6 boxes; copy "Verify" / "Didn't get it? Send again"; `onSubmitted: (_) => onSubmit` never calls the callback (line 298); tokens are written but `AuthRepository` and `/users/me` are not used and no session restore exists.
