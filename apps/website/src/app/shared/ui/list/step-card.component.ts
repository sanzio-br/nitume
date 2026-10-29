// `nm-step-card` (ui-kit spec §4.3.3; Flutter ChecklistStepCard R-07).
// Runner checklist step: display-only check, title, Fira Code subtitle and
// an optional small secondary action that the whole card also runs.
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NmNum } from '../../format/num.directive';
import { NmButton } from '../button/button.component';
import { NmCheckbox } from './checkbox.component';

@Component({
  selector: 'nm-step-card',
  imports: [NmButton, NmCheckbox, NmNum],
  template: `
    <div
      class="nm-step"
      role="group"
      [class.nm-step--actionable]="!!actionLabel()"
      [attr.aria-label]="accessibleName()"
      (click)="runAction()"
    >
      <nm-checkbox [checked]="done()" [displayOnly]="true" />
      <div class="nm-step__body" aria-hidden="true">
        <span class="nm-step__title">{{ title() }}</span>
        @if (subtitle(); as s) {
          <span class="nm-step__subtitle" nmNum="meta">{{ s }}</span>
        }
      </div>
      @if (actionLabel(); as label) {
        <nm-button variant="secondary" size="small" (pressed)="onButton($event)">{{ label }}</nm-button>
      }
    </div>
  `,
  styleUrl: './step-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmStepCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly done = input(false);
  /** `Upload`, `Add`, `Edit`; when set the whole card runs `action`. */
  readonly actionLabel = input<string | null>(null);

  readonly action = output<void>();

  /** `Photos, Required, button Upload` or `…, completed`. */
  protected readonly accessibleName = computed(() => {
    const action = this.actionLabel();
    return [
      this.title(),
      this.subtitle(),
      action ? `button ${action}` : null,
      this.done() ? 'completed' : null,
    ]
      .filter((p): p is string => !!p)
      .join(', ');
  });

  protected runAction(): void {
    if (this.actionLabel()) this.action.emit();
  }

  protected onButton(event: MouseEvent): void {
    // The card handles the bubbling click; emit once.
    event.stopPropagation();
    this.action.emit();
  }
}
