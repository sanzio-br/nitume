# runner-web-presence — Web runner marker, "Pings stopped" flag and auto-offline notice (runners panel, runner drawer, live map)

- Issue: GitHub **#36**. Binding owner decisions: **Q14-5 / WQ-46** (Redis-only flag, 90 s, including never-pinged web runners), **Q14-6 / WQ-47** (idle online web runners are set offline after 5 min; a busy web runner is flagged only), **Q14-7** (location revoked: stay online plus the flag), **WQ-52** (blocked location and closed tab are treated the same; an idle web runner holding an open offer is flagged only until the offer ends; admin event `runner:web_auto_offline` kept, plus a runner-room event). Recorded in the issue body and its 2026-10-29 comment, and in BOARD (`WQ-46`, `WQ-47`, `WQ-52`).
- Mockup: **not drawn. EXTENDS MOCKUP.** `nitume_admin_dashboard.html` draws the map dots (`.runner-pt.idle|busy`, lines 285–292), the live-feed rail (`.live-row`, lines 298–304: amber/green/red/slate dots, Fira Code sub ending in a 12-hour time) and the runner drawer (lines 474–509). Nothing about the client or location pings. Every label below was *(proposed)*; the owner approved all of it on 2026-10-29 (Q36-1, decided).
- Shared conventions: `docs/specs/admin/_shared.md` (§3.1 times, §4 layout tokens, §4.1 admin palette, §5 components A-01 … A-18).
- API: **built** on `feat/api-web-runner-presence` (`126ae24` … `dd14084`). See §9.
- Implementation: none. Files that change: `features/admin/panels/runners.panel.ts`, `features/admin/drawers/runner-drawer.ts`, `features/admin/panels/live-map.panel.ts`, `features/admin/admin-data.service.ts`, `core/api-types.ts`, plus a **new admin Socket.IO client** (§8). No client exists today.
- Status: matches-design (re-audit 2026-10-29 PASS of web-parity `efa1e5c` … `cc30833`; `docs/audits/admin-gap-report.md` #36). Owner decided Q36-1 … Q36-11 on 2026-10-29: every recommendation in §13 approved.
- Built-in deviation accepted at re-audit: the runner drawer loads as a `@defer (on immediate)` chunk with `Loading runner profile…` (bundle budget, `62e15ac`).

## 1. Purpose

Since #14, runners can go online from the website. A browser sends location only while the tab is open, so a runner who closes the tab (or blocks location) stops pinging. The API now notices this:

- After **90 s** without a ping, a web runner who is **online** or **busy** is flagged to ops (`runner:web_pings_stopped`), once per silence. A web runner who went online but **never** pinged is flagged the same way.
- The next ping (or a reconnect from the app) clears the flag (`runner:web_pings_resumed`).
- After **5 min** without a ping, an **online** web runner with no active job and no open offer is set offline by the system (`runner:web_auto_offline`). A busy web runner is never set offline mid-job.
- Going offline by any path clears the flag, with no event.

The dashboard shows ops which runners are on the website, which of them stopped sending location and since when, and which were set offline by the system. Everything updates live. Ops takes no action here; this is information only. A web runner's flag tells ops that live location on their task may be stale, or that they are not really available.

App runners are never flagged or set offline. The dashboard never shows "Pings stopped" for a runner whose `presence.client` is `'app'` or `null`.

## 2. Entry / exit

No new panel, drawer kind or route. The feature adds to three existing surfaces:

| Surface | Entry | Exit |
|---|---|---|
| `p-runners` directory (`Network` → `Runners`, `runners.panel.ts`) | sidebar nav | card `Open profile` → runner drawer (unchanged) |
| `drawer-runner` (`runner-drawer.ts`) | runner card, map dot, a presence row in the live feed (new, §3.3) | ✕ / ESC / overlay (A-01, unchanged) |
| `p-map` live ops (`live-map.panel.ts`) | default panel | map dot or feed row → runner drawer |

## 3. Layout (top to bottom)

Shared rule used everywhere below:

```
isWeb(r)     = r.presence?.client === 'web'
isActive(r)  = r.availability === 'online' || r.availability === 'busy'
isFlagged(r) = isActive(r) && !!r.presence?.webPingsStoppedAt
```

`isFlagged` checks `isActive` on the client as well, because the API clears the flag silently when a runner goes offline, and the dashboard must never show `Pings stopped` next to `Offline`. A `client: 'app'` or `null` record is never flagged, whatever `webPingsStoppedAt` says (defensive; the API never sends that combination).

### 3.1 Runners panel (`p-runners` directory card, `runners.panel.ts`)

1. **Topbar sub** (`.sub`, Fira Code, line 19 / `sub()` lines 95–101). Append ` · {n} pings stopped` when `n = count(isFlagged) > 0`, for example `42 runners · 9 online · 3 on task · 1 pings stopped`. Nothing is added when `n` is 0. *(proposed; the count reads "1 pings stopped" on purpose, so the count is never pluralised by code. Owner may prefer `pings stopped: 1`, Q36-1.)*
2. **Card `.r-tags` row** (lines 72–75). It already holds the level chip and `{n} skills`. Add, **before** the level chip and in this order:
   - `Web` marker: `<app-status-chip label="Web" tone="neutral" />` when `isWeb(r) && isActive(r)`. Not shown for an offline runner (Q36-2) or an app runner.
   - `Pings stopped` flag: `<app-status-chip label="Pings stopped" tone="pending" />` when `isFlagged(r)`. Amber (`chip-pending`) at chip size only, per the design-system rule that amber is a small pending/needs-attention accent.
   - Both use the existing A-02 `label` + `tone` "fixed flag chip" path (`status-chip.component.ts:219-243`, precedent `Quote expired`). No new chip kind, no new CSS.
3. The availability chip in `.r-top` (line 51) is unchanged. When `runner:web_auto_offline` arrives it flips to `Offline` live (§5).
4. **Search** (`visible()`, lines 103–114) also matches `web` (when `isWeb && isActive`) and `pings stopped` (when `isFlagged`), so ops can type `pings` to list the flagged runners. No filter control is added (Q36-6).
5. **Order** unchanged (API order). Flagged runners are not moved to the top (Q36-6).

Card times: none are added on the card. The flag time is in the drawer (§3.2), so the grid stays static and needs no ticking clock.

### 3.2 Runner drawer (`drawer-runner`, `runner-drawer.ts`)

The first `.drawer-card` (lines 18–62) changes as follows. The rows use A-05 `.drawer-row`, labels in Fira Sans and `b` values in Fira Code.

| # | Row (label) | Value | Shown when |
|---|---|---|---|
| after `Availability` (line 28) | `Client` *(proposed)* | `<app-status-chip label="Web" tone="neutral" />` / `<app-status-chip label="App" tone="neutral" />`; `<b>—</b>` when `client` is null | always |
| next | `Location pings` *(proposed)* | `<app-status-chip label="Pings stopped" tone="pending" />` | `isFlagged(r)` |
| next | `Flagged` *(proposed)* | `<b>{formatDateTime(webPingsStoppedAt)}</b>`, for example `Today, 2:03 PM` | `isFlagged(r)` |
| existing `Last ping` (line 57) | `Last ping` | `<b>{formatDateTime(lastPing(r))}</b>`, for example `Today, 2:01 PM`; `—` when null | always (moved up, right after the rows above) |

- `lastPing(r) = r.presence?.lastPingAt ?? r.lastPingAt`. The Redis `presence.lastPingAt` moves on **every** accepted ping (idle or job), but expires after 24 h. The profile `lastPingAt` (database) moves only on job pings (`location-ingest.service.ts:381`). Presence wins when present. **Change from today:** the row moves from relative `timeAgo` (`2m ago`) to an absolute EAT time (§6, Q36-4).
- **Flag note** (A-11 `app-inline-notice`, tone `info`, not dismissible). Placed in a `.drawer-section` directly **under** the first card, only when `isFlagged(r)`. The text goes through `app-num-text`:
  - busy: `On a task. The website stopped sending location; live tracking for this task may be out of date. Nitume never sets a runner offline during a task.` *(proposed)*
  - online: `The website stopped sending location. Nitume sets this runner offline if it stays off.` *(proposed; no minutes in the copy, because the threshold is configurable, `LOCATION_WEB_OFFLINE_SECONDS`. Q36-3)*
  - never pinged (`lastPingAt` null): the same text as above, but the first sentence becomes `No location has arrived from the website since this runner went online.` *(proposed)*
- **Auto-offline notice** (A-11, tone `info`, dismissible, no auto-dismiss). Same place. Shown when this session received `runner:web_auto_offline` for the runner **and** `r.availability === 'offline'`:
  `Set offline by Nitume at {formatDateTimeEat(at)}. No location from the website since {formatDateTimeEat(lastPingAt)}.`, or `… No location arrived from the website.` when `lastPingAt` is null. *(proposed)* Rendered through `app-num-text`, so `Today, 2:06 PM` is Fira Code and `EAT` is Fira Sans. It is session-only (the API stores no history; Q14-5 forbids it), so it is gone after a page reload. That is acceptable: the availability chip still says `Offline`. Dismissing it removes it for the session.
- The flag note and the auto-offline notice never show together (`isFlagged` needs `isActive`; the auto-offline notice needs `offline`).
- No action buttons are added. Ops cannot clear the flag or force a runner online or offline from here (Q36-7).

### 3.3 Live map (`p-map`, `live-map.panel.ts`)

1. **Map dots** (lines 92–100). Dot colour is **unchanged**: idle green, busy amber, offline slate. These are the existing mockup classes `.runner-pt.idle|busy|offline` (`_ops.scss:325-343`). A flagged dot gets **no visual change in this round**. Busy is already amber, so an amber marker would not stand out, and a ring, badge or icon on the dot would be a new pattern (Q36-5). What changes:
   - `aria-label` (today the constant `Runner dot`) becomes `Runner {shortId} · {availability label}`, then ` · Web` when `isWeb && isActive`, then ` · Pings stopped` when flagged. Example: `Runner #NT-4F2A1 · On task · Web · Pings stopped`. The same string goes in `title`, so hover shows it. *(proposed)*
   - `MapPoint` gains `web: boolean` and `pingsStopped: boolean`, derived from the rule above.
   - Dots move live: an auto-offline flips the dot class to `offline` at once.
2. **Legend** (lines 111–121): unchanged unless Q36-5 adds a marker.
3. **Live feed rail** (`aside.side-panel`, lines 125–140). Presence events become feed rows, using the existing `.live-row` + `.live-dot` + `.t` + `.s` pattern drawn in the mockup (`FeedItem` with `runnerId`, which the panel already routes to `openRunner`, lines 212–218):

   | Event | `.live-dot` tone | `.t` (Fira Sans 12.5/600) | `.s` (Fira Code 11, slate-600) |
   |---|---|---|---|
   | `runner:web_pings_stopped` | `amber` | `Web pings stopped — {shortId}` | `Last ping {formatTime(lastPingAt)} · {formatTime(at)}`, or `No location received · {formatTime(at)}` when `lastPingAt` is null |
   | `runner:web_pings_resumed` | `slate` | `Web pings resumed — {shortId}` | `{formatTime(at)}` |
   | `runner:web_auto_offline` | `slate` | `Set offline, no web pings — {shortId}` | `Last ping {formatTime(lastPingAt)} · {formatTime(at)}`, or `No location received · {formatTime(at)}` |

   *(all proposed, Q36-1)*. The mockup rows end with a 12-hour time such as `2:11 PM` (lines 298–304), and the whole `.s` line is Fira Code, as drawn.
   - **Order**: presence rows sit **above** the task rows, newest first. At most **5** are kept, and the oldest drops off. The task rows (`tasks().slice(0, 8)`) follow, unchanged. Session-only: a reload or `↻ Refresh` keeps them (they live in `AdminDataService`) but a page reload clears them (Q36-8).
   - The topbar search (`visibleFeed()`) already filters on `.t` / `.s`, so it covers these rows with no change.
   - Green is not used for "resumed". It is not a complete state, and green is reserved for primary actions, active toggles and complete states.
4. **Map top-stat `FLAGGED`** (lines 79–82) keeps counting disputes. It is not reused for pings (Q36-5).
5. **`Live ops feed` badge** (`.map-livemode`, line 84). While the admin socket is not connected (§8 states `connecting`, `reconnecting`, `disconnected`), the text reads `Live updates paused` *(proposed)*. The existing `.live-dot` keeps its colour, so no new style is needed. When connected it reads `Live ops feed` (unchanged). This is the only connection indicator. Without it, ops could trust a stale flag (Q36-9).

### 3.4 Narrow widths

The admin dashboard is desktop-first (no mobile layout in the mockup). `.r-tags` already wraps (`flex-wrap: wrap`, `_ops.scss:1283-1288`), so the two extra chips wrap onto the next line. The drawer is `min(420px, 92vw)` (A-01). Nothing else changes.

## 4. Components

| Need | Pattern | Status |
|---|---|---|
| `Web`, `App`, `Pings stopped` chips | A-02 `app-status-chip` with `label` + `tone` (`neutral`, `pending`) | exists in admin shared (`shared/status-chip.component.ts`) |
| Drawer rows | A-05 `.drawer-card` / `.drawer-row` | exists (global SCSS) |
| Flag note, auto-offline notice | A-11 `app-inline-notice` tone `info` + `app-num-text` | exists (`shared/inline-notice.component.ts`, `shared/num-text.component.ts`) |
| Feed rows | `.live-row` / `.live-dot` + `FeedItem` (`admin-data.service.ts:100-106`) | exists |
| Map dot | `.runner-pt.idle|busy|offline` | exists. A flagged-dot marker would be **NEW and needs the owner** (Q36-5) |
| Times | A-13 `formatDateTime`, `formatDateTimeEat`, `formatTime` (`shared-format.ts:89-137`) | exists |
| Admin Socket.IO client | `core/realtime/admin-realtime.service.ts` (+ event parsers), §8 | **NEW: needs web-parity** (Angular counterpart of core-ui). No admin realtime layer exists |

No new colour, token, CSS class or chip variant. Amber appears only as `chip-pending` (chip size) and as the existing 8 px `.live-dot` in the feed (as drawn in the mockup).

## 5. Live updates (event → state)

`AdminDataService` holds the state. Every change is applied immutably to `runners` (the `RunnerListItem[]` signal), so the panel, drawer and map recompute together.

| Event (room `admins`) | Payload | Apply to runner `id === runnerProfileId` | Feed | Drawer notice |
|---|---|---|---|---|
| `runner:web_pings_stopped` | `{ runnerProfileId, lastPingAt \| null, at }` | `presence = { client: 'web', lastPingAt, webPingsStoppedAt: at }` | stopped row | flag note appears if the drawer is open |
| `runner:web_pings_resumed` | `{ runnerProfileId, at }` | `presence.webPingsStoppedAt = null`. `client` and `lastPingAt` are **left as they are**: the payload carries neither, and a resume can come from an app reconnect with no ping (see N36-1) | resumed row | flag note disappears |
| `runner:web_auto_offline` | `{ runnerProfileId, lastPingAt \| null, at }` | `availability = 'offline'`, `presence.webPingsStoppedAt = null`, `presence.lastPingAt = lastPingAt ?? previous` | auto-offline row | auto-offline notice (recorded per runner id for the session) |

Rules:
- **Unknown runner** (not in the loaded window; `GET /runners` loads the first 100, `api.service.ts:350`): add the feed row anyway (it opens the drawer, which shows its existing `Runner not found` empty state). Never append a runner from an event.
- **Malformed payload** (missing id, non-ISO `at`): drop it silently, never throw, as in the website `RealtimeParsers`.
- **Out-of-order**: per runner, ignore an event whose `at` is older than the last applied presence event for that runner.
- **Refetch race**: `refresh()` replaces `runners` with server truth. Any presence event received **while** that refresh is in flight is re-applied on top of its result.
- **(Re)connect**: on every successful connect after the first, call `refresh()` once, because events sent while disconnected are lost. The first connect does not refetch, because the dashboard already loaded.
- **Silent offline** (the runner switched off, or any other path): the API sends no event to admins, and there is no admin availability event at all today. The dashboard keeps the old availability until the next refresh. Because of `isFlagged`'s `isActive` check, it shows `Pings stopped` only if it still believes the runner is active. This is a known limitation, not a bug (Q36-9).

## 6. Times and numeric fields (Fira Code)

Admin convention (`_shared.md` §3.1, row 96): **12-hour East Africa Time with AM/PM, never 24-hour, never the browser's zone.** The brief's example `Last ping 14:02 EAT` therefore becomes `Last ping 2:02 PM` in the feed and `Today, 2:02 PM` in drawer rows. The `EAT` suffix appears only inside sentence text (the A-11 notices), as `formatDateTimeEat` does. Absolute times are used everywhere: they do not go stale while a drawer is open and need no ticking clock. Relative `timeAgo` stays only where it already is (`joined …`, the task feed rows).

Fira Code fields:
1. Runners topbar sub, including `{n} pings stopped` (whole `.sub` is Fira Code today).
2. Drawer `Flagged` value (`Today, 2:03 PM`).
3. Drawer `Last ping` value.
4. The times in both A-11 notices (via `app-num-text`, `Today, 2:06 PM`; the words stay Fira Sans).
5. Feed `.s` lines (`Last ping 2:01 PM · 2:03 PM`), whole line Fira Code as drawn.
6. Runner short ids in feed titles (`#NT-4F2A1`) are already Fira Code in the drawer `Runner` row. In `.t` titles they stay Fira Sans like the existing task rows (`Task completed — #NT-…`), so this feature makes no change to that.

Not numeric: `Web`, `App`, `Pings stopped` (chips, Fira Sans).

## 7. Copy (all *proposed*, Q36-1)

| Where | Copy |
|---|---|
| Runners sub suffix | ` · {n} pings stopped` |
| Chips | `Web` · `App` · `Pings stopped` |
| Drawer rows | `Client` · `Location pings` · `Flagged` · `Last ping` (existing) |
| Flag note (busy) | `On a task. The website stopped sending location; live tracking for this task may be out of date. Nitume never sets a runner offline during a task.` |
| Flag note (online) | `The website stopped sending location. Nitume sets this runner offline if it stays off.` |
| Flag note (never pinged) | `No location has arrived from the website since this runner went online. Nitume sets this runner offline if it stays off.` (busy variant: same first sentence, then the busy tail) |
| Auto-offline notice | `Set offline by Nitume at {Today, 2:06 PM} EAT. No location from the website since {Today, 2:01 PM} EAT.` / `… No location arrived from the website.` |
| Feed | `Web pings stopped — {id}` · `Web pings resumed — {id}` · `Set offline, no web pings — {id}`; sub `Last ping {t} · {t}` / `No location received · {t}` / `{t}` |
| Map dot label | `Runner {id} · {Online \| On task \| Offline}[ · Web][ · Pings stopped]` |
| Map badge while disconnected | `Live updates paused` |

Tone follows the existing admin copy: plain sentences, `Nitume` as the actor, no blame. Forbidden words (§3 of `_shared.md`) are not used. The word "offline" refers to runner **availability** (online / busy / offline), which is not a task state. No task state appears in this feature.

## 8. Realtime transport: a new admin Socket.IO client (sizing)

Today `apps/admin` has **no realtime client**: no `socket.io-client` in `package.json`, and no socket, `EventSource` or polling code (`rg socket apps/admin/src` returns nothing). The live map "streams" nothing; it re-reads on `↻ Refresh`, and the class comment at `live-map.panel.ts:12-18` says so. The #24 spec (`drawer-user-status.md` §11) and `drawer-task-requote.md` record the same. The API already puts every admin socket in the `admins` room on connect (`realtime.gateway.ts:176-178`), so the server side needs nothing new.

**Needed (web-parity): `AdminRealtimeService`** in `apps/admin/src/app/core/realtime/`. It is a reduced port of the website's `RealtimeService` (`apps/website/src/app/core/realtime/realtime.service.ts`, 407 lines; tokens 69). The two apps cannot share code, so this is a port, not a copy of a shared component:

- Connect to `originFor(environment.apiBaseUrl)` with path `/socket.io`, `transports: ['websocket']`, `auth: { token }` (the access token from `AuthStore`), `reconnection: false` (the service owns retries), `forceNew: true`. Never send `client: 'web'`: that marks a **runner** web socket, and for an admin it is meaningless.
- Token: before each attempt, if `AuthStore.isExpiringSoon()`, rotate through `AuthService.refresh` first. If no session remains, stop (`disconnected`).
- Retries: backoff 1 s, 2 s, 4 s … capped at 30 s, ±20 % jitter (same as the website `defaultBackoff`), on drop, refused handshake or server kick.
- `connect_error` `account_suspended` (#23): final. Stop retrying and call `AuthService.logout()`.
- State signal `connected | connecting | reconnecting | disconnected` (drives §3.3 item 5).
- Streams for the three events only, each with a defensive parser (`runnerProfileId` non-empty string, `at` ISO, `lastPingAt` ISO or null). Malformed payloads are dropped.
- Lifecycle: start when the dashboard shell mounts (signed in), stop on logout and on destroy.
- **Bundle (blocker-level constraint).** The admin initial bundle was **497.22 kB** at the #24 re-audit, against the issue's ≤ 500 kB ceiling. `socket.io-client` adds roughly 40–50 kB minified, so it **must not** land in the initial chunk. Load it with a dynamic `import('socket.io-client')` inside the service, behind an injectable factory (as the website's `SOCKET_IO_FACTORY`) so tests inject a fake. The service itself and the parsers must stay small (target under 3 kB in the initial chunk), or also load lazily. The audit checks `ng build` initial total ≤ 500 kB.
- New dependency: `socket.io-client` `^4.8.x` in `apps/admin/package.json`. It is the same library and version range the website already ships, so it is not a new third-party **service** (Q36-10 asks the owner to confirm anyway).
- Size estimate: service and parsers about 180–250 lines, tests about 250–300 lines, data-service wiring about 80 lines, UI changes about 120 lines. That is one web-parity build, medium.

Alternative considered and **not** chosen: polling `GET /runners` every 30 s. It needs no dependency, but it is not live, it re-reads 100 profiles each time, it would never show the auto-offline moment (no feed row, no notice), and the issue asks for updates "live from the socket events".

## 9. Data

- `GET /api/v1/runners?limit=100` (admin): each item now carries `presence: { client: 'web' | 'app' | null, lastPingAt: string | null, webPingsStoppedAt: string | null }` (ISO). `webPingsStoppedAt` is always null for an offline runner. `client` null = no presence record within 24 h (no socket or ping since; TTL `LOCATION_PRESENCE_TTL_SECONDS`). **Admin type change**: `RunnerListItem.presence?: RunnerPresence` (`core/api-types.ts:751-767`), optional, so an older API still renders (treated as `client: null`).
- `GET /api/v1/runners/:id/verifications` also carries `presence` (route-only). **Not used** by this feature: the runner drawer reads from the directory list (`runner-drawer.ts:96-98`), and the verification drawer is about documents. No change there (Q36-11 covers runners outside the first 100).
- Socket events to room `admins`: `runner:web_pings_stopped`, `runner:web_pings_resumed`, `runner:web_auto_offline` (payloads in §5, `apps/api/src/realtime/realtime.events.ts`). `runner:availability_changed` goes to the **runner's own room** only and is not for the admin.
- Thresholds (API env, defaults): `LOCATION_WEB_STALE_SECONDS=90`, `LOCATION_WEB_OFFLINE_SECONDS=300`, `LOCATION_WEB_SWEEP_INTERVAL_SECONDS=30`. A flag therefore appears 90–120 s after the last ping, and an auto-offline 300–330 s after it. The admin never hard-codes them.
- System Design: §4.2 names the `runner:{runnerId}:status` room and `location:update` only. The `admins` room and these event names are **PROPOSED** API names (`realtime.events.ts` header). There is no System Design §3.2 endpoint for presence, because it is new under #36.
- Task states: **none**. The feature is about runner availability (`online` / `busy` / `offline`). "Busy" is the runner availability while on an active job, as the API sets it; the dashboard never derives or shows a task state from presence.

**needs: api-contract (optional, not blocking)**
- **N36-1**: add `client` and `lastPingAt` to `runner:web_pings_resumed`, so the drawer's `Client` and `Last ping` rows update live on resume. Without it they refresh on the next `GET /runners`. Not required for the issue's acceptance.

## 10. States

| State | Runners panel | Drawer | Map |
|---|---|---|---|
| Loading (first load) | existing `Loading live ops…` (shell) | n/a | same |
| Load error | existing shell error / sync notice | n/a | same |
| `presence` missing (older API) or `client: null` (no record) | no presence chips | `Client` `—`; `Last ping` from profile or `—`; no flag rows | label without ` · Web` |
| App runner (`client: 'app'`) | no presence chips | `Client` `App`; never flagged | label without ` · Web` |
| Web runner, active, pinging | `Web` chip | `Client` `Web`, `Last ping` | ` · Web` |
| Web runner, active, flagged | `Web` + `Pings stopped` | + `Location pings`, `Flagged`, flag note (busy / online / never-pinged copy) | ` · Web · Pings stopped`; stopped feed row |
| Web runner, offline (manual or auto) | no presence chips | `Client` `Web` (last used), no flag rows; auto-offline notice if this session saw the event | offline dot; auto-offline feed row |
| No runners | existing `No runners match` empty | existing `Runner not found` | existing `No runners on the map yet` |
| Socket not connected | unchanged (data from last load) | unchanged | badge `Live updates paused` |
| No presence events yet | n/a | n/a | feed shows task rows only (existing empty state if none) |

## 11. Accessibility

- Chips carry text, so the flag is never conveyed by colour alone. The amber `.live-dot` in the feed is paired with the `.t` text.
- The map dots get a real `aria-label` (§3.3), replacing the constant `Runner dot`, and the same text in `title`.
- A-11 notices use `role="status"` (tone `info`). They are polite, and they announce when they appear in an open drawer.
- No `aria-live` on the feed rail: ops dashboards stream many rows and announcing each one would be noise. Owner may want otherwise (Q36-9).
- Contrast: chips are the existing `chip-pending` (amber on amber-050) and `chip-neutral` (slate-600 on slate). No text sits on a green or blue fill.
- Pre-existing, out of scope: `.live-row` is a clickable `div` with no keyboard access (`live-map.panel.ts:128`). Noted as m-1 in the gap report and not required for #36.

## 12. Required tests (web-parity)

Run with `npx ng test --watch=false` in `apps/admin`, 0 failures. `npx ng build` must stay clean with the initial total ≤ 500 kB (paste the count).

1. `admin-realtime.service.spec.ts` (fake socket factory, no network):
   1. connects with `auth.token` from `AuthStore`, `transports ['websocket']`, path `/socket.io`, and no `client` field;
   2. rotates the token first when `isExpiringSoon()`;
   3. retries with the injected backoff after a drop, using a fresh token per attempt;
   4. treats `account_suspended` as final and calls `logout` once;
   5. exposes `connected / reconnecting / disconnected` states;
   6. drops malformed payloads for each of the three events;
   7. stops on logout and destroy.
2. `admin-data.service` presence spec:
   1. `web_pings_stopped` sets `presence.webPingsStoppedAt` and `client 'web'`, and adds an amber feed row with `Last ping {t} · {t}`;
   2. a null `lastPingAt` gives `No location received · {t}`;
   3. `resumed` clears the flag, leaves `client` and `lastPingAt` alone, and adds a slate row;
   4. `auto_offline` sets `availability 'offline'`, clears the flag, records the notice, and adds a slate row;
   5. an unknown runner id adds a feed row and does not touch `runners`;
   6. an older `at` is ignored;
   7. an event received during an in-flight `refresh()` is re-applied after it;
   8. a reconnect after the first connect calls `refresh()` once;
   9. at most 5 presence rows, newest first, above the task rows.
3. `runners.panel.spec.ts` (new):
   1. `Web` chip only for `client 'web'` and online/busy;
   2. `Pings stopped` (`chip-pending`) only when flagged and active, never for `app`, `null` or offline;
   3. the sub adds ` · {n} pings stopped` only when n > 0;
   4. search `pings` and `web` match;
   5. a live `stopped` event updates the card without a refetch.
4. `runner-drawer.spec.ts` (new):
   1. `Client` row shows `Web`, `App` or `—`;
   2. `Last ping` prefers `presence.lastPingAt`, falls back to the profile `lastPingAt`, and is formatted `Today, 2:01 PM` in EAT;
   3. `Location pings` and `Flagged` rows plus the flag note only when flagged, with the busy, online and never-pinged copy variants;
   4. the auto-offline notice appears after the event while offline, with times through `app-num-text` (Fira Code `.num`), is dismissible, and is absent after the runner is online again;
   5. no flag rows for an app runner even with a stray `webPingsStoppedAt`.
5. `live-map.panel.spec.ts` (extend):
   1. dot `aria-label` and `title` text for online, busy and offline, with and without Web and Pings stopped;
   2. an auto-offline event flips the dot to `offline`;
   3. presence feed rows render with their tone and open the runner drawer;
   4. the badge reads `Live updates paused` when not connected and `Live ops feed` when connected.
6. `status-chip.component.spec.ts`: a `label="Pings stopped" tone="pending"` case renders `chip-pending` (guards the amber use).
7. Grep checks in the audit (no automated spec): no hex, `font-family` or `rgb(` in the changed files; `socket.io-client` imported only through a dynamic `import()`.

## 13. Questions for the owner (all DECIDED 2026-10-29: owner approved every recommendation)

| Id | Question | Recommendation (approved) |
|---|---|---|
| Q36-1 | Approve the proposed copy in §7 (chips `Web` / `App` / `Pings stopped`; rows `Client`, `Location pings`, `Flagged`; the two notices; feed titles; `Live updates paused`)? | Approve as written |
| Q36-2 | Show the `Web` marker on an **offline** runner's card (last used the website within 24 h), or only while online or busy? | Only while online or busy (the drawer's `Client` row still shows it) |
| Q36-3 | Should the online flag note give the minutes (`… offline after 5 minutes without location`)? The threshold is an env setting, so a number in copy can drift. | No number (as proposed) |
| Q36-4 | The drawer's existing `Last ping` changes from relative (`2m ago`) to absolute EAT (`Today, 2:01 PM`), and its source becomes the Redis presence time (every ping) with the profile time as fallback. OK? | Yes: it does not go stale while the drawer is open, and it matches §3.1 |
| Q36-5 | **New visual pattern on the map.** A flagged dot looks the same as any other dot of its availability (busy is already amber). Add a marker (for example a 2 px amber ring, or a slate ring with an amber centre), a legend item `Pings stopped`, or reuse the `FLAGGED` top-stat? Each is a new pattern or a change of meaning, so none is built without you. | Keep the dot unchanged this round; the feed row, `aria-label` and `title` carry the flag. Revisit when the map shows real GPS positions |
| Q36-6 | Add a `Pings stopped` filter or sort flagged runners first in the runners grid? Both would be new controls. | No; the search matches `pings` |
| Q36-7 | Any ops action on a flagged runner (for example `Set offline` from the drawer)? The API has no admin availability endpoint. | No action (information only, per the issue) |
| Q36-8 | Feed presence rows are session-only and capped at 5. A different cap, or should they also drop off after some time? | Cap 5, session only |
| Q36-9 | The dashboard learns of a **manual** offline (or any availability change except auto-offline) only on refresh, because the API sends admins no availability event. Accept this for #36, or open a follow-up for an admin `runner:availability_changed` event? | Accept for #36 and open a follow-up issue |
| Q36-10 | New npm dependency `socket.io-client` (^4.8, already used by the website) in `apps/admin`, lazy-loaded. Confirm. | Confirm |
| Q36-11 | Flags for runners outside the first 100 of `GET /runners` only appear as feed rows (the drawer says `Runner not found`). Acceptable until the directory paginates? | Accept; the directory already has this limit |

## 14. Current vs design

| Area | Current (`main` = branch base) | Design |
|---|---|---|
| Runner list type | `RunnerListItem` has no `presence` (`core/api-types.ts:751-767`) | `presence?: { client, lastPingAt, webPingsStoppedAt }` |
| Runners card | availability chip, level chip, skills chip (`runners.panel.ts:51, 72-75`) | + `Web`, `Pings stopped` chips; sub count; search terms |
| Runner drawer | `Last ping` = profile `lastPingAt` through `timeAgo` (`runner-drawer.ts:56-58`); no client row | `Client`, `Location pings`, `Flagged`, absolute `Last ping`; flag note; auto-offline notice |
| Map dots | class by availability; `aria-label="Runner dot"` (`live-map.panel.ts:93-100`) | descriptive label and title; live class flip |
| Feed | task rows only, `tasks().slice(0, 8)` (`admin-data.service.ts:233-237`) | presence rows (≤ 5) above task rows |
| Map badge | always `Live ops feed` (`live-map.panel.ts:84`) | `Live updates paused` while not connected |
| Realtime | none; manual `↻ Refresh` only | `AdminRealtimeService`, lazy `socket.io-client`, refetch on reconnect |
| Tests | `live-map.panel.spec.ts` (3 time cases); no runners panel or runner drawer spec | §12 |
