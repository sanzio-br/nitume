// `nm-app-nav` (auth-foundation §7.3; web adaptation of C-13 NitumeTabBar).
// One `<nav aria-label="Main">` with a list of page links; `layout`
// switches it between the bottom bar (below 768px) and the white side nav
// (from 768px, WQ-16). Active item: green-700 + filled icon,
// `aria-current="page"`.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NmIcon } from '../icon/icon.component';
import { NmIconName } from '../icon/icons';
import { NmWordmark } from '../wordmark/wordmark.component';

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: NmIconName;
  readonly activeIcon: NmIconName;
  readonly link: string;
}

export type NmAppNavLayout = 'bar' | 'side';

@Component({
  selector: 'nm-app-nav',
  imports: [NmIcon, NmWordmark, RouterLink],
  template: `
    <nav class="nm-app-nav" [class]="'nm-app-nav nm-app-nav--' + layout()" aria-label="Main">
      <nm-wordmark class="nm-app-nav__wordmark" [suffix]="wordmarkSuffix()" [href]="homeLink()" />
      <ul class="nm-app-nav__list">
        @for (item of items(); track item.key) {
          @let active = item.key === activeKey();
          <li class="nm-app-nav__entry">
            <a
              class="nm-app-nav__item"
              [class.nm-app-nav__item--active]="active"
              [routerLink]="item.link"
              [attr.aria-current]="active ? 'page' : null"
            >
              <nm-icon [name]="active ? item.activeIcon : item.icon" [size]="21" />
              <span class="nm-app-nav__label">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styleUrl: './app-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmAppNav {
  readonly items = input.required<readonly NavItem[]>();
  /** Route `data.navKey` of the current page. */
  readonly activeKey = input<string | null>(null);
  readonly layout = input<NmAppNavLayout>('bar');
  /** `Runner` in the runner area (side nav wordmark). */
  readonly wordmarkSuffix = input<string | null>(null);
  /** Role home, target of the side-nav wordmark. */
  readonly homeLink = input<string | null>(null);
}
