// `nm-search-entry` (customer-v-home §Components; Flutter SearchEntryRow
// C-34). A LINK styled as a field (it opens the wizard; not a text input):
// white, slate-line, r-m, padding 13 16, min-height 48; a 15px slate-400
// `search` icon, gap 10, the placeholder text (body, slate-400), which is
// also the accessible name. Hover border blue; focus ring.
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { NmIcon } from '../icon/icon.component';
import { followInAppLink } from '../links';

@Component({
  selector: 'nm-search-entry',
  imports: [NmIcon],
  template: `
    <a class="nm-search-entry" [attr.href]="href()" (click)="follow($event)">
      <nm-icon name="search" [size]="15" />
      <span class="nm-search-entry__text">{{ placeholder() }}</span>
    </a>
  `,
  styleUrl: './search-entry.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmSearchEntry {
  readonly href = input.required<string>();
  readonly placeholder = input.required<string>();

  private readonly router = inject(Router);

  protected follow(event: MouseEvent): void {
    followInAppLink(event, this.href(), this.router);
  }
}
