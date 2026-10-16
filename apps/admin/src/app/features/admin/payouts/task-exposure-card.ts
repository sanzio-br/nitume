import { Component, input } from '@angular/core';
import type { TaskExposure, TaskExposureOverride } from '../../../core/api-types';
import { adminLabel } from '../refund-labels';
import { formatDateTime, formatKshExact } from '../shared-format';
import { overrideSourceLabel } from './task-exposure';

/**
 * `Task exposure` section (row 136; drawer-refund "Combined exposure cap",
 * drawer-runner-payout §3): the task's combined figures from `taskExposure`
 * and the read-only `Cap overrides` cards, oldest first.
 */
@Component({
  selector: 'app-task-exposure-card',
  imports: [],
  template: `
    @let e = exposure();
    <section class="drawer-section">
      <div class="drawer-label">Task exposure</div>
      <div class="drawer-card">
        <div class="drawer-row">
          <span>Total paid to Nitume</span><b>{{ formatKshExact(e.totalPaidToNitume) }}</b>
        </div>
        <div class="drawer-row">
          <span>Customer refunds committed</span><b>{{ formatKshExact(e.committedRefunds) }}</b>
        </div>
        @if (!hideZeroReimbursements() || positive(e.committedReimbursements)) {
          <div class="drawer-row">
            <span>Runner reimbursements committed</span
            ><b>{{ formatKshExact(e.committedReimbursements) }}</b>
          </div>
        }
        <div class="drawer-row drawer-row-strong">
          <span>Left within the task cap</span><b>{{ formatKshExact(e.remaining) }}</b>
        </div>
      </div>
      @if (caption()) {
        <div class="drawer-caption">{{ caption() }}</div>
      }
    </section>
    @if (overrides().length > 0) {
      <section class="drawer-section">
        <div class="drawer-label">Cap overrides</div>
        <div class="drawer-stack">
          @for (o of overrides(); track o.id) {
            <div class="drawer-card correction-card">
              <div class="correction-head">
                <span class="correction-kind">{{ sourceLabel(o.source) }}</span>
                <span class="correction-time">{{ formatDateTime(o.createdAt) }}</span>
              </div>
              <div class="drawer-row">
                <span>Amount</span><b>{{ formatKshExact(o.amount) }}</b>
              </div>
              <div class="drawer-row">
                <span>Normal cap at the time</span><b>{{ formatKshExact(o.normalCap) }}</b>
              </div>
              <div class="drawer-row drawer-row-wrap">
                <span>Note</span><span class="val-text correction-reason">{{ o.note }}</span>
              </div>
              <div class="drawer-row">
                <span>By</span><b class="txt">{{ by(o) }}</b>
              </div>
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: [],
})
export class TaskExposureCardComponent {
  readonly exposure = input.required<TaskExposure>();
  readonly overrides = input<TaskExposureOverride[]>([]);
  readonly meId = input<string | null>(null);
  /** drawer-refund: the reimbursement row only when > 0. */
  readonly hideZeroReimbursements = input(false);
  readonly caption = input('');

  protected by(o: TaskExposureOverride): string {
    return adminLabel(null, o.createdByUserId, this.meId());
  }

  protected positive(v: string): boolean {
    return Number(v) > 0;
  }

  protected readonly sourceLabel = overrideSourceLabel;
  protected readonly formatKshExact = formatKshExact;
  protected readonly formatDateTime = formatDateTime;
}
