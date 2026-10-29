// `nm-category-tile` (customer-v-new-category §Components; Flutter
// CategoryTile C-15). White, slate-line border, r-m, padding 14 10; a 32px
// green-050 icon box with a 16px blue icon; the display name below
// (row-title 11.5, line-height 1.3). `select` mode is a radio (green border
// + 2px green-050 inner ring when selected, never a shadow); `link` mode is
// an `<a>` followed in-app, never selected.
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { categoryIcon, categoryName } from '../../format/category';
import { NmIcon } from '../icon/icon.component';
import { followInAppLink } from '../links';

export type NmCategoryMode = 'select' | 'link';

@Component({
  selector: 'nm-category-tile',
  imports: [NmIcon],
  template: `
    @if (mode() === 'link') {
      <a class="nm-category-tile" [attr.href]="href()" (click)="follow($event)">
        @if (icon(); as name) {
          <span class="nm-category-tile__icon"><nm-icon [name]="name" [size]="16" /></span>
        }
        <span class="nm-category-tile__label">{{ name() }}</span>
      </a>
    } @else {
      <button
        type="button"
        role="radio"
        class="nm-category-tile"
        [class.nm-category-tile--selected]="selected()"
        [attr.aria-checked]="selected() ? 'true' : 'false'"
        [attr.aria-posinset]="posinset()"
        [attr.aria-setsize]="setsize()"
        [attr.tabindex]="tabIndex()"
        (click)="pressed.emit()"
      >
        @if (icon(); as name) {
          <span class="nm-category-tile__icon"><nm-icon [name]="name" [size]="16" /></span>
        }
        <span class="nm-category-tile__label">{{ name() }}</span>
      </button>
    }
  `,
  styleUrl: './category-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmCategoryTile {
  /** Wire value; the tile shows the display name only. */
  readonly category = input.required<string>();
  readonly mode = input<NmCategoryMode>('select');
  readonly selected = input(false);
  readonly href = input<string | null>(null);
  readonly tabIndex = input(0);
  readonly posinset = input<number | null>(null);
  readonly setsize = input<number | null>(null);

  readonly pressed = output<void>();

  private readonly router = inject(Router);

  protected readonly name = computed(() => categoryName(this.category()));
  protected readonly icon = computed(() => categoryIcon(this.category()));

  protected follow(event: MouseEvent): void {
    const href = this.href();
    if (href) followInAppLink(event, href, this.router);
  }
}
