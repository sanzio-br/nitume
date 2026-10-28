// Issue #6 change to the #5 RealtimeService (auth-foundation §5 item 8,
// F9.55): a handshake refused with `account_suspended` is final.
import { TestBed } from '@angular/core/testing';
import { RealtimeService } from './realtime.service';
import {
  REALTIME_ACCOUNT_SUSPENDED,
  REALTIME_BACKOFF,
  REALTIME_TOKEN_PROVIDER,
  RealtimeSocketOptions,
  SOCKET_IO_FACTORY,
} from './realtime.tokens';

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  readonly handlers = new Map<string, Handler[]>();
  disconnected = false;
  constructor(readonly options: RealtimeSocketOptions) {}
  on(event: string, handler: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  emit(): this {
    return this;
  }
  disconnect(): this {
    this.disconnected = true;
    return this;
  }
  fire(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }
}

function setup(withHandler = true) {
  const sockets: FakeSocket[] = [];
  const suspended = vi.fn();
  const provider = vi.fn(() => Promise.resolve('token'));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SOCKET_IO_FACTORY,
        useValue: (_url: string, options: RealtimeSocketOptions) => {
          const s = new FakeSocket(options);
          sockets.push(s);
          return s;
        },
      },
      { provide: REALTIME_TOKEN_PROVIDER, useValue: provider },
      { provide: REALTIME_BACKOFF, useValue: () => 1000 },
      ...(withHandler ? [{ provide: REALTIME_ACCOUNT_SUSPENDED, useValue: suspended }] : []),
    ],
  });
  const service = TestBed.inject(RealtimeService);
  return { service, sockets, suspended, provider, last: () => sockets[sockets.length - 1] };
}

describe('RealtimeService account_suspended (#6)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("F9.55. connect_error with message 'account_suspended' → no retry, disconnected, rooms cleared, handler once", async () => {
    const h = setup();
    await h.service.connect();
    void h.service.joinErrand('e-1');
    const s = h.last();
    s.fire('connect_error', Object.assign(new Error('account_suspended'), {
      data: { statusCode: 401, code: 'account_suspended', message: 'Account suspended' },
    }));
    expect(h.service.state()).toBe('disconnected');
    expect(h.service.joinedErrands().size).toBe(0);
    expect(s.disconnected).toBe(true);
    expect(h.suspended).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.sockets).toHaveLength(1);
    expect(h.provider).toHaveBeenCalledTimes(1);
    expect(h.suspended).toHaveBeenCalledTimes(1);
  });

  it("F9.55 (data.code). connect_error with data.code 'account_suspended' (other message) is final too", async () => {
    const h = setup();
    await h.service.connect();
    h.last().fire('connect_error', { message: 'Unauthorized', data: { code: 'account_suspended' } });
    expect(h.service.state()).toBe('disconnected');
    expect(h.suspended).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.sockets).toHaveLength(1);
  });

  it('F9.55 (other errors). any other connect_error still retries with the backoff; disconnect keeps the retry', async () => {
    const h = setup();
    await h.service.connect();
    h.last().fire('connect_error', new Error('xhr poll error'));
    expect(h.service.state()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets).toHaveLength(2);
    h.last().fire('connect_error', { message: 'unauthorized', data: { code: 'token_invalid' } });
    expect(h.service.state()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets).toHaveLength(3);
    h.last().fire('connect');
    h.last().fire('disconnect', 'io server disconnect');
    expect(h.service.state()).toBe('reconnecting');
    expect(h.suspended).not.toHaveBeenCalled();
  });

  it('the default REALTIME_ACCOUNT_SUSPENDED is a no-op', async () => {
    const h = setup(false);
    expect(TestBed.inject(REALTIME_ACCOUNT_SUSPENDED)()).toBeUndefined();
    await h.service.connect();
    h.last().fire('connect_error', new Error('account_suspended'));
    expect(h.service.state()).toBe('disconnected');
  });
});
