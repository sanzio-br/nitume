import { Component, input, output } from '@angular/core';

/**
 * Batch selection bar (A-16, `_shared.md` §5): sticky at the bottom of a
 * table card while rows are selected. Left: the line count and the Fira Code
 * total (announced politely when it changes); right: one primary action.
 */
@Component({
  selector: 'app-batch-bar',
  imports: [],
  template: `
    <div class="batch-bar">
      <span class="batch-summary" aria-live="polite"
        ><span class="num">{{ count() }}</span> {{ count() === 1 ? 'line' : 'lines' }} ·
        <span class="num">{{ total() }}</span></span
      >
      <button type="button" class="btn btn-primary" [disabled]="disabled()" (click)="action.emit()">
        {{ actionLabel() }}
      </button>
    </div>
  `,
  styles: [],
})
export class BatchBarComponent {
  readonly count = input.required<number>();
  /** Formatted total, e.g. `KSh 6,750`. */
  readonly total = input.required<string>();
  readonly actionLabel = input.required<string>();
  readonly disabled = input(false);

  readonly action = output<void>();
}
