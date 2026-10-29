// `nm-choice-chip-group` (customer-v-new-details §nm-choice-chip): a
// radiogroup of `nm-choice-chip`s, wrap with gap 8, named by
// `aria-labelledby`; roving tabindex (Tab enters on the selected chip, else
// the first); arrow keys move and select with wrap-around.
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { NmChoiceChip } from './choice-chip.component';

export interface NmChoiceOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

@Component({
  selector: 'nm-choice-chip-group',
  imports: [NmChoiceChip],
  template: `
    <div class="nm-choice-chip-group" role="radiogroup" [attr.aria-labelledby]="labelledBy()" (keydown)="onKeydown($event)">
      @for (option of options(); track option.value; let i = $index) {
        <nm-choice-chip
          [label]="option.label"
          [selected]="option.value === selected()"
          [disabled]="disabled()"
          [tabIndex]="tabIndexFor(option.value, i)"
          (pressed)="choose(option.value)"
        />
      }
    </div>
  `,
  styleUrl: './choice-chip-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmChoiceChipGroup {
  readonly options = input.required<readonly NmChoiceOption[]>();
  readonly selected = input<string | null>(null);
  readonly labelledBy = input<string | null>(null);
  /** Every chip disabled (#8 saving). */
  readonly disabled = input(false);

  readonly selectedChange = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected tabIndexFor(value: string, index: number): number {
    const selected = this.selected();
    const hasSelected = this.options().some((o) => o.value === selected);
    return (hasSelected ? value === selected : index === 0) ? 0 : -1;
  }

  protected choose(value: string): void {
    if (!this.disabled() && value !== this.selected()) this.selectedChange.emit(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const step = ['ArrowRight', 'ArrowDown'].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
        ? -1
        : 0;
    if (!step || this.disabled()) return;
    const radios = Array.from(this.host.querySelectorAll<HTMLElement>('[role="radio"]'));
    const current = radios.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    event.preventDefault();
    const next = (current + step + radios.length) % radios.length;
    this.choose(this.options()[next].value);
    radios[next].focus();
  }
}
