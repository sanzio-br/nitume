// `nm-active-task-card` (customer-v-home §Components; Flutter ActiveTaskCard
// C-20, OA-14 replacements). Blue fill, r-m, padding 18, no shadow; the
// card itself is not clickable. A compact info chip with the category name
// and `#reference` (nmNum), the title in white, the meta line in num-meta-lg
// slate-400 (never an ETA, WQ-29: the view passes only the state
// text), and a primary small button rendered as a link, followed in-app.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { NmNum } from '../../format/num.directive';
import { NmButton } from '../button/button.component';
import { followInAppLink } from '../links';
import { NmStatusChip } from '../status-chip/status-chip.component';

@Component({
  selector: 'nm-active-task-card',
  imports: [NmStatusChip, NmNum, NmButton],
  template: `
    <div class="nm-active-task-card">
      <nm-status-chip class="nm-active-task-card__tag" size="compact" tone="info" [label]="category()" [numericSuffix]="suffix()" />
      <h3 class="nm-active-task-card__title">{{ title() }}</h3>
      <p class="nm-active-task-card__meta" nmNum>{{ meta() }}</p>
      <nm-button class="nm-active-task-card__action" size="small" [href]="actionHref()" (pressed)="follow($event)">{{
        actionLabel()
      }}</nm-button>
    </div>
  `,
  styleUrl: './active-task-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmActiveTaskCard {
  /** Category display name (never the wire value). */
  readonly category = input.required<string>();
  /** Reference without `#` (e.g. `NT-10482`); null hides the suffix. */
  readonly reference = input<string | null>(null);
  readonly title = input.required<string>();
  /** State text, e.g. `Brian K. is en route`. */
  readonly meta = input.required<string>();
  readonly actionLabel = input.required<string>();
  readonly actionHref = input.required<string>();

  private readonly router = inject(Router);

  protected readonly suffix = computed(() => {
    const reference = this.reference()?.trim();
    return reference ? `#${reference}` : null;
  });

  protected follow(event: MouseEvent): void {
    followInAppLink(event, this.actionHref(), this.router);
  }
}
