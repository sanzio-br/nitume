// customer `x-awaiting-quote` (customer-x-awaiting-quote.md). One page per
// errand: Waiting (REQUESTED), New quote requested, Outside every service
// area, and the Checkout (QUOTED / ACCEPTED re-entry) with its Quote expired
// and Deadline passed variants. A§2 routing on every load. Live through the
// errand room, a 15 s poll while the socket is down and a 30 s expiry tick,
// both only while the tab is visible (A§7). Money (WQ-27): one fee-total row;
// the item amount on its own row; the CTA adds the item amount only for
// `send_to_runner`, with `addKes`. Nothing written to browser storage (A§3).
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionStore } from '../../../core/auth/session.store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { addKes, formatClock, formatDayTime, formatKes, isPositiveKes, kesSpoken } from '../../../shared/format/formatters';
import { NmNum } from '../../../shared/format/num.directive';
import { ErrandStatus, parseErrandStatus } from '../../../shared/status/status-presentation';
import { NmButton } from '../../../shared/ui/button/button.component';
import { NmFormCard } from '../../../shared/ui/field/form-card.component';
import { NmFixedCta, NmFixedCtaOffset } from '../../../shared/ui/fixed-cta/fixed-cta.component';
import { followInAppLink } from '../../../shared/ui/links';
import { NmNotice } from '../../../shared/ui/notice/notice.component';
import { NmDialogService } from '../../../shared/ui/overlay/dialog.service';
import { NmOverlayRef } from '../../../shared/ui/overlay/overlay-ref';
import { NmPanelService } from '../../../shared/ui/overlay/panel.service';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { NmPaymentMethodCard } from '../../../shared/ui/payment-method-card/payment-method-card.component';
import { NmPulsingDots } from '../../../shared/ui/pulsing-dots/pulsing-dots.component';
import { NmPushedHeader } from '../../../shared/ui/pushed-header/pushed-header.component';
import { NmReceiptCaption, NmReceiptGroup, NmReceiptRow } from '../../../shared/ui/receipt/receipt.component';
import { NmErrorState } from '../../../shared/ui/states/error-state.component';
import { NmSkeletonCard } from '../../../shared/ui/states/skeleton-card.component';
import { CUSTOMER_NOW } from '../clock';
import { customerLinks } from '../customer-links';
import { CheckoutApi, CheckoutErrand, MerchantRoute, PaymentMethod, Quote } from '../data/checkout.api';
import { apiErrorOf } from '../data/errands.api';
import { DeadlinePanelComponent, DeadlinePanelData, DeadlinePanelResult } from '../shared/deadline-panel.component';
import { NmDeadlineLine } from '../shared/deadline-line.component';
import { NmMerchantRouteRows } from '../shared/merchant-route-rows.component';
import { maskPhone } from '../shared/payer';
import { NmTaskSummaryCard } from '../shared/task-summary-card.component';
import { CheckoutIntentStore } from './checkout-intent.store';
import { checkoutRedirect } from './checkout-routing';
import { CHECKOUT_TIMERS, every } from './checkout-timers';

export const QUOTE_POLL_MS = 15_000;
export const QUOTE_TICK_MS = 30_000;

export const QUOTE_COPY = {
  waitingDots: 'Waiting for your quote',
  waitingHeading: 'Preparing your quote',
  waitingBody: "We're pricing your task. This usually takes a few minutes, and we'll notify you when it's ready.",
  requestedDots: 'Waiting for your new quote',
  requestedHeading: 'Preparing a new quote',
  requestedBody: "You asked for a new quote. We'll notify you when it's ready.",
  outsideHeading: "We can't take this task",
  outsideBody: "Its location is outside the areas we serve. You can cancel it; you haven't paid anything.",
  backHome: 'Back to Home',
  cancelTask: 'Cancel task',
  finalQuote: 'Final quote',
  total: 'Total (service + runner fee)',
  routeCard: 'How should this be paid?',
  itemAmount: 'Item amount',
  payWith: 'Pay with',
  mpesa: 'M-Pesa',
  signInNumber: 'Your sign-in number',
  decline: 'Decline and cancel task',
  expired: 'This quote has expired. Ask for a new quote to continue.',
  requestQuote: 'Request a new quote',
  deadlinePassed: 'Your deadline has passed. Choose a new one to continue.',
  chooseDeadline: 'Choose a new deadline',
  cancelTitle: 'Cancel this task?',
  cancelBody: 'Nothing has been charged yet.',
  keepTask: 'Keep task',
  cancelled: 'Task cancelled.',
  cancelFailed: "Couldn't cancel the task. Try again.",
  acceptFailed: "Couldn't accept the quote. Try again.",
  requested: "We've asked for a new quote.",
  requestFailed: "Couldn't request a new quote. Try again.",
  quoteReady: 'Your quote is ready.',
  newQuoteReady: 'Your new quote is ready.',
  loadError: "Couldn't load this task.",
} as const;

/** Only these two categories carry an item amount (row 80). */
const ITEM_CATEGORIES = ['buy_for_me', 'pickup_delivery'];

type View = 'loading' | 'error' | 'waiting' | 'requested' | 'outside' | 'checkout';

interface Loaded {
  readonly errand: CheckoutErrand;
  readonly status: ErrandStatus;
  readonly quote: Quote | null;
  readonly methods: readonly PaymentMethod[];
}

function time(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

@Component({
  selector: 'app-awaiting-quote-page',
  imports: [
    NmPushedHeader,
    NmSkeletonCard,
    NmErrorState,
    NmPulsingDots,
    NmTaskSummaryCard,
    NmDeadlineLine,
    NmButton,
    NmFormCard,
    NmReceiptRow,
    NmReceiptCaption,
    NmReceiptGroup,
    NmMerchantRouteRows,
    NmPaymentMethodCard,
    NmNotice,
    NmFixedCta,
    NmNum,
  ],
  templateUrl: './awaiting-quote.page.html',
  styleUrl: './awaiting-quote.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:visibilitychange)': 'onVisibility()' },
})
export class AwaitingQuotePage {
  private readonly api = inject(CheckoutApi);
  private readonly router = inject(Router);
  private readonly realtime = inject(RealtimeService);
  private readonly session = inject(SessionStore);
  private readonly intents = inject(CheckoutIntentStore);
  private readonly dialogs = inject(NmDialogService);
  private readonly panels = inject(NmPanelService);
  private readonly toast = inject(NmToastService);
  private readonly offsets = inject(NmFixedCtaOffset);
  private readonly timers = inject(CHECKOUT_TIMERS);
  private readonly now = inject(CUSTOMER_NOW);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly activatedRoute = inject(ActivatedRoute);
  /** The current errand; follows `paramMap` (A§1 "Same route, another errand"). */
  protected id = '';
  protected readonly copy = QUOTE_COPY;
  protected readonly links = customerLinks;

  private readonly loaded = signal<Loaded | null>(null);
  private readonly failed = signal(false);
  /** The injected clock, refreshed by the tick and on visibility. */
  protected readonly clock = signal(this.now());
  protected readonly route = signal<MerchantRoute | null>(null);
  /** From accept `quote_expired` or `{ quoteExpired: true }` navigation state. */
  private readonly expiredFlag = signal(false);
  /** From `{ deadlinePassed: true }` navigation state. */
  private readonly deadlineFlag = signal(false);
  protected readonly accepting = signal(false);
  protected readonly requesting = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly panelOpen = signal(false);
  protected readonly announcement = signal('');
  protected readonly fade = signal(false);

  protected readonly errand = computed(() => this.loaded()?.errand ?? null);
  protected readonly status = computed(() => this.loaded()?.status ?? null);
  protected readonly quote = computed(() => this.loaded()?.quote ?? null);

  protected readonly expiresAt = computed(() => this.errand()?.quoteExpiresAt ?? this.quote()?.expiresAt ?? null);
  /** A quote without an expiry counts as valid (row 83). */
  protected readonly expired = computed(() => {
    if (this.expiredFlag()) return true;
    const at = time(this.expiresAt());
    return at !== null && at <= this.clock().getTime();
  });
  /** Answered only when the quote is not expired (the expired state comes first). */
  protected readonly deadlinePassed = computed(() => {
    if (this.expired()) return false;
    if (this.deadlineFlag()) return true;
    const at = time(this.errand()?.deadlineAt);
    return at !== null && at < this.clock().getTime();
  });

  protected readonly view = computed<View>(() => {
    if (this.failed()) return 'error';
    const loaded = this.loaded();
    if (!loaded) return 'loading';
    const { errand, status, quote } = loaded;
    if (errand.outsideServiceArea === true && (status === 'REQUESTED' || this.expired())) return 'outside';
    if (status === 'REQUESTED') return 'waiting';
    const requestedAt = time(errand.quoteRequestedAt);
    const quoteAt = time(quote?.createdAt);
    if (requestedAt !== null && (quoteAt === null || requestedAt > quoteAt)) return 'requested';
    return 'checkout';
  });

  protected readonly feeTotal = computed(() => this.errand()?.feeTotal ?? this.quote()?.total ?? this.errand()?.quotedPrice ?? null);
  protected readonly feeSpoken = computed(() => {
    const t = this.feeTotal();
    return t === null ? null : kesSpoken(t);
  });
  /** The item amount, only for Buy For Me / Get It For Me and only when > 0 (row 80). */
  protected readonly itemAmount = computed(() => {
    const e = this.errand();
    if (!e || !ITEM_CATEGORIES.includes(e.category)) return null;
    try {
      return isPositiveKes(e.budget) ? e.budget : null;
    } catch {
      return null;
    }
  });
  protected readonly itemSpoken = computed(() => {
    const i = this.itemAmount();
    return i === null ? null : kesSpoken(i);
  });
  /** The STK charge (A§4): the fee total, plus the item amount only for `send_to_runner`. */
  protected readonly charge = computed(() => {
    const fee = this.feeTotal();
    if (fee === null) return null;
    const item = this.itemAmount();
    return item !== null && this.route() === 'send_to_runner' ? addKes(fee, item) : fee;
  });
  protected readonly chargeText = computed(() => {
    const c = this.charge();
    return c === null ? null : formatKes(c);
  });

  protected readonly method = computed((): PaymentMethod | null => {
    const methods = this.loaded()?.methods ?? [];
    return methods.find((m) => m.isDefault) ?? methods[0] ?? null;
  });
  protected readonly payerDetail = computed(() => {
    const m = this.method();
    if (m) return m.detail ?? (m.phoneNumber ? maskPhone(m.phoneNumber) : null);
    const phone = this.session.user()?.phone;
    return phone ? maskPhone(phone) : null;
  });

  protected readonly busy = computed(() => this.accepting() || this.requesting() || this.cancelling());
  protected readonly canChangeDeadline = computed(() => !this.deadlinePassed() && !this.busy() && !this.panelOpen());
  protected readonly requestedLine = computed(() => {
    const at = this.errand()?.quoteRequestedAt;
    return at ? `Requested ${formatDayTime(at, this.clock())}` : null;
  });
  protected readonly validCaption = computed(() => {
    const at = this.expiresAt();
    if (!at || time(at) === null) return null;
    return { prefix: this.expired() ? 'Expired at ' : 'Valid until ', clock: formatClock(at) };
  });

  private sequence = 0;
  private dropped = false;
  private panelRef: NmOverlayRef<DeadlinePanelResult> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const mine = <T extends { errandId: string }>(event: T) => event.errandId === this.id;
    this.realtime.statusChanges$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.quoteReissues$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (!mine(e)) return;
      this.expiredFlag.set(false);
      void this.load();
    });
    this.realtime.quoteRequests$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.merchantDetailsUpdates$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.accessRevocations$.pipe(takeUntilDestroyed()).subscribe((e) => mine(e) && void this.load());
    this.realtime.onStateChange((s) => {
      if (s === 'reconnecting' || s === 'disconnected') this.dropped = true;
      else if (s === 'connected' && this.dropped) {
        this.dropped = false;
        void this.load();
      }
    }, destroyRef);

    const poll = every(this.timers, QUOTE_POLL_MS, () => {
      if (this.visible() && this.realtime.state() !== 'connected') void this.load();
    });
    const tick = every(this.timers, QUOTE_TICK_MS, () => {
      if (this.visible()) this.clock.set(this.now());
    });
    destroyRef.onDestroy(() => {
      poll.stop();
      tick.stop();
      this.panelRef?.close(undefined);
      if (this.id) this.realtime.leaveErrand(this.id);
    });

    // A§1: the page is reused when only `:errandId` changes; start over for each id.
    this.activatedRoute.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.startFor(params.get('errandId') ?? ''));
  }

  /** Leaves the previous errand (room, panel, in-flight answers), clears the view, then reads the new one. */
  private startFor(id: string): void {
    if (id === this.id) return;
    if (this.id) this.realtime.leaveErrand(this.id);
    this.panelRef?.close(undefined);
    this.panelRef = null;
    this.id = id;
    this.sequence++;
    this.loaded.set(null);
    this.failed.set(false);
    this.route.set(null);
    this.accepting.set(false);
    this.requesting.set(false);
    this.cancelling.set(false);
    this.panelOpen.set(false);
    this.announcement.set('');
    this.fade.set(false);
    this.clock.set(this.now());
    const state = this.router.currentNavigation()?.extras.state as { quoteExpired?: unknown; deadlinePassed?: unknown } | undefined;
    this.expiredFlag.set(state?.quoteExpired === true);
    this.deadlineFlag.set(state?.deadlinePassed === true);
    void this.realtime.joinErrand(id);
    void this.load();
  }

  protected retry(): void {
    this.failed.set(false);
    this.loaded.set(null);
    void this.load();
  }

  protected onVisibility(): void {
    if (!this.visible()) return;
    this.clock.set(this.now());
    if (this.realtime.state() !== 'connected') void this.load();
  }

  protected follow(event: MouseEvent, href: string): void {
    followInAppLink(event, href, this.router);
  }

  /** Errand (+ quote and methods unless REQUESTED), then A§2. */
  protected async load(): Promise<void> {
    const sequence = ++this.sequence;
    const before = this.view();
    try {
      const errand = await this.api.errand(this.id);
      if (sequence !== this.sequence) return;
      const status = parseErrandStatus(errand?.status);
      if (!status) throw new Error('unknown status');
      const redirect = checkoutRedirect('quote', status, this.id);
      if (redirect) {
        void this.router.navigateByUrl(redirect, { replaceUrl: true });
        return;
      }
      let quote: Quote | null = null;
      let methods: PaymentMethod[] = [];
      if (status !== 'REQUESTED') [quote, methods] = await Promise.all([this.api.quote(this.id), this.api.paymentMethods()]);
      if (sequence !== this.sequence) return;
      const previous = this.quote();
      if (previous && quote && previous.createdAt !== quote.createdAt) this.expiredFlag.set(false);
      this.clock.set(this.now());
      this.loaded.set({ errand, status, quote, methods });
      this.failed.set(false);
      if (this.route() === null) this.route.set(errand.merchantDetailsAvailable ? 'merchant_direct' : 'send_to_runner');
      this.afterChange(before);
    } catch {
      if (sequence !== this.sequence) return;
      // A refresh failure keeps the content; only a first load shows the error.
      if (!this.loaded()) this.failed.set(true);
    }
  }

  protected chooseRoute(route: MerchantRoute): void {
    this.route.set(route);
  }

  /** `Confirm & pay`: accept when needed, store the intent, then `…/payment`. */
  protected async confirm(): Promise<void> {
    const loaded = this.loaded();
    if (!loaded || this.busy() || this.expired() || this.deadlinePassed()) return;
    const id = this.id;
    this.accepting.set(true);
    try {
      if (loaded.status === 'QUOTED' || (loaded.status === 'ACCEPTED' && loaded.errand.quoteAcceptanceRequired)) {
        await this.api.acceptQuote(id);
      }
    } catch (err) {
      if (id !== this.id) return;
      this.accepting.set(false);
      const e = apiErrorOf(err);
      if (e.code === 'quote_expired') this.expiredFlag.set(true);
      else if (e.status === 409) void this.load();
      else this.showToast(QUOTE_COPY.acceptFailed);
      return;
    }
    if (id !== this.id) return;
    const method = this.method();
    const route = this.itemAmount() !== null ? this.route() : null;
    const payer = method ? method.phoneNumber : (this.session.user()?.phone ?? null);
    this.intents.set(this.id, {
      ...(route ? { route } : {}),
      ...(method ? { paymentMethodId: method.id } : {}),
      ...(payer ? { payerDetail: payer } : {}),
    });
    this.accepting.set(false);
    void this.router.navigateByUrl(customerLinks.payment(this.id));
  }

  protected async requestNewQuote(): Promise<void> {
    if (this.busy()) return;
    const id = this.id;
    this.requesting.set(true);
    try {
      await this.api.requestQuote(id);
      if (id === this.id) this.onRequested();
    } catch (err) {
      if (id !== this.id) return;
      const code = apiErrorOf(err).code;
      if (code === 'quote_request_pending') this.onRequested();
      else if (code === 'quote_still_valid') {
        this.expiredFlag.set(false);
        void this.load();
      } else if (code === 'quote_request_not_allowed') void this.load();
      else this.showToast(QUOTE_COPY.requestFailed);
    } finally {
      if (id === this.id) this.requesting.set(false);
    }
  }

  protected async openDeadline(): Promise<void> {
    const errand = this.errand();
    if (!errand || this.panelOpen() || this.busy()) return;
    this.panelOpen.set(true);
    const data: DeadlinePanelData = { errandId: this.id, deadlineAt: errand.deadlineAt };
    const ref = this.panels.open<DeadlinePanelResult>(DeadlinePanelComponent, { title: 'Deadline', data });
    this.panelRef = ref;
    const id = this.id;
    const result = await ref.closed;
    if (id !== this.id) return;
    this.panelRef = null;
    this.panelOpen.set(false);
    if (result === 'saved') {
      this.deadlineFlag.set(false);
      void this.load();
    } else if (result === 'not-editable') void this.load();
  }

  protected async cancel(): Promise<void> {
    if (this.busy()) return;
    const id = this.id;
    const ok = await this.dialogs.confirm({
      title: QUOTE_COPY.cancelTitle,
      body: QUOTE_COPY.cancelBody,
      confirmLabel: QUOTE_COPY.cancelTask,
      cancelLabel: QUOTE_COPY.keepTask,
      destructive: true,
    });
    if (!ok || id !== this.id) return;
    this.cancelling.set(true);
    try {
      await this.api.cancel(id);
      this.toast.show(QUOTE_COPY.cancelled);
      void this.router.navigateByUrl(customerLinks.home(), { replaceUrl: true });
    } catch (err) {
      if (id !== this.id) return;
      if (apiErrorOf(err).code === 'illegal_transition') void this.load();
      else this.showToast(QUOTE_COPY.cancelFailed);
    } finally {
      if (id === this.id) this.cancelling.set(false);
    }
  }

  private onRequested(): void {
    this.showToast(QUOTE_COPY.requested);
    this.expiredFlag.set(false);
    void this.load();
  }

  /** Announcements, the fade into checkout, and focus when the focused control vanished. */
  private afterChange(before: View): void {
    const after = this.view();
    if (after === before) return;
    if (after === 'checkout' && before === 'waiting') this.announcement.set(QUOTE_COPY.quoteReady);
    else if (after === 'checkout' && before === 'requested') this.announcement.set(QUOTE_COPY.newQuoteReady);
    this.fade.set(before !== 'loading' && after === 'checkout');
    if (before === 'loading') return;
    setTimeout(() => {
      const active = this.host.ownerDocument.activeElement;
      if (active && active !== this.host.ownerDocument.body && this.host.contains(active)) return;
      this.host.querySelector<HTMLElement>('.quote__heading, h1')?.focus();
    });
  }

  private visible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  private showToast(message: string): void {
    this.toast.show(message, { offset: this.offsets.toastOffset() });
  }
}
