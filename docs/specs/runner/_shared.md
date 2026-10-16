# Runner app — shared spec conventions

Applies to every `docs/specs/runner/*.md`. Each view spec references the component ids (`C-xx` reused from the customer surface, `R-xx` new for the runner surface), owner rows, runner questions (`RQ-n`) and API gaps (`RA-n`) below instead of repeating them. Written 2026-10-13 (design-auditor, `docs/owner-answers-6-runner-specs`).

Sources (real paths):
- Mockup: `docs/design/nitume_runner_app.html` (488 lines; 4 root views + 12 overlays, one tab bar, no modals)
- Design system: `docs/design/nitume_design_system.html`
- System design: `docs/design/Nitume_System_Design.md` (§2.2 and §6 updated 2026-10-13 for rows 104–111; §3.3 state machine; §4 real-time; §7.2 Flutter)
- Customer conventions reused: `docs/specs/customer/_shared.md` (tokens §2, typography §3, components C-01 … C-40, copy rules §7)
- Gap report and questions: `docs/audits/runner-gap-report.md` (RA-n endpoint gaps, RQ-n owner questions)
- Implementation: `apps/runner_app` scaffolded on `feat/runner-scaffold` (`063f036`, `8ea961c`, `4294245`): shell, v-auth-phone, v-auth-otp, x-name-capture (audit: `docs/audits/runner-gap-report.md` §7)
- Shared package: `packages/nitume_core/lib/src/**` (on `main` @ `95e9d6c`)

Order of precedence: owner answers, then the design system for styling, then the mockup for content, copy and flow (AGENT_BUILD_INSTRUCTIONS §1). Where the mockup CSS differs from the design system, the spec gives the design-system value and records the mockup value as "mockup:". Copy marked **(proposed)** was written by the auditor for states or screens the mockup does not draw.

## 0. Owner answers that shape the runner app

Customer-side answers OA-1 … OA-21 and rows 1–102 apply where they concern shared rules (see `docs/specs/customer/_shared.md` §0). The ones that change runner screens:

| Row / OA | Decision | Applied in |
|---|---|---|
| OA-1, row 1 | Six categories, full display names only; wire values `buy_for_me … business` | §7, v-jobs, v-job-detail, v-edit-skills |
| OA-2, row 40 | `displayName` for runners too, collected after first sign-in; the API computes short names | x-name-capture, v-profile, v-job-summary |
| OA-6 | No escrow or wallet words. "Available balance" is a payout-ledger view only | §7, v-earnings, v-payout |
| OA-11 … OA-14, rows 33, 38 | Pill buttons, white 8px fields with 2px green focus, red/amber accent rules, off-palette values replaced, high-contrast chip text, blue 50% scrim | §2, every view |
| OA-17, row 53 | OTP policy (5-minute expiry, 5 attempts, 60 s cooldown, 5 per hour, IP throttling) | v-auth-phone, v-auth-otp |
| OA-18 | Business Tasks out of MVP; one configurable Support entry point | v-edit-skills, v-profile |
| rows 25, 32 | Evidence via short-lived signed URLs; **video deferred from MVP** | v-evidence-capture, v-active (row 121 confirms the runner side) |
| row 27, 65 | Live location only for the current assignment, RUNNER_ASSIGNED → AWAITING_CUSTOMER | §10, v-active |
| rows 29–31, 39 | `socket_io_client`, `google_maps_flutter`, `firebase_messaging`, `url_launcher` approved (already in `nitume_core`) | §10 |
| row 34, 47 | No invented pricing rules; no fee components shown until pricing rates exist | v-job-summary (row 119) |
| rows 37, 49, 55, 61, 101 | Runner price changes only in IN_PROGRESS, only for Buy For Me and Get It For Me (400 otherwise); reject = customer cancels (IN_PROGRESS → CANCELLED); an admin rejection only rejects | v-active, v-price-request |
| row 42, 66, 76 | `send_to_runner` is platform-mediated: the customer pays Nitume, never the runner | §8, v-job-detail |
| row 79 | The dispute resolution note is shown to the runner as well | v-active (ended states) |
| row 82 | `KSh` everywhere a person reads money | §7 |
| row 95 | `send_to_runner` item amount is **reimbursed** after the receipt is accepted, never advanced | §8, v-job-detail, v-job-summary, v-earnings |
| row 96 | Admin times in 12-hour EAT (runner: the same, row 122) | §7 |
| row 98 | API runs single-instance (no Socket.IO Redis adapter) | §10 (no client impact) |
| row 102 | Paid tasks ending CANCELLED, EXPIRED or FAILED open a customer refund review (not the runner's concern; no runner copy) | v-active (ended states) |
| row 104 | Reimbursement becomes payable at **CONFIRMED** | §8, v-job-summary, v-earnings |
| row 105 | Missing/mismatched receipt → not payable automatically, ops review; capped at the item amount paid to Nitume | §8, v-active, v-evidence-capture, v-earnings |
| row 106 | Runner already bought the item, task ends CANCELLED or FAILED → verified item spend reimbursed (caps/evidence apply); **no runner fee** | §8, v-active (ended states), v-earnings |
| row 107 | Runner payout ledger table approved (`runner_payout_lines`): distinct lines for runner fee, item reimbursement, corrections, reversals, re-sent payouts | §8, v-earnings, x-payout-history |
| row 108 | Out-of-pocket purchases limited by `max_purchase_advance`; a runner may decline a task whose purchase exceeds the limit | §8, v-jobs, v-job-detail |
| rows 113, 114, 137 (RQ-1, RQ-2) | **Offer model**: the admin's assign puts the task in RUNNER_ASSIGNED with an **offer** to one runner. Accept → RUNNER_EN_ROUTE (the runner's existing transition); decline → the task stays RUNNER_ASSIGNED and ops reassign it; an offer not accepted before it expires → EXPIRED. Admin offers last **10 minutes** (auto-offers keep the configurable 90 s, §3.4). Accepting above `max_purchase_advance` is refused; declining because of it is allowed and not penalised | §1, §6, §8, v-jobs, v-job-detail, v-active |
| row 115 (RQ-3) | Runner skills = the six category values (migration from `RunnerSkill`) | v-edit-skills, v-profile |
| row 116 (RQ-4) | Service areas = an ops-configured list | v-edit-skills, v-jobs |
| rows 117, 118 (RQ-5, RQ-6) | Runner payout requests: up to the available amount, configurable minimum, one open request at a time, ops pay manually, own auditable payout-request record; destination fixed to the sign-in phone | v-payout, v-earnings, x-payout-history |
| row 119 (RQ-7) | One `Runner fee` line until pricing rates exist | v-job-summary |
| rows 120, 121 (RQ-8, RQ-9) | Generic evidence checklist, no estimated duration; photos only, no video | v-active, v-evidence-capture, v-jobs, v-job-detail |
| row 122 (RQ-10) | Runner app shows 12-hour EAT; the API stays canonical (UTC) | §7 |
| row 123 (RQ-11) | Location: every 30 s online without a job, every 4–8 s on a job, **none offline** (collection stops when offline) | §10, x-location-disclosure |
| row 124 (RQ-12) | Packages approved: `geolocator`, `image_picker`, `permission_handler`, a local queue store | §4 R-20 … R-22, §12 |
| rows 125, 126 (RQ-13, RQ-14) | ID and selfie in restricted private storage (no public URLs, signed admin-only URLs, access logged); manual review of ID, selfie, M-Pesa name and every other required check; verified only when all are approved | §9, onboarding |
| row 127 (RQ-15) | One phone, one role; the runner app refuses customer numbers | v-auth-otp |
| row 128 (RQ-16) | No direct runner–customer contact; Support relays | v-active |
| rows 129, 130 (RQ-17, RQ-18) | Receipt upload up to **24 h** after CANCELLED/FAILED, then the ops process; no runner-entered receipt total | v-active, v-evidence-capture, v-job-summary |
| row 131 (RQ-19) | Terms and Privacy links on runner sign-in and Profile | v-auth-phone, v-profile |
| row 132 (RQ-20) | No FAILED from ARRIVED or IN_PROGRESS; Support handles those cases | v-active |
| row 133 (RQ-21) | Keep `Recent payouts` | v-earnings |
| row 134 | `errand_assignments.declineReason` (nullable, enum `over_purchase_limit`) approved | v-jobs, v-job-detail |
| row 135 | Over-limit purchase at CONFIRMED → ops review (`over_purchase_limit`); maximum claimable = min(item amount paid to Nitume, `max_purchase_advance`) | §8, v-job-summary |
| row 136 | Task-level combined exposure cap on CANCELLED/FAILED: customer refund + runner item reimbursement together; above it only through ops review and explicit handling | §8, v-job-summary |
| row 138 | `max_purchase_advance` default KES 3,000, set per runner by admins (audited: actor, time, previous, new); runners cannot change it | §8, v-profile |
| row 139 | Runner notifications (copy in `v-notifications.md`); runner socket room scoped to the authenticated runner, never a client-supplied id | §10, v-notifications |

## 1. Navigation model

- **Root tab views**: `v-jobs`, `v-active`, `v-earnings`, `v-profile`, above a 4-item bottom tab bar (C-13 `NitumeTabBar`): `Jobs`, `Active`, `Earnings`, `Profile` (mockup icons: briefcase, eye, circle-plus, person; use Material outline equivalents). Active tab label and icon green-700, inactive slate-400 (as built for the customer shell).
- **Pushed screens**: every other `v-*` and `x-*` screen. They cover the tab bar and use the pushed header (C-10) with a back arrow, except the signed-out screens.
- **Modals** (C-35 `NitumeDialog`): short confirmations only (decline offer, can't complete, log out, discard evidence, send price change). The mockup draws none.
- Signed-out stack: `v-auth-phone` → `v-auth-otp` → (`x-name-capture` if `displayName` is empty) → onboarding (`v-onboard-id` → `v-onboard-selfie` → `v-onboard-pending`) if verification is not complete → shell on `v-jobs`.
- Mockup bugs not ported: `jump(id, true)` always lands on Jobs, so `Accept job` on `v-job-detail` (`jump('v-active', true)`) shows Jobs. The real app goes to the **Active** tab for that job after Accept. The offer card's `Accept` calls `showView('v-active')` without the tab highlight; the real app selects the Active tab.
- Deep links (push taps): §10.

| Id | Kind | Spec |
|---|---|---|
| v-auth-phone, v-auth-otp | signed-out | yes |
| x-name-capture | first sign-in (not drawn) | yes |
| v-onboard-id, v-onboard-selfie | onboarding, pushed | yes |
| v-onboard-pending | onboarding, pushed; also from Profile → `Verification documents` | yes |
| v-jobs, v-active, v-earnings, v-profile | root tabs | yes |
| v-job-detail | pushed from an offer card or a notification | yes |
| v-evidence-capture, v-price-request, v-job-summary | pushed from `v-active` | yes |
| v-payout | pushed from `v-earnings` | yes |
| x-payout-history | pushed from `v-earnings` `Payout history` (not drawn) | yes |
| x-location-disclosure | before the first location permission request (not drawn, §7.2 "clear in-app disclosure") | yes |
| v-notifications | pushed from the bell on `v-jobs` and from Profile | yes |
| v-edit-skills | pushed from Profile | yes |
| x-support, x-legal | external links, reuse the customer specs (`docs/specs/customer/x-support.md`, `x-legal.md`) with the runner `AppConfig` URIs | referenced in v-profile, v-auth-phone |

## 2. Tokens (design system, exact)

Same table as `docs/specs/customer/_shared.md` §2 (blue, blue-700, blue-050, white, slate, slate-line, slate-600, slate-400, green, green-050, green-700, amber/amber-050, red/red-050), the same radii (`r-s 8`, `r-m 14`, `r-l 20`, pill 999) and the same scrim (row 38). The runner mockup's `:root` matches the design system exactly. Off-palette or off-pattern values in the runner mockup and their replacements (OA-14):

| Mockup value | Where | Replacement |
|---|---|---|
| `#AEB9CC` | `.avail-row span`, `.bal-card span` (secondary text on blue) | **blue-050 `#E9EDF3`** (a derived tone, ≥ 11:1 on blue). The customer surface used slate-400 for the same mockup value on its active card (≈5:1); on the runner's two blue cards the text is the main figure's label, so the lighter tone is proposed. Titles and amounts are white (rule: white text on blue fills) |
| `#EAEEF4` | `.job-map` placeholder bg | blue-050 `#E9EDF3` |
| `rgba(4,175,77,0.3)` ring | `.avail-dot` | no ring; 9px green dot with a 2px white border (the dot marks an active state, allowed) |
| `rgba(255,255,255,0.1)` fill, `rgba(255,255,255,0.15)` border | `.bal-btn` on the blue balance card | C-03 outline button (white fill, slate-line border, blue text), small size, pill |
| `rgba(0,0,0,.25)` shadow | `.nav-chip` | no shadow; 1px slate-line border (as the customer ETA chip) |
| `.offer-tag` green-050 / green-700 | category tag on offers | **chip-info** (blue on blue-050, C-05 info without dot). Green is reserved for actions, active toggles and complete states; a category is none of these |
| `.badge` green-050 / green-700 | skills and areas on Profile | R-14 tag, chip-info style (display only). In `v-edit-skills` selection uses C-16 (selected = blue fill, white text) |
| `.bar` green-050, `.bar.hi` green | weekly earnings chart | R-11: bars blue-050, today's bar blue. Green is not decorative |
| `.verif-status` green-700 / amber text | verification rows | C-05 status chip, small (success / pending / danger) |
| `.menu-row.danger` red text | `Log out` | C-24 destructive row (red text is allowed for destructive rows, OA-13) |
| `.step-card` green fill with white text | `Mark task complete` | C-01 primary pill button, full width, with a caption line under it (design-system button pattern wins over a green card) |
| `.btn-sm` radius 10, `.cta-fixed`/`.cta-outline` radius 14, `.upload-btn` radius 8, `.go-btn` radius 8 | buttons | pill 999 (OA-11) |
| `.field` 10px radius | inputs | C-17 (white, r-s 8, slate-line, 2px green focus) |
| Emoji (`🪪`, `🏠`, `🛏️`, `🚿`, `⚠️`) | thumbnails, price-change row | Material outline icons in blue / slate-600; real photo thumbnails once captured |
| 44px fake status bar, notch | frame | `SafeArea`; not ported |

**Bell unread dot**: red 7px with a 1.5px white ring (C-11, OA-13), as drawn.

## 3. Typography

Same rules and roles as `docs/specs/customer/_shared.md` §3: Fira Sans for all UI text through the theme; Fira Code only for numeric data through `NitumeTypography.numeric(...)` / `NumText` (C-32). Meta lines that mix words and numbers (`.offer-meta`, `.step-sub`, `.nav-chip span`) are Fira Code as a whole line (design-system `.li-meta`). Runner-specific sizes from the mockup CSS:

| Role | Size / weight | Font |
|---|---|---|
| Root top-bar title (`.topbar h2`) | 21 / 700 | Sans |
| Pushed header title (`.ov-header h2`) | 18 / 700 | Sans |
| Step counter (`.ov-step`, `Step 1 of 2`) | 11 / 400 slate-600 | Code |
| Auth heading | 22 / 700 | Sans |
| Section label (`.sec-label`) | 11.5 / 700 uppercase 0.05em slate-600 | Sans |
| Offer pay (`.offer-pay`) | 17 / 600 | Code |
| Offer title (`.offer-title`) | 14 / 600 | Sans |
| Offer meta (`.offer-meta`) | 11.5 / 400 slate-600 | Code |
| Step title / sub | 13 / 600 · 11 / 400 slate-600 | Sans · Code |
| Balance amount (`.bal-card h3`) | 30 / 600 white | Code |
| Stat value / label | 16 / 600 (Code) · 10 / 400 uppercase slate-600 (Sans) | |
| Chart day labels | 10 / 400 slate-600 | Code |
| Detail rows (`.verif-row`) | 13 / 400 label (Sans), value Code where numeric | |

## 4. Shared components

Status: **exists** = in `packages/nitume_core` on `main` (class named); **change** = exists but needs a change for the runner surface; **NEW** = core-ui must build it before the screen agent needs it. Never build these per screen in `apps/runner_app`.

### 4.1 Reused from the customer surface (C-xx)

| Id | Component | Runner use | Status |
|---|---|---|---|
| C-01 | `NitumeButton.primary` | Send code, Verify & continue, Continue, Submit for review, Accept job, Save to task, Send to customer for approval, Back to jobs, Confirm payout, Save changes, Mark task complete and the other state steps | exists |
| C-02 | `NitumeButton.secondary` | `Upload` / `Add` on checklist rows (blue fill, white text; mockup `.upload-btn`), `Navigate` on the nav chip is **primary** (green action, mockup `.go-btn`) | exists |
| C-03 | `NitumeButton.outline` (+ small) | Decline, Back to app, Request payout / Payout history on the balance card | exists |
| C-04 | `NitumeButton.text` / `.link` | Resend code, Mark all read, Try again | exists |
| C-05 | `StatusChip` (+ small) | verification row statuses, job state chip on `v-active`, ledger line status | exists |
| C-07 | `NitumeCard` (+ dashed) | offer card, detail cards, price card, drop zones | exists |
| C-08 | `SectionLabel` | every `.sec-label` | exists |
| C-09 | `NitumeTopBar` (title + actions) | root tabs | exists |
| C-10 | `NitumePushedHeader` (back 48 hit, title, Fira Code step counter) | every pushed screen; `Step 1 of 2` uses the step slot | exists |
| C-11 | `NotificationBell` | `v-jobs` top bar | exists |
| C-12 | `InitialsAvatar` (70) | Profile head | exists |
| C-13 | `NitumeTabBar` | runner shell, 4 items | exists |
| C-16 | `NitumeChoiceChip` | skills and areas selection on `v-edit-skills` | exists |
| C-17 | `NitumeField` (+ money, phone, multiline) and `NitumeFormCard` | phone, price, reason, payout amount | exists |
| C-18 | `ReceiptCard` / `ReceiptRow` / `ReceiptSeparateGroup` | job summary earnings, payout lines | exists |
| C-24 | `MenuRow` (+ destructive) | Profile menu | exists. **change** (minor): optional `subtitle` for the price-change entry row on `v-active` (R-09 below uses it) |
| C-25 | `EvidenceGrid` / `EvidenceViewer` | uploaded evidence on `v-active` and `v-evidence-capture` (signed URLs, row 25) | exists |
| C-26, C-38 | `OtpCodeField`, `OtpResendLine` | `v-auth-otp` | exists |
| C-28 | `NotificationRow` | `v-notifications` | exists |
| C-31 | `LiveTrackingMap` / `GoogleTrackingMap` (+ placeholder body) | job map on `v-job-detail` and `v-active` | exists. **change**: a "self" marker for the runner's own device position and no customer-facing ETA chip (R-06 supplies the nav chip) |
| C-32 | `formatKes`, `NumText`, `formatEta`, `formatCounter`, `formatRating` | everywhere | exists |
| C-33 | `NitumeEmptyState`, `NitumeErrorState`, `SkeletonCard` | lists and loads | exists |
| C-35 | `NitumeDialog`, `showNitumeConfirmDialog` | confirmations | exists |
| C-36 | `NitumeCheckbox` | checklist rows (display only, not tappable) | exists |
| C-39 | `CopyableValueRow` | not used | — |
| C-40 | `NitumeNotice` | over-limit notice, offline notice, hold notices | exists |
| — | `NitumeWordmark` | auth screens; needs a `Runner` suffix (R-17) | **change** |
| — | `NitumeListItem` | not used (step cards are R-07) | — |

### 4.2 New for the runner surface (R-xx, core-ui)

| Id | Component | Design-system pattern | Status |
|---|---|---|---|
| R-01 | `runnerStatusPresentation(ErrandStatus)`: runner label + tone (§6). Separate from the customer map C-06, which must not change | — | NEW |
| R-02 | `AvailabilityCard`: blue card r-m 14, padding 15 18; leading 9px status dot (green when online, slate-400 when offline) + title 14/700 white (`Online` / `Offline`) + areas line Fira Code 11 blue-050; trailing switch (theme `Switch`, green active track, white thumb). Disabled state (not verified, offline queue) with reason line | `.avail-row` + design-system "active toggle" | NEW |
| R-03 | (reserved) | | |
| R-04 | `JobOfferCard`: white card r-m 14, padding 16; top row category tag (R-14) left, pay Fira Code 17/600 right; title 14/600; meta Fira Code 11.5 slate-600; optional R-15-style over-limit notice line; action row gap 8: C-03 small `Decline` + C-01 small `Accept` (pill, flex 1 each). Card tap → detail | `.offer-card` + `.btn-*` | NEW |
| R-05 | `InfoRow`: label 13 Sans left, value right (Fira Code when numeric, or a trailing widget such as a chip), padding 12 0, hairline between rows, none after the last | `.verif-row` / design-system list hairline | NEW |
| R-06 | `NavigationChip`: white bar r 12, 1px slate-line, padding 10 14 over the map bottom (12 inset); destination 13/700 Sans + Fira Code 11 slate-600 `1.2 km · 6 min`; trailing small C-01 `Navigate` | `.nav-chip` | NEW |
| R-07 | `ChecklistStepCard`: white card r 12, 1px slate-line, padding 13 15, gap 12; leading C-36 (done = green check); title 13/600 + Fira Code 11 slate-600 sub; optional trailing small C-02 action (`Upload`, `Add`, `Edit`); whole card tappable when it has an action | `.step-card` + `.check` | NEW |
| R-08 | `BalanceCard`: blue card r 16, padding 20; label 11.5 blue-050; amount Fira Code 30/600 white (`NumText.kes`); optional sub-line Fira Code 11.5 blue-050 (`KSh 1,200 waiting for confirmation`); optional action row (two C-03 small outline buttons, gap 10) | `.bal-card` | NEW |
| R-09 | `ActionRowCard`: white card r 12, slate-line, padding 13 15; leading 20px icon (slate-600), title 13/600, sub 11 slate-600 (Sans, no numbers), trailing chevron slate-400 | `.step-card` used as a link | NEW (or C-24 with subtitle + leading icon; core-ui decides, one component either way) |
| R-10 | `StatTile` + `StatRow3`: 3-column grid gap 10; tile white r 12 padding 12 centred; value Fira Code 16/600; label 10 uppercase slate-600 Sans | `.stat-b` | NEW |
| R-11 | `WeeklyBarChart`: card (C-07) with C-08 label; 7 bars Mon–Sun, height 90, gap 8, radius 5 top; bars blue-050, today's bar blue; Fira Code 10 slate-600 day initials; semantics label per bar (`Wednesday, KSh 1,750`) | `.chart-row` (colours replaced, §2) | NEW |
| R-12 | `LedgerLineRow`: white r 10, slate-line, padding 12 15; left: title 12.5 Sans + kind caption 11 slate-600 (`Runner fee`, `Item reimbursement`, `Payout to M-Pesa`, `Payout corrected`, `Payout reversed`, `Payout re-sent to M-Pesa`; feed kinds `runner_fee`, `item_reimbursement`, `payout`, `correction`, `reversal`, `resent_payout`) + optional C-05 small status chip (`On hold`, `Not approved`; there is no `pending` line status in the API) + optional second caption line (on-hold reason); right: signed amount Fira Code 600 (`+ KSh 1,750`, `− KSh 6,000`), blue (never green/red text for money) | `.payout-row` | NEW |
| R-13 | `CaptureDropZone`: C-07 dashed card (2px slate-line dashed, r 16), height 220 (selfie 260, evidence 240), centred 36px outline icon blue + caption 12.5 slate-600; tap opens camera (and gallery where allowed); disabled + spinner while uploading | `.upload-box` | NEW |
| R-14 | `NitumeTag`: chip-info pill without dot, 11/600, padding 6 11 (display-only labels: category on offers, skills and areas on Profile) | `.chip-info` | NEW |
| R-15 | `CaptureThumbnail` + row: local image thumbnail, aspect 1.4 (documents) or 1 (evidence), r 12; states uploading (spinner), uploaded (green check badge, complete state), failed (C-05 danger `Not uploaded` + `Retry`), remove/retake icon button (48 hit) | `.doc-thumb` | NEW |
| R-16 | `JobRouteMap`: C-31 map body with task-site/pickup pin (green), drop-off/second pin (blue), the runner's own position, and a route line from the device to the next point; static (no live ETA ticker); placeholder body (blue-050 grid) without a maps key | `.job-map` | NEW (composition of C-31) |
| R-17 | `NitumeWordmark(suffix: 'Runner')`: suffix 12/600 slate-600 | `.auth-logo` | **change** |
| R-18 | EAT formatters (RQ-10): `formatClockEat` (`10:28 AM`), `formatDayTimeEat` (`Today, 10:28 AM`), `eatDayKey`, `eatWeekday` (weeks start Monday 00:00 EAT), `formatDistanceKm` (`1.2 km`, `850 m` under 1 km), `formatDurationMin` (`45 min`, `1 h 10 min`) | `.t-num-sm` | NEW |
| R-19 | Runner data layer: `RunnerAccountRepository` (`GET /runners/me`, availability, verifications + document upload, skills, areas), `JobOffersRepository` (offers list, accept, decline with optional `over_purchase_limit` reason, `purchaseCheck(errandId)` → `GET /errands/:id/purchase-check`), `RunnerJobsRepository` (runner job view, transitions, runner notes, evidence upload), `PayoutLedgerRepository` (`earnings({from,to,groupBy})` → `GET /runners/me/earnings`, `lines({kind,errandId,cursor,limit})` → `GET /runners/me/payout-lines`, `claim(...)` → `POST /runners/me/reimbursement-claims`; payout requests later, RQ-5), models (`RunnerMe`, `RunnerVerification`, `JobOffer`, `PurchaseCheck`, `RunnerJobView`, `PayoutFeedItem` (kind incl. derived `payout`; status `on_hold | payable | paid | rejected | recorded`; signed string amount; opaque id), `EarningsSummary`, `PayoutRequest` later), `RealtimeEvents` additions (§10) | — | NEW (endpoints per RA-n) |
| R-20 | `LocationPinger` service: `geolocator` (RQ-12) stream, 4–8 s / 15 m throttle (§4.2), emits `location:ping`, Android foreground service + iOS background mode during the live window only, stops on offline/end (§7.2) | — | NEW |
| R-21 | `OfflineActionQueue`: persists runner status transitions and evidence uploads made without connectivity and replays them in order on reconnect (§7.2), with an idempotency key per action (RA-17) | — | NEW |
| R-22 | `EvidenceUploader`: camera capture (RQ-12) → compress (long edge 1600 px, JPEG 80) → `POST /errands/:id/evidence` with `capturedAt`, `lat`, `lon`; per-item progress and retry; through R-21 when offline | — | NEW |

## 5. Layout constants

As customer `_shared.md` §5: horizontal padding 20; section label padding `6 20 10`; pushed header padding `10 20 14`, back button 32 visual / 48 hit; fixed bottom CTA margin `auto 20 6` (pill, above the bottom safe area); `SafeArea` instead of the fake status bar; tap targets ≥ 48×48 dp (bell 36, back 32, small buttons, chips and the switch get padded hit areas). Card gap 12 (offers), 10 (step cards), 8 (menu and ledger rows).

## 6. Errand state → runner label (proposed, R-01)

State machine: `docs/design/Nitume_System_Design.md` §3.3 exactly. The runner app renders whatever state the API returns and never invents or skips states. **Runner-fired transitions** (actor R): RUNNER_ASSIGNED → RUNNER_EN_ROUTE; RUNNER_EN_ROUTE → ARRIVED (manual override of the geofence, §4.3); RUNNER_EN_ROUTE → FAILED; ARRIVED → IN_PROGRESS; IN_PROGRESS → AWAITING_CUSTOMER (evidence uploaded). Everything else is customer, admin or system. A runner only sees errands they hold (current assignment, API rule) or are offered (RA-1); states before RUNNER_ASSIGNED never reach the runner. Accepting an offer **is** the RUNNER_ASSIGNED → RUNNER_EN_ROUTE transition (row 113): there is no separate `Start trip` step and no `accepted` waiting state.

| State | Runner label (proposed) | Tone | Runner action on `v-active` (proposed copy) |
|---|---|---|---|
| RUNNER_ASSIGNED (offered to this runner, row 113) | `New offer` | info | Accept (→ RUNNER_EN_ROUTE) / Decline (`v-jobs`, `v-job-detail`); not on `v-active` |
| RUNNER_EN_ROUTE | `On the way` | pending (amber, same tone as the customer's En route, OA-13) | `I've arrived` → ARRIVED; secondary `Can't complete this task` → FAILED |
| ARRIVED | `Arrived` | info | `Start task` → IN_PROGRESS |
| IN_PROGRESS | `In progress` | info | `Mark task complete` → AWAITING_CUSTOMER |
| AWAITING_CUSTOMER | `Waiting for the customer` | pending | none (→ `v-job-summary`) |
| COMPLETED | `Completed` | success | none |
| CONFIRMED | `Completed` | success | none (the ledger shows the runner fee as payable) |
| SETTLED | `Paid` | success | none |
| CANCELLED | `Cancelled` | danger | none |
| FAILED | `Failed` | danger | none |
| EXPIRED | `Expired` | info | none (the offer ran out before anyone accepted, row 113; whether the first lapse expires the task is row 141 pending; the runner only sees the offer disappear) |
| DISPUTED | `Disputed` | danger | none; shows `The customer reported a problem. Our team is reviewing it.` |

Active set (`v-active`): RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER, DISPUTED. Finished set (job history inside `x-payout-history` and notifications): COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED, EXPIRED.

## 7. Copy and naming rules

- **Categories** (OA-1): display names only, wire values in API code: Buy For Me (`buy_for_me`), Get It For Me (`pickup_delivery`), Check It For Me (`inspection`), Go There For Me (`representation`), Wait For Me (`queue_admin`), Business Tasks (`business`). The mockup's offer tags `Inspection`, `Shopping`, `Documents` are **not** category names and are replaced by the category display name of the errand (`Check It For Me`, `Buy For Me`, `Get It For Me`). Business Tasks is out of MVP (OA-18) and never offered; an errand that somehow carries `business` is labelled `Business Tasks`.
- **Task title**: `title` when set, else the category display name (row 41). The mockup's `Check apartment — Nyali` is a sample `title`.
- **Task reference**: `#` + `reference` (`#NT-10482`), Fira Code, hidden when null.
- **Customer name**: the runner sees the customer's short name only where the API returns it (row 40), never a phone number. The mockup shows none on job screens; only the rating notification (`— Achieng O.`).
- **Runner name**: `displayName` from `GET /users/me`; greeting uses the first word (`Nice work, Brian.`), Profile shows the API short name (`Brian K.`), never shortened client-side.
- **Verification level** (`runner_profiles.verification_level`, proposed labels): `1_basic` → `Level 1 — Basic`, `2_id_verified` → `Level 2 — ID verified`, `3_trusted` → `Level 3 — Trusted`, `4_professional` → `Level 4 — Professional`. Profile line: `Verified Runner · Level 3 — Trusted` (the level number is Fira Code).
- **No wallet or escrow words** (OA-6, non-negotiable): `wallet`, `escrow`, `held`, `hold your money`, `release`, `top up`, `funds` are banned. `Available balance` (mockup) is kept as the label of a **payout-ledger view** (system design §6: "The Runner app's 'available balance' is a view of the payout ledger"); its info line says so: `What Nitume owes you for confirmed tasks, minus payouts already sent.` (proposed). `On hold` is allowed only as a **ledger line status** for reimbursements waiting for ops review (row 105), never about money Nitume keeps.
- **Earnings vs reimbursement**: an item reimbursement is **not** earnings. Weekly chart and `You earned` use runner-fee lines only; reimbursements are always their own line labelled `Item reimbursement` (three-flow separation).
- **Money**: `KSh 1,750` (`formatKes`), Fira Code, `KSh` everywhere (row 82). Signed ledger amounts `+ KSh 1,750` / `− KSh 6,000` (thin space after the sign as drawn).
- **Times** (row 122): 12-hour East Africa Time regardless of the device zone: `10:28 AM`, `Today, 10:28 AM`, `Yesterday, 4:12 PM`, `Mon, 10:28 AM`; relative `2m`, `1h`, `Yesterday`, `Mon` in notifications; Fira Code. The API stays UTC.
- **Distances and durations**: `1.2 km`, `850 m`, `45 min`, `6 min` (Fira Code). Distance on offers is device-to-task-site (straight line until the API returns a route distance); never show a distance without a device fix (`Distance unavailable`, proposed).
- **Generic errors**: as customer §7 (`Check your connection and try again.`, `Something went wrong. Please try again.`, session expiry → `v-auth-phone` + `Please sign in again.`). Suspended or banned account: `This account can't sign in. Contact support.`
- **Wrong account type** (row 127): a phone that belongs to a customer (or admin) account cannot use the runner app: `This number is registered as a customer account. Use another number, or contact support.`

## 8. Money: what the runner sees (rows 42, 66, 76, 95, 104–108)

Three flows stay separate (system design §6). The runner only ever sees **their runner fee** and, on purchase tasks, the **item amount** they will spend and get reimbursed. The service fee, the customer's fee total (`feeTotal`), the commission split and the customer's payments are never shown to the runner.

| Errand | What the runner reads (proposed copy) |
|---|---|
| No item amount (Check It For Me, Go There For Me, Wait For Me, or Get It For Me without purchase) | `Payout KSh 1,750` = runner fee |
| `merchant_direct` (customer pays the merchant's Till/Paybill) | runner fee + `Item KSh 5,000 · Customer pays the merchant` (mockup: `Budget KSh 5,000 · Customer pays merchant`). The runner never pays and is never reimbursed for it |
| `send_to_runner` (customer paid Nitume, row 42) | runner fee + `Item KSh 5,000 · You pay, reimbursed after the customer confirms` (proposed). Row 95/104: reimbursed once the task reaches CONFIRMED, never advanced |
| item amount above the runner's `max_purchase_advance` (row 108; applies to purchases the runner pays, i.e. `send_to_runner`; also `runner_advance` if ever used) | C-40 notice on the offer: `Above your purchase limit of KSh 3,000. You can decline this job.` Decline sends reason `over_purchase_limit` and never counts against the runner (row 113). `Accept` is disabled; the API refuses it (row 113; proposed code `purchase_limit_exceeded`, RA-1) |

Reimbursement and payout rules shown in the app:
- **Payable at CONFIRMED** (row 104): customer confirmed, dispute window closed, no dispute. There is no `pending` line status: before CONFIRMED the reimbursement is not on the ledger yet, and the app derives the text from the errand status (as `v-job-summary.md` Data), e.g. `Payable after the customer confirms and the review window closes.` (proposed).
- **Receipt required** (rows 95, 105): on `send_to_runner` the checklist has a required `Receipt` step. Without a receipt (or with one that does not match), the reimbursement line goes `On hold` for ops review and is capped at min(item amount paid to Nitume, `max_purchase_advance`) (row 135). Copy: `On hold: our team is checking the receipt.` (proposed). The runner fee is not affected.
- **Ended without completion** (row 106): CANCELLED or FAILED after the runner bought the item → verified item spend can be reimbursed (on hold until verified, caps apply); **no runner fee**. Copy on the ended job: `This task ended before completion, so there's no runner fee. If you already bought the item, we'll review your receipt and reimburse what you spent.` (proposed). If no receipt is on file the line adds `Upload the receipt from this screen within 24 hours.` (row 129); after 24 hours `Contact support with your receipt.`
- **Ledger lines** (row 107; built on `feat/api-owner-answers-6` @ `10b6019`, table `runner_payout_lines`, column `kind` = `runner_fee | item_reimbursement | correction | reversal | resent_payout`; job-line statuses `on_hold | payable | paid | rejected`, adjustments `recorded`). The runner feed adds a derived `payout` entry per M-Pesa payout (not a stored row; id `payout:<uuid>`, opaque). Each entry is its own row in `v-earnings` / `x-payout-history`; nothing is merged or netted on screen except the computed `Available balance` (`availableAmount`). Lines exist only from CONFIRMED (or a row-106 claim); before that a task only counts in `pendingAmount`.
- **Purchase limit** (rows 108, 113, 134, 135, 138): the limit is the runner's `max_purchase_advance` (default KES 3,000, set per runner by admins with an audit trail; read-only for the runner, shown on `v-profile`). Offers carry the over-limit flag; accept is refused above it; decline with `over_purchase_limit` is not penalised. A purchase above the limit found at CONFIRMED goes `on_hold` (`over_purchase_limit`). The most a runner can be reimbursed for an item is min(item amount paid to Nitume, `max_purchase_advance`) (row 135). Built on `feat/api-owner-answers-6`: `GET /errands/:id/purchase-check`, the decline on the assigned job (to be folded into the offer decline, RA-1), the CONFIRMED hold and the claim cap.
- **Combined exposure cap** (row 136): on a CANCELLED/FAILED task the customer refund and the runner's item reimbursement together may not exceed the task-level cap; a claim above what is left goes to ops review and explicit handling. The runner app does not show the customer's refund; it only shows the cap the API returns on a refused claim and `Our team is checking your claim.`
- **Payout requests** (rows 117, 118): the runner may request a payout of any amount from the configured minimum up to `availableAmount`, one open request at a time, paid manually by ops to the sign-in phone; each request is its own auditable record (`v-payout`).

## 9. Verification gate (non-negotiable: no ID-verification bypass)

- A runner whose verification is not approved can sign in, finish onboarding and read `v-onboard-pending`, `v-profile`, `v-notifications`, but cannot go online, see offers or accept jobs. `v-jobs` shows the verification card instead of offers; the availability switch is disabled with `You can go online once your verification is approved.` (proposed).
- The rule must be enforced by the API (RA-8), not only hidden in the UI.
- Required records (mockup `v-onboard-pending`): `phone` (approved by the OTP sign-in), `government_id` (front + back), `selfie`, `payment_identity` (M-Pesa identity match, done by ops). Verified only when every required check is approved (row 126); ID and selfie images live in restricted private storage with signed admin-only URLs and logged access (row 125).

## 10. Live data, location and push

- **Socket** (core `RealtimeClient`, rows 23, 29): one connection per session. The runner joins `errand:{id}` for each job it holds (`errand:join`; the API allows the current runner) and receives `errand:status_changed`, `evidence:uploaded`, `errand:access_revoked`. Needed and missing (RA-5): room `runner:{runnerId}` (§4.2 `runner:{runnerId}:status`) joined **by the server** on connect from the authenticated runner (row 139: never a client-supplied room id), with `job:offered`, `job:offer_withdrawn` (expired, reassigned or cancelled) and `price_change:decided` (approved / rejected / customer cancelled). Event names only through core `RealtimeEvents`.
- **Polling fallback** only while the socket is disconnected: offers 20 s, active job 15 s, earnings on screen open and pull-to-refresh. Banner `Reconnecting…` (C-40) after 5 s disconnected.
- **Location pings** (RA-4, rows 27, 65, 123): emit `location:ping { lat, lng, errandId, accuracy, ts }` every 4–8 s or 15 m moved while the runner holds a job in RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS (from the moment they accept); stop at AWAITING_CUSTOMER, on any terminal state, on reassignment. While online without a job: every 30 s without `errandId`. **Offline: no pings and no collection at all** (the pinger and the location stream stop). Background location only during the live window, behind `x-location-disclosure`.
- **Android foreground-service notification** (final, confirmed 2026-10-14; built in `nitume_runner_device` `geolocator_position_source.dart`): title `Nitume Runner`, text `Sharing your location for your active job.` It is shown only while background collection runs, which is only during a job (RUNNER_EN_ROUTE … IN_PROGRESS). The 30 s pings while online without a job are foreground-only and show no notification; if that ever changes, the text must change too (proposed `Sharing your location while you're online.`).
- **Navigation**: `Navigate` opens Google Maps turn-by-turn through `url_launcher` (`google.navigation:q=lat,lng` on Android, `https://www.google.com/maps/dir/?api=1&destination=lat,lng` elsewhere; §5). No in-app navigation.
- **Push** (row 31): register the FCM token after sign-in (`POST /users/me/devices`, runner role allowed), remove on log out. Runner notification kinds and copy: `v-notifications.md` (row 139; API: RA-6). Deep links: job offer → `v-job-detail`; job assigned/started/cancelled/failed/disputed/confirmed → `v-active` (or the ended-job state); price change decided → `v-active`; payout sent / reversal / correction → `v-earnings`; rating → `v-profile`; verification decided → `v-onboard-pending`; unknown with `errandId` → `v-active` if it is the current job, else nothing.
- **Offline** (§7.2): status taps and evidence uploads are queued (R-21) and replayed in order; the UI shows the target state immediately with a C-40 notice `Saved on your phone. We'll send it when you're back online.` (proposed) and never shows a later state than the server confirms after replay (a rejected replay rolls back with the server state and an error notice).

## 11. Accessibility

As customer: screen-reader labels on icon-only controls (bell `Notifications, unread`, back `Back`, switch `Available for jobs`), 48 dp targets, error text announced (live region), status chips read their label, Fira Code values are read as numbers (`KSh 1,750` → "1,750 shillings" via semantics label), dynamic type up to 1.3× without clipping (cards grow). Camera capture has a non-camera path for TalkBack/VoiceOver users (gallery picker) except the selfie (RQ-14).

## 12. App scaffold (built on `feat/runner-scaffold`, audited 2026-10-13)

`flutter-runner` creates `apps/runner_app` mirroring `apps/customer_app`:
- Flutter app, `name: runner_app`, `publish_to: none`, same SDK constraint (`^3.13.4`), depends on `nitume_core: path: ../../packages/nitume_core`; `flutter_lints`; `analysis_options.yaml` copied from the customer app.
- `lib/main.dart` + `lib/src/{config,navigation,screens/{auth,onboarding,shell,jobs,active,earnings,account},services,widgets,util}`; AppScope + ChangeNotifier state as the customer app (row 58).
- Build configuration through `--dart-define-from-file=.env`, with a committed `.env.example` (row 59) and `.env` gitignored, out of the pubspec assets. Keys: `NITUME_API_BASE_URL`, `NITUME_MAPS_ENABLED`, `NITUME_MAPS_API_KEY`, `NITUME_TERMS_URL`, `NITUME_PRIVACY_URL`, `NITUME_SUPPORT_URI`. The role is **not** a build setting: the app always sends `role: runner` on `POST /auth/otp/verify` (amended 2026-10-13 after the scaffold audit; a configurable role in a one-role app only adds a way to misbuild it).
- Android/iOS: separate application ids (built: Android `com.nitume.runner_app`, iOS `com.nitume.runnerApp`, matching the customer app's `com.nitume.customer_app` / `com.nitume.customerApp` pattern; the release ids are the owner's call before store submission), FCM config per app (not committed), location (when-in-use + background with foreground-service type `location` on Android 14) and camera permission strings, after RQ-12 approves the packages.
- `README.md` with setup steps; tests under `test/` per screen.
- Root `scripts/dev.mjs` / `package.json` wiring for the runner app is the orchestrator's call (no change requested here).

## 13. Questions and API gaps

Listed once in `docs/audits/runner-gap-report.md`: RQ-1 … RQ-21 (all decided 2026-10-13, rows 113–133; new questions RQ-22 … RQ-26 = BOARD rows 141–145, pending) and RA-1 … RA-n (api-contract). View specs cite them by id.
