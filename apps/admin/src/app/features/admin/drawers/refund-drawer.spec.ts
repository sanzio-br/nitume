import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import {
  alreadyRefunded,
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
import { reviewCeiling } from '../refund-labels';
import type {
  EffectivePayout,
  RefundDetail,
  RefundPayoutCorrection,
} from '../../../core/api-types';

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
    // The API's ceiling: the basis while pending, null once decided.
    refundCeiling:
      (patch.status ?? 'pending_review') === 'pending_review'
        ? (patch.amountPaid ?? '1200.00')
        : null,
    alreadyRefunded: '0.00',
    remainingRefundable: '1200.00',
    totalPaidToNitume: '1200.00',
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
    decidedBy: null,
    paidBy: null,
    effectivePayout: null,
    corrections: [],
    correctionCeiling: null,
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
      "The refund can't be more than the KSh 1,200 refundable in this review.",
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

  it('caps at refundCeiling while pending, else amountPaid (rows 81, 87)', () => {
    expect(
      reviewCeiling({ status: 'pending_review', amountPaid: '1200.00', refundCeiling: '900.00' }),
    ).toBe('900.00');
    expect(
      reviewCeiling({ status: 'pending_review', amountPaid: '1200.00', refundCeiling: null }),
    ).toBe('1200.00');
    expect(reviewCeiling({ status: 'approved', amountPaid: '1200.00', refundCeiling: null })).toBe(
      '1200.00',
    );
  });

  it('reads Already refunded from the API figure (row 87)', () => {
    expect(alreadyRefunded({ alreadyRefunded: '300.00' })).toBe(300);
    expect(alreadyRefunded({ alreadyRefunded: '0.00' })).toBe(0);
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
        paid: { ...review().paid, merchantDirectAmount: '4000.00', itemAmountToNitume: '0.00' },
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

  it('adds Refundable in this review when the ceiling is not the total paid (SA-1)', async () => {
    const fixture = await render(
      review({ trigger: 'price_change_decrease', amountPaid: '300.00' }),
    );
    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll('.drawer-row'), (r) =>
      (r.textContent ?? '').replace(/\s+/g, ''),
    );
    const total = rows.indexOf('TotalpaidtoNitumeKSh1,200');
    expect(total).toBeGreaterThan(-1);
    expect(rows[total + 1]).toBe('RefundableinthisreviewKSh300');
    expect(el.textContent).toContain('Between KSh 0 and KSh 300.');
  });

  it('nets earlier refunds: Already refunded row, ceiling caps the form (row 87)', async () => {
    const fixture = await render(
      review({ refundCeiling: '900.00', alreadyRefunded: '300.00', totalPaidToNitume: '1200.00' }),
    );
    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll('.drawer-row'), (r) =>
      (r.textContent ?? '').replace(/\s+/g, ''),
    );
    const total = rows.indexOf('TotalpaidtoNitumeKSh1,200');
    expect(rows[total + 1]).toBe('AlreadyrefundedonthistaskKSh300');
    expect(rows[total + 2]).toBe('RefundableinthisreviewKSh900');
    expect(el.textContent).toContain('Between KSh 0 and KSh 900.');
    byText(el, 'Full refund')[0].click();
    fixture.detectChanges();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('900');
    typeAmount(fixture, '901');
    (el.querySelector('input') as HTMLInputElement).dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(el.querySelector('.field-error')?.textContent).toContain(
      "The refund can't be more than the KSh 900 refundable in this review.",
    );
  });

  it('names paid EXPIRED and FAILED reviews Task expired / Task failed (row 102)', async () => {
    const rowsOf = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('.drawer-row'), (r) =>
        (r.textContent ?? '').replace(/\s+/g, ''),
      );
    const expired = await render(
      review({
        trigger: 'expired_after_payment',
        errand: { ...review().errand!, status: 'EXPIRED' },
      }),
    );
    expect(rowsOf(expired.nativeElement)).toContain('ReasonTaskexpired');
    expect(rowsOf(expired.nativeElement)).toContain('TaskstatusExpired');
    const failed = await render(
      review({
        trigger: 'failed_after_payment',
        errand: { ...review().errand!, status: 'FAILED' },
      }),
    );
    expect(rowsOf(failed.nativeElement)).toContain('ReasonTaskfailed');
  });

  it('has no Refundable row when the ceiling equals the total paid', async () => {
    const fixture = await render(review());
    expect(fixture.nativeElement.textContent).not.toContain('Refundable in this review');
  });

  it('keeps "Opened" in Fira Sans and only the date/time in Fira Code (m-1)', async () => {
    const fixture = await render(review());
    const muted = fixture.nativeElement.querySelector('.drawer-muted') as HTMLElement;
    const nums = Array.from(muted.querySelectorAll('.num')).map((n) => n.textContent);
    expect(muted.textContent).toContain('Opened');
    expect(nums.some((t) => t?.includes('Opened'))).toBe(false);
    expect(nums).toHaveLength(1);
  });

  it('focuses the drawer close button in a read-only state (m-2)', async () => {
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    const close = document.createElement('button');
    close.className = 'drawer-close';
    drawer.appendChild(close);
    document.body.appendChild(drawer);
    const fixture = TestBed.createComponent(RefundDrawerComponent);
    drawer.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('reviewId', RID);
    fixture.detectChanges();
    http
      .expectOne(`${API}/refunds/${RID}`)
      .flush(review({ status: 'no_refund', refundAmount: '0.00' }));
    await flushAsync();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(close);
    drawer.remove();
  });

  it('reads the task and customer from the detail alone; no errand call (N-1)', async () => {
    const fixture = await render(review());
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Weekly shopping');
    expect(text).toContain('Amina W.');
    expect(text).not.toContain("Breakdown by payment isn't available yet.");
    // http.verify() in afterEach: no GET /errands/:id was made.
  });

  it('keeps going when the errand and customer are gone', async () => {
    const fixture = await render(review({ customer: null, errand: null }));
    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector('.drawer-summary-title').textContent).toBe('Task');
    expect(text).toContain("Customer's M-Pesa number not available");
  });

  it("names the deciding admin, or masks the id when there's no name (N-2)", async () => {
    const fixture = await render(
      review({
        status: 'no_refund',
        refundAmount: '0.00',
        decidedAt: '2026-10-08T07:00:00Z',
        decidedByUserId: 'aaaaaaaa-0000-0000-0000-00000000beef',
        decidedBy: { id: 'aaaaaaaa-0000-0000-0000-00000000beef', displayName: 'Otieno K.' },
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('Otieno K.');
    const unnamed = await render(
      review({
        status: 'no_refund',
        refundAmount: '0.00',
        decidedByUserId: 'aaaaaaaa-0000-0000-0000-00000000beef',
        decidedBy: { id: 'aaaaaaaa-0000-0000-0000-00000000beef', displayName: null },
      }),
    );
    expect(unnamed.nativeElement.textContent).toContain('…beef');
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
      "The refund can't be more than the KSh 1,000 refundable in this review.",
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
      effectivePayout: {
        state: 'sent',
        amount: '1200.00',
        reference: 'SLK4H7XQ2P',
        at: '2026-10-08T09:00:00Z',
      },
      correctionCeiling: '1200.00',
    });
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Refund marked as sent.');
  });
  it('shows a refunded payout read-only: no receipt input or edit control (row 82)', async () => {
    const fixture = await render(
      review({
        status: 'refunded',
        refundAmount: '1200.00',
        decidedAt: '2026-10-08T07:00:00Z',
        payoutReference: 'SLK4H7XQ2P',
        paidAt: '2026-10-08T09:00:00Z',
        effectivePayout: {
          state: 'sent',
          amount: '1200.00',
          reference: 'SLK4H7XQ2P',
          at: '2026-10-08T09:00:00Z',
        },
        correctionCeiling: '1200.00',
      }),
    );
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input, textarea')).toBeNull();
    // Changes go through an auditable correction (row 100), never an edit.
    const labels = Array.from(el.querySelectorAll('button'), (b) => b.textContent?.trim());
    expect(labels).toEqual(['Open task', 'Open customer', 'Record a correction']);
    expect(el.textContent).toContain('SLK4H7XQ2P');
    expect(el.textContent).toContain('Refund sent');
    expect(el.textContent).not.toContain('Original payout');
  });

  it('writes every amount as KSh, never KES (row 82)', async () => {
    const fixture = await render(review({ status: 'approved', refundAmount: '1200.50' }));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('KSh 1,200.50');
    expect(text).not.toMatch(/\bKES\b/);
  });
  it('409 refund_payout_locked reloads read-only and explains (row 82)', async () => {
    const fixture = await render(
      review({ status: 'approved', refundAmount: '1200.00', decidedAt: '2026-10-08T07:00:00Z' }),
    );
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'SLK4H7XQ2P';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byText(el, 'Mark as refunded')[0].click();
    fixture.detectChanges();
    byText(el, 'Mark as refunded').at(-1)!.click();
    http
      .expectOne(`${API}/refunds/${RID}/mark-paid`)
      .flush(
        { statusCode: 409, code: 'refund_payout_locked', message: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    await flushAsync();
    http.expectOne(`${API}/refunds/${RID}`).flush(
      review({
        status: 'refunded',
        refundAmount: '1200.00',
        payoutReference: 'QWE123RTY9',
        paidAt: '2026-10-08T08:00:00Z',
        effectivePayout: {
          state: 'sent',
          amount: '1200.00',
          reference: 'QWE123RTY9',
          at: '2026-10-08T08:00:00Z',
        },
        correctionCeiling: '1200.00',
      }),
    );
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain(
      "This refund was already marked as sent. Its receipt can't be changed. Showing the latest.",
    );
    expect(el.textContent).toContain('QWE123RTY9');
    expect(el.querySelector('input')).toBeNull();
  });
});

describe('RefundDrawerComponent corrections (row 100)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  const ORIGINAL = 'SLK4H7XQ2P';
  const sent = (patch: Partial<EffectivePayout> = {}): EffectivePayout => ({
    state: 'sent',
    amount: '1200.00',
    reference: ORIGINAL,
    at: '2026-10-08T07:00:00Z',
    ...patch,
  });
  const reversedPayout: EffectivePayout = {
    state: 'reversed',
    amount: '0.00',
    reference: null,
    at: '2026-10-08T08:00:00Z',
  };
  function record(patch: Partial<RefundPayoutCorrection> = {}): RefundPayoutCorrection {
    return {
      id: 'cccccccc-0000-0000-0000-000000000001',
      kind: 'corrected',
      previousReference: ORIGINAL,
      previousAmount: '1200.00',
      newReference: 'SLK4H7XQ2Q',
      newAmount: null,
      reason: 'Typed the receipt wrong',
      createdByUserId: 'aaaaaaaa-0000-0000-0000-00000000beef',
      createdBy: { id: 'aaaaaaaa-0000-0000-0000-00000000beef', displayName: 'Otieno K.' },
      createdAt: '2026-10-08T08:00:00Z',
      ...patch,
    };
  }
  function refunded(patch: Partial<RefundDetail> = {}): RefundDetail {
    return review({
      status: 'refunded',
      refundAmount: '1200.00',
      decidedAt: '2026-10-08T06:30:00Z',
      payoutReference: ORIGINAL,
      paidAt: '2026-10-08T07:00:00Z',
      paidByUserId: 'aaaaaaaa-0000-0000-0000-00000000beef',
      effectivePayout: sent(),
      corrections: [],
      correctionCeiling: '1200.00',
      ...patch,
    });
  }

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
  type Fixture = Awaited<ReturnType<typeof render>>;
  const text = (f: Fixture) => (f.nativeElement.textContent as string).replace(/\s+/g, ' ');
  const button = (f: Fixture, label: string) =>
    Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).filter(
      (b) => b.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
  function field(f: Fixture, label: string): HTMLInputElement | HTMLTextAreaElement {
    const el = f.nativeElement as HTMLElement;
    const lab = Array.from(el.querySelectorAll('label')).find(
      (l) => l.textContent?.trim() === label,
    );
    if (!lab) throw new Error(`no field ${label}`);
    return el.querySelector(`#${lab.getAttribute('for')}`) as HTMLInputElement;
  }
  function type(f: Fixture, label: string, value: string, blur = true) {
    const input = field(f, label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    if (blur) input.dispatchEvent(new Event('blur'));
    f.detectChanges();
  }
  /** `{label: value}` of the cards under a drawer label. */
  function card(f: Fixture, label: string): Record<string, string> {
    const section = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll('.drawer-section'),
    ).find((s) => s.querySelector('.drawer-label')?.textContent?.trim() === label);
    if (!section) return {};
    return Object.fromEntries(
      Array.from(section.querySelectorAll('.drawer-row'), (r) =>
        Array.from(r.children, (c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()),
      ),
    );
  }
  async function confirm(f: Fixture, label: string) {
    button(f, label).at(-1)!.click();
    f.detectChanges();
  }

  it('records a corrected receipt; the original payout card stays unchanged', async () => {
    const fixture = await render(refunded());
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('What happened?');
    expect(fixture.nativeElement.querySelector('.seg-option.active')?.textContent?.trim()).toBe(
      'Wrong receipt or amount',
    );
    expect(text(fixture)).toContain(`Leave empty if the receipt was right. Current: ${ORIGINAL}`);
    type(fixture, 'Correct M-Pesa receipt', 'slk4h7xq2q');
    expect(field(fixture, 'Correct M-Pesa receipt').value).toBe('SLK4H7XQ2Q');
    type(fixture, 'Reason', 'Typed the receipt wrong');
    button(fixture, 'Save correction')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Save this correction?');
    expect(text(fixture)).toContain('New receipt SLK4H7XQ2Q.');
    await confirm(fixture, 'Save correction');
    const req = http.expectOne(`${API}/refunds/${RID}/corrections`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      kind: 'corrected',
      newReference: 'SLK4H7XQ2Q',
      reason: 'Typed the receipt wrong',
      expectedLatestCorrectionId: null,
    });
    req.flush(
      refunded({ effectivePayout: sent({ reference: 'SLK4H7XQ2Q' }), corrections: [record()] }),
    );
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
    fixture.detectChanges();
    expect(text(fixture)).toContain('Correction saved. The original record is unchanged.');
    expect(card(fixture, 'Current payout')).toMatchObject({
      Status: 'Refunded',
      'Amount sent': 'KSh 1,200',
      'M-Pesa receipt': 'SLK4H7XQ2Q',
    });
    // The original card is untouched by the correction (rows 82, 100).
    expect(card(fixture, 'Original payout')).toMatchObject({
      'Refund sent': 'KSh 1,200',
      'M-Pesa receipt': ORIGINAL,
    });
    expect(card(fixture, 'Corrections')).toMatchObject({
      Receipt: `${ORIGINAL} → SLK4H7XQ2Q`,
      Reason: 'Typed the receipt wrong',
    });
    expect(text(fixture)).toContain('Payout corrected · SLK4H7XQ2Q');
    // No edit, delete or undo control on the history.
    const corrections = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-payout-correction-card'),
    );
    expect(corrections).toHaveLength(1);
    expect(corrections[0].querySelector('button, input, textarea')).toBeNull();
    expect(button(fixture, 'Record a correction')).toHaveLength(1);
  });

  it('records a reversal: keeps the reason across the toggle, then asks for the new payout', async () => {
    const first = record();
    const fixture = await render(
      refunded({ effectivePayout: sent({ reference: 'SLK4H7XQ2Q' }), corrections: [first] }),
    );
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    type(fixture, 'Correct M-Pesa receipt', 'ABCD1234');
    type(fixture, 'Reason', 'Wrong number, money came back');
    button(fixture, 'Payout reversed')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain(
      'Use this when the M-Pesa payment of KSh 1,200 was reversed and the money came back.',
    );
    expect((field(fixture, 'Reason') as HTMLTextAreaElement).value).toBe(
      'Wrong number, money came back',
    );
    expect(field(fixture, 'Reversal M-Pesa code').value).toBe('');
    type(fixture, 'Reversal M-Pesa code', 'RVS9K2L1MX');
    button(fixture, 'Record reversal')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Record that this payout was reversed?');
    await confirm(fixture, 'Record reversal');
    const req = http.expectOne(`${API}/refunds/${RID}/corrections`);
    expect(req.request.body).toEqual({
      kind: 'reversed',
      newReference: 'RVS9K2L1MX',
      reason: 'Wrong number, money came back',
      expectedLatestCorrectionId: first.id,
    });
    req.flush(
      refunded({
        effectivePayout: reversedPayout,
        corrections: [
          first,
          record({
            id: 'cccccccc-0000-0000-0000-000000000002',
            kind: 'reversed',
            previousReference: 'SLK4H7XQ2Q',
            newReference: 'RVS9K2L1MX',
            reason: 'Wrong number, money came back',
          }),
        ],
      }),
    );
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
    fixture.detectChanges();
    expect(text(fixture)).toContain(
      'Reversal recorded. Send the refund again and record the new payout.',
    );
    // Summary chip (the notice above it has its own chip).
    const chip = (fixture.nativeElement as HTMLElement).querySelector(
      'section.drawer-section > app-status-chip .chip',
    );
    expect(chip?.textContent?.trim()).toBe('Payout reversed');
    expect(chip?.className).toContain('chip-pending');
    expect(card(fixture, 'Current payout')).toMatchObject({
      Status: 'Payout reversed',
      'Amount sent': 'KSh 0',
      'M-Pesa receipt': '—',
    });
    expect(text(fixture)).toContain('Payout reversed · RVS9K2L1MX');
    // The new payout form replaces the action, prefilled, with no Cancel.
    expect(text(fixture)).toContain('Record the new payout');
    expect(button(fixture, 'Record a correction')).toHaveLength(0);
    expect(button(fixture, 'Cancel')).toHaveLength(0);
    expect(field(fixture, 'Amount sent').value).toBe('1200');
  });

  it('records a new payout after a reversal', async () => {
    const reversal = record({ kind: 'reversed', newReference: 'RVS9K2L1MX' });
    const fixture = await render(
      refunded({ effectivePayout: reversedPayout, corrections: [reversal] }),
    );
    expect(text(fixture)).toContain(
      'Send KSh 1,200 to the customer by M-Pesa again, then enter the new receipt here.',
    );
    expect(text(fixture)).toContain('Up to KSh 1,200.');
    type(fixture, 'M-Pesa receipt', 'new8p3q2rs');
    type(fixture, 'Reason', 'Sent again to the right number');
    button(fixture, 'Record new payout')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Record a new payout of KSh 1,200?');
    expect(text(fixture)).toContain('M-Pesa receipt NEW8P3Q2RS. The customer will be told');
    await confirm(fixture, 'Record new payout');
    const req = http.expectOne(`${API}/refunds/${RID}/corrections`);
    expect(req.request.body).toEqual({
      kind: 'resent',
      newReference: 'NEW8P3Q2RS',
      newAmount: 1200,
      reason: 'Sent again to the right number',
      expectedLatestCorrectionId: reversal.id,
    });
    req.flush(
      refunded({
        effectivePayout: sent({ reference: 'NEW8P3Q2RS' }),
        corrections: [
          reversal,
          record({
            id: 'cccccccc-0000-0000-0000-000000000002',
            kind: 'resent',
            previousReference: null,
            previousAmount: '0.00',
            newReference: 'NEW8P3Q2RS',
            newAmount: '1200.00',
          }),
        ],
      }),
    );
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
    fixture.detectChanges();
    expect(text(fixture)).toContain('New payout recorded.');
    expect(text(fixture)).toContain('New payout sent · NEW8P3Q2RS');
    expect(card(fixture, 'Original payout')['M-Pesa receipt']).toBe(ORIGINAL);
    expect(button(fixture, 'Record a correction')).toHaveLength(1);
  });

  it('validates on blur: same receipt, nothing to correct, over the ceiling, short reason', async () => {
    const fixture = await render(refunded({ correctionCeiling: '1000.00' }));
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    const save = () => button(fixture, 'Save correction')[0];
    expect(save().disabled).toBe(true);
    type(fixture, 'Correct M-Pesa receipt', ORIGINAL);
    expect(text(fixture)).toContain('This is already the receipt on record.');
    type(fixture, 'Correct M-Pesa receipt', '');
    type(fixture, 'Correct amount sent', '');
    expect(text(fixture)).toContain('Enter the correct receipt, the correct amount, or both.');
    type(fixture, 'Correct amount sent', '1200.50');
    expect(text(fixture)).toContain("The amount can't be more than KSh 1,000 for this review.");
    type(fixture, 'Correct amount sent', '900');
    type(fixture, 'Reason', 'abc');
    expect(text(fixture)).toContain("Say why you're making this change.");
    expect(save().disabled).toBe(true);
    type(fixture, 'Reason', 'Sent 900 by mistake');
    expect(save().disabled).toBe(false);
  });

  it('409 payout_correction_conflict reloads and keeps the typed reason', async () => {
    const fixture = await render(refunded());
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    type(fixture, 'Correct M-Pesa receipt', 'SLK4H7XQ2Q');
    type(fixture, 'Reason', 'Typed the receipt wrong');
    button(fixture, 'Save correction')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Save correction');
    http.expectOne(`${API}/refunds/${RID}/corrections`).flush(
      {
        statusCode: 409,
        code: 'payout_correction_conflict',
        message: 'x',
        latestCorrectionId: 'cccccccc-0000-0000-0000-000000000009',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await flushAsync();
    http.expectOne(`${API}/refunds/${RID}`).flush(
      refunded({
        effectivePayout: sent({ reference: 'SLK4H7XQ2Q' }),
        corrections: [record({ id: 'cccccccc-0000-0000-0000-000000000009' })],
      }),
    );
    await flushAsync();
    fixture.detectChanges();
    expect(text(fixture)).toContain(
      'Another admin changed this payout. Check the latest before you save.',
    );
    expect(card(fixture, 'Current payout')['M-Pesa receipt']).toBe('SLK4H7XQ2Q');
    expect((field(fixture, 'Reason') as HTMLTextAreaElement).value).toBe('Typed the receipt wrong');
    expect(field(fixture, 'Correct M-Pesa receipt').value).toBe('');
  });

  it('409 payout_reference_reused shows the field error', async () => {
    const fixture = await render(refunded());
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    type(fixture, 'Correct M-Pesa receipt', 'QWE123RTY9');
    type(fixture, 'Reason', 'Typed the receipt wrong');
    button(fixture, 'Save correction')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Save correction');
    http
      .expectOne(`${API}/refunds/${RID}/corrections`)
      .flush(
        { statusCode: 409, code: 'payout_reference_reused', message: 'x', reference: 'QWE123RTY9' },
        { status: 409, statusText: 'Conflict' },
      );
    await flushAsync();
    fixture.detectChanges();
    const input = field(fixture, 'Correct M-Pesa receipt');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture)).toContain('This M-Pesa code is already recorded on a payout.');
    expect(input.value).toBe('QWE123RTY9');
  });

  it('400 refund_exceeds_amount_paid shows the returned ceiling and keeps the input', async () => {
    const fixture = await render(refunded());
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    type(fixture, 'Correct amount sent', '1100');
    type(fixture, 'Reason', 'Sent less than recorded');
    button(fixture, 'Save correction')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Save correction');
    http.expectOne(`${API}/refunds/${RID}/corrections`).flush(
      {
        statusCode: 400,
        code: 'refund_exceeds_amount_paid',
        message: 'x',
        correctionCeiling: '1000.00',
        amountPaid: '1000.00',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await flushAsync();
    http.expectOne(`${API}/refunds/${RID}`).flush(refunded({ correctionCeiling: '1000.00' }));
    await flushAsync();
    fixture.detectChanges();
    expect(text(fixture)).toContain("The amount can't be more than KSh 1,000 for this review.");
    expect(field(fixture, 'Correct amount sent').value).toBe('1100');
  });

  it('400 correction_no_change shows the form-level error', async () => {
    const fixture = await render(refunded());
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    type(fixture, 'Correct amount sent', '1100');
    type(fixture, 'Reason', 'Sent less than recorded');
    button(fixture, 'Save correction')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Save correction');
    http
      .expectOne(`${API}/refunds/${RID}/corrections`)
      .flush(
        { statusCode: 400, code: 'correction_no_change', message: 'x' },
        { status: 400, statusText: 'Bad Request' },
      );
    await flushAsync();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.form-error')?.textContent?.trim(),
    ).toBe('Nothing to correct: the receipt and amount match the record.');
  });

  it('focuses the new payout receipt on a reversed payout, on open and after Record reversal (m-10)', async () => {
    const reversal = record({ kind: 'reversed', newReference: 'RVS9K2L1MX' });
    const opened = await render(
      refunded({ effectivePayout: reversedPayout, corrections: [reversal] }),
    );
    await opened.whenStable();
    expect(document.activeElement).toBe(field(opened, 'M-Pesa receipt'));
    opened.destroy();

    const fixture = await render(refunded());
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    button(fixture, 'Payout reversed')[0].click();
    fixture.detectChanges();
    type(fixture, 'Reversal M-Pesa code', 'RVS9K2L1MX');
    type(fixture, 'Reason', 'Wrong number, money came back');
    button(fixture, 'Record reversal')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Record reversal');
    http
      .expectOne(`${API}/refunds/${RID}/corrections`)
      .flush(refunded({ effectivePayout: reversedPayout, corrections: [reversal] }));
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(field(fixture, 'M-Pesa receipt'));
  });

  it('returns focus to Record a correction after Cancel and after Discard (m-10)', async () => {
    const fixture = await render(refunded());
    const record = () => button(fixture, 'Record a correction')[0];
    record().click();
    fixture.detectChanges();
    button(fixture, 'Cancel')[0].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(record());

    record().click();
    fixture.detectChanges();
    type(fixture, 'Reason', 'Started typing');
    button(fixture, 'Cancel')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Discard');
    await fixture.whenStable();
    expect(document.activeElement).toBe(record());
  });

  it('sets short or all-letter receipts in Fira Code in the hint and the dialog (m-11)', async () => {
    const fixture = await render(refunded({ effectivePayout: sent({ reference: 'ABCD' }) }));
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const hint = el.querySelector('.field-hint')!;
    expect(hint.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Leave empty if the receipt was right. Current: ABCD',
    );
    expect(Array.from(hint.querySelectorAll('.num'), (n) => n.textContent)).toEqual(['ABCD']);
    type(fixture, 'Correct M-Pesa receipt', 'wxyz');
    type(fixture, 'Reason', 'Typed the receipt wrong');
    button(fixture, 'Save correction')[0].click();
    fixture.detectChanges();
    const body = el.querySelector('.confirm-body')!;
    expect(body.textContent?.replace(/\s+/g, ' ')).toContain('New receipt WXYZ.');
    expect(Array.from(body.querySelectorAll('.num'), (n) => n.textContent)).toEqual(['WXYZ']);
  });

  it('Cancel asks before discarding typed input', async () => {
    const fixture = await render(refunded());
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    button(fixture, 'Cancel')[0].click();
    fixture.detectChanges();
    expect(button(fixture, 'Record a correction')).toHaveLength(1);
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    type(fixture, 'Reason', 'Started typing');
    button(fixture, 'Cancel')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Discard this correction?');
    await confirm(fixture, 'Discard');
    expect(button(fixture, 'Record a correction')).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('textarea')).toBeNull();
  });

  // --- Row 136: combined task cap ---
  const capError = {
    statusCode: 409,
    code: 'task_exposure_cap_exceeded',
    message: 'x',
    totalPaidToNitume: '1200.00',
    committedRefunds: '0.00',
    committedReimbursements: '700.00',
    remaining: '500.00',
    requested: '1200.00',
  };
  const NOTE = 'Runner bought the wrong item; customer refunded in full.';

  it('shows the task exposure and the recorded cap overrides (row 136)', async () => {
    const fixture = await render(
      review({
        taskExposure: {
          totalPaidToNitume: '1200.00',
          committedRefunds: '0.00',
          committedReimbursements: '700.00',
          remaining: '500.00',
        },
        exposureOverrides: [
          {
            id: 'o1',
            source: 'runner_reimbursement',
            refundReviewId: null,
            runnerPayoutLineId: 'l1',
            amount: '700.00',
            normalCap: '600.00',
            totalPaidToNitume: '1200.00',
            committedRefunds: '600.00',
            committedReimbursements: '0.00',
            note: 'Receipt checked with the merchant.',
            createdByUserId: 'aaaaaaaa-0000-0000-0000-00000000beef',
            createdAt: '2026-10-08T08:00:00Z',
          },
        ],
      }),
    );
    expect(card(fixture, 'Task exposure')).toEqual({
      'Total paid to Nitume': 'KSh 1,200',
      'Customer refunds committed': 'KSh 0',
      'Runner reimbursements committed': 'KSh 700',
      'Left within the task cap': 'KSh 500',
    });
    expect(card(fixture, 'Cap overrides')).toEqual({
      Amount: 'KSh 700',
      'Normal cap at the time': 'KSh 600',
      Note: 'Receipt checked with the merchant.',
      By: '…beef',
    });
    expect(text(fixture)).toContain('Runner reimbursement');
  });

  it('asks for an override note after 409 task_exposure_cap_exceeded on the decision', async () => {
    const fixture = await render(review());
    type(fixture, 'Refund amount', '1200');
    button(fixture, 'Approve refund · KSh 1,200')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Approve refund');
    http
      .expectOne(`${API}/refunds/${RID}/decision`)
      .flush(capError, { status: 409, statusText: 'Conflict' });
    await flushAsync();
    fixture.detectChanges();
    // The input stays; the figures and the note field appear.
    expect(field(fixture, 'Refund amount').value).toBe('1200');
    expect(text(fixture)).toContain('This is KSh 700 above the task cap.');
    const primary = button(fixture, 'Approve refund over the cap · KSh 1,200')[0];
    primary.click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Explain the override in 10 to 500 characters.');
    expect(text(fixture)).not.toContain('Approve a refund of');
    type(fixture, 'Why go over the cap?', NOTE);
    button(fixture, 'Approve refund over the cap · KSh 1,200')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain(
      'This goes over the task cap. Your note is kept in the audit history.',
    );
    await confirm(fixture, 'Approve refund');
    const req = http.expectOne(`${API}/refunds/${RID}/decision`);
    expect(req.request.body).toEqual({ refundAmount: 1200, exposureOverrideNote: NOTE });
    req.flush({ ...review(), status: 'approved', refundAmount: '1200.00' });
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
  });

  it('lowering the amount to the cap hides the override field', async () => {
    const fixture = await render(review());
    type(fixture, 'Refund amount', '1200');
    button(fixture, 'Approve refund · KSh 1,200')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Approve refund');
    http
      .expectOne(`${API}/refunds/${RID}/decision`)
      .flush(capError, { status: 409, statusText: 'Conflict' });
    await flushAsync();
    fixture.detectChanges();
    type(fixture, 'Refund amount', '500');
    expect(text(fixture)).not.toContain('Why go over the cap?');
    expect(button(fixture, 'Approve refund · KSh 500')).toHaveLength(1);
  });

  it('carries the override note on a re-sent payout over the cap', async () => {
    const reversal = record({ kind: 'reversed', newReference: 'RVS9K2L1MX' });
    const fixture = await render(
      refunded({ effectivePayout: reversedPayout, corrections: [reversal] }),
    );
    type(fixture, 'M-Pesa receipt', 'new8p3q2rs');
    type(fixture, 'Reason', 'Sent again to the right number');
    button(fixture, 'Record new payout')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Record new payout');
    http
      .expectOne(`${API}/refunds/${RID}/corrections`)
      .flush(capError, { status: 409, statusText: 'Conflict' });
    await flushAsync();
    fixture.detectChanges();
    expect(text(fixture)).toContain('This is KSh 700 above the task cap.');
    expect(button(fixture, 'Record new payout over the cap')[0].disabled).toBe(true);
    type(fixture, 'Why go over the cap?', NOTE);
    button(fixture, 'Record new payout over the cap')[0].click();
    fixture.detectChanges();
    await confirm(fixture, 'Record new payout over the cap');
    const req = http.expectOne(`${API}/refunds/${RID}/corrections`);
    expect(req.request.body).toMatchObject({ kind: 'resent', exposureOverrideNote: NOTE });
    req.flush(refunded({ effectivePayout: sent({ reference: 'NEW8P3Q2RS' }), corrections: [] }));
    await flushAsync();
    http.match(() => true).forEach((r) => r.flush({ count: 0 }));
  });
});
