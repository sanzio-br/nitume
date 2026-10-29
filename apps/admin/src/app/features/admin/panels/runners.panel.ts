import { Component, inject, output, signal } from '@angular/core';
import { AdminDataService, shortId, timeAgo } from '../admin-data.service';
import { StatusChipComponent, statusLabel } from '../../../shared/status-chip.component';
import { isActive, isFlagged, isWeb } from '../runner-presence';

/**
 * Runner network panel (design mockup `#p-runners`): a live directory grid of
 * runner profiles from `GET /runners` — level, trust score, load + availability.
 * Cards open the runner drawer. (The design's document-verification review
 * inbox is gated on `GET /runners/verifications`/`GET /runners/:id` which the
 * current API surface does not expose as admin aggregates; a note flags that.)
 */
@Component({
  selector: 'app-runners-panel',
  imports: [StatusChipComponent],
  template: `
    <div class="ops-topbar">
      <div>
        <h1>Runner network</h1>
        <div class="sub">{{ sub() }}</div>
      </div>
      <div class="ops-top-actions">
        <label class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m20 20-3.5-3.5"></path>
          </svg>
          <input
            type="search"
            placeholder="Search runners…"
            [value]="search()"
            (input)="setSearch($event)"
            aria-label="Search runners"
          />
        </label>
        <button class="btn-city" (click)="s.refresh()">↻ Refresh</button>
      </div>
    </div>

    <p class="kpi-note">
      Live directory from the runners feed · document-level verification review lands once the
      verification-inbox endpoint ships — this grid shows current profile trust + load data.
    </p>

    <div class="verif-grid">
      @for (runner of visible(); track runner.id) {
        <div class="verif-card">
          <div class="runner-avatar">{{ initials(runner.id) }}</div>
          <div class="vc-body">
            <div class="r-top">
              <b>{{ shortId(runner.id) }}</b>
              <app-status-chip [status]="runner.availability" kind="availability" />
            </div>
            <div class="r-sub">Nairobi · joined {{ timeAgo(runner.createdAt) }}</div>
            <div class="r-stats">
              <div class="stat">
                <b>{{ num(runner.avgRating) }}</b
                ><span>Rating</span>
              </div>
              <div class="stat">
                <b>{{ runner.errandsCompleted ?? 0 }}</b
                ><span>Tasks</span>
              </div>
              <div class="stat">
                <b>{{ pct(runner.trustScore) }}</b
                ><span>Trust</span>
              </div>
              <div class="stat">
                <b>{{ pct(runner.completionRate) }}</b
                ><span>Completion</span>
              </div>
            </div>
            <div class="r-tags">
              <!-- #36: web runner marker and flag, A-02 fixed chips. -->
              @if (isWeb(runner) && isActive(runner)) {
                <app-status-chip label="Web" tone="neutral" />
              }
              @if (isFlagged(runner)) {
                <app-status-chip label="Pings stopped" tone="pending" />
              }
              <app-status-chip [status]="runner.verificationLevel" kind="level" />
              <span class="chip chip-neutral">{{ runner.skillsCount ?? 0 }} skills</span>
            </div>
            <button class="vc-action" (click)="open.emit(runner.id)">Open profile</button>
          </div>
        </div>
      } @empty {
        <div class="ops-empty">
          <b>No runners match</b>Clear the search, or wait for the runners feed.
        </div>
      }
    </div>
  `,
  styles: [],
})
export class RunnersPanelComponent {
  protected readonly s = inject(AdminDataService);

  readonly open = output<string>();

  readonly search = signal('');

  protected sub(): string {
    const all = this.s.runners().length;
    const t = this.s.topStats();
    // #36: ` · {n} pings stopped` only when n > 0 (never pluralised by code).
    const flagged = this.s.runners().filter(isFlagged).length;
    return all === 0
      ? 'No runner profiles synced yet'
      : `${all} runners · ${t.onlineRunners} online · ${t.onTaskRunners} on task` +
          (flagged ? ` · ${flagged} pings stopped` : '');
  }

  protected visible() {
    const q = this.search().trim().toLowerCase();
    return this.s.runners().filter((r) => {
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        shortId(r.id).toLowerCase().includes(q) ||
        (r.verificationLevel ?? '').toLowerCase().includes(q) ||
        statusLabel(r.availability, 'availability').toLowerCase().includes(q) ||
        // #36: `web` and `pings stopped` match the chips on the card.
        `${isWeb(r) && isActive(r) ? 'web ' : ''}${isFlagged(r) ? 'pings stopped' : ''}`.includes(q)
      );
    });
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

  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected readonly shortId = shortId;
  protected readonly timeAgo = timeAgo;
  protected readonly isWeb = isWeb;
  protected readonly isActive = isActive;
  protected readonly isFlagged = isFlagged;
}
