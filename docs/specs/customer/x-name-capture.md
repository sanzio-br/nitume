# x-name-capture — Your name (first sign-in)

- Mockup: **not drawn.** Required by OA-2 (`display_name` collected after first sign-in). Built only from design-system patterns and the `.auth-wrap` layout of `v-auth-phone`; all copy is **(proposed)**.
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

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
- Save: `PATCH /api/v1/users/me` `{ displayName }` (trimmed, 2–60 chars). needs: api-contract — today `UpdateProfileDto` accepts only `email` and there is no `display_name` column (A-15, approved by OA-2: add to users for customers and runners, return on `GET /users/me`, and on runner summaries).
- On success update the cached `AppUser` so Home greets by name immediately.
- No socket events.

## Accessibility and mobile
- Field announced as "Your name"; error announced.
- Keyboard action "done" submits. Button stays above the keyboard.
- Safe areas top and bottom.

## Open questions (non-blocking)
- Q1: Should customers be able to edit their name later (e.g. tap the name on `v-profile` to open this screen in edit mode with header `Edit name` and a back arrow)? Not drawn. Default: not built.
- SQ-3 (`_shared.md` §9): whether runners see the customer's full name or a short form is an API/privacy decision.

## Current vs design
Not built.
