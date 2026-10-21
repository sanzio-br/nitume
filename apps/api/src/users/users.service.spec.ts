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

  it('batches sign-in phones in one query, de-duplicated', async () => {
    const repo = {
      find: vi.fn(() =>
        Promise.resolve([
          { id: 'u-1', phone: '+254712345678' },
          { id: 'u-2', phone: '+254700000002' },
        ]),
      ),
    };
    const service = new UsersService(repo as never);
    const phones = await service.phones(['u-1', 'u-2', 'u-1']);
    expect(repo.find).toHaveBeenCalledTimes(1);
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, phone: true } }));
    expect([...phones.entries()]).toEqual([
      ['u-1', '+254712345678'],
      ['u-2', '+254700000002'],
    ]);
    expect(await service.phones([])).toEqual(new Map());
    expect(repo.find).toHaveBeenCalledTimes(1);
  });
});
