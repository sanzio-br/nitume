// `nm-deadline-line` (#8 A§8; app `DeadlineLine`, deadline_widgets.dart):
// the summary card's footer. `Deadline` + an optional `Change` link, then
// the saved deadline in EAT, labelled EAT (owner WQ-2), in 24-hour time
// (owner Q8-3): `<Code>Today, 23:59</Code> EAT`. Identical in any browser
// zone. No deadline: the Flexible copy.
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatDeadlineEat } from '../../../shared/format/formatters';
import { NmNum } from '../../../shared/format/num.directive';
import { NmButton } from '../../../shared/ui/button/button.component';

export const NO_DEADLINE_COPY = 'No deadline yet. It starts when your payment is confirmed.';

@Component({
  selector: 'nm-deadline-line',
  imports: [NmNum, NmButton],
  template: `
    <div class="nm-deadline-line">
      <div class="nm-deadline-line__row">
        <span class="nm-deadline-line__label">Deadline</span>
        @if (changeable()) {
          <nm-button class="nm-deadline-line__change" variant="link" size="small" (pressed)="change.emit()">Change</nm-button>
        }
      </div>
      @if (value(); as v) {
        <p class="nm-deadline-line__value"><span nmNum>{{ v }}</span> EAT</p>
      } @else {
        <p class="nm-deadline-line__none">{{ noDeadline }}</p>
      }
    </div>
  `,
  styleUrl: './deadline-line.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmDeadlineLine {
  readonly deadlineAt = input<string | null>(null);
  readonly now = input.required<Date>();
  /** Shows `Change`. */
  readonly changeable = input(false);

  readonly change = output<void>();

  protected readonly noDeadline = NO_DEADLINE_COPY;
  protected readonly value = computed(() => {
    const at = this.deadlineAt();
    if (!at || Number.isNaN(new Date(at).getTime())) return null;
    return formatDeadlineEat(at, this.now(), { hour24: true });
  });
}
