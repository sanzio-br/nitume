// app.config.ts providers (auth-foundation §5 items 7–8, F9.56).
import { HttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { appConfig } from '../app.config';
import { API, FakeChannel, expectRequest, fakeWindow, httpMock } from '../testing/auth';
import { SESSION_CHANNEL, WEB_LOCKS, WINDOW } from './core/auth/auth.tokens';
import { REALTIME_ACCOUNT_SUSPENDED, REALTIME_TOKEN_PROVIDER } from './core/realtime/realtime.tokens';

describe('app.config (#6)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        provideHttpClientTesting(),
        { provide: WINDOW, useValue: fakeWindow('/app/runner/jobs') },
        { provide: SESSION_CHANNEL, useValue: new FakeChannel() },
        { provide: WEB_LOCKS, useValue: null },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('F9.56. REALTIME_TOKEN_PROVIDER resolves to session.freshAccessToken(); REALTIME_ACCOUNT_SUSPENDED signs out with suspended (session loaded on demand)', async () => {
    // Loaded lazily by the providers; spies sit on the class they load.
    const { SessionStore } = await import('./core/auth/session.store');
    const fresh = vi.spyOn(SessionStore.prototype, 'freshAccessToken').mockResolvedValue('access-1');
    expect(await TestBed.inject(REALTIME_TOKEN_PROVIDER)()).toBe('access-1');
    expect(fresh).toHaveBeenCalledTimes(1);
    const signOut = vi
      .spyOn(SessionStore.prototype, 'signOut')
      .mockReturnValue(new Promise<never>(() => undefined));
    TestBed.inject(REALTIME_ACCOUNT_SUSPENDED)();
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledWith('suspended', 'runner'));
  });

  it('registers the lazy auth interceptor: an API request gets the real rules once the session chunk loads', async () => {
    TestBed.inject(HttpClient).get(`${API}/auth/web/refresh`).subscribe();
    expect((await expectRequest(`${API}/auth/web/refresh`)).request.withCredentials).toBe(true);
    TestBed.inject(HttpClient).get('/assets/app-icon.svg').subscribe();
    expect(httpMock().expectOne('/assets/app-icon.svg').request.withCredentials).toBe(false);
  });
});
