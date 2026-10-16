# v-home — Home

- Mockup: `docs/design/nitume_customer_app.html` lines 225–253 (`#v-home`, root tab view)
- Shared conventions: `_shared.md` (OA-n §0)
- Implementation: `apps/customer_app/lib/src/screens/shell/home_tab.dart` on branch `feat/customer-finding-a-runner` (meta copy in `util/display.dart` `activeCardMeta`)
- Status: matches-design (re-audit 2026-10-16, round 10, `feat/customer-finding-a-runner` @ `3b5a8e4`: rows 176, 182, 183 PASS)

## Purpose
Landing screen after sign-in: greet the customer by name, start a new task by category, jump to the active task, and reopen recent tasks.

## Entry / exit
- Entry: after OTP verify / name capture; tab bar "Home"; every stack reset (rating submitted, task cancelled).
- Exits:
  - Bell → push `v-notifications`.
  - Avatar → switch to the `v-profile` tab (root view, not a push).
  - Search row → push `v-new-category` with nothing selected (Q2 default).
  - Category tile → push `v-new-category` with that category preselected (Q3 default).
  - Active card button → target by state (table below).
  - Recent row → push `v-task-detail`.

## Task states
"In progress" card: the customer's most recently updated errand in the **active** set (`_shared.md` §6). Button by state:

| State | Button | Target |
|---|---|---|
| REQUESTED | `View request →` | `x-awaiting-quote` |
| QUOTED | `Review quote →` | `x-awaiting-quote` |
| ACCEPTED | `Pay now →` | `v-payment` |
| PAYMENT_CONFIRMED … IN_PROGRESS | `Track live →` (mockup) | `v-track` tab for that errand |
| AWAITING_CUSTOMER | `Review evidence →` | `v-evidence-confirm` |

If more than one errand is active, a 12.5/700 green-700 link under the card `+N more in progress` (N Fira Code) switches to the Track tab (Q8 default).
"Recent": last 2 errands in the **finished** set.

## Layout (top to bottom)
1. Top bar (C-09), padding `8 20 14`, slate bg:
   - Left: greeting 12 slate-600 (margin-bottom 2), first name 21/700.
   - Right (gap 10): bell (C-11, red unread dot OA-13) and 36px initials avatar (C-12).
2. Search entry row (C-34), margin `4 20 18`, padding `13 16`, r-m 14 (mockup 12), icon 15 + placeholder 13.5 slate-400.
3. Section label (C-08) `Categories`.
4. Category grid (C-15): 3 columns, gap 10, padding `0 20 20`, **five tiles** (OA-1, OA-18): row 1 Buy For Me, Get It For Me, Check It For Me; row 2 Go There For Me, Wait For Me, empty third cell. Tile spec as in `v-new-category.md` (no selected state here).
5. Section label `In progress` (hidden with the card when there is no active errand).
6. Active task card (C-20), margin `0 20 14`, blue fill r 16 (mockup), padding 18:
   - Tag pill 11/700: chip-info (blue-050 bg, blue text) replacing the mockup's green tint + `#5FE092` (OA-14). Text: category display name + ` · ` + reference.
   - Title 15.5/600 white, margin `0 0 4`.
   - Meta Fira Code 12, slate-400 `#8C97AC` (replaces `#AEB9CC`, OA-14), margin-bottom 14.
   - Button: green fill, white 12.5/700, padding `9 16`, **pill** (OA-11), intrinsic width, left aligned.
7. Section label `Recent`.
8. Up to two compact task rows (C-22), margin `0 20 10`, trailing chip per §6.
9. Bottom padding so the last row clears the tab bar.

## Components
| Element | Component | Status |
|---|---|---|
| Top bar with greeting | C-09 | built |
| Bell | C-11 | built (unread dot → red) |
| Avatar | C-12 | built |
| Search row | C-34 | built |
| Section labels | C-08 | built |
| Category grid | C-15 | built (five-tile change) |
| Active task card | C-20 | built |
| Recent rows | C-22 + C-05 | built |
| Tab bar | C-13 | built |
| Empty / loading / error | C-33 | built |

## Copy (exact from the mockup unless marked)
- Greeting: `Good morning` before 12:00, `Good afternoon` 12:00–17:59, `Good evening` from 18:00 (device local time).
- Name: first word of `displayName` (`Achieng`, OA-2). No name (should not happen after `x-name-capture`): greeting line only, name line hidden; the core top bar renders no empty title line (approved, BOARD Needs row 40).
- Search placeholder: `What do you need done?`
- Section labels: `Categories`, `In progress`, `Recent`.
- Active card sample: tag `Check It For Me · #NT-10482` (mockup `Inspection · #10482`; OA-1 and OA-15), title `Apartment check — Nyali`, meta `Brian K. is en route · ETA 12 min`, button `Track live →`.
- Runner name in metas = the API short name (row 40); without one use `Your runner` (`Your runner is on it`).
- Meta by state (proposed): REQUESTED `Waiting for your quote`; QUOTED `Your quote is ready`; ACCEPTED `Pay to confirm your task`; PAYMENT_CONFIRMED `Finding a runner`; RUNNER_ASSIGNED `Finding a runner` (rows 176, 183: no runner name before acceptance; was `Brian K. is assigned`); RUNNER_EN_ROUTE mockup; ARRIVED `Brian K. has arrived`; IN_PROGRESS `Brian K. is on it`; AWAITING_CUSTOMER `Ready for your review`.
- Recent sample rows: `Buy shoes — Sarit Centre` / `Yesterday, 4:12 PM` / `Completed`; `Collect documents — CBD` / `Mon, 10:03 AM` / `Completed`.

States (proposed):
- No active task: hide the "In progress" label and card.
- No finished tasks: hide "Recent".
- Loading: skeleton for the card and two rows (C-33).
- Error: inline `Couldn't load your tasks.` + outline `Try again`; categories stay usable.

## Numeric fields (Fira Code)
- Reference in the tag (`#NT-10482`).
- Active card meta line (whole line, `.li-meta` rule).
- Recent row timestamps.
- `+N more` count.

## Data
- Name and initials: `GET /users/me` `displayName` (exists).
- Active: `GET /api/v1/errands?status=<active set>&limit=5`; recent: `GET /api/v1/errands?status=<finished set>&limit=2` (multi-status filter on `feat/api-customer-gaps`).
- Title and reference: `title`, `reference` on the errand (exist); title fallback = category display name (row 41, `_shared.md` §7).
- Runner name + ETA: assignment + runner summary on the errand (`feat/api-customer-gaps`), ETA from `location:update` (§4.2).
- Unread dot: `GET /notifications/unread-count` (exists).
- Live (rows 23, 29): `errand:join` for the active errand; `location:update` updates the ETA, shown only inside the assignment window (rows 27, 65; `_shared.md` §10); `errand:status_changed` refreshes the card; `price_change:requested` opens `v-price-auth` (app-level listener). Fallback only while the socket is disconnected: refresh on resume and every 30 s while visible.

## Accessibility and mobile
- Bell: "Notifications, N unread"; 48dp hit area. Avatar: "Profile".
- Category tiles: button semantics with the full name.
- Active card: white on blue and white on green pass; slate-400 meta on blue ≈ 5:1.

## Resolved by owner answers
- Category labels and Business Tasks: OA-1, OA-18 (was Q1).
- Names: OA-2 (was Q1).
- Off-palette active-card colours: OA-14 (was Q5).
- Title and reference: OA-15 (was Q6, Q7).
- Row 176 (2026-10-16): during RUNNER_ASSIGNED the customer sees `Finding a runner` (card meta and any status chip); the runner's name appears from RUNNER_EN_ROUTE (`Brian K. is en route`).

## Open questions (non-blocking; build default given)
- Q2: Search row has no behaviour in the mockup. Default: opens the wizard.
- Q3: Tile tap preselects the category. Default: yes.
- Q4: Button per state for REQUESTED / QUOTED / ACCEPTED. Default: the table above.
- Q8: Several active errands. Default: one card + `+N more in progress`.

## Current vs design
Re-audit 2026-10-16, customer round 10, `feat/customer-finding-a-runner` @ `3b5a8e4` (app `99e6839`, `4e21f10`, `575be0d`, `f4f735e`; core `153509e`, `21cfa5f`): **PASS**, no findings. Items 1–2 of the row-176 update below are closed: RUNNER_ASSIGNED meta `Finding a runner` with no runner name (Fira Code 12 via core `ActiveTaskCard`); RUNNER_EN_ROUTE `Brian K. is en route`; chips follow core. Details: `docs/audits/customer-gap-report.md` → "Re-audit 2026-10-16: customer round 10".

Spec update 2026-10-16 (round 10, row 176), `main`: 1. blocker (flutter-customer): `apps/customer_app/lib/src/util/display.dart:147` shows `'$name is assigned'` for RUNNER_ASSIGNED (the offered runner); must be `Finding a runner`. 2. minor (core-ui CC-176): `Recent` / card chips come from `StatusChip.forStatus` and follow the core label change automatically.

Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS. Minor: `+N more in progress` count renders in Fira Sans (core link label is string-only, CC-2); with no name the greeting is shown as the 21/700 title instead of the greeting line only. ETA in the active-card meta waits for rows 29/30.

Spec update 2026-10-08 (rows 23, 27, 29, 40, 41, Needs row 40): no screen-specific rework. Cross-cutting items CC-4 (title fallback), CC-5 (API short name), CC-6 (empty-title top bar) and the socket client apply here; see the 2026-10-08 addendum in `docs/audits/customer-gap-report.md`. Status stays `matches-design` until the next spot-check.
