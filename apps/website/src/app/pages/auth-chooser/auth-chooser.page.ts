// `/auth` role chooser (auth-foundation §6.7; WQ-12, owner 2026-10-28;
// copy WQ-24, owner 2026-10-28). Replaces the old public sign-in page.
// Restores first: a signed-in visitor goes to their area; otherwise the
// two sign-in links. Outside the marketing layout (no header or footer).
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AppSplashComponent } from '../../app-area/splash.component';
import { focusPageHeading } from '../../app-area/focus-heading';
import { AuthApi } from '../../core/auth/auth-api';
import { restoredDestination } from '../../core/auth/restored-destination';
import { SessionStore } from '../../core/auth/session.store';
import { NmAuthFrame } from '../../shared/ui/auth-frame/auth-frame.component';
import { NmButton } from '../../shared/ui/button/button.component';
import { followInAppLink } from '../../shared/ui/links';
import { NmWordmark } from '../../shared/ui/wordmark/wordmark.component';

@Component({
  selector: 'app-auth-chooser-page',
  imports: [AppSplashComponent, NmAuthFrame, NmWordmark, NmButton],
  template: `
    @if (restoring()) {
      <app-splash />
    } @else {
      <nm-auth-frame heading="Sign in to Nitume">
        <nm-wordmark nmAuthLead class="wordmark" href="/" />
        <span nmAuthSub>Choose how you use Nitume.</span>
        <nm-button [expand]="true" [href]="customerLink" (pressed)="follow($event, customerLink)"
          >I need tasks done</nm-button
        >
        <nm-button
          class="runner"
          variant="outline"
          [expand]="true"
          [href]="runnerLink"
          (pressed)="follow($event, runnerLink)"
          >I'm a Runner or want to become one</nm-button
        >
      </nm-auth-frame>
    }
  `,
  styles: `
    .wordmark {
      display: block;
      margin-bottom: 30px;
    }

    .runner {
      margin-top: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthChooserPage {
  private readonly session = inject(SessionStore);
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly customerLink = '/app/customer/sign-in';
  protected readonly runnerLink = '/app/runner/sign-in';
  protected readonly restoring = signal(true);

  constructor() {
    void this.restore();
  }

  protected follow(event: MouseEvent, link: string): void {
    followInAppLink(event, link, this.router);
  }

  private async restore(): Promise<void> {
    if ((await this.session.ensureRestored()) === 'signedIn') {
      const url = await restoredDestination(this.session, this.api);
      if (url) await this.router.navigateByUrl(url, { replaceUrl: true });
      return;
    }
    // Signed out, or a failed restore (the sign-in route retries it).
    this.restoring.set(false);
    setTimeout(() => focusPageHeading(this.host));
  }
}
