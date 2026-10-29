// Guards (auth-foundation §6.1). Angular starts a route's canActivate guards
// together and takes the first non-true result in order, so each guard
// awaits the single-flight restore and leaves "not signed in" to authGuard.
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthApi } from './auth-api';
import { AppRole } from './auth.tokens';
import { ROLE_HOME, destinationUrl, resolveDestination, roleOf } from './role-routing';
import { SessionStore } from './session.store';
import { SignInFlowStore } from './sign-in-flow.store';

/** `data.role` of the route or its nearest ancestor (`customer` by default). */
export function routeRole(route: ActivatedRouteSnapshot): AppRole {
  for (let r: ActivatedRouteSnapshot | null = route; r; r = r.parent) {
    const role = (r.data as { role?: unknown }).role;
    if (role === 'customer' || role === 'runner') return role;
  }
  return 'customer';
}

export const authGuard: CanActivateFn = async (route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const role = routeRole(route);
  const restored = await session.ensureRestored();
  if (restored === 'signedIn') return true;
  if (restored === 'signedOut') {
    return router.createUrlTree(['/app', role, 'sign-in'], { queryParams: { returnUrl: state.url } });
  }
  return router.createUrlTree(['/app/offline'], { queryParams: { returnUrl: state.url } });
};

export function roleGuard(role: AppRole): CanActivateFn {
  return async () => {
    const session = inject(SessionStore);
    const router = inject(Router);
    if ((await session.ensureRestored()) !== 'signedIn') return true; // authGuard decides
    const kind = roleOf(session.user());
    if (kind === role) return true;
    if (kind === 'other') {
      void session.signOut('not-allowed', role);
      return false;
    }
    // The other app role: its own home, no sign-out (one site, two areas).
    return router.parseUrl(ROLE_HOME[kind]);
  };
}

export const hasNameGuard: CanActivateFn = async (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if ((await session.ensureRestored()) !== 'signedIn') return true;
  return session.hasName() ? true : router.createUrlTree(['/app', routeRole(route), 'name']);
};

export const needsNameGuard: CanActivateFn = async (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if ((await session.ensureRestored()) !== 'signedIn') return true;
  return session.hasName() ? router.parseUrl(ROLE_HOME[routeRole(route)]) : true;
};

/** Sign-in routes: a signed-in visitor goes on (§6.2, not fresh). */
export const guestGuard: CanActivateFn = async (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const api = inject(AuthApi);
  const flowRole = routeRole(route);
  if ((await session.ensureRestored()) !== 'signedIn') return true;
  const user = session.user();
  if (!user) return true;
  const destination = resolveDestination({
    user,
    flowRole,
    fresh: false,
    returnUrl: route.queryParamMap.get('returnUrl'),
  });
  if (destination.kind === 'refuse') {
    if (destination.reason === 'not-allowed') {
      void session.signOut('not-allowed', flowRole);
      return false;
    }
    // Row 2 (customer session on the runner sign-in): revoke, then the
    // visitor can sign in as a runner with another number.
    await session.dropSession();
    return true;
  }
  return router.parseUrl(await destinationUrl(destination, api));
};

/** The code screen needs the phone from this tab's phone screen. */
export const otpStepGuard: CanActivateFn = (route) => {
  const flow = inject(SignInFlowStore);
  const router = inject(Router);
  const role = routeRole(route);
  if (flow.get(role)) return true;
  const returnUrl = route.queryParamMap.get('returnUrl');
  return router.createUrlTree(['/app', role, 'sign-in'], returnUrl ? { queryParams: { returnUrl } } : {});
};
