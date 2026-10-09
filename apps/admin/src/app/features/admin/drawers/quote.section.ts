import { NumTextComponent } from '../../../shared/num-text.component';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { apiError } from '../../../core/api-error';
import { QUOTE_COMPONENTS, type Errand, type Quote } from '../../../core/api-types';
import { StatusChipComponent } from '../../../shared/status-chip.component';
import { InlineNoticeComponent, NoticeTone } from '../../../shared/inline-notice.component';
import { AdminDataService } from '../admin-data.service';
import { formatDateTime, formatKshExact } from '../shared-format';
import { QuoteConflict, QuoteDialogComponent, quoteExpired } from './quote-dialog';
import type { QuoteErrandResult } from '../../../core/api-types';

const COMPONENT_LABELS: Record<string, string> = {
  baseFee: 'Base fee',
  distanceFee: 'Distance fee',
  timeFee: 'Time fee',
  urgencyFee: 'Urgency fee',
  complexityFee: 'Complexity fee',
  premiumFee: 'Premium fee',
};

/** States with no quote section (no quote yet). */
const NO_QUOTE: string[] = ['DRAFT', 'REQUESTED'];

/**
 * Whether `Issue new quote` is offered (drawer-task-requote "Task states").
 * QUOTED with an expired quote; ACCEPTED with an expired quote only when
 * the API supports it (row 72, feat/api-owner-answers-3: detected by the
 * round-3 `quoteAcceptanceRequired` field on the errand).
 */
export function canRequote(errand: Errand, quote: Quote | null, now: number): boolean {
  if (!quoteExpired(quote, now)) return false;
  if (errand.status === 'QUOTED') return true;
  return errand.status === 'ACCEPTED' && acceptedRequoteSupported(errand);
}

export function acceptedRequoteSupported(errand: Errand): boolean {
  return typeof errand.quoteAcceptanceRequired === 'boolean';
}

/**
 * Quote section of the task drawer: current quote, expiry flag and the
 * `Issue new quote` action for an expired quote (row 46). Expiry is
 * re-evaluated every 30 s.
 */
@Component({
  selector: 'app-quote-section',
  imports: [NumTextComponent, StatusChipComponent, InlineNoticeComponent, QuoteDialogComponent],
  template: `
    @if (visible()) {
      <section class="drawer-section">
        <div class="drawer-label">Quote</div>
        @if (notice(); as n) {
          <app-inline-notice
            [tone]="n.tone"
            [dismissible]="true"
            [autoDismissMs]="n.tone === 'success' ? 6000 : 0"
            (dismissed)="notice.set(null)"
            ><app-num-text [text]="n.text"
          /></app-inline-notice>
        }
        @if (loading() && !quote()) {
          <div class="ops-loading">Loading quote…</div>
        } @else if (loadFailed()) {
          <div class="drawer-caption">
            Couldn't load the quote.
            <button type="button" class="btn btn-text btn-sm" (click)="load()">Try again</button>
          </div>
        } @else if (quote(); as q) {
          <div class="drawer-card">
            <div class="drawer-row">
              <span>Quoted total</span><b>{{ formatKshExact(q.total) }}</b>
            </div>
            <div class="drawer-row">
              <span>Issued</span><b>{{ formatDateTime(q.createdAt) }}</b>
            </div>
            <div class="drawer-row">
              @if (expired()) {
                <span>Expired</span>
                <span class="row-inline">
                  <b>{{ formatDateTime(q.expiresAt) }}</b>
                  <app-status-chip label="Quote expired" tone="pending" />
                </span>
              } @else if (q.expiresAt) {
                <span>Valid until</span><b>{{ formatDateTime(q.expiresAt) }}</b>
              } @else {
                <span>Valid until</span><span class="val-muted">No expiry</span>
              }
            </div>
            @if (showBreakdown()) {
              @for (row of breakdown(); track row.label) {
                <div class="drawer-row">
                  <span>{{ row.label }}</span
                  ><b>{{ formatKshExact(row.value) }}</b>
                </div>
              }
            }
            <div class="drawer-card-foot">
              <button
                type="button"
                class="btn btn-text btn-sm"
                [attr.aria-expanded]="showBreakdown()"
                (click)="showBreakdown.set(!showBreakdown())"
              >
                {{ showBreakdown() ? 'Hide fee breakdown' : 'Show fee breakdown' }}
              </button>
            </div>
          </div>
          @if (requote()) {
            <div class="drawer-actions">
              <button type="button" class="btn btn-primary" (click)="dialogOpen.set(true)">
                Issue new quote
              </button>
            </div>
          } @else if (errand().status === 'QUOTED' && q.expiresAt && !expired()) {
            <div class="drawer-caption">
              You can issue a new quote after this one expires at
              <span class="num">{{ formatDateTime(q.expiresAt) }}</span
              >.
            </div>
          } @else if (errand().status === 'ACCEPTED' && expired()) {
            <div class="drawer-caption">
              This quote expired after the customer accepted it. They can't pay until it is
              re-quoted.
            </div>
          }
        }
      </section>

      <app-quote-dialog
        [open]="dialogOpen()"
        [errandId]="errand().id"
        [previous]="quote()"
        [errandStatus]="errand().status"
        (closed)="dialogOpen.set(false)"
        (issued)="onIssued($event)"
        (conflict)="onConflict($event)"
      />
    }
  `,
  styles: [],
})
export class QuoteSectionComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly s = inject(AdminDataService);

  readonly errand = input.required<Errand>();

  protected readonly quote = signal<Quote | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly notFound = signal(false);
  protected readonly showBreakdown = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly notice = signal<{ tone: NoticeTone; text: string } | null>(null);
  protected readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;
  private loadedFor = '';

  protected readonly visible = computed(
    () => !NO_QUOTE.includes(this.errand().status) && !this.notFound(),
  );
  protected readonly expired = computed(() => quoteExpired(this.quote(), this.now()));
  protected readonly requote = computed(() => canRequote(this.errand(), this.quote(), this.now()));
  protected readonly breakdown = computed(() => {
    const q = this.quote();
    if (!q) return [];
    return QUOTE_COMPONENTS.filter((k) => Number(q[k]) > 0).map((k) => ({
      label: COMPONENT_LABELS[k],
      value: q[k],
    }));
  });

  constructor() {
    // Reload when the errand's quote may have changed (first quote, re-quote
    // elsewhere, status change), keeping the current quote on screen.
    effect(() => {
      const e = this.errand();
      const key = `${e.id}|${e.status}|${e.quotedPrice ?? ''}|${e.quoteExpiresAt ?? ''}`;
      if (key !== this.loadedFor && !NO_QUOTE.includes(e.status)) {
        this.loadedFor = key;
        untracked(() => void this.load());
      }
    });
  }

  ngOnInit(): void {
    this.timer = setInterval(() => this.now.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async load(): Promise<void> {
    const id = this.errand().id;
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const q = await firstValueFrom(this.api.getQuote(id));
      if (id !== this.errand().id) return;
      this.quote.set(q);
      this.notFound.set(false);
      this.now.set(Date.now());
    } catch (e) {
      if (id !== this.errand().id) return;
      if (apiError(e).status === 404) {
        this.notFound.set(true);
      } else {
        this.loadFailed.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected onIssued(res: QuoteErrandResult): void {
    this.dialogOpen.set(false);
    this.quote.set(res.quote);
    this.now.set(Date.now());
    this.notice.set({
      tone: 'success',
      text: `New quote issued: ${formatKshExact(res.quote.total)}, valid until ${formatDateTime(res.quote.expiresAt)}.`,
    });
  }

  protected async onConflict({ error }: QuoteConflict): Promise<void> {
    this.dialogOpen.set(false);
    if (error.code === 'quote_still_valid') {
      await this.load();
      const until = (error.extra['expiresAt'] as string | null) ?? this.quote()?.expiresAt ?? null;
      this.notice.set({
        tone: 'info',
        text: `The current quote is still valid until ${formatDateTime(until)}. You can replace it after it expires.`,
      });
      return;
    }
    await this.s.loadErrandDetail(this.errand().id, { quiet: true });
    await this.load();
    this.notice.set({
      tone: 'info',
      text: 'This task changed while you were editing. Showing the latest.',
    });
  }

  protected readonly formatKshExact = formatKshExact;
  protected readonly formatDateTime = formatDateTime;
}
