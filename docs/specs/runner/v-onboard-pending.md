# v-onboard-pending — Verification status

- Mockup: `docs/design/nitume_runner_app.html` lines 340–352 (`#v-onboard-pending`, overlay)
- Shared conventions: `_shared.md` (§9)
- Implementation: `apps/runner_app/lib/src/screens/onboarding/onboard_pending_screen.dart` (see `SCREEN_MAP.md`)
- Status: partial (RN-L1 addendum 2026-10-21 not built; otherwise matches-design)

## Purpose
Show the status of each verification check, explain what happens next, and let the runner fix a rejected item. Also the target of Profile → `Verification documents` (the mockup row has no target; this screen is the proposed one).

## Entry / exit
- Entry: `v-onboard-selfie` submit; sign-in routing while pending; `v-jobs` verification card; Profile `Verification documents`; push `verification decided`.
- Back (C-10) → previous screen (from onboarding: the shell on `v-jobs`).
- `Back to app` (C-03 outline) → shell on `v-jobs` (mockup `jump('v-jobs', true)`).
- Row action on a rejected item → `v-onboard-id` (ID) or `v-onboard-selfie` (selfie).

## Task states
None.

## Layout (top to bottom)
1. C-10 header `Verification status` (no step counter).
2. White card C-07 (margin 0 20 12, padding 16): four R-05 rows (padding 12 0, hairline between), label 13 Sans left, C-05 **small status chip** right (mockup: coloured text; design system: amber/red only as chip accents):
   - `Phone number`, `National ID`, `Selfie / liveness check`, `M-Pesa identity match`.
   - Rejected rows add, under the label, a C-04 link `Upload again` (ID) / `Retake selfie` (selfie).
   - **`National ID` combines the two sides (row 209, owner 2026-10-19)**: front and back are two records (`side`); the newest record of each side counts. The row is `Verified` only if both sides are approved; `Not approved` if either side is rejected; otherwise `In review` if either side is pending; otherwise `Not started` (a side not uploaded yet, none pending or rejected; proposed). A legacy ID record without a `side` counts only by the row-268 rule (approved fills a missing side; superseded 2026-10-21, see the RN-L1 section below). When one side is rejected, a caption 11.5 slate-600 under the label names it: `Front photo not approved` / `Back photo not approved` / `Both photos not approved` (proposed), and `Upload again` opens `v-onboard-id` with that side selected.
3. Body 12.5 slate-600, padding 14 20 0 (copy below, changes with the overall state).
3a. Privacy paragraph (row 158), 11.5 slate-600 Fira Sans, padding 12 20 0: the owner's full sentence (Copy), then on its own line a C-04 link `Privacy Policy` (48 dp hit area) → `AppConfig.privacyLink`, opened externally; the link is hidden until `NITUME_PRIVACY_URL` holds the real published URL (no placeholder; row 173). Shown in every overall state.
4. Fixed bottom C-03 outline `Back to app` (pill; mockup `.cta-outline` radius 14).

## Status chips
| API `verification.status` | Chip (C-05) | Tone |
|---|---|---|
| `approved` | `Verified` | success |
| `pending` | `In review` | pending |
| `rejected` | `Not approved` (proposed) | danger |
| no record yet | `Not started` (proposed) | info |

Overall state:
- Any `pending`, none rejected → body copy from the mockup.
- None rejected and the ID or the selfie `Not started` (opened from Profile before finishing onboarding) → `Upload your ID and a selfie to start accepting jobs.` (proposed: the `v-jobs` copy; ruling 2026-10-19). Only `M-Pesa identity match` `Not started`, the rest approved or in review → the mockup body (proposed). (S-1 is built on `feat/runner-batch-1` @ `28290b0`: `Submit for review →` creates the pending payment-identity record, so ops can decide it and the body holds; before that fix it was misleading.)
- Load error: C-33 error with the app's generic error copy and `Try again` (proposed; builder copy, accepted 2026-10-19).
- Any `rejected` → `Some checks weren't approved. Fix them below and we'll review again.` (proposed)
- All four `approved` → body `You're verified. You can go online and accept jobs.` (proposed), CTA becomes C-01 `Start accepting jobs` → `v-jobs`.

## Components
C-10, C-07, R-05, C-05 small, C-04, C-03, C-01, C-33 (load error with `Try again`), `SkeletonCard` while loading.

## Copy
Exact, from the mockup:
- Title `Verification status`
- Rows `Phone number`, `National ID`, `Selfie / liveness check`, `M-Pesa identity match`
- Chips `Verified`, `In review`
- Body: `Verification usually takes under 24 hours. We'll notify you the moment you're approved to start accepting jobs.`
- Button: `Back to app`
- Privacy paragraph (owner wording, row 158, word for word): `Your ID and selfie are securely stored in private storage and are only accessible to authorised Nitume personnel for verification, security, and compliance purposes. Access is logged and the files are deleted according to Nitume's retention policy.` Link label `Privacy Policy` (from the sign-in legal line).

Never shown: the reviewer's internal note (row 262, decided 2026-10-21: the reject note is internal, never shown to the runner; the app never reads `reviewerNote`), the reviewer's name, the ID images.

## Numeric fields (Fira Code)
- `24` in the body copy (`under 24 hours`) as a Fira Code span.

## Data
- `GET /runners/me/verifications` (exists): rows by `verificationType` (`phone`, `government_id`, `selfie`, `payment_identity`). `phone`, `selfie` and `payment_identity`: the newest record of the type. `government_id`: the row-209 combination of the newest `front` and newest `back` record (the "newest record per type wins" rule is dropped for the ID: it could hide a rejected side). One core helper computes it (R-19, core-ui; `RunnerVerificationDocuments` on `main` already groups `idFront` / `idBack`).
- `GET /runners/me` (exists) for `verificationLevel`.
- Push / notification `verification decided` (RA-6) refreshes the screen; no socket event needed (re-fetch on resume).
- `phone`: recorded approved by the OTP sign-in (row 217, built on `feat/api-runner-1`), so the row reads `Verified`.
- `payment_identity`: the automatic check and `POST /runners/me/verifications/submit` are deferred (rows 218, 222). Until then the app creates the pending record with `POST /runners/me/verifications` at selfie submit (`v-onboard-selfie.md`), and ops approve or reject it by hand (row 126). Before that call the row reads `Not started`.

## Accessibility and mobile
Rows read as `National ID, verified`; chips are not colour-only (text label). CTA above the safe area; pull-to-refresh.

## Decisions (owner, 2026-10-13)
- Row 126 (RQ-14): verified only when every required check (phone, ID, selfie, M-Pesa name) is approved; ops do the M-Pesa name match manually.
- Row 209 (owner 2026-10-19): National ID `Verified` only if both sides approved; rejected if either is rejected; else `In review` if either is pending. Row 217: OTP sign-in records the phone check approved. Row 218: payment-identity automation deferred.

- Row 158 (owner, 2026-10-16): the full privacy statement appears here (this is the screen behind Profile → `Verification documents`); the capture screens carry the short line.

- Row 172 (owner 2026-10-16): the full wording stays here; capture screens carry the approved short line. Row 173: link hidden until the real URL is configured, no placeholder.

## Questions
- None (row 173 decided: the link appears once the URL is configured; the URL itself is still to be published).

## RN-L1 addendum (2026-10-21): sides approved via an unlabelled photo, Level drops

Applies to this screen in both entries (onboarding and Profile → `Verification documents`). Rows 263, 266, 268 answered 2026-10-21; rows 269–274 open. Core: `fix/core-runner-level2-missing` (`2c391fc`, `cd8b598`).

### Data
- Load `GET /runners/me/verifications` and `GET /runners/me` in parallel. `VerificationRows` builds its documents with `RunnerVerificationDocuments.fromRecords(records, summary: me.verification)`; the `National ID` row reads `docs.nationalIdStatus`, the caption reads `docs.idRejectedSides` (both now use `idStatusFor`, row 268).
- `GET /runners/me` fails (or an older API sends no ID checks): render from the records alone; core falls back to the same row-268 rule. `GET /runners/me/verifications` fails: the C-33 load error as today.

### How a side approved via an unlabelled photo shows
- Both sides approved (labelled, unlabelled or mixed): `National ID` chip `Verified` (success), no caption, no link. Same as any approved ID.
- One side approved via an unlabelled photo, the other labelled:
  - other side `pending` → `In review`; no caption;
  - other side `rejected` → `Not approved`, caption `Back photo not approved` (or `Front …`), `Upload again` → `v-onboard-id` with that side selected; the approved side is shown done there (no re-capture, `v-onboard-id` RN-L1);
  - other side `missing` → `Not started` and the body `Upload your ID and a selfie to start accepting jobs.` (unchanged copy).
- Never a thumbnail (this screen shows no ID image at all). No new copy.

### Level 1 after a drop (row 263 (a), row 266): what the runner sees here
A verified Level-2 runner becomes not verified **and** Level 1 in the same moment a Level-2 check stops being approved. Existing copy only:
| Cause | National ID / Selfie row | Body | CTA |
|---|---|---|---|
| Ops reject the ID side or selfie (push `verification decided`, RA-6, or next open / resume) | `Not approved` (+ side caption for the ID) + `Upload again` / `Retake selfie` | `Some checks weren't approved. Fix them below and we'll review again.` | `Back to app` (C-03) |
| The runner re-uploads (new `pending` record) | `In review` | mockup body (`Verification usually takes under 24 hours. …`) | `Back to app` |
| Row-265 re-check at deploy (no action of the runner) | whatever the API says (such runners are not verified already) | unchanged | unchanged |
No level label, no downgrade notice and no reason are shown (the level is on `v-profile` only when verified). Withdrawn offers: `v-jobs` (row 266). Whether the runner is also set offline is row 273 (open): no copy until it is answered.

### Current vs design (2026-10-21, `onboard_pending_screen.dart`)
1. (blocker) `VerificationRows(records)` calls `fromRecords(records)` without the summary and the screen loads only `verifications()`. It already gets the row-268 rule through the core fallback once the branch is merged, but the API summary is the source of truth. Fix: also load `account.me()` and pass `summary: me.verification` (constructor parameter on `VerificationRows`); keep rendering when `me()` fails.
