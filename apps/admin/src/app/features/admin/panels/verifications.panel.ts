import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminDataService, shortId } from '../admin-data.service';
import { formatDateTime, formatPhone } from '../shared-format';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { LoadMoreComponent } from '../../../shared/load-more.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { apiError, FORBIDDEN_COPY } from '../../../core/api-error';
import { ApiService } from '../../../core/services/api.service';
import type {
  RunnerVerification,
  VerificationSide,
  VerificationStatus,
} from '../../../core/api-types';

/** Re-review note limit (rows 171, 180): optional, ≤ 500 after trim. */
export const RE_REVIEW_NOTE_MAX = 500;

/** Status filter values: the API enum only (anything else is a 400). */
export const VERIFICATION_STATUS_FILTERS: { value: VerificationStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const TYPE_LABELS: Record<string, string> = {
  government_id: 'National ID',
  selfie: 'Selfie / liveness check',
  phone: 'Phone number',
  payment_identity: 'M-Pesa identity match',
  reference: 'Reference check',
  business: 'Business check',
};

const SIDE_LABELS: Record<VerificationSide, string> = { front: 'Front', back: 'Back' };

/** Display label of a check (`National ID · Front` from `side`); never a raw enum value. */
export function verificationTypeLabel(v: {
  verificationType: string;
  side?: VerificationSide | null;
}): string {
  const base = TYPE_LABELS[v.verificationType] ?? 'Verification check';
  const side = v.verificationType === 'government_id' && v.side ? SIDE_LABELS[v.side] : null;
  return side ? `${base} · ${side}` : base;
}

/** Only ID and selfie checks carry an image. */
export function isImageCheck(v: { verificationType: string }): boolean {
  return v.verificationType === 'government_id' || v.verificationType === 'selfie';
}

export type ImageState = 'stored' | 'deleted' | 'none' | 'hidden';

/** Image line of a check: Stored, Deleted (`purgedAt`), No image, or hidden (not an image check). */
export function imageState(v: RunnerVerification): ImageState {
  if (!isImageCheck(v)) return 'hidden';
  if (v.purgedAt) return 'deleted';
  return v.hasDocument ? 'stored' : 'none';
}

/** Re-review (row 171): only a decided ID/selfie check with a stored image. */
export function canReReview(v: RunnerVerification): boolean {
  return v.status !== 'pending' && imageState(v) === 'stored';
}

/**
 * Runner verification inbox (`p-runners-verification-documents`): one card
 * per check until AQ-35 is answered. Data from `GET /runners/verifications`
 * (admin). Images open only on click, through the logged document endpoint.
 */
@Component({
  selector: 'app-verifications-panel',
  imports: [
    StatusChipComponent,
    LoadMoreComponent,
    InlineNoticeComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
  ],
  template: `
    <div class="ops-topbar">
      <div>
        <h1>Verification inbox</h1>
        <div class="sub">{{ sub() }}</div>
      </div>
      <div class="ops-top-actions">
        <select
          class="btn-city"
          aria-label="Filter by status"
          [value]="statusFilter()"
          (change)="setStatus($event)"
        >
          <option value="">All statuses</option>
          @for (f of statusFilters; track f.value) {
            <option [value]="f.value">{{ f.label }}</option>
          }
        </select>
        <button class="btn-city" (click)="load()">↻ Refresh</button>
      </div>
    </div>

    @if (notice(); as n) {
      <app-inline-notice
        class="panel-notice"
        [tone]="n.tone"
        [dismissible]="true"
        (dismissed)="notice.set(null)"
        >{{ n.text }}</app-inline-notice
      >
    }

    <p class="kpi-note">
      Opening an image is logged. Images are deleted at the end of the retention period.
    </p>

    @if (loading() && visible().length === 0) {
      <div class="ops-loading">Loading…</div>
    } @else {
      <div class="verif-grid">
        @for (v of visible(); track v.id) {
          <div class="verif-card">
            <div class="vc-header">
              <div class="runner-avatar" aria-hidden="true">
                {{ initials(v.runnerProfile?.id ?? '') }}
              </div>
              <div>
                <b class="num">{{ runnerLabel(v) }}</b>
                <div class="verif-sub">{{ phoneOf(v) }}</div>
              </div>
              <app-status-chip [status]="v.status" kind="verification" />
            </div>

            <div class="vc-body">
              <div class="vc-row">
                <span>Type</span><b>{{ typeLabel(v) }}</b>
              </div>
              <div class="vc-row">
                <span>Submitted</span><b class="num">{{ formatDateTime(v.createdAt) }}</b>
              </div>
              @switch (imageState(v)) {
                @case ('stored') {
                  <div class="vc-row">
                    <span>Image</span>
                    <button
                      type="button"
                      class="btn btn-text btn-sm"
                      [disabled]="isOpening(v.id)"
                      [attr.aria-label]="
                        'View ' +
                        typeLabel(v) +
                        ' image for ' +
                        runnerLabel(v) +
                        ', opens in a new tab'
                      "
                      (click)="viewImage(v)"
                    >
                      {{ isOpening(v.id) ? 'Opening…' : 'View image' }}
                    </button>
                  </div>
                }
                @case ('deleted') {
                  <div class="vc-row">
                    <span>Image</span>
                    <b
                      >Deleted <span class="num">{{ formatDateTime(v.purgedAt) }}</span></b
                    >
                  </div>
                  <span class="cell-caption"
                    >Deleted at the end of the retention period. The record of this check is
                    kept.</span
                  >
                }
                @case ('none') {
                  <div class="vc-row">
                    <span>Image</span><span class="cell-caption">No image on file</span>
                  </div>
                }
              }
              @if (v.status !== 'pending' && v.reviewedAt) {
                <div class="vc-row">
                  <span>Decided</span><b class="num">{{ formatDateTime(v.reviewedAt) }}</b>
                </div>
                <div class="vc-row">
                  <span>By</span><b>{{ adminLabel(v.reviewer, v.reviewedBy) }}</b>
                </div>
              }
              @if (v.reviewerNote && !v.purgedAt) {
                <div class="vc-row">
                  <span>Admin note</span><b>{{ v.reviewerNote }}</b>
                </div>
              }
            </div>

            @if (v.status !== 'pending' && (v.reviewedAt || v.reReviews.length)) {
              <div>
                <div class="drawer-label">Reviews</div>
                @if (v.reviewedAt) {
                  <div class="drawer-row">
                    <span
                      >Decided · {{ v.status === 'approved' ? 'Approved' : 'Rejected' }} ·
                      {{ adminLabel(v.reviewer, v.reviewedBy) }}</span
                    >
                    <b>{{ formatDateTime(v.reviewedAt) }}</b>
                  </div>
                }
                @for (r of v.reReviews; track r.id) {
                  <div class="drawer-row">
                    <span
                      >Re-reviewed · {{ adminLabel(r.reviewedBy, r.reviewedBy.id) }}
                      @if (r.note) {
                        <span class="cell-caption">{{ r.note }}</span>
                      }
                    </span>
                    <b>{{ formatDateTime(r.createdAt) }}</b>
                  </div>
                }
              </div>
            }

            @if (v.status === 'pending') {
              <div class="vc-actions">
                <button
                  type="button"
                  class="btn btn-outline"
                  [attr.aria-label]="'Reject ' + typeLabel(v) + ' for ' + runnerLabel(v)"
                  [disabled]="!!busy()[v.id]"
                  (click)="review(v, 'rejected')"
                >
                  {{ busy()[v.id] === 'rejected' ? 'Rejecting…' : 'Reject' }}
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  [attr.aria-label]="'Approve ' + typeLabel(v) + ' for ' + runnerLabel(v)"
                  [disabled]="!!busy()[v.id]"
                  (click)="review(v, 'approved')"
                >
                  {{ busy()[v.id] === 'approved' ? 'Approving…' : 'Approve' }}
                </button>
              </div>
            } @else if (canReReview(v)) {
              <div class="vc-actions">
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  [attr.aria-label]="
                    'Re-review evidence: ' + typeLabel(v) + ' for ' + runnerLabel(v)
                  "
                  (click)="openReReview(v)"
                >
                  Re-review evidence
                </button>
              </div>
            }
          </div>
        } @empty {
          <div class="ops-empty">
            <b>No verifications match</b>Clear the filter, or wait for runner submissions.
          </div>
        }
      </div>
    }

    @if (hasMore()) {
      <app-load-more [loading]="loadingMore()" (load)="loadMore()" />
    }

    <app-confirm-dialog
      [open]="!!reReviewTarget()"
      [form]="true"
      title="Re-review this evidence?"
      confirmLabel="Record re-review"
      busyLabel="Recording…"
      [busy]="reReviewing()"
      [confirmDisabled]="reReviewNote().length > noteMax"
      (confirmed)="recordReReview()"
      (cancelled)="closeReReview()"
    >
      @if (reReviewTarget(); as t) {
        <p>
          This records that you are reviewing the stored {{ typeLabel(t) }} for
          <span class="num">{{ runnerLabel(t) }}</span> again. The review is logged with your name
          and the time, and the image is kept for a new retention period from today. Opening the
          image alone never does this.
        </p>
        <app-form-field
          label="Note (optional)"
          hint="Kept in the audit trail until the image is deleted."
          [plainHint]="true"
          [counter]="reReviewNote().length + '/' + noteMax"
          [counterError]="reReviewNote().length > noteMax"
        >
          <textarea
            appFieldControl
            data-autofocus
            rows="3"
            [attr.maxlength]="noteMax"
            [value]="reReviewNote()"
            [disabled]="reReviewing()"
            (input)="setReReviewNote($event)"
          ></textarea>
        </app-form-field>
        @if (reReviewError(); as err) {
          <app-inline-notice tone="danger">{{ err }}</app-inline-notice>
        }
      }
    </app-confirm-dialog>
  `,
  styles: [],
})
export class VerificationsPanelComponent implements OnInit {
  protected readonly s = inject(AdminDataService);
  private readonly api = inject(ApiService);

  readonly statusFilter = signal<VerificationStatus | ''>('');
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  /** Per check: the decision being saved, so only the clicked button changes. */
  readonly busy = signal<Record<string, 'approved' | 'rejected'>>({});
  readonly opening = signal<Record<string, boolean>>({});
  readonly notice = signal<{ tone: NoticeTone; text: string } | null>(null);

  readonly reReviewTarget = signal<RunnerVerification | null>(null);
  readonly reReviewNote = signal('');
  readonly reReviewing = signal(false);
  readonly reReviewError = signal<string | null>(null);

  protected readonly statusFilters = VERIFICATION_STATUS_FILTERS;
  protected readonly noteMax = RE_REVIEW_NOTE_MAX;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadingMore.set(false);
    this.s.listVerifications(this.statusFilter() || undefined).subscribe({
      next: (res) => {
        this.cursor.set(res.nextCursor);
        this.loading.set(false);
      },
      error: (e) => {
        this.cursor.set(null);
        this.loading.set(false);
        this.notify('danger', failureCopy(e, "Couldn't load verifications. Try again."));
      },
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
      error: (e) => {
        this.loadingMore.set(false);
        this.notify('danger', failureCopy(e, "Couldn't load more. Try again."));
      },
    });
  }

  protected setStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as VerificationStatus | '');
    this.load();
  }

  /** One call per click, no auto-retry; both buttons disabled, only the clicked one relabels. */
  async review(v: RunnerVerification, decision: 'approved' | 'rejected'): Promise<void> {
    if (this.busy()[v.id]) return;
    this.busy.update((b) => ({ ...b, [v.id]: decision }));
    try {
      await this.s.reviewVerification(v, decision);
      this.notify('success', decision === 'approved' ? 'Check approved.' : 'Check rejected.');
    } catch (e) {
      const err = apiError(e);
      if (err.status === 403) {
        this.notify('danger', FORBIDDEN_COPY);
      } else if (err.status === 404 || err.status === 409) {
        // Already decided by another admin: 404 today, 409 `verification_already_decided` next.
        this.load();
        this.notify('info', 'This check was already decided. The list is updated.');
      } else {
        this.notify('danger', "Couldn't save the review. Try again.");
      }
    } finally {
      this.busy.update((b) => without(b, v.id));
    }
  }

  /** Asks for a fresh signed link on every click (each call is logged); never prefetched or kept. */
  async viewImage(v: RunnerVerification): Promise<void> {
    if (this.isOpening(v.id)) return;
    this.opening.update((o) => ({ ...o, [v.id]: true }));
    try {
      const res = await firstValueFrom(this.api.verificationDocument(v.id));
      if (res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        this.notify('info', "Image preview isn't available in this environment.");
      }
    } catch (e) {
      const err = apiError(e);
      if (err.status === 410) {
        this.s.markVerificationPurged(v.id, purgedAtOf(err.extra));
        this.notify('info', 'This image was deleted at the end of the retention period.');
      } else if (err.status === 404 && err.code === 'verification_document_missing') {
        this.s.markVerificationMissing(v.id);
        this.notify('info', 'No image is stored for this check.');
      } else {
        this.notify('danger', failureCopy(e, "Couldn't open the image. Try again."));
      }
    } finally {
      this.opening.update((o) => without(o, v.id));
    }
  }

  protected openReReview(v: RunnerVerification): void {
    this.reReviewNote.set('');
    this.reReviewError.set(null);
    this.reReviewTarget.set(v);
  }

  protected closeReReview(): void {
    if (this.reReviewing()) return;
    this.reReviewTarget.set(null);
  }

  protected setReReviewNote(event: Event): void {
    this.reReviewNote.set((event.target as HTMLTextAreaElement).value);
  }

  /** Whitespace-only notes are sent as no note (row 180). */
  async recordReReview(): Promise<void> {
    const target = this.reReviewTarget();
    if (!target || this.reReviewing()) return;
    const note = this.reReviewNote().trim();
    if (note.length > RE_REVIEW_NOTE_MAX) return;
    this.reReviewing.set(true);
    this.reReviewError.set(null);
    try {
      await this.s.reReviewVerification(target.id, note || undefined);
      this.reReviewing.set(false);
      this.reReviewTarget.set(null);
      this.notify('success', 'Re-review recorded.');
    } catch (e) {
      this.reReviewing.set(false);
      const err = apiError(e);
      if (err.status === 409) {
        this.reReviewTarget.set(null);
        this.load();
        this.notify('info', 'Decide this check first.');
      } else if (err.status === 410) {
        this.reReviewTarget.set(null);
        this.s.markVerificationPurged(target.id, purgedAtOf(err.extra));
        this.notify(
          'info',
          "This image was deleted at the end of the retention period, so there's nothing to re-review.",
        );
      } else if (err.status === 404 && err.code === 'verification_document_missing') {
        this.reReviewTarget.set(null);
        this.s.markVerificationMissing(target.id);
        this.notify('info', 'No image is stored for this check.');
      } else {
        this.reReviewError.set(failureCopy(e, "Couldn't record the re-review. Try again."));
      }
    }
  }

  protected visible(): RunnerVerification[] {
    return this.s.verifications();
  }

  protected hasMore(): boolean {
    return !!this.cursor();
  }

  protected isOpening(id: string): boolean {
    return this.opening()[id] ?? false;
  }

  // Name initials wait for the runner name on the item (finding 38, API A-5).
  protected initials(id: string): string {
    return (
      id
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 2)
        .toUpperCase() || 'R'
    );
  }

  /** The runner on the card and in accessible names (the item has no display name yet). */
  protected runnerLabel(v: RunnerVerification): string {
    return shortId(v.runnerProfile?.id ?? v.runnerProfileId);
  }

  protected phoneOf(v: RunnerVerification): string {
    const phone = v.user?.phone;
    return phone ? formatPhone(phone) : '—';
  }

  protected adminLabel(
    reviewer: { id: string; displayName: string | null } | null,
    fallbackId: string | null,
  ): string {
    if (reviewer?.displayName) return reviewer.displayName;
    const id = reviewer?.id ?? fallbackId;
    return id ? shortId(id) : '—';
  }

  // Wording waits on AQ-35 (finding 40); only the first-load state is fixed here.
  protected sub(): string {
    if (this.loading() && this.s.verifications().length === 0) return 'Loading…';
    const total = this.s.verifications().length;
    const pending = this.s.verifications().filter((v) => v.status === 'pending').length;
    return total === 0 ? 'No verifications synced yet' : `${total} items · ${pending} pending`;
  }

  private notify(tone: NoticeTone, text: string): void {
    this.notice.set({ tone, text });
  }

  protected readonly typeLabel = verificationTypeLabel;
  protected readonly imageState = imageState;
  protected readonly canReReview = canReReview;
  protected readonly formatDateTime = formatDateTime;
}

function failureCopy(e: unknown, fallback: string): string {
  return apiError(e).status === 403 ? FORBIDDEN_COPY : fallback;
}

function purgedAtOf(extra: Record<string, unknown>): string | null {
  return typeof extra['purgedAt'] === 'string' ? extra['purgedAt'] : null;
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}
