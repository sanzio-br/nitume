import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import type {
  AssignErrandDto,
  Errand,
  ErrandListItem,
  ErrandStatusHistoryEntry,
  QuoteErrandDto,
  ResolveDisputeVerdict,
  ReviewVerificationDto,
  RunnerListItem,
  RunnerVerification,
  UserMe,
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
  business: 'Business',
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

export function maskedId(id: string): string {
  return `…${id.replace(/[^a-zA-Z0-9]/g, '').slice(-4)}`;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
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
  readonly verifications = signal<RunnerVerification[]>([]);
  readonly me = signal<UserMe | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly refreshedAt = signal<number>(Date.now());

  /** Errands that left the drafting stage (the real "task queue"). */
  readonly tasks = computed(() => this.errands().filter((e) => e.status !== 'DRAFT'));

  readonly disputes = computed(() => this.errands().filter((e) => e.status === 'DISPUTED'));

  /** Nav badges. */
  readonly pendingCount = computed(
    () => this.tasks().filter((e) => e.status === 'REQUESTED' || e.status === 'QUOTED').length,
  );
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
    const today = new Date().toDateString();
    const todayErrands = tasks.filter((t) => new Date(t.createdAt).toDateString() === today).length;
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
      count: this.tasks().filter((t) => new Date(t.createdAt).toDateString() === d.key).length,
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
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
    }
  }

  async refreshErrands(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.listErrands());
      this.errands.set(res.items);
      this.refreshedAt.set(Date.now());
    } catch {
      /* op-level refresh failures surface on next full refresh */
    }
  }

  // --- Drawer data: errand detail + status history (per selection) ---
  readonly detail = signal<Errand | null>(null);
  readonly history = signal<ErrandStatusHistoryEntry[]>([]);
  readonly detailLoading = signal(false);
  readonly detailError = signal<string | null>(null);

  async loadErrandDetail(id: string): Promise<void> {
    this.detailLoading.set(true);
    this.detailError.set(null);
    try {
      const [detail, history] = await Promise.all([
        firstValueFrom(this.api.getErrand(id)),
        firstValueFrom(this.api.getErrandHistory(id)),
      ]);
      this.detail.set(detail);
      this.history.set(history);
    } catch (e) {
      this.detailError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.detailLoading.set(false);
    }
  }

  async resolveDispute(
    id: string,
    verdict: ResolveDisputeVerdict,
    rationale: string,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await firstValueFrom(this.api.resolveDispute(id, verdict, rationale));
      this.errands.update((items) =>
        items.map((e) => (e.id === id ? { ...e, status: res.errand.status } : e)),
      );
      return { ok: true, message: `Verdict recorded — errand ${res.errand.status.toLowerCase()}.` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async assignErrand(id: string, runnerProfileId: string, note?: string): Promise<Errand> {
    const dto: AssignErrandDto = { runnerProfileId, note };
    const res = await firstValueFrom(this.api.assignErrand(id, dto));
    this.errands.update((items) =>
      items.map((e) => (e.id === id ? { ...e, status: res.status, runnerProfileId } : e)),
    );
    return res;
  }

  async quoteErrand(id: string, dto: QuoteErrandDto): Promise<Errand> {
    const res = await firstValueFrom(this.api.quoteErrand(id, dto));
    this.errands.update((items) =>
      items.map((e) => (e.id === id ? { ...e, status: res.status, quotedPrice: res.quotedPrice } : e)),
    );
    return res;
  }

  async reviewVerification(id: string, decision: 'approved' | 'rejected'): Promise<RunnerVerification> {
    const dto: ReviewVerificationDto = { decision };
    const res = await firstValueFrom(this.api.reviewVerification(id, dto));
    this.verifications.update((items) =>
      items.map((v) => (v.id === id ? res : v)),
    );
    return res;
  }

  listVerifications(status?: string, cursor?: string | null, limit = 50): Observable<{ items: RunnerVerification[]; nextCursor: string | null }> {
    return new Observable((subscriber) => {
      this.api.listVerifications(status, cursor, limit).subscribe({
        next: (res) => {
          if (!cursor) {
            this.verifications.set(res.items);
          } else {
            this.verifications.update((v) => [...v, ...res.items]);
          }
          subscriber.next(res);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }
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

function lastNDates(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ key: d.toDateString(), label: DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1] });
  }
  return out;
}

function lastNWeeks(n: number): { label: string; start: Date; end: Date }[] {
  const out: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(now.getDate() - (now.getDay() || 7) + 1 - i * 7); // Monday of week
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    out.push({ label: `W${i + 1}`, start, end });
  }
  return out;
}
