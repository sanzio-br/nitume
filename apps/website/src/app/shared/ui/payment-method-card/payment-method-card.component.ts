// `nm-payment-method-card` (#8 A§8; Flutter C-30 `PaymentMethodCard`,
// task_rows.dart). White row, slate-line border, r-m: the M-PESA brand
// badge (green fill, WHITE `tag` text, as built and audited in the app),
// the label (`row-title`) and the masked detail in `nmNum` meta, and an
// optional trailing slot (`[nmPaymentTrailing]`, e.g. `Change`). Reused by
// #12.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NmNum } from '../../format/num.directive';

@Component({
  selector: 'nm-payment-method-card',
  imports: [NmNum],
  template: `
    <div class="nm-payment-method-card">
      <span class="nm-payment-method-card__badge" aria-hidden="true">M-PESA</span>
      <span class="nm-payment-method-card__text">
        <span class="nm-payment-method-card__label">{{ label() }}</span>
        @if (detail(); as d) {
          <span class="nm-payment-method-card__detail" nmNum="meta">{{ d }}</span>
        }
      </span>
      <span class="nm-payment-method-card__trailing"><ng-content select="[nmPaymentTrailing]" /></span>
    </div>
  `,
  styleUrl: './payment-method-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmPaymentMethodCard {
  /** e.g. `M-Pesa`. */
  readonly label = input.required<string>();
  /** Masked number, e.g. `+254 712 ••• 678`. */
  readonly detail = input<string | null>(null);
}
