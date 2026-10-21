# p-runners-verification-documents — Verification images: logged view, re-review, purged state

- Mockup: `docs/design/nitume_admin_dashboard.html` `#p-runners` (lines 331–355: `Runner verification`, `.verif-card` with `.doc-row`s `National ID`, `Phone number`, `Selfie / liveness check`, `M-Pesa identity match`, status text, `Reject` / `Approve`). The image view and the purged state are **not drawn. EXTENDS MOCKUP** (rows 125, 144, 154, 161, 162, 170, 171, 175). Copy not in the mockup is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3.1 times, A-02 `kind="verification"`, §7 N-23)
- Scope: the document part of each verification card (view, missing, purged, re-review) and, since the 2026-10-21 audit, the verification card itself (header, check rows, Approve / Reject, topbar count, panel note). See `Verification card` below. The runner directory part of `p-runners` (`runners.panel.ts`) is still unaudited.
- Implementation: `apps/admin/src/app/features/admin/panels/verifications.panel.ts` (`Verification inbox`) on `main`, with `core/services/api.service.ts:279-290`, `features/admin/admin-data.service.ts:559-586`, `core/api-types.ts:695, 735-754`
- Status: built on `fix/admin-verification-inbox` (`386c961`, `7638f3e`): re-audit 2026-10-21 PASS on findings 34–36, 39, 41–45, 47–49; card layout, initials, count wording and phone row (findings 37, 38, 40, 46) deferred to AQ-35 / API A-5 (`docs/audits/admin-gap-report.md` "Re-audit 2026-10-21: verification inbox")

## Purpose
Let an admin open a runner's ID or selfie image for review through the logged, short-lived signed link (rows 125, 154), and show clearly when an image has been deleted at the end of its retention period (rows 144, 161), with only the minimum audit record left.

## Rules this screen follows
- Images are reached only through `GET /runners/verifications/:id/document` (admin only), which logs every call (admin, IP, time) and returns a signed URL valid at most 5 minutes. No raw storage key, path or bucket URL is ever shown or built by the client.
- **Viewing never restarts the retention clock** (row 161). The UI must not imply that opening an image keeps it longer.
- The retention clock restarts only on a new/replacement ID or selfie, a verification or re-verification started, or an admin verification review that needs the evidence (row 161). That review is either the approve/reject decision on a pending verification (the initial review) or, on an already-decided verification, the explicit, audited **Re-review evidence** action below (row 171). This screen never shows a retention date or a countdown (the clock is computed server-side and may restart).
- After the purge, only minimum audit metadata is kept (row 161): status, outcome, timestamps, reviewer/admin id, purge time, evidence type, audit/event ids. The image is gone for good; there is no restore. The reviewer's note is deleted with it (row 170).
- Never purged (row 175, kept as built): a PENDING verification's evidence, and evidence tied to an open dispute. These guards win over the retention purge; the screen shows such images as Stored. Row 190 (decided 2026-10-16): the open-dispute hold is intended, a legal/audit hold; images may stay past the retention period while the dispute is open; normal rules resume when it closes. No UI change.
- Row 191 (decided 2026-10-16): only verification activity that creates or replaces stored ID/selfie evidence restarts the clock (payment identity only if it reuses the retained images); only reviews of the stored ID/selfie count as evidence reviews; views and unrelated admin actions never do. Built on `main` (`RETENTION_CLOCK_SQL`). No UI change.
- Rows 192, 193 (decided): Cloudinary's internal disaster-recovery copies are an external dependency (System Design §10); the owner's console checklist is a production-readiness owner action. No UI change; no copy may claim deletion beyond what Nitume controls.

## Verification card (mockup `#p-runners`, lines 331–355; specced 2026-10-21)
The mockup draws **one card per runner applicant**, with one `.doc-row` per check and the actions on the card. The API returns **one item per check** (`runner_verifications` row) and decides each check on its own (`PATCH` per verification; row 209: each ID side has its own decision). How the two meet is AQ-35 (below). Everything else in this section holds either way.

Styles: the mockup classes are already ported to `styles/_ops.scss:526-631` (`.verif-grid`, `.verif-card`, `.verif-top`, `.verif-avatar`, `.verif-name`, `.verif-sub`, `.doc-row`, `.doc-status`, `.doc-status.pending`, `.verif-actions`, `.btn-approve`, `.btn-reject`). **exists in the admin styles**; use them, no new classes.

Topbar (A-03):
- Title `Runner verification` (mockup).
- Sub 12.5 Fira Code slate-600: `{n} applications awaiting review` (mockup), n = runners with at least one `pending` check. `No applications awaiting review` when n = 0 (proposed). If AQ-35 keeps one card per check: `{n} checks awaiting review` (proposed). The count never mixes items and cards: it counts exactly what the cards show.
- Status filter: `All statuses`, `Pending`, `Approved`, `Rejected` (the API enum `pending | approved | rejected`; there is no `in_review`, the API answers 400 to it). `↻ Refresh` as built.
- Panel note (`.kpi-note`): `Opening an image is logged. Images are deleted at the end of the retention period.` (the panel hint below). No sentence about runner levels (AQ-36).

Card header (`.verif-top`, opens the runner drawer like the mockup's `openDrawer('runner')`; `drawers/runner-drawer.ts` exists):
- Avatar `.verif-avatar` 38 px, blue fill, white 13/700: two initials from the runner's display name (`Mercy W.` → `MW`). With no name: `R`. Never characters of an id or UUID.
- Name `.verif-name` 13.5/600: display name in the short form `Mercy W.`; fallback the short id `#NT-XXXXX` (Fira Code).
- Sub `.verif-sub` 11 Fira Code slate-600: `Applied {relative time} · {service area}` (mockup). Relative time (`timeAgo`, allowed by `_shared.md` §3.1 where the mockup draws it) from the earliest `createdAt` of the runner's checks. No area → `Applied {relative time}`.
- Phone (proposed, kept from the build because ops compare it in the M-Pesa identity match): second sub line, Fira Code.

Check rows (`.doc-row` 12.5, padding 8 0, hairline between rows), mockup order: `National ID · Front`, `National ID · Back`, `Phone number`, `Selfie / liveness check`, `M-Pesa identity match` (labels in "Type labels" below; a legacy ID image with `side = null` reads `National ID`). The newest record of each check is shown (same rule as the API's `verificationSummaryOf`); older records of the same check are not listed (proposed).
- Status `.doc-status` 11/700, text not colour only: `approved` → `Verified` (green-700); `pending` → `Pending review` (amber, `.doc-status.pending`); `rejected` → `Rejected` (danger tone, proposed); no record → `Not submitted` (slate-600, proposed).
- Under an image check (ID side, selfie): the `Image` line from "Layout: document row" below, plus `Submitted {date}` 12 slate-600 (`createdAt`, 12-hour EAT, Fira Code).
- The auto-approved `phone` check (approved at the OTP sign-in, no reviewer, `runners.service.ts:474-483`): `Verified`, caption `Verified at sign-in` 12 slate-600 (proposed). It has no Approve / Reject and no image.

Actions (pending checks only):
- Buttons `.btn-reject` `Reject` (outline) and `.btn-approve` `Approve` (green, white text), 40 px target, in `.verif-actions`. Where they sit (per pending row, or once per card as drawn) is AQ-35. Until it is answered, build per check (the only thing the API can do today).
- While a call runs: both buttons disabled; only the clicked one changes, to `Approving…` or `Rejecting…`. One call per click, no auto-retry.
- Call: `PATCH /runners/{runnerProfileId}/verifications/{verificationId}` `{ decision: 'approved' | 'rejected' }` (the `runnerProfileId` from the item). No note until AQ-37 is answered.
- Success: A-11 success `Check approved.` / `Check rejected.` (proposed). Two response shapes must work: on `main` the bare verification (no `runnerProfile`, `user`, `reviewer`, `reReviews`); with api-contract's `fix/api-verification-review` (A-3) the full list item (same keys as a `GET /runners/verifications` item, with `reviewer { id, displayName }`). Merge the answer over the list item (`status`, `reviewedBy`, `reviewedAt`, `reviewerNote`, and `runnerProfile` / `user` / `reviewer` / `reReviews` when present). Never replace the item with a bare response. With the bare response `By` falls back to the admin's short id until the next reload (accepted 2026-10-21).
- Errors: 403 → `FORBIDDEN_COPY`; 409 `verification_already_decided` `{ status }` (another admin decided first; also when both clicks race, A-2) → reload the list and A-11 info `This check was already decided. The list is updated.` (proposed); 404 (unknown verification, or not this runner's; on `main` before A-2 merges also the already-decided case) → same reload and notice (accepted 2026-10-21: the client always sends the item's own `runnerProfileId`, so a 404 after A-1 means the check is gone and the reload shows the truth); 400 (malformed id) and other → `Couldn't save the review. Try again.`

Loading, empty, error (whole panel):
- First load: the grid shows `Loading…` (A-12 style, proposed); never `No verifications synced yet` before the first answer.
- Empty: `No verifications match` + `Clear the filter, or wait for runner submissions.` (as built).
- Load error: A-11 danger `Couldn't load verifications. Try again.` (as built).

## Layout: document row in each verification card
In the card body (`.vc-body`), after `Type` and `Submitted`:

| State | Condition (API) | Row `Image` | Caption 12 slate-600 |
|---|---|---|---|
| Stored | `hasDocument: true`, `purgedAt: null` | A-07 `.btn .btn-text` `View image` | none |
| Opening | after the click, until the link arrives | `Opening…` (button disabled) | none |
| Deleted | `purgedAt` set | text `Deleted {date}` (`purgedAt`, 12-hour EAT, Fira Code date and time) | `Deleted at the end of the retention period. The record of this check is kept.` |
| No image | `hasDocument: false`, `purgedAt: null`, type `government_id` or `selfie` | `No image on file` (slate-600) | none |
| Not an image check | type `phone` or `payment_identity` | row hidden | — |

`View image` behaviour: on click call the document endpoint, then open `url` in a new tab (`window.open(url, '_blank', 'noopener,noreferrer')`). Never prefetch the link (each call is logged as a view), never put it in an `href` before the click, never keep it after `expiresAt`; a second click asks for a new link.

Panel hint (A-03 sub or `.kpi-note`, once per panel, proposed): `Opening an image is logged. Images are deleted at the end of the retention period.`

## Re-review evidence (row 171, decided 2026-10-16)
Owner: "the decision on a pending verification is the initial review; a later review of stored evidence needs an explicit, audited 'Re-review evidence' action (admin, timestamp, verification/evidence reference, review event). Viewing never restarts the clock."

When shown: verification status `approved` or `rejected`, type `government_id` or `selfie`, `hasDocument: true`, `purgedAt: null`. Never on a pending verification (its decision is the initial review; use `Approve` / `Reject`), on a purged or missing image, or on `phone` / `payment_identity` checks.

1. Button: A-07 `.btn .btn-outline` small `Re-review evidence`, in the card actions row (decided cards have no `Approve` / `Reject`). Not green: it is not the primary action of the panel and it changes no decision. 40 px target.
2. Confirm (A-08 dialog):
   - Title `Re-review this evidence?`
   - Body 13 slate-600: `This records that you are reviewing the stored {type label} for {runner} again. The review is logged with your name and the time, and the image is kept for a new retention period from today. Opening the image alone never does this.`
   - Optional A-06 textarea `Note (optional)`, max 500, counter `{n}/500` (Fira Code), hint 11.5 slate-600 `Kept in the audit trail until the image is deleted.` Optional, no minimum (row 180); whitespace-only is sent as empty and stored as no note.
   - Buttons outline `Back`, primary `Record re-review` (disabled and `Recording…` while the call runs; one call per click, no auto-retry).
3. On success: A-11 success `Re-review recorded.`; the card's activity list gains the new row; `View image` stays where it is (opening the image is a separate, logged step, as always). The client never shows a new retention date (rule above).
4. Activity (new `.drawer-row`-style list under the card body, label `Reviews`, oldest first; each time 12-hour EAT, Fira Code):
   - `Decided · {Approved | Rejected} · {admin} · {reviewedAt}` (from the verification).
   - one row per re-review: `Re-reviewed · {admin} · {createdAt}`, with the note on a second line 12 slate-600 when present.
   - On a purged card the rows stay (they are audit/event metadata, row 161) but the notes are gone (row 170).

Errors:
- 409 `verification_not_decided` → reload, A-11 info `Decide this check first.`
- 410 `verification_document_purged` (extra `purgedAt`) → card to Deleted, A-11 info `This image was deleted at the end of the retention period, so there's nothing to re-review.`
- 404 `verification_document_missing` → `No image on file`, A-11 info `No image is stored for this check.`
- 403 → `FORBIDDEN_COPY`; other → `Couldn't record the re-review. Try again.`

## Purged verification (what an admin sees)
A purged card keeps: the runner header (short id / name, phone), the status chip (`Approved`, `Rejected` …, unchanged), `Type` (label below), `Submitted` (`createdAt`), `Decided` (`reviewedAt`) and `By` (`reviewedBy`, admin name or short id), `Image` → `Deleted {date}`, and the `Reviews` rows without notes. **No `Admin note` row**: the reviewer's note is deleted at purge (row 170, decided). No `View image`, no `Re-review evidence`, no actions. Cards are never hidden because they were purged; the status filter works as for any card.

Type labels (mockup rows): `government_id` → `National ID · Front` / `National ID · Back` from `side` (`front | back`, lowercase on the wire; UI shows `Front` / `Back`; rows 195, 200, decided; built on `main`, the admin view spreads `side`); a legacy ID image with `side = null` (uploaded before row 195) reads `National ID`, `selfie` → `Selfie / liveness check`, `phone` → `Phone number`, `payment_identity` → `M-Pesa identity match`.

## Errors on `View image`
- 410 `verification_document_purged` (extra `purgedAt`): switch the row to Deleted with that date; A-11 info `This image was deleted at the end of the retention period.`
- 404 `verification_document_missing`: row to `No image on file`; A-11 info `No image is stored for this check.`
- 200 with `url: null` (console storage driver in dev): A-11 info `Image preview isn't available in this environment.`
- 403 → `FORBIDDEN_COPY`; other → `Couldn't open the image. Try again.`

## Copy
Exact, from the mockup: `Runner verification` (panel title; built as `Verification inbox`), `{n} applications awaiting review`, `Applied {time} · {area}`, `National ID`, `Phone number`, `Selfie / liveness check`, `M-Pesa identity match`, `Verified`, `Pending review`, `Reject`, `Approve`. Proposed (2026-10-21): `National ID · Front` / `· Back` (rows 195, 200, decided), `Rejected`, `Not submitted`, `Verified at sign-in`, `No applications awaiting review`, `{n} checks awaiting review` (only if AQ-35 keeps one card per check), `Approving…`, `Rejecting…`, `Check approved.`, `Check rejected.`, `This check was already decided. The list is updated.`, `Loading…`. Never: `Approve → runner level upgrades` (AQ-36), `Government ID`, `Driving License`, raw enum values such as `payment identity`. Proposed (earlier rounds): `Image`, `View image`, `Opening…`, `Deleted {date}`, `Deleted at the end of the retention period. The record of this check is kept.`, `No image on file`, `Decided`, `By`, the panel hint and the error notices; `Re-review evidence`, `Re-review this evidence?`, the confirm body above, `Note (optional)`, `Kept in the audit trail until the image is deleted.`, `Back`, `Record re-review`, `Recording…`, `Re-review recorded.`, `Reviews`, `Decided · {outcome} · {admin} · {time}`, `Re-reviewed · {admin} · {time}`, `Decide this check first.`, `This image was deleted at the end of the retention period, so there's nothing to re-review.`, `Couldn't record the re-review. Try again.` Never `forever`, `permanently stored`, a retention date, or anything suggesting a view extends retention.

## Numeric fields (Fira Code)
`Submitted`, `Decided`, `Deleted` dates and times and every `Reviews` time (12-hour EAT, §3.1); the `Applied {time}` relative time in the card sub (the whole `.verif-sub` line is Fira Code in the mockup); the note counter `{n}/500`; the phone number; the short id fallback `#NT-XXXXX`; counts in the topbar sub. Not numeric (Fira Sans): the avatar initials, type labels, status words.

## Data
- Built on `main` (checked against the code 2026-10-21, `apps/api/src/runners/runners.controller.ts:61-125`, `runners.service.ts:117-132, 710-735, 860-907, 976-1023, 1128-1164`):
  - `GET /runners/verifications?status=&cursor=&limit=` (admin; `status` ∈ `pending | approved | rejected`, anything else 400 because of the global `forbidNonWhitelisted` ValidationPipe; `limit` 1–100, default 50; newest `createdAt` first) → `{ items: [{ id, runnerProfileId, verificationType, side, status, reviewerNote, reviewedBy, reviewedAt, createdAt, purgedAt, hasDocument, runnerProfile { id, userId } | null, user { id, phone } | null, reviewer { id, displayName } | null, reReviews: [{ id, reviewedBy { id, displayName }, createdAt, note }] }], nextCursor }`. No storage key (row 154), **no `submittedAt`** (use `createdAt`), no runner display name, no service area.
  - `GET /runners/verifications/:verificationId/document` → `{ verificationId, url | null, expiresAt | null }` (≤ 5 min, logged as a view). Errors: 404 (unknown id; the id must be a UUID, else 400), 404 `verification_document_missing`, 410 `verification_document_purged` `{ purgedAt }`.
  - `PATCH /runners/:runnerId/verifications/:verificationId` `{ decision: 'approved' | 'rejected', reviewerNote?: string (≤ 1000) }` (`:runnerId` = runner profile id). **The path has three segments**: `PATCH /runners/verifications/:id` does not exist (Nest 404).
    - On `main` @ `1f4524f`: → the bare verification view (`{ id, runnerProfileId, verificationType, side, status, reviewerNote, reviewedBy, reviewedAt, createdAt, purgedAt, hasDocument }`); `:runnerId` unchecked; 404 `Verification not found`; 404 `Verification already resolved ({status})` on a decided check.
    - **Contract** (api-contract, `fix/api-verification-review` @ `dfcc72b`, `38a6a58`, `e117ac6`; A-1, A-2, A-3, A-6; not on `main` until the owner merges): → 200 the full admin list item (same keys as a `GET /runners/verifications` item: `runnerProfile`, `user`, `reviewer { id, displayName }`, `reReviews`, `side`, `hasDocument`, `purgedAt`; no storage key). Errors: 400 malformed `:runnerId` or `:verificationId` (`ParseUUIDPipe`); 404 `Verification not found` for an unknown id **or** a verification of another runner (nothing changes); **409** `verification_already_decided` `{ status }` when the check is no longer pending, including two admins deciding at once (conditional write on `status = pending`). The list now looks up runner phones in one batch (A-6). Approving a `government_id` check moves the runner from `1_basic` to `2_id_verified` (`runners.service.ts:1153-1161`), whichever side it is (AQ-36); no other type changes the level.
  - `POST /runners/verifications/:verificationId/re-review` (below) is on `main` too.
- **Built on `main` since the round-9 merge (`0e12564`; was "Must change", N-23)**: the purge clock (row 161: upload of a new/replacement ID or selfie, verification or re-verification started, an admin review that needs the evidence; not task assignments/offers or disputes, which the built `purgeExpiredDocuments` counts); clear `reviewerNote` (and re-review notes) at purge (row 170, decided); keep the row-175 guards (pending, open dispute); separate restricted credential for ID media and backups that cannot keep a purged image (row 162).
- **Built on `main` (rows 195, 200)**: `side` (`front | back`, lowercase; null on legacy rows and on every non-ID type) on each verification item. The reviewer's display name is on `main` as `reviewer { id, displayName }`.
- **Missing for the mockup card (api-contract, after AQ-35)**: the runner's display name (short form) and service area on each item, or a runner-grouped queue (`{ runner { id, displayName, phone, area, appliedAt }, checks[] }`, paginated by runner) so one runner's checks are never split across `nextCursor` pages; (the 409 for an already decided check, the 404 for another runner's check and the full-item answer are built on `fix/api-verification-review`, see the PATCH contract above).
- **Re-review endpoint (rows 171, 180, 181)**: `POST /runners/verifications/:id/re-review` (approved, row 180; admin only) `{ note?: string }` (optional, ≤ 500 after trim, no minimum; blank → null) → 201 `{ verificationId, reReview { id, reviewedBy { id, displayName }, createdAt, note } }`. Allowed only on a decided ID/selfie verification with a stored image; logged as `re_review` (admin, IP, time, verification id) and restarts the retention clock; a view (`GET …/document`) never does. It never changes the decision (row 181). Admin list items carry `reReviews[]` (oldest first, `note` null after the purge) and `reviewer { id, displayName }`. **On `main` with this shape** (checked 2026-10-21; `runners.controller.ts:114-125`, `runners.service.ts:860-907`). The DTO accepts up to 2000 characters so that the service can answer 400 `re_review_note_invalid` `{ maxLength: 500 }` for 501–2000 after trimming; the client still caps the field at 500.

## Accessibility
`View image` opens a new tab: its accessible name is `View {type} image for {runner}, opens in a new tab`. The Deleted state is text, not colour only. Approve / Reject per check carry the check in their accessible name (`Approve National ID · Front for Mercy W.`); 40 px targets. Check status words (`Verified`, `Pending review`, `Rejected`) are text, never colour alone. The avatar is decorative (`aria-hidden`), the name next to it is the label.

## Owner decisions applied
Rows 125, 126, 144, 154, 161, 162, 170, 171, 175, 180, 181, 190, 191, 192, 193, 195, 200 (`_shared.md` §1). Row 181: the confirm and the activity say nothing about changing the decision; there is no decision control on a decided card. Row 163 (10 MB per image) is enforced at upload; nothing to show here.

## Open questions for the owner (new 2026-10-21)
- **AQ-35** (flow): the mockup draws one card per runner with `Reject` / `Approve` once per card; the API decides each check separately (row 209: each ID side has its own decision). What does the card do? Recommended: (a) one card per runner (mockup), with `Reject` / `Approve` on each pending check row and no card-level buttons. Alternatives: (b) one card per runner, card-level `Approve` approves every pending check of that runner and `Reject` rejects them all; (c) keep one card per check (as built), grouped visually by runner.
- **AQ-36** (verification rule, security): approving **one** National ID image (front **or** back) moves the runner to `Level 2 · ID verified` even while the other side is pending or rejected and the selfie is unreviewed (`apps/api/src/runners/runners.service.ts:1153-1161`). Row 126 says a runner is verified only when every required check is approved. Recommended: Level 2 only when both ID sides (and the selfie?) are approved, and never on a phone / payment identity approval. The built panel note `Approve → runner level upgrades` is removed either way.
- **AQ-37** (copy, runner-facing): should `Reject` ask for a reason, and may the runner see it? Recommended: optional internal note (≤ 500, trimmed), never shown to the runner; the runner gets the generic copy (`v-onboard-id.md` Rejected state, RA-7). The API accepts `reviewerNote` (≤ 1000) today; the panel never sends one.

Decided earlier: AQ-15 (row 170, note deleted at purge), AQ-16 (row 171, `Re-review evidence`), RQ-30 (row 175, guards kept), AQ-20 (row 180, endpoint approved, optional note ≤ 500, no minimum, logged), AQ-21 (row 181, never changes the decision).

## Current vs design (re-audit 2026-10-21, `fix/admin-verification-inbox` @ `7638f3e`)
Items 1–4, 6, 9–13 below are fixed on the branch (findings 34–36, 39, 41–45, 47–49 PASS). Still open, deferred by design until AQ-35 (rows 260–262) and API A-5: item 5 (card not built from the mockup classes, `vc-*` / `.runner-avatar` / `.btn-primary` instead of `.verif-*` / `.btn-approve` / `.btn-reject`; finding 37), item 7 (initials from the UUID; finding 38), item 8 and the title (`Verification inbox`, `{n} items · {n} pending`, `No verifications synced yet`; finding 40), the phone check shown as a full card (finding 46). Two notes for the rebuild: after a failed load on a filter change the previous list stays on screen under the new filter, and the empty state `No verifications match` shows under the load-error notice; the rebuild should clear the list on a filtered load error and hide the empty state while a load error is shown.

## Current vs design (audited 2026-10-21 against `main` @ `1f4524f`, owner's live run)
Full findings with file:line and classification: `docs/audits/admin-gap-report.md`, "Audit 2026-10-21: verification inbox" (findings 34–49; earlier 18, 19, 20, 22, 23, 28 still open and folded in there).
1. blocker: Approve / Reject always fail (`Couldn't save the review. Try again.`): `core/services/api.service.ts:287-290` PATCHes `/runners/verifications/{id}`; the API route is `/runners/{runnerId}/verifications/{verificationId}` (404).
2. blocker: `Submitted` reads `NaNd ago`: `:61` reads `submittedAt`, which the API never sends (`createdAt`).
3. blocker: no image can be opened: `:63-69` gated on `documentKey` (never sent, row 154); `docUrl` (`:203-206`) builds a raw storage path. Use `hasDocument` + the logged document endpoint, only on click.
4. blocker: no Deleted / No image states (`purgedAt`, `hasDocument` not read); no `Re-review evidence`, no `Reviews` list (endpoint and `reReviews[]`/`reviewer` are on `main` now).
5. blocker: card layout is not the mockup's: one card per check, unstyled classes (`vc-header`, `vc-row`, `vc-sub`, `vc-actions`, `vc-badge`, `doc-link` have no CSS); the mockup classes in `_ops.scss:526-631` are unused. Grouping waits on AQ-35.
6. minor: labels: `payment identity`, `selfie`, `phone` raw; `Government ID` with no `Front` / `Back` (`typeLabel`, `:194-201`; `side` is sent).
7. minor: initials `AA` = first two characters of the profile UUID (`:48`, `:185-192`); the list has no runner name (API item).
8. minor: topbar `5 items · 4 pending` counts checks, including the auto-approved phone check; the mockup counts applications.
9. minor: `Approve → runner level upgrades` (`:40-42`) is not in the mockup and is false for 4 of 5 check types (AQ-36).
10. minor: status filter offers `In review` (`:126-131`, `api-types.ts:695`); the API answers 400.
11. minor: success path replaces the list item with the bare PATCH response (`admin-data.service.ts:565`), dropping `runnerProfile` / `user` (header and phone go blank after a decision once item 1 is fixed).
12. minor: `Approving…` shows on Approve even when Reject was clicked (`:92`); no success notice; no loading state; title `Verification inbox` (mockup `Runner verification`); phone not in Fira Code.
13. blocker (build health): no `verifications.panel.spec.ts`.
