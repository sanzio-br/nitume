import { Component, inject, input } from '@angular/core';
import { DrawerNavService } from '../drawer-nav.service';
import { AdminDataService, shortId, timeAgo } from '../admin-data.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { formatDateTime, formatKsh } from '../shared-format';
import { isFlagged, lastPing } from '../runner-presence';
import { UserStatusSectionComponent } from './user-status.section';

/**
 * Runner drawer: full profile row for a runner from the directory feed.
 * Trust/load figures arrive as decimal strings and render verbatim.
 */
@Component({
  selector: 'app-runner-drawer',
  imports: [StatusChipComponent, UserStatusSectionComponent],
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
            <span>Availability</span
            ><app-status-chip [status]="r.availability" kind="availability" />
          </div>
          <!-- #36: web runner presence (spec §3.2). -->
          <div class="drawer-row">
            <span>Client</span>
            @switch (r.presence?.client) {
              @case ('web') {
                <app-status-chip label="Web" tone="neutral" />
              }
              @case ('app') {
                <app-status-chip label="App" tone="neutral" />
              }
              @default {
                <b>—</b>
              }
            }
          </div>
          @if (isFlagged(r)) {
            <div class="drawer-row">
              <span>Location pings</span><app-status-chip label="Pings stopped" tone="pending" />
            </div>
            <div class="drawer-row">
              <span>Flagged</span><b>{{ formatDateTime(r.presence?.webPingsStoppedAt) }}</b>
            </div>
          }
          <div class="drawer-row">
            <span>Last ping</span><b>{{ formatDateTime(lastPing(r)) }}</b>
          </div>
          <div class="drawer-row">
            <span>Level</span><app-status-chip [status]="r.verificationLevel" kind="level" />
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
            <span>Joined</span><b>{{ timeAgo(r.createdAt) }}</b>
          </div>
        </div>
      </section>
      <!-- p-runner-payouts Entry: this runner's payout lines. -->
      <section class="drawer-section">
        <div class="drawer-actions">
          <button type="button" class="btn btn-outline" (click)="viewPayouts(r.id)">
            View payouts
          </button>
        </div>
      </section>
      <!-- drawer-user-status: account status, actions and history, always last. -->
      @defer (on immediate) {
        <app-user-status-section [userId]="r.userId" audience="runner" />
      }
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

  private readonly nav = inject(DrawerNavService);

  readonly runnerId = input.required<string>();

  /** Opens Runner payouts filtered to this runner (the shell switches panel). */
  protected viewPayouts(id: string): void {
    this.nav.runnerPayoutsFor.set(id);
  }

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

  /** Row 82: money is always `KSh`, through the shared formatter. */
  protected advance(value: string | undefined): string {
    return formatKsh(value);
  }

  protected readonly shortId = shortId;
  protected readonly timeAgo = timeAgo;
  protected readonly formatDateTime = formatDateTime;
  protected readonly isFlagged = isFlagged;
  protected readonly lastPing = lastPing;
}
