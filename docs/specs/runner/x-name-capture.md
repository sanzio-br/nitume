# x-name-capture — Your name (runner, first sign-in)

- Mockup: **not drawn** in the runner mockup. Required by OA-2 (`display_name` for customers **and runners**, collected after first sign-in). Same screen as `docs/specs/customer/x-name-capture.md`; only the copy differs. All copy **(proposed)**.
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

## Purpose
Collect the runner's display name once, before onboarding, so customers see a name on their task (the API derives the short name `Brian K.`, row 40) and ops can match it to the ID.

## Entry / exit
- Entry: `v-auth-otp` success (or session restore) when `GET /users/me` returns an empty `displayName`. Replaces the stack.
- Exit: `Continue` success → onboarding (`v-onboard-id`) or the shell, per the `v-auth-otp` routing.
- No back, no skip.

## Task states
None.

## Layout
As the customer spec: R-17 wordmark (with `Runner`), heading, sub, C-17 field `Your full name`, C-01 `Continue`.

## Copy (proposed)
- Heading: `What's your name?`
- Sub: `Use the name on your National ID. Customers see your first name and initial.`
- Field label: `Your full name`; placeholder `e.g. Brian Kamau`
- Button: `Continue`
- Validation: `Enter your name.` (under 2 characters); `Keep it under 60 characters.`
- Save error: `Couldn't save your name. Try again.`

## Numeric fields (Fira Code)
None.

## Data
- `PATCH /api/v1/users/me` `{ displayName }` (exists, 2–60 chars).
- No socket events.

## Accessibility and mobile
`TextCapitalization.words`, `AutofillHints.name`; keyboard action submits; safe areas.

## Questions
- None new. Whether ops must match `displayName` to the ID name is part of RQ-14 (verification process).
