// AuthApi routes and credentials (auth-foundation §4.3, F9.10).
import { TestBed } from '@angular/core/testing';
import { API, authRig, httpMock } from '../../../testing/auth';
import { AuthApi } from './auth-api';
import { SessionStore } from './session.store';

describe('AuthApi (#6)', () => {
  it('F9.10. web routes with credentials (refresh and logout: empty body, no Authorization); the rest without credentials', async () => {
    const rig = authRig();
    TestBed.configureTestingModule({ providers: rig.providers });
    const api = TestBed.inject(AuthApi);
    // A token in memory, so a Bearer would be added where allowed.
    const store = TestBed.inject(SessionStore);
    const done = store.completeSignIn({
      user: { id: 'u', phone: '+254712345678', displayName: 'A', role: 'customer', status: 'active' },
      tokens: { accessToken: 'tok' },
    });
    httpMock().expectOne(`${API}/users/me`).flush({ id: 'u', phone: 'p', displayName: 'A', role: 'customer', status: 'active' });
    await done;

    api.verifyOtp('+254712345678', '123456', 'runner').subscribe();
    const verify = httpMock().expectOne(`${API}/auth/web/otp/verify`);
    expect(verify.request.method).toBe('POST');
    expect(verify.request.body).toEqual({ phone: '+254712345678', code: '123456', role: 'runner' });
    expect(verify.request.withCredentials).toBe(true);
    expect(verify.request.headers.has('Authorization')).toBe(false);

    api.refresh().subscribe();
    const refresh = httpMock().expectOne(`${API}/auth/web/refresh`);
    expect(refresh.request.body).toBeNull();
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.has('Authorization')).toBe(false);

    api.logout().subscribe();
    const logout = httpMock().expectOne(`${API}/auth/web/logout`);
    expect(logout.request.body).toBeNull();
    expect(logout.request.withCredentials).toBe(true);
    expect(logout.request.headers.has('Authorization')).toBe(false);

    api.requestOtp('+254712345678').subscribe();
    const request = httpMock().expectOne(`${API}/auth/otp/request`);
    expect(request.request.body).toEqual({ phone: '+254712345678' });
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.has('Authorization')).toBe(false);

    api.me().subscribe();
    api.updateDisplayName('Achieng').subscribe();
    api.runnerMe().subscribe();
    api.runnerVerifications().subscribe();
    const bearer = [
      httpMock().expectOne({ method: 'GET', url: `${API}/users/me` }),
      httpMock().expectOne({ method: 'PATCH', url: `${API}/users/me` }),
      httpMock().expectOne(`${API}/runners/me`),
      httpMock().expectOne(`${API}/runners/me/verifications`),
    ];
    expect(bearer[1].request.body).toEqual({ displayName: 'Achieng' });
    for (const req of bearer) {
      expect(req.request.withCredentials).toBe(false);
      expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    }
    httpMock().expectNone(`${API}/auth/otp/verify`);
  });
});
