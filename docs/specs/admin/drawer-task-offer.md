# drawer-task-offer — Runner offer section of the task drawer, lapsed offers and re-offer

- Mockup: `docs/design/nitume_admin_dashboard.html` task drawer `Runner` section (lines 440–446: avatar, name, `Verified · 4.9 · 137 tasks`) and actions (lines 467–470: `Cancel task`, `Reassign runner`); queue rows (lines 319–324: `Unmatched` tag, `Assign` / `View`). The offer states themselves are **not drawn. EXTENDS MOCKUP** (rows 113, 114, 141, 150, 155–157, 167). Copy not in the mockup is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3.1 times, §6.1 offer chips, §7 N-20)
- Placed in: `drawer-task` (new `Runner` section, replaces the `Assign runner` button in `Admin actions`) and `p-queue` (status column, row action)
- Implementation: `apps/admin/src/app/features/admin/drawers/task-drawer.ts` (assign dialog, `taskActions`), `panels/task-queue.panel.ts` (`rowAction`) on `main`
- Status: partial (assign exists for PAYMENT_CONFIRMED only; no offer, decline or lapse state; no re-offer from RUNNER_ASSIGNED)

## Purpose
Show ops who the task is offered to and until when, what happened to the offer (accepted, declined, lapsed), and let them offer a RUNNER_ASSIGNED task to another runner when the offer was declined or has lapsed. Row 157 (owner, 2026-10-16): "an admin offer that reaches its deadline expires, but the task stays RUNNER_ASSIGNED so the admin can offer/reassign another runner; EXPIRED only when the task/matching process finds no further runner can be assigned." Row 167 (owner, 2026-10-16) defines that point: "RUNNER_ASSIGNED → EXPIRED only when matching is exhausted: every eligible runner in the configured service-area/category pool has declined, let the offer lapse, or become ineligible/unavailable before accepting. A decline or lapse never expires the task by itself; keep offering/reassigning while eligible runners remain. No separate task deadline is required for this rule." So ops also need to see how many eligible runners are left, and what happened when none are.

## Task states
- PAYMENT_CONFIRMED: no offer yet → `Assign runner` (as built).
- RUNNER_ASSIGNED: always has a latest assignment. Its status gives the sub-state (no new task state, §3.3):
  - **Offered**: assignment `assigned` (the built name of an open offer) with `offerExpiresAt` in the future (or null, pre-change offers, row 156).
  - **Offer ended**: assignment `expired`, or `assigned` with `offerExpiresAt` in the past (the expiry job has not run yet; the server already refuses the accept, `offer_expired`). Task still RUNNER_ASSIGNED (row 157).
  - **Declined**: assignment `declined` (with `declineReason`, e.g. `over_purchase_limit`). Task still RUNNER_ASSIGNED (row 155).
- RUNNER_EN_ROUTE and later: assignment `accepted` → the mockup `Runner` card only.
- EXPIRED: reached only when matching is exhausted (row 167, System Design §3.3 "Offer lapse"); there is no task deadline (row 155's deadline path removed by row 167). The section shows the **Matching exhausted** state below, read-only, no action.

## Layout: `Runner` section (drawer-task, after Locations, before Quote)
`.drawer-label` `Runner`, then one `.drawer-card`:
1. Runner row (mockup): avatar (initials, `.verif-avatar`), short name 13.5/600, caption Fira Code 11 slate-600 `Verified · 4.9 · 137 tasks` (from the runner summary).
2. State line, by sub-state:
   | Sub-state | Chip (A-02, §6.1) | `.drawer-row`s | Caption 12 slate-600 |
   |---|---|---|---|
   | Offered | `Offered` (pending) | `Offered at` → `assignedAt`; `Offer ends` → `offerExpiresAt` (EAT, Fira Code) plus a live `{m:ss} left` (Fira Code, client clock, stops at 0) | `Waiting for {runner} to accept.` |
   | Offered, no deadline (row 156) | `Offered` (pending) | `Offered at` | `This offer has no deadline.` |
   | Offer ended | `Offer ended` (pending: ops must act) | `Offered at`; `Ended` → `offerExpiresAt` (EAT, Fira Code); `Eligible runners left` → `{n}` (Fira Code, row 167) | `{runner} didn't accept in time. The task is still waiting for a runner.` |
   | Declined | `Declined` (pending: ops must act) | `Offered at`; `Declined` → `decidedAt`; `Reason` → `Above their purchase limit` when `declineReason = over_purchase_limit`, else `No reason given`; `Eligible runners left` → `{n}` (Fira Code, row 167) | `The task is still waiting for a runner.` |
   | Accepted (EN_ROUTE …) | none (the task chip shows the state) | none | none |
   | Matching exhausted (task EXPIRED, row 167) | `No runners left` (info; the task chip already reads `Expired`) | `Last offer` → `{runner} · {Offer ended \| Declined}`; `Expired at` → the RUNNER_ASSIGNED → EXPIRED history time (EAT, Fira Code); `Runners tried` → `{n}` (Fira Code) | `Every eligible runner for this area and category declined, let the offer lapse, or became unavailable. The task has expired.` plus, for a paid task, `A refund review was opened.` with a link `View refund review` (A-07 text button → `p-refunds` filtered to the task, trigger `expired_after_payment`, row 102) |
3. Previous offers (only when the task has more than one assignment): a collapsed `.drawer-row` `Earlier offers` → `{n}` (Fira Code); expanding lists each as `{runner} · {Offer ended | Declined} · {time}` (Fira Code time), newest first. Read-only.

Actions (`.drawer-actions` of the section):
- PAYMENT_CONFIRMED: primary `Assign runner` (built dialog, unchanged).
- Offered: none (ops wait; there is no withdraw action, out of scope).
- **Offer ended or Declined**: primary `Reassign runner` (mockup label) → the same assign dialog as `Assign runner`, title `Reassign runner`, confirm `Send offer`, with a line 12 slate-600 under the title `The new runner has 10 minutes to accept.` (`10` = the admin offer window from the API, Fira Code span; proposed). The runner list is the task's **eligible pool** from the API (row 167; System Design §3.3 "Pool"): runners not yet tried for this task who are currently eligible and available, ranked as matching v1. Runners who already declined or let an offer to this task lapse are not offered again (proposed, owner question) and are listed under them greyed with `Already offered`; ineligible or unavailable runners are not listed. When the list comes back empty the server has already expired the task (409 `matching_exhausted`, below). `POST /errands/:id/assign` `{ runnerProfileId, note? }` (the existing assign endpoint, built: reassigns a RUNNER_ASSIGNED task with no open assignment, no state change). Success notice A-11 `Offer sent to {runner}.`
- Cancel stays where it is today (admin RUNNER_ASSIGNED → CANCELLED, §3.3); not part of this section.

Errors (assign / reassign):
- 409 `matching_exhausted` (the task expired while the dialog was open) → close the dialog, reload, notice A-11 info `No eligible runners are left, so this task has expired.`
- 409 `runner_not_eligible` (the chosen runner became ineligible or unavailable) → reload the list, notice `That runner can't take this task any more. Choose another runner.`
- 409 the task already has an open offer or moved on → reload, notice `This task changed. Check the latest offer.`
- 403 → `FORBIDDEN_COPY`; 404 → `That runner or task no longer exists.` (built copy); other → `Couldn't send the offer. Try again.`

## Queue (`p-queue`)
- Status column: the task chip as today, plus a second chip in `.chip-stack` for RUNNER_ASSIGNED: `Offered` (pending) while an offer is open; `Offer ended` (pending) after a lapse; `Declined` (pending) after a decline (the same chips as the drawer). (The mockup's `Unmatched` tag is the closest drawn label; `Offer ended` / `Declined` say why, proposed.)
- Row action: `Assign` for PAYMENT_CONFIRMED (built) **and** for RUNNER_ASSIGNED with an ended or declined offer (label `Reassign`, proposed); `View` otherwise. The action opens the drawer, as built.
- Filter (proposed): a `Needs a runner` quick filter = PAYMENT_CONFIRMED plus RUNNER_ASSIGNED with an ended or declined offer.

## Live updates
Admin feed items `assignment_declined` (built) and a new `assignment_expired` / `Offer ended` item (N-20, to build) refresh the drawer and the queue row; an open drawer re-reads `GET /errands/:id` on either. The `matching_exhausted` item (row 167, to build) and `errand:status_changed` to EXPIRED switch the drawer to Matching exhausted and drop the queue row out of `Needs a runner`. Until the feed item exists, the client switches Offered → Offer ended on its own clock at `offerExpiresAt` and re-reads on the next refresh.

## Copy
Exact, from the mockup: `Runner`, `Reassign runner`, `Verified · 4.9 · 137 tasks` (sample), `Assign`, `View`. Everything else proposed: `Offered`, `Offer ended`, `Declined`, `Offered at`, `Offer ends`, `{m:ss} left`, `Ended`, `Reason`, `Above their purchase limit`, `No reason given`, `Waiting for {runner} to accept.`, `This offer has no deadline.`, `{runner} didn't accept in time. The task is still waiting for a runner.`, `The task is still waiting for a runner.`, `Earlier offers`, `Send offer`, `The new runner has 10 minutes to accept.`, `Offer sent to {runner}.`, `Already offered`, `Reassign`, `Needs a runner`, `Eligible runners left`, `No runners left`, `Last offer`, `Expired at`, `Runners tried`, `Every eligible runner for this area and category declined, let the offer lapse, or became unavailable. The task has expired.`, `A refund review was opened.`, `View refund review`, `No eligible runners are left, so this task has expired.`, `That runner can't take this task any more. Choose another runner.`, `Matching exhausted · {task}` (feed). No copy says the task expired after a single lapse or decline, and no copy mentions a task deadline (row 167).

## Numeric fields (Fira Code)
`Offered at`, `Offer ends`, `Ended`, `Declined`, `Expired at` times (12-hour EAT, §3.1); the `{m:ss} left` countdown; the earlier-offers count and times; `Eligible runners left` and `Runners tried` counts; the rating, task count and `10` (minutes) in captions.

## Data
- Built on `main`: `GET /errands/:id` and `GET /errands` items carry `assignment { id, status, assignedAt, offerExpiresAt, runner { …public summary } }`, filled **only from `ACTIVE_ASSIGNMENT_STATUSES` (`assigned`, `accepted`)** (`errands.service.ts:89`, `:600-640`). After a decline or a lapse `assignment` is null, so `Offer ended`, `Declined`, the queue chips and `Reassign runner` cannot be derived from it today (only Offered, and Offer ended from a past `offerExpiresAt` before the sweep runs); `POST /errands/:id/assign` (offer, 10 min, `MATCHING_ADMIN_OFFER_WINDOW_SECONDS`); `assignment_declined` admin feed item; `GET /errands/:id/purchase-check?runnerProfileId=` (purchase limit before offering).
- **Must change (api-contract, row 157)**: the offer-expiry job (`expireLapsedOffers`) sets the assignment `expired` and **leaves the task RUNNER_ASSIGNED** (today it moves it to EXPIRED at once). No customer notification on a lapse (the task did not change).
- **Missing (N-20)**: the errand views expose the latest assignment whatever its status (or a `lastAssignment`); `declineReason` and `decidedAt` on the assignment view; an `assignment_expired` admin feed item; the offer window in seconds on the errand view or a config read (for the `10 minutes` line); the list of earlier assignments (e.g. `assignments[]` on the admin detail) for `Earlier offers` and for excluding runners already offered; a purchase-limit check on assign (today `assign` does none; row 113 refuses accept above the limit; once it exists its 409, e.g. `purchase_limit_exceeded`, maps to `This runner's purchase limit is below this task's purchase. Choose another runner.`); an assignment `status` filter on `GET /errands` for the `Needs a runner` filter.
- **Matching exhausted (row 167, decided 2026-10-16; to build, api-contract N-20)**:
  - Eligible pool per task (System Design §3.3 "Pool"): approved verification, active account, task category in `skills`, task location in a `service_areas` entry, purchase limit (or approved exception) at or above the required purchase; available = online and no other active job. Proposed `GET /errands/:id/candidates` (admin) → `{ items: [{ runnerProfileId, displayName, rating, tasksCompleted, distanceKm, score, tried: null | 'declined' | 'expired' }], eligibleRemaining, triedCount }`, used by the Reassign dialog and for `Eligible runners left` (the errand admin view may carry `eligibleRemaining` instead, api-contract's choice).
  - Server check after every decline, every offer lapse (expiry sweep) and on the candidates read: no open offer and `eligibleRemaining = 0` → RUNNER_ASSIGNED → EXPIRED (S), history row, `errand.EXPIRED` to the customer (`v-notifications.md`), refund review for a paid task (row 102), admin feed item `matching_exhausted` (`Matching exhausted · {task title}`, proposed). Never on a single decline or lapse while `eligibleRemaining > 0`.
  - **No task deadline** (row 167 removes row 155's "task deadline reached" path; nothing to build for it).
  - Depends on RA-10 (category skills, ops-configured service areas, and a rule placing the task location in an area) and RA-1 (per-task decline/expiry history). Until the pool can be computed in full the server does not expire on exhaustion, `Eligible runners left` is hidden, and the dialog lists runners as built (owner question on an interim pool).

## Accessibility
The countdown is not announced every second (announce at open and at 1 minute left); chips carry text; `Reassign runner` has a 40 px target as other drawer buttons.

## Owner decisions applied
Rows 113, 114, 134, 141, 150, 155 (deadline path removed by 167), 156, 157, 167 (`_shared.md` §1).

## Open questions for the owner
Decided: AQ-12 (BOARD row 167, matching exhausted; task-deadline path removed) and RQ-31 (row 176, customer label `Finding a runner`, customer specs only; this drawer keeps the admin labels).
- AQ-17 (row 167 follow-up): confirm the eligible-pool list (verification, active, category, service area, purchase limit or exception; available = online and no other active job). In particular: does an **offline** runner count as "unavailable", so that a task can expire at night after one decline because everyone else is offline? Proposed yes (owner wording), flagged.
- AQ-18 (row 167 follow-up): may an admin re-offer to a runner who already declined or let an offer for this task lapse? Proposed no (they count towards exhaustion).
- AQ-19 (row 167 follow-up): until RA-10 (service areas) exists, is an interim pool without the area filter acceptable, or does the task never expire automatically until then (proposed: never, admin cancels)?

## Current vs design
`main`: the drawer's `Assign runner` shows only at PAYMENT_CONFIRMED (`task-drawer.ts:22-23`) and says `Runner assigned.` on success (`:305`); the queue's `Assign` shows only at PAYMENT_CONFIRMED (`task-queue.panel.ts:136-137`). There is no `Runner` section, no offer, decline or lapse state, and no way to re-offer a RUNNER_ASSIGNED task. Fix list (web-parity, after api-contract):
1. blocker: `Runner` section with the sub-states above.
2. blocker: `Reassign runner` for ended or declined offers (RUNNER_ASSIGNED), reusing the assign dialog.
3. minor: success copy `Offer sent to {runner}.` instead of `Runner assigned.` (the assign makes an offer, row 113).
4. minor: queue chip and `Reassign` row action.
5. blocker (row 167, after api-contract): `Eligible runners left`, the eligible-pool Reassign list, the Matching exhausted state and the `matching_exhausted` / `runner_not_eligible` errors.
