import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import {
  RunnerPayoutsLinkSectionComponent,
  runnerPayoutsLinkApplies,
} from './runner-payouts-link.section';
import { DrawerNavService } from '../drawer-nav.service';

const ERRAND = 'eeeeeeee-0000-0000-0000-000000010482';

describe('task drawer Runner payouts section (SA-3)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function render(status: string) {
    const fixture = TestBed.createComponent(RunnerPayoutsLinkSectionComponent);
    fixture.componentRef.setInput('errandId', ERRAND);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  it('applies from CONFIRMED on and to CANCELLED / FAILED tasks', () => {
    for (const s of ['CONFIRMED', 'SETTLED', 'CANCELLED', 'FAILED']) {
      expect(runnerPayoutsLinkApplies(s)).toBe(true);
    }
    for (const s of ['PAYMENT_CONFIRMED', 'COMPLETED', 'DISPUTED', 'EXPIRED']) {
      expect(runnerPayoutsLinkApplies(s)).toBe(false);
    }
  });

  it('lists the lines with amount and chip; a row opens the drawer', async () => {
    const fixture = await render('CONFIRMED');
    const req = http.expectOne((r) => r.url === `${API}/runner-payouts`);
    expect(req.request.params.get('errandId')).toBe(ERRAND);
    req.flush({
      items: [
        {
          id: 'l1',
          kind: 'runner_fee',
          amount: '350.00',
          requestedAmount: '350.00',
          effectiveStatus: 'payable',
          effectivePayout: null,
        },
      ],
      nextCursor: null,
    });
    await flushAsync();
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector('.drawer-row') as HTMLElement;
    expect(row.textContent).toContain('Runner fee');
    expect(row.textContent).toContain('Payout due');
    expect(row.querySelector('b')?.textContent).toBe('KSh 350');
    row.click();
    expect(TestBed.inject(DrawerNavService).current()).toEqual({
      kind: 'runner_payout',
      id: 'l1',
    });
  });

  it('is hidden without lines and makes no call before CONFIRMED', async () => {
    const fixture = await render('IN_PROGRESS');
    http.expectNone((r) => r.url === `${API}/runner-payouts`);
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });
});
