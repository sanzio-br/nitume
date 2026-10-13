import { Component, computed, input } from '@angular/core';
import { adminLabel } from '../refund-labels';
import { formatDateTime, formatKshExact } from '../shared-format';
import {
  CorrectionCopy,
  PayoutCorrectionRecord,
  REFUND_CORRECTION_COPY,
  correctionKindLabel,
} from './payout-correction';

/**
 * One payout correction record (drawer-refund "Correction card", row 100;
 * reused as is by drawer-runner-payout, row 107): read-only, oldest-first
 * history. Kind label + time, then only the rows that apply to the kind, the
 * reason and who recorded it. No edit, delete or undo control: a mistake is
 * fixed with another correction. `copy` gives the surface's kind labels.
 */
@Component({
  selector: 'app-payout-correction-card',
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
export class PayoutCorrectionCardComponent {
  readonly correction = input.required<PayoutCorrectionRecord>();
  readonly copy = input<CorrectionCopy>(REFUND_CORRECTION_COPY);
  /** The signed-in admin's id, so their own records read `You`. */
  readonly meId = input<string | null>(null);

  protected readonly kindLabel = computed(() =>
    correctionKindLabel(this.correction().kind, this.copy()),
  );
  protected readonly recordedBy = computed(() => {
    const c = this.correction();
    return adminLabel(c.createdBy, c.createdByUserId, this.meId());
  });

  protected readonly formatDateTime = formatDateTime;
  protected readonly formatKshExact = formatKshExact;
}
