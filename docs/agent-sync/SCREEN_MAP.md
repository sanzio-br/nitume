# Screen Map

Written only by `design-auditor`. Maps every mockup view to its real implementation.
View ids come from the `data-view` / `id="v-…"` / `data-p` / `page-…` attributes in the mockup HTML. The id scan may have missed modals, sheets and drawers; the auditor adds them.

## Real paths (confirmed by design-auditor, 2026-10-07)

| What | Path |
|---|---|
| Mockups + design system | `docs/design/` (`nitume_customer_app.html`, `nitume_runner_app.html`, `nitume_admin_dashboard.html`, `nitume_website.html`, `nitume_design_system.html`) |
| System design | `docs/design/Nitume_System_Design.md` (identical copy at `docs/Nitume_System_Design.md`) |
| Business plan | `docs/Nitume_Business_Plan.docx` |
| Specs | `docs/specs/<surface>/<view-id>.md`; customer shared conventions in `docs/specs/customer/_shared.md` |
| Audits | `docs/audits/<surface>-gap-report.md` |
| Customer app | `apps/customer_app/lib/src/` |
| Shared Flutter package | `packages/nitume_core/lib/src/` (theme, tokens, models, API client on `main`; shared widgets C-01..C-34 + data layer on `feat/core-customer-widgets`, not merged) |
| API | `apps/api/src/` |

Status values: `missing` · `partial` · `built` · `matches-design` (only after an audited PASS)

## Customer app — `docs/design/nitume_customer_app.html` → `apps/customer_app`

Audited 2026-10-07 (pre-build baseline). Gap report: `docs/audits/customer-gap-report.md`. Specs updated 2026-10-07 with owner answers 1–21 (`OA-n` in `docs/specs/customer/_shared.md` §0). No customer screen has passed a post-build audit, so none is `matches-design`.

| View id | Purpose | Spec | Implementation file | Status |
|---------|---------|------|---------------------|--------|
| v-auth-phone | Phone entry | `docs/specs/customer/v-auth-phone.md` | `apps/customer_app/lib/src/screens/auth/otp_login_screen.dart` (phone step) | partial |
| v-auth-otp | OTP verify (OA-17 policy) | `docs/specs/customer/v-auth-otp.md` | `apps/customer_app/lib/src/screens/auth/otp_login_screen.dart` (code step, same widget) | partial |
| v-home | Home | `docs/specs/customer/v-home.md` | `apps/customer_app/lib/src/screens/home_tab.dart` (in `home_shell.dart`) | partial |
| v-new-category | New task: category (5 MVP tiles) | `docs/specs/customer/v-new-category.md` | `apps/customer_app/lib/src/screens/new_task_tab.dart` (built as a root tab) | partial |
| v-new-details | New task: details | `docs/specs/customer/v-new-details.md` | — | missing |
| v-new-review | New task: estimate + submit (OA-3) | `docs/specs/customer/v-new-review.md` | — | missing |
| v-price-auth | Price-change authorization (modal, OA-8) | `docs/specs/customer/v-price-auth.md` | — | missing |
| v-payment | Payment (M-Pesa STK) | `docs/specs/customer/v-payment.md` | — | missing |
| v-payment-methods | Payment methods (M-Pesa only, OA-10) | `docs/specs/customer/v-payment-methods.md` | — (`screens/profile_screen.dart` is an unreachable placeholder) | missing |
| v-track | Live tracking | `docs/specs/customer/v-track.md` | `apps/customer_app/lib/src/screens/track_tab.dart` | partial |
| v-task-detail | Task detail + timeline | `docs/specs/customer/v-task-detail.md` | — | missing |
| v-evidence-confirm | Evidence review + confirm completion | `docs/specs/customer/v-evidence-confirm.md` | — | missing |
| v-rate | Rate runner | `docs/specs/customer/v-rate.md` | — | missing |
| v-history | History | `docs/specs/customer/v-history.md` | `apps/customer_app/lib/src/screens/history_tab.dart` | partial |
| v-notifications | Notifications | `docs/specs/customer/v-notifications.md` | — (`screens/notifications_screen.dart` is an unreachable placeholder) | missing |
| v-addresses | Saved addresses | `docs/specs/customer/v-addresses.md` | — | missing |
| v-profile | Profile | `docs/specs/customer/v-profile.md` | `apps/customer_app/lib/src/screens/profile_tab.dart` | partial |
| shell | Bottom tab bar (5 tabs) shared by root views | `docs/specs/customer/_shared.md` (C-13, §1) | `apps/customer_app/lib/src/screens/home_shell.dart` | partial |

Modals: the mockup draws none. Owner answer OA-8 makes `v-price-auth` a blocking modal; short confirmations (log out, delete, discard, reject and cancel) use the shared dialog C-35. All are specced inside the views that open them. `v-new-tab-placeholder` is an empty dead div, not a view.

Screens not drawn in the mockup. Specced 2026-10-07 from design-system patterns and owner answers; copy marked "(proposed)" in each spec:

| Id (auditor-assigned) | Purpose | Referenced from | Spec | Implementation file | Status |
|---|---|---|---|---|---|
| x-name-capture | Display name after first sign-in (OA-2) | `v-auth-otp` | `docs/specs/customer/x-name-capture.md` | — | missing |
| x-awaiting-quote | Waiting for quote (REQUESTED) + accept quote / checkout (QUOTED) (OA-3, OA-5) | `v-new-review`, `v-home`, `v-task-detail` | `docs/specs/customer/x-awaiting-quote.md` | — | missing |
| x-merchant-payment | Item amount: merchant Till/Paybill (merchant-direct) or send-to-runner (blocked on SQ-5) | §6 payments sequence, `v-track`, `v-price-auth` | `docs/specs/customer/x-merchant-payment.md` | — | missing |
| x-report-problem | Report a problem / dispute (write + read) | `v-task-detail`, `v-evidence-confirm`, §3.2 `POST /disputes` | `docs/specs/customer/x-report-problem.md` | — | missing |
| x-evidence-viewer | Full-screen photo/video viewer | `v-evidence-confirm`, `v-task-detail` thumbs | `docs/specs/customer/x-evidence-viewer.md` | — (core `EvidenceViewer` on `feat/core-customer-widgets`) | missing |
| x-address-form | Add / edit saved address | `v-addresses` | `docs/specs/customer/x-address-form.md` | — | missing |
| x-payment-method-form | Add / edit M-Pesa number (no cards, OA-10) | `v-payment-methods` | `docs/specs/customer/x-payment-method-form.md` | — | missing |
| x-support | Support row → one configurable external target (OA-18) | `v-profile`, `v-auth-otp` | `docs/specs/customer/x-support.md` | — (row exists in `profile_tab.dart`, TODO handler) | missing |
| x-legal | Terms & Privacy Policy links (external) | `v-auth-phone` legal line | `docs/specs/customer/x-legal.md` | — | missing |

Dropped: `x-recurring-tasks` (Recurring tasks, `v-profile` row) is **out of MVP** (owner answer OA-18, BOARD row 19). No spec; the Profile row is removed. Re-add here if the owner brings it back into scope.

Unmapped implementation files: `apps/customer_app/lib/src/screens/tasks_screen.dart` (placeholder, no mockup view, unreachable).

## Runner app — `docs/design/nitume_runner_app.html` → `apps/runner_app`

| View id | Purpose | Implementation file | Status |
|---------|---------|---------------------|--------|
| v-auth-phone | Phone entry | | unaudited |
| v-auth-otp | OTP verify | | unaudited |
| v-onboard-id | ID upload | | unaudited |
| v-onboard-selfie | Selfie verification | | unaudited |
| v-onboard-pending | Verification pending | | unaudited |
| v-jobs | Nearby jobs / offers | | unaudited |
| v-job-detail | Job detail | | unaudited |
| v-active | Active job | | unaudited |
| v-evidence-capture | Evidence capture | | unaudited |
| v-price-request | Price-change request | | unaudited |
| v-job-summary | Job summary | | unaudited |
| v-earnings | Earnings | | unaudited |
| v-payout | Payout | | unaudited |
| v-notifications | Notifications | | unaudited |
| v-profile | Profile | | unaudited |
| v-edit-skills | Edit skills | | unaudited |

## Admin dashboard — `docs/design/nitume_admin_dashboard.html` → `apps/admin`

| View id | Purpose | Implementation file | Status |
|---------|---------|---------------------|--------|
| p-map | Live ops map | | unaudited |
| p-queue | Task queue / assignment | | unaudited |
| p-runners | Runners + verification | | unaudited |
| p-disputes | Disputes | | unaudited |
| p-reports | Reports | | unaudited |

## Website — `docs/design/nitume_website.html` → `apps/website`

| View id | Purpose | Implementation file | Status |
|---------|---------|---------------------|--------|
| page-home | Home | | unaudited |
| page-runner | Become a runner | | unaudited |
| page-business | Business | | unaudited |
| page-diaspora | Diaspora | | unaudited |
| page-auth | Sign in / sign up | | unaudited |
