// app.config.ts providers (auth-foundation §5 items 7–8, F9.56).
import { HttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TitleStrategy } from '@angular/router';
import { appConfig } from '../app.config';
import { API, FakeChannel, fakeWindow, httpMock } from '../testing/auth';
import { NitumeTitleStrategy } from './app-area/title.strategy';
import { SESSION_CHANNEL, WEB_LOCKS, WINDOW } from './core/auth/auth.tokens';
import { SessionStore } from './core/auth/session.store';
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

  it('F9.56. REALTIME_TOKEN_PROVIDER resolves to session.freshAccessToken(); REALTIME_ACCOUNT_SUSPENDED signs out with suspended', async () => {
    const session = TestBed.inject(SessionStore);
    const fresh = vi.spyOn(session, 'freshAccessToken').mockResolvedValue('access-1');
    expect(await TestBed.inject(REALTIME_TOKEN_PROVIDER)()).toBe('access-1');
    expect(fresh).toHaveBeenCalledTimes(1);
    const signOut = vi.spyOn(session, 'signOut').mockReturnValue(new Promise<never>(() => undefined));
    TestBed.inject(REALTIME_ACCOUNT_SUSPENDED)();
    expect(signOut).toHaveBeenCalledWith('suspended', 'runner');
  });

  it('registers the auth interceptor and the title strategy', () => {
    expect(TestBed.inject(TitleStrategy)).toBeInstanceOf(NitumeTitleStrategy);
    TestBed.inject(HttpClient).get(`${API}/auth/web/refresh`).subscribe();
    expect(httpMock().expectOne(`${API}/auth/web/refresh`).request.withCredentials).toBe(true);
  });
});
