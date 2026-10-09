# Customer app — shared spec conventions

Applies to every `docs/specs/customer/v-*.md`. Each view spec references the component ids (`C-xx`) and rules below instead of repeating them.

Sources (real paths):
- Mockup: `docs/design/nitume_customer_app.html`
- Design system: `docs/design/nitume_design_system.html`
- System design: `docs/design/Nitume_System_Design.md` (identical copy at `docs/Nitume_System_Design.md`)
- Implementation: `apps/customer_app/lib/src/**`; shared package `packages/nitume_core/lib/src/**`

Hierarchy (AGENT_BUILD_INSTRUCTIONS §1): the design system wins on styling, the mockup wins on content, copy and flow. Where the mockup CSS differs from the design system, the spec states the design-system value and records the mockup value as "mockup:".

## 1. Navigation model (from mockup JS)

- **Root tab views** (`.view`): `v-home`, `v-track`, `v-history`, `v-profile`. They sit above a 5-item bottom tab bar: Home, New task, Track, History, Profile.
- **New task** tab item does not show a root view. It pushes `v-new-category` (the wizard). `v-new-tab-placeholder` in the mockup is an empty dead div, not a view.
- **Pushed screens** (`.overlay`): every other view. They cover the whole screen including the tab bar and have a back arrow (`pop()`).
- `jump(id, true)` in the mockup always resets to `v-home`, whatever `id` is passed. So "I've paid — continue" (`jump('v-track', true)`) actually lands on Home in the mockup. The intent is clearly Track; specs follow intent (see question Q-NAV-1 in `v-payment.md`).
- No modals, bottom sheets, drawers or dialogs exist in the mockup. §4.4 of the system design calls the price-change authorization a "blocking modal"; the mockup draws it as a pushed screen (`v-price-auth`). See `v-price-auth.md`.

## 2. Tokens (design system, exact)

| Token | Hex | Use |
|---|---|---|
| blue | `#0B2545` | text, headings, nav, avatar fill, secondary button fill |
| blue-700 | `#08192F` | pressed blue |
| blue-050 | `#E9EDF3` | chip-info bg, "Default" tag bg |
| white | `#FFFFFF` | cards, tab bar, inputs |
| slate | `#F4F6F9` | canvas behind cards |
| slate-line | `#E2E7EF` | hairlines, card borders, unfilled stars, stepper empty segment |
| slate-600 | `#5C6B85` | muted text, section labels |
| slate-400 | `#8C97AC` | placeholders, chevrons, inactive tab, pending timeline dot |
| green | `#04AF4D` | primary CTA fill, done timeline dot, done stepper segment, selected tile border, filled stars, focus ring |
| green-050 | `#E3F8EA` | success chip bg, category icon bg, notification icon bg, STK icon bg |
| green-700 | `#038A3D` | success chip text, active tab, "Resend code" link, pressed green |
| amber / amber-050 | `#B8860B` / `#FBF3E1` | chip-pending only |
| red / red-050 | `#C1433C` / `#FBEAE9` | chip-danger only (see Q-RED below) |

Radii: `r-s 8`, `r-m 14`, `r-l 20`, pill `999`.

Mockup values that are **not** in the palette (must not be ported): `#5FE092` (active-card tag text), `#AEB9CC` (active-card meta text), `rgba(4,175,77,0.2)` (active-card tag bg), `#EAEEF4` (map placeholder bg), `rgba(0,0,0,…)` shadows. Replacements are given in the view specs.

## 3. Typography

- Fira Sans for all UI text, via `Theme.of(context).textTheme` (built by `NitumeTypography.textTheme`).
- Fira Code only for numeric data, via `NitumeTypography.numeric(...)`. Never via `fontFamily: 'FiraCode'` strings (that family is not registered; it silently falls back to the platform font).
- Meta lines that combine words and numbers (`Today, 10:03 AM · Brian K.`, `Brian K. is en route · ETA 12 min`) follow the design-system `.li-meta` pattern: the whole line is Fira Code.
- Scale used by the mockup (mapped to design-system steps):

| Role | Size / weight | Font |
|---|---|---|
| Root top-bar title | 21 / 700 | Sans |
| Pushed header title | 18 / 700 | Sans |
| Auth heading | 22 / 700 | Sans |
| Card title (h4/h3) | 15.5–16 / 600 | Sans |
| Row title | 13–13.5 / 600 | Sans |
| Body / muted | 12.5–13.5 / 400, slate-600 | Sans |
| Section label | 11.5 / 700, uppercase, letter-spacing 0.05em, slate-600 | Sans |
| Form label | 11 / 700, uppercase, letter-spacing 0.04em, slate-600 (design system `.field-label`: 12.5 / 600 slate-600 not uppercase; see Q-FIELD) | Sans |
| Chip text | 12 / 600 (design system) — mockup pills use 10.5 / 700 | Sans |
| Big amount | 20–30 / 600 | Code |
| Meta / time | 11–12 / 400–500, slate-600 | Code |

## 4. Shared components

Status columns: **core** = exists in `packages/nitume_core`; **app-only** = exists in `apps/customer_app` but must move to `nitume_core`; **NEW** = needs `core-ui`.

| Id | Component | Design-system pattern | Mockup class | Status |
|---|---|---|---|---|
| C-01 | Primary button (green fill, white text, 600 14.5) | `.btn-primary` | `.cta-fixed`, `.track-btn` | core via `FilledButtonTheme` — radius is 14 (mockup), design system is pill 999 (see Q-RADIUS). Needs a `NitumeButton.primary` wrapper so screens stop restyling it inline. |
| C-02 | Secondary button (blue fill, white text) | `.btn-secondary` | — | NEW (no themed blue button) |
| C-03 | Outline button (white, slate-line border, blue text) | `.btn-outline` | `.cta-outline`, `.btn-sm` | core via `OutlinedButtonTheme` (radius 14); small variant (`.btn-sm`, radius 10, 12/700) NEW |
| C-04 | Text button / link | `.btn-text` | `.resend b` | core via `TextButtonTheme`; green-700 link variant NEW |
| C-05 | Status chip (pill, 12/600, dot) | `.chip-*` + `.chip-dot` | `.pill-done`, amber/red inline variants | app-only `StatusChip` in `apps/customer_app/lib/src/widgets/nitume_card.dart:41` — wrong radius (8 vs pill), no dot; move to core |
| C-06 | Status presentation map (ErrandStatus → label + tone) | — | — | app-only `statusPresentation()` in `nitume_card.dart:76`; move to core, labels per §6 below |
| C-07 | Card (white, slate-line border, r-m 14, padding 16) | `.card-demo` | `.form-card`, `.track-info`, `.price-card` | app-only `NitumeCard` in `nitume_card.dart:6`; move to core |
| C-08 | Section label | `section h2` style | `.sec-label` | NEW |
| C-09 | Root top bar (slate bg, title 21/700, optional greeting, actions) | — | `.topbar` | NEW `NitumeTopBar` |
| C-10 | Pushed header (32px circle back button, title 18/700, optional Fira Code step counter) | — | `.ov-header`, `.ov-back`, `.ov-step` | NEW `NitumePushedHeader` |
| C-11 | Notification bell (36px white circle, slate-line border, unread dot) | — | `.bell` | NEW `NotificationBell` (currently copy-pasted in `home_tab.dart:36` and `track_tab.dart:25`) |
| C-12 | Initials avatar (blue fill, white 700 text; sizes 36 / 60 / 70) | — | `.avatar-sm`, `.rate-avatar`, `.profile-avatar-lg` | NEW `InitialsAvatar` |
| C-13 | Bottom tab bar (white, top hairline, 5 items, label 10/700, inactive slate-400, active green-700, all labels visible) | — | `.tabbar`, `.tab` | NEW `NitumeTabBar` (or fix `navigationBarTheme`) |
| C-14 | Wizard stepper (3 segments, 4px, gap 6, done = green, todo = slate-line) | — | `.stepper` | NEW `StepProgressBar` |
| C-15 | Category tile + 3-col grid (white, r 14, icon box 32 green-050 r 9, label 11.5/600; selected = green border + inset green-050 ring) | — | `.cat-tile`, `.cat-grid2` | NEW `CategoryTile` driven by `ErrandCategory` (core enum exists) |
| C-16 | Choice chip (pill, slate bg, slate-line border, 12/600; selected = blue fill, white text) | extension of `.chip` | `.chip`, `.chip.sel` | NEW `NitumeChoiceChip` (clearly-labelled extension; white on blue is compliant) |
| C-17 | Form field (label + input) | `.field-label` + `.field-input` (white bg, r-s 8, 11/14 padding, focus 2px green) | `.form-label` + `.field` (slate bg, r 10) | Theme partial: `inputDecorationTheme` uses r 14 and **blue** focus border; design system says green focus, r 8. NEW `NitumeField` wrapper + theme fix |
| C-18 | Receipt card + rows (label left, Fira Code amount right, total row with top hairline, 700) | — | `.receipt-card` (dashed border), `.receipt-row` | NEW `ReceiptCard` / `ReceiptRow` |
| C-19 | Status timeline (9px dot, green done / slate-400 pending, 1px slate-line connector, time in Fira Code 11 slate-600) | — | `.timeline`, `.tl-item` | NEW `StatusTimeline` (currently private `_TimelineItem` in `track_tab.dart:461`) |
| C-20 | Active task hero card (blue fill r 16, padding 18, tag, title white 15.5/600, meta Fira Code 12, green button) | — | `.active-card` | NEW `ActiveTaskCard` |
| C-21 | Runner summary tile (36px avatar, name 13.5/600, Fira Code meta 11 slate-600 "Verified · 4.9 · 137 tasks", optional trailing chip) | design-system runner card | `.track-info`, task-detail runner card | NEW `RunnerSummaryTile` |
| C-22 | Compact task row (white r 12, title 13/600, Fira Code meta 11, trailing chip) | `.list-item` | `.hist-row` | NEW `TaskRow` |
| C-23 | Task history card (title 13.5/600 + chip, Fira Code meta 11, Fira Code amount 14/600) | `.list-item` | `.hcard` | NEW `TaskHistoryCard` |
| C-24 | Menu row (white r 12, 13.5/500, chevron slate-400; destructive variant) | — | `.menu-row` | NEW `MenuRow` |
| C-25 | Evidence grid (3 cols, gap 8, square thumbs r 10, placeholder gradient blue-050 → slate-line) | — | `.ev-grid`, `.ev-thumb` | NEW `EvidenceGrid` |
| C-26 | OTP code field (6 boxes 44×52, r 10, Fira Code 18/600, filled = green border) | — | `.otp-row`, `.otp-box` | NEW `OtpCodeField` |
| C-27 | Star rating input (5 × 30px, filled green, empty slate-line) | — | `.stars` | NEW `StarRatingInput` |
| C-28 | Notification row (34px icon box green-050 r 9, title 13/600, body 11.5 slate-600, Fira Code time 10.5 slate-400) | — | `.notif-row` | NEW `NotificationRow` |
| C-29 | Saved address card + small tag ("Default", blue-050 / blue, 10/700 pill) | chip-info | `.addr-card`, `.addr-tag` | NEW `SavedAddressCard`; tag = small C-05 info variant |
| C-30 | Payment method card (38×26 brand badge r 5, label 13.5/600, Fira Code masked detail 11) | — | `.pm-card`, `.pm-icon` | NEW `PaymentMethodCard` |
| C-31 | Live tracking map (Google Maps SDK, animated runner marker, start/end pins, ETA chip) | — | `.map-box`, `.eta-chip`, `.pin`, `.runner-dot` | NEW `LiveTrackingMap` + `EtaChip` (Google Maps is named in §5, no new vendor) |
| C-32 | Money formatter `KSh 2,200` + numeric text helper | `.t-num` | `.num` | NEW `formatKes()` + `NumText` |
| C-33 | Empty / error / loading states (centered muted message, retry outline button, skeleton cards) | — | (not drawn) | NEW `NitumeEmptyState`, `NitumeErrorState`, `SkeletonCard` |
| C-34 | Search entry row (white r 12, slate-400 icon + placeholder 13.5) | — | `.search-row` | NEW `SearchEntryRow` |

Non-UI core needs (owned by `core-ui` / `nitume_core`): `ErrandRepository`, `PaymentsRepository`, `EvidenceRepository`, `RatingsRepository`, `NotificationsRepository`, `CustomerAccountRepository`; models `Quote`, `Payment`, `PaymentTransaction`, `Evidence`, `Rating`, `PriceChangeRequest`, `StatusHistoryEntry`, `RunnerPublicProfile`, `ErrandLocation`; a Socket.IO client (`socket_io_client`) with room join for `errand:{id}`; FCM deep-link handling. None exist today (only `AuthRepository`, `Errand`, `AppNotification`, `CustomerProfile`, `SavedAddress`, `PaymentMethod`, `AppUser`).

## 5. Layout constants

- Horizontal screen padding 20. Card gap 10–14. Section label padding `6 20 10`.
- Pushed header padding `10 20 14`; back button 32px visual, **48px hit area**.
- Fixed bottom CTA: margin `auto 20 6`, full width minus 40, padding 15, sits above the bottom safe area.
- Status bar: use `SafeArea` (mockup draws a 44px fake status bar — not ported).
- Tap targets: every interactive element ≥ 48×48 dp hit area (bell 36, back 32, chips ~32 and stars 30 are visually smaller; pad their hit areas).

## 6. Errand state → customer label

The state machine is `Nitume_System_Design.md` §3.3. The UI never invents or skips states. Labels below are the recommended customer-facing copy (owner to confirm, Q-LABELS). Tone = chip variant.

| State | Label | Tone |
|---|---|---|
| DRAFT | Draft | info |
| REQUESTED | Awaiting quote | pending |
| QUOTED | Quote ready | pending |
| ACCEPTED | Awaiting payment | pending |
| PAYMENT_CONFIRMED | Finding a runner | info |
| RUNNER_ASSIGNED | Runner assigned | info |
| RUNNER_EN_ROUTE | En route | info (mockup draws amber; Q-ENROUTE) |
| ARRIVED | Arrived | info |
| IN_PROGRESS | In progress | info |
| AWAITING_CUSTOMER | Needs your review | pending |
| COMPLETED | Completed | success |
| CONFIRMED | Confirmed | success |
| SETTLED | Completed | success (mockup history shows "Completed" for finished tasks) |
| CANCELLED | Cancelled | danger (mockup) — Q-RED |
| FAILED | Failed | danger |
| EXPIRED | Expired | pending or info (not drawn) |
| DISPUTED | Disputed | danger |

The current app-only map (`nitume_card.dart:76`) uses "Finding runner" for REQUESTED, which is wrong for §3.3 (REQUESTED precedes quoting and payment; matching starts at PAYMENT_CONFIRMED).

## 7. Copy rules

- Category display names only: Buy For Me, Get It For Me, Check It For Me, Go There For Me, Wait For Me, Business Tasks (core `ErrandCategory.label`). The mockup uses short labels (Buy, Collect, Inspect, Visit, Submit, Business) — see Q-CAT.
- No wallet or escrow words ("balance", "hold", "release funds", "escrow"). The mockup CTA "Confirm completion & release payment" conflicts (Q-RELEASE in `v-evidence-confirm.md`).
- Money always as `KSh 2,200` (space, thousands comma, no decimals unless non-zero), Fira Code.
- Times: `10:03 AM`, `Today, 10:03 AM`, `Yesterday, 4:12 PM`, `Mon, 10:03 AM`, relative `2m`, `1h`, `Yesterday`, `Mon` in notifications. Fira Code.

## 8. Shared questions (referenced by id from view specs)

- **Q-RADIUS** — Design system `.btn` is a pill (999px); every mockup CTA uses 14px (`.cta-fixed`) or 10px (`.track-btn`, `.btn-sm`). Hierarchy says the design system wins on styling, so specs say pill. Current theme uses 14. Recommended: confirm pill for all buttons, or approve 14px as the mobile CTA shape.
- **Q-FIELD** — Design-system field is white with 8px radius and green focus ring; mockup field is slate with 10px radius inside a white card, with an uppercase 11px label. Recommended: design-system field (white, 8, green focus) and the mockup's uppercase card label as the card heading.
- **Q-RED** — Red appears outside chips in the mockup: unread dot on the bell, destructive menu rows ("Log out", "Report a problem with this task"), and "Cancelled" chip (design system reserves red for disputed/failed). Recommended: allow red for the unread dot, destructive text rows and inline form errors as a documented extension; use info or neutral tone for Cancelled.
- **Q-ENROUTE** — Mockup shows "En route" as an amber chip; design system amber means pending/needs attention, and shows "Assigned" in blue info. Recommended: info (blue) for all runner-progress states.
- **Q-CAT** — Mockup category tiles say Buy / Collect / Inspect / Visit / Submit / Business. Domain rules require the six display names. "Visit" and "Submit" do not map cleanly (presumably Visit = Go There For Me / representation, Submit = Wait For Me / queue_admin). Recommended: use the six full names on tiles (2 lines at 11.5px fit a 100px tile).
- **Q-LABELS** — Confirm the state-to-label table in §6.
- **Q-NAME** — Mockup shows customer names ("Achieng", "Achieng Otieno") and runner names ("Brian K."). Neither the ERD (`USERS`, `CUSTOMER_PROFILES`, `RUNNER_PROFILES`) nor the API has a name field, and there is no onboarding step that collects one. This is a schema decision (§3). Recommended: add `display_name` to `users`, collected after first OTP sign-in, and expose runner first name + last initial only.
