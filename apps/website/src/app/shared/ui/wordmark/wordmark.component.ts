// `nm-wordmark` (auth-foundation §7.2; Flutter NitumeWordmark + R-17
// suffix): 9px green dot, 9px gap, `Nitume` in auth-heading, optional
// suffix in wordmark-suffix. Accessible name `Nitume` / `Nitume Runner`.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { followInAppLink } from '../links';
import { NmTemplateOutlet } from '../template-outlet.directive';

@Component({
  selector: 'nm-wordmark',
  template: `
    <ng-template #mark>
      <span class="nm-wordmark__dot" aria-hidden="true"></span>
      <span class="nm-wordmark__text" aria-hidden="true">Nitume</span>
      @if (suffix(); as s) {
        <span class="nm-wordmark__suffix" aria-hidden="true">{{ s }}</span>
      }
    </ng-template>
    @if (href(); as link) {
      <a class="nm-wordmark nm-wordmark--link" [attr.href]="link" [attr.aria-label]="name()" (click)="follow($event, link)">
        <ng-container [nmTemplateOutlet]="mark" />
      </a>
    } @else {
      <span class="nm-wordmark" role="img" [attr.aria-label]="name()">
        <ng-container [nmTemplateOutlet]="mark" />
      </span>
    }
  `,
  styleUrl: './wordmark.component.scss',
  imports: [NmTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmWordmark {
  /** `Runner` in the runner area. */
  readonly suffix = input<string | null>(null);
  /** Makes the wordmark a link (side nav → role home; chooser → `/`). */
  readonly href = input<string | null>(null);

  private readonly router = inject(Router);

  protected readonly name = computed(() => (this.suffix() ? `Nitume ${this.suffix()}` : 'Nitume'));

  protected follow(event: MouseEvent, link: string): void {
    followInAppLink(event, link, this.router);
  }
}
