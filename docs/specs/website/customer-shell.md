# customer `shell` (web): signed-in frame and navigation

- Route: `/app/customer` (`authGuard`, `roleGuard('customer')`, `hasNameGuard`), lazy chunk `customer.routes.ts`. Shared rules: `auth-foundation.md` (F§n), especially F§2 (routes), F§7.3 (nav layout). Kit: `ui-kit.md` (K§n).
- Sources: `docs/specs/customer/_shared.md` §1 (navigation model), §5, §10; C-13 `NitumeTabBar` (`packages/nitume_core/lib/src/widgets/nitume_tab_bar.dart`); Flutter `apps/customer_app/lib/src/screens/shell/home_shell.dart`, `services/shell_controller.dart`; mockup `nitume_customer_app.html` lines 128–131 (`.tabbar`, `.tab`), 307–315, 551–552; OA-21; WQ-3.
- Implementation: none. Status: **missing**.

## Purpose
The signed-in customer area: hosts the four root views and the New task entry, the pushed views of #7–#12, the realtime connection and the toast host (the toast host sits one level up in `AppAreaComponent`, F§7.3).

## Entry / exit
- Entry: any destination from F§6.2 for a customer with a name; any deep link under `/app/customer/` once the guards pass.
- Exit: `Log out` on Profile (#12) → `signOut('user', 'customer')`; session expiry / suspension → interceptor sign-out (F§5); a runner session landing here → `roleGuard` sends it to `/app/runner/jobs`.

## Task states
The shell shows none itself. Views inside it show §3.3 states through the kit's `customerStatus()` (K§4.2.3).

## Navigation items (exact labels, order and targets)
| # | Label | Icon (inactive / active) | Target | Kind | Active when |
|---|---|---|---|---|---|
| 1 | `Home` | `home` / `home-filled` | `/app/customer/home` | root view (#7 `v-home`) | `navKey: 'home'` |
| 2 | `New task` | `add-circle` / `add-circle` (the app has no filled variant) | `/app/customer/new` | **not a root view**: opens the wizard (#7 `v-new-category`), a pushed flow | from 768px: `navKey: 'new'` on the wizard routes; below 768px the bar is hidden there |
| 3 | `Track` | `location` / `location-filled` | `/app/customer/track` | root view (#9 `v-track`); `/app/customer/track/:errandId` selects an errand (OA-21: after payment, Home card, notification) | `navKey: 'track'` |
| 4 | `History` | `history` / `history` | `/app/customer/history` | root view (#11) | `navKey: 'history'` |
| 5 | `Profile` | `person` / `person-filled` | `/app/customer/profile` | root view (#12) | `navKey: 'profile'` |

- Pushed customer views (#8–#12: `x-awaiting-quote`, `v-payment`, `x-merchant-payment`, `v-task-detail`, `v-evidence-confirm`, `x-evidence-viewer`, `v-rate`, `x-report-problem`, `v-notifications`, `v-addresses`, `x-address-form`, `v-payment-methods`, `x-payment-method-form`) set `data.pushed: true` and the `navKey` of the root they come from (later view specs say which). `v-price-auth` is a dialog (K§4.8), not a route.
- The mockup's `v-new-tab-placeholder` is not ported (`_shared.md` §1). The mockup's `jump(id, true)` landing on Home after payment is a mockup bug; payment success goes to Track (OA-21, #8).

## Layout
`nm-app-shell` (F§7.3) with the five items, no wordmark suffix, home link `/app/customer/home`.
- Below 768px: routed view full width on slate, bottom bar C-13 (white, slate-line top hairline, 52px items, icon 21, label 10/700, inactive slate-400, active green-700 + filled icon, safe-area padding); hidden on pushed routes.
- From 768px: 220px white side nav (wordmark, then the five items, 48px rows, label 14.5/600, inactive slate-600, active green-700 + filled icon, hover slate fill); content column max 1180px, padding 24px. Pushed routes keep the side nav visible (WQ-15, owner 2026-10-28). The side nav is white (WQ-16, owner 2026-10-28).
- Views own their top bar (`nm-top-bar`, F§7.2) or pushed header.
- Until #7, #9, #11, #12 land, the four roots and `new` load `ViewStubComponent` (F§2).

## Components
| Element | Component | Status |
|---|---|---|
| Frame, skip link, `<main>` | `nm-app-shell` | NEW (#6) |
| Bottom bar / side nav | `nm-app-nav` | NEW (#6) |
| Icons | `nm-icon` | NEW (#6) |
| Wordmark (side nav) | `nm-wordmark` with `href` | NEW (#6) |
| Toasts | `nm-toast-host` (in `AppAreaComponent`) | kit |

## Copy (exact)
- Nav labels: `Home`, `New task`, `Track`, `History`, `Profile` (`_shared.md` §1, built `HomeShell.items`).
- Skip link: `Skip to content` (**proposed**).
- Nav landmark label: `Main` (**proposed**).

## States
| State | Behaviour |
|---|---|
| Arrive after sign-in | `RealtimeService.connect()` once (K§6.2); the first route view loads its own snapshot |
| Realtime reconnecting | Handled by the service and views (`Reconnecting…` on `v-track`, K§6.6); the shell shows nothing |
| Session expires / suspended | Interceptor sign-out (any authenticated call can answer `account_suspended`, PR #25), a refresh failure seen by the socket token provider (F§4.2), or the socket `connect_error` `account_suspended` (F§5 item 8): full reload to the sign-in screen with the toast (F§4.5) |
| Another tab signs out | This tab reloads to `/app/customer/sign-in` (F§4.5) |
| Loading, empty, error | Per view; the shell has none of its own (restore is handled before the shell renders, F§6) |

App-level behaviour that belongs to later issues and must be mounted in this shell, not per view:
- `price_change:requested` listener and the "on resume" check for a pending price change (`home_shell.dart` `_onLivePrice`, `_checkPendingPriceChange`): built by #8 (`v-price-auth`). On the web, "app resumed" = `document.visibilitychange` to `visible`. #6 adds nothing for it.

Web difference: the app keeps each root tab alive (`IndexedStack`); the web re-creates a root view when its route is opened, and the view reloads its snapshot (REST first, socket for changes, K§6.5). No tab state is cached in #6.

## Numeric fields (Fira Code)
None in the shell.

## Data
- No REST call of its own. `RealtimeService.connect()` / `disconnect()` with `REALTIME_TOKEN_PROVIDER = () => session.freshAccessToken()` and `REALTIME_ACCOUNT_SUSPENDED` → `signOut('suspended')` (F§5 items 7–8). The token provider refreshes through `POST /api/v1/auth/web/refresh`.
- Socket events are subscribed by the views (K§6.4), not by the shell, except the #8 price-change listener above.

## Accessibility and responsive
- One `<nav aria-label="Main">` whose layout switches at 768px by CSS; items are links in a list, active item `aria-current="page"`; icons `aria-hidden`; labels always visible (no icon-only state at any width).
- Every item ≥ 48×48px; visible focus ring; `Skip to content` is the first focusable element and moves focus to `<main id="content">`.
- Bottom bar respects `env(safe-area-inset-bottom)`; `<main>` padding keeps content clear of it.
- No horizontal scroll from 360px (five 68px columns at 360px; labels ellipsise).
- Page titles per F§2.

## Required tests (Vitest)
1. Renders five nav links with the exact labels, order and `href`s.
2. Active item: on `/app/customer/history` the History link has `aria-current="page"`, the active colour class (green-700 token) and the filled icon; the others have the inactive class.
3. New task links to `/app/customer/new`; on a `new/**` route it is the active item from 768px.
4. `track/:errandId` keeps Track active.
5. Below 768px (stubbed `matchMedia`) the nav has the bottom-bar class; from 768px the side-nav class with the wordmark linking to `/app/customer/home`.
6. A route with `data.pushed: true` hides the bottom bar below 768px and keeps the side nav from 768px with the parent item active.
7. `Skip to content` is first in tab order and moves focus to `<main>`.
8. `RealtimeService.connect()` is called once when the shell first renders, not again on tab changes.
9. Guards: a runner session on `/app/customer/home` ends on `/app/runner/jobs`; a nameless customer ends on `/app/customer/name`; signed out ends on `/app/customer/sign-in?returnUrl=%2Fapp%2Fcustomer%2Fhome`.
10. Token use: nav colours come from `--nitume-white`, `--nitume-slate-line`, `--nitume-slate-400`, `--nitume-slate-600`, `--nitume-green-700` only.
11. Stub routes render the label `h1` and nothing else.

## Current vs design
No signed-in area exists on the website. Marketing header/footer wrap every route today (`app.component.ts`); F§1 moves them to a marketing layout so `/app` has its own frame.

## Questions
- WQ-15 (pushed screens keep the side nav from 768px) and WQ-16 (white side nav) answered by the owner on 2026-10-28 (F§11; numbered WQ-12 and WQ-13 in the first version of this spec). Nothing open for this view.
