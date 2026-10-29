import { describe, expect, it, vi } from 'vitest';
import { UserStatus } from '../common/enums';
import {
  TOKEN_CUTOFF_TTL_MARGIN_SECONDS,
  UserTokenCutoffService,
  cutOffSecondFor,
  userTokensValidAfterKey,
} from './token-cutoff.service';

const T = Date.UTC(2026, 9, 29, 10, 0, 0, 400); // 10:00:00.400
const SEC = Math.floor(T / 1000);

/** In-memory Redis running the same "raise, never lower" rule as the Lua script. */
const build = (opts: { accessTtl?: string; redisDown?: boolean; raw?: string; history?: { toStatus: UserStatus; createdAt: Date }[]; historyFails?: boolean } = {}) => {
  const kv = new Map<string, { value: string; ttl: number }>();
  if (opts.raw !== undefined) kv.set(userTokensValidAfterKey('u-1'), { value: opts.raw, ttl: 1 });
  const down = () => Promise.reject(new Error('redis down'));
  const redis = {
    get: vi.fn((k: string) => (opts.redisDown ? down() : Promise.resolve(kv.get(k)?.value ?? null))),
    evalScript: vi.fn((_script: string, keys: string[], args: (string | number)[]) => {
      if (opts.redisDown) return down();
      const cur = kv.get(keys[0]);
      if (cur && Number(cur.value) >= Number(args[0])) return Promise.resolve(0);
      kv.set(keys[0], { value: String(args[0]), ttl: Number(args[1]) });
      return Promise.resolve(1);
    }),
  };
  const config = { get: vi.fn((_k: string, d: string) => opts.accessTtl ?? d) };
  const store = {
    recentChanges: vi.fn(() => (opts.historyFails ? Promise.reject(new Error('db down')) : Promise.resolve(opts.history ?? []))),
  };
  const service = new UserTokenCutoffService(redis as never, config as never, store as never);
  return { service, redis, store, kv };
};

describe('cutOffSecondFor', () => {
  it('suspend and ban cut off the whole second of the change; reactivation only earlier seconds', () => {
    expect(cutOffSecondFor(UserStatus.SUSPENDED, T)).toBe(SEC + 1);
    expect(cutOffSecondFor(UserStatus.BANNED, new Date(T))).toBe(SEC + 1);
    expect(cutOffSecondFor(UserStatus.ACTIVE, T)).toBe(SEC);
  });
});

describe('UserTokenCutoffService (issue #24, owner 2026-10-29)', () => {
  it('stores the cut-off for the access-token lifetime plus the margin', async () => {
    const { service, kv, redis } = build({ accessTtl: '15m' });
    await service.mark('u-1', UserStatus.SUSPENDED, T);
    expect(kv.get('user:tokens-valid-after:u-1')).toEqual({ value: String(SEC + 1), ttl: 900 + TOKEN_CUTOFF_TTL_MARGIN_SECONDS });
    expect(redis.evalScript.mock.calls[0][1]).toEqual(['user:tokens-valid-after:u-1']);
  });

  it('follows JWT_ACCESS_TTL', () => {
    expect(build({ accessTtl: '1h' }).service.windowSeconds()).toBe(3600 + TOKEN_CUTOFF_TTL_MARGIN_SECONDS);
    // Unreadable: a week, never shorter than a real access token.
    expect(build({ accessTtl: 'soon' }).service.windowSeconds()).toBe(7 * 86_400 + TOKEN_CUTOFF_TTL_MARGIN_SECONDS);
  });

  it('never lowers the cut-off (a reactivation in the same second keeps the suspension one)', async () => {
    const { service, kv } = build();
    await service.mark('u-1', UserStatus.SUSPENDED, T);
    await service.mark('u-1', UserStatus.ACTIVE, T + 300);
    expect(kv.get('user:tokens-valid-after:u-1')?.value).toBe(String(SEC + 1));
    await service.mark('u-1', UserStatus.ACTIVE, T + 5000);
    expect(kv.get('user:tokens-valid-after:u-1')?.value).toBe(String(SEC + 5));
  });

  it('mark throws when Redis is down (the caller logs it)', async () => {
    await expect(build({ redisDown: true }).service.mark('u-1', UserStatus.BANNED, T)).rejects.toThrow('redis down');
  });

  it('refuses tokens issued up to the suspension second, accepts later ones', async () => {
    const { service } = build();
    await service.mark('u-1', UserStatus.SUSPENDED, T);
    expect(await service.isRefused('u-1', SEC - 60)).toBe(true);
    expect(await service.isRefused('u-1', SEC)).toBe(true);
    expect(await service.isRefused('u-1', SEC + 1)).toBe(false);
  });

  it('a token without iat is refused once a cut-off exists, accepted otherwise', async () => {
    const { service } = build({ raw: String(SEC) });
    expect(await service.isRefused('u-1', undefined)).toBe(true);
    expect(await build().service.isRefused('u-1', undefined)).toBe(false);
  });

  it('no cut-off: accepted without reading the database', async () => {
    const { service, store } = build();
    expect(await service.isRefused('u-1', SEC)).toBe(false);
    expect(store.recentChanges).not.toHaveBeenCalled();
  });

  describe('Redis unavailable: the status history is the fallback (never fails open)', () => {
    it('a user suspended then reactivated in the window stays cut off', async () => {
      const { service, store } = build({
        redisDown: true,
        accessTtl: '15m',
        history: [
          { toStatus: UserStatus.ACTIVE, createdAt: new Date(T + 60_000) },
          { toStatus: UserStatus.SUSPENDED, createdAt: new Date(T) },
        ],
      });
      expect(await service.isRefused('u-1', SEC - 10)).toBe(true);
      expect(await service.isRefused('u-1', SEC + 59)).toBe(true);
      expect(await service.isRefused('u-1', SEC + 60)).toBe(false);
      expect(store.recentChanges).toHaveBeenCalledWith('u-1', 900 + TOKEN_CUTOFF_TTL_MARGIN_SECONDS);
    });

    it('a user with no recent change keeps working', async () => {
      const { service } = build({ redisDown: true });
      expect(await service.isRefused('u-1', SEC)).toBe(false);
    });

    it('a malformed Redis value is ignored in favour of the history', async () => {
      const { service, store } = build({ raw: 'garbage', history: [{ toStatus: UserStatus.BANNED, createdAt: new Date(T) }] });
      expect(await service.isRefused('u-1', SEC)).toBe(true);
      expect(store.recentChanges).toHaveBeenCalled();
    });

    it('if the database fails too, the error propagates (the request is refused, not let through)', async () => {
      const { service } = build({ redisDown: true, historyFails: true });
      await expect(service.isRefused('u-1', SEC)).rejects.toThrow('db down');
    });
  });
});
