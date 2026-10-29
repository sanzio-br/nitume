// `nm-choice-chip` (customer-v-new-details §nm-choice-chip; Flutter
// NitumeChoiceChip C-16). Built once in #7; #8's deadline panel reuses it.
// Pill, 8px 13px, `chip` type. Unselected: slate fill, slate-line border,
// blue text. Selected: blue fill and border with WHITE text (a choice, not
// a primary action: never green). 48px hit area, focus ring. `disabled`
// (#8 saving): aria-disabled, no selection change, slate-400 text.
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'nm-choice-chip',
  template: `
    <button
      type="button"
      role="radio"
      class="nm-choice-chip"
      [class.nm-choice-chip--selected]="selected()"
      [class.nm-choice-chip--disabled]="disabled()"
      [attr.aria-checked]="selected() ? 'true' : 'false'"
      [attr.aria-disabled]="disabled() ? 'true' : null"
      [attr.tabindex]="tabIndex()"
      (click)="onClick()"
    >
      {{ label() }}
    </button>
  `,
  styleUrl: './choice-chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmChoiceChip {
  readonly label = input.required<string>();
  readonly selected = input(false);
  readonly disabled = input(false);
  readonly tabIndex = input(0);

  /** Not emitted while disabled. */
  readonly pressed = output<void>();

  protected onClick(): void {
    if (!this.disabled()) this.pressed.emit();
  }
}
