import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import type { HttpRequest } from '@angular/common/http';
import {
  API,
  errandFixture,
  flushAsync,
  httpError,
  setupHttpWithAuth,
} from '../../../testing/admin-test-utils';
import type { AdminUserSummary, RefundDetail } from '../../../core/api-types';
import { DrawerNavService } from '../drawer-nav.service';
import { CustomerDrawerComponent } from './customer-drawer';
import { CustomerLinkComponent } from './customer-link';
import { RefundDrawerComponent } from './refund-drawer';
import { TaskDrawerComponent } from './task-drawer';

const CUSTOMER = 'cccccccc-1111-4222-8333-00000000a1b2';

function summary(patch: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: CUSTOMER,
    role: 'customer',
    status: 'active',
    displayName: 'Amina Wanjiru',
    phone: '+254712345678',
    ...patch,
  };
}

const isUser = (r: HttpRequest<unknown>) => r.url === `${API}/admin/users/${CUSTOMER}`;
const isHistory = (r: HttpRequest<unknown>) =>
  r.url === `${API}/admin/users/${CUSTOMER}/status-history`;

describe('CustomerDrawerComponent (drawer-user-status §2, SQ-3, §13.12)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttpWithAuth();
  });
  afterEach(() => http.verify());

  async function render(user: AdminUserSummary = summary()) {
    const f = TestBed.createComponent(CustomerDrawerComponent);
    f.componentRef.setInput('userId', CUSTOMER);
    f.detectChanges();
    http.expectOne(isUser).flush(user);
    http.expectOne(isHistory).flush({ items: [], nextCursor: null });
    await flushAsync();
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  const row = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll('.drawer-row')).find(
      (r) => r.querySelector('span')?.textContent?.trim() === label,
    ) as HTMLElement;

  it('shows the name (Fira Sans) and the phone (Fira Code) from U-1', async () => {
    const el = await render();
    expect(row(el, 'Customer').querySelector('b.txt')?.textContent?.trim()).toBe('Amina Wanjiru');
    const phone = row(el, 'Phone').querySelector('b') as HTMLElement;
    expect(phone.textContent?.trim()).toBe('+254 712 345 678');
    expect(phone.classList).not.toContain('txt');
  });

  it('falls back to the masked id when the name is null', async () => {
    const el = await render(summary({ displayName: null }));
    expect(row(el, 'Customer').querySelector('b')?.textContent?.trim()).toBe('…a1b2');
  });

  it('renders the same Account section with customer copy', async () => {
    const el = await render(summary({ status: 'suspended' }));
    const labels = Array.from(el.querySelectorAll('.drawer-actions button')).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(['Reactivate customer', 'Ban customer']);
    expect(el.querySelector('app-user-status-section .chip')?.textContent?.trim()).toBe(
      'Suspended',
    );
    expect(el.textContent).toContain('Status history');
  });

  it('hides the header when the account is not found', async () => {
    const f = TestBed.createComponent(CustomerDrawerComponent);
    f.componentRef.setInput('userId', CUSTOMER);
    f.detectChanges();
    const body = { statusCode: 404, code: 'user_not_found' };
    http.expectOne(isUser).flush(body, httpError(404, body));
    http.expectOne(isHistory).flush(body, httpError(404, body));
    await flushAsync();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain("We couldn't find this account.");
    expect(el.textContent).not.toContain('Phone');
  });
});

describe('Open customer links (SQ-3)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttpWithAuth();
  });
  afterEach(() => http.verify());

  const openCustomer = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Open customer',
    ) as HTMLButtonElement | undefined;

  it('the refund drawer opens the customer drawer with customer.userId', async () => {
    const RID = 'rrrrrrrr-0000-0000-0000-000000000001';
    const nav = TestBed.inject(DrawerNavService);
    const f = TestBed.createComponent(RefundDrawerComponent);
    f.componentRef.setInput('reviewId', RID);
    f.detectChanges();
    http.expectOne(`${API}/refunds/${RID}`).flush({
      id: RID,
      errandId: errandFixture().id,
      trigger: 'cancelled_after_payment',
      amountPaid: '1200.00',
      refundAmount: '0.00',
      status: 'no_refund',
      createdAt: '2026-10-08T06:00:00Z',
      refundCeiling: null,
      alreadyRefunded: '0.00',
      remainingRefundable: '0.00',
      totalPaidToNitume: '1200.00',
      errand: null,
      customer: {
        userId: CUSTOMER,
        displayName: 'Amina Wanjiru',
        shortName: 'Amina W.',
        phone: null,
        mpesaPhone: null,
      },
      paid: {
        serviceAndRunnerFee: '1200.00',
        itemAmountToNitume: '0.00',
        priceChangeDifferences: '0.00',
        totalPaidToNitume: '1200.00',
        merchantDirectAmount: '0.00',
      },
      otherReviews: [],
      corrections: [],
      correctionCeiling: null,
    } as unknown as RefundDetail);
    await flushAsync();
    f.detectChanges();
    // The link is a @defer chunk: wait for it, not a fixed number of ticks.
    await f.whenStable();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Amina W.');
    const link = openCustomer(el)!;
    expect(link.className).toContain('btn-text');
    link.click();
    expect(nav.current()).toEqual({ kind: 'customer', id: CUSTOMER });
  });

  it('the refund drawer has no link without a customer', async () => {
    const RID = 'rrrrrrrr-0000-0000-0000-000000000002';
    const f = TestBed.createComponent(RefundDrawerComponent);
    f.componentRef.setInput('reviewId', RID);
    f.detectChanges();
    http.expectOne(`${API}/refunds/${RID}`).flush({
      id: RID,
      errandId: errandFixture().id,
      trigger: 'cancelled_after_payment',
      amountPaid: '1200.00',
      refundAmount: '0.00',
      status: 'no_refund',
      createdAt: '2026-10-08T06:00:00Z',
      errand: null,
      customer: null,
      paid: {
        serviceAndRunnerFee: '1200.00',
        itemAmountToNitume: '0.00',
        priceChangeDifferences: '0.00',
        totalPaidToNitume: '1200.00',
        merchantDirectAmount: '0.00',
      },
      otherReviews: [],
      corrections: [],
    });
    await flushAsync();
    f.detectChanges();
    expect(openCustomer(f.nativeElement)).toBeUndefined();
  });

  async function taskDrawer(customerUserId: string | null | undefined) {
    const e = errandFixture({ status: 'REQUESTED', customerUserId });
    const f = TestBed.createComponent(TaskDrawerComponent);
    f.componentRef.setInput('errandId', e.id);
    f.detectChanges();
    http.expectOne(`${API}/errands/${e.id}`).flush(e);
    http.expectOne(`${API}/errands/${e.id}/history`).flush([]);
    await flushAsync();
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('the task drawer opens the customer drawer with errand.customerUserId (U-2)', async () => {
    const nav = TestBed.inject(DrawerNavService);
    const el = await taskDrawer(CUSTOMER);
    openCustomer(el)!.click();
    expect(nav.current()).toEqual({ kind: 'customer', id: CUSTOMER });
  });

  it('the task drawer has no link without customerUserId', async () => {
    const el = await taskDrawer(null);
    expect(openCustomer(el)).toBeUndefined();
    expect(el.textContent).toContain('…a1b2');
  });
});

describe('lazy Open customer link (budget, SQ-3)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttpWithAuth();
  });
  afterEach(() => http.verify());

  it('CustomerLinkComponent opens the Customer drawer by user id', () => {
    const nav = TestBed.inject(DrawerNavService);
    const f = TestBed.createComponent(CustomerLinkComponent);
    f.componentRef.setInput('userId', CUSTOMER);
    f.detectChanges();
    const button = (f.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Open customer');
    expect(button.className).toBe('btn btn-text btn-sm');
    expect(button.getAttribute('type')).toBe('button');
    button.click();
    expect(nav.current()).toEqual({ kind: 'customer', id: CUSTOMER });
  });

  it('the task drawer mounts the deferred link and it opens the Customer drawer', async () => {
    const nav = TestBed.inject(DrawerNavService);
    const e = errandFixture({ status: 'REQUESTED', customerUserId: CUSTOMER });
    const f = TestBed.createComponent(TaskDrawerComponent);
    f.componentRef.setInput('errandId', e.id);
    f.detectChanges();
    http.expectOne(`${API}/errands/${e.id}`).flush(e);
    http.expectOne(`${API}/errands/${e.id}/history`).flush([]);
    await flushAsync();
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const link = (f.nativeElement as HTMLElement).querySelector(
      'app-customer-link button',
    ) as HTMLButtonElement;
    expect(link.textContent?.trim()).toBe('Open customer');
    link.click();
    expect(nav.current()).toEqual({ kind: 'customer', id: CUSTOMER });
  });
});
