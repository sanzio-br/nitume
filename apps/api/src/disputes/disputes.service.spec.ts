import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
import { DisputesService } from './disputes.service';

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
  const events = { find: vi.fn(() => Promise.resolve([{ id: 'ev-1' }])) };
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
    ).rejects.toBeInstanceOf(ConflictException);
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
    expect(view.events).toEqual([{ id: 'ev-1' }]);
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
    expect(view.events).toEqual([{ id: 'ev-1' }]);
  });

  it('404s when the errand has no dispute', async () => {
    const { service } = build();
    await expect(service.getForErrand('e-1', customer)).rejects.toThrow('No dispute for this task');
  });
});
