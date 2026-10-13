# v-evidence-capture — Capture evidence

- Mockup: `docs/design/nitume_runner_app.html` lines 375–386 (`#v-evidence-capture`, overlay)
- Shared conventions: `_shared.md` (§10 offline, R-13, R-15, R-22)
- Implementation: none
- Status: missing

## Purpose
Take photos (and receipt photos) for the job. Each photo uploads immediately, timestamped and geo-tagged, so it builds the task's evidence timeline (system design §7.2).

## Entry / exit
- Entry: `v-active` checklist `Upload` / row tap, with a preset type: `photo` (Photos row) or `receipt` (Receipt row).
- Back (C-10): if any capture is still uploading, C-35 `Leave while uploading?` / `Uploads continue in the background and retry when you're online.` / `Leave` · `Stay` (proposed). Captured items are never discarded silently.
- `Save to task` → back to `v-active` (mockup `pop()`); enabled when every capture is uploaded or queued.

## Task states
ARRIVED and IN_PROGRESS (photos and receipts); receipts also in AWAITING_CUSTOMER (proposed) and, per RQ-17, within the window after CANCELLED/FAILED. Other states: the entry is hidden.

## Layout (top to bottom)
1. C-10 header `Capture evidence` (`Upload receipt` when the preset type is receipt, proposed).
2. Type toggle (only when the job has a receipt step): C-16 choice chips `Photo` / `Receipt` (padding 0 20 12), preset from the entry.
3. R-13 drop zone (margin 0 20 16, height 240): outline camera icon 36 blue, caption. Tap → camera (photo). Gallery: **not** offered for photos (evidence must be captured on the spot, §7.2 "evidence timestamps stay trustworthy", proposed); offered for receipts? No: same rule (proposed). Accessibility exception in §11 of `_shared.md` is limited to onboarding.
4. Thumbnails R-15 (padding 0 20 16, gap 10, square tiles, wrap into rows of 3): this session's captures with upload state, then already-uploaded evidence of the same type (read-only, C-25 tiles). Tap → `EvidenceViewer`.
5. Info 11.5 slate-600, padding 0 20.
6. Fixed bottom C-01 `Save to task`.

## Components
C-10, C-16, R-13, R-15, C-25, C-35, C-01, C-40 (offline notice). R-22 `EvidenceUploader` and R-21 queue behind them.

## Copy
Exact, from the mockup:
- Title `Capture evidence`
- Drop zone `Tap to take a photo or video` → **changed** to `Tap to take a photo` (video deferred, row 32 / RQ-9)
- Info: `Photos upload immediately and are timestamped & geo-tagged automatically — this is what builds the task's evidence timeline.`
- Button `Save to task`

Proposed: `Photo`, `Receipt`, `Upload receipt`; receipt hint `Make sure the total and the shop name are readable.`; tile states `Uploading…`, `Not uploaded` + `Retry`; offline `Saved on your phone. We'll upload it when you're back online.`; location off: C-40 `Location is off. Photos will upload without a location.` (upload is still allowed; RQ-11 decides whether location is mandatory); camera permission denied: C-33 `Camera access is off` / `Allow camera access in Settings to take photos.` + C-03 `Open Settings`.

## Numeric fields (Fira Code)
- Capture time on each tile caption (`10:31 AM`, EAT), counts (`3 photos`).

## Data
- `POST /errands/:errandId/evidence` `{ type: 'photo' | 'receipt', data (base64), contentType, capturedAt, lat, lon }` (exists). **Shape problem** (RA-11): the API takes the whole image as base64 JSON with no body-size configuration (Nest's default JSON limit is 100 kB), so a normal photo is refused; needs a raised limit for this route or multipart/signed-URL upload (system design §3.2 names `POST /evidence/:errandId/upload-url` + `/confirm`). No state guard exists either: any current-runner upload is accepted in any state (RA-11).
- `GET /errands/:errandId/evidence` (exists) for already uploaded items.
- Socket: `evidence:uploaded` (exists) refreshes the customer side; the runner refreshes its own list from the POST response.
- Compression: R-22 (long edge 1600 px, JPEG quality 80, proposed).
- No delete endpoint and none proposed: evidence is part of the audit trail (system design §10); a wrong photo is explained in the notes (proposed).

## Accessibility and mobile
- Shutter labelled `Take photo`; tiles read `Photo 2 of 3, uploaded, 10:31 AM`.
- Uploads continue in the background (foreground service while the job is live).
- Bottom CTA above the safe area.

## Questions
- RQ-9: video evidence for runners (default: none in MVP).
- RQ-18 (payments, row 105): should the runner type the receipt total? Default: no; ops read the photo.
- RQ-12: camera package approval.
