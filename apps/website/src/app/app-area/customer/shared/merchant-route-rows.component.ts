// `nm-merchant-route-rows` (#8 A§8; app `MerchantRouteRows`): the two item
// routes as `nm-radio-row`s in a radiogroup (gap 8). Merchant-direct is
// disabled with its pending subtitle until the merchant's details exist
// (row 43). Nothing is preselected unless `selected` says so. Never a
// `runner_advance` option (OA-5). Used by the checkout and the price-change
// dialog.
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NmRadioRow } from '../../../shared/ui/radio-row/radio-row.component';
import type { MerchantRoute } from '../data/checkout.api';

export const ROUTE_COPY = {
  direct: 'Pay merchant directly (recommended)',
  directAvailable: "You'll see the merchant's Till or Paybill number after paying the fees.",
  directPending: "Available once the merchant's details are added.",
  runner: 'Send purchase amount to runner',
  runnerSub: "You'll pay this amount to Nitume by M-Pesa together with the fees, for your runner's purchase.",
} as const;

let nextId = 0;

@Component({
  selector: 'nm-merchant-route-rows',
  imports: [NmRadioRow],
  template: `
    <div class="nm-route-rows" role="radiogroup" [attr.aria-label]="ariaLabel()">
      <nm-radio-row
        [name]="name"
        value="merchant_direct"
        [label]="copy.direct"
        [subtitle]="directSubtitle()"
        [selected]="selected() === 'merchant_direct'"
        [disabled]="disabled() || !merchantDetailsAvailable()"
        (chosen)="pick($event)"
      />
      <nm-radio-row
        [name]="name"
        value="send_to_runner"
        [label]="copy.runner"
        [subtitle]="copy.runnerSub"
        [selected]="selected() === 'send_to_runner'"
        [disabled]="disabled()"
        (chosen)="pick($event)"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .nm-route-rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmMerchantRouteRows {
  readonly selected = input<MerchantRoute | null>(null);
  readonly merchantDetailsAvailable = input(false);
  readonly disabled = input(false);
  /** Group name (the card heading's text). */
  readonly ariaLabel = input('How should this be paid?');

  readonly selectedChange = output<MerchantRoute>();

  protected readonly copy = ROUTE_COPY;
  protected readonly name = `nm-merchant-route-${nextId++}`;
  protected readonly directSubtitle = computed(() =>
    this.merchantDetailsAvailable() ? ROUTE_COPY.directAvailable : ROUTE_COPY.directPending,
  );

  protected pick(value: string): void {
    if (value === 'merchant_direct' || value === 'send_to_runner') this.selectedChange.emit(value);
  }
}
