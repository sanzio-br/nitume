import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { setupHttp } from '../../../testing/admin-test-utils';
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
