import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Ops sign-in (design `nitume_admin_dashboard.html → #login-screen`):
 * full-screen Deep Trust Blue with a white card. The committed auth contract
 * is phone-OTP (system design §10), so this surface runs the two-step OTP
 * flow: request a code → verify it. 2FA posture is preserved ("Protected by
 * two-factor authentication").
 */
@Component({
  selector: 'app-login',
  imports: [],
  template: `
    <div class="login-screen" data-nitume="auth-screen">
      <form class="login-card" (ngSubmit)="step() === 'otp' ? verify() : request()">
        @if (step() === 'request') {
          <div class="login-brand"><span class="dot"></span>Nitume Ops</div>
          <p class="login-sub">Internal access only. Sign in with your Nitume ops account.</p>

          @if (error()) {
            <div class="login-error" role="alert">{{ error() }}</div>
          }

          <label class="login-label" for="phone">Work phone</label>
          <input
            id="phone"
            class="login-input num"
            type="tel"
            [value]="phone()"
            (input)="phone.set($any($event.target).value)"
            name="phone"
            autocomplete="tel"
            placeholder="+2547…"
            required
          />
          <button class="login-submit btn-primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Sending…' : 'Request code' }}
          </button>
          <p class="login-foot">Protected by two-factor authentication · Nitume internal systems</p>
        } @else {
          <button type="button" class="login-back-link" (click)="back()">← Back</button>
          <div class="login-brand"><span class="dot"></span>Verify it's you</div>
          <p class="login-sub">Enter the 6-digit code sent to {{ phone() }}.</p>

          @if (error()) {
            <div class="login-error" role="alert">{{ error() }}</div>
          }

          <label class="login-label" for="code">One-time code</label>
          <input
            id="code"
            class="login-input num"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            pattern="[0-9]{6}"
            [value]="code()"
            (input)="code.set($any($event.target).value.replace(/D/g, ''))"
            name="code"
            placeholder="000000"
            required
          />
          <button
            class="login-submit btn-primary"
            type="submit"
            [disabled]="busy() || code().length !== 6"
          >
            {{ busy() ? 'Verifying…' : 'Verify & sign in' }}
          </button>
          <p class="login-foot">Lost your device? Contact your ops admin to reset 2FA.</p>
        }
      </form>
    </div>
  `,
  styles: [
    `
      .login-screen {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--nitume-blue);
      }
    `,
    `
      .login-card {
        width: 100%;
        max-width: 380px;
        background: var(--nitume-white);
        border-radius: var(--nitume-r-l);
        padding: 36px;
        box-shadow: 0 40px 90px -30px rgba(0, 0, 0, 0.4);
      }
    `,
    `
      .login-brand {
        display: flex;
        align-items: center;
        gap: 9px;
        font-weight: 700;
        font-size: 20px;
        color: var(--nitume-blue);
        margin-bottom: 6px;
      }
    `,
    `
      .login-brand .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--nitume-green);
      }
    `,
    `
      .login-sub {
        font-size: 13px;
        color: var(--nitume-slate-600);
        margin: 0 0 28px;
      }
    `,
    `
      .login-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--nitume-slate-600);
        margin-bottom: 6px;
        display: block;
      }
    `,
    `
      .login-input {
        width: 100%;
        background: var(--nitume-slate);
        border: 1px solid var(--nitume-slate-line);
        border-radius: 10px;
        padding: 12px 14px;
        font-size: 14px;
        color: var(--nitume-blue);
        margin-bottom: 16px;
      }
    `,
    `
      .login-input:focus {
        outline: 2px solid var(--nitume-green);
        outline-offset: 1px;
        border-color: var(--nitume-green);
      }
    `,
    `
      .login-submit {
        width: 100%;
        border: none;
        padding: 13px;
        border-radius: 10px;
        font-weight: 700;
        font-size: 14.5px;
        cursor: pointer;
        margin-bottom: 14px;
      }
    `,
    `
      .login-submit:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
    `,
    `
      .login-error {
        background: var(--nitume-red-050);
        color: var(--nitume-red);
        font-size: 12px;
        font-weight: 600;
        padding: 10px 12px;
        border-radius: 8px;
        margin-bottom: 16px;
      }
    `,
    `
      .login-back-link {
        font-size: 12.5px;
        color: var(--nitume-slate-600);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 20px;
        background: none;
        border: none;
        padding: 0;
        margin-left: -4px;
      }
    `,
    `
      .login-foot {
        text-align: center;
        font-size: 11.5px;
        color: var(--nitume-slate-400);
        margin: 6px 0 0;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly phone = signal('');
  readonly code = signal('');
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly step = signal<'request' | 'otp'>('request');

  async request(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(this.auth.requestOtp(this.phone()));
      this.code.set('');
      this.step.set('otp');
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  async verify(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.verifyOtp(this.phone(), this.code());
      await this.router.navigate(['/']);
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  back(): void {
    this.error.set(null);
    this.code.set('');
    this.step.set('request');
  }

  private describe(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    return raw.replace(/^Error: /, '');
  }
}
