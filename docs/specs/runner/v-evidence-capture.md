# v-evidence-capture — Capture evidence

- Mockup: `docs/design/nitume_runner_app.html` lines 375–386 (`#v-evidence-capture`, overlay)
- Shared conventions: `_shared.md` (§10 offline, R-13, R-15, R-21, R-22)
- Implementation: none. On `main`: core R-22 `EvidenceUploader`, R-21 `OfflineActionQueue`, `EvidenceFileStore`, R-13 `CaptureDropZone`, R-15 `CaptureThumbnail` and `nitume_runner_device` `ImagePickerCaptureSource` are built; no screen exists.
- Status: matches-design (round 18 audit 2026-10-20 PASS; SCREEN_MAP is authoritative)
- Refreshed 2026-10-19 (design-auditor, `docs/runner-v-active-spec`): B-1 capture discard rules, job-scoped uploads, rows 129, 197, 211. Everything not drawn in the mockup is marked **(proposed)**.

## Purpose
Take photos (and receipt photos) for the job. Each photo uploads immediately, with its time and place, so it builds the task's evidence timeline (system design §7.2). No copy of a photo stays on the phone once it is uploaded or given up.

## Entry / exit
- Entry: `v-active` checklist `Upload` (or a row tap), with a preset type: `photo` (Photos row) or `receipt` (Receipt row, or the ended-job `Upload receipt`).
- The screen belongs to the job shown on `v-active` (row 211: several active-set jobs may exist). Its uploads always go to that job's `errandId`.
- Back (C-10):
  - Uploads running or queued: leave at once. They carry on in the background (job-scoped uploader, below), and `v-active` shows their state.
  - Captures that **failed** (refused, not retryable later): C-35 `Leave without {n} photos?` / `{n} photos didn't upload. They'll be deleted from your phone.` / `Leave` (destructive) · `Stay` (proposed). `Leave` deletes them (B-1 rule 4).
  - Nothing captured, or all uploaded: leave at once.
- `Save to task` → back to `v-active` (mockup `pop()`). Enabled when every capture is uploaded or queued (`EvidenceUploader.allSettled`).

## Task states
- Photos: ARRIVED and IN_PROGRESS.
- Receipts: ARRIVED, IN_PROGRESS, AWAITING_CUSTOMER (proposed), DISPUTED (owner row 254, 2026-10-20: receipts only, photos refused), and for 24 hours after CANCELLED / FAILED (row 129). Receipt type only, entered from the ended-job card or (DISPUTED) the Receipt step on `v-active`. One rule in core: `RunnerEvidenceRules`.
- Never for a task the runner did not accept (row 197). Other states: the entry is hidden; a stale open shows C-40 `You can't add photos to this job any more.` (proposed) and no drop zone.

## Layout (top to bottom)
1. C-10 header `Capture evidence` (`Upload receipt` when the preset type is receipt, proposed).
2. Type toggle, only when the job has a receipt step and the state allows both: C-16 choice chips `Photo` / `Receipt` (padding 0 20 12), preset from the entry.
3. R-13 `CaptureDropZone` (margin 0 20 16, height 240):
   - outline camera icon 36 blue, caption 12.5 slate-600;
   - tap → camera (`CaptureFrom.camera`);
   - **no gallery** for photos or receipts: evidence must be taken on the spot, so its time and place stay trustworthy (§7.2; proposed, as before). The gallery exception in `_shared.md` §11 is for onboarding only.
4. R-15 thumbnails (padding 0 20 16, gap 10, square tiles, rows of 3):
   - first this session's captures, with their upload state (`EvidenceUploadItem.captureState`);
   - then the evidence of the same type already uploaded (read-only, C-25 tiles, signed URLs);
   - tap → `EvidenceViewer`;
   - a failed tile has `Retry` (when `canRetry`) and a remove icon (`Remove`, 48 dp) → `EvidenceUploader.remove`.
5. Info line 11.5 slate-600, padding 0 20.
6. Receipt hint (receipt type only, proposed): `Make sure the total and the shop name are readable.`
7. Fixed bottom `NitumeFixedCta` with C-01 `Save to task`.

## Photo storage on the phone (B-1 rules, proposed; extends reviewer B-1 from onboarding to evidence)
Evidence photos show customers' homes, goods and documents, with a location. They follow the same rule as ID images: **no copy outlives its purpose**.
1. **Capture**: camera only, compressed by the plugin (long edge 1600 px, JPEG 80; the plugin deletes its full-size file). Nothing is saved to the phone's photo library or shared storage.
2. **Keep**: the capture is copied into app-private storage (`EvidenceFileStore.keep`, `path_provider` application-support directory, row 149). Then the picker's own file is deleted at once (`CapturedImage.discard`).
   - Today `EvidenceUploader.captureAndUpload` never calls `discard`, so the scaled camera file stays in the app cache: core-ui need **C-V1**.
   - When `keep` fails, the picker file is the only copy. It is used and released like a kept copy.
3. **Uploaded**: the kept copy is deleted (built).
4. **Failed and removed, or left behind with `Leave`**: the kept copy is deleted (built for `remove`; `Leave` must call `remove` for each failed item).
5. **Queued (offline)**: the kept copy stays until the queue settles the action: uploaded, refused, superseded, or cleared at log out (`RunnerQueuedActions.cleanupFor`, built).
   - A refused or missing file is reported on `v-active`: `This photo is no longer on your phone. Take it again.` (core proposed copy), or C-40 (danger) `A photo couldn't be added to the job. Take it again.` (proposed).
6. **Lost captures** (Android killed the app while the camera was open): deleted at the next start (`discardLostCaptures`, built), not restored. The runner never saw that photo as captured, so no notice is shown (proposed).
7. **Log out**: the queue is cleared and every kept photo deleted. `v-profile` log-out confirm adds, only when evidence is queued: `Photos waiting to upload will be deleted.` (proposed; `v-profile` owner of that dialog).
8. **Job ends while photos are queued** (CANCELLED, or access revoked): the replay is refused (403/409). The action is dropped and its file deleted. A receipt within the 24 h window is accepted, so it stays queued.

## Uploads outlive the screen (proposed; core-ui need C-V2)
- Leaving the screen must not stop or orphan an upload in flight. Today `EvidenceUploader.dispose` disposes items that may still be uploading, and a screen-scoped uploader would lose them.
- Needed: one uploader per held job, owned at app scope (or a hand-off of in-flight items to the queue), which `v-active` reads for tile states. It is released when the job leaves the active set and its 24 h receipt window.

## Components
| Element | Component (core class) | Status |
|---|---|---|
| Header | C-10 `NitumePushedHeader` | exists |
| Type toggle | C-16 `NitumeChoiceChip` | exists |
| Drop zone | R-13 `CaptureDropZone` | exists |
| Thumbnails | R-15 `CaptureThumbnail` / `CaptureThumbnailRow`, C-25 `EvidenceTile` / `EvidenceViewer` | exists |
| Dialog | C-35 `showNitumeConfirmDialog` | exists |
| CTA | `NitumeFixedCta` + C-01 | exists |
| Notices | C-40 `NitumeNotice` (default, danger) | exists |
| Capture + upload | R-22 `EvidenceUploader`, `EvidenceFileStore`, R-21 queue | exists; **change** C-V1 (discard picker file), C-V2 (job scope) |
| Camera permission | `DevicePermissions` (`camera`, `requestCamera`, `openSettings`) | exists |

## Copy
Exact, from the mockup:
- Title `Capture evidence`
- Drop zone `Tap to take a photo or video` → **changed** to `Tap to take a photo` (video deferred, row 32 / row 121)
- Info: `Photos upload immediately and are timestamped & geo-tagged automatically — this is what builds the task's evidence timeline.`
- Button `Save to task`

Proposed:
- `Photo`, `Receipt`, `Upload receipt`, and the receipt hint above;
- tile states `Uploading…`, `Not uploaded` + `Retry`, `Remove`;
- offline: `Saved on your phone. We'll upload it when you're back online.`;
- location off: C-40 `Location is off. Photos will upload without a location.` Upload is still allowed (the uploader never blocks on location; no owner rule makes location mandatory);
- camera permission denied: C-33 `Camera access is off` / `Allow camera access in Settings to take photos.` + C-03 `Open Settings`;
- upload too large (413 `evidence_too_large`, owner row 252: 10 MB per image, server config), approved 2026-10-20 round 18 (auditor's call, proposed):
  - C-40 (danger) `This photo is larger than 10 MB. Take it again.`; the size (`10 MB`, from the error's `maxBytes`, else the 10 MB default) in Fira Code;
  - the action on the notice: C-03 small outline `Take photo` (opens the camera, as the drop zone); hidden when capture is not allowed;
  - no `Retry` and no tile: the same file never fits; its kept copy is deleted (B-1);
  - a too-large photo dropped from the offline queue shows the same copy on `v-active` (the drop carries no limit yet, so the default is shown);
  - replaces `This photo couldn't be uploaded. Try again later.` (written while the API had no limit);
- the leave dialog and the B-1 notices above.

## Numeric fields (Fira Code)
- Capture time on each tile caption (`10:31 AM`, EAT, `formatClockEat`); counts (`3 photos`, `{n}` in the leave dialog).

## Data
For api-contract: what the screen needs. Item numbers match `docs/audits/runner-gap-report.md` §21.
- `POST /errands/:errandId/evidence` `{ type: 'photo' | 'receipt', data (base64), contentType, capturedAt, lat?, lon? }` (exists).
  - **A5 size** (RA-11; resolved by row 252, 10 MB on the evidence route, 413 `evidence_too_large` with `maxBytes`). Earlier text: the API's global JSON limit is still the Nest default (≈100 kB; `main.ts` sets none), so a normal 1600 px photo (≈200–500 kB, more as base64) is refused with 413. Needed: a body limit this route accepts for photos up to a stated maximum, or the §3.2 signed upload (`POST /evidence/:errandId/upload-url` + `/confirm`). The app needs to know the maximum to check before upload.
  - **A5 state guard** (RA-11): photos only in ARRIVED / IN_PROGRESS; receipts in ARRIVED … AWAITING_CUSTOMER and for 24 h after CANCELLED / FAILED (row 129, A10 / RA-12); refused otherwise with a code. Today any current-runner upload is accepted in any state.
  - **A6 idempotency** (RA-17): a replayed upload with the same key must not create a second evidence row.
- `GET /errands/:errandId/evidence` (exists) for already uploaded items.
- Socket: `evidence:uploaded` (exists) refreshes the customer side; the runner updates its list from the POST response.
- No delete endpoint, and none proposed: evidence is part of the audit trail (system design §10). A wrong photo is explained in the notes (proposed).
- Location kept with evidence: the evidence row stores `lat`/`lon` as part of the task record. That is not the location-history question RQ-35 (BOARD row 247, open).

## Accessibility and mobile
- Drop zone labelled `Take photo`; tiles read `Photo 2 of 3, uploaded, 10:31 AM`; `Remove` and `Retry` are 48 dp.
- Uploads continue while the app is in the background during the job (foreground service), and after leaving the screen (C-V2).
- Bottom CTA above the safe area.

## Decisions (owner)
- Row 121 (RQ-9): photos only, no video. Row 124 (RQ-12): `image_picker`, `permission_handler` approved. Row 149: `path_provider` for offline photos in app-owned storage.
- Row 129 (RQ-17): receipt uploads up to 24 h after CANCELLED/FAILED. Row 130 (RQ-18): no receipt-total field; ops read the image.
- Row 197: no receipt upload on a task the runner never accepted.

## Questions
- None new for the owner. The B-1 rules above apply the reviewer's B-1 principle (no copy left on the device) to evidence; they are implementation rules, not a retention policy for stored evidence.
