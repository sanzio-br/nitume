import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from '../../core/auth/auth.service';
import { API, flushAsync, setupHttp } from '../../testing/admin-test-utils';
import { AdminDataService } from './admin-data.service';
import { AdminDashboardComponent } from './admin-dashboard.component';

describe('AdminDashboardComponent sidebar (row 77)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { logout: () => undefined } }],
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
    expect(g[2].items).toEqual(['Refunds 99+']);
    expect(TestBed.inject(AdminDataService).refundBadge()).toEqual({ count: 99, more: true });
  });
});
