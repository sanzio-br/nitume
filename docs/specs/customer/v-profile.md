# v-profile — Profile

- Mockup: `docs/design/nitume_customer_app.html` lines 296–305 (`#v-profile`, root tab view)
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/profile_tab.dart` (`profile_screen.dart` is an unused placeholder)
- Status: partial

## Purpose
Account hub: identity summary and links to addresses, payment methods, notifications, recurring tasks, support, log out.

## Entry / exit
- Entry: tab bar "Profile"; avatar on `v-home`.
- Rows:
  - `Saved addresses` → push `v-addresses`
  - `Payment methods` → push `v-payment-methods`
  - `Notifications` → push `v-notifications`
  - `Recurring tasks` → no target in mockup (implied `x-recurring-tasks`, Q2)
  - `Support` → no target in mockup (implied `x-support`, Q3)
  - `Log out` → revoke session, go to `v-auth-phone` (stack reset)

## Task states
None.

## Layout (top to bottom)
1. Top bar (C-09) `Profile`.
2. Profile head, centred, padding `10 20 20`: avatar 70 (C-12, 24/700), name 18/700 (h3, browser default bold), meta Fira Code 12 slate-600 margin-top 4.
3. Menu rows (C-24): white r 12 padding 13 15 margin `0 20 8`, 13.5/500, chevron `›` slate-400. Log out = destructive variant (red text, Q-RED).

## Components
C-09, C-12, C-24, C-33. All NEW.

## Copy (exact)
- Title: `Profile`
- Name: `Achieng Otieno` (Q-NAME)
- Meta: `Customer since Feb 2026 · 42 tasks`
- Rows: `Saved addresses`, `Payment methods`, `Notifications`, `Recurring tasks`, `Support`, `Log out`

Implied states:
- Log out confirm (recommended): `Log out of Nitume?` `Log out` / `Cancel`.
- Log out failure still clears local tokens (core `AuthRepository.logout` already does this).
- Profile load error: show phone number instead of name, rows still usable.

## Numeric fields (Fira Code)
- Meta line: month-year and task count (`Feb 2026`, `42`). Mockup renders the whole line in Fira Code (`.li-meta` rule).

## Data
- `GET /api/v1/users/me` (exists; `phone`, `createdAt` — no name), `GET /api/v1/customers/me` (exists).
- Task count: no count endpoint; `GET /errands` is paginated (needs: api-contract — `GET /customers/me` could include `errandsCount`).
- Log out: `POST /auth/logout` via `AuthRepository.logout` (exists).

## Accessibility and mobile
- Rows 48dp+; chevron is decorative.

## Questions for owner
- Q-NAME.
- Q2 (scope): "Recurring tasks" — §3.1 lists recurring tasks under `customers/`, but the business plan positions them as later-phase / business. Build at MVP? Recommended: hide the row until scoped.
- Q3: "Support" — WhatsApp deep link, phone call, in-app chat, or a web page? Third-party choice (§3).
- Q4: Is there an edit-profile action (name, email)? Not drawn.

## Current vs design
See gap report. Summary: static name/meta; menu rows are a private `_MenuRow`; Log out chevron is red (mockup chevron stays slate-400 inside a red row — `.menu-row .arrow` colour applies); all row taps are TODOs including Log out; `'FiraCode'` family string on the meta line.
