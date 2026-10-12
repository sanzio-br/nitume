import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { API, setupHttp } from '../../../testing/admin-test-utils';
import type { ErrandListItem } from '../../../core/api-types';
import { AdminDataService } from '../admin-data.service';
import { queueRank, TaskQueuePanelComponent } from './task-queue.panel';

const NOW = new Date('2026-10-08T09:00:00Z').getTime();

function row(id: string, patch: Partial<ErrandListItem> = {}): ErrandListItem {
  return {
    id: `eeeeeeee-0000-0000-0000-0000000${id.padStart(5, '0')}`,
    category: 'buy_for_me',
    description: `Task ${id}`,
    status: 'QUOTED',
    budget: '2000.00',
    createdAt: '2026-10-08T06:00:00Z',
    quoteRequestedAt: null,
    ...patch,
  };
}

describe('task queue quote flags (rows 68, N-5)', () => {
  it('ranks a customer request above an expired quote', () => {
    const expired = row('1', { quoteExpiresAt: '2026-10-08T08:00:00Z' });
    const requested = row('2', {
      status: 'ACCEPTED',
      quoteExpiresAt: '2026-10-08T08:00:00Z',
      quoteRequestedAt: '2026-10-08T08:30:00Z',
    });
    expect(queueRank(requested, NOW)).toBe(2);
    expect(queueRank(expired, NOW)).toBe(1);
    expect(queueRank(row('3', { quoteExpiresAt: '2099-01-01T00:00:00Z' }), NOW)).toBe(0);
    // A request on a task that moved on no longer counts.
    expect(queueRank(row('4', { status: 'CANCELLED', quoteRequestedAt: 'x' }), NOW)).toBe(0);
  });
});

describe('TaskQueuePanelComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  it('flags and sorts requested tasks first and counts them in the badge', () => {
    const s = TestBed.inject(AdminDataService);
    s.errands.set([
      row('1', { status: 'PAYMENT_CONFIRMED' }),
      row('2', { status: 'ACCEPTED', quoteRequestedAt: '2026-10-08T08:30:00Z' }),
      row('3', { status: 'ACCEPTED' }),
    ]);
    const fixture = TestBed.createComponent(TaskQueuePanelComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const first = el.querySelector('tbody tr') as HTMLElement;
    expect(first.textContent).toContain('Task 2');
    expect(first.textContent).toContain('New quote requested');
    expect(el.textContent).not.toContain('Quote expired');
    // ACCEPTED counts only with a pending request.
    expect(s.pendingCount()).toBe(1);
  });
});

describe('quote requests beyond the loaded window (m-8)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp();
  });
  afterEach(() => http.verify());

  async function load(requested: ErrandListItem[], count: number | null) {
    const s = TestBed.inject(AdminDataService);
    s.errands.set([
      row('1', { status: 'REQUESTED' }),
      row('2', { status: 'QUOTED' }),
      row('3', { status: 'ACCEPTED', quoteRequestedAt: '2026-10-08T08:30:00Z' }),
    ]);
    const p = s.refreshQuoteRequests();
    const list = http.expectOne((r) => r.url === `${API}/errands`);
    expect(list.request.params.get('quoteRequested')).toBe('true');
    expect(list.request.params.get('status')).toBe('QUOTED,ACCEPTED');
    expect(list.request.params.get('limit')).toBe('100');
    list.flush({ items: requested, nextCursor: null });
    const c = http.expectOne((r) => r.url === `${API}/errands/count`);
    expect(c.request.params.get('quoteRequested')).toBe('true');
    if (count === null) c.flush(null, { status: 500, statusText: 'x' });
    else c.flush({ count });
    await p;
    return s;
  }

  it('merges requested tasks into the queue, deduped by id', async () => {
    const old = row('9', { status: 'QUOTED', quoteRequestedAt: '2026-10-08T08:40:00Z' });
    const dup = row('3', { status: 'ACCEPTED', quoteRequestedAt: '2026-10-08T08:30:00Z' });
    const s = await load([old, dup], 2);
    expect(s.queueTasks().map((e) => e.description)).toEqual([
      'Task 1',
      'Task 2',
      'Task 3',
      'Task 9',
    ]);
    // KPIs keep the newest-100 window.
    expect(s.tasks()).toHaveLength(3);
    const fixture = TestBed.createComponent(TaskQueuePanelComponent);
    fixture.detectChanges();
    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
      (tr) => tr.textContent ?? '',
    );
    expect(rows).toHaveLength(4);
    expect(rows.slice(0, 2).every((t) => t.includes('New quote requested'))).toBe(true);
  });

  it('takes the requested part of the badge from the count endpoint', async () => {
    const s = await load([], 7);
    // REQUESTED + QUOTED (not requested) from the window, 7 requested from the API.
    expect(s.pendingCount()).toBe(9);
  });

  it('falls back to the queue rows when the count fails', async () => {
    const s = await load([], null);
    expect(s.requestedCount()).toBeNull();
    expect(s.pendingCount()).toBe(3);
  });

  it('drops an answered request from the badge right away', async () => {
    const s = await load([], 4);
    s.patchErrand(row('3').id, { quoteRequestedAt: null });
    expect(s.requestedCount()).toBe(3);
    s.patchErrand(row('3').id, { quoteRequestedAt: null });
    expect(s.requestedCount()).toBe(3);
  });
});
