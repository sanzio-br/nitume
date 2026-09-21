import { Component, inject, output, signal } from '@angular/core';
import { AdminDataService } from '../admin-data.service';
import { KpiCardComponent } from '../../../shared/kpi-card.component';
import { PanelTopbarComponent } from './panel-topbar.component';

/**
 * Live-ops panel (design mockup `#p-map`): KPI row, city map surface with
 * runner availability dots + live-feed rail. Runner dots carry real
 * availability from `GET /runners`; their screen positions are deterministic
 * placeholders until the Socket.IO location layer (§4.2) starts streaming
 * GPS fixes — flagged in the UI rather than presented as live positions.
 */
@Component({
  selector: 'app-live-map-panel',
  imports: [KpiCardComponent, PanelTopbarComponent],
  template: `
    <app-panel-topbar
      title="Live operations"
      [sub]="sub()"
      (searchChange)="onSearch($event)"
      searchPlaceholder="Search task or runner…"
    >
      <div topbar-actions>
        <button class="btn-city" (click)="s.refresh()">↻ Refresh</button>
      </div>
    </app-panel-topbar>

    <div class="kpi-row">
      <app-kpi-card
        label="Today's errands"
        [value]="s.topStats().todayErrands.toString()"
        [delta]="yesterdayDelta()"
      />
      <app-kpi-card
        label="Active runners"
        [value]="s.topStats().activeRunners.toString()"
        [delta]="runnersDelta()"
      />
      <app-kpi-card
        label="Pending tasks"
        [value]="s.topStats().pendingTasks.toString()"
        [delta]="pendingDelta()"
      />
      <app-kpi-card
        label="Completed"
        [value]="s.topStats().completed.toString()"
        [delta]="completionDelta()"
      />
      <app-kpi-card
        label="Disputes"
        [value]="s.topStats().disputes.toString()"
        [delta]="disputesDelta()"
        [down]="s.topStats().staleDisputes > 0"
      />
    </div>
    <p class="kpi-note">
      KPIs computed from the latest 100 errands / 100 runner profiles fetched from the ops API ·
      sample window
    </p>

    <div class="map-layout">
      <div class="map-panel">
        <div class="map-canvas">
          <div class="map-topstat">
            <div>
              <b class="num">{{ s.topStats().onlineRunners }}</b
              ><span>RUNNERS</span>
            </div>
            <div>
              <b class="num">{{ s.topStats().activeTasks }}</b
              ><span>ACTIVE TASKS</span>
            </div>
            <div>
              <b class="num">{{ s.topStats().flagged }}</b
              ><span>FLAGGED</span>
            </div>
          </div>
          <div class="map-livemode"><span class="live-dot"></span>Live ops feed</div>

          <div class="map-zone" style="left:14%;top:22%;width:180px;height:150px;">CBD</div>
          <div class="map-zone" style="left:52%;top:38%;width:150px;height:130px;">Kilimani</div>
          <div class="map-zone" style="right:12%;top:14%;width:170px;height:140px;">Westlands</div>
          <div class="map-route" style="left:22%;top:34%;width:120px;transform:rotate(16deg)"></div>
          <div class="map-route" style="left:56%;top:50%;width:90px;transform:rotate(-22deg)"></div>

          @for (pt of s.mapPoints(); track pt.runnerId) {
            <button
              class="runner-pt"
              [class]="ptClass(pt.availability)"
              [style.left.px]="pt.x"
              [style.top.px]="pt.y"
              [attr.aria-label]="'Runner dot'"
              (click)="openRunner.emit(pt.runnerId)"
            ></button>
          } @empty {
            <div
              class="ops-empty"
              style="position:absolute;inset:0;border:none;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;"
            >
              <b>No runners on the map yet</b>
              Runner GPS pings appear here once the Live Location layer (§4.2) is streaming.
            </div>
          }

          <div class="map-legend">
            <div class="legend-item">
              <span class="legend-dot" style="background:var(--nitume-green)"></span>Idle
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background:var(--nitume-amber)"></span>On task
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background:var(--nitume-slate-400)"></span>Offline
            </div>
          </div>
        </div>
      </div>

      <aside class="side-panel">
        <h3>Live feed</h3>
        @for (item of visibleFeed(); track item.errandId ?? $index) {
          <div class="live-row" (click)="rowClick(item)">
            <span class="live-dot" [style.background]="toneColor(item.tone)"></span>
            <div>
              <div class="t">{{ item.title }}</div>
              <div class="s">{{ item.sub }}</div>
            </div>
          </div>
        } @empty {
          <div class="ops-empty" style="border:none;">
            <b>No activity yet</b>
            Recent task events will stream into this feed.
          </div>
        }
      </aside>
    </div>
  `,
  styles: [],
})
export class LiveMapPanelComponent {
  protected readonly s = inject(AdminDataService);

  readonly openErrand = output<string>();
  readonly openRunner = output<string>();

  protected readonly search = signal('');

  protected sub(): string {
    const at = new Date(this.s.refreshedAt()).toLocaleTimeString('en-KE', {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Nairobi · synced ${at}`;
  }

  protected onSearch(value: string): void {
    this.search.set(value);
  }

  protected visibleFeed() {
    const q = this.search().trim().toLowerCase();
    const feed = this.s.feed();
    if (!q) return feed;
    return feed.filter((f) => f.title.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q));
  }

  protected yesterdayDelta(): string {
    const t = this.s.topStats();
    const day = 24 * 3600 * 1000;
    const before = new Date(Date.now() - day).getTime();
    const yesterday = this.s.tasks().filter((e) => {
      const created = new Date(e.createdAt).getTime();
      return created < Date.now() && created >= before;
    }).length;
    return `${yesterday} yesterday`;
  }

  protected runnersDelta(): string {
    const t = this.s.topStats();
    return `${t.idleRunners} idle · ${t.onTaskRunners} on task`;
  }

  protected pendingDelta(): string {
    return `${this.s.topStats().awaitingQuote} awaiting quote`;
  }

  protected completionDelta(): string {
    const pct = this.s.topStats().completionPct;
    return pct === null ? 'no sample data' : `${pct}% of listed`;
  }

  protected disputesDelta(): string {
    return `${this.s.topStats().staleDisputes} unresolved >24h`;
  }

  protected ptClass(availability: string | undefined): string {
    return availability === 'online' ? 'idle' : availability === 'busy' ? 'busy' : 'offline';
  }

  protected toneColor(tone: 'green' | 'amber' | 'red' | 'slate'): string {
    const map: Record<string, string> = {
      green: 'var(--nitume-green)',
      amber: 'var(--nitume-amber)',
      red: 'var(--nitume-red)',
      slate: 'var(--nitume-slate-400)',
    };
    return map[tone];
  }

  protected rowClick(item: { errandId?: string; runnerId?: string }): void {
    if (item.errandId) {
      this.openErrand.emit(item.errandId);
    } else if (item.runnerId) {
      this.openRunner.emit(item.runnerId);
    }
  }
}
