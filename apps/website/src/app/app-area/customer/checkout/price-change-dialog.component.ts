// customer `v-price-auth` (customer-v-price-auth.md): the price-change
// authorisation, hosted by `NmDialogService` (`dismissible: false`, 335px,
// title `Price change`). The runner found the item priced differently; the
// customer approves the new item amount or rejects it, which cancels the
// task (OA-8). Item amounts only, never fees (WQ-27): the difference comes
// from `subtractKes`, increase vs decrease from `compareKes`.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { compareKes, formatAmount, formatKes, subtractKes } from '../../../shared/format/formatters';
import { NmNum } from '../../../shared/format/num.directive';
import { NmButton } from '../../../shared/ui/button/button.component';
import { NmDialogService } from '../../../shared/ui/overlay/dialog.service';
import { NM_OVERLAY_DATA, NmOverlayRef } from '../../../shared/ui/overlay/overlay-ref';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { NmSkeletonCard } from '../../../shared/ui/states/skeleton-card.component';
import { customerLinks } from '../customer-links';
import { CheckoutApi, MerchantRoute, PriceChangeDecision, PriceChangeRequest } from '../data/checkout.api';
import { ErrandView, apiErrorOf } from '../data/errands.api';
import { NmMerchantRouteRows } from '../shared/merchant-route-rows.component';

export interface PriceChangeDialogData {
  readonly errandId: string;
  /** The errand (status, runner short name, merchant details flag) when known. */
  readonly errand?: (ErrandView & { readonly merchantDetailsAvailable?: boolean }) | null;
  /** The pending request when known; otherwise the dialog reads it. */
  readonly request?: PriceChangeRequest | null;
}

export type PriceChangeDialogResult = 'approved' | 'rejected';

export const PRICE_COPY = {
  title: 'Price change',
  original: 'Original',
  newPrice: 'New price',
  approveNew: 'Approve new price',
  reject: 'Reject & cancel task',
  routeLabel: 'How should this be paid?',
  confirmTitle: 'Reject and cancel this task?',
  confirmBody: "The runner will stop work on this task. We'll review a refund of what you've paid, and you can follow it on the task.",
  confirmReject: 'Reject & cancel',
  goBack: 'Go back',
  approved: 'Price change approved.',
  approvedRefund: "Price change approved. We'll review a refund of the difference.",
  answered: 'This price change was already answered.',
  ok: 'OK',
  loadFailed: "Couldn't load this price change.",
  tryAgain: 'Try again',
  close: 'Close',
  sendFailed: "Couldn't send your answer. Try again.",
} as const;

const ANSWERED_CODES = ['price_change_already_decided', 'price_change_not_in_progress', 'price_change_not_allowed'];

type State = 'loading' | 'load-error' | 'ready' | 'answered';

@Component({
  selector: 'app-price-change-dialog',
  imports: [NmNum, NmButton, NmSkeletonCard, NmMerchantRouteRows],
  template: `
    @switch (state()) {
      @case ('loading') {
        <nm-skeleton-card class="pc__skeleton" [height]="120" />
      }
      @case ('load-error') {
        <p class="pc__body">{{ copy.loadFailed }}</p>
        <div class="pc__actions">
          <nm-button class="pc__retry" [expand]="true" (pressed)="load()">{{ copy.tryAgain }}</nm-button>
          <nm-button class="pc__close" variant="outline" [expand]="true" (pressed)="ref.close()">{{ copy.close }}</nm-button>
        </div>
      }
      @case ('answered') {
        <p class="pc__body">{{ copy.answered }}</p>
        <div class="pc__actions">
          <nm-button class="pc__ok" [expand]="true" (pressed)="ref.close()">{{ copy.ok }}</nm-button>
        </div>
      }
      @default {
        @if (request(); as r) {
          <p class="pc__body">{{ body() }}</p>
          @if (reason(); as why) {
            <p class="pc__reason">"{{ why }}"</p>
          }
          <div class="pc__compare">
            <div class="pc__col" role="group" [attr.aria-label]="originalLabel()">
              <span class="pc__label" aria-hidden="true">{{ copy.original }}</span>
              <span class="pc__value pc__value--original" nmNum aria-hidden="true">{{ fromText() }}</span>
            </div>
            <span class="pc__arrow" aria-hidden="true">→</span>
            <div class="pc__col" role="group" [attr.aria-label]="newLabel()">
              <span class="pc__label" aria-hidden="true">{{ copy.newPrice }}</span>
              <span class="pc__value pc__value--new" nmNum aria-hidden="true">{{ toText() }}</span>
            </div>
          </div>
          <p class="pc__difference" nmNum>{{ differenceText() }}</p>
          @if (routeNeeded()) {
            <p class="pc__route-label">{{ copy.routeLabel }}</p>
            <nm-merchant-route-rows
              [selected]="route()"
              [merchantDetailsAvailable]="merchantDetailsAvailable()"
              [disabled]="busy()"
              [ariaLabel]="copy.routeLabel"
              (selectedChange)="route.set($event)"
            />
          }
          <div class="pc__actions">
            <nm-button class="pc__approve" [expand]="true" [loading]="approving()" [disabled]="rejecting() || (routeNeeded() && !route())" (pressed)="approve()">
              @if (increase()) {
                Approve <span nmNum>{{ diffKes() }}</span> increase
              } @else {
                {{ copy.approveNew }}
              }
            </nm-button>
            <nm-button class="pc__reject" variant="outline" [destructive]="true" [expand]="true" [loading]="rejecting()" [disabled]="approving()" (pressed)="reject()">{{
              copy.reject
            }}</nm-button>
          </div>
        }
      }
    }
  `,
  styleUrl: './price-change-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceChangeDialogComponent {
  protected readonly ref = inject(NmOverlayRef) as NmOverlayRef<PriceChangeDialogResult>;
  private readonly data = inject(NM_OVERLAY_DATA) as PriceChangeDialogData;
  private readonly api = inject(CheckoutApi);
  private readonly dialogs = inject(NmDialogService);
  private readonly toast = inject(NmToastService);
  private readonly router = inject(Router);

  protected readonly copy = PRICE_COPY;
  protected readonly state = signal<State>('loading');
  protected readonly request = signal<PriceChangeRequest | null>(null);
  protected readonly routeNeeded = signal(false);
  protected readonly route = signal<MerchantRoute | null>(null);
  protected readonly approving = signal(false);
  protected readonly rejecting = signal(false);

  protected readonly busy = computed(() => this.approving() || this.rejecting());
  protected readonly merchantDetailsAvailable = computed(() => this.data.errand?.merchantDetailsAvailable === true);
  private readonly runner = this.data.errand?.assignment?.runner?.shortName?.trim() || 'Your runner';

  /** Decrease only when `toPrice < fromPrice` (decimal strings). */
  protected readonly increase = computed(() => {
    const r = this.request();
    return !!r && compareKes(r.toPrice, r.fromPrice) >= 0;
  });
  protected readonly body = computed(() =>
    this.increase()
      ? `${this.runner} found the item priced higher than quoted. Approve the difference to continue?`
      : `${this.runner} found the item priced lower than quoted. Approve the new price to continue?`,
  );
  protected readonly reason = computed(() => this.request()?.reason?.trim() || null);
  protected readonly fromText = computed(() => formatAmount(this.request()?.fromPrice ?? '0'));
  protected readonly toText = computed(() => formatAmount(this.request()?.toPrice ?? '0'));
  protected readonly originalLabel = computed(() => `${PRICE_COPY.original} ${formatKes(this.request()?.fromPrice ?? '0')}`);
  protected readonly newLabel = computed(() => `${PRICE_COPY.newPrice} ${formatKes(this.request()?.toPrice ?? '0')}`);
  /** The difference, positive, as a decimal string. */
  private readonly diff = computed(() => {
    const r = this.request();
    if (!r) return '0.00';
    return this.increase() ? subtractKes(r.toPrice, r.fromPrice) : subtractKes(r.fromPrice, r.toPrice);
  });
  protected readonly diffKes = computed(() => formatKes(this.diff()));
  protected readonly differenceText = computed(() =>
    this.increase() ? `${formatKes(this.diff(), { signed: true })} additional` : `− ${formatKes(this.diff())} less`,
  );

  constructor() {
    inject(RealtimeService)
      .statusChanges$.pipe(takeUntilDestroyed())
      .subscribe((e) => {
        if (e.errandId === this.data.errandId && e.status === 'CANCELLED' && this.state() !== 'answered') this.answered();
      });
    const status = this.data.errand?.status;
    if (status && status !== 'IN_PROGRESS') this.state.set('answered');
    else if (this.data.request) this.ready(this.data.request);
    else void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const pending = await this.api.pendingPriceChanges(this.data.errandId);
      const first = Array.isArray(pending) ? (pending[0] ?? null) : null;
      if (first && first.status === 'requested') this.ready(first);
      else this.answered();
    } catch {
      this.state.set('load-error');
    }
  }

  protected async approve(): Promise<void> {
    const r = this.request();
    if (!r || this.busy() || (this.routeNeeded() && !this.route())) return;
    this.approving.set(true);
    this.ref.setError(null);
    let decision: PriceChangeDecision;
    try {
      decision = await this.api.approvePriceChange(this.data.errandId, r.id, this.route() ?? undefined);
    } catch (err) {
      this.approving.set(false);
      const e = apiErrorOf(err);
      if (e.code === 'merchant_route_required' || e.code === 'merchant_details_missing') this.routeNeeded.set(true);
      else this.onAnswerError(e.status, e.code);
      return;
    }
    this.approving.set(false);
    this.ref.close('approved');
    this.toast.show(decision.refundReview ? PRICE_COPY.approvedRefund : PRICE_COPY.approved);
    const difference = decision.differencePayment;
    if (difference?.merchantPayment) {
      void this.router.navigateByUrl(customerLinks.itemPayment(this.data.errandId), {
        state: { approvedIncrease: difference.payment.merchantAmount, priceChangeRequestId: decision.id },
      });
    }
  }

  protected async reject(): Promise<void> {
    const r = this.request();
    if (!r || this.busy()) return;
    const ok = await this.dialogs.confirm({
      title: PRICE_COPY.confirmTitle,
      body: PRICE_COPY.confirmBody,
      confirmLabel: PRICE_COPY.confirmReject,
      cancelLabel: PRICE_COPY.goBack,
      destructive: true,
      dismissible: false,
    });
    if (!ok) return;
    this.rejecting.set(true);
    this.ref.setError(null);
    try {
      await this.api.rejectPriceChange(this.data.errandId, r.id);
      this.rejecting.set(false);
      this.ref.close('rejected');
    } catch (err) {
      this.rejecting.set(false);
      const e = apiErrorOf(err);
      this.onAnswerError(e.status, e.code);
    }
  }

  private ready(request: PriceChangeRequest): void {
    this.request.set(request);
    this.state.set('ready');
  }

  private answered(): void {
    this.ref.setError(null);
    this.state.set('answered');
  }

  /** Already answered for the decided codes and any other 409 (except reject-not-cancellable); else the inline error. */
  private onAnswerError(status: number, code: string | null): void {
    if (code && ANSWERED_CODES.includes(code)) this.answered();
    else if (status === 409 && code !== 'price_change_reject_not_cancellable') this.answered();
    else this.ref.setError(PRICE_COPY.sendFailed);
  }
}
