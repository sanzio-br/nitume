# p-runners-verification-documents — Verification images: logged view, re-review, purged state

- Mockup: `docs/design/nitume_admin_dashboard.html` `#p-runners` (lines 331–355: `Runner verification`, `.verif-card` with `.doc-row`s `National ID`, `Phone number`, `Selfie / liveness check`, `M-Pesa identity match`, status text, `Reject` / `Approve`). The image view and the purged state are **not drawn. EXTENDS MOCKUP** (rows 125, 144, 154, 161, 162, 170, 171, 175). Copy not in the mockup is **(proposed)**.
- Shared conventions: `docs/specs/admin/_shared.md` (§3.1 times, A-02 `kind="verification"`, §7 N-23)
- Scope: this spec covers only the document part of each verification card (view, missing, purged). The rest of `p-runners` (card layout, filters, approve/reject flow) has no parity audit yet.
- Implementation: `apps/admin/src/app/features/admin/panels/verifications.panel.ts` (`Verification inbox`) on `main`
- Status: partial (see Current vs design)

## Purpose
Let an admin open a runner's ID or selfie image for review through the logged, short-lived signed link (rows 125, 154), and show clearly when an image has been deleted at the end of its retention period (rows 144, 161), with only the minimum audit record left.

## Rules this screen follows
- Images are reached only through `GET /runners/verifications/:id/document` (admin only), which logs every call (admin, IP, time) and returns a signed URL valid at most 5 minutes. No raw storage key, path or bucket URL is ever shown or built by the client.
- **Viewing never restarts the retention clock** (row 161). The UI must not imply that opening an image keeps it longer.
- The retention clock restarts only on a new/replacement ID or selfie, a verification or re-verification started, or an admin verification review that needs the evidence (row 161). That review is either the approve/reject decision on a pending verification (the initial review) or, on an already-decided verification, the explicit, audited **Re-review evidence** action below (row 171). This screen never shows a retention date or a countdown (the clock is computed server-side and may restart).
- After the purge, only minimum audit metadata is kept (row 161): status, outcome, timestamps, reviewer/admin id, purge time, evidence type, audit/event ids. The image is gone for good; there is no restore. The reviewer's note is deleted with it (row 170).
- Never purged (row 175, kept as built): a PENDING verification's evidence, and evidence tied to an open dispute. These guards win over the retention purge; the screen shows such images as Stored.

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
   - Optional A-06 textarea `Note (optional)`, max 500, counter `{n}/500` (Fira Code), hint 11.5 slate-600 `Kept in the audit trail until the image is deleted.` (AQ-20: whether a reason should be required).
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

Type labels (mockup rows): `government_id` → `National ID` (when the API adds `side`: `National ID · front` / `· back`), `selfie` → `Selfie / liveness check`, `phone` → `Phone number`, `payment_identity` → `M-Pesa identity match`.

## Errors on `View image`
- 410 `verification_document_purged` (extra `purgedAt`): switch the row to Deleted with that date; A-11 info `This image was deleted at the end of the retention period.`
- 404 `verification_document_missing`: row to `No image on file`; A-11 info `No image is stored for this check.`
- 200 with `url: null` (console storage driver in dev): A-11 info `Image preview isn't available in this environment.`
- 403 → `FORBIDDEN_COPY`; other → `Couldn't open the image. Try again.`

## Copy
Exact, from the mockup: `Runner verification` (panel title; built as `Verification inbox`), `National ID`, `Phone number`, `Selfie / liveness check`, `M-Pesa identity match`, `Reject`, `Approve`. Proposed: `Image`, `View image`, `Opening…`, `Deleted {date}`, `Deleted at the end of the retention period. The record of this check is kept.`, `No image on file`, `Decided`, `By`, the panel hint and the error notices; `Re-review evidence`, `Re-review this evidence?`, the confirm body above, `Note (optional)`, `Kept in the audit trail until the image is deleted.`, `Back`, `Record re-review`, `Recording…`, `Re-review recorded.`, `Reviews`, `Decided · {outcome} · {admin} · {time}`, `Re-reviewed · {admin} · {time}`, `Decide this check first.`, `This image was deleted at the end of the retention period, so there's nothing to re-review.`, `Couldn't record the re-review. Try again.` Never `forever`, `permanently stored`, a retention date, or anything suggesting a view extends retention.

## Numeric fields (Fira Code)
`Submitted`, `Decided`, `Deleted` dates and times and every `Reviews` time (12-hour EAT, §3.1); the note counter `{n}/500`; the phone number; counts in the topbar sub.

## Data
- Built on `main`: `GET /runners/verifications?status=&cursor=&limit=` → `{ items: [{ id, runnerProfileId, verificationType, status, reviewerNote, reviewedBy, reviewedAt, createdAt, purgedAt, hasDocument, runnerProfile { id, userId }, user { id, phone } }], nextCursor }` (no storage key, row 154); `GET /runners/verifications/:verificationId/document` → `{ verificationId, url, expiresAt }` (≤ 5 min, logged); `PATCH /runners/:runnerId/verifications/:verificationId` `{ decision, reviewerNote? }`.
- **Must change (api-contract, N-23)**: the purge clock (row 161: upload of a new/replacement ID or selfie, verification or re-verification started, an admin review that needs the evidence; not task assignments/offers or disputes, which the built `purgeExpiredDocuments` counts); clear `reviewerNote` (and re-review notes) at purge (row 170, decided); keep the row-175 guards (pending, open dispute); separate restricted credential for ID media and backups that cannot keep a purged image (row 162).
- **Missing (recommended)**: `side` (`front | back`) on ID images; the reviewer's display name on the item (today an id only).
- **To build (api-contract, row 171; in progress)**: proposed `POST /runners/verifications/:id/re-review` (admin only) `{ note?: string ≤ 500 }` → 201 `{ verificationId, reReview { id, reviewedBy { id, displayName }, createdAt, note } }`. Server: allowed only on a decided verification with a stored image; writes an audit/review event (admin id, time, verification id, evidence type/ids, event id) and restarts the retention clock in the same transaction; a view (`GET …/document`) never does. List/detail items add `reReviews[]` (oldest first) and the reviewer's display name. Errors as above. If api-contract prefers another path (for example `POST /runners/:runnerId/verifications/:verificationId/re-review`, matching the built `PATCH`), the client follows it; flagged.

## Accessibility
`View image` opens a new tab: its accessible name is `View {type} image for {runner}, opens in a new tab`. The Deleted state is text, not colour only.

## Owner decisions applied
Rows 125, 126, 144, 154, 161, 162, 170, 171, 175 (`_shared.md` §1). Row 163 (10 MB per image) is enforced at upload; nothing to show here.

## Open questions for the owner
Decided: AQ-15 (row 170, note deleted at purge), AQ-16 (row 171, `Re-review evidence`), RQ-30 (row 175, guards kept).
- AQ-20: should `Re-review evidence` require a reason (proposed optional note)? Endpoint name `POST /runners/verifications/:id/re-review` OK?
- AQ-21: can a re-review change the decision (for example revoke an approval)? Proposed no; it only records the review.

## Current vs design
`main`, `verifications.panel.ts`:
1. blocker: `:63-69` shows `Document` → `View` only when `v.documentKey` is set and links to `/api/v1/files/{key}` (`docUrl`, `:203-206`). The API never returns a key (row 154), so the row never appears and admins cannot open any image; the URL pattern would also bypass the logged endpoint. Fix: the Stored / Opening states above, through `GET /runners/verifications/:id/document`.
2. blocker: no purged state; `purgedAt` and `hasDocument` are not read (`core/api-types.ts:646-660` has `documentKey`, `submittedAt`). Fix: add `purgedAt`, `hasDocument`, `createdAt`, `reviewedAt` to the type and render the Deleted and No image states.
3. minor: `Submitted` reads `v.submittedAt` (`:61`), which the API does not send (`createdAt`).
4. minor: type labels (`typeLabel`, `:194-201`) use `Government ID`, `Driving License`; the mockup labels are above. Selfie, phone and M-Pesa identity fall back to the raw value.
5. minor: the reviewer note row `Admin note` (`:71-75`) must not render on purged cards (row 170: the API clears it; hide the row when `purgedAt` is set even if a stale note arrives).
6. blocker (row 171, after api-contract): no `Re-review evidence` action, confirm, `Reviews` activity or errors.
