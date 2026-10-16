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
import type { EvidenceView, RunnerPayoutDetail } from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { SegmentedToggleComponent } from '../../../shared/segmented-toggle.component';
import { NumTextComponent, TextPart } from '../../../shared/num-text.component';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { adminLabel } from '../refund-labels';
import { PayoutCorrectionCardComponent } from '../payouts/payout-correction-card';
import { CurrentPayoutCardComponent } from '../payouts/current-payout-card';
import { TaskExposureCardComponent } from '../payouts/task-exposure-card';
import { ExposureOverrideFieldComponent } from '../payouts/exposure-override-field';
import { ExposureOverrideState, OVERRIDE_CONFIRM_NOTE } from '../payouts/task-exposure';
import {
  CORRECTION_CODE_ERROR,
  CORRECTION_SUBMIT,
  CorrectionForm,
  MPESA_CODE_PATTERN,
  RUNNER_PAYOUT_CORRECTION_COPY,
  correctionBody,
  correctionCeilingError,
  correctionDialogParts,
  correctionDialogTitle,
  correctionKindLabel,
} from '../payouts/payout-correction';
import {
  CorrectionFormState,
  PayoutCorrectionFormComponent,
} from '../payouts/payout-correction-form';
import {
  TO_API_KIND,
  payoutTaskRef,
  payoutTaskTitle,
  reviewReasonLabel,
  runnerName,
  runnerPayoutChipStatus,
  runnerPayoutKindLabel,
  runnerPayoutReversed,
  toCorrectionRecord,
} from '../payouts/runner-payout-labels';
import {
  LINES_CHANGED_COPY,
  MIXED_RUNNERS_COPY,
  RECEIPT_REUSED_COPY,
} from '../panels/runner-payouts.panel';
import {
  formatDateTime,
  formatKshExact,
  formatPhone,
  isBlank,
  parseKsh,
  plainAmount,
} from '../shared-format';

export const APPROVE_AMOUNT_FORMAT = 'Enter an amount in KSh, up to 2 decimal places.';
export const NOTE_RULE_ERROR = 'Say why in 5 to 500 characters.';
const NOTE_MIN = 5;
const NOTE_MAX = 500;

export function approveCapError(cap: string | number | null): string {
  return `You can approve up to ${formatKshExact(cap)}.`;
}

/** Amount to reimburse (drawer-runner-payout §5.2): > 0, 2 decimals, at most the ceiling. */
export function validateApproveAmount(value: string, ceiling: string | null): string | null {
  const n = parseKsh(value);
  if (n === null || n <= 0) return APPROVE_AMOUNT_FORMAT;
  if (ceiling !== null && Math.round(n * 100) > Math.round(Number(ceiling) * 100)) {
    return approveCapError(ceiling);
  }
  return null;
}

/** Reject reason / send-back note: 5-500 characters after trimming (API rule). */
export function validateNote(value: string): string | null {
  const n = value.trim().length;
  return n < NOTE_MIN || n > NOTE_MAX ? NOTE_RULE_ERROR : null;
}

type Dialog =
  'approve' | 'reject' | 'mark_paid' | 'discard' | 'correction' | 'correction_discard' | null;

const DECISIONS = [
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
];

const THIS_LINE_CHANGED = 'This line changed since you opened it. Showing the latest.';
const SAVE_FAILED = "Couldn't save. Check your connection and try again.";
const GONE = 'This payout line no longer exists.';

/**
 * Runner payout line drawer (drawer-runner-payout, rows 104-108, 112, 135,
 * 136): review an item reimbursement (approve up to the ceiling, or reject
 * with a reason), send a payable item line back for review, record the
 * M-Pesa payout of this line, and after it is paid record corrections, a
 * reversal or the re-sent payout (shared with drawer-refund). Lines are
 * ledger records, not task states; what Nitume owes is derived from them.
 */
@Component({
  selector: 'app-runner-payout-drawer',
  imports: [
    StatusChipComponent,
    InlineNoticeComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    SegmentedToggleComponent,
    NumTextComponent,
    PayoutCorrectionCardComponent,
    PayoutCorrectionFormComponent,
    CurrentPayoutCardComponent,
    TaskExposureCardComponent,
    ExposureOverrideFieldComponent,
  ],
  template: `
    @if (loading()) {
      <div class="ops-loading">Loading runner payout…</div>
    } @else if (loadError(); as le) {
      <app-inline-notice [tone]="le.tone">
        {{ le.text }}
        @if (le.tone === 'danger') {
          <button notice-action type="button" class="btn btn-outline btn-sm" (click)="load()">
            Try again
          </button>
        }
      </app-inline-notice>
    } @else if (line(); as l) {
      @if (notice(); as n) {
        <app-inline-notice
          [tone]="n.tone"
          [dismissible]="true"
          [autoDismissMs]="n.tone === 'success' ? 6000 : 0"
          (dismissed)="notice.set(null)"
          ><app-num-text [parts]="n.parts"
        /></app-inline-notice>
      }

      <!-- 1. Summary -->
      <section class="drawer-section">
        <app-status-chip [status]="chipStatus(l)" kind="runner_payout" />
        <h3 class="drawer-summary-title">{{ taskTitle(l.errand) }}</h3>
        <div class="drawer-muted">
          {{ name() }} · {{ kindLabel(l.kind) }} · Created
          <span class="num">{{ formatDateTime(l.createdAt) }}</span>
        </div>
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Task</span>
            <span class="row-inline">
              <b>{{ taskRef(l) }}</b>
              <button type="button" class="btn btn-text btn-sm" (click)="openTask()">
                Open task
              </button>
            </span>
          </div>
          @if (l.errand?.status; as ts) {
            <div class="drawer-row"><span>Task status</span><app-status-chip [status]="ts" /></div>
          }
          <div class="drawer-row">
            <span>Runner</span>
            <span class="row-inline">
              <b class="txt">{{ name() }}</b>
              <button type="button" class="btn btn-text btn-sm" (click)="openRunner()">
                Open runner
              </button>
            </span>
          </div>
          <div class="drawer-row">
            <span>Pay to</span>
            @if (phone(); as ph) {
              <b>{{ formatPhone(ph) }}</b>
            } @else {
              <span class="val-muted">Not available</span>
            }
          </div>
          @if (l.effectiveStatus === 'on_hold') {
            <div class="drawer-row">
              <span>Why it needs review</span><b class="txt">{{ reasonLabel(l.reviewReason) }}</b>
            </div>
          }
        </div>
      </section>

      <!-- 2. Amounts (the three flows stay apart: no customer fee here) -->
      <section class="drawer-section">
        <div class="drawer-label">Amounts</div>
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Requested</span><b>{{ formatKshExact(l.requestedAmount) }}</b>
          </div>
          @if (isItem()) {
            <div class="drawer-row">
              <span>Item paid to Nitume</span><b>{{ formatKshExact(l.itemPaidToNitume) }}</b>
            </div>
            @if (l.runner; as rn) {
              <div class="drawer-row">
                <span>Runner's purchase limit</span
                ><b>{{ formatKshExact(rn.maxPurchaseAdvance) }}</b>
              </div>
            }
            @if (l.effectiveStatus === 'on_hold' && l.approvalCeiling !== null) {
              <div class="drawer-row drawer-row-strong">
                <span>Most you can approve</span><b>{{ formatKshExact(l.approvalCeiling) }}</b>
              </div>
            }
          }
          @if (l.amount !== null) {
            <div class="drawer-row">
              <span>{{ isItem() ? 'Approved amount' : 'Amount' }}</span
              ><b>{{ formatKshExact(l.amount) }}</b>
            </div>
          }
        </div>
      </section>

      <!-- 3. Task exposure (row 136): item lines only -->
      @if (isItem() && l.taskExposure; as te) {
        <app-task-exposure-card
          [exposure]="te"
          [overrides]="l.exposureOverrides ?? []"
          [meId]="meId()"
          caption="Customer refunds and the runner's item reimbursement share one cap on a task."
        />
      }

      <!-- 4. Receipt -->
      <section class="drawer-section">
        <div class="drawer-label">Receipt</div>
        <div class="drawer-card">
          @if (!l.receiptEvidenceId) {
            <div class="val-muted receipt-none">No receipt on file</div>
          } @else if (receiptState() === 'loading') {
            <div class="val-muted receipt-none">Loading receipt…</div>
          } @else if (receipt(); as ev) {
            @if (ev.url) {
              <a class="receipt-link" [href]="ev.url" target="_blank" rel="noopener">
                <img class="receipt-thumb" [src]="ev.url" alt="Receipt photo, opens full size" />
              </a>
            } @else {
              <div class="val-muted receipt-none">The receipt image isn't available.</div>
            }
            <div class="drawer-row">
              <span>Uploaded</span><b>{{ formatDateTime(ev.createdAt) }}</b>
            </div>
          } @else {
            <div class="val-muted receipt-none">Couldn't load the receipt.</div>
          }
          @if (l.note) {
            <div class="drawer-row drawer-row-wrap">
              <span>{{ isClaim() ? "Runner's note" : 'System note' }}</span
              ><span class="val-text">{{ l.note }}</span>
            </div>
          }
        </div>
      </section>

      <!-- 5. Review form (on_hold) -->
      @if (l.effectiveStatus === 'on_hold') {
        <section class="drawer-section">
          <div class="drawer-label">Decision</div>
          @if (l.reviewReason === 'price_decrease_pending') {
            <!-- 5.0: decide the price-decrease refund first; the item amount owed may go down. -->
            <app-inline-notice tone="info" class="panel-notice">
              A price-decrease refund on this task is still undecided. Decide it first: the item
              amount owed may go down.
              @if (pendingDecreaseId(); as rid) {
                <button
                  notice-action
                  type="button"
                  class="btn btn-text btn-sm"
                  (click)="openRefund(rid)"
                >
                  Open refund review
                </button>
              }
            </app-inline-notice>
          }
          <div class="drawer-card drawer-stack">
            <app-segmented-toggle
              ariaLabel="Decision"
              [options]="decisions"
              [value]="decision()"
              [disabled]="saving()"
              (valueChange)="setDecision($event)"
            />
            @if (decision() === 'approve') {
              <app-form-field
                label="Amount to reimburse"
                prefix="KSh"
                [hint]="'Up to ' + formatKshExact(l.approvalCeiling) + '.'"
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
              @if (capDetail(); as cd) {
                <div class="drawer-caption"><app-num-text [parts]="cd" /></div>
              }
              <div class="quick-fill">
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  [disabled]="saving() || l.approvalCeiling === null"
                  (click)="setAmount(plain(l.approvalCeiling ?? '0'))"
                >
                  Full amount
                </button>
              </div>
              <app-form-field
                label="Note for the ops record (optional)"
                hint="Not shown to the runner."
                [counter]="note().length + '/500'"
              >
                <textarea
                  appFieldControl
                  rows="3"
                  maxlength="500"
                  [value]="note()"
                  [disabled]="saving()"
                  (input)="note.set(val($event))"
                ></textarea>
              </app-form-field>
              <app-exposure-override-field
                [state]="override"
                [saving]="saving()"
                hint="Kept in the audit history. Not shown to the runner."
              />
            } @else {
              <app-form-field
                label="Reason"
                hint="Not shown to the runner. The runner is told the reimbursement wasn't approved."
                [counter]="reason().length + '/500'"
                [error]="reasonShown()"
              >
                <textarea
                  #reasonInput
                  appFieldControl
                  rows="3"
                  maxlength="500"
                  [value]="reason()"
                  [disabled]="saving()"
                  (input)="setReason(val($event))"
                  (blur)="reasonTouched.set(true)"
                ></textarea>
              </app-form-field>
            }
            <div class="drawer-actions">
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="saving() || (decision() === 'approve' && !!amountError())"
                (click)="submitDecision()"
              >
                @if (decision() === 'reject') {
                  Reject reimbursement
                } @else if (amountValue(); as v) {
                  Approve{{ override.active() ? ' over the cap' : '' }} ·
                  <span class="num">{{ formatKshExact(v) }}</span>
                } @else {
                  Approve
                }
              </button>
            </div>
          </div>
        </section>
      }

      <!-- 6. Payout form (payable, not a reversed payout) -->
      @if (l.effectiveStatus === 'payable' && l.status === 'payable') {
        <section class="drawer-section">
          <div class="drawer-label">Record the payout</div>
          <div class="drawer-card drawer-stack">
            <p class="drawer-instruction">
              Send <span class="num">{{ formatKshExact(l.amount) }}</span>
              @if (phone(); as ph) {
                to <span class="num">{{ formatPhone(ph) }}</span>
              }
              by M-Pesa, then enter the receipt.
            </p>
            @if (!phone()) {
              <div class="drawer-caption">
                Find the runner's number in their profile before you send.
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
                [value]="receiptCode()"
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
                Mark as paid
              </button>
            </div>
            <div class="drawer-caption">
              To pay several lines of this runner in one M-Pesa payment, use Runner payouts.
            </div>
          </div>
          @if (isItem()) {
            @if (sendBackOpen()) {
              <div class="drawer-card drawer-stack send-back">
                <app-form-field
                  label="What's wrong with the receipt?"
                  [counter]="sendBackNote().length + '/500'"
                  [error]="sendBackShown()"
                >
                  <textarea
                    #sendBackInput
                    appFieldControl
                    rows="3"
                    maxlength="500"
                    [value]="sendBackNote()"
                    [disabled]="saving()"
                    (input)="sendBackNote.set(val($event))"
                    (blur)="sendBackTouched.set(true)"
                  ></textarea>
                </app-form-field>
                <div class="drawer-actions">
                  <button
                    type="button"
                    class="btn btn-outline"
                    [disabled]="saving()"
                    (click)="closeSendBack()"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    [disabled]="saving()"
                    (click)="sendBack()"
                  >
                    Send back for review
                  </button>
                </div>
              </div>
            } @else {
              <div class="drawer-actions">
                <button
                  #sendBackButton
                  type="button"
                  class="btn btn-outline"
                  [disabled]="saving()"
                  (click)="openSendBack()"
                >
                  Send back for review
                </button>
              </div>
            }
          }
        </section>
      }

      <!-- 7. Decision (read-only) -->
      @if (l.decidedAt && l.effectiveStatus !== 'on_hold') {
        <section class="drawer-section">
          <div class="drawer-label">Decision</div>
          <div class="drawer-card">
            <div class="drawer-row">
              <span>Decision</span>
              @if (l.status === 'rejected') {
                <b class="txt">Rejected</b>
              } @else {
                <b><span class="txt">Approved</span> {{ formatKshExact(l.amount) }}</b>
              }
            </div>
            <div class="drawer-row">
              <span>Decided</span><b>{{ formatDateTime(l.decidedAt) }}</b>
            </div>
            <div class="drawer-row">
              <span>Decided by</span
              ><b class="txt">{{ adminName(l.decidedBy, l.decidedByUserId) }}</b>
            </div>
            @if (l.decisionNote) {
              <p class="drawer-note">{{ l.decisionNote }}</p>
            }
          </div>
        </section>
      }

      <!-- 8-9. Payout (read-only), corrections and the correction / re-send form -->
      @if (l.status === 'paid') {
        @if (corrections().length > 0) {
          <app-current-payout-card
            [payout]="l.effectivePayout"
            [chipStatus]="chipStatus(l)"
            chipKind="runner_payout"
            [lastChanged]="corrections().at(-1)!.createdAt"
          />
        }
        <section class="drawer-section">
          <div class="drawer-label">
            {{ corrections().length > 0 ? 'Original payout' : 'Payout' }}
          </div>
          <div class="drawer-card">
            <div class="drawer-row">
              <span>Paid</span><b>{{ formatKshExact(l.amount) }}</b>
            </div>
            <div class="drawer-row">
              <span>M-Pesa receipt</span><b>{{ l.payoutReference ?? '—' }}</b>
            </div>
            <div class="drawer-row">
              <span>Sent</span><b>{{ formatDateTime(l.paidAt) }}</b>
            </div>
            <div class="drawer-row">
              <span>Recorded by</span><b class="txt">{{ adminName(l.paidBy, l.paidByUserId) }}</b>
            </div>
          </div>
        </section>
        @if (corrections().length > 0) {
          <section class="drawer-section">
            <div class="drawer-label">Corrections</div>
            <div class="drawer-stack">
              @for (c of corrections(); track c.id) {
                <app-payout-correction-card [correction]="c" [meId]="meId()" [copy]="copy" />
              }
            </div>
          </section>
        }
        <app-payout-correction-form
          [state]="correction"
          [saving]="saving()"
          [hasPhone]="!!phone()"
          (submitted)="dialog.set('correction')"
          (discardRequested)="dialog.set('correction_discard')"
        />
      }

      <!-- 10. Activity -->
      <section class="drawer-section">
        <div class="drawer-label">Activity</div>
        <div class="drawer-card">
          <div class="drawer-timeline">
            @for (item of activity(); track $index) {
              <div class="dt-item">
                <b
                  >{{ item.label }}
                  @if (item.value) {
                    · <span [class.num]="item.num">{{ item.value }}</span>
                  }
                </b>
                @if (item.at) {
                  <span class="dt-time">{{ formatDateTime(item.at) }}</span>
                }
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
            <p>It becomes payable at once and is added to what Nitume owes the runner.</p>
            @if (override.active()) {
              <p>{{ overrideConfirmNote }}</p>
            }
          }
          @case ('reject') {
            <p>The line closes and can't be reopened.</p>
          }
          @case ('mark_paid') {
            <p>
              M-Pesa receipt <span class="num">{{ normalisedReceipt() }}</span
              >. This can't be undone; a later change is recorded as a correction.
            </p>
          }
          @case ('discard') {
            <p>What you entered will be lost.</p>
          }
          @case ('correction') {
            <p><app-num-text [parts]="correctionDialogParts()" /></p>
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
export class RunnerPayoutDrawerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly s = inject(AdminDataService);
  private readonly nav = inject(DrawerNavService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly lineId = input.required<string>();

  readonly line = signal<RunnerPayoutDetail | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<{ tone: NoticeTone; text: string } | null>(null);
  readonly notice = signal<{ tone: NoticeTone; parts: TextPart[] } | null>(null);
  readonly saving = signal(false);
  readonly dialog = signal<Dialog>(null);
  private pendingLeave: (() => void) | null = null;

  /** The undecided `Price decrease` refund review of the task (reason price_decrease_pending). */
  readonly pendingDecreaseId = signal<string | null>(null);

  // Receipt image (evidence endpoint, signed URL).
  readonly receipt = signal<EvidenceView | null>(null);
  readonly receiptState = signal<'idle' | 'loading' | 'done'>('idle');

  // Review form.
  readonly decision = signal<'approve' | 'reject'>('approve');
  readonly amount = signal('');
  readonly amountTouched = signal(false);
  private readonly amountServerError = signal<string | null>(null);
  /** After 400 reimbursement_exceeds_cap: the item paid and the purchase limit. */
  readonly capDetail = signal<TextPart[] | null>(null);
  readonly note = signal('');
  readonly reason = signal('');
  readonly reasonTouched = signal(false);
  private readonly reasonServerError = signal<string | null>(null);

  // Payout form.
  readonly receiptCode = signal('');
  readonly receiptTouched = signal(false);
  private readonly receiptServerError = signal<string | null>(null);

  // Send back for review.
  readonly sendBackOpen = signal(false);
  readonly sendBackNote = signal('');
  readonly sendBackTouched = signal(false);

  private readonly amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');
  private readonly reasonInput = viewChild<ElementRef<HTMLTextAreaElement>>('reasonInput');
  private readonly receiptInput = viewChild<ElementRef<HTMLInputElement>>('receiptInput');
  private readonly sendBackInput = viewChild<ElementRef<HTMLTextAreaElement>>('sendBackInput');
  private readonly sendBackButton = viewChild<ElementRef<HTMLButtonElement>>('sendBackButton');
  private readonly correctionFormRef = viewChild(PayoutCorrectionFormComponent);

  protected readonly decisions = DECISIONS;
  protected readonly copy = RUNNER_PAYOUT_CORRECTION_COPY;
  protected readonly overrideConfirmNote = OVERRIDE_CONFIRM_NOTE;

  readonly isItem = computed(() => this.line()?.kind === 'item_reimbursement');
  readonly isClaim = computed(() => this.line()?.reviewReason === 'out_of_pocket_claim');
  readonly reversed = computed(() => {
    const l = this.line();
    return !!l && runnerPayoutReversed(l);
  });
  protected readonly phone = computed(() => this.line()?.runner?.phone ?? null);
  protected readonly name = computed(() => {
    const l = this.line();
    return l ? runnerName(l.runner, l.runnerProfileId) : '';
  });
  protected readonly meId = computed(() => this.s.me()?.id ?? null);

  readonly amountError = computed(() =>
    validateApproveAmount(this.amount(), this.line()?.approvalCeiling ?? null),
  );
  protected readonly amountShown = computed(
    () => this.amountServerError() ?? (this.amountTouched() ? this.amountError() : null),
  );
  /** A valid amount (drives the button label), else null. */
  protected readonly amountValue = computed(() =>
    this.amountError() ? null : parseKsh(this.amount()),
  );
  readonly reasonError = computed(() => validateNote(this.reason()));
  protected readonly reasonShown = computed(
    () => this.reasonServerError() ?? (this.reasonTouched() ? this.reasonError() : null),
  );
  /** Row 136: the override note after a 409 task_exposure_cap_exceeded. */
  readonly override = new ExposureOverrideState(() =>
    this.decision() === 'approve' ? this.amountValue() : null,
  );

  readonly receiptError = computed(() =>
    MPESA_CODE_PATTERN.test(this.receiptCode().trim()) ? null : CORRECTION_CODE_ERROR,
  );
  protected readonly receiptShown = computed(
    () => this.receiptServerError() ?? (this.receiptTouched() ? this.receiptError() : null),
  );
  protected readonly normalisedReceipt = computed(() => this.receiptCode().trim().toUpperCase());
  protected readonly sendBackShown = computed(() =>
    this.sendBackTouched() ? validateNote(this.sendBackNote()) : null,
  );

  // --- Corrections (shared with drawer-refund) ---
  readonly corrections = computed(() => (this.line()?.corrections ?? []).map(toCorrectionRecord));
  readonly correction = new CorrectionFormState(
    {
      effective: () => this.line()?.effectivePayout ?? null,
      ceiling: () => {
        const l = this.line();
        return l?.correctionCeiling ?? l?.amount ?? '0';
      },
      decidedAmount: () => this.line()?.amount ?? null,
    },
    RUNNER_PAYOUT_CORRECTION_COPY,
  );
  protected readonly correctionDialogParts = computed(() =>
    correctionDialogParts(this.correction.form(), RUNNER_PAYOUT_CORRECTION_COPY),
  );

  readonly dirty = computed(() => {
    const l = this.line();
    if (!l) return false;
    if (l.effectiveStatus === 'on_hold') {
      return (
        !isBlank(this.amount()) ||
        !isBlank(this.note()) ||
        !isBlank(this.reason()) ||
        !isBlank(this.override.note())
      );
    }
    if (l.status === 'payable') {
      return !isBlank(this.receiptCode()) || !isBlank(this.sendBackNote());
    }
    if (l.status === 'paid') return this.correction.dirty();
    return false;
  });

  /** Activity timeline (drawer-runner-payout §10). */
  protected readonly activity = computed(() => {
    const l = this.line();
    if (!l) return [];
    const items: { label: string; value?: string; num?: boolean; at: string | null }[] = [
      { label: this.isClaim() ? 'Claimed by the runner' : 'Line created', at: l.createdAt },
    ];
    if (l.reviewReason) {
      // A receipt mismatch is flagged later by ops; the API keeps no time for it.
      items.push({
        label: 'Sent for review',
        value: reviewReasonLabel(l.reviewReason),
        num: false,
        at: l.reviewReason === 'receipt_mismatch' ? null : l.createdAt,
      });
    }
    if (l.decidedAt) {
      items.push(
        l.status === 'rejected'
          ? { label: 'Rejected', at: l.decidedAt }
          : { label: 'Approved', value: formatKshExact(l.amount), num: true, at: l.decidedAt },
      );
    }
    if (l.paidAt) {
      items.push({ label: 'Paid', value: l.payoutReference ?? '—', num: true, at: l.paidAt });
    }
    for (const c of this.corrections()) {
      items.push({
        label: correctionKindLabel(c.kind, RUNNER_PAYOUT_CORRECTION_COPY),
        value:
          (c.kind === 'corrected'
            ? (c.newReference ?? formatKshExact(c.newAmount))
            : c.newReference) ?? '—',
        num: true,
        at: c.createdAt,
      });
    }
    for (const o of l.exposureOverrides ?? []) {
      if (o.runnerPayoutLineId !== l.id) continue;
      items.push({
        label: 'Cap override',
        value: formatKshExact(o.amount),
        num: true,
        at: o.createdAt,
      });
    }
    return items;
  });

  protected readonly dialogTitle = computed(() => {
    const l = this.line();
    switch (this.dialog()) {
      case 'approve':
        return `Approve ${formatKshExact(this.amountValue())} for ${this.name()}?`;
      case 'reject':
        return 'Reject this reimbursement?';
      case 'mark_paid':
        return `Mark ${formatKshExact(l?.amount ?? null)} as paid?`;
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
        return this.override.active() ? 'Approve over the cap' : 'Approve';
      case 'reject':
        return 'Reject reimbursement';
      case 'mark_paid':
        return 'Mark as paid';
      case 'discard':
      case 'correction_discard':
        return 'Discard';
      case 'correction':
        return CORRECTION_SUBMIT[this.correction.formKind()];
      default:
        return '';
    }
  });

  ngOnInit(): void {
    this.nav.setCloseGuard((proceed) => {
      if (!this.dirty() || this.saving()) return !this.saving();
      this.pendingLeave = proceed;
      this.dialog.set(this.line()?.status === 'paid' ? 'correction_discard' : 'discard');
      return false;
    });
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const line = await firstValueFrom(this.api.getRunnerPayout(this.lineId()));
      this.line.set(line);
      this.resetForms();
      void this.loadReceipt(line);
      void this.loadPendingDecrease(line);
    } catch (e) {
      const err = apiError(e);
      this.loadError.set(
        err.status === 404
          ? { tone: 'info', text: GONE }
          : err.status === 403
            ? { tone: 'danger', text: FORBIDDEN_COPY }
            : { tone: 'danger', text: "Couldn't load this payout line." },
      );
    } finally {
      this.loading.set(false);
      afterNextRender(() => this.focusForm(), { injector: this.injector });
    }
  }

  private async loadReceipt(line: RunnerPayoutDetail): Promise<void> {
    if (!line.receiptEvidenceId) {
      this.receipt.set(null);
      this.receiptState.set('idle');
      return;
    }
    if (this.receipt()?.id === line.receiptEvidenceId) return;
    this.receiptState.set('loading');
    try {
      const evidence = await firstValueFrom(this.api.listErrandEvidence(line.errandId));
      this.receipt.set(evidence.find((e) => e.id === line.receiptEvidenceId) ?? null);
    } catch {
      this.receipt.set(null);
    } finally {
      this.receiptState.set('done');
    }
  }

  private async loadPendingDecrease(line: RunnerPayoutDetail): Promise<void> {
    this.pendingDecreaseId.set(null);
    if (line.effectiveStatus !== 'on_hold' || line.reviewReason !== 'price_decrease_pending') {
      return;
    }
    try {
      const { items } = await firstValueFrom(this.api.listErrandRefunds(line.errandId));
      const pending = items.find(
        (r) => r.trigger === 'price_change_decrease' && r.status === 'pending_review',
      );
      this.pendingDecreaseId.set(pending?.id ?? null);
    } catch {
      /* the notice stays without the link */
    }
  }

  protected openRefund(id: string): void {
    this.nav.open('refund', id);
  }

  private resetForms(): void {
    this.decision.set('approve');
    this.amount.set('');
    this.amountTouched.set(false);
    this.amountServerError.set(null);
    this.capDetail.set(null);
    this.note.set('');
    this.reason.set('');
    this.reasonTouched.set(false);
    this.reasonServerError.set(null);
    this.override.reset();
    this.receiptCode.set('');
    this.receiptTouched.set(false);
    this.receiptServerError.set(null);
    this.sendBackOpen.set(false);
    this.sendBackNote.set('');
    this.sendBackTouched.set(false);
    this.correction.reset();
  }

  /** First field of the state's form (m-10 rule), else the drawer's close button. */
  private focusForm(): void {
    const input = (this.amountInput() ?? this.reasonInput() ?? this.receiptInput())?.nativeElement;
    if (input) {
      input.focus();
      return;
    }
    if (this.reversed() && this.correctionFormRef()?.focusReference()) return;
    this.host.nativeElement
      .closest('.drawer')
      ?.querySelector<HTMLElement>('.drawer-close')
      ?.focus();
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected plain(value: string): string {
    return plainAmount(value);
  }

  protected setDecision(value: string): void {
    this.decision.set(value === 'reject' ? 'reject' : 'approve');
    afterNextRender(() => (this.amountInput() ?? this.reasonInput())?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected setAmount(value: string): void {
    this.amount.set(value);
    this.amountServerError.set(null);
    this.capDetail.set(null);
  }

  protected setReason(value: string): void {
    this.reason.set(value);
    this.reasonServerError.set(null);
  }

  protected setReceipt(value: string): void {
    this.receiptCode.set(value.toUpperCase());
    this.receiptServerError.set(null);
  }

  protected openSendBack(): void {
    this.sendBackOpen.set(true);
    afterNextRender(() => this.sendBackInput()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected closeSendBack(): void {
    this.sendBackOpen.set(false);
    this.sendBackNote.set('');
    this.sendBackTouched.set(false);
    afterNextRender(() => this.sendBackButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected adminName(
    ref: { id: string; displayName: string | null } | null | undefined,
    userId: string | null | undefined,
  ): string {
    return adminLabel(ref, userId, this.meId());
  }

  protected openTask(): void {
    const l = this.line();
    if (l) this.nav.open('task', l.errandId);
  }

  protected openRunner(): void {
    const l = this.line();
    if (l) this.nav.open('runner', l.runnerProfileId);
  }

  protected submitDecision(): void {
    if (this.saving()) return;
    if (this.decision() === 'reject') {
      this.reasonTouched.set(true);
      if (this.reasonError()) return;
      this.dialog.set('reject');
      return;
    }
    this.amountTouched.set(true);
    this.override.touched.set(true);
    if (this.amountError() || this.override.noteError()) return;
    this.dialog.set('approve');
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
    if (d === 'approve' || d === 'reject') await this.review(d);
    if (d === 'mark_paid') await this.markPaid();
    if (d === 'correction') await this.saveCorrection();
  }

  private saved(detail: RunnerPayoutDetail, notice: TextPart[]): void {
    this.line.set(detail);
    this.resetForms();
    this.notice.set({ tone: 'success', parts: notice });
    this.s.runnerPayoutsUpdated([detail]);
    void this.loadReceipt(detail);
    afterNextRender(() => this.focusForm(), { injector: this.injector });
  }

  private async review(decision: 'approve' | 'reject'): Promise<void> {
    const l = this.line()!;
    this.saving.set(true);
    try {
      const note = this.note().trim();
      const detail = await firstValueFrom(
        this.api.reviewRunnerPayout(
          l.id,
          decision === 'approve'
            ? {
                decision,
                amount: this.amountValue()!,
                ...(note ? { note } : {}),
                ...this.override.body(),
              }
            : { decision, note: this.reason().trim() },
        ),
      );
      this.saved(
        detail,
        decision === 'approve'
          ? [
              { text: 'Reimbursement approved: ', num: false },
              { text: formatKshExact(detail.amount), num: true },
              { text: '. Record the payout once you have sent it.', num: false },
            ]
          : [{ text: 'Reimbursement rejected.', num: false }],
      );
    } catch (e) {
      await this.handleReviewError(apiError(e));
    } finally {
      this.saving.set(false);
      this.dialog.set(null);
    }
  }

  /** drawer-runner-payout §5.6 errors (A-14); unknown 400/409 codes stay graceful. */
  private async handleReviewError(err: ApiErrorInfo): Promise<void> {
    if (this.override.applyError(err)) return;
    switch (err.code) {
      case 'runner_payout_not_in_review':
        return this.reloadWith('info', 'This line was already decided.');
      case 'reimbursement_exceeds_cap': {
        const cap = (err.extra['cap'] ?? err.extra['approvalCeiling']) as string | undefined;
        this.amountServerError.set(approveCapError(cap ?? this.line()?.approvalCeiling ?? null));
        const item = err.extra['itemPaidToNitume'] as string | undefined;
        const limit = err.extra['maxPurchaseAdvance'] as string | undefined;
        if (item !== undefined && limit !== undefined) {
          this.capDetail.set([
            { text: 'Item paid to Nitume ', num: false },
            { text: formatKshExact(item), num: true },
            { text: ' · purchase limit ', num: false },
            { text: formatKshExact(limit), num: true },
            { text: '.', num: false },
          ]);
        }
        return;
      }
      case 'decision_note_required':
        this.reasonTouched.set(true);
        this.reasonServerError.set(NOTE_RULE_ERROR);
        return;
    }
    if (err.status === 400 && !err.code) {
      const text = err.messages.join(' ');
      if (/amount/.test(text)) return this.amountServerError.set(APPROVE_AMOUNT_FORMAT);
      if (/note/.test(text)) return this.reasonServerError.set(NOTE_RULE_ERROR);
    }
    return this.genericError(err);
  }

  private async markPaid(): Promise<void> {
    const l = this.line()!;
    const reference = this.normalisedReceipt();
    this.saving.set(true);
    try {
      const { items } = await firstValueFrom(this.api.markRunnerPayoutsPaid([l.id], reference));
      const paid = items.find((i) => i.id === l.id);
      // mark-paid returns list items: keep the detail-only parts.
      const detail: RunnerPayoutDetail = paid ? { ...l, ...paid, runner: l.runner } : l;
      this.saved(detail, [
        { text: 'Payout recorded: ', num: false },
        { text: formatKshExact(detail.amount), num: true },
        { text: ' · ', num: false },
        { text: reference, num: true },
        { text: '.', num: false },
      ]);
    } catch (e) {
      const err = apiError(e);
      if (err.code === 'payout_reference_reused') {
        this.receiptServerError.set(RECEIPT_REUSED_COPY);
      } else if (err.code === 'runner_payout_mixed_runners') {
        this.notice.set({ tone: 'danger', parts: [{ text: MIXED_RUNNERS_COPY, num: false }] });
      } else if (err.status === 400 && !err.code) {
        this.receiptServerError.set(CORRECTION_CODE_ERROR);
      } else if (err.status === 409) {
        // runner_payout_not_payable / runner_payout_locked / any other conflict.
        await this.reloadWith('danger', LINES_CHANGED_COPY);
      } else {
        await this.genericError(err);
      }
    } finally {
      this.saving.set(false);
      this.dialog.set(null);
    }
  }

  protected async sendBack(): Promise<void> {
    this.sendBackTouched.set(true);
    if (validateNote(this.sendBackNote()) || this.saving()) return;
    const l = this.line()!;
    this.saving.set(true);
    try {
      const detail = await firstValueFrom(
        this.api.holdRunnerPayout(l.id, this.sendBackNote().trim()),
      );
      this.saved(detail, [{ text: 'Sent back for review.', num: false }]);
    } catch (e) {
      const err = apiError(e);
      if (err.code === 'runner_payout_not_holdable' || err.status === 409) {
        await this.reloadWith('info', THIS_LINE_CHANGED);
      } else {
        await this.genericError(err);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async saveCorrection(): Promise<void> {
    const l = this.line()!;
    const form = this.correction.form();
    const latest = this.corrections().at(-1)?.id ?? null;
    this.saving.set(true);
    try {
      const body = correctionBody(form, latest);
      const detail = await firstValueFrom(
        this.api.addRunnerPayoutCorrection(l.id, { ...body, kind: TO_API_KIND[body.kind] }),
      );
      this.saved(detail, [{ text: RUNNER_PAYOUT_CORRECTION_COPY.saved[form.kind], num: false }]);
    } catch (e) {
      await this.handleCorrectionError(apiError(e), form);
    } finally {
      this.saving.set(false);
      this.dialog.set(null);
    }
  }

  private restoreCorrection(form: CorrectionForm, fields: 'all' | 'reason'): void {
    if (this.line()?.status === 'paid') this.correction.restore(form, fields);
  }

  /** drawer-runner-payout §9 errors. */
  private async handleCorrectionError(err: ApiErrorInfo, form: CorrectionForm): Promise<void> {
    switch (err.code) {
      case 'payout_correction_conflict':
        // Someone else added a record: show it, keep the typed reason.
        await this.reloadWith(
          'info',
          'Someone else changed this payout. Check the latest and try again.',
        );
        return this.restoreCorrection(form, 'reason');
      case 'runner_payout_not_paid':
      case 'payout_correction_kind_invalid':
        return this.reloadWith('info', 'This payout changed. Showing the latest.');
      case 'runner_payout_exceeds_amount': {
        const ceiling =
          (err.extra['correctionCeiling'] as string | undefined) ??
          this.line()?.correctionCeiling ??
          null;
        return this.correction.setServerError('amount', correctionCeilingError(ceiling, 'line'));
      }
    }
    if (this.correction.applyFieldError(err)) return;
    return this.genericError(err);
  }

  /** 404, 403, unknown 409 (reload) and unknown 400 / network errors. */
  private async genericError(err: ApiErrorInfo): Promise<void> {
    if (err.status === 404) {
      this.loadError.set({ tone: 'info', text: GONE });
    } else if (err.status === 403) {
      this.notice.set({ tone: 'danger', parts: [{ text: FORBIDDEN_COPY, num: false }] });
    } else if (err.status === 409) {
      await this.reloadWith('info', THIS_LINE_CHANGED);
    } else if (err.status === 400) {
      this.notice.set({
        tone: 'danger',
        parts: [
          { text: "Couldn't save this change. Check the details and try again.", num: false },
        ],
      });
    } else {
      this.notice.set({ tone: 'danger', parts: [{ text: SAVE_FAILED, num: false }] });
    }
  }

  private async reloadWith(tone: NoticeTone, text: string): Promise<void> {
    await this.load();
    this.notice.set({ tone, parts: [{ text, num: false }] });
  }

  protected readonly chipStatus = runnerPayoutChipStatus;
  protected readonly kindLabel = runnerPayoutKindLabel;
  protected readonly reasonLabel = reviewReasonLabel;
  protected readonly taskTitle = payoutTaskTitle;
  protected readonly taskRef = payoutTaskRef;
  protected readonly formatKshExact = formatKshExact;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatPhone = formatPhone;
}
