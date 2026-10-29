import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole, UserStatus } from '../common/enums';
import {
  USER_ACCESS_CACHE_TTL_SECONDS,
  USER_STATUS_CHANGED,
  UserAccessService,
  userAccessCacheKey,
} from './user-access.service';
import { UserAccess } from './users.service';

const ACTIVE: UserAccess = { status: UserStatus.ACTIVE, role: UserRole.CUSTOMER, phone: '+254700000000' };

/** In-memory Redis with the SET / SET NX semantics the service relies on. */
const build = (opts: { row?: UserAccess | null; redisDown?: boolean } = {}) => {
  let row: UserAccess | null = opts.row === undefined ? { ...ACTIVE } : opts.row;
  const store = new Map<string, string>();
  const fail = () => Promise.reject(new Error('redis down'));
  const redis = {
    get: vi.fn((k: string) => (opts.redisDown ? fail() : Promise.resolve(store.get(k) ?? null))),
    set: vi.fn((k: string, v: string) => {
      if (opts.redisDown) return fail();
      store.set(k, v);
      return Promise.resolve();
    }),
    setIfAbsent: vi.fn((k: string, v: string, _ttl?: number) => {
      if (opts.redisDown) return fail();
      if (store.has(k)) return Promise.resolve(false);
      store.set(k, v);
      return Promise.resolve(true);
    }),
    setIfNotOlder: vi.fn((k: string, v: string, version: number) => {
      if (opts.redisDown) return fail();
      const cur = store.get(k);
      const curVersion = cur ? (JSON.parse(cur) as { v?: unknown }).v : undefined;
      if (typeof curVersion === 'number' && curVersion > version) return Promise.resolve(false);
      store.set(k, v);
      return Promise.resolve(true);
    }),
    del: vi.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
  const users = {
    accessOf: vi.fn(() => Promise.resolve(row ? { ...row } : null)),
  };
  // The locked write (UserStatusStore.write, issue #24): previous status, the
  // access as written and an increasing version.
  let clock = 0;
  const statusStore = {
    write: vi.fn((_id: string, status: UserStatus) => {
      if (!row) return Promise.resolve(null);
      const before = row.status;
      row = { ...row, status };
      clock += 1;
      return Promise.resolve({ from: before, access: { ...row }, version: clock, entry: null });
    }),
  };
  const events = { emit: vi.fn() };
  const cutoff = { mark: vi.fn(() => Promise.resolve()), isRefused: vi.fn(() => Promise.resolve(false)) };
  const service = new UserAccessService(users as never, redis as never, events as never, statusStore as never, cutoff as never);
  return { service, users, redis, events, store, cutoff };
};

describe('UserAccessService.accessOf (issue #23)', () => {
  it('reads the database on a miss and fills the cache with SET NX and the fallback TTL', async () => {
    const { service, users, redis, store } = build();
    expect(await service.accessOf('u-1')).toEqual(ACTIVE);
    expect(users.accessOf).toHaveBeenCalledWith('u-1');
    expect(redis.setIfAbsent).toHaveBeenCalledWith(userAccessCacheKey('u-1'), JSON.stringify(ACTIVE), USER_ACCESS_CACHE_TTL_SECONDS);
    expect(store.get('user:access:u-1')).toBe(JSON.stringify(ACTIVE));
  });

  it('serves a cached entry without touching the database', async () => {
    const { service, users } = build();
    await service.accessOf('u-1');
    await service.accessOf('u-1');
    expect(users.accessOf).toHaveBeenCalledTimes(1);
  });

  it('uses the 60 s fallback TTL decided by the owner (WQ-21, 2026-10-28)', () => {
    expect(USER_ACCESS_CACHE_TTL_SECONDS).toBe(60);
  });

  it('treats a malformed cache entry as a miss', async () => {
    const { service, users, store } = build();
    store.set('user:access:u-1', '{"status":"weird"}');
    expect(await service.accessOf('u-1')).toEqual(ACTIVE);
    expect(users.accessOf).toHaveBeenCalledTimes(1);
  });

  it('falls back to the database when Redis is down (never fails open)', async () => {
    const { service } = build({ row: { ...ACTIVE, status: UserStatus.SUSPENDED }, redisDown: true });
    expect((await service.accessOf('u-1'))?.status).toBe(UserStatus.SUSPENDED);
  });

  it('returns null and caches nothing for a missing user', async () => {
    const { service, store } = build({ row: null });
    expect(await service.accessOf('nope')).toBeNull();
    expect(store.size).toBe(0);
  });
});

describe('UserAccessService.setStatus (issue #23 invalidation)', () => {
  it('suspending overwrites a cached active entry at once and emits user.status_changed', async () => {
    const { service, events } = build();
    await service.accessOf('u-1');
    const event = await service.setStatus('u-1', UserStatus.SUSPENDED);
    expect(event).toEqual({ userId: 'u-1', status: UserStatus.SUSPENDED, from: UserStatus.ACTIVE });
    expect((await service.accessOf('u-1'))?.status).toBe(UserStatus.SUSPENDED);
    expect(events.emit).toHaveBeenCalledWith(USER_STATUS_CHANGED, event);
  });

  it('banning and reactivating take effect immediately too', async () => {
    const { service } = build();
    await service.accessOf('u-1');
    await service.setStatus('u-1', UserStatus.BANNED);
    expect((await service.accessOf('u-1'))?.status).toBe(UserStatus.BANNED);
    await service.setStatus('u-1', UserStatus.ACTIVE);
    expect((await service.accessOf('u-1'))?.status).toBe(UserStatus.ACTIVE);
  });

  it('a reader that loaded the old row cannot put it back after the change', async () => {
    const { service, redis, store } = build();
    // The reader missed the cache and read "active" before the change...
    const stale = JSON.stringify(ACTIVE);
    await service.setStatus('u-1', UserStatus.SUSPENDED);
    // ...and fills the cache only afterwards: SET NX loses to the writer.
    await redis.setIfAbsent('user:access:u-1', stale, USER_ACCESS_CACHE_TTL_SECONDS);
    expect(JSON.parse(store.get('user:access:u-1') as string).status).toBe(UserStatus.SUSPENDED);
  });

  it('does not emit when the status is unchanged', async () => {
    const { service, events } = build();
    await service.setStatus('u-1', UserStatus.ACTIVE);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('404s for a missing user', async () => {
    const { service, events } = build({ row: null });
    await expect(service.setStatus('nope', UserStatus.SUSPENDED)).rejects.toBeInstanceOf(NotFoundException);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('deletes the key when Redis cannot be overwritten', async () => {
    const { service, redis } = build({ redisDown: true });
    await service.setStatus('u-1', UserStatus.SUSPENDED);
    expect(redis.del).toHaveBeenCalledWith('user:access:u-1');
  });
});

describe('UserAccessService access-token cut-off (issue #24, owner 2026-10-29)', () => {
  it.each([UserStatus.SUSPENDED, UserStatus.BANNED, UserStatus.ACTIVE])(
    'a change to %s marks the cut-off after the cache write',
    async (to) => {
      const { service, cutoff } = build({ row: { ...ACTIVE, status: to === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE } });
      await service.setStatus('u-1', to);
      expect(cutoff.mark).toHaveBeenCalledWith('u-1', to);
    },
  );

  it('an unchanged status marks nothing', async () => {
    const { service, cutoff } = build();
    await service.setStatus('u-1', UserStatus.ACTIVE);
    expect(cutoff.mark).not.toHaveBeenCalled();
  });

  it('isTokenRevoked delegates to the cut-off service', async () => {
    const { service, cutoff } = build();
    cutoff.isRefused.mockResolvedValueOnce(true);
    expect(await service.isTokenRevoked('u-1', 1_700_000_000)).toBe(true);
    expect(cutoff.isRefused).toHaveBeenCalledWith('u-1', 1_700_000_000);
  });
});
