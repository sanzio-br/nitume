import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ROLES_KEY } from '../common/decorators/auth.decorators';
import { StatusHistoryActor, UserRole, UserStatus } from '../common/enums';
import { AdminUsersController } from './admin-users.controller';
import { UserStatusService } from './user-status.service';

const change = (from: UserStatus, to: UserStatus) => ({
  user: { id: 'u-1', role: UserRole.CUSTOMER, status: to },
  change: {
    id: 'h-1',
    fromStatus: from,
    toStatus: to,
    reason: 'Repeated fraud reports',
    actorType: StatusHistoryActor.ADMIN,
    actor: { id: 'a-1', displayName: null },
    createdAt: new Date('2026-10-28T10:00:00Z'),
  },
});

const build = (opts: { revokeFails?: boolean; changeFails?: Error; page?: unknown } = {}) => {
  const order: string[] = [];
  const access = {
    changeStatus: vi.fn((input: { status: UserStatus }) => {
      order.push('changeStatus');
      return opts.changeFails ? Promise.reject(opts.changeFails) : Promise.resolve(change(UserStatus.ACTIVE, input.status));
    }),
  };
  const store = { list: vi.fn(() => Promise.resolve(opts.page === undefined ? { items: [], nextCursor: null } : opts.page)) };
  const tokens = {
    revokeAllForUser: vi.fn(() => {
      order.push('revoke');
      return opts.revokeFails ? Promise.reject(new Error('redis down')) : Promise.resolve(2);
    }),
  };
  const service = new UserStatusService(access as never, store as never, tokens as never);
  return { service, access, store, tokens, order };
};

describe('UserStatusService.change (issue #24)', () => {
  it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
    'on %s: audited change first, then every refresh session is revoked (owner WQ-23)',
    async (to) => {
      const { service, access, tokens, order } = build();
      const out = await service.change('a-1', 'u-1', to, 'Repeated fraud reports');
      expect(access.changeStatus).toHaveBeenCalledWith({
        actorUserId: 'a-1',
        userId: 'u-1',
        status: to,
        reason: 'Repeated fraud reports',
      });
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u-1');
      expect(order).toEqual(['changeStatus', 'revoke']);
      expect(out.user.status).toBe(to);
    },
  );

  it('on reactivation sessions are revoked too, so a fresh OTP sign-in is always needed', async () => {
    const { service, tokens } = build();
    await service.change('a-1', 'u-1', UserStatus.ACTIVE, 'Appeal accepted by ops');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u-1');
  });

  it('a refused change revokes nothing', async () => {
    const err = new ApiError(409, 'status_unchanged', 'x');
    const { service, tokens } = build({ changeFails: err });
    await expect(service.change('a-1', 'u-1', UserStatus.SUSPENDED, 'Repeated fraud reports')).rejects.toBe(err);
    expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('a revocation failure is logged and does not undo or fail the committed change', async () => {
    const { service } = build({ revokeFails: true });
    const out = await service.change('a-1', 'u-1', UserStatus.BANNED, 'Repeated fraud reports');
    expect(out.user.status).toBe(UserStatus.BANNED);
  });
});

describe('UserStatusService.history (issue #24)', () => {
  it('passes cursor and limit through', async () => {
    const page = { items: [], nextCursor: 'c2' };
    const { service, store } = build({ page });
    expect(await service.history('u-1', { cursor: 'c1', limit: 5 })).toBe(page);
    expect(store.list).toHaveBeenCalledWith('u-1', { cursor: 'c1', limit: 5 });
  });

  it('404 user_not_found for a missing user', async () => {
    const { service } = build({ page: null });
    const err = (await service.history('nope', {}).catch((e: unknown) => e)) as ApiError;
    expect(err.getStatus()).toBe(404);
    expect((err.getResponse() as { code: string }).code).toBe('user_not_found');
  });
});

describe('AdminUsersController (issue #24)', () => {
  it('is admin-only on the class, and no route overrides it (owner WQ-22)', () => {
    const reflector = new Reflector();
    expect(reflector.get<UserRole[]>(ROLES_KEY, AdminUsersController)).toEqual([UserRole.ADMIN]);
    const descriptor = (name: string) =>
      Object.getOwnPropertyDescriptor(AdminUsersController.prototype, name)?.value as () => unknown;
    for (const route of ['changeStatus', 'statusHistory']) {
      expect(reflector.get<UserRole[] | undefined>(ROLES_KEY, descriptor(route))).toBeUndefined();
    }
  });

  it('uses the authenticated admin as the actor', async () => {
    const statuses = { change: vi.fn(() => Promise.resolve('ok')), history: vi.fn() };
    const controller = new AdminUsersController(statuses as never);
    await controller.changeStatus(
      { userId: 'a-1', role: UserRole.ADMIN, phone: 'p', status: 'active' },
      'u-1',
      { status: UserStatus.SUSPENDED, reason: 'Repeated fraud reports' },
    );
    expect(statuses.change).toHaveBeenCalledWith('a-1', 'u-1', UserStatus.SUSPENDED, 'Repeated fraud reports');
  });
});
