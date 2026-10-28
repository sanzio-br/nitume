// customer / runner `v-auth-phone` (customer-v-auth-phone.md,
// runner-v-auth-phone.md): one component configured by route `data.role`.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApi } from '../../core/auth/auth-api';
import {
  CODE_REQUESTS_PREFIX,
  DELIVERY_FAILED_COPY,
  INVALID_PHONE_COPY,
  NOT_ALLOWED_COPY,
  SESSION_EXPIRED_COPY,
  SUSPENDED_COPY,
} from '../../core/auth/auth-copy';
import { routeRole } from '../../core/auth/guards';
import { OTP_RESEND_COOLDOWN_SECONDS, minutesFrom, otpErrorKind, retryAfter } from '../../core/auth/otp-policy';
import { SignInFlowStore } from '../../core/auth/sign-in-flow.store';
import { formatPhoneIntl, normalizeKenyanPhone } from '../../shared/format/formatters';
import { NmAuthFrame } from '../../shared/ui/auth-frame/auth-frame.component';
import { NmButton } from '../../shared/ui/button/button.component';
import { NmField } from '../../shared/ui/field/field.component';
import { NmLegalLine } from '../../shared/ui/legal-line/legal-line.component';
import { NmToastService } from '../../shared/ui/overlay/toast.service';
import { friendlyError } from '../../shared/ui/states/friendly-error';
import { NmWordmark } from '../../shared/ui/wordmark/wordmark.component';
import { APP_LINKS } from '../app-links';
import { PHONE_COPY, wordmarkSuffix } from './sign-in-copy';
import { SignInMessage, SignInMessageComponent } from './sign-in-message.component';

/** F§4.5 toasts for `?signedOut=`; any other value shows nothing. */
const SIGNED_OUT_TOASTS: Readonly<Record<string, string>> = {
  expired: SESSION_EXPIRED_COPY,
  suspended: SUSPENDED_COPY,
  'not-allowed': NOT_ALLOWED_COPY,
};

@Component({
  selector: 'app-auth-phone-page',
  imports: [
    NmAuthFrame,
    NmWordmark,
    NmField,
    NmButton,
    NmLegalLine,
    ReactiveFormsModule,
    SignInMessageComponent,
  ],
  template: `
    <nm-auth-frame [heading]="copy.heading">
      <nm-wordmark nmAuthLead class="wordmark" [suffix]="suffix" />
      <span nmAuthSub>{{ copy.sub }}</span>
      <form class="form" novalidate (submit)="submit($event)">
        <nm-field
          kind="phone"
          label="Phone number"
          [hideLabel]="true"
          placeholder="+254 7XX XXX XXX"
          [formControl]="phone"
          [error]="fieldError()"
          [readonly]="loading()"
        />
        <app-sign-in-message class="other" [message]="other()" />
        <nm-button class="submit" type="submit" [expand]="true" [loading]="loading()">Send code</nm-button>
      </form>
      <nm-legal-line
        class="legal"
        [termsLabel]="copy.termsLabel"
        [termsUrl]="links.termsUrl"
        [privacyUrl]="links.privacyUrl"
      />
    </nm-auth-frame>
  `,
  styles: `
    .wordmark {
      display: block;
      margin-bottom: 30px;
    }

    .form {
      margin: 0;
    }

    .other {
      margin-top: 8px;
    }

    .submit {
      margin-top: 16px;
    }

    .legal {
      margin-top: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPhonePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AuthApi);
  private readonly flow = inject(SignInFlowStore);
  private readonly toast = inject(NmToastService);

  protected readonly role = routeRole(this.route.snapshot);
  protected readonly copy = PHONE_COPY[this.role];
  protected readonly suffix = wordmarkSuffix(this.role);
  protected readonly links = inject(APP_LINKS)[this.role];

  protected readonly phone = new FormControl(this.prefill(), { nonNullable: true });
  protected readonly fieldError = signal<string | null>(null);
  protected readonly other = signal<SignInMessage | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    this.phone.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.fieldError.set(null));
    this.showSignedOutToast();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.loading()) return;
    const phone = normalizeKenyanPhone(this.phone.value);
    if (!phone) {
      this.fieldError.set(INVALID_PHONE_COPY);
      return;
    }
    this.other.set(null);
    this.loading.set(true);
    this.api.requestOtp(phone).subscribe({
      next: () => this.goToCode(phone, Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000),
      error: (err: unknown) => this.onError(phone, err),
    });
  }

  private onError(phone: string, err: unknown): void {
    const kind = otpErrorKind(err);
    if (kind === 'resendTooSoon') {
      // Cooldown still running: go to the code screen, no error.
      const seconds = retryAfter(err) ?? OTP_RESEND_COOLDOWN_SECONDS;
      this.goToCode(phone, Date.now() + seconds * 1000);
      return;
    }
    this.loading.set(false);
    if (kind === 'requestLimitReached' || kind === 'ipRateLimited') {
      const seconds = retryAfter(err);
      this.other.set({
        kind: 'rate',
        prefix: CODE_REQUESTS_PREFIX,
        minutes: seconds === null ? null : minutesFrom(seconds),
      });
    } else if (kind === 'deliveryFailed') {
      this.other.set({ kind: 'text', text: DELIVERY_FAILED_COPY });
    } else {
      this.other.set({ kind: 'text', text: friendlyError(err) });
    }
  }

  private goToCode(phone: string, cooldownEndsAt: number): void {
    this.flow.set(this.role, { phone, cooldownEndsAt });
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    void this.router.navigate(['/app', this.role, 'sign-in', 'code'], {
      queryParams: returnUrl ? { returnUrl } : {},
    });
  }

  /** Back from the code screen: the number stays (F§6.6). */
  private prefill(): string {
    const stored = this.flow.get(this.role)?.phone;
    return stored ? formatPhoneIntl(stored) : '';
  }

  /** F§4.5 step 6: once, then the parameter is stripped. */
  private showSignedOutToast(): void {
    const reason = this.route.snapshot.queryParamMap.get('signedOut');
    if (reason === null) return;
    const message = Object.hasOwn(SIGNED_OUT_TOASTS, reason) ? SIGNED_OUT_TOASTS[reason] : null;
    if (message) this.toast.show(message);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { signedOut: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
