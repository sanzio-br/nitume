# v-onboard-selfie — Selfie check (step 2 of 2)

- Mockup: `docs/design/nitume_runner_app.html` lines 328–338 (`#v-onboard-selfie`, overlay)
- Shared conventions: `_shared.md` (§9)
- Implementation: none
- Status: missing

## Purpose
Take a selfie so ops can confirm the runner matches their ID, then submit the application for review.

## Entry / exit
- Entry: `v-onboard-id` `Continue →`; `v-onboard-pending` `Retake selfie` when rejected.
- Back (C-10) → `v-onboard-id`.
- `Submit for review →` (enabled once the selfie is uploaded) → `v-onboard-pending` (replace the onboarding stack so back does not return to capture).

## Task states
None.

## Layout (top to bottom)
1. C-10 header: `Selfie check`, step `Step 2 of 2`.
2. Intro 13 slate-600, padding 0 20, margin-bottom 14.
3. R-13 drop zone, height 260: outline person-in-frame icon, caption. Tap → **front camera only** (no gallery for the selfie, proposed; manual comparison by ops, row 126). After capture the zone shows the photo (r 16, cover) with `Retake` (C-03 small) and the upload state.
4. Fixed bottom C-01 `Submit for review →`.

## Components
C-10, R-13, R-15 (upload state badge), C-01, C-03 small.

## Copy
Exact, from the mockup:
- Title `Selfie check`; step `Step 2 of 2`
- Intro: `We use this to confirm you match your ID — this is never shown to customers.`
- Drop zone: `Center your face in the frame`
- Button: `Submit for review →`

Proposed: `Retake`; upload error `Not uploaded` + `Retry`; submit error C-40 `We couldn't submit your application. Try again.`; hint 11.5 slate-600 `Face the light, remove sunglasses or a hat.`

## Numeric fields (Fira Code)
- `Step 2 of 2`.

## Data
- Selfie upload to restricted storage (RA-7, row 125), then `POST /runners/me/verifications` `{ verificationType: 'selfie', documentKeys: [key] }`.
- Submit for review: proposed `POST /runners/me/verifications/submit` (RA-8) creates/ensures `phone` (approved from the OTP sign-in) and `payment_identity` (`pending`, for the ops M-Pesa name match) and notifies ops. Today none of this exists: phone and payment-identity records are never created automatically.
- No socket events.

## Accessibility and mobile
- Front camera opens with a face guide overlay; the shutter button has a label `Take selfie`.
- The selfie is never stored in the device gallery.
- Screen-reader users get the instruction read before the camera opens.

## Decisions (owner, 2026-10-13)
- Row 125 (RQ-13): restricted private storage, separate folder/bucket, no public URLs, signed admin-only URLs, access logged.
- Row 144 (RQ-25, owner 2026-10-16): images are kept only as long as needed for verification, fraud prevention, audit and legal/compliance, then securely deleted; never indefinitely. The retention period is a configurable setting (final legal period not set yet); access stays restricted and logged for the whole period. Screen impact: no copy may say the photos are kept permanently; the device copy is deleted after upload (unchanged). API impact: RA-7 (retention setting, secure deletion job, access log).
- Row 126 (RQ-14): manual review of ID, selfie, M-Pesa name and every other required check; verified only when all are approved. No automated liveness vendor.
- Row 124 (RQ-12): camera packages approved.

## Questions
- None open. RQ-25 (row 144) decided 2026-10-16, see Decisions.
