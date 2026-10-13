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
- `Accept` → accept (RA-1) → on success select the **Active** tab for that job (mockup `showView('v-active')`); on failure stay with an error notice.
- `Decline` → C-35 confirm (below) → decline (RA-1) → card removed.
- Verification card (not verified) → `v-onboard-pending`.

## Task states
Offers: errands at PAYMENT_CONFIRMED or RUNNER_ASSIGNED with an assignment `offered` to this runner (RQ-1). Accepted jobs leave this list and appear on `v-active`.

## Layout (top to bottom)
1. C-09 top bar: title `Nearby jobs` (21/700) + C-11 bell (36, white, slate-line; red 7px unread dot from `GET /notifications/unread-count`).
2. R-02 availability card (margin 0 20 16): dot + `Online`/`Offline` + Fira Code areas line (service areas joined by ` · `, `No service areas yet` when empty, proposed) + switch.
3. C-08 section label: `3 offers near you` (count Fira Code). Hidden when there are no offers.
4. R-04 offer cards (margin 0 20 12), newest first; each: R-14 category tag, pay (runner fee) Fira Code 17/600, title, meta line, optional over-limit notice, actions `Decline` (C-03 small) / `Accept` (C-01 small).
5. Tab bar C-13 (Jobs active).

States:
- **Not verified** (§9): replace 2–4 with a C-07 card: title 15/600 `Finish your verification`, body 13 slate-600 by state (`We're reviewing your documents. We'll notify you when you're approved.` / `Some checks weren't approved. Fix them to start accepting jobs.` / `Upload your ID and a selfie to start accepting jobs.`), C-01 `View status` or `Continue verification`. Availability card shown disabled with `You can go online once your verification is approved.`
- **Offline**: R-02 shows `Offline`, slate-400 dot; body C-33 empty state `You're offline` / `Go online to get job offers near your service areas.` (proposed). No offers listed, no pings.
- **Online, no offers**: C-33 empty state `No offers right now` / `We'll notify you when a job near you comes in. Keep the app online.` (proposed).
- **Loading**: two `SkeletonCard`s.
- **Error**: C-33 error `Couldn't load offers.` + `Try again`.
- **Reconnecting**: C-40 notice under the availability card `Reconnecting…` (socket down > 5 s).
- **Has an active job**: a compact C-07 card above the offers (proposed): `You have an active job` + task title + R-01 chip, tap → Active tab. Offers still show; accepting a second job while one is active is allowed only if the API allows it (RA-1, default: one active job at a time, the API refuses with `runner_busy`).
- **Offer expired or withdrawn** while visible (`job:offer_withdrawn`, or 409 on accept): remove the card with a snackbar `That offer is no longer available.` (proposed).

## Offer card content (R-04)
| Slot | Source | Example |
|---|---|---|
| Tag | category display name (R-14) | `Check It For Me` (mockup `Inspection`) |
| Pay | runner fee (RA-2), `formatKes` | `KSh 1,750` |
| Title | `title` or category name | `Check apartment — Nyali` |
| Meta (Fira Code, ` · ` separated, only parts that exist) | distance from the device to the first task point (R-18); estimated duration (RQ-8, hidden until the API has it); purchase terms (§8); evidence requirement (proposed `Photos required`; never `video`, row 32 / RQ-9); `Signature on delivery` only if the API carries such a requirement (it does not today; dropped) | `1.2 km away · Photos required` · `2.8 km away · Item KSh 5,000 · Customer pays the merchant` |
| Over-limit notice (row 108) | `send_to_runner` item amount > `maxPurchaseAdvance` | `Above your purchase limit of KSh 3,000. You can decline this job.` |

## Components
| Element | Component | Status |
|---|---|---|
| Top bar + bell | C-09, C-11 | exists |
| Availability card + switch | R-02 | NEW |
| Section label | C-08 | exists |
| Offer card | R-04 (uses R-14, C-01, C-03, C-40) | NEW |
| Empty / error / skeleton | C-33 | exists |
| Decline dialog | C-35 | exists |
| Tab bar | C-13 | exists |

## Copy
Exact, from the mockup: `Nearby jobs`, `Online`, `3 offers near you` (pattern `{n} offers near you`; `1 offer near you`), `Decline`, `Accept`, tab labels `Jobs`, `Active`, `Earnings`, `Profile`, meta fragments `1.2 km away`, `Budget KSh 5,000 · Customer pays merchant` (rewritten as `Item KSh 5,000 · Customer pays the merchant`, §8, because "Budget" is the customer's estimate, not the authorised item amount).

Proposed:
- `Offline`; switch semantics `Available for jobs`.
- Decline dialog: title `Decline this job?`; body `It will be offered to another runner.`; when over the limit, body `This job needs a purchase above your limit. It will be offered to another runner.`; buttons per the core confirm convention (`showNitumeConfirmDialog`): `Decline` (outline, confirm, not destructive-red) then `Keep offer` (primary). Reason picker (proposed, RQ-1 b): radio rows `Too far`, `Not available now`, `Above my purchase limit` (preselected and only option shown when over the limit), `Other`.
- Going offline with an active job: blocked, snackbar `Finish your active job before going offline.`
- Accept error `purchase_limit_exceeded`: snackbar `This job is above your purchase limit.`

## Numeric fields (Fira Code)
- Offer count in the section label; pay; every meta line (distance, item amount, limit); the areas line in the availability card (proposed, as drawn: `.avail-row span` is Fira Code); unread badge count if shown.

## Data
- `GET /runners/me` (exists): `availability`, `verificationLevel`, `maxPurchaseAdvance` (exists in the entity, exposed raw). Skills and areas are **not** returned (RA-10).
- `PATCH /runners/me/availability` `{ availability: 'online' | 'offline' }` (exists; no verification gate, RA-8; `busy` is server-set, proposed).
- Offers: **missing** (RA-1) `GET /runners/me/offers` → `[{ assignmentId, errandId, expiresAt, category, title, runnerFee, itemAmount, merchantRoute, overPurchaseLimit, firstPoint { lat, lng, addressText } }]`; `POST /errands/:id/accept` (named in system design §3.2, not built) and `POST /errands/:id/decline` `{ reason }`.
- Socket: room `runner:{runnerId}` with `job:offered`, `job:offer_withdrawn` (RA-5, missing). Polling fallback 20 s.
- Location: while online, RQ-11 decides idle pings (R-20); the distance on cards uses the device position locally (no API).
- Notifications unread count: `GET /notifications/unread-count` (exists, any role).
- Task states shown: PAYMENT_CONFIRMED / RUNNER_ASSIGNED (offered).
- **Built so far (row 137, `feat/api-owner-answers-6` @ `10b6019`)**: no offers, no accept, no general decline. The admin assigns (PAYMENT_CONFIRMED → RUNNER_ASSIGNED) and the job appears on `v-active`. Row 108 is served by `GET /errands/:id/purchase-check` and `POST /errands/:id/assignment/decline` `{ reason: 'over_purchase_limit' }` on the assigned job (spec: `v-active` §6a), only before RUNNER_EN_ROUTE; the task stays RUNNER_ASSIGNED and an admin reassigns it. `purchase-check` is runner-readable only for the current assignment, so an offer card cannot use it: when offers exist (RA-1) they must carry `overPurchaseLimit` (or the runner's `maxPurchaseAdvance` from `GET /runners/me` is compared with the offer's item amount on the client). Until RQ-1 (row 113) is answered the builder ships `v-jobs` with the availability card, the verification card, the empty states and the `You have an active job` card only (no offer cards).

## Accessibility and mobile
- Card reads as one item (`Check It For Me, Check apartment — Nyali, 1,750 shillings, 1.2 km away`) with two actions exposed.
- Switch hit area 48; disabled switch announces the reason.
- New offers are announced politely (`New job offer`), not by stealing focus.
- Pull-to-refresh.

## Questions
- RQ-1 (state machine / matching, blocking for this screen): how offers work (default in the gap report).
- RQ-8: estimated duration and per-task evidence requirements (default: not shown until the API has them).
- RQ-11: location pings while online without a job.
