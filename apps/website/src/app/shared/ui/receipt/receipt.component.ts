// Receipt parts (customer-v-new-review "Receipt parts"; Flutter ReceiptRow,
// ReceiptCaption, C-18). Built once in #7 with the values of
// customer-x-awaiting-quote.md §Components; #8 reuses them and #9/#10
// build the receipt card on them. No new type style (§W9a).
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NmNum } from '../../format/num.directive';
import { Amount, formatKesOrDash } from '../../format/formatters';

/** Label left (body 13 blue), amount right in `nmNum`; `isTotal` adds 700 and a top rule. */
@Component({
  selector: 'nm-receipt-row',
  imports: [NmNum],
  template: `
    <div class="nm-receipt-row" [class.nm-receipt-row--total]="isTotal()">
      <span class="nm-receipt-row__label">{{ label() }}</span>
      <span class="nm-receipt-row__amount" nmNum [nmNumLabel]="amountLabel()">{{ amountText() }}</span>
    </div>
  `,
  styleUrl: './receipt-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmReceiptRow {
  readonly label = input.required<string>();
  readonly amount = input<Amount | null>(null);
  readonly isTotal = input(false);
  /** Accessible name of the amount (e.g. `kesSpoken(total)`). */
  readonly amountLabel = input<string | null>(null);

  protected readonly amountText = computed(() => formatKesOrDash(this.amount()));
}

/** 12/400 slate-600 caption under a row (numbers inside in `<span nmNum>`). */
@Component({
  selector: 'nm-receipt-caption',
  template: `<p class="nm-receipt-caption"><ng-content /></p>`,
  styleUrl: './receipt-caption.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmReceiptCaption {}

/** A separate group (the item budget) under a hairline: 10px above, 4px padding. */
@Component({
  selector: 'nm-receipt-group',
  template: `<div class="nm-receipt-group"><ng-content /></div>`,
  styleUrl: './receipt-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmReceiptGroup {}
