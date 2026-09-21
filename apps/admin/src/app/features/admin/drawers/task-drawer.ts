import { Component, inject, input, OnInit, signal } from '@angular/core';
import { AdminDataService, categoryLabel, maskedId, shortId, timeAgo } from '../admin-data.service';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { formatKsh } from '../shared-format';
import { FormsModule } from '@angular/forms';
import type { QuoteErrandDto } from '../../../core/api-types';

/**
 * Task drawer: errand detail (`GET /errands/:id`) + status-history timeline
 * (`GET /errands/:id/history`). Actions: Assign runner, Issue quote.
 * Re-mounted each time the drawer opens, so it fetches on init.
 */
@Component({
  selector: 'app-task-drawer',
  imports: [StatusChipComponent, FormsModule],
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

      <!-- Assign / Quote actions for REQUESTED / QUOTED statuses -->
      @if (d.status === 'REQUESTED' || d.status === 'QUOTED') {
        <section class="drawer-section">
          <div class="drawer-label">Admin actions</div>
          <div class="drawer-card">
            <div class="action-row">
              <button
                class="btn-primary"
                (click)="openAssign()"
                [disabled]="assigning()"
              >
                {{ assigning() ? 'Assigning…' : 'Assign runner' }}
              </button>
              <button
                class="btn-outline"
                (click)="openQuote()"
                [disabled]="quoting()"
              >
                {{ quoting() ? 'Issuing…' : 'Issue quote' }}
              </button>
            </div>
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

    <!-- Assign runner modal -->
    @if (showAssign()) {
      <div class="drawer-modal" (click)="closeAssign()">
        <div class="drawer-modal-card" (click)="$event.stopPropagation()">
          <h3>Assign runner</h3>
          <p class="modal-sub">Select a runner for {{ shortId(errandId()) }}</p>
          <label class="modal-label">Runner</label>
          <select class="modal-select" [(ngModel)]="assignRunnerId" (ngModelChange)="onRunnerSelect($event)">
            <option value="">— Choose runner —</option>
            @for (r of availableRunners(); track r.id) {
              <option [value]="r.id">
                {{ shortId(r.id) }} · {{ r.availability === 'online' ? 'Online' : r.availability }}
              </option>
            }
          </select>
          <label class="modal-label">Note (optional)</label>
          <textarea class="modal-textarea" [(ngModel)]="assignNote" rows="2" placeholder="Assignment note…"></textarea>
          <div class="modal-actions">
            <button class="btn-outline" (click)="closeAssign()">Cancel</button>
            <button class="btn-primary" (click)="confirmAssign()" [disabled]="assigning() || !assignRunnerId">
              {{ assigning() ? 'Assigning…' : 'Assign' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Issue quote modal -->
    @if (showQuote()) {
      <div class="drawer-modal" (click)="closeQuote()">
        <div class="drawer-modal-card" (click)="$event.stopPropagation()">
          <h3>Issue quote</h3>
          <p class="modal-sub">Enter quote for {{ shortId(errandId()) }}</p>
          <div class="modal-grid">
            <label class="modal-label">Total (KSh)</label>
            <input type="number" class="modal-input" [(ngModel)]="quote.total" required />
            <label class="modal-label">Base fee</label>
            <input type="number" class="modal-input" [(ngModel)]="quote.baseFee" />
            <label class="modal-label">Distance fee</label>
            <input type="number" class="modal-input" [(ngModel)]="quote.distanceFee" />
            <label class="modal-label">Time fee</label>
            <input type="number" class="modal-input" [(ngModel)]="quote.timeFee" />
            <label class="modal-label">Urgency fee</label>
            <input type="number" class="modal-input" [(ngModel)]="quote.urgencyFee" />
            <label class="modal-label">Complexity fee</label>
            <input type="number" class="modal-input" [(ngModel)]="quote.complexityFee" />
            <label class="modal-label">Premium fee</label>
            <input type="number" class="modal-input" [(ngModel)]="quote.premiumFee" />
            <label class="modal-label">Currency</label>
            <input type="text" class="modal-input" [(ngModel)]="quote.currency" value="KES" />
            <label class="modal-label">Expires at (ISO)</label>
            <input type="datetime-local" class="modal-input" [(ngModel)]="quote.expiresAt" />
          </div>
          <label class="modal-label">Note (optional)</label>
          <textarea class="modal-textarea" [(ngModel)]="quote.note" rows="2" placeholder="Quote note…"></textarea>
          <div class="modal-actions">
            <button class="btn-outline" (click)="closeQuote()">Cancel</button>
            <button class="btn-primary" (click)="confirmQuote()" [disabled]="quoting() || !quote.total">
              {{ quoting() ? 'Issuing…' : 'Issue quote' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [],
})
export class TaskDrawerComponent implements OnInit {
  protected readonly s = inject(AdminDataService);

  readonly errandId = input.required<string>();

  protected assigning = signal(false);
  protected quoting = signal(false);
  protected showAssign = signal(false);
  protected showQuote = signal(false);
  protected assignRunnerId = '';
  protected assignNote = '';
  protected quote: QuoteErrandDto = {
    total: '', baseFee: '', distanceFee: '', timeFee: '', urgencyFee: '',
    complexityFee: '', premiumFee: '', currency: 'KES', expiresAt: '', note: ''
  };

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

  protected availableRunners() {
    return this.s.runners().filter(r => r.availability === 'online' || r.availability === 'busy');
  }

  protected openAssign(): void {
    this.assignRunnerId = '';
    this.assignNote = '';
    this.showAssign.set(true);
  }

  protected closeAssign(): void {
    this.showAssign.set(false);
  }

  protected async confirmAssign(): Promise<void> {
    if (!this.assignRunnerId) return;
    this.assigning.set(true);
    try {
      await this.s.assignErrand(this.errandId(), this.assignRunnerId, this.assignNote);
      this.closeAssign();
    } catch (e) {
      console.error('Assign failed:', e);
    } finally {
      this.assigning.set(false);
    }
  }

  protected onRunnerSelect(event: Event): void {
    this.assignRunnerId = (event.target as HTMLSelectElement).value;
  }

  protected openQuote(): void {
    // Set default expiry to 24h from now
    const exp = new Date(Date.now() + 24 * 3600 * 1000);
    this.quote.expiresAt = exp.toISOString().slice(0, 16);
    this.showQuote.set(true);
  }

  protected closeQuote(): void {
    this.showQuote.set(false);
  }

  protected async confirmQuote(): Promise<void> {
    if (!this.quote.total) return;
    this.quoting.set(true);
    try {
      await this.s.quoteErrand(this.errandId(), this.quote);
      this.closeQuote();
    } catch (e) {
      console.error('Quote failed:', e);
    } finally {
      this.quoting.set(false);
    }
  }

  protected readonly categoryLabel = categoryLabel;
  protected readonly maskedId = maskedId;
  protected readonly timeAgo = timeAgo;
  protected readonly shortId = shortId;
  protected readonly formatKsh = formatKsh;
}
