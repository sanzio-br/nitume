# Website gap report (signed-in app parity, issues #5–#18)

- Surface: `apps/website` (Angular 22, standalone components, signals, Vitest through `@angular/build:unit-test`).
- Authority to build: **BOARD row W-Q0** (owner, 2026-10-28, given in conversation; recorded by the orchestrator on branch `docs/board-website-parity`, commit `44eaa7a`). The owner's words:

  > "lets create every feature that is present in the runner and customer app to be present website create issues on github and start working on them"

  This is the website equivalent of BOARD row 84 for admin. `web-parity` may build **only** the items recorded in this report, each tagged **approved extension, W-Q0**. Anything not listed here is out of scope until a later section of this report adds it.
- **This report is cumulative.** It holds one section per GitHub issue, #5 to #18, added as each issue's web spec is written. A new issue adds a new section; earlier sections are kept and updated in place at re-audit (verdict and findings). Item ids carry the issue number (`G5-n` for #5, `G6-n` for #6, and so on) so they stay unique across sections.
- Common rules for every section: the public marketing pages and their styles stay unchanged; colours only through the `--nitume-*` token layer; Fira Sans for UI text and Fira Code for numeric data only; six category display names; task states exactly as `Nitume_System_Design.md` §3.3; no wallet/escrow wording; the three payment flows stay separate.
- Paths below are relative to `apps/website/` unless they start with `docs/`, `apps/api/`, `packages/` or `.gitignore` (repo root).
- Re-audit command (every section): `cd apps/website && npx ng test --watch=false` (0 failures) and `npx ng build` (succeeds, marketing budget unchanged).

---

## Issue #5 — ui-kit

- Spec: `docs/specs/website/ui-kit.md` (commit `250940e`, branch `feat/website-ui-kit`). Section numbers below (§n) refer to that spec.
- Baseline audited: `apps/website` on `feat/website-ui-kit` at `bca50c2` (website code identical to `main` `8df4356`; only docs changed on this branch).
- Builder: `web-parity`, branch `feat/website-ui-kit`, commit scope `angular-website`.
- Every item G5-1 … G5-41 is **approved extension, W-Q0**.

### Verdict: FAIL (not built)

The website has only marketing code. None of the kit exists: no `src/styles/` folder, no `--nitume-*` tokens, no `nm-` components, no `shared/{ui,status,format,map}/`, no `core/realtime/`, no `socket.io-client` or `@angular/google-maps` dependency, no `mapsApiKey`, no Fira Code 700, and no kit tests.

### Owner decisions that apply to this section (GitHub #5 comment, owner, 2026-10-28)

| Id | Decision | Where it lands |
|---|---|---|
| WQ-7 | **Approved.** Add the Fira Code 700 weight to the existing Google Fonts link. | G5-7 |
| WQ-3 | **Approved as proposed.** From 768px wide, bottom sheets become a centred panel (max-width 560px). Dialogs stay at 335px. | G5-20, G5-21 |
| WQ-1 | **Still with the owner** (Maps browser key). `LiveMapComponent` shows its no-key placeholder until a key is configured locally. No key goes into source, tests, docs or commits. | G5-33, G5-34 |

Still open, and the builder uses the spec default without deciding anything beyond it: WQ-2 (customer times: local for activity, EAT for deadlines, G5-25), WQ-4 (no web push; the kit has nothing for it), WQ-5 (marketing drift is left untouched, G5-1), WQ-6 (issue #15, nothing in the kit), WQ-8 (token storage; the kit reads tokens only through `REALTIME_TOKEN_PROVIDER`, G5-27).

### Current-state evidence (baseline)

| Fact | Evidence |
|---|---|
| No token layer | `src/styles/` does not exist. `src/styles.scss:1-30` declares only unprefixed `--blue` … `--r-l: 22px` (marketing). The header comment on line 2 says "mirrors admin --nitume-* tokens", but no `--nitume-*` property exists |
| No kit components | `src/app/shared/` has only `category-card`, `footer`, `header`, `profile-card`, `proof-item`, `ticket` |
| No realtime/map | `src/app/core/` has only `api-types.ts`, `auth/`, `services/` |
| Fira Code 700 missing | `src/index.html:13` `family=Fira+Code:wght@400;500;600` |
| No maps key config | `src/environments/environment.ts` has `{ apiBaseUrl }` only; there is no `environment.local*.ts`; `angular.json` has no `fileReplacements` and no `local` configuration (line 33, `configurations` only has `production`/`development`) |
| Wrong ignore path | `.gitignore:18` `web/environments/*.local.ts` (that path does not exist) |
| Deps missing | `package.json` dependencies: `@angular/{common,compiler,core,forms,platform-browser,router}`, `rxjs`, `tslib`, `zone.js` only |
| Existing raw colours | 41 matches of `/#[0-9a-fA-F]{3,8}\b\|rgba?\(\|box-shadow/` under `src/app/`, all in marketing files (`shared/{header,ticket,profile-card,category-card}`, `pages/*`). Marketing is excluded from the kit's static check (§12 test 2) and must not be changed |

### Items

Each item gives: **severity**, **current** state in `apps/website`, **target** (spec §), **evidence at re-audit** (what the auditor checks, including the §12 test numbers that must exist and pass as separate `it(...)` cases).

#### A. Token layer

**G5-1 `_tokens.scss` file and wiring** (blocker, missing)
- Current: no `src/styles/_tokens.scss`; `src/styles.scss` has no `@use`.
- Target: §2.1. New `src/styles/_tokens.scss` is the only file in the signed-in app that holds a hex or `rgba()` value. `src/styles.scss` gains `@use 'styles/tokens';` as its **first line** and nothing else changes in it (marketing `--blue` … `--r-l: 22px`, `.btn`, `.card`, `.input`, `.check`, `.num`, `:focus-visible` all stay as they are; WQ-5 open).
- Evidence: `git diff main -- apps/website/src/styles.scss` shows the single added `@use` line. Tests §12 **1** and **3**.

**G5-2 Colour tokens** (blocker, missing)
- Current: none (`--nitume-*` absent).
- Target: §2.2. Exactly 16 properties: `--nitume-blue #0B2545`, `-white #FFFFFF`, `-slate #F4F6F9`, `-green #04AF4D`, `-blue-700 #08192F`, `-blue-050 #E9EDF3`, `-slate-line #E2E7EF`, `-slate-600 #5C6B85`, `-slate-400 #8C97AC`, `-green-050 #E3F8EA`, `-green-700 #038A3D`, `-amber #B8860B`, `-amber-050 #FBF3E1`, `-red #C1433C`, `-red-050 #FBEAE9`, `--nitume-scrim rgba(11, 37, 69, 0.5)`. No other colour token: no neutral and no grey.
- Evidence: values compared verbatim in test §12 **1**; `rg -n "\-\-nitume-[a-z0-9-]+:" apps/website/src/styles/_tokens.scss` lists exactly these colour names.

**G5-3 Type families and type-style mixins** (blocker, missing)
- Current: none. Fonts are set only by marketing rules.
- Target: §2.3 `--nitume-font-ui`, `--nitume-font-num`. §2.4 mixin `nm-type($name)` with all 29 styles (`h1` … `num-progress`), with the family, size, weight, colour and letter-spacing in the table. Line-height is 1.4 for Sans and 1.3 for Code. Components never set `font-size`/`font-family` literals.
- Evidence: test §12 **1** (families); `rg -n "font-(size|family)\s*:" apps/website/src/app/shared apps/website/src/app/core` returns no hits outside `_tokens.scss` mixins; each component test that checks a type style (tests 6, 19, 26, 29, 43, 65) passes.

**G5-4 Spacing and radius tokens** (blocker, missing)
- Current: marketing only has `--r-s 8px`, `--r-m 14px`, `--r-l 22px` (`styles.scss:27-29`). The design system says 20px for `--r-l`.
- Target: §2.5 `--nitume-space-{xs 4, sm 8, md 16, lg 24, xl 32, screen 20}px`, `--nitume-tap 48px`. §2.6 `--nitume-r-s 8px`, `--nitume-r-m 14px`, `--nitume-r-l 20px`, `--nitume-r-pill 999px`. Kit components never read the unprefixed marketing variables. Component-internal paddings that are off this scale stay as literal `px` values (allowed).
- Evidence: test §12 **1**; `rg -n "var\(--(r-|blue|green|slate|white|amber|red)" apps/website/src/app/shared/{ui,status,format,map} apps/website/src/app/core/realtime` returns no hits.

**G5-5 Breakpoints and helper mixins** (blocker, missing)
- Current: none.
- Target: §2.7 `$nm-bp-min 360px`, `$nm-bp-md 768px`, `$nm-bp-lg 1024px`, `$nm-bp-xl 1280px`, `--nitume-content-max 1180px`; mixins `nm-up($bp)`, `nm-type($name)`, `nm-hit-area` (48×48 via `::before`), `nm-focus-ring` (2px `--nitume-green` outline, offset 2px; 1px on fields).
- Evidence: the mixins exist in `_tokens.scss` and are used by `nm-button` (small), `nm-checkbox` and `nm-field`; tests §12 **6**, **18**, **22**.

**G5-6 No raw colour and no shadow in app code** (blocker, missing guard)
- Current: no guard exists. The 41 existing hits are marketing-only (see baseline).
- Target: §2.1, §9. No hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, named colour or `box-shadow` in any file under `src/app/` except marketing paths listed in §1. Marker SVG colours are read at runtime from the custom properties (G5-32).
- Evidence: test §12 **2** (Vitest globs `src/app/`, excludes marketing by path) passes; auditor runs `rg -n "#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(|box-shadow|\b(white|black)\b\s*;" apps/website/src/app/shared/{ui,status,format,map} apps/website/src/app/core/realtime` and expects no hits.

**G5-7 Fira Code 700 font weight (WQ-7, owner approved)** (blocker, missing)
- Current: `src/index.html:13` loads `Fira+Code:wght@400;500;600`.
- Target: §1 fonts row, WQ-7. The same link becomes `Fira+Code:wght@400;500;600;700`. No other change to the link: Fira Sans stays `400;500;600;700`, `display=swap`, no second `<link>`.
- Evidence: `git diff main -- apps/website/src/index.html` is a one-token change on line 13.

#### B. Components

**G5-8 `nm-button`** (blocker, missing)
- Current: only the global marketing `.btn`, `.btn-primary`, `.btn-outline` (`styles.scss`). There is no secondary, text, link, destructive, loading or small variant.
- Target: §4.1. Variants `primary | secondary | outline | text | link` with the fill/label/border/hover table. `destructive` applies to outline and text only (red label); on fills it is ignored with a dev-mode warning; there is no red fill. Sizes regular (12px 22px, min-height 48) and small (9px 16px, `button-sm`, 48px hit area). Disabled, loading (spinner, `aria-busy`, width kept), `href` renders `<a>`, `type` defaults to `button`, leading icon slot, `nm-focus-ring`. Does not use the marketing `.btn` classes.
- Evidence: tests §12 **4, 5, 6, 7, 8, 9**.

**G5-9 `nm-status-chip`** (blocker, missing)
- Current: only the marketing `.tag-chip` and `.status-pill` (always amber, animated). Neither may be reused.
- Target: §4.2.1. Inputs `label`, `tone (success|info|pending|danger)`, `size (regular|compact|tag)`, `showDot`, `numericSuffix` (after ` · `, in `nmNum`). Convenience inputs `customerStatus` and `runnerStatus` + `offerAccepted`; renders nothing when the map returns `null`. Row 33 high contrast: the label is blue on every tint and only the dot carries the tone colour. Sizes and paddings as the table. `<span>`, not interactive, dot `aria-hidden`. Does not copy the admin `status-chip` (it has a `neutral` tone and admin labels).
- Evidence: tests §12 **10** (render half), **11** (render half), **13, 14, 15, 16**; `rg -n "neutral|'Assigned'|'Settled'|'Confirmed'" apps/website/src/app/shared` returns no hits.

**G5-10 `nm-tag`** (blocker, missing)
- Target: §4.2.2. Blue text on blue-050, pill, no dot, 11/600, padding 6px 11px, never green, not focusable.
- Evidence: test §12 **17**.

**G5-11 `ErrandStatus`, `customerStatus()`, `customerTimelineTitle()`** (blocker, missing)
- Current: no state type on the website (`core/api-types.ts` covers OTP only).
- Target: §4.2.3, §4.2.5. File `src/app/shared/status/status-presentation.ts`. `ErrandStatus` is a union of the 17 §3.3 wire values in order, plus `ERRAND_STATUSES`. The customer table covers all 17 states (for example `RUNNER_ASSIGNED` → `Finding a runner` info, `RUNNER_EN_ROUTE` → `En route` pending, `CANCELLED` → danger, `EXPIRED` → info, `CONFIRMED`/`SETTLED` → `Completed`). Exhaustive `switch` with `const _: never`. A parser returns `null` for unknown wire strings. `customerTimelineTitle`: `RUNNER_ASSIGNED` → `null`, `RUNNER_EN_ROUTE` → `Runner assigned`, otherwise the label.
- Evidence: tests §12 **10** (all 17 rows), **12**, **16**.

**G5-12 `runnerStatus()`** (blocker, missing)
- Target: §4.2.4. All 17 states. `DRAFT`, `REQUESTED`, `QUOTED`, `ACCEPTED` → `null`. `PAYMENT_CONFIRMED` → `New offer`. `RUNNER_ASSIGNED` → `New offer` (`offerAccepted: false`) or `Accepted` (default `true`). `RUNNER_EN_ROUTE` → `On the way` (pending). `AWAITING_CUSTOMER` → `Waiting for the customer`. `SETTLED` → `Paid`. The remaining states use the shared labels. No admin labels.
- Evidence: test §12 **11** (17 states + `offerAccepted: false`).

**G5-13 `nm-checkbox`** (blocker, missing)
- Current: only the marketing `.check` (18px green box). It does not match the design system and must not be reused.
- Target: §4.3.1. 22px box, radius 6px, 2px slate-line border, white fill. Checked: green fill and border with a white 12px check. Hit area 48×48. A native `<input type="checkbox">` is visually hidden under the box. Space toggles. `disabled`. An optional `label` makes the whole row clickable.
- Evidence: test §12 **18**.

**G5-14 `nm-list-group` + `nm-list-item`** (blocker, missing)
- Target: §4.3.2. The group is a `<ul role="list">` with a white fill, slate-line border, r-m radius, and hairlines between items but none after the last. Item padding 16px 18px, gap 14px. Title `list-title`; when done it is slate-600 with a slate-line strike-through. Meta is Fira Code `num-meta-lg`. The progress counter `num-progress` comes from `formatCounter` and is green-700 only when `done === total`. Inputs `title`, `meta`, `progress`, `done`, `clickable` (→ `activated`), `checkable` (→ `checkedChange`). Accessible name `title, meta, 3 of 5, completed`.
- Evidence: tests §12 **19, 20**.

**G5-15 `nm-step-card`** (blocker, missing)
- Target: §4.3.3. White card, r-m, slate-line border, padding 13px 15px, gap 12px. Leading display-only `nm-checkbox`. Title 13/600 Sans. Subtitle Fira Code 11 slate-600. An optional trailing small **secondary** `nm-button`; when present, the whole card runs the action. Accessible names as the spec.
- Evidence: test §12 **21**.

**G5-16 `nm-card` + `nm-section-label`** (blocker, missing)
- Current: only the marketing `.card` (padding 22). It must not be reused.
- Target: §4.4. Card: white, slate-line border, r-m, padding 16 (overridable), `border: solid | dashed` (+ `dashedWidth`), `clickable` → button/anchor wrapper with focus ring and a blue border on hover, no shadow. Section label: `section-label` style, uppercase through CSS only (the DOM keeps sentence case), padding `6px 20px 10px` (`inset`), heading level from an input (default `h2`).
- Evidence: tests §12 **22, 23**.

**G5-17 `nm-field` + `nm-form-card`** (blocker, missing)
- Current: only the marketing `.input` (slate fill, 10px radius). This contradicts Q12/OA-12 and must not be reused.
- Target: §4.5. The label is a real `<label for>`. White fill, slate-line border, r-s, padding 11px 14px, placeholder slate-400. Focus: green border + 2px outline offset 1px. Error: red border, `error` message with `role="alert"`, `aria-invalid`, `aria-describedby`. Kinds `text`, `multiline` (3→6 rows), `money` (persistent Fira Code `KSh ` prefix, digits only, `inputmode="numeric"`), `phone` (Fira Code, `type="tel"`, `inputmode="tel"`, `autocomplete="tel"`). Optional `maxLength` Fira Code `n/max` counter. `ControlValueAccessor`. `nm-form-card` = `nm-card` + a `card-label` heading.
- Evidence: tests §12 **24, 25, 26, 27, 28**.

**G5-18 `nm-timeline`** (blocker, missing)
- Target: §4.6. `<ol>`. A 22px left column with a 9px dot (done green, pending slate-400) and a 1px slate-line connector, except on the last step. Title 12.5/400 blue Sans. Time in `num-meta` Fira Code. Gap 18px. `aria-label` = `title, time, done|pending`, inner text `aria-hidden`.
- Evidence: test §12 **29**.

**G5-19 `nm-empty-state`, `nm-error-state`, `nm-skeleton-card`, `friendlyError()`** (blocker, missing)
- Target: §4.7. Empty state: optional title (heading level input), a required `muted` message, and an optional primary action that emits `action`. Error state: message in a `role="alert"` region, outline retry button (default `Try again`) that emits `retry`. `friendlyError`: network failure (HTTP 0 / fetch `TypeError`) → `Check your connection and try again.`; anything else → `Something went wrong. Please try again.`. Skeleton: white, slate-line, r-m, padding 14px 15px, two static slate bars (60%/35%, 12px/10px), `role="status"`, `aria-label="Loading"`, `height` input (default 72), no shimmer.
- Evidence: tests §12 **30, 31, 32, 33**.

**G5-20 `NmDialogService` + `nm-dialog` + `confirm()` (WQ-3: dialogs stay 335px)** (blocker, missing)
- Target: §4.8, WQ-3. `--nitume-scrim` backdrop. White card, r-l 20px, padding 20px, **max-width 335px at every width**, width `calc(100% - 40px)`, no shadow. Title `dialog-title` `<h2>`, body `body` in slate-600, then a full-width vertical action stack with 10px gaps and an optional `error` line. `confirm()`: confirm label first as **outline** (red label when `destructive`), cancel second as **primary**. It resolves `true` only on confirm. `dismissible: false` blocks scrim and Escape. `role="dialog"`/`alertdialog`, `aria-modal`, focus to the title or first action, focus trap, focus returned to the opener, background `inert`, scroll lock.
- Evidence: tests §12 **34, 35, 36**.

**G5-21 `NmPanelService` + `nm-panel` (WQ-3: centred panel from 768px)** (blocker, missing)
- Target: §4.9, WQ-3. Below 768px: docked to the bottom, full width, top corners r-l 20px, max-height 90vh with internal scroll, padding `16px 20px 10px` + `env(safe-area-inset-bottom)`, 32×4 slate-line drag handle `aria-hidden`. **From 768px: bottom-anchored, horizontally centred, `max-width: 560px`** (owner-approved, not a side drawer). Scrim, optional `dialog-title`, and the same focus/inert/Escape/scroll-lock rules as the dialog.
- Evidence: test §12 **37** (viewport stubbed at both widths).

**G5-22 `NmToastService` + `nm-toast-host`** (blocker, missing)
- Target: §4.10. Blue-700 fill with white `body` text, r-s, padding 14px 16px, max-width 560px, bottom-centre 16px + safe area, optional offset. One toast at a time (a new one replaces the old). Auto-dismiss after 4s; hover/focus pauses the timer. No action button. `role="status"`, `aria-live="polite"`. Template variant for `nmNum` parts. The host is placed by #6, not by this issue.
- Evidence: test §12 **38**.

**G5-23 `nm-notice`** (blocker, missing)
- Target: §4.11. White, slate-line border, r-m, padding 12px 14px, `muted` 13px text, optional 18px slate-600 info icon, optional trailing small outline button slot. `tone: 'danger'` swaps in a red error icon only; there is no coloured fill.
- Evidence: test §12 **39**.

#### C. Numeric data, formatters, pipes, directive

**G5-24 `nmNum` directive** (blocker, missing)
- Current: only the marketing `.num` class. It must not be used inside `/app`.
- Target: §5.1, §5.3. `<span nmNum>` switches to `--nitume-font-num`. `[nmNum]="'amount-lg'|'amount'|'num'|'sm'|'meta-lg'|'meta'|'progress'"` applies the named style. With no value, only the family changes. `nmNumLabel` sets `aria-label` (with `kesSpoken` for signed ledger amounts).
- Evidence: test §12 **43**; `rg -n "class=\"[^\"]*\bnum\b|font-family" apps/website/src/app/shared/{ui,status,format,map}` returns no hits.

**G5-25 `formatters.ts` + one pure pipe per function** (blocker, missing)
- Target: §5.2. `src/app/shared/format/formatters.ts` exports `formatKes` (with `signed`), `formatKesOrDash`, `formatAmount`, `formatKesLedger` (U+2212), `kesSpoken`, `formatClock`, `formatDayTime`, `formatRelativeShort`, `formatShortDate`, `formatMonthYear`, `formatEta`, `formatCountdown`, `formatCounter`, `formatRating`, `formatClockEat`, `formatDayTimeEat`, `formatDeadlineEat`, `formatRelativeShortEat`, `eatDayKey`, `eatWeekday`, `eatWeekStart`, `formatDistanceKm`, `formatDurationMin`, `formatPhoneIntl`. Each has a standalone pure pipe of the same name. Money is handled on the decimal string (no float). EAT functions use `getTime() + 3h` and `getUTC*` only. Local functions take an injected `now`. Copy: `KSh`, never `KES`; `—` for a missing value. WQ-2 is open, so use the default: customer activity times are local and deadlines are EAT; runner times are EAT everywhere.
- Evidence: tests §12 **40** (every vector in the §5.2 table, one assertion each), **41, 42**; `rg -n "'KES|KES " apps/website/src/app/shared` shows no user-facing hits.

**G5-26 `categoryName` pipe + `CUSTOMER_MVP_CATEGORIES`** (blocker, missing)
- Target: §5.4. Maps the six wire values to `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me`, `Business Tasks`, in that order. Unknown values give an empty result. `CUSTOMER_MVP_CATEGORIES` holds the first five (no `business`).
- Evidence: test §12 **44**.

#### D. `RealtimeService`

**G5-27 Connection, auth handshake and `REALTIME_TOKEN_PROVIDER` stub** (blocker, missing)
- Current: no socket client. `core/auth/auth.store.ts` holds tokens in `localStorage` (WQ-8 open).
- Target: §6.1, §6.2. `src/app/core/realtime/realtime.service.ts` (+ a tokens file). It connects to the API **origin** `environment.apiBaseUrl` (not `/api/v1`) with `path: '/socket.io'`, `transports: ['websocket']`, `auth: { token }`, `reconnection: false`, `autoConnect: true`. `SOCKET_IO_FACTORY` defaults to `io`. `REALTIME_TOKEN_PROVIDER: InjectionToken<() => Promise<string | null>>` is declared in this issue. Issue #6 supplies the real provider (fresh access token via `POST /api/v1/auth/refresh`). Until #6 lands, this issue ships a **stub** default that returns `null`, so `connect()` ends in `disconnected` and never opens a socket without a token. The service never imports `AuthStore` and never reads `localStorage`.
- Evidence: test §12 **45** (fake factory + fake provider); `rg -n "AuthStore|localStorage" apps/website/src/app/core/realtime` returns no hits; the stub provider and a test of its `null` path (part of test **48**) exist.

**G5-28 Lifecycle, reconnect and backoff** (blocker, missing)
- Target: §6.2. States `disconnected | connecting | connected | reconnecting`. On disconnect or `connect_error`, the service closes the socket, waits the backoff, then reconnects with a **fresh** token. A `null` token → `disconnected`. Backoff is `min(30000, 1000·2^(n−1))` × jitter [0.8, 1.2], injectable through `REALTIME_BACKOFF`. A window `online` event triggers an immediate retry while `reconnecting`. Events from a stale socket are ignored. `disconnect()` stops retries and clears rooms.
- Evidence: tests §12 **46, 47, 48, 55, 56, 57**.

**G5-29 Public API, rooms and the 16-event contract** (blocker, missing)
- Target: §6.3, §6.4. `state` signal, `connect`, `disconnect`, `joinErrand` (ack `ok`; 10s ack timeout → `false`, room kept), `leaveErrand`, `sendLocationPing` (`{ ok:false, sent:false }` when offline or no ack in 10s; `forbidden`/`not_live` flagged as stop). There are 13 hot, no-replay observables, one per server event: `location:update`, `errand:status_changed`, `evidence:uploaded`, `price_change:requested`, `quote:reissued`, `merchant_details:updated`, `merchant_details:changed`, `quote:requested`, `errand:access_revoked`, `job:offered`, `job:offer_withdrawn`, `price_change:decided`, `price_change:difference_paid`. The client sends `errand:join`, `errand:leave`, `location:ping`. Event names and payload types live only in `realtime.events.ts` (ISO dates parsed to `Date`, prices kept as strings). Malformed payloads and unknown `status` values are dropped silently. `errand:access_revoked` removes the room before emitting. The client never joins `runner:{id}:status` and never uses `admins`. No other event name is allowed.
- Evidence: tests §12 **49, 50, 51** (all 13 events, two subscribers), **52, 53, 54**; `rg -n "'(errand|location|job|quote|price_change|merchant_details|evidence):" apps/website/src/app --glob '!**/realtime.events.ts' --glob '!**/*.spec.ts'` returns no hits.

**G5-30 `showReconnecting(delayMs)` and the `Reconnecting…` copy** (blocker, missing)
- Target: §6.3, §6.6. A signal that is true once the state has been non-connected for `delayMs` and false on `connected`. The copy uses the single U+2026 character. View placement (customer line under the map, runner `nm-notice` after 5s) belongs to issues #9/#14.
- Evidence: test §12 **58**.

#### E. `LiveMapComponent` and maps loading

**G5-31 `MapsLoaderService`** (blocker, missing)
- Target: §7.5. Loads the Maps JavaScript API once per page with the configured key (`…/maps/api/js?key=…&loading=async` or `@googlemaps/js-api-loader`), no extra libraries. `ready: Signal<'idle' | 'loading' | 'ready' | 'unavailable'>`. Empty key → `unavailable` without a network request.
- Evidence: test §12 **66** (script never requested without a key).

**G5-32 `nm-live-map` behaviour** (blocker, missing)
- Target: §7.1–§7.3. Inputs: `start`, `end`, `runner`, `routeTo`, `etaLabel`, `height` (default 220), `ariaLabel`, `moveDurationMs` (1200), `fitPadding` (40), plus the `[nmMapOverlay]` slot. Frame: r-m, slate-line border, `overflow:hidden`. ETA chip: white pill with a hairline, Fira Code 11.5/700 blue, padding 6px 10px, no shadow. The map is created **once** with `disableDefaultUI`, `clickableIcons: false`, `gestureHandling: 'cooperative'`, `keyboardShortcuts: true`. Markers: blue start pin, green end pin, 16px green runner dot with a 3px white ring, built from CSS custom properties at runtime. Route: dashed blue straight polyline (self variant runner → `routeTo`). Camera fit/zoom-14/refit rules as specified. The runner marker glides with `requestAnimationFrame` (first point placed directly, a mid-glide update restarts from the current position, `null` removes at once and keeps nothing). `prefers-reduced-motion` jumps without gliding.
- Evidence: tests §12 **59, 60, 61, 62, 63, 64, 65, 67, 68** (fake `google.maps` namespace).

**G5-33 No-key / load-failure placeholder (WQ-1 open)** (blocker, missing)
- Target: §7.4, WQ-1. With `mapsApiKey` empty or the loader `unavailable`, the frame shows a blue-050 fill (no grid or image), the ETA chip and overlay still render, and it carries `role="img"` with `ariaLabel`. No error text. Because WQ-1 is still with the owner, this is the state every environment shows until a key is configured locally.
- Evidence: test §12 **66**.

**G5-34 Maps key configuration (never committed)** (blocker, missing)
- Current: `src/environments/environment.ts` has `apiBaseUrl` only; `angular.json` has no `fileReplacements`.
- Target: §7.6, §1. The `Environment` interface and `environment.ts` gain `mapsApiKey: ''` (always empty in git). Add a committed `src/environments/environment.local.example.ts` with an empty key. The gitignored `src/environments/environment.local.ts` is swapped in by a `fileReplacements` entry in a new `local` build configuration (and a matching `serve` configuration). No key in source, tests, docs or commit messages.
- Evidence: `git grep -nE "AIza[0-9A-Za-z_-]{20,}" feat/website-ui-kit` returns nothing; `angular.json` has `configurations.local.fileReplacements` → `environment.local.ts`; `git ls-files apps/website/src/environments` lists `environment.ts` and `environment.local.example.ts` only.

**G5-35 `.gitignore` line** (blocker, missing)
- Current: root `.gitignore:18` `web/environments/*.local.ts` (that path does not exist).
- Target: §7.6. Add `apps/website/src/environments/*.local.ts` to the root `.gitignore`. The existing line may stay. The new pattern must not match `environment.local.example.ts`, which it does not, because that name ends in `.example.ts`.
- Evidence: `git check-ignore -v apps/website/src/environments/environment.local.ts` reports the new root line; `git check-ignore apps/website/src/environments/environment.local.example.ts` reports nothing.

**G5-36 npm dependencies** (blocker, missing)
- Current: `apps/website/package.json` has neither package.
- Target: §6.1, §7. Add `socket.io-client` (^4) and `@angular/google-maps` (^22, matching `@angular/core`) to `dependencies`. `@types/google.maps` goes in devDependencies if the build needs it. `@googlemaps/js-api-loader` is optional (§7.5). No other new runtime dependency. `package-lock.json` is updated in the same commit.
- Evidence: `git diff main -- apps/website/package.json` shows only these additions; `npm ls socket.io-client @angular/google-maps` resolves in `apps/website`.

#### F. Layout, rules and health

**G5-37 File layout and marketing untouched** (blocker, missing)
- Target: §11. Folders `src/styles/_tokens.scss`, `src/app/shared/ui/{button,status-chip,list,card,field,timeline,states,overlay,notice}/`, `src/app/shared/{status,format,map}/`, `src/app/core/realtime/`. Selector prefix `nm-`. Every component is standalone, `OnPush`, and uses signal inputs. Marketing files (`pages/*`, `shared/{header,footer,category-card,profile-card,proof-item,ticket}`, existing `styles.scss` rules, `app.routes.ts` marketing routes) are not modified. A kit gallery route is optional; if one exists it sits under the guarded `/app` tree and is not linked from marketing.
- Evidence: `git diff --stat main -- apps/website/src/app/pages apps/website/src/app/shared/{header,footer,category-card,profile-card,proof-item,ticket}` is empty; `rg -n "changeDetection" apps/website/src/app/shared/ui` shows `OnPush` on every component.

**G5-38 Responsive and accessibility rules** (blocker, missing)
- Target: §8. No horizontal scroll from 360px. Hit areas ≥ 48×48. A visible focus ring on every interactive element and no bare `outline: none`. Hover only where defined. Overlays respect `env(safe-area-inset-*)`. Live regions as specified. Motion is limited to the glide, the spinner and 150–200ms overlay fades, all off under `prefers-reduced-motion`.
- Evidence: `rg -n "outline:\s*(none|0)" apps/website/src/app/shared` shows only lines that also set a replacement ring; tests **6, 18, 34, 37, 38, 67**.

**G5-39 Domain rules in kit defaults** (blocker, missing)
- Target: §9. Six display names only (five for customers). Exhaustive state maps with no invented or admin labels. No wallet/escrow wording in any default copy. The kit has no money-flow component. Amber and red appear only as chip-sized accents.
- Evidence: `rg -ni "wallet|escrow" apps/website/src/app/shared apps/website/src/app/core/realtime` returns no hits; tests **10, 11, 44**.

**G5-40 Required Vitest cases (§12, 69 cases)** (blocker, missing)
- Current: no kit spec files.
- Target: §12. Every numbered case 1–68 is its own `it(...)`. Colour assertions check the custom-property **name**, never a hex. The coverage table below must be complete at re-audit.
- Evidence: the auditor greps the spec files for each case and runs the suite.

| §12 cases | Item |
|---|---|
| 1, 3 | G5-1, G5-2, G5-3, G5-4 |
| 2 | G5-6 |
| 4–9 | G5-8 |
| 10 | G5-9, G5-11 |
| 11 | G5-9, G5-12 |
| 12 | G5-11 |
| 13–16 | G5-9 (16 also G5-11) |
| 17 | G5-10 |
| 18 | G5-13 |
| 19, 20 | G5-14 |
| 21 | G5-15 |
| 22, 23 | G5-16 |
| 24–28 | G5-17 |
| 29 | G5-18 |
| 30–33 | G5-19 |
| 34–36 | G5-20 |
| 37 | G5-21 |
| 38 | G5-22 |
| 39 | G5-23 |
| 40–42 | G5-25 |
| 43 | G5-24 |
| 44 | G5-26 |
| 45 | G5-27 |
| 46–48, 55–57 | G5-28 (48 also covers the G5-27 stub `null` path) |
| 49–54 | G5-29 |
| 58 | G5-30 |
| 59–65, 67, 68 | G5-32 |
| 66 | G5-31, G5-33 |
| 69 | G5-41 |

**G5-41 Build health** (blocker, to verify)
- Target: §12.12 case 69. `cd apps/website && npx ng test --watch=false` gives 0 failures and `npx ng build` succeeds. The marketing `initial` budget (`angular.json:38-39`, 500kb warning / 1mb error) is unchanged and not exceeded: kit code is tree-shaken or in lazy chunks until #6 routes use it. Conventional commits are on `feat/website-ui-kit` with scope `angular-website`.
- Evidence: the PR body pastes the test summary and build output; `git diff main -- apps/website/angular.json` changes only the `local` configuration (G5-34).

### Re-audit checklist for #5 (auditor)

1. G5-1 … G5-41 each closed with the evidence above.
2. Token scan: `rg -n "Color\(0x|#[0-9A-Fa-f]{6}" apps/website/src/app --glob '!**/pages/**' --glob '!**/shared/{header,footer,category-card,profile-card,proof-item,ticket}/**'` returns no hits.
3. Spec §13 open questions (WQ-2, WQ-4, WQ-5, WQ-6, WQ-8) are not decided in code beyond the spec default.
4. Verdict PASS → `SCREEN_MAP.md` row #5 status `matches-design`.

---

<!-- Sections for issues #6 to #18 are appended below as their web specs are written. -->
