// `/app` (auth-foundation §6.4): splash, then by session: signed in → the
// §6.2 destination (not fresh); signed out → `/auth`; failed → offline.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApi } from '../core/auth/auth-api';
import { restoredDestination } from '../core/auth/restored-destination';
import { SessionStore } from '../core/auth/session.store';
import { AppSplashComponent } from './splash.component';

@Component({
  selector: 'app-entry-page',
  imports: [AppSplashComponent],
  template: `<app-splash />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppEntryPage {
  private readonly session = inject(SessionStore);
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  constructor() {
    void this.route();
  }

  private async route(): Promise<void> {
    const restored = await this.session.ensureRestored();
    if (restored === 'signedOut') {
      await this.router.navigateByUrl('/auth', { replaceUrl: true });
      return;
    }
    if (restored === 'failed') {
      await this.router.navigate(['/app/offline'], { queryParams: { returnUrl: '/app' }, replaceUrl: true });
      return;
    }
    const url = await restoredDestination(this.session, this.api);
    if (url) await this.router.navigateByUrl(url, { replaceUrl: true });
  }
}
