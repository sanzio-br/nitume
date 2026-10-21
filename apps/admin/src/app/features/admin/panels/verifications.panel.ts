import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminDataService, shortId } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { formatDateTime, formatPhone } from '../shared-format';
import {
  QueueRunner,
  VERIFICATION_LEVEL_FILTERS,
  VERIFICATION_STATUS_FILTERS,
  applicationStatus,
  areaCell,
  awaitingCopy,
  checksSummary,
  failureCopy,
  runnerLabel,
} from '../verification-labels';
import { PanelTopbarComponent } from './panel-topbar.component';
import { LoadMoreComponent } from '../../../shared/load-more.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { NumTextComponent } from '../../../shared/num-text.component';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { apiError } from '../../../core/api-error';
import { ApiService } from '../../../core/services/api.service';
import type {
  ServiceAreaOption,
  VerificationLevel,
  VerificationQueueFilters,
  VerificationQueueStatus,
} from '../../../core/api-types';

/** Search (row 278): debounced, sent only at 2–64 characters after trimming. */
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN = 2;
export const SEARCH_MAX = 64;

/** The `q` to send for a typed search, or '' (nothing sent). */
export function searchQuery(text: string): string {
  const q = text.trim();
  return q.length >= SEARCH_MIN ? q.slice(0, SEARCH_MAX) : '';
}

/**
 * Runner verification (`p-runners-verification-table`, row 278): one row per
 * runner from `GET /runners/verifications/queue`, filtered server-side by
 * status, service area, level and search. `View documents` (or the row)
 * opens the documents drawer; the table itself never loads an image.
 */
@Component({
  selector: 'app-verifications-panel',
  imports: [
    PanelTopbarComponent,
    LoadMoreComponent,
    InlineNoticeComponent,
    NumTextComponent,
    StatusChipComponent,
  ],
  template: `
    <app-panel-topbar
      title="Runner verification"
      [sub]="sub()"
      searchPlaceholder="Search name, phone or ID"
      searchLabel="Search runners"
      [searchMaxLength]="searchMax"
      [search]="searchText()"
      (searchChange)="onSearch($event)"
    >
      <select
        topbar-actions
        class="btn-city"
        aria-label="Filter by status"
        [value]="statusFilter()"
        (change)="setStatus($event)"
      >
        @for (f of statusFilters; track f.value) {
          <option [value]="f.value" [selected]="f.value === statusFilter()">{{ f.label }}</option>
        }
      </select>
      <select
        topbar-actions
        class="btn-city"
        aria-label="Filter by service area"
        [disabled]="areas().length === 0"
        [value]="areaFilter()"
        (change)="setArea($event)"
      >
        <option value="" [selected]="areaFilter() === ''">All areas</option>
        @for (a of areas(); track a.id) {
          <option [value]="a.id" [selected]="a.id === areaFilter()">{{ a.name }}</option>
        }
      </select>
      <select
        topbar-actions
        class="btn-city"
        aria-label="Filter by level"
        [value]="levelFilter()"
        (change)="setLevel($event)"
      >
        @for (f of levelFilters; track f.value) {
          <option [value]="f.value" [selected]="f.value === levelFilter()">{{ f.label }}</option>
        }
      </select>
      <button topbar-actions type="button" class="btn-city" (click)="load()">↻ Refresh</button>
    </app-panel-topbar>

    @if (notice(); as n) {
      <app-inline-notice
        class="panel-notice"
        [tone]="n.tone"
        [dismissible]="true"
        (dismissed)="notice.set(null)"
        >{{ n.text }}</app-inline-notice
      >
    }

    <p class="kpi-note">
      Opening a runner's documents shows their ID and selfie images; each image shown is logged.
      Images are deleted at the end of the retention period. A runner reaches Level 2 when both ID
      sides and the selfie are approved, and drops back to Level 1 while any of them is rejected or
      replaced.
    </p>

    @if (loading() && rows().length === 0) {
      <div class="ops-loading">Loading…</div>
    } @else if (rows().length > 0) {
      <div class="table-card verif-table">
        <table>
          <thead>
            <tr>
              <th scope="col">Runner</th>
              <th scope="col">Phone</th>
              <th scope="col" class="col-area">Service area</th>
              <th scope="col">Level</th>
              <th scope="col">Checks</th>
              <th scope="col">Waiting since</th>
              <th scope="col" class="col-applied">Applied</th>
              <th scope="col">Status</th>
              <th scope="col"><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            @for (item of rows(); track item.runnerProfile.id) {
              <tr class="clickable" (click)="open(item)">
                <td>
                  <div class="task-cat" [class.num]="!item.user?.shortName">
                    {{ runnerLabel(item) }}
                  </div>
                  @if (item.user?.shortName) {
                    <div class="task-id">{{ shortId(item.runnerProfile.id) }}</div>
                  }
                </td>
                <td class="num">{{ item.user?.phone ? formatPhone(item.user!.phone!) : '—' }}</td>
                <td class="col-area">
                  @if (areaCell(item.runnerProfile.serviceAreas); as parts) {
                    <app-num-text [parts]="parts" />
                  } @else {
                    —
                  }
                </td>
                <td>
                  @if (item.runnerProfile.verificationLevel) {
                    <app-status-chip kind="level" [status]="item.runnerProfile.verificationLevel" />
                  } @else {
                    —
                  }
                </td>
                <td><app-num-text [parts]="checksSummary(item)" /></td>
                <td class="num cell-muted">
                  {{ item.oldestPendingAt ? formatDateTime(item.oldestPendingAt) : '—' }}
                </td>
                <td class="num cell-muted col-applied">
                  {{ formatDateTime(item.runnerProfile.appliedAt) }}
                </td>
                <td>
                  <app-status-chip kind="verification" [status]="applicationStatus(item)" />
                </td>
                <td>
                  <button
                    type="button"
                    class="row-assign"
                    [attr.aria-label]="'View documents for ' + runnerLabel(item)"
                    (click)="$event.stopPropagation(); open(item)"
                  >
                    View documents
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (!loading()) {
        <p class="panel-caption">
          Showing <span class="num">{{ rows().length }}</span> of
          <span class="num">{{ total() }}</span>
        </p>
      }
    } @else if (!loading() && !loadError()) {
      <div class="ops-empty">
        @if (defaultView()) {
          <b>No applications awaiting review</b>New runner submissions land here.
        } @else {
          <b>No applications match</b>Clear the filters, or wait for runner submissions.
        }
      </div>
    }

    @if (hasMore()) {
      <app-load-more [loading]="loadingMore()" (load)="loadMore()" />
    }
  `,
  styles: [],
})
export class VerificationsPanelComponent implements OnInit, OnDestroy {
  protected readonly s = inject(AdminDataService);
  private readonly api = inject(ApiService);
  private readonly nav = inject(DrawerNavService);

  readonly statusFilter = signal<VerificationQueueStatus>('pending');
  readonly areaFilter = signal('');
  readonly levelFilter = signal<VerificationLevel | ''>('');
  /** What the admin typed; `query` is what is sent (after the debounce and the length rule). */
  readonly searchText = signal('');
  readonly query = signal('');
  readonly areas = signal<ServiceAreaOption[]>([]);

  readonly cursor = signal<string | null>(null);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  /** The last load failed: no empty state under the error. */
  readonly loadError = signal(false);
  readonly notice = signal<{ tone: NoticeTone; text: string; fromLoad?: true } | null>(null);

  protected readonly statusFilters = VERIFICATION_STATUS_FILTERS;
  protected readonly levelFilters = VERIFICATION_LEVEL_FILTERS;
  protected readonly searchMax = SEARCH_MAX;

  /** `Pending`, all areas, all levels, no search. */
  protected readonly defaultView = computed(
    () =>
      this.statusFilter() === 'pending' &&
      !this.areaFilter() &&
      !this.levelFilter() &&
      !this.query(),
  );

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** A decision or re-review was saved in the documents drawer: reload when it closes. */
  private savedSinceOpen = false;

  constructor() {
    const savesAtStart = untracked(() => this.s.verificationSaves());
    effect(() => {
      if (this.s.verificationSaves() !== savesAtStart) this.savedSinceOpen = true;
    });
    effect(() => {
      const open = this.nav.current();
      if (!open && this.savedSinceOpen) {
        untracked(() => {
          this.savedSinceOpen = false;
          void this.load();
        });
      }
    });
  }

  ngOnInit(): void {
    void this.load();
    void this.loadAreas();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  private filters(): VerificationQueueFilters {
    return {
      status: this.statusFilter(),
      serviceAreaId: this.areaFilter() || null,
      level: this.levelFilter() || null,
      q: this.query() || null,
    };
  }

  /** First page under the current filters. Any failure clears the rows and the cursor. */
  async load(): Promise<void> {
    this.clearLoadNotice();
    this.loading.set(true);
    this.loadingMore.set(false);
    this.loadError.set(false);
    this.cursor.set(null);
    try {
      const res = await this.s.loadVerificationQueue(this.filters());
      if (!res) return; // A newer load owns the panel.
      this.cursor.set(res.nextCursor);
      this.total.set(res.total);
      this.loading.set(false);
    } catch (e) {
      this.cursor.set(null);
      this.loading.set(false);
      this.loadError.set(true);
      this.notice.set({
        tone: 'danger',
        text: failureCopy(e, "Couldn't load verifications. Try again."),
        fromLoad: true,
      });
    }
  }

  /** Next runners; a failure keeps the rows and `Load more`; a stale cursor reloads page 1. */
  protected async loadMore(): Promise<void> {
    const cursor = this.cursor();
    if (this.loadingMore() || !cursor) return;
    this.clearLoadNotice();
    this.loadingMore.set(true);
    try {
      const res = await this.s.loadVerificationQueue(this.filters(), cursor);
      if (res) {
        this.cursor.set(res.nextCursor);
        this.total.set(res.total);
      }
    } catch (e) {
      const err = apiError(e);
      if (err.status === 400 && err.code === 'cursor_invalid') {
        this.loadingMore.set(false);
        this.reset();
        return;
      }
      this.notice.set({
        tone: 'danger',
        text: failureCopy(e, "Couldn't load verifications. Try again."),
        fromLoad: true,
      });
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** Areas for the filter; on failure the select keeps only `All areas`, disabled. */
  private async loadAreas(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.serviceAreas());
      this.areas.set(res.items ?? []);
    } catch {
      this.areas.set([]);
    }
  }

  protected setStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as VerificationQueueStatus);
    this.reset();
  }

  protected setArea(event: Event): void {
    this.areaFilter.set((event.target as HTMLSelectElement).value);
    this.reset();
  }

  protected setLevel(event: Event): void {
    this.levelFilter.set((event.target as HTMLSelectElement).value as VerificationLevel | '');
    this.reset();
  }

  /** Debounced 300 ms; reloads only when the query actually sent changes. */
  protected onSearch(text: string): void {
    this.searchText.set(text);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      const q = searchQuery(this.searchText());
      if (q === this.query()) return;
      this.query.set(q);
      this.reset();
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Any filter change: drop the rows and the cursor, then load page 1. */
  private reset(): void {
    this.s.clearVerificationQueue();
    void this.load();
  }

  protected open(item: QueueRunner): void {
    this.nav.open('runner_verification', item.runnerProfile.id);
  }

  protected rows(): QueueRunner[] {
    return this.s.verificationQueue();
  }

  protected hasMore(): boolean {
    return !!this.cursor();
  }

  protected sub(): string {
    const n = this.s.awaitingReviewCount();
    if (n === null) return this.loading() ? 'Loading…' : '';
    return awaitingCopy(n);
  }

  /** The load-error notice belongs to the failed load; a new load starts without it. */
  private clearLoadNotice(): void {
    if (this.notice()?.fromLoad) this.notice.set(null);
  }

  protected readonly runnerLabel = runnerLabel;
  protected readonly checksSummary = checksSummary;
  protected readonly applicationStatus = applicationStatus;
  protected readonly areaCell = areaCell;
  protected readonly shortId = shortId;
  protected readonly formatPhone = formatPhone;
  protected readonly formatDateTime = formatDateTime;
}
