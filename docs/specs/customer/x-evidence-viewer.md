# x-evidence-viewer — Full-screen evidence viewer

- Mockup: **not drawn.** Implied by the tappable evidence thumbnails on `v-evidence-confirm` and `v-task-detail`. Built from design-system tokens and the core `EvidenceViewer`; copy is **(proposed)**.
- Shared conventions: `_shared.md`
- Implementation: none (core `EvidenceViewer` exists on `feat/core-customer-widgets`)
- Status: missing

## Purpose
View one evidence item at full size (zoomable photo or playable video), swipe between items, and see when and where it was captured.

## Entry / exit
- Entry: tap a thumbnail on `v-evidence-confirm` or `v-task-detail`; opens at that item.
- Exit: close button or system back → previous screen at the same scroll position.

## Task states
Any state with evidence (normally IN_PROGRESS onwards).

## Layout (top to bottom)
Full-screen pushed route, **blue-700 `#08192F` background** (design-system tone, as built in core `EvidenceViewer`; content on it uses white text, per the contrast rule). No tab bar. Status bar icons light.
1. Top row (padding `10 20`): close button (32px visual, 48 hit, white × glyph) left; counter `2/4` Fira Code 12.5 white right.
2. Media area (fills the rest): swipeable pages.
   - Photo: fit to width, pinch-zoom up to 4×, double-tap to toggle 2×.
   - Video: poster frame with a centred 56px white play glyph; tapping plays inline with system controls. **Playback pending row 32** (video player package): until approved, show the poster and the 12.5 white line `Video playback isn't available yet.`
3. Caption bar at the bottom (padding `14 20`, above the bottom safe area): type + time, e.g. `Photo · 10:41 AM` (time Fira Code 12, white), and when present the address line 12 slate-line `#E2E7EF`.

## Components
| Element | Component | Status |
|---|---|---|
| Viewer pages, zoom | `EvidenceViewer` (C-25) | built (no video playback) |
| Close button + counter bar | `EvidenceViewer` app bar (blue-700, white foreground) | built; counter `2/4` in the app bar's trailing slot may need a small core change |
| Counter / caption | `NumText` | built |

## Copy (proposed)
- Counter: `2/4`
- Captions: `Photo · 10:41 AM`, `Video · 10:43 AM`, `Receipt · 10:45 AM`, `Document · 10:47 AM`, `Signature · 10:50 AM` (types from `EvidenceType`)
- Load failure: centred 13 white `Couldn't load this item.` + outline button (C-03, white fill, blue text) `Try again`.
- Link expired (signed URL refused): re-fetch the evidence list once, then the failure state.

## Numeric fields (Fira Code)
- Counter `2/4`, capture time.

## Data
- Items passed from the opening screen (`GET /api/v1/errands/:errandId/evidence`). Viewable URLs pending row 25 (signed, short-lived links; A-12 partial).
- No socket events.

## Accessibility and mobile
- Each page announced as "Photo 2 of 4, captured 10:41 AM".
- Swipe and buttons both work; close reachable with one hand (top-left) and via system back.
- White on blue-700 passes AA.

## Open questions
- Pending row 32 (video package), row 25 (evidence links).

## Current vs design
Not built.
