// customer-x-awaiting-quote.md, Required tests XQ T1–T23 (gap report G8-21,
// G8-24 … G8-26; the WQ-27 cases T5–T7, the WQ-2 cases T18–T19).
import { TestBed } from '@angular/core/testing';
import { AppHarness, text } from '../../../../testing/app-harness';
import { API, expectRequest, httpMock, storageKeys } from '../../../../testing/auth';
import {
  BASE_TIME,
  FEES,
  FakeRealtime,
  FakeTimers,
  MPESA,
  checkoutErrand,
  checkoutRig,
  flushGet,
  openCheckout,
  quoteJson,
  reopenWithState,
  requests,
  routedTo,
} from '../../../../testing/checkout';
import { clearOverlays, dialogActions, dialogButton } from '../../../../testing/customer';
import { declared, tokensOnly } from '../../../../testing/css';
import { formatClock, formatDayTime } from '../../../shared/format/formatters';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { CheckoutErrand, PaymentMethod, Quote } from '../data/checkout.api';
import { CheckoutIntentStore } from './checkout-intent.store';
import { QUOTE_COPY, QUOTE_POLL_MS, QUOTE_TICK_MS } from './awaiting-quote.page';

interface Opts {
  errand?: Partial<CheckoutErrand>;
  quote?: Partial<Quote> & Record<string, unknown>;
  methods?: PaymentMethod[];
  realtime?: FakeRealtime;
  timers?: FakeTimers;
  answer?: boolean;
  width?: number;
}

const page = (h: AppHarness) => h.root().querySelector('app-awaiting-quote-page') as HTMLElement;
const button = (h: AppHarness, selector: string) => page(h).querySelector(`${selector} button, ${selector} a`) as HTMLElement;
const toastText = () => {
  const m = TestBed.inject(NmToastService).current()?.message;
  return typeof m === 'string' ? m : null;
};

/** Answers the page's load: the errand, then (unless REQUESTED) quote + methods. */
async function answer(h: AppHarness, e: CheckoutErrand, o: Opts = {}): Promise<void> {
  await flushGet(`/errands/${e.id}`, e);
  if (['QUOTED', 'ACCEPTED'].includes(e.status)) {
    await flushGet(`/errands/${e.id}/quote`, quoteJson(o.quote));
    await flushGet('/customers/me/payment-methods', o.methods ?? []);
  }
  await h.detect();
}

async function openQuote(o: Opts = {}) {
  const rig = checkoutRig({ realtime: o.realtime, timers: o.timers });
  const e = checkoutErrand(o.errand);
  const h = await openCheckout(`/app/customer/tasks/${e.id}/quote`, rig, { width: o.width });
  if (o.answer !== false) await answer(h, e, o);
  return { h, rig, e };
}

let visibility: DocumentVisibilityState = 'visible';

describe('customer x-awaiting-quote (#8)', () => {
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });
  afterEach(() => {
    clearOverlays();
    TestBed.inject(NmToastService).dismiss();
    vi.restoreAllMocks();
  });

  it('XQ T1. routing (A§2): REQUESTED waiting, QUOTED checkout, ACCEPTED checkout with Awaiting payment; PAYMENT_CONFIRMED → Track, CANCELLED / EXPIRED → task detail (replaceUrl); unknown → load error', async () => {
    let { h } = await openQuote({ errand: { status: 'REQUESTED' } });
    expect(text(page(h).querySelector('.quote__heading'))).toBe('Preparing your quote');
    ({ h } = await openQuote({ errand: { status: 'QUOTED' } }));
    expect(page(h).querySelector('.quote__checkout')).not.toBeNull();
    expect(text(page(h).querySelector('nm-status-chip'))).toBe('Quote ready');
    ({ h } = await openQuote({ errand: { status: 'ACCEPTED' } }));
    expect(text(page(h).querySelector('nm-status-chip'))).toBe('Awaiting payment');
    expect(page(h).querySelector('.nm-chip')?.classList).toContain('nm-chip--pending');

    for (const [status, target] of [
      ['PAYMENT_CONFIRMED', '/app/customer/track/e-1'],
      ['CANCELLED', '/app/customer/tasks/e-1'],
      ['EXPIRED', '/app/customer/tasks/e-1'],
    ]) {
      const opened = await openQuote({ answer: false });
      const nav = vi.spyOn(opened.h.router, 'navigateByUrl');
      await flushGet('/errands/e-1', checkoutErrand({ status }));
      await opened.h.detect();
      expect.soft(nav, status).toHaveBeenCalledWith(target, { replaceUrl: true });
      await routedTo(opened.h, target);
    }

    const unknown = await openQuote({ answer: false });
    await flushGet('/errands/e-1', checkoutErrand({ status: 'TELEPORTING' }));
    await unknown.h.detect();
    expect(text(page(unknown.h).querySelector('nm-error-state [role="alert"]'))).toBe("Couldn't load this task.");
    expect(page(unknown.h).querySelector('.nm-chip')).toBeNull();
  });

  it('XQ T2. waiting: exact copy, dots label, chip Awaiting quote; Back to Home links Home; Cancel task is a red text button', async () => {
    const { h } = await openQuote({ errand: { status: 'REQUESTED' } });
    expect(text(page(h).querySelector('.nm-dots__label'))).toBe('Waiting for your quote');
    expect(text(page(h).querySelector('h1'))).toBe('Your quote');
    expect(text(page(h).querySelector('.quote__body'))).toBe(
      "We're pricing your task. This usually takes a few minutes, and we'll notify you when it's ready.",
    );
    expect(text(page(h).querySelector('nm-status-chip'))).toBe('Awaiting quote');
    expect(text(page(h).querySelector('.nm-task-summary__title'))).toBe('Buy For Me');
    const home = button(h, '.quote__home') as HTMLAnchorElement;
    expect(text(home)).toBe('Back to Home');
    expect(home.getAttribute('href')).toBe('/app/customer/home');
    const cancel = button(h, '.quote__cancel');
    expect(text(cancel)).toBe('Cancel task');
    expect(cancel.classList).toContain('nm-btn--text');
    expect(cancel.classList).toContain('nm-btn--destructive');
    home.click();
    await routedTo(h, '/app/customer/home');
  });

  it('XQ T3. live switch: errand:status_changed to QUOTED re-reads errand + quote + methods and shows checkout; announces Your quote is ready.', async () => {
    const { h, rig } = await openQuote({ errand: { status: 'REQUESTED' } });
    expect(rig.realtime.joinErrand).toHaveBeenCalledWith('e-1');
    rig.realtime.status('e-9', 'QUOTED');
    await h.detect();
    expect(requests('/errands/e-9')).toHaveLength(0);
    expect(requests('/errands/e-1')).toHaveLength(0);
    rig.realtime.status('e-1', 'QUOTED');
    await answer(h, checkoutErrand({ status: 'QUOTED' }));
    expect(page(h).querySelector('.quote__checkout')).not.toBeNull();
    expect(text(page(h).querySelector('.quote__announce'))).toBe('Your quote is ready.');
    expect(page(h).querySelector('.quote__announce')?.getAttribute('aria-live')).toBe('polite');
  });

  it('XQ T4. polling every 15 s only while the socket is down and the tab visible; none while connected; reconnect → one refetch', async () => {
    const { h, rig } = await openQuote({ errand: { status: 'REQUESTED' } });
    rig.timers.advance(QUOTE_POLL_MS);
    await h.detect();
    expect(requests('/errands/e-1')).toHaveLength(0);
    rig.realtime.set('reconnecting');
    rig.timers.advance(QUOTE_POLL_MS);
    await flushGet('/errands/e-1', checkoutErrand({ status: 'REQUESTED' }));
    await h.detect();
    visibility = 'hidden';
    rig.timers.advance(QUOTE_POLL_MS * 2);
    await h.detect();
    expect(requests('/errands/e-1')).toHaveLength(0);
    visibility = 'visible';
    rig.realtime.set('connected');
    await flushGet('/errands/e-1', checkoutErrand({ status: 'REQUESTED' }));
    await h.detect();
    expect(requests('/errands/e-1')).toHaveLength(0);
    rig.realtime.set('connected');
    await h.detect();
    expect(requests('/errands/e-1')).toHaveLength(0); // once only
  });

  it('XQ T5. fee total only (WQ-27): one Total (service + runner fee) row with feeTotal, fallbacks quote.total then quotedPrice; no split, no quote components', async () => {
    const components = { baseFee: '301.00', distanceFee: '302.00', timeFee: '303.00', urgencyFee: '304.00', complexityFee: '305.00', premiumFee: '306.00' };
    let { h } = await openQuote({ quote: { ...components, total: '9999.00' } });
    const rows = () => Array.from(page(h).querySelectorAll('.quote__final nm-receipt-row'));
    expect(rows()).toHaveLength(1);
    expect(text(rows()[0].querySelector('.nm-receipt-row__label'))).toBe('Total (service + runner fee)');
    expect(text(rows()[0].querySelector('.nm-receipt-row__amount'))).toBe('KSh 1,100');
    expect(rows()[0].querySelector('.nm-receipt-row__amount')?.getAttribute('aria-label')).toBe('1,100 shillings');
    const all = text(page(h));
    expect(all).not.toMatch(/Service fee|Runner fee/);
    for (const v of ['301', '302', '303', '304', '305', '306', '9,999']) expect.soft(all, v).not.toContain(v);
    ({ h } = await openQuote({ errand: { feeTotal: null }, quote: { total: '2200.00' } }));
    expect(text(page(h).querySelector('.quote__final .nm-receipt-row__amount'))).toBe('KSh 2,200');
    ({ h } = await openQuote({ errand: { feeTotal: null, quotedPrice: '3300.00' }, quote: { total: undefined as unknown as string } }));
    expect(text(page(h).querySelector('.quote__final .nm-receipt-row__amount'))).toBe('KSh 3,300');
  });

  it('XQ T6. item amount kept apart (WQ-27): Buy For Me 40000 → Item amount KSh 40,000 in its own card; fee row unchanged; Check It For Me or budget 0 → no route card', async () => {
    let { h } = await openQuote();
    const route = page(h).querySelector('.quote__route') as HTMLElement;
    expect(text(route.querySelector('.nm-form-card__label'))).toBe('How should this be paid?');
    expect(text(route.querySelector('nm-receipt-row .nm-receipt-row__label'))).toBe('Item amount');
    expect(text(route.querySelector('nm-receipt-row .nm-receipt-row__amount'))).toBe('KSh 40,000');
    expect(text(page(h).querySelector('.quote__final .nm-receipt-row__amount'))).toBe('KSh 1,100');
    expect(page(h).querySelectorAll('.quote__final nm-receipt-row')).toHaveLength(1);
    ({ h } = await openQuote({ errand: { category: 'inspection' } }));
    expect(page(h).querySelector('.quote__route')).toBeNull();
    ({ h } = await openQuote({ errand: { budget: '0.00' } }));
    expect(page(h).querySelector('.quote__route')).toBeNull();
    ({ h } = await openQuote({ errand: { category: 'pickup_delivery' } }));
    expect(page(h).querySelector('.quote__route')).not.toBeNull();
  });

  it('XQ T7. CTA charge (WQ-27): merchant-direct → the fee only; send-to-runner → fee + item via addKes (2200 + 40000 → KSh 42,200) with the Item amount row still shown; amount in nmNum', async () => {
    const { h } = await openQuote({ errand: { feeTotal: '2200.00' } });
    const cta = () => button(h, '.quote__pay');
    expect(text(cta())).toBe('Confirm & pay KSh 2,200 →');
    expect(cta().querySelector('[nmNum]')?.textContent).toBe('KSh 2,200');
    expect(cta().closest('nm-fixed-cta')).not.toBeNull();
    (page(h).querySelector('input[value="send_to_runner"]') as HTMLInputElement).click();
    await h.detect();
    expect(text(cta())).toBe('Confirm & pay KSh 42,200 →');
    expect(cta().querySelector('[nmNum]')?.textContent).toBe('KSh 42,200');
    expect(text(page(h).querySelector('.quote__route .nm-receipt-row__label'))).toBe('Item amount');
    expect(text(page(h).querySelector('.quote__route .nm-receipt-row__amount'))).toBe('KSh 40,000');
    expect(text(page(h))).not.toContain('KSh 41,100');
    (page(h).querySelector('input[value="merchant_direct"]') as HTMLInputElement).click();
    await h.detect();
    expect(text(cta())).toBe('Confirm & pay KSh 2,200 →');
  });

  it('XQ T8. route rows: default merchant-direct with details, else send-to-runner (merchant-direct disabled with its subtitle); merchant_details:updated enables it without changing the selection; blue/white selected; no runner_advance', async () => {
    let { h, rig } = await openQuote();
    const input = (v: string) => page(h).querySelector(`input[value="${v}"]`) as HTMLInputElement;
    expect(input('merchant_direct').checked).toBe(true);
    ({ h, rig } = await openQuote({ errand: { merchantDetailsAvailable: false } }));
    expect(input('send_to_runner').checked).toBe(true);
    expect(input('merchant_direct').getAttribute('aria-disabled')).toBe('true');
    expect(text(page(h).querySelectorAll('.nm-radio-row')[0])).toContain("Available once the merchant's details are added.");
    const selected = page(h).querySelector('.nm-radio-row--selected') as HTMLElement;
    expect(getComputedStyle(selected.querySelector('.nm-radio-row__label') as HTMLElement).color).toBe('var(--nitume-white)');
    expect(declared('.nm-radio-row--selected', 'background-color')).toEqual(['var(--nitume-blue)']);
    rig.realtime.merchantDetailsUpdates$.next({ errandId: 'e-1', merchantName: 'X', tillNumber: '999', paybillNumber: null, accountReference: null });
    await answer(h, checkoutErrand({ merchantDetailsAvailable: true }));
    expect(input('merchant_direct').disabled).toBe(false);
    expect(input('send_to_runner').checked).toBe(true);
    expect(text(page(h))).not.toContain('999');
    expect(page(h).querySelectorAll('.quote__route input[type="radio"]')).toHaveLength(2);
    expect(text(page(h))).not.toMatch(/advance/i);
  });

  it('XQ T9. payer: the default method; no methods → the masked sign-in phone + Your sign-in number; no Change before #12', async () => {
    let { h } = await openQuote({ methods: [{ ...MPESA, id: 'pm-0', isDefault: false, detail: '+254 733 ••• 000' }, MPESA] });
    const card = () => page(h).querySelector('.quote__payer nm-payment-method-card') as HTMLElement;
    expect(text(card().querySelector('.nm-payment-method-card__label'))).toBe('M-Pesa');
    expect(text(card().querySelector('.nm-payment-method-card__detail'))).toBe('+254 722 ••• 111');
    expect(page(h).querySelector('.quote__payer-note')).toBeNull();
    ({ h } = await openQuote({ methods: [] }));
    expect(text(card().querySelector('.nm-payment-method-card__detail'))).toBe('+254 712 ••• 678');
    expect(card().querySelector('.nm-payment-method-card__detail')?.hasAttribute('nmNum')).toBe(true);
    expect(text(page(h).querySelector('.quote__payer-note'))).toBe('Your sign-in number');
    expect(text(page(h).querySelector('.quote__payer'))).not.toContain('Change');
  });

  it('XQ T10. quote accept: QUOTED → POST accept, then the intent { route, paymentMethodId } and …/payment; ACCEPTED re-quote → accept; ACCEPTED → no accept; budget 0 → no route', async () => {
    const cases: [Partial<CheckoutErrand>, boolean, Record<string, unknown>][] = [
      [{ status: 'QUOTED' }, true, { route: 'merchant_direct', paymentMethodId: 'pm-1', payerDetail: '+254722000111' }],
      [{ status: 'ACCEPTED', quoteAcceptanceRequired: true }, true, { route: 'merchant_direct', paymentMethodId: 'pm-1', payerDetail: '+254722000111' }],
      [{ status: 'ACCEPTED' }, false, { route: 'merchant_direct', paymentMethodId: 'pm-1', payerDetail: '+254722000111' }],
      [{ status: 'QUOTED', budget: '0.00' }, true, { paymentMethodId: 'pm-1', payerDetail: '+254722000111' }],
    ];
    for (const [errand, accepts, intent] of cases) {
      const { h } = await openQuote({ errand, methods: [MPESA] });
      const set = vi.spyOn(TestBed.inject(CheckoutIntentStore), 'set');
      const nav = vi.spyOn(h.router, 'navigateByUrl');
      button(h, '.quote__pay').click();
      await h.detect();
      const accept = requests('/errands/e-1/quote/accept');
      expect.soft(accept, JSON.stringify(errand)).toHaveLength(accepts ? 1 : 0);
      if (accepts) {
        expect(accept[0].request.method).toBe('POST');
        expect(accept[0].request.body).toBeNull();
        accept[0].flush({ errand: checkoutErrand({ status: 'ACCEPTED' }), quote: quoteJson() });
        await h.detect();
      }
      expect.soft(set, JSON.stringify(errand)).toHaveBeenCalledWith('e-1', intent);
      expect.soft(nav, JSON.stringify(errand)).toHaveBeenCalledWith('/app/customer/tasks/e-1/payment');
    }
  });

  it('XQ T11. accept errors: quote_expired → the expired state without a toast; another 409 → reload; 500 → toast', async () => {
    let { h } = await openQuote();
    button(h, '.quote__pay').click();
    (await expectRequest(`${API}/errands/e-1/quote/accept`)).flush({ statusCode: 409, code: 'quote_expired', message: 'x' }, { status: 409, statusText: 'Conflict' });
    await h.detect();
    expect(text(page(h).querySelector('.quote__notice--expired'))).toBe(QUOTE_COPY.expired);
    expect(toastText()).toBeNull();

    ({ h } = await openQuote());
    button(h, '.quote__pay').click();
    (await expectRequest(`${API}/errands/e-1/quote/accept`)).flush({ statusCode: 409, code: 'quote_not_acceptable', message: 'x' }, { status: 409, statusText: 'Conflict' });
    await answer(h, checkoutErrand());
    expect(toastText()).toBeNull();

    ({ h } = await openQuote());
    button(h, '.quote__pay').click();
    (await expectRequest(`${API}/errands/e-1/quote/accept`)).flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    await h.detect();
    expect(toastText()).toBe("Couldn't accept the quote. Try again.");
    expect(h.router.url).toBe('/app/customer/tasks/e-1/quote');
  });

  it('XQ T12. decline: exact confirm copy, confirm outline red, Keep task primary; Keep → no call; confirm → PATCH CANCELLED, toast, Home (replaceUrl); failure → toast', async () => {
    let { h } = await openQuote();
    button(h, '.quote__decline').click();
    await h.detect();
    expect(text(document.querySelector('nm-dialog .nm-dialog__title'))).toBe('Cancel this task?');
    expect(text(document.querySelector('nm-dialog .nm-dialog__body'))).toBe('Nothing has been charged yet.');
    const actions = dialogActions();
    expect(actions.map((a) => a.label)).toEqual(['Cancel task', 'Keep task']);
    expect(actions[0].classes).toContain('nm-btn--outline');
    expect(actions[0].classes).toContain('nm-btn--destructive');
    expect(actions[1].classes).toContain('nm-btn--primary');
    dialogButton('Keep task').click();
    await h.detect();
    expect(requests('/errands/e-1/status')).toHaveLength(0);

    button(h, '.quote__decline').click();
    await h.detect();
    const nav = vi.spyOn(h.router, 'navigateByUrl');
    dialogButton('Cancel task').click();
    const patch = await expectRequest(`${API}/errands/e-1/status`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ to: 'CANCELLED' });
    patch.flush({ errand: checkoutErrand({ status: 'CANCELLED' }) });
    await h.detect();
    expect(toastText()).toBe('Task cancelled.');
    expect(nav).toHaveBeenCalledWith('/app/customer/home', { replaceUrl: true });

    ({ h } = await openQuote());
    button(h, '.quote__decline').click();
    await h.detect();
    dialogButton('Cancel task').click();
    (await expectRequest(`${API}/errands/e-1/status`)).flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    await h.detect();
    expect(toastText()).toBe("Couldn't cancel the task. Try again.");
  });

  it('XQ T13. expired by the injected clock while open and by navigation state: no chip, Expired at, route and payer cards hidden, the notice and Request a new quote', async () => {
    const expiresAt = new Date(BASE_TIME + 20_000).toISOString();
    const { h, rig } = await openQuote({ errand: { quoteExpiresAt: expiresAt } });
    expect(text(page(h).querySelector('nm-receipt-caption'))).toBe(`Valid until ${formatClock(expiresAt)}`);
    expect(page(h).querySelector('nm-receipt-caption [nmNum]')?.textContent).toBe(formatClock(expiresAt));
    rig.timers.advance(QUOTE_TICK_MS);
    await h.detect();
    const expectExpired = () => {
      expect(page(h).querySelector('nm-status-chip')).toBeNull();
      expect(text(page(h).querySelector('nm-receipt-caption'))).toMatch(/^Expired at /);
      expect(page(h).querySelector('.quote__route')).toBeNull();
      expect(page(h).querySelector('.quote__payer')).toBeNull();
      expect(text(page(h).querySelector('.quote__notice--expired'))).toBe('This quote has expired. Ask for a new quote to continue.');
      expect(text(page(h).querySelector('.quote__cta button'))).toBe('Request a new quote');
      expect(text(button(h, '.quote__decline'))).toBe('Decline and cancel task');
    };
    expectExpired();

    // By navigation state (v-payment's `quote_expired`), even before the stored expiry.
    await reopenWithState(h, '/app/customer/tasks/e-2/quote', { quoteExpired: true });
    await answer(h, checkoutErrand({ id: 'e-2', quoteExpiresAt: new Date(BASE_TIME + 600_000).toISOString() }));
    expectExpired();
  });

  it('XQ T14. request a new quote: success and quote_request_pending → toast + New quote requested with Requested … in nmNum; quote_still_valid → checkout; quote_request_not_allowed → reload; 500 → error toast', async () => {
    const requestedAt = new Date(BASE_TIME).toISOString();
    for (const answerWith of ['ok', 'quote_request_pending']) {
      const { h } = await openQuote({ errand: { quoteExpiresAt: new Date(BASE_TIME - 1000).toISOString() } });
      button(h, '.quote__cta').click();
      const req = await expectRequest(`${API}/errands/e-1/quote/request`);
      expect(req.request.method).toBe('POST');
      if (answerWith === 'ok') req.flush(checkoutErrand({ quoteRequestedAt: requestedAt }));
      else req.flush({ statusCode: 409, code: answerWith, message: 'x' }, { status: 409, statusText: 'Conflict' });
      await answer(h, checkoutErrand({ quoteRequestedAt: requestedAt, quoteExpiresAt: new Date(BASE_TIME - 1000).toISOString() }));
      expect.soft(toastText(), answerWith).toBe("We've asked for a new quote.");
      expect.soft(text(page(h).querySelector('.quote__heading')), answerWith).toBe('Preparing a new quote');
      const line = page(h).querySelector('.quote__requested') as HTMLElement;
      expect.soft(line.hasAttribute('nmNum'), answerWith).toBe(true);
      expect.soft(text(line), answerWith).toBe(`Requested ${formatDayTime(requestedAt, new Date(BASE_TIME))}`);
    }

    let { h } = await openQuote();
    await reopenWithState(h, '/app/customer/tasks/e-2/quote', { quoteExpired: true });
    await answer(h, checkoutErrand({ id: 'e-2' }));
    button(h, '.quote__cta').click();
    (await expectRequest(`${API}/errands/e-2/quote/request`)).flush({ statusCode: 409, code: 'quote_still_valid', message: 'x' }, { status: 409, statusText: 'Conflict' });
    await answer(h, checkoutErrand({ id: 'e-2' }));
    expect(text(button(h, '.quote__pay'))).toBe('Confirm & pay KSh 1,100 →');

    ({ h } = await openQuote({ errand: { quoteExpiresAt: new Date(BASE_TIME - 1000).toISOString() } }));
    button(h, '.quote__cta').click();
    (await expectRequest(`${API}/errands/e-1/quote/request`)).flush({ statusCode: 409, code: 'quote_request_not_allowed', message: 'x' }, { status: 409, statusText: 'Conflict' });
    await flushGet('/errands/e-1', checkoutErrand({ status: 'CANCELLED' }));
    await routedTo(h, '/app/customer/tasks/e-1');

    ({ h } = await openQuote({ errand: { quoteExpiresAt: new Date(BASE_TIME - 1000).toISOString() } }));
    button(h, '.quote__cta').click();
    (await expectRequest(`${API}/errands/e-1/quote/request`)).flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    await h.detect();
    expect(toastText()).toBe("Couldn't request a new quote. Try again.");
    expect(text(page(h).querySelector('.quote__notice--expired'))).toBe(QUOTE_COPY.expired);
  });

  it('XQ T15. New quote requested restored on load; quote:reissued switches back to checkout with the new total and announces Your new quote is ready.', async () => {
    const { h, rig } = await openQuote({ errand: { quoteRequestedAt: new Date(BASE_TIME - 60_000).toISOString() } });
    expect(text(page(h).querySelector('.quote__heading'))).toBe('Preparing a new quote');
    expect(text(page(h).querySelector('.quote__body'))).toBe("You asked for a new quote. We'll notify you when it's ready.");
    expect(text(page(h).querySelector('.nm-dots__label'))).toBe('Waiting for your new quote');
    expect(page(h).querySelector('nm-status-chip')).toBeNull();
    expect(page(h).querySelector('.quote__cta')).toBeNull();
    rig.realtime.quoteReissues$.next({ errandId: 'e-1', quoteId: 'q-2', total: '1500.00', currency: 'KES', expiresAt: null, status: 'QUOTED', acceptanceRequired: false });
    await answer(h, checkoutErrand({ feeTotal: '1500.00', quoteRequestedAt: new Date(BASE_TIME - 60_000).toISOString() }), {
      quote: { total: '1500.00', createdAt: new Date(BASE_TIME).toISOString() },
    });
    expect(text(page(h).querySelector('.quote__final .nm-receipt-row__amount'))).toBe('KSh 1,500');
    expect(text(page(h).querySelector('.quote__announce'))).toBe('Your new quote is ready.');
  });

  it('XQ T16. outside area: REQUESTED + flag → owner copy, primary Cancel task first; QUOTED valid + flag → checkout; QUOTED expired + flag → outside (not expired)', async () => {
    let { h } = await openQuote({ errand: { status: 'REQUESTED', outsideServiceArea: true } });
    expect(text(page(h).querySelector('[role="status"] .quote__heading'))).toBe("We can't take this task");
    expect(text(page(h).querySelector('.quote__body'))).toBe(
      "Its location is outside the areas we serve. You can cancel it; you haven't paid anything.",
    );
    const buttons = Array.from(page(h).querySelectorAll('.quote__buttons nm-button')).map((b) => ({
      label: text(b),
      classes: (b.querySelector('button, a') as HTMLElement).className,
    }));
    expect(buttons.map((b) => b.label)).toEqual(['Cancel task', 'Back to Home']);
    expect(buttons[0].classes).toContain('nm-btn--primary');
    expect(buttons[1].classes).toContain('nm-btn--outline');
    expect(page(h).querySelector('nm-pulsing-dots')).toBeNull();
    expect(text(page(h).querySelector('nm-status-chip'))).toBe('Awaiting quote');

    ({ h } = await openQuote({ errand: { outsideServiceArea: true, quoteExpiresAt: new Date(BASE_TIME + 600_000).toISOString() } }));
    expect(page(h).querySelector('.quote__checkout')).not.toBeNull();
    ({ h } = await openQuote({ errand: { outsideServiceArea: true, quoteExpiresAt: new Date(BASE_TIME - 1000).toISOString() } }));
    expect(text(page(h).querySelector('.quote__heading'))).toBe("We can't take this task");
    expect(page(h).querySelector('nm-status-chip')).toBeNull();
    expect(page(h).querySelector('.quote__notice--expired')).toBeNull();
  });

  it('XQ T17. deadline passed on load → notice + Choose a new deadline (no pay CTA); an expired quote takes precedence', async () => {
    const passed = new Date(BASE_TIME - 3_600_000).toISOString();
    let { h } = await openQuote({ errand: { deadlineAt: passed } });
    expect(text(page(h).querySelector('.quote__notice--deadline'))).toBe('Your deadline has passed. Choose a new one to continue.');
    expect(text(page(h).querySelector('.quote__cta button'))).toBe('Choose a new deadline');
    expect(page(h).querySelector('.quote__pay')).toBeNull();
    expect(page(h).querySelector('.nm-deadline-line__change')).toBeNull();
    ({ h } = await openQuote({ errand: { deadlineAt: passed, quoteExpiresAt: new Date(BASE_TIME - 1000).toISOString() } }));
    expect(page(h).querySelector('.quote__notice--deadline')).toBeNull();
    expect(text(page(h).querySelector('.quote__cta button'))).toBe('Request a new quote');
  });

  describe('XQ T18. deadline panel (WQ-2, EAT) under Europe/London and Africa/Nairobi', () => {
    const original = process.env['TZ'];
    afterEach(() => {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    });
    const chips = () => Array.from(document.querySelectorAll<HTMLButtonElement>('nm-panel [role="radio"]'));
    const chip = (label: string) => chips().find((c) => text(c) === label) as HTMLButtonElement;
    const defaults = async () => flushGet('/errands/defaults', { defaultDeadlineHours: 24, defaultDeadlineStartsAt: 'payment_confirmed' });

    for (const zone of ['Europe/London', 'Africa/Nairobi']) {
      it(`XQ T18 (${zone}). Today caption with 23:59 in nmNum; Tomorrow sends 23:59 EAT of the next EAT date as UTC; disabled + Saving while saving; success closes and restores the pay CTA with the quote unchanged`, async () => {
        process.env['TZ'] = zone;
        const today = '2026-11-01T20:59:00.000Z';
        const { h } = await openQuote({ errand: { deadlineAt: today } });
        button(h, '.nm-deadline-line__change').click();
        await defaults();
        await h.detect();
        expect(text(document.querySelector('nm-panel .nm-panel__title'))).toBe('Deadline');
        expect(chips().map((c) => text(c))).toEqual(['Today', 'Tomorrow', 'Flexible']);
        expect(chip('Today').getAttribute('aria-checked')).toBe('true');
        const caption = document.querySelector('nm-panel .deadline-panel__caption') as HTMLElement;
        expect(text(caption)).toBe('Due today, 23:59 EAT.');
        expect(caption.querySelector('[nmNum]')?.textContent).toBe('23:59');
        chip('Tomorrow').click();
        await h.detect();
        const patch = await expectRequest(`${API}/errands/e-1`);
        expect(patch.request.method).toBe('PATCH');
        expect(patch.request.body).toEqual({ deadlineAt: '2026-11-02T20:59:00.000Z' });
        expect(text(document.querySelector('nm-panel .deadline-panel__caption'))).toBe('Due tomorrow, 23:59 EAT.');
        expect(chips().every((c) => c.getAttribute('aria-disabled') === 'true')).toBe(true);
        expect(text(document.querySelector('nm-panel nm-pulsing-dots .nm-dots__label'))).toBe('Saving');
        chip('Flexible').click();
        await h.detect();
        expect(httpMock().match((r) => r.method === 'PATCH')).toHaveLength(0);
        patch.flush(checkoutErrand({ deadlineAt: '2026-11-02T20:59:00.000Z' }));
        await answer(h, checkoutErrand({ deadlineAt: '2026-11-02T20:59:00.000Z' }));
        expect(document.querySelector('nm-panel')).toBeNull();
        expect(text(button(h, '.quote__pay'))).toBe('Confirm & pay KSh 1,100 →');
        expect(text(page(h).querySelector('.nm-deadline-line__value'))).toBe('Tomorrow, 23:59 EAT');
      });
    }

    it('XQ T18. Today is hidden once 23:59 EAT has passed, whatever the zone (21:30 London on 1 Nov is 00:30 EAT on 2 Nov: Today shown for 2 Nov)', async () => {
      for (const zone of ['Europe/London', 'Africa/Nairobi']) {
        process.env['TZ'] = zone;
        let { h } = await openQuote({ timers: new FakeTimers(new Date('2026-11-01T20:59:30.000Z').getTime()) });
        button(h, '.nm-deadline-line__change').click();
        await defaults();
        await h.detect();
        expect.soft(chips().map((c) => text(c)), zone).toEqual(['Tomorrow', 'Flexible']);
        clearOverlays();
        ({ h } = await openQuote({ timers: new FakeTimers(new Date('2026-11-01T21:30:00.000Z').getTime()), errand: { deadlineAt: '2026-11-02T20:59:00.000Z' } }));
        button(h, '.nm-deadline-line__change').click();
        await defaults();
        await h.detect();
        expect.soft(chips().map((c) => text(c)), zone).toEqual(['Today', 'Tomorrow', 'Flexible']);
        expect.soft(chip('Today').getAttribute('aria-checked'), zone).toBe('true');
        chip('Tomorrow').click();
        const patch = await expectRequest(`${API}/errands/e-1`);
        expect.soft(patch.request.body, zone).toEqual({ deadlineAt: '2026-11-03T20:59:00.000Z' });
        patch.flush(checkoutErrand());
        await answer(h, checkoutErrand());
        clearOverlays();
      }
    });

    it('XQ T18. Flexible sends deadlineAt: null and shows the caption from defaults; the current chip just closes; deadline_not_editable → reload; 400 → the danger notice in the panel', async () => {
      let { h } = await openQuote({ errand: { deadlineAt: null } });
      button(h, '.nm-deadline-line__change').click();
      await defaults();
      await h.detect();
      expect(chip('Flexible').getAttribute('aria-checked')).toBe('true');
      const caption = document.querySelector('nm-panel .deadline-panel__caption') as HTMLElement;
      expect(text(caption)).toBe("No fixed time. Your task's deadline is 24 hours after your payment is confirmed.");
      expect(caption.querySelector('[nmNum]')?.textContent).toBe('24 hours');
      chip('Flexible').click();
      await h.detect();
      expect(document.querySelector('nm-panel')).toBeNull();
      expect(httpMock().match((r) => r.method === 'PATCH')).toHaveLength(0);

      ({ h } = await openQuote({ errand: { deadlineAt: '2026-11-01T20:59:00.000Z' } }));
      button(h, '.nm-deadline-line__change').click();
      await defaults();
      await h.detect();
      chip('Flexible').click();
      let patch = await expectRequest(`${API}/errands/e-1`);
      expect(patch.request.body).toEqual({ deadlineAt: null });
      patch.flush({ statusCode: 409, code: 'deadline_not_editable', message: 'x' }, { status: 409, statusText: 'Conflict' });
      await answer(h, checkoutErrand());
      expect(document.querySelector('nm-panel')).toBeNull();

      ({ h } = await openQuote({ errand: { deadlineAt: '2026-11-01T20:59:00.000Z' } }));
      button(h, '.nm-deadline-line__change').click();
      await defaults();
      await h.detect();
      chip('Tomorrow').click();
      patch = await expectRequest(`${API}/errands/e-1`);
      patch.flush({ statusCode: 400, code: 'deadline_in_past', message: 'x' }, { status: 400, statusText: 'Bad Request' });
      await h.detect();
      await h.detect();
      expect(document.querySelector('nm-panel')).not.toBeNull();
      expect(text(document.querySelector('nm-panel [role="alert"] nm-notice'))).toBe("Couldn't change the deadline. Try again.");
      expect(document.querySelector('nm-panel .nm-notice--danger')).not.toBeNull();
      expect(chips().every((c) => c.getAttribute('aria-disabled') !== 'true')).toBe(true);
    });

    it('XQ T18. the passed-deadline CTA opens the same panel; success clears the flag and restores Confirm & pay', async () => {
      const { h } = await openQuote({ errand: { deadlineAt: new Date(BASE_TIME - 3_600_000).toISOString() } });
      button(h, '.quote__cta').click();
      await defaults();
      await h.detect();
      chip('Tomorrow').click();
      (await expectRequest(`${API}/errands/e-1`)).flush(checkoutErrand({ deadlineAt: '2026-11-02T20:59:00.000Z' }));
      await answer(h, checkoutErrand({ deadlineAt: '2026-11-02T20:59:00.000Z' }));
      expect(page(h).querySelector('.quote__notice--deadline')).toBeNull();
      expect(text(button(h, '.quote__pay'))).toBe('Confirm & pay KSh 1,100 →');
    });
  });

  it('XQ T19. deadline line: formatDeadlineEat (24-hour, Q8-3) in nmNum + EAT outside it, the same under both zones; Flexible copy; Change opens the panel', async () => {
    const original = process.env['TZ'];
    try {
      for (const zone of ['Europe/London', 'Africa/Nairobi']) {
        process.env['TZ'] = zone;
        const { h } = await openQuote({ errand: { deadlineAt: '2026-11-01T20:59:00.000Z' } });
        const value = page(h).querySelector('.nm-deadline-line__value') as HTMLElement;
        expect.soft(text(value), zone).toBe('Today, 23:59 EAT');
        expect.soft(value.querySelector('[nmNum]')?.textContent, zone).toBe('Today, 23:59');
      }
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
    const { h } = await openQuote();
    expect(text(page(h).querySelector('.nm-deadline-line__none'))).toBe('No deadline yet. It starts when your payment is confirmed.');
    button(h, '.nm-deadline-line__change').click();
    await flushGet('/errands/defaults', { defaultDeadlineHours: 24, defaultDeadlineStartsAt: 'payment_confirmed' });
    await h.detect();
    expect(document.querySelector('nm-panel')).not.toBeNull();
    expect(page(h).querySelector('.nm-deadline-line__change')).toBeNull(); // hidden while the panel is open
  });

  it('XQ T20. layout: the main column (summary, final quote, route) before the aside (payer, CTA, decline) in DOM order; CTA in nm-fixed-cta; the grid is CSS from 1024px', async () => {
    const { h } = await openQuote({ width: 1280 });
    const checkout = page(h).querySelector('.quote__checkout') as HTMLElement;
    expect(Array.from(checkout.children).map((c) => c.className)).toEqual(['quote__main', 'quote__aside']);
    const order = Array.from(checkout.querySelectorAll('.quote__summary, .quote__final, .quote__route, .quote__payer, nm-fixed-cta, .quote__decline')).map(
      (e) => e.classList[0] ?? e.tagName.toLowerCase(),
    );
    expect(order).toEqual(['quote__summary', 'quote__card', 'quote__card', 'quote__card', 'quote__cta', 'quote__decline']);
    expect(page(h).querySelector('nm-fixed-cta .quote__pay')).not.toBeNull();
    const media = Array.from(document.styleSheets).flatMap((s) =>
      Array.from(s.cssRules).filter((r) => r instanceof CSSMediaRule && r.conditionText.includes('min-width: 1024px')),
    ) as CSSMediaRule[];
    expect(media.some((m) => m.cssText.includes('quote__checkout') && m.cssText.includes('minmax(0, 1fr) 360px'))).toBe(true);
    expect(declared('.quote__column', 'max-width')).toContain('560px');
  });

  it('XQ T21. tokens and fonts: no raw colours; reference + created time, Valid until, deadline value, amounts, CTA amount and the masked phone in nmNum', async () => {
    const { h } = await openQuote({ errand: { deadlineAt: '2026-11-01T20:59:00.000Z', quoteExpiresAt: new Date(BASE_TIME + 600_000).toISOString() } });
    expect(tokensOnly()).toBe(true);
    for (const selector of [
      '.nm-task-summary__meta',
      'nm-receipt-caption [nmNum]',
      '.nm-deadline-line__value [nmNum]',
      '.quote__final .nm-receipt-row__amount',
      '.quote__route .nm-receipt-row__amount',
      '.quote__pay [nmNum]',
      '.nm-payment-method-card__detail',
    ]) {
      const el = page(h).querySelector(selector) as HTMLElement;
      expect.soft(el, selector).not.toBeNull();
      expect.soft(el?.hasAttribute('nmNum'), selector).toBe(true);
    }
    expect(text(page(h))).not.toMatch(/\bKES\b|wallet|escrow/i);
  });

  it('XQ T22. no storage writes during the flow; history.state never carries the intent or the key', async () => {
    const { h } = await openQuote({ methods: [MPESA] });
    button(h, '.quote__pay').click();
    (await expectRequest(`${API}/errands/e-1/quote/accept`)).flush({ errand: checkoutErrand({ status: 'ACCEPTED' }), quote: quoteJson() });
    await h.detect();
    expect(storageKeys()).toEqual([]);
    expect(JSON.stringify(history.state ?? {})).not.toMatch(/route|paymentMethodId|payerDetail|Idempotency|merchant_direct/);
  });

  it('XQ T23. merchant data (#28): no merchant name, Till, Paybill or account value renders even when the errand carries them', async () => {
    const leaky = { merchantName: 'Naivas Nyali', merchantTillNumber: '123456', merchantPaybillNumber: '654321', merchantAccountReference: 'ACC-9' };
    const { h } = await openQuote({ errand: leaky as Partial<CheckoutErrand> });
    const all = text(page(h));
    for (const v of Object.values(leaky)) expect.soft(all, v).not.toContain(v);
    expect(FEES.feeTotal).toBe('1100.00');
  });
  it('XQ T24. same route, another errand (A§1): /tasks/e-1/quote → /tasks/e-2/quote shows e-2, switches rooms, closes the open panel, ignores e-1 events and polls e-2; back to e-1 re-reads e-1', async () => {
    const { h, rig } = await openQuote({ errand: { reference: 'NT-1' } });
    button(h, '.nm-deadline-line__change').click();
    await flushGet('/errands/defaults', { defaultDeadlineHours: 24, defaultDeadlineStartsAt: 'payment_confirmed' });
    await h.detect();
    expect(document.querySelector('nm-panel')).not.toBeNull();

    void h.router.navigateByUrl('/app/customer/tasks/e-2/quote');
    await answer(h, checkoutErrand({ id: 'e-2', reference: 'NT-2', feeTotal: '2200.00' }), { quote: { total: '2200.00' } });
    await routedTo(h, '/app/customer/tasks/e-2/quote');
    expect(document.querySelector('nm-panel')).toBeNull();
    expect(rig.realtime.leaveErrand).toHaveBeenCalledWith('e-1');
    expect(rig.realtime.joinErrand).toHaveBeenLastCalledWith('e-2');
    expect(text(page(h).querySelector('.nm-task-summary__meta'))).toMatch(/^#NT-2 /);
    expect(text(page(h).querySelector('.quote__final .nm-receipt-row__amount'))).toBe('KSh 2,200');
    expect(text(page(h))).not.toContain('NT-1');

    rig.realtime.status('e-1', 'CANCELLED');
    await h.detect();
    expect(requests('/errands/e-1')).toHaveLength(0);
    expect(requests('/errands/e-2')).toHaveLength(0);
    rig.realtime.set('reconnecting');
    rig.timers.advance(QUOTE_POLL_MS);
    await h.detect();
    expect(requests('/errands/e-1')).toHaveLength(0);
    await flushGet('/errands/e-2', checkoutErrand({ id: 'e-2', reference: 'NT-2', feeTotal: '2200.00' }));
    await flushGet('/errands/e-2/quote', quoteJson({ total: '2200.00' }));
    await flushGet('/customers/me/payment-methods', []);
    rig.realtime.state.set('connected');

    void h.router.navigateByUrl('/app/customer/tasks/e-1/quote');
    await answer(h, checkoutErrand({ reference: 'NT-1' }));
    await routedTo(h, '/app/customer/tasks/e-1/quote');
    expect(rig.realtime.joinErrand).toHaveBeenLastCalledWith('e-1');
    expect(text(page(h).querySelector('.nm-task-summary__meta'))).toMatch(/^#NT-1 /);
    expect(text(page(h).querySelector('.quote__final .nm-receipt-row__amount'))).toBe('KSh 1,100');
  });
});
