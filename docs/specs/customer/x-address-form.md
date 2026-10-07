# x-address-form — Add or edit a saved address

- Mockup: **not drawn.** Referenced by `v-addresses` "+ Add new address" and card taps. Built from design-system form patterns (field, `.check`, buttons) and the mockup's `.form-card` / `.cta-fixed`; copy is **(proposed)**.
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: none
- Status: missing

## Purpose
Create, edit, set as default, or delete a saved place used as a shortcut in the task wizard.

## Entry / exit
- Entry: `v-addresses` "+ Add new address" (add mode); tap a card (edit mode).
- Back → `v-addresses`; if anything changed, C-35 discard confirm.
- Save → pop to `v-addresses` with snackbar `Saved.`
- Delete → C-35 confirm → pop with snackbar `Deleted.`

## Task states
None.

## Layout (top to bottom)
1. Pushed header (C-10): `Add address` / `Edit address`.
2. Form card (C-17 `NitumeFormCard`, margin `0 20 14`):
   1. Field label `Name`, text field, placeholder `e.g. Home, Office, Mum's place`, max 40. Quick-pick choice chips (C-16) under it: `Home`, `Office` (tap fills the field).
   2. Field label `Address`, Places field (`PlaceAutocompleteField`, no saved-address suggestions here), placeholder `Search for a place`. Inline red errors (OA-13).
3. Checkbox row (margin `0 20 14`): C-36 + 13.5 blue `Set as default`. Edit mode on the current default: checked and disabled, with 12 slate-600 `This is your default address.`
4. Edit mode only: destructive text button (C-04, red per OA-13) `Delete address`, centred.
5. Fixed primary CTA (C-01) `Save address`.

## Components
C-10, C-17, C-16, `PlaceAutocompleteField`, C-36, C-04, C-35, C-01. NEW: C-35, C-36.

## Copy (proposed)
- Headers: `Add address`, `Edit address`
- Labels: `Name`, `Address`, `Set as default`
- Chips: `Home`, `Office`
- CTA: `Save address`
- Delete: `Delete address`; dialog title `Delete "Office"?`, body `You can add it again later.`, buttons `Delete` (outline, red text) / `Keep` (C-01)
- Validation: empty name `Give this place a name.`; no place chosen from the suggestions `Choose an address from the list.`
- Errors: save `Couldn't save the address. Try again.`; Places offline `Couldn't search places. Check your connection.`

## Numeric fields (Fira Code)
None.

## Data
- Create: `POST /api/v1/customers/me/addresses` `{ label, addressText, lat, lon, isDefault }` (exists; `CreateSavedAddressDto`).
- Update: `PATCH /api/v1/customers/me/addresses/:id` (exists). Make default: `POST /api/v1/customers/me/addresses/:id/default` (exists). Delete: `DELETE /api/v1/customers/me/addresses/:id` (exists).
- `lat` / `lon` from Google Place Details (§5): Places client pending row 30. Until approved the address cannot be picked, so Save stays disabled.
- `placeId` is not in `CreateSavedAddressDto`; not sent.

## Accessibility and mobile
- Labels exposed to screen readers; errors announced; CTA above the keyboard.
- Checkbox row one 48dp control.

## Open questions
- Pending row 30 (Places).

## Current vs design
Not built.
