// Injection seams of the session layer (auth-foundation §4, §9: WINDOW,
// BroadcastChannel and navigator.locks are injected so tests can stub them).
import { InjectionToken } from '@angular/core';

export type AppRole = 'customer' | 'runner';
export type SignOutReason = 'user' | 'expired' | 'suspended' | 'not-allowed';

/** The browser window (sign-out uses `location.replace`, a full reload). */
export const WINDOW = new InjectionToken<Window>('WINDOW', {
  providedIn: 'root',
  factory: () => window,
});

export interface SessionMessage {
  readonly type: 'signed-out';
}

/** The subset of `BroadcastChannel` the session uses. */
export interface SessionChannel {
  postMessage(message: SessionMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}

export const SESSION_CHANNEL_NAME = 'nitume-session';

/** `BroadcastChannel('nitume-session')`, or null where unsupported. */
export const SESSION_CHANNEL = new InjectionToken<SessionChannel | null>('SESSION_CHANNEL', {
  providedIn: 'root',
  factory: () =>
    typeof BroadcastChannel === 'function' ? new BroadcastChannel(SESSION_CHANNEL_NAME) : null,
});

/** The subset of the Web Locks API (`navigator.locks`) the refresh uses. */
export interface WebLocks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export const REFRESH_LOCK_NAME = 'nitume-auth-refresh';

/** `navigator.locks`, or null where the Web Locks API is missing. */
export const WEB_LOCKS = new InjectionToken<WebLocks | null>('WEB_LOCKS', {
  providedIn: 'root',
  factory: () => {
    const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { locks?: WebLocks });
    return nav?.locks ?? null;
  },
});

/**
 * Runs first in `signOut` (auth-foundation §4.5 step 1). #6 provides the
 * no-op; #11/#18 replace it to unregister the browser's push token (WQ-4).
 */
export const SIGN_OUT_HOOK = new InjectionToken<(reason: SignOutReason) => Promise<void>>(
  'SIGN_OUT_HOOK',
  { providedIn: 'root', factory: () => () => Promise.resolve() },
);
