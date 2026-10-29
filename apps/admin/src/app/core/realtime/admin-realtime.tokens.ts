// Injection seams for AdminRealtimeService (spec runner-web-presence §8).
// socket.io-client is reached only through the dynamic `import()` below, so
// it never lands in the initial bundle (issue #36, ≤ 500 kB).
import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** The subset of a socket.io-client `Socket` the service uses. */
export interface AdminSocket {
  on(event: string, handler: (...args: never[]) => void): unknown;
  disconnect(): unknown;
}

export interface AdminSocketOptions {
  readonly path: string;
  readonly transports: string[];
  readonly auth: { readonly token: string };
  readonly reconnection: boolean;
  readonly autoConnect: boolean;
}

export type AdminSocketFactory = (url: string, options: AdminSocketOptions) => Promise<AdminSocket>;

/** Builds one socket per attempt. Default: socket.io-client `io`, loaded lazily. */
export const ADMIN_SOCKET_FACTORY = new InjectionToken<AdminSocketFactory>('ADMIN_SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => async (url, options) => {
    const { io } = await import('socket.io-client');
    return io(url, { ...options, forceNew: true });
  },
});

/** 1 s, 2 s, 4 s … capped at 30 s, ±20% jitter. `attempt` starts at 1. */
export function defaultBackoff(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

/** Retry delay in ms for an attempt (tests inject a fixed one). */
export const ADMIN_REALTIME_BACKOFF = new InjectionToken<(attempt: number) => number>(
  'ADMIN_REALTIME_BACKOFF',
  { providedIn: 'root', factory: () => (attempt: number) => defaultBackoff(attempt) },
);

/** Socket origin: the API base URL without a path (the gateway is not under `/api/v1`). */
export function originFor(apiBaseUrl: string): string {
  return new URL(apiBaseUrl).origin;
}

export const ADMIN_REALTIME_URL = new InjectionToken<string>('ADMIN_REALTIME_URL', {
  providedIn: 'root',
  factory: () => originFor(environment.apiBaseUrl),
});

/** `connect_error` of a suspended or banned account (#23 gateway). */
export function isSuspendedConnectError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { message?: unknown; data?: unknown };
  if (e.message === 'account_suspended') return true;
  const data = e.data as { code?: unknown } | null | undefined;
  return typeof data === 'object' && data !== null && data.code === 'account_suspended';
}
