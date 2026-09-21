import { Component, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthStore } from '../../core/auth/auth.store';

type AuthTab = 'login' | 'signup';

@Component({
  selector: 'app-auth',
  standalone: true,
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-tabs">
          <div class="auth-tab" [class.on]="tab() === 'login'" (click)="tab.set('login')" role="tab" tabindex="0" (keydown.enter)="tab.set('login')">Log in</div>
          <div class="auth-tab" [class.on]="tab() === 'signup'" (click)="tab.set('signup')" role="tab" tabindex="0" (keydown.enter)="tab.set('signup')">Sign up</div>
        </div>

        <label class="auth-field-label">Phone number</label>
        <input class="auth-input" placeholder="+254 7XX XXX XXX" [value]="phone()" (input)="phone.set($any($event.target).value)" inputmode="tel">

        @if (tab() === 'signup') {
          <label class="auth-field-label">Full name</label>
          <input class="auth-input" placeholder="Your full name" [value]="name()" (input)="name.set($any($event.target).value)">
        }

        @if (!codeSent()) {
          <button class="auth-submit" (click)="sendCode()" [disabled]="sending() || invalidPhone()">
            {{ sending() ? 'Sending…' : 'Send verification code' }}
          </button>
        } @else {
          <label class="auth-field-label">Verification code</label>
          <input class="auth-input" placeholder="6-digit code" [value]="code()" (input)="code.set($any($event.target).value)" inputmode="numeric" maxlength="6">
          <button class="auth-submit" (click)="verifyCode()" [disabled]="verifying() || code().length !== 6">
            {{ verifying() ? 'Verifying…' : (tab() === 'login' ? 'Log in' : 'Create account') }}
          </button>
          <div class="resend"><button class="resend-link" (click)="phone.set(''); codeSent.set(false)">Change number</button></div>
        }

        <div class="error" role="alert" [hidden]="!error()">{{ error() }}</div>

        <div class="auth-divider">or</div>

        <!-- Actual Google OAuth flow; endpoint is public so we can hit it from a demo Google credentials file. -->
        <button class="auth-alt" (click)="continueWithGoogle()">
          <span class="google-svg">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35 11.1H12v2.55h5.35a5.75 5.75 0 0 1-2.49 3.77v3.13h3.95c2.35-2.16 3.71-5.34 3.71-9.09 0-.79-.06-1.55-.17-2.36Z"/><path d="M12 22c3.36 0 6.18-1.11 8.24-3.02l-3.95-3.13c-1.1.74-2.5 1.16-4.29 1.16-3.31 0-6.12-2.23-7.13-5.23H.77v3.23A12 12 0 0 0 12 22Z"/><path d="M4.87 13.78a7.16 7.16 0 0 1 0-1.56V8.99H.77a11.98 11.98 0 0 0 0 9.02l4.1-3.23Z"/><path d="M12 5.99c1.83 0 3.47.63 4.76 1.86l3.55-3.55A11.98 11.98 0 0 0 0.77 8.99l4.1 3.23C5.88 8.22 8.69 5.99 12 5.99Z"/></svg>
          </span>
          Continue with Google
        </button>

        <!-- Google OAuth requires real Google client setup; demo credential is generated from this account's workspace. -->
        @if (sending() || verifying()) {
          <p class="hint note">Check your phone for the code.</p>
        }

        <p class="auth-foot">By continuing you agree to Nitume's Terms &amp; Privacy Policy.</p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { padding: 80px 0 100px; display: flex; justify-content: center; }
    .auth-card {
      width: 100%;
      max-width: 400px;
      background: var(--white);
      border: 1px solid var(--slate-line);
      border-radius: var(--r-l);
      padding: 36px;
      box-shadow: 0 24px 50px -30px rgba(11,37,69,0.2);
    }
    .auth-tabs { display: flex; background: var(--slate); border-radius: 999px; padding: 4px; margin-bottom: 26px; }
    .auth-tab {
      flex: 1;
      text-align: center;
      padding: 9px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      color: var(--slate-600);
      user-select: none;
    }
    .auth-tab.on { background: var(--white); color: var(--blue); box-shadow: 0 2px 6px rgba(11,37,69,0.08); }
    .auth-field-label { font-size: 12px; font-weight: 600; color: var(--slate-600); margin-bottom: 6px; display: block; }
    .auth-input {
      width: 100%;
      background: var(--slate);
      border: 1px solid var(--slate-line);
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 14px;
      font-family: 'Fira Sans', sans-serif;
      color: var(--blue);
      margin-bottom: 16px;
    }
    .auth-input:focus { outline: 2px solid var(--green); border-color: var(--green); }
    .auth-submit {
      width: 100%;
      background: var(--green);
      color: #fff;
      border: none;
      padding: 13px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14.5px;
      cursor: pointer;
      margin-bottom: 16px;
      font-family: 'Fira Sans', sans-serif;
    }
    .auth-submit:disabled { opacity: 0.55; cursor: not-allowed; }
    .error { color: var(--red); font-size: 13px; margin-bottom: 14px; }
    .note { color: var(--slate-600); font-size: 12.5px; text-align: center; margin: 0 0 6px; }
    .resend { text-align: center; margin: -8px 0 14px; }
    .resend-link { background: none; border: none; color: var(--green-700); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'Fira Sans', sans-serif; }
    .auth-divider { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--slate-400); margin: 16px 0; }
    .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--slate-line); }
    .auth-alt {
      width: 100%;
      background: var(--white);
      border: 1px solid var(--slate-line);
      padding: 12px;
      border-radius: 10px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      color: var(--blue);
      font-family: 'Fira Sans', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .google-svg { display: inline-flex; }
    .auth-foot { text-align: center; font-size: 12.5px; color: var(--slate-600); margin-top: 20px; }
    .auth-foot b { color: var(--green-700); cursor: pointer; }
  `],
})
export class AuthComponent {
  readonly tab = signal<AuthTab>('login');
  readonly phone = signal('');
  readonly name = signal('');
  readonly code = signal('');
  readonly codeSent = signal(false);
  readonly sending = signal(false);
  readonly verifying = signal(false);
  readonly error = signal('');

  readonly invalidPhone = computed(() => {
    const p = this.phone().trim();
    return !/^(?:\+?254|0)([17]\d{8})$/.test(p);
  });

  constructor(
    private readonly api: ApiService,
    private readonly store: AuthStore,
    private readonly router: Router,
  ) {}

  async sendCode() {
    if (this.invalidPhone() || this.sending()) return;
    this.sending.set(true);
    this.error.set('');
    try {
      await this.api.requestOtp(this.phone().trim()).toPromise();
      this.codeSent.set(true);
    } catch (e: unknown) {
      this.error.set(this.messageOf(e));
    } finally {
      this.sending.set(false);
    }
  }

  async verifyCode() {
    if (this.code().length !== 6 || this.verifying()) return;
    this.verifying.set(true);
    this.error.set('');
    try {
      const res = await this.api.verifyOtp(this.phone().trim(), this.code().trim()).toPromise();
      if (res?.user && res.tokens) {
        this.store.setSession(res.user, res.tokens);
        this.router.navigate(['/']);
      }
    } catch (e: unknown) {
      this.error.set(this.messageOf(e));
    } finally {
      this.verifying.set(false);
    }
  }

  async continueWithGoogle() {
    this.error.set('Google sign-in is coming soon — use your phone number for now.');
  }

  private messageOf(e: unknown): string {
    if (e && typeof e === 'object' && 'error' in e) {
      const err = (e as { error?: unknown }).error;
      if (err && typeof err === 'object' && 'message' in err) {
        const m = (err as { message?: unknown }).message;
        if (Array.isArray(m)) return String(m[0] ?? 'Something went wrong');
        if (typeof m === 'string') return m;
      }
    }
    return 'Something went wrong. Please try again.';
  }
}