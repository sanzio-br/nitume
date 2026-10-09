# x-payment-method-form — Add or edit an M-Pesa number

- Mockup: **not drawn.** Referenced by `v-payment-methods` "+ Add payment method". M-Pesa only (OA-10: no cards). Built from design-system form patterns and the `.form-card` / `.cta-fixed` mockup components; copy is **(proposed)**.
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/account/payment_method_form_screen.dart` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Save an M-Pesa number that STK pushes can be sent to, optionally as the default; edit or delete an existing one.

## Entry / exit
- Entry: "+ Add payment method" (add mode); tap a card on `v-payment-methods` in manage mode (edit mode).
- Back → `v-payment-methods` without saving (if the form changed, C-35 discard confirm).
- Save success → pop to `v-payment-methods` (list refreshed) with snackbar `Saved.`
- Delete success → pop with snackbar `Removed.`

## Task states
None.

## Layout (top to bottom)
1. Pushed header (C-10): `Add M-Pesa number` (add) / `Edit M-Pesa number` (edit).
2. Form card (C-17 `NitumeFormCard`, margin `0 20 14`):
   1. Field label `M-Pesa number`, phone field (C-17 phone variant), placeholder `+254 7XX XXX XXX`, Fira Code input. Inline red error below.
   2. Field label `Name on this number (optional)`, text field, placeholder `e.g. My Safaricom line`, max 40 → stored as `label`.
3. Row (margin `0 20 14`): C-36 checkbox + 13.5 blue `Use as my default`. Hidden in edit mode when this is already the default (show a C-05 info small tag `Default` instead).
4. Edit mode only: destructive text button (C-04, red per OA-13) `Remove this number`, centred.
5. Fixed primary CTA (C-01) `Save`.

## Components
C-10, C-17 (phone, text), C-36, C-05, C-04, C-35, C-01. NEW: C-35, C-36.

## Copy (proposed)
- Headers: `Add M-Pesa number`, `Edit M-Pesa number`
- Labels: `M-Pesa number`, `Name on this number (optional)`, `Use as my default`
- CTA: `Save`
- Remove: `Remove this number`; dialog title `Remove this number?`, body `You can add it again later.`, buttons `Remove` (outline, red text) / `Keep` (C-01)
- Discard dialog (back with changes): title `Discard your changes?`, buttons `Discard` (outline, red text) / `Keep editing` (C-01) (builder copy, accepted in the 2026-10-07 re-audit).
- Remove error (proposed, re-audit): `Couldn't remove this number. Try again.`
- Errors: invalid number `Enter a valid Kenyan number, e.g. +254 712 345 678`; duplicate (409) `This number is already saved.`; save error `Couldn't save. Try again.`; removing the default when others exist: allowed, the API picks or clears the default (show whatever the list returns).

## Numeric fields (Fira Code)
- Phone number input and placeholder.

## Data
- Add: `POST /api/v1/customers/me/payment-methods` `{ type: 'mpesa', label, detail, phoneNumber, isDefault }` (exists, `apps/api/src/customers/dto/payment-method.dto.ts`). `label` is required by the API: send the optional name, or `M-Pesa` when empty. `detail` = masked display string `+254 712 ••• 678`; `phoneNumber` = normalized `+2547XXXXXXXX`.
- Note: `UpdatePaymentMethodDto` has no `phoneNumber`, so editing the number itself is not supported by the API. Edit mode shows the number read-only (Fira Code, slate-600) and edits only the name and default; to change the number, remove and add again.
- Edit: `PATCH /api/v1/customers/me/payment-methods/:id`. Delete: `DELETE /api/v1/customers/me/payment-methods/:id` (exist).
- Number normalized with `KenyanPhone.normalize`.
- No verification of the number (e.g. test STK push) at MVP: open Q1.

## Accessibility and mobile
- Phone keyboard; "done" saves. CTA above the keyboard.
- Checkbox row is one tappable control (48dp) with checkbox semantics.

## Open questions for the owner
- Q1 (payments / security): should a new M-Pesa number be verified before use (OTP or a KSh 1 STK test)? Default: no verification; the STK PIN prompt on that phone is the check.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: remove failure reuses `Couldn't save. Try again.` Builder copy `Discard your changes?` accepted (see Copy).
