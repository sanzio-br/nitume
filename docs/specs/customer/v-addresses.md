# v-addresses — Saved addresses

- Mockup: `docs/design/nitume_customer_app.html` lines 508–517 (`#v-addresses`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none (`profile_screen.dart` is an unreachable placeholder mentioning "address & payment-method editing pending")
- Status: missing

## Purpose
Manage the customer's saved places (Home, Office, …) used when creating tasks.

## Entry / exit
- Entry: "Saved addresses" on `v-profile`.
- Back → `v-profile`.
- "+ Add new address" → add-address form (not drawn; implied view `x-address-form`).
- Card tap → edit / set default / delete (not drawn, Q1).

## Task states
None.

## Layout (top to bottom)
1. Pushed header (C-10) `Saved addresses`.
2. Scrollable list of address cards (C-29): white, r 12, padding 14 15, margin `0 20 10`; left: name 13.5/600 + address 11.5 slate-600; right: "Default" tag (blue-050 / blue, 10/700 pill, padding 3 8).
3. Outline button (C-03) pinned below the list, margin `0 20 20`.

## Components
C-10, C-29, C-05 (info, small), C-03, C-33. NEW except C-03 (theme) and C-05 (app-only).

## Copy (exact)
- Header: `Saved addresses`
- Cards: `Home` / `Kilimani Rd, Nairobi` / tag `Default`; `Office` / `Upper Hill, Nairobi`; `Mum's place` / `Nyali, Mombasa`
- Button: `+ Add new address`

Implied states (recommended):
- Empty: `No saved addresses yet.` above the add button.
- Loading: skeleton cards. Error: `Couldn't load your addresses.` + `Try again`.
- Delete confirmation: `Delete "Office"?` with `Delete` / `Cancel` (Q1).

## Numeric fields (Fira Code)
- None (street addresses are text).

## Data
- `GET /api/v1/customers/me/addresses` (exists) → `SavedAddress` (core model exists: `label`, `addressText`, `isDefault`, `lat`, `lon`).
- `POST /customers/me/addresses`, `PATCH /customers/me/addresses/:id`, `POST /customers/me/addresses/:id/default`, `DELETE /customers/me/addresses/:id` (exist). `saved_addresses` is not in the ERD diagram but §3.1 lists saved addresses under `customers/`.
- Add form uses Google Places for lat/lon (§5).

## Accessibility and mobile
- Card label: "Home, Kilimani Rd, Nairobi, default address".

## Questions for owner
- Q1: Edit / delete / set-default interactions and the add-address form are not drawn. Recommended: card tap opens an edit form (label, address via Places, "Set as default" toggle — green when on, delete text button).

## Current vs design
Not built. Profile row `Saved addresses` has a TODO (`profile_tab.dart:74`).
