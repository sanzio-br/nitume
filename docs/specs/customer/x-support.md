# x-support — Support entry point

- Mockup: the `Support` menu row on `v-profile` (lines 296–305) has no target. OA-18: "a simple configurable Support entry point rather than separate WhatsApp/phone/chat/web systems". No screen is drawn and none is built: this spec covers the row's behaviour and configuration.
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/shell/profile_tab.dart` (Support row) + `screens/auth/otp_screen.dart` (Contact support) on branch `feat/customer-integrations`
- Status: matches-design

## Purpose
One place for a customer to reach Nitume support, pointing at a single configurable target.

## Entry / exit
- Entry: `Support` row (C-24) on `v-profile`; `Contact support` link in the suspended-account error on `v-auth-otp`.
- Behaviour: open `AppConfig.supportUri` with `url_launcher` (`LaunchMode.externalApplication`). The URI scheme decides what opens: `https:` (web page or `https://wa.me/…` WhatsApp), `tel:` (phone dialler), `mailto:` (email). The app does not branch on the type.
- Return: the user comes back to `v-profile` unchanged.

## Task states
None. (Task-specific problems go through `x-report-problem`, not here.)

## Layout
No screen. The row itself: C-24, label `Support`, slate-400 chevron, standard (not destructive).

## Components
| Element | Component | Status |
|---|---|---|
| Row | C-24 `MenuRow` | built |
| Config | `AppConfig.supportUri` from `--dart-define=NITUME_SUPPORT_URI` | built (core-ui) |
| Launcher | `url_launcher` | approved (row 39); **NEW** dependency (flutter-customer, or core-ui behind a `LinkOpener` interface) |

## Copy
- Row (mockup): `Support`
- Open failure (proposed): snackbar `Couldn't open support. Try again later.`
- Not configured: **hide the row** (and the link on `v-auth-otp`).

## Numeric fields (Fira Code)
None.

## Data
- No API. Build-time config (a remote-config source can replace it later without UI changes).

## Accessibility and mobile
- Row announced as "Support, opens outside the app".

## Open questions for the owner
- Q1: The support target value (URL, WhatsApp number or phone number) for each environment.

## Current vs design
Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Row and OTP `Contact support` link open the configured URI externally; hidden when unconfigured.

Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Row hidden while not configured / no opener (SQ-2 fallback).

Spec update 2026-10-08 (row 39): the build hides the row because there is no opener. Now required: open `AppConfig.supportLink` with `url_launcher` when configured (row shown), with the open-failure snackbar. The target value per environment (Q1) is still needed. Status set to `partial`.
