import { Component, inject } from '@angular/core';
import { AdminDataService } from '../admin-data.service';
import { formatKsh } from '../shared-format';

/**
 * Insights panel (design mockup `#p-reports`): charts built ONLY from
 * aggregates the dashboard store derives over the rows `GET /errands` /
 * `GET /runners` actually returned. Money figures stay undisclosed — the
 * revenue-flow structure renders with placeholders until a finance/payments
 * aggregate endpoint exists (§8/§9) rather than inventing KSh numbers.
 */
@Component({
  selector: 'app-reports-panel',
  imports: [],
  template: `
    <div class="ops-topbar">
      <div>
        <h1>Reports</h1>
        <div class="sub">Last 7 days · Nairobi · derived from live errand + runner rows</div>
      </div>
      <div class="ops-top-actions">
        <button class="btn-city" (click)="s.refresh()">↻ Refresh</button>
      </div>
    </div>

    <div class="report-grid">
      <section class="report-card">
        <h3>Errands per day</h3>
        <div class="bar-chart">
          @for (bar of s.dailyBars(); track bar.label) {
            <div class="bar-col">
              <div class="bar-wrap">
                <div class="bar" [style.height.%]="barHeight(bar.count)"></div>
              </div>
              <span class="bar-label">{{ bar.label }}</span>
            </div>
          } @empty {
            <span class="report-empty">No errand rows to chart yet</span>
          }
        </div>
        <div class="report-foot">Errands created each day (all statuses, incl. drafts)</div>
      </section>

      <section class="report-card">
        <h3>Completed</h3>
        <div class="donut-wrap">
          @if (s.completionShare(); as cs) {
            <div class="donut" [style.background]="donut(cs.pct)"></div>
            <div class="donut-center">
              <b>{{ cs.pct }}%</b><span>completed</span>
            </div>
          } @else {
            <div class="donut" [style.background]="donut(null)"></div>
            <div class="donut-center"><b>—</b><span>no data</span></div>
          }
        </div>
        <div class="report-foot">
          {{
            s.completionShare()
              ? s.completionShare()!.done + ' of ' + s.completionShare()!.total + ' listed'
              : 'Waiting for errand rows'
          }}
        </div>
      </section>

      <section class="report-card">
        <h3>By category</h3>
        <div class="list-stats">
          @for (cat of s.categories(); track cat.label) {
            <div class="stat-row">
              <span class="stat-name">{{ cat.label }}</span>
              <span class="stat-bar-line">
                <span class="stat-fill" [style.width.%]="cat.pct"></span>
              </span>
              <span class="stat-pct">{{ cat.pct }}%</span>
              <span class="stat-count">{{ cat.count }}</span>
            </div>
          } @empty {
            <span class="report-empty">No categories yet</span>
          }
        </div>
      </section>

      <section class="report-card">
        <h3>Runner growth</h3>
        <div class="bar-chart">
          @for (bar of s.weeklyGrowth(); track bar.label) {
            <div class="bar-col">
              <div class="bar-wrap">
                <div class="bar" [style.height.%]="barHeight(bar.count)"></div>
              </div>
              <span class="bar-label">{{ bar.label }}</span>
            </div>
          } @empty {
            <span class="report-empty">No runner rows yet</span>
          }
        </div>
        <div class="report-foot">New verified runner profiles per week</div>
      </section>

      <section class="report-card">
        <h3>Repeat usage</h3>
        <div class="donut-wrap">
          @if (s.repeatUsage(); as rp) {
            <div class="donut" [style.background]="donut(rp.pct)"></div>
            <div class="donut-center">
              <b>{{ rp.pct }}%</b><span>repeat customers</span>
            </div>
          } @else {
            <div class="donut" [style.background]="donut(null)"></div>
            <div class="donut-center"><b>—</b><span>no data</span></div>
          }
        </div>
        <div class="report-foot">Customers with 2+ tasks this fetch, share of unique customers</div>
      </section>

      <section class="report-card">
        <h3>Revenue breakdown</h3>
        <div class="revenue-structure">
          <div class="rev-row">
            <div class="rev-flow">
              <span class="rev-src">Customer</span>
              <span class="rev-arrow">→</span>
              <span class="rev-src">Nitume</span>
            </div>
            <b class="rev-amount">——</b>
          </div>
          <div class="rev-row">
            <div class="rev-flow">
              <span class="rev-src">Booking</span>
              <span class="rev-arrow">→</span>
              <span class="rev-src">Nitume</span>
            </div>
            <b class="rev-amount">——</b>
          </div>
          <div class="rev-row">
            <div class="rev-flow">
              <span class="rev-src">Business</span>
              <span class="rev-arrow">→</span>
              <span class="rev-src">Nitume</span>
            </div>
            <b class="rev-amount">——</b>
          </div>
        </div>
        <div class="report-foot">
          Awaiting payments reconciliation — figures appear when the finance aggregate endpoint
          ships.
        </div>
      </section>
    </div>
  `,
  styles: [],
})
export class ReportsPanelComponent {
  protected readonly s = inject(AdminDataService);

  protected barHeight(count: number): number {
    if (count <= 0) return 2;
    const max = Math.max(
      ...this.s.dailyBars().map((b) => b.count),
      ...this.s.weeklyGrowth().map((b) => b.count),
      1,
    );
    return Math.max(6, (count / max) * 100);
  }

  protected donut(pct: number | null): string {
    if (pct === null) {
      return 'conic-gradient(var(--nitume-line) 0deg 360deg)';
    }
    const deg = Math.min(360, pct * 3.6);
    return `conic-gradient(var(--nitume-green) 0deg ${deg}deg, var(--nitume-line) ${deg}deg 360deg)`;
  }
}
