// AdminRealtimeService (issue #36, spec runner-web-presence §8): a reduced
// port of the website RealtimeService for the ops dashboard.
//
// - Handshake `auth: { token }` on `/socket.io`, websocket only, no `client`
//   field (that marks a runner web socket). The service owns retries
//   (`reconnection: false`).
// - Before each attempt the access token is rotated through
//   `AuthService.refresh` when it is about to expire. No session: stop.
// - After a drop, a refused handshake or a server kick: close the socket,
//   `reconnecting`, wait the backoff, open a new socket with a fresh token.
// - `connect_error` `account_suspended` is final: stop and log out once.
// - Hot, no-replay streams for the three presence events; malformed
//   payloads are dropped, never thrown.
// - Started by the dashboard shell (loaded with a dynamic `import()`), stopped
//   on logout (the session ends) and on destroy.
import { DestroyRef, Injectable, Signal, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import {
  ADMIN_REALTIME_PATH,
  AdminLiveSource,
  AdminRealtimeEvents,
  AdminRealtimeParsers,
  AdminRealtimeState,
  WebAutoOffline,
  WebPingsResumed,
  WebPingsStopped,
} from './admin-realtime.events';
import {
  ADMIN_REALTIME_BACKOFF,
  ADMIN_REALTIME_URL,
  ADMIN_SOCKET_FACTORY,
  AdminSocket,
  isSuspendedConnectError,
} from './admin-realtime.tokens';

@Injectable({ providedIn: 'root' })
export class AdminRealtimeService implements AdminLiveSource {
  private readonly factory = inject(ADMIN_SOCKET_FACTORY);
  private readonly backoff = inject(ADMIN_REALTIME_BACKOFF);
  private readonly url = inject(ADMIN_REALTIME_URL);
  private readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);

  private readonly stateSignal = signal<AdminRealtimeState>('disconnected');
  /** `disconnected | connecting | connected | reconnecting`. */
  readonly state: Signal<AdminRealtimeState> = this.stateSignal.asReadonly();

  private readonly states = new Subject<AdminRealtimeState>();
  private readonly stopped = new Subject<WebPingsStopped>();
  private readonly resumed = new Subject<WebPingsResumed>();
  private readonly offline = new Subject<WebAutoOffline>();

  /** Every state change (no replay). */
  readonly stateChanges$: Observable<AdminRealtimeState> = this.states.asObservable();
  readonly webPingsStopped$: Observable<WebPingsStopped> = this.stopped.asObservable();
  readonly webPingsResumed$: Observable<WebPingsResumed> = this.resumed.asObservable();
  readonly webAutoOffline$: Observable<WebAutoOffline> = this.offline.asObservable();

  private socket: AdminSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;
  private attempt = 0;
  /** Bumped by connect()/disconnect() so a pending attempt is discarded. */
  private generation = 0;

  constructor() {
    // Logout (or any path that ends the session) stops the socket.
    effect(() => {
      if (!this.store.isAuthenticated()) untracked(() => this.disconnect());
    });
    inject(DestroyRef).onDestroy(() => {
      this.disconnect();
      for (const s of [this.states, this.stopped, this.resumed, this.offline]) s.complete();
    });
  }

  /** Called by the signed-in dashboard shell. */
  async connect(): Promise<void> {
    this.wanted = true;
    this.attempt = 0;
    this.clearRetry();
    this.closeSocket();
    this.setState('connecting');
    await this.attemptOpen(++this.generation);
  }

  /** Stop retrying and close the socket. */
  disconnect(): void {
    this.wanted = false;
    this.generation++;
    this.clearRetry();
    this.closeSocket();
    this.setState('disconnected');
  }

  // -------------------------------------------------------------------------

  private async attemptOpen(generation: number): Promise<void> {
    const token = await this.token();
    if (!this.wanted || generation !== this.generation) return;
    if (!token) {
      // Signed out: never open a socket without a token.
      this.disconnect();
      return;
    }
    let s: AdminSocket;
    try {
      s = await this.factory(this.url, {
        path: ADMIN_REALTIME_PATH,
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
        autoConnect: true,
      });
    } catch {
      // The socket library failed to load: retry like a refused handshake.
      if (this.wanted && generation === this.generation) this.scheduleRetry();
      return;
    }
    if (!this.wanted || generation !== this.generation) {
      s.disconnect();
      return;
    }
    this.socket = s;
    const current = () => this.socket === s;

    s.on('connect', () => {
      if (!current()) return;
      this.attempt = 0;
      this.setState('connected');
    });
    s.on('disconnect', () => {
      if (current()) this.scheduleRetry();
    });
    s.on('connect_error', (error: never) => {
      if (!current()) return;
      if (isSuspendedConnectError(error)) {
        this.disconnect();
        this.auth.logout();
        return;
      }
      this.scheduleRetry();
    });

    this.listen(
      s,
      AdminRealtimeEvents.webPingsStopped,
      AdminRealtimeParsers.webPingsStopped,
      this.stopped,
    );
    this.listen(
      s,
      AdminRealtimeEvents.webPingsResumed,
      AdminRealtimeParsers.webPingsResumed,
      this.resumed,
    );
    this.listen(
      s,
      AdminRealtimeEvents.webAutoOffline,
      AdminRealtimeParsers.webAutoOffline,
      this.offline,
    );
  }

  /** The access token, rotated first when it is about to expire; null without a session. */
  private async token(): Promise<string | null> {
    const tokens = this.store.state().tokens;
    if (!tokens?.accessToken) return null;
    if (tokens.refreshToken && this.store.isExpiringSoon()) {
      try {
        await firstValueFrom(this.auth.refresh(tokens.refreshToken));
      } catch {
        // Keep the current token: a refused handshake retries with backoff.
      }
    }
    return this.store.state().tokens?.accessToken ?? null;
  }

  private listen<T>(
    s: AdminSocket,
    event: string,
    parse: (data: unknown) => T,
    sink: Subject<T>,
  ): void {
    s.on(event, (data: never) => {
      if (this.socket !== s || sink.closed) return;
      let parsed: T;
      try {
        parsed = parse(data);
      } catch {
        return; // Malformed payload: drop it.
      }
      sink.next(parsed);
    });
  }

  private scheduleRetry(): void {
    if (!this.wanted) return;
    this.closeSocket();
    this.setState('reconnecting');
    if (this.retryTimer) return;
    this.attempt++;
    const generation = this.generation;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.wanted && generation === this.generation) void this.attemptOpen(generation);
    }, this.backoff(this.attempt));
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private closeSocket(): void {
    const s = this.socket;
    this.socket = null;
    s?.disconnect();
  }

  private setState(next: AdminRealtimeState): void {
    if (this.stateSignal() === next) return;
    this.stateSignal.set(next);
    this.states.next(next);
  }
}
