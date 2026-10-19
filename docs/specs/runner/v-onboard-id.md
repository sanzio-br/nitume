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
3. Thumbnail row R-15 (padding 0 20 16, gap 10, two tiles, aspect 1.4, r 12): `Front`, `Back`, in that order (rows 195, 200: the side is required on every ID image; the tiles are the side labels, no separate picker). Empty tile = blue-050 → slate-line gradient replaced by a flat blue-050 tile with an outline ID-card icon (mockup emoji `🪪`) and the side label 11/600 slate-600. The side the drop zone will capture next has a 2 px blue outline (`selected`); tapping an empty tile selects that side (**proposed, EXTENDS MOCKUP**: the mockup draws two plain thumbnails with no selection, no side label on a captured photo and no per-tile `Retake`; the outline, tap-to-select, the label chip and `Retake` below are design-auditor additions for rows 195, 200). Captured tile = the photo with its upload state (uploading spinner, uploaded check, `Not uploaded` + `Retry`) and a `Retake` button that re-captures **that** side. The side label stays visible on a captured tile (bottom-left, 11/600 white on a solid blue `#0B2545` chip, the `blue` token; amended 2026-10-19 from a blue-900 scrim, design-system blue fill with white text) so the runner can check front and back are not swapped.
4. Drop zone R-13 (margin 0 20 16, height 220, dashed): outline image icon 36 blue, caption 12.5 slate-600, with the selected side named above the caption 13/600 blue: `Front of your ID`, then `Back of your ID` (proposed). Tap → camera for the selected side (front first, then back: after the front uploads the back is selected automatically); a bottom sheet offers `Take photo` / `Choose from gallery` (proposed). Both sides uploaded: the drop zone is hidden and the tiles' `Retake` buttons are the only capture controls.
   Each upload sends the selected side as `side: 'front' | 'back'` (lowercase on the wire, row 200). The app never infers the side from order.
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
- Tile labels `Front`, `Back` (rows 195, 200: the UI shows `Front` / `Back`, the wire `front` / `back`); after capture `Retake`; drop-zone side line `Front of your ID` / `Back of your ID`.
- Side refused (400 `verification_document_side_invalid`; should not happen, the app always sends one): tile `Not uploaded` + `Retry`, notice C-40 `Something went wrong with this photo. Try again.`
- Upload error (tile): `Not uploaded` + `Retry`; screen notice C-40 `Check your connection and try again.`
- Rejected (from pending): C-40 notice above the tiles with the reviewer's reason only if the API returns a runner-safe reason (RA-7; default: generic `Your ID photos couldn't be verified. Upload clear photos of both sides.`). Each side has its own decision (row 209): a rejected side's tile shows the C-05 small danger chip `Not approved` and its `Retake`, and is selected first; an approved or pending side keeps its photo state. When only one side was rejected the notice reads `Your {front|back} photo couldn't be verified. Upload a clearer photo of that side.` (proposed). `Continue →` is enabled once the rejected side is uploaded again.
- Image quality hint under the drop zone, 11.5 slate-600: `Make sure all four corners are visible and the text is sharp.`
- Privacy line (row 158 shortened; **approved, row 172**), 11.5 slate-600 Fira Sans, under the hint: `Your ID and selfie are stored privately and only authorised Nitume personnel can see them.` followed on the same line by a C-04 link `Privacy Policy` (12.5/600 blue, 48 dp hit area) → `AppConfig.privacyLink` opened externally (`url_launcher`, as `x-legal`). `NITUME_PRIVACY_URL` empty → the link is hidden, the sentence stays; no placeholder or fallback; the link appears once the real URL is configured (row 173). The full owner sentence is on `v-onboard-pending` (`_shared.md` §9). Never `forever`, `permanently` or a fixed number of months (retention is configuration). Replaces the round-8 proposal `Only our verification team can see these photos. We keep them only as long as needed, then delete them.`
- **File too large (row 163)**: the app checks each image before upload; above 10 MB (10 × 1024 × 1024 bytes, the API limit) nothing is sent. The tile stays empty (nothing is kept) and shows the R-15 `Too large` issue with `Retake` (ruling 2026-10-19), and a C-40 notice (danger accent) above the tiles: `This photo is larger than 10 MB. Take it again or choose a smaller photo.` (proposed; `10 MB` as a Fira Code span). The same copy answers an API 413 (the limit is enforced there too). The app may downscale camera captures so ID text stays sharp and the file fits (builder's choice; never below the legibility needed for review).

## Numeric fields (Fira Code)
- `Step 1 of 2`; `10 MB` in the size notice.

## Data
- Upload each side to **restricted ID storage** (system design §10: separate from general evidence, access logged, never shown to customers or other runners). **Built on `main`** (RA-7): `POST /runners/me/verifications/documents`, multipart `file` (JPEG, PNG, WebP, HEIC/HEIF) + `verificationType: 'government_id'`; each upload creates one `pending` verification (front and back are two records; the storage key is never returned: the response is the verification view with `hasDocument`, `purgedAt`). Errors: 400 `verification_type_not_uploadable`, `verification_document_type_invalid` (→ `Use a JPEG, PNG or HEIC photo.`, proposed), `verification_document_empty`; 413 above 10 MB (no code today; api-contract to add `verification_document_too_large` with `maxBytes`). Multipart field `side` (`front | back`, lowercase; the API accepts any case and stores lowercase) is **required** for `government_id` and refused for a selfie (rows 195, 200, decided; built on `main`, 400 `verification_document_side_invalid` with `allowed`). 413 now carries `verification_document_too_large` with `maxBytes` (built on `main`). The verification view returns `side`, so the screen rebuilds its tiles from `GET /runners/me/verifications`: for each side, the newest `government_id` record with that `side`; records with `side = null` (legacy) fill no tile. Storage: rows 125, 154, 162 (restricted, private, separate restricted credential, signed admin-only URLs, access logged).
- Re-submission after rejection creates a new `pending` record (the old one stays for audit, within the retention period, then it is purged like any other ID image). A new or replacement ID restarts the retention clock (row 161).
- Storage and retention (rows 154, 161, 162): private objects on the existing object-storage provider under a separate restricted credential (no public URLs; access only through short-lived signed URLs from a logged, admin-authorised endpoint); retention config-driven, initially 12 months, restarted only by a new/replacement ID or selfie, a verification or re-verification started, or an admin review that needs the evidence (never by a view); a daily purge deletes the images and keeps only minimum audit metadata; uploads, views and purges are logged (RA-7). No runner screen reads the retention setting.
- `GET /runners/me/verifications` (exists) to show existing uploads.
- No socket events.
- Camera package: `image_picker` (row 124).

## Accessibility and mobile
- Each tile has a label (`ID front, uploaded`, `ID back, not added`) and announces `selected`; the drop zone is a button named for the selected side (`Take a photo of your ID front` / `… back`).
- Gallery path available for screen-reader users.
- Keep the CTA above the bottom safe area; body scrolls on small screens.
- Captured photos (corrected 2026-10-19, B-1): the picked or shot image is read into memory, then the capture file and any scratch copy the picker made are deleted (`CapturedImage.discard`), and captures orphaned when Android killed the app mid-pick are deleted at the next start (`discardLostCaptures`); copies outside the app, such as the runner's own gallery photo or a system camera app's copy, are not the app's to delete. The app never saves to the gallery.

## Decisions (owner, 2026-10-13)
- Row 125 (RQ-13): restricted private storage, separate folder/bucket, no public URLs, signed admin-only URLs, access logged.
- Row 144 (RQ-25, owner 2026-10-16): images are kept only as long as needed for verification, fraud prevention, audit and legal/compliance, then securely deleted; never indefinitely. The retention period is a configurable setting (initially 12 months after the last relevant verification/activity event, row 154); access stays restricted and logged for the whole period. Screen impact: no copy may say the photos are kept permanently; the device copy is deleted after upload (unchanged). API impact: RA-7 (retention setting, secure deletion job, access log).
- Row 154 (owner 2026-10-16): design approved; existing object-storage provider with private objects + signed URLs; initial retention 12 months after the last relevant verification/activity event, config-driven; daily purge of objects and unnecessary metadata; access signed, admin-authorised and logged. Copy choice: the privacy line above states no period (flagged in the HANDOFF).
- Row 126 (RQ-14): manual review of ID, selfie, M-Pesa name and every other required check; verified only when all are approved. No automated liveness vendor.
- Row 124 (RQ-12): camera packages approved.

- Row 158 (owner 2026-10-16): privacy statement wording (full text in `_shared.md` §9); concise in the UI with a link to the full Privacy Policy. Row 161: retention clock events. Row 162: isolated storage, restricted credential. Row 163: 10 MB per image, checked in the app too.

- Row 209 (owner 2026-10-19): the National ID is verified only when both sides are approved, rejected if either side is rejected; this screen shows the decision per side.
- Rows 195, 200 (owner 2026-10-16): the ID image side is required; `front` / `back` lowercase on the wire and in the DB; the UI shows `Front` / `Back`. Specced as the two labelled tiles plus the drop-zone side line (front, then back); no separate side picker.

- Row 172 (owner 2026-10-16): the short privacy line + `Privacy Policy` link approved for the capture screens. Row 173: the link stays hidden until `NITUME_PRIVACY_URL` holds the real published URL; no placeholder.

## Questions
- None (rows 172, 173 decided 2026-10-16).
