import { NumTextComponent } from '../../../shared/num-text.component';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { AdminDataService, categoryLabel, maskedId, shortId, timeAgo } from '../admin-data.service';
import { StatusChipComponent, statusLabel } from '../../../shared/status-chip.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog.component';
import { FieldControlDirective, FormFieldComponent } from '../../../shared/form-field.component';
import { ApiErrorInfo, FORBIDDEN_COPY } from '../../../core/api-error';
import type {
  ErrandCandidatesPage,
  ErrandStatusHistoryEntry,
  QuoteErrandResult,
} from '../../../core/api-types';
import { formatDateTime, formatKsh, formatKshExact } from '../shared-format';
import { QuoteConflict, QuoteDialogComponent } from './quote-dialog';
import { QuoteSectionComponent } from './quote.section';
import { MerchantDetailsSectionComponent } from './merchant-details.section';
import { RefundLinkSectionComponent } from './refund-link.section';
import { RunnerPayoutsLinkSectionComponent } from '../payouts/runner-payouts-link.section';
import { TaskOfferSectionComponent } from './task-offer.section';
import { RunnerPickerComponent } from './runner-picker';

/**
 * Admin actions by state (§3.3): the first quote only from REQUESTED; a
 * runner can only be assigned from PAYMENT_CONFIRMED (the API's only
 * assignment transition). Re-quote lives in the Quote section.
 */
export function taskActions(status: string): { quote: boolean; assign: boolean } {
  return { quote: status === 'REQUESTED', assign: status === 'PAYMENT_CONFIRMED' };
}

/** States before payment: `deadlineAt` may still be null (customer chose `Flexible`, row 239). */
const PRE_PAYMENT_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'REQUESTED',
  'QUOTED',
  'ACCEPTED',
]);

/**
 * Read-only `Deadline` row (`drawer-task-offer.md` Layout 2, rows 239, 243):
 * the chosen time (Fira Code); `No deadline yet` (Fira Sans) when
 * `deadlineAt` is null before payment; no row for a CANCELLED task without
 * one. Any other null keeps the built `—`. Admins never edit a deadline.
 */
export function deadlineRow(
  status: string,
  deadlineAt: string | null | undefined,
): { at: string; text?: undefined } | { at: null; text: string } | null {
  if (deadlineAt) return { at: deadlineAt };
  if (status === 'CANCELLED') return null;
  return { at: null, text: PRE_PAYMENT_STATUSES.has(status) ? 'No deadline yet' : '—' };
}

/**
 * `Status history` caption actor: `Admin · {admin name}` when the API names
 * the admin (`actor.displayName`, admin viewers), else the actor type as
 * built (`Admin`, `System`, `Runner`, `Customer`).
 */
export function historyActor(entry: ErrandStatusHistoryEntry): string {
  const type = entry.actorType.replace(/_/g, ' ');
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const name = entry.actor?.displayName?.trim();
  return entry.actorType === 'admin' && name ? `${label} · ${name}` : label;
}

/**
 * Task drawer: errand detail (`GET /errands/:id`) + status history. Sections:
 * summary, items, locations, runner (offer state), merchant payment details,
 * quote, admin actions
 * (Issue quote / Assign runner), refund link, status history.
 * Re-mounted each time the drawer opens, so it fetches on init.
 */
@Component({
  selector: 'app-task-drawer',
  imports: [
    NumTextComponent,
    StatusChipComponent,
    InlineNoticeComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
    FieldControlDirective,
    QuoteDialogComponent,
    QuoteSectionComponent,
    MerchantDetailsSectionComponent,
    RefundLinkSectionComponent,
    RunnerPayoutsLinkSectionComponent,
    TaskOfferSectionComponent,
    RunnerPickerComponent,
  ],
  template: `
    @if (s.detailLoading()) {
      <div class="ops-loading">Loading task detail…</div>
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
      @if (notice(); as n) {
        <app-inline-notice
          [tone]="n.tone"
          [dismissible]="true"
          [autoDismissMs]="n.tone === 'success' ? 6000 : 0"
          (dismissed)="notice.set(null)"
          ><app-num-text [text]="n.text"
        /></app-inline-notice>
      }
      <section class="drawer-section">
        <div class="drawer-card">
          <div class="drawer-row">
            <span>Task</span><b>{{ shortId(d.id) }}</b>
          </div>
          <div class="drawer-row"><span>Status</span><app-status-chip [status]="d.status" /></div>
          <div class="drawer-row">
            <span>Category</span><b class="txt">{{ categoryLabel(d.category) }}</b>
          </div>
          <div class="drawer-row">
            <span>Customer</span><b>{{ maskedId(d.customerId) }}</b>
          </div>
          <div class="drawer-row">
            <span>Budget</span><b>{{ formatKsh(d.budget) }}</b>
          </div>
          <div class="drawer-row">
            <span>Quoted</span><b>{{ formatKshExact(d.quotedPrice ?? null) }}</b>
          </div>
          <div class="drawer-row">
            <span>Urgency</span><b class="txt">{{ title(d.urgency ?? 'standard') }}</b>
          </div>
          @if (deadlineRow(d.status, d.deadlineAt); as dl) {
            <div class="drawer-row">
              <span>Deadline</span>
              @if (dl.at) {
                <b>{{ formatDateTime(dl.at) }}</b>
              } @else {
                <b class="txt">{{ dl.text }}</b>
              }
            </div>
          }
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
                <span class="val-text">
                  @if (item.quantity) {
                    <span class="num">{{ item.quantity }}</span> ×
                  }
                  {{ item.unit ?? '' }}</span
                >
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
                <b class="txt">{{ loc.addressText }}</b>
              </div>
            }
          </div>
        </section>
      }

      <app-task-offer-section [errand]="d" (notice)="notice.set($event)" />

      <app-merchant-details-section [errand]="d" />

      <app-quote-section [errand]="d" />

      @if (actions().quote || actions().assign) {
        <section class="drawer-section">
          <div class="drawer-label">Admin actions</div>
          <div class="drawer-actions">
            @if (actions().quote) {
              <button type="button" class="btn btn-primary" (click)="quoteOpen.set(true)">
                Issue quote
              </button>
            }
            @if (actions().assign) {
              <button type="button" class="btn btn-primary" (click)="openAssign()">
                Assign runner
              </button>
            }
          </div>
        </section>
      }

      <app-refund-link-section [errandId]="d.id" [status]="d.status" />
      <app-runner-payouts-link-section [errandId]="d.id" [status]="d.status" />

      <section class="drawer-section">
        <div class="drawer-label">Status history</div>
        <div class="drawer-timeline">
          @for (entry of s.history(); track entry.id) {
            <div class="dt-item">
              <b
                >{{ entry.fromStatus ? statusLabel(entry.fromStatus) + ' → ' : ''
                }}{{ statusLabel(entry.toStatus) }}</b
              >
              <span class="dt-time"
                ><span class="dt-actor">{{ historyActor(entry) }}</span> ·
                {{ timeAgo(entry.createdAt) }}</span
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

      <app-quote-dialog
        [open]="quoteOpen()"
        [errandId]="d.id"
        [errandStatus]="d.status"
        (closed)="quoteOpen.set(false)"
        (issued)="onQuoted($event)"
        (conflict)="onQuoteConflict($event)"
      />

      <app-confirm-dialog
        [open]="assignOpen()"
        [form]="true"
        title="Assign runner"
        confirmLabel="Assign"
        busyLabel="Assigning…"
        [busy]="assigning()"
        [confirmDisabled]="!assignRunnerId()"
        (confirmed)="confirmAssign()"
        (cancelled)="assignOpen.set(false)"
      >
        <p>
          Select a runner for <span class="num">{{ shortId(d.id) }}</span
          >.
        </p>
        @if (assignNotice(); as n) {
          <app-inline-notice [tone]="n.tone"
            ><app-num-text [text]="n.text" />
            @if (candidatesFailed()) {
              <button
                notice-action
                type="button"
                class="btn btn-outline btn-sm"
                (click)="loadCandidates()"
              >
                Try again
              </button>
            }
          </app-inline-notice>
        }
        <div class="drawer-stack">
          <div class="field">
            <div class="field-label" aria-hidden="true">Runner</div>
            @if (candidatesLoading()) {
              <div class="ops-loading">Loading runners…</div>
            } @else if (candidates(); as page) {
              <app-runner-picker
                [candidates]="page.items"
                [offlineCount]="page.offlineCount"
                [selected]="assignRunnerId()"
                (selectedChange)="assignRunnerId.set($event)"
              />
            }
          </div>
          <app-form-field label="Note (optional)" [counter]="assignNote().length + '/500'">
            <textarea
              appFieldControl
              rows="2"
              maxlength="500"
              [value]="assignNote()"
              (input)="assignNote.set(val($event))"
            ></textarea>
          </app-form-field>
        </div>
      </app-confirm-dialog>
    }
  `,
  styles: [],
})
export class TaskDrawerComponent implements OnInit {
  protected readonly s = inject(AdminDataService);

  readonly errandId = input.required<string>();

  protected readonly notice = signal<{ tone: NoticeTone; text: string } | null>(null);
  protected readonly quoteOpen = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly assigning = signal(false);
  protected readonly assignRunnerId = signal('');
  protected readonly assignNote = signal('');
  protected readonly assignNotice = signal<{ tone: NoticeTone; text: string } | null>(null);
  protected readonly candidates = signal<ErrandCandidatesPage | null>(null);
  protected readonly candidatesLoading = signal(false);
  protected readonly candidatesFailed = signal(false);

  protected readonly actions = computed(() => taskActions(this.s.detail()?.status ?? ''));

  ngOnInit(): void {
    void this.s.loadErrandDetail(this.errandId());
  }

  protected reload(): void {
    void this.s.loadErrandDetail(this.errandId());
  }

  protected title(value: string): string {
    const v = value.replace(/_/g, ' ');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onQuoted(res: QuoteErrandResult): void {
    this.quoteOpen.set(false);
    this.notice.set({
      tone: 'success',
      text: `Quote issued: ${formatKshExact(res.quote.total)}, valid until ${formatDateTime(res.quote.expiresAt)}.`,
    });
  }

  protected async onQuoteConflict(_: QuoteConflict): Promise<void> {
    this.quoteOpen.set(false);
    await this.s.loadErrandDetail(this.errandId(), { quiet: true });
    this.notice.set({
      tone: 'info',
      text: 'This task changed while you were editing. Showing the latest.',
    });
  }

  protected openAssign(): void {
    this.assignRunnerId.set('');
    this.assignNote.set('');
    this.assignNotice.set(null);
    this.assignOpen.set(true);
    void this.loadCandidates();
  }

  /**
   * The dialog's runner list from `GET /errands/:id/candidates` (rows 177,
   * 215): busy runners are left out by the API; offline runners go in the
   * collapsed `Show offline runners ({n})` group.
   */
  protected async loadCandidates(): Promise<void> {
    this.candidatesLoading.set(true);
    this.candidatesFailed.set(false);
    this.assignNotice.set(null);
    try {
      this.candidates.set(await this.s.loadCandidates(this.errandId()));
    } catch (e) {
      const err = e as ApiErrorInfo;
      this.candidates.set(null);
      if (err.status === 409 || err.status === 404) {
        this.assignOpen.set(false);
        await this.s.loadErrandDetail(this.errandId(), { quiet: true });
        this.notice.set({
          tone: 'info',
          text: 'This task changed while you were editing. Showing the latest.',
        });
      } else if (err.status === 403) {
        this.assignNotice.set({ tone: 'danger', text: FORBIDDEN_COPY });
      } else {
        this.candidatesFailed.set(true);
        this.assignNotice.set({ tone: 'danger', text: "Couldn't load runners. Try again." });
      }
    } finally {
      this.candidatesLoading.set(false);
    }
  }

  protected async confirmAssign(): Promise<void> {
    if (!this.assignRunnerId() || this.assigning()) return;
    this.assigning.set(true);
    this.assignNotice.set(null);
    try {
      await this.s.assignErrand(this.errandId(), this.assignRunnerId(), this.assignNote().trim());
      this.assignOpen.set(false);
      this.notice.set({ tone: 'success', text: 'Runner assigned.' });
    } catch (e) {
      const err = e as ApiErrorInfo;
      if (err.status === 409) {
        this.assignOpen.set(false);
        await this.s.loadErrandDetail(this.errandId(), { quiet: true });
        this.notice.set({
          tone: 'info',
          text: 'This task changed while you were editing. Showing the latest.',
        });
      } else if (err.status === 403) {
        this.assignNotice.set({ tone: 'danger', text: FORBIDDEN_COPY });
      } else if (err.status === 404) {
        this.assignNotice.set({ tone: 'info', text: 'That runner or task no longer exists.' });
      } else {
        this.assignNotice.set({ tone: 'danger', text: "Couldn't assign the runner. Try again." });
      }
    } finally {
      this.assigning.set(false);
    }
  }

  protected readonly categoryLabel = categoryLabel;
  protected readonly maskedId = maskedId;
  protected readonly timeAgo = timeAgo;
  protected readonly shortId = shortId;
  protected readonly formatKsh = formatKsh;
  protected readonly formatKshExact = formatKshExact;
  protected readonly formatDateTime = formatDateTime;
  protected readonly deadlineRow = deadlineRow;
  protected readonly statusLabel = statusLabel;
  protected readonly historyActor = historyActor;
}
