import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminDataService, QueueCheck, QueueRunner, shortId, timeAgo } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { formatDateTime, formatPhone } from '../shared-format';
import { LoadMoreComponent } from '../../../shared/load-more.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { NumTextComponent, TextPart } from '../../../shared/num-text.component';
import { apiError, FORBIDDEN_COPY } from '../../../core/api-error';
import { ApiService } from '../../../core/services/api.service';
import type {
  VerificationQueueStatus,
  VerificationSide,
  VerificationStatus,
  VerificationSummaryCheck,
  VerificationType,
} from '../../../core/api-types';

/** Re-review note limit (rows 171, 180): optional, ≤ 500 after trim. */
export const RE_REVIEW_NOTE_MAX = 500;
/** Reject note limit (row 262): optional, internal, ≤ 500 after trim. */
export const REVIEWER_NOTE_MAX = 500;
/** The note counter is announced from here on (spec Accessibility). */
const NOTE_ANNOUNCE_FROM = 450;

/** Status filter (per runner, API `status`); `all` is `All statuses`. */
export const VERIFICATION_STATUS_FILTERS: { value: VerificationQueueStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
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
export function imageState(v: QueueCheck): ImageState {
  if (!isImageCheck(v)) return 'hidden';
  if (v.purgedAt || v.purgedLocally) return 'deleted';
  return v.hasDocument ? 'stored' : 'none';
}

/** Re-review (row 171): only a decided ID/selfie check with a stored image. */
export function canReReview(v: QueueCheck): boolean {
  return v.status !== 'pending' && imageState(v) === 'stored';
}

export type CheckRowStatus = VerificationStatus | 'missing';

/** One check row of a runner card: the newest record of that check, if any. */
export interface CheckRow {
  key: string;
  label: string;
  status: CheckRowStatus;
  record: QueueCheck | null;
  /** The auto-approved phone check: `Phone number` · `Verified` + `Verified at sign-in` only. */
  compact: boolean;
}

/** Mockup order; a legacy ID image (no side) sits after `· Back`. */
const ROW_ORDER: { type: VerificationType; side: VerificationSide | null }[] = [
  { type: 'government_id', side: 'front' },
  { type: 'government_id', side: 'back' },
  { type: 'government_id', side: null },
  { type: 'phone', side: null },
  { type: 'selfie', side: null },
  { type: 'payment_identity', side: null },
  { type: 'reference', side: null },
  { type: 'business', side: null },
];

/**
 * The rows of a runner card: the required checks from the API summary
 * (`Not submitted` when never sent) plus any other check on record, each
 * shown by its newest record (per type, per side for the ID).
 */
export function checkRows(item: QueueRunner): CheckRow[] {
  const newestFirst = [...item.checks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const required = item.verification?.checks ?? [];
  const rows: CheckRow[] = [];
  for (const { type, side } of ROW_ORDER) {
    const record =
      newestFirst.find((c) => c.verificationType === type && (c.side ?? null) === side) ?? null;
    const summary: VerificationSummaryCheck | undefined = required.find(
      (c) => c.type === type && (c.side ?? null) === side,
    );
    if (!record && !summary) continue;
    const status: CheckRowStatus = record?.status ?? summary?.status ?? 'missing';
    rows.push({
      key: `${type}:${side ?? ''}`,
      label: verificationTypeLabel({ verificationType: type, side }),
      status,
      record,
      compact: type === 'phone' && status === 'approved',
    });
  }
  return rows;
}

const STATUS_TEXT: Record<CheckRowStatus, string> = {
  approved: 'Verified',
  pending: 'Pending review',
  rejected: 'Rejected',
  missing: 'Not submitted',
};

/** Two initials from the full display name (`Mercy Wanjiru` → `MW`); `R` without a name. */
export function nameInitials(displayName: string | null | undefined): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'R';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const LEVELS: Record<string, { n: string; name: string }> = {
  '1_basic': { n: '1', name: 'Basic' },
  '2_id_verified': { n: '2', name: 'ID verified' },
  '3_trusted': { n: '3', name: 'Trusted' },
  '4_professional': { n: '4', name: 'Professional' },
};

const LEVEL_2_CHECKS: { key: string; name: string }[] = [
  { key: 'government_id:front', name: 'ID front' },
  { key: 'government_id:back', name: 'ID back' },
  { key: 'selfie:', name: 'selfie' },
];

/**
 * Level line (proposed): the API's level, never inferred; at Level 1 the
 * Level-2 checks not yet approved (display only). Null without a level.
 */
export function levelLine(level: string | null | undefined, rows: CheckRow[]): TextPart[] | null {
  const l = level ? LEVELS[level] : undefined;
  if (!l) return null;
  const parts: TextPart[] = [
    { text: 'Level ', num: false },
    { text: l.n, num: true },
    { text: ` — ${l.name}`, num: false },
  ];
  if (level !== '1_basic') return parts;
  const needs = LEVEL_2_CHECKS.filter(
    (c) => rows.find((r) => r.key === c.key)?.status !== 'approved',
  ).map((c) => c.name);
  if (needs.length === 0) return parts;
  return [
    ...parts,
    { text: ' · Level ', num: false },
    { text: '2', num: true },
    { text: ` needs: ${needs.join(', ')}`, num: false },
  ];
}

/** Topbar count of runners with a pending check (whole queue). */
export function awaitingCopy(n: number): string {
  if (n === 0) return 'No applications awaiting review';
  return n === 1 ? '1 application awaiting review' : `${n} applications awaiting review`;
}

interface RejectTarget {
  runner: QueueRunner;
  check: QueueCheck;
}

/**
 * Runner verification (`p-runners-verification-documents`, mockup
 * `#p-runners`): one card per runner from `GET /runners/verifications/queue`,
 * one row per check, Approve / Reject on each pending row (row 260). Images
 * open only on click, through the logged document endpoint.
 */
@Component({
  selector: 'app-verifications-panel',
  imports: [
    LoadMoreComponent,
    InlineNoticeComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    NumTextComponent,
  ],
  template: `
    <div class="ops-topbar">
      <div>
        <h1>Runner verification</h1>
        <div class="sub">{{ sub() }}</div>
      </div>
      <div class="ops-top-actions">
        <select
          class="btn-city"
          aria-label="Filter by status"
          [value]="statusFilter()"
          (change)="setStatus($event)"
        >
          @for (f of statusFilters; track f.value) {
            <option [value]="f.value" [selected]="f.value === statusFilter()">
              {{ f.label }}
            </option>
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
      Opening an image is logged. Images are deleted at the end of the retention period. A runner
      reaches Level 2 when both ID sides and the selfie are approved.
    </p>

    @if (loading() && cards().length === 0) {
      <div class="ops-loading">Loading…</div>
    } @else if (cards().length > 0) {
      <div class="verif-grid">
        @for (item of cards(); track item.runnerProfile.id) {
          <section
            class="verif-card"
            [attr.aria-labelledby]="'verif-name-' + item.runnerProfile.id"
          >
            <button
              type="button"
              class="verif-top"
              [attr.aria-label]="'Open runner ' + runnerLabel(item)"
              (click)="openRunner(item)"
            >
              <span class="who">
                <span class="verif-avatar" aria-hidden="true">{{
                  initials(item.user?.displayName)
                }}</span>
                <span>
                  <span
                    class="verif-name"
                    [class.num]="!item.user?.shortName"
                    [id]="'verif-name-' + item.runnerProfile.id"
                    >{{ runnerLabel(item) }}</span
                  >
                  <span class="verif-sub">{{ appliedLine(item) }}</span>
                  @if (idPhoneLine(item); as line) {
                    <span class="verif-sub">{{ line }}</span>
                  }
                  @if (levelParts(item); as parts) {
                    <span class="verif-level"><app-num-text [parts]="parts" /></span>
                  }
                </span>
              </span>
            </button>

            @for (row of rows(item); track row.key) {
              <div class="doc-row">
                <span>{{ row.label }}</span>
                <span
                  class="doc-status"
                  [class.pending]="row.status === 'pending'"
                  [class.rejected]="row.status === 'rejected'"
                  [class.missing]="row.status === 'missing'"
                  >{{ statusText[row.status] }}</span
                >
              </div>
              @if (row.compact) {
                <div class="doc-detail">
                  <span class="cell-caption">Verified at sign-in</span>
                </div>
              } @else if (row.record; as v) {
                <div class="doc-detail">
                  @if (v.verificationType !== 'phone') {
                    <div class="drawer-row">
                      <span>Submitted</span><b>{{ formatDateTime(v.createdAt) }}</b>
                    </div>
                  }
                  @switch (imageState(v)) {
                    @case ('stored') {
                      <div class="drawer-row">
                        <span>Image</span>
                        <button
                          type="button"
                          class="btn btn-text btn-sm"
                          [disabled]="isOpening(v.id)"
                          [attr.aria-label]="
                            'View ' +
                            row.label +
                            ' image for ' +
                            runnerLabel(item) +
                            ', opens in a new tab'
                          "
                          (click)="viewImage(v)"
                        >
                          {{ isOpening(v.id) ? 'Opening…' : 'View image' }}
                        </button>
                      </div>
                    }
                    @case ('deleted') {
                      <div class="drawer-row">
                        <span>Image</span>
                        <span class="val-muted"
                          >Deleted
                          @if (v.purgedAt) {
                            <span class="num">{{ formatDateTime(v.purgedAt) }}</span>
                          }
                        </span>
                      </div>
                      <span class="cell-caption"
                        >Deleted at the end of the retention period. The record of this check is
                        kept.</span
                      >
                    }
                    @case ('none') {
                      <div class="drawer-row">
                        <span>Image</span><span class="val-muted">No image on file</span>
                      </div>
                    }
                  }
                  @if (v.status !== 'pending' && (v.reviewedAt || v.reReviews.length)) {
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
                  }
                  @if (v.status !== 'pending' && v.reviewerNote && !isPurged(v)) {
                    <div class="drawer-row drawer-row-wrap">
                      <span>Admin note</span>
                      <span class="val-text"
                        >{{ v.reviewerNote }} <span class="val-muted">· internal</span></span
                      >
                    </div>
                  }
                  @if (v.status === 'pending') {
                    <div class="verif-actions">
                      <button
                        type="button"
                        class="btn-reject"
                        [attr.aria-label]="'Reject ' + row.label + ' for ' + runnerLabel(item)"
                        [disabled]="!!busy()[v.id]"
                        (click)="openReject(item, v)"
                      >
                        {{ busy()[v.id] === 'rejected' ? 'Rejecting…' : 'Reject' }}
                      </button>
                      <button
                        type="button"
                        class="btn-approve"
                        [attr.aria-label]="'Approve ' + row.label + ' for ' + runnerLabel(item)"
                        [disabled]="!!busy()[v.id]"
                        (click)="approve(v)"
                      >
                        {{ busy()[v.id] === 'approved' ? 'Approving…' : 'Approve' }}
                      </button>
                    </div>
                  } @else if (canReReview(v)) {
                    <div class="verif-actions">
                      <button
                        type="button"
                        class="btn btn-outline btn-sm"
                        [attr.aria-label]="
                          'Re-review evidence: ' + row.label + ' for ' + runnerLabel(item)
                        "
                        (click)="openReReview(item, v)"
                      >
                        Re-review evidence
                      </button>
                    </div>
                  }
                </div>
              }
            }
          </section>
        }
      </div>
    } @else if (!loading() && !loadError()) {
      <div class="ops-empty">
        <b>No applications match</b>Clear the filter, or wait for runner submissions.
      </div>
    }

    @if (hasMore()) {
      <app-load-more [loading]="loadingMore()" (load)="loadMore()" />
    }

    <app-confirm-dialog
      [open]="!!rejectTarget()"
      [form]="true"
      [title]="rejectTitle()"
      confirmLabel="Reject check"
      busyLabel="Rejecting…"
      [busy]="rejecting()"
      [confirmDisabled]="rejectNote().trim().length > reviewerNoteMax"
      (confirmed)="confirmReject()"
      (cancelled)="closeReject()"
    >
      @if (rejectTarget(); as t) {
        <p>
          <span [class.num]="!t.runner.user?.shortName">{{ runnerLabel(t.runner) }}</span> will see
          that this check wasn't approved and can submit it again. Your note stays internal and is
          never shown to the runner.
        </p>
        <app-form-field
          label="Note (optional)"
          hint="Internal. Never shown to the runner."
          [plainHint]="true"
          [counter]="rejectNote().trim().length + '/' + reviewerNoteMax"
          [counterError]="rejectNote().trim().length > reviewerNoteMax"
        >
          <textarea
            appFieldControl
            rows="3"
            [attr.maxlength]="reviewerNoteMax"
            [value]="rejectNote()"
            [disabled]="rejecting()"
            (input)="setRejectNote($event)"
          ></textarea>
        </app-form-field>
        <span class="sr-only" aria-live="polite">{{ noteAnnouncement(rejectNote()) }}</span>
        @if (rejectError(); as err) {
          <app-inline-notice tone="danger">{{ err }}</app-inline-notice>
        }
      }
    </app-confirm-dialog>

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
          This records that you are reviewing the stored {{ typeLabel(t.check) }} for
          <span [class.num]="!t.runner.user?.shortName">{{ runnerLabel(t.runner) }}</span> again.
          The review is logged with your name and the time, and the image is kept for a new
          retention period from today. Opening the image alone never does this.
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
  private readonly nav = inject(DrawerNavService);

  readonly statusFilter = signal<VerificationQueueStatus>('pending');
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  /** The last load failed: no empty state under the error. */
  readonly loadError = signal(false);
  /** Per check: the decision being saved, so only the clicked button changes. */
  readonly busy = signal<Record<string, 'approved' | 'rejected'>>({});
  readonly opening = signal<Record<string, boolean>>({});
  readonly notice = signal<{ tone: NoticeTone; text: string; fromLoad?: true } | null>(null);

  readonly rejectTarget = signal<RejectTarget | null>(null);
  readonly rejectNote = signal('');
  readonly rejecting = signal(false);
  readonly rejectError = signal<string | null>(null);

  readonly reReviewTarget = signal<RejectTarget | null>(null);
  readonly reReviewNote = signal('');
  readonly reReviewing = signal(false);
  readonly reReviewError = signal<string | null>(null);

  protected readonly statusFilters = VERIFICATION_STATUS_FILTERS;
  protected readonly noteMax = RE_REVIEW_NOTE_MAX;
  protected readonly reviewerNoteMax = REVIEWER_NOTE_MAX;
  protected readonly statusText = STATUS_TEXT;

  ngOnInit(): void {
    void this.load();
  }

  /** First page under the current filter. Any failure clears the cards and the cursor. */
  async load(): Promise<void> {
    this.clearLoadNotice();
    this.loading.set(true);
    this.loadingMore.set(false);
    this.loadError.set(false);
    this.cursor.set(null);
    try {
      const res = await this.s.loadVerificationQueue(this.statusFilter());
      if (!res) return; // A newer load owns the panel.
      this.cursor.set(res.nextCursor);
      this.loading.set(false);
    } catch (e) {
      this.cursor.set(null);
      this.loading.set(false);
      this.loadError.set(true);
      this.notice.set({
        tone: 'danger',
        text: failureCopy(e, "Couldn't load verifications. Try again."),
        fromLoad: true,
      });
    }
  }

  /** Next runners; a failure keeps the cards shown and `Load more` available. */
  protected async loadMore(): Promise<void> {
    const cursor = this.cursor();
    if (this.loadingMore() || !cursor) return;
    this.clearLoadNotice();
    this.loadingMore.set(true);
    try {
      const res = await this.s.loadVerificationQueue(this.statusFilter(), cursor);
      if (res) this.cursor.set(res.nextCursor);
    } catch (e) {
      this.notice.set({
        tone: 'danger',
        text: failureCopy(e, "Couldn't load verifications. Try again."),
        fromLoad: true,
      });
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected setStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as VerificationQueueStatus);
    this.s.clearVerificationQueue();
    void this.load();
  }

  protected openRunner(item: QueueRunner): void {
    this.nav.open('runner', item.runnerProfile.id);
  }

  /** One click, no dialog; one call per click, no auto-retry; only this row is disabled. */
  async approve(v: QueueCheck): Promise<void> {
    if (this.busy()[v.id]) return;
    this.busy.update((b) => ({ ...b, [v.id]: 'approved' }));
    try {
      await this.s.reviewVerification(v, 'approved');
      this.notify('success', 'Check approved.');
    } catch (e) {
      this.reviewFailed(e);
    } finally {
      this.busy.update((b) => without(b, v.id));
    }
  }

  protected openReject(runner: QueueRunner, check: QueueCheck): void {
    if (this.busy()[check.id]) return;
    this.rejectNote.set('');
    this.rejectError.set(null);
    this.rejectTarget.set({ runner, check });
  }

  protected closeReject(): void {
    if (this.rejecting()) return;
    this.rejectTarget.set(null);
  }

  protected setRejectNote(event: Event): void {
    this.rejectNote.set((event.target as HTMLTextAreaElement).value);
  }

  /** Trimmed note; blank or whitespace-only is sent as no note (row 262). */
  async confirmReject(): Promise<void> {
    const target = this.rejectTarget();
    if (!target || this.rejecting()) return;
    const note = this.rejectNote().trim();
    if (note.length > REVIEWER_NOTE_MAX) return;
    const id = target.check.id;
    this.rejecting.set(true);
    this.rejectError.set(null);
    this.busy.update((b) => ({ ...b, [id]: 'rejected' }));
    try {
      await this.s.reviewVerification(target.check, 'rejected', note || undefined);
      this.rejecting.set(false);
      this.rejectTarget.set(null);
      this.notify('success', 'Check rejected.');
    } catch (e) {
      this.rejecting.set(false);
      const err = apiError(e);
      if (err.status === 403 || err.status === 404 || err.status === 409) {
        this.rejectTarget.set(null);
        this.reviewFailed(e);
      } else if (err.status === 400 && err.code === 'reviewer_note_invalid') {
        this.rejectError.set('Notes can be up to 500 characters.');
      } else {
        this.rejectError.set("Couldn't save the review. Try again.");
      }
    } finally {
      this.busy.update((b) => without(b, id));
    }
  }

  /** 403 → access copy; 404 / 409 (decided by another admin) → reload; other → save error. */
  private reviewFailed(e: unknown): void {
    const err = apiError(e);
    if (err.status === 403) {
      this.notify('danger', FORBIDDEN_COPY);
    } else if (err.status === 404 || err.status === 409) {
      void this.load();
      this.notify('info', 'This check was already decided. The list is updated.');
    } else {
      this.notify('danger', "Couldn't save the review. Try again.");
    }
  }

  /**
   * Asks for a fresh signed link on every click (each call is logged); never
   * prefetched or kept. The tab is opened synchronously on the click (so no
   * popup blocker stops it), detached from this page, then pointed at the
   * link; it is closed again when there is nothing to show.
   */
  async viewImage(v: QueueCheck): Promise<void> {
    if (this.isOpening(v.id)) return;
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    this.opening.update((o) => ({ ...o, [v.id]: true }));
    try {
      const res = await firstValueFrom(this.api.verificationDocument(v.id));
      if (res.url) {
        if (tab) tab.location.replace(res.url);
        else window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        tab?.close();
        this.notify('info', "Image preview isn't available in this environment.");
      }
    } catch (e) {
      tab?.close();
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

  protected openReReview(runner: QueueRunner, check: QueueCheck): void {
    this.reReviewNote.set('');
    this.reReviewError.set(null);
    this.reReviewTarget.set({ runner, check });
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
    const id = target.check.id;
    this.reReviewing.set(true);
    this.reReviewError.set(null);
    try {
      await this.s.reReviewVerification(id, note || undefined);
      this.reReviewing.set(false);
      this.reReviewTarget.set(null);
      this.notify('success', 'Re-review recorded.');
    } catch (e) {
      this.reReviewing.set(false);
      const err = apiError(e);
      if (err.status === 409) {
        this.reReviewTarget.set(null);
        void this.load();
        this.notify('info', 'Decide this check first.');
      } else if (err.status === 410) {
        this.reReviewTarget.set(null);
        this.s.markVerificationPurged(id, purgedAtOf(err.extra));
        this.notify(
          'info',
          "This image was deleted at the end of the retention period, so there's nothing to re-review.",
        );
      } else if (err.status === 404 && err.code === 'verification_document_missing') {
        this.reReviewTarget.set(null);
        this.s.markVerificationMissing(id);
        this.notify('info', 'No image is stored for this check.');
      } else {
        this.reReviewError.set(failureCopy(e, "Couldn't record the re-review. Try again."));
      }
    }
  }

  protected cards(): QueueRunner[] {
    return this.s.verificationQueue();
  }

  protected rows(item: QueueRunner): CheckRow[] {
    return checkRows(item);
  }

  protected hasMore(): boolean {
    return !!this.cursor();
  }

  protected isOpening(id: string): boolean {
    return this.opening()[id] ?? false;
  }

  protected isPurged(v: QueueCheck): boolean {
    return !!v.purgedAt || !!v.purgedLocally;
  }

  protected readonly initials = nameInitials;

  /** Short name (`Mercy W.`, never shortened here); the short id without a name. */
  protected runnerLabel(item: Pick<QueueRunner, 'runnerProfile' | 'user'>): string {
    return item.user?.shortName || shortId(item.runnerProfile.id);
  }

  /** `Applied {relative} · {area}` (`{first} +{n}` for more areas). */
  protected appliedLine(item: QueueRunner): string {
    const ago = timeAgo(item.runnerProfile.appliedAt);
    const applied = ago === '—' ? 'Applied' : `Applied ${ago === 'Yesterday' ? 'yesterday' : ago}`;
    const names = (item.runnerProfile.serviceAreas ?? [])
      .map((a) => a.name)
      .sort((a, b) => a.localeCompare(b));
    if (names.length === 0) return applied;
    return `${applied} · ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}`;
  }

  /** `{short id} · {phone}`; the phone only when the name line already shows the id. */
  protected idPhoneLine(item: QueueRunner): string | null {
    const phone = item.user?.phone ? formatPhone(item.user.phone) : null;
    if (!item.user?.shortName) return phone;
    const id = shortId(item.runnerProfile.id);
    return phone ? `${id} · ${phone}` : id;
  }

  protected levelParts(item: QueueRunner): TextPart[] | null {
    return levelLine(item.runnerProfile.verificationLevel, checkRows(item));
  }

  protected rejectTitle(): string {
    const t = this.rejectTarget();
    return t ? `Reject ${verificationTypeLabel(t.check)}?` : '';
  }

  /** Announced politely only from 450 characters on. */
  protected noteAnnouncement(note: string): string {
    const n = note.trim().length;
    return n >= NOTE_ANNOUNCE_FROM ? `${n} of ${REVIEWER_NOTE_MAX} characters` : '';
  }

  protected adminLabel(
    reviewer: { id: string; displayName: string | null } | null,
    fallbackId: string | null,
  ): string {
    if (reviewer?.displayName) return reviewer.displayName;
    const id = reviewer?.id ?? fallbackId;
    return id ? shortId(id) : '—';
  }

  protected sub(): string {
    const n = this.s.awaitingReviewCount();
    if (n === null) return this.loading() ? 'Loading…' : '';
    return awaitingCopy(n);
  }

  private notify(tone: NoticeTone, text: string): void {
    this.notice.set({ tone, text });
  }

  /** The load-error notice belongs to the failed load; a new load starts without it. */
  private clearLoadNotice(): void {
    if (this.notice()?.fromLoad) this.notice.set(null);
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
