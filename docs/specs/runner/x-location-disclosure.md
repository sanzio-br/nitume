# x-location-disclosure — Location permission disclosure

- Mockup: **not drawn**. Required by system design §7.2 ("a clear in-app disclosure and OS-level permission flow") and by Google Play's prominent-disclosure rule for background location. Built from the `.auth-wrap` layout and design-system patterns; all copy **(proposed)**.
- Shared conventions: `_shared.md` (§10)
- Implementation: `apps/runner_app/lib/src/screens/location/location_disclosure_screen.dart` + `services/location_gate.dart` (on `main`); iOS strings in `apps/runner_app/ios/Runner/Info.plist`
- Status: partial (2026-10-19: Body 2 and the iOS background string change, pending RQ-34; the rest of the audited 2026-10-19 PASS stands)

## Purpose
Explain, before the OS prompt, why Nitume needs the runner's location (including in the background during a job), when it is collected and when it stops; then request the permission.

## Entry / exit
- Entry: the first time the runner goes online (`v-jobs` switch) or accepts an offer without location permission; Profile has no entry (the OS settings own it afterwards).
- `Continue` → OS when-in-use prompt only. Back to the screen that asked.
- The background step is not on this screen. It comes at the first job start, on `v-active` ("Location at job start": a short in-app disclosure dialog right before the background request, as Google Play requires; Android "Allow all the time"; iOS per RQ-33).
- `Not now` → back; going online / accepting stays blocked with C-40 `Turn on location to receive and do jobs.` + `Open Settings` when permanently denied.

## Task states
Before an accept (RUNNER_ASSIGNED → RUNNER_EN_ROUTE), or before going online.

## Layout
Full-screen pushed (C-10 back), `.auth-wrap`-style centred column, padding 0 28:
1. 56px circle blue-050 with an outline location icon (blue).
2. Heading 22/700 `Share your location while you work`.
3. Body 13.5 slate-600 (three short paragraphs, below).
4. C-01 `Continue`; C-04 text `Not now`.

## Copy (proposed)
- Body 1: `Nitume uses your location to show you nearby jobs, to tell the customer when you're on the way and when you've arrived.`
- Body 2 (changed 2026-10-19, proposed, RQ-34): `During a job we keep sharing it when you switch apps or lock your phone, until you finish the task or go offline. If you close the app completely, sharing stops until you open it again.`
  - Was: `During a job we keep sharing it even when the app is closed, until you finish the task or go offline.` (built).
  - Why: the reviewer found that "even when the app is closed" overstates what happens. After a force-quit (swiped away), iOS stops standard location updates and does not relaunch the app for them. On Android, the foreground service ends with the app's process. "Closed" reads as exactly that case. The new text promises only what the app does: background and locked-screen sharing during a job (iOS `location` background mode; Android foreground service). It also says plainly what happens after a full close.
- Body 3: `We never share your location when you're offline, and customers only see it while you're working on their task.`
- Buttons: `Continue`, `Not now`.
- Body 1 and 2 match row 123: while online without a job the app shares location every 30 seconds (nearby jobs); during a job every few seconds; offline never.

## Numeric fields (Fira Code)
None.

## Data
OS strings (proposed; builder copy accepted 2026-10-19, taken from Body 1 and Body 2; amended 2026-10-19 for RQ-34):
- iOS `NSLocationWhenInUseUsageDescription` (built, unchanged): `Nitume Runner uses your location to show you nearby jobs and to tell the customer when you're on the way and when you've arrived.`
  - With the recommended RQ-33 option (no Always request on iOS), this string is the one iOS shows. The background mode keeps a running job's updates going, and iOS shows the blue location indicator while the app is in the background.
- iOS `NSLocationAlwaysAndWhenInUseUsageDescription`:
  - Built: `During a job Nitume Runner keeps sharing your location even when the app is closed, until you finish the task or go offline.` It overstates: see Body 2.
  - Proposed: `During a job Nitume Runner keeps sharing your location while it runs in the background, until you finish the task or go offline. If you close the app completely, sharing stops until you open it again.`
  - RQ-33 recommended option: remove the key, and with it the Always request. Auditor's reading, not verified on a device: the `geolocator` iOS plugin seems to ask for "Always" at the first prompt when this key is in `Info.plist`. If so, the when-in-use prompt on this screen is really an Always prompt. core-ui and flutter-runner should check on a device (C-V5).
- Camera and photo-library strings for ID, selfie and evidence (built).
- Android: no permission strings; the foreground-service notification text is final (`_shared.md` §10). Store declarations: the Play Console background-location declaration and its video show the `v-active` job-start step, so they are prepared with the `v-active` build (reviewer note, batch 1).
No API data. Packages: `geolocator` + `permission_handler` (row 124).

## Accessibility and mobile
Heading announced; buttons 48 dp; Android 14 foreground-service type `location` with a persistent notification during a job: title `Nitume Runner`, text `Sharing your location for your active job.` (final, `_shared.md` §10).

## Decisions (owner, 2026-10-13)
- Row 123 (RQ-11): 30 s online, 4–8 s on a job, nothing offline (collection stops).
- Row 124 (RQ-12): packages approved.

## Current vs design (2026-10-19)
- `location_disclosure_screen.dart:15-16` `body2` = the old Body 2. Change it to the proposed text once RQ-34 is answered.
- `Info.plist:64-65` `NSLocationAlwaysAndWhenInUseUsageDescription` = the old string. Remove it (RQ-33 recommended) or replace it (RQ-34).
- `location_gate.dart`: asks for when-in-use only (`requestAccess`). Correct for this screen. Background access is the `v-active` step.

## Questions (owner; full text in `docs/audits/runner-gap-report.md` §21)
- RQ-33: the background-location approach per platform.
- RQ-34: the accurate Body 2 and iOS string above.
