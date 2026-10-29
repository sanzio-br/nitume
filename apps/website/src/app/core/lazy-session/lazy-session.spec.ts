// The eager shims of the lazy session layer (WQ-33; auth-foundation §9.9
// item 50). This file imports nothing from core/auth statically, so the
// session chunk starts unloaded.
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  LEGACY_STORAGE_KEYS,
  lazyAuthInterceptor,
  provideLazySession,
  resetLazySessionForTests,
  sessionModuleLoaded,
} from './lazy-session';

const API = 'http://localhost:3000/api/v1';

function setup() {
  resetLazySessionForTests();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([lazyAuthInterceptor])),
      provideHttpClientTesting(),
      ...provideLazySession(),
    ],
  });
  return { http: TestBed.inject(HttpClient), mock: TestBed.inject(HttpTestingController) };
}

describe('lazy session shims (#6, WQ-33)', () => {
  it('a non-API request (asset) goes out at once and never loads the session chunk', () => {
    const { http, mock } = setup();
    let done = false;
    http.get('/assets/app-icon.svg', { responseType: 'text' }).subscribe(() => (done = true));
    const req = mock.expectOne('/assets/app-icon.svg');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.withCredentials).toBe(false);
    req.flush('<svg/>');
    expect(done).toBe(true);
    http.get('https://maps.googleapis.com/maps/api/js').subscribe();
    mock.expectOne('https://maps.googleapis.com/maps/api/js').flush('');
    expect(sessionModuleLoaded()).toBe(false);
  });

  it('the first API request waits for the session chunk, then gets the real interceptor rules', async () => {
    const { http, mock } = setup();
    http.post(`${API}/auth/web/refresh`, null).subscribe();
    http.post(`${API}/auth/otp/request`, { phone: '+254712345678' }).subscribe();
    mock.expectNone(`${API}/auth/web/refresh`);
    expect(sessionModuleLoaded()).toBe(false);
    const refresh = await vi.waitFor(() => mock.expectOne(`${API}/auth/web/refresh`));
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    const otp = await vi.waitFor(() => mock.expectOne(`${API}/auth/otp/request`));
    expect(otp.request.withCredentials).toBe(false);
    expect(sessionModuleLoaded()).toBe(true);
    // Once loaded, API requests run synchronously through the real interceptor.
    http.post(`${API}/auth/web/logout`, null).subscribe();
    expect(mock.expectOne(`${API}/auth/web/logout`).request.withCredentials).toBe(true);
  });

  it('the legacy token keys are removed at app start (environment initializer), before any session code loads', () => {
    if (!globalThis.localStorage) {
      const data = new Map<string, string>();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: (k: string) => data.get(k) ?? null,
          setItem: (k: string, v: string) => void data.set(k, v),
          removeItem: (k: string) => void data.delete(k),
        },
      });
    }
    for (const key of LEGACY_STORAGE_KEYS) localStorage.setItem(key, 'old');
    setup();
    for (const key of LEGACY_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(sessionModuleLoaded()).toBe(false);
  });
});
