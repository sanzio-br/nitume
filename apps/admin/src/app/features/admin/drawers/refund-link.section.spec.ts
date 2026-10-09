import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import { refundLinkApplies, RefundLinkSectionComponent } from './refund-link.section';
import { DrawerNavService } from '../drawer-nav.service';
import type { ErrandRefundView } from '../../../core/api-types';

const ID = errandFixture().id;

function view(id: string, patch: Partial<ErrandRefundView> = {}): ErrandRefundView {
  return {
    id,
    errandId: ID,
    trigger: 'price_change_decrease',
    status: 'pending_review',
    amountPaid: '300.00',
    refundAmount: null,
    createdAt: '2026-10-08T06:00:00Z',
    ...patch,
  };
}

describe('refund link states (SA-2)', () => {
  it('applies from PAYMENT_CONFIRMED on, never before payment', () => {
    for (const s of ['DRAFT', 'REQUESTED', 'QUOTED', 'ACCEPTED']) {
      expect(refundLinkApplies(s)).toBe(false);
    }
    for (const s of [
      'PAYMENT_CONFIRMED',
      'RUNNER_ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
      'SETTLED',
      'CANCELLED',
      'FAILED',
      'DISPUTED',
      'EXPIRED',
    ]) {
      expect(refundLinkApplies(s)).toBe(true);
    }
  });
});

describe('RefundLinkSectionComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  function create(status: string) {
    const fixture = TestBed.createComponent(RefundLinkSectionComponent);
    fixture.componentRef.setInput('errandId', ID);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  it('lists every review of an in-progress task from GET /errands/:id/refunds', async () => {
    const fixture = create('IN_PROGRESS');
    http
      .expectOne(`${API}/errands/${ID}/refunds`)
      .flush({ items: [view('r2'), view('r1', { status: 'refunded', refundAmount: '300.00' })] });
    await flushAsync();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Refund');
    expect(el.textContent).toContain('Price decrease');
    const open = Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Open refund review',
    );
    expect(open).toHaveLength(2);
    const nav = TestBed.inject(DrawerNavService);
    const spy = vi.spyOn(nav, 'open');
    open[0].click();
    expect(spy).toHaveBeenCalledWith('refund', 'r2');
  });

  it('stays hidden with no reviews, and never calls the single /refund endpoint', async () => {
    const fixture = create('CANCELLED');
    http.expectOne(`${API}/errands/${ID}/refunds`).flush({ items: [] });
    await flushAsync();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.drawer-section')).toBeNull();
    http.expectNone(`${API}/errands/${ID}/refund`);
  });

  it('makes no call before payment', () => {
    create('QUOTED');
    http.expectNone(`${API}/errands/${ID}/refunds`);
  });

  it('stays hidden when the request fails', async () => {
    const fixture = create('DISPUTED');
    http
      .expectOne(`${API}/errands/${ID}/refunds`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await flushAsync();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.drawer-section')).toBeNull();
  });
});
