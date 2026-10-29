# customer `x-name-capture` (web): your name, first sign-in

- Route: `/app/customer/name` (`authGuard`, `roleGuard('customer')`, `needsNameGuard`). Shared rules: `auth-foundation.md` (F§n). Kit: `ui-kit.md`.
- Sources: mobile spec `docs/specs/customer/x-name-capture.md` (matches-design; not drawn in the mockup, copy **proposed** there and built as written); Flutter `apps/customer_app/lib/src/screens/auth/name_capture_screen.dart`; OA-2, row 31, row 40.
- Runner variant: `runner-x-name-capture.md`.
- Implementation: none. Status: **missing**.

## Purpose
Collect the customer's display name once, right after the first sign-in (or when a restored session has no name), so the app can greet them and runners see who the task is for.

## Entry / exit
- Entry: code-screen success, `guestGuard`, or `hasNameGuard` on any shell URL, whenever `displayName` is null or blank. Replaces the history entry (no way back to the code screen).
- Exit: `Continue` success → `resolveDestination` (F§6.2) → `returnUrl` or `/app/customer/home`, `replaceUrl: true`.
- No back button, no skip. Browser Back from here leaves for the previous non-`/app` page or does nothing useful; any `/app/customer/**` URL brings the visitor back here until a name is saved.
- Edit later: not in scope (mobile Q1, default not built).

## Task states
None.

## Layout (top to bottom), inside `nm-auth-frame` (F§7.4)
1. `nm-wordmark`, margin-bottom 30px.
2. Heading block: `h1` (`auth-heading`), 8px, sub (`muted`), 26px.
3. `nm-field` kind `text` with a **visible** label `Your name` (`field-label` 12.5/600 slate-600, 6px gap), white input, 8px radius, 2px green focus; validation and save errors both show in the field's error slot under it (as the app).
4. 16px gap, primary `nm-button` `Continue`, `expand`, `type="submit"`.

One `<form>`; Enter submits.

## Components
| Element | Component | Status |
|---|---|---|
| Wordmark | `nm-wordmark` | NEW (#6) |
| Frame | `nm-auth-frame` | NEW (#6) |
| Name field + error | `nm-field` kind `text` | kit |
| Continue | `nm-button` primary, `loading` | kit |

## Copy (proposed in the mobile spec, built as written)
- Heading: `What should we call you?`
- Sub: `Your runner sees this name on your tasks.`
- Field label: `Your name`
- Placeholder: `e.g. Achieng Otieno`
- Button: `Continue`

## States
| State | Behaviour and copy |
|---|---|
| Idle | Empty field, enabled |
| Empty or under 2 characters after trimming | Field error `Enter your name.` |
| Over 60 characters after trimming | Field error `Keep it under 60 characters.` (no hard `maxlength`, as the app) |
| Saving | Button `loading`, field `readonly` |
| Save error (any API or network failure) | Field error `Couldn't save your name. Try again.` |
| Saved | Session user updated (Home greets by name at once), navigate on |
| Session ends while here (refresh fails) | Interceptor sign-out (F§5) |

Validation runs on submit; typing clears the field error.

## Numeric fields (Fira Code)
None.

## Data
- `PATCH /api/v1/users/me { displayName }` (trimmed, 2–60, exists) through `SessionStore.saveDisplayName` with Bearer.
- No push registration in #6 (WQ-4: FCM web push comes with #11/#18). No socket events. No storage writes.

## Accessibility and responsive
- `<label for>` `Your name`; `autocomplete="name"`, `autocapitalize="words"` (mobile `TextCapitalization.words`), `spellcheck="false"` (the `nm-field` `autocapitalize` / `spellcheck` inputs are a #6 kit addition, F§7.1).
- Field error linked with `aria-describedby`, `role="alert"`.
- Focus on load: the `h1` (F§7.3). Same frame at every width.

## Required tests (Vitest)
1. Copy: heading, sub, visible label, placeholder, button.
2. `""`, `" A "` → `Enter your name.`; 61 characters → `Keep it under 60 characters.`; no request in either case.
3. `"  Achieng Otieno  "` sends `{ displayName: 'Achieng Otieno' }`.
4. Saving: spinner, field read-only, no double submit.
5. API 400 / 500 / status 0 → `Couldn't save your name. Try again.`
6. Success → session user has the name; navigates to `/app/customer/home` (or a valid `returnUrl`) with `replaceUrl`.
7. `needsNameGuard`: a user with a name is redirected to home; `hasNameGuard` sends a nameless user here.
8. `autocomplete="name"` and `autocapitalize="words"` on the input.

## Current vs design
Nothing equivalent exists: the old `/auth` page asks `Full name` on its sign-up tab but never sends it to the API. Not reused.

## Questions
- None new.
