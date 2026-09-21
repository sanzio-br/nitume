import { Component, inject, input } from '@angular/core';
import { AdminDataService, shortId, timeAgo } from '../admin-data.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';

/**
 * Runner drawer: full profile row for a runner from the directory feed.
 * Trust/load figures arrive as decimal strings and render verbatim.
 */
@Component({
  selector: 'app-runner-drawer',
  imports: [StatusChipComponent],
  template: `
    @if (runner(); as r) {
      <section class="drawer-section">
        <div class="drawer-card">
          <div class="runner-avatar" style="width:44px;height:44px;font-size:14px;">
            {{ initials(r.id) }}
          </div>
          <div class="drawer-row" style="margin-top:10px;">
            <span>Runner</span><b>{{ shortId(r.id) }}</b>
          </div>
          <div class="drawer-row">
            <span>Availability</span><app-status-chip [status]="r.availability" />
          </div>
          <div class="drawer-row">
            <span>Level</span><app-status-chip [status]="r.verificationLevel" />
          </div>
          <div class="drawer-row">
            <span>Rating</span><b>{{ num(r.avgRating) }}</b>
          </div>
          <div class="drawer-row">
            <span>Tasks completed</span><b>{{ r.errandsCompleted ?? 0 }}</b>
          </div>
          <div class="drawer-row">
            <span>Trust score</span><b>{{ pct(r.trustScore) }}</b>
          </div>
          <div class="drawer-row">
            <span>Completion rate</span><b>{{ pct(r.completionRate) }}</b>
          </div>
          <div class="drawer-row">
            <span>On-time rate</span><b>{{ pct(r.onTimeRate) }}</b>
          </div>
          <div class="drawer-row">
            <span>Cancellation rate</span><b>{{ pct(r.cancellationRate) }}</b>
          </div>
          <div class="drawer-row">
            <span>Max purchase advance</span><b>{{ advance(r.maxPurchaseAdvance) }}</b>
          </div>
          <div class="drawer-row">
            <span>Skills</span><b>{{ r.skillsCount ?? 0 }}</b>
          </div>
          <div class="drawer-row">
            <span>Last ping</span><b>{{ r.lastPingAt ? timeAgo(r.lastPingAt) : '—' }}</b>
          </div>
          <div class="drawer-row">
            <span>Joined</span><b>{{ timeAgo(r.createdAt) }}</b>
          </div>
        </div>
      </section>
    } @else {
      <div class="ops-empty">
        <b>Runner not found</b>This profile isn't in the current runners feed.
      </div>
    }
  `,
  styles: [],
})
export class RunnerDrawerComponent {
  protected readonly s = inject(AdminDataService);

  readonly runnerId = input.required<string>();

  protected runner() {
    return this.s.runners().find((r) => r.id === this.runnerId());
  }

  protected initials(id: string): string {
    return (
      id
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 2)
        .toUpperCase() || 'R'
    );
  }

  protected num(value: string | undefined): string {
    if (!value) return '—';
    const n = Number(value);
    return Number.isNaN(n) ? value : (Math.round(n * 10) / 10).toString();
  }

  protected pct(value: string | undefined): string {
    if (!value) return '—';
    const n = Number(value);
    return Number.isNaN(n) ? value : `${Math.round(n)}%`;
  }

  protected advance(value: string | undefined): string {
    if (!value) return '—';
    const n = Number(value);
    return Number.isNaN(n) ? value : `KSh ${Math.round(n).toLocaleString('en-KE')}`;
  }

  protected readonly shortId = shortId;
  protected readonly timeAgo = timeAgo;
}
