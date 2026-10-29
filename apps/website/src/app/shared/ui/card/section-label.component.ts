// `nm-section-label` (ui-kit spec §4.4; Flutter SectionLabel C-08).
// Uppercase through CSS only: the DOM keeps sentence case.
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nm-section-label',
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #text><ng-content /></ng-template>
    @switch (level()) {
      @case (1) {
        <h1 class="nm-section-label" [class.nm-section-label--flush]="!inset()"><ng-container [ngTemplateOutlet]="text" /></h1>
      }
      @case (3) {
        <h3 class="nm-section-label" [class.nm-section-label--flush]="!inset()"><ng-container [ngTemplateOutlet]="text" /></h3>
      }
      @case (4) {
        <h4 class="nm-section-label" [class.nm-section-label--flush]="!inset()"><ng-container [ngTemplateOutlet]="text" /></h4>
      }
      @default {
        <h2 class="nm-section-label" [class.nm-section-label--flush]="!inset()"><ng-container [ngTemplateOutlet]="text" /></h2>
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
