import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { declared } from '../../../../testing/css';
import { NavItem, NmAppNav, NmAppNavLayout } from './app-nav.component';

const ITEMS: NavItem[] = [
  { key: 'jobs', label: 'Jobs', icon: 'work', activeIcon: 'work-filled', link: '/app/runner/jobs' },
  { key: 'profile', label: 'Profile', icon: 'person', activeIcon: 'person-filled', link: '/app/runner/profile' },
];

@Component({
  imports: [NmAppNav],
  template: `<nm-app-nav [items]="items" [activeKey]="active()" [layout]="layout()" wordmarkSuffix="Runner" homeLink="/app/runner/jobs" />`,
})
class Host {
  readonly items = ITEMS;
  readonly active = signal<string | null>('jobs');
  readonly layout = signal<NmAppNavLayout>('bar');
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    host: fixture.componentInstance,
    root,
    nav: () => root.querySelector('nav') as HTMLElement,
    links: () => Array.from(root.querySelectorAll('nav li a')) as HTMLAnchorElement[],
    update: () => fixture.detectChanges(),
  };
}

describe('nm-app-nav (#6)', () => {
  it('renders one <nav aria-label="Main"> with a list of page links (no tablist)', () => {
    const { nav, links } = setup();
    expect(nav().getAttribute('aria-label')).toBe('Main');
    expect(nav().querySelector('[role="tablist"]')).toBeNull();
    expect(nav().querySelectorAll('ul > li')).toHaveLength(2);
    expect(links().map((a) => a.textContent?.trim())).toEqual(['Jobs', 'Profile']);
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['/app/runner/jobs', '/app/runner/profile']);
  });

  it('active item: aria-current, green-700 class and the filled icon; others inactive', () => {
    const { links, host, update } = setup();
    const [jobs, profile] = links();
    expect(jobs.getAttribute('aria-current')).toBe('page');
    expect(jobs.classList.contains('nm-app-nav__item--active')).toBe(true);
    expect(jobs.querySelector('nm-icon')?.getAttribute('data-icon')).toBe('work-filled');
    expect(profile.hasAttribute('aria-current')).toBe(false);
    expect(profile.querySelector('nm-icon')?.getAttribute('data-icon')).toBe('person');
    expect(declared('.nm-app-nav__item--active', 'color')).toContain('var(--nitume-green-700)');
    host.active.set('profile');
    update();
    expect(links()[1].getAttribute('aria-current')).toBe('page');
  });

  it('bar layout: fixed white bar, slate-line top border, 52px items, tab-label, slate-400 inactive', () => {
    const { nav, links } = setup();
    expect(nav().classList.contains('nm-app-nav--bar')).toBe(true);
    expect(getComputedStyle(nav()).position).toBe('fixed');
    expect(getComputedStyle(nav()).backgroundColor).toBe('var(--nitume-white)');
    expect(declared('.nm-app-nav--bar', 'border-top')).toEqual(['1px solid var(--nitume-slate-line)']);
    const item = links()[1];
    expect(getComputedStyle(item).minHeight).toBe('52px');
    expect(getComputedStyle(item).color).toBe('var(--nitume-slate-400)');
    const label = item.querySelector('.nm-app-nav__label') as HTMLElement;
    expect(getComputedStyle(label).fontSize).toBe('10px');
    expect(getComputedStyle(label).fontWeight).toBe('700');
    expect(getComputedStyle(label).textOverflow).toBe('ellipsis');
  });

  it('side layout: 220px white side nav, wordmark link to home, 48px items in list-title, slate-600 inactive, focus ring', () => {
    const { nav, links, host, update, root } = setup();
    host.layout.set('side');
    update();
    expect(nav().classList.contains('nm-app-nav--side')).toBe(true);
    expect(getComputedStyle(nav()).width).toBe('220px');
    expect(getComputedStyle(nav()).backgroundColor).toBe('var(--nitume-white)');
    expect(declared('.nm-app-nav--side', 'border-right')).toEqual(['1px solid var(--nitume-slate-line)']);
    const wordmark = root.querySelector('nav nm-wordmark a') as HTMLAnchorElement;
    expect(wordmark.getAttribute('href')).toBe('/app/runner/jobs');
    expect(wordmark.getAttribute('aria-label')).toBe('Nitume Runner');
    const item = links()[1];
    expect(getComputedStyle(item).minHeight).toBe('var(--nitume-tap)');
    expect(getComputedStyle(item).color).toBe('var(--nitume-slate-600)');
    const label = item.querySelector('.nm-app-nav__label') as HTMLElement;
    expect(getComputedStyle(label).fontSize).toBe('14.5px');
    expect(getComputedStyle(label).fontWeight).toBe('600');
    expect(declared('.nm-app-nav__item:focus-visible', 'outline')).toEqual(['2px solid var(--nitume-green)']);
  });
});
