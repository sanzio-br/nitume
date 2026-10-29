// A.T7 (G8-37): the owner's WQ-27 money rule across the four #8 views, with
// serviceFee 440.00, runnerFee 660.00, fee total 1100.00 and item 40000.00.
// The item amount always has its own line; the only combined figures are
// the row-34 fee total and the row-76/91 send-to-runner charge, shown with
// the item amount beside it; merchant_direct never adds the item amount;
// the fee split and quote components never render; the initiate body has
// no amount; the price-change dialog and merchant page show no fee figure.
import { TestBed } from '@angular/core/testing';
import { AppHarness, text } from '../../../../testing/app-harness';
import { API, expectRequest } from '../../../../testing/auth';
import {
  FEES,
  checkoutErrand,
  checkoutRig,
  differenceJson,
  directMerchant,
  flushGet,
  openCheckout,
  paymentJson,
  priceChangeJson,
  quoteJson,
  summaryJson,
} from '../../../../testing/checkout';
import { clearOverlays } from '../../../../testing/customer';
import { NmDialogService } from '../../../shared/ui/overlay/dialog.service';
import { NmToastService } from '../../../shared/ui/overlay/toast.service';
import { Payment, PaymentSummary } from '../data/checkout.api';
import { CheckoutIntentStore } from './checkout-intent.store';
import { PRICE_COPY, PriceChangeDialogComponent } from './price-change-dialog.component';

const COMPONENTS = { baseFee: '301.00', distanceFee: '302.00', timeFee: '303.00', urgencyFee: '304.00', complexityFee: '305.00', premiumFee: '306.00' };
const FEE_SPLIT = /Service fee|Runner fee|KSh 440\b|KSh 660\b|\b440\b|\b660\b|30[1-6]/;

/** Every amount rendered in Fira Code, with the nearest labelled container. */
function amounts(root: Element): string[] {
  return Array.from(root.querySelectorAll('[nmNum]'))
    .map((e) => text(e))
    .filter((t) => t.startsWith('KSh') || /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(t));
}

async function openQuotePage(category = 'buy_for_me') {
  const rig = checkoutRig();
  const h = await openCheckout('/app/customer/tasks/e-1/quote', rig);
  await flushGet('/errands/e-1', checkoutErrand({ category }));
  await flushGet('/errands/e-1/quote', quoteJson(COMPONENTS));
  await flushGet('/customers/me/payment-methods', []);
  await h.detect();
  return h;
}

async function openPaymentPage(payment: Partial<Payment>, intent = false) {
  const rig = checkoutRig();
  const h = await openCheckout('/app/customer/history', rig);
  if (intent) TestBed.inject(CheckoutIntentStore).set('e-1', { route: 'send_to_runner' });
  void h.router.navigateByUrl('/app/customer/tasks/e-1/payment');
  await flushGet('/errands/e-1', checkoutErrand({ status: 'ACCEPTED' }));
  await flushGet('/payments/e-1', summaryJson(intent ? {} : { payment: paymentJson(payment), stkStatus: 'PENDING' }));
  await flushGet('/customers/me/payment-methods', []);
  await h.detect();
  return h;
}

async function openMerchantPage(summary: Partial<PaymentSummary>) {
  const rig = checkoutRig();
  const h = await openCheckout('/app/customer/history', rig);
  void h.router.navigateByUrl('/app/customer/tasks/e-1/item-payment');
  await flushGet('/errands/e-1', checkoutErrand({ status: 'IN_PROGRESS' }));
  await flushGet('/payments/e-1', summaryJson(summary));
  await h.detect();
  return h;
}

const quotePage = (h: AppHarness) => h.root().querySelector('app-awaiting-quote-page') as HTMLElement;
const paymentPage = (h: AppHarness) => h.root().querySelector('app-payment-page') as HTMLElement;
const merchantPage = (h: AppHarness) => h.root().querySelector('app-merchant-payment-page') as HTMLElement;

describe('WQ-27 money rule across the #8 views (A.T7)', () => {
  afterEach(() => {
    clearOverlays();
    TestBed.inject(NmToastService).dismiss();
    vi.restoreAllMocks();
  });

  it('A.T7 (a). every rendered item amount > 0 has its own row or line: checkout Item amount, Includes KSh 40,000 …, the merchant Amount, the difference line', async () => {
    let h = await openQuotePage();
    const itemRow = quotePage(h).querySelector('.quote__route nm-receipt-row') as HTMLElement;
    expect(text(itemRow.querySelector('.nm-receipt-row__label'))).toBe('Item amount');
    expect(text(itemRow.querySelector('.nm-receipt-row__amount'))).toBe('KSh 40,000');

    h = await openPaymentPage({ paymentFlow: 'customer_to_runner', merchantAmount: FEES.item });
    expect(text(paymentPage(h).querySelector('.nm-stk__includes'))).toBe("Includes KSh 40,000 for your runner's purchase.");

    h = await openMerchantPage({ payment: paymentJson({ status: 'completed', paymentFlow: 'merchant_direct', merchantAmount: FEES.item }), merchantPayment: directMerchant() });
    expect(text(merchantPage(h).querySelector('.mp__amount .nm-copy-row__label'))).toBe('Amount');
    expect(text(merchantPage(h).querySelector('.mp__amount .nm-copy-row__value'))).toBe('KSh 40,000');

    await openCheckout('/app/customer/history', checkoutRig());
    TestBed.inject(NmDialogService).open(PriceChangeDialogComponent, { title: PRICE_COPY.title, dismissible: false, data: { errandId: 'e-1', request: priceChangeJson() } });
    expect(text(document.querySelector('nm-dialog .pc__difference'))).toBe('+ KSh 5,000 additional');
  });

  it('A.T7 (b). the only combined figures: the Total (service + runner fee) row and the send-to-runner charge, the latter only beside its item amount line', async () => {
    const h = await openQuotePage();
    // merchant_direct: the fee total in its row and the CTA; nothing else combines flows.
    expect(amounts(quotePage(h))).toEqual(['KSh 1,100', 'KSh 40,000', 'KSh 1,100']);
    (quotePage(h).querySelector('input[value="send_to_runner"]') as HTMLInputElement).click();
    await h.detect();
    expect(amounts(quotePage(h))).toEqual(['KSh 1,100', 'KSh 40,000', 'KSh 41,100']);
    expect(text(quotePage(h).querySelector('.quote__route .nm-receipt-row__label'))).toBe('Item amount');

    const p = await openPaymentPage({ paymentFlow: 'customer_to_runner', merchantAmount: FEES.item });
    expect(amounts(paymentPage(p))).toEqual(['KSh 41,100', 'KSh 40,000']);
    expect(paymentPage(p).querySelector('.nm-stk__includes')).not.toBeNull();
  });

  it('A.T7 (b) cents. the combined charges are exact in cents (1100.10 + 40000.20 → KSh 41,100.30, never a float drift to .29)', async () => {
    const rig = checkoutRig();
    const h = await openCheckout('/app/customer/tasks/e-1/quote', rig);
    await flushGet('/errands/e-1', checkoutErrand({ feeTotal: '1100.10', budget: '40000.20' }));
    await flushGet('/errands/e-1/quote', quoteJson());
    await flushGet('/customers/me/payment-methods', []);
    await h.detect();
    (quotePage(h).querySelector('input[value="send_to_runner"]') as HTMLInputElement).click();
    await h.detect();
    expect(text(quotePage(h).querySelector('.quote__pay [nmNum]'))).toBe('KSh 41,100.30');
    const p = await openPaymentPage({ serviceFee: '440.10', runnerFee: '660.00', paymentFlow: 'customer_to_runner', merchantAmount: '40000.20' });
    expect(text(paymentPage(p).querySelector('.nm-stk__amount'))).toBe('KSh 41,100.30');
  });

  it('A.T7 (c). merchant_direct never adds the item amount: KSh 41,100 is absent from the checkout and the payment page', async () => {
    const h = await openQuotePage();
    expect(text(quotePage(h))).not.toContain('KSh 41,100');
    const p = await openPaymentPage({ paymentFlow: 'merchant_direct', merchantAmount: FEES.item });
    expect(text(paymentPage(p))).not.toContain('KSh 41,100');
    expect(text(paymentPage(p).querySelector('.nm-stk__amount'))).toBe('KSh 1,100');
    expect(paymentPage(p).querySelector('.nm-stk__includes')).toBeNull();
  });

  it('A.T7 (d). Service fee / Runner fee and the six quote component values never render, even when present in the response', async () => {
    const h = await openQuotePage();
    expect(text(quotePage(h))).not.toMatch(FEE_SPLIT);
    const p = await openPaymentPage({ paymentFlow: 'platform_only' });
    expect(text(paymentPage(p))).not.toMatch(FEE_SPLIT);
  });

  it('A.T7 (e). the initiate request body has no amount field (only merchantRoute?, paymentMethodId?)', async () => {
    await openPaymentPage({}, true);
    const req = await expectRequest(`${API}/payments/e-1/initiate`);
    expect(req.request.body).toEqual({ merchantRoute: 'send_to_runner' });
    expect(JSON.stringify(req.request.body)).not.toMatch(/amount|fee|total|price/i);
  });

  it('A.T7 (f). the price-change dialog and the merchant page render no fee figure', async () => {
    await openCheckout('/app/customer/history', checkoutRig());
    TestBed.inject(NmDialogService).open(PriceChangeDialogComponent, { title: PRICE_COPY.title, dismissible: false, data: { errandId: 'e-1', request: priceChangeJson() } });
    const dialogText = text(document.querySelector('nm-dialog'));
    expect(dialogText).not.toMatch(/fee|KSh 1,100|KSh 41,100|KSh 45,000/i);
    clearOverlays();
    const variants: Partial<PaymentSummary>[] = [
      { payment: paymentJson({ status: 'completed', paymentFlow: 'merchant_direct', merchantAmount: FEES.item }), merchantPayment: directMerchant() },
      { payment: paymentJson({ status: 'completed' }), differencePayments: [differenceJson()] },
    ];
    for (const summary of variants) {
      const h = await openMerchantPage(summary);
      expect.soft(text(merchantPage(h))).not.toMatch(/KSh 1,100|KSh 41,100|KSh 440\b|KSh 660\b|Service fee|Runner fee/);
    }
  });
});
