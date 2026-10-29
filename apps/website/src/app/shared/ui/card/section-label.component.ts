// `nm-section-label` (ui-kit spec §4.4; Flutter SectionLabel C-08).
// Uppercase through CSS only: the DOM keeps sentence case. Text is
// projected through `nmTemplateOutlet` (WQ-33, #7 §W9a).
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NmTemplateOutlet } from '../template-outlet.directive';

@Component({
  selector: 'nm-section-label',
  imports: [NmTemplateOutlet],
  template: `
    <ng-template #text><ng-content /></ng-template>
    @switch (level()) {
      @case (1) {
        <h1 class="nm-section-label" [class.nm-section-label--flush]="!inset()"><ng-container [nmTemplateOutlet]="text" /></h1>
      }
      @case (3) {
        <h3 class="nm-section-label" [class.nm-section-label--flush]="!inset()"><ng-container [nmTemplateOutlet]="text" /></h3>
      }
      @case (4) {
        <h4 class="nm-section-label" [class.nm-section-label--flush]="!inset()"><ng-container [nmTemplateOutlet]="text" /></h4>
      }
      @default {
        <h2 class="nm-section-label" [class.nm-section-label--flush]="!inset()"><ng-container [nmTemplateOutlet]="text" /></h2>
      }
    }
  `,
  styleUrl: './section-label.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmSectionLabel {
  /** Heading level the view passes (default 2). */
  readonly level = input<1 | 2 | 3 | 4>(2);
  /** Horizontal 20px padding; false inside an already padded column. */
  readonly inset = input(true);
}
