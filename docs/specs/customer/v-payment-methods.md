# v-payment-methods — Payment methods (M-Pesa only)

- Mockup: `docs/design/nitume_customer_app.html` lines 519–527 (`#v-payment-methods`, overlay)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: none (`profile_screen.dart` placeholder is unreachable)
- Status: missing

## Purpose
Show and manage the customer's M-Pesa numbers used for STK pushes. **Cards are out of MVP** (OA-10): the mockup's Visa card is not built.

## Entry / exit
- Entry (manage mode): "Payment methods" on `v-profile`.
- Entry (select mode): "Change" on the checkout "Pay with" card (`x-awaiting-quote`). Header title stays the same; tapping a card returns that method and pops.
- Back → previous screen.
- Manage mode card tap → `x-payment-method-form` (edit).
- "+ Add payment method" → `x-payment-method-form` (add).

## Task states
None.

## Layout (top to bottom)
1. Pushed header (C-10) `Payment methods`.
2. List of payment method cards (C-30): white, r-m 14 (mockup 12), padding 14 15, margin `0 20 10`, gap 12.
   - Badge 38×26 r 5, green fill, white 10/700 `M-PESA` (brand word, Fira Sans).
   - Label 13.5/600; detail Fira Code 11 slate-600 (masked number).
   - "Default" tag (C-05 info, small) right-aligned on the default method.
   - Select mode: the currently selected card shows a C-36 checked box on the right instead of the tag position (tag moves before it).
3. Outline button (C-03), margin `0 20 20` (manage mode only).

## Components
C-10, C-30 (M-Pesa badge only), C-05 small info, C-36 (select mode), C-03, C-33.

## Copy
- Header: `Payment methods`
- M-Pesa card (mockup): badge `M-PESA`, label `M-Pesa`, detail `+254 712 ••• 678`, tag `Default`
- Button (mockup): `+ Add payment method`
- **Removed** (OA-10): the Visa card (`VISA`, `Visa •••• 4471`, `Expires 09/28`).

States (proposed):
- Empty: muted 13 slate-600 `No M-Pesa numbers saved. We'll charge your sign-in number, +254 712 ••• 678.` above the add button.
- Loading: two skeleton cards. Error: C-33 `Couldn't load your payment methods.` + `Try again`.
- API returns a non-M-Pesa method (legacy `card` / `bank`): do not render it.

## Numeric fields (Fira Code)
- Masked phone numbers.

## Data
- `GET /api/v1/customers/me/payment-methods` (exists) → core `PaymentMethod`. Filter `type == 'mpesa'`.
- needs: api-contract — reject `card` and `bank` on `POST /customers/me/payment-methods` for MVP (OA-10).
- No socket events.

## Accessibility and mobile
- Card label: "M-Pesa, +254 712 ending 678, default". Select mode: radio semantics.

## Resolved by owner answers
- Card payments out of MVP: OA-10 (was Q1).

## Open questions (non-blocking; build default given)
- Q2: Badge text font. Default: Fira Sans (a brand word, not numeric data).
- Q3: Green fill for the M-Pesa badge (green outside actions/states). Default: keep as the payment-brand identifier, as drawn.

## Current vs design
Not built. Profile row `Payment methods` has a TODO (`profile_tab.dart:80`).
