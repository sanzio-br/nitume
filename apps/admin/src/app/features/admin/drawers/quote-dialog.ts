import { NumTextComponent } from '../../../shared/num-text.component';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { AdminDataService, shortId } from '../admin-data.service';
import {
  eatLocalInputToIso,
  formatDateTimeEat,
  formatKshExact,
  isBlank,
  parseKsh,
  toEatLocalInput,
} from '../shared-format';
import { ApiErrorInfo, FORBIDDEN_COPY } from '../../../core/api-error';
import {
  QUOTE_COMPONENTS,
  type Quote,
  type QuoteComponent,
  type QuoteErrandDto,
  type QuoteErrandResult,
} from '../../../core/api-types';

/** 422 `location_outside_service_area` (row 233, `drawer-task-requote.md` Errors). */
export const OUTSIDE_SERVICE_AREA_COPY =
  "This task's location is outside every service area, so it can't be quoted. The customer is told and can cancel it.";

const COMPONENT_LABELS: Record<QuoteComponent, string> = {
  baseFee: 'Base fee',
  distanceFee: 'Distance fee',
  timeFee: 'Time fee',
  urgencyFee: 'Urgency fee',
  complexityFee: 'Complexity fee',
  premiumFee: 'Premium fee',
};

export const TOTAL_ERROR = 'Enter a total between KSh 1 and KSh 10,000,000.';
export const AMOUNT_ERROR = 'Enter an amount in KSh, up to 2 decimal places.';
export const EXPIRY_ERROR = 'Choose a time in the future.';
const MIN_LEAD_MS = 5 * 60 * 1000;

type FieldKey = 'total' | QuoteComponent | 'expiresAt';

export interface QuoteForm {
  total: string;
  components: Record<QuoteComponent, string>;
  expiresAt: string;
  note: string;
}

/** Field errors for the quote form (mirrors `QuoteErrandDto`). */
export function validateQuoteForm(
  form: QuoteForm,
  now: Date = new Date(),
): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  const total = parseKsh(form.total);
  if (total === null || total < 1 || total > 10_000_000) errors.total = TOTAL_ERROR;
  for (const key of QUOTE_COMPONENTS) {
    const raw = form.components[key];
    if (!isBlank(raw) && parseKsh(raw) === null) errors[key] = AMOUNT_ERROR;
  }
  const iso = eatLocalInputToIso(form.expiresAt);
  if (!iso || new Date(iso).getTime() <= now.getTime() + MIN_LEAD_MS) {
    errors.expiresAt = EXPIRY_ERROR;
  }
  return errors;
}

/** Request body: numbers only, empty components omitted, explicit offset. */
export function buildQuoteBody(form: QuoteForm): QuoteErrandDto {
  const body: QuoteErrandDto = {
    total: parseKsh(form.total)!,
    expiresAt: eatLocalInputToIso(form.expiresAt)!,
  };
  for (const key of QUOTE_COMPONENTS) {
    const value = parseKsh(form.components[key]);
    if (!isBlank(form.components[key]) && value !== null) body[key] = value;
  }
  const note = form.note.trim();
  if (note) body.note = note;
  return body;
}

export function quoteExpired(q: Pick<Quote, 'expiresAt'> | null, now: number): boolean {
  return !!q?.expiresAt && new Date(q.expiresAt).getTime() <= now;
}

function emptyComponents(): Record<QuoteComponent, string> {
  return Object.fromEntries(QUOTE_COMPONENTS.map((k) => [k, ''])) as Record<QuoteComponent, string>;
}

/** What the parent shows after the dialog closed on a conflict. */
export interface QuoteConflict {
  error: ApiErrorInfo;
}

/**
 * Issue quote / Issue new quote dialog (A-08 form mode). `previous` set =
 * re-quote of an expired quote (prefilled). Saves through the store; on a
 * 409 it closes and hands the error to the parent, which reloads.
 */
@Component({
  selector: 'app-quote-dialog',
  imports: [
    NumTextComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    InlineNoticeComponent,
  ],
  template: `
    <app-confirm-dialog
      [open]="open()"
      [form]="true"
      [title]="previous() ? 'Issue new quote' : 'Issue quote'"
      [confirmLabel]="previous() ? 'Issue new quote' : 'Issue quote'"
      busyLabel="Issuing…"
      [busy]="saving()"
      [confirmDisabled]="!valid()"
      (confirmed)="submit()"
      (cancelled)="closed.emit()"
    >
      @if (previous(); as p) {
        <p>
          The last quote for <span class="num">{{ shortId(errandId()) }}</span> expired
          <span class="num">{{ formatDateTimeEat(p.expiresAt) }}</span
          >. {{ staysLine() }}
        </p>
      } @else {
        <p>
          Enter the quote for <span class="num">{{ shortId(errandId()) }}</span
          >.
        </p>
      }
      @if (notice(); as n) {
        <app-inline-notice [tone]="n.tone"><app-num-text [text]="n.text" /></app-inline-notice>
      }
      <div class="form-grid">
        <app-form-field class="span-2" label="Total (KSh)" prefix="KSh" [error]="shown('total')">
          <input
            appFieldControl
            [numeric]="true"
            data-autofocus
            type="text"
            inputmode="decimal"
            autocomplete="off"
            [value]="total()"
            (input)="total.set(val($event)); revalidate('total')"
            (blur)="touch('total')"
          />
        </app-form-field>
        @for (key of componentKeys; track key) {
          <app-form-field [label]="componentLabels[key]" prefix="KSh" [error]="shown(key)">
            <input
              appFieldControl
              [numeric]="true"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              [value]="components()[key]"
              (input)="setComponent(key, val($event))"
              (blur)="touch(key)"
            />
          </app-form-field>
        }
        <div class="span-2">
          <div class="field-hint">Fee breakdown is internal. The customer sees only the total.</div>
          @if (sumLine(); as line) {
            <div class="field-hint num">{{ line }}</div>
          }
        </div>
        <app-form-field
          class="span-2"
          label="Valid until"
          hint="East Africa Time"
          [error]="shown('expiresAt')"
        >
          <input
            appFieldControl
            [numeric]="true"
            type="datetime-local"
            [value]="expiresAt()"
            (input)="expiresAt.set(val($event)); revalidate('expiresAt')"
            (blur)="touch('expiresAt')"
          />
        </app-form-field>
        <app-form-field class="span-2" label="Note (optional)" [counter]="note().length + '/500'">
          <textarea
            appFieldControl
            rows="2"
            maxlength="500"
            [value]="note()"
            (input)="note.set(val($event))"
          ></textarea>
        </app-form-field>
      </div>
    </app-confirm-dialog>
  `,
  styles: [],
})
export class QuoteDialogComponent {
  private readonly s = inject(AdminDataService);

  readonly open = input(false);
  readonly errandId = input.required<string>();
  /** The expired quote being replaced; null for a first quote. */
  readonly previous = input<Quote | null>(null);
  /** Errand status at open (copy differs for ACCEPTED, row 72). */
  readonly errandStatus = input<string>('');

  readonly closed = output<void>();
  readonly issued = output<QuoteErrandResult>();
  readonly conflict = output<QuoteConflict>();

  protected readonly total = signal('');
  protected readonly components = signal<Record<QuoteComponent, string>>(emptyComponents());
  protected readonly expiresAt = signal('');
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly notice = signal<{ tone: NoticeTone; text: string } | null>(null);
  private readonly touched = signal<Set<FieldKey>>(new Set());
  private readonly serverErrors = signal<Partial<Record<FieldKey, string>>>({});

  protected readonly componentKeys = QUOTE_COMPONENTS;
  protected readonly componentLabels = COMPONENT_LABELS;

  private readonly form = computed<QuoteForm>(() => ({
    total: this.total(),
    components: this.components(),
    expiresAt: this.expiresAt(),
    note: this.note(),
  }));
  private readonly errors = computed(() => validateQuoteForm(this.form()));
  protected readonly valid = computed(() => Object.keys(this.errors()).length === 0);

  protected readonly sumLine = computed(() => {
    const filled = QUOTE_COMPONENTS.filter((k) => !isBlank(this.components()[k]));
    if (filled.length === 0) return null;
    const values = filled.map((k) => parseKsh(this.components()[k]));
    if (values.some((v) => v === null)) return null;
    const sum = Math.round(values.reduce((a, b) => a! + b!, 0)! * 100) / 100;
    const total = parseKsh(this.total());
    if (total !== null && Math.abs(sum - total) < 0.005) return null;
    return `Components add up to ${formatKshExact(sum)}.`;
  });

  constructor() {
    effect(() => {
      if (this.open()) untracked(() => this.reset());
    });
  }

  protected staysLine(): string {
    return this.errandStatus() === 'ACCEPTED'
      ? 'The task stays Accepted and the customer is asked to accept the new price.'
      : 'The task stays Quoted and the customer is asked to accept the new price.';
  }

  private reset(): void {
    const p = this.previous();
    this.total.set(p ? plain(p.total) : '');
    const comps = emptyComponents();
    if (p) {
      for (const key of QUOTE_COMPONENTS) {
        if (Number(p[key]) > 0) comps[key] = plain(p[key]);
      }
    }
    this.components.set(comps);
    this.expiresAt.set(toEatLocalInput(new Date(Date.now() + 24 * 3600 * 1000)));
    this.note.set('');
    this.touched.set(new Set());
    this.serverErrors.set({});
    this.notice.set(null);
    this.saving.set(false);
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected setComponent(key: QuoteComponent, value: string): void {
    this.components.update((c) => ({ ...c, [key]: value }));
    this.revalidate(key);
  }

  protected touch(key: FieldKey): void {
    this.touched.update((t) => new Set(t).add(key));
  }

  /** Once an error was shown, re-validate on input (it is computed). */
  protected revalidate(key: FieldKey): void {
    if (this.serverErrors()[key]) {
      this.serverErrors.update((e) => ({ ...e, [key]: undefined }));
    }
  }

  protected shown(key: FieldKey): string | null {
    const server = this.serverErrors()[key];
    if (server) return server;
    return this.touched().has(key) ? (this.errors()[key] ?? null) : null;
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    if (!this.valid()) {
      this.touched.set(new Set<FieldKey>(['total', ...QUOTE_COMPONENTS, 'expiresAt']));
      return;
    }
    this.saving.set(true);
    this.notice.set(null);
    try {
      const res = await this.s.quoteErrand(this.errandId(), buildQuoteBody(this.form()));
      this.saving.set(false);
      this.issued.emit(res);
    } catch (e) {
      this.saving.set(false);
      this.handleError(e as ApiErrorInfo);
    }
  }

  private handleError(err: ApiErrorInfo): void {
    if (err.status === 409) {
      this.conflict.emit({ error: err });
      return;
    }
    if (err.status === 403) {
      this.notice.set({ tone: 'danger', text: FORBIDDEN_COPY });
    } else if (err.status === 404) {
      this.notice.set({ tone: 'info', text: 'This task no longer exists.' });
    } else if (err.code === 'location_outside_service_area') {
      // Row 233 / 236: refused at quote; the dialog stays open, the API message is never shown.
      this.notice.set({ tone: 'danger', text: OUTSIDE_SERVICE_AREA_COPY });
    } else if (err.code === 'quote_expiry_in_past') {
      // The expiry passed while the dialog was open (row 83).
      this.notice.set({ tone: 'danger', text: 'The expiry time has passed. Choose a later time.' });
      this.serverErrors.set({ expiresAt: EXPIRY_ERROR });
    } else if (err.status === 400) {
      this.notice.set({ tone: 'danger', text: 'Check the amounts and the expiry time.' });
      const fieldErrors: Partial<Record<FieldKey, string>> = {};
      for (const m of err.messages) {
        const key = m.split(' ')[0] as FieldKey;
        if (key === 'total') fieldErrors.total = TOTAL_ERROR;
        else if (key === 'expiresAt') fieldErrors.expiresAt = EXPIRY_ERROR;
        else if ((QUOTE_COMPONENTS as readonly string[]).includes(key))
          fieldErrors[key] = AMOUNT_ERROR;
      }
      this.serverErrors.set(fieldErrors);
    } else {
      // Network, 5xx or anything unexpected: inputs are kept.
      this.notice.set({ tone: 'danger', text: "Couldn't issue the quote. Try again." });
    }
  }

  protected readonly shortId = shortId;
  protected readonly formatDateTimeEat = formatDateTimeEat;
}

/** `"1450.00"` → `"1450"`, `"10.50"` → `"10.50"` for prefilled inputs. */
function plain(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
