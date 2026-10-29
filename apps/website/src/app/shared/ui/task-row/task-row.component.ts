// `nm-task-row` (customer-v-home §Components; Flutter TaskRow C-22). Built
// once in #7; #11 History reuses it. The whole row is a link (followed
// in-app): white, slate-line, r-m, padding 13 15; title row-title 13 with
// ellipsis over the meta time (`formatDayTime`, browser local, nmNum
// `num-meta`); a regular status chip from `customerStatus` at the end.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { DateInput, formatDayTime } from '../../format/formatters';
import { NmNum } from '../../format/num.directive';
import { ErrandStatus } from '../../status/status-presentation';
import { followInAppLink } from '../links';
import { NmStatusChip } from '../status-chip/status-chip.component';

@Component({
  selector: 'nm-task-row',
  imports: [NmNum, NmStatusChip],
  template: `
    <a class="nm-task-row" [attr.href]="href()" (click)="follow($event)">
      <span class="nm-task-row__text">
        <span class="nm-task-row__title">{{ title() }}</span>
        @if (metaText(); as meta) {
          <span class="nm-task-row__meta" nmNum="meta">{{ meta }}</span>
        }
      </span>
      <nm-status-chip class="nm-task-row__chip" [customerStatus]="status()" />
    </a>
  `,
  styleUrl: './task-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmTaskRow {
  readonly title = input.required<string>();
  readonly status = input.required<ErrandStatus>();
  readonly href = input.required<string>();
  /** Shown with `formatDayTime`; null hides the meta line. */
  readonly time = input<DateInput | null>(null);
  /** Reference clock for `Today` / `Yesterday` (tests inject it). */
  readonly now = input<Date | null>(null);

  private readonly router = inject(Router);

  protected readonly metaText = computed(() => {
    const time = this.time();
    return time === null ? null : formatDayTime(time, this.now() ?? new Date());
  });

  protected follow(event: MouseEvent): void {
    followInAppLink(event, this.href(), this.router);
  }
}
