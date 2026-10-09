# Admin ops dashboard: shared conventions for the 2026-10-08 ops features

- Surface: `apps/admin` (Angular 22, standalone components, signals). Read-only reference for this spec: branch `docs/customer-answers-2`.
- Mockup: `docs/design/nitume_admin_dashboard.html`. **None of the features in this spec set are drawn in the mockup.** Each spec places them into the panels and drawers the mockup does draw (`#p-queue`, `#p-disputes`, `#drawer-task`, `#drawer-dispute`) and marks every place it goes beyond the mockup with **EXTENDS MOCKUP**. Copy is **(proposed)** unless marked **(mockup)**.
- Design system: `docs/design/nitume_design_system.html` wins on styling; the mockup wins on content and flow where it says anything.
- API source: branch `feat/api-owner-answers-2` (`apps/api/src/payments/refunds.*`, `errands.controller.ts`, `matching.controller.ts`, `errands.service.ts`). Paths below are relative to `/api/v1`.
- Specs in this set: `p-refunds.md`, `drawer-refund.md`, `drawer-task-merchant-details.md`, `drawer-task-requote.md`, `drawer-dispute-outcome.md`.

## 1. Owner decisions these specs implement

| BOARD row | Decision (quoted or summarised from BOARD.md) | Used in |
|---|---|---|
| 34 | Fee components are internal; customer-facing shows "Total (service + runner fee)" until pricing rates exist | drawer-refund, drawer-task-requote |
| 36 | Dispute: runner-favourable → COMPLETED; customer-favourable → CANCELLED | drawer-dispute-outcome |
| 37 | Cancel after payment goes to an admin refund review; admin sets the refund amount, up to a full refund | p-refunds, drawer-refund |
| 42 | send-to-runner is platform-mediated: the customer pays Nitume, never the runner directly | drawer-refund (what was paid to Nitume) |
| 43 | Merchant/admin owns and supplies the Till/Paybill details; the customer only selects the route | drawer-task-merchant-details |
| 46 | Expired quotes cannot be accepted (`quote_expired`); a fresh quote is required | drawer-task-requote |
| 48 | A price **decrease** opens an admin refund review for the difference | p-refunds (trigger list; not yet in the API, see §7) |
| 50 | Dispute window restarts after a dispute resolves to COMPLETED where applicable | drawer-dispute-outcome |
| 54 | Refund payout recorded manually for MVP; customer sees refund status; B2C/reversal later | drawer-refund |
| 56 | §3.3 updated: DISPUTED → COMPLETED / CANCELLED (admin, with written rationale) | drawer-dispute-outcome |

Still open on the BOARD and relevant here: row 62 (schema approval for `refund_reviews`), row 68 / SQ-9 (how a fresh quote is requested), row 69 / SQ-10 (customer sees the admin refund note? default no).

## 2. Access

- Every endpoint in this set is `@Roles(UserRole.ADMIN)` (refunds controller at class level; `PUT /errands/:id/merchant-details`, `POST /errands/:id/quote`, `PATCH /errands/:id/resolve-dispute` per route). `GET /errands/:errandId/refund` allows customer and admin.
- The admin app already gates the whole dashboard with `authGuard` + `adminOnlyGuard` (`apps/admin/src/app/app.routes.ts`) and sends `x-nitume-acting-role: admin` on every call. No new guard is needed and no screen in this set has a non-admin variant.
- A 401 is handled by the existing auth interceptor (refresh, then `/login`). A 403 on any call in this set shows the inline error notice (A-11) `You don't have access to this. Sign in with an ops admin account.` and leaves the form disabled.
- No client-side role tiers (e.g. "Ops Lead only") are implemented; see question AQ-1.

## 3. Money and the three payment flows

- Display format: `KSh 1,250` for whole shillings, `KSh 1,250.50` when there are cents. Thousands separator `,` (en-KE). Never round a refund or paid amount: refunds are stored with 2 decimals and an admin must see the exact figure they are approving. The existing `formatKsh` (`features/admin/shared-format.ts`) rounds to whole shillings, so it is **not** usable for refund amounts: needs `formatKshExact` (A-13). `—` for null.
- The mockup writes `KSh` everywhere (`.drawer-row b`, `.rep-stat-row b`); the API's customer notification body writes `KES` (`refundCopy` in `notifications.service.ts`). Admin UI uses `KSh`. See question AQ-6.
- Every amount, count, id, receipt, Till/Paybill/account number, phone number and timestamp is Fira Code (`.num` / `b` inside `.drawer-row`). Labels next to them are Fira Sans.
- Money inputs: `<input type="text" inputmode="decimal">` in a `.field-input` with Fira Code value text, a static `KSh` prefix label in Fira Sans 13 slate-600 inside the field's left padding. Accept digits and one `.`, max 2 decimals; strip `,` and spaces before sending; send a JSON **number** (the DTOs use `@IsNumber`).
- The three flows stay separate in every label:
  - **Service + runner fee**: one STK charge to Nitume (row 34 hides the split from the customer; the admin may see components where the API gives them).
  - **Item amount, paid to Nitume** (`send_to_runner`, row 42): part of the STK charge to Nitume; the runner is reimbursed through the payout ledger.
  - **Item amount, paid to the merchant** (`merchant_direct`): the customer pays the merchant's Till/Paybill; Nitume never holds it and can't refund it.
- Forbidden words in this surface (copy, tooltips, code identifiers shown to users): wallet, balance, escrow, held, hold, release, credit, top up. Use "paid to Nitume", "paid to the merchant", "refund", "payout".

## 4. Layout tokens (from the mockup CSS, already ported to `styles/_ops.scss`)

| Element | Value |
|---|---|
| Panel topbar | `h1` 23/700; `.sub` 12.5 Fira Code slate-600; margin-bottom 26; actions gap 10 |
| Table card | white, 1px slate-line, radius 14; `th` 10.5 uppercase 0.04em slate-600 on slate, padding 14 18; `td` 13, padding 14 18, hairline between rows; `tr.clickable:hover` slate |
| Row action | `.row-assign` 12/700 blue, 1px slate-line, padding 6 12, radius 8 |
| Drawer | fixed right, width 420 (max 92vw), slate body; head white 20 22 with `h3` 16/700 and 32×32 round close; body padding 18 22 30 |
| Drawer section | margin-bottom 20; label 11/700 uppercase 0.04em slate-600, margin-bottom 10 |
| Drawer card | white, 1px slate-line, radius 12, padding 14 16; rows 13, padding 7 0, hairline, value `b` Fira Code 600 |
| Drawer timeline | left padding 20; green 8px dot; time 11 Fira Code slate-600 |
| Drawer actions | flex, gap 10, margin-top 6; mockup buttons `.btn-reject` (outline) and `.btn-approve` (green) 12.5/700, padding 9, radius 9, flex 1 |
| Form field (design system) | label 12.5/600 slate-600; input 14.5, padding 11 14, radius 8, 1px slate-line; focus 2px green outline; invalid border red |
| Chip | 11–12/600–700, padding 5 10–11, radius 999 |

## 5. Shared components (A-ids)

"Exists" = in `apps/admin/src/app/shared/` or global SCSS today. "NEW" = must be added to the admin shared layer (owner: `web-parity`, the Angular counterpart of `core-ui`) before the screens use it. Per-screen copies of any of these are an audit FAIL.

| Id | Component / pattern | Status |
|---|---|---|
| A-01 | `OpsDrawerComponent` (`app-ops-drawer`): overlay, slide-in, ESC/overlay/✕ close, `title` input | exists (`shared/ops-drawer.component.ts`) |
| A-02 | `StatusChipComponent` (`app-status-chip`) | exists. **NEW extension**: a `kind` input (`'errand' \| 'refund' \| 'verification' \| 'availability'`). Today `statusLabel('approved')` returns the verification label `Approved` (success), which is wrong for a refund (§6). Errand labels unchanged. |
| A-03 | `PanelTopbarComponent` (`app-panel-topbar`): title, Fira Code sub, search, `[topbar-actions]` slot | exists (`features/admin/panels/panel-topbar.component.ts`; the queue and disputes panels re-implement it inline, out of scope here) |
| A-04 | Table card (`.table-card`, `th`, `td`, `tr.clickable`, `.task-cat`, `.task-id`, `.row-assign`) | exists (global SCSS) |
| A-05 | Drawer section/label/card/row/timeline (`.drawer-section`, `.drawer-label`, `.drawer-card`, `.drawer-row`, `.drawer-timeline`, `.dt-item`, `.dt-time`, `.drawer-actions`) | exists (global SCSS) |
| A-06 | Form field (`.field`, `.field-label`, `.field-input`, `.field-input.is-invalid`) | exists (global `styles.scss`). **NEW**: `.field-hint` (12 slate-600, Fira Sans) and `.field-error` (12/600 red, text only) plus a `FormFieldComponent` (`app-form-field`: label, hint, error, projected control, wires `aria-describedby`) |
| A-07 | Buttons `.btn` + `.btn-primary` / `.btn-outline` / `.btn-text` | exists (global). Every button in this set uses the `.btn` base class (the current drawers use `btn-primary` without `.btn`, so they render unstyled) |
| A-08 | `ConfirmDialogComponent` (`app-confirm-dialog`): scrim over the drawer, white card radius 14 padding 20 max-width 360, `h3` 16/700, body 13 slate-600 (amounts Fira Code), actions right-aligned: outline `Back` + primary confirm; focus trapped, initial focus on `Back`, ESC = Back | **NEW** (the task drawer's `.drawer-modal` markup has no styles at all) |
| A-09 | `SegmentedToggleComponent` (`app-segmented-toggle`): 2–3 options in a 1px slate-line pill, radius 999, height 36; active segment green fill, white 13/600 text; inactive white, blue 13/600; `role="radiogroup"` | **NEW** |
| A-10 | Empty and loading (`.ops-empty` with `b` title + text; `.ops-loading`) | exists (global SCSS) |
| A-11 | `InlineNoticeComponent` (`app-inline-notice`, tones `success` / `danger` / `info`): a `.drawer-card` with a status chip of that tone (A-02 styling) followed by 13 blue text; `role="status"` (success/info) or `role="alert"` (danger) | **NEW**. Replaces red/green filled banners for these features: the design system allows amber/red only at chip size, so `.dispute-result.bad` and `.ops-banner` (red-050 fills) are not reused |
| A-12 | "Load more" pagination (centered `.btn .btn-outline`, label `Load more` / `Loading…`) | exists as a pattern in `verifications.panel.ts` (no `.pagination` style yet) |
| A-13 | Format helpers: `formatKshExact(value)` (§3), `formatDateTime(iso)` → `Today, 4:30 PM` / `Yesterday, 4:30 PM` / `Mon 12 Oct, 4:30 PM` (12-hour with AM/PM as in the mockup, East Africa Time; see AQ-6) | **NEW** (`timeAgo` and `formatKsh` exist; neither fits exact money or absolute times) |
| A-14 | `apiError(err)` helper → `{ status, code?, message, extra }` read from `HttpErrorResponse.error` (API body `{ statusCode, code, message, ...extra }`; class-validator 400s carry `message: string[]`) | **NEW** (`core/`). Today every drawer shows `HttpErrorResponse.message` ("Http failure response for …"), which is not user copy |
| A-15 | Sidebar nav item with badge (`.ops-nav-item`, `.badge-count`) | exists (admin-dashboard shell) |

## 6. Refund status vocabulary (admin)

API `RefundStatus` → admin chip (A-02 with `kind="refund"`). Admin labels differ from the customer's (`docs/specs/customer/_shared.md` §11) because the admin needs the next action, not reassurance.

| API status | Admin chip | Tone | Next action |
|---|---|---|---|
| `pending_review` | `Needs review` | pending (amber) | Decide an amount |
| `approved` | `Payout due` | pending (amber) | Send the M-Pesa refund, record the receipt |
| `refunded` | `Refunded` | success (green: complete state) | none |
| `no_refund` | `No refund` | neutral (slate) | none |

API `RefundTrigger` → `Reason` label:

| API trigger | Label |
|---|---|
| `price_change_rejected` | `Price change rejected` |
| `dispute_customer_favourable` | `Dispute: sided with customer` |
| `cancelled_after_payment` | `Cancelled after payment` |
| (row 48, not in the API yet) | `Price decrease` |

Unknown values: show the raw value title-cased (never hide a row).

## 7. Cross-cutting API gaps (needs: api-contract)

Collected here; each spec repeats the ones it depends on.

- N-1 `GET /refunds` and `GET /refunds/:id` return the bare `RefundReview` row. The panel and drawer need, per review: errand `{ id, title/description, category, status }`, customer `{ shortName, phone }` (the phone is where the manual refund is sent), and a paid breakdown by flow `{ serviceAndRunnerFee, itemAmountToNitume, priceChangeDifferences, merchantDirectAmount }`. Today `GET /payments/:errandId` returns transactions with a `paymentTypeId` uuid only, so the client cannot split by flow.
- N-2 `decidedByUserId` / `paidByUserId` are user ids; the drawer wants the admin's display name (or the client keeps showing `…a1b2`).
- N-3 Row 48 decrease refunds are not implemented: `refund_reviews.errandId` is unique and reviews only open on CANCELLED. Needs a `price_decrease` trigger and more than one review per errand (schema change: owner, row 62).
- N-4 A re-quote (`POST /errands/:id/quote` on an expired QUOTED errand) writes no history row and emits no event, so the customer is not notified and the drawer timeline does not show it. Needs a notification/socket event (e.g. `quote.reissued`) and ideally an audit row.
- N-5 The errand list has no quote expiry, so the queue can't flag expired quotes without one request per row. Needs `quoteExpiresAt` on `GET /errands` items (and the detail).
- N-6 `PATCH /errands/:id/resolve-dispute` does not update the `disputes` row (`status` stays `open`, `resolution` null), so the customer's `x-report-problem` read mode never shows an outcome. Needs: set `status=resolved`, `resolution=rationale`, `resolvedBy`, and add a `resolved` dispute event in the same transaction.
- N-7 Optional: a count endpoint (`GET /refunds/count?status=`) for the sidebar badge; until then the client counts a `limit=100` page (§ p-refunds).
- N-8 Non-`ApiError` conflicts (`ConflictException` in `performDisputeResolution`, state-machine 409s) have no `code`; the client can only switch on status 409. A code such as `errand_not_disputed` would let the UI word it precisely.

## 8. Open questions for the owner (AQ-n)

- **AQ-1 (security/payments)**: Can every admin approve refunds and record payouts, or only some roles (e.g. Ops Lead), and is there an amount above which a second admin must approve? Build default: every admin, single approval.
- **AQ-2 (copy, mockup deviation)**: The mockup's dispute button reads `Refund customer`. Under row 36 that verdict cancels the task and only opens a refund review (amount decided later, can be KSh 0). Proposed label `Side with customer`. OK?
- **AQ-3 (privacy)**: The dispute resolution note: is it shown to the customer and the runner? The current drawer says "shown to both parties" and the customer `x-report-problem` spec shows it as the Outcome. Build default: yes, both parties see it.
- **AQ-4 (scope)**: Which categories can carry a merchant/item amount (and so need Till/Paybill details)? Build default: Buy For Me and Get It For Me (row 45 budget categories), plus any errand that already has details.
- **AQ-5 (payments)**: The refund ceiling is "everything the customer paid Nitume by STK", which includes an item amount the runner may already have spent at the merchant (send_to_runner). Is that intended, or should the item amount be excluded once the runner bought the item? Build default: follow the API (full amount paid).
- **AQ-6 (copy)**: `KSh` (mockup) in admin vs `KES` in the API's customer notification text. Align the notifications to `KSh`? And 12-hour `4:30 PM` times as in the mockup?
