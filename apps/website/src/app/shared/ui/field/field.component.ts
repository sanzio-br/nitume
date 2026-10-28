// `nm-field` (ui-kit spec §4.5; design-system `.field-label` + `.field-input`,
// owner Q12/OA-12: white fill, r-s 8, green focus; Flutter NitumeField C-17).
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NmNum } from '../../format/num.directive';
import { formatCounter } from '../../format/formatters';

export type NmFieldKind = 'text' | 'multiline' | 'money' | 'phone';

let nextId = 0;

@Component({
  selector: 'nm-field',
  imports: [NmNum],
  templateUrl: './field.component.html',
  styleUrl: './field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NmField), multi: true },
  ],
})
export class NmField implements ControlValueAccessor {
  readonly label = input<string | null>(null);
  readonly kind = input<NmFieldKind>('text');
  readonly placeholder = input<string | null>(null);
  /** Inline error under the field (`role="alert"`). */
  readonly error = input<string | null>(null);
  readonly maxLength = input<number | null>(null);
  /** Shows the Fira Code `n/max` counter (only when a view spec asks). */
  readonly counter = input(false);
  readonly readonly = input(false);
  readonly disabled = input(false);
  readonly autocomplete = input<string | null>(null);

  protected readonly id = `nm-field-${nextId++}`;
  protected readonly errorId = `${this.id}-error`;

  protected readonly value = signal('');
  private readonly disabledByForm = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());

  protected readonly isNumeric = computed(() => this.kind() === 'money' || this.kind() === 'phone');

  /** Multiline: 3 rows minimum, grows to 6, then scrolls. */
  protected readonly rows = computed(() =>
    Math.min(6, Math.max(3, this.value().split('\n').length)),
  );

  protected readonly counterText = computed(() => {
    const max = this.maxLength();
    return max ? formatCounter(this.value().length, max) : null;
  });

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.value.set(value === null || value === undefined ? '' : String(value));
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
    const el = event.target as HTMLInputElement | HTMLTextAreaElement;
    let next = el.value;
    if (this.kind() === 'money') {
      // Whole shillings, digits only.
      next = next.replace(/\D/g, '');
      if (next !== el.value) el.value = next;
    }
    this.value.set(next);
    this.onChange(next);
  }
}
