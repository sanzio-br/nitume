// customer `v-payment` (customer-v-payment.md): the M-Pesa STK push for the
// fees (plus the item amount for `send_to_runner`, one charge, row 76),
// followed to PENDING, SUCCESS, FAILED or TIMEOUT. Owner WQ-28: a prompt is
// sent only with the in-app intent (checkout CTA, Home `Pay now →`) or by a
// click here; a reload, link or second tab shows the stored payment's state
// or returns to the checkout. The `Idempotency-Key` lives in memory
// (PaymentAttemptStore). The amount is computed from the payment record's
// separate fields with `addKes` (WQ-27); the initiate body carries none.
import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionStore } from '../../../core/auth/session.store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { addKes, formatPhoneIntl, isPositiveKes } from '../../../shared/format/formatters';
import { parseErrandStatus } from '../../../shared/status/status-presentation';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { NmPulsingDots } from '../../../shared/ui/pulsing-dots/pulsing-dots.component';
import { NmPushedHeader } from '../../../shared/ui/pushed-header/pushed-header.component';
import { NmErrorState } from '../../../shared/ui/states/error-state.component';
import { friendlyError } from '../../../shared/ui/states/friendly-error';
import { CUSTOMER_NOW } from '../clock';
import { customerLinks } from '../customer-links';
import { CheckoutApi, InitiateBody, MerchantRoute, Payment, StkStatus } from '../data/checkout.api';
import { apiErrorOf } from '../data/errands.api';
import { NmStkStatus, STK_COPY, StkButton, StkTone } from '../shared/stk-status.component';
import { CheckoutIntent, CheckoutIntentStore } from './checkout-intent.store';
import { checkoutRedirect } from './checkout-routing';
import { CHECKOUT_TIMERS } from './checkout-timers';
import { PaymentAttemptStore } from './payment-attempt.store';
import { STK_FAST_MS, STK_SLOW_MS, SUCCESS_DELAY_MS, StkResult, stkPollDelay, stkStateOf } from './stk';

export { STK_FAST_MS, STK_SLOW_MS, SUCCESS_DELAY_MS };

export const PAYMENT_COPY = {
  loading: 'Loading',
  loadError: "Couldn't load this payment.",
  bodyLead: 'Enter your M-Pesa PIN on the prompt sent to ',
  bodyEnd: ' to confirm this payment.',
  bodyUnknown: 'Enter your M-Pesa PIN on the prompt sent to your phone to confirm this payment.',
  sending: 'Sending prompt…',
  successHeading: 'Payment received',
  successBody: "Thanks. We're finding a runner for your task.",
  initiateErrorHeading: "Couldn't send the prompt",
  initiateErrorBody: 'Check your connection and try again.',
} as const;

export type PaymentPhase = 'loading' | 'error' | 'initiating' | StkStatus | 'initiate-error';

function routeOf(payment: Payment | null): MerchantRoute | undefined {
  if (payment?.paymentFlow === 'merchant_direct') return 'merchant_direct';
  if (payment?.paymentFlow === 'customer_to_runner') return 'send_to_runner';
  return undefined;
}

@Component({
  selector: 'app-payment-page',
  imports: [NmPushedHeader, NmPulsingDots, NmErrorState, NmStkStatus],
  template: `
    <div class="payment">
      <nm-pushed-header title="Payment" [fallback]="quoteLink" />
      <div class="payment__body">
        @switch (phase()) {
          @case ('loading') {
            <nm-pulsing-dots class="payment__loading" [label]="copy.loading" />
          }
          @case ('error') {
            <nm-error-state class="payment__error" [message]="copy.loadError" (retry)="retry()" />
          }
          @default {
            <nm-stk-status
              class="payment__stk"
              [tone]="tone()"
              [heading]="heading()"
              [body]="body().lead"
              [payer]="body().payer"
              [bodyEnd]="body().end"
              [reason]="phase() === 'FAILED' ? failureReason() : null"
              [amount]="amount()"
              [includes]="includes()"
              [pending]="phase() === 'PENDING'"
              [stillPending]="stillPending() && phase() === 'PENDING'"
              [primary]="primary()"
              [secondary]="secondary()"
              (primaryPressed)="onPrimary()"
              (secondaryPressed)="onSecondary()"
            />
          }
        }
      </div>
    </div>
  `,
  styleUrl: './payment.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:visibilitychange)': 'onVisibility()' },
})
export class PaymentPage {
  private readonly api = inject(CheckoutApi);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly realtime = inject(RealtimeService);
  private readonly session = inject(SessionStore);
  private readonly attempts = inject(PaymentAttemptStore);
  private readonly toast = inject(NmToastService);
  private readonly timers = inject(CHECKOUT_TIMERS);
  private readonly now = inject(CUSTOMER_NOW);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly intents = inject(CheckoutIntentStore);
  /** The current errand; follows `paramMap` (A§1 "Same route, another errand"). */
  protected id = '';
  protected readonly copy = PAYMENT_COPY;
  protected get quoteLink(): string {
    return customerLinks.awaitingQuote(this.id);
  }

  protected readonly phase = signal<PaymentPhase>('loading');
  protected readonly payment = signal<Payment | null>(null);
  protected readonly failureReason = signal<string | null>(null);
  protected readonly payer = signal<string | null>(null);
  protected readonly checking = signal(false);
  protected readonly inFlight = signal(false);
  protected readonly stillPending = signal(false);

  /** Read once (WQ-28): only an in-app click sets it. Kept until it starts a prompt. */
  private intent: CheckoutIntent | null = null;
  private request: InitiateBody = {};
  private keyReused = false;
  private pollHandle: unknown = null;
  private successHandle: unknown = null;
  private dropped = false;
  private destroyed = false;

  protected readonly tone = computed<StkTone>(() => {
    const p = this.phase();
    if (p === 'SUCCESS') return 'success';
    return p === 'FAILED' || p === 'initiate-error' ? 'failed' : 'waiting';
  });
  protected readonly heading = computed(() => {
    switch (this.phase()) {
      case 'SUCCESS':
        return PAYMENT_COPY.successHeading;
      case 'FAILED':
        return STK_COPY.failedHeading;
      case 'TIMEOUT':
        return STK_COPY.timeoutHeading;
      case 'initiate-error':
        return PAYMENT_COPY.initiateErrorHeading;
      default:
        return STK_COPY.checkPhone;
    }
  });
  protected readonly body = computed(() => {
    const none = { payer: null as string | null, end: '' };
    switch (this.phase()) {
      case 'SUCCESS':
        return { lead: PAYMENT_COPY.successBody, ...none };
      case 'FAILED':
        return { lead: STK_COPY.failedBody, ...none };
      case 'TIMEOUT':
        return { lead: STK_COPY.timeoutBody, ...none };
      case 'initiate-error':
        return { lead: PAYMENT_COPY.initiateErrorBody, ...none };
      default: {
        const payer = this.payer();
        return payer
          ? { lead: PAYMENT_COPY.bodyLead, payer, end: PAYMENT_COPY.bodyEnd }
          : { lead: PAYMENT_COPY.bodyUnknown, ...none };
      }
    }
  });
  /** `serviceFee + runnerFee` (+ `merchantAmount` for `customer_to_runner`), A§4. */
  protected readonly amount = computed(() => {
    const p = this.payment();
    if (!p) return null;
    const fees = addKes(p.serviceFee, p.runnerFee);
    return p.paymentFlow === 'customer_to_runner' ? addKes(fees, p.merchantAmount) : fees;
  });
  /** The item amount's own line on this screen (row 91, WQ-27). */
  protected readonly includes = computed(() => {
    const p = this.payment();
    return p && p.paymentFlow === 'customer_to_runner' && isPositiveKes(p.merchantAmount) ? p.merchantAmount : null;
  });
  protected readonly primary = computed<StkButton | null>(() => {
    const busy = this.inFlight() || this.checking();
    switch (this.phase()) {
      case 'initiating':
        return { label: PAYMENT_COPY.sending, disabled: true };
      case 'PENDING':
        return { label: STK_COPY.paid, loading: this.checking(), disabled: this.inFlight() };
      case 'FAILED':
      case 'initiate-error':
        return { label: STK_COPY.tryAgain, loading: this.inFlight(), disabled: this.checking() };
      case 'TIMEOUT':
        return { label: STK_COPY.checkAgain, loading: this.checking(), disabled: busy && !this.checking() };
      default:
        return null;
    }
  });
  protected readonly secondary = computed<StkButton | null>(() => {
    const busy = this.inFlight() || this.checking();
    switch (this.phase()) {
      case 'FAILED':
      case 'initiate-error':
        return { label: STK_COPY.back, disabled: busy };
      case 'TIMEOUT':
        return { label: STK_COPY.newPrompt, loading: this.inFlight(), disabled: this.checking() };
      default:
        return null;
    }
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.realtime.statusChanges$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.errandId !== this.id) return;
      if (e.status === 'PAYMENT_CONFIRMED') this.toPhase('SUCCESS');
      else void this.reroute();
    });
    this.realtime.accessRevocations$.pipe(takeUntilDestroyed()).subscribe((e) => e.errandId === this.id && void this.reroute());
    this.realtime.onStateChange((s) => {
      if (s === 'reconnecting' || s === 'disconnected') this.dropped = true;
      else if (s === 'connected' && this.dropped) {
        this.dropped = false;
        if (this.following()) void this.check(false);
      }
    }, destroyRef);
    destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.clearPoll();
      if (this.successHandle !== null) this.timers.clearTimeout(this.successHandle);
      if (this.id) this.realtime.leaveErrand(this.id);
    });
    // A§1: the page is reused when only `:errandId` changes; start over for each id.
    this.activatedRoute.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.startFor(params.get('errandId') ?? ''));
  }

  /** Stops the previous errand's polls and timers, leaves its room, clears the view, then follows the new one. */
  private startFor(id: string): void {
    if (id === this.id) return;
    if (this.id) this.realtime.leaveErrand(this.id);
    this.clearPoll();
    if (this.successHandle !== null) this.timers.clearTimeout(this.successHandle);
    this.successHandle = null;
    this.id = id;
    this.phase.set('loading');
    this.payment.set(null);
    this.failureReason.set(null);
    this.payer.set(null);
    this.checking.set(false);
    this.inFlight.set(false);
    this.stillPending.set(false);
    this.keyReused = false;
    // Only an in-app click set an intent for this errand (WQ-28).
    this.intent = this.intents.take(id);
    this.request = this.intent ? this.bodyOf(this.intent) : {};
    void this.realtime.joinErrand(id);
    void this.load();
  }

  /** True once the page left `id` (another errand or destroyed): late answers are dropped. */
  private gone(id: string): boolean {
    return this.destroyed || id !== this.id;
  }

  protected retry(): void {
    this.phase.set('loading');
    void this.load();
  }

  protected onVisibility(): void {
    if (document.visibilityState === 'visible' && this.following()) void this.check(false);
  }

  protected onPrimary(): void {
    switch (this.phase()) {
      case 'PENDING':
      case 'TIMEOUT':
        void this.check(true);
        break;
      case 'FAILED':
        void this.initiate(true);
        break;
      case 'initiate-error':
        void this.initiate(false);
        break;
    }
  }

  protected onSecondary(): void {
    if (this.phase() === 'TIMEOUT') void this.initiate(true);
    else this.back();
  }

  /** Entry decision (VP "Entry decision"). */
  private async load(): Promise<void> {
    const id = this.id;
    try {
      const [errand, summary, methods] = await Promise.all([this.api.errand(id), this.api.payments(id), this.api.paymentMethods()]);
      if (this.gone(id)) return;
      const status = parseErrandStatus(errand?.status);
      if (!status) throw new Error('unknown status');
      const redirect = checkoutRedirect('payment', status, this.id);
      if (redirect) {
        this.leave(redirect);
        return;
      }
      const method = methods.find((m) => m.isDefault) ?? methods[0] ?? null;
      const phone = this.intent?.payerDetail ?? method?.phoneNumber ?? this.session.user()?.phone ?? null;
      this.payer.set(phone ? formatPhoneIntl(phone) : null);

      const main = summary.payment;
      if (!main) {
        if (status !== 'ACCEPTED') this.leave(customerLinks.track(this.id));
        else if (this.intent) void this.initiate(false);
        else this.leave(this.quoteLink);
        return;
      }
      if (!this.request.merchantRoute) this.request = { ...this.request, merchantRoute: routeOf(main) };
      const state = stkStateOf(summary, this.now());
      if (state === 'FAILED' && this.intent) {
        this.apply(summary);
        void this.initiate(true);
        return;
      }
      this.apply(summary);
    } catch {
      if (!this.gone(id)) this.phase.set('error');
    }
  }

  /** `POST …/initiate`: `fresh` starts a new attempt (new key); otherwise the current key. */
  private async initiate(fresh: boolean): Promise<void> {
    if (this.inFlight() || this.destroyed) return;
    const id = this.id;
    this.intent = null;
    this.inFlight.set(true);
    this.stillPending.set(false);
    this.clearPoll();
    if (this.phase() !== 'SUCCESS') this.phase.set('initiating');
    const key = fresh ? this.attempts.newAttempt(this.id) : this.attempts.keyFor(this.id);
    if (fresh) this.keyReused = false;
    try {
      const result = await this.api.initiate(id, this.request, key);
      if (this.gone(id)) return;
      this.inFlight.set(false);
      this.apply(result);
    } catch (err) {
      if (this.gone(id)) return;
      this.inFlight.set(false);
      const e = apiErrorOf(err);
      switch (e.code) {
        case 'quote_expired':
          this.leave(this.quoteLink, { quoteExpired: true });
          return;
        case 'deadline_passed_before_payment':
          this.leave(this.quoteLink, { deadlinePassed: true });
          return;
        case 'quote_not_accepted':
        case 'merchant_route_required':
        case 'merchant_details_missing':
          this.leave(this.quoteLink);
          return;
        case 'errand_not_payable':
          void this.reroute();
          return;
        case 'idempotency_key_reused':
          if (!this.keyReused) {
            this.attempts.newAttempt(this.id);
            this.keyReused = true;
            void this.initiate(false);
            return;
          }
          this.toPhase('initiate-error');
          return;
        default:
          this.toPhase('initiate-error');
      }
    }
  }

  /** `GET /payments/:errandId` now (a manual check shows the still-pending line). */
  private async check(manual: boolean): Promise<void> {
    if (this.checking() || this.destroyed) return;
    const id = this.id;
    this.checking.set(true);
    try {
      const summary = await this.api.payments(id);
      if (this.gone(id)) return;
      this.apply(summary);
      if (manual && this.phase() === 'PENDING') this.stillPending.set(true);
    } catch (err) {
      if (this.gone(id)) return;
      if (manual) this.toast.show(friendlyError(err));
      else this.schedulePoll();
    } finally {
      if (!this.gone(id)) this.checking.set(false);
    }
  }

  private apply(result: StkResult): void {
    if (result.payment) this.payment.set(result.payment);
    this.failureReason.set(result.failureReason?.trim() || null);
    const state = stkStateOf({ ...result, payment: result.payment ?? this.payment() }, this.now());
    if (state) this.toPhase(state);
  }

  private toPhase(next: PaymentPhase): void {
    if (this.phase() === 'SUCCESS') return;
    const before = this.phase();
    this.phase.set(next);
    if (next !== 'PENDING') this.stillPending.set(false);
    if (next === 'SUCCESS') {
      this.clearPoll();
      this.successHandle = this.timers.setTimeout(() => {
        this.successHandle = null;
        void this.router.navigateByUrl(customerLinks.track(this.id), { replaceUrl: true });
      }, SUCCESS_DELAY_MS);
    } else if (next === 'PENDING' || next === 'TIMEOUT') this.schedulePoll();
    else this.clearPoll();
    if (before !== next && before !== 'loading') this.refocus();
  }

  private following(): boolean {
    const p = this.phase();
    return p === 'PENDING' || p === 'TIMEOUT';
  }

  /** 5 s for the first 2 min after `createdAt`, then 30 s, stopping at 10 min; skipped while hidden. */
  private schedulePoll(): void {
    this.clearPoll();
    if (!this.following()) return;
    const delay = stkPollDelay(this.payment()?.createdAt, this.now());
    if (delay === null) return;
    this.pollHandle = this.timers.setTimeout(() => {
      this.pollHandle = null;
      if (document.visibilityState === 'visible') void this.check(false);
      else this.schedulePoll();
    }, delay);
  }

  private clearPoll(): void {
    if (this.pollHandle !== null) this.timers.clearTimeout(this.pollHandle);
    this.pollHandle = null;
  }

  /** Re-reads the errand and applies A§2. */
  private async reroute(): Promise<void> {
    const id = this.id;
    try {
      const errand = await this.api.errand(id);
      if (this.gone(id)) return;
      const status = parseErrandStatus(errand?.status);
      const redirect = status ? checkoutRedirect('payment', status, id) : null;
      if (redirect) this.leave(redirect);
      else if (status === 'ACCEPTED' && !this.payment()) this.leave(this.quoteLink);
    } catch {
      // The next poll or click tries again.
    }
  }

  private bodyOf(intent: CheckoutIntent): InitiateBody {
    const body: InitiateBody = {};
    if (intent.route) body.merchantRoute = intent.route;
    if (intent.paymentMethodId) body.paymentMethodId = intent.paymentMethodId;
    return body;
  }

  private leave(url: string, state?: Record<string, boolean>): void {
    void this.router.navigateByUrl(url, state ? { replaceUrl: true, state } : { replaceUrl: true });
  }

  /** `Back`: history when the previous page is in `/app`, else the checkout. */
  private back(): void {
    const previous = this.router.lastSuccessfulNavigation()?.previousNavigation?.finalUrl;
    const url = previous ? this.router.serializeUrl(previous) : null;
    if (url && url.startsWith('/app/')) this.location.back();
    else void this.router.navigateByUrl(this.quoteLink);
  }

  /** Focus moves to the new heading only if the focused button vanished. */
  private refocus(): void {
    setTimeout(() => {
      const active = this.host.ownerDocument.activeElement;
      if (active && active !== this.host.ownerDocument.body && this.host.contains(active)) return;
      this.host.querySelector<HTMLElement>('.nm-stk__heading')?.focus();
    });
  }
}
