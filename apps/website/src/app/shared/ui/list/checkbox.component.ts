// `nm-checkbox` (ui-kit spec §4.3.1; design-system `.check`, Flutter
// NitumeCheckbox C-36). A native checkbox sits invisibly over the 22px box
// so keyboard (Space) and screen readers work; hit area 48×48.
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

let nextId = 0;

@Component({
  selector: 'nm-checkbox',
  template: `
    <label class="nm-check" [class.nm-check--row]="!!label()" [class.nm-check--checked]="checked()">
      <span class="nm-check__control">
        @if (!displayOnly()) {
          <input
            class="nm-check__input"
            type="checkbox"
            [id]="inputId"
            [checked]="checked()"
            [disabled]="disabled()"
            [attr.aria-label]="label() ? null : ariaLabel()"
            (change)="onChange($event)"
          />
        }
        <span class="nm-check__box" aria-hidden="true">
          @if (checked()) {
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
                 stroke-linecap="round" stroke-linejoin="round" focusable="false">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          }
        </span>
      </span>
      @if (label(); as text) {
        <span class="nm-check__label">{{ text }}</span>
      }
    </label>
  `,
  styleUrl: './checkbox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmCheckbox {
  /** Two-way: `[(checked)]`, or `(checkedChange)`. */
  readonly checked = model(false);
  /** No change in look (Flutter `onChanged: null`). */
  readonly disabled = input(false);
  /** Optional row label; the whole row becomes clickable. */
  readonly label = input<string | null>(null);
  /** Accessible name when there is no visible label. */
  readonly ariaLabel = input<string | null>(null);
  /** Shows the box only (no native control), e.g. inside a step card. */
  readonly displayOnly = input(false);

  protected readonly inputId = `nm-checkbox-${nextId++}`;

  protected onChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (this.disabled()) {
      input.checked = this.checked();
      return;
    }
    this.checked.set(input.checked);
  }
}
