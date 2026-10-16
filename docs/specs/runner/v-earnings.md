# v-earnings — Earnings (payout ledger view)

- Mockup: `docs/design/nitume_runner_app.html` lines 246–264 (`#v-earnings`, root view)
- Shared conventions: `_shared.md` (§7 no wallet words, §8 money, rows 95, 104–107)
- Implementation: none
- Status: missing

## Purpose
Show what Nitume owes the runner (the `Available balance`, computed from the payout ledger, never a stored wallet), this week's earnings, and the latest ledger lines; start a payout request.

## Entry / exit
- Entry: tab bar `Earnings`; push `payout sent` / correction / reversal.
- `Request payout` → `v-payout` (row 117; disabled when `availableAmount` is below the minimum; with an open request it still opens `v-payout`, which shows the open request). Until RA-15 is built the builder hides the button and `Payout history` takes the full width.
- `Payout history` → `x-payout-history` (not drawn; the mockup button has no target).
- Ledger row tap: job lines and adjustments (they carry `errandId`) → `v-job-summary` for that errand; `payout` entries → `x-payout-history` (proposed).

## Task states
Any (ledger). Lines are created when a task reaches CONFIRMED (runner fee `payable`; item reimbursement `payable` or `on_hold`) and by the runner's claim after CANCELLED / FAILED (item reimbursement only, `on_hold`, row 106). AWAITING_CUSTOMER / COMPLETED / DISPUTED tasks are not lines yet; they only count in `pendingAmount`.

## Layout (top to bottom)
1. C-09 top bar `Earnings`.
2. R-08 balance card (margin 0 20 16): label `Available balance`; amount Fira Code 30/600 white (`availableAmount`); sub-line (proposed, Fira Code 11.5 blue-050) `KSh 2,450 pending confirmation` when `pendingAmount` > 0, and `KSh 5,000 on hold` when `onHoldAmount` > 0 (two lines max); actions: C-03 small `Request payout`, C-03 small `Payout history` (mockup: translucent white buttons, replaced, `_shared.md` §2).
   - Info icon button (48 hit) next to the label → C-35 info dialog (proposed): title `Available balance`; body `What Nitume owes you for confirmed tasks, minus payouts already sent. Runner fees and item reimbursements become available when the customer confirms and the review window closes.`; button `OK`.
3. R-11 weekly chart card (margin 0 20 16): C-08 `This week` (padding 0 0 2) + total Fira Code 13/600 right-aligned (proposed `KSh 4,470`), 7 bars Mon–Sun (EAT week, R-18), bar height = the day's **runner-fee** earnings relative to the week's max; today's bar blue, others blue-050; labels `M T W T F S S`.
4. C-08 `Recent payouts` (mockup label kept, row 133). An open payout request (RA-15) shows first as an R-12 row `Payout requested` / `Requested Mon, 10:03 AM` / `KSh 6,000` (no sign: nothing has moved yet) with a C-05 `Requested` chip (pending tone). Status only: no expected payout time (row 143).
5. R-12 ledger rows (margin 0 20 8), newest first, max 10, then C-04 `See all` → `x-payout-history`:
   | Feed `kind` (API) | Title | Caption | Amount (signed `amount` from the API) |
   |---|---|---|---|
   | `runner_fee` | `errandTitle` (else `Task ` + `errandReference` in Fira Code) | `Runner fee` + chip by `status` (below) | `+ KSh 1,750` |
   | `item_reimbursement` | as above | `Item reimbursement` + chip by `status`; on `on_hold` a second caption line by `reviewReason` (below) | `+ KSh 5,000` |
   | `payout` (derived, not a stored line; `id` = `payout:<uuid>`, opaque) | `Payout to M-Pesa` | `Sent Mon, 10:03 AM` (`paidAt`, EAT); `errandId` is null when the payout covered several tasks. When the payout paid a payout request below the requested amount (row 146), a second caption line (11 slate-600) `Requested KSh 5,000 · Paid KSh 4,000` (amounts Fira Code) | `− KSh 4,000` (the paid amount) |
   | `correction` (`status: recorded`) | `Payout corrected` | `amount` 0 → `Receipt updated`; else `Amount adjusted` | `+ KSh 500` / `KSh 0` (no sign at 0) |
   | `reversal` (`status: recorded`) | `Payout reversed` | `We'll send it again` | `+ KSh 6,000` (owed again) |
   | `resent_payout` (`status: paid`) | `Payout re-sent to M-Pesa` | `Sent …` (`paidAt`) | `− KSh 6,000` |

   Status chip on job lines (`runner_fee`, `item_reimbursement`; C-05 small, proposed): `payable` → none (it is in the available balance); `paid` → none on this screen; `on_hold` → `On hold` (pending tone); `rejected` → `Not approved` (neutral tone) and the amount is shown **without a sign** in slate-600 because it is not counted. A line whose payout was reversed comes back as `payable` (the API returns the effective status). There is **no** `pending` line status: tasks waiting for confirmation are not on the ledger yet; they only add to `pendingAmount` (balance sub-line).

   `reviewReason` captions on `on_hold` item lines (11 slate-600, proposed): `receipt_missing` → `We need your receipt. Contact support to send it.`; `receipt_mismatch` → `Our team is checking the receipt.`; `out_of_pocket_claim` → `Our team is checking your claim.`; `over_purchase_limit` → `Above your purchase limit. Our team is checking it.`; `price_decrease_pending` → `Waiting for a price change on this task to be settled.`
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
Proposed (round 6): `Payout corrected`, `Receipt updated`, `Amount adjusted`, `Not approved`, the `reviewReason` captions above, `Task ` + reference fallback.

Exact, from the mockup: `Earnings`, `Available balance`, `Request payout`, `Payout history`, `This week`, `M T W T F S S`, `Recent payouts`, `Payout to M-Pesa`, sample rows `Apartment check — Nyali` `+ KSh 1,750`, `Grocery run — Sarit` `+ KSh 720`, `− KSh 6,000`.

The words `wallet`, `escrow`, `held`, `release`, `top up`, `funds` never appear (OA-6). `On hold` is used only as a line status (row 105).

## Numeric fields (Fira Code)
- Balance amount and sub-lines; week total; chart day labels; every ledger amount; dates/times in captions.

## Data
Built on `feat/api-owner-answers-6` @ `10b6019` (row 107, table `runner_payout_lines`; RA-14 satisfied). Balances are derived from the lines on every read, never stored.
- `GET /runners/me/earnings?from=&to=&groupBy=` (runner role; all optional; dates `YYYY-MM-DD` in EAT, default the last 7 days by `day`; `groupBy` `day | week | month`; 400 `earnings_range_invalid` on a bad range or more than 366 days) → `{ currency: 'KES', availableAmount, pendingAmount, onHoldAmount, paidAmount, byKind: { runnerFee, itemReimbursement } (each { availableAmount, onHoldAmount, paidAmount }), week: [{ day, runnerFeeAmount }] x7, weekTotal, period: { from, to, groupBy, timeZone: 'Africa/Nairobi', totals, buckets[] } }`. Amounts are strings with 2 decimals.
  - `availableAmount` = payable lines + reversed payouts not re-sent (+ the unsent part of a payout corrected down). This is the balance card.
  - `pendingAmount` = runner fee + item amount of the runner's tasks in AWAITING_CUSTOMER, COMPLETED or DISPUTED (not on the ledger yet). Sub-line `KSh … pending confirmation`.
  - `onHoldAmount` = requested amounts of `on_hold` item lines. Sub-line `KSh … on hold`.
  - `week` = the current EAT week Monday–Sunday, runner-fee lines only, by the day the line was created (= the day the task reached CONFIRMED, not the day the job was done). Chart and `This week` total (`weekTotal`). Item reimbursements are never in the chart.
  - The screen does not use `period` (x-payout-history may later).
- `GET /runners/me/payout-lines?limit=10` (cursor `nextCursor`, `limit` 1–100, default 25; optional `kind` comma-separated from `runner_fee, item_reimbursement, payout, correction, reversal, resent_payout`; optional `errandId`) → `{ items: [{ id, kind, status, amount, errandId, errandTitle, errandReference, reference, relatedLineId, lineIds, reviewReason, createdAt, payableAt, paidAt }], nextCursor }`, newest first. `status`: job lines `on_hold | payable | paid | rejected`; `payout` and `resent_payout` `paid`; `correction` and `reversal` `recorded`. `amount` is signed (positive = owed to the runner, negative = paid out); `on_hold` and `rejected` lines carry the requested amount and are not counted in `availableAmount`. No admin notes, admin ids or customer data. Ids are opaque (never parse `payout:`).
- Socket: none (RA-5 open, row 139). Refresh on screen open, resume, pull-to-refresh and on a payout push (RA-6 open, row 139).
- The runner never sees the customer's refund reviews.
## Accessibility and mobile
- Chart has a text alternative (`This week: Monday KSh 0, Tuesday KSh 720, …`), bars are not the only carrier of information (the ledger lists the lines).
- Balance read as `Available balance, 8,450 shillings`.
- Pull-to-refresh.

## Decisions (owner, 2026-10-13)
- Row 117 (RQ-5): payout requests (see `v-payout.md`). Row 133 (RQ-21): keep `Recent payouts`.

## Decisions (owner, 2026-10-16)
- Row 143: no payout-time promise; status only.
- Row 146: a request paid below the requested amount closes as `Paid`; requested and paid are shown separately (caption above); the rest stays in `availableAmount` for a new request. Needs the derived `payout` entry to carry `payoutRequestId` and `requestedAmount` when it settled a request (api-contract, RA-15).
- Row 142: an item line approved above the purchase limit through the ops override shows like any approved line (amount as approved, no extra caption).

## Questions
- None new.
