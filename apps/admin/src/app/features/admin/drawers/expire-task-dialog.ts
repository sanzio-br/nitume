import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { InlineNoticeComponent } from '../../../shared/inline-notice.component';
import type { ApiErrorInfo } from '../../../core/api-error';
import { AdminDataService } from '../admin-data.service';
import {
  EXPIRE_REASON_MAX,
  EXPIRE_REASON_MIN,
  EXPIRE_REASON_SHORT,
  expireFailure,
} from './task-offer';

/**
 * "Expire task — no runner available" confirm (drawer-task-offer, rows 187,
 * 202, 203): A-08 with a required reason, 10–500 characters after trimming.
 * Initial focus is `Back`. A 409 closes the dialog through `refused` with
 * the spec copy; the parent reloads.
 */
@Component({
  selector: 'app-expire-task-dialog',
  imports: [
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    InlineNoticeComponent,
  ],
  template: `
    <app-confirm-dialog
      [open]="open()"
      [form]="true"
      title="Expire this task?"
      confirmLabel="Expire task"
      busyLabel="Expiring…"
      [busy]="busy()"
      [confirmDisabled]="!valid()"
      (confirmed)="confirm()"
      (cancelled)="closed.emit()"
    >
      <p>
        No runner is available for {{ taskTitle() }}. The task moves to Expired and can't be offered
        again. The customer is told no runner was available. A refund review opens because the task
        was paid.
      </p>
      @if (dialogError(); as text) {
        <app-inline-notice tone="danger">{{ text }}</app-inline-notice>
      }
      <app-form-field
        label="Reason"
        hint="Kept in the task history for audit. The customer and runners don't see it."
        [plainHint]="true"
        [counter]="reason().length + '/' + max"
        [counterError]="!!error()"
        [error]="error()"
      >
        <textarea
          appFieldControl
          rows="3"
          [attr.maxlength]="max"
          [value]="reason()"
          (input)="onInput($event)"
          (blur)="touched.set(true)"
        ></textarea>
      </app-form-field>
    </app-confirm-dialog>
  `,
  styles: [],
})
export class ExpireTaskDialogComponent {
  private readonly s = inject(AdminDataService);

  readonly open = input(false);
  readonly errandId = input.required<string>();
  readonly taskTitle = input.required<string>();

  readonly closed = output<void>();
  readonly expired = output<void>();
  /** 409: the task changed; the parent closes, reloads and shows this copy. */
  readonly refused = output<string>();

  protected readonly max = EXPIRE_REASON_MAX;
  protected readonly reason = signal('');
  protected readonly touched = signal(false);
  protected readonly busy = signal(false);
  private readonly serverError = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);

  protected readonly valid = computed(() => {
    const n = this.reason().trim().length;
    return n >= EXPIRE_REASON_MIN && n <= EXPIRE_REASON_MAX;
  });

  protected readonly error = computed(
    () => this.serverError() ?? (this.touched() && !this.valid() ? EXPIRE_REASON_SHORT : null),
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        this.reason.set('');
        this.touched.set(false);
        this.serverError.set(null);
        this.dialogError.set(null);
      }
    });
  }

  protected onInput(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
    this.serverError.set(null);
  }

  protected async confirm(): Promise<void> {
    this.touched.set(true);
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await this.s.expireErrand(this.errandId(), this.reason());
      this.expired.emit();
    } catch (e) {
      const f = expireFailure(e as ApiErrorInfo);
      if (f.kind === 'reload') this.refused.emit(f.text);
      else if (f.kind === 'field') this.serverError.set(f.text);
      else this.dialogError.set(f.text);
    } finally {
      this.busy.set(false);
    }
  }
}
