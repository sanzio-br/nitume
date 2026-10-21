# v-auth-otp — Verify the code

- Mockup: `docs/design/nitume_runner_app.html` lines 304–313 (`#v-auth-otp`, overlay)
- Shared conventions: `_shared.md`; customer equivalent `docs/specs/customer/v-auth-otp.md` (OTP policy OA-17, error kinds, cooldown)
- Implementation: `apps/runner_app/lib/src/screens/auth/otp_screen.dart`, `services/session.dart` (branch `feat/runner-scaffold`)
- Status: matches-design (audit 2026-10-13 PASS; D-1 routing step 3 deferred to the onboarding build, `docs/audits/runner-gap-report.md` §7)

## Purpose
Verify the 6-digit SMS code, create the runner account on first sign-in (`role: runner`) and route the runner to name capture, onboarding or the shell.

## Entry / exit
- Entry: `v-auth-phone` success (or cooldown).
- Back (C-10 back only, no title) → `v-auth-phone`.
- Success routing (in order):
  1. `user.role != runner` → stay, show the wrong-account error (row 127), clear tokens.
  2. `displayName` empty → `x-name-capture` (replace stack).
  3. Verification not complete (`_shared.md` §9) and no `government_id`/`selfie` submitted → `v-onboard-id` (replace stack); submitted but not approved → shell on `v-jobs` (which shows the verification card) with `v-onboard-pending` pushed. Mockup: `Verify & continue` → `v-onboard-id` always.
  4. Verified → shell on `v-jobs`.
- After every successful sign-in: register the FCM token (`_shared.md` §10).

## Task states
None.

## Layout (top to bottom)
1. Pushed header row with the back button only (C-10, no title).
2. `.auth-wrap` (padding 0 28, top padding 0): heading 22/700, margin-bottom 8; sub 13 slate-600, margin-bottom 26.
3. OTP field C-26: 6 boxes 44×52, gap 8, r 10, white, slate-line border; filled box green border (active/complete state); digits Fira Code 18/600; margin-bottom 22. Error text red 12.5 below.
4. Primary C-01 full width `Verify & continue`, margin-bottom 16; enabled when 6 digits are entered.
5. Resend line C-38 centred 12.5 slate-600: `Didn't get it?` + `Resend code` (green-700 link), countdown `Resend code in 0:59` (Fira Code) during cooldown.

## Components
C-10, C-26 `OtpCodeField`, C-38 `OtpResendLine`, C-01, C-04 — all exist.

## Copy
Exact, from the mockup:
- Heading: `Enter the code`
- Sub: `We sent a 6-digit code to +254 733 111 222.` (number = the normalised phone, formatted `+254 733 111 222`, Fira Code span)
- Button: `Verify & continue`
- Resend: `Didn't get it?` · `Resend code`

Errors and states: as the customer spec (wrong code with attempts left, expired code, too many attempts → request a new code, cooldown, network). Proposed, runner-only:
- Wrong account type (row 127): `This number is registered as a customer account. Use another number, or contact support.` + C-04 `Contact support` (x-support) when `AppConfig.supportUri` is set.
- Suspended/banned (`account_suspended`): `This account can't sign in. Contact support.`

## Numeric fields (Fira Code)
- OTP digits; phone number in the sub; countdown `0:59`; attempts-left count.

## Data
- `POST /api/v1/auth/otp/verify` `{ phone, code, role: 'runner' }` (exists; a new phone creates a runner user + `runner_profiles` row). An existing customer phone signs in **as a customer** today: the app must refuse it client-side (role check) and drop the tokens; RA-9 asks the API for an explicit `role_mismatch` refusal so no customer session is issued to the runner app.
- `GET /users/me` (displayName), `GET /runners/me` + `GET /runners/me/verifications` (routing, exist).
- `POST /auth/otp/request` for resend (exists).
- OTP message copy (owner, 2026-10-16): the code is valid 5 minutes (TTL 300 s). SMS, owner wording word for word (row 158): `Your Nitume verification code is {{code}}. It expires in 5 minutes. Do not share this code with anyone.` Built SMS (`africas-talking-otp-sender.ts:23` on `main`) still says `Nitume verification code: {code}. Your verification code expires in 5 minutes. Do not share it.`, needs api-contract. Email: see customer `v-auth-otp.md` Data. The screen states no duration.
- No socket events (the socket connects after routing).

## Accessibility and mobile
- One-time-code autofill (`AutofillHints.oneTimeCode`); boxes read as one field `Verification code, 6 digits`.
- Errors announced; safe areas; button above the keyboard.

## Decisions (owner, 2026-10-13)
- Row 127 (RQ-15): one phone, one role; the runner app rejects customer-role numbers (built client-side; RA-9 adds the API refusal).

## Questions
- None new.

## RN-L1 addendum (2026-10-21): onboarding routing step 3 (`services/onboarding_routing.dart`)

Rows 263, 268 answered 2026-10-21. Step 3 decides from `GET /runners/me` `verification`, with an approved unlabelled ID photo counting for a missing side (row 268). Order:
1. `me.isVerified` → shell (`v-jobs`), unchanged.
2. **`me.verification.level2Missing` present** (API on `feat/api-verification-answers`):
   - `[]` (`meetsLevel2 == true`): ID and selfie are done → `pending` (shell + `v-onboard-pending`; only phone or M-Pesa identity remains). Never `v-onboard-id` / `v-onboard-selfie`, and no `GET /runners/me/verifications` call is needed.
   - non-empty: the list also names **pending and rejected** checks (it is "newest record not approved"), so it says *which* checks to look at, not that they must be captured. For each listed entry in API order, read its status from `me.verification.checkFor(...)` (absent check = `missing`): `government_id_front` / `government_id_back` with status `missing` → `id`; else `selfie` with status `missing` → `selfie`; otherwise (only pending / rejected entries) → `pending`. A rejected item is fixed from `v-onboard-pending` (`Upload again` / `Retake selfie`), as today.
3. **`level2Missing` absent** (older API, `null`): fall back to `RunnerVerificationDocuments.fromRecords(await account.verifications(), summary: me.verification)`: `idStatusFor(front)` or `idStatusFor(back)` is `missing` → `id`; `selfie == null` → `selfie`; else `pending`. Replaces `docs.idFront == null || docs.idBack == null`, which sent a runner with an approved unlabelled photo back to capture.
4. Any failure → shell (unchanged).

Effect: a runner whose ID side is approved only through an unlabelled photo is never routed to `v-onboard-id`; a runner who dropped to Level 1 (row 263 (a)) lands on the shell with `v-onboard-pending` showing the rejected or in-review row (existing copy). Tests: `level2Missing: []` + not verified → `pending`; `[government_id_back, selfie]` with back `missing` → `id`; with back `pending`, selfie `missing` → `selfie`; all listed `pending`/`rejected` → `pending`; `null` + one approved unlabelled record + labelled back pending + selfie → `pending`.
