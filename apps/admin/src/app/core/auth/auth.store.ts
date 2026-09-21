import { Injectable, signal, computed } from '@angular/core';
import { jwtDecode } from 'jwt-decode';
import type { ActingRole, AuthState, AuthTokens, OtpVerifyResult, TokenPair, UserMe } from '../api-types';

const LS_TOKENS = 'nitume:admin:tokens';
const LS_USER = 'nitume:admin:user';

export interface ActingRoleChange {
  role: ActingRole;
  issuedForPhone?: string;
}

/**
 * Auth store + acting-role state.
 *
 * The API signs one token pair per account. Nitume roles are surfaced on a
 * single account depending on the acting role passed into OTP verify and then
 * echoed per request via `x-nitume-acting-role`. This store keeps:
 *   - the signed token pair (access + refresh) in localStorage,
 *   - the acting role the admin panel currently operates as (default ADMIN —
 *     customer/runner acting is only available on surfaces that explicitly
 *     allow it; the guard enforces ADMIN-only routes),
 *   - a decoded view of the current token (userId, phone, exp).
 *
 * Acting role changes must be re-verified with OTP for the new role — this
 * store only records change intent; the AuthService performs the verify and
 * only then calls `commitActingRole`.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  readonly #state = signal<AuthState>({
    tokens: null,
    user: null,
    actingRole: 'admin',
    status: 'idle',
  });

  readonly state = this.#state.asReadonly();
  readonly isAuthenticated = computed(() => !!this.#state().tokens?.accessToken);
  readonly actingRole = computed(() => this.#state().actingRole);

  /** True if the decoded access token's exp is within this horizon (s). */
  readonly isExpiringSoon = computed(() => {
    const tokens = this.#state().tokens;
    if (!tokens?.accessToken) return false;
    try {
      const { exp } = jwtDecode<{ exp?: number }>(tokens.accessToken);
      if (!exp) return false;
      const THRESHOLD_S = 60;
      return exp * 1000 - Date.now() < THRESHOLD_S * 1000;
    } catch {
      return false;
    }
  });

  constructor() {
    this.#hydrate();
  }

  #hydrate(): void {
    const rawTokens = window.localStorage.getItem(LS_TOKENS);
    const rawUser = window.localStorage.getItem(LS_USER);
    if (!rawTokens) return;
    try {
      const tokens: AuthTokens = JSON.parse(rawTokens);
      const user: UserMe | null = rawUser ? JSON.parse(rawUser) : null;
      this.#state.set({
        tokens,
        user,
        actingRole: this.#state().actingRole,
        status: 'authenticated',
      });
    } catch {
      this.clear();
    }
  }

  /** Alias kept for the interceptor/refresh path. */
  applyTokens(tokens: TokenPair | AuthTokens): void {
    this.setTokens(tokens);
  }

  setTokens(tokens: TokenPair | AuthTokens): void {
    this.#state.update((s) => ({ ...s, tokens, status: 'authenticated' }));
    window.localStorage.setItem(LS_TOKENS, JSON.stringify(tokens));
  }

  setUser(user: UserMe): void {
    this.#state.update((s) => ({ ...s, user }));
    window.localStorage.setItem(LS_USER, JSON.stringify(user));
  }

  setActingRole(role: ActingRole): void {
    this.#state.update((s) => ({ ...s, actingRole: role }));
  }

  clear(): void {
    window.localStorage.removeItem(LS_TOKENS);
    window.localStorage.removeItem(LS_USER);
    this.#state.set({ tokens: null, user: null, actingRole: 'admin', status: 'idle' });
  }
}
