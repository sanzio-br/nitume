// customer / runner `x-name-capture` (customer-x-name-capture.md,
// runner-x-name-capture.md): one component configured by route `data.role`.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApi } from '../../core/auth/auth-api';
import { routeRole } from '../../core/auth/guards';
import { ROLE_HOME, destinationUrl, resolveDestination } from '../../core/auth/role-routing';
import { SessionStore, SessionUser } from '../../core/auth/session.store';
import { NmAuthFrame } from '../../shared/ui/auth-frame/auth-frame.component';
import { NmButton } from '../../shared/ui/button/button.component';
import { NmField } from '../../shared/ui/field/field.component';
import { NmWordmark } from '../../shared/ui/wordmark/wordmark.component';
import {
  NAME_COPY,
  NAME_REQUIRED_COPY,
  NAME_SAVE_FAILED_COPY,
  NAME_TOO_LONG_COPY,
  wordmarkSuffix,
} from './sign-in-copy';

@Component({
  selector: 'app-name-capture-page',
  imports: [NmAuthFrame, NmWordmark, NmField, NmButton, ReactiveFormsModule],
  template: `
    <nm-auth-frame [heading]="copy.heading">
      <nm-wordmark nmAuthLead class="wordmark" [suffix]="suffix" />
      <span nmAuthSub>{{ copy.sub }}</span>
      <form class="form" novalidate (submit)="submit($event)">
        <nm-field
          [label]="copy.label"
          [placeholder]="copy.placeholder"
          autocomplete="name"
          autocapitalize="words"
          [spellcheck]="false"
          [formControl]="name"
          [error]="fieldError()"
          [readonly]="saving()"
        />
        <nm-button class="submit" type="submit" [expand]="true" [loading]="saving()">Continue</nm-button>
      </form>
    </nm-auth-frame>
  `,
  styles: `
    .wordmark {
      display: block;
      margin-bottom: 30px;
    }

    .form {
      margin: 0;
    }

    .submit {
      display: block;
      margin-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NameCapturePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionStore);

  protected readonly role = routeRole(this.route.snapshot);
  protected readonly copy = NAME_COPY[this.role];
  protected readonly suffix = wordmarkSuffix(this.role);
  /** Fresh OTP sign-in in this tab: the runner onboarding step follows. */
  private readonly fresh = this.session.takeFreshSignIn();

  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly fieldError = signal<string | null>(null);
  protected readonly saving = signal(false);

  constructor() {
    this.name.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.fieldError.set(null));
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    const value = this.name.value.trim();
    if (value.length < 2) {
      this.fieldError.set(NAME_REQUIRED_COPY);
      return;
    }
    if (value.length > 60) {
      this.fieldError.set(NAME_TOO_LONG_COPY);
      return;
    }
    this.saving.set(true);
    let user: SessionUser;
    try {
      user = await this.session.saveDisplayName(value);
    } catch {
      this.saving.set(false);
      this.fieldError.set(NAME_SAVE_FAILED_COPY);
      return;
    }
    const destination = resolveDestination({
      user,
      flowRole: this.role,
      fresh: this.fresh,
      returnUrl: this.route.snapshot.queryParamMap.get('returnUrl'),
    });
    const url = destination.kind === 'refuse' ? ROLE_HOME[this.role] : await destinationUrl(destination, this.api);
    await this.router.navigateByUrl(url, { replaceUrl: true });
  }
}
