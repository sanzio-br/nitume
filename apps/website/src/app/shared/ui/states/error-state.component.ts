// `nm-error-state` (ui-kit spec §4.7; Flutter NitumeErrorState C-33).
// Use `friendlyError(error)` for the message.
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NmButton } from '../button/button.component';

@Component({
  selector: 'nm-error-state',
  imports: [NmButton],
  template: `
    <div class="nm-state">
      <p class="nm-state__message" role="alert">{{ message() }}</p>
      <nm-button class="nm-state__action" variant="outline" (pressed)="retry.emit()">{{ retryLabel() }}</nm-button>
    </div>
  `,
  styleUrl: './states.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmErrorState {
  readonly message = input.required<string>();
  readonly retryLabel = input('Try again');

  readonly retry = output<void>();
}
