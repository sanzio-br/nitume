# v-onboard-id — ID verification (step 1 of 2)

- Mockup: `docs/design/nitume_runner_app.html` lines 315–326 (`#v-onboard-id`, overlay)
- Shared conventions: `_shared.md` (§9 verification gate)
- Implementation: none
- Status: missing

## Purpose
Capture clear photos of the front and back of the runner's Kenyan National ID and submit them for manual review.

## Entry / exit
- Entry: first sign-in routing (`v-auth-otp` / `x-name-capture`) when no ID has been submitted; `v-onboard-pending` `Upload again` when the ID was rejected.
- Back (C-10) → previous screen; in the first-run flow back returns to the sign-in only via `Log out` (proposed: the back arrow on the first onboarding screen asks C-35 `Leave verification?` / `You can finish it later from your profile.` / `Leave` · `Stay`, then goes to the shell on `v-jobs` with the verification card).
- `Continue →` (enabled when both sides are uploaded) → `v-onboard-selfie`.

## Task states
None.

## Layout (top to bottom)
1. C-10 pushed header: title `ID verification`, trailing step counter `Step 1 of 2` (Fira Code 11 slate-600).
2. Intro 13 slate-600, padding 0 20, margin-bottom 14.
3. Thumbnail row R-15 (padding 0 20 16, gap 10, two tiles, aspect 1.4, r 12): `Front`, `Back`. Empty tile = blue-050 → slate-line gradient replaced by a flat blue-050 tile with an outline ID-card icon (mockup emoji `🪪`) and the side label 11/600 slate-600. Captured tile = the photo with its upload state (uploading spinner, uploaded check, `Not uploaded` + `Retry`) and a retake button.
4. Drop zone R-13 (margin 0 20 16, height 220, dashed): outline image icon 36 blue, caption 12.5 slate-600. Tap → camera for the next missing side (front first, then back); a bottom sheet offers `Take photo` / `Choose from gallery` (proposed).
5. Fixed bottom CTA C-01 `Continue →`, pill (mockup radius 14), above the bottom safe area.

## Components
| Element | Component | Status |
|---|---|---|
| Header + step counter | C-10 | exists |
| Thumbnails with upload state | R-15 | NEW |
| Drop zone | R-13 | NEW |
| Continue | C-01 | exists |
| Leave dialog | C-35 | exists |

## Copy
Exact, from the mockup:
- Title: `ID verification`; step `Step 1 of 2`
- Intro: `Upload clear photos of the front and back of your National ID.`
- Drop zone: `Tap to take a photo or upload`
- Button: `Continue →`

Proposed:
- Tile labels `Front`, `Back`; after capture `Retake`.
- Upload error (tile): `Not uploaded` + `Retry`; screen notice C-40 `Check your connection and try again.`
- Rejected (from pending): C-40 notice above the tiles with the reviewer's reason only if the API returns a runner-safe reason (RA-7; default: generic `Your ID photos couldn't be verified. Upload clear photos of both sides.`).
- Image quality hint under the drop zone, 11.5 slate-600: `Make sure all four corners are visible and the text is sharp.`

## Numeric fields (Fira Code)
- `Step 1 of 2`.

## Data
- Upload each side to **restricted ID storage** (system design §10: separate from general evidence, access logged, never shown to customers or other runners). **Missing** (RA-7): no upload endpoint for verification documents; `POST /runners/me/verifications` takes only `{ verificationType, documentS3Key }` (one key), so front + back need two keys or two records. Proposed: `POST /runners/me/verifications/government_id/documents` (multipart or base64, `side: front|back`) → `{ documentKey }`, then `POST /runners/me/verifications` `{ verificationType: 'government_id', documentKeys: [front, back] }`. Storage: row 125 (restricted, private, signed admin-only URLs, access logged).
- Re-submission after rejection creates a new `pending` record (the old one stays for audit, within the row-144 retention period, then it is securely deleted like any other ID image).
- `GET /runners/me/verifications` (exists) to show existing uploads.
- No socket events.
- Camera package: `image_picker` (row 124).

## Accessibility and mobile
- Each tile has a label (`ID front, uploaded`); the drop zone is a button `Take a photo of your ID front`.
- Gallery path available for screen-reader users.
- Keep the CTA above the bottom safe area; body scrolls on small screens.
- Photos are not kept in the device gallery (capture to app storage, delete after upload).

## Decisions (owner, 2026-10-13)
- Row 125 (RQ-13): restricted private storage, separate folder/bucket, no public URLs, signed admin-only URLs, access logged.
- Row 144 (RQ-25, owner 2026-10-16): images are kept only as long as needed for verification, fraud prevention, audit and legal/compliance, then securely deleted; never indefinitely. The retention period is a configurable setting (final legal period not set yet); access stays restricted and logged for the whole period. Screen impact: no copy may say the photos are kept permanently; the device copy is deleted after upload (unchanged). API impact: RA-7 (retention setting, secure deletion job, access log).
- Row 126 (RQ-14): manual review of ID, selfie, M-Pesa name and every other required check; verified only when all are approved. No automated liveness vendor.
- Row 124 (RQ-12): camera packages approved.

## Questions
- None open. RQ-25 (row 144) decided 2026-10-16, see Decisions.
