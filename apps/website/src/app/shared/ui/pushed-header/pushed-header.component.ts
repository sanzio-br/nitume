// `nm-pushed-header` (auth-foundation §7.2; C-10 NitumePushedHeader): back
// button, optional `pushed-title` h1, optional `Step n of m` (`num-meta`), or a
// trailing slot (`[nmPushedTrailing]`). `backDisabled` (#7) disables Back.
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NmNum } from '../../format/num.directive';
import { NmBackButton, NmBackEvent } from '../back-button/back-button.component';

@Component({
  selector: 'nm-pushed-header',
  imports: [NmBackButton, NmNum],
  template: `
    <div class="nm-pushed-header">
      <nm-back-button [fallback]="fallback()" [disabled]="backDisabled()" (back)="back.emit($event)" />
      @if (title(); as t) {
        <h1 class="nm-pushed-header__title">{{ t }}</h1>
      } @else {
        <span class="nm-pushed-header__spacer"></span>
      }
      @if (step() && steps()) {
        <span class="nm-pushed-header__step" nmNum="meta">Step {{ step() }} of {{ steps() }}</span>
      }
      <ng-content select="[nmPushedTrailing]" />
    </div>
  `,
  styleUrl: './pushed-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmPushedHeader {
  readonly title = input<string | null>(null);
  readonly step = input<number | null>(null);
  readonly steps = input<number | null>(null);
  /** Back target when the previous page is not inside `/app`. */
  readonly fallback = input<string | null>(null);
  /** Passed to the back button's `disabled` (#7, §W9a). */
  readonly backDisabled = input(false);

  /** Re-emits the back button's event (call `preventDefault()` to handle it). */
  readonly back = output<NmBackEvent>();
}
