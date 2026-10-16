import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  DisputeEventType,
  DisputeStatus,
  ErrandStatus,
  StatusHistoryActor,
  UserRole,
} from '../common/enums';
import { DisputeEvent } from './dispute-event.entity';
import { Dispute } from './dispute.entity';
import { DisputesService, toDisputeView } from './disputes.service';

const customer = { userId: 'u-1', role: UserRole.CUSTOMER };

const fakeManager = () => {
  const saved: { dispute?: Partial<Dispute>; event?: Partial<DisputeEvent> } = {};
  const repoFor = (entity: unknown) => ({
    create: (row: object) => row,
    save: (row: object) => {
      if (entity === Dispute) {
        saved.dispute = { id: 'd-1', ...row };
        return Promise.resolve(saved.dispute);
      }
      saved.event = { id: 'ev-1', ...row };
      return Promise.resolve(saved.event);
    },
  });
  return { manager: { getRepository: repoFor }, saved };
};

const build = (opts: { existing?: Dispute | null } = {}) => {
  const { manager, saved } = fakeManager();
  const errands = {
    transitionWith: vi.fn(
      async (
        _id: string,
        _to: ErrandStatus,
        _actor: unknown,
        _note: string,
        _subject: unknown,
        within: (m: unknown, r: unknown) => Promise<unknown>,
      ) => ({ extra: await within(manager, {}) }),
    ),
    getById: vi.fn(() => Promise.resolve({ id: 'e-1' })),
  };
  const disputes = { findOne: vi.fn(() => Promise.resolve(opts.existing ?? null)) };
  const events = { find: vi.fn(() => Promise.resolve([{ id: 'ev-1', eventType: DisputeEventType.OPENED }])) };
  const service = new DisputesService(disputes as never, events as never, errands as never);
  return { service, errands, disputes, events, saved };
};

describe('DisputesService.open (A-9)', () => {
  it('moves the errand to DISPUTED as the customer and writes dispute + opened event', async () => {
    const { service, errands, saved } = build();

    const view = await service.open({ errandId: 'e-1', reason: '  Wrong item bought ' }, customer);

    expect(errands.transitionWith).toHaveBeenCalledWith(
      'e-1',
      ErrandStatus.DISPUTED,
      { type: StatusHistoryActor.CUSTOMER, id: 'u-1' },
      'Dispute opened: Wrong item bought',
      { role: UserRole.CUSTOMER, userId: 'u-1' },
      expect.any(Function),
    );
    expect(saved.dispute).toMatchObject({
      errandId: 'e-1',
      openedBy: 'u-1',
      reason: 'Wrong item bought',
      status: DisputeStatus.OPEN,
    });
    expect(saved.event).toMatchObject({
      disputeId: 'd-1',
      eventType: DisputeEventType.OPENED,
      payload: { reason: 'Wrong item bought' },
    });
    expect(view.id).toBe('d-1');
    expect(view.events).toHaveLength(1);
  });

  it('409s when the errand already has a dispute', async () => {
    const { service, errands } = build({ existing: { id: 'd-0' } as Dispute });
    await expect(
      service.open({ errandId: 'e-1', reason: 'Again please' }, customer),
    ).rejects.toMatchObject({ status: 409, code: 'dispute_already_exists' });
    expect(errands.transitionWith).not.toHaveBeenCalled();
  });
});

describe('DisputesService.get (A-9)', () => {
  it('returns the dispute with its events after the errand access check', async () => {
    const { service, disputes, errands, events } = build();
    disputes.findOne.mockResolvedValueOnce({ id: 'd-1', errandId: 'e-1' } as Dispute);

    const view = await service.get('d-1', customer);

    expect(errands.getById).toHaveBeenCalledWith('e-1', customer);
    expect(events.find).toHaveBeenCalledWith({
      where: { disputeId: 'd-1' },
      order: { createdAt: 'ASC' },
    });
    expect(view.events).toEqual([{ id: 'ev-1', eventType: DisputeEventType.OPENED }]);
  });

  it('404s for an unknown dispute', async () => {
    const { service } = build();
    await expect(service.get('nope', customer)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates 403 for viewers without errand access', async () => {
    const { service, disputes, errands } = build();
    disputes.findOne.mockResolvedValueOnce({ id: 'd-1', errandId: 'e-1' } as Dispute);
    errands.getById.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.get('d-1', customer)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('DisputesService.getForErrand', () => {
  it('returns the errand dispute with events after the access check', async () => {
    const { service, errands, disputes } = build({ existing: { id: 'd-1', errandId: 'e-1' } as never });
    const view = await service.getForErrand('e-1', customer);
    expect(errands.getById).toHaveBeenCalledWith('e-1', customer);
    expect(disputes.findOne).toHaveBeenCalledWith({ where: { errandId: 'e-1' } });
    expect(view.events).toEqual([{ id: 'ev-1', eventType: DisputeEventType.OPENED }]);
  });

  it('404s when the errand has no dispute', async () => {
    const { service } = build();
    await expect(service.getForErrand('e-1', customer)).rejects.toThrow('No dispute for this task');
  });
});

describe('DisputesService.closeWithin (N-6)', () => {
  const resolution = {
    errandId: 'e-1',
    verdict: 'customer_favourable' as const,
    rationale: 'Runner bought the wrong item; customer refunded.',
    adminUserId: 'admin-1',
  };

  const managerWith = (row: Partial<Dispute> | null) => {
    const writes: { dispute?: Partial<Dispute>; event?: Partial<DisputeEvent> } = {};
    const manager = {
      getRepository: (entity: unknown) => ({
        findOne: vi.fn(() => Promise.resolve(row)),
        create: (r: object) => r,
        save: (r: object) => {
          if (entity === Dispute) {
            writes.dispute = r;
          } else {
            writes.event = r;
          }
          return Promise.resolve(r);
        },
      }),
    };
    return { manager, writes };
  };

  it('registers itself on the errands resolve-dispute hook', () => {
    const errands = { onDisputeResolved: vi.fn() };
    const service = new DisputesService({} as never, {} as never, errands as never);
    service.onModuleInit();
    expect(errands.onDisputeResolved).toHaveBeenCalledWith(expect.any(Function));
  });

  it('sets status, resolution and resolvedBy and appends a resolved event', async () => {
    const { service } = build();
    const { manager, writes } = managerWith({ id: 'd-1', errandId: 'e-1', status: DisputeStatus.OPEN });
    await service.closeWithin(manager as never, resolution);
    expect(writes.dispute).toMatchObject({
      status: DisputeStatus.RESOLVED,
      resolution: resolution.rationale,
      resolvedBy: 'admin-1',
    });
    expect(writes.event).toMatchObject({
      disputeId: 'd-1',
      actorId: 'admin-1',
      eventType: DisputeEventType.RESOLVED,
      payload: { verdict: 'customer_favourable', resolution: resolution.rationale },
    });
  });

  it('does nothing when the errand has no dispute row', async () => {
    const { service } = build();
    const { manager, writes } = managerWith(null);
    await service.closeWithin(manager as never, resolution);
    expect(writes).toEqual({});
  });
});

describe('Dispute resolution visible to customer and runner (row 79)', () => {
  const resolvedAt = new Date('2026-10-09T12:00:00Z');
  const rows = () => ({
    dispute: {
      id: 'd-1',
      errandId: 'e-1',
      reason: 'Wrong item',
      status: 'resolved',
      resolution: 'Receipt shows the runner bought the right item.',
      resolvedBy: 'admin-1',
    } as unknown as Dispute,
    events: [
      { id: 'ev-1', eventType: DisputeEventType.OPENED, actorId: 'cust-user', payload: { reason: 'Wrong item' } },
      { id: 'ev-2', eventType: DisputeEventType.COMMENT, actorId: 'admin-1', payload: { note: 'internal: call runner' } },
      {
        id: 'ev-3',
        eventType: DisputeEventType.RESOLVED,
        actorId: 'admin-1',
        payload: { verdict: 'runner_favourable', resolution: 'Receipt shows the runner bought the right item.' },
        createdAt: resolvedAt,
      },
    ] as unknown as DisputeEvent[],
  });

  it.each([UserRole.CUSTOMER, UserRole.RUNNER])('%s sees the note and verdict, not admin internals', (role) => {
    const { dispute, events } = rows();
    const view = toDisputeView(dispute, events, { role });
    expect(view.resolution).toBe('Receipt shows the runner bought the right item.');
    expect(view.verdict).toBe('runner_favourable');
    expect(view.resolvedAt).toEqual(resolvedAt);
    expect(view.resolvedBy).toBeNull();
    expect(view.events.map((e) => e.id)).toEqual(['ev-1', 'ev-3']);
    expect(view.events[1].actorId).toBeNull();
    expect(JSON.stringify(view)).not.toContain('internal');
    expect(JSON.stringify(view)).not.toContain('admin-1');
  });

  it('admins see everything', () => {
    const { dispute, events } = rows();
    const view = toDisputeView(dispute, events, { role: UserRole.ADMIN });
    expect(view.resolvedBy).toBe('admin-1');
    expect(view.events).toHaveLength(3);
    expect(view.verdict).toBe('runner_favourable');
  });

  it('an open dispute has no verdict', () => {
    const { dispute, events } = rows();
    const view = toDisputeView(dispute, events.slice(0, 1), { role: UserRole.CUSTOMER });
    expect(view.verdict).toBeNull();
    expect(view.resolvedAt).toBeNull();
  });
});

describe('DisputesService.runnersWithOpenDisputes (row 175)', () => {
  it('returns the runners with an open or under-review dispute on a task they were assigned to', async () => {
    const errands = {
      errandIdsByRunner: vi.fn(() =>
        Promise.resolve(
          new Map([
            ['rp-1', ['e-1', 'e-2']],
            ['rp-2', ['e-3']],
          ]),
        ),
      ),
    };
    const disputes = { find: vi.fn(() => Promise.resolve([{ errandId: 'e-2' }])) };
    const service = new DisputesService(disputes as never, {} as never, errands as never);
    await expect(service.runnersWithOpenDisputes(['rp-1', 'rp-2', 'rp-3'])).resolves.toEqual(new Set(['rp-1']));
    expect(disputes.find).toHaveBeenCalledWith({
      where: { errandId: expect.anything(), status: expect.anything() },
      select: { errandId: true },
    });
  });

  it('skips the dispute query when the runners have no tasks', async () => {
    const errands = { errandIdsByRunner: vi.fn(() => Promise.resolve(new Map())) };
    const disputes = { find: vi.fn() };
    const service = new DisputesService(disputes as never, {} as never, errands as never);
    await expect(service.runnersWithOpenDisputes(['rp-1'])).resolves.toEqual(new Set());
    expect(disputes.find).not.toHaveBeenCalled();
  });
});
