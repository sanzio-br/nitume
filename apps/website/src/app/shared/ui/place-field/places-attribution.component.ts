// `nm-places-attribution` (customer-v-new-details §Places, owner WQ-26):
// Google's own attribution asset, unmodified, 16px high, left-aligned on
// the white list, 8px above and below. No Nitume copy, no link.
import { ChangeDetectionStrategy, Component } from '@angular/core';

export const GOOGLE_ATTRIBUTION_SRC = 'assets/third-party/google-maps-attribution.svg';

@Component({
  selector: 'nm-places-attribution',
  template: `<img class="nm-places-attribution__logo" [src]="src" alt="Google Maps" height="16" />`,
  styles: `
    :host {
      display: block;
      padding: 8px 0;
    }

    .nm-places-attribution__logo {
      display: block;
      width: auto;
      height: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmPlacesAttribution {
  protected readonly src = GOOGLE_ATTRIBUTION_SRC;
}
