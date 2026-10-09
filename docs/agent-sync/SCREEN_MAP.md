# Screen Map

Written only by `design-auditor`. Maps every mockup view to its real implementation.
View ids come from the `data-view` / `id="v-…"` / `data-p` / `page-…` attributes in the mockup HTML. The id scan may have missed modals, sheets and drawers; the auditor adds them.

## Real paths (confirmed by design-auditor, 2026-10-07)

| What | Path |
|---|---|
| Mockups + design system | `docs/design/` (`nitume_customer_app.html`, `nitume_runner_app.html`, `nitume_admin_dashboard.html`, `nitume_website.html`, `nitume_design_system.html`) |
| System design | `docs/design/Nitume_System_Design.md`. §3.3 updated 2026-10-08 (owner row 56) on `docs/customer-answers-2`; the copy at `docs/Nitume_System_Design.md` was not updated there and is stale for §3.3 until synced |
| Business plan | `docs/Nitume_Business_Plan.docx` |
| Specs | `docs/specs/<surface>/<view-id>.md`; customer shared conventions in `docs/specs/customer/_shared.md` |
| Audits | `docs/audits/<surface>-gap-report.md` |
| Customer app | `apps/customer_app/lib/src/` |
| Shared Flutter package | `packages/nitume_core/lib/src/` (theme, tokens, models, API client on `main`; shared widgets C-01..C-34 + data layer on `feat/core-customer-widgets`, not merged) |
| API | `apps/api/src/` |

Status values: `missing` · `partial` · `built` · `matches-design` (only after an audited PASS)

## Customer app — `docs/design/nitume_customer_app.html` → `apps/customer_app`

Pre-build baseline: `docs/audits/customer-gap-report.md`. Post-build re-audit 2026-10-07 of `feat/customer-screens` @ `4312f49`: `docs/audits/customer-reaudit-2026-10-07.md` — round 1: 24 PASS, 3 FAIL (v-price-auth, x-awaiting-quote, x-address-form); round 2 @ `ba45633`: those 3 PASS; round 3 spot-check @ `08f9b26` (2026-10-08): 14 changed screens PASS, CC-1..CC-3 closed. All 27 were `matches-design` after round 3. **Owner answers round 2 (2026-10-08)** changed ten specs; those screens are `partial` until re-audited against the updated spec (addendum at the end of `docs/audits/customer-gap-report.md`). Implementation paths below exist on `feat/customer-screens` only (not yet on `main`).

| View id | Purpose | Spec | Implementation file | Status |
|---------|---------|------|---------------------|--------|
| v-auth-phone | Phone entry | `docs/specs/customer/v-auth-phone.md` | `apps/customer_app/lib/src/screens/auth/phone_screen.dart` (branch `feat/customer-screens`) | matches-design |
| v-auth-otp | OTP verify (OA-17 policy) | `docs/specs/customer/v-auth-otp.md` | `apps/customer_app/lib/src/screens/auth/otp_screen.dart` (branch `feat/customer-screens`) | matches-design |
| v-home | Home | `docs/specs/customer/v-home.md` | `apps/customer_app/lib/src/screens/shell/home_tab.dart` (branch `feat/customer-screens`) | matches-design |
| v-new-category | New task: category (5 MVP tiles) | `docs/specs/customer/v-new-category.md` | `apps/customer_app/lib/src/screens/wizard/category_screen.dart` (branch `feat/customer-screens`) | matches-design |
| v-new-details | New task: details | `docs/specs/customer/v-new-details.md` | `apps/customer_app/lib/src/screens/wizard/details_screen.dart` (branch `feat/customer-screens`) | partial |
| v-new-review | New task: estimate + submit (OA-3) | `docs/specs/customer/v-new-review.md` | `apps/customer_app/lib/src/screens/wizard/review_screen.dart` (branch `feat/customer-screens`) | partial |
| v-price-auth | Price-change authorization (modal, OA-8) | `docs/specs/customer/v-price-auth.md` | `apps/customer_app/lib/src/screens/checkout/price_change_dialog.dart` (branch `feat/customer-screens`) | partial |
| v-payment | Payment (M-Pesa STK) | `docs/specs/customer/v-payment.md` | `apps/customer_app/lib/src/screens/checkout/payment_screen.dart` (branch `feat/customer-screens`) | matches-design |
| v-payment-methods | Payment methods (M-Pesa only, OA-10) | `docs/specs/customer/v-payment-methods.md` | `apps/customer_app/lib/src/screens/account/payment_methods_screen.dart` (branch `feat/customer-screens`) | matches-design |
| v-track | Live tracking | `docs/specs/customer/v-track.md` | `apps/customer_app/lib/src/screens/shell/track_tab.dart` (branch `feat/customer-screens`) | partial |
| v-task-detail | Task detail + timeline | `docs/specs/customer/v-task-detail.md` | `apps/customer_app/lib/src/screens/task/task_detail_screen.dart` (branch `feat/customer-screens`) | partial |
| v-evidence-confirm | Evidence review + confirm completion | `docs/specs/customer/v-evidence-confirm.md` | `apps/customer_app/lib/src/screens/task/evidence_confirm_screen.dart` (branch `feat/customer-screens`) | partial |
| v-rate | Rate runner | `docs/specs/customer/v-rate.md` | `apps/customer_app/lib/src/screens/task/rate_screen.dart` (branch `feat/customer-screens`) | matches-design |
| v-history | History | `docs/specs/customer/v-history.md` | `apps/customer_app/lib/src/screens/shell/history_tab.dart` (branch `feat/customer-screens`) | matches-design |
| v-notifications | Notifications | `docs/specs/customer/v-notifications.md` | `apps/customer_app/lib/src/screens/account/notifications_screen.dart` (branch `feat/customer-screens`) | matches-design |
| v-addresses | Saved addresses | `docs/specs/customer/v-addresses.md` | `apps/customer_app/lib/src/screens/account/addresses_screen.dart` (branch `feat/customer-screens`) | matches-design |
| v-profile | Profile | `docs/specs/customer/v-profile.md` | `apps/customer_app/lib/src/screens/shell/profile_tab.dart` (branch `feat/customer-screens`) | matches-design |
| shell | Bottom tab bar (5 tabs) shared by root views | `docs/specs/customer/_shared.md` (C-13, §1) | `apps/customer_app/lib/src/screens/shell/home_shell.dart` (branch `feat/customer-screens`) | matches-design |

Modals: the mockup draws none. Owner answer OA-8 makes `v-price-auth` a blocking modal; short confirmations (log out, delete, discard, reject and cancel) use the shared dialog C-35. All are specced inside the views that open them. `v-new-tab-placeholder` is an empty dead div, not a view.

Screens not drawn in the mockup. Specced 2026-10-07 from design-system patterns and owner answers; copy marked "(proposed)" in each spec:

| Id (auditor-assigned) | Purpose | Referenced from | Spec | Implementation file | Status |
|---|---|---|---|---|---|
| x-name-capture | Display name after first sign-in (OA-2) | `v-auth-otp` | `docs/specs/customer/x-name-capture.md` | `apps/customer_app/lib/src/screens/auth/name_capture_screen.dart` (branch `feat/customer-screens`) | matches-design |
| x-awaiting-quote | Waiting for quote (REQUESTED) + accept quote / checkout (QUOTED) (OA-3, OA-5) | `v-new-review`, `v-home`, `v-task-detail` | `docs/specs/customer/x-awaiting-quote.md` | `apps/customer_app/lib/src/screens/checkout/awaiting_quote_screen.dart` (branch `feat/customer-screens`) | partial |
| x-merchant-payment | Item amount: merchant Till/Paybill (merchant-direct) or STK to Nitume for the runner's purchase (row 42) | §6 payments sequence, `v-track`, `v-price-auth` | `docs/specs/customer/x-merchant-payment.md` | `apps/customer_app/lib/src/screens/checkout/merchant_payment_screen.dart` (branch `feat/customer-screens`) | partial |
| x-report-problem | Report a problem / dispute (write + read) | `v-task-detail`, `v-evidence-confirm`, §3.2 `POST /disputes` | `docs/specs/customer/x-report-problem.md` | `apps/customer_app/lib/src/screens/task/report_problem_screen.dart` (branch `feat/customer-screens`) | matches-design |
| x-evidence-viewer | Full-screen photo/video viewer | `v-evidence-confirm`, `v-task-detail` thumbs | `docs/specs/customer/x-evidence-viewer.md` | `apps/customer_app/lib/src/widgets/evidence.dart` (`openEvidenceViewer`) + core `EvidenceViewer` (branch `feat/customer-screens`) | matches-design |
| x-address-form | Add / edit saved address | `v-addresses` | `docs/specs/customer/x-address-form.md` | `apps/customer_app/lib/src/screens/account/address_form_screen.dart` (branch `feat/customer-screens`) | matches-design |
| x-payment-method-form | Add / edit M-Pesa number (no cards, OA-10) | `v-payment-methods` | `docs/specs/customer/x-payment-method-form.md` | `apps/customer_app/lib/src/screens/account/payment_method_form_screen.dart` (branch `feat/customer-screens`) | matches-design |
| x-support | Support row → one configurable external target (OA-18) | `v-profile`, `v-auth-otp` | `docs/specs/customer/x-support.md` | `apps/customer_app/lib/src/screens/shell/profile_tab.dart` (Support row) + `screens/auth/otp_screen.dart` (branch `feat/customer-screens`) | partial |
| x-legal | Terms & Privacy Policy links (external) | `v-auth-phone` legal line | `docs/specs/customer/x-legal.md` | `apps/customer_app/lib/src/screens/auth/phone_screen.dart` (`_LegalLine`) (branch `feat/customer-screens`) | partial |

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
