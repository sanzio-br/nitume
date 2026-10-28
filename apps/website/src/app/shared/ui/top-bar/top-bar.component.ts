// `nm-top-bar` (auth-foundation §7.2; C-9 NitumeTopBar): optional greeting,
// `top-bar-title` h1 (none when the title is empty), trailing actions slot.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nm-top-bar',
  template: `
    <div class="nm-top-bar">
      <div class="nm-top-bar__text">
        @if (greeting(); as g) {
          <p class="nm-top-bar__greeting">{{ g }}</p>
        }
        @if (title(); as t) {
          <h1 class="nm-top-bar__title">{{ t }}</h1>
        }
      </div>
      <div class="nm-top-bar__actions"><ng-content /></div>
    </div>
  `,
  styleUrl: './top-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmTopBar {
  readonly title = input<string | null>(null);
  readonly greeting = input<string | null>(null);
}
