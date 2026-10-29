// customer `v-home` (customer-v-home.md). Greeting by browser-local hour
// (WQ-2 parity), bell, avatar, search row, category links, then the tasks
// region: the first active errand as the blue card (+N more), up to two
// recent rows. Realtime: the active errand's room, reload on its status
// change and after a reconnect; never `location:update` (WQ-29). While not
// connected and visible, a 30 s poll. No signal effects: imperative joins
// and RealtimeService.onStateChange (§W10).
import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SessionStore } from '../../../core/auth/session.store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { NmNum } from '../../../shared/format/num.directive';
import { NmActiveTaskCard } from '../../../shared/ui/active-task-card/active-task-card.component';
import { NmAvatar } from '../../../shared/ui/avatar/avatar.component';
import { NmButton } from '../../../shared/ui/button/button.component';
import { NmSectionLabel } from '../../../shared/ui/card/section-label.component';
import { NmCategoryGrid } from '../../../shared/ui/category/category-grid.component';
import { followInAppLink } from '../../../shared/ui/links';
import { NmNotificationBell } from '../../../shared/ui/notification-bell/notification-bell.component';
import { NmSearchEntry } from '../../../shared/ui/search-entry/search-entry.component';
import { NmErrorState } from '../../../shared/ui/states/error-state.component';
import { NmSkeletonCard } from '../../../shared/ui/states/skeleton-card.component';
import { NmTaskRow } from '../../../shared/ui/task-row/task-row.component';
import { NmTopBar } from '../../../shared/ui/top-bar/top-bar.component';
import { CUSTOMER_NOW } from '../clock';
import { customerLinks } from '../customer-links';
import { CustomerErrandsApi } from '../data/errands.api';
import { NotificationsCountApi } from '../data/notifications.api';
import {
  ACTIVE_LIMIT,
  ACTIVE_STATUSES,
  FINISHED_STATUSES,
  HomeErrand,
  RECENT_LIMIT,
  activeCard,
  errandTitle,
  firstName,
  greetingFor,
  knownErrands,
} from './home-tasks';

export const HOME_POLL_MS = 30_000;
export const HOME_ERROR = "Couldn't load your tasks.";

type TasksState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly active: HomeErrand[]; readonly recent: HomeErrand[] };

@Component({
  selector: 'app-home-page',
  imports: [
    NmTopBar,
    NmNotificationBell,
    NmAvatar,
    NmSearchEntry,
    NmSectionLabel,
    NmCategoryGrid,
    NmSkeletonCard,
    NmErrorState,
    NmActiveTaskCard,
    NmButton,
    NmNum,
    NmTaskRow,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly session = inject(SessionStore);
  private readonly errands = inject(CustomerErrandsApi);
  private readonly notifications = inject(NotificationsCountApi);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly now = inject(CUSTOMER_NOW);

  protected readonly links = customerLinks;
  protected readonly errorCopy = HOME_ERROR;
  protected readonly newTaskLink = (category: string) => customerLinks.newTask(category);

  protected readonly displayName = computed(() => this.session.user()?.displayName ?? null);
  protected readonly firstName = computed(() => firstName(this.displayName()));
  protected readonly greeting = greetingFor(this.now());
  protected readonly clock = this.now();

  protected readonly unread = signal(0);
  protected readonly state = signal<TasksState>({ kind: 'loading' });
  protected readonly card = computed(() => {
    const s = this.state();
    return s.kind === 'loaded' && s.active.length ? activeCard(s.active[0]) : null;
  });
  protected readonly more = computed(() => {
    const s = this.state();
    return s.kind === 'loaded' ? Math.max(0, s.active.length - 1) : 0;
  });
  protected readonly recent = computed(() => {
    const s = this.state();
    return s.kind === 'loaded'
      ? s.recent.map((e) => ({ id: e.id, status: e.status, title: errandTitle(e.view), time: e.view.updatedAt ?? e.view.createdAt }))
      : [];
  });

  private sequence = 0;
  private joined: string | null = null;
  private dropped = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.load();

    this.realtime.statusChanges$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.errandId === this.joined) void this.load();
    });
    this.realtime.onStateChange((state) => {
      if (state === 'reconnecting') this.dropped = true;
      else if (state === 'connected' && this.dropped) {
        this.dropped = false;
        void this.load();
      }
    }, destroyRef);

    // Polling fallback; outside the zone so the page can settle (tests, SSR-free).
    const zone = inject(NgZone);
    const timer = zone.runOutsideAngular(() =>
      setInterval(() => {
        if (this.realtime.state() !== 'connected' && document.visibilityState === 'visible') zone.run(() => void this.load());
      }, HOME_POLL_MS),
    );
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      if (this.joined) this.realtime.leaveErrand(this.joined);
      this.joined = null;
    });
  }

  /** Both lists in parallel plus the unread count; skeletons on every reload. */
  protected async load(): Promise<void> {
    const sequence = ++this.sequence;
    this.state.set({ kind: 'loading' });
    this.notifications
      .unread()
      .then((n) => sequence === this.sequence && this.unread.set(n))
      .catch(() => sequence === this.sequence && this.unread.set(0));
    try {
      const [active, recent] = await Promise.all([
        this.errands.list(ACTIVE_STATUSES, ACTIVE_LIMIT),
        this.errands.list(FINISHED_STATUSES, RECENT_LIMIT),
      ]);
      if (sequence !== this.sequence) return;
      const activeErrands = knownErrands(active?.items);
      this.state.set({ kind: 'loaded', active: activeErrands, recent: knownErrands(recent?.items).slice(0, RECENT_LIMIT) });
      this.syncRoom(activeErrands[0]?.id ?? null);
    } catch {
      if (sequence === this.sequence) this.state.set({ kind: 'error' });
    }
  }

  protected follow(event: MouseEvent, href: string): void {
    followInAppLink(event, href, this.router);
  }

  /** Leave the old room, join the new one (joins are kept for reconnects by the service). */
  private syncRoom(id: string | null): void {
    if (id === this.joined) return;
    if (this.joined) this.realtime.leaveErrand(this.joined);
    this.joined = id;
    if (id) void this.realtime.joinErrand(id);
  }
}
