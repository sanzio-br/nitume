// `nm-auth-frame` (auth-foundation §7.4; Flutter AuthFrame `.auth-wrap`):
// full-viewport slate page, safe-area padding, optional header slot
// (`[nmAuthHeader]`: top of the viewport below 768px, inside the column
// 16px above the heading from 768px), centred 400px column, no card.
// Slots: `[nmAuthLead]` (wordmark), `[nmAuthSub]` (sub line), default.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NM_BP_MD_QUERY, mediaQuery } from '../overlay/viewport';

@Component({
  selector: 'nm-auth-frame',
  template: `
    <div class="nm-auth-frame" [class.nm-auth-frame--wide]="wide()">
      <div class="nm-auth-frame__inner">
        <div class="nm-auth-frame__header"><ng-content select="[nmAuthHeader]" /></div>
        <div class="nm-auth-frame__column">
          <ng-content select="[nmAuthLead]" />
          @if (heading(); as h) {
            <div class="nm-auth-frame__heading">
              <h1 class="nm-auth-frame__title">{{ h }}</h1>
              <p class="nm-auth-frame__sub"><ng-content select="[nmAuthSub]" /></p>
            </div>
          }
          <ng-content />
        </div>
      </div>
    </div>
  `,
  styleUrl: './auth-frame.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmAuthFrame {
  /** `h1` of the heading block (`auth-heading`); none → no heading block. */
  readonly heading = input<string | null>(null);

  protected readonly wide = mediaQuery(NM_BP_MD_QUERY);
}
