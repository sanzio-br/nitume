import { describe, expect, it, vi } from 'vitest';
import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage (row 53)', () => {
  it('runs one atomic script per hit and maps the record', async () => {
    const redis = { evalScript: vi.fn(() => Promise.resolve([3, 59_500, -2])) };
    const storage = new RedisThrottlerStorage(redis as never);
    const out = await storage.increment('ip-hash', 60_000, 5, 60_000, 'otpRequest');
    expect(redis.evalScript).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      ['throttle:otpRequest:ip-hash:hits', 'throttle:otpRequest:ip-hash:block'],
      [60_000, 5, 60_000],
    );
    expect(out).toEqual({ totalHits: 3, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
  });

  it('reports a block with its remaining time', async () => {
    const redis = { evalScript: vi.fn(() => Promise.resolve([6, 30_000, 45_200])) };
    const storage = new RedisThrottlerStorage(redis as never);
    const out = await storage.increment('k', 60_000, 5, 60_000, 'otpVerify');
    expect(out).toMatchObject({ totalHits: 6, isBlocked: true, timeToBlockExpire: 46 });
  });
});
