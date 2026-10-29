// `nm-otp-resend-line` (customer-v-auth-otp §Components; port of C-38
// OtpResendLine). The countdown is computed from the clock each second, so a
// throttled background tab cannot drift. Screen readers hear it only at the
// start and at zero.
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { formatCountdown } from '../../format/formatters';
import { NmNum } from '../../format/num.directive';
import { NmButton } from '../button/button.component';

export const RESEND_NOW_ANNOUNCEMENT = 'You can resend the code now.';

@Component({
  selector: 'nm-otp-resend-line',
  imports: [NmButton, NmNum],
  template: `
    <div class="nm-resend">
      @if (remaining() > 0) {
        <p class="nm-resend__line" aria-hidden="true">
          Didn't get it? Resend code in <span class="nm-resend__count" nmNum="resend">{{ countdown() }}</span>
        </p>
      } @else {
        <p class="nm-resend__line">
          Didn't get it?
          <nm-button variant="link" size="small" [disabled]="sending()" (pressed)="resend.emit()">Resend code</nm-button>
        </p>
      }
      <span class="nm-resend__live" aria-live="polite">{{ announcement() }}</span>
    </div>
  `,
  styleUrl: './otp-resend-line.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmOtpResendLine {
  /** Epoch ms when Resend becomes available. */
  readonly cooldownEndsAt = input.required<number>();
  readonly sending = input(false);

  readonly resend = output<void>();

  /** The clock, re-read whenever the cooldown (re)starts and every second. */
  private readonly now = linkedSignal({ source: this.cooldownEndsAt, computation: () => Date.now() });

  protected readonly remaining = computed(() =>
    Math.max(0, Math.ceil((this.cooldownEndsAt() - this.now()) / 1000)),
  );
  protected readonly countdown = computed(() => formatCountdown(this.remaining()));

  /** Seconds left when the cooldown (re)started; only cooldownEndsAt re-runs it. */
  private readonly startSeconds = computed(() =>
    Math.max(0, Math.ceil((this.cooldownEndsAt() - Date.now()) / 1000)),
  );
  protected readonly announcement = computed(() =>
    this.remaining() === 0
      ? RESEND_NOW_ANNOUNCEMENT
      : `You can resend in ${this.startSeconds()} seconds.`,
  );

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
