import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import {
  AMOUNT_FORMAT,
  AMOUNT_REQUIRED,
  decisionLabel,
  formatPhone,
  RECEIPT_ERROR,
  RefundDrawerComponent,
  validateReceipt,
  validateRefundAmount,
} from './refund-drawer';
import { AdminDataService } from '../admin-data.service';
import type { RefundDetail } from '../../../core/api-types';

const RID = 'rrrrrrrr-0000-0000-0000-000000000001';

function review(patch: Partial<RefundDetail> = {}): RefundDetail {
  return {
    id: RID,
    errandId: errandFixture().id,
    trigger: 'cancelled_after_payment',
    amountPaid: '1200.00',
    refundAmount: null,
    status: 'pending_review',
    createdAt: '2026-10-08T06:00:00Z',
    errand: {
      id: errandFixture().id,
      title: 'Weekly shopping',
      description: 'Buy groceries',
      category: 'buy_for_me',
      status: 'CANCELLED',
    },
    customer: {
      userId: 'u1',
      displayName: 'Amina Wanjiru',
      shortName: 'Amina W.',
      phone: '+254712345678',
      mpesaPhone: '+254712345678',
    },
    paid: {
      serviceAndRunnerFee: '450.00',
      itemAmountToNitume: '750.00',
      priceChangeDifferences: '0.00',
      totalPaidToNitume: '1200.00',
      merchantDirectAmount: '0.00',
    },
    otherReviews: [],
    ...patch,
  };
}

describe('refund decision bounds (G-2)', () => {
  it('requires an amount', () => {
    expect(validateRefundAmount('', '1200.00')).toBe(AMOUNT_REQUIRED);
    expect(validateRefundAmount('  ', '1200.00')).toBe(AMOUNT_REQUIRED);
  });

  it('accepts KSh 0 and exactly the amount paid', () => {
    expect(validateRefundAmount('0', '1200.00')).toBeNull();
    expect(validateRefundAmount('1,200', '1200.00')).toBeNull();
    expect(validateRefundAmount('1200.00', '1200.00')).toBeNull();
  });

  it('rejects more than the amount paid, by a cent', () => {
    expect(validateRefundAmount('1200.01', '1200.00')).toBe(
      "The refund can't be more than the KSh 1,200 the customer paid.",
    );
  });

  it('rejects 3 decimals, negatives and text', () => {
    expect(validateRefundAmount('10.555', '1200.00')).toBe(AMOUNT_FORMAT);
    expect(validateRefundAmount('-1', '1200.00')).toBe(AMOUNT_FORMAT);
    expect(validateRefundAmount('abc', '1200.00')).toBe(AMOUNT_FORMAT);
  });

  it('switches the button label with the amount', () => {
    expect(decisionLabel('', '1200')).toBe('Approve refund');
    expect(decisionLabel('0', '1200')).toBe('Close with no refund');
    expect(decisionLabel('1200', '1200')).toBe('Approve refund · KSh 1,200');
    expect(decisionLabel('1300', '1200')).toBe('Approve refund');
  });

  it('validates the M-Pesa receipt', () => {
    expect(validateReceipt('SLK4H7XQ2P')).toBeNull();
    expect(validateReceipt(' slk4-h7 ')).toBeNull();
    expect(validateReceipt('SLK4 H7XQ')).toBe(RECEIPT_ERROR);
    expect(validateReceipt('abc')).toBe(RECEIPT_ERROR);
    expect(validateReceipt('a'.repeat(65))).toBe(RECEIPT_ERROR);
  });

  it('formats a Kenyan phone', () => {
    expect(formatPhone('+254712345678')).toBe('+254 712 345 678');
    expect(formatPhone('0712')).toBe('0712');
  });
});

describe('RefundDrawerComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render(r: RefundDetail) {
    const fixture = TestBed.createComponent(RefundDrawerComponent);
    fixture.componentRef.setInput('reviewId', RID);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    http.expectOne(`${API}/refunds/${RID}`).flush(r);
    await flushAsync();
    fixture.detectChanges();
    return fixture;
  }
  const byText = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.replace(/\s+/g, ' ').trim() === text,
    );
  function typeAmount(fixture: { nativeElement: HTMLElement; detectChanges(): void }, v: string) {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('keeps the three flows apart and shows where the refund goes', async () => {
    const fixture = await render(
      review({
        paid: { ...review().paid!, merchantDirectAmount: '4000.00', itemAmountToNitume: '0.00' },
      }),
    );
    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain('Service + runner fee');
    expect(text).not.toContain('Item amount (paid to Nitume)');
    expect(text).toContain('Total paid to Nitume');
    expect(text).toContain('The item amount (KSh 4,000) was paid straight to the merchant.');
    expect(text).toContain('+254 712 345 678');
    expect(text).toContain('Needs review');
    expect(text).not.toMatch(/wallet|escrow|balance/i);
  });

  it('falls back to the total when there is no breakdown (N-1)', async () => {
    const fixture = await render(
      review({ paid: undefined, customer: undefined, errand: undefined }),
    );
    http
      .expectOne(`${API}/errands/${errandFixture().id}`)
      .flush(errandFixture({ status: 'CANCELLED' }));
    await flushAsync();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Breakdown by payment isn't available yet.");
    expect(text).toContain("Customer's M-Pesa number not available");
  });

  it('Full refund fills the field; the button reads the amount; confirm sends a number', async () => {
    const fixture = await render(review());
    const el = fixture.nativeElement as HTMLElement;
    byText(el, 'Full refund')[0].click();
    fixture.detectChanges();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('1200');
    const primary = byText(el, 'Approve refund · KSh 1,200')[0];
    expect(primary.disabled).toBe(false);
    primary.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Approve a refund of KSh 1,200?');
    byText(el, 'Approve refund').at(-1)!.click();
    const req = http.expectOne(`${API}/refunds/${RID}/decision`);
    expect(req.request.body).toEqual({ refundAmount: 1200 });
    req.flush({
      ...review(),
      status: 'approved',
      refundAmount: '1200.00',
      decidedAt: '2026-10-08T09:00:00Z',
      decidedByUserId: 'me',
    });
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
    fixture.detectChanges();
    expect(el.textContent).toContain(
      "Refund of KSh 1,200 approved. Record the payout once you've sent it.",
    );
    expect(el.textContent).toContain('Record the payout');
    expect(TestBed.inject(AdminDataService).lastRefundUpdate()?.status).toBe('approved');
  });

  it('KSh 0 closes with no refund', async () => {
    const fixture = await render(review());
    const el = fixture.nativeElement as HTMLElement;
    typeAmount(fixture, '0');
    byText(el, 'Close with no refund')[0].click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Close with no refund?');
    expect(byText(el, 'Close review')).toHaveLength(1);
  });

  it('disables the action above the amount paid', async () => {
    const fixture = await render(review());
    typeAmount(fixture, '1300');
    expect(byText(fixture.nativeElement, 'Approve refund')[0].disabled).toBe(true);
  });

  it('409 refund_already_decided reloads and explains', async () => {
    const fixture = await render(review());
    const el = fixture.nativeElement as HTMLElement;
    typeAmount(fixture, '500');
    byText(el, 'Approve refund · KSh 500')[0].click();
    fixture.detectChanges();
    byText(el, 'Approve refund').at(-1)!.click();
    http
      .expectOne(`${API}/refunds/${RID}/decision`)
      .flush(
        { statusCode: 409, code: 'refund_already_decided', message: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    await flushAsync();
    http
      .expectOne(`${API}/refunds/${RID}`)
      .flush(review({ status: 'no_refund', refundAmount: '0.00' }));
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain(
      'Another admin already decided this refund. Showing the latest.',
    );
    expect(el.textContent).toContain('No refund');
  });

  it('400 refund_exceeds_amount_paid shows the returned amount on the field', async () => {
    const fixture = await render(review());
    const el = fixture.nativeElement as HTMLElement;
    typeAmount(fixture, '1200');
    byText(el, 'Approve refund · KSh 1,200')[0].click();
    fixture.detectChanges();
    byText(el, 'Approve refund').at(-1)!.click();
    http.expectOne(`${API}/refunds/${RID}/decision`).flush(
      {
        statusCode: 400,
        code: 'refund_exceeds_amount_paid',
        message: 'x',
        amountPaid: '1000.00',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await flushAsync();
    http.expectOne(`${API}/refunds/${RID}`).flush(review({ amountPaid: '1000.00' }));
    await flushAsync();
    fixture.detectChanges();
    expect(el.querySelector('.field-error')?.textContent).toContain(
      "The refund can't be more than the KSh 1,000 the customer paid.",
    );
  });

  it('records the payout with the receipt upper-cased', async () => {
    const fixture = await render(
      review({ status: 'approved', refundAmount: '1200.00', decidedAt: '2026-10-08T07:00:00Z' }),
    );
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'slk4h7xq2p';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byText(el, 'Mark as refunded')[0].click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Mark KSh 1,200 as refunded?');
    byText(el, 'Mark as refunded').at(-1)!.click();
    const req = http.expectOne(`${API}/refunds/${RID}/mark-paid`);
    expect(req.request.body).toEqual({ payoutReference: 'SLK4H7XQ2P' });
    req.flush({
      ...review(),
      status: 'refunded',
      refundAmount: '1200.00',
      payoutReference: 'SLK4H7XQ2P',
      paidAt: '2026-10-08T09:00:00Z',
    });
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Refund marked as sent.');
  });
});
