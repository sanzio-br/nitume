# customer `v-price-auth` (web): price-change authorisation dialog

- Issue #8. Not a route: a blocking dialog (K§4.8, `dismissible: false`) opened by the customer shell (S, "App-level behaviour") over whatever customer page is open. Shared #8 rules: `customer-x-awaiting-quote.md` §A (A§n). Kit `ui-kit.md` (K§n).
- Sources:
  - mobile spec `docs/specs/customer/v-price-auth.md` (matches-design);
  - Flutter `apps/customer_app/lib/src/screens/checkout/price_change_dialog.dart` and the listener in `screens/shell/home_shell.dart` (`_onLivePrice`, `_checkPendingPriceChange`);
  - mockup `docs/design/nitume_customer_app.html` lines 423–441 (`#v-price-auth`);
  - OA-8, OA-13; rows 23, 37, 38, 40, 44, 48, 49, 54, 55, 61, 67, 82, 86; WQ-3 (dialogs 335px); WQ-27;
  - API `apps/api/src/matching/price-change.{controller,service}.ts` on `origin/main` @ `380be22`.
- Implementation: none. Status: **missing**.
- Files (A§8): `app-area/customer/checkout/price-change-dialog.component.{ts,html,scss}` and `price-change.watcher.ts`.
- **Updated 2026-10-29**: aligned with #7 (`app-area/customer/`, `CustomerErrandsApi.list()`, `apiErrorOf`, `customerLinks.itemPayment`); WQ-27 cited; since #28 the approve decision's `merchantPayment` numbers are null for a customer until the fees are paid (never rendered here in any case).

## Purpose
The runner found the item priced differently from the agreed item amount. The customer approves the new amount or rejects it, which cancels the task (OA-8). Increase: the difference is paid through the original item route (row 44). Decrease: the item amount goes down; on `send_to_runner` the difference goes to an admin refund review; on `merchant_direct` the customer simply pays the merchant less (rows 48, 86).

## Presentation (OA-8, WQ-3)
`NmDialogService.open(PriceChangeDialogComponent, { dismissible: false, data: { errand, request? } })`: scrim `--nitume-scrim` (blue at 50%, row 38), white card r-l 20px, padding 20px, **max-width 335px at every width** (WQ-3), title `Price change` as the dialog `h2`. Scrim click and Escape do nothing. The mockup's pushed header becomes the dialog title.
- Web adaptation: the dialog is attached to the application (not to a route), so in-app navigation and browser Back behind it do not close it; only an answer, `OK` or `Close` closes it. The page behind is `inert`.

## Entry / exit
- Opened by `CustomerPriceChangeWatcher` (NEW #8, `price-change.watcher.ts`; port of `home_shell.dart`). It is provided on the customer shell route in `customer.routes.ts` (the `path: ''` route with `AppShellPage`): `providers: [CustomerPriceChangeWatcher, provideEnvironmentInitializer(() => inject(CustomerPriceChangeWatcher).start())]`. So it runs only for signed-in customers inside the shell, never on marketing pages, never in `app.config.ts`, and never for runners (the runner route tree and `AppShellPage` are unchanged). Sign-out is a full reload (F§4.5), which ends it. The visibility listener is added through `DOCUMENT.addEventListener('visibilitychange', …)` and removed on `DestroyRef`. Behaviour:
  - Live: `RealtimeService.priceChangeRequests$` (`price_change:requested`, row 23) for an errand room the tab has joined → `GET /errands/:id`; if IN_PROGRESS → `GET …/price-change?status=requested`; pending → open the dialog with that request.
  - "Resume" (web adaptation of the app's resume check): on shell start (first render after sign-in or a reload) and on every `document.visibilitychange` to `visible` → `CustomerErrandsApi.list(['IN_PROGRESS'], 20)` (#7; the app's `errands.list(statuses: {inProgress})`), and for each errand `GET …/price-change?status=requested`; open the dialog for the first pending one.
  - Single-flight: never two price-change dialogs at once; a check while one runs or while the dialog is open is skipped. Failures are silent (Track also shows the request).
- Also opened from Track's `Price change` button (#9), the notification row (#11) and a push deep link (Track for the errand, then the dialog), each with the errand (and the request when known).
- Note on rooms: the server sends `price_change:requested` only to `errand:{id}` rooms. The tab receives it only for errands it has joined (Track, Task detail, the #8 pages). The resume check covers every other case. This is the same coverage as the app (its listener also hears only joined rooms).
- Exits:
  - Approve success → close; toast `Price change approved.` or, when the decision has `refundReview`, `Price change approved. We'll review a refund of the difference.`; then, when `decision.differencePayment?.merchantPayment` is not null, navigate to `customerLinks.itemPayment(errandId)` with navigation state `{ approvedIncrease: differencePayment.payment.merchantAmount, priceChangeRequestId: decision.id }` (variant A for `merchant_direct`, variant B STK for `send_to_runner`).
  - Reject → second confirm → success → close both; the errand is CANCELLED (the page behind refreshes through `errand:status_changed`; Track shows the cancelled card).
  - `OK` / `Close` (answered / load failure) → close; the caller refreshes.
  - No `Not now` (the runner is waiting).

## Task states
IN_PROGRESS only (row 49). Approve keeps the state. Reject → CANCELLED through the guarded IN_PROGRESS → CANCELLED (customer, rows 37, 56), with an admin refund review. Opened for an errand that is not IN_PROGRESS → the already-answered state.

## Layout (dialog content, top to bottom)
1. Title `Price change` (`dialog-title` 17/600 blue). 8px.
2. Body (dialog `body`, 13.5 slate-600): the explanation. If the request has a non-blank `reason`: 6px, the reason in quotes, 13 blue Sans.
3. Compare row (projected content): margin 14px 0, padding 16px 0, 1px slate-line hairlines top and bottom. Two equal centred columns with an `→` (slate-400, `aria-hidden`) between them:
   - `Original`: label 11 slate-600 Sans; 4px; value `formatAmount(fromPrice)` in `nmNum` Code 19 **blue**.
   - `New price`: label 11 slate-600; value `formatAmount(toPrice)` in `nmNum` Code 19 **amber** (`--nitume-amber`, OA-13 price-change accent).
   - Each value's accessible name `Original KSh 40,000` / `New price KSh 45,000`.
4. Difference line, centred, `nmNum` Code 13/600 **amber**: increase `+ KSh 5,000 additional` (`formatKes(diff, { signed: true })` + ` additional`); decrease `− KSh 5,000 less` (U+2212, then `formatKes(abs)` + ` less`).
5. Only after approve answered `merchant_route_required` / `merchant_details_missing` (row 61): 16px, label `How should this be paid?` (`card-label`, 11/700 uppercase via CSS), 8px, `nm-merchant-route-rows` (A§8; same copy and enabled/disabled rules as the checkout; nothing preselected; disabled while a call runs).
6. Actions, full width, gap 10 (dialog action stack): primary approve, outline destructive `Reject & cancel task` (red label, OA-13).
7. Inline error (dialog `error` slot, 12.5 red, `role="alert"`) under the actions.

## Copy (exact; increase from the mockup, the rest as built from the mobile spec)
- Title: `Price change`.
- Increase body (mockup): `Brian K. found the item priced higher than quoted. Approve the difference to continue?` — `Brian K.` = `errand.assignment.runner.shortName` exactly as returned (row 40); none → `Your runner`.
- Decrease body: `Brian K. found the item priced lower than quoted. Approve the new price to continue?`
- Labels `Original`, `New price`; values `40,000` → `45,000` (no currency prefix, as drawn).
- Difference: `+ KSh 5,000 additional` / `− KSh 5,000 less`.
- Approve: `Approve KSh 5,000 increase` (amount in `nmNum`) / `Approve new price`.
- Reject: `Reject & cancel task`.
- Reject confirm (`NmDialogService.confirm`, `destructive: true`, `dismissible: false`, stacked above this dialog): title `Reject and cancel this task?`; body `The runner will stop work on this task. We'll review a refund of what you've paid, and you can follow it on the task.`; confirm `Reject & cancel` (outline, red); cancel `Go back` (primary).
- Toasts: `Price change approved.`; `Price change approved. We'll review a refund of the difference.`
- Already answered: body `This price change was already answered.`, single primary `OK`.
- Load failure: body `Couldn't load this price change.`, primary `Try again`, outline `Close`.
- Error: `Couldn't send your answer. Try again.`

## States
| State | Behaviour |
|---|---|
| Loading (no request passed in) | Title + one `nm-skeleton-card` in the content; no actions |
| Load failure | Copy above; `Try again` reloads, `Close` closes |
| Ready, increase / decrease | §Layout; decrease when `toPrice < fromPrice` (decimal-string compare) |
| Approving | Approve `loading`, both actions disabled; `POST …/approve { merchantRoute? }` (route only once the customer picked one; the client never picks) |
| Route needed | `merchant_route_required` / `merchant_details_missing` → route rows shown, approve disabled until a row is selected; approve again sends `{ merchantRoute }` |
| Rejecting | Confirm first; then reject `loading`, both disabled; `POST …/reject` |
| Already answered | Request no longer `requested`, errand not IN_PROGRESS, `price_change_already_decided`, `price_change_not_in_progress`, `price_change_not_allowed`, or any other 409 except `price_change_reject_not_cancellable` (row 55: an admin rejection also lands here) |
| Error | `price_change_reject_not_cancellable`, network, 5xx → inline error, actions enabled again |
| Errand cancelled behind it | `errand:status_changed` to CANCELLED for this errand while open → switch to the already-answered state. The dialog does not join a room itself; it hears the event when the page behind holds the room (Track, Task detail, the #8 pages). Otherwise an answer returns `price_change_already_decided` / `price_change_not_in_progress` and lands in the same state |

## Numeric fields (Fira Code)
Original and new price; the difference line; the amount inside the approve button.

## Data
- Read: `GET /errands/:errandId/price-change?status=requested` → first item (A§5 `PriceChangeRequest`; prices are decimal strings).
- Approve: `POST /errands/:errandId/price-change/:requestId/approve { merchantRoute? }` → `PriceChangeDecision` (`differencePayment`, `refundReview`).
- Reject: `POST /errands/:errandId/price-change/:requestId/reject` → `PriceChangeDecision` (errand CANCELLED in the same transaction; refund review for a paid task).
- Watcher: `GET /errands?status=IN_PROGRESS`, `GET /errands/:id`; socket `price_change:requested` (`{ errandId, requestId, fromPrice, toPrice, reason, createdAt }`), `errand:status_changed`. A§6 error table.
- Money: item amount only, never fees (OA-8, A§4, WQ-27). The difference is `subtractKes(toPrice, fromPrice)`, and increase vs decrease is `compareKes` (A§4; never floating point). No wallet or escrow words.
- API note (not blocking): the API still accepts new requests from QUOTED to IN_PROGRESS for admins (`PRICE_CHANGEABLE`); runners are limited to IN_PROGRESS (row 49). The web shows the dialog only for IN_PROGRESS errands.

## Accessibility and responsive
- `role="dialog"`, `aria-modal`, labelled by the title (`aria-labelledby`); focus to the title on open, trapped, returned to the opener on close (K§4.8).
- **No `aria-describedby` (re-audit 1 ruling).** WCAG 2.2 does not require a dialog description. 4.1.2 needs a name and role (the title gives the name), and 1.3.1 is met because the body is real text in reading order right after the focused title. The WAI-ARIA Authoring Practices treat `aria-describedby` on a dialog as optional and advise omitting it when the content has structure (lists, buttons, radio groups), because a screen reader would flatten it into one string. This dialog's content changes by state (loading, load failure, ready with the compare row, route radios and two buttons, already answered). So the dialog is labelled only, as the kit dialog does for any projected content, and no kit change is needed. (The kit's `body` description stays for the static `confirm()` dialogs, which are `alertdialog`s.) The stacked confirm takes focus and returns it to `Reject & cancel task` on `Go back`.
- Actions full width, ≥ 48px.
- Amber text (`--nitume-amber` on white ≈ 3.4:1) is below AA for the 13/600 difference line; OA-13 allows amber price text (mobile spec). Each amount also has the plain accessible name above.
- 335px max width at every viewport; at 360px the card is 320px wide; the route rows wrap their subtitles.

## Required tests (Vitest; cited as PA Tn)
1. Increase copy exactly as the mockup with runner short name; missing short name → `Your runner`; reason shown in quotes when present.
2. Decrease copy, `− KSh 5,000 less` with U+2212, `Approve new price`.
3. Compare values in `nmNum` (blue for Original, amber token for New price and the difference line); no currency prefix on the two values.
4. Dialog is not dismissible: scrim click and Escape keep it open; a router navigation behind it does not close it.
5. **Approve increase** (`send_to_runner`): `POST …/approve` with no body route; decision with `differencePayment.merchantPayment` → toast `Price change approved.` and navigation to `…/item-payment` with `approvedIncrease` and `priceChangeRequestId`.
6. **Approve decrease** with `refundReview` → refund toast, no navigation; without → `Price change approved.`, no navigation.
7. **Route required**: approve answers `merchant_route_required` (and, separately, `merchant_details_missing`) → route rows shown, nothing preselected, approve disabled; selecting `Send purchase amount to runner` then approve sends `{ merchantRoute: 'send_to_runner' }`; merchant-direct disabled when `merchantDetailsAvailable` is false.
8. **Reject**: confirm dialog with exact copy stacked above; `Go back` → no request, focus back; confirm → `POST …/reject`, both dialogs close.
9. Already answered for `price_change_already_decided`, `price_change_not_in_progress`, a non-IN_PROGRESS errand, and an empty pending list; `OK` closes.
10. `price_change_reject_not_cancellable` and a network error → inline `Couldn't send your answer. Try again.`, actions re-enabled.
11. Load failure → copy, `Try again` reloads, `Close` closes.
12. Watcher: a fake `price_change:requested` for an IN_PROGRESS errand opens one dialog; a second event while open opens nothing; an event for a non-IN_PROGRESS errand opens nothing.
13. Watcher resume: on shell start and on `visibilitychange` → visible it lists IN_PROGRESS errands and opens the first pending request; listing failure is silent.
14. **WQ-27**: amounts are item amounts only: no fee text and no fee figure appear in the dialog; the difference comes from `subtractKes` (`'45000.00'` − `'40000.00'` → `+ KSh 5,000 additional`; `'40000.50'` − `'40000.00'` → `+ KSh 0.50 additional`).
15. Watcher placement: the watcher is provided only on the customer shell route; a runner shell and a marketing page start no watcher; listing failures are silent (no toast).

## Current vs design
Not built. The Flutter dialog is the reference (`matches-design`). Web differences: "resume" = shell start + tab becoming visible (the app checks on app resume); the dialog survives in-app navigation behind it.
