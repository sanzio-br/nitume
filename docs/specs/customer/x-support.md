# x-support — Support entry point

- Mockup: the `Support` menu row on `v-profile` (lines 296–305) has no target. OA-18: "a simple configurable Support entry point rather than separate WhatsApp/phone/chat/web systems". No screen is drawn and none is built: this spec covers the row's behaviour and configuration.
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: none (`profile_tab.dart` row is a TODO)
- Status: missing

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
| Config | `AppConfig.supportUri` from `--dart-define=NITUME_SUPPORT_URI` | **NEW** (core-ui) |
| Launcher | `url_launcher` | **NEW package, needs owner approval (SQ-2)** |

## Copy
- Row (mockup): `Support`
- Open failure (proposed): snackbar `Couldn't open support. Try again later.`
- Not configured, or `url_launcher` not approved: **hide the row** (and the link on `v-auth-otp`).

## Numeric fields (Fira Code)
None.

## Data
- No API. Build-time config (a remote-config source can replace it later without UI changes).

## Accessibility and mobile
- Row announced as "Support, opens outside the app".

## Open questions for the owner
- Q1: The support target value (URL, WhatsApp number or phone number) for each environment.
- SQ-2: approve `url_launcher`.

## Current vs design
`profile_tab.dart` shows the row with a TODO handler.
