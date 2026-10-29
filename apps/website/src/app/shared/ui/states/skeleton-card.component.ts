// `nm-skeleton-card` (ui-kit spec §4.7; Flutter SkeletonCard C-33). Static:
// no shimmer.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nm-skeleton-card',
  template: `
    <div class="nm-skeleton" role="status" aria-label="Loading" [style.height.px]="height()">
      <span class="nm-skeleton__bar nm-skeleton__bar--title"></span>
      <span class="nm-skeleton__bar nm-skeleton__bar--meta"></span>
    </div>
  `,
  styleUrl: './states.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmSkeletonCard {
  readonly height = input(72);
}
