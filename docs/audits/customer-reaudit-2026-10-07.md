# Customer app — post-build re-audit (2026-10-07)

- Auditor: `design-auditor`
- Code audited: worktree `nitume-customer-screens`, branch `feat/customer-screens` at `4312f49` (`apps/customer_app`, `packages/nitume_core`). Paths below are relative to that branch.
- Specs: `docs/specs/customer/*.md` as on `docs/customer-spec-answers`, plus the re-audit spec updates on `docs/customer-reaudit` (commit `9f1ed41`).
- Mockup `docs/design/nitume_customer_app.html`; design system `docs/design/nitume_design_system.html`.
- Baseline (pre-build) report: `docs/audits/customer-gap-report.md`.

## Verdict rule used

- **Blocker**: structure, flow or state wrong against the spec; copy that contradicts the spec or an owner answer; a domain or payment rule broken; a palette or contrast rule broken; wrong data written. Any blocker → **FAIL**.
- **Minor**: small layout or copy drift, a missing test for an undrawn screen, or a defect whose fix sits in `nitume_core`. Minor-only screens **PASS** and are `matches-design`; their minors stay open as follow-ups.
- Items that wait on an open BOARD row and are built as the spec's fallback count as PASS. They are listed as **notes**, not findings.

## Build health

| Check | Result |
|---|---|
| `flutter analyze` apps/customer_app | No issues |
| `flutter analyze` packages/nitume_core | No issues |
| `flutter test` apps/customer_app | 41 passed |
| `flutter test` packages/nitume_core | 106 passed |
| Screens without a dedicated test | x-legal, x-evidence-viewer (minor each). Shell is covered through `auth_test.dart:143` and the `New task` taps in `core_flow_test.dart`; x-support through `account_test.dart:184` |

## Token, typography and domain scans (whole app)

| Scan | Result |
|---|---|
| `rg "Color\(0x\|[^e]Colors\." apps/customer_app/lib` | 0 hits. Every colour is a `NitumeColors` token |
| `rg "#[0-9A-Fa-f]{6}" apps/customer_app/lib` | 0 hits |
| `rg "fontFamily\|GoogleFonts\|FiraCode\|FiraSans" apps/customer_app/lib` | 0 hits. Numbers go through `NitumeTypography.numeric`, `NumText` or `NitumeTextStyles.meta*` |
| Red / amber use | Only through `NitumeDesignChoices` (`fieldError`, `destructiveText`, `unreadDot`, `priceChangeAmount`) and chip tones. Matches OA-13 |
| Green use | Primary buttons, success icon circle, runner dot / drop-off pin, link text green-700. Payment FAILED icon uses slate + blue, not red (OA-13). OK |
| White on blue/green | Active card, avatar glyph, evidence viewer, primary buttons. OK |
| Escrow / wallet words | 0 user-facing hits. One code comment (`evidence_confirm_screen.dart:23`, "No escrow wording") |
| Categories | Five MVP tiles from core `mvpCustomerCategories`; full names; no `Business Tasks` in the app |
| State machine | Transitions fired: DRAFT → CANCELLED (abandoned wizard), DRAFT → REQUESTED, REQUESTED/QUOTED → CANCELLED, QUOTED → ACCEPTED, AWAITING_CUSTOMER → COMPLETED, IN_PROGRESS → DISPUTED etc. via `POST /disputes`, price-change reject via its endpoint. No invented states. Labels from core `statusPresentation` (see CC-1) |

## Summary

| Screen | Verdict | Blockers | Minors | SCREEN_MAP status |
|---|---|---|---|---|
| v-auth-phone | PASS | 0 | 1 | matches-design |
| v-auth-otp | PASS | 0 | 0 | matches-design |
| x-name-capture | PASS | 0 | 1 | matches-design |
| x-legal | PASS | 0 | 1 | matches-design |
| shell | PASS | 0 | 0 | matches-design |
| v-home | PASS | 0 | 2 | matches-design |
| v-new-category | PASS | 0 | 0 | matches-design |
| v-new-details | PASS | 0 | 2 | matches-design |
| v-new-review | PASS | 0 | 1 | matches-design |
| x-awaiting-quote | **FAIL** | 1 | 2 | built |
| v-payment | PASS | 0 | 2 | matches-design |
| x-merchant-payment | PASS | 0 | 1 | matches-design |
| v-price-auth | **FAIL** | 1 | 2 | built |
| v-track | PASS | 0 | 1 | matches-design |
| v-task-detail | PASS | 0 | 2 | matches-design |
| v-evidence-confirm | PASS | 0 | 1 | matches-design |
| v-rate | PASS | 0 | 1 | matches-design |
| x-report-problem | PASS | 0 | 0 | matches-design |
| x-evidence-viewer | PASS | 0 | 1 | matches-design |
| v-history | PASS | 0 | 1 | matches-design |
| v-notifications | PASS | 0 | 1 | matches-design |
| v-addresses | PASS | 0 | 0 | matches-design |
| x-address-form | **FAIL** | 2 | 1 | built |
| v-payment-methods | PASS | 0 | 1 | matches-design |
| x-payment-method-form | PASS | 0 | 1 | matches-design |
| v-profile | PASS | 0 | 0 | matches-design |
| x-support | PASS | 0 | 0 | matches-design |

**24 PASS, 3 FAIL** (x-awaiting-quote, v-price-auth, x-address-form). Four blockers in total, all in `apps/customer_app`.

## Judgements on the known deviations

| Deviation | Judgement |
|---|---|
| x-address-form saves typed addresses without coordinates (spec: Save disabled until Places) | **Blocker** (x-address-form 1). It does not follow the spec fallback. The addresses it creates can never be used in the wizard: `SavedPlaceSearch` silently drops them, and nothing on `v-addresses` says so. Editing the text also keeps the old coordinates (x-address-form 2). BOARD row 60 is the owner question; the spec stays as written until it is answered. |
| Numbers in Fira Sans inside core string-only widgets | **Minor**, cross-cutting CC-2, fix owner core-ui. Four places: a count in a link label, a count in a section label, an amount in a notice and an amount in a button label. The core widgets (`NitumeButton`, `NitumeNotice`, `SectionLabel`) take only a `String`. Screens are not failed for it. It must be fixed before review, because rule 4 requires Fira Code for every spec'd numeric field. |
| Price-change approve auto-retries with send-to-runner | **Blocker** (v-price-auth 1). It chooses a payment route for the customer without asking. OA-5 says the customer picks the route; payments are a §3 stop-and-ask item; SQ-5 (send-to-runner mechanics) and rows 44/48 are open. A new owner question has been added to the spec (v-price-auth Q2) with a build default. |
| Builder copy: title min-3 message | **Accepted.** The API needs 3–120 characters. Added to `v-new-details.md`. |
| Builder copy: no-Places notice | **Accepted** as the row 30 fallback. Added to `v-new-details.md`. Remove it when Places ships. |
| Builder copy: `Enter an address.` | **Not accepted.** It only exists because of the manual-entry deviation (x-address-form 1). It goes away with that fix, or is specced if the owner approves manual addresses (row 60). |
| Builder copy: `Discard your changes?` | **Accepted** for x-address-form and x-payment-method-form. Added to both specs. |
| Builder copy: `No report for this task.` (and `Couldn't load your report.`) | **Accepted.** Added to `x-report-problem.md`. |
| Builder copy: `Couldn't load this payment.` | **Accepted.** Added to `v-payment.md`. |
| Also accepted: `Enter the 6-digit code.` (v-auth-otp) | Added to `v-auth-otp.md`. |
| Also accepted: checkout re-entry for an ACCEPTED errand (x-awaiting-quote shows checkout again instead of replacing itself with v-payment) | Necessary, because the route must be chosen before the STK push. Spec amended (`x-awaiting-quote.md` Entry/exit). |

## Cross-cutting findings (fix owner: core-ui unless stated)

- **CC-1 (minor, latent).** `packages/nitume_core/lib/src/widgets/status_presentation.dart:31` labels CONFIRMED `Confirmed`. Owner answer row 35: CONFIRMED and SETTLED are system-only and never shown in the customer UI. Fix: label CONFIRMED `Completed` (success), as SETTLED already is; `_shared.md` §6 updated. Latent because nothing moves errands to CONFIRMED until the dispute-window scheduler exists (BOARD needs row "Scheduler job … blocked"). Affects v-home Recent, v-history and v-task-detail chips.
- **CC-2 (minor).** No way to render a numeric span in Fira Code inside `NitumeButton` labels, `NitumeNotice.message` or `SectionLabel`. Instances: `apps/customer_app/lib/src/screens/shell/home_tab.dart:222` (`+N more in progress`), `screens/shell/track_tab.dart:451` (`Pay the item amount: KSh 40,000`), `screens/checkout/price_change_dialog.dart:235` (`Approve KSh 5,000 increase`), `screens/task/evidence_confirm_screen.dart:133` (`Photos & video (4)`). Fix: core-ui adds a numeric-span option (e.g. `numericSuffix`, as `ActiveTaskCard` already has, or an `InlineSpan` label); flutter-customer then switches these four call sites.
- **CC-3 (minor, reuse).** `apps/customer_app/lib/src/widgets/common.dart:82-139` `NameAvatar` re-implements the C-12 person-glyph fallback in the app (blue circle + white glyph), used on v-home, v-profile and v-rate. Fix: core-ui adds the glyph fallback to `InitialsAvatar` (flutter-customer need already on the BOARD); the app deletes `NameAvatar`.
- **Accepted app-local widget.** `widgets/schematic_map.dart` is the body passed to core `LiveTrackingMap(mapBuilder:)` until the maps SDK is approved (row 30). It uses tokens only (blue-050 fill, blue/green pins, green runner dot with a 3px white ring, no shadow). Not a reuse violation: core provides the slot for exactly this.

---

## v-auth-phone — PASS

Implementation: `screens/auth/phone_screen.dart`, `screens/auth/auth_frame.dart`.

Structure, copy, states (invalid number, cooldown → OTP with remaining time, hourly limit with Fira Code minutes, delivery failure, generic), phone field in Fira Code, legal line: all match.

1. Minor — `phone_screen.dart:153-171`. Spec (Accessibility): legal link spans need 48dp hit areas. Code: a `TapGestureRecognizer` on a `TextSpan` only hits the glyphs; the 12px vertical padding on the line does not extend it. Fix: when the links become active (SQ-2), render the two links as C-04 link buttons in a `Wrap`, or wrap each span in a `WidgetSpan` with a 48dp target. Inactive today (plain text, no opener), so it has no effect yet.

## v-auth-otp — PASS

Implementation: `screens/auth/otp_screen.dart`.

Pushed header with back only, six-box `OtpCodeField`, `ResendCooldown` + `OtpResendLine`, the OA-17 states (`incorrect`, `attemptsExhausted`, `expired`, rate limit with resend hidden), suspended account with `Contact support` when configured, `role: customer` sent, phone in Fira Code: all match. `Enter the 6-digit code.` accepted into the spec.

Notes: FCM registration after sign-in waits on row 31.

## x-name-capture — PASS

Implementation: `screens/auth/name_capture_screen.dart`; routed by `app.dart:69` (`SessionStatus.needsName`).

1. Minor — `name_capture_screen.dart:65-77`. Spec (Components): `TextCapitalization.words`. Code: not set; core `NitumeField` has no `textCapitalization` parameter. Fix: core-ui adds the parameter (need already on the BOARD), then pass `TextCapitalization.words`.

## x-legal — PASS

Implementation: `screens/auth/phone_screen.dart:135-196` (`_LegalLine`) + core `AppConfig.termsLink` / `privacyLink`.

Plain text while no URL or opener is configured (SQ-2 fallback), green-700 link spans and the `Couldn't open the page. Try again later.` snackbar when configured.

1. Minor — `test/auth_test.dart`. There is no test that the legal line renders as plain text when unconfigured and as links when configured. Fix: add one widget test with a fake `AppConfig(onOpenLink:)`.

## shell — PASS

Implementation: `screens/shell/home_shell.dart`, `services/shell_controller.dart`, core `NitumeTabBar`.

Five items (Home, New task, Track, History, Profile). `New task` pushes `v-new-category` over the shell instead of showing a root view. Pushed routes cover the tab bar. `resetToTrack` selects Track on the paid errand (OA-21). On app resume a pending price change opens the modal (v-price-auth entry).

## v-home — PASS

Implementation: `screens/shell/home_tab.dart`.

Greeting by first name, bell with the red unread count, avatar → Profile tab, search row and tiles → wizard (tiles preselect), five-tile grid, active card per state (tag chip-info with category + reference, slate-400 Fira Code meta, pill green button), `+N more`, Recent rows with chips, skeleton and error with categories still usable: all match.

1. Minor — `home_tab.dart:222`. `+N more in progress`: N renders in Fira Sans (CC-2).
2. Minor — `home_tab.dart:155-157`. Spec (Copy): with no name, show the greeting line only and hide the name line. Code: the greeting is promoted to the 21/700 title. Fix: pass the greeting as the small line and an empty title, or give `NitumeTopBar` a greeting-only mode. Rare: name capture runs first.

Notes: the en-route meta has no `· ETA 12 min` until location updates exist (rows 29/30).

## v-new-category — PASS

Implementation: `screens/wizard/category_screen.dart`.

Pushed header `New task` + `Step 1 of 3`, stepper 1/3, section label `What do you need done?`, core `CategoryGrid` (five MVP tiles, 3 + 2), CTA `Continue →` disabled until a selection, discard dialog (`Discard this task?` / `What you've entered so far will be lost.` / `Discard` red outline / `Keep editing`), category change clears the category-specific fields. Leaving after a DRAFT was created fires DRAFT → CANCELLED (OA-9).

## v-new-details — PASS

Implementation: `screens/wizard/details_screen.dart`, `screens/wizard/task_draft.dart`, `services/saved_place_search.dart`.

Card order and headings, pickup + drop-off for Get It / Buy For Me, the shopping list (C-37) for Buy For Me, deadline chips with Today default and `deadlineAt` at 23:59 local, no `urgency` sent, budget required for Buy For Me, validation copy and scroll-to-first-error: all match. Title-minimum and no-Places notice copy accepted into the spec.

1. Minor — `details_screen.dart:133`. A chosen place is passed as `hint`, so it shows in slate-400 placeholder style and looks unfilled. Spec: the field shows the selected place. Fix: core-ui adds an initial value to `PlaceAutocompleteField` (need already on the BOARD); pass the chosen address as the value.
2. Minor — `details_screen.dart:268`. Spec (Copy): budget placeholder `KSh 0`. Code: hint `0`. Material shows `prefixText` (`KSh `) only when the field is focused or filled, so the unfocused field reads `0`. Fix: hint `KSh 0` without the prefix while empty, or make the core money field always show the prefix.

Notes: with no Places client (row 30) only saved addresses that have coordinates can be chosen. Today none can be created (see x-address-form), so task creation is blocked in practice: BOARD row 60.

## v-new-review — PASS

Implementation: `screens/wizard/review_screen.dart`.

Built as the spec's "estimate unavailable" state, because the preview endpoint does not exist (row 47). Header `Review` + `Step 3 of 3`, the item budget kept separate with its caption, `Submit task →`, create once then submit, retry only re-submits the same id, 400 → snackbar + back to step 2, submit error snackbar, wizard stack replaced by `x-awaiting-quote`.

1. Minor — `review_screen.dart:81-88`. Spec (Layout 3.1 + States): the notice sits inside the `Estimated price` form card. Code: a standalone `NitumeNotice` with no card heading. Fix: wrap the notice in `NitumeFormCard(label: 'Estimated price')`.

## x-awaiting-quote — FAIL

Implementation: `screens/checkout/awaiting_quote_screen.dart`, `widgets/task_widgets.dart`.

Waiting state, polling every 15 s while REQUESTED, the live switch with the `Your quote is ready.` announcement, route rows (merchant-direct disabled per SQ-6, send-to-runner default, no runner advance), `Pay with` card with the sign-in-number fallback and `Change`, `Decline and cancel task`, the cancel dialog, the expired notice with the CTA disabled, and 409 reload all match.

1. **Blocker** — `widgets/task_widgets.dart:54-68`, used at `awaiting_quote_screen.dart:362-369`. Spec (Layout checkout 2.2, Data; `_shared.md` §8; OA-4): the customer sees `Service fee`, `Runner fee` and `Total (service + runner fee)`, never internal pricing. Code: `quoteRows()` lists the API quote components `Base fee`, `Distance fee`, `Time fee`, `Urgency fee`, `Complexity fee` and `Premium fee`, then `Total`. Those are internal pricing inputs whose mapping to the two fee lines is undecided (row 34). Fix (spec build default, clarified in this re-audit): until the API returns `serviceFee` / `runnerFee`, render only `ReceiptRow(label: 'Total (service + runner fee)', amount: quote.total, isTotal: true)` and delete `quoteRows`.
2. Minor — `task_widgets.dart:66` and `awaiting_quote_screen.dart:366`. Spec (Copy, mockup): `Total (service + runner fee)`. Code: `Total`. Fixed by item 1.
3. Minor — `awaiting_quote_screen.dart:249`. Spec (Layout 3, mockup copy): `Confirm & pay KSh 2,200 →` with the fee total in Fira Code. Code: `Confirm & pay →`. Fix: use `quote.total`, which is the service + runner total the STK push charges; the Fira Code span needs CC-2.

Notes: merchant-direct is always disabled (`:389-394`) because merchant details never reach the errand yet (SQ-6 fallback). Wire it to real merchant details when api-contract adds them.

## v-payment — PASS

Implementation: `screens/checkout/payment_screen.dart`.

The STK states PENDING / SUCCESS / FAILED / TIMEOUT through core `StkPaymentState`, with TIMEOUT kept as "still checking". The 90 s window, polling every 5 s then every 30 s up to 10 minutes. Idempotency key reused on a network retry, new key on `Try again` / `Send a new prompt`, one automatic new key on `IDEMPOTENCY_KEY_REUSED`. Reopening never sends a prompt. Amount = service fee + runner fee in Fira Code 30. The payer number is the chosen method, else the default, else the sign-in phone. SUCCESS → Track after 1.5 s. The FAILED icon is slate + blue. All copy matches; `Couldn't load this payment.` accepted into the spec.

1. Minor — `payment_screen.dart:343-348`. Spec (Copy, FAILED): show the provider reason (e.g. "cancelled by user") as a second line when one exists. Code: never shown. Fix: append the reason from the payment summary when the API returns it (api-contract: expose the result text).
2. Minor — `payment_screen.dart:104-110`. Spec (Rules): the body shows the payer number formatted `+254 712 345 678`. Code: for a saved method it shows `method.detail`, the masked `+254 712 ••• 678`. Acceptable while the API returns only the masked form for saved methods; record it as the spec reading.

## x-merchant-payment — PASS

Implementation: `screens/checkout/merchant_payment_screen.dart`.

Variant A: Till or Paybill copy rows (C-39) with Fira Code values, `Amount` copying digits only, the amber Fira Code increase line, M-Pesa how-to and `Done`. Variant B is built as the SQ-5 fallback (amount + pending notice). Loading and error states match.

1. Minor — `merchant_payment_screen.dart:58-62`. With no amount due (`mp == null` or zero), the screen shows `The merchant's details aren't available yet…` even when the route is send-to-runner. Fix: show that notice only for merchant-direct; for send-to-runner or no route, pop or show the Variant B notice.

## v-price-auth — FAIL

Implementation: `screens/checkout/price_change_dialog.dart`; opened from `home_shell.dart:81-99` (resume) and `track_tab.dart:213-240`.

The non-dismissible C-35 modal, title, runner short name, quoted reason, Original (blue) → New price (amber) in Fira Code 19, the amber difference line, approve / red outline reject, second confirm with the row 37 copy, the already-answered state, and the inline error all match.

1. **Blocker** — `price_change_dialog.dart:107-122`. Spec (Data, Open questions Q1/Q2; OA-5; `_shared.md` §8): the customer chooses the merchant route, and the app never decides a payment route for them. Code: on `MERCHANT_ROUTE_REQUIRED` it silently calls approve again with `merchantRoute: MerchantRoute.sendToRunner`, which commits the customer to a route whose mechanics are undecided (SQ-5, rows 44 and 48). Fix (spec build default, v-price-auth Q2): on that error, show the checkout route rows (C-16 radio-row, same copy as x-awaiting-quote, merchant-direct disabled per SQ-6) inside the modal, keep `Approve` disabled until the customer selects one, then approve with that route. Owner question added.
2. Minor — `price_change_dialog.dart:235`. The amount in `Approve KSh 5,000 increase` renders in Fira Sans (CC-2).
3. Minor — `price_change_dialog.dart:92-97` with `:187-199`. If loading the request fails, the dialog shows `Couldn't send your answer. Try again.` with only `OK`. That copy is for a failed answer, not a failed load, and there is no retry. Fix: proposed copy `Couldn't load this price change.` with `Try again` (reload) and `Close`.

## v-track — PASS

Implementation: `screens/shell/track_tab.dart`, `widgets/schematic_map.dart`.

Title `Track task`, errand chip selector for 2+ errands, the map body on blue-050 with an ETA chip (`Arrived` in ARRIVED, hidden while finding), the no-position caption, the finding-a-runner card, runner tile with `Verified · 4.9` in Fira Code and the amber En route chip, item-payment notice → x-merchant-payment, `Price change` / `Review evidence` shown only when relevant at equal width, the timeline from history + evidence with the next state pending, terminal-state cards with `View task`, empty and error states, polling 10 s / 15 s while visible. No chat or call (OA-18).

1. Minor — `track_tab.dart:451`. The amount in `Pay the item amount: KSh 40,000` renders in Fira Sans (CC-2).

Notes: no dashed route line and no `Reconnecting…` line; both wait on the maps SDK and the socket client (rows 30, 29). Runner position follows the tracking snapshot only (row 27).

## v-task-detail — PASS

Implementation: `screens/task/task_detail_screen.dart`.

Summary card (16/700 title, Fira Code reference · time), primary action per state, runner card with `Verified · 4.9 · 137 tasks`, evidence grid → viewer, dashed receipt `Service fee` / `Runner fee` / `Total paid` with the item amount kept separate and its route line, `Not paid yet.`, `View payment details` while active, the red report row in IN_PROGRESS / AWAITING_CUSTOMER / COMPLETED, and `View your report` in DISPUTED: all match.

1. Minor — `task_detail_screen.dart:77-82, 139`. Spec (updated for row 35): `Rate this task` also for CONFIRMED and SETTLED when unrated. Code: COMPLETED only. Latent until the payout scheduler moves errands to CONFIRMED. Fix: include CONFIRMED and SETTLED in both the rating lookup and the button.
2. Minor — `task_detail_screen.dart:224`. Spec (Entry/exit): `View your report` in DISPUTED **or any state after a dispute existed**. Code: DISPUTED only, so after resolution (→ COMPLETED or CANCELLED, row 36) the report is unreachable. Fix: look up `disputes.forErrand(id)` for COMPLETED and CANCELLED and show the row when a dispute exists.

## v-evidence-confirm — PASS

Implementation: `screens/task/evidence_confirm_screen.dart`.

`Review evidence`, the dynamic count section, grid → viewer, `Runner notes` in quotes (hidden when empty), dashed payment summary with the item amount separate, red `Report a problem`, and `Confirm completion` (AWAITING_CUSTOMER → COMPLETED only, then v-rate). Confirm is disabled with no evidence, 409 reloads, finished states → task detail. No escrow wording.

1. Minor — `evidence_confirm_screen.dart:133`. The `(4)` in `Photos & video (4)` renders in Fira Sans inside `SectionLabel` (CC-2).

## v-rate — PASS

Implementation: `screens/task/rate_screen.dart`.

Avatar 60, `How was Brian K.?` with the no-name fallback, task title, stars, optional comment with a Fira Code counter near the limit, CTA disabled without a star, already-rated → Home, success snackbar + reset to Home, error snackbar. No errand state change.

1. Minor — `rate_screen.dart:102`. Uses the app-local `NameAvatar` (CC-3).

## x-report-problem — PASS

Implementation: `screens/task/report_problem_screen.dart`.

Write mode: task line card, `What went wrong?` with a 500-character Fira Code counter, red validation, notice, `Send report`, the 409 already-reported state with `View your report`, the state-not-allowed copy, and the discard dialog. Read mode: dispute chip mapping (`Report received`, `Under review`, `Resolved`, `Closed`), `Reported …` in Fira Code, `What you told us`, `Outcome` with `Resolved …`. Read-mode load and empty copy accepted into the spec.

## x-evidence-viewer — PASS

Implementation: `widgets/evidence.dart` (`openEvidenceViewer`, captions) on core `EvidenceViewer`.

Blue-700 background with a white close button (48dp) and the Fira Code counter `2/4`, swipe, pinch-zoom, caption `Photo · 10:41 AM` with the time in Fira Code, and the video fallback line `Video playback isn't available yet.` (row 32).

1. Minor — no test opens the viewer from v-evidence-confirm or v-task-detail and checks the counter and caption. Fix: add one widget test.

Notes: `onLoadError` re-fetch of expired links is not wired; it waits on signed links (row 25). There is no address line in the caption because the evidence model has no address.

## v-history — PASS

Implementation: `screens/shell/history_tab.dart`.

Finished set only, newest first, cursor pagination with an end spinner, pull to refresh, the C-23 card (title, chip with red Cancelled, Fira Code `date · runner`, amount = service + runner fee with no item amount, `—` when missing), every card → task detail, empty / skeleton / error states: all match.

1. Minor — `history_tab.dart:106-119`. One `GET /payments/:errandId` per card to get the fee total (N+1 requests per page). Fix: api-contract adds the fee total to list items (need already on the BOARD); then drop the per-card calls.

## v-notifications — PASS

Implementation: `screens/account/notifications_screen.dart`.

Rows from core `NotificationRow` with the red unread dot and 700 title, relative time in Fira Code, tap marks read and deep links per the event table, opening the screen marks nothing read, empty / skeleton / error states.

1. Minor — `notifications_screen.dart:107-120`. Spec (Layout 1): `Mark all read` is a trailing text button in the pushed header. Code: a right-aligned row under the header. Fix: core-ui adds a trailing action slot to `NitumePushedHeader` (need already on the BOARD), then move the button there.

## v-addresses — PASS

Implementation: `screens/account/addresses_screen.dart`.

Cards with the `Default` chip-info tag, `+ Add new address`, empty line, skeleton / error, reload + snackbar on return.

Note: if the owner approves typed addresses (row 60), this screen must mark the ones without a map location (see x-address-form).

## x-address-form — FAIL

Implementation: `screens/account/address_form_screen.dart`.

Headers, the `Name` field with `Home` / `Office` quick picks, the default checkbox (disabled with `This is your default address.` on the current default), `Delete address` + dialog, `Save address`, the snackbars and the discard dialog all match.

1. **Blocker** — `address_form_screen.dart:184-191` with `:52-85`. Spec (Data, last line): no Places client (row 30) means the address cannot be picked, so **Save stays disabled**. Code: with no Places client the screen shows a plain `Address` text field and saves the typed text with `lat`/`lon` null. These addresses can never be used in the wizard: `SavedPlaceSearch` drops entries without coordinates, and neither `v-addresses` nor the wizard explains why. Fix: follow the spec. Without Places, show the address field read-only with the C-40 notice `Place search isn't available yet.` and keep `Save address` disabled for new addresses; in edit mode allow only name and default changes. If the owner approves typed addresses (row 60), the spec will be updated first.
2. **Blocker** — `address_form_screen.dart:67-75`. In edit mode, changing the typed address sends the new `addressText` but omits `lat`/`lon` (they are only sent when `_place` is set), so the stored coordinates stay on the old place. The wizard would then send the old coordinates with the new address text: wrong location data on an errand. Fix: never change `addressText` without new coordinates. This is covered by item 1's fix (text not editable without Places).
3. Minor — `address_form_screen.dart:111`. A failed delete shows `Couldn't save the address. Try again.`. Fix: `Couldn't delete the address. Try again.` (added to the spec as proposed copy).

`Enter an address.` (`:59`) is not accepted; it goes away with item 1.

## v-payment-methods — PASS

Implementation: `screens/account/payment_methods_screen.dart`.

M-Pesa only (core filters other types), the C-30 card with the masked number in Fira Code, the `Default` tag, select mode with the checked box and radio semantics, `+ Add payment method` in manage mode only, the empty line naming the sign-in number, skeleton / error.

1. Minor — `payment_methods_screen.dart:57-61`. The masked sign-in number inside the empty-state sentence renders in Fira Sans. Spec (Numeric fields): masked phone numbers in Fira Code. Fix (app-only): build the line with `Text.rich` and a `NitumeTypography.numeric` span, as `otp_screen.dart:151-166` does.

## x-payment-method-form — PASS

Implementation: `screens/account/payment_method_form_screen.dart`.

Add / edit headers, Fira Code phone field (read-only `NumText` in edit mode, since the API cannot change the number), optional name sent as `label` with `M-Pesa` when empty, masked `detail` + normalized `phoneNumber`, default checkbox or `Default` tag, invalid / 409 / generic errors, `Remove this number` + dialog, the discard dialog (copy accepted).

1. Minor — `payment_method_form_screen.dart:115`. A failed remove shows `Couldn't save. Try again.`. Fix: `Couldn't remove this number. Try again.` (added to the spec as proposed copy).

## v-profile — PASS

Implementation: `screens/shell/profile_tab.dart`.

Avatar 70 from `displayName`, full name, Fira Code meta `Customer since Feb 2026 · 42 tasks` (count from `/errands/count`, omitted when unavailable), rows `Saved addresses`, `Payment methods`, `Notifications`, `Support` (hidden when unconfigured), red `Log out` with a slate-400 chevron and the `Log out of Nitume?` dialog, profile-load error line with `Try again`. No `Recurring tasks` row (OA-18).

Notes: unregistering the FCM device on log out waits on row 31.

## x-support — PASS

Implementation: `screens/shell/profile_tab.dart:67-95` (row) and `screens/auth/otp_screen.dart:183-189` (`Contact support`), via core `AppConfig.supportLink`.

The row and link are hidden while unconfigured or no opener exists (SQ-2 fallback, tested at `account_test.dart:184`). The open-failure snackbar copy matches.

---

## Needs raised by this re-audit

- **flutter-customer**: x-awaiting-quote 1–3, v-price-auth 1 and 3, x-address-form 1–3 (blockers first); then the app-side minors (v-home 2, v-new-review 1, v-payment 1, x-merchant-payment 1, v-task-detail 1–2, v-payment-methods 1, x-payment-method-form 1, tests for x-legal and x-evidence-viewer).
- **core-ui**: CC-1 (CONFIRMED label), CC-2 (numeric spans in button / notice / section label), CC-3 (`InitialsAvatar` glyph fallback); already-filed needs for `NitumeField.textCapitalization`, `PlaceAutocompleteField` initial value, a `NitumePushedHeader` trailing slot, and an always-visible money prefix (v-new-details 2).
- **api-contract**: `serviceFee` / `runnerFee` on the quote (after row 34); a fee total on errand list items; provider failure reason on the payment summary.

## Questions for the owner (new)

- **v-price-auth Q2 (payments)**: a price-change request on an errand with no item amount gets `MERCHANT_ROUTE_REQUIRED`. Should the customer pick the route in the modal (build default), or should the API refuse such requests? Related open rows 44, 48 and SQ-5.
- BOARD row 60 already covers typed addresses without coordinates; this re-audit adds the edit-mode coordinate issue (x-address-form 2) for the owner's context.

---

# Addendum — round 2 (2026-10-07)

- Code audited: `feat/customer-screens` @ `ba45633` (fix commits `6e4387b`, `8ebe0d8`, `ac79f79`, `ba45633`).
- Build health: `flutter analyze` (apps/customer_app) no issues; `flutter test` 51 passed (was 41; new tests for checkout re-entry, the price-change route choice and load failure, address-form fallback, x-legal, x-evidence-viewer, SETTLED rating).

| Screen | Round 1 | Round 2 | SCREEN_MAP |
|---|---|---|---|
| x-awaiting-quote | FAIL | **PASS** | matches-design |
| v-price-auth | FAIL | **PASS** | matches-design |
| x-address-form | FAIL | **PASS** | matches-design |

All 27 customer screens are now `matches-design`. The open minors from round 1 that were not fixed stay open (list above), together with core items CC-1..CC-3.

## x-awaiting-quote — PASS

1. Round-1 blocker 1 fixed (`6e4387b`): `quoteRows` is deleted; the Final quote card renders one row `Total (service + runner fee)` (`kFeeTotalLabel`) from `quote.total`, falling back to `errand.quotedPrice`. No internal quote components reach the customer (OA-4).
2. Minor 2 fixed: label `Total (service + runner fee)`.
3. Minor 3 fixed: CTA `Confirm & pay KSh 2,200 →` from the same total. The amount is still Fira Sans inside the button label: CC-2 (core-ui), not counted.
4. The route rows moved into the shared app widget `MerchantRouteRows` (`widgets/task_widgets.dart`), reused by the price-change modal. Merchant-direct stays disabled (SQ-6 fallback, note). The ACCEPTED re-entry matches the amended spec and has a test.

## v-price-auth — PASS

1. Round-1 blocker 1 fixed (`8ebe0d8`): no silent retry. Approve sends the route only when the customer chose one; on `MERCHANT_ROUTE_REQUIRED` the modal shows `HOW SHOULD THIS BE PAID?` with `MerchantRouteRows` (nothing preselected, merchant-direct disabled per SQ-6) and `Approve` stays disabled until a route is selected. Matches the v-price-auth Q2 build default. Q2 itself remains an owner question.
2. Minor 3 fixed: load failure shows `Couldn't load this price change.` with `Try again` (reload) and `Close`; the already-answered state no longer reuses the error copy.
3. Minor 2 (Approve amount in Fira Sans) remains: CC-2, not counted.

## x-address-form — PASS

1. Round-1 blocker 1 fixed (`ac79f79`): without a Places client the `Address` field is read-only and disabled, the C-40 notice `Place search isn't available yet.` shows under the form card, and `Save address` is disabled in add mode. Edit mode saves only name and default. Spec updated with the notice copy.
2. Round-1 blocker 2 fixed: `addressText`, `lat` and `lon` are sent only together from a picked place (`place?.addressText`, `place?.lat`, `place?.lng`); text and coordinates cannot drift.
3. Minor 3 fixed: `Couldn't delete the address. Try again.`. `Enter an address.` is gone.
4. Note (minor, unchanged, core need already filed): the current or picked address is shown as the field hint (placeholder style) rather than a value, the same `PlaceAutocompleteField` initial-value need as v-new-details 1.

## Spot-check of `ba45633` on passing screens

- v-task-detail: `Rate this task` and the rating lookup now cover COMPLETED, CONFIRMED and SETTLED (minor 1 fixed; test added). Report row and other states unchanged. Still PASS. Minor 2 (`View your report` after resolution) remains open.
- v-payment-methods: empty line now `Text.rich` with the masked number in Fira Code 13 slate-600; padding and copy unchanged (minor 1 fixed). Still PASS.
- x-payment-method-form: remove failure `Couldn't remove this number. Try again.` (minor 1 fixed). Still PASS.
- x-legal and x-evidence-viewer: the missing tests are now in `test/legal_viewer_test.dart` (minor fixed). Still PASS.
- No new colour, font-name or hex use in the four commits (`git show` diffs reviewed).

---

# Addendum — round 3 spot-check (2026-10-08)

- Code audited: `feat/customer-screens` @ `08f9b26`, changes since `ba45633`: `af73137`, `1173df5`, `0154b25`, `900d442`, `395309b`, `9ffe990` (owner merge of the core fixes), `fe4e282`, `b012e33`, `5c87670`, `c28487e`, `08f9b26`.
- Build health: apps/customer_app `flutter analyze` no issues, `flutter test` 60 passed; packages/nitume_core `flutter analyze` no issues, `flutter test` 124 passed (incl. a `numeric_spans` golden). Token scan of `apps/customer_app/lib` (`Color(0x`, Material `Colors.`, `fontFamily`, hex): 0 hits.

## Cross-cutting items — closed

| Item | Fix | Status |
|---|---|---|
| CC-1 CONFIRMED label | `status_presentation.dart`: CONFIRMED → `Completed` (success), like SETTLED; v-track timeline also hides DRAFT / CONFIRMED / SETTLED history rows (`track_tab.dart` `_hiddenInTimeline`) | **Closed**. Labels changed only for the two system-only states (row 35); every other §6 label is unchanged |
| CC-2 numeric spans | Core `NumSpan`, `NitumeButton.richLabel`, `NitumeNotice.richMessage`, `SectionLabel.numericSuffix`; used at all call sites: v-home `+N`, v-track item amount, v-price-auth Approve amount, v-evidence-confirm `(4)`, x-awaiting-quote CTA amount. Plain `label`/`message` kept for semantics | **Closed** |
| CC-3 avatar fallback | Core `InitialsAvatar.fromName` shows the person glyph for a blank name; app `NameAvatar` deleted; v-home, v-profile, v-rate use the core widget | **Closed** |

Core needs from round 1 also closed: `NitumeField.textCapitalization` (x-name-capture), money prefix always visible (v-new-details 2), `PlaceAutocompleteField.initialValue` (v-new-details 1, x-address-form note).

## Results

| Screen | Verdict | What was checked |
|---|---|---|
| v-track | PASS | CC-2 notice amount in Fira Code; timeline hides DRAFT/CONFIRMED/SETTLED; rest unchanged |
| v-home | PASS | CC-2 `+N`; CC-3 avatar; no-name case now shows the greeting line. Minor 1 below |
| v-new-review | PASS | Notice now inside the `Estimated price` form card (round-1 minor fixed) |
| v-new-details | PASS | Chosen place shown as the field value (`initialValue`), hint `Search for a place`; money prefix visible (round-1 minors fixed) |
| v-task-detail | PASS | `View your report` when a dispute exists in DISPUTED, COMPLETED or CANCELLED (row 36 targets; round-1 minor fixed); rate in CONFIRMED/SETTLED kept |
| x-merchant-payment | PASS | Closes itself when nothing is due: judged below. Minor 2 below |
| v-price-auth | PASS | CC-2 Approve amount; 409 `price_change_already_decided` → spec's already-answered state `This price change was already answered.`; route choice and load-failure state unchanged |
| v-evidence-confirm | PASS | CC-2 count via `numericSuffix` |
| x-awaiting-quote | PASS | CC-2 CTA amount (`Confirm & pay KSh 2,200 →`, amount in Fira Code); total-only row unchanged |
| v-profile | PASS | CC-3 core avatar (70) |
| v-rate | PASS | CC-3 core avatar (60) |
| x-name-capture | PASS | `TextCapitalization.words` (round-1 minor fixed) |
| x-address-form | PASS | Saved address shown as the read-only field value (no Places) or the Places field's initial value; save/coordinate rules from round 2 unchanged |
| v-history | PASS | Status chips from core labels: CONFIRMED now `Completed` (CC-1) |

## Judgement: x-merchant-payment closing itself when nothing is due

`merchant_payment_screen.dart:58-63`: when the payment summary has no merchant payment, or its amount is zero, the screen pops itself after the first frame (blank body meanwhile).

- The spec never draws a "nothing due" state. All its normal entries (Track notice, Task-detail link, price-change approval) open the screen only while an amount is due, so this state is only reached through a stale entry such as an old notification.
- In round 1 I offered "pop" as one acceptable fix (minor x-merchant-payment 1), and the spec's own close rule (close when CANCELLED) is the same pattern.
- The merchant-direct "details not available yet" notice is still shown when a merchant payment exists without details, as specced.

Verdict: **matches the spec's intent; accepted**. Recorded in `x-merchant-payment.md` States.

## Remaining minors (non-blocking)

1. v-home — `home_tab.dart:156-158` passes `title: ''` when there is no name; `NitumeTopBar` still renders an empty 21/700 line (blank space and an empty header in semantics). Fix: core-ui skips the title `Text` when it is empty, or the top bar gets a greeting-only mode. Rare (name capture runs first).
2. x-merchant-payment — the self-close gives no feedback. Proposed: snackbar `Nothing to pay right now.` (added to the spec as a proposed follow-up).
3. `price_change_dialog.dart:10-12` defines the API code `price_change_already_decided` locally with a TODO; core-ui should move it into `ApiErrorCodes`. Code hygiene only.

Still open from earlier rounds (unchanged, minor): v-auth-phone legal link hit areas (inactive until SQ-2); v-payment provider failure reason; v-history per-card payment calls (api-contract); v-notifications `Mark all read` placement (header trailing slot). Owner rows 30, 34, 60, SQ-5, SQ-6 and v-price-auth Q2 stay open.
