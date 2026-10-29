# customer `v-new-category` (web): new task, step 1 (category) + wizard foundation

- Issue: GitHub #7, "[Website] Customer: home and create-task wizard". Builder: `web-parity`. Branch: `feat/website-customer-create-task`. It contains the finished #6 branch (`feat/website-auth-shell` at `32ea1a1`, re-audit 3 PASS) through merge `55af009`, and with it the #5 kit.
- Route: `/app/customer/new` inside the #6 customer shell (`AppShellPage` in `app-area/shell/app-shell.page.ts`, guarded by `authGuard`, `roleGuard('customer')` and `hasNameGuard` on the shell route in `app-area/customer.routes.ts`, F§2). Shared rules: `auth-foundation.md` (F§n), `customer-shell.md`. Kit: `ui-kit.md` (K§n). Sibling specs: `customer-v-home.md` (H§n), `customer-v-new-details.md` (ND§n), `customer-v-new-review.md` (NR§n).
- Sources: mobile spec `docs/specs/customer/v-new-category.md` (matches-design); Flutter `apps/customer_app/lib/src/screens/wizard/{category_screen,task_draft}.dart`, `packages/nitume_core/lib/src/widgets/{category_tile,step_progress_bar}.dart`; mockup `docs/design/nitume_customer_app.html` lines 56–60, 86–88, 343–359; owner answers OA-1, OA-9, OA-18, row 1; WQ-3, WQ-15, WQ-16.
- **This file also holds the wizard foundation (§W0–§W10)** that the three wizard steps share. The details and review specs cite it as NC§W*n*. Nothing in it redefines the kit or the #6 shell; it adds wizard-only pieces.
- **Updated 2026-10-29** (commit `docs(specs): #7 specs updated for owner answers and the #6 build`): owner decisions WQ-25 and WQ-26 (Places, attribution; §W7), WQ-29 (no Home ETA; H), WQ-34 (360 kB cap and the WQ-33 framework rules; §W10). WQ-2 stays open. Aligned with what #6 built (§W0).
- There is no web mockup. **(web adaptation)** marks layout or browser behaviour the app does not have; it never changes content, copy, tokens or flow. **(proposed)** marks copy the mobile spec already marks as proposed (built and accepted in the app).
- Implementation: none. `/app/customer/new` is one #6 `ViewStubComponent` route (`app-area/customer.routes.ts`, `data { role: 'customer', navKey: 'new', pushed: true }`, no `title`, renders only an `nm-skeleton-card`). Status: **missing**.

## Purpose
Step 1 of the 3-step task wizard: pick exactly one of the **five** customer MVP categories.

## Entry / exit
- Entry:
  - Nav item `New task` (bottom bar below 768px, side nav from 768px) → `/app/customer/new`, nothing selected.
  - Home search row → `/app/customer/new`, nothing selected (mobile Q2 default).
  - Home category tile → `/app/customer/new?category=<wire value>`, that category preselected (mobile Q3 default). Only the five MVP wire values are honoured; `business` or any unknown value is ignored (nothing selected) and the parameter is removed with `replaceUrl`.
  - Later issues: Track empty state `Start a new task` (#9), History empty state (#11), the EXPIRED `Start a new task` (#9) link here without a category.
- Exit:
  - `Continue →` → `/app/customer/new/details` (push).
  - Header Back / browser Back / any link out of the wizard → leave rules in §W3 (discard confirm when the draft holds data).

## Task states
None. Nothing is posted until step 3 (NR). The screen shows no state chip.

## Layout

Wizard frame §W4. Body top to bottom:
1. `nm-section-label` `What do you need done?`, top padding 0 (mockup `padding-top:0`), bottom 10px, no horizontal inset (the frame column gives the gutter).
2. Category grid (`nm-category-grid`, §Components): **3 columns, 5 tiles**, gap 10px, bottom padding 20px. Row 1: Buy For Me, Get It For Me, Check It For Me. Row 2: Go There For Me, Wait For Me, and an **empty third cell** (no placeholder tile, no stretching). All tiles in a row share the height of the tallest tile.
3. CTA `Continue →` in `nm-fixed-cta` (§W4).

Responsive (web adaptation): the grid stays **3 columns at every width** (parity; the 3 + 2 layout with the empty cell is the tested rule). Below 768px the tiles are ~100px wide at 360px and labels wrap to 2 lines; from 768px the wizard column is max 640px, so tiles are at most ~207px wide. No horizontal scroll at 360px.

## Components

| Element | Component | Status |
|---|---|---|
| Frame: pushed header + stepper + body + CTA | `nm-wizard-frame` (§W4) composing `nm-pushed-header` (#6) and `nm-fixed-cta` | **NEW (#7)**; header exists (#6, needs the `backDisabled` addition, §W9a); `nm-fixed-cta` **NEW (#7)**, shared with #8 |
| Stepper | `nm-stepper` (C-14) | **NEW (#7)** |
| Section label | `nm-section-label` `[inset]="false"` (the column gives the gutter) | kit (#5); its `NgTemplateOutlet` is replaced under §W10 |
| Category tile + grid | `nm-category-tile`, `nm-category-grid` (C-15) | **NEW (#7)** (the kit leaves the tile to #7, K§3); also used by Home (H) |
| Continue | `nm-button` primary, `expand`, `type="button"` | kit |
| Discard confirm | `NmDialogService.confirm()` (C-35), imported from `shared/ui/overlay/dialog.service` (not a barrel) | kit (#5); `nm-dialog`'s `viewChild` / `NgTemplateOutlet` are replaced under §W10 |
| Category icons | `nm-icon` (#6, `shared/ui/icon`) | exists; **#7 adds** four registry entries and reuses `location` (§Components, icons) |

`nm-category-tile` (port of `CategoryTile`; design values from the mockup `.cat-tile` and the mobile spec):
- White fill, 1px `--nitume-slate-line` border, radius `--nitume-r-m` (14px), padding 14px 10px, content centred, min-height 48px.
- Icon box 32×32px, radius `--nitume-r-s` (8px; mockup 9), `--nitume-green-050` fill, `nm-icon` 16px in **`--nitume-blue`** (mobile spec "icon 16 blue"; the built Flutter tile uses green-700, which the kit's token table does not allow for icons, see Current vs design), 8px below it the label.
- Label: `@include nm-type(row-title, 11.5px)` (Sans 11.5 / 600 blue; no new type style, §W9a) plus `line-height: 1.3`, centred, up to 2 lines, full display name from `categoryName` (K§5.4).
- Selected (only on this screen): border 1px `--nitume-green` plus a 2px inset `--nitume-green-050` ring (mockup `.cat-tile.sel` `box-shadow:0 0 0 2px var(--green-050) inset` → implemented as an inset `outline`/second border, **not** `box-shadow`, K§2.1). Green here is a checked state, which the design system allows.
- Hover (web adaptation): border `--nitume-blue` (same rule as the clickable card, K§4.4); selected tiles keep the green border. Focus: `nm-focus-ring`.
- Modes: `selectable` (this screen: a radio, see Accessibility) or `link` (Home: an `<a>` to `/app/customer/new?category=…`, never selected).

`nm-category-grid`: inputs `categories` (default `CUSTOMER_MVP_CATEGORIES`, K§5.4), `selected` (wire value or null), `mode: 'select' | 'link'`; output `selectedChange`. CSS grid `repeat(3, minmax(0, 1fr))`, gap 10px; the fifth tile sits in column 2 of row 2 and column 3 stays empty.

Icons (#6 `nm-icon` registry in `shared/ui/icon/icons.ts`, Material paths, Apache-2.0 header already present): **reuse** the #6 `location` entry (Material `location_on` outlined, the Flutter `Icons.place_outlined` shape) for Go There For Me and for the place fields (ND); **add** `shopping-bag` (Buy For Me), `local-shipping` (Get It For Me), `fact-check` (Check It For Me), `hourglass` (Wait For Me). No `place` entry (it would duplicate `location`). Mapping lives in one function `categoryIcon(wire)` next to `categoryName` (Flutter `categoryIcon`). Business Tasks has `business-center` in Flutter but is never rendered to customers; do not add it.

## Copy (exact)
- Header title: `New task`; counter `Step 1 of 3`.
- Section label: `What do you need done?`
- Tiles (OA-1, canonical order): `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me`. **No `Business Tasks` tile** (OA-18).
- CTA: `Continue →`
- Discard dialog (proposed, built in the app): `NmDialogService.confirm({ title: 'Discard this task?', body: "What you've entered so far will be lost.", confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true })` (confirm outline with red label first, cancel primary second: the kit order).
- Document title: `New task · Nitume` (route `title` string, §W1).

## States

| State | Behaviour |
|---|---|
| Nothing selected (nav, search row, unknown `?category`) | `Continue →` **disabled** (kit disabled style); no message |
| Preselected from Home | That tile selected; CTA enabled |
| Selection changed | Store `changeCategory()` (§W2); CTA enabled |
| Back with no data (`hasData` false) | Leave at once (§W3) |
| Back with data (user came back from step 2 and entered something) | Discard confirm; `Discard` → leave and reset the draft (cancelling a created DRAFT, §W8); `Keep editing`, Escape or scrim → stay |
| Loading / empty / error | None (static list) |

## Numeric fields (Fira Code)
- Step counter `Step 1 of 3` (`nm-pushed-header` counter, `num-meta`).

## Data
- Categories: `CUSTOMER_MVP_CATEGORIES` (kit `shared/format/category.ts`); wire values only in the URL query and the request body, display names only in the UI.
- No endpoint, no socket event on this step.

## Accessibility and responsive
- The grid is `role="radiogroup"` with `aria-labelledby` = the section label; each tile is `role="radio"` with `aria-checked`, roving `tabindex` (Tab enters the group on the selected tile, else the first; arrow keys move and select, wrapping in reading order across the 3 + 2 layout; Space selects). Screen readers announce "Check It For Me, selected, 3 of 5" (mobile spec), which `role="radio"` + `aria-setsize="5"` / `aria-posinset` give.
- Icons `aria-hidden`; the accessible name is the display name only.
- Tiles are ≥ 84px tall (≥ 48 required).
- Disabled `Continue →` keeps the `disabled` attribute; no tooltip.

## Required tests (Vitest), this view
1. Renders `New task` (the `nm-pushed-header` `h1`), `Step 1 of 3` (counter inside an `nmNum` element), the section label and exactly five tiles in canonical order with the exact names; no `Business Tasks`; the sixth grid cell is empty (no element).
2. Stepper: segment 1 has the done class (`--nitume-green`), segments 2–3 the empty class (`--nitume-slate-line`).
3. Nothing selected → `Continue →` disabled; selecting a tile enables it.
4. `?category=inspection` preselects `Check It For Me`; `?category=business` and `?category=foo` select nothing and the query is removed with `replaceUrl`.
5. Radio semantics: `role="radiogroup"`, one `aria-checked="true"`, arrow keys move and select, Space selects.
6. Selected tile uses the green border + inset ring classes and no `box-shadow`; unselected uses slate-line.
7. Icon colour token is `--nitume-blue` and the icon box `--nitume-green-050`; the icons are `shopping-bag`, `local-shipping`, `fact-check`, `location`, `hourglass` (`data-icon` attribute of `nm-icon`).
8. `Continue →` navigates to `/app/customer/new/details` and the store holds the category.
9. Back with an empty draft leaves without a dialog; with data shows the dialog with the exact copy and button order (Discard outline red first, Keep editing primary second); Discard leaves and resets; Keep editing stays.
10. Grid in link mode (Home) renders `<a>` elements to `/app/customer/new?category=<wire>` and never a selected state.
Foundation tests: §W9.

## Current vs design
No wizard on the website; `/app/customer/new` is the #6 `ViewStubComponent` (skeleton only, no title). Flutter drift noted for flutter-customer (not blocking the web): the built tile icon is green-700 and the selected ring 3px; the mobile spec says blue icon and a 2px ring. The web follows the spec and the kit token rules.

## Questions
None new. Carried mobile defaults (build as written): Q2 canonical order, no preselection from the nav; Q3 icons instead of the mockup emoji.

---


# Wizard foundation (shared by steps 1–3)

## §W0 What #6 built that #7 uses (verified at `55af009`)

| #6 piece | Path (under `apps/website/src/app/`) | How #7 uses it |
|---|---|---|
| Customer route tree, shell guards, route `title` strings (Angular default `TitleStrategy`, WQ-33) | `app-area/customer.routes.ts` | #7 **replaces** the `home` and `new` `ViewStubComponent` routes and adds the stub routes of §W1. Titles are route `title` strings, never a custom strategy |
| `ViewStubComponent` (top-bar `h1` from `data.stubLabel`, else one `nm-skeleton-card`) | `app-area/view-stub.component.ts` | Declares the not-yet-built targets of Home and the wizard (§W1) |
| `AppShellPage` + `nm-app-shell` + `nm-app-nav` (nav from `data.navKey`, bar hidden on `data.pushed` below 768px, white side nav kept from 768px, `<main id="content">`) | `app-area/shell/app-shell.page.ts`, `shared/ui/app-shell`, `shared/ui/app-nav` | Unchanged. `CUSTOMER_NAV` links (`/app/customer/home`, `/new`, `/track`, `/history`, `/profile`) are the targets `customerLinks` must match |
| Focus after navigation: `focusPageHeading` moves focus to the page `h1` unless the page already focused one of its controls | `app-area/focus-heading.ts`, `AppAreaComponent` | Views that must focus a field on entry (ND `focusOnReturn`) do it in `ngAfterViewInit`, before the heading timeout, exactly as the #6 code screen does |
| `nm-top-bar` (`title`, `greeting`, actions slot; empty title → no `h1`) | `shared/ui/top-bar` | Home top bar |
| `nm-pushed-header` (`title`, `step`, `steps`, `fallback`, output `back` with `NmBackEvent.preventDefault()`; `Step n of m` already in `nmNum="meta"`) and `nm-back-button` | `shared/ui/pushed-header`, `shared/ui/back-button` | Wizard header. #7 adds `backDisabled` (§W9a) |
| `nm-icon` registry (`home`, `add-circle`, `location`, `history`, `person`, `arrow-back`, …) | `shared/ui/icon` | Reuse `location` (place fields, Go There For Me) and `person` (avatar fallback); add the names in §W9a |
| Kit additions of F§7.1 | `_tokens.scss`, `shared/ui/field`, `shared/ui/button`, `shared/format` | `greeting` type (Sans 12/400 slate-600) is reused as the caption style; `nm-visually-hidden` mixin; `nm-field` `hideLabel`; `nm-button` `ariaLabel`, `target`, `rel`, `inline` |
| WQ-33 helpers | `shared/ui/template-outlet.directive.ts` (`nmTemplateOutlet`), `shared/ui/field/field-value.directive.ts` (`nmFieldValue`), `shared/ui/overlay/viewport.ts` (`mediaQuery`, `NM_BP_MD_QUERY`) | The only allowed ways to project a template, bind a field and read a breakpoint in #7 code (§W10) |
| Lazy session layer: `lazyAuthInterceptor` (Bearer, refresh, `account_suspended`) | `core/lazy-session/lazy-session.ts`, `core/auth/auth.interceptor.ts` | Every #7 `HttpClient` call goes through it; #7 adds no interceptor |
| `SessionStore.user()` (`displayName`) | `core/auth/session.store.ts` | Home greeting and avatar |
| `RealtimeService` (`joinErrand`, `leaveErrand`, `statusChanges$`, `state`), connected once by the shell | `core/realtime/realtime.service.ts` | Home live reload; #7 adds `onStateChange` (§W9a) |
| Static tests F9.48–F9.50, F9.60 | `src/styles/auth-static.spec.ts` | Must keep passing; `app-area/**` is already in their scope, so #7 files under `app-area/customer/` are covered. #7 adds its own static spec for the other #7 folders (§W10) |

Components #7 would otherwise have built and that #6 already provides (do **not** build a second one): pushed header, back button, top bar, stepper counter text (`Step n of 3` is the `nm-pushed-header` counter), skip link, nav, icon component, visually hidden heading mixin, route stub.

## §W1 Routes

In `app-area/customer.routes.ts`, under the shell route (`children`), replacing the #6 `new` stub with one **componentless parent** that owns the draft store and three lazy children:

```ts
{
  path: 'new',
  data: { role, navKey: 'new', pushed: true },
  providers: [TaskDraftStore],
  canActivate: [wizardEntryGuard],          // §W3 fresh start
  children: [
    { path: '',        title: 'New task · Nitume',     canDeactivate: [wizardLeaveGuard], loadComponent: … },  // v-new-category
    { path: 'details', title: 'Task details · Nitume', canActivate: [wizardStepGuard(2)], canDeactivate: [wizardLeaveGuard], loadComponent: … },
    { path: 'review',  title: 'Review · Nitume',       canActivate: [wizardStepGuard(3)], canDeactivate: [wizardLeaveGuard], loadComponent: … },
  ],
}
```

`nm-app-shell` reads `navKey` and `pushed` from every level of the snapshot, so the parent's data applies to the three children: the bottom bar is hidden below 768px; from 768px the white side nav stays with `New task` active (WQ-15, WQ-16, `customer-shell.md`). The `home` route keeps its #6 `title: 'Home · Nitume'` and `navKey: 'home'`, and drops `stubLabel`.

Links to views owned by later issues go through one helper so the paths live in one place: `customerLinks` in `apps/website/src/app/app-area/customer/customer-links.ts` (**NEW (#7)**). The paths below match the #6 routes and the #8 spec (`customer-x-awaiting-quote.md` A§1); the owning issue may move a path by editing this file and its stub route only.

| Function | Path | View (issue) | Route today |
|---|---|---|---|
| `home()` | `/app/customer/home` | v-home (#7) | #6 route, view by #7 |
| `newTask(category?)` | `/app/customer/new` (+ `?category=<wire>`) | wizard (#7) | #7 |
| `awaitingQuote(id)` | `/app/customer/tasks/:errandId/quote` | x-awaiting-quote (#8, A§1) | **#7 stub** |
| `payment(id)` | `/app/customer/tasks/:errandId/payment` | v-payment (#8, A§1) | **#7 stub** |
| `track(id?)` | `/app/customer/track` / `/app/customer/track/:errandId` | v-track (#9) | #6 stubs (`navKey: 'track'`) |
| `taskDetail(id)` | `/app/customer/tasks/:errandId` | v-task-detail (#9, path proposed by #8) | **#7 stub** |
| `evidence(id)` | `/app/customer/tasks/:errandId/evidence` | v-evidence-confirm (#10, proposed) | **#7 stub** |
| `history()` | `/app/customer/history` | v-history (#11) | #6 stub |
| `notifications()` | `/app/customer/notifications` | v-notifications (#11, proposed) | **#7 stub** |
| `profile()` | `/app/customer/profile` | v-profile (#12) | #6 stub |

#7 declares the five **#7 stub** paths with the #6 `ViewStubComponent`: `data { role, navKey: 'home', pushed: true }` (all are opened from Home; #8 uses `navKey: 'home'` for quote and payment), no `stubLabel` (skeleton only), no `title`. `id` is URL-encoded with `encodeURIComponent`. Each later issue replaces its stub; reviewer checks none is left after #7–#18.

## §W2 `TaskDraftStore` (port of `TaskDraft`)

File `apps/website/src/app/app-area/customer/new-task/task-draft.store.ts`, `@Injectable()` (not `providedIn: 'root'`), provided once by the `new` parent route (§W1): one wizard at a time, like the app's single pushed stack. The route's environment injector outlives the views, so the draft survives moving between steps. Signals only (no `effect()`, §W10); **memory only** (no `localStorage` / `sessionStorage`; a reload loses the draft, as killing the app does).

```ts
type Wire = ErrandCategory;                       // shared/format/category.ts (#5)
type DeadlineChoice = 'today' | 'tomorrow' | 'flexible';
interface DraftPlace { addressText: string; lat: number; lng: number; placeId: string | null } // placeId null for saved addresses
interface DraftItem { name: string; quantity: number }               // quantity 1..99

category: Signal<Wire | null>;
title, description: Signal<string>;               // raw input
first: Signal<DraftPlace | null>;                 // task site (Check/Go There/Wait) or pickup/store (Get/Buy)
dropoff: Signal<DraftPlace | null>;               // Get It For Me, Buy For Me
items: Signal<DraftItem[]>;                       // starts as [{ name: '', quantity: 1 }]
deadline: Signal<DeadlineChoice>;                 // default 'today'
budget: Signal<number | null>;                    // whole shillings; null = empty
createdErrandId: string | null;                   // set once POST /errands succeeded (retry submits only)
submitted: boolean;
submitting: Signal<boolean>;                      // NR in flight (leave guard, back disabled)
detailsValidated: boolean;                        // step 2 passed validation once (step-3 guard)
outsideArea: { first: DraftPlace | null; dropoff: DraftPlace | null; pointType: 'task_site' | 'pickup' | 'dropoff' | null } | null;
openerUrl: string;                                // URL that opened the wizard (default customerLinks.home())
focusOnReturn: 'first' | 'dropoff' | null;        // set by `Change location` (NR)

computed: twoPoints = category ∈ { pickup_delivery, buy_for_me };
          isBuy = category === 'buy_for_me';
          hasBudget = twoPoints;                  // row 45
          namedItems = items with name.trim() non-empty;
          hasData = title.trim() || description.trim() || first || dropoff || namedItems.length || (budget ?? 0) > 0;
          locationRefused = outsideArea !== null && outsideArea.first === first() && outsideArea.dropoff === dropoff(); // identity

start(openerUrl: string, category: Wire | null): void;   // fresh draft (also clears `submitted`)
changeCategory(next: Wire): void;
reset(): void;                                    // discard: empty draft, submitted = false
finish(): void;                                   // after a successful submit: empty draft but keeps submitted = true and openerUrl until the next start()
toRequest(now: Date): CreateErrandBody;           // ND§Data
```

`changeCategory(next)` exactly as Flutter: no-op when equal; otherwise remember `hadTwo = twoPoints`, set the category; if `twoPoints` changed, clear `first`; **always** clear `dropoff`; reset `items` to one empty row; clear `budget` when the new category has no budget field. Title and description are kept.

## §W3 Entering, moving and leaving

- **Fresh start** (`wizardEntryGuard`, functional `CanActivateFn` on the `new` parent, §W1): Angular runs a parent's `canActivate` only when the parent route activates, that is when the previous URL is **outside** `/app/customer/new`. It calls `start(previousUrl ?? customerLinks.home(), category)` where `category` is `?category` if it is one of the five MVP wire values, else `null`; an invalid or `business` value returns a `UrlTree` to `/app/customer/new` without the parameter, navigated with `replaceUrl` (step 1 State table). Moving inside the wizard (step 2 Back, the `New task` nav item while on step 2/3) does not re-run it, so the draft is kept and a `?category` is ignored. `previousUrl` = the URL of the last successful navigation before this one (inside the guard: the current navigation's `previousNavigation.finalUrl`, serialised; the same source `nm-back-button` reads), `null` on a first load.
- **Step guards** (`wizardStepGuard(n)`, functional `CanActivateFn`): step 2 needs `category`; step 3 needs `category` and `detailsValidated`. Otherwise redirect (`replaceUrl`) to: after a successful submit (`submitted`, kept by `finish()`) → `openerUrl`; else step 1. So a deep link or reload on step 2/3 lands on step 1 with an empty draft, and browser Back into the wizard after a submit returns to the screen that opened it (the app: "Back from `x-awaiting-quote` goes to the screen that opened the wizard").
- **Between steps**: forward with `router.navigate` (push). Header Back is the #6 `nm-back-button` default (`history.back()` when the previous entry is inside `/app`), with `fallback` = the previous step URL (step 2 → `/app/customer/new`, step 3 → `/app/customer/new/details`) and, on step 1, `openerUrl`. Values are kept both ways (mobile: Back keeps entered values).
- **Leaving the wizard** (`wizardLeaveGuard`, functional `CanDeactivateFn`, acts only when the next URL is outside `/app/customer/new`): allowed at once when `submitted`, or when `!hasData`; otherwise `NmDialogService.confirm()` with the discard copy (§Copy). `true` → `reset()` (+ §W8) and leave; `false` → stay (the router restores the URL on browser Back). While `submitting()` the guard returns `false` without a dialog (NR "back disabled"). Covers the header Back on step 1, browser Back, side-nav links, the side-nav wordmark and every other link.
- **Tab close / reload** (web adaptation): while `hasData && !submitted`, a `beforeunload` handler calls `preventDefault()` so the browser shows its own leave prompt (no custom text is possible). Implemented as a host listener `'(window:beforeunload)'` on `nm-wizard-frame` (no `effect()`, no manual `addEventListener` without removal); it disappears with the frame.
- Step 1 header Back with data: the view handles the `back` output, calls `event.preventDefault()`, opens the same confirm **before** navigating (mobile `_back`) and on `true` resets and navigates to `openerUrl`, so the guard does not ask twice.

## §W4 Wizard frame layout (`nm-wizard-frame`, NEW #7) and `nm-fixed-cta` (NEW #7, shared with #8)

`nm-wizard-frame` (`shared/ui/wizard-frame/`) is one component for all three steps (no copied markup). Inputs: `title`, `step` (1–3), `backDisabled`, `backFallback`; output `back` (re-emits the `nm-pushed-header` event); slots: default body, `[nmWizardCta]` (the button), optional `[nmWizardAbove]` (content above the button). Top to bottom:
1. `nm-pushed-header` (#6): `[title]`, `[step]`, `[steps]="3"`, `[fallback]`, `[backDisabled]` (§W9a). Title `pushed-title` (18/700, `h1`), counter `Step n of 3` (`nmNum="meta"`, already built by #6).
2. `nm-stepper` (C-14, NEW #7, `shared/ui/stepper/`): `total` 3, `completed` n. Three equal segments, gap 6px, height 4px, radius pill; done `--nitume-green`, empty `--nitume-slate-line`; padding-bottom 16px. `role="img"` with `aria-label="Step n of 3"` (Flutter semantics `Step $completed of $total`).
3. Body (a `<form novalidate>` on step 2 with `(submit)` prevented; a plain `<section>` otherwise). No Angular forms module (§W10).
4. `nm-fixed-cta` wrapping `[nmWizardAbove]` and `[nmWizardCta]`.

`nm-fixed-cta` (`shared/ui/fixed-cta/`, port of `FixedCta` / `NitumeFixedCta`, defined in `customer-x-awaiting-quote.md` §Components for #8 and **built here once**; #8 reuses it unchanged):
- Below 768px: fixed to the bottom of the viewport, `--nitume-slate` background, padding `8px 20px 6px` + `env(safe-area-inset-bottom)`; optional `above` slot 10px above the button. The host view's content gets a bottom padding equal to the bar height so nothing hides under it. Toasts shown by the view pass `NmToastService.show(message, { offset: <bar height> })` (K§4.10), so they sit above the bar.
- From 768px (web adaptation): rendered inline where the view places it (no fixed bar), 16px below the last card; toast offset 0.
- No `box-shadow`; no new colour. The breakpoint is a CSS media query (`nm-up($nm-bp-md)`); the toast offset reads `mediaQuery(NM_BP_MD_QUERY)`.

Width and gutters:
- Below 768px: full width of the shell content column (gutter 20px from F§7.3); every element aligns to that gutter (mobile `margin 0 20` → no extra horizontal margin).
- From 768px (web adaptation): one column `max-width: 640px`, **centred** in the shell content column (side nav visible, WQ-15). The header, stepper, body and CTA share that column, so the CTA is never wider than the form.
- Short viewports: the body scrolls with the page; the fixed bar stays visible below 768px; a focused field is never hidden under it (`scroll-margin-bottom` = bar height + 16px).

## §W5 Customer errands API service

`CustomerErrandsApi` (`apps/website/src/app/app-area/customer/data/errands.api.ts`, **NEW (#7)**, `providedIn: 'root'`), `HttpClient` only; the #6 lazy interceptor adds the Bearer, refreshes and handles `account_suspended` (F§5). Base `${environment.apiBaseUrl}/api/v1`. No `withCredentials` (F§4.3: only `/auth/web/*` sends credentials).

| Method | HTTP | Request | Response (used fields) | Status |
|---|---|---|---|---|
| `list(statuses, limit)` | `GET /errands?status=A,B,…&limit=n` | comma-separated statuses (API accepts `A,B`; max 17), limit 1–100 | `{ items: ErrandView[], nextCursor: string \| null }`, newest **created** first | exists (`errands.controller.ts` `list`) |
| `defaults()` | `GET /errands/defaults` | — | `{ defaultDeadlineHours: number, defaultDeadlineStartsAt: 'payment_confirmed' }` | exists |
| `create(body)` | `POST /errands` | `CreateErrandBody` (ND§Data) | 201 `{ errand: ErrandView, history }` (DRAFT) | exists |
| `submit(id)` | `POST /errands/:id/submit` | — | 201 `{ errand, history }` (REQUESTED) | exists |
| `cancelDraft(id)` | `PATCH /errands/:id/status` | `{ to: 'CANCELLED' }` | 200 `{ errand, history }` (DRAFT → CANCELLED, OA-9). The optional `Idempotency-Key` header is not sent | exists |

Other reads, each in the service of the view that uses it: `GET /customers/me/addresses` (ND, `CustomerAddressesApi` in `app-area/customer/data/addresses.api.ts`) and `GET /notifications/unread-count` (H, `NotificationsCountApi` in `app-area/customer/data/notifications.api.ts`; #11 may move it).

`ErrandView` fields the #7 views read: `id`, `category`, `title | null`, `reference | null`, `status`, `createdAt`, `updatedAt`, `assignment: { runner: { shortName: string \| null } \| null } \| null`. Unknown `status` strings → the errand is dropped from the list (`parseErrandStatus`, K§4.2.5). Unknown `category` → title fallback renders nothing (K§5.4).

Error helper `apiErrorOf(err: HttpErrorResponse): { status: number; code: string | null; message: string | null; pointType?: string }` (API body `{ statusCode, code, message, ...extra }`, F§3; `message` may be an array from class-validator: take the first string). Codes the wizard handles: `location_outside_service_area` (422, `pointType`), `deadline_in_past`, `budget_required`, `budget_not_applicable`, `locations_pickup_dropoff_required` (400). Network failure = status 0 (`friendlyError`, K§4.7).

## §W6 Configuration

`environment.quotePreviewEnabled: false` (committed; port of `AppConfig.quotePreviewEnabled`, row 47). Only the owner's go-ahead on pricing rates turns it on (NR). Add it to the `Environment` interface and to `environment.local.example.ts` next to `mapsApiKey`; no other environment change.

## §W7 Places configuration (owner WQ-25, WQ-26, 2026-10-28)

Decided: Places autocomplete on the web uses the **browser Maps JavaScript API** with the WQ-1 browser key (`environment.mapsApiKey`, with **Places API (New)** enabled on that key), **session tokens**, a **300 ms debounce** and a **per-session cache**, limited to **Kenya**. **Without a key** it falls back to the customer's **saved addresses**. **No API proxy** (no Places endpoint is added to `apps/api`). Google's attribution is shown under the suggestion list (WQ-26). Details in ND§Places. The `PLACE_SEARCH` token, `GooglePlaceSearch` and `SavedPlaceSearch` live in `apps/website/src/app/shared/places/` (#12 `x-address-form` reuses them). Places is loaded through the kit `MapsLoaderService` with the `importLibrary` addition (§W9a); the loader is imported from `shared/map/maps-loader.service`, never from the `shared/map` barrel (which also exports the live map).

## §W8 Orphan DRAFT cleanup

When the wizard is left (discard, any leave the guard allows) with `createdErrandId !== null && !submitted`, call `cancelDraft(id)` best effort (errors ignored, no UI), then `reset()`. Port of `CategoryScreen.dispose`. Not on tab close (no reliable request then; the DRAFT is never listed, `_shared.md` §6).

## §W9a Kit additions made by #7 (one list; no new colour, no new type style)

Each is additive: #5 and #6 defaults and tests stay unchanged. Each is a port of a named Flutter style or helper, or a seam the WQ-33 rules require.

| Addition | Where | Value | Used by |
|---|---|---|---|
| `nm-icon` entries | `shared/ui/icon/icons.ts` | `search`, `notifications`, `shopping-bag`, `local-shipping`, `fact-check`, `hourglass`, `bookmark`, `close`, `add`, `remove` (Material paths, same Apache-2.0 header). **Reused, not added:** `location` (place), `person` (avatar fallback), `arrow-back` | Home, wizard |
| `nm-back-button` input `disabled` | `shared/ui/back-button` | `disabled` attribute + `aria-disabled="true"`; no `back` emission, no navigation; slate-400 arrow | NR submitting |
| `nm-pushed-header` input `backDisabled` | `shared/ui/pushed-header` | passes to `nm-back-button` `disabled` | wizard frame |
| `nm-field` inputs `leadingIcon`, `busy`, combobox attributes | `shared/ui/field` | `leadingIcon`: an `NmIconName`, 18px slate-600, input left padding 40px. `busy`: 16px 2px-stroke spinner at the right (`aria-hidden`), `aria-busy="true"` on the input, still under reduced motion (no spin). `role`, `ariaAutocomplete`, `ariaExpanded`, `ariaControls`, `ariaActivedescendant`: bound to the native input as `role`, `aria-autocomplete`, `aria-expanded`, `aria-controls`, `aria-activedescendant` (`null` = absent). `NitumeField.prefixIcon` / `suffixIcon` | `nm-place-field` |
| `nmFieldValue` writes later input changes | `shared/ui/field/field-value.directive.ts` | Today it writes only the initial value. Add `ngOnChanges`: when `nmFieldValue` changes after init **and** differs from the last value the control emitted, call `writeValue`. Typing still round-trips without a write (no caret jump) | place field text after a pick, category switch reset |
| `MapsLoaderService.importLibrary(name)` | `shared/map/maps-loader.service.ts` | `async importLibrary(name: 'places'): Promise<unknown \| null>`: `await load()`; `null` when unavailable; else `google.maps.importLibrary(name)` (a rejection → `null` and state stays as it is). `load()` itself is unchanged (still imports `maps` and `marker` only) | `GooglePlaceSearch` |
| `RealtimeService.onStateChange(listener, destroyRef): () => void` | `core/realtime/realtime.service.ts` | Public wrapper over the private `stateListeners` set used by `showReconnecting`; removes itself on `destroyRef` or when the returned function is called. Lets views react to `state` without `effect()` or `toObservable` (§W10) | Home reload on reconnect |
| `formatHours(seconds)` + `FormatHoursPipe` | `shared/format/formatters.ts`, `format.pipes.ts` | Port of `display.dart formatHours`: whole hours → `1 hour` / `24 hours`; else `formatDurationMin` | ND caption |
| `initialsFor(name)` | `shared/format/formatters.ts` | Up to two upper-case initials from the first two words (`InitialsAvatar.initialsFor`) | `nm-avatar` |
| WQ-33 conversions in kit files the #7 routes reach | `shared/ui/card/{card,section-label}.component.ts`, `shared/ui/overlay/dialog.component.ts` | Replace `NgTemplateOutlet` with the #6 `nmTemplateOutlet` and the dialog's `viewChild` queries with an `ElementRef` lookup (`host.querySelector`) done in the same lifecycle hook, rendered markup and behaviour unchanged; the #5 tests for these files pass unchanged (precedent: #6 re-audit 2 ruling (c)) | §W10 |

Type styles: **none added.** Text that sits between named styles uses the `nm-type` overrides the mixin already offers (`_tokens.scss` comment: "Optional overrides exist for the few Flutter widgets whose text sits between two named styles"):

| Flutter style | Web |
|---|---|
| `CategoryTile` label (11.5/600 blue, lh 1.3) | `nm-type(row-title, 11.5px)` + `line-height: 1.3` |
| `TaskRow` title (13/600 blue) | `nm-type(row-title, 13px)` |
| `ReceiptRow` label (13/400 blue; total 700) | `nm-type(body, 13px)` (+ `font-weight: 700` on the total) |
| `ReceiptRow` amount (Code 13 blue; total 700) | `<span nmNum>` (family only) inside the row, which inherits 13px, the weight and blue |
| `ReceiptCaption`, `FlexibleDeadlineCaption` (12/400 slate-600) | `nm-type(greeting)` (identical values, #6) |
| `_QuantityStepper` value (Code 13/600 blue) | `<span nmNum>` inside a `nm-type(row-title, 13px)` box |
| `ActiveTaskCard` title (15.5/600 **white**) | `nm-type(card-title, $color: white)` |
| `ActiveTaskCard` meta (Code 12 slate-400 on blue) | `nm-type(num-meta-lg, $color: slate-400)` (a `num-*` mixin, allowed by F9.49) |
| `InitialsAvatar` initials (Sans 700 white, 13/20/24) | `nm-type(button-sm, 13px, 700, white)` / `20px` / `24px` |

If a later look at the #6 code finds one of these already present under another name, reuse it instead of adding a second.

## §W9b New shared components built by #7 (one list; built once, reused by the named issues)

| Component | Folder (`shared/ui/…`) | Flutter | Reused by |
|---|---|---|---|
| `nm-wizard-frame` | `wizard-frame/` | wizard scaffold | — |
| `nm-stepper` | `stepper/` | `StepProgressBar` (C-14) | — |
| `nm-fixed-cta` | `fixed-cta/` | `FixedCta` | #8 (x-awaiting-quote, v-payment) |
| `nm-category-tile`, `nm-category-grid` | `category/` | `CategoryTile` (C-15) | Home (H) |
| `nm-choice-chip` (+ group behaviour) | `choice-chip/` | `NitumeChoiceChip` (C-16) | **#8** deadline panel |
| `nm-receipt-row`, `nm-receipt-caption`, `nm-receipt-group` | `receipt/` | `ReceiptRow`, `ReceiptCaption` (C-18 parts) | **#8** quote / payment, #9/#10 receipt card |
| `nm-notification-bell` | `notification-bell/` | `NotificationBell` (C-11) | **#11** (notifications), runner top bars (#14–#18) |
| `nm-avatar` | `avatar/` | `InitialsAvatar` (C-12) | **#10** rating, **#11**, **#12** profile |
| `nm-search-entry` | `search-entry/` | `SearchEntryRow` (C-34) | — |
| `nm-active-task-card` | `active-task-card/` | `ActiveTaskCard` (C-20) | #9 if needed |
| `nm-task-row` | `task-row/` | `TaskRow` (C-22) | **#11** History |
| `nm-place-field` | `place-field/` | `PlaceAutocompleteField` | **#12** `x-address-form` |
| `nm-shopping-list` | `shopping-list/` | `ShoppingListEditor` (C-37) | — |

All standalone, `OnPush`, signal inputs, `nm-` prefix, styles in a `styleUrl` `.scss` file whenever they use a token mixin (F9.60), colours only through `--nitume-*`, focus ring through `nm-focus-ring`, hover through `nm-hover`. View-only code (pages, store, guards, API services, links) lives under `app-area/customer/` (`home/`, `new-task/`, `data/`, `customer-links.ts`).

## §W10 Bundle and framework rules for #7 code (owner WQ-34 and WQ-33, 2026-10-29)

"#7 code" = every file #7 adds or changes, **plus every kit file a #7 route component reaches through static imports** (esbuild keeps framework code used by any lazy chunk in the shared Angular modules that the marketing `main` loads; #6 gap report, re-audit 2 note). Marketing code is not touched by #7.

1. **Size (WQ-34, hard cap).** `cd apps/website && npx ng build` "Initial total" ≤ **360.00 kB raw**. The PR body reports the figure (raw and transfer) next to the #6 figure (351.44 kB raw). Crossing the cap is not fixed by raising it: it goes to the owner.
2. **Eager graph.** Nothing from `core/auth/**`, `core/realtime/**`, `app-area/**`, `shared/ui/**` or the new `shared/places/**` is statically reachable from `src/main.ts` (the #6 F9.50 walker, with `shared/places` added to its forbidden pattern). The #7 routes are reached only through `loadComponent` / `loadChildren`.
3. **Framework features.** #7 code uses none of: `effect()`, `afterNextRender` / `afterRender`, `viewChild` / `viewChildren` / `contentChild(ren)`, `NgTemplateOutlet` / `[ngTemplateOutlet]`, `ReactiveFormsModule` / `FormControl` / `FormGroup`, `FormsModule` / `ngModel`, `toObservable`, `withComponentInputBinding` (also: `app.config.ts` keeps not registering it). Allowed replacements, all already in the code base: signals and `computed`; `linkedSignal`; `toSignal` (used by #6); `nmTemplateOutlet`; `nmFieldValue`; `ElementRef` + `querySelector` in `ngAfterViewInit` for focus; `RealtimeService.onStateChange` (§W9a); host listeners for `window:beforeunload` and `document:visibilitychange`; route snapshot reads (`ActivatedRoute.snapshot`, never router-bound inputs).
4. **Imports.** Kit pieces are imported from their own files (`shared/ui/<x>/<x>.component`, `shared/ui/overlay/dialog.service`, `shared/map/maps-loader.service`), never from the `shared/ui` or `shared/map` barrels, so the live map (`@angular/google-maps`, `effect()`) and the panel never enter a #7 chunk. `@angular/google-maps` is not imported by #7.
5. **Style files.** No `@use`, `@include`, `@mixin` or `$` variable in inline `styles` (F9.60); token mixins only in `styleUrl` `.scss` files.

## §W9 Required tests (Vitest), foundation
1. Routes: `new` is a componentless parent with `providers` containing `TaskDraftStore`, `canActivate: [wizardEntryGuard]`, data `navKey: 'new'`, `pushed: true`; its three children carry the `title` strings `New task · Nitume`, `Task details · Nitume`, `Review · Nitume` (read through Angular's default `TitleStrategy` after navigation), and the guards of §W1. `home` has `Home · Nitume`, no `stubLabel`, and loads the Home view, not `ViewStubComponent`.
2. `wizardStepGuard`: step 2 without a category → step 1; step 3 without `detailsValidated` → step 1 (no category) or step 2; after `submitted` both redirect to `openerUrl`.
3. `wizardEntryGuard`: from `/app/customer/home` → `new` resets the store and records `openerUrl` = `/app/customer/home`; `new` from step 2 keeps the draft and ignores `?category`; a direct load with no previous navigation records `/app/customer/home`; `?category=business` → `UrlTree` without the parameter.
4. `changeCategory`: inspection→representation keeps `first`; inspection→pickup_delivery clears `first`; pickup_delivery→buy_for_me keeps `first` and clears `dropoff`; items reset to one empty row; budget kept buy↔get, cleared get→inspection; title and description kept; same category is a no-op.
5. `hasData` true for each single field (title, description, first, dropoff, a named item, budget > 0) and false for whitespace-only text, an unnamed item and budget 0.
6. `locationRefused` true only while `first`/`dropoff` are the identical refused objects; any new pick makes it false.
7. `wizardLeaveGuard`: no data → allowed; data → confirm; confirm `true` → reset + allowed; `false` → blocked; `submitted` → allowed; `submitting()` → blocked without a dialog; navigation between two wizard steps → allowed without a dialog.
8. `beforeunload` (dispatched on `window`) is prevented only while `hasData && !submitted`, and no handler remains after the frame is destroyed.
9. `finish()` empties the draft, keeps `submitted` and `openerUrl`; a later `start()` clears both.
10. Orphan DRAFT: leaving with `createdErrandId` and not submitted sends `PATCH /errands/:id/status { to: 'CANCELLED' }` once; a failure is swallowed.
11. `customerLinks` returns exactly the §W1 paths (`payment(id)` → `/app/customer/tasks/<id>/payment`, ids URL-encoded), and every returned path is recognised by the customer route tree (`router.navigateByUrl` with stub guards resolves to a route, never the `/app/**` redirect); the five #7 stub routes use `ViewStubComponent` with `pushed: true`, `navKey: 'home'`.
12. `nm-stepper` segment classes for completed 1/2/3 and `aria-label`.
13. `nm-wizard-frame`: header counter in `nmNum`; `backDisabled` gives the back button `disabled` + `aria-disabled` and no navigation; the column class caps at 640px from 768px (declared `@media (min-width: 768px)` rule, read with the #6 `declared()` helper); `back` re-emitted.
14. `nm-fixed-cta`: below 768px fixed with the slate token, `8px 20px 6px` padding and the safe-area inset; from 768px inline (declared rules); `above` slot 10px above the button; toast offset equals the bar height below 768px and 0 from 768px (stubbed `matchMedia`).
15. `CustomerErrandsApi`: exact URLs, query (`status=REQUESTED,QUOTED,…`), bodies, no `withCredentials`; `apiErrorOf` reads `code`, `pointType`, string and array `message`, status 0.
16. Kit additions (§W9a): new `nm-icon` names resolve and `place` does not exist; `nm-back-button` `disabled`; `nm-field` `leadingIcon` / `busy` / combobox attributes (absent by default); `nmFieldValue` writes a changed input after init and does not write back a value the control just emitted; `MapsLoaderService.importLibrary` → `null` without a key and without loading a script, and calls `google.maps.importLibrary('places')` with one; `RealtimeService.onStateChange` fires on each transition and stops after destroy; `formatHours`; `initialsFor` (`Achieng Wanjiru` → `AW`, `brian` → `B`, blank → empty); the converted `nm-card`, `nm-section-label` and `nm-dialog` pass their #5 tests unchanged.
17. Static (§W10, new `src/styles/customer-static.spec.ts`): (a) no hex / `rgb(a)` / `hsl(a)` / named colour / `box-shadow` / marketing variable in #7 code (the #6 F9.48 patterns), the one Google attribution asset excepted by exact path (ND§Places); (b) no `font-family` / Fira literal (F9.49); (c) the framework-feature list of §W10 item 3 finds nothing in #7 code (the files #7 adds, plus `shared/ui/{card,overlay/dialog.component.ts}` and every other kit file the #7 route components import); (d) no import from the `shared/ui` or `shared/map` barrel (`/shared\/(ui|map)['"]/` and `/shared\/(ui|map)\/index/`) in #7 code; (e) the F9.50 eager-graph walker, with `shared/places` added to the forbidden pattern, still reports nothing, and a walker check proves an injected static import of `shared/places/place-search.ts` into `app.routes.ts` is reported; (f) no bare `outline: none`.
18. Build (§W10 item 1): not a Vitest case; the PR body pastes `npx ng build` "Initial total" ≤ 360.00 kB raw and the auditor re-runs it with `--stats-json` (G7 build item).
