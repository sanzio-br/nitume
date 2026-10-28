// The "other error" line of the sign-in screens (customer-v-auth-phone and
// customer-v-auth-otp Layout): `error` style, role="alert", N minutes in
// N minutes in `nmNum` for the rate limits, optional `Contact support` link.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CONTACT_SUPPORT_LABEL, RATE_IN_PREFIX, RATE_LATER_SUFFIX, RATE_MIN_SUFFIX } from '../../core/auth/auth-copy';
import { NmNum } from '../../shared/format/num.directive';
import { NmButton } from '../../shared/ui/button/button.component';
import { safeExternalUrl } from '../../shared/ui/links';

export type SignInMessage =
  | { readonly kind: 'text'; readonly text: string; readonly support?: boolean }
  /** `<prefix> in <N> min.` or `<prefix> later.` */
  | { readonly kind: 'rate'; readonly prefix: string; readonly minutes: number | null };

@Component({
  selector: 'app-sign-in-message',
  imports: [NmNum, NmButton],
  template: `
    @if (message(); as m) {
      <p class="message" role="alert">
        @if (m.kind === 'rate') {
          {{ m.prefix }}{{ m.minutes === null ? later : inPrefix }}@if (m.minutes !== null) {<span nmNum>{{ m.minutes }}</span>{{ minSuffix }}}
        } @else {
          {{ m.text }}
        }
      </p>
      @if (m.kind === 'text' && m.support && support(); as url) {
        <nm-button
          class="support"
          variant="link"
          size="small"
          [href]="url"
          target="_blank"
          rel="noopener noreferrer"
          [ariaLabel]="supportLabel + ' (opens in a new tab)'"
          >{{ supportLabel }}</nm-button
        >
      }
    }
  `,
  styles: `
    @use '../../../styles/tokens' as * with ($nm-emit-root: false);

    :host {
      display: block;
    }

    :host(.centered) {
      text-align: center;
    }

    .message {
      @include nm-type(error);
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInMessageComponent {
  readonly message = input<SignInMessage | null>(null);
  /** The role's configured support URL (shown only for `support` messages). */
  readonly supportUrl = input<string | null>(null);

  protected readonly support = computed(() => safeExternalUrl(this.supportUrl()));
  protected readonly later = RATE_LATER_SUFFIX;
  protected readonly inPrefix = RATE_IN_PREFIX;
  protected readonly minSuffix = RATE_MIN_SUFFIX;
  protected readonly supportLabel = CONTACT_SUPPORT_LABEL;
}
