import { Component, inject, input, OnInit } from '@angular/core';
import { AdminDataService, categoryLabel, maskedId, shortId, timeAgo } from '../admin-data.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { formatKsh } from '../shared-format';

/**
 * Task drawer: errand detail (`GET /errands/:id`) + status-history timeline
 * (`GET /errands/:id/history`). Re-mounted each time the drawer opens, so it
 * fetches on init.
 */
@Component({
  selector: 'app-task-drawer',
  imports: [StatusChipComponent],
  template: `
    @if (loading()) {
      <div class="ops-loading">Loading task detail…</div>
    } @else if (error()) {
      <div class="ops-empty"><b>Could not load this task</b>{{ error() }}</div>
    } @else if (s.detail(); as d) {
      <section class="drawer-section">
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Task</span><b>{{ shortId(d.id) }}</b>
          </div>
          <div class="drawer-row"><span>Status</span><app-status-chip [status]="d.status" /></div>
          <div class="drawer-row">
            <span>Category</span><b>{{ categoryLabel(d.category) }}</b>
          </div>
          <div class="drawer-row">
            <span>Customer</span><b>{{ maskedId(d.customerId) }}</b>
          </div>
          <div class="drawer-row">
            <span>Budget</span><b>{{ formatKsh(d.budget) }}</b>
          </div>
          <div class="drawer-row">
            <span>Quoted</span><b>{{ formatKsh(d.quotedPrice ?? null) }}</b>
          </div>
          <div class="drawer-row">
            <span>Urgency</span><b>{{ d.urgency ?? 'standard' }}</b>
          </div>
          <div class="drawer-row">
            <span>Deadline</span><b>{{ d.deadlineAt ? timeAgo(d.deadlineAt) : '—' }}</b>
          </div>
          <div class="drawer-row">
            <span>Created</span><b>{{ timeAgo(d.createdAt) }}</b>
          </div>
        </div>
      </section>

      @if (d.items?.length) {
        <section class="drawer-section">
          <div class="drawer-label">Items</div>
          <div class="drawer-card">
            @for (item of d.items; track $index) {
              <div class="drawer-row">
                <span>{{ item.name }}</span>
                <b>{{
                  item.quantity ? item.quantity + ' × ' + (item.unit ?? '') : (item.unit ?? '')
                }}</b>
              </div>
            }
          </div>
        </section>
      }

      @if (d.locations?.length) {
        <section class="drawer-section">
          <div class="drawer-label">Locations</div>
          <div class="drawer-card">
            @for (loc of d.locations; track $index) {
              <div class="drawer-row">
                <span>{{ title(loc.pointType) }}</span>
                <b>{{ loc.addressText }}</b>
              </div>
            }
          </div>
        </section>
      }

      <section class="drawer-section">
        <div class="drawer-label">Status history</div>
        <div class="drawer-timeline">
          @for (entry of s.history(); track entry.id) {
            <div class="dt-item">
              <b
                >{{ entry.fromStatus ? blank(entry.fromStatus) + ' → ' : ''
                }}{{ blank(entry.toStatus) }}</b
              >
              <span class="dt-time"
                >{{ title(entry.actorType) }} · {{ timeAgo(entry.createdAt) }}</span
              >
              @if (entry.note) {
                <span class="dt-time">“{{ entry.note }}”</span>
              }
            </div>
          } @empty {
            <div class="dt-item"><b>No status transitions recorded</b></div>
          }
        </div>
      </section>
    }
  `,
  styles: [],
})
export class TaskDrawerComponent implements OnInit {
  protected readonly s = inject(AdminDataService);

  readonly errandId = input.required<string>();

  ngOnInit(): void {
    this.s.loadErrandDetail(this.errandId());
  }

  protected loading(): boolean {
    return this.s.detailLoading();
  }

  protected error(): string | null {
    return this.s.detailError();
  }

  protected title(value: string): string {
    return value.replace(/_/g, ' ');
  }

  protected blank(value: string): string {
    return value.replace(/_/g, ' ');
  }

  protected readonly categoryLabel = categoryLabel;
  protected readonly maskedId = maskedId;
  protected readonly timeAgo = timeAgo;
  protected readonly shortId = shortId;
  protected readonly formatKsh = formatKsh;
}
