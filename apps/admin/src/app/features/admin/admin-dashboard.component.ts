import {
  Component,
  Injector,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AdminDataService, maskedId, shortId } from './admin-data.service';
import { DrawerNavService } from './drawer-nav.service';
import { LiveMapPanelComponent } from './panels/live-map.panel';
import { TaskQueuePanelComponent } from './panels/task-queue.panel';
import { RunnersPanelComponent } from './panels/runners.panel';
import { VerificationsPanelComponent } from './panels/verifications.panel';
import { DisputesPanelComponent } from './panels/disputes.panel';
import { ReportsPanelComponent } from './panels/reports.panel';
import { TaskDrawerComponent } from './drawers/task-drawer';
import { RunnerDrawerComponent } from './drawers/runner-drawer';
import { DisputeDrawerComponent } from './drawers/dispute-drawer';
import { RefundDrawerComponent } from './drawers/refund-drawer';
import { RunnerPayoutDrawerComponent } from './drawers/runner-payout-drawer';
import { RunnerVerificationDrawerComponent } from './drawers/runner-verification-drawer';
import { CustomerDrawerComponent } from './drawers/customer-drawer';
import { RefundsPanelComponent } from './panels/refunds.panel';
import { RunnerPayoutsPanelComponent } from './panels/runner-payouts.panel';
import { OpsDrawerComponent } from '../../shared/ops-drawer.component';
import { InlineNoticeComponent } from '../../shared/inline-notice.component';

type Panel =
  | 'map'
  | 'queue'
  | 'runners'
  | 'verifications'
  | 'disputes'
  | 'refunds'
  | 'runner-payouts'
  | 'reports';

/**
 * Ops shell (design `nitume_admin_dashboard.html` → `.app`): Deep Trust Blue
 * sidebar with nav groups + live badges, a fluid main that swaps panels, and
 * the right-side drawer routed to the task/runner/dispute surfaces.
 * Data comes solely from the AdminDataService store (committed API rows).
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [
    LiveMapPanelComponent,
    TaskQueuePanelComponent,
    RunnersPanelComponent,
    VerificationsPanelComponent,
    DisputesPanelComponent,
    ReportsPanelComponent,
    TaskDrawerComponent,
    RunnerDrawerComponent,
    DisputeDrawerComponent,
    RefundDrawerComponent,
    RunnerPayoutDrawerComponent,
    RunnerVerificationDrawerComponent,
    CustomerDrawerComponent,
    RefundsPanelComponent,
    RunnerPayoutsPanelComponent,
    OpsDrawerComponent,
    InlineNoticeComponent,
  ],
  template: `
    <div class="ops-app">
      <aside class="ops-sidebar">
        <div class="ops-brand"><span class="dot"></span>Nitume Ops</div>

        <div class="ops-nav-group">
          <div class="ops-nav-label">Monitor</div>
          <button class="ops-nav-item" [class.active]="panel() === 'map'" (click)="select('map')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path>
            </svg>
            Live ops
          </button>
          <button
            class="ops-nav-item"
            [class.active]="panel() === 'queue'"
            (click)="select('queue')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h16M4 18h10"></path>
            </svg>
            Task queue
            @if (s.pendingCount() > 0) {
              <span class="badge-count">{{ s.pendingCount() }}</span>
            }
          </button>
        </div>

        <div class="ops-nav-group">
          <div class="ops-nav-label">Network</div>
          <button
            class="ops-nav-item"
            [class.active]="panel() === 'runners'"
            (click)="select('runners')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="8" r="3.5"></circle>
              <path
                d="M3 20c.7-3.3 3-5 6-5s5.3 1.7 6 5M16 6.2A3.5 3.5 0 0 1 16 9.8M19 20c-.4-2-1.4-3.4-3-4.2"
              ></path>
            </svg>
            Runners
          </button>
          <button
            class="ops-nav-item"
            [class.active]="panel() === 'verifications'"
            (click)="select('verifications')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4"></path>
              <path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12S7.03 3 12 3s9 4.03 9 9"></path>
            </svg>
            Verifications
          </button>
          <button
            class="ops-nav-item"
            [class.active]="panel() === 'disputes'"
            (click)="select('disputes')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3 2.5 20h19Z"></path>
              <path d="M12 9.5v4.5M12 17.6v.1"></path>
            </svg>
            Disputes
            @if (s.disputeCount() > 0) {
              <span class="badge-count">{{ s.disputeCount() }}</span>
            }
          </button>
        </div>

        <!-- Row 77: Refunds sits under Payments. Any admin may approve and record payouts. -->
        <div class="ops-nav-group">
          <div class="ops-nav-label">Payments</div>
          <button
            class="ops-nav-item"
            [class.active]="panel() === 'refunds'"
            (click)="select('refunds')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 3-6.7"></path>
              <path d="M3 4v4h4"></path>
              <path d="M12 7v5l3 2"></path>
            </svg>
            Refunds
            @if (s.refundBadge().count > 0) {
              <span class="badge-count">{{
                s.refundBadge().more ? '99+' : s.refundBadge().count
              }}</span>
            }
          </button>
          <!-- Row 112: the runner payout ledger (p-runner-payouts). -->
          <button
            class="ops-nav-item"
            [class.active]="panel() === 'runner-payouts'"
            (click)="select('runner-payouts')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="6" width="18" height="12" rx="2"></rect>
              <circle cx="12" cy="12" r="2.5"></circle>
              <path d="M6 9.5v5M18 9.5v5"></path>
            </svg>
            Runner payouts
            @if (s.runnerPayoutBadge().count > 0) {
              <span class="badge-count">{{
                s.runnerPayoutBadge().more ? '99+' : s.runnerPayoutBadge().count
              }}</span>
            }
          </button>
        </div>

        <div class="ops-nav-group">
          <div class="ops-nav-label">Insights</div>
          <button
            class="ops-nav-item"
            [class.active]="panel() === 'reports'"
            (click)="select('reports')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 21h16"></path>
              <path d="M6 21v-6M11 21V8M16 21v-9"></path>
            </svg>
            Reports
          </button>
        </div>

        <button class="ops-sidebar-foot" (click)="logout()" title="Sign out">
          <div class="av">{{ initials() }}</div>
          <div>
            <div class="name">{{ who() }}</div>
            <div class="role">Admin · Nairobi ops</div>
          </div>
          <span class="logout-hint">Log out</span>
        </button>
      </aside>

      <main class="ops-main">
        @if (s.loading() && empty()) {
          <div class="ops-loading">Loading live ops…</div>
        } @else if (s.error() && empty()) {
          <div class="ops-empty">
            <b>Could not reach the ops API</b>
            {{ s.error() }}
          </div>
        } @else {
          @switch (panel()) {
            @case ('map') {
              <app-live-map-panel
                (openErrand)="openTask($event)"
                (openRunner)="openRunner($event)"
              />
            }
            @case ('queue') {
              <app-task-queue-panel (open)="openTask($event)" />
            }
            @case ('runners') {
              <app-runners-panel (open)="openRunner($event)" />
            }
            @case ('verifications') {
              <!-- Lazy chunk: keeps the initial bundle within budget. -->
              @defer (on immediate) {
                <app-verifications-panel />
              } @loading {
                <div class="ops-loading">Loading runner verification…</div>
              }
            }
            @case ('disputes') {
              <app-disputes-panel (open)="openDispute($event)" />
            }
            @case ('refunds') {
              <app-refunds-panel />
            }
            @case ('runner-payouts') {
              <!-- Lazy chunk: keeps the initial bundle within budget. -->
              @defer (on immediate) {
                <app-runner-payouts-panel />
              } @loading {
                <div class="ops-loading">Loading runner payouts…</div>
              }
            }
            @case ('reports') {
              <app-reports-panel />
            }
          }
          @if (s.error()) {
            <app-inline-notice class="ops-sync-notice" tone="danger">{{
              s.error()
            }}</app-inline-notice>
          }
        }
      </main>
    </div>

    <app-ops-drawer
      [open]="nav.current() !== null"
      [title]="drawerTitle()"
      (closed)="nav.requestClose()"
    >
      <!-- Re-mount per target so each drawer fetches its own data on open. -->
      @for (t of targets(); track t.kind + ':' + t.id) {
        @switch (t.kind) {
          @case ('task') {
            <app-task-drawer [errandId]="t.id" />
          }
          @case ('runner') {
            <!-- Lazy chunk: keeps the initial bundle within budget (#36). -->
            @defer (on immediate) {
              <app-runner-drawer [runnerId]="t.id" />
            } @loading {
              <div class="ops-loading">Loading runner profile…</div>
            }
          }
          @case ('dispute') {
            <app-dispute-drawer [errandId]="t.id" />
          }
          @case ('refund') {
            <app-refund-drawer [reviewId]="t.id" />
          }
          @case ('runner_payout') {
            @defer (on immediate) {
              <app-runner-payout-drawer [lineId]="t.id" />
            } @loading {
              <div class="ops-loading">Loading runner payout…</div>
            }
          }
          @case ('runner_verification') {
            @defer (on immediate) {
              <app-runner-verification-drawer [runnerProfileId]="t.id" />
            } @loading {
              <div class="ops-loading">Loading documents…</div>
            }
          }
          @case ('customer') {
            @defer (on immediate) {
              <app-customer-drawer [userId]="t.id" />
            }
          }
        }
      }
    </app-ops-drawer>
  `,
  styles: [],
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  protected readonly s = inject(AdminDataService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  /** The admin socket (#36), once its lazy chunk has loaded. */
  private live: { disconnect(): void } | null = null;
  private destroyed = false;

  protected readonly nav = inject(DrawerNavService);

  readonly panel = signal<Panel>('map');
  protected readonly targets = computed(() => {
    const t = this.nav.current();
    return t ? [t] : [];
  });

  constructor() {
    // `View payouts` on a runner's profile: show their lines (p-runner-payouts Entry).
    effect(() => {
      if (!this.nav.runnerPayoutsFor()) return;
      untracked(() => this.select('runner-payouts'));
    });
  }

  ngOnInit(): void {
    void this.s.refresh();
    void this.startLive();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.live?.disconnect();
  }

  /**
   * Live presence events (#36). The realtime service and socket.io-client
   * load as a lazy chunk, so the initial bundle stays within budget.
   */
  private async startLive(): Promise<void> {
    const { AdminRealtimeService } = await import('../../core/realtime/admin-realtime.service');
    if (this.destroyed) return;
    const rt = this.injector.get(AdminRealtimeService);
    this.live = rt;
    void rt.connect();
  }

  /** Changing panel closes any open drawer (unless it has unsaved input). */
  protected select(p: Panel): void {
    if (this.nav.current()) {
      this.nav.requestClose(() => this.panel.set(p));
      return;
    }
    this.panel.set(p);
  }

  protected openTask(id: string): void {
    this.nav.open('task', id);
  }

  protected openRunner(id: string): void {
    this.nav.open('runner', id);
  }

  protected openDispute(id: string): void {
    this.nav.open('dispute', id);
  }

  protected drawerTitle(): string {
    const t = this.nav.current();
    switch (t?.kind) {
      case 'task':
        return 'Task detail';
      case 'runner':
        return 'Runner profile';
      case 'dispute':
        return `Dispute ${shortId(t.id)}`;
      case 'refund':
        return 'Refund review';
      case 'runner_payout':
        return 'Runner payout';
      case 'runner_verification':
        return 'Verification documents';
      case 'customer':
        return 'Customer';
      default:
        return '';
    }
  }

  protected empty(): boolean {
    return this.s.errands().length === 0 && this.s.runners().length === 0;
  }

  protected who(): string {
    const me = this.s.me();
    if (!me) return 'Admin';
    return me.firstName?.trim() || me.phone || 'Admin';
  }

  protected initials(): string {
    const me = this.s.me();
    if (me?.firstName && me.firstName.trim().length > 0) {
      return me.firstName
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }
    return (
      maskedId(me?.id ?? 'admin')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-2)
        .toUpperCase() || 'A'
    );
  }

  protected logout(): void {
    this.live?.disconnect();
    this.auth.logout();
  }
}
