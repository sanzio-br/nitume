import { NumTextComponent } from '../../../shared/num-text.component';
import { Component, computed, inject, input, signal } from '@angular/core';
import { ApiErrorInfo, FORBIDDEN_COPY } from '../../../core/api-error';
import type { Errand, MerchantDetailsDto } from '../../../core/api-types';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import {
  SegmentOption,
  SegmentedToggleComponent,
} from '../../../shared/segmented-toggle.component';
import { statusLabel } from '../../../shared/status-chip.component';
import { AdminDataService } from '../admin-data.service';

/** Categories with an item amount (row 45; AQ-4 default). */
const MERCHANT_CATEGORIES = ['buy_for_me', 'pickup_delivery'];
/**
 * Read-only states: the API's terminal states (`errand_closed`). Not the
 * store's TERMINAL list, which also has COMPLETED and CONFIRMED.
 */
export const MERCHANT_READ_ONLY = ['SETTLED', 'CANCELLED', 'FAILED', 'EXPIRED'];
/** Changing existing details from PAYMENT_CONFIRMED on asks first. */
const PAID_OR_LATER = [
  'PAYMENT_CONFIRMED',
  'RUNNER_ASSIGNED',
  'RUNNER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER',
  'COMPLETED',
  'CONFIRMED',
  'DISPUTED',
];

export const NAME_ERROR = "Enter the merchant's name (at least 2 characters).";
export const TILL_ERROR = 'Enter a Till number of 5 to 10 digits.';
export const PAYBILL_ERROR = 'Enter a Paybill number of 5 to 10 digits.';
export const ACCOUNT_ERROR = 'Account number can be up to 40 characters.';

export type PayType = 'till' | 'paybill';

export interface MerchantForm {
  name: string;
  type: PayType;
  till: string;
  paybill: string;
  account: string;
}

type FieldKey = 'name' | 'till' | 'paybill' | 'account';

export function showsMerchantSection(e: Errand): boolean {
  return (
    MERCHANT_CATEGORIES.includes(e.category) ||
    !!(
      e.merchantName ||
      e.merchantTillNumber ||
      e.merchantPaybillNumber ||
      e.merchantAccountReference
    )
  );
}

export function validateMerchantForm(f: MerchantForm): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  const name = f.name.trim();
  if (name.length < 2 || name.length > 120) errors.name = NAME_ERROR;
  if (f.type === 'till') {
    if (!/^\d{5,10}$/.test(f.till.trim())) errors.till = TILL_ERROR;
  } else {
    if (!/^\d{5,10}$/.test(f.paybill.trim())) errors.paybill = PAYBILL_ERROR;
    if (f.account.trim().length > 40) errors.account = ACCOUNT_ERROR;
  }
  return errors;
}

/** Never both numbers; account only with a Paybill; empty optionals omitted. */
export function buildMerchantBody(f: MerchantForm): MerchantDetailsDto {
  const merchantName = f.name.trim();
  if (f.type === 'till') {
    return { merchantName, tillNumber: f.till.trim() };
  }
  const account = f.account.trim();
  return account
    ? { merchantName, paybillNumber: f.paybill.trim(), accountReference: account }
    : { merchantName, paybillNumber: f.paybill.trim() };
}

function formFromErrand(e: Errand): MerchantForm {
  return {
    name: e.merchantName ?? '',
    type: e.merchantPaybillNumber ? 'paybill' : 'till',
    till: e.merchantTillNumber ?? '',
    paybill: e.merchantPaybillNumber ?? '',
    account: e.merchantAccountReference ?? '',
  };
}

function hasDetails(e: Errand): boolean {
  return !!(e.merchantTillNumber || e.merchantPaybillNumber);
}

/**
 * Merchant payment details section of the task drawer (row 43): ops enter
 * or correct the merchant's Till (Buy Goods) or Paybill so the customer can
 * pay the merchant directly. Edits in place; no modal except the A-08
 * warning when changing details after payment.
 */
@Component({
  selector: 'app-merchant-details-section',
  imports: [
    NumTextComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    InlineNoticeComponent,
    SegmentedToggleComponent,
  ],
  template: `
    @if (shown()) {
      <section class="drawer-section">
        <div class="drawer-label">Merchant payment details</div>
        @if (notice(); as n) {
          <app-inline-notice
            [tone]="n.tone"
            [dismissible]="true"
            [autoDismissMs]="n.tone === 'success' ? 6000 : 0"
            (dismissed)="notice.set(null)"
            ><app-num-text [text]="n.text"
          /></app-inline-notice>
        }
        @if (editing()) {
          <div class="drawer-card drawer-stack">
            <app-form-field label="Merchant name" [error]="shown_('name')">
              <input
                appFieldControl
                type="text"
                autocomplete="organization"
                maxlength="120"
                [value]="form().name"
                (input)="set('name', $event)"
                (blur)="touch('name')"
              />
            </app-form-field>
            <div class="field">
              <span class="field-label" id="merchant-pay-with">Pay with</span>
              <app-segmented-toggle
                ariaLabel="Pay with"
                [options]="payOptions"
                [value]="form().type"
                [disabled]="saving()"
                (valueChange)="setType($event)"
              />
            </div>
            @if (form().type === 'till') {
              <app-form-field label="Till number" [error]="shown_('till')">
                <input
                  appFieldControl
                  [numeric]="true"
                  type="text"
                  inputmode="numeric"
                  pattern="\\d*"
                  maxlength="10"
                  autocomplete="off"
                  placeholder="e.g. 5123456"
                  [value]="form().till"
                  (input)="set('till', $event)"
                  (blur)="touch('till')"
                />
              </app-form-field>
            } @else {
              <app-form-field label="Paybill number" [error]="shown_('paybill')">
                <input
                  appFieldControl
                  [numeric]="true"
                  type="text"
                  inputmode="numeric"
                  pattern="\\d*"
                  maxlength="10"
                  autocomplete="off"
                  placeholder="e.g. 247247"
                  [value]="form().paybill"
                  (input)="set('paybill', $event)"
                  (blur)="touch('paybill')"
                />
              </app-form-field>
              <app-form-field
                label="Account number (optional)"
                hint="Only if the merchant gave you one."
                [error]="shown_('account')"
              >
                <input
                  appFieldControl
                  [numeric]="true"
                  type="text"
                  maxlength="40"
                  autocomplete="off"
                  [value]="form().account"
                  (input)="set('account', $event)"
                  (blur)="touch('account')"
                />
              </app-form-field>
            }
            <div class="drawer-actions">
              <button
                type="button"
                class="btn btn-outline"
                [disabled]="saving()"
                (click)="cancel()"
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="saving() || !valid() || !changed()"
                (click)="save()"
              >
                {{ saving() ? 'Saving…' : 'Save details' }}
              </button>
            </div>
          </div>
        } @else if (hasDetails()) {
          <div class="drawer-card">
            <div class="drawer-row">
              <span>Merchant</span><b class="txt">{{ errand().merchantName ?? '—' }}</b>
            </div>
            @if (errand().merchantTillNumber) {
              <div class="drawer-row">
                <span>Till number (Buy Goods)</span><b>{{ errand().merchantTillNumber }}</b>
              </div>
            } @else {
              <div class="drawer-row">
                <span>Paybill number</span><b>{{ errand().merchantPaybillNumber }}</b>
              </div>
              @if (errand().merchantAccountReference) {
                <div class="drawer-row">
                  <span>Account number</span><b>{{ errand().merchantAccountReference }}</b>
                </div>
              }
            }
            @if (!readOnly()) {
              <div class="drawer-card-foot">
                <button type="button" class="btn btn-text btn-sm" (click)="startEdit()">
                  Edit
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="drawer-card">
            <div class="drawer-muted">
              No merchant details yet. The customer can't pay the merchant directly until you add
              them.
            </div>
            @if (!readOnly()) {
              <button type="button" class="btn btn-outline btn-sm" (click)="startEdit()">
                Add merchant details
              </button>
            }
          </div>
        }
      </section>

      <app-confirm-dialog
        [open]="confirmOpen()"
        title="Change the merchant details?"
        confirmLabel="Save changes"
        [busy]="saving()"
        (confirmed)="send()"
        (cancelled)="confirmOpen.set(false)"
      >
        <p>
          The customer may already be paying the current {{ currentKind() }}
          <span class="num">{{ currentNumber() }}</span
          >. Let them know before you change it.
        </p>
      </app-confirm-dialog>
    }
  `,
  styles: [],
})
export class MerchantDetailsSectionComponent {
  private readonly s = inject(AdminDataService);

  readonly errand = input.required<Errand>();

  protected readonly payOptions: SegmentOption[] = [
    { value: 'till', label: 'Till (Buy Goods)' },
    { value: 'paybill', label: 'Paybill' },
  ];

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly notice = signal<{ tone: NoticeTone; text: string } | null>(null);
  protected readonly form = signal<MerchantForm>({
    name: '',
    type: 'till',
    till: '',
    paybill: '',
    account: '',
  });
  private readonly touched = signal<Set<FieldKey>>(new Set());
  private readonly serverErrors = signal<Partial<Record<FieldKey, string>>>({});
  private initial: MerchantForm | null = null;

  protected readonly shown = computed(() => showsMerchantSection(this.errand()));
  protected readonly readOnly = computed(() => MERCHANT_READ_ONLY.includes(this.errand().status));
  protected readonly hasDetails = computed(() => hasDetails(this.errand()));
  private readonly errors = computed(() => validateMerchantForm(this.form()));
  protected readonly valid = computed(() => Object.keys(this.errors()).length === 0);
  protected readonly changed = computed(() => {
    if (!this.initial) return true;
    const a = buildMerchantBody(this.form());
    const b = hasDetails(this.errand()) ? buildMerchantBody(this.initial) : null;
    return JSON.stringify(a) !== JSON.stringify(b);
  });
  protected readonly currentKind = computed(() =>
    this.errand().merchantTillNumber ? 'Till' : 'Paybill',
  );
  protected readonly currentNumber = computed(
    () => this.errand().merchantTillNumber ?? this.errand().merchantPaybillNumber ?? '',
  );

  protected startEdit(): void {
    this.initial = formFromErrand(this.errand());
    this.form.set({ ...this.initial });
    this.touched.set(new Set());
    this.serverErrors.set({});
    this.notice.set(null);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
    this.notice.set(null);
  }

  protected set(key: Exclude<keyof MerchantForm, 'type'>, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [key]: value }));
    if (this.serverErrors()[key]) this.serverErrors.update((e) => ({ ...e, [key]: undefined }));
  }

  /** Switching type keeps the other type's typed value; only the selected one is sent. */
  protected setType(type: string): void {
    this.form.update((f) => ({ ...f, type: type as PayType }));
  }

  protected touch(key: FieldKey): void {
    this.touched.update((t) => new Set(t).add(key));
  }

  protected shown_(key: FieldKey): string | null {
    return (
      this.serverErrors()[key] ?? (this.touched().has(key) ? (this.errors()[key] ?? null) : null)
    );
  }

  protected save(): void {
    if (!this.valid() || this.saving()) {
      this.touched.set(new Set<FieldKey>(['name', 'till', 'paybill', 'account']));
      return;
    }
    if (hasDetails(this.errand()) && PAID_OR_LATER.includes(this.errand().status)) {
      this.confirmOpen.set(true);
      return;
    }
    void this.send();
  }

  protected async send(): Promise<void> {
    const first = !hasDetails(this.errand());
    this.saving.set(true);
    this.notice.set(null);
    try {
      await this.s.setMerchantDetails(this.errand().id, buildMerchantBody(this.form()));
      this.editing.set(false);
      this.notice.set({
        tone: 'success',
        text: first
          ? 'Merchant details saved. The customer can now pay the merchant directly.'
          : 'Merchant details updated.',
      });
    } catch (e) {
      await this.handleError(e as ApiErrorInfo);
    } finally {
      this.saving.set(false);
      this.confirmOpen.set(false);
    }
  }

  private async handleError(err: ApiErrorInfo): Promise<void> {
    if (err.status === 400 && err.code === 'merchant_details_invalid') {
      this.notice.set({
        tone: 'danger',
        text: 'Give either a Till number or a Paybill number. An account number only goes with a Paybill.',
      });
    } else if (err.status === 400) {
      const fieldErrors: Partial<Record<FieldKey, string>> = {};
      for (const m of err.messages) {
        if (m.startsWith('tillNumber')) fieldErrors.till = TILL_ERROR;
        else if (m.startsWith('paybillNumber')) fieldErrors.paybill = PAYBILL_ERROR;
        else if (m.startsWith('merchantName')) fieldErrors.name = NAME_ERROR;
        else if (m.startsWith('accountReference')) fieldErrors.account = ACCOUNT_ERROR;
      }
      this.serverErrors.set(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        this.notice.set({ tone: 'danger', text: "Couldn't save the merchant details. Try again." });
      }
    } else if (err.status === 409 && err.code === 'errand_closed') {
      this.editing.set(false);
      await this.s.loadErrandDetail(this.errand().id, { quiet: true });
      this.notice.set({
        tone: 'info',
        text: `This task is ${statusLabel(this.errand().status)} and can no longer be edited.`,
      });
    } else if (err.status === 404) {
      this.editing.set(false);
      this.notice.set({ tone: 'info', text: 'This task no longer exists.' });
    } else if (err.status === 403) {
      this.notice.set({ tone: 'danger', text: FORBIDDEN_COPY });
    } else {
      this.notice.set({ tone: 'danger', text: "Couldn't save the merchant details. Try again." });
    }
  }
}
