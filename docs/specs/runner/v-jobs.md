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
- `Decline` → C-35 confirm (below) → decline (RA-1) → card removed.
- Verification card (not verified) → `v-onboard-pending`.

## Task states
Offers: errands in RUNNER_ASSIGNED with an assignment `offered` to this runner (row 113). An offer lasts 10 minutes when an admin made it (90 s for auto-offers, row 114); when it lapses the task moves to EXPIRED (row 141 pending: at once or after re-offers) and the card disappears. Accepted jobs (now RUNNER_EN_ROUTE) leave this list and appear on `v-active`.

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
| Meta (Fira Code, ` · ` separated, only parts that exist) | distance from the device to the first task point (R-18); no estimated duration (row 120); purchase terms (§8); evidence requirement (proposed `Photos required`; never `video`, row 32 / RQ-9); `Signature on delivery` only if the API carries such a requirement (it does not today; dropped) | `1.2 km away · Photos required` · `2.8 km away · Item KSh 5,000 · Customer pays the merchant` |
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
- Decline dialog: title `Decline this job?`; body `We'll offer it to another runner.`; when over the limit, body `This job needs a purchase above your limit. We'll offer it to another runner. This won't count against you.` (row 113: over-limit declines are not penalised); buttons per the core confirm convention (`showNitumeConfirmDialog`): `Decline` (outline, confirm, not destructive-red) then `Keep offer` (primary). No reason picker: the only stored reason is `over_purchase_limit` (row 134), sent automatically when the offer is over the limit; other declines send no reason.
- Going offline with an active job: blocked, snackbar `Finish your active job before going offline.`
- Accept errors: `purchase_limit_exceeded` → snackbar `This job is above your purchase limit.`; offer expired or withdrawn (`offer_expired`, 409/404) → `That offer is no longer available.` and the card is removed; `runner_busy` → `Finish your active job first.`; not verified/offline → the matching state above. (Codes are the RA-1 proposal; api-contract confirms them.)

## Numeric fields (Fira Code)
- Offer count in the section label; pay; every meta line (distance, item amount, limit); the areas line in the availability card (proposed, as drawn: `.avail-row span` is Fira Code); unread badge count if shown.

## Data
- `GET /runners/me` (exists): `availability`, `verificationLevel`, `maxPurchaseAdvance` (exists in the entity, exposed raw). Skills and areas are **not** returned (RA-10).
- `PATCH /runners/me/availability` `{ availability: 'online' | 'offline' }` (exists; no verification gate, RA-8; `busy` is server-set, proposed).
- Offers: **missing** (RA-1) `GET /runners/me/offers` → `[{ assignmentId, errandId, expiresAt, category, title, runnerFee, itemAmount, merchantRoute, overPurchaseLimit, firstPoint { lat, lng, addressText } }]`; `POST /errands/:id/accept` (named in system design §3.2, not built) and `POST /errands/:id/decline` `{ reason }`.
- Socket: room `runner:{runnerId}` with `job:offered`, `job:offer_withdrawn` (RA-5, missing). Polling fallback 20 s.
- Location: while online without a job, one ping every 30 s (row 123, R-20); offline, none. The distance on cards uses the device position locally (no API).
- Notifications unread count: `GET /notifications/unread-count` (exists, any role).
- Task states shown: RUNNER_ASSIGNED (offered).
- **Built vs needed** (rows 113, 137): `feat/api-owner-answers-6` has only `GET /errands/:id/purchase-check` and the over-limit decline on an *assigned* job. Row 137 replaces that with the offer model: api-contract builds `GET /runners/me/offers` (each offer: `assignmentId, errandId, expiresAt, category, title, runnerFee, itemAmount, merchantRoute, overPurchaseLimit, maxPurchaseAdvance, firstPoint`), accept (`POST /errands/:id/accept`, → RUNNER_EN_ROUTE, refuses over the limit), decline (`POST /errands/:id/decline` `{ reason?: 'over_purchase_limit' }`, task stays RUNNER_ASSIGNED), expiry → EXPIRED (RA-1, RA-3).

## Accessibility and mobile
- Card reads as one item (`Check It For Me, Check apartment — Nyali, 1,750 shillings, 1.2 km away`) with two actions exposed.
- Switch hit area 48; disabled switch announces the reason.
- New offers are announced politely (`New job offer`), not by stealing focus.
- Pull-to-refresh.

## Decisions (owner, 2026-10-13)
- Row 113 (RQ-1): offers inside RUNNER_ASSIGNED; accept → RUNNER_EN_ROUTE; decline → stays RUNNER_ASSIGNED and is reassigned; lapse → EXPIRED; accept above the limit refused; over-limit decline not penalised.
- Row 114 (RQ-2): admin offers 10 min, auto-offers 90 s (configurable).
- Row 116 (RQ-4): service areas from an ops-configured list.
- Row 120 (RQ-8): no estimated duration on cards; generic evidence line `Photos required`.
- Row 123 (RQ-11): 30 s pings while online without a job; none offline.

## Questions
- RQ-22, BOARD row 141 pending (state machine, rows 113/114): when one offer lapses, does the task go straight to EXPIRED (literal reading, specced), or may ops re-offer first and EXPIRED only follows an overall deadline? The runner screens are the same either way.
