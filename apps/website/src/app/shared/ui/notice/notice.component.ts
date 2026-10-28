// `nm-notice` (ui-kit spec §4.11; Flutter NitumeNotice C-40). White card,
// muted text, optional info icon; `danger` swaps in a red error icon only.
// No coloured fill. Used for `Reconnecting…`, offline and hold notices.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'nm-notice',
  template: `
    <div class="nm-notice" [class.nm-notice--danger]="tone() === 'danger'">
      @if (iconShown()) {
        <svg class="nm-notice__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true" focusable="false">
          @if (tone() === 'danger') {
            <circle cx="12" cy="12" r="10" /><path d="M12 7v6" /><path d="M12 17h.01" />
          } @else {
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-5" /><path d="M12 8h.01" />
          }
        </svg>
      }
      <div class="nm-notice__text"><ng-content /></div>
      <div class="nm-notice__action"><ng-content select="[nmNoticeAction]" /></div>
    </div>
  `,
  styleUrl: './notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmNotice {
  readonly tone = input<'info' | 'danger'>('info');
  /** The info icon is optional; the danger icon is always shown. */
  readonly icon = input(true);

  protected readonly iconShown = computed(() => this.tone() === 'danger' || this.icon());
}
