# Admin ops re-audit, round 1 (addendum to `admin-gap-report.md`)

- Branch `feat/admin-ops`, HEAD `3c5953e` (web-parity commits `06f2bcc`, `1870b6e`, `5a64c32`, `9fe4563`, `72da255`, `edacaa2`, `5534160`, `ec6444c`, `3c5953e` after the gap report `e841db5`).
- Mode B, against `docs/specs/admin/*.md`, the mockup and the design system. Entry numbers G-n refer to `docs/audits/admin-gap-report.md`.
- Build health (run on a clean `git archive` of HEAD using the main checkout's `node_modules`, so the worktree was not touched): `ng build` succeeds with no warnings; `ng test --watch=false` passes all 98 tests in 15 files.
- Token scan: there are no hex values outside `styles/_tokens.scss`. There are no `font-family` declarations in `.ts` files and no `console.*` calls in `app/` (outside specs). Wallet, escrow, balance, held, release and credit wording does not appear anywhere. The legacy classes `.btn-verdict`, `.dispute-result`, `.ops-banner`, `.drawer-textarea`, `.drawer-modal` and `.modal-*` are all gone.
- Rule used here: an entry that waits on unmerged API work (N-x on `feat/api-owner-answers-3`) and has the spec fallback in place counts as PASS. Minor findings (m-n) are not blocking and are listed for the next touch of each file.

## Verdict summary

| View | Verdict |
|---|---|
| p-refunds | PASS |
| drawer-refund | PASS |
| drawer-task-merchant-details | PASS |
| drawer-task-requote | PASS |
| drawer-dispute-outcome | PASS |
| drawer-task (bug scope G-15..G-18, G-28, G-29) | PASS |
| drawer-dispute (bug scope G-19..G-23) | PASS |

There are no blockers. Five minor findings and two spec amendments follow.

## Per entry

| G | Verdict | Evidence / note |
|---|---|---|
| G-1 p-refunds | PASS | `panels/refunds.panel.ts`. The columns, filter order, default `Needs review`, sub-line with `+`, the five empty states, loading and error with `Try again`, Load-more error, row button labels and `aria-label`s, row patch plus reload after a drawer save, and hiding columns below 1100px and 900px (`_ops.scss` 1536–1545) all match the spec. The nav item sits under Network after Disputes, with a `99+` badge. Waiting on API: N-1 (task title falls back to the last-100 window with no per-row calls) and N-7 (on a 404 from `/refunds/count`, the badge falls back to counting a `limit=100` page). |
| G-2 drawer-refund | PASS | `drawers/refund-drawer.ts`. The four states, summary, the three paid flows plus the merchant-direct caption, the decision form (`KSh` prefix, Fira Code value, quick-fill buttons, `0/1000` counter, button label that follows the amount), the payout form (upper-cased receipt validated with `^[A-Za-z0-9-]{4,64}$`), the read-only views, Activity, the A-08 dialogs with spec copy, the discard guard, and every error code in the spec table are all present. Waiting on API: N-1 (breakdown and phone fallback captions present) and N-2 (masked id, or `You`). See SA-1. |
| G-3 refund link | PASS | `drawers/refund-link.section.ts`. It uses `GET /errands/:id/refunds` and falls back to the single `/refund` endpoint (N-3), one row per review, and opens through `DrawerNavService` without importing the shell. It is shown for CANCELLED only, as the spec says. See SA-2. |
| G-4 merchant details | PASS | `drawers/merchant-details.section.ts`. Visibility follows the AQ-4 default, and the read-only list is exactly `SETTLED`/`CANCELLED`/`FAILED`/`EXPIRED`. It has the A-09 toggle, `inputmode="numeric"` with `pattern="\d*"`, request bodies that never send both numbers, the A-08 warning from PAYMENT_CONFIRMED on, notices, and error mapping including `errand_closed`. |
| G-5 re-quote | PASS | `drawers/quote.section.ts` and `quote-dialog.ts`. The expiry rule matches the API (`expiresAt <= now`, null never expires), re-checked every 30 s, with the `Quote expired` flag chip and the breakdown disclosure. `Issue new quote` shows for QUOTED with an expired quote, and for ACCEPTED only when the API exposes row 72 (`quoteAcceptanceRequired`); otherwise the spec's ACCEPTED hint shows. The dialog is prefilled, `Valid until` is required (AQ-R2 default), and the timezone hint, `0/500` counter and `quote_still_valid` / 409 / 400 / 5xx handling are present. Waiting on API: N-5 (queue flag only when `quoteExpiresAt` is present) and N-4 (server only). |
| G-6 dispute outcome | PASS | `drawers/dispute-drawer.ts`. The title is `Dispute #NT-XXXXX`, and the drawer has the `Resolution` label, explainer, placeholder, hint (AQ-3 default), `0/2000` counter, and the outline `Side with runner` / primary `Side with customer` buttons (AQ-2 default), gated at 20 characters with `aria-describedby`. It has both A-08 confirms, an Outcome built from the response or from the history row that left DISPUTED, the refund lookup giving the three notices, and the 409 reload. Waiting on API: N-6 (server only) and N-8 (falls back to status 409 when there is no code). |
| G-7 A-02 `kind` | PASS | `shared/status-chip.component.ts:78-90`, `:97`, `:110-141`. Each kind has its own vocabulary, refund labels follow §6, a `label`/`tone` override exists for flag chips, and every existing call site passes its kind. |
| G-8 A-06 | PASS | `shared/form-field.component.ts` and `styles.scss` 205–255. `app-form-field` plus the `appFieldControl` directive wire `aria-describedby`, `aria-invalid` and `.is-invalid`. `.field-hint`, `.field-error`, `.field-counter` and the `KSh` prefix are in place. |
| G-9 A-08 | PASS | `shared/confirm-dialog.component.ts`. Scrim at z-index 120 over the drawer's 100, card max-width 360 (440 in form mode), Back gets focus first, `[data-autofocus]` works in form mode, Tab is trapped, ESC acts as Back without closing the drawer, and `busy` blocks dismissal. |
| G-10 A-09 | PASS | `shared/segmented-toggle.component.ts`. Radiogroup with roving tabindex, arrow/Home/End keys, green active segment with white text, and a 2px green focus ring. |
| G-11 A-11 | PASS | `shared/inline-notice.component.ts`. A chip-size accent followed by 13px blue text, `role="alert"` for danger and `role="status"` otherwise, auto-dismiss and an action slot. `.ops-banner` is replaced (`admin-dashboard.component.ts`, `.ops-sync-notice`). |
| G-12 A-13 | PASS | `features/admin/shared-format.ts:23-120` provides `formatKshExact` (no rounding), `parseKsh`, `formatDateTime` (East Africa Time, Today/Yesterday) and the datetime-local EAT helpers. The dispute drawer's copy of the formatter is removed. |
| G-13 A-14 | PASS | `core/api-error.ts`. Store methods throw `ApiErrorInfo`, `detailError` and the sync error are user copy, and `HttpErrorResponse.message` is never rendered. The verification panel uses A-11 instead of console logging. |
| G-14 A-10 / A-12 | PASS | `shared/load-more.component.ts` with `.pagination`, used by refunds and verifications. |
| G-15 quote modal | PASS | `QuoteErrandDto` sends numbers, empty components and Currency are left out, `expiresAt` carries `+03:00`, `QuoteErrandResult` is read correctly, and errors go to notices. Covered by `quote.spec.ts`. |
| G-16 Assign gating | PASS | `task-drawer.ts:21-23` (`taskActions`). The queue row shows `Assign` only at PAYMENT_CONFIRMED (`task-queue.panel.ts` `rowAction`). Covered by `task-drawer.spec.ts`. |
| G-17 assign modal | PASS | Runs through A-08 form mode with A-06 fields, `AssignErrandResult` is read correctly, `busy` shows as `On task`, and errors go to notices. The faulty handler is removed. |
| G-18 unstyled modal / `.btn` | PASS | Every button has the `.btn` base, including `disputes.panel.ts:41` and `verifications.panel.ts`. |
| G-19 amber button | PASS | `.btn-verdict*` is deleted. The buttons are outline and primary. |
| G-20 20-character rule | PASS | `dispute-drawer.ts:19-28`, `:202-241`. |
| G-21 false "resolved" | PASS | The drawer is driven by `s.detail()`, the outcome is shown only from a response or history, and the form and note are kept on failure. Covered by `dispute-drawer.spec.ts`. |
| G-22 claim | PASS | The claim is the dispute `reason` under `Customer's claim`, and `Opened` uses the dispute's `createdAt`. |
| G-23 stale comments | PASS | No `CONFIRMED` verdict wording remains. |
| G-24 tests | PASS | 98 tests in 15 files cover every item in the G-24 list. |
| G-25 token logging | PASS | `core/auth/auth.service.ts`: all three logs removed (`06f2bcc`). |
| G-26 login debug logs | PASS | Removed. |
| G-27 Business Tasks | PASS | `admin-data.service.ts:37`. |
| G-28 Fira Code on text | PASS | `.drawer-row b.txt` and `.val-text` / `.val-muted` (`_ops.scss` 868–878) are used for text values. One remaining slip is m-1. |
| G-29 deadline | PASS | `task-drawer.ts:87` uses `formatDateTime`. |
| G-30 hex outside tokens | PASS | Named shell tones are in `_tokens.scss` 24–28. |
| G-31 disputes panel chips | not in this round | Left as recorded in the gap report (record-only, pending a `p-disputes` parity audit). |

## Minor findings (not blocking)

1. **m-1, typography.** The muted line in the drawer summary marks the whole string `Opened {date}` as numeric, so the word "Opened" renders in Fira Code. Location: `drawers/refund-drawer.ts:497`. Fix: push `Opened ` as text and the date/time as a separate numeric part, or render the line with `app-num-text`.
2. **m-2, accessibility.** When the drawer opens on `no_refund` or `refunded` (no input on screen), focus is not moved to the close button as the spec's Accessibility section asks. Location: `drawers/refund-drawer.ts:586-588`. Fix: fall back to the drawer close button.
3. **m-3, copy tone.** A 404 on the task or dispute detail shows `This task no longer exists.` in a danger notice with `Try again`. Specs (`drawer-task-merchant-details.md`, `drawer-dispute-outcome.md` error tables) use the info tone without a retry for 404. Location: `admin-data.service.ts:307`, rendered at `task-drawer.ts:48-54` and `dispute-drawer.ts:70-76`. Fix: carry the tone with `detailError` and hide `Try again` on 404.
4. **m-4, order.** The result notice renders above the Outcome card, while the spec lists the card first and then the notice. Location: `dispute-drawer.ts:145-182`. This is cosmetic: move the notice under the card.
5. **m-5, styles.** `.row-assign` is declared twice. Location: `_ops.scss:508` and `:520`. Fix: merge `min-height: 32px` into the first block.

## Rulings on the deviations web-parity flagged

1. **Total row shows `paid.totalPaidToNitume`, not `amountPaid`.** **Accepted.** On round 3, `amountPaid` is the review's refund ceiling. That equals the total for a cancellation but is only the decrease for a `price_change_decrease` review (API `refunds.service.ts`: "`amountPaid` = the decrease, the refund ceiling"). The "What the customer paid" card should show what was paid, so `totalPaidToNitume` is right there. The ceiling is already enforced (validation and the 400 mapping use `amountPaid`) and shown in the field hint. **Spec amendment SA-1, for the next spec pass; not blocking:**
   - In `drawer-refund`, when `paid` is present and `amountPaid` ≠ `paid.totalPaidToNitume`, add a row under the total, `Refundable in this review` → `amountPaid` (Fira Code). Without `paid`, keep the single total row (the fallback is unchanged).
   - In `p-refunds`, rename the column header `Paid to Nitume` to `Refundable`. It shows `amountPaid`, which for decrease rows is not what was paid. Copy is proposed, so no owner question is needed.
2. **Refund link only on CANCELLED tasks.** **Accepted for this round.** It matches the spec as written, and every review stays reachable from the Refunds panel and its badge. **Spec amendment SA-2, a follow-up once `GET /errands/:id/refunds` is on main:** show the Refund section for any task from PAYMENT_CONFIRMED on that has reviews. That endpoint never returns 404, so it costs one call per drawer open. Until then, keep CANCELLED only, because on api-2 the single `/refund` call would add a 404 for every non-cancelled open.
3. **Additions beyond the spec.**
   - **`level` chip kind: accepted.** Splitting kinds needed a vocabulary for the existing verification-level chips. It is in the shared layer, with no new colours (info tone).
   - **Queue sorts expired quotes first: in spec, not an addition.** `drawer-task-requote.md` Data says "show `Quote expired` under the `Quoted` chip and sort those first". It applies only when `quoteExpiresAt` is present (N-5); otherwise the API order is kept.
   - **`app-num-text`: accepted** as a shared helper for the Fira Code rule on mixed copy (notices, dialog titles). It relies on a regex, so new copy should be checked to confirm plain words are not matched (see m-1 for a related slip done by hand).
   - **Assign notice copy: accepted as proposed copy.** The texts are `Runner assigned.`, `That runner or task no longer exists.` and `Couldn't assign the runner. Try again.`. No spec covers the assign dialog. The wording follows the pattern of the other notices and contains no forbidden words. I will add it to a spec when `p-queue` / `drawer-task` get a full parity spec.

## Not covered by this round

- The full mockup parity of `drawer-task` (the mockup's `Payment` card with `Service fee` / `Runner fee` / `Merchant amount` / `Total` is still not built) and of `drawer-dispute` (`Evidence on file`). Both were out of the five specs. SCREEN_MAP marks these two `built`, not `matches-design`, until a parity audit.
- Owner questions in BOARD rows 77–83 remain open. The build uses the spec defaults throughout, and none was decided in code.
