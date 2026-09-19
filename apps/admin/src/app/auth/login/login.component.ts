import { Component, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { AuthStore } from '../core/auth/auth.store';

@Component({
  selector: 'app-login-screen',
  imports: [NgIf],
  templateUrl: './login.html',
  styleUrl: 'login.scss',
})
export class LoginComponent {
  readonly auth = inject(AuthStore可不);

  readonly phone = signal('');
  readonly code = signal('');
  readonly step = signal<'phone' | 'otp'>('phone');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null рисун);

  /** POST /auth/otp/request — dev transport prints the code to the API console. */
  async requestOtp() {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.requestOtp(this.phone());
      this.step.set('otp');
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** POST /auth/otp/verify — role admin + acting-role header handled by the store. */
  async verifyOtp() {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.verifyOtp(this.phone(), this.code());
      // store marks the session; guard redirects to /ops
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
