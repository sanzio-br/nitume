# v-payment-methods — Payment methods

- Mockup: `docs/design/nitume_customer_app.html` lines 519–527 (`#v-payment-methods`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none (`profile_screen.dart` placeholder is unreachable)
- Status: missing

## Purpose
Show and manage the customer's payment methods (default M-Pesa number; card in the mockup).

## Entry / exit
- Entry: "Payment methods" on `v-profile`.
- Back → `v-profile`.
- "+ Add payment method" → add form (not drawn; implied view `x-payment-method-form`).

## Task states
None.

## Layout (top to bottom)
1. Pushed header (C-10) `Payment methods`.
2. List of payment method cards (C-30): white, r 12, padding 14 15, margin `0 20 10`, gap 12.
   - Badge 38×26 r 5, white 10/700 text: green fill for M-Pesa, blue fill for Visa. Mockup badge text uses Fira Code — it is a brand word, not numeric → Fira Sans (Q2).
   - Label 13.5/600; detail Fira Code 11 slate-600.
   - "Default" tag (C-05 info small) right-aligned.
3. Outline button (C-03), margin `0 20 20`.

## Components
C-10, C-30, C-05, C-03, C-33.

## Copy (exact)
- Header: `Payment methods`
- M-Pesa card: badge `M-PESA`, label `M-Pesa`, detail `+254 712 ••• 678`, tag `Default`
- Card: badge `VISA`, label `Visa •••• 4471`, detail `Expires 09/28`
- Button: `+ Add payment method`

Implied states: empty `No payment methods yet.`; loading skeletons; error + retry.

## Numeric fields (Fira Code)
- Masked phone `+254 712 ••• 678`, card digits `•••• 4471`, expiry `09/28`.

## Data
- `GET /api/v1/customers/me/payment-methods` (exists) → core `PaymentMethod` (`type: mpesa | card | bank`, `label`, `detail`, `isDefault`).
- `POST`, `PATCH /:id`, `DELETE /:id` (exist). `payment_methods` is not in the ERD diagram.

## Accessibility and mobile
- Green M-Pesa badge with white text is compliant (white on green). Is green here "decorative"? It is a brand badge, not a primary action (Q3).

## Questions for owner
- Q1 (payments / security / third-party): The system design only describes M-Pesa (STK push, B2C) and says no card credentials touch Nitume servers. The mockup shows a Visa card and the API enum allows `card` and `bank`. Is card payment in MVP scope, and through which provider? Recommended: M-Pesa only at MVP; hide card/bank.
- Q2: Badge text font — Fira Sans (brand word) instead of mockup Fira Code.
- Q3: Green fill for the M-Pesa badge is a decorative use of green under the design-system rule. Recommended: allow as payment-brand identifier, or use blue-050 with blue text.
- Q4: Add-payment-method form is not drawn. For M-Pesa: phone number entry + OTP? Recommended: phone number field only; whether to verify the number (e.g. by a test STK push) is a payments decision for the owner.

## Current vs design
Not built. Profile row `Payment methods` has a TODO (`profile_tab.dart:80`).
