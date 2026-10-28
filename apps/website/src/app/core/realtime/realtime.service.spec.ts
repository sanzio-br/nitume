import { TestBed } from '@angular/core/testing';
import { RECONNECTING_COPY, RealtimeService } from './realtime.service';
import {
  REALTIME_BACKOFF,
  REALTIME_TOKEN_PROVIDER,
  RealtimeSocketOptions,
  SOCKET_IO_FACTORY,
  defaultBackoff,
  originFor,
} from './realtime.tokens';

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  readonly handlers = new Map<string, Handler[]>();
  readonly emitted: { event: string; args: unknown[] }[] = [];
  disconnected = false;

  constructor(
    readonly url: string,
    readonly options: RealtimeSocketOptions,
  ) {}

  on(event: string, handler: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }

  disconnect(): this {
    this.disconnected = true;
    return this;
  }

  /** Server side: deliver an event to the client handlers. */
  fire(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }

  sent(event: string) {
    return this.emitted.filter((e) => e.event === event);
  }

  /** Answer the n-th emit of `event` with `ack`. */
  ack(event: string, ack: unknown, n = -1): void {
    const list = this.sent(event);
    const call = list.at(n);
    const cb = call?.args.at(-1);
    if (typeof cb !== 'function') throw new Error(`no ack callback for ${event}`);
    (cb as Handler)(ack);
  }
}

interface Harness {
  service: RealtimeService;
  sockets: FakeSocket[];
  provider: ReturnType<typeof vi.fn>;
  backoff: ReturnType<typeof vi.fn>;
  last: () => FakeSocket;
}

function setup(tokens: (string | null)[] = ['t1', 't2', 't3', 't4', 't5'], delay = 1000): Harness {
  const sockets: FakeSocket[] = [];
  let i = 0;
  const provider = vi.fn(() => Promise.resolve(tokens[Math.min(i++, tokens.length - 1)]));
  const backoff = vi.fn((_attempt: number) => delay);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SOCKET_IO_FACTORY,
        useValue: (url: string, options: RealtimeSocketOptions) => {
          const s = new FakeSocket(url, options);
          sockets.push(s);
          return s;
        },
      },
      { provide: REALTIME_TOKEN_PROVIDER, useValue: provider },
      { provide: REALTIME_BACKOFF, useValue: backoff },
    ],
  });
  const service = TestBed.inject(RealtimeService);
  return { service, sockets, provider, backoff, last: () => sockets[sockets.length - 1] };
}

async function connected(h: Harness): Promise<FakeSocket> {
  await h.service.connect();
  h.last().fire('connect');
  return h.last();
}

describe('RealtimeService (§12.10)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
  });

  it('45. connect() opens a socket to the API origin with the handshake options and goes connecting → connected', async () => {
    expect(originFor('https://api.nitume.co.ke/api/v1')).toBe('https://api.nitume.co.ke');
    expect(originFor('http://localhost:3000')).toBe('http://localhost:3000');
    const h = setup(['access-1']);
    expect(h.service.state()).toBe('disconnected');
    const pending = h.service.connect();
    expect(h.service.state()).toBe('connecting');
    await pending;
    expect(h.sockets).toHaveLength(1);
    const s = h.last();
    expect(s.url).toBe('http://localhost:3000');
    expect(s.options).toEqual({
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: 'access-1' },
      reconnection: false,
      autoConnect: true,
    });
    expect(h.service.state()).toBe('connecting');
    s.fire('connect');
    expect(h.service.state()).toBe('connected');
  });

  it('46. auth refused (server disconnect) → reconnecting, retry after the backoff with a fresh token', async () => {
    const h = setup(['old', 'fresh']);
    const first = await connected(h);
    first.fire('disconnect', 'io server disconnect');
    expect(h.service.state()).toBe('reconnecting');
    expect(first.disconnected).toBe(true);
    expect(h.backoff).toHaveBeenCalledWith(1);
    expect(h.sockets).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(h.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.sockets).toHaveLength(2);
    expect(h.last().options.auth).toEqual({ token: 'fresh' });
    h.last().fire('connect');
    expect(h.service.state()).toBe('connected');

    // connect_error is handled the same way, and the attempt counter grows.
    h.last().fire('connect_error', new Error('refused'));
    expect(h.service.state()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    h.last().fire('connect_error', new Error('refused'));
    expect(h.backoff.mock.calls.map((c) => c[0])).toEqual([1, 1, 2]);
  });

  it('47. backoff 1 s, 2 s, 4 s … capped at 30 s with jitter within ±20%', () => {
    const mid = () => 0.5; // jitter factor 1.0
    expect([1, 2, 3, 4, 5, 6, 7, 10].map((n) => defaultBackoff(n, mid))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
    expect(defaultBackoff(1, () => 0)).toBe(800);
    expect(defaultBackoff(1, () => 0.999999)).toBe(1200);
    expect(defaultBackoff(6, () => 0)).toBe(24000);
    expect(defaultBackoff(6, () => 0.999999)).toBe(36000);
    // Seeded pseudo-random: every value stays inside ±20% of its base.
    let seed = 42;
    const seeded = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let n = 1; n <= 12; n++) {
      const base = Math.min(30000, 1000 * 2 ** (n - 1));
      const value = defaultBackoff(n, seeded);
      expect(value).toBeGreaterThanOrEqual(base * 0.8);
      expect(value).toBeLessThanOrEqual(base * 1.2);
    }
  });

  it('48. a null token during a retry → disconnected with no further attempts; the #5 stub provider never opens a socket', async () => {
    const h = setup(['t1', null]);
    const s = await connected(h);
    s.fire('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.service.state()).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(120000);
    expect(h.sockets).toHaveLength(1);
    expect(h.provider).toHaveBeenCalledTimes(2);

    // Default REALTIME_TOKEN_PROVIDER (stub until #6) returns null.
    TestBed.resetTestingModule();
    const opened: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [{ provide: SOCKET_IO_FACTORY, useValue: (...args: unknown[]) => opened.push(args) }],
    });
    const stubbed = TestBed.inject(RealtimeService);
    await expect(TestBed.inject(REALTIME_TOKEN_PROVIDER)()).resolves.toBeNull();
    await stubbed.connect();
    expect(stubbed.state()).toBe('disconnected');
    expect(opened).toHaveLength(0);
  });

  it('49. rooms joined before a drop are re-joined after reconnect; a room whose ack is not ok is forgotten', async () => {
    const h = setup();
    const first = await connected(h);
    const a = h.service.joinErrand('errand-a');
    first.ack('errand:join', { ok: true, room: 'errand:errand-a' });
    await expect(a).resolves.toBe(true);
    const b = h.service.joinErrand('errand-b');
    first.ack('errand:join', { ok: true, room: 'errand:errand-b' });
    await expect(b).resolves.toBe(true);

    first.fire('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(1000);
    const second = h.last();
    expect(second).not.toBe(first);
    second.fire('connect');
    const joins = second.sent('errand:join');
    expect(joins.map((j) => j.args[0])).toEqual([{ errandId: 'errand-a' }, { errandId: 'errand-b' }]);
    second.ack('errand:join', { ok: true }, 0);
    second.ack('errand:join', { ok: false, error: 'forbidden' }, 1);
    await vi.advanceTimersByTimeAsync(0);
    expect([...h.service.joinedErrands()]).toEqual(['errand-a']);
  });

  it('50. joinErrand resolves ack.ok, false after the 10 s ack timeout; leaveErrand emits errand:leave and removes the room', async () => {
    const h = setup();
    const s = await connected(h);
    const ok = h.service.joinErrand('e1');
    expect(s.sent('errand:join')[0].args[0]).toEqual({ errandId: 'e1' });
    s.ack('errand:join', { ok: true, room: 'errand:e1' });
    await expect(ok).resolves.toBe(true);

    const refused = h.service.joinErrand('e2');
    s.ack('errand:join', { ok: false, error: 'invalid_errand_id' });
    await expect(refused).resolves.toBe(false);
    expect(h.service.joinedErrands().has('e2')).toBe(false);

    let settled: boolean | null = null;
    void h.service.joinErrand('e3').then((v) => (settled = v));
    await vi.advanceTimersByTimeAsync(9999);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);
    expect(h.service.joinedErrands().has('e3')).toBe(true); // kept for re-join

    h.service.leaveErrand('e1');
    expect(s.sent('errand:leave').map((e) => e.args[0])).toEqual([{ errandId: 'e1' }]);
    expect(h.service.joinedErrands().has('e1')).toBe(false);

    // Not connected: false at once, room kept.
    h.service.disconnect();
    await expect(h.service.joinErrand('e4')).resolves.toBe(false);
    expect(h.service.joinedErrands().has('e4')).toBe(true);
  });

  it('51. fan-out: each of the 13 server events is parsed onto its own stream; two subscribers both receive it', async () => {
    const h = setup();
    const s = await connected(h);
    const svc = h.service;
    const at = '2026-10-28T07:28:00.000Z';
    const cases: { event: string; stream: keyof RealtimeService; payload: object; expected: object }[] = [
      {
        event: 'location:update',
        stream: 'locationUpdates$',
        payload: { errandId: 'e', lat: -1.29, lng: 36.82, eta: 719.6, accuracy: 8, ts: at },
        expected: { errandId: 'e', lat: -1.29, lng: 36.82, eta: 720, accuracy: 8, ts: new Date(at) },
      },
      {
        event: 'errand:status_changed',
        stream: 'statusChanges$',
        payload: { errandId: 'e', status: 'RUNNER_EN_ROUTE', from: 'RUNNER_ASSIGNED', at },
        expected: { errandId: 'e', status: 'RUNNER_EN_ROUTE', from: 'RUNNER_ASSIGNED', at: new Date(at) },
      },
      {
        event: 'evidence:uploaded',
        stream: 'evidenceUploads$',
        payload: { errandId: 'e', evidenceId: 'v1', type: 'photo', capturedAt: at },
        expected: { errandId: 'e', evidenceId: 'v1', type: 'photo', capturedAt: new Date(at) },
      },
      {
        event: 'price_change:requested',
        stream: 'priceChangeRequests$',
        payload: { errandId: 'e', requestId: 'r', fromPrice: '2200.00', toPrice: '2500.00', reason: 'Price went up', createdAt: at },
        expected: { errandId: 'e', requestId: 'r', fromPrice: '2200.00', toPrice: '2500.00', reason: 'Price went up', createdAt: new Date(at) },
      },
      {
        event: 'quote:reissued',
        stream: 'quoteReissues$',
        payload: { errandId: 'e', quoteId: 'q', total: '1800.00', currency: 'KES', expiresAt: at, status: 'QUOTED', acceptanceRequired: true },
        expected: { errandId: 'e', quoteId: 'q', total: '1800.00', currency: 'KES', expiresAt: new Date(at), status: 'QUOTED', acceptanceRequired: true },
      },
      {
        event: 'merchant_details:updated',
        stream: 'merchantDetailsUpdates$',
        payload: { errandId: 'e', merchantName: 'Naivas', tillNumber: '123456', paybillNumber: ' ', accountReference: null },
        expected: { errandId: 'e', merchantName: 'Naivas', tillNumber: '123456', paybillNumber: null, accountReference: null },
      },
      {
        event: 'merchant_details:changed',
        stream: 'merchantDetailsChanges$',
        payload: { errandId: 'e', merchantName: 'Naivas', tillNumber: null, paybillNumber: '400200', accountReference: 'NT-1', merchantDetailsUpdatedAt: at },
        expected: { errandId: 'e', merchantName: 'Naivas', tillNumber: null, paybillNumber: '400200', accountReference: 'NT-1', merchantDetailsUpdatedAt: new Date(at) },
      },
      {
        event: 'quote:requested',
        stream: 'quoteRequests$',
        payload: { errandId: 'e', reference: 'NT-10482', quoteId: 'q', status: 'REQUESTED', quoteRequestedAt: at },
        expected: { errandId: 'e', reference: 'NT-10482', quoteId: 'q', status: 'REQUESTED', quoteRequestedAt: new Date(at) },
      },
      {
        event: 'errand:access_revoked',
        stream: 'accessRevocations$',
        payload: { errandId: 'e' },
        expected: { errandId: 'e' },
      },
      {
        event: 'job:offered',
        stream: 'jobOffers$',
        payload: { errandId: 'e', assignmentId: 'a', offerExpiresAt: null, offeredAt: at },
        expected: { errandId: 'e', assignmentId: 'a', offerExpiresAt: null, offeredAt: new Date(at) },
      },
      {
        event: 'job:offer_withdrawn',
        stream: 'jobOfferWithdrawals$',
        payload: { errandId: 'e', assignmentId: 'a', reason: 'expired', at },
        expected: { errandId: 'e', assignmentId: 'a', reason: 'expired', at: new Date(at) },
      },
      {
        event: 'price_change:decided',
        stream: 'priceChangeDecisions$',
        payload: { errandId: 'e', requestId: 'r', status: 'approved', outcome: 'approved', fromPrice: 2200, toPrice: '2500.00', decidedAt: at },
        expected: { errandId: 'e', requestId: 'r', status: 'approved', outcome: 'approved', fromPrice: '2200', toPrice: '2500.00', decidedAt: new Date(at) },
      },
      {
        event: 'price_change:difference_paid',
        stream: 'priceDifferencePayments$',
        payload: { errandId: 'e', requestId: 'r', amount: '300.00', paidAt: at },
        expected: { errandId: 'e', requestId: 'r', amount: '300.00', paidAt: new Date(at) },
      },
    ];
    expect(cases).toHaveLength(13);

    for (const c of cases) {
      const stream = svc[c.stream] as unknown as import('rxjs').Observable<unknown>;
      const one: unknown[] = [];
      const two: unknown[] = [];
      const subs = [stream.subscribe((v) => one.push(v)), stream.subscribe((v) => two.push(v))];
      s.fire(c.event, c.payload);
      expect.soft(one, c.event).toEqual([c.expected]);
      expect.soft(two, c.event).toEqual([c.expected]);
      // Hot, no replay: a late subscriber gets nothing.
      const late: unknown[] = [];
      subs.push(stream.subscribe((v) => late.push(v)));
      expect.soft(late, `${c.event} late`).toEqual([]);
      subs.forEach((sub) => sub.unsubscribe());
    }
  });

  it('52. malformed payloads (missing errandId, bad status, non-object) are dropped without throwing', async () => {
    const h = setup();
    const s = await connected(h);
    const statuses: unknown[] = [];
    const locations: unknown[] = [];
    const evidence: unknown[] = [];
    h.service.statusChanges$.subscribe((v) => statuses.push(v));
    h.service.locationUpdates$.subscribe((v) => locations.push(v));
    h.service.evidenceUploads$.subscribe((v) => evidence.push(v));

    expect(() => {
      s.fire('errand:status_changed', { status: 'ARRIVED' });
      s.fire('errand:status_changed', { errandId: 'e', status: 'ON_HOLD' });
      s.fire('errand:status_changed', { errandId: 'e', status: 'ARRIVED', from: 'NOPE' });
      s.fire('errand:status_changed', 'ARRIVED');
      s.fire('errand:status_changed', null);
      s.fire('errand:status_changed', ['e', 'ARRIVED']);
      s.fire('location:update', { errandId: 'e', lat: 'x', lng: 1 });
      s.fire('location:update', 42);
      s.fire('evidence:uploaded', { errandId: 'e', evidenceId: 'v', type: 'hologram' });
    }).not.toThrow();
    expect(statuses).toEqual([]);
    expect(locations).toEqual([]);
    expect(evidence).toEqual([]);

    // The stream still works after drops.
    s.fire('errand:status_changed', { errandId: 'e', status: 'ARRIVED', from: null });
    expect(statuses).toHaveLength(1);
  });

  it('53. errand:access_revoked removes the errand from the re-join set before emitting', async () => {
    const h = setup();
    const s = await connected(h);
    const join = h.service.joinErrand('e1');
    s.ack('errand:join', { ok: true });
    await join;
    let roomsAtEmit: string[] | null = null;
    h.service.accessRevocations$.subscribe(() => (roomsAtEmit = [...h.service.joinedErrands()]));
    s.fire('errand:access_revoked', { errandId: 'e1' });
    expect(roomsAtEmit).toEqual([]);

    s.fire('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(1000);
    h.last().fire('connect');
    expect(h.last().sent('errand:join')).toEqual([]);
  });

  it('54. sendLocationPing emits location:ping and resolves the parsed ack; forbidden/not_live flagged; offline or no ack → not sent', async () => {
    const h = setup();
    await expect(h.service.sendLocationPing({ lat: 1, lng: 2 })).resolves.toEqual({
      ok: false,
      sent: false,
      error: null,
      status: null,
      stopJobPings: false,
    });

    const s = await connected(h);
    const ts = new Date('2026-10-28T07:28:00Z');
    const ping = h.service.sendLocationPing({ lat: -1.29, lng: 36.82, errandId: 'e', accuracy: 5, ts });
    expect(s.sent('location:ping')[0].args[0]).toEqual({
      lat: -1.29,
      lng: 36.82,
      errandId: 'e',
      accuracy: 5,
      ts: '2026-10-28T07:28:00.000Z',
    });
    s.ack('location:ping', { ok: true, status: 'IN_PROGRESS' });
    await expect(ping).resolves.toEqual({
      ok: true,
      sent: true,
      error: null,
      status: 'IN_PROGRESS',
      stopJobPings: false,
    });

    for (const [error, stop] of [
      ['not_live', true],
      ['forbidden', true],
      ['rate_limited', false],
      ['something_new', false],
    ] as const) {
      const p = h.service.sendLocationPing({ lat: 0, lng: 0 });
      s.ack('location:ping', { ok: false, error });
      const ack = await p;
      expect.soft(ack.stopJobPings, error).toBe(stop);
      expect.soft(ack.error, error).toBe(error === 'something_new' ? 'unknown' : error);
      expect.soft(ack.sent, error).toBe(true);
    }

    const silent = h.service.sendLocationPing({ lat: 0, lng: 0 });
    await vi.advanceTimersByTimeAsync(10000);
    await expect(silent).resolves.toMatchObject({ ok: false, sent: false });
  });

  it('55. events from a stale socket (after a reconnect) are ignored', async () => {
    const h = setup();
    const old = await connected(h);
    old.fire('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(1000);
    const fresh = h.last();
    fresh.fire('connect');
    const locations: unknown[] = [];
    h.service.locationUpdates$.subscribe((v) => locations.push(v));

    old.fire('location:update', { errandId: 'e', lat: 1, lng: 2, eta: null, ts: null });
    old.fire('disconnect', 'transport close');
    old.fire('connect_error', new Error('late'));
    expect(locations).toEqual([]);
    expect(h.service.state()).toBe('connected');
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.sockets).toHaveLength(2);

    fresh.fire('location:update', { errandId: 'e', lat: 1, lng: 2, eta: null, ts: null });
    expect(locations).toHaveLength(1);
  });

  it('56. disconnect() stops retries, clears rooms and ends disconnected', async () => {
    const h = setup();
    const s = await connected(h);
    void h.service.joinErrand('e1');
    s.ack('errand:join', { ok: true });
    s.fire('disconnect', 'transport close');
    expect(h.service.state()).toBe('reconnecting');
    h.service.disconnect();
    expect(h.service.state()).toBe('disconnected');
    expect(h.service.joinedErrands().size).toBe(0);
    await vi.advanceTimersByTimeAsync(120000);
    expect(h.sockets).toHaveLength(1);
    expect(h.provider).toHaveBeenCalledTimes(1);

    // While connected: the socket is closed.
    const again = await connected(h);
    h.service.disconnect();
    expect(again.disconnected).toBe(true);
    expect(h.service.state()).toBe('disconnected');
  });

  it('57. window online while reconnecting triggers an immediate retry', async () => {
    const h = setup(['t1', 't2', 't3'], 30000);
    const s = await connected(h);
    window.dispatchEvent(new Event('online')); // connected: nothing happens
    expect(h.sockets).toHaveLength(1);
    s.fire('disconnect', 'transport close');
    expect(h.service.state()).toBe('reconnecting');
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sockets).toHaveLength(2);
    expect(h.last().options.auth).toEqual({ token: 't2' });
    // The cancelled backoff timer does not open another socket.
    await vi.advanceTimersByTimeAsync(30000);
    expect(h.sockets).toHaveLength(2);
    expect(h.backoff).toHaveBeenCalledTimes(1);
  });

  it('58. showReconnecting(5000) turns true only after 5 s non-connected and false again on connected', async () => {
    const h = setup();
    await connected(h);
    const visible = h.service.showReconnecting(5000);
    expect(visible()).toBe(false);

    h.last().fire('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(999); // still waiting for the backoff
    expect(visible()).toBe(false);
    await vi.advanceTimersByTimeAsync(1); // new socket, state reconnecting… connecting
    await vi.advanceTimersByTimeAsync(3999);
    expect(visible()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(visible()).toBe(true);

    h.last().fire('connect');
    expect(visible()).toBe(false);

    // A short blip (under 5 s) never shows it.
    h.last().fire('disconnect', 'transport close');
    await vi.advanceTimersByTimeAsync(1000);
    h.last().fire('connect');
    await vi.advanceTimersByTimeAsync(10000);
    expect(visible()).toBe(false);
    expect('Reconnecting…').toHaveLength(13);
  });
});
