// `nm-back-button` (auth-foundation §7.2; Flutter NitumeBackButton): 32px
// white circle, slate-line border, 16px blue arrow, 48×48 hit area, name
// `Back`. Emits `back`; unless a listener calls `preventDefault()`, goes
// back in history when the previous page is inside `/app`, else to
// `fallback`. `disabled` (#7, §W9a): the `disabled` attribute and
// `aria-disabled`, no emission, no navigation, slate-400 arrow.
import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { NmIcon } from '../icon/icon.component';

export class NmBackEvent {
  private prevented = false;
  preventDefault(): void {
    this.prevented = true;
  }
  get defaultPrevented(): boolean {
    return this.prevented;
  }
}

@Component({
  selector: 'nm-back-button',
  imports: [NmIcon],
  template: `
    <button
      type="button"
      class="nm-back"
      aria-label="Back"
      [disabled]="disabled()"
      [attr.aria-disabled]="disabled() ? 'true' : null"
      (click)="onClick()"
    >
      <span class="nm-back__circle"><nm-icon name="arrow-back" [size]="16" /></span>
    </button>
  `,
  styleUrl: './back-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmBackButton {
  /** Where Back goes when the previous page is not inside `/app`. */
  readonly fallback = input<string | null>(null);
  /** While true: no `back` emission and no navigation (NR submitting). */
  readonly disabled = input(false);

  readonly back = output<NmBackEvent>();

  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected onClick(): void {
    if (this.disabled()) return;
    const event = new NmBackEvent();
    this.back.emit(event);
    if (event.defaultPrevented) return;
    const previous = this.router.lastSuccessfulNavigation()?.previousNavigation?.finalUrl;
    const previousUrl = previous ? this.router.serializeUrl(previous) : null;
    if (previousUrl && (previousUrl === '/app' || previousUrl.startsWith('/app/'))) {
      this.location.back();
      return;
    }
    const fallback = this.fallback();
    if (fallback) void this.router.navigateByUrl(fallback);
  }
}
