import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { InlineNoticeComponent } from '../../../shared/inline-notice.component';
import { apiError } from '../../../core/api-error';
import type { ChangeUserStatusResult } from '../../../core/api-types';
import { ApiService } from '../../../core/services/api.service';
import {
  ACTION_TARGET,
  AccountAction,
  AccountAudience,
  OPEN_TASKS_NOTE,
  REASON_MAX,
  StatusChangeFailure,
  actionCopy,
  reasonError,
  reasonHint,
  reasonValid,
  statusChangeFailure,
} from './user-status';

/**
 * Suspend / Ban / Reactivate dialog (drawer-user-status §3.2): A-08 form
 * mode with a required internal reason, 10-500 characters after trimming.
 * One component for the three actions and both audiences. The reason is
 * sent as typed (the API trims). Errors that belong to the section (§7)
 * close the dialog through `failed`; the rest stay in the dialog.
 *
 * While a reason is typed, the drawer's close guard calls `askDiscard()`:
 * the same dialog asks `Discard this reason?` (`Back` · `Discard`).
 */
@Component({
  selector: 'app-user-status-dialog',
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
      [title]="discarding() ? 'Discard this reason?' : copy().title"
      [confirmLabel]="discarding() ? 'Discard' : copy().confirm"
      [busyLabel]="copy().busy"
      [busy]="busy()"
      [confirmDisabled]="!discarding() && (!valid() || locked())"
      (confirmed)="discarding() ? discard() : confirm()"
      (cancelled)="discarding() ? backToForm() : closed.emit()"
    >
      @if (!discarding()) {
        <p>{{ copy().body }}</p>
        @if (action() !== 'reactivate') {
          <p>{{ openTasksNote }}</p>
        }
        @if (dialogError(); as text) {
          <app-inline-notice tone="danger">{{ text }}</app-inline-notice>
        }
        <app-form-field
          label="Reason"
          [hint]="hint()"
          [plainHint]="true"
          [counter]="reason().length + '/' + max"
          [counterError]="!!error()"
          [error]="error()"
        >
          <textarea
            appFieldControl
            data-autofocus
            rows="4"
            [attr.maxlength]="max"
            [value]="reason()"
            (input)="onInput($event)"
            (blur)="touched.set(true)"
          ></textarea>
        </app-form-field>
      }
    </app-confirm-dialog>
  `,
  styles: [],
})
export class UserStatusDialogComponent {
  private readonly api = inject(ApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly open = input(false);
  readonly userId = input.required<string>();
  readonly action = input.required<AccountAction>();
  readonly audience = input.required<AccountAudience>();

  readonly closed = output<void>();
  readonly changed = output<ChangeUserStatusResult>();
  /** A section-level failure (§7): the parent closes the dialog and shows it. */
  readonly failed = output<StatusChangeFailure & { kind: 'section' }>();

  protected readonly max = REASON_MAX;
  protected readonly openTasksNote = OPEN_TASKS_NOTE;
  protected readonly reason = signal('');
  protected readonly touched = signal(false);
  protected readonly busy = signal(false);
  /** 403 without a code: the confirm stays disabled. */
  protected readonly locked = signal(false);
  protected readonly discarding = signal(false);
  private readonly serverError = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  private pendingLeave: (() => void) | null = null;

  protected readonly copy = computed(() => actionCopy(this.action(), this.audience()));
  protected readonly hint = computed(() => reasonHint(this.audience()));
  protected readonly valid = computed(() => reasonValid(this.reason()));
  protected readonly error = computed(
    () => this.serverError() ?? (this.touched() ? reasonError(this.reason()) : null),
  );

  /** A reason is typed: closing the drawer asks first. */
  readonly dirty = computed(() => this.open() && this.reason().trim().length > 0);
  readonly saving = this.busy.asReadonly();

  constructor() {
    effect(() => {
      if (this.open()) {
        this.reason.set('');
        this.touched.set(false);
        this.serverError.set(null);
        this.dialogError.set(null);
        this.locked.set(false);
        this.discarding.set(false);
        this.pendingLeave = null;
      }
    });
  }

  /** Close guard: switch to `Discard this reason?`; `proceed` runs on Discard. */
  askDiscard(proceed: () => void): void {
    this.pendingLeave = proceed;
    this.discarding.set(true);
    this.focusLater('.confirm-actions .btn-outline');
  }

  protected backToForm(): void {
    this.pendingLeave = null;
    this.discarding.set(false);
    this.focusLater('textarea');
  }

  protected discard(): void {
    const leave = this.pendingLeave;
    this.pendingLeave = null;
    this.discarding.set(false);
    this.closed.emit();
    leave?.();
  }

  protected onInput(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
    this.serverError.set(null);
  }

  protected async confirm(): Promise<void> {
    this.touched.set(true);
    if (!this.valid() || this.busy() || this.locked()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      const res = await firstValueFrom(
        this.api.changeUserStatus(this.userId(), ACTION_TARGET[this.action()], this.reason()),
      );
      this.changed.emit(res);
    } catch (e) {
      const f = statusChangeFailure(apiError(e));
      if (f.kind === 'field') this.serverError.set(f.text);
      else if (f.kind === 'dialog') {
        this.dialogError.set(f.text);
        if (f.locked) this.locked.set(true);
      } else if (f.kind === 'section') this.failed.emit(f);
    } finally {
      this.busy.set(false);
    }
  }

  private focusLater(selector: string): void {
    afterNextRender(
      () =>
        this.host.nativeElement.querySelector<HTMLElement>(`.confirm-card ${selector}`)?.focus(),
      { injector: this.injector },
    );
  }
}
