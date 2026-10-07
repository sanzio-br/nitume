# v-addresses — Saved addresses

- Mockup: `docs/design/nitume_customer_app.html` lines 508–517 (`#v-addresses`, overlay)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: none (`profile_screen.dart` is an unreachable placeholder)
- Status: missing

## Purpose
Manage the customer's saved places (Home, Office, …) offered as shortcuts when creating tasks.

## Entry / exit
- Entry: "Saved addresses" on `v-profile`.
- Back → `v-profile`.
- "+ Add new address" → push `x-address-form` (add).
- Card tap → push `x-address-form` (edit: label, address, default, delete).

## Task states
None.

## Layout (top to bottom)
1. Pushed header (C-10) `Saved addresses`.
2. Scrollable list of address cards (C-29): white, r-m 14 (mockup 12), padding 14 15, margin `0 20 10`; left: name 13.5/600 + address 11.5 slate-600; right: "Default" tag (chip-info small: blue-050 / blue, 10/700 pill, padding 3 8).
3. Outline button (C-03), margin `0 20 20`, under the list.

## Components
C-10, C-29, C-05 (info, small), C-03, C-33. All built.

## Copy (exact)
- Header: `Saved addresses`
- Cards: `Home` / `Kilimani Rd, Nairobi` / tag `Default`; `Office` / `Upper Hill, Nairobi`; `Mum's place` / `Nyali, Mombasa`
- Button: `+ Add new address`

States (proposed):
- Empty: 13 slate-600 `No saved addresses yet.` above the add button.
- Loading: skeleton cards. Error: `Couldn't load your addresses.` + `Try again`.
- Returning from the form: list refreshed; snackbar from the form (`Saved.` / `Deleted.`).

## Numeric fields (Fira Code)
- None (street addresses are text).

## Data
- `GET /api/v1/customers/me/addresses` (exists) → core `SavedAddress`.
- Writes happen in `x-address-form`.

## Accessibility and mobile
- Card label: "Home, Kilimani Rd, Nairobi, default address. Edit."

## Resolved
- Edit / delete / set-default and the add form (was Q1): specced in `x-address-form.md`.

## Current vs design
Not built. Profile row `Saved addresses` has a TODO (`profile_tab.dart:74`).
