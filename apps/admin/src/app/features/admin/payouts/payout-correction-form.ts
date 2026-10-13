import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ApiErrorInfo } from '../../../core/api-error';
import { NumTextComponent, TextPart } from '../../../shared/num-text.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { SegmentedToggleComponent } from '../../../shared/segmented-toggle.component';
import { formatKshExact, isBlank, plainAmount } from '../shared-format';
import {
  CORRECTION_AMOUNT_FORMAT,
  CORRECTION_CODE_ERROR,
  CORRECTION_NO_CHANGE,
  CORRECTION_REASON_ERROR,
  CORRECTION_REASON_MAX,
  CORRECTION_REFERENCE_REUSED,
  CORRECTION_SUBMIT,
  CorrectionCopy,
  CorrectionForm,
  CorrectionKind,
  hasCorrectionErrors,
  validateCorrection,
} from './payout-correction';

export type CorrectionField = 'reference' | 'amount' | 'reason';

/** The effective payout the form corrects (refund or runner line, same shape). */
export interface CorrectionPayout {
  state: 'sent' | 'reversed';
  amount: string;
  reference: string | null;
}

/** Where the form reads the record it corrects. */
export interface CorrectionSource {
  /** The payout as it stands after the earlier adjustments; null unless paid. */
  effective: () => CorrectionPayout | null;
  /** The API's `correctionCeiling`. */
  ceiling: () => string;
  /** The decided amount; prefills the re-sent payout while reversed. */
  decidedAmount: () => string | null;
}

/** `What happened?` (A-09) while the effective payout is sent (row 100). */
export const CORRECTION_KINDS = [
  { value: 'corrected', label: 'Wrong receipt or amount' },
  { value: 'reversed', label: 'Payout reversed' },
];

/**
 * State of one payout correction form (row 100, reused for row 107): the
 * typed values, touched fields, server field errors and every derived rule.
 * Owned by the drawer (it saves and runs the dialogs); rendered by
 * `app-payout-correction-form`.
 */
export class CorrectionFormState {
  readonly open = signal(false);
  readonly kind = signal<'corrected' | 'reversed'>('corrected');
  readonly reference = signal('');
  readonly amount = signal('');
  readonly reason = signal('');
  private readonly touched = signal<ReadonlySet<CorrectionField>>(new Set());
  private readonly server = signal<Partial<Record<CorrectionField | 'form', string>>>({});

  constructor(
    private readonly source: CorrectionSource,
    readonly copy: CorrectionCopy,
  ) {}

  readonly effective = computed(() => this.source.effective());
  readonly ceiling = computed(() => this.source.ceiling());
  readonly decidedAmount = computed(() => this.source.decidedAmount());
  /** The latest adjustment is a reversal: the money is owed again. */
  readonly reversed = computed(() => this.effective()?.state === 'reversed');
  /** `resent` while reversed (no toggle), else the toggle's kind. */
  readonly formKind = computed<CorrectionKind>(() => (this.reversed() ? 'resent' : this.kind()));

  readonly form = computed<CorrectionForm>(() => ({
    kind: this.formKind(),
    reference: this.reference(),
    amount: this.amount(),
    reason: this.reason(),
  }));
  readonly errors = computed(() => {
    const e = this.effective();
    return validateCorrection(
      this.form(),
      { reference: e?.reference ?? null, amount: e?.amount ?? '0', ceiling: this.ceiling() },
      this.copy,
    );
  });
  readonly invalid = computed(() => hasCorrectionErrors(this.errors()));
  /** Form-level error: the server's, or "receipt, amount or both" once both were left. */
  readonly formError = computed(() => {
    const server = this.server()['form'];
    if (server) return server;
    const t = this.touched();
    return t.has('reference') && t.has('amount') ? this.errors().form : null;
  });
  /** Prefill of the re-sent amount: the decided amount. */
  private readonly prefill = computed(() => {
    const decided = this.decidedAmount();
    return this.reversed() && decided ? plainAmount(decided) : '';
  });
  readonly dirty = computed(
    () =>
      this.open() &&
      (!isBlank(this.reference()) ||
        !isBlank(this.reason()) ||
        this.amount().trim() !== this.prefill()),
  );

  /** Closed form, no input; open (with the amount prefilled) while the payout is reversed. */
  reset(): void {
    this.kind.set('corrected');
    this.reference.set('');
    this.reason.set('');
    this.touched.set(new Set());
    this.server.set({});
    this.amount.set(this.prefill());
    this.open.set(this.reversed());
  }

  /** Switching kind keeps the reason and clears the other fields. */
  setKind(kind: string): void {
    this.kind.set(kind === 'reversed' ? 'reversed' : 'corrected');
    this.reference.set('');
    this.amount.set('');
    this.touched.update((t) => new Set([...t].filter((f) => f === 'reason')));
    this.server.set({});
  }

  set(field: CorrectionField, value: string): void {
    const target = { reference: this.reference, amount: this.amount, reason: this.reason }[field];
    target.set(field === 'reference' ? value.toUpperCase() : value);
    this.server.update((e) => {
      const next = { ...e };
      delete next[field];
      if (field !== 'reason') delete next.form;
      return next;
    });
  }

  touch(field: CorrectionField): void {
    this.touched.update((t) => new Set([...t, field]));
  }

  touchAll(): void {
    this.touched.set(new Set<CorrectionField>(['reference', 'amount', 'reason']));
  }

  /** Server error first, else the client rule once the field was left (validate on blur). */
  shown(field: CorrectionField): string | null {
    const server = this.server()[field];
    if (server) return server;
    return this.touched().has(field) ? this.errors()[field] : null;
  }

  setServerError(field: CorrectionField | 'form', text: string): void {
    this.server.update((e) => ({ ...e, [field]: text }));
  }

  /** Puts the typed values back after a reload (the reload resets the form). */
  restore(form: CorrectionForm, fields: 'all' | 'reason'): void {
    this.open.set(true);
    this.reason.set(form.reason);
    if (fields === 'reason') return;
    if (form.kind !== 'resent') this.kind.set(form.kind);
    this.reference.set(form.reference);
    this.amount.set(form.amount);
  }

  /**
   * Field errors both corrections endpoints share (drawer-refund
   * "Corrections" → Error codes). False when the error is not one of them.
   */
  applyFieldError(err: ApiErrorInfo): boolean {
    switch (err.code) {
      case 'payout_reference_reused':
        this.setServerError('reference', CORRECTION_REFERENCE_REUSED);
        return true;
      case 'correction_no_change':
        this.setServerError('form', CORRECTION_NO_CHANGE);
        return true;
      case 'payout_reference_required':
        this.setServerError('reference', CORRECTION_CODE_ERROR);
        return true;
      case 'payout_amount_required':
      case 'payout_amount_not_allowed':
        this.setServerError('amount', CORRECTION_AMOUNT_FORMAT);
        return true;
      case 'correction_reason_invalid':
        this.setServerError('reason', CORRECTION_REASON_ERROR);
        return true;
    }
    if (err.status !== 400 || err.messages.length === 0 || err.code) return false;
    // class-validator messages name the property.
    const text = err.messages.join(' ');
    let mapped = false;
    if (/newReference/.test(text)) {
      this.setServerError('reference', CORRECTION_CODE_ERROR);
      mapped = true;
    }
    if (/newAmount/.test(text)) {
      this.setServerError('amount', CORRECTION_AMOUNT_FORMAT);
      mapped = true;
    }
    if (/reason/.test(text)) {
      this.setServerError('reason', CORRECTION_REASON_ERROR);
      mapped = true;
    }
    return mapped;
  }
}

/**
 * Payout correction form (drawer-refund "Form", row 100; drawer-runner-payout
 * "Corrections", row 107): `Record a correction` while closed; the A-09 kind
 * toggle and the fields of that kind while open; the re-send form with no
 * toggle and no Cancel while the payout is reversed. The drawer confirms and
 * saves on `submitted`, and asks `Discard this correction?` on
 * `discardRequested` (then calls `close()`).
 */
@Component({
  selector: 'app-payout-correction-form',
  imports: [NumTextComponent, FormFieldComponent, FieldControlDirective, SegmentedToggleComponent],
  template: `
    @let st = state();
    @if (st.open()) {
      <section class="drawer-section correction-form">
        <div class="drawer-label">
          {{ st.reversed() ? 'Record the new payout' : 'Record a correction' }}
        </div>
        <div class="drawer-card drawer-stack">
          @if (!st.reversed()) {
            <div class="field">
              <span class="field-label">What happened?</span>
              <app-segmented-toggle
                ariaLabel="What happened?"
                [options]="kinds"
                [value]="st.kind()"
                [disabled]="saving()"
                (valueChange)="st.setKind($event)"
              />
            </div>
          }
          @switch (st.formKind()) {
            @case ('corrected') {
              <app-form-field
                label="Correct M-Pesa receipt"
                [hintParts]="receiptHintParts()"
                [error]="st.shown('reference')"
              >
                <input
                  #referenceInput
                  appFieldControl
                  [numeric]="true"
                  class="is-upper"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="64"
                  placeholder="e.g. SLK4H7XQ2P"
                  [value]="st.reference()"
                  [disabled]="saving()"
                  (input)="st.set('reference', val($event))"
                  (blur)="st.touch('reference')"
                />
              </app-form-field>
              <app-form-field
                label="Correct amount sent"
                prefix="KSh"
                [hint]="
                  'Leave empty if the amount was right. Current: ' +
                  formatKshExact(st.effective()?.amount ?? 0) +
                  '. Up to ' +
                  formatKshExact(st.ceiling()) +
                  '.'
                "
                [error]="st.shown('amount')"
              >
                <input
                  appFieldControl
                  [numeric]="true"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  [value]="st.amount()"
                  [disabled]="saving()"
                  (input)="st.set('amount', val($event))"
                  (blur)="st.touch('amount')"
                />
              </app-form-field>
              @if (st.formError(); as fe) {
                <div class="form-error" role="alert">{{ fe }}</div>
              }
            }
            @case ('reversed') {
              <p class="drawer-instruction">
                <app-num-text
                  [text]="
                    'Use this when the M-Pesa payment of ' +
                    formatKshExact(st.effective()?.amount ?? 0) +
                    ' was reversed and the money came back. The ' +
                    st.copy.subject +
                    ' will show as not sent until you record a new payout.'
                  "
                />
              </p>
              <app-form-field
                label="Reversal M-Pesa code"
                hint="The code M-Pesa gave for the reversal."
                [error]="st.shown('reference')"
              >
                <input
                  #referenceInput
                  appFieldControl
                  [numeric]="true"
                  class="is-upper"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="64"
                  placeholder="e.g. SLK4H7XQ2P"
                  [value]="st.reference()"
                  [disabled]="saving()"
                  (input)="st.set('reference', val($event))"
                  (blur)="st.touch('reference')"
                />
              </app-form-field>
            }
            @case ('resent') {
              <p class="drawer-instruction">
                <app-num-text
                  [text]="
                    'Send ' +
                    formatKshExact(st.decidedAmount()) +
                    ' to ' +
                    st.copy.payee +
                    ' by M-Pesa again, then enter the new receipt here.'
                  "
                />
              </p>
              @if (!hasPhone()) {
                <div class="drawer-caption">{{ st.copy.missingPhone }}</div>
              }
              <app-form-field label="M-Pesa receipt" [error]="st.shown('reference')">
                <input
                  #referenceInput
                  appFieldControl
                  [numeric]="true"
                  class="is-upper"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="64"
                  placeholder="e.g. SLK4H7XQ2P"
                  [value]="st.reference()"
                  [disabled]="saving()"
                  (input)="st.set('reference', val($event))"
                  (blur)="st.touch('reference')"
                />
              </app-form-field>
              <app-form-field
                label="Amount sent"
                prefix="KSh"
                [hint]="'Up to ' + formatKshExact(st.ceiling()) + '.'"
                [error]="st.shown('amount')"
              >
                <input
                  appFieldControl
                  [numeric]="true"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  [value]="st.amount()"
                  [disabled]="saving()"
                  (input)="st.set('amount', val($event))"
                  (blur)="st.touch('amount')"
                />
              </app-form-field>
            }
          }
          <app-form-field
            label="Reason"
            [hint]="st.copy.reasonHint"
            [counter]="st.reason().length + '/' + reasonMax"
            [error]="st.shown('reason')"
          >
            <textarea
              appFieldControl
              rows="3"
              [attr.maxlength]="reasonMax"
              [value]="st.reason()"
              [disabled]="saving()"
              (input)="st.set('reason', val($event))"
              (blur)="st.touch('reason')"
            ></textarea>
          </app-form-field>
          <div class="drawer-actions">
            @if (!st.reversed()) {
              <button
                type="button"
                class="btn btn-outline"
                [disabled]="saving()"
                (click)="cancel()"
              >
                Cancel
              </button>
            }
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="st.invalid() || saving()"
              (click)="submit()"
            >
              {{ submitLabels[st.formKind()] }}
            </button>
          </div>
        </div>
      </section>
    } @else {
      <section class="drawer-section">
        <div class="drawer-actions">
          <button #recordCorrection type="button" class="btn btn-outline" (click)="openForm()">
            Record a correction
          </button>
        </div>
      </section>
    }
  `,
  styles: [],
})
export class PayoutCorrectionFormComponent {
  private readonly injector = inject(Injector);

  readonly state = input.required<CorrectionFormState>();
  readonly saving = input(false);
  /** False when the payee's M-Pesa number is unknown (re-send caption). */
  readonly hasPhone = input(true);

  /** Valid and confirmed by the admin's click: the drawer confirms and saves. */
  readonly submitted = output<void>();
  /** Cancel with typed input: the drawer asks `Discard this correction?`. */
  readonly discardRequested = output<void>();

  private readonly referenceInput = viewChild<ElementRef<HTMLInputElement>>('referenceInput');
  private readonly recordButton = viewChild<ElementRef<HTMLButtonElement>>('recordCorrection');

  protected readonly kinds = CORRECTION_KINDS;
  protected readonly submitLabels = CORRECTION_SUBMIT;
  protected readonly reasonMax = CORRECTION_REASON_MAX;

  /** `Current: {receipt}` with the receipt as its own Fira Code part (m-11). */
  protected readonly receiptHintParts = computed<TextPart[]>(() => {
    const reference = this.state().effective()?.reference;
    return [
      { text: 'Leave empty if the receipt was right. Current: ', num: false },
      reference ? { text: reference, num: true } : { text: '—', num: false },
    ];
  });

  /** Focuses the receipt / code input when the form is open; false otherwise. */
  focusReference(): boolean {
    const el = this.referenceInput()?.nativeElement;
    el?.focus();
    return !!el;
  }

  protected openForm(): void {
    this.state().reset();
    this.state().open.set(true);
    afterNextRender(() => this.focusReference(), { injector: this.injector });
  }

  /** Closes the form; focus returns to `Record a correction` (m-10). */
  close(): void {
    this.state().reset();
    afterNextRender(() => this.recordButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected cancel(): void {
    if (this.state().dirty()) {
      this.discardRequested.emit();
      return;
    }
    this.close();
  }

  protected submit(): void {
    const st = this.state();
    st.touchAll();
    if (st.invalid() || this.saving()) return;
    this.submitted.emit();
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected readonly formatKshExact = formatKshExact;
}
