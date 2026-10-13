# Screen Map

Written only by `design-auditor`. Maps every mockup view to its real implementation.
View ids come from the `data-view` / `id="v-…"` / `data-p` / `page-…` attributes in the mockup HTML. The id scan may have missed modals, sheets and drawers; the auditor adds them.

## Real paths (confirmed by design-auditor, 2026-10-07)

| What | Path |
|---|---|
| Mockups + design system | `docs/design/` (`nitume_customer_app.html`, `nitume_runner_app.html`, `nitume_admin_dashboard.html`, `nitume_website.html`, `nitume_design_system.html`) |
| System design | `docs/design/Nitume_System_Design.md` (the only copy; canonical per owner row 70, 2026-10-09). The duplicate at `docs/Nitume_System_Design.md` had no content of its own (its §3.3 was the pre-row-56 version) and was removed on `docs/owner-answers-3`. Any reference to `Nitume_System_Design.md` without a folder means this file |
| Business plan | `docs/Nitume_Business_Plan.docx` |
| Specs | `docs/specs/<surface>/<view-id>.md`; customer shared conventions in `docs/specs/customer/_shared.md` |
| Audits | `docs/audits/<surface>-gap-report.md` |
| Customer app | `apps/customer_app/lib/src/` |
| Shared Flutter package | `packages/nitume_core/lib/src/` (theme, tokens, models, API client on `main`; shared widgets C-01..C-34 + data layer on `feat/core-customer-widgets`, not merged) |
| API | `apps/api/src/` |
| Admin dashboard (Angular) | `apps/admin/src/app/` (shell `features/admin/admin-dashboard.component.ts`, panels `features/admin/panels/`, drawers `features/admin/drawers/`, shared components `shared/`, global styles `src/styles.scss` + `src/styles/_ops.scss`) |
| Runner specs | `docs/specs/runner/<view-id>.md`; shared conventions, components (C-xx reused, R-n new), RA-n / RQ-n in `docs/specs/runner/_shared.md` and `docs/audits/runner-gap-report.md` |
| Runner app | `apps/runner_app/lib/src/` (scaffolded on `feat/runner-scaffold` @ `4294245`, not on `main` yet) |
| Admin specs | `docs/specs/admin/<view-id>.md`; shared conventions, component inventory (A-n) and open questions (AQ-n) in `docs/specs/admin/_shared.md` |

Status values: `missing` · `partial` · `built` · `matches-design` (only after an audited PASS). Runner rows: `specced — app not built` for views the scaffold does not contain; views on `feat/runner-scaffold` use the normal values.

## Customer app — `docs/design/nitume_customer_app.html` → `apps/customer_app`

**Re-audit 2026-10-09** of `feat/customer-integrations` @ `ca6f614` (addendum in `docs/audits/customer-reaudit-2026-10-07.md`): 11 of the 12 audited screens PASS; v-new-details FAIL (`partial`). Round 2 @ `7192a77`: v-new-details PASS; x-address-form, v-task-detail and the suspension flow re-checked, no regression. All customer screens `matches-design`. Implementation paths below are on `feat/customer-integrations`.

**Re-audit 2026-10-09, customer round 4** of `feat/customer-owner-answers` @ `c420265` (addendum "Re-audit 2026-10-09: customer round 4" in `docs/audits/customer-gap-report.md`): x-awaiting-quote, x-merchant-payment, x-report-problem, v-notifications, v-track, v-payment, v-new-details and the row 59 setup PASS (4 minors, no blockers); other screens spot-checked, no regression. All customer screens `matches-design`. The rows that changed in round 4 point at `feat/customer-owner-answers`, which depends on `feat/api-owner-answers-4`.

**Owner answers round 5 (rows 95–102, applied 2026-10-12 on `docs/owner-answers-5`)**: v-task-detail set to `partial` (row 102: trigger-specific refund lines for paid EXPIRED/FAILED tasks; needs core-ui `RefundTrigger` values). Rows 95, 100, 101 change no customer UI. Builder lists: addendum "Owner answers round 5" at the end of `docs/audits/customer-gap-report.md`.

**Re-audit 2026-10-12, customer round 5** of `feat/customer-owner-answers-5` (core `ad44dc6`, app `5cbd081`; depends on `feat/api-owner-answers-5`): v-task-detail PASS (rows 100, 102), no findings; other refund and payment screens spot-checked, no regression. All customer screens `matches-design`.

**Owner answers round 3 (rows 59–94, applied 2026-10-09 on `docs/owner-answers-3`)**: x-awaiting-quote (rows 68, 72, 83) and x-merchant-payment (row 80) set to `partial` until re-audited; the other customer specs changed wording only. Builder lists: addendum "Owner answers round 3" at the end of `docs/audits/customer-gap-report.md`. The customer app is on `main` since `d5a94f2`.

Pre-build baseline: `docs/audits/customer-gap-report.md`. Post-build re-audit 2026-10-07 of `feat/customer-screens` @ `4312f49`: `docs/audits/customer-reaudit-2026-10-07.md` — round 1: 24 PASS, 3 FAIL (v-price-auth, x-awaiting-quote, x-address-form); round 2 @ `ba45633`: those 3 PASS; round 3 spot-check @ `08f9b26` (2026-10-08): 14 changed screens PASS, CC-1..CC-3 closed. All 27 were `matches-design` after round 3. **Owner answers round 2 (2026-10-08)** changed ten specs; those screens are `partial` until re-audited against the updated spec (addendum at the end of `docs/audits/customer-gap-report.md`). Implementation paths below exist on `feat/customer-screens` only (not yet on `main`).

| View id | Purpose | Spec | Implementation file | Status |
|---------|---------|------|---------------------|--------|
| v-auth-phone | Phone entry | `docs/specs/customer/v-auth-phone.md` | `apps/customer_app/lib/src/screens/auth/phone_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| v-auth-otp | OTP verify (OA-17 policy) | `docs/specs/customer/v-auth-otp.md` | `apps/customer_app/lib/src/screens/auth/otp_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| v-home | Home | `docs/specs/customer/v-home.md` | `apps/customer_app/lib/src/screens/shell/home_tab.dart` (branch `feat/customer-integrations`) | matches-design |
| v-new-category | New task: category (5 MVP tiles) | `docs/specs/customer/v-new-category.md` | `apps/customer_app/lib/src/screens/wizard/category_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| v-new-details | New task: details | `docs/specs/customer/v-new-details.md` | `apps/customer_app/lib/src/screens/wizard/details_screen.dart` (branch `feat/customer-owner-answers`) | matches-design |
| v-new-review | New task: estimate + submit (OA-3) | `docs/specs/customer/v-new-review.md` | `apps/customer_app/lib/src/screens/wizard/review_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| v-price-auth | Price-change authorization (modal, OA-8) | `docs/specs/customer/v-price-auth.md` | `apps/customer_app/lib/src/screens/checkout/price_change_dialog.dart` (branch `feat/customer-integrations`) | matches-design |
| v-payment | Payment (M-Pesa STK) | `docs/specs/customer/v-payment.md` | `apps/customer_app/lib/src/screens/checkout/payment_screen.dart` (branch `feat/customer-owner-answers`) | matches-design |
| v-payment-methods | Payment methods (M-Pesa only, OA-10) | `docs/specs/customer/v-payment-methods.md` | `apps/customer_app/lib/src/screens/account/payment_methods_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| v-track | Live tracking | `docs/specs/customer/v-track.md` | `apps/customer_app/lib/src/screens/shell/track_tab.dart` (branch `feat/customer-owner-answers`) | matches-design |
| v-task-detail | Task detail + timeline | `docs/specs/customer/v-task-detail.md` | `apps/customer_app/lib/src/screens/task/task_detail_screen.dart` (+ `widgets/task_widgets.dart` `RefundGroup`) (branch `feat/customer-owner-answers-5`) | matches-design |
| v-evidence-confirm | Evidence review + confirm completion | `docs/specs/customer/v-evidence-confirm.md` | `apps/customer_app/lib/src/screens/task/evidence_confirm_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| v-rate | Rate runner | `docs/specs/customer/v-rate.md` | `apps/customer_app/lib/src/screens/task/rate_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| v-history | History | `docs/specs/customer/v-history.md` | `apps/customer_app/lib/src/screens/shell/history_tab.dart` (branch `feat/customer-integrations`) | matches-design |
| v-notifications | Notifications | `docs/specs/customer/v-notifications.md` | `apps/customer_app/lib/src/screens/account/notifications_screen.dart` (branch `feat/customer-owner-answers`) | matches-design |
| v-addresses | Saved addresses | `docs/specs/customer/v-addresses.md` | `apps/customer_app/lib/src/screens/account/addresses_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| v-profile | Profile | `docs/specs/customer/v-profile.md` | `apps/customer_app/lib/src/screens/shell/profile_tab.dart` (branch `feat/customer-integrations`) | matches-design |
| shell | Bottom tab bar (5 tabs) shared by root views | `docs/specs/customer/_shared.md` (C-13, §1) | `apps/customer_app/lib/src/screens/shell/home_shell.dart` (branch `feat/customer-integrations`) | matches-design |

Modals: the mockup draws none. Owner answer OA-8 makes `v-price-auth` a blocking modal; short confirmations (log out, delete, discard, reject and cancel) use the shared dialog C-35. All are specced inside the views that open them. `v-new-tab-placeholder` is an empty dead div, not a view.

Screens not drawn in the mockup. Specced 2026-10-07 from design-system patterns and owner answers; copy marked "(proposed)" in each spec:

| Id (auditor-assigned) | Purpose | Referenced from | Spec | Implementation file | Status |
|---|---|---|---|---|---|
| x-name-capture | Display name after first sign-in (OA-2) | `v-auth-otp` | `docs/specs/customer/x-name-capture.md` | `apps/customer_app/lib/src/screens/auth/name_capture_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| x-awaiting-quote | Waiting for quote (REQUESTED) + accept quote / checkout (QUOTED) (OA-3, OA-5) | `v-new-review`, `v-home`, `v-task-detail` | `docs/specs/customer/x-awaiting-quote.md` | `apps/customer_app/lib/src/screens/checkout/awaiting_quote_screen.dart` (branch `feat/customer-owner-answers`) | matches-design |
| x-merchant-payment | Item amount: merchant Till/Paybill (merchant-direct) or STK to Nitume for the runner's purchase (row 42) | §6 payments sequence, `v-track`, `v-price-auth` | `docs/specs/customer/x-merchant-payment.md` | `apps/customer_app/lib/src/screens/checkout/merchant_payment_screen.dart` (branch `feat/customer-owner-answers`) | matches-design |
| x-report-problem | Report a problem / dispute (write + read) | `v-task-detail`, `v-evidence-confirm`, §3.2 `POST /disputes` | `docs/specs/customer/x-report-problem.md` | `apps/customer_app/lib/src/screens/task/report_problem_screen.dart` (branch `feat/customer-owner-answers`) | matches-design |
| x-evidence-viewer | Full-screen photo/video viewer | `v-evidence-confirm`, `v-task-detail` thumbs | `docs/specs/customer/x-evidence-viewer.md` | `apps/customer_app/lib/src/widgets/evidence.dart` (`openEvidenceViewer`) + core `EvidenceViewer` (branch `feat/customer-integrations`) | matches-design |
| x-address-form | Add / edit saved address | `v-addresses` | `docs/specs/customer/x-address-form.md` | `apps/customer_app/lib/src/screens/account/address_form_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| x-payment-method-form | Add / edit M-Pesa number (no cards, OA-10) | `v-payment-methods` | `docs/specs/customer/x-payment-method-form.md` | `apps/customer_app/lib/src/screens/account/payment_method_form_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| x-support | Support row → one configurable external target (OA-18) | `v-profile`, `v-auth-otp` | `docs/specs/customer/x-support.md` | `apps/customer_app/lib/src/screens/shell/profile_tab.dart` (Support row) + `screens/auth/otp_screen.dart` (branch `feat/customer-integrations`) | matches-design |
| x-legal | Terms & Privacy Policy links (external) | `v-auth-phone` legal line | `docs/specs/customer/x-legal.md` | `apps/customer_app/lib/src/screens/auth/phone_screen.dart` (`_LegalLine`) (branch `feat/customer-integrations`) | matches-design |

Dropped: `x-recurring-tasks` (Recurring tasks, `v-profile` row) is **out of MVP** (owner answer OA-18, BOARD row 19). No spec; the Profile row is removed. Re-add here if the owner brings it back into scope.

Unmapped implementation files: `apps/customer_app/lib/src/screens/tasks_screen.dart` (placeholder, no mockup view, unreachable).

## Runner app — `docs/design/nitume_runner_app.html` → `apps/runner_app`

**Specced 2026-10-13** (design-auditor, `docs/owner-answers-6-runner-specs`): all 16 mockup views, the shell and 3 undrawn screens. `apps/runner_app` is scaffolded on `feat/runner-scaffold` (shell + auth audited PASS 2026-10-13, `docs/audits/runner-gap-report.md` §7); the other views are not built. Shared conventions, components (C-xx reused, R-01 … R-22 new) and the runner state labels: `docs/specs/runner/_shared.md`. Baseline gap report with API gaps RA-1 … RA-20 and owner questions RQ-1 … RQ-21: `docs/audits/runner-gap-report.md`.

| View id | Purpose | Spec | Implementation file | Status |
|---------|---------|------|---------------------|--------|
| v-auth-phone | Phone entry (sign in / apply) | `docs/specs/runner/v-auth-phone.md` | `apps/runner_app/lib/src/screens/auth/phone_screen.dart` (+ `auth_frame.dart`, `widgets/runner_wordmark.dart`; branch `feat/runner-scaffold`) | matches-design (audit 2026-10-13 PASS; minors m-2, m-3 wait on core-ui) |
| v-auth-otp | OTP verify, role check, routing | `docs/specs/runner/v-auth-otp.md` | `apps/runner_app/lib/src/screens/auth/otp_screen.dart` + `services/session.dart` (branch `feat/runner-scaffold`) | matches-design (audit 2026-10-13 PASS; D-1 onboarding routing deferred to the onboarding build) |
| v-onboard-id | ID verification, step 1 of 2 | `docs/specs/runner/v-onboard-id.md` | — (app not built) | specced — app not built |
| v-onboard-selfie | Selfie check, step 2 of 2 | `docs/specs/runner/v-onboard-selfie.md` | — (app not built) | specced — app not built |
| v-onboard-pending | Verification status (also Profile → Verification documents) | `docs/specs/runner/v-onboard-pending.md` | — (app not built) | specced — app not built |
| v-jobs | Nearby jobs / offers + availability | `docs/specs/runner/v-jobs.md` | — (app not built) | specced — app not built |
| v-job-detail | Job offer detail (purchase limit, row 108) | `docs/specs/runner/v-job-detail.md` | — (app not built) | specced — app not built |
| v-active | Active job: navigation, runner transitions, checklist | `docs/specs/runner/v-active.md` | — (app not built) | specced — app not built |
| v-evidence-capture | Evidence capture (photos, receipts) | `docs/specs/runner/v-evidence-capture.md` | — (app not built) | specced — app not built |
| v-price-request | Price-change request (IN_PROGRESS, Buy/Get It For Me) | `docs/specs/runner/v-price-request.md` | — (app not built) | specced — app not built |
| v-job-summary | Job complete: runner fee + reimbursement | `docs/specs/runner/v-job-summary.md` | — (app not built) | specced — app not built |
| v-earnings | Earnings (payout-ledger view) | `docs/specs/runner/v-earnings.md` | — (app not built) | specced — app not built |
| v-payout | Request payout | `docs/specs/runner/v-payout.md` | — (app not built) | specced — app not built |
| v-notifications | Notifications | `docs/specs/runner/v-notifications.md` | — (app not built) | specced — app not built |
| v-profile | Profile | `docs/specs/runner/v-profile.md` | — (app not built) | specced — app not built |
| v-edit-skills | Edit skills & service areas | `docs/specs/runner/v-edit-skills.md` | — (app not built) | specced — app not built |
| shell | Bottom tab bar (4 tabs: Jobs, Active, Earnings, Profile) | `docs/specs/runner/_shared.md` §1 (C-13) | `apps/runner_app/lib/src/screens/shell/runner_shell.dart` + `app.dart`, `services/shell_controller.dart` (branch `feat/runner-scaffold`) | matches-design (audit 2026-10-13 PASS; tab bodies are placeholders, audited with each view) |

Modals: the mockup draws none. Confirmations (decline offer, can't complete, mark complete, send price change, payout, log out, discard) use C-35 and are specced inside the views that open them.

Screens not drawn in the mockup (copy "(proposed)" in each spec):

| Id (auditor-assigned) | Purpose | Referenced from | Spec | Implementation file | Status |
|---|---|---|---|---|---|
| x-name-capture | Runner display name after first sign-in (OA-2) | `v-auth-otp` | `docs/specs/runner/x-name-capture.md` | `apps/runner_app/lib/src/screens/auth/name_capture_screen.dart` (branch `feat/runner-scaffold`) | matches-design (audit 2026-10-13 PASS) |
| x-payout-history | Full payout ledger (row 107) | `v-earnings` `Payout history` | `docs/specs/runner/x-payout-history.md` | — | specced — app not built |
| x-location-disclosure | Location disclosure before the OS prompt (§7.2) | `v-jobs` switch, first offer accept | `docs/specs/runner/x-location-disclosure.md` | — | specced — app not built |
| x-support, x-legal | External Support / Terms links | `v-profile`, `v-auth-phone` | reuse `docs/specs/customer/x-support.md`, `x-legal.md` with runner `AppConfig` URIs | — | specced — app not built |

## Admin dashboard — `docs/design/nitume_admin_dashboard.html` → `apps/admin`

Marked completed by the owner (parity audit only). The panels and drawers below have not been audited yet; implementation files recorded 2026-10-08 for reference.

**Owner answers round 5 (rows 95–102, applied 2026-10-12 on `docs/owner-answers-5`)**: p-refunds and drawer-refund set to `partial` (row 100 payout corrections/reversals, row 102 `Task expired` / `Task failed`). Row 96 adds the 12-hour EAT rule (`docs/specs/admin/_shared.md` §3.1); one known deviation in `live-map.panel.ts:148-151` (p-map, unaudited). Builder lists: addendum "Owner answers round 5" at the end of `docs/audits/admin-gap-report.md`. **Re-audit round 5 (2026-10-12)** of `fix/angular-admin-owner-answers-5` @ `053fbc6` (176 tests, build clean; API round-5 fields optional with `TODO(owner-answers-5)` until `feat/api-owner-answers-5` merges): p-refunds, drawer-refund, drawer-task-requote (m-8 closed) and the app-wide §3.1 EAT work PASS; minors m-10 … m-12; addendum "Re-audit round 5" in `docs/audits/admin-gap-report.md`. The `live-map.panel.ts` EAT deviation is fixed on that branch (`311c989`); p-map itself stays unaudited.

| View id | Purpose | Implementation file | Status |
|---------|---------|---------------------|--------|
| p-map | Live ops map | `apps/admin/src/app/features/admin/panels/live-map.panel.ts` | unaudited |
| p-queue | Task queue / assignment | `apps/admin/src/app/features/admin/panels/task-queue.panel.ts` | unaudited |
| p-runners | Runners + verification | `apps/admin/src/app/features/admin/panels/runners.panel.ts`, `verifications.panel.ts` | unaudited |
| p-disputes | Disputes | `apps/admin/src/app/features/admin/panels/disputes.panel.ts` | unaudited |
| p-reports | Reports | `apps/admin/src/app/features/admin/panels/reports.panel.ts` | unaudited |
| drawer-task | Task drawer | `apps/admin/src/app/features/admin/drawers/task-drawer.ts` | built (ops bug fixes PASS, `docs/audits/admin-reaudit-2026-10-09.md`; mockup `Payment` card not built, full parity audit pending) |
| drawer-runner | Runner profile drawer | `apps/admin/src/app/features/admin/drawers/runner-drawer.ts` | unaudited |
| drawer-dispute | Dispute drawer | `apps/admin/src/app/features/admin/drawers/dispute-drawer.ts` | built (Resolution/outcome PASS, `docs/audits/admin-reaudit-2026-10-09.md`; `Evidence on file` parity audit pending) |

Ops features not drawn in the mockup (API on `feat/api-owner-answers-2`; specced 2026-10-08 on `docs/admin-ops-spec`; they extend the panels/drawers above, copy "(proposed)"). **Owner answers round 3 (2026-10-09)** changed four of them back to `partial` until re-audited; builder lists in the "Owner answers round 3" addendum of `docs/audits/admin-gap-report.md`. **Re-audit round 4 (2026-10-09)** of `fix/angular-admin-owner-answers` @ `f1323de`: addendum "re-audit round 4" in the same report:

| Id (auditor-assigned) | Purpose | Placed in | Spec | Implementation file | Status |
|---|---|---|---|---|---|
| p-refunds | Refund reviews list (`GET /refunds`), status filter, nav item + badge | new `Payments` nav group between Network and Insights (row 77) | `docs/specs/admin/p-refunds.md` | `apps/admin/src/app/features/admin/panels/refunds.panel.ts` (+ `refund-labels.ts`) (branch `fix/angular-admin-owner-answers-5`) | matches-design (re-audit round 5 PASS, 2026-10-12) |
| drawer-refund | Decide refund amount (`PATCH /refunds/:id/decision`), record manual M-Pesa payout (`POST /refunds/:id/mark-paid`) | new drawer kind in the shell drawer | `docs/specs/admin/drawer-refund.md` | `apps/admin/src/app/features/admin/drawers/refund-drawer.ts` (+ `refund-correction.ts`, `refund-correction-card.ts`, `refund-link.section.ts`, `refund-labels.ts`) (branch `fix/angular-admin-owner-answers-5`) | partial (round 5 PASS and round-6 item 4 PASS on `fix/angular-admin-owner-answers-6` @ `817d5fc`; minors m-10, m-11; row 136 combined-cap amendment 2026-10-13 not built yet; API built on `dbc3a76`) |
| drawer-task-merchant-details | Merchant Till/Paybill details (`PUT /errands/:id/merchant-details`) | section of `drawer-task` | `docs/specs/admin/drawer-task-merchant-details.md` | `apps/admin/src/app/features/admin/drawers/merchant-details.section.ts` (branch `fix/angular-admin-owner-answers`) | matches-design (re-audit round 4 PASS; m-9 closed) |
| drawer-task-requote | Quote section + re-quote of an expired QUOTED or ACCEPTED task (`POST /errands/:id/quote`) | section/action of `drawer-task` | `docs/specs/admin/drawer-task-requote.md` | `apps/admin/src/app/features/admin/drawers/quote.section.ts`, `quote-dialog.ts` (+ `admin-data.service.ts` quote requests) (branch `fix/angular-admin-owner-answers-5`) | matches-design (re-audit round 5 PASS: m-8 closed, `Valid until` sent as UTC) |
| drawer-dispute-outcome | Verdict copy and outcome: runner → COMPLETED, customer → CANCELLED + refund review | Resolution section of `drawer-dispute` | `docs/specs/admin/drawer-dispute-outcome.md` | `apps/admin/src/app/features/admin/drawers/dispute-drawer.ts` (on `main`) | matches-design (re-audit round 4 PASS; round 5 minor m-12, hint typography) |
| p-runner-payouts | Runner payout ledger (`GET /runner-payouts`), review queue, batch M-Pesa payout per runner (`POST /runner-payouts/mark-paid`) (row 112) | `Payments` nav group, after `Refunds` | `docs/specs/admin/p-runner-payouts.md` | — | missing (specced 2026-10-13; API built on `feat/api-owner-answers-6`) |
| drawer-runner-payout | One ledger line: approve (capped) / reject item reimbursements, hold, single payout, correction / reversal / re-send, combined-cap override; task drawer `Runner payouts` section (SA-3) | new drawer kind | `docs/specs/admin/drawer-runner-payout.md` | — | missing (specced 2026-10-13; API built incl. row-136 exposure override on `dbc3a76`; row 145 pending) |
| p-payout-requests | Runner payout requests: pay with whole lines or reject (row 117) | `Payments` nav group, after `Runner payouts` | `docs/specs/admin/p-payout-requests.md` | — | missing (specced 2026-10-13; API missing N-17; row 146 pending) |
| drawer-runner-purchase-limit | Per-runner `max_purchase_advance` edit with audit history (row 138) | section of `drawer-runner` | `docs/specs/admin/drawer-runner-purchase-limit.md` | — | missing (specced 2026-10-13; API missing N-19) |

## Website — `docs/design/nitume_website.html` → `apps/website`

| View id | Purpose | Implementation file | Status |
|---------|---------|---------------------|--------|
| page-home | Home | | unaudited |
| page-runner | Become a runner | | unaudited |
| page-business | Business | | unaudited |
| page-diaspora | Diaspora | | unaudited |
| page-auth | Sign in / sign up | | unaudited |
