# runner `shell` (web): signed-in frame and navigation

- Route: `/app/runner` (`authGuard`, `roleGuard('runner')`, `hasNameGuard`), lazy chunk `runner.routes.ts`. Shared rules: `auth-foundation.md` (F§n), especially F§2, F§7.3. Kit: `ui-kit.md` (K§n).
- Built from the same `nm-app-shell` / `nm-app-nav` as `customer-shell.md`, configured with the runner items; no runner-specific markup.
- Sources: `docs/specs/runner/_shared.md` §1 (navigation model), §9 (verification gate), §10 (live data); C-13 `NitumeTabBar`; Flutter `apps/runner_app/lib/src/screens/shell/runner_shell.dart`; mockup `nitume_runner_app.html` (`.tabbar`, one tab bar); rows 113, 263, 273; WQ-3, WQ-6.
- Implementation: none. Status: **missing**.

## Purpose
The signed-in runner area: hosts the four root views (Jobs, Active, Earnings, Profile), `v-onboard-pending` and the pushed views of #13–#18, and the realtime connection (the server joins the runner to `runner:{runnerProfileId}:status` on connect, K§6.1).

## Entry / exit
- Entry: F§6.2 destination `shell` or `pending` for a runner with a name; deep links under `/app/runner/` once the guards pass. A runner whose verification is not complete still enters the shell (runner `_shared.md` §9: `v-jobs` shows the verification card, switch disabled); the gate is enforced by the API (RA-8) and by the #14 view, not by a route guard.
- Exit: `Log out` on Profile (#18) → `signOut('user', 'runner')`; expiry / suspension → interceptor sign-out (F§5); a customer session here → `roleGuard` sends it to `/app/customer/home`.

## Task states
None in the shell. Views use `runnerStatus()` (K§4.2.4).

## Navigation items (exact labels, order and targets)
| # | Label | Icon (inactive / active) | Target | View (issue) |
|---|---|---|---|---|
| 1 | `Jobs` | `work` / `work-filled` (mockup briefcase) | `/app/runner/jobs` | `v-jobs` (#14) |
| 2 | `Active` | `visibility` / `visibility-filled` (mockup eye) | `/app/runner/active` | `v-active` (#15) |
| 3 | `Earnings` | `add-circle` / `add-circle-filled` (mockup circle-plus) | `/app/runner/earnings` | `v-earnings` (#17) |
| 4 | `Profile` | `person` / `person-filled` | `/app/runner/profile` | `v-profile` (#18) |

- Pushed runner views set `data.pushed: true` and the parent `navKey`: `onboarding/pending` → `jobs` (also opened from Profile → `Verification documents`, then `profile`; #13 decides), `v-job-detail` → `jobs`, `v-evidence-capture` / `v-price-request` / `v-job-summary` → `active`, `v-payout` / `x-payout-history` → `earnings`, `v-notifications` → `jobs`, `v-edit-skills` → `profile` (final values in the #13–#18 specs).
- `onboarding/id` and `onboarding/selfie` are outside the shell (full page, no nav), F§2.
- Mockup bugs not ported (`_shared.md` §1): `jump(id, true)` always landing on Jobs; after `Accept job` the web goes to `/app/runner/active` with Active highlighted (#14).

## Layout
`nm-app-shell` (F§7.3) with the four items, `wordmarkSuffix="Runner"`, home link `/app/runner/jobs`.
- Below 768px: bottom bar C-13, four equal columns (90px each at 360px), inactive slate-400, active green-700 + filled icon; hidden on pushed routes.
- From 768px: 220px white side nav headed by `nm-wordmark` `Nitume Runner`, four 48px items (label 14.5/600, inactive slate-600, active green-700); content column max 1180px. Pushed routes keep the side nav (WQ-12).
- Until #14, #15, #17, #18 and #13 land, the roots and `onboarding/*` load `ViewStubComponent` (F§2).

## Components
Same as `customer-shell.md` (`nm-app-shell`, `nm-app-nav`, `nm-icon`, `nm-wordmark` with suffix, toast host in `AppAreaComponent`). Nothing runner-only.

## Copy (exact)
- Nav labels: `Jobs`, `Active`, `Earnings`, `Profile` (`_shared.md` §1, built `RunnerShell.items`).
- Skip link `Skip to content`, nav label `Main` (**proposed**, shared with the customer shell).

## States
| State | Behaviour |
|---|---|
| Arrive after sign-in | `RealtimeService.connect()` once; the server joins the runner status room (offers, withdrawals, price-change decisions, K§6.4) |
| Disconnected ≥ 5 s | `Reconnecting…` notice on `v-jobs` (#14, K§6.6); the shell shows nothing |
| Session expires / suspended | Interceptor sign-out (F§4.5) to `/app/runner/sign-in` with the toast |
| Another tab signs out | Reload to `/app/runner/sign-in` |
| Not verified | Shell as normal; `v-jobs` shows the verification card (#14) |
| Loading, empty, error | Per view |

Not in the shell (later issues decide): location pings while online or on a job (#15, WQ-6: a browser shares location only while the tab is open), the availability switch (#14). The shell starts no geolocation and asks for no permission.

## Numeric fields (Fira Code)
None in the shell.

## Data
No REST call of its own. `RealtimeService.connect()` / `disconnect()` with the F§5 token provider. Runner room events are consumed by the views.

## Accessibility and responsive
As `customer-shell.md`: one `<nav aria-label="Main">`, link list with `aria-current="page"`, 48px targets, focus ring, `Skip to content`, safe-area padding, no horizontal scroll from 360px, labels always visible.

## Required tests (Vitest)
1. Four nav links with the exact labels, order and `href`s; Earnings uses the `add-circle` icon pair.
2. Active item per route (`aria-current`, green-700 class, filled icon), including `onboarding/pending` with Jobs active from 768px.
3. Side nav from 768px shows the wordmark with the `Runner` suffix (accessible name `Nitume Runner`) linking to `/app/runner/jobs`; bottom bar below 768px.
4. Pushed routes hide the bottom bar below 768px.
5. `RealtimeService.connect()` once on first render.
6. Guards: customer session on `/app/runner/jobs` → `/app/customer/home`; nameless runner → `/app/runner/name`; signed out → `/app/runner/sign-in?returnUrl=%2Fapp%2Frunner%2Fjobs`; an unverified runner is **allowed** into the shell.
7. `/app/runner/onboarding/id` renders without the nav; `/app/runner/onboarding/pending` renders inside the shell.
8. Shared shell tests from `customer-shell.md` (skip link, token use, stubs) run for the runner configuration too.

## Current vs design
No signed-in runner area exists on the website.

## Questions
- WQ-12, WQ-13 (F§11). WQ-6 (`ui-kit.md`) decides whether runners can work an active job from the browser; it does not change the shell.
