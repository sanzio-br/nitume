import { Component, inject, output } from '@angular/core';
import { AdminDataService, categoryLabel, maskedId, shortId, timeAgo } from '../admin-data.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';

/**
 * Disputes panel (design mockup `#p-disputes`): every errand currently in the
 * DISPUTED state, derived from `GET /errands`. Cards open the dispute drawer
 * where an admin issues a verdict via `PATCH /errands/:id/resolve-dispute`.
 */
@Component({
  selector: 'app-disputes-panel',
  imports: [StatusChipComponent],
  template: `
    <div class="ops-topbar">
      <div>
        <h1>Disputes</h1>
        <div class="sub">{{ sub() }}</div>
      </div>
      <div class="ops-top-actions">
        <button class="btn-city" (click)="s.refreshErrands()">↻ Refresh</button>
      </div>
    </div>

    <div class="dispute-grid">
      @for (d of s.disputes(); track d.id) {
        <div class="dispute-card">
          <header class="dc-head">
            <div>
              <b>{{ categoryLabel(d.category) }}</b>
              <div class="dc-sub">opened {{ timeAgo(d.createdAt) }} · {{ shortId(d.id) }}</div>
            </div>
            <app-status-chip [status]="d.status" />
          </header>
          <p class="dc-desc">{{ d.description }}</p>
          <div class="dc-evidence">
            <span class="chip chip-neutral">Timeline</span>
            <span class="chip chip-neutral">Parties</span>
            <span class="chip chip-neutral">Photos</span>
          </div>
          <div class="dc-foot">
            <button class="btn-outline" (click)="open.emit(d.id)">Review evidence</button>
            <span class="dc-id">{{ shortId(d.id) }}</span>
          </div>
        </div>
      } @empty {
        <div class="ops-empty">
          <b>No open disputes</b>Disputed errands will land here for admin resolution.
        </div>
      }
    </div>
  `,
  styles: [],
})
export class DisputesPanelComponent {
  protected readonly s = inject(AdminDataService);

  readonly open = output<string>();

  protected sub(): string {
    const open = this.s.disputes().length;
    return open === 0
      ? 'No errands currently flagged'
      : `${open} errand${open === 1 ? '' : 's'} flagged for review`;
  }

  protected readonly categoryLabel = categoryLabel;
  protected readonly maskedId = maskedId;
  protected readonly timeAgo = timeAgo;
  protected readonly shortId = shortId;
}
