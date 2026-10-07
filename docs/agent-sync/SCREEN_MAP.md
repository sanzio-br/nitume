# Screen Map

Written only by `design-auditor`. Maps every mockup view to its real implementation.
View ids come from the `data-view` / `id="v-…"` / `data-p` / `page-…` attributes in the mockup HTML. The id scan may have missed modals, sheets and drawers; the auditor adds them.

Real paths (auditor: confirm and correct): mockups in `docs/design/`.

Status values: `missing` · `partial` · `built` · `matches-design` (only after an audited PASS)

## Customer app — `docs/design/nitume_customer_app.html` → `apps/customer_app`

| View id | Purpose | Implementation file | Status |
|---------|---------|---------------------|--------|
| v-auth-phone | Phone entry | | unaudited |
| v-auth-otp | OTP verify | | unaudited |
| v-home | Home | | unaudited |
| v-new-category | New errand: category | | unaudited |
| v-new-details | New errand: details | | unaudited |
| v-new-review | New errand: review | | unaudited |
| v-price-auth | Price-change authorization | | unaudited |
| v-payment | Payment (M-Pesa) | | unaudited |
| v-payment-methods | Payment methods | | unaudited |
| v-track | Live tracking | | unaudited |
| v-task-detail | Task detail + timeline | | unaudited |
| v-evidence-confirm | Evidence confirmation | | unaudited |
| v-rate | Rate runner | | unaudited |
| v-history | History | | unaudited |
| v-notifications | Notifications | | unaudited |
| v-addresses | Saved addresses | | unaudited |
| v-profile | Profile | | unaudited |

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
