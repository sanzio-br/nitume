// `nm-avatar` (customer-v-home §Components; Flutter InitialsAvatar C-12).
// Built once in #7; #10, #11 and #12 reuse it. A blue circle (36, 60 or
// 70px) with white 700 initials (13, 20 or 24px) from `initialsFor`; no
// initials → the white `person` icon. With `href`: a 48×48 link named by
// `label`, followed in-app. White on blue only.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { initialsFor } from '../../format/formatters';
import { NmIcon } from '../icon/icon.component';
import { followInAppLink } from '../links';
import { NmTemplateOutlet } from '../template-outlet.directive';

export type NmAvatarSize = 'small' | 'medium' | 'large';

const ICON_SIZE: Record<NmAvatarSize, number> = { small: 20, medium: 30, large: 34 };

@Component({
  selector: 'nm-avatar',
  imports: [NmIcon, NmTemplateOutlet],
  template: `
    <ng-template #circle>
      <span class="nm-avatar nm-avatar--{{ size() }}" aria-hidden="true">
        @if (initials(); as text) {
          <span class="nm-avatar__initials">{{ text }}</span>
        } @else {
          <nm-icon name="person" [size]="iconSize()" />
        }
      </span>
    </ng-template>
    @if (href(); as link) {
      <a class="nm-avatar-link" [attr.href]="link" [attr.aria-label]="label()" (click)="follow($event, link)"
        ><ng-container [nmTemplateOutlet]="circle"
      /></a>
    } @else {
      <span class="nm-avatar-static" role="img" [attr.aria-label]="label()"
        ><ng-container [nmTemplateOutlet]="circle"
      /></span>
    }
  `,
  styleUrl: './avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmAvatar {
  /** Display name; the initials come from its first two words. */
  readonly name = input<string | null>(null);
  readonly size = input<NmAvatarSize>('small');
  readonly href = input<string | null>(null);
  /** Accessible name (e.g. `Profile`). */
  readonly label = input<string | null>(null);

  private readonly router = inject(Router);

  protected readonly initials = computed(() => initialsFor(this.name()));
  protected readonly iconSize = computed(() => ICON_SIZE[this.size()]);

  protected follow(event: MouseEvent, link: string): void {
    followInAppLink(event, link, this.router);
  }
}
