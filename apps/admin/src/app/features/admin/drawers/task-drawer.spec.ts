import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import { historyActor, TaskDrawerComponent, taskActions } from './task-drawer';

describe('task drawer admin actions (G-16, §3.3)', () => {
  it('offers Assign runner only at PAYMENT_CONFIRMED', () => {
    expect(taskActions('PAYMENT_CONFIRMED').assign).toBe(true);
    for (const s of ['REQUESTED', 'QUOTED', 'ACCEPTED', 'RUNNER_ASSIGNED', 'DISPUTED']) {
      expect(taskActions(s).assign).toBe(false);
    }
  });

  it('offers the first Issue quote only at REQUESTED', () => {
    expect(taskActions('REQUESTED').quote).toBe(true);
    expect(taskActions('QUOTED').quote).toBe(false);
  });
});

describe('status history actor (drawer-task-offer, row 187)', () => {
  const base = {
    id: 'h1',
    errandId: 'e1',
    fromStatus: 'RUNNER_ASSIGNED',
    toStatus: 'EXPIRED',
    createdAt: '2026-10-19T09:00:00Z',
  };

  it('names the admin when the API gives a display name', () => {
    expect(
      historyActor({
        ...base,
        actorType: 'admin',
        actor: { id: 'u1', displayName: 'Wanjiru K.' },
      }),
    ).toBe('Admin · Wanjiru K.');
  });

  it('falls back to the actor type as built', () => {
    expect(historyActor({ ...base, actorType: 'admin', actor: null })).toBe('Admin');
    expect(historyActor({ ...base, actorType: 'admin' })).toBe('Admin');
    expect(historyActor({ ...base, actorType: 'system', actor: null })).toBe('System');
  });

  it('names only admins', () => {
    expect(
      historyActor({ ...base, actorType: 'runner', actor: { id: 'u2', displayName: 'Kevin O.' } }),
    ).toBe('Runner');
  });
});

describe('TaskDrawerComponent assign dialog (rows 215, 228)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });

  const ID = errandFixture().id;
  const offline = {
    runnerProfileId: 'rrrrrrrr-0000-0000-0000-00000000bbbb',
    displayName: 'Achieng',
    rating: '4.80',
    tasksCompleted: 12,
    availability: 'offline',
    offline: true,
    tried: null,
    ineligibleReason: null,
    distanceKm: null,
    purchaseLimit: '3000.00',
  };

  async function openAssign() {
    const fixture = TestBed.createComponent(TaskDrawerComponent);
    fixture.componentRef.setInput('errandId', ID);
    fixture.detectChanges();
    http.expectOne(`${API}/errands/${ID}`).flush(errandFixture({ status: 'PAYMENT_CONFIRMED' }));
    http.expectOne(`${API}/errands/${ID}/history`).flush([]);
    await flushAsync();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const assign = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Assign runner',
    ) as HTMLButtonElement;
    assign.click();
    fixture.detectChanges();
    return { fixture, el };
  }

  it('lists runners from the candidates read and assigns an offline runner', async () => {
    const { fixture, el } = await openAssign();
    const req = http.expectOne((r) => r.url === `${API}/errands/${ID}/candidates`);
    expect(req.request.params.get('limit')).toBe('100');
    req.flush({
      items: [offline],
      nextCursor: null,
      eligibleRemaining: 0,
      offlineCount: 1,
      triedCount: 0,
      requiredPurchase: '0.00',
    });
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain('No eligible runners are available right now.');
    const confirm = Array.from(
      el.querySelectorAll<HTMLButtonElement>('.confirm-actions button'),
    )[1];
    expect(confirm.disabled).toBe(true);
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Show offline runners'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (el.querySelector('input[type="radio"]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    const assign = http.expectOne(`${API}/errands/${ID}/assign`);
    expect(assign.request.body).toEqual({ runnerProfileId: offline.runnerProfileId });
    http.match(() => true);
  });

  it('offers Try again when the runner list fails to load', async () => {
    const { fixture, el } = await openAssign();
    http
      .expectOne((r) => r.url === `${API}/errands/${ID}/candidates`)
      .flush({ statusCode: 500 }, { status: 500, statusText: 'Error' });
    await flushAsync();
    fixture.detectChanges();
    expect(el.textContent).toContain("Couldn't load runners. Try again.");
    (
      Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Try again',
      ) as HTMLButtonElement
    ).click();
    expect(http.match((r) => r.url === `${API}/errands/${ID}/candidates`)).toHaveLength(1);
    http.match(() => true);
  });
});
