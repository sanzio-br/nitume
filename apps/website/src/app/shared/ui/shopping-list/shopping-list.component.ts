// `nm-shopping-list` (customer-v-new-details §nm-shopping-list; Flutter
// ShoppingListEditor C-37). Rows with hairlines between them: the item
// name (`maxlength` 80, names `Item n`), a quantity stepper (1–99, 32px
// circles in 48px hit areas, value in Fira Code) and a remove button
// (hidden for a single row). `+ Add item` is hidden at 30 rows and focuses
// the new row. Emits the full list (unnamed rows included); the view
// trims and validates.
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { NmNum } from '../../format/num.directive';
import { NmButton } from '../button/button.component';
import { NmField } from '../field/field.component';
import { NmFieldValue } from '../field/field-value.directive';
import { NmIcon } from '../icon/icon.component';

export interface NmShoppingItem {
  readonly name: string;
  readonly quantity: number;
}

export const SHOPPING_LIST_MAX_ROWS = 30;
export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 99;

@Component({
  selector: 'nm-shopping-list',
  imports: [NmField, NmFieldValue, NmIcon, NmNum, NmButton],
  template: `
    <div class="nm-shopping-list">
      @for (item of items(); track $index; let i = $index) {
        <div class="nm-shopping-list__row">
          <nm-field
            class="nm-shopping-list__name"
            [label]="'Item ' + (i + 1)"
            [hideLabel]="true"
            placeholder="Item, e.g. 2kg sugar"
            [maxLength]="80"
            [nmFieldValue]="item.name"
            (nmFieldValueChange)="rename(i, $event)"
          />
          <div class="nm-shopping-list__stepper">
            <button
              type="button"
              class="nm-shopping-list__step"
              [attr.aria-label]="'Decrease quantity' + suffix(item)"
              [attr.aria-disabled]="item.quantity <= min ? 'true' : null"
              (click)="change(i, -1)"
            >
              <span class="nm-shopping-list__circle"><nm-icon name="remove" [size]="16" /></span>
            </button>
            <span class="nm-shopping-list__qty"
              ><span class="nm-shopping-list__hidden">Quantity </span><span nmNum>{{ item.quantity }}</span></span
            >
            <button
              type="button"
              class="nm-shopping-list__step"
              [attr.aria-label]="'Increase quantity' + suffix(item)"
              [attr.aria-disabled]="item.quantity >= max ? 'true' : null"
              (click)="change(i, 1)"
            >
              <span class="nm-shopping-list__circle"><nm-icon name="add" [size]="16" /></span>
            </button>
          </div>
          @if (items().length > 1) {
            <button type="button" class="nm-shopping-list__remove" [attr.aria-label]="'Remove item' + nameSuffix(item)" (click)="remove(i)">
              <nm-icon name="close" [size]="18" />
            </button>
          }
        </div>
      }
    </div>
    @if (items().length < maxRows) {
      <nm-button class="nm-shopping-list__add" variant="link" size="small" (pressed)="add()">+ Add item</nm-button>
    }
    @if (error(); as message) {
      <p class="nm-shopping-list__error" role="alert">{{ message }}</p>
    }
  `,
  styleUrl: './shopping-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmShoppingList implements AfterViewChecked {
  readonly items = input.required<readonly NmShoppingItem[]>();
  /** `Add at least one item.` from the view. */
  readonly error = input<string | null>(null);

  readonly itemsChange = output<NmShoppingItem[]>();

  protected readonly min = QUANTITY_MIN;
  protected readonly max = QUANTITY_MAX;
  protected readonly maxRows = SHOPPING_LIST_MAX_ROWS;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private pendingFocus: number | null = null;

  /** Focus the row added by `+ Add item` once it is rendered. */
  ngAfterViewChecked(): void {
    if (this.pendingFocus === null) return;
    const input = this.host.querySelectorAll<HTMLInputElement>('.nm-shopping-list__name input')[this.pendingFocus];
    if (!input) return;
    this.pendingFocus = null;
    input.focus();
  }

  protected suffix(item: NmShoppingItem): string {
    const name = item.name.trim();
    return name ? ` of ${name}` : '';
  }

  protected nameSuffix(item: NmShoppingItem): string {
    const name = item.name.trim();
    return name ? ` ${name}` : '';
  }

  protected rename(index: number, name: string): void {
    this.emit(this.items().map((item, i) => (i === index ? { ...item, name } : item)));
  }

  protected change(index: number, delta: number): void {
    const item = this.items()[index];
    const quantity = item.quantity + delta;
    if (quantity < QUANTITY_MIN || quantity > QUANTITY_MAX) return;
    this.emit(this.items().map((it, i) => (i === index ? { ...it, quantity } : it)));
  }

  protected remove(index: number): void {
    if (this.items().length <= 1) return;
    this.emit(this.items().filter((_, i) => i !== index));
  }

  protected add(): void {
    if (this.items().length >= SHOPPING_LIST_MAX_ROWS) return;
    this.pendingFocus = this.items().length;
    this.emit([...this.items(), { name: '', quantity: 1 }]);
  }

  private emit(items: NmShoppingItem[]): void {
    this.itemsChange.emit(items);
  }
}
