import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { AdminRealtimeService } from './admin-realtime.service';
import {
  ADMIN_REALTIME_BACKOFF,
  ADMIN_REALTIME_URL,
  ADMIN_SOCKET_FACTORY,
  AdminSocketOptions,
  defaultBackoff,
  isSuspendedConnectError,
  originFor,
} from './admin-realtime.tokens';
import { AdminRealtimeParsers } from './admin-realtime.events';
import type { AdminRealtimeState } from './admin-realtime.events';
import type { AuthTokens } from '../api-types';

/** Fake socket: records handlers, `fire` plays a server event. */
class FakeSocket {
  readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  disconnected = 0;
  constructor(
    readonly url: string,
    readonly options: AdminSocketOptions,
  ) {}
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }
  disconnect(): void {
    this.disconnected++;
  }
  fire(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }
}

const AT = '2026-10-29T11:03:00.000Z';

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('AdminRealtimeService (#36, spec §8)', () => {
  let sockets: FakeSocket[];
  let tokens: ReturnType<typeof signal<AuthTokens | null>>;
  let expiring: boolean;
  let refresh: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;
  let delays: number[];

  function setup(): AdminRealtimeService {
    sockets = [];
    delays = [];
    expiring = false;
    tokens = signal<AuthTokens | null>({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    } as AuthTokens);
    let rotation = 1;
    refresh = vi.fn(() => {
      rotation++;
      tokens.set({
        accessToken: `access-${rotation}`,
        refreshToken: `refresh-${rotation}`,
      } as AuthTokens);
      expiring = false;
      return of({ tokens: tokens() });
    });
    logout = vi.fn(() => tokens.set(null));
    const store = {
      state: computed(() => ({ tokens: tokens() })),
      isAuthenticated: computed(() => !!tokens()?.accessToken),
      isExpiringSoon: () => expiring,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: store },
        { provide: AuthService, useValue: { refresh, logout } },
        { provide: ADMIN_REALTIME_URL, useValue: 'http://api.test' },
        {
          provide: ADMIN_REALTIME_BACKOFF,
          useValue: (attempt: number) => {
            delays.push(attempt);
            return 1000;
          },
        },
        {
          provide: ADMIN_SOCKET_FACTORY,
          useValue: async (url: string, options: AdminSocketOptions) => {
            const s = new FakeSocket(url, options);
            sockets.push(s);
            return s;
          },
        },
      ],
    });
    return TestBed.inject(AdminRealtimeService);
  }

  afterEach(() => vi.useRealTimers());

  it('connects with the AuthStore token, websocket only, path /socket.io and no client field', async () => {
    const rt = setup();
    expect(rt.state()).toBe('disconnected');
    const done = rt.connect();
    expect(rt.state()).toBe('connecting');
    await done;
    expect(sockets).toHaveLength(1);
    const s = sockets[0];
    expect(s.url).toBe('http://api.test');
    expect(s.options.path).toBe('/socket.io');
    expect(s.options.transports).toEqual(['websocket']);
    expect(s.options.reconnection).toBe(false);
    expect(s.options.auth).toEqual({ token: 'access-1' });
    expect('client' in s.options.auth).toBe(false);
    s.fire('connect');
    expect(rt.state()).toBe('connected');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rotates the token first when it is about to expire', async () => {
    const rt = setup();
    expiring = true;
    await rt.connect();
    expect(refresh).toHaveBeenCalledWith('refresh-1');
    expect(sockets[0].options.auth.token).toBe('access-2');
  });

  it('keeps the current token when the rotation fails', async () => {
    const rt = setup();
    expiring = true;
    refresh.mockImplementationOnce(() => throwError(() => new Error('offline')));
    await rt.connect();
    expect(sockets[0].options.auth.token).toBe('access-1');
  });

  it('retries with the injected backoff after a drop, with a fresh token per attempt', async () => {
    vi.useFakeTimers();
    const rt = setup();
    await rt.connect();
    sockets[0].fire('connect');
    const states: AdminRealtimeState[] = [];
    rt.stateChanges$.subscribe((s) => states.push(s));

    sockets[0].fire('disconnect', 'transport close');
    expect(rt.state()).toBe('reconnecting');
    expect(sockets[0].disconnected).toBe(1);
    expect(delays).toEqual([1]);

    // The token rotated while the socket was down: the new attempt uses it.
    tokens.set({ accessToken: 'access-9', refreshToken: 'refresh-9' } as AuthTokens);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(sockets).toHaveLength(2);
    expect(sockets[1].options.auth.token).toBe('access-9');

    // A refused handshake retries again, with the next attempt number.
    sockets[1].fire('connect_error', new Error('jwt expired'));
    expect(delays).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    sockets[2].fire('connect');
    expect(rt.state()).toBe('connected');
    expect(states).toEqual(['reconnecting', 'connected']);
  });

  it('treats account_suspended as final and logs out once', async () => {
    vi.useFakeTimers();
    const rt = setup();
    await rt.connect();
    sockets[0].fire('connect_error', { message: 'account_suspended' });
    expect(rt.state()).toBe('disconnected');
    expect(logout).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(sockets).toHaveLength(1);
    sockets[0].fire('connect_error', { message: 'account_suspended' });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('exposes connected, reconnecting and disconnected states', async () => {
    vi.useFakeTimers();
    const rt = setup();
    await rt.connect();
    sockets[0].fire('connect');
    expect(rt.state()).toBe('connected');
    sockets[0].fire('disconnect');
    expect(rt.state()).toBe('reconnecting');
    rt.disconnect();
    expect(rt.state()).toBe('disconnected');
  });

  it('stays disconnected without a session', async () => {
    const rt = setup();
    tokens.set(null);
    await rt.connect();
    expect(sockets).toHaveLength(0);
    expect(rt.state()).toBe('disconnected');
  });

  it('streams the three presence events and drops malformed payloads', async () => {
    const rt = setup();
    await rt.connect();
    const s = sockets[0];
    s.fire('connect');
    const got: unknown[] = [];
    rt.webPingsStopped$.subscribe((e) => got.push(['stopped', e]));
    rt.webPingsResumed$.subscribe((e) => got.push(['resumed', e]));
    rt.webAutoOffline$.subscribe((e) => got.push(['offline', e]));

    for (const event of [
      'runner:web_pings_stopped',
      'runner:web_pings_resumed',
      'runner:web_auto_offline',
    ]) {
      s.fire(event, null);
      s.fire(event, 'x');
      s.fire(event, { at: AT });
      s.fire(event, { runnerProfileId: '  ', at: AT });
      s.fire(event, { runnerProfileId: 'r-1', at: 'yesterday' });
      s.fire(event, { runnerProfileId: 'r-1' });
    }
    s.fire('runner:web_pings_stopped', { runnerProfileId: 'r-1', lastPingAt: 'soon', at: AT });
    s.fire('runner:web_auto_offline', { runnerProfileId: 'r-1', lastPingAt: 5, at: AT });
    expect(got).toEqual([]);

    s.fire('runner:web_pings_stopped', { runnerProfileId: 'r-1', lastPingAt: null, at: AT });
    s.fire('runner:web_pings_resumed', { runnerProfileId: 'r-1', at: AT });
    s.fire('runner:web_auto_offline', { runnerProfileId: 'r-1', lastPingAt: AT, at: AT });
    expect(got).toEqual([
      ['stopped', { runnerProfileId: 'r-1', lastPingAt: null, at: AT }],
      ['resumed', { runnerProfileId: 'r-1', at: AT }],
      ['offline', { runnerProfileId: 'r-1', lastPingAt: AT, at: AT }],
    ]);
  });

  it('stops on logout', async () => {
    vi.useFakeTimers();
    const rt = setup();
    await rt.connect();
    sockets[0].fire('connect');
    tokens.set(null);
    TestBed.tick();
    expect(rt.state()).toBe('disconnected');
    expect(sockets[0].disconnected).toBe(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(sockets).toHaveLength(1);
  });

  it('stops on destroy', async () => {
    const rt = setup();
    await rt.connect();
    sockets[0].fire('connect');
    TestBed.resetTestingModule();
    expect(rt.state()).toBe('disconnected');
    expect(sockets[0].disconnected).toBe(1);
  });

  it('drops a socket that resolves after disconnect()', async () => {
    const rt = setup();
    const pending = rt.connect();
    rt.disconnect();
    await pending;
    expect(sockets.every((s) => s.disconnected === 1)).toBe(true);
    expect(rt.state()).toBe('disconnected');
  });
});

describe('admin realtime helpers', () => {
  it('backs off 1 s, 2 s, 4 s … capped at 30 s with ±20% jitter', () => {
    expect(defaultBackoff(1, () => 0.5)).toBe(1000);
    expect(defaultBackoff(3, () => 0.5)).toBe(4000);
    expect(defaultBackoff(10, () => 0.5)).toBe(30000);
    expect(defaultBackoff(1, () => 0)).toBe(800);
    expect(defaultBackoff(1, () => 1)).toBe(1200);
  });

  it('uses the API origin without a path', () => {
    expect(originFor('http://localhost:3000')).toBe('http://localhost:3000');
    expect(originFor('https://api.nitume.co.ke/base')).toBe('https://api.nitume.co.ke');
  });

  it('recognises a suspended account handshake', () => {
    expect(isSuspendedConnectError({ message: 'account_suspended' })).toBe(true);
    expect(isSuspendedConnectError({ message: 'x', data: { code: 'account_suspended' } })).toBe(
      true,
    );
    expect(isSuspendedConnectError(new Error('jwt expired'))).toBe(false);
    expect(isSuspendedConnectError(null)).toBe(false);
  });

  it('parses offsets and fractional seconds', () => {
    expect(
      AdminRealtimeParsers.webPingsResumed({
        runnerProfileId: 'r',
        at: '2026-10-29T14:03:00+03:00',
      }).at,
    ).toBe('2026-10-29T14:03:00+03:00');
  });
});
