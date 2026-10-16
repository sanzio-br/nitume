import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { apiError, FORBIDDEN_COPY } from '../../../core/api-error';
import type {
  RunnerPayoutItem,
  RunnerPayoutKind,
  RunnerPayoutStatus,
} from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { LoadMoreComponent } from '../../../shared/load-more.component';
import { BatchBarComponent } from '../../../shared/batch-bar.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { NumTextComponent } from '../../../shared/num-text.component';
import { AdminDataService, maskedId } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { CORRECTION_CODE_ERROR, MPESA_CODE_PATTERN } from '../payouts/payout-correction';
import {
  payoutTaskRef,
  payoutTaskTitle,
  runnerName,
  runnerPayoutAmount,
  runnerPayoutChipStatus,
  runnerPayoutKindLabel,
  runnerPayoutRowAction,
  reviewReasonLabel,
} from '../payouts/runner-payout-labels';
import { formatDateTime, formatKshExact, formatPhone } from '../shared-format';
import { PanelTopbarComponent } from './panel-topbar.component';

export type RunnerPayoutFilter = RunnerPayoutStatus | 'all';
export type RunnerPayoutKindFilter = RunnerPayoutKind | 'all';

export const RUNNER_PAYOUT_FILTERS: { value: RunnerPayoutFilter; label: string }[] = [
  { value: 'on_hold', label: 'Needs review' },
  { value: 'payable', label: 'Payable' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Not approved' },
  { value: 'all', label: 'All statuses' },
];

export const RUNNER_PAYOUT_KIND_FILTERS: { value: RunnerPayoutKindFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'runner_fee', label: 'Runner fees' },
  { value: 'item_reimbursement', label: 'Item reimbursements' },
];

/** The API's batch limit (`MAX_BATCH_LINES`). */
export const MAX_BATCH_LINES = 50;
export const BATCH_LIMIT_COPY = 'One payout covers at most 50 lines.';
export const LINES_CHANGED_COPY =
  'Some lines changed since you loaded them. Check the list and try again.';
export const RECEIPT_REUSED_COPY = 'This receipt is already recorded on another payout or refund.';
export const MIXED_RUNNERS_COPY = 'One payout can cover one runner only.';

const EMPTY: Record<RunnerPayoutFilter, { title: string; text: string }> = {
  on_hold: {
    title: 'Nothing to review',
    text: "Item reimbursements without a receipt, above the runner's purchase limit, waiting for a price-decrease refund decision, or claimed after a cancelled or failed task land here.",
  },
  payable: {
    title: 'Nothing owed',
    text: 'Confirmed runner fees and approved reimbursements wait here until you record the M-Pesa payout.',
  },
  paid: { title: 'No payouts yet', text: 'Lines you mark as paid appear here.' },
  rejected: {
    title: 'No rejected reimbursements',
    text: 'Reimbursements you reject appear here.',
  },
  all: {
    title: 'No payout lines yet',
    text: 'A runner fee line appears when a task is confirmed.',
  },
};

const cents = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100);

/** Sum of decimal strings, exact to the cent. */
export function sumAmounts(values: (string | null | undefined)[]): number {
  return values.reduce((acc, v) => acc + cents(v), 0) / 100;
}

/** Topbar sub-line (p-runner-payouts Copy; `{n}+` while there are more pages). */
export function runnerPayoutSubLine(
  filter: RunnerPayoutFilter,
  rows: Pick<RunnerPayoutItem, 'amount'>[],
  more: boolean,
): string {
  const n = `${rows.length}${more ? '+' : ''}`;
  switch (filter) {
    case 'on_hold':
      return `${n} to review`;
    case 'payable':
      return `${n} owed · ${formatKshExact(sumAmounts(rows.map((r) => r.amount)))}`;
    case 'paid':
      return `${n} paid`;
    case 'rejected':
      return `${n} not approved`;
    default:
      return `${n} lines`;
  }
}

/**
 * Runner payouts panel (p-runner-payouts, rows 104-108, 112): every runner
 * payout line, newest first, filtered by runner, type and effective status
 * (default `Needs review`). In `Payable` with one runner chosen, lines can be
 * selected and paid in one M-Pesa payout (A-16 batch bar + A-08 dialog).
 * A reversed payout sits under `Payable` but is re-sent from its line.
 */
@Component({
  selector: 'app-runner-payouts-panel',
  imports: [
    PanelTopbarComponent,
    StatusChipComponent,
    InlineNoticeComponent,
    LoadMoreComponent,
    BatchBarComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    NumTextComponent,
  ],
  template: `
    <app-panel-topbar title="Runner payouts" [sub]="sub()">
      <select
        topbar-actions
        class="btn-city"
        aria-label="Filter runner payouts by runner"
        (change)="setRunner($event)"
      >
        <option value="all" [selected]="runner() === 'all'">All runners</option>
        @for (o of runnerOptions(); track o.id) {
          <option [value]="o.id" [selected]="o.id === runner()">{{ o.label }}</option>
        }
      </select>
      <select
        topbar-actions
        class="btn-city"
        aria-label="Filter runner payouts by type"
        (change)="setKind($event)"
      >
        @for (f of kindFilters; track f.value) {
          <option [value]="f.value" [selected]="f.value === kind()">{{ f.label }}</option>
        }
      </select>
      <select
        topbar-actions
        class="btn-city"
        aria-label="Filter runner payouts by status"
        (change)="setFilter($event)"
      >
        @for (f of filters; track f.value) {
          <option [value]="f.value" [selected]="f.value === filter()">{{ f.label }}</option>
        }
      </select>
      <button topbar-actions type="button" class="btn-city" (click)="reload()">↻ Refresh</button>
    </app-panel-topbar>

    @if (notice(); as n) {
      <app-inline-notice
        class="panel-notice"
        [tone]="n.tone"
        [dismissible]="true"
        [autoDismissMs]="n.tone === 'success' ? 6000 : 0"
        (dismissed)="notice.set(null)"
        ><app-num-text [parts]="n.parts"
      /></app-inline-notice>
    }

    @if (loading()) {
      <div class="ops-loading">Loading runner payouts…</div>
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
      <div class="table-card runner-payouts-table" [class.has-batch]="selectable()">
        <table>
          <thead>
            <tr>
              @if (selectable()) {
                <th class="col-check"><span class="sr-only">Select</span></th>
              }
              <th>Task</th>
              <th>Runner</th>
              <th class="col-type">Type</th>
              <th>Amount</th>
              <th>Status</th>
              <th class="col-created">Created</th>
              <th><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="clickable" (click)="open(r.id)">
                @if (selectable()) {
                  <td class="col-check" (click)="$event.stopPropagation()">
                    <input
                      type="checkbox"
                      class="row-check"
                      [checked]="selected().has(r.id)"
                      [disabled]="r.status === 'paid'"
                      [attr.aria-label]="'Select ' + kindLabel(r.kind) + ' for ' + taskRef(r)"
                      (change)="toggle(r, $event)"
                    />
                  </td>
                }
                <td>
                  <div class="task-cat">{{ taskTitle(r.errand) }}</div>
                  <div class="task-id">{{ taskRef(r) }}</div>
                </td>
                <td>{{ name(r) }}</td>
                <td class="col-type">{{ kindLabel(r.kind) }}</td>
                <td class="num">
                  @let a = amount(r);
                  {{ formatKshExact(a.value) }}
                  @if (a.requested) {
                    <span class="cell-caption">requested</span>
                  }
                </td>
                <td>
                  <app-status-chip [status]="chipStatus(r)" kind="runner_payout" />
                  @if (r.effectiveStatus === 'on_hold') {
                    <span class="cell-caption">{{ reasonLabel(r.reviewReason) }}</span>
                  }
                </td>
                <td class="col-created num cell-muted">{{ formatDateTime(r.createdAt) }}</td>
                <td>
                  <button
                    type="button"
                    class="row-assign"
                    [attr.aria-label]="
                      rowAction(r) + ' ' + kindLabel(r.kind) + ' for ' + taskRef(r)
                    "
                    (click)="$event.stopPropagation(); open(r.id)"
                  >
                    {{ rowAction(r) }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (selectable() && selected().size > 0) {
          <app-batch-bar
            [count]="selected().size"
            [total]="formatKshExact(selectedTotal())"
            actionLabel="Record payout"
            [disabled]="saving()"
            (action)="openPayout()"
          />
        }
      </div>
      @if (filter() === 'payable') {
        <div class="panel-caption">
          Lines marked "Payout reversed" are owed again. Re-send them from the line, not as a new
          payout.
        </div>
      }
      @if (moreError()) {
        <app-inline-notice class="refunds-more-error" tone="danger"
          >Couldn't load more. Try again.</app-inline-notice
        >
      }
      @if (cursor()) {
        <app-load-more [loading]="loadingMore()" (load)="loadMore()" />
      }
    }

    <app-confirm-dialog
      [open]="dialogOpen()"
      [form]="true"
      [title]="dialogTitle()"
      confirmLabel="Mark as paid"
      [busy]="saving()"
      [confirmDisabled]="!!receiptError()"
      (confirmed)="markPaid()"
      (cancelled)="closePayout()"
    >
      <p>
        Send <span class="num">{{ formatKshExact(selectedTotal()) }}</span>
        @if (phone(); as ph) {
          to <span class="num">{{ formatPhone(ph) }}</span>
        }
        by M-Pesa, then enter the receipt.
      </p>
      @if (phone() === null) {
        <p>Find the runner's number in their profile before you send.</p>
      }
      <app-form-field label="M-Pesa receipt" [error]="receiptShown()">
        <input
          appFieldControl
          data-autofocus
          [numeric]="true"
          class="is-upper"
          type="text"
          autocomplete="off"
          spellcheck="false"
          maxlength="64"
          placeholder="e.g. SLK4H7XQ2P"
          [value]="receipt()"
          [disabled]="saving()"
          (input)="setReceipt($event)"
          (blur)="receiptTouched.set(true)"
        />
      </app-form-field>
    </app-confirm-dialog>
  `,
  styles: [],
})
export class RunnerPayoutsPanelComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly s = inject(AdminDataService);
  private readonly nav = inject(DrawerNavService);

  protected readonly filters = RUNNER_PAYOUT_FILTERS;
  protected readonly kindFilters = RUNNER_PAYOUT_KIND_FILTERS;
  readonly filter = signal<RunnerPayoutFilter>('on_hold');
  readonly kind = signal<RunnerPayoutKindFilter>('all');
  readonly runner = signal<string>('all');
  readonly rows = signal<RunnerPayoutItem[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly moreError = signal(false);
  readonly notice = signal<{ tone: NoticeTone; parts: { text: string; num: boolean }[] } | null>(
    null,
  );
  /** Runner names seen on loaded lines (`GET /runners` carries no names). */
  private readonly knownNames = signal<ReadonlyMap<string, string>>(new Map());

  // Batch payout (A-16 + A-08).
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly dialogOpen = signal(false);
  /** The runner's sign-in phone: undefined while loading, null when unknown. */
  readonly phone = signal<string | null | undefined>(undefined);
  readonly receipt = signal('');
  readonly receiptTouched = signal(false);
  private readonly receiptServerError = signal<string | null>(null);
  readonly saving = signal(false);

  private request = 0;
  private savedSinceOpen = false;

  protected readonly sub = computed(() =>
    runnerPayoutSubLine(this.filter(), this.rows(), !!this.cursor()),
  );
  protected readonly empty = computed(() => EMPTY[this.filter()]);
  /** Checkboxes only in `Payable` with one runner chosen (one runner per payout). */
  readonly selectable = computed(() => this.filter() === 'payable' && this.runner() !== 'all');
  readonly selectedTotal = computed(() =>
    sumAmounts(
      this.rows()
        .filter((r) => this.selected().has(r.id))
        .map((r) => r.amount),
    ),
  );
  protected readonly runnerOptions = computed(() => {
    const names = this.knownNames();
    return this.s.runners().map((r) => ({
      id: r.id,
      label: names.get(r.id) ?? `Runner ${maskedId(r.id)}`,
    }));
  });
  protected readonly runnerLabel = computed(() => {
    const id = this.runner();
    return this.knownNames().get(id) ?? `Runner ${maskedId(id)}`;
  });
  protected readonly dialogTitle = computed(() => `Record M-Pesa payout to ${this.runnerLabel()}?`);
  readonly receiptError = computed(() =>
    MPESA_CODE_PATTERN.test(this.receipt().trim()) ? null : CORRECTION_CODE_ERROR,
  );
  protected readonly receiptShown = computed(
    () => this.receiptServerError() ?? (this.receiptTouched() ? this.receiptError() : null),
  );

  constructor() {
    // A save in the drawer updates its row in place right away.
    effect(() => {
      const saved = this.s.lastRunnerPayoutUpdate();
      if (!saved) return;
      untracked(() => {
        this.savedSinceOpen = true;
        this.patchRows(saved);
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
    // `View payouts` on a runner's profile opens this panel filtered to them.
    effect(() => {
      const runnerId = this.nav.runnerPayoutsFor();
      if (!runnerId) return;
      untracked(() => {
        this.nav.runnerPayoutsFor.set(null);
        this.runner.set(runnerId);
        void this.reload();
      });
    });
  }

  ngOnInit(): void {
    if (!this.nav.runnerPayoutsFor()) void this.reload();
  }

  protected setFilter(event: Event): void {
    this.filter.set((event.target as HTMLSelectElement).value as RunnerPayoutFilter);
    void this.reload();
  }

  protected setKind(event: Event): void {
    this.kind.set((event.target as HTMLSelectElement).value as RunnerPayoutKindFilter);
    void this.reload();
  }

  protected setRunner(event: Event): void {
    this.runner.set((event.target as HTMLSelectElement).value);
    void this.reload();
  }

  async reload(): Promise<void> {
    const req = ++this.request;
    this.loading.set(true);
    this.loadError.set(null);
    this.moreError.set(false);
    this.selected.set(new Set());
    void this.s.refreshRunnerPayoutBadge();
    try {
      const page = await firstValueFrom(this.api.listRunnerPayouts(this.query(), null, 25));
      if (req !== this.request) return;
      this.rows.set(page.items);
      this.learnNames(page.items);
      this.cursor.set(page.nextCursor);
    } catch (e) {
      if (req !== this.request) return;
      this.rows.set([]);
      this.cursor.set(null);
      this.loadError.set(
        apiError(e).status === 403 ? FORBIDDEN_COPY : "Couldn't load runner payouts.",
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
      const page = await firstValueFrom(this.api.listRunnerPayouts(this.query(), cursor, 25));
      if (req !== this.request) return;
      this.rows.update((rows) => [...rows, ...page.items]);
      this.learnNames(page.items);
      this.cursor.set(page.nextCursor);
    } catch {
      if (req === this.request) this.moreError.set(true);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected toggle(r: RunnerPayoutItem, event: Event): void {
    const box = event.target as HTMLInputElement;
    const next = new Set(this.selected());
    if (box.checked) {
      if (next.size >= MAX_BATCH_LINES) {
        box.checked = false;
        this.notice.set({ tone: 'info', parts: [{ text: BATCH_LIMIT_COPY, num: false }] });
        return;
      }
      next.add(r.id);
    } else {
      next.delete(r.id);
    }
    this.selected.set(next);
  }

  protected async openPayout(): Promise<void> {
    const first = this.rows().find((r) => this.selected().has(r.id));
    if (!first) return;
    this.receipt.set('');
    this.receiptTouched.set(false);
    this.receiptServerError.set(null);
    this.phone.set(undefined);
    this.dialogOpen.set(true);
    try {
      const detail = await firstValueFrom(this.api.getRunnerPayout(first.id));
      this.phone.set(detail.runner?.phone ?? null);
    } catch {
      this.phone.set(null);
    }
  }

  protected closePayout(): void {
    this.dialogOpen.set(false);
  }

  protected setReceipt(event: Event): void {
    this.receipt.set((event.target as HTMLInputElement).value.toUpperCase());
    this.receiptServerError.set(null);
  }

  async markPaid(): Promise<void> {
    this.receiptTouched.set(true);
    if (this.receiptError() || this.saving()) return;
    const lineIds = this.rows()
      .filter((r) => this.selected().has(r.id))
      .map((r) => r.id);
    const reference = this.receipt().trim().toUpperCase();
    const total = this.selectedTotal();
    this.saving.set(true);
    try {
      const { items } = await firstValueFrom(this.api.markRunnerPayoutsPaid(lineIds, reference));
      this.patchRows(items);
      this.selected.set(new Set());
      this.dialogOpen.set(false);
      this.notice.set({
        tone: 'success',
        parts: [
          { text: 'Payout recorded: ', num: false },
          { text: formatKshExact(total), num: true },
          { text: ' · ', num: false },
          { text: reference, num: true },
          { text: '.', num: false },
        ],
      });
      this.s.runnerPayoutsUpdated(items);
    } catch (e) {
      await this.handlePayoutError(e);
    } finally {
      this.saving.set(false);
    }
  }

  /** p-runner-payouts "Record payout dialog" → Errors (A-14). */
  private async handlePayoutError(e: unknown): Promise<void> {
    const err = apiError(e);
    const danger = (text: string) =>
      this.notice.set({ tone: 'danger', parts: [{ text, num: false }] });
    if (err.code === 'payout_reference_reused') {
      this.receiptServerError.set(RECEIPT_REUSED_COPY);
      return;
    }
    if (err.status === 400 && !err.code && /payoutReference/.test(err.messages.join(' '))) {
      this.receiptServerError.set(CORRECTION_CODE_ERROR);
      return;
    }
    this.dialogOpen.set(false);
    if (err.code === 'runner_payout_mixed_runners') {
      danger(MIXED_RUNNERS_COPY);
    } else if (err.status === 409 || err.status === 404) {
      // runner_payout_not_payable / runner_payout_locked, any other conflict, or a gone line.
      await this.reload();
      danger(LINES_CHANGED_COPY);
    } else if (err.status === 403) {
      danger(FORBIDDEN_COPY);
    } else if (err.status === 400) {
      danger("Couldn't record this payout. Check the lines and the receipt, then try again.");
    } else {
      danger("Couldn't save. Check your connection and try again.");
    }
  }

  protected open(id: string): void {
    this.nav.open('runner_payout', id);
  }

  private patchRows(saved: RunnerPayoutItem[]): void {
    const byId = new Map(saved.map((l) => [l.id, l]));
    this.rows.update((rows) =>
      rows.map((r) => {
        const s = byId.get(r.id);
        return s
          ? {
              ...r,
              status: s.status,
              effectiveStatus: s.effectiveStatus,
              effectivePayout: s.effectivePayout,
              amount: s.amount,
              payoutReference: s.payoutReference,
              paidAt: s.paidAt,
              reviewReason: s.reviewReason,
            }
          : r;
      }),
    );
  }

  private learnNames(items: RunnerPayoutItem[]): void {
    const next = new Map(this.knownNames());
    let changed = false;
    for (const r of items) {
      const label = r.runner?.shortName || r.runner?.displayName;
      if (label && next.get(r.runnerProfileId) !== label) {
        next.set(r.runnerProfileId, label);
        changed = true;
      }
    }
    if (changed) this.knownNames.set(next);
  }

  private query() {
    const f = this.filter();
    const k = this.kind();
    const runner = this.runner();
    return {
      status: f === 'all' ? null : f,
      kind: k === 'all' ? null : k,
      runnerProfileId: runner === 'all' ? null : runner,
    };
  }

  protected name(r: RunnerPayoutItem): string {
    return runnerName(r.runner, r.runnerProfileId);
  }

  protected readonly taskRef = payoutTaskRef;
  protected readonly taskTitle = payoutTaskTitle;
  protected readonly kindLabel = runnerPayoutKindLabel;
  protected readonly reasonLabel = reviewReasonLabel;
  protected readonly amount = runnerPayoutAmount;
  protected readonly chipStatus = runnerPayoutChipStatus;
  protected readonly rowAction = runnerPayoutRowAction;
  protected readonly formatKshExact = formatKshExact;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatPhone = formatPhone;
}
