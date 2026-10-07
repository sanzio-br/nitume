# Nitume Agent Board

Written only by the orchestrator (main session). Updated from subagent HANDOFF blocks.

Stages: unaudited · specced · building · built · audited-pass · audited-fail · reviewed · awaiting-owner · merged

## Active work

| Screen | Stage | Owner agent | Branch | Needs / blocked by | Notes |
|--------|-------|-------------|--------|--------------------|-------|
| customer/v-auth-phone | audited-fail | flutter-customer | docs/customer-spec-audit | core-ui: NitumeWordmark, NitumeField (phone), theme focus/radius fix | Partial. 4 blockers / 4 minor. Must split from OTP screen; use AuthRepository + KenyanPhone.normalize. Owner Qs 1,11,12,17 |
| customer/v-auth-otp | audited-fail | flutter-customer | docs/customer-spec-audit | core-ui: NitumePushedHeader, OtpCodeField, link button variant; app-level session restore | Partial. onSubmitted bug at otp_login_screen.dart:298; role 'customer' not sent. Owner Qs 2,17 |
| customer/v-home | audited-fail | flutter-customer | docs/customer-spec-audit | core-ui: NitumeTopBar, NotificationBell, InitialsAvatar, SearchEntryRow, SectionLabel, CategoryTile, ActiveTaskCard, TaskRow, StatusChip, empty/error states; api-contract: A-1, A-2, A-4, A-10 | Partial. 6 blockers / 5 minor. Owner Qs 1,2,14,15 |
| customer/v-new-category | audited-fail | flutter-customer | docs/customer-spec-audit | core-ui: NitumePushedHeader, StepProgressBar, CategoryTile; shell: New task pushes wizard | Partial. 5 blockers / 2 minor; currently a root tab. Owner Qs 1,18 |
| customer/v-new-details | specced | flutter-customer | docs/customer-spec-audit | core-ui: NitumeField (multiline/money), NitumeChoiceChip, PlaceAutocompleteField, NitumeCard; Google Places key/config | Not built. Owner Q 19 |
| customer/v-new-review | specced | flutter-customer | docs/customer-spec-audit | api-contract: A-5, A-6, A-2; core-ui: ReceiptCard, NitumeChoiceChip | Not built. **Blocked on owner Qs 3,4,5** |
| customer/v-price-auth | specced | flutter-customer | docs/customer-spec-audit | api-contract: A-8, A-2; core-ui: NitumeCard, StatusChip, NumText, non-dismissible route | Not built. **Blocked on owner Q 8** |
| customer/v-payment | specced | flutter-customer | docs/customer-spec-audit | api-contract: A-7 idempotency key, A-2; core-ui: PulsingDots, NumText | Not built. Never call mock /payments/mpesa/callback in prod. Owner Q 21 |
| customer/v-payment-methods | specced | flutter-customer | docs/customer-spec-audit | core-ui: PaymentMethodCard, StatusChip (small info), NitumePushedHeader | Not built; API + core model exist. Owner Q 10 |
| customer/v-track | audited-fail | flutter-customer | docs/customer-spec-audit | api-contract: A-1, A-2, A-3, A-4; core-ui: LiveTrackingMap, EtaChip, RunnerSummaryTile, StatusTimeline, NotificationBell, small outline button; google_maps_flutter | Partial. 6 blockers / 4 minor; off-palette colours; missing asset map_placeholder.png. Owner Qs 13,18 |
| customer/v-task-detail | specced | flutter-customer | docs/customer-spec-audit | api-contract: A-4, A-9 disputes, A-12 evidence URLs; core-ui: RunnerSummaryTile, EvidenceGrid, ReceiptCard, MenuRow | Not built. Owner Qs 9,15 |
| customer/v-evidence-confirm | specced | flutter-customer | docs/customer-spec-audit | api-contract: A-12, A-2; core-ui: EvidenceGrid, EvidenceViewer, ReceiptCard (dashed) | Not built. **Blocked on owner Qs 6,7,16**; do not ship mockup CTA copy |
| customer/v-rate | specced | flutter-customer | docs/customer-spec-audit | core-ui: StarRatingInput, InitialsAvatar, NitumeField multiline; api-contract: A-4 | Not built; rating API exists. Owner Qs 2,7 |
| customer/v-history | audited-fail | flutter-customer | docs/customer-spec-audit | core-ui: TaskHistoryCard, StatusChip, statusPresentation, empty/error/skeleton; api-contract: A-10, A-4 | Partial. 4 blockers / 3 minor. Owner Qs 4,13 |
| customer/v-notifications | specced | flutter-customer | docs/customer-spec-audit | core-ui: NotificationRow, NotificationsRepository; api-contract: A-13 FCM registration, A-14 eventType enum | Placeholder only (unreachable). API + core model exist |
| customer/v-addresses | specced | flutter-customer | docs/customer-spec-audit | core-ui: SavedAddressCard, PlaceAutocompleteField (x-address-form) | Not built; API + core model exist. Edit/delete/add form not drawn |
| customer/v-profile | audited-fail | flutter-customer | docs/customer-spec-audit | core-ui: MenuRow (+destructive), InitialsAvatar, NitumeTopBar; api-contract: A-11, A-15 | Partial. 3 blockers / 3 minor; Log out not wired. Owner Qs 2,13,18 |
| customer/shell | audited-fail | flutter-customer | docs/customer-spec-audit | core-ui: NitumeTabBar / navigationBarTheme fix | New task must push the wizard, not be a root tab |

Undrawn screens referenced by the mockup (in SCREEN_MAP as `missing`, no spec yet): x-awaiting-quote, x-merchant-payment, x-report-problem, x-evidence-viewer, x-address-form, x-payment-method-form, x-recurring-tasks, x-support, x-legal.

## Needs (cross-agent requests)

| From | To | Request | Status |
|------|----|---------|--------|
| design-auditor | core-ui | Build widgets C-01..C-34 (`docs/specs/customer/_shared.md`); move NitumeCard/StatusChip/statusPresentation from app to core; theme fixes (green focus ring, radii, tab bar colours, bundle Fira Sans/Code, `NitumeTypography.numeric`); data layer (repositories, models, Socket.IO client, FCM) | in progress: feat/core-customer-widgets (worktree ../nitume-core-customer-widgets) |
| design-auditor | api-contract | Endpoints/events A-1..A-17 (`docs/audits/customer-gap-report.md`): Socket.IO gateway + location:update and status/evidence/price-change events; GET /errands/:id/tracking; runner on errand; customer-readable quote; payment-flow selection + idempotency key; GET pending price-change; disputes controller; multi-status filter; errand count; evidence view URLs; FCM device registration; notification eventType enum. Schema items (names, title/reference) wait for owner | in progress: feat/api-customer-gaps (worktree ../nitume-api-customer-gaps) |

## Questions for the project owner

| # | Raised by | Question + recommended option | Status |
|---|-----------|-------------------------------|--------|
| 1 | setup | Confirm mapping of ERD category enums to the six display names (buy_for_me=Buy For Me, pickup_delivery=Get It For Me, inspection=Check It For Me, representation=Go There For Me, queue_admin=Wait For Me, business=Business Tasks). Recommended: yes. | open |
| 2 | design-auditor (customer, gap report Q1) | Q-CAT: category tile labels: six full display names, or approve short labels (Buy, Collect, Inspect, Visit, Submit, Business) and mapping? | open |
| 3 | design-auditor (customer, gap report Q2) | Q-NAME (schema): add `display_name` for customers/runners and collect it after first sign-in? | open |
| 4 | design-auditor (customer, gap report Q3) | Quote flow (state machine): instant quote (mockup) vs submit → admin quote → accept (§3.3/API). Wait screen or synchronous auto-quote? | open |
| 5 | design-auditor (customer, gap report Q4) | Fee breakdown (payments): mockup lines vs API 20%/30% split. Which is shown; split rules? | open |
| 6 | design-auditor (customer, gap report Q5) | Merchant payment (payments): customer choice of merchant-direct / send-to-runner / runner-advance? Advance limits? Till/Paybill display? | open |
| 7 | design-auditor (customer, gap report Q6) | Q-RELEASE: "Confirm completion & release payment" implies escrow; replacement copy and payout trigger? (API comments also say "escrow") | open |
| 8 | design-auditor (customer, gap report Q7) | Confirm transitions (state machine): does Confirm fire AWAITING_CUSTOMER→COMPLETED only, or also →CONFIRMED? What triggers CONFIRMED? | open |
| 9 | design-auditor (customer, gap report Q8) | Price change (payments + state machine): which amount changes, how the increase is paid, reject-and-cancel when CANCELLED unreachable from IN_PROGRESS; modal vs pushed | open |
| 10 | design-auditor (customer, gap report Q9) | API state-machine deviations from §3.3: approve or revert DRAFT→CANCELLED, AWAITING_CUSTOMER→DISPUTED, DISPUTED→CONFIRMED/CANCELLED? | open |
| 11 | design-auditor (customer, gap report Q10) | Card payments: Visa in MVP? Which provider? (scope/third-party/security) | open |
| 12 | design-auditor (customer, gap report Q11) | Q-RADIUS: pill buttons (design system) or 14px CTAs (mockup)? | open |
| 13 | design-auditor (customer, gap report Q12) | Q-FIELD: white 8px field with green focus (design system) or slate 10px field (mockup)? | open |
| 14 | design-auditor (customer, gap report Q13) | Q-RED / Q-ENROUTE: red outside chips (unread dot, destructive rows, errors, Cancelled); amber vs blue for En route; amber price text | open |
| 15 | design-auditor (customer, gap report Q14) | Off-palette mockup colours `#5FE092`, `#AEB9CC`, `#EAEEF4`, green 20% tint: approve replacements? | open |
| 16 | design-auditor (customer, gap report Q15) | Schema: task title and sequential reference number, or derive client-side? | open |
| 17 | design-auditor (customer, gap report Q16) | Schema: runner/caretaker notes field on evidence review? | open |
| 18 | design-auditor (customer, gap report Q17) | Security: OTP expiry, attempts, resend cooldown, request rate limits | open |
| 19 | design-auditor (customer, gap report Q18) | Scope: recurring tasks, Support target, Business Tasks tile for regular customers, in-task chat on Track | open |
| 20 | design-auditor (customer, gap report Q19) | Locations per category: pickup + drop-off, deadline chip → deadline_at/urgency, budget visibility, shopping-list items | open |
| 21 | design-auditor (customer, gap report Q20) | Q-LABELS: confirm state → customer label table (`docs/specs/customer/_shared.md` §6) | open |
| 22 | design-auditor (customer, gap report Q21) | Payment UX: after payment go to Track or Home? STK timeout/retry; default M-Pesa method vs login phone | open |

## Session log

| Date | Summary | Commits |
|------|---------|---------|
| 2026-10-07 | Customer surface spec + audit (design-auditor): 17 views specced; 8 audited-fail (7 views + shell), 10 specced/not built; 9 undrawn screens mapped; 21 owner questions | 40dbc17, 1153736, eb7853e |
