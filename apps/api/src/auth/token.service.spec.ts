import { describe, expect, it, vi } from 'vitest';
import { TokenService } from './token.service';

describe('TokenService.revokeAllForUser (issue #24, owner WQ-23)', () => {
  const build = (deleted = 2) => {
    const redis = { deleteMatching: vi.fn(() => Promise.resolve(deleted)) };
    const service = new TokenService({} as never, {} as never, redis as never);
    return { service, redis };
  };

  it("deletes every refresh session of the user with one SCAN pattern and returns the count", async () => {
    const { service, redis } = build(3);
    expect(await service.revokeAllForUser('7f0c1a52-0000-4000-8000-000000000001')).toBe(3);
    expect(redis.deleteMatching).toHaveBeenCalledWith('refresh:7f0c1a52-0000-4000-8000-000000000001:*');
  });

  it('escapes glob characters so one user can never match another user\'s sessions', async () => {
    const { service, redis } = build();
    await service.revokeAllForUser('u*');
    expect(redis.deleteMatching).toHaveBeenCalledWith('refresh:u\\*:*');
  });

  it('does nothing for an empty id', async () => {
    const { service, redis } = build();
    expect(await service.revokeAllForUser('')).toBe(0);
    expect(redis.deleteMatching).not.toHaveBeenCalled();
  });
});
