# drawer-user-status — Account status (suspend, ban, reactivate) in the runner and customer drawers

- Issue: GitHub #24. Owner decisions **WQ-22** (admin role only) and **WQ-23** (rules, reason, history), 2026-10-28, recorded in the issue #24 comment and in the API code comments (`apps/api/src/users/user-status.rules.ts`, `admin/admin-users.controller.ts`). BOARD on this branch has no WQ rows yet; the orchestrator copies them.
- Mockup: **partly drawn. EXTENDS MOCKUP.** The runner drawer (`#drawer-runner`, `nitume_admin_dashboard.html:507`) ends with `.drawer-actions` → `.btn-reject` `Suspend runner` (outline) next to `Message runner` (out of scope here). Ban, reactivate, the reason dialog, the history and any customer drawer are **not drawn**. All copy marked *(proposed)* needs owner confirmation (SQ-6).
- Shared conventions: `docs/specs/admin/_shared.md` (§2 access, §3.1 times, §4 layout tokens, §5 components A-01 … A-18).
- API: **built** on `feat/api-user-status-audit` (`95b5943` … `1d4bd3f`) for the change and the history; **missing** for reading the current status (U-1) and for linking a task to its customer's user (U-2). See Data.
- Implementation: none. Runner drawer `apps/admin/src/app/features/admin/drawers/runner-drawer.ts` (no status section); **no customer drawer exists** (`drawer-nav.service.ts:3` kinds: `task | runner | dispute | refund | runner_payout | runner_verification`).
- Status: missing.

## 1. Purpose

Let an ops admin suspend, ban or reactivate a runner or customer account, always with a written reason, and see who changed the account's status, when, from what to what, and why. The change takes effect at once (API): the user's access tokens answer 401 `account_suspended`, live sockets drop, refresh sessions are revoked; a reactivated user signs in again with an OTP. The reason is **internal**: the user only ever sees the generic `account_suspended` message (WQ-23).

Rules (WQ-23, enforced by the API, mirrored by the UI):

| Current status | Actions offered |
|---|---|
| `active` | Suspend, Ban |
| `suspended` | Reactivate, Ban |
| `banned` | Reactivate |
| account role `admin`, or the signed-in admin's own account | none (section shows the status and history, no buttons) |

`banned → suspended` is refused by the API (409 `status_transition_not_allowed`) and never offered.

## 2. Entry / exit

- **Runner drawer** (`drawer-runner`, kind `runner`, id = runner profile id): new section, placed **last** in the drawer body, after every other section (today after the `View payouts` actions; later after `Payouts` and `Purchase limit` from `drawer-runner-purchase-limit.md`). The mockup puts `Suspend runner` at the bottom of the drawer, so the section keeps that position. Target user id = `RunnerListItem.userId` (already in the `GET /runners` feed).
- **Customer drawer**: **does not exist** (SQ-3). Proposed: a new drawer kind `customer` (A-01, existing pattern; id = the customer's **user id**; title `Customer`), mounted with `@defer (on immediate)` like `runner_verification`, opened from:
  - the refund drawer's customer block (`RefundDetail.customer.userId`, available today): `.btn-text` `Open customer`;
  - the task drawer's `Customer` row (`task-drawer.ts:123`): only once U-2 gives the task its customer's user id (`errand.customerId` is a `customer_profiles.id`, not a user id).
  The customer drawer body (proposed, SQ-3): one `.drawer-card` with rows `Customer` → display name (or masked id `…a1b2` when null), `Phone` → Fira Code (from U-1), then this section.
- Exit: the drawer's own close (✕ / ESC / overlay). A drawer with a reason typed in an open dialog registers the existing close guard (`DrawerNavService.setCloseGuard`) and asks A-08 `Discard this reason?` / `Back` · `Discard` before closing (same as the other drawers with unsaved input).

## 3. Layout (top to bottom)

All spacing from `_shared.md` §4 (mockup CSS already in `_ops.scss`).

### 3.1 Section `Account`
`.drawer-section` (margin-bottom 20) → `.drawer-label` `Account` *(proposed)* (11/700 uppercase, 0.04em, slate-600, margin-bottom 10).

1. Optional A-11 notice slot (success / danger / info) at the top of the section, see §6 and §7.
2. `.drawer-card` (white, 1px slate-line, radius 12, padding 14 16), rows 13px, padding 7 0, hairline between:
   - `Status` → A-02 chip, new vocabulary `kind="account"`: `Active` / `Suspended` / `Banned` (tones in §4).
   - `Last changed` → `{formatDateTime(createdAt)} · {actor}` from the newest history item (time Fira Code, actor Fira Sans), or `No changes recorded` (Fira Sans, slate-600) when the history is empty. While the history loads: `—`.
3. `.drawer-actions` (flex, gap 10, margin-top 6), buttons per §1, each `.btn .btn-outline` (A-07 sizing; mockup `.btn-reject` = outline, flex 1), in this order:
   - active: `Suspend {runner|customer}` · `Ban {runner|customer}`
   - suspended: `Reactivate {runner|customer}` · `Ban {runner|customer}`
   - banned: `Reactivate {runner|customer}`
   - admin target / own account: no `.drawer-actions`; instead a 12.5px slate-600 line `Admin accounts can't be changed here.` or `You can't change your own account.` *(proposed)*.
   - status unknown (U-1 not loaded or failed): no buttons (never guess the allowed actions).
   No green and no red buttons here: green is reserved for the primary confirm inside the dialog, and red never fills a button (A-08, design-system rule).
4. Sub-label `Status history` *(proposed)* (`.drawer-label` style, margin-top 16) → `.drawer-timeline` (left padding 20, existing green 8px dot and slate-line connector; mockup `.dt-item`), newest first. One `.dt-item` per history item:
   - line 1 `<b>` (12.5/600 blue, Fira Sans): `{fromLabel} → {toLabel}`, e.g. `Active → Suspended`.
   - line 2 `.dt-time` (11, slate-600): `<span class="dt-actor">{actor}</span> · {formatDateTime(createdAt)}` — actor Fira Sans via `.dt-actor`, time Fira Code (`.dt-time` default).
   - line 3 the reason: `.dt-time` whose text is wrapped in `.dt-actor` (Fira Sans; the reason is words, not numeric data): `“{reason}”`, `white-space: pre-line` not needed (single paragraph), long text wraps; never truncated (max 500).
   - Actor text: `Admin · {actor.displayName}` when the actor is an admin with a display name; `Admin` when the name is null; `System` for `actorType = system` or `actor = null`; `Runner` / `Customer` for those actor types (the enum allows them; the admin endpoint never writes them). Reuse the task drawer's `historyActor()` (`task-drawer.ts:60`), moved to `shared-format.ts` (no copy).
   - Times: absolute, EAT, 12-hour (`_shared.md` §3.1, A-13 `formatDateTime`), e.g. `Today, 4:30 PM`, `Mon 12 Oct, 4:30 PM`, with the year when not the current year. Not `timeAgo`: this is an audit record.
5. A-12 `app-load-more` under the timeline while `nextCursor` is not null (label `Load more` / `Loading…`), page size 20.

### 3.2 Reason dialog (A-08, form mode)
`app-confirm-dialog` with `[form]="true"` (card max-width 440, initial focus on the reason textarea via `data-autofocus`, focus trapped, ESC = Back, scrim click = Back unless busy). Built as one component for the three actions (like `expire-task-dialog.ts`), parameterised by `action` and `audience` (`runner` | `customer`).

Body, top to bottom:
1. One paragraph (13 slate-600) per action, §5.
2. A-11 danger notice slot for dialog-level errors (§7).
3. A-06 `app-form-field`:
   - label `Reason`
   - control `<textarea appFieldControl rows="4" maxlength="500">`
   - hint (plain, `[plainHint]="true"`, Fira Sans: the numbers are a rule, not data — `_shared.md` A-06 m-12): `Required, 10 to 500 characters. Kept in the account history. The {runner|customer} never sees it.` *(proposed)*
   - counter: `{n}/500`, **Fira Code** (`.field-counter`, 11px), live on every input, `n` = characters typed (raw length, so it agrees with `maxlength`); `counterError` when the field shows an error.
   - error (text only, 12/600 red): see validation.
4. Actions: `Back` (outline) · primary confirm (green fill, white text) — label per action, §5; busy label while saving; both disabled while busy; confirm disabled until valid.

Validation (client, mirrors the API: trimmed length 10–500):
- `valid = 10 ≤ reason.trim().length ≤ 500`.
- Error shown after blur or a confirm attempt: empty or whitespace-only → `Enter a reason.`; trimmed < 10 → `Enter at least 10 characters.` (same wording as `EXPIRE_REASON_SHORT`); > 500 cannot be typed (`maxlength`), but a pasted value is cut by the browser; no separate copy.
- The dialog sends the reason as typed; the API trims. Reset to empty each time the dialog opens.

### 3.3 Mobile / narrow
The drawer is `min(420px, 92vw)`. With two buttons the labels (`Reactivate customer` · `Ban customer`) can overflow a narrow drawer: the actions may wrap (`flex-wrap: wrap` on this section's `.drawer-actions`, buttons `flex: 1 1 auto`), no new class. Tap targets: A-07 `.btn` (`styles.scss:107`, 14.5px text, padding 12 22) is about 44px tall, which meets the 44px minimum; do not shrink it to the mockup's 12.5/9 `.btn-reject` size.

## 4. Status chip tones (A-02 `kind="account"`) — needs owner confirmation (SQ-1)

| Status | Label | Proposed variant | Rule check (`nitume_design_system.html` usage rules) |
|---|---|---|---|
| `active` | `Active` | `info` (blue-050 bg, blue text) | Green is reserved for primary buttons, active toggles and checked/complete states. An active account is neither, so not `success`. `info` is the existing neutral-positive chip (availability `busy`, levels). |
| `suspended` | `Suspended` | `pending` (amber-050 bg, amber text) | Amber is "pending / needs-attention". A suspended account needs attention and is reversible: fits the rule. |
| `banned` | `Banned` | `danger` (red-050 bg, red text) | Red is "disputes / failed only". A ban is neither: **this extends the red accent's meaning**, which `AGENT_BUILD_INSTRUCTIONS.md` §4 says to ask about. Fallback if refused: `neutral` (slate chip, already in `styles.scss:100`). |

Chip size only (12/600, padding 5 11, radius 999); amber and red never as a larger surface. The history timeline lines are text, not chips, so no colour there beyond the existing green dot (see SQ-5).

## 5. Copy per action *(all proposed, SQ-6)*

`{who}` = `runner` or `customer`; `{Who}` capitalised.

| | Suspend | Ban | Reactivate |
|---|---|---|---|
| Button in the section | `Suspend {who}` (mockup wording for the runner) | `Ban {who}` | `Reactivate {who}` |
| Dialog title (`h3` 16/700) | `Suspend this {who}?` | `Ban this {who}?` | `Reactivate this {who}?` |
| Dialog body | `They're signed out on every device straight away and can't use Nitume until an admin reactivates the account. They see a general "account suspended" message, not your reason.` | `Use a ban for serious or repeated breaches. They're signed out on every device straight away and can't use Nitume. They see a general "account suspended" message, not your reason. An admin can reactivate a banned account later.` | `They can sign in again with a new code sent to their phone. Devices signed out earlier stay signed out.` |
| Confirm (primary) | `Suspend {who}` | `Ban {who}` | `Reactivate {who}` |
| Busy label | `Suspending…` | `Banning…` | `Reactivating…` |
| Success notice (A-11 success, §6) | `Account suspended. The {who} has been signed out.` | `Account banned. The {who} has been signed out.` | `Account reactivated. The {who} can sign in again.` |

Open tasks are **not** changed by the API on suspend or ban (no errand logic in `UserStatusService`); the dialog must not claim otherwise. Whether ops should be told or the API should act on them is SQ-4.

## 6. Success

- No toast component exists in the admin app (and none in the design system). **Use A-11 `app-inline-notice tone="success"` with `[autoDismissMs]="6000"` and `dismissible`** at the top of the `Account` section (the `_shared.md` default for success notices). A real toast would be a new component pattern: SQ-2.
- On 200: close the dialog; set the chip from `response.user.status` (never from the requested status); prepend `response.change` to the loaded history (no refetch, keeps the cursor valid); recompute the actions; move focus to the `Status` row's chip container (or the first action button) so keyboard users are not left on a removed button; announce through the notice's `role="status"`.
- The runner directory feed (`GET /runners`) carries no account status today, so nothing else in the shell updates. If U-1 adds the status to `GET /runners` items, patch the store item too.

## 7. Errors

`apiError(err)` (A-14) gives `{status, code, extra}`. Mapping *(copy proposed)*:

| Response | Where it shows | Copy | Then |
|---|---|---|---|
| 400 `status_reason_invalid` `{minLength, maxLength}` | field error in the dialog | `Enter a reason of {minLength} to {maxLength} characters.` (Fira Sans: a rule, not data) | keep the dialog open, keep the text |
| 400 other (class-validator: unknown status, id not a UUID) | dialog A-11 danger | `Something went wrong with this request. Close the drawer and try again.` | keep open |
| 403 `cannot_change_own_status` | section A-11 danger | `You can't change your own account.` | close dialog; hide actions for this target |
| 403 `cannot_change_admin_status` | section A-11 danger | `Admin accounts can't be changed here.` | close dialog; hide actions |
| 403 without a code (non-admin) | dialog A-11 danger | `FORBIDDEN_COPY` (`_shared.md` §2) | keep open, confirm disabled |
| 404 `user_not_found` | section A-11 danger | `We couldn't find this account.` | close dialog; hide actions and history |
| 409 `status_unchanged` `{status}` | section A-11 info | `This account is already {Status label of extra.status}. Nothing was changed.` | close dialog; reload status (U-1) and history page 1 |
| 409 `status_transition_not_allowed` `{from, to, allowed}` | section A-11 info | `This account is {Status label of extra.from} now, so it can't be {verb of extra.to}. The latest status is shown.` (verbs: `suspended` / `banned` / `reactivated`) | close dialog; reload status and history page 1 (`allowed` drives the buttons only after the reload confirms it) |
| 401 | — | — | existing auth interceptor (refresh, then `/login`) |
| status 0 / 5xx | dialog A-11 danger | `Couldn't save. Check your connection and try again.` | keep open, keep the reason, confirm re-enabled |

History `GET` errors:

| Response | Copy / behaviour |
|---|---|
| 400 `cursor_invalid` (on `Load more`) | reload page 1 silently, once; a second failure → the generic row below |
| 404 `user_not_found` | as above (section danger `We couldn't find this account.`) |
| 403 | `FORBIDDEN_COPY` |
| status 0 / 5xx | A-11 danger in place of the timeline `Couldn't load the status history.` + `[notice-action]` `.btn-text` `Try again` (refetches the page that failed; already-loaded items stay) |

## 8. Loading and empty

- Status (U-1) loading: chip slot shows `.ops-loading`-style text `Loading…` (12.5 slate-600); no buttons until loaded. Load failure: A-11 danger `Couldn't load this account's status.` + `Try again`; history still loads independently.
- History first page loading: `.ops-loading` `Loading history…`.
- History empty: one `.dt-item` `<b>No status changes yet.</b>` (same shape as the task drawer's `No status transitions recorded`).
- `Load more` busy: `Loading…` (A-12), button disabled.

## 9. Numeric fields (Fira Code)

- Reason counter `{n}/500` (`.field-counter`).
- History times (`.dt-time`, `formatDateTime`) and the `Last changed` time.
- Customer drawer `Phone` (when SQ-3 is approved).
- Not Fira Code: the 10/500 in the hint and in error copy (rules), status labels, actor names, reasons.

## 10. Components

| Piece | Pattern | Exists? |
|---|---|---|
| Drawer shell | A-01 `app-ops-drawer` | exists |
| Status chip | A-02 `app-status-chip`, **new vocabulary `kind="account"`** (labels + variants in §4; same extension mechanism as `availability`, `level`) | exists; vocabulary to add (small extension of an existing component, not a new pattern; tones pending SQ-1) |
| Section, card, rows, timeline, actions | A-05 (`.drawer-section`, `.drawer-label`, `.drawer-card`, `.drawer-row`, `.drawer-timeline`, `.dt-item`, `.dt-time`, `.dt-actor`, `.drawer-actions`) | exists |
| Buttons | A-07 `.btn .btn-outline`, `.btn .btn-primary` (dialog confirm), `.btn-text` | exists |
| Reason dialog | A-08 `app-confirm-dialog` form mode + A-06 `app-form-field` with counter | exists (pattern: `expire-task-dialog.ts`) |
| Notices | A-11 `app-inline-notice` | exists |
| Load more | A-12 `app-load-more` | exists |
| Times | A-13 `formatDateTime` | exists |
| Errors | A-14 `apiError` | exists |
| History actor label | `historyActor()` from `task-drawer.ts:60` | exists; move to `shared-format.ts` and reuse (no copy) |
| Customer drawer | new `DrawerKind` `customer` using A-01 | **missing; pending SQ-3** (a new drawer, not a new component pattern) |
| Toast | — | **not in the design system or the admin app; not used** (SQ-2) |

No Flutter `nitume_core` widget is involved (admin is Angular).

## 11. Data

Built (`feat/api-user-status-audit`, admin role only, WQ-22):
- `PATCH /api/v1/admin/users/:id/status` `{ status: 'active' | 'suspended' | 'banned', reason }` → 200 `{ user: { id, role, status }, change: HistoryItem }`. Errors in §7.
- `GET /api/v1/admin/users/:id/status-history?cursor=&limit=` (newest first, `limit` 1–50, default 20; the UI sends 20) → `{ items: HistoryItem[], nextCursor: string | null }`; errors 400 validation, 400 `cursor_invalid`, 403, 404 `user_not_found`.
- `HistoryItem` = `{ id, fromStatus, toStatus, reason, actorType: 'customer' | 'runner' | 'admin' | 'system', actor: { id, displayName: string | null } | null, createdAt }` (UTC ISO).
- Add both to `AdminDataService` (or a small `AdminUsersService` in `core/services/`) and the types to `core/api-types.ts` (`UserStatus`, `UserStatusHistoryItem`, `UserStatusHistoryPage`, `ChangeUserStatusResult`).
- Signed-in admin id: `AuthStore` decoded token `userId` (`core/auth/auth.store.ts:23`), used to hide the actions on the own account before any request.

Missing (needs: api-contract):
- **U-1 (blocker for the chip and the buttons)** the current account status and role of a user. No admin endpoint returns it: `GET /runners` items have `userId` but no status (`api-types.ts:712`), and the newest history item is not reliable (a status set outside the API, e.g. the seed or SQL, has no history row). Proposed: `GET /api/v1/admin/users/:id` → `{ id, role, status, displayName, phone }` (admin only; 404 `user_not_found`), which also feeds the customer drawer header. Alternative for the runner drawer only: add `userStatus` to `GET /runners` items.
- **U-2 (only for the task drawer → customer drawer link)** the errand detail returns `customerId` = `customer_profiles.id`. Add `customerUserId` (or `customer { userId, displayName }`) to the admin errand detail so the task drawer can open the customer drawer. The refund drawer already has `customer.userId`.
- No socket event reaches the admin: `user.status_changed` is an internal domain event (realtime gateway disconnect), and the admin app has no Socket.IO client. Two admins acting on the same account rely on the 409s in §7; no live refresh is specced.

Task states: none (account-level, not task-level). No task state is shown or changed. Domain words: no wallet/escrow/payment wording on this screen.

## 12. Accessibility

- Buttons are real `<button type="button">`; labels say the action and the audience (`Suspend runner`), never icon-only.
- Dialog: `role="dialog"`, `aria-modal`, `aria-labelledby` (A-08); textarea gets `aria-describedby` (hint + error) and `aria-invalid` from A-06; the counter is visual only (`aria-hidden` not required, but the error text carries the rule).
- Chip text is the status word, so colour is never the only signal.
- Notices: danger `role="alert"`, success/info `role="status"` (A-11).
- After success, focus moves as in §6; after a dialog close by error, focus returns to the section (A-08 restores to the opener; if the opener button no longer exists, to the section label, `tabindex="-1"`).

## 13. Required tests (web-parity)

Component specs next to the files (`*.spec.ts`, Jasmine/Karma as the other drawers):

1. Actions by status: active → `Suspend` + `Ban`; suspended → `Reactivate` + `Ban`; banned → `Reactivate` only; never `Suspend` on banned.
2. No actions when the target role is `admin`, when the target is the signed-in admin (`AuthStore.userId`), and while the status is loading or failed.
3. Chip: `kind="account"` labels `Active` / `Suspended` / `Banned` with the variants agreed in SQ-1 (test asserts the class, so a tone change is one edit).
4. Dialog: confirm disabled for empty, whitespace-only and 9 trimmed characters; enabled at 10 and at 500; counter text `{n}/500` updates on input and renders in `.field-counter`; error copy after blur; reason resets when reopened.
5. Dialog title, body, confirm and busy labels per action and per audience (`runner` / `customer`).
6. PATCH body is `{ status, reason }` with the right target status per action and the user id (runner drawer: `RunnerListItem.userId`, not the profile id).
7. 200: chip from `response.user.status`, `response.change` prepended to the history, success notice text per action, actions recomputed.
8. Every error row in §7: 400 `status_reason_invalid` (field error uses `extra.minLength/maxLength`), 400 other, 403 own, 403 admin, 403 no code, 404, 409 `status_unchanged` (reload + info copy), 409 `status_transition_not_allowed` (reload + info copy with `from`/`to`), status 0.
9. History: first page request `limit=20`; items newest first; line 1 `{from} → {to}` labels; actor text for admin with name, admin without name, system / null actor; time via `formatDateTime` inside `.dt-time` and actor inside `.dt-actor`; reason rendered in `.dt-actor` (Fira Sans), full text.
10. History states: loading, empty (`No status changes yet.`), error + `Try again` refetch, `Load more` appends with the cursor and disappears when `nextCursor` is null, `cursor_invalid` reloads page 1 once.
11. Close guard: a typed reason asks `Discard this reason?` before the drawer closes or switches.
12. Customer drawer (after SQ-3): opens from the refund drawer with `customer.userId`; renders the same section with `customer` copy.
13. Token check in the build: no hex outside `_tokens.scss`, no `font-family` outside the token layer (`rg -n "#[0-9A-Fa-f]{6}" apps/admin/src/app`).

`ng test` and `ng build` clean; `npm run lint` clean if configured.

## 14. Questions for the owner

- **SQ-1 (palette rule, AGENT_BUILD_INSTRUCTIONS §4)** Chip tones: `Active` = info (blue), `Suspended` = amber, `Banned` = red. Red is defined as "disputes / failed only", so using it for `Banned` widens its meaning. Approve red for `Banned`, or use the neutral slate chip? Recommended: red (a ban is the most serious account state and red stays chip-sized). Also confirm `Active` is blue, not green (green is for complete states).
- **SQ-2 (component pattern)** The brief asks for a success toast; there is no toast in the design system or the admin app. Use the existing inline success notice (A-11, auto-dismiss after 6 s) at the top of the `Account` section, or add a toast component? Recommended: inline notice (no new pattern).
- **SQ-3 (scope)** There is no customer drawer or customer list in the admin. Add a `Customer` drawer (existing drawer pattern) holding the customer's name, phone and this `Account` section, opened from the refund drawer now and from the task drawer once U-2 lands? Or show the section inside the task drawer instead? Recommended: the new drawer (one place per account, same as the runner drawer). A customer search/list is not proposed.
- **SQ-4 (product)** Suspending or banning does not touch the user's open tasks (API: no task logic). Should the dialog tell ops to handle them (e.g. `Open tasks are not changed. Reassign or cancel them from the task queue.`), should the API block or act on them, or neither for MVP? Recommended: the dialog sentence now, any automation later.
- **SQ-5 (design detail)** The history timeline uses the mockup's green dot for every entry, including bans. Keep the existing timeline as is (consistent with the task drawer), or does a ban entry need a different marker? Recommended: keep as is (a red or amber dot would be a new pattern).
- **SQ-6 (copy)** Confirm all copy marked *(proposed)*: section label `Account`, buttons, the three dialogs, hint, validation and error texts, success notices, empty/loading texts.

## 15. Current vs design

- Runner drawer (`runner-drawer.ts:15-75`): profile card and `View payouts` only. No account status, no actions, no history. The mockup's `Suspend runner` button (`nitume_admin_dashboard.html:507`) is not built. → G24-1, G24-3 … G24-8.
- Customer drawer: does not exist. → G24-2 (after SQ-3).
- A-02 has no account vocabulary (`status-chip.component.ts:116`). → G24-3.
- No client for the two endpoints, no types. → G24-9.
- `historyActor()` lives in `task-drawer.ts:60`; must be shared, not copied. → G24-6.
