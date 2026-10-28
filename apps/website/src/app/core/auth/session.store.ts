// SessionStore (auth-foundation §4.2, WQ-8): port of the apps'
// SessionController with the web storage rules. The access token lives
// only in a private field; the refresh token is the httpOnly `nitume_rt`
// cookie handled by the API. Nothing about the session is written to any
// storage, URL or broadcast message. The session length is the API's
// refresh lifetime (30 days, WQ-18); nothing here sets one.
import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, Injector, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RealtimeService } from '../realtime/realtime.service';
import { UserMe, WebSession } from '../api-types';
import { AuthApi } from './auth-api';
import {
  AppRole,
  REFRESH_LOCK_NAME,
  SESSION_CHANNEL,
  SIGN_OUT_HOOK,
  SignOutReason,
  WEB_LOCKS,
  WINDOW,
} from './auth.tokens';
import { isAccountSuspended } from './otp-policy';
import { hasDisplayName, roleFromPath, roleOf } from './role-routing';

export type SessionStatus = 'unknown' | 'restoring' | 'signedOut' | 'signedIn' | 'restoreFailed';
export type RestoreResult = 'signedIn' | 'signedOut' | 'failed';
export type RefreshOutcome = 'ok' | 'rejected' | 'suspended' | 'network';

export interface SessionUser {
  readonly id: string;
  readonly phone: string;
  readonly displayName: string | null;
  readonly role: string;
  readonly status: string;
}

/** Keys the old `/auth` page left in localStorage (removed on start, §1). */
export const LEGACY_STORAGE_KEYS = ['nitume.ws.user', 'nitume.ws.access', 'nitume.ws.refresh'] as const;

/** `exp` margin: a token expiring within 30 s is refreshed first. */
const EXPIRY_MARGIN_MS = 30_000;
/** The sign-out hook is waited for at most 3 s (§4.5 step 1). */
const SIGN_OUT_HOOK_TIMEOUT_MS = 3000;

function toSessionUser(user: UserMe): SessionUser {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName ?? null,
    role: user.role,
    status: user.status,
  };
}

/** `exp` (ms) from the JWT payload, base64url-decoded, never verified. */
function expiryOf(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))) as {
      exp?: unknown;
    };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** §4.4 outcome mapping. */
function refreshOutcomeOf(err: unknown): RefreshOutcome {
  if (!(err instanceof HttpErrorResponse)) return 'network';
  if (err.status === 401) return isAccountSuspended(err) ? 'suspended' : 'rejected';
  if (err.status === 403) return 'rejected';
  return 'network'; // status 0, timeout, 5xx
}

function removeLegacyKeys(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) globalThis.localStorage?.removeItem(key);
  } catch {
    // Storage blocked: nothing to clean.
  }
}

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(AuthApi);
  private readonly injector = inject(Injector);
  private readonly signOutHook = inject(SIGN_OUT_HOOK);
  private readonly win = inject(WINDOW);
  private readonly channel = inject(SESSION_CHANNEL);
  private readonly locks = inject(WEB_LOCKS);

  private readonly statusSignal = signal<SessionStatus>('unknown');
  private readonly userSignal = signal<SessionUser | null>(null);

  readonly status = this.statusSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly hasName = computed(() => hasDisplayName(this.userSignal()));

  /** Memory only (WQ-8). */
  #token: string | null = null;
  private fresh = false;
  private restoring: Promise<RestoreResult> | null = null;
  private refreshing: Promise<RefreshOutcome> | null = null;
  private signingOut: Promise<never> | null = null;

  constructor() {
    removeLegacyKeys();
    const onMessage = (event: MessageEvent) => this.onBroadcast(event.data);
    this.channel?.addEventListener('message', onMessage);
    inject(DestroyRef).onDestroy(() => {
      this.channel?.removeEventListener('message', onMessage);
      this.channel?.close();
    });
  }

  accessToken(): string | null {
    return this.#token;
  }

  /** Single-flight restore (§4.2). No toast on a silent failure. */
  ensureRestored(): Promise<RestoreResult> {
    if (this.statusSignal() === 'signedIn' && this.#token) return Promise.resolve('signedIn');
    this.restoring ??= this.restore().finally(() => {
      this.restoring = null;
    });
    return this.restoring;
  }

  /** After a successful verify: keep only `tokens.accessToken`. */
  async completeSignIn(result: WebSession): Promise<SessionUser> {
    this.#token = result.tokens.accessToken;
    let user = toSessionUser(result.user);
    try {
      user = toSessionUser(await firstValueFrom(this.api.me({ ownRetry: true })));
    } catch {
      // Flutter parity: keep the verify user.
    }
    this.userSignal.set(user);
    this.statusSignal.set('signedIn');
    this.fresh = true;
    return user;
  }

  async saveDisplayName(name: string): Promise<SessionUser> {
    const user = toSessionUser(await firstValueFrom(this.api.updateDisplayName(name.trim())));
    this.userSignal.set(user);
    return user;
  }

  /** Single-flight in this tab, Web Locks across tabs (§4.4). */
  refresh(): Promise<RefreshOutcome> {
    this.refreshing ??= this.lockedRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** REALTIME_TOKEN_PROVIDER (ui-kit §6.1, auth-foundation §4.2). */
  async freshAccessToken(): Promise<string | null> {
    if (this.statusSignal() !== 'signedIn') return null;
    const current = this.#token;
    if (current) {
      const exp = expiryOf(current);
      if (exp === null || exp - Date.now() > EXPIRY_MARGIN_MS) return current;
    }
    const outcome = await this.refresh();
    switch (outcome) {
      case 'ok':
        return this.#token;
      case 'network':
        return null;
      case 'rejected':
        if (this.statusSignal() === 'signedIn') void this.signOut('expired', this.currentRole());
        return null;
      case 'suspended':
        void this.signOut('suspended', this.currentRole());
        return null;
    }
  }

  /** True once after an OTP sign-in (runner onboarding routing). */
  takeFreshSignIn(): boolean {
    const fresh = this.fresh;
    this.fresh = false;
    return fresh;
  }

  /** Revoke and clear, no hook, broadcast or navigation (code-screen refusals). */
  async dropSession(): Promise<void> {
    await this.revoke();
    this.clear();
    this.realtime().disconnect();
  }

  /** §4.5. Ends with a full document navigation to the role's sign-in page. */
  signOut(reason: SignOutReason, role: AppRole): Promise<never> {
    this.signingOut ??= this.runSignOut(reason, role);
    return this.signingOut;
  }

  /** §5 item 5: the role of the current URL, else the user's, else customer. */
  currentRole(): AppRole {
    const fromUrl = roleFromPath(this.win.location?.pathname);
    if (fromUrl) return fromUrl;
    const kind = roleOf(this.userSignal());
    return kind === 'other' ? 'customer' : kind;
  }

  // ---------------------------------------------------------------------

  private async restore(): Promise<RestoreResult> {
    this.statusSignal.set('restoring');
    const outcome = await this.refresh();
    if (outcome === 'network') {
      this.statusSignal.set('restoreFailed');
      return 'failed';
    }
    if (outcome !== 'ok') {
      this.clear();
      return 'signedOut';
    }
    try {
      const me = await firstValueFrom(this.api.me({ ownRetry: true }));
      this.userSignal.set(toSessionUser(me));
      this.statusSignal.set('signedIn');
      return 'signedIn';
    } catch (err) {
      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
        this.clear();
        return 'signedOut';
      }
      this.statusSignal.set('restoreFailed');
      return 'failed';
    }
  }

  private lockedRefresh(): Promise<RefreshOutcome> {
    const run = () => this.doRefresh();
    return this.locks ? this.locks.request(REFRESH_LOCK_NAME, run) : run();
  }

  private async doRefresh(): Promise<RefreshOutcome> {
    try {
      const result = await firstValueFrom(this.api.refresh());
      // Only the access token is read; any other field is ignored.
      this.#token = result.accessToken;
      return 'ok';
    } catch (err) {
      return refreshOutcomeOf(err);
    }
  }

  private async runSignOut(reason: SignOutReason, role: AppRole): Promise<never> {
    await this.runHook(reason);
    await this.revoke();
    this.clear();
    this.realtime().disconnect();
    try {
      this.channel?.postMessage({ type: 'signed-out' });
    } catch {
      // Channel closed: other tabs follow on their next request.
    }
    const query = reason === 'user' ? '' : `?signedOut=${reason}`;
    this.win.location.replace(`/app/${role}/sign-in${query}`);
    return new Promise<never>(() => undefined);
  }

  /** Best effort, errors ignored, at most 3 s. */
  private async runHook(reason: SignOutReason): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SIGN_OUT_HOOK_TIMEOUT_MS);
    });
    const hook = Promise.resolve()
      .then(() => this.signOutHook(reason))
      .catch(() => undefined);
    try {
      await Promise.race([hook, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** `POST /auth/web/logout`, best effort for every reason. */
  private async revoke(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } catch {
      // Ignored: local state is cleared anyway (Flutter AuthRepository.logout).
    }
  }

  private clear(): void {
    this.#token = null;
    this.fresh = false;
    this.userSignal.set(null);
    this.statusSignal.set('signedOut');
  }

  /** Another tab signed out: leave any `/app` page except a sign-in page. */
  private onBroadcast(data: unknown): void {
    if ((data as { type?: unknown } | null)?.type !== 'signed-out') return;
    const path = this.win.location?.pathname ?? '';
    if (!(path === '/app' || path.startsWith('/app/'))) return;
    if (/^\/app\/(customer|runner)\/sign-in(?:\/|$)/.test(path)) return;
    const role = this.currentRole();
    this.clear();
    this.win.location.replace(`/app/${role}/sign-in`);
  }

  /** Lazy: RealtimeService's token provider depends on this store. */
  private realtime(): RealtimeService {
    return this.injector.get(RealtimeService);
  }
}
