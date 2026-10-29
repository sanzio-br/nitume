import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, errandFixture, flushAsync, setupHttp } from '../../../testing/admin-test-utils';
import type { ErrandStatusString } from '../../../core/api-types';
import { deadlineRow, TaskDrawerComponent, taskActions } from './task-drawer';

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

describe('Deadline row (drawer-task-offer Layout 2, rows 239, 243)', () => {
  it('shows the chosen time in any state', () => {
    for (const st of ['REQUESTED', 'PAYMENT_CONFIRMED', 'CANCELLED']) {
      expect(deadlineRow(st, '2026-10-20T09:00:00Z')).toEqual({ at: '2026-10-20T09:00:00Z' });
    }
  });

  it('reads No deadline yet before payment when deadlineAt is null', () => {
    for (const st of ['DRAFT', 'REQUESTED', 'QUOTED', 'ACCEPTED']) {
      expect(deadlineRow(st, null)).toEqual({ at: null, text: 'No deadline yet' });
      expect(deadlineRow(st, undefined)).toEqual({ at: null, text: 'No deadline yet' });
    }
  });

  it('hides the row for a CANCELLED task without a deadline', () => {
    expect(deadlineRow('CANCELLED', null)).toBeNull();
  });

  it('keeps the built dash for any other state without one', () => {
    expect(deadlineRow('PAYMENT_CONFIRMED', null)).toEqual({ at: null, text: '—' });
  });

  describe('rendered', () => {
    let http: HttpTestingController;
    beforeEach(() => {
      http = setupHttp();
    });
    const ID = errandFixture().id;

    async function render(status: ErrandStatusString, deadlineAt: string | null) {
      const fixture = TestBed.createComponent(TaskDrawerComponent);
      fixture.componentRef.setInput('errandId', ID);
      fixture.detectChanges();
      http.expectOne(`${API}/errands/${ID}`).flush(errandFixture({ status, deadlineAt }));
      http.expectOne(`${API}/errands/${ID}/history`).flush([]);
      await flushAsync();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const row = Array.from(el.querySelectorAll('.drawer-row')).find(
        (r) => r.querySelector('span')?.textContent?.trim() === 'Deadline',
      );
      http.match(() => true);
      return { el, row };
    }

    it('shows No deadline yet in Fira Sans (b.txt) on a REQUESTED task', async () => {
      const { row } = await render('REQUESTED', null);
      const value = row?.querySelector('b');
      expect(value?.textContent?.trim()).toBe('No deadline yet');
      expect(value?.classList.contains('txt')).toBe(true);
    });

    it('shows the time in Fira Code (b without .txt) when set', async () => {
      const { row } = await render('PAYMENT_CONFIRMED', '2026-10-20T09:00:00Z');
      const value = row?.querySelector('b');
      expect(value?.classList.contains('txt')).toBe(false);
      expect(value?.textContent).toContain('12:00 PM');
    });

    it('shows no Deadline row on a CANCELLED task without one', async () => {
      const { row } = await render('CANCELLED', null);
      expect(row).toBeUndefined();
    });

    it('offers no way to edit the deadline (row 243)', async () => {
      const { row } = await render('REQUESTED', null);
      expect(row?.querySelector('input, button, a')).toBeNull();
    });
  });
});
