# p-runners-verification-documents — Verification images: logged view, purged state

- Mockup: `docs/design/nitume_admin_dashboard.html` `#p-runners` (lines 331–355: `Runner verification`, `.verif-card` with `.doc-row`s `National ID`, `Phone number`, `Selfie / liveness check`, `M-Pesa identity match`, status text, `Reject` / `Approve`). The image view and the purged state are **not drawn. EXTENDS MOCKUP** (rows 125, 144, 154, 161, 162). Copy not in the mockup is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3.1 times, A-02 `kind="verification"`, §7 N-23)
- Scope: this spec covers only the document part of each verification card (view, missing, purged). The rest of `p-runners` (card layout, filters, approve/reject flow) has no parity audit yet.
- Implementation: `apps/admin/src/app/features/admin/panels/verifications.panel.ts` (`Verification inbox`) on `main`
- Status: partial (see Current vs design)

## Purpose
Let an admin open a runner's ID or selfie image for review through the logged, short-lived signed link (rows 125, 154), and show clearly when an image has been deleted at the end of its retention period (rows 144, 161), with only the minimum audit record left.

## Rules this screen follows
- Images are reached only through `GET /runners/verifications/:id/document` (admin only), which logs every call (admin, IP, time) and returns a signed URL valid at most 5 minutes. No raw storage key, path or bucket URL is ever shown or built by the client.
- **Viewing never restarts the retention clock** (row 161). The UI must not imply that opening an image keeps it longer.
- The retention clock restarts only on a new/replacement ID or selfie, a verification or re-verification started, or an admin verification review that needs the evidence (row 161). This screen never shows a retention date or a countdown (the clock is computed server-side and may restart).
- After the purge, only minimum audit metadata is kept (row 161): status, outcome, timestamps, reviewer/admin id, purge time, evidence type, audit/event ids. The image is gone for good; there is no restore.

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

## Purged verification (what an admin sees)
A purged card keeps: the runner header (short id / name, phone), the status chip (`Approved`, `Rejected` …, unchanged), `Type` (label below), `Submitted` (`createdAt`), `Decided` (`reviewedAt`) and `By` (`reviewedBy`, admin name or short id), and `Image` → `Deleted {date}`. It does **not** show the reviewer's note (strict reading of row 161, AQ-15: the API clears it at purge; if the owner keeps it, the row `Admin note` stays). No `View image`, no actions. Cards are never hidden because they were purged; the status filter works as for any card.

Type labels (mockup rows): `government_id` → `National ID` (when the API adds `side`: `National ID · front` / `· back`), `selfie` → `Selfie / liveness check`, `phone` → `Phone number`, `payment_identity` → `M-Pesa identity match`.

## Errors on `View image`
- 410 `verification_document_purged` (extra `purgedAt`): switch the row to Deleted with that date; A-11 info `This image was deleted at the end of the retention period.`
- 404 `verification_document_missing`: row to `No image on file`; A-11 info `No image is stored for this check.`
- 200 with `url: null` (console storage driver in dev): A-11 info `Image preview isn't available in this environment.`
- 403 → `FORBIDDEN_COPY`; other → `Couldn't open the image. Try again.`

## Copy
Exact, from the mockup: `Runner verification` (panel title; built as `Verification inbox`), `National ID`, `Phone number`, `Selfie / liveness check`, `M-Pesa identity match`, `Reject`, `Approve`. Proposed: `Image`, `View image`, `Opening…`, `Deleted {date}`, `Deleted at the end of the retention period. The record of this check is kept.`, `No image on file`, `Decided`, `By`, the panel hint and the error notices. Never `forever`, `permanently stored`, a retention date, or anything suggesting a view extends retention.

## Numeric fields (Fira Code)
`Submitted`, `Decided`, `Deleted` dates and times (12-hour EAT, §3.1); the phone number; counts in the topbar sub.

## Data
- Built on `main`: `GET /runners/verifications?status=&cursor=&limit=` → `{ items: [{ id, runnerProfileId, verificationType, status, reviewerNote, reviewedBy, reviewedAt, createdAt, purgedAt, hasDocument, runnerProfile { id, userId }, user { id, phone } }], nextCursor }` (no storage key, row 154); `GET /runners/verifications/:verificationId/document` → `{ verificationId, url, expiresAt }` (≤ 5 min, logged); `PATCH /runners/:runnerId/verifications/:verificationId` `{ decision, reviewerNote? }`.
- **Must change (api-contract, N-23)**: the purge clock (row 161: upload of a new/replacement ID or selfie, verification or re-verification started, an admin review that needs the evidence; not task assignments/offers or disputes, which the built `purgeExpiredDocuments` counts); clear `reviewerNote` at purge (AQ-15); separate restricted credential for ID media and backups that cannot keep a purged image (row 162).
- **Missing (recommended)**: `side` (`front | back`) on ID images; the reviewer's display name on the item (today an id only).
- **Open (AQ-16)**: how "an admin verification review that needs the stored evidence" is recorded on an already-decided verification. Proposed: the approve/reject decision of a pending verification counts as one; a later review (for example a fraud check) would need an explicit, logged action with a reason (`Keep for review`, not specced until the owner approves it).

## Accessibility
`View image` opens a new tab: its accessible name is `View {type} image for {runner}, opens in a new tab`. The Deleted state is text, not colour only.

## Owner decisions applied
Rows 125, 126, 144, 154, 161, 162 (`_shared.md` §1). Row 163 (10 MB per image) is enforced at upload; nothing to show here.

## Open questions for the owner
- AQ-15: is the reviewer's note part of the "outcome" kept after the purge? Strict reading: no.
- AQ-16: how a later review that needs the evidence is recorded (see Data).

## Current vs design
`main`, `verifications.panel.ts`:
1. blocker: `:63-69` shows `Document` → `View` only when `v.documentKey` is set and links to `/api/v1/files/{key}` (`docUrl`, `:203-206`). The API never returns a key (row 154), so the row never appears and admins cannot open any image; the URL pattern would also bypass the logged endpoint. Fix: the Stored / Opening states above, through `GET /runners/verifications/:id/document`.
2. blocker: no purged state; `purgedAt` and `hasDocument` are not read (`core/api-types.ts:646-660` has `documentKey`, `submittedAt`). Fix: add `purgedAt`, `hasDocument`, `createdAt`, `reviewedAt` to the type and render the Deleted and No image states.
3. minor: `Submitted` reads `v.submittedAt` (`:61`), which the API does not send (`createdAt`).
4. minor: type labels (`typeLabel`, `:194-201`) use `Government ID`, `Driving License`; the mockup labels are above. Selfie, phone and M-Pesa identity fall back to the raw value.
5. minor: the reviewer note row `Admin note` (`:71-75`) must not render for a purged card if the owner confirms AQ-15's strict reading.
