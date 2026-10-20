import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { AssignmentStatus, ErrandStatus, StatusHistoryActor } from '../common/enums';
import { GEOFENCE_ARRIVAL_NOTE, LocationProcessor } from './location.processor';

const build = (holder: unknown = { runnerProfileId: 'rp-1', status: AssignmentStatus.ACCEPTED }) => {
  const runners = { recordPing: vi.fn(() => Promise.resolve(true)) };
  const errands = {
    activeAssignmentFor: vi.fn(() => Promise.resolve(holder)),
    transition: vi.fn(() => Promise.resolve({})),
  };
  return { processor: new LocationProcessor(runners as never, errands as never), runners, errands };
};

describe('LocationProcessor (§4.2, §4.3)', () => {
  it('persists a job ping through the runners service', async () => {
    const { processor, runners } = build();
    const out = await processor.process({
      name: 'location-persist',
      data: { runnerProfileId: 'rp-1', errandId: 'e-1', lat: 1, lng: 2, capturedAt: '2026-10-19T10:00:00.000Z', trail: true },
    } as never);
    expect(out).toEqual({ moved: true });
    expect(runners.recordPing).toHaveBeenCalledWith({
      runnerProfileId: 'rp-1',
      errandId: 'e-1',
      lat: 1,
      lng: 2,
      capturedAt: new Date('2026-10-19T10:00:00.000Z'),
      trail: true,
    });
  });

  it('moves RUNNER_EN_ROUTE -> ARRIVED as the system', async () => {
    const { processor, errands } = build();
    await expect(processor.arrive({ errandId: 'e-1', runnerProfileId: 'rp-1', lat: 1, lng: 2 })).resolves.toEqual({ arrived: true });
    expect(errands.transition).toHaveBeenCalledWith('e-1', ErrandStatus.ARRIVED, { type: StatusHistoryActor.SYSTEM }, GEOFENCE_ARRIVAL_NOTE);
  });

  it('skips when the runner no longer holds the accepted job', async () => {
    const { processor, errands } = build({ runnerProfileId: 'rp-2', status: AssignmentStatus.ACCEPTED });
    await expect(processor.arrive({ errandId: 'e-1', runnerProfileId: 'rp-1', lat: 1, lng: 2 })).resolves.toEqual({ arrived: false });
    expect(errands.transition).not.toHaveBeenCalled();
  });

  it('treats an already-moved task as done (manual arrival won the race)', async () => {
    const { processor, errands } = build();
    errands.transition.mockRejectedValueOnce(new ApiError(409, 'illegal_transition', 'x'));
    await expect(processor.arrive({ errandId: 'e-1', runnerProfileId: 'rp-1', lat: 1, lng: 2 })).resolves.toEqual({ arrived: false });
  });

  it('rethrows other failures so BullMQ retries', async () => {
    const { processor, errands } = build();
    errands.transition.mockRejectedValueOnce(new Error('db down'));
    await expect(processor.arrive({ errandId: 'e-1', runnerProfileId: 'rp-1', lat: 1, lng: 2 })).rejects.toThrow('db down');
  });
});
