// `nmNum` (ui-kit spec §5.1, Flutter NumText / NumSpan). Fira Code for
// numeric data only. An attribute component so the family and the numeric
// type styles come from the token mixins.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Numeric type styles (§2.4 `num-*`). */
export type NumStyle =
  | 'amount-lg'
  | 'amount'
  | 'num'
  | 'sm'
  | 'meta-lg'
  | 'meta'
  | 'progress'
  | 'otp'
  | 'resend';

@Component({
  selector: '[nmNum]',
  template: '<ng-content />',
  styleUrl: './num.directive.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nm-num',
    '[class]': 'styleClass()',
    '[attr.aria-label]': 'nmNumLabel() || null',
  },
})
export class NmNum {
  /** Empty (`<span nmNum>`): only the family changes (inherits the rest). */
  readonly nmNum = input<NumStyle | ''>('');
  /** Accessible name, e.g. `kesSpoken(amount)` for signed ledger amounts. */
  readonly nmNumLabel = input<string | null | undefined>(null);

  protected readonly styleClass = computed(() => {
    const style = this.nmNum();
    return style ? `nm-num--${style}` : '';
  });
}
