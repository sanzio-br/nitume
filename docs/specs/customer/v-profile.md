# v-profile — Profile

- Mockup: `docs/design/nitume_customer_app.html` lines 296–305 (`#v-profile`, root tab view)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/shell/profile_tab.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Account hub: identity summary and links to addresses, payment methods, notifications, support, and log out.

## Entry / exit
- Entry: tab bar "Profile"; avatar on `v-home`.
- Rows:
  - `Saved addresses` → push `v-addresses`
  - `Payment methods` → push `v-payment-methods`
  - `Notifications` → push `v-notifications`
  - `Support` → `x-support` (opens `AppConfig.supportUri` with `url_launcher`, row 39; row hidden when not configured)
  - `Log out` → C-35 confirm → revoke session → reset to `v-auth-phone`
- **Removed**: `Recurring tasks` (OA-18, out of MVP).

## Task states
None.

## Layout (top to bottom)
1. Top bar (C-09) `Profile`.
2. Profile head, centred, padding `10 20 20`: avatar 70 (C-12, 24/700, initials from `displayName`), name 18/700, meta Fira Code 12 slate-600 margin-top 4.
3. Menu rows (C-24): white, r-m 14 (mockup 12), padding 13 15, margin `0 20 8`, 13.5/500, chevron `›` slate-400. Log out = destructive variant: **red text** (OA-13), chevron stays slate-400.

## Components
C-09, C-12, C-24 (destructive red change), C-35, C-33. NEW: C-35.

## Copy (exact)
- Title: `Profile`
- Name: `Achieng Otieno` (full `displayName`, OA-2)
- Meta: `Customer since Feb 2026 · 42 tasks`
- Rows: `Saved addresses`, `Payment methods`, `Notifications`, `Support`, `Log out`

States (proposed):
- Log out dialog: title `Log out of Nitume?`, buttons `Log out` (outline, red text) / `Cancel` (C-01).
- Log out: first `DELETE /users/me/devices/:id` for this device's push token (row 31, best effort), then revoke the session. Failure of either still clears local tokens (`AuthRepository.logout` already does) and the stored device id.
- Profile load error: avatar shows the person glyph, name and meta lines hidden, 12.5 slate-600 line `Couldn't load your profile.` with a C-04 `Try again` link; rows stay usable.
- Count unavailable: meta shows `Customer since Feb 2026` only.

## Numeric fields (Fira Code)
- Meta line (whole line, `.li-meta` rule): month-year and task count.

## Data
- `GET /api/v1/users/me` (`displayName` needs: api-contract, OA-2; `createdAt`, `phone`), `GET /api/v1/customers/me`.
- Task count: `GET /api/v1/errands/count` (exists on `feat/api-customer-gaps`).
- Log out: `POST /auth/logout` via `AuthRepository.logout`; `DELETE /users/me/devices/:id` (exists on `feat/api-customer-gaps`).
- Support target: `x-support.md`.

## Accessibility and mobile
- Rows ≥ 48dp; chevron decorative.

## Resolved by owner answers
- Name: OA-2 (was Q-NAME).
- Recurring tasks: removed, OA-18 (was Q2).
- Support: one configurable entry point, OA-18 (was Q3).
- Red destructive row: OA-13.

## Open questions (non-blocking; build default given)
- Q4: Edit-profile action (name, email)? Not drawn. Default: none (see `x-name-capture.md` Q1).

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS.
