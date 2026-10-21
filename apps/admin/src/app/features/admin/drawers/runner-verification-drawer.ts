import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import { formatDateTime } from '../shared-format';
import {
  CHECK_STATUS_TEXT,
  CheckRow,
  NOTE_ANNOUNCE_FROM,
  QueueCheck,
  QueueRunner,
  RE_REVIEW_NOTE_MAX,
  REVIEWER_NOTE_MAX,
  appliedLine,
  canReReview,
  checkRows,
  failureCopy,
  idPhoneLine,
  imageState,
  nameInitials,
  purgedAtOf,
  reviewerLabel,
  runnerLabel,
  runnerLevelLine,
  verificationTypeLabel,
} from '../verification-labels';
import { VerificationDocumentPreviewComponent } from './verification-document-preview';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { NumTextComponent } from '../../../shared/num-text.component';
import { apiError, FORBIDDEN_COPY } from '../../../core/api-error';

interface CheckTarget {
  runner: QueueRunner;
  check: QueueCheck;
}

/**
 * Verification documents (`drawer-runner-verification`, row 278): one
 * runner's checks with the stored ID / selfie images inline, opened from the
 * verification table. Shows the table's store item at once and refreshes it
 * with `GET /runners/:id/verifications` (AV-1). Approve / Reject / Re-review
 * as specced in `p-runners-verification-documents`; their answers update the
 * table row through the store. Image links live only in the preview
 * components and are gone when this drawer closes.
 */
@Component({
  selector: 'app-runner-verification-drawer',
  imports: [
    VerificationDocumentPreviewComponent,
    InlineNoticeComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    NumTextComponent,
  ],
  template: `
    @if (notFound()) {
      <div class="ops-empty">
        <b>This runner isn't in the list any more</b>Refresh the list and open them again.
      </div>
    } @else if (item(); as item) {
      @if (notice(); as n) {
        <app-inline-notice
          class="panel-notice"
          [tone]="n.tone"
          [dismissible]="true"
          [autoDismissMs]="n.tone === 'success' ? 6000 : 0"
          (dismissed)="notice.set(null)"
          >{{ n.text }}</app-inline-notice
        >
      }
      @if (refreshError(); as err) {
        <app-inline-notice class="panel-notice" tone="danger">
          {{ err }}
          <button notice-action type="button" class="btn btn-outline btn-sm" (click)="refresh()">
            Try again
          </button>
        </app-inline-notice>
      }

      <section class="drawer-section" [attr.aria-labelledby]="nameId()">
        <div class="verif-top">
          <span class="who">
            <span class="verif-avatar" aria-hidden="true">{{
              initials(item.user?.displayName)
            }}</span>
            <span>
              <span class="verif-name" [class.num]="!item.user?.shortName" [id]="nameId()">{{
                runnerLabel(item)
              }}</span>
              <span class="verif-sub"><app-num-text [parts]="appliedParts(item)" /></span>
              @if (idPhoneLine(item); as line) {
                <span class="verif-sub num">{{ line }}</span>
              }
              @if (levelParts(item); as parts) {
                <span class="verif-level"><app-num-text [parts]="parts" /></span>
              }
            </span>
          </span>
        </div>
        <button type="button" class="btn btn-text btn-sm verif-profile" (click)="openProfile()">
          Open runner profile
        </button>
      </section>

      <p class="drawer-caption">
        Each image shown here is logged with your name and the time. Viewing never extends how long
        images are kept.
      </p>

      <div class="drawer-card">
        @for (row of rows(item); track row.key + ':' + (row.record?.id ?? '')) {
          <section class="doc-check" [attr.aria-label]="row.label">
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
                    <app-verification-document-preview
                      [check]="v"
                      [label]="row.label"
                      [runner]="runnerLabel(item)"
                    />
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
          </section>
        }
      </div>
    } @else if (refreshError(); as err) {
      <app-inline-notice class="panel-notice" tone="danger">
        {{ err }}
        <button notice-action type="button" class="btn btn-outline btn-sm" (click)="refresh()">
          Try again
        </button>
      </app-inline-notice>
    } @else {
      <div class="ops-loading">Loading documents…</div>
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
export class RunnerVerificationDrawerComponent implements OnInit, OnDestroy {
  protected readonly s = inject(AdminDataService);
  private readonly nav = inject(DrawerNavService);

  readonly runnerProfileId = input.required<string>();

  /** The runner: the table's row (kept current by the store), else the AV-1 answer. */
  readonly item = computed<QueueRunner | null>(() => {
    const id = this.runnerProfileId();
    const fromQueue = this.s.verificationQueue().find((r) => r.runnerProfile.id === id);
    if (fromQueue) return fromQueue;
    const detail = this.s.verificationDetail();
    return detail?.runnerProfile.id === id ? detail : null;
  });

  readonly notFound = signal(false);
  readonly refreshError = signal<string | null>(null);
  /** Per check: the decision being saved, so only the clicked button changes. */
  readonly busy = signal<Record<string, 'approved' | 'rejected'>>({});
  readonly notice = signal<{ tone: NoticeTone; text: string } | null>(null);

  readonly rejectTarget = signal<CheckTarget | null>(null);
  readonly rejectNote = signal('');
  readonly rejecting = signal(false);
  readonly rejectError = signal<string | null>(null);

  readonly reReviewTarget = signal<CheckTarget | null>(null);
  readonly reReviewNote = signal('');
  readonly reReviewing = signal(false);
  readonly reReviewError = signal<string | null>(null);

  protected readonly noteMax = RE_REVIEW_NOTE_MAX;
  protected readonly reviewerNoteMax = REVIEWER_NOTE_MAX;
  protected readonly statusText = CHECK_STATUS_TEXT;
  protected readonly nameId = computed(() => `verif-name-${this.runnerProfileId()}`);
  private refreshSeq = 0;

  ngOnInit(): void {
    this.s.verificationDetail.set(null);
    void this.refresh();
  }

  ngOnDestroy(): void {
    this.refreshSeq++;
    this.s.verificationDetail.set(null);
  }

  /** AV-1: 404 → not found; other errors keep any shown runner with a notice. */
  async refresh(): Promise<void> {
    const seq = ++this.refreshSeq;
    this.refreshError.set(null);
    try {
      await this.s.loadVerificationRunner(this.runnerProfileId());
      if (seq !== this.refreshSeq) return;
      this.notFound.set(false);
    } catch (e) {
      if (seq !== this.refreshSeq) return;
      if (apiError(e).status === 404) {
        this.notFound.set(true);
      } else {
        this.refreshError.set(failureCopy(e, "Couldn't refresh this runner. Try again."));
      }
    }
  }

  protected openProfile(): void {
    this.nav.open('runner', this.runnerProfileId());
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

  /** 403 → access copy; 404 / 409 (decided by another admin) → refresh this runner; other → save error. */
  private reviewFailed(e: unknown): void {
    const err = apiError(e);
    if (err.status === 403) {
      this.notify('danger', FORBIDDEN_COPY);
    } else if (err.status === 404 || err.status === 409) {
      this.listChanged();
      this.notify('info', 'This check was already decided. The list is updated.');
    } else {
      this.notify('danger', "Couldn't save the review. Try again.");
    }
  }

  /** The runner changed elsewhere: refresh it here, and the table when the drawer closes. */
  private listChanged(): void {
    this.s.verificationSaves.update((n) => n + 1);
    void this.refresh();
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
        this.listChanged();
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

  protected rows(item: QueueRunner): CheckRow[] {
    return checkRows(item);
  }

  protected isPurged(v: QueueCheck): boolean {
    return !!v.purgedAt || !!v.purgedLocally;
  }

  protected appliedParts(item: QueueRunner) {
    return appliedLine(item.runnerProfile.appliedAt, item.runnerProfile.serviceAreas);
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

  private notify(tone: NoticeTone, text: string): void {
    this.notice.set({ tone, text });
  }

  protected readonly initials = nameInitials;
  protected readonly runnerLabel = runnerLabel;
  protected readonly idPhoneLine = idPhoneLine;
  protected readonly levelParts = runnerLevelLine;
  protected readonly adminLabel = reviewerLabel;
  protected readonly typeLabel = verificationTypeLabel;
  protected readonly imageState = imageState;
  protected readonly canReReview = canReReview;
  protected readonly formatDateTime = formatDateTime;
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}
