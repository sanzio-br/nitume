import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { StatusHistoryActor, UserRole, UserStatus } from '../common/enums';
import { USER_ACCESS_CACHE_TTL_SECONDS, USER_STATUS_CHANGED, UserAccessService, userAccessCacheKey } from './user-access.service';
import { LockedUser, StatusAudit, StatusWrite } from './user-status.store';

const ADMIN_ID = 'a-1';
const USER_ID = 'u-1';
const REASON = 'Repeated fraud reports from customers';
const { ACTIVE, SUSPENDED, BANNED } = UserStatus;

/**
 * A store that behaves like UserStatusStore.write: runs `check` on the
 * locked row, then writes status and history together, or nothing.
 */
const build = (opts: { row?: Partial<LockedUser> | null; failWrite?: boolean; redisDown?: boolean; cutoffFails?: boolean } = {}) => {
  let row: LockedUser | null =
    opts.row === null ? null : { id: USER_ID, role: UserRole.RUNNER, status: ACTIVE, phone: '+254700000002', ...opts.row };
  const history: { from: UserStatus; to: UserStatus; audit: StatusAudit }[] = [];
  let clock = 100;
  const statusStore = {
    write: vi.fn(
      (_id: string, to: UserStatus, o: { audit?: StatusAudit; check?: (c: LockedUser) => void } = {}): Promise<StatusWrite | null> => {
        if (!row) return Promise.resolve(null);
        o.check?.({ ...row });
        if (opts.failWrite) return Promise.reject(new Error('insert failed'));
        const from = row.status;
        row = { ...row, status: to };
        if (o.audit) history.push({ from, to, audit: o.audit });
        clock += 1;
        return Promise.resolve({
          from,
          access: { status: to, role: row.role, phone: row.phone },
          version: clock,
          entry: o.audit
            ? {
                id: `h-${history.length}`,
                fromStatus: from,
                toStatus: to,
                reason: o.audit.reason,
                actorType: o.audit.actorType,
                actor: { id: o.audit.actorUserId as string, displayName: 'Ops Jane' },
                createdAt: new Date('2026-10-28T10:00:00Z'),
              }
            : null,
        });
      },
    ),
  };
  const cache = new Map<string, string>();
  const redis = {
    get: vi.fn((k: string) => Promise.resolve(cache.get(k) ?? null)),
    setIfAbsent: vi.fn(),
    setIfNotOlder: vi.fn((k: string, v: string, version: number) => {
      if (opts.redisDown) return Promise.reject(new Error('redis down'));
      const cur = cache.get(k);
      const curV = cur ? (JSON.parse(cur) as { v?: number }).v : undefined;
      if (typeof curV === 'number' && curV > version) return Promise.resolve(false);
      cache.set(k, v);
      return Promise.resolve(true);
    }),
    del: vi.fn((k: string) => {
      cache.delete(k);
      return Promise.resolve();
    }),
  };
  const users = { accessOf: vi.fn() };
  const events = { emit: vi.fn() };
  const order: string[] = [];
  events.emit.mockImplementation(() => order.push('event'));
  const cutoff = {
    mark: vi.fn(() => {
      order.push('cutoff');
      return opts.cutoffFails ? Promise.reject(new Error('redis down')) : Promise.resolve();
    }),
    isRefused: vi.fn(() => Promise.resolve(false)),
  };
  const service = new UserAccessService(users as never, redis as never, events as never, statusStore as never, cutoff as never);
  const change = (status: UserStatus, over: { actorUserId?: string; userId?: string; reason?: unknown } = {}) =>
    service.changeStatus({ actorUserId: ADMIN_ID, userId: USER_ID, status, reason: REASON, ...over });
  return { service, change, statusStore, redis, events, cache, history, cutoff, order, current: () => row };
};

const codeOf = async (p: Promise<unknown>): Promise<[number, string]> => {
  const err = (await p.catch((e: unknown) => e)) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  return [err.getStatus(), (err.getResponse() as { code: string }).code];
};

describe('UserAccessService.changeStatus (issue #24, owner WQ-22/WQ-23)', () => {
  it.each([
    [ACTIVE, SUSPENDED],
    [SUSPENDED, ACTIVE],
    [ACTIVE, BANNED],
    [SUSPENDED, BANNED],
    [BANNED, ACTIVE],
  ])('%s -> %s: writes status and audit row, caches the written value, emits user.status_changed', async (from, to) => {
    const { change, events, cache, history, current } = build({ row: { status: from } });
    const out = await change(to);
    expect(current()?.status).toBe(to);
    expect(history).toEqual([
      { from, to, audit: { actorType: StatusHistoryActor.ADMIN, actorUserId: ADMIN_ID, reason: REASON } },
    ]);
    expect(out.user).toEqual({ id: USER_ID, role: UserRole.RUNNER, status: to });
    expect(out.change).toMatchObject({ fromStatus: from, toStatus: to, reason: REASON, actor: { id: ADMIN_ID } });
    expect(JSON.parse(cache.get(userAccessCacheKey(USER_ID)) as string)).toMatchObject({ status: to, role: 'runner' });
    expect(events.emit).toHaveBeenCalledWith(USER_STATUS_CHANGED, { userId: USER_ID, status: to, from });
  });

  it('trims the reason before storing it', async () => {
    const { change, history } = build();
    await change(SUSPENDED, { reason: `   ${REASON}   ` });
    expect(history[0].audit.reason).toBe(REASON);
  });

  it('banned -> suspended is 409 status_transition_not_allowed and writes nothing', async () => {
    const { change, events, history, cache, current } = build({ row: { status: BANNED } });
    expect(await codeOf(change(SUSPENDED))).toEqual([409, 'status_transition_not_allowed']);
    expect(current()?.status).toBe(BANNED);
    expect(history).toHaveLength(0);
    expect(cache.size).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it.each([ACTIVE, SUSPENDED, BANNED])('%s -> same is 409 status_unchanged', async (status) => {
    const { change, history } = build({ row: { status } });
    expect(await codeOf(change(status))).toEqual([409, 'status_unchanged']);
    expect(history).toHaveLength(0);
  });

  it('400 status_reason_invalid before touching the database', async () => {
    const { change, statusStore } = build();
    expect(await codeOf(change(SUSPENDED, { reason: 'too short' }))).toEqual([400, 'status_reason_invalid']);
    expect(await codeOf(change(SUSPENDED, { reason: undefined }))).toEqual([400, 'status_reason_invalid']);
    expect(await codeOf(change(SUSPENDED, { reason: 'x'.repeat(501) }))).toEqual([400, 'status_reason_invalid']);
    expect(statusStore.write).not.toHaveBeenCalled();
  });

  it('403 cannot_change_own_status before touching the database', async () => {
    const { change, statusStore } = build();
    expect(await codeOf(change(SUSPENDED, { userId: ADMIN_ID }))).toEqual([403, 'cannot_change_own_status']);
    expect(statusStore.write).not.toHaveBeenCalled();
  });

  it('403 cannot_change_admin_status on another admin, checked on the locked row', async () => {
    const { change, history, current } = build({ row: { role: UserRole.ADMIN } });
    expect(await codeOf(change(SUSPENDED))).toEqual([403, 'cannot_change_admin_status']);
    expect(current()?.status).toBe(ACTIVE);
    expect(history).toHaveLength(0);
  });

  it('404 user_not_found for a missing user', async () => {
    const { change, events } = build({ row: null });
    expect(await codeOf(change(SUSPENDED))).toEqual([404, 'user_not_found']);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('a failed transaction leaves the cache untouched and emits nothing', async () => {
    const { change, events, cache, redis } = build({ failWrite: true });
    await expect(change(SUSPENDED)).rejects.toThrow('insert failed');
    expect(cache.size).toBe(0);
    expect(redis.setIfNotOlder).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('writes the cache with the version and the fallback TTL; deletes the key when Redis fails', async () => {
    const ok = build();
    await ok.change(SUSPENDED);
    expect(ok.redis.setIfNotOlder).toHaveBeenCalledWith(
      userAccessCacheKey(USER_ID),
      JSON.stringify({ status: SUSPENDED, role: UserRole.RUNNER, phone: '+254700000002', v: 101 }),
      101,
      USER_ACCESS_CACHE_TTL_SECONDS,
    );
    const down = build({ redisDown: true });
    await down.change(SUSPENDED);
    expect(down.redis.del).toHaveBeenCalledWith(userAccessCacheKey(USER_ID));
    expect(down.events.emit).toHaveBeenCalled();
  });
});

describe('cache ordering of concurrent changes (reviewer minor 2 on #23)', () => {
  it('a late cache write of an older change cannot replace a newer one', async () => {
    const { redis, cache } = build();
    const key = userAccessCacheKey(USER_ID);
    // Change 1 (suspend, version 5) and change 2 (reactivate, version 6)
    // commit in that order under the row lock, but reach Redis in reverse.
    await redis.setIfNotOlder(key, JSON.stringify({ status: ACTIVE, role: 'runner', phone: 'p', v: 6 }), 6);
    expect(await redis.setIfNotOlder(key, JSON.stringify({ status: SUSPENDED, role: 'runner', phone: 'p', v: 5 }), 5)).toBe(false);
    expect(JSON.parse(cache.get(key) as string).status).toBe(ACTIVE);
  });

  it('the service passes increasing versions for successive changes', async () => {
    const { change, redis } = build();
    await change(SUSPENDED);
    await change(ACTIVE);
    const versions = redis.setIfNotOlder.mock.calls.map((c) => c[2]);
    expect(versions[1]).toBeGreaterThan(versions[0]);
  });
});

describe('changeStatus access-token cut-off (issue #24, owner 2026-10-29)', () => {
  it.each([SUSPENDED, BANNED])('%s: the cut-off is marked after commit, before the event', async (to) => {
    const { change, cutoff, order } = build();
    await change(to);
    expect(cutoff.mark).toHaveBeenCalledWith(USER_ID, to);
    expect(order).toEqual(['cutoff', 'event']);
  });

  it('reactivation marks it too (second chance if the suspension write was lost)', async () => {
    const { change, cutoff } = build({ row: { status: SUSPENDED } });
    await change(ACTIVE);
    expect(cutoff.mark).toHaveBeenCalledWith(USER_ID, ACTIVE);
  });

  it('a refused change marks nothing', async () => {
    const { change, cutoff } = build({ row: { status: BANNED } });
    await change(SUSPENDED).catch(() => undefined);
    expect(cutoff.mark).not.toHaveBeenCalled();
  });

  it('a Redis failure on the mark is logged; the committed change stands and the event is still emitted', async () => {
    const { change, events, current } = build({ cutoffFails: true });
    const out = await change(SUSPENDED);
    expect(out.user.status).toBe(SUSPENDED);
    expect(current()?.status).toBe(SUSPENDED);
    expect(events.emit).toHaveBeenCalledWith(USER_STATUS_CHANGED, { userId: USER_ID, status: SUSPENDED, from: ACTIVE });
  });
});
