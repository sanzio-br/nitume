# drawer-task-offer — Runner offer section of the task drawer, lapsed offers, re-offer and expiry

- Mockup: `docs/design/nitume_admin_dashboard.html` task drawer `Runner` section (lines 440–446: avatar, name, `Verified · 4.9 · 137 tasks`) and actions (lines 467–470: `Cancel task`, `Reassign runner`); queue rows (lines 319–324: `Unmatched` tag, `Assign` / `View`); drawer `Timeline` (lines 448–457). The offer states, the deadline states and the expire action are **not drawn. EXTENDS MOCKUP** (rows 113, 114, 141, 150, 155–157, 167, 177–179, 185–187, 201). Copy not in the mockup is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3.1 times, §6.1 offer chips, §7 N-20)
- Placed in: `drawer-task` (new `Runner` section, replaces the `Assign runner` button in `Admin actions`) and `p-queue` (status column, row action)
- Implementation: `apps/admin/src/app/features/admin/drawers/task-drawer.ts` (assign dialog, `taskActions`, `Status history`), `panels/task-queue.panel.ts` (`rowAction`) on `main`
- Status: partial (assign exists for PAYMENT_CONFIRMED only; no offer, decline, lapse or deadline state; no re-offer from RUNNER_ASSIGNED; no expire action)

## Purpose
Show ops who the task is offered to and until when, what happened to the offer (accepted, declined, lapsed), and let them offer a RUNNER_ASSIGNED task to another runner when the offer was declined or has lapsed. Row 157 (owner, 2026-10-16): "an admin offer that reaches its deadline expires, but the task stays RUNNER_ASSIGNED so the admin can offer/reassign another runner; EXPIRED only when the task/matching process finds no further runner can be assigned."

When a RUNNER_ASSIGNED task expires (System Design §3.3 "Offer lapse"):
- **Row 185 (owner, 2026-10-16)**: "RUNNER_ASSIGNED has two independent paths to EXPIRED: (1) the customer deadlineAt is reached with no runner accepted; (2) matching exhausted. The deadline takes precedence: once deadlineAt has passed the task is no longer offered or reassigned. A single lapse or decline still never expires the task."
- **Row 167** defines exhaustion: "every eligible runner in the configured service-area/category pool has declined, let the offer lapse, or become ineligible/unavailable before accepting."
- **Row 187 (a)**: an online pool that is only temporarily empty never expires the task. The server re-checks; there is no time rule.
- **Row 187**: ops get an audited safety action, "Expire task — no runner available", for a task that is genuinely eligible for expiry.

So ops need to see the customer deadline, how many eligible runners are left, and what happened when the task expired.

## Task states
- PAYMENT_CONFIRMED: no offer yet → `Assign runner` (as built).
  - **Past its deadline (proposed, BOARD row 201 open)**: the task stays PAYMENT_CONFIRMED for ops. Row 187 (b): "a paid task that cannot be offered never auto-expires; it stays non-terminal for ops; no PAYMENT_CONFIRMED → EXPIRED". It shows the `Deadline passed` flag below.
- RUNNER_ASSIGNED always has a latest assignment. Its status gives the sub-state (no new task state, §3.3):
  - **Offered**: assignment `assigned` (the built name of an open offer) with `offerExpiresAt` in the future (or null, pre-change offers, row 156).
  - **Offer ended**: assignment `expired`, or `assigned` with `offerExpiresAt` in the past (the expiry job has not run yet; the server already refuses the accept, `offer_expired`). Task still RUNNER_ASSIGNED (row 157).
  - **Declined**: assignment `declined` (with `declineReason`, e.g. `over_purchase_limit`). Task still RUNNER_ASSIGNED (row 155).
  - **Deadline passed** (row 185): `deadlineAt` is at or before now and no runner accepted, but the task is not EXPIRED yet because the sweep has not run. This sub-state takes precedence over the three above. It is **read-only**: no Reassign and no Expire. The server already refuses assign (409 `task_deadline_passed`).
- RUNNER_EN_ROUTE and later: assignment `accepted` → the mockup `Runner` card only. Row 185 covers RUNNER_ASSIGNED only; a passed deadline changes nothing in later states.
- EXPIRED: read-only, no action. One of three variants, chosen by how the task expired (`expiry.trigger`, Data):
  - **Deadline passed** (row 185).
  - **Matching exhausted** (row 167).
  - **Expired by ops** (row 187).

## Layout: `Runner` section (drawer-task, after Locations, before Quote)
`.drawer-label` `Runner`, then one `.drawer-card`:
1. Runner row (mockup): avatar (initials, `.verif-avatar`), short name 13.5/600, caption Fira Code 11 slate-600 `Verified · 4.9 · 137 tasks` (from the runner summary). Hidden when the task was never offered (PAYMENT_CONFIRMED).
2. `Deadline` row: `.drawer-row` `Deadline` → `deadlineAt` (12-hour EAT, Fira Code). Shown in every PAYMENT_CONFIRMED, RUNNER_ASSIGNED and EXPIRED sub-state when `deadlineAt` is set. When it is not set the row reads `No deadline` (Fira Sans).
3. State line, by sub-state:
   | Sub-state | Chip (A-02, §6.1) | `.drawer-row`s | Caption 12 slate-600 |
   |---|---|---|---|
   | Offered | `Offered` (pending) | `Offered at` → `assignedAt`; `Offer ends` → the earlier of `offerExpiresAt` and `deadlineAt` (EAT, Fira Code) plus a live `{m:ss} left` (Fira Code, client clock, stops at 0) | `Waiting for {runner} to accept.` |
   | Offered, no deadline (row 156) | `Offered` (pending) | `Offered at` | `This offer has no deadline.` |
   | Offer ended | `Offer ended` (pending: ops must act) | `Offered at`; `Ended` → `offerExpiresAt` (EAT, Fira Code); `Eligible runners left` → `{n}` (Fira Code, row 167) | `{runner} didn't accept in time. The task is still waiting for a runner.` |
   | Declined | `Declined` (pending: ops must act) | `Offered at`; `Declined` → `decidedAt`; `Reason` → `Above their purchase limit` when `declineReason = over_purchase_limit`, else `No reason given`; `Eligible runners left` → `{n}` (Fira Code, row 167) | `The task is still waiting for a runner.` |
   | Deadline passed (RUNNER_ASSIGNED, row 185) | `Deadline passed` (info) | `Last offer` → `{runner} · {Offered \| Offer ended \| Declined}` | `The customer's deadline has passed, so this task is no longer offered. It moves to Expired automatically.` |
   | Accepted (EN_ROUTE …) | none (the task chip shows the state) | none | none |
   | Expired: deadline passed (row 185) | `Deadline passed` (info; the task chip already reads `Expired`) | `Last offer` (when there was one); `Expired at` → the RUNNER_ASSIGNED → EXPIRED history time (EAT, Fira Code); `Runners tried` → `{n}` (Fira Code) | `The customer's deadline passed before any runner accepted. The task has expired.` plus the refund line below |
   | Expired: matching exhausted (row 167) | `No runners left` (info) | `Last offer` → `{runner} · {Offer ended \| Declined}`; `Expired at`; `Runners tried` → `{n}` | `Every eligible runner for this area and category declined, let the offer lapse, or became unavailable. The task has expired.` plus the refund line below |
   | Expired by ops (row 187) | `Expired by ops` (info) | `Expired by` → admin display name; `Expired at`; `Reason` → the admin's reason (admins only); `Runners tried` → `{n}` | `An admin expired this task because no runner was available.` plus the refund line below |
   | PAYMENT_CONFIRMED past deadline (proposed, row 201 open) | `Deadline passed` (pending: ops must act) | none beyond `Deadline` | `The customer's deadline passed before this task was offered. It stays here for ops to handle.` |

   Refund line for every EXPIRED variant of a paid task: `A refund review was opened.` with a link `View refund review` (an A-07 text button → `p-refunds` filtered to the task, trigger `expired_after_payment`, row 102).
4. Previous offers (only when the task has more than one assignment): a collapsed `.drawer-row` `Earlier offers` → `{n}` (Fira Code). Expanding lists each as `{runner} · {Offer ended | Declined} · {time}` (Fira Code time), newest first. Read-only.

Actions (`.drawer-actions` of the section):
- PAYMENT_CONFIRMED: primary `Assign runner` (built dialog, unchanged). Past its deadline (proposed, row 201): no `Assign runner`, because assign answers 409 `task_deadline_passed`. Which action ops then use is an open question: §3.3 gives PAYMENT_CONFIRMED no exit other than RUNNER_ASSIGNED.
- Offered: none. Ops wait; there is no withdraw action (out of scope).
- **Offer ended or Declined**, deadline not passed:
  - **Reassign runner** (mockup label), primary: opens the same dialog as `Assign runner`.
    - Title `Reassign runner`, confirm `Send offer`.
    - A line 12 slate-600 under the title: `The new runner has 10 minutes to accept.` (`10` = the admin offer window from the API, Fira Code span). When the deadline comes before the end of the window: `The new runner has until {deadline time} to accept.` (time Fira Code).
    - **Runner list (rows 167, 177, 178, 186, 187 (c); System Design §3.3 "Pool")**: the task's eligible pool from the API, ranked as matching v1. These are runners not yet tried for this task who are online, eligible and not on another accepted or active task. Two groups appear only under the list, greyed (slate-400 text), not selectable, each with its reason:
      - Runners who already declined this task or let an offer for it lapse (row 178): `Already offered`.
      - Runners whose purchase limit is below the task's required purchase (row 186, no approved exception): `Above their purchase limit · KSh {limit} limit, task needs KSh {purchase}` (amounts Fira Code).
    - Offline (row 177), otherwise ineligible and busy runners (row 187 (c)) are not listed.
    - Row 178 applies now, even before the full pool exists (it needs only the task's offer history). Row 186 needs only the runner's limit and the task's purchase, so it also applies now.
    - **Empty list**: the dialog shows 12 slate-600 `No eligible runners are available right now.` and `Send offer` stays disabled. The task stays RUNNER_ASSIGNED: the list read never expires it, and an empty online pool alone never does (row 187 (a)).
    - Call: `POST /errands/:id/assign` `{ runnerProfileId, note? }`. This is the existing assign endpoint, already built: it reassigns a RUNNER_ASSIGNED task with no open assignment, with no state change. Success notice A-11 `Offer sent to {runner}.`
  - **Expire task — no runner available** (row 187, owner name for the action): an A-07 `.btn-outline` button after `Reassign runner`. Shown only when the API says the task may be expired (`canExpireNoRunner`, Data). See "Expire task" below.
- **Deadline passed** (RUNNER_ASSIGNED, or any EXPIRED variant): no actions. The section is read-only.
- Cancel stays where it is today (admin RUNNER_ASSIGNED → CANCELLED, §3.3); it is not part of this section, and this spec does not change it.

## Expire task — no runner available (row 187)
The owner approved this action as an ops safety mechanism: "audited (admin, timestamp), only available when the task is genuinely eligible for expiry under the operational rules". It uses the existing RUNNER_ASSIGNED → EXPIRED transition, with its actor now S, A (System Design §3.3, row 187). It adds no state and no transition.

**When it shows (proposed, design-auditor; flagged for the owner)**. All of these must hold:
1. The task is RUNNER_ASSIGNED.
2. It has no open offer: the latest assignment is `declined` or `expired`.
3. The deadline has not passed, or there is no `deadlineAt`. After the deadline the system expires the task itself.
4. No eligible runner is left to offer it to: `eligibleRemaining = 0`, meaning every online, eligible runner was tried or is excluded.

Before the full pool exists (row 179, no automatic expiry yet), point 4 counts the built candidate list minus the row-178 and row-186 exclusions. The server decides and exposes `canExpireNoRunner`; the client never recomputes it. This is where the action matters most: row 187 (a) never auto-expires a task whose online pool is merely empty for now, so an admin may judge that no runner will come.

**Confirm dialog** (A-08, with an A-06 field):
- Title `Expire this task?`
- Body 13 slate-600: `No runner is available for {task title}. The task moves to Expired and can't be offered again. The customer is told no runner was available.`. For a paid task, add: ` A refund review opens because the task was paid.`
- Field `Reason`, **required (proposed, flagged)**:
  - 10–500 characters after trimming; whitespace only is invalid (the same rule as the payout-cancel reason, row 169).
  - Counter `{n}/500` (Fira Code).
  - Hint 11.5 slate-600, plain text (a rule, Fira Sans; A-06 opt-out): `Kept in the task history for audit. The customer and runners don't see it.`
  - Under 10 characters, on blur or confirm: `Enter at least 10 characters.`
- Buttons: outline `Back` and primary `Expire task` (A-08 convention). `Expire task` is enabled at 10+ characters.

**Result**:
- RUNNER_ASSIGNED → EXPIRED with actor `admin`. The `errand_status_history` row records the admin id, the time and the reason (`actorType`, `actorId`, `createdAt`, `note`); no schema change.
- Side effects, as on every RUNNER_ASSIGNED → EXPIRED: the customer `errand.EXPIRED` notification (unchanged copy), a refund review for a paid task (row 102), and the admin feed.
- Success notice A-11 `Task expired.`
- The section switches to **Expired by ops**.
- The queue row leaves `Needs a runner`.

**Activity row** (the built `Status history` timeline, `task-drawer.ts:157-176`): `Assigned → Expired`, caption `Admin · {admin name} · {time}` (time Fira Code), then the reason in quotes on its own line, as built for notes. The admin's name needs `actor { id, displayName }` on history items (Data); until then the caption reads `Admin · {time}`, as built.
- The system expiries show `System · {time}` and the history note set by the API.
- Proposed notes: `Customer deadline passed` (row 185) and `No eligible runners left` (row 167).

**Errors**:
- 409 `expiry_not_allowed`: close the dialog, reload, and show a notice by `reason`:
  - `eligible_runners_remain` → `Eligible runners are still available. Offer the task to one of them.`
  - `open_offer` → `This task has an open offer. Wait for the runner to answer.`
  - `deadline_passed` → `The deadline has passed, so this task expires automatically.`
  - otherwise → `This task changed. Check the latest offer.`
- 409 `illegal_transition` → reload, `This task changed. Check the latest offer.`
- 400 `expiry_reason_invalid` → field error `Give a reason (10–500 characters).`
- 403 → `FORBIDDEN_COPY`.
- Any other error → `Couldn't expire the task. Try again.`

Codes are proposals; api-contract names them.

Errors (assign / reassign):
- 409 `task_deadline_passed` (row 185; api-contract proposal on `feat/api-runner-1`) → close the dialog, reload, notice A-11 info `The customer's deadline has passed, so this task can't be offered again.`
- 409 `matching_exhausted` (the task expired while the dialog was open) → close the dialog, reload, notice A-11 info `No eligible runners are left, so this task has expired.`
- 409 `runner_not_eligible`:
  - with `reason: over_purchase_limit` (row 186) → reload the list, notice `This runner's purchase limit is below this task's purchase. Choose another runner.`
  - any other reason (the chosen runner became ineligible, unavailable or busy) → reload the list, notice `That runner can't take this task any more. Choose another runner.`
- 409 the task already has an open offer or moved on → reload, notice `This task changed. Check the latest offer.`
- 403 → `FORBIDDEN_COPY`; 404 → `That runner or task no longer exists.` (built copy); other → `Couldn't send the offer. Try again.`

## Queue (`p-queue`)
- **Status column**: the task chip as today, plus a second chip in `.chip-stack`:
  - RUNNER_ASSIGNED: `Offered` (pending) while an offer is open, `Offer ended` (pending) after a lapse, `Declined` (pending) after a decline. These are the same chips as the drawer. (The mockup's `Unmatched` tag is the closest drawn label; `Offer ended` / `Declined` say why, proposed.)
  - **Deadline passed** (row 185): `Deadline passed` (info) on a RUNNER_ASSIGNED task past `deadlineAt` that has not expired yet. It replaces the offer chip.
  - **PAYMENT_CONFIRMED past its deadline** (proposed, row 201 open): `Deadline passed` (pending).
  - The client takes the flag from the server (`deadlinePassed`, Data). If the server sends none, it compares `deadlineAt` with the client clock and re-reads on the next refresh.
- **Row action**:
  - `Assign` for PAYMENT_CONFIRMED (built).
  - `Reassign` (proposed) for RUNNER_ASSIGNED with an ended or declined offer.
  - `View` otherwise. That includes every task whose deadline has passed: it opens the read-only drawer, and a PAYMENT_CONFIRMED task past its deadline shows no `Assign` (row 201, proposed).
  - The action opens the drawer, as built.
- **Filter** (proposed): a `Needs a runner` quick filter = PAYMENT_CONFIRMED plus RUNNER_ASSIGNED with an ended or declined offer.
  - RUNNER_ASSIGNED tasks past their deadline are excluded.
  - PAYMENT_CONFIRMED tasks past their deadline stay in, with their `Deadline passed` chip, so ops see them (proposed, row 201).

## Live updates
These refresh the drawer and the queue row; an open drawer re-reads `GET /errands/:id` on any of them:
- Admin feed item `assignment_declined` (built).
- New feed item `assignment_expired` / `Offer ended` (N-20, to build).
- `matching_exhausted` (`Matching exhausted · {task}`, row 167, to build).
- New `deadline_passed` (row 185, proposed): `Deadline passed · {task}` when a RUNNER_ASSIGNED task expires at its deadline. For a PAYMENT_CONFIRMED task (row 201, proposed, one item per task): `Deadline passed, not offered · {task}`.
- `errand:status_changed` to EXPIRED switches the drawer to the matching EXPIRED variant.

Fallbacks until the feed items exist:
- The client switches Offered → Offer ended on its own clock at `offerExpiresAt`.
- It switches to Deadline passed at `deadlineAt`.
- In both cases it re-reads on the next refresh.

## Copy
Exact, from the mockup: `Runner`, `Reassign runner`, `Verified · 4.9 · 137 tasks` (sample), `Assign`, `View`.

Exact, from the owner (row 187): `Expire task — no runner available`.

Everything else proposed:
- Offer states: `Offered`, `Offer ended`, `Declined`, `Offered at`, `Offer ends`, `{m:ss} left`, `Ended`, `Reason`, `Above their purchase limit`, `No reason given`, `Waiting for {runner} to accept.`, `This offer has no deadline.`, `{runner} didn't accept in time. The task is still waiting for a runner.`, `The task is still waiting for a runner.`, `Earlier offers`.
- Reassign dialog and queue: `Send offer`, `The new runner has 10 minutes to accept.`, `The new runner has until {deadline time} to accept.`, `Offer sent to {runner}.`, `Already offered`, `Above their purchase limit · KSh {limit} limit, task needs KSh {purchase}`, `Reassign`, `Needs a runner`, `Eligible runners left`.
- Deadline: `Deadline`, `No deadline`, `Deadline passed`, `Last offer`, `The customer's deadline has passed, so this task is no longer offered. It moves to Expired automatically.`, `The customer's deadline passed before any runner accepted. The task has expired.`, `The customer's deadline passed before this task was offered. It stays here for ops to handle.`.
- EXPIRED variants: `No runners left`, `Expired at`, `Runners tried`, `Every eligible runner for this area and category declined, let the offer lapse, or became unavailable. The task has expired.`, `Expired by ops`, `Expired by`, `An admin expired this task because no runner was available.`, `A refund review was opened.`, `View refund review`.
- Expire dialog: `Expire this task?`, the dialog body, `Kept in the task history for audit. The customer and runners don't see it.`, `Enter at least 10 characters.`, `Expire task`, `Task expired.`.
- Errors: every error notice above.
- Feed: `Matching exhausted · {task}`, `Deadline passed · {task}`, `Deadline passed, not offered · {task}`.

No copy says the task expired after a single lapse or decline. No copy mentions a wallet, escrow or a hold, and none promises a payout time.

## Numeric fields (Fira Code)
- Times (12-hour EAT, §3.1): `Deadline`, `Offered at`, `Offer ends`, `Ended`, `Declined`, `Expired at`, and the deadline time in the Reassign line.
- The `{m:ss} left` countdown.
- Counts: the earlier-offers count and times, `Eligible runners left`, `Runners tried`, the reason counter `{n}/500`.
- Amounts: the purchase limit and the task purchase in the greyed reason.
- Captions: the rating, the task count and `10` (minutes).
- History caption times.

## Data
- **Built on `main`**:
  - `GET /errands/:id` and `GET /errands` items carry `assignment { id, status, assignedAt, offerExpiresAt, runner { …public summary } }`. It is filled **only from `ACTIVE_ASSIGNMENT_STATUSES` (`assigned`, `accepted`)** (`errands.service.ts:89`, `:600-640`). After a decline or a lapse `assignment` is null, so `Offer ended`, `Declined`, the queue chips and `Reassign runner` cannot be derived from it today. Only Offered can, plus Offer ended from a past `offerExpiresAt` before the sweep runs.
  - `deadlineAt` on the errand (nullable; `CreateErrandDto.deadlineAt?` is optional).
  - `POST /errands/:id/assign` (offer, 10 min, `MATCHING_ADMIN_OFFER_WINDOW_SECONDS`).
  - The `assignment_declined` admin feed item.
  - `GET /errands/:id/purchase-check?runnerProfileId=` (purchase limit before offering).
  - `GET /errands/:id/history` (`actorType`, `actorId`, `note`, `createdAt`; no actor name).
  - `PATCH /errands/:id/status` (admin transitions with `note`).
- **Must change (api-contract, row 157)**: the offer-expiry job (`expireLapsedOffers`) sets the assignment `expired` and **leaves the task RUNNER_ASSIGNED**. Fixed on `feat/api-owner-answers-9`, now on `main`. No customer notification on a lapse (the task did not change).
- **Missing (N-20)**:
  - The errand views expose the latest assignment whatever its status (or a `lastAssignment`).
  - `declineReason` and `decidedAt` on the assignment view.
  - An `assignment_expired` admin feed item.
  - The offer window in seconds, on the errand view or as a config read (for the `10 minutes` line).
  - The list of earlier assignments (e.g. `assignments[]` on the admin detail), for `Earlier offers` and for excluding runners already offered.
  - An assignment `status` filter on `GET /errands`, for the `Needs a runner` filter.
- **Deadline (row 185, api-contract on `feat/api-runner-1`)**:
  - The sweep moves RUNNER_ASSIGNED → EXPIRED (S) at `deadlineAt` with no accepted offer. The history note is `Customer deadline passed` (proposed). It closes any open offer as `expired`. Side effects: history, `errand.EXPIRED` to the customer, a refund review when paid, and the admin feed item `deadline_passed`.
  - Assign answers 409 `task_deadline_passed` from `deadlineAt` on.
  - Proposed `deadlinePassed: boolean` on admin errand list and detail items (server clock).
  - The deadline path needs no pool, so row 179 does not hold it back.
- **Paid task never offered (row 201, proposed, pending)**:
  - No state change at the deadline. One admin feed item `deadline_passed` per task (`Deadline passed, not offered · {task}`).
  - `deadlinePassed` on the item.
  - Assign refused with 409 `task_deadline_passed` (proposed; flagged with row 201).
- **Expiry trigger (proposed)**: `expiry { trigger: 'deadline_passed' | 'matching_exhausted' | 'admin_no_runner', at, by { id, displayName } | null, note | null }` on the admin errand view of an EXPIRED task. It is derived from the RUNNER_ASSIGNED → EXPIRED history row (actor and note), so no schema change. On `GET /errands/:id/history` items, add `actor { id, displayName } | null` for the admin name in the activity row.
- **Admin expire (row 187, proposed)**:
  - The route is either the existing `PATCH /errands/:id/status` `{ to: 'EXPIRED', note }` with the admin actor allowed and a guard, or a dedicated `POST /errands/:id/expire` `{ reason }`. api-contract chooses.
  - The guard covers: RUNNER_ASSIGNED; no open offer; deadline not passed; `eligibleRemaining = 0`. Otherwise 409 `expiry_not_allowed` with `reason` (`not_runner_assigned` | `open_offer` | `deadline_passed` | `eligible_runners_remain`).
  - The reason is required, 10–500 after trimming (400 `expiry_reason_invalid`).
  - Expose `canExpireNoRunner: boolean` on the admin errand view.
  - Side effects are the same as the system expiry.
- **Matching exhausted (rows 167, 177–179, 186, 187, decided 2026-10-16; to build, api-contract N-20)**:
  - **Eligible pool per task** (System Design §3.3 "Pool"):
    - Online: offline runners are never in the pool (row 177).
    - Eligible for the category: approved verification, active account, category in `skills`.
    - Inside a `service_areas` entry, once areas exist.
    - Not on another accepted or active task (row 187 (c)).
    - Purchase limit at or above the task's required purchase (row 186, decided). The owner allows "an approved exception"; no record approves one before an offer today (flagged).
    - Runners who declined or let an offer for this task lapse are excluded (row 178).
  - **Proposed `GET /errands/:id/candidates`** (admin) → `{ items: [{ runnerProfileId, displayName, rating, tasksCompleted, distanceKm, score, tried: null | 'declined' | 'expired', ineligibleReason: null | 'over_purchase_limit', purchaseLimit }], eligibleRemaining, triedCount, requiredPurchase }`.
    - Items with `tried` or `ineligibleReason` are returned so the dialog can grey them out.
    - The Reassign dialog uses it, as does `Eligible runners left` (the errand admin view may carry `eligibleRemaining` instead; api-contract's choice).
  - **Assign** refuses an over-limit runner with 409 `runner_not_eligible` `{ reason: 'over_purchase_limit' }` (row 186), replacing the earlier `purchase_limit_exceeded` proposal. Other ineligible or busy runners get `runner_not_eligible` with their own `reason`.
  - **Server check** (**proposed**, design-auditor; api-contract to confirm):
    - It runs after every decline and every offer lapse (the expiry sweep) only, **not** on the candidates read. A GET that can move a task to EXPIRED is a read with a state side effect, unsafe on retries and prefetch, so `GET /errands/:id/candidates` only reports `eligibleRemaining`.
    - Row 187 (a): an empty **online** pool alone never expires the task. The server re-checks later (next sweep, or a runner coming online), with no time rule.
    - On a genuine exhaustion: RUNNER_ASSIGNED → EXPIRED (S), a history row (note `No eligible runners left`, proposed), `errand.EXPIRED` to the customer (`v-notifications.md`), a refund review for a paid task (row 102), and the admin feed item `matching_exhausted`.
    - Never on a single decline or lapse while `eligibleRemaining > 0`.
    - Exactly what counts as "genuine" exhaustion, given row 187 (a), is flagged for the owner.
  - **Dependencies**: RA-10 (category skills, ops-configured service areas, and a rule placing the task location in an area) and RA-1 (per-task decline/expiry history). Row 179 (decided): no automatic expiry by exhaustion until service areas and the full eligible pool exist; tasks may stay RUNNER_ASSIGNED meanwhile. Until then:
    - `Eligible runners left` is hidden.
    - The dialog lists runners as built, minus the row-178 and row-186 exclusions.
    - `canExpireNoRunner` follows that list.

## Customer and runner (what they see; their specs own the copy)
- **Customer**: every EXPIRED path looks the same: chip `Expired`, `No runner accepted your task in time.` / `Start a new task`, and the `errand.EXPIRED` notification with exact title `No runner available` (row 188) and the row-158 body. No new customer copy. Before the sweep, a RUNNER_ASSIGNED task past its deadline still reads `Finding a runner` (row 176). A PAYMENT_CONFIRMED task past its deadline (row 201) changes nothing for the customer (proposed; flagged). See `docs/specs/customer/v-notifications.md`, `v-task-detail.md`, `_shared.md` §6.
- **Runner**: an open offer that ends at the deadline disappears like any ended offer. Copy: `That offer is no longer available.`, plus the existing `job.offer_withdrawn` feed item. A runner never learns how the task ended. No new runner copy. See `docs/specs/runner/_shared.md` §6, `v-jobs.md`, `v-job-detail.md`.

## Accessibility
- The countdown is not announced every second: it is announced at open and at 1 minute left.
- Chips carry text.
- `Reassign runner` and `Expire task — no runner available` have 40 px targets, like the other drawer buttons.
- The expire dialog traps focus, with initial focus on `Back` (A-08). The reason field wires its hint and error with `aria-describedby`.
- Greyed runners in the list are `aria-disabled` and their reason is read.

## Owner decisions applied
Rows 113, 114, 134, 141, 150, 155, 156, 157, 167, 177, 178, 179, 185 (deadline path, decided), 186 (purchase limit in the pool), 187 (empty online pool, no PAYMENT_CONFIRMED → EXPIRED, busy runners ineligible, admin expire action), 188 (exact customer title, customer specs) (`_shared.md` §1). Row 201 is applied as proposed, pending.

## Open questions for the owner
Decided: AQ-12 (BOARD row 167, matching exhausted), AQ-17 (row 177, offline = unavailable), AQ-18 (row 178, declined/lapsed runners excluded), AQ-19 (row 179, no automatic expiry until the full pool exists), row 185 (deadline path), row 186 (purchase limit) and RQ-31 (row 176, customer label `Finding a runner`, customer specs only; this drawer keeps the admin labels).

New:
- **Row 201 (open)**: does a paid PAYMENT_CONFIRMED task past its deadline stay for ops, flagged `Deadline passed` with one ops feed item? It is specced as proposed. Follow-up: what may ops then do with it? §3.3 has no PAYMENT_CONFIRMED → CANCELLED or → EXPIRED, and assign would be refused after the deadline. Options:
  - (a) Allow assign after the deadline, once ops agree a new time with the customer.
  - (b) Add an admin PAYMENT_CONFIRMED → CANCELLED (a new transition, the owner's call).
  - (c) Leave it to Support outside the app.
- **AQ-22, admin expire rule (row 187)**: is the action available exactly when the task is RUNNER_ASSIGNED, with no open offer, before its deadline, and no eligible online runner left who was not tried or excluded? It is proposed to show even when runners exist who are only offline or busy, since that is the case auto-expiry never handles (row 187 (a)).
- **AQ-23, expire reason**: is the reason required, at 10–500 characters (proposed, like the payout-cancel reason), or optional?
- **AQ-24, genuine exhaustion vs row 177**: row 177 says offline runners don't block exhaustion; row 187 (a) says an empty online pool never expires a task. Proposed reading: a task auto-expires by exhaustion only when no runner who is eligible apart from being offline or busy is left untried. Confirm.
- **AQ-25, deadline and an open offer**: when `deadlineAt` passes while an offer is open, does that offer end at once (proposed: "no longer offered", row 185), or may the runner still accept until `offerExpiresAt`?
- **AQ-26, no deadline**: `deadlineAt` is optional on create. Should every errand carry one, or do tasks without one rely on exhaustion and the admin action only?
- **AQ-27, "approved exception" before an offer (row 186)**: the only purchase-limit exception today is the reimbursement-review override (row 142), recorded after the task. Is there meant to be a pre-offer exception? If yes, who approves it and where is it stored (schema)? Until then, every runner below the limit is ineligible.

## Current vs design
`main`: the drawer's `Assign runner` shows only at PAYMENT_CONFIRMED (`task-drawer.ts:22-23`) and says `Runner assigned.` on success (`:305`). The queue's `Assign` shows only at PAYMENT_CONFIRMED (`task-queue.panel.ts:136-137`). There is no `Runner` section, no offer, decline, lapse or deadline state, no way to re-offer a RUNNER_ASSIGNED task and no expire action. The `Status history` shows the actor type and the note but no admin name (`:157-176`).

Fix list (web-parity, after api-contract):
1. blocker: `Runner` section with the sub-states above.
2. blocker: `Reassign runner` for ended or declined offers (RUNNER_ASSIGNED), reusing the assign dialog.
3. minor: success copy `Offer sent to {runner}.` instead of `Runner assigned.` (the assign makes an offer, row 113).
4. minor: queue chip and `Reassign` row action.
5. blocker (row 167, after api-contract): `Eligible runners left`, the eligible-pool Reassign list, the Matching exhausted state and the `matching_exhausted` / `runner_not_eligible` errors.
6. blocker (row 185, after api-contract `feat/api-runner-1`): the `Deadline` row, the Deadline passed sub-state (read-only, no Reassign), the Expired: deadline passed variant, the queue `Deadline passed` chip with `View` and the exclusion from `Needs a runner`, and the `task_deadline_passed` error.
7. blocker (row 186): runners below the purchase limit greyed with their reason in the Reassign list; the `runner_not_eligible` `over_purchase_limit` notice.
8. blocker (row 187, after api-contract): `Expire task — no runner available` (button, confirm with reason, result, activity row with the admin name, errors), shown only on `canExpireNoRunner`; the Expired by ops variant.
9. minor (row 201, pending): the PAYMENT_CONFIRMED `Deadline passed` flag, chip and feed item. Build it only once row 201 is answered.
