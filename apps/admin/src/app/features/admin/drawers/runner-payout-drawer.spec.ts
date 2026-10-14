import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import {
  RunnerPayoutDrawerComponent,
  validateApproveAmount,
  validateNote,
} from './runner-payout-drawer';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import type { RunnerPayoutDetail } from '../../../core/api-types';

const LID = 'llllllll-0000-0000-0000-000000000001';
const ERRAND = 'eeeeeeee-0000-0000-0000-000000010482';
const RUNNER = 'rrrrrrrr-0000-0000-0000-00000000ab12';
const RECEIPT = 'vvvvvvvv-0000-0000-0000-000000000001';

function detail(patch: Partial<RunnerPayoutDetail> = {}): RunnerPayoutDetail {
  return {
    id: LID,
    runnerProfileId: RUNNER,
    errandId: ERRAND,
    kind: 'item_reimbursement',
    status: 'on_hold',
    requestedAmount: '4000.00',
    amount: null,
    capAmount: '4500.00',
    reviewReason: 'receipt_missing',
    receiptEvidenceId: null,
    payoutReference: null,
    paidAt: null,
    paidByUserId: null,
    note: null,
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null,
    createdByUserId: null,
    createdAt: '2026-10-13T06:00:00Z',
    effectiveStatus: 'on_hold',
    effectivePayout: null,
    errand: {
      id: ERRAND,
      reference: 'NT-10482',
      title: 'Weekly shopping',
      category: 'buy_for_me',
      status: 'CONFIRMED',
    },
    runner: {
      id: RUNNER,
      userId: 'u',
      displayName: 'Brian Otieno',
      shortName: 'Brian O.',
      phone: '+254712345678',
      maxPurchaseAdvance: '3000.00',
    },
    decidedBy: null,
    paidBy: null,
    itemPaidToNitume: '4500.00',
    approvalCeiling: '3000.00',
    corrections: [],
    correctionCeiling: null,
    ...patch,
  };
}

const payableLine = (patch: Partial<RunnerPayoutDetail> = {}) =>
  detail({
    status: 'payable',
    effectiveStatus: 'payable',
    reviewReason: null,
    amount: '3000.00',
    approvalCeiling: null,
    decidedAt: '2026-10-13T07:00:00Z',
    ...patch,
  });

const paidLine = (patch: Partial<RunnerPayoutDetail> = {}) =>
  payableLine({
    status: 'paid',
    effectiveStatus: 'paid',
    payoutReference: 'SLK4H7XQ2P',
    paidAt: '2026-10-13T08:00:00Z',
    effectivePayout: { state: 'sent', amount: '3000.00', reference: 'SLK4H7XQ2P', at: null },
    correctionCeiling: '3000.00',
    ...patch,
  });

describe('runner payout drawer rules', () => {
  it('approve amount: > 0, 2 decimals, at most the ceiling', () => {
    expect(validateApproveAmount('3000', '3000.00')).toBeNull();
    expect(validateApproveAmount('0', '3000.00')).toBe(
      'Enter an amount in KSh, up to 2 decimal places.',
    );
    expect(validateApproveAmount('3000.01', '3000.00')).toBe('You can approve up to KSh 3,000.');
  });

  it('notes are 5 to 500 characters', () => {
    expect(validateNote('  abc ')).toBe('Say why in 5 to 500 characters.');
    expect(validateNote('Blurry')).toBeNull();
  });
});

describe('RunnerPayoutDrawerComponent (drawer-runner-payout)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render(d: RunnerPayoutDetail) {
    const fixture = TestBed.createComponent(RunnerPayoutDrawerComponent);
    fixture.componentRef.setInput('lineId', LID);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    http.expectOne(`${API}/runner-payouts/${LID}`).flush(d);
    await flushAsync();
    fixture.detectChanges();
    return fixture;
  }
  type Fixture = Awaited<ReturnType<typeof render>>;
  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const text = (f: Fixture) => (el(f).textContent ?? '').replace(/\s+/g, ' ');
  const button = (f: Fixture, label: string) =>
    Array.from(el(f).querySelectorAll('button')).filter(
      (b) => b.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
  function field(f: Fixture, label: string): HTMLInputElement {
    const lab = Array.from(el(f).querySelectorAll('label')).find(
      (l) => l.textContent?.trim() === label,
    );
    if (!lab) throw new Error(`no field ${label}`);
    return el(f).querySelector(`#${lab.getAttribute('for')}`) as HTMLInputElement;
  }
  function type(f: Fixture, label: string, value: string) {
    const input = field(f, label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    f.detectChanges();
  }
  function card(f: Fixture, label: string): Record<string, string> {
    const section = Array.from(el(f).querySelectorAll('.drawer-section')).find(
      (s) => s.querySelector('.drawer-label')?.textContent?.trim() === label,
    );
    if (!section) return {};
    return Object.fromEntries(
      Array.from(section.querySelectorAll('.drawer-row'), (r) =>
        Array.from(r.children, (c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()),
      ),
    );
  }
  async function settle(f: Fixture) {
    await flushAsync();
    http.match(`${API}/runner-payouts/count?status=on_hold`).forEach((r) => r.flush({ count: 0 }));
    f.detectChanges();
  }

  it('shows the summary, the amounts apart from any fee, and the receipt', async () => {
    const fixture = await render(detail({ receiptEvidenceId: RECEIPT, note: 'Bought at Naivas' }));
    http.expectOne(`${API}/errands/${ERRAND}/evidence`).flush([
      {
        id: RECEIPT,
        errandId: ERRAND,
        type: 'receipt',
        url: 'https://files.example/receipt.jpg',
        urlExpiresAt: null,
        capturedAt: '2026-10-13T05:00:00Z',
        createdAt: '2026-10-13T05:00:00Z',
      },
    ]);
    await settle(fixture);
    expect(text(fixture)).toContain('Needs review');
    expect(text(fixture)).toContain('Brian O. · Item reimbursement · Created');
    expect(text(fixture)).toContain('#NT-10482');
    expect(text(fixture)).toContain('+254 712 345 678');
    expect(text(fixture)).toContain('Why it needs review');
    expect(card(fixture, 'Amounts')).toEqual({
      Requested: 'KSh 4,000',
      'Item paid to Nitume': 'KSh 4,500',
      "Runner's purchase limit": 'KSh 3,000',
      'Most you can approve': 'KSh 3,000',
    });
    expect(text(fixture)).not.toContain('Service');
    const link = el(fixture).querySelector('.receipt-link') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
    expect(text(fixture)).toContain('System note');
    // Admin copy never says hold or balance.
    expect(text(fixture)).not.toMatch(/\bhold\b|\bheld\b|balance/i);
  });

  it('approves the full amount after confirming', async () => {
    const fixture = await render(detail());
    await settle(fixture);
    expect(document.activeElement).toBe(field(fixture, 'Amount to reimburse'));
    button(fixture, 'Full amount')[0].click();
    fixture.detectChanges();
    button(fixture, 'Approve · KSh 3,000')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Approve KSh 3,000 for Brian O.?');
    expect(text(fixture)).toContain('added to what Nitume owes the runner');
    button(fixture, 'Approve').at(-1)!.click();
    const req = http.expectOne(`${API}/runner-payouts/${LID}/review`);
    expect(req.request.body).toEqual({ decision: 'approve', amount: 3000 });
    req.flush(payableLine());
    await settle(fixture);
    expect(text(fixture)).toContain('Reimbursement approved: KSh 3,000.');
    expect(text(fixture)).toContain('Record the payout');
    expect(TestBed.inject(AdminDataService).lastRunnerPayoutUpdate()?.[0].id).toBe(LID);
  });

  it('400 reimbursement_exceeds_cap shows the cap and its basis', async () => {
    const fixture = await render(detail());
    await settle(fixture);
    type(fixture, 'Amount to reimburse', '2500');
    button(fixture, 'Approve · KSh 2,500')[0].click();
    fixture.detectChanges();
    button(fixture, 'Approve').at(-1)!.click();
    http.expectOne(`${API}/runner-payouts/${LID}/review`).flush(
      {
        statusCode: 400,
        code: 'reimbursement_exceeds_cap',
        message: 'x',
        cap: '2000.00',
        itemPaidToNitume: '2000.00',
        maxPurchaseAdvance: '3000.00',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain('You can approve up to KSh 2,000.');
    expect(text(fixture)).toContain('Item paid to Nitume KSh 2,000 · purchase limit KSh 3,000.');
  });

  it('409 task_exposure_cap_exceeded asks for an override note and re-sends it', async () => {
    const fixture = await render(detail({ errand: { ...detail().errand!, status: 'CANCELLED' } }));
    await settle(fixture);
    type(fixture, 'Amount to reimburse', '3000');
    button(fixture, 'Approve · KSh 3,000')[0].click();
    fixture.detectChanges();
    button(fixture, 'Approve').at(-1)!.click();
    http.expectOne(`${API}/runner-payouts/${LID}/review`).flush(
      {
        statusCode: 409,
        code: 'task_exposure_cap_exceeded',
        message: 'x',
        totalPaidToNitume: '4500.00',
        committedRefunds: '2000.00',
        committedReimbursements: '0.00',
        remaining: '2500.00',
        requested: '3000.00',
        scope: 'task',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);
    expect(field(fixture, 'Amount to reimburse').value).toBe('3000');
    expect(text(fixture)).toContain('This is KSh 500 above the task cap.');
    expect(text(fixture)).toContain('Left within the task cap');
    type(fixture, 'Why go over the cap?', 'Receipt checked with the merchant.');
    button(fixture, 'Approve over the cap · KSh 3,000')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('This goes over the task cap.');
    button(fixture, 'Approve over the cap').at(-1)!.click();
    const req = http.expectOne(`${API}/runner-payouts/${LID}/review`);
    expect(req.request.body).toEqual({
      decision: 'approve',
      amount: 3000,
      exposureOverrideNote: 'Receipt checked with the merchant.',
    });
    req.flush(payableLine());
    await settle(fixture);
  });

  it('labels the item-scope figures (row 136 scope item)', async () => {
    const fixture = await render(detail());
    await settle(fixture);
    type(fixture, 'Amount to reimburse', '3000');
    button(fixture, 'Approve · KSh 3,000')[0].click();
    fixture.detectChanges();
    button(fixture, 'Approve').at(-1)!.click();
    http.expectOne(`${API}/runner-payouts/${LID}/review`).flush(
      {
        statusCode: 409,
        code: 'task_exposure_cap_exceeded',
        message: 'x',
        totalPaidToNitume: '4500.00',
        committedRefunds: '2000.00',
        committedReimbursements: '0.00',
        remaining: '2500.00',
        requested: '3000.00',
        scope: 'item',
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);
    expect(text(fixture)).toContain(
      "Price-decrease refunds and the runner's item reimbursement both come out of the item amount paid. This is KSh 500 above it.",
    );
    expect(text(fixture)).toContain('Other price-decrease refunds');
    expect(text(fixture)).toContain('Left of the item amount');
  });

  it('rejects with a required reason', async () => {
    const fixture = await render(detail());
    await settle(fixture);
    (el(fixture).querySelectorAll('.seg-option')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    button(fixture, 'Reject reimbursement')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Say why in 5 to 500 characters.');
    type(fixture, 'Reason', 'Receipt is for a different shop');
    button(fixture, 'Reject reimbursement')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain("The line closes and can't be reopened.");
    button(fixture, 'Reject reimbursement').at(-1)!.click();
    const req = http.expectOne(`${API}/runner-payouts/${LID}/review`);
    expect(req.request.body).toEqual({
      decision: 'reject',
      note: 'Receipt is for a different shop',
    });
    req.flush(detail({ status: 'rejected', effectiveStatus: 'rejected', decidedAt: 'x' }));
    await settle(fixture);
    expect(text(fixture)).toContain('Reimbursement rejected.');
  });

  it('links the undecided price-decrease refund (price_decrease_pending)', async () => {
    const fixture = await render(detail({ reviewReason: 'price_decrease_pending' }));
    http.expectOne(`${API}/errands/${ERRAND}/refunds`).flush({
      items: [
        { id: 'r-old', errandId: ERRAND, trigger: 'price_change_decrease', status: 'refunded' },
        { id: 'r-1', errandId: ERRAND, trigger: 'price_change_decrease', status: 'pending_review' },
      ],
    });
    await settle(fixture);
    expect(text(fixture)).toContain('Waiting for the price-decrease refund decision');
    expect(text(fixture)).toContain('A price-decrease refund on this task is still undecided.');
    button(fixture, 'Open refund review')[0].click();
    expect(TestBed.inject(DrawerNavService).current()).toEqual({ kind: 'refund', id: 'r-1' });
  });

  it('records the payout of this line', async () => {
    const fixture = await render(payableLine());
    await settle(fixture);
    expect(text(fixture)).toContain('Send KSh 3,000 to +254 712 345 678 by M-Pesa');
    type(fixture, 'M-Pesa receipt', 'slk4h7xq2p');
    button(fixture, 'Mark as paid')[0].click();
    fixture.detectChanges();
    button(fixture, 'Mark as paid').at(-1)!.click();
    const req = http.expectOne(`${API}/runner-payouts/mark-paid`);
    expect(req.request.body).toEqual({ lineIds: [LID], payoutReference: 'SLK4H7XQ2P' });
    req.flush({
      items: [{ ...paidLine(), runner: { id: RUNNER, displayName: null, shortName: 'Brian O.' } }],
    });
    await settle(fixture);
    expect(text(fixture)).toContain('Payout recorded: KSh 3,000 · SLK4H7XQ2P.');
    expect(card(fixture, 'Payout')['M-Pesa receipt']).toBe('SLK4H7XQ2P');
    // The runner's phone survives the list-shaped response.
    expect(text(fixture)).toContain('+254 712 345 678');
  });

  it('409 runner_payout_not_payable reloads and explains', async () => {
    const fixture = await render(payableLine());
    await settle(fixture);
    type(fixture, 'M-Pesa receipt', 'SLK4H7XQ2P');
    button(fixture, 'Mark as paid')[0].click();
    fixture.detectChanges();
    button(fixture, 'Mark as paid').at(-1)!.click();
    http
      .expectOne(`${API}/runner-payouts/mark-paid`)
      .flush(
        { statusCode: 409, code: 'runner_payout_not_payable', message: 'x', lineId: LID },
        { status: 409, statusText: 'Conflict' },
      );
    await flushAsync();
    http.expectOne(`${API}/runner-payouts/${LID}`).flush(paidLine());
    await settle(fixture);
    expect(text(fixture)).toContain('Some lines changed since you loaded them.');
  });

  it('sends a payable item line back for review', async () => {
    const fixture = await render(payableLine());
    await settle(fixture);
    button(fixture, 'Send back for review')[0].click();
    fixture.detectChanges();
    type(fixture, "What's wrong with the receipt?", 'Total does not match');
    button(fixture, 'Send back for review').at(-1)!.click();
    const req = http.expectOne(`${API}/runner-payouts/${LID}/hold`);
    expect(req.request.body).toEqual({ note: 'Total does not match' });
    req.flush(detail({ reviewReason: 'receipt_mismatch' }));
    await settle(fixture);
    expect(text(fixture)).toContain('Sent back for review.');
    expect(text(fixture)).toContain("Receipt doesn't match");
  });

  it('a reversed payout is re-sent with resent_payout, never mark-paid', async () => {
    const reversal = {
      id: 'c1',
      kind: 'reversal',
      previousReference: 'SLK4H7XQ2P',
      previousAmount: '3000.00',
      newReference: 'RVS9K2L1MX',
      newAmount: null,
      reason: 'M-Pesa reversed it',
      createdByUserId: 'a',
      createdBy: null,
      createdAt: '2026-10-13T09:00:00Z',
    };
    const fixture = await render(
      paidLine({
        effectiveStatus: 'payable',
        effectivePayout: { state: 'reversed', amount: '0.00', reference: null, at: null },
        corrections: [reversal],
      }),
    );
    await settle(fixture);
    expect(text(fixture)).toContain('Payout reversed');
    expect(button(fixture, 'Mark as paid')).toHaveLength(0);
    expect(text(fixture)).toContain('Record the new payout');
    expect(field(fixture, 'Amount sent').value).toBe('3000');
    expect(document.activeElement).toBe(field(fixture, 'M-Pesa receipt'));
    type(fixture, 'M-Pesa receipt', 'new8p3q2rs');
    type(fixture, 'Reason', 'Sent again to the right number');
    button(fixture, 'Record new payout')[0].click();
    fixture.detectChanges();
    expect(text(fixture)).toContain("M-Pesa receipt NEW8P3Q2RS. This can't be edited or deleted.");
    button(fixture, 'Record new payout').at(-1)!.click();
    const req = http.expectOne(`${API}/runner-payouts/${LID}/corrections`);
    expect(req.request.body).toEqual({
      kind: 'resent_payout',
      newReference: 'NEW8P3Q2RS',
      newAmount: 3000,
      reason: 'Sent again to the right number',
      expectedLatestCorrectionId: 'c1',
    });
    req.flush(
      paidLine({
        corrections: [
          reversal,
          {
            ...reversal,
            id: 'c2',
            kind: 'resent_payout',
            newReference: 'NEW8P3Q2RS',
            newAmount: '3000.00',
          },
        ],
        effectivePayout: { state: 'sent', amount: '3000.00', reference: 'NEW8P3Q2RS', at: null },
      }),
    );
    await settle(fixture);
    expect(text(fixture)).toContain('Payout sent again.');
    expect(text(fixture)).toContain('Payout sent again · NEW8P3Q2RS');
    expect(button(fixture, 'Record a correction')).toHaveLength(1);
  });

  it('409 payout_correction_conflict reloads and keeps the reason', async () => {
    const fixture = await render(paidLine());
    await settle(fixture);
    button(fixture, 'Record a correction')[0].click();
    fixture.detectChanges();
    type(fixture, 'Correct M-Pesa receipt', 'SLK4H7XQ2Q');
    type(fixture, 'Reason', 'Typed the receipt wrong');
    button(fixture, 'Save correction')[0].click();
    fixture.detectChanges();
    button(fixture, 'Save correction').at(-1)!.click();
    http
      .expectOne(`${API}/runner-payouts/${LID}/corrections`)
      .flush(
        { statusCode: 409, code: 'payout_correction_conflict', message: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    await flushAsync();
    http.expectOne(`${API}/runner-payouts/${LID}`).flush(paidLine());
    await settle(fixture);
    expect(text(fixture)).toContain(
      'Someone else changed this payout. Check the latest and try again.',
    );
    expect(field(fixture, 'Reason').value).toBe('Typed the receipt wrong');
  });

  it('an unknown 400 code shows a notice instead of failing silently', async () => {
    const fixture = await render(detail());
    await settle(fixture);
    type(fixture, 'Amount to reimburse', '100');
    button(fixture, 'Approve · KSh 100')[0].click();
    fixture.detectChanges();
    button(fixture, 'Approve').at(-1)!.click();
    http
      .expectOne(`${API}/runner-payouts/${LID}/review`)
      .flush(
        { statusCode: 400, code: 'something_new', message: 'x' },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle(fixture);
    expect(text(fixture)).toContain("Couldn't save this change. Check the details and try again.");
  });
});
