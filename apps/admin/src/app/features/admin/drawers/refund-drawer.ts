import { NumTextComponent } from '../../../shared/num-text.component';
import {
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { apiError, ApiErrorInfo, FORBIDDEN_COPY } from '../../../core/api-error';
import type { RefundDetail, RefundReview } from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { AdminDataService, categoryLabel, shortId } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import {
  adminLabel,
  effectivePayout,
  refundChipStatus,
  refundTriggerLabel,
  reviewCeiling,
} from '../refund-labels';
import { PayoutCorrectionCardComponent } from '../payouts/payout-correction-card';
import { CurrentPayoutCardComponent } from '../payouts/current-payout-card';
import {
  CORRECTION_SUBMIT,
  CorrectionForm,
  REFUND_CORRECTION_COPY,
  correctionBody,
  correctionCeilingError,
  correctionDialogParts,
  correctionDialogTitle,
  correctionKindLabel,
} from '../payouts/payout-correction';
import { TaskExposureCardComponent } from '../payouts/task-exposure-card';
import { ExposureOverrideFieldComponent } from '../payouts/exposure-override-field';
import { ExposureOverrideState, OVERRIDE_CONFIRM_NOTE } from '../payouts/task-exposure';
import {
  CorrectionFormState,
  PayoutCorrectionFormComponent,
} from '../payouts/payout-correction-form';
import {
  formatDateTime,
  formatKshExact,
  formatPhone,
  isBlank,
  parseKsh,
  plainAmount,
} from '../shared-format';

export { formatPhone } from '../shared-format';

export const AMOUNT_REQUIRED = 'Enter a refund amount, or KSh 0 for no refund.';
export const AMOUNT_FORMAT = 'Enter an amount in KSh, up to 2 decimal places.';
export const RECEIPT_ERROR = 'Enter the M-Pesa receipt code, letters and numbers only.';
const RECEIPT_PATTERN = /^[A-Za-z0-9-]{4,64}$/;

export function ceilingError(ceiling: string | number | null): string {
  return `The refund can't be more than the ${formatKshExact(ceiling)} refundable in this review.`;
}

/**
 * Refund amount rule (mirrors `DecideRefundDto` + `RefundsService.decide`).
 * `ceiling` is the review's refund ceiling (rows 81, 87).
 */
export function validateRefundAmount(input: string, ceiling: string | number): string | null {
  if (isBlank(input)) return AMOUNT_REQUIRED;
  const value = parseKsh(input);
  if (value === null) return AMOUNT_FORMAT;
  if (value > Number(ceiling)) return ceilingError(ceiling);
  return null;
}

/** Refunds already approved or sent on the task's other reviews (row 87, the API figure). */
export function alreadyRefunded(r: Pick<RefundDetail, 'alreadyRefunded'>): number {
  return Number(r.alreadyRefunded);
}

export function validateReceipt(input: string): string | null {
  return RECEIPT_PATTERN.test(input.trim()) ? null : RECEIPT_ERROR;
}

/** The decision button follows the amount. */
export function decisionLabel(input: string, amountPaid: string | number): string {
  if (validateRefundAmount(input, amountPaid) !== null) return 'Approve refund';
  const value = parseKsh(input)!;
  return value > 0 ? `Approve refund · ${formatKshExact(value)}` : 'Close with no refund';
}

type Dialog =
  'approve' | 'no_refund' | 'mark_paid' | 'discard' | 'correction' | 'correction_discard' | null;

/**
 * Refund review drawer (rows 37, 54): decide the amount (KSh 0 up to what
 * the customer paid Nitume), then record the manual M-Pesa payout. A refund
 * is a record on a CANCELLED task, not a task state.
 */
@Component({
  selector: 'app-refund-drawer',
  imports: [
    NumTextComponent,
    StatusChipComponent,
    InlineNoticeComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    PayoutCorrectionCardComponent,
    PayoutCorrectionFormComponent,
    CurrentPayoutCardComponent,
    TaskExposureCardComponent,
    ExposureOverrideFieldComponent,
  ],
  template: `
    @if (loading()) {
      <div class="ops-loading">Loading refund review…</div>
    } @else if (loadError(); as le) {
      <app-inline-notice [tone]="le.tone">
        {{ le.text }}
        @if (le.tone === 'danger') {
          <button notice-action type="button" class="btn btn-outline btn-sm" (click)="load()">
            Try again
          </button>
        }
      </app-inline-notice>
    } @else if (review(); as r) {
      @if (notice(); as n) {
        <app-inline-notice
          [tone]="n.tone"
          [dismissible]="true"
          [autoDismissMs]="n.tone === 'success' ? 6000 : 0"
          (dismissed)="notice.set(null)"
          ><app-num-text [text]="n.text"
        /></app-inline-notice>
      }

      <!-- 1. Summary -->
      <section class="drawer-section">
        <app-status-chip [status]="chipStatus(r)" kind="refund" />
        <h3 class="drawer-summary-title">{{ taskTitle() }}</h3>
        <div class="drawer-muted">
          @for (part of mutedParts(); track $index; let last = $last) {
            @if (part.num) {
              {{ part.prefix }}<span class="num">{{ part.text }}</span>
            } @else {
              {{ part.text }}
            }
            @if (!last) {
              ·
            }
          }
        </div>
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Task</span>
            <span class="row-inline">
              <b>{{ shortId(r.errandId) }}</b>
              <button type="button" class="btn btn-text btn-sm" (click)="openTask()">
                Open task
              </button>
            </span>
          </div>
          @if (taskStatus(); as ts) {
            <div class="drawer-row"><span>Task status</span><app-status-chip [status]="ts" /></div>
          }
          <div class="drawer-row">
            <span>Reason</span><b class="txt">{{ triggerLabel(r.trigger) }}</b>
          </div>
        </div>
      </section>

      <!-- 2. What was paid (three flows kept apart) -->
      <section class="drawer-section">
        <div class="drawer-label">What the customer paid</div>
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Service + runner fee</span><b>{{ formatKshExact(r.paid.serviceAndRunnerFee) }}</b>
          </div>
          @if (positive(r.paid.itemAmountToNitume)) {
            <div class="drawer-row">
              <span>Item amount (paid to Nitume)</span
              ><b>{{ formatKshExact(r.paid.itemAmountToNitume) }}</b>
            </div>
          }
          @if (positive(r.paid.priceChangeDifferences)) {
            <div class="drawer-row">
              <span>Price change difference</span
              ><b>{{ formatKshExact(r.paid.priceChangeDifferences) }}</b>
            </div>
          }
          <div class="drawer-row drawer-row-total">
            <span>Total paid to Nitume</span><b>{{ formatKshExact(r.paid.totalPaidToNitume) }}</b>
          </div>
          @if (refunded() > 0) {
            <div class="drawer-row">
              <span>Already refunded on this task</span><b>{{ formatKshExact(refunded()) }}</b>
            </div>
          }
          @if (differs(ceiling(), r.paid.totalPaidToNitume)) {
            <!-- SA-1: this review's ceiling (e.g. a price decrease) is not the total paid. -->
            <div class="drawer-row drawer-row-strong">
              <span>Refundable in this review</span><b>{{ formatKshExact(ceiling()) }}</b>
            </div>
          }
          <div class="drawer-row">
            <span>Refund to</span>
            @if (phone(); as ph) {
              <b>{{ formatPhone(ph) }}</b>
            } @else {
              <span class="val-muted">Customer's M-Pesa number not available</span>
            }
          </div>
        </div>
        @if (positive(r.paid.merchantDirectAmount)) {
          <div class="drawer-caption">
            The item amount (<span class="num">{{
              formatKshExact(r.paid.merchantDirectAmount)
            }}</span
            >) was paid straight to the merchant. Nitume didn't collect it, so it isn't part of this
            refund.
          </div>
        }
      </section>

      <!-- Row 136: customer refunds and the runner's item reimbursement share one cap. -->
      @if (r.taskExposure; as te) {
        <app-task-exposure-card
          [exposure]="te"
          [overrides]="r.exposureOverrides ?? []"
          [meId]="meId()"
          [hideZeroReimbursements]="true"
        />
      }

      <!-- 3. Decision -->
      <section class="drawer-section">
        <div class="drawer-label">Decision</div>
        @if (r.status === 'pending_review') {
          <div class="drawer-card drawer-stack">
            <app-form-field
              label="Refund amount"
              prefix="KSh"
              [hint]="amountHint()"
              [error]="amountShown()"
            >
              <input
                #amountInput
                appFieldControl
                [numeric]="true"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                [value]="amount()"
                [disabled]="saving()"
                (input)="setAmount(val($event))"
                (blur)="amountTouched.set(true)"
              />
            </app-form-field>
            <div class="quick-fill">
              <button
                type="button"
                class="btn btn-outline btn-sm"
                [disabled]="saving()"
                (click)="setAmount(plain(ceiling()))"
              >
                Full refund
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                [disabled]="saving()"
                (click)="setAmount('0')"
              >
                No refund
              </button>
            </div>
            <app-form-field
              label="Note for the ops record (optional)"
              hint="Not shown to the customer."
              [counter]="note().length + '/1000'"
            >
              <textarea
                appFieldControl
                rows="3"
                maxlength="1000"
                [value]="note()"
                [disabled]="saving()"
                (input)="note.set(val($event))"
              ></textarea>
            </app-form-field>
            <app-exposure-override-field
              [state]="decisionOverride"
              [saving]="saving()"
              hint="Kept in the audit history. Not shown to the customer."
            />
            <div class="drawer-actions">
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!!amountError() || saving()"
                (click)="submitDecision()"
              >
                @if (amountValue(); as v) {
                  Approve refund{{ decisionOverride.active() ? ' over the cap' : '' }} ·
                  <span class="num">{{ formatKshExact(v) }}</span>
                } @else {
                  {{ decisionLabel(amount(), ceiling()) }}
                }
              </button>
            </div>
          </div>
        } @else {
          <div class="drawer-card">
            <div class="drawer-row">
              <span>Refund amount</span><b>{{ formatKshExact(r.refundAmount ?? 0) }}</b>
            </div>
            <div class="drawer-row">
              <span>Decided</span><b>{{ formatDateTime(r.decidedAt ?? null) }}</b>
            </div>
            <div class="drawer-row">
              <span>Decided by</span
              ><b class="txt">{{ adminName(r.decidedBy, r.decidedByUserId) }}</b>
            </div>
            @if (r.decisionNote) {
              <p class="drawer-note">{{ r.decisionNote }}</p>
            }
          </div>
        }
      </section>

      <!-- 4. Payout -->
      @if (r.status === 'approved') {
        <section class="drawer-section">
          <div class="drawer-label">Record the payout</div>
          <div class="drawer-card drawer-stack">
            <p class="drawer-instruction">
              Send <span class="num">{{ formatKshExact(r.refundAmount) }}</span> to the customer by
              M-Pesa, then enter the M-Pesa receipt here.
            </p>
            @if (!phone()) {
              <div class="drawer-caption">
                Find the customer's number from the task before you send.
              </div>
            }
            <app-form-field label="M-Pesa receipt" [error]="receiptShown()">
              <input
                #receiptInput
                appFieldControl
                [numeric]="true"
                class="is-upper"
                type="text"
                autocomplete="off"
                spellcheck="false"
                maxlength="64"
                placeholder="e.g. SLK4H7XQ2P"
                [value]="receipt()"
                [disabled]="saving()"
                (input)="setReceipt(val($event))"
                (blur)="receiptTouched.set(true)"
              />
            </app-form-field>
            <div class="drawer-actions">
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!!receiptError() || saving()"
                (click)="submitPayout()"
              >
                Mark as refunded
              </button>
            </div>
          </div>
        </section>
      } @else if (r.status === 'refunded') {
        @if (corrections().length > 0) {
          <!-- 5.1 Current payout: the original with its corrections applied (row 100). -->
          <app-current-payout-card
            [payout]="effective()"
            [chipStatus]="chipStatus(r)"
            chipKind="refund"
            [lastChanged]="corrections().at(-1)!.createdAt"
          />
        }
        <section class="drawer-section original-payout">
          <!-- The original payout never changes (rows 82, 100). -->
          <div class="drawer-label">
            {{ corrections().length > 0 ? 'Original payout' : 'Payout' }}
          </div>
          <div class="drawer-card">
            <div class="drawer-row">
              <span>Refund sent</span><b>{{ formatKshExact(r.refundAmount) }}</b>
            </div>
            <div class="drawer-row">
              <span>M-Pesa receipt</span><b>{{ r.payoutReference ?? '—' }}</b>
            </div>
            <div class="drawer-row">
              <span>Sent</span><b>{{ formatDateTime(r.paidAt ?? null) }}</b>
            </div>
            <div class="drawer-row">
              <span>Recorded by</span><b class="txt">{{ adminName(r.paidBy, r.paidByUserId) }}</b>
            </div>
          </div>
        </section>

        @if (corrections().length > 0) {
          <section class="drawer-section">
            <div class="drawer-label">Corrections</div>
            <div class="drawer-stack">
              @for (c of corrections(); track c.id) {
                <app-payout-correction-card [correction]="c" [meId]="meId()" />
              }
            </div>
          </section>
        }

        <!-- 5.3 The action: Record a correction, or the new payout form while reversed. -->
        <app-payout-correction-form
          [state]="correction"
          [saving]="saving()"
          [hasPhone]="!!phone()"
          [overCap]="correctionOverride.active()"
          [blocked]="!!correctionOverride.noteError()"
          (submitted)="submitCorrection()"
          (discardRequested)="dialog.set('correction_discard')"
        >
          <app-exposure-override-field
            [state]="correctionOverride"
            [saving]="saving()"
            hint="Kept in the audit history. Not shown to the customer."
          />
        </app-payout-correction-form>
      }

      <!-- 5. Activity -->
      <section class="drawer-section">
        <div class="drawer-label">Activity</div>
        <div class="drawer-card">
          <div class="drawer-timeline">
            <div class="dt-item">
              <b>Review opened</b>
              <span class="dt-time">{{ formatDateTime(r.createdAt) }}</span>
            </div>
            @if (r.decidedAt) {
              <div class="dt-item">
                @if (r.status === 'no_refund') {
                  <b>Closed with no refund</b>
                } @else {
                  <b
                    >Refund of
                    <span class="num">{{ formatKshExact(r.refundAmount) }}</span> approved</b
                  >
                }
                <span class="dt-time">{{ formatDateTime(r.decidedAt) }}</span>
              </div>
            }
            @if (r.paidAt) {
              <div class="dt-item">
                <b
                  >Refund sent · <span class="num">{{ r.payoutReference }}</span></b
                >
                <span class="dt-time">{{ formatDateTime(r.paidAt) }}</span>
              </div>
            }
            @for (c of corrections(); track c.id) {
              <div class="dt-item">
                <b
                  >{{ correctionKindLabel(c.kind) }} ·
                  <span class="num">{{
                    c.kind === 'corrected'
                      ? (c.newReference ?? formatKshExact(c.newAmount))
                      : c.newReference
                  }}</span></b
                >
                <span class="dt-time">{{ formatDateTime(c.createdAt) }}</span>
              </div>
            }
          </div>
        </div>
      </section>

      <app-confirm-dialog
        [open]="dialog() !== null"
        [title]="dialogTitle()"
        [confirmLabel]="dialogConfirm()"
        [busy]="saving()"
        (confirmed)="confirmDialog()"
        (cancelled)="cancelDialog()"
      >
        @switch (dialog()) {
          @case ('approve') {
            <p>
              The customer will be told a refund is on its way. You'll record the M-Pesa payout
              next. You can't change the amount after this.
            </p>
            @if (decisionOverride.active()) {
              <p>{{ overrideConfirmNote }}</p>
            }
          }
          @case ('no_refund') {
            <p>
              The customer will be told no refund is due for this task. You can't change this later.
            </p>
          }
          @case ('mark_paid') {
            <p>
              M-Pesa receipt <span class="num">{{ normalisedReceipt() }}</span
              >. The customer will be told the refund has been sent. This can't be undone.
            </p>
          }
          @case ('discard') {
            <p>The amount and note you entered will be lost.</p>
          }
          @case ('correction') {
            <p><app-num-text [parts]="correctionDialogParts()" /></p>
            @if (correctionOverride.active()) {
              <p>{{ overrideConfirmNote }}</p>
            }
          }
          @case ('correction_discard') {
            <p>What you entered will be lost.</p>
          }
        }
      </app-confirm-dialog>
    }
  `,
  styles: [],
})
export class RefundDrawerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly s = inject(AdminDataService);
  private readonly nav = inject(DrawerNavService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly reviewId = input.required<string>();

  readonly review = signal<RefundDetail | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<{ tone: NoticeTone; text: string } | null>(null);
  readonly notice = signal<{ tone: NoticeTone; text: string } | null>(null);
  readonly saving = signal(false);
  readonly dialog = signal<Dialog>(null);

  readonly amount = signal('');
  readonly amountTouched = signal(false);
  private readonly amountServerError = signal<string | null>(null);
  readonly note = signal('');
  readonly receipt = signal('');
  readonly receiptTouched = signal(false);
  private readonly receiptServerError = signal<string | null>(null);
  private pendingLeave: (() => void) | null = null;

  private readonly correctionFormRef = viewChild(PayoutCorrectionFormComponent);

  private readonly amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');
  private readonly receiptInput = viewChild<ElementRef<HTMLInputElement>>('receiptInput');

  /** The decision form's maximum (rows 81, 87). */
  protected readonly ceiling = computed(() => {
    const r = this.review();
    return r ? reviewCeiling(r) : '0';
  });
  protected readonly refunded = computed(() => {
    const r = this.review();
    return r ? alreadyRefunded(r) : 0;
  });

  readonly amountError = computed(() => {
    const r = this.review();
    return r ? validateRefundAmount(this.amount(), this.ceiling()) : AMOUNT_REQUIRED;
  });
  protected readonly amountShown = computed(
    () => this.amountServerError() ?? (this.amountTouched() ? this.amountError() : null),
  );
  /** Valid amount > 0 (drives the button's Fira Code amount), else null. */
  protected readonly amountValue = computed(() => {
    if (this.amountError()) return null;
    const v = parseKsh(this.amount());
    return v && v > 0 ? v : null;
  });
  readonly receiptError = computed(() => validateReceipt(this.receipt()));
  protected readonly receiptShown = computed(
    () => this.receiptServerError() ?? (this.receiptTouched() ? this.receiptError() : null),
  );
  protected readonly normalisedReceipt = computed(() => this.receipt().trim().toUpperCase());

  protected readonly amountHint = computed(() => {
    const r = this.review();
    return r
      ? `Between KSh 0 and ${formatKshExact(this.ceiling())}. KSh 0 closes the review with no refund.`
      : '';
  });

  readonly dirty = computed(() => {
    const r = this.review();
    if (!r) return false;
    if (r.status === 'pending_review') return !isBlank(this.amount()) || !isBlank(this.note());
    if (r.status === 'approved') return !isBlank(this.receipt());
    if (r.status === 'refunded') return this.correction.dirty();
    return false;
  });

  // --- Payout corrections (row 100) ---
  /** Correction records, oldest first. TODO(owner-answers-5): optional until N-15 is on main. */
  readonly corrections = computed(() => this.review()?.corrections ?? []);
  /** The payout as it stands after the corrections. */
  readonly effective = computed(() => {
    const r = this.review();
    return r ? effectivePayout(r) : null;
  });
  /** The latest correction is a reversal: the refund is owed again. */
  readonly reversed = computed(() => this.effective()?.state === 'reversed');
  /** Cap for a corrected or re-sent amount (row 87). TODO(owner-answers-5): API field. */
  readonly correctionCeiling = computed(() => {
    const r = this.review();
    return r ? (r.correctionCeiling ?? r.amountPaid) : '0';
  });
  /** The shared correction form (`app-payout-correction-form`). */
  readonly correction = new CorrectionFormState(
    {
      effective: () => this.effective(),
      ceiling: () => this.correctionCeiling(),
      decidedAmount: () => this.review()?.refundAmount ?? null,
    },
    REFUND_CORRECTION_COPY,
  );
  /** Row 136: override notes for the decision and the correction amounts. */
  readonly decisionOverride = new ExposureOverrideState(() => this.amountValue());
  readonly correctionOverride = new ExposureOverrideState(() =>
    this.correction.formKind() === 'reversed' ? null : parseKsh(this.correction.amount()),
  );
  protected readonly overrideConfirmNote = OVERRIDE_CONFIRM_NOTE;
  protected readonly correctionDialogParts = computed(() =>
    correctionDialogParts(this.correction.form()),
  );
  protected readonly meId = computed(() => this.s.me()?.id ?? null);

  protected readonly taskTitle = computed(() => {
    const e = this.review()?.errand;
    if (e?.title) return e.title;
    const firstLine = e?.description?.split('\n')[0]?.trim();
    if (firstLine) return firstLine;
    if (e?.category) return categoryLabel(e.category);
    return 'Task';
  });

  protected readonly taskStatus = computed(() => this.review()?.errand?.status ?? null);

  protected readonly phone = computed(() => {
    const c = this.review()?.customer;
    return c?.mpesaPhone ?? c?.phone ?? null;
  });

  protected readonly mutedParts = computed(() => {
    const r = this.review();
    if (!r) return [];
    const parts: { text: string; num: boolean; prefix?: string }[] = [];
    const name = r.customer?.shortName;
    if (name) parts.push({ text: name, num: false });
    const category = r.errand?.category;
    if (category) parts.push({ text: categoryLabel(category), num: false });
    // Only the date/time is numeric: "Opened" stays Fira Sans.
    parts.push({ prefix: 'Opened ', text: formatDateTime(r.createdAt), num: true });
    return parts;
  });

  protected readonly dialogTitle = computed(() => {
    const r = this.review();
    switch (this.dialog()) {
      case 'approve':
        return `Approve a refund of ${formatKshExact(parseKsh(this.amount()))}?`;
      case 'no_refund':
        return 'Close with no refund?';
      case 'mark_paid':
        return `Mark ${formatKshExact(r?.refundAmount ?? null)} as refunded?`;
      case 'discard':
        return 'Discard this decision?';
      case 'correction':
        return correctionDialogTitle(this.correction.form());
      case 'correction_discard':
        return 'Discard this correction?';
      default:
        return '';
    }
  });

  protected readonly dialogConfirm = computed(() => {
    switch (this.dialog()) {
      case 'approve':
        return 'Approve refund';
      case 'no_refund':
        return 'Close review';
      case 'mark_paid':
        return 'Mark as refunded';
      case 'discard':
      case 'correction_discard':
        return 'Discard';
      case 'correction':
        return (
          CORRECTION_SUBMIT[this.correction.formKind()] +
          (this.correctionOverride.active() ? ' over the cap' : '')
        );
      default:
        return '';
    }
  });

  ngOnInit(): void {
    this.nav.setCloseGuard((proceed) => {
      if (!this.dirty() || this.saving()) return !this.saving();
      this.pendingLeave = proceed;
      this.dialog.set(this.review()?.status === 'refunded' ? 'correction_discard' : 'discard');
      return false;
    });
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const review = await firstValueFrom(this.api.getRefund(this.reviewId()));
      this.review.set(review);
      this.resetForms();
    } catch (e) {
      const err = apiError(e);
      this.loadError.set(
        err.status === 404
          ? { tone: 'info', text: 'This refund review no longer exists.' }
          : err.status === 403
            ? { tone: 'danger', text: FORBIDDEN_COPY }
            : { tone: 'danger', text: "Couldn't load this refund review." },
      );
    } finally {
      this.loading.set(false);
      afterNextRender(() => this.focusForm(), { injector: this.injector });
    }
  }

  private resetForms(): void {
    this.amount.set('');
    this.amountTouched.set(false);
    this.amountServerError.set(null);
    this.note.set('');
    this.receipt.set('');
    this.receiptTouched.set(false);
    this.receiptServerError.set(null);
    this.decisionOverride.reset();
    this.correctionOverride.reset();
    this.correction.reset();
  }

  /** Amount input (pending_review), receipt input (approved), else the drawer's close button. */
  private focusForm(): void {
    const input = (this.amountInput() ?? this.receiptInput())?.nativeElement;
    if (input) {
      input.focus();
      return;
    }
    // A reversed payout is owed again: its new payout form is the next step (m-10).
    if (this.reversed() && this.correctionFormRef()?.focusReference()) return;
    this.host.nativeElement
      .closest('.drawer')
      ?.querySelector<HTMLElement>('.drawer-close')
      ?.focus();
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setAmount(value: string): void {
    this.amount.set(value);
    this.amountServerError.set(null);
  }

  protected setReceipt(value: string): void {
    this.receipt.set(value.toUpperCase());
    this.receiptServerError.set(null);
  }

  /** Two decimal strings differ by at least a cent. */
  protected differs(a: string, b: string): boolean {
    return Math.round(Number(a) * 100) !== Math.round(Number(b) * 100);
  }

  protected positive(value: string | null | undefined): boolean {
    return Number(value ?? 0) > 0;
  }

  protected plain(value: string): string {
    return plainAmount(value);
  }

  protected adminName(
    ref: { id: string; displayName: string | null } | null | undefined,
    userId: string | null | undefined,
  ): string {
    // An admin with no name on file shows as a masked id.
    return adminLabel(ref, userId, this.meId());
  }

  protected openTask(): void {
    const r = this.review();
    if (r) this.nav.open('task', r.errandId);
  }

  protected submitCorrection(): void {
    this.correctionOverride.touched.set(true);
    if (this.correctionOverride.noteError()) return;
    this.dialog.set('correction');
  }

  protected submitDecision(): void {
    this.amountTouched.set(true);
    this.decisionOverride.touched.set(true);
    if (this.amountError() || this.decisionOverride.noteError() || this.saving()) return;
    this.dialog.set(parseKsh(this.amount())! > 0 ? 'approve' : 'no_refund');
  }

  protected submitPayout(): void {
    this.receiptTouched.set(true);
    if (this.receiptError() || this.saving()) return;
    this.dialog.set('mark_paid');
  }

  protected cancelDialog(): void {
    this.pendingLeave = null;
    this.dialog.set(null);
  }

  protected async confirmDialog(): Promise<void> {
    const d = this.dialog();
    if (d === 'correction_discard' && !this.pendingLeave) {
      this.dialog.set(null);
      this.correctionFormRef()?.close();
      return;
    }
    if (d === 'discard' || d === 'correction_discard') {
      const leave = this.pendingLeave;
      this.pendingLeave = null;
      this.dialog.set(null);
      this.nav.setCloseGuard(null);
      leave?.();
      return;
    }
    if (d === 'approve' || d === 'no_refund') await this.decide();
    if (d === 'mark_paid') await this.markPaid();
    if (d === 'correction') await this.saveCorrection();
  }

  private async saveCorrection(): Promise<void> {
    const r = this.review()!;
    const form = this.correction.form();
    const latest = this.corrections().at(-1)?.id ?? null;
    this.saving.set(true);
    try {
      const detail = await firstValueFrom(
        this.api.addRefundCorrection(r.id, {
          ...correctionBody(form, latest),
          ...this.correctionOverride.body(),
        }),
      );
      this.review.set(detail);
      this.resetForms();
      this.notice.set({ tone: 'success', text: REFUND_CORRECTION_COPY.saved[form.kind] });
      this.s.refundUpdated(detail);
      afterNextRender(() => this.focusForm(), { injector: this.injector });
    } catch (e) {
      await this.handleCorrectionError(apiError(e), form);
    } finally {
      this.saving.set(false);
      this.dialog.set(null);
    }
  }

  /** Puts the typed values back after a reload (the reload resets the form). */
  private restoreCorrection(form: CorrectionForm, fields: 'all' | 'reason'): void {
    if (this.review()?.status === 'refunded') this.correction.restore(form, fields);
  }

  /** drawer-refund "Corrections" → Error codes (A-14). */
  private async handleCorrectionError(err: ApiErrorInfo, form: CorrectionForm): Promise<void> {
    // Row 136: above the task cap: keep the input, ask for the override note.
    if (this.correctionOverride.applyError(err)) return;
    switch (err.code) {
      case 'refund_not_refunded':
        return this.reloadWith({
          tone: 'info',
          text: 'Corrections can only be added after a payout is recorded. Showing the latest.',
        });
      case 'payout_correction_conflict':
        // Another admin added a record: show it, keep the typed reason.
        await this.reloadWith({
          tone: 'info',
          text: 'Another admin changed this payout. Check the latest before you save.',
        });
        return this.restoreCorrection(form, 'reason');
      case 'payout_correction_kind_invalid':
        return this.reloadWith({ tone: 'info', text: 'This payout changed. Showing the latest.' });
      case 'refund_exceeds_amount_paid': {
        const ceiling =
          (err.extra['correctionCeiling'] as string | undefined) ??
          (err.extra['amountPaid'] as string | undefined) ??
          this.correctionCeiling();
        await this.load();
        this.restoreCorrection(form, 'all');
        return this.correction.setServerError('amount', correctionCeilingError(ceiling));
      }
    }
    if (this.correction.applyFieldError(err)) return;
    if (err.status === 404) {
      this.loadError.set({ tone: 'info', text: 'This refund review no longer exists.' });
    } else if (err.status === 403) {
      this.notice.set({ tone: 'danger', text: FORBIDDEN_COPY });
    } else {
      this.notice.set({
        tone: 'danger',
        text: "Couldn't save. Check your connection and try again.",
      });
    }
  }

  private async decide(): Promise<void> {
    const r = this.review()!;
    const refundAmount = parseKsh(this.amount())!;
    const note = this.note().trim();
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.decideRefund(r.id, {
          refundAmount,
          ...(note ? { note } : {}),
          ...this.decisionOverride.body(),
        }),
      );
      this.applySaved(saved);
      this.notice.set({
        tone: 'success',
        text:
          saved.status === 'approved'
            ? `Refund of ${formatKshExact(saved.refundAmount)} approved. Record the payout once you've sent it.`
            : 'Review closed with no refund.',
      });
    } catch (e) {
      await this.handleError(apiError(e), 'decision');
    } finally {
      this.saving.set(false);
      this.dialog.set(null);
    }
  }

  private async markPaid(): Promise<void> {
    const r = this.review()!;
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.markRefundPaid(r.id, { payoutReference: this.normalisedReceipt() }),
      );
      this.applySaved(saved);
      this.notice.set({ tone: 'success', text: 'Refund marked as sent.' });
    } catch (e) {
      await this.handleError(apiError(e), 'payout');
    } finally {
      this.saving.set(false);
      this.dialog.set(null);
    }
  }

  /** The write endpoints return the bare review: keep the enriched parts. */
  private applySaved(saved: RefundReview): void {
    const current = this.review()!;
    const me = this.s.me();
    const meRef = me ? { id: me.id, displayName: null } : null;
    this.review.set({
      ...current,
      ...saved,
      errand: current.errand,
      customer: current.customer,
      paid: current.paid,
      otherReviews: current.otherReviews,
      decidedBy: saved.decidedByUserId ? (current.decidedBy ?? meRef) : null,
      paidBy: saved.paidByUserId ? (current.paidBy ?? meRef) : null,
    });
    this.resetForms();
    this.s.refundUpdated(saved);
    afterNextRender(() => this.focusForm(), { injector: this.injector });
  }

  private async reloadWith(notice: { tone: NoticeTone; text: string }): Promise<void> {
    await this.load();
    this.notice.set(notice);
  }

  private async handleError(err: ApiErrorInfo, kind: 'decision' | 'payout'): Promise<void> {
    // Row 136: above the task cap: keep the input, ask for the override note.
    if (kind === 'decision' && this.decisionOverride.applyError(err)) return;
    if (err.code === 'refund_already_decided') {
      await this.reloadWith({
        tone: 'info',
        text: 'Another admin already decided this refund. Showing the latest.',
      });
    } else if (err.code === 'refund_not_approved') {
      await this.reloadWith({
        tone: 'info',
        text: "This refund isn't approved, so it can't be marked as sent. Showing the latest.",
      });
    } else if (err.code === 'refund_payout_locked') {
      // Row 82: a recorded receipt is final.
      await this.reloadWith({
        tone: 'info',
        text: "This refund was already marked as sent. Its receipt can't be changed. Showing the latest.",
      });
    } else if (err.code === 'refund_exceeds_amount_paid') {
      // `amountPaid` in the error is the effective ceiling (N-9).
      const ceiling = (err.extra['amountPaid'] as string | undefined) ?? this.ceiling();
      const amount = this.amount();
      const note = this.note();
      await this.load();
      this.amount.set(amount);
      this.note.set(note);
      this.amountServerError.set(ceilingError(ceiling));
    } else if (err.status === 400) {
      if (kind === 'decision') this.amountServerError.set(AMOUNT_FORMAT);
      else this.receiptServerError.set(RECEIPT_ERROR);
    } else if (err.status === 404) {
      this.loadError.set({ tone: 'info', text: 'This refund review no longer exists.' });
    } else if (err.status === 403) {
      this.notice.set({ tone: 'danger', text: FORBIDDEN_COPY });
    } else {
      this.notice.set({
        tone: 'danger',
        text: "Couldn't save. Check your connection and try again.",
      });
    }
  }

  protected readonly shortId = shortId;
  protected readonly chipStatus = refundChipStatus;
  protected readonly triggerLabel = refundTriggerLabel;
  protected readonly formatKshExact = formatKshExact;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatPhone = formatPhone;
  protected readonly correctionKindLabel = (kind: string) => correctionKindLabel(kind);
  protected readonly decisionLabel = decisionLabel;
}
