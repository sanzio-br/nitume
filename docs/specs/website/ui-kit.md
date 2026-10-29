# Website signed-in app: shared web UI kit, realtime and map services (`ui-kit`)

- Issue: GitHub #5, "[Website] Foundation: shared web UI kit, realtime and map services". Builder: `web-parity`. Branch for the build: `feat/website-ui-kit` (this spec is on the same branch).
- Surface: `apps/website` (Angular 22, standalone components, signals, Vitest through `@angular/build:unit-test`). The kit serves the signed-in routes `/app/customer/...` and `/app/runner/...` (owner decision 2026-10-28: every customer and runner app feature comes to the website as lazy-loaded signed-in routes). Routes, guards and the shell belong to issue #6, not this spec.
- There is **no web mockup**. Sources, in order of authority:
  1. `docs/design/nitume_design_system.html`: wins on styling (tokens, button, chip, card, list item, form field).
  2. `packages/nitume_core` (Flutter, on `main`): every component, label, tone and formatter below is a 1:1 port of a named Flutter counterpart. The web kit adds no colour, no type style and no component pattern the Flutter kit lacks.
  3. `docs/specs/customer/_shared.md` and `docs/specs/runner/_shared.md`: owner decisions (OA-n, rows) on labels, tones, copy and live data.
  4. `docs/design/Nitume_System_Design.md` §3.3 (states), §4 (realtime), §5 (maps), §7.1 (Angular).
- Everything marked **(web adaptation)** is a layout choice the mobile sources do not make (hover, focus, breakpoints, panel width). They change layout only, never content, copy, tokens or the component set. Anything that needs the owner is in §13.

---

## 1. What already exists in `apps/website` and what the kit does with it

| Existing piece | Path | Matches the design system? | Kit decision |
|---|---|---|---|
| `:root` variables `--blue`, `--white`, `--slate`, `--green`, derived tones, amber/red, `--r-s 8`, `--r-m 14`, `--r-l 22` | `src/styles.scss` lines 4–30 | Colours yes. `--r-l` is **22px**, the design system says 20px. No font, spacing or type tokens | **Leave unchanged** (marketing pages must not change, issue #5 common criteria). The kit adds a separate `--nitume-*` token layer (§2) with the design-system values and never reads the unprefixed variables. Drift reported in §13 WQ-5 |
| Global `.btn`, `.btn-primary`, `.btn-outline` | `src/styles.scss` | Base values match `.btn` (12/22 padding, pill, 14.5/600). No `.btn-secondary`, no `.btn-text`. `.btn-outline:hover` adds a blue-050 fill (design system: border turns blue, no fill) | Not used by the kit. `nm-button` (§4.1) owns its styles |
| Global `.card` | `src/styles.scss` | Padding 22 (design system `.card-demo` 20; Flutter `NitumeCard` 16) | Not used. `nm-card` (§4.4) |
| Global `.input` | `src/styles.scss` | **No**: slate fill, 10px radius, 16px bottom margin. Owner Q12/OA-12 decided white fill, `--r-s` 8 | Not used. `nm-field` (§4.5) |
| Global `.check` | `src/styles.scss` | **No**: 18px green box (design system `.check` 22px, 2px slate-line border, green only when done) | Not used. `nm-checkbox` (§4.3) |
| Global `.tag-chip`, `.status-pill` (+ `.pulse` with `rgba(184,134,11,…)` glow) | `src/styles.scss` | Marketing illustration only; `.status-pill` is always amber and animates | Not used. `nm-status-chip` / `nm-tag` (§4.2) |
| Global `.num` (Fira Code) | `src/styles.scss` | Font yes; no size/colour | Superseded inside the app by the `nmNum` directive (§5.1). Marketing keeps `.num` |
| Global `:focus-visible` (2px green outline, offset 2) | `src/styles.scss` | Yes (design-system focus ring) | **Reused** as is |
| Fonts: Google Fonts link, Fira Sans 400/500/600/700, Fira Code 400/500/600 | `src/index.html` line 13 | Fira Code **700** is missing (Flutter `EtaChip` uses Code 11.5/700) | Builder adds `700` to the Fira Code family in the same link (one extra weight; marketing pages unchanged) |
| `AuthStore` (signals; access/refresh tokens in `localStorage`) | `src/app/core/auth/auth.store.ts` | — | `RealtimeService` reads tokens only through the `REALTIME_TOKEN_PROVIDER` token (§6.4) that issue #6 provides. Token storage question §13 WQ-8 |
| `ApiService` (`${environment.apiBaseUrl}/api/v1`, OTP endpoints only) | `src/app/core/services/api.service.ts` | — | Untouched by the kit. The socket origin is `environment.apiBaseUrl` itself (§6.1) |
| `environment.ts` `{ apiBaseUrl }` | `src/environments/environment.ts` | — | Gains `mapsApiKey: ''` (committed, always empty) and the local-override mechanism in §7.6 |
| Marketing components `app-header`, `app-footer`, `app-category-card`, `app-profile-card`, `app-proof-item`, `app-ticket` | `src/app/shared/*` | Marketing layouts (the ticket has an off-system box-shadow and a 22px radius) | Not reused, not changed. Kit components live in their own folders (§11) |

The admin app (`apps/admin/src/app/shared`, `src/styles/_tokens.scss`) is a separate Angular project. Its `--nitume-*` token **names** are mirrored here so both Angular apps read the same, but its `status-chip` **must not** be copied: it has a `neutral` variant (not in the design system) and admin labels (`Assigned`, `Paid`, `Confirmed`, `Settled`) that customers and runners never see.

---

## 2. Token layer

### 2.1 Files

- `apps/website/src/styles/_tokens.scss`: the **only** file in the signed-in app that may contain a hex or `rgba()` colour value. It declares the CSS custom properties below on `:root` and the matching SCSS maps/mixins (§2.7).
- `apps/website/src/styles.scss`: gains `@use 'styles/tokens';` as its first line. Nothing else in `styles.scss` changes.
- Components reference `var(--nitume-…)` only. Raw hex, `rgb()`, `rgba()`, `hsl()` or named colours (`white`, `black`, `#fff`) in any file under `src/app/` (except `_tokens.scss`) is an audit FAIL. So is `box-shadow` (the design system has none; OA-14 replaced every mockup shadow with a slate-line hairline).

### 2.2 Colour

Values are copied verbatim from `nitume_design_system.html` `:root`. Flutter counterpart: `NitumeColors` (`packages/nitume_core/lib/src/theme/nitume_colors.dart`).

| CSS custom property | Value | Flutter | Allowed use (design system + owner decisions) |
|---|---|---|---|
| `--nitume-blue` | `#0B2545` | `NitumeColors.blue` | All primary text, headings, nav; secondary button fill; selected choice chip fill; avatar fill; chip label text (row 33, §4.2) |
| `--nitume-white` | `#FFFFFF` | `NitumeColors.white` | Cards, inputs, dialogs, panels; **every label on a blue or green fill** |
| `--nitume-slate` | `#F4F6F9` | `NitumeColors.slate` | App canvas behind cards; skeleton bars; outline/text button pressed overlay |
| `--nitume-green` | `#04AF4D` | `NitumeColors.green` | Primary button fill, active toggle track, checked checkbox, done timeline dot, filled stars, focus ring, runner map dot, task-site pin. **Never decorative** |
| `--nitume-blue-700` | `#08192F` | `NitumeColors.blue700` | Secondary button hover/pressed; toast fill (§4.10) |
| `--nitume-blue-050` | `#E9EDF3` | `NitumeColors.blue050` | Info chip and tag background; map placeholder; text selection |
| `--nitume-slate-line` | `#E2E7EF` | `NitumeColors.slateLine` | Hairlines, card/input borders, unchecked checkbox border, timeline connector, disabled filled-button background |
| `--nitume-slate-600` | `#5C6B85` | `NitumeColors.slate600` | Muted text, field labels, section labels, meta lines |
| `--nitume-slate-400` | `#8C97AC` | `NitumeColors.slate400` | Placeholders, chevrons, inactive tab, pending timeline dot, disabled button text |
| `--nitume-green-050` | `#E3F8EA` | `NitumeColors.green050` | Success chip background; category/notification icon boxes |
| `--nitume-green-700` | `#038A3D` | `NitumeColors.green700` | Primary hover/pressed; success chip dot; link buttons; complete `3/5` counter; active tab |
| `--nitume-amber` | `#B8860B` | `NitumeColors.amber` | Pending chip dot; price-change amounts (OA-13). Chip-sized accent only |
| `--nitume-amber-050` | `#FBF3E1` | `NitumeColors.amber050` | Pending chip background only |
| `--nitume-red` | `#C1433C` | `NitumeColors.red` | Danger chip dot; destructive outline/text button label; inline field error text and border; unread dot (OA-13). Chip-sized accent only |
| `--nitume-red-050` | `#FBEAE9` | `NitumeColors.red050` | Danger chip background only |
| `--nitume-scrim` | `rgba(11, 37, 69, 0.5)` | `NitumeDesignChoices.modalScrim` (`0x800B2545`) | Backdrop behind dialogs and the panel (decided, BOARD row 38: blue at 50%) |

No other colour token exists. There is no "neutral" chip tone and no grey (`NitumeDesignChoices` / `StatusTone` has exactly `success | info | pending | danger`).

### 2.3 Type families

| CSS custom property | Value | Flutter |
|---|---|---|
| `--nitume-font-ui` | `'Fira Sans', system-ui, sans-serif` | `NitumeTypography.uiFamily` |
| `--nitume-font-num` | `'Fira Code', ui-monospace, monospace` | `NitumeTypography.numericFamily` |

### 2.4 Type styles

Each style is a SCSS mixin `@include nm-type(<name>)` (§2.7) that sets family, size, weight, colour and letter-spacing. Components never set `font-size`/`font-family` with literals; they include a mixin. Line-height 1.4 for Sans styles and 1.3 for Code styles unless a component says otherwise (web adaptation; Flutter uses the font's default leading).

| Name | Family | Size / weight | Colour | Flutter counterpart | Use |
|---|---|---|---|---|---|
| `h1` | ui | 34 / 700 | blue | `textTheme.displayLarge` | Design-system H1 (desktop page heading, rare) |
| `h2` | ui | 24 / 600 | blue | `headlineLarge` | Design-system H2 |
| `auth-heading` | ui | 22 / 700 | blue | `NitumeTextStyles.authHeading` | Sign-in headings (#6) |
| `top-bar-title` | ui | 21 / 700 | blue | `NitumeTextStyles.topBarTitle` | Root view title |
| `pushed-title` | ui | 18 / 700 | blue | `NitumeTextStyles.pushedTitle` | Pushed view title |
| `dialog-title` | ui | 17 / 600 | blue | `NitumeTextStyles.dialogTitle` (`.t-h3`) | Dialog and panel title |
| `card-title` | ui | 15.5 / 600 | blue | `NitumeTextStyles.cardTitle` | Card title, empty-state title |
| `body-lg` | ui | 15 / 400 | blue | `bodyLarge` (`.t-body`) | Long body copy |
| `field-input` | ui | 14.5 / 400 | blue | `NitumeTextStyles.fieldInput` | Input text |
| `button` | ui | 14.5 / 600 | (per variant) | `NitumeTextStyles.button` | Regular buttons |
| `list-title` | ui | 14.5 / 600 | blue | `NitumeListItem` title (`.li-title`) | Design-system list item |
| `row-title` | ui | 13.5 / 600 | blue | `NitumeTextStyles.rowTitle` | Row titles |
| `body` | ui | 13.5 / 400 | blue | `NitumeTextStyles.body` | Body copy, dialog body (in slate-600) |
| `muted` | ui | 13 / 400 | slate-600 | `NitumeTextStyles.muted` | Empty/error messages, notices |
| `field-label` | ui | 12.5 / 600 | slate-600 | `NitumeTextStyles.fieldLabel` (`.field-label`) | Field labels |
| `error` | ui | 12.5 / 400 | red | theme `errorStyle` | Inline field and dialog errors |
| `button-sm` | ui | 12.5 / 700 | (per variant) | `NitumeTextStyles.buttonSmall` | Small buttons |
| `chip` | ui | 12 / 600 | blue (row 33) | `NitumeTextStyles.chip` | Status chip regular |
| `section-label` | ui | 11.5 / 700, uppercase, letter-spacing 0.05em | slate-600 | `NitumeTextStyles.sectionLabel` | `nm-section-label` |
| `muted-sm` | ui | 11.5 / 400 | slate-600 | `NitumeTextStyles.mutedSmall` | Addresses, notification body |
| `card-label` | ui | 11 / 700, uppercase, letter-spacing 0.04em | slate-600 | `NitumeTextStyles.cardLabel` | Form-card heading |
| `tag` | ui | 10 / 700 | (per tone) | `NitumeTextStyles.tag` | `Default` tag, chip `tag` size |
| `tab-label` | ui | 10 / 700 | (per state) | `NitumeTextStyles.tabLabel` | Tab bar (#6) |
| `num-amount-lg` | num | 30 / 600 | blue | `NitumeTextStyles.amountLarge` | Payment amount, balance |
| `num-amount` | num | 20 / 600 | blue | `NitumeTextStyles.amount` (`.t-num`) | Prices |
| `num` | num | 14 / 500 | blue | `NitumeTypography.numeric()` default | Generic numeric value |
| `num-sm` | num | 13 / 400 | slate-600 | `NitumeTextStyles.numericSmall` (`.t-num-sm`) | Times, ETAs, small counters |
| `num-meta-lg` | num | 12 / 400 | slate-600 | `NitumeTextStyles.metaLarge` (`.li-meta`) | List-item meta, deadlines |
| `num-meta` | num | 11 / 400 | slate-600 | `NitumeTextStyles.meta` | Timeline time, history meta |
| `num-progress` | num | 12.5 / 600 | slate-600 (green-700 when complete) | `NitumeListItem` progress (`.li-progress`) | `3/5` counter |

Rule (design system, customer `_shared.md` §3): Fira Code only for numeric data (prices, timestamps, due dates, ETAs, counters, ratings, references such as `#NT-10482`). A meta line that mixes words and numbers (`Today, 10:03 AM · Brian K.`, `Runner en route · ETA 12 min`) is Fira Code as a whole line (design-system `.li-meta`). Where Flutter splits a line (runner offer meta: Sans with Code only on numbers, `JobOfferCard.richMeta`), the web view spec says so.

### 2.5 Spacing

Flutter counterpart `NitumeSpacing`.

| CSS custom property | Value | Flutter | Use |
|---|---|---|---|
| `--nitume-space-xs` | 4px | `xs` | |
| `--nitume-space-sm` | 8px | `sm` | Menu/ledger row gap |
| `--nitume-space-md` | 16px | `md` | Card padding |
| `--nitume-space-lg` | 24px | `lg` | |
| `--nitume-space-xl` | 32px | `xl` | Empty/error state vertical padding |
| `--nitume-space-screen` | 20px | `screen` | Horizontal content padding below 768px |
| `--nitume-tap` | 48px | `minTapTarget` | Minimum hit area of every interactive control |

Component-internal paddings that are not on this scale (button 12/22, chip 5/11, field 11/14, list item 16/18, step card 13/15, notice 12/14) are copied as literal `px` values inside the component's own SCSS, exactly as the Flutter widget does. They are lengths, not colours, so this is allowed.

### 2.6 Radius

Flutter counterpart `NitumeRadii` + `NitumeDesignChoices`.

| CSS custom property | Value | Flutter | Use |
|---|---|---|---|
| `--nitume-r-s` | 8px | `NitumeRadii.small`, `fieldRadius`, `innerBoxRadius` | Fields, inner boxes, toast |
| `--nitume-r-m` | 14px | `NitumeRadii.medium`, `cardRadius` | Cards, list groups, step cards, notices, map frame |
| `--nitume-r-l` | 20px | `NitumeRadii.large` | Dialog; panel top corners |
| `--nitume-r-pill` | 999px | `NitumeRadii.pill`, `buttonRadius` (Q11) | All buttons, chips, tags |

The checkbox box radius is 6px (design-system `.check`; Flutter `NitumeCheckbox`), a component literal.

### 2.7 Breakpoints and SCSS helpers (web adaptation)

| SCSS variable | Value | Meaning |
|---|---|---|
| `$nm-bp-min` | 360px | Smallest supported width: no horizontal scroll (issue #5 common criteria) |
| `$nm-bp-md` | 768px | Tablet: content column centred, panel becomes constrained (§4.9) |
| `$nm-bp-lg` | 1024px | View specs may switch to two columns |
| `$nm-bp-xl` | 1280px | Wide: shell content max-width `--nitume-content-max` 1180px (same as the marketing `.wrap`) |

Mixins in `_tokens.scss`: `nm-up($bp)` (`@media (min-width: …)`), `nm-type($name)` (§2.4), `nm-hit-area` (pads a visually smaller control to a 48×48 hit area with an absolutely positioned `::before`), `nm-focus-ring` (2px `--nitume-green` outline, offset 2px; offset 1px on fields). Kit components are fluid (width 100% of their container) unless stated; view specs decide columns.

---

## 3. Component index

Every component is standalone, `ChangeDetectionStrategy.OnPush`, signal inputs (`input()` / `input.required()`), selector prefix `nm-` (marketing keeps `app-`). "Flutter" = the counterpart in `packages/nitume_core/lib/src/widgets/` on `main`; all of them exist, so nothing here is new to the component set.

| § | Web component | Flutter counterpart | Design-system pattern |
|---|---|---|---|
| 4.1 | `nm-button` | `NitumeButton` (C-01…C-04) | `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-text` |
| 4.2 | `nm-status-chip`, `nm-tag` + `customerStatus()` / `runnerStatus()` / `customerTimelineTitle()` | `StatusChip` (C-05), `NitumeTag` (R-14), `statusPresentation` (C-06), `runnerStatusPresentation` (R-01), `customerTimelineTitle` (C-19) | `.chip-*`, `.chip-dot` |
| 4.3 | `nm-list-group`, `nm-list-item`, `nm-step-card`, `nm-checkbox` | `NitumeListGroup`, `NitumeListItem`, `ChecklistStepCard` (R-07), `NitumeCheckbox` (C-36) | `.list-demo`, `.list-item`, `.check`, `.li-progress` |
| 4.4 | `nm-card`, `nm-section-label` | `NitumeCard` (C-07), `SectionLabel` (C-08) | `.card-demo` |
| 4.5 | `nm-field` (+ `nm-form-card`) | `NitumeField` (C-17), `NitumeFormCard` | `.field-label`, `.field-input` |
| 4.6 | `nm-timeline` | `StatusTimeline` (C-19) | — (mockup `.timeline`) |
| 4.7 | `nm-empty-state`, `nm-error-state`, `nm-skeleton-card` | `NitumeEmptyState`, `NitumeErrorState`, `SkeletonCard` (C-33) | `.card-demo` |
| 4.8 | `NmDialogService` + `nm-dialog`, `confirm()` | `NitumeDialog`, `showNitumeConfirmDialog` (C-35) | `.card-demo` + `.btn-*` |
| 4.9 | `NmPanelService` + `nm-panel` | `showModalBottomSheet` with `NitumeTheme.bottomSheetTheme` | `.card-demo` |
| 4.10 | `NmToastService` + `nm-toast-host` | `showSnack` + `NitumeTheme.snackBarTheme` | — |
| 4.11 | `nm-notice` | `NitumeNotice` (C-40) | `.card-demo` |
| 5 | `nmNum` directive, formatting pipes, `categoryName` pipe | `NumText`/`NumSpan` (C-32), `formatters.dart`, `ErrandCategory.label` | `.t-num`, `.t-num-sm`, `.li-meta` |
| 6 | `RealtimeService` | `SocketIoRealtimeClient`, `RealtimeEvents`, `RunnerRealtimeClient` | — |
| 7 | `nm-live-map` (`LiveMapComponent`) + `MapsLoaderService` | `LiveTrackingMap`, `GoogleTrackingMap`, `EtaChip`, `JobRouteMap` (C-31, R-16) | — |

`nm-section-label`, `nm-checkbox` and `nm-notice` are not named in issue #5 but are parts of the listed components (the checklist item needs the checkbox; the realtime `Reconnecting…` state needs the notice) and every later issue uses them, so they are built here to avoid per-screen copies.

Components the kit does **not** build (they belong to the view issues and must reuse this kit): top bar, pushed header, tab bar / app nav (#6), OTP field and resend line (#6), category tile (#7), receipt card (#8), evidence grid/viewer (#10), star rating (#10), notification row and bell (#11), menu row (#12), capture drop zone (#13), offer card, availability card, decline dialog (#14), navigation chip (#15), balance card, stat tiles, weekly chart, ledger row (#17). Each of those has a Flutter counterpart and its own web spec.

---

## 4. Components

### 4.1 `nm-button` (C-01…C-04)

Inputs: `variant: 'primary' | 'secondary' | 'outline' | 'text' | 'link'` (default `primary`), `size: 'regular' | 'small'`, `destructive: boolean` (outline and text only), `loading: boolean`, `disabled: boolean`, `expand: boolean` (full width), `type: 'button' | 'submit'` (default `button`), `href` (renders `<a>` with the same look for navigation), optional leading icon slot (`<ng-content select="[nmButtonIcon]">`, 18px, 16px small). Label is projected content; numeric parts inside it use `nmNum` (Flutter `richLabel` + `NumSpan`).

| Variant | Fill | Label | Border | Hover / pressed (web: hover = Flutter pressed/hovered) | Flutter |
|---|---|---|---|---|---|
| primary | green | white | none | fill green-700 | `NitumeButton.primary`, `NitumeTheme.primaryButtonStyle` |
| secondary | blue | white | none | fill blue-700 | `.secondary` |
| outline | white | blue (red when `destructive`) | 1px slate-line | border blue; pressed overlay slate | `.outline` |
| text | none | blue (red when `destructive`) | none | overlay slate | `.text` (padding 12/6) |
| link | none | green-700 | none | overlay slate | `.link` |

- **Destructive** (issue #5 "destructive" variant): the outline or text variant with the red label (OA-13, `NitumeDesignChoices.destructiveText`). There is **no red-filled button**: fills never carry red ("amber and red never appear as backgrounds larger than a chip"). A destructive `primary`/`secondary` is a developer error: the component ignores `destructive` on fills and logs a dev-mode warning.
- Regular: padding 12px 22px, `button` type style, radius pill, min-height 48px, min-width 64px. Small: padding 9px 16px, `button-sm` type style, visual height ~36px, hit area padded to 48 (`nm-hit-area`). Link small: padding 12px 4px, 48×48 minimum.
- Disabled: filled variants slate-line fill + slate-400 label; outline/text/link slate-400 label, border unchanged; `cursor: not-allowed`; `disabled` attribute on `<button>`, `aria-disabled="true"` + no navigation on `<a>`.
- Loading: label replaced by a 2px-stroke spinner (18px, 14px small) in white on fills, blue (red when destructive) otherwise; the button keeps its width (render the label `visibility:hidden` under the spinner), `aria-busy="true"`, accessible name stays the label; clicks ignored.
- Focus: `nm-focus-ring`. No box-shadow, no transition on colour longer than 150ms.
- Rule (design system): white text on every blue or green fill; green only for primary actions.

### 4.2 Status chip and tag

#### 4.2.1 `nm-status-chip` (C-05)

Inputs: `label: string` (required), `tone: 'success' | 'info' | 'pending' | 'danger'` (required), `size: 'regular' | 'compact' | 'tag'` (default `regular`), `showDot: boolean | undefined` (default: true for regular, false otherwise), `numericSuffix: string | undefined` (rendered after ` · ` in Fira Code, e.g. `Check It For Me · #10482`).

Convenience inputs (mutually exclusive with label/tone): `customerStatus: ErrandStatus` (uses §4.2.3) and `runnerStatus: ErrandStatus` + `offerAccepted: boolean` (uses §4.2.4; renders **nothing** when the map returns `null`).

| Tone | Background | Dot (6px circle, gap 6) | Label text (row 33, decided: high contrast) | Flutter `StatusToneColors.of` |
|---|---|---|---|---|
| success | green-050 | green-700 | **blue** | `(green050, green700)`, `label` → blue |
| info | blue-050 | blue | blue | `(blue050, blue)` |
| pending | amber-050 | amber | **blue** | `(amber050, amber)`, `label` → blue |
| danger | red-050 | red | **blue** | `(red050, red)`, `label` → blue |

Row 33 (decided): the design-system chip pairs measure below WCAG AA for 12px text, so success/pending/danger labels are blue on the tint and only the dot keeps the tone colour (`NitumeDesignChoices.chipHighContrastText = true`). The design-system demo (`.chip-success` green-700 text) is superseded by this owner decision.

| Size | Type | Padding | Dot | Flutter `StatusChipSize` |
|---|---|---|---|---|
| regular | 12 / 600 | 5px 11px | yes | `regular` |
| compact | 11 / 700 | 4px 9px | no | `compact` (active-card tag) |
| tag | 10 / 700 | 3px 8px | no | `tag` (`Default` address tag) |

Pill radius, single line, `white-space: nowrap`, ellipsis when constrained. Accessibility: the chip is a `<span>` whose accessible text is `label` (+ ` ` + `numericSuffix`); the dot is `aria-hidden`. The chip is never interactive.

#### 4.2.2 `nm-tag` (R-14)

Display-only label in chip-info colours: blue text on blue-050, pill, **no dot**, 11/600, padding 6px 11px. For category names on offers and skills/service areas on the runner profile. Never green (a category is not an action, toggle or complete state). Not interactive; selection uses the choice chip in the view issues. Flutter `NitumeTag`.

#### 4.2.3 Customer label map (C-06, `statusPresentation`, OA-20 authoritative, rows 35, 176, 182)

Export `customerStatus(status: ErrandStatus): { label: string; tone: Tone }` from `apps/website/src/app/shared/status/status-presentation.ts`. Every §3.3 state, exactly as the Flutter function:

| §3.3 state | Customer label | Tone | Note |
|---|---|---|---|
| DRAFT | `Draft` | info | Never listed in practice (customer `_shared.md` §6) |
| REQUESTED | `Awaiting quote` | pending | |
| QUOTED | `Quote ready` | pending | |
| ACCEPTED | `Awaiting payment` | pending | |
| PAYMENT_CONFIRMED | `Finding a runner` | info | |
| RUNNER_ASSIGNED | `Finding a runner` | info | Row 176: an offer is not an acceptance |
| RUNNER_EN_ROUTE | `En route` | **pending** (amber, OA-13/Q13 `enRouteTone`) | Row 182 |
| ARRIVED | `Arrived` | info | |
| IN_PROGRESS | `In progress` | info | |
| AWAITING_CUSTOMER | `Needs your review` | pending | |
| COMPLETED | `Completed` | success | |
| CONFIRMED | `Completed` | success | System-only, never shown by name (row 35) |
| SETTLED | `Completed` | success | System-only (row 35) |
| CANCELLED | `Cancelled` | **danger** (red, OA-13 `cancelledTone`) | |
| FAILED | `Failed` | danger | |
| EXPIRED | `Expired` | info (`expiredTone`) | Same for every expiry path (rows 167, 185, 187, 201) |
| DISPUTED | `Disputed` | danger | |

Also export `customerTimelineTitle(status): string | null` (C-19, customer `_shared.md` §6.1): `null` for RUNNER_ASSIGNED (the offer step is hidden), `Runner assigned` for RUNNER_EN_ROUTE (the acceptance step), otherwise the label above.

#### 4.2.4 Runner label map (R-01, `runnerStatusPresentation`, runner `_shared.md` §6)

Export `runnerStatus(status: ErrandStatus, opts?: { offerAccepted?: boolean }): { label; tone } | null` (`offerAccepted` defaults to `true`, as in Flutter). Every §3.3 state:

| §3.3 state | Runner label | Tone | Differs from customer? |
|---|---|---|---|
| DRAFT | — (`null`, render nothing) | — | yes: never reaches the runner |
| REQUESTED | — (`null`) | — | yes |
| QUOTED | — (`null`) | — | yes |
| ACCEPTED | — (`null`) | — | yes |
| PAYMENT_CONFIRMED | `New offer` | info | yes (see note) |
| RUNNER_ASSIGNED, `offerAccepted: false` | `New offer` | info | yes (row 113 offer model) |
| RUNNER_ASSIGNED, `offerAccepted: true` | `Accepted` | info | yes |
| RUNNER_EN_ROUTE | `On the way` | pending (amber, same tone as `En route`) | yes |
| ARRIVED | `Arrived` | info | no |
| IN_PROGRESS | `In progress` | info | no |
| AWAITING_CUSTOMER | `Waiting for the customer` | pending | yes |
| COMPLETED | `Completed` | success | no |
| CONFIRMED | `Completed` | success | no |
| SETTLED | `Paid` | success | yes |
| CANCELLED | `Cancelled` | danger | no |
| FAILED | `Failed` | danger | no |
| EXPIRED | `Expired` | info | no |
| DISPUTED | `Disputed` | danger | no |

Note: runner `_shared.md` §6 lists no PAYMENT_CONFIRMED row ("states before RUNNER_ASSIGNED never reach the runner"); the built Flutter map returns `New offer` for it. The web mirrors the built code (parity); the API never sends a PAYMENT_CONFIRMED errand to a runner, so the row is defensive only. Admin labels (`Assigned`, `Paid`, `Confirmed`, `Settled`) are never used on the website.

#### 4.2.5 State type

`ErrandStatus` is a TypeScript string-literal union of the 17 wire values (`'DRAFT' | … | 'DISPUTED'`), in §3.3 order, exported with `ERRAND_STATUSES: readonly ErrandStatus[]` for exhaustive tests. Both maps use a `switch` with an exhaustiveness check (`const _: never = status`) so a new state fails to compile instead of rendering an invented label. An unknown wire string from the API is never coerced to a label: the parser returns `null` and the caller shows no chip.

### 4.3 Checklist list item and checkbox

#### 4.3.1 `nm-checkbox` (C-36)

Design-system `.check`: 22px box, radius 6px, 2px slate-line border, white fill; checked = green fill and green border with a white 12px check (inline SVG `M20 6 9 17l-5-5`, stroke `currentColor`, colour white via `--nitume-white`). Hit area 48×48. Inputs: `checked`, `disabled` (no change in look, Flutter `onChanged: null`), optional `label` (then a row: box + 13.5 blue label, the whole row clickable). Native `<input type="checkbox">` visually hidden under the box so keyboard and screen readers work; Space toggles.

#### 4.3.2 `nm-list-group` + `nm-list-item` (design-system list item; Flutter `NitumeListGroup`, `NitumeListItem`)

- Group: white, 1px slate-line border, radius r-m, `overflow:hidden`, 1px slate-line hairline between items, none after the last. Rendered as `<ul role="list">`.
- Item: padding 16px 18px, gap 14px, `display:flex; align-items:center`.
  - Leading `nm-checkbox` (22px).
  - Body (`flex:1; min-width:0`): title `list-title` (14.5/600 blue); when `done`: slate-600 with `text-decoration: line-through` in slate-line colour. Optional meta under it, margin-top 2px, `num-meta-lg` (Fira Code 12 slate-600; a whole meta line is Code).
  - Trailing optional progress counter `num-progress` (Fira Code 12.5/600 slate-600; **green-700 when complete**, i.e. `done === total`), e.g. `3/5`, from `formatCounter`.
- Inputs: `title` (required), `meta`, `progress` (`{ done: number; total: number }` or a preformatted string), `done`, `clickable` (whole row is a button → output `activated`), `checkable` (checkbox emits `checkedChange`). Accessible name: `title, meta, 3 of 5, completed`.

#### 4.3.3 `nm-step-card` (R-07, `ChecklistStepCard`)

Runner checklist step on the active job: white card, radius r-m (Flutter uses `cardRadius` 14), 1px slate-line, padding 13px 15px, gap 12px. Leading display-only `nm-checkbox` (done = green check, a complete state). Title 13/600 Sans; optional subtitle Fira Code 11 slate-600 (`10:28 AM · GPS confirmed`, `3 photos uploaded`, `Required`). Optional trailing small **secondary** `nm-button` (`Upload`, `Add`, `Edit`); when present the whole card is clickable and runs the same action. Accessible name: `Photos, Required, button Upload` or `…, completed`.

### 4.4 `nm-card` (C-07) and `nm-section-label` (C-08)

- Card: white, 1px slate-line border, radius r-m, padding 16px (input `padding` overrides for view-specific values). `border: 'solid' | 'dashed'` (dashed: receipt variant 1px; capture drop-zone variant 2px via `dashedWidth`). `clickable` → rendered as a `<button>`/`<a>` wrapper with focus ring and an accessible label input. No shadow. Hover on clickable cards: border blue (same rule as `.btn-outline`, web adaptation).
- Section label: `section-label` type style, uppercase via CSS `text-transform` (the DOM keeps sentence case for screen readers), padding `6px 20px 10px` (horizontal 0 when inside a padded column, input `inset`). Rendered as a heading element of the level the view passes (default `h2`).

### 4.5 `nm-field` (C-17) and `nm-form-card`

Design-system `.field-label` + `.field-input` with owner Q12/OA-12 (white fill, r-s 8, 2px green focus).

- Layout: column, gap 6px. Label `field-label` (12.5/600 slate-600) as a real `<label for>`.
- Input: white fill, 1px slate-line border, radius r-s, padding 11px 14px, `field-input` type style, placeholder slate-400. Focus: border green + 2px green outline offset 1px (design system). Error: 1px red border (2px red outline when focused), message under the field in `error` style (12.5/400 red), `aria-invalid="true"`, `aria-describedby` → message id, message element `role="alert"`. Disabled/read-only: unchanged look, `disabled`/`readonly` attribute.
- Variants (input `kind`):
  - `text` (default).
  - `multiline`: `<textarea>`, 3 rows minimum, grows to 6 then scrolls (Flutter `minLines 3, maxLines 6`).
  - `money`: Fira Code input text, a persistent `KSh ` prefix (Fira Code, slate-600, visible even when empty and unfocused, Flutter `persistentPrefix`), digits only (`inputmode="numeric"`, non-digits stripped on input), whole shillings.
  - `phone`: Fira Code input text, `type="tel"`, `inputmode="tel"`, `autocomplete="tel"`.
- Optional `maxLength` with a Fira Code `n/max` counter under the field right-aligned (slate-600, `num-meta-lg`), shown only when the view spec asks for it.
- Integrates with Angular forms via `ControlValueAccessor`, so views use `formControlName`/`[formField]` on `nm-field`.
- `nm-form-card`: `nm-card` with a `card-label` heading (11/700 uppercase slate-600) above one control (Flutter `NitumeFormCard`).

### 4.6 `nm-timeline` (C-19)

Vertical status timeline. Input `steps: { title: string; time?: string; done: boolean }[]`.

- `<ol>`; each step a row: left column 22px wide with a 9px dot 2px from the top (done = **green**, pending = **slate-400**) and, except on the last step, a 1px slate-line connector from under the dot to the next step (4px from the left edge, 1px gap under the dot); right column title 12.5/400 blue Sans, optional time under it `num-meta` (Fira Code 11 slate-600: `10:03 AM`, `Expected 10:28 AM`, `Pending`). Gap between steps 18px.
- Each `<li>` has `aria-label` = `title, time, done|pending` (Flutter semantics), inner text `aria-hidden`.
- Customer step titles come from `customerTimelineTitle()` (RUNNER_ASSIGNED rows are dropped). Times formatted with §5 pipes.

### 4.7 Empty, error and loading states (C-33)

- `nm-empty-state`: inputs `title?`, `message` (required), `actionLabel?` → output `action`. Centred column, padding 32px 20px. Title `card-title` (heading element, level from input, default `h2`), 6px gap, message `muted` centred; optional primary `nm-button` 16px below. Examples (from the specs): `No tasks yet.` + `Start a new task`; runner `No offers right now`.
- `nm-error-state`: inputs `message` (required), `retryLabel` (default `Try again`) → output `retry`. Centred column, padding 32px 20px, message `muted` in a `role="alert"` live region, outline `nm-button` 16px below. Default copy (customer `_shared.md` §7, Flutter `friendlyError`): network failure `Check your connection and try again.`; any other failure `Something went wrong. Please try again.`. Export `friendlyError(error: unknown): string` (HTTP status 0 / `TypeError` from fetch = network) from the same folder.
- `nm-skeleton-card`: input `height` (default 72px). White, 1px slate-line, radius r-m, padding 14px 15px, two slate bars (radius 4px) at widths 60% and 35%, heights 12px and 10px. `role="status"` `aria-label="Loading"`. Static (no shimmer animation; Flutter is static). Views stack 2–3 of them.

### 4.8 Dialog (C-35)

`NmDialogService.open(component | template, config)` and `NmDialogService.confirm({ title, body?, confirmLabel, cancelLabel, destructive?, dismissible? }): Promise<boolean>`. Views never build their own overlay.

- Scrim: `--nitume-scrim` (blue at 50%, row 38), full viewport, fixed.
- Card: white, radius r-l (20px), padding 20px, **max-width 335px**, width `calc(100% - 40px)`, centred. No shadow.
- Content top to bottom: title `dialog-title` (17/600, `<h2>` with the dialog's `aria-labelledby`), 8px gap, body `body` in slate-600 (`aria-describedby`), optional projected content (4px above), 16px gap, **full-width vertical stack of actions** with 10px gaps, optional `error` line (12.5 red, `role="alert"`) 10px below.
- `confirm()` button order (Flutter `showNitumeConfirmDialog`): confirm label first as **outline** (red label when `destructive`), cancel label second as **primary**. Resolves `true` only on confirm; scrim click, Escape or cancel resolve `false`.
- `dismissible: false` (blocking; e.g. customer price-change authorization `v-price-auth`, OA-8): scrim click and Escape do nothing.
- Accessibility: `role="dialog"` (`alertdialog` for `confirm`), `aria-modal="true"`, focus moves to the title (Flutter `autofocusTitle`) or first action, focus trapped, returned to the opener on close; page behind is `inert`; body scroll locked.
- Width at desktop stays 335px (parity; web adaptation would be a new size, see §13 WQ-3).

### 4.9 Bottom-sheet-style panel

`NmPanelService.open(component | template, { title?, dismissible? })`. Flutter: `showModalBottomSheet` with `bottomSheetTheme` (white, top radius r-l 20, no elevation) and `showDragHandle` (used by the customer deadline sheet and the runner capture-source picker).

- Below 768px: docked to the bottom edge, full width, top corners r-l (20px), white, max-height 90vh with internal scroll, padding `16px 20px 10px` plus `env(safe-area-inset-bottom)`. A 32×4px slate-line drag handle centred 8px from the top (`aria-hidden`; swipe-down to close is optional, Escape and scrim always work when dismissible).
- From 768px (web adaptation): the same panel, bottom-anchored and horizontally centred, `max-width: 560px`, top corners r-l. (Alternative in §13 WQ-3.)
- Scrim `--nitume-scrim`. Optional title `dialog-title`. Same focus, `inert`, Escape and scroll-lock rules as §4.8.
- Content is projected (e.g. a list of menu rows, a radio group, a form). The panel never hosts a primary flow that the mobile app shows as a pushed screen.

### 4.10 Toast (snackbar)

`NmToastService.show(message: string)`; `nm-toast-host` is placed once in the signed-in shell (#6). Flutter `showSnack` + `snackBarTheme`.

- Fill **blue-700**, text **white** `body` (13.5/400), radius r-s (Flutter's floating snackbar shape; nearest design-system radius), padding 14px 16px, max-width 560px, width `calc(100% - 40px)`.
- Position: bottom-centre, 16px above the bottom edge plus `env(safe-area-inset-bottom)`; views with a fixed bottom CTA pass an offset so the toast sits above it.
- One at a time: a new message replaces the visible one (Flutter `hideCurrentSnackBar`). Auto-dismiss after 4s (Flutter default); hovering or focusing pauses the timer (web adaptation). No action button (none in the specs).
- `role="status"`, `aria-live="polite"`. Numeric parts inside the message are wrapped by the caller with `nmNum` (template variant `show(template)`).
- Copy comes from the view specs (`Copied`, `Please sign in again.`, `That offer is no longer available.`).

### 4.11 `nm-notice` (C-40)

Inline notice: white, 1px slate-line border, radius r-m, padding 12px 14px, text `muted` at 13px, optional leading 18px info icon in slate-600 (10px right gap), optional trailing small outline `nm-button` slot. `tone: 'info' | 'danger'`: danger swaps the icon for a red error icon (always shown); card, border and text stay the same (red stays a small accent). No coloured fill. Used for `Reconnecting…` (§6.6), offline and hold notices.

---

## 5. Numeric data and formatting

### 5.1 `nmNum` directive (C-32 `NumText` / `NumSpan`)

`<span nmNum>` / `[nmNum]="'meta'"` applies `--nitume-font-num` and, when a value is given, one of the numeric type styles (`amount-lg`, `amount`, `num` (default), `sm`, `meta-lg`, `meta`, `progress`). Without a value it only switches the family and inherits size, weight and colour (Flutter `NumSpan` inside rich text). Optional `nmNumLabel` sets `aria-label` (e.g. the spoken amount, §5.3). Every value in §5.2 is rendered through `nmNum`; a Fira Code value set by any other means (inline `font-family`, the marketing `.num` class) is an audit FAIL inside `/app`.

### 5.2 Pure formatting functions and pipes

Implemented as pure TypeScript functions in `apps/website/src/app/shared/format/formatters.ts` (unit-tested directly), each wrapped by a standalone pure pipe of the same name. They port `packages/nitume_core/lib/src/utils/formatters.dart` and `app_support/display.dart` **exactly**, including the edge cases below. Money is handled on the decimal string, never through floating point (Flutter `_DecimalParts`).

| Function / pipe | Output (examples are required test vectors) | Flutter |
|---|---|---|
| `formatKes(amount, { signed? })` | `2200` → `KSh 2,200`; `"2200.00"` → `KSh 2,200`; `"2200.5"` → `KSh 2,200.50`; `"1234567.89"` → `KSh 1,234,567.89`; `"-500"` → `- KSh 500`; `5000` signed → `+ KSh 5,000`; `0` signed → `KSh 0`; `"-0.00"` → `KSh 0`; `"1.239"` → `KSh 1.23` (string fraction truncated); `1.239` (number) → `KSh 1.24` (numbers go through `toFixed(2)`); `"1,200"` → `KSh 1,200` (commas stripped); `"abc"` → throws | `formatKes` |
| `formatKesOrDash(amount?)` | `null`/`undefined` → `—` | `formatKesOrDash`, `kMissingValue` |
| `formatAmount(amount)` | `"40000"` → `40,000`; `-40000` → `-40,000` | `formatAmount` |
| `formatKesLedger(amount)` | `1750` → `+ KSh 1,750`; `"-6000"` → `− KSh 6,000` (U+2212); `0` → `KSh 0` | `formatKesLedger` |
| `kesSpoken(amount)` | `1750` → `1,750 shillings`; `-6000` → `minus 6,000 shillings` | `kesSemanticsLabel` |
| `formatClock(date)` (browser local) | `10:03 AM`; 00:05 → `12:05 AM`; 12:00 → `12:00 PM` | `formatClock` |
| `formatDayTime(date, now?)` (local) | same day `Today, 10:03 AM`; previous day `Yesterday, 4:12 PM`; 2–6 days back `Mon, 10:03 AM`; older this year `12 Feb, 10:03 AM`; other year `12 Feb 2025, 10:03 AM` | `formatDayTime` |
| `formatRelativeShort(date, now?)` (local) | < 1 min → `1m`; `59m`; same day ≥ 60 min → `1h`; previous day `Yesterday`; 2–6 days `Mon`; older `12 Feb` (`12 Feb 2025` other year) | `formatRelativeShort` |
| `formatShortDate(date, now?)` | `12 Feb`, `12 Feb 2025` | `formatShortDate` |
| `formatMonthYear(date)` | `Feb 2026` | `formatMonthYear` |
| `formatEta(seconds)` | `720` → `ETA 12 min`; `61` → `ETA 2 min` (ceil); `0` or negative → `ETA 1 min` | `formatEta` |
| `formatCountdown(seconds)` | `42` → `0:42`; `60` → `1:00`; negative → `0:00` | `formatCountdown` |
| `formatCounter(done, total)` | `3/5` | `formatCounter` |
| `formatRating(value)` | `"4.90"` → `4.9`; `5` → `5.0` | `formatRating` |
| `formatClockEat(date)` | always Africa/Nairobi (UTC+3, no DST), whatever the browser zone: `2026-10-28T07:28:00Z` → `10:28 AM`; `2026-10-28T21:30:00Z` → `12:30 AM` | `formatClockEat` |
| `formatDayTimeEat(date, now?)` | as `formatDayTime` on EAT calendar days | `formatDayTimeEat` |
| `formatDeadlineEat(date, now?)` | `Today, 11:59 PM`, `Tomorrow, 11:59 PM`, `Yesterday, 4:12 PM`, else `24 Oct, 11:59 PM` / `3 Jan 2027, 11:59 PM` (EAT days) | `formatDeadlineEat` |
| `formatRelativeShortEat(date, now?)` | as `formatRelativeShort` on EAT days | `formatRelativeShortEat` |
| `eatDayKey(date)` | `2026-10-28T21:30:00Z` → `2026-10-29` | `eatDayKey` |
| `eatWeekday(date)`, `eatWeekStart(date)` | Monday = 1 … Sunday = 7; week start Monday 00:00 EAT = Sunday 21:00 UTC | `eatWeekday`, `eatWeekStart` |
| `formatDistanceKm(km)` | `0.85` → `850 m`; `0.994` → `990 m`; `0.996` → `1.0 km`; `1.2` → `1.2 km`; negative → `0 m` | `formatDistanceKm` |
| `formatDurationMin(seconds)` | `360` → `6 min`; `2700` → `45 min`; `4200` → `1 h 10 min`; `7200` → `2 h`; `0` → `1 min` | `formatDurationMin` |
| `formatPhoneIntl(phone)` | `0712345678` / `+254712345678` / `254712345678` → `+254 712 345 678`; unparseable → input unchanged | `formatPhoneIntl` (+ `KenyanPhone.normalize`) |

EAT functions must not depend on the browser time zone: compute on `Date.getTime() + 3 h` and read the `getUTC*` fields (Flutter `toEatWallClock`). Never send an EAT wall-clock value to the API.

Which clock each surface uses (parity with the apps):
- **Customer** views: browser local time (`formatClock`, `formatDayTime`, `formatRelativeShort`) for activity, history and notifications; **EAT** for deadlines (`formatDayTimeEat`, as `deadline_widgets.dart`). See §13 WQ-2.
- **Runner** views: EAT everywhere (R-18, RQ-10).

Copy rules (both `_shared.md` §7): `KSh` in every amount a user reads, never `KES` (row 82); `—` for a missing value; task reference `#` + `reference` exactly as returned (`#NT-10482`), Fira Code, hidden when null.

### 5.3 Accessibility of numbers

Amounts rendered with `nmNum` get `nmNumLabel` = `kesSpoken(amount)` where the visual string would be read badly (signed ledger amounts, U+2212). Times and counters are read as written.

### 5.4 `categoryName` pipe

`ErrandCategory` wire value → display name, in this order (AGENTS.md, OA-1, row 1): `buy_for_me` → `Buy For Me`; `pickup_delivery` → `Get It For Me`; `inspection` → `Check It For Me`; `representation` → `Go There For Me`; `queue_admin` → `Wait For Me`; `business` → `Business Tasks`. Export `CUSTOMER_MVP_CATEGORIES` (the first five; Business Tasks is never offered to customers, OA-18). An unknown value renders nothing. Wire values never appear in UI copy.

---

## 6. `RealtimeService`

Port of `SocketIoRealtimeClient` (implements `RealtimeClient` + `RunnerRealtimeClient`) in `packages/nitume_core/lib/src/realtime/`. Server: `apps/api/src/realtime/realtime.gateway.ts` + `realtime.events.ts`. File: `apps/website/src/app/core/realtime/realtime.service.ts` (+ `realtime.events.ts` with every name and payload type; views never type an event name).

### 6.1 Connection and auth handshake

- Library: `socket.io-client` v4 (server: `@nestjs/platform-socket.io` 12 on Socket.IO 4). New dependency in `apps/website/package.json`.
- URL: the API **origin** = `environment.apiBaseUrl` (e.g. `http://localhost:3000`; the gateway is not under `/api/v1`; Flutter `originFor`). Default namespace.
- Options: `path: '/socket.io'`, `transports: ['websocket']`, `auth: { token: <access JWT> }`, `reconnection: false` (the service owns reconnection, below), `autoConnect: true`.
- Server side (as built): the gateway reads `handshake.auth.token` (a leading `Bearer ` is stripped) or the `Authorization: Bearer` header, verifies it as an **access** JWT (`type: 'access'`, secret `jwt.accessSecret`), loads the user and requires `status = active`. On failure it calls `client.disconnect(true)` (the client sees `disconnect` with reason `io server disconnect`). On success: admins join `admins`; **runners are joined by the server to `runner:{runnerProfileId}:status`** from the JWT (row 139; the client never joins it). CORS `origin: true, credentials: true` (any origin allowed).
- The access token comes from `REALTIME_TOKEN_PROVIDER: InjectionToken<() => Promise<string | null>>`, provided by issue #6's auth layer. It must return a **fresh** access token (refreshing through `POST /api/v1/auth/web/refresh` when needed; amended 2026-10-28 for PR #20, see `auth-foundation.md` §4.3) or `null` when signed out.

### 6.2 Lifecycle and reconnect (same rules as Flutter)

- `connect()`: called once by the signed-in shell after sign-in. Sets state `connecting`, opens a socket with the provider's token.
- `disconnect()`: called on log out. Stops retrying, forgets joined rooms, closes the socket, state `disconnected`.
- On `connect`: state `connected`, attempt counter reset, **re-join every errand room joined through `joinErrand`** (rooms whose re-join ack is not `ok` are forgotten).
- On `disconnect` (any reason, including a server kick) or `connect_error` while connection is wanted: close that socket, state `reconnecting`, schedule one retry after the backoff, ask the provider for a fresh token, then open a new socket. If the provider returns `null`/empty: stop, state `disconnected` (signed out meanwhile). Exception added by issue #6 (PR #25, `auth-foundation.md` §5 item 8): a `connect_error` whose `message` or `data.code` is `account_suspended` is final: no retry, state `disconnected`, rooms cleared, and the injected `REALTIME_ACCOUNT_SUSPENDED` handler (default no-op) is called once.
- Backoff (Flutter `defaultBackoff`): attempt n (from 1) waits `min(30000, 1000 × 2^(n−1))` ms × a jitter factor in [0.8, 1.2]: 1 s, 2 s, 4 s, 8 s, 16 s, 30 s, 30 s … Injectable (`REALTIME_BACKOFF`) for tests.
- Web adaptation: on the window `online` event while `reconnecting`, cancel the timer and retry at once (attempt counter unchanged). Nothing else listens to visibility; the socket stays open in background tabs.
- Events from a socket that is no longer the current one are ignored (Flutter `identical(_transport, t)`).
- Malformed payloads are dropped silently (never thrown, never emitted). An unknown `status` wire value drops the event.
- Inject the factory (`SOCKET_IO_FACTORY: InjectionToken<(url, opts) => Socket>`, default `io`) so tests use a fake socket.

### 6.3 Public API

```ts
type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

readonly state: Signal<RealtimeConnectionState>;
connect(): Promise<void>;
disconnect(): void;
joinErrand(errandId: string): Promise<boolean>;   // emits errand:join, resolves ack.ok; false (room kept for re-join) while not connected
leaveErrand(errandId: string): void;              // forgets the room; emits errand:leave when connected
showReconnecting(delayMs: number): Signal<boolean>; // true once the service has been trying (connecting or reconnecting) for delayMs without reaching connected; false on connected and on disconnected (not started, signed out, stub provider). Runner 5000. Flutter jobs_tab `_syncReconnecting`. Listener removed when the caller is destroyed

// server → client streams (RxJS Observable, hot, no replay)
locationUpdates$, statusChanges$, evidenceUploads$, priceChangeRequests$, quoteReissues$,
merchantDetailsUpdates$, merchantDetailsChanges$, quoteRequests$, accessRevocations$,
jobOffers$, jobOfferWithdrawals$, priceChangeDecisions$, priceDifferencePayments$;

sendLocationPing(ping: LocationPing): Promise<LocationPingAck>; // { ok:false, sent:false } when not connected or no ack in 10 s
```

Ack timeout 10 s for `joinErrand` and `sendLocationPing` (Flutter `ackTimeout`). On `errand:access_revoked` the errand is removed from the re-join set before the event is emitted. `joinErrand` does not validate the id client-side: it sends it and the server answers `invalid_errand_id` (parity with Flutter).

### 6.4 Event contract (exactly the events `nitume_core` uses; all exist in `apps/api`)

Client → server:

| Event | Payload | Ack | Who | Source |
|---|---|---|---|---|
| `errand:join` | `{ errandId }` | `{ ok: true, room }` or `{ ok: false, error: 'unauthenticated' \| 'invalid_errand_id' \| 'forbidden' }` | customer, runner (must be allowed to view the errand) | row 23 |
| `errand:leave` | `{ errandId }` | `{ ok, room }` (ignored) | both | row 23 |
| `location:ping` | `{ lat, lng, errandId?, accuracy?, ts? }` | `LocationPingAck { ok, error?, status? }`; errors `unauthenticated`, `not_runner`, `invalid_payload`, `rate_limited`, `stale_ping`, `runner_offline`, `forbidden`, `not_live`, `unavailable` (unknown → `unknown`). `forbidden`/`not_live` mean stop job pings | runner | §4.2, RA-4 |

Server → client:

| Event | Payload | Room | Customer | Runner | Source |
|---|---|---|---|---|---|
| `location:update` | `{ errandId, lat, lng, eta: seconds \| null, accuracy?, ts }` | `errand:{id}` (+ `admins`) | yes | — | §4.2 |
| `errand:status_changed` | `{ errandId, status, from \| null, at }` | `errand:{id}` | yes | yes | row 23 |
| `evidence:uploaded` | `{ errandId, evidenceId, type, capturedAt }` | `errand:{id}` | yes | yes | row 23 |
| `price_change:requested` | `{ errandId, requestId, fromPrice, toPrice, reason, createdAt }` (prices decimal strings) | `errand:{id}` | yes | — | row 23 |
| `quote:reissued` | `{ errandId, quoteId, total, currency, expiresAt, status, acceptanceRequired }` | `errand:{id}` | yes | — | row 72 |
| `merchant_details:updated` | `{ errandId, merchantName, tillNumber, paybillNumber, accountReference }` | `errand:{id}` | yes | — | row 43 |
| `merchant_details:changed` | same + `merchantDetailsUpdatedAt` | `errand:{id}` | yes | — | row 80 |
| `quote:requested` | `{ errandId, reference, quoteId, status, quoteRequestedAt }` | `admins` + `errand:{id}` | yes | — | row 68 |
| `errand:access_revoked` | `{ errandId }` | that socket | yes | yes | API |
| `job:offered` | `{ errandId, assignmentId, offerExpiresAt \| null, offeredAt }` | `runner:{id}:status` | — | yes | RA-5 |
| `job:offer_withdrawn` | `{ errandId, assignmentId, reason: 'expired' \| 'declined' \| 'cancelled', at }` (reason never shown as copy) | `runner:{id}:status` | — | yes | RA-5 |
| `price_change:decided` | `{ errandId, requestId, status: 'approved' \| 'rejected', outcome: 'approved' \| 'rejected' \| 'cancelled', fromPrice, toPrice, decidedAt }` | runner room + `errand:{id}` | (ignored) | yes | RA-5, A8 |
| `price_change:difference_paid` | `{ errandId, requestId, amount, paidAt }` | runner room + `errand:{id}` | (ignored) | yes | row 248 |

Rooms: `errand:{errandId}` (joined by the client), `runner:{runnerProfileId}:status` (joined by the server), `admins` (not used by the website). No other event name may be used. Type the payloads in `realtime.events.ts` from `apps/api/src/realtime/realtime.events.ts` and the Flutter `fromJson` factories (dates as ISO strings parsed to `Date`, prices kept as strings).

### 6.5 Data rules the service enforces or exposes

- Runner location is shown to the customer only during RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS for the current assignment (rows 27, 65, 183). The service just forwards; `nm-live-map` drops the marker when the view passes `null` (§7). The service never stores location history.
- REST snapshot first, socket for changes. Polling is a fallback only while `state` is not `connected` (intervals per view spec: customer track per `v-track.md`, runner offers 20 s, active job 15 s). On every transition to `connected` views refetch their snapshot once.

### 6.6 `Reconnecting…` state

- Customer `v-track`: a 12px slate-600 line `Reconnecting…` under the map while not connected (view spec).
- Runner: `nm-notice` `Reconnecting…` after 5 s of trying to connect (`connecting` or `reconnecting`, `showReconnecting(5000)`), under the availability card on `v-jobs`. A deliberate `disconnected` (before `connect()`, after log out) never shows it (Flutter `jobs_tab.dart` `_syncReconnecting`).
- The ellipsis is the single character `…` (U+2026).

---

## 7. `LiveMapComponent` (`nm-live-map`)

Port of `LiveTrackingMap` + `GoogleTrackingMap` (C-31) and the runner composition `JobRouteMap` (R-16). Library `@angular/google-maps` (System Design §5, §7.1). New dependency.

### 7.1 Inputs and outputs

| Input | Type | Meaning |
|---|---|---|
| `start` | `GeoPoint \| null` | Blue pin (runner start / pickup) |
| `end` | `GeoPoint \| null` | Green pin (task site / drop-off) |
| `runner` | `GeoPoint \| null` | Live runner dot; `null` outside the location window (removed at once, nothing kept) |
| `routeTo` | `GeoPoint \| null` | Runner "self" variant: the dashed line runs from `runner` (the device) to this point instead of `start → end` |
| `etaLabel` | `string \| null` | ETA chip text (`formatEta` output or `Arrived`); hidden when null |
| `height` | number (px) | Default 220 (customer tracking). Runner job map passes 190. View specs may pass a taller value at ≥ 1024px |
| `ariaLabel` | string | Accessible name of the map region, e.g. `Map of the task location` (the address rows carry the information) |
| `moveDurationMs` | number | Default 1200 (Flutter `moveDuration`) |
| `fitPadding` | number | Default 40 |

Content slot `[nmMapOverlay]`: a bar along the bottom edge inset 12px (runner `NavigationChip`, issue #15).

### 7.2 Frame

Radius r-m, `overflow:hidden`, 1px slate-line border, height from the input. ETA chip at top 14px / left 14px: white pill, 1px slate-line hairline (no shadow, Q14/OA-14), Fira Code 11.5/700 blue, padding 6px 10px (Flutter `EtaChip`).

### 7.3 Map behaviour (as `GoogleTrackingMap`)

- Created **once** per component instance; inputs never re-create it.
- Options: `disableDefaultUI: true` (no map-type, zoom, street-view, fullscreen, compass controls), `clickableIcons: false`, `gestureHandling: 'cooperative'` (web adaptation: page scroll is not captured; Flutter has gestures on), `keyboardShortcuts: true`.
- Markers: start = blue teardrop pin, end = green teardrop pin (mockup `.pin`: 14px square with three rounded corners turned −45°, tip at bottom centre; anchor bottom-centre), runner = 16px green dot with a 3px white ring (anchor centre, `zIndex` 2). Marker SVGs are built at runtime with colours read from the CSS custom properties (`getComputedStyle(document.documentElement).getPropertyValue('--nitume-green')`), so no hex lives in the component. No marker shadow. Marker clicks do nothing.
- Route: a straight dashed blue polyline (8px on, 6px off via repeated line symbols) from `start` (or the runner when there is no start) to `end`; in the self variant from `runner` to `routeTo`. Not a road route (Directions API not approved).
- Camera: on first data, fit bounds of all present points with `fitPadding`; single point → centre at zoom 15 (Flutter `cameraFor`; the map's initial camera, before any fit, is zoom 14 at the first point or Nairobi CBD). Re-fit (force) when `start` or `end` changes. After each runner move completes, re-fit only if the runner is outside the visible bounds.
- **Animation, not re-render** (System Design §5, §7.1): when `runner` changes from one point to another, the marker glides linearly from its currently shown position to the new one over `moveDurationMs` using `requestAnimationFrame`, updating only the marker's position (`marker.setPosition`, through the `map-marker` `[position]` binding or the `MapMarker` instance). A new point during a glide starts a new glide from the current shown position. First point: placed directly (no glide). `runner → null`: stop the animation and remove the marker at once. The `google.maps.Map` instance and the other markers are untouched by runner moves.
- Respect `prefers-reduced-motion: reduce`: jump to the new position without gliding (web adaptation).

### 7.4 Placeholder (no maps key or load failure)

When `MapsLoaderService` has no key (`environment.mapsApiKey` empty) or the script fails to load: the frame shows a **blue-050** fill (no grid, no image), the ETA chip and overlay still render, `role="img"` with `ariaLabel`. Flutter: `LiveTrackingMap` without `mapBuilder` (`AppConfig.mapsEnabled` false). Never a broken map or an error message to the user.

### 7.5 `MapsLoaderService`

Loads the Maps JavaScript API once per page with the key from config (`https://maps.googleapis.com/maps/api/js?key=…&loading=async`, or `@googlemaps/js-api-loader` if the builder prefers; no other libraries requested). Exposes `ready: Signal<'idle' | 'loading' | 'ready' | 'unavailable'>`. Places Autocomplete loading is out of scope here (issue #7 / #12 reuse this loader).

### 7.6 Key handling (never committed)

- `environment.ts` (committed) has `mapsApiKey: ''`.
- A gitignored `apps/website/src/environments/environment.local.ts` holds the real key for local builds, swapped in by an Angular `fileReplacements` entry in a `local` configuration. Add `apps/website/src/environments/*.local.ts` to the root `.gitignore` (the existing `web/environments/*.local.ts` line points at a path that does not exist). Commit an `environment.local.example.ts` with an empty key.
- CI/production injects the key at build time into the same file. The key is a browser key: the owner must restrict it to the website's HTTP referrers and to the Maps JavaScript API (§13 WQ-1).
- No key is ever written in source, tests, docs or commit messages.

---

## 8. Responsive and accessibility rules for every kit component (web adaptation)

- No horizontal scroll from 360px up; text wraps, chips ellipsise, tables are not part of the kit.
- Hit areas ≥ 48×48px for every interactive control (`nm-hit-area`), as in the apps.
- Visible focus on every interactive element (`nm-focus-ring`); never `outline: none` without a replacement.
- Hover states only where the design system defines one (buttons, outline border) plus clickable-card border; no hover colour outside the palette.
- Overlays (dialog, panel, toast) respect `env(safe-area-inset-*)`.
- Live regions: errors `role="alert"`, toast and skeleton `role="status"`.
- Motion: only the map glide, the spinner and overlay fades (150–200 ms); all disabled under `prefers-reduced-motion`.

---

## 9. Domain rules the kit enforces

- Six categories, display names only (§5.4); five for customers.
- Every §3.3 state has an exhaustive customer and runner mapping (§4.2); no invented labels; admin labels never used.
- No wallet/escrow wording in any kit default copy. The kit has no money-flow component; service fee, runner fee and merchant payment stay separate in the view issues (#8, #17).
- Colours only through `--nitume-*`; amber/red only as chip-sized accents (chip, unread dot, destructive label, field error, notice error icon, price-change amount).

---

## 10. Data needed

The kit itself calls no REST endpoint. It relies on:
- Socket.IO gateway as in §6.4 (all events exist on `main` in `apps/api/src/realtime/`).
- `POST /api/v1/auth/web/refresh` through issue #6's token provider (PR #20, `apps/api/src/auth/web/web-auth.controller.ts`).
- Views later read snapshots from `GET /errands/:id/tracking` (exists, `location.controller.ts`, customer/runner/admin) and their own endpoints.

No API gap for issue #5.

---

## 11. File layout (proposed for the builder)

```
apps/website/src/styles/_tokens.scss                 tokens + mixins (§2)
apps/website/src/app/shared/ui/button/               nm-button
apps/website/src/app/shared/ui/status-chip/          nm-status-chip, nm-tag
apps/website/src/app/shared/ui/list/                 nm-list-group, nm-list-item, nm-step-card, nm-checkbox
apps/website/src/app/shared/ui/card/                 nm-card, nm-section-label
apps/website/src/app/shared/ui/field/                nm-field, nm-form-card
apps/website/src/app/shared/ui/timeline/             nm-timeline
apps/website/src/app/shared/ui/states/               nm-empty-state, nm-error-state, nm-skeleton-card, friendlyError
apps/website/src/app/shared/ui/overlay/              NmDialogService, nm-dialog, NmPanelService, nm-panel, NmToastService, nm-toast-host
apps/website/src/app/shared/ui/notice/               nm-notice
apps/website/src/app/shared/status/                  ErrandStatus, customerStatus, runnerStatus, customerTimelineTitle
apps/website/src/app/shared/format/                  formatters.ts, pipes, nmNum, categoryName
apps/website/src/app/core/realtime/                  RealtimeService, realtime.events.ts, tokens
apps/website/src/app/shared/map/                     nm-live-map, MapsLoaderService
```

Marketing files (`pages/*`, `shared/{header,footer,category-card,profile-card,proof-item,ticket}`, the existing parts of `styles.scss`) are not modified. A kit gallery route is **not** required; if the builder adds one for manual checking it must sit under the guarded `/app` tree and not be linked from marketing pages.

---

## 12. Required tests (Vitest, `cd apps/website && npx ng test --watch=false`)

Every item below is a separate `it(...)`. Component tests use `TestBed` + the rendered DOM; colour assertions check the **custom property name** used (e.g. computed style resolves from `var(--nitume-green)` or the element has the variant class bound to that token), not hex values.

### 12.1 Tokens
1. `_tokens.scss` compiles and declares every property in §2.2, §2.3, §2.5, §2.6 with the exact value (a spec reads the compiled CSS or the SCSS source and compares against a table in the test).
2. Static check: no file under `src/app/` matches `/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|box-shadow/` (a Vitest that globs the folder; marketing files listed in §1 are excluded by path).
3. `styles.scss` still declares the marketing variables unchanged (guards the "marketing unchanged" rule).

### 12.2 `nm-button`
4. Renders each variant with the right token pairing (primary green/white, secondary blue/white, outline white/blue/slate-line, text, link green-700).
5. `destructive` makes outline and text labels red; ignored (with dev warning) on primary/secondary.
6. Small size applies the small type style and keeps a 48px hit area.
7. Disabled: `disabled` attribute, no click output, slate-line/slate-400 styling.
8. Loading: spinner shown, `aria-busy="true"`, accessible name still the label, clicks ignored, width unchanged.
9. `href` renders an anchor with the same classes.

### 12.3 Status chip and tag
10. **Customer map, every §3.3 state**: a table-driven test over `ERRAND_STATUSES` asserts the label and tone of §4.2.3 for all 17 states, and that the rendered chip shows that label with the tone class.
11. **Runner map, every §3.3 state**: table-driven over all 17 states plus RUNNER_ASSIGNED with `offerAccepted: false`; DRAFT/REQUESTED/QUOTED/ACCEPTED return `null` and the chip renders nothing.
12. `customerTimelineTitle`: RUNNER_ASSIGNED → `null`, RUNNER_EN_ROUTE → `Runner assigned`, every other state → its label.
13. High-contrast rule (row 33): success, pending and danger labels use the blue token, dots use green-700 / amber / red; info uses blue for both.
14. Sizes: regular shows the dot, compact and tag do not; `showDot` overrides.
15. `numericSuffix` renders after ` · ` inside an `nmNum` element; accessible text is `label suffix`.
16. Unknown status string → no chip (parser returns `null`).
17. `nm-tag`: blue on blue-050, no dot, not focusable.

### 12.4 Checklist, checkbox, card, section label
18. `nm-checkbox`: unchecked/checked visuals, Space toggles, `disabled` blocks change, label variant makes the row clickable.
19. `nm-list-item`: title, meta in Fira Code, `3/5` counter in Fira Code; done → strike-through + slate-600 title; counter green-700 only when complete; accessible name.
20. `nm-list-group`: hairlines between items, none after the last.
21. `nm-step-card`: done check, Fira Code subtitle, optional secondary small action; whole card triggers the action when present; accessible name variants.
22. `nm-card`: solid/dashed borders, clickable variant is keyboard-activatable with a focus ring.
23. `nm-section-label`: uppercase via CSS, DOM text unchanged, heading level from input.

### 12.5 Field
24. Label is associated with the control; placeholder slate-400.
25. Error state: `aria-invalid`, `aria-describedby`, `role="alert"` message in red.
26. Multiline grows 3→6 rows; money shows persistent `KSh ` prefix, strips non-digits, Fira Code; phone uses `type="tel"`/`inputmode="tel"` and Fira Code.
27. `ControlValueAccessor`: value in/out, disabled from the form control.
28. `maxLength` counter in Fira Code when enabled.

### 12.6 Timeline
29. Done/pending dot tokens, connector absent on the last step, time in Fira Code, `aria-label` = `title, time, done|pending`.

### 12.7 States
30. Empty state with and without title/action; action emits.
31. Error state default `Try again`, retry emits, message in a live region.
32. `friendlyError`: network failure → `Check your connection and try again.`; other → `Something went wrong. Please try again.`
33. Skeleton: `role="status"`, `aria-label="Loading"`, height input.

### 12.8 Dialog, panel, toast, notice
34. Dialog renders title/body/actions in a vertical stack, max-width 335px, scrim token, `aria-modal`, focus moves in and returns to the opener on close.
35. `confirm()`: confirm is outline (red when destructive) and first, cancel is primary and second; resolves `true` only on confirm; scrim and Escape resolve `false`.
36. `dismissible: false`: scrim click and Escape keep it open.
37. Panel: bottom-docked full width below 768px, centred max-width 560px from 768px (viewport stubbed), drag handle `aria-hidden`, Escape closes when dismissible, focus trap.
38. Toast: blue-700 fill white text, `role="status"`, a second `show` replaces the first, auto-dismiss after 4s (fake timers), timer pauses on hover/focus.
39. Notice: info icon default, danger swaps to the red error icon, no coloured fill, action slot renders.

### 12.9 Formatting
40. Every test vector in the §5.2 table, one assertion per row (money, dates, EAT, distance, duration, phone).
41. EAT functions give the same output whatever the process time zone (run the EAT block with `process.env.TZ` set to `America/New_York` and to `Africa/Nairobi`, or assert they only use UTC getters through vectors near midnight UTC+3).
42. Local functions use an injected `now` (no flaky `Date.now()`).
43. `nmNum` applies the numeric family and the named style; without a value only the family; `nmNumLabel` sets `aria-label`.
44. `categoryName` for all six wire values; unknown → empty; `CUSTOMER_MVP_CATEGORIES` has five entries without `business`.

### 12.10 `RealtimeService` (mocked socket via `SOCKET_IO_FACTORY`)
45. `connect()` opens a socket to the API origin with `path: '/socket.io'`, `transports: ['websocket']`, `auth: { token }` from `REALTIME_TOKEN_PROVIDER`, `reconnection: false`; state `connecting` → `connected` on the fake `connect`.
46. Auth refused: the fake emits `disconnect('io server disconnect')` → state `reconnecting`, retry after the injected backoff with a **fresh** token from the provider.
47. Backoff sequence 1 s, 2 s, 4 s … capped at 30 s with jitter within ±20% (default function unit-tested with a seeded random).
48. Provider returns `null` during a retry → state `disconnected`, no further attempts.
49. Re-join: rooms joined before a drop are re-joined with `errand:join` after reconnect; a room whose ack is not `ok` is forgotten.
50. `joinErrand` resolves `ack.ok`; resolves `false` after the 10 s ack timeout (fake timers); `leaveErrand` emits `errand:leave` and removes the room.
51. **Fan-out**: each of the 13 server events in §6.4 is parsed and emitted on its own observable with typed fields (ISO dates parsed, prices kept as strings); two subscribers both receive it.
52. Malformed payloads (missing `errandId`, bad `status`, non-object) are dropped without throwing.
53. `errand:access_revoked` removes the errand from the re-join set.
54. `sendLocationPing`: emits `location:ping` with the payload, resolves the parsed ack; `forbidden`/`not_live` flagged as stop; not connected or no ack in 10 s → `{ ok: false, sent: false }`.
55. Events from a stale socket (after a reconnect) are ignored.
56. `disconnect()` stops retries, clears rooms, state `disconnected`.
57. Window `online` while reconnecting triggers an immediate retry.
58. `showReconnecting(5000)` turns true only after 5 s of `connecting`/`reconnecting` and false again on `connected`; it stays false while `disconnected` (before `connect()`, after `disconnect()`, stub provider returning `null`).

### 12.11 `LiveMapComponent` (Maps API stubbed: a fake `google.maps` namespace with spy `Map`, `Marker`, `Polyline`, `LatLngBounds`)
59. **The map is constructed exactly once**; changing `runner` several times does not call the `Map` constructor again or re-create the start/end markers.
60. **Marker moves**: with `requestAnimationFrame` and timers faked, a new `runner` point produces intermediate `setPosition` calls and ends exactly at the new point after `moveDurationMs`.
61. First runner point is placed without a glide; `runner → null` removes the marker immediately and keeps no position (a later point is placed, not glided).
62. A new point mid-glide restarts from the current shown position.
63. Camera: initial fit with padding 40; single point → zoom 15 (initial camera zoom 14); refit forced when `start`/`end` change; after a move, refit only when the runner is outside the stubbed bounds.
64. Self variant: the polyline runs `runner → routeTo`; default runs `start (or runner) → end`.
65. ETA chip renders `etaLabel` in Fira Code and hides when null; overlay slot renders.
66. No key (`mapsApiKey: ''`) or loader `unavailable` → blue-050 placeholder with `role="img"` and the aria label; the Maps script is never requested.
67. `prefers-reduced-motion: reduce` (stubbed `matchMedia`) → jumps without intermediate positions.
68. Marker colours come from the CSS custom properties (the test sets `--nitume-green` and asserts the SVG uses the resolved value).

### 12.12 Build health
69. `npx ng test --watch=false` passes with 0 failures and `npx ng build` succeeds (bundle budget unchanged for the marketing entry; kit code is only in lazy chunks or tree-shaken until #6 routes use it).

---

## 13. Questions for the owner

| Id | Question | Recommendation |
|---|---|---|
| WQ-1 | The live map on the website needs a Google Maps **JavaScript** API key (browser key) on the billing account, restricted to the website's HTTP referrers. Can you create it (we never commit it; it is injected at build time)? Until then the web map shows the blue-050 placeholder, as the apps do without a key. (§3: real API keys / billing account) | Create a separate referrer-restricted browser key, Maps JavaScript API only |
| WQ-2 | Customer times on the web: the app shows activity and notification times in the device's time zone and deadlines in East Africa Time. Diaspora customers will use the website from other time zones. Keep that parity, or show every customer time in EAT (as runner and admin)? | Keep parity (local for activity, EAT for deadlines); revisit with the diaspora flow |
| WQ-3 | Desktop sizes for overlays: the bottom-sheet-style panel at ≥ 768px is proposed as the same bottom-anchored panel centred with max-width 560px (alternative: a right-hand side panel like the admin drawer). Dialogs keep the app's 335px width on desktop. Approve? | Approve as proposed |
| WQ-4 | Web notifications: the apps use FCM push; the website has none. Without web push, users learn of new offers, price-change requests and status changes only while a signed-in tab is open (socket events + bell refresh). Add FCM web push (service worker, VAPID key) in this parity round, or leave it out? (§3: third-party setup, scope) | Leave web push out of this round; in-tab realtime only. **Answered 2026-10-28 (owner): FCM web push, added by #11/#18; #6 provides the sign-out hook** |
| WQ-5 | The marketing stylesheet drifts from the design system (`--r-l` 22px instead of 20px; `.input` slate fill + 10px radius; `.btn-outline` hover fill; 18px `.check`). The app kit uses its own `--nitume-*` tokens and leaves marketing untouched as issue #5 requires. Fix the marketing drift in a separate website parity audit later? | Yes, separate audit after the parity issues |
| WQ-6 | Runner live location from the browser (issue #15): a browser can share location only while the tab is open (no background sharing, no foreground service). Should runners be allowed to work an active job from the website (pings only while the tab is open, with a notice), or should the web runner area stay without live-location sharing and send them to the app for active jobs? (§3: scope; location/privacy) | Decide before #14/#15 are specced; recommend allowing it with a clear notice and the existing `x-location-disclosure` copy |
| WQ-7 | Fira Code weight 700 is not loaded by the website today (ETA chip 11.5/700 in the app). The builder adds it to the existing Google Fonts link (one more weight, marketing unchanged). Confirm? | Confirm |
| WQ-8 | Security (issue #6, flagged here because `RealtimeService` reads the token): the website keeps the access **and refresh** tokens in `localStorage`, readable by any injected script. For signed-in customer/runner sessions, keep this, or move the refresh token to an httpOnly cookie (needs an API change)? (§3: session/token handling) | Decide in the #6 spec; recommend httpOnly refresh cookie |
