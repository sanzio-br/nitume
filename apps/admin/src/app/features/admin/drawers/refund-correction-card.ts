import { Component, computed, input } from '@angular/core';
import type { RefundPayoutCorrection } from '../../../core/api-types';
import { adminLabel, correctionKindLabel } from '../refund-labels';
import { formatDateTime, formatKshExact } from '../shared-format';

/**
 * One payout correction record (row 100, drawer-refund "Correction card"):
 * read-only, oldest-first history. Kind label + time, then only the rows that
 * apply to the kind, the reason and who recorded it. No edit, delete or undo
 * control: a mistake is fixed with another correction.
 */
@Component({
  selector: 'app-refund-correction-card',
  imports: [],
  template: `
    @let c = correction();
    <div class="drawer-card correction-card">
      <div class="correction-head">
        <span class="correction-kind">{{ kindLabel() }}</span>
        <span class="correction-time">{{ formatDateTime(c.createdAt) }}</span>
      </div>
      @switch (c.kind) {
        @case ('corrected') {
          @if (c.newReference) {
            <div class="drawer-row">
              <span>Receipt</span>
              <b
                >{{ c.previousReference ?? '—' }} <span class="drawer-arrow">→</span>
                {{ c.newReference }}</b
              >
            </div>
          }
          @if (c.newAmount !== null) {
            <div class="drawer-row">
              <span>Amount sent</span>
              <b
                >{{ formatKshExact(c.previousAmount) }} <span class="drawer-arrow">→</span>
                {{ formatKshExact(c.newAmount) }}</b
              >
            </div>
          }
        }
        @case ('reversed') {
          <div class="drawer-row">
            <span>Reversal receipt</span><b>{{ c.newReference ?? '—' }}</b>
          </div>
        }
        @case ('resent') {
          <div class="drawer-row">
            <span>M-Pesa receipt</span><b>{{ c.newReference ?? '—' }}</b>
          </div>
          <div class="drawer-row">
            <span>Amount sent</span><b>{{ formatKshExact(c.newAmount) }}</b>
          </div>
        }
      }
      <div class="drawer-row drawer-row-wrap">
        <span>Reason</span><span class="val-text correction-reason">{{ c.reason }}</span>
      </div>
      <div class="drawer-row">
        <span>Recorded by</span><b class="txt">{{ recordedBy() }}</b>
      </div>
    </div>
  `,
  styles: [],
})
export class RefundCorrectionCardComponent {
  readonly correction = input.required<RefundPayoutCorrection>();
  /** The signed-in admin's id, so their own records read `You`. */
  readonly meId = input<string | null>(null);

  protected readonly kindLabel = computed(() => correctionKindLabel(this.correction().kind));
  protected readonly recordedBy = computed(() => {
    const c = this.correction();
    return adminLabel(c.createdBy, c.createdByUserId, this.meId());
  });

  protected readonly formatDateTime = formatDateTime;
  protected readonly formatKshExact = formatKshExact;
}
