import { describe, expect, it, vi } from 'vitest';
import { VerificationLevel } from '../common/enums';
import { RunnerLevelWatcher } from './runner-level.watcher';

/** Row 266: a runner dropped below Level 2 loses their open offers; the listener never throws. */
describe('RunnerLevelWatcher (row 266)', () => {
  const event = {
    runnerProfileId: 'rp-1',
    from: VerificationLevel.TWO_ID_VERIFIED,
    to: VerificationLevel.ONE_BASIC,
    cause: 'upload' as const,
    at: '2026-10-21T08:00:00.000Z',
  };

  it('withdraws the open offers of the runner', async () => {
    const errands = { withdrawOpenOffersOf: vi.fn(() => Promise.resolve(['e-1'])) };
    await new RunnerLevelWatcher(errands as never).onLevelDropped(event);
    expect(errands.withdrawOpenOffersOf).toHaveBeenCalledWith('rp-1');
  });

  it('logs and swallows a failure (the level change has committed)', async () => {
    const errands = { withdrawOpenOffersOf: vi.fn(() => Promise.reject(new Error('db down'))) };
    await expect(new RunnerLevelWatcher(errands as never).onLevelDropped(event)).resolves.toBeUndefined();
  });
});
