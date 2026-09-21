import { Component, inject, input, OnInit, signal } from '@angular/core';
import { AdminDataService, categoryLabel, maskedId, shortId, timeAgo } from '../admin-data.service';

/**
 * Dispute drawer: a DISPUTED errand + its status history as evidence, and the
 * admin verdict control. Issuing a verdict calls
 * `PATCH /errands/:id/resolve-dispute` (verdict `runner` | `customer`) and the
 * errand's status updates in place (§3.3 DISPUTED → CONFIRMED/CANCELLED).
 */
@Component({
  selector: 'app-dispute-drawer',
  imports: [],
  template: `
    @if (errand(); as d) {
      <section class="drawer-section">
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Disputed task</span><b>{{ shortId(d.id) }}</b>
          </div>
          <div class="drawer-row">
            <span>Category</span><b>{{ categoryLabel(d.category) }}</b>
          </div>
          <div class="drawer-row">
            <span>Runner</span
            ><b>{{ d.runnerProfileId ? maskedId(d.runnerProfileId) : 'not assigned' }}</b>
          </div>
          <div class="drawer-row">
            <span>Opened</span><b>{{ timeAgo(d.createdAt) }}</b>
          </div>
          <div class="drawer-row">
            <span>Value</span><b>{{ ksh(d.quotedPrice ?? d.budget) }}</b>
          </div>
        </div>
      </section>

      <section class="drawer-section">
        <div class="drawer-label">Customer claim</div>
        <div class="drawer-card">{{ d.description }}</div>
      </section>

      <section class="drawer-section">
        <div class="drawer-label">Status history</div>
        <div class="drawer-timeline">
          @for (entry of s.history(); track entry.id) {
            <div class="dt-item">
              <b>{{
                (entry.fromStatus ? sh(entry.fromStatus) + ' → ' : '') + sh(entry.toStatus)
              }}</b>
              <span class="dt-time"
                >{{ sh(entry.actorType) }} · {{ timeAgo(entry.createdAt) }}</span
              >
              @if (entry.note) {
                <span class="dt-time">“{{ entry.note }}”</span>
              }
            </div>
          } @empty {
            <div class="ops-loading">Loading timeline…</div>
          }
        </div>
      </section>

      @if (!result()) {
        <section class="drawer-section">
          <div class="drawer-label">Admin verdict</div>
          <textarea
            class="drawer-textarea"
            placeholder="Resolution note (shown to both parties)…"
            [value]="rationale()"
            (input)="setRationale($event)"
            rows="3"
          ></textarea>
          <div class="drawer-actions">
            <button class="btn-verdict runner" (click)="resolve('runner')" [disabled]="saving()">
              Rule for runner
            </button>
            <button
              class="btn-verdict customer"
              (click)="resolve('customer')"
              [disabled]="saving()"
            >
              Rule for customer
            </button>
          </div>
          @if (saving()) {
            <div class="ops-loading">Recording verdict…</div>
          }
        </section>
      }
    } @else {
      <div class="ops-empty">
        <b>{{ resumingLabel() }}</b>
        {{
          result()?.message ??
            'This errand is no longer in the disputed state — the verdict has been recorded.'
        }}
      </div>
    }

    @if (result()) {
      <div class="dispute-result" [class.ok]="result()!.ok" [class.bad]="!result()!.ok">
        {{ result()!.message }}
      </div>
    }
  `,
  styles: [],
})
export class DisputeDrawerComponent implements OnInit {
  protected readonly s = inject(AdminDataService);

  readonly errandId = input.required<string>();

  readonly rationale = signal('');
  readonly saving = signal(false);
  readonly result = signal<{ ok: boolean; message: string } | null>(null);

  ngOnInit(): void {
    this.s.loadErrandDetail(this.errandId());
  }

  protected errand() {
    return this.s.errands().find((e) => e.id === this.errandId() && e.status === 'DISPUTED');
  }

  protected async resolve(verdict: 'runner' | 'customer'): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    const res = await this.s.resolveDispute(this.errandId(), verdict, this.rationale().trim());
    this.saving.set(false);
    this.result.set(res);
  }

  protected resumingLabel(): string {
    return this.result()?.ok ? 'Dispute resolved' : 'Dispute resolved';
  }

  protected ksh(value: string): string {
    const n = Number(value);
    return Number.isNaN(n) ? '—' : `KSh ${Math.round(n).toLocaleString('en-KE')}`;
  }

  protected sh(value: string): string {
    return value.replace(/_/g, ' ').toLowerCase();
  }

  protected setRationale(event: Event): void {
    this.rationale.set((event.target as HTMLTextAreaElement).value);
  }

  protected readonly categoryLabel = categoryLabel;
  protected readonly maskedId = maskedId;
  protected readonly timeAgo = timeAgo;
  protected readonly shortId = shortId;
}
