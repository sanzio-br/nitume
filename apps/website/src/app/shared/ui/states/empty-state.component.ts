// `nm-empty-state` (ui-kit spec §4.7; Flutter NitumeEmptyState C-33).
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NmButton } from '../button/button.component';

@Component({
  selector: 'nm-empty-state',
  imports: [NmButton],
  template: `
    <div class="nm-state">
      @if (title(); as t) {
        <div class="nm-state__title" role="heading" [attr.aria-level]="headingLevel()">{{ t }}</div>
      }
      <p class="nm-state__message">{{ message() }}</p>
      @if (actionLabel(); as label) {
        <nm-button class="nm-state__action" variant="primary" (pressed)="action.emit()">{{ label }}</nm-button>
      }
    </div>
  `,
  styleUrl: './states.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmEmptyState {
  readonly title = input<string | null>(null);
  readonly message = input.required<string>();
  readonly actionLabel = input<string | null>(null);
  readonly headingLevel = input(2);

  readonly action = output<void>();
}
