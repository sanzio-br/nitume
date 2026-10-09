# x-evidence-viewer — Full-screen evidence viewer

- Mockup: **not drawn.** Implied by the tappable evidence thumbnails on `v-evidence-confirm` and `v-task-detail`. Built from design-system tokens and the core `EvidenceViewer`; copy is **(proposed)**.
- Shared conventions: `_shared.md`
- Implementation: `apps/customer_app/lib/src/widgets/evidence.dart` (`openEvidenceViewer`) on core `EvidenceViewer` on branch `feat/customer-screens`
- Status: matches-design

## Purpose
View one evidence item at full size (zoomable photo), swipe between items, and see when and where it was captured. Video evidence is deferred from MVP (row 32): no playback.

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
   - Video (deferred, row 32; no video-player dependency): if a video item appears, show its poster frame when one exists (else the blue-700 page) with a centred 56px white video glyph that is **not** tappable, and the 12.5 white line `Video playback isn't available yet.` (built copy; it states the owner's "not supported yet" decision). No play control.
3. Caption bar at the bottom (padding `14 20`, above the bottom safe area): type + time, e.g. `Photo · 10:41 AM` (time Fira Code 12, white), and when present the address line 12 slate-line `#E2E7EF`.

## Components
| Element | Component | Status |
|---|---|---|
| Viewer pages, zoom | `EvidenceViewer` (C-25) | built (photos; video tile only, row 32) |
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
- Items passed from the opening screen (`GET /api/v1/errands/:errandId/evidence`). Viewable URLs are authenticated, short-lived signed links (~15 min, row 25); on a refused link re-fetch the list once (`onLoadError` hook), then the failure state.
- No socket events.

## Accessibility and mobile
- Each page announced as "Photo 2 of 4, captured 10:41 AM".
- Swipe and buttons both work; close reachable with one hand (top-left) and via system back.
- White on blue-700 passes AA.

## Open questions
- None. Video deferred (row 32); signed links decided (row 25).

## Current vs design
Re-audited 2026-10-07 against `feat/customer-screens` (`docs/audits/customer-reaudit-2026-10-07.md`). PASS (video row 32 and link row 25 fallbacks). Minor: no widget test; `onLoadError` re-fetch not wired (waits for signed links, row 25).

Spec update 2026-10-08 (rows 25, 32): matches the built fallback (video line, no playback). Remaining minor: wire the `onLoadError` re-fetch now that signed links are decided. Status stays `matches-design`.
