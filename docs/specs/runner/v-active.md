# v-active — Active job

- Mockup: `docs/design/nitume_runner_app.html` lines 210–244 (`#v-active`, root view)
- Shared conventions: `_shared.md` (§6 runner transitions, §8 reimbursement, §10 location/offline)
- Implementation: none
- Status: missing

## Purpose
The runner's working screen for the job they hold: navigate to the task location, move the job through its runner states, complete the evidence checklist, write notes, request a price change (purchase tasks only), and hand the job to the customer for confirmation.

## Entry / exit
- Entry: tab bar `Active`; `Accept` / `Accept job` success; push for the current job.
- `Navigate` → Google Maps turn-by-turn (`url_launcher`, `_shared.md` §10).
- Checklist rows `Photos` / `Receipt` (`Upload`) → `v-evidence-capture` with the evidence type preset.
- `Notes` (`Add` / `Edit`) → inline bottom sheet editor (below).
- `Request price authorization` → `v-price-request` (IN_PROGRESS, Buy For Me / Get It For Me only).
- `Mark task complete` → confirm → IN_PROGRESS → AWAITING_CUSTOMER → push `v-job-summary` (mockup `jump('v-job-summary')`).
- Ended job (CANCELLED / FAILED / DISPUTED / COMPLETED+) → the ended-state card (below); `Back to jobs` → Jobs tab.

## Task states
RUNNER_ASSIGNED (accepted), RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER, DISPUTED; ended: COMPLETED, CONFIRMED, SETTLED, CANCELLED, FAILED (EXPIRED never reaches an accepted job). Runner transitions only as `_shared.md` §6; the screen shows exactly one forward action for the current state and never offers a transition the state machine does not allow.

## Layout (top to bottom)
1. C-09 top bar `Active job`, trailing R-01 status chip (small) for the current state (proposed).
2. Job header line (proposed, padding 0 20 12): title 15/600 + Fira Code 12 slate-600 `#NT-10482 · Check It For Me` (reference Fira Code; category Sans would break the `.li-meta` rule, so the whole line is Fira Code as the design-system meta pattern).
3. R-16 job map (margin 0 20 14, height 190, r 16) with R-06 nav chip at the bottom (inset 12): destination = next point for the state (pickup before IN_PROGRESS on Get It For Me / Buy For Me with a pickup, else task site; drop-off once the pickup step is done), `addressText` 13/700, Fira Code `1.2 km · 6 min` (device distance; minutes from the device estimate until the API returns ETA, hidden when unknown), C-01 small `Navigate`. The nav chip is hidden at AWAITING_CUSTOMER and later.
4. C-08 `Checklist`.
5. R-07 checklist step cards (margin 0 20 10). Generic checklist (RQ-8 default; mockup items are task-specific samples):
   1. `Arrived at location`: done from ARRIVED on; sub `10:28 AM · GPS confirmed` when the API recorded a geofence arrival (system actor), `10:28 AM · Marked by you` for the manual override (time = the ARRIVED history entry, EAT). Not done: sub `Tap I've arrived when you get there`.
   2. `Photos`: done when ≥ 1 photo is uploaded by the runner; sub `3 photos uploaded` / `Required`; trailing `Upload` (C-02 small) from ARRIVED to IN_PROGRESS.
   3. `Receipt` (only when the errand has an item amount on `send_to_runner`, and on Buy For Me; rows 95, 105): done when ≥ 1 `receipt` evidence exists; sub `Required for your reimbursement` / `1 receipt uploaded`; trailing `Upload`.
   4. `Notes for the customer`: done when `runnerNotes` is set; sub `Write a short summary` / first 40 characters; trailing `Add` / `Edit` (ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER, the API's `RUNNER_NOTES_STATES`). Required for Check It For Me (proposed, RQ-8), optional otherwise.
   Uploaded evidence thumbnails (C-25 `EvidenceGrid`, 3 columns, margin 0 20 12) under the checklist, tap → `EvidenceViewer`.
6. Price change section (only IN_PROGRESS **and** category Buy For Me or Get It For Me, rows 49, 101): C-08 label `Price too low for the item found?`; R-09 action row: leading alert icon (mockup emoji `⚠️`), title `Request price authorization`, sub `Ask the customer to approve a higher amount`, chevron. While a request is pending: the row is replaced by a C-40 notice `Waiting for the customer to approve KSh 45,000.` (amount Fira Code) and the forward action is disabled (proposed: the runner should not finish until the customer decides). After approval: C-40 `Price change approved. New item amount KSh 45,000.`; after an admin rejection (row 55): `Price change not approved. Continue at the original amount or contact support.` (proposed).
7. Primary state action (margin 6 20 6), C-01 full width pill + caption 12 slate-600 centred under it (mockup: green card with white text; design system: primary button):
   | State | Button | Caption | Transition |
   |---|---|---|---|
   | RUNNER_ASSIGNED (accepted) | `Start trip` | `The customer will see you're on the way.` | → RUNNER_EN_ROUTE |
   | RUNNER_EN_ROUTE | `I've arrived` | `We'll also detect this automatically when you get there.` | → ARRIVED |
   | ARRIVED | `Start task` | `Let the customer know you've started.` | → IN_PROGRESS |
   | IN_PROGRESS | `Mark task complete` | `Customer will confirm evidence` (mockup) | → AWAITING_CUSTOMER |
   Disabled `Mark task complete` while a required checklist step is not done, with the caption replaced by `Upload photos to finish.` / `Upload the receipt to finish.` / `Add notes to finish.` (proposed).
8. Secondary action, RUNNER_EN_ROUTE only: C-04 text button centred `Can't complete this task` → C-35 dialog (below) → RUNNER_EN_ROUTE → FAILED with the reason as the transition note.
9. Tab bar (Active selected).

### Confirm dialogs (C-35, proposed)
- Mark complete: title `Finish and send to the customer?`; body `The customer will review your photos and notes. You can still edit your notes until they confirm.`; buttons `Finish` / `Not yet`.
- Can't complete: title `Can't complete this task?`; radio reasons `Can't reach the location`, `Safety concern`, `Vehicle or personal emergency`, `Other` (+ required 5–300 character text for `Other`); body `The task will be marked as failed and our team will follow up. There's no runner fee for a failed task.`; buttons `Mark as failed` (destructive) / `Keep going`.

### Notes editor (bottom sheet, proposed)
Title `Notes for the customer`; C-17 multiline, max 2000 characters (API limit; counter Fira Code `0/2000`); hint `The customer reads this with your photos.`; C-01 `Save`. Saved → C-40 / snackbar `Notes saved.`

### Other states
- **No active job**: C-33 empty `No active job` / `Accept a job from the Jobs tab to start.` + C-03 `Go to jobs` (proposed). No map.
- **More than one active job** (only if RA-1 allows): C-22-style compact rows at the top to switch jobs (proposed); default one job at a time.
- **AWAITING_CUSTOMER**: map and price section hidden; C-40 notice `Waiting for the customer to confirm. You'll be notified.`; checklist read-only except notes; link `View job summary` → `v-job-summary`.
- **DISPUTED**: C-40 `The customer reported a problem. Our team is reviewing it.`; once resolved, the resolution note (row 79) under `Outcome` (13 Sans) as the customer sees it.
- **COMPLETED / CONFIRMED / SETTLED**: success card `Job complete` with the R-01 chip and a link to `v-job-summary`; `Back to jobs`.
- **CANCELLED / FAILED** (rows 102, 106): danger chip; body `This task ended before completion, so there's no runner fee.`; when an item amount was on `send_to_runner`: `If you already bought the item, we'll review your receipt and reimburse what you spent.` and, per RQ-17, `Upload receipt` (C-02) within the allowed window or `Contact support`. Never mention the customer's refund.
- **Access revoked / reassigned** (`errand:access_revoked`, 403): clear the job, stop pings, C-40 `This job is no longer assigned to you.`, go to the empty state.
- **Offline**: queued action shown at once with C-40 `Saved on your phone. We'll send it when you're back online.`; rejected replay → reload the job and show `Couldn't update the job. It's now {label}.`
- **Transition errors**: 409 (state moved) → reload + `This job changed. Showing the latest.`; evidence missing (RA-11) → `Upload photos to finish.`; network → generic.

## Components
| Element | Component | Status |
|---|---|---|
| Top bar, chip | C-09, R-01 + C-05 | R-01 NEW |
| Map + nav chip | R-16, R-06 | NEW |
| Checklist rows | R-07 (C-36 inside, C-02 small) | NEW |
| Evidence thumbnails | C-25 | exists |
| Price change entry | R-09 | NEW |
| Notices | C-40 | exists |
| State action | C-01 + caption, C-04 | exists |
| Dialogs, radio rows | C-35, `NitumeRadioRow` | exists |
| Notes sheet | C-17 multiline | exists |
| Empty / error | C-33 | exists |

## Copy
Exact, from the mockup: `Active job`, `Navigate`, `Checklist`, `Arrived at location`, `10:28 AM · GPS confirmed`, `3 photos uploaded`, `Required`, `Upload`, `Add`, `Write a short summary`, `Price too low for the item found?`, `Request price authorization`, `Ask the customer to approve a higher amount`, `Mark task complete`, `Customer will confirm evidence`. Sample rows `Compound photos`, `Bedroom & bathroom video`, `Caretaker notes` are task-specific examples replaced by the generic checklist (RQ-8; `video` dropped, row 32 / RQ-9).

Everything else above is proposed.

## Numeric fields (Fira Code)
- Reference; arrival time; `1.2 km · 6 min`; photo/receipt counts (`3 photos uploaded`); price amounts in notices; notes counter; any time in the ended-state cards.

## Data
- Current job: `GET /errands?status=RUNNER_ASSIGNED,RUNNER_EN_ROUTE,ARRIVED,IN_PROGRESS,AWAITING_CUSTOMER,DISPUTED` (exists, runner-scoped to the current assignment) + `GET /errands/:id` (exists, but customer shape: RA-2 runner projection needed for `runnerFee`, `itemAmount`, `merchantRoute`; `feeTotal` must not be sent to runners).
- History for the arrival time and actor: `GET /errands/:id/history` (exists).
- Transitions: `PATCH /errands/:id/status` `{ to, note? }` (exists; actor check enforces runner transitions). Needed: idempotent replay for the offline queue (RA-17) and the §3.3 guard "IN_PROGRESS → AWAITING_CUSTOMER requires evidence" (RA-11: not enforced today; also require a receipt on `send_to_runner`).
- Evidence list: `GET /errands/:id/evidence` (exists, signed URLs).
- Notes: `PATCH /errands/:id/runner-notes` `{ runnerNotes }` (exists; ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER).
- Price change: `GET /errands/:id/price-change?status=requested` (exists, runner allowed); decision event `price_change:decided` missing (RA-5; today the runner only learns of a reject through `errand:status_changed` → CANCELLED, and of an approval not at all).
- Dispute: `GET /errands/:id/dispute` (exists; runner gets `resolvedBy: null`, row 101) for the resolution note.
- Socket: `errand:join` for the job; `errand:status_changed`, `evidence:uploaded`, `errand:access_revoked` (exist).
- Location: `location:ping` while RUNNER_ASSIGNED (accepted) … IN_PROGRESS (RA-4 missing; R-20); geofence ARRIVED (system) depends on it. Until built, the manual `I've arrived` is the only path.
- Receipt after CANCELLED/FAILED: RQ-17 / RA-12.

## Accessibility and mobile
- Checklist rows read `Photos, required, button Upload`; done rows read `completed`.
- The primary action stays reachable (screen scrolls; no fixed overlay over content); 48 dp.
- Background location disclosure (`x-location-disclosure`) before the first `Start trip`.
- Screen stays awake is **not** forced (battery); pings run from the foreground service.

## Questions
- RQ-8 (product/schema): checklist source. Default: the generic checklist above.
- RQ-9: video evidence for runners. Default: photos only.
- RQ-17 (payments): receipt upload after CANCELLED/FAILED for row 106 claims.
- RQ-16 (privacy): how the runner reaches the customer during a job. Default: no direct contact or phone number; Support relays.
- RQ-20 (state machine): a runner who cannot complete from ARRIVED or IN_PROGRESS has no transition (FAILED only from RUNNER_EN_ROUTE). Default: no new transition; the runner contacts Support and ops handle it.
