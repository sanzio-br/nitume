# v-new-review — New task, step 3: review, quote and payment method

- Mockup: `docs/design/nitume_customer_app.html` lines 386–408 (`#v-new-review`, overlay)
- Shared conventions: `_shared.md`
- Implementation: none
- Status: missing

## Purpose
Show the quote breakdown, let the customer choose how any purchase is paid (merchant payment flow), and confirm & pay the service + runner fee.

## Entry / exit
- Entry: "Continue →" on `v-new-details`. Also (recommended) from Home / task detail when an errand is QUOTED.
- Back → `v-new-details`.
- "Confirm & pay KSh 2,200 →" → push `v-payment`.

## Task states
The mockup shows a quote instantly. In the §3.3 state machine and the API, a quote only exists after DRAFT → REQUESTED (customer submits) → QUOTED (admin/system prices it). Confirming moves QUOTED → ACCEPTED, then payment moves ACCEPTED → PAYMENT_CONFIRMED. This screen therefore spans DRAFT/REQUESTED (waiting for quote) and QUOTED (quote shown). See Q1 — this is the biggest flow ambiguity in the customer app.

## Layout (top to bottom)
1. Pushed header (C-10): title + `Step 3 of 3`.
2. Stepper (C-14): all three segments done.
3. Scrollable body:
   1. Form card "Quote breakdown": receipt rows (C-18) label left / amount right 13px, padding 6 0; total row with top hairline, 700.
   2. Form card "How should this be paid?": three full-width selectable rows stacked (C-16 choice chips in a column, left-aligned text), first selected.
4. Fixed primary CTA with the total in Fira Code.

## Components
| Element | Component | Status |
|---|---|---|
| Quote breakdown | C-07 + C-18 `ReceiptRow` | NEW |
| Payment-flow choice | C-16 in column layout (radio group) | NEW |
| Waiting-for-quote state | C-33 loading variant + muted copy | NEW |
| CTA with amount | C-01 + C-32 | core / NEW |

## Copy (exact)
- Header: `Review & pay`, `Step 3 of 3`
- Card label: `Quote breakdown`
  - `Base fee` `KSh 1,000`
  - `Report & evidence` `KSh 700`
  - `Transport` `KSh 500`
  - Total: `Total (service + runner fee)` `KSh 2,200`
- Card label: `How should this be paid?`
  - `Pay merchant directly (recommended)` (selected)
  - `Send purchase amount to runner`
  - `Let runner advance the purchase`
- CTA: `Confirm & pay KSh 2,200 →`

Implied states (recommended copy):
- Waiting for quote (REQUESTED): `We're preparing your quote. This usually takes a few minutes.` + spinner; CTA disabled `Waiting for quote…`. Push `Task quoted` (§4.4) or status socket event moves to QUOTED.
- Quote expired (`quotes.expiresAt` passed): `This quote has expired.` + `Request a new quote`.
- Submit error: `Couldn't send your task. Try again.`
- No purchase involved (budget 0): hide the "How should this be paid?" card (flow = `platform_only`).

## Numeric fields (Fira Code)
- Every amount in the breakdown and total.
- Amount inside the CTA label (`KSh 2,200`).
- Step counter.

## Data
- `POST /api/v1/errands` (creates DRAFT, exists) → `POST /api/v1/errands/:id/submit` (DRAFT → REQUESTED, exists).
- Quote: `POST /errands/:id/quote` is admin-only (exists). The customer needs to **read** the quote breakdown (`quotes` row: `baseFee`, `distanceFee`, `timeFee`, `urgencyFee`, `complexityFee`, `premiumFee`, `total`, `expiresAt`). No customer-readable quote endpoint exists → needs: api-contract (`GET /errands/:id/quote` or embed in `GET /errands/:id`).
- Accept: `PATCH /errands/:id/status` `{ to: 'ACCEPTED' }` (exists; customer actor allowed QUOTED → ACCEPTED).
- Payment flow choice: `payments.payment_flow` enum `merchant_direct | customer_to_runner | runner_advance | platform_only` (ERD). `POST /payments/:errandId/initiate` takes **no body** and picks `merchant_direct` or `platform_only` automatically (`payments.service.ts:127`) → needs: api-contract to accept the chosen flow (and validate `runner_advance` against `max_purchase_advance`).
- Socket: status change on `errand:{id}` for REQUESTED → QUOTED (event name undefined, needs: api-contract). Push "Task requested / quoted" (§4.4).

## Accessibility and mobile
- Payment-flow options are a radio group; announce "recommended".
- The CTA amount must match the quote total exactly.

## Questions for owner
- Q1 (flow / state machine): The mockup shows an instant quote in the wizard; §3.3 and the API require submit → admin/system quote → customer accept. Recommended: step 3 submits the task and shows "Waiting for quote" until QUOTED, then the breakdown and CTA appear (same screen, also reachable later from Home/Task detail). Alternative: auto-quote synchronously from the pricing engine so the screen behaves like the mockup.
- Q2 (payments): Quote line items differ between screens. Here: Base fee / Report & evidence / Transport = "service + runner fee". On `v-evidence-confirm` and `v-task-detail`: Service fee KSh 700 + Runner fee KSh 1,500. The API quote has base / distance / time / urgency / complexity / premium fees, and the payments module splits the quote 20% service / 30% runner (`pricing.serviceFeeRate`, `runnerFeeRate`), which does not add up to the quote total. Which breakdown does the customer see, and what are the real split rules?
- Q3 (payments): Should the customer choose among the three merchant-payment flows (mockup), and what are the runner-advance limits? (Business plan gives indicative ranges only.)
- Q4: For "Pay merchant directly", §6 says show the merchant Till/Paybill for the merchant amount after payment. Where is that shown? Not drawn in the mockup (see SCREEN_MAP implied view `x-merchant-payment`).
- Q5: For "Send purchase amount to runner", how is that amount paid — a separate STK push to the runner's number, or outside the app? It must stay separate from the service/runner fee push.

## Current vs design
Not built.
