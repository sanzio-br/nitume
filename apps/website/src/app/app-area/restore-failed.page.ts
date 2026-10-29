// `/app/offline?returnUrl=…` (auth-foundation §4.6): the apps'
// SplashScreen(onRetry:). `Try again` re-runs the restore, then opens the
// validated returnUrl or `/app`.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { roleFromPath, validReturnUrl } from '../core/auth/role-routing';
import { SessionStore } from '../core/auth/session.store';
import { NmAuthFrame } from '../shared/ui/auth-frame/auth-frame.component';
import { NmErrorState } from '../shared/ui/states/error-state.component';
import { NETWORK_ERROR_MESSAGE } from '../shared/ui/states/friendly-error';
import { NmWordmark } from '../shared/ui/wordmark/wordmark.component';

@Component({
  selector: 'app-restore-failed-page',
  imports: [NmAuthFrame, NmWordmark, NmErrorState],
  template: `
    <nm-auth-frame>
      <nm-wordmark nmAuthLead class="wordmark" [suffix]="suffix" />
      <nm-error-state [message]="message" (retry)="retry()" />
    </nm-auth-frame>
  `,
  styles: `
    .wordmark {
      display: block;
      margin-bottom: 24px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestoreFailedPage {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl');

  protected readonly message = NETWORK_ERROR_MESSAGE;
  protected readonly suffix = this.returnUrl?.startsWith('/app/runner') ? 'Runner' : null;

  protected async retry(): Promise<void> {
    await this.session.ensureRestored();
    const role = roleFromPath(this.returnUrl);
    const target = role ? validReturnUrl(this.returnUrl, role) : null;
    await this.router.navigateByUrl(target ?? '/app', { replaceUrl: true });
  }
}
