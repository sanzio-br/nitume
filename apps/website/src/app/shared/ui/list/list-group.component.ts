// `nm-list-group` (ui-kit spec §4.3.2; design-system `.list-demo`,
// Flutter NitumeListGroup). Hairlines between `nm-list-item`s, none after
// the last.
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'nm-list-group',
  template: `<ul class="nm-list" role="list"><ng-content /></ul>`,
  styles: `
    :host {
      display: block;
    }

    .nm-list {
      margin: 0;
      padding: 0;
      list-style: none;
      background-color: var(--nitume-white);
      border: 1px solid var(--nitume-slate-line);
      border-radius: var(--nitume-r-m);
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmListGroup {}
