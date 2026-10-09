# Customer app — shared spec conventions

Applies to every `docs/specs/customer/*.md`. Each view spec references the component ids (`C-xx`), owner answers (`OA-n`) and rules below instead of repeating them.

Sources (real paths):
- Mockup: `docs/design/nitume_customer_app.html`
- Design system: `docs/design/nitume_design_system.html`
- System design: `docs/design/Nitume_System_Design.md` (identical copy at `docs/Nitume_System_Design.md`)
- Owner answers: `docs/audits/customer-gap-report.md` → "Questions for the owner (consolidated)", answers 1–21 (summarised on `docs/agent-sync/BOARD.md` rows 2–22)
- Implementation: `apps/customer_app/lib/src/**`; shared package `packages/nitume_core/lib/src/**`
- Shared widgets and data layer: built by core-ui on branch `feat/core-customer-widgets` (not yet on `main`)
- API additions: built by api-contract on branch `feat/api-customer-gaps` (not yet on `main`)

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

Still **open** on the board. Specs reference these as "pending row N" and never decide them:

| Row | Topic | Customer impact |
|---|---|---|
| 1 | ERD enum ↔ display-name mapping (AGENTS.md mapping in use, pending confirmation) | Wire values in §7 |
| 23 | Socket event names (`errand:join`, `errand:status_changed`, `evidence:uploaded`, `price_change:requested`) | Use names only through core `RealtimeEvents` constants so a rename is one line |
| 24 | Payment idempotency key mechanism | v-payment safe retry |
| 25 | Evidence view links (signed URLs, TTL) | C-25, x-evidence-viewer |
| 26 | BullMQ for notifications | Push latency only; no UI change |
| 27 | Runner location privacy window | v-track map visibility |
| 28 | `GET /errands/:id/rating` access check | v-rate (API fix only) |
| 29 | `socket_io_client` package | Live updates; polling fallback until approved |
| 30 | `google_maps_flutter` + Places client (API key) | v-track map; v-new-details and x-address-form autocomplete |
| 31 | `firebase_messaging` (FCM) | Push deep links |
| 32 | Video player package | x-evidence-viewer video |
| 33 | Chip text contrast (WCAG AA at 12px) | C-05 text colour |
| 34 | Which quote components make up "Service fee" vs "Runner fee" | Every fee line (§8) |
| 35 | Keep or remove CONFIRMED / SETTLED | Labels exist in §6; no customer screen depends on them |
| 36 | Dispute resolution target state | x-report-problem and v-task-detail render whatever state follows |
| 37 | Refunds on cancel after payment; which active states reach CANCELLED | v-price-auth reject outcome; cancel copy |

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

**Modal scrim**: the design system has no token for it, and C-35 needs one. Proposed `NitumeColors.scrim` = blue `#0B2545` at 50% opacity, a derived tone of an existing colour. Pending owner approval (SQ-1, §9). core-ui must not ship Material's default black barrier.

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
| Chip text | 12 / 600 | Sans |
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
| C-05 | Status chip (pill, 12/600, 6px dot) | `.chip-*` | built `StatusChip`. **change**: En route = pending (amber), Cancelled = danger (red) per OA-13 (`NitumeDesignChoices.runnerProgressTone` must apply to RUNNER_EN_ROUTE only; `cancelledTone` → danger). Text colour pending row 33 |
| C-06 | Status presentation map (ErrandStatus → label + tone, §6) | — | built `statusPresentation`. **change**: tones per §6 |
| C-07 | Card (white, slate-line, r-m 14, padding 16; dashed variant) | `.card-demo` | built `NitumeCard` |
| C-08 | Section label | — | built `SectionLabel` |
| C-09 | Root top bar | — | built `NitumeTopBar` |
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
| C-21 | Runner summary tile | design-system runner card | built `RunnerSummaryTile` |
| C-22 | Compact task row | `.list-item` | built `TaskRow` |
| C-23 | Task history card | `.list-item` | built `TaskHistoryCard` |
| C-24 | Menu row (+ destructive: red text, slate-400 chevron, OA-13) | — | built `MenuRow`. **change**: `destructiveText` → red |
| C-25 | Evidence grid + viewer | — | built `EvidenceGrid`, `EvidenceViewer` (no video playback: pending row 32; URLs pending row 25) |
| C-26 | OTP code field | — | built `OtpCodeField` |
| C-27 | Star rating input | — | built `StarRatingInput` |
| C-28 | Notification row (+ unread: red 7px dot before the time, title 700) | — | built `NotificationRow`. **change**: unread styling |
| C-29 | Saved address card + "Default" tag | chip-info | built `SavedAddressCard` |
| C-30 | Payment method card (M-Pesa badge only, OA-10) | — | built `PaymentMethodCard`. **change**: drop the blue card badge variant |
| C-31 | Live tracking map + ETA chip | — | built `LiveTrackingMap`, `EtaChip` (map SDK pending row 30) |
| C-32 | `formatKes`, `NumText` and other formatters | `.t-num` | built (`formatters.dart`, `NumText`) |
| C-33 | Empty / error / skeleton states | — | built `NitumeEmptyState`, `NitumeErrorState`, `SkeletonCard` |
| C-34 | Search entry row | — | built `SearchEntryRow` |
| — | Wordmark, pulsing dots, Places field | — | built `NitumeWordmark`, `PulsingDots`, `PlaceAutocompleteField` |
| C-35 | `NitumeDialog`: modal card (white, r-l 20, padding 20, max width 335) over the scrim (§2); title 17/600, body 13.5 slate-600, full-width button stack (gap 10); `barrierDismissible` flag | `.card-demo` + `.btn-*` | **NEW** (scrim token pending SQ-1) |
| C-36 | Checkbox (22px, r 6, 2px slate-line border; checked = green fill + white check) | `.check` | **NEW** |
| C-37 | Shopping-list editor: item rows (name field, Fira Code quantity stepper − / n / +, remove icon), `+ Add item` link | `.list-item` + C-17 | **NEW** |
| C-38 | Resend countdown (`Resend code in 0:59`, Fira Code for the time) that turns into a C-04 link at zero | — | **NEW** |
| C-39 | Copyable value row (label 12.5 slate-600; value Fira Code 16/600; trailing `Copy` text button; copies to clipboard and shows snackbar `Copied`) | — | **NEW** |
| C-40 | Inline notice (white card, slate-line border, r-m 14, 13 slate-600 text, optional leading info icon in slate-600; no coloured fill) | `.card-demo` | **NEW** |

Non-UI core (built on `feat/core-customer-widgets`): repositories, models, `RealtimeClient` interface + `RealtimeEvents`, `PlaceSearchService` interface. Still needed: the `RealtimeClient` implementation (pending row 29), FCM (pending row 31), `AppConfig` values for the Support, Terms and Privacy URIs (x-support, x-legal), and `url_launcher` (a new package that needs owner approval: SQ-2).

## 5. Layout constants

- Horizontal screen padding 20. Card gap 10–14. Section label padding `6 20 10`.
- Pushed header padding `10 20 14`; back button 32px visual, **48px hit area**.
- Fixed bottom CTA: margin `auto 20 6`, full width minus 40, padding 15 vertical, pill, above the bottom safe area.
- Status bar: `SafeArea` (the mockup's 44px fake status bar is not ported).
- Tap targets ≥ 48×48 dp (bell 36, back 32, chips ~32, stars 30 and stepper buttons 32 are visually smaller; pad their hit areas).

## 6. Errand state → customer label (authoritative, OA-20)

State machine: `Nitume_System_Design.md` §3.3 plus the approved API transitions (OA-9). The UI never invents or skips states and renders whatever state the API returns. Labels are fixed by OA-20; tones follow OA-13.

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
| CONFIRMED | Confirmed | success. The state may be removed or become system-only (pending row 35); no customer screen depends on it |
| SETTLED | Completed | success (same note, pending row 35) |
| CANCELLED | Cancelled | **danger (red), OA-13** |
| FAILED | Failed | danger |
| EXPIRED | Expired | info (not drawn; nothing for the customer to act on) |
| DISPUTED | Disputed | danger |

"Active" set (Home "In progress", Track): REQUESTED, QUOTED, ACCEPTED, PAYMENT_CONFIRMED, RUNNER_ASSIGNED, RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER.
"Finished" set (Home "Recent", History): COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED, DISPUTED.
DRAFT errands are never listed (the wizard creates and submits in one step, see v-new-review).

## 7. Copy and naming rules

- **Categories** (OA-1): display names only, in this order (AGENTS.md mapping, pending row 1):

  | Display name | Wire value | Customer MVP |
  |---|---|---|
  | Buy For Me | `buy_for_me` | yes |
  | Get It For Me | `pickup_delivery` | yes |
  | Check It For Me | `inspection` | yes |
  | Go There For Me | `representation` | yes |
  | Wait For Me | `queue_admin` | yes |
  | Business Tasks | `business` | **no, out of MVP (OA-18); never offered in the customer app**. If an API errand ever has `business`, lists label it "Business Tasks" |

- **Names** (OA-2): the customer name is `displayName` from `GET /users/me`. The greeting uses the first word; Profile shows the full name. Runner names display as first name + last initial (`Brian K.`), as drawn in the mockup, formatted by a core `shortName(displayName)` helper; whether the API already returns the short form is SQ-3. With no name, fall back as each spec states; never show a phone number as a name.
- **Task title** (OA-15): show `title` when set. Otherwise show `<category display name> — <first locality>`, where locality is the first comma-separated part of the first location's `addressText` (e.g. `Check It For Me — Links Road Apartments`). This fallback is a display rule only; nothing is stored (SQ-4).
- **Task reference** (OA-15): `#` + `reference` exactly as returned by the API (e.g. `#NT-10482`). Same format everywhere: the mockup's `#10482` on Home vs `#NT-10482` on Task detail is unified. Never derived client-side; hidden when null.
- **No wallet or escrow words**: "balance", "hold", "release", "release payment", "escrow", "wallet" and "funds held" are banned (OA-6).
- **Money**: `KSh 2,200` (space, thousands comma, no decimals unless non-zero), Fira Code (`formatKes`).
- **Times**: `10:03 AM`, `Today, 10:03 AM`, `Yesterday, 4:12 PM`, `Mon, 10:03 AM`; relative `2m`, `1h`, `Yesterday`, `Mon` in notifications. Fira Code.
- **Generic errors**: network `Check your connection and try again.`; unknown `Something went wrong. Please try again.`; session expired → back to `v-auth-phone` with snackbar `Please sign in again.`
- Copy marked **(proposed)** in a spec was written by the auditor for undrawn states or screens. Build it as written; the owner may revise it later.

## 8. Fees and payment flows (OA-4, OA-5, OA-21)

The three flows stay separate (§6 of the system design): service fee, runner fee, merchant/item amount.

- Customer-facing lines, in this order: `Service fee`, `Runner fee`, then the total of those two, then, separated and never added into that total, the `Item amount` (merchant/item purchase) when there is one.
- **TODO (pending row 34):** which quote components (base / distance / time / urgency / complexity / premium) make up `Service fee` vs `Runner fee` is not decided. The client never computes the split. It renders `serviceFee`, `runnerFee`, `itemAmount` and `total` exactly as the API returns them (quote endpoint and payments endpoint). api-contract owns the mapping once the owner answers.
- The API's internal commission split (20% / 30% of the quote) is never shown and never added as a fee (OA-4).
- M-Pesa STK push amount = service fee + runner fee only.
- Merchant/item amount routes the customer can choose (OA-5): `merchant_direct` ("Pay the merchant directly", only offered when the errand has merchant Till/Paybill details) and `customer_to_runner` ("Send the item amount to your runner"). `runner_advance` is never offered to customers. No purchase → `platform_only`, and no route choice is shown.

## 9. Shared open questions (new, not yet on the board)

These came up while applying the answers. Each spec gives a build default so work is not blocked.

- **SQ-1 (design system / palette)**: Modal scrim colour for C-35. Proposed: blue `#0B2545` at 50% opacity. Build default: the same.
- **SQ-2 (third-party package)**: `url_launcher` for Support, Terms, Privacy and phone/WhatsApp targets. Build default: no link opens until approved; the rows are hidden.
- **SQ-3 (schema/API)**: Does the API return runner names already shortened (`Brian K.`), or the full `displayName` for the client to shorten? Build default: the client shortens.
- **SQ-4**: Fallback title when the customer leaves `title` empty. Build default: the §7 rule.
- **SQ-5 (payments)**: Send-to-runner route. How does the customer actually send the item amount: a second STK push to the platform followed by a B2C to the runner, or M-Pesa send-money to a runner number shown in the app? Build default: the route can be selected; the follow-up screen shows the pending state described in `x-merchant-payment.md`.
- **SQ-6 (payments)**: Who supplies merchant Till/Paybill details (customer in the wizard, runner on site, admin), and when do they appear on the errand? Build default: they arrive on the errand from the API; the merchant-direct option is disabled until they exist.
