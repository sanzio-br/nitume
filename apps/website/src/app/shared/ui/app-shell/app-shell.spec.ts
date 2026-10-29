import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RouterOutlet } from '@angular/router';
import { declared } from '../../../../testing/css';
import { stubViewport } from '../../../../testing/media';
import { NavItem } from '../app-nav/app-nav.component';
import { NmAppShell } from './app-shell.component';

const ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home', activeIcon: 'home-filled', link: '/s/home' },
  { key: 'track', label: 'Track', icon: 'location', activeIcon: 'location-filled', link: '/s/track' },
];

@Component({ template: '<h1>Page</h1>' })
class Page {}

@Component({
  imports: [NmAppShell, RouterOutlet],
  template: `<nm-app-shell [items]="items" homeLink="/s/home"><router-outlet /></nm-app-shell>`,
})
class Shell {
  readonly items = ITEMS;
}

async function render(url: string, width: number) {
  const restore = stubViewport(width);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: 's',
          component: Shell,
          children: [
            { path: 'home', component: Page, data: { navKey: 'home' } },
            { path: 'track', component: Page, data: { navKey: 'track' } },
            { path: 'track/detail', component: Page, data: { navKey: 'track', pushed: true } },
          ],
        },
      ]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  restore();
  const root = harness.routeNativeElement as HTMLElement;
  return { harness, root, nav: () => root.querySelector('nav') };
}

describe('nm-app-shell (#6)', () => {
  it('renders the skip link first, the nav and <main id="content"> around the routed view', async () => {
    const { root } = await render('/s/home', 360);
    const focusable = root.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
    expect(focusable[0].textContent).toBe('Skip to content');
    expect(focusable[0].getAttribute('href')).toBe('#content');
    const main = root.querySelector('main') as HTMLElement;
    expect(main.id).toBe('content');
    expect(main.querySelector('h1')?.textContent).toBe('Page');
    expect(declared('.nm-app-shell__skip:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
  });

  it('skip link moves focus to main (accessible name Skip to content)', async () => {
    const { root } = await render('/s/home', 360);
    document.body.appendChild(root);
    (root.querySelector('.nm-app-shell__skip') as HTMLAnchorElement).click();
    expect(document.activeElement).toBe(root.querySelector('main'));
    root.remove();
  });

  it('active item from route data navKey; bottom bar below 768px, side nav from 768px', async () => {
    const narrow = await render('/s/track', 360);
    expect(narrow.nav()?.classList.contains('nm-app-nav--bar')).toBe(true);
    expect(narrow.nav()?.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Track');
    TestBed.resetTestingModule();
    const wide = await render('/s/home', 1024);
    expect(wide.nav()?.classList.contains('nm-app-nav--side')).toBe(true);
    expect(wide.nav()?.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Home');
  });

  it('pushed route: no bar below 768px; side nav kept with the parent active from 768px; content max 1180px', async () => {
    const narrow = await render('/s/track/detail', 360);
    expect(narrow.nav()).toBeNull();
    TestBed.resetTestingModule();
    const wide = await render('/s/track/detail', 1024);
    expect(wide.nav()?.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Track');
    const content = wide.root.querySelector('.nm-app-shell__content') as HTMLElement;
    expect(getComputedStyle(content).maxWidth).toBe('var(--nitume-content-max)');
    expect(getComputedStyle(content).padding).toBe('0 var(--nitume-space-lg)');
  });
});
