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
} = {}) => {
  const jwt = {
    verifyAsync: vi.fn(opts.verify ?? (() => Promise.resolve({ sub: 'u-1', type: 'access' }))),
  };
  const config = { get: vi.fn(() => 'secret') };
  const users = {
    findById: vi.fn(() =>
      Promise.resolve(
        opts.user === undefined
          ? { id: 'u-1', role: UserRole.CUSTOMER, phone: '+254700000000', status: UserStatus.ACTIVE }
          : opts.user,
      ),
    ),
  };
  const errands = { getById: vi.fn(opts.getById ?? (() => Promise.resolve({ id: ERRAND_ID }))) };
  const gateway = new RealtimeGateway(jwt as never, config as never, users as never, errands as never);
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  gateway.server = { to } as never;
  return { gateway, jwt, users, errands, to, emit };
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
  it('forwards status changes to the errand room', () => {
    const { gateway, to, emit } = build();
    gateway.onStatusChanged({
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

  it('forwards quote re-issues and merchant details (N-4, rows 42-44)', () => {
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
    const merchant = {
      errandId: ERRAND_ID,
      merchantName: 'Naivas',
      tillNumber: '123456',
      paybillNumber: null,
      accountReference: null,
    };
    gateway.onMerchantDetailsUpdated(merchant);
    expect(emit).toHaveBeenCalledWith('merchant_details:updated', merchant);
  });

  it('emits location:update with the §4.2 payload', () => {
    const { gateway, emit } = build();
    const payload = { errandId: ERRAND_ID, lat: -4.04, lng: 39.67, eta: 300, ts: 'x' };
    gateway.emitLocationUpdate(payload);
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
    expect(customerSocket.join).not.toHaveBeenCalled();
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
