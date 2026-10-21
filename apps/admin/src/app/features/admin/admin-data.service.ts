import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { apiError, FORBIDDEN_COPY } from '../../core/api-error';
import { eatDayKey, eatWeekday } from './shared-format';
import type {
  AssignErrandDto,
  AssignErrandResult,
  Errand,
  ErrandCandidatesPage,
  ErrandListItem,
  ErrandStatus,
  ErrandStatusHistoryEntry,
  ExpireErrandResult,
  MerchantDetailsDto,
  QuoteErrandDto,
  QuoteErrandResult,
  RefundReview,
  RunnerPayoutItem,
  ResolveDisputeResult,
  ResolveDisputeVerdict,
  ReviewVerificationDto,
  RunnerListItem,
  RunnerVerification,
  UserMe,
  VerificationQueueItem,
  VerificationQueueResult,
  VerificationQueueStatus,
  VerificationView,
} from '../../core/api-types';

/**
 * Ops dashboard data store. Dispatches the real committed surface
 * (`GET /errands`, `GET /runners`, `GET /users/me`) and derives every
 * aggregate the panels render from rows that endpoint actually returned —
 * no fabricated figures. Samples are labeled "last 100" wherever the KPI
 * depends on the fetch window.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  buy_for_me: 'Buy For Me',
  pickup_delivery: 'Get It For Me',
  inspection: 'Check It For Me',
  representation: 'Go There For Me',
  queue_admin: 'Wait For Me',
  business: 'Business Tasks',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? titleCase(category);
}

export function shortId(id: string, prefix = 'NT'): string {
  return `#${prefix}-${id
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-5)
    .toUpperCase()}`;
}

/**
 * A pending customer request for a new quote (row 68): only meaningful while
 * the task can be re-quoted (QUOTED / ACCEPTED).
 */
export function quoteRequested(e: { status: string; quoteRequestedAt?: string | null }): boolean {
  return !!e.quoteRequestedAt && (e.status === 'QUOTED' || e.status === 'ACCEPTED');
}

export function maskedId(id: string): string {
  return `…${id.replace(/[^a-zA-Z0-9]/g, '').slice(-4)}`;
}

/** Relative time (`5m ago`); `—` for a missing or invalid date, never `NaN…`. */
export function timeAgo(iso: string | null | undefined): string {
  const then = iso ? new Date(iso).getTime() : Number.NaN;
  if (Number.isNaN(then)) return '—';
  const now = Date.now();
  const mins = Math.max(1, Math.round((now - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const TERMINAL: string[] = ['COMPLETED', 'CONFIRMED', 'SETTLED', 'CANCELLED', 'FAILED', 'EXPIRED'];
const IN_FLIGHT: string[] = [
  'ACCEPTED',
  'PAYMENT_CONFIRMED',
  'RUNNER_ASSIGNED',
  'RUNNER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER',
];

export interface FeedItem {
  tone: 'green' | 'amber' | 'red' | 'slate';
  title: string;
  sub: string;
  errandId?: string;
  runnerId?: string;
}

export interface CategoryShare {
  label: string;
  pct: number;
  count: number;
}

export interface DailyBar {
  label: string;
  count: number;
}

export interface WeeklyBar {
  label: string;
  count: number;
}

export interface MapPoint {
  runnerId: string;
  x: number;
  y: number;
  availability: RunnerListItem['availability'];
}

@Injectable({ providedIn: 'root' })
export class AdminDataService {
  private readonly api = inject(ApiService);

  readonly errands = signal<ErrandListItem[]>([]);
  readonly runners = signal<RunnerListItem[]>([]);
  /** Runner verification queue (row 260): one item per runner. */
  readonly verificationQueue = signal<QueueRunner[]>([]);
  /** Runners with a pending check over the whole queue; null before the first answer. */
  readonly awaitingReviewCount = signal<number | null>(null);
  private queueSeq = 0;
  readonly me = signal<UserMe | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly refreshedAt = signal<number>(Date.now());

  /** Errands that left the drafting stage (the real "task queue"). */
  readonly tasks = computed(() => this.errands().filter((e) => e.status !== 'DRAFT'));

  readonly disputes = computed(() => this.errands().filter((e) => e.status === 'DISPUTED'));

  /**
   * Tasks whose customer asked for a new quote (row 68, m-8), from
   * `GET /errands?quoteRequested=true`, so a request on a task older than the
   * newest 100 is never missed.
   */
  readonly requestedErrands = signal<ErrandListItem[]>([]);
  /** `GET /errands/count?quoteRequested=true`; null until it has loaded. */
  readonly requestedCount = signal<number | null>(null);

  /** The task queue: the loaded window plus requested tasks outside it (deduped by id). */
  readonly queueTasks = computed(() => {
    const tasks = this.tasks();
    const seen = new Set(tasks.map((e) => e.id));
    const extra = this.requestedErrands().filter((e) => !seen.has(e.id) && e.status !== 'DRAFT');
    return extra.length ? [...tasks, ...extra] : tasks;
  });

  /**
   * Nav badges. The task queue counts tasks needing a quote: REQUESTED,
   * QUOTED, and any task whose customer asked for a new quote (row 68). The
   * requested part comes from the count endpoint (m-8); until it loads, or
   * if it fails, from the queue rows.
   */
  readonly pendingCount = computed(() => {
    const awaiting = this.tasks().filter(
      (e) => (e.status === 'REQUESTED' || e.status === 'QUOTED') && !quoteRequested(e),
    ).length;
    const requested = this.requestedCount() ?? this.queueTasks().filter(quoteRequested).length;
    return awaiting + requested;
  });
  readonly disputeCount = computed(() => this.disputes().length);

  readonly topStats = computed(() => {
    const runners = this.runners();
    const activeRunners = runners.filter(
      (r) => r.availability === 'online' || r.availability === 'busy',
    ).length;
    const idle = runners.filter((r) => r.availability === 'online').length;
    const onTask = runners.filter((r) => r.availability === 'busy').length;
    const tasks = this.tasks();
    const activeTasks = tasks.filter(
      (t) => !TERMINAL.includes(t.status) && t.status !== 'EXPIRED',
    ).length;
    // "Today" is the East Africa Time day, never the browser's (row 96).
    const today = eatDayKey(Date.now());
    const todayErrands = tasks.filter((t) => eatDayKey(t.createdAt) === today).length;
    const completed = tasks.filter((t) => TERMINAL.slice(0, 3).includes(t.status)).length;
    const pending = tasks.filter((t) => t.status === 'REQUESTED' || t.status === 'QUOTED').length;
    const awaitingQuote = tasks.filter((t) => t.status === 'REQUESTED').length;
    const disputes = this.disputes();
    const stale = disputes.filter(
      (d) => Date.now() - new Date(d.createdAt).getTime() > 24 * 3600 * 1000,
    ).length;
    const completionPct =
      tasks.length === 0 ? null : Math.round((completed / tasks.length) * 1000) / 10;
    return {
      totalErrands: tasks.length,
      todayErrands,
      activeRunners,
      idleRunners: idle,
      onTaskRunners: onTask,
      activeTasks,
      pendingTasks: pending,
      awaitingQuote,
      completed,
      completionPct,
      disputes: disputes.length,
      staleDisputes: stale,
      onlineRunners: activeRunners,
      flagged: disputes.length,
    };
  });

  readonly feed = computed<FeedItem[]>(() =>
    this.tasks()
      .slice(0, 8)
      .map((t) => feedItemFor(t)),
  );

  /** Deterministic pseudo-positions for the ops map (stable per runner id). */
  readonly mapPoints = computed<MapPoint[]>(() =>
    this.runners()
      .slice(0, 14)
      .map((r, i) => ({
        runnerId: r.id,
        x: hashCoord(r.id, i, 560) + 30,
        y: hashCoord(r.id, i + 7, 400) + 40,
        availability: r.availability ?? 'offline',
      })),
  );

  readonly categories = computed<CategoryShare[]>(() => {
    const tasks = this.tasks();
    const counts = new Map<string, number>();
    for (const t of tasks) {
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    const total = tasks.length;
    return [...counts.entries()]
      .map(([cat, count]) => ({
        label: categoryLabel(cat),
        count,
        pct: total === 0 ? 0 : Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  });

  readonly dailyBars = computed<DailyBar[]>(() => {
    const days = lastNDates(7);
    return days.map((d) => ({
      label: d.label,
      count: this.tasks().filter((t) => eatDayKey(t.createdAt) === d.key).length,
    }));
  });

  readonly weeklyGrowth = computed<WeeklyBar[]>(() => {
    const weeks = lastNWeeks(5);
    return weeks.map((w) => ({
      label: w.label,
      count: this.runners().filter(
        (r) => new Date(r.createdAt) >= w.start && new Date(r.createdAt) < w.end,
      ).length,
    }));
  });

  readonly completionShare = computed(() => {
    const s = this.topStats();
    if (s.completionPct === null) return null;
    return { pct: s.completionPct, done: s.completed, total: s.totalErrands };
  });

  readonly repeatUsage = computed<{ pct: number } | null>(() => {
    // Repeat usage needs a customer reference per errand row; the admin list
    // surface doesn't expose one, so this metric stays undisclosed until the
    // API includes it — never fabricated from anonymous rows.
    return null;
  });

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [errands, runners, me] = await Promise.all([
        firstValueFrom(this.api.listErrands()),
        firstValueFrom(this.api.listRunners()),
        firstValueFrom(this.api.me()),
      ]);
      this.errands.set(errands.items);
      this.runners.set(runners.items);
      this.me.set(me);
      this.refreshedAt.set(Date.now());
      void this.refreshRefundBadge();
      void this.refreshRunnerPayoutBadge();
      void this.refreshQuoteRequests();
    } catch (e) {
      this.error.set(syncErrorCopy(e));
    } finally {
      this.loading.set(false);
    }
  }

  async refreshErrands(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.listErrands());
      this.errands.set(res.items);
      this.refreshedAt.set(Date.now());
      void this.refreshQuoteRequests();
    } catch {
      /* op-level refresh failures surface on next full refresh */
    }
  }

  /**
   * Loads the customer requests for a new quote (row 68, m-8): up to 100
   * requested tasks for the queue and their count for the badge. Only
   * QUOTED / ACCEPTED tasks can be re-quoted (`quoteRequested()`). Each part
   * keeps its last value on error.
   */
  async refreshQuoteRequests(): Promise<void> {
    const statuses: ErrandStatus[] = ['QUOTED', 'ACCEPTED'];
    await Promise.all([
      firstValueFrom(this.api.listErrands(statuses, null, 100, { quoteRequested: true })).then(
        (res) => this.requestedErrands.set(res.items),
        () => undefined,
      ),
      firstValueFrom(this.api.countErrands(statuses, true)).then(
        (res) => this.requestedCount.set(res.count),
        () => undefined,
      ),
    ]);
  }

  // --- Drawer data: errand detail + status history (per selection) ---
  readonly detail = signal<Errand | null>(null);
  readonly history = signal<ErrandStatusHistoryEntry[]>([]);
  readonly detailLoading = signal(false);
  /** User copy for a failed detail load (never the raw HTTP message). */
  readonly detailError = signal<string | null>(null);
  /** 404 is `info` with no retry (specs' error tables); everything else `danger`. */
  readonly detailErrorTone = signal<'info' | 'danger'>('danger');
  private detailRequest = 0;

  /**
   * Loads `GET /errands/:id` + history. A newer call wins: a slower earlier
   * response (e.g. the previous drawer) never overwrites the current one.
   * `quiet` keeps the current detail on screen while reloading.
   */
  async loadErrandDetail(id: string, opts: { quiet?: boolean } = {}): Promise<void> {
    const req = ++this.detailRequest;
    if (!opts.quiet) {
      this.detailLoading.set(true);
      this.detail.set(null);
      this.history.set([]);
    }
    this.detailError.set(null);
    try {
      const [detail, history] = await Promise.all([
        firstValueFrom(this.api.getErrand(id)),
        firstValueFrom(this.api.getErrandHistory(id)),
      ]);
      if (req !== this.detailRequest) return;
      this.detail.set(detail);
      this.history.set(history);
    } catch (e) {
      if (req !== this.detailRequest) return;
      const err = apiError(e);
      this.detailErrorTone.set(err.status === 404 ? 'info' : 'danger');
      this.detailError.set(
        err.status === 403
          ? FORBIDDEN_COPY
          : err.status === 404
            ? 'This task no longer exists.'
            : "Couldn't load this task. Check your connection and try again.",
      );
    } finally {
      if (req === this.detailRequest) this.detailLoading.set(false);
    }
  }

  /** Patches an errand in the list window and, if open, in the drawer detail. */
  patchErrand(id: string, patch: Partial<Errand>): void {
    const listPatch: Partial<ErrandListItem> = {};
    for (const key of [
      'status',
      'quotedPrice',
      'runnerProfileId',
      'quoteExpiresAt',
      'quoteRequestedAt',
      'title',
    ] as const) {
      if (key in patch) (listPatch as Record<string, unknown>)[key] = patch[key];
    }
    const wasRequested = [...this.errands(), ...this.requestedErrands()].some(
      (e) => e.id === id && quoteRequested(e),
    );
    this.errands.update((items) => items.map((e) => (e.id === id ? { ...e, ...listPatch } : e)));
    this.requestedErrands.update((items) =>
      items.map((e) => (e.id === id ? { ...e, ...listPatch } : e)),
    );
    // A request answered here (new quote, or the task moved on) leaves the badge now.
    const count = this.requestedCount();
    const isRequested = [...this.errands(), ...this.requestedErrands()].some(
      (e) => e.id === id && quoteRequested(e),
    );
    if (count !== null && wasRequested && !isRequested) {
      this.requestedCount.set(Math.max(0, count - 1));
    }
    const d = this.detail();
    if (d && d.id === id) {
      this.detail.set({ ...d, ...patch });
    }
  }

  /** Appends a history row to the open drawer's timeline. */
  private appendHistory(entry: ErrandStatusHistoryEntry | null): void {
    const d = this.detail();
    if (entry && d && d.id === entry.errandId) {
      this.history.update((h) => (h.some((x) => x.id === entry.id) ? h : [...h, entry]));
    }
  }

  /** Throws the A-14 `ApiErrorInfo` on failure. */
  async resolveDispute(
    id: string,
    verdict: ResolveDisputeVerdict,
    rationale: string,
  ): Promise<ResolveDisputeResult> {
    try {
      const res = await firstValueFrom(this.api.resolveDispute(id, verdict, rationale));
      this.patchErrand(id, { status: res.errand.status });
      this.appendHistory(res.history);
      return res;
    } catch (e) {
      throw apiError(e);
    }
  }

  /** PAYMENT_CONFIRMED → RUNNER_ASSIGNED. Throws the A-14 `ApiErrorInfo`. */
  async assignErrand(
    id: string,
    runnerProfileId: string,
    note?: string,
  ): Promise<AssignErrandResult> {
    const dto: AssignErrandDto = { runnerProfileId, ...(note ? { note } : {}) };
    try {
      const res = await firstValueFrom(this.api.assignErrand(id, dto));
      this.patchErrand(id, { status: res.errand.status, runnerProfileId });
      this.appendHistory(res.history);
      return res;
    } catch (e) {
      throw apiError(e);
    }
  }

  /**
   * `GET /errands/:id/candidates`: the runners the task may be offered to
   * (N-20). Throws the A-14 `ApiErrorInfo`.
   */
  async loadCandidates(id: string): Promise<ErrandCandidatesPage> {
    try {
      return await firstValueFrom(this.api.listErrandCandidates(id));
    } catch (e) {
      throw apiError(e);
    }
  }

  /**
   * "Expire task — no runner available" (rows 187, 202, 203): RUNNER_ASSIGNED
   * → EXPIRED by the admin, with the trimmed reason. Throws the A-14
   * `ApiErrorInfo`.
   */
  async expireErrand(id: string, reason: string): Promise<ExpireErrandResult> {
    try {
      const res = await firstValueFrom(this.api.expireErrand(id, reason.trim()));
      this.patchErrand(id, { status: res.errand.status });
      this.appendHistory(res.history);
      return res;
    } catch (e) {
      throw apiError(e);
    }
  }

  /** First quote or re-quote. Throws the A-14 `ApiErrorInfo`. */
  async quoteErrand(id: string, dto: QuoteErrandDto): Promise<QuoteErrandResult> {
    try {
      const res = await firstValueFrom(this.api.quoteErrand(id, dto));
      this.patchErrand(id, {
        status: res.errand.status,
        quotedPrice: res.errand.quotedPrice ?? res.quote.total,
        quoteExpiresAt: res.quote.expiresAt,
        // Issuing a quote answers any pending customer request (row 68).
        quoteRequestedAt: res.errand.quoteRequestedAt ?? null,
      });
      this.appendHistory(res.history);
      return res;
    } catch (e) {
      throw apiError(e);
    }
  }

  /** Throws the A-14 `ApiErrorInfo`. */
  async setMerchantDetails(id: string, body: MerchantDetailsDto): Promise<Errand> {
    try {
      const res = await firstValueFrom(this.api.setMerchantDetails(id, body));
      this.patchErrand(id, {
        merchantName: res.merchantName ?? null,
        merchantTillNumber: res.merchantTillNumber ?? null,
        merchantPaybillNumber: res.merchantPaybillNumber ?? null,
        merchantAccountReference: res.merchantAccountReference ?? null,
        merchantDetailsAvailable: true,
      });
      return res;
    } catch (e) {
      throw apiError(e);
    }
  }

  // --- Refund reviews: sidebar badge + cross-view updates ---
  /** `Needs review` count for the sidebar badge; `more` = show `99+`. */
  readonly refundBadge = signal<{ count: number; more: boolean }>({ count: 0, more: false });
  /** Last review saved in the refund drawer (the panel patches its row). */
  readonly lastRefundUpdate = signal<RefundReview | null>(null);

  async refreshRefundBadge(): Promise<void> {
    try {
      const { count } = await firstValueFrom(this.api.countRefunds('pending_review'));
      this.refundBadge.set({ count: Math.min(count, 99), more: count > 99 });
    } catch {
      /* the badge keeps its last value; the Refunds panel shows its own error */
    }
  }

  refundUpdated(review: RefundReview): void {
    this.lastRefundUpdate.set(review);
    void this.refreshRefundBadge();
  }

  // --- Runner payouts (row 107): sidebar badge + cross-view updates ---
  /** `Needs review` line count for the sidebar badge; `more` = show `99+`. */
  readonly runnerPayoutBadge = signal<{ count: number; more: boolean }>({ count: 0, more: false });
  /** Lines saved in the runner payout drawer or a batch payout (the panel patches its rows). */
  readonly lastRunnerPayoutUpdate = signal<RunnerPayoutItem[] | null>(null);

  async refreshRunnerPayoutBadge(): Promise<void> {
    try {
      const { count } = await firstValueFrom(this.api.countRunnerPayouts('on_hold'));
      this.runnerPayoutBadge.set({ count: Math.min(count, 99), more: count > 99 });
    } catch {
      /* the badge keeps its last value; the panel shows its own error */
    }
  }

  runnerPayoutsUpdated(lines: RunnerPayoutItem[]): void {
    this.lastRunnerPayoutUpdate.set(lines);
    void this.refreshRunnerPayoutBadge();
  }

  /**
   * Loads one page of the runner-grouped verification queue (row 260). The
   * first page replaces the cards; a cursor appends, merging any runner
   * already on screen into its card. A failed first page clears the cards
   * (no stale cards under a new filter). Returns null when a newer load has
   * started since (its answer wins).
   */
  async loadVerificationQueue(
    status: VerificationQueueStatus,
    cursor?: string | null,
  ): Promise<VerificationQueueResult | null> {
    const seq = cursor ? this.queueSeq : ++this.queueSeq;
    let res: VerificationQueueResult;
    try {
      res = await firstValueFrom(this.api.verificationQueue(status, cursor));
    } catch (e) {
      if (seq !== this.queueSeq) return null;
      if (!cursor) this.verificationQueue.set([]);
      throw e;
    }
    if (seq !== this.queueSeq) return null;
    this.awaitingReviewCount.set(res.awaitingReviewCount);
    if (cursor) {
      this.verificationQueue.update((items) => mergeQueuePage(items, res.items));
    } else {
      this.verificationQueue.set(mergeQueuePage([], res.items));
    }
    return res;
  }

  /** Drops the cards (filter change); any load still in flight is ignored. */
  clearVerificationQueue(): void {
    this.queueSeq++;
    this.verificationQueue.set([]);
  }

  /**
   * Decides one pending check, `{ decision, reviewerNote? }` (blank note →
   * none). The answer is merged over the check (the full item and the bare
   * verification both work); a returned `runnerProfile.verificationLevel`
   * and `level2Missing` update the card (the level can drop 2 → 1 after a
   * rejection, row 263). The awaiting count drops when the runner has no
   * pending check left.
   */
  async reviewVerification(
    check: Pick<RunnerVerification, 'id' | 'runnerProfileId'>,
    decision: 'approved' | 'rejected',
    reviewerNote?: string,
  ): Promise<void> {
    const dto: ReviewVerificationDto = reviewerNote ? { decision, reviewerNote } : { decision };
    const res = await firstValueFrom(
      this.api.reviewVerification(check.runnerProfileId, check.id, dto),
    );
    let clearedRunner = false;
    this.verificationQueue.update((items) =>
      items.map((item) => {
        if (!item.checks.some((c) => c.id === check.id)) return item;
        const hadPending = item.checks.some((c) => c.status === 'pending');
        const checks = item.checks.map((c) => (c.id === check.id ? mergeReviewAnswer(c, res) : c));
        const pendingCount = checks.filter((c) => c.status === 'pending').length;
        if (hadPending && pendingCount === 0) clearedRunner = true;
        return { ...item, checks, pendingCount, ...levelFromAnswer(item, res) };
      }),
    );
    if (clearedRunner) {
      this.awaitingReviewCount.update((n) => (n === null ? n : Math.max(0, n - 1)));
    }
  }

  /** Records an audited re-review (row 171) and appends it to the check. */
  async reReviewVerification(id: string, note?: string): Promise<void> {
    const res = await firstValueFrom(this.api.reReviewVerification(id, note));
    this.updateQueueCheck(id, (v) => ({ ...v, reReviews: [...v.reReviews, res.reReview] }));
  }

  /**
   * Marks a check's image as deleted (a 410 from the API), keeping the
   * record. The date comes from the API only (`purgedAt` extra); without it
   * the row reads `Deleted` with no date, never today's date.
   */
  markVerificationPurged(id: string, purgedAt: string | null): void {
    this.updateQueueCheck(id, (v) => ({
      ...v,
      purgedAt: purgedAt ?? v.purgedAt,
      purgedLocally: true,
      reviewerNote: null,
      reReviews: v.reReviews.map((r) => ({ ...r, note: null })),
    }));
  }

  /** Marks a check as having no stored image (a 404 `verification_document_missing`). */
  markVerificationMissing(id: string): void {
    this.updateQueueCheck(id, (v) => ({ ...v, hasDocument: false }));
  }

  private updateQueueCheck(id: string, fn: (v: QueueCheck) => QueueCheck): void {
    this.verificationQueue.update((items) =>
      items.map((item) =>
        item.checks.some((c) => c.id === id)
          ? { ...item, checks: item.checks.map((c) => (c.id === id ? fn(c) : c)) }
          : item,
      ),
    );
  }
}

/** A queue check, plus a client mark for a 410 that carried no `purgedAt`. */
export type QueueCheck = RunnerVerification & { purgedLocally?: boolean };

/** A queue item whose checks may carry the client purge mark. */
export type QueueRunner = Omit<VerificationQueueItem, 'checks'> & { checks: QueueCheck[] };

/**
 * Merges a PATCH answer over the check: every field the answer carries
 * (status, reviewer, note, side, hasDocument, purgedAt, runner, user,
 * re-reviews); fields the bare answer lacks are kept from the check.
 */
function mergeReviewAnswer(
  v: QueueCheck,
  res: VerificationView & Partial<RunnerVerification>,
): QueueCheck {
  return {
    ...v,
    ...res,
    runnerProfile: res.runnerProfile ?? v.runnerProfile,
    user: res.user ?? v.user,
    reReviews: res.reReviews ?? v.reReviews,
    // The bare answer has no display name; the card falls back to the short id.
    reviewer: res.reviewer ?? (res.reviewedBy ? { id: res.reviewedBy, displayName: null } : null),
  };
}

/**
 * The card's level and Level 2 gaps from a PATCH answer (N-L1): both come
 * from the API only. A bare answer (no `runnerProfile`) leaves the card as is.
 */
function levelFromAnswer(
  item: QueueRunner,
  res: VerificationView & Partial<RunnerVerification>,
): Pick<QueueRunner, 'runnerProfile' | 'verification'> {
  const level = res.runnerProfile?.verificationLevel;
  const missing = res.runnerProfile?.level2Missing;
  return {
    runnerProfile: {
      ...item.runnerProfile,
      ...(level ? { verificationLevel: level } : {}),
      ...(missing ? { level2Missing: missing } : {}),
    },
    verification:
      missing && item.verification
        ? { ...item.verification, level2Missing: missing }
        : item.verification,
  };
}

/** Appends runners, merging one already on screen into its card (never a second card). */
function mergeQueuePage(current: QueueRunner[], page: VerificationQueueItem[]): QueueRunner[] {
  const out = [...current];
  for (const item of page) {
    const i = out.findIndex((r) => r.runnerProfile.id === item.runnerProfile.id);
    if (i < 0) {
      out.push(item);
      continue;
    }
    const ids = new Set(item.checks.map((c) => c.id));
    const checks = [...item.checks, ...out[i].checks.filter((c) => !ids.has(c.id))].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    out[i] = { ...item, checks, pendingCount: checks.filter((c) => c.status === 'pending').length };
  }
  return out;
}

/** User copy for a failed dashboard sync (never the raw HTTP message). */
export function syncErrorCopy(e: unknown): string {
  const err = apiError(e);
  if (err.status === 403) return FORBIDDEN_COPY;
  return "Couldn't reach the ops API. Check your connection and refresh.";
}

function feedItemFor(t: ErrandListItem): FeedItem {
  const status = t.status;
  const area = 'Nairobi';
  const sub = `${categoryLabel(t.category)} · ${timeAgo(t.createdAt)}`;
  if (status === 'COMPLETED' || status === 'CONFIRMED' || status === 'SETTLED') {
    return { tone: 'green', title: `Task completed — ${labelFor(t)}`, sub, errandId: t.id };
  }
  if (status === 'DISPUTED') {
    return { tone: 'red', title: `Dispute opened — ${labelFor(t)}`, sub, errandId: t.id };
  }
  if (status === 'CANCELLED' || status === 'FAILED' || status === 'EXPIRED') {
    return { tone: 'red', title: `${titleCase(status)} — ${labelFor(t)}`, sub, errandId: t.id };
  }
  if (status === 'RUNNER_EN_ROUTE') {
    return { tone: 'amber', title: `Runner en route — ${labelFor(t)}`, sub, errandId: t.id };
  }
  if (status === 'ARRIVED') {
    return { tone: 'green', title: `Runner arrived — ${labelFor(t)}`, sub, errandId: t.id };
  }
  if (status === 'IN_PROGRESS' || status === 'AWAITING_CUSTOMER') {
    return { tone: 'amber', title: `${titleCase(status)} — ${labelFor(t)}`, sub, errandId: t.id };
  }
  if (status === 'ACCEPTED' || status === 'PAYMENT_CONFIRMED' || status === 'RUNNER_ASSIGNED') {
    return { tone: 'slate', title: `Task assigned — ${labelFor(t)}`, sub, errandId: t.id };
  }
  if (status === 'REQUESTED') {
    return { tone: 'amber', title: `Task requested — ${labelFor(t)}`, sub, errandId: t.id };
  }
  if (status === 'QUOTED') {
    return { tone: 'slate', title: `Quote issued — ${labelFor(t)}`, sub, errandId: t.id };
  }
  return { tone: 'slate', title: `${titleCase(status)} — ${labelFor(t)}`, sub, errandId: t.id };
}

function labelFor(t: ErrandListItem): string {
  return shortId(t.id);
}

/** Stable pseudo-random coordinate in [0, bound] from a runner id + salt. */
function hashCoord(id: string, salt: number, bound: number): number {
  let h = 0;
  const seed = `${id}:${salt}`;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 9973;
  }
  return h % bound;
}

const DAY_MS = 24 * 3600 * 1000;

/** The last `n` East Africa Time days, oldest first (row 96). */
export function lastNDates(n: number, now = Date.now()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  for (let i = n - 1; i >= 0; i--) {
    const at = now - i * DAY_MS;
    const day = eatWeekday(at);
    out.push({ key: eatDayKey(at), label: DAY_NAMES[day === 0 ? 6 : day - 1] });
  }
  return out;
}

/** The last `n` weeks, Monday 00:00 East Africa Time to the next Monday (row 96). */
export function lastNWeeks(
  n: number,
  now = Date.now(),
): { label: string; start: Date; end: Date }[] {
  const out: { label: string; start: Date; end: Date }[] = [];
  const midnight = Date.parse(`${eatDayKey(now)}T00:00:00+03:00`);
  const monday = midnight - ((eatWeekday(now) + 6) % 7) * DAY_MS;
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(monday - i * 7 * DAY_MS);
    out.push({ label: `W${i + 1}`, start, end: new Date(start.getTime() + 7 * DAY_MS) });
  }
  return out;
}
