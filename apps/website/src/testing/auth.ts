// Test rig for the #6 session layer: HTTP through HttpTestingController
// with the real interceptor; WINDOW, BroadcastChannel and navigator.locks
// replaced by fakes (auth-foundation §9).
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../app/core/auth/auth.interceptor';
import {
  SESSION_CHANNEL,
  SessionChannel,
  SessionMessage,
  WEB_LOCKS,
  WINDOW,
  WebLocks,
} from '../app/core/auth/auth.tokens';
import { UserMe } from '../app/core/api-types';

export const API = 'http://localhost:3000/api/v1';

export class FakeChannel implements SessionChannel {
  readonly posted: SessionMessage[] = [];
  private readonly listeners = new Set<(event: MessageEvent) => void>();
  closed = false;
  postMessage(message: SessionMessage): void {
    this.posted.push(message);
  }
  addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener);
  }
  close(): void {
    this.closed = true;
  }
  /** Another tab posted `data`. */
  deliver(data: unknown): void {
    for (const l of this.listeners) l({ data } as MessageEvent);
  }
}

export interface FakeWindow {
  location: { pathname: string; replace: ReturnType<typeof vi.fn> };
}

export function fakeWindow(pathname = '/app/customer/home'): FakeWindow {
  return { location: { pathname, replace: vi.fn() } };
}

export interface AuthRig {
  win: FakeWindow;
  channel: FakeChannel;
  providers: (Provider | EnvironmentProviders)[];
}

export function authRig(opts: { pathname?: string; locks?: WebLocks | null } = {}): AuthRig {
  const win = fakeWindow(opts.pathname);
  const channel = new FakeChannel();
  return {
    win,
    channel,
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: WINDOW, useValue: win },
      { provide: SESSION_CHANNEL, useValue: channel },
      { provide: WEB_LOCKS, useValue: opts.locks ?? null },
    ],
  };
}

export function httpMock(): HttpTestingController {
  return TestBed.inject(HttpTestingController);
}

/** A JWT-shaped token whose `exp` is `seconds` from now (never verified). */
export function jwt(seconds: number, tag = 'a'): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds, tag }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
}

export function userJson(overrides: Partial<UserMe> = {}): UserMe {
  return {
    id: 'u-1',
    phone: '+254712345678',
    displayName: 'Achieng Otieno',
    role: 'customer',
    status: 'active',
    createdAt: '2026-10-01T08:00:00.000Z',
    ...overrides,
  };
}

/** Lets pending promise chains (hook race, firstValueFrom) run. */
export async function settle(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

/** API error body (`apps/api/src/common/api-error.ts`). */
export function apiError(status: number, code?: string, extra: Record<string, unknown> = {}) {
  return {
    body: { statusCode: status, ...(code ? { code } : {}), message: code ?? 'error', ...extra },
    opts: { status, statusText: 'Error' },
  };
}

/**
 * Node 26 defines a global `localStorage` getter that is undefined without
 * `--localstorage-file`, shadowing jsdom's. Installs an in-memory Storage
 * so the storage assertions (WQ-8) run against a real Storage API.
 */
export function ensureLocalStorage(): void {
  if (globalThis.localStorage) return;
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  } as Storage;
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}

/** Every key in localStorage and sessionStorage. */
export function storageKeys(): string[] {
  const keys: string[] = [];
  for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
    for (let i = 0; i < store.length; i++) keys.push(store.key(i) as string);
  }
  return keys;
}
