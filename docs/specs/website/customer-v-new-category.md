# customer `v-new-category` (web): new task, step 1 (category) + wizard foundation

- Issue: GitHub #7, "[Website] Customer: home and create-task wizard". Builder: `web-parity`. Branch: `feat/website-customer-create-task` (stacked on `feat/website-auth-shell`, #6).
- Route: `/app/customer/new` inside `CustomerShell` (`authGuard`, `roleGuard('customer')`, `hasNameGuard`, F§2). Shared rules: `auth-foundation.md` (F§n), `customer-shell.md`. Kit: `ui-kit.md` (K§n). Sibling specs: `customer-v-home.md` (H§n), `customer-v-new-details.md` (ND§n), `customer-v-new-review.md` (NR§n).
- Sources: mobile spec `docs/specs/customer/v-new-category.md` (matches-design); Flutter `apps/customer_app/lib/src/screens/wizard/{category_screen,task_draft}.dart`, `packages/nitume_core/lib/src/widgets/{category_tile,step_progress_bar}.dart`; mockup `docs/design/nitume_customer_app.html` lines 56–60, 86–88, 343–359; owner answers OA-1, OA-9, OA-18, row 1; WQ-3, WQ-15, WQ-16.
- **This file also holds the wizard foundation (§W1–§W8)** that the three wizard steps share. The details and review specs cite it as NC§W*n*. Nothing in it redefines the kit or the #6 shell; it adds wizard-only pieces.
- There is no web mockup. **(web adaptation)** marks layout or browser behaviour the app does not have; it never changes content, copy, tokens or flow. **(proposed)** marks copy the mobile spec already marks as proposed (built and accepted in the app).
- Implementation: none (`/app/customer/new` is a #6 `ViewStubComponent`). Status: **missing**.

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
3. Sticky CTA `Continue →` (§W4).

Responsive (web adaptation): the grid stays **3 columns at every width** (parity; the 3 + 2 layout with the empty cell is the tested rule). Below 768px the tiles are ~100px wide at 360px and labels wrap to 2 lines; from 768px the wizard column is max 640px, so tiles are at most ~207px wide. No horizontal scroll at 360px.

## Components

| Element | Component | Status |
|---|---|---|
| Frame: pushed header + stepper + body + sticky CTA | `nm-wizard-frame` (§W4) wrapping `nm-pushed-header` (F§7.2) | **NEW (#7)**; header from #6 |
| Stepper | `nm-stepper` (C-14) | **NEW (#7)** |
| Section label | `nm-section-label` | kit |
| Category tile + grid | `nm-category-tile`, `nm-category-grid` (C-15) | **NEW (#7)** (the kit leaves the tile to #7, K§3); also used by Home (H) |
| Continue | `nm-button` primary, `expand`, `type="button"` | kit |
| Discard confirm | `NmDialogService.confirm()` (C-35) | kit |
| Category icons | `nm-icon` | #6; **#7 adds** registry entries (§Components, icons) |

`nm-category-tile` (port of `CategoryTile`; design values from the mockup `.cat-tile` and the mobile spec):
- White fill, 1px `--nitume-slate-line` border, radius `--nitume-r-m` (14px), padding 14px 10px, content centred, min-height 48px.
- Icon box 32×32px, radius `--nitume-r-s` (8px; mockup 9), `--nitume-green-050` fill, `nm-icon` 16px in **`--nitume-blue`** (mobile spec "icon 16 blue"; the built Flutter tile uses green-700, which the kit's token table does not allow for icons, see Current vs design), 8px below it the label.
- Label: new type style `tile-label` (Sans 11.5 / 600 blue, line-height 1.3), centred, up to 2 lines, full display name from `categoryName` (K§5.4).
- Selected (only on this screen): border 1px `--nitume-green` plus a 2px inset `--nitume-green-050` ring (mockup `.cat-tile.sel` `box-shadow:0 0 0 2px var(--green-050) inset` → implemented as an inset `outline`/second border, **not** `box-shadow`, K§2.1). Green here is a checked state, which the design system allows.
- Hover (web adaptation): border `--nitume-blue` (same rule as the clickable card, K§4.4); selected tiles keep the green border. Focus: `nm-focus-ring`.
- Modes: `selectable` (this screen: a radio, see Accessibility) or `link` (Home: an `<a>` to `/app/customer/new?category=…`, never selected).

`nm-category-grid`: inputs `categories` (default `CUSTOMER_MVP_CATEGORIES`, K§5.4), `selected` (wire value or null), `mode: 'select' | 'link'`; output `selectedChange`. CSS grid `repeat(3, minmax(0, 1fr))`, gap 10px; the fifth tile sits in column 2 of row 2 and column 3 stays empty.

Icons (`nm-icon` registry additions, Material Symbols outlined, same licence note as #6): `shopping-bag` (Buy For Me), `local-shipping` (Get It For Me), `fact-check` (Check It For Me), `place` (Go There For Me; also the location fields, ND), `hourglass` (Wait For Me). Mapping lives in one function `categoryIcon(wire)` next to `categoryName` (Flutter `categoryIcon`). Business Tasks has `business-center` in Flutter but is never rendered to customers; do not add it.

## Copy (exact)
- Header title: `New task`; counter `Step 1 of 3`.
- Section label: `What do you need done?`
- Tiles (OA-1, canonical order): `Buy For Me`, `Get It For Me`, `Check It For Me`, `Go There For Me`, `Wait For Me`. **No `Business Tasks` tile** (OA-18).
- CTA: `Continue →`
- Discard dialog (proposed, built in the app): title `Discard this task?`, body `What you've entered so far will be lost.`, confirm `Discard` (outline, red label: `destructive: true`, the Flutter default), cancel `Keep editing` (primary).
- Document title: `New task · Nitume`.

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
1. Renders `New task`, `Step 1 of 3` (counter inside an `nmNum` element), the section label and exactly five tiles in canonical order with the exact names; no `Business Tasks`; the sixth grid cell is empty (no element).
2. Stepper: segment 1 has the done class (`--nitume-green`), segments 2–3 the empty class (`--nitume-slate-line`).
3. Nothing selected → `Continue →` disabled; selecting a tile enables it.
4. `?category=inspection` preselects `Check It For Me`; `?category=business` and `?category=foo` select nothing and the query is removed with `replaceUrl`.
5. Radio semantics: `role="radiogroup"`, one `aria-checked="true"`, arrow keys move and select, Space selects.
6. Selected tile uses the green border + inset ring classes and no `box-shadow`; unselected uses slate-line.
7. Icon colour token is `--nitume-blue` and the icon box `--nitume-green-050`.
8. `Continue →` navigates to `/app/customer/new/details` and the store holds the category.
9. Back with an empty draft leaves without a dialog; with data shows the dialog with the exact copy and button order (Discard outline red first, Keep editing primary second); Discard leaves and resets; Keep editing stays.
10. Grid in link mode (Home) renders `<a>` elements to `/app/customer/new?category=<wire>` and never a selected state.
Foundation tests: §W9.

## Current vs design
No wizard on the website; `/app/customer/new` is a #6 stub. Flutter drift noted for flutter-customer (not blocking the web): the built tile icon is green-700 and the selected ring 3px; the mobile spec says blue icon and a 2px ring. The web follows the spec and the kit token rules.

## Questions
None new. Carried mobile defaults (build as written): Q2 canonical order, no preselection from the nav; Q3 icons instead of the mockup emoji.

---

# Wizard foundation (shared by steps 1–3)

## §W1 Routes

Under the customer shell (F§2 `new/…`), lazy, each with `data { role: 'customer', navKey: 'new', pushed: true, title }`:

| Path | View | Title (document title `<title> · Nitume`) | Guards |
|---|---|---|---|
| `new` | `v-new-category` | `New task` | `canDeactivate: wizardLeaveGuard` |
| `new/details` | `v-new-details` | `Task details` | `canActivate: wizardStepGuard(2)`, `canDeactivate: wizardLeaveGuard` |
| `new/review` | `v-new-review` | `Review` | `canActivate: wizardStepGuard(3)`, `canDeactivate: wizardLeaveGuard` |

`pushed: true` hides the bottom bar below 768px; from 768px the white side nav stays with `New task` active (WQ-15, WQ-16, `customer-shell.md`).

Links to views owned by later issues go through one helper so the paths live in one place: `customerLinks` in `apps/website/src/app/features/customer/customer-links.ts` (**NEW (#7)**, proposed paths; the owning issue may move them by editing this file only):

| Function | Path | View (issue) |
|---|---|---|
| `home()` | `/app/customer/home` | v-home (#7) |
| `newTask(category?)` | `/app/customer/new` (+ `?category=<wire>`) | wizard (#7) |
| `awaitingQuote(id)` | `/app/customer/tasks/:id/quote` | x-awaiting-quote (#8) |
| `payment(id)` | `/app/customer/tasks/:id/pay` | v-payment (#8) |
| `track(id?)` | `/app/customer/track` / `/app/customer/track/:id` | v-track (#9, path from F§2) |
| `taskDetail(id)` | `/app/customer/tasks/:id` | v-task-detail (#9) |
| `evidence(id)` | `/app/customer/tasks/:id/evidence` | v-evidence-confirm (#10) |
| `notifications()` | `/app/customer/notifications` | v-notifications (#11) |
| `profile()` | `/app/customer/profile` | v-profile (#12, F§2) |

#7 declares the not-yet-built paths with the #6 `ViewStubComponent` (`pushed: true`, `navKey` of the parent root) so links from Home and the wizard resolve; each later issue replaces its stub.

## §W2 `TaskDraftStore` (port of `TaskDraft`)

File `apps/website/src/app/features/customer/new-task/task-draft.store.ts`, provided once in the customer route tree (one wizard at a time, like the app's single pushed stack). Signals; **memory only** (no `localStorage` / `sessionStorage`; a reload loses the draft, as killing the app does).

```ts
type Wire = ErrandCategory;                       // kit category.ts
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

- **Fresh start**: navigating to `new` from a URL **outside** `/app/customer/new` calls `start(previousUrl, category from ?category)`. Navigating to `new` from inside the wizard (step 2 Back, or the `New task` nav item while on step 2/3) keeps the draft; a `?category` is then ignored.
- **Step guards** (`wizardStepGuard(n)`, functional `CanActivateFn`): step 2 needs `category`; step 3 needs `category` and `detailsValidated`. Otherwise redirect (`replaceUrl`) to: after a successful submit (`submitted`, kept by `finish()`) → `openerUrl`; else step 1. So a deep link or reload on step 2/3 lands on step 1 with an empty draft, and browser Back into the wizard after a submit returns to the screen that opened it (the app: "Back from `x-awaiting-quote` goes to the screen that opened the wizard").
- **Between steps**: forward with `router.navigate` (push); header Back = `history.back()` (the `nm-back-button` default, F§7.2) with fallback to the previous step URL. Values are kept both ways (mobile: Back keeps entered values).
- **Leaving the wizard** (`wizardLeaveGuard`, functional `CanDeactivateFn`, runs when the next URL is outside `/app/customer/new`): allowed at once when `submitted`, or when `!hasData`; otherwise `NmDialogService.confirm()` with the discard copy (§Copy). `true` → `reset()` (+ §W8) and leave; `false` → stay (the router restores the URL on browser Back). While a submit is in flight the guard returns `false` without a dialog (NR "back disabled"). Covers the header Back on step 1, browser Back, side-nav links, the wordmark and the bell/avatar of other views.
- **Tab close / reload** (web adaptation): while `hasData && !submitted`, a `beforeunload` listener calls `preventDefault()` so the browser shows its own leave prompt (no custom text is possible). Removed when the wizard is left.
- Step 1 header Back with data opens the same confirm **before** navigating (mobile `_back`), so the guard does not ask twice.

## §W4 Wizard frame layout (`nm-wizard-frame`, NEW #7)

One component for all three steps (no copied markup). Inputs: `title`, `step` (1–3), `backDisabled`; slots: body, CTA, optional `[nmWizardAbove]` content above the CTA.

Top to bottom:
1. `nm-pushed-header` (F§7.2): back button, title `pushed-title` (18/700, `h1`), right-aligned counter `Step n of 3` (Fira Code `num-meta`, 11 slate-600). Back disabled → `nm-back-button` `disabled` (no click, `aria-disabled`).
2. `nm-stepper` (C-14): `total` 3, `completed` n. Three equal segments, gap 6px, height 4px, radius pill; done `--nitume-green`, empty `--nitume-slate-line`; padding-bottom 16px. `role="img"` with `aria-label="Step n of 3"` (Flutter semantics `Step $completed of $total`).
3. Body (`<form novalidate>` on step 2; plain section otherwise).
4. Sticky CTA bar: `position: sticky; bottom: 0`, `--nitume-slate` background, padding `8px 0 6px` plus `env(safe-area-inset-bottom)` (mobile `FixedCta` `20 8 20 6`; the gutter comes from the column), containing one `nm-button` primary `expand`. The toast offset (K§4.10) is set to the bar height while a wizard step is shown.

Width and gutters:
- Below 768px: full width of the shell content column (gutter 20px from F§7.3); every element aligns to that gutter (mobile `margin 0 20` → no extra horizontal margin).
- From 768px (web adaptation): one column `max-width: 640px`, **centred** in the shell content column (side nav visible, WQ-15). The header, stepper, body and CTA share that column, so the CTA is never wider than the form.
- Short viewports: the body scrolls with the page; the sticky bar stays visible; the on-screen keyboard never covers the focused field (the page scrolls it into view).

## §W5 Customer errands API service

`CustomerErrandsApi` (`apps/website/src/app/features/customer/data/errands.api.ts`, **NEW (#7)**), `HttpClient` through the #6 interceptor (Bearer, refresh, `account_suspended` handling, F§5). Base `${environment.apiBaseUrl}/api/v1`.

| Method | HTTP | Request | Response (used fields) | Status |
|---|---|---|---|---|
| `list(statuses, limit)` | `GET /errands?status=A,B,…&limit=n` | comma-separated statuses (API accepts `A,B`; max 17), limit 1–100 | `{ items: ErrandView[], nextCursor: string \| null }`, newest **created** first | exists (`errands.controller.ts` `list`) |
| `defaults()` | `GET /errands/defaults` | — | `{ defaultDeadlineHours: number, defaultDeadlineStartsAt: 'payment_confirmed' }` | exists |
| `create(body)` | `POST /errands` | `CreateErrandBody` (ND§Data) | 201 `{ errand: ErrandView, history }` (DRAFT) | exists |
| `submit(id)` | `POST /errands/:id/submit` | — | 201 `{ errand, history }` (REQUESTED) | exists |
| `cancelDraft(id)` | `PATCH /errands/:id/status` | `{ to: 'CANCELLED' }` | 200 `{ errand, history }` (DRAFT → CANCELLED, OA-9) | exists |

`ErrandView` fields the #7 views read: `id`, `category`, `title | null`, `reference | null`, `status`, `createdAt`, `updatedAt`, `assignment: { runner: { shortName: string \| null } \| null } \| null`. Unknown `status` strings → the errand is dropped from the list (K§4.2.5). Unknown `category` → title fallback renders nothing (K§5.4).

Error helper `apiErrorOf(err: HttpErrorResponse): { status: number; code: string | null; message: string | null; pointType?: string }` (API body `{ statusCode, code, message, ...extra }`, F§3; `message` may be an array from class-validator: take the first string). Codes the wizard handles: `location_outside_service_area` (422, `pointType`), `deadline_in_past`, `budget_required`, `budget_not_applicable`, `locations_pickup_dropoff_required` (400). Network failure = status 0 (`friendlyError`, K§4.7).

## §W6 Configuration

`environment.quotePreviewEnabled: false` (committed; port of `AppConfig.quotePreviewEnabled`, row 47). Only the owner's go-ahead on pricing rates turns it on (NR).

## §W7 Places configuration

ND§Places: `PLACE_SEARCH` injection token, Google implementation on the Maps JavaScript API `places` library loaded through the kit `MapsLoaderService` with `environment.mapsApiKey` (WQ-1), saved-address fallback without a key.

## §W8 Orphan DRAFT cleanup

When the wizard is left (discard, any leave the guard allows) with `createdErrandId !== null && !submitted`, call `cancelDraft(id)` best effort (errors ignored, no UI), then `reset()`. Port of `CategoryScreen.dispose`. Not on tab close (no reliable request then; the DRAFT is never listed, `_shared.md` §6).

## §W9a Kit additions made by #7 (one list; no new colour, no new component pattern)

Added in the kit files (`_tokens.scss`, `shared/ui/**`, `shared/format/**`) so later issues reuse them; each is a port of a named Flutter style or helper:

| Addition | Value | Flutter | Used by |
|---|---|---|---|
| type `tile-label` | Sans 11.5 / 600 blue, line-height 1.3 | `CategoryTile` label (`rowTitle` at 11.5) | category tile |
| type `row-title-sm` | Sans 13 / 600 blue | `TaskRow` title (`rowTitle` at 13) | Home recent rows |
| type `receipt` / `receipt-total` | Sans 13 / 400 and 13 / 700 blue | `ReceiptRow` label | review |
| type `num-receipt` / `num-receipt-total` | Code 13 / 400 and 13 / 700 blue | `ReceiptRow` amount | review |
| type `caption` | Sans 12 / 400 slate-600 | `ReceiptCaption`, `FlexibleDeadlineCaption` | review, details |
| type `num-qty` | Code 13 / 600 blue | `_QuantityStepper` value | shopping list |
| `nm-field` inputs `leadingIcon`, `busy`, combobox pass-through attributes | ND§`nm-place-field` | `NitumeField.prefixIcon`, `suffixIcon` | place field |
| `nm-icon` entries | `search`, `notifications`, `shopping-bag`, `local-shipping`, `fact-check`, `place`, `hourglass`, `bookmark`, `close`, `add`, `remove` | Material icons used by the Flutter widgets | Home, wizard |
| `formatHours(seconds)` + pipe | ND§Rules | `display.dart formatHours` | details |
| `initialsFor(name)` | up to two upper-case initials from the first two words | `InitialsAvatar.initialsFor` | Home avatar |

If the #6 build already provides one of these under another name, reuse it instead of adding a second.

## §W9 Required tests (Vitest), foundation
1. Routes: the three paths exist under the customer shell with `navKey: 'new'`, `pushed: true` and the titles `New task · Nitume`, `Task details · Nitume`, `Review · Nitume`.
2. `wizardStepGuard`: step 2 without a category → step 1; step 3 without `detailsValidated` → step 1 (no category) or step 2; after `submitted` both redirect to `openerUrl`.
3. Fresh start from outside (`/app/customer/home` → `new`) resets the store and records `openerUrl`; `new` from step 2 keeps the draft and ignores `?category`.
4. `changeCategory`: inspection→representation keeps `first`; inspection→pickup_delivery clears `first`; pickup_delivery→buy_for_me keeps `first` and clears `dropoff`; items reset to one empty row; budget kept buy↔get, cleared get→inspection; title and description kept; same category is a no-op.
5. `hasData` true for each single field (title, description, first, dropoff, a named item, budget > 0) and false for whitespace-only text, an unnamed item and budget 0.
6. `locationRefused` true only while `first`/`dropoff` are the identical refused objects; any new pick makes it false.
7. `wizardLeaveGuard`: no data → allowed; data → confirm; confirm `true` → reset + allowed; `false` → blocked; `submitted` → allowed; in-flight submit → blocked without a dialog.
8. `beforeunload` prevented only while `hasData && !submitted`.
9. `finish()` empties the draft, keeps `submitted` and `openerUrl`; a later `start()` clears both.
10. Orphan DRAFT: leaving with `createdErrandId` and not submitted sends `PATCH /errands/:id/status { to: 'CANCELLED' }` once; a failure is swallowed.
11. `customerLinks` returns the paths in §W1.
12. `nm-stepper` segment classes for completed 1/2/3 and `aria-label`.
13. `nm-wizard-frame`: header counter in `nmNum`; disabled back has `aria-disabled` and does not navigate; from 768px (stubbed `matchMedia`) the column class caps at 640px; the CTA bar is sticky and uses the slate token.
14. `CustomerErrandsApi`: exact URLs, query (`status=REQUESTED,QUOTED,…`), bodies; `apiErrorOf` reads `code`, `pointType`, string and array `message`, status 0.
15. Kit additions (§W9a): each new type mixin compiles with the listed family/size/weight/colour token; `initialsFor` (`Achieng Wanjiru` → `AW`, `brian` → `B`, blank → empty); new `nm-icon` names resolve.
16. Static: no raw hex / `box-shadow` in the new files (kit §12.1 check covers the folder).
