import { Brackets } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { UserRole, UserStatus } from '../common/enums';
import { User } from './user.entity';
import { toPublicUser, UsersService } from './users.service';

const user = (over: Partial<User> = {}): User =>
  Object.assign(new User(), {
    id: 'u-1',
    phone: '+254712345678',
    email: null,
    passwordHash: null,
    displayName: null,
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-10-07T00:00:00Z'),
    updatedAt: new Date('2026-10-07T00:00:00Z'),
    ...over,
  });

describe('UsersService display name', () => {
  it('exposes displayName (null when unset) on the public user', () => {
    expect(toPublicUser(user()).displayName).toBeNull();
    expect(toPublicUser(user({ displayName: 'Amina' })).displayName).toBe('Amina');
    expect(toPublicUser(user())).not.toHaveProperty('passwordHash');
  });

  it('trims the name and clears it when blank', async () => {
    const row = user();
    const repo = {
      findOne: vi.fn(() => Promise.resolve(row)),
      save: vi.fn((u: User) => Promise.resolve(u)),
    };
    const service = new UsersService(repo as never);
    const set = await service.updateProfile('u-1', { displayName: '  Amina W.  ' });
    expect(set.displayName).toBe('Amina W.');
    const cleared = await service.updateProfile('u-1', { displayName: '   ' });
    expect(cleared.displayName).toBeNull();
  });

  it('batches display names and omits unset ones', async () => {
    const repo = {
      find: vi.fn(() =>
        Promise.resolve([
          { id: 'u-1', displayName: 'Amina' },
          { id: 'u-2', displayName: null },
        ]),
      ),
    };
    const service = new UsersService(repo as never);
    const names = await service.displayNames(['u-1', 'u-2', 'u-1']);
    expect([...names.entries()]).toEqual([['u-1', 'Amina']]);
    expect(await service.displayNames([])).toEqual(new Map());
  });

  it('batches sign-in phones and display names in one query, de-duplicated', async () => {
    const repo = {
      find: vi.fn(() =>
        Promise.resolve([
          { id: 'u-1', phone: '+254712345678', displayName: 'Mary Wanjiku' },
          { id: 'u-2', phone: '+254700000002', displayName: null },
        ]),
      ),
    };
    const service = new UsersService(repo as never);
    const contacts = await service.contacts(['u-1', 'u-2', 'u-1']);
    expect(repo.find).toHaveBeenCalledTimes(1);
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, phone: true, displayName: true } }),
    );
    expect([...contacts.entries()]).toEqual([
      ['u-1', { phone: '+254712345678', displayName: 'Mary Wanjiku' }],
      ['u-2', { phone: '+254700000002', displayName: null }],
    ]);
    expect(await service.contacts([])).toEqual(new Map());
    expect(repo.find).toHaveBeenCalledTimes(1);
  });
});

describe('UsersService.idsMatching (row 278, AV-2)', () => {
  const harness = () => {
    const calls: { kind: string; sql: string; params?: Record<string, unknown> }[] = [];
    const inner = {
      where: vi.fn((sql: string, params: Record<string, unknown>) => {
        calls.push({ kind: 'match', sql, params });
        return inner;
      }),
      orWhere: vi.fn((sql: string, params: Record<string, unknown>) => {
        calls.push({ kind: 'or', sql, params });
        return inner;
      }),
    };
    const qb = {
      select: vi.fn(() => qb),
      where: vi.fn((sql: string, params: Record<string, unknown>) => {
        calls.push({ kind: 'where', sql, params });
        return qb;
      }),
      andWhere: vi.fn((brackets: Brackets) => {
        brackets.whereFactory(inner as never);
        return qb;
      }),
      getRawMany: vi.fn(() => Promise.resolve([{ id: 'u-1' }, { id: 'u-2' }])),
    };
    const repo = { createQueryBuilder: vi.fn(() => qb) };
    return { service: new UsersService(repo as never), calls };
  };

  it('only the given role; the name is bound as an escaped, case-insensitive contains pattern', async () => {
    const h = harness();
    expect(await h.service.idsMatching({ nameContains: "50%_o'\\", role: UserRole.RUNNER })).toEqual(['u-1', 'u-2']);
    expect(h.calls[0]).toEqual({ kind: 'where', sql: 'u.role = :role', params: { role: UserRole.RUNNER } });
    expect(h.calls[1].sql).toBe(`u."displayName" ILIKE :name ESCAPE '\\'`);
    expect(h.calls[1].sql).not.toContain('50');
    expect(h.calls[1].params).toEqual({ name: "%50\\%\\_o'\\\\%" });
    expect(h.calls).toHaveLength(2);
  });

  it('adds the phone digits as a bound OR inside the role condition only when given', async () => {
    const h = harness();
    await h.service.idsMatching({ nameContains: '0712', phoneDigits: '712', role: UserRole.RUNNER });
    expect(h.calls[2]).toEqual({ kind: 'or', sql: 'strpos(u.phone, :digits) > 0', params: { digits: '712' } });
  });
});

describe('UsersService access and status (issue #23)', () => {
  it('accessOf selects status, role and phone by primary key', async () => {
    const repo = { findOne: vi.fn(() => Promise.resolve(user({ status: UserStatus.BANNED }))) };
    const service = new UsersService(repo as never);
    expect(await service.accessOf('u-1')).toEqual({
      status: UserStatus.BANNED,
      role: UserRole.CUSTOMER,
      phone: '+254712345678',
    });
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { id: true, status: true, role: true, phone: true },
    });
  });

  it('accessOf is null for a missing user', async () => {
    const service = new UsersService({ findOne: vi.fn(() => Promise.resolve(null)) } as never);
    expect(await service.accessOf('nope')).toBeNull();
  });
});

describe('UsersService.summaryOf (issue #24, U-1)', () => {
  it('selects id, role, status, display name and phone by primary key', async () => {
    const repo = {
      findOne: vi.fn(() => Promise.resolve(user({ status: UserStatus.SUSPENDED, displayName: 'Amina W.' }))),
    };
    const service = new UsersService(repo as never);
    expect(await service.summaryOf('u-1')).toEqual({
      id: 'u-1',
      role: UserRole.CUSTOMER,
      status: UserStatus.SUSPENDED,
      displayName: 'Amina W.',
      phone: '+254712345678',
    });
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { id: true, role: true, status: true, displayName: true, phone: true },
    });
  });

  it('an unset or empty display name is null', async () => {
    const service = new UsersService({ findOne: vi.fn(() => Promise.resolve(user({ displayName: '' }))) } as never);
    expect((await service.summaryOf('u-1'))?.displayName).toBeNull();
  });

  it('is null for a missing user', async () => {
    const service = new UsersService({ findOne: vi.fn(() => Promise.resolve(null)) } as never);
    expect(await service.summaryOf('nope')).toBeNull();
  });
});
