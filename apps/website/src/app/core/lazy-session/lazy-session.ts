// Eager shims for the lazy session layer (WQ-33, owner 2026-10-29;
// auth-foundation §1, §2, §9.9 item 50). Nothing here imports core/auth,
// core/realtime, app-area or shared/ui statically: the interceptor,
// SessionStore and AuthApi load on the first API request (or when the
// realtime service asks for a token), so the marketing bundle stays at the
// #5 baseline.
import {
  EnvironmentInjector,
  EnvironmentProviders,
  Injector,
  Provider,
  inject,
  provideEnvironmentInitializer,
  runInInjectionContext,
} from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { REALTIME_ACCOUNT_SUSPENDED, REALTIME_TOKEN_PROVIDER } from './realtime-session.tokens';

const API_V1_PREFIX = `${environment.apiBaseUrl}/api/v1/`;

/** Keys the old `/auth` page left in localStorage (auth-foundation §1). */
export const LEGACY_STORAGE_KEYS = ['nitume.ws.user', 'nitume.ws.access', 'nitume.ws.refresh'] as const;

/** Removes the legacy token keys; runs at app start and in SessionStore. */
export function removeLegacyStorageKeys(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) globalThis.localStorage?.removeItem(key);
  } catch {
    // Storage blocked: nothing to clean.
  }
}

let realInterceptor: HttpInterceptorFn | null = null;
let loading: Promise<HttpInterceptorFn> | null = null;

/** Called by core/auth/auth.interceptor.ts when its chunk is evaluated. */
export function registerAuthInterceptor(fn: HttpInterceptorFn): void {
  realInterceptor = fn;
}

/** True once the session chunk (the real interceptor) has loaded. */
export function sessionModuleLoaded(): boolean {
  return realInterceptor !== null;
}

/** @internal Tests only: forget the loaded interceptor (cold start). */
export function resetLazySessionForTests(): void {
  realInterceptor = null;
  loading = null;
}

function loadInterceptor(): Promise<HttpInterceptorFn> {
  loading ??= import('../auth/auth.interceptor')
    .then((m) => (realInterceptor = m.authInterceptor))
    .catch((err: unknown) => {
      loading = null;
      throw err;
    });
  return loading;
}

/**
 * Registered with `withInterceptors`. Requests outside
 * `${apiBaseUrl}/api/v1/` pass through at once and never load the session
 * chunk; API requests wait for it the first time, then run the real
 * interceptor (auth-foundation §5) in this injection context.
 */
export const lazyAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_V1_PREFIX)) return next(req);
  if (realInterceptor) return realInterceptor(req, next);
  const injector = inject(EnvironmentInjector);
  return from(loadInterceptor()).pipe(
    switchMap((fn) => runInInjectionContext(injector, () => fn(req, next))),
  );
};

/**
 * The real REALTIME_TOKEN_PROVIDER and REALTIME_ACCOUNT_SUSPENDED (#5
 * handoff need, auth-foundation §5 items 7–8), resolving SessionStore on
 * demand, plus the legacy-key cleanup at start.
 */
export function provideLazySession(): (Provider | EnvironmentProviders)[] {
  return [
    {
      provide: REALTIME_TOKEN_PROVIDER,
      useFactory: () => {
        const injector = inject(Injector);
        return async () => {
          const { SessionStore } = await import('../auth/session.store');
          return injector.get(SessionStore).freshAccessToken();
        };
      },
    },
    {
      provide: REALTIME_ACCOUNT_SUSPENDED,
      useFactory: () => {
        const injector = inject(Injector);
        return () => {
          void import('../auth/session.store').then(({ SessionStore }) => {
            const session = injector.get(SessionStore);
            void session.signOut('suspended', session.currentRole());
          });
        };
      },
    },
    provideEnvironmentInitializer(removeLegacyStorageKeys),
  ];
}
