import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import { refundRowAction, refundSubLine, RefundsPanelComponent } from './refunds.panel';
import { AdminDataService } from '../admin-data.service';
import { DrawerNavService } from '../drawer-nav.service';
import type { RefundListItem } from '../../../core/api-types';

function item(id: string, patch: Partial<RefundListItem> = {}): RefundListItem {
  return {
    id,
    errandId: `eeeeeeee-0000-0000-0000-0000000${id.padStart(5, '0')}`,
    trigger: 'cancelled_after_payment',
    amountPaid: '1200.50',
    refundAmount: null,
    status: 'pending_review',
    createdAt: '2026-10-08T06:00:00Z',
    errand: null,
    decidedBy: null,
    paidBy: null,
    ...patch,
  };
}

const list = (status?: string) => (r: { url: string; params: { get(k: string): string | null } }) =>
  r.url === `${API}/refunds` && (status === undefined ? true : r.params.get('status') === status);

describe('refunds panel copy', () => {
  it('sub-line per filter, with + while there are more pages', () => {
    expect(refundSubLine('pending_review', 0, false)).toBe('No refunds to review');
    expect(refundSubLine('pending_review', 25, true)).toBe('25+ to review');
    expect(refundSubLine('approved', 2, false)).toBe('2 payouts to record');
    expect(refundSubLine('all', 3, false)).toBe('3 refund reviews');
  });

  it('row actions', () => {
    expect(refundRowAction('pending_review')).toBe('Review');
    expect(refundRowAction('approved')).toBe('Record payout');
    expect(refundRowAction('refunded')).toBe('View');
  });
});

describe('RefundsPanelComponent (G-1)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(RefundsPanelComponent);
    fixture.detectChanges();
    http.expectOne(`${API}/refunds/count?status=pending_review`).flush({ count: 3 });
    return fixture;
  }

  it('defaults to Needs review and renders exact amounts and refund chips', async () => {
    const fixture = await render();
    const req = http.expectOne(list('pending_review'));
    expect(req.request.params.get('limit')).toBe('25');
    req.flush({ items: [item('1')], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('KSh 1,200.50');
    expect(el.textContent).toContain('Needs review');
    expect(el.textContent).toContain('Cancelled after payment');
    const btn = el.querySelector('.row-assign') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('Review');
    expect(btn.getAttribute('aria-label')).toMatch(/^Review refund for #NT-/);
    expect(TestBed.inject(AdminDataService).refundBadge().count).toBe(3);
  });

  it('labels the amountPaid column Refundable (SA-1)', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush({ items: [item('1')], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    const heads = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('th'), (th) =>
      th.textContent?.trim(),
    );
    expect(heads.slice(0, 4)).toEqual(['Task', 'Reason', 'Refundable', 'Refund']);
    expect(heads).not.toContain('Paid to Nitume');
  });

  it('Refundable shows the net ceiling while pending (row 87)', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush({
      items: [
        item('1', { amountPaid: '1500.00', refundCeiling: '1200.00' }),
        item('2', {
          status: 'refunded',
          amountPaid: '800.00',
          refundAmount: '800.00',
          refundCeiling: null,
        }),
      ],
      nextCursor: null,
    });
    await flushAsync();
    fixture.detectChanges();
    const cells = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
      (tr) => tr.querySelectorAll('td')[2].textContent?.trim(),
    );
    expect(cells).toEqual(['KSh 1,200', 'KSh 800']);
  });

  it('labels paid EXPIRED / FAILED reviews Task expired / Task failed (row 102)', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush({
      items: [
        item('1', { trigger: 'expired_after_payment' }),
        item('2', { trigger: 'failed_after_payment' }),
      ],
      nextCursor: null,
    });
    await flushAsync();
    fixture.detectChanges();
    const reasons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody td.col-reason'),
      (td) => td.textContent?.trim(),
    );
    expect(reasons).toEqual(['Task expired', 'Task failed']);
  });

  it('empty states name expired and failed tasks and reversed payouts (rows 100, 102)', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush({ items: [], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    const text = () => (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text()).toContain(
      'Paid tasks that were cancelled, expired or failed, and price decreases on tasks paid to Nitume, land here for a refund decision.',
    );
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    for (const [value, copy] of [
      [
        'approved',
        'Approved refunds, and payouts that were reversed, wait here until you record the M-Pesa payout.',
      ],
      ['all', 'A review opens when a paid task is cancelled, expires or fails.'],
    ]) {
      select.value = value;
      select.dispatchEvent(new Event('change'));
      http.expectOne(`${API}/refunds/count?status=pending_review`).flush({ count: 0 });
      http
        .expectOne(list(value === 'all' ? undefined : value))
        .flush({ items: [], nextCursor: null });
      await flushAsync();
      fixture.detectChanges();
      expect(text()).toContain(copy);
    }
  });

  it('shows the filter-specific empty state', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush({ items: [], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'approved';
    select.dispatchEvent(new Event('change'));
    http.expectOne(`${API}/refunds/count?status=pending_review`).flush({ count: 0 });
    http.expectOne(list('approved')).flush({ items: [], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No payouts to record');
  });

  it('All statuses sends no status param', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush({ items: [], nextCursor: null });
    await flushAsync();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    http.expectOne(`${API}/refunds/count?status=pending_review`).flush({ count: 0 });
    const req = http.expectOne(list());
    expect(req.request.params.has('status')).toBe(false);
    req.flush({ items: [], nextCursor: null });
  });

  it('Load more appends the next page', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush({ items: [item('1')], nextCursor: 'c1' });
    await flushAsync();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1+ to review');
    const more = fixture.nativeElement.querySelector('.pagination button') as HTMLButtonElement;
    more.click();
    const req = http.expectOne(list('pending_review'));
    expect(req.request.params.get('cursor')).toBe('c1');
    req.flush({ items: [item('2')], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.pagination')).toBeNull();
  });

  it('shows a load error with Try again', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush(null, { status: 500, statusText: 'x' });
    await flushAsync();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load refund reviews.");
  });

  it('a row opens the refund drawer; a save patches the row in place', async () => {
    const fixture = await render();
    http.expectOne(list('pending_review')).flush({ items: [item('1')], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('tr.clickable') as HTMLElement).click();
    expect(TestBed.inject(DrawerNavService).current()).toEqual({ kind: 'refund', id: '1' });
    const s = TestBed.inject(AdminDataService);
    s.lastRefundUpdate.set({ ...item('1'), status: 'approved', refundAmount: '500.00' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Payout due');
    expect(fixture.nativeElement.textContent).toContain('KSh 500');
  });
});

describe('refund badge (N-7)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  it('reads GET /refunds/count and caps at 99+', async () => {
    const s = TestBed.inject(AdminDataService);
    const p = s.refreshRefundBadge();
    http.expectOne(`${API}/refunds/count?status=pending_review`).flush({ count: 140 });
    await p;
    expect(s.refundBadge()).toEqual({ count: 99, more: true });
  });

  it('keeps the last badge on an error, with no list fallback', async () => {
    const s = TestBed.inject(AdminDataService);
    s.refundBadge.set({ count: 4, more: false });
    const p = s.refreshRefundBadge();
    http
      .expectOne(`${API}/refunds/count?status=pending_review`)
      .flush({ statusCode: 404 }, { status: 404, statusText: 'Not Found' });
    await p;
    expect(s.refundBadge()).toEqual({ count: 4, more: false });
  });
});
