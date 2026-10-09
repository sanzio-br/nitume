# Customer app — gap report

- Auditor: `design-auditor`, 2026-10-07
- Branch audited: `docs/customer-spec-audit` (forked from `chore/claude-agent-team` at `eaf2300`); app code last touched in `8896891 feat: implement 5-tab home shell per design`
- Specs: `docs/specs/customer/*.md` (shared rules and component ids `C-xx` in `_shared.md`)
- Mockup: `docs/design/nitume_customer_app.html`; design system: `docs/design/nitume_design_system.html`; system design: `docs/design/Nitume_System_Design.md`
- Scope: pre-build baseline audit of every customer view. All screens are FAIL; nothing is `matches-design`.

## Build health

| Check | Result |
|---|---|
| `flutter analyze` (apps/customer_app) | 1 info: `sized_box_for_whitespace` at `lib/src/screens/track_tab.dart:129`. Not clean. |
| `flutter test` (apps/customer_app) | 1 test, passes (`test/widget_test.dart`: OTP screen smoke test). No tests for Home, New task, Track, History, Profile, shell. |
| `packages/nitume_core` tests | 3 API-client tests (`test/nitume_core_test.dart`); no widget or theme tests. |
| Runtime | `track_tab.dart:80` references `assets/map_placeholder.png`, which does not exist and is not declared in `pubspec.yaml` → asset load error at runtime. |

## Summary

| View | Verdict | Status | Blockers | Minor |
|---|---|---|---|---|
| v-auth-phone | FAIL | partial | 4 | 4 |
| v-auth-otp | FAIL | partial | 4 | 2 |
| v-home | FAIL | partial | 6 | 5 |
| v-new-category | FAIL | partial | 5 | 2 |
| v-new-details | FAIL (not built) | missing | 1 | 0 |
| v-new-review | FAIL (not built) | missing | 1 | 0 |
| v-price-auth | FAIL (not built) | missing | 1 | 0 |
| v-payment | FAIL (not built) | missing | 1 | 0 |
| v-payment-methods | FAIL (not built) | missing | 1 | 0 |
| v-track | FAIL | partial | 6 | 4 |
| v-task-detail | FAIL (not built) | missing | 1 | 0 |
| v-evidence-confirm | FAIL (not built) | missing | 1 | 0 |
| v-rate | FAIL (not built) | missing | 1 | 0 |
| v-history | FAIL | partial | 4 | 3 |
| v-notifications | FAIL (not built) | missing | 1 | 1 |
| v-addresses | FAIL (not built) | missing | 1 | 0 |
| v-profile | FAIL | partial | 3 | 3 |
| shell (tab bar) | FAIL | partial | 1 | 3 |

Counts: 0 built, 8 partial (incl. shell), 10 missing (17 mockup views: 7 partial, 10 missing).

---

## Global findings (apply to every built screen)

G-1 **blocker** — Fira Code is never actually applied. Files: `home_tab.dart:296,374`, `track_tab.dart:116,227,523`, `history_tab.dart:147,155`, `profile_tab.dart:64` use `fontFamily: 'FiraCode'`; `home_tab.dart:315`, `new_task_tab.dart:97` use `'FiraSans'`. Design: numeric data in Fira Code via the theme layer (`NitumeTypography.numeric`). Code: `google_fonts` registers families as `Fira Code` (with weight suffixes) at runtime and nothing is bundled under `FiraCode`, so these strings fall back to the platform font. Fix: replace every `fontFamily:` string with `NitumeTypography.numeric(...)` (or a core `NumText`), and `'FiraSans'` with the theme text style.

G-2 **blocker** — No shared widgets in `nitume_core`. `packages/nitume_core/lib/nitume_core.dart` exports only theme, models, API, auth. The app-only `NitumeCard` and `StatusChip` (`apps/customer_app/lib/src/widgets/nitume_card.dart`) are **not used by any screen**; every screen re-implements cards, chips, section labels, bell, avatars and rows inline. Copy-pasted examples: bell `home_tab.dart:36-75` = `track_tab.dart:25-64`; section label style `home_tab.dart:127-135,160-168,181-189` = `track_tab.dart:306-314`; status pill `home_tab.dart:381-395` = `history_tab.dart:121-136` = `track_tab.dart:234-251`; white bordered card containers in every file. Fix: core-ui builds C-01…C-34 (see consolidated list); screens consume them.

G-3 **blocker** — Every screen is static sample data. No repository, provider or API call outside auth; names (`Achieng`, `Brian K.`), amounts, times and statuses are string literals. Fix: build per spec "Data" sections once api-contract fills the gaps below.

G-4 **blocker** — Navigation and actions are not wired. 18 `// TODO` tap handlers (`home_tab.dart:73,174,346`; `new_task_tab.dart:85,128`; `track_tab.dart:62,264,284`; `history_tab.dart:35,45,55,65`; `profile_tab.dart:75,81,87,93,99,106`). No pushed screens exist. Fix: implement the navigation map in `_shared.md` §1.

G-5 **blocker** — Session handling. `app.dart:17-32`: `_isSignedIn` is never set, `signIn`/`signOut` are unused, session restore is a TODO (`app.dart:22`); every launch shows the OTP screen. `otp_login_screen.dart:56-60` builds its own `NitumeApiClient` with no `onUnauthenticated` and bypasses `AuthRepository`. Fix: one app-level API client + `AuthRepository`, restore on launch, route on auth state.

G-6 **minor** — Inline style overrides instead of theme. `TextStyle(fontSize: 21, fontWeight: w700)` titles (`track_tab.dart:19`, `history_tab.dart:19`, `profile_tab.dart:19`), inline `FilledButton.styleFrom`/`OutlinedButton.styleFrom` (`home_tab.dart:305`, `new_task_tab.dart:87`, `track_tab.dart:266,286`), magic radii 9/10/12/16 throughout. Fix: theme text styles + core components (C-01, C-03, C-09).

G-7 **minor** — Theme deviations in `packages/nitume_core/lib/src/theme/nitume_theme.dart` (core-ui): focus border blue (`:87`) where the design system uses a 2px green focus ring; input radius 14 (`:163`) vs design-system 8; button radius 14 (`:100,:111`) vs design-system pill (Q-RADIUS); chip radius 8 (`:126`) vs pill; NavigationBar label/icon blue (`:135,:138`) vs mockup active green-700 / inactive slate-400; AppBar blue fill (`:58`) while every mockup top bar is slate.

G-8 **minor** — `google_fonts` fetches Fira at runtime over the network (`nitume_typography.dart:20,44`). Offline first launch renders the fallback font. Fix (core-ui): bundle the font files as assets and set `GoogleFonts.config.allowRuntimeFetching = false`.

G-9 **minor** — Dead placeholder screens: `notifications_screen.dart`, `profile_screen.dart`, `tasks_screen.dart` are unreachable. Fix: delete or replace with the real views.

G-10 **minor** — Tests: only one smoke test exists; Definition of Done requires tests per screen. Fix: widget tests per view (copy, states, navigation).

---

## v-auth-phone

Verdict: **FAIL** · Spec: `docs/specs/customer/v-auth-phone.md` · File: `apps/customer_app/lib/src/screens/auth/otp_login_screen.dart`

1. **blocker** — Structure. `:150-227`. Design: phone entry and OTP are two screens (OTP pushed with a back arrow). Code: one widget switches `_step`. Fix: split into `PhoneEntryScreen` and `OtpVerifyScreen`.
2. **blocker** — Copy. `:214` `Continue` → design `Send code`; `:218-222` `We'll text you a code. Standard message rates may apply.` → design legal line `By continuing you agree to Nitume's Terms & Privacy Policy.` (missing). `:188-189` label `Phone number`, hint `0712 345 678` → design placeholder `+254 7XX XXX XXX`, no label/prefix icon.
3. **blocker** — Brand. `:239-263` blue rounded square with `Icons.handyman` + "Nitume" titleLarge. Design: 9px green dot + "Nitume" 22/700. Fix: core `NitumeWordmark`.
4. **blocker** — Data. `:84` posts the raw input; `KenyanPhone.normalize` exists in core and is not used. Fix: use `AuthRepository.requestOtp(KenyanPhone.normalize(phone))`.
5. **minor** — Layout: content is top-aligned in a scroll view with padding 24; design centres vertically with 28 side padding.
6. **minor** — Error text in red (`:18-25`), outside the chip-only rule (Q-RED).
7. **minor** — `:213` unsized `CircularProgressIndicator` inside the button (code step uses a 22px sized one at `:305`); inconsistent loading state.
8. **minor** — Phone input text is Fira Sans; spec lists phone numbers as numeric (Fira Code).

## v-auth-otp

Verdict: **FAIL** · Spec: `docs/specs/customer/v-auth-otp.md` · File: `otp_login_screen.dart` (`_CodeStep` `:265-322`)

1. **blocker** — No back arrow / pushed header; brand row and phone screen chrome still render on the code step (`:160`). Fix: separate screen with C-10.
2. **blocker** — Single letter-spaced `TextField` (`:287-299`) instead of six 44×52 boxes with green border when filled (C-26).
3. **blocker** — `:298` `onSubmitted: (_) => onSubmit` returns the callback without calling it; keyboard "done" does nothing. Fix: `onSubmitted: (_) => onSubmit()`, plus auto-submit on 6th digit.
4. **blocker** — Session: `:114-127` raw post without `role: 'customer'`, does not use `AuthRepository.verifyOtp`, does not load `/users/me`, navigates with `pushReplacementNamed('/home')` while `app.dart` still thinks the user is signed out (G-5).
5. **minor** — Copy: `:313` `Verify` → `Verify & continue`; `:318` `Didn't get it? Send again` → `Didn't get it?` + green-700 link `Resend code`; sub copy uses `0712 345 678` format (`:169`, `KenyanPhone.format`) vs design `+254 712 345 678`.
6. **minor** — Resend is a full `TextButton` in blue; design is centred 12.5 slate-600 text with a green-700 700 link.

## v-home

Verdict: **FAIL** · Spec: `docs/specs/customer/v-home.md` · File: `apps/customer_app/lib/src/screens/home_tab.dart`

1. **blocker** — Domain: category labels `Buy, Collect, Inspect, Visit, Submit, Business` (`:143-153`). Rule: the six display names from `ErrandCategory.label` (core). Fix: render tiles from `ErrandCategory.values` (Q-CAT pending for short labels).
2. **blocker** — Layout: categories are a horizontal `ListView` of 56px icon squares without tile cards (`:137-156`, `:212-249`). Design: 3-column grid of white bordered tiles (C-15).
3. **blocker** — Off-palette / green misuse in the active card: tag bg `NitumeColors.green.withValues(alpha: 0.2)` (`:270`) and green tag text on blue (`:276`). Mockup values (`rgba(4,175,77,.2)`, `#5FE092`) are themselves off-palette. Fix: chip-info tag (Q5 in spec).
4. **blocker** — Typography: G-1 at `:296`, `:374`; task number `#10482` (`:274`) is in Fira Sans.
5. **blocker** — Status pill colours: `statusColor.withValues(alpha: 0.1)` + text `NitumeColors.green` (`:384-391`). Design: chip-success = green-050 bg + green-700 text. Green `#04AF4D` text on a 10% tint is ≈ 2.9:1 contrast (fails WCAG AA). Fix: C-05.
6. **blocker** — No data, no navigation (G-3, G-4): bell `:72`, avatar not tappable (`:77`), track `:173`, recent rows `:345`, search row not tappable.
7. **minor** — "Track live →" button is full width (`:301-320`); design is intrinsic width, left aligned, 12.5/700.
8. **minor** — Top bar is a pinned `SliverAppBar` (`:12`); design top bar scrolls with content (no pinned bar) — confirm with C-09.
9. **minor** — Unread dot 10px at (4,4) (`:55-58`); design 7px at (8,9) with 1.5px white border.
10. **minor** — Greeting is hard-coded `Good afternoon`; must follow time of day.
11. **minor** — No loading/empty/error states.

## v-new-category

Verdict: **FAIL** · Spec: `docs/specs/customer/v-new-category.md` · File: `apps/customer_app/lib/src/screens/new_task_tab.dart`

1. **blocker** — Flow: built as a root tab inside `IndexedStack` (`home_shell.dart:21-27`). Design: the "New task" tab item pushes a full-screen wizard (tab bar hidden) with back button, `Step 1 of 3` counter and stepper.
2. **blocker** — Domain: short category labels (`:53-77`) (Q-CAT).
3. **blocker** — Selection is hard-coded (`selected: true` on Inspect, `:56`) and taps do nothing (`:127-128`).
4. **blocker** — CTA does nothing (`:84-86`) and is inline in the scroll, not fixed at the bottom.
5. **blocker** — G-1 `'FiraSans'` at `:97`; inline button style `:87-99`.
6. **minor** — Extra copy not in the mockup: 22px heading `What do you need done?` + `Choose a category to get started` (`:30-43`). Design: one section label `What do you need done?`.
7. **minor** — Selected tile uses a 2px green border only (`:136-137`); design adds a 2px inset green-050 ring with a 1px green border.

## v-new-details

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-new-details.md`

1. **blocker** — No implementation. Needs C-10, C-14, C-07, C-16, C-17, Places autocomplete, saved-address shortcut, `CreateErrandDto` assembly.

## v-new-review

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-new-review.md`

1. **blocker** — No implementation. Blocked on owner Q (instant quote vs REQUESTED → QUOTED wait) and on a customer-readable quote endpoint and payment-flow selection in `POST /payments/:errandId/initiate`.

## v-price-auth

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-price-auth.md`

1. **blocker** — No implementation; `track_tab.dart:263` button is a TODO. Needs a GET for pending requests and owner answers on reject semantics and which amount changes.

## v-payment

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-payment.md`

1. **blocker** — No implementation. Needs `POST /payments/:errandId/initiate` with idempotency key, confirmation via socket or polling of `GET /payments/:errandId`.

## v-payment-methods

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-payment-methods.md`

1. **blocker** — No implementation (`profile_tab.dart:80` TODO). API and core model exist. Card payments are a scope question.

## v-track

Verdict: **FAIL** · Spec: `docs/specs/customer/v-track.md` · File: `apps/customer_app/lib/src/screens/track_tab.dart`

1. **blocker** — Off-palette colours: `Color(0xFFEAEEF4)` (`:84`), raw `Color(0xFF0B2545)` outside the token layer (`:357`), `Colors.black` shadows (`:107`, `:448`). Fix: real map (C-31); any placeholder uses slate / blue-050; shadows from a blue-tinted token if needed.
2. **blocker** — Missing asset `assets/map_placeholder.png` (`:79-83`) + `backgroundBlendMode: BlendMode.overlay` (`:78`). Fix: remove; use Google Maps SDK.
3. **blocker** — No live layer: no errand, no `location:update`, no Socket.IO, no Google Maps (§4.2, §5). The runner dot animation is a fake drift (`:397-459`).
4. **blocker** — Typography G-1 (`:116`, `:227`, `:523`).
5. **blocker** — Copy-pasted widgets: bell (`:25-64`), inline chip (`:234-251`), private `_TimelineItem` (`:461-534`) — must be C-11, C-05, C-19 in core.
6. **blocker** — Actions not wired (`:264`, `:284`), timeline static (`:320-341`).
7. **minor** — Status chip is amber "En route" (matches mockup) but conflicts with design-system semantics (Q-ENROUTE).
8. **minor** — Runner avatar radius 20 (40px) (`:199-200`); design 36px.
9. **minor** — `flutter analyze` info at `:129` (Container → SizedBox).
10. **minor** — Timeline title weight/colour changes by state (`:513-515`); mockup keeps all titles 12.5 blue, only the dot changes. Confirm intended.

## v-task-detail

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-task-detail.md`

1. **blocker** — No implementation; Home recent rows and History cards have TODOs. Needs runner summary on errand, disputes endpoint.

## v-evidence-confirm

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-evidence-confirm.md`

1. **blocker** — No implementation. Mockup CTA contains escrow-style wording ("release payment") that must not be shipped without owner sign-off (Q-RELEASE).

## v-rate

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-rate.md`

1. **blocker** — No implementation. Rating API exists (`POST/GET /errands/:errandId/rating`).

## v-history

Verdict: **FAIL** · Spec: `docs/specs/customer/v-history.md` · File: `apps/customer_app/lib/src/screens/history_tab.dart`

1. **blocker** — Status chip colours via `statusColor.withValues(alpha: 0.1)` and `NitumeColors.green` text (`:121-135`, `:33-63`). Design: chip tokens (green-050/green-700, red-050/red). Fix: C-05 + `statusPresentation`.
2. **blocker** — Typography G-1 (`:147`, `:155`).
3. **blocker** — Static data, no pagination, taps are TODOs (G-3, G-4).
4. **blocker** — Private `_HistoryCard` (`:77-168`) instead of shared C-23.
5. **minor** — Amount sits on the meta row (`:140-161`); design puts the amount on its own line under the meta, margin-top 6.
6. **minor** — Top bar is a pinned `SliverAppBar` with an inline `TextStyle` (`:12-23`).
7. **minor** — No empty/loading/error states.

## v-notifications

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-notifications.md`

1. **blocker** — Only a placeholder (`notifications_screen.dart:14` "Notification feed pending — backend events wire up in next phase.") that nothing navigates to. API endpoints and core `AppNotification` model exist.
2. **minor** — Placeholder copy uses a raw `TextStyle` (`:16`).

## v-addresses

Verdict: **FAIL (not built)** · Spec: `docs/specs/customer/v-addresses.md`

1. **blocker** — No implementation (`profile_tab.dart:74` TODO). API and core `SavedAddress` model exist.

## v-profile

Verdict: **FAIL** · Spec: `docs/specs/customer/v-profile.md` · File: `apps/customer_app/lib/src/screens/profile_tab.dart`

1. **blocker** — All rows are TODOs, including Log out (`:72-108`); core `AuthRepository.logout` exists and is unused.
2. **blocker** — Static identity (`:42`, `:53`, `:61`); no name source exists (Q-NAME).
3. **blocker** — Private `_MenuRow` (`:118-165`) and inline avatar (`:33-50`) instead of C-24 / C-12; G-1 at `:64`.
4. **minor** — Log out chevron is red (`:156`); mockup chevron stays slate-400 (`.menu-row .arrow`).
5. **minor** — Red text on a menu row (Q-RED).
6. **minor** — "Recurring tasks" and "Support" rows present without targets (scope questions).

## shell (bottom tab bar)

Verdict: **FAIL** · Spec: `_shared.md` C-13 · File: `apps/customer_app/lib/src/screens/home_shell.dart`

1. **blocker** — "New task" is a tab with its own root view (`:21-27`, `:47-51`); design: it pushes the wizard (`v-new-category`) over the shell.
2. **minor** — `indicatorColor: NitumeColors.green.withValues(alpha: 0.15)` (`:39`): green used decoratively as a tinted pill; not a palette tone. Design: no indicator; active tab icon + label green-700.
3. **minor** — `labelBehavior: onlyShowSelected` (`:40`); design shows all five labels (10/700, slate-400 inactive).
4. **minor** — Icons differ (Track uses a location pin; mockup uses an eye). Low priority.

---

## Consolidated: missing `nitume_core` widgets and tokens (for core-ui)

UI components (full definitions in `docs/specs/customer/_shared.md` §4):

| Id | Widget | Notes |
|---|---|---|
| C-01 | `NitumeButton.primary` | wrapper over themed `FilledButton`; radius per Q-RADIUS |
| C-02 | `NitumeButton.secondary` (blue) | no themed variant today |
| C-03 | `NitumeButton.outline` + small variant | small = 12/700, padding 11 |
| C-04 | link variant (green-700) | |
| C-05 | `StatusChip` (pill, dot, 12/600) | move from app, fix radius |
| C-06 | `statusPresentation` / state labels | move from app, fix REQUESTED label |
| C-07 | `NitumeCard` | move from app |
| C-08 | `SectionLabel` | |
| C-09 | `NitumeTopBar` | |
| C-10 | `NitumePushedHeader` (back + title + step counter) | |
| C-11 | `NotificationBell` | |
| C-12 | `InitialsAvatar` | 36/60/70 |
| C-13 | `NitumeTabBar` (or theme fix) | |
| C-14 | `StepProgressBar` | |
| C-15 | `CategoryTile` / grid from `ErrandCategory` | |
| C-16 | `NitumeChoiceChip` | extension of chip pattern |
| C-17 | `NitumeField` (+ multiline, money, phone) | theme focus/radius fix |
| C-18 | `ReceiptCard` / `ReceiptRow` | dashed variant |
| C-19 | `StatusTimeline` | |
| C-20 | `ActiveTaskCard` | |
| C-21 | `RunnerSummaryTile` | |
| C-22 | `TaskRow` | |
| C-23 | `TaskHistoryCard` | |
| C-24 | `MenuRow` (+ destructive) | |
| C-25 | `EvidenceGrid` + `EvidenceViewer` | |
| C-26 | `OtpCodeField` | |
| C-27 | `StarRatingInput` | |
| C-28 | `NotificationRow` | |
| C-29 | `SavedAddressCard` | |
| C-30 | `PaymentMethodCard` | |
| C-31 | `LiveTrackingMap` + `EtaChip` | `google_maps_flutter` |
| C-32 | `formatKes` + `NumText` | |
| C-33 | `NitumeEmptyState`, `NitumeErrorState`, `SkeletonCard` | |
| C-34 | `SearchEntryRow` | |
| — | `NitumeWordmark`, `PulsingDots`, `PlaceAutocompleteField` | auth, payment, details |

Tokens/theme fixes: green focus ring and 8px input radius; button/chip radius (Q-RADIUS); tab bar colours (green-700 active, slate-400 inactive); remove need for any per-screen alpha tints; bundle Fira fonts (G-8); a text-style set for the type scale in `_shared.md` §3 (top-bar title 21/700, pushed title 18/700, section label 11.5/700 uppercase, meta 11 Fira Code).

Non-UI core: repositories (errands, payments, evidence, ratings, notifications, customer account), models (`Quote`, `Payment`, `PaymentTransaction`, `Evidence`, `Rating`, `PriceChangeRequest`, `StatusHistoryEntry`, `RunnerPublicProfile`, `ErrandLocation`), Socket.IO client with `errand:{id}` rooms, FCM setup and deep links.

## Consolidated: missing or uncertain API endpoints and socket events (for api-contract)

| # | Need | Used by | Current API (`apps/api/src`) |
|---|---|---|---|
| A-1 | Socket.IO gateway with rooms `errand:{id}`; `location:update {lat,lng,eta}` (§4.2) | v-track, v-home | **missing** (no gateway, no `realtime/` module) |
| A-2 | Named socket events for status change, evidence uploaded, price-change requested (§4.4) | v-track, v-new-review, v-payment, v-price-auth, v-evidence-confirm | **missing / unnamed** |
| A-3 | `GET /errands/:id/tracking` (§3.2) | v-track | **missing** |
| A-4 | Runner assignment + runner summary on errand (`GET /errands/:id` or `/assignment`) | v-home, v-track, v-task-detail, v-history, v-rate | **missing** (errand returns no assignment) |
| A-5 | Customer-readable quote breakdown (`GET /errands/:id/quote` or embedded) | v-new-review | **missing** (quote is admin-write only) |
| A-6 | Payment-flow selection on `POST /payments/:errandId/initiate` | v-new-review | **missing** (flow auto-picked, `payments.service.ts:127`) |
| A-7 | Idempotency key on payment initiation (§3.2) | v-payment | **missing** |
| A-8 | `GET /errands/:errandId/price-change?status=requested` | v-price-auth | **missing** (only POST request/approve/reject) |
| A-9 | `POST /disputes`, `GET /disputes/:id` (§3.2) | v-task-detail (report a problem) | **missing** (entities only, no controller) |
| A-10 | Errand list filter for multiple statuses / active vs history | v-home, v-history | **partial** (single `status` filter) |
| A-11 | Errand count on customer profile | v-profile | **missing** |
| A-12 | Viewable evidence URLs (signed GET) | v-evidence-confirm, v-task-detail | **uncertain** (`url` column nullable; base64 upload, not §3.2 signed-upload flow) |
| A-13 | Device/FCM token registration (`DEVICES` table) | push deep links | **missing** (no endpoint) |
| A-14 | Published notification `eventType` enum | v-notifications | **uncertain** |
| A-15 | Display names for customers and runners | v-home, v-profile, v-track, v-rate, v-notifications | **missing in ERD and API** (owner decision, Q-NAME) |
| A-16 | Human-readable task reference (`#NT-10482`) and short title | v-home, v-task-detail | **missing in ERD** (owner decision) |
| A-17 | Path difference: §3.2 `POST /payments/:id/authorize-change` vs API `POST /errands/:errandId/price-change/:requestId/approve` | v-price-auth | exists under a different path (record only) |

Existing and usable as-is: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `GET /users/me`, `GET /customers/me`, addresses CRUD, payment-methods CRUD, `POST /errands`, `POST /errands/:id/submit`, `GET /errands`, `GET /errands/:id`, `GET /errands/:id/history`, `PATCH /errands/:id/status`, `POST /payments/:errandId/initiate`, `GET /payments/:errandId`, `GET/POST /errands/:errandId/evidence`, `GET/POST /errands/:errandId/rating`, notifications list/unread/read/read-all, `GET /runners/:id/profile`.

## Design-rule violations index

| Rule | Where |
|---|---|
| Off-palette hex / raw colours outside the token layer | `track_tab.dart:84` `0xFFEAEEF4`; `track_tab.dart:357` raw `0xFF0B2545`; `track_tab.dart:107,448` `Colors.black` |
| Alpha-tinted colours not in the derived tones | `home_shell.dart:39` green 15%; `home_tab.dart:270` green 20%; `home_tab.dart:384`, `history_tab.dart:125` status colour 10% |
| Wrong fonts (Fira Code not applied) | G-1 list |
| Dark text on green | none found |
| Green misuse (decorative) | `home_shell.dart:39` indicator; `home_tab.dart:270,276` tag on active card; green text for chip labels `home_tab.dart:390`, `history_tab.dart:131` |
| Amber/red outside chips | red error text `otp_login_screen.dart:18-25`; red menu row + chevron `profile_tab.dart:150,156`; red unread dot `home_tab.dart:61`, `track_tab.dart:50` (all mirror the mockup; Q-RED) |
| Copy-pasted markup | G-2 list |

Mockup-level conflicts with the design system (not code bugs; for the owner): `#5FE092`, `#AEB9CC`, `#EAEEF4`, green 20% tag; amber text for prices on `v-price-auth`; amber "En route" chip; red "Cancelled" chip; 14px/10px button radii vs pill.

## Domain issues

1. Category names: Home and New-task tiles use `Buy, Collect, Inspect, Visit, Submit, Business` (code and mockup). Must be the six display names (Q-CAT).
2. Escrow wording: mockup CTA `Confirm completion & release payment` (`v-evidence-confirm`). API comments also use "escrow legs" (`apps/api/src/errands/errands.controller.ts`, `errand-state-machine.ts`) — outside this audit's write scope; flagged for api-contract/owner.
3. State machine: the API adds transitions not in §3.3 — DRAFT → CANCELLED, AWAITING_CUSTOMER → DISPUTED, DISPUTED → CONFIRMED / CANCELLED (`apps/api/src/errands/errand-state-machine.ts`). The UI specs follow §3.3; owner to confirm the API deviations.
4. State label: app-only `statusPresentation` labels REQUESTED as "Finding runner" (`nitume_card.dart:79`), which misdescribes §3.3 (no matching before PAYMENT_CONFIRMED).
5. Three payment flows: the review screen offers all three merchant flows, but the API only ever records `merchant_direct` or `platform_only`; the price-change flow edits the service price, not the merchant amount shown in the mockup; fee splits differ between mockup screens and the API (20% / 30% of quote). All owner decisions.
6. Card payments (Visa) shown in the mockup; system design is M-Pesa only.

## Questions for the owner (consolidated)
1. **Q-CAT** — Category tile labels: six full display names, or approve short labels (and their mapping, esp. Visit and Submit)?  
   **Answer:** Full category display names. No shortened labels.

2. **Q-NAME (schema)** — No name field for customers or runners in ERD/API, but every screen shows names. Add `display_name` (and collect it after first sign-in)?  
   **Answer:** Add `display_name` for customers and runners. Collect it after first sign-in/onboarding and expose it consistently in API + UI.

3. **Quote flow (state machine)** — Wizard shows an instant quote; §3.3/API require submit → admin quote → accept. Wait-for-quote state, or synchronous auto-quote?  
   **Answer:** Synchronous auto-quote for the wizard preview, but authoritative backend flow remains `PENDING_QUOTE → QUOTED → ACCEPTED`. Preview ≠ final quote.

4. **Fee breakdown (payments)** — Base / Report & evidence / Transport vs Service fee / Runner fee vs API 20%/30% split. Which is shown, and what are the split rules?  
   **Answer:** Show customer-facing Service fee + Runner fee + Merchant/item amount. Keep internal/API commission split separate. API commission should not be presented as an additional customer fee.

5. **Merchant payment flow choice (payments)** — Does the customer choose among merchant-direct / send-to-runner / runner-advance? Advance limits? How is "send purchase amount to runner" paid? Where are merchant Till/Paybill details shown?  
   **Answer:** Customer chooses the supported payment method during checkout. For MVP, support merchant-direct payment where merchant details are available and send purchase amount to runner where applicable. Runner advance should be treated as an explicit runner-side capability, not a customer-selected payment method. Merchant Till/Paybill details appear only when that payment route is selected.

6. **Q-RELEASE (no escrow)** — Replace "Confirm completion & release payment"? What does confirming trigger for runner payout?  
   **Answer:** Remove escrow language. Replace with “Confirm completion”. Confirmation marks the task complete and makes the runner's earned amount eligible for payout/settlement according to the normal payout process. Do not call it “release payment.”

7. **Confirm transitions (state machine)** — Does "Confirm completion" fire AWAITING_CUSTOMER → COMPLETED only, or also COMPLETED → CONFIRMED? What triggers CONFIRMED?  
   **Answer:** AWAITING_CUSTOMER → COMPLETED on customer confirmation. Do not add COMPLETED → CONFIRMED unless there is a real business event requiring it. COMPLETED is the terminal customer-task state.

8. **Price change (payments + state machine)** — Which amount changes (merchant item price vs service price)? How is the increase paid? What does "Reject & cancel task" do when CANCELLED is not reachable from IN_PROGRESS? Modal vs pushed screen?  
   **Answer:** Price change refers primarily to the merchant/item purchase amount, not arbitrary service-fee changes. Customer sees the new amount and must approve/pay the difference. Reject & cancel task transitions the task to CANCELLED; fix the state machine to make that transition reachable from the relevant active state. Use a modal confirmation rather than a separate pushed screen.

9. **API state-machine deviations** — Approve or revert DRAFT → CANCELLED, AWAITING_CUSTOMER → DISPUTED, DISPUTED → CONFIRMED/CANCELLED?  
   **Answer:** Approve, but normalize them deliberately: DRAFT → CANCELLED is valid; AWAITING_CUSTOMER → DISPUTED is valid; DISPUTED → CONFIRMED should not exist — resolve dispute back into an appropriate operational state or CANCELLED.

10. **Card payments (scope / third-party / security)** — Visa in MVP? Which provider?  
    **Answer:** Card payments are out of MVP. Do not add Visa or a card-payment provider/SDK.

11. **Q-RADIUS (design system)** — Pill buttons (design system) or 14px CTAs (mockup)?  
    **Answer:** Use pill buttons from the design system.

12. **Q-FIELD (design system)** — White 8px field with green focus (design system) or slate 10px field (mockup)?  
    **Answer:** Use the white 8px field with green focus from the design system.

13. **Q-RED / Q-ENROUTE (design system)** — Red for unread dot, destructive rows, inline errors, Cancelled chip; amber vs blue for "En route"; amber price text on price change.  
    **Answer:** Use red for unread dots, destructive rows, inline errors, and Cancelled chips. Use amber for “En route”. Use amber price text for price changes.

14. **Off-palette mockup colours** — Approve replacements for `#5FE092`, `#AEB9CC`, `#EAEEF4`, green 20% tint (chip-info tag, slate-400 meta, real map).  
    **Answer:** Replace these with the nearest approved design-system tokens. Do not introduce new arbitrary colours.

15. **Schema: task title and reference number** — Add `title` / sequential `reference`, or derive client-side?  
    **Answer:** Add a backend-generated `reference`. Do not derive it client-side. Add `title` where the customer actually provides/edits a task title.

16. **Schema: runner notes** — "Caretaker notes" on evidence review have no field.  
    **Answer:** Add a dedicated `runner_notes` field for runner-provided notes. Do not overload customer notes or other fields.

17. **Security: OTP policy** — Expiry, attempts, resend cooldown, request rate limits.  
    **Answer:** OTP expires after 5 minutes, maximum 5 verification attempts, 60-second resend cooldown, and maximum 5 OTP requests per hour per phone/account. Also apply IP/device throttling where appropriate and invalidate the previous OTP when a new one is issued.

18. **Scope** — Recurring tasks row, Support target (WhatsApp/phone/chat/web), Business Tasks tile for regular customers, in-task chat on Track.  
    **Answer:** Recurring tasks are out of MVP. Provide a simple configurable Support entry point rather than implementing separate WhatsApp/phone/chat/web systems. Business Tasks are out of MVP. In-task chat is out of MVP.

19. **Locations per category** — Pickup + drop-off for Get It For Me / Buy For Me; deadline chip → `deadline_at`/`urgency` mapping; budget visibility per category; shopping-list items.  
    **Answer:** Support pickup + drop-off for Get It For Me / Buy For Me where applicable. Use `deadline_at` as the authoritative deadline and derive urgency from it. Budget visibility follows the category requirements. Shopping-list items should be structured rather than stored as one unstructured text value.

20. **Q-LABELS** — Confirm the state → customer label table (`_shared.md` §6).  
    **Answer:** Use the state → customer label mapping in `_shared.md` §6 as authoritative. Do not invent alternate customer-facing state labels.

21. **Payment UX** — After payment go to Track (mockup intent) or Home (mockup JS)? STK timeout/retry policy; pay from default M-Pesa method vs login phone.  
    **Answer:** After successful payment, go to Track. Handle STK as `PENDING`, `SUCCESS`, `FAILED`, or `TIMEOUT`; timeout must not automatically be treated as payment failure without provider confirmation. Allow safe retries without duplicate charges. Pay using the customer's selected/default M-Pesa payment method; use the login phone only when no separate payment method exists.

## Spec updates after owner answers (2026-10-07)

All customer specs (`docs/specs/customer/*.md`) now cite the answers above as `OA-1`..`OA-21` (index in `_shared.md` §0) and reference still-open BOARD rows 1 and 23–37 as "pending row N". Nine undrawn screens are now specced (`x-name-capture`, `x-awaiting-quote`, `x-merchant-payment`, `x-report-problem`, `x-evidence-viewer`, `x-address-form`, `x-payment-method-form`, `x-support`, `x-legal`); `x-recurring-tasks` is dropped (OA-18). The findings above are a pre-build baseline and are not re-audited here.

### New or changed needs for api-contract

| # | Need | From | Spec |
|---|---|---|---|
| A-15 | `display_name` on users (customers + runners); `PATCH /users/me { displayName }`; returned on `/users/me` and runner summaries | OA-2 (now approved) | x-name-capture, v-home, v-profile |
| A-16 | Backend-generated `reference`; optional `title` on create and read | OA-15 (now approved) | v-new-details, v-home, v-task-detail |
| A-18 | Synchronous quote preview (proposed `POST /errands/quote-preview`), writes nothing | OA-3 | v-new-review |
| A-19 | OTP config to OA-17 (TTL 300 s; 5 requests per 3600 s) + error codes `OTP_INCORRECT`, `OTP_ATTEMPTS_EXCEEDED`, `OTP_EXPIRED`, `OTP_RATE_LIMITED`, `OTP_COOLDOWN` with `retryAfterSeconds` | OA-17 | v-auth-phone, v-auth-otp |
| A-20 | Customer-facing `serviceFee`, `runnerFee`, `itemAmount`, `total`, `expiresAt` on `GET /errands/:id/quote` (component mapping pending row 34) | OA-4 | x-awaiting-quote |
| A-6 | Initiate body `{ flow, paymentMethodId?, previousCheckoutRequestId? }`; customers may send only `merchant_direct`, `customer_to_runner`, `platform_only` (never `runner_advance`) | OA-5, OA-21 | v-payment |
| A-7 | Idempotency key (mechanism pending row 24) | OA-21 | v-payment |
| A-21 | STK attempt status `PENDING` / `SUCCESS` / `FAILED` / `TIMEOUT` on `GET /payments/:errandId`, provider-confirmed | OA-21 | v-payment |
| A-22 | Merchant details (`merchantName`, Till or Paybill + account) and `merchantAmountDue` on errand/payment | OA-5 (source pending SQ-6) | x-merchant-payment |
| A-23 | Price change edits the item/merchant amount, not `quoted_price`; reject moves the errand to CANCELLED in the same transaction | OA-8 (states/refunds pending row 37) | v-price-auth |
| A-24 | `runner_notes` on the errand | OA-16 | v-evidence-confirm |
| A-25 | Derive `urgency` from `deadlineAt`; validate two points for `buy_for_me` / `pickup_delivery` and ≥ 1 item for `buy_for_me` | OA-19 | v-new-details |
| A-26 | Notification event types: price change requested, payment confirmed/failed, rating reminder, merchant details added, dispute resolved | §4.4 | v-notifications |
| A-27 | Find the dispute from the errand (`disputeId` on errand or `GET /disputes?errandId=`) | — | x-report-problem |
| A-28 | Reject `card` / `bank` payment methods at MVP | OA-10 | v-payment-methods |
| A-29 | Remove DISPUTED → CONFIRMED and the "escrow" wording in API comments (`errands.controller.ts` resolve-dispute) | OA-6, OA-9 (target state pending row 36) | — |

### New or changed needs for core-ui

- Flip `NitumeDesignChoices` per OA-11..OA-14: En route (only) → pending tone; Cancelled → danger; destructive row text → red; unread dot → red; price-change new price and difference → amber text.
- C-15: five MVP categories (`ErrandCategory.customerMvp`), 3 + 2 grid with an empty cell.
- C-18: estimate caption slot and a separate "paid separately" group.
- C-28: unread styling (700 title + red dot). C-30: drop the card badge.
- NEW: C-16 radio-row variant, C-35 `NitumeDialog` (+ scrim token, SQ-1), C-36 checkbox, C-37 shopping-list editor, C-38 resend countdown, C-39 copyable value row, C-40 inline notice; `shortName()` helper; `AppConfig` support/terms/privacy URIs; `url_launcher` once approved (SQ-2).

### New questions for the owner (not yet on the board)

SQ-1 modal scrim colour; SQ-2 `url_launcher`; SQ-3 runner short names from API or client; SQ-4 fallback task title; SQ-5 send-to-runner mechanics; SQ-6 source and timing of merchant Till/Paybill details (all in `_shared.md` §9). Screen-level: quote expiry with no §3.3 transition (`x-awaiting-quote` Q1); how the price-change difference is paid (`v-price-auth` Q1); customer confirmation of merchant payment (`x-merchant-payment` Q1); M-Pesa number verification (`x-payment-method-form` Q1); dispute photos (`x-report-problem` Q1); budget visibility per category (`v-new-details` Q1); Terms/Privacy URLs (`x-legal` Q1); Support target value (`x-support` Q1).

---

# Addendum — owner answers round 2 (2026-10-08)

- Auditor: `design-auditor`. Branch `docs/customer-answers-2` (from `docs/customer-reaudit`).
- Input: BOARD rows 1–65 (answered except 57, 59, 62, 64; rows 34, 48, 49, 58 carry "Clarified 2026-10-08" notes) and the api-contract state notes for row 56.
- Code referenced (read only, not re-audited): `feat/customer-screens` @ `08f9b26`, `feat/api-owner-decisions` @ `0098331`.
- This addendum records **spec changes**, not a new audit. Screens whose required behaviour changed are set to `partial` in `SCREEN_MAP.md` until a re-audit against the updated spec. Screens with only cross-cutting or minor changes keep `matches-design`.

## Spec changes

| Spec | Owner rows | What changed | SCREEN_MAP |
|---|---|---|---|
| `_shared.md` | all | §0.1 index of rows 1, 23–65; §0.2 open rows; scrim and chip text decided; §7 API short names, category-name title fallback, suspended account; §8 total-only fee row, routes (`merchant_direct` / `send_to_runner`), price-change rules, quote expiry and hidden preview; §9 SQ-7..SQ-10; §10 live data, push, places; §11 refund status | — |
| v-track | 23, 27, 29, 30, 40, 44, 49, 65 | Google Maps body; socket with polling only as fallback; runner marker/ETA only in the current assignment window; API short name; Price change only in IN_PROGRESS | matches-design → **partial** |
| v-new-details | 30, 45, 60 | Budget only for Buy For Me / Get It For Me; Google Places client; picked place with coordinates only | matches-design → **partial** |
| v-new-review | 34, 47 | No price until pricing rates exist (variant A notice, `AppConfig.quotePreviewEnabled`); estimate shows the total row only | matches-design → **partial** |
| x-awaiting-quote | 34, 42, 43, 46 | `quote_expired` state + `Request a new quote`; `send_to_runner` wire value and platform-mediated subtitle; merchant details pending vs available | matches-design → **partial** |
| v-payment | 24, 34, 46, 52, 63 | `merchantRoute` body; server TIMEOUT (120 s) wins; `quote_expired` on initiate | matches-design (minor) |
| x-merchant-payment | 42, 43, 44, Needs 41 | Variant B is an STK payment to Nitume with the full STK state table; details-pending state; increases on both routes; `Nothing to pay right now.` approved | matches-design → **partial** |
| v-price-auth | 37, 44, 48, 49, 55, 61 | IN_PROGRESS only; decrease variant; refund-review reject copy; route rows also on `merchant_details_missing` | matches-design → **partial** |
| v-task-detail | 34, 36, 40, 50, 54 | Total-only fee row; refund group; report row only within the dispute window | matches-design → **partial** |
| v-evidence-confirm | 34, 42 | Total-only fee row; `Paid to Nitume for your runner` route line | matches-design → **partial** |
| x-legal, x-support | 39 | `url_launcher` approved: links must open when configured | matches-design → **partial** |
| v-home, v-history, v-rate, v-auth-otp, v-auth-phone, v-profile, v-notifications, x-name-capture, x-report-problem, x-evidence-viewer, x-address-form, v-new-category | 1, 23, 25, 27, 29, 31, 32, 36, 39–41, 50, 60, Needs 40 | Pending references resolved; cross-cutting items below; new notification deep links; FCM registration and removal; suspended-account code | matches-design (unchanged) |
| `docs/design/Nitume_System_Design.md` §3.3 | 56 (8, 10, 35–37, 49, 50) | Diagram with actors, transition table, guarded IN_PROGRESS → CANCELLED, system-only CONFIRMED/SETTLED, admin dispute resolution, DISPUTED → CONFIRMED removed | — |

## Cross-cutting items (one-place fixes; affect screens that stay `matches-design`)

- **CC-4 title fallback** (row 41): `apps/customer_app/lib/src/util/display.dart` `errandTitle()` must return `title ?? <category display name>`; drop the `— <locality>` part. Used on v-home, v-track, v-history, v-rate, x-report-problem, task widgets. Owner: flutter-customer.
- **CC-5 runner short name** (row 40): `display.dart:42` shortens `runner.displayName` with core `shortName()`. Render the API short name as returned; fallback `Your runner`. Owner: api-contract (field), core-ui (model), flutter-customer (display).
- **CC-6 empty-title top bar** (BOARD Needs row 40, approved): `NitumeTopBar` skips an empty title. Owner: core-ui.
- **CC-7 chip text** (row 33): `NitumeDesignChoices.chipHighContrastText = true`. Owner: core-ui. Affects every status chip.
- **CC-8 live data** (rows 23, 29): `RealtimeClient` on `socket_io_client`; screens poll only while disconnected. Owner: core-ui (client), flutter-customer (wiring on v-home, v-track, x-awaiting-quote, v-payment, v-evidence-confirm, x-merchant-payment, app-level `price_change:requested`).
- **CC-9 push** (row 31): FCM token registration after sign-in / name capture, removal on log out, refresh, tap deep links. Owner: core-ui (service), flutter-customer (wiring).
- **CC-10 fee rows** (row 34 clarified): `widgets/task_widgets.dart:93-97` `paidFeeRows()` lists `Service fee` / `Runner fee`; replace with the single `Total (service + runner fee)` row. Owner: flutter-customer. (Recorded under v-task-detail and v-evidence-confirm above.)

## Consolidated needs (2026-10-08)

### core-ui (`packages/nitume_core`)

1. `NitumeDesignChoices.chipHighContrastText = true` (row 33); mark `modalScrim` as decided (row 38; doc comment only).
2. `NitumeTopBar`: no title line or semantics node when `title` is empty (Needs row 40).
3. `RealtimeClient` implementation on `socket_io_client` (row 29): `auth: { token }`, `errand:join` / `errand:leave`, the four events + `location:update`, reconnect with room re-join, a connection-state stream for `Reconnecting…`.
4. Google Places `PlaceSearchService` (Autocomplete + Place Details, session token, 300 ms debounce, key from environment config, absent-safe) (rows 30, 60).
5. Google Maps body for `LiveTrackingMap(mapBuilder:)`: pins, route polyline, animated runner marker, fit bounds; absent-safe without a key (row 30).
6. FCM service on `firebase_messaging`: permission prompt, token, register/remove through the devices repository, token refresh, notification-tap stream (row 31).
7. Link opening over `url_launcher` for `AppConfig.termsLink` / `privacyLink` / `supportLink` (row 39), if it lives in core rather than the app.
8. `AppConfig.quotePreviewEnabled` (default `false`) (row 47).
9. `ApiErrorCodes`: `quote_expired`, `account_suspended`, `price_change_already_decided` (the last one is the open Needs row 39).
10. Models and repositories: runner short name on `RunnerPublicSummary` / assignment; `merchantDetailsAvailable` on `Errand`; customer refund view (`status`, `refundAmount`, `paidAt`, `trigger`) on the payment summary or errand; `stkStatus` on item payments; `refundReview` on `PriceChangeDecision`; repository calls for the item-amount STK initiate and the fresh-quote request (shapes from api-contract).
11. Stop using `shortName()` for runner names (keep it only if another caller needs it).

### api-contract (`apps/api`)

1. Runner short name computed server-side on runner summaries and the errand assignment (row 40).
2. `PRICE_CHANGEABLE` = IN_PROGRESS only (row 49 clarification).
3. Price decrease opens an admin refund review for any already-paid difference; the approve response says so (`refundReview` or equivalent); allow more than one review per errand or merge them, and add a decrease trigger (row 48 clarification). Depends on schema row 62 (open).
4. Customer-readable refund status for the customer's own errand (no decision note, no payout reference) (row 54).
5. `send_to_runner`: STK initiation to Nitume for the item amount and for increase differences, with `Idempotency-Key`, and `stkStatus` on those payments (rows 42, 44). Today these are `PENDING` records without an STK, and the code comment says the merchant amount never goes through Nitume (contradicts row 42).
6. Merchant Till/Paybill source supplied by the merchant or an admin (row 43): storage + admin write endpoint; `merchantDetailsFor` returns real data; a customer-safe `merchantDetailsAvailable` flag on the errand before payment.
7. `quote_expired` on QUOTED → ACCEPTED and on fee initiation when the quote has expired (row 46); a fresh-quote request endpoint (e.g. `POST /errands/:id/quote-request`, no state change) pending SQ-9.
8. Validation: reject `budget > 0` outside `buy_for_me` / `pickup_delivery` (row 45); reject locations without coordinates (row 60).
9. Tracking: confirm no runner position outside RUNNER_ASSIGNED … IN_PROGRESS or for a non-current assignment (rows 27, 65).
10. `account_suspended` error code on OTP verify and token refresh (existing need).
11. Notification event types: price change requested, payment confirmed / failed, item payment confirmed / failed, merchant details added, refund status changed, dispute resolved, rating reminder (optional quote expired).
12. Provider failure reason on the payment summary (existing need); Daraja STK Query behind TIMEOUT (row 52).

### flutter-customer (`apps/customer_app`)

1. Partial screens, per their updated specs: v-track, v-new-details, v-new-review, x-awaiting-quote, x-merchant-payment, v-price-auth, v-task-detail, v-evidence-confirm, x-legal, x-support (each spec's "Current vs design" lists the gap).
2. CC-4, CC-5, CC-10 (above).
3. Wire CC-8 (socket, polling only while disconnected) and CC-9 (FCM register after sign-in and name capture, remove on log out, deep links per `v-notifications`).
4. Add `url_launcher` (approved, row 39) unless core-ui owns it; legal links with 48dp hit areas (v-auth-phone minor).
5. v-payment: client confirmation window ≥ 120 s or none when `stkStatus` is present (`payment_screen.dart:22` is 90 s); handle `quote_expired` on initiate.
6. x-merchant-payment: snackbar `Nothing to pay right now.` on the self-close (Needs row 41); share one STK widget between v-payment and variant B.
7. Suspended account mid-session → sign out, reset to `v-auth-phone`, snackbar `This account can't sign in. Contact support.` (`_shared.md` §7).
8. x-evidence-viewer: wire the `onLoadError` re-fetch for expired signed links (row 25).

### web-parity (`apps/admin`)

1. Admin entry of merchant Till/Paybill details per errand (row 43), once api-contract adds the endpoint.
2. Refund reviews (existing need) now also include price decreases (row 48).

## Questions for the owner (new)

- **SQ-7 … SQ-10 answered 2026-10-09** (rows 66–69); see the addendum below. Original wording kept for the record.
- **SQ-7** (payments, system design): row 42 has the customer pay the item amount to Nitume for `send_to_runner`, but `docs/design/Nitume_System_Design.md` §2.2 and §6 still say Nitume never takes customer purchase money. Confirm the settlement model so the text outside §3.3 can be corrected.
- **SQ-8** (payments): a `merchant_direct` increase cannot be pushed by STK on the merchant's own Till/Paybill without a merchant integration. Default: the customer pays the extra to the same Till/Paybill from their own M-Pesa.
- **SQ-9** (state machine, payments): after `quote_expired`, does the customer request a new quote (default, new endpoint, errand stays QUOTED) or do ops re-quote automatically?
- **SQ-10** (privacy): may the customer see the admin's refund decision note? Default: no.
- Carried over, still unanswered at screen level: `x-merchant-payment` Q1 (customer confirms paying the merchant), `x-payment-method-form` Q1 (number verification), `x-report-problem` Q1 (dispute photos), `x-legal` Q1 and `x-support` Q1 (URL values per environment), `v-new-details` Q2 (end-of-day deadlines).

## Addendum 2026-10-09: owner answers round 3 (BOARD rows 59–94)

Applied on `docs/owner-answers-3` (from `main` @ `c7675dc`). The customer app and API are on `main`, so the references below are to `main`.

### What changed in the docs

| Row | Decision | Docs changed | Screen status |
|---|---|---|---|
| 70 | `docs/design/Nitume_System_Design.md` is canonical; the root copy is removed (it had no content of its own) | system design, SCREEN_MAP, `_shared.md` | — |
| 66, 67, 76, 91 | §2.2/§6 rewritten: send-to-runner is platform-mediated (customer pays Nitume in one combined STK; Nitume pays the runner through the payout ledger); merchant-direct stays customer to merchant, increases paid manually to the same Till; approved copy `Includes KSh … for your runner's purchase.` | system design §2.2, §6; `_shared.md` §8; v-payment; x-merchant-payment; v-price-auth | v-payment, v-price-auth unchanged |
| 68, 72, 83, 88 | `Request a new quote` after expiry, then an admin re-quotes (also while ACCEPTED); every quote has an expiry (24 h default); re-quote only after expiry | `_shared.md` §8.3; x-awaiting-quote | x-awaiting-quote → **partial** |
| 69 | The refund decision note is never shown to the customer | `_shared.md` §11; v-task-detail | unchanged |
| 79 | The dispute resolution note is shown to customer and runner; internal notes separate | x-report-problem; `_shared.md` §11 | unchanged |
| 80 | Item amounts only for Buy For Me / Get It For Me; warn (never block) when merchant details change after a merchant-direct payment started | `_shared.md` §8.2; x-awaiting-quote; x-merchant-payment; v-notifications | x-merchant-payment → **partial** |
| 82 | `KSh` everywhere, notifications included | `_shared.md` §7; v-notifications | unchanged (API change) |
| 86, 87, 81 | Decrease refund reviews only on send_to_runner; cancellation ceiling net of earlier refunds; ceiling includes item amount paid to Nitume | `_shared.md` §8.2, §11; v-price-auth; v-task-detail | unchanged (API change) |
| 62, 94, 59 | Schema approved and closed; `.env.example` setup | `_shared.md` §0 | — |

### Builder lists

#### api-contract (`apps/api`)

1. **Quote request (row 68)**: `POST /errands/:id/quote-request` (customer, own errand; QUOTED or ACCEPTED with an expired newest quote; idempotent; `quote_still_valid` 409 otherwise; no state change). Expose `quoteRequestedAt` on `GET /errands/:id` and the list; clear it (or leave it older than the newest quote) on re-quote. Notify ops. If storage needs a new column, raise it as a schema change for the owner first.
2. **Quote expiry (row 83)**: server default `expiresAt` = now + 24 h when the admin sends none; no new quote with `null`. Backfill legacy null-expiry quotes to `createdAt + 24 h` so they can be replaced (data fix).
3. **Decrease refunds (row 86)**: `price-change.service.ts:186-189` opens a decrease review on every route; open it only when the item route is `send_to_runner`. The decision's `refundReview` stays null otherwise.
4. **Cumulative refund cap (row 87)**: the cancellation review's `amountPaid` is net of the errand's other approved/refunded reviews (`refunds.service.ts:508` sums every completed leg today); at decision time cap every review at `min(amountPaid, totalPaidToNitume − Σ other approved/refunded refundAmount)` and answer `refund_exceeds_amount_paid` with the effective ceiling.
5. **KSh in notifications (row 82)**: `notifications.service.ts:331, 340-341, 360, 372` write `KES ${raw}`; use `KSh` and the app's money format (`KSh 40,000`, `KSh 1,250.50`).
6. **Merchant details (row 80)**: refuse `PUT /errands/:id/merchant-details` for categories other than `buy_for_me` / `pickup_delivery` (`merchant_details_not_applicable`); when details change on a task whose `merchant_direct` payment has started, set `merchantDetailsUpdatedAt` (on the `merchantPayment` view) and send `merchant_details.changed` to the customer (push + in-app).
7. **Customer refund view (minor, rows 54, 69)**: drop `payoutReference` from `toCustomerView` (the decision note is already excluded).

#### core-ui (`packages/nitume_core`)

1. Errand model: `quoteRequestedAt` (nullable). Repository: `requestNewQuote(errandId)` for item 1 above.
2. Merchant payment model: `merchantDetailsUpdatedAt` (nullable) and, if not already there, the fee payment's confirmation time.
3. Notification event constant `merchant_details.changed` (`NotificationEventType`; `quote.reissued` and `merchant_details.added` exist). Error code `quote_still_valid` in `ApiErrorCodes` (not there today).

#### flutter-customer (`apps/customer_app`)

1. **x-awaiting-quote** (spec "Current vs design" 1–2): replace the expired fallback (`awaiting_quote_screen.dart:486`) with the notice `This quote has expired. Ask for a new quote to continue.` and the CTA `Request a new quote` (QUOTED and ACCEPTED), the snackbar and error copy, and the **New quote requested** waiting state restored from `quoteRequestedAt`; switch to checkout when the new quote arrives. Tests for expired → requested → re-quoted.
2. **x-merchant-payment**: the **Details changed** notice in variant A (C-40, Fira Code date/time, optional Support line), refreshed on `merchant_details.changed` and on the existing `merchant_details:updated` socket event. Test with and without the change.
3. **v-notifications**: deep link for `merchant_details.changed` → `x-merchant-payment` (`navigation/nav.dart`; `quote.reissued` is already routed at `:155`).
4. No change, confirmations only: v-payment (row 91 copy approved as built), v-price-auth (refund snackbar already keyed off `refundReview`), v-task-detail (decision note already hidden), x-report-problem (resolution note already shown).

#### web-parity

See the "Owner answers round 3" addendum in `docs/audits/admin-gap-report.md`.

### Questions for the owner (new)

- **SQ-11 (payments, no customer UI impact)**: on `send_to_runner`, when does Nitume pay the runner the item amount through the payout ledger: before the purchase (so the runner has the money to buy) or as a reimbursement after the receipt is uploaded? System design §6 now says "Nitume pays the runner through the payout ledger" without a timing. Needed by the runner app and the payout worker.
- Carried over, still unanswered at screen level: `x-merchant-payment` Q1 (customer confirms paying the merchant), `x-awaiting-quote` Q2 (route change after payment), `x-payment-method-form` Q1, `x-report-problem` Q1, `x-legal` Q1, `x-support` Q1, `v-new-details` Q2.


## Re-audit 2026-10-09: customer round 4 (owner answers round 3), round 1

- Code audited, read only: `feat/customer-owner-answers` @ `c420265` in `/Users/san/Projects/nitume-customer-answers4`. Core `380084f` … `e304160`, `da5e58a`; app `e283201`, `6974c27`, `54a0f99`, `ddae9fe`, `1b61468`, `5e6f270`, `a55402f`, `c420265`. API shapes read from `feat/api-owner-answers-4` @ `124d81e` (not yet on `main`).
- Specs: the round-4 customer specs on `docs/owner-answers-3` (rows 59–94), plus the addendum above.
- This is round 1 for these changes.

### Build health

| Check | Result |
|---|---|
| `flutter analyze` apps/customer_app | No issues |
| `flutter test` apps/customer_app | 108 passed (incl. `test/round4_test.dart`, new cases in `test/checkout_round2_test.dart`) |
| `flutter analyze` packages/nitume_core | No issues |
| `flutter test` packages/nitume_core | 223 passed |
| Token scan of `apps/customer_app/lib` (`Color(0x`, Material `Colors.`, `fontFamily`, `GoogleFonts`, hex) | 0 hits (only `NitumeColors.*`) |
| Escrow / wallet words | 0 user-facing hits (one code comment saying "No escrow wording") |
| API shapes used by the app | All present on `feat/api-owner-answers-4`: `POST /errands/:id/quote-request`, `quoteRequestedAt`, `quoteExpiresAt`, `merchantPayment.merchantDetailsUpdatedAt` + `merchantDetailsChangedAfterPayment`, `failureReason` on the payment summary and difference payments, dispute `verdict` / `resolvedAt`, `title` on create, socket `merchant_details:changed`, `quote:requested`, `errand:access_revoked`, notification type `merchant_details.changed` |
| Device builds | Not run (unchanged note from earlier rounds) |

### Summary

| Screen / item | Verdict | Blockers | Minors | SCREEN_MAP |
|---|---|---|---|---|
| x-awaiting-quote | PASS | 0 | 1 | partial → matches-design |
| x-merchant-payment | PASS | 0 | 1 | partial → matches-design |
| x-report-problem | PASS | 0 | 0 | matches-design |
| v-notifications | PASS | 0 | 1 | matches-design |
| v-track | PASS | 0 | 1 | matches-design |
| v-payment | PASS | 0 | 0 | matches-design |
| v-new-details | PASS | 0 | 0 | matches-design |
| Row 59 setup | PASS | 0 | 0 | — |
| Other screens (spot-check) | No regression | 0 | 0 | unchanged |

All customer screens are `matches-design`. No blockers.

### x-awaiting-quote — PASS

Expired state on QUOTED and ACCEPTED: chip hidden, `Expired at …`, route and Pay-with cards hidden, notice `This quote has expired. Ask for a new quote to continue.`, fixed CTA `Request a new quote` (spinner while in flight, disabled while cancelling), decline still available. Success → snackbar `We've asked for a new quote.` and the **New quote requested** waiting layout (`Preparing a new quote`, spec body, `Requested Today, 4:45 PM` as a Fira Code meta line via `NitumeTextStyles.metaLarge`, summary card without chip, `Back to Home` / `Cancel task`, no second request button). `quote_still_valid` → reload to checkout; `quote_request_not_allowed` → reload (not in the spec; reasonable, accepted); other errors → `Couldn't request a new quote. Try again.` and the expired state stays. The open request is restored on every open from `quoteRequestedAt` later than the newest quote's `createdAt` (`_newQuoteRequested`). A re-quote (`quote:reissued`, status change, `quote:requested` from another device, or the 15 s poll while disconnected) switches back to checkout and announces `Your new quote is ready.`; on ACCEPTED the newest quote is accepted before paying (row 72, unchanged). Tests cover expired → requested → re-quoted, restore on open, `quote_still_valid` and the error path.

1. Minor — `screens/checkout/awaiting_quote_screen.dart:579`: stale comment `// No quote-request endpoint yet (SQ-9): the spec's fallback.` above the expired notice. The endpoint now exists. Fix: update or remove the comment.

### x-merchant-payment — PASS

Variant A shows the **Details changed** C-40 notice (info icon, no red or amber) above the card, after the intro, with `The merchant's payment details changed on <Today, 4:45 PM>. Check the number below before you pay.` (date/time as a `NumSpan`, Fira Code); the second line `Already paid the old number? Contact support.` and a `Contact support` link appear only when Support is configured, opening `AppConfig.supportLink` (failure snackbar `Couldn't open support. Try again later.`). The card shows only the current details. The screen reloads on `merchant_details:changed` and `merchant_details:updated`. Driven by the API flag `merchantDetailsChangedAfterPayment` (the API compares `merchantDetailsUpdatedAt` with the payment's creation time, i.e. when the merchant-direct payment started, which is row 80's wording; the spec's "fee payment's confirmation time" is updated to match). Variant B's FAILED state shows the provider failure reason as a second line (shared `StkStatusView`). Tests with and without the change.

1. Minor — `screens/checkout/merchant_payment_screen.dart:393` and `:400`: the notice text ends with `Contact support.` and the trailing link also reads `Contact support`, so the words appear twice side by side. Spec: one second line `Already paid the old number? Contact support.` where `Contact support` is the link. Fix: drop `Contact support.` from the text span (keep `Already paid the old number?`) and keep the link, or make the words themselves the link.

### x-report-problem — PASS

Read mode `Outcome` shows the admin's resolution note (the API's `rationale`, required, 20–2000 characters, so a resolved dispute always has one) with `Resolved <Mon, 2:15 PM>` from `resolvedAt` (fallback `updatedAt`), Fira Code meta. The API sends `resolvedBy: null` and no internal `comment` events to customers (row 79). Test covers note and time.

**Judgement: verdict line (row 79).** Row 79 approves showing the resolution *note* to both parties; it says nothing about a separate verdict label. The customer already sees the outcome three ways: the note itself (written by the admin for both parties), the dispute chip `Resolved`, and the errand's state and refund group on `v-task-detail` (COMPLETED vs CANCELLED, `_shared.md` §11). A verdict label ("in your favour" / "in the runner's favour") would be new customer-facing copy about a judgement between two parties, which the documents do not ask for. **Not required; no finding.** The spec now records this decision and offers proposed copy as an optional owner question (x-report-problem Q2) in case the owner wants it.

### v-notifications — PASS

`Mark all read` now sits in the header through the core `NitumePushedHeader.trailing` slot (C-04 small text button, 48 dp hit area), only while unread rows exist; the round-1 minor is closed. `merchant_details.changed` → `x-merchant-payment` (`navigation/nav.dart:160`) with the storefront icon; `quote.requested` is admin-feed only on the API (`ADMIN_FEED_KINDS`) and is ignored if it ever reaches the app. Bodies render as returned (`KSh` is now the API's wording, row 82).

1. Minor — no test for the `merchant_details.changed` row/push deep link (`test/round4_test.dart` covers `Mark all read` only). Fix: add a `Nav.openNotification` case to the deep-link tests.

### v-track — PASS

`errand:access_revoked` for the selected errand cancels its watch, clears the runner marker and ETA at once and reloads (`screens/shell/track_tab.dart:154-160`); the reload then follows the existing 403/404 rule. A customer is only evicted if they lose access to their own errand, so in practice this is defensive; a re-join after reload is refused by the server (`forbidden` ack), so there is no loop. No-key fallback `SchematicMap` runner dot is now 16 × 16 overall with the 3 px white ring, centred with −8 offsets (round-2 minor closed; test `schematic fallback: runner dot is 16px overall`).

1. Minor — no test for the access-revoked path. Fix: a Track test that emits `errand:access_revoked` on the fake realtime client and checks the marker and ETA are gone.

### v-payment — PASS

Idempotency keys now persist per errand in core `SecureIdempotencyKeyStore` through `PaymentAttemptKeys` (`keyFor` reuses, `newAttempt` removes), so a restart reuses the same attempt's key (row 24); keys are cleared when the session ends (`app.dart:98`, every signed-out cause). Provider failure reason (`failureReason` on the payment summary, Daraja `ResultDesc`) shows as a second line under the FAILED body; nothing when absent. The open minor from 2026-10-07 is closed. Test covers the reason line and key persistence / clearing.

### v-new-details — PASS

Core `PlaceAutocompleteField.onTextChanged` reports the field text; the screen keeps it per field key and, on Continue, marks a field with text but no pick as typed, so it shows `Choose a place from the list.`; clearing the text returns to the empty-field copy. The round-2 minor is closed. `title` now travels in `POST /errands` (`TaskDraft.toRequest`, trimmed, omitted when blank); the separate `updateTitle` call is gone, and the client's 3-character minimum matches the API's `MinLength(3)`. Tests cover both.

### Row 59 setup — PASS

`.env.example` committed with every compile-time key the app reads (`NITUME_API_BASE_URL`, `NITUME_PLACES_API_KEY`, `NITUME_MAPS_ENABLED`, `NITUME_TERMS_URL`, `NITUME_PRIVACY_URL`, `NITUME_SUPPORT_URI`, `NITUME_QUOTE_PREVIEW`) plus `NITUME_MAPS_API_KEY`, which the Android Gradle script reads from the dart-defines; `.env` gitignored (`.gitignore:56`); `.env` removed from pubspec assets and `flutter_dotenv` dropped; `resolveApiBaseUrl()` reads only `String.fromEnvironment`; README documents `cp .env.example .env` and `flutter run --dart-define-from-file=.env`. Tests run on a checkout without `.env`.

Note (not a finding, unchanged from earlier rounds): the default base URL in `config/api_base_url.dart` is a temporary trycloudflare tunnel.

### Regression spot-check

- Session end: the app's `BeforeClearTokenStore` is replaced by core `beforeSessionCleared` (5 s cap, re-entry guarded); log out still unregisters itself first (`_loggingOut`); suspension still resets to `v-auth-phone` with `This account can't sign in. Contact support.` No regression.
- v-task-detail refund group: core `CustomerRefund` no longer parses a payout reference (removed from the customer view, row 101) and adds `remainingRefundable`; the app never showed either. No regression.
- v-home, v-history, v-rate, v-profile, v-evidence-confirm, v-price-auth, v-new-review, v-new-category, auth screens, x-address-form, x-evidence-viewer, v-payment-methods, x-payment-method-form, x-legal, x-support, shell: files unchanged in this round apart from shared widgets above; tests pass. No regression.

### Needs raised

- flutter-customer (minors, non-blocking): x-awaiting-quote 1 (stale comment), x-merchant-payment 1 (duplicated `Contact support`), v-notifications 1 and v-track 1 (tests).
- core-ui, api-contract: none. The app depends on `feat/api-owner-answers-4`; it must merge with or before `feat/customer-owner-answers`.

### Questions for the owner

- x-report-problem Q2 (optional, non-blocking): show a one-line verdict above the resolution note? Default: no.
