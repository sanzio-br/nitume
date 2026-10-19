# v-jobs — Nearby jobs (offers) and availability

- Mockup: `docs/design/nitume_runner_app.html` lines 183–208 (`#v-jobs`, root view) + tab bar 285–290
- Shared conventions: `_shared.md` (§1 shell, §6 states, §8 money, §9 gate, §10 live data)
- Implementation: none
- Status: missing

## Purpose
Home tab. The runner switches availability on or off and sees the job offers addressed to them, with pay, distance and purchase terms, and accepts or declines each.

## Entry / exit
- Entry: default tab after sign-in; tab bar `Jobs`; `Back to jobs` on `v-job-summary`; `Back to app` on `v-onboard-pending`.
- Bell → `v-notifications`.
- Offer card tap → `v-job-detail` for that offer.
- `Accept` → accept (RA-1; moves the task RUNNER_ASSIGNED → RUNNER_EN_ROUTE, row 113) → on success select the **Active** tab for that job (mockup `showView('v-active')`); on failure stay with an error notice. Before the first accept the app shows `x-location-disclosure` if location permission was never granted (pings start on accept).
- `Decline` → R-23 decline dialog with a reason picker (below, row 210) → decline (RA-1) → card removed.
- Verification card (not verified) → `v-onboard-pending`.

## Task states
Offers: errands in RUNNER_ASSIGNED with an assignment `offered` to this runner (row 113). An offer lasts 10 minutes when an admin made it (90 s for auto-offers, row 114); when it reaches its acceptance deadline unaccepted the **offer** expires and the card disappears (no runner acceptance after expiry, row 141). What happens to the task is not this runner's concern and is never shown (runner `_shared.md` §6 "Offer outcomes"): an auto-offer passes to the next eligible runner (row 150); after an admin offer lapses the task stays RUNNER_ASSIGNED and an admin offers it to another runner (row 157); the task goes EXPIRED when its customer deadline passes with no runner accepted (row 185; the deadline takes precedence) or when matching is exhausted (row 167: every eligible runner in the task's service-area/category pool has declined, let the offer lapse, or become ineligible or unavailable). An offer still open at the task's deadline ends then (row 205, decided 2026-10-19: "an open offer ends at once when deadlineAt passes; offerExpiresAt must never extend beyond the task deadline"): the server caps `offerExpiresAt` at `deadlineAt`, and the client still removes the card at the earlier of `offerExpiresAt` and `deadlineAt` (offers made before the cap), with the same copy as any ended offer; the deadline is never named as the reason. A runner who declined or let an offer lapse is never offered that task again (row 178); offline runners get no offers (row 177); a runner who is busy gets no offers (row 187 (c); busy = a task in RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS, row 211: a job in AWAITING_CUSTOMER or DISPUTED does not stop new offers); a runner whose purchase limit is below the task's purchase is not offered it, with no pre-offer exception (rows 186, 207); a task reaches a runner's pool when its first point (task site, else pickup, else drop-off) is inside one of the runner's service areas (row 213). Offers made before the deadline change have `offerExpiresAt = null` (row 156): no countdown, and the client never removes the card on its own (only `job:offer_withdrawn`, a refused accept or a refresh that no longer returns it removes it). An accept that arrives after `offerExpiresAt` is refused (`offer_expired`). Accepted jobs (now RUNNER_EN_ROUTE) leave this list and appear on `v-active`.

## Layout (top to bottom)
1. C-09 top bar: title `Nearby jobs` (21/700) + C-11 bell (36, white, slate-line; red 7px unread dot from `GET /notifications/unread-count`).
2. R-02 availability card (margin 0 20 16): dot + `Online`/`Offline` + Fira Code areas line (service areas joined by ` · `, `No service areas yet` when empty, proposed) + switch.
3. C-08 section label: `3 offers near you` (count Fira Code). Hidden when there are no offers.
4. R-04 offer cards (margin 0 20 12), newest first; each: R-14 category tag, pay (runner fee) Fira Code 17/600, title, meta line, optional over-limit notice, actions `Decline` (C-03 small) / `Accept` (C-01 small).
5. Tab bar C-13 (Jobs active).

States:
- **Not verified** (§9): replace 2–4 with a C-07 card: title 15/600 `Finish your verification`, body 13 slate-600 by state (`We're reviewing your documents. We'll notify you when you're approved.` / `Some checks weren't approved. Fix them to start accepting jobs.` / `Upload your ID and a selfie to start accepting jobs.`), C-01 `View status` or `Continue verification`. Availability card shown disabled with `You can go online once your verification is approved.`
- **Offline**: R-02 shows `Offline`, slate-400 dot; body C-33 empty state `You're offline` / `Go online to get job offers near your service areas.` (proposed). No pings. Exception (row 215: an admin may offer a task to an offline runner): offers the API still returns are listed under a C-40 info notice `Go online to accept this offer.` (proposed); `Accept` while offline is refused (409 `runner_offline`) → snackbar `Go online to accept this job.` (proposed).
- **Online, no offers**: C-33 empty state `No offers right now` / `We'll notify you when a job near you comes in. Keep the app online.` (proposed).
- **Loading**: two `SkeletonCard`s.
- **Error**: C-33 error `Couldn't load offers.` + `Try again`.
- **Reconnecting**: C-40 notice under the availability card `Reconnecting…` (socket down > 5 s).
- **Has an active job**: a compact C-07 card above the offers (proposed): `You have an active job` + task title + R-01 chip, tap → Active tab. While that job is RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS the runner is busy (server-set, row 211) and gets no new offers; once it is AWAITING_CUSTOMER or DISPUTED the runner is free again and offers show as normal (the card stays while the job is in the active set). An accept while busy is refused with `runner_busy`.
- **Offer expired or withdrawn** while visible (`job:offer_withdrawn`, or 409 on accept): remove the card with a snackbar `That offer is no longer available.` (proposed).

## Decline reason picker (row 210, owner 2026-10-19)
Owner: "add full enum over_purchase_limit, too_far, not_available, other (schema change approved); UI gets an explicit reason picker." The mockup draws no decline dialog; everything below is built from design-system patterns and every label is **proposed**.

R-23 `DeclineReasonDialog` (NEW, core-ui; used by `v-jobs` and `v-job-detail`, one component):
- Shell: C-35 `NitumeDialog` (white card, r 16, scrim blue 50%), title 17/600 `Decline this job?`, body 13 slate-600 (as Copy, by over-limit state).
- Label 12/600 blue, margin-top 14: `Why are you declining?`
- Reason list: C-16 `NitumeRadioRow` (exists in `nitume_core`, `nitume_choice_chip.dart`: full-width pill, slate fill, slate-line border, 12/600 blue label; selected = blue fill, white label), stacked with gap 8, one radio group:
  | Row label | Wire value | When |
  |---|---|---|
  | `Above my purchase limit` | `over_purchase_limit` | Only when the offer is over the runner's limit (`overPurchaseLimit`); then listed first and **pre-selected**. The API refuses this value within the limit (409 `purchase_within_limit`) |
  | `Too far away` | `too_far` | Always |
  | `Not available right now` | `not_available` | Always |
  | `Other reason` | `other` | Always. No text field: no free-text reason is stored (row 210 approves the enum only) |
- Actions (core confirm convention): C-03 outline `Decline` (confirm) and C-01 primary `Keep offer`. `Decline` is disabled until a reason is selected (proposed: a reason is required in the UI; the API keeps it optional). Never red, never green for the decline itself.
- Result: `POST /errands/:id/decline` `{ reason }` → the card is removed (no snackbar); on `v-job-detail`, back to `v-jobs`.
- Errors: 409 `offer_expired` / 404 → close the dialog, remove the card, snackbar `That offer is no longer available.`; 409 `purchase_within_limit` (the limit was raised after the offer) → keep the dialog open, drop the `Above my purchase limit` row, inline 12.5 red `Your purchase limit now covers this job. Choose another reason.`; 400 `decline_reason_invalid` → inline `Choose a reason.`; other → inline `Couldn't decline. Try again.`
- Accessibility: the rows are one radio group (`inMutuallyExclusiveGroup`), 48 dp each; initial focus on the dialog title; the disabled `Decline` announces `Choose a reason first`.

## Offer card content (R-04)
| Slot | Source | Example |
|---|---|---|
| Tag | category display name (R-14) | `Check It For Me` (mockup `Inspection`) |
| Pay | runner fee (RA-2), `formatKes` | `KSh 1,750` |
| Title | `title` or category name | `Check apartment — Nyali` |
| Meta (Fira Code, ` · ` separated, only parts that exist) | distance from the device to the first task point (R-18); no estimated duration (row 120); purchase terms (§8); evidence requirement (proposed `Photos required`; never `video`, row 32 / RQ-9); `Signature on delivery` only if the API carries such a requirement (it does not today; dropped) | `1.2 km away · Photos required` · `2.8 km away · Item KSh 5,000 · Customer pays the merchant` |
| Over-limit notice (row 108; fallback only since row 186) | `send_to_runner` item amount > `maxPurchaseAdvance`. Row 186: such offers are no longer made, so this shows only if the limit changed after the offer was made | `Above your purchase limit of KSh 3,000. You can decline this job.` |

## Components
| Element | Component | Status |
|---|---|---|
| Top bar + bell | C-09, C-11 | exists |
| Availability card + switch | R-02 | NEW |
| Section label | C-08 | exists |
| Offer card | R-04 (uses R-14, C-01, C-03, C-40) | NEW |
| Empty / error / skeleton | C-33 | exists |
| Decline dialog with reasons | R-23 (C-35 + C-16 `NitumeRadioRow`) | NEW (core-ui) |
| Tab bar | C-13 | exists |

## Copy
Exact, from the mockup: `Nearby jobs`, `Online`, `3 offers near you` (pattern `{n} offers near you`; `1 offer near you`), `Decline`, `Accept`, tab labels `Jobs`, `Active`, `Earnings`, `Profile`, meta fragments `1.2 km away`, `Budget KSh 5,000 · Customer pays merchant` (rewritten as `Item KSh 5,000 · Customer pays the merchant`, §8, because "Budget" is the customer's estimate, not the authorised item amount).

Proposed:
- `Offline`; switch semantics `Available for jobs`.
- Decline dialog (R-23; see "Decline reason picker" below): title `Decline this job?`; body `We'll offer it to another runner.`; when over the limit, body `This job needs a purchase above your limit. We'll offer it to another runner. This won't count against you.` (row 113: over-limit declines are not penalised); label `Why are you declining?`; reasons `Above my purchase limit`, `Too far away`, `Not available right now`, `Other reason`; buttons `Decline` (outline, confirm, not destructive-red) then `Keep offer` (primary). Errors: `Choose a reason.`, `Your purchase limit now covers this job. Choose another reason.`
- Going offline while busy (a job in RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS, row 211): blocked, snackbar `Finish your active job before going offline.` A job in AWAITING_CUSTOMER or DISPUTED does not block it (proposed, follows row 211).
- Accept errors: `purchase_limit_exceeded` → snackbar `This job is above your purchase limit.`; offer expired or withdrawn (409 `offer_expired`, with or without `reason: 'task_deadline_passed'` (row 185; the accept-after-deadline code built on `feat/api-runner-1`), 409 `illegal_transition`, 404) → `That offer is no longer available.` and the card is removed; `runner_busy` → `Finish your active job first.` (rare since row 187 (c): busy runners are not offered jobs); `runner_not_verified` / `runner_offline` → the matching state above. (Codes as built on `feat/api-runner-1`, `runner-jobs.controller.ts` accept order.)

## Numeric fields (Fira Code)
- Offer count in the section label; pay; every meta line (distance, item amount, limit); the areas line in the availability card (proposed, as drawn: `.avail-row span` is Fira Code); unread badge count if shown.

## Data
- `GET /runners/me` (exists): `availability`, `verificationLevel`, `maxPurchaseAdvance` (exists in the entity, exposed raw). Skills and areas are **not** returned (RA-10).
- `PATCH /runners/me/availability` `{ availability: 'online' | 'offline' }` (exists; the verification gate is built on `feat/api-runner-1`, RA-8; `busy` is server-set while a job is RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS, row 211).
- Offers: **missing** (RA-1) `GET /runners/me/offers` → `[{ assignmentId, errandId, offerExpiresAt, category, title, runnerFee, itemAmount, merchantRoute, overPurchaseLimit, firstPoint { lat, lng, addressText } }]`; `POST /errands/:id/accept` (named in system design §3.2) and `POST /errands/:id/decline` `{ reason: 'over_purchase_limit' | 'too_far' | 'not_available' | 'other' }` (row 210; `feat/api-runner-1` accepts only `over_purchase_limit` so far, api-contract adds the rest).
- Socket: room `runner:{runnerId}` with `job:offered`, `job:offer_withdrawn` (RA-5, missing). Polling fallback 20 s.
- Location: while online without a job, one ping every 30 s (row 123, R-20); offline, none. The distance on cards uses the device position locally (no API).
- Notifications unread count: `GET /notifications/unread-count` (exists, any role).
- Task states shown: RUNNER_ASSIGNED (offered).
- **Built vs needed** (rows 113, 137): `feat/api-owner-answers-6` has only `GET /errands/:id/purchase-check` and the over-limit decline on an *assigned* job. Row 137 replaces that with the offer model: api-contract builds `GET /runners/me/offers` (each offer: `assignmentId, errandId, offerExpiresAt, deadlineAt, category, title, runnerFee, itemAmount, merchantRoute, overPurchaseLimit, maxPurchaseAdvance, firstPoint`; `deadlineAt` added for row 185, or `offerExpiresAt` capped at the deadline instead, api-contract's choice), accept (`POST /errands/:id/accept`, → RUNNER_EN_ROUTE, refuses over the limit), decline (`POST /errands/:id/decline` `{ reason }`, the four row-210 values, task stays RUNNER_ASSIGNED), expiry per runner `_shared.md` §6 "Offer outcomes" (RA-1, RA-3, RA-26).

## Accessibility and mobile
- Card reads as one item (`Check It For Me, Check apartment — Nyali, 1,750 shillings, 1.2 km away`) with two actions exposed.
- Switch hit area 48; disabled switch announces the reason.
- New offers are announced politely (`New job offer`), not by stealing focus.
- Pull-to-refresh.

## Decisions (owner, 2026-10-13)
- Row 113 (RQ-1): offers inside RUNNER_ASSIGNED; accept → RUNNER_EN_ROUTE; decline → stays RUNNER_ASSIGNED and is reassigned; lapse → the offer expires (task outcome: rows 150, 155, 157, 167); accept above the limit refused; over-limit decline not penalised.
- Row 141 (RQ-22, owner 2026-10-16): "at the acceptance deadline with no acceptance the offer expires […]; no runner acceptance after expiry." Its "the task goes EXPIRED at once" is superseded by rows 150 and 157.
- Row 157 (owner 2026-10-16): an admin offer that lapses expires; the task stays RUNNER_ASSIGNED so the admin can offer it to another runner; EXPIRED only when no further runner can be assigned. No change to this screen: the card disappears at `offerExpiresAt`.
- Row 150 (owner 2026-10-16): an auto-offer expires at its window end, then the system offers the next eligible runner; EXPIRED only when no eligible runners remain.
- Row 155 (owner 2026-10-16): a decline starts or changes no deadline; the task stays RUNNER_ASSIGNED while eligible runners remain (matches the decline dialog `We'll offer it to another runner.`).
- Row 167 (owner 2026-10-16): EXPIRED when matching is exhausted. Row 185 (2026-10-16): or when the customer deadline passes with no runner accepted, which takes precedence; after it the task is no longer offered. Rows 177–179: offline = unavailable; declined/lapsed runners excluded from that task; no automatic expiry by exhaustion until service areas and the full pool exist. Rows 186, 187 (c): runners below the task's purchase or on another active job are not offered it. Screen change: the client removes a card at the earlier of `offerExpiresAt` and `deadlineAt` (when the offer view carries `deadlineAt`; otherwise on the server event); no new copy.
- Row 156: offers without a deadline (pre-change) stay as they are: `offerExpiresAt = null` → no countdown and no client-side removal. Otherwise the app removes the card at `offerExpiresAt` (client clock, then confirmed by the server event) and never sends an accept after it.
- Row 114 (RQ-2): admin offers 10 min, auto-offers 90 s (configurable).
- Row 116 (RQ-4): service areas from an ops-configured list; kept as server config `RUNNER_SERVICE_AREAS` (row 212, 2026-10-19); an area is a circle and the task's first point places it (row 213).
- Rows 204–207, 210, 211 (owner 2026-10-19): offline/busy runners don't block exhaustion (no runner copy); an open offer ends at the deadline and `offerExpiresAt` never exceeds it; every task has a deadline; no pre-offer purchase-limit exception; decline reasons with a picker; busy = RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS.
- Row 120 (RQ-8): no estimated duration on cards; generic evidence line `Photos required`.
- Row 123 (RQ-11): 30 s pings while online without a job; none offline.

## Questions
- Rows 150, 157, 167, 185 and 205 settle what happens after a lapse and at the deadline (AQ-25 answered by row 205: the offer ends at once).
- RQ-32 (new): must the runner pick a reason before declining (proposed yes, UI only), and is `Other reason` without a free-text field enough (proposed yes; a text field would need a new column)?
