# x-legal — Terms & Privacy Policy

- Mockup: **not drawn.** Referenced by the legal line on `v-auth-phone` ("Terms & Privacy Policy"). No in-app screen is designed; the website mockup has no legal pages either.
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/auth/phone_screen.dart` (`_LegalLine`) on branch `feat/customer-screens`
- Status: matches-design

## Purpose
Let a user read the Terms of Service and Privacy Policy before signing in.

## Entry / exit
- Entry: tap "Terms" or "Privacy Policy" in the legal line on `v-auth-phone`.
- Behaviour: open the configured URL outside the app's navigation stack (system browser or in-app browser tab via `url_launcher`, `LaunchMode.externalApplication` default). Returning to the app shows `v-auth-phone` unchanged.
- No Nitume-drawn screen, header or layout.

## Task states
None (pre-auth).

## Layout
None (external page). The link spans themselves are specified in `v-auth-phone.md`.

## Components
| Element | Component | Status |
|---|---|---|
| Link spans | C-04 link | built |
| URL opening | `url_launcher` | **NEW package, needs owner approval (SQ-2)** |
| Config | `AppConfig.termsUri`, `AppConfig.privacyUri` (from `--dart-define=NITUME_TERMS_URL` / `NITUME_PRIVACY_URL`) | **NEW** (core-ui) |

## Copy
- Link texts come from the mockup legal line: `Terms`, `Privacy Policy`.
- Open failure (proposed): snackbar `Couldn't open the page. Try again later.`
- When a URI is not configured or `url_launcher` is not approved: render the legal line as plain text (no link styling) so nothing looks tappable that does nothing.

## Numeric fields (Fira Code)
None.

## Data
- No API. Values come from build-time config.

## Accessibility and mobile
- Each link span announced as a link ("Terms, link"), 48dp hit area.

## Open questions for the owner
- Q1 (unresolved since the first audit): the Terms and Privacy Policy URLs, and whether those pages should live on the Nitume website (`apps/website` has no legal page in its mockup).
- SQ-2: approve `url_launcher`.

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Plain text while no opener/URLs (SQ-2 fallback). Minor: no widget test for the legal line.
