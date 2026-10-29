import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { accessibleText, declared } from '../../../../testing/css';
import { NmWordmark } from './wordmark.component';

@Component({
  imports: [NmWordmark],
  template: `<nm-wordmark [suffix]="suffix()" [href]="href()" />`,
})
class Host {
  readonly suffix = signal<string | null>(null);
  readonly href = signal<string | null>(null);
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, root, update: () => fixture.detectChanges() };
}

describe('nm-wordmark (#6)', () => {
  it('renders the dot and Nitume in auth-heading; named Nitume as one image', () => {
    const { root } = setup();
    const mark = root.querySelector('.nm-wordmark') as HTMLElement;
    expect(mark.getAttribute('role')).toBe('img');
    expect(mark.getAttribute('aria-label')).toBe('Nitume');
    expect(accessibleText(mark)).toBe('');
    const text = root.querySelector('.nm-wordmark__text') as HTMLElement;
    expect(text.textContent).toBe('Nitume');
    expect(getComputedStyle(text).fontSize).toBe('22px');
    expect(getComputedStyle(text).fontWeight).toBe('700');
    expect(getComputedStyle(text).color).toBe('var(--nitume-blue)');
    const dot = root.querySelector('.nm-wordmark__dot') as HTMLElement;
    expect(getComputedStyle(dot).width).toBe('9px');
    expect(getComputedStyle(dot).backgroundColor).toBe('var(--nitume-green)');
    expect(getComputedStyle(mark).gap).toBe('9px');
  });

  it('runner suffix: Runner in wordmark-suffix, accessible name Nitume Runner', () => {
    const { host, root, update } = setup();
    host.suffix.set('Runner');
    update();
    const suffix = root.querySelector('.nm-wordmark__suffix') as HTMLElement;
    expect(suffix.textContent).toBe('Runner');
    expect(getComputedStyle(suffix).fontSize).toBe('12px');
    expect(getComputedStyle(suffix).fontWeight).toBe('600');
    expect(getComputedStyle(suffix).color).toBe('var(--nitume-slate-600)');
    expect(root.querySelector('.nm-wordmark')?.getAttribute('aria-label')).toBe('Nitume Runner');
  });

  it('href renders a link with the same name, a focus ring, and follows in-app paths through the router', async () => {
    const { host, root, update } = setup();
    host.href.set('/app/runner/jobs');
    host.suffix.set('Runner');
    update();
    const a = root.querySelector('a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/app/runner/jobs');
    expect(a.getAttribute('aria-label')).toBe('Nitume Runner');
    expect(a.classList.contains('nm-wordmark--link')).toBe(true);
    expect(declared('.nm-wordmark--link:focus-visible', 'outline')).toEqual([
      '2px solid var(--nitume-green)',
    ]);
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(spy).toHaveBeenCalledWith('/app/runner/jobs');
  });
});
