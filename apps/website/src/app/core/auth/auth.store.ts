import { Injectable, signal, computed } from '@angular/core';
import type { UserMe } from '../api-types';

const USER_KEY = 'nitume.ws.user';
const ACCESS_KEY = 'nitume.ws.access';
const REFRESH_KEY = 'nitume.ws.refresh';

/**
 * Minimal session store for the public website. Persists the last verified
 * user + token pair so header CTAs can reflect an authenticated visitor.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _user = signal<UserMe | null>(this.readUser());

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  setSession(user: UserMe, tokens: { accessToken: string; refreshToken: string }) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    this._user.set(user);
  }

  clear() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this._user.set(null);
  }

  private readUser(): UserMe | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as UserMe) : null;
    } catch {
      return null;
    }
  }
}