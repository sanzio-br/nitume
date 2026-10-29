// customer `x-merchant-payment` (customer-x-merchant-payment.md): the item
// amount, kept apart from the fees (three flows, A§4, WQ-27).
// - Variant A, `merchant_direct`: the merchant's Till / Paybill to pay from
//   the customer's own M-Pesa. The numbers render only when the errand is
//   paid (PAYMENT_CONFIRMED or later, A§2), the main payment is `completed`
//   and the number is non-null (OA-5; the server withholds them before,
//   #28). Never read from the errand view or a socket payload.
// - Variant B, `send_to_runner`: an approved price-change increase charged to
//   Nitume by STK (`nm-stk-status`), retried only by a click.
// - Nothing due: toast and leave.
import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { formatDayTime, formatKes, isPositiveKes, kesSpoken } from '../../../shared/format/formatters';
import { NmNum } from '../../../shared/format/num.directive';
import { parseErrandStatus } from '../../../shared/status/status-presentation';
import { NmButton } from '../../../shared/ui/button/button.component';
import { NmCard } from '../../../shared/ui/card/card.component';
import { NmCopyRow } from '../../../shared/ui/copy-row/copy-row.component';
import { NmFixedCta, NmFixedCtaOffset } from '../../../shared/ui/fixed-cta/fixed-cta.component';
import { safeExternalUrl } from '../../../shared/ui/links';
import { NmNotice } from '../../../shared/ui/notice/notice.component';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { NmPushedHeader } from '../../../shared/ui/pushed-header/pushed-header.component';
import { NmErrorState } from '../../../shared/ui/states/error-state.component';
import { friendlyError } from '../../../shared/ui/states/friendly-error';
import { NmSkeletonCard } from '../../../shared/ui/states/skeleton-card.component';
import { APP_LINKS } from '../../app-links';
import { CUSTOMER_NOW } from '../clock';
import { customerLinks } from '../customer-links';
import { CheckoutApi, DifferencePaymentView, MerchantPaymentView, PaymentSummary, StkStatus } from '../data/checkout.api';
import { NmStkStatus, STK_COPY, StkButton, StkTone } from '../shared/stk-status.component';
import { checkoutRedirect } from './checkout-routing';
import { CHECKOUT_TIMERS } from './checkout-timers';
import { STK_FAST_FOR_MS, STK_FAST_MS, STK_SLOW_MS, STK_STOP_AFTER_MS, stkStateOf } from './stk';

export const MERCHANT_COPY = {
  titleA: 'Pay the merchant',
  titleB: 'Pay the item amount',
  documentTitleA: 'Pay the merchant · Nitume',
  introHeading: 'Pay the merchant directly',
  introBody: "Pay this amount from your M-Pesa straight to the merchant. It's separate from the fees you've already paid.",
  merchant: 'Merchant',
  till: 'Till number (Buy Goods)',
  paybill: 'Paybill number',
  account: 'Account number',
  amount: 'Amount',
  howTill: 'On M-Pesa, choose Lipa na M-PESA → Buy Goods and Services, enter the Till number and amount.',
  howPaybill: 'On M-Pesa, choose Lipa na M-PESA → Pay Bill, enter the Paybill number, account number and amount.',
  done: 'Done',
  pending: "The merchant's details aren't available yet. We'll notify you when they are.",
  changedLead: "The merchant's payment details changed on ",
  changedEnd: '. Check the number below before you pay.',
  oldNumber: 'Already paid the old number?',
  support: 'Contact support',
  bodyB: 'Enter your M-Pesa PIN on the prompt sent to your phone to pay for the items.',
  successHeading: 'Item amount paid',
  successBody: 'Thanks. Your runner can go ahead with the purchase.',
  loadError: "Couldn't load the payment details.",
  nothingDue: 'Nothing to pay right now.',
} as const;

type DirectView = Extract<MerchantPaymentView, { route: 'merchant_direct' }>;

type Variant =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'direct'; readonly merchant: DirectView; readonly paid: boolean; readonly increase: string | null }
  | { readonly kind: 'difference'; readonly difference: DifferencePaymentView };

/** Paid to Nitume: `paidTo === 'nitume'`, else the `customer_to_runner` flow. */
function toNitume(d: DifferencePaymentView): boolean {
  return d.merchantPayment ? d.merchantPayment.paidTo === 'nitume' : d.payment.paymentFlow === 'customer_to_runner';
}

function isDirect(d: DifferencePaymentView): boolean {
  return d.merchantPayment ? d.merchantPayment.route === 'merchant_direct' : d.payment.paymentFlow === 'merchant_direct';
}

function positive(amount: string | null | undefined): boolean {
  try {
    return !!amount && isPositiveKes(amount);
  } catch {
    return false;
  }
}

/** Digits for the clipboard: `40000.00` → `40000`, `40000.50` → `40000.50`. */
function copyDigits(amount: string): string {
  return amount.trim().replace(/,/g, '').replace(/\.00?$/, '');
}

@Component({
  selector: 'app-merchant-payment-page',
  imports: [NmPushedHeader, NmSkeletonCard, NmErrorState, NmCard, NmCopyRow, NmNotice, NmButton, NmFixedCta, NmNum, NmStkStatus],
  templateUrl: './merchant-payment.page.html',
  styleUrl: './merchant-payment.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:visibilitychange)': 'onVisibility()' },
})
export class MerchantPaymentPage {
  private readonly api = inject(CheckoutApi);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly realtime = inject(RealtimeService);
  private readonly toast = inject(NmToastService);
  private readonly offsets = inject(NmFixedCtaOffset);
  private readonly timers = inject(CHECKOUT_TIMERS);
  private readonly now = inject(CUSTOMER_NOW);
  private readonly title = inject(Title);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly activatedRoute = inject(ActivatedRoute);
  /** The current errand; follows `paramMap` (A§1 "Same route, another errand"). */
  protected id = '';
  protected readonly copy = MERCHANT_COPY;
  protected get trackLink(): string {
    return customerLinks.track(this.id);
  }
  protected readonly supportUrl = safeExternalUrl(inject(APP_LINKS).customer.supportUrl);

  protected readonly variant = signal<Variant>({ kind: 'loading' });
  protected readonly checking = signal(false);
  protected readonly retrying = signal(false);
  protected readonly stillPending = signal(false);

  /** Navigation state from the price-change dialog (read once). */
  /** Navigation state from the price-change dialog, read again for every errand. */
  private approvedIncrease: string | null = null;
  private stateRequestId: string | null = null;
  private openedAt = this.now();
  private pollHandle: unknown = null;
  private dropped = false;
  private destroyed = false;
  private titled = false;

  protected readonly direct = computed(() => {
    const v = this.variant();
    return v.kind === 'direct' ? v : null;
  });
  /** OA-5 client rule (defence in depth): paid + main payment completed + a number. */
  protected readonly details = computed(() => {
    const d = this.direct();
    if (!d || !d.paid) return null;
    const m = d.merchant;
    if (m.tillNumber) return { kind: 'till' as const, till: m.tillNumber, name: m.merchantName };
    if (m.paybillNumber) return { kind: 'paybill' as const, paybill: m.paybillNumber, account: m.accountReference, name: m.merchantName };
    return null;
  });
  protected readonly changedAt = computed(() => {
    const m = this.direct()?.merchant;
    if (!m || !m.merchantDetailsChangedAfterPayment || !m.merchantDetailsUpdatedAt) return null;
    return formatDayTime(m.merchantDetailsUpdatedAt, this.now());
  });
  protected readonly amountText = computed(() => {
    const d = this.direct();
    return d ? formatKes(d.merchant.amount) : null;
  });
  protected readonly amountSpoken = computed(() => {
    const d = this.direct();
    return d ? kesSpoken(d.merchant.amount) : null;
  });
  protected readonly amountCopy = computed(() => {
    const d = this.direct();
    return d ? copyDigits(d.merchant.amount) : null;
  });
  protected readonly increaseText = computed(() => {
    const inc = this.direct()?.increase;
    return inc ? formatKes(inc) : null;
  });

  protected readonly difference = computed(() => {
    const v = this.variant();
    return v.kind === 'difference' ? v.difference : null;
  });
  protected readonly stk = computed<StkStatus | null>(() => {
    const d = this.difference();
    return d ? stkStateOf(d, this.now()) : null;
  });
  protected readonly tone = computed<StkTone>(() => {
    const s = this.stk();
    return s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'failed' : 'waiting';
  });
  protected readonly stkHeading = computed(() => {
    switch (this.stk()) {
      case 'SUCCESS':
        return MERCHANT_COPY.successHeading;
      case 'FAILED':
        return STK_COPY.failedHeading;
      case 'TIMEOUT':
        return STK_COPY.timeoutHeading;
      default:
        return STK_COPY.checkPhone;
    }
  });
  protected readonly stkBody = computed(() => {
    switch (this.stk()) {
      case 'SUCCESS':
        return MERCHANT_COPY.successBody;
      case 'FAILED':
        return STK_COPY.failedBody;
      case 'TIMEOUT':
        return STK_COPY.timeoutBody;
      default:
        return MERCHANT_COPY.bodyB;
    }
  });
  protected readonly primary = computed<StkButton | null>(() => {
    switch (this.stk()) {
      case 'SUCCESS':
        return { label: MERCHANT_COPY.done };
      case 'FAILED':
        return { label: STK_COPY.tryAgain, loading: this.retrying(), disabled: this.checking() };
      case 'TIMEOUT':
        return { label: STK_COPY.checkAgain, loading: this.checking(), disabled: this.retrying() };
      default:
        return { label: STK_COPY.paid, loading: this.checking(), disabled: this.retrying() };
    }
  });
  protected readonly secondary = computed<StkButton | null>(() => {
    switch (this.stk()) {
      case 'FAILED':
        return { label: STK_COPY.back, disabled: this.retrying() || this.checking() };
      case 'TIMEOUT':
        return { label: STK_COPY.newPrompt, loading: this.retrying(), disabled: this.checking() };
      default:
        return null;
    }
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const mine = <T extends { errandId: string }>(e: T) => e.errandId === this.id;
    // Socket payloads only trigger a re-read; nothing in them is rendered (#28).
    this.realtime.statusChanges$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.merchantDetailsUpdates$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.merchantDetailsChanges$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.priceDifferencePayments$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.accessRevocations$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.onStateChange((s) => {
      if (s === 'reconnecting' || s === 'disconnected') this.dropped = true;
      else if (s === 'connected' && this.dropped) {
        this.dropped = false;
        void this.load();
      }
    }, destroyRef);
    destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.clearPoll();
      if (this.id) this.realtime.leaveErrand(this.id);
    });
    // A§1: the page is reused when only `:errandId` changes; start over for each id.
    this.activatedRoute.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.startFor(params.get('errandId') ?? ''));
  }

  /** Stops the previous errand's polls, leaves its room, clears the view (no old Till on screen), then reads the new one. */
  private startFor(id: string): void {
    if (id === this.id) return;
    if (this.id) this.realtime.leaveErrand(this.id);
    this.clearPoll();
    this.id = id;
    this.variant.set({ kind: 'loading' });
    this.checking.set(false);
    this.retrying.set(false);
    this.stillPending.set(false);
    this.titled = false;
    this.openedAt = this.now();
    const state = this.router.currentNavigation()?.extras.state as { approvedIncrease?: unknown; priceChangeRequestId?: unknown } | undefined;
    this.approvedIncrease = typeof state?.approvedIncrease === 'string' && positive(state.approvedIncrease) ? state.approvedIncrease : null;
    this.stateRequestId = typeof state?.priceChangeRequestId === 'string' ? state.priceChangeRequestId : null;
    void this.realtime.joinErrand(id);
    void this.load();
  }

  /** True once the page left `id` (another errand or destroyed): late answers are dropped. */
  private gone(id: string): boolean {
    return this.destroyed || id !== this.id;
  }

  protected retry(): void {
    this.variant.set({ kind: 'loading' });
    void this.load();
  }

  protected onVisibility(): void {
    if (document.visibilityState === 'visible' && this.followingStk()) void this.load();
  }

  /** `Done` / `Back`: history when the previous page is in `/app`, else Track. */
  protected done(): void {
    const previous = this.router.lastSuccessfulNavigation()?.previousNavigation?.finalUrl;
    const url = previous ? this.router.serializeUrl(previous) : null;
    if (url && url.startsWith('/app/')) this.location.back();
    else void this.router.navigateByUrl(this.trackLink, { replaceUrl: true });
  }

  protected onPrimary(): void {
    switch (this.stk()) {
      case 'SUCCESS':
        this.done();
        break;
      case 'FAILED':
        void this.retryDifference();
        break;
      default:
        void this.load(true);
    }
  }

  protected onSecondary(): void {
    if (this.stk() === 'TIMEOUT') void this.retryDifference();
    else this.done();
  }

  /** `GET /errands/:id` (A§2) and `GET /payments/:errandId`, then the variant. */
  private async load(manual = false): Promise<void> {
    if (manual) {
      if (this.checking()) return;
      this.checking.set(true);
    }
    const id = this.id;
    const first = this.variant().kind === 'loading' || this.variant().kind === 'error';
    try {
      const [errand, summary] = await Promise.all([this.api.errand(id), this.api.payments(id)]);
      if (this.gone(id)) return;
      const status = parseErrandStatus(errand?.status);
      if (!status) throw new Error('unknown status');
      const redirect = checkoutRedirect('item-payment', status, id);
      if (redirect) {
        void this.router.navigateByUrl(redirect, { replaceUrl: true });
        return;
      }
      this.applySummary(summary);
      if (manual && this.stk() === 'PENDING') this.stillPending.set(true);
    } catch (err) {
      if (this.gone(id)) return;
      // A refresh error keeps the content and retries on the next tick.
      if (first) this.variant.set({ kind: 'error' });
      else if (manual) this.showToast(friendlyError(err));
      this.schedulePoll();
    } finally {
      if (manual && !this.gone(id)) this.checking.set(false);
    }
  }

  /** "Which variant" 1–4. */
  private applySummary(summary: PaymentSummary): void {
    const diffs = (summary.differencePayments ?? []).filter(toNitume);
    const outstanding = diffs.find((d) => d.payment.status !== 'completed') ?? null;
    const main = summary.merchantPayment;
    if (outstanding || (diffs.length > 0 && main?.route !== 'merchant_direct')) {
      this.showDifference(outstanding ?? diffs[0]);
      return;
    }
    if (main?.route === 'merchant_direct' && positive(main.amount)) {
      const derived = (summary.differencePayments ?? []).find((d) => isDirect(d) && positive(d.payment.merchantAmount));
      this.variant.set({
        kind: 'direct',
        merchant: main,
        paid: summary.payment?.status === 'completed',
        increase: this.approvedIncrease ?? derived?.payment.merchantAmount ?? null,
      });
      if (!this.titled) {
        this.titled = true;
        this.title.setTitle(MERCHANT_COPY.documentTitleA);
      }
      this.clearPoll();
      return;
    }
    this.nothingDue();
  }

  private showDifference(difference: DifferencePaymentView): void {
    const before = this.stk();
    this.variant.set({ kind: 'difference', difference });
    const after = this.stk();
    if (after !== 'PENDING') this.stillPending.set(false);
    if (before !== null && before !== after) this.refocus();
    this.schedulePoll();
  }

  /** `POST …/price-changes/:requestId/initiate` (a click only); without a request id, a re-read. */
  private async retryDifference(): Promise<void> {
    const requestId = this.stateRequestId ?? this.difference()?.payment.priceChangeRequestId ?? null;
    if (!requestId) {
      void this.load(true);
      return;
    }
    if (this.retrying()) return;
    const id = this.id;
    this.retrying.set(true);
    try {
      const result = await this.api.retryDifference(id, requestId);
      if (!this.gone(id)) this.showDifference(result);
    } catch (err) {
      if (!this.gone(id)) this.showToast(friendlyError(err));
    } finally {
      if (!this.gone(id)) this.retrying.set(false);
    }
  }

  private nothingDue(): void {
    this.clearPoll();
    this.showToast(MERCHANT_COPY.nothingDue);
    this.done();
  }

  private followingStk(): boolean {
    const s = this.stk();
    return s === 'PENDING' || s === 'TIMEOUT';
  }

  /** Variant B: 5 s, then 30 s after 2 min, stopping 10 min after the page opened; skipped while hidden. */
  private schedulePoll(): void {
    this.clearPoll();
    if (this.variant().kind !== 'difference' || !this.followingStk()) return;
    const age = this.now().getTime() - this.openedAt.getTime();
    if (age >= STK_STOP_AFTER_MS) return;
    this.pollHandle = this.timers.setTimeout(
      () => {
        this.pollHandle = null;
        if (document.visibilityState === 'visible') void this.load();
        else this.schedulePoll();
      },
      age < STK_FAST_FOR_MS ? STK_FAST_MS : STK_SLOW_MS,
    );
  }

  private clearPoll(): void {
    if (this.pollHandle !== null) this.timers.clearTimeout(this.pollHandle);
    this.pollHandle = null;
  }

  private showToast(message: string): void {
    this.toast.show(message, { offset: this.offsets.toastOffset() });
  }

  private refocus(): void {
    setTimeout(() => {
      const active = this.host.ownerDocument.activeElement;
      if (active && active !== this.host.ownerDocument.body && this.host.contains(active)) return;
      this.host.querySelector<HTMLElement>('.nm-stk__heading')?.focus();
    });
  }
}
