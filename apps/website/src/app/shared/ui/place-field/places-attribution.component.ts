// `nm-places-attribution` (customer-v-new-details §Places, owner WQ-26):
// Google's own attribution asset, unmodified, 16px high, left-aligned on
// the white list, with Google's minimum clear space (at least 10px left,
// right and top, 5px below; re-audit 1). No Nitume copy, no link.
import { ChangeDetectionStrategy, Component } from '@angular/core';

export const GOOGLE_ATTRIBUTION_SRC = 'assets/third-party/google-maps-attribution.svg';

@Component({
  selector: 'nm-places-attribution',
  template: `<div class="nm-places-attribution"><img class="nm-places-attribution__logo" [src]="src" alt="Google Maps" height="16" /></div>`,
  styles: `
    :host {
      display: block;
    }

    .nm-places-attribution {
      padding: 10px 10px 5px;
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
