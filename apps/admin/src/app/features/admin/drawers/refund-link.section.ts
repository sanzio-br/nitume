import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import type { ErrandRefundView } from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { DrawerNavService } from '../drawer-nav.service';
import { refundTriggerLabel } from '../refund-labels';
import { formatKshExact } from '../shared-format';

/** Every refund review of a task, newest first (`GET /errands/:id/refunds`, row 71). */
export async function loadErrandRefunds(
  api: ApiService,
  errandId: string,
): Promise<ErrandRefundView[]> {
  const res = await firstValueFrom(api.listErrandRefunds(errandId));
  return res.items;
}

/** States before payment: no refund review can exist yet (§3.3). */
const BEFORE_PAYMENT = new Set(['DRAFT', 'REQUESTED', 'QUOTED', 'ACCEPTED']);

/** True from PAYMENT_CONFIRMED on (incl. CANCELLED, FAILED, DISPUTED, EXPIRED). */
export function refundLinkApplies(status: string): boolean {
  return !BEFORE_PAYMENT.has(status);
}

/**
 * `Refund` section of the task drawer (drawer-refund "Task drawer link",
 * SA-2): shown for any task from PAYMENT_CONFIRMED on that has reviews.
 */
@Component({
  selector: 'app-refund-link-section',
  imports: [StatusChipComponent],
  template: `
    @if (items().length) {
      <section class="drawer-section">
        <div class="drawer-label">Refund</div>
        <div class="drawer-card">
          @for (r of items(); track r.id) {
            <div class="drawer-row">
              <span>{{ triggerLabel(r.trigger) }}</span>
              <span class="row-inline">
                <app-status-chip [status]="r.status" kind="refund" />
                <b>{{ formatKshExact(r.refundAmount ?? r.amountPaid) }}</b>
              </span>
            </div>
            <div class="drawer-card-foot">
              <button type="button" class="btn btn-text btn-sm" (click)="nav.open('refund', r.id)">
                Open refund review
              </button>
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: [],
})
export class RefundLinkSectionComponent {
  private readonly api = inject(ApiService);
  protected readonly nav = inject(DrawerNavService);

  readonly errandId = input.required<string>();
  readonly status = input.required<string>();

  protected readonly items = signal<ErrandRefundView[]>([]);

  constructor() {
    effect(() => {
      const id = this.errandId();
      const applies = refundLinkApplies(this.status());
      untracked(() => {
        this.items.set([]);
        if (applies) void this.load(id);
      });
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const items = await loadErrandRefunds(this.api, id);
      if (id === this.errandId()) this.items.set(items);
    } catch {
      /* the section stays hidden; the review is still reachable from Refunds */
    }
  }

  protected readonly triggerLabel = refundTriggerLabel;
  protected readonly formatKshExact = formatKshExact;
}
