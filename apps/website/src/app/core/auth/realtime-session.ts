// The #5 handoff need (auth-foundation §5 items 7–8): RealtimeService takes
// its token from the session and signs out on an `account_suspended`
// handshake. Resolved lazily: SessionStore itself uses RealtimeService.
import { Injector, Provider, inject } from '@angular/core';
import { REALTIME_ACCOUNT_SUSPENDED, REALTIME_TOKEN_PROVIDER } from '../realtime/realtime.session-tokens';
import { SessionStore } from './session.store';

export function provideRealtimeSession(): Provider[] {
  return [
    {
      provide: REALTIME_TOKEN_PROVIDER,
      useFactory: () => {
        const injector = inject(Injector);
        return () => injector.get(SessionStore).freshAccessToken();
      },
    },
    {
      provide: REALTIME_ACCOUNT_SUSPENDED,
      useFactory: () => {
        const injector = inject(Injector);
        return () => {
          const session = injector.get(SessionStore);
          void session.signOut('suspended', session.currentRole());
        };
      },
    },
  ];
}
