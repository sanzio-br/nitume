import { Component, inject, signal, computed } from '@angular/core';
import { AdminDataService, shortId, timeAgo } from '../admin-data.service';
import { StatusChipComponent, statusLabel } from '../../../shared/status-chip.component';
import { TitleCasePipe } from '@angular/common';
import type { RunnerVerification, VerificationStatus } from '../../../core/api-types';

/**
 * Verification inbox panel: admin reviews runner document submissions.
 * Data from `GET /runners/verifications` (admin only).
 */
@Component({
  selector: 'app-verifications-panel',
  imports: [StatusChipComponent, TitleCasePipe],
  template: `
    <div class="ops-topbar">
      <div>
        <h1>Verification inbox</h1>
        <div class="sub">{{ sub() }}</div>
      </div>
      <div class="ops-top-actions">
        <select class="btn-city" [value]="statusFilter()" (change)="setStatus($event)">
          <option value="">All statuses</option>
          @for (s of statusOptions; track s) {
            <option [value]="s">{{ s | titlecase }}</option>
          }
        </select>
        <button class="btn-city" (click)="load()">↻ Refresh</button>
      </div>
    </div>

    <p class="kpi-note">
      Runner-submitted documents awaiting admin review. Approve → runner level upgrades.
    </p>

    <div class="verif-grid">
      @for (v of visible(); track v.id) {
        <div class="verif-card">
          <div class="vc-header">
            <div class="runner-avatar">{{ initials(v.runnerProfile?.id ?? '') }}</div>
            <div>
              <b>{{ shortId(v.runnerProfile?.id ?? '') }}</b>
              <div class="vc-sub">{{ v.user?.phone ?? '—' }}</div>
            </div>
            <app-status-chip [status]="v.status" />
          </div>

          <div class="vc-body">
            <div class="vc-row">
              <span>Type</span><b>{{ typeLabel(v.verificationType) }}</b>
            </div>
            <div class="vc-row">
              <span>Submitted</span><b>{{ timeAgo(v.submittedAt) }}</b>
            </div>
            @if (v.documentKey) {
              <div class="vc-row">
                <span>Document</span>
                <a class="doc-link" [href]="docUrl(v.documentKey)" target="_blank" rel="noopener">View</a>
              </div>
            }
            @if (v.reviewerNote) {
              <div class="vc-row">
                <span>Admin note</span><b>{{ v.reviewerNote }}</b>
              </div>
            }
          </div>

          @if (v.status === 'pending') {
            <div class="vc-actions">
              <button class="btn-outline" (click)="review(v.id, 'rejected')" [disabled]="isSaving(v.id)">
                Reject
              </button>
              <button class="btn-primary" (click)="review(v.id, 'approved')" [disabled]="isSaving(v.id)">
                {{ isSaving(v.id) ? 'Approving…' : 'Approve' }}
              </button>
            </div>
          } @else if (v.status === 'approved') {
            <div class="vc-badge success">Approved</div>
          } @else if (v.status === 'rejected') {
            <div class="vc-badge danger">Rejected</div>
          } @else if (v.status === 'in_review') {
            <div class="vc-badge info">In review</div>
          }
        </div>
      } @empty {
        <div class="ops-empty">
          <b>No verifications match</b>Clear the filter, or wait for runner submissions.
        </div>
      }
    </div>

    <!-- Pagination -->
    @if (hasMore()) {
      <div class="pagination">
        <button class="btn-outline" (click)="loadMore()" [disabled]="loadingMore()">
          {{ loadingMore() ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    }
  `,
  styles: [],
})
export class VerificationsPanelComponent {
  protected readonly s = inject(AdminDataService);

  readonly statusFilter = signal<VerificationStatus | ''>('');
  readonly cursor = signal<string | null>(null);
  readonly loadingMore = signal(false);
  readonly saving = signal({} as Record<string, boolean>);

  protected readonly statusOptions: VerificationStatus[] = ['pending', 'approved', 'rejected', 'in_review'];

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.s.listVerifications(this.statusFilter() || undefined).subscribe({
      next: (res) => {
        this.cursor.set(res.nextCursor);
      },
      error: (e) => console.error('Failed to load verifications:', e),
    });
  }

  protected loadMore(): void {
    if (this.loadingMore() || !this.cursor()) return;
    this.loadingMore.set(true);
    this.s.listVerifications(this.statusFilter() || undefined, this.cursor()).subscribe({
      next: (res) => {
        this.cursor.set(res.nextCursor);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  protected setStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as VerificationStatus | '');
    this.load();
  }

  protected async review(id: string, decision: 'approved' | 'rejected'): Promise<void> {
    this.saving.update((s) => ({ ...s, [id]: true }));
    try {
      await this.s.reviewVerification(id, decision);
    } catch (e) {
      console.error('Review failed:', e);
    } finally {
      this.saving.update((s) => ({ ...s, [id]: false }));
    }
  }

  protected visible(): RunnerVerification[] {
    return this.s.verifications();
  }

  protected hasMore(): boolean {
    return !!this.cursor();
  }

  protected initials(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'R';
  }

  protected typeLabel(type: string): string {
    const map: Record<string, string> = {
      government_id: 'Government ID',
      driving_license: 'Driving License',
      vehicle_registration: 'Vehicle Registration',
    };
    return map[type] ?? type.replace(/_/g, ' ');
  }

  protected docUrl(key: string): string {
    // Assuming S3 key → presigned URL endpoint would exist
    return `/api/v1/files/${key}`;
  }

  protected isSaving(id: string): boolean {
    return this.saving()[id] ?? false;
  }

  protected sub(): string {
    const total = this.s.verifications().length;
    const pending = this.s.verifications().filter(v => v.status === 'pending').length;
    return total === 0 ? 'No verifications synced yet' : `${total} items · ${pending} pending`;
  }

  protected readonly shortId = shortId;
  protected readonly timeAgo = timeAgo;
}