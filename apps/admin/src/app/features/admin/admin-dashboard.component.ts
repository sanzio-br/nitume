import { Component, inject, signal, OnInit } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AdminDataService, maskedId } from './admin-data.service';
import { LiveMapPanelComponent } from './panels/live-map.panel';
import { TaskQueuePanelComponent } from './panels/task-queue.panel';
import { RunnersPanelComponent } from './panels/runners.panel';
import { VerificationsPanelComponent } from './panels/verifications.panel';
import { DisputesPanelComponent } from './panels/disputes.panel';
import { ReportsPanelComponent } from './panels/reports.panel';
import { TaskDrawerComponent } from './drawers/task-drawer';
import { RunnerDrawerComponent } from './drawers/runner-drawer';
import { DisputeDrawerComponent } from './drawers/dispute-drawer';
import { OpsDrawerComponent } from '../../shared/ops-drawer.component';

type Panel = 'map' | 'queue' | 'runners' | 'verifications' | 'disputes' | 'reports';
type DrawerKind = 'task' | 'runner' | 'dispute';

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
    OpsDrawerComponent,
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
              <app-verifications-panel />
            }
            @case ('disputes') {
              <app-disputes-panel (open)="openDispute($event)" />
            }
            @case ('reports') {
              <app-reports-panel />
            }
          }
          @if (s.error()) {
            <div class="ops-banner">Sync error — {{ s.error() }}</div>
          }
        }
      </main>
    </div>

    <app-ops-drawer [open]="drawer() !== null" [title]="drawerTitle()" (closed)="closeDrawer()">
      @switch (drawer()) {
        @case ('task') {
          <app-task-drawer [errandId]="selId()!" />
        }
        @case ('runner') {
          <app-runner-drawer [runnerId]="selId()!" />
        }
        @case ('dispute') {
          <app-dispute-drawer [errandId]="selId()!" />
        }
      }
    </app-ops-drawer>
  `,
  styles: [],
})
export class AdminDashboardComponent implements OnInit {
  protected readonly s = inject(AdminDataService);
  private readonly auth = inject(AuthService);

  readonly panel = signal<Panel>('map');
  readonly drawer = signal<DrawerKind | null>(null);
  readonly selId = signal<string | null>(null);

  ngOnInit(): void {
    void this.s.refresh();
  }

  protected select(p: Panel): void {
    this.panel.set(p);
  }

  protected openTask(id: string): void {
    this.selId.set(id);
    this.drawer.set('task');
  }

  protected openRunner(id: string): void {
    this.selId.set(id);
    this.drawer.set('runner');
  }

  protected openDispute(id: string): void {
    this.selId.set(id);
    this.drawer.set('dispute');
  }

  protected closeDrawer(): void {
    this.drawer.set(null);
  }

  protected drawerTitle(): string {
    switch (this.drawer()) {
      case 'task':
        return 'Task detail';
      case 'runner':
        return 'Runner profile';
      case 'dispute':
        return 'Resolve dispute';
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
    this.auth.logout();
  }
}
