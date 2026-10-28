# customer `v-auth-otp` (web): verify the code

- Route: `/app/customer/sign-in/code` (`guestGuard`, `otpStepGuard`). Shared rules: `auth-foundation.md` (F§n). Kit: `ui-kit.md` (K§n).
- Sources: mobile spec `docs/specs/customer/v-auth-otp.md` (matches-design); Flutter `apps/customer_app/lib/src/screens/auth/otp_screen.dart`, core `otp_code_field.dart` (C-26), `otp_resend_line.dart` (C-38), `otp_policy.dart`; mockup `nitume_customer_app.html` lines 329–341; OA-2, OA-13, OA-17, rows 31, 39.
- Runner variant: `runner-v-auth-otp.md`.
- Implementation: none. Status: **missing**.

## Purpose
Verify the 6-digit SMS code, start the session (access token in memory, refresh cookie set by the API, WQ-8), then route by role (F§6.2).

## Entry / exit
- Entry: `Send code` success or a cooldown hit on `v-auth-phone` (phone and `cooldownEndsAt` from `SignInFlowStore`). Direct load or reload without that state → back to the phone screen (`otpStepGuard`).
- Back (`nm-back-button`, or browser Back) → `/app/customer/sign-in` with the number prefilled.
- Verify success → `SessionStore.completeSignIn` → `resolveDestination` (F§6.2) with `flowRole: 'customer'`, `fresh: true`, `replaceUrl: true`:
  - customer, no `displayName` → `/app/customer/name` (OA-2);
  - customer with a name → `returnUrl` (validated) or `/app/customer/home`;
  - runner number → the runner destination (WQ-10 default);
  - admin / business / unknown role → stay, not-allowed line (WQ-11), `dropSession()`.
- `Resend code` → new OTP request, stay.
- After success `RealtimeService.connect()` is called by the shell when it first renders (not here). No FCM registration on the web (F§4.5).

## Task states
None (pre-auth).

## Layout (top to bottom), inside `nm-auth-frame` with its header slot
1. `nm-pushed-header` with back only, no title (below 768px at the top of the viewport; from 768px inside the column, 16px above the heading, F§7.4).
2. Heading block: `h1` `Enter the code` (`auth-heading`), 8px, sub (`muted`), 26px.
3. `nm-otp-field`, left-aligned in the column (as the app's row), then its error line.
4. Other-error line (suspended, wrong account, network…): `error` style, centred, `role="alert"`, 10px above; optional `Contact support` link under it (when configured).
5. 22px gap, primary `nm-button` `Verify & continue`, `expand`, `type="submit"`.
6. 16px gap, `nm-otp-resend-line`, centred (hidden while the hourly limit applies).

## Components
| Element | Component | Status |
|---|---|---|
| Back header | `nm-pushed-header` + `nm-back-button` | NEW (#6, F§7.2) |
| OTP boxes | `nm-otp-field` | NEW (#6) |
| Verify button | `nm-button` primary, `loading` | kit |
| Resend line + countdown | `nm-otp-resend-line` | NEW (#6) |
| Contact support link | `nm-button` link, `href`, new tab | kit |
| `New code sent.` | `NmToastService` | kit |

### `nm-otp-field` (port of C-26 `OtpCodeField`)
- Inputs: `length` (6), `disabled`, `error: string | null`, `ariaLabel` (default `Verification code, 6 digits`), `autofocus` (true). Outputs `codeChange`, `completed` (fires once when the 6th digit arrives). `ControlValueAccessor`.
- One real `<input>` (`type="text"`, `inputmode="numeric"`, `autocomplete="one-time-code"`, `pattern="[0-9]*"`, `maxlength="6"`, `spellcheck="false"`, `autocorrect="off"`), transparent and laid exactly over the boxes so taps, typing, paste and SMS autofill all go to it; the boxes are `aria-hidden`. Non-digits are stripped on input; a paste of `123 456` or `Your code is 123456` keeps the first 6 digits.
- Boxes: 6 × (44 × 52px), gap 8px (row width 304px), white, 1px border, radius `--nitume-r-s` 8px (Flutter `innerBoxRadius`; mockup 10px), centred digit in `num-otp` (Fira Code 18/600 blue). Empty box shows `•` in slate-400. Border: filled = green (complete state), empty = slate-line, **every box red when `error` is set** (OA-13).
- Focus (web adaptation; the app hides the caret): while the input has focus, the box at the next position (`min(code.length, 5)`) shows the 2px green focus ring, offset 1px (field focus rule, K§4.5).
- Error line: 8px under the boxes, `error` style (12.5 red), centred under the row, `role="alert"`, linked by `aria-describedby`; the input gets `aria-invalid="true"`.
- `disabled`: input disabled, boxes keep their look (Flutter `enabled: false`).

### `nm-otp-resend-line` (port of C-38 `OtpResendLine`)
- Inputs: `cooldownEndsAt: number` (epoch ms), `sending: boolean`. Output `resend`.
- Remaining seconds = `max(0, ceil((cooldownEndsAt − now) / 1000))`, recomputed every second from the clock (web adaptation: a background tab's throttled timers cannot make it drift).
- Counting: one centred line, height 48px, `resend` type: `Didn't get it? Resend code in ` + `formatCountdown` value (`0:59`) in `nmNum` with `num-resend`. Nothing is clickable.
- At 0: `Didn't get it?` + `nm-button` variant `link` size `small` `Resend code` (green-700, 48px hit area); disabled while `sending`.
- Screen readers: the visual countdown is `aria-hidden`; a visually hidden `aria-live="polite"` node announces only at start `You can resend in 60 seconds.` (the remaining value) and at zero `You can resend the code now.` (both **proposed**; mobile spec: announce at start and at zero, not every tick).

## Copy (exact)
- Heading: `Enter the code`
- Sub: `We sent a 6-digit code to ` + phone + `.` where phone is `formatPhoneIntl(phone)` (`+254 712 345 678`) in an `nmNum` span (Fira Code 13 slate-600).
- Button: `Verify & continue`
- Resend: `Didn't get it?` · `Resend code`; counting `Didn't get it? Resend code in 0:59`

## States (OA-17, as the built app)
| State | Behaviour and copy |
|---|---|
| Arrive | Input focused, boxes empty, countdown from the stored `cooldownEndsAt` |
| Typing | Clears a code error (not a needs-new-code error) |
| 6th digit entered | Auto-submit |
| `Verify & continue` with fewer than 6 digits | Code error `Enter the 6-digit code.` |
| Verifying | Button `loading`, field disabled, no second submit |
| Wrong code (`otp_incorrect`) | Code error `That code is incorrect. Try again.`; boxes cleared and refocused. No attempts count is shown |
| Attempts used up (`otp_attempts_exhausted`) | Code error `Too many incorrect attempts. Request a new code.`; field and button disabled until a new code is sent; resend link live at once if the cooldown is over, else the countdown |
| Expired or replaced (`otp_expired`, `otp_not_requested`) | Code error `This code has expired. Request a new code.`; field and button disabled until resend |
| Resend sending | Link disabled |
| Resend sent | Toast `New code sent.`; `cooldownEndsAt = now + 60 s` (also written to `SignInFlowStore`); boxes cleared, field and button enabled, code error cleared |
| Resend inside cooldown (`otp_resend_cooldown`) | Countdown restarts from `retryAfterSeconds`, no message |
| Resend hourly limit (`otp_rate_limited`) | Other-error line `Too many code requests. Try again in N min.` (N in `nmNum`; `… Try again later.` without a value); the resend line is hidden for the rest of the visit |
| Resend network throttle (`otp_ip_rate_limited`) | Same line as the hourly limit (F§3) |
| Resend delivery failed (`otp_delivery_failed`) | `We couldn't send the code. Try again.` |
| Verify network throttle (`otp_ip_rate_limited` on verify) | `Too many attempts. Try again in N min.` (**proposed**, WQ-14) |
| Account suspended or banned (`account_suspended`; an uncoded 401 on verify is treated the same) | Other-error line `This account can't sign in. Contact support.` + `Contact support` link when `links.customer.supportUrl` is set (F§8). Never a reason |
| Not allowed role (admin, business, unknown) | `This number can't be used to sign in here. Use another number, or contact support.` (**proposed**, WQ-11) + `Contact support` link when configured; `dropSession()` |
| Network (status 0) | `Check your connection and try again.` |
| Other | `Something went wrong. Please try again.` |

## Numeric fields (Fira Code)
- OTP digits (and the `•` placeholders).
- Phone number in the sub copy.
- Countdown `0:59`.
- `N` minutes in the rate-limit lines.

## Data
- `POST /api/v1/auth/otp/verify { phone, code, role: 'customer' }` with credentials (F§4.3; cookie mode TBD-api). Response `{ user, tokens }`; only `tokens.accessToken` is kept, in memory.
- Then `GET /api/v1/users/me` (`displayName`, `role`); fallback to the verify user.
- `POST /api/v1/auth/otp/request { phone }` for resend.
- No socket events here. No storage writes (F§4.1).
- The SMS wording (row 158) is the API's; this screen states no validity period.

## Accessibility and responsive
- The six boxes read as one field `Verification code, 6 digits`; errors are live regions.
- Back button accessible name `Back`, 48×48.
- Enter submits; the button is a real submit button.
- Works with SMS autofill on Android Chrome and iOS Safari (`autocomplete="one-time-code"`). The WebOTP API is not used (it needs a domain-bound SMS format the API does not send).
- At 360px the 304px row fits the 28px-padded column exactly; nothing scrolls sideways.

## Required tests (Vitest)
1. Copy: heading, sub with the formatted number inside `nmNum`, button, resend lines.
2. `nm-otp-field`: typing digits fills boxes with green borders; letters are stripped; paste `Your code is 123456` → `123456`; 6th digit emits `completed` once; `•` placeholders; focused box ring at the next position; error makes every border red and links the message with `aria-describedby`.
3. Auto-submit on the 6th digit sends `{ phone, code, role: 'customer' }` with credentials.
4. Fewer than 6 digits + button → `Enter the 6-digit code.`, no request.
5. `otp_incorrect` → copy, boxes cleared, focus back in the input.
6. **Lockout**: `otp_attempts_exhausted` → copy, field and button disabled; resend re-enables them.
7. `otp_expired` and `otp_not_requested` → expired copy, disabled until resend.
8. **Resend**: countdown `1:00` → `0:00` with fake timers (one assertion at 0:59, one at 0:00); the link appears at 0; a click sends `requestOtp`, shows `New code sent.`, restarts at `1:00`, clears the boxes.
9. Resend `otp_resend_cooldown` with `retryAfterSeconds: 30` → countdown `0:30`, no message.
10. Resend `otp_rate_limited` → rate-limit line with N in Fira Code; resend line hidden.
11. Resend `otp_delivery_failed` → its copy.
12. Countdown from `cooldownEndsAt` is correct after a simulated 20 s timer stall (clock-based).
13. Live region announces only at start and at zero.
14. `account_suspended` (and an uncoded 401) → suspended line; `Contact support` link only when `supportUrl` is set.
15. Success routing: customer without name → `/app/customer/name`; with name → `/app/customer/home`; with a valid `returnUrl` → it; runner number → runner destination; admin → not-allowed line and `logout` called. All with `replaceUrl`.
16. Back → phone screen with the number prefilled.
17. Reload without flow state → phone screen (`otpStepGuard`).
18. Verify `otp_ip_rate_limited` → `Too many attempts. Try again in N min.`
19. No storage writes; the refresh token in the response body is not kept.

## Current vs design
The old `/auth` page shows the code field on the same card as the phone (plain input `6-digit code`, slate fill, 10px radius), labels the button `Log in` / `Create account`, has `Change number` instead of Back, no resend, no countdown, no OA-17 error copy (API `message` shown raw), sends no `role`, stores tokens in `localStorage` and navigates to `/`. None of it is reused (F§1, WQ-9).

## Questions
- WQ-10, WQ-11, WQ-14 (F§11).
