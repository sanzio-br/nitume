// The apps' SplashScreen (auth-foundation §4.6): slate frame, wordmark and a
// visually hidden `Loading` status. Used while a session is restored.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NmAuthFrame } from '../shared/ui/auth-frame/auth-frame.component';
import { NmWordmark } from '../shared/ui/wordmark/wordmark.component';

@Component({
  selector: 'app-splash',
  imports: [NmAuthFrame, NmWordmark],
  template: `
    <nm-auth-frame>
      <nm-wordmark nmAuthLead [suffix]="suffix()" />
      <span class="status" role="status">Loading</span>
    </nm-auth-frame>
  `,
  styles: `
    @use '../../styles/tokens' as * with ($nm-emit-root: false);

    .status {
      @include nm-visually-hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppSplashComponent {
  readonly suffix = input<string | null>(null);
}
