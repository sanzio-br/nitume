import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ErrandStatus, UserRole, UserStatus } from '../common/enums';
import { RealtimeGateway } from './realtime.gateway';
import { SocketServerEvent } from './realtime.events';

const ERRAND_ID = '11111111-2222-4333-8444-555555555555';

const build = (opts: {
  verify?: () => Promise<unknown>;
  user?: unknown;
  getById?: () => Promise<unknown>;
  holder?: () => Promise<unknown>;
  profile?: () => Promise<unknown>;
  /** Issue #28: the customer may see the merchant numbers (fees paid). */
  feesPaid?: () => Promise<boolean>;
} = {}) => {
  const row = (opts.user === undefined
    ? { id: 'u-1', role: UserRole.CUSTOMER, phone: '+254700000000', status: UserStatus.ACTIVE }
    : opts.user) as { id?: string; role?: UserRole; phone?: string; status?: UserStatus } | null;
  const jwt = {
    verifyAsync: vi.fn(opts.verify ?? (() => Promise.resolve({ sub: row?.id ?? 'u-1', type: 'access' }))),
  };
  const config = { get: vi.fn(() => 'secret') };
  const access = {
    accessOf: vi.fn(() =>
      Promise.resolve(row ? { status: row.status, role: row.role, phone: row.phone } : null),
    ),
    isTokenRevoked: vi.fn(() => Promise.resolve(false)),
  };
  const errands = {
    getById: vi.fn(opts.getById ?? (() => Promise.resolve({ id: ERRAND_ID }))),
    activeAssignmentFor: vi.fn(opts.holder ?? (() => Promise.resolve({ runnerProfileId: 'rp-1', status: 'accepted' }))),
    merchantNumbersVisibleTo: vi.fn(opts.feesPaid ?? (() => Promise.resolve(false))),
  };
  const runners = {
    profileByUserId: vi.fn(opts.profile ?? (() => Promise.resolve({ id: 'rp-1' }))),
  };
  const location = { ingest: vi.fn(() => Promise.resolve({ ok: true })) };
  const gateway = new RealtimeGateway(
    jwt as never,
    config as never,
    access as never,
    errands as never,
    runners as never,
    location as never,
  );
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  const roomSockets: object[] = [];
  const fetchSockets = vi.fn(() => Promise.resolve(roomSockets));
  const inRoom = vi.fn(() => ({ fetchSockets }));
  gateway.server = { to, in: inRoom } as never;
  return { gateway, jwt, access, errands, runners, location, to, emit, roomSockets, inRoom };
};

const socket = (auth: Record<string, unknown> = { token: 'abc' }, headers = {}) => ({
  handshake: { auth, headers },
  data: {} as { user?: unknown },
  disconnect: vi.fn(),
  join: vi.fn(() => Promise.resolve()),
  leave: vi.fn(() => Promise.resolve()),
});

describe('RealtimeGateway connection auth (A-1)', () => {
  it('accepts an access token from handshake.auth and stores the user', async () => {
    const { gateway, jwt } = build();
    const client = socket({ token: 'Bearer abc' });
    await gateway.handleConnection(client as never);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('abc', { secret: 'secret' });
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toEqual({
      userId: 'u-1',
      role: UserRole.CUSTOMER,
      phone: '+254700000000',
      status: UserStatus.ACTIVE,
    });
  });

  it('accepts an Authorization header', async () => {
    const { gateway, jwt } = build();
    const client = socket({}, { authorization: 'Bearer hdr' });
    await gateway.handleConnection(client as never);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('hdr', expect.anything());
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', { auth: {}, verify: undefined, user: undefined }],
    ['bad token', { auth: { token: 'x' }, verify: () => Promise.reject(new Error('jwt')), user: undefined }],
    ['refresh token', { auth: { token: 'x' }, verify: () => Promise.resolve({ sub: 'u-1', type: 'refresh' }), user: undefined }],
    ['suspended user', { auth: { token: 'x' }, verify: undefined, user: { id: 'u-1', status: UserStatus.SUSPENDED } }],
  ])('disconnects on %s', async (_label, c) => {
    const { gateway } = build({ verify: c.verify, user: c.user });
    const client = socket(c.auth);
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});

describe('RealtimeGateway rooms (A-1)', () => {
  const authed = () => {
    const client = socket();
    client.data.user = { userId: 'u-1', role: UserRole.CUSTOMER };
    return client;
  };

  it('joins errand:{id} after the errand access check', async () => {
    const { gateway, errands } = build();
    const client = authed();
    const ack = await gateway.join(client as never, { errandId: ERRAND_ID });
    expect(errands.getById).toHaveBeenCalledWith(ERRAND_ID, { role: UserRole.CUSTOMER, userId: 'u-1' });
    expect(client.join).toHaveBeenCalledWith(`errand:${ERRAND_ID}`);
    expect(ack).toEqual({ ok: true, room: `errand:${ERRAND_ID}` });
  });

  it('refuses errands the user cannot view', async () => {
    const { gateway } = build({ getById: () => Promise.reject(new ForbiddenException()) });
    const client = authed();
    const ack = await gateway.join(client as never, { errandId: ERRAND_ID });
    expect(ack).toEqual({ ok: false, error: 'forbidden' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects malformed errand ids', async () => {
    const { gateway, errands } = build();
    const ack = await gateway.join(authed() as never, { errandId: 'nope' });
    expect(ack).toEqual({ ok: false, error: 'invalid_errand_id' });
    expect(errands.getById).not.toHaveBeenCalled();
  });

  it('leaves a room', async () => {
    const { gateway } = build();
    const client = authed();
    await expect(gateway.leave(client as never, { errandId: ERRAND_ID })).resolves.toEqual({
      ok: true,
      room: `errand:${ERRAND_ID}`,
    });
    expect(client.leave).toHaveBeenCalledWith(`errand:${ERRAND_ID}`);
  });
});

describe('RealtimeGateway pushes (A-1, A-2)', () => {
  it('forwards status changes to the errand room', async () => {
    const { gateway, to, emit } = build();
    await gateway.onStatusChanged({
      errandId: ERRAND_ID,
      status: ErrandStatus.ARRIVED,
      from: ErrandStatus.RUNNER_EN_ROUTE,
      actor: 'runner',
    });
    expect(to).toHaveBeenCalledWith(`errand:${ERRAND_ID}`);
    expect(emit).toHaveBeenCalledWith(
      SocketServerEvent.ERRAND_STATUS_CHANGED,
      expect.objectContaining({
        errandId: ERRAND_ID,
        status: ErrandStatus.ARRIVED,
        from: ErrandStatus.RUNNER_EN_ROUTE,
        at: expect.any(String),
      }),
    );
  });

  it('forwards evidence uploads', () => {
    const { gateway, emit } = build();
    const event = { errandId: ERRAND_ID, evidenceId: 'ev-1', type: 'photo', capturedAt: 'x' };
    gateway.onEvidenceUploaded(event);
    expect(emit).toHaveBeenCalledWith('evidence:uploaded', event);
  });

  it('forwards price-change requests', () => {
    const { gateway, emit } = build();
    const event = {
      errandId: ERRAND_ID,
      requestId: 'pc-1',
      fromPrice: '500.00',
      toPrice: '650.00',
      reason: 'Price went up',
      createdAt: 'x',
    };
    gateway.onPriceChangeRequested(event);
    expect(emit).toHaveBeenCalledWith('price_change:requested', event);
  });

  it('forwards quote re-issues (N-4)', () => {
    const { gateway, emit } = build();
    const quote = {
      errandId: ERRAND_ID,
      quoteId: 'q-2',
      total: '700.00',
      currency: 'KES',
      expiresAt: null,
      status: ErrandStatus.ACCEPTED,
      acceptanceRequired: true,
    };
    gateway.onQuoteReissued(quote);
    expect(emit).toHaveBeenCalledWith('quote:reissued', quote);
  });

  it('emits location:update with the §4.2 payload to the errand room and admins', () => {
    const { gateway, to, emit } = build();
    const payload = { errandId: ERRAND_ID, lat: -4.04, lng: 39.67, eta: 300, ts: 'x' };
    gateway.emitLocationUpdate(payload);
    expect(to).toHaveBeenCalledWith([`errand:${ERRAND_ID}`, 'admins']);
    expect(emit).toHaveBeenCalledWith('location:update', payload);
  });
});

describe('RealtimeGateway admin room (row 68)', () => {
  it('puts admin sockets in the admins room on connect, not customers', async () => {
    const admin = build({
      user: { id: 'a-1', role: UserRole.ADMIN, phone: '+254700000001', status: UserStatus.ACTIVE },
    });
    const adminSocket = socket();
    await admin.gateway.handleConnection(adminSocket as never);
    expect(adminSocket.join).toHaveBeenCalledWith('admins');

    const customer = build();
    const customerSocket = socket();
    await customer.gateway.handleConnection(customerSocket as never);
    expect(customerSocket.join).not.toHaveBeenCalledWith('admins');
  });

  it('pushes quote:requested to the admins and the errand room', () => {
    const { gateway, to, emit } = build();
    const event = {
      errandId: ERRAND_ID,
      reference: 'NT-10001',
      quoteId: 'q-1',
      status: ErrandStatus.QUOTED,
      quoteRequestedAt: '2026-10-09T10:00:00.000Z',
    };
    gateway.onQuoteRequested(event);
    expect(to).toHaveBeenCalledWith(['admins', `errand:${ERRAND_ID}`]);
    expect(emit).toHaveBeenCalledWith('quote:requested', event);
  });
});

describe('RealtimeGateway room re-check (row 65 follow-up)', () => {
  const member = (user: object | undefined) => ({
    data: { user },
    emit: vi.fn(),
    leave: vi.fn(),
  });

  it('removes sockets that lost access before pushing the status change', async () => {
    const { gateway, errands, roomSockets, emit, inRoom } = build();
    const customer = member({ userId: 'u-1', role: UserRole.CUSTOMER });
    const oldRunner = member({ userId: 'r-old', role: UserRole.RUNNER });
    roomSockets.push(customer, oldRunner);
    errands.getById.mockImplementation(((_id: string, viewer: { userId: string }) =>
      viewer.userId === 'r-old'
        ? Promise.reject(new ForbiddenException())
        : Promise.resolve({ id: ERRAND_ID })) as never);
    await gateway.onStatusChanged({
      errandId: ERRAND_ID,
      status: ErrandStatus.RUNNER_ASSIGNED,
      from: ErrandStatus.PAYMENT_CONFIRMED,
      actor: 'admin',
    });
    expect(inRoom).toHaveBeenCalledWith(`errand:${ERRAND_ID}`);
    expect(oldRunner.emit).toHaveBeenCalledWith('errand:access_revoked', { errandId: ERRAND_ID });
    expect(oldRunner.leave).toHaveBeenCalledWith(`errand:${ERRAND_ID}`);
    expect(customer.leave).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('errand:status_changed', expect.anything());
  });

  it('removes sockets without an authenticated user', async () => {
    const { gateway, roomSockets } = build();
    const anon = member(undefined);
    roomSockets.push(anon);
    expect(await gateway.revalidateRoom(ERRAND_ID)).toBe(1);
    expect(anon.leave).toHaveBeenCalled();
  });

  it('keeps sockets on a transient failure and never throws', async () => {
    const { gateway, errands, roomSockets } = build();
    const runner = member({ userId: 'r-1', role: UserRole.RUNNER });
    roomSockets.push(runner);
    errands.getById.mockRejectedValueOnce(new Error('db down'));
    await expect(gateway.revalidateRoom(ERRAND_ID)).resolves.toBe(0);
    expect(runner.leave).not.toHaveBeenCalled();
  });

  it('re-checks on errand.access_changed', async () => {
    const { gateway, inRoom } = build();
    await gateway.onAccessChanged({ errandId: ERRAND_ID });
    expect(inRoom).toHaveBeenCalledWith(`errand:${ERRAND_ID}`);
  });
});

describe('RealtimeGateway runner room (RA-5, row 139)', () => {
  const runnerUser = { id: 'r-1', role: UserRole.RUNNER, phone: '+254700000002', status: UserStatus.ACTIVE };

  it('joins runner:{profileId}:status on connect from the JWT user', async () => {
    const { gateway, runners } = build({ user: runnerUser });
    const client = socket();
    await gateway.handleConnection(client as never);
    expect(runners.profileByUserId).toHaveBeenCalledWith('r-1');
    expect(client.join).toHaveBeenCalledWith('runner:rp-1:status');
    expect((client.data as { runnerProfileId?: string }).runnerProfileId).toBe('rp-1');
  });

  it('keeps the connection without a room when the runner has no profile', async () => {
    const { gateway } = build({ user: runnerUser, profile: () => Promise.reject(new Error('none')) });
    const client = socket();
    await gateway.handleConnection(client as never);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalledWith(expect.stringMatching(/^runner:/));
  });

  it('never puts customers or admins in a runner room', async () => {
    const { gateway, runners } = build();
    await gateway.handleConnection(socket() as never);
    expect(runners.profileByUserId).not.toHaveBeenCalled();
  });

  it('pushes job:offered to the offered runner only', () => {
    const { gateway, to, emit } = build();
    gateway.onOfferMade({
      errandId: ERRAND_ID,
      assignmentId: 'as-1',
      runnerProfileId: 'rp-9',
      offerExpiresAt: '2026-10-19T10:10:00.000Z',
      offeredAt: '2026-10-19T10:00:00.000Z',
    });
    expect(to).toHaveBeenCalledWith('runner:rp-9:status');
    expect(emit).toHaveBeenCalledWith('job:offered', {
      errandId: ERRAND_ID,
      assignmentId: 'as-1',
      offerExpiresAt: '2026-10-19T10:10:00.000Z',
      offeredAt: '2026-10-19T10:00:00.000Z',
    });
  });

  it('pushes job:offer_withdrawn with the reason, without the runner id', () => {
    const { gateway, to, emit } = build();
    gateway.onOfferWithdrawn({ errandId: ERRAND_ID, assignmentId: 'as-1', runnerProfileId: 'rp-9', reason: 'expired', at: 'x' });
    expect(to).toHaveBeenCalledWith('runner:rp-9:status');
    expect(emit).toHaveBeenCalledWith('job:offer_withdrawn', { errandId: ERRAND_ID, assignmentId: 'as-1', reason: 'expired', at: 'x' });
  });

  it('pushes price_change:decided to the errand room and the current runner', async () => {
    const { gateway, to, emit } = build();
    const event = {
      errandId: ERRAND_ID,
      requestId: 'pc-1',
      status: 'approved' as const,
      outcome: 'approved' as const,
      fromPrice: '40000.00',
      toPrice: '45000.00',
      decidedAt: 'x',
    };
    await gateway.onPriceChangeDecided(event);
    expect(to).toHaveBeenCalledWith([`errand:${ERRAND_ID}`, 'runner:rp-1:status']);
    expect(emit).toHaveBeenCalledWith('price_change:decided', event);
  });

  it('still pushes price_change:decided to the errand room when the holder lookup fails', async () => {
    const { gateway, to } = build({ holder: () => Promise.reject(new Error('db')) });
    await gateway.onPriceChangeDecided({
      errandId: ERRAND_ID,
      requestId: 'pc-1',
      status: 'rejected',
      outcome: 'rejected',
      fromPrice: '1.00',
      toPrice: '2.00',
      decidedAt: 'x',
    });
    expect(to).toHaveBeenCalledWith([`errand:${ERRAND_ID}`]);
  });
});

describe('RealtimeGateway location:ping (RA-4)', () => {
  it('refuses an unauthenticated socket', async () => {
    const { gateway, location } = build();
    await expect(gateway.locationPing(socket() as never, { lat: 1, lng: 1 })).resolves.toEqual({
      ok: false,
      error: 'unauthenticated',
    });
    expect(location.ingest).not.toHaveBeenCalled();
  });

  it('hands the socket user and body to the intake and acks its result', async () => {
    const { gateway, location } = build();
    const client = socket();
    client.data.user = { userId: 'r-1', role: UserRole.RUNNER };
    const body = { lat: -1.28, lng: 36.82 };
    await expect(gateway.locationPing(client as never, body)).resolves.toEqual({ ok: true });
    expect(location.ingest).toHaveBeenCalledWith({ userId: 'r-1', role: UserRole.RUNNER }, body);
  });
});

describe('RealtimeGateway suspended accounts (issue #23)', () => {
  const SUSPENDED = { id: 'u-1', role: UserRole.CUSTOMER, phone: '+254700000000', status: UserStatus.SUSPENDED };

  it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
    'refuses the handshake of a %s account with connect_error account_suspended',
    async (status) => {
      const { gateway } = build({ user: { ...SUSPENDED, status } });
      const client = socket();
      const refusal = await gateway.checkHandshake(client as never);
      expect(refusal?.message).toBe('account_suspended');
      expect(refusal?.data).toEqual({
        statusCode: 401,
        code: 'account_suspended',
        message: 'Account is suspended or banned',
      });
      expect(client.data.user).toBeUndefined();
    },
  );

  it('the handshake middleware passes the refusal to next() and lets others through', async () => {
    const middlewares: ((s: unknown, next: (err?: Error) => void) => void)[] = [];
    const server = { use: vi.fn((fn: (typeof middlewares)[number]) => middlewares.push(fn)) };

    const suspended = build({ user: SUSPENDED });
    suspended.gateway.afterInit(server as never);
    const refused = await new Promise<Error | undefined>((res) => middlewares[0](socket(), res));
    expect(refused?.message).toBe('account_suspended');

    const active = build();
    active.gateway.afterInit(server as never);
    const client = socket();
    expect(await new Promise<Error | undefined>((res) => middlewares[1](client, res))).toBeUndefined();
    expect(client.data.user).toMatchObject({ userId: 'u-1', status: UserStatus.ACTIVE });

    // A bad token is not refused here: handleConnection disconnects it as before.
    const bad = build({ verify: () => Promise.reject(new Error('jwt')) });
    bad.gateway.afterInit(server as never);
    expect(await new Promise<Error | undefined>((res) => middlewares[2](socket(), res))).toBeUndefined();
  });

  it('does not check the token twice after the middleware ran', async () => {
    const { gateway, jwt } = build();
    const client = socket();
    await gateway.checkHandshake(client as never);
    await gateway.handleConnection(client as never);
    expect(jwt.verifyAsync).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('joins the internal user:{id} room on connect', async () => {
    const { gateway } = build();
    const client = socket();
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('user:u-1');
  });

  it('disconnects when the account was suspended between the handshake and joining user:{id}', async () => {
    const { gateway, access } = build();
    const client = socket();
    await gateway.checkHandshake(client as never);
    access.accessOf.mockResolvedValueOnce({ status: UserStatus.SUSPENDED, role: UserRole.CUSTOMER, phone: 'x' } as never);
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it.each([UserStatus.SUSPENDED, UserStatus.BANNED])(
    'disconnects every live socket of the user on user.status_changed to %s',
    (status) => {
      const { gateway, inRoom } = build();
      const disconnectSockets = vi.fn();
      inRoom.mockReturnValue({ disconnectSockets } as never);
      gateway.onUserStatusChanged({ userId: 'u-9', status, from: UserStatus.ACTIVE });
      expect(inRoom).toHaveBeenCalledWith('user:u-9');
      expect(disconnectSockets).toHaveBeenCalledWith(true);
    },
  );

  it('leaves sockets alone on reactivation and never throws', () => {
    const { gateway, inRoom } = build();
    gateway.onUserStatusChanged({ userId: 'u-9', status: UserStatus.ACTIVE, from: UserStatus.SUSPENDED });
    expect(inRoom).not.toHaveBeenCalled();
    inRoom.mockImplementation(() => {
      throw new Error('adapter down');
    });
    expect(() =>
      gateway.onUserStatusChanged({ userId: 'u-9', status: UserStatus.BANNED, from: UserStatus.ACTIVE }),
    ).not.toThrow();
  });
});

describe('RealtimeGateway merchant_details events per role (rows 42-44, 80; issue #28)', () => {
  const roomSocket = (role: UserRole) => ({ data: { user: { userId: `${role}-1`, role } }, emit: vi.fn() });
  const updated = {
    errandId: ERRAND_ID,
    merchantName: 'KPLC',
    tillNumber: null,
    paybillNumber: '888880',
    accountReference: 'ACC-1',
    changed: false,
    merchantDetailsUpdatedAt: null,
  };
  const changed = {
    errandId: ERRAND_ID,
    merchantName: 'Naivas',
    tillNumber: '654321',
    paybillNumber: null,
    accountReference: null,
    merchantDetailsUpdatedAt: '2026-10-09T10:00:00.000Z',
  };
  const noNumbers = { tillNumber: null, paybillNumber: null, accountReference: null };

  const setup = (feesPaid: boolean) => {
    const built = build({ feesPaid: () => Promise.resolve(feesPaid) });
    const customer = roomSocket(UserRole.CUSTOMER);
    const runner = roomSocket(UserRole.RUNNER);
    const admin = roomSocket(UserRole.ADMIN);
    built.roomSockets.push(customer, runner, admin);
    return { ...built, customer, runner, admin };
  };

  it.each([
    ['merchant_details:updated', 'onMerchantDetailsUpdated', updated],
    ['merchant_details:changed', 'onMerchantDetailsChanged', changed],
  ] as const)('%s before the fees are paid: no numbers for the customer, unchanged for runner and admin', async (name, handler, event) => {
    const { gateway, inRoom, errands, customer, runner, admin } = setup(false);
    await (gateway[handler] as (e: typeof event) => Promise<void>)(event);
    expect(inRoom).toHaveBeenCalledWith(`errand:${ERRAND_ID}`);
    expect(errands.merchantNumbersVisibleTo).toHaveBeenCalledWith(UserRole.CUSTOMER, ERRAND_ID);
    expect(customer.emit).toHaveBeenCalledWith(name, { ...event, ...noNumbers });
    expect(runner.emit).toHaveBeenCalledWith(name, event);
    expect(admin.emit).toHaveBeenCalledWith(name, event);
  });

  it.each([
    ['merchant_details:updated', 'onMerchantDetailsUpdated', updated],
    ['merchant_details:changed', 'onMerchantDetailsChanged', changed],
  ] as const)('%s after the fees are paid: every role gets the payload as before', async (name, handler, event) => {
    const { gateway, customer, runner, admin } = setup(true);
    await (gateway[handler] as (e: typeof event) => Promise<void>)(event);
    expect(customer.emit).toHaveBeenCalledWith(name, event);
    expect(runner.emit).toHaveBeenCalledWith(name, event);
    expect(admin.emit).toHaveBeenCalledWith(name, event);
  });

  it('withholds the numbers from the customer when the fee check fails', async () => {
    const built = build({ feesPaid: () => Promise.reject(new Error('db down')) });
    const customer = roomSocket(UserRole.CUSTOMER);
    built.roomSockets.push(customer);
    await built.gateway.onMerchantDetailsUpdated(updated);
    expect(customer.emit).toHaveBeenCalledWith('merchant_details:updated', { ...updated, ...noNumbers });
  });

  it('skips the fee check when no customer is in the room', async () => {
    const built = build();
    const runner = roomSocket(UserRole.RUNNER);
    built.roomSockets.push(runner);
    await built.gateway.onMerchantDetailsChanged(changed);
    expect(built.errands.merchantNumbersVisibleTo).not.toHaveBeenCalled();
    expect(runner.emit).toHaveBeenCalledWith('merchant_details:changed', changed);
  });
});
