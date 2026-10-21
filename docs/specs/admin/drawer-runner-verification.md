# drawer-runner-verification — Verification documents: one runner's checks with the uploaded images

- Owner instruction (BOARD row 278, 2026-10-21): "all the documents should be viewed in a different file … view documents that render the cards with the images or documents uploaded".
- Mockup: not drawn as a separate view. Content = the mockup's `.verif-card` (`#p-runners`, lines 331–355) as specced and built for the card grid; container = the mockup's right-hand `.drawer` (CSS line 170, `openDrawer(...)`), the admin's one pattern for list → detail. **EXTENDS MOCKUP**; copy not already in `p-runners-verification-documents.md` is **(proposed)**.
- Opened from: `docs/specs/admin/p-runners-verification-table.md` (`View documents` / row click).
- Content rules (unchanged, not repeated here): `docs/specs/admin/p-runners-verification-documents.md` sections `Card header`, `Check rows`, `Approve`, `Reject`, `Answers and errors`, `Re-review evidence`, `Purged verification`, type labels, Accessibility, Data (A-3 … A-9). This file specs only what changes: the container, the image rendering, the image security rules and the drawer states.
- Implementation: `apps/admin/src/app/features/admin/drawers/runner-verification-drawer.ts` + `verification-document-preview.ts`, `shared/image-viewer.component.ts` (on `feat/admin-verification-table`; **audited PASS 2026-10-21**).

## Why a drawer, not a routed page (AQ-42, recommended)
- The admin has no routed detail pages: `app.routes.ts` has `/login` and `''` only; panels are a `signal` in `admin-dashboard.component.ts`; every list → detail in the admin (task queue → task, refunds → refund, runner payouts → payout line, disputes → dispute, map → runner) opens the single A-01 drawer through `DrawerNavService.open(kind, id)`. A routed page would add a second navigation model (URL state, back button, deep links, guards) for one screen.
- The drawer keeps the table visible behind the overlay, which is what ops need when they work down a queue.
- The drawer re-mounts per target (`admin-dashboard.component.ts` `@for (t of targets(); track t.kind + ':' + t.id)`), so each open is a fresh component: images fetched on open and gone on close, which is exactly the security rule below.
- The drawer is 420 px (mockup). An ID card image at the drawer's content width (about 376 px) is legible for a first look; reading small print uses the full-size viewer (A-17, below) instead of a wider drawer. A wider drawer variant is not proposed (design system drawer width; AQ-42 asks the owner).

## Shell wiring (web-parity)
- `DrawerKind` gains `'runner_verification'` (`drawer-nav.service.ts:3`); id = runner profile id.
- New component file `apps/admin/src/app/features/admin/drawers/runner-verification-drawer.ts` (selector `app-runner-verification-drawer`, input `runnerProfileId`), `@defer (on immediate)` in the shell like `runner_payout` (keeps the initial bundle within budget). Optional split: `drawers/verification-document-preview.ts` for the image block (one component per image, so each owns its fetch and its link).
- Shell title (`drawerTitle()`): `Verification documents` (proposed).
- The card's header button (`Open runner {name}`) becomes a text action in the drawer: `.btn .btn-text .btn-sm` `Open runner profile` → `nav.open('runner', runnerProfileId)` (switches drawers, as task → refund does today).

## Layout (drawer body, top to bottom; A-05 styles)
Drawer body padding 18 / 22 / 30 (as built). Sections 20 px apart (`.drawer-section`).

1. **Notice slot** (A-11, top of the body): decision, re-review and image notices for this runner (`Check approved.`, `Check rejected.`, `Re-review recorded.`, `This image was deleted …`, errors). Success notices auto-dismiss after 6 s (runner-payouts pattern); others stay until dismissed.
2. **Runner header** (`.drawer-section`, not a button): `.verif-avatar` initials (38 px, blue fill, white 13/700) + `.verif-name` short name (short id fallback, Fira Code) + `.verif-sub` `Applied {relative time} · {area} +{n}` (Fira Sans, relative time and `+{n}` Fira Code, W-2 rule) + `.verif-sub.num` `{short id} · {phone}` + `.verif-level` level line (`Level 1 — Basic · Level 2 needs: …`, from the API, unchanged). Below, `Open runner profile` (text button, 40 px target).
3. **Caption** (`.drawer-caption`, 12 slate-600, proposed): `Each image shown here is logged with your name and the time. Viewing never extends how long images are kept.` (final wording depends on AQ-40.)
4. **Checks** (`.drawer-card`, white, the existing `.doc-row` / `.doc-detail` / `.verif-actions` / `.btn-approve` / `.btn-reject` styles): one block per check in the mockup order, exactly the `Check rows` rules (newest record per (type, side); compact phone row; `Not submitted`; `Submitted {date}`; `Reviews`; `Admin note … · internal`; per-row `Approve` / `Reject` on pending newest records only; `Re-review evidence` on decided stored ID/selfie images). **The only change is detail line 2 (`Image`)**, below.
5. Dialogs: the Reject dialog and the Re-review dialog (A-08, as specced) open over the drawer. ESC backs out of the dialog only (as built in `confirm-dialog.component.ts:110-116`); the typed note is dropped with it (as built), so the drawer needs no close guard.

## Image block (replaces `View image`; ID front, ID back, legacy `National ID`, selfie)
Placed under `Submitted {date}` of each ID-side / selfie block whose newest record has an image state. No block on phone, M-Pesa identity, reference or business checks (they store no image).

| State | Condition | Shows |
|---|---|---|
| Loading | `hasDocument: true`, `purgedAt: null`, link not yet answered | frame (A-18) with `Loading image…` 12 slate-600 centred; `aria-busy="true"` |
| Shown | link answered with `url` | `<img>` in the frame, `object-fit: contain` (never cropped; an ID must be read whole), `alt="{check label} for {runner}"`, `referrerpolicy="no-referrer"`, `decoding="async"`; the frame is a `button` that opens the full-size viewer (A-17), `aria-label="Open {check label} image for {runner} full size"` |
| Not in this environment | answer `url: null` (console storage driver) | text 12 slate-600 `Image preview isn't available in this environment.` (built copy) |
| Deleted | `purgedAt` set, or the call answers 410 | as built: `Image` · `Deleted {date}` (Fira Code) + caption `Deleted at the end of the retention period. The record of this check is kept.`; no frame |
| No image | `hasDocument: false`, or the call answers 404 `verification_document_missing` | as built: `Image` · `No image on file`; no frame |
| Couldn't load | the call fails otherwise, or the image fails to load (see refetch rule) | text 12 slate-600 `Couldn't load the image.` + `.btn .btn-text .btn-sm` `Try again` (40 px target; one logged call per click; accessible name `Try again: {check label} image for {runner}`, as built). 403 → `FORBIDDEN_COPY` instead, no `Try again` |
| Format not shown | the image fails to load in the browser before its link expired (e.g. a HEIC upload in Chrome; see AV-3) | same as Couldn't load until AV-3 ships (proposed copy for after AV-3: none needed) |

Frame (A-18, NEW style `.doc-preview`): width 100 % of the check block, `aspect-ratio: 3 / 2` while loading (no layout jump), `max-height: 280px` once shown, background `var(--nitume-slate)`, 1 px `var(--nitume-slate-line)`, radius 10, image centred with `object-fit: contain`. The existing `.receipt-thumb` is not reused as is: it crops (`object-fit: cover`), which can hide the ID number.

### Full-size viewer (A-17, NEW admin shared component `app-image-viewer`)
- Opens on a click on a shown image. Scrim over the whole page (the drawer overlay tone `rgba(11, 37, 69, …)` from `.drawer-overlay`, darker to read the image; token-derived), the image centred, at most 92 vw × 88 vh, `object-fit: contain`, white 2 px frame radius 10; header line above the image in white 13/600 Fira Sans: `{check label} · {runner}`; close button `.drawer-close` style (32 px, `aria-label="Close"`) top right. ESC, ✕ or a click on the scrim close it and return focus to the image button. Focus trapped (A-08 rules). No download button, no zoom controls beyond the browser's (proposed; the owner may want pinch / scroll zoom later).
- Uses the **same** `url` already loaded in the drawer while `now < expiresAt`; after `expiresAt` it first asks for a new link (one logged call, `Loading image…` in the viewer) then shows it. Never opens a new tab.

## Image security rules (row 278 brief; rows 125, 144, 154, 161)
1. **When**: links are fetched only when the documents drawer opens for that runner (after its runner data is on screen), never in the table, never on hover, never prefetched for the next row, never on a timer.
2. **How many**: one `GET /runners/verifications/:verificationId/document` per image the drawer shows: the newest record of ID front, ID back, a legacy `National ID` record when shown, and the selfie, only in the Stored state (`hasDocument && !purgedAt`). Superseded records and decided-and-purged ones are never fetched. At most 4 calls per open, sent in parallel; each is logged by the API as a `view` (admin, IP, time), as today.
3. **Kept where**: the `url` and `expiresAt` live only in the drawer's own component state (signals of `runner-verification-drawer` / the preview component). Never in `AdminDataService`, `localStorage`, `sessionStorage`, the URL bar, an `href`, a `title`, a log or an error report. No service worker caches them (the admin has none; must stay so for these hosts).
4. **Gone when**: closing the drawer, switching to another drawer (`Open runner profile`), switching panel, or logging out destroys the component; the `img` elements are removed with it. Re-opening the runner's documents is a new view and fetches new links (new log entries; accepted, and noted in AQ-40).
5. **Expiry and refetch**: an image that has loaded stays on screen after its link expires (no refetch: nothing is requested again). A link is asked again only when the image must be requested again after `expiresAt`: the image failed to load and `now ≥ expiresAt` (one automatic new link per image per open; a second failure → Couldn't load + `Try again`), or the full-size viewer opens after `expiresAt`. An image that fails **before** `expiresAt` is not refetched automatically (`Try again` only).
6. **No referrer, no opener**: `referrerpolicy="no-referrer"` on every `img`; no `target=_blank` links to the storage host anywhere. (The old new-tab flow and its `window.open` / `tab.opener = null` code are removed with `View image`.)
7. **Retention**: viewing never restarts the retention clock (row 161, unchanged); no copy may imply it does. `Re-review evidence` stays the only evidence-review action besides a decision.
8. **Purged / missing**: answered from the list data first (no call when `purgedAt` is set or `hasDocument` is false); a 410 or 404 from the call switches the block to Deleted / No image and updates the store record (`markVerificationPurged`, `markVerificationMissing`, as built) so the table and a later open agree.
9. **HTTP cache**: the client cannot clear the browser's own image cache; what the browser keeps depends on the storage response headers (AV-4, AQ-41).

**This changes the built rule** "never prefetch the link (each call is logged as a view) … on click call the document endpoint" (`p-runners-verification-documents.md` `Layout: document row`). Rows 125 / 154 (signed admin-only links, every access logged, ≤ 5 min) are still met, but opening the drawer now creates up to four logged views without a per-image click, also when the admin only came to decide the M-Pesa check. **Not decided here: AQ-40.**

## Drawer states
- **Opening**: the drawer shows the runner at once from the table's store item (`verificationQueue`) and, when AV-1 exists, refreshes it with `GET /runners/{runnerProfileId}/verifications`; while that first call runs with no store item: A-10 `.ops-loading` `Loading documents…` (proposed). Image links are asked only after the runner's checks are rendered (so the calls match what is shown).
- **Runner not found** (AV-1 answers 404, or no AV-1 and the runner is not in the store): A-10 `.ops-empty` `This runner isn't in the list any more` + `Refresh the list and open them again.` (proposed).
- **Load error** (AV-1 fails otherwise): keep the store item if there is one and show A-11 danger `Couldn't refresh this runner. Try again.` with `Try again` (proposed); with no store item, the same notice and no content.
- **Decisions**: Approve / Reject / Re-review exactly as specced (busy labels, one call per click, error copy). Their answers update both the drawer and the table row (store), as built in `admin-data.service.ts` `reviewVerification` / `reReviewVerification`. On 404 / 409 (`This check was already decided. The list is updated.`), refresh this runner (AV-1; without it, reload the table's current page) and show the info notice inside the drawer.
- **Close**: ✕, overlay click, ESC (when no dialog is open). If any decision or re-review was saved during this open, the table reloads its current filters when the drawer closes (`p-runners-verification-table.md` States).

## Components
| Piece | Pattern | Status |
|---|---|---|
| Drawer container, title, ESC / overlay / ✕ | A-01 `app-ops-drawer` + `DrawerNavService` | exists (new `DrawerKind` value) |
| Sections, rows, labels, caption | A-05 `.drawer-section`, `.drawer-card`, `.drawer-row`, `.drawer-label`, `.drawer-caption` | exists |
| Card content: avatar, name, sub lines, level line, check rows, actions | `.verif-avatar`, `.verif-name`, `.verif-sub`, `.verif-level`, `.doc-row`, `.doc-status`, `.doc-detail`, `.verif-actions`, `.btn-approve`, `.btn-reject` | exists in `_ops.scss:526-685` (move, don't copy; the template moves from the panel to the drawer) |
| Reject / Re-review dialogs | A-08 `app-confirm-dialog` + A-06 `app-form-field` | exists |
| Notices, loading, empty | A-11, A-10 | exist |
| Mixed-font lines | `app-num-text` | exists |
| Image frame | A-18 `.doc-preview` | **NEW** (web-parity, `_ops.scss`, tokens only) |
| Full-size viewer | A-17 `app-image-viewer` (`apps/admin/src/app/shared/image-viewer.component.ts`) | **NEW** (web-parity; admin shared layer, not `nitume_core`) |
| Shared verification logic | proposed `features/admin/verification-labels.ts` (see table spec) | refactor |

## Copy
- Kept from `p-runners-verification-documents.md`: every check-row, dialog, notice and error string, the level line, `Deleted {date}`, `No image on file`, `Image preview isn't available in this environment.`, `Couldn't open the image. Try again.` is replaced by the inline `Couldn't load the image.`. **Dropped** (no click-to-open any more): `View image`, `Opening…`, the accessible name `… opens in a new tab`.
- Proposed: drawer title `Verification documents`; `Open runner profile`; caption `Each image shown here is logged with your name and the time. Viewing never extends how long images are kept.`; `Loading image…`; `Couldn't load the image.`; `Try again`; `Loading documents…`; `This runner isn't in the list any more`; `Refresh the list and open them again.`; `Couldn't refresh this runner. Try again.`; image alt `{check label} for {runner}`; viewer header `{check label} · {runner}`; `Open {check label} image for {runner} full size`.
- Never: `forever`, `permanently stored`, a retention date or countdown, anything suggesting a view extends retention, wallet / escrow wording.

## Numeric fields (Fira Code)
As in `p-runners-verification-documents.md` (`Submitted`, `Decided`, `Deleted`, `Reviews` times; relative time in `Applied …`; `+{n}`; short id; phone; level digit; `{n}/500` counters). Nothing numeric is added by the image block or the viewer.

## Data
- Built: `GET /runners/verifications/:verificationId/document` → `{ verificationId, url | null, expiresAt | null }`, TTL ≤ 300 s (`MAX_DOCUMENT_URL_TTL_SECONDS`), logged as `view` before the link is made (`runners.service.ts` `documentLink`); 404 / 404 `verification_document_missing` / 410 `verification_document_purged { purgedAt }`. Decision, re-review and queue endpoints as in `p-runners-verification-documents.md` Data. Upload types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` only (`DOCUMENT_CONTENT_TYPES`; signature-checked; 10 MB, row 163). **No PDF** can be uploaded, so the view renders images only; a PDF state is not specced. Signed link = Cloudinary `private_download_url` of the authenticated asset in its **original format**.
- Task states: none. Sockets: none (System Design §4 has no verification events).
- **API must add (api-contract)**:
  - **AV-1** `GET /runners/:runnerProfileId/verifications` (admin only; `ParseUUIDPipe`) → one queue item, the exact shape of a `GET /runners/verifications/queue` item (`runnerProfile`, `user`, `checks` (every record, newest first, admin item shape, no storage key), `pendingCount`, `oldestPendingAt`, `verification`), plus AV-5 `applicationStatus` when that ships. 404 `runner_not_found` for an unknown profile; a runner with only phone records still answers (the drawer shows the compact phone row). Declare it so it cannot shadow `GET /runners/me/verifications` (route order or a UUID constraint). No document links in it.
  - **AV-3** browser-renderable links: HEIC / HEIF uploads do not render in an `img` in Chrome, Edge or Firefox. Return the signed link in a browser format (JPEG) for those uploads (Cloudinary can deliver a format-converted, signed, authenticated rendition), keeping TTL ≤ 300 s and the `view` log. Converted renditions are derived copies at the provider: the retention purge must delete them with the original (Cloudinary `destroy` with `invalidate`), so this is a security / third-party point: **AQ-44**.
  - **AV-4** cache headers: confirm what `Cache-Control` the signed download link returns. Wanted: `private, no-store` (or a max-age no longer than the link's TTL), so the browser does not keep ID images on disk after the view. If Cloudinary cannot be told this for authenticated downloads, report back; streaming the image through the API instead is a larger change for the owner (**AQ-41**).
- Web-parity items: T-1 … T-9 in `docs/audits/admin-gap-report.md` "Spec 2026-10-21: verification table and documents drawer (row 278)".

## Accessibility
- The drawer is `role="dialog"` `aria-modal` labelled by its title (A-01, as built). Initial focus on the drawer's close button (proposed; `app-ops-drawer` sets no initial focus today, so this is a small A-01 addition for web-parity).
- Each check block is a `section` labelled by its check label; Approve / Reject / Re-review keep their per-check accessible names (`Approve National ID · Front for Mercy W.`).
- Images have the alt text above; the Loading frame has `aria-busy` and the text `Loading image…`; states are text, never colour only.
- The viewer: focus trapped, ESC closes, focus returns to the image button; the image has the same alt.
- Targets: Approve / Reject 40 px (as built), `Try again`, `Open runner profile` and `Re-review evidence` 40 px through `min-height`; the image button is the whole frame.
- No motion beyond the drawer slide (as built); the viewer appears without animation.

## Questions for the owner (detail and recommendations in `_shared.md` AQ table)
- **AQ-40** (security, rows 125 / 144 / 154): rendering inline means opening the drawer logs one view per stored image (up to 4), with no per-image click. Recommended: approve; keep the existing `view` log entry (no schema change).
- **AQ-41** (security / privacy): browser image cache after the view (AV-4). Recommended: require `no-store` from the provider if possible; otherwise accept the browser cache for now and record it.
- **AQ-42** (scope): drawer (recommended) vs a full page.
- **AQ-44** (security / third-party): allow a JPEG rendition of HEIC / HEIF uploads at the provider so they render (AV-3), purged with the original. Recommended: yes.

## Current vs design
**Audit 2026-10-21: PASS** on `feat/admin-verification-table` @ `784a4db`, `f96da02` (gap report "Re-audit 2026-10-21 … (row 278 build)"). Owner answers: AQ-40 approved as specced (row 279: images load and are logged when the drawer opens, never in the table, dropped on close, refetched only on expiry or `Try again`); AQ-41 closed, browser cache accepted (row 280); AQ-42 drawer (row 281); AQ-44 / AV-3 and the short-id search rule API-side (rows 283, 284). As built and accepted: the viewer re-parents to `<body>`; scrim token `--nitume-viewer-scrim`; A-01 ✕ initial focus applies to every drawer (refund / payout drawers still move focus to their first field after load). Open minor m-2: no ✕ focus when switching drawers while open.

### Before the build
Not built as a separate view. Today the same content renders in each card of the grid (`verifications.panel.ts:287-456`) and images open in a new tab on click (`viewImage`, `:719-748`). Everything inside a check row except the image line is built and audited (PASS 2026-10-21) and moves into this drawer unchanged.
