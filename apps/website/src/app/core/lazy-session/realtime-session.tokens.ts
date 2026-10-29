// Session-facing seams of RealtimeService (ui-kit spec §6.1; issue #6,
// auth-foundation §5 items 7–8). Declared here, outside core/realtime, so
// app.config.ts can provide them without reaching the realtime or session
// code (WQ-33). Re-exported from core/realtime/realtime.tokens.ts.
import { InjectionToken } from '@angular/core';

/**
 * Fresh access token for each (re)connect, or `null` when signed out.
 * app.config.ts provides the real one (`SessionStore.freshAccessToken()`,
 * loaded on demand; it refreshes through `POST /api/v1/auth/web/refresh`).
 * This stub default (tests, signed out) returns `null`, so `connect()` ends
 * `disconnected` and never opens a socket.
 */
export const REALTIME_TOKEN_PROVIDER = new InjectionToken<() => Promise<string | null>>(
  'REALTIME_TOKEN_PROVIDER',
  { providedIn: 'root', factory: () => () => Promise.resolve(null) },
);

/**
 * Called once when the handshake is refused with `account_suspended`
 * (auth-foundation §5 item 8, PR #25). Default no-op; app.config.ts provides
 * `signOut('suspended', role)` on the lazily loaded session.
 */
export const REALTIME_ACCOUNT_SUSPENDED = new InjectionToken<() => void>(
  'REALTIME_ACCOUNT_SUSPENDED',
  { providedIn: 'root', factory: () => () => undefined },
);
