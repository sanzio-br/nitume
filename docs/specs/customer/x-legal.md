# x-legal — Terms & Privacy Policy

- Mockup: **not drawn.** Referenced by the legal line on `v-auth-phone` ("Terms & Privacy Policy"). No in-app screen is designed; the website mockup has no legal pages either.
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/screens/auth/phone_screen.dart` (`_LegalLine`) on branch `feat/customer-integrations`
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
| URL opening | `url_launcher` | approved (row 39); **NEW** dependency (flutter-customer, or core-ui behind a `LinkOpener` interface) |
| Config | `AppConfig.termsUri`, `AppConfig.privacyUri` (from `--dart-define=NITUME_TERMS_URL` / `NITUME_PRIVACY_URL`) | built (core-ui) |

## Copy
- Link texts come from the mockup legal line: `Terms`, `Privacy Policy`.
- Open failure (proposed): snackbar `Couldn't open the page. Try again later.`
- When a URI is not configured: render that part of the legal line as plain text (no link styling) so nothing looks tappable that does nothing.

## Numeric fields (Fira Code)
None.

## Data
- No API. Values come from build-time config.

## Accessibility and mobile
- Each link span announced as a link ("Terms, link"), 48dp hit area.

## Open questions for the owner
- Q1 (unresolved since the first audit): the Terms and Privacy Policy URLs, and whether those pages should live on the Nitume website (`apps/website` has no legal page in its mockup). Row 173 (owner 2026-10-16, runner privacy link, same `NITUME_PRIVACY_URL` key) settles the interim behaviour: no placeholder URL; the link appears once the real published URL is configured. The customer behaviour above (plain text when not configured) already matches; the URLs themselves are still to be published.

## Current vs design
Re-audit 2026-10-09 against `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): PASS. Configured links are C-04 link buttons (48 dp) opened with `url_launcher` (external application); unconfigured links are plain text.

Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Plain text while no opener/URLs (SQ-2 fallback). Minor: no widget test for the legal line.

Spec update 2026-10-08 (row 39): the build has no link opener and always shows plain text. Now required: open `AppConfig.termsLink` / `privacyLink` with `url_launcher` (`LaunchMode.externalApplication`) when configured, the open-failure snackbar, and 48dp hit areas (see `v-auth-phone`). The URL values (Q1) are still needed per environment. Status set to `partial`.
