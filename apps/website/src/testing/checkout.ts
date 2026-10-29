// Helpers for the #8 view specs (customer-x-awaiting-quote A§12): fixtures
// with the WQ-27 amounts, a fake realtime service, step-able timers sharing
// one clock with CUSTOMER_NOW, and openers for the three #8 routes.
import { DestroyRef, EnvironmentProviders, Provider, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { CUSTOMER_NOW } from '../app/app-area/customer/clock';
import { CHECKOUT_TIMERS, CheckoutTimers } from '../app/app-area/customer/checkout/checkout-timers';
import {
  CheckoutErrand,
  DifferencePaymentView,
  MerchantPaymentView,
  Payment,
  PaymentMethod,
  PaymentSummary,
  PriceChangeRequest,
  Quote,
} from '../app/app-area/customer/data/checkout.api';
import {
  ErrandAccessRevoked,
  ErrandStatusChanged,
  MerchantDetailsChanged,
  MerchantDetailsUpdated,
  PriceChangeRequested,
  PriceDifferencePaid,
  QuoteReissued,
  QuoteRequested,
  RealtimeConnectionState,
} from '../app/core/realtime/realtime.events';
import { RealtimeService } from '../app/core/realtime/realtime.service';
import { AppHarness, OpenOptions } from './app-harness';
import { API, expectRequest, httpMock, userJson } from './auth';
import { openCustomer } from './customer';

/** 10:00 EAT on Sunday 1 Nov 2026. */
export const BASE_TIME = new Date('2026-11-01T07:00:00.000Z').getTime();

/** Step-able timers; `now()` is the clock CUSTOMER_NOW reads. */
export class FakeTimers implements CheckoutTimers {
  elapsed = 0;
  private seq = 0;
  private readonly tasks = new Map<number, { at: number; fn: () => void }>();

  constructor(private readonly base = BASE_TIME) {}

  now(): Date {
    return new Date(this.base + this.elapsed);
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.tasks.set(id, { at: this.elapsed + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  /** Delays of the pending timers from now, ascending. */
  pending(): number[] {
    return [...this.tasks.values()].map((t) => t.at - this.elapsed).sort((a, b) => a - b);
  }

  /** Moves the clock by `ms`, running every timer that falls due in order. */
  advance(ms: number): void {
    const end = this.elapsed + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const entry of this.tasks) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      this.tasks.delete(next[0]);
      this.elapsed = Math.max(this.elapsed, next[1].at);
      next[1].fn();
    }
    this.elapsed = end;
  }
}

export class FakeRealtime {
  readonly state = signal<RealtimeConnectionState>('connected');
  readonly statusChanges$ = new Subject<ErrandStatusChanged>();
  readonly quoteReissues$ = new Subject<QuoteReissued>();
  readonly quoteRequests$ = new Subject<QuoteRequested>();
  readonly merchantDetailsUpdates$ = new Subject<MerchantDetailsUpdated>();
  readonly merchantDetailsChanges$ = new Subject<MerchantDetailsChanged>();
  readonly accessRevocations$ = new Subject<ErrandAccessRevoked>();
  readonly priceChangeRequests$ = new Subject<PriceChangeRequested>();
  readonly priceDifferencePayments$ = new Subject<PriceDifferencePaid>();
  readonly listeners = new Set<(s: RealtimeConnectionState) => void>();
  readonly joinErrand = vi.fn(async (_id: string) => true);
  readonly leaveErrand = vi.fn((_id: string) => undefined);
  readonly connect = vi.fn(async () => undefined);
  readonly disconnect = vi.fn();
  onStateChange(listener: (s: RealtimeConnectionState) => void, destroyRef: DestroyRef): () => void {
    this.listeners.add(listener);
    destroyRef.onDestroy(() => this.listeners.delete(listener));
    return () => this.listeners.delete(listener);
  }
  showReconnecting() {
    return signal(false).asReadonly();
  }
  set(state: RealtimeConnectionState): void {
    this.state.set(state);
    for (const l of [...this.listeners]) l(state);
  }
  status(errandId: string, status: ErrandStatusChanged['status']): void {
    this.statusChanges$.next({ errandId, status, from: null, at: null });
  }
}

/** WQ-27 fixture amounts (A.T7). */
export const FEES = { serviceFee: '440.00', runnerFee: '660.00', feeTotal: '1100.00', item: '40000.00' } as const;

export function checkoutErrand(overrides: Partial<CheckoutErrand> = {}): CheckoutErrand {
  return {
    id: 'e-1',
    category: 'buy_for_me',
    title: null,
    reference: 'NT-10482',
    status: 'QUOTED',
    createdAt: new Date(BASE_TIME - 60 * 60 * 1000).toISOString(),
    updatedAt: null,
    assignment: null,
    deadlineAt: null,
    budget: FEES.item,
    quotedPrice: FEES.feeTotal,
    feeTotal: FEES.feeTotal,
    quoteExpiresAt: null,
    quoteRequestedAt: null,
    quoteAcceptanceRequired: false,
    merchantDetailsAvailable: true,
    ...overrides,
  };
}

export function quoteJson(overrides: Partial<Quote> & Record<string, unknown> = {}): Quote {
  return {
    total: FEES.feeTotal,
    expiresAt: null,
    createdAt: new Date(BASE_TIME - 30 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

export function paymentJson(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'p-1',
    errandId: 'e-1',
    serviceFee: FEES.serviceFee,
    runnerFee: FEES.runnerFee,
    merchantAmount: '0.00',
    paymentFlow: 'platform_only',
    status: 'pending',
    priceChangeRequestId: null,
    createdAt: new Date(BASE_TIME).toISOString(),
    ...overrides,
  };
}

export function summaryJson(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    payment: null,
    transactions: [],
    stkStatus: null,
    failureReason: null,
    merchantDetailsAvailable: true,
    merchantPayment: null,
    differencePayments: [],
    ...overrides,
  };
}

export function directMerchant(overrides: Partial<Extract<MerchantPaymentView, { route: 'merchant_direct' }>> = {}): MerchantPaymentView {
  return {
    route: 'merchant_direct',
    amount: FEES.item,
    paidTo: 'merchant',
    merchantName: 'Naivas Nyali',
    tillNumber: '123456',
    paybillNumber: null,
    accountReference: null,
    merchantDetailsUpdatedAt: null,
    merchantDetailsChangedAfterPayment: false,
    ...overrides,
  };
}

export function differenceJson(overrides: Partial<DifferencePaymentView> = {}): DifferencePaymentView {
  return {
    payment: paymentJson({
      id: 'p-d1',
      serviceFee: '0.00',
      runnerFee: '0.00',
      merchantAmount: '5000.00',
      paymentFlow: 'customer_to_runner',
      priceChangeRequestId: 'r-1',
    }),
    transactions: [],
    stkStatus: 'PENDING',
    failureReason: null,
    checkoutRequestId: null,
    merchantPayment: { route: 'send_to_runner', amount: '5000.00', paidTo: 'nitume' },
    ...overrides,
  };
}

export function priceChangeJson(overrides: Partial<PriceChangeRequest> = {}): PriceChangeRequest {
  return {
    id: 'r-1',
    errandId: 'e-1',
    fromPrice: '40000.00',
    toPrice: '45000.00',
    reason: null,
    status: 'requested',
    createdAt: new Date(BASE_TIME).toISOString(),
    ...overrides,
  };
}

export const MPESA: PaymentMethod = {
  id: 'pm-1',
  type: 'mpesa',
  label: 'M-Pesa',
  detail: '+254 722 ••• 111',
  phoneNumber: '+254722000111',
  isDefault: true,
};

export interface CheckoutRig {
  timers: FakeTimers;
  realtime: FakeRealtime;
  providers: (Provider | EnvironmentProviders)[];
}

export function checkoutRig(opts: { realtime?: FakeRealtime; timers?: FakeTimers; providers?: (Provider | EnvironmentProviders)[] } = {}): CheckoutRig {
  const timers = opts.timers ?? new FakeTimers();
  const realtime = opts.realtime ?? new FakeRealtime();
  return {
    timers,
    realtime,
    providers: [
      { provide: CUSTOMER_NOW, useValue: () => timers.now() },
      { provide: CHECKOUT_TIMERS, useValue: timers },
      { provide: RealtimeService, useValue: realtime },
      ...(opts.providers ?? []),
    ],
  };
}

/** Opens `url` signed in as Achieng (+254712345678) with the rig's fakes. */
export function openCheckout(url: string, rig: CheckoutRig, opts: OpenOptions = {}): Promise<AppHarness> {
  return openCustomer(url, {
    restore: userJson({ role: 'customer', displayName: 'Achieng Wanjiru', phone: '+254712345678' }),
    ...opts,
    providers: [...rig.providers, ...(opts.providers ?? [])],
  });
}

/** Flushes the next `GET` to `path` with `body` (or an error status). */
export async function flushGet(path: string, body: unknown, status = 200): Promise<void> {
  const req = await expectRequest(`${API}${path}`);
  if (status === 0) req.error(new ProgressEvent('error'), { status: 0 });
  else if (status >= 400) req.flush((body ?? { statusCode: status, message: "x" }) as object, { status, statusText: "Error" });
  else req.flush(body as object);
}

/** Waits (lazy chunks, macrotasks) until the router reached `url`. */
export async function routedTo(h: AppHarness, url: string): Promise<void> {
  await vi.waitFor(() => {
    if (h.router.url !== url) throw new Error(`at ${h.router.url}, not ${url}`);
  });
  await h.detect();
}

/** Navigates through a stub route to `url` with navigation `state` (a fresh page instance). */
export async function reopenWithState(h: AppHarness, url: string, state: Record<string, unknown>): Promise<void> {
  await h.router.navigateByUrl('/app/customer/history');
  await routedTo(h, '/app/customer/history');
  void h.router.navigateByUrl(url, { state });
}

/** Pending requests whose URL (under the API base) equals `path`. */
export function requests(path: string) {
  return httpMock().match((r) => r.urlWithParams === `${API}${path}`);
}
