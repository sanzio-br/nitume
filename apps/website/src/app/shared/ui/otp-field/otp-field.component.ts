// `nm-otp-field` (customer-v-auth-otp §Components; port of C-26
// OtpCodeField). One real input laid over six aria-hidden boxes, so typing,
// paste and SMS autofill (`autocomplete="one-time-code"`) all reach it.
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

@Component({
  selector: 'nm-otp-field',
  template: `
    <div class="nm-otp">
      <div class="nm-otp__row">
        @for (digit of boxes(); track $index) {
          <span
            class="nm-otp__box"
            [class.nm-otp__box--filled]="digit !== null"
            [class.nm-otp__box--error]="!!error()"
            [class.nm-otp__box--focus]="focused() && $index === focusIndex()"
            aria-hidden="true"
          >
            @if (digit !== null) {
              <span class="nm-otp__digit">{{ digit }}</span>
            } @else {
              <span class="nm-otp__placeholder">•</span>
            }
          </span>
        }
        <input
          class="nm-otp__input"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]*"
          spellcheck="false"
          autocorrect="off"
          [attr.maxlength]="length()"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.aria-describedby]="error() ? errorId : null"
          [disabled]="isDisabled()"
          [value]="value()"
          (input)="onInput($event)"
          (paste)="onPaste($event)"
          (focus)="focused.set(true)"
          (blur)="onBlur()"
        />
      </div>
      @if (error(); as message) {
        <p class="nm-otp__error" [id]="errorId" role="alert">{{ message }}</p>
      }
    </div>
  `,
  styleUrl: './otp-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NmOtpField), multi: true },
  ],
})
export class NmOtpField implements ControlValueAccessor, AfterViewInit {
  readonly length = input(6);
  readonly disabled = input(false);
  /** Every border red and the message under the row (OA-13). */
  readonly error = input<string | null>(null);
  readonly ariaLabel = input('Verification code, 6 digits');
  readonly autofocus = input(true);

  readonly codeChange = output<string>();
  /** Fires once each time the last digit arrives. */
  readonly completed = output<string>();

  protected readonly errorId = `nm-otp-error-${nextId++}`;
  protected readonly value = signal('');
  protected readonly focused = signal(false);
  private readonly disabledByForm = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());

  protected readonly boxes = computed(() =>
    Array.from({ length: this.length() }, (_, i) => this.value()[i] ?? null),
  );
  /** The box after the last digit (the last box once full). */
  protected readonly focusIndex = computed(() => Math.min(this.value().length, this.length() - 1));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngAfterViewInit(): void {
    if (this.autofocus()) this.focus();
  }

  focus(): void {
    this.input()?.focus();
  }

  /** Empties the boxes (wrong code, new code sent). */
  clear(): void {
    const el = this.input();
    if (el) el.value = '';
    this.update('');
  }

  writeValue(value: unknown): void {
    this.value.set(this.digits(value === null || value === undefined ? '' : String(value)));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled);
  }

  protected onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const next = this.digits(el.value);
    if (el.value !== next) el.value = next;
    this.update(next);
  }

  /** `123 456` or `Your code is 123456` → the first six digits. */
  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    event.preventDefault();
    const next = this.digits(text);
    const el = this.input();
    if (el) el.value = next;
    this.update(next);
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.onTouched();
  }

  /** The real input (a DOM lookup, not a view query: WQ-33 bundle). */
  private input(): HTMLInputElement | null {
    return this.host.querySelector('input.nm-otp__input');
  }

  private digits(text: string): string {
    return text.replace(/\D/g, '').slice(0, this.length());
  }

  private update(next: string): void {
    const before = this.value();
    if (next === before) return;
    this.value.set(next);
    this.onChange(next);
    this.codeChange.emit(next);
    if (next.length === this.length() && before.length !== this.length()) {
      this.completed.emit(next);
    }
  }
}
