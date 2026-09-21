import { Component, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly code = signal('');
  readonly error = signal<string | null>(null);
  readonly busy = signal<'idle' | 'sending' | 'verifying'>('idle');
  readonly sent = signal(false);

  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  readonly emailValid = computed(() => LoginComponent.EMAIL_REGEX.test(this.email()));

  onEmailInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.email.set(value);
    this.error.set(null);
  }

  onCodeInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
    this.code.set(value);
  }

  async sendCode(): Promise<void> {
    if (!this.emailValid() || this.busy() !== 'idle') return;
    this.error.set(null);
    this.busy.set('sending');
    try {
      await firstValueFrom(this.auth.requestEmailOtp(this.email()));
      this.sent.set(true);
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set('idle');
    }
  }

  async verify(): Promise<void> {
    console.log('wowww');
    console.log(this.busy() !== 'idle')
    console.log(this.code().length !== 6)

    if (this.busy() !== 'idle' || this.code().length !== 6) return;
    console.log('imepista')
    this.error.set(null);
    this.busy.set('verifying');
    try {
      console.log('submitting')
      await firstValueFrom(this.auth.verifyEmailOtp(this.email(), this.code()));
      await this.router.navigate(['/'], { replaceUrl: true });
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set('idle');
    }
  }

  private describe(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    return raw.replace(/^Error: /, '');
  }
}
