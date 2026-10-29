// customer-v-payment.md, Required tests VP T1–T18 (gap report G8-27, G8-28;
// owner WQ-27 in T9 and T17, WQ-28 in T11, T12, T15, T16).
import { TestBed } from '@angular/core/testing';
import { AppHarness, text } from '../../../../testing/app-harness';
import { API, expectRequest, httpMock, storageKeys } from '../../../../testing/auth';
import {
  BASE_TIME,
  FakeRealtime,
  FakeTimers,
  MPESA,
  checkoutErrand,
  checkoutRig,
  flushGet,
  openCheckout,
  paymentJson,
  requests,
  routedTo,
  summaryJson,
} from '../../../../testing/checkout';
import { clearOverlays } from '../../../../testing/customer';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { CheckoutErrand, InitiateResult, Payment, PaymentMethod, PaymentSummary } from '../data/checkout.api';
import { CheckoutIntent, CheckoutIntentStore } from './checkout-intent.store';
import { PAYMENT_KEY_FACTORY } from './payment-attempt.store';
import { STK_FAST_MS, STK_SLOW_MS, SUCCESS_DELAY_MS } from './payment.page';

interface Opts {
  errand?: Partial<CheckoutErrand>;
  summary?: Partial<PaymentSummary>;
  methods?: PaymentMethod[];
  intent?: CheckoutIntent;
  timers?: FakeTimers;
  realtime?: FakeRealtime;
  answer?: boolean;
}

const URL = '/app/customer/tasks/e-1/payment';
const page = (h: AppHarness) => h.root().querySelector('app-payment-page') as HTMLElement;
const heading = (h: AppHarness) => text(page(h).querySelector('.nm-stk__heading'));
const primary = (h: AppHarness) => page(h).querySelector('.nm-stk__primary button') as HTMLButtonElement;
const secondary = (h: AppHarness) => page(h).querySelector('.nm-stk__secondary button') as HTMLButtonElement;
const initiates = () => requests('/payments/e-1/initiate');
const toastText = () => TestBed.inject(NmToastService).current()?.message ?? null;

function initiateResult(over: Partial<InitiateResult> = {}): InitiateResult {
  return {
    payment: paymentJson(),
    failureReason: null,
    merchantDetailsAvailable: true,
    reference: 'NT-10482',
    checkoutRequestId: 'ws_CO_1',
    transactions: [],
    stkStatus: 'PENDING',
    merchantPayment: null,
    ...over,
  };
}

async function answerLoad(h: AppHarness, o: Opts): Promise<void> {
  await flushGet('/errands/e-1', checkoutErrand({ status: 'ACCEPTED', ...o.errand }));
  await flushGet('/payments/e-1', summaryJson(o.summary));
  await flushGet('/customers/me/payment-methods', o.methods ?? []);
  await h.detect();
}

/** Opens a stub page, sets the intent (an in-app click) if any, then navigates to the payment page. */
async function openPayment(o: Opts = {}) {
  let n = 0;
  const rig = checkoutRig({
    timers: o.timers,
    realtime: o.realtime,
    providers: [{ provide: PAYMENT_KEY_FACTORY, useValue: () => `key-${++n}-abcdefgh` }],
  });
  const h = await openCheckout('/app/customer/history', rig);
  if (o.intent) TestBed.inject(CheckoutIntentStore).set('e-1', o.intent);
  void h.router.navigateByUrl(URL);
  if (o.answer !== false) await answerLoad(h, o);
  return { h, rig };
}

async function flushInitiate(h: AppHarness, result: InitiateResult | { code: string; status?: number } | 'network') {
  const req = await expectRequest(`${API}/payments/e-1/initiate`);
  if (result === 'network') req.error(new ProgressEvent('error'), { status: 0 });
  else if ('code' in result) req.flush({ statusCode: result.status ?? 409, code: result.code, message: 'x' }, { status: result.status ?? 409, statusText: 'Error' });
  else req.flush(result);
  await h.detect();
  return req;
}

const PENDING_STORED = (ageMs = 0, over: Partial<PaymentSummary> = {}): Partial<PaymentSummary> => ({
  payment: paymentJson({ createdAt: new Date(BASE_TIME - ageMs).toISOString() }),
  stkStatus: 'PENDING',
  ...over,
});

let visibility: DocumentVisibilityState = 'visible';

describe('customer v-payment (#8)', () => {
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });
  afterEach(() => {
    clearOverlays();
    TestBed.inject(NmToastService).dismiss();
    vi.restoreAllMocks();
  });

  it('VP T1. copy of every state; the mockup PENDING body with the payer number in nmNum', async () => {
    let { h } = await openPayment({ answer: false });
    await routedTo(h, URL);
    expect(text(page(h).querySelector('h1'))).toBe('Payment');
    expect(text(page(h).querySelector('.payment__loading .nm-dots__label'))).toBe('Loading');
    await answerLoad(h, { summary: PENDING_STORED() });
    expect(heading(h)).toBe('Check your phone');
    expect(text(page(h).querySelector('.nm-stk__body'))).toBe(
      'Enter your M-Pesa PIN on the prompt sent to +254 712 345 678 to confirm this payment.',
    );
    expect(page(h).querySelector('.nm-stk__payer')?.hasAttribute('nmNum')).toBe(true);
    expect(text(primary(h))).toBe("I've paid — continue");

    const cases: [Partial<PaymentSummary>, string, string, string[]][] = [
      [{ payment: paymentJson({ status: 'completed' }), stkStatus: 'SUCCESS' }, 'Payment received', "Thanks. We're finding a runner for your task.", []],
      [
        { payment: paymentJson({ status: 'failed' }), stkStatus: 'FAILED' },
        "Payment didn't go through",
        "M-Pesa didn't confirm this payment. You haven't been charged. You can try again.",
        ['Try again', 'Back'],
      ],
      [
        { payment: paymentJson(), stkStatus: 'TIMEOUT' },
        'Still checking your payment',
        "M-Pesa hasn't confirmed yet. If you entered your PIN, don't pay again. We'll update this screen as soon as we hear back.",
        ['Check again', 'Send a new prompt'],
      ],
    ];
    for (const [summary, head, body, buttons] of cases) {
      ({ h } = await openPayment({ summary }));
      expect.soft(heading(h), head).toBe(head);
      expect.soft(text(page(h).querySelector('.nm-stk__body')), head).toBe(body);
      expect.soft(Array.from(page(h).querySelectorAll('.nm-stk__actions button')).map((b) => text(b)), head).toEqual(buttons);
    }

    ({ h } = await openPayment({ intent: {} }));
    await h.detect();
    expect(heading(h)).toBe('Check your phone');
    expect(text(primary(h))).toBe('Sending prompt…');
    expect(primary(h).disabled).toBe(true);
    await flushInitiate(h, 'network');
    expect(heading(h)).toBe("Couldn't send the prompt");
    expect(text(page(h).querySelector('.nm-stk__body'))).toBe('Check your connection and try again.');
    expect(Array.from(page(h).querySelectorAll('.nm-stk__actions button')).map((b) => text(b))).toEqual(['Try again', 'Back']);
    expect(page(h).querySelector('.nm-stk__circle--failed')).not.toBeNull();
  });

  it('VP T2. pending: initiate answers PENDING → dots; I’ve paid — continue reads GET /payments/:id; still pending → the still-pending line', async () => {
    const { h } = await openPayment({ intent: {} });
    await flushInitiate(h, initiateResult());
    expect(heading(h)).toBe('Check your phone');
    expect(text(page(h).querySelector('nm-pulsing-dots .nm-dots__label'))).toBe('Waiting for M-Pesa confirmation');
    expect(page(h).querySelector('.nm-stk__still')).toBeNull();
    primary(h).click();
    await flushGet('/payments/e-1', summaryJson(PENDING_STORED()));
    await h.detect();
    expect(text(page(h).querySelector('.nm-stk__still'))).toBe("We haven't heard from M-Pesa yet. Keep this screen open.");
  });

  it('VP T3. success: a poll answering SUCCESS → Payment received, then Track (replaceUrl) after 1.5 s; also on errand:status_changed to PAYMENT_CONFIRMED', async () => {
    let { h, rig } = await openPayment({ summary: PENDING_STORED() });
    rig.timers.advance(STK_FAST_MS);
    await flushGet('/payments/e-1', summaryJson({ payment: paymentJson({ status: 'completed' }), stkStatus: 'SUCCESS' }));
    await h.detect();
    expect(heading(h)).toBe('Payment received');
    expect(page(h).querySelector('.nm-stk__circle nm-icon')?.getAttribute('data-icon')).toBe('check');
    const nav = vi.spyOn(h.router, 'navigateByUrl');
    rig.timers.advance(SUCCESS_DELAY_MS - 1);
    expect(nav).not.toHaveBeenCalled();
    rig.timers.advance(1);
    expect(nav).toHaveBeenCalledWith('/app/customer/track/e-1', { replaceUrl: true });
    await routedTo(h, '/app/customer/track/e-1');

    ({ h, rig } = await openPayment({ summary: PENDING_STORED() }));
    rig.realtime.status('e-1', 'PAYMENT_CONFIRMED');
    await h.detect();
    expect(heading(h)).toBe('Payment received');
    rig.timers.advance(SUCCESS_DELAY_MS);
    await routedTo(h, '/app/customer/track/e-1');
  });

  it('VP T4. failed: the reason line; Try again sends a new initiate with a DIFFERENT Idempotency-Key', async () => {
    const { h } = await openPayment({ intent: {} });
    const first = await flushInitiate(h, initiateResult({ stkStatus: 'FAILED', failureReason: 'Request cancelled by user', payment: paymentJson({ status: 'failed' }) }));
    expect(heading(h)).toBe("Payment didn't go through");
    expect(text(page(h).querySelector('.nm-stk__reason'))).toBe('Request cancelled by user');
    primary(h).click();
    const second = await expectRequest(`${API}/payments/e-1/initiate`);
    expect(second.request.headers.get('Idempotency-Key')).not.toBe(first.request.headers.get('Idempotency-Key'));
    expect(second.request.headers.get('Idempotency-Key')).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it('VP T5. timeout: copy; Check again re-reads; a later SUCCESS goes to Track; a later FAILED shows FAILED; Send a new prompt initiates with a new key', async () => {
    let { h, rig } = await openPayment({ summary: { payment: paymentJson(), stkStatus: 'TIMEOUT' } });
    expect(heading(h)).toBe('Still checking your payment');
    primary(h).click();
    await flushGet('/payments/e-1', summaryJson({ payment: paymentJson({ status: 'completed' }), stkStatus: 'SUCCESS' }));
    await h.detect();
    expect(heading(h)).toBe('Payment received');
    rig.timers.advance(SUCCESS_DELAY_MS);
    await routedTo(h, '/app/customer/track/e-1');

    ({ h, rig } = await openPayment({ summary: { payment: paymentJson(), stkStatus: 'TIMEOUT' } }));
    primary(h).click();
    await flushGet('/payments/e-1', summaryJson({ payment: paymentJson({ status: 'failed' }), stkStatus: 'FAILED' }));
    await h.detect();
    expect(heading(h)).toBe("Payment didn't go through");

    ({ h, rig } = await openPayment({ summary: { payment: paymentJson(), stkStatus: 'TIMEOUT' } }));
    expect(initiates()).toHaveLength(0);
    secondary(h).click();
    const req = await expectRequest(`${API}/payments/e-1/initiate`);
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1-abcdefgh');
  });

  it('VP T6. retry safety: initiate network error → initiate-error; Try again re-sends with the SAME key; no parallel initiations while in flight', async () => {
    const { h } = await openPayment({ intent: { route: 'send_to_runner' } });
    const first = await flushInitiate(h, 'network');
    expect(heading(h)).toBe("Couldn't send the prompt");
    primary(h).click();
    primary(h).click();
    await h.detect();
    primary(h).click();
    const pending = initiates();
    expect(pending).toHaveLength(1);
    expect(pending[0].request.headers.get('Idempotency-Key')).toBe(first.request.headers.get('Idempotency-Key'));
    expect(primary(h).disabled || primary(h).getAttribute('aria-busy') === 'true').toBe(true);
    pending[0].flush(initiateResult());
    await h.detect();
    expect(heading(h)).toBe('Check your phone');
  });

  it('VP T7. idempotency_key_reused → one retry with a new key; a second → initiate-error', async () => {
    let { h } = await openPayment({ intent: {} });
    const first = await flushInitiate(h, { code: 'idempotency_key_reused' });
    const retry = await flushInitiate(h, initiateResult());
    expect(retry.request.headers.get('Idempotency-Key')).not.toBe(first.request.headers.get('Idempotency-Key'));
    expect(heading(h)).toBe('Check your phone');

    ({ h } = await openPayment({ intent: {} }));
    await flushInitiate(h, { code: 'idempotency_key_reused' });
    await flushInitiate(h, { code: 'idempotency_key_reused' });
    expect(initiates()).toHaveLength(0);
    expect(heading(h)).toBe("Couldn't send the prompt");
  });

  it('VP T8. polling: 5 s before 2 min, 30 s after, stops at 10 min from createdAt; paused while hidden; an immediate check on becoming visible', async () => {
    const { h, rig } = await openPayment({ summary: PENDING_STORED(0) });
    expect(rig.timers.pending()).toEqual([STK_FAST_MS]);
    rig.timers.advance(STK_FAST_MS);
    await flushGet('/payments/e-1', summaryJson(PENDING_STORED(0)));
    await h.detect();
    expect(rig.timers.pending()).toEqual([STK_FAST_MS]);
    // Past 2 min after createdAt: 30 s.
    rig.timers.elapsed = 121_000;
    primary(h).click();
    await flushGet('/payments/e-1', summaryJson(PENDING_STORED(0)));
    await h.detect();
    expect(rig.timers.pending()).toEqual([STK_SLOW_MS]);
    // Hidden: the tick reads nothing and reschedules.
    visibility = 'hidden';
    rig.timers.advance(STK_SLOW_MS);
    await h.detect();
    expect(requests('/payments/e-1')).toHaveLength(0);
    expect(rig.timers.pending()).toEqual([STK_SLOW_MS]);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await flushGet('/payments/e-1', summaryJson(PENDING_STORED(0)));
    await h.detect();
    // 10 min after createdAt: no more polls.
    rig.timers.elapsed = 600_000;
    primary(h).click();
    await flushGet('/payments/e-1', summaryJson(PENDING_STORED(0)));
    await h.detect();
    expect(rig.timers.pending()).toEqual([]);
  });

  it('VP T9. amount separation (WQ-27): platform-only → KSh 1,100 and no Includes; customer_to_runner 40000 → KSh 41,100 + Includes KSh 40,000; merchant_direct 40000 → KSh 1,100, no Includes', async () => {
    const cases: [Partial<Payment>, string, string | null][] = [
      [{ merchantAmount: '0.00', paymentFlow: 'platform_only' }, 'KSh 1,100', null],
      [{ merchantAmount: '40000.00', paymentFlow: 'customer_to_runner' }, 'KSh 41,100', "Includes KSh 40,000 for your runner's purchase."],
      [{ merchantAmount: '40000.00', paymentFlow: 'merchant_direct' }, 'KSh 1,100', null],
      // Exact in cents (a float sum would drift to 41,100.29).
      [{ serviceFee: '440.10', runnerFee: '660.00', merchantAmount: '40000.20', paymentFlow: 'customer_to_runner' }, 'KSh 41,100.30', "Includes KSh 40,000.20 for your runner's purchase."],
    ];
    for (const [payment, amount, includes] of cases) {
      const { h } = await openPayment({ summary: { payment: paymentJson(payment), stkStatus: 'PENDING' } });
      const el = page(h).querySelector('.nm-stk__amount') as HTMLElement;
      expect.soft(text(el), payment.paymentFlow).toBe(amount);
      expect.soft(el.classList.contains('nm-num--amount-lg'), payment.paymentFlow).toBe(true);
      expect.soft(text(page(h).querySelector('.nm-stk__includes')) || null, payment.paymentFlow).toBe(includes);
      if (includes) expect.soft(page(h).querySelector('.nm-stk__includes [nmNum]')?.textContent).toBe(includes.slice(9, includes.indexOf(' for')));
      expect.soft(text(page(h)), payment.paymentFlow).not.toMatch(/Service fee|Runner fee|KSh 40,440|KSh 40,660/);
    }
  });

  it('VP T10. answers: quote_expired → quote with quoteExpired; quote_not_accepted / merchant_route_required / merchant_details_missing → quote; deadline_passed_before_payment → quote with deadlinePassed, no toast; errand_not_payable → A§2', async () => {
    const cases: [string, number, Record<string, boolean> | undefined][] = [
      ['quote_expired', 409, { quoteExpired: true }],
      ['quote_not_accepted', 409, undefined],
      ['merchant_route_required', 400, undefined],
      ['merchant_details_missing', 409, undefined],
      ['deadline_passed_before_payment', 409, { deadlinePassed: true }],
    ];
    for (const [code, status, state] of cases) {
      const { h } = await openPayment({ intent: {} });
      const nav = vi.spyOn(h.router, 'navigateByUrl');
      await flushInitiate(h, { code, status });
      expect.soft(nav, code).toHaveBeenCalledWith('/app/customer/tasks/e-1/quote', state ? { replaceUrl: true, state } : { replaceUrl: true });
      expect.soft(toastText(), code).toBeNull();
    }
    const { h } = await openPayment({ intent: {} });
    await flushInitiate(h, { code: 'errand_not_payable' });
    await flushGet('/errands/e-1', checkoutErrand({ status: 'CANCELLED' }));
    await routedTo(h, '/app/customer/tasks/e-1');
  });

  it('VP T11. reload / resume (WQ-28): stored PENDING 90 s old → PENDING, no initiate, first poll at 5 s; stored FAILED → FAILED, no initiate; SUCCESS → Track; no payment, no intent → quote, no initiate; intent + no payment → exactly one initiate with its route and method', async () => {
    let { h, rig } = await openPayment({ summary: PENDING_STORED(90_000) });
    expect(heading(h)).toBe('Check your phone');
    expect(initiates()).toHaveLength(0);
    expect(rig.timers.pending()).toEqual([STK_FAST_MS]);

    ({ h, rig } = await openPayment({ summary: { payment: paymentJson({ status: 'failed' }), stkStatus: 'FAILED' } }));
    expect(heading(h)).toBe("Payment didn't go through");
    expect(initiates()).toHaveLength(0);

    ({ h, rig } = await openPayment({ summary: { payment: paymentJson({ status: 'completed' }), stkStatus: 'SUCCESS' } }));
    rig.timers.advance(SUCCESS_DELAY_MS);
    await routedTo(h, '/app/customer/track/e-1');

    ({ h, rig } = await openPayment({ answer: false }));
    const nav = vi.spyOn(h.router, 'navigateByUrl');
    await answerLoad(h, {});
    expect(nav).toHaveBeenCalledWith('/app/customer/tasks/e-1/quote', { replaceUrl: true });
    expect(initiates()).toHaveLength(0);

    ({ h, rig } = await openPayment({ intent: { route: 'send_to_runner', paymentMethodId: 'pm-1' }, methods: [MPESA] }));
    const all = initiates();
    expect(all).toHaveLength(1);
    expect(all[0].request.body).toEqual({ merchantRoute: 'send_to_runner', paymentMethodId: 'pm-1' });
    expect(text(page(h).querySelector('.nm-stk__payer'))).toBe('+254 722 000 111');
  });

  it('VP T12. the intent is consumed once: a second load of the page in the same tab does not initiate again', async () => {
    const { h } = await openPayment({ intent: {} });
    await flushInitiate(h, 'network');
    await h.router.navigateByUrl('/app/customer/history');
    await routedTo(h, '/app/customer/history');
    void h.router.navigateByUrl(URL);
    await answerLoad(h, {});
    expect(initiates()).toHaveLength(0);
    await routedTo(h, '/app/customer/tasks/e-1/quote');
  });

  it('VP T13. entry routing (A§2): REQUESTED and QUOTED → quote; CANCELLED → task detail', async () => {
    for (const [status, target] of [
      ['REQUESTED', '/app/customer/tasks/e-1/quote'],
      ['QUOTED', '/app/customer/tasks/e-1/quote'],
      ['CANCELLED', '/app/customer/tasks/e-1'],
    ]) {
      const { h } = await openPayment({ answer: false, intent: {} });
      await answerLoad(h, { errand: { status } });
      if (target.endsWith('/quote')) await flushGet('/errands/e-1', checkoutErrand({ status }));
      await routedTo(h, target);
      expect.soft(initiates(), status).toHaveLength(0);
    }
  });

  it('VP T14. load error → Couldn’t load this payment.; Try again reloads', async () => {
    const { h } = await openPayment({ answer: false });
    await flushGet('/errands/e-1', null, 500);
    for (const r of [...requests('/payments/e-1'), ...requests('/customers/me/payment-methods')]) r.flush({});
    await h.detect();
    expect(text(page(h).querySelector('nm-error-state [role="alert"]'))).toBe("Couldn't load this payment.");
    (page(h).querySelector('nm-error-state button') as HTMLButtonElement).click();
    await answerLoad(h, { summary: PENDING_STORED() });
    expect(heading(h)).toBe('Check your phone');
  });

  it('VP T15. no beforeunload handler; no storage writes; history.state never carries the key or the intent', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const { h } = await openPayment({ intent: { route: 'send_to_runner', paymentMethodId: 'pm-1' } });
    await flushInitiate(h, initiateResult());
    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toEqual([]);
    expect(storageKeys()).toEqual([]);
    expect(JSON.stringify(history.state ?? {})).not.toMatch(/key-|send_to_runner|pm-1|Idempotency/);
  });

  it('VP T16. WQ-28: stored PENDING and TIMEOUT payments opened without an intent show their state; only a click (Send a new prompt / Try again) sends an initiate', async () => {
    let { h, rig } = await openPayment({ summary: PENDING_STORED(30_000) });
    rig.timers.advance(STK_FAST_MS);
    await flushGet('/payments/e-1', summaryJson(PENDING_STORED(30_000)));
    await h.detect();
    expect(initiates()).toHaveLength(0);
    ({ h, rig } = await openPayment({ summary: { payment: paymentJson(), stkStatus: 'TIMEOUT' } }));
    rig.timers.advance(STK_FAST_MS);
    await flushGet('/payments/e-1', summaryJson({ payment: paymentJson({ status: 'failed' }), stkStatus: 'FAILED' }));
    await h.detect();
    expect(heading(h)).toBe("Payment didn't go through");
    expect(initiates()).toHaveLength(0);
    primary(h).click();
    expect(initiates()).toHaveLength(1);
  });

  it('VP T17. WQ-27: every initiate body holds only merchantRoute? and paymentMethodId? (no amount, no fee field)', async () => {
    const bodies: unknown[] = [];
    let { h } = await openPayment({ intent: { route: 'merchant_direct', paymentMethodId: 'pm-1', payerDetail: '+254722000111' } });
    bodies.push((await flushInitiate(h, initiateResult({ stkStatus: 'FAILED', payment: paymentJson({ status: 'failed', paymentFlow: 'merchant_direct' }) }))).request.body);
    primary(h).click();
    bodies.push((await flushInitiate(h, initiateResult())).request.body);
    ({ h } = await openPayment({ intent: {} }));
    bodies.push((await flushInitiate(h, initiateResult())).request.body);
    ({ h } = await openPayment({ summary: { payment: paymentJson({ paymentFlow: 'customer_to_runner', merchantAmount: '40000.00' }), stkStatus: 'TIMEOUT' } }));
    secondary(h).click();
    bodies.push((await flushInitiate(h, initiateResult())).request.body);
    expect(bodies).toEqual([
      { merchantRoute: 'merchant_direct', paymentMethodId: 'pm-1' },
      { merchantRoute: 'merchant_direct', paymentMethodId: 'pm-1' },
      {},
      { merchantRoute: 'send_to_runner' },
    ]);
    for (const b of bodies) expect(Object.keys(b as object).every((k) => k === 'merchantRoute' || k === 'paymentMethodId')).toBe(true);
  });

  it('VP T18. reconnect through onStateChange → one immediate status read', async () => {
    const { h, rig } = await openPayment({ summary: PENDING_STORED() });
    rig.realtime.set('reconnecting');
    rig.realtime.set('connected');
    await flushGet('/payments/e-1', summaryJson(PENDING_STORED()));
    await h.detect();
    rig.realtime.set('connected');
    await h.detect();
    expect(requests('/payments/e-1')).toHaveLength(0);
    httpMock().match(() => true).forEach((r) => r.flush({}));
  });
});
