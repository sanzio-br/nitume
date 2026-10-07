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
| Shared Flutter package | `packages/nitume_core/lib/src/` (theme, tokens, models, API client; **no shared widgets yet**) |
| API | `apps/api/src/` |

Status values: `missing` · `partial` · `built` · `matches-design` (only after an audited PASS)

## Customer app — `docs/design/nitume_customer_app.html` → `apps/customer_app`

Audited 2026-10-07 (pre-build baseline). Gap report: `docs/audits/customer-gap-report.md`. No customer screen has passed a post-build audit, so none is `matches-design`.

| View id | Purpose | Spec | Implementation file | Status |
|---------|---------|------|---------------------|--------|
| v-auth-phone | Phone entry | `docs/specs/customer/v-auth-phone.md` | `apps/customer_app/lib/src/screens/auth/otp_login_screen.dart` (phone step) | partial |
| v-auth-otp | OTP verify | `docs/specs/customer/v-auth-otp.md` | `apps/customer_app/lib/src/screens/auth/otp_login_screen.dart` (code step, same widget) | partial |
| v-home | Home | `docs/specs/customer/v-home.md` | `apps/customer_app/lib/src/screens/home_tab.dart` (in `home_shell.dart`) | partial |
| v-new-category | New errand: category | `docs/specs/customer/v-new-category.md` | `apps/customer_app/lib/src/screens/new_task_tab.dart` (built as a root tab) | partial |
| v-new-details | New errand: details | `docs/specs/customer/v-new-details.md` | — | missing |
| v-new-review | New errand: review | `docs/specs/customer/v-new-review.md` | — | missing |
| v-price-auth | Price-change authorization | `docs/specs/customer/v-price-auth.md` | — | missing |
| v-payment | Payment (M-Pesa) | `docs/specs/customer/v-payment.md` | — | missing |
| v-payment-methods | Payment methods | `docs/specs/customer/v-payment-methods.md` | — (`screens/profile_screen.dart` is an unreachable placeholder) | missing |
| v-track | Live tracking | `docs/specs/customer/v-track.md` | `apps/customer_app/lib/src/screens/track_tab.dart` | partial |
| v-task-detail | Task detail + timeline | `docs/specs/customer/v-task-detail.md` | — | missing |
| v-evidence-confirm | Evidence confirmation | `docs/specs/customer/v-evidence-confirm.md` | — | missing |
| v-rate | Rate runner | `docs/specs/customer/v-rate.md` | — | missing |
| v-history | History | `docs/specs/customer/v-history.md` | `apps/customer_app/lib/src/screens/history_tab.dart` | partial |
| v-notifications | Notifications | `docs/specs/customer/v-notifications.md` | — (`screens/notifications_screen.dart` is an unreachable placeholder) | missing |
| v-addresses | Saved addresses | `docs/specs/customer/v-addresses.md` | — | missing |
| v-profile | Profile | `docs/specs/customer/v-profile.md` | `apps/customer_app/lib/src/screens/profile_tab.dart` | partial |
| shell | Bottom tab bar (5 tabs) shared by root views | `docs/specs/customer/_shared.md` (C-13) | `apps/customer_app/lib/src/screens/home_shell.dart` | partial |

Modals / sheets / drawers: **none exist in the mockup** (only `.view` root views and `.overlay` pushed screens). `v-new-tab-placeholder` is an empty dead div, not a view. §4.4 of the system design calls the price-change authorization a "blocking modal"; it is covered by `v-price-auth` (presentation question in its spec).

Implied views — referenced by mockup copy or the system design but **not drawn**. No spec until the owner supplies design/copy:

| Id (auditor-assigned) | Purpose | Referenced from | Implementation file | Status |
|---|---|---|---|---|
| x-awaiting-quote | Waiting for quote (REQUESTED → QUOTED) | §3.3 state machine vs `v-new-review` | — | missing |
| x-merchant-payment | Merchant Till/Paybill for merchant_direct flow | §6 payments sequence | — | missing |
| x-report-problem | Report a problem / dispute (reason, photos, status) | `v-task-detail` row "Report a problem with this task", §3.2 `POST /disputes` | — | missing |
| x-evidence-viewer | Full-screen photo/video viewer | `v-evidence-confirm`, `v-task-detail` thumbs | — | missing |
| x-address-form | Add / edit saved address | `v-addresses` "+ Add new address" | — | missing |
| x-payment-method-form | Add payment method | `v-payment-methods` "+ Add payment method" | — | missing |
| x-recurring-tasks | Recurring tasks | `v-profile` row | — | missing |
| x-support | Support | `v-profile` row | — | missing |
| x-legal | Terms & Privacy Policy | `v-auth-phone` legal line | — | missing |

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
