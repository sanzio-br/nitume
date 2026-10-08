import { NumTextComponent } from '../../../shared/num-text.component';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminDataService, categoryLabel, maskedId, shortId, timeAgo } from '../admin-data.service';
import { ApiService } from '../../../core/services/api.service';
import { apiError, ApiErrorInfo, FORBIDDEN_COPY } from '../../../core/api-error';
import type {
  Dispute,
  ErrandStatusHistoryEntry,
  ResolveDisputeVerdict,
} from '../../../core/api-types';
import { StatusChipComponent, statusLabel } from '../../../shared/status-chip.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { DrawerNavService } from '../drawer-nav.service';
import { formatDateTime, formatKshExact } from '../shared-format';

export const RATIONALE_MIN = 20;
export const RATIONALE_MAX = 2000;
export const RATIONALE_ERROR =
  'Write at least 20 characters so both sides understand the decision.';

/** Mirrors `ResolveDisputeDto` + the service's trimmed ≥ 20 check. */
export function rationaleValid(note: string): boolean {
  const n = note.trim().length;
  return n >= RATIONALE_MIN && n <= RATIONALE_MAX;
}

/** The latest history row that left DISPUTED (the recorded verdict), if any. */
export function verdictEntry(history: ErrandStatusHistoryEntry[]): ErrandStatusHistoryEntry | null {
  const rows = history.filter((h) => h.fromStatus === 'DISPUTED');
  return rows.length ? rows[rows.length - 1] : null;
}

interface Outcome {
  status: string;
  decidedAt: string;
  note: string | null;
}

interface Notice {
  tone: NoticeTone;
  text: string;
  refundId?: string;
  caption?: string;
}

/**
 * Dispute drawer: the disputed task, the customer's claim (dispute
 * `reason`), the timeline and the Resolution section (row 36, §3.3):
 * Side with runner → COMPLETED; Side with customer → CANCELLED (a refund
 * review opens if the customer paid). Driven by the errand detail, never by
 * the list window, and shows an outcome only from a successful response or
 * the recorded history.
 */
@Component({
  selector: 'app-dispute-drawer',
  imports: [
    NumTextComponent,
    StatusChipComponent,
    InlineNoticeComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
  ],
  template: `
    @if (s.detailLoading()) {
      <div class="ops-loading">Loading dispute…</div>
    } @else if (s.detailError(); as err) {
      <app-inline-notice [tone]="s.detailErrorTone()">
        {{ err }}
        @if (s.detailErrorTone() === 'danger') {
          <button notice-action type="button" class="btn btn-outline btn-sm" (click)="reload()">
            Try again
          </button>
        }
      </app-inline-notice>
    } @else if (s.detail(); as d) {
      <section class="drawer-section">
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Disputed task</span><b>{{ shortId(d.id) }}</b>
          </div>
          <div class="drawer-row">
            <span>Category</span><b class="txt">{{ categoryLabel(d.category) }}</b>
          </div>
          <div class="drawer-row">
            <span>Runner</span>
            @if (d.runnerProfileId) {
              <b>{{ maskedId(d.runnerProfileId) }}</b>
            } @else {
              <span class="val-muted">Not assigned</span>
            }
          </div>
          <div class="drawer-row">
            <span>Opened</span><b>{{ dispute() ? formatDateTime(dispute()!.createdAt) : '—' }}</b>
          </div>
          <div class="drawer-row">
            <span>Value</span><b>{{ formatKshExact(d.quotedPrice ?? d.budget) }}</b>
          </div>
        </div>
      </section>

      <section class="drawer-section">
        <div class="drawer-label">Customer's claim</div>
        <div class="drawer-card">
          @if (dispute(); as disp) {
            <p class="drawer-note">{{ disp.reason }}</p>
          } @else if (disputeState() === 'loading') {
            <div class="drawer-muted">Loading the claim…</div>
          } @else if (disputeState() === 'none') {
            <div class="drawer-muted">No claim on file for this task.</div>
          } @else {
            <div class="drawer-muted">
              Couldn't load the claim.
              <button type="button" class="btn btn-text btn-sm" (click)="loadDispute()">
                Try again
              </button>
            </div>
          }
        </div>
      </section>

      <section class="drawer-section">
        <div class="drawer-label">Timeline</div>
        <div class="drawer-timeline">
          @for (entry of s.history(); track entry.id) {
            <div class="dt-item">
              <b>{{
                (entry.fromStatus ? statusLabel(entry.fromStatus) + ' → ' : '') +
                  statusLabel(entry.toStatus)
              }}</b>
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

      @if (outcome(); as o) {
        <section class="drawer-section">
          <div class="drawer-label">Outcome</div>
          <div class="drawer-card">
            <div class="drawer-row">
              <span>Task status</span><app-status-chip [status]="o.status" />
            </div>
            <div class="drawer-row">
              <span>Decided</span><b>{{ formatDateTime(o.decidedAt) }}</b>
            </div>
            @if (o.note) {
              <p class="drawer-note">“{{ o.note }}”</p>
            }
          </div>
        </section>
      } @else if (d.status === 'DISPUTED') {
        <section class="drawer-section">
          <div class="drawer-label">Resolution</div>
          <div class="drawer-card drawer-stack">
            <div>
              <div class="explainer-block">
                <b>Side with runner</b>
                <span
                  >The task moves to Completed. The runner is paid through the normal payout.</span
                >
              </div>
              <div class="explainer-block">
                <b>Side with customer</b>
                <span
                  >The task moves to Cancelled. If the customer paid, a refund review opens in
                  Refunds, where you set the amount.</span
                >
              </div>
            </div>
            <app-form-field
              #noteField
              label="Resolution note"
              [hideLabel]="true"
              hint="At least 20 characters. The customer and runner can see this note."
              [counter]="rationale().length + '/' + max"
              [counterError]="touched() && !valid()"
              [error]="fieldError()"
            >
              <textarea
                appFieldControl
                rows="4"
                [attr.maxlength]="max"
                placeholder="Add a resolution note..."
                [value]="rationale()"
                [disabled]="saving()"
                (input)="rationale.set(val($event)); serverError.set(null)"
                (blur)="touched.set(true)"
              ></textarea>
            </app-form-field>
            <div class="drawer-actions">
              <button
                type="button"
                class="btn btn-outline"
                [disabled]="!valid() || saving()"
                [attr.aria-describedby]="noteField.hintId"
                (click)="ask('runner')"
              >
                Side with runner
              </button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!valid() || saving()"
                [attr.aria-describedby]="noteField.hintId"
                (click)="ask('customer')"
              >
                Side with customer
              </button>
            </div>
          </div>
        </section>
      }

      <!-- Result and error notices sit under the Outcome card (spec order). -->
      @if (notice(); as n) {
        <app-inline-notice
          [tone]="n.tone"
          [dismissible]="!n.refundId"
          (dismissed)="notice.set(null)"
        >
          <app-num-text [text]="n.text" />
          @if (n.refundId) {
            <button
              notice-action
              type="button"
              class="btn btn-outline btn-sm"
              (click)="nav.open('refund', n.refundId)"
            >
              Open refund review
            </button>
          }
        </app-inline-notice>
        @if (n.caption) {
          <div class="drawer-caption">{{ n.caption }}</div>
        }
      }

      <app-confirm-dialog
        [open]="pending() !== null"
        [title]="pending() === 'runner' ? 'Side with runner?' : 'Side with customer?'"
        [confirmLabel]="pending() === 'runner' ? 'Side with runner' : 'Side with customer'"
        [busy]="saving()"
        (confirmed)="resolve()"
        (cancelled)="pending.set(null)"
      >
        @if (pending() === 'runner') {
          <p>
            <span class="num">{{ shortId(d.id) }}</span> moves to Completed and the runner is paid
            as normal. This can't be undone.
          </p>
        } @else {
          <p>
            <span class="num">{{ shortId(d.id) }}</span> moves to Cancelled. If the customer paid, a
            refund review opens for you to decide. This can't be undone.
          </p>
        }
      </app-confirm-dialog>
    }
  `,
  styles: [],
})
export class DisputeDrawerComponent implements OnInit {
  protected readonly s = inject(AdminDataService);
  private readonly api = inject(ApiService);
  protected readonly nav = inject(DrawerNavService);

  readonly errandId = input.required<string>();

  readonly rationale = signal('');
  readonly touched = signal(false);
  readonly saving = signal(false);
  /** The verdict awaiting confirmation (A-08). */
  readonly pending = signal<ResolveDisputeVerdict | null>(null);
  readonly notice = signal<Notice | null>(null);
  /** Set only from a successful verdict response. */
  private readonly result = signal<Outcome | null>(null);
  protected readonly dispute = signal<Dispute | null>(null);
  protected readonly disputeState = signal<'loading' | 'ready' | 'none' | 'failed'>('loading');

  protected readonly max = RATIONALE_MAX;
  protected readonly valid = computed(() => rationaleValid(this.rationale()));
  readonly serverError = signal<string | null>(null);
  protected readonly fieldError = computed(
    () => this.serverError() ?? (this.touched() && !this.valid() ? RATIONALE_ERROR : null),
  );

  /** Outcome: the response, else (task no longer DISPUTED) the recorded history row. */
  readonly outcome = computed<Outcome | null>(() => {
    const r = this.result();
    if (r) return r;
    const d = this.s.detail();
    if (!d || d.id !== this.errandId() || d.status === 'DISPUTED') return null;
    const entry = verdictEntry(this.s.history());
    return entry
      ? { status: entry.toStatus, decidedAt: entry.createdAt, note: entry.note ?? null }
      : null;
  });

  ngOnInit(): void {
    void this.s.loadErrandDetail(this.errandId());
    void this.loadDispute();
  }

  protected reload(): void {
    void this.s.loadErrandDetail(this.errandId());
  }

  async loadDispute(): Promise<void> {
    this.disputeState.set('loading');
    try {
      this.dispute.set(await firstValueFrom(this.api.getDispute(this.errandId())));
      this.disputeState.set('ready');
    } catch (e) {
      this.disputeState.set(apiError(e).status === 404 ? 'none' : 'failed');
    }
  }

  protected val(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected title(value: string): string {
    const v = value.replace(/_/g, ' ');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  protected ask(verdict: ResolveDisputeVerdict): void {
    this.touched.set(true);
    if (!this.valid() || this.saving()) return;
    this.pending.set(verdict);
  }

  async resolve(): Promise<void> {
    const verdict = this.pending();
    if (!verdict || this.saving()) return;
    this.saving.set(true);
    this.notice.set(null);
    try {
      const res = await this.s.resolveDispute(this.errandId(), verdict, this.rationale().trim());
      this.result.set({
        status: res.errand.status,
        decidedAt: res.history.createdAt,
        note: res.history.note ?? this.rationale().trim(),
      });
      this.pending.set(null);
      if (verdict === 'runner') {
        this.notice.set({
          tone: 'success',
          text: `Dispute resolved for the runner. The task is now ${statusLabel(res.errand.status)}.`,
        });
      } else {
        await this.afterCustomerVerdict(res.errand.status);
      }
    } catch (e) {
      this.pending.set(null);
      await this.handleError(e as ApiErrorInfo);
    } finally {
      this.saving.set(false);
    }
  }

  private async afterCustomerVerdict(status: string): Promise<void> {
    const label = statusLabel(status);
    try {
      const refund = await firstValueFrom(this.api.getErrandRefund(this.errandId()));
      this.notice.set({
        tone: 'success',
        text: `Dispute resolved for the customer. The task is now ${label}. A refund review is waiting in Refunds.`,
        refundId: refund.id,
      });
      void this.s.refreshRefundBadge();
    } catch (e) {
      if (apiError(e).status === 404) {
        this.notice.set({
          tone: 'info',
          text: `Dispute resolved for the customer. The task is now ${label}. The customer hadn't paid, so there is nothing to refund.`,
        });
      } else {
        this.notice.set({
          tone: 'success',
          text: `Dispute resolved for the customer. The task is now ${label}. A refund review is waiting in Refunds.`,
          caption: 'Find the refund review in Refunds.',
        });
      }
    }
  }

  private async handleError(err: ApiErrorInfo): Promise<void> {
    if (err.status === 400 || err.code === 'rationale_too_short') {
      this.serverError.set(RATIONALE_ERROR);
      return;
    }
    if (err.status === 409) {
      // N-8: `errand_not_disputed` on round 3; older APIs send no code.
      await this.s.loadErrandDetail(this.errandId(), { quiet: true });
      if (this.s.detail()?.status !== 'DISPUTED') {
        this.notice.set({
          tone: 'info',
          text: 'This dispute was already resolved. Showing the outcome.',
        });
      } else {
        this.serverError.set(RATIONALE_ERROR);
      }
      return;
    }
    if (err.status === 403) {
      this.notice.set({ tone: 'danger', text: FORBIDDEN_COPY });
    } else if (err.status === 404) {
      this.notice.set({ tone: 'info', text: 'This task no longer exists.' });
    } else {
      this.notice.set({ tone: 'danger', text: "Couldn't record the decision. Try again." });
    }
  }

  protected readonly categoryLabel = categoryLabel;
  protected readonly maskedId = maskedId;
  protected readonly timeAgo = timeAgo;
  protected readonly shortId = shortId;
  protected readonly statusLabel = statusLabel;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatKshExact = formatKshExact;
}
