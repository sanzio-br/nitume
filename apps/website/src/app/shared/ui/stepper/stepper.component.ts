// `nm-stepper` (customer-v-new-category §W4; Flutter StepProgressBar C-14):
// equal 4px pill segments, gap 6, green done / slate-line empty, padding
// below 16. One image with the name `Step n of m`.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'nm-stepper',
  template: `
    <div class="nm-stepper" role="img" [attr.aria-label]="label()">
      @for (i of segments(); track i) {
        <span class="nm-stepper__segment" [class]="i < completed() ? 'nm-stepper__segment--done' : 'nm-stepper__segment--empty'"></span>
      }
    </div>
  `,
  styleUrl: './stepper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmStepper {
  readonly total = input(3);
  readonly completed = input.required<number>();

  protected readonly segments = computed(() => Array.from({ length: this.total() }, (_, i) => i));
  protected readonly label = computed(() => `Step ${this.completed()} of ${this.total()}`);
}
