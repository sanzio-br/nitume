import { Component, computed, input } from '@angular/core';
import type { Errand } from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { formatDateTime } from '../shared-format';
import { declineReasonLabel, offerSectionState } from './task-offer';

/**
 * `Runner` section of the task drawer (drawer-task-offer), after Locations
 * and before Quote. Built so far: the `Declined` state with its `Reason`
 * (row 210, finding 30). Hidden when no built state applies.
 */
@Component({
  selector: 'app-task-offer-section',
  imports: [StatusChipComponent],
  template: `
    @if (state(); as st) {
      <section class="drawer-section">
        <div class="drawer-label">Runner</div>
        @if (st === 'declined' && errand().lastAssignment; as a) {
          <div class="drawer-card">
            <div class="offer-state"><app-status-chip label="Declined" tone="pending" /></div>
            <div class="drawer-row">
              <span>Offered at</span><b>{{ formatDateTime(a.offeredAt) }}</b>
            </div>
            <div class="drawer-row">
              <span>Declined</span><b>{{ formatDateTime(a.decidedAt) }}</b>
            </div>
            <div class="drawer-row">
              <span>Reason</span><b class="txt">{{ declineReasonLabel(a.declineReason) }}</b>
            </div>
            <div class="drawer-caption">The task is still waiting for a runner.</div>
          </div>
        }
      </section>
    }
  `,
  styles: [],
})
export class TaskOfferSectionComponent {
  readonly errand = input.required<Errand>();

  protected readonly state = computed(() => offerSectionState(this.errand()));

  protected readonly formatDateTime = formatDateTime;
  protected readonly declineReasonLabel = declineReasonLabel;
}
