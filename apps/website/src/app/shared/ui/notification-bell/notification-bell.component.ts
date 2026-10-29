// `nm-notification-bell` (customer-v-home §Components; Flutter
// NotificationBell C-11). Built once in #7; #11 and the runner top bars
// reuse it. A 48×48 link followed in-app; inside, a 36px white circle with
// a slate-line border and an 18px blue `notifications` icon. When unread > 0
// a 7px red dot with a 1.5px white ring (OA-13: red as a status accent, not
// a fill). Name `Notifications, N unread` or `Notifications`.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { NmIcon } from '../icon/icon.component';
import { followInAppLink } from '../links';

@Component({
  selector: 'nm-notification-bell',
  imports: [NmIcon],
  template: `
    <a class="nm-bell" [attr.href]="href()" [attr.aria-label]="name()" (click)="follow($event)">
      <span class="nm-bell__circle"><nm-icon name="notifications" [size]="18" /></span>
      @if (unread() > 0) {
        <span class="nm-bell__dot" aria-hidden="true"></span>
      }
    </a>
  `,
  styleUrl: './notification-bell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmNotificationBell {
  readonly href = input.required<string>();
  readonly unread = input(0);

  private readonly router = inject(Router);

  protected readonly name = computed(() =>
    this.unread() > 0 ? `Notifications, ${this.unread()} unread` : 'Notifications',
  );

  protected follow(event: MouseEvent): void {
    followInAppLink(event, this.href(), this.router);
  }
}
