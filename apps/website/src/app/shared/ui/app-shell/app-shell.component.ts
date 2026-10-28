// `nm-app-shell` (auth-foundation §7.3): skip link, `nm-app-nav` and
// `<main id="content">` around the routed view. The active item and the
// pushed state come from route data (`navKey`, `pushed`); the layout from
// the 768px breakpoint. Pushed routes hide the bottom bar below 768px and
// keep the side nav from 768px (WQ-15).
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { NM_BP_MD_QUERY, mediaQuery } from '../overlay/viewport';
import { NavItem, NmAppNav } from '../app-nav/app-nav.component';

interface ShellRouteData {
  readonly navKey: string | null;
  readonly pushed: boolean;
}

function readRouteData(root: ActivatedRouteSnapshot): ShellRouteData {
  let navKey: string | null = null;
  let pushed = false;
  for (let r: ActivatedRouteSnapshot | null = root; r; r = r.firstChild) {
    const data = r.data as { navKey?: unknown; pushed?: unknown };
    if (typeof data.navKey === 'string') navKey = data.navKey;
    if (data.pushed === true) pushed = true;
  }
  return { navKey, pushed };
}

@Component({
  selector: 'nm-app-shell',
  imports: [NmAppNav],
  template: `
    <div class="nm-app-shell" [class.nm-app-shell--wide]="wide()" [class.nm-app-shell--with-bar]="showNav() && !wide()">
      <a class="nm-app-shell__skip" href="#content" (click)="skipToContent($event)">Skip to content</a>
      @if (showNav()) {
        <nm-app-nav
          [items]="items()"
          [activeKey]="route().navKey"
          [layout]="wide() ? 'side' : 'bar'"
          [wordmarkSuffix]="wordmarkSuffix()"
          [homeLink]="homeLink()"
        />
      }
      <main #main id="content" class="nm-app-shell__main" tabindex="-1">
        <div class="nm-app-shell__content"><ng-content /></div>
      </main>
    </div>
  `,
  styleUrl: './app-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NmAppShell {
  readonly items = input.required<readonly NavItem[]>();
  readonly wordmarkSuffix = input<string | null>(null);
  readonly homeLink = input.required<string>();

  private readonly router = inject(Router);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  protected readonly wide = mediaQuery(NM_BP_MD_QUERY);
  protected readonly route = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => readRouteData(this.router.routerState.snapshot.root)),
    ),
    { initialValue: readRouteData(this.router.routerState.snapshot.root) },
  );
  /** Below 768px the bar is hidden on pushed routes; the side nav always shows. */
  protected readonly showNav = computed(() => this.wide() || !this.route().pushed);

  protected skipToContent(event: MouseEvent): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }
}
