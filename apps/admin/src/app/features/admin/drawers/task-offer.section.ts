import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import type { Errand } from '../../../core/api-types';
import { ApiService } from '../../../core/services/api.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import type { NoticeTone } from '../../../shared/inline-notice.component';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { formatDateTime } from '../shared-format';
import { ExpireTaskDialogComponent } from './expire-task-dialog';
import { loadErrandRefunds } from './refund-link.section';
import {
  canExpireNoRunner,
  declineReasonLabel,
  errandTitle,
  offerSectionState,
  runnersTried,
} from './task-offer';

/**
 * `Runner` section of the task drawer (drawer-task-offer), after Locations
 * and before Quote. Built so far:
 * - the `Declined` state with its `Reason` (row 210, finding 30);
 * - `Expire task — no runner available` on `canExpire.noRunner` and the
 *   `Expired by ops` state (rows 187, 202, 203, finding 26).
 * Hidden when none of these applies.
 */
@Component({
  selector: 'app-task-offer-section',
  imports: [StatusChipComponent, ExpireTaskDialogComponent],
  template: `
    @if (state() || canExpire()) {
      <section class="drawer-section">
        <div class="drawer-label">Runner</div>
        @if (state() === 'declined' && errand().lastAssignment; as a) {
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
        } @else if (state() === 'expired_by_ops' && errand().expiry; as x) {
          <div class="drawer-card">
            <div class="offer-state">
              <app-status-chip label="Expired by ops" tone="info" />
            </div>
            <div class="drawer-row">
              <span>Expired by</span><b class="txt">{{ x.by?.displayName || 'Admin' }}</b>
            </div>
            <div class="drawer-row">
              <span>Expired at</span><b>{{ formatDateTime(x.at) }}</b>
            </div>
            @if (x.note) {
              <div class="drawer-row drawer-row-wrap">
                <span>Reason</span><span class="val-text">{{ x.note }}</span>
              </div>
            }
            @if (tried() !== null) {
              <div class="drawer-row">
                <span>Runners tried</span><b>{{ tried() }}</b>
              </div>
            }
            <div class="drawer-caption">
              An admin expired this task because no runner was available.
              @if (refundReviewId()) {
                A refund review was opened.
              }
            </div>
            @if (refundReviewId(); as rid) {
              <div class="drawer-card-foot">
                <button type="button" class="btn btn-text btn-sm" (click)="nav.open('refund', rid)">
                  View refund review
                </button>
              </div>
            }
          </div>
        }
        @if (canExpire()) {
          <div class="drawer-actions">
            <button type="button" class="btn btn-outline" (click)="expireOpen.set(true)">
              Expire task — no runner available
            </button>
          </div>
        }
      </section>
      <app-expire-task-dialog
        [open]="expireOpen()"
        [errandId]="errand().id"
        [taskTitle]="title()"
        (closed)="expireOpen.set(false)"
        (expired)="onExpired()"
        (refused)="onRefused($event)"
      />
    }
  `,
  styles: [],
})
export class TaskOfferSectionComponent {
  private readonly s = inject(AdminDataService);
  private readonly api = inject(ApiService);
  protected readonly nav = inject(DrawerNavService);

  readonly errand = input.required<Errand>();
  /** Drawer-level A-11 notice (result and refusal copy). */
  readonly notice = output<{ tone: NoticeTone; text: string }>();

  protected readonly state = computed(() => offerSectionState(this.errand()));
  protected readonly canExpire = computed(() => canExpireNoRunner(this.errand()));
  protected readonly tried = computed(() => runnersTried(this.errand()));
  protected readonly title = computed(() => errandTitle(this.errand()));
  protected readonly expireOpen = signal(false);
  /** The task's `expired_after_payment` review, for the refund line (row 102). */
  protected readonly refundReviewId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.errand().id;
      this.refundReviewId.set(null);
      if (this.state() !== 'expired_by_ops') return;
      loadErrandRefunds(this.api, id).then(
        (items) => {
          if (this.errand().id !== id) return;
          const review = items.find((r) => r.trigger === 'expired_after_payment');
          this.refundReviewId.set(review?.id ?? null);
        },
        // The drawer's Refund section shows its own load error.
        () => undefined,
      );
    });
  }

  protected async onExpired(): Promise<void> {
    this.expireOpen.set(false);
    this.notice.emit({ tone: 'success', text: 'Task expired.' });
    await this.s.loadErrandDetail(this.errand().id, { quiet: true });
  }

  protected async onRefused(text: string): Promise<void> {
    this.expireOpen.set(false);
    await this.s.loadErrandDetail(this.errand().id, { quiet: true });
    this.notice.emit({ tone: 'info', text });
  }

  protected readonly formatDateTime = formatDateTime;
  protected readonly declineReasonLabel = declineReasonLabel;
}
