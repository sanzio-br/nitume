// `nm-task-summary-card` (#8 A§8; app `TaskSummaryCard`, task_widgets.dart;
// reused by #9). `nm-card` (padding 16): an optional status chip (labels
// only through `customerStatus()`), the title or the category display name
// (never the wire value), the meta line `#NT-10482 · Today, 10:03 AM` wholly
// in `nmNum` meta-lg (browser local time, WQ-2), and a footer slot.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { categoryName } from '../../../shared/format/category';
import { formatDayTime } from '../../../shared/format/formatters';
import { NmNum } from '../../../shared/format/num.directive';
import { NmCard } from '../../../shared/ui/card/card.component';
import { NmStatusChip } from '../../../shared/ui/status-chip/status-chip.component';
import { ErrandStatus } from '../../../shared/status/status-presentation';

@Component({
  selector: 'nm-task-summary-card',
  imports: [NmCard, NmStatusChip, NmNum],
  template: `
    <nm-card padding="16px">
      @if (status(); as s) {
        <nm-status-chip class="nm-task-summary__chip" [customerStatus]="s" />
      }
      <p class="nm-task-summary__title">{{ displayTitle() }}</p>
      @if (meta(); as m) {
        <p class="nm-task-summary__meta" nmNum="meta-lg">{{ m }}</p>
      }
      <ng-content />
    </nm-card>
  `,
  styleUrl: './task-summary-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmTaskSummaryCard {
  /** Chip status; null hides the chip. */
  readonly status = input<ErrandStatus | null>(null);
  readonly title = input<string | null>(null);
  /** Wire category (shown as its display name when there is no title). */
  readonly category = input.required<string>();
  readonly reference = input<string | null>(null);
  readonly createdAt = input<string | null>(null);
  readonly now = input.required<Date>();

  protected readonly displayTitle = computed(() => this.title()?.trim() || categoryName(this.category()));
  protected readonly meta = computed(() => {
    const parts: string[] = [];
    const reference = this.reference()?.trim();
    if (reference) parts.push(`#${reference}`);
    const created = this.createdAt();
    if (created && !Number.isNaN(new Date(created).getTime())) parts.push(formatDayTime(created, this.now()));
    return parts.length ? parts.join(' · ') : null;
  });
}
