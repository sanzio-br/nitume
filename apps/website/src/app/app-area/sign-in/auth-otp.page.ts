// customer / runner `v-auth-otp` (customer-v-auth-otp.md,
// runner-v-auth-otp.md): one component configured by route `data.role`.
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { WebSession } from '../../core/api-types';
import { AuthApi } from '../../core/auth/auth-api';
import {
  CODE_EXHAUSTED_COPY,
  CODE_EXPIRED_COPY,
  CODE_INCORRECT_COPY,
  CODE_REQUESTS_PREFIX,
  CODE_TOO_SHORT_COPY,
  DELIVERY_FAILED_COPY,
  NEW_CODE_SENT_COPY,
  NOT_ALLOWED_COPY,
  SUSPENDED_COPY,
  VERIFY_ATTEMPTS_PREFIX,
  WRONG_ACCOUNT_COPY,
} from '../../core/auth/auth-copy';
import { routeRole } from '../../core/auth/guards';
import {
  OTP_CODE_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  isRoleMismatch,
  isVerifySuspended,
  minutesFrom,
  otpErrorKind,
  retryAfter,
} from '../../core/auth/otp-policy';
import { destinationUrl, resolveDestination } from '../../core/auth/role-routing';
import { SessionStore } from '../../core/auth/session.store';
import { SignInFlowStore } from '../../core/auth/sign-in-flow.store';
import { formatPhoneIntl } from '../../shared/format/formatters';
import { NmNum } from '../../shared/format/num.directive';
import { NmAuthFrame } from '../../shared/ui/auth-frame/auth-frame.component';
import { NmBackEvent } from '../../shared/ui/back-button/back-button.component';
import { NmButton } from '../../shared/ui/button/button.component';
import { NmOtpField } from '../../shared/ui/otp-field/otp-field.component';
import { NmOtpResendLine } from '../../shared/ui/otp-resend-line/otp-resend-line.component';
import { NmToastService } from '../../shared/ui/overlay/toast.service';
import { NmPushedHeader } from '../../shared/ui/pushed-header/pushed-header.component';
import { friendlyError } from '../../shared/ui/states/friendly-error';
import { APP_LINKS } from '../app-links';
import { SignInMessage, SignInMessageComponent } from './sign-in-message.component';

const NAME_PATH = /^\/app\/(customer|runner)\/name(?:[?#]|$)/;

@Component({
  selector: 'app-auth-otp-page',
  imports: [
    NmAuthFrame,
    NmPushedHeader,
    NmOtpField,
    NmOtpResendLine,
    NmButton,
    NmNum,
    SignInMessageComponent,
  ],
  template: `
    <nm-auth-frame heading="Enter the code">
      <nm-pushed-header nmAuthHeader (back)="back($event)" />
      <span nmAuthSub>We sent a 6-digit code to <span nmNum>{{ formattedPhone }}</span>.</span>
      <form class="form" novalidate (submit)="submit($event)">
        <nm-otp-field
          [error]="codeError()"
          [disabled]="fieldDisabled()"
          (codeChange)="onCode($event)"
          (completed)="verify()"
        />
        <app-sign-in-message class="other centered" [message]="other()" [supportUrl]="links.supportUrl" />
        <nm-button
          class="submit"
          type="submit"
          [expand]="true"
          [loading]="verifying()"
          [disabled]="needsNewCode()"
          >Verify &amp; continue</nm-button
        >
      </form>
      @if (!resendHidden()) {
        <nm-otp-resend-line
          class="resend"
          [cooldownEndsAt]="cooldownEndsAt()"
          [sending]="sending()"
          (resend)="resend()"
        />
      }
    </nm-auth-frame>
  `,
  styles: `
    .form {
      margin: 0;
    }

    .other {
      margin-top: 10px;
    }

    .submit {
      display: block;
      margin-top: 22px;
    }

    .resend {
      margin-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthOtpPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionStore);
  private readonly flow = inject(SignInFlowStore);
  private readonly toast = inject(NmToastService);
  private readonly injector = inject(Injector);

  protected readonly role = routeRole(this.route.snapshot);
  protected readonly links = inject(APP_LINKS)[this.role];
  private readonly phone = this.flow.get(this.role)?.phone ?? '';
  protected readonly formattedPhone = formatPhoneIntl(this.phone);
  private readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

  private readonly field = viewChild.required(NmOtpField);
  private code = '';

  protected readonly codeError = signal<string | null>(null);
  protected readonly other = signal<SignInMessage | null>(null);
  /** Exhausted or expired: field and button stay disabled until a resend. */
  protected readonly needsNewCode = signal(false);
  protected readonly verifying = signal(false);
  protected readonly sending = signal(false);
  protected readonly resendHidden = signal(false);
  protected readonly cooldownEndsAt = signal(this.flow.get(this.role)?.cooldownEndsAt ?? Date.now());
  protected readonly fieldDisabled = computed(() => this.verifying() || this.needsNewCode());

  protected onCode(code: string): void {
    this.code = code;
    // Typing clears a code error, not a needs-new-code error.
    if (this.codeError() && !this.needsNewCode()) this.codeError.set(null);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    void this.verify();
  }

  protected async verify(): Promise<void> {
    if (this.verifying() || this.needsNewCode()) return;
    if (this.code.length < OTP_CODE_LENGTH) {
      this.codeError.set(CODE_TOO_SHORT_COPY);
      return;
    }
    this.verifying.set(true);
    this.codeError.set(null);
    this.other.set(null);
    let result: WebSession;
    try {
      result = await firstValueFrom(this.api.verifyOtp(this.phone, this.code, this.role));
    } catch (err) {
      await this.onVerifyError(err);
      return;
    }
    const user = await this.session.completeSignIn(result);
    const destination = resolveDestination({
      user,
      flowRole: this.role,
      fresh: true,
      returnUrl: this.returnUrl,
    });
    if (destination.kind === 'refuse') {
      await this.refuse(destination.reason === 'not-allowed' ? NOT_ALLOWED_COPY : WRONG_ACCOUNT_COPY);
      return;
    }
    const url = await destinationUrl(destination, this.api);
    this.flow.clear(this.role);
    // The name screen still needs the fresh flag (runner onboarding).
    if (!NAME_PATH.test(url)) this.session.takeFreshSignIn();
    await this.router.navigateByUrl(url, { replaceUrl: true });
  }

  protected async resend(): Promise<void> {
    if (this.sending()) return;
    this.sending.set(true);
    try {
      await firstValueFrom(this.api.requestOtp(this.phone));
    } catch (err) {
      this.sending.set(false);
      this.onResendError(err);
      return;
    }
    this.sending.set(false);
    this.toast.show(NEW_CODE_SENT_COPY);
    this.restartCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    this.needsNewCode.set(false);
    this.codeError.set(null);
    this.other.set(null);
    this.clearAndFocus();
  }

  protected back(event: NmBackEvent): void {
    event.preventDefault();
    void this.router.navigate(['/app', this.role, 'sign-in'], {
      queryParams: this.returnUrl ? { returnUrl: this.returnUrl } : {},
    });
  }

  private async onVerifyError(err: unknown): Promise<void> {
    if (isRoleMismatch(err)) {
      await this.refuse(WRONG_ACCOUNT_COPY);
      return;
    }
    this.verifying.set(false);
    const kind = otpErrorKind(err);
    switch (kind) {
      case 'incorrect':
        this.clearAndFocus(); // before the error: clearing counts as typing
        this.codeError.set(CODE_INCORRECT_COPY);
        return;
      case 'attemptsExhausted':
        this.codeError.set(CODE_EXHAUSTED_COPY);
        this.needsNewCode.set(true);
        return;
      case 'expired':
      case 'notRequested':
        this.codeError.set(CODE_EXPIRED_COPY);
        this.needsNewCode.set(true);
        return;
      case 'ipRateLimited': {
        // WQ-17 (owner, 2026-10-28).
        const seconds = retryAfter(err);
        this.other.set({
          kind: 'rate',
          prefix: VERIFY_ATTEMPTS_PREFIX,
          minutes: seconds === null ? null : minutesFrom(seconds),
        });
        return;
      }
    }
    if (isVerifySuspended(err)) {
      this.other.set({ kind: 'text', text: SUSPENDED_COPY, support: true });
      return;
    }
    // Includes 403 web_origin_not_allowed (a deployment error, F§4.3).
    this.other.set({ kind: 'text', text: friendlyError(err) });
  }

  private onResendError(err: unknown): void {
    const kind = otpErrorKind(err);
    if (kind === 'resendTooSoon') {
      this.restartCooldown(retryAfter(err) ?? OTP_RESEND_COOLDOWN_SECONDS);
      return;
    }
    if (kind === 'requestLimitReached' || kind === 'ipRateLimited') {
      const seconds = retryAfter(err);
      this.other.set({
        kind: 'rate',
        prefix: CODE_REQUESTS_PREFIX,
        minutes: seconds === null ? null : minutesFrom(seconds),
      });
      this.resendHidden.set(true);
      return;
    }
    this.other.set({
      kind: 'text',
      text: kind === 'deliveryFailed' ? DELIVERY_FAILED_COPY : friendlyError(err),
    });
  }

  /** Wrong account, role_mismatch or not-allowed: revoke what the API issued. */
  private async refuse(text: string): Promise<void> {
    await this.session.dropSession();
    this.verifying.set(false);
    this.other.set({ kind: 'text', text, support: true });
    this.clearAndFocus();
  }

  private restartCooldown(seconds: number): void {
    const endsAt = Date.now() + seconds * 1000;
    this.cooldownEndsAt.set(endsAt);
    this.flow.setCooldown(this.role, endsAt);
  }

  private clearAndFocus(): void {
    this.field().clear();
    this.code = '';
    afterNextRender(() => this.field().focus(), { injector: this.injector });
  }
}
