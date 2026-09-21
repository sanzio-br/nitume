import { Component, inject, output, signal } from '@angular/core';
import { AdminDataService, categoryLabel, shortId } from '../admin-data.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { formatKsh } from '../shared-format';

/**
 * Task queue panel (design mockup `#p-queue`): the admin's triage table of
 * every errand past the drafting stage, filterable by text + category.
 * Rows open the task drawer. `GET /errands` returns the admin view of all
 * errands (cursor-capped at 100 in the fetch window).
 */
@Component({
  selector: 'app-task-queue-panel',
  imports: [StatusChipComponent],
  template: `
    <div class="ops-topbar">
      <div>
        <h1>Task queue</h1>
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
            placeholder="Filter by task or category…"
            [value]="search()"
            (input)="setSearch($event)"
            aria-label="Search tasks"
          />
        </label>
        <select
          class="btn-city"
          [value]="category()"
          (change)="setCategory($event)"
          aria-label="Filter by category"
        >
          @for (cat of categories; track cat) {
            <option [value]="cat">
              {{ cat === 'all' ? 'All categories' : categoryLabel(cat) }}
            </option>
          }
        </select>
        <button class="btn-city" (click)="s.refreshErrands()">↻ Refresh</button>
      </div>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Category</th>
            <th>Status</th>
            <th>Value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (task of visible(); track task.id) {
            <tr class="clickable" (click)="open.emit(task.id)">
              <td>
                <div class="task-cat">{{ task.description }}</div>
                <div class="task-id">{{ shortId(task.id) }}</div>
              </td>
              <td>{{ categoryLabel(task.category) }}</td>
              <td><app-status-chip [status]="task.status" /></td>
              <td class="num">{{ value(task) }}</td>
              <td>
                <button class="row-assign" (click)="stop($event); open.emit(task.id)">
                  {{ task.status === 'REQUESTED' || task.status === 'QUOTED' ? 'Assign' : 'View' }}
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5">
                <div class="ops-empty">
                  <b>No tasks match</b>Try a different filter, or check back after new errands land.
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [],
})
export class TaskQueuePanelComponent {
  protected readonly s = inject(AdminDataService);

  readonly open = output<string>();

  readonly search = signal('');
  readonly category = signal('all');

  protected readonly categories = [
    'all',
    'buy_for_me',
    'pickup_delivery',
    'inspection',
    'representation',
    'queue_admin',
    'business',
  ];

  protected sub(): string {
    const total = this.s.tasks().length;
    const pending = this.s.pendingCount();
    return pending > 0
      ? `${pending} pending · ${total} listed across Nairobi`
      : `${total} task${total === 1 ? '' : 's'} listed · no pending`;
  }

  protected visible() {
    const q = this.search().trim().toLowerCase();
    const cat = this.category();
    return this.s.tasks().filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!q) return true;
      return (
        t.description.toLowerCase().includes(q) ||
        categoryLabel(t.category).toLowerCase().includes(q) ||
        shortId(t.id).toLowerCase().includes(q)
      );
    });
  }

  protected value(t: { quotedPrice?: string | null; budget: string }): string {
    return formatKsh(t.quotedPrice ?? t.budget);
  }

  protected stop(event: Event): void {
    event.stopPropagation();
  }

  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected setCategory(event: Event): void {
    this.category.set((event.target as HTMLSelectElement).value);
  }

  protected readonly categoryLabel = categoryLabel;
  protected readonly shortId = shortId;
}
