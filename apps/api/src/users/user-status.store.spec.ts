import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { StatusHistoryActor, UserRole, UserStatus } from '../common/enums';
import { decodeHistoryCursor, encodeHistoryCursor, LockedUser, UserStatusStore } from './user-status.store';

const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const ROW_ID = '33333333-3333-4333-8333-333333333333';
const CREATED = new Date('2026-10-28T10:00:00.123Z');

/**
 * A manager whose `query` answers by statement. Every statement goes through
 * the transaction's manager (never the repository's), so they commit or roll
 * back together.
 */
const build = (opts: { user?: LockedUser | null; failInsert?: boolean; displayName?: string | null } = {}) => {
  const user: LockedUser | null =
    opts.user === undefined ? { id: USER, role: UserRole.CUSTOMER, status: UserStatus.ACTIVE, phone: '+254700000001' } : opts.user;
  const statements: string[] = [];
  const tx = {
    query: vi.fn((sql: string, _params?: unknown[]) => {
      statements.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
      if (sql.includes('FOR UPDATE')) return Promise.resolve(user ? [{ ...user }] : []);
      if (sql.startsWith('UPDATE')) return Promise.resolve([]);
      if (sql.startsWith('INSERT')) {
        if (opts.failInsert) return Promise.reject(new Error('insert failed'));
        return Promise.resolve([{ id: ROW_ID, createdAt: CREATED, actorDisplayName: opts.displayName ?? 'Ops Jane' }]);
      }
      if (sql.includes('clock_timestamp')) return Promise.resolve([{ v: '1793181600123456' }]);
      return Promise.reject(new Error(`unexpected ${sql}`));
    }),
  };
  const manager = {
    transaction: vi.fn(<T>(cb: (m: typeof tx) => Promise<T>) => cb(tx)),
    query: vi.fn(),
  };
  const store = new UserStatusStore({ manager } as never);
  return { store, tx, manager, statements };
};

const AUDIT = { actorType: StatusHistoryActor.ADMIN, actorUserId: ADMIN, reason: 'Repeated fraud reports' };

describe('UserStatusStore.write (issue #24)', () => {
  it('locks the row, updates the status and inserts the history row in one transaction', async () => {
    const { store, tx, manager, statements } = build();
    const out = await store.write(USER, UserStatus.SUSPENDED, { audit: AUDIT });
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).not.toHaveBeenCalled();
    expect(statements).toEqual(['SELECT id,', 'UPDATE "users"', 'INSERT INTO', 'SELECT (extract(epoch']);
    expect(tx.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    expect(tx.query.mock.calls[2][1]).toEqual([USER, 'active', 'suspended', 'admin', ADMIN, 'Repeated fraud reports']);
    expect(out).toEqual({
      from: UserStatus.ACTIVE,
      access: { status: UserStatus.SUSPENDED, role: UserRole.CUSTOMER, phone: '+254700000001' },
      version: 1793181600123456,
      entry: {
        id: ROW_ID,
        fromStatus: 'active',
        toStatus: 'suspended',
        reason: 'Repeated fraud reports',
        actorType: 'admin',
        actor: { id: ADMIN, displayName: 'Ops Jane' },
        createdAt: CREATED,
      },
    });
  });

  it('is null for a missing user and writes nothing', async () => {
    const { store, statements } = build({ user: null });
    expect(await store.write(USER, UserStatus.SUSPENDED, { audit: AUDIT })).toBeNull();
    expect(statements).toEqual(['SELECT id,']);
  });

  it('a throwing check aborts before any write, inside the transaction', async () => {
    const { store, statements } = build();
    const check = vi.fn(() => {
      throw new Error('refused');
    });
    await expect(store.write(USER, UserStatus.BANNED, { audit: AUDIT, check })).rejects.toThrow('refused');
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ status: UserStatus.ACTIVE, role: UserRole.CUSTOMER }));
    expect(statements).toEqual(['SELECT id,']);
  });

  it('an unchanged status writes neither the user nor a history row', async () => {
    const { store, statements } = build();
    const out = await store.write(USER, UserStatus.ACTIVE, { audit: AUDIT });
    expect(out?.entry).toBeNull();
    expect(out?.from).toBe(UserStatus.ACTIVE);
    expect(statements).toEqual(['SELECT id,', 'SELECT (extract(epoch']);
  });

  it('without audit only the status is written (internal setStatus)', async () => {
    const { store, statements } = build();
    const out = await store.write(USER, UserStatus.SUSPENDED);
    expect(out?.entry).toBeNull();
    expect(statements).toEqual(['SELECT id,', 'UPDATE "users"', 'SELECT (extract(epoch']);
  });

  it('a failed history insert rejects the whole transaction (the status update is in it)', async () => {
    const { store, statements } = build({ failInsert: true });
    await expect(store.write(USER, UserStatus.SUSPENDED, { audit: AUDIT })).rejects.toThrow('insert failed');
    expect(statements).toEqual(['SELECT id,', 'UPDATE "users"', 'INSERT INTO']);
  });

  it('a system actor has no actor object', async () => {
    const { store } = build();
    const out = await store.write(USER, UserStatus.SUSPENDED, {
      audit: { actorType: StatusHistoryActor.SYSTEM, actorUserId: null, reason: 'Automated check' },
    });
    expect(out?.entry?.actor).toBeNull();
  });
});

describe('UserStatusStore.list (issue #24)', () => {
  const row = (i: number) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    fromStatus: 'active',
    toStatus: 'suspended',
    reason: 'Reason number ' + i,
    actorType: 'admin',
    actorUserId: ADMIN,
    actorDisplayName: null,
    createdAt: new Date(`2026-10-28T10:00:0${i}.000Z`),
    sortKey: `2026-10-28T10:00:0${i}.000123Z`,
  });

  const listing = (rows: unknown[], userExists = true) => {
    const query = vi.fn((sql: string) => {
      if (sql.startsWith('SELECT 1')) return Promise.resolve(userExists ? [{ '?column?': 1 }] : []);
      return Promise.resolve(rows);
    });
    return { store: new UserStatusStore({ manager: { query } } as never), query };
  };

  it('defaults to 20 newest first, fetching one extra row to know if there is more', async () => {
    const { store, query } = listing([row(3), row(2)]);
    const page = await store.list(USER);
    expect(page?.nextCursor).toBeNull();
    expect(page?.items.map((i) => i.reason)).toEqual(['Reason number 3', 'Reason number 2']);
    expect(page?.items[0]).toEqual({
      id: row(3).id,
      fromStatus: 'active',
      toStatus: 'suspended',
      reason: 'Reason number 3',
      actorType: 'admin',
      actor: { id: ADMIN, displayName: null },
      createdAt: row(3).createdAt,
    });
    const [sql, params] = query.mock.calls[1] as unknown as [string, unknown[]];
    expect(sql).toMatch(/ORDER BY h."createdAt" DESC, h.id DESC/);
    expect(params).toEqual([USER, null, null, 21]);
  });

  it('caps the limit at 50 and floors it at 1', async () => {
    const { store, query } = listing([]);
    await store.list(USER, { limit: 500 });
    await store.list(USER, { limit: 0 });
    expect((query.mock.calls[1] as unknown as [string, unknown[]])[1][3]).toBe(51);
    expect((query.mock.calls[3] as unknown as [string, unknown[]])[1][3]).toBe(2);
  });

  it('returns a cursor on the last item of a full page (microsecond sort key and id) that reads back', async () => {
    const { store, query } = listing([row(3), row(2), row(1)]);
    const page = await store.list(USER, { limit: 2 });
    expect(page?.items).toHaveLength(2);
    expect(decodeHistoryCursor(page?.nextCursor, USER)).toEqual({ at: row(2).sortKey, id: row(2).id });
    await store.list(USER, { limit: 2, cursor: page?.nextCursor });
    expect((query.mock.calls[3] as unknown as [string, unknown[]])[1]).toEqual([USER, row(2).sortKey, row(2).id, 3]);
  });

  it('is null for a missing user', async () => {
    const { store } = listing([], false);
    expect(await store.list(USER)).toBeNull();
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['another user', encodeHistoryCursor(ADMIN, '2026-10-28T10:00:00.000123Z', ROW_ID)],
    ['a bad time', encodeHistoryCursor(USER, '2026-13-45T10:00:00.000123Z', ROW_ID)],
    ['a bad id', encodeHistoryCursor(USER, '2026-10-28T10:00:00.000123Z', 'x')],
  ])('refuses a cursor with %s: 400 cursor_invalid', async (_label, cursor) => {
    const { store, query } = listing([]);
    const err = (await store.list(USER, { cursor }).catch((e: unknown) => e)) as ApiError;
    expect(err.getStatus()).toBe(400);
    expect((err.getResponse() as { code: string }).code).toBe('cursor_invalid');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('UserStatusStore.recentChanges (issue #24 token cut-off fallback)', () => {
  it('reads the changes of the window, newest first, outside any transaction', async () => {
    const { store, manager } = build();
    manager.query.mockResolvedValueOnce([{ toStatus: 'suspended', createdAt: '2026-10-29T10:00:00.400Z' }]);
    expect(await store.recentChanges(USER, 1200)).toEqual([
      { toStatus: UserStatus.SUSPENDED, createdAt: new Date('2026-10-29T10:00:00.400Z') },
    ]);
    const [sql, params] = manager.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('"createdAt" > now() - make_interval(secs => $2)');
    expect(sql).toContain('ORDER BY "createdAt" DESC');
    expect(params).toEqual([USER, 1200, 20]);
    expect(manager.transaction).not.toHaveBeenCalled();
  });
});
