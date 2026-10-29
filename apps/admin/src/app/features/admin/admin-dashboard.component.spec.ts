import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/auth/auth.store';
import { API, flushAsync, setupHttp } from '../../testing/admin-test-utils';
import { AdminDataService } from './admin-data.service';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { DrawerNavService } from './drawer-nav.service';

describe('AdminDashboardComponent sidebar (row 77)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { logout: () => undefined } },
        { provide: AuthStore, useValue: { userId: signal('admin-1') } },
      ],
    });
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${API}/errands`).flush({ items: [], nextCursor: null });
    http.expectOne((r) => r.url === `${API}/runners`).flush({ items: [], nextCursor: null });
    http.expectOne(`${API}/users/me`).flush({ id: 'admin-1', firstName: 'Wanjiru' });
    await flushAsync();
    http.expectOne(`${API}/refunds/count?status=pending_review`).flush({ count: 120 });
    http.expectOne(`${API}/runner-payouts/count?status=on_hold`).flush({ count: 4 });
    http
      .expectOne(`${API}/errands?status=QUOTED,ACCEPTED&quoteRequested=true&limit=100`)
      .flush({ items: [], nextCursor: null });
    http
      .expectOne(`${API}/errands/count?status=QUOTED,ACCEPTED&quoteRequested=true`)
      .flush({ count: 0 });
    await flushAsync();
    fixture.detectChanges();
    return fixture;
  }

  function groups(el: HTMLElement): { label: string; items: string[] }[] {
    return [...el.querySelectorAll('.ops-nav-group')].map((g) => ({
      label: g.querySelector('.ops-nav-label')?.textContent?.trim() ?? '',
      items: [...g.querySelectorAll('.ops-nav-item')].map((b) =>
        (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    }));
  }

  it('puts Refunds in its own Payments group, after Network, with the badge', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const g = groups(el);
    expect(g.map((x) => x.label)).toEqual(['Monitor', 'Network', 'Payments', 'Insights']);
    expect(g[1].items.some((i) => i.startsWith('Refunds'))).toBe(false);
    // Row 112: Runner payouts under Refunds, with the on_hold badge.
    expect(g[2].items).toEqual(['Refunds 99+', 'Runner payouts 4']);
    expect(TestBed.inject(AdminDataService).refundBadge()).toEqual({ count: 99, more: true });
  });

  it('View payouts on a runner opens Runner payouts filtered to that runner', async () => {
    const fixture = await render();
    const nav = TestBed.inject(DrawerNavService);
    nav.open('runner', 'rrrrrrrr-0000-0000-0000-00000000ab12');
    nav.runnerPayoutsFor.set('rrrrrrrr-0000-0000-0000-00000000ab12');
    fixture.detectChanges();
    await fixture.whenStable();
    await flushAsync();
    fixture.detectChanges();
    expect(nav.current()).toBeNull();
    http.match(`${API}/runner-payouts/count?status=on_hold`).forEach((r) => r.flush({ count: 4 }));
    const req = http.expectOne((r) => r.url === `${API}/runner-payouts`);
    expect(req.request.params.get('runnerProfileId')).toBe('rrrrrrrr-0000-0000-0000-00000000ab12');
    req.flush({ items: [], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    const active = (fixture.nativeElement as HTMLElement).querySelector('.ops-nav-item.active');
    expect(active?.textContent).toContain('Runner payouts');
  });

  it('opens the Customer drawer (SQ-3) titled Customer, by user id', async () => {
    const fixture = await render();
    const nav = TestBed.inject(DrawerNavService);
    const id = 'cccccccc-1111-4222-8333-00000000a1b2';
    nav.open('customer', id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.drawer-head h3')?.textContent?.trim()).toBe('Customer');
    http.expectOne(`${API}/admin/users/${id}`).flush({
      id,
      role: 'customer',
      status: 'active',
      displayName: 'Amina Wanjiru',
      phone: '+254712345678',
    });
    http
      .expectOne((r) => r.url === `${API}/admin/users/${id}/status-history`)
      .flush({ items: [], nextCursor: null });
    await flushAsync();
    fixture.detectChanges();
    expect(el.querySelector('app-customer-drawer')?.textContent).toContain('Amina Wanjiru');
  });
});
