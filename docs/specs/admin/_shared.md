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
| 62, 71, 94 | Schema approved: several `refund_reviews` per errand, trigger `price_change_decrease`, `payments.priceChangeRequestId` | p-refunds, drawer-refund |
| 66 | System design §2.2/§6: send-to-runner is platform-mediated; the customer pays Nitume and Nitume pays the runner through the payout ledger | drawer-refund (§3 flows) |
| 67 | A `merchant_direct` price increase is paid manually by the customer to the same Till | drawer-task-merchant-details |
| 68 | After `quote_expired` the customer taps "Request a new quote"; the task is then available for an admin to re-quote | drawer-task-requote |
| 69 | "Admin refund decision notes remain internal and are not exposed to the customer." | drawer-refund |
| 72 | Admin re-quote while the task stays ACCEPTED (no ACCEPTED → QUOTED); the customer must accept/pay the new quote | drawer-task-requote |
| 77 | "Any authorized admin with the appropriate refund/payout permission may approve refunds and record payouts. No second-admin approval threshold is required for now. Put Refunds under Payments." | §2, p-refunds, drawer-refund |
| 78 | "Rename 'Refund customer' to 'Side with customer'" | drawer-dispute-outcome |
| 79 | "Both the customer and runner may see the dispute resolution note. Internal admin-only notes remain separate." | drawer-dispute-outcome |
| 80 | "Merchant amounts apply to Buy For Me and Get It For Me. If merchant details change after a merchant-direct payment has started, warn the customer rather than blocking the change." | drawer-task-merchant-details |
| 81 | "Include the item amount already paid to Nitume in the refund ceiling even when the runner has already purchased the item." | drawer-refund |
| 82 | "Use KSh in notifications. A payout receipt cannot be edited after the task reaches refunded; any correction must use an auditable correction/reversal process." | §3, drawer-refund |
| 83 | "Every quote requires an expiry, defaulting to 24 hours. expiresAt = null is not valid for quotes that can be replaced." | drawer-task-requote |
| 86 | Decrease refund reviews only on `send_to_runner` tasks; an admin can still record KSh 0 where applicable | §6, p-refunds, drawer-refund |
| 87 | "The cancellation refund ceiling must be based on the customer's remaining refundable exposure after all previous refunds, including approved decrease refunds, so cumulative refunds cannot exceed the amount actually paid." | drawer-refund, p-refunds |
| 88 | Admin re-quote only after the existing quote has expired; a still-valid quote is never silently replaced | drawer-task-requote |
| 95 | "Runner send_to_runner item amounts are reimbursed after the receipt is uploaded/accepted, not advanced before purchase." | §3 |
| 96 | "Admin times should be displayed in 12-hour East Africa Time (EAT), while backend timestamps remain canonical." | §3.1, A-13 |
| 98 | Socket.IO Redis adapter not approved yet: the API stays single-instance until horizontal scaling is required | §7 (note) |
| 100 | "Build the auditable correction/reversal schema now. Original payout/receipt records remain immutable; corrections/reversals are represented separately." | drawer-refund (Corrections), §6, §7 N-15 |
| 101 | Round-4 breaking API changes accepted as specified (customer/runner `resolvedBy: null` on disputes; no `payoutReference` in customer refund views; price changes outside Buy For Me / Get It For Me answer 400) | (no admin change) |
| 102 | "Paid tasks ending CANCELLED, EXPIRED, or FAILED should create a refund review. This is a review trigger, not an automatic refund." | §6, p-refunds, drawer-refund |
| 104 | "'Accepted' for runner item reimbursement means the task reaches CONFIRMED: receipt uploaded, customer confirmed, dispute window closed, and no dispute." | §3 |
| 105 | "A missing or mismatched receipt is not automatically payable and requires ops review. Any approved reimbursement is capped at the item amount actually paid to Nitume." | §3 |
| 106 | Runner already bought the item and the task ends CANCELLED or FAILED: "reimburse the runner for verified eligible out-of-pocket item expenditure, subject to the applicable caps/evidence requirements. Do not pay the runner service fee." | §3 |
| 107 | "Approve the runner payout ledger table. Build it now. It must support distinct financial lines for runner fee, item reimbursement, corrections, reversals, and re-sent payouts." | §3, p-runner-payouts, drawer-runner-payout |
| 108 | "Runner out-of-pocket purchases are limited by max_purchase_advance, and a runner may decline a task when the required purchase exceeds their configured limit." | §3 |
| 109 | "Customer notification is required for a re-sent payout. Internal payout corrections/reversals do not notify the customer by default." (AQ-9) | drawer-refund |
| 110 | "A correction must not record an amount above the applicable refund ceiling." (AQ-10) | drawer-refund |
| 111 | "A reversed, not-yet-re-sent payout remains committed at the decided refund amount until the obligation is resolved/re-sent, and therefore continues to count against the cumulative refund cap." | §3, drawer-refund |
| 112 | "Approve. Admin runner payout ledger and reimbursement ops-review screens are in scope." | p-runner-payouts, drawer-runner-payout, p-payout-requests, drawer-runner-purchase-limit |
| 113 | Offer model: offers inside RUNNER_ASSIGNED; accept → RUNNER_EN_ROUTE; decline → stays RUNNER_ASSIGNED, reassigned; lapse → EXPIRED; accept above the purchase limit refused | assign flow (admin assign creates an offer; spec of the assign drawer to follow when the API exists) |
| 117 | Runner payout requests up to the available amount, configurable minimum, one open request, ops pay manually, own auditable record | p-payout-requests |
| 118 | Payout destination fixed to the runner's sign-in phone | p-runner-payouts, p-payout-requests |
| 135 | Over-limit purchase at CONFIRMED → ops review; maximum claimable = min(item amount paid to Nitume, `max_purchase_advance`) | drawer-runner-payout |
| 136 | "Add a task-level combined financial exposure cap covering the customer refund and the runner item reimbursement on CANCELLED/FAILED tasks … Cases above the normal cap require ops review and explicit handling." | drawer-runner-payout, drawer-refund (amendment) |
| 138 | "KES 3,000 default, configurable per runner by admins. Changes audited with actor, timestamp, previous and new value. Runners cannot change their own limit." | drawer-runner-purchase-limit |
| 140 | (2026-10-16) "A runner-favour dispute keeps the runner eligible for the applicable payout/reimbursement; the dispute outcome does not cancel an otherwise valid runner payout." | drawer-dispute-outcome (no change) |
| 141 | (2026-10-16) "At the acceptance deadline with no acceptance the offer expires and the task goes EXPIRED at once; no runner acceptance after expiry." | N-20 (assign flow), p-refunds (`Task expired` reviews) |
| 142 | (2026-10-16) "Ordinary approval is capped at min(verified item amount paid to Nitume, runner max_purchase_advance) and must not silently override the runner's limit. Paying above max_purchase_advance needs an explicit exceptional override with an auditable reason and actor." Not the earlier "raise the runner's limit first" | drawer-runner-payout (§5 2b), drawer-runner-purchase-limit, N-21 |
| 143 | (2026-10-16) No payout-time promise/SLA anywhere; status only | p-payout-requests (and the runner copy it triggers) |
| 144 | (2026-10-16) Runner ID/selfie images kept only as long as needed for verification, fraud prevention, audit and legal/compliance, then securely deleted; never indefinitely; retention configurable; access restricted and logged throughout | admin verification views when specced (none yet) |
| 146 | (2026-10-16) "A request paid below the requested amount closes as PAID; store requested and actual paid amounts separately … The remainder is not carried in the same request; it stays in available balance for a new payout request." | p-payout-requests |
| 93 | The four admin tones `#DCE3EE`, `#C3CADC`, `#7E8CA8`, `#EEF1F5` are approved admin palette tokens in `_tokens.scss` | §4.1 |

Answered 2026-10-09 and applied above: rows 62, 68, 69, 77–83, 86–88, 93, 94 (AQ-1 … AQ-6, AQ-R1, AQ-R2). Answered 2026-10-12 and applied on `docs/owner-answers-5`: rows 95, 96 (AQ-7), 98, 100, 101, 102 (AQ-8). Answered 2026-10-13 and applied on `docs/owner-answers-6-runner-specs`: rows 104–108 (runner reimbursement and payout ledger, system design §2.2/§6), 109 (AQ-9), 110 (AQ-10), 111. Answered 2026-10-16 and applied on `docs/owner-answers-7-specs`: rows 140–144, 146. Still open on the BOARD and relevant here: row 85 (PayHero contract, no admin UI impact), rows 145 and 148 (override storage and cap scope), row 147 (process).

## 2. Access

- Every endpoint in this set is `@Roles(UserRole.ADMIN)` (refunds controller at class level; `PUT /errands/:id/merchant-details`, `POST /errands/:id/quote`, `PATCH /errands/:id/resolve-dispute` per route). `GET /errands/:errandId/refund` allows customer and admin.
- The admin app already gates the whole dashboard with `authGuard` + `adminOnlyGuard` (`apps/admin/src/app/app.routes.ts`) and sends `x-nitume-acting-role: admin` on every call. No new guard is needed and no screen in this set has a non-admin variant.
- A 401 is handled by the existing auth interceptor (refresh, then `/login`). A 403 on any call in this set shows the inline error notice (A-11) `You don't have access to this. Sign in with an ops admin account.` and leaves the form disabled.
- **Refund approval and payout recording (row 77, decided)**: any authorized admin may approve refunds and record payouts; **no second approver** and no amount threshold. Today every user with the `admin` role is authorized (`@Roles(UserRole.ADMIN)`); if the API later adds a refund/payout permission, the drawer hides the decision and payout forms for admins without it and shows the 403 copy above. No client-side role tiers are invented.

## 3. Money and the three payment flows

- Display format: `KSh 1,250` for whole shillings, `KSh 1,250.50` when there are cents. Thousands separator `,` (en-KE). Never round a refund or paid amount: refunds are stored with 2 decimals and an admin must see the exact figure they are approving. The existing `formatKsh` (`features/admin/shared-format.ts`) rounds to whole shillings, so it is **not** usable for refund amounts: needs `formatKshExact` (A-13). `—` for null.
- `KSh` everywhere (mockup `.drawer-row b`, `.rep-stat-row b`), and in the customer notifications the API writes (row 82, decided; the API still writes `KES`, needs N-12). `KES` is only the wire currency code.
- Every amount, count, id, receipt, Till/Paybill/account number, phone number and timestamp is Fira Code (`.num` / `b` inside `.drawer-row`). Labels next to them are Fira Sans.
- Money inputs: `<input type="text" inputmode="decimal">` in a `.field-input` with Fira Code value text, a static `KSh` prefix label in Fira Sans 13 slate-600 inside the field's left padding. Accept digits and one `.`, max 2 decimals; strip `,` and spaces before sending; send a JSON **number** (the DTOs use `@IsNumber`).
- The three flows stay separate in every label:
  - **Service + runner fee**: one STK charge to Nitume (row 34 hides the split from the customer; the admin may see components where the API gives them).
  - **Item amount, paid to Nitume** (`send_to_runner`, rows 42, 66, 76): part of the combined STK charge to Nitume. The runner buys the item with their own money; Nitume **reimburses** the runner through the payout ledger after the receipt is uploaded and accepted (task CONFIRMED, row 104), never in advance (row 95, system design §6 "Runner reimbursement"). A missing or mismatched receipt goes to ops review, capped at the item amount paid to Nitume (row 105); on a CANCELLED or FAILED task verified item spend is reimbursed but no runner fee is paid (row 106); lines live in the runner payout ledger (row 107). It counts toward the refund ceiling even when the runner already bought the item (row 81).
  - **Item amount, paid to the merchant** (`merchant_direct`): the customer pays the merchant's Till/Paybill, including any increase, manually (row 67); Nitume never holds it and can't refund it; a decrease opens no refund review (row 86).
- **Refund ceiling (rows 37, 81, 87)**: what the customer paid **to Nitume** on the task (fees, item amount on `send_to_runner`, completed differences), **minus refunds already approved or sent** on the same task. Cumulative refunds never exceed what was paid; a reversed, not-yet-re-sent payout keeps counting at its decided amount (row 111). The API returns the ceiling as the review's `amountPaid` (needs N-9 for the net rule) and enforces it again at decision time.
- Forbidden words in this surface (copy, tooltips, code identifiers shown to users): wallet, balance, escrow, held, hold, release, credit, top up. Use "paid to Nitume", "paid to the merchant", "refund", "payout".

## 3.1 Times (row 96, decided 2026-10-12)

- **Display**: every time an admin reads is **12-hour East Africa Time (EAT, `Africa/Nairobi`, UTC+3, no daylight saving)** with `AM`/`PM`, as drawn in the mockup: `Today, 4:30 PM`, `Yesterday, 4:30 PM`, `Mon 12 Oct, 4:30 PM` (add the year, `Mon 12 Oct 2025, 4:30 PM`, when it is not the current year). Render with `Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', hour: 'numeric', minute: '2-digit', hour12: true, … })` (A-13 `formatDateTime`); never the browser's local zone, so an admin abroad sees the same times as ops in Kenya. "Today"/"Yesterday" are computed in EAT too. Fira Code, as all timestamps.
- **Backend stays canonical**: the API sends and stores UTC ISO-8601 (`2026-10-12T13:30:00.000Z`, `timestamptz`). The client never sends a formatted or local-zone string.
- **Inputs** (e.g. `Valid until` in `drawer-task-requote`): the admin types EAT; the client converts to a UTC ISO string ending in `Z` (`2026-10-09T09:00:00.000Z` for 12:00 EAT; built as `eatLocalInputToIso`, accepted in the 2026-10-12 round-5 re-audit) before sending and shows the hint `East Africa Time`. Defaults (e.g. now + 24 h) are computed in UTC and displayed in EAT.
- **Relative times** (`timeAgo`, `4 min ago`) may stay where the mockup draws them; any absolute time follows this section.
- Where a time sits next to text that could be read as another zone (exports, tooltips, the A-08 dialogs), suffix `EAT` (`4:30 PM EAT`, helper `formatDateTimeEat`). In tables and drawer rows the suffix is not needed.
- Day buckets (the `Today` KPI, daily and weekly bars) use the EAT calendar too (`eatDayKey`, `eatWeekday`; weeks start Monday 00:00 EAT). Time-only labels use `formatTime` (`4:30 PM`).

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

### 4.1 Admin palette tokens (row 93, approved)

Besides the design-system palette and derived tones, the admin surface has four approved **admin palette tokens**, promoted from the mockup's sidebar and map values. They live only in `apps/admin/src/styles/_tokens.scss` and are used through `var(...)`; no other surface uses them, and no hex value appears outside `_tokens.scss`.

| Token | Hex | Use |
|---|---|---|
| `--nitume-sidebar-text` | `#DCE3EE` | sidebar body text on blue |
| `--nitume-sidebar-item` | `#C3CADC` | inactive nav item on blue |
| `--nitume-sidebar-muted` | `#7E8CA8` | nav group labels, sidebar footer role |
| `--nitume-map-bg` | `#EEF1F5` | ops map canvas |

An audit treats these four as palette, not as violations. Any other new hex is still a FAIL.

## 5. Shared components (A-ids)

"Exists" = in `apps/admin/src/app/shared/` or global SCSS today. "NEW" = must be added to the admin shared layer (owner: `web-parity`, the Angular counterpart of `core-ui`) before the screens use it. Per-screen copies of any of these are an audit FAIL.

| Id | Component / pattern | Status |
|---|---|---|
| A-01 | `OpsDrawerComponent` (`app-ops-drawer`): overlay, slide-in, ESC/overlay/✕ close, `title` input | exists (`shared/ops-drawer.component.ts`) |
| A-02 | `StatusChipComponent` (`app-status-chip`) | exists. **NEW extension**: a `kind` input (`'errand' \| 'refund' \| 'verification' \| 'availability'`). Today `statusLabel('approved')` returns the verification label `Approved` (success), which is wrong for a refund (§6). Errand labels unchanged. |
| A-03 | `PanelTopbarComponent` (`app-panel-topbar`): title, Fira Code sub, search, `[topbar-actions]` slot | exists (`features/admin/panels/panel-topbar.component.ts`; the queue and disputes panels re-implement it inline, out of scope here) |
| A-04 | Table card (`.table-card`, `th`, `td`, `tr.clickable`, `.task-cat`, `.task-id`, `.row-assign`) | exists (global SCSS) |
| A-05 | Drawer section/label/card/row/timeline (`.drawer-section`, `.drawer-label`, `.drawer-card`, `.drawer-row`, `.drawer-timeline`, `.dt-item`, `.dt-time`, `.drawer-actions`) | exists (global SCSS) |
| A-06 | Form field (`.field`, `.field-label`, `.field-input`, `.field-input.is-invalid`) | exists (global `styles.scss`). **NEW**: `.field-hint` (12 slate-600, Fira Sans) and `.field-error` (12/600 red, text only) plus a `FormFieldComponent` (`app-form-field`: label, hint, error, projected control, wires `aria-describedby`). The hint renders through `app-num-text`, so amounts, receipts and times in a hint are Fira Code and the words Fira Sans (accepted app-wide, round 5, 2026-10-12). A number that is a rule rather than data (e.g. `At least 20 characters`) must stay Fira Sans: such a hint needs a plain-text opt-out (m-12) |
| A-07 | Buttons `.btn` + `.btn-primary` / `.btn-outline` / `.btn-text` | exists (global). Every button in this set uses the `.btn` base class (the current drawers use `btn-primary` without `.btn`, so they render unstyled) |
| A-08 | `ConfirmDialogComponent` (`app-confirm-dialog`): scrim over the drawer, white card radius 14 padding 20 max-width 360, `h3` 16/700, body 13 slate-600 (amounts Fira Code), actions right-aligned: outline `Back` + primary confirm; focus trapped, initial focus on `Back`, ESC = Back | **NEW** (the task drawer's `.drawer-modal` markup has no styles at all) |
| A-09 | `SegmentedToggleComponent` (`app-segmented-toggle`): 2–3 options in a 1px slate-line pill, radius 999, height 36; active segment green fill, white 13/600 text; inactive white, blue 13/600; `role="radiogroup"` | **NEW** |
| A-10 | Empty and loading (`.ops-empty` with `b` title + text; `.ops-loading`) | exists (global SCSS) |
| A-11 | `InlineNoticeComponent` (`app-inline-notice`, tones `success` / `danger` / `info`): a `.drawer-card` with a status chip of that tone (A-02 styling) followed by 13 blue text; `role="status"` (success/info) or `role="alert"` (danger) | **NEW**. Replaces red/green filled banners for these features: the design system allows amber/red only at chip size, so `.dispute-result.bad` and `.ops-banner` (red-050 fills) are not reused |
| A-12 | "Load more" pagination (centered `.btn .btn-outline`, label `Load more` / `Loading…`) | exists as a pattern in `verifications.panel.ts` (no `.pagination` style yet) |
| A-13 | Format helpers: `formatKshExact(value)` (§3), `formatDateTime(iso)` → `Today, 4:30 PM` / `Yesterday, 4:30 PM` / `Mon 12 Oct, 4:30 PM` (12-hour with AM/PM as in the mockup, East Africa Time; §3.1, row 96 decided) | **NEW** (`timeAgo` and `formatKsh` exist; neither fits exact money or absolute times) |
| A-14 | `apiError(err)` helper → `{ status, code?, message, extra }` read from `HttpErrorResponse.error` (API body `{ statusCode, code, message, ...extra }`; class-validator 400s carry `message: string[]`) | **NEW** (`core/`). Today every drawer shows `HttpErrorResponse.message` ("Http failure response for …"), which is not user copy |
| A-16 | Row checkbox column + sticky batch bar (selected count and Fira Code total, one primary action), for `p-runner-payouts` and `p-payout-requests` | **NEW** |
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
| `price_change_decrease` (rows 48, 71; `send_to_runner` tasks only, row 86) | `Price decrease` |
| `expired_after_payment` (row 102; RUNNER_ASSIGNED → EXPIRED, no runner accepted in time) | `Task expired` |
| `failed_after_payment` (row 102; RUNNER_EN_ROUTE → FAILED) | `Task failed` |

Unknown values: show the raw value title-cased (never hide a row). Row 102: these are **review triggers**, not automatic refunds; the admin still decides the amount (KSh 0 up to the ceiling).

Effective payout state (row 100, see `drawer-refund` "Corrections"): a `refunded` review whose latest correction is a reversal shows the chip `Payout reversed` (pending, amber; next action: send again and record the new payout) instead of `Refunded`. A `refunded` review with corrections that leave it sent still shows `Refunded`.

## 6.1 Runner payout vocabulary (admin, row 107)

API effective status (`effectiveStatus`, with `effectivePayout`) → A-02 `kind="runner_payout"`:

| Effective status | Chip | Tone | Next action |
|---|---|---|---|
| `on_hold` | `Needs review` | pending (amber) | Approve (capped) or reject |
| `payable`, no reversed payout | `Payout due` | pending (amber) | Send M-Pesa, record the receipt (batch per runner) |
| `payable` with `effectivePayout.state = 'reversed'` | `Payout reversed` | pending (amber) | Re-send (`resent_payout`), never `mark-paid` |
| `paid` | `Paid` | success (complete state) | none |
| `rejected` | `Not approved` | neutral (slate) | none |

Review reasons (`reviewReason`): `receipt_missing` → `No receipt`; `receipt_mismatch` → `Receipt doesn't match`; `out_of_pocket_claim` → `Claim after cancel/fail`; `over_purchase_limit` → `Above purchase limit`; `price_decrease_pending` → `Waiting for the price-decrease refund decision` (built on `cf525cf`: the item line waits at CONFIRMED while a price-decrease refund review is undecided; decide that refund first). Line kinds: `runner_fee` → `Runner fee`; `item_reimbursement` → `Item reimbursement`. Adjustment kinds: `correction` → `Payout corrected`; `reversal` → `Payout reversed`; `resent_payout` → `Payout sent again`. Payout requests (N-17): `requested` → `Waiting` (pending), `paid` → `Paid` (success), `rejected` → `Not approved` (neutral). Unknown values: raw value title-cased.

## 7. Cross-cutting API gaps (needs: api-contract)

Collected here; each spec repeats the ones it depends on.

- N-1 `GET /refunds` and `GET /refunds/:id` return the bare `RefundReview` row. The panel and drawer need, per review: errand `{ id, title/description, category, status }`, customer `{ shortName, phone }` (the phone is where the manual refund is sent), and a paid breakdown by flow `{ serviceAndRunnerFee, itemAmountToNitume, priceChangeDifferences, merchantDirectAmount }`. Today `GET /payments/:errandId` returns transactions with a `paymentTypeId` uuid only, so the client cannot split by flow.
- N-2 `decidedByUserId` / `paidByUserId` are user ids; the drawer wants the admin's display name (or the client keeps showing `…a1b2`).
- N-3 Done on `main`: `price_change_decrease` reviews, several per errand (rows 71, 94). Remaining: open them only on `send_to_runner` tasks (N-10).
- N-4 A re-quote (`POST /errands/:id/quote` on an expired QUOTED errand) writes no history row and emits no event, so the customer is not notified and the drawer timeline does not show it. Needs a notification/socket event (e.g. `quote.reissued`) and ideally an audit row.
- N-5 The errand list has no quote expiry, so the queue can't flag expired quotes without one request per row. Needs `quoteExpiresAt` on `GET /errands` items (and the detail).
- N-6 Done on `main` (`disputes.service.ts` `closeWithin`): the verdict sets `status`, `resolution`, `resolvedBy` and a `resolved` event. The resolution is readable by customer and runner (`GET /errands/:errandId/dispute`), as row 79 allows.
- N-7 Optional: a count endpoint (`GET /refunds/count?status=`) for the sidebar badge; until then the client counts a `limit=100` page (§ p-refunds).
- N-9 (row 87) **Built on `feat/api-owner-answers-4`** (not on `main`), as separate fields rather than a netted `amountPaid`: `refundCeiling` (null once decided), `alreadyRefunded`, `remainingRefundable`, `totalPaidToNitume` on every admin refund response; `amountPaid` stays the review's own basis. Admin screens show the ceiling as `refundCeiling` while pending (p-refunds `Refundable`, drawer-refund). Original requirement: the cancellation review's ceiling must be **net of refunds already approved or refunded** on the errand; at decision time every review is checked against `min(amountPaid, totalPaidToNitume − Σ refundAmount of the errand's other approved/refunded reviews)`, answering `refund_exceeds_amount_paid` with the effective ceiling in `amountPaid`. Today `amountPaid()` sums every completed STK leg (`refunds.service.ts:508`).
- N-10 (row 86) `openForDecrease` only when the item payment route is `send_to_runner` (`price-change.service.ts:186-189` opens it on every route).
- N-11 (row 83) `QuoteErrandDto.expiresAt` required in effect: when omitted the server sets now + 24 h; no new quote has `expiresAt = null`. Legacy null-expiry quotes: backfill to `createdAt + 24 h` (data fix) so they can be replaced; until then the drawer shows `No expiry`.
- N-12 (row 82) Customer notification bodies use `KSh` with the app's money format (`notifications.service.ts:331, 340-341, 360, 372` write `KES ${raw}`).
- N-13 (row 68) **Built on `feat/api-owner-answers-4`** (not on `main`), plus `GET /errands?quoteRequested=` and `GET /errands/count?quoteRequested=` (drawer-task-requote Data). Original requirement: customer `POST /errands/:id/quote-request` (QUOTED or ACCEPTED with an expired quote; idempotent; no state change), `quoteRequestedAt` on `GET /errands/:id` and on `GET /errands` items, and an admin notification/live-feed item `Customer asked for a new quote`. If storing it needs a new column, that is a schema change for the owner.
- N-14 (row 80) `PUT /errands/:id/merchant-details` refuses categories other than `buy_for_me` / `pickup_delivery` (e.g. 400 `merchant_details_not_applicable`); a change on a task whose `merchant_direct` payment has started records `merchantDetailsUpdatedAt` and notifies the customer (`merchant_details.changed`).
- N-15 (rows 82, 100; **schema approved 2026-10-12, build now**) Payout correction/reversal records, append-only table `refund_payout_corrections` (system design §2.2): `POST /refunds/:id/corrections`, `corrections[]` and `effectivePayout` on admin refund responses, customer view on the effective payout. Full contract in `drawer-refund.md` "Corrections" → Data.
- N-16 (row 102, **approved 2026-10-12**) New `RefundTrigger` values `expired_after_payment` and `failed_after_payment` (enum migration); open a review (same upsert as the cancellation review, `priceChangeRequestId` null, so at most one cancellation-type review per errand) when a **paid** errand moves RUNNER_ASSIGNED → EXPIRED or RUNNER_EN_ROUTE → FAILED, with the same ceiling rules (rows 81, 87) and the same customer notification as a cancellation review. "Paid" = at least one completed STK leg to Nitume, as for `cancelled_after_payment`. A late STK completion on an EXPIRED/FAILED errand refreshes `amountPaid` while `pending_review`, as for CANCELLED.
- Row 98 (note, no admin change): the API runs as **one instance** (no Socket.IO Redis adapter). The `admins` room and live events assume that; nothing in these screens needs a change.
- N-17 (row 117) Runner payout requests: record + endpoints (`/runner-payout-requests` list/count/detail/pay/reject, runner create/list/summary), configurable minimum with an audited setting, one open request per runner, destination = sign-in phone; `pay` marks whole lines paid like `mark-paid` and links them; the request stores `requestedAmount` and `paidAmount` separately and closes `paid` even when `paidAmount` < `requestedAmount`; the remainder is not carried on the request (row 146, decided). No payout time anywhere (row 143).
- N-18 (row 136) **Built on `feat/api-owner-answers-6` @ `dbc3a76`**: 409 `task_exposure_cap_exceeded`, `exposureOverrideNote`, `taskExposure`, `exposureOverrides[]`, table `task_exposure_overrides` (storage approval pending row 145). Original requirement: task-level combined exposure cap on CANCELLED/FAILED: one figure across the customer refund reviews and the runner's item reimbursements; refund decisions, refund corrections, item approvals and claims checked against it; above it only with an explicit override (amount, reason ≥ 20 chars, actor, time; schema RQ-26); expose `exposure { itemPaidToNitume, customerRefundsCommitted, runnerReimbursementCommitted, remaining }` on the refund detail and the runner payout detail.
- N-19 (row 138) `PATCH /runners/:id/purchase-limit` + append-only audit history, `GET …/history`; runners refused.
- N-20 (rows 113, 141) Admin assign creates an offer (10 min) instead of an accepted assignment; at the deadline with no acceptance the offer expires and the task goes RUNNER_ASSIGNED → EXPIRED at once (row 141: no re-offer step, no acceptance after expiry; a paid task then opens the `Task expired` refund review, row 102); the task drawer's assign action and the queue need an `Offered to {runner}, ends {time}` state and the decline/expiry outcomes (spec to follow with RA-1).
- N-21 (row 142, 2026-10-16) Purchase-limit exception on item reimbursement review: `POST /runner-payouts/:id/review` accepts `purchaseLimitOverrideNote` (10–500); without it the approval stays ≤ min(item amount paid to Nitume, `max_purchase_advance`) (today's `approvalCeilingOf`); with it up to `overLimitCeiling` = min(requested, item amount paid to Nitume, the line's cap without the limit); never above the item amount paid to Nitume. Record actor, time, line, limit at the time, amount and reason append-only (storage: owner question, recommended the row-136 override record with source `purchase_limit`); expose `overLimitCeiling` and `purchaseLimitOverride` on the detail; 400 `purchase_limit_override_note_invalid`. Today the ceiling reads the runner's **current** limit, so raising the limit (N-19) would lift it without a per-line record: see the open question in `drawer-runner-payout.md`.
- N-8 Non-`ApiError` conflicts (`ConflictException` in `performDisputeResolution`, state-machine 409s) have no `code`; the client can only switch on status 409. A code such as `errand_not_disputed` would let the UI word it precisely.

## 8. Owner questions (AQ-n)

All answered 2026-10-09:

| AQ | BOARD row | Answer |
|---|---|---|
| AQ-1 | 77 | Any authorized admin approves refunds and records payouts; no second approver; `Refunds` moves to a new `Payments` nav group |
| AQ-2 | 78 | `Side with customer` replaces the mockup's `Refund customer` |
| AQ-3 | 79 | The resolution note is visible to customer and runner; internal admin-only notes stay separate |
| AQ-4 | 80 | Merchant amounts only for Buy For Me and Get It For Me; detail changes after a merchant-direct payment started warn the customer, never block |
| AQ-5 | 81 | The ceiling includes the item amount paid to Nitume, even after the runner bought the item |
| AQ-6 | 82 | `KSh` in notifications; no receipt edits after `refunded`, corrections through an auditable correction/reversal |
| AQ-R1 | 72 | Re-quote while ACCEPTED, no state change |
| AQ-R2 | 83 | Every quote requires an expiry, default 24 h |

Answered 2026-10-12:

| AQ | BOARD row | Answer |
|---|---|---|
| AQ-7 | 96 | 12-hour East Africa Time in the admin; backend timestamps stay canonical (§3.1) |
| AQ-8 | 102 | Paid tasks ending CANCELLED, EXPIRED or FAILED open a refund review (review trigger, not an automatic refund); labels `Task expired`, `Task failed` (§6) |

Answered 2026-10-13:

| AQ | BOARD row | Answer |
|---|---|---|
| AQ-9 | 109 | Only a re-sent payout notifies the customer; payout corrections and reversals do not by default |
| AQ-10 | 110 | A correction must not record an amount above the applicable refund ceiling |
| — | 111 | A reversed, not-yet-re-sent payout stays committed at the decided refund amount and keeps counting against the cumulative refund cap (row 87) |

Answered 2026-10-13 (rows 112–139): applied in §1 and the runner payout specs.

Answered 2026-10-16:

| AQ | BOARD row | Answer |
|---|---|---|
| AQ-11 | 146 | A request paid below the requested amount closes `paid`; requested and paid amounts stored and shown separately; the remainder stays owed for a new request |
| RQ-23 | 142 | Ordinary approval capped at min(item paid to Nitume, purchase limit); above the limit only through an explicit, audited exception (reason + actor); not by raising the limit first |

Open:
| AQ | Question | Default |
|---|---|---|
| RQ-26 (BOARD row 145) | See `docs/audits/runner-gap-report.md` §9 (override storage) | as there |
| new (row 142 follow-up, schema) | Storage of the purchase-limit exception (`drawer-runner-payout.md`) | the row-136 override record with source `purchase_limit` |
| new (row 142 follow-up, payments) | Does a limit change lift the ordinary ceiling of item lines already in review? | No: the limit at line creation applies |
