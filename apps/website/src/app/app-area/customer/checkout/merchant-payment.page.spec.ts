// customer-x-merchant-payment.md, Required tests MP T1–T16 (gap report
// G8-8, G8-31, G8-32; owner WQ-27 in T3, OA-5 / #28 in T6).
import { Location } from '@angular/common';
import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppHarness, NO_LINKS, text } from '../../../../testing/app-harness';
import { API, expectRequest } from '../../../../testing/auth';
import {
  FakeRealtime,
  FakeTimers,
  checkoutErrand,
  checkoutRig,
  differenceJson,
  directMerchant,
  flushGet,
  openCheckout,
  paymentJson,
  requests,
  routedTo,
  summaryJson,
} from '../../../../testing/checkout';
import { clearOverlays } from '../../../../testing/customer';
import { NM_CLIPBOARD } from '../../../shared/ui/copy-row/copy-row.component';
import { NmFixedCtaOffset } from '../../../shared/ui/fixed-cta/fixed-cta.component';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { CheckoutErrand, PaymentSummary } from '../data/checkout.api';
import { STK_FAST_MS, STK_SLOW_MS } from './stk';

interface Opts {
  errand?: Partial<CheckoutErrand>;
  summary?: Partial<PaymentSummary>;
  state?: Record<string, unknown>;
  timers?: FakeTimers;
  realtime?: FakeRealtime;
  support?: string;
  providers?: Provider[];
  direct?: boolean;
  answer?: boolean;
}

const URL = '/app/customer/tasks/e-1/item-payment';
const page = (h: AppHarness) => h.root().querySelector('app-merchant-payment-page') as HTMLElement;
const rowLabels = (h: AppHarness) => Array.from(page(h).querySelectorAll('nm-copy-row .nm-copy-row__label')).map((e) => text(e));
const toast = () => TestBed.inject(NmToastService).current();
const PAID = { payment: paymentJson({ status: 'completed', paymentFlow: 'merchant_direct', merchantAmount: '40000.00' }) };

async function answerLoad(h: AppHarness, o: Opts): Promise<void> {
  await flushGet('/errands/e-1', checkoutErrand({ status: 'IN_PROGRESS', ...o.errand }));
  await flushGet('/payments/e-1', summaryJson(o.summary));
  await h.detect();
}

async function openMp(o: Opts = {}) {
  const clipboard = { writeText: vi.fn(async (_t: string) => undefined) };
  const rig = checkoutRig({ timers: o.timers, realtime: o.realtime, providers: [{ provide: NM_CLIPBOARD, useValue: clipboard }, ...(o.providers ?? [])] });
  const links = { customer: { ...NO_LINKS, supportUrl: o.support ?? '' } };
  let h: AppHarness;
  if (o.direct) {
    h = await openCheckout(URL, rig, { links });
  } else {
    h = await openCheckout('/app/customer/history', rig, { links });
    void h.router.navigateByUrl(URL, o.state ? { state: o.state } : {});
  }
  if (o.answer !== false) await answerLoad(h, o);
  return { h, rig, clipboard };
}

let visibility: DocumentVisibilityState = 'visible';

describe('customer x-merchant-payment (#8)', () => {
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });
  afterEach(() => {
    clearOverlays();
    TestBed.inject(NmToastService).dismiss();
    vi.restoreAllMocks();
  });

  it('MP T1. merchant-direct path (variant A): Till → intro, Merchant, Till number (Buy Goods), Amount and the Till how-to; Paybill → Paybill number, Account number and the Paybill how-to', async () => {
    let { h } = await openMp({ summary: { ...PAID, merchantPayment: directMerchant() } });
    expect(text(page(h).querySelector('h1'))).toBe('Pay the merchant');
    expect(document.title).toBe('Pay the merchant · Nitume');
    expect(text(page(h).querySelector('.mp__heading'))).toBe('Pay the merchant directly');
    expect(rowLabels(h)).toEqual(['Merchant', 'Till number (Buy Goods)', 'Amount']);
    expect(text(page(h).querySelector('.mp__till .nm-copy-row__value'))).toBe('123456');
    expect(text(page(h).querySelector('.mp__how'))).toBe(
      'On M-Pesa, choose Lipa na M-PESA → Buy Goods and Services, enter the Till number and amount.',
    );
    expect(text(page(h).querySelector('.mp__done button'))).toBe('Done');
    expect(page(h).querySelector('nm-fixed-cta .mp__done')).not.toBeNull();
    ({ h } = await openMp({ summary: { ...PAID, merchantPayment: directMerchant({ tillNumber: null, paybillNumber: '400200', accountReference: 'ACC-77' }) } }));
    expect(rowLabels(h)).toEqual(['Merchant', 'Paybill number', 'Account number', 'Amount']);
    expect(text(page(h).querySelector('.mp__account .nm-copy-row__value'))).toBe('ACC-77');
    expect(text(page(h).querySelector('.mp__how'))).toBe(
      'On M-Pesa, choose Lipa na M-PESA → Pay Bill, enter the Paybill number, account number and amount.',
    );
  });

  it('MP T2. values in nmNum with their styles; Copy on the amount writes 40000 to the clipboard and toasts Copied; a refusal → the copy-failure toast; Copy names', async () => {
    const { h, clipboard } = await openMp({ summary: { ...PAID, merchantPayment: directMerchant() } });
    const till = page(h).querySelector('.mp__till .nm-copy-row__value') as HTMLElement;
    expect(till.hasAttribute('nmNum')).toBe(true);
    const amount = page(h).querySelector('.mp__amount .nm-copy-row__value') as HTMLElement;
    expect(amount.classList).toContain('nm-num--amount');
    expect(text(amount)).toBe('KSh 40,000');
    const copyButtons = Array.from(page(h).querySelectorAll<HTMLButtonElement>('.nm-copy-row__copy button'));
    expect(copyButtons.map((b) => b.getAttribute('aria-label'))).toEqual(['Copy Till number (Buy Goods)', 'Copy Amount']);
    copyButtons[1].click();
    await h.detect();
    expect(clipboard.writeText).toHaveBeenCalledWith('40000');
    expect(toast()?.message).toBe('Copied');
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    copyButtons[0].click();
    await h.detect();
    expect(clipboard.writeText).toHaveBeenLastCalledWith('123456');
    expect(toast()?.message).toBe("Couldn't copy. Select the number and copy it.");
  });

  it('MP T3. item amount kept apart (WQ-27): only the item amount, no fee figure even with fees in the fixture; the intro says it is separate from the fees', async () => {
    const { h } = await openMp({ summary: { ...PAID, merchantPayment: directMerchant() } });
    const all = text(page(h));
    expect(all).toContain('KSh 40,000');
    expect(all).not.toMatch(/KSh 440\b|KSh 660\b|KSh 1,100|KSh 41,100|Service fee|Runner fee/);
    expect(text(page(h).querySelector('.mp__body'))).toBe(
      "Pay this amount from your M-Pesa straight to the merchant. It's separate from the fees you've already paid.",
    );
  });

  it('MP T4. increase line: from navigation state (amber token, nmNum); after a reload derived from the newest merchant_direct difference', async () => {
    let { h } = await openMp({ state: { approvedIncrease: '5000.00', priceChangeRequestId: 'r-1' }, summary: { ...PAID, merchantPayment: directMerchant() } });
    expect(text(page(h).querySelector('.mp__increase'))).toBe('Includes the KSh 5,000 increase you approved.');
    const amount = page(h).querySelector('.mp__increase-amount') as HTMLElement;
    expect(amount.hasAttribute('nmNum')).toBe(true);
    expect(getComputedStyle(amount).color).toBe('var(--nitume-amber)');
    ({ h } = await openMp({
      direct: true,
      summary: {
        ...PAID,
        merchantPayment: directMerchant(),
        differencePayments: [
          differenceJson({
            payment: paymentJson({ id: 'd2', paymentFlow: 'merchant_direct', merchantAmount: '2500.00', status: 'pending' }),
            merchantPayment: directMerchant({ amount: '2500.00' }),
            stkStatus: null,
          }),
          differenceJson({ payment: paymentJson({ id: 'd1', paymentFlow: 'merchant_direct', merchantAmount: '5000.00' }), merchantPayment: directMerchant(), stkStatus: null }),
        ],
      },
    }));
    expect(text(page(h).querySelector('.mp__increase'))).toBe('Includes the KSh 2,500 increase you approved.');
  });

  it('MP T5. details pending: only Amount (no Copy) + the pending notice; merchant_details:updated re-reads and shows the Till', async () => {
    const { h, rig } = await openMp({ summary: { ...PAID, merchantPayment: directMerchant({ tillNumber: null }) } });
    expect(rowLabels(h)).toEqual(['Amount']);
    expect(page(h).querySelector('.nm-copy-row__copy')).toBeNull();
    expect(text(page(h).querySelector('.mp__pending'))).toBe("The merchant's details aren't available yet. We'll notify you when they are.");
    rig.realtime.merchantDetailsUpdates$.next({ errandId: 'e-1', merchantName: 'Naivas', tillNumber: '123456', paybillNumber: null, accountReference: null });
    await answerLoad(h, { summary: { ...PAID, merchantPayment: directMerchant() } });
    expect(rowLabels(h)).toEqual(['Merchant', 'Till number (Buy Goods)', 'Amount']);
  });

  it('MP T6. OA-5 / #28: (a) the server pre-payment shape → pending, no name; (b) a wrongly carried Till with a pending main payment → not rendered; (c) completed + numbers → Till; (d) a socket payload with numbers is never rendered', async () => {
    // (a)
    let { h, rig } = await openMp({
      summary: { payment: paymentJson({ status: 'pending' }), merchantPayment: directMerchant({ tillNumber: null, paybillNumber: null, accountReference: null, merchantName: 'Naivas Nyali' }) },
    });
    expect(rowLabels(h)).toEqual(['Amount']);
    expect(text(page(h))).not.toContain('Naivas Nyali');
    expect(page(h).querySelector('.nm-copy-row__copy')).toBeNull();
    // (b)
    ({ h } = await openMp({ summary: { payment: paymentJson({ status: 'pending' }), merchantPayment: directMerchant() } }));
    expect(text(page(h))).not.toContain('123456');
    expect(rowLabels(h)).toEqual(['Amount']);
    ({ h } = await openMp({ answer: false }));
    await flushGet('/errands/e-1', checkoutErrand({ status: 'ACCEPTED' }));
    for (const r of requests('/payments/e-1')) r.flush(summaryJson({ ...PAID, merchantPayment: directMerchant() }));
    await routedTo(h, '/app/customer/tasks/e-1/quote');
    // (c)
    ({ h, rig } = await openMp({ summary: { ...PAID, merchantPayment: directMerchant() } }));
    expect(text(page(h).querySelector('.mp__till .nm-copy-row__value'))).toBe('123456');
    // (d)
    ({ h, rig } = await openMp({ summary: { payment: paymentJson({ status: 'pending' }), merchantPayment: directMerchant({ tillNumber: null }) } }));
    rig.realtime.merchantDetailsChanges$.next({ errandId: 'e-1', merchantName: 'Leak', tillNumber: '777777', paybillNumber: '888888', accountReference: 'X-9', merchantDetailsUpdatedAt: null });
    await answerLoad(h, { summary: { payment: paymentJson({ status: 'pending' }), merchantPayment: directMerchant({ tillNumber: null }) } });
    expect(text(page(h))).not.toMatch(/777777|888888|X-9|Leak/);
  });

  it('MP T7. details changed: the notice above the card with the time in nmNum; with supportUrl one Contact support link; without, no second line', async () => {
    const at = new Date(Date.UTC(2026, 10, 1, 13, 45)).toISOString();
    const merchantPayment = directMerchant({ merchantDetailsChangedAfterPayment: true, merchantDetailsUpdatedAt: at });
    let { h } = await openMp({ summary: { ...PAID, merchantPayment }, support: 'https://nitume.co.ke/support' });
    const notice = page(h).querySelector('.mp__changed') as HTMLElement;
    expect(notice.compareDocumentPosition(page(h).querySelector('.mp__card') as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text(notice.querySelector('.mp__changed-line'))).toMatch(/^The merchant's payment details changed on .+\. Check the number below before you pay\.$/);
    expect(notice.querySelector('.mp__changed-line [nmNum]')).not.toBeNull();
    expect(text(notice.querySelector('.mp__old'))).toBe('Already paid the old number?');
    const links = Array.from(page(h).querySelectorAll('a')).filter((a) => text(a) === 'Contact support');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://nitume.co.ke/support');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(text(page(h)).match(/Contact support/g)).toHaveLength(1);
    ({ h } = await openMp({ summary: { ...PAID, merchantPayment } }));
    expect(page(h).querySelector('.mp__old')).toBeNull();
    expect(text(page(h))).not.toContain('Contact support');
  });

  it('MP T8. send-to-runner path (variant B): an unpaid customer_to_runner difference PENDING → Check your phone, …to pay for the items., the difference only', async () => {
    const { h } = await openMp({
      summary: {
        ...PAID,
        payment: paymentJson({ status: 'completed', paymentFlow: 'customer_to_runner', merchantAmount: '40000.00' }),
        merchantPayment: { route: 'send_to_runner', amount: '40000.00', paidTo: 'nitume' },
        differencePayments: [differenceJson()],
      },
    });
    expect(text(page(h).querySelector('h1'))).toBe('Pay the item amount');
    expect(text(page(h).querySelector('.nm-stk__heading'))).toBe('Check your phone');
    expect(text(page(h).querySelector('.nm-stk__body'))).toBe('Enter your M-Pesa PIN on the prompt sent to your phone to pay for the items.');
    expect(text(page(h).querySelector('.nm-stk__amount'))).toBe('KSh 5,000');
    expect(page(h).querySelector('.nm-stk__includes')).toBeNull();
    expect(text(page(h))).not.toMatch(/KSh 40,000|KSh 45,000|KSh 1,100|KSh 41,100/);
    expect(page(h).querySelector('nm-fixed-cta')).toBeNull();
  });

  it('MP T9. variant B: SUCCESS → Item amount paid + Done; FAILED with reason; Try again → POST …/price-changes/:requestId/initiate (state id, else the payment’s); TIMEOUT → Check again re-reads, Send a new prompt → the same endpoint', async () => {
    let { h } = await openMp({ summary: { differencePayments: [differenceJson({ stkStatus: 'SUCCESS', payment: paymentJson({ ...differenceJson().payment, status: 'completed' }) })] } });
    expect(text(page(h).querySelector('.nm-stk__heading'))).toBe('Item amount paid');
    expect(text(page(h).querySelector('.nm-stk__body'))).toBe('Thanks. Your runner can go ahead with the purchase.');
    expect(Array.from(page(h).querySelectorAll('.nm-stk__actions button')).map((b) => text(b))).toEqual(['Done']);

    const failed = differenceJson({ stkStatus: 'FAILED', failureReason: 'Request cancelled by user' });
    ({ h } = await openMp({ state: { priceChangeRequestId: 'r-state', approvedIncrease: '5000.00' }, summary: { differencePayments: [failed] } }));
    expect(text(page(h).querySelector('.nm-stk__heading'))).toBe("Payment didn't go through");
    expect(text(page(h).querySelector('.nm-stk__reason'))).toBe('Request cancelled by user');
    (page(h).querySelector('.nm-stk__primary button') as HTMLButtonElement).click();
    let retry = await expectRequest(`${API}/payments/e-1/price-changes/r-state/initiate`);
    expect(retry.request.method).toBe('POST');
    expect(retry.request.body).toBeNull();
    retry.flush(differenceJson());
    await h.detect();
    expect(text(page(h).querySelector('.nm-stk__heading'))).toBe('Check your phone');

    ({ h } = await openMp({ summary: { differencePayments: [failed] } }));
    (page(h).querySelector('.nm-stk__primary button') as HTMLButtonElement).click();
    retry = await expectRequest(`${API}/payments/e-1/price-changes/r-1/initiate`);
    retry.flush({ statusCode: 404, message: 'x' }, { status: 404, statusText: 'Not Found' });
    await h.detect();
    expect(toast()?.message).toBe('Something went wrong. Please try again.');

    ({ h } = await openMp({ summary: { differencePayments: [differenceJson({ stkStatus: 'TIMEOUT' })] } }));
    expect(text(page(h).querySelector('.nm-stk__heading'))).toBe('Still checking your payment');
    (page(h).querySelector('.nm-stk__primary button') as HTMLButtonElement).click();
    await answerLoad(h, { summary: { differencePayments: [differenceJson({ stkStatus: 'TIMEOUT' })] } });
    (page(h).querySelector('.nm-stk__secondary button') as HTMLButtonElement).click();
    (await expectRequest(`${API}/payments/e-1/price-changes/r-1/initiate`)).flush(differenceJson());
    await h.detect();
  });

  it('MP T10. variant B polling: 5 s, then 30 s after 2 min, stopping 10 min after the page opened; paused while hidden', async () => {
    const { h, rig } = await openMp({ summary: { differencePayments: [differenceJson()] } });
    expect(rig.timers.pending()).toEqual([STK_FAST_MS]);
    rig.timers.advance(STK_FAST_MS);
    await answerLoad(h, { summary: { differencePayments: [differenceJson()] } });
    expect(rig.timers.pending()).toEqual([STK_FAST_MS]);
    rig.timers.elapsed = 125_000;
    visibility = 'hidden';
    rig.timers.advance(0); // the overdue 5 s tick fires while hidden
    await h.detect();
    expect(requests('/payments/e-1')).toHaveLength(0);
    expect(rig.timers.pending()).toEqual([STK_SLOW_MS]);
    visibility = 'visible';
    rig.timers.advance(STK_SLOW_MS);
    await answerLoad(h, { summary: { differencePayments: [differenceJson()] } });
    rig.timers.elapsed = 600_000;
    rig.timers.advance(STK_SLOW_MS);
    await answerLoad(h, { summary: { differencePayments: [differenceJson()] } });
    expect(rig.timers.pending()).toEqual([]);
  });

  it('MP T11. nothing due: no item payment, and a merchant_direct amount of 0.00 → toast Nothing to pay right now. and back (in-app history), or Track (replaceUrl) without it', async () => {
    let { h } = await openMp({ answer: false });
    const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);
    await answerLoad(h, { summary: { merchantPayment: null, differencePayments: [] } });
    expect(toast()?.message).toBe('Nothing to pay right now.');
    expect(back).toHaveBeenCalledTimes(1);
    ({ h } = await openMp({ direct: true, answer: false }));
    const nav = vi.spyOn(h.router, 'navigateByUrl');
    await answerLoad(h, { summary: { ...PAID, merchantPayment: directMerchant({ amount: '0.00' }) } });
    expect(toast()?.message).toBe('Nothing to pay right now.');
    expect(nav).toHaveBeenCalledWith('/app/customer/track/e-1', { replaceUrl: true });
  });

  it('MP T12. A§2: ACCEPTED → quote; CANCELLED → task detail; errand:status_changed to CANCELLED while open → task detail', async () => {
    let { h, rig } = await openMp({ answer: false });
    await answerLoad(h, { errand: { status: 'ACCEPTED' } });
    await routedTo(h, '/app/customer/tasks/e-1/quote');
    ({ h } = await openMp({ answer: false }));
    await answerLoad(h, { errand: { status: 'CANCELLED' } });
    await routedTo(h, '/app/customer/tasks/e-1');
    ({ h, rig } = await openMp({ summary: { ...PAID, merchantPayment: directMerchant() } }));
    rig.realtime.status('e-1', 'CANCELLED');
    await answerLoad(h, { errand: { status: 'CANCELLED' } });
    await routedTo(h, '/app/customer/tasks/e-1');
  });

  it('MP T13. load error copy and retry; a refresh error keeps the content', async () => {
    let { h } = await openMp({ answer: false });
    await flushGet('/errands/e-1', null, 500);
    for (const r of requests('/payments/e-1')) r.flush({});
    await h.detect();
    expect(text(page(h).querySelector('nm-error-state [role="alert"]'))).toBe("Couldn't load the payment details.");
    (page(h).querySelector('nm-error-state button') as HTMLButtonElement).click();
    await answerLoad(h, { summary: { ...PAID, merchantPayment: directMerchant() } });
    expect(rowLabels(h)).toContain('Till number (Buy Goods)');

    let rig;
    ({ h, rig } = await openMp({ summary: { differencePayments: [differenceJson()] } }));
    rig.timers.advance(STK_FAST_MS);
    await flushGet('/errands/e-1', null, 0);
    for (const r of requests('/payments/e-1')) r.flush({});
    await h.detect();
    expect(text(page(h).querySelector('.nm-stk__heading'))).toBe('Check your phone');
    expect(page(h).querySelector('nm-error-state')).toBeNull();
    expect(rig.timers.pending().length).toBe(1);
  });

  it('MP T14. no banned words (wallet, escrow, balance, hold, release) in the DOM of every state', async () => {
    const states: Partial<PaymentSummary>[] = [
      { ...PAID, merchantPayment: directMerchant() },
      { ...PAID, merchantPayment: directMerchant({ tillNumber: null }) },
      { differencePayments: [differenceJson()] },
      { differencePayments: [differenceJson({ stkStatus: 'FAILED' })] },
      { differencePayments: [differenceJson({ stkStatus: 'TIMEOUT' })] },
      { differencePayments: [differenceJson({ stkStatus: 'SUCCESS' })] },
    ];
    for (const summary of states) {
      const { h } = await openMp({ summary });
      expect.soft(text(page(h))).not.toMatch(/wallet|escrow|balance|\bhold\b|release|send money to your runner/i);
    }
  });

  it('MP T15. price_change:difference_paid for this errand → one immediate re-read (SUCCESS); another errand → nothing', async () => {
    const { h, rig } = await openMp({ summary: { differencePayments: [differenceJson()] } });
    rig.realtime.priceDifferencePayments$.next({ errandId: 'e-9', requestId: 'r-9', amount: '1.00', paidAt: null });
    await h.detect();
    expect(requests('/payments/e-1')).toHaveLength(0);
    rig.realtime.priceDifferencePayments$.next({ errandId: 'e-1', requestId: 'r-1', amount: '5000.00', paidAt: null });
    await answerLoad(h, { summary: { differencePayments: [differenceJson({ stkStatus: 'SUCCESS' })] } });
    expect(text(page(h).querySelector('.nm-stk__heading'))).toBe('Item amount paid');
    expect(requests('/payments/e-1')).toHaveLength(0);
  });

  it('MP T16. toasts on this page carry the nm-fixed-cta offset below 768px', async () => {
    const { h } = await openMp({ summary: { ...PAID, merchantPayment: directMerchant() } });
    vi.spyOn(TestBed.inject(NmFixedCtaOffset), 'toastOffset').mockReturnValue(64);
    (page(h).querySelector('.mp__amount .nm-copy-row__copy button') as HTMLButtonElement).click();
    await h.detect();
    expect(toast()?.offset).toBe(64);
  });
});
