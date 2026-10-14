import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import {
  LINES_CHANGED_COPY,
  RECEIPT_REUSED_COPY,
  RunnerPayoutsPanelComponent,
  runnerPayoutSubLine,
} from './runner-payouts.panel';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import type { RunnerPayoutItem } from '../../../core/api-types';

const RUNNER = 'rrrrrrrr-0000-0000-0000-00000000ab12';

function line(id: string, patch: Partial<RunnerPayoutItem> = {}): RunnerPayoutItem {
  return {
    id,
    runnerProfileId: RUNNER,
    errandId: `eeeeeeee-0000-0000-0000-0000000${id.padStart(5, '0')}`,
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
      id: 'e',
      reference: `NT-1${id.padStart(4, '0')}`,
      title: null,
      category: 'buy_for_me',
      status: 'CONFIRMED',
    },
    runner: { id: RUNNER, displayName: 'Brian Otieno', shortName: 'Brian O.' },
    decidedBy: null,
    paidBy: null,
    ...patch,
  };
}

const payable = (id: string, amount: string, patch: Partial<RunnerPayoutItem> = {}) =>
  line(id, {
    kind: 'runner_fee',
    status: 'payable',
    effectiveStatus: 'payable',
    reviewReason: null,
    requestedAmount: amount,
    amount,
    ...patch,
  });

const list =
  (params: Record<string, string | null> = {}) =>
  (r: { url: string; params: { get(k: string): string | null } }) =>
    r.url === `${API}/runner-payouts` &&
    Object.entries(params).every(([k, v]) => r.params.get(k) === v);

describe('runner payouts panel copy', () => {
  it('sub-line per filter, with + while there are more pages', () => {
    expect(runnerPayoutSubLine('on_hold', [line('1')], false)).toBe('1 to review');
    expect(
      runnerPayoutSubLine('payable', [{ amount: '2500.00' }, { amount: '4250.50' }], true),
    ).toBe('2+ owed · KSh 6,750.50');
    expect(runnerPayoutSubLine('paid', [], false)).toBe('0 paid');
    expect(runnerPayoutSubLine('rejected', [line('1')], false)).toBe('1 not approved');
    expect(runnerPayoutSubLine('all', [line('1'), line('2')], false)).toBe('2 lines');
  });
});

describe('RunnerPayoutsPanelComponent (p-runner-payouts)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
    TestBed.inject(AdminDataService).runners.set([{ id: RUNNER, userId: 'u', createdAt: 'x' }]);
  });
  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(RunnerPayoutsPanelComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    http.expectOne(`${API}/runner-payouts/count?status=on_hold`).flush({ count: 3 });
    return fixture;
  }
  type Fixture = Awaited<ReturnType<typeof render>>;
  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const text = (f: Fixture) => (el(f).textContent ?? '').replace(/\s+/g, ' ');
  const button = (f: Fixture, label: string) =>
    Array.from(el(f).querySelectorAll('button')).filter(
      (b) => b.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
  async function settle(f: Fixture) {
    await flushAsync();
    f.detectChanges();
  }
  function choose(f: Fixture, aria: string, value: string) {
    const select = el(f).querySelector(`select[aria-label="${aria}"]`) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    f.detectChanges();
    http.expectOne(`${API}/runner-payouts/count?status=on_hold`).flush({ count: 3 });
  }

  /** Payable lines of one runner: the batch view. */
  async function payableView(items: RunnerPayoutItem[]) {
    const fixture = await render();
    http.expectOne(list({ status: 'on_hold' })).flush({ items: [line('9')], nextCursor: null });
    await settle(fixture);
    choose(fixture, 'Filter runner payouts by status', 'payable');
    http.expectOne(list({ status: 'payable' })).flush({ items, nextCursor: null });
    await settle(fixture);
    choose(fixture, 'Filter runner payouts by runner', RUNNER);
    http
      .expectOne(list({ status: 'payable', runnerProfileId: RUNNER }))
      .flush({ items, nextCursor: null });
    await settle(fixture);
    return fixture;
  }

  it('defaults to Needs review: reference, runner, requested amount, reason, badge', async () => {
    const fixture = await render();
    const req = http.expectOne(list({ status: 'on_hold' }));
    expect(req.request.params.get('limit')).toBe('25');
    expect(req.request.params.get('kind')).toBeNull();
    req.flush({ items: [line('1')], nextCursor: null });
    await settle(fixture);
    const row = el(fixture).querySelector('tbody tr') as HTMLElement;
    const cells = Array.from(row.querySelectorAll('td'), (td) =>
      (td.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(cells.slice(0, 5)).toEqual([
      'Buy For Me#NT-10001',
      'Brian O.',
      'Item reimbursement',
      'KSh 4,000 requested',
      'Needs reviewNo receipt',
    ]);
    expect(row.querySelector('td.num')?.classList.contains('num')).toBe(true);
    const action = row.querySelector('.row-assign') as HTMLButtonElement;
    expect(action.textContent?.trim()).toBe('Review');
    expect(action.getAttribute('aria-label')).toBe('Review Item reimbursement for #NT-10001');
    expect(text(fixture)).toContain('1 to review');
    // No selection outside Payable + one runner.
    expect(el(fixture).querySelector('input[type="checkbox"]')).toBeNull();
    expect(TestBed.inject(AdminDataService).runnerPayoutBadge().count).toBe(3);
    // The runner filter learns names from the lines.
    const options = Array.from(
      el(fixture).querySelectorAll('select[aria-label="Filter runner payouts by runner"] option'),
      (o) => o.textContent?.trim(),
    );
    expect(options).toEqual(['All runners', 'Brian O.']);
  });

  it('sends the type filter and shows the empty state per status', async () => {
    const fixture = await render();
    http.expectOne(list({ status: 'on_hold' })).flush({ items: [], nextCursor: null });
    await settle(fixture);
    expect(text(fixture)).toContain('Nothing to review');
    choose(fixture, 'Filter runner payouts by type', 'runner_fee');
    http
      .expectOne(list({ status: 'on_hold', kind: 'runner_fee' }))
      .flush({ items: [], nextCursor: null });
    await settle(fixture);
    choose(fixture, 'Filter runner payouts by status', 'all');
    http
      .expectOne(list({ status: null, kind: 'runner_fee' }))
      .flush({ items: [], nextCursor: null });
    await settle(fixture);
    expect(text(fixture)).toContain('No payout lines yet');
  });

  it('a reversed payout reads Payout reversed, offers Re-send and cannot be selected', async () => {
    const reversed = payable('2', '1500.00', {
      status: 'paid',
      effectivePayout: { state: 'reversed', amount: '0.00', reference: null, at: null },
    });
    const fixture = await payableView([payable('1', '2500.00'), reversed]);
    const rows = el(fixture).querySelectorAll('tbody tr');
    expect(rows[1].textContent).toContain('Payout reversed');
    expect(rows[1].querySelector('.row-assign')?.textContent?.trim()).toBe('Re-send');
    expect((rows[1].querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect((rows[0].querySelector('input') as HTMLInputElement).disabled).toBe(false);
    expect(text(fixture)).toContain('Lines marked "Payout reversed" are owed again.');
  });

  it('records one M-Pesa payout for the selected lines of one runner', async () => {
    const fixture = await payableView([payable('1', '2500.00'), payable('2', '4250.00')]);
    const boxes = el(fixture).querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]');
    expect(boxes[0].getAttribute('aria-label')).toBe('Select Runner fee for #NT-10001');
    boxes.forEach((b) => b.click());
    fixture.detectChanges();
    expect(text(fixture)).toContain('2 lines · KSh 6,750');
    button(fixture, 'Record payout')[0].click();
    fixture.detectChanges();
    http.expectOne(`${API}/runner-payouts/1`).flush({
      ...payable('1', '2500.00'),
      runner: {
        id: RUNNER,
        userId: 'u',
        displayName: 'Brian Otieno',
        shortName: 'Brian O.',
        phone: '+254712345678',
        maxPurchaseAdvance: '3000.00',
      },
    });
    await settle(fixture);
    expect(text(fixture)).toContain('Record M-Pesa payout to Brian O.?');
    expect(text(fixture)).toContain('Send KSh 6,750 to +254 712 345 678 by M-Pesa');
    const confirm = () => button(fixture, 'Mark as paid')[0];
    expect(confirm().disabled).toBe(true);
    const input = el(fixture).querySelector('.confirm-card input') as HTMLInputElement;
    input.value = 'slk4h7xq2p';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    confirm().click();
    const req = http.expectOne(`${API}/runner-payouts/mark-paid`);
    expect(req.request.body).toEqual({ lineIds: ['1', '2'], payoutReference: 'SLK4H7XQ2P' });
    const paid = (l: RunnerPayoutItem) => ({
      ...l,
      status: 'paid',
      effectiveStatus: 'paid',
      payoutReference: 'SLK4H7XQ2P',
      effectivePayout: {
        state: 'sent' as const,
        amount: l.amount!,
        reference: 'SLK4H7XQ2P',
        at: null,
      },
    });
    req.flush({ items: [paid(payable('1', '2500.00')), paid(payable('2', '4250.00'))] });
    await settle(fixture);
    http.expectOne(`${API}/runner-payouts/count?status=on_hold`).flush({ count: 3 });
    fixture.detectChanges();
    expect(text(fixture)).toContain('Payout recorded: KSh 6,750 · SLK4H7XQ2P.');
    expect(el(fixture).querySelector('app-batch-bar')).toBeNull();
    expect(el(fixture).querySelectorAll('tbody .chip-success')).toHaveLength(2);
  });

  it('409 runner_payout_locked reloads the list and explains', async () => {
    const fixture = await payableView([payable('1', '2500.00')]);
    (el(fixture).querySelector('tbody input') as HTMLInputElement).click();
    fixture.detectChanges();
    button(fixture, 'Record payout')[0].click();
    http.expectOne(`${API}/runner-payouts/1`).flush({ ...payable('1', '2500.00'), runner: null });
    await settle(fixture);
    expect(text(fixture)).toContain("Find the runner's number in their profile before you send.");
    const input = el(fixture).querySelector('.confirm-card input') as HTMLInputElement;
    input.value = 'SLK4H7XQ2P';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button(fixture, 'Mark as paid')[0].click();
    http
      .expectOne(`${API}/runner-payouts/mark-paid`)
      .flush(
        { statusCode: 409, code: 'runner_payout_locked', message: 'x', lineId: '1' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle(fixture);
    http.expectOne(`${API}/runner-payouts/count?status=on_hold`).flush({ count: 3 });
    http
      .expectOne(list({ status: 'payable', runnerProfileId: RUNNER }))
      .flush({ items: [], nextCursor: null });
    await settle(fixture);
    expect(text(fixture)).toContain(LINES_CHANGED_COPY);
    expect(el(fixture).querySelector('.confirm-card')).toBeNull();
  });

  it('409 payout_reference_reused keeps the dialog open with a field error', async () => {
    const fixture = await payableView([payable('1', '2500.00')]);
    (el(fixture).querySelector('tbody input') as HTMLInputElement).click();
    fixture.detectChanges();
    button(fixture, 'Record payout')[0].click();
    http.expectOne(`${API}/runner-payouts/1`).flush({ ...payable('1', '2500.00'), runner: null });
    await settle(fixture);
    const input = el(fixture).querySelector('.confirm-card input') as HTMLInputElement;
    input.value = 'SLK4H7XQ2P';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button(fixture, 'Mark as paid')[0].click();
    http
      .expectOne(`${API}/runner-payouts/mark-paid`)
      .flush(
        { statusCode: 409, code: 'payout_reference_reused', message: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle(fixture);
    expect(el(fixture).querySelector('.confirm-card .field-error')?.textContent).toBe(
      RECEIPT_REUSED_COPY,
    );
  });

  it('refuses a 51st line with an info notice', async () => {
    const items = Array.from({ length: 51 }, (_, i) => payable(String(i + 1), '100.00'));
    const fixture = await payableView(items);
    el(fixture)
      .querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')
      .forEach((b) => b.click());
    fixture.detectChanges();
    expect(text(fixture)).toContain('50 lines · KSh 5,000');
    expect(text(fixture)).toContain('One payout covers at most 50 lines.');
  });

  it('opens the line in the runner payout drawer', async () => {
    const fixture = await render();
    http.expectOne(list({ status: 'on_hold' })).flush({ items: [line('1')], nextCursor: null });
    await settle(fixture);
    (el(fixture).querySelector('.row-assign') as HTMLButtonElement).click();
    expect(TestBed.inject(DrawerNavService).current()).toEqual({ kind: 'runner_payout', id: '1' });
  });
});
