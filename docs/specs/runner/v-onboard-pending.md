# v-onboard-pending — Verification status

- Mockup: `docs/design/nitume_runner_app.html` lines 340–352 (`#v-onboard-pending`, overlay)
- Shared conventions: `_shared.md` (§9)
- Implementation: none
- Status: missing

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
3. Body 12.5 slate-600, padding 14 20 0 (copy below, changes with the overall state).
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

Never shown: the reviewer's internal note (unless RA-7 adds a runner-safe reason), the reviewer's name, the ID images.

## Numeric fields (Fira Code)
- `24` in the body copy (`under 24 hours`) as a Fira Code span.

## Data
- `GET /runners/me/verifications` (exists): rows by `verificationType` (`phone`, `government_id`, `selfie`, `payment_identity`), newest record per type wins.
- `GET /runners/me` (exists) for `verificationLevel`.
- Push / notification `verification decided` (RA-6) refreshes the screen; no socket event needed (re-fetch on resume).
- RA-8: records for `phone` and `payment_identity` are not created by the API today, so those rows would always show `Not started`.

## Accessibility and mobile
Rows read as `National ID, verified`; chips are not colour-only (text label). CTA above the safe area; pull-to-refresh.

## Questions
- RQ-14: what "verified" requires (default: all four approved), and who performs the M-Pesa identity match (default: ops, manually).
