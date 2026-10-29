// `nm-category-grid` (customer-v-new-category §Components): three columns at
// every width, gap 10, the five MVP tiles in canonical order (the sixth cell
// stays empty). `select` mode is a radiogroup with a roving tabindex: Tab
// enters on the selected tile (else the first), arrow keys move and select
// with wrap-around, Space selects. `link` mode renders links from `linkFor`.
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { CUSTOMER_MVP_CATEGORIES } from '../../format/category';
import { NmCategoryMode, NmCategoryTile } from './category-tile.component';

const NEXT_KEYS = ['ArrowRight', 'ArrowDown'];
const PREVIOUS_KEYS = ['ArrowLeft', 'ArrowUp'];

@Component({
  selector: 'nm-category-grid',
  imports: [NmCategoryTile],
  template: `
    <div
      class="nm-category-grid"
      [attr.role]="mode() === 'select' ? 'radiogroup' : null"
      [attr.aria-labelledby]="mode() === 'select' ? labelledBy() : null"
      (keydown)="onKeydown($event)"
    >
      @for (category of categories(); track category; let i = $index) {
        <nm-category-tile
          [category]="category"
          [mode]="mode()"
          [selected]="mode() === 'select' && selected() === category"
          [href]="mode() === 'link' ? (linkFor()?.(category) ?? null) : null"
          [tabIndex]="tabIndexFor(category, i)"
          [posinset]="i + 1"
          [setsize]="categories().length"
          (pressed)="selectedChange.emit(category)"
        />
      }
    </div>
  `,
  styleUrl: './category-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmCategoryGrid {
  readonly categories = input<readonly string[]>(CUSTOMER_MVP_CATEGORIES);
  readonly selected = input<string | null>(null);
  readonly mode = input<NmCategoryMode>('select');
  /** Id of the section label that names the radiogroup. */
  readonly labelledBy = input<string | null>(null);
  /** Link mode: the target of a tile (e.g. `customerLinks.newTask`). */
  readonly linkFor = input<((category: string) => string) | null>(null);

  readonly selectedChange = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected tabIndexFor(category: string, index: number): number {
    const selected = this.selected();
    const anchor = selected && this.categories().includes(selected) ? selected : this.categories()[0];
    return category === anchor || (!anchor && index === 0) ? 0 : -1;
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.mode() !== 'select') return;
    const step = NEXT_KEYS.includes(event.key) ? 1 : PREVIOUS_KEYS.includes(event.key) ? -1 : 0;
    if (!step) return;
    const radios = Array.from(this.host.querySelectorAll<HTMLElement>('[role="radio"]'));
    const current = radios.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    event.preventDefault();
    const next = (current + step + radios.length) % radios.length;
    this.selectedChange.emit(this.categories()[next]);
    radios[next].focus();
  }
}
