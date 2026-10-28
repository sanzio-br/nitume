// `nm-legal-line` (customer-v-auth-phone §Components; port of _LegalLine):
// `By continuing you agree to Nitume's <Terms> & <Privacy Policy>.` A part
// with a configured http(s)/mailto/tel URL is a link opening a new tab;
// otherwise plain text (F§8).
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NmButton } from '../button/button.component';
import { safeExternalUrl } from '../links';

const NEW_TAB = ' (opens in a new tab)';

@Component({
  selector: 'nm-legal-line',
  imports: [NmButton],
  template: `
    <p class="nm-legal">
      {{ lead }}
      @if (terms(); as url) {
        <nm-button
          variant="link"
          size="small"
          inline
          [href]="url"
          target="_blank"
          rel="noopener noreferrer"
          [ariaLabel]="termsLabel() + newTab"
          >{{ termsLabel() }}</nm-button
        >
      } @else {
        <span class="nm-legal__part">{{ termsLabel() }}</span>
      }
      &amp;
      @if (privacy(); as url) {
        <nm-button
          variant="link"
          size="small"
          inline
          [href]="url"
          target="_blank"
          rel="noopener noreferrer"
          [ariaLabel]="'Privacy Policy' + newTab"
          >Privacy Policy</nm-button
        >
      } @else {
        <span class="nm-legal__part">Privacy Policy</span>
      }<span>.</span>
    </p>
  `,
  styleUrl: './legal-line.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmLegalLine {
  /** `Terms` (customer) or `Runner Terms` (row 131). */
  readonly termsLabel = input('Terms');
  readonly termsUrl = input<string | null>(null);
  readonly privacyUrl = input<string | null>(null);

  protected readonly lead = "By continuing you agree to Nitume's";
  protected readonly newTab = NEW_TAB;
  protected readonly terms = computed(() => safeExternalUrl(this.termsUrl()));
  protected readonly privacy = computed(() => safeExternalUrl(this.privacyUrl()));
}
