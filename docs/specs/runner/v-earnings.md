# v-earnings — Earnings (payout ledger view)

- Mockup: `docs/design/nitume_runner_app.html` lines 246–264 (`#v-earnings`, root view)
- Shared conventions: `_shared.md` (§7 no wallet words, §8 money, rows 95, 104–107)
- Implementation: none
- Status: missing

## Purpose
Show what Nitume owes the runner (the `Available balance`, computed from the payout ledger, never a stored wallet), this week's earnings, and the latest ledger lines; start a payout request.

## Entry / exit
- Entry: tab bar `Earnings`; push `payout sent` / correction / reversal.
- `Request payout` → `v-payout` (disabled when the available amount is 0 or a payout request is already open, RQ-5).
- `Payout history` → `x-payout-history` (not drawn; the mockup button has no target).
- Ledger row tap: job lines → `v-job-summary` for that errand; payout lines → `x-payout-history` scrolled to it (proposed).

## Task states
Any (ledger). Lines come from CONFIRMED / SETTLED errands (payable/paid), AWAITING_CUSTOMER / COMPLETED (pending), DISPUTED (pending), and CANCELLED / FAILED (reimbursement only, row 106).

## Layout (top to bottom)
1. C-09 top bar `Earnings`.
2. R-08 balance card (margin 0 20 16): label `Available balance`; amount Fira Code 30/600 white; sub-line (proposed, Fira Code 11.5 blue-050) `KSh 2,450 pending confirmation` when pending lines exist, and `KSh 5,000 on hold` when on-hold lines exist (two lines max); actions: C-03 small `Request payout`, C-03 small `Payout history` (mockup: translucent white buttons, replaced, `_shared.md` §2).
   - Info icon button (48 hit) next to the label → C-35 info dialog (proposed): title `Available balance`; body `What Nitume owes you for confirmed tasks, minus payouts already sent. Runner fees and item reimbursements become available when the customer confirms and the review window closes.`; button `OK`.
3. R-11 weekly chart card (margin 0 20 16): C-08 `This week` (padding 0 0 2) + total Fira Code 13/600 right-aligned (proposed `KSh 4,470`), 7 bars Mon–Sun (EAT week, R-18), bar height = the day's **runner-fee** earnings relative to the week's max; today's bar blue, others blue-050; labels `M T W T F S S`.
4. C-08 `Recent payouts` (mockup label; RQ-21 proposes `Recent activity` because the list mixes earnings and payouts).
5. R-12 ledger rows (margin 0 20 8), newest first, max 10, then C-04 `See all` → `x-payout-history`:
   | Line kind (API) | Title | Caption | Amount |
   |---|---|---|---|
   | `runner_fee` | task title | `Runner fee` + status chip when not `payable`/`paid` (`Pending`, `On hold`) | `+ KSh 1,750` |
   | `item_reimbursement` | task title | `Item reimbursement` + chip (`Pending`, `On hold`) | `+ KSh 5,000` |
   | `payout` | `Payout to M-Pesa` | `Sent Mon, 10:03 AM` / `Requested` (RQ-5) | `− KSh 6,000` |
   | `correction` | `Correction` | short reason category if the API gives a runner-safe one, else `Adjusted by Nitume` (proposed) | `± KSh …` |
   | `reversal` | `Payout reversed` | `We'll send it again` | `+ KSh 6,000` |
   | `resent_payout` | `Payout re-sent to M-Pesa` | `Sent …` | `− KSh 6,000` |
6. Tab bar (Earnings selected).

States:
- Loading: `SkeletonCard` for the balance and two rows. Error: C-33 `Couldn't load your earnings.` + `Try again`.
- Empty (no lines yet): balance `KSh 0`, chart with empty bars, C-33 empty `No earnings yet` / `Your runner fees appear here after each confirmed job.` (proposed).
- Not verified: same screen (it is just empty); `Request payout` disabled.

## Components
| Element | Component | Status |
|---|---|---|
| Balance card | R-08 (C-03 inside) | NEW |
| Weekly chart | R-11 | NEW |
| Ledger rows | R-12 (C-05 small) | NEW |
| Info dialog | C-35 | exists |
| States | C-33 | exists |

## Copy
Exact, from the mockup: `Earnings`, `Available balance`, `Request payout`, `Payout history`, `This week`, `M T W T F S S`, `Recent payouts`, `Payout to M-Pesa`, sample rows `Apartment check — Nyali` `+ KSh 1,750`, `Grocery run — Sarit` `+ KSh 720`, `− KSh 6,000`.

The words `wallet`, `escrow`, `held`, `release`, `top up`, `funds` never appear (OA-6). `On hold` is used only as a line status (row 105).

## Numeric fields (Fira Code)
- Balance amount and sub-lines; week total; chart day labels; every ledger amount; dates/times in captions.

## Data
Being built by api-contract on `feat/api-owner-answers-6` (row 107, `runner_payout_lines`); names below are what the screen needs (RA-14):
- `GET /runners/me/earnings` → `{ availableAmount, pendingAmount, onHoldAmount, currency: 'KES', week: [{ day: 'YYYY-MM-DD' (EAT), runnerFeeAmount }] x7, weekTotal }`. `availableAmount` = payable lines − payouts sent (+ reversals), computed server-side from the ledger, never stored. Week buckets in EAT.
- `GET /runners/me/payout-lines?limit=10&cursor=` → `{ items: [{ id, kind, status, amount (signed string), errandId, errandTitle, reference?, createdAt, payableAt?, paidAt? }], nextCursor }`. No internal reasons, admin ids or customer data.
- Socket: none today. Proposed `payout:updated` on `runner:{id}` (RA-5); else refresh on resume and on push.
- The runner never sees the customer's refund reviews.

## Accessibility and mobile
- Chart has a text alternative (`This week: Monday KSh 0, Tuesday KSh 720, …`), bars are not the only carrier of information (the ledger lists the lines).
- Balance read as `Available balance, 8,450 shillings`.
- Pull-to-refresh.

## Questions
- RQ-5 (payments): runner-requested payouts vs batched schedule; minimum; one open request.
- RQ-21 (copy, minor): `Recent payouts` vs `Recent activity`.
