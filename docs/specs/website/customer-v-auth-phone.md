# customer `v-auth-phone` (web): phone entry, sign in or sign up

- Route: `/app/customer/sign-in` (`guestGuard`). Shared rules: `auth-foundation.md` (cited as F§n). Kit: `ui-kit.md` (cited as K§n).
- Sources: mobile spec `docs/specs/customer/v-auth-phone.md` (status matches-design); Flutter `apps/customer_app/lib/src/screens/auth/phone_screen.dart`, `auth_frame.dart`; mockup `docs/design/nitume_customer_app.html` lines 317–327; OA-11, OA-12, OA-13, OA-17, rows 39, 82.
- Runner variant: `runner-v-auth-phone.md` (same layout and states, different copy).
- Implementation: none yet (`apps/website/src/app/pages/auth/auth.component.ts` is the old public page, not this view; F§1, WQ-9). Status: **missing**.

## Purpose
First screen for a signed-out customer on the website. Collects a Kenyan phone number and requests an OTP. Same screen for new and returning customers.

## Entry / exit
- Entry: `/app` when signed out (F§6.4); `authGuard` redirect from any `/app/customer/**` URL (with `returnUrl`); the `/auth` chooser (WQ-9 default); full-reload sign-out (F§4.5, with an optional `signedOut` toast); Back from the code screen (number prefilled from `SignInFlowStore`).
- Exit: `Send code` success → store `{ phone, cooldownEndsAt: now + 60 s }` and navigate to `/app/customer/sign-in/code` (keeps `returnUrl`). No back button (root of the signed-out flow). Browser Back leaves `/app` normally.
- Cooldown hit (`otp_resend_cooldown`) → same navigation with `cooldownEndsAt = now + retryAfterSeconds`, no error.
- `Terms` / `Privacy Policy` → the configured URLs in a new tab (F§8).
- Signed-in visitor → `guestGuard` sends them on (F§6.1).

## Task states
None (pre-auth).

## Layout (top to bottom), inside `nm-auth-frame` (F§7.4)
Slate page, no nav, content column max 400px, horizontal padding 28px, vertically centred.
1. `nm-wordmark` (no suffix), left-aligned, margin-bottom 30px.
2. Heading block: `h1` `auth-heading` 22/700 blue, 8px gap, sub `muted` 13/400 slate-600, margin-bottom 26px.
3. Phone field: `nm-field` kind `phone`, `label="Phone number"` with `hideLabel` (F§7.1), full width. Field error under it per K§4.5.
4. Other errors (rate limit, delivery, network): one line in `error` style (12.5 red), `role="alert"`, 8px under the field, left-aligned.
5. 16px gap, primary `nm-button` `Send code`, `expand`, `type="submit"`.
6. 14px gap, `nm-legal-line` (12.5 slate-600, left-aligned).

The field and button are one `<form>` (`novalidate`); Enter submits (mobile keyboard action "send").

Responsive: identical at every width; at ≥ 768px only the column width caps at 400px. No horizontal scroll at 360px.

## Components
| Element | Component | Status |
|---|---|---|
| Wordmark | `nm-wordmark` | NEW (#6, F§7.2) |
| Frame + heading block | `nm-auth-frame` | NEW (#6) |
| Phone field + field error | `nm-field` kind `phone` (+ `hideLabel`) | kit (#5); `hideLabel` is a #6 kit addition |
| Send code | `nm-button` primary, `loading` | kit (#5) |
| Legal line | `nm-legal-line` | NEW (#6) |
| Toast after sign-out | `NmToastService` | kit (#5) |

`nm-legal-line` (port of `_LegalLine`): inputs `termsLabel` (`Terms` / `Runner Terms`), `termsUrl`, `privacyUrl`. Renders `By continuing you agree to Nitume's ` + terms part + ` & ` + `Privacy Policy` part + `.` in the `resend` type style (12.5/400 slate-600), wrapping. A part with a URL is an `nm-button` variant `link` size `small` rendered as `<a href target="_blank" rel="noopener noreferrer">` with a 48×48 hit area, inline with the text (green-700, design-system link); without a URL the words are plain text. Mobile spec minor (48dp hit area) is met this way.

## Copy (exact, from the mockup and the mobile spec)
- Heading: `Someone there, when you can't be.`
- Sub: `Enter your phone number to sign in or create an account.`
- Placeholder: `+254 7XX XXX XXX`
- Button: `Send code`
- Legal: `By continuing you agree to Nitume's Terms & Privacy Policy.` (`Terms` and `Privacy Policy` are the link parts)

## States
| State | Behaviour and copy |
|---|---|
| Idle | Field empty and enabled; button enabled (validation happens on submit, as the app) |
| Invalid number (client check, `normalizeKenyanPhone`) | Field error `Enter a valid Kenyan number, e.g. +254 712 345 678`. Cleared on the next input. No request sent |
| Loading | Button `loading` (white spinner, `aria-busy`), field `readonly`, repeated submits ignored |
| Cooldown active (`otp_resend_cooldown`) | No error; go to the code screen with the remaining cooldown |
| Hourly limit or network throttle (`otp_rate_limited`, `otp_ip_rate_limited`) | `Too many code requests. Try again in N min.` with N = `minutesFrom(retryAfterSeconds)` wrapped in `nmNum`; without `retryAfterSeconds`: `Too many code requests. Try again later.` Button stays enabled |
| SMS delivery failed (`otp_delivery_failed`) | `We couldn't send the code. Try again.` |
| Network error (status 0) | `Check your connection and try again.` (`friendlyError`) |
| Any other error | `Something went wrong. Please try again.` |
| Arrived with `?signedOut=` | Toast per F§4.5 (`Please sign in again.` / `This account can't sign in. Contact support.` / not-allowed line), once |

Input handling (web adaptation, noted for flutter-customer): spaces and hyphens are stripped before the Kenyan-number check, so the placeholder format `+254 712 345 678` is accepted; the built app trims only. The normalised `+2547XXXXXXXX` / `+2541XXXXXXXX` is what is sent and stored.

## Numeric fields (Fira Code)
- Phone input text and its placeholder (`nm-field` kind `phone`).
- `N` in the rate-limit message.

## Data
- `POST /api/v1/auth/otp/request { phone }` (exists), no credentials, no Bearer (F§5).
- Error codes and `retryAfterSeconds`: F§3.
- No socket events. No storage writes (F§4.1).

## Accessibility and responsive
- Input accessible name `Phone number` (visually hidden `<label for>`), `type="tel"`, `inputmode="tel"`, `autocomplete="tel"`; field error linked by `aria-describedby`, `aria-invalid="true"`.
- The other-error line is `role="alert"`.
- No autofocus on load; focus goes to the `h1` (F§7.3). Tab order: field, `Send code`, `Terms`, `Privacy Policy`.
- Link parts have 48×48 hit areas and the focus ring; they announce as links opening a new tab (`aria-label` suffix ` (opens in a new tab)`, **proposed**).
- Safe-area insets on all sides; the button is never hidden by the on-screen keyboard (the column scrolls when the viewport is short).

## Required tests (Vitest)
1. Renders wordmark, heading, sub, placeholder, button and legal line with the exact copy.
2. Invalid number → field error copy, no request; typing clears it.
3. `+254 712 345 678`, `0712345678`, `254712345678` each send `{ phone: '+254712345678' }`.
4. Loading: spinner, `aria-busy`, field read-only, a second submit sends nothing.
5. Success → `SignInFlowStore` holds the phone and `cooldownEndsAt ≈ now + 60 s`; navigates to `sign-in/code` and keeps `returnUrl`.
6. `otp_resend_cooldown` with `retryAfterSeconds: 42` → no error, navigates with `cooldownEndsAt ≈ now + 42 s`.
7. `otp_rate_limited` with `retryAfterSeconds: 61` → `Too many code requests. Try again in 2 min.` with `2` inside an `nmNum` element; without the field → `… Try again later.`
8. `otp_ip_rate_limited` → the same rate-limit line.
9. `otp_delivery_failed` → `We couldn't send the code. Try again.`
10. Status 0 → `Check your connection and try again.`; 500 → `Something went wrong. Please try again.`
11. Legal line: configured URLs render two links with `target="_blank"` and `rel="noopener noreferrer"`; empty URLs render plain text; a `javascript:` URL renders plain text.
12. `?signedOut=expired` → toast `Please sign in again.` once and the parameter is removed; `suspended` and `not-allowed` → their lines; `foo` → nothing.
13. Signed-in visitor is redirected by `guestGuard` (covered in F§9.5; one smoke test here).
14. No `localStorage` / `sessionStorage` writes during the flow.

## Current vs design
`/auth` (`apps/website/src/app/pages/auth/auth.component.ts`) is the only existing sign-in UI. Against this spec: login/sign-up tabs and a `Full name` field (not in the app flow; the name is OA-2's `x-name-capture`); heading, sub and button copy differ (`Send verification code`); `Continue with Google` stub and an `or` divider (no Google sign-in exists); slate input with 10px radius (OA-12: white, 8px); 10px-radius button (OA-11: pill); box-shadows and raw `#fff` (palette/token rule); phone and code on one card (app: two screens); API `message` text shown to the user instead of OA-17 copy; no rate-limit / cooldown / delivery states; tokens written to `localStorage` (WQ-8); navigates to `/` with no role routing; legal line without links. Decision on that page: WQ-9.

## Questions
- WQ-9 (the `/auth` page) and WQ-15 (session lifetime) in F§11. Nothing view-specific.
