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
| design-auditor | core-ui | Build widgets C-01..C-34 (`docs/specs/customer/_shared.md`); move NitumeCard/StatusChip/statusPresentation from app to core; theme fixes (green focus ring, radii, tab bar colours, bundle Fira Sans/Code, `NitumeTypography.numeric`); data layer (repositories, models, Socket.IO client, FCM) | done: feat/core-customer-widgets (built). All C-01..C-34 built; partial: C-25 no video playback, C-28 no unread styling, C-31 no markers/route without maps SDK |
| design-auditor | api-contract | Endpoints/events A-1..A-17 (`docs/audits/customer-gap-report.md`): Socket.IO gateway + location:update and status/evidence/price-change events; GET /errands/:id/tracking; runner on errand; customer-readable quote; payment-flow selection + idempotency key; GET pending price-change; disputes controller; multi-status filter; errand count; evidence view URLs; FCM device registration; notification eventType enum. Schema items (names, title/reference) wait for owner | partly done: feat/api-customer-gaps (built). Added A-1..A-5, A-8..A-11, A-13, A-14 (A-2 names pending owner Q23); A-12 partial; A-17 exists; blocked A-6, A-7, A-15, A-16 |
| api-contract | core-ui | Models: ErrandAssignmentView/RunnerPublicSummary (avgRating is a string), Quote, PriceChangeRequest, TrackingSnapshot, Dispute (+events), Device; `assignment` on Errand; repo methods for /errands/count, multi-status /errands, /errands/:id/quote, /errands/:id/tracking, GET price-change, /disputes, /users/me/devices; Socket.IO client (auth:{token}, errand:join/leave; location:update, errand:status_changed, evidence:uploaded, price_change:requested); NotificationEventType enum. Contract table in api-contract report (feat/api-customer-gaps) | done: feat/core-customer-widgets (models, repositories, RealtimeClient interface + RealtimeEvents) |
| api-contract | flutter-customer | Register FCM token after login / delete on logout; Home/History use status lists; Profile count from /errands/count; Report a problem → POST /disputes, handle 409; keep polling GET /payments/:errandId as fallback | open |
| api-contract | api-contract (later) | Runner `location:ping` intake (Redis GEO, currentLocation, geofencing, ETA); FCM push worker; Socket.IO Redis adapter before multi-instance; update Postman collection | open |
| core-ui | flutter-customer | Switch to core NitumeCard/StatusChip/statusPresentation and delete apps/customer_app/lib/src/widgets/nitume_card.dart; replace all fontFamily 'FiraCode'/'FiraSans' with NitumeTypography.numeric / NumText / NitumeTextStyles; call NitumeFonts.registerLicenses() in main(); use NitumeTabBar + NitumeButton variants | open |
| core-ui | flutter-customer | Implement RealtimeClient, PlaceSearchService and LiveTrackingMap(mapBuilder:) once owner approves packages (Q29–Q32) | blocked on owner |

## Questions for the project owner

| # | Raised by | Question + recommended option | Status |
|---|-----------|-------------------------------|--------|
| 1 | setup | Confirm mapping of ERD category enums to the six display names (buy_for_me=Buy For Me, pickup_delivery=Get It For Me, inspection=Check It For Me, representation=Go There For Me, queue_admin=Wait For Me, business=Business Tasks). Recommended: yes. | open |
| 2 | design-auditor (customer, gap report Q1) | Q-CAT: category tile labels: six full display names, or approve short labels (Buy, Collect, Inspect, Visit, Submit, Business) and mapping? | answered: full display names, no short labels |
| 3 | design-auditor (customer, gap report Q2) | Q-NAME (schema): add `display_name` for customers/runners and collect it after first sign-in? | answered: add display_name (customers + runners), collect after first sign-in/onboarding, expose in API + UI |
| 4 | design-auditor (customer, gap report Q3) | Quote flow (state machine): instant quote (mockup) vs submit → admin quote → accept (§3.3/API). Wait screen or synchronous auto-quote? | answered: synchronous auto-quote preview in wizard; authoritative flow stays REQUESTED→QUOTED→ACCEPTED (owner wrote PENDING_QUOTE; §3.3 name is REQUESTED). Preview ≠ final quote |
| 5 | design-auditor (customer, gap report Q4) | Fee breakdown (payments): mockup lines vs API 20%/30% split. Which is shown; split rules? | answered: show Service fee + Runner fee + Merchant/item amount; commission split internal only. Follow-up row 34 (component mapping) |
| 6 | design-auditor (customer, gap report Q5) | Merchant payment (payments): customer choice of merchant-direct / send-to-runner / runner-advance? Advance limits? Till/Paybill display? | answered: customer picks route at checkout; MVP = merchant-direct (when details exist) + send-to-runner; runner advance is runner-side, not a customer option; Till/Paybill only when that route is selected |
| 7 | design-auditor (customer, gap report Q6) | Q-RELEASE: "Confirm completion & release payment" implies escrow; replacement copy and payout trigger? (API comments also say "escrow") | answered: drop escrow wording; CTA "Confirm completion"; confirming makes runner earnings eligible for normal payout |
| 8 | design-auditor (customer, gap report Q7) | Confirm transitions (state machine): does Confirm fire AWAITING_CUSTOMER→COMPLETED only, or also →CONFIRMED? What triggers CONFIRMED? | answered: AWAITING_CUSTOMER→COMPLETED on confirm; COMPLETED is terminal for the customer. **Conflicts with §3.3 (COMPLETED→CONFIRMED→SETTLED)**: follow-up row 35 |
| 9 | design-auditor (customer, gap report Q8) | Price change (payments + state machine): which amount changes, how the increase is paid, reject-and-cancel when CANCELLED unreachable from IN_PROGRESS; modal vs pushed | answered: item/merchant amount; customer approves + pays difference; reject → CANCELLED (make reachable from the active state); modal. Follow-up row 37 (refunds/states) |
| 10 | design-auditor (customer, gap report Q9) | API state-machine deviations from §3.3: approve or revert DRAFT→CANCELLED, AWAITING_CUSTOMER→DISPUTED, DISPUTED→CONFIRMED/CANCELLED? | answered: keep DRAFT→CANCELLED, AWAITING_CUSTOMER→DISPUTED; remove DISPUTED→CONFIRMED; resolve to operational state or CANCELLED. Follow-up row 36 (which state) |
| 11 | design-auditor (customer, gap report Q10) | Card payments: Visa in MVP? Which provider? (scope/third-party/security) | answered: cards out of MVP; no Visa/provider |
| 12 | design-auditor (customer, gap report Q11) | Q-RADIUS: pill buttons (design system) or 14px CTAs (mockup)? | answered: pill buttons (design system) |
| 13 | design-auditor (customer, gap report Q12) | Q-FIELD: white 8px field with green focus (design system) or slate 10px field (mockup)? | answered: white 8px field, green focus (design system) |
| 14 | design-auditor (customer, gap report Q13) | Q-RED / Q-ENROUTE: red outside chips (unread dot, destructive rows, errors, Cancelled); amber vs blue for En route; amber price text | answered: red for unread dot, destructive rows, inline errors, Cancelled chip; amber for En route; amber price text |
| 15 | design-auditor (customer, gap report Q14) | Off-palette mockup colours `#5FE092`, `#AEB9CC`, `#EAEEF4`, green 20% tint: approve replacements? | answered: replace with nearest design-system tokens |
| 16 | design-auditor (customer, gap report Q15) | Schema: task title and sequential reference number, or derive client-side? | answered: backend-generated `reference`; `title` where customer provides/edits one |
| 17 | design-auditor (customer, gap report Q16) | Schema: runner/caretaker notes field on evidence review? | answered: add dedicated `runner_notes` field |
| 18 | design-auditor (customer, gap report Q17) | Security: OTP expiry, attempts, resend cooldown, request rate limits | answered: OTP 5 min expiry, 5 attempts, 60s resend cooldown, 5 requests/hour per phone/account, IP/device throttling, new OTP invalidates previous |
| 19 | design-auditor (customer, gap report Q18) | Scope: recurring tasks, Support target, Business Tasks tile for regular customers, in-task chat on Track | answered: recurring tasks, Business Tasks and in-task chat out of MVP; one configurable Support entry point |
| 20 | design-auditor (customer, gap report Q19) | Locations per category: pickup + drop-off, deadline chip → deadline_at/urgency, budget visibility, shopping-list items | answered: pickup + drop-off for Get It/Buy For Me; deadline_at authoritative, urgency derived; budget per category; structured shopping-list items |
| 21 | design-auditor (customer, gap report Q20) | Q-LABELS: confirm state → customer label table (`docs/specs/customer/_shared.md` §6) | answered: `_shared.md` §6 labels are authoritative |
| 22 | design-auditor (customer, gap report Q21) | Payment UX: after payment go to Track or Home? STK timeout/retry; default M-Pesa method vs login phone | answered: go to Track after payment; STK states PENDING/SUCCESS/FAILED/TIMEOUT, timeout ≠ failure without provider confirmation; safe retries without duplicate charges (see row 24); pay with selected/default M-Pesa method, login phone only as fallback |
| 23 | api-contract (customer gaps) | Socket event names (A-2): approve errand:join, errand:leave, errand:status_changed, evidence:uploaded, price_change:requested, or name them. (location:update + errand:{id} rooms follow §4.2) | open |
| 24 | api-contract (customer gaps) | Idempotency key (A-7, payments + schema): recommended nullable unique `payments.idempotency_key` column + `Idempotency-Key` header. Redis alternative conflicts with §1 (Redis never source of truth for money) | open |
| 25 | api-contract (customer gaps) | Evidence links (A-12, security): Cloudinary URLs are permanent and public. Recommended: authenticated delivery with short-lived signed URLs (TTL?) or S3 presigned GETs per §3.1. Also: §3.2 signed upload vs current base64 upload | open |
| 26 | api-contract (customer gaps) | BullMQ: §4.4 routes notifications through a BullMQ queue but it isn't installed; approve adding bullmq/@nestjs/bullmq for the notifications worker? | open |
| 27 | api-contract (customer gaps) | Runner location privacy: share position only RUNNER_ASSIGNED → AWAITING_CUSTOMER. Confirm? | open |
| 28 | api-contract (customer gaps) | Security (pre-existing): GET /errands/:id/rating has no access check. Fix in api-contract follow-up? Recommended: yes | open |
| 29 | core-ui (customer shared) | Add socket_io_client package (Flutter) to implement RealtimeClient? Recommended: yes | open |
| 30 | core-ui (customer shared) | Add google_maps_flutter (LiveTrackingMap) and a Google Places client (PlaceSearchService)? (third-party, needs API key) | open |
| 31 | core-ui (customer shared) | Add firebase_messaging for FCM push tokens? (third-party) | open |
| 32 | core-ui (customer shared) | Add a video player package for EvidenceViewer video evidence? | open |
| 33 | core-ui (customer shared) | Accessibility: design-system chip colours fail WCAG AA at 12px (success 4.01, pending 2.95, danger 4.36); slate-400 on white 2.94; green-700 links 4.46. Keep, or set NitumeDesignChoices.chipHighContrastText = true (blue text on same tint)? | open |
| 34 | orchestrator (owner answers) | Fee mapping (follow-up to 5): which quote components (base/distance/time/urgency/complexity/premium) make up "Service fee" vs "Runner fee" on the customer screen? | open |
| 35 | orchestrator (owner answers) | State machine (follow-up to 8 vs §3.3): §3.3 and the API have COMPLETED→CONFIRMED→SETTLED, and SETTLED drives payout. Remove CONFIRMED/SETTLED, or keep them as system-only payout states (customer never sees them)? | open |
| 36 | orchestrator (owner answers) | Dispute resolution target (follow-up to 10): with DISPUTED→CONFIRMED removed, where does a runner-favourable resolution go: COMPLETED? Customer-favourable → CANCELLED? | open |
| 37 | orchestrator (owner answers) | Cancel after payment (follow-up to 9): reject-and-cancel from IN_PROGRESS happens after the service fee is paid and maybe after the merchant was paid. Refund rules? Any other active states that should reach CANCELLED? | open |

## Session log

| Date | Summary | Commits |
|------|---------|---------|
| 2026-10-07 | Customer surface spec + audit (design-auditor): 17 views specced; 8 audited-fail (7 views + shell), 10 specced/not built; 9 undrawn screens mapped; 21 owner questions | 40dbc17, 1153736, eb7853e |
| 2026-10-07 | api-contract customer gaps (feat/api-customer-gaps, stage built): 11 A-items added, 4 blocked on owner, Socket.IO gateway added (@nestjs/websockets, @nestjs/platform-socket.io per §4.1); 58 unit + 9 e2e tests pass | c1adb4c, d61992f, f5d2a51, 5a221a0, 03225af, aa9c18a, 1d4b24b, 239e73d, 5bb5b3d, f4213f7, 288e251 |
| 2026-10-07 | core-ui customer shared (feat/core-customer-widgets, stage built): bundled Fira fonts, theme aligned to design system, C-01..C-34 + data layer; open design Qs held as defaults in nitume_design_choices.dart; 55 tests pass | 6e571dd, d302802, ebe65a3, 25fca57, 38a6b42, 6691b4f |
