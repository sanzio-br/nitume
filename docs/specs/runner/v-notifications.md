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

| Runner event (proposed `eventType`, RA-6) | Target |
|---|---|
| `job.offered` | `v-job-detail` if still offered, else snackbar `That offer is no longer available.` |
| `job.assigned`, `errand.CANCELLED`, `errand.FAILED`, `errand.DISPUTED`, dispute resolved | `v-active` for that job (ended-state card when ended) |
| `errand.COMPLETED` (customer confirmed), `errand.CONFIRMED` (payable) | `v-job-summary` |
| `price_change.approved`, `price_change.rejected` | `v-active` |
| `payout.sent`, `payout.reversed`, `payout.resent`, `payout.corrected` | `v-earnings` |
| `reimbursement.on_hold`, `reimbursement.approved` (rows 105, 106) | `v-job-summary` |
| `rating.received` | `v-profile` |
| `verification.approved`, `verification.rejected` | `v-onboard-pending` |
| unknown with `errandId` | `v-active` if it is the current job, else none |

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

Mockup puts the relative time inside the subtitle (`· 2m ago`); the C-28 row shows it in the right column instead (same data, design-system row pattern). Proposed API copy for the other kinds (RA-6): `Job assigned to you`, `Customer confirmed the job`, `Job payable`, `Job cancelled`, `Job marked as failed`, `Customer reported a problem`, `Problem resolved`, `Price change approved`, `Price change not approved`, `Payout reversed`, `Payout re-sent`, `Payout corrected`, `Reimbursement on hold`, `Reimbursement approved`, `Verification not approved`. `KSh` in all amounts (row 82). Never the word wallet/escrow.

## Numeric fields (Fira Code)
- Subtitles (amounts, levels, quoted ratings are text but the line is a meta line), times.

## Data
- `GET /notifications?limit=&cursor=` (exists, any role), `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` (exist).
- **Missing** (RA-6): every runner event kind. The worker only writes customer copy today (`notifications.service.ts` `statusCopy` is customer-worded, e.g. `Runner arrived`), and status changes notify only the customer. Push to runner devices uses the same FCM worker (device registration exists for runners).
- No socket event for the feed; refresh on open and on push.

## Accessibility and mobile
As customer: rows read `Unread. New job offer nearby. Apartment check — Nyali, 1,750 shillings. 2 minutes ago.`; `Mark all read` 48 dp.

## Questions
- None new.
