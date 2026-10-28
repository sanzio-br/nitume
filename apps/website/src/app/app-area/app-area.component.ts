// AppAreaComponent (auth-foundation §7.3): parent of every `/app` route.
// Slate canvas, the website's single `nm-toast-host`, and focus on the new
// page's h1 after each navigation (unless the page focused a control).
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NmToastHost } from '../shared/ui/overlay/toast-host.component';

export function focusPageHeading(host: HTMLElement): void {
  const active = host.ownerDocument.activeElement;
  if (active && active !== host.ownerDocument.body && host.contains(active)) return;
  const heading = host.querySelector('h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  // Programmatic focus: no focus ring.
  heading.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}

@Component({
  selector: 'app-area',
  imports: [RouterOutlet, NmToastHost],
  template: `<router-outlet /><nm-toast-host />`,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background-color: var(--nitume-slate);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppAreaComponent {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const injector = inject(Injector);
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => afterNextRender(() => focusPageHeading(host), { injector }));
  }
}
