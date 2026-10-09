import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { apiError, FORBIDDEN_COPY } from '../../../core/api-error';
import type { RefundListItem, RefundStatus } from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { InlineNoticeComponent } from '../../../shared/inline-notice.component';
import { LoadMoreComponent } from '../../../shared/load-more.component';
import { AdminDataService, categoryLabel, shortId } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { refundTriggerLabel } from '../refund-labels';
import { formatDateTime, formatKshExact } from '../shared-format';
import { PanelTopbarComponent } from './panel-topbar.component';

export type RefundFilter = RefundStatus | 'all';

export const REFUND_FILTERS: { value: RefundFilter; label: string }[] = [
  { value: 'pending_review', label: 'Needs review' },
  { value: 'approved', label: 'Payout due' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'no_refund', label: 'No refund' },
  { value: 'all', label: 'All statuses' },
];

const EMPTY: Record<RefundFilter, { title: string; text: string }> = {
  pending_review: {
    title: 'No refunds to review',
    text: 'Tasks cancelled after the customer paid land here for a refund decision.',
  },
  approved: {
    title: 'No payouts to record',
    text: 'Approved refunds wait here until you record the M-Pesa payout.',
  },
  refunded: { title: 'No refunds sent yet', text: 'Refunds you mark as paid appear here.' },
  no_refund: {
    title: 'No reviews closed without a refund',
    text: 'Reviews you close at KSh 0 appear here.',
  },
  all: {
    title: 'No refund reviews yet',
    text: 'A review opens when a task is cancelled after the customer paid.',
  },
};

/** Topbar sub-line (`{n}+` while there are more pages). */
export function refundSubLine(filter: RefundFilter, count: number, more: boolean): string {
  const n = `${count}${more ? '+' : ''}`;
  switch (filter) {
    case 'pending_review':
      return count === 0 && !more ? 'No refunds to review' : `${n} to review`;
    case 'approved':
      return `${n} payouts to record`;
    case 'refunded':
      return `${n} refunded`;
    case 'no_refund':
      return `${n} closed with no refund`;
    default:
      return `${n} refund reviews`;
  }
}

export function refundRowAction(status: string): string {
  if (status === 'pending_review') return 'Review';
  if (status === 'approved') return 'Record payout';
  return 'View';
}

/**
 * Refunds panel (rows 37, 48, 54, 71): every refund review, newest first,
 * filtered by status (default `Needs review`). Rows open the refund drawer.
 */
@Component({
  selector: 'app-refunds-panel',
  imports: [PanelTopbarComponent, StatusChipComponent, InlineNoticeComponent, LoadMoreComponent],
  template: `
    <app-panel-topbar title="Refunds" [sub]="sub()">
      <select
        topbar-actions
        class="btn-city"
        aria-label="Filter refunds by status"
        [value]="filter()"
        (change)="setFilter($event)"
      >
        @for (f of filters; track f.value) {
          <option [value]="f.value" [selected]="f.value === filter()">{{ f.label }}</option>
        }
      </select>
      <button topbar-actions type="button" class="btn-city" (click)="reload()">↻ Refresh</button>
    </app-panel-topbar>

    @if (loading()) {
      <div class="ops-loading">Loading refund reviews…</div>
    } @else if (loadError(); as err) {
      <app-inline-notice tone="danger">
        {{ err }}
        <button notice-action type="button" class="btn btn-outline btn-sm" (click)="reload()">
          Try again
        </button>
      </app-inline-notice>
    } @else if (rows().length === 0) {
      <div class="ops-empty">
        <b>{{ empty().title }}</b
        >{{ empty().text }}
      </div>
    } @else {
      <div class="table-card refunds-table">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th class="col-reason">Reason</th>
              <th>Paid to Nitume</th>
              <th>Refund</th>
              <th>Status</th>
              <th class="col-opened">Opened</th>
              <th><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="clickable" (click)="open(r.id)">
                <td>
                  <div class="task-cat">{{ taskTitle(r) }}</div>
                  <div class="task-id">{{ shortId(r.errandId) }}</div>
                </td>
                <td class="col-reason">{{ triggerLabel(r.trigger) }}</td>
                <td class="num">{{ formatKshExact(r.amountPaid) }}</td>
                <td class="num">{{ formatKshExact(r.refundAmount) }}</td>
                <td><app-status-chip [status]="r.status" kind="refund" /></td>
                <td class="col-opened num cell-muted">{{ formatDateTime(r.createdAt) }}</td>
                <td>
                  <button
                    type="button"
                    class="row-assign"
                    [attr.aria-label]="ariaAction(r)"
                    (click)="$event.stopPropagation(); open(r.id)"
                  >
                    {{ rowAction(r.status) }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (moreError()) {
        <app-inline-notice class="refunds-more-error" tone="danger"
          >Couldn't load more. Try again.</app-inline-notice
        >
      }
      @if (cursor()) {
        <app-load-more [loading]="loadingMore()" (load)="loadMore()" />
      }
    }
  `,
  styles: [],
})
export class RefundsPanelComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly s = inject(AdminDataService);
  private readonly nav = inject(DrawerNavService);

  protected readonly filters = REFUND_FILTERS;
  readonly filter = signal<RefundFilter>('pending_review');
  readonly rows = signal<RefundListItem[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly moreError = signal(false);
  private request = 0;
  /** A save happened in the refund drawer: reload when it closes. */
  private savedSinceOpen = false;

  protected readonly sub = computed(() =>
    refundSubLine(this.filter(), this.rows().length, !!this.cursor()),
  );
  protected readonly empty = computed(() => EMPTY[this.filter()]);

  constructor() {
    // A save in the drawer updates the row in place right away.
    effect(() => {
      const saved = this.s.lastRefundUpdate();
      if (!saved) return;
      untracked(() => {
        this.savedSinceOpen = true;
        this.rows.update((rows) =>
          rows.map((r) =>
            r.id === saved.id
              ? { ...r, status: saved.status, refundAmount: saved.refundAmount }
              : r,
          ),
        );
      });
    });
    // Returning from the drawer after a save reloads the current filter.
    effect(() => {
      const open = this.nav.current();
      if (!open && this.savedSinceOpen) {
        untracked(() => {
          this.savedSinceOpen = false;
          void this.reload();
        });
      }
    });
  }

  ngOnInit(): void {
    void this.reload();
  }

  protected setFilter(event: Event): void {
    this.filter.set((event.target as HTMLSelectElement).value as RefundFilter);
    void this.reload();
  }

  async reload(): Promise<void> {
    const req = ++this.request;
    this.loading.set(true);
    this.loadError.set(null);
    this.moreError.set(false);
    void this.s.refreshRefundBadge();
    try {
      const page = await firstValueFrom(this.api.listRefunds(this.statusParam(), null, 25));
      if (req !== this.request) return;
      this.rows.set(page.items);
      this.cursor.set(page.nextCursor);
    } catch (e) {
      if (req !== this.request) return;
      this.rows.set([]);
      this.cursor.set(null);
      this.loadError.set(
        apiError(e).status === 403 ? FORBIDDEN_COPY : "Couldn't load refund reviews.",
      );
    } finally {
      if (req === this.request) this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.cursor();
    if (!cursor || this.loadingMore()) return;
    const req = this.request;
    this.loadingMore.set(true);
    this.moreError.set(false);
    try {
      const page = await firstValueFrom(this.api.listRefunds(this.statusParam(), cursor, 25));
      if (req !== this.request) return;
      this.rows.update((rows) => [...rows, ...page.items]);
      this.cursor.set(page.nextCursor);
    } catch {
      if (req === this.request) this.moreError.set(true);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected open(id: string): void {
    this.nav.open('refund', id);
  }

  private statusParam(): RefundStatus | null {
    const f = this.filter();
    return f === 'all' ? null : f;
  }

  /**
   * Errand title, else the description's first line, else the category.
   * TODO(N-1): older APIs have no `errand` on the item: use the dashboard's
   * last-100 errand window, never a per-row request.
   */
  protected taskTitle(r: RefundListItem): string {
    const e = r.errand ?? this.s.errands().find((x) => x.id === r.errandId);
    if (!e) return 'Task';
    if (e.title) return e.title;
    const line = e.description?.split('\n')[0]?.trim();
    return line || categoryLabel(e.category);
  }

  protected ariaAction(r: RefundListItem): string {
    const id = shortId(r.errandId);
    switch (r.status) {
      case 'pending_review':
        return `Review refund for ${id}`;
      case 'approved':
        return `Record payout for ${id}`;
      default:
        return `View refund for ${id}`;
    }
  }

  protected readonly rowAction = refundRowAction;
  protected readonly triggerLabel = refundTriggerLabel;
  protected readonly shortId = shortId;
  protected readonly formatKshExact = formatKshExact;
  protected readonly formatDateTime = formatDateTime;
}
