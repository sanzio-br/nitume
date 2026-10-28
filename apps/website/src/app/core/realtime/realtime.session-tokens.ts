// Session-facing seams of RealtimeService (ui-kit spec §6.1; issue #6,
// auth-foundation §5 items 7–8). No socket.io-client import here: the
// providers in app.config.ts must not pull the socket stack into the
// marketing bundle. Re-exported from realtime.tokens.ts.
import { InjectionToken } from '@angular/core';

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
