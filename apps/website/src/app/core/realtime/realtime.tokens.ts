// Injection seams for RealtimeService (ui-kit spec §6.1, §6.2).
import { InjectionToken } from '@angular/core';
import { io } from 'socket.io-client';
import { environment } from '../../../environments/environment';

/** The subset of a socket.io-client `Socket` the service uses. */
export interface RealtimeSocket {
  on(event: string, handler: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  disconnect(): unknown;
}

export interface RealtimeSocketOptions {
  readonly path: string;
  readonly transports: string[];
  readonly auth: { readonly token: string };
  readonly reconnection: boolean;
  readonly autoConnect: boolean;
}

export type SocketIoFactory = (url: string, options: RealtimeSocketOptions) => RealtimeSocket;

/** Builds one socket per attempt. Default: socket.io-client `io`. */
export const SOCKET_IO_FACTORY = new InjectionToken<SocketIoFactory>('SOCKET_IO_FACTORY', {
  providedIn: 'root',
  factory: () => (url, options) => io(url, { ...options, forceNew: true }),
});

/**
 * Fresh access token for each (re)connect, or `null` when signed out.
 * Issue #6 provides the real one in `app.config.ts`
 * (`SessionStore.freshAccessToken()`, refreshing through
 * `POST /api/v1/auth/web/refresh`). This stub default (tests, signed out)
 * returns `null`, so `connect()` ends `disconnected` and never opens a
 * socket.
 */
export const REALTIME_TOKEN_PROVIDER = new InjectionToken<() => Promise<string | null>>(
  'REALTIME_TOKEN_PROVIDER',
  { providedIn: 'root', factory: () => () => Promise.resolve(null) },
);

/**
 * Called once when the handshake is refused with `account_suspended`
 * (auth-foundation §5 item 8, PR #25). Default no-op; #6 provides
 * `() => session.signOut('suspended', role)` in `app.config.ts`.
 */
export const REALTIME_ACCOUNT_SUSPENDED = new InjectionToken<() => void>(
  'REALTIME_ACCOUNT_SUSPENDED',
  { providedIn: 'root', factory: () => () => undefined },
);

/** `connect_error` of a suspended or banned account (PR #25 gateway). */
export function isSuspendedConnectError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { message?: unknown; data?: unknown };
  if (e.message === 'account_suspended') return true;
  const data = e.data as { code?: unknown } | null | undefined;
  return typeof data === 'object' && data !== null && data.code === 'account_suspended';
}

/** 1 s, 2 s, 4 s … capped at 30 s, ±20% jitter. `attempt` starts at 1. */
export function defaultBackoff(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

/** Retry delay in ms for an attempt (tests inject a fixed one). */
export const REALTIME_BACKOFF = new InjectionToken<(attempt: number) => number>('REALTIME_BACKOFF', {
  providedIn: 'root',
  factory: () => (attempt: number) => defaultBackoff(attempt),
});

/**
 * Socket origin: the API base URL's scheme, host and port, no path (the
 * gateway is not under `/api/v1`; Flutter `originFor`).
 */
export function originFor(apiBaseUrl: string): string {
  return new URL(apiBaseUrl).origin;
}

export const REALTIME_URL = new InjectionToken<string>('REALTIME_URL', {
  providedIn: 'root',
  factory: () => originFor(environment.apiBaseUrl),
});

/** Ack wait for `errand:join` and `location:ping` (Flutter ackTimeout). */
export const REALTIME_ACK_TIMEOUT_MS = 10000;
