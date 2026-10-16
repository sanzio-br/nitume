# v-notifications — Notifications

- Mockup: `docs/design/nitume_runner_app.html` lines 449–457 (`#v-notifications`, overlay)
- Shared conventions: `_shared.md` (§10 deep links); customer equivalent `docs/specs/customer/v-notifications.md`
- Implementation: none
- Status: missing

## Purpose
In-app feed of runner events: new offers, job changes, payouts, ratings, verification decisions.

## Entry / exit
- Entry: bell on `v-jobs`; `Notifications` row on `v-profile`.
- Back (C-10) → previous screen.
- Row tap → mark read, then deep link (`_shared.md` §10):

Targets per kind: see **Runner notification copy** below (last column).

## Task states
Any (feed).

## Layout (top to bottom)
1. C-10 header `Notifications`; trailing C-04 `Mark all read` when unread rows exist (proposed, as customer).
2. Full-bleed list of C-28 rows (mockup: full-width offer cards without radius or side borders; the design-system/customer row C-28 is the same pattern): white, padding 14 20, bottom hairline; icon box 34 green-050 r-s 8 with a blue glyph per kind (offer: briefcase, payout: arrow-out, rating: star, verification: shield); title 13/600 (unread 700); subtitle Fira Code 11.5 slate-600 (mockup `.offer-meta` is Fira Code, kept); time Fira Code 10.5 slate-400 right; unread 7px red dot.
3. Paging on scroll (cursor), `SkeletonCard`s while loading.

States: empty C-33 `No notifications yet` / `New job offers and payout updates will show here.` (proposed); error `Couldn't load notifications.` + `Try again`.

## Components
C-10, C-28, C-04, C-33 — all exist.

## Copy
Exact, from the mockup (sample rows; the API writes the text):
| Title | Subtitle | Time |
|---|---|---|
| `New job offer nearby` | `Apartment check — Nyali · KSh 1,750` | `2m ago` → rendered `2m` (relative style as customer) |
| `Payout sent` | `KSh 6,000 to M-Pesa` | `1h` |
| `You were rated 5 stars` | `"Thorough and quick" — Achieng O.` | `Yesterday` |
| `Verification approved` | `You're now a Level 3 — Trusted Runner` | `Mon` |

Mockup puts the relative time inside the subtitle (`· 2m ago`); the C-28 row shows it in the right column instead (same data, design-system row pattern).

## Runner notification copy (final, row 139)

Written 2026-10-13 for api-contract (RA-6). The API writes these strings into the runner's feed and sends the same title/body as the FCM push. Rules: plain and short; `KSh` with thousands separators and no decimals when whole (`KSh 6,000`, `KSh 1,750.50` otherwise, row 82); task name = `title`, else the category display name (`_shared.md` §7); never a customer phone, never the customer's payment or refund, never wallet/escrow words; times in 12-hour EAT (row 122). `{…}` are placeholders; text in brackets is included only when the condition holds. Every row carries `errandId` when it concerns a task (deep link).

| `eventType` | When (recipient: the runner) | Title | Body | Opens |
|---|---|---|---|---|
| `job.offered` | An offer is made to this runner (row 113) | `New job offer` | `{task} · KSh {runnerFee}. Accept by {offerExpiresAt, h:mm a}.` | `v-job-detail` (if no longer offered: snackbar `That offer is no longer available.`) |
| `job.offer_withdrawn` | The offer is withdrawn before the runner answered (customer cancelled, ops cancelled or reassigned, or the task's customer deadline passed, row 185; the reason is never shown) | `Offer no longer available` | `The offer for {task} has been withdrawn.` | none (feed only; no push) |
| `job.offer_expired` | The offer lapsed without an answer | `Offer ended` | `The offer for {task} ended before you accepted it.` | none (feed only; no push) |
| `errand.CANCELLED` | A task the runner holds is cancelled | `Job cancelled` | `{task} was cancelled, so there's no runner fee.[ If you already bought the item, upload the receipt within 24 hours.]` (bracket: `send_to_runner` with an item amount, row 129) | `v-active` (ended card) |
| `errand.FAILED` | A task the runner holds ends FAILED | `Job ended as failed` | `{task} ended as failed, so there's no runner fee.[ If you already bought the item, upload the receipt within 24 hours.]` | `v-active` (ended card) |
| `errand.COMPLETED` | The customer confirmed the task | `Customer confirmed the job` | `{task}. Your runner fee becomes payable when the review window closes.` | `v-job-summary` |
| `runner_fee.payable` | The task reached CONFIRMED and the runner-fee line is payable | `Runner fee ready` | `KSh {amount} for {task} is now in your available balance.` | `v-earnings` |
| `errand.DISPUTED` | The customer reported a problem | `Customer reported a problem` | `Our team is reviewing {task}. We'll tell you the outcome.` | `v-active` |
| `dispute.resolved` | Ops resolved the dispute | `Problem resolved` | `Our team has decided on {task}. Open the job to see the outcome.` | `v-active` (ended card with the resolution note) |
| `price_change.approved` | The customer approved the runner's price change | `Price change approved` | `New item amount for {task}: KSh {toPrice}.` | `v-active` |
| `price_change.rejected` | An admin rejected the price change (row 55; a customer rejection cancels the task and sends `errand.CANCELLED` instead) | `Price change not approved` | `Continue {task} at the original amount, or contact support.` | `v-active` |
| `reimbursement.on_hold` | An item line is created or put back `on_hold` (rows 105, 106, 108) | `Reimbursement on hold` | by `reviewReason`: `receipt_missing` → `We need your receipt for {task}. Contact support to send it.`; `receipt_mismatch` → `Our team is checking your receipt for {task}.`; `over_purchase_limit` → `The purchase for {task} is above your limit. Our team is checking it.`; `out_of_pocket_claim` → `We got your claim for {task}. Our team is checking your receipt.`; `price_decrease_pending` → `Your reimbursement for {task} waits until a price change on the task is settled.` | `v-job-summary` |
| `reimbursement.approved` | Ops approved an item line (row 139) | `Reimbursement approved` | `KSh {amount} for {task} is now in your available balance.` | `v-job-summary` |
| `reimbursement.rejected` | Ops rejected an item line (row 139) | `Reimbursement not approved` | `We couldn't approve the item reimbursement for {task}. Contact support if you think this is wrong.` (no admin note: the ledger's `decisionNote` is admin-only) | `v-job-summary` |
| `payout.sent` | Ops recorded an M-Pesa payout (one per payout, row 139 "payout sent" and "reimbursement paid/sent") | `Payout sent` | `KSh {total} to M-Pesa · {reference}.[ Includes KSh {itemTotal} item reimbursement.]` (bracket: the payout covers `item_reimbursement` lines). When the payout settled a payout request below the requested amount (row 146): `KSh {paid} of the KSh {requested} you asked for was sent to M-Pesa · {reference}. The rest is still available to request.` No time promise in any payout notification (row 143) | `v-earnings` |
| `payout.reversed` | Ops recorded a reversal (row 139) | `Payout reversed` | `Your payout of KSh {previousAmount} was reversed. It's back in your available balance and we'll send it again.` | `v-earnings` |
| `payout.resent` | Ops re-sent a reversed payout | `Payout sent again` | `KSh {amount} to M-Pesa · {reference}.` | `v-earnings` |
| `payout_request.rejected` | Ops rejected a payout request (row 117) | `Payout request not approved` | `Your request for KSh {amount} wasn't approved: {decisionNote}` (runner-visible note, required on reject) | `v-earnings` |
| `payout_request.cancelled` | Ops cancelled an open payout request (row 166) | `Payout request cancelled` | `Your payout request was cancelled by Nitume operations.` (owner wording, row 194, decided 2026-10-16; title per rows 168, 194; never the ops reason, row 168; no time promise; replaces the earlier proposed body) | `v-earnings` |
| `rating.received` | The customer rated the runner | `You were rated {stars} stars` (`1 star`) | `"{comment}" — {customerShortName}` or `{task}` when there is no comment | `v-profile` |
| `verification.approved` | All required checks approved (row 126) | `Verification approved` | `You're now a {levelLabel} Runner. You can go online and get jobs.` | `v-onboard-pending` |
| `verification.rejected` | A required check was not approved | `Verification not approved` | `Some checks need another look. Open your verification to see what to fix.` | `v-onboard-pending` |

Not notified (feed rows only where noted, never push): `correction` adjustments (a receipt or amount fix, like row 109 for customers), the runner's own transitions, ARRIVED by geofence. One payout covering several tasks sends one `payout.sent`, never one per line. A reimbursement paid inside a payout is announced by that `payout.sent` (the bracketed sentence), not by a second notification.

Icons per kind (C-28 icon box): offers briefcase; job status task/flag; money (`runner_fee`, `reimbursement`, `payout*`) arrow-out; dispute/price change alert; rating star; verification shield.

## Numeric fields (Fira Code)
- Subtitles (amounts, levels, quoted ratings are text but the line is a meta line), times.

## Data
- `GET /notifications?limit=&cursor=` (exists, any role), `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` (exist).
- **Missing** (RA-6; copy above is final): every runner event kind. The worker only writes customer copy today (`notifications.service.ts` `statusCopy` is customer-worded, e.g. `Runner arrived`), and status changes notify only the customer. Push to runner devices uses the same FCM worker (device registration exists for runners).
- No socket event for the feed; refresh on open and on push.

## Accessibility and mobile
As customer: rows read `Unread. New job offer nearby. Apartment check — Nyali, 1,750 shillings. 2 minutes ago.`; `Mark all read` 48 dp.

## Decisions (owner, 2026-10-13)
- Row 139: proceed once copy is defined (done above); at least payout sent, payout reversed, reimbursement approved, rejected, paid/sent.
- Row 194 (2026-10-16): payout cancel copy `Payout request cancelled` / `Your payout request was cancelled by Nitume operations.`, sent once runner notifications exist; never the reason.
- Row 185 (2026-10-16): an offer that ends because the task's deadline passed uses `job.offer_withdrawn` and its existing copy; the deadline is not named. Row 188: titles are sent exactly as written here, with no `· {status}` suffix.

## Questions
- None new.
