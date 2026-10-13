# x-location-disclosure — Location permission disclosure

- Mockup: **not drawn**. Required by system design §7.2 ("a clear in-app disclosure and OS-level permission flow") and by Google Play's prominent-disclosure rule for background location. Built from the `.auth-wrap` layout and design-system patterns; all copy **(proposed)**.
- Shared conventions: `_shared.md` (§10)
- Implementation: none
- Status: missing

## Purpose
Explain, before the OS prompt, why Nitume needs the runner's location (including in the background during a job), when it is collected and when it stops; then request the permission.

## Entry / exit
- Entry: the first time the runner goes online (`v-jobs` switch) or accepts an offer without location permission; Profile has no entry (the OS settings own it afterwards).
- `Continue` → OS when-in-use prompt, then (Android 10+/iOS) the background ("Allow all the time") step only when a job starts. Back to the screen that asked.
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
- Body 2: `During a job we keep sharing it even when the app is closed, until you finish the task or go offline.`
- Body 3: `We never share your location when you're offline, and customers only see it while you're working on their task.`
- Buttons: `Continue`, `Not now`.
- Body 1 and 2 match row 123: while online without a job the app shares location every 30 seconds (nearby jobs); during a job every few seconds; offline never.

## Numeric fields (Fira Code)
None.

## Data
None (OS permission). Packages: `geolocator` + `permission_handler` (row 124).

## Accessibility and mobile
Heading announced; buttons 48 dp; Android 14 foreground-service type `location` with a persistent notification during a job (`Nitume is sharing your location for your current job.`, proposed).

## Decisions (owner, 2026-10-13)
- Row 123 (RQ-11): 30 s online, 4–8 s on a job, nothing offline (collection stops).
- Row 124 (RQ-12): packages approved.

## Questions
- None new.
