import { Component, input } from '@angular/core';
import { StatusChipComponent, ChipKind } from '../../../shared/status-chip.component';
import { formatDateTime, formatKshExact } from '../shared-format';

/** The effective payout after adjustments (refund or runner line, same shape). */
export interface CurrentPayout {
  amount: string;
  reference: string | null;
}

/**
 * `Current payout` card (drawer-refund §5.1, row 100; drawer-runner-payout
 * "Payout", row 107): the original payout with its corrections applied.
 * Status chip, amount sent (`KSh 0` and receipt `—` after a reversal) and
 * the last change.
 */
@Component({
  selector: 'app-current-payout-card',
  imports: [StatusChipComponent],
  template: `
    <section class="drawer-section">
      <div class="drawer-label">Current payout</div>
      <div class="drawer-card">
        <div class="drawer-row">
          <span>Status</span><app-status-chip [status]="chipStatus()" [kind]="chipKind()" />
        </div>
        <div class="drawer-row">
          <span>Amount sent</span><b>{{ formatKshExact(payout()?.amount ?? 0) }}</b>
        </div>
        <div class="drawer-row">
          <span>M-Pesa receipt</span><b>{{ payout()?.reference ?? '—' }}</b>
        </div>
        <div class="drawer-row">
          <span>Last changed</span><b>{{ formatDateTime(lastChanged()) }}</b>
        </div>
      </div>
    </section>
  `,
  styles: [],
})
export class CurrentPayoutCardComponent {
  readonly payout = input<CurrentPayout | null>(null);
  readonly chipStatus = input.required<string>();
  readonly chipKind = input.required<ChipKind>();
  readonly lastChanged = input<string | null>(null);

  protected readonly formatKshExact = formatKshExact;
  protected readonly formatDateTime = formatDateTime;
}
