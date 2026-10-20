# x-location-disclosure — Location permission disclosure

- Mockup: **not drawn**. Required by system design §7.2 ("a clear in-app disclosure and OS-level permission flow") and by Google Play's prominent-disclosure rule for background location. Built from the `.auth-wrap` layout and design-system patterns; all copy **(proposed)**.
- Shared conventions: `_shared.md` (§10)
- Implementation: `apps/runner_app/lib/src/screens/location/location_disclosure_screen.dart` + `services/location_gate.dart` (on `main`); iOS strings in `apps/runner_app/ios/Runner/Info.plist`
- Status: matches-design (round 18 audit 2026-10-20 PASS on `feat/runner-answers`: approved Body 2, Always key and `ACCESS_BACKGROUND_LOCATION` removed; owner rows 245 / 246)

## Purpose
Explain, before the OS prompt, why Nitume needs the runner's location (including in the background during a job), when it is collected and when it stops; then request the permission.

## Entry / exit
- Entry: the first time the runner goes online (`v-jobs` switch) or accepts an offer without location permission; Profile has no entry (the OS settings own it afterwards).
- `Continue` → OS when-in-use prompt only. Back to the screen that asked.
- This is the only location prompt (while-in-use). There is no later background or "Always" step: during a job the Android location foreground service and the iOS `location` background mode keep sharing going when the runner switches apps or locks the phone (RQ-33, `v-active` "Location during a job").
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
- Body 2 (approved word for word, owner row 246, 2026-10-20): `During a job we keep sharing it when you switch apps or lock your phone, until you finish the task or go offline. If you close the app completely, or your phone stops it to save battery, sharing stops until you open the app again.`
  - Was: `During a job we keep sharing it even when the app is closed, until you finish the task or go offline.` (built).
  - Why: the reviewer found that "even when the app is closed" overstates what happens. After a force-quit (swiped away), iOS stops standard location updates and does not relaunch the app for them. On Android, the foreground service ends with the app's process, and the system or battery optimisation can stop it. "Closed" reads as exactly that case. The new text promises only what the app does: background and locked-screen sharing during a job (iOS `location` background mode; Android foreground service). It also says plainly what happens after a full close.
- Body 3: `We never share your location when you're offline, and customers only see it while you're working on their task.`
- Buttons: `Continue`, `Not now`.
- Body 1 and 2 match row 123: while online without a job the app shares location every 30 seconds (nearby jobs); during a job every few seconds; offline never.

## Numeric fields (Fira Code)
None.

## Data
OS strings and declarations (proposed; builder copy accepted 2026-10-19; corrected 2026-10-19 after reviewer FAIL 1, RQ-33 / RQ-34):
- iOS `NSLocationWhenInUseUsageDescription` (built, unchanged): `Nitume Runner uses your location to show you nearby jobs and to tell the customer when you're on the way and when you've arrived.` This is the only location prompt iOS shows.
- iOS `NSLocationAlwaysAndWhenInUseUsageDescription`: **remove** (built text `During a job Nitume Runner keeps sharing your location even when the app is closed, …` overstates and asks for more than needed). With the key gone the app cannot ask for Always. Auditor's reading, unverified: the `geolocator` iOS plugin may ask for Always at the first prompt while this key is present; removing it settles that either way.
- iOS `UIBackgroundModes` `location` (built): keep; it carries a running job's updates in the background with the blue indicator.
- Android: keep `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`; **remove** `ACCESS_BACKGROUND_LOCATION`. A location foreground service started while the app is visible keeps while-in-use access after the app leaves the screen (Android 10+); to verify on an Android 14 device during C-V5. No Play Console background-location declaration is then needed. Foreground-service notification text is final (`_shared.md` §10). Notification channel name (proposed 2026-10-20): `Location during jobs` (today the `geolocator` default `Background Location`).
- Android backup (owner row 255): `android:fullBackupContent` and `android:dataExtractionRules` exclude `files/nitume_evidence` (cloud backup and device transfer). iOS: `NSURLIsExcludedFromBackupKey` on the same folder (`nitume_runner_device` native channel).
- Camera and photo-library strings for ID, selfie and evidence (built).
No API data. Packages: `geolocator` + `permission_handler` (row 124).

## Accessibility and mobile
Heading announced; buttons 48 dp; Android 14 foreground-service type `location` with a persistent notification during a job: title `Nitume Runner`, text `Sharing your location for your active job.` (final, `_shared.md` §10).

## Decisions (owner, 2026-10-13)
- Row 123 (RQ-11): 30 s online, 4–8 s on a job, nothing offline (collection stops).
- Row 124 (RQ-12): packages approved.

## Current vs design (round 18, 2026-10-20, `feat/runner-answers` @ `28c1fe1`)
- Built as designed: `body2 = RunnerLocationCopy.disclosureBody2` (exact); `NSLocationAlwaysAndWhenInUseUsageDescription` removed; `ACCESS_BACKGROUND_LOCATION` removed (merged manifest checked by the builder); `UIBackgroundModes` `location`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` kept.
- Open: the channel name above (core-ui); Android 14 and iOS background device checks; iOS build of the native plugin (no Xcode run yet).

## Current vs design (2026-10-19, superseded)
- `location_disclosure_screen.dart:15-16` `body2` = the old Body 2. Change it to the proposed text once RQ-34 (BOARD row 246) is answered.
- `ios/Runner/Info.plist:64-65` `NSLocationAlwaysAndWhenInUseUsageDescription`: remove (RQ-33, BOARD row 245).
- `android/app/src/main/AndroidManifest.xml:13` `ACCESS_BACKGROUND_LOCATION`: remove (RQ-33).
- `location_gate.dart`: asks for when-in-use only (`requestAccess`). Correct, and now the only request.

## Questions (owner; full text in `docs/audits/runner-gap-report.md` §21)
- RQ-33 → BOARD row 245: answered 2026-10-20 (while-in-use only; keys removed).
- RQ-34 → BOARD row 246: answered 2026-10-20 (Body 2 approved as written).
