# v-active — Active job

- Mockup: `docs/design/nitume_runner_app.html` lines 210–244 (`#v-active`, root view)
- Shared conventions: `_shared.md` (§6 runner transitions and active set, §8 reimbursement, §10 location/offline)
- Implementation: `apps/runner_app/lib/src/screens/active/active_tab.dart` on `main` is a placeholder (`RootTabPlaceholder(title: 'Active')`); nothing of this spec is built
- Status: missing
- Refreshed 2026-10-19 (design-auditor, `docs/runner-v-active-spec`) for owner rows 185, 197, 205, 206, 211, 235, 239 and the batch-1 review notes (B-1, S-1, iOS "Always" wording). Everything not drawn in the mockup is marked **(proposed)**.

## Purpose
The runner's working screen for the job they hold: navigate to the task, move the job through its runner states, complete the evidence checklist, write notes for the customer, request a price change (purchase tasks only) and hand the job to the customer for confirmation. It also shows jobs that are waiting for the customer or disputed, and ended jobs that still need a receipt.

## Entry / exit
- Entry:
  - tab bar `Active`;
  - `Accept` / `Accept job` success on `v-jobs` / `v-job-detail` (the job arrives in RUNNER_EN_ROUTE, row 113): the shell selects the Active tab and shows **that** job;
  - push tap for a held job (`_shared.md` §10 deep links): shows the job named by `errandId` if the runner holds it, else the default job.
- Before the first job starts: the background-location step (below, "Location at job start").
- `Navigate` → Google Maps turn-by-turn (`url_launcher`, `_shared.md` §10). No in-app navigation.
- Checklist `Upload` on `Photos` / `Receipt` → `v-evidence-capture` with the evidence type preset.
- Checklist `Add` / `Edit` on `Notes for the customer` → notes editor (pushed screen, below).
- `Request price authorization` → `v-price-request` (IN_PROGRESS, Buy For Me / Get It For Me only).
- `Mark task complete` → confirm → IN_PROGRESS → AWAITING_CUSTOMER → push `v-job-summary` (mockup `jump('v-job-summary')`).
- `View job summary` (AWAITING_CUSTOMER and later) → `v-job-summary`.
- `Get help with this task` → `x-support` (row 128: no direct contact with the customer).
- `Other jobs` row tap → the screen switches to that job (no new route) (proposed).
- Empty state `Go to jobs` → Jobs tab.

## Task states
- Shown here (the runner's **active set**, `_shared.md` §6): RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER, DISPUTED.
- Ended jobs that still matter to the runner: CANCELLED / FAILED (receipt window, row 129), COMPLETED / CONFIRMED / SETTLED (until the runner leaves the job, below).
- Never shown here:
  - RUNNER_ASSIGNED: an open offer, shown on `v-jobs` / `v-job-detail` only. The core constant `RunnerJobsRepository.activeStatuses` includes RUNNER_ASSIGNED, and `GET /errands?status=…` returns the runner's open offers too. This screen must drop jobs whose assignment is still `offered` (core-ui need C-V3).
  - EXPIRED: never reaches an accepted job (rows 113, 185).
  - A task ops cancelled, or that expired, before this runner accepted (row 197): the runner never held it, so it never appears here and gets no receipt card.
- Runner transitions only as `_shared.md` §6 (`RunnerJobsRepository.runnerTransitions`): the screen shows exactly one forward action for the current state and never offers a transition the state machine does not allow.

### Busy and several active jobs (row 211, owner 2026-10-19)
- Rule (decided): only RUNNER_EN_ROUTE, ARRIVED and IN_PROGRESS make a runner busy. AWAITING_CUSTOMER and DISPUTED free the runner for new offers (API `RUNNER_ACTIVE_JOB_STATES`).
- Consequence: a runner holds at most **one working job** (RUNNER_EN_ROUTE, ARRIVED or IN_PROGRESS; an accept while holding one answers 409 `runner_busy`), plus any number of AWAITING_CUSTOMER or DISPUTED jobs.
- Which job the screen shows **(proposed)**:
  1. the job the runner opened (from accept, a push, or an `Other jobs` row), while it is still in the active set or ended less than 24 h ago;
  2. else the working job;
  3. else the most recently updated AWAITING_CUSTOMER or DISPUTED job;
  4. else a CANCELLED / FAILED job whose 24-hour receipt window is still open and that has no receipt yet (receipt case only, `send_to_runner` with an item amount);
  5. else the empty state.
- `Other jobs` section **(proposed, extends the mockup)**: shown when the runner holds more than one active-set job.
  - C-08 `Other jobs`, then one C-07-style row per other job: core `TaskRow` (title 13/600 Sans, meta Fira Code 11 slate-600 `#NT-10482`, trailing R-01 small chip).
  - Tap → the screen switches to that job; the top-bar chip follows the shown job.
  - Order: the working job first, then by last update, newest first.
  - Placed after the primary action (item 9 below) so the working job's controls stay on top.
- Location pings run only for the working job, whichever job is on screen (row 27; `_shared.md` §10).
- No tab badge (none in the mockup).

### Deadline after accept (rows 185, 205, 206, 235, 239)
- Decided: the customer deadline only acts on RUNNER_ASSIGNED (row 185). Once the runner accepted, a passed deadline changes nothing: no expiry, no state change.
- Every task the runner holds has `deadlineAt`: it is set at the latest at PAYMENT_CONFIRMED (row 239 (a); a Flexible task gets payment time + 24 h, row 235). The runner never sees "No deadline yet", because states before payment never reach the runner.
- Display **(proposed)**: one meta part in the job header line, `Due Tue, 4:12 PM` (Fira Code, EAT, `formatDayTimeEat`), RUNNER_EN_ROUTE to IN_PROGRESS only.
  - It stays as a plain time after it passes: no red, no `Late`, no countdown, since no rule exists for late work.
  - Hidden when `deadlineAt` is null (dev data), and from AWAITING_CUSTOMER on.

## Layout (top to bottom)
1. C-09 top bar `Active job`, trailing R-01 small status chip for the shown job's state (proposed).
2. Job header (proposed, padding 0 20 12):
   - title 15/600 Sans (`title`, else the category display name, `_shared.md` §7);
   - meta line, Sans with Fira Code numbers only (`JobOfferCard.richMeta` rule, `_shared.md` §3): `#NT-10482 · Check It For Me · Due Tue, 4:12 PM`. The reference and the time are Fira Code; the category is Sans.
3. R-16 `JobRouteMap` (margin 0 20 14, height 190, r 16) with R-06 `NavigationChip` as its overlay (bottom, inset 12):
   - Destination = the next point for the state: pickup before IN_PROGRESS when the task has a pickup (Get It For Me / Buy For Me), else the task site; the drop-off once the job is IN_PROGRESS and has one.
   - `addressText` 13/700 Sans; detail Fira Code 11 `1.2 km · 6 min`: the device distance (`formatDistanceKm`), minutes from a device estimate until the API returns an ETA, hidden when unknown. Without a device fix: `Distance unavailable` (Sans, as `v-job-detail`).
   - C-01 small `Navigate` (green action, mockup `.go-btn`).
   - Map and chip are hidden from AWAITING_CUSTOMER on.
   - Without a maps key: the placeholder body (blue-050 grid, `_shared.md` §2), chip still shown.
4. Location notice (proposed; only during the working job, see "Location at job start"): C-40 when the pinger reports no fix, or background access is missing.
5. C-08 `Checklist`.
6. R-07 `ChecklistStepCard` rows (margin 0 20 10). Generic checklist (row 120; the mockup rows are task-specific samples):
   1. `Arrived at location`:
      - done from ARRIVED on;
      - sub `10:28 AM · GPS confirmed` when the ARRIVED history entry's actor is System (geofence), `10:28 AM · Marked by you` when the runner tapped `I've arrived` (time from the ARRIVED history entry, EAT, `formatClockEat`);
      - not done: sub `Tap I've arrived when you get there`.
   2. `Photos`:
      - done when the runner has uploaded at least 1 photo;
      - sub `3 photos uploaded` / `Required`;
      - trailing C-02 small `Upload`, from ARRIVED to IN_PROGRESS.
   3. `Receipt`: only on `send_to_runner` with an item amount (Buy For Me, or Get It For Me with a purchase; rows 95, 105).
      - Done when at least 1 `receipt` evidence exists.
      - Sub `Required for your reimbursement` / `1 receipt uploaded`.
      - Trailing `Upload`, from ARRIVED to AWAITING_CUSTOMER.
   4. `Notes for the customer`:
      - done when `runnerNotes` is set;
      - sub `Write a short summary` / the first 40 characters;
      - trailing `Add` / `Edit` in ARRIVED, IN_PROGRESS and AWAITING_CUSTOMER (`RunnerJobsRepository.runnerNotesStatuses`).
      - Required for Check It For Me, optional otherwise (proposed, within row 120's generic checklist; client-side only, no API rule).
   - Uploaded evidence under the checklist: C-25 `EvidenceGrid` (3 columns, margin 0 20 12), tap → `EvidenceViewer`.
   - Upload states for this session's captures come from the job-scoped R-22 uploader (see `v-evidence-capture`).
7. Price change (only IN_PROGRESS **and** Buy For Me or Get It For Me, rows 49, 101):
   - C-08 label `Price too low for the item found?`;
   - R-09 row (core `MenuRow` with `leadingIcon` and `subtitle`): leading outline alert icon slate-600 (mockup emoji `⚠️` replaced, `_shared.md` §2), title `Request price authorization`, sub `Ask the customer to approve a higher amount`, chevron.
   - Request pending: the row is replaced by C-40 `Waiting for the customer to approve KSh 45,000.` (amount Fira Code). The forward action is disabled with the caption `Wait for the customer's answer to finish.` (proposed: the runner should not finish until the customer decides).
   - Approved: C-40 `Price change approved. New item amount KSh 45,000.` For `send_to_runner` see RQ-36 (approved but the difference not paid yet).
   - Rejected by an admin (row 55): C-40 `Price change not approved. Continue at the original amount or contact support.` (proposed).
   - Rejected by the customer: the errand goes CANCELLED (row 37) and the ended-state card shows.
8. Primary state action (margin 6 20 6): C-01 full-width pill, with a 12 slate-600 caption centred under it. Mockup: a green card with white text; the design-system button wins.

   | State | Button | Caption | Transition |
   |---|---|---|---|
   | RUNNER_EN_ROUTE | `I've arrived` | `We'll also detect this automatically when you get there.` | → ARRIVED |
   | ARRIVED | `Start task` | `Let the customer know you've started.` | → IN_PROGRESS |
   | IN_PROGRESS | `Mark task complete` | `Customer will confirm evidence` (mockup) | → AWAITING_CUSTOMER |

   - `Mark task complete` is disabled while a required step is not done. The caption is replaced by the first missing item: `Upload photos to finish.` / `Upload the receipt to finish.` / `Add notes to finish.` / `Wait for the customer's answer to finish.` (proposed).
   - The `I've arrived` caption is shown only once the API sends geofence arrivals (RA-4). Until then the caption is `Tap when you get there.` (proposed), so the app never promises a detection that does not exist yet.
9. Secondary action:
   - RUNNER_EN_ROUTE: C-04 text button centred `Can't complete this task` → C-35 dialog (below) → RUNNER_EN_ROUTE → FAILED, with the reason as the transition note (≤ 500).
   - ARRIVED and IN_PROGRESS have no FAILED (row 132). The secondary action is C-04 `Get help with this task` → `x-support`.
10. `Other jobs` (above, proposed).
11. Tab bar (Active selected).

### Location at job start (background permission, proposed; RQ-33, RQ-34)
- Today on `main`: `x-location-disclosure` asks for when-in-use before going online or accepting. Android declares `ACCESS_BACKGROUND_LOCATION` and the location foreground service. iOS declares `NSLocationAlwaysAndWhenInUseUsageDescription` and the `location` background mode. No code asks for background access yet (`PositionSource` has no such call: core-ui need C-V5).
- When: right after the first successful accept while background access is not granted. The job is already RUNNER_EN_ROUTE, so the step never blocks or delays the accept. Asked again at a later job start only if the runner chose `Not now`, at most once per job.
- Step 1, in-app prominent disclosure (Google Play requires it immediately before the background request). C-35 dialog:
  - title `Keep sharing your location during jobs`;
  - body `While you're on a job, Nitume Runner shares your location with the customer, also when you switch apps or lock your phone. It stops when you finish the task or go offline. If you close the app completely, sharing stops until you open it again.`;
  - Android extra line: `On the next screen, choose "Allow all the time".`;
  - buttons `Continue` (primary) / `Not now` (text).
- Step 2, the OS:
  - **Android 10**: the system dialog.
  - **Android 11+**: the app settings page (the OS no longer offers "Allow all the time" in a dialog). Return to `v-active` afterwards.
  - **iOS**: depends on RQ-33. Recommended: no Always request on iOS. The `location` background mode keeps updates that started in the foreground running while the app is in the background or the phone is locked, with the blue status-bar indicator. "Always" is only needed to start location from the background, which Nitume does not do.
- Refused or `Not now`:
  - The job continues. Pings run while the app is in the foreground only.
  - C-40 on this screen (item 4): `Location sharing pauses when you leave the app. To let the customer follow you, allow location all the time in Settings.` + C-04 `Open Settings` (proposed).
  - Never block the job, a transition or evidence on background permission.
- Pinger trouble during the working job (`PingerStatus.noFix`: services off, permission revoked): C-40 `Location is off. The customer can't see where you are.` + `Open Settings` (proposed).
- After the app was closed completely (force-quit, or the OS killed it) and opened again: when the runner holds a working job, pings restart at once in `PingActiveJob` mode, without a prompt. The runner sees nothing extra.
- Android foreground-service notification (final, `_shared.md` §10): `Nitume Runner` / `Sharing your location for your active job.`, shown only while background collection runs.

### Confirm dialogs (C-35, proposed)
- Mark complete:
  - title `Finish and send to the customer?`;
  - body `The customer will review your photos and notes. You can still edit your notes until they confirm.`;
  - buttons `Finish` / `Not yet`.
- Can't complete:
  - title `Can't complete this task?`;
  - `NitumeRadioRow` reasons: `Can't reach the location`, `Safety concern`, `Vehicle or personal emergency`, `Other`. `Other` adds a required C-17 text, 5–300 characters;
  - body `The task will be marked as failed and our team will follow up. There's no runner fee for a failed task.`;
  - buttons `Mark as failed` (destructive) / `Keep going`.
  - The note sent is the reason label, plus the text for `Other`.

### Notes editor (pushed screen, proposed)
- Changed from the earlier bottom sheet: a pushed screen fits a 2000-character text on small phones and needs no new core widget.
- C-10 header `Notes for the customer`.
- C-17 multiline, max 2000 characters (API limit), with the Fira Code counter `0/2000`.
- Hint `The customer reads this with your photos.`
- `NitumeFixedCta` with C-01 `Save`.
- Saved → back, snackbar `Notes saved.`
- Offline → queued (R-21 `runnerNotes` action) with the offline notice.
- Leaving with unsaved text: C-35 `Discard your changes?` / `What you wrote will be lost.` / `Discard` · `Keep editing`.

### Other states
- **Loading**: C-33 `SkeletonCard` × 3 (map, two step cards).
- **No active job**: C-33 empty, title `No active job`, body `Accept a job from the Jobs tab to start.`, C-03 `Go to jobs` (proposed). No map.
- **AWAITING_CUSTOMER**:
  - map, nav chip and price section hidden;
  - C-40 `Waiting for the customer to confirm. You'll be notified.`;
  - checklist read-only except `Notes` and `Receipt`;
  - C-04 `View job summary` → `v-job-summary`.
- **DISPUTED**: C-40 `The customer reported a problem. Our team is reviewing it.` Once resolved, the resolution note (row 79) under C-08 `Outcome` (13 Sans), as the customer sees it.
- **COMPLETED / CONFIRMED / SETTLED**:
  - C-07 card with the R-01 chip, `Job complete`, C-04 `View job summary`, C-03 `Back to jobs`;
  - the job leaves the screen when the runner taps `Back to jobs` or opens another job (proposed).
- **CANCELLED / FAILED** (rows 102, 106, 129, 197):
  - danger chip; body `This task ended before completion, so there's no runner fee.`
  - When an item amount was on `send_to_runner`, add `If you already bought the item, we'll review your receipt and reimburse what you spent.`
  - For 24 hours after the CANCELLED / FAILED history time (row 129):
    - C-02 `Upload receipt` (→ `v-evidence-capture`, type receipt);
    - the claim on `v-job-summary`;
    - a line with the time in Fira Code: `You can upload it until Tue, 4:12 PM.`
  - After the window: `The upload window has closed. Contact support with your receipt.` + `Contact support` (proposed).
  - Never mention the customer's refund. Row 197: never shown for a task the runner had not accepted.
- **Access revoked / reassigned** (`errand:access_revoked`, or 403 on the job): drop the job, stop pings if it was the working job, C-40 `This job is no longer assigned to you.`, then the next job by the selection rule, or the empty state.
- **Offline**:
  - A queued action shows its target state at once, with C-40 `Saved on your phone. We'll send it when you're back online.`
  - A refused replay → reload the job and show C-40 (danger) `Couldn't update the job. It's now {label}.`
- **Transition errors**: one C-40 in the **danger** tone, one copy per failure, no snackbar on top (the S-1 / m-7 rule from `v-onboard-selfie`):
  - 409 `illegal_transition` (the state moved) → reload + `This job changed. Showing the latest.`;
  - evidence missing (RA-11, once built) → the matching caption text (`Upload photos to finish.` …);
  - network → `Check your connection and try again.`;
  - other → `Something went wrong. Please try again.`

## Components
| Element | Component (core class) | Status |
|---|---|---|
| Top bar, chip | C-09 `NitumeTopBar`, R-01 `runnerStatusPresentation` + C-05 `StatusChip` small | exists |
| Job header meta | `NitumeTextStyles` + `NumSpan` (rich meta as `JobOfferCard.richMeta`) | exists |
| Map + nav chip | R-16 `JobRouteMap`, R-06 `NavigationChip` | exists |
| Checklist rows | R-07 `ChecklistStepCard` (C-36 inside, C-02 small action) | exists |
| Evidence thumbnails | C-25 `EvidenceGrid` / `EvidenceViewer` | exists |
| Price change entry | R-09 = C-24 `MenuRow` (`leadingIcon`, `subtitle`) | exists |
| Notices | C-40 `NitumeNotice` (default and danger tones) | exists |
| State action | C-01 `NitumeButton.primary` + caption, C-04 `NitumeButton.text` | exists |
| Dialogs, radio rows | C-35 `NitumeDialog` / `showNitumeConfirmDialog`, `NitumeRadioRow` | exists |
| Notes editor | C-10 `NitumePushedHeader`, C-17 `NitumeField.multiline`, `NitumeFixedCta` | exists |
| Other jobs rows | `TaskRow` (title, Fira Code meta, trailing chip) | exists |
| Empty / loading / error | C-33 `NitumeEmptyState`, `SkeletonCard`, `NitumeErrorState` | exists |
| Pings | R-20 `LocationPinger` (`PingActiveJob`, `PingerStatus`) | exists; **change** C-V5 (background access request) |
| Offline queue | R-21 `OfflineActionQueue` + `RunnerQueuedActions` | exists |
| Held-jobs data | R-19 `RunnerJobsRepository` | **change** C-V3 (held jobs in runner projection, without open offers) |
| Price-change decided event | core `RealtimeEvents` | **change** C-V6 (after API item A8) |

## Copy
Exact, from the mockup: `Active job`, `Navigate`, `Checklist`, `Arrived at location`, `10:28 AM · GPS confirmed`, `3 photos uploaded`, `Required`, `Upload`, `Add`, `Write a short summary`, `Price too low for the item found?`, `Request price authorization`, `Ask the customer to approve a higher amount`, `Mark task complete`, `Customer will confirm evidence`.

The mockup's sample rows `Compound photos`, `Bedroom & bathroom video` and `Caretaker notes` are task-specific examples. They are replaced by the generic checklist (row 120; video dropped, rows 32, 121). The street `Links Road, Nyali` is sample data.

Everything else above is **proposed**: the header line, `Due …`, `Other jobs`, captions, dialogs, notices, the background-location dialog, the notes editor and the ended-state copy.

## Numeric fields (Fira Code)
- Reference (`#NT-10482`); `Due` time; arrival time; `1.2 km · 6 min`; photo and receipt counts (`3 photos uploaded`, `1 receipt uploaded`); amounts in price notices; notes counter `0/2000`; the receipt-window time; references in `Other jobs` rows.

## Data
For api-contract: what the screen needs. Item numbers match `docs/audits/runner-gap-report.md` §21.
- **Held jobs, runner projection** (A1): the runner's accepted jobs in the active set, plus ended jobs for 24 h, as `RunnerJobView` (`runnerFee`, `itemAmount`, `merchantRoute`, `requiredPurchase`, `deadlineAt`, `locations`, `runnerNotes`, `status`, `assignment.status`), **without open offers**.
  - Today: `GET /errands?status=…` (customer shape, priced fields nulled for runners by `withoutCustomerPricing`; includes open offers) plus one `GET /runners/me/jobs/:id` per job (exists).
  - Needed: one list call, or confirmation that list + N detail calls is the contract.
- **Job after it ends** (A2): `GET /runners/me/jobs/:id` must stay readable for the runner who accepted, in DISPUTED, COMPLETED, CONFIRMED, SETTLED, CANCELLED and FAILED. 403 only when reassigned, or when the runner never accepted (row 197).
- **Arrival actor** (A3): `GET /errands/:id/history` (exists) must give the runner the ARRIVED entry's time and `actorType` (`system` vs `runner`). Actor names stay admin-only (api-runner-1 B2).
- **Transitions**: `PATCH /errands/:id/status` `{ to, note? }` (exists, actor-checked).
  - Needed: the §3.3 guard "IN_PROGRESS → AWAITING_CUSTOMER requires evidence": at least 1 runner photo, plus a receipt on `send_to_runner` with an item amount. Use a code naming what is missing (A4, RA-11; not enforced today).
  - Needed: idempotent replay for queued transitions and notes (A6, RA-17). The client sends the queue action id as the key.
- **Evidence list**: `GET /errands/:id/evidence` (exists, signed URLs). Upload: `v-evidence-capture`.
- **Notes**: `PATCH /errands/:id/runner-notes` `{ runnerNotes }` (exists; ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER).
- **Price change**: `GET /errands/:id/price-change?status=requested` (exists, runner allowed).
  - Needed: `price_change:decided` to the runner (A8, RA-5): `{ errandId, requestId, status: approved | rejected, toPrice, decidedAt }`, and for RQ-36 whether the difference is paid.
  - Today the runner learns of a customer reject only through `errand:status_changed` → CANCELLED, and of an approval not at all (poll on screen open, 15 s while pending).
- **Dispute**: `GET /errands/:id/dispute` (exists; runner gets `resolvedBy: null`, row 101) for the resolution note.
- **Socket**: `errand:join` for **each** held job (one room per job, exists); `errand:status_changed`, `evidence:uploaded`, `errand:access_revoked` (exist).
- **Location**: `location:ping { lat, lng, errandId, accuracy, ts }` every 4–8 s / 15 m for the working job (row 123).
  - Missing on the API (A7, RA-4): no subscriber exists. The client pinger (R-20) is built but has nowhere to send.
  - The geofence ARRIVED (system actor) depends on it. Until then the manual `I've arrived` is the only path.
- **Receipt after CANCELLED / FAILED**: upload as `v-evidence-capture`; the claim `POST /runners/me/reimbursement-claims` from `v-job-summary` (exists). The 24 h window is not enforced (A10, RA-12).
- **Push**: notification kinds for this screen (job cancelled, failed, disputed, confirmed, price change decided) with `errandId` for the deep link (RA-6).

## Accessibility and mobile
- Checklist rows read `Photos, required, button Upload`; done rows read `completed`.
- The primary action stays reachable: the screen scrolls, with no fixed overlay over content; 48 dp.
- `Other jobs` rows read `{title}, {state label}, {reference}`.
- The background-location dialog is a real dialog (focus moves into it); `Open Settings` is 48 dp.
- The screen is not kept awake (battery); pings run from the foreground service during the working job.
- Bottom content above the tab bar's safe area.

## Decisions (owner)
- Row 113: accept is the RUNNER_ASSIGNED → RUNNER_EN_ROUTE transition; no `Start trip` step on this screen.
- Row 120 (RQ-8): generic checklist. Row 121 (RQ-9): photos only.
- Row 123 (RQ-11): 4–8 s pings on a job, none offline.
- Row 128 (RQ-16): no direct contact with the customer; Support relays.
- Row 129 (RQ-17): receipts up to 24 h after CANCELLED/FAILED, then the ops process.
- Row 132 (RQ-20): no FAILED from ARRIVED/IN_PROGRESS; `Get help with this task` → Support.
- Rows 185, 205 (2026-10-16, 2026-10-19): the deadline acts on RUNNER_ASSIGNED only; an accepted job is unaffected.
- Row 197 (2026-10-16): nothing for a task the runner never accepted.
- Rows 206, 235, 239 (2026-10-19): every task the runner holds has a deadline, set by payment at the latest.
- Row 211 (2026-10-19): busy = RUNNER_EN_ROUTE, ARRIVED, IN_PROGRESS; AWAITING_CUSTOMER and DISPUTED free the runner, so this screen can hold several active-set jobs (`Other jobs`, proposed).

## Questions (owner; full text in `docs/audits/runner-gap-report.md` §21)
- RQ-33: the background-location approach (Android "Allow all the time" at job start; iOS without "Always"), and never blocking a job without it.
- RQ-34: the accurate disclosure wording and OS strings (the reviewer found that "even when the app is closed" overstates behaviour after a force-quit).
- RQ-35: retention of stored runner location (`runner_locations`).
- RQ-36: a price increase on `send_to_runner` approved before the difference is paid.
