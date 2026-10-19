# drawer-task-offer — Runner offer section of the task drawer, lapsed offers, re-offer and expiry

- Mockup: `docs/design/nitume_admin_dashboard.html` task drawer `Runner` section (lines 440–446: avatar, name, `Verified · 4.9 · 137 tasks`) and actions (lines 467–470: `Cancel task`, `Reassign runner`); queue rows (lines 319–324: `Unmatched` tag, `Assign` / `View`); drawer `Timeline` (lines 448–457). The offer states, the deadline states and the expire action are **not drawn. EXTENDS MOCKUP** (rows 113, 114, 141, 150, 155–157, 167, 177–179, 185–187, 201–216). Copy not in the mockup is **(proposed)** unless it is marked as owner copy.
- Shared conventions: `docs/specs/admin/_shared.md` (§3.1 times, §6.1 offer chips, §7 N-20)
- Placed in: `drawer-task` (new `Runner` section, replaces the `Assign runner` button in `Admin actions`) and `p-queue` (status column, row action)
- Implementation: `apps/admin/src/app/features/admin/drawers/task-drawer.ts` (assign dialog, `taskActions`, `Status history`), `panels/task-queue.panel.ts` (`rowAction`) on `main`
- Status: partial (assign exists for PAYMENT_CONFIRMED only; no offer, decline, lapse or deadline state; no re-offer from RUNNER_ASSIGNED; no expire action of either kind). Round 12 (owner rows 201–218, 2026-10-19) adds the PAYMENT_CONFIRMED `Expire task` action, the decline reasons and offline runners in the Reassign dialog.

## Purpose
Show ops who the task is offered to and until when, what happened to the offer (accepted, declined, lapsed), and let them offer a RUNNER_ASSIGNED task to another runner when the offer was declined or has lapsed. Row 157 (owner, 2026-10-16): "an admin offer that reaches its deadline expires, but the task stays RUNNER_ASSIGNED so the admin can offer/reassign another runner; EXPIRED only when the task/matching process finds no further runner can be assigned."

When a RUNNER_ASSIGNED task expires (System Design §3.3 "Offer lapse"):
- **Row 185 (owner, 2026-10-16)**: "RUNNER_ASSIGNED has two independent paths to EXPIRED: (1) the customer deadlineAt is reached with no runner accepted; (2) matching exhausted. The deadline takes precedence: once deadlineAt has passed the task is no longer offered or reassigned. A single lapse or decline still never expires the task."
- **Row 167** defines exhaustion: "every eligible runner in the configured service-area/category pool has declined, let the offer lapse, or become ineligible/unavailable before accepting."
- **Row 187 (a)**: an online pool that is only temporarily empty never expires the task. The server re-checks; there is no time rule.
- **Row 187**: ops get an audited safety action, "Expire task — no runner available", for a task that is genuinely eligible for expiry. Its rule (row 202) and required reason (row 203) are decided; RUNNER_ASSIGNED → EXPIRED by S or A is confirmed (row 208).
- **Row 201 (owner, 2026-10-19)**: "keep PAYMENT_CONFIRMED for ops after the deadline; never auto-expire it; add an ops feed item 'Deadline passed'. Exit = new Admin 'Expire task' action from PAYMENT_CONFIRMED after the deadline (new §3.3 transition PAYMENT_CONFIRMED → EXPIRED, actor Admin — approved by this answer), not the indirect assign→expire path." Assign is refused after the deadline (rows 201, 214).

So ops need to see the customer deadline, how many eligible runners are left, and what happened when the task expired.

## Task states
- PAYMENT_CONFIRMED: no offer yet → `Assign runner` (as built).
  - **Past its deadline (decided, rows 201, 214)**: the task stays PAYMENT_CONFIRMED for ops; it is never auto-expired. It shows the `Deadline passed` flag below, `Assign runner` is gone (assign answers 409 `task_deadline_passed`), and ops end it with **Expire task** (PAYMENT_CONFIRMED → EXPIRED, actor A; below).
- RUNNER_ASSIGNED always has a latest assignment. Its status gives the sub-state (no new task state, §3.3):
  - **Offered**: assignment `assigned` (the built name of an open offer) with `offerExpiresAt` in the future (or null, pre-change offers, row 156).
  - **Offer ended**: assignment `expired`, or `assigned` with `offerExpiresAt` in the past (the expiry job has not run yet; the server already refuses the accept, `offer_expired`). Task still RUNNER_ASSIGNED (row 157).
  - **Declined**: assignment `declined` (with `declineReason`, e.g. `over_purchase_limit`). Task still RUNNER_ASSIGNED (row 155).
  - **Deadline passed** (row 185): `deadlineAt` is at or before now and no runner accepted, but the task is not EXPIRED yet because the sweep has not run. This sub-state takes precedence over the three above. Any offer still open has ended at `deadlineAt` (row 205). It is **read-only**: no Reassign and no Expire. The server already refuses assign (409 `task_deadline_passed`).
- RUNNER_EN_ROUTE and later: assignment `accepted` → the mockup `Runner` card only. Row 185 covers RUNNER_ASSIGNED only; a passed deadline changes nothing in later states.
- EXPIRED: read-only, no action. One of three variants, chosen by how the task expired (`expiry.trigger`, Data):
  - **Deadline passed** (row 185).
  - **Matching exhausted** (row 167).
  - **Expired by ops** (row 187), from RUNNER_ASSIGNED.
  - **Expired by ops after the deadline** (row 201), from PAYMENT_CONFIRMED.

## Layout: `Runner` section (drawer-task, after Locations, before Quote)
`.drawer-label` `Runner`, then one `.drawer-card`:
1. Runner row (mockup): avatar (initials, `.verif-avatar`), short name 13.5/600, caption Fira Code 11 slate-600 `Verified · 4.9 · 137 tasks` (from the runner summary). Hidden when the task was never offered (PAYMENT_CONFIRMED).
2. `Deadline` row: `.drawer-row` `Deadline` → `deadlineAt` (12-hour EAT, Fira Code). Shown in every PAYMENT_CONFIRMED, RUNNER_ASSIGNED and EXPIRED sub-state. Every task has a deadline (row 206); `No deadline` (Fira Sans) shows only on legacy tasks created without one, until the NOT NULL backfill (row 221, open).
3. State line, by sub-state:
   | Sub-state | Chip (A-02, §6.1) | `.drawer-row`s | Caption 12 slate-600 |
   |---|---|---|---|
   | Offered | `Offered` (pending) | `Offered at` → `assignedAt`; `Offer ends` → `offerExpiresAt`, which never falls after `deadlineAt` (row 205); the client still shows the earlier of the two for offers made before the cap (EAT, Fira Code) plus a live `{m:ss} left` (Fira Code, client clock, stops at 0) | `Waiting for {runner} to accept.` |
   | Offered, no deadline (row 156) | `Offered` (pending) | `Offered at` | `This offer has no deadline.` |
   | Offer ended | `Offer ended` (pending: ops must act) | `Offered at`; `Ended` → `offerExpiresAt` (EAT, Fira Code); `Eligible runners left` → `{n}` (Fira Code, row 167) | `{runner} didn't accept in time. The task is still waiting for a runner.` |
   | Declined | `Declined` (pending: ops must act) | `Offered at`; `Declined` → `decidedAt`; `Reason` by `declineReason` (row 210): `over_purchase_limit` → `Above their purchase limit`, `too_far` → `Too far away`, `not_available` → `Not available`, `other` → `Other reason`, null → `No reason given`; `Eligible runners left` → `{n}` (Fira Code, row 167) | `The task is still waiting for a runner.` |
   | Deadline passed (RUNNER_ASSIGNED, row 185) | `Deadline passed` (info) | `Last offer` → `{runner} · {Offered \| Offer ended \| Declined}` | `The customer's deadline has passed, so this task is no longer offered. It moves to Expired automatically.` |
   | Accepted (EN_ROUTE …) | none (the task chip shows the state) | none | none |
   | Expired: deadline passed (row 185) | `Deadline passed` (info; the task chip already reads `Expired`) | `Last offer` (when there was one); `Expired at` → the RUNNER_ASSIGNED → EXPIRED history time (EAT, Fira Code); `Runners tried` → `{n}` (Fira Code) | `The customer's deadline passed before any runner accepted. The task has expired.` plus the refund line below |
   | Expired: matching exhausted (row 167) | `No runners left` (info) | `Last offer` → `{runner} · {Offer ended \| Declined}`; `Expired at`; `Runners tried` → `{n}` | `Every eligible runner for this area and category declined, let the offer lapse, or became unavailable. The task has expired.` plus the refund line below |
   | Expired by ops (row 187, from RUNNER_ASSIGNED) | `Expired by ops` (info) | `Expired by` → admin display name; `Expired at`; `Reason` → the admin's reason (admins only); `Runners tried` → `{n}` | `An admin expired this task because no runner was available.` plus the refund line below |
   | PAYMENT_CONFIRMED past deadline (rows 201, 214) | `Deadline passed` (pending: ops must act) | none beyond `Deadline` | `The customer's deadline passed before a runner was assigned. Expire the task or contact the customer.` (wording aligned with the row-220 feed proposal; changes with it) |
   | Expired by ops after the deadline (row 201, from PAYMENT_CONFIRMED) | `Expired by ops` (info) | `Expired by`; `Expired at`; `Reason` (admins only) | `An admin expired this task after the customer's deadline passed before a runner was assigned.` plus the refund line below |

   Refund line for every EXPIRED variant of a paid task: `A refund review was opened.` with a link `View refund review` (an A-07 text button → `p-refunds` filtered to the task, trigger `expired_after_payment`, row 102).
4. Previous offers (only when the task has more than one assignment): a collapsed `.drawer-row` `Earlier offers` → `{n}` (Fira Code). Expanding lists each as `{runner} · {Offer ended | Declined} · {time}` (Fira Code time), newest first. Read-only.

Actions (`.drawer-actions` of the section):
- PAYMENT_CONFIRMED: primary `Assign runner` (built dialog, unchanged). Past its deadline (rows 201, 214): no `Assign runner` (assign answers 409 `task_deadline_passed`); instead an A-07 `.btn-outline` **`Expire task`** (owner name, row 201), shown only when the API says so (`canExpire.deadlinePassed`, Data). See "Expire task (paid task never offered)" below. Contacting the customer stays outside this section (Support).
- Offered: none. Ops wait; there is no withdraw action (out of scope).
- **Offer ended or Declined**, deadline not passed:
  - **Reassign runner** (mockup label), primary: opens the same dialog as `Assign runner`.
    - Title `Reassign runner`, confirm `Send offer`.
    - A line 12 slate-600 under the title: `The new runner has 10 minutes to accept.` (`10` = the admin offer window from the API, Fira Code span). When the deadline comes before the end of the window: `The new runner has until {deadline time} to accept.` (time Fira Code).
    - **Runner list (rows 167, 177, 178, 186, 187 (c); System Design §3.3 "Pool")**: the task's eligible pool from the API, ranked as matching v1. These are runners not yet tried for this task who are online, eligible and not on another accepted or active task. Two groups appear only under the list, greyed (slate-400 text), not selectable, each with its reason:
      - Runners who already declined this task or let an offer for it lapse (row 178): `Already offered`.
      - Runners whose purchase limit is below the task's required purchase (row 186; no pre-offer exception exists, row 207): `Above their purchase limit · KSh {limit} limit, task needs KSh {purchase}` (amounts Fira Code).
    - **Offline runners (row 215: "admin may assign an offline runner; online-only applies to the matching/offer pool")**: under the pool, a collapsed text button `Show offline runners ({n})` (A-07 text, `{n}` Fira Code; proposed). Expanded, it lists runners who are eligible apart from being offline, ranked the same way, **selectable**, each with an info chip `Offline` and, once one is selected, a 12 slate-600 line `{runner} is offline. They can accept once they go online.` (proposed). Offline runners never count in `Eligible runners left` and never block expiry (rows 202, 204).
    - Busy runners (on RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS, row 211; row 187 (c)) and otherwise ineligible runners are not listed. A runner whose only task is AWAITING_CUSTOMER or DISPUTED is not busy (row 211) and is listed as normal.
    - Row 178 applies now, even before the full pool exists (it needs only the task's offer history). Row 186 needs only the runner's limit and the task's purchase, so it also applies now.
    - **Empty list**: the dialog shows 12 slate-600 `No eligible runners are available right now.` and `Send offer` stays disabled until an offline runner is chosen (row 215). The task stays RUNNER_ASSIGNED: the list read never expires it, and an empty online pool alone never does (row 187 (a)).
    - Call: `POST /errands/:id/assign` `{ runnerProfileId, note? }`. This is the existing assign endpoint, already built: it reassigns a RUNNER_ASSIGNED task with no open assignment, with no state change. Success notice A-11 `Offer sent to {runner}.`
  - **Expire task — no runner available** (row 187, owner name for the action): an A-07 `.btn-outline` button after `Reassign runner`. Shown only when the API says the task may be expired (`canExpire.noRunner`, Data). See "Expire task — no runner available" below.
- **Deadline passed** (RUNNER_ASSIGNED, or any EXPIRED variant): no actions. The section is read-only.
- Cancel stays where it is today (admin RUNNER_ASSIGNED → CANCELLED, §3.3); it is not part of this section, and this spec does not change it.

## Expire task — no runner available (row 187)
The owner approved this action as an ops safety mechanism: "audited (admin, timestamp), only available when the task is genuinely eligible for expiry under the operational rules". It uses the existing RUNNER_ASSIGNED → EXPIRED transition, with its actor now S, A (System Design §3.3, row 187). It adds no state and no transition.

**When it shows (decided, owner 2026-10-19, row 202: "approved as proposed — RUNNER_ASSIGNED, no open offer, deadline not passed, no eligible online runner left; offline/busy runners do not prevent it")**. All of these must hold:
1. The task is RUNNER_ASSIGNED.
2. It has no open offer: the latest assignment is `declined` or `expired`.
3. The deadline has not passed (a legacy task with no `deadlineAt` counts as not passed, until the row-221 backfill). After the deadline the system expires the task itself.
4. No eligible **online** runner is left to offer it to: `eligibleRemaining = 0`, meaning every online, eligible runner was tried or is excluded. Offline and busy runners do not prevent it (rows 202, 204).

Before the full pool exists (row 179, no automatic expiry yet), point 4 counts the built candidate list minus the row-178 and row-186 exclusions. The server decides and exposes `canExpire.noRunner`; the client never recomputes it. This is where the action matters most: row 187 (a) never auto-expires a task whose online pool is merely empty for now, so an admin may judge that no runner will come.

**Confirm dialog** (A-08, with an A-06 field):
- Title `Expire this task?`
- Body 13 slate-600: `No runner is available for {task title}. The task moves to Expired and can't be offered again. The customer is told no runner was available.`. For a paid task, add: ` A refund review opens because the task was paid.`
- Field `Reason`, **required (decided, row 203: "reason required, 10–500 characters")**:
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

**Activity row** (the built `Status history` timeline, `task-drawer.ts:157-176`): `Assigned → Expired`, caption `Admin · {admin name} · {time}` (time Fira Code), then the reason in quotes on its own line, as built for notes. The admin's name comes from `actor { id, displayName }` on history items (admin viewers only; built on `feat/api-runner-1`); without it the caption reads `Admin · {time}`, as built.
- The system expiries show `System · {time}` and the history note set by the API:
  - Deadline (row 185): `Customer deadline passed` (built on `feat/api-runner-1`, `DEADLINE_EXPIRY_NOTE`; the API also reads `expiry.trigger = deadline_passed` from it).
  - Matching exhausted (row 167): `No eligible runners left` (proposed; not built, row 179).

**Errors**:
- 409 `expiry_not_allowed`: close the dialog, reload, and show a notice by `reason`:
  - `eligible_runners_remain` → `Eligible runners are still available. Offer the task to one of them.`
  - `open_offer` → `This task has an open offer. Wait for the runner to answer.`
  - `deadline_passed` → `The deadline has passed, so this task expires automatically.`
  - otherwise → `This task changed. Check the latest offer.`
  - Reason values (`not_runner_assigned | open_offer | deadline_passed | eligible_runners_remain`) are proposals; api-contract names them.
- 409 `illegal_transition` → reload, `This task changed. Check the latest offer.`
- 400 `expiry_reason_invalid` → field error `Give a reason (10–500 characters).`
- 403 → `FORBIDDEN_COPY`.
- Any other error → `Couldn't expire the task. Try again.`

Codes are proposals; api-contract names them.

## Expire task (paid task never offered, row 201)
Owner: "Exit = new Admin 'Expire task' action from PAYMENT_CONFIRMED after the deadline (new §3.3 transition PAYMENT_CONFIRMED → EXPIRED, actor Admin — approved by this answer)." System Design §3.3 lists it (round 12).

**When it shows** (from the owner's words): the task is PAYMENT_CONFIRMED and its `deadlineAt` has passed. The server decides and exposes it (`canExpire.deadlinePassed`, Data); the client never recomputes it. There is no pool condition: the task was never offered and can no longer be (assign is refused).

**Confirm dialog (proposed, design-auditor; the owner did not say. Recommended: the same A-08 drawer dialog and reason rule as "Expire task — no runner available", so both admin expiries are audited the same way)**:
- Title `Expire this task?`
- Body 13 slate-600: `The customer's deadline for {task title} has passed and no runner was assigned. The task moves to Expired and can't be offered again. The customer is told no runner was available. A refund review opens because the task was paid.` (A PAYMENT_CONFIRMED task is always paid, so the refund sentence always shows.)
- Field `Reason`, required, 10–500 characters after trimming, counter `{n}/500` (Fira Code), the same hint and error copy as above.
- Buttons: outline `Back` and primary `Expire task`, enabled at 10+ characters.

**Result**:
- PAYMENT_CONFIRMED → EXPIRED, actor `admin`; the history row records the admin id, the time and the reason (`note`); no schema change.
- Side effects: a refund review (row 102, trigger `expired_after_payment`), the admin feed, and (proposed, flagged) the customer `errand.EXPIRED` notification with the unchanged title `No runner available` and row-158 body.
- Success notice A-11 `Task expired.`; the section switches to **Expired by ops after the deadline**; the queue row loses its `Deadline passed` chip and leaves `Needs a runner`.
- Activity row: `{from} → Expired` with the built status labels for PAYMENT_CONFIRMED and EXPIRED, caption `Admin · {admin name} · {time}`, the reason on its own line.

**Errors** (codes proposed; api-contract names them):
- 409 `expiry_not_allowed` with `reason`:
  - `deadline_not_passed` → `The customer's deadline hasn't passed yet. Assign a runner instead.`
  - `not_payment_confirmed` (the task moved on, for example a runner was assigned just before the deadline) → `This task changed. Check the latest offer.`
- 409 `illegal_transition` → reload, `This task changed. Check the latest offer.`
- 400 `expiry_reason_invalid` → `Give a reason (10–500 characters).`
- 403 → `FORBIDDEN_COPY`; other → `Couldn't expire the task. Try again.`

Errors (assign / reassign):
- 409 `task_deadline_passed` (row 185, built on `feat/api-runner-1` for RUNNER_ASSIGNED; rows 201, 214 extend it to PAYMENT_CONFIRMED, to build) → close the dialog, reload, notice A-11 info `The customer's deadline has passed, so this task can't be offered again.`
- 409 `runner_already_offered` (row 178, built on `feat/api-runner-1`; `previousStatus` `declined | expired`) → reload the list, notice by `previousStatus`: `declined` → `This runner declined this task. Choose another runner.`; `expired` → `This runner's offer for this task lapsed. Choose another runner.` (the API's own messages, accepted as proposed copy). The list should already grey these runners (`Already offered`); the error covers a stale list.
- 409 `matching_exhausted` (the task expired while the dialog was open) → close the dialog, reload, notice A-11 info `No eligible runners are left, so this task has expired.`
- 409 `runner_not_eligible`:
  - with `reason: over_purchase_limit` (row 186) → reload the list, notice `This runner's purchase limit is below this task's purchase. Choose another runner.`
  - any other reason (the chosen runner became ineligible or busy) → reload the list, notice `That runner can't take this task any more. Choose another runner.` Being offline is not a reason to refuse an admin assign (row 215).
- 409 the task already has an open offer or moved on → reload, notice `This task changed. Check the latest offer.`
- 403 → `FORBIDDEN_COPY`; 404 → `That runner or task no longer exists.` (built copy); other → `Couldn't send the offer. Try again.`

## Queue (`p-queue`)
- **Status column**: the task chip as today, plus a second chip in `.chip-stack`:
  - RUNNER_ASSIGNED: `Offered` (pending) while an offer is open, `Offer ended` (pending) after a lapse, `Declined` (pending) after a decline. These are the same chips as the drawer. (The mockup's `Unmatched` tag is the closest drawn label; `Offer ended` / `Declined` say why, proposed.)
  - **Deadline passed** (row 185): `Deadline passed` (info) on a RUNNER_ASSIGNED task past `deadlineAt` that has not expired yet. It replaces the offer chip.
  - **PAYMENT_CONFIRMED past its deadline** (rows 201, 214): `Deadline passed` (pending: ops must act).
  - The client takes the flag from the server (`deadlinePassed`, Data). If the server sends none, it compares `deadlineAt` with the client clock and re-reads on the next refresh.
- **Row action**:
  - `Assign` for PAYMENT_CONFIRMED (built).
  - `Reassign` (proposed) for RUNNER_ASSIGNED with an ended or declined offer.
  - `View` otherwise. That includes every task whose deadline has passed: it opens the drawer. A RUNNER_ASSIGNED task past its deadline is read-only there; a PAYMENT_CONFIRMED task past its deadline shows `Expire task` instead of `Assign` (row 201).
  - The action opens the drawer, as built.
- **Filter** (proposed): a `Needs a runner` quick filter = PAYMENT_CONFIRMED plus RUNNER_ASSIGNED with an ended or declined offer.
  - RUNNER_ASSIGNED tasks past their deadline are excluded.
  - PAYMENT_CONFIRMED tasks past their deadline stay in, with their `Deadline passed` chip, so ops see them until they expire them (row 201: ops must act; the filter placement is proposed).

## Live updates
These refresh the drawer and the queue row; an open drawer re-reads `GET /errands/:id` on any of them:
- Admin feed item `assignment_declined` (built). Body without a limit reason approved (row 216): `The runner declined {ref}. Assign another runner.`; over the limit, the built `The runner declined {ref}: the purchase is above their limit. Assign another runner.` The other row-210 reasons use the approved general body (the drawer shows the reason).
- Feed item `assignment_expired` / `Offer ended` (N-20, built on `feat/api-runner-1`: `The runner didn't accept {ref} in time. Offer it to another runner.`).
- `matching_exhausted` (`Matching exhausted · {task}`, row 167, to build).
- `deadline_passed`:
  - RUNNER_ASSIGNED task expired at its deadline (row 185; **owner copy, row 216**, built on `feat/api-runner-1`): title `Deadline passed`, body `The customer's deadline for {ref} passed before any runner accepted. The task has expired.`
  - PAYMENT_CONFIRMED task past its deadline (row 201, one item per task, decided; to build): title `Deadline passed` (owner, row 201). Body **open (BOARD row 220)**, proposed there: `The customer's deadline for {ref} passed before a runner was assigned. Expire the task or contact the customer.` Row 216's "The task has expired." must not be used here: the task has not expired.
- `errand:status_changed` to EXPIRED switches the drawer to the matching EXPIRED variant.

Fallbacks until the feed items exist:
- The client switches Offered → Offer ended on its own clock at `offerExpiresAt`.
- It switches to Deadline passed at `deadlineAt`.
- In both cases it re-reads on the next refresh.

## Copy
Exact, from the mockup: `Runner`, `Reassign runner`, `Verified · 4.9 · 137 tasks` (sample), `Assign`, `View`.

Exact, from the owner:
- Row 187: `Expire task — no runner available`.
- Row 201: `Expire task` (the PAYMENT_CONFIRMED action) and the feed title `Deadline passed`.
- Row 216 (approved 2026-10-19): feed `Deadline passed` / `The customer's deadline for {ref} passed before any runner accepted. The task has expired.` (RUNNER_ASSIGNED expiry only) and `The runner declined {ref}. Assign another runner.`

Open, proposed (row 220): feed body `The customer's deadline for {ref} passed before a runner was assigned. Expire the task or contact the customer.`

Everything else proposed:
- Offer states: `Offered`, `Offer ended`, `Declined`, `Offered at`, `Offer ends`, `{m:ss} left`, `Ended`, `Reason`, `Above their purchase limit`, `Too far away`, `Not available`, `Other reason`, `No reason given`, `Waiting for {runner} to accept.`, `This offer has no deadline.`, `{runner} didn't accept in time. The task is still waiting for a runner.`, `The task is still waiting for a runner.`, `Earlier offers`.
- Reassign dialog and queue: `Send offer`, `The new runner has 10 minutes to accept.`, `The new runner has until {deadline time} to accept.`, `Offer sent to {runner}.`, `Already offered`, `Above their purchase limit · KSh {limit} limit, task needs KSh {purchase}`, `Show offline runners ({n})`, `Offline`, `{runner} is offline. They can accept once they go online.`, `Reassign`, `Needs a runner`, `Eligible runners left`.
- Deadline: `Deadline`, `No deadline`, `Deadline passed`, `Last offer`, `The customer's deadline has passed, so this task is no longer offered. It moves to Expired automatically.`, `The customer's deadline passed before any runner accepted. The task has expired.`, `The customer's deadline passed before a runner was assigned. Expire the task or contact the customer.`.
- EXPIRED variants: `No runners left`, `Expired at`, `Runners tried`, `Every eligible runner for this area and category declined, let the offer lapse, or became unavailable. The task has expired.`, `Expired by ops`, `Expired by`, `An admin expired this task because no runner was available.`, `An admin expired this task after the customer's deadline passed before a runner was assigned.`, `A refund review was opened.`, `View refund review`.
- Expire dialogs: `Expire this task?`, both dialog bodies, `Kept in the task history for audit. The customer and runners don't see it.`, `Enter at least 10 characters.`, `Task expired.`.
- Errors: every error notice above.
- Feed: `Matching exhausted · {task}`.

No copy says the task expired after a single lapse or decline. No copy mentions a wallet, escrow or a hold, and none promises a payout time.

## Numeric fields (Fira Code)
- The offline-runner count in `Show offline runners ({n})`.
- Times (12-hour EAT, §3.1): `Deadline`, `Offered at`, `Offer ends`, `Ended`, `Declined`, `Expired at`, and the deadline time in the Reassign line.
- The `{m:ss} left` countdown.
- Counts: the earlier-offers count and times, `Eligible runners left`, `Runners tried`, the reason counter `{n}/500`.
- Amounts: the purchase limit and the task purchase in the greyed reason.
- Captions: the rating, the task count and `10` (minutes).
- History caption times.

## Data
- **On `main`**:
  - `GET /errands/:id` and `GET /errands` items carry `assignment { id, status, assignedAt, offerExpiresAt, runner { …public summary } }`, filled **only from `ACTIVE_ASSIGNMENT_STATUSES` (`assigned`, `accepted`)**. After a decline or a lapse `assignment` is null.
  - `deadlineAt` on the errand (nullable today; required by row 206, below).
  - `POST /errands/:id/assign` (offer, 10 min, `MATCHING_ADMIN_OFFER_WINDOW_SECONDS`); the `assignment_declined` admin feed item; `GET /errands/:id/purchase-check?runnerProfileId=`; `GET /errands/:id/history`; `PATCH /errands/:id/status` (admin transitions with `note`).
  - The offer-expiry job leaves the task RUNNER_ASSIGNED (row 157).
- **Built on `feat/api-runner-1`** (reviewed, not merged; merge gated on row 219):
  - Admin views: `lastAssignment` (newest, any status) on list and detail; `assignments[]` (newest first) on the detail; each with `offeredAt`, `decidedAt`, `declineReason`, `offerExpiresAt`, `runner`.
  - `offerWindowSeconds` on the admin detail (for the `10 minutes` line).
  - `deadlinePassed` on admin list and detail items, true for RUNNER_ASSIGNED **and** PAYMENT_CONFIRMED past `deadlineAt` (server clock).
  - `expiry { trigger: 'deadline_passed' | 'admin' | 'system', at, by { id, displayName } | null, note }` on the admin detail of an EXPIRED task, derived from the newest `→ EXPIRED` history row.
  - `actor { id, displayName } | null` on `GET /errands/:id/history` items for admin viewers.
  - The deadline sweep: RUNNER_ASSIGNED → EXPIRED (S) at `deadlineAt` with note `Customer deadline passed`, closing any open offer; side effects as below; feed item `deadline_passed` with the row-216 copy.
  - Assign on a RUNNER_ASSIGNED task past its deadline → 409 `task_deadline_passed`. Assign to a runner who declined or lapsed → 409 `runner_already_offered`. A runner on another active job → 409 `runner_not_eligible`.
  - Feed item `assignment_expired` (`Offer ended`).
- **Still needed (api-contract; numbered in `docs/audits/runner-gap-report.md` §15)**:
  - Row 201/214: assign on a **PAYMENT_CONFIRMED** task past `deadlineAt` → 409 `task_deadline_passed` (`feat/api-runner-1` still allows it: "PAYMENT_CONFIRMED is held for row 201").
  - Row 201: the PAYMENT_CONFIRMED → EXPIRED transition, actor A only, guarded by status PAYMENT_CONFIRMED and `deadlineAt` passed; reason required 10–500 after trimming (proposed, as row 203); history row with the admin and the reason; side effects: refund review `expired_after_payment` (row 102: N-16 opens it today only on RUNNER_ASSIGNED → EXPIRED and must cover this transition), admin feed, and (proposed, flagged) the customer `errand.EXPIRED` notification.
  - Row 201: one `deadline_passed` feed item per PAYMENT_CONFIRMED task when its deadline passes (no state change), body pending row 220.
  - Row 187/202/203: the RUNNER_ASSIGNED admin expire with its guard and reason (not built).
  - Availability flags on the admin detail, e.g. `canExpire { noRunner: boolean, deadlinePassed: boolean }` (proposed shape; it replaces the round-11 `canExpireNoRunner`). The route may be one endpoint for both (`POST /errands/:id/expire` `{ reason }`, the server picks the transition from the status) or `PATCH /errands/:id/status`; api-contract's choice.
  - `expiry`: add `fromStatus` (`RUNNER_ASSIGNED | PAYMENT_CONFIRMED`) so the drawer tells **Expired by ops** from **Expired by ops after the deadline**; add `trigger: 'matching_exhausted'` once exhaustion is built (row 179), with note `No eligible runners left` (proposed).
  - Row 205: cap every new offer: `offerExpiresAt` = min(now + window, `deadlineAt`) (today `now + window`).
  - Row 210: `declineReason` values `too_far`, `not_available`, `other` (enum migration).
  - Row 215: the candidates read returns offline-but-otherwise-eligible runners separately (e.g. `offline: true` items or an `offline[]` list), excluded from `eligibleRemaining`; assign accepts an offline runner (check: the API must not answer `runner_offline` on assign).
  - Row 206/221: `deadlineAt` required at create with the contract default; NOT NULL migration and backfill once row 221 is answered.
  - Candidates read with `eligibleRemaining`, `tried`, `ineligibleReason` (N-20; not built).
- **Matching exhausted (rows 167, 177–179, 186, 187, 204; to build, api-contract N-20)**:
  - **Eligible pool per task** (System Design §3.3 "Pool"):
    - Online: offline runners are never in the pool (row 177) and never block exhaustion (row 204).
    - Eligible for the category: approved verification, active account, category in `skills`.
    - Inside a service area: a circle (centre + radius km) from the server config `RUNNER_SERVICE_AREAS`; the task's first point (task site, else pickup, else drop-off) inside it (rows 212, 213).
    - Not busy: not on a RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS task (rows 187 (c), 211).
    - Purchase limit at or above the task's required purchase (row 186); no pre-offer exception (row 207).
    - Runners who declined or let an offer for this task lapse are excluded (row 178).
  - **Proposed `GET /errands/:id/candidates`** (admin) → `{ items: [{ runnerProfileId, displayName, rating, tasksCompleted, distanceKm, score, tried: null | 'declined' | 'expired', ineligibleReason: null | 'over_purchase_limit', offline: boolean, purchaseLimit }], eligibleRemaining, triedCount, requiredPurchase }`.
    - Items with `tried`, `ineligibleReason` or `offline` are returned so the dialog can grey or group them.
    - The Reassign dialog uses it, as does `Eligible runners left`.
  - **Assign** refuses an over-limit runner with 409 `runner_not_eligible` `{ reason: 'over_purchase_limit' }` (row 186). Other ineligible or busy runners get `runner_not_eligible` with their own `reason`. Offline is not a refusal (row 215).
  - **Server check** (**proposed**, design-auditor; api-contract to confirm):
    - It runs after every decline and every offer lapse (the expiry sweep) only, **not** on the candidates read (a GET must not change state).
    - Exhaustion = no untried, non-excluded eligible **online** runner left (row 204). Row 187 (a): an online pool that is empty only because nobody eligible is online never expires the task. Where the two meet (a task never offered, with nobody eligible online) is a new owner question (below); proposed: exhaustion needs at least one offer made for the task.
    - On a genuine exhaustion: RUNNER_ASSIGNED → EXPIRED (S), a history row (note `No eligible runners left`, proposed), `errand.EXPIRED` to the customer, a refund review for a paid task (row 102), and the admin feed item `matching_exhausted`.
    - Never on a single decline or lapse while `eligibleRemaining > 0`.
  - **Dependencies**: RA-10 and RA-1. Row 179 (decided): no automatic expiry by exhaustion until service areas and the full eligible pool exist. Until then:
    - `Eligible runners left` is hidden.
    - The dialog lists runners as built, minus the row-178 and row-186 exclusions.
    - `canExpire.noRunner` follows that list.

## Customer and runner (what they see; their specs own the copy)
- **Customer**: every EXPIRED path looks the same: chip `Expired`, `No runner accepted your task in time.` / `Start a new task`, and the `errand.EXPIRED` notification with exact title `No runner available` (row 188) and the row-158 body. No new customer copy. Before the sweep, a RUNNER_ASSIGNED task past its deadline still reads `Finding a runner` (row 176). A PAYMENT_CONFIRMED task past its deadline keeps `Finding a runner` with no notification until ops expire it; then the same EXPIRED screen and (proposed, flagged) the same notification. See `docs/specs/customer/v-notifications.md`, `v-task-detail.md`, `_shared.md` §6.
- **Runner**: an open offer that ends at the deadline disappears like any ended offer (row 205). Copy: `That offer is no longer available.`, plus the existing `job.offer_withdrawn` feed item. A runner never learns how the task ended. A PAYMENT_CONFIRMED expiry touches no runner (never offered). No new runner copy. See `docs/specs/runner/_shared.md` §6, `v-jobs.md`, `v-job-detail.md`.

## Accessibility
- The countdown is not announced every second: it is announced at open and at 1 minute left.
- Chips carry text.
- `Reassign runner`, `Expire task — no runner available` and `Expire task` have 40 px targets, like the other drawer buttons.
- The expire dialogs trap focus, with initial focus on `Back` (A-08). The reason field wires its hint and error with `aria-describedby`.
- Greyed runners in the list are `aria-disabled` and their reason is read. `Show offline runners` is a disclosure button (`aria-expanded`); each offline runner reads `{name}, offline`.

## Owner decisions applied
Rows 113, 114, 134, 141, 150, 155, 156, 157, 167, 177, 178, 179, 185 (deadline path), 186 (purchase limit in the pool), 187 (empty online pool, busy runners ineligible, admin expire action), 188 (exact customer title), and round 12 (2026-10-19): 201 and 214 (PAYMENT_CONFIRMED stays for ops, `Deadline passed` feed item, new admin `Expire task` PAYMENT_CONFIRMED → EXPIRED, assign refused after the deadline), 202 (expire rule), 203 (reason required, 10–500), 204 (offline/busy don't block exhaustion), 205 (an open offer ends at the deadline; `offerExpiresAt` capped), 206 (every task has a deadline; default open, row 221), 207 (no pre-offer exception), 208 (RUNNER_ASSIGNED → EXPIRED by S or A), 210 (decline reasons), 211 (busy = EN_ROUTE, ARRIVED, IN_PROGRESS), 212, 213 (service areas), 215 (admin may assign an offline runner), 216 (feed copy) (`_shared.md` §1). Row 187 (b)'s "no PAYMENT_CONFIRMED → EXPIRED" is superseded by row 201 for the admin; the system still never expires a PAYMENT_CONFIRMED task.

## Open questions for the owner
Decided: AQ-12, AQ-17, AQ-18, AQ-19, rows 185, 186, RQ-31, and on 2026-10-19 row 201 (with 214) and AQ-22 … AQ-27 (rows 202–207).

Open:
- **Row 220**: feed copy for a PAYMENT_CONFIRMED task past its deadline (proposed in the row).
- **Row 221**: the default `deadlineAt` when the customer gives none, and the backfill of existing tasks.
- **New (AQ-28, proposed for the BOARD)**: the PAYMENT_CONFIRMED `Expire task` asks for a required reason of 10–500 characters, like the RUNNER_ASSIGNED action (row 203), in the same kind of dialog. Recommended yes; the owner did not say.
- **New (AQ-29)**: on PAYMENT_CONFIRMED → EXPIRED by the admin, send the customer the usual `errand.EXPIRED` notification (`No runner available` / row-158 body)? Recommended yes, no new copy.
- **New (AQ-30)**: rows 187 (a) and 204 together: is a task that was never offered, with no eligible runner online, "exhausted"? Proposed no: exhaustion needs at least one offer made; otherwise re-check (row 179 holds exhaustion back for now anyway).
- **New (AQ-31)**: Reassign dialog offline runners (row 215): proposed as a collapsed `Show offline runners ({n})` group, selectable, never counted in `Eligible runners left`. Confirm, or list them inline?

## Current vs design
`main`: the drawer's `Assign runner` shows only at PAYMENT_CONFIRMED (`task-drawer.ts:22-23`) and says `Runner assigned.` on success (`:305`). The queue's `Assign` shows only at PAYMENT_CONFIRMED (`task-queue.panel.ts:136-137`). There is no `Runner` section, no offer, decline, lapse or deadline state, no way to re-offer a RUNNER_ASSIGNED task and no expire action. The `Status history` shows the actor type and the note but no admin name (`:157-176`).

Fix list (web-parity, after api-contract):
1. blocker: `Runner` section with the sub-states above.
2. blocker: `Reassign runner` for ended or declined offers (RUNNER_ASSIGNED), reusing the assign dialog.
3. minor: success copy `Offer sent to {runner}.` instead of `Runner assigned.` (the assign makes an offer, row 113).
4. minor: queue chip and `Reassign` row action.
5. blocker (row 167, after api-contract): `Eligible runners left`, the eligible-pool Reassign list, the Matching exhausted state and the `matching_exhausted` / `runner_not_eligible` errors.
6. blocker (row 185, after `feat/api-runner-1` merges): the `Deadline` row, the Deadline passed sub-state (read-only, no Reassign), the Expired: deadline passed variant, the queue `Deadline passed` chip with `View` and the exclusion from `Needs a runner`, and the `task_deadline_passed` error.
7. blocker (row 186): runners below the purchase limit greyed with their reason in the Reassign list; the `runner_not_eligible` `over_purchase_limit` notice.
8. blocker (rows 187, 202, 203, after api-contract): `Expire task — no runner available` (button, confirm with required reason, result, activity row with the admin name, errors), shown only on `canExpire.noRunner`; the Expired by ops variant.
9. blocker (rows 201, 214, after api-contract; was a held minor): PAYMENT_CONFIRMED past its deadline: `Deadline passed` chip and flag, no `Assign`, `Expire task` (confirm with reason, result, errors), the Expired by ops after the deadline variant, and the `deadline_passed` feed item (body pending row 220).
10. minor (row 210): decline reason labels in the `Declined` row.
11. minor (row 215): `Show offline runners ({n})` group in the Reassign dialog.
12. minor (round 11 review): `runner_already_offered` notices.
