# Customer app — shared spec conventions

Applies to every `docs/specs/customer/*.md`. Each view spec references the component ids (`C-xx`), owner answers (`OA-n`) and rules below instead of repeating them.

Sources (real paths):
- Mockup: `docs/design/nitume_customer_app.html`
- Design system: `docs/design/nitume_design_system.html`
- System design: `docs/design/Nitume_System_Design.md`, the only copy (canonical per row 70; the duplicate at `docs/Nitume_System_Design.md` was removed 2026-10-09). §3.3 (state machine) follows row 56; §2.2 and §6 (payments) follow rows 66 and 76
- Owner answers: `docs/audits/customer-gap-report.md` → "Questions for the owner (consolidated)", answers 1–21 (= BOARD rows 2–22, cited as `OA-n`), plus BOARD rows 1 and 23–94 (answered 2026-10-07/08/09, cited as `row N`, index in §0.1). Rows 34, 48, 49 and 58 carry "Clarified 2026-10-08" notes; the clarified wording wins
- Implementation: `apps/customer_app/lib/src/**`; shared package `packages/nitume_core/lib/src/**`
- Shared widgets and data layer: core-ui branches `feat/core-customer-widgets`, `feat/core-owner-decisions`, `feat/core-spec-widgets` (merged into `feat/customer-screens`, not yet on `main`)
- API additions: api-contract branches `feat/api-customer-gaps`, `feat/api-owner-decisions` (not yet on `main`)

Order of precedence: owner answers, then the design system for styling, then the mockup for content, copy and flow (AGENT_BUILD_INSTRUCTIONS §1). Where the mockup CSS differs from the design system, the spec gives the design-system value and records the mockup value as "mockup:".

## 0. Owner answers (OA-n) and pending items

`OA-n` = answer n in the gap report's consolidated owner questions = BOARD row n+1. Specs cite these instead of asking again.

| OA | BOARD row | Decision | Applied in |
|---|---|---|---|
| OA-1 | 2 | Full category display names, no short labels | §7, v-home, v-new-category |
| OA-2 | 3 | `display_name` for customers and runners, collected after first sign-in, exposed in API + UI | x-name-capture, v-auth-otp, v-home, v-profile, v-track, v-rate, v-task-detail, v-history, v-notifications, v-price-auth |
| OA-3 | 4 | Synchronous **preview** quote in the wizard; authoritative flow stays REQUESTED → QUOTED → ACCEPTED (owner wrote "PENDING_QUOTE"; the §3.3 name is REQUESTED). Preview ≠ final quote | v-new-review, x-awaiting-quote |
| OA-4 | 5 | Customer sees Service fee + Runner fee + Merchant/item amount; internal commission split never shown | §8, v-new-review, x-awaiting-quote, v-evidence-confirm, v-task-detail |
| OA-5 | 6 | Customer picks the merchant payment route at checkout. MVP routes: merchant-direct (only when merchant details exist) and send-to-runner. Runner advance is runner-side, never a customer option. Till/Paybill shown only when merchant-direct is selected | x-awaiting-quote (checkout), x-merchant-payment |
| OA-6 | 7 | No escrow wording. CTA `Confirm completion`. Confirming makes the runner's earnings eligible for the normal payout process | v-evidence-confirm, §7 |
| OA-7 | 8 | Confirm = AWAITING_CUSTOMER → COMPLETED. COMPLETED is the terminal customer-task state | v-evidence-confirm, v-rate |
| OA-8 | 9 | Price change = item/merchant amount. Customer approves and pays the difference. Reject → CANCELLED. Presented as a **modal** | v-price-auth |
| OA-9 | 10 | Keep DRAFT → CANCELLED and AWAITING_CUSTOMER → DISPUTED; remove DISPUTED → CONFIRMED | v-evidence-confirm, v-task-detail, x-report-problem |
| OA-10 | 11 | Cards out of MVP. M-Pesa only. No Visa, no card provider | v-payment-methods, x-payment-method-form |
| OA-11 | 12 | Pill buttons (design system) | C-01..C-04 |
| OA-12 | 13 | White 8px field with 2px green focus (design system) | C-17 |
| OA-13 | 14 | Red: unread dot, destructive rows, inline errors, Cancelled chip. Amber: En route chip, price-change price text | §2, §6, C-05, C-11, C-24 |
| OA-14 | 15 | Off-palette mockup colours → nearest design-system tokens; no new colours | §2 |
| OA-15 | 16 | Backend-generated `reference`; optional customer `title` | v-new-details, §7 |
| OA-16 | 17 | Dedicated `runner_notes` field | v-evidence-confirm, v-task-detail |
| OA-17 | 18 | OTP: 5-minute expiry, 5 verify attempts, 60 s resend cooldown, 5 requests per hour per phone/account, IP/device throttling, a new OTP invalidates the old one | v-auth-phone, v-auth-otp |
| OA-18 | 19 | Out of MVP: recurring tasks, Business Tasks, in-task chat. One configurable Support entry point | v-profile, v-home, v-new-category, v-track, x-support |
| OA-19 | 20 | Pickup + drop-off for Get It For Me and Buy For Me; `deadline_at` authoritative, urgency derived; budget per category; structured shopping-list items | v-new-details |
| OA-20 | 21 | §6 state → label table below is authoritative | §6 |
| OA-21 | 22 | After payment go to Track. STK states PENDING / SUCCESS / FAILED / TIMEOUT; TIMEOUT is not failure; safe retry; pay with selected/default M-Pesa method, login phone only as fallback | v-payment, x-awaiting-quote |

### 0.1 Later owner answers (cite as "row N")

All answered. Specs no longer say "pending row N" for these.

| Row | Decision | Applied in |
|---|---|---|
| 1 | Category enum ↔ display-name mapping confirmed exactly as in §7 | §7 |
| 23 | Socket events approved as written: `errand:join`, `errand:leave`, `errand:status_changed`, `evidence:uploaded`, `price_change:requested`, `location:update`, rooms `errand:{id}` (§4.2) | §10, v-home, v-track, x-awaiting-quote, v-payment, v-evidence-confirm, v-price-auth, x-merchant-payment |
| 24 | Nullable unique `payments.idempotency_key` + `Idempotency-Key` header | v-payment, x-merchant-payment |
| 25 | Evidence through authenticated, short-lived (~15 min) signed GET URLs; never permanent public URLs | C-25, x-evidence-viewer |
| 26 | BullMQ for the notification worker (no UI change) | — |
| 27 | Live runner location only during the current assignment window (RUNNER_ASSIGNED → AWAITING_CUSTOMER) | §10, v-track, v-home |
| 28 | `GET /errands/:id/rating` access check (API only) | v-rate |
| 29 | `socket_io_client` approved | §10 |
| 30 | `google_maps_flutter` and a Google Places client approved, behind interfaces and environment configuration (API key) | §10, v-track, v-new-details, x-address-form |
| 31 | `firebase_messaging` approved: register the token after login, remove/deactivate it on logout | §10, v-auth-otp, x-name-capture, v-profile, v-notifications |
| 32 | Video evidence deferred from MVP; no video-player dependency | C-25, x-evidence-viewer |
| 33 | High-contrast chip text approved | §2, §3, C-05 |
| 34 | Customer-facing fees = item amount + service fee + runner fee; commission split internal. **Clarified 2026-10-08: show only `Total (service + runner fee)` until pricing rates exist (row 47)** | §8, v-new-review, x-awaiting-quote, v-evidence-confirm, v-task-detail |
| 35 | CONFIRMED and SETTLED are system-only; customer confirm = AWAITING_CUSTOMER → COMPLETED | §6 |
| 36 | Dispute resolution: runner-favourable → COMPLETED, customer-favourable → CANCELLED (admin) | x-report-problem, v-task-detail |
| 37 | Customer IN_PROGRESS → CANCELLED only through a price-change reject; opens an admin refund review; admin sets the refund (up to full) | v-price-auth, §11 |
| 38 | Dialog scrim: blue `#0B2545` at 50% (was SQ-1) | §2, C-35 |
| 39 | `url_launcher` approved; targets from `AppConfig.termsUri` / `privacyUri` / `supportUri` (was SQ-2) | x-legal, x-support, v-auth-phone, v-auth-otp |
| 40 | The API computes the runner short name (was SQ-3) | §7 |
| 41 | Fallback task title = category display name (was SQ-4) | §7 |
| 42 | Send-to-runner is platform-mediated: the customer pays Nitume by M-Pesa STK; no direct customer-to-runner transfer (was SQ-5) | §8, x-awaiting-quote, x-merchant-payment |
| 43 | Merchant Till/Paybill details are supplied by the merchant or an admin; the customer only selects the route (was SQ-6) | §8, x-awaiting-quote, x-merchant-payment |
| 44 | Price-change difference paid through the same route as the original merchant payment; if that route is unavailable, the customer explicitly selects one | §8.2, v-price-auth, x-merchant-payment |
| 45 | Budget shown for Buy For Me and Get It For Me only | v-new-details, v-new-review |
| 46 | Expired quotes cannot be accepted: the API returns `quote_expired`; a fresh quote is required | §8.3, x-awaiting-quote |
| 47 | No invented pricing rules: the wizard preview stays non-authoritative and is not shown until real pricing rates exist; the authoritative quote is admin-generated | §8.3, v-new-review |
| 48 | Increase charged on the original merchant route. **Clarified 2026-10-08: a decrease opens an admin refund review for the difference** | §8.2, §11, v-price-auth |
| 49 | Guarded cancellation on price-change reject only. **Clarified 2026-10-08: runners can request price changes only in IN_PROGRESS; no new transitions** | §8.2, v-price-auth, v-track |
| 50 | Dispute window configurable (24 h placeholder), restarts after a dispute resolves to COMPLETED | v-task-detail (report row) |
| 51 | Urgency thresholds from `deadlineAt` (≤ 4 h urgent, > 72 h scheduled), configurable, server-side | v-new-details |
| 52 | STK timeout from the provider status (Daraja STK Query); TIMEOUT ≠ FAILED and blocks duplicate pushes; 120 s initial placeholder | v-payment, x-merchant-payment |
| 53 | OTP throttling (per phone/account and per IP/device) | v-auth-phone, v-auth-otp |
| 54 | Refund payout recorded manually for MVP; **customers can see their refund status**; M-Pesa B2C/reversal later | §11, v-task-detail |
| 55 | An admin rejecting a price change only rejects it; the task continues | v-price-auth |
| 56 | System design §3.3 updated to the decided state machine | §6, `docs/design/Nitume_System_Design.md` §3.3 |
| 58 | Keep AppScope + ChangeNotifier for MVP. Clarified 2026-10-08: Riverpod later, on its own branch after this stack merges | (builders only) |
| 60 | Task creation and saved addresses need a picked place with coordinates; text-only addresses are never accepted | §10, v-new-details, x-address-form |
| 61 | `merchant_route_required` on price-change approval: the customer chooses an available route inside the modal | v-price-auth |
| 63 | Placeholders approved as initial configurable values (24 h dispute window, 4 h / 72 h urgency, 120 s STK timeout, scrim) | §2, v-payment |
| 65 | Errand and tracking visibility limited to the current runner assignment (API rule) | §10, v-track |
| 62, 94 | Schema approved and closed: `refund_reviews` (several per errand, row 71) and `payments.priceChangeRequestId` | §11 |
| 66 | System design §2.2/§6 updated (2026-10-09): send-to-runner is platform-mediated, the customer pays Nitume, and Nitume pays the runner through the payout ledger (was SQ-7) | §8.2, x-merchant-payment |
| 67 | A `merchant_direct` price increase is paid **manually** by the customer to the same Till/Paybill; Nitume never STK-pushes to a merchant (was SQ-8) | §8.2, v-price-auth, x-merchant-payment |
| 68 | After `quote_expired` the customer taps `Request a new quote`; the task is then available for an admin to re-quote (was SQ-9) | §8.3, x-awaiting-quote |
| 69 | The admin's refund decision note is never shown to the customer; the customer sees the refund outcome/status only (was SQ-10) | §11, v-task-detail |
| 72 | A quote that expires while ACCEPTED is re-quoted by an admin with the task staying ACCEPTED; the customer accepts/pays the new quote | §8.3, x-awaiting-quote |
| 76 | `send_to_runner`: one combined STK (service + runner + item); the receipt shows the item amount on its own line | §8.1, §8.2, v-payment, x-awaiting-quote |
| 79 | The dispute resolution note is shown to the customer and the runner; internal admin notes stay separate and are never shown | x-report-problem |
| 80 | Merchant amounts only for Buy For Me and Get It For Me. If the merchant details change after a merchant-direct payment started, **warn** the customer (never block) | §8.2, x-awaiting-quote, x-merchant-payment |
| 81 | A refund can include the item amount paid to Nitume, even when the runner already bought the item (admin ceiling; no customer copy change) | §11 |
| 82 | `KSh` everywhere the customer reads money, including notifications and push text (never `KES`). Refund payout receipts are never edited after `refunded` | §7, v-notifications, §11 |
| 83 | Every quote has an expiry, 24 h by default; a quote without one is not valid | §8.3, x-awaiting-quote |
| 86 | Price **decrease** refund reviews open only on `send_to_runner` tasks (Nitume never received a `merchant_direct` item amount) | §8.2, §11, v-price-auth |
| 87 | A cancellation refund's ceiling is net of refunds already approved or sent on the task; cumulative refunds never exceed what was paid | §11 |
| 88 | An admin can re-quote only after the current quote expired; a valid quote is never silently replaced | §8.3 |
| 91 | Copy approved: the payment screen shows the full M-Pesa charge with `Includes KSh … for your runner's purchase.`; the shown total equals the amount sent to the provider | §8.1, v-payment |
| 95 | `send_to_runner`: Nitume **reimburses** the runner the item amount through the payout ledger after the receipt is uploaded and accepted, never in advance (system design §6 "Runner reimbursement"). No customer copy changes: the customer still pays Nitume, never the runner | §8.2, x-merchant-payment |
| 100 | Payout corrections/reversals are separate audit records; the original receipt is immutable. The customer sees only the refund status and amount of the latest effective payout, never corrections, reasons or admin notes | §11, v-task-detail |
| 101 | Round-4 breaking API changes accepted (dispute `resolvedBy: null` for customers; no `payoutReference` in the customer refund view; price changes outside Buy For Me / Get It For Me answer 400). The app was updated in round 4 | (no change) |
| 102 | Paid tasks ending CANCELLED, EXPIRED or FAILED open a refund **review** (not an automatic refund) | §11, v-task-detail |
| owner 2026-10-16 (Needs row, round 7) | EXPIRED customer notification: explain no runner accepted in time, give the next action, no refund promise (a paid task gets a review, not a guaranteed refund). OTP messages say `Your verification code expires in 5 minutes.` (TTL 300 s unchanged) | v-notifications, v-track, v-task-detail, v-auth-otp |
| 104–108 | Runner reimbursement and payout ledger (owner 2026-10-13): reimbursement payable at CONFIRMED; missing/mismatched receipt → ops review, capped at the item amount paid to Nitume; verified item spend reimbursed on CANCELLED/FAILED without a runner fee; runner payout ledger table approved; purchases limited by `max_purchase_advance`. No customer copy changes: the customer never sees the runner's payouts | (none) |
| 109 | Only a **re-sent** refund payout notifies the customer; payout corrections and reversals do not by default (was AQ-9) | §11, v-notifications |
| 110 | A payout correction never records an amount above the refund ceiling (admin rule, was AQ-10) | (none) |
| 111 | A reversed, not-yet-re-sent payout stays committed at the decided amount (shown as `Refund approved`) | §11 |
| Needs 40 | Empty-title-safe `NitumeTopBar` approved | C-09, v-home |
| Needs 41 | x-merchant-payment snackbar `Nothing to pay right now.` approved | x-merchant-payment |

### 0.2 Still open on the board

| Row | Topic | Customer impact |
|---|---|---|
| 57 | Local DB incident (FYI) | none |
| 64 | Git housekeeping before merging | none |
| 85 | PayHero contract to be verified against its documentation | none in the UI (STK states stay as specced) |

Row 59 (answered 2026-10-09: `.env.example` plus a setup step, `.env` out of the pubspec assets) is a builders' setup item with no screen impact.

## 1. Navigation model

- **Root tab views**: `v-home`, `v-track`, `v-history`, `v-profile`, above a 5-item bottom tab bar (C-13): Home, New task, Track, History, Profile.
- The **New task** tab item does not show a root view. It pushes `v-new-category` (the wizard) over the shell. `v-new-tab-placeholder` in the mockup is an empty dead div, not a view.
- **Pushed screens**: every other `v-*` and `x-*` screen. They cover the whole screen including the tab bar and have a back arrow (C-10).
- **Modals** (C-35 `NitumeDialog`): the price-change authorization (`v-price-auth`, OA-8) and short confirmations (log out, delete address, reject and cancel, discard draft). The mockup draws no modals; these come from OA-8 and the design-system card and button patterns.
- After a successful payment the stack resets to the shell with the **Track** tab selected for that errand (OA-21). The mockup's `jump('v-track', true)` lands on Home; that was a mockup bug.
- Signed-out stack: `v-auth-phone` → `v-auth-otp` → (`x-name-capture` if `displayName` is empty) → shell on `v-home`.

Full screen list (customer MVP):

| Id | Kind | Spec |
|---|---|---|
| v-auth-phone, v-auth-otp | pushed (signed-out) | yes |
| x-name-capture | pushed (first sign-in) | yes (not in mockup) |
| x-legal | external links, no app screen | yes |
| v-home, v-track, v-history, v-profile | root tabs | yes |
| v-new-category, v-new-details, v-new-review | pushed wizard | yes |
| x-awaiting-quote | pushed (waiting state + accept-quote / checkout state) | yes (not in mockup) |
| v-payment | pushed | yes |
| x-merchant-payment | pushed | yes (not in mockup) |
| v-price-auth | modal | yes |
| v-evidence-confirm, v-rate, v-task-detail | pushed | yes |
| x-evidence-viewer | pushed, full screen | yes (not in mockup) |
| x-report-problem | pushed | yes (not in mockup) |
| v-notifications, v-addresses, v-payment-methods | pushed | yes |
| x-address-form, x-payment-method-form | pushed | yes (not in mockup) |
| x-support | menu row → external link | yes |
| ~~x-recurring-tasks~~ | out of MVP (OA-18) | none |

## 2. Tokens (design system, exact)

| Token | Hex | Use |
|---|---|---|
| blue | `#0B2545` | text, headings, nav, avatar fill, secondary button fill, selected choice chip |
| blue-700 | `#08192F` | pressed blue |
| blue-050 | `#E9EDF3` | chip-info bg, "Default" tag bg, map loading placeholder |
| white | `#FFFFFF` | cards, tab bar, inputs, dialog surface |
| slate | `#F4F6F9` | canvas behind cards |
| slate-line | `#E2E7EF` | hairlines, card borders, unfilled stars, stepper empty segment |
| slate-600 | `#5C6B85` | muted text, section labels, field labels |
| slate-400 | `#8C97AC` | placeholders, chevrons, inactive tab, pending timeline dot, meta on the blue active card |
| green | `#04AF4D` | primary CTA fill, done timeline dot, done stepper segment, selected tile border, filled stars, focus ring, checked `.check` |
| green-050 | `#E3F8EA` | success chip bg, category icon bg, notification icon bg, STK icon bg |
| green-700 | `#038A3D` | success chip text, active tab, link buttons, pressed green |
| amber / amber-050 | `#B8860B` / `#FBF3E1` | chip-pending (including **En route**, OA-13); **new price and difference text in the price-change modal** (OA-13) |
| red / red-050 | `#C1433C` / `#FBEAE9` | chip-danger (Disputed, Failed, **Cancelled**); **unread dot**; **destructive row text**; **inline form errors** (OA-13). Nowhere else |

Radii: `r-s 8` (fields, inner boxes), `r-m 14` (cards, rows), `r-l 20` (dialog), pill `999` (all buttons per OA-11, chips).

Off-palette mockup values and their replacement token (OA-14). Never port the mockup value.

| Mockup value | Where | Replacement |
|---|---|---|
| `#5FE092` | active-card tag text | blue `#0B2545` on blue-050 `#E9EDF3` (chip-info) |
| `rgba(4,175,77,.2)` | active-card tag bg | blue-050 `#E9EDF3` (chip-info) |
| `#AEB9CC` | active-card meta text | slate-400 `#8C97AC` (≈5:1 on blue) |
| `#EAEEF4` | map placeholder bg | blue-050 `#E9EDF3` |
| `rgba(0,0,0,…)` shadows | ETA chip, runner dot | no shadow; 1px slate-line border (ETA chip), 3px white ring (runner dot) |
| 14px / 10px button radii | `.cta-fixed`, `.track-btn`, `.btn-sm` | pill 999 (OA-11) |
| slate 10px field | `.field` | white, r-s 8, slate-line border, 2px green focus (OA-12) |

**Modal scrim** (decided, row 38): blue `#0B2545` at 50% opacity, a derived tone of an existing colour (`NitumeDesignChoices.modalScrim`). Never Material's default black barrier.

**Chip text** (decided, row 33): high-contrast treatment. Success / pending / danger chips keep their tinted background and coloured 6px dot, and the label text is blue `#0B2545` (13:1 or better on every tint). Info chips are unchanged (blue on blue-050). core-ui flips `NitumeDesignChoices.chipHighContrastText` to `true`; screens change nothing.

## 3. Typography

- Fira Sans for all UI text through `Theme.of(context).textTheme` (`NitumeTypography.textTheme`).
- Fira Code only for numeric data, through `NitumeTypography.numeric(...)` or `NumText` (C-32). Never `fontFamily: 'FiraCode'` strings.
- Meta lines that combine words and numbers (`Today, 10:03 AM · Brian K.`, `Brian K. is en route · ETA 12 min`) follow the design-system `.li-meta` pattern: the whole line is Fira Code.

| Role | Size / weight | Font |
|---|---|---|
| Root top-bar title | 21 / 700 | Sans |
| Pushed header title | 18 / 700 | Sans |
| Auth heading | 22 / 700 | Sans |
| Dialog title | 17 / 600 (design-system `.t-h3`) | Sans |
| Card title | 15.5–16 / 600 | Sans |
| Row title | 13–13.5 / 600 | Sans |
| Body / muted | 12.5–13.5 / 400, slate-600 | Sans |
| Section label | 11.5 / 700, uppercase, letter-spacing 0.05em, slate-600 | Sans |
| Field label | 12.5 / 600, slate-600 (design-system `.field-label`, OA-12). The mockup's uppercase 11/700 label is kept only as the form-card heading | Sans |
| Inline error | 12.5 / 400, red | Sans |
| Chip text | 12 / 600, blue on the tone tint (row 33) | Sans |
| Big amount | 20–30 / 600 | Code |
| Meta / time / countdown | 11–12.5 / 400–600, slate-600 | Code |

## 4. Shared components

Status: **built** = exists on `feat/core-customer-widgets` (class named); **change** = built but must change because of an owner answer; **NEW** = needs `core-ui`.

| Id | Component | Design-system pattern | Status |
|---|---|---|---|
| C-01 | Primary button (green fill, white text, 600 14.5, pill) | `.btn-primary` | built `NitumeButton.primary` |
| C-02 | Secondary button (blue fill, white text, pill) | `.btn-secondary` | built `NitumeButton.secondary` |
| C-03 | Outline button + small variant (12/700, padding 11) | `.btn-outline` | built `NitumeButton.outline` (`NitumeButtonSize.small`) |
| C-04 | Text button / green-700 link | `.btn-text` | built `NitumeButton.text`, `NitumeButton.link` |
| C-05 | Status chip (pill, 12/600, 6px dot) | `.chip-*` | built `StatusChip`. En route = pending (amber), Cancelled = danger (red) per OA-13. **change**: high-contrast label text (row 33, §2) |
| C-06 | Status presentation map (ErrandStatus → label + tone, §6) | — | built `statusPresentation`. **change**: tones per §6 |
| C-07 | Card (white, slate-line, r-m 14, padding 16; dashed variant) | `.card-demo` | built `NitumeCard` |
| C-08 | Section label | — | built `SectionLabel` |
| C-09 | Root top bar | — | built `NitumeTopBar`. **change** (approved, BOARD Needs row 40): an empty `title` renders no title line and no empty semantics node |
| C-10 | Pushed header (back 32 visual / 48 hit, title 18/700, Fira Code step counter) | — | built `NitumePushedHeader` |
| C-11 | Notification bell + 7px unread dot (red, 1.5px white ring, OA-13) | — | built `NotificationBell`. **change**: `unreadDot` → red |
| C-12 | Initials avatar (36 / 60 / 70) from `displayName`; person glyph when there is no name | — | built `InitialsAvatar` |
| C-13 | Bottom tab bar | — | built `NitumeTabBar` |
| C-14 | Wizard stepper | — | built `StepProgressBar` |
| C-15 | Category tile + 3-column grid | — | built `CategoryTile`, `CategoryGrid`. **change**: grid renders the **five MVP categories** (no Business Tasks, OA-18); needs a core list such as `ErrandCategory.customerMvp` so the enum keeps `business` for the API |
| C-16 | Choice chip (pill; selected = blue fill, white text) + radio-row variant with optional subtitle | extension of `.chip` | built `NitumeChoiceChip`. Radio-row variant **NEW** (used for the payment route) |
| C-17 | Form field (label + white r-s 8 input, 2px green focus, red inline error; multiline, money, phone variants) and form card | `.field-label` + `.field-input` | built `NitumeField`, `NitumeFormCard` |
| C-18 | Receipt card + rows (Fira Code amounts; total row with hairline; dashed variant) | — | built `ReceiptCard`, `ReceiptRow`. **change**: needs an "estimate" caption slot and a separate "paid separately" group (§8) |
| C-19 | Status timeline | — | built `StatusTimeline` |
| C-20 | Active task hero card | — | built `ActiveTaskCard` (tag = chip-info, meta slate-400, OA-14) |
| C-21 | Runner summary tile | design-system runner card | built `RunnerSummaryTile`. Name = API short name as returned (§7, row 40) |
| C-22 | Compact task row | `.list-item` | built `TaskRow` |
| C-23 | Task history card | `.list-item` | built `TaskHistoryCard` |
| C-24 | Menu row (+ destructive: red text, slate-400 chevron, OA-13) | — | built `MenuRow`. **change**: `destructiveText` → red |
| C-25 | Evidence grid + viewer | — | built `EvidenceGrid`, `EvidenceViewer`. Photos only for MVP: video is deferred (row 32), a video item shows the "not supported yet" tile (x-evidence-viewer). Signed short-lived URLs (row 25): re-fetch once when a link has expired |
| C-26 | OTP code field | — | built `OtpCodeField` |
| C-27 | Star rating input | — | built `StarRatingInput` |
| C-28 | Notification row (+ unread: red 7px dot before the time, title 700) | — | built `NotificationRow`. **change**: unread styling |
| C-29 | Saved address card + "Default" tag | chip-info | built `SavedAddressCard` |
| C-30 | Payment method card (M-Pesa badge only, OA-10) | — | built `PaymentMethodCard`. **change**: drop the blue card badge variant |
| C-31 | Live tracking map + ETA chip | — | built `LiveTrackingMap`, `EtaChip`. **change**: Google Maps body (`google_maps_flutter`, row 30) passed through `mapBuilder`, markers + route + animated runner marker; the token-only placeholder stays for builds without a maps key |
| C-32 | `formatKes`, `NumText` and other formatters | `.t-num` | built (`formatters.dart`, `NumText`) |
| C-33 | Empty / error / skeleton states | — | built `NitumeEmptyState`, `NitumeErrorState`, `SkeletonCard` |
| C-34 | Search entry row | — | built `SearchEntryRow` |
| — | Wordmark, pulsing dots, Places field | — | built `NitumeWordmark`, `PulsingDots`, `PlaceAutocompleteField` |
| C-35 | `NitumeDialog`: modal card (white, r-l 20, padding 20, max width 335) over the scrim (§2); title 17/600, body 13.5 slate-600, full-width button stack (gap 10); `barrierDismissible` flag | `.card-demo` + `.btn-*` | built (scrim decided, row 38) |
| C-36 | Checkbox (22px, r 6, 2px slate-line border; checked = green fill + white check) | `.check` | **NEW** |
| C-37 | Shopping-list editor: item rows (name field, Fira Code quantity stepper − / n / +, remove icon), `+ Add item` link | `.list-item` + C-17 | **NEW** |
| C-38 | Resend countdown (`Resend code in 0:59`, Fira Code for the time) that turns into a C-04 link at zero | — | **NEW** |
| C-39 | Copyable value row (label 12.5 slate-600; value Fira Code 16/600; trailing `Copy` text button; copies to clipboard and shows snackbar `Copied`) | — | **NEW** |
| C-40 | Inline notice (white card, slate-line border, r-m 14, 13 slate-600 text, optional leading info icon in slate-600; no coloured fill) | `.card-demo` | **NEW** |

Non-UI core (built): repositories, models, `RealtimeClient` interface + `RealtimeEvents`, `PlaceSearchService` interface, `AppConfig.termsUri` / `privacyUri` / `supportUri`.

Now approved and still to build (see §10 and the 2026-10-08 addendum in `docs/audits/customer-gap-report.md`):
- `RealtimeClient` implementation on `socket_io_client` (row 29) with the approved event names (row 23).
- `PlaceSearchService` on Google Places Autocomplete + Place Details, and the Google Maps `mapBuilder` body for C-31 (row 30), both configured per environment (API key), both absent-safe.
- FCM push: token registration after login, removal on logout, token refresh, deep-link routing (row 31).
- Link opening through `url_launcher` with the `AppConfig` URIs (row 39).
- `AppConfig.quotePreviewEnabled` (default `false`) so the wizard estimate stays hidden until pricing rates exist (row 47, §8.3).

## 5. Layout constants

- Horizontal screen padding 20. Card gap 10–14. Section label padding `6 20 10`.
- Pushed header padding `10 20 14`; back button 32px visual, **48px hit area**.
- Fixed bottom CTA: margin `auto 20 6`, full width minus 40, padding 15 vertical, pill, above the bottom safe area.
- Status bar: `SafeArea` (the mockup's 44px fake status bar is not ported).
- Tap targets ≥ 48×48 dp (bell 36, back 32, chips ~32, stars 30 and stepper buttons 32 are visually smaller; pad their hit areas).

## 6. Errand state → customer label (authoritative, OA-20)

State machine: `docs/design/Nitume_System_Design.md` §3.3, updated 2026-10-08 to the owner decisions (row 56: OA-9, rows 35–37, 49). Customer-fired transitions: DRAFT → REQUESTED / CANCELLED; REQUESTED, QUOTED, ACCEPTED → CANCELLED; QUOTED → ACCEPTED; IN_PROGRESS → DISPUTED; IN_PROGRESS → CANCELLED (only through a price-change reject); AWAITING_CUSTOMER → COMPLETED / DISPUTED; COMPLETED → DISPUTED (within the dispute window). Everything else is runner, admin or system. The UI never invents or skips states and renders whatever state the API returns. Labels are fixed by OA-20; tones follow OA-13.

| State | Label | Tone |
|---|---|---|
| DRAFT | Draft | info |
| REQUESTED | Awaiting quote | pending |
| QUOTED | Quote ready | pending |
| ACCEPTED | Awaiting payment | pending |
| PAYMENT_CONFIRMED | Finding a runner | info |
| RUNNER_ASSIGNED | Runner assigned | info |
| RUNNER_EN_ROUTE | En route | **pending (amber), OA-13** |
| ARRIVED | Arrived | info |
| IN_PROGRESS | In progress | info |
| AWAITING_CUSTOMER | Needs your review | pending |
| COMPLETED | Completed | success |
| CONFIRMED | **Completed** | success. System-only state (row 35 answered): the customer never sees the word "Confirmed" |
| SETTLED | Completed | success (system-only, row 35 answered) |
| CANCELLED | Cancelled | **danger (red), OA-13** |
| FAILED | Failed | danger |
| EXPIRED | Expired | info (not drawn). Reached when no eligible runner accepted in time (rows 141, 150, 155; row 157 open for admin offers). Next action `Start a new task` (`v-track`, `v-task-detail`); the customer is told by the `errand.EXPIRED` notification (`v-notifications.md`, owner 2026-10-16) |
| DISPUTED | Disputed | danger |

"Active" set (Home "In progress", Track): REQUESTED, QUOTED, ACCEPTED, PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER.
"Finished" set (Home "Recent", History): COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED, DISPUTED.
DRAFT errands are never listed (the wizard creates and submits in one step, see v-new-review).

## 7. Copy and naming rules

- **Categories** (OA-1): display names only, in this order (AGENTS.md mapping, confirmed by row 1):

  | Display name | Wire value | Customer MVP |
  |---|---|---|
  | Buy For Me | `buy_for_me` | yes |
  | Get It For Me | `pickup_delivery` | yes |
  | Check It For Me | `inspection` | yes |
  | Go There For Me | `representation` | yes |
  | Wait For Me | `queue_admin` | yes |
  | Business Tasks | `business` | **no, out of MVP (OA-18); never offered in the customer app**. If an API errand ever has `business`, lists label it "Business Tasks" |

- **Names** (OA-2): the customer name is `displayName` from `GET /users/me`. The greeting uses the first word; Profile shows the full name. Runner names display as first name + last initial (`Brian K.`), as drawn in the mockup. **The API computes the short name (row 40)**: the client renders the runner's short-name field exactly as returned and never shortens a full name itself (the core `shortName()` helper is not used for runner names). With no short name, show `Your runner`; never show a phone number as a name.
- **Task title** (OA-15, row 41): show `title` when set. Otherwise show the **category display name** (e.g. `Check It For Me`). The earlier `<category> — <locality>` rule is withdrawn. If the API ever stores the fallback as `title`, the result is the same; the client never composes a title from addresses.
- **Task reference** (OA-15): `#` + `reference` exactly as returned by the API (e.g. `#NT-10482`). Same format everywhere: the mockup's `#10482` on Home vs `#NT-10482` on Task detail is unified. Never derived client-side; hidden when null.
- **No wallet or escrow words**: "balance", "hold", "release", "release payment", "escrow", "wallet" and "funds held" are banned (OA-6).
- **Money**: `KSh 2,200` (space, thousands comma, no decimals unless non-zero), Fira Code (`formatKes`). **`KSh` everywhere the customer reads an amount (row 82)**, including notification rows and push text written by the API; `KES` is a wire/currency code only and never appears in UI copy.
- **Times**: `10:03 AM`, `Today, 10:03 AM`, `Yesterday, 4:12 PM`, `Mon, 10:03 AM`; relative `2m`, `1h`, `Yesterday`, `Mon` in notifications. Fira Code.
- **Generic errors**: network `Check your connection and try again.`; unknown `Something went wrong. Please try again.`; session expired → back to `v-auth-phone` with snackbar `Please sign in again.`
- **Suspended or banned account**: at sign-in, `v-auth-otp` shows `This account can't sign in. Contact support.` (+ Support link when configured). If a signed-in session is refused with the same code (API `account_suspended`, on refresh or any call), clear the session, unregister the push token, reset to `v-auth-phone` and show the same sentence as a snackbar (proposed). Never show the reason or any internal note.
- Copy marked **(proposed)** in a spec was written by the auditor for undrawn states or screens. Build it as written; the owner may revise it later.

## 8. Fees and payment flows (OA-4, OA-5, OA-21, rows 34 and 42–49)

The three flows stay separate (§6 of the system design): service fee, runner fee, merchant/item amount.

### 8.1 What the customer sees

- **Fee line (row 34, clarified 2026-10-08)**: one row, `Total (service + runner fee)`, with the API's fee total. `Service fee` and `Runner fee` lines are **not shown** until pricing rates exist (row 47). The client never renders `serviceFee` / `runnerFee` from a payment or quote record as separate lines, and never computes a split. When the owner confirms pricing rates, a later spec change brings the two lines back.
- On the wizard estimate only (when shown at all, §8.3) the row reads `Estimated total (service + runner fee)`.
- The **item amount** (merchant/item purchase) is shown separately, under a hairline, and never added into the fee total.
- The API's internal commission split (20% / 30%) and the quote components (base, distance, time, urgency, complexity, premium) are never shown (OA-4).
- The fee STK push amount = the fee total, **plus the item amount when the route is `send_to_runner`: one combined STK** (row 76, owner 2026-10-08; spec updated in the 2026-10-09 re-audit). The receipt still shows the item amount on its own line, never inside `Total (service + runner fee)`. The payment screen shows the combined amount with the line `Includes KSh 40,000 for your runner's purchase.` (amount in Fira Code; **wording approved, row 91**). The amount shown must equal the amount sent to the payment provider.

### 8.2 Merchant/item amount routes (OA-5, rows 42–44, 48, 49, 61)

Wire values (`merchantRoute` on `POST /payments/:errandId/initiate`, core `MerchantRoute`): `merchant_direct` and `send_to_runner` (ledger flow `customer_to_runner`). No purchase → no route choice (`platform_only` flow). `runner_advance` is never a customer option.

**Which tasks carry an item amount (row 80)**: Buy For Me and Get It For Me only. Other categories never show an item amount, a route choice or merchant details.

| Route | Customer label (checkout) | How the item amount is paid | Customer screen |
|---|---|---|---|
| `merchant_direct` | `Pay merchant directly (recommended)` | The customer pays the merchant's Till/Paybill from their own M-Pesa, after the fees are paid. Nitume does not collect it, and never STK-pushes to a merchant (row 67) | `x-merchant-payment` variant A |
| `send_to_runner` | `Send purchase amount to runner` | **Platform-mediated (row 42)**: the customer pays the item amount **to Nitume in the same M-Pesa STK as the fees** (one combined charge, (row 76, owner 2026-10-08; spec updated in the 2026-10-09 re-audit)). Nitume then reimburses the runner through the payout ledger once the purchase receipt is accepted, never in advance (rows 66, 95, system design §6); the customer app says nothing about the runner's reimbursement. An approved price-change increase on this route is a separate STK for the difference (`x-merchant-payment` variant B). No runner phone number is ever shown for paying, and the app never offers a direct transfer to the runner | `x-merchant-payment` variant B |

**Merchant details (row 43)**: the merchant or an admin supplies the Till/Paybill details; the customer never types them. Two customer states:
- **Details pending** (none on the errand): at checkout `merchant_direct` is disabled with subtitle `Available once the merchant's details are added.`; `x-merchant-payment` variant A shows the notice `The merchant's details aren't available yet. We'll notify you when they are.`
- **Details available**: `merchant_direct` is selectable at checkout; the Till/Paybill number is shown only on `x-merchant-payment` after the fees are paid (OA-5).
- **Details changed after a merchant-direct payment started** (row 80): the change is allowed; the customer is **warned**, never blocked. "Started" = the fees are paid on the `merchant_direct` route (the customer can see the Till/Paybill). `x-merchant-payment` variant A shows the change notice, and a notification tells the customer (see `x-merchant-payment`, `v-notifications`).

**Price changes** (rows 44, 48, 49, 55, 61):
- Runners can request a price change **only in IN_PROGRESS** (row 49). The customer sees the modal (`v-price-auth`) only for IN_PROGRESS errands. No new transitions.
- **Increase**: the difference is paid through the **same route as the original item payment** (row 44): `merchant_direct` → the customer pays the extra **manually** to the same Till/Paybill from their own M-Pesa, no STK (row 67; `x-merchant-payment` A shows the new amount); `send_to_runner` → a new STK push to Nitume for the difference (`x-merchant-payment` B). If the original route is unavailable (no item payment so far, so `merchant_route_required`, or merchant details now missing), the customer **explicitly chooses** an available route inside the modal (row 61). The app never picks a route for the customer.
- **Decrease** (row 48 clarification, row 86): approving it lowers the item amount. On `send_to_runner` (Nitume received the item amount) the difference goes to an **admin refund review**; the customer follows it on `v-task-detail` (§11). On `merchant_direct` no refund review opens (Nitume never received that money): the customer pays the merchant the new, lower amount shown on `x-merchant-payment` A, and the snackbar is the plain `Price change approved.`
- **Reject** = `Reject & cancel task`: IN_PROGRESS → CANCELLED (customer, guarded, row 37), and an admin refund review of what was paid (§11).
- An admin who rejects a request only rejects it; the task continues (row 55). An open modal shows the already-answered state.

### 8.3 Quotes (OA-3, rows 46, 47)

- **Preview (row 47)**: the wizard estimate is non-authoritative and is **not shown until pricing rates exist**. `AppConfig.quotePreviewEnabled` (default `false`) gates it; while false, `v-new-review` makes no preview call and shows no price.
- **Authoritative quote**: admin-generated; REQUESTED → QUOTED → ACCEPTED.
- **Every quote has an expiry (row 83)**: 24 h by default, set by the admin. The checkout always shows `Valid until …`. A quote without `expiresAt` is invalid data; the app hides the caption and treats the quote as valid until the API says `quote_expired`.
- **Expiry (row 46)**: an expired quote cannot be accepted or paid. The API answers accept (or fee initiation) with code `quote_expired`. The errand stays QUOTED, or ACCEPTED (row 72), with no new transition.
- **Fresh quote (row 68)**: on an expired quote the customer taps `Request a new quote`. The task is then available for an admin to re-quote; the screen shows the "new quote requested" waiting state until the new quote arrives (`x-awaiting-quote`). An admin can re-quote only after expiry (row 88), so a valid quote is never replaced under the customer. A new quote on an ACCEPTED task must be accepted/paid again before anything proceeds (row 72).

## 9. Shared questions

SQ-1 … SQ-6 are answered (rows 38–43). SQ-7 … SQ-10 are answered (2026-10-09):

- SQ-7 → row 66: system design §2.2/§6 updated; send-to-runner is platform-mediated and Nitume pays the runner through the payout ledger.
- SQ-8 → row 67: a `merchant_direct` increase is paid manually by the customer to the same Till/Paybill.
- SQ-9 → row 68: `Request a new quote`, then an admin re-quotes.
- SQ-10 → row 69: the admin's refund decision note is never shown to the customer.

No shared question is open. Screen-level questions stay in each spec.

## 10. Live data, push and places (rows 23, 25, 27, 29–31, 60, 65)

- **Socket (rows 23, 29)**: one app-wide `RealtimeClient` on `socket_io_client`, authenticated with the access token (`auth: { token }`). Screens join `errand:{id}` with `errand:join` and leave with `errand:leave`. Events: `errand:status_changed`, `evidence:uploaded`, `price_change:requested`, `location:update` `{ lat, lng, eta }`. Event names only through core `RealtimeEvents`.
- **Polling is a fallback only** while the socket is disconnected (the screen shows `Reconnecting…` where specced). The intervals in each spec apply only then. On reconnect, re-join rooms and refetch the snapshot once.
- **Runner location (rows 27, 65)**: shown only while the errand is RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS and only for the current assignment. When the errand leaves that window (AWAITING_CUSTOMER or any terminal state), when the runner is reassigned, or when tracking answers 403/404, remove the runner marker and ETA at once and do not keep or show the last position. The client never stores location history.
- **Maps (row 30)**: `google_maps_flutter` through `LiveTrackingMap(mapBuilder:)`; animate the marker only between pings (§5). Without a maps key (dev builds) the token-only placeholder body stays.
- **Places (rows 30, 60)**: Google Places Autocomplete + Place Details through `PlaceSearchService` (debounce 300 ms, session token). Every task location and every saved address must be **a picked place (or a saved address) with `lat`/`lng`**; free text is never accepted or sent. Without a Places key the field is read-only and only saved addresses with coordinates can be chosen (existing fallback notice).
- **Push (row 31)**: after every successful sign-in (and after `x-name-capture` when it runs) register the FCM token with `POST /users/me/devices`; re-register when the token refreshes; on log out call `DELETE /users/me/devices/:id` (best effort, before clearing tokens). Notification taps deep-link per the `v-notifications` table. Push permission is asked once after sign-in; refusing it changes nothing else.
- **Evidence links (row 25)**: short-lived signed URLs; on an expired link, re-fetch the evidence list once, then show the item's load-failure state.

## 11. Refund status (rows 37, 48, 54, 69, 81, 82, 86, 87, 100, 102; schema approved, rows 62/94)

The customer can see the status of any refund review on their task (row 54). Shown on `v-task-detail` (Payment section) only; nowhere else lists refunds. Payout is recorded manually by an admin for MVP; M-Pesa B2C/reversal comes later and does not change this UI.

Opened by: price-change reject (IN_PROGRESS → CANCELLED), a customer-favourable dispute (DISPUTED → CANCELLED), any other cancellation after payment (including a payment that completes after cancellation), a **paid task that expires** (RUNNER_ASSIGNED → EXPIRED, no runner accepted in time) or **fails** (RUNNER_EN_ROUTE → FAILED) (row 102), and an approved price **decrease on a `send_to_runner` task only** (rows 48, 86). Row 102: these open a **review**, not an automatic refund, so no copy may promise money back before an admin decides.

The refund amount is decided by an admin. Its ceiling (admin-side, not shown to the customer) is what the customer paid to Nitume, including an item amount paid to Nitume (row 81), net of refunds already approved or sent on the same task (row 87). So a task can show a decrease refund and later a cancellation refund, and the second is never larger than what is left.

| API refund status | Chip (C-05) | Tone | Line under it (13 slate-600, proposed) | Amount row |
|---|---|---|---|---|
| `pending_review` | `Refund under review` | pending | By trigger (row 102): `expired_after_payment` → `We couldn't find a runner for this task in time. We're reviewing a refund and will let you know the outcome.`; `failed_after_payment` → `This task couldn't be completed. We're reviewing a refund and will let you know the outcome.`; any other or unknown trigger → `We're reviewing a refund for this task. We'll let you know the outcome.` | none |
| `approved` | `Refund approved` | info | `We'll send you this refund and update this page when it's sent.` | `Refund amount` + amount (Fira Code) |
| `refunded` | `Refunded` | success | `Sent <date, time>` (date/time Fira Code) | `Refund amount` + amount |
| `no_refund` | `No refund` | info | `After review, no refund is due for this task.` | none |

Never shown: the admin's refund decision note (row 69, decided: internal only), the payout reference, and any wording such as "balance", "wallet", "held" or "release" (OA-6). A sent refund is final on this screen: receipts are never edited after `refunded` (row 82). Ops may add a correction or reversal record (row 100); the customer never sees those records, their reasons or the admin. The API's customer view already reflects the **latest effective payout**: a corrected amount shows as the new `Refund amount`; a reversed payout not yet re-sent comes back as `approved` (`Refund approved` and its line); a new payout comes back as `refunded` with the new sent time. The app just renders `status` / `refundAmount` / `paidAt` as above; it has no correction-specific UI. Notifications (decided, owner 2026-10-13, row 109): only a re-sent payout notifies, as `Refund sent`; corrections and reversals notify nothing by default. A reversed payout not yet re-sent stays committed at the approved amount (row 111), which is why it shows as `Refund approved` with that amount.

Not to be confused with the **dispute resolution note**, which the customer does see (row 79) on `x-report-problem` read mode (`Outcome`).
