import { Component, ElementRef, input, model, viewChildren } from '@angular/core';

export interface SegmentOption {
  value: string;
  label: string;
}

/**
 * Segmented toggle (A-09): 2–3 options in a pill, `role="radiogroup"`.
 * Active segment: green fill with white text (an active toggle); inactive:
 * white with blue text. Arrow keys move and select (roving tabindex).
 */
@Component({
  selector: 'app-segmented-toggle',
  imports: [],
  template: `
    <div class="seg-toggle" role="radiogroup" [attr.aria-label]="ariaLabel()">
      @for (opt of options(); track opt.value; let i = $index) {
        <button
          #seg
          type="button"
          role="radio"
          class="seg-option"
          [class.active]="opt.value === value()"
          [attr.aria-checked]="opt.value === value()"
          [attr.tabindex]="opt.value === value() || (!hasValue() && i === 0) ? 0 : -1"
          [disabled]="disabled()"
          (click)="select(opt.value)"
          (keydown)="onKeydown($event, i)"
        >
          {{ opt.label }}
        </button>
      }
    </div>
  `,
  styles: [],
})
export class SegmentedToggleComponent {
  readonly options = input<SegmentOption[]>([]);
  readonly ariaLabel = input<string>('');
  readonly disabled = input(false);
  readonly value = model<string>('');

  private readonly segs = viewChildren<ElementRef<HTMLButtonElement>>('seg');

  protected hasValue(): boolean {
    return this.options().some((o) => o.value === this.value());
  }

  select(value: string): void {
    this.value.set(value);
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const opts = this.options();
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % opts.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + opts.length) % opts.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = opts.length - 1;
    if (next === null) return;
    event.preventDefault();
    this.select(opts[next].value);
    this.segs()[next]?.nativeElement.focus();
  }
}
