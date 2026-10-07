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
