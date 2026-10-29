// `nm-radio-row` (#8 A§8; Flutter C-16 radio-row variant `NitumeRadioRow`):
// a full-width two-line pill holding a native radio (visually hidden)
// inside a `<label>`. Unselected: slate fill, slate-line border, blue
// `chip` label, slate-600 subtitle. Selected: blue fill and border, label
// and subtitle WHITE (a choice, never green). Disabled: slate-400 text,
// `aria-disabled`, no change. Arrow keys move and select within the
// enclosing radiogroup (skipping disabled rows). Accessible name
// `label. subtitle`. Focus ring on the row.
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';

@Component({
  selector: 'nm-radio-row',
  template: `
    <label class="nm-radio-row" [class.nm-radio-row--selected]="selected()" [class.nm-radio-row--disabled]="disabled()">
      <input
        type="radio"
        class="nm-radio-row__input"
        [attr.name]="name()"
        [value]="value()"
        [checked]="selected()"
        [disabled]="disabled()"
        [attr.aria-disabled]="disabled() ? 'true' : null"
        [attr.aria-label]="accessibleName()"
        (change)="onChange()"
        (keydown)="onKeydown($event)"
      />
      <span class="nm-radio-row__label" aria-hidden="true">{{ label() }}</span>
      @if (subtitle(); as sub) {
        <span class="nm-radio-row__subtitle" aria-hidden="true">{{ sub }}</span>
      }
    </label>
  `,
  styleUrl: './radio-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmRadioRow {
  readonly label = input.required<string>();
  readonly subtitle = input<string | null>(null);
  /** Radio group name shared by the rows of one group. */
  readonly name = input.required<string>();
  readonly value = input.required<string>();
  readonly selected = input(false);
  readonly disabled = input(false);

  /** The row was chosen (click, Space or an arrow key). Not emitted while disabled. */
  readonly chosen = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly accessibleName = computed(() => {
    const sub = this.subtitle()?.trim();
    return sub ? `${this.label()}. ${sub}` : this.label();
  });

  protected onChange(): void {
    if (!this.disabled()) this.chosen.emit(this.value());
  }

  /** Arrow keys: the next enabled radio of the same group, with wrap-around. */
  protected onKeydown(event: KeyboardEvent): void {
    const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
    if (!step) return;
    const input = event.target as HTMLInputElement;
    const scope = this.host.closest('[role="radiogroup"]') ?? this.host.parentElement;
    if (!scope) return;
    const radios = Array.from(scope.querySelectorAll<HTMLInputElement>('input.nm-radio-row__input')).filter(
      (r) => r.name === input.name && !r.disabled,
    );
    event.preventDefault();
    if (radios.length < 2) return;
    const current = radios.indexOf(input);
    const next = radios[(current + step + radios.length) % radios.length];
    next.focus();
    next.click();
  }
}
