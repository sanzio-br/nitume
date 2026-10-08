# x-name-capture — Your name (first sign-in)

- Mockup: **not drawn.** Required by OA-2 (`display_name` collected after first sign-in). Built only from design-system patterns and the `.auth-wrap` layout of `v-auth-phone`; all copy is **(proposed)**.
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/auth/name_capture_screen.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Collect the customer's display name once, right after the first successful sign-in, so the app can greet them and runners see who the task is for.

## Entry / exit
- Entry: `v-auth-otp` success, or session restore on launch, when `GET /users/me` returns an empty `displayName` (null or blank). Replaces the stack (no way back to the OTP screen).
- Exit: "Continue" success → replace the stack with the signed-in shell on `v-home`.
- No back button and no skip. The system back gesture on Android minimises the app (same as a root screen).
- Profile edit entry point: not in MVP scope (open question Q1). Build create mode only.

## Task states
None.

## Layout (top to bottom)
Same frame as `v-auth-phone`: full-screen on slate, no tab bar, `.auth-wrap` (flex column, vertically centred, horizontal padding 28).
1. Wordmark (`NitumeWordmark`), margin-bottom 30.
2. Heading 22/700 blue, margin-bottom 8.
3. Sub copy 13 slate-600, margin-bottom 26.
4. Field (C-17): label `Your name` (12.5/600 slate-600, margin-bottom 6), white input r-s 8, 2px green focus; inline error red 12.5 below. Margin-bottom 16.
5. Primary button (C-01) full width.

## Components
| Element | Component | Status |
|---|---|---|
| Wordmark | `NitumeWordmark` | built |
| Name field + error | C-17 `NitumeField` (text, `TextCapitalization.words`, `autofillHints: [AutofillHints.name]`) | built |
| Continue | C-01 | built |

## Copy (proposed)
- Heading: `What should we call you?`
- Sub: `Your runner sees this name on your tasks.`
- Field label: `Your name`
- Placeholder: `e.g. Achieng Otieno`
- Button: `Continue`
- Validation: empty or under 2 characters after trimming → `Enter your name.`; over 60 characters → `Keep it under 60 characters.`
- Saving: button spinner, field read-only.
- Save error: inline under the field `Couldn't save your name. Try again.`

## Numeric fields (Fira Code)
None.

## Data
- Save: `PATCH /api/v1/users/me` `{ displayName }` (trimmed, 2–60 chars; exists).
- After a successful save, push registration runs if it has not yet (row 31, `_shared.md` §10).
- On success update the cached `AppUser` so Home greets by name immediately.
- No socket events.

## Accessibility and mobile
- Field announced as "Your name"; error announced.
- Keyboard action "done" submits. Button stays above the keyboard.
- Safe areas top and bottom.

## Open questions (non-blocking)
- Q1: Should customers be able to edit their name later (e.g. tap the name on `v-profile` to open this screen in edit mode with header `Edit name` and a back arrow)? Not drawn. Default: not built.
- Whether runners see the customer's full name or a short form: an API decision (row 40 made the API responsible for short names); no customer-app change either way.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: no `TextCapitalization.words` (core `NitumeField` has no parameter yet; flutter-customer need open).
