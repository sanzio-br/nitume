// `nm-pulsing-dots` (#8 A§8; Flutter `PulsingDots`, brand.dart): three 7px
// slate-400 dots pulsing in turn (CSS keyframes only, no JS timer), in a
// `role="status"` region named by the visually hidden `label`. Static
// under `prefers-reduced-motion`.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nm-pulsing-dots',
  template: `
    <span class="nm-dots" role="status">
      <span class="nm-dots__dot" aria-hidden="true"></span>
      <span class="nm-dots__dot" aria-hidden="true"></span>
      <span class="nm-dots__dot" aria-hidden="true"></span>
      <span class="nm-dots__label">{{ label() }}</span>
    </span>
  `,
  styleUrl: './pulsing-dots.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmPulsingDots {
  /** Announced text, e.g. `Waiting for your quote`. */
  readonly label = input.required<string>();
}
